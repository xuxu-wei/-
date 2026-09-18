"""从独立新内核执行六节 Notebook，生成可审查输出与验收数据。"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='将验证后的输出写回教学 Notebook')
    parser.add_argument('--preview', action='store_true', help='生成供人工检查的 HTML 预览')
    args = parser.parse_args()
    work = ROOT / '.work' / 'm1'
    work.mkdir(parents=True, exist_ok=True)
    for name, directory in [('MPLCONFIGDIR', work / 'matplotlib'),
                            ('JUPYTER_RUNTIME_DIR', work / 'runtime'),
                            ('IPYTHONDIR', work / 'ipython')]:
        directory.mkdir(exist_ok=True)
        os.environ[name] = str(directory)
    import nbformat
    from nbclient import NotebookClient
    from jupyter_client import KernelManager
    from jupyter_client.kernelspec import KernelSpecManager

    kernel_dir = work / 'kernels' / 'm1-validation'
    kernel_dir.mkdir(parents=True, exist_ok=True)
    (kernel_dir / 'kernel.json').write_text(json.dumps({
        'argv': [sys.executable, '-m', 'ipykernel_launcher', '-f', '{connection_file}'],
        'display_name': 'M1 validation', 'language': 'python',
    }), encoding='utf-8')
    report = {'python': platform.python_version(), 'platform': platform.system(),
              'packages': {name: importlib.metadata.version(name) for name in
                           ['numpy', 'matplotlib', 'jupyterlab', 'nbformat', 'nbclient', 'ipykernel', 'pytest']},
              'notebooks': []}
    for path in sorted((ROOT / 'notebooks' / 'samples' / 'accumulation-clearance').glob('*.ipynb')):
        notebook = nbformat.read(path, as_version=4)
        nbformat.validate(notebook)
        # 每次构造新的内核管理器；不使用机器已有的内核或另一节的变量。
        manager = KernelManager(kernel_name='m1-validation',
                                kernel_spec_manager=KernelSpecManager(kernel_dirs=[str(kernel_dir.parent)]))
        started = time.perf_counter()
        client = NotebookClient(notebook, km=manager, timeout=120,
                                resources={'metadata': {'path': str(path.parent)}})
        client.execute(cleanup_kc=True)
        elapsed = time.perf_counter() - started
        figures = 0
        for cell in notebook.cells:
            for output in cell.get('outputs', []):
                if output.output_type == 'error':
                    raise RuntimeError(f'{path.name}: {output.ename}')
                if 'image/png' in output.get('data', {}):
                    figures += 1
        assert figures > 0, f'{path.name}: missing rendered figures'
        if args.write:
            nbformat.write(notebook, path)
        if args.preview:
            from nbconvert import HTMLExporter
            preview = work / 'previews'
            preview.mkdir(exist_ok=True)
            html, _ = HTMLExporter(template_name='lab').from_notebook_node(notebook)
            (preview / f'{path.stem}.html').write_text(html, encoding='utf-8')
        report['notebooks'].append({
            'path': path.relative_to(ROOT).as_posix(), 'seconds': round(elapsed, 2),
            'code_cells': sum(c.cell_type == 'code' for c in notebook.cells), 'figures': figures,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'passed': True,
        })
        print(f'PASS {path.name}: {elapsed:.2f}s, {figures} figure outputs', flush=True)
    assert len(report['notebooks']) == 6, 'M1 requires exactly six notebooks'
    (work / 'execution.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Report: .work/m1/execution.json')


if __name__ == '__main__':
    main()
