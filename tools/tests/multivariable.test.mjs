import test from 'node:test';
import assert from 'node:assert/strict';
import {symmetric,rotation,closed,local,matvec,jacobian,alternatePerturbation,alternateBackflow} from '../../web/multivariable/model.mjs';
const close=(x,y,tol=1e-11)=>assert.ok(Math.abs(x-y)<tol,`${x} != ${y}`);
test('closed exchange conserves mass including zero-channel and tiny-time limits',()=>{
  for(const [a,b] of [[.2,.1],[0,.3],[.3,0],[0,0]])for(const t of [0,1e-12,1,20]){
    const state=closed(a,b,[0,6],t);close(state[0]+state[1],6);assert.ok(state.every(x=>x>=0));
    const faster=closed(a,b,[0,6],t,2),later=closed(a,b,[0,6],2*t);
    faster.forEach((x,i)=>close(x,later[i]));
  }
});
test('symmetric modes have independently decaying sum and difference',()=>{
  for(const t of [0,1,12]){const [x,y]=symmetric(.2,.1,[6,0],t);close(x+y,6*Math.exp(-.1*t));close(x-y,6*Math.exp(-.5*t));}
});
test('rotation preserves the expected radius and limits',()=>{
  for(const alpha of [0,.2])for(const omega of [0,1])for(const t of [0,1,12]){
    const state=rotation(alpha,omega,[3,4],t);close(Math.hypot(...state),5*Math.exp(-alpha*t));
  }
});
test('local comparison keeps equilibrium; large perturbation has larger discrepancy',()=>{
  assert.ok(local([2,4]).error<1e-12);
  const near=local([2.2,4]),far=local([5,4]);assert.ok(far.error>20*near.error);
  const fine=local([5,4],.0025,4800);
  const grid=Math.max(...far.original.flatMap((row,i)=>row.map((x,j)=>Math.abs(x-fine.original[2*i][j]))));
  assert.ok(grid<far.error*.05);
  assert.deepEqual(jacobian([2,4]),[[-.325,.1],[.2,-.1]]);
  assert.deepEqual(matvec([[0,0],[0,0]],[2,4]),[0,0]);
});
test('paired examples derive reversible next action from actual parameter',()=>{
  let x=.2;for(let i=0;i<4;i++){x=alternatePerturbation(x);assert.equal(x,i%2===0?3:.2);}
  assert.equal(alternatePerturbation(2),.2);assert.equal(alternatePerturbation(.5),3);
  let b=.1;for(let i=0;i<4;i++){b=alternateBackflow(b);assert.equal(b,i%2===0?0:.1);}
  assert.equal(alternateBackflow(.35),0);
});
