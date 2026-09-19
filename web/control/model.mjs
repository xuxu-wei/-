// Deterministic low-dimensional teaching models. No external data or learner state.
const clip=(x,limit)=>Math.max(-limit,Math.min(limit,x));
export function piStep(error,integral,dt,kp,ki,limit){
 let next=integral+dt*error,requested=kp*error+ki*next,actual=clip(requested,limit);
 if(actual!==requested&&error*requested>0){next=integral;requested=kp*error+ki*next;actual=clip(requested,limit);}
 return {requested,actual,integral:next};
}
export function piRun(kp,ki,limit,count=120){
 let state=0,integral=0;const states=[state],requested=[],actual=[];
 for(let t=0;t<count;t++){
  const step=piStep(1-state,integral,.1,kp,ki,limit);integral=step.integral;
  requested.push(step.requested);actual.push(step.actual);
  state+=.1*(-.4*state+step.actual-.25);states.push(state);
 }
 return {states,requested,actual};
}
export function poles(gain,tau=2){
 const real=-(tau+1)/(2*tau),disc=(tau+1)**2-4*tau*(1+gain);
 if(disc>=0){const offset=Math.sqrt(disc)/(2*tau);return [[real-offset,0],[real+offset,0]];}
 const offset=Math.sqrt(-disc)/(2*tau);return [[real,-offset],[real,offset]];
}
export function frequency(gain,tau,omega,delay){
 return {magnitude:gain/(Math.hypot(1,omega)*Math.hypot(1,tau*omega)),
         phase:-(Math.atan(omega)+Math.atan(tau*omega)+omega*delay)*180/Math.PI};
}
export function actuator(second,count=150){
 let x1=0,x2=0;const states=[[x1,x2]];
 for(let t=0;t<count;t++){
  const u=t<50?1:0,old1=x1,old2=x2;
  x1=old1+.02*(old2+(second?0:u));
  x2=old2+.02*(second?u:0);
  states.push([x1,x2]);
 }
 return {states,determinant:second?-1:0};
}
export function sensor(first,count=60){
 const paths=[[],[]];
 for(let j=0;j<2;j++){
  let x1=j?2:0,x2=1;
  for(let t=0;t<count;t++){
   paths[j].push(first?x1:x2);
   const old1=x1,old2=x2;x1=.9*old1+.1*old2;x2=.8*old2;
  }
 }
 return {paths,determinant:first?.1:0};
}
export function bellman(inputWeight,terminal,state=2){
 const denominator=inputWeight+terminal,gain=terminal/denominator;
 const action=-gain*state,valueWeight=1+terminal-terminal*terminal/denominator;
 return {action,valueWeight,cost:valueWeight*state*state};
}
export function mpc(target,upper){
 const actions=[-1,0,1],candidates=[];let best=null;
 for(const first of actions)for(const second of actions){
  let x=0,cost=0,feasible=true;const states=[x];
  for(const u of [first,second]){
   cost+=(x-target)**2+.1*u*u;x+=u;states.push(x);
   if(x< -1||x>upper){feasible=false;break;}
  }
  if(feasible)cost+=2*(x-target)**2;
  const row={first,second,cost:feasible?cost:null,states};candidates.push(row);
  if(feasible&&(!best||cost<best.cost-1e-12||Math.abs(cost-best.cost)<1e-12&&(first<best.first||first===best.first&&second<best.second)))best=row;
 }
 return {candidates,best};
}
export function paired(severity,count=40){
 const rows=[];
 for(let i=0;i<count;i++){
  const variation=Math.sin(1.7*i)+.4*Math.cos(2.3*i),base=.23+.035*variation*variation;
  const a=severity>.5&&i%11===0?null:base+.018*variation;
  const b=base-.009*variation+.008*severity;
  rows.push({a,b,difference:a===null?null:a-b});
 }
 return rows;
}
export function alternate(mode,p){
 if(mode==='10.1')return {limit:p.limit<=.5?1.5:.4};
 if(mode==='10.2')return {delay:p.delay>.1?0:.7};
 if(mode==='10.3')return {second:p.second?0:1};
 if(mode==='10.4')return {first:p.first?0:1};
 if(mode==='10.5')return {terminal:p.terminal>=3?.2:4};
 if(mode==='10.6')return {upper:p.upper<1?2:.5};
 if(mode==='10.7')return {severity:p.severity>.5?0:1};
 throw Error('未知探索章');
}
