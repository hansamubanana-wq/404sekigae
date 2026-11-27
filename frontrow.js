"use strict";
/* =========================================================
   最前列中央の席の特別演出
   完成動画 media/the_front_row.mp4 (爆弾処理・約43.3秒 / 1280×720 / 24fps・日本語字幕入り) を流す。
   最後の白い画面 (37.5秒から止め絵) に、画面の傾きに合わせて 3・2・1 を映し、
   2秒の間 (心音) をおいて当選者の名前を映す。終了画面まで残す。
   流れ:
     前振り (黒帯・照明が落ちて席にライトとカメラが寄る・字幕・丸く暗転)
     → 動画 (通常は操作なし。失敗時はタップで音付き再生をやり直せる)
     → 締め (終了画面を少し見せて暗転 → 教室に戻って字幕)
     → 既存の結果表示 (名前カードが席へ)
   ・通常は最後の3人の中に入れる
   ========================================================= */

const FRONT_ROW = {
  key: `0-${(cols - 1) / 2}`,  // 最前列 (教卓側の1列目) の中央の席
  src: "media/the_front_row.mp4?v=14",  // 動画を差し替えたら v を上げる
  countAt: 37.55,             // 3・2・1 を出し始める時刻 (動画の電子音と同じ)
  nameAt: 42.55,              // 1 のあと2秒おいて名前 (動画のノイズ音と同じ)
  // 白い画面の四隅 (映像の矩形に対する割合。左上・右上・右下・左下)
  quad: [[.2758, .2806], [.7016, .2528], [.7172, .7111], [.2914, .7653]],
  nameSize: 210,              // 名前の文字の大きさ (画面を 1000×615 としたとき)
  maxW: 860,                  // 名前の最大幅 (同上)
  scramble: .7,               // 名前が乱れた文字から定まるまでの秒数
  fromLast: 3,                // 発表の順番: 最後の3人の中に入れる (残り3人を見せてから動画)
  waitTimeout: 25000,         // 再生開始やバッファ待ちが長引いたら、再生ボタンを出す (ミリ秒)
  endHold: 2600,              // 動画が終わったあと、終了画面を見せておく時間 (ミリ秒)
};

let FR = null;
let frontRowSource = FRONT_ROW.src;
const frontRowDebug = new URLSearchParams(location.search).has("debug");

function frontRowDom() {
  if (FR) return FR;
  const root = document.createElement("div");
  root.className = "frontrow";
  root.hidden = true;
  root.innerHTML = `
    <video class="fr-video" playsinline webkit-playsinline preload="none" disablepictureinpicture disableremoteplayback></video>
    <div class="fr-screen"><div class="fr-count"></div><div class="fr-name" aria-live="polite"></div></div>
    <div class="fr-panel" hidden>
      <p class="fr-status" role="status"></p>
      <button type="button" class="fr-retry" hidden>タップで再生</button>
      <button type="button" class="fr-skip" hidden>動画をスキップ</button>
    </div>`;
  const iris = document.createElement("div");
  iris.className = "fr-iris";
  iris.hidden = true;
  document.body.append(root, iris);
  FR = {
    root, iris, video: root.querySelector(".fr-video"), name: root.querySelector(".fr-name"),
    screen: root.querySelector(".fr-screen"), count: root.querySelector(".fr-count"), fullName: "", shown: "",
    panel: root.querySelector(".fr-panel"), status: root.querySelector(".fr-status"),
    retry: root.querySelector(".fr-retry"), skip: root.querySelector(".fr-skip"), active: false,
  };
  if (frontRowDebug) {
    FR.debug = document.createElement("output");
    FR.debug.className = "fr-debug";
    FR.debug.hidden = true;
    document.body.append(FR.debug);
  }
  return FR;
}

function frontRowReport(stage, error, warning = true) {
  const { video, debug } = frontRowDom();
  const reason = error?.name || error?.code || error || "";
  const detail = error?.message || "";
  const state = `ready=${video.readyState} network=${video.networkState} time=${video.currentTime.toFixed(2)}`;
  const message = `[最前列動画] ${stage} ${reason} ${detail} (${state})`;
  if (warning) console.warn(message, video.currentSrc || video.getAttribute("src"));
  if (debug) {
    debug.hidden = false;
    debug.textContent = [...debug.textContent.split("\n").filter(Boolean).slice(-3), message].join("\n");
  }
}

