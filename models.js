"use strict";
/* =========================================================
   3D の小道具 (絵文字の代わり)
   猫 / ロケット / 目覚まし時計 / 風 / 「Z」 / 紙吹雪
   どれも THREE.Group を返し、毎フレームの動きは userData.update(t) で行う
   ========================================================= */

// 明るすぎると光がにじんで白く飛ぶので、環境光の映り込みを控えめに
const stdMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, envMapIntensity: .55, ...o });

const actorPools = new Map();

// 舞台に置いて、毎フレーム update を呼ぶ。remove() で種類別のプールに戻す。
function stageActor(build, variant) {
  if (!actorPools.has(build)) actorPools.set(build, new Map());
  const variants = actorPools.get(build);
  if (!variants.has(variant)) variants.set(variant, []);
  const pool = variants.get(variant);
  const g = pool.pop() || build(variant);
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  g.scale.setScalar(1);
  g.userData.reset?.();
  V.stage.add(g);
  const un = g.userData.update && addFrameHook((dt, t) => g.userData.update(t, dt));
  g.userData.remove = () => {
    if (!g.parent) return;
    un?.();
    g.removeFromParent();
    pool.push(g);
  };
  return g;
}

/* ---------------- 猫 ---------------- */
const CAT_COATS = [0xcf8749, 0x8d99a8, 0x3c3942, 0xe6d4b9];

