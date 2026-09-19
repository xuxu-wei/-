"""Compare the browser measurement models with functions extracted from delivered Notebooks."""
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
    if not args.node:parser.error('Provide --node')
    f={'np':np,'math':math};sources=[]
    catalog=json.loads((ROOT/'notebooks/06-从测量走向模型/catalog.json').read_text(encoding='utf-8'))
    for lesson in catalog:
        if lesson['chapter_id'] not in {'6.1','6.2','6.3'}:continue
        for cell in nbformat.read(ROOT/lesson['path'],4).cells:
            if cell.cell_type=='code' and 'model' in cell.metadata.get('tags',[]):
                tree=ast.parse(cell.source);assert all(isinstance(node,ast.FunctionDef) for node in tree.body)
                exec(compile(tree,lesson['path'],'exec'),f);sources.append(lesson['path'])
    cases=[];expected=[]
    def add(kind,arguments,result):cases.append({'kind':kind,'args':arguments});expected.append(result)
    def folded(frequency,rate):
        # Nearest integer multiple, an independent representation of cosine folding.
        center=math.floor(frequency/rate)
        return min(abs(frequency-n*rate) for n in range(center-1,center+3))
    for frequency in [-.8,0,.2,.8,1.8]:
        for rate in [.5,1,2.25,4]:add('aliasFrequency',[frequency,rate],folded(frequency,rate))
    for frequency,rate,plot_step in [(.8,1,.01),(.8,4,.01),(.8,1.75,.073),(.2,1,.01),(1.8,.5,.037),(0,1,.01),(1,2,.01)]:
        duration=10;times=[n*plot_step for n in range(math.floor(duration/plot_step+1e-10)+1)]
        if times[-1]<duration-1e-10:times.append(duration)
        sample_times=[n/rate for n in range(math.floor(duration*rate+1e-10)+1)];alias=folded(frequency,rate)
        add('sampling',[frequency,rate,duration,plot_step],dict(continuous=list(map(list,zip(times,f['sample_cosine'](times,frequency,1,0)))),samples=list(map(list,zip(sample_times,f['sample_cosine'](sample_times,frequency,1,0)))),alias=list(map(list,zip(times,f['sample_cosine'](times,alias,1,0)))),aliasFrequency=alias))
    for values in [[1,2,0,0],[2,4,8,10],[-1,0,1],[],[3,3]]:
        for window in [1,2,5,9]:
            # NB 6.1 uses the available prefix; the webpage FIR is zero-extended with a fixed divisor.
            # Compare against 6.2 linear convolution, not against that different prefix contract.
            fixed=f['linear_convolution'](values,[1/window]*window)[:len(values)] if values else []
            add('causalMean',[values,window],fixed)
            prefix=f['causal_average'](values,window)
            reconstructed=[x*min(n+1,window)/window for n,x in enumerate(prefix)]
            np.testing.assert_allclose(fixed,reconstructed,atol=1e-12,rtol=1e-12)
    def response(window,frequency):
        value=f['fir_response']([1/window]*window,[frequency],1)[0]
        return dict(real=value.real,imag=value.imag,magnitude=abs(value),phase=None if abs(value)<1e-12 else math.atan2(value.imag,value.real))
    for window in [1,2,5,9]:
        for frequency in [0,.1,.2,.25,.5]:add('firResponse',[window,frequency],response(window,frequency))
    for window,frequency in [(1,.1),(5,.1),(5,.2),(2,.5),(9,.17)]:
        times=list(range(61));values=f['sample_cosine'](times,frequency,1,0);output=f['linear_convolution'](values,[1/window]*window)[:len(values)]
        frequencies=[n/500 for n in range(251)];gains=[abs(value) for value in f['fir_response']([1/window]*window,frequencies,1)]
        add('filterExperiment',[frequency,window,60],dict(input=list(map(list,zip(times,values))),output=list(map(list,zip(times,output))),response=list(map(list,zip(frequencies,gains))),selected=response(window,frequency)))
    for k in [0,1e-15,.02,.2,.3]:
        for step in [1,3,12]:
            a=f['sampled_response'](k,step,1,[0])[0][-1];b=f['sampled_response'](k,step,0,[1])[0][-1]
            add('zohCoefficients',[k,step],dict(a=a,b=b))
    for k,u,initial,step in [(0,0,10,12),(0,1,0,3),(1e-15,1,0,1),(.2,0,10,1),(.2,0,10,12),(.2,1,0,1),(.2,1,10,3),(.3,0,10,12),(.02,.5,2,7)]:
        duration=60;times=[duration*n/600 for n in range(601)];zero,forced=f['continuous_components'](k,u,initial,times)
        sample_times=[step*n for n in range(math.floor(duration/step+1e-10)+1)];exact,euler=f['sampled_response'](k,step,initial,[u]*(len(sample_times)-1))
        a=f['sampled_response'](k,step,1,[0])[0][-1];b=f['sampled_response'](k,step,0,[1])[0][-1]
        add('compartment',[k,u,initial,step,duration],dict(continuous=[[t,x+y] for t,x,y in zip(times,zero,forced)],exact=list(map(list,zip(sample_times,exact))),euler=list(map(list,zip(sample_times,euler))),coefficients=dict(a=a,b=b),eulerPole=1-k*step))
    script="import{readFileSync}from'node:fs';const m=await import(process.argv[1]);console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(c=>m[c.kind](...c.args))));"
    process=subprocess.run([args.node,'--input-type=module','-e',script,(ROOT/'web/measurement/model.mjs').as_uri()],input=json.dumps(cases),text=True,capture_output=True,check=True,timeout=30)
    result=json.loads(process.stdout);assert len(result)==len(expected)
    count=0;maximum=0.;phase_comparisons=0
    def compare(actual,expect):
        nonlocal count,maximum,phase_comparisons
        if expect is None:assert actual is None;return
        if isinstance(expect,dict):
            assert actual.keys()==expect.keys()
            for key in expect:
                if key=='phase' and expect[key] is not None:
                    # ±π are the same angle; the exercise chooses +π while the browser preserves atan2.
                    delta=math.atan2(math.sin(actual[key]-expect[key]),math.cos(actual[key]-expect[key]));assert abs(delta)<1e-12
                    phase_comparisons+=1;count+=1;maximum=max(maximum,abs(delta))
                else:compare(actual[key],expect[key])
            return
        a,b=np.array(actual),np.array(expect);assert a.shape==b.shape
        np.testing.assert_allclose(a,b,atol=1e-12,rtol=1e-12);count+=a.size
        if a.size:maximum=max(maximum,float(np.max(np.abs(a-b))))
    for case,actual,expect in zip(cases,result,expected):
        try:compare(actual,expect)
        except (AssertionError,TypeError) as error:raise AssertionError(f"{case['kind']} {case['args']}: {error}") from error
    report=dict(cases=len(cases),compared_values=count,maximum_absolute_difference=maximum,tolerance='atol=rtol=1e-12; nonzero phase modulo 2π',phase_comparisons=phase_comparisons,notebook_sources=sorted(set(sources)),contracts=['6.1 前缀按已有样本数归一；6.2/网页 FIR 零延拓并固定除 W，数值不同且已分别核对。','零响应：Notebook 习题以相位 0 作返回约定；网页用 null 显示未定义，不比较该处物理相位。','采样时刻独立于绘图网格；连续参照不是数值 ODE 求解。','精确 ZOH 与 Euler 分别核对；包含 k=0、小 k、负 Euler、大间隔及非整段末端。'],scope='核对 JavaScript 与实际交付 Notebook 的相同模型；独立数学参照和实际判题见 test_part06。')
    target=ROOT/'.work/m7/test-web-model-comparison.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
