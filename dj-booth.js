"use strict";
// 教卓の DJ ブース (ChatGPT で生成したものを組み込み。world.js の buildRoom で使う)
function createDjBooth(THREE, opts = {}) {
  const object = new THREE.Group(), resources = new Set();
  const T = THREE, keep = x => (resources.add(x), x);
  const theme = new T.Color(opts.color ?? 0x2f8cff);
  const cyan = new T.Color(opts.cyan ?? 0x49e6f9);
  const pink = new T.Color(opts.pink ?? 0xff4fb0);
  const gold = new T.Color(opts.gold ?? 0xfbbf24);
  let phase = 0, power = 0, pulse = 0, elapsed = 0, frame = 0, dead = false;
  const box = keep(new T.BoxGeometry(1,1,1));
  const cyl = keep(new T.CylinderGeometry(1,1,1,48));
  const knobGeo = keep(new T.CylinderGeometry(1,1,1,16));
  const plane = keep(new T.PlaneGeometry(1,1));
  const metal = keep(new T.MeshStandardMaterial({color:0x242a39,metalness:.65,roughness:.34}));
  const dark = keep(new T.MeshStandardMaterial({color:0x10121d,metalness:.38,roughness:.65}));
  const trim = keep(new T.MeshStandardMaterial({color:0x6c7488,metalness:.8,roughness:.3}));
  const rubber = keep(new T.MeshStandardMaterial({color:0x090a10,roughness:.92}));
  const neon = keep(new T.MeshBasicMaterial({color:cyan.clone().multiplyScalar(1.7),toneMapped:false}));
  const accent = keep(new T.MeshBasicMaterial({color:theme.clone().multiplyScalar(1.4),toneMapped:false}));
  const dummy = new T.Object3D();
  function mesh(geo, mat, x,y,z,sx,sy,sz, parent=object) {
    const m = new T.Mesh(geo,mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); return m;
  }
  function batch(geo, mat, rows, parent=object) {
    const m = new T.InstancedMesh(geo,mat,rows.length);
    rows.forEach((r,i)=>{dummy.position.set(r[0],r[1],r[2]);dummy.scale.set(r[3],r[4],r[5]);dummy.rotation.set(r[6]||0,r[7]||0,r[8]||0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});
    m.instanceMatrix.needsUpdate=true;parent.add(m);return m;
  }
  function canvas(w,h) {
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d'), tex=keep(new T.CanvasTexture(c));
    tex.colorSpace=T.SRGBColorSpace;tex.generateMipmaps=false;tex.minFilter=T.LinearFilter;
    return {c,ctx,tex};
  }
  function canvasMat(tex, intensity=1) {
    return keep(new T.MeshBasicMaterial({map:tex,color:new T.Color(intensity,intensity,intensity),toneMapped:false}));
  }
  // 筐体：上面は正確に y=1.05
  mesh(box,dark,0,.49,-.04,3.22,.88,1.00);
  mesh(box,metal,0,.99,0,3.4,.12,1.2);
  mesh(box,metal,0,.075,0,3.30,.15,1.12);
  const front = new T.Group();front.position.set(0,.52,.515);front.rotation.x=.105;object.add(front);
  mesh(box,metal,0,0,0,3.26,.81,.065,front);
  batch(box,trim,[[-1.61,0,.043,.035,.81,.035],[1.61,0,.043,.035,.81,.035]],front);
  batch(box,neon,[[-1.56,0,.049,.015,.72,.015],[1.56,0,.049,.015,.72,.015],[0,.375,.049,3.12,.016,.015],[0,-.375,.049,3.12,.016,.015]],front);
  batch(box,neon,[[0,.145,.552,3.15,.022,.025],[-1.62,.52,0,.025,.80,.025],[1.62,.52,0,.025,.80,.025]]);
  const floor=canvas(256,96), fg=floor.ctx.createRadialGradient(128,48,1,128,48,127);
  fg.addColorStop(0,'rgba(255,255,255,.65)');fg.addColorStop(.5,'rgba(255,255,255,.18)');fg.addColorStop(1,'rgba(255,255,255,0)');
  floor.ctx.scale(1,.378);floor.ctx.fillStyle=fg;floor.ctx.fillRect(0,0,256,254);floor.tex.needsUpdate=true;
  const floorMat=keep(new T.MeshBasicMaterial({map:floor.tex,color:cyan,transparent:true,opacity:.65,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
  mesh(plane,floorMat,0,.012,.44,3.7,1.7,1).rotation.x=-Math.PI/2;
  // LED パネル：Canvas の点描＋軽量シェーダー
  const led=canvas(512,128), L=led.ctx;
  const ledMat=keep(new T.ShaderMaterial({toneMapped:false,uniforms:{map:{value:led.tex},time:{value:0},boost:{value:1}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform sampler2D map;uniform float time;uniform float boost;varying vec2 vUv;void main(){vec3 c=texture2D(map,vUv).rgb;float scan=0.92+0.08*sin(vUv.y*110.0+time*4.0);gl_FragColor=vec4(c*scan*boost,1.0);\n#include <colorspace_fragment>\n}'}));
  mesh(plane,ledMat,0,0,.039,3.07,.70,1,front);
  const colorHex=()=> '#'+theme.getHexString();
  function drawLed(t) {
    L.fillStyle='#080b18';L.fillRect(0,0,512,128);
    const hex=colorHex();
    for(let j=0;j<20;j++){
      const h=3+Math.floor((.35+.27*Math.sin(t*2.7+j*.73)+.16*Math.sin(t*5+j*1.7)+power*.35*pulse)*17);
      for(let k=0;k<18;k++){L.fillStyle=k<h?hex:'#182238';L.globalAlpha=k<h?.45+.5*k/18:.6;
        for(let q=0;q<4;q++)L.fillRect(7+j*25+q*5,117-k*6,3.4,3.4);/* 点は四角 (円より軽い) */}
    }
    L.globalAlpha=.8;L.strokeStyle=hex;L.lineWidth=2;L.beginPath();
    for(let x=0;x<=512;x+=4){const y=64+10*Math.sin(x*.045-t*3)+7*Math.sin(x*.019+t*2);if(x===0)L.moveTo(x,y);else L.lineTo(x,y);}L.stroke();
    L.globalAlpha=1;L.fillStyle='rgba(5,8,17,.78)';L.fillRect(174,30,164,67);
    L.font='bold 47px sans-serif';L.textAlign='center';L.textBaseline='middle';L.shadowColor='#fbbf24';L.shadowBlur=8+12*pulse;L.fillStyle='#'+gold.getHexString();L.fillText('教卓',256,65);L.shadowBlur=0;
    led.tex.needsUpdate=true;
  }
  // 左右のデッキ
  batch(box,dark,[[-1.05,1.095,.05,.97,.09,.84],[1.05,1.095,.05,.97,.09,.84]]);
  batch(box,trim,[[-1.05,1.143,.05,.94,.008,.81],[1.05,1.143,.05,.94,.008,.81]]);
  batch(cyl,metal,[[-1.13,1.163,.08,.348,.032,.348],[.97,1.163,.08,.348,.032,.348]]);
  const vinyl=canvas(256,256), V=vinyl.ctx;
  V.fillStyle='#11131a';V.fillRect(0,0,256,256);
  for(let i=39;i<125;i+=3){V.strokeStyle=i%2?'#30323c':'#242732';V.lineWidth=1;V.beginPath();V.arc(128,128,i,0,Math.PI*2);V.stroke();}
  V.fillStyle='#2455a1';V.beginPath();V.arc(128,128,34,0,Math.PI*2);V.fill();
  V.fillStyle='#b8e5ff';V.fillRect(111,118,34,3);V.fillRect(119,126,18,2);
  V.fillStyle='#e2e7ed';V.beginPath();V.arc(128,128,3,0,Math.PI*2);V.fill();vinyl.tex.needsUpdate=true;
  const recordMat=keep(new T.MeshStandardMaterial({map:vinyl.tex,metalness:.17,roughness:.48}));
  const disk=keep(new T.CircleGeometry(1,64)), records=[];
  for(const x of [-1.13,.97]) {
    const g=new T.Group();g.position.set(x,1.183,.08);object.add(g);
    mesh(disk,recordMat,0,0,0,.334,.334,1,g).rotation.x=-Math.PI/2;records.push(g);
  }
  batch(cyl,trim,[[-1.13,1.195,.08,.012,.025,.012],[.97,1.195,.08,.012,.025,.012],[-.71,1.169,-.25,.045,.05,.045],[1.39,1.169,-.25,.045,.05,.045]]);
  const armRows=[], headRows=[], buttons=[];
  for(const x of [-.71,1.39]){
    const ax=x-.11,az=-.09,bx=x-.23,bz=.08;
    armRows.push([ax,1.215,az,.018,.35,.018,Math.PI/2,0,-.55]);
    headRows.push([bx,1.207,bz,.055,.028,.10,0,-.55]);
    buttons.push([x-.05,1.155,.36,.075,.014,.05],[x-.15,1.155,.36,.035,.014,.05]);
  }
  batch(cyl,trim,armRows);batch(box,dark,headRows);batch(box,accent,buttons);
  // ミキサー：共有形状を一括描画
  mesh(box,metal,0,1.105,.045,.87,.11,.79);
  const knobs=[], marks=[], slots=[], sliders=[];
  for(let j=0;j<4;j++){const x=(j-1.5)*.15;for(let k=0;k<3;k++)knobs.push([x,1.187,-.20+k*.105,.034,.055,.034]);slots.push([x,1.168,.245,.018,.009,.21]);sliders.push([x,1.187,.22,.075,.026,.034]);}
  const knobMesh=batch(knobGeo,rubber,knobs);const markMesh=batch(box,trim,knobs.map(r=>[r[0],r[1]+.03,r[2],.012,.008,.025]));
  batch(box,rubber,slots);const sliderMesh=batch(box,trim,sliders);
  const meter=canvas(64,128), M=meter.ctx;
  const meterMat=canvasMat(meter.tex,1.6);
  mesh(plane,meterMat,.355,1.166,.005,.11,.44,1).rotation.x=-Math.PI/2;
  function drawMeter(t){M.fillStyle='#080c15';M.fillRect(0,0,64,128);for(let col=0;col<2;col++){const n=3+Math.floor(13*(.35+.65*power)*(.55+.45*Math.sin(t*7+col*2)));for(let i=0;i<16;i++){M.fillStyle=i<n?(i>12?'#ff5180':i>9?'#fbbf24':'#49e6f9'):'#182332';M.fillRect(6+col*30,121-i*7,22,4);}}meter.tex.needsUpdate=true;}
  // ノート PC：開いた画面は機材上限 1.4m 以下
  mesh(box,metal,0,1.075,-.408,.59,.04,.31);
  const keys=canvas(128,64), K=keys.ctx;K.fillStyle='#252b36';K.fillRect(0,0,128,64);
  for(let r=0;r<5;r++)for(let c=0;c<12;c++){K.fillStyle='#10141b';K.fillRect(5+c*10,4+r*8,8,6);}
  K.fillStyle='#373e4a';K.fillRect(48,47,32,13);keys.tex.needsUpdate=true;
  mesh(plane,canvasMat(keys.tex),0,1.096,-.397,.56,.28,1).rotation.x=-Math.PI/2;
  const lid=new T.Group();lid.position.set(0,1.105,-.49);lid.rotation.x=-.22;object.add(lid);
  mesh(box,metal,0,.14,0,.59,.28,.025,lid);
  const screen=canvas(256,128), S=screen.ctx;
  mesh(plane,canvasMat(screen.tex,1.2),0,.14,.014,.55,.245,1,lid);
  function drawScreen(t){S.fillStyle='#0a1428';S.fillRect(0,0,256,128);S.strokeStyle='#21354c';S.lineWidth=1;for(let x=0;x<256;x+=24){S.beginPath();S.moveTo(x,0);S.lineTo(x,128);S.stroke();}
    for(let j=0;j<2;j++){S.strokeStyle=j?'#ff4fb0':colorHex();S.lineWidth=2;S.beginPath();for(let x=0;x<256;x+=2){const y=38+j*50+Math.sin(x*.16-t*6)*Math.sin(x*.033+t)*(.22+.78*power)*19;if(x===0)S.moveTo(x,y);else S.lineTo(x,y);}S.stroke();}screen.tex.needsUpdate=true;}
  // 機材間の短いケーブル
  for(const side of [-1,1]){const curve=new T.CatmullRomCurve3([new T.Vector3(side*.62,1.17,-.32),new T.Vector3(side*.52,1.09,-.41),new T.Vector3(side*.40,1.09,-.37),new T.Vector3(side*.35,1.16,-.28)]);
    mesh(keep(new T.TubeGeometry(curve,16,.012,6,false)),rubber,0,0,0,1,1,1);}
  const intensity=opts.intensity??1, speed=opts.speed??1;
  function setBeat(p,w){phase=T.MathUtils.clamp(p,0,1);power=T.MathUtils.clamp(w,0,1);}
  function setColor(color){theme.set(color);}
  function update(dt,t){if(dead)return;elapsed=Number.isFinite(t)?t:elapsed+dt;
    pulse=Math.exp(-phase*9)*power;const glow=(1.25+1.3*pulse)*intensity;
    neon.color.copy(cyan).multiplyScalar(glow);accent.color.copy(theme).multiplyScalar(glow);floorMat.opacity=.38+.35*pulse;
    ledMat.uniforms.time.value=elapsed;ledMat.uniforms.boost.value=(1.15+1.15*pulse)*intensity;
    records[0].rotation.y+=dt*(.6+power*2.8)*speed;records[1].rotation.y-=dt*(.48+power*2.3)*speed;
    for(let i=0;i<knobs.length;i++){const r=knobs[i], a=(i%3===0?Math.sin(elapsed*1.8+i)*.7+pulse*.65:i*.43);
      dummy.position.set(r[0]+Math.sin(a)*.014,r[1]+.03,r[2]+Math.cos(a)*.014);dummy.scale.set(.012,.008,.025);dummy.rotation.set(0,a,0);dummy.updateMatrix();markMesh.setMatrixAt(i,dummy.matrix);}
    markMesh.instanceMatrix.needsUpdate=true;
    for(let i=0;i<sliders.length;i++){const r=sliders[i];dummy.position.set(r[0],r[1],r[2]+Math.sin(elapsed*2+i)*.035*power);dummy.scale.set(r[3],r[4],r[5]);dummy.rotation.set(0,0,0);dummy.updateMatrix();sliderMesh.setMatrixAt(i,dummy.matrix);}sliderMesh.instanceMatrix.needsUpdate=true;
    if(frame++%2===0){drawLed(elapsed);drawMeter(elapsed);drawScreen(elapsed);}
  }
  function dispose(){if(dead)return;dead=true;object.removeFromParent();object.traverse(m=>{if(m.isInstancedMesh)m.dispose();});for(const r of resources)r.dispose();object.clear();}
  object.scale.setScalar(opts.scale??1);update(0,0);
  return {object,setBeat,setColor,update,dispose};
}
