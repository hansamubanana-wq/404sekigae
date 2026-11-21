"use strict";
/* =========================================================
   状態 / 保存 / ボタン
   (名簿と席の配置は students.js、3D は world.js、演出は show.js)
   ========================================================= */

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

/* ---------- 道具 ---------- */
// ?slow=0.2 で全体をスロー再生 (確認用)
const TIME_SCALE = Math.min(1, +new URLSearchParams(location.search).get("slow") || 1);
const sleep = ms => new Promise(r => setTimeout(r, ms / TIME_SCALE));
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
    fn(e(0));   // 最初の状態をすぐ反映 (1コマだけ完成形が見えるのを防ぐ)
    function step(now) {
      const t = Math.min(1, (now - start) * TIME_SCALE / ms);
      fn(e(t));
      if (t < 1) requestAnimationFrame(step); else res();
    }
    requestAnimationFrame(step);
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

/* ---------- 保存 / 読み込み ---------- */
function saveSeats() {
  const data = {
    seats: Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, v.no])),
    locked: [...locked],
  };
  try { localStorage.setItem("404seats", JSON.stringify(data)); } catch {}
  const btn = document.getElementById("saveBtn");
  btn.classList.add("done");
  sfx("save");
  setTimeout(() => btn.classList.remove("done"), 1300);
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

/* ---------- 画面 ---------- */
function updateStatus() {
  const el = document.getElementById("status");
  el.innerHTML = busy && hidden.size > 0 ? `のこり <b>${hidden.size}</b> 人` : "";
}

function setBusy(state) {
  busy = state;
  ["shuffleBtn", "saveBtn", "resetBtn", "printBtn"].forEach(id => {
    document.getElementById(id).disabled = state;
  });
  document.body.classList.toggle("busy", state);
  updateStatus();
}

// 印刷用 (3D が使えないときは画面にも出す) の座席表
function renderSheet() {
  const grid = document.getElementById("sheet");
  grid.innerHTML = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${row}-${col}`;
      const el = document.createElement("div");
      if (emptyPositions.has(key)) {
        el.className = "empty";
      } else {
        const s = seats[key];
        el.className = `seat ${s.gender}${locked.has(key) ? " locked" : ""}`;
        el.innerHTML = `<span class="no">${s.no}</span><span class="kana">${s.kana}</span><span class="name">${s.name}</span>`;
        el.onclick = () => onSeatTap(key);
      }
      grid.appendChild(el);
    }
  }
}

function onSeatTap(key) {
  if (busy) return;
  sfx(locked.has(key) ? "switch" : "toggle", { vol: .8 });
  locked.has(key) ? locked.delete(key) : locked.add(key);
  if (worldReady) { seatLook(key); tapPulse(key); }
  renderSheet();
}

/* ---------- 席替え ---------- */
async function shuffleSeats() {
  if (busy) return;
  const movable = realSeatPositions.filter(pos => !locked.has(pos));
  if (movable.length === 0) return;

  const shuffled = shuffleArray(movable.map(pos => seats[pos]));
  movable.forEach((pos, i) => { seats[pos] = shuffled[i]; });

  if (!worldReady) { renderSheet(); return; }
  sfx("click");
  frontRowPrime(movable);   // 最前列中央の動画を、ボタン操作の中で再生できる状態にしておく

  setBusy(true);
  try {
    hidden = new Set(movable);
    lastIntro = lastFly = null;
    await showStart(movable);
    updateStatus();
    const order = placeFrontRowLate(shuffleArray(movable));   // 最前列中央の動画は後ろから10番以内に
    const n = order.length;
    const prog = buildProgram(n);
    resetDecks();
    let i = 0;
    while (i < n) {
      const evs = prog[i] || [];
      for (const ev of evs) {
        if (ev.cut === "halfway") await cutHalfway(n - i);
        else if (ev.cut === "tension") await cutTension();
        else if (ev.cut) await CUTS[ev.cut]();
      }
      const mode = (evs.find(e => e.mode) || {}).mode;
      const item = j => ({ s: seats[order[j]], key: order[j] });
      // 最前列中央の席はまとめて発表するモードに入れない (動画の演出があるため)
      const hasFront = (a, b) => order.slice(a, b).includes(FRONT_ROW.key);
      if (order[i] === FRONT_ROW.key) {
        await announceFrontRow(order[i], i + 1, n);
        i++;
      } else if (mode === "double" && n - i >= 5 && !hasFront(i, i + 2)) {
        await announceDouble(item(i), item(i + 1), i + 1);
        i += 2;
      } else if (mode === "speed" && n - i >= 7 && !hasFront(i, i + 4)) {
        await speedRound([0, 1, 2, 3].map(d => item(i + d)), i + 1);
        i += 4;
      } else if (i === n - 1 && n >= 5) {
        letterbox(true);
        await banner("最後の1人…", 1800, "alert");
        letterbox(false);
        await announce(seats[order[i]], order[i], i + 1, n, {
          intro: pick(["search", "curtain", "warp"]),
          fly: pick(["meteorDrop", "spiral", "rocket"]),
        });
        i++;
      } else {
        await announce(seats[order[i]], order[i], i + 1, n);
        i++;
      }
    }
    await showFinale();
  } catch (e) {
    console.error(e);
  } finally {
    if (worldReady) { endTension(); letterbox(false); V.camRig = null; V.billboard = false; setPlateDim(1); V.spotPower = 1; }
    hidden.clear();
    syncAllSeats();
    setBusy(false);
    renderSheet();
  }
}

function resetSeats() {
  if (busy) return;
  sfx("down", { vol: .7 });
  seats = createInitialSeats();
  locked.clear();
  hidden.clear();
  if (worldReady) syncAllSeats();
  renderSheet();
}

/* ---------- 起動 ---------- */
loadSeats();
// ホーム画面に追加 (PWA) 用。オフラインでも開けるようにする
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
addEventListener("DOMContentLoaded", () => {
  renderSheet();
  initWorld()
    .then(() => document.body.classList.add("ready"))
    .catch(e => {
      console.error(e);
      document.body.classList.add("fallback");
    });
});
