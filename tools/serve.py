"""本机教材网页与默认 IDE 打开接口。"""
import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from practice import PracticeEngine, RequestError
from course_content import notebooks


def open_in_default_app(path):
    """交给操作系统文件关联；不启动网页 Notebook，不执行文件内容。"""
    if sys.platform == 'win32':
        os.startfile(str(path), 'open')
    else:
        command = 'open' if sys.platform == 'darwin' else 'xdg-open'
        subprocess.run([command, str(path)], check=True, timeout=10,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class TeachingServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, *, previews=False, opener=open_in_default_app, learning_directory=None):
        super().__init__(address, TeachingHandler)
        self.previews = previews
        self.opener = opener
        self.token = secrets.token_urlsafe(32)
        self.catalog = notebooks()
        self.course = json.loads((ROOT / 'web/course/catalog.json').read_text(encoding='utf-8'))
        try:
            self.practice = PracticeEngine(learning_directory or ROOT / '.local/learning')
        except Exception:
            super().server_close()
            raise

    def server_close(self):
        if hasattr(self,'practice'): self.practice.close()
        super().server_close()


class TeachingHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.html': 'text/html; charset=utf-8',
                      '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                      '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def valid_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

    def respond_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.valid_host():
            self.send_error(403)
            return
        if urlsplit(self.path).path == '/api/session':
            self.respond_json(200, {'version': 'course-local-ide-1', 'token': self.server.token,
                                    'notebooks': self.server.catalog,'practice_version':'named-parameters-2','assessment_version':'1'})
            return
        path=urlsplit(self.path).path
        try:
            if path=='/api/v1/catalog':
                self.respond_json(200,{'exercises':self.server.practice.catalog(),'notebooks':self.server.catalog}); return
            if path.startswith('/api/v1/exercises/'):
                self.respond_json(200,self.server.practice.question(path.rsplit('/',1)[-1])); return
            if path.startswith('/api/v1/submissions/'):
                self.respond_json(200,self.server.practice.get(path.rsplit('/',1)[-1])); return
            if path=='/api/v1/progress':
                self.respond_json(200,self.server.practice.progress()); return
        except RequestError as error:
            self.respond_json(error.status,error.payload); return
        super().do_GET()

    def do_POST(self):
        origin = self.headers.get('Origin')
        valid_origin = origin is None or origin == f'http://{self.headers.get("Host")}'
        token=self.headers.get('X-Local-Token','')
        if not self.valid_host() or not valid_origin or not token.isascii() or not secrets.compare_digest(token, self.server.token):
            self.respond_json(403, {'error': '连接已失效，请重新连接本地程序。'})
            return
        endpoint=urlsplit(self.path).path
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 262144 or self.headers.get_content_type() != 'application/json':
                raise ValueError()
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            self.respond_json(400, {'error': '请求格式不正确。'})
            return
        try:
            if endpoint in ('/api/v1/choice-attempts','/api/v1/submissions'):
                kind='choice' if endpoint.endswith('choice-attempts') else 'python'
                self.respond_json(200 if kind=='choice' else 202,self.server.practice.submit(payload,kind)); return
            if endpoint.startswith('/api/v1/submissions/') and endpoint.endswith('/cancel'):
                self.respond_json(200,self.server.practice.cancel(endpoint.split('/')[-2])); return
        except RequestError as error:
            self.respond_json(error.status,error.payload); return
        if endpoint != '/api/notebooks/open':
            self.respond_json(404, {'error': '没有这个操作。'}); return
        if not isinstance(payload, dict) or set(payload) != {'id'} or not isinstance(payload['id'], str):
            self.respond_json(400, {'error': 'Notebook 请求格式不正确。'}); return
        entry = next((item for item in self.server.catalog if item['id'] == payload['id']), None)
        if entry is None:
            self.respond_json(404, {'error': '该 Notebook 尚未提供。'})
            return
        path = (ROOT / entry['path']).resolve()
        if not path.is_relative_to(ROOT / 'notebooks') or path.suffix != '.ipynb' or not path.is_file():
            self.respond_json(404, {'error': 'Notebook 文件不可用，请核对教材目录。'})
            return
        try:
            self.server.opener(path)
        except (OSError, subprocess.SubprocessError):
            self.respond_json(503, {'error': '系统未能打开 Notebook。请将 .ipynb 的默认应用设为支持 Notebook 的 IDE，然后重试。'})
            return
        self.respond_json(202, {'status': 'requested', 'id': entry['id'],
                                'message': '已请求系统默认 IDE 打开，请切换到 IDE 继续学习。'})

    def send_head(self):
        if not self.valid_host():
            self.send_error(403)
            return None
        requested = unquote(urlsplit(self.path).path).lstrip('/')
        routes={'':'web/course/index.html'}
        for part in self.server.course['parts']:
            routes[part['url'].lstrip('/')]='web/course/index.html'
            for chapter in [*part['chapters'], *([part['assessment']] if part.get('assessment') else [])]:
                base=chapter['url'].lstrip('/')
                routes[base]='web/course/index.html'
                if chapter['available']:
                    routes[base+'practice/']='web/practice/index.html'
                    if chapter.get('visualization'):
                        routes[base+'explore/']=chapter['visualization']
        if requested in routes:
            requested=routes[requested];self.path='/'+requested
        resolved = (ROOT / requested).resolve()
        if not resolved.is_relative_to(ROOT):
            self.send_error(404)
            return None
        parts = resolved.relative_to(ROOT).parts
        allowed = parts and (parts[0] in {'web', 'notebooks', 'docs'} or requested in {'README.md', 'LICENSE'})
        if self.server.previews and len(parts)>=3 and parts[0]=='.work' and parts[1] in {'m1','m2','m3','m3-part01','m4','m5','m6'} and parts[2]=='previews':
            allowed = True
        if not allowed:
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, 'Open a named teaching file')
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--previews', action='store_true', help='同时提供本地 Notebook 检查预览')
    args = parser.parse_args()
    server = TeachingServer(('127.0.0.1', args.port), previews=args.previews)
    print(f'http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
