"use strict";
// 教卓の上のネオンアーチ (ChatGPT で生成したものを組み込み。world.js の buildRoom で使う)
function createStageArch(THREE, opts = {}) {
  const object=new THREE.Group(); object.position.set(0,0,opts.z??-6);
  const width=opts.width??9,height=opts.height??5, blue=new THREE.Color(opts.blue??0x2f8cff),pink=new THREE.Color(opts.pink??0xff4fb0);
  const geo=[],mat=[],tex=[],inst=[];const G=g=>(geo.push(g),g),M=m=>(mat.push(m),m);
  const metal=M(new THREE.MeshStandardMaterial({color:0x26354a,metalness:.85,roughness:.28}));
  const neonB=M(new THREE.MeshBasicMaterial({color:blue.clone().multiplyScalar(2.2),toneMapped:false}));const neonP=M(new THREE.MeshBasicMaterial({color:pink.clone().multiplyScalar(2.2),toneMapped:false}));
  const tube=G(new THREE.CylinderGeometry(1,1,1,8));const V=(x,y,z)=>new THREE.Vector3(x,y,z);const d=new THREE.Object3D(), axis=V(0,1,0),delta=V(0,0,0);
  const lines=[],bLines=[],pLines=[];
  function add(list,a,b,r){list.push({a,b,r});}
  // 角を落とした門型トラス。前後二面と対角材をインスタンス化する。
  const path=[[-width/2,0],[-width/2,height-.9],[-width/2+.9,height],[width/2-.9,height],[width/2,height-.9],[width/2,0]];
  for(let k=0;k<path.length-1;k++){const [x,y]=path[k], [xx,yy]=path[k+1], steps=Math.ceil(Math.hypot(xx-x,yy-y)/.55);for(let i=0;i<steps;i++){let a=i/steps,b=(i+1)/steps;let x1=x+(xx-x)*a,y1=y+(yy-y)*a,x2=x+(xx-x)*b,y2=y+(yy-y)*b;for(const z of [-.16,.16]){add(lines,V(x1,y1,z),V(x2,y2,z),.045);}add(lines,V(x1,y1,-.16),V(x1,y1,.16),.027);add(lines,V(x1,y1,-.16),V(x2,y2,.16),.024);add(i%2?bLines:pLines,V(x1,y1,.24),V(x2,y2,.24),.025);}}
  function meshLines(list,material){const mesh=new THREE.InstancedMesh(tube,material,list.length);for(let i=0;i<list.length;i++){let {a,b,r}=list[i];delta.subVectors(b,a);d.position.copy(a).addScaledVector(delta,.5);d.quaternion.setFromUnitVectors(axis,delta.clone().normalize());d.scale.set(r,delta.length(),r);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);}mesh.instanceMatrix.needsUpdate=true;object.add(mesh);inst.push(mesh);return mesh;}
  meshLines(lines,metal);meshLines(bLines,neonB);meshLines(pLines,neonP);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#040817';ctx.fillRect(0,0,128,128);ctx.fillStyle='#fff';for(let y=4;y<128;y+=8)for(let x=4;x<128;x+=8){ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();}const texture=new THREE.CanvasTexture(canvas);tex.push(texture);
  const panelG=G(new THREE.PlaneGeometry(1.5,2.8)), panelM=M(new THREE.ShaderMaterial({uniforms:{uMap:{value:texture},uTime:{value:0},uPower:{value:0},uBlue:{value:blue},uPink:{value:pink}},toneMapped:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D uMap;uniform float uTime,uPower;uniform vec3 uBlue,uPink;varying vec2 vUv;void main(){float dot=texture2D(uMap,vUv).r;float w=.5+.5*sin(vUv.y*15.-uTime*3.+vUv.x*5.);vec3 c=mix(uBlue,uPink,w);gl_FragColor=vec4(vec3(.012,.025,.06)+c*dot*(.35+w*1.4+uPower),1.);}`}));
  for(const x of [-width/2+1.3,width/2-1.3]){const mesh=new THREE.Mesh(panelG,panelM);mesh.position.set(x,2.2,.1);object.add(mesh);}
  const housingG=G(new THREE.BoxGeometry(.42,.28,.42)),headG=G(new THREE.CylinderGeometry(.18,.23,.32,16)),lensG=G(new THREE.CircleGeometry(.15,16));const lensM=M(new THREE.MeshBasicMaterial({color:new THREE.Color(0x94cfff).multiplyScalar(2),toneMapped:false}));
  for(let i=0;i<4;i++){let x=(i-1.5)*1.7;const housing=new THREE.Mesh(housingG,metal);housing.position.set(x,height-.2,0);object.add(housing);const head=new THREE.Mesh(headG,metal);head.position.set(x,height-.48,.06);object.add(head);const lens=new THREE.Mesh(lensG,lensM);lens.rotation.x=Math.PI/2;lens.position.set(x,height-.65,.06);object.add(lens);}
  let power=0,phase=0;
  function setBeat(p,a){phase=p;power=Math.max(0,Math.min(1,a??p));}
  return {object,setBeat,update(dt,t){const p=typeof opts.beat==='function'?opts.beat(t):typeof opts.beat==='number'?opts.beat:power;const glow=1.8+Math.max(0,p)*1.8;neonB.color.copy(blue).multiplyScalar(glow);neonP.color.copy(pink).multiplyScalar(glow);panelM.uniforms.uTime.value=t+phase*.15;panelM.uniforms.uPower.value=p;},dispose(){inst.forEach(i=>i.dispose());geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());tex.forEach(t=>t.dispose());object.clear();}};
}
