"""Compare browser probability calculations with the delivered Notebook functions."""
import argparse,ast,json,math,shutil,subprocess
from pathlib import Path
import numpy as np
import nbformat
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--node',default=shutil.which('node'));args=parser.parse_args()
    if not args.node:parser.error('Provide --node')
    f={'np':np,'math':math};catalog=json.loads((ROOT/'notebooks/05-随机性与信息/catalog.json').read_text(encoding='utf-8'))
    for lesson in catalog:
        for cell in nbformat.read(ROOT/lesson['path'],4).cells:
            if cell.cell_type=='code' and 'model' in cell.metadata.get('tags',[]):
                tree=ast.parse(cell.source);assert all(isinstance(n,ast.FunctionDef) for n in tree.body);exec(compile(tree,lesson['path'],'exec'),f)
    cases=[];expected=[]
    def add(kind,arguments,result):cases.append({'kind':kind,'args':arguments});expected.append(result)
    for seed in [0,1,7,99,2**32-1]:
        add('uniforms',[seed,201],f['demonstration_uniforms'](seed,201))
    for seed in [1,7]:
        for p in [0,.3,1]:
            for size in [20,200]:
                draws=f['demonstration_uniforms'](seed,size);hits=np.cumsum(np.array(draws)<p)
                add('frequencyPath',[p,size,seed],[[i+1,float(x/(i+1)),int(x)] for i,x in enumerate(hits)])
    for a in [-.9,0,.8]:
        for q in [0,.04]:
            add('variancePath',[a,q,0,40],f['variance_path'](a,q,0,40))
            for r in [0,.09]:
                draws=f['demonstration_uniforms'](7,81);x=0.;rows=[[0,0,math.sqrt(3*r)*(2*draws[0]-1)]]
                for n in range(40):
                    x=a*x+math.sqrt(3*q)*(2*draws[2*n+1]-1)
                    rows.append([n+1,x,x+math.sqrt(3*r)*(2*draws[2*n+2]-1)])
                add('noisePath',[a,q,r,40,7],rows)
    for prior in [.05,.2,.8,.95]:
        for error in [.05,.1,.45]:
            markers=[1,1,0,1,0,1,1,0];p=[prior,1-prior];rows=[[0,*p]]
            for n,y in enumerate(markers):
                p=f['discrete_update'](p,[1-error,error] if y else [error,1-error]);rows.append([n+1,*p])
            add('bayesPath',[prior,error,markers],rows)
    add('bayes',[[1,0],[0,1]],None)
    for alpha,beta in [(.2,.1),(1,1),(0,0),(0,.3),(.45,1)]:
        matrix=[[1-alpha,alpha],[beta,1-beta]]
        for active in [0,.5,1]:
            theory=f['propagate'](matrix,[1-active,active],40)
            add('propagate',[matrix,[1-active,active],40],theory)
            draws=f['demonstration_uniforms'](7,200*41);paths=[]
            for b in range(200):
                offset=b*41;initial=int(draws[offset]<active)
                paths.append(f['path_from_uniforms'](matrix,initial,draws[offset+1:offset+41]))
            result={'theory':theory,'first':paths[0],'frequency':np.array(paths).mean(axis=0).tolist()}
            add('chainExperiment',[alpha,beta,active,40,7],result)
    add('path',[[[.8,.2],[.1,.9]],0,[.7,.8,.05]],f['path_from_uniforms']([[.8,.2],[.1,.9]],0,[.7,.8,.05]))
    script="import{readFileSync}from'node:fs';const m=await import(process.argv[1]);console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(c=>m[c.kind](...c.args))));"
    result=subprocess.run([args.node,'--input-type=module','-e',script,(ROOT/'web/probability/model.mjs').as_uri()],input=json.dumps(cases),text=True,capture_output=True,check=True,timeout=30)
    count=0;maximum=0.
    def compare(actual,expect):
        nonlocal count,maximum
        if expect is None:assert actual is None;return
        if isinstance(expect,dict):
            assert actual.keys()==expect.keys()
            for k in expect:compare(actual[k],expect[k])
            return
        a,b=np.array(actual),np.array(expect);assert a.shape==b.shape
        np.testing.assert_allclose(a,b,atol=1e-12,rtol=1e-12);count+=a.size
        if a.size:maximum=max(maximum,float(np.max(np.abs(a-b))))
    for actual,expect in zip(json.loads(result.stdout),expected):compare(actual,expect)
    report={'cases':len(cases),'compared_values':count,'maximum_absolute_difference':maximum,'tolerance':'atol=rtol=1e-12','scope':'显式演示随机流、相同抽样规则与方程的跨实现比较；不声称演示生成器与 NumPy PCG64 同种子同输出，独立数学参照见 test_part05。'}
    target=ROOT/'.work/m6/web-model-comparison.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
