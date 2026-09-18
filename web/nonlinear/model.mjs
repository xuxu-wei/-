// Dimensionless teaching models. Playback never changes the numerical step.
export function switchStep(x,b,h){const m=x+h*(x-x*x*x+b)/2;return x+h*(m-m*m*m+b);}
export function switchPath(initial,bias,h,steps){const out=[initial];for(let i=0;i<steps;i++)out.push(switchStep(out.at(-1),bias,h));return out;}
export function scanBias(biases,initial,h,steps,carry=true){let x=initial;return biases.map(b=>{if(!carry)x=initial;for(let i=0;i<steps;i++)x=switchStep(x,b,h);return x;});}
export function radial(mu,omega,initial,t){const s=initial[0]**2+initial[1]**2;if(s===0)return [0,0];const sq=mu===0?s/(1+2*s*t):s*Math.exp(2*mu*t)/(1+s*Math.expm1(2*mu*t)/mu);const scale=Math.sqrt(sq/s),c=Math.cos(omega*t),d=Math.sin(omega*t);return [scale*(initial[0]*c-initial[1]*d),scale*(initial[0]*d+initial[1]*c)];}
export function driven(alpha,omega,force,drive,initial,t){const d=alpha*alpha+(drive-omega)**2,u=force*alpha/d,v=-force*(drive-omega)/d,a=initial[0]-u,b=initial[1]-v,c=Math.cos(omega*t),s=Math.sin(omega*t),e=Math.exp(-alpha*t);return [e*(a*c-b*s)+u*Math.cos(drive*t)-v*Math.sin(drive*t),e*(a*s+b*c)+u*Math.sin(drive*t)+v*Math.cos(drive*t)];}
export function logistic(r,initial,steps){const out=[initial];for(let i=0;i<steps;i++){const x=out.at(-1);out.push(r*x*(1-x));}return out;}
export function separate(r,first,second,threshold,steps){const a=logistic(r,first,steps),b=logistic(r,second,steps),distances=a.map((x,i)=>Math.abs(x-b[i])),index=distances.findIndex(d=>d>threshold);return {a,b,distances,crossing:index<0?null:index};}
export const alternateInitial=x=>x>0?-.2:.2;
export const alternateMu=mu=>mu>0?-.2:.5;
export const alternateR=r=>r>3.5?3.2:3.9;
export const alternateBias=b=>b>0?-.45:.45;
