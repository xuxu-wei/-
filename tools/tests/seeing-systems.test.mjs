import test from 'node:test';
import assert from 'node:assert/strict';
import {stock,response,describe,alternateFlows,alternateDelay} from '../../web/seeing-systems/model.mjs';
import {questionIds,summarize} from '../../web/shared/progress.mjs';
import {readFileSync} from 'node:fs';

test('Stock keeps interval duration and preserves the failure value',()=>{
  assert.equal(stock(5,3,1,1),7);assert.equal(stock(5,3,1,3),11);
  assert.equal(stock(1,0,2,1),-1);assert.equal(stock(5,3,3,3),5);
});
test('Delay model matches hand calculations, zero action and nonconstant history',()=>{
  assert.deepEqual(response([2,2,2],.5,2,8),[2,1,0,-1,-1.5,-1.5,-1,-.25,.5]);
  assert.deepEqual(response([3,2,1],.5,2,1),[1,-.5]);
  assert.deepEqual(response([2],0,0,2),[2,2,2]);
  assert.deepEqual(describe([2,1,1,2,2,0]),{maxAbs:2,turns:2});
});
test('Presets are reversible, and derive their next action from the actual settings',()=>{
  let flows=[3,1],delay=2;
  for(let i=0;i<4;i++){flows=alternateFlows(...flows);delay=alternateDelay(delay);assert.deepEqual(flows,i%2?[3,1]:[1,3]);assert.equal(delay,i%2?2:0);}
  assert.deepEqual(alternateFlows(4,4),[3,1]);assert.equal(alternateDelay(1),0);
});
test('Part completion includes the capstone; sample records do not complete formal work',()=>{
  const course=JSON.parse(readFileSync(new URL('../../web/course/catalog.json',import.meta.url),'utf8'));
  const ids=questionIds(course.parts[0]),sampleIds=['S01-E1','S01-E2','S06-E4'];
  assert.equal(ids.length,38);assert.equal(new Set(ids).size,38);assert.equal(course.sample,undefined);
  assert.equal(summarize(ids,{passed:sampleIds}).state,'new');
  assert.equal(summarize(ids,{passed:ids.slice(0,-5)}).state,'active');
  assert.equal(summarize(ids,{passed:ids}).state,'complete');
});
