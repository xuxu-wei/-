"""从唯一题面源同步 Notebook 的练习正文；--check 不改文件。"""
import argparse
import json
from pathlib import Path
from teaching_examples import example_markdown
from question_contracts import contract_markdown

ROOT=Path(__file__).resolve().parents[1]


def render_exercises(lesson_id,questions):
    parts=['## 练习与参考资料','先独立作答，再提交核对。每道题的题面和输入输出示例如下。']
    for number,q in enumerate([item for item in questions if item['lesson_id']==lesson_id],1):
        kind=('多项选择题' if q['multiple'] else '单项选择题') if q['type']=='choice' else 'Python 计算题'
        parts.append(f'### 第 {number} 题 · {kind}：{q["title"]}')
        parts.append(q['statement'])
        if q['type']=='choice':
            parts.append('\n'.join(f'- **{option["id"]}.** {option["text"]}' for option in q['options']))
        else:
            parts.append(contract_markdown(q))
            parts.append(example_markdown(q))
            parts.append(f'数值核验允许绝对误差 {q["tolerance"]["atol"]} 或相对误差 {q["tolerance"]["rtol"]}；允许使用 Python 标准库。')
        parts.append(f'[作答：{q["title"]}](http://127.0.0.1:8000/samples/accumulation-clearance/practice/?question={q["slug"]})')
    return '\n\n'.join(parts)+'\n\n'


def main():
    import nbformat
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    questions=json.loads((ROOT/'exercises/samples/accumulation-clearance/questions.json').read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'notebooks/samples/accumulation-clearance/catalog.json').read_text(encoding='utf-8'))
    for lesson in catalog:
        path=ROOT/lesson['path'];nb=nbformat.read(path,as_version=4);cell=nb.cells[-1]
        marker='**进一步阅读**'
        tail=marker+cell.source.split(marker,1)[1]
        expected=render_exercises(lesson['id'],questions)+tail
        if args.check:
            if cell.source!=expected: raise SystemExit(f'{path.name}: 练习正文与题库不一致')
        else:
            cell.source=expected;cell.metadata['teaching_role']='exercises';nbformat.write(nb,path)
    print('M1 exercise text: synchronized')


if __name__=='__main__':main()
