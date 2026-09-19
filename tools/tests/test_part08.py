"""Independent algebra, spectral propagation and edge geometry for optimization."""
import ast
from itertools import combinations
import json
import math
from pathlib import Path
import sys
import time
import uuid
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from practice import PracticeEngine,difference
from assessment import summarize_assessments
BANK=ROOT/'exercises/08-优化方法与计算'
QUESTIONS=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
VERIFY=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
SOLUTIONS=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))

def functions():
    scope={'np':np,'math':math,'combinations':combinations}
    for entry in json.loads((ROOT/'notebooks/08-优化方法与计算/catalog.json').read_text(encoding='utf-8')):
        nb=json.loads((ROOT/entry['path']).read_text(encoding='utf-8'))
        for cell in nb['cells']:
            if 'model' in cell.get('metadata',{}).get('tags',[]):
                tree=ast.parse(''.join(cell['source']))
                assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
                exec(compile(tree,entry['path'],'exec'),scope)
    return scope

def edge_optimum(H,b,lower,upper,B):
    """Minimize on each clipped boundary line; no KKT or multiplier solve."""
    H,b,lo,hi=map(np.array,[H,b,lower,upper])
    if np.any(lo>hi) or lo.sum()>B:return None,None,'infeasible'
    A=np.array([[-1.,0.],[0.,-1.],[1.,0.],[0.,1.],[1.,1.]])
    c=np.r_[-lo,hi,B];candidates=[]
    interior=np.linalg.solve(H,b)
    if np.all(A@interior<=c+1e-10):candidates.append(interior)
    for normal,bound in zip(A,c):
        a=normal*bound/(normal@normal);d=np.array([-normal[1],normal[0]])
        left,right=-np.inf,np.inf
        for row,limit in zip(A,c):
            slope=row@d;remaining=limit-row@a
            if abs(slope)<1e-12:
                if remaining< -1e-10:left,right=1,0;break
            elif slope>0:right=min(right,remaining/slope)
            else:left=max(left,remaining/slope)
        if left<=right+1e-12:
            t=np.clip(d@(b-H@a)/(d@H@d),left,right);candidates.append(a+t*d)
    assert candidates
    point=min(candidates,key=lambda x:x@H@x/2-b@x)
    return point.tolist(),float(point@H@point/2-b@point),'optimal'

def independent(slug,p):
    slug={'cap-derivatives':'quadratic','cap-descent':'armijo'}.get(slug,slug)
    if 'matrix' in p:H,b=np.array(p['matrix']),np.array(p['linear'])
    if slug=='quadratic':
        x=np.array(p['point']);return [float(x@H@x/2-b@x),(H@x-b).tolist(),H.tolist()]
    if slug=='linear-minimum':return np.linalg.solve(H,b).tolist()
    if slug=='gradient-steps':
        x=np.array(p['initial']);opt=np.linalg.solve(H,b);eigen,V=np.linalg.eigh(H);coeff=V.T@(x-opt);history=[]
        for k in range(p['max_steps']+1):
            current=opt+V@((1-p['step']*eigen)**k*coeff);history.append(current.tolist());res=float(np.linalg.norm(H@current-b))
            if res<=p['tolerance']:return [history,res,'converged']
        return [history,res,'max_steps']
    if slug=='newton-direction':
        x=p['point'];g=x*(x*x-1);h=3*x*x-1
        return [0.,'stationary'] if g==0 else [-g/h,'newton'] if h>0 else [-g,'gradient_fallback']
    if slug=='armijo':
        x=np.array(p['point']);d=np.array(p['direction']);gd=float((H@x-b)@d)
        if gd>=0:return [x.tolist(),None,'not_descent']
        threshold=-2*(1-p['slope'])*gd/(d@H@d)
        eligible=[p['initial_step']*p['shrink']**k for k in range(p['max_trials']) if p['initial_step']*p['shrink']**k<=threshold]
        return [(x+eligible[0]*d).tolist(),eligible[0],'accepted'] if eligible else [x.tolist(),None,'line_search_failed']
    if slug=='ridge':
        X,y=np.array(p['design']),np.array(p['observed']);lam=p['penalty']
        if lam==0 and np.linalg.matrix_rank(X)<X.shape[1]:return [None,'nonunique']
        # Augmented least squares is independent of normal equation elimination.
        augmented=np.vstack([X/np.sqrt(len(X)),np.sqrt(lam)*np.eye(X.shape[1])]);target=np.r_[y/np.sqrt(len(X)),np.zeros(X.shape[1])]
        return [np.linalg.lstsq(augmented,target,rcond=None)[0].tolist(),'unique']
    if slug=='threshold':
        v=np.array(p['values']);tau=p['threshold'];return np.where(v>tau,v-tau,np.where(v< -tau,v+tau,0.)).tolist()
    if slug in ('proximal','cap-sparse'):
        X,y=np.array(p['design']),np.array(p['observed']);eta,lam=p['step'],p['penalty'];x=np.array(p.get('initial',p.get('coefficients')));path=[x.tolist()]
        value=lambda z:float(np.mean((X@z-y)**2)/2+lam*np.abs(z).sum())
        values=[value(x)]
        for _ in range(p.get('steps',1)):
            v=x-eta*X.T@(X@x-y)/len(y);tau=eta*lam
            # Enumerate the valid minimizer on each sign region and the corner.
            result=[]
            for z in v:
                candidates=[0.,max(z-tau,0.),min(z+tau,0.)]
                result.append(min(candidates,key=lambda q:(q-z)**2/2+tau*abs(q)))
            x=np.array(result);path.append(x.tolist());values.append(value(x))
        return [path,values] if slug=='cap-sparse' else [path[-1],values[-1]]
    if slug=='training-scale':
        X=np.array(p['training']);mean=X.mean(axis=0);std=X.std(axis=0);std[std==0]=1
        transformed=((np.array(p['later']).reshape(-1,X.shape[1])-mean)/std).tolist()
        return [mean.tolist(),std.tolist(),transformed]
    if slug=='kkt':
        x,lam=np.array(p['point']),np.array(p['multipliers']);A=np.array(p['constraints']).reshape(-1,len(x));r=A@x-p['bounds']
        values=[float(np.max(np.r_[0,r])),float(np.max(np.r_[0,-lam])),float(np.max(np.abs(H@x-b+A.T@lam))),float(np.max(np.r_[0,np.abs(lam*r)]))]
        return [values,'verified' if max(values)<=p['tolerance'] else 'rejected']
    if slug in ('budget-qp','cap-constrained'):
        x,value,status=edge_optimum(H,b,p['lower'],p['upper'],p['budget'])
        return [x,value,status] if slug=='budget-qp' else [x,value,[0.]*4 if x is not None else None,status]
    raise AssertionError(slug)

