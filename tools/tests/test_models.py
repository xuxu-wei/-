"""直接核验 Notebook 中的教学实现，独立参考采用高精度十进制运算。"""
import ast
from decimal import Decimal, localcontext
import json
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]


def notebook_functions(name):
    notebook = json.loads((ROOT / 'notebooks' / 'samples' / 'accumulation-clearance' / name).read_text(encoding='utf-8'))
    namespace = {'np': np}
    for cell in notebook['cells']:
        if cell['cell_type'] == 'code' and 'model' in cell.get('metadata', {}).get('tags', []):
            tree = ast.parse(''.join(cell['source']))
            assert all(isinstance(node, ast.FunctionDef) for node in tree.body)
            exec(compile(tree, name, 'exec'), namespace)
    return namespace


def decimal_reference(t, u, k, A0):
    with localcontext() as context:
        context.prec = 60
        t, u, k, A0 = map(lambda x: Decimal(str(x)), (t, u, k, A0))
        if k == 0:
            return float(A0 + u*t)
        decay = (-k*t).exp()
        return float(A0*decay + u/k*(1-decay))


CASES = [(1, 0.5, 0), (0, 0.75, 10), (3, 0, 2), (0, 0, 3), (1, 0.5, 2), (1, 1e-12, 2)]


@pytest.mark.parametrize('notebook', ['04-rates-ode.ipynb', '05-numerical-checks.ipynb', '06-transfer-experiment.ipynb'])
@pytest.mark.parametrize('parameters', CASES)
def test_analytic_solution_against_decimal(notebook, parameters):
    u, k, A0 = parameters
    function = notebook_functions(notebook)['exact_amount']
    t = np.array([0, 0.1, 1, 5, 20])
    reference = np.array([decimal_reference(time, u, k, A0) for time in t])
    np.testing.assert_allclose(function(t, u, k, A0), reference, atol=1e-10, rtol=1e-10)


@pytest.mark.parametrize('notebook', ['02-accumulation-clearance.ipynb', '03-equilibrium-feedback.ipynb', '05-numerical-checks.ipynb'])
def test_euler_balance_and_hand_calculation(notebook):
    euler = notebook_functions(notebook)['euler']
    t, a = euler()
    np.testing.assert_allclose(a[:4], [0, .1, .195, .28525], atol=1e-12)
    assert np.max(np.abs(np.diff(a)-np.diff(t)*(1-.5*a[:-1]))) < 1e-10
    for h in [0, -1, np.nan, .3]:
        with pytest.raises(ValueError):
            euler(h=h)


def test_accuracy_stability_and_positivity_are_distinct():
    namespace = notebook_functions('05-numerical-checks.ipynb')
    errors = []
    for h in [.5, .25, .125]:
        t, a = namespace['euler'](h=h)
        errors.append(np.max(np.abs(a-namespace['exact_amount'](t))))
    orders = np.log2(np.array(errors[:-1])/errors[1:])
    assert np.all((orders > .8) & (orders < 1.2))
    euler = namespace['euler']
    assert np.all(euler(u=0, k=.75, A0=10, h=1)[1] >= 0)
    assert euler(u=0, k=.75, A0=10, h=2)[1][1] == -5
    np.testing.assert_allclose(abs(euler(u=0, k=.5, A0=10, h=4)[1]), 10)
    assert euler(u=0, k=.5, A0=10, h=5)[1][-1] == 50.625


@pytest.mark.parametrize('boundaries,rates,h', [([0, 10, 20], [2, 0], .1), ([0, 7.3, 20], [2, 0], .4), ([0, 0.6, 1.2], [1, 2], .2)])
def test_piecewise_grid_and_independent_reference(boundaries, rates, h):
    run = notebook_functions('06-transfer-experiment.ipynb')['piecewise_experiment']
    t, a, reference, used = run(boundaries, rates, h=h)
    assert set(boundaries).issubset(t)
    assert np.all(np.diff(t) > 0)
    assert np.max(np.diff(t)) <= h+1e-10
    expected = 0.0
    for left, right, rate in zip(boundaries[:-1], boundaries[1:], rates):
        expected = decimal_reference(right-left, rate, .5, expected)
    assert abs(reference[-1]-expected) < 1e-10
    assert np.max(np.abs(np.diff(a)-np.diff(t)*(used-.5*a[:-1]))) < 1e-10
    refined = run(boundaries, rates, h=h/2)
    assert max(abs(refined[1]-refined[2])) < max(abs(a-reference))
    t, a, reference, _ = run(boundaries, rates, k=0, h=h)
    assert abs(a[-1]-np.dot(np.diff(boundaries), rates)) < 1e-10
    np.testing.assert_allclose(a, reference, atol=1e-10)
