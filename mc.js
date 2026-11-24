"use strict";

const MC_LINES = [
  { at: .19, text: "皆さん、お待たせしました！" },
  { at: 3.67, text: "404席替え、ただいまスタート！" },
  { at: 11.07, text: "さあ、最初の発表は……" },
];
const MC_SHORT_AT = 10.76;
const MC_FANFARE_AT = 8.23;
const MC_SUBTITLE_OUT = 13.28;
const MC_RISE_AT = 12.68;
const MC_END = 13.34;
const MC_WALK_END = 4.14;
const MC_GREETING_AT = 4.95;
const MC_GREETING_CUT = 3.16;  // 1文目と2文目の間の無音
const MC_DIALOGUE_RESUME = 3.49;
const MC_DIALOGUE_CUT = 10.63;
const MC_MUSIC_CALL_AT = MC_GREETING_AT + 4.03;
const MC_MUSIC_START_AT = MC_MUSIC_CALL_AT + 1.32;  // 「START」の頭
const MC_MUSIC_CAPTION = "MUSIC START!!";
// bgm_main.m4a の冒頭は、.28秒から約.41秒間隔で強い拍が続く。
const MC_MUSIC_BPM = 146;
const MC_FIRST_BEAT = .28;
const MC_SEEN_KEY = "404-mc-intro-seen";
const MC_REACTIONS = {
  good: "GOOD!!",
  nice: "NICE ONE!!",
  oh: "OHHH!!",
  wow: "WOW!!",
  yes: "YES!!",
  next: "NEXT UP!!",
  unbelievable: "UNBELIEVABLE!!",
};
const MC_CASUAL_REACTIONS = ["good", "nice", "oh", "wow", "yes", "next"];
let mcHost = null;
let mcSeen = false;
let mcShow = null;

async function decodeMcVoice(ctx, path) {
  if (!ctx) return null;
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch (error) {
    console.warn(`司会者の声を読み込めませんでした (${path})`, error);
    return null;
  }
}

async function loadMcHost() {
  const ctx = SND.ctx;
  const [voice, { mergeGeometries }, reactions, musicCall] = await Promise.all([
    decodeMcVoice(ctx, "media/mc/voice.m4a"),
    import("three/addons/utils/BufferGeometryUtils.js"),
    Promise.all(Object.keys(MC_REACTIONS).map(async name =>
      [name, await decodeMcVoice(ctx, `media/mc/react/${name}.m4a`)]
    )).then(Object.fromEntries),
    decodeMcVoice(ctx, "media/mc/music-start.m4a"),
    document.fonts.load('900 32px "MC Noto Sans"', "MC" + MC_MUSIC_CAPTION + MC_LINES.map(line => line.text).join("")),
  ]);
  const host = buildMcModel(mergeGeometries);
  host.voice = voice;
  host.musicCall = musicCall;
  host.reactions = reactions;
  if (ctx) {
    host.reactionMeter = ctx.createAnalyser();
    host.reactionMeter.fftSize = 256;
    host.reactionWave = new Float32Array(host.reactionMeter.fftSize);
  }
  host.armRotation = new THREE.Quaternion();
  // 教卓の幅は3.4。左端の外を通って黒板側へ回り、最後は生徒側を向く。
  host.path = new THREE.CatmullRomCurve3([
    v3(-5.60, 0, PODIUM_Z + 1.06),
    v3(-3.65, 0, PODIUM_Z + 1.06),
    v3(-2.36, 0, PODIUM_Z + .84),
    v3(-2.37, 0, PODIUM_Z - .45),
    v3(-1.85, 0, PODIUM_Z - 1.17),
    v3(-.14, 0, PODIUM_Z - 1.20),
  ]);
  host.routeLength = host.path.getLength();
  host.path.getPointAt(1, host.actor.position);
  poseMc(host, 0, 0, 0, 0);
  return host;
}

function mcVoiceLevel(meter, wave) {
  meter.getFloatTimeDomainData(wave);
  let energy = 0;
  for (const sample of wave) energy += sample * sample;
  return Math.min(1, Math.sqrt(energy / wave.length) * 6);
}

