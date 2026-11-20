"use strict";
/* =========================================================
   追加の演出 / カットシーン / 進行表
   ========================================================= */

const tex = name => {
  const map = { rocket: "🚀", gift: "🎁" };
  if (!V.tex[name]) V.tex[name] = canvasTex(emojiCanvas(map[name]));
  return V.tex[name];
};

function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

// 机ごと跳ねる (着地の衝撃)
function jumpSeat(key, h = .35, ms = 500) {
  const o = V.seat[key];
  return tween(ms, t => { o.jump = Math.sin(t * Math.PI) * h * (1 - t * .3); }, ease.linear).then(() => { o.jump = 0; });
}

// 床に広がる光の輪 (ワールド座標)
function shockwave(key, color, size = 5) {
  const { x, z } = seatXZ(key);
  const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 64), new THREE.MeshBasicMaterial({
    color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, .05, z);
  V.scene.add(m);
  return tween(800, t => { m.scale.setScalar(.3 + t * size); m.material.opacity = 1 - t; }, ease.out)
    .then(() => { V.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
}

// 着地の衝撃: 揺れ + 輪 + 周りの席が跳ねる
function impact(key, s, power = 1) {
  shake(.35 * power);
  shockwave(key, hdr(HEX[s.gender], 2.5), 5 * power);
  const a = seatXZ(key);
  for (const k of realSeatPositions) {
    if (k === key) continue;
    const b = seatXZ(k);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 4.2) sleep(d * 60).then(() => jumpSeat(k, .35 * power * (1 - d / 4.6)));
  }
}

// 火の粉の尾
function fireTrail(pos, n = 6) {
  burst(pos, [hdr(0xffb020, 3), hdr(0xff5a1f, 2.5), hdr(0xffe08a, 3)], n, .8, { life: .5, size: .12, grav: -1.5 });
}

function letterbox(on) { document.body.classList.toggle("letterbox", on); }

function caption(text, ms) {
  const el = document.createElement("div");
  el.className = "caption";
  el.textContent = text;
  document.body.appendChild(el);
  return sleep(ms).then(() => { el.classList.add("out"); return sleep(400); }).then(() => el.remove());
}

/* =========================================================
   登場 (追加)
   ========================================================= */

// 隕石: 奥の空から火の玉になって落ちてくる
async function introMeteor(s) {
  const c = card(), k = V.heroK;
  const from = v3(V.visW * .8 * (Math.random() < .5 ? 1 : -1), V.visH * 1.1, -28);
  c.scale.setScalar(k);
  c.position.copy(from);
  bubble("…なにか来る！", v3(0, V.visH * .3, 0), 1000);
  await sleep(500);
  c.visible = true;
  await tween(1000, t => {
    c.position.lerpVectors(from, v3(), t);
    c.rotation.set(t * 4, t * 3, t * 6);
    fireTrail(c.position, 8);
  }, ease.in);
  c.rotation.set(0, 0, 0);
  shake(.5);
  flashAt(v3(0, 0, .3), hdr(0xffb020, 2), 9);
  burst(v3(0, 0, .3), [hdr(0xffb020, 3), hdr(0xff5a1f, 3), hdr(HEX[s.gender], 3)], 260, 7, { life: 1.2 });
  bubble("ドーン！", v3(0, FACE_H * k * .75, 0), 900);
  await tween(450, t => c.scale.set(k * (1 + (1 - t) * .3), k * (1 - (1 - t) * .3), k), ease.back);
  await sleep(1100);
}

// ワープ: 星が流れる光のトンネルから飛び出してくる
async function introWarp(s) {
  const N = 420;
  const pos = new Float32Array(N * 6), st = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * 6.28, r = .6 + Math.pow(Math.random(), .6) * V.visW;
    st.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * .7, z: -Math.random() * 70 });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color: new THREE.Color(1.6, 1.8, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
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
    g.attributes.position.needsUpdate = true;
  });
  await tween(1700, t => { speed = 10 + t * t * 140; }, ease.linear);
  const c = card(), k = V.heroK;
  c.visible = true;
  c.scale.setScalar(k);
  await tween(450, t => { c.position.set(0, 0, lerp(-60, 0, t)); speed = 150 * (1 - t) + 5; }, ease.out);
  flashAt(v3(0, 0, .3), hdr(0x9fd8ff, 2), 8);
  burst(v3(0, 0, .3), [hdr(0x9fd8ff, 3), hdr(HEX[s.gender], 3)], 160, 5);
  await tween(500, t => { lines.material.opacity = 1 - t; }, ease.out);
  un();
  V.stage.remove(lines);
  g.dispose(); lines.material.dispose();
  await sleep(1000);
}

