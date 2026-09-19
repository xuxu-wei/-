"""从篇章设计和已交付课节生成正式教材网页目录。"""
import json
from pathlib import Path
import re
from course_content import notebooks, question_banks
from assessment import load_assessments
from terminology import annotate_text

ROOT = Path(__file__).resolve().parents[1]


def annotate_overview(chapter):
    """导览是独立阅读单元；标题不加长括注，正文首次注明词表中的英文。"""
    seen = set()
    def annotate(text):
        return annotate_text(text, seen=seen)
    for key in ['goals', 'prerequisites', 'focus']:
        assert chapter[key], f'Missing {key}: {chapter["title"]}'
        chapter[key] = annotate(chapter[key])
    chapter['knowledge'] = [annotate(text) for text in chapter['knowledge']]
    assert chapter['knowledge']


def validate_design(parts, design):
    """Keep the generated navigation aligned with the authoritative chapter map."""
    expected_parts = re.findall(r'^### 第 (\d+) 篇：(.+)$', design, re.M)
    expected_chapters = re.findall(r'^\| (\d+\.\d+) ([^|]+) \|', design, re.M)
    assert expected_parts and expected_chapters, 'Missing curriculum tables'
    assert [(p['id'], p['title']) for p in parts] == expected_parts, 'Outline parts differ from curriculum'
    actual = [(c['id'], c['title']) for p in parts for c in p['chapters']]
    assert actual == [(cid, title.strip()) for cid, title in expected_chapters], 'Outline chapters differ from curriculum'
    assert len({cid for cid, _ in actual}) == len(actual), 'Duplicate chapter identity'
    for part in parts:
        assert [c['id'] for c in part['chapters']] == [f'{part["id"]}.{i}' for i in range(1, len(part['chapters']) + 1)], 'Invalid chapter numbering'


def build():
    design = (ROOT / 'docs/教材设计.md').read_text(encoding='utf-8')
    maths = dict(re.findall(r'^\| (数\d+) \| ([^|]+) \|', design, re.M))
    parts = []
    for path in sorted((ROOT / 'docs').glob('[0-9][0-9]-*.md')):
        source = path.read_text(encoding='utf-8')
        number = int(path.name[:2])
        title = path.stem[3:]
        chapters = []
        for match in re.finditer(r'^### (\d+)\.(\d+) (.+)\n([\s\S]*?)(?=^### |^## |\Z)', source, re.M):
            part, chapter, name, content = match.groups()
            def field(label):
                found = re.search(r'- \*\*' + label + r'\*\*：(.+)', content)
                text = found.group(1) if found else ''
                text = re.sub(r'\bE[1-3]\b', '对应练习', text)
                return re.sub(r'数\d+', lambda m: maths.get(m.group(), m.group()).strip(), text)
            order = [s.strip(' ；。') for s in re.split('[①②③④⑤⑥]', field('内容顺序')) if s.strip(' ；。')]
            chapters.append({'id': f'{part}.{chapter}', 'title': name,
                'url': f'/chapters/{int(part):02d}-{int(chapter):02d}-{name}/',
                'goals': field('教学目标'), 'prerequisites': field('直接先修'),
                'knowledge': order, 'focus': field('核验与反馈'),
                'available': False, 'lessons': []})
        parts.append({'id': str(number), 'title': title, 'url': f'/parts/{path.stem}/', 'chapters': chapters})
    validate_design(parts, design)
    all_lessons = notebooks()
    chapter_ids = {c['id'] for p in parts for c in p['chapters']}
    chapter_ids.update(p['id'] + '.summary' for p in parts)
    assert all(l.get('chapter_id') in chapter_ids for l in all_lessons), 'Published lesson lost its chapter'
    questions, _ = question_banks()
    assessments = load_assessments(questions)
    def attach(chapter, entries):
        chapter['lessons'] = entries
        chapter['available'] = bool(entries)
        for entry in entries:
            entry['questions'] = [{'id':q['id'],'slug':q['slug'],'title':q['title'],'type':q['type']}
                                  for q in questions if q['lesson_id']==entry['id']]
            if entry['id'] in assessments:
                assert len(entry['questions']) == len(assessments[entry['id']]['items'])
            else:
                assert 3<=len(entry['questions'])<=5
            entry['url']=chapter['url']+'practice/?question='+entry['questions'][0]['slug']
        chapter['visualization']=next((l['visualization'] for l in entries if l.get('visualization')),None)
    for part in parts:
        for chapter in part['chapters']:
            attach(chapter,[l for l in all_lessons if l.get('chapter_id')==chapter['id']])
        assessment_lessons=[l for l in all_lessons if l.get('chapter_id')==part['id']+'.summary']
        if assessment_lessons:
            part['assessment']={'id':part['id']+'.summary','assessment':True,'title':assessment_lessons[0]['title'],
                'url':part['url']+'综合练习/', **assessment_lessons[0]['overview']}
            attach(part['assessment'],assessment_lessons)
            annotate_overview(part['assessment'])
    for part in parts:
        for chapter in part['chapters']:
            annotate_overview(chapter)
    result = {'parts': parts}
    path = ROOT / 'web/course/catalog.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Course directory: {len(parts)} parts, {sum(len(p["chapters"]) for p in parts)} chapters; {sum(c["available"] for p in parts for c in p["chapters"])} available.')


if __name__ == '__main__':
    build()
