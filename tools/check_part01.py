"""检查第 1 篇正文边界、术语首现和逐题入口；不替代人工阅读与点击。"""
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit,parse_qs
import nbformat
from lesson_exercises import render_exercises

ROOT=Path(__file__).resolve().parents[1]
TERMS=json.loads((ROOT/'docs/术语对照.json').read_text(encoding='utf-8'))
LOOKUP={t['zh']:t for t in TERMS}
PATTERN=re.compile('|'.join(re.escape(t) for t in sorted(LOOKUP,key=len,reverse=True)))


def reading_text(text):
    text=re.sub(r'```.*?```','',text,flags=re.S)
    text=re.sub(r'^#{1,6}.*$','',text,flags=re.M)
    return re.sub(r'\[[^\]]*\]\([^)]*\)|`[^`]+`','',text)


def check_terms(text):
    text=reading_text(text);seen=set();issues=[]
    for match in PATTERN.finditer(text):
        term=match.group()
        if term in seen:continue
        seen.add(term);t=LOOKUP[term];suffix='（'+t['en']+('，'+t['abbr'] if 'abbr' in t else '')+'）'
        if not text[match.end():].startswith(suffix):issues.append(term)
    return issues,sorted(seen)


def main():
    questions=json.loads((ROOT/'exercises/01-看见系统/questions.json').read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'notebooks/01-看见系统/catalog.json').read_text(encoding='utf-8'))
    course=json.loads((ROOT/'web/course/catalog.json').read_text(encoding='utf-8'))['parts'][0]
    chapters={c['id']:c for c in [*course['chapters'],course['assessment']]}
    issues=[];evidence=[];links=0
    for q in questions:
        strings=[q['statement'],*(p['description'] for p in q.get('parameters',[])+q.get('returns',[])),q.get('contract',''),*q.get('constraints',[]),*(s['explanation'] for s in q.get('samples',[])),*(o['text'] for o in q.get('options',[])),q.get('hint','')]
        missing,terms=check_terms('\n'.join(strings));issues.extend(f'{q["id"]}: {t}' for t in missing)
        evidence.append({'unit':q['id'],'terms':terms})
    for lesson in catalog:
        path=ROOT/lesson['path'];nb=nbformat.read(path,as_version=4)
        core='\n'.join(c.source for c in nb.cells[:-1] if c.cell_type=='markdown')
        missing,terms=check_terms(core);issues.extend(f'{lesson["id"]}: {t}' for t in missing)
        assert nb.cells[-1].source.startswith(render_exercises(lesson['id'],questions,chapters[lesson['chapter_id']]['url']+'practice/'))
        for cell in nb.cells:
            if cell.cell_type!='markdown':continue
            for label,target in re.findall(r'\[([^\]]+)\]\(([^)]+)\)',cell.source):
                url=urlsplit(target)
                if not url.scheme:
                    assert not url.path.endswith('.html')
                    assert (path.parent/unquote(url.path)).is_file(),target
                elif url.hostname=='127.0.0.1' and url.path.endswith('/practice/'):
                    slug=parse_qs(url.query)['question'][0]
                    assert any(q['slug']==slug and q['lesson_id']==lesson['id'] for q in questions);links+=1
        evidence.append({'unit':lesson['id'],'terms':terms})
    report={'notebooks':len(catalog),'questions':len(questions),'question_links':links,'first_use':evidence,'issues':issues}
    (ROOT/'.work/m2/teaching-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert links==38
    if issues:raise SystemExit('\n'.join(issues))
    print('Part 01 teaching check: 9 notebooks, 38 question links, first-use annotations consistent.')


if __name__=='__main__':main()
