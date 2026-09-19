import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomStep, ZOOM_LIMITS} from '../../web/home/zoom.mjs';

const root = {level:'universe',hasChildren:true,hasParent:false,now:1000};

test('wheel sign controls smooth zoom before entering at the threshold', () => {
  const closer = zoomStep({scale:1},-100,root);
  assert.ok(closer.scale>1 && closer.scale<ZOOM_LIMITS.enter);
  assert.equal(closer.action,null);
  const entered = zoomStep({scale:1.7},-50,root);
  assert.deepEqual(entered,{scale:1,action:'enter',lastTransitionAt:1000});
  const undo = zoomStep(closer,100,root);
  assert.ok(Math.abs(undo.scale-1)<1e-12);
});

test('leave occurs only on outward wheel movement with a parent', () => {
  const options={...root,level:'part',hasParent:true};
  assert.deepEqual(zoomStep({scale:.7},50,options),{scale:1,action:'leave',lastTransitionAt:1000});
  assert.equal(zoomStep({scale:1.9},1,options).action,null);
  assert.equal(zoomStep({scale:.6},-1,options).action,null);
  assert.equal(zoomStep({scale:1},10000,root).action,null);
  assert.equal(zoomStep({scale:1},10000,root).scale,ZOOM_LIMITS.min);
});

test('chapter and concept views never enter a lesson or open an IDE through scrolling', () => {
  for(const level of ['chapter','concept',2,3]) {
    const result=zoomStep({scale:1},-10000,{...root,level,hasChildren:true,hasParent:true});
    assert.equal(result.action,null);
    assert.equal(result.scale,ZOOM_LIMITS.max);
  }
  assert.equal(zoomStep({scale:1},-10000,{...root,level:'part',hasChildren:false}).action,null);
});

test('700 ms cooldown consumes inertia without accumulating another zoom', () => {
  const entered=zoomStep({scale:1},-500,root);
  assert.equal(entered.action,'enter');
  for(const elapsed of [0,20,300,699]) {
    for(const delta of [-1000,1000]) {
      const result=zoomStep(entered,delta,{...root,level:'part',hasParent:true,now:1000+elapsed});
      assert.deepEqual(result,{scale:1,action:null,lastTransitionAt:1000});
    }
  }
  const atBoundary=zoomStep(entered,-500,{...root,level:'part',hasParent:true,now:1700});
  assert.deepEqual(atBoundary,{scale:1,action:'enter',lastTransitionAt:1700});
});

test('direction changes can leave and re-enter after separate cooldown periods', () => {
  const down=zoomStep({scale:1},-500,root);
  const up=zoomStep(down,500,{...root,level:'part',hasParent:true,now:1700});
  assert.deepEqual(up,{scale:1,action:'leave',lastTransitionAt:1700});
  const again=zoomStep(up,-500,{...root,now:2400});
  assert.deepEqual(again,{scale:1,action:'enter',lastTransitionAt:2400});
});

test('reduced motion preserves navigation and caller state is never mutated', () => {
  const state=Object.freeze({scale:1.75,lastTransitionAt:0});
  const options=Object.freeze({...root,reducedMotion:true});
  assert.deepEqual(zoomStep(state,-100,options),zoomStep(state,-100,root));
  assert.deepEqual(state,{scale:1.75,lastTransitionAt:0});
  assert.equal(zoomStep(state,NaN,root).action,null);
  assert.equal(zoomStep(state,Infinity,root).action,null);
  assert.equal(zoomStep(state,-100,{...root,now:NaN}).action,null);
  assert.equal(zoomStep({},0,root).scale,1);
});
