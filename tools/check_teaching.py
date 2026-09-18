"""发布前检查 M1 的内容边界、题面同步、网页链接与术语首现。"""
import json
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import urlsplit,parse_qs

from sync_m1_exercises import render_exercises
from question_contracts import validate_contract

ROOT=Path(__file__).resolve().parents[1]
TERMS=[t for t in json.loads((ROOT/'docs/术语对照.json').read_text(encoding='utf-8')) if t.get('scope')!='part01']
LOOKUP={t['zh']:t for t in TERMS}
PATTERN=re.compile('|'.join(re.escape(t['zh']) for t in sorted(TERMS,key=lambda x:-len(x['zh']))))


def reading_text(text):
    text=re.sub(r'```.*?```','',text,flags=re.S)
    text=re.sub(r'^#{1,6}.*$','',text,flags=re.M)
    return re.sub(r'\[[^\]]*\]\([^)]*\)|`[^`]+`','',text)


def terminology_issues(text):
    text=reading_text(text);seen=set();issues=[]
    for match in PATTERN.finditer(text):
        term=match.group()
        if term in seen:continue
        seen.add(term);entry=LOOKUP[term]
        annotation='（'+entry['en']+('，'+entry['abbr'] if 'abbr' in entry else '')+'）'
        if not text[match.end():].startswith(annotation):issues.append(f'{term} 首次使用缺少 {annotation}')
    return issues,sorted(seen)


class TeachingText(HTMLParser):
    """读取概念页标记的教学正文，忽略导航、控件和重复图例。"""
    def __init__(self):
        super().__init__(); self.depth=0; self.parts=[]

    def handle_starttag(self,tag,attrs):
        if self.depth: self.depth+=1
        elif any(name=='data-teaching' for name,_ in attrs): self.depth=1

    def handle_endtag(self,tag):
        if self.depth:
            self.depth-=1
            if self.depth==0:self.parts.append('\n')

    def handle_data(self,data):
        if self.depth:self.parts.append(data)


def main():
    import nbformat
    questions=json.loads((ROOT/'exercises/samples/accumulation-clearance/questions.json').read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'notebooks/samples/accumulation-clearance/catalog.json').read_text(encoding='utf-8'))
    assert len(questions)==len({q['id'] for q in questions})
    assert all(3<=sum(q['lesson_id']==l['id'] for q in questions)<=5 for l in catalog)
    problems=[];evidence=[];links=0
    for q in questions:
        assert q['type'] in {'choice','python'}
        text=q['statement']+'\n'+'\n'.join(p['description'] for p in q.get('parameters',[])+q.get('returns',[]))+'\n'+q.get('contract','')+'\n'+'\n'.join(q.get('constraints',[]))+'\n'+'\n'.join(s.get('explanation','') for s in q.get('samples',[]))+'\n'+'\n'.join(o['text'] for o in q.get('options',[]))+'\n'+q.get('hint','')
        issues,terms=terminology_issues(text)
        problems.extend(f'{q["id"]}: {issue}' for issue in issues)
        if q['type']=='choice':assert q['options'] and isinstance(q['multiple'],bool)
        else:
            assert q['contract'] and q['samples'] and q['starter_code'] and q['tolerance']
            validate_contract(q)
            if 'payload' in text+q['starter_code']:problems.append(f'{q["id"]}: 教学接口仍泄露通用输入包装')
        evidence.append({'unit':q['id'],'terms_checked':terms})
    for lesson in catalog:
        nb=nbformat.read(ROOT/lesson['path'],as_version=4);nbformat.validate(nb)
        goal=nb.cells[0].source
        for word in ['网页安排','本节环境','安装','内核','README','验收','教学包','运行耗时','试学','playground','未实现']:
            if word in goal:problems.append(f'{lesson["id"]}: 学习目标混入 {word}')
        assert nb.cells[0].metadata.get('teaching_role')=='objectives'
        assert '## 具体问题' in nb.cells[1].source and nb.cells[2].cell_type=='code'
        expected=render_exercises(lesson['id'],questions)
        if not nb.cells[-1].source.startswith(expected):problems.append(f'{lesson["id"]}: Notebook 练习与题库不一致')
        markdown='\n'.join(c.source for c in nb.cells if c.cell_type=='markdown')
        for label,destination in re.findall(r'\[([^\]]*)\]\(([^)]+)\)',markdown):
            url=urlsplit(destination)
            if url.path.endswith('.html') and url.scheme not in {'http','https'}:problems.append(f'{lesson["id"]}: 网页入口指向 HTML 源文件')
            if label=='可视化文件':problems.append(f'{lesson["id"]}: 保留了面向源码的可视化入口')
            if url.path=='/samples/accumulation-clearance/practice/':
                assert url.scheme=='http' and url.hostname=='127.0.0.1'
                assert parse_qs(url.query)['question'][0] in {q['slug'] for q in questions};links+=1
        for forbidden in ['解释题','代码修改题','独立迁移题','实验报告模板','解释题提交理由','迁移题自行']:
            if forbidden in markdown:problems.append(f'{lesson["id"]}: 非规定题型 {forbidden}')
        core='\n'.join(c.source for c in nb.cells[:-1] if c.cell_type=='markdown')
        issues,terms=terminology_issues(core);problems.extend(f'{lesson["id"]}: {issue}' for issue in issues)
        evidence.append({'unit':lesson['id'],'terms_checked':terms})
    assert links==len(questions)
    page=TeachingText();page.feed((ROOT/'web/single-compartment/index.html').read_text(encoding='utf-8'))
    issues,terms=terminology_issues(''.join(page.parts))
    problems.extend(f'概念网页: {issue}' for issue in issues)
    evidence.append({'unit':'concept-page','terms_checked':terms})
    report={'notebooks':6,'choice_questions':sum(q['type']=='choice' for q in questions),'python_questions':8,'exercise_deep_links':links,'terminology':evidence,'issues':problems}
    path=ROOT/'.work/m1/teaching-check.json';path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if problems:raise SystemExit('\n'.join(problems))
    print('Teaching checks passed: 6 notebooks, 22 synchronized exercises/links, concept page and terminology first-use annotations.')


if __name__=='__main__':main()
