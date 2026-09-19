"""Human-written semantic counterexamples, not expectations from the matcher."""
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from terminology import annotate_text, check_text, TerminologyError


@pytest.mark.parametrize('source,expected', [
    ('重复数和系数组合', '重复数和系数组合'),
    ('复数模态', '复数（complex number）模态（mode）'),
    ('Python 数组', 'Python 数组（array）'),
    ('参数组合', '参数（parameter）组合'),
    ('重采样次数', '重采样（resampling）次数'),
    ('采样率和采样', '采样率（sampling rate）和采样（sampling）'),
    ('滞回与滞后输入', '滞回（hysteresis）与滞后输入（lagged input）'),
    ('滞后项', '滞后项（lagged term）'),
    ('均值场变分推断', '均值场变分推断（mean-field variational inference）'),
    ('自助粒子滤波', '自助粒子滤波（bootstrap particle filter）'),
    ('局部秩序与矩阵的秩', '局部秩序与矩阵（matrix）的秩（rank）'),
    ('周期二值格与周期二轨道', '周期二值格与周期二（period-two cycle）轨道'),
])
def test_independent_phrase_cases(source, expected):
    assert annotate_text(source) == expected
    assert annotate_text(expected) == expected
    assert not check_text(expected)[0]


@pytest.mark.parametrize('source,kind', [
    ('重复数（complex number）', 'compound'),
    ('系数组（array）合', 'compound'),
    ('重采样（sampling）', 'translation'),
    ('滞后（hysteresis）输入', 'translation'),
    ('数组（vector）', 'translation'),
    ('参数（parameter）（parameter）', 'duplicate'),
    ('数组（array（array））', 'nested'),
    ('数组(array (array))', 'nested'),
    ('滞后', 'ambiguous'),
    ('局部秩（rank）序', 'compound'),
    ('周期二（period-two cycle）值格', 'compound'),
])
def test_bad_annotations_are_rejected_not_certified(source, kind):
    assert kind in {issue.kind for issue in check_text(source)[0]}
    with pytest.raises(TerminologyError):
        annotate_text(source)


def test_explicit_sense_and_conflict_do_not_silently_override():
    assert annotate_text('滞后', senses={'滞后': 'lag'}) == '滞后（lag）'
    assert annotate_text('滞后（lag），再次滞后') == '滞后（lag），再次滞后'
    with pytest.raises(TerminologyError):
        annotate_text('滞后（hysteresis）', senses={'滞后': 'lag'})


def test_correct_manual_variants_and_mathematical_parentheses():
    for text in ['卡尔曼滤波（Kalman filter，KF）', '重要性采样（importance sampling）',
                 '参数（parameter）组合', '负对数似然（likelihood）（去掉与 k 无关的项）',
                 '输出（output）(x−mean)/scale', '所追踪物质总量（tracked amount）（U/T）']:
        assert annotate_text(text) == text
        assert not check_text(text)[0]


def test_literal_content_remains_unchanged_and_does_not_consume_first_use():
    literal = ('# 数组\n\n`数组`\n```python\n参数 = "重复数（complex number）"\n```\n'
               '$数组$ $$参数$$ \\(数组\\) \\[参数\\]\n'
               '[数组](../参数.ipynb) [数组](../folder(test)/参数.ipynb) https://example.com/数组\n')
    assert annotate_text(literal + '数组') == literal + '数组（array）'
    assert not check_text(literal)[0]


def test_part_scope_prevents_splitting_future_long_terms():
    assert annotate_text('重采样', part=5) == '重采样'
    assert annotate_text('重采样', part=6) == '重采样（resampling）'


def test_check_all_occurrences_even_after_correct_first_annotation():
    issues, _ = check_text('数组（array），数组（complex number）')
    assert any(i.kind == 'translation' for i in issues)


def test_failure_does_not_poison_caller_first_use_state():
    seen = set()
    with pytest.raises(TerminologyError):
        annotate_text('数组；滞后', seen=seen)
    assert seen == set()
    assert annotate_text('数组', seen=seen) == '数组（array）'
    assert annotate_text('数组', seen=seen) == '数组'


def test_inequalities_are_not_html_tags_and_links_stay_literal():
    assert annotate_text('x<1 时正定，V>0。', part=4) == 'x<1 时正定（positive definite），V>0。'
    link = '<a href="../数组.ipynb">'
    assert annotate_text(link+'数组</a>') == link+'数组（array）</a>'


def test_overview_generator_uses_the_same_conservative_rule():
    from build_course import annotate_overview
    chapter = dict(goals='重复数和系数组合', prerequisites='Python 数组', focus='重采样次数', knowledge=['复数模态'])
    annotate_overview(chapter)
    assert chapter['goals'] == '重复数和系数组合'
    assert chapter['prerequisites'] == 'Python 数组（array）'
    assert chapter['focus'] == '重采样（resampling）次数'
    assert chapter['knowledge'] == ['复数（complex number）模态（mode）']