@pytest.mark.parametrize('q',[q for q in QUESTIONS if q['type']=='python'],ids=lambda q:q['slug'])
def test_all_optimization_vectors_have_independent_oracles(q):
    for case in VERIFY[q['id']]['cases']:
        assert difference(independent(q['slug'][4:],case['arguments']),case['expected'],q['tolerance']) is None,(q['id'],case)

def wrong_solution(q):
    source=SOLUTIONS[q['id']];slug={'cap-derivatives':'quadratic','cap-descent':'armijo','cap-constrained':'budget-qp','cap-sparse':'proximal'}.get(q['slug'][4:],q['slug'][4:])
    changes={'quadratic':('return value, gradient','return 2*value, gradient'),
        'linear-minimum':('return [row[-1] for row in rows]','return [-row[-1] for row in rows]'),
        'gradient-steps':('if iteration == max_steps:','if iteration == max_steps or iteration == 0:'),
        'newton-direction':("return -gradient, 'gradient_fallback'","return gradient, 'gradient_fallback'"),
        'armijo':('value+slope*step*derivative','value+1000'),
        'ridge':('(penalty if i==j else 0)','(2*penalty if i==j else 0)'),
        'threshold':('value-threshold','value-threshold'),
        'proximal':('step*penalty)','penalty*0)'),
        'training-scale':('(x-m)/s','(x+m)/s'),
        'kkt':('primal = max([0.]+violation)','primal = 1.'),
        'budget-qp':('sum(lower)>budget','sum(lower)>budget or budget>=0')}
    if slug=='threshold':return source.replace('max(abs(value)-threshold, 0.)','abs(value)')
    before,after=changes[slug];assert before in source,(slug,before)
    return source.replace(before,after)

