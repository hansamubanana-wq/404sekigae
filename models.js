"use strict";
/* =========================================================
   3D の小道具 (絵文字の代わり)
   猫 / ロケット / 目覚まし時計 / 風 / 「Z」 / 紙吹雪
   どれも THREE.Group を返し、毎フレームの動きは userData.update(t) で行う
   ========================================================= */

const stdMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && m.map.userData.own) m.map.dispose(); m.dispose(); });
  });
}

// 舞台に置いて、毎フレーム update を呼ぶ。remove() で片付け
function stageActor(g) {
  V.stage.add(g);
  const un = addFrameHook((dt, t) => g.userData.update && g.userData.update(t, dt));
  g.userData.remove = () => { un(); V.stage.remove(g); disposeGroup(g); };
  return g;
}

/* ---------------- 猫 ---------------- */
// 右 (+x) に向かって走る。こちら (カメラ) に顔を向けている。左向きは scale.x をマイナスに
function buildCat(color = 0xf2a541) {
  const g = new THREE.Group();
  const fur = stdMat(color, { roughness: .6 });
  const white = stdMat(0xfff3e2, { roughness: .6 });
  const dark = stdMat(0x111111, { roughness: .25 });
  const pink = stdMat(0xff8fb1, { roughness: .5 });
  const stripe = stdMat(new THREE.Color(color).multiplyScalar(.72).getHex(), { roughness: .6 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .44, 6, 18), fur);
  body.rotation.z = Math.PI / 2;
  body.position.y = .42;
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(.15, .32, 6, 14), white);
  belly.rotation.z = Math.PI / 2;
  belly.position.set(0, .36, .07);
  g.add(body, belly);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 20, Math.PI), stripe);
    s.rotation.y = Math.PI / 2;
    s.position.set(-.18 + i * .14, .42, 0);
    g.add(s);
  }

  const head = new THREE.Group();
  head.position.set(.38, .64, .02);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.21, 24, 18), fur);
  skull.scale.set(1, .92, .95);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), white);
  muzzle.scale.set(1.25, .8, .8);
  muzzle.position.set(0, -.06, .16);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), pink);
  nose.position.set(0, -.02, .23);
  head.add(skull, muzzle, nose);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.036, 12, 10), dark);
    eye.position.set(sx * .075, .035, .18);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(sx * .075 + .012, .05, .213);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.08, .17, 4), fur);
    ear.position.set(sx * .12, .19, -.01);
    ear.rotation.z = -sx * .35;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(.045, .1, 4), pink);
    inner.position.set(sx * .12, .18, .03);
    inner.rotation.z = -sx * .35;
    head.add(eye, shine, ear, inner);
    for (let w = 0; w < 2; w++) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .2, 4), white);
      whisker.rotation.z = Math.PI / 2 + sx * (w ? .15 : -.1);
      whisker.position.set(sx * .15, -.05 - w * .03, .17);
      head.add(whisker);
    }
  }
  g.add(head);

  const legs = [];
  for (const [x, z, ph] of [[.24, .1, 0], [.24, -.1, Math.PI], [-.24, .1, Math.PI], [-.24, -.1, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, .36, z);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.055, .2, 4, 8), fur);
    leg.position.y = -.17;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), white);
    paw.position.y = -.3;
    pivot.add(leg, paw);
    g.add(pivot);
    legs.push({ pivot, ph });
  }

  const tailCurve = new THREE.CatmullRomCurve3([v3(-.32, .46, 0), v3(-.52, .55, 0), v3(-.6, .78, 0), v3(-.5, .96, 0)]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 20, .045, 8), fur);
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-.32, .46, 0);
  tail.position.set(.32, -.46, 0);
  tailPivot.add(tail);
  g.add(tailPivot);

  g.userData.run = true;
  g.userData.update = t => {
    const sp = g.userData.run ? 18 : 3;
    legs.forEach(l => { l.pivot.rotation.z = Math.sin(t * sp + l.ph) * (g.userData.run ? .75 : .05); });
    body.position.y = .42 + (g.userData.run ? Math.abs(Math.sin(t * sp)) * .04 : 0);
    head.rotation.z = Math.sin(t * sp * .5) * .06;
    tailPivot.rotation.z = Math.sin(t * 6) * .25;
  };
  return g;
}

