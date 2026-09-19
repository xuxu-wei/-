// The small browser models are deterministic teaching views, not hidden data.
export function meanfieldStep(spins,beta,draws){
 const m=spins.reduce((a,b)=>a+b,0)/spins.length;
 const plus=(1+Math.tanh(beta*m))/2;
 return draws.map(value=>value<plus?1:-1);
}
function stream(seed){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
export function finitePath(beta,n,steps,seed){
 const draw=stream(seed),spins=Array(n).fill(1),path=[1];let current=spins;
 for(let t=0;t<steps;t++){
  current=meanfieldStep(current,beta,Array.from({length:n},draw));
  path.push(current.reduce((a,b)=>a+b,0)/n);
 }
 return path;
}
export function meanfieldPath(beta,steps,start=1){
 const path=[start];for(let t=0;t<steps;t++)path.push(Math.tanh(beta*path.at(-1)));return path;
}
export function cascade(n,edges,thresholds,seeds){
 const neighbors=Array.from({length:n},()=>new Set());for(const[a,b]of edges){neighbors[a].add(b);neighbors[b].add(a);}
 const failed=new Set(seeds),rounds=[[...failed].sort((a,b)=>a-b)];
 for(let t=0;t<n;t++){
  const added=[];for(let i=0;i<n;i++)if(!failed.has(i)&&[...neighbors[i]].filter(j=>failed.has(j)).length>=thresholds[i])added.push(i);
  if(!added.length)break;for(const i of added)failed.add(i);rounds.push(added);
 }
 return rounds;
}
export function largestSurvivor(n,edges,failedList){
 const alive=new Set(Array.from({length:n},(_,i)=>i).filter(i=>!failedList.includes(i))),adj=Array.from({length:n},()=>[]);
 for(const[a,b]of edges)if(alive.has(a)&&alive.has(b)){adj[a].push(b);adj[b].push(a);}
 let largest=0;while(alive.size){const start=alive.values().next().value,stack=[start];alive.delete(start);let size=0;
  while(stack.length){const i=stack.pop();size++;for(const j of adj[i])if(alive.delete(j))stack.push(j);}
  largest=Math.max(largest,size);
 }
 return largest/n;
}
export function recovery(rate,boundary,start,dt,steps){
 const path=[start];for(let t=0;t<steps;t++){
  const value=path.at(-1);path.push(value-dt*rate*value*(1-value/boundary));
 }return path;
}
export function ar1(rhos,sigmas,shocks){
 const path=[0];for(let i=0;i<shocks.length;i++)path.push(rhos[i]*path.at(-1)+sigmas[i]*shocks[i]);return path;
}
export function pastVariance(values,t,window){
 if(t+1<window)return null;const tail=values.slice(t-window+1,t+1),mean=tail.reduce((a,b)=>a+b,0)/window;
 return tail.reduce((a,b)=>a+(b-mean)**2,0)/window;
}
export function standardShocks(length,seed){
 const draw=stream(seed),shocks=[];for(let i=0;i<length;i++){
  const u=Math.max(draw(),1e-12),v=draw();shocks.push(Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v));
 }return shocks;
}
export function alternate(mode,settings){
 if(mode==='13.1')return{beta:settings.beta>1?0.8:1.2};
 if(mode==='13.2')return{structure:settings.structure?0:1};
 if(mode==='13.3')return{boundary:settings.boundary>1?1:2};
 throw Error('Unknown resilience view');
}
