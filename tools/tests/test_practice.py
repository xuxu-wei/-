import copy
import json
import math
from pathlib import Path
import sys
import time
import uuid

import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from practice import PracticeEngine, RequestError
from test_models import notebook_functions, decimal_reference


@pytest.fixture
def engine(tmp_path):
    instance=PracticeEngine(tmp_path/'learning')
    yield instance
    instance.close()


def payload(engine,id,source=None,mode='full',request_id=None,selected=None):
    q=engine.questions[id]
    result=dict(exercise_id=id,exercise_version=q['version'],request_id=request_id or str(uuid.uuid4()))
    if q['type']=='choice':result['selected']=selected or engine.verification[id]['correct']
    else:result.update(source=source,mode=mode)
    return result


def completed(engine,record):
    deadline=time.monotonic()+10
    while record['state']!='FINISHED' and time.monotonic()<deadline:
        time.sleep(.02);record=engine.get(record['id'])
    assert record['state']=='FINISHED',record
    return record


SOLUTIONS=json.loads((ROOT/'exercises/samples/accumulation-clearance/solutions.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('id',list(SOLUTIONS))
def test_correct_code_runs_in_new_process_and_only_full_submission_counts(engine,id):
    sample=completed(engine,engine.submit(payload(engine,id,SOLUTIONS[id],mode='samples'),'python'))
    assert sample['verdict']=='AC',sample
    assert id not in engine.progress()['passed']
    result=completed(engine,engine.submit(payload(engine,id,SOLUTIONS[id]),'python'))
    assert result['verdict']=='AC',result
    assert id in engine.progress()['passed'] and result['saved']
    assert json.loads((engine.attempts/f'{result["id"]}.json').read_text(encoding='utf-8'))['source']==SOLUTIONS[id]


def test_choice_answers_explanations_and_duplicate_request(engine):
    for id,q in engine.questions.items():
        if q['type']!='choice':continue
        request=payload(engine,id)
        result=engine.submit(request,'choice')
        assert result['verdict']=='AC' and len(result['result']['explanations'])==len(q['options'])
        assert engine.submit(request,'choice')['id']==result['id']
        wrong=next(o['id'] for o in q['options'] if o['id'] not in engine.verification[id]['correct'])
        changed={**request,'selected':[wrong]}
        with pytest.raises(RequestError) as error:engine.submit(changed,'choice')
        assert error.value.status==409
        changed['request_id']=str(uuid.uuid4())
        assert engine.submit(changed,'choice')['verdict']=='WA'


def test_progress_distinguishes_valid_attempts_versions_and_interruption(engine):
    engine.submit(payload(engine,'S01-E1',selected=['B']),'choice')
    progress=engine.progress()
    assert progress['started']==['S01-E1'] and not progress['passed']
    assert progress['scope']=='sample:accumulation-clearance'
    sample=completed(engine,engine.submit(payload(engine,'S01-E2',SOLUTIONS['S01-E2'],mode='samples'),'python'))
    assert sample['verdict']=='AC' and 'S01-E2' in engine.progress()['started'] and 'S01-E2' not in engine.progress()['passed']
    engine.questions['S01-E1']['version']='2'
    assert 'S01-E1' not in engine.progress()['started']
    for record in engine.records.values():record['verdict']='CANCELLED'
    assert not engine.progress()['started'] and not engine.progress()['passed']


@pytest.mark.parametrize('source,verdict',[
 ('def solve(A0, durations, inflows, outflows):\n return [0]','WA'),
 ('def solve(:\n pass','CE'),
 ('def solve(A0, durations, inflows, outflows):\n raise ValueError("请检查输入")','RE'),
 ('def solve(A0, durations, inflows, outflows):\n return [float("nan")]','RE'),
 ('def solve(A0, durations, inflows, outflows):\n while True: pass','TLE'),
 ('def solve(A0, durations, inflows, outflows):\n print("x"*300000)\n return []','OLE'),
])
def test_bad_solutions_have_meaningful_results_and_free_slot(engine,source,verdict):
    if verdict=='TLE':engine.questions['S01-E2']['limits']['seconds']=.3
    record=completed(engine,engine.submit(payload(engine,'S01-E2',source),'python'))
    assert record['verdict']==verdict,record
    assert engine.active is None and engine.process is None
    assert engine.progress()['passed']==[]


def test_busy_cancel_recovery_and_fresh_state(engine):
    record=engine.submit(payload(engine,'S01-E2','def solve(A0, durations, inflows, outflows):\n while True: pass'),'python')
    with pytest.raises(RequestError) as error:engine.submit(payload(engine,'S01-E2',SOLUTIONS['S01-E2']),'python')
    assert error.value.payload['code']=='BUSY'
    assert engine.cancel(record['id'])['verdict']=='CANCELLED'
    answer=completed(engine,engine.submit(payload(engine,'S01-E2',SOLUTIONS['S01-E2']),'python'))
    assert answer['verdict']=='AC'


def test_records_restore_and_corruption_is_visible(tmp_path):
    directory=tmp_path/'learning';first=PracticeEngine(directory)
    request=payload(first,'S01-E1');id=first.submit(request,'choice')['id'];first.close()
    path=directory/'attempts'/f'{id}.json'
    record=json.loads(path.read_text(encoding='utf-8'));record['state']='RUNNING';path.write_text(json.dumps(record),encoding='utf-8')
    (directory/'attempts'/'bad.json').write_text('{broken',encoding='utf-8')
    second=PracticeEngine(directory)
    try:
        assert second.get(id)['verdict']=='INTERRUPTED'
        assert second.progress()['incomplete'] and second.progress()['passed']==[]
        with pytest.raises(RuntimeError):PracticeEngine(directory)
    finally:second.close()


def test_save_failure_does_not_create_false_progress(engine,monkeypatch):
    def fail(record):raise OSError('disk unavailable')
    monkeypatch.setattr(engine,'_save',fail)
    with pytest.raises(RequestError) as error:engine.submit(payload(engine,'S01-E1'),'choice')
    assert error.value.status==503 and engine.progress()['passed']==[]


def test_public_question_does_not_embed_answers(engine):
    for id in engine.questions:
        public=engine.question(id)
        assert not {'correct','explanations','cases','solution'} & public.keys()


def test_finished_result_write_failure_is_not_counted(engine,monkeypatch):
    save=engine._save
    def fail_on_finish(record):
        if record['state']=='FINISHED':raise OSError('disk unavailable')
        save(record)
    monkeypatch.setattr(engine,'_save',fail_on_finish)
    record=completed(engine,engine.submit(payload(engine,'S01-E2',SOLUTIONS['S01-E2']),'python'))
    assert record['verdict']=='SYSTEM_ERROR' and not record['saved'] and engine.progress()['passed']==[]


def test_stale_version_and_incorrect_return_shape(engine):
    request=payload(engine,'S01-E1');request['exercise_version']='old'
    with pytest.raises(RequestError) as error:engine.submit(request,'choice')
    assert error.value.payload['code']=='VERSION_CONFLICT'
    record=completed(engine,engine.submit(payload(engine,'S01-E2','def solve(A0, durations, inflows, outflows):\n return {"unexpected": 1}'),'python'))
    assert record['verdict']=='WA' and '列表' in record['result']['cases'][0]['difference']


def test_verification_vectors_against_independent_math_and_notebook_algorithms(engine):
    numerical=notebook_functions('05-numerical-checks.ipynb')
    piecewise=notebook_functions('06-transfer-experiment.ipynb')['piecewise_experiment']
    from practice import difference
    for id,verification in engine.verification.items():
        for case in verification.get('cases',[]):
            p=case['arguments'];expected=case['expected']
            if id=='S01-E2':
                result={'amounts':[p['A0']+sum(t*(u-q) for t,u,q in zip(p['durations'][:i],p['inflows'][:i],p['outflows'][:i])) for i in range(len(p['durations'])+1)]}
            elif id in ('S02-E2','S05-E2'):
                def discrete(h):
                    return [p['A0']+p['u']*h*i if p['k']==0 else p['u']/p['k']+(p['A0']-p['u']/p['k'])*(1-p['k']*h)**i for i in range(p['steps']+1)]
                result={'amounts':discrete(p['h'])} if id=='S02-E2' else {'first':[discrete(h)[1] for h in p['hs']],'minimum':[min(discrete(h)) for h in p['hs']]}
            elif id=='S03-E2':
                result={'inputs':[k*p['target'] for k in p['ks']], 'first_times':[(1 if k*p['h']==1 else math.ceil(math.log1p(-p['fraction'])/math.log1p(-k*p['h'])-1e-12))*p['h'] for k in p['ks']]}
            elif id=='S04-E2':
                result={'amounts':[decimal_reference(t,p['u'],p['k'],p['A0']) for t in p['times']]}
            elif id=='S05-E3':
                h=p['start_h']
                while True:
                    t,a=numerical['euler'](u=p['u'],k=p['k'],A0=p['A0'],h=h,duration=p['end'])
                    error=float(max(abs(a-numerical['exact_amount'](t,p['u'],p['k'],p['A0']))))
                    if error<p['tol']:break
                    h/=2
                result={'h':h,'steps':len(t)-1,'error':error}
            elif id=='S06-E2':
                amount=p['A0']
                for left,right,u in zip(p['bounds'][:-1],p['bounds'][1:],p['rates']):amount=decimal_reference(right-left,u,p['k'],amount)
                result={'total_input':sum((b-a)*u for a,b,u in zip(p['bounds'][:-1],p['bounds'][1:],p['rates'])),'final':amount}
            else:
                t,a,exact,*_=piecewise(p['bounds'],p['rates'],k=p['k'],A0=p['A0'],h=p['h'])
                result={'times':t.tolist(),'amounts':a.tolist(),'exact':exact.tolist(),'max_error':float(max(abs(a-exact)))}
            names=[field['name'] for field in engine.questions[id]['returns']]
            result=result[names[0]] if len(names)==1 else [result[name] for name in names]
            assert difference(expected,result,{'atol':1e-8,'rtol':1e-7}) is None,id


def test_old_wrapper_receives_an_explanatory_signature_error(engine):
    record=completed(engine,engine.submit(payload(engine,'S01-E2','def solve(payload):\n return []'),'python'))
    assert record['verdict']=='RE'
    assert '函数参数与题面不一致' in record['message']
    assert 'A0: float' in record['message'] and 'durations: list[float]' in record['message']


@pytest.mark.parametrize('source,verdict,line,needle',[
    ('def solve(A0, durations, inflows, outflows)\n    return []','CE',1,'SyntaxError'),
    ('def solve(A0, durations, inflows, outflows):\nreturn []','CE',2,'IndentationError'),
    ('def solve(A0, durations, inflows, outflows):\n    return 1 / 0','RE',2,'ZeroDivisionError'),
    ('def helper():\n    raise ValueError("检查计算")\ndef solve(A0, durations, inflows, outflows):\n    return helper()','RE',2,'ValueError'),
])
def test_errors_include_traceback_source_and_reliable_line(engine,source,verdict,line,needle):
    record=completed(engine,engine.submit(payload(engine,'S01-E2',source),'python'))
    assert record['verdict']==verdict
    result=record['result']
    assert result['line']==line and result['traceback']
    assert 'File "answer.py"' in result['traceback'] and needle in result['traceback']
    assert source.splitlines()[line-1].strip() in result['traceback']
    assert 'practice_worker.py' not in result['traceback']
    if verdict=='CE' and needle=='SyntaxError':assert '^' in result['traceback']
    saved=json.loads((engine.attempts/f'{record["id"]}.json').read_text(encoding='utf-8'))
    assert saved['result']['traceback']==result['traceback']


def test_chained_exception_keeps_both_learner_failures(engine):
    source='def solve(A0, durations, inflows, outflows):\n    try:\n        return 1 / 0\n    except ZeroDivisionError as cause:\n        raise ValueError("分母需要检查") from cause'
    record=completed(engine,engine.submit(payload(engine,'S01-E2',source),'python'))
    trace=record['result']['traceback']
    assert 'ZeroDivisionError' in trace and 'ValueError: 分母需要检查' in trace
    assert 'return 1 / 0' in trace and 'raise ValueError' in trace


def test_named_arguments_do_not_depend_on_json_key_order(engine):
    q=engine.questions['S01-E2']
    q['samples'][0]['arguments']=dict(reversed(list(q['samples'][0]['arguments'].items())))
    result=completed(engine,engine.submit(payload(engine,q['id'],SOLUTIONS[q['id']],mode='samples'),'python'))
    assert result['verdict']=='AC'


def test_previous_python_version_records_remain_readable_but_do_not_count(tmp_path):
    directory=tmp_path/'learning'
    old=PracticeEngine(directory)
    old.questions['S01-E2']['version']='1'
    record=completed(old,old.submit(payload(old,'S01-E2',SOLUTIONS['S01-E2']),'python'))
    assert record['verdict']=='AC'
    old.close()
    current=PracticeEngine(directory)
    try:
        assert current.get(record['id'])['exercise_version']=='1'
        assert 'S01-E2' not in current.progress()['passed']
        with pytest.raises(RequestError) as error:
            current.submit({**payload(current,'S01-E2',SOLUTIONS['S01-E2']),'exercise_version':'1'},'python')
        assert error.value.status==409
    finally:current.close()
