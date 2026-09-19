import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {caRun,payoff,replicator,diffuse,alternate} from './model.mjs';

const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const blue=theme.data['1'],pink=theme.data['2'],green=theme.data['3'],gray=theme.data.reference;
const fmt=v=>typeof v==='number'?Number(v.toPrecision(4)).toString():String(v);
const svg=(tag,attrs={},value)=>{const x=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))x.setAttribute(k,v);if(value!==undefined)x.textContent=value;return x;};
let chapter,mode,settings={},playback;
const definitions={
 '12.1':{
  title:'同一局部规则，更新顺序会改变结果吗？',
  question:'先预测：相同二值初态和每轮相同的更新次数，同步双缓冲与左到右原地更新会画出同一图案吗？',
  explanation:'左图逐轮揭示细胞激活状态，右图是激活比例。切换同步/异步只改变读写时序，边界滑块单独改变邻域。',
  formula:'xᵢ⁺=左邻居 XOR 右邻居；同步只读旧行，异步沿指定顺序立即写回。',
  heading:'局部状态与群体比例',label:'当前激活比例',
  assumptions:'31格、二值异或规则；每轮均更新每格一次。周期边界首尾相邻；固定边界外为0。蓝格为激活，图案不代表真实细胞测量。',
  note:'左图按位置和轮次显示状态；右图为同一行激活比例。切换方式或边界后先预测再重播。',
  controls:[['asynchronous','更新：0同步 / 1左到右异步',0,1,1,0],['boundary','边界：0周期 / 1固定',0,1,1,0]]},
 '12.2':{
  title:'收益相同，频率一定不变吗？',
  question:'先预测：两种收益表分别给出“类型1始终更高”和“内部等收益点”，p=0.25 的频率会朝哪个方向移动？',
  explanation:'左图是两类收益随频率变化，右图是连续复制动态的显式轨迹。表格可往返切换；收益不是个体繁殖概率。',
  formula:'f₀=pM₀₀+(1−p)M₀₁；f₁=pM₁₀+(1−p)M₁₁；dp/dt=p(1−p)(f₀−f₁)。',
  heading:'相遇收益与类型频率',label:'当前类型0频率 p',
  assumptions:'充分混合、连续频率、给定2×2收益表；右图固定步长0.05 T。有限个体还需繁殖与抽样规则。',
  note:'左图完整显示 f₀ 与 f₁；右图逐步显示 p(t)。交叉点导数为0，稳定性还要看附近方向。',
  controls:[['game','收益表：0类型1优势 / 1内部平衡',0,1,1,0],['p0','初始类型0频率 p₀',.1,.9,.05,.25]]},
 '12.4':{
  title:'总量守恒能证明扩散模拟可信么？',
  question:'先预测：周期与无通量边界下，端点物质去哪儿？把步长调过 h=0.5 后，总量和非负性会怎样？',
  explanation:'左图逐步揭示一维网格状态，右图显示最小格值与总量。边界改变通道，步长改变数值行为；双组分反应在 Notebook 推导。',
  formula:'cᵢ⁺=(1−2h)cᵢ+h(cᵢ₋₁+cᵢ₊₁)；本页 D=Δx=1，纯扩散保正条件 0≤h≤0.5。',
  heading:'扩散边界、步长与非负性',label:'当前最小格值 / U',
  assumptions:'30格、左端初始2 U，其余0；无反应和外部通量。周期边界首尾相接，无通量边界反射端点。大步长负值是数值错误。',
  note:'蓝色为正总量，粉色为负数值伪影。右图总量近似水平只说明收支守恒；仍须看最小格值与网格细化。',
  controls:[['boundary','边界：0周期 / 1无通量',0,1,1,0],['dt','显式时间步 h / T',.1,.55,.05,.2]]}
};
function controls(){settings={};$('sliders').replaceChildren();for(const[key,label,min,max,step,value]of definitions[mode].controls){
 settings[key]=value;const row=el('div',null,'slider'),caption=el('label',label),input=el('input'),output=el('output',fmt(value));
 input.type='range';input.id='parameter-'+key;input.min=min;input.max=max;input.step=step;input.value=value;
 caption.htmlFor=input.id;output.id='parameter-value-'+key;
 input.addEventListener('input',()=>guard(()=>{settings[key]=Number(input.value);output.textContent=fmt(settings[key]);recompute();}));
 row.append(caption,output,input);$('sliders').append(row);
}}
function set(values){Object.assign(settings,values);for(const[key,value]of Object.entries(values)){$('parameter-'+key).value=value;$('parameter-value-'+key).textContent=fmt(value);}recompute();}
function recompute(){const labels={
 '12.1':settings.asynchronous?'恢复同步双缓冲':'切换为左到右异步',
 '12.2':settings.game?'恢复类型1优势收益表':'切换为内部平衡收益表',
 '12.4':settings.boundary?'恢复周期边界':'切换为无通量边界'};
 $('alternate').textContent=labels[mode];playback?.pause();playback?playback.seek(100):draw(100);}
