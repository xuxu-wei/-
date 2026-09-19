import {mountShell,el} from '../shared/course-shell.mjs';
import {nodeProgress,chooseResumePart,mixColors,categoryColor,getView,directNeighborhood} from './graph-model.mjs';
import {createLayout,tickLayout,setPinned,releasePinned} from './physics.mjs';
import {CosmosRenderer} from './renderer.mjs';
import {zoomStep} from './zoom.mjs';
import {getTheme,applyTheme} from '../shared/appearance.mjs';
import {sceneProjection} from './scene-layout.mjs';
import {transitionFrame} from './transition.mjs';

const $=id=>document.getElementById(id),body=document.body;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const storage={get(key){try{return localStorage.getItem(key);}catch{return null;}},set(key,value){try{localStorage.setItem(key,value);}catch{}}};
const INTRO_KEY='systems-science:home-intro:v1';
let graph,lookup,progress={},parentId=null,view,layout,renderer,selected,hovered=null,neighbors=new Set(),buttons=new Map(),paused=reduced.matches,clock=0,last=0,rotation=0,intro=null,transition=null,drag=null,lastDrag=0,frame=0,progressLoaded=false,progressSignature='';
let theme=getTheme(),zoomState={scale:1,lastTransitionAt:null},wheelActiveUntil=0,pan=null;
let camera={scale:1,x:0,y:0};
let sceneBounds={top:290,bottom:650};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function compatibleRenderer(reason){
  console.warn('星图使用兼容绘制。',reason);
  const old=$('cosmos'),canvas=old.cloneNode(false);old.replaceWith(canvas);
  try{renderer?.dispose?.();}catch{}
  renderer=new CosmosRenderer(canvas);canvas.dataset.renderer='canvas';renderer.setTheme(theme==='dark');
  return renderer;
}
async function createRenderer(){
  try{
    const {GPURenderer}=await import('./gpu-renderer.mjs');
    renderer=new GPURenderer($('cosmos'));$('cosmos').dataset.renderer='webgl';
    $('cosmos').addEventListener('webglcontextlost',event=>{event.preventDefault();compatibleRenderer('图形上下文丢失');if(layout)renderScene();},{once:true});
  }catch(error){compatibleRenderer(error);}
}
function status(text){$('sky-status').textContent=text;}
function label(node){return node.kind==='part'?`第 ${node.id} 篇`:node.kind==='chapter'?`${node.id} 章`:node.lessonNumber?`${node.lessonNumber} 小节`:'知识点';}
function stateOf(node){return nodeProgress(node,progress);}
function stateText(node){const s=stateOf(node);if(!progressLoaded)return'进度暂未读取';if(!node.available)return'教学设计 · 尚未发布';return`${node.kind==='part'?'本篇练习（含综合）':s.scope||'练习'} ${s.passed}/${s.total} 题${s.incomplete?' · 部分记录不可读取':''}`;}
function activeNodes(){return layout.nodes.map(n=>{const source=lookup.get(n.id),s=stateOf(source);return{...n,...source,color:mixColors(source.categories,graph.taxonomy,theme),glow:progressLoaded?s.glow:0};});}
function themeUpdate(){body.dataset.skyTheme=theme;renderer?.setTheme(theme==='dark');$('theme-toggle').replaceChildren(document.createTextNode(theme==='dark'?'☼ 浅色':'☾ 星空'));$('theme-toggle').setAttribute('aria-label',theme==='dark'?'切换到浅色主题':'切换到星空主题');if(graph){$('taxonomy').replaceChildren(...graph.taxonomy.map(categoryTag));if(hovered&&buttons.has(hovered))setHover(lookup.get(hovered),buttons.get(hovered));}if(renderer&&layout)renderScene();}
function motionUpdate(){const b=$('motion-toggle');b.textContent=paused?'▷ 继续星空':'Ⅱ 暂停星空';b.setAttribute('aria-pressed',String(paused));}
function routeFor(id){const n=lookup.get(id);return n?`#${n.kind}=${encodeURIComponent(id)}`:location.pathname;}
function breadcrumb(){const nav=$('sky-breadcrumb');nav.replaceChildren();const root=el('button','全景');root.type='button';root.addEventListener('click',()=>navigate(null));if(!parentId)root.setAttribute('aria-current','page');nav.append(root);if(parentId){const n=lookup.get(parentId),p=n.kind==='chapter'?lookup.get(n.parentId):n;for(const item of [p,...(n.kind==='chapter'?[n]:[])]){nav.append(el('span','/'));const b=el('button',`${label(item)} · ${item.title}`);b.type='button';if(item.id===parentId)b.setAttribute('aria-current','page');b.addEventListener('click',()=>navigate(item.id));nav.append(b);}}
  const target=parentId?lookup.get(parentId):null;
  for(const link of document.querySelectorAll('.course-tree a')){
    if(link.getAttribute('aria-current')==='location')link.removeAttribute('aria-current');
    if(target&&link.getAttribute('href')===target.url){link.setAttribute('aria-current','location');let ancestor=link.parentElement;while(ancestor&&!ancestor.classList.contains('course-tree')){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}}
  }
}
function fillCard(node){if(!node)return;selected=node.id;const s=stateOf(node),index=view.nodes.findIndex(n=>n.id===node.id),unit=node.kind==='part'?'篇':node.kind==='chapter'?'章':'个知识点';$('focus-kicker').textContent=`第 ${index+1} / ${view.nodes.length} ${unit}`;$('focus-title').textContent=node.title;
  const p=$('focus-progress');p.replaceChildren(el('span',stateText(node)));const track=el('div',undefined,'sky-progress-track'),fill=el('i');fill.style.width=`${Math.round(s.ratio*100)}%`;track.append(fill);p.append(track);
  if(node.kind==='part'&&node.published<node.total)p.append(el('div',`${node.published}/${node.total} 章已发布 · 完成度仅计已发布练习`));
  if(s.score!==null&&s.score!==undefined)p.append(el('div',`${s.scoreLabel||'篇末练习成绩'} ${Math.round(s.score*100)}%`));
  const actions=$('focus-actions');actions.replaceChildren();
  if(node.kind==='concept'){const b=el('button',node.available?'在默认 IDE 中学习':'教学内容待发布');b.type='button';b.disabled=!node.available;b.addEventListener('click',()=>enterNode(node));const a=el('a',node.available?'对应小节练习':'章节导览');a.href=node.url;actions.append(b,a);}
  for(const [id,button] of buttons){button.classList.toggle('selected',id===selected);button.setAttribute('aria-pressed',String(id===selected));}
  for(const [id,step,name] of [['focus-previous',-1,'上一'],['focus-next',1,'下一']]){const b=$(id),next=view.nodes[(index+step+view.nodes.length)%view.nodes.length];b.disabled=view.nodes.length<2;b.setAttribute('aria-label',`切换到${name}${unit}`);b.title=next?`${name}${unit}：${next.title}`:'';}
}
function selectNode(node){if(intro||transition||performance.now()-lastDrag<250)return;fillCard(node);}
function cycleSelection(step){if(intro||transition||!view.nodes.length)return;const index=Math.max(0,view.nodes.findIndex(n=>n.id===selected));clearHover();fillCard(view.nodes[(index+step+view.nodes.length)%view.nodes.length]);renderScene();}
function categoryTag(category){const tag=el('span',category.label.replace(/^系统/,''));tag.style.setProperty('--category',categoryColor(category,theme));const dot=el('i');dot.setAttribute('aria-hidden','true');tag.prepend(dot);tag.title=category.description||category.label;return tag;}
function clearHover(){hovered=null;neighbors=new Set();$('hover-card').hidden=true;for(const b of buttons.values())b.classList.remove('hovered','neighbor','unrelated');}
function setHover(node,button){if(intro||transition||drag)return;hovered=node.id;neighbors=directNeighborhood(node.id,view.edges);for(const [id,b] of buttons){b.classList.toggle('hovered',id===node.id);b.classList.toggle('neighbor',id!==node.id&&neighbors.has(id));b.classList.toggle('unrelated',!neighbors.has(id));}
  const categories=el('div',undefined,'hover-categories');categories.setAttribute('aria-label','五论分类');for(const id of node.categories){const category=graph.taxonomy.find(c=>c.id===id);if(category)categories.append(categoryTag(category));}
  const tip=$('hover-card');tip.replaceChildren(el('strong',`${label(node)} · ${node.title}${node.english?' ('+node.english+')':''}`),categories,el('p',(node.description||'').slice(0,108)),el('p',stateText(node)),el('p',node.kind==='concept'?(node.available?`双击进入 ${node.lessonNumber}「${node.lessonTitle}」学习`:'尚未发布；可在章节导览了解教学设计'):'单击选择 · 双击或滚轮拉近进入','hover-action'));tip.hidden=false;positionTip(button);
}
function positionTip(button){const r=button.getBoundingClientRect(),stage=$('universe').getBoundingClientRect(),tip=$('hover-card');tip.style.left=`${clamp(r.left-stage.left+r.width*.5+24,12,stage.width-tip.offsetWidth-12)}px`;tip.style.top=`${clamp(r.top-stage.top-22,65,stage.height-tip.offsetHeight-98)}px`;}
async function openLesson(node){status(`正在请求打开 ${node.lessonNumber}「${node.lessonTitle}」…`);try{const session=await fetch('/api/session',{signal:AbortSignal.timeout(5000)});if(!session.ok)throw Error('无法连接本机程序。');const {token}=await session.json();const response=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify({id:node.lessonId}),signal:AbortSignal.timeout(7000)});const result=await response.json();if(!response.ok)throw Error(result.error||'未能打开 Notebook。');status(result.message);}
  catch(error){status(`${error.message||'请求失败。'} 请确认本机程序已启动，并将 .ipynb 的默认应用设为支持 Notebook 的 IDE，然后重试。`);}}
