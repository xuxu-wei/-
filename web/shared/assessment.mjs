// 只呈现本机评分汇总，浏览器不另算成绩。
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}

export function scoreText(summary){
  if(summary.incomplete)return '部分记录无法读取，成绩暂不完整';
  if(!summary.attempted)return '尚未开始首轮作答';
  return summary.first_complete?`首轮：${summary.first_grade}`:`首轮已提交 ${summary.attempted}/${summary.count} 题，完成后给出评价`;
}

export function renderAssessment(host,summary,{practiceUrl='',onSelect}={}){
  if(!summary){host.hidden=true;delete host.dataset.summary;return;}
  const expanded=host.querySelector('details')?.open||false;
  // 定时轮询没有新成绩时不重建 DOM，保留键盘焦点和详情展开状态。
  const key=JSON.stringify(summary);
  if(host.dataset.summary===key)return;
  host.dataset.summary=key;host.hidden=false;host.classList.add('assessment-panel');
  const title=el('h2','篇末综合成绩');
  const scores=el('div',undefined,'assessment-scores');
  for(const [label,value] of [['首次作答分',summary.first_points],['练习达成分',summary.practice_points]]){
    const block=el('div');block.append(el('span',label),el('strong',`${value} / ${summary.points}`));scores.append(block);
  }
  const state=el('p',scoreText(summary),'assessment-status');state.setAttribute('role','status');
  const achieved=summary.attempted&&!summary.incomplete?` · 练习评价：${summary.practice_grade}`:'';
  state.textContent+=` · 已通过 ${summary.passed}/${summary.count} 题${achieved}`;
  const detail=el('details');detail.open=expanded;detail.append(el('summary','查看分层成绩、学习目标与复习建议'));
  const columns=el('div',undefined,'assessment-breakdown');
  for(const [caption,rows] of [['难度层次',summary.levels],['学习目标',summary.objectives]]){
    const table=el('table');table.append(el('caption',caption));
    const head=el('thead'),tr=el('tr');for(const label of ['项目','首次','练习']){const th=el('th',label);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
    const body=el('tbody');
    for(const row of rows){const tr=el('tr'),name=el('th',row.title);name.scope='row';tr.append(name,el('td',`${row.first_points}/${row.points}`),el('td',`${row.practice_points}/${row.points}`));body.append(tr);}
    table.append(body);columns.append(table);
  }
  detail.append(columns);
  const review=el('div',undefined,'assessment-review');
  review.append(el('h3',summary.incomplete?'成绩待核对':summary.review.length?'从最早未通过的层次继续':'本题组已全部通过'));
  if(summary.incomplete)review.append(el('p','请先恢复无法读取的本地记录；当前得分和诊断仅包含可读取的部分。'));
  else if(summary.review.length){
    const list=el('ul');
    for(const id of summary.review.slice(0,3)){
      const item=summary.items.find(i=>i.question_id===id),goal=summary.objectives.find(o=>o.id===item.objective);
      const li=el('li'),answer=el('a',`${item.level_title}：${item.title}`);answer.href=practiceUrl+'?question='+item.slug;
      if(onSelect)answer.addEventListener('click',event=>{event.preventDefault();onSelect(id);});
      const link=el('a','复习 '+goal.title);link.href=goal.review_url;
      li.append(answer,el('span',` · ${item.attempted?'待订正':'未作答'} · `),link);list.append(li);
    }
    review.append(list);
  }else review.append(el('p','可以离开解析后自行重做或进入下一篇；练习达成分不等同于独立测验成绩。'));
  detail.append(review,el('p','每题首次有效完整提交计入首次作答分；任何一次完整通过计入练习达成分。样例试算、取消、系统故障不计分。重试不覆盖首次结果；未作答的分值暂不计入。','assessment-note'));
  detail.append(el('p','60 分起且基础辨析满分、方法应用至少 15 分为基本达标；80 分起为掌握良好，90 分起为综合表现扎实。题组全部通过才记为完成。等级用于自学诊断，难度尚待试学校准。','assessment-note'));
  detail.append(el('p',`当前评分版本：${summary.version}。首次作答分仅依据本机保存记录，不保证未使用提示或解析。`,'assessment-note'));
  if(summary.historical_first)detail.append(el('p','首次分包含评分启用前的同版本记录；含义是本机最早保存的完整作答，不代表未看过解析。','assessment-note'));
  host.replaceChildren(title,scores,state,detail);
}
