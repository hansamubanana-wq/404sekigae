"use strict";
/* =========================================================
   発表の演出 (3D)
   1人分 = 登場 (intro) → 席へ移動 (fly) → 着地 (land)
   ステージ座標: x = 右, y = 上, z = 手前 (原点 = 画面中央の発表位置)
   ========================================================= */

/* ---------- 小道具 ---------- */
// 吹き出しの文字に合わせて鳴らす音
const BUBBLE_SFX = {
  "…じゃなくて": "wrong", "…ではなく！": "wrong", "いや、ちがう！": "wrong", "ここ…？": "question",
  "あれ？": "question", "！？": "question", "…なんで猫？": "question", "…なんだったんだ": "question",
  "ニャッ": "pop", "ニャニャ": "pop", "ドロン": "pop",
  "ビュオォォ！": "windbig", "…ヒュ～": "windbig", "行きすぎ！": "whoosh", "やばっ": "whoosh",
  "分身の術！": "phase", "シュン！": "phase", "どれが本物？": "suspense", "本物はこっち！": "chime",
  "そろ〜り": "step", "ジリリリリ！": "bell", "パカッ！": "boxopen", "ドゥルルルル…": "suspense",
  "ジャーン！": "gong", "ピキッ": "crack", "ピキピキッ": "crack", "ザザッ…": "glitch",
  "…チャンネル調整中": "zap", "どこだ…？": "suspense", "発射！": "thruster", "…なにか来る！": "suspense",
  "ボヨン": "boing", "ぽよん": "boing", "ボイン": "boing",
};

