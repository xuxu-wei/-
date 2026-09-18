import {mountShell,sampleBase} from '../shared/course-shell.mjs';
import {exactAmount, euler, diagnose} from './model.mjs';
import {theme, seriesColors} from '../shared/theme.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {decayExampleKind,nextDecayExample} from './examples.mjs';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const state = {u:1, k:0.5, A0:0, h:0.1, time:0};
const samples = Array.from({length:401}, (_,i)=>i*0.05);
let scale, capacity=2.2, playback, session=null, catalogRendered=false, flowGeometry;
const format = n => Math.abs(n)>=10000 ? n.toExponential(2) : Number(n.toPrecision(5)).toString();
const axisFormat = n => Math.abs(n)>=10000 ? n.toExponential(1) : Number(n.toPrecision(3)).toString();

function element(name, attributes, text) {
  const node=document.createElementNS(NS,name);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
  if (text!==undefined) node.textContent=text;
  return node;
}

function chart(svg, series, equilibrium=null) {
  svg.replaceChildren();
  const W=Math.max(240,svg.parentElement.clientWidth), H=300;
  const left=55, right=18, top=30, bottom=52;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const values=series.flatMap(s=>s.y);
  if (equilibrium!==null) values.push(equilibrium);
  let low=Math.min(0,...values), high=Math.max(0,...values);
  const span=Math.max(high-low,1);
  if (low<0) low-=span*0.08;
  high+=span*0.08;
  const x=t=>left+t/20*(W-left-right);
  const y=a=>H-bottom-(a-low)/(high-low)*(H-top-bottom);
  for (let i=0;i<=4;i++) {
    const amount=low+(high-low)*i/4, position=y(amount);
    svg.append(element('line',{x1:left,y1:position,x2:W-right,y2:position,stroke:theme.ui.tint,'stroke-opacity':0.6}));
    svg.append(element('text',{x:left-8,y:position+4,'text-anchor':'end'},axisFormat(amount)));
  }
  for (const time of [0,5,10,15,20]) svg.append(element('text',{x:x(time),y:H-bottom+24,'text-anchor':'middle'},time));
  svg.append(element('line',{x1:left,y1:y(0),x2:W-right,y2:y(0),stroke:theme.ui.border}));
  svg.append(element('text',{x:left,y:16},'物质量 A / U'));
  svg.append(element('text',{x:W-right,y:H-5,'text-anchor':'end'},'时间 t / T'));
  if (equilibrium!==null) svg.append(element('line',{x1:left,y1:y(equilibrium),x2:W-right,y2:y(equilibrium),stroke:seriesColors.reference,'stroke-dasharray':'4 5','stroke-width':1.5,'data-series':'reference'}));
  for (const s of series) {
    const points=s.t.map((time,i)=>`${x(time)},${y(s.y[i])}`).join(' ');
    svg.append(element('polyline',{points,fill:'none',stroke:s.color,'stroke-width':2.7,'stroke-dasharray':s.dash||'none','stroke-linejoin':'round','stroke-opacity':s.opacity??1,'data-series':s.id}));
    if (s.id==='euler' && s.t.length<50) for(let i=0;i<s.t.length;i++) svg.append(element('rect',{x:x(s.t[i])-2.7,y:y(s.y[i])-2.7,width:5.4,height:5.4,fill:'white',stroke:s.color,'stroke-width':1.5}));
  }
  return {x,y};
}

function layoutMechanism() {
  const svg=$('compartment'), width=Math.max(220,svg.clientWidth), compact=width<400;
  const center=width/2, tankWidth=compact?80:140, left=center-tankWidth/2, right=center+tankWidth/2;
  const bottom=compact?198:165, flowY=compact?130:98;
  svg.setAttribute('viewBox',`0 0 ${width} ${compact?248:220}`);
  svg.classList.toggle('compact',compact);
  $('tank-outline').setAttribute('d',`M ${left} ${bottom-135} V ${bottom} H ${right} V ${bottom-135}`);
  $('amount-fill').setAttribute('x',left+2); $('amount-fill').setAttribute('width',tankWidth-4);
  $('amount-surface').setAttribute('x1',left+2); $('amount-surface').setAttribute('x2',right-2);
  $('in-arrow').setAttribute('d',`M 14 ${flowY} H ${left-12}`);
  $('out-arrow').setAttribute('d',`M ${right+12} ${flowY} H ${width-14}`);
  for (const [id,x] of [['in-label',compact?50:left/2],['in-rate',compact?50:left/2],['out-label',compact?width-50:(right+width)/2],['out-rate',compact?width-50:(right+width)/2]]) {
    $(id).setAttribute('x',x);
    $(id).setAttribute('y',id.endsWith('label')?(compact?20:60):(compact?42:137));
  }
  $('amount-label').setAttribute('x',center); $('amount-label').setAttribute('y',bottom+30);
  $('capacity').setAttribute('x',compact?center:right+6); $('capacity').setAttribute('y',compact?55:30);
  $('capacity').setAttribute('text-anchor',compact?'middle':'start');
  $('zero-label').setAttribute('x',right+6); $('zero-label').setAttribute('y',bottom+4);
  $('in-particle').setAttribute('cy',flowY); $('out-particle').setAttribute('y',flowY-4);
  flowGeometry={bottom:bottom-2,leftEnd:left-20,rightStart:right+12,rightEnd:width-23};
}

