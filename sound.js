"use strict";
/* =========================================================
   効果音と BGM (Web Audio)
   効果音の出典: sounds/CREDITS.txt
   sfx("名前") で鳴らす。同じ名前に複数の音があるときはランダムに選ぶ
   ========================================================= */

const SND = { ctx: null, master: null, music: null, reactionMusic: null, list: null, buf: {}, loading: null };
const BGM_FILES = { main: "media/bgm_main.m4a", tension: "media/bgm_tension.m4a", finale: "media/bgm_finale.m4a" };
const BGM_FADE = 1.25;
const BGM_VOLUME = { main: .36, tension: .44, finale: .6 };
const HOME_BGM_VOLUME = .2;
const MC_BGM_PEAK = .64;
const MC_BGM_ATTACK = .045;
const MC_BGM_SETTLE = 3.4;
const SFX_VOLUME = .85;     // 効果音全体の音量 (BGM とのバランス)
const MC_RISE_SECONDS = 1.10;
const MASTER_LOOKAHEAD = .006;  // DynamicsCompressorNode の固定先読み
const BGM = { loading: new Map(), buffers: new Map(), main: null, request: null, playing: null };

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
    SND.reactionMusic = SND.ctx.createGain();
    SND.music.connect(SND.reactionMusic).connect(SND.master);
    // 大きな音が重なっても割れないように軽くコンプレッサーをかける
    const comp = SND.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    SND.master.connect(comp).connect(SND.ctx.destination);
    SND.mcTransition = buildMcTransitionSounds(SND.ctx);
    soundLoad();
  }
  return SND.loading || Promise.resolve();
}

// 最初のタップで鳴らせるようにする (ブラウザの決まり)
function soundUnlock() {
  soundInit();
  if (SND.ctx && SND.ctx.state !== "running") return SND.ctx.resume().catch(() => {});
}

function audioOutputTime(ctx, wallTime = performance.now()) {
  const stamp = ctx.getOutputTimestamp?.();
  if (stamp?.performanceTime > 0 && Number.isFinite(stamp.contextTime)) {
    return Math.min(ctx.currentTime, stamp.contextTime + (wallTime - stamp.performanceTime) / 1000) - MASTER_LOOKAHEAD;
  }
  // 出力タイムスタンプが使えないブラウザでは、報告された遅延を引く。
  return ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0) - MASTER_LOOKAHEAD;
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
  return playSfxBuffer(buf, o);
}

function playSfxBuffer(buf, o = {}) {
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
  src.onended = () => { src.disconnect(); g.disconnect(); if (node !== g) node.disconnect(); };
  const t0 = o.at ?? ctx.currentTime + (o.delay || 0);
  src.start(t0);
  return {
    stop(fade = .3) {
      try {
        const t = ctx.currentTime;
        if (t < t0) { src.stop(t); return; }
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        src.stop(t + fade + .05);
      } catch {}
    },
    gain: g.gain,
  };
}

// ノイズを明るくしながら立ち上げ、発表では低音と短いシンバルを重ねる。
function buildMcTransitionSounds(ctx) {
  const rate = ctx.sampleRate;
  const rise = ctx.createBuffer(1, Math.round(rate * MC_RISE_SECONDS), rate);
  const hit = ctx.createBuffer(1, Math.round(rate * .52), rate);
  const ramp = rise.getChannelData(0), strike = hit.getChannelData(0);
  let low = 0, bright = 0, phase = 0;
  let seed = 404;
  const noise = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let i = 0; i < ramp.length; i++) {
    const t = i / ramp.length;
    const white = noise();
    low += .023 * (white - low);
    bright += (.08 + .43 * t * t) * (white - low - bright);
    const envelope = t ** 2.1 * Math.min(1, (1 - t) / .055);
    ramp[i] = (bright * .69 + white * .17 * t) * envelope;
  }
  low = 0;
  for (let i = 0; i < strike.length; i++) {
    const t = i / rate;
    const white = noise();
    low += .31 * (white - low);
    phase += 2 * Math.PI * (49 + 104 * Math.exp(-t * 31)) / rate;
    const envelope = Math.min(1, t / .006, (.52 - t) / .06);
    strike[i] = envelope * (Math.sin(phase) * .61 * Math.exp(-t * 14) +
      (white - low) * .40 * Math.exp(-t * 8));
  }
  return { rise, hit, footLeft: buildMcHeelToe(ctx, noise, .96), footRight: buildMcHeelToe(ctx, noise, 1.04) };
}

