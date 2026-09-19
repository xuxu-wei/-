import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {quadratic,descent,shrinkage,allocation,feasiblePolygon,alternate} from './model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const blue=theme.data['1'],pink=theme.data['2'],green=theme.data['3'],gray=theme.data.reference;
const fmt=x=>x===null?'无可行解':Number(x.toPrecision(4)).toString();
const node=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let chapter,mode,p={},data,playback;
const definitions={
 '8.1':{title:'同一个驻点，可以是谷底，也可以是鞍点',question:"先预测：把第二个方向的曲率从正改为负，原点的梯度（gradient）仍为零。它还会是最小点吗？",explanation:"海森矩阵（Hessian matrix）描述局部曲率。这里二次目标的曲率在全域相同：正定（positive definite）时是唯一谷底，负曲率出现后原点成为鞍点（saddle point）。蓝色箭头表示当前位置的负梯度方向。",formula:'f(x)=½(x₁²+q x₂²)；∇f=(x₁,q x₂)',heading:'看等高线，再看沿第二轴的切片',label:'曲率条件',assumptions:"模型（model）简化：两个无量纲（dimensionless）变量、固定对角曲率，无约束。播放只是移动观察点，不是优化算法的迭代。一般非线性函数不能仅凭一点的曲率判断全域凸性（convexity）。",note:"左图为目标等高线，箭头归一化到固定显示长度，只表示方向；圆点沿单位圆移动。右图是 x₁=0 的切片，正曲率向上、负曲率向下。",controls:[['curvature','第二方向曲率 q',-2,4,.1,2],['angle','观察点终止角度 / 度',15,345,5,60]]},
 '8.2':{title:'步长更大，为什么反而越来越远？',question:"先预测：沿窄谷下降，把 ηL 从 1.5 改成 2.2，会加快收敛还是放大振荡？",explanation:"梯度（gradient）下降（gradient descent）的两个误差分量分别乘 1−η 和 1−ηL。条件数（condition number）L控制两个方向的尺度差异；要让所有初值（initial condition）收敛，必须 0<ηL<2。",formula:'H=diag(1,L)；x[n+1]=(I−ηH)x[n]；η=ρ/L',heading:'迭代路径与残差同步观察',label:'当前梯度范数',assumptions:"模型（model）简化：正定（positive definite）二次目标，b=0，初值[1.6,1.4]，固定30次更新。残差（residual）用梯度二范数（norm）；预算结束不自动意味着收敛。右图取常用对数，只改变显示尺度。",note:"左图动态显示两个坐标的下降路径；窗口按完整轨迹（trajectory）设定，失稳时会扩大。右图是 log₁₀‖∇f‖；横轴是更新次数，不是物理时间。",controls:[['curvature','最大曲率 L（条件数）',1,20,1,10],['ratio','缩放步长 ρ = ηL',.2,2.6,.05,1.5]]},
 '8.3':{title:'平滑收缩，还是让一个系数真正归零？',question:"先预测：逐渐提高惩罚，岭回归（ridge regression）与L1惩罚的第二个系数会在什么时候变成零？",explanation:"岭回归平滑收缩系数；L1惩罚的软阈值（soft thresholding）保留折点。此页用正交（orthogonality）设计隔离惩罚效果，相关机制字典的完整近端迭代见 Notebook。",formula:'XᵀX/n=I，b=[1.4,0.55]；岭 β=b/(1+λ)；L1 β=Sλ(b)',heading:'同一观测下的两种惩罚路径',label:'当前惩罚 λ',assumptions:"模型（model）简化：已无量纲（dimensionless）化的正交字典，平均平方损失，无截距。播放扫描λ，并非随时间演化或算法收敛。零系数只说明当前目标的稀疏表示，不证明真实机制不存在。",note:"左图实线为岭系数，右图虚线为L1系数；颜色一一对应两个候选项。观察λ=0.55和1.4的折点。改变目标λ会立即展示该处结果，播放会从零扫描到指定值。",controls:[['penalty','观察到的惩罚 λ',0,1.8,.05,.8]]},
 '8.4':{title:'预算收紧时，最优配置怎样碰到边界？',question:"先预测：两个流量（flow）都至少要0.5，预算若低于1，再多迭代还能找到可行解吗？",explanation:"可行域（feasible set）同时满足上下界与总预算。活跃集（active set）由取等号的约束组成；候选解还需检查KKT最优性条件（KKT conditions），不能只看它有没有落在阴影内。",formula:'min x₁²+2x₂²−4x₁−8x₂；0.5≤xᵢ≤3；x₁+x₂≤B',heading:'可行区域、边界与最优代价',label:'当前可行性',assumptions:"模型（model）简化：两个输入（input）以共同参考流量归一化，代价正定（positive definite），预算是硬约束。播放把预算从4扫描到指定值；不是系统的时间响应。B<1时由最低需求给出不可行证据。",note:"左图浅色区域可行，玫红点为最优配置；右图画随预算变化的最小代价。预算低于1时不伪造最优点或代价；数值表分别列出四类KKT残差（residual）。",controls:[['budget','总预算 B',.5,5,.05,2]]}
};
function controls(){p={};$('sliders').replaceChildren();for(const[key,label,min,max,step,value]of definitions[mode].controls){p[key]=value;const row=el('div',null,'slider'),labelNode=el('label',label),input=el('input'),out=el('output',fmt(value));input.type='range';input.id='parameter-'+key;input.min=min;input.max=max;input.step=step;input.value=value;labelNode.htmlFor=input.id;out.id='parameter-value-'+key;input.addEventListener('input',()=>guard(()=>{p[key]=Number(input.value);out.textContent=fmt(p[key]);recompute();}));row.append(labelNode,out,input);$('sliders').append(row);}}
function set(values){Object.assign(p,values);for(const[key,value]of Object.entries(values)){$('parameter-'+key).value=value;$('parameter-value-'+key).textContent=fmt(value);}recompute();}
function recompute(){
 if(mode==='8.1')$('alternate').textContent=p.curvature<0?'切换为正曲率示例':'切换为负曲率示例';
 if(mode==='8.2'){data=descent(p.curvature,p.ratio);$('alternate').textContent=p.ratio>=2?'切换为稳定步长':'切换为失稳步长';}
 if(mode==='8.3')$('alternate').textContent=p.penalty>=1.4?'切换为弱惩罚示例':'切换为全零示例';
 if(mode==='8.4')$('alternate').textContent=p.budget<1?'切换为可行预算':'切换为不可行预算';
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
function contours(chart,q,a){
 for(const level of [-2,-1,-.4,.4,1,2,3,4]){
  for(const sign of [-1,1]){const points=[];for(let k=0;k<=400;k++){const x=a.xmin+(a.xmax-a.xmin)*k/400;const y2=(2*level-x*x)/q;points.push([x,q!==0&&y2>=0?sign*Math.sqrt(y2):NaN]);}curve(chart,points,a,level<0?pink:gray,true,1);}
 }
 if(q===0)for(const x of [-2,-1,0,1,2])curve(chart,[[x,a.ymin],[x,a.ymax]],a,gray,true,1);
}
function draw(progress){
 const frac=progress/100,left=$('chart'),right=$('detail-chart'),def=definitions[mode];$('timeline').value=progress;$('play-counter').textContent=`进度 ${progress.toFixed(1)}%`;
 for(const[chart,prefix]of [[left,'svg'],[right,'detail']])chart.replaceChildren(node('title',{id:prefix+'-title'},def.heading),node('desc',{id:prefix+'-desc'},def.note));
 if(mode==='8.1'){
  const q=p.curvature,angle=p.angle*frac*Math.PI/180,point=[Math.cos(angle),Math.sin(angle)],r=quadratic([[1,0],[0,q]],[0,0],point),a=axes(left,{xmin:-2.2,xmax:2.2,ymin:-2.2,ymax:2.2,xlabel:'x₁ / 1',ylabel:'x₂ / 1 · 等高线'}),b=axes(right,{xmin:-2,xmax:2,ymin:Math.min(-.4,2*q)-.2,ymax:Math.max(.4,2*q)+.2,xlabel:'x₂ / 1（x₁=0）',ylabel:'切片目标 f / 1'});
  contours(left,q,a);dot(left,point,a,blue);dot(left,[0,0],a,gray,3);
  const norm=Math.hypot(...r.gradient),end=point.map((x,j)=>x-.6*r.gradient[j]/Math.max(norm,1e-15));curve(left,[point,end],a,blue,false,3);const dx=a.x(end[0])-a.x(point[0]),dy=a.y(end[1])-a.y(point[1]),theta=Math.atan2(dy,dx);left.append(node('path',{d:`M${a.x(end[0])-10*Math.cos(theta-.4)},${a.y(end[1])-10*Math.sin(theta-.4)} L${a.x(end[0])},${a.y(end[1])} L${a.x(end[0])-10*Math.cos(theta+.4)},${a.y(end[1])-10*Math.sin(theta+.4)}`,fill:'none',stroke:blue,'stroke-width':3}));
  curve(right,Array.from({length:201},(_,i)=>{const x=-2+i*.02;return[x,.5*q*x*x];}),b,q<0?pink:green);dot(right,[0,0],b,gray);
  $('value').textContent=q>0?'正定 · 唯一最小':q<0?'不定 · 原点是鞍点':'半正定 · 最小点不唯一';$('time-readout').textContent=`观察角 ${fmt(p.angle*frac)}°`;$('observation-value').textContent=`当前 f=${fmt(r.value)}；∇f=[${r.gradient.map(fmt)}]；沿负梯度的一阶变化 = ${fmt(-norm*norm)}。`;
  legend([['负梯度方向',blue],['正目标等高线',gray],['负目标等高线',pink]]);table([['H 的特征值',[1,q]],['观察点',point],['梯度',r.gradient],['方向导数',-norm*norm]]);
 }
 if(mode==='8.2'){
  const n=Math.floor(frac*30),extent=Math.max(2,...data.points.flat().map(Math.abs))*1.08,logs=data.residuals.map(v=>Math.log10(Math.max(v,1e-15))),a=axes(left,{xmin:-extent,xmax:extent,ymin:-extent,ymax:extent,xlabel:'x₁ / 1',ylabel:'x₂ / 1'}),b=axes(right,{xmin:0,xmax:30,ymin:Math.min(...logs)-.3,ymax:Math.max(...logs)+.3,xlabel:'更新次数 n',ylabel:'log₁₀ 梯度范数'});
  curve(left,data.points.slice(0,n+1),a,blue);dot(left,data.points[n],a,blue);dot(left,[0,0],a,green,4);curve(right,logs.slice(0,n+1).map((v,i)=>[i,v]),b,p.ratio>=2?pink:blue);dot(right,[n,logs[n]],b,p.ratio>=2?pink:blue);
  $('value').textContent=fmt(data.residuals[n]);$('time-readout').textContent=`第 ${n}/30 次更新`;$('observation-value').textContent=`η=${fmt(data.step)}；两个误差因子=[${data.factors.map(fmt)}]。${p.ratio<2?'满足全初值收敛的谱条件。':'第二方向绝对因子≥1，不能保证衰减。'}`;
  legend([['迭代路径',blue],['解析最小点',green],['不衰减的残差',pink]]);table([['更新次数',n],['当前点',data.points[n]],['目标',data.values[n]],['梯度范数',data.residuals[n]],['本页预算',30]]);
 }
 if(mode==='8.3'){
  const penalty=p.penalty*frac,current=shrinkage(penalty),a=axes(left,{xmin:0,xmax:1.8,ymin:0,ymax:1.6,xlabel:'惩罚 λ / 1',ylabel:'岭系数 / 1'}),b=axes(right,{xmin:0,xmax:1.8,ymin:0,ymax:1.6,xlabel:'惩罚 λ / 1',ylabel:'L1系数 / 1'});
  for(let j=0;j<2;j++){const color=j?pink:blue;for(const[chart,axis,key,dash]of [[left,a,'ridge',false],[right,b,'sparse',true]]){curve(chart,Array.from({length:101},(_,i)=>{const lam=penalty*i/100;return[lam,shrinkage(lam)[key][j]];}),axis,color,dash);dot(chart,[penalty,current[key][j]],axis,color);}}
  $('value').textContent=fmt(penalty);$('time-readout').textContent=`扫描到 λ=${fmt(penalty)}`;$('observation-value').textContent=`岭系数 [${current.ridge.map(fmt)}]；L1系数 [${current.sparse.map(fmt)}]。${current.sparse.filter(x=>x===0).length} 个精确零。`;
  legend([['候选项1',blue],['候选项2',pink]]);table([['当前λ',penalty],['岭系数',current.ridge],['L1系数',current.sparse],['设计限制','XᵀX/n=I，不能照搬到相关字典']]);
 }
 if(mode==='8.4'){
  const B=4+(p.budget-4)*frac,r=allocation(B),polygon=feasiblePolygon(B),a=axes(left,{xmin:0,xmax:3.3,ymin:0,ymax:3.3,xlabel:'第一路流量 / 1',ylabel:'第二路流量 / 1'}),b=axes(right,{xmin:.5,xmax:5,ymin:-12.6,ymax:-4,xlabel:'总预算 B / 1',ylabel:'最小目标 / 1'});
  for(const level of [.5,1,2,4,8])curve(left,Array.from({length:361},(_,i)=>{const t=i*Math.PI/180;return[2+Math.sqrt(level)*Math.cos(t),2+Math.sqrt(level/2)*Math.sin(t)];}),a,gray,true,1);
  if(polygon.length)left.append(node('polygon',{points:polygon.map(([x,y])=>`${a.x(x)},${a.y(y)}`).join(' '),fill:blue,'fill-opacity':.14,stroke:blue,'stroke-width':2}));
  curve(left,Array.from({length:201},(_,i)=>{const x=i*3.3/200;return[x,B-x];}),a,pink,true,2);if(r.point)dot(left,r.point,a,pink,6);
  const samples=Array.from({length:181},(_,i)=>{const budget=.5+i*.025;return[budget,allocation(budget).value??NaN];});curve(right,samples,b,green);if(r.point)dot(right,[B,r.value],b,pink,6);
  $('value').textContent=r.point?'可行 · 已核对最优性':'不可行 · 最低需求超预算';$('time-readout').textContent=`当前预算 ${fmt(B)}`;$('observation-value').textContent=r.point?`配置 [${r.point.map(fmt)}]；目标 ${fmt(r.value)}；最大KKT残差 ${fmt(Math.max(...r.residuals))}。`:`最低需求0.5+0.5=1 > ${fmt(B)}。不存在满足全部硬约束的配置。`;
  legend([['可行区域',blue],['最优点与预算边',pink],['预算—代价关系',green]]);table([['预算',B],['状态',r.status],['最优配置',r.point??'不存在'],['目标',r.value],['原始／对偶／驻点／互补残差',r.residuals??'无解，不计算残差']]);
 }
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent=`探索未能运行：${error.message}。请刷新重试。`;for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;playback?.pause();}
function guard(fn){try{fn();}catch(error){failed(error);}}
async function start(){
 ({current:chapter}=await mountShell('explore'));mode=chapter?.id;const def=definitions[mode];if(!def)throw Error('本章没有此探索页');$('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';for(const id of ['title','question','explanation','formula','assumptions'])$(id).textContent=def[id];$('chart-heading').textContent=def.heading;$('value-label').textContent=def.label;$('chart-note').textContent=def.note;$('preset-note').textContent='先观察指定条件；播放可从起点逐步展开。每个对照按钮都支持切换回去。';controls();recompute();
 playback=createPlayback({duration:100,speed:10,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':'播放';$('play-status').textContent=reason==='playing'?'正在播放，观察图形与读数同步变化。':reason==='ended'?'已展示指定条件；点击播放可从起点观察。':reason==='hidden'?'切离页面后已暂停。':'已暂停，可拖动观察位置。';}});
 $('play').addEventListener('click',()=>guard(()=>playback.running?playback.pause():playback.play()));$('replay').addEventListener('click',()=>guard(()=>{playback.seek(0);playback.play();}));$('timeline').addEventListener('input',()=>guard(()=>playback.seek(Number($('timeline').value))));
 $('alternate').addEventListener('click',()=>guard(()=>{if(mode==='8.1')set({curvature:p.curvature<0?2:-1});if(mode==='8.2')set({ratio:p.ratio>=2?1.5:2.2});if(mode==='8.3')set({penalty:p.penalty>=1.4?.3:1.6});if(mode==='8.4')set({budget:p.budget<1?2:.8});}));$('reset').addEventListener('click',()=>guard(()=>{controls();recompute();}));document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause('hidden');});
 for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
 playback.seek(100);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';
}
start().catch(failed);
