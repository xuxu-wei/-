"""Independent probability identities, exact boundaries and the actual local judge."""
import ast
from fractions import Fraction as F
import itertools
import json
import math
from pathlib import Path
import sys
import time
import uuid
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools'))
from practice import PracticeEngine,difference
BANK=ROOT/'exercises/05-随机性与信息'
Q=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
V=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
S=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
CAT=json.loads((ROOT/'notebooks/05-随机性与信息/catalog.json').read_text(encoding='utf-8'))

def notebook_functions():
    scope={'np':np,'math':math}
    for lesson in CAT:
        book=json.loads((ROOT/lesson['path']).read_text(encoding='utf-8'))
        for c in book['cells']:
            if c['cell_type']=='code' and 'model' in c.get('metadata',{}).get('tags',[]):
                tree=ast.parse(''.join(c['source']))
                assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
                exec(compile(tree,lesson['path'],'exec'),scope)
    return scope

def fraction(x):return F(str(x))
def entropy(p):return math.fsum(-x*math.log2(x) for x in p if x>0)
def info_identity(counts):
    p=np.array(counts,dtype=float);p/=p.sum()
    hx=entropy(p.sum(axis=1));hy=entropy(p.sum(axis=0))
    return [hx,hy,hx+hy-entropy(p.ravel())]
def gaussian_batch(p):
    m0,P=map(fraction,[p['prior_mean'],p['prior_variance']])
    results=[]
    for n in range(len(p['observations'])+1):
        precision=1/P+sum(1/fraction(r) for r in p['noise_variances'][:n])
        weighted=m0/P+sum(fraction(y)/fraction(r) for y,r in zip(p['observations'][:n],p['noise_variances'][:n]))
        results.append([float(weighted/precision),float(1/precision)])
    return list(map(list,zip(*results)))

