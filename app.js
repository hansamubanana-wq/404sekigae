"use strict";
/* =========================================================
   状態 / 保存 / ボタン
   (名簿と席の配置は students.js、3D は world.js、演出は show.js)
   ========================================================= */

let seats = createInitialSeats();
let locked = new Set();
let hidden = new Set();   // 発表待ちの席
let busy = false;
let seatMode = null;
const selectedSeats = new Set();
let replayScope = null;

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

const activeTweens = new Set();

function tween(ms, fn, e = ease.inOut) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const managed = worldReady;
    fn(e(0));   // 最初の状態をすぐ反映 (1コマだけ完成形が見えるのを防ぐ)
    function step(now) {
      try {
        const t = Math.min(1, Math.max(0, now - start) * TIME_SCALE / ms);
        fn(e(t));
        if (t >= 1) {
          activeTweens.delete(step);
          resolve();
        } else if (!managed) requestAnimationFrame(step);
      } catch (error) {
        activeTweens.delete(step);
        reject(error);
      }
    }
    if (managed) activeTweens.add(step);
    else requestAnimationFrame(step);
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
  updateSeatTools();
}

function seatIsLocked(key) {
  return locked.has(key) || (replayScope !== null && !replayScope.has(key));
}

function updateSeatTools() {
  const tools = document.getElementById("seatTools");
  const count = selectedSeats.size;
  tools.hidden = busy || !(document.body.classList.contains("ready") || document.body.classList.contains("fallback"));
  for (const button of tools.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === seatMode));
  }
  document.getElementById("seatActions").hidden = !seatMode;
  document.getElementById("clearSeatsBtn").hidden = !count;
  const run = document.getElementById("runSelectedBtn");
  run.hidden = seatMode !== "retry";
  run.disabled = count < 2;
  run.textContent = count ? `実行（${count}席）` : "実行";
}

function refreshSeatSelection(...keys) {
  if (worldReady) keys.forEach(seatLook);
  renderSheet();
  updateSeatTools();
}

function setSeatMode(mode) {
  const previous = [...selectedSeats];
  seatMode = mode;
  selectedSeats.clear();
  refreshSeatSelection(...previous);
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
        el.className = `seat ${s.gender}${seatIsLocked(key) ? " locked" : ""}${selectedSeats.has(key) ? " selected" : ""}`;
        el.innerHTML = `<span class="no">${s.no}</span><span class="kana">${s.kana}</span><span class="name">${s.name}</span>`;
        el.dataset.seat = key;
      }
      grid.appendChild(el);
    }
  }
}

function onSeatTap(key) {
  if (busy || !seatMode) return;
  soundUnlock();
  if (seatMode === "lock") {
    sfx(locked.has(key) ? "switch" : "toggle", { vol: .8 });
    locked.has(key) ? locked.delete(key) : locked.add(key);
    if (worldReady) tapPulse(key);
    refreshSeatSelection(key);
    return;
  }
  if (seatIsLocked(key)) return;
  if (selectedSeats.has(key)) {
    selectedSeats.delete(key);
  } else if (seatMode === "manual" && selectedSeats.size) {
    const [first] = selectedSeats;
    setSeatMode("manual");
    swapSeats(first, key);
    return;
  } else {
    selectedSeats.add(key);
  }
  sfx("toggle", { vol: .48 });
  refreshSeatSelection(key);
}

