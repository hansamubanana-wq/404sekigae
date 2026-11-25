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
  const smallSphere = new THREE.SphereGeometry(1, 8, 6);
  const bulb = (x, y, z, width, height, depth, color, tilt = 0) => [
    (width >= .25 ? portrait : sphere).clone().scale(width, height, depth).rotateZ(tilt).translate(x, y, z), color,
  ];
  const detail = (x, y, z, width, height, depth, color) => [
    smallSphere.clone().scale(width, height, depth).translate(x, y, z), color,
  ];
  const finger = (points, radius, color) => {
    const curve = new THREE.CatmullRomCurve3(points.map(point => v3(...point)));
    const tip = points[points.length - 1];
    return [[new THREE.TubeGeometry(curve, 6, radius, 6), color], detail(...tip, radius, radius, radius, color)];
  };
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
  // 上着の下だけを動かす。元のメッシュに変形を足し、描画は1回のまま。
  const hem = positions.clone();
  for (let i = 0; i < hem.count; i++) {
    const amount = clamp01((1.04 - hem.getY(i)) / .32);
    hem.setXYZ(i, hem.getX(i) + .023 * amount, hem.getY(i), hem.getZ(i) + .014 * amount);
  }
  jacket.morphAttributes.position = [hem];
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
    bulb(0, 1.403, .019, .124, .155, .113, skin),
    outline([[-.114,1.336],[.114,1.336],[.048,.901],[-.036,.901]], .204, 0xd6c2aa),
    outline([[-.245,1.30],[-.118,1.345],[-.035,.940],[-.153,1.118],[-.121,1.147]], .219, ink),
    outline([[.245,1.30],[.121,1.345],[.034,.940],[.153,1.118],[.12,1.147]], .219, ink),
    outline([[.173,1.172],[.248,1.183],[.242,1.141],[.174,1.140]], .205, 0xf0d591),
    bulb(-.014,.926,.204,.019,.019,.012,0xffc76a),
  ]);
  const bow = group(body, 0, 1.297, .242);
  pack(bow, [
    bulb(0,0,.004,.030,.026,.019,wine),
    outline([[-.132,.047],[-.019,.024],[-.019,-.025],[-.127,-.043]],0,wine),
    outline([[.132,.047],[.019,.024],[.019,-.025],[.127,-.043]],0,wine),
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
  ]);
  const fringe = group(head, 0, .17, .045);
  pack(fringe, [
    bulb(-.045,.080,.015,.272,.122,.222,hair,.20),
    bulb(.028,.113,.072,.218,.088,.138,hairRidge,.22),
    bulb(.073,.149,.057,.165,.061,.101,hair,.21),
    bulb(.040,.122,.164,.142,.035,.047,0x654052,.23),
  ]);

  const eyes = [-1, 1].map(side => {
    const eye = group(head, side * .115, .033, .222);
    eye.rotation.y = side * .25;
    pack(eye, [
      bulb(0,0,0,.092,.106,.034,ink),
      bulb(0,.002,.018,.079,.091,.027,0xe8dbc8),
    ], faceInk);
    const pupil = group(eye);
    pack(pupil, [
      bulb(-.006,-.005,.040,.036,.056,.012,0x274f6b),
      bulb(-.005,-.004,.048,.025,.047,.012,0x101836),
      bulb(-.019,.022,.057,.015,.017,.008,0xf2eadc),
    ], faceInk);
    const brow = group(head, side * .116, .171, .211);
    pack(brow, [bulb(0,0,0,.073,.019,.023,hair,side * -.17)], faceInk);
    return { eye, pupil, brow, side };
  });
  const mouth = new THREE.Mesh(mcMouthGeometry(ivory), faceInk);
  mouth.position.set(0, -.129, .250);
  head.add(mouth);

  const armLength = .27, forearmLength = .245;
  const thumb = 0xf6ad79;
  // 袖口の外周から内側の折り返しまで、手首を一周する。
  const cuff = new THREE.LatheGeometry([
    [.048,.196],[.063,.196],[.069,.203],[.068,.220],
    [.061,.242],[.054,.249],[.046,.248],[.045,.241],[.048,.196],
  ].map(([radius, along]) => new THREE.Vector2(radius, along)), 16);
  const arms = [-1, 1].map(side => {
    const upper = group(body), lower = group(body), palm = group(body);
    pack(upper, [
      bulb(0,.120,0,.100,.188,.109,navy),
      detail(0,0,0,.095,.095,.101,navy),
    ]);
    pack(lower, [
      bulb(0,.108,0,.085,.155,.090,navy),
      detail(0,0,0,.080,.080,.083,navy),
      [cuff.clone(),ivory],
      detail(side*.064,.212,.018,.006,.009,.009,0xc79956),
      detail(0,.244,0,.049,.035,.044,skin),
    ]);
    if (side < 0) return { side, upper, lower, palm };

    // +Y runs to the fingertips and -Z to the thumb, with the palm facing inward at rest.
    const fist = pack(palm, [
      bulb(-.007,.044,.005,.061,.073,.066,skin),
      ...finger([[.005,.013,-.042],[-.011,.041,-.067],[-.038,.059,-.048]],.019,thumb),
    ]);
    const open = pack(palm, [
      bulb(-.005,.062,.004,.038,.091,.065,skin,-.07),
      ...finger([[0,.025,-.041],[-.008,.046,-.072],[-.023,.073,-.085]],.017,thumb),
    ]);
    return { side, upper, lower, palm, fist, open };
  });
  cuff.dispose();

  // 指のかたまりは柄に沿って手前から裏へ曲げ、親指は人差し指側の上から添える。
  const handleX = .048;
  const curlStart = -1.74, curlEnd = 2.65;
  const mitten = new THREE.LatheGeometry([
    [.0268,.039],[.0268,-.040],[.032,-.054],[.046,-.063],[.061,-.058],
    [.072,-.046],[.076,-.025],[.075,.026],[.065,.046],[.049,.056],[.034,.051],[.0268,.039],
  ].map(([radius, along]) => new THREE.Vector2(radius, along)), 14, curlStart, curlEnd - curlStart);
  pack(arms[0].palm, [
    bulb(-.014,.001,-.013,.036,.069,.052,skin),
    [mitten.translate(handleX,0,0),skin],
    bulb(handleX + .050 * Math.sin(curlEnd),-.004,.050 * Math.cos(curlEnd),.021,.058,.018,skin),
    ...finger([[-.024,.020,-.024],[.007,.039,-.044],[.040,.054,-.047],[.056,.077,-.045]],.017,thumb),
    [new THREE.CylinderGeometry(.027,.023,.223,12).translate(handleX,.010,0),0x252840],
    [new THREE.CylinderGeometry(.041,.034,.021,12).translate(handleX,.117,0),0x7d89ae],
    bulb(handleX,.150,0,.052,.054,.052,0xbdc4d1),
    detail(handleX-.018,.164,.033,.016,.016,.013,0xf2ddbc),
  ]);

  const legs = [-1, 1].map(side => {
    const hip = group(actor, side * .137, .791, 0);
    const knee = group(hip, 0, -.326, 0);
    const foot = group(knee, 0, -.335, 0);
    pack(hip, [bulb(0,-.146,0,.128,.210,.142,ink),detail(0,0,0,.111,.106,.128,ink)]);
    pack(knee, [bulb(0,-.140,0,.100,.197,.109,ink),detail(0,0,0,.093,.100,.104,ink)]);
    pack(foot, [
      bulb(0,-.032,.100,.116,.088,.176,0x151631),
      [new V.RoundedBox(.205,.036,.36,2,.014).translate(0,-.112,.090), 0x323a5a],
      bulb(0,.013,.129,.089,.028,.121,0x243259),
    ]);
    return { hip, knee, foot, side, ankle: v3(), footYaw: 0, footPitch: 0 };
  });
  sphere.dispose();
  portrait.dispose();
  smallSphere.dispose();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .86), new THREE.MeshBasicMaterial({
    map: V.tex.softShadow, color: 0x050613, opacity: .63, transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024;
  actor.add(shadow);

  return { actor, shadow, body, head, eyes, mouth, coat, bow, fringe, arms, legs, armLength, forearmLength,
    voiceShape: [.5,.5],
    motion: { at: null, blinkAt: 0, fabric: 0, fabricSpeed: 0, hair: 0, hairSpeed: 0, spread: .5, opening: .5 },
    shoulder: v3(), wrist: v3(), elbow: v3(), axis: v3(), bend: v3(), up: v3(0, 1, 0), down: v3(0, -1, 0),
    handAcross: v3(), handDepth: v3(), handBasis: new THREE.Matrix4(), handRoll: new THREE.Quaternion(), micRest: v3(.16,.91,.39).normalize(),
    heel: v3(0,-.130,-.076), heelOffset: v3(), right: v3(1,0,0),
    inverseHip: new THREE.Quaternion(), footRotation: new THREE.Quaternion(), footPitch: new THREE.Quaternion() };
}

function mcMouthGeometry(ivory) {
  // 静かな笑顔、あ・い・う・お。同じ頂点で口の内側、上の歯、奥の舌を変形する。
  const shapes = [
    [.103,.008,.013,.020,.0],
    [.130,.025,.083,.014,.19],
    [.137,.018,.026,.020,.33],
    [.063,.018,.028,.002,.12],
    [.083,.031,.061,.004,.16],
  ];
  const strips = [
    { color: 0x47233a, from: -1, to: 1, depth: 0 },
    { color: ivory, from: -.80, to: .80, depth: .002 },
    { color: 0xdf6681, from: -.49, to: .54, depth: .003 },
  ];
  const segments = 12, rowSize = segments + 1;
  const colors = [], indices = [];
  for (const [i, strip] of strips.entries()) {
    const color = new THREE.Color(strip.color);
    for (let col = 0; col < rowSize * 2; col++) colors.push(color.r,color.g,color.b);
    for (let col = 0; col < segments; col++) {
      const a = i * rowSize * 2 + col, b = a + rowSize;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const frames = shapes.map(([width,upper,lower,corner,teeth]) => {
    const vertices = [];
    for (const [i, strip] of strips.entries()) {
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col <= segments; col++) {
          const phase = col / segments;
          const u = lerp(strip.from,strip.to,phase);
          const arch = Math.sqrt(Math.max(0,1 - u*u));
          const tip = Math.sin(Math.PI * phase);
          const top = upper * arch + corner * u*u;
          const bottom = -lower * arch + corner * u*u;
          let along = row;
          if (i === 1) along = .10 + row * teeth * tip;
          if (i === 2) along = .89 - (1 - row) * (teeth > 0 ? .18 : 0) * tip;
          const x = width * u;
          const y = lerp(top,bottom,along);
          vertices.push(x,y,strip.depth - 2.2*x*x + .19*y);
        }
      }
    }
    return new THREE.Float32BufferAttribute(vertices,3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position",frames[0]);
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geometry.morphAttributes.position = frames.slice(1);
  return geometry;
}

function animateMcDetails(host, time, voice, accent, drive, cameraAngle) {
  const { motion, voiceShape } = host;
  if (motion.at === null || time < motion.at) {
    motion.blinkAt = time + 1.2 + Math.random()*1.8;
    motion.at = time;
  }
  const dt = Math.min(.034,time - motion.at);
  motion.at = time;
  if (time > motion.blinkAt + .12) motion.blinkAt = time + 1.8 + Math.random()*3.1;
  const blink = lerp(.065,1,smoothGroove(Math.abs(time - motion.blinkAt) / .092));
  const glance = smoothGroove(.7 + .65 * Math.sin(time * 1.16));
  const gazeX = lerp(.023 * Math.sin(time*.86),.025 * Math.tanh(cameraAngle * 3),glance);
  for (const { eye,pupil,brow,side } of host.eyes) {
    eye.scale.y = blink * (1 + .07 * accent);
    pupil.position.set(gazeX, .006 * Math.sin(time*1.2) + .004 * accent, -.20*Math.abs(gazeX));
    brow.position.y = .168 + .018 * voice + .037 * accent + .010 * gazeX * side;
    brow.rotation.z = side * (.04 + .14 * accent);
  }

  const response = Math.min(1,dt * 22);
  motion.spread = lerp(motion.spread,voiceShape[0],response);
  motion.opening = lerp(motion.opening,voiceShape[1],response);
  const active = smoothGroove(voice*1.40);
  const spread = motion.spread;
  const opening = motion.opening;
  const weights = host.mouth.morphTargetInfluences;
  weights[0] = active * spread * opening;
  weights[1] = active * spread * (1 - opening);
  weights[2] = active * (1 - spread) * (1 - opening);
  weights[3] = active * (1 - spread) * opening;

  // バネを別々の速さにして、裾・蝶ネクタイと前髪に少し違う遅れを出す。
  motion.fabricSpeed += (92 * (drive - motion.fabric) - 14 * motion.fabricSpeed) * dt;
  motion.fabric += motion.fabricSpeed * dt;
  motion.hairSpeed += (125 * (drive - motion.hair) - 16 * motion.hairSpeed) * dt;
  motion.hair += motion.hairSpeed * dt;
  host.bow.rotation.z = .11 * motion.fabric;
  host.fringe.rotation.x = .10 * motion.hair;
  host.fringe.rotation.z = .042 * motion.hair;
  host.coat.morphTargetInfluences[0] = .70 * motion.fabric;
  host.coat.scale.z = 1 + .015 * Math.sin(time * 2.1);
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
}

function orientMcHand(host, palm, direction, roll) {
  const { right, handAcross, handDepth, handBasis, handRoll, up } = host;
  handDepth.crossVectors(right, direction).normalize();
  handAcross.crossVectors(direction, handDepth);
  palm.quaternion.setFromRotationMatrix(handBasis.makeBasis(handAcross, direction, handDepth));
  palm.quaternion.multiply(handRoll.setFromAxisAngle(up, roll));
}

function poseMcHands(host, speaking, presentation, gesture) {
  const [grip, free] = host.arms;
  const { axis, head, up } = host;
  // Aim just below and in front of the moving mouth, with the handle tilted down.
  axis.set(-.055,-.115,.35).applyQuaternion(head.quaternion).add(head.position).sub(grip.palm.position).normalize();
  axis.lerp(host.micRest, 1 - speaking).normalize();
  orientMcHand(host, grip.palm, axis, -.15 + .27 * gesture);
  axis.copy(up).applyQuaternion(free.lower.quaternion);
  orientMcHand(host, free.palm, axis, -1.25 * presentation);
}

// Quaternius Walk supplies the swing from .025 to .725 s and the stride starting at .100 s.
// The hand samples are shoulder-relative; positions are scaled to this puppet's limbs.
const MC_WALK_TRAVEL = [0, .045, .17, .33, .51, .69, .84, .95, 1];
const MC_WALK_CLEARANCE = [0, .009, .021, .029, .026, .02, .016, .010, 0];
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
  let hipHeight = lerp(.786 + (mcWalkCurve(MC_WALK_HIPS, stride, true) - .85) * .032, .791, stand);
  actor.updateMatrixWorld();
  for (const leg of legs) {
    const next = leg.marks.findIndex(mark => t < mark.at);
    const landed = leg.marks[next < 0 ? leg.marks.length - 1 : Math.max(0, next - 1)];
    const upcoming = next > 0 ? leg.marks[next] : landed;
    const swing = upcoming.at === MC_STEP_INTERVAL ? .46 : .64;
    const phase = next > 0 ? clamp01((t - upcoming.at + swing) / swing) : 0;
    const travel = clamp01(mcWalkCurve(MC_WALK_TRAVEL, phase));
    leg.ankle.lerpVectors(landed.position, upcoming.position, travel);
    leg.ankle.y += Math.max(0, mcWalkCurve(MC_WALK_CLEARANCE, phase));
    const yaw = lerp(landed.yaw, upcoming.yaw, travel);
    const heelStrike = .25;
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

function poseMc(host, t, walkTime, walking, voice, cameraAngle = 0, musicHit = 0, musicMic = 0, anticipation = 0, scan = 0, time = 0, phrase = 0) {
  const phase = walkTime * Math.PI / MC_STEP_INTERVAL;
  const stride = walkTime % (2 * MC_STEP_INTERVAL) / (2 * MC_STEP_INTERVAL);
  const sway = walking * Math.sin(phase);
  updateMcShadow(host, walking, sway * sway, musicHit);
  const lz = walking * mcWalkCurve(MC_WALK_LEFT_HAND_Z, stride, true);
  const rz = walking * mcWalkCurve(MC_WALK_RIGHT_HAND_Z, stride, true);
  const ly = walking * (mcWalkCurve(MC_WALK_LEFT_HAND_Y, stride, true) + .68);
  const ry = walking * (mcWalkCurve(MC_WALK_RIGHT_HAND_Y, stride, true) + .68);
  const stance = host.legs[0].marks ? poseMcFeet(host, walkTime, stride) : 0;
  host.body.position.y = stance + .008 * (1 - walking) * Math.sin(time * 2.1) + .025 * anticipation;
  host.body.rotation.z = sway * .015;
  host.body.rotation.y = (lz - rz) * .020;
  host.body.position.x = .014 * (1 - walking) * Math.sin(time * 1.24);

  const welcome = ease.inOut(clamp01((t - MC_LINES[0].at) / .34)) * (1 - ease.inOut(clamp01((t - 2.69) / .48)));
  const fist = Math.max(musicHit, ease.out(clamp01((t - (MC_FANFARE_AT - .29)) / .28)) *
    (1 - ease.inOut(clamp01((t - (MC_FANFARE_AT + 1.02)) / .77))));
  const reveal = ease.inOut(clamp01((t - (MC_LINES[2].at - .13)) / .42)) *
    (1 - ease.inOut(clamp01((t - (MC_SUBTITLE_OUT - .28)) / .74)));
  const speaking = Math.max(musicMic, ease.out(clamp01(t / .22)) * (1 - ease.inOut(clamp01((t - MC_SUBTITLE_OUT) / .52))));
  const side = Math.max(welcome, reveal, fist);
  const wristY = .84 - .018 * walking;
  placeMcArm(host, host.arms[0], lerp(-.339,-.155,speaking), lerp(wristY + ly * .17,1.443,speaking) - .10 * anticipation, lerp(.03 + lz * .13,.36,speaking));
  placeMcArm(host, host.arms[1], lerp(.351,.665,side) - .12 * fist + .049 * phrase,
    wristY + ry * .17 + .375 * welcome + .815 * fist + .388 * reveal + .086 * phrase,
    .02 + rz * .13 + .11 * welcome + .08 * fist + .28 * reveal + .052 * phrase);
  const free = host.arms[1];
  free.open.visible = Math.max(welcome, reveal) > .35 && fist < .40;
  free.fist.visible = !free.open.visible;
  const glance = walking * THREE.MathUtils.clamp(cameraAngle * .72, -.69, .65);
  host.head.rotation.set(-.031 * voice - .050 * fist - .055 * anticipation,
    glance - .09 * reveal + .22 * anticipation * scan, .07 * welcome + sway * .034 - .08 * fist);
  poseMcHands(host, speaking, Math.max(welcome, reveal) * (1 - fist), fist * .6 + .16 * voice);
  animateMcDetails(host,time,voice,Math.max(phrase,fist,.6 * welcome),
    .68*sway + .29*phrase + .31*groove.swing*groove.power,cameraAngle);
}

function poseMcWaiting(host, t, voice, gesture, strong) {
  const sway = Math.sin(t * 1.65);
  updateMcShadow(host, 0, 0, .25 * gesture);
  host.body.position.y = .012 + .012 * sway;
  host.body.rotation.z = .028 * sway - .035 * gesture;
  host.body.rotation.y = 0;
  host.body.position.x = .019 * Math.sin(t * 1.24);
  for (const { hip, knee, foot } of host.legs) {
    hip.position.y = .791;
    hip.quaternion.identity();
    knee.quaternion.identity();
    foot.quaternion.identity();
  }

  placeMcArm(host, host.arms[0], lerp(-.339, -.155, gesture), lerp(.84, 1.443, gesture), lerp(.03, .36, gesture));
  placeMcArm(host, host.arms[1], .35 + .16 * gesture, .84 + (strong ? .62 : .31) * gesture + .043 * gesture * voice,
    .06 + .18 * gesture);
  const free = host.arms[1];
  free.open.visible = gesture > .35 && !strong;
  free.fist.visible = !free.open.visible;
  host.head.rotation.set(-.025 * sway - .09 * gesture, .09 * Math.sin(t * .73), .026 * sway);
  poseMcHands(host, gesture, strong ? 0 : gesture, gesture * Math.sin(t * 8) * .65);
  const angle = Math.atan2(V.camera.position.x - host.actor.position.x,V.camera.position.z - host.actor.position.z);
  animateMcDetails(host,t,voice,gesture,.30*sway + .38*gesture + .33*groove.swing*groove.power,angle);
}

function updateMcShadow(host, walking, step, accent) {
  const beat = clamp01(Math.max(accent, groove.pulse * groove.power * groove.presence));
  host.shadow.scale.set(1 + .08 * step + .06 * beat, 1 + .14 * walking + .07 * beat, 1);
  host.shadow.material.opacity = .63 + .08 * step - .07 * beat;
}
