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

/* ---------- 名前の登場 ---------- */
async function introPlain(card) {
  card.s = 0; card.apply();
  await card.to({ s: 1 }, 550, ease.back);
  await sleep(1300);
}

// スロット: ぐるぐる回って別人で止まり「…じゃなくて」で本人に
async function introSlot(card, student, label) {
  const others = studentsOriginal.filter(s => s !== student);
  const fake = pick(others);
  card.set(null, label);
  card.s = 0; card.apply();
  await card.to({ s: 1 }, 400, ease.back);

  card.el.classList.add("spin");
  let wait = 50;
  while (wait < 260) {
    card.set(pick(others));
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

/* ---------- 席への移動 ---------- */
async function flyPlain(card, key) {
  const w = card.el.offsetWidth;
  await card.to(seatTarget(key, w), 900, ease.inOut, 60);
}

// 着地フェイント: 違う席に降りかけて「…ではなく！」
async function flyDecoy(card, key) {
  const w = card.el.offsetWidth;
  const candidates = [...hidden].filter(k => k !== key);
  const pool = candidates.length ? candidates : realSeatPositions.filter(k => k !== key);
  const hops = Math.random() < .3 && pool.length > 1 ? 2 : 1;
  const decoys = shuffleArray(pool).slice(0, hops);

  for (let i = 0; i < decoys.length; i++) {
    const d = decoys[i];
    const t = seatTarget(d, w);
    await card.to(t, i === 0 ? 900 : 650, ease.inOut, i === 0 ? 60 : 110);
    const el = seatEl(d);
    el.classList.add("decoy");
    await sleep(700);
    const last = i === decoys.length - 1;
    bubble(last ? "…ではなく！" : pick(["ここ…？", "いや、ちがう！"]), t.x, t.y - 34, 900);
    await sleep(700);
    el.classList.remove("decoy");
  }
  await card.to(seatTarget(key, w), 650, ease.inOut, 130);
}

// 猫の乱入: 名前をくわえて走り回り、正しい席に落としていく
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

  const points = [
    { x: rand(W * .15, W * .85), y: rand(H * .3, H * .85) },
    { x: rand(W * .15, W * .85), y: rand(H * .3, H * .85) },
  ];
  for (const p of points) {
    cat.flip = p.x > cat.x ? -1 : 1;
    await cat.to(p, 650, ease.inOut, 0, carry);
  }

  cat.flip = goal.x > cat.x ? -1 : 1;
  await cat.to({ x: goal.x + (cat.flip < 0 ? -55 : 55), y: goal.y - 22 }, 700, ease.inOut, 0, carry);
  card.r = 0;
  await card.to({ x: goal.x, y: goal.y, s: goal.s }, 280, ease.out);

  const exitX = cat.x > W / 2 ? W + 120 : -120;
  cat.flip = exitX > cat.x ? -1 : 1;
  cat.to({ x: exitX, y: cat.y + 60 }, 900, ease.inOut).then(() => cat.remove());
}

/* ---------- 1人分の発表 ---------- */
// 演出の出やすさ(合計は自由)
const INTRO_WEIGHTS = { plain: 78, slot: 22 };
const FLY_WEIGHTS   = { plain: 50, decoy: 25, cat: 25 };

function weighted(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
  return entries[0][0];
}

async function announce(student, key, index, total) {
  const label = index === total ? "ラスト！" : `${index}人目`;
  const card = makeCard(student);
  card.set(student, label);

  stageOn(true);

  const intro = weighted(INTRO_WEIGHTS);
  const fly = weighted(FLY_WEIGHTS);

  if (intro === "slot") await introSlot(card, student, label);
  else await introPlain(card);

  stageOn(false);
  if (fly === "decoy") await flyDecoy(card, key);
  else if (fly === "cat") await flyCat(card, key);
  else await flyPlain(card, key);

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
