import test from 'node:test';
import assert from 'node:assert/strict';
import {exchange,hmmFilter,gaussianUpdate,kalmanFilter,kalmanExperiment,ellipse,nonlinearUpdate,posteriorGrid,normalizeLogWeights,systematicResample,particleExperiment,smoothingExperiment,alternate} from '../../web/estimation/model.mjs';
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('observability separates one-room and total sensors including zero exchange',()=>{
 const one=exchange(.2,false),total=exchange(.2,true);assert.equal(one.rank,2);assert.equal(total.rank,1);assert.equal(exchange(0,false).rank,1);
 one.paths.flat().forEach(x=>close(x[0]+x[1],10));total.outputs.flat().forEach(x=>close(x,10));assert.throws(()=>exchange(-.1));
});
test('HMM has a direct initial update, missing data and impossible-observation status',()=>{
 const result=hmmFilter([.6,.4],[[.8,.2],[.1,.9]],[[.5,.25],null]);close(result.rows[0].filtered[0],.75);close(result.rows[1].filtered[0],.625);assert.equal(result.status,'ok');
 const missing=hmmFilter([.6,.4],[[.8,.2],[.1,.9]],[null,null]);close(missing.rows[0].filtered[0],.6);close(missing.rows[1].filtered[0],.52);
 assert.equal(hmmFilter([1,0],[[1,0],[0,1]],[[0,1]]).status,'impossible');assert.deepEqual(hmmFilter([1,0],[[1,0],[0,1]],[]).rows,[]);
});
test('Gaussian conditioning agrees with scalar hand calculation and ellipse probability contour',()=>{
 const r=gaussianUpdate([0],[[4]],[1],1,2);close(r.mean[0],1.6);close(r.covariance[0][0],.8);close(r.gain[0],.8);
 for(const [x,y] of ellipse([2,-1],[[4,0],[0,1]]))close((x-2)**2/4+(y+1)**2,5.991464547107979);
 const missing=kalmanFilter([[1]],[[.2]],[1],1,[0],[[4]],[null,null]);close(missing[0].covariance[0][0],4);close(missing[1].covariance[0][0],4.2);
 for(const r of kalmanExperiment().rows){close(r.covariance[0][1],r.covariance[1][0]);assert.ok(r.covariance[0][0]>0);assert.ok(r.covariance[0][0]*r.covariance[1][1]>r.covariance[0][1]**2);}
});
test('unscented square moments match analytic Gaussian moments but miss symmetric bimodality',()=>{
 for(const mean of [-1,0,.6,2])for(const variance of [.1,.8,2]){
  const r=nonlinearUpdate(mean,variance,1.4,.15,'ukf');close(r.predictedObservation,mean*mean+variance);close(r.observationVariance,2*variance**2+4*mean*mean*variance+.15);
 }
 for(const method of ['ekf','ukf']){const r=nonlinearUpdate(0,.8,1.4,.15,method);close(r.mean,0);close(r.variance,.8);}
 const grid=posteriorGrid(0,.8,1.4,.15);close(grid.mean,0);assert.ok(grid.variance>1);assert.ok(grid.density[300]<Math.max(...grid.density)/100);
 assert.throws(()=>nonlinearUpdate(0,0,1,.1));
});
test('stable log weights, impossible likelihood and exact CDF boundary resampling',()=>{
 const w=normalizeLogWeights([-1000,-1001]);close(w[0],1/(1+Math.exp(-1)));assert.equal(normalizeLogWeights([-Infinity,-Infinity]),null);
 assert.deepEqual(systematicResample([0,.5,.5],0),[1,1,2]);assert.deepEqual(systematicResample([.25,.25,.25,.25],0),[0,1,2,3]);assert.throws(()=>systematicResample([.5,.5],1));
 for(const n of [12,60,96,120])for(const r of [.05,.15,1]){const result=particleExperiment(r,n);close(result.weights.reduce((a,b)=>a+b,0),1);assert.ok(result.ess>=1&&result.ess<=n);assert.equal(result.indices.length,n);assert.ok(result.indices.every(i=>i>=0&&i<n));}
});
test('RTS missing-data variance and end-point consistency with repeatable paired presets',()=>{
 for(const gap of [false,true])for(const q of [.02,.08,.3]){
  const r=smoothingExperiment(gap,q);r.smoothed.forEach((s,i)=>assert.ok(s.variance>0&&s.variance<=r.filtered[i].covariance[0][0]+1e-12));close(r.smoothed.at(-1).mean,r.filtered.at(-1).mean[0]);close(r.smoothed.at(-1).variance,r.filtered.at(-1).covariance[0][0]);
  if(gap)assert.ok(r.filtered[12].covariance[0][0]>r.filtered[5].covariance[0][0]);
 }
 for(const[a,b]of [[.14,.5],[.16,.8],[0,.6],[12,96]]){let value=a;for(let i=0;i<4;i++)value=alternate(value,a,b);assert.equal(value,a);}
});
