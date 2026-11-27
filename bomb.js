"use strict";
/* =========================================================
   最前列中央の机に仕掛けた装置 (動画の爆弾と同じ見た目)
   ・赤い筒の束 + 黒いテープ + 基板 + 赤い数字のタイマー + 小さな液晶 + 赤と青の線
   ・席替えが始まると動き出し、最前列中央の動画が始まる瞬間にちょうど 00:22 になる
     (残り時間は発表の進み具合から見積もり直す。数字は飛ばさず、読める大きさで映っている間は
      ほぼ1秒ずつ、映っていない・小さいときだけ速さを変えて見積もりに寄せる)
   ・最前列中央が空席の間だけ机に置き、はてなの名札は出さない。人が入ったら消える
   ・動画のあとは 00:01 で止まり、液晶が白く光る
   ・演出の字幕などでは触れない (さりげなく映り込むだけ)
   ========================================================= */

const BOMB = {
  key: `0-${(cols - 1) / 2}`,
  videoAt: 22,              // 動画の開始時点で表示する秒数
  roundMs: 7400,            // 1組の発表にかかる時間の初めの見積もり (ミリ秒。実測の平均)
  tailMs: 8800,             // 最前列中央の組が始まってから動画が始まるまで (候補提示 + 前振り)
  introMs: 4850,            // 前振りの開始から動画が始まるまで (実測 4.8秒 + 再生開始の待ち)
  state: "idle",            // idle | run | done
  target: 0,                // 動画が始まる予定の時刻 (performance.now)
  shown: "",
};

function buildBomb() {
  const { x, z } = seatXZ(BOMB.key);
  const g = new THREE.Group();
  // 空席の間は名札 (はてな) を消して、机の天板の真ん中に置く。斜め上のカメラにタイマーが向くよう後ろへ傾ける
  g.position.set(x, .66, z + .1);
  g.rotation.x = -.6;
  const red = new THREE.MeshStandardMaterial({ color: 0xb4261d, roughness: .55, emissive: 0x3a0806 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: .8, emissive: 0x1a140c });
  const tape = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .45 });
  const board = new THREE.MeshStandardMaterial({ color: 0x173826, roughness: .5, emissive: 0x04100a });
  // 筒 6本 (横向きに3本×2段)
  const stick = new THREE.CylinderGeometry(.052, .052, .62, 16);
  stick.rotateZ(Math.PI / 2);
  const end = new THREE.CylinderGeometry(.053, .053, .03, 16);
  end.rotateZ(Math.PI / 2);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
    const y = -.055 + row * .105, zz = -.11 + i * .105 - row * .02;
    const m = new THREE.Mesh(stick, red); m.position.set(0, y, zz); g.add(m);
    for (const sx of [-.32, .32]) { const c = new THREE.Mesh(end, cap); c.position.set(sx, y, zz); g.add(c); }
  }
  // 黒いテープ 2本
  const band = new THREE.BoxGeometry(.06, .25, .36);
  for (const bx of [-.19, .19]) { const b = new THREE.Mesh(band, tape); b.position.set(bx, 0, -.01); g.add(b); }
  // 基板 (手前に立てる)
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(.4, .2, .025), board);
  pcb.position.set(0, .15, .07); g.add(pcb);
  // 赤い数字のタイマー
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(.25, .09), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  disp.position.set(-.04, .185, .085); g.add(disp);
  BOMB.disp = disp;
  // 小さな液晶 (動画のあとは白く光る)
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(.085, .06), new THREE.MeshBasicMaterial({ color: 0x1a2420, toneMapped: false }));
  lcd.position.set(.14, .185, .085); g.add(lcd);
  // 点滅する赤いランプ
  const led = new THREE.Mesh(new THREE.SphereGeometry(.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
  led.position.set(.16, .09, .085); g.add(led);
  // 赤と青の線 (基板から筒へ)
  const wire = (color, pts) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => v3(...p)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .008, 6), new THREE.MeshStandardMaterial({ color, roughness: .4, emissive: color, emissiveIntensity: .25 }));
    g.add(m);
  };
  wire(0xe0261b, [[-.12, .07, .09], [-.22, .02, .14], [-.3, .04, .1], [-.31, .0, .04]]);
  wire(0x2563eb, [[-.06, .07, .09], [-.04, .0, .15], [.1, -.02, .14], [.27, .0, .08], [.31, .02, .03]]);
  wire(0xe0261b, [[.2, .22, .07], [.27, .2, .04], [.3, .1, .0]]);
  wire(0x2563eb, [[-.2, .22, .07], [-.27, .19, .04], [-.31, .09, .0]]);
  g.scale.setScalar(2.3);
  g.visible = false;
  V.scene.add(g);
  // 爆発の火の玉 (外側の炎と内側の白い芯)
  const ball = new THREE.Group();
  const fireMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fireMat(0xff5a14));
  const inner = new THREE.Mesh(new THREE.SphereGeometry(.55, 20, 14), fireMat(0xfff0b0));
  ball.add(outer, inner);
  ball.visible = false;
  V.scene.add(ball);
  BOMB.fire = { ball, outer, inner };
  BOMB.group = g; BOMB.cv = cv; BOMB.ctx = cv.getContext("2d"); BOMB.tex = tex; BOMB.lcd = lcd; BOMB.led = led;
  bombDraw("--:--");
  addFrameHook(bombTick);
}

