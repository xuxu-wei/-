// 无已交付题目的目录保持“未开始”；样章与正式篇章分别聚合。
export function summarize(ids, progress={}) {
  const passed=new Set(progress.passed||[]), started=new Set(progress.started||[]);
  const total=ids.length, count=ids.filter(id=>passed.has(id)).length;
  const state=total>0&&count===total?'complete':ids.some(id=>passed.has(id)||started.has(id))?'active':'new';
  return {state,passed:count,total,label:{new:'未开始',active:'进行中',complete:'已完成'}[state]};
}
export function questionIds(item) {
  if(item.questions)return item.questions.map(q=>q.id);
  return (item.chapters||item.lessons||[]).flatMap(questionIds);
}
