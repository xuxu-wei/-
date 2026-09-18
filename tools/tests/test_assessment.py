"""综合成绩的独立记录汇总、失分诊断和历史保护。"""
import copy
import json
from pathlib import Path
import sys

import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from assessment import grade, load_assessments, summarize_assessments
from course_content import question_banks
from practice import PracticeEngine
from test_practice import payload, completed

QUESTIONS=question_banks()[0]
Q={q['id']:q for q in QUESTIONS}
SPECS=load_assessments(QUESTIONS)
LESSON='P01-SUMMARY'


def record(item,number,**changes):
    q=Q[item['question_id']]
    return dict(id=f'{number:04}',created_at=f'2026-09-18T00:{number:02}:00+00:00',
        exercise_id=q['id'],exercise_version=q['version'],saved=True,state='FINISHED',
        mode='full',verdict='AC',assessment_version='1',**changes)


def summary(records,**kwargs):
    return summarize_assessments(SPECS,Q,records,**kwargs)[LESSON]


def test_scoring_has_only_capstones_and_no_double_counted_objectives():
    for spec in SPECS.values():
        assert len(spec['items'])==8
        result=summarize_assessments(SPECS,Q,[])[spec['lesson_id']]
        assert result['first_grade'] is None and not result['complete']
        assert sum(o['points'] for o in result['objectives'])==100
        assert [l['points'] for l in result['levels']]==[20,30,30,20]
        assert all(Q[i['question_id']]['chapter'].endswith('.summary') for i in spec['items'])


def test_first_and_practice_scores_are_different_and_order_independent():
    rows=[record(item,i) for i,item in enumerate(SPECS[LESSON]['items'])]
    rows[0]['verdict']='WA'
    first=summary(rows)
    assert first['first_points']==90 and first['first_grade']=='基础环节待补齐'
    retry=record(SPECS[LESSON]['items'][0],20)
    final=summary([retry,*reversed(rows)])
    assert final['first_points']==90 and final['practice_points']==100
    assert final['first_grade']=='基础环节待补齐' and final['practice_grade']=='综合表现扎实'
    assert final['complete'] and final['review']==[]
    rows[1]['verdict']='WA'
    assert summary(rows)['review'][0]==SPECS[LESSON]['items'][0]['question_id']


def test_first_attempt_compares_actual_time_across_timezone_offsets():
    item=SPECS[LESSON]['items'][0]
    first=record(item,1);first.update(created_at='2026-09-18T08:00:00+08:00',verdict='WA')
    later=record(item,2);later.update(created_at='2026-09-18T00:01:00+00:00')
    assert summary([later,first])['first_points']==0


@pytest.mark.parametrize('change',[{'mode':'samples'},{'verdict':'SYSTEM_ERROR'}, {'verdict':'CANCELLED'},
    {'verdict':'INTERRUPTED'},{'saved':False},{'state':'RUNNING'},{'exercise_version':'old'}])
def test_invalid_results_do_not_consume_first_attempt(change):
    item=SPECS[LESSON]['items'][0]
    bad=record(item,0);bad.update(change)
    good=record(item,1)
    value=summary([bad,good])
    assert value['first_points']==10 and value['attempted']==1
    assert value['items'][0]['first_attempt_id']==good['id']


@pytest.mark.parametrize('verdict',['WA','CE','RE','TLE','OLE'])
def test_answer_failures_count_zero_without_partial_test_credit(verdict):
    item=SPECS[LESSON]['items'][2]
    fail=record(item,0);fail.update(verdict=verdict,result={'passed':99,'total':100})
    result=summary([fail,record(item,1)])
    assert result['first_points']==0 and result['practice_points']==15
    assert result['attempted']==1 and result['first_grade'] is None


