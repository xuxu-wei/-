import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {piRun,poles,frequency,actuator,sensor,bellman,mpc,paired,alternate} from './model.mjs';

const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const blue=theme.data['1'],pink=theme.data['2'],green=theme.data['3'],gray=theme.data.reference;
const fmt=x=>x===null?'不可行':Number(x.toPrecision(4)).toString();
const node=(tag,attrs={},value)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;return n;};
let chapter,mode,p={},playback;

const definitions={
 '10.1':{title:'请求输入越大，实际执行也会变大吗？',question:'先预测：相同负扰动下，缩小执行上限后，PI（proportional-integral control）的状态还能接近目标吗？',explanation:'误差驱动比例和积分请求；执行器只提供裁剪后的真实输入。播放显示存量随时间变化，并同时画出请求与执行，观察饱和时两者分离。',formula:'xₙ₊₁=xₙ+0.1(−0.4xₙ+uₙ−0.25)；uₙ=clip(kₚeₙ+kᵢIₙ₊₁,±上限)',heading:'状态与真实执行输入',label:'当前温度偏差 / U',assumptions:'目标1 U，初始0 U，固定扰动−0.25 U/T；比例/积分增益是教学参数。条件积分在饱和且误差继续推动同方向限幅时冻结。人工系统不代表实际医疗设备。',note:'左图蓝线是PI状态，灰线为目标；右图玫红虚线是请求，蓝线为真实执行。图形播放代表时间步，不替代Notebook中的稳定性检查。',controls:[['kp','比例增益 kₚ',.1,1.5,.05,.7],['ki','积分增益 kᵢ',0,.8,.05,.3],['limit','执行上限 / (U/T)',.2,1.5,.1,1.5]]},
 '10.2':{title:'增益和延迟怎样改变稳定证据？',question:'先预测：增加延迟但保持增益时，Bode 相位会如何移动？低阶无延迟模型的闭环极点还能代表含延迟系统吗？',explanation:'左图跟踪无延迟模型的闭环极点（closed-loop poles）；右图画开环幅相中的相位。纯延迟只改变相位；延迟场景需要另行核验，不能把左图直接当作含延迟闭环的极点。',formula:'2s²+3s+(1+K)=0；∠L(jω)=−atanω−atan(2ω)−ωd',heading:'低阶极点与延迟相位',label:'当前增益 K',assumptions:'G(s)=1/[(s+1)(2s+1)]、单位负反馈。左图只计算d=0的根；右图K>0并采用展开相位，频率0.1—5 /T。Nyquist绕数需完整轮廓、开环极点计数及明确方向，不能由此截断图直接得出。',note:'左图蓝/玫红为复共轭分支；右图蓝线无延迟，玫红线为指定延迟。切换延迟时左图保持不变，正是因为它只表示无延迟模型。',controls:[['gain','目标增益 K',.2,8,.2,4],['delay','纯延迟 d / T',0,1,.05,0]]},
 '10.3':{title:'把执行器接在哪里，能影响哪些状态？',question:'先预测：双积分对象只把输入加在第一状态，而第二状态没有自身输入时，第二状态会变化吗？',explanation:'同一A、同一脉冲和初态，只改变输入列B的位置。能控矩阵（controllability matrix）[B,AB]揭示输入能直接和经动态传播影响的方向。',formula:'A=[[0,1],[0,0]]；B₁=[0,1]ᵀ 的 det[B,AB]=−1；B₂=[1,0]ᵀ 时 det=0',heading:'相同脉冲，不同执行器位置',label:'能控矩阵行列式',assumptions:'连续双积分教学模型；0—1 T施加1单位输入，之后输入为0；显式小步长0.02 T。此处无执行上限，只讨论结构；能控不保证限幅下任意短时间可达。',note:'左图第一状态，右图第二状态。切换按钮只改变B位置，播放可比较变化顺序。图中坐标表示状态数值，不把绘图位置当作物理空间。',controls:[['second','执行器位置：0第一 / 1第二',0,1,1,1]]},
 '10.4':{title:'换一只传感器，会失去哪部分状态信息？',question:'先预测：两条轨迹的第二状态相同、第一状态不同。只测第二状态时，读数能区分这两条轨迹吗？',explanation:'能观矩阵（observability matrix）[C;CA]判断已知线性模型中初态信息是否进入读数。播放同一对初态，只切换C；隐藏状态仅用于这张教学核验图。',formula:'A=[[0.9,0.1],[0,0.8]]；C₁=[1,0] 的 det[C;CA]=0.1；C₂=[0,1] 时 det=0',heading:'两条初态与传感器读数',label:'当前读数差 / U',assumptions:'两个初态分别[0,1]与[2,1] U，输入0；同一已知无噪线性模型。图示能观性，不把满秩解释成有噪读数下的零误差保证；输出反馈还需观测器与执行器。',note:'左图两条读数，右图两者之差。只测第二状态时两条读数重合；读数差为零，不代表两个隐藏状态本身相同。',controls:[['first','传感器位置：0第二 / 1第一',0,1,1,1]]},
 '10.5':{title:'终端代价会怎样改变现在的动作？',question:'先预测：只增大终端状态偏差的惩罚，当前最优输入会更接近0还是更积极地移动状态？',explanation:'一步Bellman递推（Bellman recursion）把当前和终端代价一起最小化。左图是同一状态下的候选输入成本；右图展示最优输入随终端权重变化。',formula:'x⁺=x+u；J=x²+ρu²+qf(x+u)²；u*=−qf x/(ρ+qf)',heading:'当前输入与未来价值',label:'当前最优输入',assumptions:'x=2 U，状态权重1，输入权重ρ>0，终端权重qf≥0，输入无约束；只讨论这个有限一步模型。若添加执行上限，原无约束最优解不自动保持最优。',note:'左图蓝线为当前代价曲线，玫红点是最小值；右图显示不同终端权重的解析最优输入。播放逐步改变qf，不表示真实系统时间。',controls:[['inputWeight','输入权重 ρ',.2,3,.1,1],['terminal','目标终端权重 qf',.2,5,.2,4]]},
 '10.6':{title:'预测可行，就意味着下一步永远可行吗？',question:'先预测：把状态上界从2 U缩到0.5 U，哪些两步行动序列会因硬约束被排除？',explanation:'这是离散行动集合上的小型模型预测控制（model predictive control，MPC）。播放依次检查九条候选，只有每个后继状态都在硬界内的序列才可能成为最优解。',formula:'x⁺=x+u；u∈{−1,0,1}；J=Σ[(x−目标)²+0.1u²]+2(x₂−目标)²',heading:'候选成本与可行轨迹',label:'当前最优首步',assumptions:'初态0 U、两步预测、状态下界−1 U，输入为离散集合。成本并列选字典序较小序列。此图精确解的是有限离散问题，不代表一般连续输入MPC；若无可行候选须报告不可行。',note:'左图按枚举顺序显示可行候选成本；红叉标示不可行，绝非0成本。右图只画已经找到的最佳候选预测轨迹；播放不代表实际执行了整段计划。',controls:[['target','目标状态 / U',0,2,.1,2],['upper','状态上界 / U',.5,2,.1,2]]},
 '10.7':{title:'领先的平均数会遮住失败吗？',question:'先预测：方法A在少数场景失败时，如果只报告成功场景的平均差，会遗漏什么重要信息？',explanation:'两法面对同一批配对场景，差值只在双方成功时定义；失败仍计入总场景。播放逐步纳入场景，观察运行平均差和失败对数如何变化。',formula:'Dᵢ=E_Aᵢ−E_Bᵢ（双方成功时）；同时报告成功配对 m / 总场景 n',heading:'配对差与失败统计',label:'成功配对平均差',assumptions:'40个固定教学场景，数值由公开确定性公式生成；严重失配开关在每第11个场景中使A失败。数值只演示统计口径，不是PID、LQR或MPC真实优劣的模拟证据；独立随机实验留在Notebook。',note:'左图蓝点为双方成功的配对差，红叉为失败；右图为成功配对运行均值。若忽略失败，只看均值可能改变比较解释。',controls:[['severity','模型失配：0常规 / 1严重',0,1,1,0]]}
};