// プレゼント箱: 落ちてきて揺れて、ふたが飛んでカードが飛び出す
async function introGift(s) {
  const b = Math.min(V.visH * .17, V.visW * .12);
  const g = new THREE.Group();
  const col = pick([0x7c3aed, 0x10b981, 0xf59e0b, 0x06b6d4]);   // 性別が分からない色
  const boxMat = new THREE.MeshStandardMaterial({ color: col, roughness: .35, metalness: .2 });
  const ribMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: .3, metalness: .8, emissive: 0x553300, emissiveIntensity: .4 });
  const box = new THREE.Mesh(new V.RoundedBox(b * 1.3, b, b, 4, b * .05), boxMat);
  const rib1 = new THREE.Mesh(new THREE.BoxGeometry(b * .16, b * 1.01, b * 1.02), ribMat);
  const rib2 = new THREE.Mesh(new THREE.BoxGeometry(b * 1.32, b * 1.01, b * .16), ribMat);
  const lid = new THREE.Group();
  const lidBox = new THREE.Mesh(new V.RoundedBox(b * 1.42, b * .22, b * 1.12, 4, b * .04), boxMat);
  const lidRib = new THREE.Mesh(new THREE.BoxGeometry(b * .17, b * .23, b * 1.14), ribMat);
  const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(b * .13, b * .04, 64, 8, 2, 3), ribMat);
  bow.position.y = b * .2;
  lid.add(lidBox, lidRib, bow);
  lid.position.y = b * .58;
  g.add(box, rib1, rib2, lid);
  g.rotation.set(.35, -.5, 0);
  V.stage.add(g);
  const y0 = V.visH;
  await tween(700, t => { g.position.y = lerp(y0, -b * .2, t); }, t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  });
  shake(.15);
  for (let i = 0; i < 3; i++) {
    await sleep(380);
    const a = .08 + i * .06;
    await tween(300, t => { g.rotation.z = Math.sin(t * Math.PI * 4) * a; g.position.y = -b * .2 + Math.abs(Math.sin(t * Math.PI * 2)) * a; }, ease.linear);
  }
  bubble("パカッ！", v3(0, b, 0), 800);
  const l0 = lid.position.clone();
  tween(800, t => { lid.position.set(l0.x + t * b * 2, l0.y + Math.sin(t * Math.PI * .8) * b * 2.5, l0.z); lid.rotation.z = -t * 3; }, ease.out);
  // 箱は下へ落ちて消え、カードは箱より手前から飛び出す (名前と箱が重ならないように)
  const c = card(), k = V.heroK;
  const front = b * 1.6;
  c.position.set(0, -b * .2, front);
  c.scale.setScalar(.01);
  c.visible = true;
  burst(v3(0, 0, front), [hdr(0xfbbf24, 3), hdr(0x2f8cff, 3), hdr(0xff4fb0, 3), hdr(0x34d399, 3), hdr(0xffffff, 3)], 260, 6, { life: 1.6, grav: 3 });
  // 箱はその場でポンと縮んで消える。消えるまでカードは箱より手前
  flashAt(v3(0, 0, b), hdr(0xffffff, 1.4), b * 4);
  const boxGone = tween(260, t => g.scale.setScalar(Math.max(.01, 1 - t)), ease.in).then(() => V.stage.remove(g));
  await tween(450, t => {
    c.position.set(0, lerp(-b * .2, 0, t), front);
    c.scale.setScalar(Math.max(.01, k * t));
  }, ease.back);
  await boxGone;
  await tween(300, t => { c.position.z = lerp(front, 0, t); }, ease.out);
  await sleep(1200);
}

