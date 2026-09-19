// Deterministic browser explanations; full derivations and repeated experiments live in notebooks.
const key=(a,b)=>[Math.min(a,b),Math.max(a,b)].join(':');
const random=seed=>{let state=seed>>>0;return()=>((state=(1664525*state+1013904223)>>>0)/4294967296);};
export function ringRewire(n,k,probability,seed=17){
 const original=[];for(let i=0;i<n;i++)for(let d=1;d<=k/2;d++){
  const a=Math.min(i,(i+d)%n),b=Math.max(i,(i+d)%n);
  if(!original.some(e=>e[0]===a&&e[1]===b))original.push([a,b]);
 }
 original.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const edges=new Map(original.map(e=>[key(...e),e])),rng=random(seed);
 for(const [i,j] of original){if(rng()>=probability)continue;
  const options=Array.from({length:n},(_,v)=>v).filter(v=>v!==i&&!edges.has(key(i,v)));
  if(options.length){const selected=options[Math.floor(rng()*options.length)];edges.delete(key(i,j));edges.set(key(i,selected),[Math.min(i,selected),Math.max(i,selected)]);}
 }
 return [...edges.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
export function graphStats(n,edges){
 const a=Array.from({length:n},()=>Array(n).fill(0));for(const [i,j] of edges)a[i][j]=a[j][i]=1;
 const degree=a.map(row=>row.reduce((x,y)=>x+y,0));let parts=0,pathSum=0,pairs=0;
 const visited=new Set();for(let i=0;i<n;i++)if(!visited.has(i)){parts++;const queue=[i];visited.add(i);for(const v of queue)for(let w=0;w<n;w++)if(a[v][w]&&!visited.has(w)){visited.add(w);queue.push(w);}}
 for(let i=0;i<n;i++){
  const distance=Array(n).fill(-1);distance[i]=0;const queue=[i];for(const v of queue)for(let w=0;w<n;w++)if(a[v][w]&&distance[w]<0){distance[w]=distance[v]+1;queue.push(w);}
  for(let j=i+1;j<n;j++)if(distance[j]>=0){pathSum+=distance[j];pairs++;}
 }
 let clustering=0;for(let i=0;i<n;i++){
  const neighbors=Array.from({length:n},(_,j)=>j).filter(j=>a[i][j]);let connected=0;
  for(let u=0;u<neighbors.length;u++)for(let v=u+1;v<neighbors.length;v++)connected+=a[neighbors[u]][neighbors[v]];
  clustering+=neighbors.length<2?0:connected/(neighbors.length*(neighbors.length-1)/2);
 }
 return {degree,components:parts,path:parts===1&&pairs?pathSum/pairs:null,clustering:clustering/n};
}
export function diffusion(bridge,dt=.1,steps=80){
 const edges=[[0,1,1],[2,3,.5],...(bridge?[[1,2,.5]]:[])],states=[[4,0,2,0]];let amount=states[0].slice();
 for(let t=0;t<steps;t++){
  const next=amount.slice();for(const [i,j,rate] of edges){const flow=dt*rate*(amount[i]-amount[j]);next[i]-=flow;next[j]+=flow;}
  amount=next;states.push(amount.slice());
 }
 return {edges,states,mass:states.map(row=>row.reduce((a,b)=>a+b,0)),componentMass:states.map(row=>[row[0]+row[1],row[2]+row[3]])};
}
export function propagate(rewired,beta,steps=14){
 const n=12,edges=ringRewire(n,4,rewired?.45:0,41),a=Array.from({length:n},()=>Array(n).fill(0));for(const [i,j] of edges)a[i][j]=a[j][i]=1;
 const rng=random(119),states=[[1,...Array(n-1).fill(0)]];
 for(let t=0;t<steps;t++){
  const old=states.at(-1),next=old.slice(),draw=Array.from({length:n},()=>Array.from({length:n},()=>rng())),recovery=Array.from({length:n},()=>rng());
  for(let i=0;i<n;i++){
   if(old[i]===0&&old.some((value,j)=>a[i][j]&&value===1&&draw[i][j]<beta))next[i]=1;
   else if(old[i]===1&&recovery[i]<.22)next[i]=2;
  }states.push(next);
 }
 return {edges,states,counts:states.map(row=>[0,1,2].map(value=>row.filter(v=>v===value).length))};
}
export function synchrony(rewired,coupling,steps=360){
 const n=12,dt=.035,edges=ringRewire(n,4,rewired?.45:0,17),a=Array.from({length:n},()=>Array(n).fill(0));
 for(const [i,j] of edges)a[i][j]=a[j][i]=1;
 const degree=a.map(row=>row.reduce((x,y)=>x+y,0));let phases=Array.from({length:n},(_,i)=>-2.7+.49*i+.33*Math.sin(2.7*i));
 const frequencies=Array.from({length:n},(_,i)=>.7+.6*i/(n-1)),hist=[phases.slice()];
 const order=values=>Math.hypot(values.reduce((s,v)=>s+Math.cos(v),0)/n,values.reduce((s,v)=>s+Math.sin(v),0)/n);
 const r=[order(phases)];
 for(let t=0;t<steps;t++){
  const next=phases.map((v,i)=>v+dt*(frequencies[i]+coupling/Math.max(1,degree[i])*a[i].reduce((sum,edge,j)=>sum+edge*Math.sin(phases[j]-v),0)));
  phases=next;hist.push(next);r.push(order(next));
 }
 const spread=hist.map((row,t)=>{if(t<60)return null;const before=hist[t-60],rates=row.map((v,i)=>(v-before[i])/(60*dt));return Math.max(...rates)-Math.min(...rates);});
 return {edges,hist,r,spread,dt};
}
export function alternate(mode,p){
 if(mode==='11.1')return {rewire:p.rewire>.1?0:.45};
 if(mode==='11.2')return {bridge:p.bridge?0:1};
 if(mode==='11.3')return {rewired:p.rewired?0:1};
 if(mode==='11.4')return {rewired:p.rewired?0:1};
 throw Error('未知网络探索章');
}
