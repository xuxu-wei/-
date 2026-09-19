import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {normal,conjugate,readings,chains,meanField,emTrace,observations,prediction,alternate} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const blue=theme.data['1'],pink=theme.data['2'],green=theme.data['3'],gray=theme.data.reference;
const fmt=x=>x===null?'无可行解':Number(x.toPrecision(4)).toString();
const node=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let chapter,mode,p={},data,playback;
const definitions={
 '9.1':{title:'同样的读数，噪声更大时该相信多少？',question:'先预测：保持观测（observation）不变，只提高每次测量的噪声方差（variance），后验（posterior）会更接近先验（prior）还是样本平均？',explanation:'一个共同偏差的高斯先验与独立高斯观测形成共轭更新。精度相加，而不是把两个方差直接相加。未来读数还要加回一次观测的随机性。',formula:'v = 1 / (1/4 + n/r)；m = v Σy/r；预测方差 = v+r',heading:'先验、似然形状与后验宽度',label:'当前后验方差 / U²',assumptions:'先验N(0,4)，前12个固定读数见数值表；无过程噪声（process noise）。似然（likelihood）曲线为便于比较做了归一化，不表示它原本就是参数（parameter）概率（probability）。播放逐个纳入读数，不是物理时间。',note:'左图蓝线后验、灰线先验、玫红虚线为归一化似然；右图比较参数方差与未来读数方差。零读数时没有似然曲线。',controls:[['count','观测个数 n',1,12,1,6],['noise','观测方差 r / U²',.25,6,.25,2]]},
 '9.2':{title:'接受率看起来不错，链就探索充分了吗？',question:'先预测：两个模态（mode）相距更远时，从两侧出发的短链能否给出同一个正半轴质量？',explanation:'对称随机游走（random walk）的接受率取决于目标密度之比。接受率、跨模态探索和样本相关性是不同问题；600步仅展示有限预算的结果，不证明收敛。',formula:'π(x)=½N(−d,1)+½N(d,1)；α=min(1,π(x′)/π(x))',heading:'两条链与正半轴占比',label:'两链最终正半轴占比',assumptions:'无量纲（dimensionless）双高斯目标，初值（initial condition）−d与d；种子9201和9202、各600步，不删预热、不稀疏抽取。页面使用公开LCG随机数，完整Notebook另用NumPy随机数；固定输入（input）的接受规则一致。',note:'蓝色和玫红分别代表两条链。右图占比含初始点，目标精确正半轴概率（probability）为0.5；两个占比相近也不能独自证明充分混合。',controls:[['separation','模态位置 ±d',0,5,.25,4],['step','提议标准差',.1,3,.1,.6]]},
 '9.3':{title:'下界已经不再变化，后验就准确了吗？',question:'先预测：目标的相关性增强后，独立高斯因子能否同时恢复两个边缘方差（variance）？',explanation:'均值场（mean-field approximation）的坐标更新会逼近最优均值，但独立因子不能表达相关结构。这里的ELBO差等于可精确计算的KL；横线表示近似族造成的最低差距。',formula:'Σ=[[1,ρ],[ρ,1]]；m₁←ρm₂；m₂←ρm₁；vᵢ=1−ρ²',heading:'相关轮廓与独立因子轮廓',label:'当前 KL / 1',assumptions:'已知二维高斯目标，均值0，初始因子均值[2,−2]；20轮顺序更新。左右图不是两种不同观测（observation），而是同一后验（posterior）的精确表示与近似。',note:'左图椭圆与圆分别为精确目标与独立近似的二次距离轮廓，中心随更新移动。右图是log₁₀(1+KL)，横线对应不可由优化消除的差距；不把二维轮廓标成一维95%区间。',controls:[['rho','目标相关系数 ρ',0,.95,.05,.8]]},
 '9.4':{title:'同样的数据，两个分量为什么分不开？',question:'先预测：两个均值从完全相同的位置出发，EM能否自己破坏对称？',explanation:'E步用旧参数（parameter）计算责任度（responsibility），M步用软权重更新均值和混合权重。精确步骤的观测（observation）似然（likelihood）不下降，但对称初始化可能停留在未分离的解。',formula:'rᵢⱼ ∝ wⱼ N(yᵢ|μⱼ,v)；wⱼ′=Σrᵢⱼ/n；μⱼ′=Σrᵢⱼyᵢ/Σrᵢⱼ',heading:'责任度和观测似然一起变化',label:'当前观测 log 似然',assumptions:'8个固定读数，两个分量共享固定正方差（variance），只更新权重与均值；20步，零责任质量时保留该均值。本页不进行未知方差估计，不能据此排除自由方差时的塌缩。',note:'左图每个点的高度表示属于第一个分量的责任度，第二个分量为1减该值；右图标出每次完整更新后的似然。切换初始化时不会改数据。',controls:[['variance','固定分量方差 / U²',.1,2,.05,.25],['symmetric','初始化：0分离 / 1相同',0,1,1,0]]},
 '9.5':{title:'参数区间够窄，未来读数也会这么集中吗？',question:'先预测：保持参数（parameter）后验（posterior）不变，未来噪声方差（variance）变为假设值的4倍，原预测区间（prediction interval）会覆盖多少概率（probability）？',explanation:'未来读数方差等于参数方差加观测（observation）方差。下方区间始终按原模型（model）封存；实际噪声改变后，只更换核验分布（distribution），不偷偷加宽原来的区间。',formula:'预测N(1.6,v+r)；核验N(1.6,v+c r)；r=1 U²',heading:'参数分布、读数分布与模型覆盖',label:'封存区间的核验覆盖',assumptions:'共轭偏差模型的公开后验N(1.6,v)，未来噪声独立；这是在该后验下平均参数的解析覆盖，不是一次模拟的经验比例，也不是固定未知参数的覆盖保证。',note:'左图参数后验、模型预测与核验密度；右图是封存95%预测区间在不同噪声倍率下的实际概率。播放从1倍走向指定条件；目标为1倍时从.25倍对照展开；参数区间和预测区间对象不同。',controls:[['variance','参数后验方差 v / U²',.05,2,.05,.8],['multiplier','实际噪声方差倍率 c',.25,4,.25,1]]}
};
function controls(){p={};$('sliders').replaceChildren();for(const[key,label,min,max,step,value]of definitions[mode].controls){p[key]=value;const row=el('div',null,'slider'),labelNode=el('label',label),input=el('input'),out=el('output',fmt(value));input.type='range';input.id='parameter-'+key;input.min=min;input.max=max;input.step=step;input.value=value;labelNode.htmlFor=input.id;out.id='parameter-value-'+key;input.addEventListener('input',()=>guard(()=>{p[key]=Number(input.value);out.textContent=fmt(p[key]);recompute();}));row.append(labelNode,out,input);$('sliders').append(row);}}
function set(values){Object.assign(p,values);for(const[key,value]of Object.entries(values)){$('parameter-'+key).value=value;$('parameter-value-'+key).textContent=fmt(value);}recompute();}
function recompute(){
 if(mode==='9.1')$('alternate').textContent=p.noise>=4?'恢复较小噪声':'切换为较大噪声';
 if(mode==='9.2'){data=chains(p.separation,p.step);$('alternate').textContent=p.separation>=3?'切换为单峰目标':'切换为分离双峰';}
 if(mode==='9.3'){data=meanField(p.rho);$('alternate').textContent=p.rho>=.5?'切换为独立目标':'切换为相关目标';}
 if(mode==='9.4'){data=emTrace(Boolean(p.symmetric),p.variance);$('alternate').textContent=p.symmetric?'切换为分离初始化':'切换为相同初始化';}
 if(mode==='9.5')$('alternate').textContent=p.multiplier>1?'恢复正确噪声假设':'切换为噪声失配';
 playback?.pause();playback?playback.seek(100):draw(100);
}
function axes(chart,{xmin,xmax,ymin,ymax,xlabel,ylabel}){
 const x=v=>66+444*(v-xmin)/(xmax-xmin),y=v=>310-264*(v-ymin)/(ymax-ymin);
 for(let j=0;j<=4;j++){const val=ymin+(ymax-ymin)*j/4;chart.append(node('line',{x1:66,y1:y(val),x2:510,y2:y(val),stroke:gray,opacity:.15}),node('text',{x:57,y:y(val)+5,'text-anchor':'end','font-size':13,fill:gray},fmt(val)));}
 for(let j=0;j<=4;j++){const val=xmin+(xmax-xmin)*j/4;chart.append(node('text',{x:x(val),y:337,'text-anchor':'middle','font-size':13,fill:gray},fmt(val)));}
 chart.append(node('text',{x:288,y:376,'text-anchor':'middle','font-size':15,fill:gray},xlabel),node('text',{x:66,y:25,'font-size':15,fill:gray},ylabel));return{x,y,xmin,xmax,ymin,ymax};
}
function curve(chart,points,a,color,dashed=false,width=2.5){
 let path='',open=false;for(const [x,y]of points){if(!Number.isFinite(x+y)||x<a.xmin||x>a.xmax||y<a.ymin||y>a.ymax){open=false;continue;}path+=`${open?'L':'M'}${a.x(x)},${a.y(y)} `;open=true;}
 chart.append(node('path',{d:path,fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':dashed?'7 5':'none','stroke-linejoin':'round'}));
}
function dot(chart,point,a,color,r=5){chart.append(node('circle',{cx:a.x(point[0]),cy:a.y(point[1]),r,fill:color,class:'probe',stroke:'white','stroke-width':1.5}));}
function table(rows){const table=el('table'),body=el('tbody');for(const[key,value]of rows){const row=el('tr');row.append(el('th',key),el('td',Array.isArray(value)?value.map(fmt).join('，'):typeof value==='number'?fmt(value):value));body.append(row);}table.append(body);$('value-table').replaceChildren(table);}
function legend(items){$('legend').replaceChildren();for(const[text,color]of items){const item=el('span'),swatch=el('i');swatch.style.background=color;item.append(swatch,document.createTextNode(text));$('legend').append(item);}}
function draw(progress){
 const frac=progress/100,left=$('chart'),right=$('detail-chart'),def=definitions[mode];$('timeline').value=progress;$('play-counter').textContent=`进度 ${progress.toFixed(1)}%`;
 for(const[chart,prefix]of [[left,'svg'],[right,'detail']])chart.replaceChildren(node('title',{id:prefix+'-title'},def.heading),node('desc',{id:prefix+'-desc'},def.note));
 if(mode==='9.1'){
  const n=Math.floor(p.count*frac),r=conjugate(n,p.noise),peak=1.1/Math.sqrt(2*Math.PI*Math.min(r.variance,p.noise/Math.max(n,1))),a=axes(left,{xmin:-6,xmax:7,ymin:0,ymax:Math.max(.4,peak),xlabel:'共同偏差 θ / U',ylabel:'密度 / (1/U)'}),b=axes(right,{xmin:0,xmax:12,ymin:0,ymax:10,xlabel:'读数个数 n',ylabel:'方差 / U²'});
  const xs=Array.from({length:301},(_,i)=>-6+13*i/300);curve(left,xs.map(x=>[x,normal(x,0,4)]),a,gray);curve(left,xs.map(x=>[x,normal(x,r.mean,r.variance)]),a,blue);
  if(n)curve(left,xs.map(x=>[x,normal(x,readings.slice(0,n).reduce((s,y)=>s+y,0)/n,p.noise/n)]),a,pink,true);
  for(const[key,color]of [['variance',blue],['predictive',green]]){const pts=Array.from({length:n+1},(_,i)=>[i,conjugate(i,p.noise)[key]]);curve(right,pts,b,color);dot(right,pts.at(-1),b,color);}
  $('value').textContent=fmt(r.variance);$('time-readout').textContent=`已纳入 ${n}/${p.count} 个读数`;$('observation-value').textContent=`后验均值 ${fmt(r.mean)} U；未来读数方差 ${fmt(r.predictive)} U²。`;
  legend([['先验',gray],['后验／参数方差',blue],['归一化似然',pink],['预测方差',green]]);table([['已纳入读数 / U',readings.slice(0,n)],['后验均值 / U',r.mean],['后验方差 / U²',r.variance],['预测方差 / U²',r.predictive]]);
 }
 if(mode==='9.2'){
  const n=Math.floor(frac*600),limit=Math.max(4,p.separation+3,...data.flatMap(c=>c.path.map(Math.abs))),a=axes(left,{xmin:0,xmax:600,ymin:-limit,ymax:limit,xlabel:'步骤（含初始点）',ylabel:'状态 / 1'}),b=axes(right,{xmin:0,xmax:600,ymin:0,ymax:1,xlabel:'步骤（含初始点）',ylabel:'正半轴占比 / 1'});let rows=[];
  data.forEach((c,j)=>{const color=j?pink:blue,pts=c.path.slice(0,n+1).map((x,i)=>[i,x]);curve(left,pts,a,color);dot(left,pts.at(-1),a,color);let count=0;const ratios=pts.map(([i,x])=>{count+=x>0;return[i,count/(i+1)];});curve(right,ratios,b,color);dot(right,ratios.at(-1),b,color);rows.push([`链 ${j+1} 正占比`,ratios.at(-1)[1]],[`链 ${j+1} 接受率`,n?c.accepted.slice(0,n).filter(Boolean).length/n:'尚无提议']);});curve(right,[[0,.5],[600,.5]],b,gray,true);
  $('value').textContent=rows.filter((_,i)=>i%2===0).map(r=>fmt(r[1])).join(' / ');$('time-readout').textContent=`第 ${n}/600 步`;$('observation-value').textContent='目标正半轴质量为0.5；完整诊断还需多链、相关性与更充分的预算。';legend([['链1',blue],['链2',pink],['精确半轴概率',gray]]);table([['种子','9201 / 9202'],...rows]);
 }
 if(mode==='9.3'){
  const n=Math.floor(frac*20),r=data[n],a=axes(left,{xmin:-4.2,xmax:4.2,ymin:-4.2,ymax:4.2,xlabel:'θ₁ / 1',ylabel:'θ₂ / 1'}),logs=data.map(r=>Math.log10(1+r.gap)),b=axes(right,{xmin:0,xmax:20,ymin:0,ymax:Math.max(...logs)+.15,xlabel:'完整坐标轮数',ylabel:'log₁₀(1+KL) / 1'});
  for(const radius of [1,2]){const angles=Array.from({length:181},(_,i)=>2*Math.PI*i/180);curve(left,angles.map(t=>[radius*Math.cos(t),radius*(p.rho*Math.cos(t)+Math.sqrt(1-p.rho*p.rho)*Math.sin(t))]),a,gray);curve(left,angles.map(t=>[r.mean[0]+radius*Math.sqrt(r.variance)*Math.cos(t),r.mean[1]+radius*Math.sqrt(r.variance)*Math.sin(t)]),a,blue,true);}
  dot(left,r.mean,a,blue);curve(right,logs.slice(0,n+1).map((v,i)=>[i,v]),b,blue);dot(right,[n,logs[n]],b,blue);const floor=-.5*Math.log(1-p.rho*p.rho);curve(right,[[0,Math.log10(1+floor)],[20,Math.log10(1+floor)]],b,pink,true);
  $('value').textContent=fmt(r.gap);$('time-readout').textContent=`第 ${n}/20 轮`;$('observation-value').textContent=`精确边缘方差1；因子方差 ${fmt(r.variance)}；最小KL ${fmt(floor)}。`;legend([['精确相关轮廓',gray],['独立近似',blue],['近似族误差下限',pink]]);table([['当前均值',r.mean],['因子方差',r.variance],['精确协方差',p.rho],['当前KL',r.gap],['KL下限',floor]]);
 }
 if(mode==='9.4'){
  const n=Math.floor(frac*20),r=data[n],values=data.map(r=>r.likelihood),a=axes(left,{xmin:-2,xmax:2,ymin:0,ymax:1,xlabel:'观测 / U',ylabel:'第一分量责任度 / 1'}),b=axes(right,{xmin:0,xmax:20,ymin:Math.min(...values)-.5,ymax:Math.max(...values)+.5,xlabel:'完整EM更新次数',ylabel:'观测 log 似然 / 1'});
  observations.forEach((x,i)=>{curve(left,[[x,0],[x,r.responsibilities[i][0]]],a,blue,false,3);dot(left,[x,r.responsibilities[i][0]],a,blue,6);});curve(right,values.slice(0,n+1).map((v,i)=>[i,v]),b,pink);dot(right,[n,r.likelihood],b,pink);
  $('value').textContent=fmt(r.likelihood);$('time-readout').textContent=`第 ${n}/20 次更新`;$('observation-value').textContent=`均值 [${r.means.map(fmt)}] U；权重 [${r.weights.map(fmt)}]。${p.symmetric?'对称初始化没有自动分离。':'固定方差，不更新噪声。'}`;legend([['当前责任度',blue],['观测似然',pink]]);table([['全部观测 / U',observations],['均值 / U',r.means],['权重',r.weights],['第一分量责任度',r.responsibilities.map(x=>x[0])],['观测log似然',r.likelihood]]);
 }
 if(mode==='9.5'){
  const start=p.multiplier===1?.25:1,c=start+(p.multiplier-start)*frac,r=prediction(p.variance,1,c),a=axes(left,{xmin:-5,xmax:8,ymin:0,ymax:1.85,xlabel:'偏差或新读数 / U',ylabel:'密度 / (1/U)'}),b=axes(right,{xmin:.25,xmax:4,ymin:.55,ymax:1.02,xlabel:'实际噪声方差倍率 c',ylabel:'封存预测区间的概率'}),xs=Array.from({length:301},(_,i)=>-5+13*i/300);
  for(const[v,color,dash]of [[p.variance,gray,false],[r.variance,blue,false],[r.actual,pink,true]])curve(left,xs.map(x=>[x,normal(x,1.6,v)]),a,color,dash);curve(left,[[1.6-r.half,.04],[1.6+r.half,.04]],a,blue,false,5);curve(left,[[1.6-r.parameterHalf,.1],[1.6+r.parameterHalf,.1]],a,gray,false,4);
  curve(right,Array.from({length:101},(_,i)=>{const q=.25+3.75*i/100;return[q,prediction(p.variance,1,q).coverage];}),b,pink);dot(right,[c,r.coverage],b,pink,6);curve(right,[[.25,.95],[4,.95]],b,gray,true);
  $('value').textContent=(100*r.coverage).toFixed(1)+'%';$('time-readout').textContent=`当前噪声倍率 ${fmt(c)}`;$('observation-value').textContent=`参数区间半宽 ${fmt(r.parameterHalf)} U；封存预测区间半宽 ${fmt(r.half)} U。区间始终不变，改变的是核验分布。`;legend([['参数分布与区间',gray],['封存预测与区间',blue],['实际噪声下的核验',pink]]);table([['模型预测方差 / U²',r.variance],['核验方差 / U²',r.actual],['封存区间下界 / U',1.6-r.half],['封存区间上界 / U',1.6+r.half],['解析覆盖',r.coverage]]);
 }
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`探索未能运行：${error.message}。请刷新重试。`;for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;playback?.pause();}
function guard(fn){try{fn();}catch(error){failed(error);}}
async function start(){
 ({current:chapter}=await mountShell('explore'));mode=chapter?.id;const def=definitions[mode];if(!def)throw Error('本章没有此探索页');$('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';for(const id of ['title','question','explanation','formula','assumptions'])$(id).textContent=def[id];$('chart-heading').textContent=def.heading;$('value-label').textContent=def.label;$('chart-note').textContent=def.note;$('preset-note').textContent='先观察指定条件；播放可从起点逐步展开。每个对照按钮都支持切换回去。';controls();recompute();
 playback=createPlayback({duration:100,speed:10,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':'播放';$('play-status').textContent=reason==='playing'?'正在播放，观察图形与读数同步变化。':reason==='ended'?'已展示指定条件；点击播放可从起点观察。':reason==='hidden'?'切离页面后已暂停。':'已暂停，可拖动观察位置。';}});
 $('play').addEventListener('click',()=>guard(()=>playback.running?playback.pause():playback.play()));$('replay').addEventListener('click',()=>guard(()=>{playback.seek(0);playback.play();}));$('timeline').addEventListener('input',()=>guard(()=>playback.seek(Number($('timeline').value))));
 $('alternate').addEventListener('click',()=>guard(()=>{set(alternate(mode,p));}));$('reset').addEventListener('click',()=>guard(()=>{controls();recompute();}));document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause('hidden');});
 for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
 playback.seek(100);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';
}
start().catch(failed);
