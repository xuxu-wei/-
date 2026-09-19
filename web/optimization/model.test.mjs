import test from 'node:test';
import assert from 'node:assert/strict';
import {quadratic,descent,shrinkage,allocation,feasiblePolygon,alternate} from './model.mjs';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
test('quadratic values and central-difference gradient',()=>{
 const H=[[2,.6],[.6,3]],b=[1,2],x=[.8,-.4],r=quadratic(H,b,x),eps=1e-5;
 for(let j=0;j<2;j++){const a=x.slice(),c=x.slice();a[j]+=eps;c[j]-=eps;close(r.gradient[j],(quadratic(H,b,a).value-quadratic(H,b,c).value)/(2*eps));}
});
test('descent matches explicit geometric powers including strict boundary and instability',()=>{
 for(const L of [1,10,20])for(const rho of [.2,1.5,2,2.2,2.6]){
  const r=descent(L,rho);for(let n=0;n<=30;n++)for(let j=0;j<2;j++)close(r.points[n][j],[1.6,1.4][j]*r.factors[j]**n,1e-7);
 }
 close(Math.abs(descent(10,2).points[30][1]),1.4);
 assert.ok(Math.abs(descent(10,2.2).points[30][1])>100);
});
test('orthogonal regularization obeys zero penalty and exact threshold boundaries',()=>{
 assert.deepEqual(shrinkage(0),{ridge:[1.4,.55],sparse:[1.4,.55]});
 assert.equal(shrinkage(.55).sparse[1],0);assert.deepEqual(shrinkage(1.4).sparse,[0,0]);
 for(const l of [.1,.55,1,1.8]){
  const r=shrinkage(l);r.ridge.forEach((v,i)=>close((1+l)*v,[1.4,.55][i]));
  r.sparse.forEach((v,i)=>{const g=v-[1.4,.55][i];assert.ok(v===0?Math.abs(g)<=l+1e-12:Math.abs(g+l*Math.sign(v))<1e-12);});
 }
});
test('allocation checks certificate, all budgets and independent feasible grid bound',()=>{
 for(let B=.5;B<=5.001;B+=.025){const r=allocation(B);if(B<1){assert.equal(r.point,null);assert.equal(r.value,null);continue;}
  assert.ok(Math.max(...r.residuals)<1e-10);assert.ok(r.point.every(x=>x>=.5-1e-12&&x<=3+1e-12));
  for(let x=.5;x<=3;x+=.1)for(let y=.5;y<=3;y+=.1)if(x+y<=B+1e-12)assert.ok(r.value<=x*x+2*y*y-4*x-8*y+1e-9);
 }
 close(allocation(2).point[0],2/3);close(allocation(2).point[1],4/3);close(allocation(2).value,-28/3);
 assert.deepEqual(allocation(1).point,[.5,.5]);assert.deepEqual(allocation(5).point,[2,2]);
});
test('feasible polygon never includes a forbidden vertex',()=>{
 assert.deepEqual(feasiblePolygon(.8),[]);
 for(const B of [1,1.3,2,4,5])for(const [x,y]of feasiblePolygon(B))assert.ok(x>=.5&&y>=.5&&x<=3&&y<=3&&x+y<=B+1e-12);
});
test('two-way preset has no one-way trap',()=>{assert.equal(alternate(2,2,-1),-1);assert.equal(alternate(-1,2,-1),2);});
