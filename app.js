let seats = createInitialSeats();
let locked = new Set();
let hidden = new Set();   // 発表待ちの席
let busy = false;

function createSeatPositionsColumnFirst() {
  const positions = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const key = `${row}-${col}`;
      if (!emptyPositions.has(key)) positions.push(key);
    }
  }
  return positions;
}

const realSeatPositions = createSeatPositionsColumnFirst();

if (realSeatPositions.length !== studentsOriginal.length) {
  console.warn(`席の数(${realSeatPositions.length})と生徒の数(${studentsOriginal.length})が合っていません`);
}

function createInitialSeats() {
  const result = {};
  const sorted = [...studentsOriginal].sort((a, b) => a.no - b.no);
  const positions = createSeatPositionsColumnFirst();
  sorted.forEach((student, i) => { result[positions[i]] = student; });
  return result;
}

/* ---------- 保存 / 読み込み ---------- */
function saveSeats() {
  const data = {
    seats: Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, v.no])),
    locked: [...locked],
  };
  try { localStorage.setItem("404seats", JSON.stringify(data)); } catch {}
  const btn = document.getElementById("saveBtn");
  const orig = btn.textContent;
  btn.textContent = "保存済！";
  setTimeout(() => { btn.textContent = orig; }, 1200);
}

function loadSeats() {
  try {
    const raw = localStorage.getItem("404seats");
    if (!raw) return;
    const data = JSON.parse(raw);
    const byNo = Object.fromEntries(studentsOriginal.map(s => [s.no, s]));
    const loaded = {};
    for (const pos of realSeatPositions) {
      const s = byNo[data.seats[pos]];
      if (!s) return;               // 席の配置が変わる前の古いデータは使わない
      loaded[pos] = s;
    }
    if (new Set(Object.values(loaded)).size !== realSeatPositions.length) return;
    seats = loaded;
    locked = new Set((data.locked || []).filter(k => realSeatPositions.includes(k)));
  } catch {}
}

/* ---------- 描画 ---------- */
function seatHTML(s, key) {
  return `
    <div class="no">404-${s.no}</div>
    <div class="kana">${s.kana}</div>
    <div class="name">${s.name}</div>
    <div class="lock">${locked.has(key) ? "🔒" : ""}</div>`;
}

