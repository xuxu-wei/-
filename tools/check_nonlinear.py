"""Part 4 browser/Notebook agreement; independent mathematics is in test_part04."""
import argparse,ast,json,math,shutil,subprocess
from pathlib import Path
import numpy as np
import nbformat
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--node',default=shutil.which('node'));args=parser.parse_args()
    if not args.node:parser.error('Provide --node')
    functions={'np':np,'math':math};catalog=json.loads((ROOT/'notebooks/04-非线性动态行为/catalog.json').read_text(encoding='utf-8'))
    for lesson in catalog:
        for cell in nbformat.read(ROOT/lesson['path'],4).cells:
            if cell.cell_type=='code' and 'model' in cell.metadata.get('tags',[]):
                tree=ast.parse(cell.source);assert all(isinstance(n,ast.FunctionDef) for n in tree.body);exec(compile(tree,lesson['path'],'exec'),functions)
    cases=[]
    for x in [-1.5,-.2,0,.2,1.5]:
        for bias in [-.6,0,.6]:cases.append(dict(kind='switchPath',args=[x,bias,.01,2000]))
    for mu in [-.5,-.05,0,.05,.5,1]:
        for omega in [0,1,2]:
            for x in [[0,0],[.2,0],[.3,.4],[1.5,0]]:cases.append(dict(kind='radial',args=[mu,omega,x],times=[0,.01,1,7,20]))
    for force in [0,.35]:
        for x in [[0,0],[.2,0],[1.5,0]]:cases.append(dict(kind='driven',args=[.3,1,force,1.3,x],times=[0,.01,1,7,20]))
    for r in [0,1,3.2,3.9,4]:
        for x in [0,.2,.5,1]:cases.append(dict(kind='logistic',args=[r,x,80]))
    for carry in [False,True]:
        for bs in [np.linspace(-.6,.6,61).tolist(),np.linspace(.6,-.6,61).tolist()]:cases.append(dict(kind='scanBias',args=[bs,-1.5,.02,2000,carry]))
    script="""import {readFileSync} from 'node:fs';const m=await import(process.argv[1]);console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(c=>c.times?c.times.map(t=>m[c.kind](...c.args,t)):m[c.kind](...c.args))));"""
    result=subprocess.run([args.node,'--input-type=module','-e',script,(ROOT/'web/nonlinear/model.mjs').as_uri()],input=json.dumps(cases),text=True,capture_output=True,check=True,timeout=30)
    count=0;maximum=0
    for case,value in zip(cases,json.loads(result.stdout)):
        name={'switchPath':'switch_path','scanBias':'scan_bias','radial':'radial_exact','driven':'driven_exact','logistic':'logistic_path'}[case['kind']]
        expected=functions[name](*case['args'],*([case['times']] if 'times' in case else []))
        actual=np.array(value);expect=np.array(expected);assert actual.shape==expect.shape
        # Chaotic mapping uses the same explicit binary64 operation order; a long
        # higher-precision path is a different arithmetic experiment.
        delta=np.abs(actual-expect);np.testing.assert_allclose(actual,expect,atol=1e-10,rtol=1e-10)
        maximum=max(maximum,float(np.max(delta)));count+=actual.size
    report=dict(cases=len(cases),compared_values=count,maximum_absolute_difference=maximum,tolerance='atol=rtol=1e-10',scope='same-model cross-implementation, not independent mathematical proof',notebooks=[l['path'] for l in catalog],web='web/nonlinear/model.mjs')
    target=ROOT/'.work/m5/web-model-comparison.json';target.parent.mkdir(exist_ok=True,parents=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='notebooks'},ensure_ascii=False))
if __name__=='__main__':main()
