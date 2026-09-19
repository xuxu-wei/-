"""Independent probability, matrix and high-precision oracles for Part 9."""
import ast
from decimal import Decimal, localcontext
import json
import math
from pathlib import Path
import sys
import time
import uuid
import subprocess
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from practice import PracticeEngine,difference
from assessment import summarize_assessments
BANK=ROOT/'exercises/09-概率建模与近似推断'
QUESTIONS=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
VERIFY=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
SOLUTIONS=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
ALIASES={'cap-local':'gamma-local','cap-mh':'mh-replay','cap-variational':'gaussian-coordinate','cap-predictive':'predictive-score'}

def functions():
    scope={'np':np,'math':math}
    for entry in json.loads((ROOT/'notebooks/09-概率建模与近似推断/catalog.json').read_text(encoding='utf-8')):
        nb=json.loads((ROOT/entry['path']).read_text(encoding='utf-8'))
        for cell in nb['cells']:
            if 'model' in cell.get('metadata',{}).get('tags',[]):
                tree=ast.parse(''.join(cell['source']));assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
                exec(compile(tree,entry['path'],'exec'),scope)
    return scope

def density(y,mean,var):
    y,mean,var=map(lambda x:Decimal(str(x)),(y,mean,var))
    return (-(y-mean)**2/(2*var)).exp()/(2*Decimal(str(math.pi))*var).sqrt()

def oracle(slug,p):
    slug=ALIASES.get(slug,slug)
    with localcontext() as ctx:
        ctx.prec=50
        if slug=='normal-update':
            # Sequential conditioning, instead of the batch precision formula.
            m,v=p['prior_mean'],p['prior_variance']
            for y in p['observations']:
                gain=v/(v+p['noise_variance']);m+=gain*(y-m);v*=1-gain
            return [m,v,v+p['noise_variance']]
        if slug=='gamma-local':
            a,b=p['shape']+p['count'],p['rate']+p['exposure']
            if a<=1:return [None,None,None,'boundary']
            return [(a-1)/b,b*b/(a-1),(a-1)/(b*b),'interior']
        if slug=='grid-masses':
            x=np.array(p['nodes']);raw=[Decimal(0) for _ in x]
            for i,width in enumerate(np.diff(x)):
                for j in [i,i+1]:raw[j]+=Decimal(str(width/2))*Decimal(str(p['log_values'][j])).exp()
            z=sum(raw);w=[float(r/z) for r in raw];m=float(w@x)
            return [w,m,float(w@(x*x))-m*m,float(z.ln())]
        if slug=='mh-replay':
            def target(x):return (density(x,-p['separation'],1)+density(x,p['separation'],1))/2
            x=p['initial'];path=[x];accepted=[]
            for y,ratio,u in zip(p['candidates'],p['log_reverse_over_forward'],p['uniforms']):
                alpha=min(Decimal(1),target(y)*Decimal(str(ratio)).exp()/target(x));take=Decimal(str(u))<alpha
                if take:x=y
                path.append(x);accepted.append(take)
            return [path,accepted]
        if slug=='finite-kernel':
            pi=np.array(p['target']);Q=np.array(p['proposal']);flux=np.minimum(pi[:,None]*Q,pi[None,:]*Q.T);np.fill_diagonal(flux,0)
            P=flux/pi[:,None];np.fill_diagonal(P,1-P.sum(axis=1));return P.tolist()
        if slug=='basic-diagnostics':
            a=np.array(p['chains']);m,n=a.shape;within=a.var(axis=1,ddof=1).mean();between=n*a.mean(axis=1).var(ddof=1)
            rhat=math.sqrt((within*(n-1)/n+between/n)/within) if within else None;ess=[]
            for row in a:
                c=row-row.mean();corr=np.correlate(c,c,'full')[n-1:]
                tau=1+2*corr[1:p['max_lag']+1].sum()/corr[0] if corr[0] else None
                ess.append(float(n/tau) if tau is not None and tau>0 else None)
            return [rhat,ess]
        if slug=='gaussian-coordinate':
            H=np.array(p['precision']);target=np.array(p['target_mean']);current=np.array(p['current_mean'])
            mean=np.linalg.solve(np.tril(H),H@target-np.triu(H,1)@current);C=np.diag(1/np.diag(H));S=np.linalg.inv(H);d=mean-target
            gap=.5*(np.trace(np.linalg.solve(S,C))+d@np.linalg.solve(S,d)-2+np.linalg.slogdet(S)[1]-np.linalg.slogdet(C)[1])
            return [mean.tolist(),np.diag(C).tolist(),float(gap)]
        if slug=='finite-bound':
            joint=[Decimal(str(x)).exp() for x in p['log_joint']];z=sum(joint);q=p['probabilities']
            kl=sum(Decimal(str(w))*(Decimal(str(w))/(mass/z)).ln() for w,mass in zip(q,joint) if w)
            return [float(z.ln()-kl),float(kl)]
        if slug=='discrete-coordinate':
            matrix=np.array(p['log_joint']).reshape(2,2);marginals=[np.array([1-x,x]) for x in p['initial']];history=[]
            for _ in range(p['steps']):
                for j in [0,1]:
                    energy=(matrix if j==0 else matrix.T)@marginals[1-j];weights=np.exp(energy-max(energy));marginals[j]=weights/weights.sum()
                joint=np.outer(*marginals).ravel();bound,gap=oracle('finite-bound',dict(log_joint=p['log_joint'],probabilities=joint.tolist()))
                history.append([marginals[0][1],marginals[1][1],bound,gap])
            return history
        if slug=='mixture-update':
            rows=[];ll=Decimal(0)
            for y in p['observations']:
                masses=[Decimal(str(w))*density(y,m,p['variance']) for w,m in zip(p['weights'],p['means'])];z=sum(masses);ll+=z.ln();rows.append([float(x/z) for x in masses])
            r=np.array(rows);total=r.sum(axis=0);means=[float(r[:,j]@p['observations']/total[j]) if total[j] else p['means'][j] for j in range(2)]
            return [rows,(total/len(rows)).tolist(),means,float(ll)]
        if slug=='state-moments':
            m,v,c=map(np.array,[p['means'],p['variances'],p['lag_covariances']]);T=len(c)
            # Average quadratic expected loss and minimize its polynomial.
            A=float(np.mean(v[:-1]+m[:-1]**2));B=float(-2*np.mean(c+m[:-1]*m[1:]));C=float(np.mean(v[1:]+m[1:]**2))
            if A==0:return [None,None]
            a=-B/(2*A);return [a,A*a*a+B*a+C]
        if slug=='predictive-moments':
            w=np.array(p['weights']);w=w/w.sum();m=np.array(p['conditional_means']);v=np.array(p['conditional_variances']);mean=float(w@m);within=float(w@v);total=float(w@(v+m*m)-mean**2)
            return [mean,total,within,total-within]
        if slug=='predictive-score':
            if not p['observed']:return [None,None,None,p['evaluations']]
            w=np.array(p['weights']);w=w/w.sum();m=float(w@p['means']);score=[]
            for y in p['observed']:
                mass=sum(Decimal(str(a))*density(y,b,c) for a,b,c in zip(w,p['means'],p['variances']));score.append(float(mass.ln()))
            return [float(np.mean((np.array(p['observed'])-m)**2)),float(np.mean(score)),float(np.mean((np.array(p['observed'])>=p['lower'])&(np.array(p['observed'])<=p['upper']))),p['evaluations']]
    raise AssertionError(slug)