def independent(slug,p):
    if slug=='uniform-area':
        lo,hi,left,right=[fraction(p[x]) for x in ['low','high','left','right']]
        cdf=lambda x:max(F(0),min(F(1),(x-lo)/(hi-lo)))
        return float(cdf(right)-cdf(left))
    if slug=='frequencies':
        f=[F(sum(g),len(g)) for g in p['groups']]
        return [list(map(float,f)),float(sum(f)/len(f)),float(F(sum(map(sum,p['groups'])),sum(map(len,p['groups']))))]
    if slug=='moments':
        x=list(map(fraction,p['values']));pr=list(map(fraction,p['probabilities']))
        mu=sum(a*b for a,b in zip(x,pr));second=sum(a*a*b for a,b in zip(x,pr))
        return list(map(float,[mu,second-mu*mu]))
    if slug=='covariance':
        x=np.array(p['xs']);y=np.array(p['ys'])
        return [float(x.mean()),float(y.mean()),float(x.var()),float(y.var()),float(np.mean(x*y)-x.mean()*y.mean())]
    if slug in {'variance-path','cap-variance'}:
        a,q,p0=map(fraction,[p['a'],p['process_variance'],p['initial_variance']])
        values=[float(a**(2*n)*p0+q*sum(a**(2*j) for j in range(n))) for n in range(p['steps']+1)]
        return [values,[v+p['measurement_variance'] for v in values]] if slug=='cap-variance' else values
    if slug in {'bayes','cap-bayes'}:
        weights=[fraction(x)*fraction(y) for x,y in zip(p['prior'],p['likelihood'])]
        return [float(w/sum(weights)) for w in weights] if sum(weights)>0 else None
    if slug=='normal-update':return gaussian_batch(p)
    if slug=='prior-sensitivity':
        results=[gaussian_batch(dict(prior_mean=m,prior_variance=v,observations=p['observations'],noise_variances=p['noise_variances'])) for m,v in zip(p['prior_means'],p['prior_variances'])]
        m=[x[0][-1] for x in results];v=[x[1][-1] for x in results]
        return [m,v,max(m)-min(m)]
    if slug in {'propagation','cap-propagation'}:
        matrix=np.array(p['matrix']);initial=np.array(p['initial'])
        return [(initial@np.linalg.matrix_power(matrix,n)).tolist() for n in range(p['steps']+1)]
    if slug=='path':
        state=p['initial_state'];values=[state]
        for u in p['uniforms']:
            state=min(int(np.searchsorted(np.cumsum(p['matrix'][state]),u,side='right')),len(p['matrix'])-1);values.append(state)
        return values
    if slug=='stationary':
        a,b=p['alpha'],p['beta']
        if a+b==0:return None
        return np.linalg.solve([[a,-b],[1,1]],[0,1]).tolist()
    if slug=='walk':
        # Binomial distribution, enumerated over success counts; no recursive moment formula.
        prob,d=p['probability'],p['step_size'];means=[];variances=[]
        for n in range(p['steps']+1):
            xs=[(2*k-n)*d for k in range(n+1)]
            ps=[math.comb(n,k)*prob**k*(1-prob)**(n-k) for k in range(n+1)]
            mu=math.fsum(x*q for x,q in zip(xs,ps));means.append(mu)
            variances.append(math.fsum(q*(x-mu)**2 for x,q in zip(xs,ps)))
        return [means,variances]
    if slug=='information':return info_identity(p['counts'])
    if slug=='bin-pairs':return np.histogram2d(p['xs'],p['ys'],bins=[p['edges'],p['edges']])[0].astype(int).tolist()
    if slug=='cap-summary':
        m=[float(np.mean(g)) for g in p['groups']]
        return [m,float(np.mean(m)),float(np.var(m,ddof=1))]
    if slug=='cap-bins':return [info_identity(p['coarse_counts']),info_identity(p['fine_counts'])]
    raise AssertionError(slug)

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_vectors_against_independent_oracles(q):
    for case in V[q['id']]['cases']:
        assert difference(independent(q['slug'][4:],case['arguments']),case['expected'],q['tolerance']) is None,(q['id'],case)

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_local_judge_samples_full_and_wrong(tmp_path,q):
    engine=PracticeEngine(tmp_path/'learning')
    def submit(mode,source):
        a=engine.submit(dict(exercise_id=q['id'],exercise_version=q['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python');limit=time.monotonic()+25
        while a['state']!='FINISHED' and time.monotonic()<limit:time.sleep(.01);a=engine.get(a['id'])
        assert a['state']=='FINISHED'
        return a
    try:
        assert submit('samples',S[q['id']])['verdict']=='AC'
        assert q['id'] not in engine.progress()['passed']
        assert submit('full',S[q['id']])['verdict']=='AC'
        assert q['id'] in engine.progress()['passed']
        bad='def solve('+','.join(p['name'] for p in q['parameters'])+'):\n    return "incorrect"'
        assert submit('full',bad)['verdict']=='WA'
    finally:engine.close()

def test_actual_notebook_functions_and_probability_boundaries():
    f=notebook_functions()
    assert f['stationary_two'](0,0) is None
    np.testing.assert_allclose(f['propagate']([[0,1],[1,0]],[1,0],4),[[1,0],[0,1],[1,0],[0,1],[1,0]])
    assert f['discrete_update']([1,0],[0,1]) is None
    assert f['path_from_uniforms']([[0,1],[1,0]],0,[0,0])==[0,1,0]
    assert f['normal_updates'](2,.5,[],[])==([2],[.5])
    for a in [-1,-.5,0,.8,1]:
        np.testing.assert_allclose(f['variance_path'](a,.04,.3,10),independent('variance-path',dict(a=a,process_variance=.04,initial_variance=.3,steps=10)))
    for cells in itertools.product(range(3),repeat=4):
        if not sum(cells):continue
        counts=np.array(cells).reshape(2,2).tolist();got=f['information'](counts)
        np.testing.assert_allclose(got,info_identity(counts),atol=1e-12)
        assert -1e-12<=got[2]<=min(got[:2])+1e-12
    assert f['demonstration_uniforms'](0,2)==[1013904223/2**32,1196435762/2**32]

def test_repetition_uses_new_streams_not_restarted_seed():
    root=5203;streams=np.random.SeedSequence(root).spawn(200)
    samples=np.array([np.random.Generator(np.random.PCG64(s)).normal(size=100) for s in streams])
    assert len({row.tobytes() for row in samples})==200
    means=samples.mean(axis=1)
    assert abs(means.mean())<5/math.sqrt(200*100)
    assert abs(means.var(ddof=1)-.01)<5*.01*math.sqrt(2/199)

def test_capstone_coverage():
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items'])==8 and sum(x['points'] for x in spec['items'])==100
    assert {x['objective'] for x in spec['items']}=={'T1','T2','T3','T4'}
    assert [q['id'] for q in Q if q['lesson_id']=='P05-SUMMARY']==[x['question_id'] for x in spec['items']]