// 発表の順番: 最前列中央の席は最後の3人の中に入れる。
// 「残りの3人」を見せてから動画で誰が最前列の中央かを明かし、残りの2人は短い演出で決める
function placeFrontRowLate(order) {
  const i = order.indexOf(FRONT_ROW.key);
  if (i < 0) return order;
  order.splice(i, 1);
  order.splice(Math.max(0, order.length + 1 - FRONT_ROW.fromLast), 0, FRONT_ROW.key);
  return order;
}

// 起動時に動画の読み込みを始めておく
function frontRowPreload() {
  const v = frontRowDom().video;
  v.preload = "auto";
  if (v.getAttribute("src") !== frontRowSource) v.src = frontRowSource;
  return v;
}

// iPad が preload を抑える場合も、動画のデータ自体は発表前に端末へ置く。
async function frontRowPrepare() {
  // 白い画面に映す文字の字体 (DotGothic16) を先に読み込んでおく
  try {
    const chars = "0123456789" + studentsOriginal.map(x => x.name ?? x).join("");
    document.fonts?.load('100px "DotGothic16"', chars).catch(() => {});
  } catch {}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FRONT_ROW.waitTimeout);
  try {
    const response = await fetch(FRONT_ROW.src, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    frontRowSource = URL.createObjectURL(await response.blob());
  } catch (error) {
    frontRowReport("事前の動画取得に失敗", error);
  } finally {
    clearTimeout(timer);
  }
  const video = frontRowPreload();
  if (video.readyState >= 2) return;
  await new Promise(resolve => {
    const loaded = () => {
      clearTimeout(wait);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", loaded);
      resolve();
    };
    const wait = setTimeout(loaded, 1600);
    video.addEventListener("loadeddata", loaded);
    video.addEventListener("error", loaded);
  });
  if (video.error) frontRowUseNetwork();
}

function frontRowUseNetwork() {
  if (frontRowSource === FRONT_ROW.src) return;
  const previous = frontRowSource;
  frontRowSource = FRONT_ROW.src;
  frontRowPreload();
  URL.revokeObjectURL(previous);
}

