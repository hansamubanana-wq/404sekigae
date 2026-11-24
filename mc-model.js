"use strict";

// 丸いシルエットを優先し、動く部位ごとに形をまとめて描画する。
function buildMcModel(mergeGeometries) {
  const actor = new THREE.Group();
  actor.name = "MC";
  const body = new THREE.Group();
  actor.add(body);
  const skin = 0xea9a62, hair = 0x25172c, hairRidge = 0x493047;
  const navy = 0x26478a, ink = 0x11172f, wine = 0xc63866, ivory = 0xead9c5;
  const lit = stdMat(0xffffff, { vertexColors: true, roughness: .68, envMapIntensity: .35 });
  const faceInk = new THREE.MeshBasicMaterial({ vertexColors: true });
  const sphere = new THREE.SphereGeometry(1, 14, 9);
  const portrait = new THREE.SphereGeometry(1, 22, 14);
  const bulb = (x, y, z, width, height, depth, color, tilt = 0) => [
    (width >= .25 ? portrait : sphere).clone().scale(width, height, depth).rotateZ(tilt).translate(x, y, z), color,
  ];
  const outline = (points, z, color) => {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    for (const point of points.slice(1)) shape.lineTo(...point);
    shape.closePath();
    return [new THREE.ShapeGeometry(shape).translate(0, 0, z), color];
  };
  const pack = (parent, pieces, material = lit) => {
    const parts = pieces.map(([geometry, color]) => {
      if (geometry.index) {
        const source = geometry;
        geometry = source.toNonIndexed();
        source.dispose();
      }
      // 部位ごとに UV の有無を揃え、色は頂点に持たせる。
      geometry.deleteAttribute("uv");
      const rgb = new THREE.Color(color);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    const joined = mergeGeometries(parts);
    parts.forEach(geometry => geometry.dispose());
    const mesh = new THREE.Mesh(joined, material);
    parent.add(mesh);
    return mesh;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const node = new THREE.Group();
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  };

  const jacket = new THREE.SphereGeometry(1, 24, 18).scale(.361, .375, .225);
  const positions = jacket.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const blue = new THREE.Color(navy);
  const lightBlue = new THREE.Color(0x4165ad);
  const shade = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    shade.copy(blue).lerp(lightBlue, clamp01((positions.getY(i) + .24) * 1.3)).toArray(colors, i * 3);
  }
  jacket.translate(0, 1.055, 0);
  jacket.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sequins = canvasTex(makeCanvas(96, 96));
  const context = sequins.image.getContext("2d");
  context.fillStyle = "#b8c2d6";
  context.fillRect(0, 0, 96, 96);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      const tint = (row * 19 + col * 31) % 9;
      context.fillStyle = tint < 2 ? "#ffffff" : tint < 5 ? "#e6eeff" : "#96a7ce";
      context.fillRect(col * 8 + (row % 2), row * 8 + 2, tint < 2 ? 3 : 2, 2);
    }
  }
  sequins.colorSpace = THREE.SRGBColorSpace;
  const coat = new THREE.Mesh(jacket, stdMat(0xffffff, {
    map: sequins, vertexColors: true, roughness: .47, metalness: .23, envMapIntensity: .6,
  }));
  body.add(coat);
  pack(body, [
    bulb(0, .79, 0, .25, .155, .175, ink),
    bulb(0, 1.395, .019, .12, .148, .113, skin),
    outline([[-.114,1.336],[.114,1.336],[.048,.901],[-.036,.901]], .204, 0xd6c2aa),
    outline([[-.245,1.30],[-.118,1.345],[-.035,.940],[-.153,1.118],[-.121,1.147]], .219, ink),
    outline([[.245,1.30],[.121,1.345],[.034,.940],[.153,1.118],[.12,1.147]], .219, ink),
    bulb(0, 1.297, .246, .030, .026, .019, wine),
    outline([[-.132,1.344],[-.019,1.321],[-.019,1.272],[-.127,1.254]], .242, wine),
    outline([[.132,1.344],[.019,1.321],[.019,1.272],[.127,1.254]], .242, wine),
    outline([[.173,1.172],[.248,1.183],[.242,1.141],[.174,1.140]], .205, 0xf0d591),
    bulb(-.014,.926,.204,.019,.019,.012,0xffc76a),
  ]);

  const head = group(body, 0, 1.675, .045);
  pack(head, [
    bulb(0, 0, 0, .300, .281, .246, skin),
    bulb(-.289, -.008, -.012, .060, .071, .051, skin, -.2),
    bulb(.289, -.008, -.012, .060, .071, .051, skin, .2),
    bulb(0, -.037, .231, .054, .041, .046, 0xf6af76),
    bulb(-.191,-.079,.185,.061,.028,.022,0xe27f67),
    bulb(.191,-.079,.185,.061,.028,.022,0xe27f67),
    bulb(0,.135,-.063,.309,.191,.227,hair),
    bulb(-.247,.085,-.037,.074,.137,.164,hair,-.19),
    bulb(.247,.085,-.037,.074,.137,.164,hair,.19),
    bulb(-.045,.250,.060,.272,.122,.222,hair,.20),
    bulb(.028,.283,.117,.218,.088,.138,hairRidge,.22),
    bulb(.073,.319,.102,.165,.061,.101,hair,.21),
    bulb(.040,.292,.209,.142,.035,.047,0x654052,.23),
  ]);

  const eyes = [-1, 1].map(side => {
    const eye = group(head, side * .115, .033, .222);
    eye.rotation.y = side * .25;
    pack(eye, [
      bulb(0,0,0,.092,.106,.034,ink),
      bulb(0,.002,.018,.079,.091,.027,0xe8dbc8),
      bulb(-.006,-.005,.040,.036,.056,.012,0x274f6b),
      bulb(-.005,-.004,.048,.025,.047,.012,0x101836),
      bulb(-.019,.022,.057,.015,.017,.008,0xf2eadc),
    ], faceInk);
    const brow = group(head, side * .116, .171, .211);
    pack(brow, [bulb(0,0,0,.073,.019,.023,hair,side * -.17)], faceInk);
    return { eye, brow, side };
  });
  const mouth = group(head, 0, -.133, .231);
  pack(mouth, [
    bulb(0,0,0,.117,.052,.023,0x47233a),
    bulb(0,.017,.020,.091,.015,.009,ivory),
    bulb(.014,-.022,.020,.052,.013,.008,0xdf6681),
  ], faceInk);
  const smile = group(head, 0, -.127, .234);
  // 笑顔の弧と歯を一体にして、決めの瞬間だけ切り替える。
  const grin = (top, bottom, x, depth, color) => {
    const shape = new THREE.Shape();
    shape.moveTo(-x, top);
    shape.quadraticCurveTo(0, top - .053, x, top);
    shape.quadraticCurveTo(x * .63, bottom - .028, 0, bottom);
    shape.quadraticCurveTo(-x * .63, bottom - .028, -x, top);
    return [new THREE.ShapeGeometry(shape).translate(0, 0, depth), color];
  };
  pack(smile, [grin(.038,-.077,.140,.004,0x51213d),grin(.026,-.030,.110,.009,ivory)], faceInk);

  const armLength = .27, forearmLength = .245;
  const arms = [-1, 1].map(side => {
    const upper = group(body), lower = group(body), palm = group(body);
    pack(upper, [bulb(0,armLength*.5,0,.100,.190,.109,navy)]);
    pack(lower, [bulb(0,forearmLength*.48,0,.085,.146,.090,navy),bulb(0,.215,0,.085,.042,.087,ivory)]);
    const fist = pack(palm, [
      bulb(0,0,0,.092,.098,.075,skin),
      bulb(-side*.063,.017,.028,.039,.066,.042,0xf6ad79,side * .36),
    ]);
    const open = side === 1 ? pack(palm, [
      bulb(0,.015,0,.084,.087,.050,skin),
      bulb(-.051,.095,.005,.025,.078,.029,skin,.17),
      bulb(-.008,.111,.008,.024,.090,.027,skin,.03),
      bulb(.035,.102,.008,.023,.080,.027,skin,-.15),
      bulb(.063,.073,.005,.020,.062,.024,skin,-.25),
      bulb(-.074,.018,.021,.026,.050,.027,0xf6ad79,.50),
    ]) : null;
    return { side, upper, lower, palm, fist, open };
  });
  const mic = group(arms[0].palm, -.015,.012,.010);
  pack(mic, [
    [new THREE.CylinderGeometry(.038,.026,.240,12).translate(0,.014,0),0x252840],
    [new THREE.CylinderGeometry(.041,.040,.025,12).translate(0,.127,0),0x7d89ae],
    bulb(0,.165,0,.059,.061,.059,0xbdc4d1),
    bulb(-.018,.182,.027,.019,.018,.019,0xf2ddbc),
  ]);

  const legs = [-1, 1].map(side => {
    const hip = group(actor, side * .137, .791, 0);
    const knee = group(hip, 0, -.326, 0);
    const foot = group(knee, 0, -.335, 0);
    pack(hip, [bulb(0,-.15,0,.128,.211,.142,ink)]);
    pack(knee, [bulb(0,-.136,0,.100,.197,.109,ink)]);
    pack(foot, [
      bulb(0,-.032,.100,.116,.088,.176,0x151631),
      [new V.RoundedBox(.205,.036,.36,2,.014).translate(0,-.112,.090), 0x323a5a],
      bulb(0,.013,.129,.089,.028,.121,0x243259),
    ]);
    return { hip, knee, foot, side, ankle: v3(), footYaw: 0, footPitch: 0 };
  });
  sphere.dispose();
  portrait.dispose();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.95, .72), new THREE.MeshBasicMaterial({
    map: V.tex.glow, color: 0x100c24, opacity: .66, transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024;
  actor.add(shadow);

  return { actor, body, head, eyes, mouth, smile, arms, mic, legs, armLength, forearmLength,
    shoulder: v3(), wrist: v3(), elbow: v3(), axis: v3(), bend: v3(), up: v3(0, 1, 0), down: v3(0, -1, 0),
    heel: v3(0,-.130,-.076), heelOffset: v3(), right: v3(1,0,0),
    inverseHip: new THREE.Quaternion(), footRotation: new THREE.Quaternion(), footPitch: new THREE.Quaternion() };
}

function placeMcArm(host, arm, x, y, z) {
  const { shoulder, wrist, elbow, axis, bend, up, armLength: a, forearmLength: b } = host;
  shoulder.set(arm.side * .298, 1.277, .012);
  wrist.set(x, y, z);
  axis.subVectors(wrist, shoulder);
  const distance = Math.min(axis.length(), a + b - .002);
  axis.normalize();
  wrist.copy(shoulder).addScaledVector(axis, distance);
  bend.set(arm.side, -.65, -.25).addScaledVector(axis, -axis.dot(bend)).normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  elbow.copy(shoulder).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
  arm.upper.position.copy(shoulder);
  arm.upper.quaternion.setFromUnitVectors(up, axis.subVectors(elbow, shoulder).normalize());
  arm.lower.position.copy(elbow);
  arm.lower.quaternion.setFromUnitVectors(up, axis.subVectors(wrist, elbow).normalize());
  arm.palm.position.copy(wrist);
  arm.palm.quaternion.copy(arm.lower.quaternion);
}

function aimMcMic(host) {
  // マイクの先を口の横に向け、正面から表情が見えるようにする。
  const { palm } = host.arms[0];
  host.axis.set(.006, 1.565, .30).sub(palm.position).applyQuaternion(host.armRotation.copy(palm.quaternion).invert()).normalize();
  host.mic.quaternion.setFromUnitVectors(host.up, host.axis);
}

// Quaternius Walk supplies the swing from .025 to .725 s and the stride starting at .100 s.
// The hand samples are shoulder-relative; positions are scaled to this puppet's limbs.
const MC_WALK_TRAVEL = [0, .023, .09, .20, .38, .65, .90, .99, 1];
const MC_WALK_CLEARANCE = [0, .034, .088, .112, .104, .081, .050, .024, 0];
const MC_WALK_HIPS = [.851, .917, .996, .974, .926, .879, .853, .867, .985, .975, .905, .866, .851];
const MC_WALK_LEFT_HAND_Y = [-.608, -.695, -.747, -.731, -.649, -.568, -.540, -.634, -.736, -.716, -.624, -.580, -.608];
const MC_WALK_LEFT_HAND_Z = [.464, .249, -.031, -.276, -.501, -.629, -.669, -.518, -.187, .194, .437, .511, .464];
const MC_WALK_RIGHT_HAND_Y = [-.672, -.761, -.755, -.706, -.633, -.584, -.593, -.660, -.735, -.734, -.678, -.633, -.672];
const MC_WALK_RIGHT_HAND_Z = [-.488, -.190, .070, .277, .441, .507, .491, .363, .094, -.218, -.432, -.547, -.488];

function mcWalkCurve(samples, phase, loop = false) {
  const last = samples.length - 1;
  const sample = phase * last;
  const index = Math.min(last - 1, Math.floor(sample));
  const t = sample - index;
  const a = samples[index], b = samples[index + 1];
  const before = samples[index > 0 ? index - 1 : loop ? last - 1 : 0];
  const after = samples[index + 2 <= last ? index + 2 : loop ? 1 : last];
  return lerp(a, b, t * t * (3 - 2 * t)) + .5 * t * (1 - t) * ((1 - t) * (b - before) - t * (after - a));
}

function poseMcFeet(host, t, stride) {
  const { actor, legs, up, down, axis, bend, elbow, inverseHip, footRotation } = host;
  const upper = .326, lower = .335, legLength = upper + lower;
  const stand = ease.inOut(clamp01((t - MC_LAST_STEP) / (MC_WALK_END - MC_LAST_STEP)));
  let hipHeight = lerp(.726 + (mcWalkCurve(MC_WALK_HIPS, stride, true) - .85) * .29, .791, stand);
  actor.updateMatrixWorld();
  for (const leg of legs) {
    const next = leg.marks.findIndex(mark => t < mark.at);
    const landed = leg.marks[next < 0 ? leg.marks.length - 1 : Math.max(0, next - 1)];
    const upcoming = next > 0 ? leg.marks[next] : landed;
    const swing = landed.at === 0 ? .46 : .59;
    const phase = next > 0 ? clamp01((t - upcoming.at + swing) / swing) : 0;
    const travel = clamp01(mcWalkCurve(MC_WALK_TRAVEL, phase));
    leg.ankle.lerpVectors(landed.position, upcoming.position, travel);
    leg.ankle.y += Math.max(0, mcWalkCurve(MC_WALK_CLEARANCE, phase));
    const yaw = lerp(landed.yaw, upcoming.yaw, travel);
    const heelStrike = .29;
    leg.footPitch = phase > 0 ? -heelStrike * ease.inOut(clamp01((phase - .46) / .54)) :
      -heelStrike * (1 - ease.inOut(clamp01((t - landed.at) / MC_SOLE_AT))) * (landed.at > 0 ? 1 : 0);
    // 接地したかかとを床の同じ点に置いたまま、靴底を下ろす。
    host.heelOffset.copy(host.heel).applyAxisAngle(host.right, leg.footPitch).negate().add(host.heel).applyAxisAngle(up, yaw);
    leg.ankle.add(host.heelOffset);
    actor.worldToLocal(leg.ankle);
    leg.footYaw = yaw - actor.rotation.y;
    const span = Math.hypot(leg.ankle.x - leg.hip.position.x, leg.ankle.z);
    hipHeight = Math.min(hipHeight, leg.ankle.y + Math.sqrt(Math.max(0, (legLength - .001) ** 2 - span ** 2)));
  }
  for (const { hip, knee, foot, ankle, footYaw, footPitch } of legs) {
    hip.position.y = hipHeight;
    axis.subVectors(ankle, hip.position);
    const length = Math.min(legLength - .0001, axis.length());
    axis.normalize();
    bend.set(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
    const along = (upper ** 2 + length ** 2 - lower ** 2) / (2 * length);
    elbow.copy(hip.position).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper ** 2 - along ** 2)));
    hip.quaternion.setFromUnitVectors(down, axis.subVectors(elbow, hip.position).normalize());
    inverseHip.copy(hip.quaternion).invert();
    knee.quaternion.setFromUnitVectors(down, axis.subVectors(ankle, elbow).normalize().applyQuaternion(inverseHip));
    footRotation.setFromAxisAngle(up, footYaw).multiply(host.footPitch.setFromAxisAngle(host.right, footPitch));
    foot.quaternion.copy(knee.quaternion).invert().multiply(inverseHip).multiply(footRotation);
  }
  return hipHeight - .791;
}

