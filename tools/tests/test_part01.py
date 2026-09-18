"""正式第 1 篇：独立数值依据、题目契约与真实子进程判题。"""
import ast
from fractions import Fraction
from functools import cache
from itertools import groupby
import json
from pathlib import Path
import shutil
import sys

import pytest

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools'))
from course_content import notebooks, question_banks
from practice import PracticeEngine, difference
from teaching_examples import example_view
from test_practice import payload, completed

BANK=ROOT/'exercises/01-看见系统'
QUESTIONS=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
SOLUTIONS=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
VERIFICATION=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
normalize=lambda x:json.loads(json.dumps(x))


@pytest.fixture
def engine(tmp_path):
    engine=PracticeEngine(tmp_path/'learning')
    yield engine
    engine.close()


@pytest.mark.parametrize('q',[q for q in QUESTIONS if q['type']=='python'],ids=lambda q:q['slug'])
def test_formal_code_judging_and_copyable_samples(engine,q):
    view=example_view(q);namespace={}
    exec(SOLUTIONS[q['id']],namespace)
    exec(view['input']['code'],namespace);exec(view['output']['code'],namespace)
    assert difference(normalize(namespace['result']),normalize(namespace['expected_output']),q['tolerance']) is None
    assert view['input']['tables'][0]['rows'] and view['output']['tables'][0]['rows']
    assert 'payload' not in q['starter_code']+view['input']['code']
    sample=completed(engine,engine.submit(payload(engine,q['id'],SOLUTIONS[q['id']],mode='samples'),'python'))
    assert sample['verdict']=='AC' and q['id'] not in engine.progress()['passed']
    result=completed(engine,engine.submit(payload(engine,q['id'],SOLUTIONS[q['id']]),'python'))
    assert result['verdict']=='AC' and result['saved']
    wrong=completed(engine,engine.submit(payload(engine,q['id'],'def solve('+','.join(p['name'] for p in q['parameters'])+'):\n    return None'),'python'))
    assert wrong['verdict']=='WA'


def independent(id,p):
    if id=='calibrate':return [y-p['offset'] for y in p['readings']]
    if id=='time-units':return [[float(Fraction(str(t))*Fraction(str(p['factor']))) for t in p['times']],p['amounts']]
    if id=='concentration':return [float(Fraction(str(a))/Fraction(str(v))) for a,v in zip(p['amounts'],p['volumes'])]
    if id=='balance':return [p['initial']+sum(h*(u-v) for h,u,v in zip(p['durations'][:n],p['inflows'][:n],p['outflows'][:n])) for n in range(len(p['durations'])+1)]
    if id=='infer-outflow':return p['duration']*p['inflow']-(p['final']-p['initial'])
    if id=='two-rooms':
        prefixes=range(len(p['incoming'])+1)
        return [[p['first']+sum(p['incoming'][:n])-sum(p['transferred'][:n]) for n in prefixes],
                [p['second']+sum(p['transferred'][:n])-sum(p['outgoing'][:n]) for n in prefixes],
                [p['first']+p['second']+sum(p['incoming'][:n])-sum(p['outgoing'][:n]) for n in prefixes]]
    if id=='loop-sign':return -1 if p['signs'].count(-1)%2 else 1
    if id=='delayed-response':
        history=dict(zip(range(-p['delay'],1),map(lambda x:Fraction(str(x)),p['history'])))
        @cache
        def value(t):return history[t] if t<=0 else value(t-1)-Fraction(str(p['gain']))*value(t-1-p['delay'])
        path=[float(value(t)) for t in range(p['steps']+1)]
        return [path,max(map(abs,path)),independent('turn-count',{'values':path})]
    if id=='turn-count':
        signs=[b>a for a,b in zip(p['values'],p['values'][1:]) if abs(b-a)>1e-12]
        return max(0,len(list(groupby(signs)))-1)
    if id=='compare-rules':return [[p['initial']-i*p['fixed'] for i in range(p['steps']+1)],[p['initial']*(1-p['fraction'])**i for i in range(p['steps']+1)]]
    if id=='first-failure':
        n=p['initial']//p['fixed']+1 if p['fixed'] else p['steps']+1
        return n if n<=p['steps'] else -1
    if id=='separation':return [i for i,a in enumerate(p['initials']) if abs((a-p['fixed'])-a*(1-p['fraction']))>p['threshold']]
    if id=='cap-count':return [p['initial']+sum(p['entered'][:n])+sum(p['born'][:n])-sum(p['left'][:n]) for n in range(len(p['born'])+1)]
    if id=='cap-calibrated-balance':
        f=lambda x:Fraction(str(x))
        return [float((f(a)-f(b))/f(p['gain'])+f(u)-f(v)+f(g))
                for a,b,u,v,g in zip(p['readings'],p['readings'][1:],p['entered'],p['left'],p['born'])]
    if id=='cap-predictions':
        first,second=[],[]
        for a in p['initials']:
            x,y=a,a
            for _ in range(p['steps']):x-=p['fixed'];y*=1-p['fraction']
            first.append(x);second.append(y)
        return [first,second]
    raise AssertionError('缺少独立核验：'+id)


