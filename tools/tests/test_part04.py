"""Independent nonlinear references, boundary counterexamples and real local judging."""
import ast
from decimal import Decimal, localcontext, Context, ROUND_HALF_EVEN
from fractions import Fraction
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
BANK=ROOT/'exercises/04-非线性动态行为'
Q=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
V=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
S=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
CAT=json.loads((ROOT/'notebooks/04-非线性动态行为/catalog.json').read_text(encoding='utf-8'))
D=lambda x:Decimal(str(x))

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

def midpoint_polynomial(x,b,h):
    """Expanded one-step polynomial evaluated at 70-digit precision."""
    f=x+b-x**3
    return x+h*f+h*h*f*(1-3*x*x)/2-3*x*h**3*f*f/4-h**4*f**3/8

def finite_midpoint(initial,bias,h,steps):
    x,b,dt=map(D,[initial,bias,h])
    for _ in range(steps):x=midpoint_polynomial(x,b,dt)
    return float(x)

def binary_path(r,x,steps):
    """Exact rational arithmetic with binary64 rounding after each specified operation.

    Sensitive trajectories require an arithmetic oracle, not an arbitrary longer-precision
    trajectory. Separate tests check model invariants and exact periodic orbits.
    """
    r=Fraction(float(r));x=float(x);out=[x]
    for _ in range(steps):
        first=Fraction(float(r*Fraction(x)))
        second=Fraction(float(1-Fraction(x)))
        x=float(first*second);out.append(x)
    return out

def rk4_radial(mu,omega,initial,times):
    def f(z):
        x,y=z;s=x*x+y*y
        return np.array([mu*x-omega*y-s*x,omega*x+mu*y-s*y])
    result=[]
    for t in times:
        steps=max(1,math.ceil(t/.001));dt=t/steps;z=np.array(initial,dtype=float)
        for _ in range(steps):
            a=f(z);b=f(z+dt*a/2);c=f(z+dt*b/2);d=f(z+dt*c)
            z+=dt*(a+2*b+2*c+d)/6
        result.append(z.tolist())
    return result

def independent(slug,p):
    if slug=='switch-exact':
        x=D(p['initial'])
        return [float(x) if x==0 else float((1 if x>0 else -1)/(1+(1/(x*x)-1)*(-2*D(t)).exp()).sqrt()) for t in p['times']]
    if slug in {'basin-window','cap-basins'}:
        out=[finite_midpoint(x,0,p['h'],p['steps']) for x in p['initials']]
        return [out,[int(x>p['threshold'])-int(x< -p['threshold']) for x in out]]
    if slug=='midpoint-step':return finite_midpoint(p['state'],p['bias'],p['h'],1)
    if slug=='radial-solution':return rk4_radial(**p)
    if slug=='peak-period':
        # Manually derived peak indices for plateau/end-point/truncation cases.
        indices={(0,1,0,-1,0,1,0,-1,0):[1,5],(0,1,1,0,0):[],(9,0,2,0,-2,0,2,0):[2,6],(0,0,0):[]}[tuple(p['values'])]
        peaks=[float(D(i)*D(p['dt'])) for i in indices]
        tail=list(map(D,p['values'][p['start']:]))
        return [float((max(tail)-min(tail))/2),peaks,None if len(peaks)<2 else float(np.mean(np.diff(peaks))) ]
    if slug in {'crossing-period','cap-period'}:
        # Exact fractional index roots of the piecewise linear interpolant.
        roots={((-1,1,-1,1),0):[Fraction(1,2),Fraction(5,2)],((-1,0,0,1,0,-1,1),0):[Fraction(2),Fraction(11,2)],((1,2,1),0):[],((-1,1,-1,1),2):[Fraction(5,2)],((9,-1,1,-1,1),1):[Fraction(3,2),Fraction(7,2)],((0,0,1,0,-1,0,1),0):[Fraction(1),Fraction(5)],((1,1,1),0):[] }[(tuple(p['values']),p['start'])]
        times=[float(r*Fraction(str(p['dt']))) for r in roots]
        return [times,None if len(times)<2 else float(np.mean(np.diff(times)))]
    if slug=='fold-locations':
        a=D(p['a']);x=(a/3).sqrt()
        return [[float(-x),float(x)],[float(2*a*x/3),float(-2*a*x/3)]]
    if slug=='bias-continuation':
        x=D(p['initial']);out=[]
        for b in p['biases']:
            if not p['carry']:x=D(p['initial'])
            for _ in range(p['steps']):x=midpoint_polynomial(x,D(b),D(p['h']))
            out.append(float(x))
        return out
    if slug=='hopf-branch':return [[float(D(mu).sqrt()) if mu>0 else 0 for mu in p['mus']],[math.tau/p['omega'] if mu>0 else None for mu in p['mus']]]
    if slug=='logistic-iterate':return binary_path(p['r'],p['initial'],p['steps'])
    if slug=='prediction-horizon':
        a=binary_path(p['r'],p['first'],p['steps']);b=binary_path(p['r'],p['second'],p['steps'])
        d=[abs(x-y) for x,y in zip(a,b)];indices=np.flatnonzero(np.array(d)>p['threshold'])
        return [d,int(indices[0]) if len(indices) else None]
    if slug=='finite-growth':
        path=binary_path(p['r'],p['initial'],p['burn']+p['steps'])
        rates=[abs(p['r']*(1-2*x)) for x in path[p['burn']:-1]]
        return None if 0 in rates else math.fsum(map(math.log,rates))/p['steps']
    if slug=='local-energy':
        x=list(map(D,p['points']))
        return [[float(v*v/2) for v in x],[float(v*v*(v-1)*(v+1)) for v in x],[0<abs(v)<1 for v in x]]
    if slug=='rotating-energy':
        norm=[sum(D(z)**2 for z in xy) for xy in p['points']]
        return [[float(s/2) for s in norm],[float(-D(p['alpha'])*s) for s in norm]]
    if slug=='cap-precision':
        c=Context(prec=p['precision'],rounding=ROUND_HALF_EVEN);r=D(p['r_text']);a,b=map(D,[p['first_text'],p['second_text']]);dec=[float(c.copy_abs(c.subtract(a,b)))];one=D(1)
        for _ in range(p['steps']):
            a=c.multiply(c.multiply(r,a),c.subtract(one,a));b=c.multiply(c.multiply(r,b),c.subtract(one,b));dec.append(float(c.copy_abs(c.subtract(a,b))))
        paths=[binary_path(p['r_text'],s,p['steps']) for s in [p['first_text'],p['second_text']]]
        binary=[abs(x-y) for x,y in zip(*paths)]
        hits=[]
        for ds in [binary,dec]:
            ids=np.flatnonzero(np.array(ds)>p['threshold']);hits.append(int(ids[0]) if len(ids) else None)
        return [binary,dec,*hits]
    if slug=='cap-region':
        points=np.array(p['points']);s=np.sum(points**2,axis=1);d=np.einsum('ij,j,ij->i',points,[-p['a'], -p['b']],points)+s*s
        return [(s/2).tolist(),d.tolist(),((s>0)&(s<p['radius']**2)&(d<0)).tolist(),p['radius']**2<=min(p['a'],p['b'])]
    raise AssertionError(slug)

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_vectors_against_independent_oracles(q):
    with localcontext() as ctx:
        ctx.prec=70
        for case in V[q['id']]['cases']:
            expected=independent(q['slug'][4:],case['arguments'])
            assert difference(expected,case['expected'],q['tolerance']) is None,(q['id'],case['arguments'])

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_full_judge_and_wrong_answers(tmp_path,q):
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
        wrong='def solve('+','.join(p['name'] for p in q['parameters'])+'):\n    return "incorrect"'
        assert submit('full',wrong)['verdict']=='WA'
    finally:engine.close()

