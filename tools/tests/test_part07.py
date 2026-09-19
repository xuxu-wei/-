"""Independent path enumeration, joint-Gaussian conditioning and real estimation judge."""
import ast
from fractions import Fraction
from itertools import product
import json
import math
from pathlib import Path
import statistics
import sys
import time
import uuid
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from practice import PracticeEngine,difference
from assessment import summarize_assessments
BANK=ROOT/'exercises/07-状态估计与贝叶斯滤波'
QUESTIONS=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
VERIFY=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
SOLUTIONS=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
ALIASES={'cap-hidden-update':'bayes-sequence','cap-gaussian-filter':'kalman-sequence','cap-particle':'particle-resampling','cap-smoothing':'rts-backward'}

def functions():
    scope={'np':np,'math':math}
    for entry in json.loads((ROOT/'notebooks/07-状态估计与贝叶斯滤波/catalog.json').read_text(encoding='utf-8')):
        book=json.loads((ROOT/entry['path']).read_text(encoding='utf-8'))
        for cell in book['cells']:
            if cell['cell_type']=='code' and 'model' in cell.get('metadata',{}).get('tags',[]):
                tree=ast.parse(''.join(cell['source']))
                assert all(isinstance(node,ast.FunctionDef) for node in tree.body)
                exec(compile(tree,entry['path'],'exec'),scope)
    return scope

def enumerate_hmm(initial,transition,likelihoods):
    """Fraction arithmetic, sum all full paths; no recursive forward/backward code."""
    n,T=len(initial),len(likelihoods)
    if not T:return [],Fraction(1)
    mass=[[Fraction(0) for _ in range(n)] for _ in range(T)]
    total=Fraction(0)
    f=lambda x:Fraction(str(x))
    for path in product(range(n),repeat=T):
        weight=f(initial[path[0]])
        for t,state in enumerate(path):
            if likelihoods[t] is not None:weight*=f(likelihoods[t][state])
            if t:weight*=f(transition[path[t-1]][state])
        total+=weight
        for t,state in enumerate(path):mass[t][state]+=weight
    return [[float(x/total) for x in row] for row in mass] if total else [],total

def joint_gaussian(arguments,all_observations=False):
    """Independent source loading for all states, then one batch conditioning."""
    p=arguments;F,H,Q=np.array(p['transition']),np.array(p['sensor']),np.array(p['process_covariance'])
    n,T=len(H),len(p['observations']);m0,P0=np.array(p['initial_mean']),np.array(p['initial_covariance'])
    if not T:return [],[]
    loading=np.zeros((n*T,n*T));source=np.zeros_like(loading);source[:n,:n]=P0
    for j in range(1,T):source[j*n:(j+1)*n,j*n:(j+1)*n]=Q
    for t in range(T):
        loading[t*n:(t+1)*n,:n]=np.linalg.matrix_power(F,t)
        for j in range(1,t+1):loading[t*n:(t+1)*n,j*n:(j+1)*n]=np.linalg.matrix_power(F,t-j)
    covariance=loading@source@loading.T
    means=np.concatenate([np.linalg.matrix_power(F,t)@m0 for t in range(T)])
    outputs,uncertainty=[],[]
    for t in range(T):
        seen=[k for k,y in enumerate(p['observations']) if y is not None and (all_observations or k<=t)]
        design=np.zeros((len(seen),n*T))
        for row,k in enumerate(seen):design[row,k*n:(k+1)*n]=H
        cross=covariance[t*n:(t+1)*n]@design.T
        S=design@covariance@design.T+p['measurement_variance']*np.eye(len(seen))
        innovation=np.array([p['observations'][k] for k in seen])-design@means
        updated=means[t*n:(t+1)*n]+cross@np.linalg.solve(S,innovation)
        cov=covariance[t*n:(t+1)*n,t*n:(t+1)*n]-cross@np.linalg.solve(S,cross.T)
        outputs.append(updated.tolist());uncertainty.append(cov.tolist())
    return outputs,uncertainty

