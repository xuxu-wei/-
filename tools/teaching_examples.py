"""同一份核验样例生成教学表格与可复制的 Python 输入、预期输出。"""
import math
from pprint import pformat


def display(value):
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        if value == 0: return '0'
        shown = f'{value:.7g}'
        return shown if math.isclose(float(shown), value, rel_tol=1e-14, abs_tol=1e-14) else '≈ ' + shown
    return str(value)


def table(title, columns, rows):
    return {'title': title, 'columns': columns, 'rows': [[display(v) for v in row] for row in rows]}


def python_assignment(name, data):
    prefix=name+' = '
    return prefix+pformat(data,width=max(20,60-len(prefix)),sort_dicts=False).replace('\n','\n'+' '*len(prefix))


def example_view(question):
    sample = question['samples'][0]
    data = sample['arguments']
    names=[item['name'] for item in question['returns']]
    expected={names[0]:sample['expected']} if len(names)==1 else dict(zip(names,sample['expected']))
    inputs = [table('给定条件', ['参数', '含义', '给定值', '单位'],
                    [[p['name'],p['description'],data[p['name']],p['unit']] for p in question['parameters']])]
    outputs = [table('计算结果', ['返回项', '含义', '结果', '单位'],
                     [[p['name'],p['description'],expected[p['name']],p['unit']] for p in question['returns']])]
    return {
        'input': {
            'description': '每个参数对应函数签名中的同名变量；单位与顺序见下表。',
            'tables': inputs,
            'code_title': '输入与调用代码',
            'code_note': '完成 solve 函数后，将下面的参数赋值与调用代码放在函数定义下方运行。',
            'code': '\n'.join(python_assignment(p['name'],data[p['name']]) for p in question['parameters'])+'\n\nresult = solve('+', '.join(p['name'] for p in question['parameters'])+')\nprint(result)',
        },
        'output': {
            'description': '对这组输入，你的函数应返回下列结果。列表按表格自上而下的顺序排列；标有“≈”的是便于阅读的近似值，请按模型计算完整数值。',
            'tables': outputs,
            'code_title': '预期输出代码',
            'code_note': '用 expected_output 对照 result 的类型、顺序与数值。代码保留样例原始精度，浮点结果按题面容差比较。',
            'code': python_assignment('expected_output',sample['expected'] if len(names)==1 else tuple(sample['expected'])),
        },
        'explanation':sample['explanation'],
    }


def example_markdown(question):
    result = []
    for kind, title in [('input','输入样例'),('output','输出样例')]:
        view = example_view(question)[kind]
        result.extend([f'**{title}**', view['description']])
        for group in view['tables']:
            if not group['rows']: continue
            result.append(group['title'])
            lines = ['| ' + ' | '.join(group['columns']) + ' |', '| ' + ' | '.join('---' for _ in group['columns']) + ' |']
            lines += ['| ' + ' | '.join(row) + ' |' for row in group['rows']]
            result.append('\n'.join(lines))
        result.extend([f"**{view['code_title']}**", view['code_note'], '```python\n' + view['code'] + '\n```'])
    result.extend(['**样例解释**',example_view(question)['explanation']])
    return '\n\n'.join(result)
