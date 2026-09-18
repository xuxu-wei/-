"""同一份核验样例生成教学表格与可复制的 Python 输入、预期输出。"""
import math
from pprint import pformat


FIELDS = {
    'A0': ('初始物质量', 'U'), 'u': ('恒定流入速率', 'U/T'),
    'k': ('清除系数', '1/T'), 'h': ('时间步长', 'T'),
    'steps': ('更新步数', '步'), 'target': ('共同的平衡物质量', 'U'),
    'fraction': ('需要达到的平衡比例', '1'), 'end': ('观察终点', 'T'),
    'start_h': ('首次尝试的步长', 'T'), 'tol': ('允许的最大误差', 'U'),
    'error': ('网格上的最大误差', 'U'), 'total_input': ('整个区间的总输入量', 'U'),
    'final': ('终点物质量', 'U'), 'max_error': ('网格上的最大误差', 'U'),
}


def display(value):
    if isinstance(value, (int, float)):
        if value == 0: return '0'
        shown = f'{value:.7g}'
        return shown if math.isclose(float(shown), value, rel_tol=1e-14, abs_tol=1e-14) else '≈ ' + shown
    return str(value)


def table(title, columns, rows):
    return {'title': title, 'columns': columns, 'rows': [[display(v) for v in row] for row in rows]}


def scalar_table(data, output=False):
    rows = [[FIELDS[k][0], k, display(v), FIELDS[k][1]] for k, v in data.items() if k in FIELDS and not isinstance(v, list)]
    return table('计算结果' if output else '给定条件', ['量的含义', '返回量' if output else '函数参数', '结果' if output else '给定值', '单位'], rows)


def python_assignment(name, data):
    prefix=name+' = '
    return prefix+pformat(data,width=max(20,60-len(prefix)),sort_dicts=False).replace('\n','\n'+' '*len(prefix))


def example_view(question):
    sample = question['samples'][0]
    data = sample['arguments']
    names=[item['name'] for item in question['returns']]
    expected={names[0]:sample['expected']} if len(names)==1 else dict(zip(names,sample['expected']))
    inputs, outputs = [scalar_table(data)], []
    if 'durations' in data:
        inputs.append(table('各区间的流入与流出', ['区间', '时长 durations / T', '流入 inflows / (U/T)', '流出 outflows / (U/T)'],
                            [[i+1, h, incoming, outgoing] for i, (h,incoming,outgoing) in enumerate(zip(data['durations'],data['inflows'],data['outflows']))]))
        outputs.append(table('依次返回起点与各区间末的物质量', ['位置', '物质量 amounts / U'],
                             [['起点' if i==0 else f'第 {i} 区间末', v] for i,v in enumerate(expected['amounts'])]))
    elif 'ks' in data:
        inputs.append(table('分别比较两种清除快慢', ['实验', '清除系数 ks / (1/T)'], [[i+1,k] for i,k in enumerate(data['ks'])]))
        outputs.append(table('按输入中的清除系数顺序返回', ['清除系数 / (1/T)', '所需流入 inputs / (U/T)', '首次到达时刻 first_times / T'],
                             list(zip(data['ks'],expected['inputs'],expected['first_times']))))
    elif 'hs' in data:
        inputs.append(table('分别尝试以下步长', ['实验', '时间步长 hs / T'], [[i+1,h] for i,h in enumerate(data['hs'])]))
        outputs.append(table('每种步长独立从同一起点计算', ['步长 / T', '第一步物质量 first / U', '全程最小物质量 minimum / U'],
                             list(zip(data['hs'],expected['first'],expected['minimum']))))
    elif 'bounds' in data:
        inputs.append(table('每段采用给定的恒定输入', ['时段 bounds / T', '流入速率 rates / (U/T)'],
                            [[f'{display(left)} → {display(right)}',rate] for left,right,rate in zip(data['bounds'],data['bounds'][1:],data['rates'])]))
        if 'times' in expected:
            outputs.append(table('对应时刻的两种计算结果', ['时刻 times / T', '数值物质量 amounts / U', '解析物质量 exact / U'],
                                 list(zip(expected['times'],expected['amounts'],expected['exact']))))
        outputs.append(scalar_table(expected, True))
    elif 'times' in data:
        inputs.append(table('需要求值的时刻', ['顺序', '时刻 times / T'], [[i+1,t] for i,t in enumerate(data['times'])]))
        outputs.append(table('按给定时刻依次返回', ['时刻 / T', '物质量 amounts / U'], list(zip(data['times'],expected['amounts']))))
    elif 'amounts' in expected:
        outputs.append(table('包含起点与每一步更新结果', ['更新次数', '物质量 amounts / U'], list(enumerate(expected['amounts']))))
    else:
        outputs.append(scalar_table(expected, True))
    return {
        'input': {
            'description': '以下是一组传给 solve 的参数；U、T 分别是物质量与时间单位。每个参数直接对应上方函数签名中的同名变量。',
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