function bubble(text, local, ms = 1100) {
  if (BUBBLE_SFX[text]) sfx(BUBBLE_SFX[text], { pan: panOf(local), vary: .06 });
  const p = toScreen(local);
  const el = document.createElement("div");
  el.className = "bubble";
  el.textContent = text;
  el.style.left = `${Math.max(70, Math.min(innerWidth - 70, p.x))}px`;
  el.style.top = `${Math.max(70, p.y)}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms / TIME_SCALE);
}

const BANNER_SFX = { kickoff: "jingle_start", mode: "jingle_mode", speed: "jingle_speed", alert: "jingle_last" };
async function banner(text, ms, cls = "") {
  if (text === "折り返し地点！") sfx("jingle_half");
  else if (cls === "count") { sfx("heart", { vol: 1 }); sfx("tick", { vol: .7 }); }
  else if (cls === "finale") { /* 全員決定は BGM (finale) だけ。長い効果音は鳴らさない */ }
  else if (BANNER_SFX[cls.split(" ").pop()]) sfx(BANNER_SFX[cls.split(" ").pop()]);
  const el = document.createElement("div");
  el.className = `banner ${cls}`;
  el.innerHTML = `<div class="big">${text}</div>`;
  document.body.appendChild(el);
  await sleep(ms);
  el.classList.add("out");
  await sleep(300);
  el.remove();
}

function veil(on, ms = 400) {
  const m = V.veilMesh.material, a0 = m.opacity, a1 = on ? .62 : 0;
  const d0 = V.uniforms.uDim.value, d1 = on ? .55 : 1;
  return tween(ms, t => { m.opacity = lerp(a0, a1, t); V.uniforms.uDim.value = lerp(d0, d1, t); }, ease.out);
}

function dolly(amt, key, ms = 900) {
  const o0 = V.camOffset.clone();
  let o1 = v3();
  if (key) {
    const { x, z } = seatXZ(key);
    o1 = v3(x, PLATE_Y, z).sub(V.homePos).multiplyScalar(amt);
  } else if (amt) {
    o1 = V.fwd.clone().multiplyScalar(amt);
  }
  return tween(ms, t => V.camOffset.lerpVectors(o0, o1, t), ease.inOut);
}

function spotFocus(key, ms = 700) {
  const f0 = V.spotFocus, f1 = key ? 1 : 0;
  if (key) { const { x, z } = seatXZ(key); V.spotFocusAt.set(x, 0, z); }
  return tween(ms, t => { V.spotFocus = lerp(f0, f1, t); }, ease.inOut);
}

function flashAt(local, color, size = 3) {
  const f = V.flash;
  f.position.copy(local);
  f.material.color.copy(color);
  return tween(520, t => {
    f.scale.setScalar(size * (.4 + t));
    f.material.opacity = (1 - t) * 1.0;
  }, ease.out);
}

function floorFocus(key, on) {
  const u = V.floor.material.uniforms;
  const { x, z } = seatXZ(key);
  u.uFocus.value.x = x; u.uFocus.value.z = z;
  const a0 = u.uFocus.value.w, a1 = on ? 1 : 0;
  return tween(on ? 300 : 1200, t => { u.uFocus.value.w = lerp(a0, a1, t); }, ease.out);
}


// 3次ベジェの補間
function bez(p0, c, p1, t) {
  const a = p0.clone().lerp(c, t), b = c.clone().lerp(p1, t);
  return a.lerp(b, t);
}

// まだ決まっていない席 (今の席以外)
function pendingOthers(key) { return [...hidden].filter(k => k !== key); }

function farSeats(fromKey, pool, n) {
  const a = seatXZ(fromKey);
  const d = k => { const b = seatXZ(k); return Math.hypot(a.x - b.x, a.z - b.z); };
  const sorted = [...pool].sort((x, y) => d(y) - d(x));
  const top = sorted.slice(0, Math.max(n, Math.ceil(sorted.length * .4)));
  return shuffleArray(top).slice(0, n);
}

const card = () => V.card.obj;

/* =========================================================
   登場
   ========================================================= */

// 粒子: 銀河の渦から光の粒が集まって名前になる
async function introParticles(s, label, from = "galaxy", at = null) {
  const P = V.particles;
  nameTargets(s, label, V.heroK, v3());
  particleStart(from, at);
  particleColors(s.gender);
  P.u.uForm.value = 0; P.u.uStream.value = 0; P.u.uFade.value = 1;
  P.u.uSwirl.value = from === "galaxy" ? 5 : 2;
  P.pts.visible = true;
  card().visible = false;
  sfx("magic", { vol: .8 });

  await tween(from === "galaxy" ? 2000 : 1300, t => { P.u.uForm.value = t; }, ease.linear);
  // 粒の名前 → 本物のカードへ
  const c = card();
  c.visible = true;
  setCardOpacity(0);
  burst(v3(0, 0, .3), [hdr(HEX[s.gender], 3), hdr(0xffffff, 3)], 160, 4, { life: .9 });
  sfx("jingle_reveal", { vol: .8 });
  await tween(600, t => { setCardOpacity(t); P.u.uFade.value = 1 - t; }, ease.out);
  P.pts.visible = false;
  await sleep(1100);
}

// スロット: 3D のドラムが回って別人で止まり「…じゃなくて」で本人に
async function introDrum(s, label, pool) {
  const K = 6, step = Math.PI * 2 / K;
  const k = V.heroK, h = FACE_H * k, w = FACE_W * k;
  const R = h / (2 * Math.tan(Math.PI / K)) * 1.02;
  const drum = new THREE.Group();
  drum.position.z = -R;
  const geo = new THREE.PlaneGeometry(w, h);
  const panels = [];
  for (let i = 0; i < K; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: V.plateTex[pick(pool.concat([s])).no], transparent: true }));
    const th = i * step;
    m.position.set(0, R * Math.sin(th), R * Math.cos(th));
    m.rotation.x = -th;
    drum.add(m);
    panels.push({ m, th, wasBack: false });
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xc8901c, metalness: 1, roughness: .35 });
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.03, .07, 12, 64), ringMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = sx * (w / 2 + .08);
    drum.add(ring);
  }
  V.stage.add(drum);
  drum.scale.setScalar(.01);

  const fake = pick(pool);
  const spinPool = [s, ...pool];
  const nTotal = 3 * K + Math.floor(Math.random() * K);
  const iEnd = nTotal % K;
  let phi = 0, lastStep = 0;
  const shade = () => {
    const st = Math.floor(phi / step);
    if (st !== lastStep) { lastStep = st; sfx("tick", { vol: .7, vary: .1 }); }
    for (const p of panels) {
      const a = p.th - phi;
      const c = Math.cos(a);
      p.m.material.color.setScalar(Math.max(.08, Math.pow(Math.max(0, c), 3)) * .84);
      const back = c < -.3;
      if (back && !p.wasBack) {
        const i = panels.indexOf(p);
        const remain = nTotal * step - phi;
        if (i === iEnd && remain < Math.PI * 2) p.m.material.map = V.plateTex[fake.no];
        else if (p.m.material.map !== V.tex.hero) p.m.material.map = V.plateTex[pick(spinPool).no];
      }
      p.wasBack = back;
    }
  };
  const unhook = addFrameHook(shade);

  await tween(450, t => drum.scale.setScalar(Math.max(.01, t)), ease.back);
  await tween(2900, t => { phi = nTotal * step * t; drum.rotation.x = phi; }, t => 1 - Math.pow(1 - t, 4));
  await sleep(900);

  bubble("…じゃなくて", v3(0, h * .75, 0), 1000);
  await tween(600, t => { drum.position.x = Math.sin(t * Math.PI * 6) * .18 * (1 - t); }, ease.linear);
  const iReal = (nTotal + 1) % K;
  panels[iReal].m.material.map = V.tex.hero;
  const p0 = phi;
  await tween(520, t => { phi = p0 + step * t; drum.rotation.x = phi; }, ease.back);
  burst(v3(0, 0, .4), [hdr(HEX[s.gender], 3), hdr(HEX.gold, 3)], 140, 4);
  sfx("stop"); sfx("jingle_reveal", { vol: .8 });
  unhook();

  // ドラム → カードへ入れ替え
  const c = card();
  c.visible = true;
  setCardOpacity(1);
  c.scale.setScalar(k);
  V.stage.remove(drum);
  geo.dispose();
  panels.forEach(p => p.m.material.dispose());
  await tween(220, t => c.scale.setScalar(k * (1 + Math.sin(t * Math.PI) * .06)), ease.out);
  await sleep(1000);
}

// 逆さまで出てきて「あれ？」→ くるっと戻る
async function introFlip(s) {
  const c = card(), k = V.heroK;
  c.visible = true;
  c.rotation.set(0, 0, Math.PI);
  c.scale.setScalar(.01);
  await tween(550, t => c.scale.setScalar(Math.max(.01, k * t)), ease.back);
  await sleep(900);
  bubble("あれ？", v3(0, FACE_H * k * .7, 0), 900);
  await sleep(700);
  sfx("whoosh", { rate: .8 });
  await tween(900, t => { c.rotation.z = Math.PI * (1 + t); c.rotation.x = Math.sin(t * Math.PI) * .6; }, ease.back);
  sfx("chime");
  c.rotation.set(0, 0, 0);
  burst(v3(0, 0, .3), hdr(HEX[s.gender], 3), 90, 3);
  await sleep(1000);
}

// 抽選マシン: ガラス球の中でボールが跳ね回り、1個飛び出して名前になる
async function introLottery(s, label) {
  const R = Math.min(1.45, V.visH * .3), r = R * .12;
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    uniforms: { uColor: { value: new THREE.Color(.3, .55, .85) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8901c, metalness: 1, roughness: .35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, R * .04, 12, 72), gold);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * .35, R * .6, R * .45, 40), new THREE.MeshStandardMaterial({ color: 0x1a2048, metalness: .7, roughness: .3 }));
  base.position.y = -R * 1.2;
  const baseLine = new THREE.Mesh(new THREE.TorusGeometry(R * .47, R * .02, 8, 48), new THREE.MeshBasicMaterial({ color: hdr(0x38bdf8, 2.5) }));
  baseLine.rotation.x = Math.PI / 2; baseLine.position.y = -R * 1.2;
  g.add(glass, ring, base, baseLine);

  const NB = 22;
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 24, 16),
    new THREE.MeshPhysicalMaterial({ metalness: .15, roughness: .15, clearcoat: 1 }), NB);
  const palette = [0x2f8cff, 0xff4fb0, 0xfbbf24, 0xffffff, 0xa78bfa];
  const P = [], Vv = [];
  for (let i = 0; i < NB; i++) {
    balls.setColorAt(i, new THREE.Color(i === 0 ? HEX[s.gender] : palette[i % palette.length]));
    const a = Math.random() * 6.28, d = Math.random() * (R - r) * .8;
    P.push(v3(Math.cos(a) * d, -R * .3 - Math.random() * R * .5, (Math.random() - .5) * R));
    Vv.push(v3());
  }
  g.add(balls);
  V.stage.add(g);
  g.scale.setScalar(.01);

  let stir = 0;
  const M = new THREE.Matrix4();
  const physics = dt => {
    const sub = 3, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (let i = 0; i < NB; i++) {
        if (P[i].free === false) continue;
        const p = P[i], v = Vv[i];
        v.y -= 9 * h;
        if (stir > 0) {
          v.x += -p.y * 9 * stir * h; v.y += p.x * 9 * stir * h;
          if (p.y < -R * .4) v.y += 22 * stir * h * Math.random();
          v.z += (Math.random() - .5) * 20 * stir * h;
        }
        p.addScaledVector(v, h);
        const len = p.length();
        if (len > R - r) {
          const n = p.clone().divideScalar(len);
          p.copy(n).multiplyScalar(R - r);
          const vn = v.dot(n);
          if (vn > 0) v.addScaledVector(n, -1.75 * vn);
        }
      }
      for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
        if (P[i].free === false || P[j].free === false) continue;
        const d = P[j].clone().sub(P[i]);
        const L = d.length();
        if (L > 0 && L < 2 * r) {
          d.divideScalar(L);
          const push = (2 * r - L) / 2;
          P[i].addScaledVector(d, -push); P[j].addScaledVector(d, push);
          const rel = Vv[j].clone().sub(Vv[i]).dot(d);
          if (rel < 0) { Vv[i].addScaledVector(d, rel * .9); Vv[j].addScaledVector(d, -rel * .9); }
        }
      }
    }
    for (let i = 0; i < NB; i++) { M.makeTranslation(P[i].x, P[i].y, P[i].z); balls.setMatrixAt(i, M); }
    balls.instanceMatrix.needsUpdate = true;
  };
  const unhook = addFrameHook(physics);

  await tween(500, t => g.scale.setScalar(Math.max(.01, t)), ease.back);
  const rattle = sfx("dice", { loop: true, vol: .9 });
  await tween(300, t => { stir = t; }, ease.linear);
  await sleep(2100);
  if (rattle) rattle.stop(.4);
  await tween(500, t => { stir = 1 - t; }, ease.linear);

  // 当たりのボールが上の穴から飛び出す
  const win = P[0];
  win.free = false;
  const w0 = win.clone();
  await tween(600, t => {
    win.copy(bez(w0, v3(0, R * .2, 0), v3(0, R + r * 2, 0), t));
    M.makeTranslation(win.x, win.y, win.z); balls.setMatrixAt(0, M); balls.instanceMatrix.needsUpdate = true;
  }, ease.inOut);
  burst(v3(0, R, 0), hdr(HEX.gold, 3), 60, 2.5, { life: .6 });
  sfx("boing", { rate: 1.2 });
  const w1 = win.clone();
  await tween(600, t => {
    win.copy(bez(w1, v3(0, R + 1, .6), v3(0, .1, 1.4), t));
    M.compose(win, new THREE.Quaternion(), v3(1, 1, 1).multiplyScalar(1 + t * 1.8));
    balls.setMatrixAt(0, M); balls.instanceMatrix.needsUpdate = true;
    glass.material.uniforms.uOpacity.value = 1 - t * .7;
  }, ease.inOut);
  unhook();

  // ボールがはじけて、粒が名前になる
  flashAt(win.clone(), hdr(HEX[s.gender], 2.5), 3);
  sfx("bang", { vol: .7 });
  burst(win.clone(), [hdr(HEX[s.gender], 3), hdr(0xffffff, 3)], 200, 5);
  const at = win.clone();
  tween(400, t => { g.scale.setScalar(1 - t * .99); }, ease.in).then(() => {
    V.stage.remove(g);
    balls.geometry.dispose(); balls.material.dispose(); glass.geometry.dispose(); glass.material.dispose();
  });
  await introParticles(s, label, "point", at);
}

/* =========================================================
   席へ移動
   ========================================================= */

// ふつう: 弧を描いて飛んでいく
async function flyArc(s, key) {
  const c = card(), P = plateLocal(key);
  const p0 = c.position.clone(), s0 = c.scale.x;
  const side = P.x > 0 ? 1 : -1;
  const ctrl = p0.clone().lerp(P, .4).add(v3(side * .8, 2.4, 1.2));
  dolly(.18, key, 1100);
  sfx("whoosh", { pan: P.x / V.visW });
  await tween(1100, t => {
    c.position.copy(bez(p0, ctrl, P, t));
    c.scale.setScalar(lerp(s0, 1, t));
    c.rotation.y = Math.sin(t * Math.PI) * .7 * side;
    c.rotation.z = -Math.sin(t * Math.PI) * .15 * side;
  }, ease.inOut);
  c.rotation.set(0, 0, 0);
}

// 粒子の川: カードが粒にほどけて、光の川になって席へ流れ込む
async function flyStream(s, key) {
  const Pt = V.particles, c = card();
  const P = plateLocal(key);
  nameTargets(s, V.heroLabel, V.heroK, c.position);
  particleColors(s.gender);
  Pt.u.uForm.value = 1; Pt.u.uStream.value = 0; Pt.u.uFade.value = 1;
  Pt.pts.visible = true;
  flashAt(c.position.clone(), hdr(HEX[s.gender], 1.5), 4);
  sfx("magic", { vol: .7, rate: 1.15 });
  c.visible = false;
  Pt.u.uDest.value.copy(P);
  Pt.u.uCtrl.value.copy(c.position.clone().lerp(P, .5).add(v3(0, 2.5, 1)));
  dolly(.18, key, 1400);
  let flipped = false;
  await tween(1700, t => {
    Pt.u.uStream.value = t;
    if (t > .72 && !flipped) { flipped = true; land(s, key, "flip"); }
    Pt.u.uFade.value = 1 - clamp01((t - .85) / .15);
  }, ease.linear);
  Pt.pts.visible = false;
  return "landed";
}

// フェイント: 遠くの違う席に降りかけて「…ではなく！」
async function flyDecoy(s, key) {
  const c = card();
  const pool = pendingOthers(key);
  const decoys = [farSeats(key, pool, 1)[0]];
  if (Math.random() < .35 && pool.length > 1) decoys.push(farSeats(decoys[0], pool.filter(k => k !== decoys[0]), 1)[0]);

  for (let i = 0; i < decoys.length; i++) {
    const d = decoys[i], o = V.seat[d];
    const D = plateLocal(d).add(v3(0, .55, .2));
    const p0 = c.position.clone(), s0 = c.scale.x;
    const ctrl = p0.clone().lerp(D, .5).add(v3(0, 2, 1));
    dolly(.15, d, 1000);
    await tween(1000, t => { c.position.copy(bez(p0, ctrl, D, t)); c.scale.setScalar(lerp(s0, 1.05, t)); }, ease.inOut);
    const unhook = addFrameHook((dt, tt) => { o.pivot.rotation.z = Math.sin(tt * 30) * .06; });
    await sleep(700);
    const last = i === decoys.length - 1;
    bubble(last ? "…ではなく！" : pick(["ここ…？", "いや、ちがう！"]), D.clone().add(v3(0, .5, 0)), 900);
    await sleep(700);
    unhook();
    o.pivot.rotation.z = 0;
  }
  const P = plateLocal(key), p0 = c.position.clone();
  dolly(.18, key, 900);
  await tween(900, t => { c.position.copy(bez(p0, p0.clone().lerp(P, .5).add(v3(0, 1.6, .5)), P, t)); c.scale.setScalar(lerp(1.05, 1, t)); }, ease.inOut);
}

// 猫の乱入: 名前をくわえて走り回り、正しい席に落としていく
async function flyCat(s, key) {
  await catDelivery(card(), key, Math.random() < .5 ? -1 : 1, pick(CAT_COATS));
}

// UFO: 名前を吸い上げて連れ去り、遠回りして席の上から降ろす
async function flyUfo(s, key) {
  const c = card(), P = plateLocal(key);
  const W = V.visW, H = V.visH;
  const ufo = stageUfo();

  const p0 = c.position.clone(), s0 = c.scale.x;
  const spot = v3(rand(-W * .2, W * .2), -H * .15, 0);
  await tween(700, t => { c.position.lerpVectors(p0, spot, t); c.scale.setScalar(lerp(s0, V.heroK * .45, t)); }, ease.out);

  ufo.g.position.set(spot.x, H / 2 + 2, 0);
  const hum = sfx("ufo", { loop: true, vol: .55 });
  bubble("！？", spot.clone().add(v3(0, .8, 0)), 900);
  const top = spot.clone().add(v3(0, 2.6, 0));
  await tween(1000, t => ufo.g.position.lerpVectors(v3(spot.x, H / 2 + 2, 0), top, t), ease.out);

  ufo.beam.visible = true;
  sfx("beam");
  const beamTo = target => { const len = ufo.g.position.y - target.y; ufo.beam.scale.set(.9, Math.max(.01, len), .9); };
  beamTo(c.position);
  await tween(300, t => { ufo.beam.material.uniforms.uOpacity.value = t * .9; }, ease.out);
  const c0 = c.position.clone(), cs = c.scale.x;
  await tween(1200, t => {
    c.position.set(ufo.g.position.x + Math.sin(t * Math.PI * 4) * .4 * (1 - t), lerp(c0.y, ufo.g.position.y - .2, t), 0);
    c.scale.setScalar(cs * (1 - t * .85));
    c.rotation.z = Math.sin(t * Math.PI * 6) * .25;
  }, ease.in);
  c.visible = false;
  ufo.beam.visible = false;

  // 遠回りしてから、席の上へ
  const far = v3(P.x < 0 ? W * .35 : -W * .35, H * .3, -2);
  const u0 = ufo.g.position.clone();
  await tween(900, t => ufo.g.position.lerpVectors(u0, far, t), ease.inOut);
  dolly(.15, key, 1100);
  const above = P.clone().add(v3(0, 2.6, 0));
  await tween(1100, t => ufo.g.position.lerpVectors(far, above, t), ease.inOut);

  c.visible = true;
  c.rotation.set(0, 0, 0);
  c.position.copy(above).add(v3(0, -.2, 0));
  ufo.beam.visible = true;
  sfx("beam");
  const start = c.position.clone();
  await tween(1000, t => {
    c.position.lerpVectors(start, P, t);
    c.scale.setScalar(lerp(.1, 1, t));
    beamTo(c.position);
  }, ease.out);
  await tween(250, t => { ufo.beam.material.uniforms.uOpacity.value = .9 * (1 - t); }, ease.linear);
  const u1 = ufo.g.position.clone();
  tween(900, t => { ufo.g.position.copy(u1).add(v3(t * 2, t * (H + 4), 0)); ufo.g.rotation.z = -t * .5; }, ease.in)
    .then(() => { ufo.remove(); if (hum) hum.stop(.5); });
}

function stageUfo() {
  const g = stageActor(buildUfo);
  return { g, beam: g.userData.beam, remove: g.userData.remove };
}

function buildUfo() {
  const g = new THREE.Group();
  const prof = [[0, -.2], [.45, -.17], [.9, -.06], [1.08, 0], [1.0, .06], [.55, .14], [0, .17]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshStandardMaterial({ color: 0xb8c2d8, metalness: .95, roughness: .22 }));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x7fe9ff, roughness: .05, transparent: true, opacity: .6, emissive: 0x1aa0c0, emissiveIntensity: .8, clearcoat: 1 }));
  dome.position.y = .12;
  g.add(body, dome);
  const lights = [];
  const cols3 = [0xff4fb0, 0x38bdf8, 0xfbbf24].map(color => hdr(color, 3));
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), new THREE.MeshBasicMaterial({ color: cols3[i % 3] }));
    m.position.set(Math.cos(a) * .92, -.04, Math.sin(a) * .92);
    g.add(m);
    lights.push(m);
  }
  const beam = beamMesh(0xa8ff8c, 0);
  beam.position.y = -.15;
  beam.visible = false;
  g.add(beam);
  g.userData.beam = beam;
  g.userData.reset = () => {
    beam.visible = false;
    beam.scale.setScalar(1);
    beam.material.uniforms.uOpacity.value = 0;
  };
  g.userData.update = (t, dt) => {
    g.rotation.y += dt * 1.5;
    const phase = Math.floor(t * 8);
    lights.forEach((m, i) => m.material.color.copy(cols3[(i + phase) % 3]));
    g.position.y += Math.sin(t * 3) * .004;
  };
  return g;
}

// 強風: 画面の外まで吹き飛ばされ、木の葉みたいにひらひら戻ってくる
async function flyWind(s, key) {
  const c = card(), P = plateLocal(key);
  const W = V.visW, H = V.visH;
  const toRight = Math.random() < .5;
  const wy = c.position.y;
  const gust = stageGust(toRight ? 1 : -1);
  bubble("ビュオォォ！", v3(toRight ? -W * .3 : W * .3, wy + 1.2, .5), 1100);
  const gusting = tween(2000, t => gust.userData.progress(t), ease.linear);
  await sleep(450);

  const p0 = c.position.clone(), s0 = c.scale.x;
  await tween(1300, t => {
    c.position.set(lerp(p0.x, toRight ? W + 4 : -W - 4, t), p0.y + Math.sin(t * Math.PI * 3) * 1.2 - t, p0.z + t * 2);
    c.scale.setScalar(s0 * (1 - t * .4));
    c.rotation.set(t * 9, t * 6 * (toRight ? 1 : -1), t * 12 * (toRight ? -1 : 1));
  }, ease.in);
  gusting.then(() => gust.userData.remove());
  await sleep(800);

  bubble("…", v3(0, H * .35, 0), 800);
  await sleep(600);
  dolly(.15, key, 1500);
  const start = v3(P.x + (P.x > 0 ? -1 : 1) * W * .3, H / 2 + 1.5, -2);
  await tween(2700, t => {
    const p = start.clone().lerp(P, t);
    p.x += Math.sin(t * Math.PI * 3.5) * W * .25 * (1 - t);
    c.position.copy(p);
    c.scale.setScalar(lerp(V.heroK * .5, 1, t));
    c.rotation.set(Math.sin(t * Math.PI * 3) * .9 * (1 - t), Math.sin(t * Math.PI * 2.3) * .6 * (1 - t), Math.sin(t * Math.PI * 7) * .5 * (1 - t));
  }, ease.linear);
  c.rotation.set(0, 0, 0);
}

// 分身の術: 3枚に分かれて別々の席へ。本物以外はドロン
async function flyClone(s, key) {
  const c = card(), k = c.scale.x;
  const decoys = farSeats(key, pendingOthers(key), 2);
  const W = V.visW;
  const sm = V.heroK * .5;
  await tween(500, t => c.scale.setScalar(lerp(k, sm, t)), ease.out);
  bubble("分身の術！", v3(0, FACE_H * sm * .9, 0), 1100);

  // 分身は本物とは別の物体として作る (見た目は同じ)
  const clones = [0, 1].map(() => {
    const o = makeExtraCard(s, V.heroLabel);
    o.scale.setScalar(sm);
    return o;
  });
  const gap = Math.min(W * .3, FACE_W * sm * 1.15);
  await Promise.all([
    tween(450, t => { clones[0].position.x = -gap * t; }, ease.back),
    tween(450, t => { clones[1].position.x = gap * t; }, ease.back),
  ]);
  await sleep(450);

  // 3枚を入れ替えてシャッフル
  const all = [c, ...clones];
  for (let r = 0; r < 3; r++) {
    const xs = all.map(o => o.position.x);
    const order = shuffleArray([-gap, 0, gap]);
    await tween(380, t => all.forEach((o, i) => {
      o.position.x = lerp(xs[i], order[i], t);
      o.position.z = Math.sin(t * Math.PI) * (i - 1) * 1.2;
    }), ease.inOut);
  }

  // それぞれの席の少し上・手前に浮かせて待つ (名札と重ならないように)
  const targets = [key, ...decoys];
  const hover = v3(0, .55, .7);
  const starts = all.map(o => o.position.clone());
  const ends = targets.map(k2 => plateLocal(k2).add(hover));
  dolly(-.05, null, 900);
  await tween(1100, t => all.forEach((o, i) => {
    o.position.copy(bez(starts[i], starts[i].clone().lerp(ends[i], .5).add(v3(0, 1.8, .5)), ends[i], t));
    o.scale.setScalar(lerp(sm, 1, t));
  }), ease.inOut);
  const bob = addFrameHook((dt, t) => all.forEach((o, i) => {
    if (o.parent) o.position.y = ends[i].y + Math.sin(t * 3 + i * 2) * .06;
  }));
  bubble("どれが本物？", v3(0, V.visH * .35, 0), 1300);
  await sleep(1500);

  for (let i = 0; i < 2; i++) {
    const o = clones[i];
    bubble("ドロン", o.position.clone().add(v3(0, .5, 0)), 700);
    burst(o.position.clone(), hdr(0xffffff, 1.6), 70, 1.5, { life: .8, grav: -.5 });
    await tween(350, t => { o.scale.setScalar(1 - t * .99); o.rotation.z = t * 3; }, ease.in);
    V.stage.remove(o);
    o.userData.dispose();
    await sleep(500);
  }
  bob();

  // 残った本物が席に降りる
  bubble("本物はこっち！", c.position.clone().add(v3(0, .6, 0)), 900);
  await sleep(500);
  const P = plateLocal(key), q0 = c.position.clone();
  dolly(.18, key, 500);
  await tween(450, t => c.position.lerpVectors(q0, P, t), ease.in);
}

// 行きすぎ: 勢いあまって奥へ飛んでいく → そろ〜りと戻ってくる
async function flyOvershoot(s, key) {
  const c = card(), P = plateLocal(key);
  const p0 = c.position.clone(), s0 = c.scale.x;
  const dir = P.clone().sub(p0).normalize();
  const far = P.clone().addScaledVector(dir, 25);
  await tween(1000, t => { c.position.lerpVectors(p0, far, t); c.scale.setScalar(lerp(s0, 1, t)); c.rotation.z = t * 1.2; }, ease.in);
  bubble("行きすぎ！", P.clone().add(v3(0, .6, 0)), 1100);
  await sleep(1200);
  const back = P.clone().add(v3(0, 1.2, 4));
  c.rotation.z = 0;
  await tween(900, t => c.position.lerpVectors(far, back, t), ease.out);
  bubble("そろ〜り", back.clone().add(v3(0, .7, 0)), 1000);
  dolly(.18, key, 1300);
  await tween(1300, t => { c.position.lerpVectors(back, P, t); c.rotation.z = Math.sin(t * Math.PI * 4) * .06; }, ease.inOut);
  c.rotation.z = 0;
}

// 居眠り: 途中で寝てしまい、目覚ましで飛び起きてダッシュ
async function flySleep(s, key) {
  const c = card(), P = plateLocal(key);
  const p0 = c.position.clone(), s0 = c.scale.x;
  const mid = p0.clone().lerp(P, .3);
  await tween(1000, t => { c.position.lerpVectors(p0, mid, t); c.scale.setScalar(lerp(s0, s0 * .7, t)); }, ease.out);
  await tween(900, t => { c.rotation.z = -.45 * t; c.position.y = mid.y - .3 * t; }, ease.inOut);
  const z = stageActor(buildZs);
  const unZ = addFrameHook(() => z.position.copy(c.position).add(v3(FACE_W * c.scale.x * .45, FACE_H * c.scale.x * .4, .3)));
  await sleep(2100);
  unZ(); z.userData.remove();
  const clock = stageActor(buildClock);
  clock.scale.setScalar(.95);
  clock.position.copy(c.position).add(v3(-2.1, .5, .6));
  clock.rotation.y = .35;
  clock.userData.ring = true;
  bubble("ジリリリリ！", clock.position.clone().add(v3(0, .8, 0)), 1000);
  const y0 = c.position.y, cl0 = clock.position.clone();
  await tween(700, t => {
    c.rotation.z = -.45 * (1 - t) + Math.sin(t * 40) * .1;
    c.position.y = y0 + Math.sin(t * Math.PI) * .6;
    clock.position.x = cl0.x + Math.sin(t * 60) * .05;
  }, ease.linear);
  clock.userData.ring = false;
  tween(300, t => clock.scale.setScalar(.95 * (1 - t) + .01), ease.in).then(() => clock.userData.remove());
  c.rotation.z = 0;
  bubble("やばっ", c.position.clone().add(v3(0, .8, 0)), 700);
  await sleep(300);
  const q0 = c.position.clone(), qs = c.scale.x;
  dolly(.18, key, 500);
  await tween(480, t => { c.position.lerpVectors(q0, P, t); c.scale.setScalar(lerp(qs, 1, t)); }, ease.out);
}

/* =========================================================
   着地 (席に名前が入る)
   ========================================================= */
async function land(s, key, style = "pop") {
  const o = V.seat[key];
  const P = plateLocal(key);
  const col = hdr(HEX[s.gender], 1);
  card().visible = false;
  hidden.delete(key);
  seatLook(key);
  if (style === "pop") {
    o.flipper.rotation.y = 0;
    tween(500, t => o.pivot.scale.setScalar(1 + (1 - t) * .35), ease.back);
  } else {
    flipPlate(key, false, 650);
  }
  flashAt(P, hdr(HEX[s.gender], 1.6), 3.2);
  burst(P, [hdr(HEX[s.gender], 3), hdr(HEX.gold, 3), hdr(0xffffff, 2.5)], 150, 3.2, { life: 1 });
  floorFocus(key, true).then(() => floorFocus(key, false));
  sfx("land", { pan: P.x / V.visW });
  sfx("chime", { vol: .8, delay: .05 });
  setDeskStrip(o, col, 6);
  tween(900, t => setDeskStrip(o, col, lerp(6, 2.4, t)), ease.out);
  updateStatus();
}

/* =========================================================
   1人分の発表
   ========================================================= */
// 山札方式: 全部ひととおり出るまで同じ演出は出ない
class Deck {
  constructor(list) { this.list = list; this.q = []; }
  draw(ok) {
    for (let tries = 0; tries < 2; tries++) {
      if (!this.q.length) this.q = shuffleArray(this.list);
      const i = this.q.findIndex(ok);
      if (i >= 0) return this.q.splice(i, 1)[0];
      this.q = [];
    }
    return this.list.find(ok) || this.list[0];
  }
}
const INTRO_LIST = ["particles", "particles", "lottery", "drum", "flip", "meteor", "warp", "gift", "curtain", "shatter", "countdown", "search", "glitch", "plain"];
const FLY_LIST = ["arc", "stream", "stream", "decoy", "cat", "ufo", "wind", "clone", "overshoot", "sleep", "rocket", "bounce", "teleport", "meteorDrop", "spiral"];
const FLY_NEEDS = { decoy: 1, clone: 2, bounce: 1 };
let introDeck, flyDeck, lastIntro = null, lastFly = null;
function resetDecks() {
  introDeck = new Deck(INTRO_LIST);
  flyDeck = new Deck(FLY_LIST);
  lastIntro = lastFly = null;
}
resetDecks();

async function introPlain(s) {
  const c = card(), k = V.heroK;
  c.visible = true;
  c.scale.setScalar(.01);
  burst(v3(0, 0, .2), [hdr(HEX[s.gender], 3), hdr(HEX.gold, 3)], 120, 4);
  sfx("whoosh"); sfx("pop", { delay: .25 });
  await tween(600, t => { c.scale.setScalar(Math.max(.01, k * t)); c.rotation.y = (1 - t) * Math.PI * 2; }, ease.back);
  c.rotation.y = 0;
  await sleep(1400);
}

const INTRO = {
  particles: (s, l) => introParticles(s, l),
  lottery: introLottery,
  drum: introDrum,
  flip: introFlip,
  plain: introPlain,
  meteor: introMeteor,
  warp: introWarp,
  gift: introGift,
  curtain: introCurtain,
  shatter: introShatter,
  countdown: introCountdown,
  search: introSearch,
  glitch: introGlitch,
};
const FLY = {
  arc: flyArc, stream: flyStream, decoy: flyDecoy, cat: flyCat, ufo: flyUfo, wind: flyWind, clone: flyClone,
  overshoot: flyOvershoot, sleep: flySleep, rocket: flyRocket, bounce: flyBounce, teleport: flyTeleport,
  meteorDrop: flyMeteorDrop, spiral: flySpiral,
};

async function announce(s, key, index, total, force = {}) {
  const label = index === total ? "ラスト！" : `${index}人目`;
  const others = pendingOthers(key);
  const intro = force.intro || introDeck.draw(x => x !== lastIntro && (x !== "drum" || others.length >= 1));
  const fly = force.fly || flyDeck.draw(x => x !== lastFly && (FLY_NEEDS[x] || 0) <= others.length && !(intro === "meteor" && x === "meteorDrop"));
  lastIntro = intro; lastFly = fly;

  setHero(s, label);
  card().visible = false;
  V.particles.pts.visible = false;
  veil(true, 450);
  await INTRO[intro](s, label, others.map(k => seats[k]));
  V.particles.pts.visible = false;

  veil(false, 600);
  spotFocus(key, 900);
  const r = await FLY[fly](s, key);
  if (r !== "landed") await land(s, key, "pop");
  await sleep(500);
  dolly(0, null, 800);
  spotFocus(null, 900);
  await sleep(350);
}

/* =========================================================
   スタート / フィナーレ
   ========================================================= */
async function showStart(movable) {
  V.spotSpeed = 5;
  const b = banner("席替え、スタート！", 1200, "kickoff");
  veil(true, 300);
  const order = [...movable].sort((a, b2) => seatXZ(b2).z - seatXZ(a).z);
  // 名札が後ろの列から次々と裏返る
  const flips = order.map((key, i) => sleep(i * 20).then(async () => {
    await flipPlate(key, true, 480);
  }));
  await Promise.all(flips);
  for (const key of movable) seatLook(key);
  await b;
  V.spotSpeed = 1;
  await veil(false, 300);
}

async function orbitClassroom() {
  const camera = V.camera;
  const startPos = camera.position.clone(), startQuat = camera.quaternion.clone();
  let progress = 0;
  V.billboard = true;
  V.shakeAmt = 0;
  V.camRig = () => {
    const t = progress;
    const angle = Math.PI * (1 - Math.cos(Math.PI * t));
    const wide = Math.sin(Math.PI * t);
    const radius = (V.homePos.z - V.lookTarget.z) * (1 + .2 * wide);
    camera.position.set(
      V.lookTarget.x + Math.sin(angle) * radius,
      V.homePos.y + 1.8 * wide,
      V.lookTarget.z + Math.cos(angle) * radius,
    );
    const enter = ease.inOut(clamp01(t / .12));
    camera.position.lerpVectors(startPos, camera.position, enter);
    camera.lookAt(V.lookTarget);
    const exit = ease.inOut(clamp01((t - .88) / .12));
    camera.quaternion.slerp(startQuat, 1 - enter).slerp(V.homeQuat, exit);
  };
  try {
    await tween(12000, t => { progress = t; }, ease.linear);
    camera.position.copy(V.homePos);
    camera.quaternion.copy(V.homeQuat);
    V.fixedView = true;
  } finally {
    V.camRig = null;
    V.camOffset.set(0, 0, 0);
    V.billboard = false;
    for (const key of realSeatPositions) V.seat[key].pivot.quaternion.copy(V.homeQuat);
  }
}

async function showFinale() {
  endTension();
  veil(false, 300);
  const orbit = orbitClassroom();
  const keys = [...realSeatPositions].sort((a, b) => seatXZ(a).z - seatXZ(b).z);
  keys.forEach((key, i) => sleep(i * 45).then(() => {
    const o = V.seat[key];
    tween(500, t => o.pivot.scale.setScalar(1 + Math.sin(t * Math.PI) * .2), ease.out);
    const col = hdr(HEX[seats[key].gender], 1);
    tween(700, t => setDeskStrip(o, col, lerp(7, 2.4, t)), ease.out);
  }));
  V.spotSpeed = 4;
  bgm("finale");
  const b = banner("全員決定！", 3000, "finale");
  confettiShower(6000);
  const palettes = [[0xfbbf24, 0xffffff], [0x2f8cff, 0x7dd3fc], [0xff4fb0, 0xfda4d4], [0xa78bfa, 0xffffff], [0x34d399, 0xfbbf24]];
  for (let i = 0; i < 12; i++) {
    firework(pick(palettes));
    await sleep(rand(160, 330));
  }
  await Promise.all([b, orbit]);
  V.spotSpeed = 1;
}

async function firework(pal) {
  const W = V.visW, H = V.visH;
  const z = rand(-9, -3);
  const scale = (STAGE_D - z) / STAGE_D;
  const from = v3(rand(-W * .4, W * .4) * scale, -H * .7 * scale, z);
  const to = v3(from.x + rand(-.5, .5), rand(H * .05, H * .38) * scale, z);
  const trail = hdr(0xffd58a, 2);
  await tween(rand(550, 800), t => {
    const p = from.clone().lerp(to, t);
    burst(p, trail, 2, .3, { life: .45, size: .09, grav: 1 });
  }, ease.out);
  const cols = pal.map(c => hdr(c, 3.2));
  sfx("firework", { vol: .7, pan: to.x / V.visW, vary: .1 });
  burst(to, cols, 260, 5.5 * scale, { life: 1.6, size: .13 * scale, grav: 1.5, even: true });
  flashAt(to, hdr(pal[0], 1.2), 6 * scale);
}
