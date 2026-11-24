"use strict";

const groove = { track: null, beat: -1, seconds: 0, pulse: 0, accent: 0, power: 0, bar: 0 };
const GROOVE_PALETTE = [[1, .46, .13], [.33, .62, 1], [.93, .27, .74], [.27, .88, .71]];

function boostGroove(ms, amount) {
  V.grooveBoostAt = performance.now();
  V.grooveBoostLength = ms;
  V.grooveBoostAmount = amount;
}

function protectGrooveName(key, ms = 2400) {
  if (V.seat?.[key]) V.seat[key].readUntil = performance.now() + ms;
}

function grooveHit(elapsed, length) {
  return elapsed < 0 || elapsed >= length ? 0 : (1 - elapsed / length) ** 2;
}

function updateGroove(now) {
  groove.power = groove.pulse = 0;
  groove.track = null;
  const ctx = SND.ctx;
  if (ctx?.state !== "running") return;
  const output = audioOutputTime(ctx, now);
  const track = bgmBeatTrack(output);
  if (!track) return;
  const { beat, first } = BGM_GRID[track.name];
  // A looping buffer restarts at the same first beat. Volume ramps never change its clock.
  const time = (output - track.playbackStart) % track.src.buffer.duration - first - mcBeatOffsetSeconds;
  if (time < 0) return;
  groove.track = track;
  groove.beat = Math.floor(time / beat);
  groove.seconds = time - groove.beat * beat;
  groove.bar = Math.floor(groove.beat / 4);
  const downbeat = groove.beat % 4 === 0;
  groove.accent = downbeat ? (groove.bar % 4 === 0 ? 1.2 : 1) : groove.beat % 2 === 0 ? .78 : .62;
  const intro = track.cued && output - track.playbackStart < 6;
  const boost = (V.grooveBoostAmount || 0) * grooveHit(now - (V.grooveBoostAt || 0), V.grooveBoostLength || 1);
  groove.power = (intro ? 1 : busy ? .53 : .36) + boost;
  groove.pulse = grooveHit(groove.seconds, .23) * groove.accent * groove.power;
}

function groovePlate(seat, now) {
  const { motion } = seat;
  if (!groove.power || seat.catPlacement) {
    motion.scale.setScalar(1);
    motion.rotation.z = 0;
    return 0;
  }
  const pattern = Math.floor(groove.bar / 2) % 4;
  const row = pattern % 2 ? rows - 1 - seat.row : seat.row;
  const side = (seat.col + groove.beat) % 2;
  const delay = row * .017 + side * .027;
  const elapsed = groove.seconds - delay;
  const reading = now < (seat.readUntil || 0) || now < (V.grooveReadUntil || 0);
  const strength = groove.accent * groove.power * (reading ? .22 : 1);
  const lift = grooveHit(elapsed, .25);
  const rebound = grooveHit(elapsed - .055, .17);
  const squash = (.037 * lift - .025 * rebound) * strength;
  motion.scale.set(1 + squash * .58, 1 - squash, 1);
  const tilt = (pattern < 2 ? side : seat.col < cols / 2) ? -1 : 1;
  motion.rotation.z = tilt * strength * .032 * (lift - .43 * rebound);
  return .105 * strength * lift;
}

function grooveCamera(camera, now) {
  if (!groove.power) return;
  const reading = now < (V.grooveReadUntil || 0);
  const framing = (V.camRig ? .70 : 1) * (reading ? .27 : 1);
  camera.translateZ(-.26 * groove.pulse * framing);
  if (groove.beat % 4) return;
  const turn = grooveHit(groove.seconds, .30) * framing * groove.power;
  const sign = groove.bar % 2 ? -1 : 1;
  camera.rotateY(sign * .006 * turn);
  if (groove.bar % 4 === 0) camera.translateX(sign * .075 * turn);
}

function grooveSpot(color, base) {
  if (!groove.power) return color.copy(base);
  const tint = GROOVE_PALETTE[groove.bar % GROOVE_PALETTE.length];
  const flash = groove.beat % 4 ? 0 : grooveHit(groove.seconds, .31);
  const amount = (.058 + flash * .10) * groove.power;
  return color.setRGB(lerp(base.r, tint[0], amount), lerp(base.g, tint[1], amount), lerp(base.b, tint[2], amount));
}

function grooveMc(host, amount) {
  if (!groove.power) return;
  const beat = groove.pulse * amount;
  const side = groove.beat % 2 ? -1 : 1;
  host.head.rotation.x += .093 * beat;
  host.head.rotation.z += side * .042 * beat;
  host.body.rotation.z += side * .038 * beat;
  host.body.position.y += .020 * beat;
}
