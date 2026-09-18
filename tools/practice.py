"""M1 本机客观练习：单计算槽、独立子进程、逐次 JSON 记录。"""
import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from teaching_examples import example_view
from question_contracts import contract_view, validate_contract, signature

ROOT=Path(__file__).resolve().parents[1]
JUDGE_VERSION='named-parameters-2'


def stamp():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


class RequestError(Exception):
    def __init__(self,status,message,**details):
        self.status=status; self.payload={'error':message,**details}


def json_shape(value,depth=0,budget=None):
    budget=[0] if budget is None else budget
    budget[0]+=1
    if depth>16 or budget[0]>100000:
        raise ValueError('返回值的层数或元素数量超过限制。')
    if isinstance(value,dict):
        for key,item in value.items():
            if not isinstance(key,str): raise ValueError('返回字段名必须是字符串。')
            json_shape(item,depth+1,budget)
    elif isinstance(value,list):
        for item in value: json_shape(item,depth+1,budget)
    elif isinstance(value,(int,float)) and not isinstance(value,bool):
        if not math.isfinite(value): raise ValueError('返回值不能包含 NaN 或 Inf。')
    elif value is not None and not isinstance(value,(str,bool)):
        raise ValueError('返回值必须是 JSON 数据。')


def difference(actual,expected,tolerance,path='result'):
    if isinstance(expected,dict):
        if not isinstance(actual,dict) or set(actual)!=set(expected): return f'{path} 的返回字段不符合题面。'
        for key in expected:
            error=difference(actual[key],expected[key],tolerance,f'{path}.{key}')
            if error: return error
    elif isinstance(expected,list):
        if not isinstance(actual,list) or len(actual)!=len(expected): return f'{path} 的列表长度不正确。'
        for i,(a,b) in enumerate(zip(actual,expected)):
            error=difference(a,b,tolerance,f'{path}[{i}]')
            if error: return error
    elif isinstance(expected,(int,float)) and not isinstance(expected,bool):
        if isinstance(actual,bool) or not isinstance(actual,(int,float)) or not math.isclose(actual,expected,abs_tol=tolerance['atol'],rel_tol=tolerance['rtol']):
            return f'{path} 超出题面允许的误差。'
    elif type(actual)!=type(expected) or actual!=expected:
        return f'{path} 不符合预期。'
    return None