function beginMcShow() {
  const host = mcHost;
  if (!host) return;
  const caption = document.getElementById("mcReaction");
  mcShow = {
    host, caption, text: caption.querySelector(".mc-text"), signVisible: V.podiumSign.visible,
    untilReaction: randInt(3, 4), deck: new Deck(MC_CASUAL_REACTIONS),
    last: null, reaction: null, voiceLevel: 0,
    center: host.path.getPointAt(1).add(v3(0, 1.1, 0)),
  };
  host.path.getPointAt(1, host.actor.position);
  host.actor.rotation.y = 0;
  host.actor.visible = true;
  V.podiumSign.visible = false;
  const draw = addFrameHook(updateMcShow);
  function onHidden() {
    if (document.hidden) stopMcReaction();
  }
  const ctx = SND.ctx;
  function onAudioState() {
    if (ctx.state !== "running") stopMcReaction();
  }
  document.addEventListener("visibilitychange", onHidden);
  ctx?.addEventListener("statechange", onAudioState);
  mcShow.cleanup = () => {
    draw();
    document.removeEventListener("visibilitychange", onHidden);
    ctx?.removeEventListener("statechange", onAudioState);
  };
}

function updateMcShow(dt, t) {
  const { host, center, caption, reaction } = mcShow;
  // 教卓の近くまで寄るカットでは、司会者が大きく写って発表を遮るのを防ぐ。
  host.actor.visible = V.camera.position.distanceToSquared(center) >= 4.8 ** 2;
  const elapsed = reaction ? SND.ctx.currentTime - reaction.start : -1;
  const speaking = elapsed >= 0 && elapsed < reaction.source.buffer.duration;
  if (caption.hidden === speaking) caption.hidden = !speaking;
  const energy = speaking ? mcVoiceLevel(host.reactionMeter, host.reactionWave) : 0;
  mcShow.voiceLevel = lerp(mcShow.voiceLevel, energy, 1 - Math.exp(-32 * dt / TIME_SCALE));
  const gesture = speaking
    ? ease.out(clamp01(elapsed / .14)) * ease.out(clamp01((reaction.source.buffer.duration - elapsed) / .21))
    : 0;
  if (host.actor.visible) poseMcWaiting(host, t, mcShow.voiceLevel, gesture, !!reaction?.strong);
}

function mcSeatLanded(key) {
  if (!mcShow) return;
  if (key === FRONT_ROW.key) {
    playMcReaction("unbelievable", true, .20);
    mcShow.untilReaction = randInt(3, 4);
  } else if (--mcShow.untilReaction <= 0 && hidden.size && !mcShow.reaction) {
    const name = mcShow.deck.draw(name => name !== mcShow.last && mcShow.host.reactions[name]);
    playMcReaction(name);
    mcShow.untilReaction = randInt(3, 4);
  }
}

function playMcReaction(name, strong = false, delay = 0) {
  const ctx = SND.ctx;
  const buffer = mcShow?.host.reactions[name];
  if (!buffer || ctx.state !== "running" || document.hidden) return;
  stopMcReaction();
  const show = mcShow;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  source.buffer = buffer;
  gain.gain.value = strong ? .95 : .84;
  source.connect(gain).connect(SND.master);
  source.connect(show.host.reactionMeter);
  show.reaction = { source, gain, start, strong };
  show.last = name;
  show.text.textContent = MC_REACTIONS[name];
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (show.reaction?.source === source) {
      show.reaction = null;
      show.caption.hidden = true;
      bgmReactionDuck(false);
    }
  };
  source.start(start);
  bgmReactionDuck(true, start);
}

function stopMcReaction() {
  if (!mcShow?.reaction) return;
  const { source, gain } = mcShow.reaction;
  mcShow.reaction = null;
  mcShow.caption.hidden = true;
  const now = SND.ctx.currentTime;
  gain.gain.setTargetAtTime(0, now, .012);
  source.stop(now + .045);
  bgmReactionDuck(false);
}

function endMcShow() {
  if (!mcShow) return;
  stopMcReaction();
  mcShow.cleanup();
  mcShow.host.actor.visible = false;
  V.podiumSign.visible = mcShow.signVisible;
  mcShow = null;
}

async function warmUpMc(host) {
  const expressions = [host.smile, host.arms[1].open];
  const visibility = expressions.map(mesh => mesh.visible);
  for (const mesh of expressions) mesh.visible = true;
  V.scene.add(host.actor);
  try {
    await V.renderer.compileAsync(V.scene, V.camera);
    V.composer.render();
    V.renderer.getContext().finish();
    mcHost = host;
  } finally {
    expressions.forEach((mesh, i) => { mesh.visible = visibility[i]; });
    host.actor.visible = false;
  }
}

