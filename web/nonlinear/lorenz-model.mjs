// The same fixed-step RK4, directed crossing and coupled tangent contract as 4.6.
export function lorenzField(v,sigma=10,rho=28,beta=8/3){const [x,y,z]=v;return [sigma*(y-x),rho*x-y-x*z,x*y-beta*z];}
export function lorenzJacobian(v,sigma=10,rho=28,beta=8/3){const [x,y,z]=v;return [[-sigma,sigma,0],[rho-z,-1,-x],[y,x,-beta]];}
export function rk4(rhs,v,h){const a=rhs(v),b=rhs(v.map((x,i)=>x+h*a[i]/2)),c=rhs(v.map((x,i)=>x+h*b[i]/2)),d=rhs(v.map((x,i)=>x+h*c[i]));return v.map((x,i)=>x+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);}
export function lorenzPath(initial,sigma=10,rho=28,beta=8/3,h=.01,steps=4000){let v=[...initial];const rows=[v];for(let n=0;n<steps;n++){v=rk4(x=>lorenzField(x,sigma,rho,beta),v,h);if(v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))throw Error('轨迹超出可信计算范围，请减小步长并检查条件');rows.push(v);}return rows;}
export function directedSection(times,states,level,burn=0){const hits=[];for(let i=0;i<times.length-1;i++){const a=states[i],b=states[i+1];if(a[2]<level&&level<=b[2]){const f=(level-a[2])/(b[2]-a[2]),t=times[i]+f*(times[i+1]-times[i]);if(t>=burn)hits.push([t,...a.map((v,j)=>v+f*(b[j]-v))]);}}return hits;}
export function tangentGrowth(initial,sigma=10,rho=28,beta=8/3,h=.01,steps=4000,segmentSteps=10,burnSteps=1000,direction=[1,0,0]){
  let v=[...initial],d=[...direction],norm=Math.hypot(...d),log=0,time=0;const rows=[];if(!norm)throw Error('方向不能为零');d=d.map(x=>x/norm);
  const coupled=u=>[...lorenzField(u.slice(0,3),sigma,rho,beta),...lorenzJacobian(u.slice(0,3),sigma,rho,beta).map(row=>row.reduce((s,x,j)=>s+x*u[3+j],0))];
  for(let start=0;start<steps;start+=segmentSteps){const stop=Math.min(start+segmentSteps,steps);for(let i=start;i<stop;i++){const u=rk4(coupled,[...v,...d],h);v=u.slice(0,3);d=u.slice(3);if(i+1===burnSteps){norm=Math.hypot(...d);d=d.map(x=>x/norm);}}
    norm=Math.hypot(...d);if(!norm||!Number.isFinite(norm))throw Error('切向计算失败，请检查步长');const duration=Math.max(0,stop-Math.max(start,burnSteps))*h;if(duration>0){log+=Math.log(norm);time+=duration;rows.push([stop*h,log/time]);}d=d.map(x=>x/norm);
  }return rows;
}