function axes(chart,{xmin,xmax,ymin,ymax,xlabel,ylabel}){const x=v=>66+444*(v-xmin)/(xmax-xmin),y=v=>310-264*(v-ymin)/(ymax-ymin);
 for(let j=0;j<=4;j++){const v=ymin+(ymax-ymin)*j/4;chart.append(svg('line',{x1:66,y1:y(v),x2:510,y2:y(v),stroke:gray,opacity:.15}),svg('text',{x:57,y:y(v)+5,'text-anchor':'end','font-size':13,fill:gray},fmt(v)));}
 for(let j=0;j<=4;j++){const v=xmin+(xmax-xmin)*j/4;chart.append(svg('text',{x:x(v),y:337,'text-anchor':'middle','font-size':13,fill:gray},fmt(v)));}
 chart.append(svg('text',{x:288,y:376,'text-anchor':'middle','font-size':15,fill:gray},xlabel),svg('text',{x:66,y:25,'font-size':15,fill:gray},ylabel));
 return{x,y,xmin,xmax,ymin,ymax};}
function curve(chart,points,a,color){let path='',open=false;for(const[x,y]of points){if(!Number.isFinite(x+y)||x<a.xmin||x>a.xmax||y<a.ymin||y>a.ymax){open=false;continue;}path+=(open?'L':'M')+a.x(x)+','+a.y(y)+' ';open=true;}chart.append(svg('path',{d:path,fill:'none',stroke:color,'stroke-width':2.8,'stroke-linejoin':'round'}));}
function dot(chart,point,a,color){if(!point||!Number.isFinite(point[0]+point[1]))return;chart.append(svg('circle',{cx:a.x(point[0]),cy:a.y(point[1]),r:5,fill:color,stroke:'white','stroke-width':1.5}));}
function table(rows){const tab=el('table'),body=el('tbody');for(const[key,value]of rows){const row=el('tr');row.append(el('th',key),el('td',Array.isArray(value)?value.map(fmt).join('，'):fmt(value)));body.append(row);}tab.append(body);$('value-table').replaceChildren(tab);}
function legend(items){$('legend').replaceChildren();for(const[label,color]of items){const item=el('span'),swatch=el('i');swatch.style.background=color;item.append(swatch,document.createTextNode(label));$('legend').append(item);}}
function heatmap(chart,rows,shown,maximum){const width=444/rows[0].length,height=264/rows.length;for(let t=0;t<=shown;t++)for(let i=0;i<rows[t].length;i++){
 const value=rows[t][i],color=value<0?pink:blue,opacity=value<0?Math.min(.2+Math.abs(value),.95):Math.min(.08+Math.max(0,value)/maximum*.85,.96);
 chart.append(svg('rect',{x:66+i*width,y:46+t*height,width:width+.2,height:height+.2,fill:color,opacity}));}
 chart.append(svg('text',{x:288,y:376,'text-anchor':'middle','font-size':15,fill:gray},'格位置'),svg('text',{x:66,y:25,'font-size':15,fill:gray},'更新轮次 / 步'));}