function controls(){p={};$('sliders').replaceChildren();for(const[key,label,min,max,step,value]of definitions[mode].controls){p[key]=value;const row=el('div',null,'slider'),labelNode=el('label',label),input=el('input'),out=el('output',fmt(value));input.type='range';input.id='parameter-'+key;input.min=min;input.max=max;input.step=step;input.value=value;labelNode.htmlFor=input.id;out.id='parameter-value-'+key;input.addEventListener('input',()=>guard(()=>{p[key]=Number(input.value);out.textContent=fmt(p[key]);recompute();}));row.append(labelNode,out,input);$('sliders').append(row);}}
function set(values){Object.assign(p,values);for(const[key,value]of Object.entries(values)){$('parameter-'+key).value=value;$('parameter-value-'+key).textContent=fmt(value);}recompute();}
function recompute(){
 const labels={'10.1':p.limit<=.5?'恢复较宽上限':'切换为严格上限','10.2':p.delay>.1?'恢复无延迟':'切换为较长延迟','10.3':p.second?'改接第一状态':'改接第二状态','10.4':p.first?'改测第二状态':'改测第一状态','10.5':p.terminal>=3?'切换为较低终端权重':'恢复较高终端权重','10.6':p.upper<1?'恢复宽上界':'切换为窄上界','10.7':p.severity>.5?'恢复常规场景':'切换为严重失配'};
 $('alternate').textContent=labels[mode];playback?.pause();playback?playback.seek(100):draw(100);
}
function axes(chart,{xmin,xmax,ymin,ymax,xlabel,ylabel}){
 const x=v=>66+444*(v-xmin)/(xmax-xmin),y=v=>310-264*(v-ymin)/(ymax-ymin);
 for(let j=0;j<=4;j++){const val=ymin+(ymax-ymin)*j/4;chart.append(node('line',{x1:66,y1:y(val),x2:510,y2:y(val),stroke:gray,opacity:.15}),node('text',{x:57,y:y(val)+5,'text-anchor':'end','font-size':13,fill:gray},fmt(val)));}
 for(let j=0;j<=4;j++){const val=xmin+(xmax-xmin)*j/4;chart.append(node('text',{x:x(val),y:337,'text-anchor':'middle','font-size':13,fill:gray},fmt(val)));}
 chart.append(node('text',{x:288,y:376,'text-anchor':'middle','font-size':15,fill:gray},xlabel),node('text',{x:66,y:25,'font-size':15,fill:gray},ylabel));return{x,y,xmin,xmax,ymin,ymax};
}
function curve(chart,points,a,color,dashed=false,width=2.5){let path='',open=false;for(const [x,y]of points){if(!Number.isFinite(x+y)||x<a.xmin||x>a.xmax||y<a.ymin||y>a.ymax){open=false;continue;}path+=`${open?'L':'M'}${a.x(x)},${a.y(y)} `;open=true;}chart.append(node('path',{d:path,fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':dashed?'7 5':'none','stroke-linejoin':'round'}));}
function dot(chart,point,a,color,r=5){if(!point||!Number.isFinite(point[0]+point[1]))return;chart.append(node('circle',{cx:a.x(point[0]),cy:a.y(point[1]),r,fill:color,class:'probe',stroke:'white','stroke-width':1.5}));}
function table(rows){const tab=el('table'),body=el('tbody');for(const[key,value]of rows){const row=el('tr');row.append(el('th',key),el('td',Array.isArray(value)?value.map(v=>v===null?'不可行':typeof v==='number'?fmt(v):v).join('，'):typeof value==='number'?fmt(value):String(value)));body.append(row);}tab.append(body);$('value-table').replaceChildren(tab);}
function legend(items){$('legend').replaceChildren();for(const[text,color]of items){const item=el('span'),swatch=el('i');swatch.style.background=color;item.append(swatch,document.createTextNode(text));$('legend').append(item);}}

function draw(progress){
 const frac=progress/100,left=$('chart'),right=$('detail-chart'),def=definitions[mode];$('timeline').value=progress;$('play-counter').textContent=`进度 ${progress.toFixed(1)}%`;
 for(const[chart,prefix]of [[left,'svg'],[right,'detail']])chart.replaceChildren(node('title',{id:prefix+'-title'},def.heading),node('desc',{id:prefix+'-desc'},def.note));
 if(mode==='10.1'){
  const data=piRun(p.kp,p.ki,p.limit),n=Math.floor(frac*120),a=axes(left,{xmin:0,xmax:12,ymin:-.7,ymax:1.4,xlabel:'Time / T',ylabel:'State / U'}),b=axes(right,{xmin:0,xmax:12,ymin:-2,ymax:2,xlabel:'Time / T',ylabel:'Input / (U/T)'});
  curve(left,data.states.slice(0,n+1).map((v,i)=>[i*.1,v]),a,blue);curve(left,[[0,1],[12,1]],a,gray,true);dot(left,[n*.1,data.states[n]],a,blue);
  curve(right,data.requested.slice(0,n).map((v,i)=>[i*.1,v]),b,pink,true);curve(right,data.actual.slice(0,n).map((v,i)=>[i*.1,v]),b,blue);if(n)dot(right,[(n-1)*.1,data.actual[n-1]],b,blue);
  $('value').textContent=fmt(data.states[n]);$('time-readout').textContent=`时刻 ${fmt(n*.1)} T`;$('observation-value').textContent=n?`请求 ${fmt(data.requested[n-1])}，实际 ${fmt(data.actual[n-1])} U/T。`:'控制尚未执行。';legend([['状态与实际输入',blue],['请求输入',pink],['目标',gray]]);table([['当前状态 / U',data.states[n]],['当前请求 / (U/T)',n?data.requested[n-1]:'未开始'],['当前实际输入 / (U/T)',n?data.actual[n-1]:'未开始'],['执行上限 / (U/T)',p.limit]]);
 }
 if(mode==='10.2'){
  const gain=.01+(p.gain-.01)*frac,current=poles(gain),a=axes(left,{xmin:-2.2,xmax:.2,ymin:-3.2,ymax:3.2,xlabel:'Re(s) / (1/T)',ylabel:'Im(s) / (1/T)'}),b=axes(right,{xmin:.1,xmax:5,ymin:-550,ymax:0,xlabel:'ω / (1/T)',ylabel:'Unwrapped phase / degree'});
  for(let j=0;j<2;j++){const path=Array.from({length:101},(_,i)=>poles(.01+(gain-.01)*i/100)[j]);curve(left,path,a,j?pink:blue);dot(left,current[j],a,j?pink:blue);}
  const frequencies=Array.from({length:160},(_,i)=>.1+4.9*i/159);curve(right,frequencies.map(w=>[w,frequency(gain,2,w,0).phase]),b,blue);curve(right,frequencies.map(w=>[w,frequency(gain,2,w,p.delay).phase]),b,pink,true);
  $('value').textContent=fmt(gain);$('time-readout').textContent=`增益展开 ${progress.toFixed(0)}%`;$('observation-value').textContent=`ω=1/T时幅值 ${fmt(frequency(gain,2,1,p.delay).magnitude)}；延迟相位多落后 ${fmt(180*p.delay/Math.PI)}°。`;legend([['无延迟极点/相位',blue],['共轭分支/指定延迟',pink]]);table([['当前增益 K',gain],['无延迟极点实部',current.map(v=>v[0])],['无延迟极点虚部',current.map(v=>v[1])],['延迟 / T',p.delay]]);
 }
 if(mode==='10.3'){
  const data=actuator(Boolean(p.second)),n=Math.floor(frac*150),a=axes(left,{xmin:0,xmax:3,ymin:0,ymax:2.3,xlabel:'Time / T',ylabel:'First state / U'}),b=axes(right,{xmin:0,xmax:3,ymin:0,ymax:1.1,xlabel:'Time / T',ylabel:'Second state / U'});
  for(let j=0;j<2;j++){const chart=j?right:left,axis=j?b:a,color=j?pink:blue;curve(chart,data.states.slice(0,n+1).map((v,i)=>[i*.02,v[j]]),axis,color);dot(chart,[n*.02,data.states[n][j]],axis,color);}
  $('value').textContent=fmt(data.determinant);$('time-readout').textContent=`时刻 ${fmt(n*.02)} T`;$('observation-value').textContent=`第一状态 ${fmt(data.states[n][0])} U；第二状态 ${fmt(data.states[n][1])} U。`;legend([['第一状态',blue],['第二状态',pink]]);table([['输入位置',p.second?'第二状态':'第一状态'],['det[B,AB]',data.determinant],['当前状态',data.states[n]]]);
 }
 if(mode==='10.4'){
  const data=sensor(Boolean(p.first)),n=Math.floor(frac*59),a=axes(left,{xmin:0,xmax:59,ymin:0,ymax:2.2,xlabel:'Step',ylabel:'Reading / U'}),b=axes(right,{xmin:0,xmax:59,ymin:-.1,ymax:2.1,xlabel:'Step',ylabel:'Difference / U'});
  for(let j=0;j<2;j++){const color=j?pink:blue,points=data.paths[j].slice(0,n+1).map((v,i)=>[i,v]);curve(left,points,a,color);dot(left,points.at(-1),a,color);}
  const diff=data.paths[1].slice(0,n+1).map((v,i)=>[i,v-data.paths[0][i]]);curve(right,diff,b,green);dot(right,diff.at(-1),b,green);
  $('value').textContent=fmt(diff.at(-1)[1]);$('time-readout').textContent=`第 ${n} 步`;$('observation-value').textContent=`det[C;CA]=${fmt(data.determinant)}；${p.first?'读数可以区分两条初态。':'两条读数重合，但隐藏第一状态不同。'}`;legend([['初态一读数',blue],['初态二读数',pink],['读数差',green]]);table([['传感器',p.first?'第一状态':'第二状态'],['能观矩阵行列式',data.determinant],['当前两读数',data.paths.map(path=>path[n])]]);
 }
 if(mode==='10.5'){
  const start=p.terminal<=.2?4:.2,qf=start+(p.terminal-start)*frac,r=bellman(p.inputWeight,qf),a=axes(left,{xmin:-3,xmax:1,ymin:0,ymax:35,xlabel:'Candidate action',ylabel:'Total cost'}),b=axes(right,{xmin:.2,xmax:5,ymin:-2.1,ymax:0,xlabel:'Terminal weight',ylabel:'Optimal action'});
  curve(left,Array.from({length:151},(_,i)=>{const u=-3+4*i/150;return[u,4+p.inputWeight*u*u+qf*(2+u)**2];}),a,blue);dot(left,[r.action,r.cost],a,pink,7);
  curve(right,Array.from({length:151},(_,i)=>{const q=.2+4.8*i/150;return[q,bellman(p.inputWeight,q).action];}),b,green);dot(right,[qf,r.action],b,pink,7);
  $('value').textContent=fmt(r.action);$('time-readout').textContent=`当前终端权重 ${fmt(qf)}`;$('observation-value').textContent=`最低总代价 ${fmt(r.cost)}；价值系数 ${fmt(r.valueWeight)}。`;legend([['候选代价',blue],['最优输入曲线',green],['当前最优点',pink]]);table([['当前终端权重',qf],['最优输入',r.action],['最小代价',r.cost],['价值系数',r.valueWeight]]);
 }
 if(mode==='10.6'){
  const data=mpc(p.target,p.upper),n=Math.floor(frac*9),seen=data.candidates.slice(0,n),best=seen.filter(row=>row.cost!==null).sort((a,b)=>a.cost-b.cost||a.first-b.first||a.second-b.second)[0]||null,a=axes(left,{xmin:0,xmax:9,ymin:0,ymax:22,xlabel:'Candidate index',ylabel:'Feasible cost'}),b=axes(right,{xmin:0,xmax:2,ymin:-1.1,ymax:2.2,xlabel:'Prediction step',ylabel:'Predicted state / U'});
  for(let i=0;i<seen.length;i++){const row=seen[i];if(row.cost===null){left.append(node('text',{x:a.x(i+.5),y:a.y(.8),'text-anchor':'middle',fill:pink,'font-size':22},'×'));}else dot(left,[i+.5,row.cost],a,blue,6);}
  if(best){curve(right,best.states.map((v,i)=>[i,v]),b,green);dot(right,[best.states.length-1,best.states.at(-1)],b,green);}
  curve(right,[[0,p.upper],[2,p.upper]],b,pink,true);$('value').textContent=best?fmt(best.first):n?'暂无可行候选':'待枚举';$('time-readout').textContent=`已检查 ${n}/9 条`;$('observation-value').textContent=`${seen.filter(row=>row.cost!==null).length} 条已见候选可行；完整最优首步 ${data.best?fmt(data.best.first):'不可行'}。`;legend([['可行成本',blue],['已见最佳轨迹',green],['硬上界/不可行',pink]]);table([['已检查 / 全部',`${n} / 9`],['已见可行条数',seen.filter(row=>row.cost!==null).length],['当前最佳序列',best?[best.first,best.second]:'尚无'],['当前最佳成本',best?best.cost:'尚无']]);
 }
 if(mode==='10.7'){
  const rows=paired(p.severity),n=Math.floor(frac*rows.length),seen=rows.slice(0,n),successful=seen.filter(row=>row.difference!==null),failed=seen.length-successful.length,a=axes(left,{xmin:0,xmax:40,ymin:-.09,ymax:.09,xlabel:'Paired scenario',ylabel:'A−B metric'}),b=axes(right,{xmin:0,xmax:40,ymin:-.09,ymax:.09,xlabel:'Paired scenario',ylabel:'Running mean'});
  for(let i=0;i<seen.length;i++){const row=seen[i];if(row.difference===null)left.append(node('text',{x:a.x(i+1),y:a.y(-.075),'text-anchor':'middle',fill:pink,'font-size':17},'×'));else dot(left,[i+1,row.difference],a,blue,4);}
  let sum=0,count=0;const means=seen.map((row,i)=>{if(row.difference!==null){sum+=row.difference;count++;}return[i+1,count?sum/count:null];}).filter(row=>row[1]!==null);curve(right,means,b,green);dot(right,means.at(-1),b,green);
  const mean=count?sum/count:null;$('value').textContent=mean===null?'无可比值':fmt(mean);$('time-readout').textContent=`纳入 ${n}/40 个场景`;$('observation-value').textContent=`成功配对 ${count}；失败对 ${failed}；失败从未被记为0成本。`;legend([['成功配对差',blue],['失败对',pink],['运行均值',green]]);table([['总场景',n],['成功配对',count],['失败对',failed],['成功配对平均差',mean]]);
 }
}

function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`探索未能运行：${error.message}。请刷新重试。`;for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;playback?.pause();}
function guard(fn){try{fn();}catch(error){failed(error);}}
async function start(){
 ({current:chapter}=await mountShell('explore'));mode=chapter?.id;const def=definitions[mode];if(!def)throw Error('本章没有此探索页');$('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';for(const id of ['title','question','explanation','formula','assumptions'])$(id).textContent=def[id];$('chart-heading').textContent=def.heading;$('value-label').textContent=def.label;$('chart-note').textContent=def.note;$('preset-note').textContent='先预测再播放；每个对照按钮可切换回起始条件。';controls();recompute();
 playback=createPlayback({duration:100,speed:10,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':'播放';$('play-status').textContent=reason==='playing'?'正在播放，观察图形与读数同步变化。':reason==='ended'?'已展示指定条件；点击播放可从起点观察。':reason==='hidden'?'切离页面后已暂停。':'已暂停，可拖动观察位置。';}});
 $('play').addEventListener('click',()=>guard(()=>playback.running?playback.pause():playback.play()));$('replay').addEventListener('click',()=>guard(()=>{playback.seek(0);playback.play();}));$('timeline').addEventListener('input',()=>guard(()=>playback.seek(Number($('timeline').value))));
 $('alternate').addEventListener('click',()=>guard(()=>{set(alternate(mode,p));}));$('reset').addEventListener('click',()=>guard(()=>{controls();recompute();}));document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause('hidden');});
 for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
 playback.seek(100);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';
}
start().catch(failed);
