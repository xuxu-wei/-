import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme,seriesColors} from '../shared/theme.mjs';
import {exact,euler,properties,alternateNumerical,alternateInterval,alternateSpeed} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',end=12;
const fmt=n=>Number(n.toFixed(6)).toString();
const svg=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let current,mode,params={},series=[],playback;
const defaults={discrete:{initial:0,u:1,k:.5,h:1},continuous:{initial:0,u:1,k:.5},numerical:{initial:10,u:0,k:.75,h:1}};
function slider(key,label,min,max,step,value){
  params[key]=value;const group=el('div',undefined,'slider'),lab=el('label',label),out=el('output',String(value)),input=el('input');
  Object.assign(input,{id:key,type:'range',min,max,step,value});lab.htmlFor=key;out.htmlFor=key;out.id=key+'-value';
  input.addEventListener('input',()=>{params[key]=Number(input.value);out.value=input.value;recompute();});group.append(lab,out,input);$('sliders').append(group);
}
function setParams(values){for(const [key,value] of Object.entries(values)){params[key]=value;$(key).value=value;$(key+'-value').value=value;}recompute();}
function analytical(u,k,label,color=seriesColors.exact){
  const times=Array.from({length:241},(_,i)=>end*i/240);
  return {times,values:times.map(t=>exact(t,u,k,params.initial)),value:t=>exact(t,u,k,params.initial),label,color};
}
function recompute(){
  const {initial,u,k,h}=params;
  if(mode==='discrete'){
    series=[{...euler(initial,u,k,h),label:`段首规则 h=${h} T`,color:theme.data['1'],dots:true},
      {...euler(initial,u,k,h/2),label:`相同速率 h=${h/2} T`,color:theme.data['2'],dash:true,dots:true}];
    $('alternate').textContent=`切换到${h>.5?'较细':'较粗'}间隔 ${alternateInterval(h)} T`;
    $('preset-note').textContent='切换只改变更新间隔；观察区间、流入与清除系数不变。每段使用实际时长。';
  }else if(mode==='continuous'){
    series=[analytical(u,k,'当前输入与清除'),{...analytical(2*u,2*k,'输入与清除同时加倍',theme.data['2']),dash:true}];
    $('alternate').textContent=k>.5?'切回 u=1、k=0.5 示例':'切换到 u=2、k=1 示例';
    $('preset-note').textContent=k>0?`当前平衡量 ${fmt(u/k)} U，特征时间 ${fmt(1/k)} T；虚线的特征时间减半。`:'k=0：当前为线性累积，不使用 u/k 或 1/k。';
  }else{
    series=[analytical(u,k,'连续解析解'),{...euler(initial,u,k,h),label:`欧拉法 h=${h} T`,color:seriesColors.euler,dash:true,dots:true}];
    const negative=initial+h*(u-k*initial)<0;
    $('alternate').textContent=negative?'切换到正值示例':'切换到负值示例';
    $('preset-note').textContent='成对示例均用 A0=10 U、u=0、k=0.75/T；负值例 h=2 T，正值例 h=1 T。连续模型相同。';
  }
  if(series.some(s=>s.values.some(v=>!Number.isFinite(v))))throw Error('数值超出范围，请恢复起始条件。');
  $('mechanism').replaceChildren(el('span',`输入 ${u} U/T`),el('span','→','direction'),el('span','池内 A / U','system'),el('span','→','direction'),el('span',`清除 ${k} × A U/T`));
  $('legend').replaceChildren(...series.map(s=>{const n=el('span',s.label,s.dash?'dashed':'');n.style.setProperty('--line-color',s.color);return n;}));
  const source=mode==='numerical'?series[1]:series[0],t=el('table'),row=el('tr');
  row.append(el('th','时间 / T'),el('th',source.label+' / U'),el('th',mode==='numerical'?'同刻解析 / U':'逐点说明'));t.append(row);
  source.times.forEach((time,i)=>{if(mode==='continuous'&&i%20)return;const r=el('tr');r.append(el('td',fmt(time)),el('td',fmt(source.values[i])),el('td',mode==='numerical'?fmt(exact(time,u,k,initial)):mode==='continuous'?'由解析函数求值':'完成一次所选规则更新'));t.append(r);});
  $('value-table').replaceChildren(t);if(playback)playback.seek(0);else draw(0);
}
function draw(time){
  const target=mode==='numerical'?series[1]:series[0];
  let i=target.times.findLastIndex(t=>t<=time+1e-10);i=Math.max(0,i);
  const value=target.value?target.value(time):target.values[i],shownTime=target.value?time:target.times[i];
  $('timeline').value=time;$('time-readout').textContent=`t = ${time.toFixed(2)} T / ${end} T`;
  $('value').textContent=fmt(value)+' U';$('play-counter').textContent=`${time.toFixed(2)} T · ${fmt(value)} U`;
  $('value-label').textContent=target.value?'当前解析物质量':`最近完成时刻 ${fmt(shownTime)} T`;
  if(mode==='numerical'){
    const p=properties(params.k,params.h),reference=exact(shownTime,params.u,params.k,params.initial);
    $('observation').textContent=`q=${fmt(p.q)}；严格渐近稳定：${p.stable?'是':'否'}；非负保证：${p.nonnegative?'是':'否'}。同刻误差 ${fmt(Math.abs(value-reference))} U。`;
  }else $('observation').textContent=mode==='continuous'?'同一初始量，比较同一时刻；改变速度时同时检查终点趋势。':'标记在更新完成时出现；较小间隔会改变每步的输入量与清除比例。';
  $('model-warning').hidden=!(value<0);$('model-warning').textContent='负物质量是当前规则/步长的失败信号。这里保留负值；减小步长后重新比较，不把曲线裁剪为零。';
  const low=Math.min(0,...series.flatMap(s=>s.values)),high=Math.max(1,...series.flatMap(s=>s.values)),pad=(high-low)*.12;
  const x=t=>75+t/end*675,y=v=>315-(v-low+pad)/(high-low+2*pad)*270;
  const chart=$('chart');chart.replaceChildren(svg('title',{id:'svg-title'},'同一条件下的物质量轨迹'),svg('desc',{id:'svg-desc'},`当前 ${fmt(value)} U；精确数值见图下表格。`));
  for(let j=0;j<=4;j++){const v=low+(high-low)*j/4;chart.append(svg('line',{x1:75,x2:750,y1:y(v),y2:y(v),stroke:theme.ui.tint,'stroke-opacity':.5}),svg('text',{x:64,y:y(v)+5,'text-anchor':'end',fill:theme.ui.text,'font-size':14},Number(v.toPrecision(4))));}
  chart.append(svg('line',{x1:75,x2:750,y1:y(0),y2:y(0),stroke:theme.data.reference,'stroke-dasharray':'3 5'}));
  for(let t=0;t<=end;t+=2)chart.append(svg('text',{x:x(t),y:342,'text-anchor':'middle',fill:theme.ui.text,'font-size':14},t));
  chart.append(svg('text',{x:415,y:374,'text-anchor':'middle',fill:theme.ui.text,'font-size':15},'时间 / T'),svg('text',{x:75,y:22,fill:theme.ui.text,'font-size':15},'物质量 / U'));
  for(const s of series){
    const points=s.times.map((t,i)=>[t,s.values[i]]).filter(([t])=>t<=time+1e-10);
    if(s.value&&points.at(-1)?.[0]<time)points.push([time,s.value(time)]);
    chart.append(svg('polyline',{points:points.map(([t,v])=>`${x(t)},${y(v)}`).join(' '),fill:'none',stroke:s.color,'stroke-width':3,...(s.dash?{'stroke-dasharray':'8 5'}:{})}));
    if(s.dots)for(const [t,v] of points)chart.append(svg('circle',{cx:x(t),cy:y(v),r:3.4,fill:s.color}));
    else if(points.length){const [t,v]=points.at(-1);chart.append(svg('circle',{cx:x(t),cy:y(v),r:4,fill:s.color}));}
  }
  chart.append(svg('line',{x1:x(time),x2:x(time),y1:35,y2:320,stroke:theme.ui.primary,'stroke-opacity':.3,'stroke-dasharray':'2 4'}));
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`可视化未能运行：${error.message}。请刷新页面重试。`;document.querySelectorAll('#controls,#play,#replay,#timeline').forEach(n=>n.disabled=true);}
async function start(){
  ({current}=await mountShell('explore'));mode={'2.1':'discrete','2.3':'continuous','2.4':'numerical'}[current?.id];if(!mode)throw Error('该章没有此探索页');
  $('eyebrow').textContent=`${current.id} 章 · 可视化与探索`;
  $('title').textContent={discrete:'一步的规则，累积成怎样的过程',continuous:'相同的平衡，可以有不同的速度',numerical:'步长改变的是算法，还是系统'}[mode];
  $('question').textContent={discrete:'同样的输入（input）与清除速率，改变更新间隔后，末量是否相同？先预测，再播放比较。',continuous:'把输入（input）和清除系数（elimination rate constant）同时加倍，平衡（equilibrium）位置和靠近速度会怎样变？',numerical:'没有输入（input）的单室模型（one-compartment model）连续衰减时始终非负；为什么欧拉法（forward Euler method）可能得到负值？先比较正值与负值示例，再改变步长。'}[mode];
  $('explanation').textContent={discrete:'这里把单室模型（one-compartment model）的递推关系（recurrence relation）写成段首更新：清除系数（elimination rate constant）k 乘段首物质量，得到本段采用的清除速率。时间步长（time step）乘流率（flow rate）才是本段转移量。两条线只改变间隔。',continuous:'理想单室模型（one-compartment model）的解析解（analytical solution）在这里直接求值。蓝线用当前条件，玫红虚线同时把输入和清除系数加倍；特征时间（characteristic time）1/k 表示接近平衡的时间尺度（time scale），随之改变。',numerical:'用清除系数（elimination rate constant）k 和时间步长（time step）h 组成 kh。数值稳定性（numerical stability）在此以严格渐近稳定（asymptotic stability）检查偏差是否趋于零；非负性（nonnegativity）检查物质量的符号。数值误差（numerical error）仍需对照解析解（analytical solution）。'}[mode];
  $('formula').textContent=mode==='continuous'?'A(t) = A0 exp(−kt) + (u/k)(1−exp(−kt))；k=0 时 A=A0+ut':'下一段物质量 = 当前量 + 实际时长 × (u − k × 当前量)';
  $('assumptions').textContent='假设：均匀混合、恒定流入、一阶清除，无内部生成或瞬时注入。参数（parameter）均为教学选值；A0 用 U，u 用 U/T，k 用 1/T。动画速度只控制展示，不改变计算。';
  $('reading-prompt').textContent=mode==='numerical'?'在 Notebook 中继续检查误差细化、kh=0/1/2 的边界，以及变化输入下的分段传播。':'回到 Notebook 阅读假设、推导、独立核验和迁移练习。';
  const values=defaults[mode];slider('initial','初始物质量 A0 / U',0,20,.5,values.initial);slider('u','流入速率 u / (U/T)',0,4,.25,values.u);slider('k','清除系数 k / (1/T)',0,1,.05,values.k);
  if(mode!=='continuous')slider('h','名义步长 h / T',.25,3,.25,values.h);
  recompute();playback=createPlayback({duration:end,speed:2,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':reason==='ended'?'再次播放':'播放';$('play-status').textContent=reason==='playing'?'正在播放：观察时间、数值与曲线。':reason==='ended'?'已到终点，可往返切换示例或重播。':'已暂停；拖动时间查看结果，改变条件会回到起点。';}});
  $('play').addEventListener('click',()=>playback.running?playback.pause():playback.play());$('replay').addEventListener('click',()=>{playback.seek(0);playback.play();});$('timeline').addEventListener('input',()=>playback.seek(Number($('timeline').value)));
  $('alternate').addEventListener('click',()=>setParams(mode==='numerical'?alternateNumerical(params):mode==='discrete'?{h:alternateInterval(params.h)}:alternateSpeed(params.k)));
  $('reset').addEventListener('click',()=>setParams(defaults[mode]));document.addEventListener('visibilitychange',()=>{if(document.hidden&&playback.running)playback.pause();});
  for(const lesson of current.lessons){const button=el('button',`在默认 IDE 打开：${lesson.title}`);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const r=await fetch('/api/session'),session=await r.json();const result=await(await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})})).json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
  playback.seek(0);document.querySelectorAll('#controls,#play,#replay,#timeline').forEach(n=>n.disabled=false);document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=current.title+' · 可视化与探索';
}
start().catch(failed);
