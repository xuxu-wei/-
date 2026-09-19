"""Independent mathematical and interface checks for the control lessons."""
import ast
import itertools
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
from practice import PracticeEngine, difference

BANK = ROOT / 'exercises/10-反馈与最优控制'
QUESTIONS = json.loads((BANK / 'questions.json').read_text(encoding='utf-8'))
VERIFY = json.loads((BANK / 'verification.json').read_text(encoding='utf-8'))
SOLUTIONS = json.loads((BANK / 'solutions.json').read_text(encoding='utf-8'))
PYTHON = [question for question in QUESTIONS if question['type'] == 'python']


def notebook_functions():
    scope = {'np': np, 'math': math, 'itertools': itertools}
    entries = json.loads((ROOT / 'notebooks/10-反馈与最优控制/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        for cell in notebook['cells']:
            if 'model' in cell.get('metadata', {}).get('tags', []):
                source = ''.join(cell['source'])
                assert all(isinstance(node, ast.FunctionDef) for node in ast.parse(source).body)
                exec(compile(source, entry['path'], 'exec'), scope)
    return scope


def test_part_structure_and_capstone_contract():
    assert len(QUESTIONS) == 64 and len(PYTHON) == 19
    assert len({q['id'] for q in QUESTIONS}) == len(QUESTIONS)
    for q in QUESTIONS:
        if q['type'] == 'choice':
            assert set(VERIFY[q['id']]['explanations']) == {'A', 'B', 'C', 'D'}
            assert VERIFY[q['id']]['correct']
        else:
            assert q['entrypoint'] == 'solve'
            assert all(row['name'] != 'payload' for row in q['parameters'])
    spec = json.loads((BANK / 'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items']) == 8
    assert [sum(item['points'] for item in spec['items'] if item['level'] == i) for i in range(1, 5)] == [20, 30, 30, 20]


def test_notebook_exploration_links_are_complete_encoded_chapter_urls():
    entries = json.loads((ROOT / 'notebooks/10-反馈与最优控制/catalog.json').read_text(encoding='utf-8'))
    for entry in entries:
        if entry['id'] == 'P10-SUMMARY':
            continue
        notebook = json.loads((ROOT / entry['path']).read_text(encoding='utf-8'))
        source = '\n'.join(''.join(cell['source']) for cell in notebook['cells'] if cell['cell_type'] == 'markdown')
        links = re.findall(r'\[在本章探索中改变条件\]\(([^)]+)\)', source)
        assert len(links) == 1
        assert not any(char.isspace() for char in links[0])
        path = unquote(urlsplit(links[0]).path)
        assert path.startswith(f'/chapters/10-{int(entry["chapter_id"].split(".")[1]):02}-')
        assert path.endswith('/explore/')


def test_poles_frequency_and_structure_against_linear_algebra():
    f = notebook_functions()
    rng = np.random.default_rng(11011)
    for _ in range(30):
        gain = float(rng.uniform(0, 10)); tau = float(rng.uniform(.2, 3))
        real, imag = f['closed_loop_poles'](gain, tau)
        np.testing.assert_allclose(sorted((complex(a, b) for a, b in zip(real, imag)), key=lambda z: z.imag),
                                   sorted(np.roots([tau, tau + 1, 1 + gain]), key=lambda z: z.imag), atol=1e-12)
        omega = float(rng.uniform(0, 5)); delay = float(rng.uniform(0, 1))
        response = gain * np.exp(-1j * omega * delay) / ((1 + 1j * omega) * (1 + 1j * tau * omega))
        actual = f['frequency_point'](gain, tau, omega, delay)
        np.testing.assert_allclose(actual, [abs(response), np.angle(response, deg=True)], atol=1e-12)
    A = np.array([[0., 1.], [0., 0.]])
    for B, rank in [(np.array([0., 1.]), 2), (np.array([1., 0.]), 1)]:
        matrix, det = f['controllability_2d'](A.tolist(), B.tolist())
        np.testing.assert_allclose(matrix, np.column_stack([B, A @ B]))
        assert np.linalg.matrix_rank(matrix) == rank
        np.testing.assert_allclose(det, np.linalg.det(matrix))
    for C, rank in [(np.array([1., 0.]), 2), (np.array([0., 1.]), 1)]:
        matrix, det = f['observability_2d'](A.tolist(), C.tolist())
        np.testing.assert_allclose(matrix, np.vstack([C, C @ A]))
        assert np.linalg.matrix_rank(matrix) == rank
        np.testing.assert_allclose(det, np.linalg.det(matrix))


def test_feedback_observer_and_bellman_independent_references():
    f = notebook_functions()
    A = np.array([[0., 1.], [0., 0.]]); B = np.array([[0.], [1.]])
    for poles in [(-1., -2.), (-.5, -.5), (-3., -4.)]:
        K = np.array(f['canonical_feedback'](*poles)).reshape(1, 2)
        np.testing.assert_allclose(sorted(np.linalg.eigvals(A - B @ K)), sorted(poles), atol=1e-12)
    Ad = [[1., .2], [0., .9]]; Bd = [.1, .4]; C = [1., 0.]; L = [.5, .2]
    inputs = [1., -.5, 0.]; readings = [2., 1.5, 0.8]; initial = [0., 0.]
    path, innovations = f['observer_path'](Ad, Bd, C, L, inputs, readings, initial)
    expected = np.array(initial)
    for t, (u, y) in enumerate(zip(inputs, readings)):
        innovation = y - np.array(C) @ expected
        np.testing.assert_allclose(innovations[t], innovation)
        expected = np.array(Ad) @ expected + np.array(Bd) * u + np.array(L) * innovation
        np.testing.assert_allclose(path[t + 1], expected)
    for terminal in [0., .5, 1., 4.]:
        action, cost, value = f['scalar_bellman'](1., 1., 1., 1., terminal, 2.)
        grid = np.linspace(-3, 1, 40001)
        direct = 4 + grid * grid + terminal * (2 + grid) ** 2
        assert abs(action - grid[np.argmin(direct)]) < 1e-4
        np.testing.assert_allclose(cost, direct.min(), atol=1e-8)
        np.testing.assert_allclose(cost, 4 * value)


def test_riccati_cost_and_discrete_mpc_against_direct_optimization():
    f = notebook_functions()
    A = np.array([[1., .5], [0., 1.]])
    B = np.array([[0.], [.5]])
    Q = np.diag([1., .2]); R = np.array([[.5]]); terminal = np.eye(2)
    gains, values = f['finite_lqr'](A.tolist(), B.tolist(), Q.tolist(), R.tolist(), terminal.tolist(), 4)
    initial = np.array([2., -.5]); x = initial.copy(); direct = 0.
    for gain in gains:
        u = -float((np.array(gain) @ x).item())
        direct += x @ Q @ x + u * R[0, 0] * u
        x = A @ x + B[:, 0] * u
    direct += x @ terminal @ x
    np.testing.assert_allclose(direct, initial @ np.array(values[0]) @ initial, atol=1e-10)
    assert all(np.allclose(value, np.array(value).T) for value in values)
    for state, target, upper in [(0., 2., 2.), (0., 2., .5), (3., 0., 2.)]:
        status, first, cost, states = f['discrete_mpc'](state, 1., 1., target, 1., .1, 2., [-1., 0., 1.], 2, -1., upper)
        candidates = []
        for pair in itertools.product([-1., 0., 1.], repeat=2):
            current = state
            trajectory = [current]
            objective = 0.
            for action in pair:
                objective += (current - target) ** 2 + .1 * action * action
                current += action
                trajectory.append(current)
                if current < -1 or current > upper:
                    break
            else:
                objective += 2 * (current - target) ** 2
                candidates.append((objective, pair, trajectory))
        if not candidates:
            assert (status, first, cost, states) == ('infeasible', None, None, [])
        else:
            expected = min(candidates)
            assert status == 'optimal' and first == expected[1][0]
            np.testing.assert_allclose(cost, expected[0])
            np.testing.assert_allclose(states, expected[2])


def test_metrics_and_failures_have_explicit_denominators():
    f = notebook_functions()
    a = f['paired_metrics']([0., 0., 0.], [1., .5, 0.], [2., 1.], 1.5, False)
    np.testing.assert_allclose(a[:3], [1.25 / 3, 2.5, .5])
    assert a[3] is False
    assert f['paired_metrics']([1.], [9.], [], 2., True) == (None, None, None, True)
    assert f['paired_difference']([1., 2., None, 4.], [2., 1., 3., None]) == (0., 2, 2)


@pytest.mark.parametrize('question', PYTHON, ids=lambda q: q['slug'])
def test_real_judge_samples_and_full_cases(tmp_path, question):
    engine = PracticeEngine(tmp_path / 'records')

    def run(mode, source):
        outcome = engine.submit({'exercise_id': question['id'], 'exercise_version': question['version'],
                                 'request_id': str(uuid.uuid4()), 'source': source, 'mode': mode}, 'python')
        deadline = time.monotonic() + 40
        while outcome['state'] != 'FINISHED' and time.monotonic() < deadline:
            time.sleep(.01)
            outcome = engine.get(outcome['id'])
        assert outcome['state'] == 'FINISHED'
        return outcome

    try:
        for case in VERIFY[question['id']]['cases']:
            assert difference(case['expected'], case['expected'], question['tolerance']) is None
        assert run('samples', SOLUTIONS[question['id']])['verdict'] == 'AC'
        assert question['id'] not in engine.progress()['passed']
        assert run('full', SOLUTIONS[question['id']])['verdict'] == 'AC'
        wrong = question['starter_code'].replace('raise NotImplementedError("请完成计算")', 'return None')
        assert run('full', wrong)['verdict'] == 'WA'
    finally:
        engine.close()


def test_web_models_match_selected_notebook_numeric_models():
    f = notebook_functions()
    cases = [
        {'kind': 'pi', 'e': 2., 'i': 0., 'dt': 1., 'kp': 1., 'ki': 1., 'limit': 2.},
        {'kind': 'pi', 'e': -1., 'i': 3., 'dt': .5, 'kp': 1., 'ki': 1., 'limit': 2.},
        *({'kind': 'poles', 'gain': k, 'tau': tau} for k, tau in [(0., 2.), (2., 1.), (8., .5)]),
        *({'kind': 'freq', 'gain': 2., 'tau': .5, 'omega': w, 'delay': d} for w, d in [(.1, 0.), (1., .25), (3., 1.)]),
        *({'kind': 'bellman', 'r': r, 'qf': qf} for r, qf in [(1., 1.), (.5, 4.), (2., .2)]),
    ]
    script = """import fs from 'node:fs';import {piStep,poles,frequency,bellman} from './web/control/model.mjs';
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(cases.map(c=>c.kind==='pi'?Object.values(piStep(c.e,c.i,c.dt,c.kp,c.ki,c.limit)):c.kind==='poles'?poles(c.gain,c.tau):c.kind==='freq'?Object.values(frequency(c.gain,c.tau,c.omega,c.delay)):Object.values(bellman(c.r,c.qf)))));"""
    result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(cases),
                            text=True, capture_output=True, cwd=ROOT, check=True)
    web = json.loads(result.stdout)
    for case, actual in zip(cases, web):
        if case['kind'] == 'pi':
            expected = f['pi_step'](case['e'], case['i'], case['dt'], case['kp'], case['ki'], case['limit'])
        elif case['kind'] == 'poles':
            real, imag = f['closed_loop_poles'](case['gain'], case['tau'])
            expected = [[real[0], imag[0]], [real[1], imag[1]]]
        elif case['kind'] == 'freq':
            magnitude, principal = f['frequency_point'](case['gain'], case['tau'], case['omega'], case['delay'])
            expected = [magnitude, principal]
            # The webpage deliberately shows continuous, unwrapped phase.
            actual[1] = ((actual[1] + 180) % 360) - 180
        else:
            action, cost, weight = f['scalar_bellman'](1., 1., 1., case['r'], case['qf'], 2.)
            expected = [action, weight, cost]
        np.testing.assert_allclose(actual, expected, atol=1e-10)
