"use strict";
/* =========================================================
   2人ずつの発表 (3D の空間とカメラを使う演出)
   どの演出も list = [{ s: 生徒, key: 席 }, ...] (1〜2人) を受け取り、
   最後に全員を land() で席に着地させる
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

// 名前カード (表に名前、裏に「?」)。ステージに置く
function pairCard(s, k = 1) {
  const g = makeExtraCard(s, "");
  const back = new THREE.Mesh(V.card.back.geometry, new THREE.MeshBasicMaterial({ map: V.tex.back, transparent: true }));
  back.rotation.y = Math.PI;
  back.position.z = -.034;
  g.add(back);
  const d = g.userData.dispose;
  g.userData.dispose = () => { d(); back.material.dispose(); };
  g.scale.setScalar(k);
  return g;
}
function setGroupOpacity(g, a) {
  g.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = a; } });
}

// 2枚並べるときの大きさと間隔
function pairLayout(n) {
  const k = Math.min(V.heroK * .62, V.visW * (n > 1 ? .36 : .5) / FACE_W);
  return { k, xs: n > 1 ? [-FACE_W * k * .6, FACE_W * k * .6] : [0] };
}

// カードを弧を描いて席へ飛ばし、着地させる
function flyCardsToSeats(cards, list) {
  dolly(.12, list[0].key, 900);
  return Promise.all(cards.map((g, i) => {
    const { s, key } = list[i];
    const P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
    const ctrl = p0.clone().lerp(P, .4).add(v3(i ? 1 : -1, 2.2, 1));
    return sleep(i * 160).then(() => {
      sfx("whoosh", { pan: P.x / V.visW });
      return tween(800, t => {
        g.position.copy(bez(p0, ctrl, P, t));
        g.scale.setScalar(lerp(s0, 1, t));
        g.rotation.set(0, Math.sin(t * Math.PI) * (i ? -.7 : .7), 0);
      }, ease.inOut);
    }).then(() => landExtra(g, s, key));
  })).then(() => dolly(0, null, 500));
}

// 名前の文字の形の点を、粒子の i0〜i1 番に割り当てる
function nameTargetsRange(s, k, center, i0, i1) {
  const Wc = 640, Hc = 342;
  const c = makeCanvas(Wc, Hc), ctx = c.getContext("2d", { willReadFrequently: true });
  drawFace(ctx, Wc, Hc, s, { textOnly: true, label: "" });
  const data = ctx.getImageData(0, 0, Wc, Hc).data;
  const px = [];
  for (let y = 0; y < Hc; y += 2) for (let x = 0; x < Wc; x += 2) if (data[(y * Wc + x) * 4 + 3] > 110) px.push(x, y);
  const pos = V.particles.geo.attributes.position.array, n = px.length / 2;
  for (let i = i0; i < i1; i++) {
    const j = Math.floor(Math.random() * n) * 2;
    pos[i * 3] = center.x + ((px[j] + Math.random() * 2) / Wc - .5) * FACE_W * k;
    pos[i * 3 + 1] = center.y + (.5 - (px[j + 1] + Math.random() * 2) / Hc) * FACE_H * k;
    pos[i * 3 + 2] = center.z + .05 * k;
  }
  V.particles.geo.attributes.position.needsUpdate = true;
}

function worldActor(g) {
  V.scene.add(g);
  const un = addFrameHook((dt, t) => g.userData.update && g.userData.update(t, dt));
  g.userData.remove = () => { un(); V.scene.remove(g); disposeGroup(g); };
  return g;
}

/* =========================================================
   演出
   ========================================================= */

// 急降下: カメラが席へ飛び込み、札が裏返る → 次の席へ振る → 引いて戻る
async function pairDive(list) {
  sfx("whoosh", { rate: .8 });
  for (let i = 0; i < list.length; i++) {
    const { s, key } = list[i];
    const W = seatW(key);
    const side = W.x > 0 ? -1 : 1;
    const pos = W.clone().add(v3(side * rand(.6, 1.7), rand(1.3, 2.1), rand(2.5, 3.1)));
    if (i) sfx("whoosh", { vary: .2 });
    await camGo(camPoseLook(pos, W.clone().add(v3(0, .05, 0))), i ? 620 : 820);
    land(s, key, "flip");
    shake(.05);
    await sleep(800);
  }
  await camHome(650);
}

