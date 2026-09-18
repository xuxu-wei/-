export function exact(time, u, k, initial) {
  if(k === 0) return initial + u * time;
  const z=-k*time,ratio=z===0?1:Math.expm1(z)/z;
  return initial*Math.exp(z)+u*time*ratio;
}
export function grid(bounds, h) {
  if (!(h > 0) || bounds.length < 2 || bounds.some((b,i)=>!Number.isFinite(b)||(i&&b<=bounds[i-1]))) throw Error('网格条件无效');
  const times=[bounds[0]];
  for(let j=0;j<bounds.length-1;j++){
    const left=bounds[j],right=bounds[j+1],count=Math.ceil((right-left)/h-1e-12);
    for(let i=1;i<=count;i++)times.push(i===count?right:left+i*h);
  }
  return times;
}
export function euler(initial,u,k,h,end=12){
  const times=grid([0,end],h),values=[initial];
  for(let i=1;i<times.length;i++)values.push(values.at(-1)+(times[i]-times[i-1])*(u-k*values.at(-1)));
  return {times,values};
}
export function properties(k,h){const q=1-k*h;return {q,stable:Math.abs(q)<1,nonnegative:q>=0};}
export function alternateNumerical(params){
  const negative=params.initial+params.h*(params.u-params.k*params.initial)<0;
  return {initial:10,u:0,k:.75,h:negative?1:2};
}
export function alternateInterval(h){return h>.5?.25:1;}
export function alternateSpeed(k){return k>.5?{u:1,k:.5}:{u:2,k:1};}
