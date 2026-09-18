import test from 'node:test';
import assert from 'node:assert/strict';
import {exact,euler,grid,properties,alternateNumerical,alternateInterval,alternateSpeed} from '../../web/time-evolution/model.mjs';
test('continuous solution handles initial state, equilibrium and zero/tiny clearance',()=>{
  assert.equal(exact(2,3,0,2),8);assert.equal(exact(0,1,.5,7),7);
  assert.ok(Math.abs(exact(20,1,.5,2)-2)<1e-12);
  assert.ok(Math.abs(exact(1,1,1e-14,2)-3)<1e-12);
  for(const time of [0,.1,1,3])assert.ok(Math.abs(exact(time,1,1e-320,2)-(2+time))<1e-14);
});
test('actual step widths respect end and update balance',()=>{
  const {times,values}=euler(0,1,.5,.8,3);
  assert.equal(times.at(-1),3);assert.equal(times.length,5);
  for(let i=1;i<times.length;i++)assert.ok(Math.abs(values[i]-values[i-1]-(times[i]-times[i-1])*(1-.5*values[i-1]))<1e-12);
  assert.deepEqual(grid([0,.5,2],1),[0,.5,1.5,2]);
});
test('negative example toggles both ways twice and keeps the continuous problem',()=>{
  let p={initial:10,u:0,k:.75,h:1};
  for(const first of [-5,2.5,-5,2.5]){p=alternateNumerical(p);assert.equal(euler(p.initial,p.u,p.k,p.h).values[1],first);assert.equal(p.k,.75);}
  assert.deepEqual(properties(.75,2),{q:-.5,stable:true,nonnegative:false});
  assert.deepEqual(properties(.5,4),{q:-1,stable:false,nonnegative:false});
  assert.deepEqual(properties(0,1),{q:1,stable:false,nonnegative:true});
});
test('other presets support repeated reversals after manual edits',()=>{
  let h=1.75;for(const expected of [.25,1,.25,1]){h=alternateInterval(h);assert.equal(h,expected);}
  let k=.8;for(const expected of [.5,1,.5,1]){const next=alternateSpeed(k);k=next.k;assert.equal(k,expected);assert.equal(next.u/k,2);}
});