// 幕開け: 赤い幕がひらいて登場
function curtainCanvas() {
  const c = makeCanvas(512, 512), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 512, 0);
  for (let i = 0; i <= 8; i++) {
    g.addColorStop(i / 8, i % 2 ? "#7a0f1d" : "#c81e35");
  }
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const v = x.createLinearGradient(0, 0, 0, 512);
  v.addColorStop(0, "rgba(0,0,0,.35)"); v.addColorStop(.3, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)");
  x.fillStyle = v; x.fillRect(0, 0, 512, 512);
  x.fillStyle = "#fbbf24"; x.fillRect(0, 490, 512, 22);
  return c;
}
async function introCurtain(s) {
  const W = V.visW + 2, H = V.visH + 2;
  if (!V.tex.curtain) { V.tex.curtain = canvasTex(curtainCanvas()); V.tex.curtain.wrapS = THREE.RepeatWrapping; }
  const mat = new THREE.MeshStandardMaterial({ map: V.tex.curtain, roughness: .7 });
  const L = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 + .4, H), mat);
  const Rr = L.clone();
  L.position.set(-W / 4, 0, 1.2); Rr.position.set(W / 4, 0, 1.2);
  const val = new THREE.Mesh(new THREE.BoxGeometry(W + 1, .7, .3), new THREE.MeshStandardMaterial({ color: 0xc8901c, metalness: 1, roughness: .3 }));
  val.position.set(0, V.visH / 2 - .1, 1.3);
  const light = new THREE.PointLight(0xffe0b0, 30, 12, 2);
  light.position.set(0, 2, 4);
  V.stage.add(L, Rr, val, light);
  const c = card(), k = V.heroK;
  c.scale.setScalar(k);
  await tween(500, t => { L.position.x = lerp(-W * .8, -W / 4, t); Rr.position.x = lerp(W * .8, W / 4, t); }, ease.out);
  c.visible = true;   // 幕が閉じてから置く
  bubble("ドゥルルルル…", v3(0, V.visH * .25, 1.4), 1600);
  await tween(1700, t => { L.rotation.y = Math.sin(t * 40) * .01; }, ease.linear);
  bubble("ジャーン！", v3(0, V.visH * .25, 1.4), 900);
  await tween(900, t => {
    L.position.x = lerp(-W / 4, -W * .75, t); Rr.position.x = lerp(W / 4, W * .75, t);
    L.scale.x = Rr.scale.x = 1 - t * .5;
  }, ease.inOut);
  burst(v3(0, 0, .3), [hdr(HEX.gold, 3), hdr(HEX[s.gender], 3)], 160, 4);
  await sleep(500);
  V.stage.remove(L, Rr, val, light);
  mat.dispose();
  await sleep(700);
}

// 氷漬け: 氷の中に閉じこめられた名前が、割れて出てくる
async function introShatter(s) {
  const c = card(), k = V.heroK;
  const w = FACE_W * k + .4, h = FACE_H * k + .4;
  c.visible = true;
  c.scale.setScalar(k);
  const ice = new THREE.Group();
  const shell = new THREE.Mesh(new V.RoundedBox(w, h, .8, 3, .12), new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    uniforms: { uColor: { value: new THREE.Color(.5, .8, 1.1) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const frost = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: .9, depthWrite: false }));
  frost.position.z = .42;
  ice.add(shell, frost);
  V.stage.add(ice);
  ice.scale.setScalar(.01);
  await tween(500, t => { const q = Math.max(.01, t); ice.scale.setScalar(q); c.scale.setScalar(k * q); }, ease.back);
  for (let i = 0; i < 2; i++) {
    await sleep(600);
    bubble(i ? "ピキピキッ" : "ピキッ", v3(rand(-1, 1), h * .55, .5), 700);
    frost.material.opacity -= .2;
    await tween(260, t => { ice.position.x = Math.sin(t * Math.PI * 8) * .08; }, ease.linear);
  }
  await sleep(400);
  V.stage.remove(ice);
  shake(.25);
  flashAt(v3(0, 0, .5), hdr(0xbfe6ff, 2), 7);
  const shards = [];
  const sg = new THREE.TetrahedronGeometry(.22);
  const sm = new THREE.MeshStandardMaterial({ color: 0xcdeeff, roughness: .05, metalness: .3, transparent: true, opacity: .9 });
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(sg, sm);
    m.position.set(rand(-w / 2, w / 2), rand(-h / 2, h / 2), rand(-.3, .5));
    m.scale.setScalar(rand(.5, 1.6));
    m.userData.v = v3(m.position.x * rand(1, 3), m.position.y * rand(1, 3) + rand(1, 3), rand(2, 7));
    m.userData.r = v3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    V.stage.add(m);
    shards.push(m);
  }
  const un = addFrameHook(dt => {
    for (const m of shards) {
      m.userData.v.y -= 9 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.rotation.x += m.userData.r.x * dt; m.rotation.y += m.userData.r.y * dt;
    }
  });
  burst(v3(0, 0, .3), [hdr(0xbfe6ff, 3), hdr(HEX[s.gender], 3)], 140, 5);
  await tween(1300, t => { sm.opacity = .9 * (1 - t); }, ease.in);
  un();
  shards.forEach(m => V.stage.remove(m));
  sg.dispose(); sm.dispose();
  await sleep(300);
}

// カウントダウン: 3, 2, 1 で画面の手前から叩きつけるように登場
async function introCountdown(s) {
  for (const n of ["3", "2", "1"]) {
    banner(n, 560, "count");
    shake(.08);
    burst(v3(rand(-2, 2), rand(-1, 1), 0), hdr(HEX.gold, 3), 50, 3, { life: .6 });
    await sleep(650);
  }
  const c = card(), k = V.heroK;
  c.visible = true;
  await tween(380, t => { c.position.set(0, 0, lerp(STAGE_D - .5, 0, t)); c.scale.setScalar(k); c.rotation.z = (1 - t) * .5; }, ease.in);
  shake(.45);
  flashAt(v3(0, 0, .3), hdr(0xffffff, 1.5), 9);
  burst(v3(0, 0, .3), [hdr(HEX.gold, 3), hdr(HEX[s.gender], 3), hdr(0xffffff, 3)], 220, 6);
  await tween(400, t => c.scale.setScalar(k * (1 + (1 - t) * .15)), ease.out);
  await sleep(1000);
}

