"""Independent numerical, semantic and actual-judge checks for part 12."""
import ast
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
from urllib.parse import unquote, urlsplit

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from practice import PracticeEngine

BANK = ROOT / 'exercises/12-个体与集体现象'
QUESTIONS = json.loads((BANK / 'questions.json').read_text(encoding='utf-8'))
VERIFY = json.loads((BANK / 'verification.json').read_text(encoding='utf-8'))
SOLUTIONS = json.loads((BANK / 'solutions.json').read_text(encoding='utf-8'))
PYTHON = [item for item in QUESTIONS if item['type'] == 'python']


def notebook_functions():
    scope = {'np': np, 'math': math}
    entries = json.loads((ROOT / 'notebooks/12-个体与集体现象/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        for cell in notebook['cells']:
            if 'model' in cell.get('metadata', {}).get('tags', []):
                source = ''.join(cell['source'])
                assert all(isinstance(node, ast.FunctionDef) for node in ast.parse(source).body)
                exec(compile(source, entry['path'], 'exec'), scope)
    return scope


def test_part_structure_question_contracts_and_assessment():
    assert len(QUESTIONS) == 48 and len(PYTHON) == 15
    assert len({q['id'] for q in QUESTIONS}) == 48
    counts = {}
    for q in QUESTIONS:
        counts[q['lesson_id']] = counts.get(q['lesson_id'], 0) + 1
        if q['type'] == 'choice':
            assert set(VERIFY[q['id']]['explanations']) == {'A', 'B', 'C', 'D'}
        else:
            assert q['entrypoint'] == 'solve'
            assert all(p['name'] != 'payload' for p in q['parameters'])
            assert q['samples'] and len(VERIFY[q['id']]['cases']) >= 3
    assert sorted(counts.values()) == [4] * 10 + [8]
    assessment = json.loads((BANK / 'assessment.json').read_text(encoding='utf-8'))
    assert [sum(q['points'] for q in assessment['items'] if q['level'] == level)
            for level in range(1, 5)] == [20, 30, 30, 20]


def test_only_visualized_chapters_have_exploration_links():
    entries = json.loads((ROOT / 'notebooks/12-个体与集体现象/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        source = '\n'.join(''.join(c['source']) for c in notebook['cells'] if c['cell_type'] == 'markdown')
        links = re.findall(r'\[在本章探索中改变条件\]\(([^)]+)\)', source)
        assert len(links) == (1 if entry['visualization'] else 0)
        if links:
            assert not any(ch.isspace() for ch in links[0])
            assert unquote(urlsplit(links[0]).path).startswith('/chapters/12-')


def test_cellular_automaton_hand_cases_and_update_order():
    f = notebook_functions()
    state = [1, 0, 0, 0]
    assert f['ca_step'](state, 'periodic', 'sync', [0, 1, 2, 3]) == [0, 1, 0, 1]
    assert f['ca_step'](state, 'periodic', 'sync', [3, 2, 1, 0]) == [0, 1, 0, 1]
    assert f['ca_step'](state, 'fixed', 'sync', [0, 1, 2, 3]) == [0, 1, 0, 0]
    assert f['ca_step'](state, 'periodic', 'async', [0, 1, 2, 3]) == [0, 0, 0, 0]
    assert len(f['ca_run'](state, 'fixed', 'sync', [0, 1, 2, 3], 3)) == 4


def test_replicator_and_spatial_payoff_independent_algebra():
    f = notebook_functions()
    matrix = [[3., 0.], [4., 1.]]
    for p in [0., .25, .5, .75, 1.]:
        f0, f1, mean, rate = f['payoff_and_replicator'](matrix, p)
        np.testing.assert_allclose([f0, f1], [3*p, 1+3*p])
        np.testing.assert_allclose(rate, -p*(1-p))
        np.testing.assert_allclose(mean, p*f0+(1-p)*f1)
    assert f['local_payoffs']([0, 0, 1, 1], matrix, 'periodic') == [1.5, 1.5, 2.5, 2.5]
    assert f['local_payoffs']([0, 0, 1, 1], matrix, 'fixed') == [3., 1.5, 2.5, 1.]


def test_neutral_variance_and_selection_mutation_order():
    f = notebook_functions()
    assert f['neutral_step'](.5, [.1, .2, .8, .9]) == .5
    assert f['neutral_step'](0., [.1, .9]) == 0.
    selected, mutated, sampled = f['selected_mutated_step'](.5, 1., .1, .2, [.1, .5, .8, .9])
    np.testing.assert_allclose([selected, mutated], [2/3, 2/3*.9+1/3*.2])
    assert sampled == f['neutral_step'](mutated, [.1, .5, .8, .9])
    draws = np.random.default_rng(1203).random((600, 50))
    frequency = np.array([f['neutral_step'](.3, row) for row in draws])
    assert abs(frequency.mean()-.3) < .025
    assert abs(frequency.var()-.3*.7/50) < .0007


def test_diffusion_and_reaction_boundary_conditions():
    f = notebook_functions()
    np.testing.assert_allclose(f['diffuse_1d']([0., 2., 0.], 1., 1., .25, 1, 'periodic')[-1],
                               [.5, 1., .5])
    for boundary in ['periodic', 'noflux']:
        path = np.array(f['diffuse_1d']([2., 0., 0., 0.], 1., 1., .2, 30, boundary))
        np.testing.assert_allclose(path.sum(axis=1), 2., atol=1e-12)
        assert path.min() >= -1e-12
    bad = f['diffuse_1d']([0., 2., 0.], 1., 1., 1., 1, 'periodic')[-1]
    assert min(bad) < 0 and sum(bad) == pytest.approx(2.)
    stable = f['reaction_diffusion_step']([1.]*3, [.9]*3, .1, .9, .01, 1., 1., .03, 'periodic')
    np.testing.assert_allclose(stable, [[1.]*3, [.9]*3])
    jacobian = np.array([[.8, 1.], [-1.8, -1.]])
    assert max(np.linalg.eigvals(jacobian).real) < 0
    assert max(np.linalg.eigvals(jacobian-4*np.diag([.01, 1.])).real) > 0


def test_pair_correlation_closes_declared_xor_rule():
    f = notebook_functions()
    states = [[1, 0, 1, 0], [1, 1, 0, 0]]
    assert [f['ca_features'](x)[0] for x in states] == [.5, .5]
    assert [f['ca_features'](x)[1] for x in states] == [.5, 0.]
    for state in states:
        p, c2 = f['ca_features'](state)
        mean_field, corrected = f['ca_density_predictions'](state)
        actual = sum(f['ca_step'](state, 'periodic', 'sync', list(range(4))))/4
        np.testing.assert_allclose([mean_field, corrected, actual],
                                   [2*p*(1-p), 2*p-2*c2, actual])
        np.testing.assert_allclose(corrected, actual)
    assert f['block_densities']([1, 1, 0, 0], 2) == [1., 0.]


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
    source = """import {caStep,payoff,diffuse} from './web/collective/model.mjs';
const ca=caStep([1,0,0,0],'periodic','sync',[0,1,2,3]);
const pay=payoff([[3,0],[4,1]],.25);
const flow=diffuse([2,0,0,0],.2,'noflux',3);
console.log(JSON.stringify({ca,pay,rows:flow.rows,mass:flow.mass}));"""
    result = subprocess.run(['node', '--input-type=module', '-e', source],
                            text=True, capture_output=True, cwd=ROOT, check=True)
    web = json.loads(result.stdout)
    assert web['ca'] == f['ca_step']([1, 0, 0, 0], 'periodic', 'sync', [0, 1, 2, 3])
    np.testing.assert_allclose([web['pay'][key] for key in ('f0', 'f1', 'mean', 'rate')],
                               f['payoff_and_replicator']([[3, 0], [4, 1]], .25))
    np.testing.assert_allclose(web['rows'], f['diffuse_1d']([2, 0, 0, 0], 1., 1., .2, 3, 'noflux'))
    np.testing.assert_allclose(web['mass'], 2.)
