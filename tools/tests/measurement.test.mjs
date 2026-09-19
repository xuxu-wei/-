import test from 'node:test';
import assert from 'node:assert/strict';
import {aliasFrequency,sampling,causalMean,firResponse,filterExperiment,zohCoefficients,compartment,alternateSampling,alternateWindow,alternateStep} from '../../web/measurement/model.mjs';
const close=(a,b,tolerance=1e-11)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('cosine alias agrees at sampling instants without depending on the drawing grid',()=>{
 const fine=sampling(.8,1,10,.01),coarse=sampling(.8,1,10,.073);
 assert.deepEqual(fine.samples,coarse.samples);close(fine.aliasFrequency,.2);
 fine.samples.forEach(([t,x])=>close(x,Math.cos(2*Math.PI*.2*t)));
 close(aliasFrequency(.8,4),.8);close(aliasFrequency(2.8,1),.2);close(aliasFrequency(-.8,1),.2);
 assert.equal(sampling(.8,4).samples.length,41);assert.throws(()=>sampling(1,0));assert.throws(()=>sampling(1,1,10,0));
});
test('causal FIR includes the specified zero boundary and its response has independent special cases',()=>{
 assert.deepEqual(causalMean([1,2,0],2),[.5,1.5,1]);
 assert.deepEqual(causalMean([1,2,0,0],2),[.5,1.5,1,0]);
 assert.deepEqual(causalMean([1,2,3],1),[1,2,3]);
 const h=firResponse(2,.25);close(h.real,.5);close(h.imag,-.5);close(h.magnitude,Math.SQRT1_2);close(h.phase,-Math.PI/4);
 close(firResponse(5,0).magnitude,1);assert.equal(firResponse(5,.2).phase,null);
 const exp=filterExperiment(.1,5);exp.output.slice(4).forEach(([n,y])=>close(y,exp.selected.magnitude*Math.cos(2*Math.PI*.1*n+exp.selected.phase)));
 assert.throws(()=>causalMean([1],0));assert.throws(()=>firResponse(2.5,.1));
});
test('exact zero-order-hold model matches analytic response while Euler keeps its negative and unstable values',()=>{
 assert.deepEqual(zohCoefficients(0,12),{a:1,b:12});
 const integrator=compartment(0,2,3,5,10);assert.deepEqual(integrator.exact,[[0,3],[5,13],[10,23]]);assert.deepEqual(integrator.euler,integrator.exact);
 const forced=compartment(.2,1,10,1,10);forced.exact.forEach(([t,a])=>close(a,5+5*Math.exp(-.2*t)));
 const large=compartment(.2,0,10,12);close(large.euler[1][1],-14);close(large.euler[2][1],19.6);close(large.coefficients.a,Math.exp(-2.4));close(large.eulerPole,-1.4);
 const small=compartment(.2,0,10,1);assert.ok(small.euler.every(row=>row[1]>=0));
 const tiny=zohCoefficients(1e-15,1);close(tiny.b,1);assert.throws(()=>zohCoefficients(-.1,1));assert.throws(()=>compartment(.2,0,10,0));
});
test('paired conditions return repeatedly and respond to manually selected values',()=>{
 for(let i=0;i<2;i++){assert.equal(alternateSampling(alternateSampling(1)),1);assert.equal(alternateWindow(alternateWindow(5)),5);assert.equal(alternateStep(alternateStep(1)),1);}
 assert.equal(alternateSampling(1.75),4);assert.equal(alternateSampling(2.25),1);assert.equal(alternateWindow(7),1);assert.equal(alternateWindow(1),5);assert.equal(alternateStep(3),12);assert.equal(alternateStep(8),1);
});