function mcShowCaption(t, cue, first, end, previous, current, box) {
  if (!cue) {
    box.hidden = true;
    return;
  }
  const progress = clamp01((t - cue.at) / .30);
  const slide = ease.out(progress);
  box.hidden = false;
  previous.hidden = first;
  previous.style.transform = `translateY(${(1 - slide) * 100}%)`;
  previous.style.opacity = 1 - slide * .4;
  current.style.transform = `translateY(${(1 - slide) * 30}%)`;
  current.style.opacity = clamp01((progress - .18) / .82);
  const fade = .21;
  box.style.opacity = 1 - ease.inOut(clamp01((t - (end - fade)) / fade));
}

function mcCamera(rig, actor, t, dialogue, short, offset, musicHit, anticipation, musicWide, beat, pulse) {
  const { camera, aim, from, fromRotation, defaultPos, defaultRotation, shift } = rig;
  const tracking = ease.inOut(clamp01((t - .65) / 1.7));
  const settle = ease.inOut(clamp01((t - 2.96) / 1.31));
  const punch = Math.max(musicHit, ease.out(clamp01((dialogue - (MC_FANFARE_AT - .15)) / .31)));
  const pullBackAt = MC_LINES[2].at + (short ? .16 : 0);
  const wide = Math.max(musicWide, ease.inOut(clamp01((dialogue - pullBackAt) / (MC_END - pullBackAt))));
  const x = lerp(lerp(4.85, 4.45, tracking), lerp(1.02, .55, punch), settle);
  const y = lerp(lerp(.70, 1.28, tracking), lerp(1.70, 1.82, punch), settle);
  const z = lerp(lerp(.49, 1.02, tracking), lerp(3.77, 2.73, punch), settle);
  const fit = clamp01((1.15 - camera.aspect) / .62);
  const cameraZ = Math.max(actor.position.z + z * (1 + fit * .45) - .18 * anticipation, PODIUM_Z + 1.05);
  camera.position.set(actor.position.x + x * (1 + fit * .24), y, cameraZ);
  aim.set(actor.position.x, lerp(lerp(.96, .97, tracking), lerp(1.48, 1.58, punch), settle), actor.position.z);
  camera.lookAt(aim);
  const enter = 1 - ease.out(clamp01((t - offset) / (short ? .30 : .24)));
  camera.position.lerp(from, enter).lerp(defaultPos, wide);
  camera.quaternion.slerp(fromRotation, enter).slerp(defaultRotation, wide);
  shift.set(.095 * Math.sin(beat / 2), 0, -.16 * pulse).multiplyScalar(musicWide).applyQuaternion(defaultRotation);
  camera.position.add(shift);
  return wide;
}

