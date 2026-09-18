"""走真实 HTTP 请求核验本机打开协议，不在单元测试中启动用户 IDE。"""
import importlib.util
import json
from pathlib import Path
import threading
import time
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

spec = importlib.util.spec_from_file_location('teaching_server', Path(__file__).resolve().parents[1] / 'serve.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.fixture
def server(tmp_path):
    opened = []
    instance = module.TeachingServer(('127.0.0.1', 0), opener=opened.append,learning_directory=tmp_path/'learning')
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    yield instance, opened
    instance.shutdown()
    instance.server_close()
    thread.join(timeout=2)


def request(server, path, payload=None, *, token=None, origin=None, host=None):
    instance, _ = server
    headers = {}
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode()
    if token is not None:
        headers['X-Local-Token'] = token
    if origin is not None:
        headers['Origin'] = origin
    if host is not None:
        headers['Host'] = host
    req = Request(f'http://127.0.0.1:{instance.server_port}{path}', data=data, headers=headers)
    try:
        response = urlopen(req, timeout=3)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def test_all_delivered_buttons_target_existing_local_notebooks(server):
    code, headers, body = request(server, '/api/session')
    assert code == 200 and headers['Cache-Control'] == 'no-store'
    session = json.loads(body)
    assert len(session['notebooks']) == 15
    assert sum('chapter_id' in l for l in session['notebooks']) == 9
    for lesson in session['notebooks']:
        code, _, body = request(server, '/api/notebooks/open', {'id': lesson['id']}, token=session['token'])
        assert code == 202 and json.loads(body)['status'] == 'requested'
        assert server[1][-1] == (module.ROOT / lesson['path']).resolve()
        assert server[1][-1].is_file()


def test_teaching_pages_render_as_html_and_records_are_not_served(server):
    for route in ['/','/samples/accumulation-clearance/','/samples/accumulation-clearance/explore/',
                  '/samples/accumulation-clearance/practice/?question=stock-flow-units',
                  '/web/single-compartment/','/practice/m1/?exercise=S01-E1','/practice/m1?exercise=S01-E2']:
        code,headers,body=request(server,route)
        assert code==200 and headers.get_content_type()=='text/html'
        assert b'<!doctype html>' in body and b'<script' in body
    for route in ['/.local/learning/attempts/','/exercises/samples/accumulation-clearance/verification.json']:
        assert request(server,route)[0]==404


def test_all_planned_overview_routes_and_sample_counts(server):
    from urllib.parse import quote
    course=server[0].course
    assert len(course['parts'])==12 and sum(len(p['chapters']) for p in course['parts'])==55
    for part in course['parts']:
        for item in [part,*part['chapters']]:
            code,headers,_=request(server,quote(item['url']))
            assert code==200 and headers.get_content_type()=='text/html'
        assert all(c['available']==(part['id']=='1') for c in part['chapters'])
        if part['id']=='1':
            for chapter in [*part['chapters'],part['assessment']]:
                assert request(server,quote(chapter['url']+'practice/'))[0]==200
                if chapter.get('visualization'):assert request(server,quote(chapter['url']+'explore/'))[0]==200
        else:assert all(not c['lessons'] for c in part['chapters'])
    assert [len(l['questions']) for l in course['sample']['lessons']]==[3,3,3,4,5,4]
    assert request(server,'/chapters/missing/')[0]==404


def test_http_practice_choice_code_and_progress(server):
    code,_,body=request(server,'/api/v1/catalog');catalog=json.loads(body)
    assert code==200 and len(catalog['exercises'])==60
    assert sum(q['id'].startswith('p01-') for q in catalog['exercises'])==38
    code,_,body=request(server,'/api/v1/exercises/S01-E1')
    assert code==200 and 'correct' not in json.loads(body)
    choice={'exercise_id':'S01-E1','exercise_version':'1','request_id':str(uuid.uuid4()),'selected':['A']}
    assert request(server,'/api/v1/choice-attempts',choice)[0]==403
    code,_,body=request(server,'/api/v1/choice-attempts',choice,token=server[0].token)
    assert code==200 and json.loads(body)['verdict']=='AC'
    source=json.loads((module.ROOT/'exercises/samples/accumulation-clearance/solutions.json').read_text(encoding='utf-8'))['S01-E2']
    payload={'exercise_id':'S01-E2','exercise_version':'2','request_id':str(uuid.uuid4()),'source':source,'mode':'full'}
    code,_,body=request(server,'/api/v1/submissions',payload,token=server[0].token)
    assert code==202
    id=json.loads(body)['id'];deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        code,_,body=request(server,f'/api/v1/submissions/{id}');record=json.loads(body)
        if record['state']=='FINISHED':break
        time.sleep(.03)
    assert code==200 and record['verdict']=='AC' and record['saved']
    assert json.loads(request(server,'/api/v1/progress')[2])['passed']==['S01-E1','S01-E2']


@pytest.mark.parametrize('payload,code', [({'id': '../../README.md'}, 404), ({'path': 'README.md'}, 400),
                                       ({'id': ['S01']}, 400), ({'id': 'S01', 'command': 'extra'}, 400), ([], 400)])
def test_only_catalog_ids_can_be_opened(server, payload, code):
    assert request(server, '/api/notebooks/open', payload, token=server[0].token)[0] == code
    assert server[1] == []


@pytest.mark.parametrize('headers', [{}, {'token': 'wrong'}, {'origin': 'https://example.com'}, {'host': 'unexpected.example:8000'}])
def test_cross_site_or_unconfirmed_requests_cannot_launch_apps(server, headers):
    if 'origin' in headers or 'host' in headers:
        headers['token'] = server[0].token
    assert request(server, '/api/notebooks/open', {'id': 'S01'}, **headers)[0] == 403
    assert server[1] == []


def test_no_default_app_reports_failure_without_a_web_fallback(server):
    def fail(path):
        raise OSError('No file association')
    server[0].opener = fail
    code, _, body = request(server, '/api/notebooks/open', {'id': 'S01'}, token=server[0].token)
    assert code == 503 and '默认应用' in json.loads(body)['error']


def test_mjs_mime_and_no_stale_cache(server):
    code, headers, _ = request(server, '/web/single-compartment/app.mjs')
    assert code == 200
    assert headers.get_content_type() == 'text/javascript'
    assert headers['Cache-Control'] == 'no-store'
    assert request(server, '/.git/config')[0] == 404
    assert request(server, '/%E6%A8%A1%E6%8B%9F%E6%95%B0%E6%8D%AE/')[0] == 404
