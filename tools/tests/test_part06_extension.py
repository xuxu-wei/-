"""RLS extension: augmented least squares, covariance, online clock and version isolation."""
from fractions import Fraction
import json
from pathlib import Path
import re
import sys

import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from assessment import summarize_assessments
from practice import PracticeEngine, difference

BANK=ROOT/'exercises/06-从测量走向模型'
QUESTIONS=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
SOLUTIONS=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))
VERIFICATION=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))


def batch_prefixes(p):
    """Solve an independently assembled augmented weighted design by least squares."""
    initial=np.array(p['initial_parameters']); dimension=len(initial)
    information=np.linalg.solve(np.array(p['initial_inverse']),np.eye(dimension))
    root=np.linalg.cholesky(information).T
    design=np.array(p['regressors']); observed=np.array(p['observed'])
    forgetting=p['forgetting']; predictions=[]; parameters=[]; inverses=[]
    previous=initial
    for count in range(1,len(observed)+1):
        predictions.append(float(design[count-1]@previous))
        square_weights=forgetting**(np.arange(count-1,-1,-1)/2)
        augmented=np.vstack([forgetting**(count/2)*root,square_weights[:,None]*design[:count]])
        target=np.concatenate([forgetting**(count/2)*root@initial,square_weights*observed[:count]])
        previous=np.linalg.lstsq(augmented,target,rcond=None)[0]
        parameters.append(previous.tolist())
        inverses.append(np.linalg.solve(augmented.T@augmented,np.eye(dimension)).tolist())
    return [predictions,parameters,inverses]


def extension_oracle(slug,p):
    if slug=='rls-trace':return batch_prefixes(p)
    if slug=='ridge-variance':
        x=[Fraction(str(v)) for v in p['features']]
        alpha=Fraction(str(p['regularization'])); variance=Fraction(str(p['noise_variance']))
        energy=sum(v*v for v in x);inverse=1/(alpha+energy)
        return [float(inverse),float(variance*energy*inverse*inverse)]
    if slug=='forgetting-weights':
        value=Fraction(str(p['forgetting']));weights=[Fraction(1)]
        for _ in range(p['count']):weights.insert(0,weights[0]*value)
        return [float(weights[0]),list(map(float,weights[1:]))]
    if slug=='cap-validation':
        common={key:p[key] for key in ['regressors','observed','initial_parameters','initial_inverse']}
        rows=[]
        for value in sorted(set(p['candidates'])):
            prefix=dict(common,regressors=p['regressors'][:p['evaluation_start']],observed=p['observed'][:p['evaluation_start']],forgetting=value)
            prediction=batch_prefixes(prefix)[0]
            score=np.mean([(prediction[i]-p['observed'][i])**2 for i in range(p['tuning_start'],p['evaluation_start'])])
            rows.append((score,value))
        chosen=min(rows)[1]
        prediction,parameters,_=batch_prefixes(dict(common,forgetting=chosen))
        start=p['evaluation_start']
        score=float(np.linalg.norm(np.array(prediction[start:])-p['observed'][start:])/np.sqrt(len(prediction)-start))
        return [chosen,parameters[-1],score]
    raise AssertionError(slug)


def solve_for(slug):
    namespace={};exec(SOLUTIONS['p06-'+slug],namespace)
    return namespace['solve']


@pytest.mark.parametrize('forgetting',[1.,.97,.8])
def test_random_full_rank_prefixes_use_same_decaying_initial_penalty(forgetting):
    rng=np.random.default_rng(66091)
    parameters=rng.uniform(-1,1,3)
    design=rng.normal(size=(40,3))
    observed=design@parameters+rng.normal(scale=.04,size=40)
    p=dict(regressors=design.tolist(),observed=observed.tolist(),initial_parameters=[.2,.1,-.1],initial_inverse=[[2.,.3,0.],[.3,1.,.1],[0.,.1,.5]],forgetting=forgetting)
    actual=solve_for('rls-trace')(**p)
    assert difference(list(actual),batch_prefixes(p),dict(atol=1e-10,rtol=1e-10)) is None
    eigenvalues=np.linalg.eigvalsh(np.array(actual[2]))
    assert np.all(eigenvalues>0)


