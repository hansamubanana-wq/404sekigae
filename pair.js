"use strict";
/* =========================================================
   2人ずつの発表
   1回の発表 = 登場 (2人の名前を画面の真ん中に大きく出す)
             → 少し見せる
             → 移動 (それぞれの席へ。カメラや3D空間を使う)
   登場と移動はそれぞれ山札から選ぶので、組み合わせが毎回変わる
   list = [{ s: 生徒, key: 席 }, ...] (1〜2人)
   ========================================================= */

/* ---------------- 道具 ---------------- */
const seatW = key => { const { x, z } = seatXZ(key); return v3(x, PLATE_Y, z); };
const toLocal = w => V.stage.worldToLocal(w.clone());

// カメラを自由に動かす (終わったら camHome で元の位置へ)
const CAM = { pos: null, quat: null };
function camPoseLook(pos, look) {
  const m = new THREE.Matrix4().lookAt(pos, look, v3(0, 1, 0));
  return { pos: pos.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
}
function camGo(pose, ms, e = ease.inOut) {
  if (!V.camRig) {
    CAM.pos = V.camera.position.clone();
    CAM.quat = V.camera.quaternion.clone();
    V.camRig = () => { V.camera.position.copy(CAM.pos); V.camera.quaternion.copy(CAM.quat); };
  }
  const from = { pos: CAM.pos.clone(), quat: CAM.quat.clone() };
  return tween(ms, t => { CAM.pos.lerpVectors(from.pos, pose.pos, t); CAM.quat.slerpQuaternions(from.quat, pose.quat, t); }, e);
}
function camHome(ms = 700) {
  if (!V.camRig) return Promise.resolve();
  return camGo({ pos: V.homePos.clone().add(V.camOffset), quat: V.homeQuat.clone() }, ms).then(() => { V.camRig = null; });
}

// 名前カード (表に名前、裏に「?」)。setFace で別の名前に描き直せる
const pairCardPool = [];

function buildPairCard() {
  const src = V.card;
  const g = new THREE.Group();
  const body = new THREE.Mesh(src.body.geometry, src.body.material.clone());
  const rim = new THREE.Mesh(src.rim.geometry, new THREE.MeshBasicMaterial({ transparent: true }));
  const front = makeCardFront(src.front.geometry);
  front.position.z = .034;
  const back = new THREE.Mesh(src.back.geometry, new THREE.MeshBasicMaterial({ map: V.tex.back, transparent: true }));
  back.rotation.y = Math.PI;
  back.position.z = -.034;
  g.add(body, rim, front, back);
  g.userData.setFace = st => {
    setCardFront(front, st, g.userData.label);
    rim.material.color.setHex(HEX[st.gender]).multiplyScalar(1.7);
  };
  return g;
}

function pairCard(s, label, k) {
  const g = pairCardPool.pop() || buildPairCard();
  g.userData.label = label;
  g.userData.setFace(s);
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  g.scale.setScalar(k);
  g.visible = true;
  setGroupOpacity(g, 1);
  V.stage.add(g);
  return g;
}
function dropCard(g) {
  if (!g.parent) return;
  g.removeFromParent();
  pairCardPool.push(g);
}
// カードを消して、席に名前を入れる
async function landCard(g, s, key, style = "pop") {
  dropCard(g);
  await land(s, key, style);
}
function setGroupOpacity(g, a) {
  g.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = a; } });
}

// 2枚並べるときの大きさと位置
function pairLayout(n) {
  if (n < 2) return { k: V.heroK, xs: [0] };
  const k = Math.min(V.heroK * .64, V.visW * .37 / FACE_W);
  return { k, xs: [-FACE_W * k * .6, FACE_W * k * .6] };
}

function popIn(g, k, ms = 450) {
  g.visible = true;
  return tween(ms, t => g.scale.setScalar(Math.max(.01, k * t)), ease.back);
}
function revealBurst(g, s) {
  burst(g.position.clone().add(v3(0, 0, .3)), [hdr(HEX[s.gender], 3), hdr(HEX.gold, 3), hdr(0xffffff, 2.5)], 120, 4);
}

async function animateSeatReplay(moves, assign) {
  const flights = moves.map(({ s, from, key }) => {
    const start = plateLocal(from), end = plateLocal(key);
    const control = start.clone().lerp(end, .5);
    const dx = end.x - start.x, dz = end.z - start.z;
    const bend = .9 / (Math.hypot(dx, dz) || 1);
    control.x += dz * bend;
    control.y += 2.2;
    control.z -= dx * bend;
    const card = pairCard(s, "", 1);
    const tint = hdr(HEX[s.gender], 1.8);
    card.position.copy(start);
    card.visible = false;
    return { card, key, curve: new THREE.QuadraticBezierCurve3(start, control, end), tint, spark: -1 };
  });
  try {
    for (const { from } of moves) {
      hidden.add(from);
      seatLook(from);
    }
    sfx("switch");
    await Promise.all(moves.map(({ from }) => flipPlate(from, true, 270)));
    for (const { card } of flights) card.visible = true;
    await tween(950, t => {
      for (const flight of flights) {
        const { card, curve } = flight;
        curve.getPoint(t, card.position);
        card.rotation.z = Math.sin(Math.PI * t) * .22;
        sparkOnRoute(flight, t);
      }
    }, ease.inOut);
    assign();
    for (const { card, key, tint } of flights) {
      hidden.delete(key);
      seatLook(key);
      burst(card.position, tint, 26, 1.6, { life: .6, size: .045 });
      dropCard(card);
    }
    sfx("land", { vol: .7 });
    await Promise.all(flights.map(({ key }) => flipPlate(key, false, 320)));
  } finally {
    flights.forEach(({ card }) => dropCard(card));
  }
}

