"""在独立教材 Python 进程中运行一份解答；判定由父进程完成。"""
import contextlib
import json
import inspect
import linecache
from pathlib import Path
import sys
import traceback


def error_details(error):
    """保留 Python 调试格式和学习者调用链，省去执行器自身的包裹帧。"""
    frames=traceback.extract_tb(error.__traceback__)
    frame=next((f for f in reversed(frames) if f.filename=='answer.py'),None)
    syntax=isinstance(error,SyntaxError)
    detail=traceback.TracebackException.from_exception(error,capture_locals=False)
    pending=[detail];seen=set()
    while pending:
        item=pending.pop()
        if id(item) in seen:continue
        seen.add(id(item))
        item.stack=traceback.StackSummary.from_list(f for f in item.stack if f.filename!=__file__)
        pending.extend(child for child in [item.__cause__,item.__context__,*(getattr(item,'exceptions',None) or [])] if child)
    formatted=''.join(detail.format()).rstrip()
    if len(formatted)>20000:formatted=formatted[:8000]+'\n… traceback 过长，中间部分已截断 …\n'+formatted[-12000:]
    return {'verdict':'CE' if syntax else 'RE','message':f'{type(error).__name__}: {error}',
            'line':error.lineno if syntax else frame.lineno if frame else None,
            'column':error.offset if syntax else frame.colno+1 if frame and frame.colno is not None else None,
            'traceback':formatted}


def main():
    request=json.loads(Path('input.json').read_text(encoding='utf-8'))
    protocol=sys.stdout
    try:
        with contextlib.redirect_stdout(sys.stderr):
            namespace={}
            source=Path('answer.py').read_text(encoding='utf-8')
            linecache.cache['answer.py']=(len(source),None,source.splitlines(keepends=True),'answer.py')
            exec(compile(source,'answer.py','exec'),namespace)
            if not callable(namespace.get('solve')):
                raise TypeError('请按题目给出的函数签名定义 solve。\n'+request['signature'])
            function=namespace['solve']
            parameters=inspect.signature(function)
            results=[]
            for arguments in request['cases']:
                try:
                    parameters.bind(**arguments)
                except TypeError as error:
                    raise TypeError('函数参数与题面不一致。请保留每个参数的名称：\n'+request['signature']) from error
                results.append(function(**arguments))
        response={'results':results}
    except BaseException as error:
        response={'error':error_details(error)}
    try:
        encoded=json.dumps(response,ensure_ascii=False,allow_nan=False)
    except (TypeError,ValueError,OverflowError):
        encoded=json.dumps({'error':{'verdict':'RE','message':'请按题目返回普通 Python 数值、列表或元组，数值不能包含 NaN 或 Inf。','line':None}},ensure_ascii=False)
    protocol.write(encoded)
    protocol.flush()


if __name__=='__main__':
    main()
