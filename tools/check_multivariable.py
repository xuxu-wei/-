"""Compare the actual Part 3 notebook functions with browser models; independent math lives in test_part03."""
import argparse
import ast
import json
import math
from pathlib import Path
import shutil
import subprocess
import numpy as np
import nbformat

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--node',default=shutil.which('node'));args=parser.parse_args()
    if not args.node:parser.error('Provide Node.js with --node.')
    catalog=json.loads((ROOT/'notebooks/03-多变量相互作用/catalog.json').read_text(encoding='utf-8'))
    functions={};paths=[]
    for lesson in catalog:
        scope={'np':np,'math':math}
        for cell in nbformat.read(ROOT/lesson['path'],as_version=4).cells:
            if cell.cell_type=='code' and 'model' in cell.metadata.get('tags',[]):
                tree=ast.parse(cell.source);assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
                exec(compile(tree,lesson['path'],'exec'),scope)
        functions.update({k:v for k,v in scope.items() if callable(v) and k not in {'np','math'}})
        paths.append(lesson['path'])
    times=[0,1e-12,.1,1,5,12]
    cases=[]
    for initial in [[0,0],[6,0],[2,4]]:
        for a,b in [(0,0),(.2,.1),(0,.3),(.3,0),(1e-12,.2)]:
            for s in [.5,1,3]:cases.append(dict(kind='closed',args=[a,b,initial,s],times=times))
        for a,c in [(0,0),(.2,.1),(.6,.5)]:cases.append(dict(kind='symmetric',args=[a,c,initial],times=times))
    for initial in [[0,0],[2,0],[-1,3]]:
        for alpha,omega in [(0,0),(0,1),(.2,1),(.8,2)]:cases.append(dict(kind='rotation',args=[alpha,omega,initial],times=times))
    for delta in [.1,.2,1,3,3.5]:cases.append(dict(kind='local',args=[[2+delta,4],.005,2400]))
    js="""import {readFileSync} from 'node:fs';
const m=await import(process.argv[1]);const cases=JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify(cases.map(p=>{if(p.kind==='local'){const r=m.local(...p.args);return [r.original,r.linear,r.error];}
if(p.kind==='closed'){const [a,b,x,s]=p.args;return p.times.map(t=>m.closed(a,b,x,t,s));}
return p.times.map(t=>m[p.kind](...p.args,t));})));"""
    run=subprocess.run([args.node,'--input-type=module','-e',js,(ROOT/'web/multivariable/model.mjs').as_uri()],input=json.dumps(cases),text=True,capture_output=True,check=True,timeout=30)
    results=json.loads(run.stdout);count=0;maximum=0
    def compare(a,b):
        nonlocal count,maximum
        if isinstance(a,(list,tuple)):
            assert len(a)==len(b)
            for x,y in zip(a,b):compare(x,y)
        else:
            gap=abs(a-b);assert gap<=1e-10*max(1,abs(b)),(a,b);maximum=max(maximum,gap);count+=1
    for case,result in zip(cases,results):
        kind,args=case['kind'],case['args']
        if kind=='local':
            initial,h,steps=args;expected=functions['local_comparison'](initial,.2,.1,.5,1,2,h,steps)
        elif kind=='closed':
            a,b,x,s=args;expected=functions['closed_state'](a,b,x,[s*t for t in case['times']])
        elif kind=='symmetric':expected=functions['symmetric_modes'](*args,case['times'])[2]
        else:expected=functions['damped'](*args,case['times'])[1]
        compare(result,expected)
    report=dict(cases=len(cases),compared_values=count,maximum_absolute_difference=maximum,tolerance='1e-10 * max(1, abs(Python))',scope='same-model cross-implementation; independent mathematical checks are separate',notebooks=paths,web='web/multivariable/model.mjs')
    target=ROOT/'.work/m4/web-model-comparison.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='notebooks'},ensure_ascii=False))

if __name__=='__main__':main()