// 新しい演出は少数の小道具と既存の火花バッファを共有する。
function showRingRig() {
  const group = new THREE.Group();
  const geometry = new THREE.TorusGeometry(1, .045, 8, 48);
  for (const color of [0x38bdf8, 0xf0abfc, 0xfbbf24]) {
    const material = new THREE.MeshBasicMaterial({
      color: hdr(color, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function showCrystalRig() {
  const group = new THREE.Group();
  const geometry = new THREE.OctahedronGeometry(.58);
  const edges = new THREE.EdgesGeometry(geometry);
  for (const color of [0x38bdf8, 0xe879f9, 0xfbbf24]) {
    const crystal = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: .34, roughness: .24, metalness: .45,
    }));
    crystal.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: hdr(color, 2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    group.add(crystal);
  }
  group.userData.reset = () => group.children.forEach(crystal => { crystal.visible = true; });
  return group;
}

function showConstellation() {
  const shape = new THREE.IcosahedronGeometry(1);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(shape), new THREE.LineBasicMaterial({
    color: hdr(0x93c5fd, 2.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const stars = new THREE.Points(shape, new THREE.PointsMaterial({
    color: hdr(0xffe5a3, 2.5), map: V.tex.glow, size: .16, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const group = new THREE.Group();
  group.add(lines, stars);
  return group;
}

const ROUTE_POINTS = 25;
function showLightRails() {
  const group = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(ROUTE_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positions);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: hdr(0xffffff, 2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    line.frustumCulled = false;
    group.add(line);
  }
  group.userData.reset = () => group.children.forEach(line => { line.visible = true; });
  return group;
}

function sparkOnRoute(flight, t) {
  const step = Math.floor(t * 16);
  if (step === flight.spark) return;
  flight.spark = step;
  burst(flight.card.position, flight.tint, 3, .8, { life: .65, size: .06, grav: -.2 });
}

async function travelShowRoute(list, cards, duration, move) {
  const flights = cards.map((card, i) => ({
    card, from: card.position.clone(), to: plateLocal(list[i].key), size: card.scale.x,
    tint: hdr(HEX[list[i].s.gender], 2.2), spark: -1,
  }));
  sfx("whoosh", { vol: .75 });
  await tween(duration, t => {
    flights.forEach((flight, i) => {
      move(flight, t, i);
      flight.card.scale.setScalar(lerp(flight.size, 1, t));
      sparkOnRoute(flight, t);
    });
  }, ease.inOut);
  await Promise.all(list.map(({ s, key }, i) => landCard(cards[i], s, key)));
}

function showParallax(direction) {
  const offset = v3(direction * .72, .42, .15).applyQuaternion(V.homeQuat);
  return camGo(camPoseLook(V.homePos.clone().add(offset), V.stage.position), 850);
}

function buildFrontImpactRings() {
  const rig = new THREE.Group();
  const geometry = new THREE.RingGeometry(.94, 1, 64);
  for (const color of [0xffd693, 0xfffaf0]) {
    const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: hdr(color, 3.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .035 + rig.children.length * .02;
    rig.add(ring);
  }
  V.scene.add(rig);
  return rig;
}

async function frontRowLandingImpact(key) {
  const rig = V.frontImpactRings;
  const flash = document.getElementById("frontImpactFlash");
  const { x, z } = seatXZ(key);
  rig.position.set(x, 0, z);
  rig.visible = true;
  flash.hidden = false;
  bgm("finale");
  sfx("boom", { rate: .46, vol: 1.45 });
  sfx("slam", { rate: .62, vol: .7, delay: .065 });
  shake(1.2);
  const point = plateLocal(key);
  burst(point, [hdr(0xffca73, 3.3), hdr(0xfff5dc, 3.4)], 215, 5.4,
    { life: 1.2, size: .08, grav: 1.2, up: .65, flat: true, even: true });
  try {
    await Promise.all([
      rippleFromSeat(key),
      camHome(1850),
      tween(285, t => { flash.style.opacity = .66 * (1 - t) ** 2; }, ease.linear)
        .then(() => { flash.hidden = true; }),
      tween(1530, t => {
        shake(.58 * (1 - t) ** 2);
        rig.children.forEach((ring, i) => {
          const spread = clamp01((t - i * .065) / (1 - i * .065));
          ring.scale.setScalar(.24 + 14 * spread);
          ring.material.opacity = spread > 0 ? (.95 - i * .22) * (1 - spread) ** 1.25 : 0;
        });
      }, ease.linear),
    ]);
  } finally {
    rig.visible = false;
    flash.hidden = true;
  }
}

// 発表中の席以外で、まだ決まっていない席
const pendingExcept = list => [...hidden].filter(k => !list.some(x => x.key === k));

/* =========================================================
   登場: 名前カードを画面の真ん中に大きく出す
   (呼ばれた時点でカードは見えない状態。終わったら定位置・表向き・大きさ k)
   ========================================================= */
const INTRO2 = {
  // ジャイロリング: 傾いた輪が回り、奥から名前が現れる。
  async gyroscope(list, cards, k) {
    const rig = stageActor(showRingRig);
    const turn = showParallax(-1);
    sfx("phase");
    cards.forEach(g => { g.visible = true; });
    try {
      await tween(1650, t => {
        rig.position.z = lerp(-3, -.6, t);
        rig.children.forEach((ring, i) => {
          ring.position.set(0, 0, 0);
          ring.rotation.set(t * 4.5 + i, t * 3 + i * 1.5, t * 2.4);
          ring.scale.setScalar((.8 + i * .24) * lerp(.55, 2.6, t));
          ring.material.opacity = Math.sin(Math.PI * t) * .75;
        });
        cards.forEach((g, i) => {
          g.position.z = lerp(-5, 0, t);
          g.rotation.y = (1 - t) * (i ? 1.6 : -1.6);
          g.scale.setScalar(k * lerp(.25, 1, t));
        });
      }, ease.inOut);
      await turn;
    } finally {
      rig.userData.remove();
      await camHome(550);
    }
  },

  // 水晶のせり上がり: 回転する水晶と一緒に、下から名前がせり上がる。
  async crystalRise(list, cards, k) {
    const rig = stageActor(showCrystalRig);
    sfx("magic");
    cards.forEach(g => { g.visible = true; });
    try {
      await tween(1550, t => {
        rig.children.forEach((crystal, i) => {
          crystal.position.set((i - 1) * Math.min(V.visW * .2, 3.2), lerp(-V.visH * .43, -1.6 - i * .2, t), -1.7 - i * .3);
          crystal.rotation.set(t * 3 + i, t * 5, t * 2);
          crystal.scale.setScalar(.02 + Math.sin(Math.PI * t) * 1.15);
        });
        cards.forEach((g, i) => {
          g.position.y = lerp(-V.visH * .45, 0, t);
          g.position.z = -1.4 * (1 - t);
          g.rotation.z = Math.sin(Math.PI * t) * (i ? -.35 : .35);
          g.scale.setScalar(k * lerp(.4, 1, t));
        });
      }, ease.out);
    } finally { rig.userData.remove(); }
  },

  // 三重ゲート: 遠くの輪を順にくぐって手前に飛び出す。
  async depthGates(list, cards, k) {
    const rig = stageActor(showRingRig);
    sfx("beam");
    cards.forEach(g => { g.visible = true; });
    try {
      await tween(1450, t => {
        rig.children.forEach((ring, i) => {
          ring.position.set(0, 0, -7 + i * 2.5);
          ring.rotation.set(.16 * t, .18 * i, t);
          ring.scale.setScalar((2.9 + i * .3) * Math.min(1, V.visW / 8));
          ring.material.opacity = Math.max(0, 1 - Math.abs(-7 + i * 2.5 + 9 * (1 - t)) * .28) * (1 - t);
        });
        cards.forEach(g => {
          g.position.z = -9 * (1 - t);
          g.scale.setScalar(k * lerp(.5, 1, t));
        });
      }, ease.inOut);
    } finally { rig.userData.remove(); }
  },

  // 星座の展開: 立体の星座が展開し、頂点から名前が前に浮かぶ。
  async starMap(list, cards, k) {
    const rig = stageActor(showConstellation);
    const turn = showParallax(1);
    const xs = cards.map(g => g.position.x);
    sfx("chime");
    cards.forEach(g => { g.visible = true; });
    try {
      await tween(1650, t => {
        rig.position.z = lerp(-4, -1, t);
        rig.rotation.set(t * 2.4, t * 4.2, t * .7);
        rig.scale.setScalar(1 + Math.sin(t * Math.PI) * 2.2);
        rig.children.forEach(m => { m.material.opacity = Math.sin(t * Math.PI); });
        cards.forEach((g, i) => {
          g.position.set(xs[i] * lerp(.25, 1, t), Math.sin(t * Math.PI) * (i ? .8 : -.8), -3 * (1 - t));
          g.scale.setScalar(k * lerp(.16, 1, t));
        });
      }, ease.inOut);
      await turn;
    } finally {
      rig.userData.remove();
      await camHome(550);
    }
  },

  // ポン: 回りながら飛び出す
  async pop(list, cards, k) {
    for (let i = 0; i < cards.length; i++) {
      const g = cards[i];
      g.scale.setScalar(.01); g.visible = true;
      sfx("whoosh"); sfx("pop", { delay: .2 });
      revealBurst(g, list[i].s);
      tween(600, t => { g.scale.setScalar(Math.max(.01, k * t)); g.rotation.y = (1 - t) * Math.PI * 2; }, ease.back).then(() => { g.rotation.y = 0; });
      await sleep(260);
    }
    await sleep(450);
  },

  // 粒子2本: 光の粒が渦から集まって2人分の名前になる
  async particles(list, cards, k) {
    const P = V.particles, N = P.N, u = P.u;
    const side = P.geo.attributes.aSide.array;
    list.forEach((it, i) => {
      const i0 = Math.floor(N * i / list.length), i1 = Math.floor(N * (i + 1) / list.length);
      nameTargets(it.s, cards[i].userData.label, k, cards[i].position, i === 1);
      side.fill(i, i0, i1);
    });
    P.geo.attributes.aSide.needsUpdate = true;
    particleStart("galaxy");
    u.uColA.value.copy(hdr(HEX[list[0].s.gender], 1.5));
    u.uColA2.value.copy(hdr(HEX[(list[1] || list[0]).s.gender], 1.5));
    u.uColB.value.set(1.6, 1.45, 1.1);
    u.uForm.value = 0; u.uStream.value = 0; u.uFade.value = 1; u.uSwirl.value = 5;
    P.pts.visible = true;
    sfx("magic", { vol: .8 });
    await tween(1800, t => { u.uForm.value = t; }, ease.linear);
    cards.forEach(g => { g.visible = true; setGroupOpacity(g, 0); });
    sfx("jingle_reveal", { vol: .8 });
    cards.forEach((g, i) => revealBurst(g, list[i].s));
    await tween(500, t => { cards.forEach(g => setGroupOpacity(g, t)); u.uFade.value = 1 - t; }, ease.out);
    P.pts.visible = false;
    side.fill(0);
    P.geo.attributes.aSide.needsUpdate = true;
  },

  // カードシャッフル: 裏向きで入れ替わってから、同時にめくれる
  async shell(list, cards, k) {
    cards.forEach(g => { g.rotation.y = Math.PI; g.scale.setScalar(.01); g.visible = true; });
    sfx("flip");
    await tween(380, t => cards.forEach(g => g.scale.setScalar(Math.max(.01, k * t))), ease.back);
    if (cards.length > 1) {
      for (let r = 0; r < 3; r++) {
        const x0 = cards.map(g => g.position.x);
        sfx("whoosh", { vol: .6, vary: .2 });
        await tween(320, t => cards.forEach((g, i) => {
          g.position.x = lerp(x0[i], -x0[i], t);
          g.position.z = Math.sin(t * Math.PI) * (i ? 1.5 : -1.5) * (r % 2 ? 1 : -1);
        }), ease.inOut);
      }
    }
    await sleep(250);
    sfx("flip");
    await tween(450, t => cards.forEach(g => { g.rotation.y = Math.PI * (1 - t); }), ease.back);
    cards.forEach((g, i) => { g.rotation.set(0, 0, 0); revealBurst(g, list[i].s); });
    sfx("jingle_reveal", { vol: .8 });
  },

  // 隕石: 奥の空から火の玉になって落ちてくる
  async meteor(list, cards, k) {
    bubble("…なにか来る！", v3(0, V.visH * .32, 0), 900);
    await sleep(500);
    await Promise.all(cards.map((g, i) => sleep(i * 260).then(async () => {
      const home = g.position.clone();
      const from = home.clone().add(v3(V.visW * .7 * (i ? 1 : -1), V.visH * 1.1, -24));
      g.position.copy(from); g.scale.setScalar(k); g.visible = true;
      sfx("windbig", { rate: 1.2, vol: .6 });
      await tween(900, t => { g.position.lerpVectors(from, home, t); g.rotation.set(t * 4, t * 3, t * 6); fireTrail(g.position, 8); }, ease.in);
      g.rotation.set(0, 0, 0);
      shake(.35); sfx("boom", { vol: .7 }); sfx("crunch", { vol: .6 });
      flashAt(home.clone().add(v3(0, 0, .3)), hdr(0xffb020, 2), 6);
      burst(home.clone().add(v3(0, 0, .3)), [hdr(0xffb020, 3), hdr(0xff5a1f, 3), hdr(HEX[list[i].s.gender], 3)], 160, 6, { life: 1.1 });
      await tween(400, t => g.scale.set(k * (1 + (1 - t) * .3), k * (1 - (1 - t) * .3), k), ease.back);
    })));
    bubble("ドーン！", v3(0, V.visH * .3, 0), 800);
  },

  // ワープ: 光のトンネルから飛び出してくる
  async warp(list, cards, k) {
    const N = 420, pos = new Float32Array(N * 6), st = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.28, r = .6 + Math.pow(Math.random(), .6) * V.visW;
      st.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * .7, z: -Math.random() * 70 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lines.frustumCulled = false;
    V.stage.add(lines);
    let speed = 10;
    const un = addFrameHook(dt => {
      for (let i = 0; i < N; i++) {
        const p = st[i];
        p.z += speed * dt;
        if (p.z > 6) p.z -= 76;
        const len = Math.min(18, speed * .06);
        pos.set([p.x, p.y, p.z, p.x, p.y, p.z - len], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    });
    sfx("powerup", { rate: .7 }); sfx("ufo", { vol: .4, rate: 1.5 });
    await tween(1500, t => { speed = 10 + t * t * 140; }, ease.linear);
    const homes = cards.map(g => g.position.clone());
    cards.forEach(g => { g.visible = true; g.scale.setScalar(k); });
    await tween(500, t => { cards.forEach((g, i) => g.position.set(homes[i].x, homes[i].y, lerp(-60, 0, t))); speed = 150 * (1 - t) + 5; }, ease.out);
    sfx("laser", { rate: .7 }); sfx("jingle_reveal", { vol: .8 });
    cards.forEach((g, i) => revealBurst(g, list[i].s));
    flashAt(v3(0, 0, .3), hdr(0x9fd8ff, 2), 8);
    await tween(450, t => { lines.material.opacity = 1 - t; }, ease.out);
    un(); V.stage.remove(lines); geo.dispose(); lines.material.dispose();
  },

  // 幕開け: 赤い幕が閉じて、ドラムロールのあと開く
  async curtain(list, cards, k) {
    const W = V.visW + 2, H = V.visH + 2;
    if (!V.tex.curtain) { V.tex.curtain = canvasTex(curtainCanvas()); }
    const mat = new THREE.MeshStandardMaterial({ map: V.tex.curtain, roughness: .7 });
    const L = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 + .4, H), mat), Rr = L.clone();
    const val = new THREE.Mesh(new THREE.BoxGeometry(W + 1, .7, .3), new THREE.MeshStandardMaterial({ color: 0xc8901c, metalness: 1, roughness: .3 }));
    val.position.set(0, V.visH / 2 - .1, 1.3);
    V.stage.add(L, Rr, val);
    L.position.set(-W * .8, 0, 1.2); Rr.position.set(W * .8, 0, 1.2);
    sfx("cloth"); sfx("cloth", { delay: .1 });
    await tween(450, t => { L.position.x = lerp(-W * .8, -W / 4, t); Rr.position.x = lerp(W * .8, W / 4, t); }, ease.out);
    cards.forEach(g => { g.visible = true; g.scale.setScalar(k); });   // 幕が閉じてから置く
    bubble("ドゥルルルル…", v3(0, V.visH * .25, 1.4), 1400);
    await sleep(1400);
    bubble("ジャーン！", v3(0, V.visH * .25, 1.4), 800);
    sfx("cloth"); sfx("cloth", { delay: .15 });
    await tween(800, t => {
      L.position.x = lerp(-W / 4, -W * .75, t); Rr.position.x = lerp(W / 4, W * .75, t);
      L.scale.x = Rr.scale.x = 1 - t * .5;
    }, ease.inOut);
    cards.forEach((g, i) => revealBurst(g, list[i].s));
    V.stage.remove(L, Rr, val);
    L.geometry.dispose(); mat.dispose(); val.geometry.dispose(); val.material.dispose();
  },

  // ルーレット: 名前が高速で入れ替わり、1人ずつ止まる
  async roulette(list, cards, k) {
    const pool = studentsOriginal;
    cards.forEach(g => { g.visible = true; g.scale.setScalar(k); });
    const stopAt = cards.map((g, i) => 1500 + i * 700);
    const t0 = performance.now();
    const stopped = cards.map(() => false);
    await new Promise(res => {
      const step = () => {
        const el = (performance.now() - t0) * TIME_SCALE;
        let all = true;
        cards.forEach((g, i) => {
          if (stopped[i]) return;
          if (el >= stopAt[i]) {
            stopped[i] = true;
            g.userData.setFace(list[i].s);
            sfx("stop"); revealBurst(g, list[i].s);
            tween(300, t => g.scale.setScalar(k * (1 + Math.sin(t * Math.PI) * .1)), ease.out);
            return;
          }
          all = false;
          g.userData.setFace(pick(pool));
          sfx("tick", { vol: .5, vary: .2 });
        });
        if (all) return res();
        const remain = Math.min(...stopAt.filter((s2, i) => !stopped[i])) - el;
        setTimeout(step, Math.max(55, Math.min(260, 1800 / Math.max(1, remain / 20))) / TIME_SCALE);
      };
      step();
    });
    sfx("jingle_reveal", { vol: .8 });
  },

  // サーチライト: ライトが探しまわり、下からせり上がる
  async search(list, cards, k) {
    await veil(false, 250);
    V.spotSpeed = 7;
    bubble("どこだ…？", v3(0, V.visH * .3, 0), 1300);
    sfx("suspense");
    await sleep(1400);
    V.spotSpeed = 1;
    V.spotFocusAt.set(0, 0, -.5);
    await tween(500, t => { V.spotFocus = t; }, ease.inOut);
    await veil(true, 250);
    const homes = cards.map(g => g.position.clone());
    cards.forEach(g => { g.visible = true; g.scale.setScalar(k); });
    sfx("powerup");
    await tween(900, t => cards.forEach((g, i) => { g.position.y = lerp(-V.visH * .8, homes[i].y, t); g.rotation.y = (1 - t) * Math.PI * 3; }), ease.out);
    cards.forEach((g, i) => { g.rotation.set(0, 0, 0); revealBurst(g, list[i].s); });
    tween(500, t => { V.spotFocus = 1 - t; }, ease.inOut);
  },

  // ノイズ: 電波が乱れて別人が映る → 調整して本人に
  async glitch(list, cards, k) {
    cards.forEach(g => { g.visible = true; g.scale.setScalar(k); });
    bubble("ザザッ…", v3(0, V.visH * .3, 0), 1300);
    const homes = cards.map(g => g.position.clone());
    const end = performance.now() + 1400 / TIME_SCALE;
    while (performance.now() < end) {
      cards.forEach((g, i) => {
        g.userData.setFace(pick(studentsOriginal));
        g.position.x = homes[i].x + rand(-.2, .2);
        g.scale.set(k * rand(.9, 1.12), k * rand(.85, 1.1), k);
      });
      sfx("glitch", { vol: .5, vary: .3 });
      await sleep(rand(60, 110));
    }
    cards.forEach((g, i) => { g.position.copy(homes[i]); g.scale.setScalar(k); });
    bubble("…チャンネル調整中", v3(0, V.visH * .3, 0), 900);
    await tween(400, t => cards.forEach(g => g.scale.set(k, k * (1 - t * .97), k)), ease.in);
    cards.forEach((g, i) => g.userData.setFace(list[i].s));
    await tween(420, t => cards.forEach(g => g.scale.set(k, k * Math.max(.03, t), k)), ease.back);
    cards.forEach((g, i) => revealBurst(g, list[i].s));
    sfx("jingle_reveal", { vol: .8 });
  },
};

/* =========================================================
   移動: それぞれの席へ (最後に全員着地させる)
   ========================================================= */
const TRAVEL2 = {
  // 光のレール: それぞれの着地点へつながる曲線の上を滑る。
  async lightRails(list, cards) {
    const rig = stageActor(showLightRails);
    const sample = v3();
    const paths = list.map(({ s, key }, i) => {
      const start = cards[i].position.clone(), end = plateLocal(key);
      const a = start.clone().add(v3(i ? 1.3 : -1.3, 2.3, -1));
      const b = end.clone().add(v3(i ? -1.5 : 1.5, 1.4, 2));
      const curve = new THREE.CubicBezierCurve3(start, a, b, end);
      const line = rig.children[i], attr = line.geometry.attributes.position;
      line.material.color.setHex(HEX[s.gender]).multiplyScalar(3);
      for (let j = 0; j < ROUTE_POINTS; j++) {
        curve.getPoint(j / (ROUTE_POINTS - 1), sample);
        attr.setXYZ(j, sample.x, sample.y, sample.z);
      }
      attr.needsUpdate = true;
      return curve;
    });
    if (cards.length < 2) rig.children[1].visible = false;
    try {
      await travelShowRoute(list, cards, 1750, ({ card }, t, i) => {
        paths[i].getPoint(t, card.position);
        rig.children[i].material.opacity = .78 * (1 - t);
        card.rotation.z = Math.sin(Math.PI * t) * (i ? -.3 : .3);
      });
    } finally { rig.userData.remove(); }
  },

  // リング・スラローム: 斜めに並ぶ輪を縫ってから左右の席へ別れる。
  async ringSlalom(list, cards) {
    const rig = stageActor(showRingRig);
    const turn = showParallax(1);
    const centers = [v3(.8, .7, -.9), v3(-1.1, 1, -2.6), v3(.65, .6, -4.2)];
    const paths = list.map(({ key }, i) => new THREE.CatmullRomCurve3([
      cards[i].position.clone(),
      ...centers.map(p => p.clone().add(v3(i ? .28 : -.28, 0, 0))),
      plateLocal(key),
    ]));
    rig.children.forEach((ring, i) => {
      ring.position.copy(centers[i]);
      ring.rotation.set(.15 * i, i % 2 ? -.45 : .4, 0);
      ring.scale.setScalar(1.65);
      ring.material.opacity = .7;
    });
    try {
      await travelShowRoute(list, cards, 2100, ({ card }, t, i) => {
        paths[i].getPoint(t, card.position);
        rig.children.forEach(ring => { ring.material.opacity = .7 * (1 - t); });
        card.rotation.y = Math.sin(t * Math.PI * 3) * .5;
      });
      await turn;
    } finally {
      rig.userData.remove();
      await camHome(550);
    }
  },

  // 二重らせん: 互いの周りを回ってから、それぞれ着地する。
  async doubleHelix(list, cards) {
    await travelShowRoute(list, cards, 1650, ({ card, from, to }, t, i) => {
      const angle = t * Math.PI * 4 + i * Math.PI;
      const envelope = Math.sin(t * Math.PI);
      card.position.lerpVectors(from, to, t);
      card.position.x += Math.cos(angle) * envelope * 1.25;
      card.position.y += (1.8 + Math.sin(angle) * .85) * envelope;
      card.position.z += Math.sin(angle) * envelope * 1.15;
      card.rotation.z = Math.cos(angle) * envelope * .6;
    });
  },

  // 天井クレーン: 水晶がカードを吸い上げ、席の真上から下ろす。
  async ceilingCrane(list, cards) {
    const rig = stageActor(showCrystalRig);
    const lift = Math.min(2.8, V.visH * .23);
    rig.children.forEach((crystal, i) => { crystal.visible = i < cards.length; });
    sfx("beam", { vol: .5 });
    try {
      await travelShowRoute(list, cards, 2100, ({ card, from, to }, t, i) => {
        const across = clamp01((t - .28) / .46);
        const up = Math.min(1, t / .28, (1 - t) / .26);
        card.position.lerpVectors(from, to, ease.inOut(across));
        card.position.y += lift * ease.inOut(up);
        const crystal = rig.children[i];
        crystal.position.copy(card.position);
        crystal.position.y += .85;
        crystal.rotation.set(t * 3, t * 5, .2);
        crystal.scale.setScalar(.01 + .9 * Math.sin(Math.PI * t));
      });
    } finally { rig.userData.remove(); }
  },

  // 弧: それぞれ弧を描いて飛んでいく
  async arc(list, cards) {
    dolly(.12, list[0].key, 900);
    await Promise.all(cards.map((g, i) => {
      const { s, key } = list[i];
      const P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
      const ctrl = p0.clone().lerp(P, .4).add(v3((i ? 1 : -1) * .8, 2.3, 1.2));
      return sleep(i * 200).then(() => {
        sfx("whoosh", { pan: P.x / V.visW });
        return tween(1050, t => {
          g.position.copy(bez(p0, ctrl, P, t));
          g.scale.setScalar(lerp(s0, 1, t));
          g.rotation.set(0, Math.sin(t * Math.PI) * (i ? -.7 : .7), -Math.sin(t * Math.PI) * .15);
        }, ease.inOut);
      }).then(() => landCard(g, s, key));
    }));
  },

  // カメラ追跡: カードと一緒にカメラも席へ飛び込む (1人ずつ)
  async dive(list, cards, { frontRowImpact } = {}) {
    for (let i = 0; i < cards.length; i++) {
      const g = cards[i], { s, key } = list[i];
      const W = seatW(key), side = W.x > 0 ? -1 : 1;
      const offset = v3(side * rand(.8, 1.6), rand(1.4, 2), rand(2.8, 3.3));
      if (frontRowImpact) offset.multiplyScalar(.78);
      const pose = camPoseLook(W.clone().add(offset), W.clone().add(v3(0, .1, 0)));
      const P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
      const ctrl = p0.clone().lerp(P, .5).add(v3(0, 2, 1.5));
      sfx("whoosh", { rate: .8 });
      if (i === 0 && cards[1]) tween(400, t => cards[1].position.x = lerp(cards[1].position.x, V.visW * .7, t), ease.in);
      // 最前列中央では移動の最後の2割に約1秒を使い、着地で通常速度に戻す。
      const approach = frontRowImpact
        ? t => t < .43 ? .8 * ease.out(t / .43) : lerp(.8, 1, (t - .43) / .57)
        : ease.inOut;
      await Promise.all([
        camGo(pose, frontRowImpact ? 1700 : 1000, approach),
        tween(frontRowImpact ? 1700 : 950, t => {
          g.position.copy(bez(p0, ctrl, P, t));
          g.scale.setScalar(lerp(s0, 1, t));
          g.rotation.y = Math.sin(t * Math.PI) * .6;
        }, approach),
      ]);
      g.rotation.set(0, 0, 0);
      await landCard(g, s, key);
      if (frontRowImpact) {
        await frontRowLandingImpact(key);
        return;
      }
      shake(.05);
      await sleep(750);
    }
    await camHome(800);
  },

  // 空から落下: いったん画面の外へ消えて、席めがけて火の玉で落ちてくる
  async meteorDrop(list, cards) {
    sfx("whoosh", { rate: .7 });
    await tween(550, t => cards.forEach(g => { g.position.y += t * .6; g.rotation.z = t * 1.5; g.scale.setScalar(g.scale.x * .985); }), ease.in);
    cards.forEach(g => { g.visible = false; g.rotation.set(0, 0, 0); });
    dolly(-1.4, null, 600);
    bubble("…ヒュ～", v3(0, V.visH * .3, 0), 900);
    await sleep(800);
    await Promise.all(cards.map((g, i) => sleep(i * 380).then(async () => {
      const { s, key } = list[i];
      const P = plateLocal(key), from = P.clone().add(v3(rand(-2, 2), V.visH * 1.3, 3));
      g.visible = true;
      sfx("windbig", { rate: 1.3, vol: .6 });
      await tween(650, t => { g.position.lerpVectors(from, P, t); g.scale.setScalar(lerp(.6, 1, t)); g.rotation.set(0, 0, (1 - t) * 3); fireTrail(g.position, 8); }, ease.in);
      g.rotation.set(0, 0, 0);
      impact(key, s, 1.1);
      await landCard(g, s, key);
    })));
    await sleep(300);
    await dolly(0, null, 600);
  },

  // ロケット: カードを乗せて打ち上がり、教室の上を回って席へ
  async rockets(list, cards) {
    bubble("発射！", v3(0, V.visH * .3, 0), 800);
    dolly(-1.2, null, 700);
    await Promise.all(cards.map((g, i) => sleep(i * 250).then(async () => {
      const { s, key } = list[i];
      const rk = stageActor(buildRocket);
      rk.scale.setScalar(.9);
      const P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
      const sx = p0.x === 0 ? (P.x > 0 ? 1 : -1) : Math.sign(p0.x);
      const top = p0.clone().add(v3(sx * V.visW * .35, V.visH * .6, -6));
      const path = t => t < .45 ? bez(p0, p0.clone().add(v3(0, V.visH * .5, 0)), top, t / .45) : bez(top, P.clone().add(v3(0, 4.5, 1.5)), P, (t - .45) / .55);
      let prev = path(0);
      const UPV = v3(0, 1, 0);
      await tween(2200, t => {
        const p = path(t), d = p.clone().sub(prev);
        prev = p;
        g.position.copy(p);
        g.scale.setScalar(lerp(s0 * .55, 1, t) * (t < .1 ? 1 + (1 - t / .1) * .8 : 1));
        if (d.lengthSq() > 1e-8) {
          const dir = d.normalize();
          rk.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(UPV, dir), .35);
          rk.position.copy(p).addScaledVector(dir, -(FACE_H * g.scale.x * .5 + .5)).add(v3(0, 0, -.2));
          fireTrail(rk.position.clone().addScaledVector(dir, -.85), 4);
          g.rotation.z = Math.max(-.5, Math.min(.5, Math.atan2(dir.y, dir.x) * .12));
        }
      }, ease.inOut);
      g.rotation.set(0, 0, 0);
      rk.userData.remove();
      impact(key, s, .9);
      await landCard(g, s, key);
    })));
    await sleep(300);
    await dolly(0, null, 600);
  },

  // UFO: 2枚まとめて吸い上げ、席ごとにビームで降ろす
  async ufo(list, cards) {
    const W = V.visW, H = V.visH;
    const ufo = stageUfo();
    const hum = sfx("ufo", { loop: true, vol: .55 });
    const top = v3(0, H * .38, 0);
    ufo.g.position.set(0, H / 2 + 2, 0);
    bubble("！？", v3(0, H * .2, 0), 800);
    await tween(800, t => ufo.g.position.lerpVectors(v3(0, H / 2 + 2, 0), top, t), ease.out);
    ufo.beam.visible = true; ufo.beam.material.uniforms.uOpacity.value = .85; sfx("beam");
    ufo.beam.scale.set(1.6, H * .7, 1.6);
    const c0 = cards.map(g => g.position.clone()), s0 = cards.map(g => g.scale.x);
    await tween(900, t => cards.forEach((g, i) => {
      g.position.lerpVectors(c0[i], top.clone().add(v3(0, -.2, 0)), t);
      g.scale.setScalar(s0[i] * (1 - t * .9));
      g.rotation.z = Math.sin(t * Math.PI * 5) * .3;
    }), ease.in);
    cards.forEach(g => { g.visible = false; g.rotation.set(0, 0, 0); });
    ufo.beam.visible = false;
    for (let i = 0; i < cards.length; i++) {
      const g = cards[i], { s, key } = list[i];
      const P = plateLocal(key), above = P.clone().add(v3(0, 2.4, 0));
      const u0 = ufo.g.position.clone();
      dolly(.12, key, 800);
      await tween(800, t => ufo.g.position.lerpVectors(u0, above, t), ease.inOut);
      ufo.beam.visible = true; sfx("beam");
      const st = above.clone().add(v3(0, -.2, 0));
      g.visible = true; g.position.copy(st);
      await tween(600, t => { g.position.lerpVectors(st, P, t); g.scale.setScalar(lerp(.1, 1, t)); ufo.beam.scale.set(.9, Math.max(.01, ufo.g.position.y - g.position.y), .9); }, ease.out);
      ufo.beam.visible = false;
      await landCard(g, s, key);
    }
    const u1 = ufo.g.position.clone();
    tween(800, t => ufo.g.position.set(u1.x + t * 3, u1.y + t * (H + 4), u1.z), ease.in).then(() => { ufo.remove(); if (hum) hum.stop(.5); });
    await dolly(0, null, 500);
  },

  // 猫: 猫がカードをくわえて、席まで走っていく
  async cats(list, cards) {
    const W = V.visW, H = V.visH, CS = 1.2;
    const furs = [0xf2a541, 0x9aa3ad, 0x3a3a3a, 0xf6efe4];
    bubble("！？", v3(0, H * .2, 0), 700);
    for (let i = 0; i < 24; i++) sfx("step", { vol: .45, delay: i * .14 / TIME_SCALE, rate: 1.5, vary: .3 });
    await Promise.all(cards.map((g, i) => sleep(i * 200).then(async () => {
      const { s, key } = list[i];
      const from = cards.length > 1 ? (i ? 1 : -1) : -1;
      const cat = stageActor(buildCat, pick(furs));
      const dirSet = d => cat.scale.set(CS * d, CS, CS);   // d = +1: 右向き
      const low = v3(g.position.x, -H * .3, 0);
      const s0 = g.scale.x, small = V.heroK * .4, g0 = g.position.clone();
      tween(500, t => { g.position.lerpVectors(g0, low.clone().add(v3(0, .7 * CS, .25)), t); g.scale.setScalar(lerp(s0, small, t)); }, ease.out);
      const start = v3(from * (W / 2 + 1.5), -H * .3 - .75 * CS, .2);
      cat.position.copy(start); dirSet(-from);
      const reach = v3(low.x + from * .9 * CS, start.y, .2);
      await tween(800, t => cat.position.lerpVectors(start, reach, t), ease.out);
      bubble("ニャッ", cat.position.clone().add(v3(0, 1.3 * CS, 0)), 700);
      // 席に向かって奥へ走る
      const P = plateLocal(key);
      const goal = P.clone().add(v3(P.x > reach.x ? -.95 * CS : .95 * CS, -.62 * CS, -.25));
      dirSet(goal.x > reach.x ? 1 : -1);
      const d = goal.x > reach.x ? 1 : -1;
      const gs = g.scale.x;
      await tween(1300, t => {
        cat.position.lerpVectors(reach, goal, t);
        cat.position.y += Math.abs(Math.sin(t * Math.PI * 7)) * .08;
        g.position.copy(cat.position).add(v3(d * .95 * CS, .62 * CS, .25));
        g.scale.setScalar(lerp(gs, 1, t));
        g.rotation.z = Math.sin(t * 30) * .1;
      }, ease.inOut);
      g.rotation.set(0, 0, 0);
      const q0 = g.position.clone();
      await tween(250, t => g.position.lerpVectors(q0, P, t), ease.out);
      const exit = v3(goal.x + d * (W + 4), goal.y, goal.z);
      tween(1100, t => cat.position.lerpVectors(goal, exit, t), ease.in).then(() => cat.userData.remove());
      await landCard(g, s, key);
    })));
  },

  // フェイント: 1枚が違う席に降りかけて「…ではなく！」
  async decoy(list, cards) {
    const pool = pendingExcept(list);
    const fi = Math.floor(Math.random() * cards.length);
    await Promise.all(cards.map((g, i) => (async () => {
      const { s, key } = list[i];
      if (i === fi && pool.length) {
        const d = farSeats(key, pool, 1)[0], o = V.seat[d];
        const D = plateLocal(d).add(v3(0, .55, .2));
        const p0 = g.position.clone(), s0 = g.scale.x;
        sfx("whoosh");
        await tween(1000, t => { g.position.copy(bez(p0, p0.clone().lerp(D, .5).add(v3(0, 2, 1)), D, t)); g.scale.setScalar(lerp(s0, 1.05, t)); }, ease.inOut);
        const un = addFrameHook((dt, tt) => { o.pivot.rotation.z = Math.sin(tt * 30) * .06; });
        bubble("ここ…？", D.clone().add(v3(0, .5, 0)), 800);
        await sleep(900);
        bubble("…ではなく！", D.clone().add(v3(0, .5, 0)), 800);
        await sleep(600);
        un(); o.pivot.rotation.z = 0;
        const P = plateLocal(key), q0 = g.position.clone();
        sfx("whoosh");
        await tween(800, t => { g.position.copy(bez(q0, q0.clone().lerp(P, .5).add(v3(0, 1.6, .5)), P, t)); g.scale.setScalar(lerp(1.05, 1, t)); }, ease.inOut);
        await landCard(g, s, key);
      } else {
        const P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
        await sleep(300);
        sfx("whoosh");
        await tween(1000, t => { g.position.copy(bez(p0, p0.clone().lerp(P, .4).add(v3(0, 2.2, 1)), P, t)); g.scale.setScalar(lerp(s0, 1, t)); }, ease.inOut);
        await landCard(g, s, key);
      }
    })()));
  },

  // バウンド: 机の上を跳ねて、本当の席へ
  async bounce(list, cards) {
    const pool = pendingExcept(list);
    await Promise.all(cards.map((g, i) => sleep(i * 250).then(async () => {
      const { s, key } = list[i];
      const hops = pool.length ? shuffleArray(farSeats(key, pool, Math.min(2, pool.length))) : [];
      const pts = [...hops, key];
      let from = g.position.clone(), s0 = g.scale.x;
      for (let h = 0; h < pts.length; h++) {
        const last = h === pts.length - 1;
        const to = plateLocal(pts[h]).add(last ? v3() : v3(0, .45, .2));
        const ctrl = from.clone().lerp(to, .5).add(v3(0, 2.6, .5));
        await tween(h === 0 ? 800 : 600, t => { g.position.copy(bez(from, ctrl, to, t)); g.scale.setScalar(lerp(s0, 1, h === 0 ? t : 1)); g.rotation.z = Math.sin(t * Math.PI * 2) * .2; }, ease.linear);
        g.rotation.z = 0;
        if (!last) {
          bubble(pick(["ボヨン", "ぽよん", "ボイン"]), to.clone().add(v3(0, .6, 0)), 600);
          const o = V.seat[pts[h]];
          tween(300, t => o.pivot.scale.set(1 + Math.sin(t * Math.PI) * .15, 1 - Math.sin(t * Math.PI) * .3, 1), ease.out);
        }
        from = g.position.clone(); s0 = 1;
      }
      await landCard(g, s, key);
    })));
  },

  // テレポート: 光の柱で消えて、席の上に光の柱で現れる
  async teleport(list, cards) {
    const pillar = (local, h, col) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: V.tex.glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.copy(local); m.scale.set(.01, h, 1); V.stage.add(m);
      return m;
    };
    const col = hdr(0x9fd8ff, 2.2);
    const ps = cards.map(g => pillar(g.position, V.visH * 1.4, col));
    await tween(300, t => ps.forEach(m => { m.scale.x = t * 2.2; }), ease.out);
    bubble("シュン！", v3(0, V.visH * .3, 0), 700);
    const ks = cards.map(g => g.scale.x);
    await tween(450, t => cards.forEach((g, i) => { g.scale.set(ks[i] * (1 - t), ks[i] * (1 + t * .5), ks[i]); g.rotation.y = t * 8; }), ease.in);
    cards.forEach(g => { g.visible = false; g.rotation.set(0, 0, 0); });
    await tween(250, t => ps.forEach(m => { m.scale.x = 2.2 * (1 - t); }), ease.in);
    ps.forEach(m => { V.stage.remove(m); m.geometry.dispose(); m.material.dispose(); });
    dolly(.12, list[0].key, 700);
    await sleep(350);
    await Promise.all(cards.map((g, i) => sleep(i * 300).then(async () => {
      const { s, key } = list[i], P = plateLocal(key);
      const p2 = pillar(P, 6, col);
      sfx("beam"); sfx("phase", { rate: .8, delay: .15 });
      await tween(300, t => { p2.scale.x = t * 1.8; }, ease.out);
      g.visible = true; g.position.copy(P);
      await tween(450, t => { g.scale.set(Math.max(.01, t), 1 + (1 - t) * .5, 1); g.visible = t > .9 || Math.random() < .7; }, ease.out);
      g.visible = true;
      await tween(250, t => { p2.scale.x = 1.8 * (1 - t); }, ease.in);
      V.stage.remove(p2); p2.geometry.dispose(); p2.material.dispose();
      await landCard(g, s, key);
    })));
    await dolly(0, null, 500);
  },

  // 強風: 吹き飛ばされて、木の葉みたいにひらひら席へ舞い降りる
  async wind(list, cards) {
    const W = V.visW, H = V.visH, toRight = Math.random() < .5;
    const gust = stageGust(toRight ? 1 : -1);
    bubble("ビュオォォ！", v3(toRight ? -W * .3 : W * .3, H * .3, .5), 1000);
    const gusting = tween(2000, t => gust.userData.progress(t), ease.linear);
    await sleep(400);
    const p0 = cards.map(g => g.position.clone()), s0 = cards.map(g => g.scale.x);
    await tween(1200, t => cards.forEach((g, i) => {
      g.position.set(lerp(p0[i].x, toRight ? W + 4 : -W - 4, t), p0[i].y + Math.sin(t * Math.PI * 3 + i) * 1.1 - t, p0[i].z + t * 2);
      g.rotation.set(t * 9, t * 6 * (toRight ? 1 : -1), t * (12 + i * 3) * (toRight ? -1 : 1));
      g.scale.setScalar(s0[i] * (1 - t * .4));
    }), ease.in);
    gusting.then(() => gust.userData.remove());
    dolly(.1, list[0].key, 1400);
    await sleep(500);
    await Promise.all(cards.map((g, i) => sleep(i * 300).then(async () => {
      const { s, key } = list[i], P = plateLocal(key);
      const start = v3(P.x + (P.x > 0 ? -1 : 1) * W * .3, H / 2 + 1.5, -2);
      await tween(2300, t => {
        const p = start.clone().lerp(P, t);
        p.x += Math.sin(t * Math.PI * 3.5 + i) * W * .22 * (1 - t);
        g.position.copy(p);
        g.scale.setScalar(lerp(V.heroK * .45, 1, t));
        g.rotation.set(Math.sin(t * Math.PI * 3) * .9 * (1 - t), Math.sin(t * Math.PI * 2.3) * .6 * (1 - t), Math.sin(t * Math.PI * 7) * .5 * (1 - t));
      }, ease.linear);
      g.rotation.set(0, 0, 0);
      await landCard(g, s, key, "pop");
    })));
    await dolly(0, null, 500);
  },

  // せり上がり: カードが席の光の柱に吸い込まれ、札が浮かびながら名前が出る
  async rise(list, cards) {
    const pillars = list.map(({ key }) => {
      const W = seatW(key), m = beamMesh(0xfff2cc, 0);
      V.scene.add(m);
      aimBeam(m, v3(W.x, 11, W.z), v3(W.x, 0, W.z), .95);
      return m;
    });
    sfx("powerup");
    await Promise.all(cards.map((g, i) => {
      const P = plateLocal(list[i].key), p0 = g.position.clone(), s0 = g.scale.x;
      return tween(900, t => {
        g.position.copy(bez(p0, p0.clone().lerp(P, .5).add(v3(0, 2.5, 1)), P.clone().add(v3(0, 1.4, 0)), t));
        g.scale.setScalar(lerp(s0, .5, t));
        pillars[i].material.uniforms.uOpacity.value = .6 * t;
      }, ease.inOut);
    }));
    cards.forEach(dropCard);
    await tween(700, t => list.forEach(({ key }) => {
      const o = V.seat[key];
      o.jump = 1.3 * t; o.pivot.scale.setScalar(1 + .6 * t); o.flipper.rotation.y = Math.PI + t * Math.PI * 4;
    }), ease.out);
    for (const { s, key } of list) { V.seat[key].flipper.rotation.y = Math.PI; land(s, key, "flip"); await sleep(220); }
    await sleep(700);
    await tween(450, t => {
      list.forEach(({ key }) => { const o = V.seat[key]; o.jump = 1.3 * (1 - t); o.pivot.scale.setScalar(1 + .6 * (1 - t)); });
      pillars.forEach(m => { m.material.uniforms.uOpacity.value = .6 * (1 - t); });
    }, ease.inOut);
    pillars.forEach(m => { V.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    list.forEach(({ key }) => { V.seat[key].jump = 0; V.seat[key].pivot.scale.setScalar(1); });
  },

  // スポットライト: 暗くなった教室で、ライトが2つの席に止まり、そこへカードが飛ぶ
  async spot(list, cards) {
    await tween(300, t => setPlateDim(lerp(1, .4, t)), ease.out);
    V.spotLock = [0, 1, 2, 3].map(i => seatW(list[i % list.length].key).setY(0));
    V.spotLockAmt = 0;
    sfx("suspense");
    await tween(600, t => { V.spotLockAmt = t; }, ease.inOut);
    await Promise.all(cards.map((g, i) => {
      const { s, key } = list[i], P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
      return sleep(i * 200).then(() => {
        sfx("whoosh");
        return tween(950, t => { g.position.copy(bez(p0, p0.clone().lerp(P, .4).add(v3(0, 2.2, 1)), P, t)); g.scale.setScalar(lerp(s0, 1, t)); }, ease.inOut);
      }).then(async () => {
        await landCard(g, s, key);
        const o = V.seat[key];
        o.front.material.color.setScalar(.86); o.back.material.color.setScalar(.9);
      });
    }));
    await sleep(600);
    await tween(400, t => { setPlateDim(lerp(.4, 1, t)); V.spotLockAmt = 1 - t; }, ease.inOut);
    V.spotLock = null;
  },
};
const TRAVEL_NEEDS = { decoy: 1 };

/* ---------------- 進行 ---------------- */
let introDeck2 = null, travelDeck2 = null, lastI2 = null, lastT2 = null, pairCount = 0, pairTotal = 0;
function resetPairDeck(total = 0) {
  introDeck2 = new Deck(Object.keys(INTRO2));
  travelDeck2 = new Deck(Object.keys(TRAVEL2));
  lastI2 = lastT2 = null;
  pairCount = 0;
  pairTotal = total;
}

// force: { intro, travel } で演出を指定できる
async function announcePair(list, force = {}) {
  const pending = pendingExcept(list).length;
  const intro = force.intro || introDeck2.draw(x => x !== lastI2);
  const travel = force.travel || travelDeck2.draw(x => x !== lastT2 && (TRAVEL_NEEDS[x] || 0) <= pending);
  lastI2 = intro; lastT2 = travel;
  const { k, xs } = pairLayout(list.length);
  const labels = list.map((_, i) => pairCount + i + 1 === pairTotal ? "ラスト！" : `${pairCount + i + 1}人目`);
  const cards = list.map(({ s }, i) => { const g = pairCard(s, labels[i], k); g.position.set(xs[i], 0, 0); g.visible = false; return g; });
  try {
    veil(true, 400);
    await INTRO2[intro](list, cards, k);
    for (let i = 0; i < cards.length; i++) {
      burst(cards[i].position, hdr(HEX[list[i].s.gender], 1.8), 18, 1.05, { life: .8, size: .045, grav: -.2 });
    }
    await sleep(force.hold ?? 1200);         // 名前を大きく見せておく
    veil(false, 500);
    await TRAVEL2[travel](list, cards, force);
  } finally {
    // 途中で何かあっても、カメラや照明を元に戻し、全員を着地させる
    cards.forEach(dropCard);
    if (V.camRig) await camHome(400);
    V.spotLock = null; V.spotSpeed = 1; V.spotFocus = 0;
    for (const { s, key } of list) if (hidden.has(key)) await land(s, key, "pop");
    veil(false, 200);
  }
  pairCount += list.length;
  await sleep(500);
  dolly(0, null, 600);
  await sleep(250);
}

// 発表の組を作る: 2人ずつ。最前列中央の席があるときは、最後の3人 (最前列中央 + 2人) を1つの組にする
// 最前列中央がないとき (固定しているとき) は、最後の1人だけ1人で
function makeRounds(order) {
  const rounds = [];
  if (!order.length) return rounds;
  const fi = order.indexOf(FRONT_ROW.key);
  const head = fi >= 0 ? order.slice(0, fi) : order.slice(0, -1);
  const tail = fi >= 0 ? order.slice(fi) : order.slice(-1);
  for (let i = 0; i < head.length; i += 2) rounds.push(head.slice(i, i + 2));
  rounds.push(tail);
  return rounds;
}

/* ---------------- 起動時の準備 ----------------
   演出で初めて使う物が出た瞬間に、描画プログラムの準備で一瞬止まる (カクつく) のを防ぐため、
   起動時に一度ずつ作って準備させ、見えない状態で残しておく */
async function warmUpShaders() {
  V.frontImpactRings = buildFrontImpactRings();
  const g = new THREE.Group();
  V.stage.add(g);
  const ufo = stageUfo();
  ufo.beam.visible = true;
  const wind = stageGust(1);
  wind.userData.progress(.5);
  const actors = [
    wind, ufo.g, stageActor(buildRocket), stageActor(buildClock), stageActor(buildZs),
    stageActor(showRingRig), stageActor(showCrystalRig), stageActor(showConstellation), stageActor(showLightRails),
    ...[0xf2a541, 0x9aa3ad, 0x3a3a3a, 0xf6efe4].map(fur => stageActor(buildCat, fur)),
  ];
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(.1, .1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), 2);
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.1, 8, 6), new THREE.MeshPhysicalMaterial({ metalness: .15, roughness: .15, clearcoat: 1 }), 2);
  [confetti, balls].forEach(m => { m.setColorAt(0, new THREE.Color(1, 1, 1)); m.setColorAt(1, new THREE.Color(1, 0, 0)); });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: V.tex.glow, roughness: .7 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 16), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beam = beamMesh(0xffffff, .1);
  const gift = new THREE.Mesh(new THREE.TorusKnotGeometry(.1, .03, 16, 4), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: .3, metalness: .8, emissive: 0x553300, emissiveIntensity: .4 }));
  g.add(glass, lines, confetti, balls, curtain, ring, beam, gift);
  const cards = [0, 1, 2].map(() => pairCard(studentsOriginal[0], "1人目", 1));
  const pv = V.particles.pts.visible, cv = V.card.obj.visible, sv = V.sparks.pts.visible;
  V.particles.pts.visible = true;
  V.card.obj.visible = true;
  V.sparks.pts.visible = true;
  try {
    await V.renderer.compileAsync(V.scene, V.camera);
    V.composer.render();
    V.renderer.getContext().finish();
  } finally {
    V.frontImpactRings.visible = false;
    V.particles.pts.visible = pv;
    V.card.obj.visible = cv;
    V.sparks.pts.visible = sv;
    // 非表示の代表素材を残し、コンパイル済みのプログラムを保持する。
    g.visible = false;
    cards.forEach(dropCard);
    actors.forEach(actor => actor.userData.remove());
  }
}
