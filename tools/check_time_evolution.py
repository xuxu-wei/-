"""交叉检查第 2 篇 Notebook 与网页模型；独立数学依据另见 test_part02。"""
import argparse
import ast
import json
import math
from pathlib import Path
import shutil
import subprocess

import nbformat

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--node', default=shutil.which('node'))
    args = parser.parse_args()
    if not args.node:
        parser.error('请在 PATH 提供 Node.js，或使用 --node 指定可执行文件。')
    catalog = json.loads((ROOT / 'notebooks/02-系统随时间演化/catalog.json').read_text(encoding='utf-8'))
    lesson = next(l for l in catalog if l['id'] == 'P02-C04-S03')
    notebook = nbformat.read(ROOT / lesson['path'], as_version=4)
    scope = {'math': math}
    for cell in notebook.cells:
        if cell.cell_type == 'code' and 'model' in cell.metadata.get('tags', []):
            tree = ast.parse(cell.source)
            assert all(isinstance(n, ast.FunctionDef) for n in tree.body)
            exec(compile(tree, lesson['path'], 'exec'), scope)
    cases = [{'initial': initial, 'u': u, 'k': k, 'h': h}
             for initial in [0, 2, 10] for u in [0, 1, 4]
             for k in [0, 1e-320, 1e-14, .5, .75, 1] for h in [.25, 1, 2, 3]]
    script = '''import {readFileSync} from 'node:fs';
const {exact,euler}=await import(process.argv[1]);
const cases=JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify(cases.map(p=>{const r=euler(p.initial,p.u,p.k,p.h);return [r.times,r.values,r.times.map(t=>exact(t,p.u,p.k,p.initial))];})));'''
    run = subprocess.run([args.node, '--input-type=module', '-e', script,
                          (ROOT / 'web/time-evolution/model.mjs').as_uri()],
                         input=json.dumps(cases), text=True, capture_output=True, check=True, timeout=30)
    results = json.loads(run.stdout)
    count, max_error = 0, 0
    for parameters, result in zip(cases, results, strict=True):
        reference = scope['piecewise'](parameters['initial'], parameters['k'], [0, 12], [parameters['u']], parameters['h'])
        for js_values, py_values in zip(result, reference, strict=True):
            for js, py in zip(js_values, py_values, strict=True):
                error = abs(js-py)
                assert error <= 1e-10 * max(1, abs(py)), (parameters, js, py)
                max_error = max(error, max_error)
                count += 1
    report = {'cases': len(cases), 'compared_values': count, 'maximum_absolute_difference': max_error,
              'tolerance': '1e-10 * max(1, abs(Python reference))',
              'scope': 'same-model cross-implementation; not an independent accuracy proof',
              'notebook': lesson['path'], 'web': 'web/time-evolution/model.mjs'}
    target = ROOT / '.work/m3/web-model-comparison.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