function poseMc(host, t, walkTime, walking, voice, cameraAngle = 0, musicHit = 0, musicMic = 0, anticipation = 0, scan = 0) {
  const phase = walkTime * Math.PI / MC_STEP_INTERVAL;
  const stride = walkTime % (2 * MC_STEP_INTERVAL) / (2 * MC_STEP_INTERVAL);
  const sway = walking * Math.sin(phase);
  const lz = walking * mcWalkCurve(MC_WALK_LEFT_HAND_Z, stride, true);
  const rz = walking * mcWalkCurve(MC_WALK_RIGHT_HAND_Z, stride, true);
  const ly = walking * (mcWalkCurve(MC_WALK_LEFT_HAND_Y, stride, true) + .68);
  const ry = walking * (mcWalkCurve(MC_WALK_RIGHT_HAND_Y, stride, true) + .68);
  const stance = host.legs[0].marks ? poseMcFeet(host, walkTime, stride) : 0;
  host.body.position.y = stance + .008 * (1 - walking) * Math.sin(t * 4) + .025 * anticipation;
  host.body.rotation.z = sway * .045;
  host.body.rotation.y = (lz - rz) * .043;

  const welcome = ease.inOut(clamp01((t - MC_LINES[0].at) / .34)) * (1 - ease.inOut(clamp01((t - 2.69) / .48)));
  const fist = Math.max(musicHit, ease.out(clamp01((t - (MC_FANFARE_AT - .29)) / .28)) *
    (1 - ease.inOut(clamp01((t - (MC_FANFARE_AT + 1.02)) / .77))));
  const reveal = ease.inOut(clamp01((t - (MC_LINES[2].at - .13)) / .42)) *
    (1 - ease.inOut(clamp01((t - (MC_SUBTITLE_OUT - .28)) / .74)));
  const speaking = Math.max(musicMic, ease.out(clamp01(t / .22)) * (1 - ease.inOut(clamp01((t - MC_SUBTITLE_OUT) / .52))));
  const side = Math.max(welcome, reveal, fist);
  placeMcArm(host, host.arms[0], lerp(-.339,-.155,speaking), lerp(.84 + ly * .32,1.443,speaking) - .10 * anticipation, lerp(.03 + lz * .28,.36,speaking));
  placeMcArm(host, host.arms[1], lerp(.351,.665,side) - .12 * fist, .84 + ry * .32 + .375 * welcome + .815 * fist + .388 * reveal,
    .02 + rz * .28 + .11 * welcome + .08 * fist + .28 * reveal);
  const free = host.arms[1];
  free.open.visible = Math.max(welcome, reveal) > .35 && fist < .40;
  free.fist.visible = !free.open.visible;
  aimMcMic(host);

  const glance = walking * THREE.MathUtils.clamp(cameraAngle * .72, -.69, .65);
  host.head.rotation.set(-.031 * voice - .050 * fist - .055 * anticipation,
    glance - .09 * reveal + .22 * anticipation * scan, .07 * welcome + sway * .034 - .08 * fist);
  const blinkPhase = Math.min(Math.abs(t - .85), Math.abs(t - 3.31), Math.abs(t - 5.67), Math.abs(t - 7.90), Math.abs(t - 10.72), Math.abs(t - 12.40));
  const blink = clamp01(blinkPhase / .082);
  for (const { eye, brow, side: eyeSide } of host.eyes) {
    eye.scale.y = Math.max(.07, blink * (1 + voice * .10 - fist * .16));
    brow.position.y = .168 + .020 * voice + .022 * fist + .010 * reveal * eyeSide;
    brow.rotation.z = eyeSide * (.18 * welcome + .19 * fist - .08 * reveal);
  }
  host.smile.visible = fist > .50 && (t >= MC_FANFARE_AT || musicHit > .7);
  host.smile.scale.y = .72 + .48 * voice;
  host.mouth.visible = !host.smile.visible;
  host.mouth.scale.set(1 + .17 * welcome + .14 * fist, .19 + .91 * voice + .13 * welcome, 1);
}