// 7セグ風に描く
const BOMB_SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g" };
function bombDraw(text) {
  if (BOMB.shown === text) return;
  BOMB.shown = text;
  const c = BOMB.ctx, W = 256, H = 96;
  c.fillStyle = "#120406"; c.fillRect(0, 0, W, H);
  const dw = 44, dh = 70, t = 8, y0 = 13;
  const xs = [14, 66, 140, 192];
  const seg = (x, y, on) => {
    const s = { a: [x + t, y, dw - 2 * t, t], d: [x + t, y + dh - t, dw - 2 * t, t], g: [x + t, y + dh / 2 - t / 2, dw - 2 * t, t],
      f: [x, y + t, t, dh / 2 - t], b: [x + dw - t, y + t, t, dh / 2 - t], e: [x, y + dh / 2, t, dh / 2 - t], c: [x + dw - t, y + dh / 2, t, dh / 2 - t] };
    return [s, on];
  };
  const chars = text.replace(":", "");
  for (let i = 0; i < 4; i++) {
    const on = BOMB_SEG[chars[i]] ?? "";
    const [s] = seg(xs[i], y0, on);
    for (const k of "abcdefg") {
      c.fillStyle = on.includes(k) ? "#ff3b2a" : "rgba(255,40,30,.08)";
      if (on.includes(k)) { c.shadowColor = "#ff2a1a"; c.shadowBlur = 10; } else c.shadowBlur = 0;
      c.fillRect(...s[k]);
    }
  }
  c.shadowBlur = 8; c.fillStyle = text.includes(":") ? "#ff3b2a" : "rgba(255,40,30,.08)";
  c.fillRect(124, 32, 8, 8); c.fillRect(124, 58, 8, 8);
  c.shadowBlur = 0;
  BOMB.tex.needsUpdate = true;
}

