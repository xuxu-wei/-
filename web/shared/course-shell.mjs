import {summarize,questionIds} from './progress.mjs';
import {setupSidebar} from './layout.mjs';
export const sampleBase='/samples/accumulation-clearance/';
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const link=(title,url,cls)=>{const a=el('a',title,cls);a.href=url;return a;};
let course,current,mode,progress={},tree,section=null;
const progressNodes=[];
function questionKey(){return current===course?.sample?'sample:accumulation-clearance:question':`chapter:${current?.id}:question`;}
export function rememberQuestion(slug){try{sessionStorage.setItem(questionKey(),slug);}catch{}}
export function applyProgress(value){
  progress=value;
  for(const {node,item} of progressNodes){
    const status=summarize(questionIds(item),value);node.className=`progress-badge ${status.state}`;
    node.textContent=status.label;node.title=`${status.label} · ${status.passed}/${status.total} 题`;
  }
  const target=document.getElementById('chapter-progress');
  if(target&&current){const status=summarize(questionIds(current),value);target.textContent=`${status.label}${status.total?' · '+status.passed+' / '+status.total+' 题':''}${value.incomplete?' · 部分记录无法读取':''}`;target.className=`progress-badge ${status.state}`;}
  document.dispatchEvent(new CustomEvent('course-progress',{detail:value}));
}
export async function refreshProgress(){
  try{const r=await fetch('/api/v1/progress',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();applyProgress(await r.json());document.getElementById('progress-error').hidden=true;}
  catch{document.getElementById('progress-error').hidden=false;}
}
function badge(item){const b=el('span','未开始','progress-badge new');progressNodes.push({node:b,item});return b;}
function branch(item,parent,isCurrent=false){
  const details=el('details',undefined,'tree-branch');details.open=isCurrent;
  const summary=el('summary');summary.append(el('span',item.title,'tree-title'),badge(item));details.append(summary);
  const entry=link(item.chapters?'篇导览':'本章导览',item.url,'tree-overview');if(item.url===current?.url&&mode==='overview')entry.setAttribute('aria-current','page');details.append(entry);
  parent.append(details);return details;
}
export function locateLesson(id){
  section=id;
  for(const a of tree.querySelectorAll('[data-lesson]')){
    const active=a.dataset.lesson===id;a.classList.toggle('selected',active);
    if(active){a.setAttribute('aria-current','page');let parent=a.parentElement;while(parent&&parent!==tree){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}}
    else a.removeAttribute('aria-current');
  }
  const crumb=document.getElementById('current-section');if(crumb)crumb.textContent=current.lessons?.find(l=>l.id===id)?.title||'';
}
export async function mountShell(pageMode='overview'){
  mode=pageMode;
  const response=await fetch('/web/course/catalog.json',{signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error('目录加载失败，请刷新页面。');course=await response.json();
  const path=decodeURI(location.pathname);
  const part=course.parts.find(p=>p.url===path);
  const chapterItems=course.parts.flatMap(p=>[...p.chapters,...(p.assessment?[p.assessment]:[])]);
  current=chapterItems.find(c=>path.startsWith(c.url))|| (course.sample&&path.startsWith(course.sample.url)?course.sample:part);
  const header=el('header',undefined,'course-header');
  const toggle=el('button','☰ 隐藏目录','directory-toggle');toggle.id='directory-toggle';toggle.type='button';toggle.setAttribute('aria-controls','course-directory');
  const identity=el('div',undefined,'header-identity');identity.append(toggle,link('动手学系统科学','/','brand'));header.append(identity,el('span','观察 · 建模 · 计算 · 理解','brand-note'));
  const sidebar=el('aside',undefined,'course-sidebar');sidebar.id='course-directory';sidebar.setAttribute('aria-label','教材篇章目录');
  const resize=el('div',undefined,'resize-handle sidebar-resizer');resize.id='sidebar-resizer';resize.tabIndex=0;resize.setAttribute('role','separator');resize.setAttribute('aria-orientation','vertical');resize.setAttribute('aria-controls','course-directory');resize.setAttribute('aria-label','调整目录宽度');resize.title='拖动调整目录宽度；左右方向键调整，双击或 Enter 恢复默认';
  sidebar.append(link('全书目录','/','directory-home'),el('p','按篇章学习','nav-label'));
  const legend=el('div',undefined,'progress-legend');for(const [state,text] of [['new','未开始'],['active','进行中'],['complete','已完成']])legend.append(el('span',text,`legend-dot ${state}`));sidebar.append(legend);
  const error=el('p','进度暂时无法读取，请恢复本机连接后刷新。','error-note');error.id='progress-error';error.hidden=true;sidebar.append(error);
  tree=el('nav',undefined,'course-tree');tree.setAttribute('aria-label','按篇章选择内容');
  for(const p of course.parts){
    const chapters=[...p.chapters,...(p.assessment?[p.assessment]:[])];
    const parent=branch({...p,title:`第 ${p.id} 篇 · ${p.title}`},tree,p===current||chapters.includes(current));
    for(const chapter of chapters){
      const d=branch({...chapter,title:`${chapter.assessment?'篇末综合':chapter.id} ${chapter.title}`},parent,chapter===current);d.classList.add('chapter-branch');
      chapterLinks(chapter,d);
    }
  }
  let sample;
  if(course.sample){
    tree.append(el('p','制作样章 · 独立于正式教材','nav-label sample-label'));
    sample=branch(course.sample,tree,current===course.sample);sample.classList.add('sample-branch');chapterLinks(course.sample,sample);
  }
  sidebar.append(tree);document.body.prepend(header,sidebar,resize);setupSidebar(sidebar,toggle,resize);
  const main=document.getElementById('main');main.classList.add('course-main');
  const toolbar=el('div',undefined,'chapter-toolbar');
  const crumb=el('div',undefined,'breadcrumb');crumb.append(link('目录','/'));if(current){crumb.append(el('span','/'),link(current===course.sample?'制作样章':part?'篇导览':`第 ${current.id.split('.')[0]} 篇`,current===course.sample?sampleBase:(part?.url||course.parts.find(p=>p.id===current.id.split('.')[0]).url)),el('span','/'),el('span',current.title));}
  const sectionName=el('span','','crumb-section');sectionName.id='current-section';crumb.append(sectionName);toolbar.append(crumb);
  if(current&&!part){
    const tabs=el('nav',undefined,'chapter-tabs');tabs.setAttribute('aria-label','本章页面切换');
    const base=current.url;
    for(const [key,title,url] of [['overview','本章导览',base],['explore','可视化与探索',base+'explore/'],['practice','练习',base+'practice/']]){
      if(key!=='overview'&&!current.available)continue;
      if(key==='explore'&&!current.visualization)continue;
      let destination=url;
      if(key==='practice'){try{const last=sessionStorage.getItem(questionKey());if(current.lessons.some(l=>l.questions.some(q=>q.slug===last)))destination+='?question='+last;}catch{}}
      const a=link(title,destination,'chapter-tab');if(key===mode)a.setAttribute('aria-current','page');tabs.append(a);
    }
    const status=el('span','','progress-badge');status.id='chapter-progress';status.setAttribute('role','status');toolbar.append(tabs,status);
  }
  main.prepend(toolbar);
  const skip=link('跳到正文','#main','skip-link');document.body.prepend(skip);
  await refreshProgress();
  // 只滚动目录自己的视口，避免把正文标题卷出屏幕。
  if(sample&&current===course.sample)sidebar.scrollTop=sample.offsetTop-sidebar.offsetTop-130;
  else {const active=tree.querySelector('[aria-current]');if(active)sidebar.scrollTop=Math.max(0,active.offsetTop-180);}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshProgress();});
  window.addEventListener('focus',()=>void refreshProgress());
  setInterval(()=>{if(!document.hidden)void refreshProgress();},15000);
  return {course,current,part};
}

function chapterLinks(chapter, branch){
  if(chapter.visualization){
    const a=link('可视化与探索',chapter.url+'explore/','tree-overview');
    if(current===chapter&&mode==='explore')a.setAttribute('aria-current','page');branch.append(a);
  }
  for(const lesson of chapter.lessons||[]){
    const a=link(`${lesson.number?lesson.number+' ':''}${lesson.title}`,lesson.url,'tree-lesson');
    a.dataset.lesson=lesson.id;a.append(badge(lesson));branch.append(a);
  }
}
