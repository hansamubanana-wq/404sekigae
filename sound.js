"use strict";
/* =========================================================
   効果音 (Web Audio)
   素材: Kenney ほか OpenGameArt の CC0 素材 (sounds/CREDITS.txt)
   sfx("名前") で鳴らす。同じ名前に複数の音があるときはランダムに選ぶ
   ========================================================= */

const SND = { ctx: null, master: null, list: null, buf: {}, on: true, loading: null };

try { SND.on = localStorage.getItem("404sound") !== "off"; } catch {}

// iPad / iPhone のマナーモードでも鳴らす (Safari 16.4+)
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}

function soundUnlock() {
  if (!SND.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    SND.ctx = new AC();
    SND.master = SND.ctx.createGain();
    SND.master.gain.value = SND.on ? .9 : 0;
    // 大きな音が重なっても割れないように軽くコンプレッサーをかける
    const comp = SND.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    SND.master.connect(comp).connect(SND.ctx.destination);
    soundLoad();
  }
  if (SND.ctx.state !== "running") SND.ctx.resume().catch(() => {});
}

function soundLoad() {
  if (SND.loading) return SND.loading;
  SND.loading = fetch("sounds/_list.json").then(r => r.json()).then(list => {
    SND.list = list;
    const files = Object.values(list).flat();
    return Promise.all(files.map(f => fetch("sounds/" + f)
      .then(r => r.arrayBuffer())
      .then(a => new Promise((ok, ng) => SND.ctx.decodeAudioData(a, ok, ng)))
      .then(b => { SND.buf[f] = b; })
      .catch(() => {})));
  }).catch(() => {});
  return SND.loading;
}

// name: 音の名前 / vol: 音量 / rate: 速さ(音の高さ) / delay: 秒 / pan: -1〜1
function sfx(name, o = {}) {
  if (!SND.ctx || !SND.list || !SND.on) return null;
  const files = SND.list[name];
  if (!files) return null;
  const buf = SND.buf[files[Math.floor(Math.random() * files.length)]];
  if (!buf) return null;
  const ctx = SND.ctx;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.rate || 1) * (o.vary ? 1 + (Math.random() - .5) * o.vary : 1);
  src.loop = !!o.loop;
  const g = ctx.createGain();
  g.gain.value = o.vol ?? 1;
  let node = src.connect(g);
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    node = node.connect(p);
  }
  node.connect(SND.master);
  const t0 = ctx.currentTime + (o.delay || 0);
  src.start(t0);
  return {
    stop(fade = .3) {
      try {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        src.stop(t + fade + .05);
      } catch {}
    },
    gain: g.gain,
  };
}

// 画面の左右位置 (ステージ座標の x) から左右の定位を決める
function panOf(local) { return V && V.visW ? Math.max(-.8, Math.min(.8, local.x / (V.visW / 2))) : 0; }

function setSoundOn(on) {
  SND.on = on;
  try { localStorage.setItem("404sound", on ? "on" : "off"); } catch {}
  if (SND.master) SND.master.gain.setTargetAtTime(on ? .9 : 0, SND.ctx.currentTime, .05);
  const b = document.getElementById("soundBtn");
  if (b) b.classList.toggle("muted", !on);
}

function toggleSound() {
  soundUnlock();
  setSoundOn(!SND.on);
  if (SND.on) sfx("toggle", { vol: .6 });
}

// 最初のタップで音を有効にする (ブラウザの決まり)
["pointerdown", "touchend", "keydown"].forEach(ev => addEventListener(ev, soundUnlock, { passive: true }));
addEventListener("DOMContentLoaded", () => setSoundOn(SND.on));
