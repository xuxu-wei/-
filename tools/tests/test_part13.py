"""Independent science, catalog and actual-judge checks for part 13."""
import ast
import json
import math
from pathlib import Path
import subprocess
import sys
import time
import uuid

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from practice import PracticeEngine

BANK = ROOT / 'exercises/13-临界变化与韧性'
QUESTIONS = json.loads((BANK / 'questions.json').read_text(encoding='utf-8'))
VERIFY = json.loads((BANK / 'verification.json').read_text(encoding='utf-8'))
SOLUTIONS = json.loads((BANK / 'solutions.json').read_text(encoding='utf-8'))
PYTHON = [item for item in QUESTIONS if item['type'] == 'python']


def notebook_functions():
    scope = {'np': np, 'math': math}
    entries = json.loads((ROOT / 'notebooks/13-临界变化与韧性/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        for cell in notebook['cells']:
            if 'model' in cell.get('metadata', {}).get('tags', []):
                source = ''.join(cell['source'])
                assert all(isinstance(node, (ast.FunctionDef, ast.Import)) for node in ast.parse(source).body)
                exec(compile(source, entry['path'], 'exec'), scope)
    return scope


def test_part_structure_contracts_and_review_targets():
    assert len(QUESTIONS) == 40 and len(PYTHON) == 13
    assert len({item['id'] for item in QUESTIONS}) == 40
    counts = {}
    for item in QUESTIONS:
        counts[item['lesson_id']] = counts.get(item['lesson_id'], 0) + 1
        if item['type'] == 'choice':
            assert set(VERIFY[item['id']]['explanations']) == {'A', 'B', 'C', 'D'}
        else:
            assert item['entrypoint'] == 'solve'
            assert all(field['name'] != 'payload' for field in item['parameters'])
            assert item['samples'] and len(VERIFY[item['id']]['cases']) >= 3
    assert sorted(counts.values()) == [4] * 8 + [8]
    assessment = json.loads((BANK / 'assessment.json').read_text(encoding='utf-8'))
    assert [sum(q['points'] for q in assessment['items'] if q['level'] == level)
            for level in range(1, 5)] == [20, 30, 30, 20]
    course = json.loads((ROOT / 'web/course/catalog.json').read_text(encoding='utf-8'))
    urls = {chapter['url'] for chapter in course['parts'][12]['chapters'] if chapter['available']}
    assert {goal['review_url'] for goal in assessment['objectives']} <= urls
    assert all(question['learning_targets'] for question in QUESTIONS)


def test_visualization_selection_and_notebook_paths():
    entries = json.loads((ROOT / 'notebooks/13-临界变化与韧性/catalog.json').read_text(encoding='utf-8'))
    assert len(entries) == 9
    for entry in entries:
        assert (ROOT / entry['path']).is_file()
        if entry['chapter_id'] in {'13.1', '13.2', '13.3'}:
            assert entry['visualization'] == 'web/resilience/index.html'
        else:
            assert entry['visualization'] is None


def test_conditional_mean_variance_and_finite_repeat_summary():
    f = notebook_functions()
    assert f['meanfield_step']([1, -1, 1, -1], 0., [.2, .4, .6, .8]) == [1, 1, -1, -1]
    assert f['meanfield_path']([1, -1], 0., [[.2, .8], [.9, .1]]) == [0., 0., 0.]
    beta, m, n = 1.2, .2, 50
    draws = np.random.default_rng(13).random((4000, n))
    r = (1 + math.tanh(beta*m)) / 2
    values = (2 * (draws < r).sum(axis=1) - n) / n
    assert abs(values.mean() - math.tanh(beta*m)) < .015
    assert abs(values.var() - (1-math.tanh(beta*m)**2)/n) < .002
    assert f['order_summary']([[0., .2, -.4], [0., -.4, -.2]], 1) == pytest.approx([.3, 0.])


def test_meanfield_local_slope_is_not_an_infinite_size_proof():
    f = notebook_functions()
    for beta in [.8, 1., 1.2]:
        epsilon = 1e-6
        slope = (math.tanh(beta * epsilon)-math.tanh(-beta * epsilon))/(2*epsilon)
        assert slope == pytest.approx(beta, abs=1e-9)
    assert f['deterministic_meanfield'](0., .4, 2) == [.4, 0., 0.]
    assert f['deterministic_meanfield'](1.2, .4, 0) == [.4]


def test_synchronous_cascade_and_functional_boundaries():
    f = notebook_functions()
    edges = [[0, 1], [1, 2], [2, 3]]
    assert f['threshold_cascade'](4, edges, [1]*4, [0]) == [[0], [1], [2], [3]]
    assert f['threshold_cascade'](4, edges, [2]*4, [0]) == [[0]]
    assert f['threshold_cascade'](4, edges, [1]*4, []) == [[]]
    assert f['largest_survivor_fraction'](4, edges, [1]) == .5
    assert f['largest_survivor_fraction'](4, edges, [0, 1, 2, 3]) == 0.
    assert f['largest_survivor_fraction'](3, [], [0]) == pytest.approx(1/3)
    chain = [[i, i+1] for i in range(5)]
    star = [[0, i] for i in range(1, 6)]
    thresholds = [1, 1, 2, 1, 1, 1]
    assert f['threshold_cascade'](6, chain, thresholds, [0]) == [[0], [1]]
    assert f['threshold_cascade'](6, star, thresholds, [0]) == [[0], [1, 3, 4, 5]]


def test_recovery_rate_basin_and_numerical_step():
    f = notebook_functions()
    outer = f['recovery_path'](1.5, 1., 1.4, .02, 25)
    inner = f['recovery_path'](1.5, 2., 1.4, .02, 25)
    assert outer[-1] > 1.4 and inner[-1] < 1.4
    assert f['recovery_path'](1.5, 1., .2, .02, 25)[-1] < .2
    assert f['recovery_path'](1.5, 2., .2, .02, 0) == [.2]
    coarse = f['recovery_path'](1.5, 2., .001, .02, 50)[-1]
    fine = f['recovery_path'](1.5, 2., .001, .01, 100)[-1]
    exact_linear = .001 * math.exp(-1.5)
    assert abs(fine-exact_linear) < abs(coarse-exact_linear)


def test_past_only_indicators_and_event_level_alert_counts():
    f = notebook_functions()
    ordinary = f['past_window_stats']([0., 1., 2., 3.], 3, 4, 1)
    assert ordinary == pytest.approx([1.25, 1.])
    assert f['past_window_stats']([0., 1., 2., 3., 1e6], 3, 4, 1) == ordinary
    assert f['past_window_stats']([1., 1., 1., 1.], 3, 4, 1) == [0., None]
    assert f['past_window_stats']([1., 2.], 1, 4, 1) == [None, None]
    assert f['alert_counts']([2, 4, 8], [5, 12], 2) == [1, 2, 1]
    assert f['alert_counts']([5], [5], 2) == [0, 1, 1]
    assert f['alert_counts']([], [], 2) == [0, 0, 0]


def test_coarse_graining_and_one_factor_uncertainty():
    f = notebook_functions()
    assert f['coarse_xor_features']([1, 0, 1, 0]) == [.5, .5, 0.]
    assert f['coarse_xor_features']([1, 1, 0, 0]) == [.5, 0., 1.]
    for bits in np.ndindex((2,)*4):
        p, c2, predicted = f['coarse_xor_features'](bits)
        exact = sum(bits[(i-1)%4] ^ bits[(i+1)%4] for i in range(4))/4
        np.testing.assert_allclose(predicted, exact)
        assert p == pytest.approx(sum(bits)/4)
    np.testing.assert_allclose(f['contrast_components'](.5, .6, .45, .72), [.1, -.05, .22])
    assert f['scale_ranking'](.8, .7, .4, .6) == [1, -1, True]
    assert f['scale_ranking'](.5, .5, .4, .6) == [0, -1, False]


@pytest.mark.parametrize('question', PYTHON, ids=lambda item: item['slug'])
def test_real_judge_samples_full_cases_and_wrong_answer(tmp_path, question):
    engine = PracticeEngine(tmp_path / 'records')

    def submit(mode, source):
        outcome = engine.submit({'exercise_id': question['id'], 'exercise_version': question['version'],
                                 'request_id': str(uuid.uuid4()), 'source': source, 'mode': mode}, 'python')
        deadline = time.monotonic() + 40
        while outcome['state'] != 'FINISHED' and time.monotonic() < deadline:
            time.sleep(.01)
            outcome = engine.get(outcome['id'])
        assert outcome['state'] == 'FINISHED'
        return outcome

    try:
        assert submit('samples', SOLUTIONS[question['id']])['verdict'] == 'AC'
        assert question['id'] not in engine.progress()['passed']
        assert submit('full', SOLUTIONS[question['id']])['verdict'] == 'AC'
        wrong = question['starter_code'].replace('raise NotImplementedError("请完成计算")', 'return None')
        assert submit('full', wrong)['verdict'] == 'WA'
    finally:
        engine.close()


def test_browser_models_agree_with_notebook_mechanisms():
    f = notebook_functions()
    source = """import {meanfieldStep,cascade,largestSurvivor,recovery,pastVariance} from './web/resilience/model.mjs';
console.log(JSON.stringify({step:meanfieldStep([1,-1,1,-1],0,[.2,.4,.6,.8]),
 waves:cascade(4,[[0,1],[1,2],[2,3]],[1,1,1,1],[0]),
 function:largestSurvivor(4,[[0,1],[1,2],[2,3]],[1]),
 trajectory:recovery(1.5,2,1.4,.02,25),
 variance:pastVariance([0,1,2,3,999],3,4)}));"""
    result = subprocess.run(['node', '--input-type=module', '-e', source],
                            text=True, capture_output=True, cwd=ROOT, check=True)
    web = json.loads(result.stdout)
    assert web['step'] == f['meanfield_step']([1,-1,1,-1],0,[.2,.4,.6,.8])
    assert web['waves'] == f['threshold_cascade'](4,[[0,1],[1,2],[2,3]],[1]*4,[0])
    assert web['function'] == f['largest_survivor_fraction'](4,[[0,1],[1,2],[2,3]],[1])
    np.testing.assert_allclose(web['trajectory'], f['recovery_path'](1.5,2,1.4,.02,25))
    assert web['variance'] == f['past_window_stats']([0,1,2,3,999],3,4,1)[0]
