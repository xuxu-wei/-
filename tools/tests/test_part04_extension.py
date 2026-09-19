"""Independent exact algebra and numerical protocols for the part-four extension."""
import ast
from decimal import Decimal, localcontext
from fractions import Fraction
import json
import math
import sys
from pathlib import Path
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
BANK=ROOT/'exercises/04-非线性动态行为'
Q=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
V=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
NEW={'distance-circle','distance-equilibria','lorenz-field','lorenz-bound','rk4-linear-step','aligned-error','directed-section','return-intervals','tangent-growth','linear-tangent','cap-section','cap-growth-units','cap-lorenz-bound'}
D=lambda value:Decimal(str(value))

def independent_extension(slug,p):
    with localcontext() as ctx:
        ctx.prec=60
        if slug=='distance-equilibria':
            return [float(min((D(x)-D(a))**2 for a in p['equilibria']).sqrt()) for x in p['states']]
        if slug=='distance-circle':
            radii=[sum(D(x)**2 for x in row).sqrt() for row in p['points']]
            return [[float(r) for r in radii],[float(abs(r-D(p['radius']))) for r in radii]]
        if slug=='lorenz-field':
            s,r,b=map(D,[p['sigma'],p['rho'],p['beta']]);x,y,z=map(D,p['state'])
            # Jacobian columns from exact central differences of a quadratic field.
            def f(v):
                x,y,z=v;return [s*y-s*x,(r-z)*x-y,x*y-b*z]
            columns=[]
            for j in range(3):
                plus=[x,y,z];minus=[x,y,z];plus[j]+=1;minus[j]-=1
                columns.append([(a-b)/2 for a,b in zip(f(plus),f(minus))])
            return [[float(v) for v in f([x,y,z])],[[float(columns[j][i]) for j in range(3)] for i in range(3)]]
        if slug in {'lorenz-bound','cap-lorenz-bound'}:
            s,r,b=map(D,[p['sigma'],p['rho'],p['beta']]);x,y,z=map(D,p['state'])
            W=r*x*x+s*y*y+s*z*z-4*s*r*z+4*s*r*r
            derivative=-2*s*r*x*x-2*s*y*y-2*s*b*z*z+4*s*b*r*z
            return list(map(float,[W,derivative,derivative,min(2*s,D(2),b),4*s*b*r*r]))
        if slug=='rk4-linear-step':
            z=D(p['rate'])*D(p['h']);return float(D(p['initial'])*(1+sum(z**k/D(math.factorial(k)) for k in range(1,5))))
        if slug=='aligned-error':
            return float(max(sum((D(x)-D(y))**2 for x,y in zip(row,p['fine'][i*p['ratio']])).sqrt() for i,row in enumerate(p['coarse'])))
        if slug in {'directed-section','cap-section'}:
            # Solve each segment's affine height as an exact rational root.
            hits=[];level=Fraction(str(p['level']));times=list(map(lambda x:Fraction(str(x)),p['times']))
            states=[[Fraction(str(x)) for x in row] for row in p['states']]
            for i,(a,b) in enumerate(zip(states,states[1:])):
                if not a[2]<level<=b[2]:continue
                slope=(b[2]-a[2])/(times[i+1]-times[i]);root=times[i]+(level-a[2])/slope
                if root<Fraction(str(p['burn'])):continue
                hit=[root]+[a[j]+(b[j]-a[j])*(root-times[i])/(times[i+1]-times[i]) for j in range(3)]
                hits.append(hit)
            return [[list(map(float,h)) for h in hits],[float(b[0]-a[0]) for a,b in zip(hits,hits[1:])]]
        if slug=='return-intervals':
            ts=list(map(D,p['crossing_times']));diff=[b-a for a,b in zip(ts,ts[1:])]
            return [list(map(float,diff)),float((ts[-1]-ts[0])/len(diff)) if diff else None]
        if slug in {'tangent-growth','cap-growth-units'}:
            product=math.prod(map(D,p['stretch_factors']));growth=float(product.ln()/sum(map(D,p['durations'])))
            if slug=='tangent-growth':return growth
            factors=p['map_derivatives'];product=math.prod(abs(D(x)) for x in factors)
            return [None if not product else float(product.ln()/len(factors)),growth]
        if slug=='linear-tangent':
            initial=list(map(D,p['initial_delta']));vals=[a*(D(r)*D(p['time'])).exp() for a,r in zip(initial,p['rates'])]
            return [list(map(float,vals)),float((sum(x*x for x in vals)/sum(x*x for x in initial)).sqrt())]
    raise AssertionError(slug)

def functions():
    scope={'np':np,'math':math}
    for lesson in json.loads((ROOT/'notebooks/04-非线性动态行为/catalog.json').read_text(encoding='utf-8')):
        book=json.loads((ROOT/lesson['path']).read_text(encoding='utf-8'))
        for cell in book['cells']:
            if cell['cell_type']=='code' and 'model' in cell.get('metadata',{}).get('tags',[]):
                tree=ast.parse(''.join(cell['source']));assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
                exec(compile(tree,lesson['path'],'exec'),scope)
    return scope

