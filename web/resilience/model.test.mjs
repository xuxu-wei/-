import test from 'node:test';
import assert from 'node:assert/strict';
import {meanfieldStep,finitePath,meanfieldPath,cascade,largestSurvivor,recovery,
        ar1,pastVariance,standardShocks,alternate} from './model.mjs';

test('finite binary update uses only the old mean and deterministic draws',()=>{
 assert.deepEqual(meanfieldStep([1,-1,1,-1],0,[.2,.4,.6,.8]),[1,1,-1,-1]);
 assert.deepEqual(finitePath(.8,40,10,31),finitePath(.8,40,10,31));
 assert.notDeepEqual(finitePath(.8,40,10,31),finitePath(.8,40,10,32));
 assert.equal(meanfieldPath(0,2,.4)[1],0);
});

test('cascade keeps direct and secondary failures in distinct synchronous rounds',()=>{
 const edges=[[0,1],[1,2],[2,3]];
 assert.deepEqual(cascade(4,edges,[1,1,1,1],[0]),[[0],[1],[2],[3]]);
 assert.deepEqual(cascade(4,edges,[2,2,2,2],[0]),[[0]]);
 assert.deepEqual(cascade(4,edges,[1,1,1,1],[]),[[]]);
 assert.equal(largestSurvivor(4,edges,[1]),.5);
 assert.equal(largestSurvivor(4,edges,[0,1,2,3]),0);
});

test('recovery rate and basin independently change finite-perturbation direction',()=>{
 const outside=recovery(1.5,1,1.4,.02,25),inside=recovery(1.5,2,1.4,.02,25);
 assert.ok(outside.at(-1)>1.4);
 assert.ok(inside.at(-1)<1.4);
 assert.ok(recovery(1.5,1,.2,.02,25).at(-1)<.2);
});

test('past variance excludes future samples and noise alone changes variance',()=>{
 assert.equal(pastVariance([0,1,2,3,999],3,4),1.25);
 assert.equal(pastVariance([0,1,2,3],3,4),1.25);
 assert.equal(pastVariance([0,1,2],2,4),null);
 const shocks=standardShocks(100,44);
 assert.deepEqual(shocks,standardShocks(100,44));
 const low=ar1(Array(100).fill(.7),Array(100).fill(.2),shocks);
 const high=ar1(Array(100).fill(.7),Array(100).fill(.5),shocks);
 assert.ok(pastVariance(high,100,100)>pastVariance(low,100,100));
});

test('every comparison preset is reversible',()=>{
 for(const[mode,initial,key]of [['13.1',{beta:.8},'beta'],['13.2',{structure:0},'structure'],['13.3',{boundary:1},'boundary']]){
  const changed=alternate(mode,initial),restored=alternate(mode,{...initial,...changed});
  assert.notEqual(changed[key],initial[key]);assert.equal(restored[key],initial[key]);
 }
});