// サーチライト: ライトが教室中を探しまわり、真ん中から名前がせり上がる
async function introSearch(s) {
  const c = card(), k = V.heroK;
  await veil(false, 300);
  V.spotSpeed = 7;
  bubble("どこだ…？", v3(0, V.visH * .3, 0), 1500);
  await sleep(1800);
  V.spotSpeed = 1;
  V.spotFocusAt.set(0, 0, -.5);
  await tween(600, t => { V.spotFocus = t; }, ease.inOut);
  await veil(true, 300);
  c.visible = true;
  c.scale.setScalar(k);
  await tween(900, t => { c.position.y = lerp(-V.visH * .8, 0, t); c.rotation.y = (1 - t) * Math.PI * 3; }, ease.out);
  c.rotation.set(0, 0, 0);
  burst(v3(0, 0, .3), [hdr(HEX.gold, 3), hdr(HEX[s.gender], 3)], 180, 4.5);
  tween(600, t => { V.spotFocus = 1 - t; }, ease.inOut);
  await sleep(1200);
}

// ノイズ: 電波が乱れて別人が映る → 調整して本人に
async function introGlitch(s, label, pool) {
  const c = card(), k = V.heroK;
  const others = pool.length ? pool : studentsOriginal.filter(x => x !== s);
  c.visible = true;
  c.scale.setScalar(k);
  bubble("ザザッ…", v3(0, FACE_H * k * .72, 0), 1400);
  const end = performance.now() + 1600 / TIME_SCALE;
  while (performance.now() < end) {
    drawHero(pick(others), { label });
    c.position.x = rand(-.25, .25);
    c.scale.set(k * rand(.9, 1.15), k * rand(.85, 1.1), k);
    c.rotation.z = rand(-.05, .05);
    await sleep(rand(50, 110));
  }
  drawHero(pick(others), { label });
  c.position.x = 0; c.scale.setScalar(k); c.rotation.z = 0;
  await sleep(900);
  bubble("…チャンネル調整中", v3(0, FACE_H * k * .72, 0), 1000);
  await tween(500, t => { c.scale.set(k, k * (1 - t * .97), k); }, ease.in);
  drawHero(s, { label });
  await tween(450, t => { c.scale.set(k, k * Math.max(.03, t), k); }, ease.back);
  burst(v3(0, 0, .3), [hdr(HEX[s.gender], 3), hdr(0xffffff, 2.5)], 130, 4);
  await sleep(1100);
}

/* =========================================================
   移動 (追加)
   ========================================================= */

// ロケット: 空を一周してから急降下
async function flyRocket(s, key) {
  const c = card(), P = plateLocal(key);
  const W = V.visW, H = V.visH;
  const rk = emojiSprite(tex("rocket"), 1.3);
  const p0 = c.position.clone(), s0 = c.scale.x, sm = V.heroK * .45;
  bubble("発射！", v3(0, H * .3, 0), 800);
  await tween(400, t => c.scale.setScalar(lerp(s0, sm, t)), ease.out);
  const ctr = v3(0, H * .05, -4), R = Math.min(W, H * 1.4) * .42;
  const path = t => {
    if (t < .18) { const u = t / .18; return p0.clone().lerp(v3(0, ctr.y - R, -4), u); }
    if (t < .7) { const u = (t - .18) / .52; const a = -Math.PI / 2 + u * Math.PI * 2; return v3(ctr.x + Math.cos(a) * R, ctr.y + Math.sin(a) * R, ctr.z); }
    const u = (t - .7) / .3;
    return bez(v3(0, ctr.y - R, -4), v3(P.x, H * .9, P.z * .5), P, u);
  };
  dolly(.12, key, 2600);
  let prev = path(0);
  await tween(2900, t => {
    const p = path(t);
    const d = p.clone().sub(prev);
    prev = p;
    c.position.copy(p);
    c.scale.setScalar(t > .7 ? lerp(sm, 1, (t - .7) / .3) : sm);
    if (d.lengthSq() > 1e-8) {
      const ang = Math.atan2(d.y, d.x);
      rk.material.rotation = ang - Math.PI / 4;
      c.rotation.z = Math.max(-.6, Math.min(.6, ang * .15));
      const back = d.clone().normalize().multiplyScalar(-.9 * c.scale.x / sm * .5);
      rk.position.copy(p).add(back).add(v3(0, -.15, .1));
      fireTrail(rk.position.clone().add(back), 5);
    }
  }, ease.inOut);
  c.rotation.set(0, 0, 0);
  V.stage.remove(rk);
  rk.material.dispose();
  impact(key, s, 1);
}

