import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback} from '../../web/shared/playback.mjs';

function fixture() {
  let clock=0, next=0;
  const frames=new Map(), timers=new Map(), values=[], states=[];
  const player=createPlayback({now:()=>clock,update:t=>values.push(t),changed:s=>states.push(s),
    requestFrame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>frames.delete(id),
    delay:fn=>{timers.set(++next,fn);return next;},cancelDelay:id=>timers.delete(id)});
  return {player,values,states,frames,timers,advance(ms,kind='frame') {
    clock+=ms;
    const map=kind==='frame'?frames:timers;
    const entry=map.entries().next().value;
    assert.ok(entry,'A pending update must exist');
    map.delete(entry[0]); entry[1]();
  }};
}

test('play visibly advances time at 2 T/s, and pause freezes it',()=>{
  const f=fixture(); f.player.play(); f.advance(1000);
  assert.equal(f.player.time,2); assert.equal(f.values.at(-1),2);
  f.player.pause(); assert.equal(f.frames.size+f.timers.size,0);
  f.player.play(); f.advance(500); assert.equal(f.player.time,3);
});
test('timer continues the animation when a browser delays rendering frames',()=>{
  const f=fixture(); f.player.play(); f.advance(1200,'timer');
  assert.equal(f.player.time,2.4); assert.equal(f.frames.size,1); assert.equal(f.timers.size,1);
});
test('stale callbacks and rapid play/pause never double playback speed',()=>{
  const f=fixture(); f.player.play(); const stale=f.frames.values().next().value;
  f.advance(500,'timer'); stale(); assert.equal(f.player.time,1);
  for(let i=0;i<10;i++) {f.player.pause(); f.player.play();}
  f.advance(500); assert.equal(f.player.time,2); assert.equal(f.frames.size,1);
});
test('reach the end, replay, seek and reset all preserve time and state',()=>{
  const f=fixture(); f.player.play(); f.advance(12000);
  assert.equal(f.player.time,20); assert.equal(f.player.running,false);
  assert.equal(f.states.at(-1),'ended'); assert.equal(f.frames.size+f.timers.size,0);
  f.player.play(); assert.equal(f.player.time,0); f.advance(500);
  f.player.seek(12); assert.equal(f.values.at(-1),12); assert.equal(f.player.running,false);
  f.player.seek(0); assert.equal(f.values.at(-1),0);
});
