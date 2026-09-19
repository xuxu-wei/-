import {mountShell,el} from '../shared/course-shell.mjs';
import {renderAssessment} from '../shared/assessment.mjs';

const host=document.getElementById('overview');
function assessmentPanel(lesson,practiceUrl){
  const panel=el('section');panel.hidden=true;panel.setAttribute('aria-label','篇末综合成绩');host.append(panel);
  document.addEventListener('course-progress',event=>renderAssessment(panel,event.detail.assessments?.[lesson],{practiceUrl}));
  void fetch('/api/v1/progress',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>renderAssessment(panel,value.assessments?.[lesson],{practiceUrl})).catch(()=>{});
}
function a(text,url,cls){const n=el('a',text,cls);n.href=url;return n;}

function heading(label,title,description,note){
  const header=el('header',undefined,'overview-heading');
  header.append(el('p',label,'eyebrow'),el('h1',title),el('p',description,'overview-description'));
  host.append(header,el('p',note,'overview-note'));
}

function cards(items,kind){
  const grid=el('div',undefined,`catalog-grid ${kind}-grid`);
  for(const item of items){
    const card=a(undefined,item.url,`catalog-card ${kind}-card`);
    const title=el('h2');
    title.append(el('span',kind==='part'?`第 ${item.id} 篇`:item.assessment?'篇末综合':item.id,'card-number'),el('span',item.title,'card-title'));
    card.append(title);
    if(kind==='part'){
      const topics=el('ul',undefined,'card-topics');
      for(const chapter of item.chapters)topics.append(el('li',chapter.title));
      card.append(topics);
    }else{
      card.append(el('p',item.goals,'card-goal'),el('p',`先修：${item.prerequisites}`,'card-prerequisites'));
    }
    const footer=el('div',undefined,'card-footer');
    footer.append(el('span',kind==='part'?`${item.chapters.length} 章 · ${item.chapters.filter(c=>c.available).length} 章可学习`:item.available?`${item.lessons.length} 节 Notebook · 进入学习`:'教学设计导览'),el('span','→','card-arrow'));
    card.append(footer);grid.append(card);
  }
  return grid;
}

function section(title,text){const n=el('section',undefined,'overview-section');n.append(el('h2',title),el('p',text));return n;}

async function start(){
  const {course,current,part}=await mountShell();
  if(!current){
    document.body.dataset.guide='book';
    const ready=course.parts.filter(p=>p.chapters.every(c=>c.available)).map(p=>p.id);
    const partial=course.parts.filter(p=>p.chapters.some(c=>c.available)&&!p.chapters.every(c=>c.available));
    const partialNote=partial.map(p=>`第 ${p.id} 篇已有 ${p.chapters.filter(c=>c.available).length}/${p.chapters.length} 章可学习。`).join('');
    heading(`全书目录 · ${course.parts.length} 篇 · ${course.parts.reduce((sum,p)=>sum+p.chapters.length,0)} 章`, '从看见系统，到理解复杂性',
      '提出问题，建立模型，用计算检验解释。沿着篇章顺序，逐步进入系统科学。',
      (ready.length?`第 ${ready.join('、')} 篇已提供完整 Notebook 与练习。`:'')+partialNote+'其余篇章目前提供教学设计导览。');
    host.append(cards(course.parts,'part'));
  }else if(part){
    document.body.dataset.guide='part';
    heading(`第 ${part.id} 篇 · ${part.chapters.length} 章`,part.title,
      '按章推进，先看学习目标与先修知识，再进入知识体系。',
      part.chapters.every(c=>c.available)?'从第一章进入 Notebook，完成各节练习后用篇末综合题组检验理解。':part.chapters.some(c=>c.available)?`目前有 ${part.chapters.filter(c=>c.available).length}/${part.chapters.length} 章可学习，其余为教学设计导览。现有篇末成绩只覆盖已发布题组。`:'以下为教学设计导览；对应 Notebook 与习题尚待编写。');
    if(part.assessment)assessmentPanel(part.assessment.lessons[0].id,part.assessment.url+'practice/');
    host.append(cards(part.chapters,'chapter'));
    if(part.assessment){host.append(el('h2','贯通本篇','lessons-heading'),cards([part.assessment],'chapter'));}
  }else{
    document.body.dataset.guide='chapter';
    heading(`第 ${current.id.split('.')[0]} 篇 · ${current.assessment?'篇末综合':current.id+' 章'}`,current.title,
      '围绕本章问题，连接必要知识、关键方法与计算实验。',
      current.available?'在下方进入完整 Notebook；配套练习用于检查理解。':'本页展示教学设计；对应的正式 Notebook、可视化与练习尚待编写。');
    if(current.assessment)assessmentPanel(current.lessons[0].id,current.url+'practice/');
    const summary=el('div',undefined,'chapter-summary');
    summary.append(section('本章学会什么',current.goals),section('先修知识',current.prerequisites),section('教学重点与难点',current.focus));host.append(summary);
    const knowledge=el('section',undefined,'overview-section knowledge-section');
    knowledge.append(el('h2','知识体系与学习顺序'));
    const list=el('ol',undefined,'knowledge-path');for(const text of current.knowledge)list.append(el('li',text));
    knowledge.append(list);host.append(knowledge);
    if(current.available){
      host.append(el('h2','完整教学与练习','lessons-heading'));
      const grid=el('div',undefined,'chapter-cards');
      for(const [index,lesson] of current.lessons.entries()){
        const card=el('article',undefined,'overview-card');
        card.append(el('span',`第 ${index+1} 节`,'lesson-label'),el('h3',lesson.title),el('p',lesson.outcome));
        const links=el('div',undefined,'section-links');
        const button=el('button','在默认 IDE 打开');button.type='button';
        const feedback=el('p','','caption');feedback.setAttribute('role','status');
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try{
            const session=await (await fetch('/api/session')).json();
            const r=await fetch('/api/notebooks/open',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token},body:JSON.stringify({id:lesson.id})});
            const result=await r.json();feedback.textContent=result.message||result.error;
          }catch{feedback.textContent='本机连接中断，请重新启动教材服务。';}
          finally{button.disabled=false;}
        });
        links.append(button,a(`本节 ${lesson.questions.length} 道练习 →`,lesson.url));
        card.append(links,feedback);grid.append(card);
      }
      host.append(grid);
    }
  }
  document.title=(current?.title||'全书目录')+' · 动手学系统科学';
  document.body.dataset.ready='true';document.getElementById('loading-note').hidden=true;
}
start().catch(error=>{document.getElementById('loading-note').textContent=error.message;});
