"use strict";

const GROOVE_TAU = Math.PI * 2;
const GROOVE_FADE_MS = 1500;
const GROOVE_PALETTE = [[1, .46, .13], [.33, .62, 1], [.93, .27, .74], [.27, .88, .71]];
const grooveLayers = Array.from({ length: 2 }, () => ({ weight: 0, phase: 0, period: 1, rowWave: 0 }));
const groove = {
  track: null, presence: 0, pulse: 0, swing: 0, driftX: 0, driftY: 0, r: 0, g: 0, b: 0,
  power: 0, from: 0, target: 0, changedAt: 0, startSlope: 0,
};

function smoothGroove(progress) {
  const t = clamp01(progress);
  return t * t * (3 - 2 * t);
}

// Zero at the beat, a rounded peak halfway to the next beat.
function grooveBounce(phase) {
  return .5 - .5 * Math.cos(GROOVE_TAU * phase);
}

function boostGroove(ms, amount) {
  const now = performance.now();
  const ending = V.grooveBoostUntil || 0;
  V.grooveBoostUntil = Math.max(now + ms, ending);
  V.grooveBoostAmount = now < ending ? Math.max(V.grooveBoostAmount, amount) : amount;
}

function protectGrooveName(key, ms = 2400) {
  const seat = V.seat?.[key];
  if (seat) beginGrooveRead(seat, ms);
}

function protectGrooveNames(ms) {
  beginGrooveRead(V, ms);
}

function beginGrooveRead(target, ms) {
  const now = performance.now();
  target.grooveReadFrom = grooveReadAmount(target, now);
  target.grooveReadAt = now;
  target.grooveReadFor = ms;
}

function grooveReadAmount(target, now) {
  const elapsed = now - target.grooveReadAt;
  if (!(elapsed >= 0)) return 0;
  const easeIn = lerp(target.grooveReadFrom, 1, smoothGroove(elapsed / 220));
  return easeIn * smoothGroove((target.grooveReadFor + 650 - elapsed) / 650);
}

function updateGrooveLayer(layer, track, output, weight) {
  layer.weight = 0;
  if (!track || !weight) return;
  const { beat, first } = BGM_GRID[track.name];
  const duration = track.src.buffer.duration;
  const time = (output - track.playbackStart) % duration;
  const phase = (time - first - mcBeatOffsetSeconds) / beat;
  // Taper the reset at the loop boundary without shifting the next downbeat.
  layer.weight = weight * smoothGroove(time / .22) * smoothGroove((duration - time) / .22);
  layer.period = beat;
  layer.phase = phase;
  layer.rowWave = grooveBounce(phase / 16);
  groove.presence += layer.weight;
  groove.pulse += grooveBounce(phase) * layer.weight;
  groove.swing += Math.sin(Math.PI * phase) * layer.weight;
  groove.driftX += Math.sin(GROOVE_TAU * phase / 12) * layer.weight;
  groove.driftY += Math.sin(GROOVE_TAU * phase / 16) * layer.weight;
  const bar = Math.max(0, phase / 4);
  const index = Math.floor(bar);
  const from = GROOVE_PALETTE[index % GROOVE_PALETTE.length];
  const to = GROOVE_PALETTE[(index + 1) % GROOVE_PALETTE.length];
  const next = smoothGroove(bar - index);
  groove.r += lerp(from[0], to[0], next) * layer.weight;
  groove.g += lerp(from[1], to[1], next) * layer.weight;
  groove.b += lerp(from[2], to[2], next) * layer.weight;
}

function updateGroove(now) {
  groove.presence = groove.pulse = groove.swing = groove.driftX = groove.driftY = groove.r = groove.g = groove.b = 0;
  const ctx = SND.ctx;
  const output = ctx?.state === "running" ? audioOutputTime(ctx, now) : -Infinity;
  const incoming = bgmLevelAt(BGM.playing, output);
  const outgoing = bgmLevelAt(BGM.outgoing, output);
  const total = incoming + outgoing;
  const scale = total > 0 ? smoothGroove(total / .12) / total : 0;
  groove.track = incoming > outgoing ? BGM.playing : outgoing > 0 ? BGM.outgoing : null;
  updateGrooveLayer(grooveLayers[0], BGM.playing, output, incoming * scale);
  updateGrooveLayer(grooveLayers[1], BGM.outgoing, output, outgoing * scale);

  const track = groove.track;
  const intro = track?.cued && output - track.playbackStart < 6;
  const boost = now < V.grooveBoostUntil ? V.grooveBoostAmount : 0;
  const target = (intro ? 1 : busy ? .53 : .36) + boost;
  const t = clamp01((now - groove.changedAt) / GROOVE_FADE_MS);
  const remaining = 1 - t;
  const change = groove.target - groove.from;
  groove.power = groove.from + change * smoothGroove(t) + groove.startSlope * GROOVE_FADE_MS * t * remaining ** 2;
  if (target !== groove.target) {
    // Keep the slope when a brief accent ends before it reaches its full strength.
    groove.startSlope = 6 * change * t * remaining / GROOVE_FADE_MS + groove.startSlope * remaining * (1 - 3 * t);
    groove.from = groove.power;
    groove.target = target;
    groove.changedAt = now;
  }
}

function groovePlate(seat, now) {
  const { motion } = seat;
  let lift = 0, squash = 0, sway = 0;
  if (!seat.catPlacement && groove.presence) {
    const reading = Math.max(grooveReadAmount(seat, now), grooveReadAmount(V, now));
    const power = groove.power * (1 - .78 * reading);
    const side = seat.col % 2 ? -1 : 1;
    for (const layer of grooveLayers) {
      if (!layer.weight) continue;
      const row = lerp(seat.row, rows - 1 - seat.row, layer.rowWave);
      const lag = row * .017 + (seat.col % 2) * .027;
      const phase = layer.phase - lag / layer.period;
      const bounce = grooveBounce(phase);
      const weight = layer.weight * power;
      lift += .052 * bounce * weight;
      squash += .014 * (1 - 2 * bounce) * weight;
      sway += side * .016 * Math.sin(Math.PI * phase) * weight;
    }
  }
  motion.scale.set(1 + squash * .58, 1 - squash, 1);
  motion.rotation.z = sway;
  return lift;
}

function grooveCamera(camera, now) {
  if (!groove.presence) return;
  const framing = groove.power * (1 - .73 * grooveReadAmount(V, now));
  camera.translateX(.075 * groove.driftX * framing);
  camera.translateY(.027 * groove.driftY * framing);
  camera.translateZ(-.029 * (groove.pulse - .5 * groove.presence) * framing);
}

function grooveSpot(color, base) {
  if (!groove.presence) return color.copy(base);
  const amount = .085 * groove.power;
  const remaining = 1 - groove.presence * amount;
  return color.setRGB(base.r * remaining + groove.r * amount, base.g * remaining + groove.g * amount, base.b * remaining + groove.b * amount);
}

function grooveMc(host, amount) {
  if (!groove.presence) return;
  const strength = groove.power * amount;
  const bounce = groove.pulse * strength;
  const sway = groove.swing * strength;
  host.head.rotation.x += .043 * bounce;
  host.head.rotation.z += .024 * sway;
  host.body.rotation.z += .019 * sway;
  host.body.position.y += .010 * bounce;
}
