"use strict";
/* =========================================================
   3D の舞台 (three.js)
   ・教室: 机 / 名札 / 教卓 / 床 / 背景のスクリーン
   ・ステージ: カメラ正面の「発表の場」。名前カード、粒子、火花など
   座標:
   ・教室はワールド座標 (y が上、教卓は -z 側)
   ・ステージ (V.stage) の中はカメラと同じ向きの座標
     x = 右, y = 上, z = 手前。原点 = カメラの STAGE_D 先
   ========================================================= */

let THREE = null;
let worldReady = false;
const V = {};

const CSS = { boy: "#2f8cff", girl: "#ff4fb0", gold: "#fbbf24" };
const HEX = { boy: 0x2f8cff, girl: 0xff4fb0, gold: 0xfbbf24, white: 0xffffff };
const FONT = `"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif`;

const FACE_W = 1.55, FACE_H = 0.83;   // 名札の大きさ
const PLATE_FRONT_LIGHT = .86, PLATE_BACK_LIGHT = .9;
const SX = 1.8, SZ = 1.5;             // 机の間隔
const DESK_SURFACE_Y = .485;          // 天板の上面
const PLATE_Y = 1.02;                 // 名札の高さ
const STAGE_D = 9;                    // カメラからステージまでの距離
const PITCH = 42;                     // カメラの見下ろし角

const renderOptions = new URLSearchParams(location.search);
const QUALITY = renderOptions.get("q") === "low" ? "low" : "high";
const TARGET_FPS = renderOptions.get("fps") === "30" ? 30 : 60;
const MAX_DRAW_PIXELS = 4200000;

function displayPixelRatio(w, h) {
  return Math.min(devicePixelRatio || 1, QUALITY === "low" ? 1 : 2, Math.sqrt(MAX_DRAW_PIXELS / (w * h)));
}

// 文字生成とGPU転送を分け、重い準備の間にも読み込み画面を描けるようにする。
function nextLoadingFrame() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

function seatXZ(key) {
  const [r, c] = key.split("-").map(Number);
  return { x: (c - (cols - 1) / 2) * SX, z: (r - (rows - 1) / 2) * SZ };
}
const PODIUM_Z = -((rows - 1) / 2) * SZ - 2.2;

/* ---------------- 2D キャンバスで描くもの ---------------- */
function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function canvasTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = V.maxAniso || 4;
  return t;
}

// 名札 / 名前カードの面。textOnly のときは名前の文字だけ (粒子の形に使う)
function drawFace(ctx, W, H, s, o = {}) {
  const col = CSS[s.gender];
  ctx.clearRect(0, 0, W, H);
  const lw = H * 0.03;

  if (!o.textOnly) {
    const r = H * 0.16;
    ctx.beginPath();
    ctx.roundRect(lw, lw, W - lw * 2, H - lw * 2, r);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mixHex(col, "#0b1030", o.badge ? .57 : .30));
    g.addColorStop(1, mixHex(col, "#060918", o.badge ? .86 : .74));
    ctx.fillStyle = g;
    ctx.fill();
    const gl = ctx.createLinearGradient(0, 0, 0, H * .55);
    gl.addColorStop(0, o.badge ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.20)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = mixHex(col, "#ffffff", .45);
    ctx.stroke();

    ctx.textBaseline = "middle";
    if (o.badge) {
      ctx.textAlign = "left";
      ctx.font = `900 ${H * .14}px ${FONT}`;
      ctx.fillStyle = mixHex(col, "#ffffff", .55);
      ctx.fillText(String(s.no), H * .13, H * .2);
    }
    if (o.label && !o.separateLabel) {
      ctx.textAlign = "center";
      ctx.font = `900 ${H * .12}px ${FONT}`;
      ctx.fillStyle = CSS.gold;
      ctx.fillText(o.label, W / 2, H * .17);
    }
    const kana = o.kana ?? s.kana;
    if (kana) {
      ctx.textAlign = "center";
      ctx.font = `${o.badge ? 900 : 800} ${H * (o.label ? .1 : .12)}px ${FONT}`;
      ctx.fillStyle = o.badge ? "#fff" : "rgba(255,255,255,.8)";
      ctx.fillText(kana, W / 2, H * (o.label ? .36 : .33), W * .82);
    }
  }

  // 名前 (幅は常にフルネームで決めるので、1文字ずつ出しても位置がずれない)
  let fs = H * (o.label ? .3 : .33);
  ctx.font = `900 ${fs}px ${FONT}`;
  const full = ctx.measureText(s.name).width;
  if (full > W * .86) fs *= W * .86 / full;
  ctx.font = `900 ${fs}px ${FONT}`;
  const fullW = ctx.measureText(s.name).width;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  const name = o.name ?? s.name;
  const x = W / 2 - fullW / 2, y = H * (o.label ? .66 : .64);
  if (o.badge) {
    ctx.lineJoin = "round";
    ctx.lineWidth = H * .025;
    ctx.strokeStyle = "#080b20";
    ctx.strokeText(name, x, y);
  } else if (!o.textOnly) {
    ctx.shadowColor = col;
    ctx.shadowBlur = H * .06;
  }
  ctx.fillText(name, x, y);
  ctx.shadowBlur = 0;
  return { x0: x, fs };
}

function drawBack(ctx, W, H) {
  const lw = H * 0.03;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(lw, lw, W - lw * 2, H - lw * 2, H * .16);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#151b3d");
  g.addColorStop(1, "#090c22");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.05)";
  ctx.lineWidth = H * .012;
  for (let x = -H; x < W; x += H * .16) {
    ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke();
  }
  ctx.restore();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${H * .5}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.32)";
  ctx.fillText("?", W / 2, H * .54);
}

function lockCanvas() {
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 40, 0, 120);
  g.addColorStop(0, "#fde68a"); g.addColorStop(1, "#d97706");
  x.lineWidth = 14; x.strokeStyle = "#fbbf24";
  x.beginPath(); x.arc(64, 54, 26, Math.PI, 0); x.lineTo(90, 64); x.moveTo(38, 64); x.lineTo(38, 54); x.stroke();
  x.fillStyle = g;
  x.beginPath(); x.roundRect(22, 60, 84, 58, 14); x.fill();
  x.fillStyle = "#3b2205";
  x.beginPath(); x.arc(64, 84, 9, 0, Math.PI * 2); x.fill();
  x.fillRect(60, 86, 8, 18);
  return c;
}

