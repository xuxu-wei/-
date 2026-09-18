"""第 2 篇：高精度/闭式独立依据、实际 Notebook 函数与本机判题。"""
import ast
from decimal import Decimal, localcontext, ROUND_CEILING
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
from teaching_examples import example_view

BANK=ROOT/'exercises/02-系统随时间演化'
Q=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
V=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
S=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
CAT=json.loads((ROOT/'notebooks/02-系统随时间演化/catalog.json').read_text(encoding='utf-8'))
D=lambda x:Decimal(str(x))
normalize=lambda x:json.loads(json.dumps(x))


def exact_decimal(t,u,k,initial):
    with localcontext() as ctx:
        ctx.prec=400
        t,u,k,initial=map(D,(t,u,k,initial))
        return float(initial+u*t if k==0 else initial*(-k*t).exp()+u/k*(1-(-k*t).exp()))


def notebook_functions(lesson_id):
    entry=next(l for l in CAT if l['id']==lesson_id)
    book=json.loads((ROOT/entry['path']).read_text(encoding='utf-8'))
    namespace={'np':np,'math':math}
    for c in book['cells']:
        if c['cell_type']=='code' and 'model' in c.get('metadata',{}).get('tags',[]):
            tree=ast.parse(''.join(c['source']))
            assert all(isinstance(n,ast.FunctionDef) for n in tree.body)
            exec(compile(tree,entry['path'],'exec'),namespace)
    return namespace


def decimal_grid(bounds,h):
    bounds=list(map(D,bounds));h=D(h);values=[bounds[0]]
    for a,b in zip(bounds,bounds[1:]):
        steps=int(((b-a)/h-D('1e-12')).to_integral_value(rounding=ROUND_CEILING))
        values.extend([a+i*h for i in range(1,steps)]+[b])
    return values


def euler_closed(initial,u,k,h,steps):
    initial,u,k,h=map(D,(initial,u,k,h));q=1-k*h
    return [float(initial+n*h*u if k==0 else q**n*initial+h*u*sum(q**j for j in range(n))) for n in range(steps+1)]


def piecewise_independent(p):
    """Unrolled affine products for Euler; superposed exponentially weighted inputs for reference."""
    with localcontext() as ctx:
        ctx.prec=400
        bounds=list(map(D,p['bounds']));rates=list(map(D,p['rates']));k=D(p['k']);initial=D(p['A0'])
        times=decimal_grid(p['bounds'],p['h']);factors=[];inputs=[];amounts=[];reference=[]
        for index,t in enumerate(times):
            if index:
                left=times[index-1];j=next(j for j,(a,b) in enumerate(zip(bounds,bounds[1:])) if a<=left<b)
                factors.append(1-k*(t-left));inputs.append(rates[j]*(t-left))
            value=initial*math.prod(factors)+sum(v*math.prod(factors[i+1:]) for i,v in enumerate(inputs))
            amounts.append(float(value))
            ref=initial*(-k*t).exp()
            for a,b,u in zip(bounds,bounds[1:],rates):
                stop=min(t,b)
                if stop<=a:continue
                ref+=u*(stop-a) if k==0 else u/k*((-k*(t-stop)).exp()-(-k*(t-a)).exp())
            reference.append(float(ref))
        return [list(map(float,times)),amounts,reference]


def independent(slug,p):
    with localcontext() as ctx:
        ctx.prec=400
        if slug=='growth':return [float(D(p['initial'])*(D(p['factor'])**n if n else 1)) for n in range(p['steps']+1)]
        if slug=='euler-balance':return [euler_closed(p['A0'],p['u'],p['k'],p['h'],p['steps']),[0.0]*p['steps']]
        if slug=='varying-steps':
            fs=[1-D(p['k'])*D(h) for h in p['durations']];ins=[D(u)*D(h) for u,h in zip(p['rates'],p['durations'])]
            return [[float(D(p['A0'])*math.prod(fs[:n])+sum(ins[i]*math.prod(fs[i+1:n]) for i in range(n))) for n in range(len(fs)+1)],float(sum(ins))]
        if slug=='difference':return float(2*D(p['t'])+D(p['h']))
        if slug=='left-area':
            a,b,n=D(p['start']),D(p['end']),p['intervals']
            return float(b*b-a*a-(b-a)**2/n)
        if slug=='chain-rule':
            values=[(-D(p['k'])*D(t)).exp() for t in p['times']]
            return [list(map(float,values)),[float(-D(p['k'])*v) for v in values]]
        if slug=='exact':return [exact_decimal(t,p['u'],p['k'],p['A0']) for t in p['times']]
        if slug=='arrival':return [float(-(1-D(f)).ln()/D(p['k'])) for f in p['fractions']]
        if slug=='errors':
            return [max(abs(a-exact_decimal(D(i)*D(h),p['u'],p['k'],p['A0'])) for i,a in enumerate(euler_closed(p['A0'],p['u'],p['k'],h,round(p['end']/h)))) for h in p['step_sizes']]
        if slug=='orders':return [float((D(a)/D(b)).ln()/D(2).ln()) for a,b in zip(p['errors'],p['errors'][1:])]
        if slug=='step-properties':
            kh=D(p['k'])*D(p['h']);return [float(1-kh),0<kh<2,kh<=1]
        if slug=='first-decay':return [float(D(p['A0'])-D(p['A0'])*D(p['k'])*D(h)) for h in p['step_sizes']]
        if slug=='aligned-grid':return list(map(float,decimal_grid(p['bounds'],p['h'])))
        if slug=='piecewise':return piecewise_independent(p)
        if slug=='input-totals':return [float(sum((D(b)-D(a))*D(r) for a,b,r in zip(p['bounds'],p['bounds'][1:],rates))) for rates in p['plans']]
        if slug=='cap-integrated-balance':
            total=sum((D(b)-D(a))*D(r) for a,b,r in zip(p['bounds'],p['bounds'][1:],p['rates']))
            change=D(p['amounts'][-1])-D(p['amounts'][0])
            return list(map(float,[total,change,total-change]))
        if slug=='cap-feasible-plans':
            result=[]; k=D(p['k']); times=list(map(D,p['bounds']))
            for i,rates in enumerate(p['plans']):
                rates=list(map(D,rates));values=[]
                for t in times:
                    value=D(p['A0'])*(-k*t).exp()
                    for a,b,r in zip(times,times[1:],rates):
                        stop=min(t,b)
                        if stop>a:value+=r*(stop-a) if k==0 else r/k*((-k*(t-stop)).exp()-(-k*(t-a)).exp())
                    values.append(value)
                total=sum((b-a)*r for a,b,r in zip(times,times[1:],rates))
                if abs(total-D(p['required_total']))<=D('1e-9') and max(rates)<=D(p['max_rate'])+D('1e-9') and max(values)<=D(p['max_peak'])+D('1e-9'):result.append(i)
            return result
        if slug=='input-metrics':
            t,a,ref=piecewise_independent(p);_,fine,fr=piecewise_independent({**p,'h':p['h']/2})
            return [float(sum((D(b)-D(a))*D(r) for a,b,r in zip(p['bounds'],p['bounds'][1:],p['rates']))),max(ref),ref[-1],max(abs(x-y) for x,y in zip(a,ref)),max(abs(x-y) for x,y in zip(fine,fr))]
        raise AssertionError(slug)


