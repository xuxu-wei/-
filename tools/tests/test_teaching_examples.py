import json
import ast
import copy
from pathlib import Path
import sys
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from teaching_examples import example_view, example_markdown
from question_contracts import validate_contract, contract_markdown
from practice import difference

QUESTIONS=[]
SOLUTIONS={}
for path in sorted((ROOT/'exercises').glob('[0-9]*/questions.json')):
    QUESTIONS.extend(json.loads(path.read_text(encoding='utf-8')))
    SOLUTIONS.update(json.loads(path.with_name('solutions.json').read_text(encoding='utf-8')))


def test_all_code_examples_have_separate_readable_inputs_and_outputs():
    for q in QUESTIONS:
        if q['type']!='python':continue
        view=example_view(q)
        for kind in ['input','output']:
            assert view[kind]['description']
            assert any(table['rows'] for table in view[kind]['tables'])
            for table in view[kind]['tables']:
                assert all(len(row)==len(table['columns']) for row in table['rows'])
        markdown=example_markdown(q)
        assert '**输入样例**' in markdown and '**输出样例**' in markdown
        assert '```json' not in markdown and 'payload' not in markdown
        assert markdown.count('```python')==2
        assert '**样例解释**' in markdown
        validate_contract(q)
        assert 'payload' not in contract_markdown(q)


def test_tables_preserve_named_parameters_and_raw_output_precision():
    q=next(q for q in QUESTIONS if q['id']=='p02-piecewise')
    view=example_view(q)
    rows=view['input']['tables'][0]['rows']
    assert [row[0] for row in rows]==[p['name'] for p in q['parameters']]
    assert any(row[0]=='bounds' and '[' in row[2] for row in rows)
    scope={};exec(view['output']['code'],scope)
    assert json.loads(json.dumps(scope['expected_output']))==q['samples'][0]['expected']
    flags=example_view(next(q for q in QUESTIONS if q['id']=='p02-step-properties'))
    assert [row[2] for row in flags['output']['tables'][0]['rows']]==['-0.5','True','False']


@pytest.mark.parametrize('question',[q for q in QUESTIONS if q['type']=='python'],ids=lambda q:q['slug'])
def test_copied_python_examples_run_and_preserve_the_unrounded_expected_values(question,capsys):
    view=example_view(question)
    namespace={}
    exec(SOLUTIONS[question['id']],namespace)
    exec(view['input']['code'],namespace)
    exec(view['output']['code'],namespace)
    assert {p['name']:namespace[p['name']] for p in question['parameters']}==question['samples'][0]['arguments']
    normalized=lambda value:json.loads(json.dumps(value))
    assert normalized(namespace['expected_output'])==question['samples'][0]['expected']
    assert difference(normalized(namespace['result']),normalized(namespace['expected_output']),question['tolerance']) is None
    assert ast.literal_eval(capsys.readouterr().out.strip())==namespace['result']


def test_contract_check_rejects_generic_wrappers_and_template_drift():
    original=next(q for q in QUESTIONS if q['type']=='python')
    for change in ['wrapper','template','sample']:
        q=copy.deepcopy(original)
        if change=='wrapper':q['parameters'][0]['name']='payload'
        elif change=='template':q['starter_code']='def solve(payload):\n    return []\n'
        else:q['samples'][0]['arguments'].pop(q['parameters'][0]['name'])
        with pytest.raises(ValueError):validate_contract(q)