function renderTime(time=state.time) {
  state.time=time;
  const amount=exactAmount(time,state), removal=state.k*amount;
  $('time').value=time;
  $('time-value').textContent=`${time.toFixed(2)} T`;
  $('amount-label').textContent=`A = ${format(amount)} U`;
  $('in-rate').textContent=`${format(state.u)} U/T`;
  $('out-rate').textContent=`${format(removal)} U/T`;
  const height=128*amount/capacity;
  $('amount-fill').setAttribute('height',height);
  $('amount-fill').setAttribute('y',flowGeometry.bottom-height);
  $('amount-surface').setAttribute('y1',flowGeometry.bottom-height);
  $('amount-surface').setAttribute('y2',flowGeometry.bottom-height);
  for (const [id,rate] of [['in-arrow',state.u],['out-arrow',removal]]) {
    $(id).setAttribute('stroke-width',1.8+0.4*rate);
    $(id).style.opacity=rate===0?0.2:1;
  }
  $('in-particle').setAttribute('cx',14+(time%1)*(flowGeometry.leftEnd-14));
  $('out-particle').setAttribute('x',flowGeometry.rightStart+((time+0.4)%1)*(flowGeometry.rightEnd-flowGeometry.rightStart));
  $('in-particle').style.opacity=state.u===0?0:Math.sin(Math.PI*(time%1));
  $('out-particle').style.opacity=removal===0?0:Math.sin(Math.PI*((time+0.4)%1));
  $('compartment-desc').textContent=`t=${format(time)} T；存量 ${format(amount)} U；流入 ${format(state.u)} U/T；清除 ${format(removal)} U/T。`;
  if (scale) {
    $('time-point').setAttribute('cx',scale.x(time));
    $('time-point').setAttribute('cy',scale.y(amount));
    $('time-line').setAttribute('x1',scale.x(time));
    $('time-line').setAttribute('x2',scale.x(time));
    const elapsed=samples.filter(t=>t<time).concat(time);
    $('elapsed-trajectory').setAttribute('points',elapsed.map(t=>`${scale.x(t)},${scale.y(exactAmount(t,state))}`).join(' '));
  }
}

