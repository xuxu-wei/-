import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneProjection} from '../../web/home/scene-layout.mjs';

test('the default orbital envelope and label clearance fit between measured interface bands', () => {
  for (const width of [600,800,1280,1440,1920,2226]) {
    for (const height of [350,420,650,900]) {
      for (const level of ['universe','part','chapter']) {
        const top=345,bottom=top+height,p=sceneProjection(width,top,bottom,level);
        assert.equal(p.cx,width/2);
        assert.ok(p.cy-p.ry-20>=top);
        assert.ok(p.cy+p.ry+64<=bottom);
        assert.ok(p.radius>0 && p.ry>0 && p.rx>0);
        assert.ok(p.cy-p.radius*4.3>=top && p.cy+p.radius*4.3<=bottom);
      }
    }
  }
});

test('a taller wrapping header shifts the stage without changing horizontal drag scale', () => {
  const a=sceneProjection(1280,300,900),b=sceneProjection(1280,380,900);
  assert.equal(a.rx,b.rx);assert.equal(b.cy-a.cy,40);
  assert.ok(b.ry<=a.ry);
});