def independent(slug,p):
    slug=ALIASES.get(slug,slug)
    if slug=='state-readings':
        F=np.array(p['transition']);x=np.array(p['initial']);noise=np.array(p['process_noise'])
        states=[np.linalg.matrix_power(F,t)@x+sum((np.linalg.matrix_power(F,t-1-j)@noise[j] for j in range(t)),np.zeros(2)) for t in range(len(noise)+1)]
        return [np.array(states).tolist(),(np.array(states)@p['sensor']+p['measurement_noise']).tolist()]
    if slug=='observability':
        matrix=np.array([np.array(p['sensor'])@np.linalg.matrix_power(p['transition'],i) for i in range(p['horizon'])]).reshape(-1,2)
        return [matrix.tolist(),(matrix@p['initial']).tolist(),int(np.linalg.matrix_rank(matrix,tol=1e-10)) if len(matrix) else 0]
    if slug=='bayes-sequence':
        predictions=[];posteriors=[];evidence=[];previous=Fraction(1)
        for t in range(len(p['likelihoods'])):
            prefix=p['likelihoods'][:t+1]
            pred,_=enumerate_hmm(p['initial'],p['transition'],prefix[:-1]+[None])
            post,total=enumerate_hmm(p['initial'],p['transition'],prefix)
            predictions.append(pred[-1]);evidence.append(float(total/previous))
            if not total:return [predictions,posteriors,evidence,'impossible']
            posteriors.append(post[-1]);previous=total
        return [predictions,posteriors,evidence,'ok']
    if slug=='path-posterior':
        return enumerate_hmm(**p)[0][-1] if p['likelihoods'] else p['initial']
    if slug=='scalar-gaussian':
        m,P,y,R=p['prior_mean'],p['prior_variance'],p['observation'],p['noise_variance']
        if P==0:return [m,0.,0.]
        posterior_variance=1/(1/P+1/R)
        return [(m/P+y/R)*posterior_variance,posterior_variance,posterior_variance/R]
    if slug=='kalman-sequence':return joint_gaussian(p)
    if slug=='coverage':
        residual=np.subtract(p['truth'],p['means']);inside=np.abs(residual)<=p['z']*np.array(p['standard_deviations']);prob=float(np.mean(inside))
        return [float(np.linalg.norm(residual)/np.sqrt(len(residual))),prob,float(np.sqrt(prob*(1-prob)/len(residual)))]
    if slug=='extended-update':
        m,P,y,R=p['mean'],p['variance'],p['observation'],p['measurement_variance'];H=2*m
        variance=1/(1/P+H*H/R)
        return [(m/P+H*(y+m*m)/R)*variance,variance]
    if slug=='unscented-moments':
        m,P,R=p['mean'],p['variance'],p['measurement_variance']
        return [m*m+P,4*m*m*P+2*P*P+R,2*m*P]
    if slug=='importance-weights':
        log_ratio=np.subtract(p['log_target'],p['log_proposal']);prob=np.exp(log_ratio-log_ratio.max());prob/=prob.sum()
        return [prob.tolist(),float(prob@p['samples']),float(1/(prob@prob))]
    if slug=='particle-resampling':
        logs=np.array([-np.inf if w==0 or ll is None else np.log(w)+ll for w,ll in zip(p['weights'],p['log_likelihoods'])])
        if np.isneginf(logs).all():return [[],0.,[],[],'impossible']
        prob=np.exp(logs-logs.max());prob/=prob.sum();cdf=np.cumsum(prob);cdf[-1]=1
        idx=np.searchsorted(cdf,(p['offset']+np.arange(len(prob)))/len(prob),side='right')
        return [prob.tolist(),float(1/(prob@prob)),idx.tolist(),np.array(p['particles'])[idx].tolist(),'ok']
    if slug=='hmm-smoothing':return enumerate_hmm(**p)[0]
    if slug=='rts-backward':
        # Match each public saved-statistics fixture to its separately declared generative model.
        # Batch conditioning never uses the RTS formula or the solution under test.
        f=functions()['kalman_filter']
        for case in VERIFY['p07-kalman-sequence']['cases']:
            origin=case['arguments'];run=f(**origin)
            expected={k:run[k] for k in ['predicted_means','predicted_covariances','means','covariances']};expected['transition']=origin['transition']
            if expected==p:return joint_gaussian(origin,all_observations=True)
        raise AssertionError('RTS fixture has no independent source model')
    raise AssertionError(slug)

@pytest.mark.parametrize('question',[q for q in QUESTIONS if q['type']=='python'],ids=lambda q:q['slug'])
def test_all_estimation_vectors_have_independent_oracles(question):
    for case in VERIFY[question['id']]['cases']:
        actual=json.loads(json.dumps(independent(question['slug'][4:],case['arguments'])))
        assert difference(actual,case['expected'],question['tolerance']) is None,(question['id'],case)

def wrong_solution(question):
    slug=ALIASES.get(question['slug'][4:],question['slug'][4:]);source=SOLUTIONS[question['id']]
    mutations={
        'state-readings':('+value for row,value','+0 for row,value'),
        'observability':('rows.append(row);row=','rows.append(sensor);row='),
        'bayes-sequence':('prediction=posterior[:] if t==0 else','prediction=posterior[:] if True else'),
        'path-posterior':('if t:weight*=transition[path[t-1]][state]','if t:weight*=1'),
        'scalar-gaussian':('prior_variance/(prior_variance+noise_variance)','noise_variance/(prior_variance+noise_variance)'),
        'kalman-sequence':('if t:','if True:'),
        'coverage':('abs(x-m)<=z*s','abs(x-m)<z*s'),
        'extended-update':('derivative=2*mean','derivative=2'),
        'unscented-moments':('wc=[2.,.5,.5]','wc=[0.,.5,.5]'),
        'importance-weights':('scores=[a-b for a,b','scores=[a for a,b'),
        'particle-resampling':('math.log(w)+value','value'),
        'hmm-smoothing':('emission[j]*beta[j]','1*beta[j]'),
        'rts-backward':('predicted_covariances[t+1]','predicted_covariances[t]'),
    }
    before,after=mutations[slug];assert before in source
    return source.replace(before,after)