def test_notebook_model_invariants_and_accuracy():
    f=notebook_functions()
    for x in [-1.4,-.2,0,.2,1.4]:
        exact=f['switch_exact'](x,[0,2])[-1];errors=[]
        for h in [.1,.05,.025]:errors.append(abs(f['switch_path'](x,0,h,round(2/h))[-1]-exact))
        if x:assert errors[0]>3*errors[1]>9*errors[2]
    for mu in [-.2,0,.5]:
        expected=rk4_radial(mu,1,[.3,.4],[0,2,8])
        np.testing.assert_allclose(f['radial_exact'](mu,1,[.3,.4],[0,2,8]),expected,atol=2e-10)
    for r in [0,1,2,3.2,3.9,4]:
        for x in [0,.2,.5,1]:assert all(0<=v<=1 for v in f['logistic_path'](r,x,300))
    # r=4 has a closed trigonometric conjugacy, checked before float errors amplify.
    for theta in [.11,.27,.43]:
        got=f['logistic_path'](4,math.sin(math.pi*theta)**2,8)
        np.testing.assert_allclose(got,[math.sin(math.pi*theta*2**n)**2 for n in range(9)],atol=2e-13)
    assert f['finite_growth'](4,.5,0,10) is None
    assert f['finite_growth'](4,.5,2,10)==pytest.approx(math.log(4)) # expanding fixed orbit, not chaos proof
    assert f['quadratic_energy']([[3,4]],0,2)==([12.5],[0])
    assert f['regional_energy']([[0,0],[1,0]],1,2,1)[2:]==([False,False],True)

def test_scan_resolution_and_dwell_are_separate():
    f=notebook_functions();biases=np.arange(-.6,.6001,.02).tolist()
    coarse=np.array(f['scan_bias'](biases,-1.5,.02,2000,True))
    fine=np.array(f['scan_bias'](biases,-1.5,.01,4000,True))
    long=np.array(f['scan_bias'](biases,-1.5,.02,4000,True))
    assert np.max(abs(coarse-fine))<1e-5
    assert biases[int(np.flatnonzero(coarse>0)[0])]==pytest.approx(.4)
    assert biases[int(np.flatnonzero(long>0)[0])]==pytest.approx(.4)
    assert .38<2/(3*math.sqrt(3))<.4

def test_capstone_coverage():
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items'])==8 and sum(i['points'] for i in spec['items'])==100
    assert {i['objective'] for i in spec['items']}=={'T1','T2','T3','T4'}
    assert [q['id'] for q in Q if q['lesson_id']=='P04-SUMMARY']==[i['question_id'] for i in spec['items']]
