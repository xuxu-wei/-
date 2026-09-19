// Pure teaching models. Times and frequencies are explicit; drawing grids never set sampling intervals.
function finite(value,name){if(!Number.isFinite(value))throw new TypeError(`${name} 必须是有限数`);}
function positive(value,name){finite(value,name);if(value<=0)throw new RangeError(`${name} 必须大于零`);}
function integer(value,name){if(!Number.isInteger(value)||value<1)throw new RangeError(`${name} 必须是正整数`);}
export function aliasFrequency(f,fs){finite(f,'频率');positive(fs,'采样率');return Math.abs(((f+fs/2)%fs+fs)%fs-fs/2);}
export function sampling(f=.8,fs=1,duration=10,plotStep=.01){
 finite(f,'频率');positive(fs,'采样率');positive(duration,'记录时长');positive(plotStep,'绘图间隔');
 const count=Math.floor(duration/plotStep+1e-10),sampleCount=Math.floor(duration*fs+1e-10);
 if(count>50000||sampleCount>50000)throw new RangeError('演示点数过多，请缩短时长或增大间隔');
 const times=Array.from({length:count+1},(_,n)=>n*plotStep);
 if(times.at(-1)<duration-1e-10)times.push(duration);
 const folded=aliasFrequency(f,fs),signal=t=>Math.cos(2*Math.PI*f*t);
 return {continuous:times.map(t=>[t,signal(t)]),samples:Array.from({length:sampleCount+1},(_,n)=>[n/fs,signal(n/fs)]),alias:times.map(t=>[t,Math.cos(2*Math.PI*folded*t)]),aliasFrequency:folded};
}
export function causalMean(values,window){
 integer(window,'窗口长度');if(window>10000)throw new RangeError('窗口过长');values.forEach(x=>finite(x,'输入'));
 let sum=0;return values.map((x,n)=>{sum+=x;if(n>=window)sum-=values[n-window];return sum/window;});
}
export function firResponse(window,f){
 integer(window,'窗口长度');finite(f,'频率');if(window>10000)throw new RangeError('窗口过长');
 let real=0,imag=0;for(let j=0;j<window;j++){real+=Math.cos(2*Math.PI*f*j)/window;imag-=Math.sin(2*Math.PI*f*j)/window;}
 const magnitude=Math.hypot(real,imag);return {real,imag,magnitude,phase:magnitude<1e-12?null:Math.atan2(imag,real)};
}
export function filterExperiment(f=.1,window=5,steps=60){
 finite(f,'频率');integer(steps,'样本数');if(steps>10000)throw new RangeError('样本数过多');
 const values=Array.from({length:steps+1},(_,n)=>Math.cos(2*Math.PI*f*n)),filtered=causalMean(values,window);
 return {input:values.map((x,n)=>[n,x]),output:filtered.map((x,n)=>[n,x]),response:Array.from({length:251},(_,n)=>[n/500,firResponse(window,n/500).magnitude]),selected:firResponse(window,f)};
}
export function zohCoefficients(k,h){
 finite(k,'清除系数');positive(h,'采样间隔');if(k<0)throw new RangeError('本模型清除系数不能为负');
 return {a:Math.exp(-k*h),b:k===0?h:-Math.expm1(-k*h)/k};
}
export function compartment(k=.2,u=0,A0=10,h=1,duration=60){
 const coefficients=zohCoefficients(k,h);finite(u,'输入流量');finite(A0,'初始物质量');positive(duration,'记录时长');
 if(u<0||A0<0)throw new RangeError('本物质模型的输入与初始量均须非负');
 const count=Math.floor(duration/h+1e-10);if(count>10000)throw new RangeError('采样点数过多');
 const exactAt=t=>k===0?A0+u*t:A0*Math.exp(-k*t)+u*(-Math.expm1(-k*t))/k;
 const exact=[[0,A0]],euler=[[0,A0]];let a=A0,b=A0;
 for(let n=1;n<=count;n++){a=coefficients.a*a+coefficients.b*u;b=(1-k*h)*b+h*u;if(!Number.isFinite(a)||!Number.isFinite(b))throw new RangeError('轨迹已超出有限数范围');exact.push([n*h,a]);euler.push([n*h,b]);}
 return {continuous:Array.from({length:601},(_,n)=>[duration*n/600,exactAt(duration*n/600)]),exact,euler,coefficients,eulerPole:1-k*h};
}
export const alternateSampling = fs=>fs<2?4:1;
export const alternateWindow = window=>window===1?5:1;
export const alternateStep = h=>h>=6?1:12;
