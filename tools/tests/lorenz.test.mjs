import test from 'node:test';
import assert from 'node:assert/strict';
import {lorenzField,lorenzJacobian,rk4,lorenzPath,directedSection,tangentGrowth} from '../../web/nonlinear/lorenz-model.mjs';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('Lorenz exact equilibria and symmetric vector fields',()=>{
 for(const rho of [.5,10,28]){assert.deepEqual(lorenzPath([0,0,0],10,rho,8/3,.01,10),Array.from({length:11},()=>[0,0,0]));if(rho>1){const x=Math.sqrt((8/3)*(rho-1));lorenzField([x,x,rho-1],10,rho,8/3).forEach(x=>close(x,0));}}
 const a=lorenzField([1,2,3]),b=lorenzField([-1,-2,3]);a.forEach((v,j)=>close(b[j],j===2?v:-v));
 assert.deepEqual(lorenzJacobian([1,2,3],10,28,2),[[-10,10,0],[25,-1,-1],[2,1,-2]]);
});
test('RK4 is fourth order on an independent analytic linear problem',()=>{
 const errors=[.2,.1,.05].map(h=>{let v=[1];for(let i=0;i<Math.round(1/h);i++)v=rk4(x=>[-x[0]],v,h);return Math.abs(v[0]-Math.exp(-1));});assert.ok(errors[0]/errors[1]>15);assert.ok(errors[1]/errors[2]>15);
});
test('Directed section keeps endpoint once, interpolates all coordinates and preserves empty',()=>{
 const ts=[0,1,2,3],states=[[0,0,-1],[2,4,1],[4,8,-1],[6,12,1]];assert.deepEqual(directedSection(ts,states,0),[[.5,1,2,0],[2.5,5,10,0]]);assert.deepEqual(directedSection(ts,states,0,1),[[2.5,5,10,0]]);assert.deepEqual(directedSection([0,1],[[0,0,1],[0,0,0]],0),[]);assert.equal(directedSection(ts,[[0,0,-1],[0,0,0],[0,0,0],[0,0,1]],0).length,1);
});
test('Tangent elapsed time includes final partial segment and rejects zero direction',()=>{
 const a=tangentGrowth([1,1,1],10,28,8/3,.001,137,13,0).at(-1),b=tangentGrowth([1,1,1],10,28,8/3,.001,137,1,0).at(-1);close(a[0],.137);close(a[1],b[1]);assert.throws(()=>tangentGrowth([1,1,1],10,28,8/3,.01,100,10,0,[0,0,0]));
});
