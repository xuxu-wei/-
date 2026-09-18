import {mountShell,locateLesson,applyProgress,rememberQuestion} from '../shared/course-shell.mjs';
import {createEditor} from './editor.mjs';
import {setupWorkspace} from '../shared/layout.mjs';
const $=id=>document.getElementById(id);
const editor=createEditor($('source'));
let session, catalog=[], question, active=null, pollTimer=null, selection=0, lastRecord=null, undo='';
let prefix,chapter=null; // 每章独立保存草稿。
let lessons=[],progressState={passed:[]};
function progressLabel(value){const ids=new Set(catalog.map(q=>q.id));return `本章已完成 ${(value.passed||[]).filter(id=>ids.has(id)).length} / ${ids.size} 题${value.incomplete?' · 部分记录无法读取':''}`;}
document.addEventListener('course-progress',event=>{
  progressState=event.detail;
  $('progress').textContent=progressLabel(progressState);
  for(const link of $('questions').querySelectorAll('a')){
    const item=catalog.find(q=>q.id===link.dataset.id);if(!item)continue;
    const done=progressState.passed.includes(item.id);link.classList.toggle('passed',done);
    link.querySelector('.question-status').textContent=done?'✓':'○';
    link.setAttribute('aria-label',`${item.title}${done?'，已完成':''}`);
  }
});
function getStored(key){try{return JSON.parse(localStorage.getItem(prefix+key));}catch{return null;}}
function save(key,value){try{localStorage.setItem(prefix+key,JSON.stringify(value));return true;}catch{$('draft-note').textContent='草稿未能保存，请复制或下载代码。';return false;}}
function clear(key){try{localStorage.removeItem(prefix+key);}catch{}}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function renderContract(view){
  $('function-signature').textContent=view.signature;
  for(const [id,items,label] of [['parameters',view.parameters,'参数'],['return-values',view.returns,'返回项']]){
    const table=node('table'),head=node('thead'),row=node('tr');
    for(const title of [label+' / 类型','含义','单位']){const th=node('th',title);th.scope='col';row.append(th);}head.append(row);table.append(head);
    const body=node('tbody');
    for(const item of items){
      const tr=node('tr'),name=node('td');name.append(node('code',item.name),node('span',item.type,'parameter-type'));
      tr.append(name,node('td',item.description),node('td',item.unit));body.append(tr);
    }
    table.append(body);$(id).replaceChildren(table);
  }
  $('return-note').textContent=view.return_note;
  $('constraints').replaceChildren(...view.constraints.map(text=>node('li',text)));
}
function renderExample(target,view){
  target.replaceChildren(node('p',view.description,'muted'));
  for(const group of view.tables){
    if(!group.rows.length)continue;
    const scroll=node('div',undefined,'example-table-scroll');scroll.tabIndex=0;
    const table=node('table');table.append(node('caption',group.title));
    const head=node('thead'),labels=node('tr');for(const title of group.columns){const th=node('th',title);th.scope='col';labels.append(th);}head.append(labels);table.append(head);
    const body=node('tbody');for(const row of group.rows){const tr=node('tr');for(const value of row)tr.append(node('td',value));body.append(tr);}table.append(body);scroll.append(table);target.append(scroll);
  }
  const exampleCode=node('section',undefined,'example-code');
  const header=node('div',undefined,'example-code-heading');
  const copy=node('button',target.id==='sample-input'?'复制输入代码':'复制输出代码');copy.type='button';
  const feedback=node('span','','example-copy-status');feedback.setAttribute('role','status');
  copy.addEventListener('click',async()=>{
    copy.disabled=true;
    try{await navigator.clipboard.writeText(view.code);feedback.textContent='代码已复制';}
    catch{feedback.textContent='未能自动复制，请选中下方代码复制。';}
    finally{copy.disabled=false;}
  });
  header.append(node('h4',view.code_title),copy);
  const pre=node('pre');pre.tabIndex=0;pre.setAttribute('aria-label',view.code_title);pre.append(node('code',view.code));
  exampleCode.append(header,node('p',view.code_note,'example-code-note'),pre,feedback);target.append(exampleCode);
}
async function api(path,body){
  const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(12000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify(body)})});
  let result;try{result=await response.json();}catch{throw new Error('本地程序未提供练习接口，请重新启动更新后的程序。');}
  if(!response.ok){const error=new Error(result.error||'本机请求未完成。');error.status=response.status;error.details=result;throw error;}
  return result;
}
function connectionError(error){$('connection-help').hidden=false;$('connection-message').textContent=error.message||'本机连接中断，请恢复连接后查询原提交。';}
function draftKey(){return `draft:${question.id}:${question.version}`;}
function snapshotNote(){
  if(!lastRecord)return;
  const changed=question.type==='python'?$('source').value!==lastRecord.source:JSON.stringify(selected().sort())!==JSON.stringify([...lastRecord.selected].sort());
  $('snapshot-note').textContent=changed?'当前作答已修改；以下结果属于上次提交。':`本次提交时间：${new Date(lastRecord.created_at).toLocaleString()}；题目版本 ${lastRecord.exercise_version}。`;
  $('goto-error').disabled=changed;$('goto-error').title=changed?'当前草稿已修改，错误行号对应上次提交；可在下方查看提交代码。':'';
  if(changed)editor.markError(null);
}
function selected(){return [...document.querySelectorAll('#options input:checked')].map(i=>i.value);}
function updateBusy(){
  for(const id of ['run-samples','submit-code'])$(id).disabled=!!active;
  $('cancel').hidden=!active;$('running-note').hidden=!active;
}
function renderQuestions(){
  $('questions').replaceChildren();
  const items=catalog.filter(q=>q.lesson_id===question.lesson_id);
  items.forEach((item,index)=>{
    const a=node('a');a.href=`?question=${item.slug}`;a.dataset.id=item.id;
    a.append(node('span',`第 ${index+1} 题 · ${item.title}`));
    const done=progressState.passed.includes(item.id);a.append(node('span',done?'✓':'○','question-status'));a.classList.toggle('passed',done);
    a.setAttribute('aria-label',`${item.title}${done?'，已完成':''}`);
    if(item.id===question.id)a.setAttribute('aria-current','page');
    a.addEventListener('click',event=>{event.preventDefault();void select(item.id).catch(connectionError);});$('questions').append(a);
  });
  $('lesson-picker').value=question.lesson_id;locateLesson(question.lesson_id);
  const index=catalog.findIndex(q=>q.id===question.id);$('previous-question').disabled=index===0;$('next-question').disabled=index===catalog.length-1;
}
async function progress(){
  const result=await api('/api/v1/progress');progressState=result;applyProgress(result);
  if(result.active){active=result.active;updateBusy();}
  $('progress').textContent=progressLabel(result);
  if(question)renderQuestions();
}
function showResult(record,fresh=false){
  if(record.exercise_id!==question?.id){
    if(fresh){
      const item=catalog.find(q=>q.id===record.exercise_id);if(!item)return;
      const notice=$('completion-notice');notice.replaceChildren(node('span',`“${item.title}”的计算已结束。`));
      const visit=node('button','查看该题结果');visit.type='button';visit.addEventListener('click',()=>{notice.hidden=true;void select(item.id).catch(connectionError);});notice.append(visit);notice.hidden=false;
    }
    return;
  }
  if(record.exercise_version!==question.version)return;
  lastRecord=record;$('result').hidden=false;$('result').classList.toggle('incorrect',!['AC','CANCELLED','INTERRUPTED','SYSTEM_ERROR'].includes(record.verdict));$('result').classList.toggle('neutral',['CANCELLED','INTERRUPTED','SYSTEM_ERROR'].includes(record.verdict));
  $('result-body').hidden=false;$('toggle-result').textContent='收起详情';$('toggle-result').setAttribute('aria-expanded','true');
  const labels={AC:record.mode==='samples'?'示例试算通过':'回答正确',WA:record.type==='choice'?'回答不正确':'部分用例未通过',CE:'代码存在语法错误',RE:'代码运行出错',TLE:'运行超时',OLE:'输出超限',CANCELLED:'计算已取消',INTERRUPTED:'上次计算已中断',SYSTEM_ERROR:'本机判定未完成'};
  $('result-title').textContent=labels[record.verdict]||'本次结果';
  $('result-summary').textContent=(record.message||'下方显示本次选项和逐项解析。')+(record.mode==='samples'?' 示例试算不计入完成进度。':'')+(!record.saved?' 结果未保存，不计入进度。':'');
  const details=$('result-details');details.replaceChildren();
  $('goto-error').hidden=record.type!=='python'||!record.result?.line;
  if(record.type==='choice'){
    details.append(node('p',`本次选择：${record.selected.join('、')}；正确选项：${record.result.correct.join('、')}。`));
    const list=node('ul');for(const option of question.options)list.append(node('li',`${option.id}：${record.result.explanations[option.id]}`));details.append(list);
  }else{
    if(record.result?.line&&!record.result?.traceback)details.append(node('p',`解答第 ${record.result.line} 行。`));
    if(record.result?.traceback){
      const header=node('div',undefined,'traceback-heading'),copy=node('button','复制 traceback');copy.type='button';
      const feedback=node('span','','muted');feedback.setAttribute('role','status');
      copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(record.result.traceback);feedback.textContent='已复制';}catch{feedback.textContent='请选中下方 traceback 手动复制。';}});
      header.append(node('h3','Python traceback'),copy,feedback);
      const trace=node('pre',record.result.traceback,'traceback');trace.tabIndex=0;trace.setAttribute('aria-label','Python traceback');details.append(header,trace);
    }
    if(record.result?.explanation)details.append(node('p',record.result.explanation));
    for(const row of record.result?.cases||[]){
      const detail=node('details');detail.append(node('summary',`用例 ${row.case}：${row.passed?'通过':'未通过'}`));
      if(row.difference)detail.append(node('p',row.difference));
      for(const [title,value] of [['输入参数',row.arguments],['预期输出',row.expected],['你的输出',row.actual]]){
        detail.append(node('h4',title),node('pre',JSON.stringify(value,null,2)));
      }
      details.append(detail);
    }
    const snapshot=node('details');snapshot.append(node('summary','查看本次提交的代码'),node('pre',record.source));details.append(snapshot);
    if(record.logs){const log=node('details');log.append(node('summary','运行输出'),node('pre',record.logs));details.append(log);}
  }
  snapshotNote();
  if(record.type==='python'&&record.result?.line&&$('source').value===record.source)editor.markError(record.result.line);
  if(fresh){
    $('result-announcement').textContent=`${$('result-title').textContent}。${$('result-summary').textContent}`;
    $('answer-area').scrollTop=0;
    const top=$('result').getBoundingClientRect();
    if(top.top<180||top.bottom>innerHeight)$('result').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('result').animate([{opacity:.35,transform:'translateY(-6px)'},{opacity:1,transform:'translateY(0)'}],{duration:250,easing:'cubic-bezier(.2,.75,.25,1)'});
  }
}
async function poll(id){
  clearTimeout(pollTimer);
  try{
    const record=await api(`/api/v1/submissions/${id}`);
    if(record.state==='FINISHED'){
      if(active===id)active=null;clear(`pending:${record.exercise_id}`);save(`last:${record.exercise_id}`,id);updateBusy();
      if(question?.id===record.exercise_id)$('attempt-message').textContent='';
      showResult(record,true);await progress();
    }else{
      active=id;updateBusy();
      if(question?.id===record.exercise_id)$('attempt-message').textContent='正在计算，可以继续编辑代码。';
      pollTimer=setTimeout(()=>void poll(id),document.hidden?5000:1000);
    }
  }catch(error){
    connectionError(error);
    if(error.status===404){active=null;clear(`pending:${question.id}`);updateBusy();$('attempt-message').textContent='本机没有接收到该提交；草稿保留，可重新提交。';}
  }
}
async function select(id,push=true){
  const revision=++selection;
  const q=await api(`/api/v1/exercises/${id}`);
  if(revision!==selection)return;
  question=q;lastRecord=null;$('result').hidden=true;$('attempt-message').textContent='';$('open-feedback').textContent='';
  const url=new URL(location.href);url.searchParams.delete('exercise');url.searchParams.set('question',q.slug);if(push)history.pushState({},'',url);else history.replaceState({},'',url);
  renderQuestions();rememberQuestion(q.slug);document.title=`${q.title} · ${chapter.title}`;
  document.querySelectorAll('#code-requirements details, .hint').forEach(d=>d.open=false);
  for(const link of $('questions').querySelectorAll('a')){if(link.dataset.id===q.id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  $('question-meta').textContent=`${lessons.find(l=>l.id===q.lesson_id).title} · ${q.type==='choice'?(q.multiple?'多项选择题':'单项选择题'):'Python 计算题'}`;
  $('question-title').textContent=q.title;$('statement').textContent=q.statement;
  $('choice-panel').hidden=q.type!=='choice';$('code-panel').hidden=q.type!=='python';$('code-requirements').hidden=q.type!=='python';
  $('hint').textContent=q.hint||'先根据本节的模型、单位和假设逐项判断，再提交答案查看解析。';
  if(q.type==='choice'){
    $('choice-instruction').textContent=q.multiple?'选择所有正确项；多选或漏选均不算通过。':'选择一个最合适的答案。';
    $('options').replaceChildren();
    for(const option of q.options){const label=node('label',undefined,'option');const input=node('input');input.type=q.multiple?'checkbox':'radio';input.name='answer';input.value=option.id;input.addEventListener('change',snapshotNote);label.append(input,node('span',`${option.id}. ${option.text}`));$('options').append(label);}
  }else{
    renderContract(q.contract_view);
    $('contract').textContent=q.contract;
    $('limits').textContent=`允许库：${q.allowed_libraries.join('、')}；本机运行上限 ${q.limits.seconds} 秒，代码 64 KiB，返回结果 1 MiB，打印输出 256 KiB。数值容差：绝对误差 ${q.tolerance.atol} 或相对误差 ${q.tolerance.rtol}。`;
    renderExample($('sample-input'),q.example_view.input);renderExample($('sample-output'),q.example_view.output);
    $('sample-output').append(node('h4','样例解释','example-explanation-title'),node('p',q.example_view.explanation,'example-explanation'));
    editor.setValue(getStored(draftKey())??q.starter_code);$('draft-note').textContent='';$('undo-restore').hidden=true;
    const oldDraft=q.previous_version&&getStored(`draft:${q.id}:${q.previous_version}`);
    $('download-previous').hidden=typeof oldDraft!=='string';
    if(typeof oldDraft==='string')$('draft-note').textContent='本题已改用具名参数。旧版草稿仍保留，可下载后按新签名修改。';
  }
  $('exercise').hidden=false;$('exercise').dataset.kind=q.type;$('question-reading').scrollTop=0;updateBusy();
  if(push)$('questions').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  const pending=getStored(`pending:${q.id}`);if(pending){active=pending;updateBusy();void poll(pending);}
  else {const previous=getStored(`last:${q.id}`);if(previous)void api(`/api/v1/submissions/${previous}`).then(record=>{if(revision===selection)showResult(record);}).catch(error=>{if(error.status===404)clear(`last:${q.id}`);else connectionError(error);});}
}
async function submit(mode){
  const q=question,id=crypto.randomUUID();
  const payload={exercise_id:q.id,exercise_version:q.version,request_id:id};
  if(q.type==='choice'){
    payload.selected=selected();if(!payload.selected.length){$('attempt-message').textContent='请先选择答案。';return;}
    $('submit-choice').disabled=true;
  }else{payload.source=$('source').value;payload.mode=mode;active=id;updateBusy();}
  save(`pending:${q.id}`,id);$('result').hidden=true;$('attempt-message').textContent='正在提交…';$('answer-area').scrollTop=0;
  try{
    const record=await api(q.type==='choice'?'/api/v1/choice-attempts':'/api/v1/submissions',payload);
    if(record.state==='FINISHED'){clear(`pending:${q.id}`);save(`last:${q.id}`,id);if(active===id)active=null;updateBusy();if(question.id===q.id){$('attempt-message').textContent='';showResult(record,true);}await progress();}
    else void poll(record.id);
  }catch(error){
    if(error.status){clear(`pending:${q.id}`);if(active===id)active=null;updateBusy();}
    if(question.id===q.id)$('attempt-message').textContent=error.message;
    if(error.details?.code==='BUSY'){active=error.details.active;updateBusy();void poll(active);}
    else if(!error.status||error.status===403)connectionError(error);
  }finally{$('submit-choice').disabled=false;}
}
async function connect(){
  try{
    session=await api('/api/session');
    if(session.practice_version!=='named-parameters-2')throw new Error('请停止旧的本地程序，重新启动当前版本后恢复连接。');
    const data=await api('/api/v1/catalog');
    const lessonIds=new Set(chapter.lessons.map(l=>l.id));
    catalog=data.exercises.filter(q=>lessonIds.has(q.lesson_id));lessons=data.notebooks.filter(l=>lessonIds.has(l.id));
    if(!catalog.length||lessons.length!==lessonIds.size)throw new Error('本机程序尚未载入本章，请重新启动教材服务。');
    $('lesson-picker').replaceChildren();for(const lesson of lessons){const option=node('option',lesson.title);option.value=lesson.id;$('lesson-picker').append(option);}
    $('connection-help').hidden=true;$('loading-note').hidden=true;document.body.dataset.ready='true';
    await progress();
    const params=new URL(location.href).searchParams,requested=catalog.find(q=>q.slug===params.get('question')||q.id===params.get('exercise'));
    await select(requested?.id||catalog[0].id,false);
    if(active)void poll(active);
  }catch(error){$('loading-note').hidden=true;connectionError(error);}
}
$('submit-choice').addEventListener('click',()=>void submit('full'));
$('run-samples').addEventListener('click',()=>void submit('samples'));
$('submit-code').addEventListener('click',()=>void submit('full'));
$('cancel').addEventListener('click',async()=>{if(!active)return;try{const id=active;await api(`/api/v1/submissions/${id}/cancel`,{});await poll(id);}catch(error){connectionError(error);}});
$('source').addEventListener('input',()=>{save(draftKey(),$('source').value);snapshotNote();});
$('restore-code').addEventListener('click',()=>{undo=$('source').value;editor.setValue(question.starter_code);$('undo-restore').hidden=false;save(draftKey(),$('source').value);snapshotNote();});
$('undo-restore').addEventListener('click',()=>{editor.setValue(undo);$('undo-restore').hidden=true;save(draftKey(),undo);snapshotNote();});
$('indent').addEventListener('click',editor.indent);
$('goto-error').addEventListener('click',()=>{
  if(lastRecord?.result?.line&&$('source').value===lastRecord.source){
    $('editor-surface').scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    editor.goToLine(lastRecord.result.line,lastRecord.result.column||1);
  }
});
$('toggle-result').addEventListener('click',()=>{const closed=!$('result-body').hidden;$('result-body').hidden=closed;$('toggle-result').textContent=closed?'展开详情':'收起详情';$('toggle-result').setAttribute('aria-expanded',String(!closed));});
function downloadCode(source,name){const url=URL.createObjectURL(new Blob([source],{type:'text/plain;charset=utf-8'}));const link=node('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download-code').addEventListener('click',()=>downloadCode($('source').value,`${question.slug}.py`));
$('download-previous').addEventListener('click',()=>{const source=getStored(`draft:${question.id}:${question.previous_version}`);if(typeof source==='string')downloadCode(source,`${question.slug}-previous.py`);});
$('open-notebook').addEventListener('click',async()=>{try{$('open-feedback').textContent='正在打开…';const result=await api('/api/notebooks/open',{id:question.lesson_id});$('open-feedback').textContent=result.message;}catch(error){$('open-feedback').textContent=error.message;}});
$('reconnect').addEventListener('click',()=>void connect());
function requestedQuestion(){const params=new URL(location.href).searchParams;return catalog.find(q=>q.slug===params.get('question')||q.id===params.get('exercise'))?.id||catalog[0].id;}
window.addEventListener('popstate',()=>void select(requestedQuestion(),false).catch(connectionError));
$('lesson-picker').addEventListener('change',()=>void select(catalog.find(q=>q.lesson_id===$('lesson-picker').value).id).catch(connectionError));
for(const [button,offset] of [['previous-question',-1],['next-question',1]])$(button).addEventListener('click',()=>{const next=catalog[catalog.findIndex(q=>q.id===question.id)+offset];if(next)void select(next.id).catch(connectionError);});
const context=await mountShell('practice');chapter=context.current;
if(!chapter?.available)throw Error('本章练习尚未提供。');
prefix=`systems-science:course:${chapter.id}:`;
document.querySelector('.practice-heading .eyebrow').textContent=`${chapter.assessment?'篇末综合':chapter.id+' 章'} · 练习`;
setupWorkspace($('exercise-workspace'),$('workspace-resizer'),$('wrap-code'),$('source'));
void connect();