@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_cases_and_samples_have_independent_math(q):
    for case in V[q['id']]['cases']:
        assert difference(independent(q['id'][4:],case['arguments']),case['expected'],q['tolerance']) is None,(q['id'],case)


@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_actual_subprocess_and_copyable_example(tmp_path,q):
    namespace={};exec(S[q['id']],namespace)
    view=example_view(q);exec(view['input']['code'],namespace);exec(view['output']['code'],namespace)
    assert difference(normalize(namespace['result']),normalize(namespace['expected_output']),q['tolerance']) is None
    engine=PracticeEngine(tmp_path/'learning')
    def submit(mode,source):
        result=engine.submit(dict(exercise_id=q['id'],exercise_version=q['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python')
        limit=time.monotonic()+15
        while result['state']!='FINISHED' and time.monotonic()<limit:time.sleep(.01);result=engine.get(result['id'])
        assert result['state']=='FINISHED'
        return result
    try:
        assert submit('samples',S[q['id']])['verdict']=='AC'
        assert q['id'] not in engine.progress()['passed']
        assert submit('full',S[q['id']])['verdict']=='AC'
        assert q['id'] in engine.progress()['passed']
        assert submit('full','def solve('+','.join(p['name'] for p in q['parameters'])+'):\n    return None')['verdict']=='WA'
    finally:engine.close()


@pytest.mark.parametrize('lesson',['P02-C03-S01','P02-C03-S02','P02-C04-S01','P02-C04-S02','P02-C04-S03','P02-SUMMARY'])
def test_notebook_analytic_implementations(lesson):
    f=notebook_functions(lesson)['exact_amount']
    for initial,u,k in [(0,1,.5),(10,0,.75),(2,1,.5),(3,2,0),(2,1,1e-14)]:
        for t in [0,.1,1,20]:assert math.isclose(f(t,u,k,initial),exact_decimal(t,u,k,initial),rel_tol=1e-12,abs_tol=1e-12)


def test_notebook_error_refinement_failure_and_piecewise():
    numeric=notebook_functions('P02-C04-S01')
    err=numeric['grid_errors'](0,1,.5,[.5,.25,.125],4)
    assert all(.8<p<1.2 for p in numeric['observed_orders'](err))
    stable=notebook_functions('P02-C04-S02')
    assert stable['first_decay'](10,.75,[1,2])==[2.5,-5]
    assert stable['step_properties'](.5,4)==(-1,False,False)
    for lesson in ['P02-C04-S03','P02-SUMMARY']:
        functions=notebook_functions(lesson)
        for p in [dict(A0=1,k=.5,bounds=[0,3,5],rates=[2,0],h=.8),dict(A0=3,k=0,bounds=[0,.6,1.2],rates=[0,2],h=.2)]:
            actual=normalize(functions['piecewise'](**p));expected=piecewise_independent(p)
            assert difference(actual,expected,dict(atol=1e-10,rtol=1e-10)) is None
            times,amounts,reference=actual
            assert all(b in times for b in p['bounds']) and all(b>a for a,b in zip(times,times[1:]))


def test_lesson_question_coverage_and_plain_objectives():
    for lesson in CAT:
        qs=[q for q in Q if q['lesson_id']==lesson['id']]
        assert len(qs)==(8 if lesson['chapter_id']=='2.summary' else 5 if lesson['chapter_id']=='2.4' else 4)
        book=json.loads((ROOT/lesson['path']).read_text(encoding='utf-8'))
        text=''.join(book['cells'][0]['source'])
        assert not any(x in text.replace('核验收支','核对收支') for x in ['安装','内核','网页安排','验收','样章','playground'])
        assert all(q['slug'] in ''.join(book['cells'][-1]['source']) for q in qs)
        assert 'samples/' not in json.dumps(book,ensure_ascii=False)
