"use strict";
/* =========================================================
   効果音と BGM (Web Audio)
   効果音の出典: sounds/CREDITS.txt
   sfx("名前") で鳴らす。同じ名前に複数の音があるときはランダムに選ぶ
   ========================================================= */

const SND = { ctx: null, master: null, music: null, list: null, buf: {}, loading: null };
const BGM_FILES = { main: "media/bgm_main.m4a", tension: "media/bgm_tension.m4a", finale: "media/bgm_finale.m4a" };
const BGM_FADE = 1.25;
const BGM_VOLUME = { main: .36, tension: .44, finale: .6 };
const SFX_VOLUME = .85;     // 効果音全体の音量 (BGM とのバランス)
const BGM = { files: new Map(), request: null, playing: null };

// iPad / iPhone のマナーモードでも鳴らす (Safari 16.4+)
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}

// 音の準備 (起動中に呼ぶ)。音を鳴らす許可はまだないが、読み込みと変換はここで済ませておく
function soundInit() {
  if (!SND.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    SND.ctx = new AC();
    SND.master = SND.ctx.createGain();
    SND.master.gain.value = .9;
    SND.music = SND.ctx.createGain();
    SND.music.connect(SND.master);
    // 大きな音が重なっても割れないように軽くコンプレッサーをかける
    const comp = SND.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    SND.master.connect(comp).connect(SND.ctx.destination);
    soundLoad();
  }
  return SND.loading || Promise.resolve();
}

// 最初のタップで鳴らせるようにする (ブラウザの決まり)
function soundUnlock() {
  soundInit();
  if (SND.ctx && SND.ctx.state !== "running") SND.ctx.resume().catch(() => {});
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
  if (!SND.ctx || !SND.list) return null;
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
  g.gain.value = (o.vol ?? 1) * SFX_VOLUME;
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

// 発表開始後に取得し、再生する曲だけを PCM に展開する。
function loadBgm(name) {
  if (!BGM.files.has(name)) {
    const file = fetch(BGM_FILES[name]).then(response => {
      if (!response.ok) throw new Error(`BGM: ${response.status}`);
      return response.arrayBuffer();
    }).catch(error => {
      BGM.files.delete(name);
      throw error;
    });
    BGM.files.set(name, file);
  }
  return BGM.files.get(name);
}

function bgmPreload() {
  if (!SND.music) return;
  for (const name of ["tension", "finale"]) loadBgm(name).catch(() => {});
}

async function bgm(name) {
  if (!SND.music || !Object.hasOwn(BGM_FILES, name) || BGM.request?.name === name) return;
  const request = { name };
  BGM.request = request;
  if (BGM.playing?.name === name) return;
  const ctx = SND.ctx;
  try {
    const data = await loadBgm(name);
    if (BGM.request !== request) return;
    const buffer = await ctx.decodeAudioData(data.slice(0));
    if (BGM.request !== request) return;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain).connect(SND.music);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(BGM_VOLUME[name], now + BGM_FADE);
    src.start(now);
    fadeOutBgm(BGM.playing, BGM_FADE);
    BGM.playing = { name, src, gain, started: now };
  } catch {
    if (BGM.request === request) {
      BGM.files.delete(name);
      BGM.request = null;
    }
  }
}

function fadeOutBgm(track, fade) {
  if (!track) return;
  const now = SND.ctx.currentTime;
  // 曲の切り替えが続いても、その時点のフェードイン音量から下げる。
  const level = BGM_VOLUME[track.name] * Math.min(1, (now - track.started) / BGM_FADE);
  const volume = track.gain.gain;
  volume.cancelScheduledValues(now);
  volume.setValueAtTime(fade > 0 ? level : 0, now);
  if (fade > 0) volume.linearRampToValueAtTime(0, now + fade);
  track.src.stop(now + Math.max(0, fade));
}

function bgmStop(fade = BGM_FADE) {
  BGM.request = null;
  fadeOutBgm(BGM.playing, fade);
  BGM.playing = null;
}

function bgmDuck(ducked) {
  if (!SND.music) return;
  const now = SND.ctx.currentTime;
  SND.music.gain.setTargetAtTime(ducked ? 0 : 1, now, ducked ? .02 : .12);
}

// 画面の左右位置 (ステージ座標の x) から左右の定位を決める
function panOf(local) { return V && V.visW ? Math.max(-.8, Math.min(.8, local.x / (V.visW / 2))) : 0; }

// 最初のタップで音を有効にする (ブラウザの決まり)
["pointerdown", "touchend", "keydown"].forEach(ev => addEventListener(ev, soundUnlock, { passive: true }));
