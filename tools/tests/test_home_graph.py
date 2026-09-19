"""Verify the atlas is reproducible, honest about delivery, and traceable to lessons."""
import importlib.util
import hashlib
import json
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('home_graph_builder', ROOT / 'tools/build_home_graph.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CATALOG = json.loads((ROOT / 'web/course/catalog.json').read_text(encoding='utf-8'))
TERMS = json.loads((ROOT / 'docs/术语对照.json').read_text(encoding='utf-8'))
STORED_GRAPH = json.loads((ROOT / 'web/home/graph.json').read_text(encoding='utf-8'))
CATALOG_SHA = hashlib.sha256((ROOT / 'web/course/catalog.json').read_bytes()).hexdigest()
GRAPH = module.build_graph(CATALOG, TERMS, catalog_sha256=CATALOG_SHA)


def test_generated_graph_is_current_and_deterministic():
    assert GRAPH == STORED_GRAPH
    assert GRAPH['source']['catalogSha256'] == CATALOG_SHA
    chapters = [c for p in CATALOG['parts'] for c in p['chapters']]
    assert [n['id'] for n in GRAPH['nodes'] if n['kind'] == 'part'] == [p['id'] for p in CATALOG['parts']]
    assert [n['id'] for n in GRAPH['nodes'] if n['kind'] == 'chapter'] == [c['id'] for c in chapters]
    assert len({n['id'] for n in GRAPH['nodes']}) == len(GRAPH['nodes'])


def test_source_lenses_are_faithful_and_application_is_attributed():
    assert [t['label'] for t in GRAPH['taxonomy']] == [
        '系统方法论', '系统演化论', '系统认知论', '系统调控论', '系统实践论']
    assert GRAPH['source']['taxonomyPage'] == 293
    assert '本站设计' in GRAPH['source']['note']
    assert '不表示自然因果' in GRAPH['source']['note']


def test_all_concepts_have_real_lesson_bindings_or_explicitly_remain_planned():
    lessons = {l['id']: l for p in CATALOG['parts'] for c in p['chapters'] for l in c['lessons']}
    concepts = [n for n in GRAPH['nodes'] if n['kind'] == 'concept']
    for concept in concepts:
        if concept['available']:
            lesson = lessons[concept['lessonId']]
            assert concept['lessonNumber'] == lesson['number']
            assert concept['lessonTitle'] == lesson['title']
            assert concept['url'] == lesson['url']
            assert concept['parentId'] == lesson['chapter_id']
            assert concept['questionIds'] == [q['id'] for q in lesson['questions']]
        else:
            assert concept['lessonId'] is concept['lessonNumber'] is concept['lessonTitle'] is None
            assert not concept['questionIds'] and concept['published'] == 0
    for lesson in lessons.values():
        assert 2 <= sum(c['lessonId'] == lesson['id'] for c in concepts) <= 4


def test_edges_have_valid_endpoints_and_exact_direct_prerequisite_counts():
    nodes = {n['id']: n for n in GRAPH['nodes']}
    keys = set()
    for edge in GRAPH['edges']:
        assert edge['source'] in nodes and edge['target'] in nodes
        assert edge['source'] != edge['target'] and edge['weight'] > 0
        key = (edge['source'], edge['target'], edge['kind'])
        assert key not in keys
        keys.add(key)
        if edge['kind'] == 'part-prerequisite':
            count = sum(e['kind'] == 'prerequisite' and e['source'].split('.')[0] == edge['source']
                        and e['target'].split('.')[0] == edge['target'] for e in GRAPH['edges'])
            assert edge['weight'] == count
    for node in nodes.values():
        assert all(nodes[c]['parentId'] == node['id'] for c in node['children'])


def test_prerequisite_ranges_and_math_prose_are_not_confused():
    valid = {'2.1', '2.2', '2.3', '2.4', '3.1', '5.1'}
    assert module.prerequisite_ids('第 2.2—2.4 章；数学：5.1 不应成为先修', valid) == ['2.2', '2.3', '2.4']
    assert module.prerequisite_ids('3.1、2.4；数学：矩阵', valid) == ['2.4', '3.1']
    assert module.prerequisite_ids('入口；中学函数', valid) == []


def test_partial_parts_include_assessment_but_preserve_unpublished_coverage():
    by_id = {n['id']: n for n in GRAPH['nodes']}
    for part in CATALOG['parts']:
        node = by_id[part['id']]
        assert node['questionIds'] == module.question_ids(part)
        assert node['published'] == sum(c['available'] for c in part['chapters'])
        assert node['total'] == len(part['chapters'])
        assert len(node['questionIds']) == len(set(node['questionIds']))
        assert node['assessmentIds'] == [l['id'] for l in part.get('assessment', {}).get('lessons', [])]


def test_deferred_mathematics_is_not_promoted_to_a_current_concept():
    variational = [n['title'] for n in GRAPH['nodes'] if n['parentId'] == '9.3']
    assert '自动微分' not in variational
    assert '证据下界' in variational and '均值场近似' in variational
    for chapter in (c for p in CATALOG['parts'] for c in p['chapters'] if not c['available']):
        assert 2 <= len(module.planned_concepts(chapter)) <= 4


def test_atomic_write_replaces_only_with_complete_json(tmp_path):
    dest = tmp_path / 'graph.json'
    dest.write_text('{"previous":true}', encoding='utf-8')
    module.atomic_write_graph({'title': '系统科学', 'nodes': []}, dest)
    assert json.loads(dest.read_text(encoding='utf-8')) == {'title': '系统科学', 'nodes': []}
    assert list(tmp_path.iterdir()) == [dest]


def test_failed_replacement_preserves_previous_artifact(tmp_path, monkeypatch):
    dest = tmp_path / 'graph.json'
    previous = b'{"previous":true}\n'
    dest.write_bytes(previous)
    def cannot_replace(source, target):
        assert Path(source).parent == dest.parent
        assert json.loads(Path(source).read_text(encoding='utf-8')) == {'new': True}
        raise OSError('Simulated replacement failure')
    monkeypatch.setattr(module.os, 'replace', cannot_replace)
    with pytest.raises(OSError, match='replacement failure'):
        module.atomic_write_graph({'new': True}, dest)
    assert dest.read_bytes() == previous
    assert list(tmp_path.iterdir()) == [dest]


def test_invalid_new_lesson_leaves_existing_graph_untouched(tmp_path):
    (tmp_path / 'web/course').mkdir(parents=True)
    (tmp_path / 'web/home').mkdir(parents=True)
    (tmp_path / 'docs').mkdir()
    catalog = json.loads(json.dumps(CATALOG))
    catalog['parts'][0]['chapters'][0]['lessons'][0]['id'] = 'NEW-UNREVIEWED-LESSON'
    (tmp_path / 'web/course/catalog.json').write_text(json.dumps(catalog), encoding='utf-8')
    (tmp_path / 'docs/术语对照.json').write_text(json.dumps(TERMS), encoding='utf-8')
    dest = tmp_path / 'web/home/graph.json'
    previous = b'{"previous":true}\n'
    dest.write_bytes(previous)
    with pytest.raises(ValueError, match='Review concept labels'):
        module.build(tmp_path)
    assert dest.read_bytes() == previous


def test_catalog_change_during_build_preserves_previous_graph(tmp_path, monkeypatch):
    (tmp_path / 'web/course').mkdir(parents=True)
    (tmp_path / 'web/home').mkdir(parents=True)
    (tmp_path / 'docs').mkdir()
    catalog_path = tmp_path / 'web/course/catalog.json'
    catalog_path.write_text(json.dumps(CATALOG), encoding='utf-8')
    (tmp_path / 'docs/术语对照.json').write_text(json.dumps(TERMS), encoding='utf-8')
    dest = tmp_path / 'web/home/graph.json'
    previous = b'{"previous":true}\n'
    dest.write_bytes(previous)
    original_build = module.build_graph
    def concurrent_update(*args, **kwargs):
        graph = original_build(*args, **kwargs)
        catalog_path.write_bytes(catalog_path.read_bytes() + b'\n')
        return graph
    monkeypatch.setattr(module, 'build_graph', concurrent_update)
    with pytest.raises(RuntimeError, match='发生变化'):
        module.build(tmp_path)
    assert dest.read_bytes() == previous