@pytest.mark.parametrize('question',[q for q in QUESTIONS if q['type']=='python'],ids=lambda q:q['slug'])
def test_real_estimation_judge_samples_full_and_conceptual_mistake(tmp_path,question):
    engine=PracticeEngine(tmp_path/'records')
    def submit(mode,source):
        result=engine.submit(dict(exercise_id=question['id'],exercise_version=question['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python')
        deadline=time.monotonic()+35
        while result['state']!='FINISHED' and time.monotonic()<deadline:
            time.sleep(.01);result=engine.get(result['id'])
        assert result['state']=='FINISHED'
        return result
    try:
        assert submit('samples',SOLUTIONS[question['id']])['verdict']=='AC'
        assert question['id'] not in engine.progress()['passed']
        assert submit('full',SOLUTIONS[question['id']])['verdict']=='AC'
        assert submit('full',wrong_solution(question))['verdict']=='WA'
    finally:engine.close()

def test_tagged_notebook_functions_against_independent_batch_models():
    f=functions()
    for case in VERIFY['p07-kalman-sequence']['cases']:
        p=case['arguments'];run=f['kalman_filter'](**p)
        expected=joint_gaussian(p)
        np.testing.assert_allclose(run['means'],expected[0],atol=1e-12)
        np.testing.assert_allclose(run['covariances'],expected[1],atol=1e-12)
        smoothed=f['rts_smooth'](p['transition'],*[run[k] for k in ['predicted_means','predicted_covariances','means','covariances']])
        batch=joint_gaussian(p,all_observations=True)
        np.testing.assert_allclose(smoothed['means'],batch[0],atol=1e-12)
        np.testing.assert_allclose(smoothed['covariances'],batch[1],atol=1e-12)
    for case in VERIFY['p07-hmm-smoothing']['cases']:
        np.testing.assert_allclose(f['hmm_smooth'](**case['arguments']),independent('hmm-smoothing',case['arguments']),atol=1e-12)

def test_gaussian_approximations_grid_refinement_and_symmetric_failure():
    f=functions()
    for m,P,R in [(0.,1.,.1),(.6,.8,.15),(-2.,.25,.3)]:
        result=f['nonlinear_update'](m,P,1.4,R,'ukf')
        np.testing.assert_allclose([result['observation_mean'],result['innovation_variance'],result['cross_covariance']],[m*m+P,4*m*m*P+2*P*P+R,2*m*P],atol=1e-12)
    result=f['nonlinear_update'](0,1,4,.1,'ekf');assert result['mean']==0 and result['variance']==1
    first=f['grid_update'](0,1,4,.1,count=4001)
    refined=f['grid_update'](0,1,4,.1,lower=-8,upper=8,count=16001)
    np.testing.assert_allclose(first[2:],refined[2:],atol=1e-9)
    assert first[3]>3

def test_online_prefix_missing_and_particle_degeneracy_are_explicit():
    f=functions();base=VERIFY['p07-kalman-sequence']['cases'][1]['arguments']
    changed=dict(base,observations=base['observations'][:2]+[99.,-99.])
    np.testing.assert_allclose(f['kalman_filter'](**base)['means'][:2],f['kalman_filter'](**changed)['means'][:2])
    assert f['hmm_filter']([1,0],[[1,0],[0,1]],[[0,1]])['status']=='impossible'
    assert f['particle_update']([0,1],[.5,.5],[None,None],.5)['status']=='impossible'
    assert f['particle_update']([0,1,2,3],[.25]*4,[0]*4,0)['indices']==[0,1,2,3]
    observations=[3.5,3.,2.8,2.1]
    one=f['bootstrap_filter'](1.8,.2,.04,.15,observations,100,719)
    two=f['bootstrap_filter'](1.8,.2,.04,.15,observations,100,719)
    assert one==two
    assert all(1-1e-9<=value<=100+1e-9 for value in one['ess'])

def test_estimation_capstone_four_layers_first_score_and_retry(tmp_path):
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items'])==8 and sum(i['points'] for i in spec['items'])==100
    assert [sum(i['points'] for i in spec['items'] if i['level']==level) for level in range(1,5)]==[20,30,30,20]
    engine=PracticeEngine(tmp_path/'records')
    try:
        rows=[]
        for index,item in enumerate(spec['items']):
            q=engine.questions[item['question_id']]
            rows.append(dict(id=str(index),created_at=f'2026-09-19T00:{index:02}:00+00:00',exercise_id=q['id'],exercise_version=q['version'],assessment_version='1',saved=True,state='FINISHED',mode='full',verdict='WA' if index==0 else 'AC'))
        result=summarize_assessments(engine.assessments,engine.questions,rows)['P07-SUMMARY']
        assert result['first_points']==90 and result['first_grade']=='基础环节待补齐'
        retry=dict(rows[0],id='retry',created_at='2026-09-19T02:00:00+00:00',verdict='AC')
        result=summarize_assessments(engine.assessments,engine.questions,[retry,*rows])['P07-SUMMARY']
        assert result['first_points']==90 and result['practice_points']==100 and result['complete']
    finally:engine.close()