// バウンド: 机の上をぴょんぴょん跳ねて、本当の席へ
async function flyBounce(s, key) {
  const c = card();
  const hops = farSeats(key, pendingOthers(key), Math.min(3, pendingOthers(key).length));
  const pts = [...hops, key];
  let from = c.position.clone(), s0 = c.scale.x;
  for (let i = 0; i < pts.length; i++) {
    const k2 = pts[i];
    const last = i === pts.length - 1;
    const to = plateLocal(k2).add(last ? v3() : v3(0, .45, .2));
    const ctrl = from.clone().lerp(to, .5).add(v3(0, 2.8, .5));
    if (last) dolly(.18, key, 700);
    await tween(i === 0 ? 800 : 620, t => {
      c.position.copy(bez(from, ctrl, to, t));
      c.scale.setScalar(lerp(s0, 1, i === 0 ? t : 1));
      c.rotation.z = Math.sin(t * Math.PI * 2) * .2;
    }, ease.linear);
    c.rotation.z = 0;
    if (!last) {
      bubble(pick(["ボヨン", "ぽよん", "ボイン"]), to.clone().add(v3(0, .6, 0)), 600);
      const o = V.seat[k2];
      tween(300, t => o.pivot.scale.set(1 + Math.sin(t * Math.PI) * .15, 1 - Math.sin(t * Math.PI) * .3, 1), ease.out);
      await tween(160, t => c.scale.set(1 + t * .2, 1 - t * .3, 1), ease.out);
      await tween(160, t => c.scale.set(1.2 - t * .2, .7 + t * .3, 1), ease.out);
    }
    from = c.position.clone(); s0 = 1;
  }
}

// テレポート: 光の柱で消えて、席の上に光の柱で現れる
async function flyTeleport(s, key) {
  const c = card(), P = plateLocal(key), k = c.scale.x;
  const col = hdr(HEX[s.gender], 2.2);
  const pillar = (local, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: V.tex.glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(local);
    m.scale.set(.01, h, 1);
    V.stage.add(m);
    return m;
  };
  const p1 = pillar(c.position, V.visH * 1.4);
  await tween(350, t => { p1.scale.x = t * 2.5; }, ease.out);
  bubble("シュン！", v3(0, FACE_H * k * .7, 0), 700);
  await tween(450, t => { c.scale.set(k * (1 - t), k * (1 + t * .5), k); c.rotation.y = t * 8; }, ease.in);
  c.visible = false;
  c.rotation.set(0, 0, 0);
  await tween(300, t => { p1.scale.x = 2.5 * (1 - t); }, ease.in);
  V.stage.remove(p1);
  dolly(.2, key, 800);
  await sleep(500);
  const p2 = pillar(P, 6);
  await tween(350, t => { p2.scale.x = t * 1.8; }, ease.out);
  c.visible = true;
  c.position.copy(P);
  await tween(500, t => { c.scale.set(Math.max(.01, t), 1 + (1 - t) * .5, 1); c.visible = t > .9 || Math.random() < .7; }, ease.out);
  c.visible = true;
  await tween(300, t => { p2.scale.x = 1.8 * (1 - t); }, ease.in);
  V.stage.remove(p2);
}

// 空から落下: いったん画面の外へ消え、席めがけて隕石みたいに落ちてくる
async function flyMeteorDrop(s, key) {
  const c = card(), P = plateLocal(key);
  const p0 = c.position.clone(), s0 = c.scale.x;
  await tween(600, t => { c.position.set(p0.x, lerp(p0.y, V.visH * 1.2, t), p0.z); c.rotation.z = t * 2; }, ease.in);
  c.visible = false;
  dolly(.2, key, 900);
  await sleep(500);
  bubble("…ヒュ～", P.clone().add(v3(0, .9, 0)), 900);
  await sleep(700);
  const from = P.clone().add(v3(1.5, V.visH * 1.4, 2));
  c.visible = true;
  c.rotation.set(0, 0, 0);
  await tween(650, t => {
    c.position.lerpVectors(from, P, t);
    c.scale.setScalar(lerp(s0 * .6, 1, t));
    c.rotation.z = (1 - t) * 3;
    fireTrail(c.position, 9);
  }, ease.in);
  c.rotation.set(0, 0, 0);
  impact(key, s, 1.4);
}

