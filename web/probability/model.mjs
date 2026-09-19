// Explicit small generator for a replayable animation; formal stochastic experiments use PCG64.
export function uniforms(seed,size){let state=seed;const values=[];for(let n=0;n<size;n++){state=(1664525*state+1013904223)>>>0;values.push(state/2**32);}return values;}
export function frequencyPath(probability,size,seed){const u=uniforms(seed,size);let successes=0;return u.map((x,i)=>{successes+=x<probability?1:0;return [i+1,successes/(i+1),successes];});}
export function variancePath(a,q,p0,steps){const values=[p0];for(let n=0;n<steps;n++)values.push(a*a*values.at(-1)+q);return values;}
export function noisePath(a,q,r,steps,seed){const u=uniforms(seed,2*steps+1);let x=0;const rows=[[0,0,Math.sqrt(3*r)*(2*u[0]-1)]];for(let n=0;n<steps;n++){x=a*x+Math.sqrt(3*q)*(2*u[2*n+1]-1);rows.push([n+1,x,x+Math.sqrt(3*r)*(2*u[2*n+2]-1)]);}return rows;}
export function bayes(prior,likelihood){const w=prior.map((p,i)=>p*likelihood[i]),z=w.reduce((a,b)=>a+b,0);return z===0?null:w.map(x=>x/z);}
export function bayesPath(prior,error,observations){let p=[prior,1-prior];const rows=[[0,...p]];for(let n=0;n<observations.length;n++){p=bayes(p,observations[n]?[1-error,error]:[error,1-error]);if(!p)throw Error('此次观测的模型概率为零');rows.push([n+1,...p]);}return rows;}
export function propagate(matrix,initial,steps){const values=[initial.slice()];for(let n=0;n<steps;n++)values.push(initial.map((_,j)=>values.at(-1).reduce((s,p,i)=>s+p*matrix[i][j],0)));return values;}
export function path(matrix,initial,draws){const states=[initial];for(const u of draws){let cumulative=0,chosen=matrix.length-1;for(let j=0;j<matrix.length;j++){cumulative+=matrix[states.at(-1)][j];if(u<cumulative){chosen=j;break;}}states.push(chosen);}return states;}
export function chainExperiment(alpha,beta,active,steps,seed,repeats=200){const matrix=[[1-alpha,alpha],[beta,1-beta]],theory=propagate(matrix,[1-active,active],steps),draws=uniforms(seed,repeats*(steps+1)),counts=Array(steps+1).fill(0);let first;for(let b=0;b<repeats;b++){const offset=b*(steps+1),initial=draws[offset]<active?1:0,states=path(matrix,initial,draws.slice(offset+1,offset+steps+1));if(b===0)first=states;states.forEach((x,n)=>counts[n]+=x);}return {theory,first,frequency:counts.map(x=>x/repeats)};}
export const alternateSize = current=>current>40?20:200;
export const alternateNoise = current=>current>0?0:.04;
export const alternatePrior = current=>current>.5?.2:.8;
export const alternateChain = (alpha,beta)=>alpha===1&&beta===1?{alpha:.2,beta:.1}:{alpha:1,beta:1};
