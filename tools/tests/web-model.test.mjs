import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exactAmount, euler, diagnose} from '../../web/single-compartment/model.mjs';

test('zero clearance and zero flow have independent closed-form limits', () => {
  assert.equal(exactAmount(20, {u:1,k:0,A0:2}), 22);
  assert.equal(exactAmount(20, {u:0,k:0,A0:3}), 3);
  assert.equal(exactAmount(0, {u:1,k:.5,A0:4}), 4);
  assert.ok(Math.abs(exactAmount(20, {u:1,k:1e-12,A0:2})-22) < 1e-8);
});

test('Euler first steps and loss of positivity are observable', () => {
  const result = euler();
  [0,.1,.195,.28525].forEach((a,i) => assert.ok(Math.abs(result.amounts[i]-a)<1e-12));
  const p = {u:0,k:.75,A0:10};
  const failure = euler(p,2);
  assert.equal(failure.amounts[1],-5);
  const status = diagnose(p,2,failure.amounts);
  assert.equal(status.stable,true);
  assert.equal(status.positivity,false);
  assert.equal(status.hasNegative,true);
  assert.ok(euler(p,1).amounts.every(x=>x>=0));
});

test('stability boundary and divergence are retained', () => {
  assert.ok(euler({u:0,k:.5,A0:10},4).amounts.every(x=>Math.abs(x)===10));
  assert.equal(euler({u:0,k:.5,A0:10},5).amounts.at(-1),50.625);
  assert.equal(diagnose({u:1,k:0,A0:0},5,euler({k:0},5).amounts).stable,null);
});

test('invalid parameters stop before calculation', () => {
  for (const h of [0,-1,NaN,.3,1e-9]) assert.throws(()=>euler({},h),RangeError);
  assert.throws(()=>exactAmount(-1),RangeError);
  assert.throws(()=>exactAmount(1,{k:-1}),RangeError);
  assert.throws(()=>exactAmount(1,{u:Infinity}),RangeError);
});