def test_corrupt_history_suppresses_complete_grade_and_legacy_is_explicit():
    rows=[record(item,i) for i,item in enumerate(SPECS[LESSON]['items'])]
    rows[0].pop('assessment_version')
    before=copy.deepcopy(rows)
    result=summary(rows,incomplete=True)
    assert result['practice_points']==100 and result['first_grade'] is None
    assert result['practice_grade'] is None and not result['complete']
    assert result['historical_first'] and rows==before


def test_grade_boundaries_and_basic_gate():
    for score,expected in [(59,'需巩固基础'),(60,'基本达标'),(79,'基本达标'),(80,'掌握良好'),(89,'掌握良好'),(90,'综合表现扎实'),(100,'综合表现扎实')]:
        assert grade(score,[20,30,30,20])==expected
    assert grade(90,[10,30,30,20])=='基础环节待补齐'
    assert grade(70,[20,0,30,20])=='基础环节待补齐'


def test_real_choice_retry_restart_and_chapter_isolation(tmp_path):
    engine=PracticeEngine(tmp_path/'learning')
    try:
        bad=engine.submit(payload(engine,'p01-cap-boundary',selected=['B']),'choice')
        request=payload(engine,'p01-cap-boundary')
        good=engine.submit(request,'choice')
        engine.submit(request,'choice')
        engine.submit(payload(engine,'p01-boundary'),'choice')
        value=engine.progress()['assessments'][LESSON]
        assert value['first_points']==0 and value['practice_points']==10
        assert value['items'][0]['attempt_count']==2
        assert 'assessment' not in engine.question('p01-boundary')
        before={p.name:p.read_bytes() for p in engine.attempts.glob('*.json')}
    finally:engine.close()
    engine=PracticeEngine(tmp_path/'learning')
    try:
        assert engine.progress()['assessments'][LESSON]==value
        assert before=={p.name:p.read_bytes() for p in engine.attempts.glob('*.json')}
        assert engine.get(bad['id'])['verdict']=='WA' and engine.get(good['id'])['verdict']=='AC'
    finally:engine.close()


def test_new_transfer_question_rejects_only_final_amount_and_missing_calibration(tmp_path):
    engine=PracticeEngine(tmp_path/'learning')
    try:
        wrong={
            'p01-cap-calibrated-balance':'def solve(readings, gain, offset, entered, left, born):\n return [readings[i]+entered[i]-left[i]+born[i]-readings[i+1] for i in range(len(entered))]',
            'p02-cap-feasible-plans':'def solve(bounds, plans, k, A0, required_total, max_rate, max_peak):\n return list(range(len(plans)))',
        }
        for id,source in wrong.items():
            assert completed(engine,engine.submit(payload(engine,id,source),'python'))['verdict']=='WA'
        path=next((ROOT/'exercises').glob('02-*/solutions.json'))
        solution=json.loads(path.read_text(encoding='utf-8'))['p02-cap-feasible-plans']
        for source in [solution.replace('peak = max(peak, amount)','peak = amount'),solution.replace('amount, peak = A0, A0','amount, peak = A0, 0')]:
            assert completed(engine,engine.submit(payload(engine,'p02-cap-feasible-plans',source),'python'))['verdict']=='WA'
        assert not engine.progress()['assessments'][LESSON]['practice_points']
    finally:engine.close()


def test_invalid_record_time_preserves_file_and_marks_scores_incomplete(tmp_path):
    engine=PracticeEngine(tmp_path/'learning')
    result=engine.submit(payload(engine,'p01-cap-boundary'),'choice')
    path=engine.attempts/f'{result["id"]}.json'
    engine.close()
    data=json.loads(path.read_text(encoding='utf-8'));data['created_at']='not a date'
    path.write_text(json.dumps(data),encoding='utf-8');before=path.read_bytes()
    engine=PracticeEngine(tmp_path/'learning')
    try:
        value=engine.progress()['assessments'][LESSON]
        assert value['incomplete'] and value['first_grade'] is None
        assert path.read_bytes()==before
    finally:engine.close()
