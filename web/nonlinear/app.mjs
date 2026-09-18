import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {switchPath,scanBias,radial,driven,separate,alternateInitial,alternateMu,alternateR,alternateBias} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const blue=theme.data['1'],pink=theme.data['2'],gray=theme.data.reference,green='#009e73';
const fmt=x=>Number(x.toFixed(6)).toString();
const svg=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let chapter,mode,params={},playback,end=20,h=.01,rows=[],other=[],branches=[],distance=[],crossing=null;
const definitions={
  '4.1':{mode:'switch',title:'同样的条件，为何走向不同状态',question:'改变初值（initial condition），观察轨迹（trajectory）落向哪一侧；再改变偏置，检验吸引域（basin of attraction）边界是否仍在零点。',explanation:'这个无量纲（dimensionless）开关模型（model）在偏置 b=0 时有三个平衡（equilibrium）。其中两个局部渐近稳定（local asymptotic stability），构成双稳态（bistability）。右图显示当前状态（state）在流向曲线上的位置；曲线与横轴交点才是平衡。'},
  '4.2':{mode:'oscillator',title:'什么让振荡持续下去',question:'阻尼振荡（damped oscillation）、受迫振荡（forced oscillation）与自维持振荡（self-sustained oscillation）的来源有何不同？改变模型（model），比较时间曲线与相平面（phase plane）。',explanation:'自维持模型在 μ>0 且 ω>0 时有稳定极限环（limit cycle）：非零初值（initial condition）趋向半径 √μ；原点是例外。回到同一轨道不等于回到相同相位（phase）。受迫例的旋转输入（input）持续存在，撤去它后只剩衰减。'},
  '4.3':{mode:'bifurcation',title:'跳变阈值，还是等待得不够久',question:'分岔（bifurcation）描述参数（parameter）变化时长期行为的定性转变。用解析分支作为参照，再检查有限时间扫描怎样偏离它。',explanation:'开关的鞍结分岔（saddle-node bifurcation）发生在 b=±2/(3√3)；正反扫描可出现滞后（hysteresis）。切换到 Hopf 分岔（Hopf bifurcation）后，纵轴改为半径，实线表示稳定极限环（limit cycle）的半径 √μ；原点平衡（equilibrium）的稳定性由 μ 的符号决定。'},
  '4.4':{mode:'logistic',title:'确定性，能保证预测多远',question:'logistic 映射（logistic map）没有随机输入（input），两条邻近初值（initial condition）的轨迹（trajectory）仍可能快速分离。先定容许误差，再找首次超过阈值的步数。',explanation:'用 r=3.2 的周期二（period-two cycle）与 r=3.9 的例子往返比较。距离最多为 1，后期不再增长不能否定早期初值敏感性（sensitivity to initial conditions）。有限窗口中的不规则曲线或分离不能单独证明混沌（chaos）。'}
};
function slider(key,label,min,max,step,value){params[key]=value;const group=el('div',undefined,'slider'),lab=el('label',label),out=el('output',value),input=el('input');Object.assign(input,{id:key,type:'range',min,max,step,value});lab.htmlFor=key;out.id=key+'-value';out.htmlFor=key;input.addEventListener('input',()=>{params[key]=Number(input.value);out.value=input.value;guard(recompute);});group.append(lab,out,input);$('sliders').append(group);}
function controls(){params={};$('sliders').replaceChildren();
  if(mode==='switch'){slider('initial','初始偏差 x₀ / 无量纲',-1.5,1.5,.1,.2);slider('bias','恒定偏置 b / 无量纲',-.6,.6,.05,0);}
  else if(mode==='oscillator'||(mode==='bifurcation'&&$('model').value==='hopf')){slider('mu','增长参数 μ / 无量纲',-.5,1,.05,.5);slider('omega','角频率 ω / 每单位 τ',0,2,.1,1);slider('radius','初始半径 R₀ / 无量纲',0,1.5,.1,.2);}
  else if(mode==='bifurcation'){slider('bias','恒定偏置 b / 无量纲',-.6,.6,.01,0);slider('initial','初始偏差 x₀ / 无量纲',-1.5,1.5,.1,-1.2);}
  else{slider('r','每步增长参数 r',0,4,.05,3.9);slider('initial','第一条轨迹的 x₀',.05,.9,.05,.2);slider('digits','初始差值 δ = 10 的负几次方',3,12,1,6);slider('threshold','允许的绝对误差',.01,.5,.01,.1);}
  if(mode==='oscillator'){$('mu').disabled=$('model').value!=='self';$('omega').disabled=$('model').value!=='self';}
}
function set(values){for(const [k,v] of Object.entries(values)){params[k]=v;$(k).value=v;$(k+'-value').value=v;}guard(recompute);}
function recompute(){
  const p=params;end=mode==='logistic'?80:20;h=mode==='logistic'?1:.01;other=[];branches=[];distance=[];crossing=null;
  const times=Array.from({length:Math.round(end/h)+1},(_,i)=>i*h);
  if(mode==='switch'||(mode==='bifurcation'&&$('model').value==='fold')){
    rows=switchPath(p.initial,p.bias,h,2000).map((x,i)=>[times[i],x]);
    $('formula').textContent='x′ = x − x³ + b';$('alternate').textContent=mode==='switch'?(p.initial>0?'切换到负初值示例':'切换到正初值示例'):(p.bias>0?'切换到负偏置示例':'切换到正偏置示例');
    $('preset-note').textContent=mode==='switch'?'成对示例仅改变 x₀ = −0.2 ↔ +0.2，偏置保留当前值。b≠0 时请重新判断流向。':'成对示例仅改变 b = −0.45 ↔ +0.45。左图从指定初值重新开始；右图扫描沿用上一终态。';
    $('chart-heading').textContent=mode==='switch'?'时间轨迹与流向曲线':'轨迹与平衡分支';
    $('chart-note').textContent=mode==='switch'?'左图显式中点法（explicit midpoint method），固定时间步长（time step）h=.01；右图灰线 f(x)，正值向右、负值向左。负状态表示低于参考活动，不是负浓度（concentration）。':'左图轨迹（trajectory）用显式中点法（explicit midpoint method），时间步长（time step）h=.01。右图实/虚线为稳定/不稳定解析分支（analytical branch）。蓝/玫红点线为正/反扫描：b 每次 .02，每点等待 40 τ，h=.02。扫描终态不是精确平衡；竖线仅标当前 b。';
    if(mode==='bifurcation'){const bs=Array.from({length:61},(_,i)=>-.6+i*.02);branches=[bs.map((b,i)=>[b,scanForward[i]]),bs.slice().reverse().map((b,i)=>[b,scanReverse[i]])];}
  }else if(mode==='oscillator'||mode==='bifurcation'){
    const type=mode==='bifurcation'?'self':$('model').value;
    const evaluate=t=>type==='self'?radial(p.mu,p.omega,[p.radius,0],t):driven(.3,1,type==='forced'?.35:0,1.3,[p.radius,0],t);
    rows=times.map(t=>[t,...evaluate(t)]);
    $('formula').textContent=type==='self'?'R′ = μR − R³；θ′ = ω':'z′ = (−0.3 + i)z + F exp(1.3 iτ)，z=x+iy';
    $('alternate').textContent=type==='self'?(p.mu>0?'切换到衰减示例':'切换到自维持示例'):type==='forced'?'撤去周期输入':'恢复周期输入';
    $('preset-note').textContent=type==='self'?'按钮仅切换 μ = −0.2 ↔ +0.5。ω=0 时半径可收敛，但不绕圈；R₀=0 时永远停在原点。':`阻尼率 α=.3，自然角频率 1，驱动角频率 1.3；输入幅度 F=${type==='forced'?'.35':'0'}。μ 与 ω 滑块仅用于自维持模型。`;
    $('chart-heading').textContent=mode==='bifurcation'?'半径变化与 Hopf 分支':'两个分量与相轨迹';
    $('chart-note').textContent=mode==='bifurcation'?'左图半径由解析解（analytical solution）计算。右图蓝实线 √μ 是 μ>0 的稳定半径，灰实/虚线为稳定/不稳定原点；ω=0 时圆上每一点是平衡，不能称为极限环。':'各时刻直接用解析解（analytical solution）。蓝实线 x、玫红虚线 y；右图两轴等比例。圆形轨迹（trajectory）可能来自外部驱动，需结合模型判断。';
  }else{
    const result=separate(p.r,p.initial,p.initial+10**(-p.digits),p.threshold,80);distance=result.distances;crossing=result.crossing;rows=result.a.map((x,i)=>[i,x]);other=result.b;
    $('formula').textContent='xₙ₊₁ = r xₙ(1 − xₙ)，0 ≤ r ≤ 4，0 ≤ x₀ ≤ 1';$('alternate').textContent=p.r>3.5?'切换到周期示例':'切换到敏感示例';
    $('preset-note').textContent=`按钮仅切换 r=3.2 ↔ 3.9；δ=10⁻${p.digits}。所有计算使用浏览器双精度，未超阈值表示仅在本窗口内未超出。`;
    $('chart-heading').textContent='邻近轨迹与预测阈值';$('chart-note').textContent='每一帧是一轮真实映射，不是微分方程的积分步长。右图距离采用线性坐标；水平虚线是阈值，严格大于才算超出。完整精度对照与有限时间增长率见 Notebook。';
  }
  if(rows.flat().some(x=>!Number.isFinite(x)))throw Error('计算结果无效，请恢复起始条件。');
  $('timeline').max=end;$('timeline').step=h;$('value-label').textContent=mode==='logistic'?'两条轨迹的当前比例':'当前偏差 / 无量纲';
  $('assumptions').textContent=mode==='logistic'?'模型（model）只描述一代到下一代的比例更新。状态（state）x 与参数（parameter）r 无量纲（dimensionless），n 是代次；没有随机扰动。未拟合真实种群数据，未计入观测（observation）误差。播放快慢不改变映射。':mode==='switch'?'参数（parameter）为教学选值。x 是相对参考活动的缩放偏差，τ 是缩放时间；省略噪声、空间和观测（observation）误差，未拟合真实生理数据。播放快慢不改变方程或积分步长。':'模型（model）中的状态（state）和 τ 均为无量纲（dimensionless）；参数（parameter）是教学选择。它们是节律或开关的机制类比，未拟合真实生理数据；省略噪声、空间和观测（observation）误差。播放快慢只改变展示。';
  const legend=mode==='switch'?[[blue,'x / 当前轨迹'],[gray,'变化率 f(x)']]:mode==='bifurcation'&&$('model').value==='hopf'?[[blue,'半径 / 长期半径分支'],[pink,'当前半径'],[gray,'原点分支']]:[[blue,mode==='logistic'?'第一轨迹':mode==='bifurcation'?'状态 / 正向扫描':'x / 相轨迹'],[pink,mode==='logistic'?'邻近轨迹':mode==='bifurcation'?'反向扫描':'y'],[gray,'参照 / 阈值']];
  $('legend').replaceChildren(...legend.map(([c,l])=>{const n=el('span',l);n.style.setProperty('--line-color',c);return n;}));
  const table=el('table'),head=el('tr');head.append(...[mode==='logistic'?'n':'τ','x',mode==='logistic'?'邻近 x':rows[0].length===3?'y':'f(x)'].map(t=>el('th',t)));table.append(head);
  for(let i=0;i<rows.length;i+=(mode==='logistic'?5:100)){const r=rows[i],tr=el('tr');tr.append(...[r[0],r[1],mode==='logistic'?other[i]:r.length===3?r[2]:r[1]-r[1]**3+params.bias].map(v=>el('td',fmt(v))));table.append(tr);}
  $('value-table').replaceChildren(table);$('table-note').textContent=mode==='logistic'?'每 5 轮列一行，完整距离序列见 Notebook。':'每 1 τ 列一行；显示六位小数，计算不截断。';
  if(playback)playback.seek(0);else draw(0);
}
const scanGrid=Array.from({length:61},(_,i)=>-.6+i*.02);
const scanForward=scanBias(scanGrid,-1.5,.02,2000),scanReverse=scanBias(scanGrid.slice().reverse(),1.5,.02,2000);
function draw(time){
  const i=Math.min(rows.length-1,Math.floor(time/h+1e-7)),row=rows[i],p=params,t=row[0],chart=$('chart');
  $('timeline').value=t;$('time-readout').textContent=mode==='logistic'?`n = ${t} / ${end}`:`τ = ${t.toFixed(2)} / ${end}`;$('play-counter').textContent=mode==='logistic'?`${t} 轮`:`${t.toFixed(2)} τ`;
  $('value').textContent=mode==='logistic'?`[${fmt(row[1])}, ${fmt(other[i])}]`:row.length===3?`[${fmt(row[1])}, ${fmt(row[2])}]`:fmt(row[1]);
  $('observation-value').textContent=mode==='logistic'?`当前距离 ${fmt(distance[i])}；首次超阈值：${crossing===null?'80 轮内未超出':`第 ${crossing} 轮`}`:row.length===3?`当前半径 ${fmt(Math.hypot(row[1],row[2]))}`:`当前变化率 ${fmt(row[1]-row[1]**3+p.bias)}`;
  chart.replaceChildren(svg('title',{id:'svg-title'},$('chart-heading').textContent),svg('desc',{id:'svg-desc'},$('chart-note').textContent));
  const label=(x,y,s,anchor='middle')=>svg('text',{x,y,'text-anchor':anchor,fill:theme.ui.text,'font-size':15},s);
  function axes(left,xmin,xmax,ymin,ymax,xlabel,ylabel){const x=v=>left+(v-xmin)/(xmax-xmin)*420,y=v=>320-(v-ymin)/(ymax-ymin)*270;
    for(let k=0;k<5;k++){const xv=xmin+(xmax-xmin)*k/4,yv=ymin+(ymax-ymin)*k/4;chart.append(svg('line',{x1:left,x2:left+420,y1:y(yv),y2:y(yv),stroke:'#e5e9f0'}),label(left-10,y(yv)+5,Number(yv.toPrecision(3)),'end'),label(x(xv),346,Number(xv.toPrecision(3))));}chart.append(label(left+210,382,xlabel),label(left,25,ylabel,'start'));return {x,y};}
  const curve=(points,ax,color,dash=false,width=2.5)=>svg('polyline',{points:points.map(([x,y])=>`${ax.x(x)},${ax.y(y)}`).join(' '),fill:'none',stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':'6 5'}:{})});
  const point=(x,y,ax,color=blue)=>svg('circle',{'data-current':'state',cx:ax.x(x),cy:ax.y(y),r:5.5,fill:color,stroke:'white','stroke-width':1.5});
  const radialBranch=mode==='bifurcation'&&$('model').value==='hopf';
  const range=mode==='logistic'?[0,1]:radialBranch?[0,1.6]:[-1.65,1.65];
  const a=axes(65,0,end,...range,mode==='logistic'?'轮次 n':'时间 τ / 无量纲',radialBranch?'半径 R / 无量纲':mode==='logistic'?'比例 x':'偏差 / 无量纲');
  const first=rows.slice(0,i+1).map(r=>[r[0],radialBranch?Math.hypot(r[1],r[2]):r[1]]);chart.append(curve(first,a,blue),point(t,first.at(-1)[1],a));
  if(mode==='logistic')chart.append(curve(other.slice(0,i+1).map((x,n)=>[n,x]),a,pink,true),point(t,other[i],a,pink));
  else if(row.length===3&&!radialBranch)chart.append(curve(rows.slice(0,i+1).map(r=>[r[0],r[2]]),a,pink,true));
  if(mode==='switch'){
    const b=axes(625,-1.65,1.65,-3.5,3.5,'偏差 x','变化率 f(x)');chart.append(curve([[-1.65,0],[1.65,0]],b,gray,true),curve(Array.from({length:331},(_,j)=>{const x=-1.65+j*.01;return [x,x-x**3+p.bias];}),b,gray),point(row[1],row[1]-row[1]**3+p.bias,b));
  }else if(mode==='logistic'){
    const b=axes(625,0,80,0,1,'轮次 n','两轨迹绝对距离');chart.append(curve(distance.slice(0,i+1).map((d,j)=>[j,d]),b,blue),curve([[0,p.threshold],[80,p.threshold]],b,gray,true),point(t,distance[i],b));
  }else if(mode==='bifurcation'){
    if(radialBranch){const b=axes(625,-.5,1,0,1.6,'增长参数 μ','半径 R');chart.append(curve([[-.5,0],[0,0]],b,gray),curve([[0,0],[1,0]],b,gray,true),curve(Array.from({length:101},(_,j)=>[j/100,Math.sqrt(j/100)]),b,blue),point(p.mu,Math.hypot(row[1],row[2]),b,pink));}
    else{const b=axes(625,-.6,.6,-1.65,1.65,'恒定偏置 b','平衡或扫描终态 x');for(const [lo,hi,dash] of [[-1.22,-1/Math.sqrt(3),false],[-1/Math.sqrt(3),1/Math.sqrt(3),true],[1/Math.sqrt(3),1.22,false]]){const pts=Array.from({length:150},(_,j)=>{const x=lo+(hi-lo)*j/149;return [x**3-x,x];});chart.append(curve(pts,b,gray,dash));}branches.forEach((pts,j)=>chart.append(curve(pts,b,j?pink:blue,true,1.5)));chart.append(curve([[p.bias,-1.6],[p.bias,1.6]],b,green,true,1),point(p.bias,row[1],b));}
  }else{
    // Plot coordinates use equal pixel lengths for x and y.
    const extent=1.65*420/270,b=axes(625,-extent,extent,-1.65,1.65,'偏差 x','偏差 y');chart.append(curve(rows.slice(0,i+1).map(r=>[r[1],r[2]]),b,blue),point(row[1],row[2],b));
  }
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`可视化未能运行：${error.message}。请刷新重试。`;for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;playback?.pause();}
function guard(fn){try{fn();}catch(error){failed(error);}}
async function start(){({current:chapter}=await mountShell('explore'));const d=definitions[chapter?.id];if(!d)throw Error('本章没有此探索页');mode=d.mode;$('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';for(const id of ['title','question','explanation'])$(id).textContent=d[id];
  if(mode==='oscillator'||mode==='bifurcation'){$('model-select').hidden=false;const options=mode==='oscillator'?[['self','自维持振子'],['damped','仅有阻尼'],['forced','阻尼与周期输入']]:[['fold','开关与折叠'],['hopf','径向振子与 Hopf']];for(const [value,label] of options){const o=el('option',label);o.value=value;$('model').append(o);}}
  controls();recompute();playback=createPlayback({duration:end,speed:mode==='logistic'?6:2,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':reason==='ended'?'再次播放':'播放';$('play-status').textContent=reason==='playing'?'正在播放：观察位置、轨迹与状态点同步变化。':reason==='ended'?'已到终点，可重播或改变条件。':'已暂停；改变条件会回到起点。';}});
  $('play').addEventListener('click',()=>playback.running?playback.pause():playback.play());$('replay').addEventListener('click',()=>{playback.seek(0);playback.play();});$('timeline').addEventListener('input',()=>playback.seek(Number($('timeline').value)));
  $('model').addEventListener('change',()=>guard(()=>{controls();recompute();}));
  $('alternate').addEventListener('click',()=>{if(mode==='switch')set({initial:alternateInitial(params.initial)});else if(mode==='logistic')set({r:alternateR(params.r)});else if(mode==='bifurcation'&&$('model').value==='fold')set({bias:alternateBias(params.bias)});else if(mode==='oscillator'&&$('model').value!=='self'){$('model').value=$('model').value==='forced'?'damped':'forced';guard(recompute);}else set({mu:alternateMu(params.mu)});});
  $('reset').addEventListener('click',()=>guard(()=>{if(mode==='oscillator')$('model').value='self';if(mode==='bifurcation')$('model').value='fold';controls();recompute();}));document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause();});
  for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
  playback.seek(0);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';
}
start().catch(failed);
