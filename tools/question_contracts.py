"""题面、模板与调用共用具名参数契约，禁止把通信包装作为解题接口。"""
import ast
import keyword


def signature(question):
    types=[item['type'] for item in question['returns']]
    result=types[0] if len(types)==1 else 'tuple['+', '.join(types)+']'
    return 'def solve(\n'+''.join(f'    {p["name"]}: {p["type"]},\n' for p in question['parameters'])+') -> '+result+':'


def validate_contract(question):
    names=[item['name'] for item in question['parameters']]
    if not names or len(names)!=len(set(names)) or any(not name.isidentifier() or keyword.iskeyword(name) or name in {'payload','data','kwargs','args'} for name in names):
        raise ValueError('题目必须逐个列出有含义的参数，不能用通用包装接收输入。')
    if question['entrypoint']!='solve' or not question['returns'] or not question['constraints']:
        raise ValueError('缺少函数、返回值或约束说明。')
    for field in question['parameters']+question['returns']:
        if not all(field.get(key) for key in ['name','type','description','unit']):
            raise ValueError('每个参数与返回量必须说明名称、类型、含义及单位。')
    definition=ast.parse(question['starter_code']).body[0]
    expected=ast.parse(signature(question)+'\n    pass').body[0]
    if not isinstance(definition,ast.FunctionDef) or definition.name!='solve' or ast.dump(definition.args)!=ast.dump(expected.args) or definition.returns is None or ast.dump(definition.returns)!=ast.dump(expected.returns):
        raise ValueError('代码模板与公开函数签名不一致。')
    for sample in question['samples']:
        if set(sample['arguments'])!=set(names) or not sample.get('explanation'):
            raise ValueError('样例必须覆盖所有具名参数并说明结果来源。')


def contract_view(question):
    return {
        'signature':signature(question),
        'parameters':question['parameters'],
        'returns':question['returns'],
        'return_note':f'直接返回 {question["returns"][0]["name"]}（{question["returns"][0]["type"]}）。' if len(question['returns'])==1 else '按以下顺序返回元组：('+', '.join(item['name'] for item in question['returns'])+')。',
        'constraints':question['constraints'],
    }


def contract_markdown(question):
    view=contract_view(question)
    text=['**函数与代码模板**','```python\n'+question['starter_code'].rstrip()+'\n```']
    for title,items in [('参数说明',view['parameters']),('返回值',view['returns'])]:
        text.append(f'**{title}**')
        if title=='返回值':text.append(view['return_note'])
        rows=['| 名称 | Python 类型 | 含义 | 单位 |','|---|---|---|---|']
        rows += [f'| `{item["name"]}` | `{item["type"]}` | {item["description"]} | {item["unit"]} |' for item in items]
        text.append('\n'.join(rows))
    text += ['**计算规则**',question['contract'],'**约束与边界**','\n'.join('- '+item for item in view['constraints'])]
    return '\n\n'.join(text)
