// 阅读布局与答题草稿分别保存；调整显示不会改写代码或学习记录。
const key='systems-science:layout:v1';
const defaults={sidebarWidth:284,sidebarHidden:false,questionShare:.48,wrapCode:true};
export function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
export function sidebarBounds(width){return {min:220,max:Math.max(220,Math.min(480,width-600))};}
export function splitBounds(width){const min=Math.min(.5,Math.max(.30,300/Math.max(1,width-12)));return {min,max:1-min};}
export function normalizeLayout(value){
  const v=value&&typeof value==='object'?value:{};
  return {
    sidebarWidth:Number.isFinite(v.sidebarWidth)?clamp(v.sidebarWidth,220,480):defaults.sidebarWidth,
    sidebarHidden:typeof v.sidebarHidden==='boolean'?v.sidebarHidden:false,
    questionShare:Number.isFinite(v.questionShare)?clamp(v.questionShare,.30,.70):defaults.questionShare,
    wrapCode:typeof v.wrapCode==='boolean'?v.wrapCode:true,
  };
}
let state;
function settings(){if(!state){try{state=normalizeLayout(JSON.parse(localStorage.getItem(key)));}catch{state={...defaults};}}return state;}
function remember(){try{localStorage.setItem(key,JSON.stringify(settings()));}catch{/* 布局仍可使用；不影响作答保存。 */}}

export function attachResize(handle,{getValue,getBounds,change,fromPointer,resetValue,step,describe}){
  let drag=null;
  function update(value){const {min,max}=getBounds();change(clamp(value,min,max));refresh();}
  function refresh(){const {min,max}=getBounds();handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(getValue()));handle.setAttribute('aria-valuetext',describe(getValue()));}
  function finish(){if(!drag)return;const id=drag.pointerId;drag=null;if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);document.documentElement.classList.remove('layout-resizing');remember();}
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();handle.focus();drag={pointerId:event.pointerId,value:getValue()};handle.setPointerCapture(event.pointerId);document.documentElement.classList.add('layout-resizing');
  });
  handle.addEventListener('pointermove',event=>{if(drag?.pointerId===event.pointerId)update(fromPointer(event));});
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('lostpointercapture',finish);
  handle.addEventListener('dblclick',()=>{update(resetValue);remember();});
  handle.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){update(drag.value);finish();event.preventDefault();return;}
    const {min,max}=getBounds();
    const value={ArrowLeft:getValue()-step,ArrowRight:getValue()+step,Home:min,End:max,Enter:resetValue}[event.key];
    if(value===undefined)return;event.preventDefault();update(value);remember();
  });
  refresh();return refresh;
}

export function setupSidebar(sidebar,toggle,handle){
  const prefs=settings(),root=document.documentElement;
  function width(){const {min,max}=sidebarBounds(root.clientWidth);return clamp(prefs.sidebarWidth,min,max);}
  function apply(){
    root.style.setProperty('--sidebar-width',`${width()}px`);root.dataset.sidebar=prefs.sidebarHidden?'hidden':'shown';
    sidebar.inert=prefs.sidebarHidden;sidebar.setAttribute('aria-hidden',String(prefs.sidebarHidden));handle.hidden=prefs.sidebarHidden;
    toggle.setAttribute('aria-expanded',String(!prefs.sidebarHidden));toggle.textContent=prefs.sidebarHidden?'☰ 展开目录':'☰ 隐藏目录';
  }
  apply();
  const refresh=attachResize(handle,{getValue:width,getBounds:()=>sidebarBounds(root.clientWidth),change:value=>{prefs.sidebarWidth=value;apply();},fromPointer:event=>event.clientX,resetValue:284,step:16,describe:value=>`目录宽度 ${Math.round(value)} 像素`});
  toggle.addEventListener('click',()=>{prefs.sidebarHidden=!prefs.sidebarHidden;apply();remember();if(!prefs.sidebarHidden)refresh();});
  sidebar.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();prefs.sidebarHidden=true;apply();remember();toggle.focus();}});
  window.addEventListener('resize',()=>{apply();refresh();});
}

export function setupWorkspace(workspace,handle,wrapButton,source){
  const prefs=settings(),root=document.documentElement;
  function share(){const {min,max}=splitBounds(workspace.clientWidth);return clamp(prefs.questionShare,min,max);}
  function size(){
    const value=share();workspace.style.setProperty('--question-column',`${value}fr`);workspace.style.setProperty('--answer-column',`${1-value}fr`);
    const top=workspace.getBoundingClientRect().top+window.scrollY;
    workspace.style.setProperty('--workspace-height',`${Math.max(460,window.innerHeight-top-20)}px`);
  }
  function wrap(){root.dataset.codeWrap=prefs.wrapCode?'on':'off';source.wrap=prefs.wrapCode?'soft':'off';source.dispatchEvent(new Event('editor-wrap'));wrapButton.setAttribute('aria-pressed',String(prefs.wrapCode));wrapButton.textContent=`自动换行：${prefs.wrapCode?'开':'关'}`;}
  wrap();size();
  const refresh=attachResize(handle,{getValue:share,getBounds:()=>splitBounds(workspace.clientWidth),change:value=>{prefs.questionShare=value;size();},fromPointer:event=>(event.clientX-workspace.getBoundingClientRect().left-6)/(workspace.clientWidth-12),resetValue:.48,step:.03,describe:value=>`题目占 ${Math.round(value*100)}%，答题区占 ${Math.round((1-value)*100)}%`});
  wrapButton.addEventListener('click',()=>{prefs.wrapCode=!prefs.wrapCode;wrap();remember();});
  const observer=new ResizeObserver(()=>{size();refresh();});
  observer.observe(document.getElementById('main'));observer.observe(document.getElementById('questions'));observer.observe(document.querySelector('.chapter-toolbar'));
  window.addEventListener('resize',()=>{size();refresh();});
}