// 席替えスタートのボタンを押した瞬間 (ユーザー操作の中) に呼ぶ。
// iPad / iPhone では、操作の中で一度 play() しておかないと、あとで音付きで再生できないため
function frontRowPrime(movable) {
  if (!movable.includes(FRONT_ROW.key)) return;
  const d = frontRowDom(), v = frontRowPreload();
  try {
    if (v.error) v.load();
    v.muted = false;
    // play() の完了前に pause() すると、操作中の再生要求まで中断される。
    v.play().then(() => {
      if (!d.active) v.pause();
      frontRowReport("事前再生できました", null, false);
    }, error => frontRowReport("事前再生に失敗", error));
  } catch (error) {
    frontRowReport("事前再生に失敗", error);
  }
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

// 長方形 (0,0)-(w,h) を四隅 q へ写す matrix3d (射影変換)
function frontRowMatrix(w, h, q) {
  const adj = m => [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
  const mul = (a, b) => {
    const c = Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = v;
    }
    return c;
  };
  const mulv = (m, v) => [0, 1, 2].map(i => m[3 * i] * v[0] + m[3 * i + 1] * v[1] + m[3 * i + 2] * v[2]);
  const basis = p => {
    const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
    const v = mulv(adj(m), [p[3][0], p[3][1], 1]);
    return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
  };
  const t = mul(basis(q), adj(basis([[0, 0], [w, 0], [w, h], [0, h]])));
  const n = t.map(x => x / t[8]);
  return `matrix3d(${[n[0], n[3], 0, n[6], n[1], n[4], 0, n[7], 0, 0, 1, 0, n[2], n[5], 0, 1].join(",")})`;
}

// 白い画面の傾きに合わせて 3・2・1 と名前の板を置き、名前が幅に収まる大きさを決める
function frontRowLayoutName() {
  const r = frontRowRect(), { screen, name } = FR;
  const q = FRONT_ROW.quad.map(([x, y]) => [r.left + r.width * x, r.top + r.height * y]);
  screen.style.transform = frontRowMatrix(1000, 615, q);
  name.textContent = FR.fullName;
  let fs = FRONT_ROW.nameSize;
  name.style.fontSize = `${fs}px`;
  const w = name.scrollWidth;
  if (w > FRONT_ROW.maxW) { fs *= FRONT_ROW.maxW / w; name.style.fontSize = `${fs}px`; }
  name.textContent = FR.shown;
}

// 名前が出た直後は、まだ決まっていない文字を乱れた記号にする
const FR_NOISE = "■□▲◆＃＊％＆＠？！0123456789アイウエオカキクケコサシスセソ";
function frontRowNameText(dt) {
  const full = [...FR.fullName], k = FRONT_ROW.scramble;
  if (dt >= k) return FR.fullName;
  const fixed = Math.floor(full.length * Math.max(0, dt - .15) / (k - .15));
  return full.map((ch, i) => (i < fixed || ch === " " || ch === "　") ? ch
    : FR_NOISE[Math.floor(Math.random() * FR_NOISE.length)]).join("");
}

// 再生位置から 3・2・1 と名前の表示を決める
function frontRowSync(t) {
  if (!FR) return;
  const { count, name, screen } = FR;
  const c = t - FRONT_ROW.countAt;
  const digit = (c >= 0 && c < 3) ? String(3 - Math.floor(c)) : "";
  if (count.textContent !== digit) {
    count.textContent = digit;
    count.classList.remove("on");
    if (digit) { void count.offsetWidth; count.classList.add("on"); }
  }
  const dt = t - FRONT_ROW.nameAt;
  const on = dt >= -.001;
  name.classList.toggle("on", on);
  const text = on ? frontRowNameText(dt) : "";
  if (text !== FR.shown) { FR.shown = text; name.textContent = text; }
  screen.classList.toggle("lit", !!digit || on);
}

/* ---------- 丸くすぼまる暗転 (アイリス) ---------- */
// r: 穴の半径 (画面の対角線に対する割合。0 で真っ暗、1 以上で全部見える)
function irisSet(r, cx, cy) {
  const { iris } = FR;
  const R = Math.hypot(innerWidth, innerHeight) * r;
  iris.style.background = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${R}px, #000 ${R + 1.5}px)`;
}
function irisTo(r0, r1, ms, at, e = ease.inOut) {
  const { iris } = FR;
  iris.hidden = false;
  return tween(ms, t => irisSet(lerp(r0, r1, t), at.x, at.y), e).then(() => { if (r1 >= 1) iris.hidden = true; });
}

/* ---------- 前振り ---------- */
async function frontRowIntro(key) {
  const o = V.seat[key];
  letterbox(true);
  sfx("suspense", { vol: .9 });
  spotFocus(key, 1200);
  focusAnnouncement([key]);
  dolly(.42, key, 3200);
  const d0 = V.uniforms.uDim.value;
  tween(1200, t => { V.uniforms.uDim.value = lerp(d0, .5, t); }, ease.inOut);
  // 席の名札だけ明るいまま、金の枠が鼓動に合わせて光る
  o.frame.visible = true;
  const unhook = addFrameHook((dt, t) => {
    const beat = Math.pow(Math.max(0, Math.sin(t * 5.2)), 12);
    o.pivot.scale.setScalar(1 + beat * .12);
    o.frame.material.color.copy(hdr(HEX.gold, .8 + beat * 2.2));
  });
  await sleep(600);
  const cap = caption("最前列の中央は……", 2700);
  for (let i = 0; i < 3; i++) {
    sfx("heart", { vol: 1, rate: .7 }); sfx("heart", { vol: .7, rate: .7, delay: .18 });
    shake(.04);
    await sleep(820);
  }
  await cap;
  // 席の位置に向かって丸く暗転
  const p = toScreen(plateLocal(key));
  sfx("down", { vol: .8 });
  await irisTo(1.05, 0, 1100, p, ease.in);
  unhook();
  o.pivot.scale.setScalar(1);
  o.frame.visible = locked.has(key);
  return p;
}

/* ---------- 締め (教室に戻る) ---------- */
async function frontRowOutro(key, at) {
  V.renderHold = false;
  focusAnnouncement();
  V.uniforms.uDim.value = 1;
  letterbox(true);
  await sleep(250);
  await irisTo(0, 1.05, 1300, toScreen(plateLocal(key)) || at, ease.out);
  await caption("― 最前列 中央 ―", 1700);
  // 寄っていたカメラとライトを元に戻してから結果表示へ (寄ったままだと名前カードが大写しになる)
  letterbox(false);
  spotFocus(null, 900);
  await dolly(0, null, 1000);
}

/* ---------- 動画・再生できなかった場合の再試行 ---------- */
// 戻り値: "done" (最後まで流れた) | "failed"
function playFrontRow(student) {
  const d = frontRowDom(), v = frontRowPreload();
  return new Promise(resolve => {
    let finished = false, waitingForTap = false, triedByTap = false, attempt = 0;
    let waitTimer = 0, loadingTimer = 0, raf = 0, vfc = 0;
    const on = [];
    const listen = (el, ev, fn) => { el.addEventListener(ev, fn); on.push([el, ev, fn]); };

    const clearWait = () => {
      clearTimeout(waitTimer);
      clearTimeout(loadingTimer);
      waitTimer = loadingTimer = 0;
    };
    const finish = result => {
      if (finished) return;
      finished = true;
      d.active = false;
      d.panel.hidden = true;
      clearWait(); cancelAnimationFrame(raf);
      if (vfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfc);
      on.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
      v.pause();
      resolve(result);
    };

    const showPanel = (message, retry = false) => {
      d.status.textContent = message;
      d.retry.hidden = !retry;
      d.skip.hidden = !retry || !triedByTap;
      d.panel.hidden = false;
      d.root.classList.add("on");
    };
    const recover = (stage, error) => {
      if (finished || waitingForTap) return;
      waitingForTap = true;
      attempt++;
      clearWait();
      frontRowReport(stage, error);
      v.pause();
      showPanel("動画を再生できませんでした", true);
    };
    const waitForPlayback = () => {
      if (finished || waitingForTap || waitTimer) return;
      loadingTimer = setTimeout(() => showPanel("動画を読み込み中…"), 650);
      waitTimer = setTimeout(() => recover("再生待ち", `${FRONT_ROW.waitTimeout / 1000}秒でタイムアウト`), FRONT_ROW.waitTimeout);
    };
    const start = (byTap = false) => {
      waitingForTap = false;
      triedByTap ||= byTap;
      const current = ++attempt;
      d.panel.hidden = true;
      waitForPlayback();
      try {
        if (byTap && v.error) frontRowUseNetwork();
        if (byTap && (v.error || (v.readyState < 2 && v.currentTime === 0))) v.load();
        v.muted = false;
        // 再試行はタップのハンドラー内で直接呼ぶ。ブラウザの音付き再生許可を使うため。
        v.play().catch(error => {
          if (current === attempt) recover("再生要求が拒否", error);
        });
      } catch (error) {
        recover("再生要求が失敗", error);
      }
    };

    d.active = true;
    d.fullName = student.name;
    d.shown = "";
    d.name.textContent = "";
    d.name.classList.remove("on");
    d.count.textContent = "";
    d.count.classList.remove("on");
    d.root.classList.remove("on", "out");
    d.root.hidden = false;
    V.renderHold = true;   // 裏の3Dを止めて動画を滑らかに
    frontRowLayoutName();

    // 名前の表示は「実際に画面に出たコマの時刻」で決める (コマ単位で正確)。使えないブラウザでは currentTime
    const hasVfc = !!v.requestVideoFrameCallback;
    const tick = () => { if (!hasVfc) frontRowSync(v.currentTime || 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    if (hasVfc) {
      const onFrame = (now, meta) => { if (!v.seeking) frontRowSync(meta.mediaTime); vfc = v.requestVideoFrameCallback(onFrame); };
      vfc = v.requestVideoFrameCallback(onFrame);
    }
    ["seeking", "seeked"].forEach(ev => listen(v, ev, () => frontRowSync(v.currentTime)));

    listen(d.retry, "click", () => start(true));
    listen(d.skip, "click", () => {
      frontRowReport("再試行後にスキップを選択", null, false);
      finish("failed");
    });
    listen(v, "error", () => recover("動画の読み込み・デコードエラー", v.error));
    listen(v, "waiting", waitForPlayback);
    listen(v, "pause", () => {
      if (v.paused && !v.ended) recover("再生が一時停止しました");
    });
    listen(v, "playing", () => {
      if (waitingForTap || v.paused) return;
      clearWait();
      d.panel.hidden = true;
      d.root.classList.add("on");
    });
    listen(v, "loadedmetadata", frontRowLayoutName);
    listen(window, "resize", frontRowLayoutName);
    listen(window, "orientationchange", () => setTimeout(frontRowLayoutName, 300));
    listen(v, "ended", () => { frontRowSync(v.duration || 20); finish("done"); });

    try {
      if (v.readyState > 0) v.currentTime = 0;
    } catch (error) { frontRowReport("再生位置を戻せませんでした", error); }
    frontRowSync(0);
    start();
  });
}

function frontRowClose(ms = 0) {
  const d = frontRowDom();
  d.root.classList.add("out");
  return sleep(ms).then(() => {
    d.root.hidden = true;
    d.root.classList.remove("on", "out");
    d.name.classList.remove("on");
    d.count.textContent = "";
    d.count.classList.remove("on");
    d.screen.classList.remove("lit");
  });
}

// 同じ組の候補者を並べて見せる。
async function showRemaining(items) {
  const n = items.length;
  const k = Math.min(V.heroK * .5, V.visW * .29 / FACE_W);
  const gap = FACE_W * k * 1.1;
  const cards = items.map((it, i) => {
    const g = pairCard(it.s, "", k);
    g.position.set((i - (n - 1) / 2) * gap, 0, 0);
    g.scale.setScalar(.01);
    return g;
  });
  veil(true, 400);
  letterbox(true);
  for (let i = 0; i < n; i++) {
    sfx("pop"); revealBurst(cards[i], items[i].s);
    tween(450, t => cards[i].scale.setScalar(Math.max(.01, k * t)), ease.back);
    await sleep(320);
  }
  await caption(n > 1 ? `この${n}人のうち、最前列の中央は……` : "最前列の中央は……", 2600);
  sfx("whoosh", { rate: .7 });
  await tween(500, t => cards.forEach((g, i) => { g.position.y = t * V.visH; g.rotation.z = t * (i - 1) * .6; }), ease.in);
  cards.forEach(dropCard);
}

// 動画の対象者を見せ、最前列中央を動画で発表してから同じ組の残りを発表する。
async function announceFrontRow(key, others = [], { finalRound = true } = {}) {
  const s = seats[key];
  const group = [{ s, key }, ...others];
  const preview = shuffleArray(group);
  const creatorIndex = group.findIndex(item => item.s.no === CREATOR_STUDENT_NO);
  if (creatorIndex >= 0) {
    const creator = group[creatorIndex];
    preview.splice(preview.indexOf(creator), 1);
    preview.splice(creatorIndex, 0, creator);
  }
  await showRemaining(preview);
  const at = await frontRowIntro(key);
  let result = "failed";
  bgmDuck(true);
  try { result = await playFrontRow(s); } catch (error) { frontRowReport("動画の準備に失敗", error); }
  finally { bgmDuck(false); }
  if (result === "done") {
    await sleep(FRONT_ROW.endHold);   // 名前の出た終了画面を少し見せる
    await frontRowClose(1200);        // ゆっくり暗転
    await frontRowOutro(key, at);
  } else {
    // 再試行後にスキップを選んだ場合は、既存の結果表示へ
    await frontRowClose(0);
    V.renderHold = false;
    focusAnnouncement();
    V.uniforms.uDim.value = 1;
    await irisTo(0, 1.05, 500, toScreen(plateLocal(key)) || at, ease.out);
    letterbox(false);
    spotFocus(null, 500);
    await dolly(0, null, 500);
  }
  await announcePair([{ s, key }], { intro: "pop", travel: "dive", frontRowImpact: true, frontRowFinalRound: finalRound });
  // 残りの2人は短い演出で一気に
  if (others.length) {
    await announcePair(others, { intro: "pop", travel: "arc", hold: 600 });
  }
  return result;
}
