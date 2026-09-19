import test from 'node:test';
import assert from 'node:assert/strict';
import {caStep,caRun,payoff,replicator,diffuse,alternate} from './model.mjs';

const close=(actual,expected,tolerance=1e-12)=>assert.ok(Math.abs(actual-expected)<tolerance,actual+' != '+expected);

test('synchronous local update reads only old state and boundary is explicit',()=>{
 assert.deepEqual(caStep([1,0,0,0],'periodic','sync',[3,2,1,0]),[0,1,0,1]);
 assert.deepEqual(caStep([1,0,0,0],'fixed','sync',[0,1,2,3]),[0,1,0,0]);
 assert.deepEqual(caStep([1,0,0,0],'periodic','async',[0,1,2,3]),[0,0,0,0]);
});
test('space-time rows preserve declared update budget and legal bits',()=>{
 const state=[0,1,0,0,1,0,0],run=caRun(state,'periodic','async',8);
 assert.equal(run.rows.length,9);
 assert.ok(run.rows.every(row=>row.length===7&&row.every(v=>v===0||v===1)));
 assert.ok(run.density.every(v=>v>=0&&v<=1));
});
test('replicator payoff and boundary derivative agree with direct algebra',()=>{
 const matrix=[[3,0],[4,1]],result=payoff(matrix,.25);
 close(result.f0,.75);close(result.f1,1.75);close(result.rate,.25*.75*(-1));
 close(payoff(matrix,0).rate,0);close(payoff(matrix,1).rate,0);
 const path=replicator(matrix,.8);
 assert.ok(path.every((v,i)=>v>=0&&v<=1&&(i===0||v<=path[i-1])));
});
test('pure diffusion conserves amount but excessive step creates negative artifacts',()=>{
 const initial=[2,0,0,0],good=diffuse(initial,.2,'periodic',30),bad=diffuse(initial,.55,'periodic',30);
 close(good.mass.at(-1),2);close(bad.mass.at(-1),2,1e-9);
 assert.ok(good.minimum.every(v=>v>=-1e-12));
 assert.ok(bad.minimum.some(v=>v<0));
 assert.notDeepEqual(diffuse(initial,.2,'noflux',2).rows[1],good.rows[1]);
});
test('every comparison preset reverses and returns to the original mode',()=>{
 for(const [mode,key]of [['12.1','asynchronous'],['12.2','game'],['12.4','boundary']]){
  const first={};first[key]=0;
  const switched={...first,...alternate(mode,first)};
  const restored={...switched,...alternate(mode,switched)};
  assert.equal(switched[key],1);assert.deepEqual(restored,first);
 }
});