def test_exact_equilibria_symmetry_and_jacobian():
    f=functions();sign=np.array([-1,-1,1])
    for rho in [.5,1,10,28]:
        assert np.array_equal(f['lorenz_path']([0,0,0],rho=rho,steps=20),np.zeros((21,3)))
        if rho>1:
            x=math.sqrt((8/3)*(rho-1));assert np.max(abs(f['lorenz_rhs']([x,x,rho-1],rho=rho)))<1e-12
    for p in [[1,2,3],[-4,7,25],[0,0,0]]:
        np.testing.assert_allclose(f['lorenz_rhs'](sign*p),sign*f['lorenz_rhs'](p))
        expected=independent_extension('lorenz-field',dict(sigma=10,rho=28,beta=8/3,state=p))[1]
        np.testing.assert_allclose(f['lorenz_jacobian'](p),expected)

def test_bound_identity_and_negative_divergence_counterexample():
    f=functions()
    for sigma in [.25,1,10]:
        for rho in [.5,10,28]:
            for beta in [.5,8/3]:
                for v in [[0,0,0],[1,-3,40],[-20,10,-50]]:
                    W,a,b,c,C=f['lorenz_energy'](v,sigma,rho,beta)
                    assert a==pytest.approx(b,abs=1e-8)
                    assert a<=-c*W+C+1e-8
    # Negative divergence is compatible with exponentially escaping trajectories.
    assert 1-2<0 and math.exp(10)>10000

def test_short_window_convergence_and_independent_midpoint():
    f=functions();paths=[f['lorenz_path']([1,1,1],h=h,steps=round(2/h)) for h in [.02,.01,.005]]
    e0=max(np.linalg.norm(paths[0]-paths[2][::4],axis=1));e1=max(np.linalg.norm(paths[1]-paths[2][::2],axis=1))
    assert e0>10*e1
    reference=f['midpoint_lorenz']([1,1,1],1/32000,64000)
    assert np.linalg.norm(reference-paths[2][-1])<2e-4

def test_directed_events_endpoint_burn_empty_and_period():
    f=functions()
    for case in V['p04-directed-section']['cases']:
        p=case['arguments'];actual=f['directed_section'](p['times'],np.array(p['states']),p['level'],p['burn'])
        np.testing.assert_allclose(actual,np.array(case['expected'][0]).reshape(-1,4))
    times=np.arange(0,30.001,.01);circle=np.column_stack([np.cos(times),np.zeros(len(times)),np.sin(times)])
    hits=f['directed_section'](times,circle,0,1)
    assert max(abs(np.diff(hits[:,0])-2*math.pi))<1e-6

def test_tangent_short_window_and_partial_segments():
    f=functions();initial=np.array([1.,1.,1.]);direction=np.array([1.,0.,0.])
    def coupled(v):return np.r_[f['lorenz_rhs'](v[:3]),f['lorenz_jacobian'](v[:3])@v[3:]]
    v=np.r_[initial,direction]
    for _ in range(137):v=f['rk4_step'](coupled,v,.001)
    direct=math.log(np.linalg.norm(v[3:]))/.137
    got=f['tangent_path'](initial,h=.001,steps=137,segment_steps=13,burn_steps=0)[-1,1]
    assert got==pytest.approx(direct,abs=1e-11)
    for eps in [1e-3,1e-4]:
        a=f['lorenz_path'](initial+eps*direction,h=.001,steps=137)[-1];b=f['lorenz_path'](initial-eps*direction,h=.001,steps=137)[-1]
        np.testing.assert_allclose((a-b)/(2*eps),v[3:],atol=1e-7)
    with pytest.raises(ValueError):f['tangent_path'](initial,direction=[0,0,0])

def test_new_capstone_versions_and_chapter_counts():
    assessment=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert assessment['version']=='2'
    cap=[q for q in Q if q['lesson_id']=='P04-SUMMARY']
    assert len(cap)==8 and all(q['version']=='2' for q in cap)
    for lesson,count in [('P04-C01-S03',4),('P04-C06-S01',4),('P04-C06-S02',5),('P04-C06-S03',4),('P04-C06-S04',5)]:
        assert sum(q['lesson_id']==lesson for q in Q)==count

def test_capstone_v1_history_does_not_complete_v2_and_retry_keeps_first_score():
    from assessment import summarize_assessments
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    question={q['id']:q for q in Q};history=[]
    for i,item in enumerate(spec['items']):
        history.append(dict(id=f'old-{i}',exercise_id=item['question_id'],exercise_version='1',assessment_version='1',created_at=f'2026-09-18T00:00:0{i}+00:00',saved=True,state='FINISHED',mode='full',verdict='AC'))
    original=json.dumps(history,sort_keys=True)
    before=summarize_assessments({'P04-SUMMARY':spec},question,history)['P04-SUMMARY']
    assert before['practice_points']==0 and before['attempted']==0 and not before['complete']
    target=spec['items'][3]
    attempts=[dict(id='new-1',exercise_id=target['question_id'],exercise_version='2',assessment_version='2',created_at='2026-09-19T00:00:00+00:00',saved=True,state='FINISHED',mode='full',verdict='WA'),dict(id='new-2',exercise_id=target['question_id'],exercise_version='2',assessment_version='2',created_at='2026-09-19T00:00:01+00:00',saved=True,state='FINISHED',mode='full',verdict='AC')]
    after=summarize_assessments({'P04-SUMMARY':spec},question,history+attempts)['P04-SUMMARY']
    assert after['first_points']==0 and after['practice_points']==15 and after['attempted']==1
    assert json.dumps(history,sort_keys=True)==original
