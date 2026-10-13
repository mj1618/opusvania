/**
 * Rook, the crow knight-errant. A small upright corvid in a cloak of long layered feathers, a sleek
 * hood flowing into a long bone beak-mask, one cool eye-light. Body-local coordinates have their
 * origin at the hip; the hip sits HIP units above the feet.
 */
import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from '../types';

const PI = Math.PI;
const HIP = 24;
const TIBIA = 12.5;
const TARSUS = 13.5;

type Stop = readonly [number, number];

function grad(x0: number, y0: number, x1: number, y1: number, stops: readonly Stop[]): FillGradient {
  const g = new FillGradient({
    type: 'linear',
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
    textureSpace: 'local',
  });
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// Feather values: lit upper right, falling to blue-black at the lower left.
const G_FEATHER = grad(1, 0, 0, 1, [
  [0, 0x35467f],
  [0.45, 0x171f44],
  [1, 0x0a0e22],
]);
const G_FEATHER_UNDER = grad(1, 0, 0, 1, [
  [0, 0x232e62],
  [0.5, 0x0f1532],
  [1, 0x070a1a],
]);
const G_FEATHER_FAR = grad(1, 0, 0, 1, [
  [0, 0x152048],
  [1, 0x080b1c],
]);
const G_TORSO = grad(1, 0, 0, 1, [
  [0, 0x222c5a],
  [0.5, 0x10162f],
  [1, 0x080b1a],
]);
const G_HOOD = grad(0.9, 0, 0.2, 1, [
  [0, 0x3e4d90],
  [0.4, 0x1c2550],
  [1, 0x0a0e20],
]);
const G_MANTLE = grad(1, 0, 0.1, 1, [
  [0, 0x384684],
  [0.5, 0x192148],
  [1, 0x0b0f24],
]);
const G_BONE = grad(0.3, 0, 0.5, 1, [
  [0, 0xfbf1da],
  [0.45, 0xe2d3b4],
  [0.8, 0xa9a39a],
  [1, 0x767f8e],
]);
const G_BLADE = grad(0, 0, 1, 1, [
  [0, 0xe8dcc2],
  [0.3, 0xa9b4bc],
  [1, 0xb8c6cc],
]);

const SHEEN_TEAL = 0x43c9bb;
const SHEEN_VIOLET = 0x8f7df0;
const RIM_WARM = 0xffcf96;

interface Feather {
  x: number;
  y: number;
  /** Direction from +x, y down: PI/2 hangs straight down, more than that sweeps backward. */
  a: number;
  len: number;
  w: number;
  bend: number;
  sheen: number;
  sheenColor: number;
}

function drawFeather(g: Graphics, f: Feather, fill: FillGradient): void {
  const c0 = Math.cos(f.a);
  const s0 = Math.sin(f.a);
  const c1 = Math.cos(f.a + f.bend * 0.5);
  const s1 = Math.sin(f.a + f.bend * 0.5);
  const c2 = Math.cos(f.a + f.bend);
  const s2 = Math.sin(f.a + f.bend);
  const p1x = f.x + c0 * f.len * 0.45;
  const p1y = f.y + s0 * f.len * 0.45;
  const tx = p1x + c2 * f.len * 0.55;
  const ty = p1y + s2 * f.len * 0.55;
  // Edge control points, one set per side (sign s along the normal).
  const edge = (s: number, inset: number) => {
    const w = f.w * (1 - inset);
    return {
      ax: f.x - s0 * s * w * 0.32,
      ay: f.y + c0 * s * w * 0.32,
      bx: f.x + c0 * f.len * 0.26 - s0 * s * w,
      by: f.y + s0 * f.len * 0.26 + c0 * s * w,
      cx: p1x + c1 * f.len * 0.33 - s1 * s * w * 0.92,
      cy: p1y + s1 * f.len * 0.33 + c1 * s * w * 0.92,
    };
  };
  const l = edge(1, 0);
  const r = edge(-1, 0);
  g.moveTo(l.ax, l.ay)
    .bezierCurveTo(l.bx, l.by, l.cx, l.cy, tx, ty)
    .bezierCurveTo(r.cx, r.cy, r.bx, r.by, r.ax, r.ay)
    .closePath()
    .fill(fill);
  if (f.sheen > 0.01) {
    // The lit edge is whichever side faces the key light (upper right).
    const s = -s1 * 0.75 - c1 * 0.65 > 0 ? 1 : -1;
    const o = s === 1 ? l : r;
    const i = edge(s, f.sheenColor === RIM_WARM ? 0.13 : 0.24);
    g.moveTo(o.ax, o.ay)
      .bezierCurveTo(o.bx, o.by, o.cx, o.cy, tx, ty)
      .bezierCurveTo(i.cx, i.cy, i.bx, i.by, o.ax, o.ay)
      .closePath()
      .fill({ color: f.sheenColor, alpha: f.sheen });
  }
  // Shaft: a hairline down the middle, barely there.
  g.moveTo(f.x, f.y)
    .quadraticCurveTo(p1x, p1y, tx, ty)
    .stroke({ color: 0x4a5a96, width: 0.3, alpha: 0.2, cap: 'round' });
}

/** A tapered limb segment with a slight belly, so it never reads as a sausage. */
function limb(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  wa: number,
  wb: number,
  bulge: number,
  color: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d;
  const ny = dx / d;
  const mx = ax + dx * 0.35;
  const my = ay + dy * 0.35;
  g.moveTo(ax + nx * wa, ay + ny * wa)
    .quadraticCurveTo(mx + nx * (wa + bulge), my + ny * (wa + bulge), bx + nx * wb, by + ny * wb)
    .lineTo(bx - nx * wb, by - ny * wb)
    .quadraticCurveTo(mx - nx * (wa + bulge * 0.4), my - ny * (wa + bulge * 0.4), ax - nx * wa, ay - ny * wa)
    .closePath()
    .fill(color);
}

function toe(g: Graphics, x: number, y: number, a: number, len: number, curl: number, color: number): void {
  const mx = x + Math.cos(a) * len * 0.6;
  const my = y + Math.sin(a) * len * 0.6;
  const a2 = a + curl;
  const tx = mx + Math.cos(a2) * len * 0.5;
  const ty = my + Math.sin(a2) * len * 0.5;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  g.moveTo(x - nx * 1.1, y - ny * 1.1)
    .quadraticCurveTo(mx - nx * 1.3, my - ny * 1.3, tx, ty)
    .quadraticCurveTo(mx + nx * 0.5, my + ny * 0.5, x + nx * 0.9, y + ny * 0.9)
    .closePath()
    .fill(color);
}

function drawLeg(
  g: Graphics,
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  footA: number,
  curl: number,
  near: boolean,
): void {
  // The ankle sits just above the toes; two-bone IK with the joint bending backward.
  let dx = fx - hx;
  let dy = fy - 1.2 - hy;
  let d = Math.hypot(dx, dy);
  const max = TIBIA + TARSUS - 0.3;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const ax = hx + dx;
  const ay = hy + dy;
  const base = Math.atan2(dy, dx);
  const k = Math.acos(Math.max(-1, Math.min(1, (TIBIA * TIBIA + d * d - TARSUS * TARSUS) / (2 * TIBIA * d))));
  const kx = hx + Math.cos(base + k) * TIBIA;
  const ky = hy + Math.sin(base + k) * TIBIA;
  const thigh = near ? 0x121936 : 0x0a0f22;
  const shank = near ? 0x5a6874 : 0x27343f;
  const lit = near ? 0xa9b6b0 : 0x3e4d55;
  // Feathered thigh, then the thin scaled shank.
  limb(g, hx, hy - 2, kx, ky, 4.2, 1.5, 1.6, thigh);
  limb(g, kx, ky, ax, ay, 1.35, 1.05, 0.25, shank);
  g.circle(kx, ky, 1.5).fill(shank);
  // Light catches the front of the shank.
  g.moveTo(kx + 0.9, ky + 0.6)
    .lineTo(ax + 0.7, ay - 0.5)
    .stroke({ color: lit, width: 0.55, alpha: near ? 0.85 : 0.5, cap: 'round' });
  // Three toes forward (fanned in depth), one behind.
  toe(g, ax, ay + 0.2, footA + PI - 0.12, 4.2, -0.5 - curl, shank);
  toe(g, ax, ay, footA - 0.2 + curl * 0.6, 7.2, 0.3 + curl, near ? 0x3d4a56 : shank);
  toe(g, ax, ay + 0.3, footA - 0.03 + curl, 9.4, 0.1 + curl, shank);
  g.moveTo(ax + 1, ay - 0.2)
    .lineTo(ax + Math.cos(footA + curl) * 6.5, ay + Math.sin(footA + curl) * 6.5 - 0.3)
    .stroke({ color: lit, width: 0.45, alpha: near ? 0.7 : 0.35, cap: 'round' });
}

function drawBlade(g: Graphics): void {
  // A needle, hilt over the back shoulder, point just clearing the cloak at the front hip.
  const px = -21.5;
  const py = -53;
  const ux = 0.468;
  const uy = 0.884;
  const at = (d: number, off = 0) => [px + ux * d - uy * off, py + uy * d + ux * off] as const;
  const [g0x, g0y] = at(13);
  const [tx, ty] = at(65);
  const [b0x, b0y] = at(13, 1.25);
  const [b1x, b1y] = at(13, -1.25);
  const [m0x, m0y] = at(56, 1.05);
  const [m1x, m1y] = at(56, -1.05);
  g.moveTo(b0x, b0y)
    .lineTo(m0x, m0y)
    .lineTo(tx, ty)
    .lineTo(m1x, m1y)
    .lineTo(b1x, b1y)
    .closePath()
    .fill(G_BLADE);
  // Grip, wrapped; pommel; a short guard.
  const [h0x, h0y] = at(1.5);
  limb(g, h0x, h0y, g0x, g0y, 1.0, 1.25, 0.2, 0x6c6258);
  for (let i = 0; i < 4; i++) {
    const [w0x, w0y] = at(3.2 + i * 2.4, 1.2);
    const [w1x, w1y] = at(4.2 + i * 2.4, -1.2);
    g.moveTo(w0x, w0y).lineTo(w1x, w1y).stroke({ color: 0xd9ccb0, width: 0.6, alpha: 0.8 });
  }
  const [q0x, q0y] = at(12.6, 3.4);
  const [q1x, q1y] = at(13.6, -3.4);
  g.moveTo(q0x, q0y).lineTo(q1x, q1y).stroke({ color: 0xe9dcc0, width: 1.5, cap: 'round' });
  const [pmx, pmy] = at(0.6);
  g.moveTo(pmx, pmy - 1.9)
    .quadraticCurveTo(pmx + 2, pmy, pmx, pmy + 1.9)
    .quadraticCurveTo(pmx - 2, pmy, pmx, pmy - 1.9)
    .fill(0xe9dcc0);
}

function drawTorso(g: Graphics): void {
  // A bird's breast: full in front, flat down the back, ending in thigh tufts.
  g.moveTo(1, -40)
    .bezierCurveTo(9, -38, 12.5, -28, 11.5, -19)
    .bezierCurveTo(11, -10, 9, -3, 5.5, 4)
    .bezierCurveTo(4, 6.5, 2, 6.5, 0.5, 3.5)
    .bezierCurveTo(-1, 6, -3.5, 6, -5, 2.5)
    .bezierCurveTo(-9, -4, -10.5, -14, -9.5, -24)
    .bezierCurveTo(-9, -32, -6, -38, 1, -40)
    .closePath()
    .fill(G_TORSO);
}

function drawMantle(g: Graphics): void {
  // One calm cape over the shoulders: the hood runs straight into it. A single long hem curve.
  g.moveTo(8.5, -40)
    .bezierCurveTo(12, -36, 13.2, -31, 12.2, -25.5)
    .bezierCurveTo(8, -22.6, 1, -22, -5, -23.4)
    .bezierCurveTo(-8.5, -24.2, -11.5, -25.6, -13.2, -27.5)
    .bezierCurveTo(-13.4, -33, -11, -38, -7.5, -41.5)
    .bezierCurveTo(-3, -43.5, 5, -43.5, 8.5, -40)
    .closePath()
    .fill(G_MANTLE);
  // Soft form light on the front shoulder.
  g.moveTo(8, -38.5)
    .bezierCurveTo(11.4, -35, 12.4, -31, 11.6, -26.4)
    .bezierCurveTo(8.5, -25, 5.5, -24.6, 3, -24.6)
    .bezierCurveTo(6.5, -28, 7.5, -33, 8, -38.5)
    .closePath()
    .fill({ color: 0x4a5fa8, alpha: 0.28 });
  // One feather-edge fold across the cape.
  g.moveTo(-9.5, -27)
    .bezierCurveTo(-4, -29.5, 3, -30, 9.5, -31.5)
    .bezierCurveTo(3, -29, -4, -28.4, -9.5, -27)
    .closePath()
    .fill({ color: 0x050812, alpha: 0.5 });
  // Short shoulder feathers lying flat on the cape.
  const f: Feather = { x: 0, y: 0, a: 0, len: 0, w: 5.2, bend: -0.1, sheen: 0, sheenColor: SHEEN_TEAL };
  for (let i = 4; i >= 0; i--) {
    const u = i / 4;
    f.x = lerp(-7.5, 7, u);
    f.y = -39 + Math.abs(u - 0.5) * 3;
    f.a = PI / 2 + lerp(0.5, -0.28, u);
    f.len = lerp(13.5, 14.5, u);
    f.sheen = lerp(0.14, 0.42, u);
    f.sheenColor = i % 2 === 0 ? SHEEN_TEAL : SHEEN_VIOLET;
    drawFeather(g, f, G_FEATHER);
  }
  // Thin warm rim down the front edge, teal sheen along the hem.
  g.moveTo(8.5, -40)
    .bezierCurveTo(12, -36, 13.2, -31, 12.2, -25.5)
    .bezierCurveTo(12.5, -30.6, 11.4, -35.6, 8, -39.4)
    .closePath()
    .fill({ color: RIM_WARM, alpha: 0.85 });
  g.moveTo(12.2, -25.5)
    .bezierCurveTo(8, -22.6, 1, -22, -5, -23.4)
    .bezierCurveTo(1, -23, 7.5, -23.6, 12, -26.6)
    .closePath()
    .fill({ color: SHEEN_TEAL, alpha: 0.5 });
}

function drawHead(g: Graphics): void {
  // Bone mask: one long, slender, down-curved bill; heron-skull lean.
  g.moveTo(6, -6.6)
    .bezierCurveTo(18, -8.2, 36, -3, 51, 9.6)
    .quadraticCurveTo(52.2, 11.6, 50, 11)
    .bezierCurveTo(38, 6.6, 24, 6.2, 11, 5.2)
    .bezierCurveTo(6.5, 4.6, 4, 0, 6, -6.6)
    .closePath()
    .fill(G_BONE);
  // Lower mandible in cool shadow, with the seam above it.
  g.moveTo(12, 2.2)
    .bezierCurveTo(25, 3, 38, 5.2, 50.2, 10.8)
    .bezierCurveTo(38, 6.6, 24, 6.2, 11, 5.2)
    .closePath()
    .fill({ color: 0x4e5878, alpha: 0.5 });
  g.moveTo(13, 2.1)
    .bezierCurveTo(25, 2.8, 38, 5, 49.5, 10.2)
    .stroke({ color: 0x3a3f58, width: 0.35, alpha: 0.7, cap: 'round' });
  // Warm light along the culmen.
  g.moveTo(11, -7)
    .bezierCurveTo(21, -7.4, 36, -2.6, 50.4, 9.2)
    .bezierCurveTo(36, -1, 22, -5.4, 11, -5.8)
    .closePath()
    .fill({ color: 0xfffaea, alpha: 0.85 });
  // Nostril slit and an old hairline crack.
  g.moveTo(20, -3.2)
    .quadraticCurveTo(23.5, -3, 26, -1.2)
    .quadraticCurveTo(22.5, -1.9, 20, -3.2)
    .fill({ color: 0x5b5560, alpha: 0.75 });
  g.moveTo(32.5, -1)
    .lineTo(33.4, 1.2)
    .lineTo(32.8, 2.2)
    .lineTo(33.7, 4)
    .stroke({ color: 0x6b6470, width: 0.28, alpha: 0.55 });
  // Eye socket: a stern slanted cut that opens into the dark of the hood.
  g.moveTo(3, -5.6)
    .bezierCurveTo(8, -6.6, 13.5, -5.6, 16.5, -2.2)
    .bezierCurveTo(13, -0.6, 9, 0.4, 4, 1.4)
    .closePath()
    .fill(0x0a0e20);
  // Hood: sleek crown, a short swept nape, brow overhanging the mask.
  g.moveTo(14.5, -5.6)
    .bezierCurveTo(12, -11.4, 5, -13.6, -1, -13.2)
    .bezierCurveTo(-7.5, -12.8, -12, -8, -12.2, -2.5)
    .bezierCurveTo(-12.4, 1.5, -14.5, 4.5, -18.5, 8)
    .bezierCurveTo(-13, 7.2, -9, 8.5, -6.5, 13)
    .bezierCurveTo(-3, 16, 3, 16, 6.5, 13)
    .bezierCurveTo(7.6, 10, 7.4, 7, 6.4, 5)
    .bezierCurveTo(4.4, 2, 4.6, -2.6, 7, -5)
    .bezierCurveTo(9.5, -6.2, 12.4, -6.2, 14.5, -5.6)
    .closePath()
    .fill(G_HOOD);
  // Broad soft form light on the crown.
  g.moveTo(11.5, -6.6)
    .bezierCurveTo(9.5, -10.6, 4, -12.4, -1.5, -12)
    .bezierCurveTo(-5.5, -11.6, -8.5, -9, -9.6, -5.6)
    .bezierCurveTo(-4, -9.4, 4, -9.2, 11.5, -6.6)
    .closePath()
    .fill({ color: 0x5068b4, alpha: 0.14 });
  // A quiet seam from the brow back to the nape.
  g.moveTo(8, -5.4)
    .bezierCurveTo(1, -3.6, -6, 0, -12.5, 5.5)
    .bezierCurveTo(-6, 1.2, 1, -2.2, 8, -4.4)
    .closePath()
    .fill({ color: 0x050812, alpha: 0.45 });
  // Fold where the hood wraps the cheek.
  g.moveTo(6.4, 5)
    .bezierCurveTo(4.4, 2, 4.6, -2.6, 7, -5)
    .bezierCurveTo(2, -3, 0.5, 3.5, 4.6, 9.5)
    .closePath()
    .fill({ color: 0x050812, alpha: 0.6 });
  // Thin warm rim on the crown, cool fill along the nape.
  g.moveTo(14.5, -5.6)
    .bezierCurveTo(12, -11.4, 5, -13.6, -1, -13.2)
    .bezierCurveTo(5, -12.9, 10.6, -10.8, 13.4, -5.9)
    .closePath()
    .fill({ color: RIM_WARM, alpha: 0.9 });
  g.moveTo(-12.2, -2.5)
    .bezierCurveTo(-12.4, 1.5, -14.5, 4.5, -18.5, 8)
    .bezierCurveTo(-14.4, 5.4, -11.6, 2, -11.5, -2.5)
    .closePath()
    .fill({ color: SHEEN_TEAL, alpha: 0.4 });
}

function drawGlow(g: Graphics): void {
  for (let i = 6; i >= 1; i--) {
    g.circle(0, 0, 0.8 + i * 0.7).fill({ color: 0x8fd4ff, alpha: 0.05 });
  }
  g.circle(0, 0, 1.25).fill({ color: 0x9fdcff, alpha: 0.55 });
  g.circle(0, 0, 0.75).fill(0xf2fbff);
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const smooth = (u: number): number => u * u * (3 - 2 * u);

function footPath(p: number): { x: number; y: number; a: number; curl: number } {
  const q = ((p % 1) + 1) % 1;
  if (q < 0.5) {
    const u = q / 0.5;
    // Planted, rolling onto the toes as it passes behind.
    return { x: lerp(11, -11, u), y: 0, a: u > 0.75 ? (u - 0.75) * 1.6 : 0, curl: 0 };
  }
  const u = (q - 0.5) / 0.5;
  const lift = Math.sin(PI * u);
  return {
    x: lerp(-11, 11, smooth(u)) - lift * 2,
    y: -lift * 10 - (1 - u) * 2,
    a: lerp(0.9, -0.25, u),
    curl: lift * 0.5,
  };
}

function create(pose: ConceptPose): ConceptInstance {
  const view = new Container();
  const back = new Container();
  const front = new Container();
  const backG = new Graphics();
  const bladeG = new Graphics();
  const tailG = new Graphics();
  const legsG = new Graphics();
  const torsoG = new Graphics();
  const longG = new Graphics();
  const midG = new Graphics();
  const mantleG = new Graphics();
  const head = new Container();
  const headG = new Graphics();
  const glowG = new Graphics();

  drawBlade(bladeG);
  drawTorso(torsoG);
  drawMantle(mantleG);
  drawHead(headG);
  drawGlow(glowG);
  glowG.position.set(10.6, -2.7);
  head.addChild(headG, glowG);
  head.pivot.set(-1, 9);
  head.position.set(2, -38);
  back.addChild(backG, bladeG, tailG);
  front.addChild(torsoG, longG, midG, mantleG, head);
  view.addChild(back, legsG, front);

  const run = pose === 'run';
  const jump = pose === 'jump';
  const open = jump ? 1 : 0;
  const stream = run ? 1 : 0;

  const f: Feather = { x: 0, y: 0, a: 0, len: 0, w: 0, bend: 0, sheen: 0, sheenColor: 0 };

  function update(t: number): void {
    const breath = Math.sin(t * 1.5);
    const phase = t * 1.55;
    const stride = Math.sin(phase * 2 * PI * 2);
    // Sway speed and depth per pose; every feather lags the one above it.
    const rate = run ? 9.5 : jump ? 4.2 : 1.15;
    const depth = run ? 0.075 : jump ? 0.045 : 0.022;
    const sway = (i: number, lag: number): number =>
      Math.sin(t * rate - i * lag) * depth + Math.sin(t * rate * 0.43 - i * lag * 1.7 + 1.3) * depth * 0.6;

    const hipX = run ? 1 : 0;
    const hipY = -HIP + (run ? 1.6 + stride * 1.3 : jump ? Math.sin(t * 1.3) * 1.2 : breath * 0.35);
    const lean = run ? 0.2 : jump ? -0.07 : 0.015 + Math.sin(t * 0.5) * 0.008;
    for (const c of [back, front]) {
      c.position.set(hipX, hipY);
      c.rotation = lean;
    }
    torsoG.scale.set(1 + breath * 0.012, 1);
    mantleG.position.y = -breath * 0.35;
    head.position.y = -38 - breath * 0.5;
    head.rotation = run
      ? -0.1 + stride * 0.015
      : jump
        ? 0.14 + Math.sin(t * 1.3) * 0.02
        : 0.05 + Math.sin(t * 0.37) * 0.035 + Math.sin(t * 0.9) * 0.008;

    // Eye: steady, a slow pulse, a rare blink.
    const blink = (t + 1.7) % 5.6;
    glowG.scale.y = blink < 0.14 ? 0.12 + Math.abs(blink - 0.07) * 12 : 1;
    glowG.alpha = 0.88 + Math.sin(t * 1.9) * 0.12;

    // Legs.
    legsG.clear();
    const hx = hipX + lean * 4;
    if (run) {
      const n = footPath(phase);
      const fa = footPath(phase + 0.5);
      drawLeg(legsG, hx - 2, hipY + 1, fa.x - 1, fa.y, fa.a, fa.curl, false);
      drawLeg(legsG, hx + 1.5, hipY + 1, n.x + 1, n.y, n.a, n.curl, true);
    } else if (jump) {
      const k = Math.sin(t * 1.3) * 0.8;
      drawLeg(legsG, hx - 2, hipY + 1, hx - 9, hipY + 21 + k, 0.95, 0.55, false);
      drawLeg(legsG, hx + 1.5, hipY + 1, hx + 4.5, hipY + 15.5 - k, 0.55, 0.7, true);
    } else {
      drawLeg(legsG, hx - 2.5, hipY + 1, -4.5, 0, 0, 0, false);
      drawLeg(legsG, hx + 1.5, hipY + 1, 3, 0, 0, 0, true);
    }

    // Far wing (airborne only): a darker fan behind the shoulder.
    backG.clear();
    if (open > 0) {
      for (let i = 0; i < 5; i++) {
        const u = i / 4;
        f.x = lerp(-9, -1, u);
        f.y = lerp(-45, -35, u);
        f.a = lerp(PI + 0.56, PI + 0.14, u) + sway(i, 0.5) * 0.8;
        f.len = lerp(33, 22, u);
        f.w = 6;
        f.bend = 0.22 + sway(i + 2, 0.5);
        f.sheen = 0.16;
        f.sheenColor = SHEEN_VIOLET;
        drawFeather(backG, f, G_FEATHER_FAR);
      }
    }

    // Tail: the longest primaries, split like a swallow's.
    tailG.clear();
    for (let i = 0; i < 3; i++) {
      const s = sway(i * 2 + 3, 0.6);
      f.x = -5 + i * 1.6;
      f.y = -12 + i * 1.5;
      const hang = i === 0 ? 0.74 : i === 1 ? 0.47 : 0.2;
      const blown = i === 0 ? 0.7 : i === 1 ? 0.84 : 0.86;
      const lifted = i === 0 ? 0.1 : i === 1 ? 0.3 : 0.4;
      f.a = PI / 2 + hang + stream * blown + open * lifted + s;
      f.len = i === 0 ? 45 : i === 1 ? 39 : 26;
      f.w = i === 2 ? 6 : 5.3;
      f.bend = (run ? 0.3 : jump ? 0.5 : -0.12) + s * 2.2;
      f.sheen = i === 2 ? 0.2 : 0.42;
      f.sheenColor = i === 0 ? SHEEN_VIOLET : SHEEN_TEAL;
      drawFeather(tailG, f, i === 2 ? G_FEATHER_FAR : G_FEATHER_UNDER);
    }

    // The cloak proper: seven long feathers that hang closed, stream when running and fan into the
    // near wing in the air. Drawn front to back so each lit front edge overlaps its neighbour.
    longG.clear();
    for (let i = 6; i >= 0; i--) {
      const u = i / 6;
      const s = sway(i, 0.55);
      const hangA = PI / 2 + lerp(0.3, -0.03, u) + stream * lerp(0.74, 0.36, u);
      const wingA = lerp(PI + 0.4, PI / 2 + 0.45, u);
      f.x = lerp(lerp(-7.5, 7.5, u), lerp(-13, -1, u), open);
      f.y = lerp(-30 + Math.abs(u - 0.5) * 3, lerp(-40, -27, u), open);
      f.a = lerp(hangA, wingA, open) + s;
      f.len = lerp(lerp(37, 35, u), lerp(42, 22, u), open);
      f.w = lerp(6.8, 6.2, open);
      f.bend = lerp(-0.1 + stream * 0.34, 0.2, open) + s * 1.8;
      f.sheen = i === 6 ? 0.85 : lerp(0.2, 0.52, u) + open * 0.12;
      f.sheenColor = i === 6 ? RIM_WARM : i % 3 === 1 ? SHEEN_VIOLET : SHEEN_TEAL;
      drawFeather(longG, f, G_FEATHER_UNDER);
    }

    // Coverts: a shorter layer over the breast and back.
    midG.clear();
    for (let i = 4; i >= 0; i--) {
      const u = i / 4;
      const s = sway(i + 1, 0.5) * 0.7;
      f.x = lerp(-8, 8, u);
      f.y = -31 + Math.abs(u - 0.5) * 2;
      f.a = PI / 2 + lerp(0.34, -0.12, u) + stream * lerp(0.4, 0.14, u) + open * lerp(0.3, 0.02, u) + s;
      f.len = lerp(27, 22, u);
      f.w = 6.6;
      f.bend = -0.08 + stream * 0.2 + s;
      f.sheen = i === 4 ? 0.85 : lerp(0.18, 0.5, u);
      f.sheenColor = i === 4 ? RIM_WARM : i % 2 === 0 ? SHEEN_TEAL : SHEEN_VIOLET;
      drawFeather(midG, f, G_FEATHER);
    }
  }

  update(0);
  return { view, update };
}

const concept: Concept = {
  id: 'crow',
  name: 'Rook, the crow knight-errant',
  blurb:
    'A small upright corvid wanderer: sleek dark hood running into a long bone beak-mask, one cool eye-light, ' +
    'a cloak of long iridescent feathers that trails as a split tail and opens into two short wings in the air.',
  create,
};

export default concept;
