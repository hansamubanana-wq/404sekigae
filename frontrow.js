"use strict";
/* =========================================================
   最前列中央の席の特別演出
   完成動画 media/the_front_row.mp4 (20.000秒 / 1280×720 / 24fps) を流し、
   18.5秒から白紙の中央に当選者の名前を重ねて、終了画面まで残す。
   ・名前は再生位置で決める: 18.5秒以上なら表示、未満 (シーク・最初から) なら隠す
   ・スキップ / 再生失敗のときは、そのまま既存の結果表示 (announce) へ進む
   ========================================================= */

const FRONT_ROW = {
  key: `0-${(cols - 1) / 2}`,  // 最前列 (教卓側の1列目) の中央の席
  src: "media/the_front_row.mp4",
  nameAt: 18.5,               // 名前を出し始める秒
  x: .505, y: .475,           // 白紙の中心 (映像の矩形に対する割合)
  maxW: .40,                  // 名前の最大幅 (映像の幅に対する割合)
  startTimeout: 10000,        // これまでに再生が始まらなければ失敗扱い (ミリ秒)
  autoNext: 6000,             // 終了画面のあと、自動で結果へ進むまで (ミリ秒)
};

let FR = null;

function frontRowDom() {
  if (FR) return FR;
  const root = document.createElement("div");
  root.className = "frontrow";
  root.hidden = true;
  root.innerHTML = `
    <video class="fr-video" playsinline webkit-playsinline preload="none" disablepictureinpicture></video>
    <div class="fr-name" aria-live="polite"></div>
    <div class="fr-bar">
      <button class="fr-btn fr-play" aria-label="再生・一時停止">
        <svg class="i-pause" viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>
        <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>
      </button>
      <button class="fr-btn fr-restart" aria-label="最初から">
        <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <input class="fr-seek" type="range" min="0" max="20" step="0.01" value="0" aria-label="再生位置" />
      <span class="fr-time">0:00 / 0:20</span>
      <button class="fr-btn fr-sound" aria-label="音を出す" hidden>音を出す</button>
      <button class="fr-text fr-skip">スキップ</button>
      <button class="fr-text fr-next" hidden>結果へ</button>
    </div>`;
  document.body.appendChild(root);
  const q = s => root.querySelector(s);
  FR = {
    root, video: q(".fr-video"), name: q(".fr-name"), seek: q(".fr-seek"), time: q(".fr-time"),
    play: q(".fr-play"), restart: q(".fr-restart"), sound: q(".fr-sound"), skip: q(".fr-skip"), next: q(".fr-next"),
  };
  return FR;
}

