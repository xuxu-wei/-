import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {stock,response,describe,alternateDelay,alternateFlows} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const fmt=n=>Number(n.toFixed(4)).toString();
const svg=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let current,isStock,playback,series=[],params={},limit;
function slider(key,label,min,max,step,value){
  params[key]=value;const group=el('div',undefined,'slider'),lab=el('label',label),out=el('output',String(value));
  const input=el('input');input.type='range';input.id=key;input.min=min;input.max=max;input.step=step;input.value=value;lab.htmlFor=key;out.htmlFor=key;out.id=key+'-value';
  input.addEventListener('input',()=>{params[key]=Number(input.value);out.value=input.value;recompute();});
  group.append(lab,out,input);$('sliders').append(group);
}
function setParams(values){for(const [key,value] of Object.entries(values)){params[key]=value;$(key).value=value;$(key+'-value').value=value;}recompute();}
function line(label,color,dashed=false){const n=el('span',label,dashed?'dashed':'');n.style.setProperty('--line-color',color);return n;}
function table(){
  const t=el('table'),head=el('tr');head.append(el('th',isStock?'时刻 / T':'步数'));
  for(const s of series)head.append(el('th',s.label+(isStock?' / U':' / °C')));t.append(head);
  for(let i=0;i<=limit;i++){const row=el('tr');row.append(el('td',String(i)));for(const s of series)row.append(el('td',fmt(s.values[i])));t.append(row);}
  $('value-table').replaceChildren(t);
}
function recompute(){
  if(isStock){
    series=[{label:'总量 A',color:theme.data['1'],values:Array.from({length:limit+1},(_,t)=>stock(params.initial,params.inflow,params.outflow,t))}];
    $('alternate').textContent=params.inflow>params.outflow?'切换到净流出示例':'切换到净流入示例';
    $('preset-note').textContent=`当前：${params.inflow>params.outflow?'净流入':params.inflow<params.outflow?'净流出':'流入流出相等'}。切换示例把流入/流出改为 3/1 或 1/3，初始量保持不变。`;
    const incoming=el('span',`流入 ${params.inflow} U/T`),arrow=el('span','→','direction'),box=el('span','边界内 A','system'),arrow2=el('span','→','direction'),outgoing=el('span',`流出 ${params.outflow} U/T`);
    $('mechanism').replaceChildren(incoming,arrow,box,arrow2,outgoing);
  }else{
    series=[{label:'即时调节',color:theme.data['1'],values:response([params.initial],params.gain,0,limit)},
      {label:`延迟 ${params.delay} 步`,color:theme.data['2'],dash:true,values:response(Array(params.delay+1).fill(params.initial),params.gain,params.delay,limit)}];
    $('alternate').textContent=params.delay===0?'切换到两步延迟':'切换到即时调节';
    $('preset-note').textContent=`当前读取 ${params.delay} 步以前的偏差；切换仅改变延迟，起点与强度保持不变。初始历史均为 ${params.initial} °C。`;
    $('mechanism').replaceChildren(el('span',`偏差 e`,'system'),el('span',`→ 读取 ${params.delay} 步前 →`),el('span',`反向修正 ${params.gain} × 旧偏差`,'signal'),el('span','↩','direction'));
  }
  if(series.some(s=>s.values.some(v=>!Number.isFinite(v))))throw Error('模型产生非有限数值，请恢复起始条件。');
  $('legend').replaceChildren(...series.map(s=>line(s.label,s.color,s.dash)));table();
  playback?.seek(0);if(!playback)draw(0);
}
function draw(time){
  const index=Math.floor(time),path=isStock?series[0].values:series[1].values;
  const value=isStock?stock(params.initial,params.inflow,params.outflow,time):path[index];
  $('timeline').value=time;$('time-readout').textContent=isStock?`t = ${time.toFixed(2)} T`:`已观察 ${index} / ${limit} 步`;
  $('value').textContent=fmt(value)+(isStock?' U':' °C');
  $('play-counter').textContent=$('time-readout').textContent+' · '+$('value').textContent;
  $('observation').textContent=isStock?`累计流入 ${fmt(params.inflow*time)} U，累计流出 ${fmt(params.outflow*time)} U。`: `截至此步最大绝对偏差 ${fmt(describe(path.slice(0,index+1)).maxAbs)} °C；转向 ${describe(path.slice(0,index+1)).turns} 次。`;
  $('model-warning').hidden=!(isStock&&value<0);$('model-warning').textContent='原规则出现负总量：固定流出无法按该假设持续。曲线保留失败值；不能裁剪为零后仍声称原账目守恒。';
  const low=Math.min(0,...series.flatMap(s=>s.values)),high=Math.max(1,...series.flatMap(s=>s.values));
  const pad=(high-low)*.12,yMin=low-pad,yMax=high+pad;
  const x=t=>70+t/limit*690,y=v=>315-(v-yMin)/(yMax-yMin)*270;
  const chart=$('chart');chart.replaceChildren(svg('title',{id:'svg-title'},isStock?'存量随累计流入流出变化':'即时与延迟调节对照'),svg('desc',{id:'svg-desc'},`当前值 ${fmt(value)}；完整数值见图下表格。`));
  for(let i=0;i<=4;i++){const v=low+(high-low)*i/4;chart.append(svg('line',{x1:70,x2:760,y1:y(v),y2:y(v),stroke:theme.ui.tint,'stroke-opacity':.5}),svg('text',{x:59,y:y(v)+5,'text-anchor':'end',fill:theme.ui.text,'font-size':14},fmt(v)));}
  chart.append(svg('line',{x1:70,x2:760,y1:y(0),y2:y(0),stroke:theme.data.reference,'stroke-dasharray':'3 5'}));
  for(let t=0;t<=limit;t+=isStock?1:2)chart.append(svg('text',{x:x(t),y:341,'text-anchor':'middle',fill:theme.ui.text,'font-size':14},t));
  chart.append(svg('text',{x:415,y:372,'text-anchor':'middle',fill:theme.ui.text,'font-size':15},isStock?'时间 / T':'更新步数'),svg('text',{x:70,y:22,fill:theme.ui.text,'font-size':15},isStock?'总量 / U':'温度偏差 / °C'));
  for(const s of series){
    let points=s.values.slice(0,index+1).map((v,i)=>[i,v]);
    if(isStock&&time>index)points.push([time,stock(params.initial,params.inflow,params.outflow,time)]);
    chart.append(svg('polyline',{points:points.map(([t,v])=>`${x(t)},${y(v)}`).join(' '),fill:'none',stroke:s.color,'stroke-width':3,...(s.dash?{'stroke-dasharray':'8 5'}:{})}));
    for(const [t,v] of points)chart.append(svg(s.dash?'rect':'circle',s.dash?{x:x(t)-3.5,y:y(v)-3.5,width:7,height:7,fill:s.color}:{cx:x(t),cy:y(v),r:3.5,fill:s.color}));
  }
  chart.append(svg('line',{x1:x(isStock?time:index),x2:x(isStock?time:index),y1:38,y2:318,stroke:theme.ui.primary,'stroke-opacity':.35,'stroke-dasharray':'2 4'}));
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`可视化未能运行：${error.message}。请刷新或恢复起始条件。`;document.querySelectorAll('#controls, #play, #replay, #timeline').forEach(n=>n.disabled=true);}
async function start(){
  ({current}=await mountShell('explore'));isStock=current?.id==='1.2';if(!['1.2','1.3'].includes(current?.id))throw Error('本章尚无这一可视化。');limit=isStock?3:12;
  $('eyebrow').textContent=`${current.id} 章 · 可视化与探索`;
  $('title').textContent=isStock?'流过多少，才积累多少':'同一个调节方向，不同的信息年龄';
  $('question').textContent=isStock?'流率（flow rate）相同，时间加倍后会积累多少？先预测终点，再播放并对照账目。':'先预测：一直读取过去的偏差（deviation），会不会在到达目标之后继续向同一方向修正？';
  $('explanation').textContent=isStock?'存量（stock）是边界内已经拥有的所追踪物质总量（tracked amount），后文简称总量；流量（flow）在此指每单位时间通过的流率。每段流率恒定时，累计量等于流率乘持续时间。':'负反馈（negative feedback）让修正方向抵消所读取的偏差；延迟（delay）决定读取的是多早以前的信息。gain 是每次修正的比例，delay 是读取信息的滞后步数；偏差为负表示低于目标。';
  $('formula').textContent=isStock?'末量 = 初量 + 持续时间 ×（流入速率 − 流出速率）':'新偏差 = 当前偏差 − gain × delay 步以前的偏差';
  $('assumptions').textContent=isStock?'假设：无内部生成或转化，流入与流出恒定。第 1 段为 0—1 T，第 2 段为 1—3 T；图中按恒定流率计算时刻内的累计量，未使用数值积分。所有数值均为教学选值。':'假设：人工温度规则，初始历史恒定，忽略噪声、外部扰动和执行限幅。蓝线始终即时读取，玫红线使用所选延迟；点之间的连线仅引导阅读。动画速度不改变计算规则，有限轨迹不证明任意长时间行为。';
  $('value-label').textContent=isStock?'边界内的总量':'所选延迟的偏差';
  $('reading-prompt').textContent=isStock?'在 Notebook 中逐段推导账目，再比较内部交换为什么在总账中抵消。':'在 Notebook 中核对历史索引、手算前几步，再检查转向次数与结论范围。';
  if(isStock){slider('initial','初始总量 / U',0,10,.5,5);slider('inflow','流入速率 / (U/T)',0,6,.5,3);slider('outflow','流出速率 / (U/T)',0,6,.5,1);}
  else{slider('initial','初始历史偏差 / °C',-3,3,.5,2);slider('gain','调节比例 gain',0,1,.05,.5);slider('delay','信息延迟 / 步',0,2,1,2);}
  recompute();
  playback=createPlayback({duration:limit,speed:isStock?0.5:1.5,update:draw,failed,changed:(reason)=>{$('play').textContent=reason==='playing'?'暂停':reason==='ended'?'再次播放':'播放';$('play-status').textContent=reason==='playing'?'正在播放：观察时间、数值与曲线。':reason==='ended'?'已到终点，可重播或改变条件。':'已暂停，可拖动观察位置；调参后从起点重新比较。';}});
  $('timeline').max=limit;
  $('play').addEventListener('click',()=>{if(playback.running)playback.pause();else playback.play();});
  $('replay').addEventListener('click',()=>{playback.seek(0);playback.play();});
  $('timeline').addEventListener('input',()=>playback.seek(Number($('timeline').value)));
  $('alternate').addEventListener('click',()=>{if(isStock){const [inflow,outflow]=alternateFlows(params.inflow,params.outflow);setParams({inflow,outflow});}else setParams({delay:alternateDelay(params.delay)});});
  $('reset').addEventListener('click',()=>setParams(isStock?{initial:5,inflow:3,outflow:1}:{initial:2,gain:.5,delay:2}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playback.running)playback.pause();});
  for(const lesson of current.lessons){
    const button=el('button',`在默认 IDE 打开：${lesson.title}`);button.type='button';
    button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json();const r=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})});const result=await r.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机程序连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);
  }
  playback.seek(0);document.querySelectorAll('#controls, #play, #replay, #timeline').forEach(n=>n.disabled=false);
  document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=current.title+' · 可视化与探索';
}
start().catch(failed);
