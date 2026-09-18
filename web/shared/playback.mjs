// 由实际经过的时间推进；绘制帧被延迟时由定时器补上更新。
export function createPlayback({duration=20, speed=2, update, changed=()=>{}, failed=()=>{},
  now=()=>performance.now(), requestFrame=fn=>requestAnimationFrame(fn),
  cancelFrame=id=>cancelAnimationFrame(id), delay=(fn,ms)=>setTimeout(fn,ms), cancelDelay=id=>clearTimeout(id)}) {
  let time=0, running=false, startedAt=0, startedTime=0, frame=null, fallback=null, ticket=0;
  function cancel() {
    ticket++;
    if (frame !== null) cancelFrame(frame);
    if (fallback !== null) cancelDelay(fallback);
    frame=fallback=null;
  }
  function stop(reason='paused') {
    cancel(); running=false; changed(reason,time);
  }
  function schedule() {
    const expected=++ticket;
    const advance=()=>{
      if (!running || expected!==ticket) return;
      cancel();
      time=Math.min(duration,startedTime+Math.max(0,now()-startedAt)*speed/1000);
      try {update(time);} catch(error) {stop('error'); failed(error); return;}
      if (time>=duration) stop('ended'); else schedule();
    };
    frame=requestFrame(advance);
    fallback=delay(advance,100);
  }
  return {
    get time() {return time;},
    get running() {return running;},
    play() {
      if (running) return;
      if (time>=duration) time=0;
      startedTime=time; startedAt=now(); running=true;
      update(time); changed('playing',time); schedule();
    },
    pause(reason='paused') {stop(reason);},
    seek(value) {
      if (!Number.isFinite(value)) throw new TypeError('时间必须是有限数');
      cancel(); running=false;
      time=Math.max(0,Math.min(duration,value)); update(time);
      changed(time>=duration?'ended':'paused',time);
    }
  };
}
