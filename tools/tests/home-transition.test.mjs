import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionFrame} from '../../web/home/transition.mjs';

test('entry starts at the existing target and ends at the enlarged central body',()=>{
  const source={x:1100,y:530,diameter:55},dest={x:720,y:600,diameter:318};
  const first=transitionFrame(0,source,dest,true),last=transitionFrame(1,source,dest,true);
  assert.equal(first.scale,1);assert.equal(first.x,0);assert.equal(first.y,0);assert.equal(first.opacity,1);
  assert.ok(Math.abs(source.x*last.scale+last.x-dest.x)<1e-9);
  assert.ok(Math.abs(source.y*last.scale+last.y-dest.y)<1e-9);
  assert.ok(Math.abs(last.scale*source.diameter-dest.diameter)<1e-9);
  assert.equal(last.cameraScale,1);assert.equal(last.opacity,0);assert.equal(last.labelOpacity,1);
});

test('material dissolve spans moving frames and cannot make a hard midpoint cut',()=>{
  for(const entering of [true,false]){
    const source={x:520,y:480,diameter:entering?60:120},dest={x:700,y:600,diameter:entering?318:30};
    let before=transitionFrame(0,source,dest,entering),mixed=0;
    for(let i=1;i<=100;i++){
      const current=transitionFrame(i/100,source,dest,entering);
      assert.ok(current.opacity<=before.opacity);assert.ok(current.labelOpacity>=before.labelOpacity);
      assert.ok(Math.abs(current.opacity-before.opacity)<.04);
      assert.ok(Object.values(current).every(Number.isFinite));
      if(current.opacity>0&&current.opacity<1)mixed++;
      before=current;
    }
    assert.ok(mixed>50);
    assert.equal(before.cameraScale,1);
  }
});
