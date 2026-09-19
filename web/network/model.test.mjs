import test from 'node:test';
import assert from 'node:assert/strict';
import {ringRewire,graphStats,diffusion,propagate,synchrony,alternate} from './model.mjs';

test('rewiring preserves simple-graph node and edge budgets',()=>{
 for(const p of [0,.1,.45,1])for(const seed of [0,3,17]){
  const edges=ringRewire(12,4,p,seed),names=edges.map(([a,b])=>`${a}:${b}`);
  assert.equal(edges.length,24);assert.equal(new Set(names).size,24);
  assert.ok(edges.every(([a,b])=>a>=0&&a<b&&b<12));
  const stats=graphStats(12,edges);assert.equal(stats.degree.reduce((a,b)=>a+b,0),48);
 }
});

test('path and triangle statistics use graph edges rather than drawing coordinates',()=>{
 const path=graphStats(4,[[0,1],[1,2],[2,3]]);
 assert.deepEqual(path.degree,[1,2,2,1]);assert.equal(path.components,1);
 assert.ok(Math.abs(path.path-10/6)<1e-12);assert.equal(path.clustering,0);
 const split=graphStats(4,[[0,1],[2,3]]);assert.equal(split.path,null);assert.equal(split.components,2);
 const triangle=graphStats(3,[[0,1],[1,2],[0,2]]);assert.equal(triangle.clustering,1);
});

test('diffusion preserves global amount and bridge controls component balance',()=>{
 for(const bridge of [false,true]){
  const data=diffusion(bridge,.1,80);
  for(const amount of data.mass)assert.ok(Math.abs(amount-6)<1e-12);
  assert.ok(data.states.flat().every(value=>value>=-1e-12));
  if(!bridge)for(const row of data.componentMass){assert.ok(Math.abs(row[0]-4)<1e-12);assert.ok(Math.abs(row[1]-2)<1e-12);}
  else assert.ok(Math.abs(data.componentMass.at(-1)[0]-4)>.1);
 }
 assert.ok(diffusion(false,1.2,1).states[1].some(value=>value<0));
});

test('SIR uses fixed same draw stream and legal synchronous states',()=>{
 const base=propagate(false,.35),rewired=propagate(true,.35);
 for(const data of [base,rewired]){
  assert.equal(data.edges.length,24);assert.equal(data.states.length,15);
  for(const row of data.states){assert.equal(row.length,12);assert.ok(row.every(value=>[0,1,2].includes(value)));}
  for(const counts of data.counts)assert.equal(counts.reduce((a,b)=>a+b,0),12);
 }
 assert.deepEqual(propagate(true,.35).states,rewired.states);
});

test('zero coupling retains intrinsic frequency spread and presets reverse',()=>{
 const data=synchrony(false,0,60);
 assert.equal(data.edges.length,24);assert.equal(data.spread[59],null);
 assert.ok(Math.abs(data.spread[60]-.6)<1e-12);
 for(const [mode,initial]of [['11.1',{rewire:0}],['11.2',{bridge:0}],['11.3',{rewired:0}],['11.4',{rewired:0}]]){
  const changed={...initial,...alternate(mode,initial)},restored={...changed,...alternate(mode,changed)};
  assert.deepEqual(restored,initial);
 }
});