class PracticeEngine:
    def __init__(self,directory):
        self.directory=Path(directory).resolve(); self.directory.mkdir(parents=True,exist_ok=True)
        self.attempts=self.directory/'attempts'; self.attempts.mkdir(exist_ok=True)
        self.lock=threading.RLock(); self.records={}; self.read_errors=[]
        self.active=None; self.cancel_event=threading.Event(); self.thread=None; self.process=None
        self.file_lock=(self.directory/'.lock').open('a+b')
        try:
            if self.file_lock.tell()==0: self.file_lock.write(b'0'); self.file_lock.flush()
            self.file_lock.seek(0)
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self.file_lock.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as error:
            self.file_lock.close()
            raise RuntimeError('学习记录正被另一个本机程序使用，请先关闭旧程序。') from error
        questions=json.loads((ROOT/'exercises/samples/accumulation-clearance/questions.json').read_text(encoding='utf-8'))
        self.questions={q['id']:q for q in questions}
        self.verification=json.loads((ROOT/'exercises/samples/accumulation-clearance/verification.json').read_text(encoding='utf-8'))
        for q in questions:
            if q['type']=='python':
                validate_contract(q)
                names={p['name'] for p in q['parameters']}
                if any(set(case['arguments'])!=names for case in self.verification[q['id']]['cases']):
                    raise ValueError('核验用例的参数与题面不一致。')
        for path in self.attempts.glob('*.json'):
            try:
                record=json.loads(path.read_text(encoding='utf-8'))
                required={'id','request_id','request_hash','state','exercise_id','exercise_version','type','mode','created_at','schema_version'}
                if not isinstance(record,dict) or not required<=record.keys() or path.stem!=str(uuid.UUID(record['id'])) or record['request_id']!=record['id'] or record['type'] not in {'choice','python'}:
                    raise ValueError('记录字段不完整')
                if record['state']=='FINISHED' and (not record.get('verdict') or ('selected' if record['type']=='choice' else 'source') not in record):
                    raise ValueError('完成记录缺少判定或快照')
                if record['state']!='FINISHED':
                    record.update(state='FINISHED',verdict='INTERRUPTED',ended_at=stamp(),message='本地程序重启前的计算未完成，请重新提交。')
                    self._save(record)
                self.records[record['id']]=record
            except (OSError,ValueError,KeyError,TypeError):
                self.read_errors.append(path.name)

    def _save(self,record):
        path=self.attempts/f'{record["id"]}.json'
        temporary=path.with_suffix('.tmp')
        with temporary.open('w',encoding='utf-8') as stream:
            json.dump({**record,'saved':True},stream,ensure_ascii=False,allow_nan=False,indent=2)
            stream.flush(); os.fsync(stream.fileno())
        temporary.replace(path)
        record['saved']=True

    def catalog(self):
        return [{key:q[key] for key in ['id','version','lesson_id','type','title','slug']} for q in self.questions.values()]

    def question(self,id):
        if id not in self.questions: raise RequestError(404,'没有这道练习。')
        question = copy.deepcopy(self.questions[id])
        if question['type']=='python':
            question['example_view']=example_view(question)
            question['contract_view']=contract_view(question)
        return question

    def get(self,id):
        with self.lock:
            if id not in self.records: raise RequestError(404,'未找到这次提交，请保留草稿。')
            return copy.deepcopy(self.records[id])

    def progress(self):
        with self.lock:
            passed={r['exercise_id'] for r in self.records.values() if r.get('saved') and r.get('state')=='FINISHED' and r.get('verdict')=='AC' and r.get('mode')=='full' and r.get('exercise_version')==self.questions.get(r.get('exercise_id'),{}).get('version')}
            started={r['exercise_id'] for r in self.records.values() if r.get('saved') and r.get('state')=='FINISHED' and r.get('verdict') not in {'SYSTEM_ERROR','CANCELLED','INTERRUPTED'} and r.get('exercise_version')==self.questions.get(r.get('exercise_id'),{}).get('version')}
            return {'passed':sorted(passed),'started':sorted(started),'scope':'sample:accumulation-clearance','total':len(self.questions),'incomplete':bool(self.read_errors),'unreadable_files':self.read_errors,'active':self.active}

    def submit(self,payload,kind):
        with self.lock:
            fields={'exercise_id','exercise_version','request_id','selected'} if kind=='choice' else {'exercise_id','exercise_version','request_id','source','mode'}
            if not isinstance(payload,dict) or set(payload)!=fields: raise RequestError(422,'提交字段不符合题目要求。')
            try: id=str(uuid.UUID(payload['request_id']))
            except (ValueError,TypeError,AttributeError): raise RequestError(422,'提交编号无效，请刷新后重试。')
            if not isinstance(payload['exercise_id'],str): raise RequestError(422,'题号无效。')
            q=self.question(payload['exercise_id'])
            if q['type']!=kind: raise RequestError(422,'作答方式与题型不符。')
            if payload['exercise_version']!=q['version']: raise RequestError(409,'题目已更新，请保留草稿并重新载入。',code='VERSION_CONFLICT')
            if kind=='choice':
                selected=payload['selected']; valid={o['id'] for o in q['options']}
                if not isinstance(selected,list) or not selected or any(not isinstance(s,str) or s not in valid for s in selected) or len(set(selected))!=len(selected) or (not q['multiple'] and len(selected)!=1):
                    raise RequestError(422,'请选择题面允许的选项。')
            elif not isinstance(payload['source'],str) or len(payload['source'].encode('utf-8'))>q['limits']['source_bytes'] or payload['mode'] not in ('samples','full'):
                raise RequestError(422,'源码或运行方式不符合题目限制。')
            request_hash=digest(payload)
            if id in self.records:
                if self.records[id]['request_hash']!=request_hash: raise RequestError(409,'同一提交编号对应了不同内容，请发起新提交。',code='REQUEST_CONFLICT')
                return self.get(id)
            if kind=='python' and self.active: raise RequestError(409,'另一个计算正在运行，请等待或取消后再提交。',code='BUSY',active=self.active)
            record={**payload,'id':id,'schema_version':1,'request_hash':request_hash,'created_at':stamp(),'type':kind,
                'mode':payload.get('mode','full'),'state':'PREPARING','saved':False,'judge_version':JUDGE_VERSION,
                'question_sha256':digest(q),'verification_sha256':digest(self.verification[q['id']]),'python':platform.python_version()}
            if kind=='choice':
                verification=self.verification[q['id']]
                record.update(state='FINISHED',verdict='AC' if set(payload['selected'])==set(verification['correct']) else 'WA',ended_at=stamp(),result=verification)
            try: self._save(record)
            except OSError: raise RequestError(503,'作答记录未保存，请检查本地目录后重试；本次没有记入进度。')
            self.records[id]=record
            if kind=='python':
                self.active=id; self.cancel_event=threading.Event()
                self.thread=threading.Thread(target=self._run,args=(id,q),daemon=True)
                self.thread.start()
            return self.get(id)

    def cancel(self,id):
        with self.lock:
            record=self.get(id)
            if record['state']=='FINISHED': return record
            self.cancel_event.set(); thread=self.thread
        if thread: thread.join(timeout=10)
        record=self.get(id)
        if record['state']!='FINISHED': raise RequestError(503,'仍在结束当前计算，请稍后查询。')
        return record

    def _run(self,id,q):
        started=time.monotonic(); verdict='SYSTEM_ERROR'; result={}; message='本机计算未完成。'; logs=''
        with self.lock:
            record=self.records[id]; record['state']='RUNNING'
            try: self._save(record)
            except OSError:
                record.update(state='FINISHED',saved=False,verdict='SYSTEM_ERROR',message='记录未保存，请检查本地目录后重试。')
                self.active=None; return
            source=record['source']; mode=record['mode']
        cases=q['samples'] if mode=='samples' else self.verification[q['id']]['cases']
        work=ROOT/'.work/exercises'; work.mkdir(parents=True,exist_ok=True)
        try:
            with tempfile.TemporaryDirectory(prefix='run-',dir=work) as name:
                directory=Path(name).resolve()
                assert directory.is_relative_to(work.resolve())
                (directory/'answer.py').write_text(source,encoding='utf-8')
                (directory/'input.json').write_text(json.dumps({'signature':signature(q),'cases':[c['arguments'] for c in cases]}),encoding='utf-8')
                env={**os.environ,'PYTHONIOENCODING':'utf-8','OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'}
                process=subprocess.Popen([sys.executable,'-I','-X','utf8','-u',str(ROOT/'tools/practice_worker.py')],cwd=directory,
                    stdout=subprocess.PIPE,stderr=subprocess.PIPE,stdin=subprocess.DEVNULL,env=env,shell=False)
                with self.lock: self.process=process
                buffers=[bytearray(),bytearray()]; exceeded=threading.Event()
                def read(stream,index,limit):
                    try:
                        while chunk:=stream.read(4096):
                            remaining=limit-len(buffers[index])
                            buffers[index].extend(chunk[:max(0,remaining)])
                            if len(chunk)>remaining: exceeded.set()
                    finally: stream.close()
                readers=[threading.Thread(target=read,args=(stream,i,limit),daemon=True) for i,(stream,limit) in enumerate([(process.stdout,q['limits']['output_bytes']),(process.stderr,q['limits']['log_bytes'])])]
                for reader in readers: reader.start()
                stopped=None
                while process.poll() is None:
                    if self.cancel_event.is_set(): stopped='CANCELLED'
                    elif exceeded.is_set(): stopped='OLE'
                    elif time.monotonic()-started>q['limits']['seconds']: stopped='TLE'
                    if stopped:
                        process.terminate()
                        try: process.wait(timeout=3)
                        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)
                        break
                    try: process.wait(timeout=.025)
                    except subprocess.TimeoutExpired: pass
                for reader in readers: reader.join(timeout=2)
                logs=buffers[1].decode('utf-8',errors='replace')
                if self.cancel_event.is_set(): stopped='CANCELLED'
                elif exceeded.is_set(): stopped='OLE'
                if stopped:
                    verdict=stopped; message={'CANCELLED':'已取消，本次计算进程已结束。','OLE':'输出超过题面限制，计算已停止。','TLE':'超过本机运行时间限制，计算已停止。'}[stopped]
                elif process.returncode!=0:
                    verdict='RE'; message='解答进程异常结束，请检查代码。'
                else:
                    try:
                        response=json.loads(buffers[0]); json_shape(response)
                    except (ValueError,OverflowError,RecursionError):
                        response={'error':{'verdict':'RE','message':'返回值必须是大小受限且不含 NaN/Inf 的 JSON 数据。'}}
                    if isinstance(response,dict) and isinstance(response.get('error'),dict):
                        verdict=response['error'].get('verdict','RE'); message=response['error']['message']; result=response['error']
                    elif not isinstance(response,dict) or not isinstance(response.get('results'),list) or len(response['results'])!=len(cases):
                        verdict='RE'; message='返回结果数量与测试输入不一致。'
                    else:
                        details=[]
                        for i,(actual,case) in enumerate(zip(response['results'],cases),1):
                            error=difference(actual,case['expected'],q['tolerance'])
                            details.append({'case':i,'passed':error is None,'difference':error,'arguments':case['arguments'],'expected':case['expected'],'actual':actual})
                        passed=sum(row['passed'] for row in details)
                        verdict='AC' if passed==len(cases) else 'WA'; message=f'通过 {passed}/{len(cases)} 个用例。'
                        result={'passed':passed,'total':len(cases),'cases':details,'explanation':self.verification[q['id']]['explanation']}
        except (OSError,ValueError,KeyError,TypeError) as error:
            verdict='SYSTEM_ERROR'; message=f'本机执行未完成：{type(error).__name__}。请保留代码并检查运行环境。'
        finally:
            with self.lock:
                record=self.records[id]
                record.update(state='FINISHED',verdict=verdict,result=result,message=message,logs=logs,
                              ended_at=stamp(),seconds=round(time.monotonic()-started,3))
                try: self._save(record)
                except OSError: record.update(saved=False,verdict='SYSTEM_ERROR',message='结果未保存，请检查本地目录后重试；本次没有记入进度。')
                self.active=None; self.process=None

    def close(self):
        with self.lock: active=self.active
        if active: self.cancel(active)
        self.file_lock.close()