function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${row}-${col}`;

      if (emptyPositions.has(key)) {
        const el = document.createElement("div");
        el.className = "empty";
        grid.appendChild(el);
        continue;
      }

      const s = seats[key];
      const seat = document.createElement("div");
      seat.dataset.key = key;

      if (hidden.has(key)) {
        seat.className = "seat hidden";
      } else {
        seat.className = `seat ${s.gender}`;
        if (locked.has(key)) seat.classList.add("locked");
        seat.innerHTML = seatHTML(s, key);
      }

      seat.onclick = () => {
        if (busy) return;
        locked.has(key) ? locked.delete(key) : locked.add(key);
        render();
      };

      grid.appendChild(seat);
    }
  }
  updateStatus();
}

function seatEl(key) {
  return document.querySelector(`.seat[data-key="${key}"]`);
}

function revealSeat(key) {
  hidden.delete(key);
  const el = seatEl(key);
  const s = seats[key];
  el.className = `seat ${s.gender} flash`;
  if (locked.has(key)) el.classList.add("locked");
  el.innerHTML = seatHTML(s, key);
  updateStatus();
}

function updateStatus() {
  const el = document.getElementById("status");
  if (busy && hidden.size > 0) {
    el.innerHTML = `のこり<b>${hidden.size}</b>人`;
  } else if (!busy) {
    el.textContent = "席をクリックすると 🔒 固定できます";
  } else {
    el.textContent = "";
  }
}

function setBusy(state) {
  busy = state;
  ["shuffleBtn", "saveBtn", "resetBtn", "printBtn"].forEach(id => {
    document.getElementById(id).disabled = state;
  });
  updateStatus();
}

/* ---------- アニメーションの道具 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const ease = {
  linear: t => t,
  in: t => t * t * t,
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

function tween(ms, fn, e = ease.inOut) {
  return new Promise(res => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      fn(e(t));
      if (t < 1) requestAnimationFrame(frame); else res();
    }
    requestAnimationFrame(frame);
  });
}

function shuffleArray(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 画面上を動く要素(名前カード・猫)。x,y は中心座標 */
class Sprite {
  constructor(el) {
    this.el = el; this.x = innerWidth / 2; this.y = innerHeight / 2; this.s = 1; this.r = 0; this.flip = 1;
    document.body.appendChild(el);
    this.apply();
  }
  apply() {
    this.el.style.transform =
      `translate(${this.x}px, ${this.y}px) translate(-50%, -50%) rotate(${this.r}deg) scale(${this.s * this.flip}, ${this.s})`;
  }
  async to({ x = this.x, y = this.y, s = this.s, r = this.r }, ms, e = ease.inOut, arc = 0, onFrame) {
    const x0 = this.x, y0 = this.y, s0 = this.s, r0 = this.r;
    await tween(ms, t => {
      this.x = x0 + (x - x0) * t;
      this.y = y0 + (y - y0) * t - arc * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
      this.s = s0 + (s - s0) * t;
      this.r = r0 + (r - r0) * t;
      this.apply();
      onFrame && onFrame();
    }, e);
  }
  async path(ms, fn, e = ease.inOut, onFrame) {
    await tween(ms, t => {
      Object.assign(this, fn(t));
      this.apply();
      onFrame && onFrame();
    }, e);
  }
  remove() { this.el.remove(); }
}

function seatTarget(key, cardWidth) {
  const r = seatEl(key).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: Math.min(r.width / cardWidth, .5) };
}

function makeCard(student) {
  const el = document.createElement("div");
  el.className = `flycard ${student.gender}`;
  el.innerHTML = `<div class="fc-label"></div><div class="fc-kana"></div><div class="fc-name"></div>`;
  const card = new Sprite(el);
  card.set = (s, label) => {
    el.classList.remove("boy", "girl", "neutral");
    el.classList.add(s ? s.gender : "neutral");
    el.querySelector(".fc-kana").textContent = s ? s.kana : "";
    el.querySelector(".fc-name").textContent = s ? s.name : "？？？";
    if (label !== undefined) el.querySelector(".fc-label").textContent = label;
  };
  card.set(student);
  return card;
}

function bubble(text, x, y, ms = 1100) {
  const el = document.createElement("div");
  el.className = "bubble";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

async function banner(text, ms) {
  const el = document.createElement("div");
  el.className = "banner";
  el.innerHTML = `<div class="big">${text}</div>`;
  document.body.appendChild(el);
  await sleep(ms);
  el.remove();
}

function stageOn(on) {
  document.getElementById("stage").classList.toggle("on", on);
}

/* ---------- 補助 ---------- */
function seatCenter(key) {
  const r = seatEl(key).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// まだ発表されていない(＝決まっていない)席。今発表中の席は除く
function pendingOthers(key) {
  return [...hidden].filter(k => k !== key);
}

// from から遠い席を n 個(遠い方から4割の中からランダム)
function farSeats(fromKey, pool, n) {
  const c = seatCenter(fromKey);
  const sorted = [...pool].sort((a, b) => dist(seatCenter(b), c) - dist(seatCenter(a), c));
  const top = sorted.slice(0, Math.max(n, Math.ceil(sorted.length * .4)));
  return shuffleArray(top).slice(0, n);
}

function actor(emoji, x, y, size) {
  const el = document.createElement("div");
  el.className = "emoji-actor";
  if (size) el.style.fontSize = `${size}px`;
  el.innerHTML = `<span>${emoji}</span>`;
  const a = new Sprite(el);
  a.x = x; a.y = y; a.apply();
  return a;
}

function makeBeam() {
  const el = document.createElement("div");
  el.className = "beam";
  document.body.appendChild(el);
  return {
    set(x, y1, y2) {
      el.style.left = `${x}px`;
      el.style.top = `${y1}px`;
      el.style.height = `${Math.max(0, y2 - y1)}px`;
    },
    remove() { el.remove(); },
  };
}

/* ---------- 名前の登場 ---------- */
async function introPlain(card) {
  card.s = 0; card.apply();
  await card.to({ s: 1 }, 550, ease.back);
  await sleep(1300);
}

// スロット: ぐるぐる回って別人で止まり「…じゃなくて」で本人に
// 別人として出てくるのは、まだ決まっていない人だけ
async function introSlot(card, student, label, pool) {
  const fake = pick(pool);
  card.set(null, label);
  card.s = 0; card.apply();
  await card.to({ s: 1 }, 400, ease.back);

  card.el.classList.add("spin");
  const spinPool = [student, ...pool];
  let wait = 50;
  while (wait < 260) {
    card.set(pick(spinPool));
    await sleep(wait);
    wait *= 1.13;
  }
  card.el.classList.remove("spin");
  card.set(fake);
  await sleep(1100);

  bubble("…じゃなくて", card.x, card.y - 150, 1000);
  card.el.classList.add("shake");
  await sleep(750);
  card.el.classList.remove("shake");
  await card.to({ s: .85 }, 150, ease.out);
  card.set(student, label);
  await card.to({ s: 1.05 }, 260, ease.back);
  await card.to({ s: 1 }, 150);
  await sleep(1100);
}

// 逆さまで出てきて「あれ？」→ くるっと戻る
async function introFlip(card) {
  card.s = 0; card.r = 180; card.apply();
  await card.to({ s: 1 }, 500, ease.back);
  await sleep(900);
  bubble("あれ？", card.x, card.y - 150, 900);
  await sleep(700);
  await card.to({ r: 360 }, 700, ease.back);
  card.r = 0; card.apply();
  await sleep(1000);
}

// 1文字ずつ焦らして出す
async function introTyping(card, student) {
  const nameEl = card.el.querySelector(".fc-name");
  const kanaEl = card.el.querySelector(".fc-kana");
  const chars = [...student.name];
  nameEl.textContent = "";
  kanaEl.textContent = "";
  card.s = 0; card.apply();
  await card.to({ s: 1 }, 400, ease.back);
  await sleep(500);
  for (let i = 0; i < chars.length; i++) {
    if (i === chars.length - 1) {
      bubble("…", card.x, card.y - 150, 1200);
      await sleep(1400);
    }
    nameEl.textContent += chars[i];
    await sleep(chars[i] === " " ? 150 : 450);
  }
  kanaEl.textContent = student.kana;
  await card.to({ s: 1.08 }, 180, ease.out);
  await card.to({ s: 1 }, 200, ease.back);
  await sleep(1000);
}

/* ---------- 席への移動 ---------- */
async function flyPlain(card, key) {
  const w = card.el.offsetWidth;
  await card.to(seatTarget(key, w), 900, ease.inOut, 60);
}

// 着地フェイント: 遠くの違う席に降りかけて「…ではなく！」
async function flyDecoy(card, key) {
  const w = card.el.offsetWidth;
  const pool = pendingOthers(key);
  const decoys = [farSeats(key, pool, 1)[0]];
  if (Math.random() < .35 && pool.length > 1) {
    decoys.push(farSeats(decoys[0], pool.filter(k => k !== decoys[0]), 1)[0]);
  }

  for (let i = 0; i < decoys.length; i++) {
    const d = decoys[i];
    const t = seatTarget(d, w);
    await card.to(t, i === 0 ? 1000 : 900, ease.inOut, i === 0 ? 140 : 220);
    const el = seatEl(d);
    el.classList.add("decoy");
    await sleep(700);
    const last = i === decoys.length - 1;
    bubble(last ? "…ではなく！" : pick(["ここ…？", "いや、ちがう！"]), t.x, t.y - 34, 900);
    await sleep(700);
    el.classList.remove("decoy");
  }
  await card.to(seatTarget(key, w), 900, ease.inOut, 240);
}

// 猫の乱入: 名前をくわえて画面中を走り回り、正しい席に落としていく
async function flyCat(card, key) {
  const w = card.el.offsetWidth;
  const H = innerHeight, W = innerWidth;

  const goal = seatTarget(key, w);
  const mid = { x: (card.x + goal.x) / 2, y: (card.y + goal.y) / 2 + 40, s: .42 };
  await card.to(mid, 700, ease.out);

  const fromLeft = mid.x > W / 2;
  const catEl = document.createElement("div");
  catEl.className = "cat";
  catEl.innerHTML = "<span>🐈</span>";
  const cat = new Sprite(catEl);
  cat.x = fromLeft ? -80 : W + 80;
  cat.y = mid.y + 40;
  cat.flip = fromLeft ? -1 : 1;    // 🐈 は左向きなので、右へ走るときは反転
  cat.apply();

  bubble("！？", card.x, card.y - 70, 800);
  await cat.to({ x: mid.x + (fromLeft ? -60 : 60), y: mid.y + 30 }, 900, ease.out);
  bubble("ニャッ", cat.x, cat.y - 60, 800);
  await sleep(300);

  const carry = () => {
    card.x = cat.x + (cat.flip < 0 ? 55 : -55);
    card.y = cat.y + 22;
    card.r = Math.sin(performance.now() / 70) * 8;
    card.apply();
  };
  card.s = .34; carry();

  // 画面の端から端まで走り回る
  let side = cat.x < W / 2 ? 1 : 0;
  const n = Math.random() < .5 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const p = {
      x: side ? rand(W * .78, W * .92) : rand(W * .08, W * .22),
      y: rand(H * .22, H * .88),
    };
    side = 1 - side;
    cat.flip = p.x > cat.x ? -1 : 1;
    await cat.to(p, 750, ease.inOut, 0, carry);
  }

  cat.flip = goal.x > cat.x ? -1 : 1;
  await cat.to({ x: goal.x + (cat.flip < 0 ? -55 : 55), y: goal.y - 22 }, 800, ease.inOut, 0, carry);
  card.r = 0;
  await card.to({ x: goal.x, y: goal.y, s: goal.s }, 280, ease.out);

  const exitX = cat.x > W / 2 ? W + 120 : -120;
  cat.flip = exitX > cat.x ? -1 : 1;
  cat.to({ x: exitX, y: cat.y + 60 }, 900, ease.inOut).then(() => cat.remove());
}

// UFO: 名前を吸い上げて連れ去り、遠回りして席の上から降ろす
async function flyUfo(card, key) {
  const w = card.el.offsetWidth;
  const W = innerWidth, H = innerHeight;
  const goal = seatTarget(key, w);

  await card.to({ x: rand(W * .3, W * .7), y: H * .62, s: .42 }, 700, ease.out);

  const ufo = actor("🛸", card.x, -120, 120);
  bubble("！？", card.x, card.y - 70, 900);
  await ufo.to({ y: Math.max(90, card.y - 260) }, 1000, ease.out);

  const beam = makeBeam();
  beam.set(ufo.x, ufo.y + 30, card.y + 50);
  await sleep(400);
  await card.path(1200, t => ({
    y: card.y + (ufo.y + 20 - card.y) * t,
    x: ufo.x + Math.sin(t * Math.PI * 4) * 30 * (1 - t),
    s: .42 * (1 - t * .8),
    r: Math.sin(t * Math.PI * 6) * 15,
  }), ease.in, () => beam.set(ufo.x, ufo.y + 30, card.y + 50));
  card.el.style.opacity = "0";
  beam.set(0, 0, 0);

  // 遠回りしてから、席の上へ
  const far = { x: goal.x < W / 2 ? W * .85 : W * .15, y: rand(90, 200) };
  await ufo.to(far, 900, ease.inOut, 60);
  await ufo.to({ x: goal.x, y: Math.max(80, goal.y - 240) }, 1000, ease.inOut, 60);

  card.x = ufo.x; card.y = ufo.y + 20; card.s = .08; card.r = 0; card.apply();
  card.el.style.opacity = "1";
  await card.to({ x: goal.x, y: goal.y, s: goal.s }, 1000, ease.out, 0,
    () => beam.set(ufo.x, ufo.y + 30, card.y + 40));
  beam.remove();
  ufo.to({ y: -160, r: 20 }, 800, ease.in).then(() => ufo.remove());
}

// 強風: 画面の外まで吹き飛ばされ、木の葉みたいにひらひら戻ってくる
async function flyWind(card, key) {
  const w = card.el.offsetWidth;
  const W = innerWidth, H = innerHeight;
  const goal = seatTarget(key, w);
  const toRight = Math.random() < .5;

  const wind = actor("🌬️", toRight ? -100 : W + 100, card.y, 130);
  wind.flip = toRight ? -1 : 1;
  wind.apply();
  await wind.to({ x: toRight ? 110 : W - 110 }, 500, ease.out);
  bubble("ビュオォォ！", wind.x, wind.y - 80, 1100);

  const x0 = card.x, y0 = card.y;
  await card.path(1300, t => ({
    x: x0 + ((toRight ? W + 500 : -500) - x0) * t,
    y: y0 + Math.sin(t * Math.PI * 3) * 120 - t * 120,
    s: 1 - t * .5,
    r: t * (toRight ? 900 : -900),
  }), ease.in);
  wind.to({ x: toRight ? -140 : W + 140 }, 500).then(() => wind.remove());
  await sleep(900);

  // 上からひらひら
  bubble("…", W / 2, 120, 800);
  await sleep(600);
  await card.path(2600, t => ({
    x: goal.x + Math.sin(t * Math.PI * 3.5) * W * .3 * (1 - t),
    y: -160 + (goal.y + 160) * t,
    s: .45 + (goal.s - .45) * t,
    r: Math.sin(t * Math.PI * 7) * 30 * (1 - t),
  }), ease.linear);
  card.r = 0; card.apply();
}

// 分身の術: 3枚に分かれて別々の席へ。本物以外はドロン
async function flyClone(card, key) {
  const w = card.el.offsetWidth;
  const W = innerWidth, H = innerHeight;
  const decoys = farSeats(key, pendingOthers(key), 2);

  await card.to({ x: W / 2, y: H * .55, s: .5 }, 600, ease.out);
  bubble("分身の術！", card.x, card.y - 90, 1100);

  const clones = [0, 1].map(() => {
    const c = makeCard(card.student);
    c.set(card.student, card.el.querySelector(".fc-label").textContent);
    c.x = card.x; c.y = card.y; c.s = card.s; c.apply();
    return c;
  });
  await Promise.all([
    clones[0].to({ x: card.x - 300 }, 450, ease.back),
    clones[1].to({ x: card.x + 300 }, 450, ease.back),
  ]);
  await sleep(500);

  // 3枚をシャッフルしてから、それぞれの席へ
  const all = shuffleArray([card, ...clones]);
  const spots = [W / 2 - 300, W / 2, W / 2 + 300];
  for (let k = 0; k < 2; k++) {
    const order = shuffleArray(spots);
    await Promise.all(all.map((c, i) => c.to({ x: order[i] }, 420, ease.inOut, k % 2 ? -90 : 90)));
  }

  const targets = [key, ...decoys];
  await Promise.all([card, ...clones].map((c, i) =>
    c.to(seatTarget(targets[i], w), 1000, ease.inOut, 120 + i * 40)));
  bubble("どれが本物？", W / 2, 90, 1300);
  await sleep(1500);

  for (const c of shuffleArray(clones)) {
    bubble("ドロン", c.x, c.y - 30, 700);
    await c.to({ s: 0, r: 180 }, 350, ease.in);
    c.remove();
    await sleep(600);
  }
}

// 行きすぎ: 勢いあまって画面の外へ → そろ〜りと戻ってくる
async function flyOvershoot(card, key) {
  const w = card.el.offsetWidth;
  const W = innerWidth, H = innerHeight;
  const goal = seatTarget(key, w);
  let dx = goal.x - card.x, dy = goal.y - card.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const far = { x: goal.x + dx * (W + H), y: goal.y + dy * (W + H) };

  await card.to({ ...far, s: .45, r: dx > 0 ? 40 : -40 }, 900, ease.in);
  bubble("行きすぎ！", goal.x, goal.y - 34, 1100);
  await sleep(1200);

  const back = { x: goal.x + dx * 260, y: goal.y + dy * 260 };
  card.r = 0;
  await card.to({ ...back, s: goal.s }, 900, ease.out);
  bubble("そろ〜り", card.x, card.y - 40, 1000);
  await card.to({ x: goal.x, y: goal.y }, 1300, ease.inOut);
}

// 居眠り: 途中で寝てしまい、目覚ましで飛び起きてダッシュ
async function flySleep(card, key) {
  const w = card.el.offsetWidth;
  const goal = seatTarget(key, w);
  const H = innerHeight;

  await card.to({ x: card.x + (goal.x - card.x) * .4, y: Math.min(H * .7, card.y + (goal.y - card.y) * .4), s: .5 }, 1000, ease.out);
  await card.to({ r: 25, y: card.y + 25 }, 900, ease.inOut);
  for (let i = 0; i < 3; i++) {
    bubble("💤", card.x + 80 + i * 20, card.y - 60 - i * 30, 900);
    await sleep(700);
  }
  const clock = actor("⏰", card.x - 140, card.y - 40, 80);
  bubble("ジリリリリ！", clock.x, clock.y - 50, 1000);
  const y0 = card.y;
  await card.path(700, t => ({ r: 25 * (1 - t) + Math.sin(t * 40) * 8, y: y0 - 50 * Math.sin(t * Math.PI) }), ease.linear);
  clock.remove();
  card.r = 0;
  bubble("やばっ", card.x, card.y - 70, 700);
  await sleep(300);
  await card.to(goal, 450, ease.out);
}

/* ---------- 1人分の発表 ---------- */
// 演出の出やすさ(合計は自由)。plain = 演出なしでそのまま
const INTRO_WEIGHTS = { plain: 60, slot: 16, flip: 12, typing: 12 };
const FLY_WEIGHTS = { plain: 38, decoy: 12, cat: 10, ufo: 9, wind: 8, clone: 9, overshoot: 7, sleep: 7 };

// その演出に必要な「まだ決まっていない席」の数
const FLY_NEEDS = { decoy: 1, clone: 2 };

function weighted(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
  return entries[0][0];
}

let lastIntro = null, lastFly = null;

function chooseIntro(pendingCount) {
  const w = { ...INTRO_WEIGHTS };
  if (pendingCount < 1) delete w.slot;
  if (lastIntro !== "plain") delete w[lastIntro];
  return (lastIntro = weighted(w));
}

function chooseFly(pendingCount) {
  const w = { ...FLY_WEIGHTS };
  for (const [k, n] of Object.entries(FLY_NEEDS)) if (pendingCount < n) delete w[k];
  if (lastFly !== "plain") delete w[lastFly];
  return (lastFly = weighted(w));
}

const FLY = { plain: flyPlain, decoy: flyDecoy, cat: flyCat, ufo: flyUfo, wind: flyWind, clone: flyClone, overshoot: flyOvershoot, sleep: flySleep };

async function announce(student, key, index, total) {
  const label = index === total ? "ラスト！" : `${index}人目`;
  const card = makeCard(student);
  card.student = student;
  card.set(student, label);

  const others = pendingOthers(key);
  const intro = chooseIntro(others.length);
  const fly = chooseFly(others.length);

  stageOn(true);
  if (intro === "slot") await introSlot(card, student, label, others.map(k => seats[k]));
  else if (intro === "flip") await introFlip(card);
  else if (intro === "typing") await introTyping(card, student);
  else await introPlain(card);
  stageOn(false);

  await FLY[fly](card, key);

  revealSeat(key);
  card.el.style.transition = "opacity .25s";
  card.el.style.opacity = "0";
  await sleep(260);
  card.remove();
  await sleep(450);
}

/* ---------- 席替え ---------- */
async function shuffleSeats() {
  if (busy) return;

  const movablePositions = realSeatPositions.filter(pos => !locked.has(pos));
  if (movablePositions.length === 0) return;

  const movableStudents = movablePositions.map(pos => seats[pos]);
  const shuffled = shuffleArray(movableStudents);
  movablePositions.forEach((pos, i) => { seats[pos] = shuffled[i]; });

  hidden = new Set(movablePositions);
  lastIntro = lastFly = null;
  setBusy(true);
  render();

  stageOn(true);
  await banner("席替え、スタート！", 1500);
  stageOn(false);
  await sleep(300);

  const order = shuffleArray(movablePositions);
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    await announce(seats[key], key, i + 1, order.length);
  }

  launchConfetti();
  await banner("🎊 全員決定！ 🎊", 2200);

  setBusy(false);
  render();
}

function launchConfetti() {
  const colors = ["#38bdf8", "#f472b6", "#fbbf24", "#a78bfa", "#34d399", "#ffffff"];
  for (let i = 0; i < 140; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    const size = 7 + Math.random() * 8;
    el.style.cssText = [
      `left:${Math.random() * 100}vw`,
      `background:${colors[i % colors.length]}`,
      `width:${size}px`,
      `height:${size * (Math.random() < .5 ? 1 : .5)}px`,
      `animation-delay:${Math.random() * .6}s`,
      `animation-duration:${1.4 + Math.random() * 1.2}s`,
    ].join(";");
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }
}

function resetSeats() {
  if (busy) return;
  seats = createInitialSeats();
  locked.clear();
  hidden.clear();
  render();
}

loadSeats();
render();