// せり上がり: 光の柱の中で札が高く浮かび、回りながら名前が出る
async function pairRise(list) {
  const pillars = list.map(({ key }) => {
    const W = seatW(key);
    const m = beamMesh(0xfff2cc, 0);
    V.scene.add(m);
    aimBeam(m, v3(W.x, 11, W.z), v3(W.x, 0, W.z), .95);
    return m;
  });
  sfx("powerup");
  await tween(900, t => {
    list.forEach(({ key }) => {
      const o = V.seat[key];
      o.jump = 1.3 * t;
      o.pivot.scale.setScalar(1 + .7 * t);
      o.flipper.rotation.y = Math.PI + t * Math.PI * 4;
    });
    pillars.forEach(m => { m.material.uniforms.uOpacity.value = .6 * t; });
  }, ease.out);
  for (const { s, key } of list) {
    V.seat[key].flipper.rotation.y = Math.PI;
    land(s, key, "flip");
    await sleep(260);
  }
  await sleep(850);
  await tween(450, t => {
    list.forEach(({ key }) => { const o = V.seat[key]; o.jump = 1.3 * (1 - t); o.pivot.scale.setScalar(1 + .7 * (1 - t)); });
    pillars.forEach(m => { m.material.uniforms.uOpacity.value = .6 * (1 - t); });
  }, ease.inOut);
  pillars.forEach(m => { V.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  list.forEach(({ key }) => { V.seat[key].jump = 0; V.seat[key].pivot.scale.setScalar(1); });
}

// 隕石2連: 名前カードが空から席めがけて落ちてくる
async function pairMeteor(list) {
  dolly(-1.6, null, 600);
  bubble("…なにか来る！", v3(0, V.visH * .3, 0), 900);
  await sleep(450);
  await Promise.all(list.map(({ s, key }, i) => sleep(i * 420).then(async () => {
    const P = plateLocal(key), g = pairCard(s, .6);
    const from = P.clone().add(v3(rand(-2.5, 2.5), V.visH * 1.3, 3));
    sfx("windbig", { rate: 1.3, vol: .6 });
    await tween(650, t => {
      g.position.lerpVectors(from, P, t);
      g.rotation.set(t * 5, t * 3, t * 7);
      g.scale.setScalar(lerp(.6, 1, t));
      fireTrail(g.position, 7);
    }, ease.in);
    g.rotation.set(0, 0, 0);
    impact(key, s, 1);
    await landExtra(g, s, key);
  })));
  await sleep(350);
  await dolly(0, null, 600);
}

// カードシャッフル: 裏向きの2枚が奥行きを使って入れ替わり、同時にめくれる
async function pairShell(list) {
  const { k, xs } = pairLayout(list.length);
  const cards = list.map(({ s }, i) => { const g = pairCard(s, .01); g.rotation.y = Math.PI; g.position.set(xs[i], 0, 0); return g; });
  veil(true, 300);
  sfx("flip");
  await tween(380, t => cards.forEach(g => g.scale.setScalar(Math.max(.01, k * t))), ease.back);
  if (cards.length > 1) {
    for (let r = 0; r < 3; r++) {
      const x0 = cards.map(g => g.position.x);
      sfx("whoosh", { vol: .6, vary: .2 });
      await tween(300, t => cards.forEach((g, i) => {
        g.position.x = lerp(x0[i], -x0[i], t);
        g.position.z = Math.sin(t * Math.PI) * (i ? 1.5 : -1.5) * (r % 2 ? 1 : -1);
        g.rotation.z = Math.sin(t * Math.PI) * .15 * (i ? 1 : -1);
      }), ease.inOut);
    }
  }
  sfx("flip");
  await tween(420, t => cards.forEach(g => { g.rotation.y = Math.PI * (1 - t); }), ease.back);
  cards.forEach(g => { g.rotation.set(0, 0, 0); burst(g.position.clone(), [hdr(HEX.gold, 3), hdr(0xffffff, 2.5)], 90, 4); });
  sfx("jingle_reveal", { vol: .8 });
  await sleep(900);
  veil(false, 400);
  await flyCardsToSeats(cards, list);
}

// 粒子2本: 光の粒が2人分の名前を同時に作る
async function pairParticles(list) {
  const P = V.particles, N = P.N, u = P.u;
  const { k, xs } = pairLayout(list.length);
  const side = P.geo.attributes.aSide.array;
  list.forEach(({ s }, i) => {
    const i0 = Math.floor(N * i / list.length), i1 = Math.floor(N * (i + 1) / list.length);
    nameTargetsRange(s, k, v3(xs[i], 0, 0), i0, i1);
    side.fill(i, i0, i1);
  });
  P.geo.attributes.aSide.needsUpdate = true;
  particleStart("galaxy");
  u.uColA.value.copy(hdr(HEX[list[0].s.gender], 1.5));
  u.uColA2.value.copy(hdr(HEX[(list[1] || list[0]).s.gender], 1.5));
  u.uColB.value.set(1.6, 1.45, 1.1);
  u.uForm.value = 0; u.uStream.value = 0; u.uFade.value = 1; u.uSwirl.value = 5;
  P.pts.visible = true;
  veil(true, 300);
  sfx("magic", { vol: .8 });
  await tween(1500, t => { u.uForm.value = t; }, ease.linear);
  const cards = list.map(({ s }, i) => { const g = pairCard(s, k); g.position.set(xs[i], 0, 0); setGroupOpacity(g, 0); return g; });
  sfx("jingle_reveal", { vol: .8 });
  await tween(450, t => { cards.forEach(g => setGroupOpacity(g, t)); u.uFade.value = 1 - t; }, ease.out);
  P.pts.visible = false;
  side.fill(0);
  P.geo.attributes.aSide.needsUpdate = true;
  await sleep(650);
  veil(false, 400);
  await flyCardsToSeats(cards, list);
}

// 旋回: カメラが教室のまわりを回り、通りすぎる席の札が裏返る
async function pairOrbit(list) {
  const C = V.lookTarget.clone(), H = V.homePos.clone();
  const R0 = Math.hypot(H.x - C.x, H.z - C.z), a0 = Math.atan2(H.x - C.x, H.z - C.z), h0 = H.y;
  const dir = Math.random() < .5 ? 1 : -1, dur = 4.2, at = [.3, .62];
  const q = new THREE.Quaternion();
  let t = 0, fired = 0;
  V.billboard = true;
  sfx("windbig", { vol: .5, rate: .7 });
  await new Promise(res => {
    V.camRig = dt => {
      t = Math.min(1, t + dt / dur);
      const e = ease.inOut(t);
      const a = a0 + dir * e * Math.PI * 2;
      const r = R0 * (1 - .45 * Math.sin(Math.PI * e));
      const y = h0 * (1 - .62 * Math.sin(Math.PI * e));
      V.camera.position.set(C.x + Math.sin(a) * r, y, C.z + Math.cos(a) * r);
      V.camera.lookAt(C);
      if (t > .85) {
        const k = (t - .85) / .15;
        q.copy(V.camera.quaternion).slerp(V.homeQuat, k);
        V.camera.quaternion.copy(q);
        V.camera.position.lerp(H, k);
      }
      while (fired < list.length && t > at[fired]) { const { s, key } = list[fired++]; land(s, key, "flip"); }
      if (t >= 1) { V.camRig = null; res(); }
    };
  });
  V.billboard = false;
  for (const key in V.seat) V.seat[key].pivot.quaternion.copy(V.homeQuat);
}

// UFO: 教室の上を飛んで、席ごとにビームでカードを降ろす
async function pairUfo(list) {
  const W = V.visW, H = V.visH;
  const ufo = buildUfo();
  V.stage.add(ufo.g);
  const hum = sfx("ufo", { loop: true, vol: .55 });
  ufo.g.position.set(-W * .7, H * .45, -2);
  for (const { s, key } of list) {
    const P = plateLocal(key), above = P.clone().add(v3(0, 2.3, 0));
    const u0 = ufo.g.position.clone();
    dolly(.12, key, 800);
    await tween(800, t => ufo.g.position.lerpVectors(u0, above, t), ease.inOut);
    ufo.beam.visible = true;
    ufo.beam.material.uniforms.uOpacity.value = .85;
    sfx("beam");
    const g = pairCard(s, .1), top = above.clone().add(v3(0, -.2, 0));
    g.position.copy(top);
    await tween(600, t => {
      g.position.lerpVectors(top, P, t);
      g.scale.setScalar(lerp(.1, 1, t));
      ufo.beam.scale.set(.9, Math.max(.01, ufo.g.position.y - g.position.y), .9);
    }, ease.out);
    ufo.beam.visible = false;
    await landExtra(g, s, key);
  }
  const u1 = ufo.g.position.clone();
  tween(800, t => { ufo.g.position.copy(u1).add(v3(t * 3, t * (H + 4), 0)); }, ease.in)
    .then(() => { ufo.unhook(); V.stage.remove(ufo.g); if (hum) hum.stop(.5); });
  await dolly(0, null, 500);
}

// 猫: 教室の手前の床を猫が走ってきて、席に向かってカードを放り投げる
async function pairCats(list) {
  const zFront = (rows - 1) / 2 * SZ + 1.5, xEdge = (cols / 2) * SX + 3;
  const furs = [0xf2a541, 0x9aa3ad, 0x3a3a3a, 0xf6efe4];
  for (let i = 0; i < 18; i++) sfx("step", { vol: .45, delay: i * .14 / TIME_SCALE, rate: 1.5, vary: .3 });
  await Promise.all(list.map(({ s, key }, i) => sleep(i * 250).then(async () => {
    const { x } = seatXZ(key);
    const from = list.length > 1 ? (i ? 1 : -1) : (x >= 0 ? -1 : 1);
    const cat = worldActor(buildCat(pick(furs)));
    cat.scale.setScalar(.85);
    const a = v3(from * xEdge, 0, zFront), b = v3(x, 0, zFront);
    cat.rotation.y = from < 0 ? 0 : Math.PI;
    const g = pairCard(s, .42);
    const carry = () => g.position.copy(toLocal(cat.position.clone().add(v3(-from * .55, 1.05, .2))));
    await tween(1200, t => { cat.position.lerpVectors(a, b, t); carry(); }, ease.out);
    bubble("ニャッ", toLocal(cat.position.clone().add(v3(0, 1.3, 0))), 700);
    // 席へ放り投げる
    const P = plateLocal(key), p0 = g.position.clone(), s0 = g.scale.x;
    const ctrl = p0.clone().lerp(P, .5).add(v3(0, 2.2, 0));
    sfx("boing", { rate: 1.2 });
    tween(900, t => cat.position.lerpVectors(b, v3(-from * xEdge, 0, zFront), t), ease.in).then(() => cat.userData.remove());
    cat.rotation.y = from < 0 ? 0 : Math.PI;
    await tween(600, t => { g.position.copy(bez(p0, ctrl, P, t)); g.scale.setScalar(lerp(s0, 1, t)); g.rotation.z = (1 - t) * 3 * from; }, ease.inOut);
    g.rotation.set(0, 0, 0);
    await landExtra(g, s, key);
  })));
}

// ロケット2機: 教卓の前から打ち上がり、教室の上を回って席に突っ込む
async function pairRockets(list) {
  dolly(-1.4, null, 600);
  sfx("thruster", { vol: .7 });
  await Promise.all(list.map(({ s, key }, i) => sleep(i * 300).then(async () => {
    const sx = list.length > 1 ? (i ? 1 : -1) : (seatXZ(key).x >= 0 ? 1 : -1);
    const rk = stageActor(buildRocket());
    rk.scale.setScalar(.8);
    const g = pairCard(s, .55);
    const P = plateLocal(key);
    const p0 = toLocal(v3(sx * 1.6, .5, PODIUM_Z + 1));
    const top = toLocal(v3(sx * 5, 8, -2));
    const path = t => t < .5
      ? bez(p0, p0.clone().add(toLocal(v3(sx * 1.6, 7, PODIUM_Z + 1)).sub(p0).multiplyScalar(.9)), top, t / .5)
      : bez(top, P.clone().add(v3(0, 5, 1.5)), P, (t - .5) / .5);
    let prev = path(0);
    const UPV = v3(0, 1, 0);
    await tween(2000, t => {
      const p = path(t), d = p.clone().sub(prev);
      prev = p;
      if (d.lengthSq() > 1e-8) {
        const dir = d.normalize();
        rk.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(UPV, dir), .4);
        rk.position.copy(p).addScaledVector(dir, -.7);
        g.position.copy(p).addScaledVector(dir, .1);
        fireTrail(rk.position.clone().addScaledVector(dir, -.75), 4);
      }
      g.scale.setScalar(lerp(.55, 1, Math.max(0, (t - .5) / .5)));
    }, ease.inOut);
    rk.userData.remove();
    impact(key, s, .9);
    await landExtra(g, s, key);
  })));
  await sleep(300);
  await dolly(0, null, 600);
}

// スポットライト: 暗い教室をライトが探しまわり、2つの席でぴたっと止まる
async function pairSpot(list) {
  await tween(300, t => setPlateDim(lerp(1, .35, t)), ease.out);
  V.spotSpeed = 7;
  sfx("suspense");
  await sleep(1000);
  V.spotLock = [0, 1, 2, 3].map(i => seatW(list[i % list.length].key).setY(0));
  V.spotLockAmt = 0;
  await tween(450, t => { V.spotLockAmt = t; V.spotSpeed = lerp(7, 1, t); }, ease.inOut);
  for (const { s, key } of list) {
    land(s, key, "flip");
    const o = V.seat[key];
    o.front.material.color.setScalar(.86); o.back.material.color.setScalar(.9);
    await sleep(280);
  }
  await sleep(800);
  await tween(400, t => { setPlateDim(lerp(.35, 1, t)); V.spotLockAmt = 1 - t; }, ease.inOut);
  V.spotLock = null;
}

/* ---------------- 進行 ---------------- */
const PAIR = {
  dive: pairDive, rise: pairRise, meteor: pairMeteor, shell: pairShell, particles: pairParticles,
  orbit: pairOrbit, ufo: pairUfo, cats: pairCats, rockets: pairRockets, spot: pairSpot,
};
let pairDeck = null, lastPair = null;
function resetPairDeck() { pairDeck = new Deck(Object.keys(PAIR)); lastPair = null; }

async function announcePair(list, force) {
  const style = force || pairDeck.draw(x => x !== lastPair);
  lastPair = style;
  try {
    await PAIR[style](list);
  } finally {
    // 途中で何かあっても、カメラや照明を元に戻し、全員を着地させる
    if (V.camRig && style !== "orbit") await camHome(400);
    V.spotLock = null; V.spotSpeed = 1; V.billboard = false;
    for (const { s, key } of list) if (hidden.has(key)) await land(s, key, "pop");
  }
  await sleep(150);
}

// 発表の組を作る: 2人ずつ。最前列中央 (動画の席) だけは1人で
function makeRounds(order) {
  const rounds = [];
  let buf = [];
  for (const k of order) {
    if (k === FRONT_ROW.key) { if (buf.length) rounds.push(buf); buf = []; rounds.push([k]); continue; }
    buf.push(k);
    if (buf.length === 2) { rounds.push(buf); buf = []; }
  }
  if (buf.length) rounds.push(buf);
  return rounds;
}
