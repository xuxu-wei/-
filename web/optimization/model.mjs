// Explicit, dimensionless models. No optimizer dependency or hidden random input.
export function quadratic(matrix,linear,point){
 const gradient=matrix.map((row,i)=>row.reduce((s,h,j)=>s+h*point[j],0)-linear[i]);
 return {value:point.reduce((s,x,i)=>s+x*(gradient[i]-linear[i])/2,0),gradient};
}
export function descent(curvature,scaledStep,steps=30){
 const step=scaledStep/curvature,points=[[1.6,1.4]],values=[],residuals=[];
 for(let k=0;k<=steps;k++){
  const x=points[k],r=quadratic([[1,0],[0,curvature]],[0,0],x);
  values.push(r.value);residuals.push(Math.hypot(...r.gradient));
  if(k<steps)points.push(x.map((v,j)=>v-step*r.gradient[j]));
 }
 return {step,points,values,residuals,factors:[1-step,1-scaledStep]};
}
export function softThreshold(values,threshold){return values.map(v=>Math.sign(v)*Math.max(Math.abs(v)-threshold,0));}
export function shrinkage(penalty){const b=[1.4,.55];return {ridge:b.map(v=>v/(1+penalty)),sparse:softThreshold(b,penalty)};}
export function allocation(budget){
 // H=diag(2,4), b=[4,8], .5 <= x <= 3. Feasibility first.
 if(budget<1)return {point:null,value:null,status:'infeasible',multipliers:null,residuals:null};
 let point;
 if(budget>=4)point=[2,2];
 else{const first=Math.max(.5,Math.min(budget-.5,(4*budget-4)/6));point=[first,budget-first];}
 const {value,gradient}=quadratic([[2,0],[0,4]],[4,8],point);
 const lambda=budget>=4?0:8-4*point[1],lowerFirst=gradient[0]+lambda;
 const multipliers=[Math.max(0,lowerFirst),0,0,0,lambda];
 const r=[.5-point[0],.5-point[1],point[0]-3,point[1]-3,point[0]+point[1]-budget];
 const stationary=[gradient[0]-multipliers[0]+lambda,gradient[1]+lambda];
 const residuals=[Math.max(0,...r),Math.max(0,...multipliers.map(v=>-v)),Math.max(...stationary.map(Math.abs)),Math.max(...r.map((v,i)=>Math.abs(v*multipliers[i])))];
 return {point,value,status:'optimal',multipliers,residuals};
}
export function feasiblePolygon(budget){
 let points=[[.5,.5],[3,.5],[3,3],[.5,3]],result=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],fa=a[0]+a[1]-budget,fb=b[0]+b[1]-budget;
  if(fa<=0)result.push(a);
  if((fa<0&&fb>0)||(fa>0&&fb<0)){const t=fa/(fa-fb);result.push(a.map((x,j)=>x+t*(b[j]-x)));}
 }
 return result;
}
export const alternate=(value,first,second)=>Math.abs(value-first)<1e-8?second:first;
