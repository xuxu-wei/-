import {mountShell,el} from '../shared/course-shell.mjs';
import {createPlayback} from '../shared/playback.mjs';
import {theme} from '../shared/theme.mjs';
import {lorenzPath,directedSection,tangentGrowth} from './lorenz-model.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',blue=theme.data['1'],pink=theme.data['2'],gray=theme.data.reference;
const defaults={sigma:10,rho:28,beta:8/3,x:1,y:1,z:1,digits:6,h:.01,end:40,burn:10,interval:.1};
let p={...defaults},rows=[],other=[],distances=[],hits=[],growth=[],playback,chapter,time=0,clickTargets=[],timePanels=[];
const fmt=x=>Number.isFinite(x)?Number(x.toPrecision(6)).toString():'—';
function svg(tag,attrs={},text){const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function field(key,label,min,max,step){const box=el('div',undefined,'slider'),lab=el('label',`${label} [${min}, ${max}]`),input=el('input');lab.htmlFor=key;Object.assign(input,{id:key,type:'number',min,max,step,value:p[key]});input.addEventListener('change',()=>{if(!input.checkValidity()||!Number.isFinite(Number(input.value))){input.reportValidity();return;}p[key]=Number(input.value);guard(recompute);});box.append(lab,input);$('sliders').append(box);}
function failed(error){playback?.pause();$('loading-note').hidden=false;$('loading-note').textContent='本次计算未完成：'+error.message+'。请调整条件或恢复起始条件。';$('loading-note').classList.add('error');for(const id of ['play','replay','timeline'])$(id).disabled=true;}
function guard(fn){try{fn();}catch(error){failed(error);}}
function set(values){Object.assign(p,values);for(const key of Object.keys(values))$(key).value=p[key];guard(recompute);}
function recompute(){
 playback?.pause();if(p.burn>=p.end)throw Error('暂态结束必须早于观察终点');
 const steps=Math.round(p.end/p.h);p.end=steps*p.h;$('end').value=p.end;const initial=[p.x,p.y,p.z];
 rows=lorenzPath(initial,p.sigma,p.rho,p.beta,p.h,steps);
 if($('comparison').value==='step'){const fine=lorenzPath(initial,p.sigma,p.rho,p.beta,p.h/2,steps*2);other=rows.map((_,i)=>fine[2*i]);}
 else other=lorenzPath([p.x+10**(-p.digits),p.y,p.z],p.sigma,p.rho,p.beta,p.h,steps);
 distances=rows.map((v,i)=>[i*p.h,Math.hypot(...v.map((x,j)=>x-other[i][j]))]);
 hits=directedSection(rows.map((_,i)=>i*p.h),rows,p.rho-1,p.burn);
 const segmentSteps=Math.max(1,Math.round(p.interval/p.h)),burnSteps=Math.round(p.burn/p.h);
 growth=tangentGrowth(initial,p.sigma,p.rho,p.beta,p.h,steps,segmentSteps,burnSteps);
 $('preset-note').textContent=`当前 ρ=${fmt(p.rho)}，初值 (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})；${$('comparison').value==='step'?'距离只比较 h 与 h/2 的共同时间点。':'距离只比较 x₀ 与 x₀+ε；两条轨迹使用相同步长。'}`;
 $('alternate').textContent=initial.every(x=>x===0)?'切换回普通初值 (1,1,1)':'切换到精确原点';
 for(const button of document.querySelectorAll('[data-rho]'))button.setAttribute('aria-pressed',Number(button.dataset.rho)===p.rho?'true':'false');
 $('protocol').textContent=`σ=${fmt(p.sigma)}，ρ=${fmt(p.rho)}，β=${fmt(p.beta)}；h=${p.h}；终点=${p.end}；暂态=${fmt(burnSteps*p.h)}；实际归一化间隔=${fmt(segmentSteps*p.h)} τ；方向 (1,0,0)；ε=${10**(-p.digits)}。步数取整后的实际时间已显示。`;
 const table=el('table'),head=el('tr');for(const label of ['交点时间 / τ','x','y','z','距上次 / τ'])head.append(el('th',label));table.append(head);
 for(let i=Math.max(0,hits.length-12);i<hits.length;i++){const tr=el('tr');for(const x of [...hits[i],i?hits[i][0]-hits[i-1][0]:NaN])tr.append(el('td',fmt(x)));table.append(tr);}$('value-table').replaceChildren(el('p',`完整窗共 ${hits.length} 个正向交点；下表列最后至多 12 个。`),table);
 playback=createPlayback({duration:p.end,speed:3,update:draw,failed,changed:reason=>{$('play').textContent=reason==='playing'?'暂停':reason==='ended'?'再次播放':'播放';$('play-status').textContent=reason==='playing'?'正在播放；点击曲线或拖动时间条可暂停定位。':reason==='ended'?'已到终点，可重播。':'已暂停；模型条件改变后从起点重新观察。';}});
 $('timeline').max=p.end;$('timeline').step=p.h;playback.seek(0);for(const id of ['play','replay','timeline'])$(id).disabled=false;$('loading-note').hidden=true;
}
function panel(x,y,w,h,xmin,xmax,ymin,ymax,title,xlabel,ylabel){const chart=$('lorenz-chart');if(xmax-xmin<1e-12){xmin-=1;xmax+=1;}if(ymax-ymin<1e-12){ymin-=1;ymax+=1;}const px=v=>x+(v-xmin)/(xmax-xmin)*w,py=v=>y+h-(v-ymin)/(ymax-ymin)*h;
 chart.append(svg('text',{x,y:y-15,'font-weight':'600'},title),svg('path',{d:`M${x},${y}V${y+h}H${x+w}`,stroke:'#b7bdc2',fill:'none'}));
 for(let i=0;i<3;i++){const a=xmin+(xmax-xmin)*i/2,b=ymin+(ymax-ymin)*i/2;chart.append(svg('text',{x:px(a),y:y+h+18,'text-anchor':'middle'},fmt(a)),svg('text',{x:x-8,y:py(b)+4,'text-anchor':'end'},fmt(b)));}
 chart.append(svg('text',{x:x+w/2,y:y+h+39,'text-anchor':'middle'},xlabel),svg('text',{x,y:y-32},ylabel));return {px,py,x,y,w,h,xmin,xmax};}
function line(points,a,color,dash=false){if(!points.length)return;const stride=Math.max(1,Math.floor(points.length/1500)),sample=points.filter((_,i)=>i%stride===0);if(sample.at(-1)!==points.at(-1))sample.push(points.at(-1));$('lorenz-chart').append(svg('polyline',{points:sample.map(v=>`${a.px(v[0])},${a.py(v[1])}`).join(' '),fill:'none',stroke:color,'stroke-width':1.4,...(dash?{'stroke-dasharray':'5 3'}:{})}));}
function dot(x,y,a,color=blue){$('lorenz-chart').append(svg('circle',{cx:a.px(x),cy:a.py(y),r:4,fill:color,stroke:'#fff','stroke-width':1}));}
function extent(values){let lo=Infinity,hi=-Infinity;for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}const padding=Math.max(.1,(hi-lo)*.06);return [lo-padding,hi+padding];}
function draw(t){time=t;const i=Math.min(rows.length-1,Math.floor((t+1e-10)/p.h)),chart=$('lorenz-chart');chart.replaceChildren();clickTargets=[];timePanels=[];
 const theta=Number($('yaw').value)*Math.PI/180,project=v=>[v[0]*Math.cos(theta)+v[1]*Math.sin(theta),v[2]-.2*(-v[0]*Math.sin(theta)+v[1]*Math.cos(theta))];
 const projected=rows.map(project),xe=extent(projected.map(v=>v[0])),ye=extent(projected.map(v=>v[1]));
 const a=panel(70,58,430,195,...xe,...ye,'三维轨迹的正交投影','水平投影坐标 / 1','旋转后的 z 方向 / 1');line(projected.slice(0,i+1),a,blue);line(other.slice(0,i+1).map(project),a,pink,true);dot(...projected[i],a);
 for(let k=0;k<=i;k+=Math.max(1,Math.floor((i+1)/600)))clickTargets.push([a.px(projected[k][0]),a.py(projected[k][1]),k*p.h]);
 const b=panel(635,58,410,195,...extent(rows.map(v=>v[0])),...extent(rows.map(v=>v[2])),'原坐标 x-z 投影','x / 1','z / 1');line(rows.slice(0,i+1).map(v=>[v[0],v[2]]),b,blue);dot(rows[i][0],rows[i][2],b);
 const logs=distances.map(v=>[v[0],Math.log10(Math.max(v[1],1e-16))]),d=panel(70,375,430,165,0,p.end,...extent(logs.map(v=>v[1])),$('comparison').value==='step'?'只改步长的差异':'只改初值的距离','time / τ','log10(distance / 1)，零显示在 −16');line(logs.slice(0,i+1),d,blue);dot(...logs[i],d);timePanels.push(d);
 const visible=hits.filter(v=>v[0]<=t),hx=extent(hits.length?hits.map(v=>v[1]):[-1,1]),hy=extent(hits.length?hits.map(v=>v[2]):[-1,1]);
 const e=panel(635,375,410,165,...hx,...hy,`z=${fmt(p.rho-1)} 正向截面 · 当前 ${visible.length} 点`,'crossing x / 1','crossing y / 1');for(const v of visible){dot(v[1],v[2],e);clickTargets.push([e.px(v[1]),e.py(v[2]),v[0]]);}
 const shown=growth.filter(v=>v[0]<=t),g=panel(70,660,975,155,0,p.end,...extent(growth.length?growth.map(v=>v[1]):[-1,1]),'预热后给定方向的累计增长；不是严格渐近指数','end time / τ','对数伸长 / τ');line(shown,g,blue);if(shown.length)dot(...shown.at(-1),g);timePanels.push(g);
 $('time-readout').textContent=`τ=${fmt(t)}`;$('timeline').value=t;$('readout').textContent=`当前状态 (${rows[i].map(fmt).join(', ')})；距离 ${fmt(distances[i][1])}；${shown.length?'累计方向增长 '+fmt(shown.at(-1)[1])+' / τ':'尚未结束方向预热'}。蓝实线主轨迹，玫红虚线对照。`;
}
async function start(){({current:chapter}=await mountShell('explore'));if(chapter?.id!=='4.6')throw Error('请从 4.6 章的探索入口打开');
 for(const row of [['sigma','σ / 1',1,16,.5],['rho','ρ / 1',.5,35,.5],['beta','β / 1',.5,4,'any'],['x','x₀ / 1',-20,20,.1],['y','y₀ / 1',-20,20,.1],['z','z₀ / 1',0,50,.1],['digits','ε=10⁻ᵏ 的 k',3,10,1],['h','h / τ',.005,.02,.005],['end','观察终点 / τ',20,80,1],['burn','暂态结束 / τ',0,30,1],['interval','归一化间隔 / τ',.05,.5,.05]])field(...row);
 for(const button of document.querySelectorAll('[data-rho]'))button.addEventListener('click',()=>set({rho:Number(button.dataset.rho)}));
 $('alternate').addEventListener('click',()=>set([p.x,p.y,p.z].every(x=>x===0)?{x:1,y:1,z:1}:{x:0,y:0,z:0}));$('reset').addEventListener('click',()=>{$('comparison').value='initial';set(defaults);});$('comparison').addEventListener('change',()=>guard(recompute));
 $('play').addEventListener('click',()=>playback.running?playback.pause():playback.play());$('replay').addEventListener('click',()=>{playback.seek(0);playback.play();});$('timeline').addEventListener('input',()=>playback.seek(Number($('timeline').value)));$('yaw').addEventListener('input',()=>{$('yaw-value').value=$('yaw').value+'°';draw(time);});
 $('lorenz-chart').addEventListener('click',event=>{const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*1100,y=(event.clientY-rect.top)/rect.height*890;const a=timePanels.find(a=>x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h);if(a){playback.seek((x-a.x)/a.w*p.end);return;}let best=null,dist=225;for(const hit of clickTargets){const d=(x-hit[0])**2+(y-hit[1])**2;if(d<dist){dist=d;best=hit;}}if(best)playback.seek(best[2]);});
 $('download').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({parameters:p,comparison:$('comparison').value,states:rows,distances,section:hits,growth},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='lorenz-experiment.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 for(const lesson of chapter.lessons){const button=el('button','在默认 IDE 打开：'+lesson.title);button.addEventListener('click',async()=>{button.disabled=true;try{const session=await(await fetch('/api/session')).json(),response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})}),result=await response.json();$('open-status').textContent=result.message||result.error;}catch{$('open-status').textContent='本机连接中断，请恢复后重试。';}finally{button.disabled=false;}});$('notebooks').append(button);}
 recompute();$('controls').disabled=false;document.querySelector('.exploration').hidden=false;document.body.dataset.ready='true';document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause();});
}
start().catch(failed);
