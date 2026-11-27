"use strict";
// 全員決定のときの光の柱と「404」の光の粒・花火 (ChatGPT で生成したものを組み込み。show.js で使う)
function createFinale(THREE, opts = {}) {
  const object=new THREE.Group();object.visible=false;
  const n=opts.count??2000, maxSeats=opts.maxSeats??42;
  const blue=new THREE.Color(opts.blue??0x2f8cff), pink=new THREE.Color(opts.pink??0xff4fb0), gold=new THREE.Color(opts.gold??0xfbbf24);
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=180;const ctx=canvas.getContext('2d');ctx.font='900 154px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='white';ctx.fillText('404',240,92);
  const rgba=ctx.getImageData(0,0,480,180).data, pixels=[];for(let y=0;y<180;y+=2)for(let x=0;x<480;x+=2)if(rgba[(y*480+x)*4+3]>180)pixels.push([x,y]);
  const p=new Float32Array(n*3), r=new Float32Array(n*3);for(let i=0;i<n;i++){const xy=pixels[Math.floor(i*pixels.length/n)%pixels.length]??[240,90];p.set([(xy[0]-240)/55,(90-xy[1])/55,0],i*3);r.set([Math.random(),Math.random(),Math.random()],i*3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('aSeed',new THREE.BufferAttribute(r,3));
  const u={uAge:{value:0},uBlue:{value:blue},uPink:{value:pink},uGold:{value:gold}};
  const m=new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`attribute vec3 aSeed;uniform float uAge;varying float vAlpha,vHue;void main(){float t=uAge;float k=smoothstep(1.,1.9,t);vec3 cloud=vec3((aSeed.x-.5)*14.,(aSeed.y-.5)*5.,(aSeed.z-.5)*8.);vec3 p=mix(cloud,position,k);float pulse=1.+.035*sin((t-1.)*12.566);p*=pulse;float burst=smoothstep(5.,6.,t);p+=vec3((aSeed.x-.5)*9.,-4.*aSeed.y,(aSeed.z-.5)*7.)*burst;vAlpha=smoothstep(1.,1.3,t)*(1.-smoothstep(5.2,6.,t));vHue=aSeed.x;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(55./max(2.,-mv.z),1.5,8.);}`,
  fragmentShader:`uniform vec3 uBlue,uPink,uGold;varying float vAlpha,vHue;void main(){float a=pow(max(0.,1.-length(gl_PointCoord-.5)*2.),1.8);vec3 c=vHue<.5?mix(uBlue,uPink,vHue*2.):mix(uPink,uGold,(vHue-.5)*2.);gl_FragColor=vec4(c*2.8,a*vAlpha);}`});
  const text=new THREE.Points(g,m);text.position.set(0,opts.textY??4.4,opts.textZ??-3.8);text.rotation.x=opts.textTilt??-.45;text.frustumCulled=false;object.add(text);
  const beamG=new THREE.CylinderGeometry(.09,.32,1,12,1,true),beamM=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});
  const beams=new THREE.InstancedMesh(beamG,beamM,maxSeats);beams.frustumCulled=false;beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);object.add(beams);
  const dummy=new THREE.Object3D(), seats=[];
  const fireN=8*100, fp=new Float32Array(fireN*3), fs=new Float32Array(fireN*3);for(let i=0;i<fireN;i++){let j=i%100,a=j*2.39996323,y=(j+.5)/100*2-1,s=Math.sqrt(1-y*y);fp.set([s*Math.cos(a),y,s*Math.sin(a)],i*3);fs.set([Math.floor(i/100),Math.random(),Math.random()],i*3);}
  const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.BufferAttribute(fp,3));fg.setAttribute('aSeed',new THREE.BufferAttribute(fs,3));
  const fm=new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,vertexShader:`attribute vec3 aSeed;uniform float uAge;varying float vA,vC;void main(){float i=aSeed.x;float t=clamp((uAge-3.-i*.18)/.8,0.,1.);float a=i*2.39996;vec3 center=vec3(cos(a)*4.,4.8+sin(i*1.9)*.7,-2.+sin(a)*2.);vec3 p=center+position*(1.-pow(1.-t,3.))*(.9+aSeed.y*.8);p.y-=t*t*.6;vA=step(3.+i*.18,uAge)*(1.-t)*smoothstep(0.,.08,t);vC=mod(i,3.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(65./max(2.,-mv.z),1.,8.);}`,fragmentShader:`uniform vec3 uBlue,uPink,uGold;varying float vA,vC;void main(){float a=pow(max(0.,1.-length(gl_PointCoord-.5)*2.),2.);vec3 c=vC<.5?uBlue:(vC<1.5?uPink:uGold);gl_FragColor=vec4(c*3.,a*vA);}`});
  const fire=new THREE.Points(fg,fm);fire.frustumCulled=false;object.add(fire);
  let age=6;
  function play(seatPositions){seats.length=0;for(const p of seatPositions.slice(0,maxSeats))seats.push(p.clone());seats.sort((a,b)=>b.z-a.z||a.x-b.x);beams.count=seats.length;for(let i=0;i<seats.length;i++)beams.setColorAt(i,(i%2?pink:blue).clone().multiplyScalar(2.4));if(beams.instanceColor)beams.instanceColor.needsUpdate=true;age=0;object.visible=true;update(0,0);}
  function stop(){age=6;object.visible=false;}
  function update(dt,t){if(!object.visible)return;age+=Math.max(0,dt);u.uAge.value=age;beams.visible=age<1.8;for(let i=0;i<seats.length&&beams.visible;i++){const q=Math.max(0,Math.min(1,(age-i/Math.max(1,seats.length)*.65)/.35));const h=Math.max(.001,q*2.2*(1-Math.max(0,age-1)/.8));dummy.position.set(seats[i].x,seats[i].y+h/2,seats[i].z);dummy.scale.set(1,h,1);dummy.updateMatrix();beams.setMatrixAt(i,dummy.matrix);}beams.instanceMatrix.needsUpdate=true;if(age>=6)stop();}
  return {object,play,stop,isPlaying(){return object.visible;},update,dispose(){g.dispose();m.dispose();beamG.dispose();beamM.dispose();fg.dispose();fm.dispose();beams.dispose();object.clear();}};
}
