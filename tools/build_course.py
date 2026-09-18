"""从篇章设计生成网页目录；样章始终在独立分支，不计入正式教材进度。"""
import json
from pathlib import Path
import re
from course_content import notebooks, question_banks

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = 'samples/accumulation-clearance'
TERMS = json.loads((ROOT / 'docs/术语对照.json').read_text(encoding='utf-8'))
TERM_MAP = {term['zh']: term for term in TERMS}
TERM_PATTERN = re.compile('|'.join(re.escape(t['zh']) for t in sorted(TERMS, key=lambda t: -len(t['zh']))))


def annotate_overview(chapter):
    """导览是独立阅读单元；标题不加长括注，正文首次注明词表中的英文。"""
    seen = set()
    def annotate(text):
        def replace(match):
            zh = match.group()
            if zh in seen:
                return zh
            seen.add(zh)
            term = TERM_MAP[zh]
            suffix = '（' + term['en'] + ('，' + term['abbr'] if 'abbr' in term else '') + '）'
            return zh if text[match.end():].startswith(suffix) else zh + suffix
        return TERM_PATTERN.sub(replace, text)
    for key in ['goals', 'prerequisites', 'focus']:
        assert chapter[key], f'Missing {key}: {chapter["title"]}'
        chapter[key] = annotate(chapter[key])
    chapter['knowledge'] = [annotate(text) for text in chapter['knowledge']]
    assert chapter['knowledge']


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
    assert len(parts) == 12 and sum(len(p['chapters']) for p in parts) == 55
    all_lessons = notebooks()
    questions, _ = question_banks()
    def attach(chapter, entries):
        chapter['lessons'] = entries
        chapter['available'] = bool(entries)
        for entry in entries:
            entry['questions'] = [{'id':q['id'],'slug':q['slug'],'title':q['title'],'type':q['type']}
                                  for q in questions if q['lesson_id']==entry['id']]
            assert 3<=len(entry['questions'])<=5
            entry['url']=chapter['url']+'practice/?question='+entry['questions'][0]['slug']
        chapter['visualization']=next((l['visualization'] for l in entries if l.get('visualization')),None)
    for part in parts:
        for chapter in part['chapters']:
            attach(chapter,[l for l in all_lessons if l.get('chapter_id')==chapter['id']])
        assessment_lessons=[l for l in all_lessons if l.get('chapter_id')==part['id']+'.summary']
        if assessment_lessons:
            part['assessment']={'id':part['id']+'.summary','assessment':True,'title':assessment_lessons[0]['title'],
                'url':part['url']+'综合练习/','goals':'综合辨认边界、变量与收支，比较候选规则，解释证据范围。',
                'prerequisites':'本篇四章。','focus':'分开迁移与内部生成、局部与整体、计算核验与机制验证。',
                'knowledge':['视野计数 → 选择边界与生成项','温度调节 → 核对反馈与旁路','清除比较 → 保留独立预测和限制']}
            attach(part['assessment'],assessment_lessons)
            annotate_overview(part['assessment'])
    lessons = [l for l in all_lessons if l['path'].startswith(f'notebooks/{SAMPLE}/')]
    for lesson in lessons:
        lesson['questions'] = [{'id': q['id'], 'slug': q['slug'], 'title': q['title'], 'type': q['type']}
                               for q in questions if q['lesson_id'] == lesson['id']]
        lesson['url'] = f'/samples/accumulation-clearance/practice/?question={lesson["questions"][0]["slug"]}'
    sample = {'id': 'accumulation-clearance', 'title': '体内物质的积累与清除',
        'url': '/samples/accumulation-clearance/', 'available': True, 'visualization':'web/single-compartment/index.html', 'lessons': lessons,
        'goals': '辨认存量与流量；用收支建立更新规则；连接连续模型与数值近似；独立改变输入并检验结果。',
        'prerequisites': '基础 Python、中学数学与函数读图。导数、定积分和误差检查在单元内引入。',
        'focus': '区分物质量和流率、平衡位置和接近速度；把精度、数值稳定性与非负性分开检查；在输入变化点分段计算。',
        'knowledge': ['边界与单位 → 确定什么在积累', '输入与清除 → 写出逐步收支', '平衡与反馈 → 解释动态过程',
                      '变化率与连续模型 → 对照解析解', '步长与误差 → 检验数值结果', '时变输入 → 完成迁移实验']}
    for chapter in [sample, *(chapter for part in parts for chapter in part['chapters'])]:
        annotate_overview(chapter)
    result = {'parts': parts, **({'sample':sample} if lessons else {})}
    path = ROOT / 'web/course/catalog.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Course directory: 12 parts, 55 chapters; {sum(c["available"] for p in parts for c in p["chapters"])} available. Sample is separate.')


if __name__ == '__main__':
    build()