function bindSeatTaps(surface, seatAt) {
  let press = null;
  surface.addEventListener("pointerdown", e => {
    if (busy || !seatMode || !e.isPrimary || e.button !== 0) return;
    const key = seatAt(e.clientX, e.clientY);
    if (key) press = { key, mode: seatMode, id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
  });
  const moved = e => Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 10;
  surface.addEventListener("pointermove", e => {
    if (press?.id === e.pointerId && moved(e)) press = null;
  });
  surface.addEventListener("pointerup", e => {
    if (press?.id !== e.pointerId) return;
    const { key, mode } = press;
    const tap = !moved(e) && mode === seatMode && e.timeStamp - press.at < 550;
    press = null;
    if (tap) onSeatTap(key);
  });
  for (const event of ["pointercancel", "pointerleave"]) surface.addEventListener(event, e => {
    if (press?.id === e.pointerId) press = null;
  });
  surface.addEventListener("contextmenu", e => e.preventDefault());
}

async function swapSeats(key, other) {
  if (busy || key === other || locked.has(key) || locked.has(other)) return;
  const moves = [{ s: seats[key], from: key, key: other }, { s: seats[other], from: other, key }];
  const assign = () => { for (const move of moves) seats[move.key] = move.s; };

  soundUnlock();
  if (!worldReady) {
    assign();
    sfx("switch");
    renderSheet();
    return;
  }
  setBusy(true);
  try {
    await animateSeatReplay(moves, assign);
  } catch (error) {
    console.error(error);
  } finally {
    assign();
    hidden.clear();
    syncAllSeats();
    setBusy(false);
    renderSheet();
  }
}

/* ---------- 席替え ---------- */
async function shuffleSeats(scope = null) {
  if (busy) return;
  const movable = realSeatPositions.filter(pos => !locked.has(pos) && (!scope || scope.has(pos)));
  if (movable.length < (scope ? 2 : 1)) return;
  setSeatMode(null);

  const shuffled = shuffleArray(movable.map(pos => seats[pos]));
  movable.forEach((pos, i) => { seats[pos] = shuffled[i]; });

  if (!worldReady) { renderSheet(); return; }
  soundUnlock();
  sfx("click");
  frontRowPrime(movable);   // 最前列中央の動画を、ボタン操作の中で再生できる状態にしておく

  replayScope = scope;
  setBusy(true);
  try {
    V.fixedView = false;
    bgm("main");
    hidden = new Set(movable);
    if (scope) realSeatPositions.forEach(seatLook);
    lastIntro = lastFly = null;
    await showStart(movable);
    bgmPreload();
    updateStatus();
    const order = placeFrontRowLate(shuffleArray(movable));   // 最前列中央は最後の3人の中に
    const rounds = makeRounds(order);                           // 2人ずつの組 (最後は「最前列中央 + 2人」か「最後の1人」)
    const hasFront = order.includes(FRONT_ROW.key);
    const R = rounds.length;
    resetDecks();
    resetPairDeck(order.length);
    for (let r = 0; r < R; r++) {
      if (R >= 6 && r === Math.floor(R / 2)) await cutHalfway(hidden.size);
      if (!hasFront && R >= 4 && r === R - 2) await cutTension(hidden.size);
      const list = rounds[r].map(key => ({ s: seats[key], key }));
      if (list.some(x => x.key === FRONT_ROW.key)) {
        // 残り3人: 「ラスト3人…」→ 3人を見せる → 動画で最前列の中央を明かす → 残りの2人
        if (list.length >= 3) await cutTension(hidden.size);
        await announceFrontRow(FRONT_ROW.key, list.filter(x => x.key !== FRONT_ROW.key));
      } else if (r === R - 1 && R >= 3) {
        letterbox(true);
        await banner(list.length > 1 ? "最後の2人…" : "最後の1人…", 1500, "alert");
        letterbox(false);
        await announcePair(list, { intro: pick(["curtain", "warp", "search", "particles"]), travel: pick(["dive", "rockets", "meteorDrop", "spot"]) });
      } else {
        await announcePair(list);
      }
    }
    await showFinale();
  } catch (e) {
    console.error(e);
  } finally {
    bgmStop();
    if (worldReady) { endTension(); letterbox(false); V.camRig = null; V.billboard = false; setPlateDim(1); V.spotPower = 1; }
    hidden.clear();
    replayScope = null;
    syncAllSeats();
    setBusy(false);
    renderSheet();
  }
}

function resetSeats() {
  if (busy) return;
  setSeatMode(null);
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
  const sheet = document.getElementById("sheet");
  bindSeatTaps(sheet, (x, y) => {
    const seat = document.elementFromPoint(x, y)?.closest("[data-seat]");
    if (seat && sheet.contains(seat)) return seat.dataset.seat;
  });
  for (const button of document.querySelectorAll("#seatTools [data-mode]")) {
    button.addEventListener("click", () => { if (!busy) setSeatMode(button.dataset.mode); });
  }
  document.getElementById("clearSeatsBtn").addEventListener("click", () => { if (!busy) setSeatMode(seatMode); });
  document.getElementById("closeSeatModeBtn").addEventListener("click", () => { if (!busy) setSeatMode(null); });
  document.getElementById("runSelectedBtn").addEventListener("click", () => {
    if (seatMode === "retry") shuffleSeats(new Set(selectedSeats));
  });
  renderSheet();
  // 起動時に重い準備を全部済ませる (本番中に止まらないように)。ローディングは長くなってよい
  initWorld()
    .then(async () => {
      try { await warmUpShaders(); } catch (e) { console.warn(e); }
      try { frontRowPreload(); } catch {}
      await Promise.race([soundInit(), sleep(10000)]);   // 効果音の読み込みと変換
      V.renderer.setAnimationLoop(frame);
      document.body.classList.add("ready");
      updateSeatTools();
    })
    .catch(e => {
      console.error(e);
      document.body.classList.add("fallback");
      updateSeatTools();
    });
});
