"""Cross-check the six estimation explorations against delivered Notebook functions."""
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
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',default=shutil.which('node'))
    args=parser.parse_args()
    if not args.node:parser.error('Provide --node')
    scope={'np':np,'math':math};sources=[]
    for lesson in json.loads((ROOT/'notebooks/07-状态估计与贝叶斯滤波/catalog.json').read_text(encoding='utf-8')):
        for cell in nbformat.read(ROOT/lesson['path'],4).cells:
            if cell.cell_type=='code' and 'model' in cell.metadata.get('tags',[]):
                tree=ast.parse(cell.source)
                assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
                exec(compile(tree,lesson['path'],'exec'),scope);sources.append(lesson['path'])
    cases=[];expected=[]
    def add(kind,arguments,result):cases.append(dict(kind=kind,args=arguments));expected.append(result)
    for c in [0,.02,.2,.4]:
        F=[[1-c,c],[c,1-c]]
        for H in [[1,0],[1,1]]:
            matrix,_,_=scope['observability'](F,H,2,[8,2]);add('observability',[F,H,2],matrix)
    T=[[.8,.15,.05],[.1,.8,.1],[.05,.2,.75]];initial=[.6,.3,.1]
    for error in [.02,.14,.5]:
        likelihoods=[[error,.5,1-error],None,[1-error,.5,error],[error,.5,1-error]]
        out=scope['hmm_filter'](initial,T,likelihoods)
        add('hmmFilter',[initial,T,likelihoods],[out['predictions'],out['posteriors'],out['evidence']])
    F=[[.85,.1],[.1,.8]];Q=[[.02,0],[0,.02]];H=[1,0];m=[2,0];P=np.eye(2).tolist()
    for R in [.04,.16,.8,1]:
        for y in [[2.2,1.6,1.8,1.2],[None,1.6,None,1.2],[None]*4,[]]:
            out=scope['kalman_filter'](F,H,Q,R,m,P,y)
            add('kalmanFilter',[F,Q,H,R,m,P,y],{k:out[k] for k in ['predicted_means','predicted_covariances','means','covariances']})
    for mean in [0,.6,2]:
        for noise in [.05,.15,1]:
            for method in ['ekf','ukf']:
                out=scope['nonlinear_update'](mean,.8,1.4,noise,method)
                add('nonlinearUpdate',[mean,.8,1.4,noise,method],[out['mean'],out['variance'],out['observation_mean'],out['innovation_variance']])
            _,_,gm,gv=scope['grid_update'](mean,.8,1.4,noise,lower=-6,upper=6,count=601)
            add('posteriorGrid',[mean,.8,1.4,noise],[gm,gv])
    for n in [12,60,96,120]:
        particles=(-4+8*(np.arange(n)+.5)/n).tolist()
        prior=np.exp(-.5*np.array(particles)**2/.8);prior/=prior.sum()
        for noise in [.05,.15,1]:
            # Continuous quadrature weights can straddle an exact CDF boundary
            # by one rounding bit across runtimes. Test exact boundaries separately.
            for offset in [.13,.5,.95]:
                logs=(-.5*(1.4-np.array(particles)**2)**2/noise).tolist()
                out=scope['particle_update'](particles,prior.tolist(),logs,offset)
                add('particleExperiment',[noise,n,offset],[out['weights'],out['ess'],out['indices'],out['particles']])
    observations=[0,.2,.7,.4,.8,1.4,1.1,1.5,1.8,1.2,1.6,1.8,1.4,1.9,2.1,1.8,2.2,2,2.3,2.1]
    for gap in [False,True]:
        for q in [.02,.08,.3]:
            y=[None if gap and 6<=i<=12 else x for i,x in enumerate(observations)]
            k=scope['kalman_filter']([[1]],[1],[[q]],.16,[0],[[1]],y)
            s=scope['rts_smooth']([[1]],k['predicted_means'],k['predicted_covariances'],k['means'],k['covariances'])
            add('smoothingExperiment',[gap,q],[[[x[0],p[0][0]] for x,p in zip(k['means'],k['covariances'])],[[x[0],p[0][0]] for x,p in zip(s['means'],s['covariances'])]])
    script="""import{readFileSync}from'node:fs';const m=await import(process.argv[1]);console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(c=>{const r=m[c.kind](...c.args);switch(c.kind){case'hmmFilter':return[r.rows.map(x=>x.predicted),r.rows.map(x=>x.filtered),r.rows.map(x=>x.evidence)];case'kalmanFilter':return{predicted_means:r.map(x=>x.predictedMean),predicted_covariances:r.map(x=>x.predictedCovariance),means:r.map(x=>x.mean),covariances:r.map(x=>x.covariance)};case'nonlinearUpdate':return[r.mean,r.variance,r.predictedObservation,r.observationVariance];case'posteriorGrid':return[r.mean,r.variance];case'particleExperiment':return[r.weights,r.ess,r.indices,r.resampled];case'smoothingExperiment':return[r.filtered.map(x=>[x.mean[0],x.covariance[0][0]]),r.smoothed.map(x=>[x.mean,x.variance])];default:return r;}})));"""
    process=subprocess.run([args.node,'--input-type=module','-e',script,(ROOT/'web/estimation/model.mjs').as_uri()],input=json.dumps(cases),text=True,capture_output=True,check=True,timeout=30)
    actual=json.loads(process.stdout);count=0;maximum=0.
    def compare(a,b):
        nonlocal count,maximum
        if isinstance(b,dict):
            assert a.keys()==b.keys()
            for key in b:compare(a[key],b[key])
        elif isinstance(b,list):
            assert len(a)==len(b)
            for x,y in zip(a,b):compare(x,y)
        else:
            np.testing.assert_allclose(a,b,atol=1e-10,rtol=1e-10)
            count+=1;maximum=max(maximum,abs(a-b))
    for case,a,b in zip(cases,actual,expected):
        try:compare(a,b)
        except AssertionError as error:raise AssertionError(f'{case}: {error}') from error
    report=dict(cases=len(cases),compared_values=count,maximum_absolute_difference=maximum,tolerance='atol=rtol=1e-10',notebook_sources=sorted(set(sources)),scope='Actual delivered Notebook functions against six browser exploration models; independent mathematical tests are separate.',simplifications=['7.5 uses deterministic midpoint nodes and one importance update; not a dynamic particle filter.','7.6 is scalar random walk rather than the two-room Notebook case.','7.4 grid uses 601 points on [-6,6]; comparison uses identical numerical quadrature bounds.'])
    target=ROOT/'.work/m8/web-model-comparison.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