function bombFormat(sec) {
  const s = Math.max(0, Math.min(5999, sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// タイマーの数字が画面で何ピクセルの高さに見えているか (画面外なら 0)
function bombScreenHeight() {
  if (!BOMB.disp || !V.camera) return 0;
  const a = BOMB.disp.localToWorld(v3(0, .045, 0)).project(V.camera);
  const b = BOMB.disp.localToWorld(v3(0, -.045, 0)).project(V.camera);
  const inView = p => p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
  if (!inView(a) && !inView(b)) return 0;
  return Math.abs(a.y - b.y) / 2 * innerHeight;
}

function bombTick() {
  if (!BOMB.group) return;
  // 最前列中央が空席 (発表前) の間だけ装置を出し、名札は隠す。人が入ったら装置を消して名札を戻す
  const empty = hidden.has(BOMB.key);
  const show = empty && !BOMB.blown;
  if (BOMB.group.visible !== show) BOMB.group.visible = show;
  const pivot = V.seat[BOMB.key].pivot;
  if (pivot.visible === empty) pivot.visible = !empty;
  const now = performance.now();
  const dt = Math.min(.25, (now - (BOMB.last || now)) / 1000);
  BOMB.last = now;
  if (BOMB.state === "run") {
    // 表示している残り秒 (left) は飛ばさず、速さだけを変えて見積もり (goal) に寄せる。
    // 数字が読める大きさで映っている間はほとんど1秒ずつ (±12%)、映っていない・小さいときだけ大きく寄せる
    const goal = Math.max(0, (BOMB.target - now) / 1000);
    const err = BOMB.left - goal;
    // 数字の見える大きさで、速さを変えてよい幅を決める (大きく映るほど1秒ちょうどに近づける)
    const h = BOMB.group.visible ? bombScreenHeight() : 0;
    const lim = (BOMB.cover || h < 9) ? null : h < 20 ? .2 : .08;
    const rate = lim
      ? 1 + Math.max(-lim, Math.min(lim, err / Math.max(goal, 3)))
      : 1 + Math.max(-.9, Math.min(3, err / 1.2));
    BOMB.left = Math.max(0, BOMB.left - rate * dt);
    bombDraw(bombFormat(BOMB.videoAt + Math.ceil(BOMB.left - 1e-6)));
    BOMB.led.visible = (now % 1000) < 140;
  } else {
    BOMB.led.visible = false;
  }
}

/* ---------- 席替えの進み具合に合わせて動かす ---------- */
// 席替えを始めたとき。frontRound: 最前列中央が出る組の番号 (出ない回は -1)
function bombArm(frontRound) {
  if (!BOMB.group) return;
  BOMB.lcd.material.color.setHex(0x1a2420);
  BOMB.frontRound = frontRound;
  BOMB.blown = false;
  BOMB.cover = false;
  BOMB.roundStart = [];
  if (frontRound < 0) { BOMB.state = "idle"; bombDraw("--:--"); return; }
  BOMB.state = "run";
  BOMB.target = performance.now() + frontRound * BOMB.roundMs + BOMB.tailMs;
  BOMB.left = (BOMB.target - performance.now()) / 1000;
}
// 各組の発表を始めるとき。これまでの平均から残りを見積もり直す
function bombRound(r) {
  if (BOMB.state !== "run" || r > BOMB.frontRound) return;
  const now = performance.now();
  BOMB.roundStart[r] = now;
  const t0 = BOMB.roundStart[0];
  const avg = r > 0 ? (now - t0) / r : BOMB.roundMs;
  BOMB.target = now + (BOMB.frontRound - r) * avg + BOMB.tailMs;
}
// 最前列中央の組を始めるとき (候補提示の直前) と、前振りを始めるとき
function bombApproach(ms) { if (BOMB.state === "run") BOMB.target = performance.now() + ms; }
// 動画が終わったとき: 00:01 で止め、液晶を白く光らせる
function bombDefuse() {
  if (!BOMB.group) return;
  BOMB.state = "done";
  bombDraw("00:01");
  BOMB.lcd.material.color.setRGB(1.6, 1.7, 1.65);
}

// 最前列中央の名前カードが装置にぶつかった瞬間: 装置を消して爆発させる
function bombExplode() {
  if (!BOMB.group || BOMB.blown) return;
  const at = V.stage.worldToLocal(BOMB.group.getWorldPosition(v3()));
  BOMB.blown = true;
  BOMB.group.visible = false;
  sfx("boom", { rate: .85, vol: 1.7 });
  sfx("boom", { rate: .6, vol: 1.2, delay: .08 });
  shake(1.6);
  flashAt(at, hdr(0xff7a2a, 5), 7);
  // 火の玉がふくらんで消える
  const { ball, outer, inner } = BOMB.fire;
  ball.position.copy(BOMB.group.getWorldPosition(v3())).add(v3(0, .35, 0));
  ball.visible = true;
  tween(900, t => {
    const e = 1 - (1 - t) ** 3;
    ball.scale.setScalar(.25 + 2.6 * e);
    outer.material.opacity = 1.1 * (1 - t) ** 1.4;
    outer.material.color.setRGB(1.6, .55 - .3 * t, .12);
    inner.material.opacity = 1.3 * (1 - t) ** 3;
  }, ease.linear).then(() => { ball.visible = false; });
  // 画面全体のフラッシュをオレンジに
  const flash = document.getElementById("frontImpactFlash");
  if (flash) {
    flash.style.background = "radial-gradient(circle at 50% 55%, #fff4c8 0%, #ff8a2a 38%, #b32400 75%, #3a0800 100%)";
    setTimeout(() => { flash.style.background = ""; }, 900);
  }
  burst(at, [hdr(0xff4a12, 4.2), hdr(0xff9a2e, 4), hdr(0xffe2a0, 3.6)], 320, 7.5,
    { life: 1.1, size: .11, grav: .8, up: 1.1 });
  burst(at, [hdr(0xffd27a, 2.2), hdr(0xff6a1a, 1.6)], 140, 2.4,
    { life: 2.2, size: .16, grav: -.35, up: 1.6 });
}
