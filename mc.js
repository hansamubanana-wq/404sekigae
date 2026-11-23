"use strict";

const MC_LINES = [
  { at: 1.34, text: "皆さん、お待たせしました！" },
  { at: 4.32, text: "404席替え、ただいまスタート！" },
  { at: 8.70, text: "さあ、最初の発表は……" },
];
const MC_SHORT_AT = 8.42;
const MC_FANFARE_AT = 6.99;
const MC_END = 12.4;
const MC_SEEN_KEY = "404-mc-intro-seen";
let mcHost = null;
let mcSeen = false;

async function loadMcHost() {
  const ctx = SND.ctx;
  if (!ctx) return null;
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const [model, voice] = await Promise.all([
    new GLTFLoader().loadAsync("media/mc/host.glb"),
    fetch("media/mc/voice.m4a").then(response => {
      if (!response.ok) throw new Error(`MC voice: ${response.status}`);
      return response.arrayBuffer();
    }).then(data => ctx.decodeAudioData(data)),
    document.fonts.load('900 32px "MC Noto Sans JP"', "司会" + MC_LINES.map(line => line.text).join("")),
  ]);

  const actor = new THREE.Group();
  actor.name = "MC";
  actor.add(model.scene);
  actor.position.set(0, 0, PODIUM_Z + 1.12);
  model.scene.traverse(node => {
    if (node.isSkinnedMesh) node.frustumCulled = false;
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.85, .56), new THREE.MeshBasicMaterial({
    map: V.tex.glow, color: 0x100c24, opacity: .64, transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024;
  actor.add(shadow);

  const hand = model.scene.getObjectByName("hand_r");
  const head = model.scene.getObjectByName("Head");
  const arms = ["r", "l"].map(side => ({
    upper: model.scene.getObjectByName(`upperarm_${side}`),
    lower: model.scene.getObjectByName(`lowerarm_${side}`),
    hand: model.scene.getObjectByName(`hand_${side}`),
    side: side === "r" ? -1 : 1,
  }));
  let mouth = null;
  model.scene.traverse(node => {
    if (node.morphTargetDictionary?.Speak !== undefined) mouth = node;
  });
  const mic = new THREE.Group();
  const micHandle = new THREE.Mesh(new THREE.CylinderGeometry(.022, .017, .165, 10),
    stdMat(0x1d2330, { metalness: .55, roughness: .36 }));
  const micGrille = new THREE.Mesh(new THREE.SphereGeometry(.030, 12, 8),
    stdMat(0xaebcca, { metalness: .64, roughness: .43 }));
  micGrille.position.y = .099;
  mic.add(micHandle, micGrille);
  mic.position.set(0, .085, .008);
  hand.add(mic);

  const bowShape = new THREE.Shape();
  bowShape.moveTo(-.078, .037);
  bowShape.lineTo(0, .014);
  bowShape.lineTo(.078, .037);
  bowShape.lineTo(.069, -.035);
  bowShape.lineTo(0, -.013);
  bowShape.lineTo(-.069, -.035);
  bowShape.closePath();
  const bow = new THREE.Mesh(new THREE.ShapeGeometry(bowShape), stdMat(0x751f45, { roughness: .74 }));
  bow.position.set(0, 1.493, .124);
  actor.add(bow);
  actor.updateMatrixWorld(true);
  model.scene.getObjectByName("neck_01").attach(bow);

  const mixer = new THREE.AnimationMixer(model.scene);
  const actions = ["Walk", "Idle", "Present"].map(name => mixer.clipAction(
    THREE.AnimationClip.findByName(model.animations, name)).play());
  const grip = THREE.AnimationClip.findByName(model.animations, "Microphone").tracks
    .filter(track => track.name.endsWith(".quaternion"))
    .map(track => ({
      bone: model.scene.getObjectByName(track.name.slice(0, -11)),
      pose: new THREE.Quaternion().fromArray(track.values),
    })).filter(({ bone }) => /^(hand|index|middle|ring|pinky|thumb)_/.test(bone.name));
  const ik = {
    root: v3(), wrist: v3(), toward: v3(), pole: v3(), elbow: v3(),
    source: v3(), destination: v3(), joint: v3(),
    world: new THREE.Quaternion(), delta: new THREE.Quaternion(), parent: new THREE.Quaternion(),
  };
  return { actor, voice, mixer, actions, grip, arms, hand, head, mic, mouth, ik, target: v3(), up: v3(0, 1, 0) };
}

async function warmUpMc(host) {
  V.scene.add(host.actor);
  try {
    await V.renderer.compileAsync(V.scene, V.camera);
    V.composer.render();
    V.renderer.getContext().finish();
    mcHost = host;
  } finally {
    host.actor.visible = false;
  }
}

function mcShowCaption(t, line, previous, current, box) {
  if (line < 0) {
    box.hidden = true;
    return;
  }
  const progress = clamp01((t - MC_LINES[line].at) / .30);
  const slide = ease.out(progress);
  box.hidden = false;
  previous.hidden = line === 0;
  previous.style.transform = `translateY(${(1 - slide) * 100}%)`;
  previous.style.opacity = 1 - slide * .4;
  current.style.transform = `translateY(${(1 - slide) * 30}%)`;
  current.style.opacity = clamp01((progress - .18) / .82);
  box.style.opacity = 1 - ease.inOut(clamp01((t - 11.0) / .45));
}

// 肩と肘を回し、手首をマイクの位置や決めポーズに合わせる。
function mcAimJoint(ik, bone, child, target, weight) {
  const { source, destination, joint, world, delta, parent } = ik;
  bone.getWorldPosition(joint);
  child.getWorldPosition(source).sub(joint).normalize();
  destination.subVectors(target, joint).normalize();
  delta.setFromUnitVectors(source, destination);
  bone.getWorldQuaternion(world).premultiply(delta);
  bone.parent.getWorldQuaternion(parent).invert();
  bone.quaternion.slerp(parent.multiply(world), weight);
}

function mcAimArm(host, arm, x, y, z, weight) {
  const { root, wrist, toward, pole, elbow } = host.ik;
  const { upper, lower, hand, side } = arm;
  upper.getWorldPosition(root);
  host.actor.localToWorld(wrist.set(x, y, z));
  toward.subVectors(wrist, root);
  const a = lower.position.length(), b = hand.position.length();
  const distance = THREE.MathUtils.clamp(toward.length(), Math.abs(a - b) + .002, a + b - .002);
  toward.normalize();
  wrist.copy(root).addScaledVector(toward, distance);
  pole.set(side, -1, -.2).applyQuaternion(host.actor.quaternion);
  pole.addScaledVector(toward, -pole.dot(toward)).normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  elbow.copy(root).addScaledVector(toward, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  mcAimJoint(host.ik, upper, lower, elbow, weight);
  mcAimJoint(host.ik, lower, hand, wrist, weight);
}

function mcPose(host, t, walk, speaking, handUp) {
  host.actions[0].setEffectiveWeight(walk);
  host.actions[1].setEffectiveWeight((1 - walk) * (1 - speaking * .75));
  host.actions[2].setEffectiveWeight((1 - walk) * speaking * .75);
  host.mixer.setTime(t);
  if (handUp > .01) mcAimArm(host, host.arms[0], -.127, 1.43, .305, handUp);
  const gesture = .72 * Math.exp(-(((t - MC_FANFARE_AT) * 1.7) ** 2)) + .8 * Math.exp(-(((t - 9.68) * 1.5) ** 2));
  if (gesture > .01) mcAimArm(host, host.arms[1], .56, 1.48, .43, gesture);
  for (const { bone, pose } of host.grip) bone.quaternion.slerp(pose, handUp);
  if (host.mouth) host.mouth.morphTargetInfluences[0] = speaking;
  if (handUp > .05) {
    host.head.getWorldPosition(host.target);
    host.hand.worldToLocal(host.target).sub(host.mic.position).normalize();
    host.mic.quaternion.setFromUnitVectors(host.up, host.target);
  } else {
    host.mic.rotation.set(.12, 0, .65);
  }
}

async function playMcIntro(unlocked) {
  const host = mcHost;
  if (!host) return false;
  await Promise.race([unlocked, new Promise(resolve => setTimeout(resolve, 650))]);
  const ctx = SND.ctx;
  if (ctx.state !== "running" || document.hidden) return false;

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
  const end = short ? 11.48 : MC_END;
  const start = ctx.currentTime + .035;
  const voice = ctx.createBufferSource();
  const gain = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  const wave = new Float32Array(meter.fftSize);
  voice.buffer = host.voice;
  voice.connect(meter).connect(gain).connect(SND.master);
  voice.onended = () => { voice.disconnect(); meter.disconnect(); gain.disconnect(); };
  const camera = V.camera;
  const defaultPos = V.homePos.clone().add(V.camOffset);
  const defaultRotation = V.homeQuat.clone();
  const from = camera.position.clone();
  const fromRotation = camera.quaternion.clone();
  const aim = v3();
  const actorZ = host.actor.position.z;
  const light = V.spotFocusAt.clone();
  const focus = V.spotFocus;
  const warm = V.roomWarmLight.intensity;
  const walkEnd = 4.1;
  const steps = [.30, .83, 1.36, 1.89, 2.42, 2.95, 3.48, 3.97];
  let line = -1, step = 0, fanfare = false, voiceLevel = 0, watchdog;
  let resolve;
  const complete = new Promise(done => { resolve = done; });
  const finish = () => resolve();
  const onHidden = () => { if (document.hidden) finish(); };
  const onAudioState = () => { if (ctx.state !== "running") finish(); };

  function update(t) {
    const pace = clamp01((t - .16) / (walkEnd - .16));
    const landing = ease.inOut(clamp01((t - 3.48) / .76));
    const heading = lerp(Math.PI * .44, 0, landing);
    host.actor.position.x = lerp(-5.28, -.38, pace);
    host.actor.rotation.y = heading + .09 * Math.sin((t - 4) * 1.6) * landing;
    const walk = short ? 0 : (1 - landing);
    const inSpeech = t >= MC_LINES[0].at && t < 10.36;
    meter.getFloatTimeDomainData(wave);
    let power = 0;
    for (const sample of wave) power += sample * sample;
    const speaking = inSpeech ? Math.min(1, Math.sqrt(power / wave.length) * 6) : 0;
    voiceLevel = lerp(voiceLevel, speaking, .47);
    mcPose(host, t, walk, voiceLevel, ease.inOut(clamp01((t - 1.1) / .45)) * .94);

    const slide = ease.inOut(clamp01((t - .28) / 2.15));
    const push = ease.inOut(clamp01((t - 3.82) / 2.48));
    const orbit = ease.inOut(clamp01((t - 7.0) / 2.25));
    const cx = lerp(1.14, -1.18, slide) + 1.60 * orbit;
    const cy = lerp(.21, 1.89, slide) + .02 * push;
    const cz = lerp(.57, 2.55, slide) - .67 * push;
    camera.position.set(host.actor.position.x + cx, cy, actorZ + cz);
    aim.set(host.actor.position.x, lerp(.40, 1.39, slide) + .07 * push, actorZ);
    camera.lookAt(aim);
    const enter = 1 - ease.out(clamp01((t - offset) / (short ? .38 : .32)));
    camera.position.lerp(from, enter);
    camera.quaternion.slerp(fromRotation, enter);
    const exit = ease.inOut(clamp01((t - (short ? 10.47 : 11.12)) / (end - (short ? 10.47 : 11.12))));
    camera.position.lerp(defaultPos, exit);
    camera.quaternion.slerp(defaultRotation, exit);
    V.spotFocusAt.set(host.actor.position.x, 0, actorZ);
    V.spotFocus = .49 * (1 - exit);
    V.roomWarmLight.intensity = lerp(warm * .34, warm, exit);

    while (!short && step < steps.length && t >= steps[step]) {
      sfx("step", { vol: .34, pan: -.45 + pace * .45, rate: .86, vary: .12 });
      step++;
    }
    if (!fanfare && t >= (short ? MC_SHORT_AT + .08 : MC_FANFARE_AT)) {
      fanfare = true;
      sfx("jingle_start", { vol: short ? .30 : .44 });
      const at = V.stage.worldToLocal(v3(host.actor.position.x, 1.43, actorZ + .17));
      burst(at, [hdr(0xa7d7ff, 2.6), hdr(0xffd199, 2.8)], 30, 1.7, { life: .52, size: .043, grav: .2 });
    }
    const nextLine = MC_LINES.findLastIndex(cue => t >= cue.at && (!short || cue.at > offset));
    if (nextLine !== line) {
      line = nextLine;
      currentText.textContent = MC_LINES[line]?.text || "";
      previousText.textContent = !short && line > 0 ? MC_LINES[line - 1].text : "";
    }
    mcShowCaption(t, line, previous, current, subtitles);
    if (short) previous.hidden = true;
  }

  try {
    host.actor.visible = true;
    ui.hidden = false;
    subtitles.hidden = true;
    skip.addEventListener("click", finish);
    document.addEventListener("visibilitychange", onHidden);
    ctx.addEventListener("statechange", onAudioState);
    bgmDuck(true, .35);
    voice.start(start, offset);
    mcSeen = true;
    try { sessionStorage.setItem(MC_SEEN_KEY, "1"); } catch {}
    V.camRig = () => {
      const t = offset + Math.max(0, ctx.currentTime - start);
      if (t >= end) finish();
      try {
        update(Math.min(t, end));
      } catch (error) {
        console.warn("司会者の演出を続けられませんでした", error);
        finish();
      }
    };
    // 描画が止まっても、発表への引き継ぎを待ち続けない。
    watchdog = setTimeout(finish, (end - offset + 1.5) * 1000);
    await complete;
  } finally {
    clearTimeout(watchdog);
    const now = ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, .025);
    try { voice.stop(now + .10); } catch {}
    skip.removeEventListener("click", finish);
    document.removeEventListener("visibilitychange", onHidden);
    ctx.removeEventListener("statechange", onAudioState);
    ui.hidden = true;
    subtitles.hidden = true;
    host.actor.visible = false;
    V.camRig = null;
    camera.position.copy(defaultPos);
    camera.quaternion.copy(defaultRotation);
    V.spotFocusAt.copy(light);
    V.spotFocus = focus;
    V.roomWarmLight.intensity = warm;
    bgmDuck(false);
  }
  return fanfare;
}
