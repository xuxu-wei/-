// 第 1 篇的给定算术规则；与 Notebook 中的可见实现交叉核验。
export function stock(initial,inflow,outflow,time){return initial+time*(inflow-outflow);}
export function response(history,gain,delay,steps){
  const values=[...history];
  for(let i=0;i<steps;i++)values.push(values.at(-1)-gain*values.at(-1-delay));
  return values.slice(delay);
}
export function describe(path){
  const signs=path.slice(1).map((x,i)=>x-path[i]).filter(v=>Math.abs(v)>1e-12).map(Math.sign);
  return {maxAbs:Math.max(...path.map(Math.abs)),turns:signs.slice(1).filter((s,i)=>s!==signs[i]).length};
}
export function alternateDelay(delay){return delay===0?2:0;}
export function alternateFlows(inflow,outflow){return inflow>outflow?[1,3]:[3,1];}
