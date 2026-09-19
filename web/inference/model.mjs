// Small explicit models corresponding to Part 9. No network or learner state.
export const readings=[1,3,2,1.5,2.5,1.8,2.2,1.2,2.8,1.9,2.1,2];
export const observations=[-1.4,-1.1,-.8,-.5,.6,.9,1.2,1.6];
export function normal(x,m=0,v=1){return Math.exp(-.5*(x-m)**2/v)/Math.sqrt(2*Math.PI*v);}
export function conjugate(count,noise=2){
 const v=1/(.25+count/noise),m=v*readings.slice(0,count).reduce((s,x)=>s+x,0)/noise;
 return {mean:m,variance:v,predictive:v+noise};
}
function lse(a,b){const top=Math.max(a,b);return top+Math.log(Math.exp(a-top)+Math.exp(b-top));}
export function logMixture(x,d){return lse(-.5*(x-d)**2,-.5*(x+d)**2)-.5*Math.log(2*Math.PI)-Math.log(2);}
export function replay(initial,increments,uniforms,separation){
 const path=[initial],accepted=[];let x=initial;
 for(let i=0;i<increments.length;i++){
  const candidate=x+increments[i],take=uniforms[i]===0||Math.log(uniforms[i])<Math.min(0,logMixture(candidate,separation)-logMixture(x,separation));
  if(take)x=candidate;accepted.push(take);path.push(x);
 }
 return {path,accepted};
}
function generator(seed){let state=seed>>>0;return()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return(state+.5)/4294967296;};}
export function chains(separation,step,count=600){
 return [-separation,separation].map((start,j)=>{
  const random=generator(9201+j),increments=[],uniforms=[];
  for(let i=0;i<count;i++){increments.push(step*Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random()));uniforms.push(random());}
  return replay(start,increments,uniforms,separation);
 });
}
export function meanField(rho,steps=20){
 const variance=1-rho*rho,history=[];let m=[2,-2];
 function record(){return {mean:[...m],variance,gap:.5*((m[0]**2-2*rho*m[0]*m[1]+m[1]**2)/variance-Math.log(variance))};}
 history.push(record());for(let i=0;i<steps;i++){m=[rho*m[1],rho*rho*m[1]];history.push(record());}return history;
}
export function emStep(values,weights,means,variance){
 const responsibilities=[];let likelihood=0;
 for(const y of values){const logs=means.map((m,i)=>weights[i]>0?Math.log(weights[i])-.5*((y-m)**2/variance+Math.log(2*Math.PI*variance)):-Infinity),z=lse(...logs);likelihood+=z;responsibilities.push(logs.map(l=>Math.exp(l-z)));}
 const totals=means.map((_,j)=>responsibilities.reduce((s,r)=>s+r[j],0));
 return {responsibilities,weights:totals.map(n=>n/values.length),means:means.map((m,j)=>totals[j]>0?values.reduce((s,y,i)=>s+responsibilities[i][j]*y,0)/totals[j]:m),likelihood};
}
export function emTrace(symmetric,variance=.25,steps=20){
 let means=symmetric?[0,0]:[-1,1],weights=[.5,.5];const rows=[];
 for(let i=0;i<=steps;i++){const r=emStep(observations,weights,means,variance);rows.push({...r,means:[...means],weights:[...weights]});means=r.means;weights=r.weights;}return rows;
}
// A&S erf approximation; maximum absolute error about 1.5e-7.
export function cdf(z){const sign=z<0?-1:1,x=Math.abs(z)/Math.sqrt(2),t=1/(1+.3275911*x);const erf=sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x));return .5*(1+erf);}
export function prediction(parameterVariance,noiseVariance,noiseMultiplier){
 const variance=parameterVariance+noiseVariance,actual=parameterVariance+noiseMultiplier*noiseVariance,half=1.95996398454*Math.sqrt(variance);
 return {variance,actual,half,coverage:2*cdf(half/Math.sqrt(actual))-1,parameterHalf:1.95996398454*Math.sqrt(parameterVariance)};
}
export function alternate(mode,p){
 if(mode==='9.1')return {noise:p.noise>=4?2:6};
 if(mode==='9.2')return {separation:p.separation>=3?0:4};
 if(mode==='9.3')return {rho:p.rho>=.5?0:.8};
 if(mode==='9.4')return {symmetric:p.symmetric?0:1};
 if(mode==='9.5')return {multiplier:p.multiplier>1?1:4};
 throw Error('未知探索章');
}