PYTHON=[q for q in QUESTIONS if q['type']=='python']
@pytest.mark.parametrize('q',PYTHON,ids=lambda q:q['slug'])
def test_probability_vectors_against_independent_oracles(q):
    for case in VERIFY[q['id']]['cases']:
        assert difference(oracle(q['slug'][4:],case['arguments']),case['expected'],q['tolerance']) is None,(q['id'],case)

def wrong_solution(q):
    slug=ALIASES.get(q['slug'][4:],q['slug'][4:]);source=SOLUTIONS[q['id']]
    changes={'normal-update':('variance+noise_variance','variance'),
      'gamma-local':('a<=1','a<1'), 'grid-masses':('l+math.log(w)','l'),
      'mh-replay':('+ratio)','+0)'), 'finite-kernel':('target[j]*proposal[j][i]','target[i]*proposal[i][j]'),
      'basic-diagnostics':('1+2*sum(correlations)','1+0*sum(correlations)'),
      'gaussian-coordinate':('variances=[1/precision[i][i]','variances=[2/precision[i][i]'),
      'finite-bound':('l-math.log(q)','l'), 'discrete-coordinate':('p1=sigmoid','p1=0*sigmoid'),
      'mixture-update':('updated_weights=[x/len(observations)','updated_weights=[x/(2*len(observations))'),
      'state-moments':('lag_covariances[t]+means[t]','0+means[t]'),
      'predictive-moments':('within+between','between'), 'predictive-score':('covered+=lo<=y<=hi','covered+=lo<y<hi')}
    if slug=='gamma-local':
        return source.replace("if a<=1:return None,None,None,'boundary'","if a<=1:return 0.,0.,0.,'interior'")
    if slug=='predictive-score':return source.replace('score/count','score')
    before,after=changes[slug];assert before in source;return source.replace(before,after)

