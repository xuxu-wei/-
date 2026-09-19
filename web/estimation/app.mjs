import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {exchange,hmmExperiment,kalmanExperiment,ellipse,nonlinearExperiment,particleExperiment,smoothingExperiment,alternate} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const blue=theme.data['1'],pink=theme.data['2'],green=theme.data['3'],gray=theme.data.reference;
const fmt=x=>x===null?'缺测':Number(x.toPrecision(4)).toString();
const svg=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let chapter,mode,p={},data,playback;
const definitions={
 '7.1':{title:'只看总量，能分清两个室吗？',question:'先预测：初始总量分别是 [8,2] 与 [2,8]，总量相同。测量一个室和测量总量，得到的信息会有什么不同？',explanation:'状态（state）包含两个室的总量，观测（observation）由传感器（sensor）映射得到。能观性（observability）问的是：模型已知时，不同初始状态能否由一段无噪输出区分。',formula:'x[n+1]=F x[n]；y[n]=H x[n]；O=[H; HF]'},
 '7.2':{title:'预测，再用新读数修正概率',question:'先预测：当前标记明亮，就能确定细胞处于活跃状态吗？逐次查看标记，比较读数到来前后的三种状态概率。',explanation:'隐马尔可夫模型（hidden Markov model，HMM）将状态转移与测量机制分开。贝叶斯滤波（Bayesian filtering）先对未知前态求和，再用当次似然（likelihood）更新；一个读数只使用一次。',formula:'p⁻[j]=Σᵢ p[i] T[i,j]；p⁺[j]=p⁻[j] L[j] / Σₖ p⁻[k] L[k]'},
 '7.3':{title:'一次观测怎样缩小状态的不确定性',question:'先预测：观测只有第一个室，第二个室的不确定性会不会改变？逐次播放，比较预测与滤波的联合分布。',explanation:'卡尔曼滤波（Kalman filter，KF）在线性高斯模型中递推均值（mean）与协方差（covariance）。增益（gain）由预测误差与测量噪声（measurement noise）共同决定。椭圆展示两个室的不确定性关联。',formula:'m⁻=F m；P⁻=F P Fᵀ+Q；K=P⁻Hᵀ/(H P⁻Hᵀ+R)；m⁺=m⁻+K(y−Hm⁻)'},
 '7.4':{title:'一个钟形近似，能装下两个可能状态吗？',question:'先预测：只看到 x² 接近 1.4，能判断 x 的正负吗？将先验均值移到零，比较网格积分刻画的后验形状与两种高斯近似。',explanation:'扩展卡尔曼滤波（extended Kalman filter，EKF）在均值处线性化；无迹卡尔曼滤波（unscented Kalman filter，UKF）传播确定性采样点。两者都只保留一个高斯分布，不能完整表达双峰（bimodal）后验。',formula:'x ~ N(m,0.8)；y=x²+v，v ~ N(0,R)；p(x|y) ∝ p(x) p(y|x)'},
 '7.5':{title:'权重相同，不等于信息重新变多',question:'先预测：重采样后每个粒子权重都一样，丢失的状态是否就回来了？观察高权重位置被重复选择，以及保留下来的不同位置数。',explanation:'重要性采样（importance sampling）用带权粒子近似后验。有效样本量（effective sample size，ESS）描述权重集中程度；系统重采样（systematic resampling）重新分配有限计算资源，不能补回已经没有粒子覆盖的区域。',formula:'wᵢ ∝ p(xᵢ) p(y|xᵢ) / q(xᵢ)；ESS=1/Σᵢwᵢ²；重采样位置=(i+offset)/N'},
 '7.6':{title:'读数缺了一段，后来能补回什么？',question:'先预测：缺测时滤波区间会怎样变化？重新获得读数后，回看过去的平滑结果与当时能做出的估计有何区别？',explanation:'滤波（filtering）仅使用当前及过去的观测；固定区间平滑（fixed-interval smoothing）使用整段观测。Rauch–Tung–Striebel 平滑（RTS smoothing）向后传播修正，因此只能用于离线重建。',formula:'x[n+1]=x[n]+w[n]；y[n]=x[n]+v[n]；G[n]=P[n]/P⁻[n+1]'}
};
function slider(key,label,min,max,step,value){p[key]=value;const group=el('div',undefined,'slider'),lab=el('label',label),out=el('output',value),input=el('input');Object.assign(input,{id:key,type:'range',min,max,step,value});lab.htmlFor=key;out.id=key+'-value';input.addEventListener('input',()=>{p[key]=Number(input.value);out.value=input.value;guard(recompute);});group.append(lab,out,input);$('sliders').append(group);}
function controls(){p={};$('sliders').replaceChildren();
 if(mode==='7.1'){slider('exchange','每步交换比例 c',0,.4,.02,.2);p.total=false;}
 if(mode==='7.2')slider('error','标记翻转概率 ε',.02,.5,.02,.14);
 if(mode==='7.3')slider('noise','测量方差 R / U²',.04,1,.04,.16);
 if(mode==='7.4'){slider('mean','先验均值 m / U',0,2,.1,.6);slider('noise','测量方差 R / U⁴',.05,1,.05,.15);slider('observed','本次平方读数 y / U²',.2,3,.1,1.4);}
 if(mode==='7.5'){slider('count','粒子数 N',12,120,6,60);slider('noise','测量方差 R / U⁴',.05,1,.05,.15);slider('offset','重采样偏移 offset',0,.95,.05,.5);}
 if(mode==='7.6'){slider('process','每步过程方差 Q / U²',.02,.3,.02,.08);p.gap=true;}
}
function set(values){for(const[key,value]of Object.entries(values)){p[key]=value;if($(key)){$(key).value=value;$(key+'-value').value=value;}}guard(recompute);}
function legend(entries){$('legend').replaceChildren();for(const[label,color,dashed]of entries){const item=el('span',label,dashed?'dashed':'');item.style.setProperty('--line-color',color);$('legend').append(item);}}
function table(headers,rows){const t=el('table'),head=el('tr');headers.forEach(x=>head.append(el('th',x)));t.append(head);rows.forEach(row=>{const tr=el('tr');row.forEach(x=>tr.append(el('td',typeof x==='number'||x===null?fmt(x):x)));t.append(tr);});$('value-table').replaceChildren(t);$('table-note').textContent='数值来自当前条件；表格保留完整序列或明确列出的比较量。';}
function recompute(){
 if(mode==='7.1'){
  data=exchange(p.exchange,p.total);$('alternate').textContent=p.total?'切换为只测第一室':'切换为测量两室总量';
  $('preset-note').textContent=`当前 H=[${data.H}]；两种初态总量均为 10 U。按钮切换传感器，交换比例保持不变。`;
  $('assumptions').textContent='理想封闭二室，U 是所追踪物质总量（tracked amount）的教学单位；每步两室各流出自身的 c 比例给另一室，无清除、输入或噪声。此页首先检验已知离散模型的无噪可区分性。';
  $('chart-heading').textContent='内部状态不同，读数可能相同';$('value-label').textContent='两步能观矩阵的秩';$('value').textContent=`${data.rank} / 2`;
  $('chart-note').textContent='左图只画两个初态对应的第一室状态；第二室始终等于 10 减第一室。右图画传感器读数。总量传感器的曲线重合，不能恢复物质如何分配；秩满也不保证有噪恢复误差小。';
  legend([['初态 [8,2]',blue,false],['初态 [2,8]',pink,true]]);table(['步 n','初态一：第一室 / U','初态二：第一室 / U','读数一 / U','读数二 / U'],data.paths[0].map((x,i)=>[i,x[0],data.paths[1][i][0],data.outputs[0][i],data.outputs[1][i]]));
 }
 if(mode==='7.2'){
  data=hmmExperiment(p.error);const next=alternate(p.error,.14,.5);$('alternate').textContent=next===.5?'切换为无区分度标记':'切换为有区分度标记';
  $('preset-note').textContent=`三态的明亮概率分别为 [${fmt(p.error)}, 0.5, ${fmt(1-p.error)}]。ε=0.5 时，同一标记对三态的似然相同。`;
  $('assumptions').textContent='三态命名为静息、过渡、活跃，仅为理想细胞机制类比。转移矩阵固定；第 0 次读数直接更新初始分布 [0.6,0.3,0.1]，之后先转移再更新。整段标记固定，改变 ε 只改变测量模型。';
  $('chart-heading').textContent='读数到来前后，各状态有多大可能';$('value-label').textContent='当前读数';
  $('chart-note').textContent='柱高为概率，坐标固定 0—1；左为预测，右为更新后分布。三态分别采用同一颜色，圆点用于强调当前最大概率；最大概率状态仍可能判断错误。';
  legend([['静息',blue,false],['过渡',pink,false],['活跃',green,false]]);table(['步 n','标记（0暗/1亮）','静息后验','过渡后验','活跃后验'],data.rows.map((r,i)=>[i,data.observations[i],...r.filtered]));
 }
 if(mode==='7.3'){
  data=kalmanExperiment(p.noise);const next=alternate(p.noise,.16,.8);$('alternate').textContent=next===.8?'切换为高测量噪声':'切换为低测量噪声';
  $('preset-note').textContent=`当前 R=${fmt(p.noise)} U²；使用同一段固定读数，比较不同噪声假设，不把显示效果当作真实误差评估。`;
  $('assumptions').textContent='二室状态为参考工作点附近的偏差，允许负值；F=[[0.85,0.1],[0.1,0.8]]，Q=diag(0.02,0.02) U²，H=[1,0]，m₀=[2,0] U，P₀=I U²。独立零均值高斯噪声，第 0 步先观测更新。';
  $('chart-heading').textContent='预测与滤波的联合不确定性';$('value-label').textContent='第一室增益 K₁';
  $('chart-note').textContent='左图椭圆的马氏距离平方为 5.991，在二维高斯假设下包围约 95% 概率，交叉线为均值。右图是两个室的滤波均值；方差变化与实际误差不同，覆盖率需要另做重复实验。';
  legend([['预测椭圆 / 第一室均值',blue,false],['滤波椭圆 / 第二室均值',pink,true]]);table(['步 n','读数 / U','第一室均值 / U','第二室均值 / U','第一室方差 / U²'],data.rows.map((r,i)=>[i,data.observations[i],...r.mean,r.covariance[0][0]]));
 }
 if(mode==='7.4'){
  data=nonlinearExperiment(p.mean,p.noise,p.observed);const next=alternate(p.mean,0,.6);$('alternate').textContent=next===0?'切换为对称先验 m=0':'切换回偏正先验 m=0.6';
  $('preset-note').textContent='按钮只改变先验均值，保留读数和测量方差。对称先验下，正负状态具有同等观测解释。';
  $('assumptions').textContent='这是非线性观测的一次更新，省略过程预测，状态 x 是可正可负的偏差量（单位 U）。先验方差 0.8 U²；UKF 固定 α=1、β=2、κ=0。网格在 [−6,6] U 上以 0.02 U 间隔积分，作为有限区间数值参照。';
  $('chart-heading').textContent='后验形状，与近似的均值和方差';$('value-label').textContent='网格后验均值 / U';$('value').textContent=fmt(data.grid.mean);
  $('chart-note').textContent='播放从左到右展开密度曲线，横轴是状态，动画不是状态随时间的轨迹。灰线为网格后验；两条近似曲线重合时，虚线仍可辨认。均值接近零不代表零附近最可能；多峰性不能由均值和方差完整描述。';
  legend([['EKF 高斯近似',blue,false],['UKF 高斯近似',pink,true],['网格后验',gray,true]]);table(['方法','均值 / U','方差 / U²'],[['网格积分',data.grid.mean,data.grid.variance],['EKF',data.ekf.mean,data.ekf.variance],['UKF',data.ukf.mean,data.ukf.variance]]);
 }
 if(mode==='7.5'){
  data=particleExperiment(p.noise,p.count,p.offset);const next=alternate(p.count,12,96);$('alternate').textContent=next===96?'切换为 96 个粒子':'切换为 12 个粒子';
  $('preset-note').textContent=`系统重采样采用固定 offset=${fmt(p.offset)}；重复点击不会偷偷重新抽样。不同祖先 ${new Set(data.indices).size}/${p.count} 个。`;
  $('assumptions').textContent='使用与上一章相同的 x² 观测，先验 N(0,0.8)，y=1.4。为隔离随机波动，这一页把均匀提议 [−4,4] 的中点固定作粒子，权重乘先验密度与似然；这是单次重要性更新和重采样，完整动态粒子滤波见 Notebook。';
  $('chart-heading').textContent='哪些位置获得权重，哪些被重复选择';$('value-label').textContent='重采样前 ESS / N';$('value').textContent=`${fmt(data.ess)} / ${p.count}`;
  $('chart-note').textContent='左图每根针为一个粒子的归一化权重；右图针高为重采样后该位置所占比例，重复祖先合并计数。两图共用纵轴。播放只逐个展示已经算好的粒子，不表示逐次重复观测。重采样后单粒子权重为 1/N，不同位置数可能减少。';
  legend([['更新后权重',blue,false],['重采样后位置占比',pink,true]]);const counts=data.indices.reduce((a,j)=>(a[j]=(a[j]||0)+1,a),{});table(['粒子序号','位置 / U','归一化权重','被复制次数'],data.particles.map((x,i)=>[i,x,data.weights[i],counts[i]||0]));
 }
 if(mode==='7.6'){
  data=smoothingExperiment(p.gap,p.process);$('alternate').textContent=p.gap?'切换为完整观测':'切换为中段缺测';
  $('preset-note').textContent=p.gap?'第 6—12 步没有观测：该段只做预测；第 13 步重新得到观测。':'观测已恢复完整；再次点击可回到相同的缺测区间。';
  $('assumptions').textContent='为突出时间信息，采用二室案例的标量简化：随机游走、初始均值 0 U、方差 1 U²、测量方差 0.16 U²，过程与测量噪声独立高斯。固定观测序列不含真值，不能从两条估计的差异直接判断实际误差。';
  $('chart-heading').textContent='当时能知道的，与后来重建的';$('value-label').textContent='当前缺测状态';
  $('chart-note').textContent='左图蓝色为实时滤波，玫红虚线为使用全部 20 步观测的离线平滑，浅带为各自的边际 95% 高斯区间。右图比较方差；平滑曲线的历史点使用了播放位置之后的观测，绝不能当作在线预测成绩。';
  legend([['滤波（仅到当前时刻）',blue,false],['平滑（全部观测）',pink,true],['实际读数（圆点）',gray,true]]);table(['步 n','观测 / U','滤波均值 / U','平滑均值 / U','滤波方差 / U²','平滑方差 / U²'],data.filtered.map((r,i)=>[i,data.observations[i],r.mean[0],data.smoothed[i].mean,r.covariance[0][0],data.smoothed[i].variance]));
 }
 playback?.pause();playback?playback.seek(0):draw(0);
}
function axes(chart,{xmin=0,xmax,ymin,ymax,xlabel,ylabel}){
 const left=66,top=44,width=444,height=264,x=v=>left+width*(v-xmin)/(xmax-xmin),y=v=>top+height*(ymax-v)/(ymax-ymin);
 for(let j=0;j<=4;j++){const value=ymin+(ymax-ymin)*j/4;chart.append(svg('line',{x1:left,y1:y(value),x2:left+width,y2:y(value),stroke:'#e1e7ef'}),svg('text',{x:left-9,y:y(value)+5,'text-anchor':'end','font-size':14,fill:gray},fmt(value)));}
 for(let j=0;j<=4;j++){const value=xmin+(xmax-xmin)*j/4;chart.append(svg('text',{x:x(value),y:338,'text-anchor':'middle','font-size':14,fill:gray},fmt(value)));}
 chart.append(svg('text',{x:left+width/2,y:371,'text-anchor':'middle','font-size':16,fill:gray},xlabel),svg('text',{x:left,y:23,'font-size':16,fill:gray},ylabel));return{x,y};
}
function curve(chart,points,a,color,dashed=false){chart.append(svg('path',{d:points.map(([x,y],i)=>`${i?'L':'M'}${a.x(x).toFixed(2)},${a.y(y).toFixed(2)}`).join(' '),fill:'none',stroke:color,'stroke-width':2.7,'stroke-dasharray':dashed?'7 5':'none','stroke-linejoin':'round'}));}
function marker(chart,[x,y],a,color,r=4){chart.append(svg('circle',{cx:a.x(x),cy:a.y(y),r,fill:'white',stroke:color,'stroke-width':2.4}));}
function band(chart,rows,a,color){if(!rows.length)return;const points=[...rows.map(([x,m,v])=>[x,m+1.96*Math.sqrt(v)]),...rows.slice().reverse().map(([x,m,v])=>[x,m-1.96*Math.sqrt(v)])];chart.append(svg('path',{d:points.map(([x,y],i)=>`${i?'L':'M'}${a.x(x)},${a.y(y)}`).join(' ')+'Z',fill:color,opacity:.1}));}
function bars(chart,values){const a=axes(chart,{xmin:0,xmax:4,ymin:0,ymax:1,xlabel:'1 静息 · 2 过渡 · 3 活跃',ylabel:'概率'});values.forEach((v,i)=>{const color=[blue,pink,green][i];chart.append(svg('rect',{x:a.x(i+1)-26,y:a.y(v),width:52,height:a.y(0)-a.y(v),fill:color,'fill-opacity':.24,stroke:color,'stroke-width':2}),svg('text',{x:a.x(i+1),y:a.y(v)-9,'text-anchor':'middle','font-size':15,fill:gray},fmt(v)));});const max=Math.max(...values),index=values.indexOf(max);marker(chart,[index+1,max],a,[blue,pink,green][index]);}
function draw(progress){
 const f=progress/100,left=$('chart'),right=$('detail-chart');$('timeline').value=progress;$('play-counter').textContent=`进度 ${progress.toFixed(1)}%`;
 left.replaceChildren(svg('title',{id:'svg-title'},definitions[mode].title),svg('desc',{id:'svg-desc'},$('chart-note').textContent));right.replaceChildren(svg('title',{id:'detail-title'},$('chart-heading').textContent),svg('desc',{id:'detail-desc'},$('chart-note').textContent));
 if(mode==='7.1'){
  const n=Math.floor(f*16),a=axes(left,{xmax:16,ymin:0,ymax:10,xlabel:'离散步 n',ylabel:'第一室状态 / U'}),b=axes(right,{xmax:16,ymin:0,ymax:11,xlabel:'离散步 n',ylabel:'传感器读数 / U'});
  for(let j=0;j<2;j++){const color=j?pink:blue;curve(left,data.paths[j].slice(0,n+1).map((x,i)=>[i,x[0]]),a,color,!!j);curve(right,data.outputs[j].slice(0,n+1).map((y,i)=>[i,y]),b,color,!!j);marker(left,[n,data.paths[j][n][0]],a,color);marker(right,[n,data.outputs[j][n]],b,color);}
  $('time-readout').textContent=`离散步 n=${n}`;$('observation-value').textContent=`两种初态的读数差：${fmt(data.outputs[0][n]-data.outputs[1][n])} U。O 的两行为 [${data.O[0].map(fmt)}]、[${data.O[1].map(fmt)}]。`;
 }
 if(mode==='7.2'){
  const n=Math.floor(f*(data.rows.length-1)),r=data.rows[n];bars(left,r.predicted);bars(right,r.filtered);$('time-readout').textContent=`第 ${n} 次读数：左预测 → 右更新`;$('value').textContent=data.observations[n]?'明亮标记':'暗淡标记';$('observation-value').textContent=`证据概率 ${fmt(r.evidence)}；更新后的概率和=${fmt(r.filtered.reduce((a,b)=>a+b,0))}。${p.error===.5?'当前标记不区分状态，预测与更新一致。':'标记同时可能由多个状态产生。'}`;
 }
 if(mode==='7.3'){
  const n=Math.floor(f*(data.rows.length-1)),r=data.rows[n],a=axes(left,{xmin:-2,xmax:5,ymin:-3,ymax:4,xlabel:'第一室偏差 / U',ylabel:'第二室偏差 / U'}),b=axes(right,{xmax:15,ymin:-.3,ymax:2.6,xlabel:'离散步 n',ylabel:'滤波均值 / U'});
  for(const [m,c,color,dash]of [[r.predictedMean,r.predictedCovariance,blue,false],[r.mean,r.covariance,pink,true]]){curve(left,ellipse(m,c),a,color,dash);marker(left,m,a,color,5);}
  [0,1].forEach(j=>{curve(right,data.rows.slice(0,n+1).map((r,i)=>[i,r.mean[j]]),b,j?pink:blue,!!j);marker(right,[n,r.mean[j]],b,j?pink:blue);});
  $('time-readout').textContent=`离散步 n=${n}`;$('value').textContent=fmt(r.gain[0]);$('observation-value').textContent=`读数 ${fmt(data.observations[n])} U；创新 ${fmt(r.innovation)} U；第一室方差 ${fmt(r.predictedCovariance[0][0])} → ${fmt(r.covariance[0][0])} U²。`;
 }
 if(mode==='7.4'){
  const normal=(x,m,v)=>Math.exp(-.5*(x-m)**2/v)/Math.sqrt(2*Math.PI*v),xs=data.grid.xs,start=xs.findIndex(x=>x>=-4),last=xs.findLastIndex(x=>x<=4),limit=start+Math.floor(f*(last-start))+1,ekf=xs.map(x=>normal(x,data.ekf.mean,data.ekf.variance)),ukf=xs.map(x=>normal(x,data.ukf.mean,data.ukf.variance));
  const ymax=Math.max(...data.grid.density,...ekf,...ukf)*1.12,a=axes(left,{xmin:-4,xmax:4,ymin:0,ymax,xlabel:'状态偏差 x / U',ylabel:'概率密度 / U⁻¹'}),b=axes(right,{xmin:-4,xmax:4,ymin:0,ymax,xlabel:'状态偏差 x / U',ylabel:'两种高斯近似 / U⁻¹'});
  const points=values=>xs.slice(start,limit).map((x,i)=>[x,values[i+start]]);
  curve(left,points(data.grid.density),a,gray,true);curve(right,points(data.grid.density),b,gray,true);curve(right,points(ekf),b,blue);curve(right,points(ukf),b,pink,true);
  $('time-readout').textContent=`曲线展开位置 x=${fmt(xs[limit-1])} U`;$('observation-value').textContent=`均值（EKF / UKF）=${fmt(data.ekf.mean)} / ${fmt(data.ukf.mean)} U；后验方差（网格 / EKF / UKF）=${fmt(data.grid.variance)} / ${fmt(data.ekf.variance)} / ${fmt(data.ukf.variance)} U²。`;
 }
 if(mode==='7.5'){
  const count=Math.floor(f*(p.count-1))+1,counts=data.indices.reduce((a,j)=>(a[j]=(a[j]||0)+1,a),{}),maximum=Math.max(...data.weights,...Object.values(counts).map(x=>x/p.count))*1.15;
  const a=axes(left,{xmin:-4,xmax:4,ymin:0,ymax:maximum,xlabel:'状态偏差 x / U',ylabel:'归一化权重'}),b=axes(right,{xmin:-4,xmax:4,ymin:0,ymax:maximum,xlabel:'状态偏差 x / U',ylabel:'复制数 / N'});
  for(let i=0;i<count;i++){const x=data.particles[i];curve(left,[[x,0],[x,data.weights[i]]],a,blue);marker(left,[x,data.weights[i]],a,blue,2);if(counts[i]){curve(right,[[x,0],[x,counts[i]/p.count]],b,pink,true);marker(right,[x,counts[i]/p.count],b,pink,3);}}
  $('time-readout').textContent=`已展示 ${count}/${p.count} 个原位置`;$('observation-value').textContent=`完整重采样保留 ${new Set(data.indices).size} 个不同位置；每个新粒子权重为 ${fmt(1/p.count)}，此时 ESS=${p.count}，但样本多样性没有因此恢复。`;
 }
 if(mode==='7.6'){
  const n=Math.floor(f*(data.filtered.length-1)),a=axes(left,{xmax:19,ymin:-2.2,ymax:4,xlabel:'离散步 n',ylabel:'状态偏差 / U'}),maximum=Math.max(...data.filtered.map(r=>r.covariance[0][0]))*1.13,b=axes(right,{xmax:19,ymin:0,ymax:maximum,xlabel:'离散步 n',ylabel:'条件方差 / U²'});
  if(p.gap)for(const[chart,axis]of [[left,a],[right,b]])chart.append(svg('rect',{x:axis.x(6),y:44,width:axis.x(12)-axis.x(6),height:264,fill:gray,opacity:.06}));
  const filtered=data.filtered.slice(0,n+1).map((r,i)=>[i,r.mean[0],r.covariance[0][0]]),smoothed=data.smoothed.slice(0,n+1).map((r,i)=>[i,r.mean,r.variance]);band(left,filtered,a,blue);band(left,smoothed,a,pink);
  for(const[rows,color,dash]of [[filtered,blue,false],[smoothed,pink,true]]){curve(left,rows.map(([i,m])=>[i,m]),a,color,dash);curve(right,rows.map(([i,,v])=>[i,v]),b,color,dash);}
  data.observations.slice(0,n+1).forEach((v,i)=>{if(v!==null)marker(left,[i,v],a,gray,3);});$('time-readout').textContent=`查看第 n=${n} 步的估计`;$('value').textContent=data.observations[n]===null?'缺测，只预测':'有当次观测';$('observation-value').textContent=`方差：滤波 ${fmt(data.filtered[n].covariance[0][0])}、平滑 ${fmt(data.smoothed[n].variance)} U²。平滑在所有位置都使用整段记录；终点两者相同。`;
 }
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`可视化未能运行：${error.message}。请刷新重试。`;for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;playback?.pause();}
function guard(fn){try{fn();}catch(error){failed(error);}}
async function start(){
 ({current:chapter}=await mountShell('explore'));mode=chapter?.id;if(!definitions[mode])throw Error('本章没有此探索页');$('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';for(const id of ['title','question','explanation','formula'])$(id).textContent=definitions[mode][id];controls();recompute();
 playback=createPlayback({duration:100,speed:9,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':reason==='ended'?'再次播放':'播放';$('play-status').textContent=reason==='playing'?'正在播放，观察图形与数值同步变化。':reason==='ended'?'已到终点，可重播或改变条件。':reason==='hidden'?'切离页面后已暂停。':'已暂停；改变条件会回到起点。';}});
 $('play').addEventListener('click',()=>guard(()=>playback.running?playback.pause():playback.play()));$('replay').addEventListener('click',()=>guard(()=>{playback.seek(0);playback.play();}));$('timeline').addEventListener('input',()=>guard(()=>playback.seek(Number($('timeline').value))));
 $('alternate').addEventListener('click',()=>{if(mode==='7.1')set({total:!p.total});if(mode==='7.2')set({error:alternate(p.error,.14,.5)});if(mode==='7.3')set({noise:alternate(p.noise,.16,.8)});if(mode==='7.4')set({mean:alternate(p.mean,0,.6)});if(mode==='7.5')set({count:alternate(p.count,12,96)});if(mode==='7.6')set({gap:!p.gap});});$('reset').addEventListener('click',()=>guard(()=>{controls();recompute();}));document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause('hidden');});
 for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
 playback.seek(0);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';
}
start().catch(failed);
