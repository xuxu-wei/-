"""Independent numerical, semantic and actual-judge checks for network lessons."""
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

BANK = ROOT / 'exercises/11-网络上的系统'
QUESTIONS = json.loads((BANK / 'questions.json').read_text(encoding='utf-8'))
VERIFY = json.loads((BANK / 'verification.json').read_text(encoding='utf-8'))
SOLUTIONS = json.loads((BANK / 'solutions.json').read_text(encoding='utf-8'))
PYTHON = [item for item in QUESTIONS if item['type'] == 'python']


def notebook_functions():
    scope = {'np': np, 'math': math}
    entries = json.loads((ROOT / 'notebooks/11-网络上的系统/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        for cell in notebook['cells']:
            if 'model' in cell.get('metadata', {}).get('tags', []):
                source = ''.join(cell['source'])
                assert all(isinstance(node, ast.FunctionDef) for node in ast.parse(source).body)
                exec(compile(source, entry['path'], 'exec'), scope)
    return scope


def test_part_structure_and_examples():
    assert len(QUESTIONS) == 40 and len(PYTHON) == 13
    assert len({item['id'] for item in QUESTIONS}) == len(QUESTIONS)
    lessons = {}
    for item in QUESTIONS:
        lessons[item['lesson_id']] = lessons.get(item['lesson_id'], 0) + 1
        if item['type'] == 'choice':
            assert set(VERIFY[item['id']]['explanations']) == {'A', 'B', 'C', 'D'}
        else:
            assert item['entrypoint'] == 'solve'
            assert all(param['name'] != 'payload' for param in item['parameters'])
            assert item['samples'] and VERIFY[item['id']]['cases']
    assert sorted(lessons.values()) == [4] * 8 + [8]
    assessment = json.loads((BANK / 'assessment.json').read_text(encoding='utf-8'))
    assert [sum(q['points'] for q in assessment['items'] if q['level'] == level) for level in range(1, 5)] == [20, 30, 30, 20]


def test_nonzero_and_nonequilibrium_terms_are_not_split():
    question = next(item for item in QUESTIONS if item['id'] == 'p11-spectral-gap')
    assert '非零特征值（nonzero eigenvalue）' in question['statement']
    assert '非平衡（nonequilibrium）模态' in question['options'][0]['text']
    serialized = json.dumps(QUESTIONS, ensure_ascii=False)
    assert '非零特征值（zero eigenvalue）' not in serialized
    assert '非平衡（equilibrium）' not in serialized


def test_notebook_exploration_links_encode_chapter_paths():
    entries = json.loads((ROOT / 'notebooks/11-网络上的系统/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        if entry['id'] == 'P11-SUMMARY':
            continue
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        source = '\n'.join(''.join(cell['source']) for cell in notebook['cells'] if cell['cell_type'] == 'markdown')
        links = re.findall(r'\[在本章探索中改变条件\]\(([^)]+)\)', source)
        assert len(links) == 1 and not any(char.isspace() for char in links[0])
        assert unquote(urlsplit(links[0]).path).startswith('/chapters/11-')
        assert unquote(urlsplit(links[0]).path).endswith('/explore/')


def test_graph_statistics_independent_small_cases():
    f = notebook_functions()
    degrees, components, distance = f['graph_summary'](4, [[0, 1], [1, 2], [2, 3]])
    assert degrees == [1, 2, 2, 1] and components == [[0, 1, 2, 3]]
    np.testing.assert_allclose(distance, (1 + 2 + 3 + 1 + 2 + 1) / 6)
    assert f['graph_summary'](4, [[0, 1], [2, 3]]) == ([1, 1, 1, 1], [[0, 1], [2, 3]], None)
    np.testing.assert_allclose(f['mean_clustering'](3, [[0, 1], [1, 2], [0, 2]]), 1.)
    assert f['mean_clustering'](4, [[0, 1], [1, 2], [2, 3]]) == 0
    for p in [0., .2, .7, 1.]:
        for seed in range(10):
            edges = f['ring_rewire'](30, 4, p, seed)
            assert len(edges) == 60 and len(set(map(tuple, edges))) == 60
            assert sum(f['graph_summary'](30, edges)[0]) == 120


def test_diffusion_against_closed_form_and_component_balance():
    f = notebook_functions()
    L = np.array(f['laplacian'](3, [[0, 1, 2.], [1, 2, 1.]]))
    np.testing.assert_allclose(L, [[2, -2, 0], [-2, 3, -1], [0, -1, 1]])
    np.testing.assert_allclose(L, L.T)
    np.testing.assert_allclose(L.sum(axis=0), 0.)
    trajectory = np.array(f['diffuse_amounts'](2, [[0, 1, 1.]], [2., 0.], [1., 1.], .001, 1000))
    np.testing.assert_allclose(trajectory[-1], [1 + math.exp(-2), 1 - math.exp(-2)], atol=.001)
    exact, eigenvalues = f['exact_equal_volume'](2, [[0, 1, 1.]], [2., 0.], 1.)
    np.testing.assert_allclose(exact, [1 + math.exp(-2), 1 - math.exp(-2)], atol=1e-12)
    np.testing.assert_allclose(eigenvalues, [0., 2.], atol=1e-12)
    disconnected = np.array(f['diffuse_amounts'](4, [[0, 1, 1.], [2, 3, .5]], [4., 0., 2., 0.], [1.]*4, .05, 100))
    np.testing.assert_allclose(disconnected[:, :2].sum(axis=1), 4., atol=1e-12)
    np.testing.assert_allclose(disconnected[:, 2:].sum(axis=1), 2., atol=1e-12)
    unequal = f['diffuse_amounts'](2, [[0, 1, 1.]], [4., 0.], [1., 3.], .05, 200)[-1]
    np.testing.assert_allclose(unequal, [1., 3.], atol=1e-4)
    bad = f['diffuse_amounts'](2, [[0, 1, 1.]], [2., 0.], [1., 1.], 1.5, 1)[-1]
    assert min(bad) < 0 and sum(bad) == pytest.approx(2.)


def test_sir_synchronous_events_and_nested_variance():
    f = notebook_functions()
    history, ever, active = f['sir_fixed'](3, [[0, 1], [1, 2]], [1, 0, 0], .5, .5,
        [[[1., 1., 1.], [.2, 1., 1.], [1., 1., 1.]],
         [[1., 1., 1.], [1., 1., 1.], [1., .1, 1.]]],
        [[.8, 1., 1.], [.2, .8, 1.]])
    assert history == [[1, 0, 0], [1, 1, 0], [2, 1, 1]] and (ever, active) == (3, 2)
    means, within, between, overall = f['nested_variation']([[1., 3.], [5., 7.]])
    assert means == [2., 6.]
    np.testing.assert_allclose([within, between, overall], [1., 4., 4.])


def test_mean_mixing_reference_obeys_its_own_contact_rule():
    f = notebook_functions()
    history = np.asarray(f['mean_mixing_sir'](12, 4, .35, .22, 12))
    assert history.shape == (13, 3)
    np.testing.assert_allclose(history[0], [11/12, 1/12, 0.])
    expected_cases = 11/12 * (1 - (1 - .35/12)**4)
    np.testing.assert_allclose(history[1], [11/12 - expected_cases,
                                             1/12 + expected_cases - .22/12,
                                             .22/12])
    np.testing.assert_allclose(history.sum(axis=1), 1., atol=1e-12)
    assert np.all((history >= 0) & (history <= 1))


def test_phase_analytic_limits_and_locking_window():
    f = notebook_functions()
    np.testing.assert_allclose(f['order_parameter']([0., 0., math.pi, math.pi]), 0., atol=1e-12)
    for angle in [0., .7, 4.]:
        np.testing.assert_allclose(f['order_parameter']([angle, angle + math.pi / 2]), 2 ** -.5, atol=1e-12)
    np.testing.assert_allclose(f['phase_step']([0., math.pi/2], [0., 0.], [[0, 1]], 1., .1),
                               [.1, math.pi/2 - .1], atol=1e-12)
    history, _ = f['phase_run']([0., .1], [1., 2.], [[0, 1]], 0., .1, 10)
    np.testing.assert_allclose(history[-1], [1., 2.1], atol=1e-12)
    spread, rates = f['locking_spread'](history, .1, 5)
    np.testing.assert_allclose([spread, *rates], [1., 1., 2.], atol=1e-12)


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


def test_web_selected_mechanisms_agree_with_notebook_models():
    f = notebook_functions()
    script = """import {ringRewire,graphStats,diffusion,propagate,synchrony} from './web/network/model.mjs';
const e=ringRewire(12,4,0,17), g=graphStats(12,e), d=diffusion(false,.1,2), s=propagate(false,.35,1), k=synchrony(false,0,60);
console.log(JSON.stringify({edgeCount:e.length,degreeSum:g.degree.reduce((a,b)=>a+b,0),mass:d.mass,
  componentMass:d.componentMass,firstSIR:s.states[0],counts:s.counts[0],frequencyGap:k.spread[60]}));"""
    result = subprocess.run(['node', '--input-type=module', '-e', script], text=True, capture_output=True, cwd=ROOT, check=True)
    web = json.loads(result.stdout)
    assert web['edgeCount'] == 24 and web['degreeSum'] == 48
    assert web['mass'] == [6., 6., 6.]
    np.testing.assert_allclose(web['componentMass'], [[4., 2.], [4., 2.], [4., 2.]])
    assert web['firstSIR'] == [1] + [0] * 11 and web['counts'] == [11, 1, 0]
    np.testing.assert_allclose(web['frequencyGap'], .6, atol=1e-12)
    notebook = f['diffuse_amounts'](4, [[0, 1, 1.], [2, 3, .5]], [4., 0., 2., 0.], [1.]*4, .1, 2)
    np.testing.assert_allclose(web['componentMass'], [[sum(row[:2]), sum(row[2:])] for row in notebook])