@pytest.mark.parametrize('q',PYTHON,ids=lambda q:q['slug'])
def test_real_inference_judge_and_semantic_mutants(tmp_path,q):
    engine=PracticeEngine(tmp_path/'records')
    def submit(mode,source):
        result=engine.submit(dict(exercise_id=q['id'],exercise_version=q['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python');deadline=time.monotonic()+35
        while result['state']!='FINISHED' and time.monotonic()<deadline:
            time.sleep(.01);result=engine.get(result['id'])
        assert result['state']=='FINISHED';return result
    try:
        assert submit('samples',SOLUTIONS[q['id']])['verdict']=='AC'
        assert q['id'] not in engine.progress()['passed']
        assert submit('full',SOLUTIONS[q['id']])['verdict']=='AC'
        assert submit('full',wrong_solution(q))['verdict']=='WA'
    finally:engine.close()

def test_finite_mh_detailed_balance_for_nonsymmetric_proposals():
    f=functions();rng=np.random.default_rng(9102)
    for _ in range(30):
        pi=rng.uniform(.1,2,4);pi/=pi.sum();Q=rng.uniform(0,2,(4,4));Q/=Q.sum(axis=1)[:,None]
        P=np.array(f['finite_mh'](pi.tolist(),Q.tolist()))
        np.testing.assert_allclose(pi@P,pi,atol=1e-14);np.testing.assert_allclose(pi[:,None]*P,(pi[:,None]*P).T,atol=1e-14)
        assert np.all(P>=0);np.testing.assert_allclose(P.sum(axis=1),1)

def test_scalar_smoother_matches_full_joint_conditioning_and_em_likelihood():
    f=functions();y=np.array([.2,.6,.5,.9,.1,-.2]);a=.6;Q=.2;R=.4;n=len(y)
    D=np.eye(n);D[np.arange(1,n),np.arange(n-1)]=-a;precision=D.T@np.diag([1.]+[1/Q]*(n-1))@D+np.eye(n)/R
    covariance=np.linalg.inv(precision);mean=np.linalg.solve(precision,y/R)
    m,v,c=f['scalar_smoother'](y,a,Q,R,0,1)
    np.testing.assert_allclose(m,mean);np.testing.assert_allclose(v,np.diag(covariance));np.testing.assert_allclose(c,np.diag(covariance,1))
    updated,_=f['state_mstep'](m,v,c)
    assert f['gaussian_log_likelihood'](y,updated,Q,R,0,1)>=f['gaussian_log_likelihood'](y,a,Q,R,0,1)-1e-12

def test_new_content_and_assessment_information_boundaries(tmp_path):
    assert len(QUESTIONS)==58 and len(PYTHON)==17
    for q in QUESTIONS:
        if q['type']=='choice':assert set(VERIFY[q['id']]['explanations'])=={'A','B','C','D'} and VERIFY[q['id']]['correct']
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'));assert len(spec['items'])==8
    assert [sum(i['points'] for i in spec['items'] if i['level']==level) for level in range(1,5)]==[20,30,30,20]
    engine=PracticeEngine(tmp_path/'records')
    try:
        rows=[]
        for i,item in enumerate(spec['items']):
            q=engine.questions[item['question_id']];rows.append(dict(id=str(i),created_at=f'2026-09-19T00:{i:02}:00+00:00',exercise_id=q['id'],exercise_version=q['version'],assessment_version='1',saved=True,state='FINISHED',mode='full',verdict='WA' if i==0 else 'AC'))
        retry=dict(rows[0],id='retry',created_at='2026-09-19T02:00:00+00:00',verdict='AC')
        result=summarize_assessments(engine.assessments,engine.questions,[*rows,retry])['P09-SUMMARY']
        assert result['first_points']==90 and result['practice_points']==100 and result['complete']
    finally:engine.close()

def test_browser_numeric_models_agree_with_notebook_algorithms():
    f=functions();cases=[];expected=[]
    for rho in [0,.4,.8,.95]:
        H=(np.array([[1.,-rho],[-rho,1.]])/(1-rho*rho)).tolist();m=[2.,-2.]
        for _ in range(20):m,v,kl=f['mean_field_sweep'](H,[0,0],m)
        cases.append(dict(kind='mf',rho=rho));expected.append([m,v[0],kl])
    for r in [.1,.25,2.]:
        for means in [[-1.,1.],[0.,0.]]:
            y=[-1.4,-1.1,-.8,-.5,.6,.9,1.2,1.6];result=f['mixture_em'](y,[.5,.5],means,r)
            cases.append(dict(kind='em',y=y,means=means,r=r));expected.append(result)
    for d in [0,2,4]:
        inc=[.1,1.,3.,-4.,2.];u=[.2,.9,.5,.1,.01];cases.append(dict(kind='mh',d=d,inc=inc,u=u));expected.append(f['random_walk'](-d,inc,u,d))
    js="""import fs from 'node:fs';import {meanField,emStep,replay} from './web/inference/model.mjs';
const cases=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(cases.map(c=>{if(c.kind==='mf'){const r=meanField(c.rho).at(-1);return[r.mean,r.variance,r.gap];}if(c.kind==='em'){const r=emStep(c.y,[.5,.5],c.means,c.r);return[r.responsibilities,r.weights,r.means,r.likelihood];}const r=replay(-c.d,c.inc,c.u,c.d);return[r.path,r.accepted];})));"""
    result=subprocess.run(['node','--input-type=module','-e',js],input=json.dumps(cases),text=True,capture_output=True,check=True,cwd=ROOT)
    assert difference(json.loads(result.stdout),json.loads(json.dumps(expected)),dict(atol=1e-10,rtol=1e-10)) is None
