// Explicit teaching models. Playback time is separate from the fixed Euler grid.
export function symmetric(a,c,initial,t){
  const shared=(initial[0]+initial[1])/2*Math.exp(-c*t);
  const difference=(initial[0]-initial[1])/2*Math.exp(-(2*a+c)*t);
  return [shared+difference,shared-difference];
}
export function rotation(alpha,omega,initial,t){
  const co=Math.cos(omega*t),si=Math.sin(omega*t),decay=Math.exp(-alpha*t);
  return [decay*(co*initial[0]-si*initial[1]),decay*(si*initial[0]+co*initial[1])];
}
export function closed(a,b,initial,t,multiplier=1){
  if(a+b===0)return [...initial];
  const total=initial[0]+initial[1],remaining=Math.exp(-(a+b)*multiplier*t),transferred=-Math.expm1(-(a+b)*multiplier*t);
  return [initial[0]*remaining+total*(b/(a+b))*transferred,initial[1]*remaining+total*(a/(a+b))*transferred];
}
export const matvec=(matrix,state)=>matrix.map(row=>row[0]*state[0]+row[1]*state[1]);
export const nonlinear=(state,a=.2,b=.1,u=.5,v=1,K=2)=>[u-a*state[0]+b*state[1]-v*state[0]/(K+state[0]),a*state[0]-b*state[1]];
export const jacobian=(state,a=.2,b=.1,v=1,K=2)=>[[-a-v*K/(K+state[0])**2,b],[a,-b]];
export function local(initial,h=.005,steps=2400,a=.2,b=.1,u=.5,v=1,K=2){
  const first=u*K/(v-u),equilibrium=[first,a*first/b],matrix=jacobian(equilibrium,a,b,v,K);
  const original=[[...initial]],linear=[[...initial]];
  for(let n=0;n<steps;n++){
    const before=original.at(-1),reference=linear.at(-1);
    const rate=nonlinear(before,a,b,u,v,K),approx=matvec(matrix,reference.map((x,j)=>x-equilibrium[j]));
    original.push(before.map((x,j)=>x+h*rate[j]));
    linear.push(reference.map((x,j)=>x+h*approx[j]));
  }
  return {original,linear,error:Math.max(...original.flatMap((row,i)=>row.map((x,j)=>Math.abs(x-linear[i][j]))))};
}
export const alternatePerturbation=value=>value>=1?.2:3;
export const alternateBackflow=value=>value>0?0:.1;
