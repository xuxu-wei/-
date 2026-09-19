"""按课节目录逐本启动新内核；保存实际输出和供人工点击的 HTML 检查预览。"""
import argparse
import base64
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys
import time

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--part',required=True,help='notebooks 下的篇目录名')
    parser.add_argument('--work',required=True,help='.work 下的验收目录名')
    parser.add_argument('--write',action='store_true')
    parser.add_argument('--lesson',action='append',help='只执行指定课节 ID；可重复，用于已发布课节的定向复验')
    args=parser.parse_args()
    part=(ROOT/'notebooks'/args.part).resolve();work=(ROOT/'.work'/args.work).resolve()
    if not part.is_relative_to(ROOT/'notebooks') or not work.is_relative_to(ROOT/'.work'):raise ValueError('路径必须位于项目目录中。')
    work.mkdir(parents=True,exist_ok=True)
    for key,name in [('MPLCONFIGDIR','matplotlib'),('JUPYTER_RUNTIME_DIR','runtime'),('IPYTHONDIR','ipython')]:
        folder=work/name;folder.mkdir(exist_ok=True);os.environ[key]=str(folder)
    import nbformat
    from nbclient import NotebookClient
    from nbconvert import HTMLExporter
    from jupyter_client import KernelManager
    from jupyter_client.kernelspec import KernelSpecManager
    kernel=work/'kernels'/'course-validation';kernel.mkdir(parents=True,exist_ok=True)
    (kernel/'kernel.json').write_text(json.dumps({'argv':[sys.executable,'-m','ipykernel_launcher','-f','{connection_file}'],'display_name':'Course validation','language':'python'}),encoding='utf-8')
    preview=work/'previews';preview.mkdir(exist_ok=True)
    figures=work/'figures';figures.mkdir(exist_ok=True)
    report={'python':platform.python_version(),'platform':platform.system(),'packages':{p:importlib.metadata.version(p) for p in ['numpy','matplotlib','nbclient','nbformat','nbconvert','ipykernel']},'notebooks':[]}
    lessons=json.loads((part/'catalog.json').read_text(encoding='utf-8'))
    if args.lesson:
        unknown=set(args.lesson)-{lesson['id'] for lesson in lessons}
        if unknown:raise ValueError(f'未知课节 ID：{sorted(unknown)}')
        lessons=[lesson for lesson in lessons if lesson['id'] in args.lesson]
    for lesson in lessons:
        path=ROOT/lesson['path'];nb=nbformat.read(path,as_version=4);nbformat.validate(nb)
        manager=KernelManager(kernel_name='course-validation',kernel_spec_manager=KernelSpecManager(kernel_dirs=[str(kernel.parent)]))
        start=time.perf_counter()
        NotebookClient(nb,km=manager,timeout=120,resources={'metadata':{'path':str(path.parent)}}).execute(cleanup_kc=True)
        count=0
        for cell in nb.cells:
            for output in cell.get('outputs',[]):
                assert output.output_type!='error'
                if 'image/png' in output.get('data',{}):
                    count+=1;(figures/f'{lesson["id"]}-{count}.png').write_bytes(base64.b64decode(output.data['image/png']))
        assert count>0
        if args.write:nbformat.write(nb,path)
        html,_=HTMLExporter(template_name='lab').from_notebook_node(nb)
        (preview/f'{lesson["id"]}.html').write_text(html,encoding='utf-8')
        report['notebooks'].append({'id':lesson['id'],'path':lesson['path'],'seconds':round(time.perf_counter()-start,2),'code_cells':sum(c.cell_type=='code' for c in nb.cells),'figures':count,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'passed':True})
        print(f'PASS {lesson["number"]} {lesson["title"]}: {count} figure(s)',flush=True)
    (work/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
