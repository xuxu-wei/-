import {mountShell,el,sampleBase} from '../shared/course-shell.mjs';

const host=document.getElementById('overview');
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
    title.append(el('span',kind==='part'?`第 ${item.id} 篇`:item.id,'card-number'),el('span',item.title,'card-title'));
    card.append(title);
    if(kind==='part'){
      const topics=el('ul',undefined,'card-topics');
      for(const chapter of item.chapters)topics.append(el('li',chapter.title));
      card.append(topics);
    }else{
      card.append(el('p',item.goals,'card-goal'),el('p',`先修：${item.prerequisites}`,'card-prerequisites'));
    }
    const footer=el('div',undefined,'card-footer');
    footer.append(el('span',kind==='part'?`${item.chapters.length} 章 · 篇导览`:'学习重点与知识体系'),el('span','→','card-arrow'));
    card.append(footer);grid.append(card);
  }
  return grid;
}

function section(title,text){const n=el('section',undefined,'overview-section');n.append(el('h2',title),el('p',text));return n;}

async function start(){
  const {course,current,part}=await mountShell();
  if(!current){
    document.body.dataset.guide='book';
    heading('全书目录 · 十二篇', '从看见系统，到理解复杂性',
      '提出问题，建立模型，用计算检验解释。沿着篇章顺序，逐步进入系统科学。',
      '正式教材现提供篇章导览，Notebook 与习题待编写。制作样章独立提供参考体验。');
    host.append(cards(course.parts,'part'));
    const sample=el('aside',undefined,'sample-entry');
    const description=el('div');description.append(el('h2','制作样章 · 体内物质的积累与清除'),el('p','六节 Notebook、模型可视化与 22 道练习。独立于正式课程，进度分别记录。'));
    sample.append(description,a('进入样章 →',sampleBase));host.append(sample);
  }else if(part){
    document.body.dataset.guide='part';
    heading(`第 ${part.id} 篇 · ${part.chapters.length} 章`,part.title,
      '按章推进，先看学习目标与先修知识，再进入知识体系。',
      '以下为正式章节的教学设计导览；对应 Notebook 与习题尚待编写。');
    host.append(cards(part.chapters,'chapter'));
  }else{
    document.body.dataset.guide='chapter';
    const sample=current===course.sample;
    heading(sample?'制作样章':`第 ${current.id.split('.')[0]} 篇 · ${current.id} 章`,current.title,
      sample?'从存量与流量出发，建立并检验一个理想单室模型。':'围绕本章问题，连接必要知识、关键方法与计算实验。',
      sample?'本样章供教学与交互制作参考，可复制改写；正式章节独立验收，后续将移除样章。':'本页展示教学设计；对应的正式 Notebook、可视化与练习尚待编写。');
    const summary=el('div',undefined,'chapter-summary');
    summary.append(section('本章学会什么',current.goals),section('先修知识',current.prerequisites),section('教学重点与难点',current.focus));host.append(summary);
    const knowledge=el('section',undefined,'overview-section knowledge-section');
    knowledge.append(el('h2','知识体系与学习顺序'));
    const list=el('ol',undefined,'knowledge-path');for(const text of current.knowledge)list.append(el('li',text));
    knowledge.append(list);host.append(knowledge);
    if(sample){
      host.append(el('h2','六节完整教学','lessons-heading'));
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