// 鼻先は +x。胴の模様は頂点色にし、毛並みを描くための追加メッシュを使わない。
function buildCat(color) {
  const g = new THREE.Group();
  const torso = new THREE.Group();
  const oval = new THREE.SphereGeometry(1, 16, 12);
  const fur = stdMat(color, { roughness: .91 });
  const cream = stdMat(new THREE.Color(color).lerp(new THREE.Color(0xffecd6), .78), { roughness: .94 });
  const ears = stdMat(0xbc7775, { roughness: .9 });
  const nose = stdMat(0x53333e, { roughness: .48 });
  const iris = stdMat(color === CAT_COATS[1] ? 0x9eba70 : 0xeab368, { roughness: .28 });
  const pupil = stdMat(0x181217, { roughness: .37 });
  const part = (parent, mat, x, y, z, sx, sy, sz, geo = oval) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  };
  const coat = oval.clone();
  const pos = coat.attributes.position, colors = [];
  const base = new THREE.Color(color), shade = base.clone();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const stripe = Math.max(0, Math.cos(16 * x + 2 * z * z - y)) ** 3;
    shade.copy(base).multiplyScalar(1.05 + .12 * y - stripe * (.24 + .08 * y));
    shade.lerp(cream.color, .65 * Math.max(0, -y) ** 3);
    colors.push(shade.r, shade.g, shade.b);
  }
  coat.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  part(torso, stdMat(0xffffff, { roughness: .91, vertexColors: true }), -.06, .41, 0, .43, .205, .155, coat);
  part(torso, fur, .25, .46, 0, .18, .2, .144);

  const head = new THREE.Group();
  head.position.set(.35, .59, 0);
  torso.add(head);
  part(head, fur, .07, 0, 0, .183, .16, .157);
  part(head, cream, .208, -.06, 0, .099, .078, .112);
  part(head, nose, .3, -.032, 0, .026, .034, .043);
  const mouth = new THREE.Object3D();
  mouth.position.set(.32, -.085, 0);
  head.add(mouth);
  const earGeo = new THREE.ConeGeometry(1, 2, 5);
  const whiskers = [];
  for (const side of [-1, 1]) {
    const ear = part(head, fur, .018, .157, side * .102, .081, .115, .069, earGeo);
    ear.rotation.x = side * .24;
    const inner = part(head, ears, .057, .164, side * .108, .043, .074, .045, earGeo);
    inner.rotation.x = side * .24;
    part(head, iris, .153, .038, side * .128, .054, .037, .023);
    part(head, pupil, .175, .038, side * .146, .015, .028, .009);
    for (let i = 0; i < 3; i++) {
      whiskers.push(.244, -.059 - i * .014, side * .072, .232 - .025 * i, -.024 - i * .052, side * (.215 - i * .01));
    }
  }
  const whiskerGeo = new THREE.BufferGeometry();
  whiskerGeo.setAttribute("position", new THREE.Float32BufferAttribute(whiskers, 3));
  head.add(new THREE.LineSegments(whiskerGeo, new THREE.LineBasicMaterial({ color: 0xe4cfc0 })));

  const legs = [];
  for (const [x, z, phase] of [[.23, .107, 0], [.23, -.107, Math.PI], [-.33, .115, Math.PI], [-.33, -.115, 0]]) {
    const leg = new THREE.Group();
    leg.position.set(x, .30, z);
    part(leg, fur, 0, -.106, 0, x < 0 ? .087 : .062, .15, .063);
    part(leg, cream, .036, -.25, 0, .086, .048, .06);
    torso.add(leg);
    legs.push({ leg, phase });
  }
  const tailCurve = new THREE.CatmullRomCurve3([v3(), v3(-.17, .045, 0), v3(-.28, .2, 0), v3(-.44, .25, .02), v3(-.51, .19, .04)]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 14, .043, 6), fur);
  tail.position.set(-.43, .45, 0);
  torso.add(tail);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.92, .87), new THREE.MeshBasicMaterial({
    map: V.tex.glow, color: 0x040309, transparent: true, opacity: .68, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(-.04, .024, 0);
  g.add(shadow, torso);
  let gait = 0;
  g.userData.mouth = mouth;
  g.userData.reset = () => {
    gait = 0;
    g.userData.run = false;
    g.userData.jump = g.userData.nod = 0;
    g.userData.search = false;
  };
  g.userData.update = (t, dt) => {
    const { run, jump, nod, search } = g.userData;
    if (run) gait += dt * 25;
    for (const { leg, phase } of legs) {
      const stride = gait + phase;
      leg.rotation.z = run ? .48 * Math.sin(stride) : .32 * phase / Math.PI * jump;
      leg.position.y = .30 + .18 * jump + (run ? .14 * Math.abs(Math.sin(stride)) : 0);
    }
    torso.position.y = run ? .025 * Math.abs(Math.sin(gait)) : 0;
    head.position.y = .59 - .327 * nod;
    head.rotation.z = run ? .030 * Math.sin(gait) : -.46 * nod;
    head.rotation.y = search ? .29 * Math.sin(t * 20) : .055 * Math.sin(t * 4);
    tail.rotation.y = .35 * Math.sin(t * 5);
    tail.rotation.z = .13 * Math.sin(t * 6);
  };
  return g;
}

// 同じ列の1〜2台隣から来る。浮いている名札を避けるため天板の奥を通る。
async function catDelivery(card, key, coat) {
  const { x, z } = seatXZ(key);
  const [row, col] = key.split("-").map(Number);
  const neighbors = [-1, 1].filter(d => realSeatPositions.includes(`${row}-${col + d}`));
  const far = neighbors.filter(d => realSeatPositions.includes(`${row}-${col + d * 2}`));
  const side = pick(far.length ? far : neighbors) ?? -1;
  const hops = far.length ? 2 : neighbors.length ? 1 : 0;
  const dir = -side;
  const start = x + side * SX * hops;
  const level = DESK_SURFACE_Y + .008;
  const lane = z - .23;
  const cat = stageActor(buildCat, coat);
  V.scene.add(cat);
  cat.visible = false;
  cat.scale.setScalar(.58);
  cat.position.set(hops ? start : x + side * .18, level, lane);
  cat.rotation.y = dir > 0 ? 0 : Math.PI;
  const motion = cat.userData;
  const aim = v3();
  const eye = v3();
  const view = new THREE.Matrix4();
  const yaw = Math.atan2(dir * .53, -1);
  const carryTurn = new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), yaw);
  const pitchAxis = v3(1);
  const gripTurn = new THREE.Quaternion(), worldTurn = new THREE.Quaternion();
  const gripOffset = v3(), grip = v3(), contact = v3();
  const scale = .31;
  const halfCardHeight = (FACE_H + .14) / 2;
  const contactTilt = -Math.PI / 2 + .078;
  let tilt = -.27;
  const cameraAt = (pos, quat) => {
    const { aspect, fov } = V.camera;
    const halfFov = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const distance = Math.max(2.85, .76 / (halfFov * Math.min(aspect, 1) * .83));
    const depth = Math.min(3.25, distance * .60);
    const lateral = dir * depth * .53;
    aim.set(cat.position.x + dir * .07, .74, z - .07);
    pos.set(aim.x + lateral, aim.y + Math.sqrt(distance ** 2 - depth ** 2 - lateral ** 2), aim.z - depth);
    quat.setFromRotationMatrix(view.lookAt(pos, aim, V.camera.up));
  };
  const positionCard = (anchor, edge) => {
    worldTurn.copy(carryTurn).multiply(gripTurn.setFromAxisAngle(pitchAxis, tilt));
    gripOffset.set(0, edge * scale * halfCardHeight, 0).applyQuaternion(worldTurn).add(anchor);
    card.position.copy(V.stage.worldToLocal(gripOffset));
    card.quaternion.copy(V.stage.quaternion).invert().multiply(worldTurn);
  };
  const walk = async end => {
    const from = cat.position.x;
    const ms = 72 + Math.abs(end - from) * 220;
    motion.run = true;
    sfx("step", { vol: .19, rate: 1.65, vary: .13 });
    await tween(ms, t => {
      cat.position.x = lerp(from, end, t);
      cameraAt(CAM.pos, CAM.quat);
    }, ease.linear);
    motion.run = false;
  };

  let stopFollowing, resize;
  try {
    const shot = { pos: eye, quat: new THREE.Quaternion() };
    cameraAt(shot.pos, shot.quat);
    await camGo(shot, 290);
    cameraAt(CAM.pos, CAM.quat);
    resize = () => {
      cameraAt(CAM.pos, CAM.quat);
      V.camRig();
    };
    addEventListener("resize", resize);
    cat.visible = true;
    card.scale.setScalar(scale);
    positionCard(motion.mouth.getWorldPosition(grip), -1);
    card.visible = true;
    let carrying = true;
    stopFollowing = addFrameHook(() => {
      if (carrying) positionCard(motion.mouth.getWorldPosition(grip), -1);
      else positionCard(contact, 1);
    });
    for (let i = 0; i < hops; i++) {
      const desk = start + dir * i * SX;
      if (i > 0) {
        // 隣の席で一瞬迷い、首を振ってから次の机へ進む。
        await walk(desk);
        motion.search = true;
        await sleep(135);
        motion.search = false;
      }
      const takeoff = desk + dir * .50;
      const touchdown = desk + dir * (SX - .50);
      await walk(takeoff);
      await tween(205, t => {
        motion.jump = Math.sin(t * Math.PI);
        cat.position.set(lerp(takeoff, touchdown, t), level + .23 * motion.jump, lane);
        cameraAt(CAM.pos, CAM.quat);
      }, ease.linear);
      motion.jump = 0;
    }
    await walk(x - dir * .30);
    await tween(315, t => {
      tilt = lerp(-.27, contactTilt, ease.out(t));
      motion.nod = ease.in(t);
      cat.position.z = lerp(lane, z - .085, t);
    }, ease.linear);
    // 札の下端が机に触れてから離し、その端を支点に寝かせる。
    card.localToWorld(contact.set(0, -halfCardHeight, 0));
    carrying = false;
    sfx("step", { vol: .22, rate: .76, pan: .05 * dir });
    await tween(240, t => {
      tilt = lerp(contactTilt, -Math.PI / 2, clamp01(t * 2.7));
      motion.nod = 1 - t;
    }, ease.inOut);
  } finally {
    stopFollowing?.();
    if (resize) removeEventListener("resize", resize);
    cat.userData.remove();
  }
}