function render() {
  layoutMechanism();
  for (const [id,key] of [['u','u'],['k','k'],['a0','A0']]) {
    $(id).value=state[key]; $(`${id}-value`).textContent=state[key].toFixed(2);
  }
  $('h').value=String(state.h);
  const amounts=samples.map(t=>exactAmount(t,state));
  const equilibrium=state.k>0?state.u/state.k:null;
  capacity=Math.max(1,...amounts)*1.1;
  $('capacity').textContent=`${axisFormat(capacity)} U`;
  scale=chart($('exact-chart'),[{id:'exact',t:samples,y:amounts,color:seriesColors.exact,opacity:0.2}],equilibrium);
  $('exact-chart').append(element('polyline',{id:'elapsed-trajectory',fill:'none',stroke:seriesColors.exact,'stroke-width':2.8,'stroke-linejoin':'round'}));
  $('exact-chart').append(element('line',{id:'time-line',y1:30,y2:248,stroke:theme.ui.border,'stroke-width':1,'stroke-dasharray':'2 4'}));
  $('exact-chart').append(element('circle',{id:'time-point',r:5,fill:theme.ui.text,stroke:'white','stroke-width':2}));
  $('equilibrium-note').textContent=equilibrium===null
    ? state.u===0?'u = k = 0：没有流入与清除，初始存量保持不变。':'k = 0 且 u > 0：只有流入，存量线性增加，没有有限平衡。'
    :`平衡 A* = u/k = ${format(equilibrium)} U。低于它时净流入为正，高于它时净流入为负。平衡时，流动仍可继续。`;
  try {
    const result=euler(state,state.h), diagnosis=diagnose(state,state.h,result.amounts);
    const error=Math.max(...result.times.map((t,i)=>Math.abs(result.amounts[i]-exactAmount(t,state))));
    chart($('numerical-chart'),[{id:'exact',t:samples,y:amounts,color:seriesColors.exact},{id:'euler',t:result.times,y:result.amounts,color:seriesColors.euler,dash:'7 4'}]);
    $('kh-value').textContent=format(diagnosis.kh); $('error-value').textContent=format(error);
    $('stability-note').textContent=diagnosis.stabilityText; $('positivity-note').textContent=diagnosis.positivityText;
    $('diagnosis').classList.toggle('warning',!diagnosis.positivity||diagnosis.stable===false);
  } catch(error) {
    $('numerical-chart').replaceChildren(); $('error-value').textContent='停止计算';
    $('stability-note').textContent=error.message; $('positivity-note').textContent='请减小步长后再检查。';
    $('diagnosis').classList.add('warning');
  }
  $('halve-step').disabled=$('h').selectedIndex===0;
  const example=decayExampleKind(state);
  $('decay-example').textContent=example==='negative'?'观察正值示例':'观察负值示例';
  $('decay-example-note').textContent=example==='negative'
    ?'当前为负值示例：u = 0，k = 0.75，A₀ = 10，h = 2。切换到正值示例只将 h 改为 1，观察第一步如何从 −5 U 变为 2.5 U。'
    :example==='positive'
      ?'当前为正值示例：u = 0，k = 0.75，A₀ = 10，h = 1。切换回负值示例只将 h 改为 2，对照相同模型的两条数值轨迹。'
      :'当前为自选参数。点击载入清除示例：u = 0，k = 0.75，A₀ = 10；可在 h = 2 的负值示例与 h = 1 的正值示例间往返比较。';
  renderTime();
}

function playbackChanged(status) {
  const active=status==='playing', ended=status==='ended'||state.time>=20;
  $('play').setAttribute('aria-pressed',String(active));
  $('play').textContent=active?'暂停动画':ended?'重新播放':'播放动画';
  $('playback-state').textContent=active?'正在播放 · 2 T/s':ended?'播放结束 · 20 T':status==='hidden'?'页面切换，已暂停':status==='error'?'播放已停止':'已暂停';
}

function setNotebookAvailability(enabled) {
  document.querySelectorAll('[data-notebook]').forEach(button=>{button.disabled=!enabled;});
}

function renderCatalog(catalog) {
  if (catalogRendered) return;
  for (const lesson of catalog) {
    const card=document.createElement('article'); card.className='lesson-card';
    const number=document.createElement('span'); number.className='lesson-number'; number.textContent=`第 ${catalog.indexOf(lesson)+1} 节`;
    const title=document.createElement('h3'); title.textContent=lesson.title;
    const outcome=document.createElement('p'); outcome.textContent=lesson.outcome;
    const action=document.createElement('div'); action.className='open-action';
    const button=document.createElement('button'); button.type='button'; button.className='notebook-open';
    button.dataset.notebook=lesson.id; button.textContent='在默认 IDE 中打开 ↗';
    button.setAttribute('aria-label',`在默认 IDE 中打开 ${lesson.title}`);
    const practice=document.createElement('a'); practice.href=sampleBase+'practice/?question='+shell.course.sample.lessons.find(l=>l.id===lesson.id).questions[0].slug;
    const count=shell.course.sample.lessons.find(l=>l.id===lesson.id).questions.length;practice.textContent=`本节 ${count} 道练习 →`; practice.setAttribute('aria-label',`${lesson.title} · ${count} 道练习`);
    action.append(button); card.append(number,title,outcome,action,practice); $('notebook-links').append(card);
  }
  catalogRendered=true;
}

