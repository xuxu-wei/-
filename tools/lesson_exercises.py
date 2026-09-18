"""从题目契约生成完整练习正文；不包含答案，入口由正式课节指定。"""
from teaching_examples import example_markdown
from question_contracts import contract_markdown


def render_exercises(lesson_id, questions, practice_url):
    parts = ['## 练习与参考资料', '先独立作答，再提交核对。']
    for number, q in enumerate((q for q in questions if q['lesson_id']==lesson_id), 1):
        kind = ('多项选择题' if q['multiple'] else '单项选择题') if q['type']=='choice' else 'Python 计算题'
        parts += [f'### 第 {number} 题 · {kind}：{q["title"]}', q['statement']]
        if q['type']=='choice':
            parts.append('\n'.join(f'- **{o["id"]}.** {o["text"]}' for o in q['options']))
        else:
            parts += [contract_markdown(q), example_markdown(q),
                      f'允许 Python 标准库；绝对误差 {q["tolerance"]["atol"]} 或相对误差 {q["tolerance"]["rtol"]}。']
        parts.append(f'[作答：{q["title"]}](http://127.0.0.1:8000{practice_url}?question={q["slug"]})')
    return '\n\n'.join(parts)