async function playMcIntro(unlocked) {
  const host = mcHost;
  if (!host?.voice) return null;
  await Promise.race([unlocked, new Promise(resolve => setTimeout(resolve, 650))]);
  const ctx = SND.ctx;
  if (ctx.state !== "running" || document.hidden) return null;

  const ui = document.getElementById("mcIntro");
  const skip = ui.querySelector("button");
  const subtitles = ui.querySelector(".mc-subtitles");
  const previous = ui.querySelector(".mc-previous");
  const current = ui.querySelector(".mc-current");
  const previousText = previous.querySelector(".mc-text");
  const currentText = current.querySelector(".mc-text");
  let short = mcSeen;
  try { short ||= sessionStorage.getItem(MC_SEEN_KEY) === "1"; } catch {}
  const offset = short ? MC_SHORT_AT : 0;
  const withMusicCall = !short && !!host.musicCall;
  const callEnd = MC_MUSIC_CALL_AT + (host.musicCall?.duration ?? 0);
  const middleAt = callEnd + .85;
  const lastAt = middleAt + (MC_DIALOGUE_CUT - MC_DIALOGUE_RESUME) + .92;
  const fallbackAt = short ? 0 : MC_WALK_END + .23;
  const lastShift = withMusicCall ? lastAt - MC_SHORT_AT : fallbackAt;
  const end = lastShift + MC_END + (withMusicCall ? .49 : 0);
  const cues = withMusicCall ? [
    { ...MC_LINES[0], at: MC_GREETING_AT + MC_LINES[0].at },
    { at: MC_MUSIC_CALL_AT, text: MC_MUSIC_CAPTION, lang: "en" },
    { ...MC_LINES[1], at: middleAt + MC_LINES[1].at - MC_DIALOGUE_RESUME },
    { ...MC_LINES[2], at: lastShift + MC_LINES[2].at },
  ] : MC_LINES.filter(line => line.at > offset).map(line => ({ ...line, at: line.at + fallbackAt }));
  const parts = withMusicCall ? [
    { buffer: host.voice, at: MC_GREETING_AT, from: 0, duration: MC_GREETING_CUT },
    { buffer: host.musicCall, at: MC_MUSIC_CALL_AT, from: 0 },
    { buffer: host.voice, at: middleAt, from: MC_DIALOGUE_RESUME, duration: MC_DIALOGUE_CUT - MC_DIALOGUE_RESUME },
    { buffer: host.voice, at: lastAt, from: MC_SHORT_AT },
  ] : [{ buffer: host.voice, at: fallbackAt + offset, from: offset }];
  const start = ctx.currentTime + .035;
  const gain = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  const wave = new Float32Array(meter.fftSize);
  meter.connect(gain).connect(SND.master);
  let pendingVoices = parts.length;
  const voices = parts.map(part => {
    const source = ctx.createBufferSource();
    source.buffer = part.buffer;
    source.connect(meter);
    source.onended = () => {
      source.disconnect();
      if (--pendingVoices === 0) { meter.disconnect(); gain.disconnect(); }
    };
    return source;
  });
  const camera = V.camera;
  const defaultPos = V.homePos.clone().add(V.camOffset);
  const defaultRotation = V.homeQuat.clone();
  const rig = { camera, defaultPos, defaultRotation, from: camera.position.clone(), fromRotation: camera.quaternion.clone(), aim: v3(), shift: v3() };
  const heading = v3();
  const light = V.spotFocusAt.clone();
  const focus = V.spotFocus;
  const spotPower = V.spotPower;
  const warm = V.roomWarmLight.intensity;
  const signVisible = V.podiumSign.visible;
  let line = -1, step = 0, fanfare = false, voiceLevel = 0, watchdog, rise, footSound, dialogueDucked = false;
  let resolve;
  const complete = new Promise(done => { resolve = done; });
  const finish = () => resolve(false);
  const onHidden = () => { if (document.hidden) finish(); };
  const onAudioState = () => { if (ctx.state !== "running") finish(); };
  let completed = false;

  function update(t) {
    let dialogue = t - lastShift;
    if (withMusicCall && t < middleAt) dialogue = Math.min(t - MC_GREETING_AT, MC_GREETING_CUT);
    else if (withMusicCall && t < lastAt) dialogue = Math.min(MC_DIALOGUE_RESUME + t - middleAt, MC_DIALOGUE_CUT);
    const nextLine = cues.findLastIndex(cue => t >= cue.at);
    const lead = (cues[nextLine + 1]?.at ?? Infinity) - t;
    const anticipation = withMusicCall && t >= MC_WALK_END && lead < .9 ? Math.sin(Math.PI * lead / .9) : 0;
    const pace = clamp01((t - .09) / (MC_WALK_END - .09));
    host.path.getPointAt(pace, host.actor.position);
    host.path.getTangentAt(pace, heading);
    const turn = ease.inOut(clamp01((t - 3.56) / .75));
    host.actor.rotation.y = lerp(Math.atan2(heading.x, heading.z), 0, turn);
    const walking = (1 - ease.out(clamp01((t - 3.90) / .24))) * clamp01(t / .28);
    const distance = host.routeLength * pace;
    const musicTime = t - MC_MUSIC_START_AT;
    const musicHit = withMusicCall ? ease.out(clamp01((musicTime + .18) / .25)) *
      (1 - ease.inOut(clamp01((musicTime - .46) / .65))) : 0;
    const musicMic = withMusicCall ? ease.out(clamp01((t - MC_MUSIC_CALL_AT + .19) / .19)) *
      (1 - ease.inOut(clamp01((t - callEnd) / .20))) : 0;
    const musicWide = withMusicCall ? ease.inOut(clamp01(musicTime / .68)) *
      ease.inOut(clamp01((middleAt + .06 - t) / .86)) : 0;
    const beat = (musicTime - MC_FIRST_BEAT) * (Math.PI * 2 * MC_MUSIC_BPM / 60);
    const pulse = (.5 + .5 * Math.cos(beat)) ** 4;
    const inSpeech = (dialogue >= MC_LINES[0].at && dialogue < host.voice.duration) || musicMic > 0;
    const speaking = inSpeech ? mcVoiceLevel(meter, wave) : 0;
    voiceLevel = lerp(voiceLevel, speaking, .47);
    const wide = mcCamera(rig, host.actor, t, dialogue, short, offset, musicHit, anticipation, musicWide, beat, pulse);
    const angle = Math.atan2(camera.position.x - host.actor.position.x, camera.position.z - host.actor.position.z) - host.actor.rotation.y;
    poseMc(host, dialogue, distance, walking, voiceLevel, Math.atan2(Math.sin(angle), Math.cos(angle)),
      musicHit, musicMic, anticipation, Math.sin(t * 2.8));
    V.spotFocusAt.copy(host.actor.position);
    V.spotFocus = .43 * (1 - wide);
    V.spotPower = lerp(spotPower * .32, spotPower, wide);
    V.roomWarmLight.intensity = warm * (lerp(.45, 1, wide) + .13 * musicWide * pulse);

    const footfall = Math.floor((distance + .17) / .58);
    if (!short && walking > .08 && footfall > step) {
      footSound = mcTransitionSfx("foot", { vol: .89, pan: -.48 + pace * .48, vary: .13 });
      step = footfall;
    }
    if (withMusicCall && !dialogueDucked && t >= middleAt) {
      dialogueDucked = true;
      bgmDuck(true, .59);
    }
    if (!fanfare && dialogue >= (short ? MC_SHORT_AT + .08 : MC_FANFARE_AT)) {
      fanfare = true;
      sfx("jingle_start", { vol: short ? .27 : .33 });
      const { x, z } = host.actor.position;
      const at = V.stage.worldToLocal(v3(x + .30, 1.41, z + .26));
      burst(at, [hdr(0xa7d7ff, 2.6), hdr(0xffd199, 2.8)], 24, 1.5, { life: .52, size: .039, grav: .2 });
    }
    if (nextLine !== line) {
      line = nextLine;
      currentText.textContent = cues[line]?.text || "";
      currentText.lang = cues[line]?.lang || "";
      previousText.textContent = cues[line - 1]?.text || "";
      previousText.lang = cues[line - 1]?.lang || "";
    }
    mcShowCaption(t, cues[line], line === 0, end, previous, current, subtitles);
  }

  try {
    host.actor.visible = true;
    V.podiumSign.visible = false;
    ui.hidden = false;
    subtitles.hidden = true;
    skip.addEventListener("click", finish);
    document.addEventListener("visibilitychange", onHidden);
    ctx.addEventListener("statechange", onAudioState);
    bgmDuck(true, withMusicCall ? .82 : .35);
    if (withMusicCall) cueMcBgm(start + MC_MUSIC_START_AT);
    else bgm("main");
    parts.forEach(({ at, from, duration }, i) => {
      const when = start + at - offset;
      if (duration === undefined) voices[i].start(when, from);
      else voices[i].start(when, from, duration);
    });
    rise = mcTransitionSfx("rise", { vol: .29, delay: Math.max(0, start + lastShift + MC_RISE_AT - offset - ctx.currentTime) });
    mcSeen = true;
    try { sessionStorage.setItem(MC_SEEN_KEY, "1"); } catch {}
    V.camRig = () => {
      const t = offset + Math.max(0, ctx.currentTime - start);
      try {
        update(Math.min(t, end));
        if (t >= end) resolve(true);
      } catch (error) {
        console.warn("司会者の演出を続けられませんでした", error);
        finish();
      }
    };
    // 描画が止まっても、発表への引き継ぎを待ち続けない。
    watchdog = setTimeout(finish, (end - offset + 1.5) * 1000);
    completed = await complete;
  } finally {
    clearTimeout(watchdog);
    const now = ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, .025);
    for (const voice of voices) {
      try { voice.stop(now + .10); } catch {}
    }
    if (!completed) {
      cancelMcBgmCue();
      rise?.stop(.035);
      footSound?.stop(.08);
    }
    skip.removeEventListener("click", finish);
    document.removeEventListener("visibilitychange", onHidden);
    ctx.removeEventListener("statechange", onAudioState);
    ui.hidden = true;
    subtitles.hidden = true;
    host.actor.visible = false;
    V.podiumSign.visible = signVisible;
    V.camRig = null;
    camera.position.copy(defaultPos);
    camera.quaternion.copy(defaultRotation);
    V.spotFocusAt.copy(light);
    V.spotFocus = focus;
    V.spotPower = spotPower;
    V.roomWarmLight.intensity = warm;
    bgmDuck(false);
  }
  return { announced: fanfare, quick: completed };
}