async function connect() {
  setNotebookAvailability(false); session=null;
  $('connection-state').textContent='正在连接本机';
  $('connection-state').className='connection';
  try {
    const response=await fetch('/api/session',{cache:'no-store',signal:AbortSignal.timeout(4000)});
    if (!response.ok) throw new Error('本地程序尚未提供 IDE 打开功能。请停止旧程序，使用当前 tools/serve.py 重新启动。');
    const result=await response.json();
    if (result.version!=='m1-local-ide-1') throw new Error('请重启项目中的 tools/serve.py，再重新连接。');
    session=result; renderCatalog(result.notebooks); setNotebookAvailability(true);
    $('connection-state').className='connection connected'; $('connection-state').textContent='本机已连接';
    $('connection-help').hidden=true;
  } catch(error) {
    $('connection-state').className='connection disconnected'; $('connection-state').textContent='本机未连接';
    $('connection-message').textContent=error instanceof TypeError||error.name==='TimeoutError'
      ?'本地程序未连接。启动后点击“重新连接”，即可在默认 IDE 中打开 Notebook。已加载的可视化仍可操作。':error.message;
    $('connection-help').hidden=false;
  }
}

async function openNotebook(button) {
  const action=button.closest('.open-action');
  let feedback=action.querySelector('.open-feedback');
  if (!feedback) {feedback=document.createElement('span'); feedback.className='open-feedback'; feedback.setAttribute('role','status'); action.append(feedback);}
  if (!session) {feedback.textContent='请先重新连接本地程序。'; feedback.classList.add('error'); return;}
  button.disabled=true; button.setAttribute('aria-busy','true'); feedback.classList.remove('error'); feedback.textContent='正在请求系统默认 IDE…';
  try {
    const response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:button.dataset.notebook}),signal:AbortSignal.timeout(12000)});
    const result=await response.json();
    if (!response.ok || result.status!=='requested') throw new Error(result.error||'未能请求默认 IDE，请重试。');
    feedback.textContent=result.message;
  } catch(error) {
    feedback.classList.add('error');
    feedback.textContent=error instanceof TypeError||error.name==='TimeoutError'
      ?'未收到本地程序的确认。请先检查 IDE 是否已打开文件，再重新连接或重试。':error.message;
    $('connection-help').hidden=false;
    $('connection-message').textContent='如果本地程序已关闭或重启，请重新连接后重试。';
  } finally {button.disabled=!session; button.removeAttribute('aria-busy');}
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-notebook]');
  if (button && !button.disabled) {event.preventDefault(); void openNotebook(button);}
});
$('reconnect').addEventListener('click',()=>void connect());

const shell=await mountShell('explore');
render();
playback=createPlayback({update:renderTime,changed:playbackChanged,failed:error=>{
  $('loading-note').hidden=false; $('loading-note').classList.add('error');
  $('loading-note').textContent=`动画已停止：${error.message}。请恢复默认参数后重试。`;
}});
for (const [id,key] of [['u','u'],['k','k'],['a0','A0']]) $(id).addEventListener('input',event=>{
  playback.seek(0); state[key]=Number(event.target.value); render();
});
$('h').addEventListener('change',event=>{state.h=Number(event.target.value); render();});
$('time').addEventListener('input',event=>playback.seek(Number(event.target.value)));
$('play').addEventListener('click',()=>{if(playback.running) playback.pause(); else playback.play();});
$('reset').addEventListener('click',()=>{playback.seek(0); Object.assign(state,{u:1,k:0.5,A0:0,h:0.1,time:0}); render(); $('loading-note').hidden=true;});
$('no-clearance').addEventListener('click',()=>{playback.seek(0); state.k=0; render();});
$('decay-example').addEventListener('click',()=>{playback.seek(0); Object.assign(state,nextDecayExample(state)); render();});
$('halve-step').addEventListener('click',()=>{const index=$('h').selectedIndex; if(index>0){state.h=Number($('h').options[index-1].value); render();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden && playback.running) playback.pause('hidden');});
window.addEventListener('resize',render);
// 目录收起或拖动不会触发 window.resize；按图形容器的实际宽度重绘。
const visualWidths=new WeakMap();
new ResizeObserver(entries=>{
  let changed=false;
  for(const entry of entries){const width=entry.contentRect.width;if(visualWidths.get(entry.target)!==width){visualWidths.set(entry.target,width);changed=true;}}
  if(changed)render();
}).observe(document.querySelector('.course-main'));
for (const id of ['u','k','a0','time','play','reset','no-clearance','h','decay-example']) $(id).disabled=false;
$('playback-state').textContent='准备就绪';
document.body.dataset.ready='true'; $('loading-note').hidden=true;
void connect();