def test_weak_excitation_and_zero_regressor_forgetting():
    p=dict(regressors=[[1.,0.]]*20,observed=[2.]*20,initial_parameters=[.1,-3.],initial_inverse=[[1.,0.],[0.,2.]],forgetting=.9)
    _,parameters,inverses=solve_for('rls-trace')(**p)
    np.testing.assert_allclose(np.array(parameters)[:,1],-3.)
    np.testing.assert_allclose(np.array(inverses)[:,1,1],2*.9**(-np.arange(1,21)))
    p.update(regressors=[[0.,0.]],observed=[20.])
    predictions,parameters,inverses=solve_for('rls-trace')(**p)
    assert predictions==[0.] and parameters==[[.1,-3.]]
    np.testing.assert_allclose(inverses[0],np.array(p['initial_inverse'])/.9)


def test_target_arrival_cannot_rewrite_its_own_prediction():
    p=dict(VERIFICATION['p06-rls-trace']['cases'][3]['arguments'])
    before=solve_for('rls-trace')(**p)
    changed=p['observed'].copy();changed[2:]=[20.,-20.]
    after=solve_for('rls-trace')(**dict(p,observed=changed))
    np.testing.assert_allclose(before[0][:3],after[0][:3])
    assert not np.allclose(before[1][2:],after[1][2:])


def test_final_targets_cannot_select_forgetting_and_tie_is_explicit():
    solve=solve_for('cap-validation')
    p=dict(VERIFICATION['p06-cap-validation']['cases'][1]['arguments'])
    result=solve(**p)
    assert result[0]==.8
    changed=p['observed'].copy();changed[p['evaluation_start']:]=[-20.,20.]
    other=solve(**dict(p,observed=changed))
    assert result[0]==other[0]
    assert result[1]!=other[1]
    assert result[2]!=other[2]


def test_old_capstone_last_question_is_historical_not_current_credit(tmp_path):
    engine=PracticeEngine(tmp_path/'learning')
    try:
        old=dict(id='old-version',created_at='2026-09-19T00:00:00+00:00',exercise_id='p06-cap-validation',exercise_version='1',assessment_version='1',saved=True,state='FINISHED',mode='full',verdict='AC')
        first=next(q for q in QUESTIONS if q['id']=='p06-cap-sampling')
        unchanged=dict(old,id='unchanged',exercise_id=first['id'],exercise_version=first['version'])
        score=summarize_assessments(engine.assessments,engine.questions,[old,unchanged])['P06-SUMMARY']
        assert score['version']=='2' and score['first_points']==10 and score['practice_points']==10
        assert not score['complete']
    finally:engine.close()


def test_new_latex_commands_survive_notebook_serialization():
    """Escaped authoring strings must not turn theta/frac into control characters."""
    folder=ROOT/'notebooks/06-从测量走向模型/06-递推辨识与时变参数跟踪'
    for path in folder.glob('*.ipynb'):
        book=json.loads(path.read_text(encoding='utf-8'))
        prose='\n'.join(''.join(cell['source']) for cell in book['cells'][:-1] if cell['cell_type']=='markdown')
        assert not any(ord(ch)<32 and ch not in '\n\r' for ch in prose),path
        assert r'\phi' in prose and r'\theta' in prose and r'\frac' in prose
        for equation in re.findall(r'\$\$.*?\$\$|\$[^$\n]+\$',prose,re.S):
            assert not re.search(r'(?<!\\)\b(?:phi|theta|frac|mathsf|sigma|lambda|epsilon|widehat|operatorname)\b',equation),equation
            assert r'\wide\hat' not in equation
