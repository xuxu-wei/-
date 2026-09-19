import test from 'node:test';
import assert from 'node:assert/strict';
import {conjugate,readings,normal,replay,chains,meanField,emStep,emTrace,observations,cdf,prediction,alternate} from './model.mjs';
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
test('conjugate update matches independent sequential conditioning for every displayed count',()=>{
 for(const r of [.25,2,6]){let m=0,v=4;for(let n=0;n<=12;n++){const result=conjugate(n,r);near(result.mean,m);near(result.variance,v);near(result.predictive,v+r);const k=v/(v+r);m+=k*(readings[n]-m);v*=1-k;}}
});
test('fixed proposals replay accepted and rejected states, including zero uniform',()=>{
 const result=replay(0,[1,3,-2],[.2,.9,.3],0);assert.deepEqual(result.path,[0,1,1,-1]);assert.deepEqual(result.accepted,[true,false,true]);assert.equal(replay(0,[100],[0],0).path[1],100);
});
test('seeded short chains are reproducible and finite across slider extremes',()=>{
 for(const d of [0,4,5])for(const step of [.1,.6,3]){const a=chains(d,step),b=chains(d,step);assert.deepEqual(a,b);assert.equal(a.length,2);assert.equal(a[0].path.length,601);assert.ok(a.every(c=>c.path.every(Number.isFinite)));}
});
test('mean-field full sweeps reduce KL toward the exact family floor',()=>{
 for(const rho of [0,.4,.8,.95]){const a=meanField(rho,200),floor=-.5*Math.log(1-rho*rho);near(a.at(-1).gap,floor,1e-9);for(let i=1;i<a.length;i++)assert.ok(a[i].gap<=a[i-1].gap+1e-12);near(a.at(-1).variance,1-rho*rho);}
});
test('responsibilities use old parameters and EM likelihood is monotone',()=>{
 const r=emStep([-1,1],[.5,.5],[-1,1],1);near(r.responsibilities[0][0],1/(1+Math.exp(-2)));near(r.means[0],-Math.tanh(1));
 for(const v of [.1,.25,2])for(const symmetric of [true,false]){const trace=emTrace(symmetric,v);for(let i=1;i<trace.length;i++)assert.ok(trace[i].likelihood>=trace[i-1].likelihood-1e-12);if(symmetric)near(trace.at(-1).means[0],trace.at(-1).means[1]);}
});
test('zero-weight component keeps its unused mean, not NaN',()=>{const r=emStep(observations,[0,1],[5,0],.25);near(r.weights[0],0);near(r.means[0],5);assert.ok(Number.isFinite(r.likelihood));});
test('prediction coverage matches tabulated normal probabilities and exposes mismatch',()=>{
 near(cdf(0),.5,1e-7);near(cdf(1.95996398454),.975,1e-7);near(cdf(-1),.158655253931,1e-7);
 for(const v of [.05,.8,2]){const correct=prediction(v,1,1),wrong=prediction(v,1,4);near(correct.coverage,.95,2e-7);near(correct.half,wrong.half);assert.ok(wrong.coverage<correct.coverage&&correct.half>correct.parameterHalf);near(normal(0,0,1),1/Math.sqrt(2*Math.PI));}
});
test('all alternate presets return to their original default conditions',()=>{
 const defaults={'9.1':{noise:2},'9.2':{separation:4},'9.3':{rho:.8},'9.4':{symmetric:0},'9.5':{multiplier:1}};
 for(const [mode,p]of Object.entries(defaults)){const changed=alternate(mode,p);assert.notDeepEqual(changed,p);assert.deepEqual(alternate(mode,changed),p);}
});