function enterNode(node){if(intro||transition||performance.now()-lastDrag<250)return;fillCard(node);if(node.kind==='concept'){if(node.available)void openLesson(node);else status('这一知识点尚未发布正式教学。可查看章节导览。');}else navigate(node.id);}
function renderNodes(){const layer=$('node-layer');layer.replaceChildren();buttons=new Map();for(const node of view.nodes){const b=el('button',undefined,'sky-node');b.type='button';b.dataset.nodeId=node.id;b.dataset.kind=node.kind;b.setAttribute('aria-label',`${label(node)} ${node.title}${node.kind==='concept'?(node.available?'，单击选择，双击在默认 IDE 中打开对应小节':'，教学内容尚未发布'):'，单击选择，双击探索下一级'}`);b.append(el('span',label(node),'node-number'),el('span',node.title,'node-title'),el('span',node.available?'双击探索':'教学设计','node-state'));
    b.addEventListener('pointerenter',()=>setHover(node,b));b.addEventListener('pointerleave',()=>{if(!drag)clearHover();});b.addEventListener('focus',()=>{selectNode(node);setHover(node,b);});b.addEventListener('blur',()=>{if(!drag)clearHover();});b.addEventListener('click',()=>selectNode(node));b.addEventListener('dblclick',()=>enterNode(node));b.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();enterNode(node);}});
    b.addEventListener('pointerdown',event=>{if(event.button!==0||intro||transition)return;const point=unproject(event.clientX,event.clientY),n=layout.byId.get(node.id);drag={id:node.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:n.x-point.x,offsetY:n.y-point.y,moved:false};b.setPointerCapture(event.pointerId);});
    b.addEventListener('pointermove',event=>{if(drag?.pointerId!==event.pointerId)return;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)drag.moved=true;if(!drag.moved)return;event.preventDefault();b.classList.add('dragging');const point=unproject(event.clientX,event.clientY);setPinned(layout,node.id,point.x+drag.offsetX,point.y+drag.offsetY);$('hover-card').hidden=true;});
    const stop=()=>{if(!drag||drag.id!==node.id)return;if(drag.moved)lastDrag=performance.now();releasePinned(layout,node.id);if(b.hasPointerCapture(drag.pointerId))b.releasePointerCapture(drag.pointerId);drag=null;b.classList.remove('dragging');clearHover();};
    b.addEventListener('pointerup',stop);b.addEventListener('pointercancel',stop);b.addEventListener('lostpointercapture',stop);buttons.set(node.id,b);layer.append(b);}
}
function loadView(id){const previous=parentId||selected;parentId=id;body.dataset.level=id?lookup.get(id).kind:'universe';view=getView(graph,id);layout=createLayout(view.nodes,view.edges,id?{radius:.18,holeRadius:.20}:{radius:.105,holeRadius:.55});rotation=0;clearHover();renderNodes();breadcrumb();let candidate=lookup.get(previous);while(candidate&&!view.nodes.some(n=>n.id===candidate.id))candidate=lookup.get(candidate.parentId);const pick=candidate||(id?(view.nodes.find(n=>n.available&&stateOf(n).ratio<1)||view.nodes[0]):chooseResumePart(graph.nodes,progress));fillCard(pick);$('core-label').querySelector('strong').textContent=id?lookup.get(id).title:'系统科学';$('core-label').querySelector('span').textContent=id?(lookup.get(id).kind==='part'?`PART ${lookup.get(id).id}`:`CHAPTER ${lookup.get(id).id}`):'SYSTEMS SCIENCE';measureScene();}
function cancelTransition(){if(transition?.deadline)clearTimeout(transition.deadline);transition?.animation?.cancel();transition=null;$('transition-frame').hidden=true;$('node-layer').inert=false;body.classList.remove('scene-changing');}
function navigate(id,{history=true,animate=true}={}){
  if(id===parentId||transition||(id&&!lookup.has(id)))return;
  endIntro();if(history)window.history.pushState(null,'',routeFor(id));
  if(!animate||reduced.matches){cancelTransition();loadView(id);camera={scale:1,x:0,y:0};return;}
  const entering=!!id&&lookup.get(id).parentId===parentId,previous=parentId,p=projection();
  const node=entering?layout.byId.get(id):null;
  const source={...(node?project(node):{x:p.cx-camera.x*p.rx*camera.scale,y:p.cy-camera.y*p.ry*camera.scale}),diameter:renderer.getDiameter(entering?id:null)};
  clearHover();renderScene();
  const canvas=$('cosmos'),still=$('transition-frame');
  still.width=canvas.width;still.height=canvas.height;still.style.width=`${renderer.width}px`;still.style.height=`${renderer.height}px`;
  still.getContext('2d').drawImage(canvas,0,0);still.hidden=false;still.style.transform='none';still.style.opacity='1';
  body.classList.add('scene-changing');
  loadView(id);camera={scale:1,x:0,y:0};measureScene();renderer.resize();renderScene();
  let target=lookup.get(previous);while(target&&!layout.byId.has(target.id))target=lookup.get(target.parentId);
  const destProjection=projection(),destination=entering?{x:destProjection.cx,y:destProjection.cy,diameter:renderer.getDiameter()}:{...(target?project(layout.byId.get(target.id)):{x:destProjection.cx,y:destProjection.cy}),diameter:target?renderer.getDiameter(target.id):48};
  transition={startedAt:performance.now(),elapsed:0,duration:entering?.85:.70,source,destination,entering,labelOpacity:0};$('node-layer').inert=true;
  // Let the compositor move the outgoing image even when rendering is slow.
  const keyframes=Array.from({length:31},(_,i)=>{const pose=transitionFrame(i/30,source,destination,entering);return{offset:i/30,transform:`translate(${pose.x}px,${pose.y}px) scale(${pose.scale})`,opacity:pose.opacity};});
  transition.animation=still.animate(keyframes,{duration:transition.duration*1000,fill:'forwards'});
  transition.deadline=setTimeout(()=>{cancelTransition();camera={scale:1,x:0,y:0};renderScene();},transition.duration*1000);
  updateTransition(0);renderScene();
}
function updateTransition(time){
  if(!transition)return;transition.elapsed=Math.max(0,(time-transition.startedAt)/1000);const t=transition.elapsed/transition.duration;
  const pose=transitionFrame(t,transition.source,transition.destination,transition.entering),still=$('transition-frame');
  still.style.transform=`translate(${pose.x}px,${pose.y}px) scale(${pose.scale})`;still.style.opacity=pose.opacity;
  camera={scale:pose.cameraScale,x:0,y:0};transition.labelOpacity=pose.labelOpacity;
  if(t>.55)body.classList.remove('scene-changing');
  if(t>=1){cancelTransition();camera={scale:1,x:0,y:0};}
}
function fromHash(){const match=location.hash.match(/^#(part|chapter)=(.+)$/);if(!match)return null;try{const id=decodeURIComponent(match[2]),node=lookup.get(id);return node&&node.kind===match[1]?id:null;}catch{return null;}}
function measureScene(){
  const stage=$('universe'),box=stage.getBoundingClientRect(),top=document.querySelector('.sky-top').getBoundingClientRect(),bottom=document.querySelector('.sky-bottom').getBoundingClientRect();
  stage.style.setProperty('--sky-bottom-height',`${bottom.height}px`);
  stage.style.setProperty('--sky-help-top',`${document.querySelector('.sky-controls').getBoundingClientRect().bottom-box.top+12}px`);
  const reserve=box.width<=1250?88:24;
  stage.style.minHeight=`${Math.max(760,Math.ceil(top.bottom-box.top+24+350+bottom.height+24+reserve))}px`;
  sceneBounds={top:top.bottom-box.top+24,bottom:bottom.top-box.top-reserve};
}
function projection(){return sceneProjection(renderer.width,sceneBounds.top,sceneBounds.bottom,parentId?lookup.get(parentId).kind:'universe');}
function project(n){const p=projection(),a=rotation,cos=Math.cos(a),sin=Math.sin(a);return{x:p.cx+((n.x*cos-n.y*sin)-camera.x)*p.rx*camera.scale,y:p.cy+((n.x*sin+n.y*cos)-camera.y)*p.ry*camera.scale};}
function unproject(clientX,clientY){const rect=$('universe').getBoundingClientRect(),p=projection(),x=(clientX-rect.left-p.cx)/(p.rx*camera.scale)+camera.x,y=(clientY-rect.top-p.cy)/(p.ry*camera.scale)+camera.y,cos=Math.cos(rotation),sin=Math.sin(rotation);return{x:x*cos+y*sin,y:-x*sin+y*cos};}
function zoomBy(delta,clientX,clientY){
  if(intro||transition||drag||pan)return;
  const now=performance.now(),rect=$('universe').getBoundingClientRect(),p=projection();
  const px=clientX??rect.left+p.cx,py=clientY??rect.top+p.cy;
  const target=clientX===undefined?lookup.get(selected):hovered?lookup.get(hovered):layout.nodes.reduce((best,n)=>{const a=project(n),b=best?project(best):null;return !b||Math.hypot(a.x+rect.left-px,a.y+rect.top-py)<Math.hypot(b.x+rect.left-px,b.y+rect.top-py)?n:best;},null);
  const currentLevel=parentId?lookup.get(parentId).kind:'universe';
  const next=zoomStep({...zoomState,scale:camera.scale},delta,{level:currentLevel,hasChildren:currentLevel!=='chapter'&&view.nodes.length>0,hasParent:!!parentId,now,reducedMotion:reduced.matches});
  zoomState=next;wheelActiveUntil=now+450;
  if(next.action){clearHover();if(next.action==='enter'&&target)navigate(target.id);else if(next.action==='leave')navigate(lookup.get(parentId).parentId||null);return;}
  const sx=(px-rect.left-p.cx)/p.rx,sy=(py-rect.top-p.cy)/p.ry;
  camera.x=clamp(camera.x+sx/camera.scale-sx/next.scale,-1,1);camera.y=clamp(camera.y+sy/camera.scale-sy/next.scale,-1,1);camera.scale=next.scale;
  $('zoom-value').textContent=`${Math.round(camera.scale*100)}%`;
}
function playIntro(){if(!graph)return;cancelTransition();window.history.replaceState(null,'',location.pathname);loadView(null);if(reduced.matches){status('已按“减少动态效果”设置展示静态星图。');return;}paused=false;motionUpdate();intro={elapsed:0,duration:5.8};body.classList.add('intro-playing');$('node-layer').inert=true;$('focus-card').inert=true;$('intro-banner').hidden=false;camera={scale:.55,x:0,y:0};status('');}
function endIntro(focusPart=false){if(!intro)return;intro=null;body.classList.remove('intro-playing');$('intro-banner').hidden=true;$('node-layer').inert=false;$('focus-card').inert=false;camera={scale:1,x:0,y:0};storage.set(INTRO_KEY,'seen');const resume=chooseResumePart(graph.nodes,progress);if(focusPart&&resume)navigate(resume.id);else if(!parentId&&resume)fillCard(resume);}
function animate(time){frame=requestAnimationFrame(animate);if(document.hidden)return;const fps=(paused||hovered)&&!drag&&!pan&&!transition?8:30;if(last&&time-last<1000/fps)return;const elapsed=last?Math.max(0,(time-last)/1000):0,dt=Math.min(.15,elapsed);last=time;const moving=!paused&&!hovered&&!drag&&!pan;if(moving){clock+=dt;if(time>wheelActiveUntil&&!transition)rotation+=dt*(parentId?.014:.025);}if(intro&&!paused){intro.elapsed+=elapsed;const t=intro.elapsed/intro.duration;$('intro-progress').style.width=`${Math.min(100,t*100)}%`;$('intro-caption').textContent=t<.34?'从万千现象，走向共同的原理':t<.69?'每一次连接，都让理解更进一步':`下一站 · ${chooseResumePart(graph.nodes,progress).title}`;
      camera.scale=.55+.45*ease(clamp(t/.8,0,1));camera.x=0;camera.y=0;if(t>=1)endIntro(true);}
    if(transition)updateTransition(time);
    if(drag?.moved||(!paused&&!hovered&&!pan&&!intro&&!transition))tickLayout(layout,dt,drag?.id||null);
    try{renderScene();}catch(error){cancelAnimationFrame(frame);paused=true;motionUpdate();status('星图绘制暂时中断，请刷新重试。也可以打开全书目录继续学习。');console.error(error);}
}
function renderScene(){
    const nodes=activeNodes().map(n=>{const p=project(n),b=buttons.get(n.id);b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;const visible=p.x>=24&&p.x<=renderer.width-24&&p.y>=sceneBounds.top+20&&p.y<=sceneBounds.bottom-64;b.style.visibility=visible?'visible':'hidden';b.style.opacity=intro?String(clamp((intro.elapsed/intro.duration-.3)*3,0,1)):transition?String(transition.labelOpacity):'';return{...n,sx:p.x,sy:p.y,spin:parseFloat(n.id)||0,scale:Math.min(1.3,camera.scale),visible};}).filter(n=>n.visible);
    const p=projection(),center={x:p.cx-camera.x*p.rx*camera.scale,y:p.cy-camera.y*p.ry*camera.scale},centerNode=parentId?lookup.get(parentId):null;const scene={nodes,edges:view.edges,center,centerKind:centerNode?.kind||'universe',centerColor:centerNode?mixColors(centerNode.categories,graph.taxonomy,theme):'#c0c9e8',centerId:parentId||'systems',radius:p.radius*camera.scale,time:clock,hovered,selected,neighbors,intro:intro?1-intro.elapsed/intro.duration:0,introProgress:intro?intro.elapsed/intro.duration:null,velocity:intro?Math.sin(intro.elapsed/intro.duration*Math.PI):transition?Math.sin(Math.min(1,transition.elapsed/transition.duration)*Math.PI)*.6:0};try{renderer.draw(scene);}catch(error){if($('cosmos').dataset.renderer!=='webgl')throw error;compatibleRenderer(error).draw(scene);}$('core-label').style.opacity=intro?clamp((intro.elapsed-1.2)/2,0,1):1;$('zoom-value').textContent=`${Math.round(camera.scale*100)}%`;
}
async function main(){themeUpdate();motionUpdate();document.addEventListener('course-progress',event=>{const signature=JSON.stringify(event.detail);if(signature===progressSignature)return;progressSignature=signature;progress=event.detail;progressLoaded=true;if(selected&&lookup)fillCard(lookup.get(selected));});const [data]=await Promise.all([fetch('/web/home/graph.json',{signal:AbortSignal.timeout(6000)}).then(r=>{if(!r.ok)throw Error('知识星图加载失败。');return r.json();}),mountShell('home')]);graph=data;lookup=new Map(graph.nodes.map(n=>[n.id,n]));await createRenderer();themeUpdate();
  $('taxonomy').replaceChildren(...graph.taxonomy.map(categoryTag));
  loadView(fromHash());$('theme-toggle').addEventListener('click',()=>applyTheme(theme==='dark'?'light':'dark'));window.addEventListener('site-theme-change',event=>{theme=event.detail.theme;themeUpdate();});$('motion-toggle').addEventListener('click',()=>{paused=!paused;motionUpdate();});$('replay').addEventListener('click',playIntro);$('skip-intro').addEventListener('click',()=>endIntro(false));
  $('focus-previous').addEventListener('click',()=>cycleSelection(-1));$('focus-next').addEventListener('click',()=>cycleSelection(1));
  $('zoom-in').addEventListener('click',()=>zoomBy(-210));$('zoom-out').addEventListener('click',()=>zoomBy(210));$('zoom-reset').addEventListener('click',()=>{camera={scale:1,x:0,y:0};zoomState={scale:1,lastTransitionAt:performance.now()};clearHover();});
  $('universe').addEventListener('wheel',event=>{if(event.ctrlKey||event.target.closest('[data-sky-hud],.glass-card,#intro-banner'))return;event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?renderer.height:1;zoomBy(event.deltaY*unit,event.clientX,event.clientY);},{passive:false});
  const stage=$('universe');
  stage.addEventListener('pointerdown',event=>{if(event.button!==0||intro||transition||event.target.closest('button,a,.glass-card,[data-sky-hud],#intro-banner'))return;event.preventDefault();clearHover();pan={pointerId:event.pointerId,x:event.clientX,y:event.clientY,camera:{...camera}};stage.setPointerCapture(event.pointerId);stage.classList.add('panning');stage.focus({preventScroll:true});});
  stage.addEventListener('pointermove',event=>{if(pan?.pointerId!==event.pointerId)return;const p=projection();camera.x=clamp(pan.camera.x-(event.clientX-pan.x)/(p.rx*camera.scale),-1.5,1.5);camera.y=clamp(pan.camera.y-(event.clientY-pan.y)/(p.ry*camera.scale),-1.5,1.5);renderScene();});
  const endPan=()=>{if(!pan)return;const id=pan.pointerId;pan=null;stage.classList.remove('panning');if(stage.hasPointerCapture(id))stage.releasePointerCapture(id);};
  stage.addEventListener('pointerup',endPan);stage.addEventListener('pointercancel',endPan);stage.addEventListener('lostpointercapture',endPan);
  stage.addEventListener('keydown',event=>{if(event.target!==stage||intro||transition)return;const shift={ArrowLeft:[-.10,0],ArrowRight:[.10,0],ArrowUp:[0,-.10],ArrowDown:[0,.10]}[event.key];if(shift){event.preventDefault();camera.x=clamp(camera.x+shift[0]/camera.scale,-1.5,1.5);camera.y=clamp(camera.y+shift[1]/camera.scale,-1.5,1.5);renderScene();}});
  const help=show=>{$('sky-help').hidden=!show;$('help-toggle').setAttribute('aria-expanded',String(show));};$('help-toggle').addEventListener('click',()=>help($('sky-help').hidden));$('help-close').addEventListener('click',()=>{help(false);$('help-toggle').focus();});
  window.addEventListener('popstate',()=>{cancelTransition();endIntro();camera={scale:1,x:0,y:0};loadView(fromHash());});window.addEventListener('hashchange',()=>{const id=fromHash();if(id!==parentId&&!transition)navigate(id,{history:false,animate:false});});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('sky-help').hidden){help(false);return;}if(intro){endIntro();return;}if(parentId)navigate(lookup.get(parentId).parentId||null);}});
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;endIntro();motionUpdate();}});document.addEventListener('visibilitychange',()=>{last=0;});const observer=new ResizeObserver(()=>{const focused=document.activeElement?.dataset.nodeId;clearHover();measureScene();renderer.resize();renderScene();if(focused&&buttons.has(focused))setHover(lookup.get(focused),buttons.get(focused));});for(const element of [stage,document.querySelector('.sky-top'),document.querySelector('.sky-bottom')])observer.observe(element);
  for(const hud of document.querySelectorAll('[data-sky-hud]'))hud.inert=false;$('loading-note').hidden=true;body.dataset.ready='true';if(!storage.get(INTRO_KEY)&&!parentId&&!reduced.matches)playIntro();renderScene();frame=requestAnimationFrame(animate);
}
main().catch(error=>{cancelAnimationFrame(frame);const note=$('loading-note');note.hidden=false;note.replaceChildren(el('p',`${error.message} 请刷新重试，或使用全书目录继续。`));const a=el('a','打开全书目录 →');a.href='/catalog/';note.append(a);body.dataset.ready='true';});
