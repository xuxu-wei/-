// Small deterministic browser counterparts to the published part-12 notebooks.
export function caStep(state,boundary,mode,order){
 const n=state.length,next=state.slice();
 const get=(values,i)=>boundary==='periodic'?values[(i+n)%n]:(i<0||i>=n?0:values[i]);
 if(mode==='sync')return state.map((_,i)=>get(state,i-1)^get(state,i+1));
 for(const i of order)next[i]=get(next,i-1)^get(next,i+1);
 return next;
}
export function caRun(state,boundary,mode,steps){
 const order=state.map((_,i)=>i),rows=[state.slice()];
 for(let i=0;i<steps;i++)rows.push(caStep(rows.at(-1),boundary,mode,order));
 return {rows,density:rows.map(row=>row.reduce((a,b)=>a+b,0)/row.length)};
}
export function payoff(matrix,p){
 const f0=p*matrix[0][0]+(1-p)*matrix[0][1],f1=p*matrix[1][0]+(1-p)*matrix[1][1];
 const mean=p*f0+(1-p)*f1;
 return {f0,f1,mean,rate:p*(f0-mean)};
}
export function replicator(matrix,p0,dt=.05,steps=160){
 const path=[p0];
 for(let t=0;t<steps;t++)path.push(path.at(-1)+dt*payoff(matrix,path.at(-1)).rate);
 return path;
}
export function diffuse(values,dt,boundary,steps=80){
 const alpha=dt,rows=[values.slice()],n=values.length;
 for(let t=0;t<steps;t++){
  const old=rows.at(-1);
  rows.push(old.map((value,i)=>{
   const left=boundary==='periodic'?old[(i+n-1)%n]:old[Math.max(0,i-1)];
   const right=boundary==='periodic'?old[(i+1)%n]:old[Math.min(n-1,i+1)];
   return value+alpha*(left-2*value+right);
  }));
 }
 return {rows,mass:rows.map(row=>row.reduce((a,b)=>a+b,0)),
  minimum:rows.map(row=>Math.min(...row))};
}
export function alternate(mode,settings){
 if(mode==='12.1')return {asynchronous:settings.asynchronous?0:1};
 if(mode==='12.2')return {game:settings.game?0:1};
 if(mode==='12.4')return {boundary:settings.boundary?0:1};
 throw Error('未知局部规则探索章');
}