// らせん: 教室のまわりをぐるっと飛び回ってから着地 (カメラも追いかける)
async function flySpiral(s, key) {
  const c = card();
  const S = V.stage.localToWorld(plateLocal(key));
  const C = v3(0, 0, -.6);
  const rs = Math.hypot(S.x - C.x, S.z - C.z), as = Math.atan2(S.z - C.z, S.x - C.x);
  const start = V.stage.localToWorld(c.position.clone());
  const turns = Math.PI * 2.3;
  const s0 = c.scale.x;
  const wp = t => {
    const a = as - (1 - t) * turns;
    const r = lerp(8, rs, t * t);
    return v3(C.x + Math.cos(a) * r, lerp(4.2, S.y, t) + Math.sin(t * Math.PI * 3) * .6 * (1 - t), C.z + Math.sin(a) * r);
  };
  const o0 = V.camOffset.clone();
  await tween(3400, t => {
    let w = wp(t);
    if (t < .15) w = start.clone().lerp(w, t / .15);
    c.position.copy(V.stage.worldToLocal(w.clone()));
    c.scale.setScalar(lerp(s0, 1, Math.min(1, t * 4)));
    c.rotation.z = Math.sin(t * Math.PI) * .4;
    V.camOffset.copy(o0).lerp(w.clone().sub(V.homePos).multiplyScalar(.3), Math.sin(t * Math.PI * .5));
    if (Math.random() < .6) burst(c.position, hdr(HEX[s.gender], 2.5), 2, .3, { life: .6, size: .1, grav: 0 });
  }, ease.inOut);
  c.rotation.set(0, 0, 0);
}

/* =========================================================
   2人同時 / 高速モード
   ========================================================= */
function makeExtraCard(s, label) {
  const src = V.card;
  const g = new THREE.Group();
  const cv = makeCanvas(1280, 685);
  drawFace(cv.getContext("2d"), 1280, 685, s, { label });
  const t = canvasTex(cv);
  const body = new THREE.Mesh(src.body.geometry, src.body.material.clone());
  const rim = new THREE.Mesh(src.rim.geometry, new THREE.MeshBasicMaterial({ color: hdr(HEX[s.gender], 1.7), transparent: true }));
  rim.position.z = 0;   // 本体の厚みの内側に置く (裏から見たとき枠が全面を覆わないように)
  const front = new THREE.Mesh(src.front.geometry, new THREE.MeshBasicMaterial({ map: t, transparent: true, color: new THREE.Color(.84, .84, .84) }));
  front.position.z = .034;
  g.add(body, rim, front);
  g.userData.dispose = () => { t.dispose(); body.material.dispose(); rim.material.dispose(); front.material.dispose(); };
  V.stage.add(g);
  return g;
}

async function landExtra(g, s, key) {
  V.stage.remove(g);
  g.userData.dispose();
  const c0 = card().visible;
  await land(s, key, "pop");
  card().visible = c0;
}

async function announceDouble(A, B, idx) {
  const label = `${idx}・${idx + 1}人目`;
  const pair = [A, B];
  await banner("2人同時発表！", 1300, "mode");
  veil(true, 400);
  const k = Math.min(V.heroK * .7, V.visW * .4 / FACE_W);
  const gap = FACE_W * k * .56;
  const cards = pair.map(p => makeExtraCard(p.s, label));
  cards.forEach((g, i) => { g.position.set(i ? gap : -gap, i ? -.15 : .15, 0); g.scale.setScalar(.01); g.rotation.z = i ? .05 : -.05; });
  for (let i = 0; i < 2; i++) {
    burst(cards[i].position, [hdr(HEX[pair[i].s.gender], 3), hdr(HEX.gold, 3)], 120, 4);
    tween(550, t => cards[i].scale.setScalar(Math.max(.01, k * t)), ease.back);
    await sleep(350);
  }
  await sleep(1500);
  veil(false, 500);
  await Promise.all(cards.map((g, i) => {
    const P = plateLocal(pair[i].key), p0 = g.position.clone(), s0 = g.scale.x;
    const ctrl = p0.clone().lerp(P, .4).add(v3(i ? 1 : -1, 2.4, 1));
    return sleep(i * 250).then(() => tween(1100, t => {
      g.position.copy(bez(p0, ctrl, P, t));
      g.scale.setScalar(lerp(s0, 1, t));
      g.rotation.y = Math.sin(t * Math.PI) * (i ? -.7 : .7);
    }, ease.inOut)).then(() => landExtra(g, pair[i].s, pair[i].key));
  }));
  await sleep(700);
}

