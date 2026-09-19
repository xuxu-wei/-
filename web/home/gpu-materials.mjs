// Local shader library. Colour, texture, light and depth are authored per
// material instead of recolouring a single flat sprite for every hierarchy.
export const planeVertex = `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;

const noise = `
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm2(vec2 p){float s=0.,a=.55;for(int i=0;i<4;i++){s+=a*noise2(p);p=mat2(.8,-.6,.6,.8)*p*2.03+17.2;a*=.5;}return s;}
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float s=0.,a=.55;for(int i=0;i<4;i++){s+=a*noise3(p);p=p*2.03+vec3(7.1,13.7,4.9);a*=.5;}return s;}
`;

export const backgroundFragment = `
varying vec2 vUv;uniform float uDark;uniform float uAspect;
${noise}
void main(){
  vec2 p=(vUv-.5)*vec2(uAspect,1.);
  // Analytic, continuous haze avoids exposing a low-frequency noise lattice.
  // Dither after colour conversion so dark gradients do not quantize into tiles.
  vec2 mist=p-vec2(-.35,.06),blue=p-vec2(.42,-.12);
  float band=exp(-pow((p.y+p.x*.20)*4.0,2.))*exp(-p.x*p.x*.48);
  float violet=exp(-dot(mist*vec2(1.1,2.5),mist*vec2(1.1,2.5)));
  float veil=exp(-dot(blue*vec2(1.6,3.0),blue*vec2(1.6,3.0)));
  vec3 night=vec3(.0017,.0036,.009)+vec3(.003,.004,.010)*band+vec3(.004,.001,.009)*violet+vec3(.001,.004,.007)*veil;
  vec3 day=vec3(.875,.916,.97)-vec3(.010,.013,.008)*band;
  gl_FragColor=vec4(mix(day,night,uDark),1.);
  #include <colorspace_fragment>
  float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
  gl_FragColor.rgb+=vec3(grain/255.);
}
`;

export const pointVertex = `
attribute float aSize;attribute float aAlpha;attribute float aWarm;
varying float vAlpha;varying float vWarm;
uniform float uPixelRatio;uniform float uSize;uniform float uOpacity;
void main(){vAlpha=aAlpha*uOpacity;vWarm=aWarm;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=max(1.,aSize*uSize*uPixelRatio);}
`;
export const pointFragment = `
varying float vAlpha;varying float vWarm;uniform vec3 uTint;uniform float uDark;uniform float uTaxonomy;
void main(){
  vec2 p=gl_PointCoord-.5;float d=dot(p,p);
  float kernel=exp(-d*38.)+.19*exp(-d*9.);float a=clamp(kernel*vAlpha,0.,1.);
  if(a<.012)discard;
  vec3 cold=mix(uTint,vec3(.72,.86,1.),.73),warm=vec3(1.,.82,.58);
  vec3 night=mix(mix(cold,warm,vWarm*.52),uTint*1.12,uTaxonomy),day=mix(mix(vec3(.04,.105,.19),uTint,.36),uTint*.90,uTaxonomy);
  gl_FragColor=vec4(mix(day,night,uDark),a);
  #include <colorspace_fragment>
}
`;

export const galaxyFragment = `
varying vec2 vUv;uniform sampler2D uMap;uniform float uReady;uniform float uDark;uniform float uTime;uniform float uSeed;uniform float uOpacity;uniform vec3 uTint;uniform float uCentral;uniform float uMorphology;
${noise}
void main(){
  vec2 p=vUv-.5;float r=length(p);float mask=1.-smoothstep(.37,.50,r);
  float density=0.,lum=0.;
  if(uCentral<.5){
    // Distant galaxies are unresolved populations, not miniature copies of a
    // nearby spiral photograph. Shape, dust and population vary with identity.
    float broad=fbm2(p*8.+uSeed*3.7+vec2(uTime*.045,-uTime*.028)),fine=noise2(p*33.+uSeed*11.+uTime*.055);
    if(uMorphology<.5){
      vec2 q=p*vec2(1.15,1.85);float ell=exp(-dot(q,q)*18.);
      density=ell*(.31+broad*.49)+exp(-dot(q,q)*210.)*.21;
    }else if(uMorphology<1.5){
      vec2 q=p*vec2(1.,3.9);float disk=exp(-dot(q,q)*16.);
      float lane=1.-.70*exp(-pow((p.y+sin(p.x*8.+uSeed)*.012)/.018,2.));
      density=disk*(.46+broad*.37)*lane+exp(-dot(p*vec2(1.2,2.3),p*vec2(1.2,2.3))*25.)*.11;
    }else if(uMorphology<2.5){
      density=exp(-r*r*235.)*.64+exp(-r*r*25.)*(.10+broad*.16);
    }else if(uMorphology<3.5){
      float cloud=exp(-dot(p-vec2(-.10,.04),p-vec2(-.10,.04))*39.)+exp(-dot(p-vec2(.13,-.07),p-vec2(.13,-.07))*46.)*.76;
      density=cloud*smoothstep(.27,.74,broad)*(.52+fine*.10);
    }else{
      vec2 a=p-vec2(-.12,.025),b=p-vec2(.13,-.035);
      density=exp(-dot(a*vec2(1.1,1.5),a*vec2(1.1,1.5))*59.)*.55+exp(-dot(b*vec2(1.6,1.),b*vec2(1.6,1.))*69.)*.37;
      density+=exp(-dot(p*vec2(1.,2.4),p*vec2(1.,2.4))*15.)*broad*.11;
    }
    density*=.85+fine*.22;lum=density;
  }else if(uReady>.5){
    vec4 tex=texture2D(uMap,vUv);lum=dot(tex.rgb,vec3(.2126,.7152,.0722));
    lum*=1.+.065*sin(atan(p.y,p.x)*3.-uTime*.55+r*31.);
    density=pow(clamp((lum-.006)*2.8,0.,1.),.64)*tex.a;
  }else{
    float armAngle=atan(p.y*1.64,p.x);float radius=length(p*vec2(1.,1.64));
    float arm=pow(.5+.5*cos(3.*armAngle+13.3*sqrt(radius+.005)+uSeed),5.);
    float dust=fbm2(p*30.+uSeed);
    float fog=(arm*.63+.13)*exp(-radius*4.4)*mix(.4,1.5,dust);
    float nucleus=exp(-radius*radius*260.);
    density=clamp(fog*1.55+nucleus*.92,0.,1.);lum=density*.62;
  }
  // Premium texture supplies luminance only. No inherited blue arms, cream core
  // or white dust can override the course taxonomy's mixed colour.
  // uTint is the active legend colour in linear sRGB. Shade by a scalar only;
  // normalising channels or applying filmic grading would change its identity.
  vec3 night=uTint*(.65+clamp(lum*1.8,0.,1.)*.65);
  vec3 day=uTint*(.74+sqrt(clamp(lum,0.,1.))*.26);
  float a=pow(max(density,0.),mix(.55,.78,uDark))*mask*uOpacity;
  if(a<.009)discard;
  gl_FragColor=vec4(mix(day,night,uDark),a*mix(.94,1.,uDark));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const sphereVertex = `
varying vec3 vNormal;varying vec3 vLocal;varying vec3 vView;
void main(){vLocal=position;vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}
`;
export const planetFragment = `
varying vec3 vNormal;varying vec3 vLocal;varying vec3 vView;
uniform vec3 uTint;uniform vec3 uParentTint;uniform vec3 uLightDirection;uniform float uCentral;uniform float uTime;uniform float uSeed;uniform float uDark;uniform float uOpacity;uniform float uLearned;
${noise}
void main(){
  vec3 n=normalize(vNormal),p=normalize(vLocal);float a=uTime*.023+uSeed;
  p=mat3(cos(a),0.,sin(a),0.,1.,0.,-sin(a),0.,cos(a))*p;
  float continent=fbm3(p*3.15+uSeed*2.);
  float detail=fbm3(p*29.3+vec3(uSeed));
  float turbulent=fbm3(p*7.1+vec3(1.3,uSeed,4.));
  float land=smoothstep(.45,.62,continent);
  float belts=.5+.5*sin(p.y*23.+turbulent*7.+uSeed);
  float gas=step(.48,fract(uSeed*.713));
  float clouds=smoothstep(.59,.77,fbm3(p*6.7+vec3(uTime*.008,uSeed*2.,2.)))*(.68-gas*.30);
  // Terrain changes luminance, never the node's category hue. The parent still
  // determines light direction, but cannot recolour a different category.
  float relief=.34+land*.30+belts*gas*.12+detail*.20+clouds*.12;
  vec3 albedo=uTint*relief;
  vec3 light=normalize(uLightDirection);float sunlight=max(dot(n,light),0.);
  float terminator=smoothstep(-.08,.10,dot(n,light));
  float ambient=mix(.105,.045,uDark);vec3 color=albedo*(ambient+sunlight*.96)*mix(.46,1.,terminator);
  float spec=pow(max(dot(reflect(-light,n),normalize(vView)),0.),45.)*(1.-land)*(1.-gas)*.20;
  vec3 familyLight=uTint;
  color+=familyLight*spec*sunlight;
  float rim=pow(1.-max(dot(n,normalize(vView)),0.),3.6);
  color+=familyLight*.50*rim*sunlight*.34;
  color+=uTint*uLearned*.018;
  gl_FragColor=vec4(color,uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const atmosphereFragment = `
varying vec3 vNormal;varying vec3 vLocal;varying vec3 vView;uniform vec3 uTint;uniform vec3 uParentTint;uniform vec3 uLightDirection;uniform float uCentral;uniform float uOpacity;uniform float uDark;
void main(){vec3 n=normalize(vNormal),v=normalize(vView);float rim=pow(1.-abs(dot(n,v)),4.8);float lit=.28+.72*max(dot(n,normalize(uLightDirection)),0.);gl_FragColor=vec4(uTint,rim*lit*uOpacity*.29);
  #include <colorspace_fragment>
}
`;

export const haloFragment = `
varying vec2 vUv;uniform vec3 uTint;uniform float uDark;uniform float uGlow;uniform float uHover;uniform float uOpacity;
void main(){vec2 p=vUv-.5;float r=length(p);float achievement=exp(-r*r*24.)*uGlow*.25;float hover=exp(-pow((r-.35)/.012,2.))*uHover;float a=(achievement+hover*.78)*uOpacity;if(a<.005)discard;vec3 attention=mix(vec3(.045,.16,.31),vec3(.70,.87,1.),uDark);gl_FragColor=vec4(mix(uTint,attention,clamp(hover*2.,0.,1.)),a);
  #include <colorspace_fragment>
}
`;

export const blackHoleFragment = `
varying vec2 vUv;uniform float uTime;uniform float uDark;uniform float uOpacity;uniform sampler2D uMap;uniform float uReady;
${noise}
void main(){
  if(uReady>.5){
    vec2 p=vUv-.5;
    float r=length(p),angle=atan(p.y,p.x);
    // Advect luminous gas while keeping the horizon and disk silhouette fixed.
    float diskBand=exp(-p.y*p.y*460.);
    float flowPhase=fract(uTime*.14);
    vec2 qa=vUv-vec2(flowPhase*.065*diskBand,0.);
    vec2 qb=vUv+vec2((1.-flowPhase)*.065*diskBand,0.);
    vec4 base=texture2D(uMap,vUv);
    vec4 photo=mix(texture2D(uMap,qa),texture2D(uMap,qb),flowPhase);
    float fixedLum=dot(base.rgb,vec3(.2126,.7152,.0722)),lum=dot(photo.rgb,vec3(.2126,.7152,.0722));
    float gasAlpha=pow(clamp((fixedLum-.0015)*4.2,0.,1.),.56)*base.a;
    float horizon=1.-smoothstep(.123,.133,r);
    float alpha=max(gasAlpha,horizon);
    float stream=sin(p.x*92.-uTime*3.0+noise2(p*28.)*1.3);
    float arcStream=sin(angle*9.-uTime*1.2+r*54.);
    float breathe=1.+.20*stream*diskBand+.085*arcStream*(1.-diskBand);
    vec3 gas=mix(base.rgb,photo.rgb,.68*diskBand)*smoothstep(.0005,.006,fixedLum);
    vec3 night=gas/max(gasAlpha,.10)*breathe;
    vec3 dayGas=mix(vec3(.018,.045,.083),vec3(.24,.38,.52),pow(clamp(lum,0.,1.),.60));
    vec3 day=mix(vec3(.002,.006,.014),dayGas*breathe,smoothstep(.0015,.035,fixedLum));
    // A black source image is not an opaque rectangular card: only its gas and
    // the circular event horizon cover background stars.
    float edge=(1.-smoothstep(.48,.50,abs(p.x)))*(1.-smoothstep(.48,.50,abs(p.y)));
    alpha*=edge*uOpacity;
    if(alpha<.005)discard;
    gl_FragColor=vec4(mix(day,night,uDark),alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  vec2 uv=(vUv-.5)*2.;if(length(uv)>1.)discard;float cs=cos(-.13),sn=sin(-.13);uv=mat2(cs,-sn,sn,cs)*uv;
  vec3 p=vec3(0.,1.12,4.5),ray=normalize(vec3(uv.x*1.72,uv.y*1.72-.45,-1.8));
  vec3 accumulated=vec3(0.);float opacity=0.,captured=0.,closest=10.;
  for(int i=0;i<72;i++){
    float r=length(p);closest=min(closest,r);
    if(r<.34){captured=1.;break;}
    ray=normalize(ray-p*(.022/max(r*r*r,.05)));p+=ray*.115;
    float diskRadius=length(p.xz);
    if(diskRadius>.58&&diskRadius<2.6&&abs(p.y)<.16){
      float height=exp(-abs(p.y)*46.);float edge=smoothstep(.58,.76,diskRadius)*(1.-smoothstep(1.85,2.6,diskRadius));
      float angle=atan(p.z,p.x);float filaments=.52+.48*sin(diskRadius*57.-angle*13.+uTime*.32+noise2(p.xz*11.)*7.);
      float turbulent=.45+.65*noise2(vec2(angle*5.+uTime*.013,diskRadius*28.));
      float density=height*edge*(.24+filaments*.76)*turbulent;
      float temperature=clamp((2.5-diskRadius)/1.9,0.,1.);
      float doppler=mix(.47,1.58,smoothstep(-1.4,1.3,p.x));
      vec3 warm=mix(vec3(.45,.125,.035),vec3(1.6,1.04,.57),temperature);
      vec3 cool=mix(vec3(.035,.10,.19),vec3(.16,.34,.53),temperature);
      vec3 emission=mix(cool,warm,uDark)*density*doppler;
      accumulated+=(1.-opacity)*emission*.72;opacity+=(1.-opacity)*density*.42;
    }
    if(p.z< -4.||opacity>.985)break;
  }
  vec3 horizon=mix(vec3(.009,.019,.038),vec3(.0003,.0005,.001),uDark);
  if(captured>.5){accumulated+=horizon*(1.-opacity);opacity=1.;}
  float photon=exp(-pow((closest-.39)/.043,2.))*(1.-captured)*.14;
  accumulated+=mix(vec3(.05,.13,.25),vec3(.95,.57,.25),uDark)*photon;opacity=max(opacity,photon*.55);
  float vignette=1.-smoothstep(.72,1.,length(uv));opacity*=vignette*uOpacity;
  if(opacity<.006)discard;
  gl_FragColor=vec4(accumulated/max(opacity,.10),opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const edgeVertex = `
attribute vec3 aColor;attribute float aOpacity;varying vec3 vColor;varying float vOpacity;
void main(){vColor=aColor;vOpacity=aOpacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
export const edgeFragment = `
varying vec3 vColor;varying float vOpacity;
void main(){gl_FragColor=vec4(vColor,vOpacity);
  #include <colorspace_fragment>
}
`;
