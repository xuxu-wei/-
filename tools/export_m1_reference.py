"""从 Notebook 的可见函数导出网页一致性核验值，仅写入本地验收目录。"""
import ast
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
notebook = json.loads((ROOT / 'notebooks/samples/accumulation-clearance/05-numerical-checks.ipynb').read_text(encoding='utf-8'))
namespace = {'np': np}
for cell in notebook['cells']:
    if cell['cell_type'] == 'code' and 'model' in cell.get('metadata', {}).get('tags', []):
        tree = ast.parse(''.join(cell['source']))
        assert all(isinstance(node, ast.FunctionDef) for node in tree.body)
        exec(compile(tree, 'S05 model', 'exec'), namespace)

cases = [(1, .5, 0), (0, .75, 10), (1, 0, 2), (0, 0, 3), (1, .5, 2), (1, 1e-12, 2), (3, 1, 10), (3, 0, 10)]
vectors = []
for u, k, A0 in cases:
    for h in [.05, .1, .25, .5, 1, 2, 4, 5]:
        t, amounts = namespace['euler'](u=u, k=k, A0=A0, h=h)
        vectors.append({'parameters': {'u': u, 'k': k, 'A0': A0}, 'h': h,
                        'times': t.tolist(), 'euler': amounts.tolist(),
                        'exact': namespace['exact_amount'](t, u, k, A0).tolist()})
target = ROOT / '.work/m1/reference-vectors.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(vectors, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Exported {len(vectors)} reference cases')
