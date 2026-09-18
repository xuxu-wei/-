"""Part 3: independent matrix-series/rational checks, saved notebook code and local judging."""
import ast
from decimal import Decimal, localcontext
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
from practice import PracticeEngine, difference

BANK=ROOT/'exercises/03-多变量相互作用'
Q=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
V=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
S=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
CAT=json.loads((ROOT/'notebooks/03-多变量相互作用/catalog.json').read_text(encoding='utf-8'))
D=lambda x:Decimal(str(x))
normalize=lambda x:json.loads(json.dumps(x))

def notebook_functions(lesson):
    entry=next(l for l in CAT if l['id']==lesson)
    book=json.loads((ROOT/entry['path']).read_text(encoding='utf-8'))
    namespace={'np':np,'math':math}
    for c in book['cells']:
        if c['cell_type']=='code' and 'model' in c.get('metadata',{}).get('tags',[]):
            tree=ast.parse(''.join(c['source']))
            assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
            exec(compile(tree,entry['path'],'exec'),namespace)
    return namespace

def exp_action(matrix,initial,t):
    """High precision matrix power series, independent of authored modal formulas."""
    with localcontext() as ctx:
        ctx.prec=100
        m=[[D(x)*D(t) for x in row] for row in matrix]
        term=list(map(D,initial));result=term.copy()
        for n in range(1,700):
            term=[sum(m[i][j]*term[j] for j in range(2))/n for i in range(2)]
            result=[x+y for x,y in zip(result,term)]
            if max(map(abs,term))<D('1e-75'):break
        else:raise AssertionError('series did not converge')
        return list(map(float,result))

def matrix(a,b,c=0):return [[-a-c,b],[a,-b]]

def local_reference(p):
    """Decimal Euler oracle in absolute coordinates with an independently derived affine term."""
    with localcontext() as ctx:
        ctx.prec=70
        a,b,u,v,k,h=[D(p[x]) for x in ['a','b','u','v','K','h']]
        star=u*k/(v-u);second=a*star/b
        slope=v*k/(k+star)**2
        constant=u-v*star/(k+star)+slope*star
        original=[list(map(D,p['initial']))];linear=[original[0].copy()]
        for _ in range(p['steps']):
            x,y=original[-1];r,s=linear[-1]
            transfer=a*x-b*y
            original.append([x+h*(u-transfer-v*x/(k+x)),y+h*transfer])
            linear.append([r+h*(constant-(a+slope)*r+b*s),s+h*(a*r-b*s)])
        gap=max(abs(x-y) for row,ref in zip(original,linear) for x,y in zip(row,ref))
        return [[[float(x) for x in row] for row in original],[[float(x) for x in row] for row in linear],float(gap)]