function poseMcWaiting(host, t, voice, gesture, strong) {
  const sway = Math.sin(t * 1.65);
  host.body.position.y = .012 + .012 * sway;
  host.body.rotation.z = .028 * sway - .035 * gesture;
  host.body.rotation.y = 0;
  for (const { hip, knee, foot } of host.legs) {
    hip.position.y = .791;
    hip.quaternion.identity();
    knee.quaternion.identity();
    foot.quaternion.identity();
  }

  placeMcArm(host, host.arms[0], lerp(-.339, -.155, gesture), lerp(.84, 1.443, gesture), lerp(.03, .36, gesture));
  placeMcArm(host, host.arms[1], .35 + .16 * gesture, .84 + (strong ? .62 : .31) * gesture, .06 + .18 * gesture);
  const free = host.arms[1];
  free.open.visible = gesture > .35 && !strong;
  free.fist.visible = !free.open.visible;
  aimMcMic(host);

  host.head.rotation.set(-.025 * sway - .09 * gesture, .09 * Math.sin(t * .73), .026 * sway);
  const blink = clamp01(Math.abs(t % 3.83 - 3.42) / .082);
  for (const { eye, brow, side } of host.eyes) {
    eye.scale.y = Math.max(.07, blink * (1 + .10 * voice));
    brow.position.y = .168 + .034 * gesture;
    brow.rotation.z = side * .17 * gesture;
  }
  host.smile.visible = false;
  host.mouth.visible = true;
  host.mouth.scale.set(1 + .13 * gesture, .19 + .94 * voice, 1);
}
