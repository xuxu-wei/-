// Small, explicit models for the state-estimation teaching pages.
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const transpose=a=>a[0].map((_,j)=>a.map(row=>row[j]));
export const matmul=(a,b)=>a.map(row=>transpose(b).map(col=>dot(row,col)));
export const matvec=(a,x)=>a.map(row=>dot(row,x));
export const add=(a,b)=>a.map((row,i)=>row.map((x,j)=>x+b[i][j]));
export const eye=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
const outer=(a,b)=>a.map(x=>b.map(y=>x*y));
const scale=(a,s)=>a.map(row=>row.map(x=>x*s));
const finite=x=>{if(!Number.isFinite(x))throw Error('参数必须为有限数');return x;};
const positive=x=>{finite(x);if(x<=0)throw Error('方差必须为正');return x;};
export function observability(matrix,sensor,horizon=2){
 let h=[sensor.slice()],rows=[];for(let i=0;i<horizon;i++){rows.push(h[0]);h=matmul(h,matrix);}return rows;
}
export function exchange(c=.2,total=false,steps=16){
 finite(c);if(c<0||c>.5)throw Error('交换比例必须在 0 到 0.5 内');
 const F=[[1-c,c],[c,1-c]],H=total?[1,1]:[1,0],O=observability(F,H);
 const paths=[[8,2],[2,8]].map(initial=>{const values=[initial];for(let i=0;i<steps;i++)values.push(matvec(F,values.at(-1)));return values;});
 const outputs=paths.map(path=>path.map(x=>dot(H,x))),det=O[0][0]*O[1][1]-O[0][1]*O[1][0];
 return {F,H,O,paths,outputs,rank:Math.abs(det)>1e-10?2:1,det};
}
export function hmmFilter(initial,transition,likelihoods){
 let current=initial.slice();const rows=[];
 for(let t=0;t<likelihoods.length;t++){
  const predicted=t===0?current.slice():matvec(transpose(transition),current);
  const weighted=likelihoods[t]===null?predicted.slice():predicted.map((x,j)=>x*likelihoods[t][j]);
  const evidence=weighted.reduce((a,b)=>a+b,0);
  if(!(evidence>0))return {rows,status:'impossible',failedAt:t};
  current=weighted.map(x=>x/evidence);rows.push({predicted,filtered:current.slice(),evidence});
 }return {rows,status:'ok',failedAt:null};
}
export function hmmExperiment(error=.15){
 if(error<0||error>.5)throw Error('标记翻转概率超出范围');
 const transition=[[.8,.15,.05],[.1,.8,.1],[.05,.2,.75]],initial=[.6,.3,.1];
 const observations=[0,0,1,1,1,0,1,0,0,1,1,1],bright=[error,.5,1-error];
 const likelihoods=observations.map(y=>bright.map(p=>y?p:1-p));
 return {...hmmFilter(initial,transition,likelihoods),observations,transition,initial,likelihoods};
}
export function gaussianUpdate(mean,covariance,sensor,noise,measurement){
 positive(noise);const ph=matvec(covariance,sensor),innovationVariance=dot(sensor,ph)+noise;
 const gain=ph.map(x=>x/innovationVariance),innovation=measurement-dot(sensor,mean);
 const updatedMean=mean.map((x,i)=>x+gain[i]*innovation);
 // Joseph form retains the independent observation-noise term.
 const residual=add(eye(mean.length),scale(outer(gain,sensor),-1));
 const updatedCovariance=add(matmul(matmul(residual,covariance),transpose(residual)),scale(outer(gain,gain),noise));
 return {mean:updatedMean,covariance:updatedCovariance,gain,innovation,innovationVariance};
}
export function kalmanFilter(F,Q,H,R,initialMean,initialCovariance,observations){
 let mean=initialMean.slice(),covariance=initialCovariance.map(row=>row.slice());const rows=[];
 for(let t=0;t<observations.length;t++){
  const predictedMean=t===0?mean.slice():matvec(F,mean);
  const predictedCovariance=t===0?covariance.map(row=>row.slice()):add(matmul(matmul(F,covariance),transpose(F)),Q);
  const update=observations[t]===null?{mean:predictedMean,covariance:predictedCovariance,gain:null,innovation:null,innovationVariance:null}:gaussianUpdate(predictedMean,predictedCovariance,H,R,observations[t]);
  ({mean,covariance}=update);rows.push({predictedMean,predictedCovariance,...update});
 }return rows;
}
export function kalmanExperiment(noise=.16){
 const F=[[.85,.1],[.1,.8]],Q=[[.02,0],[0,.02]],H=[1,0];
 // A fixed observation sequence, not truth data or a random draw at each render.
 const observations=[2.2,1.6,1.8,1.2,1.4,.9,1.1,.8,.7,1,.6,.5,.8,.4,.6,.3];
 return {F,Q,H,R:noise,observations,rows:kalmanFilter(F,Q,H,noise,[2,0],eye(2),observations)};
}
export function ellipse(mean,covariance,level=5.991464547107979,points=120){
 const a=Math.sqrt(Math.max(0,covariance[0][0])),b=a>0?covariance[1][0]/a:0;
 const c=Math.sqrt(Math.max(0,covariance[1][1]-b*b)),radius=Math.sqrt(level);
 return Array.from({length:points+1},(_,i)=>{const t=2*Math.PI*i/points;return [mean[0]+radius*a*Math.cos(t),mean[1]+radius*(b*Math.cos(t)+c*Math.sin(t))];});
}
export function nonlinearUpdate(mean,variance,observed,noise,method='ekf'){
 positive(variance);positive(noise);
 let predictedObservation,observationVariance,crossCovariance;
 if(method==='ekf'){
  predictedObservation=mean*mean;observationVariance=4*mean*mean*variance+noise;crossCovariance=2*mean*variance;
 }else if(method==='ukf'){
  // alpha=1, beta=2, kappa=0: Wm=[0,1/2,1/2], Wc=[2,1/2,1/2].
  const points=[mean,mean+Math.sqrt(variance),mean-Math.sqrt(variance)],wm=[0,.5,.5],wc=[2,.5,.5],values=points.map(x=>x*x);
  predictedObservation=dot(wm,values);observationVariance=noise+dot(wc,values.map(x=>(x-predictedObservation)**2));
  crossCovariance=dot(wc,points.map((x,i)=>(x-mean)*(values[i]-predictedObservation)));
 }else throw Error('未知近似');
 const gain=crossCovariance/observationVariance;
 return {mean:mean+gain*(observed-predictedObservation),variance:variance-gain*crossCovariance,gain,predictedObservation,observationVariance};
}
export function posteriorGrid(mean,variance,observed,noise,step=.02){
 positive(variance);positive(noise);positive(step);
 const xs=Array.from({length:Math.round(12/step)+1},(_,i)=>-6+i*step);
 const logs=xs.map(x=>-.5*(x-mean)**2/variance-.5*(observed-x*x)**2/noise),top=Math.max(...logs);
 const weights=logs.map((v,i)=>Math.exp(v-top)*(i===0||i===logs.length-1?.5:1)),z=weights.reduce((a,b)=>a+b,0),mass=weights.map(w=>w/z);
 const posteriorMean=dot(xs,mass),posteriorVariance=dot(xs.map(x=>(x-posteriorMean)**2),mass);
 return {xs,density:logs.map(v=>Math.exp(v-top)/(z*step)),mean:posteriorMean,variance:posteriorVariance};
}
export function nonlinearExperiment(mean=.6,noise=.15,observed=1.4){
 const variance=.8;return {mean,variance,observed,noise,grid:posteriorGrid(mean,variance,observed,noise),ekf:nonlinearUpdate(mean,variance,observed,noise,'ekf'),ukf:nonlinearUpdate(mean,variance,observed,noise,'ukf')};
}
export function normalizeLogWeights(logWeights){
 if(logWeights.some(x=>Number.isNaN(x)||x===Infinity))throw Error('对数权重不合法');
 const max=Math.max(...logWeights);if(max===-Infinity||logWeights.length===0)return null;
 const shifted=logWeights.map(x=>Math.exp(x-max)),sum=shifted.reduce((a,b)=>a+b,0);return shifted.map(x=>x/sum);
}
export function systematicResample(weights,offset=.5){
 if(!(offset>=0&&offset<1))throw Error('offset 必须在 [0,1)');
 const n=weights.length,total=weights.reduce((a,b)=>a+b,0);if(!n||weights.some(x=>x<0||!Number.isFinite(x))||Math.abs(total-1)>1e-9)throw Error('权重必须非负且和为 1');
 let j=0,cumulative=weights[0];const indices=[];
 for(let i=0;i<n;i++){const target=(i+offset)/n;while(j<n-1&&cumulative<=target)cumulative+=weights[++j];indices.push(j);}return indices;
}
export function particleExperiment(noise=.15,count=60,offset=.5){
 positive(noise);if(!Number.isInteger(count)||count<2)throw Error('粒子数至少为 2');
 // Midpoint nodes on a uniform proposal; the Gaussian prior appears in importance weights.
 const particles=Array.from({length:count},(_,i)=>-4+8*(i+.5)/count),logs=particles.map(x=>-.5*x*x/.8-.5*(1.4-x*x)**2/noise),weights=normalizeLogWeights(logs);
 const ess=1/dot(weights,weights),indices=systematicResample(weights,offset);
 return {particles,weights,ess,indices,resampled:indices.map(i=>particles[i]),grid:posteriorGrid(0,.8,1.4,noise)};
}
export function rtsScalar(filtered,transition=1){
 if(!filtered.length)return [];
 const rows=filtered.map(row=>({mean:row.mean[0],variance:row.covariance[0][0]}));
 for(let t=rows.length-2;t>=0;t--){const gain=filtered[t].covariance[0][0]*transition/filtered[t+1].predictedCovariance[0][0];rows[t]={mean:filtered[t].mean[0]+gain*(rows[t+1].mean-filtered[t+1].predictedMean[0]),variance:filtered[t].covariance[0][0]+gain*gain*(rows[t+1].variance-filtered[t+1].predictedCovariance[0][0])};}
 return rows;
}
export function smoothingExperiment(gap=true,processVariance=.08){
 positive(processVariance);const observations=[0,.2,.7,.4,.8,1.4,1.1,1.5,1.8,1.2,1.6,1.8,1.4,1.9,2.1,1.8,2.2,2,2.3,2.1].map((v,i)=>gap&&i>=6&&i<=12?null:v);
 const filtered=kalmanFilter([[1]],[[processVariance]],[1],.16,[0],[[1]],observations);
 return {observations,filtered,smoothed:rtsScalar(filtered),processVariance};
}
export const alternate=(value,first,second)=>Math.abs(value-first)<=Math.abs(value-second)?second:first;