def independent(slug,p):
    if slug in {'exchange-balance','open-equilibrium','integrated-balance'}:
        a,b,c,u=[D(p[x]) for x in ['a','b','c','u']];m=matrix(a,b,c)
        if slug=='exchange-balance':
            state=list(map(D,p['amounts']));rates=[sum(row[j]*state[j] for j in range(2))+(u if i==0 else 0) for i,row in enumerate(m)]
            return [[list(map(float,row)) for row in m],list(map(float,rates)),float(u-c*state[0])]
        # Cramer's rule instead of the authored mass-balance elimination.
        det=m[0][0]*m[1][1]-m[0][1]*m[1][0]
        eq=[float(-u*m[1][1]/det),float(u*m[1][0]/det)]
        return eq if slug=='open-equilibrium' else [[[float(x) for x in row] for row in m],eq,[eq[0]/p['volume1'],eq[1]/p['volume2']]]
    if slug=='projection':
        x=np.array(p['vector'],float);d=np.array(p['direction'],float)
        unit=d/np.linalg.norm(d);projected=(x@unit)*unit
        return [float(x@d),float(np.linalg.norm(x)),projected.tolist(),(x-projected).tolist()]
    if slug=='state-output':
        return [(np.array(p['matrix'])@p['state']+np.array(p['input_vector'])*p['inflow']).tolist(),float(np.dot(p['output_vector'],p['state'])+p['direct']*p['inflow'])]
    if slug in {'symmetric-modes','cap-modes'}:
        a,c=p['a'],p['c'];m=[[-a-c,a],[a,-a-c]]
        states=[exp_action(m,p['initial'],t) for t in p['times']]
        coefficients=np.linalg.solve([[1,1],[1,-1]],p['initial']).tolist()
        result=[[-c,-2*a-c],coefficients,states]
        if slug=='cap-modes':
            contributions=[]
            for t in p['times']:
                modal=[]
                for scale,direction in zip(coefficients,[[1,1],[1,-1]]):
                    evolved=exp_action(m,[scale*x for x in direction],t)
                    modal.append(float(np.dot(evolved,p['weights'])))
                contributions.append(modal)
            result.append(contributions)
        return result
    if slug in {'damped','jordan'}:
        if slug=='damped':
            a,w=p['alpha'],p['omega'];m=[[-a,-w],[w,-a]]
            return [[[-a,w],[-a,-w]],[exp_action(m,p['initial'],t) for t in p['times']]]
        m=[[-p['rate'],p['coupling']],[0,-p['rate']]]
        return [exp_action(m,p['initial'],t) for t in p['times']]
    if slug=='scaled-field':
        original=np.array(p['points'])@np.array(p['matrix']).T;scaled=original*p['multiplier']
        return [original.tolist(),scaled.tolist(),np.linalg.norm(scaled,axis=1).tolist()]
    if slug in {'closed-state','cap-phase'}:
        a,b=p['a'],p['b'];multiplier=p.get('multiplier',1)
        m=np.array(matrix(a,b))*multiplier
        states=[exp_action(m.tolist(),p['initial'],t) for t in p['times']]
        if slug=='closed-state':return states
        # Solve the exchange constraint with the independently fixed total.
        eq=np.linalg.solve([[a,-b],[1,1]],[0,sum(p['initial'])]).tolist()
        return [(m@p['initial']).tolist(),eq,states]
    if slug=='jacobian':
        a,b,v,k,x,e=[D(p[name]) for name in ['a','b','v','K']]+[D(p['state'][0]),D(p['epsilon'])]
        slope=v*k/(k+x)**2
        error=v*k/((k+x)**2-e*e)-slope
        return [[[-float(a+slope),float(b)],[float(a),-float(b)]],float(error)]
    if slug=='chain-rate':return [p['state'],float(np.dot(p['state'],p['rates']))]
    if slug=='local-trajectories':return local_reference(p)
    if slug=='cap-local':
        a,b,u,v,k=[D(p[x]) for x in ['a','b','u','v','K']];star=u*k/(v-u)
        m=[[-float(a+v*k/(k+star)**2),float(b)],[float(a),-float(b)]]
        errors=[];grid=[]
        for initial in p['initials']:
            common={k:v for k,v in p.items() if k!='initials'};common['initial']=initial
            coarse,linear,error=local_reference(common)
            fine,fl,_=local_reference({**common,'h':p['h']/2,'steps':p['steps']*2})
            errors.append(error)
            grid.append(max(float(np.max(abs(np.array(coarse)-np.array(fine)[::2]))),float(np.max(abs(np.array(linear)-np.array(fl)[::2])))))
        return [m,errors,grid]
    raise AssertionError(slug)

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_test_vectors_against_independent_math(q):
    for case in V[q['id']]['cases']:
        assert difference(independent(q['slug'][4:],case['arguments']),case['expected'],q['tolerance']) is None,q['id']

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_full_judge_and_wrong_answers(tmp_path,q):
    engine=PracticeEngine(tmp_path/'learning')
    def submit(mode,source):
        attempt=engine.submit(dict(exercise_id=q['id'],exercise_version=q['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python')
        limit=time.monotonic()+20
        while attempt['state']!='FINISHED' and time.monotonic()<limit:
            time.sleep(.01);attempt=engine.get(attempt['id'])
        assert attempt['state']=='FINISHED'
        return attempt
    try:
        assert submit('samples',S[q['id']])['verdict']=='AC'
        assert q['id'] not in engine.progress()['passed']
        assert submit('full',S[q['id']])['verdict']=='AC'
        assert q['id'] in engine.progress()['passed']
        wrong='def solve('+','.join(p['name'] for p in q['parameters'])+'):\n    return None'
        assert submit('full',wrong)['verdict']=='WA'
    finally:engine.close()

def test_actual_notebook_functions_and_boundaries():
    exchange=notebook_functions('P03-C01-S01')['simulate_exchange']
    for a,b,c,u in [(.2,.1,0,0),(.2,.1,.1,.6),(0,0,0,1),(.2,0,.1,0)]:
        scalar,vector,ledger=exchange(a,b,c,u,[6,0],.05,100)
        np.testing.assert_allclose(scalar,vector,atol=1e-12)
        np.testing.assert_allclose(vector.sum(axis=1),ledger,atol=1e-12)
    closed=notebook_functions('P03-C03-S02')['closed_state']
    for a,b in [(0,0),(0,.3),(.3,0),(.2,.1),(1e-12,.3)]:
        times=[0,1e-12,1,20]
        values=closed(a,b,[0,6],times)
        np.testing.assert_allclose(values,[exp_action(matrix(a,b),[0,6],t) for t in times],atol=1e-12)
        assert np.min(values)>=0
    modes=notebook_functions('P03-C02-S02')['symmetric_modes']
    for initial in [[6,0],[2,2],[0,0]]:
        result=modes(.2,.1,initial,[0,2])
        np.testing.assert_allclose(result[2],[exp_action([[-.3,.2],[.2,-.3]],initial,t) for t in [0,2]],atol=1e-12)
    local=notebook_functions('P03-C04-S02')['local_comparison']
    for initial in [[2,4],[2.2,4],[5,4]]:
        p=dict(initial=initial,a=.2,b=.1,u=.5,v=1,K=2,h=.02,steps=100)
        actual=normalize(local(**p));expected=local_reference(p)
        assert difference(actual,expected,dict(atol=1e-12,rtol=1e-10)) is None

def test_capstone_coverage():
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items'])==8 and sum(i['points'] for i in spec['items'])==100
    assert {i['objective'] for i in spec['items']}=={'T1','T2','T3','T4'}
    assert [q['id'] for q in Q if q['lesson_id']=='P03-SUMMARY']==[i['question_id'] for i in spec['items']]
