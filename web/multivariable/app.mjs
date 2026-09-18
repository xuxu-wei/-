import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {symmetric,rotation,closed,matvec,local,alternatePerturbation,alternateBackflow} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',end=12;
const blue=theme.data['1'],pink=theme.data['2'],gray=theme.data.reference;
const fmt=n=>Number(n.toFixed(6)).toString();
const svg=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;};
let chapter,mode,params={},playback,values=[],reference=null,at,field;
const times=Array.from({length:1201},(_,i)=>i*.01);
function slider(key,label,min,max,step,value){
  params[key]=value;const group=el('div',undefined,'slider'),lab=el('label',label),out=el('output',value),input=el('input');
  Object.assign(input,{id:key,type:'range',min,max,step,value});lab.htmlFor=key;out.htmlFor=key;out.id=key+'-value';
  input.addEventListener('input',()=>{params[key]=Number(input.value);out.value=input.value;recompute();});group.append(lab,out,input);$('sliders').append(group);
}
function controls(){
  $('sliders').replaceChildren();params={};
  if(mode==='local')slider('delta','第一室初始扰动 / U',.1,3.5,.1,.2);
  else if(mode==='modes'&&$('model').value==='rotation'){
    slider('alpha','衰减率 α / (1/T)',0,.8,.05,.2);slider('omega','角频率 ω / (1/T)',0,2,.1,1);
    slider('x1','第一分量初值 / U',-3,3,.25,2);slider('x2','第二分量初值 / U',-3,3,.25,0);
  }else{
    slider('a','1 → 2 交换系数 a / (1/T)',0,.6,.05,.2);
    if(mode==='phase'){slider('b','2 → 1 交换系数 b / (1/T)',0,.6,.05,.1);slider('speed','整个向量场的倍率',.5,3,.5,1);}
    else slider('c','每室清除系数 c / (1/T)',0,.5,.05,.1);
    slider('x1','第一室初始物质量 / U',0,6,.5,6);slider('x2','第二室初始物质量 / U',0,6,.5,0);
  }
}
function set(values){for(const [key,value] of Object.entries(values)){params[key]=value;$(key).value=value;$(key+'-value').value=value;}recompute();}
function observation(state){return $('observation').value==='first'?state[0]:$('observation').value==='total'?state[0]+state[1]:state[0]-state[1];}
function recompute(){
  const p=params;reference=null;
  if(mode==='local'){
    const result=local([2+p.delta,4]);values=result.original.filter((_,i)=>i%2===0);reference=result.linear.filter((_,i)=>i%2===0);
    at=t=>values[Math.min(1200,Math.floor(t/.01+1e-8))];field=null;
    $('formula').textContent='δ′ ≈ Jδ，J = [[−0.325, 0.1], [0.2, −0.1]] /T；x = [2,4] + δ';
    $('alternate').textContent=p.delta>=1?'切换到近平衡示例':'切换到远平衡示例';
    $('preset-note').textContent=`当前第一室扰动 ${p.delta} U；完整 12 T 的最大分量差 ${fmt(result.error)} U。往返示例只改变扰动 .2 ↔ 3 U。`;
  }else if(mode==='phase'){
    at=t=>closed(p.a,p.b,[p.x1,p.x2],t,p.speed);
    field=x=>matvec([[-p.a*p.speed,p.b*p.speed],[p.a*p.speed,-p.b*p.speed]],x);
    $('formula').textContent='A1′ = s(−aA1 + bA2)，A2′ = s(aA1 − bA2)';
    $('alternate').textContent=p.b>0?'关闭回流通道':'恢复回流通道';
    $('preset-note').textContent=`当前回流 ${p.b>0?'开启':'关闭'}，b=${p.b}/T。按钮只切换 b=0 ↔ 0.1/T；总物质量 ${fmt(p.x1+p.x2)} U。`;
  }else if($('model').value==='rotation'){
    at=t=>rotation(p.alpha,p.omega,[p.x1,p.x2],t);field=x=>matvec([[-p.alpha,-p.omega],[p.omega,-p.alpha]],x);
    $('formula').textContent=`特征值 −${p.alpha} ± ${p.omega}i /T；半径按 exp(−αt) 缩放`;
    $('alternate').textContent=p.omega===0?'恢复旋转示例':'切换到不旋转示例';
    $('preset-note').textContent='人工偏差模型：负值表示低于参考点。往返示例只切换 ω=0 ↔ 1/T。';
  }else{
    at=t=>symmetric(p.a,p.c,[p.x1,p.x2],t);field=x=>matvec([[-p.a-p.c,p.a],[p.a,-p.a-p.c]],x);
    $('formula').textContent=`共同模态 λ=−${fmt(p.c)}/T；差异模态 λ=−${fmt(2*p.a+p.c)}/T`;
    const equal=p.x1===p.x2;$('alternate').textContent=equal?'切换到有差异的初值':'切换到两室相同初值';
    $('preset-note').textContent='成对初值 [6,0] ↔ [3,3] U，总量都为 6 U。再改为观察两分量之和，辨认差异模态为何不可见。';
  }
  if(mode!=='local')values=times.map(at);
  if(values.flat().some(x=>!Number.isFinite(x))||reference?.flat().some(x=>!Number.isFinite(x)))throw Error('出现非有限计算结果，请恢复起始条件。');
  $('legend').replaceChildren(...[[blue,'第一分量'],[pink,'第二分量'],[gray,'所选观测']].map(([color,label])=>{const n=el('span',label);n.style.setProperty('--line-color',color);return n;}));
  $('chart-note').textContent=mode==='local'?'时间图蓝/玫红分别对应两室，同色实线为原模型、虚线为局部模型。相图（phase portrait）以实虚线区分模型，两轴等比例。计算步长 h=0.005 T，每 0.01 T 展示一帧；灰点线是所选观测。':'时间曲线保留时间；相图（phase portrait）两轴等比例，灰箭头统一长度仅说明方向，圆点每 1 T 一个。灰点线为所选观测；曲线由解析解直接求值。';
  const table=el('table'),head=el('tr');head.append(...['t / T','第一分量 / U','第二分量 / U','观测 / U',...(reference?['最大分量差 / U']:[])].map(s=>el('th',s)));table.append(head);
  for(let t=0;t<=end;t++){const i=t*100,x=values[i],row=el('tr'),nums=[t,...x,observation(x)];if(reference)nums.push(Math.max(...x.map((v,j)=>Math.abs(v-reference[i][j]))));row.append(...nums.map(n=>el('td',fmt(n))));table.append(row);}
  $('value-table').replaceChildren(table);if(playback)playback.seek(0);else draw(0);
}
function draw(time){
  const state=at(time),index=Math.min(1200,Math.floor(time/.01+1e-8));
  $('time-readout').textContent=`t = ${time.toFixed(2)} T / 12 T`;$('timeline').value=time;
  $('value').textContent=`[${fmt(state[0])}, ${fmt(state[1])}]`;$('play-counter').textContent=time.toFixed(2)+' T';
  const gap=reference?Math.max(...state.map((x,j)=>Math.abs(x-reference[index][j]))):0;
  $('observation-value').textContent=`所选观测 ${fmt(observation(state))} U`+(reference?`；当前最大分量差 ${fmt(gap)} U`:'；当前速度 '+fmt(Math.hypot(...field(state)))+' U/T');
  const chart=$('chart');chart.replaceChildren(svg('title',{id:'svg-title'},'时间曲线与相轨迹联动'),svg('desc',{id:'svg-desc'},`当前状态 ${state.map(fmt).join('、')} U，完整值见下方表格。`));
  const all=values.flat().concat(reference?.flat()||[],values.map(observation)),low=Math.min(0,...all),high=Math.max(1,...all),pad=(high-low)*.08;
  const tx=t=>65+t/end*430,ty=v=>325-(v-low+pad)/(high-low+2*pad)*270;
  const extent=values.flat().concat(reference?.flat()||[]),min=Math.min(0,...extent),max=Math.max(1,...extent),span=max-min||1;
  const px=x=>635+(x-min+span*.08)/(span*1.16)*270,py=y=>325-(y-min+span*.08)/(span*1.16)*270;
  const label=(x,y,text,anchor='middle')=>svg('text',{x,y,'text-anchor':anchor,fill:theme.ui.text,'font-size':16},text);
  for(let i=0;i<=4;i++){
    const value=low+(high-low)*i/4,y=ty(value);
    chart.append(svg('line',{x1:65,x2:495,y1:y,y2:y,stroke:theme.ui.tint,'stroke-opacity':.55}),label(55,y+5,Number(value.toPrecision(3)),'end'));
    const phase=min+span*i/4;
    chart.append(svg('line',{x1:635,x2:905,y1:py(phase),y2:py(phase),stroke:theme.ui.tint,'stroke-opacity':.5}),label(625,py(phase)+5,Number(phase.toPrecision(3)),'end'),label(px(phase),348,Number(phase.toPrecision(3))));
  }
  for(let t=0;t<=12;t+=3)chart.append(label(tx(t),348,t));
  chart.append(label(280,382,'时间 / T'),label(65,24,'物质量或偏差 / U','start'),label(770,382,'第一分量 / U'),label(635,24,'第二分量 / U','start'));
  if(field){
    for(let i=0;i<=6;i++)for(let j=0;j<=6;j++){
      const x=min+span*i/6,y=min+span*j/6,rate=field([x,y]),norm=Math.hypot(...rate);if(norm<1e-10)continue;
      const dx=rate[0]/norm*13,dy=-rate[1]/norm*13,cx=px(x),cy=py(y);
      chart.append(svg('line',{x1:cx-dx/2,y1:cy-dy/2,x2:cx+dx/2,y2:cy+dy/2,stroke:'#b6bcc5','stroke-width':1.3}));
      chart.append(svg('polyline',{points:`${cx+dx/2-dx*.3-dy*.22},${cy+dy/2-dy*.3+dx*.22} ${cx+dx/2},${cy+dy/2} ${cx+dx/2-dx*.3+dy*.22},${cy+dy/2-dy*.3-dx*.22}`,fill:'none',stroke:'#b6bcc5','stroke-width':1.3}));
    }
  }
  const count=index+1;
  function line(points,color,dash=false,width=2.5){return svg('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':'7 5'}:{})});}
  const entries=[[values,false],...(reference?[[reference,true]]:[])];
  for(const [rows,dashed] of entries){
    const shown=rows.slice(0,count);
    if(!reference&&times[index]<time)shown.push(state);
    for(let j=0;j<2;j++)chart.append(line(shown.map((x,i)=>[tx(i<count?times[i]:time),ty(x[j])]),j?pink:blue,dashed));
    chart.append(line(shown.map(x=>[px(x[0]),py(x[1])]),blue,dashed,3));
  }
  chart.append(line(values.slice(0,count).map((x,i)=>[tx(times[i]),ty(observation(x))]),gray,true,1.4));
  for(let t=0;t<=time;t++)chart.append(svg('circle',{cx:px(values[t*100][0]),cy:py(values[t*100][1]),r:2.4,fill:gray}));
  chart.append(svg('circle',{'data-current':'state',cx:px(state[0]),cy:py(state[1]),r:6,fill:blue,stroke:'white','stroke-width':2}));
  for(let j=0;j<2;j++)chart.append(svg('circle',{cx:tx(time),cy:ty(state[j]),r:4,fill:j?pink:blue}));
  chart.append(svg('line',{x1:tx(time),x2:tx(time),y1:42,y2:325,stroke:theme.ui.primary,'stroke-dasharray':'2 5','stroke-opacity':.45}));
  $('model-warning').hidden=true;
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`可视化未能运行：${error.message}。请刷新重试。`;for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;}
async function start(){
  ({current:chapter}=await mountShell('explore'));mode={'3.2':'modes','3.3':'phase','3.4':'local'}[chapter?.id];if(!mode)throw Error('该章没有此探索页');
  $('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';
  $('title').textContent={modes:'什么在变化，什么被看见',phase:'同一路径，不同的时钟',local:'一张局部矩阵，能够预测多远'}[mode];
  $('question').textContent={modes:'先改变初值（initial condition），再改变观测（observation）：模态（mode）没有被激发，与它在观测中被抵消，如何区分？也可切换到人工偏差的阻尼旋转，连接实数轨迹（trajectory）与复数（complex number）表示。',phase:'两个室的状态（state）在相平面（phase plane）中怎样移动？改变整个向量场（vector field）的倍率，或关闭回流通道，观察路径、方向和时间各发生什么变化。',local:'以同一平衡（equilibrium）为起点，只改变初始扰动幅度，线性化（linearization）与原模型（model）的轨迹（trajectory）会相差多少？先预测，再往返比较。'}[mode];
  $('explanation').textContent={modes:'交换模型（model）以矩阵（matrix）组织两室状态（state）。特征向量（eigenvector）[1,1] 与 [1,−1] 对应共同和差异变化，特征值（eigenvalue）决定各自的时间尺度（time scale）。改为观察和，可能看不见内部重新分配；旋转示例则使用可正可负的偏差。',phase:'相轨迹（phase trajectory）连接经过的状态点。正倍率只改变同一路径上的速度，平衡（equilibrium）保持不变；关闭一个通道会改变平衡分配。箭头归一化后只表示方向，不表示速度。',local:'雅可比矩阵（Jacobian matrix）由偏导数（partial derivative）组成。本例输入（input）u=.5 U/T，交换 a=.2/T、b=.1/T，饱和清除 vA1/(K+A1) 中 v=1 U/T、K=2 U；平衡为 [2,4] U。近似必须推进偏差 δ=x−x*。'}[mode];
  $('assumptions').textContent={local:'假设：固定容积、充分混合、非负物质量；参数（parameter）均为教学选值。状态（state）按两室物质量排列。原模型与局部模型都用显式欧拉法（forward Euler method），时间步长（time step）固定 .005 T；Notebook 另以半步长检查数值误差（numerical error）。',phase:'假设：两个室充分混合、容积与参数（parameter）固定，没有外部输入或清除。直接计算解析解（analytical solution），改变倍率同时缩放两条交换通道。播放速度仅控制展示。',modes:'假设：固定参数（parameter）、同单位二维状态。交换例充分混合，旋转例是人工偏差系统；二者不可混作同一个物质机制。这里直接计算解析解（analytical solution）；播放速度仅控制展示。'}[mode];
  $('model-select').hidden=mode!=='modes';controls();recompute();
  playback=createPlayback({duration:end,speed:1.5,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':reason==='ended'?'再次播放':'播放';$('play-status').textContent=reason==='playing'?'正在播放：时间、曲线与状态点同步变化。':reason==='ended'?'已到终点，可切换示例或重播。':'已暂停；调参、切换模型或观测会回到起点。';}});
  $('play').addEventListener('click',()=>playback.running?playback.pause():playback.play());$('replay').addEventListener('click',()=>{playback.seek(0);playback.play();});$('timeline').addEventListener('input',()=>playback.seek(Number($('timeline').value)));
  $('model').addEventListener('change',()=>{controls();recompute();});$('observation').addEventListener('change',recompute);
  $('alternate').addEventListener('click',()=>set(mode==='local'?{delta:alternatePerturbation(params.delta)}:mode==='phase'?{b:alternateBackflow(params.b)}:$('model').value==='rotation'?{omega:params.omega===0?1:0}:params.x1===params.x2?{x1:6,x2:0}:{x1:3,x2:3}));
  $('reset').addEventListener('click',()=>{$('model').value='exchange';$('observation').value='first';controls();recompute();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playback.running)playback.pause();});
  for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json();const response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})});const result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
  playback.seek(0);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;
  document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';
}
start().catch(failed);