@pytest.mark.parametrize('q',[q for q in QUESTIONS if q['type']=='python'],ids=lambda q:q['slug'])
def test_real_optimization_judge_samples_full_and_wrong(tmp_path,q):
    engine=PracticeEngine(tmp_path/'records')
    def submit(mode,source):
        r=engine.submit(dict(exercise_id=q['id'],exercise_version=q['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python');deadline=time.monotonic()+35
        while r['state']!='FINISHED' and time.monotonic()<deadline:
            time.sleep(.01);r=engine.get(r['id'])
        assert r['state']=='FINISHED';return r
    try:
        assert submit('samples',SOLUTIONS[q['id']])['verdict']=='AC'
        assert q['id'] not in engine.progress()['passed']
        assert submit('full',SOLUTIONS[q['id']])['verdict']=='AC'
        assert submit('full',wrong_solution(q))['verdict']=='WA'
    finally:engine.close()

def test_notebook_algorithms_derivatives_curvature_and_stopping():
    f=functions();H=np.array([[2.,.6],[.6,3.]]);b=np.array([1.,2.]);x=np.array([.8,-.4]);eps=1e-5
    objective=lambda z:z@H@z/2-b@z
    gradient=[(objective(x+eps*e)-objective(x-eps*e))/(2*eps) for e in np.eye(2)]
    np.testing.assert_allclose(f['quadratic'](H,b,x)[1],gradient,atol=1e-9)
    for point in [-2.,-.2,0.,.2,2.]:
        path,steps,directions,status=f['safeguarded_newton'](point)
        a=np.array(path);assert np.all(np.diff(a**4/4-a*a/2)<=1e-12)
        assert status=='stationary' and abs(a[-1]**3-a[-1])<=1e-8
    assert f['safeguarded_newton'](.2,max_trials=0)[-1]=='line_search_failed'
    assert f['safeguarded_newton'](.2,max_steps=0)[-1]=='max_steps'
    assert f['safeguarded_newton'](0)[0]==[0.]

def test_active_set_matches_independent_geometry_for_100_problems_and_degeneracy():
    f=functions();rng=np.random.default_rng(903)
    for _ in range(100):
        X=rng.normal(size=(2,2));H=X.T@X+.2*np.eye(2);b=rng.uniform(-3,8,2);lo=rng.uniform(0,1,2);hi=lo+rng.uniform(0,3,2);B=float(rng.uniform(0,7))
        expected=edge_optimum(H,b,lo,hi,B);actual=f['box_budget_qp'](H,b,lo,hi,B)
        assert actual[-1]==expected[-1]
        if expected[0] is not None:
            np.testing.assert_allclose(actual[0],expected[0],atol=1e-9)
            cert=f['budget_certificate'](H,b,lo,hi,B);assert cert[-1]=='optimal' and max(cert[2])<=1e-8
    for lo,hi,B in [([1,1],[1,1],2),([1,0],[1,2],2),([0,0],[0,0],0)]:
        assert f['budget_certificate']([[2.,.4],[.4,3.]],[4.,5.],lo,hi,B)[-1]=='optimal'

def test_regularization_residual_and_training_information_boundary():
    f=functions();X=np.array([[1.,.8],[.2,1.],[-1.,-.8],[-.2,-1.]]);y=X@np.array([1.,0.]);H=X.T@X/len(X);eta=1/np.linalg.eigvalsh(H)[-1];lam=.1
    path,values=f['proximal_trace'](X.tolist(),y.tolist(),[0,0],eta,lam,300)
    assert max(np.diff(values))<=1e-12
    beta=np.array(path[-1]);g=X.T@(X@beta-y)/len(X)
    residual=np.where(abs(beta)>1e-9,abs(g+lam*np.sign(beta)),np.maximum(abs(g)-lam,0))
    assert max(residual)<1e-8
    args=(X.tolist(),y.tolist(),[[.3,.9],[1.4,.2]],[.3,1.4],[.001,.1,1.])
    selected=f['select_ridge'](*args)
    assert selected==f['select_ridge'](*args)
    assert 'test' not in str(__import__('inspect').signature(f['select_ridge']))
    np.testing.assert_allclose(selected['means'],X.mean(axis=0),atol=1e-15)

def test_optimization_capstone_first_attempt_and_retry(tmp_path):
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items'])==8
    assert [sum(i['points'] for i in spec['items'] if i['level']==level) for level in range(1,5)]==[20,30,30,20]
    engine=PracticeEngine(tmp_path/'records')
    try:
        rows=[]
        for index,item in enumerate(spec['items']):
            q=engine.questions[item['question_id']]
            rows.append(dict(id=str(index),created_at=f'2026-09-19T00:{index:02}:00+00:00',exercise_id=q['id'],exercise_version=q['version'],assessment_version='1',saved=True,state='FINISHED',mode='full',verdict='WA' if index==0 else 'AC'))
        result=summarize_assessments(engine.assessments,engine.questions,rows)['P08-SUMMARY'];assert result['first_points']==90
        retry=dict(rows[0],id='retry',created_at='2026-09-19T02:00:00+00:00',verdict='AC')
        result=summarize_assessments(engine.assessments,engine.questions,[*rows,retry])['P08-SUMMARY']
        assert result['first_points']==90 and result['practice_points']==100 and result['complete']
    finally:engine.close()
