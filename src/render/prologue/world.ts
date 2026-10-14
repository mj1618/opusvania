// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * Shot 2, the world from very high (14-42 s). Night from very high: a curved dark horizon, the land
 * near-black teal, warm points of towns all over it. In the middle distance the mountain, folded and
 * too smooth, the pale light of shot 1 breathing small at its core. From its foot pale root spreads
 * over the land like frost across glass, branching on a wavefront, steam rising where it passes;
 * each town it reaches goes out. On a near ridge one stag against the sky: the frost reaches it, it
 * sinks straight down until only its antlers stand, and the antlers are the shape of the root; root
 * grows on from their tips. A few pale moth-flecks cross the frost line untouched; the camera picks
 * one and follows it down. The camera drifts slowly right the whole time, no cuts.
 *
 * Built once (it returns, run backwards, in the ending): the land is one shader (sky, land in true
 * perspective on a curved horizon, the frost's distance field and its veins, towns, steam), the
 * mountain is the kit's `MOUNTAIN`, the ridge, the stag and the moths are Graphics.
 *
 * World units on the land: eye height 1, the land's coordinates (X across, Z away from the eye).
 */
import { Container, Graphics } from 'pixi.js';
import { prng } from '../scene/lib/look';
import { MOUNTAIN } from '../world/bodies';
import type { Composer } from '../world/compose';
import { VIEW_H, VIEW_W } from '../world/layer';
import { glow } from '../world/paint';
import { WORLD } from './script';
import { envelope, Track, window01 } from './track';

/** The land's projection: horizon y at the frame's centre, its droop per px^2 (the curve), focal px. */
const H = 430;
const CURVE = 0.00004;
const F = 900;
/** Eye height in land units: high, so the land is not squashed flat toward the horizon. */
const E = 3;
/** The land's plane runs this far past the frame on each side (the camera leans in and pans). */
const PAD_X = 900;
const PAD_Y = 500;
/** The mountain's foot on the land, and where the frost starts. */
const M = { x: 0.15, z: 14 };
/** The frost front's radius (land units) at time t. */
const FROST_MAX = 13;

export function frostRadius(t: number): number {
  const [f0, f1] = WORLD.frost;
  const u = Math.min(1, Math.max(0, (t - f0) / (f1 - f0)));
  return FROST_MAX * u ** 1.25;
}

/** The camera's slow drift right (land units), at t. */
const DRIFT = new Track([
  { t: 14, v: [-0.5] },
  { t: 42, v: [0.9], ease: 'linear' },
]);

/** Screen x, y of a land point (X, Z) with the camera at `camX`. */
function project(x: number, z: number, camX: number): { x: number; y: number } {
  const sx = VIEW_W / 2 + ((x - camX) * F) / z;
  const dx = sx - VIEW_W / 2;
  return { x: sx, y: H + CURVE * dx * dx + (E * F) / z };
}

/**
 * uP0 horizon y, curve, focal, camera X; uP1 frost source X, Z, front radius, fade-in;
 * uP2 town density, steam, unused, unused.
 */
const LAND = /* glsl */ `
float horizonY(float x) { float d = x - 960.0; return uP[0].x + uP[0].y * d * d; }
float frostWarp(vec2 w) {
  return (fbm3(w * 0.42) - 0.5) * 2.6 + (vnoise(w * 1.7) - 0.5) * 0.5;
}
float frostDist(vec2 w) {
  vec2 q = w - uP[1].xy;
  return length(q * vec2(1.0, 0.85)) + frostWarp(w);
}
// Branching lines: noise ridges stretched along the way out from the source (spacing constant on
// the land, so they part and join as they go), a finer set off them, and a lace between.
float vline(float n, float px) {
  float l = 1.0 - abs(n * 2.0 - 1.0);
  float w = max(fwidth(l) * 1.3, 0.004);
  return smoothstep(1.0 - 0.03 - w, 1.0 - 0.03 + w * 0.5, l) * clamp(0.05 / w, 0.15, 1.0);
}
float veins(vec2 w, float px) {
  vec2 q = w - uP[1].xy;
  float r = max(length(q), 0.05);
  vec2 warp = vec2(fbm3(w * 0.7), fbm3(w * 0.7 + 7.3)) - 0.5;
  // Angle about the source, wandering: lines run out from it and fan; more sets join further out,
  // so they seem to branch.
  float a = atan(q.y, q.x) + warp.x * 0.35 / sqrt(r) + (fbm3(w * 2.2) - 0.5) * 0.12 / sqrt(r);
  float s1 = vline(vnoise(vec2(a * 14.0, r * 0.25 + warp.y * 0.5)), px);
  float s2 = vline(vnoise(vec2(a * 34.0, r * 0.5 + warp.x) + 11.0), px) * smoothstep(1.5, 3.5, r);
  float s3 = vline(vnoise(vec2(a * 80.0, r * 0.9) + warp * 2.0 + 4.0), px) * smoothstep(4.0, 7.0, r);
  float lace = vline(vnoise(w * 7.0 + warp * 3.0), px);
  return max(s1, max(0.6 * s2, max(0.4 * s3, 0.14 * lace)));
}
vec4 paint() {
  vec2 p = vPx - vec2(${PAD_X}.0, ${PAD_Y}.0);
  float t = uT.x;
  float yh = horizonY(p.x);
  float R = uP[1].z;
  vec3 pale = vec3(0.85, 0.81, 0.77);
  vec3 col;
  if (p.y < yh) {
    // --- Sky: deep blue-violet, an airglow band hugging the curved horizon, stars.
    float up = (yh - p.y);
    col = mix(vec3(0.03, 0.04, 0.075), vec3(0.008, 0.01, 0.022), smoothstep(0.0, 420.0, up));
    col += vec3(0.05, 0.075, 0.09) * exp(-up / 26.0) + vec3(0.03, 0.03, 0.06) * exp(-up / 110.0);
    float s = hash12(floor(p / 2.0));
    float tw = 0.65 + 0.35 * sin(t * 1.1 + s * 70.0);
    col += vec3(0.6, 0.62, 0.75) * step(0.9986, s) * smoothstep(20.0, 200.0, up) * tw * 0.7;
    // The mountain's breath lights the sky low over it a little.
    col += vec3(0.05, 0.045, 0.05) * exp(-length((p - vec2(uP[2].z, yh)) * vec2(0.5, 1.4)) / 240.0) * (0.6 + 0.4 * uT.y);
    return vec4(col, 1.0);
  }
  // --- The land, in perspective.
  float z = uP[2].w * uP[0].z / max(p.y - yh, 0.5);
  vec2 w = vec2(uP[0].w + (p.x - 960.0) * z / uP[0].z, z);
  float haze = exp(-(p.y - yh) / 70.0);
  // Near-black teal, with the shapes of land: darker river valleys, paler uplands.
  float n = fbm(w * vec2(0.9, 0.9));
  float rv = 1.0 - abs(fbm3(w * 0.35 + 2.0) * 2.0 - 1.0);
  col = vec3(0.012, 0.03, 0.036) * (0.7 + 0.6 * n) * (1.0 - 0.4 * smoothstep(0.88, 0.97, rv));
  // The near land falls off into dark: depth, and the frame's foot is quiet.
  col *= mix(1.0, 0.35, smoothstep(700.0, 1080.0, p.y));
  // --- Towns: warm points, clustered, many in the distance. Each goes out as the frost reaches it.
  float px = z / uP[0].z;
  vec2 cell = w / 0.28;
  vec2 ci = floor(cell);
  float towns = 0.0;
  float covered = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = ci + vec2(float(i), float(j));
      float h = hash12(c * 1.31 + 7.0);
      // Towns: clusters on a coarse grid (a few lit, most land dark), a stray farm light between.
      vec2 cc = c * 0.28;
      vec2 C = floor(cc / 1.7);
      float has = step(hash12(C * 3.7 + 1.3), 0.6);
      vec2 cen = (C + 0.2 + 0.6 * vec2(hash12(C + 5.1), hash12(C + 9.4))) * 1.7;
      float cr = 0.45 + 0.6 * hash12(C + 2.9);
      float dens = (has * smoothstep(cr, cr * 0.25, length(cc - cen)) * 0.85 + 0.012) * uP[2].x;
      if (h > dens) continue;
      vec2 tp = (c + vec2(hash12(c + 3.1), hash12(c + 8.7)) * 0.8 + 0.1) * 0.28;
      float td = frostDist(tp);
      float alive = smoothstep(R - 0.05, R + 0.3, td);
      float size = (0.010 + 0.012 * hash12(c + 5.5)) / px;
      size = max(size, 0.9);
      float d = length((w - tp) / px * vec2(1.0, 1.0));
      float pt = exp(-d * d / (size * size)) + 0.25 * exp(-d / (size * 3.0));
      towns += pt * alive * (0.7 + 0.6 * hash12(c + 2.2));
      covered += pt * (1.0 - alive) * smoothstep(R - 1.2, R - 0.1, td);
    }
  // --- The frost: pale root branching outward from the mountain's foot.
  float fd = frostDist(w);
  float v = veins(w, px);
  // Veins lead the front by a little; the land behind it pales.
  float lead = 0.35;
  float reach = smoothstep(R + lead, R - 0.02, fd - v * lead * 0.8);
  float behind = smoothstep(R, R - 1.5, fd);
  float front = exp(-abs(fd - R) / 0.18) * step(fd, R + 0.4);
  float age = clamp((R - fd) / 4.0, 0.0, 1.0);
  vec3 frostCol = pale * (0.025 + 0.02 * n) * behind;
  frostCol += pale * v * reach * (0.62 - 0.4 * age) * (0.7 + 0.3 * uT.y);
  frostCol += pale * front * reach * v * 0.6 + pale * front * 0.07;
  col = mix(col, col * 0.4, behind * 0.7) + frostCol * uP[1].w;
  col += vec3(1.0, 0.68, 0.38) * towns * 1.35 * (1.0 - haze * 0.7);
  col += pale * covered * 0.25;
  // --- Steam where the front passes: look down the screen for the front, wisps rise from it.
  float st = 0.0;
  for (int k = 1; k <= 6; k++) {
    float yy = p.y + float(k) * 9.0;
    float zz = uP[2].w * uP[0].z / max(yy - yh, 0.5);
    vec2 ww = vec2(uP[0].w + (p.x - 960.0) * zz / uP[0].z, zz);
    float f = exp(-abs(frostDist(ww) - R) / 0.25);
    st += f * (1.0 - float(k) / 7.0);
  }
  float wisp = smoothstep(0.35, 0.75, fbm(vec2(p.x / 34.0, (p.y + t * 30.0) / 26.0)));
  col += pale * st * (0.25 + wisp) * 0.11 * uP[2].y * uP[1].w;
  // Distance haze toward the horizon.
  col = mix(col, vec3(0.04, 0.06, 0.08), haze * 0.8);
  return vec4(col, 1.0);
}`;

/** A branching line: points, each with a width; grown from its root at `born` (0..1 of the growth). */
interface Branch {
  pts: Array<[number, number]>;
  w: number;
  born: number;
}

/** Root that branches as it goes: a random walk along `dir`, children shed to the sides. */
function grow(
  rng: () => number,
  x: number,
  y: number,
  dir: number,
  len: number,
  w: number,
  depth: number,
  born: number,
  out: Branch[],
  spread = 0.5,
): void {
  const steps = Math.max(3, Math.round(len / 5));
  const pts: Array<[number, number]> = [[x, y]];
  let a = dir;
  let cx = x;
  let cy = y;
  for (let i = 1; i <= steps; i++) {
    a += (rng() - 0.5) * 0.5;
    a += (dir - a) * 0.15;
    cx += Math.cos(a) * (len / steps);
    cy += Math.sin(a) * (len / steps);
    pts.push([cx, cy]);
    if (depth > 0 && i > 1 && i < steps && rng() < 0.22) {
      const side = rng() < 0.5 ? -1 : 1;
      grow(
        rng,
        cx,
        cy,
        a + side * (spread + rng() * 0.5),
        len * (0.35 + rng() * 0.3) * (1 - i / steps / 2),
        w * 0.6,
        depth - 1,
        born + (i / steps) * (1 - born) * 0.9,
        out,
        spread,
      );
    }
  }
  out.push({ pts, w, born });
}

/** Draws branches grown to `k` (0..1). */
function drawBranches(g: Graphics, list: readonly Branch[], k: number, color: number, alpha: number): void {
  for (const b of list) {
    if (k <= b.born) continue;
    const u = Math.min(1, (k - b.born) / (1 - b.born));
    const n = Math.max(2, Math.ceil(b.pts.length * u));
    for (let i = 1; i < n; i++) {
      const p0 = b.pts[i - 1]!;
      const p1 = b.pts[i]!;
      const taper = 1 - (i / b.pts.length) * 0.7;
      g.moveTo(p0[0], p0[1])
        .lineTo(p1[0], p1[1])
        .stroke({ color, alpha, width: Math.max(0.6, b.w * taper), cap: 'round' });
    }
  }
}

/** The stag, standing, facing left, feet at (0, 0), about 64 px to the top of its antlers. */
function stagBody(g: Graphics, color: number): void {
  // Legs.
  for (const [x, lean] of [
    [-13, -1],
    [-9, 1],
    [11, -1],
    [15, 1.5],
  ] as const)
    g.poly([x - 1.4, -22, x + 1.4, -22, x + 0.8 + lean, 0, x - 0.6 + lean, 0]).fill(color);
  // Body and chest.
  g.ellipse(1, -26, 18, 7.5).fill(color);
  g.ellipse(-12, -27, 7, 8).fill(color);
  // Neck up and forward, the head.
  g.poly([-15, -31, -10, -32, -16, -45, -21, -44]).fill(color);
  g.poly([-17, -47, -21, -44, -29, -40, -30, -38, -27, -37.5, -18, -41]).fill(color);
  g.ellipse(-18, -45, 4, 3.4).fill(color);
  // Ear, tail.
  g.poly([-15, -47, -10, -50, -14, -45]).fill(color);
  g.poly([18, -30, 21, -28, 19, -25]).fill(color);
}

export function buildWorld(c: Composer): (t: number, dt: number) => void {
  const rng = prng(2042);
  c.grade = {
    shadow: 0x050812,
    shadowK: 0.02,
    deep: 0x010205,
    deepK: 0.82,
    saturation: 1.05,
    contrast: 1.08,
    grain: 0.026,
    vignette: 0.3,
    vignetteSoft: 0.6,
    bloom: [0.42, 0.8, 0.7],
  };
  const R = c.root;
  const view = new Container();
  R.addChild(view);
  const pulse = (t: number): number => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5);

  // --- Sky and land.
  const land = c.shader('land', -PAD_X, -PAD_Y, VIEW_W + 2 * PAD_X, VIEW_H + 2 * PAD_Y, LAND, view);
  land.pulse = pulse;

  // --- The mountain: lobes in its own plane, placed where its foot is on the land.
  const MW = 1200;
  const MH = 560;
  const mtn = c.shader('mountain', 0, 0, MW, MH, MOUNTAIN, view);
  mtn.pulse = pulse;
  const foot = { x: MW / 2, y: MH - 30 };
  const lobes: [number, number, number, number][] = [
    [0, -190, 170, 150],
    [-150, -110, 150, 100],
    [140, -120, 170, 115],
    [-290, -40, 140, 60],
    [300, -40, 170, 64],
    [-60, -300, 92, 86],
    [70, -280, 86, 80],
    [-430, 0, 120, 34],
  ];
  const MS = 0.72;
  for (const [i, [x, y, rx, ry]] of lobes.entries())
    mtn.p(i, foot.x + x * MS, foot.y + y * MS, rx * MS, ry * MS);
  mtn
    .p(8, foot.x, foot.y - 26, 110, 0.012)
    .c(9, 0x625c64)
    .c(10, 0x0c0e18)
    .c(11, 0xd8d0cc)
    .c(12, 0x121824, 0.22)
    .p(13, foot.y + 6, 3, 1.7);
  // The pale light at its core, breathing on shot 1's rhythm.
  const core = new Container();
  core.blendMode = 'add';
  view.addChild(core);
  const coreA = glow(0, 0, 22, 0xe8e2dc, 0.6);
  const coreB = glow(0, 0, 120, 0xa8a4b0, 0.2);
  core.addChild(coreB, coreA);

  // --- The near ridge (right of frame, comes in with the drift), the stag on its crest.
  const ridgeZ = 16;
  const ridgeX = 11.5;
  const RH = 170;
  const ridge = new Container();
  view.addChild(ridge);
  const stag = new Container();
  const stagG = new Graphics();
  stagBody(stagG, 0x05080c);
  stag.addChild(stagG);
  stag.scale.set(1.5);
  // The antlers: branching like the root, so when the rest sinks they are root.
  const antlers: Branch[] = [];
  const arng = prng(77);
  grow(arng, -17, -49, -1.75, 22, 1.6, 2, 0, antlers, 0.7);
  grow(arng, -15, -49, -1.2, 24, 1.6, 2, 0, antlers, 0.7);
  const antG = new Graphics();
  drawBranches(antG, antlers, 1, 0xffffff, 1);
  antG.tint = 0x05080c;
  stag.addChild(antG);
  // Root grown on from the antlers' tips.
  const tipRoots: Branch[] = [];
  for (const b of antlers) {
    if (b.w < 1.5) continue;
    const tip = b.pts[b.pts.length - 1]!;
    const prev = b.pts[b.pts.length - 2]!;
    const a = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    grow(arng, tip[0], tip[1], a, 70, 1.4, 3, 0, tipRoots, 0.6);
  }
  const tipG = new Graphics();
  stag.addChild(tipG);
  const ridgeG = new Graphics();
  // The ridge, in its own px: crest at (0, 0), its foot on the land RH px below.
  const crest: Array<[number, number]> = [];
  // Long and low to the left, broken off steep to the right, rocks along the top.
  const crestY = (x: number): number => {
    const k = x / 300;
    const body = k < 0 ? RH * Math.min(1.2, k * k * 0.95) : RH * Math.min(1.2, (k * 1.9) ** 2);
    const near = Math.max(0, 1 - Math.abs(k) * 1.4);
    const rocks = (5 * Math.sin(x * 0.11) + 3 * Math.sin(x * 0.37 + 1) + 2 * Math.sin(x * 0.9)) * near;
    return body - Math.max(0, rocks) - 6 * near;
  };
  for (let i = 0; i <= 48; i++) {
    const x = -480 + i * 20;
    crest.push([x, crestY(x)]);
  }
  const ridgePts = crest.flat();
  ridgeG.poly([...ridgePts, 480, RH + 40, -480, RH + 40]).fill(0x03070a);
  // Two dead trees on its shoulder, bare against the sky.
  const trees: Branch[] = [];
  const trng = prng(311);
  for (const tx of [-210, -150])
    grow(
      trng,
      tx,
      crestY(tx) + 2,
      -Math.PI / 2 + (trng() - 0.5) * 0.3,
      70 + trng() * 30,
      3.2,
      3,
      0,
      trees,
      0.6,
    );
  drawBranches(ridgeG, trees, 1, 0x03070a, 1);
  // A faint sky-rim along its crest.
  ridgeG.moveTo(crest[0]![0], crest[0]![1]);
  for (const [x, y] of crest) ridgeG.lineTo(x, y);
  ridgeG.stroke({ color: 0x3a4a5a, alpha: 0.35, width: 1.2 });
  // Frost veins that climb it from its foot to the crest when the front arrives.
  const ridgeFrost: Branch[] = [];
  const frng = prng(91);
  for (let i = 0; i < 4; i++) {
    const x0 = -300 + i * 150 + frng() * 50;
    grow(
      frng,
      x0,
      RH + 10,
      -Math.PI / 2 + (frng() - 0.5) * 0.5,
      RH - crestY(x0) + 14,
      1.2,
      2,
      0,
      ridgeFrost,
      0.8,
    );
  }
  const frostG = new Graphics();
  ridge.addChild(stag, ridgeG, frostG);
  stag.position.set(-8, 0);

  // --- Moth-flecks: their own paths over the frost line. The first is the one the camera follows.
  type Fleck = { g: Container; w: Graphics; path: (u: number) => [number, number]; t0: number; t1: number };
  const flecks: Fleck[] = [];
  const mothG = (span: number): { g: Container; w: Graphics } => {
    const g = new Container();
    const w = new Graphics();
    w.poly([0, 0, -span * 0.5, -span * 0.3, -span * 0.4, span * 0.14]).fill({ color: 0xe8e0d8, alpha: 0.95 });
    w.poly([0, 0, span * 0.5, -span * 0.3, span * 0.4, span * 0.14]).fill({ color: 0xe8e0d8, alpha: 0.95 });
    g.addChild(glow(0, 0, span * 3, 0xe8e0d8, 0.4), w);
    return { g, w };
  };
  const paths: Array<[number, number, number, number, number, number, number]> = [
    // x0, y0, x1, y1, wobble, t0, t1
    [520, 470, 1010, 760, 30, WORLD.moths[0] + 0.4, 42],
    [1500, 520, 900, 610, 24, WORLD.moths[0], 41],
    [300, 640, 760, 560, 18, WORLD.moths[0] + 1.1, 41.5],
    [1700, 700, 1250, 520, 26, WORLD.moths[0] + 0.7, 41],
    [1100, 470, 1600, 560, 20, WORLD.moths[0] + 1.6, 42],
  ];
  for (const [i, [x0, y0, x1, y1, wob, t0, t1]] of paths.entries()) {
    const m = mothG(i === 0 ? 7 : 4 + rng() * 2);
    view.addChild(m.g);
    const ph = rng() * 6;
    flecks.push({
      ...m,
      t0,
      t1,
      path: (u) => [
        x0 + (x1 - x0) * u + Math.sin(u * 9 + ph) * wob,
        y0 + (y1 - y0) * u + Math.sin(u * 13 + ph) * wob * 0.5,
      ],
    });
  }

  return (t: number) => {
    const camX = DRIFT.at(t);
    const Rf = frostRadius(t);
    const fadeIn = window01(t, WORLD.fadeIn[0], WORLD.fadeIn[1]);
    const mp = project(M.x, M.z, camX);
    land.p(0, H, CURVE, F, camX).p(1, M.x, M.z, Rf, 1).p(2, 1, 1, mp.x, E);
    mtn.mesh.position.set(mp.x - foot.x, mp.y - foot.y + 8);
    core.position.set(mp.x, mp.y - 22);
    const b = pulse(t);
    coreA.alpha = (0.35 + 0.45 * b) * fadeIn;
    coreB.alpha = (0.12 + 0.12 * b) * fadeIn;
    // The ridge.
    const rp = project(ridgeX, ridgeZ, camX);
    ridge.position.set(rp.x, rp.y - RH);
    const [s0, s1] = WORLD.stagSink;
    const climb = window01(t, s0 - 2.2, s0 + 0.4);
    frostG.clear();
    drawBranches(frostG, ridgeFrost, climb, 0xd9cfc4, 0.2);
    // It does not run: it sinks straight down until only the antlers stand.
    const sink = window01(t, s0, s1);
    stag.position.y = sink * 72 + Math.sin(t * 9) * 0.4 * envelope(t, s0, s0 + 0.2, s1 - 0.4, s1);
    // The antlers go pale: they are root.
    const pale = window01(t, s1 - 1, s1 + 0.6);
    antG.tint = lerpHex(0x05080c, 0xcfc6bc, pale);
    tipG.clear();
    drawBranches(tipG, tipRoots, window01(t, WORLD.stagRoot[0], WORLD.stagRoot[1]), 0xd9cfc4, 0.6);
    // The moths.
    for (const [i, f] of flecks.entries()) {
      const u = (t - f.t0) / (f.t1 - f.t0);
      f.g.visible = u > 0 && u < 1;
      if (!f.g.visible) continue;
      const [x, y] = f.path(u);
      f.g.position.set(x, y);
      f.w.scale.y = 0.25 + 0.75 * Math.abs(Math.sin(t * (i === 0 ? 17 : 14 + i) + i));
      f.g.alpha = Math.min(1, u * 8, (1 - u) * 8);
    }
    // The camera leans in on the stag while it sinks, eases back for the moths, then follows the
    // first moth down: the view closes on it.
    const sx = rp.x + stag.position.x - 18;
    const sy = rp.y - RH - 30;
    const sk = envelope(t, 28.5, 32.6, 36.2, 39);
    // Focus point (in the unzoomed frame), how far it is brought to the centre, the zoom.
    let fx = sx;
    let fy = sy;
    let m = 0.55 * sk;
    let s = 1 + 0.7 * sk;
    const [f0, f1] = WORLD.follow;
    const k = window01(t, f0, f1 + 0.6);
    const lead = flecks[0];
    if (lead && t > f0) {
      const [x, y] = lead.path(Math.min(1, (t - lead.t0) / (lead.t1 - lead.t0)));
      fx = sk > 0.01 ? fx + (x - fx) * k : x;
      fy = sk > 0.01 ? fy + (y - fy) * k : y;
      m += (1 - m) * k;
      s += (1 + 1.9 * k * k - s) * k;
    }
    view.scale.set(s);
    view.position.set(fx + (VIEW_W / 2 - fx) * m - fx * s, fy + (VIEW_H / 2 - fy) * m - fy * s);
    view.alpha = fadeIn * (1 - window01(t, WORLD.fadeOut[0], WORLD.fadeOut[1]));
  };
}

function lerpHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