// 席替えスタートのボタンを押した瞬間 (ユーザー操作の中) に呼ぶ。
// iPad / iPhone では、操作の中で一度 play() しておかないと、あとで音付きで再生できないため
function frontRowPrime(movable) {
  if (!movable.includes(FRONT_ROW.key)) return;
  const v = frontRowDom().video;
  try {
    if (!v.getAttribute("src")) v.src = FRONT_ROW.src;
    v.preload = "auto";
    v.muted = false;
    const p = v.play();
    v.pause();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

// 映像が実際に映っている矩形 (黒帯を除く)
function frontRowRect() {
  const { video } = FR;
  const box = video.getBoundingClientRect();
  const ar = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : 16 / 9;
  let w = box.width, h = box.width / ar;
  if (h > box.height) { h = box.height; w = h * ar; }
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}

// 名前を白紙の中心に置き、幅が映像の 40% に収まるよう文字の大きさを合わせる
function frontRowLayoutName() {
  const r = frontRowRect(), el = FR.name;
  el.style.left = `${r.left + r.width * FRONT_ROW.x}px`;
  el.style.top = `${r.top + r.height * FRONT_ROW.y}px`;
  let fs = r.height * .1;
  el.style.fontSize = `${fs}px`;
  const maxW = r.width * FRONT_ROW.maxW;
  const w = el.scrollWidth;
  if (w > maxW) { fs *= maxW / w; el.style.fontSize = `${fs}px`; }
  el.style.maxWidth = `${maxW}px`;
}

const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// 再生位置から名前の表示を決める (18.5秒未満なら必ず隠す)
function frontRowSync(t) {
  if (!FR) return;
  FR.name.classList.toggle("on", t >= FRONT_ROW.nameAt - .001);
}

// 戻り値: "done" (最後まで見た / 結果へ) | "skipped" | "failed"
function playFrontRow(student) {
  const d = frontRowDom(), v = d.video;
  return new Promise(resolve => {
    let finished = false, started = false, autoTimer = 0, startTimer = 0, raf = 0, vfc = 0, seekingByUser = false;
    const on = [];
    const listen = (el, ev, fn) => { el.addEventListener(ev, fn); on.push([el, ev, fn]); };

    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(autoTimer); clearTimeout(startTimer); cancelAnimationFrame(raf);
      if (vfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfc);
      on.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
      try { v.pause(); } catch {}
      d.root.classList.remove("on");
      d.name.classList.remove("on");
      setTimeout(() => { d.root.hidden = true; }, 450);
      if (typeof V === "object" && V) V.renderHold = false;
      resolve(result);
    };

    // 準備
    d.name.textContent = student.name;
    d.name.classList.remove("on");
    d.next.hidden = true;
    d.sound.hidden = true;
    d.root.classList.remove("ended", "paused");
    d.root.hidden = false;
    requestAnimationFrame(() => d.root.classList.add("on"));
    if (typeof V === "object" && V) V.renderHold = true;   // 裏の3Dを止めて動画を滑らかに
    frontRowLayoutName();

    const updateUi = () => {
      const t = v.currentTime || 0, dur = v.duration || 20;
      if (!seekingByUser) d.seek.value = t;
      d.seek.max = dur;
      d.time.textContent = `${fmtTime(t)} / ${fmtTime(dur)}`;
      d.root.classList.toggle("paused", v.paused);
    };
    // 名前の表示は「実際に画面に出たコマの時刻」で決める (コマ単位で正確)。
    // 使えないブラウザでは再生位置 (currentTime) で決める。2つを混ぜると境目でちらつくので、どちらか一方だけ
    const hasVfc = !!v.requestVideoFrameCallback;
    const tick = () => {
      if (!hasVfc) frontRowSync(v.currentTime || 0);
      updateUi();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    if (hasVfc) {
      const onFrame = (now, meta) => {
        if (!v.seeking) frontRowSync(meta.mediaTime);   // シーク中に届いた古いコマは無視
        vfc = v.requestVideoFrameCallback(onFrame);
      };
      vfc = v.requestVideoFrameCallback(onFrame);
    }

    // 失敗 → 既存の結果表示へ
    listen(v, "error", () => finish("failed"));
    startTimer = setTimeout(() => { if (!started) finish("failed"); }, FRONT_ROW.startTimeout);
    listen(v, "playing", () => { started = true; });

    // 名前の表示を再生位置に合わせる
    // シークした瞬間は移動先の位置で決める (18.5秒より前に戻ったらすぐ隠す)
    ["seeking", "seeked"].forEach(ev => listen(v, ev, () => { frontRowSync(v.currentTime); updateUi(); }));
    ["timeupdate", "play", "pause"].forEach(ev => listen(v, ev, () => { if (!hasVfc) frontRowSync(v.currentTime); updateUi(); }));
    listen(v, "loadedmetadata", frontRowLayoutName);
    listen(window, "resize", frontRowLayoutName);
    listen(window, "orientationchange", () => setTimeout(frontRowLayoutName, 300));

    // 終了画面: 名前を残したまま「結果へ」を出し、少し待って自動で進む
    listen(v, "ended", () => {
      frontRowSync(v.duration || 20);
      d.root.classList.add("ended");
      d.next.hidden = false;
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => finish("done"), FRONT_ROW.autoNext);
    });
    listen(v, "play", () => { clearTimeout(autoTimer); d.root.classList.remove("ended"); d.next.hidden = true; });

    // 操作バー: 触ったら数秒だけ出す (再生中は字幕の邪魔をしない)
    let uiTimer = 0;
    const showUi = () => {
      d.root.classList.add("ui");
      clearTimeout(uiTimer);
      uiTimer = setTimeout(() => d.root.classList.remove("ui"), 2800);
    };
    listen(d.root, "pointermove", showUi);
    listen(d.root, "pointerdown", showUi);
    showUi();

    // 操作
    listen(d.play, "click", () => { v.paused || v.ended ? v.play().catch(() => {}) : v.pause(); });
    listen(d.restart, "click", () => { v.currentTime = 0; frontRowSync(0); v.play().catch(() => {}); });
    listen(d.seek, "input", () => { seekingByUser = true; clearTimeout(autoTimer); v.currentTime = +d.seek.value; frontRowSync(+d.seek.value); });
    listen(d.seek, "change", () => { seekingByUser = false; });
    listen(d.sound, "click", () => { v.muted = false; d.sound.hidden = true; });
    listen(d.skip, "click", () => finish("skipped"));
    listen(d.next, "click", () => finish("done"));
    listen(window, "keydown", e => {
      if (e.key === "Escape") finish("skipped");
      else if (e.key === " ") { e.preventDefault(); v.paused ? v.play().catch(() => {}) : v.pause(); }
    });

    // 再生 (音付きが許されないブラウザでは、消音で再生して「音を出す」ボタンを出す)
    try {
      if (!v.getAttribute("src")) v.src = FRONT_ROW.src;
      if (v.readyState > 0) v.currentTime = 0;
    } catch {}
    frontRowSync(0);
    v.muted = typeof SND === "object" && !SND.on;
    v.play().catch(err => {
      if (finished) return;
      if (err && err.name === "NotAllowedError" && !v.muted) {
        v.muted = true;
        d.sound.hidden = false;
        v.play().catch(() => finish("failed"));
      } else {
        finish("failed");
      }
    });
  });
}

// 最前列中央の席の発表: 動画 → 既存の結果表示
async function announceFrontRow(key, index, total) {
  const s = seats[key];
  let result = "failed";
  try { result = await playFrontRow(s); } catch { result = "failed"; }
  if (result === "done") {
    // 動画で名前はもう出ているので、結果表示は短めの登場で
    await announce(s, key, index, total, { intro: "plain", fly: "arc" });
  } else {
    await announce(s, key, index, total);
  }
  return result;
}
