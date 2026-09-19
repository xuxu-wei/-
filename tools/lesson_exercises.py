"""从题目契约生成完整练习正文；不包含答案，入口由正式课节指定。"""
from urllib.parse import quote
from teaching_examples import example_markdown
from question_contracts import contract_markdown


def render_exercises(lesson_id, questions, practice_url, assessment=None):
    # Markdown destinations cannot contain raw spaces or closing parentheses.
    # Keep existing percent escapes intact when a caller already encoded its path.
    practice_path = quote(practice_url, safe='/%')
    parts = ['## 练习与参考资料', '先独立作答，再提交核对。']
    items = {i['question_id']: i for i in assessment['items']} if assessment else {}
    if assessment:
        parts.append('本篇综合题按基础辨析、方法应用、综合验证、迁移挑战递进，共 100 分。每题独立作答；正确选择或完整测试通过得该题全部分值。网页分别汇总首次作答分与练习达成分，支持按层次和学习目标复习。')
    for number, q in enumerate((q for q in questions if q['lesson_id']==lesson_id), 1):
        kind = ('多项选择题' if q['multiple'] else '单项选择题') if q['type']=='choice' else 'Python 计算题'
        if q['id'] in items:
            from assessment import LEVELS
            item = items[q['id']]
            parts.append(f'### 第 {number} 题 · {LEVELS[item["level"]-1][0]} · {item["points"]} 分 · {kind}：{q["title"]}')
        else:
            parts.append(f'### 第 {number} 题 · {kind}：{q["title"]}')
        parts.append(q['statement'])
        if q['type']=='choice':
            parts.append('\n'.join(f'- **{o["id"]}.** {o["text"]}' for o in q['options']))
        else:
            parts += [contract_markdown(q), example_markdown(q),
                      f'允许 Python 标准库；绝对误差 {q["tolerance"]["atol"]} 或相对误差 {q["tolerance"]["rtol"]}。']
        slug = quote(q['slug'], safe='%')
        parts.append(f'[作答：{q["title"]}](http://127.0.0.1:8000{practice_path}?question={slug})')
    return '\n\n'.join(parts)