/* ---------------- ロケット ---------------- */
// 先端が +y
function buildRocket() {
  const g = new THREE.Group();
  const white = stdMat(0xf2f4f8, { metalness: .35, roughness: .28 });
  const red = stdMat(0xe23d4a, { metalness: .3, roughness: .3 });
  const metal = stdMat(0x5b6170, { metalness: .9, roughness: .3 });

  const prof = [[0, -.52], [.15, -.5], [.2, -.36], [.22, -.1], [.21, .2], [.17, .36]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), white);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.17, .34, 40), red);
  nose.position.y = .53;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.215, .215, .05, 40), red);
  band.position.y = -.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.075, .022, 10, 32), metal);
  ring.position.set(0, .12, .2);
  ring.rotation.x = -.12;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(.07, 24), new THREE.MeshStandardMaterial({ color: 0x5ec8ff, emissive: 0x2a8fd8, emissiveIntensity: .8, metalness: .2, roughness: .05 }));
  glass.position.set(0, .12, .208);
  glass.rotation.x = -.12;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.11, .15, .12, 24, 1, true), metal);
  nozzle.position.y = -.57;
  g.add(body, nose, band, ring, glass, nozzle);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + Math.PI / 6;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.03, .28, .2), red);
    fin.position.set(Math.sin(a) * .25, -.38, Math.cos(a) * .25);
    fin.rotation.y = a;
    g.add(fin);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, .25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.12, .55, 20, 1, true), flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = -.88;
  const core = new THREE.Mesh(new THREE.ConeGeometry(.06, .32, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.rotation.x = Math.PI;
  core.position.y = -.76;
  g.add(flame, core);
  g.userData.update = t => {
    const f = 1 + Math.sin(t * 70) * .15 + Math.sin(t * 43) * .1;
    flame.scale.set(1, f, 1); core.scale.set(1, f * .9, 1);
  };
  return g;
}

/* ---------------- 目覚まし時計 ---------------- */
function clockFace() {
  const c = makeCanvas(256, 256), x = c.getContext("2d");
  x.fillStyle = "#fffdf6"; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#1f2937"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `900 38px ${FONT}`;
  [["12", 0], ["3", 90], ["6", 180], ["9", 270]].forEach(([n, d]) => {
    const a = (d - 90) * Math.PI / 180;
    x.fillText(n, 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
  });
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, r0 = i % 5 ? 112 : 104;
    x.lineWidth = i % 5 ? 2 : 5; x.strokeStyle = "#374151";
    x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); x.stroke();
  }
  x.lineCap = "round"; x.strokeStyle = "#111827";
  x.lineWidth = 10; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 50 * Math.cos(-2.6), 128 + 50 * Math.sin(-2.6)); x.stroke();
  x.lineWidth = 7; x.beginPath(); x.moveTo(128, 128); x.lineTo(128, 48); x.stroke();
  x.strokeStyle = "#e23d4a"; x.lineWidth = 3; x.beginPath(); x.moveTo(128, 150); x.lineTo(128 + 90 * Math.cos(.5), 128 + 90 * Math.sin(.5)); x.stroke();
  x.fillStyle = "#e23d4a"; x.beginPath(); x.arc(128, 128, 9, 0, Math.PI * 2); x.fill();
  const t = canvasTex(c); t.userData.own = true;
  return t;
}
function buildClock() {
  const g = new THREE.Group();
  const red = stdMat(0xd7263d, { metalness: .5, roughness: .25 });
  const gold = stdMat(0xf5c542, { metalness: 1, roughness: .25 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .22, 48), red);
  body.rotation.x = Math.PI / 2;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(.4, .035, 12, 48), gold);
  bezel.position.z = .11;
  const face = new THREE.Mesh(new THREE.CircleGeometry(.38, 48), new THREE.MeshStandardMaterial({ map: clockFace(), roughness: .4 }));
  face.position.z = .112;
  g.add(body, bezel, face);
  const bells = [];
  for (const sx of [-1, 1]) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(.19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    bell.position.set(sx * .27, .42, 0);
    bell.rotation.z = -sx * .45;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.03, .05, .16, 10), gold);
    leg.position.set(sx * .27, -.44, 0);
    leg.rotation.z = sx * .4;
    g.add(bell, leg);
    bells.push(bell);
  }
  const hammer = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .22, 8), gold);
  hammer.position.set(0, .52, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), gold);
  knob.position.set(0, .62, 0);
  g.add(hammer, knob);
  g.userData.ring = false;
  g.userData.update = t => {
    if (g.userData.ring) {
      g.rotation.z = Math.sin(t * 70) * .12;
      hammer.rotation.z = Math.sin(t * 90) * .8;
      g.position.y += Math.sin(t * 50) * .006;
    } else { g.rotation.z *= .8; hammer.rotation.z = 0; }
  };
  return g;
}

/* ---------------- 「Z」 (寝ている) ---------------- */
function zTexture() {
  if (V.tex.z) return V.tex.z;
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `900 104px ${FONT}`;
  x.lineWidth = 10; x.strokeStyle = "#3b5bdb"; x.strokeText("Z", 64, 68);
  x.fillStyle = "#e7f0ff"; x.fillText("Z", 64, 68);
  V.tex.z = canvasTex(c);
  return V.tex.z;
}
function buildZs() {
  const g = new THREE.Group();
  const zs = [0, 1, 2].map(i => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false }));
    s.renderOrder = 7;
    g.add(s);
    return s;
  });
  g.userData.update = t => zs.forEach((s, i) => {
    const u = ((t * .7) + i / 3) % 1;
    s.position.set(u * .9 + Math.sin(u * 6 + i) * .12, u * 1.1, 0);
    s.scale.setScalar(.25 + u * .35);
    s.material.opacity = Math.sin(u * Math.PI);
    s.material.rotation = -.3 + Math.sin(u * 4) * .2;
  });
  return g;
}

