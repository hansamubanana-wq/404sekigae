"use strict";

// The first frame with each sole touching the floor in the source Walk clip.
const MC_SUIT_CONTACT = .725;
const MC_SUIT_STRIDE = 1.07;
const MC_SUIT_PLANT_BLEND = .085;

async function loadMcSuit() {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { scene: model, animations } = await new GLTFLoader().loadAsync("media/mc/suit-male.glb");
  const actor = new THREE.Group();
  actor.name = "MC Suit Male";
  const gait = new THREE.Group();
  actor.add(gait);
  gait.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clip = name => THREE.AnimationClip.findByName(animations, name);
  const walk = mixer.clipAction(clip("Walk")).play();
  const idle = mixer.clipAction(clip("Idle")).play();
  const gestureClip = clip("Victory").clone();
  // Mix the free arm over Idle. Keep the microphone hand and the planted feet in Idle.
  gestureClip.tracks = gestureClip.tracks.filter(track => /^(Shoulder|UpperArm|LowerArm|Fist)L\./.test(track.name));
  THREE.AnimationUtils.makeClipAdditive(gestureClip, 0, clip("Idle"));
  const gesture = mixer.clipAction(gestureClip).play();
  const feet = ["FootL", "FootR"].map(name => model.getObjectByName(name));
  const hand = model.getObjectByName("FistR");
  const mic = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.036, .027, .23, 10), new THREE.MeshStandardMaterial({
    color: 0x252840, roughness: .46,
  }));
  const grille = new THREE.Mesh(new THREE.SphereGeometry(.048, 10, 7), new THREE.MeshStandardMaterial({
    color: 0xd5dbe5, roughness: .38,
  }));
  mic.add(grip, grille);
  grip.position.y = .05;
  grille.position.y = .174;
  // The exported rig is taller than the classroom character; these are rig units.
  mic.scale.setScalar(1 / .59);
  mic.position.set(-.04, .15, .08);
  mic.rotation.x = -.5;
  hand.add(mic);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.95, .72), new THREE.MeshBasicMaterial({
    map: V.tex.glow, color: 0x100c24, opacity: .56, transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024;
  actor.add(shadow);
  return { actor, model, gait, mixer, walk, idle, gesture, feet, heading: v3(), foot: v3(), correction: v3(), previous: v3() };
}

function moveMcSuit(host, t) {
  const pace = clamp01(t / MC_LAST_STEP);
  host.path.getPointAt(pace, host.actor.position);
  host.path.getTangentAt(pace, host.heading);
  const turn = ease.inOut(clamp01((t - 3.55) / (MC_WALK_END - 3.55)));
  host.actor.rotation.y = lerp(Math.atan2(host.heading.x, host.heading.z), 0, turn);
}

function mixMcSuit(host, walkTime, idleTime, gestureTime = 0, gestureWeight = 0) {
  const intoIdle = ease.inOut(clamp01((walkTime - MC_LAST_STEP) / (MC_WALK_END - MC_LAST_STEP)));
  host.walk.time = (MC_SUIT_CONTACT + Math.min(walkTime, MC_LAST_STEP) * host.walk.getClip().duration / (2 * MC_STEP_INTERVAL)) % host.walk.getClip().duration;
  host.idle.time = idleTime % host.idle.getClip().duration;
  host.gesture.time = Math.min(gestureTime, host.gesture.getClip().duration);
  // Crossfade at an absolute time so the pose follows audio even after a delayed frame.
  host.walk.setEffectiveWeight(1 - intoIdle);
  host.idle.setEffectiveWeight(intoIdle);
  host.gesture.setEffectiveWeight(gestureWeight * intoIdle);
  host.mixer.update(0);
}

function mcSuitPlantCorrection(host, plant, target) {
  host.feet[plant.side].getWorldPosition(host.foot);
  host.actor.worldToLocal(host.foot);
  return target.copy(plant.position).sub(host.foot);
}

function prepareMcSuitWalk(host) {
  host.model.scale.set(.59, .59, host.path.getLength() / (MC_STEP_COUNT * MC_SUIT_STRIDE));
  host.model.position.y = .014;
  host.plants = [];
  for (let step = 0; step <= MC_STEP_COUNT; step++) {
    const t = step * MC_STEP_INTERVAL;
    moveMcSuit(host, t);
    mixMcSuit(host, t, 0);
    const side = step % 2;
    const position = host.feet[side].getWorldPosition(v3());
    if (step) {
      // Transfer weight from the outgoing foot without resetting the model to the nominal path.
      const previous = host.plants[step - 1].world;
      const outgoing = host.feet[1 - side].getWorldPosition(host.foot);
      position.x += previous.x - outgoing.x;
      position.z += previous.z - outgoing.z;
    }
    host.plants.push({ side, world: position, position: v3() });
  }
}

function poseMcSuit(host, t, idleTime, gestureTime = 0, gestureWeight = 0) {
  const at = Math.min(t, MC_WALK_END);
  mixMcSuit(host, at, idleTime, gestureTime, gestureWeight);
  const step = Math.min(MC_STEP_COUNT, Math.floor((at + MC_SUIT_PLANT_BLEND) / MC_STEP_INTERVAL));
  const plant = host.plants[step];
  host.gait.position.set(0, 0, 0);
  host.actor.worldToLocal(plant.position.copy(plant.world));
  const correction = mcSuitPlantCorrection(host, plant, host.correction);
  const transition = ease.inOut(clamp01((at - step * MC_STEP_INTERVAL + MC_SUIT_PLANT_BLEND) / (2 * MC_SUIT_PLANT_BLEND)));
  if (step && transition < 1) {
    const previous = host.plants[step - 1];
    host.actor.worldToLocal(previous.position.copy(previous.world));
    correction.lerp(mcSuitPlantCorrection(host, previous, host.previous), 1 - transition);
  }
  // Keep the planted foot in place around the bend. The clip supplies the foot roll and knee motion.
  host.gait.position.copy(correction);
}
