const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
const lerp=(a,b,t)=>a+(b-a)*t;

// Match the old target's apparent diameter to the new central object. Camera
// motion and material dissolve share a timeline with zero-speed endpoints.
export function transitionFrame(progress, source, destination, entering) {
  const t=clamp(progress), zoom=smooth(t), travel=smooth(t/(entering?.48:1));
  const ratio=destination.diameter/Math.max(1,source.diameter);
  const scale=lerp(1,ratio,zoom);
  return {
    scale, x:lerp(source.x,destination.x,travel)-source.x*scale,
    y:lerp(source.y,destination.y,travel)-source.y*scale,
    opacity:1-smooth((t-.26)/.60),
    cameraScale:entering?scale/ratio:lerp(1.12,1,zoom),
    labelOpacity:smooth((t-.35)/.65),
  };
}