async function deliverCatCards(list, cards) {
  const coats = shuffleArray(CAT_COATS);
  const hiddenFaces = [...hidden].map(key => V.seat[key].front);
  const desktop = V.deskParts.top.material;
  const roughness = desktop.roughness;
  desktop.roughness = .54;
  // 教室の反対側から見るカットなので、裏返した未発表の名前は見えないようにする。
  for (const face of hiddenFaces) face.visible = false;
  cards.forEach(card => { card.visible = false; });
  try {
    for (let i = 0; i < list.length; i++) {
      const { s, key } = list[i];
      await catDelivery(cards[i], key, coats[i]);
      cards[i].visible = false;
      V.seat[key].front.visible = true;
      await land(s, key, "place");
    }
  } finally {
    try {
      await camHome(400);
    } finally {
      desktop.roughness = roughness;
      for (const face of hiddenFaces) face.visible = true;
    }
  }
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
  const gold = stdMat(0xc99a2e, { metalness: 1, roughness: .35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .22, 48), red);
  body.rotation.x = Math.PI / 2;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(.4, .035, 12, 48), gold);
  bezel.position.z = .11;
  const face = new THREE.Mesh(new THREE.CircleGeometry(.38, 48), new THREE.MeshBasicMaterial({ map: clockFace(), color: new THREE.Color(.78, .78, .78) }));
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
  g.userData.reset = () => { g.userData.ring = false; hammer.rotation.z = 0; };
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
function stageGust(direction) {
  const g = stageActor(buildGust);
  g.scale.set(direction * V.visW / g.userData.width, V.visH / g.userData.height, 1);
  return g;
}

function buildGust() {
  const width = V.visW, height = V.visH;
  const g = new THREE.Group();
  g.userData.width = width;
  g.userData.height = height;
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
  g.userData.reset = () => g.userData.progress(0);
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
