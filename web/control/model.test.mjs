import test from 'node:test';
import assert from 'node:assert/strict';
import {piStep,piRun,poles,frequency,actuator,sensor,bellman,mpc,paired,alternate} from './model.mjs';

const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('PI freeze respects actuator and release direction',()=>{
 assert.deepEqual(piStep(2,0,1,1,1,2),{requested:2,actual:2,integral:0});
 const release=piStep(-1,3,.5,1,1,2);close(release.integral,2.5);close(release.actual,1.5);
 const run=piRun(.7,.3,.4);assert.equal(run.states.length,121);
 assert.ok(run.actual.every(value=>Math.abs(value)<=.4+1e-12));
});

test('poles and delay frequency agree with independent low-order checks',()=>{
 assert.deepEqual(poles(0,2),[[-1,0],[-.5,0]]);
 const roots=poles(2,1);close(roots[0][0],-1);close(roots[0][1],-Math.sqrt(2));
 const before=frequency(2,.5,1,0),after=frequency(2,.5,1,.4);
 close(before.magnitude,after.magnitude);close(after.phase-before.phase,-.4*180/Math.PI);
});

test('input and sensor placement retain structural counterexamples',()=>{
 const driven=actuator(true),stranded=actuator(false);
 assert.equal(driven.determinant,-1);assert.equal(stranded.determinant,0);
 close(stranded.states.at(-1)[1],0);
 const seen=sensor(true),hidden=sensor(false);
 close(seen.determinant,.1);close(hidden.determinant,0);
 assert.ok(seen.paths[1][0]-seen.paths[0][0]>1);
 assert.ok(hidden.paths[1].every((value,index)=>value===hidden.paths[0][index]));
});

test('Bellman optimum and discrete MPC expose infeasible alternatives',()=>{
 const r=bellman(1,1,2);close(r.action,-1);close(r.cost,6);close(r.valueWeight,1.5);
 const result=mpc(2,2);assert.equal(result.candidates.length,9);
 const feasible=result.candidates.filter(row=>row.cost!==null);
 assert.ok(feasible.every(row=>row.states.slice(1).every(x=>x>=-1&&x<=2)));
 close(result.best.cost,Math.min(...feasible.map(row=>row.cost)));
 assert.ok(mpc(2,.5).candidates.some(row=>row.cost===null));
});

test('paired failures remain visible and presets can return',()=>{
 const ordinary=paired(0),mismatch=paired(1);
 assert.equal(ordinary.filter(row=>row.difference===null).length,0);
 assert.ok(mismatch.filter(row=>row.difference===null).length>0);
 for(const [mode,key,initial] of [['10.1','limit',1.5],['10.2','delay',0],['10.3','second',1],['10.4','first',1],['10.5','terminal',4],['10.6','upper',2],['10.7','severity',0]]){
  const switched=alternate(mode,{[key]:initial});
  const restored=alternate(mode,switched);
  assert.equal(restored[key],initial,mode);
 }
});