def test_verification_has_independent_numeric_basis():
    for q in QUESTIONS:
        if q['type']!='python':continue
        for c in VERIFICATION[q['id']]['cases']:
            result=independent(q['id'][4:],c['arguments'])
            assert difference(normalize(result),c['expected'],q['tolerance']) is None,(q['id'],c,result)


def test_formal_progress_restores_and_is_scoped_to_its_part(tmp_path):
    directory=tmp_path/'learning';engine=PracticeEngine(directory)
    engine.submit(payload(engine,'p02-step-factor'),'choice')
    assert not set(engine.progress()['passed']) & {q['id'] for q in QUESTIONS}
    engine.submit(payload(engine,'p01-boundary'),'choice')
    bad=completed(engine,engine.submit(payload(engine,'p01-calibrate','def solve(:\n pass'),'python'))
    assert bad['verdict']=='CE' and bad['result']['traceback'] and 'p01-calibrate' not in engine.progress()['passed']
    engine.close();engine=PracticeEngine(directory)
    try:
        assert engine.progress()['passed']==['p01-boundary','p02-step-factor']
        engine.questions['p01-boundary']['version']='2'
        assert engine.progress()['passed']==['p02-step-factor']
    finally:engine.close()


def test_formal_content_can_be_discovered_without_any_sample(tmp_path):
    for folder in ['notebooks','exercises']:
        shutil.copytree(ROOT/folder/'01-看见系统',tmp_path/folder/'01-看见系统')
    assert len(notebooks(tmp_path))==9
    qs,answers=question_banks(tmp_path)
    assert len(qs)==41 and set(answers)=={q['id'] for q in qs}
    for lesson in notebooks(tmp_path):
        nb=json.loads((tmp_path/lesson['path']).read_text(encoding='utf-8'))
        assert 'samples/' not in json.dumps(nb,ensure_ascii=False)


def test_formal_lesson_contracts_and_navigation():
    from lesson_exercises import render_exercises
    from assessment import load_assessments
    import nbformat
    course=json.loads((ROOT/'web/course/catalog.json').read_text(encoding='utf-8'))['parts'][0]
    assessments=load_assessments(question_banks()[0])
    for chapter in [*course['chapters'],course['assessment']]:
        for lesson in chapter['lessons']:
            nb=nbformat.read(ROOT/lesson['path'],as_version=4)
            goal=nb.cells[0].source
            assert nb.cells[0].metadata['teaching_role']=='objectives'
            assert all(word not in goal for word in ['网页','内核','安装','验收','playground','未实现'])
            qs=[q for q in QUESTIONS if q['lesson_id']==lesson['id']]
            assert len(qs)==8 if chapter.get('assessment') else 3<=len(qs)<=5
            assert nb.cells[-1].source.startswith(render_exercises(lesson['id'],QUESTIONS,chapter['url']+'practice/',assessments.get(lesson['id'])))
            assert all(q['slug'] in nb.cells[-1].source for q in qs)
            for cell in nb.cells:
                if cell.cell_type=='code':ast.parse(cell.source)