function glowCanvas() {
  const c = makeCanvas(128, 128), x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(.35, "rgba(255,255,255,.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return c;
}

function softShadowCanvas() {
  const c = makeCanvas(64, 64), ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(.36, "rgba(255,255,255,.85)");
  g.addColorStop(.68, "rgba(255,255,255,.38)");
  g.addColorStop(.88, "rgba(255,255,255,.07)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// 天板の下に広がる影と、台座が床に接するところの濃い影を1枚に焼く。
function bakeDeskShadows() {
  const width = 512, height = 256;
  const spanX = cols * SX + .4, spanZ = rows * SZ + .4;
  const alpha = new Uint8Array(width * height);
  const fade = (x, z, halfWidth, halfDepth, blur) => {
    const u = Math.max(0, Math.abs(x) - halfWidth);
    const v = Math.max(0, Math.abs(z) - halfDepth);
    const t = clamp01(Math.hypot(u, v) / blur);
    return 1 - t * t * (3 - 2 * t);
  };
  for (const key of realSeatPositions) {
    const { x, z } = seatXZ(key);
    const centerX = (x / spanX + .5) * width;
    const centerZ = (z / spanZ + .5) * height;
    const radiusX = 1.05 * width / spanX, radiusZ = .76 * height / spanZ;
    for (let j = Math.floor(centerZ - radiusZ); j < centerZ + radiusZ; j++) {
      const dz = (j + .5 - centerZ) * spanZ / height;
      for (let i = Math.floor(centerX - radiusX); i < centerX + radiusX; i++) {
        const dx = (i + .5 - centerX) * spanX / width;
        const top = .54 * fade(dx, dz, .57, .28, .47);
        const base = .52 * fade(dx, dz, .58, .29, .18);
        const offset = j * width + i;
        alpha[offset] = Math.round(255 - (255 - alpha[offset]) * (1 - top) * (1 - base));
      }
    }
  }
  const texture = new THREE.DataTexture(alpha, width, height, THREE.RedFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, scale: new THREE.Vector2(1 / spanX, 1 / spanZ) };
}

function frameCanvas() {
  const c = makeCanvas(512, 300), x = c.getContext("2d");
  x.shadowColor = "#fff"; x.shadowBlur = 22;
  x.strokeStyle = "#fff"; x.lineWidth = 10;
  x.beginPath(); x.roundRect(28, 28, 456, 244, 44); x.stroke();
  x.stroke();
  return c;
}


function podiumCanvas() {
  const c = makeCanvas(1024, 256), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#fde68a"); g.addColorStop(.5, "#fbbf24"); g.addColorStop(1, "#b45309");
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `900 150px ${FONT}`;
  x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 12; x.shadowOffsetY = 6;
  x.fillStyle = g;
  x.fillText("教　卓", 512, 136);
  return c;
}

/* ---------------- シェーダー ---------------- */
const GLSL_NOISE = `
float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = .5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*noise(p); p *= 2.03; a *= .5; } return s; }
`;

const WORLD_VERT = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

// 星雲とオーロラのノイズを、壁の座標のまま時系列のアトラスに焼く。
const WALL_BAKE_FRAG = GLSL_NOISE + `
varying vec2 vUv;
void main(){
  vec2 tile = min(floor(vUv * 4.0), 3.0);
  vec2 xy = fract(vUv * 4.0) * vec2(90.0, 30.0) - vec2(45.0, 0.0);
  vec2 p = xy * vec2(.07, .09);
  float t = (tile.y * 4.0 + tile.x) * .12;
  float n  = fbm(vec3(p*2.0, t));
  float n2 = fbm(vec3(p*3.4 + n, t*1.3 + 5.0));
  vec3 col = mix(vec3(.010,.012,.040), vec3(.030,.030,.110), smoothstep(0.0, 14.0, xy.y));
  col += vec3(.18,.06,.42) * smoothstep(.45,.95,n) * .9;
  col += vec3(.02,.30,.45) * smoothstep(.55,1.0,n2) * .8;
  col += vec3(.60,.08,.38) * smoothstep(.70,1.05,n*n2*1.9) * .7;
  col += vec3(.25,.35,1.0) * exp(-xy.y * 2.2) * .5;
  gl_FragColor = vec4(col, smoothstep(.35, .9, fbm(vec3(xy.x*.264, t*2.5, 1.0))));
}
`;

const WALL_FRAG = `
uniform float uTime, uDim; uniform vec3 uTint;
uniform sampler2D uWall;
uniform float uWallFrame;
varying vec3 vW;
float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
vec4 wallFrame(float frame, vec2 xy){
  vec2 tile = vec2(mod(frame, 4.0), floor(frame / 4.0));
  vec2 edge = .5 / vec2(256.0, 128.0);
  return texture2D(uWall, (tile + clamp(xy, edge, 1.0 - edge)) * .25);
}
void main(){
  vec2 xy = vW.xy / vec2(90.0, 30.0) + vec2(.5, 0.0);
  float frame = floor(uWallFrame);
  vec4 baked = mix(wallFrame(frame, xy), wallFrame(min(15.0, frame + 1.0), xy), fract(uWallFrame));
  vec3 col = baked.rgb;
  float x = vW.x * .12;
  float height = (vW.y - 5.5 - 1.6*sin(x*2.0 + uTime*.15)) / 2.6;
  float curtain = baked.a * exp(-height * height);
  col += vec3(.10,.90,.62) * curtain * .45;
  vec2 sp = vW.xy * 5.0; vec2 id = floor(sp); float h = hash(vec3(id, 1.0));
  vec2 jit = vec2(hash(vec3(id, 2.0)), hash(vec3(id, 3.0))) - .5;
  float star = step(.982, h) * (1.0 - smoothstep(.0, .09, length(fract(sp) - .5 - jit*.6))) * (.4 + .6*sin(uTime*2.0 + h*90.0));
  col += star * vec3(.85,.9,1.0) * .8;
  gl_FragColor = vec4(col * uDim * uTint, 1.0);
}
`;

// 床: 暗いステージ、両側の光のライン、スポットライトの光だまり
const FLOOR_FRAG = GLSL_NOISE + `
uniform float uTime, uDim; uniform vec3 uTint;
uniform vec3 uSpot[4]; uniform vec3 uSpotCol[4]; uniform vec4 uFocus; uniform vec3 uFocusCol;
uniform sampler2D uDeskShadows; uniform vec2 uDeskShadowScale;
uniform float uSideLightX;
uniform float uBeat, uBeatAmt, uHazeZ; uniform vec3 uWaveCol;
varying vec3 vW;
void main(){
  vec2 p = vW.xz;
  vec3 col = vec3(.012,.015,.042);
  float n = fbm(vec3(p*.16, uTime*.03));
  col += vec3(.05,.02,.10) * smoothstep(.40,.85,n);
  float shadow = texture2D(uDeskShadows, p * uDeskShadowScale + .5).r;
  // 光る格子: 机の間隔に合わせた細い線。拍ごとに手前から奥へ光の波が流れる
  vec2 g = p / vec2(${(SX / 2).toFixed(2)}, ${(SZ / 2).toFixed(2)}) + vec2(.5, .5);
  vec2 gw = fwidth(g);
  vec2 gd = abs(fract(g) - .5);
  vec2 gl2 = 1.0 - smoothstep(gw * .6, gw * 1.6, .5 - gd);
  float grid = max(gl2.x, gl2.y) * (1.0 - smoothstep(.35, 1.2, max(gw.x, gw.y)));
  float gridFade = 1.0 - smoothstep(6.0, 15.0, length(p * vec2(.75, 1.0)));
  float beatT = fract(uBeat);
  float waveZ = mix(7.5, uHazeZ, beatT);
  float wave = exp(-pow((p.y - waveZ) / 1.1, 2.0)) * (1.0 - beatT) * uBeatAmt;
  vec3 gridCol = mix(vec3(.16,.22,.75), vec3(.45,.14,.80), smoothstep(-8.0, 8.0, p.x));
  col += gridCol * grid * gridFade * (.085 + wave * .55) * (1.0 - shadow * .8);
  col += uWaveCol * wave * gridFade * .035;
  col *= 1.0 - shadow * .92;
  // 奥は光る霧に溶ける
  float haze = smoothstep(uHazeZ + 5.0, uHazeZ + 1.0, p.y);
  col = mix(col, vec3(.10,.10,.30) + uWaveCol * .03, haze * .85);
  vec3 spot = vec3(0.0);
  for (int i = 0; i < 4; i++){
    float d = length(p - uSpot[i].xy);
    spot += uSpotCol[i] * (1.0 - smoothstep(0.0, uSpot[i].z, d)) * .45;
  }
  col += uFocusCol * uFocus.w * (1.0 - smoothstep(0.0, 1.8, length(p - uFocus.xz))) * 1.4;
  col += spot * (1.0 - shadow * .62);
  float edge = abs(abs(p.x) - uSideLightX);
  float line = 1.0 - smoothstep(.015, .015 + fwidth(p.x), edge);
  float halo = 1.0 - smoothstep(.0, .22, edge);
  vec3 neon = mix(vec3(.10,.40,1.0), vec3(.63,.12,.88), step(0.0, p.x));
  col += neon * (line * .42 + halo * .045) * (1.0 - smoothstep(5.6, 9.0, abs(p.y + .6)));
  col *= (1.0 - smoothstep(9.0, 30.0, length(p)));
  gl_FragColor = vec4(col * uDim * uTint, 1.0);
}
`;

// 奥の霧と光の帯: 壁の手前に1枚、加算で重ねる
const HAZE_FRAG = `
uniform float uTime, uDim, uBeatAmt; uniform vec3 uTint, uWaveCol;
varying vec3 vW;
float ribbon(float y, float c, float w){ float d = (y - c) / w; return exp(-d*d); }
void main(){
  float x = vW.x, y = vW.y;
  float fogY = exp(-max(y, 0.0) * .42);
  vec3 col = vec3(.12,.11,.36) * fogY * .9;
  float side = 1.0 - smoothstep(14.0, 30.0, abs(x));
  float r1 = ribbon(y, 4.2 + 1.3*sin(x*.13 + uTime*.21) + .5*sin(x*.31 - uTime*.13), .32 + .16*sin(x*.09 + uTime*.1));
  float r2 = ribbon(y, 6.8 + 1.6*sin(x*.10 - uTime*.17 + 2.0), .26 + .1*sin(x*.2 + 1.0));
  float r3 = ribbon(y, 2.6 + .9*sin(x*.19 + uTime*.26 + 4.0), .22);
  float flow = .65 + .35*sin(x*.4 - uTime*.9);
  col += vec3(.25,.30,1.0) * r1 * .16 * flow;
  col += vec3(.85,.20,.75) * r2 * .11 * (1.3 - flow*.6);
  col += mix(vec3(.15,.75,.85), uWaveCol, .5) * r3 * (.09 + uBeatAmt * .05);
  gl_FragColor = vec4(col * side * uDim * uTint, 1.0);
}
`;

// 光の円すい (スポットライト / UFO のビーム)
const BEAM_VERT = `
varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  vH = -position.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BEAM_FRAG = `
uniform vec3 uColor; uniform float uOpacity; varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float fade = mix(1.0, .2, vH) * smoothstep(0.0, .05, vH);
  gl_FragColor = vec4(uColor * edge * fade * uOpacity, 1.0);
}`;

// ガラス球 (抽選マシン)
const GLASS_VERT = `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`;
const GLASS_FRAG = `
uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(uColor * (f*1.4 + .04) * uOpacity, 1.0); }`;

// 名前をつくる粒子
const PARTICLE_VERT = `
uniform float uTime, uForm, uStream, uSize, uSwirl, uPix;
uniform vec3 uDest, uCtrl; uniform vec2 uDestSize;
uniform sampler2D uNameMask;
uniform vec4 uNameA, uNameB;
uniform float uNameScale;
attribute vec3 aStart; attribute vec4 aRand; attribute float aSide;
varying float vA; varying float vM; varying float vS;
vec3 rotZ(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.y, s*p.x + c*p.y, p.z); }
float eo(float t){ return 1.0 - pow(1.0 - t, 3.0); }
float eio(float t){ return t < .5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }
void main(){
  float f = clamp(uForm*1.6 - aRand.x*.6, 0.0, 1.0);
  float fe = eo(f);
  vec3 s = rotZ(aStart, (1.0 - fe) * uSwirl * (.6 + aRand.y));
  vec4 nameTarget = mix(uNameA, uNameB, aSide);
  vec2 glyph = texture2D(uNameMask, vec2(fract(aRand.x + aRand.z), nameTarget.w)).rg;
  glyph += vec2(aRand.y, -aRand.w) * vec2(2.0 / 640.0, 2.0 / 342.0);
  vec3 destName = nameTarget.xyz + vec3(glyph * uDestSize, .05) * uNameScale;
  vec3 p = mix(s, destName, fe);
  p += vec3(sin(uTime*2.0 + aRand.y*50.0), cos(uTime*1.7 + aRand.z*50.0), 0.0) * .01 * fe;
  p += vec3(sin(uTime*3.0 + aRand.w*30.0), cos(uTime*2.6 + aRand.x*30.0), sin(uTime*2.0 + aRand.y*20.0)) * .3 * (1.0 - fe) * f;
  float st = clamp(uStream*1.6 - aRand.z*.6, 0.0, 1.0);
  if (st > 0.0){
    float t = eio(st);
    vec3 dest = uDest + vec3((aRand.w - .5) * uDestSize.x, (fract(aRand.y*7.13) - .5) * uDestSize.y, 0.0);
    vec3 c = uCtrl + vec3((aRand.x - .5)*1.6, (aRand.w - .5)*1.2, (aRand.y - .5)*1.6);
    p = mix(mix(p, c, t), mix(c, dest, t), t);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPix * (.55 + aRand.y*.9) * (1.0 + (1.0 - fe)*.8) / -mv.z;
  vA = .3 + .7*f;
  vM = aRand.w;
  vS = aSide;
}`;
const PARTICLE_FRAG = `
uniform vec3 uColA, uColA2, uColB; uniform float uFade; varying float vA; varying float vM; varying float vS;
void main(){
  float r = length(gl_PointCoord - .5);
  float a = 1.0 - smoothstep(0.0, .5, r); a *= a;
  vec3 col = mix(mix(uColA, uColA2, vS), uColB, step(.78, vM));
  gl_FragColor = vec4(col * a * vA * uFade, 1.0);
}`;

const SPARK_VERT = `
uniform float uPix; attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vA; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPix / -mv.z; vA = aAlpha; vC = aColor; }`;
const SPARK_FRAG = `
varying float vA; varying vec3 vC;
void main(){ float r = length(gl_PointCoord - .5); float a = 1.0 - smoothstep(0.0, .5, r); gl_FragColor = vec4(vC * a * a * vA, 1.0); }`;

/* ---------------- 初期化 ---------------- */
async function initWorld(beforeNames) {
  THREE = await import("three");
  const [ec, rp, bp, op, rb, re] = await Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);
  V.RoundedBox = rb.RoundedBoxGeometry;

  // 日本語フォントは文字ごとに分割配信されるので、使う文字を指定して読み込む
  const text = studentsOriginal.map(s => s.name + s.kana).join("") + "0123456789人目ラスト！教卓?？Z";
  try {
    await Promise.all(["800", "900"].map(w => document.fonts.load(`${w} 40px "M PLUS Rounded 1c"`, text)));
  } catch {}

  const canvas = document.getElementById("scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  V.renderer = renderer;
  V.pixelRatio = displayPixelRatio(innerWidth, innerHeight);
  renderer.setPixelRatio(V.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  V.maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  V.scene = scene;
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .1, 200);
  V.camera = camera;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new re.RoomEnvironment();
  scene.environment = pmrem.fromScene(room, .04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = .5;
  scene.add(new THREE.AmbientLight(0x8090ff, .25));
  const dl = new THREE.DirectionalLight(0xffffff, 1.3);
  dl.position.set(4, 10, 8);
  scene.add(dl);
  const warm = new THREE.PointLight(0xffb347, 10, 10, 2);
  warm.position.set(0, 2.6, PODIUM_Z + 1.6);
  scene.add(warm);
  V.roomWarmLight = warm;

  // ポストエフェクト (ブルーム)
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const composer = new ec.EffectComposer(renderer, rt);
  composer.setPixelRatio(V.pixelRatio);
  composer.addPass(new rp.RenderPass(scene, camera));
  // UnrealBloomPass 自身も最初の段を半分にするので、明部抽出は実寸の 1/4。
  class ReducedResolutionBloom extends bp.UnrealBloomPass {
    setSize(w, h) { super.setSize(Math.max(2, w / this.divisor), Math.max(2, h / this.divisor)); }
  }
  const bloom = divisor => {
    const pass = new ReducedResolutionBloom(new THREE.Vector2(4, 4), .7, .5, .92);
    pass.divisor = divisor;
    for (const target of [pass.renderTargetBright, ...pass.renderTargetsHorizontal, ...pass.renderTargetsVertical]) target.depthBuffer = false;
    pass.blendMaterial.visible = false;
    composer.addPass(pass);
    return pass;
  };
  V.bloom = bloom(QUALITY === "low" ? 3 : 2);
  V.lightBloom = QUALITY === "low" ? null : bloom(3);
  if (V.lightBloom) V.lightBloom.enabled = false;
  // r180 のブルームを出力パスで加算し、HDR の全画面バッファへの書き戻しを省く。
  const output = new op.OutputPass();
  output.needsSwap = false;
  V.bloomOutput = output;
  output.uniforms.tBloom = { value: V.bloom.renderTargetsHorizontal[0].texture };
  output.material.fragmentShader = output.material.fragmentShader
    .replace("uniform sampler2D tDiffuse;", "uniform sampler2D tDiffuse;\nuniform sampler2D tBloom;")
    .replace("gl_FragColor = texture2D( tDiffuse, vUv );", `
      vec4 bloom = texture2D(tBloom, vUv);
      gl_FragColor = texture2D(tDiffuse, vUv) + bloom * bloom.a;`);
  composer.addPass(output);
  V.composer = composer;

  V.tex = {
    glow: canvasTex(glowCanvas()),
    softShadow: new THREE.CanvasTexture(softShadowCanvas()),
    lock: canvasTex(lockCanvas()),
    frame: canvasTex(frameCanvas()),
  };
  const backC = makeCanvas(640, 342);
  drawBack(backC.getContext("2d"), 640, 342);
  V.tex.back = canvasTex(backC);
  await beforeNames?.();
  V.tex.curtain = canvasTex(curtainCanvas());
  for (const tex of Object.values(V.tex)) renderer.initTexture(tex);
  await prepareNameAssets(renderer);

  V.uniforms = { uTime: { value: 0 }, uDim: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
  V.wall = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.HalfFloatType, depthBuffer: false });
  bakeWall(renderer);
  canvas.addEventListener("webglcontextrestored", () => bakeWall(renderer));
  buildRoom();
  buildSpots();
  buildDesks();
  buildStage();

  V.camOffset = v3();
  V.sway = v3();
  V.shakeOffset = v3();
  V.shakeAmt = 0;
  layoutWorld();
  addEventListener("resize", layoutWorld);
  setupPicking(canvas);
  syncAllSeats();

  worldReady = true;
}

async function prepareNameAssets(renderer) {
  V.plateTex = {};
  V.cardFaces = {};
  V.cardLabels = new Map();
  const face = (s, w, h, options) => {
    const canvas = makeCanvas(w, h);
    drawFace(canvas.getContext("2d"), w, h, s, options);
    const tex = canvasTex(canvas);
    renderer.initTexture(tex);
    return tex;
  };
  for (const [i, s] of studentsOriginal.entries()) {
    V.plateTex[s.no] = face(s, 512, 274, { badge: true });
    V.cardFaces[s.no] = [
      face(s, 640, 342),
      face(s, 1024, 548, { label: true, separateLabel: true }),
    ];
    if ((i + 1) % 4 === 0) await nextLoadingFrame();
  }
  const labels = studentsOriginal.map((_, i) => `${i + 1}人目`).concat("ラスト！");
  for (const label of labels) {
    const c = makeCanvas(320, 112), ctx = c.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = CSS.gold;
    ctx.font = `900 ${548 * .12}px ${FONT}`;
    ctx.fillText(label, c.width / 2, c.height / 2);
    const tex = canvasTex(c);
    renderer.initTexture(tex);
    V.cardLabels.set(label, tex);
  }
  V.nameMask = await buildNameMask(renderer);
}

async function buildNameMask(renderer) {
  const w = 640, h = 342, width = 2048, height = studentsOriginal.length * 2;
  const c = makeCanvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  const points = [], rows = {};
  const packed = new Float32Array(width * height * 2);
  for (const [i, s] of studentsOriginal.entries()) {
    rows[s.no] = i * 2;
    for (const mode of [0, 1]) {
      drawFace(ctx, w, h, s, { textOnly: true, label: mode });
      const data = ctx.getImageData(0, 0, w, h).data;
      points.length = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] > 110) points.push(x / w - .5, .5 - y / h);
      }
      const count = points.length / 2;
      if (!count) continue;
      for (let x = 0; x < width; x++) {
        const point = Math.floor(x * count / width) * 2;
        const to = ((i * 2 + mode) * width + x) * 2;
        packed[to] = points[point];
        packed[to + 1] = points[point + 1];
      }
    }
    if ((i + 1) % 6 === 0) await nextLoadingFrame();
  }
  const texture = new THREE.DataTexture(packed, width, height, THREE.RGFormat, THREE.FloatType);
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  return { texture, rows, height };
}

function bakeWall(renderer) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: WALL_BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene(), camera = new THREE.Camera();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(V.wall);
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous);
  geometry.dispose();
  material.dispose();
}

/* ---------------- 教室 ---------------- */
function buildRoom() {
  const shadows = bakeDeskShadows();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        ...V.uniforms,
        uSpot: { value: [v3(), v3(), v3(), v3()] },
        uSpotCol: { value: [v3(), v3(), v3(), v3()] },
        uFocus: { value: new THREE.Vector4(0, 0, 0, 0) },
        uFocusCol: { value: v3(1, .8, .4) },
        uDeskShadows: { value: shadows.texture },
        uDeskShadowScale: { value: shadows.scale },
        uSideLightX: { value: cols * SX / 2 + .28 },
        uBeat: { value: 0 },
        uBeatAmt: { value: 0 },
        uHazeZ: { value: PODIUM_Z - 2.6 },
        uWaveCol: { value: v3(.35, .45, 1) },
      },
    }));
  floor.rotation.x = -Math.PI / 2;
  V.scene.add(floor);
  V.floor = floor;

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 30),
    new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: WALL_FRAG, uniforms: {
      ...V.uniforms, uWall: { value: V.wall.texture }, uWallFrame: { value: 0 },
    } }));
  wall.position.set(0, 15, PODIUM_Z - 2.6);
  V.scene.add(wall);
  V.wallFrame = wall.material.uniforms.uWallFrame;

  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 12),
    new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT, fragmentShader: HAZE_FRAG,
      uniforms: { ...V.uniforms, uBeatAmt: floor.material.uniforms.uBeatAmt, uWaveCol: floor.material.uniforms.uWaveCol },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  haze.position.set(0, 6, PODIUM_Z - 1.6);
  haze.renderOrder = -1;
  V.scene.add(haze);

  // 教卓: 青紫のステージ台 + 金の文字
  const podium = new THREE.Group();
  const podiumBody = new THREE.MeshStandardMaterial({ color: 0x151735, roughness: .42, metalness: .45 });
  const podiumTop = new THREE.MeshStandardMaterial({ color: 0x293460, roughness: .32, metalness: .35 });
  const body = new THREE.Mesh(new V.RoundedBox(3.1, .95, 1.0, 4, .08), podiumBody);
  body.position.y = .475;
  const top = new THREE.Mesh(new V.RoundedBox(3.4, .1, 1.2, 4, .04), podiumTop);
  top.position.y = 1.0;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .6),
    new THREE.MeshBasicMaterial({ map: canvasTex(podiumCanvas()), transparent: true, depthWrite: false, color: hdr(0xffffff, 1.3) }));
  label.position.set(0, 1.55, PODIUM_Z);
  V.podiumSign = label;
  V.scene.add(label);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.12, .03, 1.02), new THREE.MeshBasicMaterial({ color: hdr(0x49e6f9, 2.2) }));
  trim.position.y = .06;
  podium.add(body, top, trim);
  podium.position.z = PODIUM_Z;
  V.scene.add(podium);
}

function beamMesh(color, opacity) {
  const g = new THREE.ConeGeometry(1, 1, 40, 1, true);
  g.translate(0, -.5, 0);
  return new THREE.Mesh(g, new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
}

function aimBeam(mesh, from, to, radius) {
  const dir = (V.beamDirection ||= v3()).subVectors(to, from);
  const len = dir.length();
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(V.beamDown ||= v3(0, -1, 0), dir.normalize());
  mesh.scale.set(radius, len, radius);
}

function buildSpots() {
  const defs = [
    { from: [-9, 12, 5], col: 0xfbbf24 },
    { from: [9, 12, 5], col: 0x38bdf8 },
    { from: [-6, 12, -9], col: 0xf472b6 },
    { from: [6, 12, -9], col: 0xa78bfa },
  ];
  V.spots = defs.map((d, i) => {
    const m = beamMesh(d.col, .16);
    V.scene.add(m);
    return { mesh: m, from: v3(...d.from), col: new THREE.Color(d.col), phase: i * 1.7, target: v3() };
  });
  V.spotSpeed = 1;
  V.spotPower = 1;
  V.spotFocus = 0;   // 1 のとき全部のライトが V.spotFocusAt に集まる
  V.spotFocusAt = v3();
}

function buildDesks() {
  V.seat = {};
  const pedGeo = new V.RoundedBox(1.2, .4, .62, 3, .06);
  const topGeo = new V.RoundedBox(1.5, .07, .86, 3, .03);
  const stripGeo = new THREE.BoxGeometry(1.32, .03, .72);
  const plateGeo = new THREE.PlaneGeometry(FACE_W, FACE_H);
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x10152e, metalness: .55, roughness: .35 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x1f2858, metalness: .35, roughness: .22 });
  const n = realSeatPositions.length;
  const ped = new THREE.InstancedMesh(pedGeo, pedMat, n);
  const top = new THREE.InstancedMesh(topGeo, topMat, n);
  const strip = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial(), n);
  const glowGeo = new THREE.PlaneGeometry(2.6, 2.0);
  glowGeo.rotateX(-Math.PI / 2);
  const glow = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({
    map: V.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), n);
  V.scene.add(ped, top, strip, glow);
  V.deskParts = { ped, top, strip, glow, color: new THREE.Color() };
  V.deskMeshes = [[ped, .2], [top, DESK_SURFACE_Y - .035], [strip, .4], [glow, .015]];
  for (const [mesh] of V.deskMeshes) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();

  realSeatPositions.forEach((key, index) => {
    const { x, z } = seatXZ(key);
    for (const [mesh, level] of V.deskMeshes) mesh.setMatrixAt(index, matrix.makeTranslation(x, level, z));

    const pivot = new THREE.Group();
    pivot.position.set(x, PLATE_Y, z + .12);
    const flipper = new THREE.Group();
    const front = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: .05, color: new THREE.Color().setScalar(PLATE_FRONT_LIGHT) }));
    front.position.z = .004;
    const back = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: V.tex.back, transparent: true, alphaTest: .05, color: new THREE.Color().setScalar(PLATE_BACK_LIGHT) }));
    back.rotation.y = Math.PI;
    back.position.z = -.004;
    flipper.add(front, back);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W * 1.12, FACE_H * 1.22), new THREE.MeshBasicMaterial({
      map: V.tex.frame, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: hdr(HEX.gold, 1.25),
    }));
    frame.position.z = -.02;
    const lock = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: V.tex.lock, transparent: true, depthWrite: false }));
    lock.position.set(FACE_W / 2 - .06, FACE_H / 2 - .02, .03);
    const motion = new THREE.Group();
    motion.add(flipper, frame, lock);
    pivot.add(motion);
    V.scene.add(pivot);

    front.userData.key = back.userData.key = key;
    const [row, col] = key.split("-").map(Number);
    V.seat[key] = {
      index, row, col, pivot, motion, flipper, front, back, frame, lock,
      light: 1, stripColor: new THREE.Color(), glowColor: new THREE.Color(),
      phase: Math.random() * 6.28, base: v3(x, PLATE_Y, z + .12),
    };
    ped.setColorAt(index, V.deskParts.color.setScalar(1));
    top.setColorAt(index, V.deskParts.color);
  });
}

function deskGlowLight(light) {
  return lerp(.75, 1, light);
}

function setDeskStrip(seat, color, intensity = 1) {
  const { strip, color: scratch } = V.deskParts;
  seat.stripColor.copy(color).multiplyScalar(intensity);
  strip.setColorAt(seat.index, scratch.copy(seat.stripColor).multiplyScalar(deskGlowLight(seat.light)));
  strip.instanceColor.needsUpdate = true;
}

/* ---------------- 席の見た目 ---------------- */
function seatLook(key) {
  const o = V.seat[key];
  if (!o) return;
  const s = seats[key];
  const isHidden = hidden.has(key);
  const isLocked = seatIsLocked(key);
  const isSelected = selectedSeats.has(key);
  o.front.material.map = V.plateTex[s.no];
  const { glow, color } = V.deskParts;
  setDeskStrip(o, color.set(isHidden ? 0x8fa3ff : HEX[s.gender]), isHidden ? .35 : 2.4);
  o.glowColor.setHex(isHidden ? 0x6070ff : HEX[s.gender]).multiplyScalar(isHidden ? .08 : .32);
  glow.setColorAt(o.index, color.copy(o.glowColor).multiplyScalar(deskGlowLight(o.light)));
  glow.instanceColor.needsUpdate = true;
  o.frame.visible = isLocked || isSelected;
  if (o.frame.visible) o.frame.material.color.setHex(isLocked ? HEX.gold : 0x67e8f9).multiplyScalar(1.25 * deskGlowLight(o.light));
  o.lock.visible = isLocked;
}

function rippleFromSeat(key) {
  const center = V.seat[key].base;
  const matrix = new THREE.Matrix4();
  const wave = realSeatPositions.map(key => {
    const seat = V.seat[key];
    const dx = seat.base.x - center.x, dz = seat.base.z - center.z;
    const distance = Math.hypot(dx, dz);
    return {
      seat, delay: distance * 105, x: distance ? dx / distance : 0, z: distance ? dz / distance : 0,
      strength: 1 / (1 + distance * .035), moving: false,
    };
  });
  const crest = 1120;
  const duration = Math.max(...wave.map(item => item.delay)) + crest;
  const shift = (seat, x, y, z) => {
    seat.rippleX = x;
    seat.rippleY = y;
    seat.rippleZ = z;
    for (const [mesh, level] of V.deskMeshes) {
      mesh.setMatrixAt(seat.index, matrix.makeTranslation(seat.base.x + x, level + y, seat.base.z + z - .12));
    }
  };
  return tween(duration, t => {
    let changed = false;
    for (const item of wave) {
      const p = (t * duration - item.delay) / crest;
      if (p < 0 || (p >= 1 && !item.moving)) continue;
      item.moving = p < 1;
      const kick = item.moving ? item.strength * Math.sin(p * Math.PI * 4.5) * (1 - p) ** 2 : 0;
      shift(item.seat, item.x * kick * .46, kick * .96, item.z * kick * .46);
      changed = true;
    }
    if (changed) for (const [mesh] of V.deskMeshes) mesh.instanceMatrix.needsUpdate = true;
  }, ease.linear).finally(() => {
    for (const { seat, moving } of wave) if (moving) shift(seat, 0, 0, 0);
    for (const [mesh] of V.deskMeshes) mesh.instanceMatrix.needsUpdate = true;
  });
}

function syncAllSeats() {
  for (const key of realSeatPositions) {
    seatLook(key);
    V.seat[key].flipper.rotation.y = hidden.has(key) ? Math.PI : 0;
  }
}

function flipPlate(key, toBack, ms = 520, withSound = true) {
  const o = V.seat[key];
  const now = performance.now();
  if (withSound && typeof sfx === "function" && now - (V.lastFlipSfx || 0) > 70) { V.lastFlipSfx = now; sfx("flip", { vol: .5, vary: .15, pan: seatXZ(key).x / 8 }); }
  const r0 = o.flipper.rotation.y, r1 = toBack ? Math.PI : 0;
  return tween(ms, t => {
    o.flipper.rotation.y = lerp(r0, r1, t);
    o.flipper.position.z = Math.sin(t * Math.PI) * .25;
  }, ease.back);
}

/* ---------------- ステージ (発表の場) ---------------- */
function buildStage() {
  const stage = new THREE.Group();
  V.scene.add(stage);
  V.stage = stage;

  // 後ろの教室を暗くする幕
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
    new THREE.MeshBasicMaterial({ color: 0x000006, transparent: true, opacity: 0, depthWrite: false }));
  veil.position.z = -3.8;
  veil.renderOrder = 1;
  stage.add(veil);
  V.veilMesh = veil;

  // 名前カード
  const card = new THREE.Group();
  const body = new THREE.Mesh(new V.RoundedBox(FACE_W + .05, FACE_H + .05, .06, 4, .05),
    new THREE.MeshPhysicalMaterial({ color: 0x0b1030, metalness: .6, roughness: .2, clearcoat: 1, clearcoatRoughness: .08, transparent: true }));
  const rim = new THREE.Mesh(new V.RoundedBox(FACE_W + .14, FACE_H + .14, .03, 4, .09),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  rim.position.z = 0;   // 本体の厚みの内側に置く (裏から見たとき枠が全面を覆わないように)
  const front = makeCardFront(new THREE.PlaneGeometry(FACE_W, FACE_H));
  front.position.z = .034;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshBasicMaterial({ map: V.tex.back, transparent: true }));
  back.rotation.y = Math.PI;
  back.position.z = -.034;
  card.add(body, rim, front, back);
  card.visible = false;
  stage.add(card);
  V.card = { obj: card, body, rim, front, back };

  buildParticles();
  buildSparks();

  // 着地のフラッシュ
  V.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: V.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  stage.add(V.flash);
}

function setCardOpacity(a) {
  const c = V.card;
  for (const m of [c.body, c.rim, c.front, c.back]) m.material.opacity = a;
  c.front.userData.label.material.opacity = a;
}

function makeCardFront(geometry) {
  const front = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: V.cardFaces[studentsOriginal[0].no][0], transparent: true, color: new THREE.Color(.84, .84, .84),
  }));
  const label = new THREE.Mesh(V.labelGeometry ||= new THREE.PlaneGeometry(FACE_W * 320 / 1024, FACE_H * 112 / 548),
    new THREE.MeshBasicMaterial({ map: V.cardLabels.get("1人目"), transparent: true, depthWrite: false, color: front.material.color }));
  label.position.set(0, FACE_H * (.5 - .17), .001);
  label.visible = false;
  front.add(label);
  front.userData.label = label;
  return front;
}

function setCardFront(front, student, label) {
  front.material.map = V.cardFaces[student.no][label ? 1 : 0];
  const plate = front.userData.label;
  plate.visible = V.cardLabels.has(label);
  if (plate.visible) plate.material.map = V.cardLabels.get(label);
}

function drawHero(s, { label } = {}) {
  setCardFront(V.card.front, s, label);
}

function setHero(s, label) {
  V.heroStudent = s;
  V.heroLabel = label;
  drawHero(s, { label });
  V.card.rim.material.color.copy(hdr(HEX[s.gender], 1.7));
  const c = V.card.obj;
  c.position.set(0, 0, 0);
  c.rotation.set(0, 0, 0);
  c.scale.setScalar(V.heroK);
  setCardOpacity(1);
}

/* ---------------- 粒子 ---------------- */
function buildParticles() {
  const N = QUALITY === "low" ? 9000 : 20000;
  const g = new THREE.BufferGeometry();
  const rnd = new Float32Array(N * 4);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
  g.setDrawRange(0, N);
  g.setAttribute("aStart", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 4));
  g.setAttribute("aSide", new THREE.BufferAttribute(new Float32Array(N), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: {
      uTime: V.uniforms.uTime, uForm: { value: 0 }, uStream: { value: 0 }, uSize: { value: .05 },
      uSwirl: { value: 5 }, uPix: { value: 1 }, uDest: { value: v3() }, uCtrl: { value: v3() },
      uDestSize: { value: new THREE.Vector2(FACE_W, FACE_H) }, uColA: { value: new THREE.Color() }, uColA2: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uFade: { value: 0 },
      uNameMask: { value: V.nameMask.texture }, uNameA: { value: new THREE.Vector4() },
      uNameB: { value: new THREE.Vector4() }, uNameScale: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  pts.renderOrder = 5;
  V.stage.add(pts);
  V.particles = { pts, N, u: mat.uniforms, geo: g };
}

// 名前の文字の形をした点の集まり (カードの面と同じ位置)
function nameTargets(s, label, k, center, second = false) {
  const { rows, height } = V.nameMask, u = V.particles.u;
  const target = second ? u.uNameB.value : u.uNameA.value;
  target.set(center.x, center.y, center.z, (rows[s.no] + (label ? 1 : 0) + .5) / height);
  u.uNameScale.value = k;
}

function particleStart(mode, at) {
  const P = V.particles, st = P.geo.attributes.aStart.array;
  for (let i = 0; i < P.N; i++) {
    if (mode === "point") {
      const r = Math.cbrt(Math.random()) * .35, a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1);
      st[i * 3] = at.x + r * Math.sin(b) * Math.cos(a);
      st[i * 3 + 1] = at.y + r * Math.sin(b) * Math.sin(a);
      st[i * 3 + 2] = at.z + r * Math.cos(b);
    } else {
      // 渦巻く銀河
      const arm = Math.floor(Math.random() * 3);
      const r = 1.2 + Math.pow(Math.random(), .7) * V.visW * .9;
      const a = arm * 2.094 + r * .55 + (Math.random() - .5) * .9;
      st[i * 3] = Math.cos(a) * r;
      st[i * 3 + 1] = Math.sin(a) * r * .55;
      st[i * 3 + 2] = -1.5 - Math.random() * 5;
    }
  }
  P.geo.attributes.aStart.needsUpdate = true;
}

function particleColors(gender) {
  const u = V.particles.u;
  u.uColA.value.copy(hdr(HEX[gender], 1.5));
  u.uColA2.value.copy(u.uColA.value);
  u.uColB.value.set(1.6, 1.45, 1.1);
}

/* ---------------- 火花 ---------------- */
function buildSparks() {
  const N = 3000;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(N), 1));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(N), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
    uniforms: { uPix: V.particles.u.uPix },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  pts.visible = false;
  V.stage.add(pts);
  V.sparks = { pts, N, geo: g, vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N), grav: new Float32Array(N), next: 0 };
}

// at: ステージ座標。color: THREE.Color (明るさ 1 以上で光る)
function burst(at, color, n = 120, speed = 3, o = {}) {
  if (V.reducedEffects) n = Math.ceil(n * .82);
  V.sparks.active = true;
  const S = V.sparks, pos = S.geo.attributes.position.array, col = S.geo.attributes.aColor.array;
  S.pts.visible = true;
  const colorAttr = S.geo.attributes.aColor;
  const first = Math.min(n, S.N - S.next);
  colorAttr.addUpdateRange(S.next * 3, first * 3);
  if (first < n) colorAttr.addUpdateRange(0, (n - first) * 3);
  colorAttr.needsUpdate = true;
  for (let k = 0; k < n; k++) {
    const i = S.next; S.next = (S.next + 1) % S.N;
    const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1);
    const sp = speed * (o.even ? .85 + Math.random() * .15 : .3 + Math.random() * .7);
    S.vel[i * 3] = sp * Math.sin(b) * Math.cos(a);
    S.vel[i * 3 + 1] = sp * Math.sin(b) * Math.sin(a) + (o.up || 0);
    S.vel[i * 3 + 2] = sp * Math.cos(b) * (o.flat ? .3 : 1);
    pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
    const c = Array.isArray(color) ? color[k % color.length] : color;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    S.max[i] = S.life[i] = (o.life || 1.1) * (.6 + Math.random() * .6);
    S.size[i] = (o.size || .07) * (.6 + Math.random() * .8);
    S.grav[i] = o.grav ?? 2.5;
  }
}

function updateSparks(dt) {
  const S = V.sparks;
  if (!S.active) return;   // 火花が1つも出ていないときは何もしない
  const pos = S.geo.attributes.position.array, al = S.geo.attributes.aAlpha.array, sz = S.geo.attributes.aSize.array;
  const drag = Math.pow(.25, dt);
  let alive = 0;
  for (let i = 0; i < S.N; i++) {
    if (S.life[i] <= 0) { al[i] = 0; continue; }
    alive++;
    S.life[i] -= dt;
    S.vel[i * 3] *= drag; S.vel[i * 3 + 1] = S.vel[i * 3 + 1] * drag - S.grav[i] * dt; S.vel[i * 3 + 2] *= drag;
    pos[i * 3] += S.vel[i * 3] * dt; pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
    const t = Math.max(0, S.life[i] / S.max[i]);
    al[i] = t * (.7 + .3 * Math.sin(S.life[i] * 40 + i));
    sz[i] = S.size[i] * (.4 + .6 * t);
  }
  S.geo.attributes.position.needsUpdate = true;
  S.geo.attributes.aAlpha.needsUpdate = true;
  S.geo.attributes.aSize.needsUpdate = true;
  if (!alive) S.pts.visible = S.active = false;
}

/* ---------------- 配置 (画面サイズに合わせる) ---------------- */
function layoutWorld() {
  const { renderer, camera, composer } = V;
  const w = innerWidth, h = innerHeight;
  const ratio = displayPixelRatio(w, h);
  if (ratio !== V.pixelRatio) {
    V.pixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
  }
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const pitch = THREE.MathUtils.degToRad(PITCH);
  const fwd = v3(0, -Math.sin(pitch), -Math.cos(pitch));
  const target = v3(0, .5, -.6);
  const xMax = (cols - 1) / 2 * SX + .85;
  const zMax = (rows - 1) / 2 * SZ + .6;
  const pts = [];
  for (const x of [-xMax, xMax]) for (const z of [PODIUM_Z, zMax]) for (const y of [0, PLATE_Y + .5]) pts.push(v3(x, y, z));
  const hud = w <= 1070 ? Math.min(168, h * .29) : Math.min(112, h * .16);
  const top = 1 - 2 * hud / h, bottom = -.96, side = .95;

  let shift = 0, dist = 20;
  for (let pass = 0; pass < 3; pass++) {
    let lo = 4, hi = 80;
    for (let i = 0; i < 30; i++) {
      dist = (lo + hi) / 2;
      placeCam(dist, shift);
      let ok = true;
      for (const p of pts) {
        const q = p.clone().project(camera);
        if (Math.abs(q.x) > side || q.y > top || q.y < bottom) { ok = false; break; }
      }
      ok ? (hi = dist) : (lo = dist);
    }
    dist = hi;
    placeCam(dist, shift);
    let minY = 1, maxY = -1;
    for (const p of pts) { const q = p.clone().project(camera); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    const off = (minY + maxY) / 2 - (top + bottom) / 2;
    shift += off * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .9;
  }
  function placeCam(d, sh) {
    camera.position.copy(target).addScaledVector(fwd, -d);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const up = v3(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(up, sh);
    camera.updateMatrixWorld();
  }

  V.lookTarget = target.clone();
  V.homePos = camera.position.clone();
  V.homeQuat = camera.quaternion.clone();
  V.fwd = fwd.clone();
  V.stage.position.copy(V.homePos).addScaledVector(fwd, STAGE_D);
  V.stage.quaternion.copy(V.homeQuat);
  V.stage.updateMatrixWorld();
  V.visH = 2 * STAGE_D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  V.visW = V.visH * camera.aspect;
  V.heroK = Math.min(V.visW * .56 / FACE_W, V.visH * .44 / FACE_H);
  if (V.card && !busy) V.card.obj.scale.setScalar(V.heroK);
  for (const key in V.seat) V.seat[key].pivot.quaternion.copy(V.homeQuat);
  V.podiumSign.quaternion.copy(V.homeQuat);

  V.particles.u.uPix.value = h * renderer.getPixelRatio() / 2;
  V.particles.u.uSize.value = .075 * Math.sqrt(V.heroK / 2.3);
}

/* ---------------- 座標の変換 ---------------- */
function plateLocal(key) {
  const p = V.seat[key].pivot.position.clone();
  return V.stage.worldToLocal(p);
}
function seatLocal(key) {
  const { x, z } = seatXZ(key);
  return V.stage.worldToLocal(v3(x, PLATE_Y, z));
}
function toScreen(local) {
  const p = V.stage.localToWorld(local.clone()).project(V.camera);
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
}

/* ---------------- 机と名札の当たり判定 ---------------- */
function setupPicking(canvas) {
  const ray = new THREE.Raycaster();
  const targets = [V.deskParts.ped, V.deskParts.top];
  for (const key in V.seat) {
    const o = V.seat[key];
    targets.push(o.front, o.back);
  }
  const ndc = new THREE.Vector2();
  bindSeatTaps(canvas, (x, y) => {
    if (!document.body.classList.contains("ready") || document.elementFromPoint(x, y) !== canvas) return;
    ndc.set(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2);
    ray.setFromCamera(ndc, V.camera);
    const hit = ray.intersectObjects(targets, false)[0];
    if (hit) return hit.instanceId === undefined ? hit.object.userData.key : realSeatPositions[hit.instanceId];
  });
}

function tapPulse(key) {
  const o = V.seat[key];
  tween(380, t => o.pivot.scale.setScalar(1 + Math.sin(t * Math.PI) * .12), ease.out);
}

/* ---------------- 毎フレーム ---------------- */
function setReducedEffects(reduced) {
  if (!V.lightBloom || V.reducedEffects === reduced) return;
  V.reducedEffects = reduced;
  V.bloom.enabled = !reduced;
  V.lightBloom.enabled = reduced;
  const active = reduced ? V.lightBloom : V.bloom;
  V.bloomOutput.uniforms.tBloom.value = active.renderTargetsHorizontal[0].texture;
  const { geo, N } = V.particles;
  geo.setDrawRange(0, reduced ? N * .85 : N);
}

const renderPace = { duration: 0, frames: 0, late: 0, slow: 0, steady: 0 };
function tuneEffects(gap, interval) {
  if (!V.lightBloom || document.hidden || gap <= 0 || gap > 500) return;
  renderPace.duration += gap;
  renderPace.frames++;
  if (gap > interval * 1.45) renderPace.late++;
  if (renderPace.duration < 1400) return;
  const lateRatio = renderPace.late / renderPace.frames;
  renderPace.slow = lateRatio > .22 && busy ? renderPace.slow + 1 : 0;
  renderPace.steady = lateRatio < .07 ? renderPace.steady + 1 : 0;
  renderPace.duration = renderPace.frames = renderPace.late = 0;
  if (renderPace.slow >= 2) setReducedEffects(true);
  if (renderPace.steady >= 4) setReducedEffects(false);
}

function frame(now) {
  const interval = 1000 / TARGET_FPS;
  const next = V.nextFrameAt ?? now;
  if (now + 2 < next) return;
  V.nextFrameAt = now - next > interval / 2 ? now + interval : next + interval;
  const elapsed = now - (V.lastFrameAt ?? now);
  const dt = Math.min(elapsed / 1000, .05) * TIME_SCALE;
  V.lastFrameAt = now;
  for (const step of activeTweens) step(now);
  if (V.renderHold) return;   // 動画の再生中は3Dの描画を止める
  tuneEffects(elapsed, interval);
  V.time = (V.time || 0) + dt;
  const t = V.time;
  V.uniforms.uTime.value = t;
  updateGroove(now);

  // 45 秒分の壁のノイズを補間し、折り返して境界をつなぐ。
  V.wallFrame.value = 15 - Math.abs(t / 3 % 30 - 15);

  // カメラ: ゆっくり揺れる + 寄り
  if (V.camRig) {
    V.camRig(dt, t);
  } else if (V.fixedView) {
    V.camera.position.copy(V.homePos);
    V.camera.quaternion.copy(V.homeQuat);
  } else {
    const sway = V.sway.set(Math.sin(t * .23) * .18, Math.sin(t * .31) * .1, 0).applyQuaternion(V.homeQuat);
    V.camera.position.copy(V.homePos).add(V.camOffset);
    V.camera.position.addScaledVector(sway, 1 - groove.presence);
    V.camera.quaternion.copy(V.homeQuat);
  }
  grooveCamera(V.camera, now);
  if (!V.fixedView && V.shakeAmt > .002) {
    const k = V.shakeAmt;
    V.camera.position.add(V.shakeOffset.set((Math.random() - .5) * k, (Math.random() - .5) * k, (Math.random() - .5) * k * .5));
    V.shakeAmt *= Math.pow(V.shakeKeep ? 1 : .015, dt);
  }

  // スポットライト
  V.spotT = (V.spotT || 0) + dt * V.spotSpeed;
  const fu = V.floor.material.uniforms;
  // 床の光の波: 曲が鳴っていれば拍ごと、無音ならゆっくり
  const lead = grooveLayers[0].weight >= grooveLayers[1].weight ? grooveLayers[0] : grooveLayers[1];
  const beatOn = clamp01(groove.presence);
  fu.uBeat.value = beatOn > .01 ? lead.phase : t * .35;
  fu.uBeatAmt.value = lerp(.35, .55 + .9 * groove.power, beatOn);
  if (beatOn > .01) fu.uWaveCol.value.set(groove.r, groove.g, groove.b).divideScalar(Math.max(groove.presence, .01));
  const spotPower = V.spotPower * (1 + .14 * groove.pulse * groove.power);
  V.spots.forEach((s, i) => {
    const a = V.spotT * .35 + s.phase;
    s.target.set(Math.sin(a) * 6.5, 0, Math.cos(a * .8 + i) * 4.2 - .6).lerp(V.spotFocusAt, V.spotFocus);
    if (V.spotLock && V.spotLock[i]) s.target.lerp(V.spotLock[i], V.spotLockAmt || 0);   // 1本ずつ別の場所に向ける
    aimBeam(s.mesh, s.from, s.target, lerp(1.7, 1.1, V.spotFocus));
    fu.uSpot.value[i].set(s.target.x, s.target.z, lerp(1.9, 1.3, V.spotFocus));
    const color = grooveSpot(s.mesh.material.uniforms.uColor.value, s.col);
    fu.uSpotCol.value[i].set(color.r, color.g, color.b).multiplyScalar(spotPower);
    s.mesh.material.uniforms.uOpacity.value = .16 * spotPower;
  });

  // 名札がふわふわ浮く
  for (const key in V.seat) {
    const o = V.seat[key];
    o.pivot.position.x = o.base.x + (o.rippleX || 0);
    const lift = groovePlate(o, now);
    const float = Math.sin(t * 1.3 + o.phase) * .03 * (1 - groove.presence);
    o.pivot.position.y = o.base.y + lift + float + (o.jump || 0) + (o.rippleY || 0);
    o.pivot.position.z = o.base.z + (o.rippleZ || 0);
    if (o.catPlacement) {
      o.pivot.position.copy(o.catPlacement.position);
      o.pivot.quaternion.copy(o.catPlacement.rotation);
      o.pivot.scale.setScalar(o.catPlacement.scale);
    } else if (V.billboard) o.pivot.quaternion.copy(V.camera.quaternion);
  }

  if (V.onFrame) for (const f of V.onFrame) f(dt, t);
  updateSparks(dt);
  V.composer.render();
}

function addFrameHook(f) { (V.onFrame ||= new Set()).add(f); return () => V.onFrame.delete(f); }

// 発表対象以外の机と名札を暗くし、文字とネオンの発光は明るめに保つ。
function focusAnnouncement(keys = [], immediate = false) {
  const targets = new Set(keys);
  const current = V.announcementTargets;
  if (!immediate && current?.size === targets.size && keys.every(key => current.has(key))) return;
  V.announcementTargets = targets;
  const transition = V.announcementLight = [];
  for (const [key, seat] of Object.entries(V.seat)) {
    const light = targets.size && !targets.has(key) ? .55 : 1;
    if (seat.light !== light) transition.push({ seat, from: seat.light, light });
  }
  if (!transition.length) return;
  const { ped, top, strip, glow, color } = V.deskParts;
  const apply = t => {
    if (V.announcementLight !== transition) return;
    for (const { seat, from, light } of transition) {
      const previous = seat.light;
      const k = seat.light = t === 1 ? light : lerp(from, light, t);
      const nameLight = lerp(.5, 1, k);
      const glowLight = deskGlowLight(k);
      seat.front.material.color.setScalar(PLATE_FRONT_LIGHT * nameLight);
      seat.back.material.color.setScalar(PLATE_BACK_LIGHT * nameLight);
      seat.lock.material.color.setScalar(nameLight);
      seat.frame.material.color.multiplyScalar(glowLight / deskGlowLight(previous));
      ped.setColorAt(seat.index, color.setScalar(k));
      top.setColorAt(seat.index, color);
      strip.setColorAt(seat.index, color.copy(seat.stripColor).multiplyScalar(glowLight));
      glow.setColorAt(seat.index, color.copy(seat.glowColor).multiplyScalar(glowLight));
    }
    ped.instanceColor.needsUpdate = top.instanceColor.needsUpdate = true;
    strip.instanceColor.needsUpdate = glow.instanceColor.needsUpdate = true;
  };
  if (immediate) apply(1);
  else return tween(400 * TIME_SCALE, apply);
}

function shake(amt) { V.shakeAmt = Math.max(V.shakeAmt, amt); }
