import test from 'node:test';
import assert from 'node:assert/strict';
import {uniforms,frequencyPath,variancePath,noisePath,bayes,propagate,path,chainExperiment,alternateSize,alternateNoise,alternatePrior,alternateChain} from '../../web/probability/model.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('explicit stream and sample prefix support reproducible comparisons',()=>{
 assert.deepEqual(uniforms(0,2),[1013904223/2**32,1196435762/2**32]);
 assert.deepEqual(frequencyPath(.3,20,7),frequencyPath(.3,200,7).slice(0,20));
 assert.equal(frequencyPath(0,20,7).at(-1)[1],0);assert.equal(frequencyPath(1,20,7).at(-1)[1],1);
});
test('noise location and squared coefficient conditions',()=>{
 assert.deepEqual(variancePath(.8,.04,0,2),[0,.04,.0656]);
 noisePath(.8,0,.09,40,7).forEach(r=>assert.equal(r[1],0));
 assert.deepEqual(variancePath(-1,.04,0,2),[0,.04,.08]);
 close(variancePath(.8,.04,0,200).at(-1),.04/(1-.64));
});
test('Bayes conditions and distribution/path distinction',()=>{
 close(bayes([.2,.8],[.9,.1])[0],9/13);assert.equal(bayes([1,0],[0,1]),null);
 const rows=propagate([[.8,.2],[.1,.9]],[1,0],2);close(rows[2][1],.34);
 assert.deepEqual(path([[.8,.2],[.1,.9]],0,[.7,.8,.05]),[0,0,1,0]);
 const flip=chainExperiment(1,1,0,4,7);assert.deepEqual(flip.frequency,[0,1,0,1,0]);
 assert.deepEqual(propagate([[0,1],[1,0]],[.5,.5],2),[[.5,.5],[.5,.5],[.5,.5]]);
});
test('paired presets use actual current values and can be reversed repeatedly',()=>{
 for(let n=0;n<2;n++){assert.equal(alternateSize(alternateSize(20)),20);assert.equal(alternateNoise(alternateNoise(.04)),.04);assert.equal(alternatePrior(alternatePrior(.2)),.2);assert.deepEqual(alternateChain(...Object.values(alternateChain(.2,.1))),{alpha:.2,beta:.1});}
 assert.equal(alternateNoise(.07),0);assert.equal(alternateSize(80),20);assert.equal(alternatePrior(.65),.2);assert.deepEqual(alternateChain(.45,.1),{alpha:1,beta:1});
});