/* ---------------- 風 (渦を巻く風の筋と木の葉) ---------------- */
function leafTexture(col) {
  const c = makeCanvas(64, 64), x = c.getContext("2d");
  x.fillStyle = col;
  x.beginPath(); x.moveTo(6, 32); x.quadraticCurveTo(32, 2, 58, 32); x.quadraticCurveTo(32, 62, 6, 32); x.fill();
  x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 2;
  x.beginPath(); x.moveTo(8, 32); x.lineTo(56, 32); x.stroke();
  const t = canvasTex(c); t.userData.own = true;
  return t;
}
// 左から右へ吹く (右から左は scale.x = -1)。width はステージの幅
function buildGust(width, height) {
  const g = new THREE.Group();
  const streaks = [];
  for (let i = 0; i < 9; i++) {
    const y0 = (Math.random() - .5) * height * .7, z0 = rand(-2, 1);
    const pts = [];
    const curlAt = rand(.35, .65), curlR = rand(.25, .5);
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      let x = lerp(-width * .65, width * .65, u), y = y0 + Math.sin(u * Math.PI * 2 + i) * .25;
      const d = (u - curlAt) * 8;
      if (Math.abs(d) < 1) { const a = (d + 1) * Math.PI; x += Math.sin(a) * curlR; y += (1 - Math.cos(a)) * curlR; }
      pts.push(v3(x, y, z0));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, rand(.012, .03), 5);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.6, 1.8), transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    g.add(m);
    streaks.push({ m, delay: rand(0, .35), len: rand(.25, .45), total: geo.index.count });
  }
  const leafCols = ["#7cc243", "#f2b134", "#e86f2c", "#b7d84b"];
  const leaves = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.28, .28), new THREE.MeshBasicMaterial({ map: leafTexture(pick(leafCols)), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.userData = { y: (Math.random() - .5) * height * .8, z: rand(-2, 1.5), d: rand(0, .4), sp: rand(.8, 1.2), r: v3(rand(4, 9), rand(3, 8), rand(2, 7)) };
    g.add(m);
    leaves.push(m);
  }
  // p: 0→1 で吹き抜ける
  g.userData.progress = p => {
    streaks.forEach(s => {
      const u = (p - s.delay) / (1 - s.delay);
      const head = Math.max(0, Math.min(1 + s.len, u * (1 + s.len)));
      const a = Math.max(0, head - s.len), b = Math.min(1, head);
      const per = 5 * 6;
      const start = Math.floor(a * s.total / per) * per, end = Math.floor(b * s.total / per) * per;
      s.m.geometry.setDrawRange(start, Math.max(0, end - start));
    });
    leaves.forEach(l => {
      const u = Math.max(0, (p - l.userData.d) / (1 - l.userData.d)) * l.userData.sp;
      l.position.set(lerp(-width * .7, width * .7, u), l.userData.y + Math.sin(u * 9) * .4, l.userData.z);
      l.rotation.set(u * l.userData.r.x, u * l.userData.r.y, u * l.userData.r.z);
      l.visible = u > 0 && u < 1;
    });
  };
  g.userData.progress(0);
  return g;
}

/* ---------------- 紙吹雪 (フィナーレ) ---------------- */
function confettiShower(ms = 5000, n = 360) {
  const W = V.visW, H = V.visH;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.13, .075), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), n);
  const cols = [0xfbbf24, 0x2f8cff, 0xff4fb0, 0xa78bfa, 0x34d399, 0xffffff, 0xff7a45];
  const P = [];
  for (let i = 0; i < n; i++) {
    const z = rand(-7, 2), sc = (STAGE_D - z) / STAGE_D;
    P.push({
      p: v3(rand(-W * .6, W * .6) * sc, rand(H * .55, H * 1.6) * sc, z),
      v: rand(1.2, 2.4) * sc, sw: rand(.5, 1.5), ph: rand(0, 6.28), r: v3(rand(2, 8), rand(2, 8), rand(1, 4)),
    });
    mesh.setColorAt(i, new THREE.Color(pick(cols)).multiplyScalar(1.2));
  }
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  V.stage.add(mesh);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = v3(1, 1, 1);
  let life = 0;
  const un = addFrameHook((dt, t) => {
    life += dt;
    P.forEach((q, i) => {
      q.p.y -= q.v * dt;
      q.p.x += Math.sin(t * q.sw * 2 + q.ph) * dt * .6;
      E.set(t * q.r.x + q.ph, t * q.r.y, t * q.r.z);
      Q.setFromEuler(E);
      M.compose(q.p, Q, S);
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return sleep(ms).then(() => { un(); V.stage.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); });
}