async function speedRound(list, startIdx) {
  await banner("⚡ 高速モード ⚡", 1200, "mode speed");
  V.spotSpeed = 4;
  for (let i = 0; i < list.length; i++) {
    const { s, key } = list[i];
    const label = `${startIdx + i}人目`;
    setHero(s, label);
    const c = card(), k = V.heroK;
    c.visible = true;
    c.scale.setScalar(.01);
    c.position.set(rand(-.6, .6), rand(-.3, .3), 0);
    burst(c.position, hdr(HEX[s.gender], 3), 80, 4, { life: .7 });
    await tween(260, t => c.scale.setScalar(Math.max(.01, k * t)), ease.back);
    await sleep(650);
    const P = plateLocal(key), p0 = c.position.clone();
    await tween(520, t => { c.position.lerpVectors(p0, P, t); c.scale.setScalar(lerp(k, 1, t)); c.rotation.z = t * Math.PI * 2; }, ease.in);
    c.rotation.set(0, 0, 0);
    land(s, key, "pop");
    shake(.12);
    await sleep(250);
  }
  V.spotSpeed = 1;
  await sleep(500);
}

/* =========================================================
   カットシーン
   ========================================================= */
async function cutBlackout() {
  const flash = beamMesh(0xfff2cc, 0);
  V.scene.add(flash);
  await tween(250, t => { setPlateDim(1 - t * .9); V.spotPower = 1 - t; }, ease.out);
  bubble("停電！？", v3(0, V.visH * .25, 0), 1300);
  const u = V.floor.material.uniforms;
  const fc = u.uFocusCol.value.clone();
  u.uFocusCol.value.set(1.2, 1.1, .9);
  const from = V.homePos.clone().add(v3(2, 1, 0));
  const pts = shuffleArray(realSeatPositions).slice(0, 4).map(k => { const p = seatXZ(k); return v3(p.x, 0, p.z); });
  flash.material.uniforms.uOpacity.value = .5;
  let cur = pts[0].clone();
  const un = addFrameHook(() => {
    aimBeam(flash, from, cur, 1.1);
    u.uFocus.value.set(cur.x, 0, cur.z, 1);
  });
  for (let i = 1; i < pts.length; i++) {
    const a = cur.clone();
    await tween(700, t => cur.lerpVectors(a, pts[i], t), ease.inOut);
    await sleep(250);
  }
  bubble("…あ、ついた", v3(0, V.visH * .25, 0), 1000);
  await sleep(700);
  un();
  V.scene.remove(flash);
  u.uFocus.value.w = 0;
  u.uFocusCol.value.copy(fc);
  for (let i = 0; i < 3; i++) { setPlateDim(1); V.spotPower = 1; await sleep(90); setPlateDim(.1); V.spotPower = 0; await sleep(120); }
  setPlateDim(1); V.spotPower = 1;
  shake(.1);
  await sleep(800);
}

async function cutTour() {
  letterbox(true);
  const cap = caption("― ただいまの教室 ―", 4600);
  await sleep(400);
  const C = V.lookTarget.clone();
  const H = V.homePos.clone();
  const R0 = Math.hypot(H.x - C.x, H.z - C.z), a0 = Math.atan2(H.x - C.x, H.z - C.z), h0 = H.y;
  const q = new THREE.Quaternion();
  let t = 0;
  const dur = 6.5;
  V.billboard = true;
  await new Promise(res => {
    V.camRig = dt => {
      t = Math.min(1, t + dt / dur);
      const e = ease.inOut(t);
      const a = a0 + e * Math.PI * 2;
      const r = R0 * (1 - .32 * Math.sin(Math.PI * e));
      const y = h0 * (1 - .55 * Math.sin(Math.PI * e));
      V.camera.position.set(C.x + Math.sin(a) * r, y, C.z + Math.cos(a) * r);
      V.camera.lookAt(C);
      if (t > .85) {
        q.copy(V.camera.quaternion).slerp(V.homeQuat, (t - .85) / .15);
        V.camera.quaternion.copy(q);
        V.camera.position.lerp(H, (t - .85) / .15);
      }
      if (t >= 1) { V.camRig = null; res(); }
    };
  });
  V.billboard = false;
  for (const key in V.seat) V.seat[key].pivot.quaternion.copy(V.homeQuat);
  letterbox(false);
  await cap;
}

async function cutCats() {
  const W = V.visW, H = V.visH;
  const cats = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const c = emojiSprite(V.tex.cat, rand(.9, 1.6));
    c.position.set(-W / 2 - 2 - i * 1.4, -H * .3 + rand(-.4, .6), rand(-3, 0));
    cats.push(c);
  }
  bubble("ニャー", v3(-W * .3, 0, 0), 1000);
  const un = addFrameHook((dt, t) => cats.forEach((c, i) => {
    c.position.x += dt * (W + 8) / 3.2;
    c.position.y += Math.cos(t * 18 + i) * dt * 2;
    c.scale.x = -Math.abs(c.scale.y);
  }));
  await sleep(1200);
  bubble("ニャニャ", v3(W * .1, -H * .05, 0), 900);
  await sleep(1300);
  bubble("…なんで猫？", v3(0, H * .25, 0), 1000);
  await sleep(1300);
  un();
  cats.forEach(c => { V.stage.remove(c); c.material.dispose(); });
}

