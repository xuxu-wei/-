"""检查正式教材的正文边界、题面同步、术语和链接；不替代人工审读。"""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, unquote, urlsplit

import nbformat
from course_content import notebooks, question_banks
from lesson_exercises import render_exercises
from question_contracts import validate_contract

ROOT = Path(__file__).resolve().parents[1]
TERMS = json.loads((ROOT / 'docs/术语对照.json').read_text(encoding='utf-8'))


def check_terms(text, part):
    text = re.sub(r'```.*?```|\$\$.*?\$\$|\$[^$\n]+\$', '', text, flags=re.S)
    text = re.sub(r'^#{1,6}.*$', '', text, flags=re.M)
    text = re.sub(r'\[[^\]]*\]\([^)]*\)|`[^`]+`', '', text)
    entries = {t['zh']: t for t in TERMS if int(t.get('scope', 'part00')[4:]) <= part}
    pattern = re.compile('|'.join(re.escape(t) for t in sorted(entries, key=len, reverse=True)))
    seen, issues = set(), []
    for match in pattern.finditer(text):
        term = match.group()
        if term in seen:
            continue
        seen.add(term)
        entry = entries[term]
        suffix = '（' + entry['en'] + ('，' + entry['abbr'] if 'abbr' in entry else '') + '）'
        if not text[match.end():].startswith(suffix):
            issues.append(term)
    return issues, sorted(seen)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--part', type=int)
    parser.add_argument('--work', default='m3')
    args = parser.parse_args()
    catalog = [l for l in notebooks() if l.get('chapter_id') and (args.part is None or int(l['chapter_id'].split('.')[0]) == args.part)]
    ids = {l['id'] for l in catalog}
    questions, _ = question_banks()
    questions = [q for q in questions if q['lesson_id'] in ids]
    course = json.loads((ROOT / 'web/course/catalog.json').read_text(encoding='utf-8'))
    chapters = {c['id']: c for p in course['parts'] for c in [*p['chapters'], *([p['assessment']] if 'assessment' in p else [])]}
    routes = {c['url'] + suffix for c in chapters.values() for suffix in ['', 'practice/', *(['explore/'] if c.get('visualization') else [])]}
    issues, evidence, links = [], [], 0
    for lesson in catalog:
        part = int(lesson['chapter_id'].split('.')[0])
        bank = [q for q in questions if q['lesson_id'] == lesson['id']]
        assert 3 <= len(bank) <= 5, lesson['id']
        for q in bank:
            assert q['type'] in {'choice', 'python'}
            if q['type'] == 'python':
                validate_contract(q)
                assert 'payload' not in q['starter_code']
            strings = [q['statement'], *(p['description'] for p in q.get('parameters', []) + q.get('returns', [])), q.get('contract', ''), *q.get('constraints', []), *(s['explanation'] for s in q.get('samples', [])), *(o['text'] for o in q.get('options', [])), q.get('hint', '')]
            missing, terms = check_terms('\n'.join(strings), part)
            issues.extend(f'{q["id"]}: 首现缺少英文：{t}' for t in missing)
            evidence.append({'unit': q['id'], 'terms': terms})
        path = ROOT / lesson['path']
        nb = nbformat.read(path, as_version=4)
        nbformat.validate(nb)
        assert nb.cells[0].metadata.get('teaching_role') == 'objectives'
        goal = nb.cells[0].source.replace('核验收支', '核对收支')
        for word in ['网页', '内核', '安装', '验收', 'playground', '未实现']:
            if word in goal:
                issues.append(f'{lesson["id"]}: 目标区混入制作/操作信息 {word}')
        expected = render_exercises(lesson['id'], questions, chapters[lesson['chapter_id']]['url'] + 'practice/')
        if not nb.cells[-1].source.startswith(expected):
            issues.append(f'{lesson["id"]}: 题面与题库不同步')
        for cell in nb.cells:
            if cell.cell_type != 'markdown':
                continue
            for label, destination in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', cell.source):
                url = urlsplit(destination)
                if not url.scheme and url.path:
                    assert not url.path.endswith('.html'), destination
                    assert (path.parent / unquote(url.path)).is_file(), destination
                elif url.hostname == '127.0.0.1':
                    assert url.scheme == 'http' and unquote(url.path) in routes, destination
                    if url.path.endswith('/practice/'):
                        slug = parse_qs(url.query)['question'][0]
                        assert any(q['slug'] == slug for q in bank), destination
                        links += 1
        core = '\n'.join(c.source for c in nb.cells[:-1] if c.cell_type == 'markdown')
        missing, terms = check_terms(core, part)
        issues.extend(f'{lesson["id"]}: 首现缺少英文：{t}' for t in missing)
        evidence.append({'unit': lesson['id'], 'terms': terms})
    assert links == len(questions)
    report = {'notebooks': len(catalog), 'questions': len(questions), 'question_links': links, 'first_use': evidence, 'issues': issues}
    target = ROOT / '.work' / args.work / 'teaching-check.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if issues:
        raise SystemExit('\n'.join(issues))
    print(f'Teaching check: {len(catalog)} notebooks, {len(questions)} synchronized questions and links; first-use annotations consistent.')


if __name__ == '__main__':
    main()