function buildMcHeelToe(ctx, noise, tone) {
  const rate = ctx.sampleRate;
  const step = ctx.createBuffer(1, Math.round(rate * .38), rate);
  const samples = step.getChannelData(0);
  const direct = new Float32Array(samples.length);
  const lowMix = 1 - Math.exp(-2 * Math.PI * 390 / rate);
  const highMix = 1 - Math.exp(-2 * Math.PI * 3250 / rate);
  const tap = (at, weight, heel) => {
    const start = Math.round(at * rate);
    let low = 0, high = 0;
    for (let i = 0; i < .105 * rate; i++) {
      const t = i / rate, white = noise();
      low += lowMix * (white - low);
      high += highMix * (white - high);
      const wood = .51 * Math.sin(2 * Math.PI * (heel ? 193 : 251) * tone * t) * Math.exp(-t * 65) +
        .29 * Math.sin(2 * Math.PI * (heel ? 384 : 512) * tone * t) * Math.exp(-t * 115) +
        .17 * Math.sin(2 * Math.PI * 850 * tone * t) * Math.exp(-t * 155);
      const leather = .49 * (high - low) * Math.exp(-t * (heel ? 99 : 73));
      direct[start + i] += Math.min(1, t / .0014) * weight * (wood + leather);
    }
  };
  tap(0, 1, true);
  tap(.052 / tone, .48, false);
  samples.set(direct);
  // 同じ打音の短い反射だけを重ねる。長いエコーや低い持続音は入れない。
  for (const [seconds, gain] of [[.019,.16],[.034,-.12],[.074,.10],[.091,.074],[.129,-.051],[.168,.033],[.208,.019]]) {
    const delay = Math.round(seconds * rate);
    for (let i = delay; i < samples.length; i++) samples[i] += direct[i - delay] * gain;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  for (let i = 0; i < samples.length; i++) samples[i] *= .76 / peak;
  return step;
}

function mcTransitionSfx(name, options) {
  if (SND.ctx?.state !== "running") return null;
  return playSfxBuffer(SND.mcTransition[name], options);
}

// 起動時に一度だけ PCM に展開し、発表を繰り返しても同じバッファを使う。
function loadBgm(name) {
  if (BGM.buffers.has(name)) return Promise.resolve(BGM.buffers.get(name));
  if (!BGM.loading.has(name)) {
    const file = fetch(BGM_FILES[name]).then(response => {
      if (!response.ok) throw new Error(`BGM: ${response.status}`);
      return response.arrayBuffer();
    }).then(data => SND.ctx.decodeAudioData(data)).then(buffer => {
      BGM.buffers.set(name, buffer);
      if (name === "main") BGM.main = buffer;
      return buffer;
    }).finally(() => BGM.loading.delete(name));
    BGM.loading.set(name, file);
  }
  return BGM.loading.get(name);
}

function bgmPrepare() {
  return SND.music && Promise.allSettled(Object.keys(BGM_FILES).map(loadBgm));
}

async function bgm(name, level = BGM_VOLUME[name], cue = null) {
  if (!SND.music || !Object.hasOwn(BGM_FILES, name)) return;
  if (BGM.request?.name === name) {
    if (BGM.request.level !== level) {
      BGM.request.level = level;
      if (BGM.playing?.name === name) rampBgm(BGM.playing, level, BGM_FADE);
    }
    return;
  }
  const request = { name, level, cue };
  BGM.request = request;
  if (BGM.playing?.name === name) {
    rampBgm(BGM.playing, level, BGM_FADE);
    return;
  }
  const ctx = SND.ctx;
  try {
    const buffer = BGM.buffers.get(name) || await loadBgm(name);
    if (BGM.request !== request) return;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain).connect(SND.music);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
    const now = ctx.currentTime;
    const start = Math.max(now, cue ?? now);
    const track = { name, src, gain, playbackStart: start, from: 0, to: 0, started: start, duration: 0 };
    if (cue !== null) {
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(MC_BGM_PEAK, start + MC_BGM_ATTACK);
      gain.gain.linearRampToValueAtTime(request.level, start + MC_BGM_SETTLE);
      track.introPeak = start + MC_BGM_ATTACK;
      Object.assign(track, { from: MC_BGM_PEAK, to: request.level, started: track.introPeak, duration: MC_BGM_SETTLE - MC_BGM_ATTACK });
    } else {
      rampBgm(track, request.level, BGM_FADE);
    }
    src.start(start);
    fadeOutBgm(BGM.playing, BGM_FADE);
    BGM.playing = track;
  } catch {
    if (BGM.request === request) {
      BGM.request = null;
    }
  }
}

function rampBgm(track, target, duration) {
  const now = SND.ctx.currentTime;
  const t = track.duration ? Math.min(1, Math.max(0, (now - track.started) / track.duration)) : 1;
  const level = track.introPeak > now
    ? MC_BGM_PEAK * Math.max(0, 1 - (track.introPeak - now) / MC_BGM_ATTACK)
    : track.from + (track.to - track.from) * t;
  const volume = track.gain.gain;
  volume.cancelScheduledValues(now);
  volume.setValueAtTime(level, now);
  volume.linearRampToValueAtTime(target, now + duration);
  track.introPeak = null;
  Object.assign(track, { from: level, to: target, started: now, duration });
}

function fadeOutBgm(track, fade) {
  if (!track) return;
  rampBgm(track, 0, fade);
  track.src.stop(SND.ctx.currentTime + fade);
}

function bgmHome() {
  bgm("main", HOME_BGM_VOLUME);
}

function cueMcBgm(at) {
  fadeOutBgm(BGM.playing, .20);
  BGM.playing = BGM.request = null;
  return bgm("main", BGM_VOLUME.main, at);
}

function cancelMcBgmCue() {
  if (BGM.request?.cue == null || BGM.request.cue <= SND.ctx.currentTime) return;
  BGM.request = null;
  BGM.playing?.src.stop();
  BGM.playing = null;
}

function bgmDuck(ducked, level = 0) {
  if (!SND.music) return;
  const now = SND.ctx.currentTime;
  SND.music.gain.setTargetAtTime(ducked ? level : 1, now, ducked ? .02 : .12);
}

function bgmReactionDuck(ducked, start = SND.ctx.currentTime) {
  const volume = SND.reactionMusic.gain;
  volume.cancelScheduledValues(SND.ctx.currentTime);
  volume.setTargetAtTime(ducked ? .69 : 1, start, ducked ? .035 : .13);
}

// 画面の左右位置 (ステージ座標の x) から左右の定位を決める
function panOf(local) { return V && V.visW ? Math.max(-.8, Math.min(.8, local.x / (V.visW / 2))) : 0; }