async function cutUfoFleet() {
  const W = V.visW, H = V.visH;
  const ufos = [0, 1, 2].map(() => { const u = buildUfo(); V.stage.add(u.g); return u; });
  const off = [v3(0, 0, 0), v3(-1.6, .5, -1.5), v3(1.6, .5, -1.5)];
  bubble("！？", v3(0, H * .3, 0), 800);
  let beamOn = false;
  await tween(4200, t => {
    const x = lerp(-W * .8 - 3, W * .8 + 3, t);
    ufos.forEach((u, i) => {
      u.g.position.copy(v3(x, H * .28, -2).add(off[i]));
      if (i === 0) {
        const on = t > .35 && t < .6;
        if (on !== beamOn) { u.beam.visible = on; beamOn = on; }
        u.beam.material.uniforms.uOpacity.value = .7;
        u.beam.scale.set(1.2, H * .9, 1.2);
      }
    });
  }, ease.linear);
  ufos.forEach(u => { u.unhook(); V.stage.remove(u.g); });
  bubble("…なんだったんだ", v3(0, H * .2, 0), 1200);
  await sleep(1300);
}

async function cutHalfway(remain) {
  letterbox(true);
  const cap = caption(`のこり ${remain} 人`, 2200);
  await banner("折り返し地点！", 1800, "mode");
  const pal = [[0xfbbf24, 0xffffff], [0x2f8cff, 0x7dd3fc], [0xff4fb0, 0xfda4d4]];
  for (let i = 0; i < 4; i++) { firework(pick(pal)); await sleep(220); }
  await cap;
  letterbox(false);
  await sleep(400);
}

async function cutTension() {
  const tint = V.uniforms.uTint.value;
  const cols = V.spots.map(s => s.col.clone());
  await tween(700, t => {
    tint.setRGB(lerp(1, 1.25, t), lerp(1, .45, t), lerp(1, .5, t));
    V.spots.forEach((s, i) => s.col.copy(cols[i]).lerp(new THREE.Color(0xff2a2a), t));
  }, ease.inOut);
  letterbox(true);
  banner("ラスト3人…", 2600, "alert");
  for (let b = 0; b < 3; b++) {
    shake(.06);
    await Promise.all(realSeatPositions.map(k => tween(240, t => V.seat[k].pivot.scale.setScalar(1 + Math.sin(t * Math.PI) * .07), ease.out)));
    await sleep(500);
  }
  letterbox(false);
  await sleep(500);
  V.tension = cols;
}

function endTension() {
  if (!V.tension) return;
  const tint = V.uniforms.uTint.value, cols = V.tension;
  const from = V.spots.map(s => s.col.clone());
  V.tension = null;
  return tween(900, t => {
    tint.setRGB(lerp(1.25, 1, t), lerp(.45, 1, t), lerp(.5, 1, t));
    V.spots.forEach((s, i) => s.col.copy(from[i]).lerp(cols[i], t));
  }, ease.inOut);
}

const CUTS = { blackout: cutBlackout, tour: cutTour, cats: cutCats, ufos: cutUfoFleet };

/* =========================================================
   進行表: いつカットシーンや特別モードを入れるか
   ========================================================= */
function buildProgram(n) {
  const at = {};     // 人数インデックス → その前に入れるイベント
  const add = (i, e) => (at[i] ||= []).push(e);
  const used = new Set();
  const free = i => i > 1 && i < n - 4 && ![...used].some(u => Math.abs(u - i) < 3);
  const place = (want, e) => {
    for (const d of [0, 1, -1, 2, -2, 3, -3]) {
      const i = Math.round(want) + d;
      if (free(i)) { used.add(i); add(i, e); return true; }
    }
    return false;
  };
  if (n >= 10) { const i = Math.floor(n / 2); used.add(i); add(i, { cut: "halfway" }); }
  if (n >= 7) add(n - 3, { cut: "tension" });
  if (n >= 14) place(n * .28, { mode: "double" });
  if (n >= 22) place(n * .72, { mode: "double" });
  if (n >= 18) place(n * .62, { mode: "speed" });
  const cuts = shuffleArray(Object.keys(CUTS));
  const nc = Math.min(cuts.length, Math.floor(n / 7));
  for (let k = 0; k < nc; k++) place((k + 1) * n / (nc + 1) + rand(-1.5, 1.5), { cut: cuts[k] });
  return at;
}