function draw(progress){const fraction=progress/100,left=$('chart'),right=$('detail-chart'),def=definitions[mode];$('timeline').value=progress;$('play-counter').textContent='进度 '+progress.toFixed(1)+'%';
 for(const[chart,prefix]of [[left,'svg'],[right,'detail']])chart.replaceChildren(svg('title',{id:prefix+'-title'},def.heading),svg('desc',{id:prefix+'-desc'},def.note));
 if(mode==='12.1'){
  const state=Array(31).fill(0);for(const i of [9,10,16,23])state[i]=1;
  const result=caRun(state,settings.boundary?'fixed':'periodic',settings.asynchronous?'async':'sync',25),n=Math.floor(fraction*25);
  heatmap(left,result.rows,n,1);const a=axes(right,{xmin:0,xmax:25,ymin:0,ymax:1,xlabel:'完整扫过次数',ylabel:'激活比例'});
  curve(right,result.density.slice(0,n+1).map((v,i)=>[i,v]),a,pink);dot(right,[n,result.density[n]],a,pink);
  $('value').textContent=fmt(result.density[n]);$('time-readout').textContent='第 '+n+' 轮';
  $('observation-value').textContent='当前激活 '+result.rows[n].reduce((a,b)=>a+b,0)+' / 31 格；每轮各格更新一次。';
  legend([['激活格',blue],['激活比例',pink]]);table([['更新方式',settings.asynchronous?'左到右异步':'同步双缓冲'],['边界',settings.boundary?'固定':'周期'],['激活格数',result.rows[n].reduce((a,b)=>a+b,0)],['激活比例',result.density[n]]]);
 }
 if(mode==='12.2'){
  const matrix=settings.game?[[1,2],[3,0]]:[[3,0],[4,1]],path=replicator(matrix,settings.p0),n=Math.floor(fraction*160);
  const a=axes(left,{xmin:0,xmax:1,ymin:0,ymax:4.2,xlabel:'类型0频率 p',ylabel:'平均收益'}),grid=Array.from({length:101},(_,i)=>i/100);
  curve(left,grid.map(p=>[p,payoff(matrix,p).f0]),a,blue);curve(left,grid.map(p=>[p,payoff(matrix,p).f1]),a,pink);
  dot(left,[path[n],payoff(matrix,path[n]).f0],a,blue);dot(left,[path[n],payoff(matrix,path[n]).f1],a,pink);
  const b=axes(right,{xmin:0,xmax:8,ymin:0,ymax:1,xlabel:'时间 / T',ylabel:'类型0频率 p'});
  curve(right,path.slice(0,n+1).map((p,i)=>[i*.05,p]),b,green);dot(right,[n*.05,path[n]],b,green);
  $('value').textContent=fmt(path[n]);$('time-readout').textContent='时刻 '+fmt(n*.05)+' T';
  $('observation-value').textContent='当前收益 f₀='+fmt(payoff(matrix,path[n]).f0)+'、f₁='+fmt(payoff(matrix,path[n]).f1)+'；导数='+fmt(payoff(matrix,path[n]).rate)+'。';
  legend([['类型0收益',blue],['类型1收益',pink],['类型0频率',green]]);
  table([['收益表',settings.game?'内部平衡例':'类型1优势例'],['当前 p',path[n]],['f₀',payoff(matrix,path[n]).f0],['f₁',payoff(matrix,path[n]).f1],['dp/dt',payoff(matrix,path[n]).rate]]);
 }
 if(mode==='12.4'){
  const result=diffuse([2,...Array(29).fill(0)],settings.dt,settings.boundary?'noflux':'periodic',30),n=Math.floor(fraction*30);
  heatmap(left,result.rows,n,2);const a=axes(right,{xmin:0,xmax:30,ymin:-1,ymax:2.3,xlabel:'步',ylabel:'最小格值 / 总量 U'});
  curve(right,result.minimum.slice(0,n+1).map((v,i)=>[i,v]),a,pink);curve(right,result.mass.slice(0,n+1).map((v,i)=>[i,v]),a,blue);
  if(result.minimum[n]>=-1&&result.minimum[n]<=2.3)dot(right,[n,result.minimum[n]],a,pink);dot(right,[n,result.mass[n]],a,blue);
  $('value').textContent=fmt(result.minimum[n]);$('time-readout').textContent='第 '+n+' 步';
  $('observation-value').textContent='全图总量 '+fmt(result.mass[n])+' U；'+(result.minimum[n]<0?'负格是数值伪影。':'当前各格非负。');
  legend([['总量',blue],['最小格值 / 负值伪影',pink]]);
  table([['边界',settings.boundary?'无通量':'周期'],['时间步 h',settings.dt],['当前最小格值',result.minimum[n]],['全图总量',result.mass[n]],['保正步长满足',settings.dt<=.5?'是':'否']]);
 }
}
function failed(error){$('loading-note').hidden=false;$('loading-note').classList.add('error');$('loading-note').textContent='探索未能运行：'+error.message+'。请刷新重试。';for(const id of ['controls','play','replay','timeline'])$(id).disabled=true;playback?.pause();}
function guard(fn){try{fn();}catch(error){failed(error);}}
async function start(){({current:chapter}=await mountShell('explore'));mode=chapter?.id;const def=definitions[mode];if(!def)throw Error('本章没有此探索页');
 $('eyebrow').textContent=chapter.id+' 章 · 可视化与探索';for(const id of ['title','question','explanation','formula','assumptions'])$(id).textContent=def[id];
 $('chart-heading').textContent=def.heading;$('value-label').textContent=def.label;$('chart-note').textContent=def.note;
 $('preset-note').textContent='先预测再播放；对照按钮可往返切换，滑块可随时重新设定。';controls();recompute();
 playback=createPlayback({duration:100,speed:10,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':'播放';$('play-status').textContent=reason==='playing'?'正在播放，观察图形与数值变化。':reason==='ended'?'已展示完整条件；点击播放可从起点观察。':reason==='hidden'?'切离页面后已暂停。':'已暂停，可拖动观察位置。';}});
 $('play').addEventListener('click',()=>guard(()=>playback.running?playback.pause():playback.play()));
 $('replay').addEventListener('click',()=>guard(()=>{playback.seek(0);playback.play();}));
 $('timeline').addEventListener('input',()=>guard(()=>playback.seek(Number($('timeline').value))));
 $('alternate').addEventListener('click',()=>guard(()=>set(alternate(mode,settings))));
 $('reset').addEventListener('click',()=>guard(()=>{controls();recompute();}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause('hidden');});
 for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
 playback.seek(100);for(const id of ['controls','play','replay','timeline'])$(id).disabled=false;
 document.querySelector('.exploration').hidden=false;$('loading-note').hidden=true;document.body.dataset.ready='true';document.title=chapter.title+' · 可视化与探索';}
start().catch(failed);
