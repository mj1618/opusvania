/**
 * The huntsman, drawn (memory/enemies-render.md "The huntsman"; rules in memory/enemies.md). A flat spider with eight
 * very long banded legs splayed crab-wise (laterigrade), seen side-on as it clings to a vertical face: its body lies
 * along the wall, its knees arch out into the gap and its feet come back to the bark. One rig for the painted rooms
 * (render/lantern/creatures.ts calls `drawHuntsman` with the bark palette and the glow pool) and the greybox
 * (render/greybox/creatures.ts, flat colours).
 *
 * Acting, from the sim state alone (a load or a re-form just shows):
 *  - scuttling (`skitter`, `flee`, `climb`, `run`): the legs ripple in an alternating gait driven by the distance it
 *    moves, fast and blurred; a pause is dead still but for the palps.
 *  - turning along the face: the body foreshortens through the pivot (its head swings toward her height).
 *  - the tell (`windup`): it flattens to the bark, knees down, legs spread wider; its eyes flash the hunt colour,
 *    quickening to the spring. A stillness before the lunge.
 *  - the lunge (`charge`): the body along its flight, every leg flung forward in a fan.
 *  - knocked down, falling (`fall` after a blow, `hurt` off its wall): it tumbles, legs flailing.
 *  - open (`recover`): on its back, legs up, kicking; `run`: righted, scrambling.
 *  - dead: knocked off along the blow, tumbling; down on its back the legs curl in, it lies, then fades.
 *  - a hit: the whole spider a bright warm white for 2 frames, then back over 3 (white is fine on creatures).
 *
 * Render time only (`dt`, `clock`); no Math.random (the seeds are the enemy index).
 */
import type { EnemyState } from '../../sim/state';

/** Colours and sizes (world px). Live knob: `HUNT`. */
export const HUNT = {
  /** Body length along the wall, and how far its body sits off the bark. */
  scale: 1.1,
  /** Its body's centre off the bark (world px at scale 1): the painted bark bulges past the sim's face. */
  off: 12,
  body: 0x4a3828,
  belly: 0x22170f,
  rim: 0xb89470,
  spot: 0x1c130c,
  leg: 0x35271b,
  band: 0x8c7356,
  eye: 0xf2e6d8,
  hunt: 0xff5a3c,
  flash: 0xfff1d8,
  /** Gait: radians of leg cycle per px moved, and its cap per second (beyond it the legs blur). */
  gaitPerPx: 0.42,
  gaitMax: 48,
  /** How fast its head swings round along the face (1/s). */
  turnRate: 16,
  /** Hit flash: full for `flashS`, back to its colour over `flashFadeS`. */
  flashS: 5 / 60,
  flashFadeS: 3 / 60,
  /** The dead body's fade, frames before it is gone. */
  fadeFrames: 36,
} as const;

/** One leg in world px: base, knee, foot; `near` = the side toward the viewer (drawn over the body). */
export interface Leg {
  bx: number;
  by: number;
  kx: number;
  ky: number;
  fx: number;
  fy: number;
  near: boolean;
}

/** What one frame of the spider is (filled by `HuntsmanRig.pose`). */
export interface HuntPose {
  /** Body centre and axes: `u` along the body toward its head, `v` its back (away from what it stands on). */
  x: number;
  y: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  /** How much of its length shows (a pivot on the face foreshortens it). */
  len: number;
  legs: Leg[];
  /** 0..1: the hunt colour in its eyes (the tell's quickening flashes). */
  eyes: number;
  /** 0..1: the warm white of a hit. */
  flash: number;
  alpha: number;
  /** On its back (open, or dead). */
  flipped: boolean;
  /** The tell's progress 0..1 (0 outside it). */
  tell: number;
}

const legs0 = (): Leg[] =>
  Array.from({ length: 8 }, (_, k) => ({ bx: 0, by: 0, kx: 0, ky: 0, fx: 0, fy: 0, near: k % 2 === 0 }));

/**
 * Leg pairs from the front: where each attaches along the body (u), where its foot rests on the bark (u, as a share
 * of the leg's reach: the front two pairs reach ahead, the back two behind), its reach, and the knee's height.
 */
const PAIRS = [
  { b: 7, f: 1, reach: 74, knee: 21, k: 0.46 },
  { b: 4, f: 0.66, reach: 68, knee: 24, k: 0.42 },
  { b: 1, f: -0.36, reach: 56, knee: 20, k: 0.4 },
  { b: -2, f: -0.84, reach: 66, knee: 17, k: 0.46 },
] as const;

export class HuntsmanRig {
  readonly p: HuntPose = {
    x: 0,
    y: 0,
    ux: 0,
    uy: -1,
    vx: 1,
    vy: 0,
    len: 1,
    legs: legs0(),
    eyes: 0,
    flash: 0,
    alpha: 1,
    flipped: false,
    tell: 0,
  };
  private gait = 0;
  /** Head along the face, smoothed: -1 up .. 1 down (through 0 it is side-on to us: foreshortened). */
  private head = -1;
  private spin = 0;
  private spinV = 0;
  private hitFrame = -1;
  private flashT = 1;
  private tellT = 0;
  private lastMode = '';
  private curl = 0;
  /** The flight's direction, smoothed (the body turns into its arc); `faSet` once this flight has one. */
  private fa = 0;
  private faSet = false;

  constructor(private readonly seed: number) {}

  /** Poses it for this render frame from its sim state. `alpha` = the sim's interpolation (0 previous .. 1 latest). */
  pose(e: Readonly<EnemyState>, dt: number, clock: number, alpha: number): HuntPose {
    const P = this.p;
    const s = HUNT.scale;
    const m = e.mode;
    if (m !== this.lastMode) {
      if (m === 'windup') this.tellT = 0;
      if ((m === 'fall' || m === 'hurt' || m === 'dead') && e.side === 0)
        this.spinV = (e.hitDir || e.facing || 1) * (9 + (this.seed % 5));
      if (m === 'dead') this.curl = 0;
      if (m === 'charge') this.faSet = false;
      this.lastMode = m;
    }
    // The hit: a new blow's frame.
    if (e.hitFrame !== this.hitFrame) {
      if (this.hitFrame !== -1 || e.hitFrame >= 0) this.flashT = 0;
      this.hitFrame = e.hitFrame;
    }
    this.flashT += dt;
    P.flash =
      this.flashT < HUNT.flashS
        ? 1
        : Math.max(0, 1 - (this.flashT - HUNT.flashS) / Math.max(1e-3, HUNT.flashFadeS));
    // Where it is: the box, interpolated back by its last step's motion.
    const back = 1 - Math.max(0, Math.min(1, alpha));
    const cx = e.x + e.w / 2 - e.vx * back;
    const cy = e.y + e.h / 2 - e.vy * back;
    const moved = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    this.gait += Math.min(moved * HUNT.gaitPerPx, HUNT.gaitMax * dt);
    if (m === 'windup') this.tellT += dt;
    const tell = m === 'windup' ? Math.min(1, this.tellT / Math.max(1e-3, (e.modeFrames + e.timer) / 60)) : 0;
    P.tell = tell;
    // The tell's flashes quicken: 2 at first, 7 by the spring.
    P.eyes = m === 'windup' ? ((tell ** 1.6 * 7) % 1 < 0.55 ? 1 : 0.35) : m === 'charge' ? 1 : 0;
    P.alpha = m === 'dead' ? Math.max(0, Math.min(1, e.timer / HUNT.fadeFrames)) : 1;
    P.flipped = false;
    P.len = 1;
    const onWall = e.side !== 0 && m !== 'dead';
    if (onWall) {
      // Body along the wall, head toward `lookY`, its back to the gap.
      this.head += (e.lookY - this.head) * Math.min(1, dt * HUNT.turnRate);
      const hd = this.head < 0 ? -1 : 1;
      P.len = Math.max(0.25, Math.abs(this.head));
      const press = m === 'windup' ? Math.min(1, tell * 3) : 0;
      const wallX = e.side < 0 ? e.x - e.vx * back : e.x + e.w - e.vx * back;
      const off = (HUNT.off - 4 * press) * s;
      P.x = wallX + e.facing * off;
      P.y = cy;
      P.ux = 0;
      P.uy = hd;
      P.vx = e.facing;
      P.vy = 0;
      this.stance(P, press, m === 'pause' || m === 'perch' || m === 'windup' ? 0 : 1, clock);
      return P;
    }
    if (m === 'run' || (m === 'recover' && e.timer <= 6)) {
      // Righted on the ground, scrambling.
      P.x = cx;
      P.y = e.y + e.h - 7 * s - e.vy * back;
      P.ux = e.facing;
      P.uy = 0;
      P.vx = 0;
      P.vy = -1;
      this.stance(P, 0, 1, clock);
      return P;
    }
    if (m === 'recover' || (m === 'dead' && e.landed)) {
      // On its back: legs up, kicking (open); dead, they curl in and still.
      P.flipped = true;
      P.x = cx;
      // (Above the floor's moss: the painted walk line hides its lowest ~8 px.)
      P.y = e.y + e.h - 12 * s - e.vy * back;
      P.ux = e.facing;
      P.uy = 0;
      // (`v` up: its legs (+v) in the air, its back (`flip`: -v) on the floor, its belly up.)
      P.vx = 0;
      P.vy = -1;
      if (m === 'dead') this.curl = Math.min(1, this.curl + dt * 2.2);
      this.onBack(P, m === 'dead' ? this.curl : 0.25, m === 'dead' ? (1 - this.curl) * 0.6 : 1, clock);
      return P;
    }
    P.x = cx;
    P.y = cy;
    if (m === 'charge') {
      // The lunge: along its flight, every leg thrown forward.
      const a = Math.atan2(e.knockVy, e.knockVx);
      this.fa = this.lastFlight(a, dt);
      P.ux = Math.cos(this.fa);
      P.uy = Math.sin(this.fa);
      // Its back up whichever way it flies.
      if (P.ux >= 0) {
        P.vx = P.uy;
        P.vy = -P.ux;
      } else {
        P.vx = -P.uy;
        P.vy = P.ux;
      }
      this.flung(P, clock);
      return P;
    }
    // Falling, tumbling (knocked out of the air, dying, or a lunge that met no wall).
    const broken = e.broken || m === 'hurt' || m === 'dead';
    if (!broken && m === 'fall') this.spinV *= Math.max(0, 1 - dt * 3);
    this.spin += this.spinV * dt * (broken ? 1 : 0.4);
    const a = broken ? this.spin : this.fa + this.spin * 0.3;
    P.ux = Math.cos(a);
    P.uy = Math.sin(a);
    P.vx = P.uy;
    P.vy = -P.ux;
    this.flail(P, clock, broken ? 1 : 0.5);
    return P;
  }

  private lastFlight(a: number, dt: number): number {
    // (Smoothed so a flat arc bends the body gently; its first frame snaps.)
    if (!this.faSet) {
      this.faSet = true;
      return a;
    }
    let d = a - this.fa;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return this.fa + d * Math.min(1, dt * 12);
  }

  /** Clinging or walking: feet on the surface under it (`v` = -7), knees arched out; `press` flattens it. */
  private stance(P: HuntPose, press: number, walk: number, clock: number): void {
    const s = HUNT.scale;
    // (Its feet reach back to the bark: `off` under its body.)
    const sub = -(HUNT.off - 4 * press) * s;
    for (let k = 0; k < 8; k++) {
      const pair = PAIRS[k >> 1] as (typeof PAIRS)[number];
      const near = k % 2 === 0;
      // Alternating tetrapod gait: near 1 & 3 with far 2 & 4.
      const ph = this.gait + ((k >> 1) % 2 === (near ? 0 : 1) ? 0 : Math.PI);
      const swing = walk * Math.sin(ph);
      const lift = walk * Math.max(0, Math.cos(ph));
      const spread = 1 + 0.18 * press;
      // (Twitching palps and toes at rest: a living thing even when still.)
      const idle = (1 - walk) * Math.sin(clock * 2.3 + k * 1.7 + this.seed) * 0.6;
      const fu = (pair.f * pair.reach * spread + swing * 7 + idle) * s;
      const fv = sub + lift * 6 * s;
      // (The far legs a little behind and lower: two ranks, not one ladder.)
      const bu = (pair.b + (near ? 0 : 2.5)) * s;
      const bv = (near ? 0.5 : -0.5) * s;
      const ku = bu + (fu - bu) * pair.k + (near ? 0 : (pair.f > 0 ? -4 : 4) * s);
      const kv = (pair.knee * (1 - 0.55 * press) + lift * 3) * s * (near ? 1 : 0.7);
      this.leg(P, k, bu, bv, ku, kv, fu, fv, near);
    }
  }

  /** The lunge: the front legs reach ahead in a fan, the back ones trail a little. */
  private flung(P: HuntPose, clock: number): void {
    const s = HUNT.scale;
    for (let k = 0; k < 8; k++) {
      const pair = k >> 1;
      const near = k % 2 === 0;
      const side = near ? 1 : -1;
      // Angle off the head axis, toward the back (v +) for the near legs, the belly for the far ones.
      const ang = [0.32, 0.72, 1.6, 2.3][pair] as number;
      const r = ([60, 54, 40, 44][pair] as number) * s;
      const wob = Math.sin(clock * 30 + k) * 0.05;
      const fu = Math.cos(ang + wob) * r;
      const fv = Math.sin(ang + wob) * r * side;
      const bu = (PAIRS[pair]?.b ?? 0) * s;
      const ku = bu + fu * 0.45;
      const kv = fv * 0.45 + side * 9 * s;
      this.leg(P, k, bu, 0, ku, kv, fu, fv, near);
    }
  }

  /** Tumbling: legs half folded, flailing. */
  private flail(P: HuntPose, clock: number, k0: number): void {
    const s = HUNT.scale;
    for (let k = 0; k < 8; k++) {
      const pair = k >> 1;
      const near = k % 2 === 0;
      const side = near ? 1 : -1;
      const base =
        ([0.5, 1.0, 1.9, 2.5][pair] as number) + Math.sin(clock * 22 * k0 + k * 2.1 + this.seed) * 0.35;
      const r = ([40, 38, 32, 36][pair] as number) * s;
      const fu = Math.cos(base) * r;
      const fv = Math.sin(base) * r * side;
      const bu = (PAIRS[pair]?.b ?? 0) * s;
      this.leg(P, k, bu, 0, bu + fu * 0.55 - fv * 0.15, fv * 0.6 + side * 6 * s, fu, fv, near);
    }
  }

  /** On its back: legs up, kicking (`kick`), curling in toward the body with `curl`. */
  private onBack(P: HuntPose, curl: number, kick: number, clock: number): void {
    const s = HUNT.scale;
    for (let k = 0; k < 8; k++) {
      const pair = PAIRS[k >> 1] as (typeof PAIRS)[number];
      const near = k % 2 === 0;
      const ph = clock * 17 + k * 1.9 + this.seed;
      const bu = (pair.b + (near ? 0 : 1.2)) * s;
      const reach = pair.reach * (1 - 0.55 * curl);
      const fu = (pair.f * reach * 0.7 + Math.sin(ph) * 8 * kick) * s;
      const fv = (22 + 22 * (1 - curl) + Math.cos(ph) * 6 * kick) * s;
      const ku = bu + (fu - bu) * 0.6 + (pair.f > 0 ? 8 : -8) * s * (1 - curl);
      const kv = (24 + 8 * (1 - curl)) * s;
      // (Curled, the tip folds back in over the knee.)
      this.leg(
        P,
        k,
        bu,
        1 * s,
        ku,
        kv * (near ? 1 : 0.85),
        fu * (1 - 0.6 * curl),
        fv * (1 - 0.3 * curl),
        near,
      );
    }
  }

  private leg(
    P: HuntPose,
    k: number,
    bu: number,
    bv: number,
    ku: number,
    kv: number,
    fu: number,
    fv: number,
    near: boolean,
  ): void {
    const L = P.legs[k] as Leg;
    const w = (u: number, v: number, out: 'b' | 'k' | 'f') => {
      const x = P.x + P.ux * u * P.len + P.vx * v;
      const y = P.y + P.uy * u * P.len + P.vy * v;
      if (out === 'b') {
        L.bx = x;
        L.by = y;
      } else if (out === 'k') {
        L.kx = x;
        L.ky = y;
      } else {
        L.fx = x;
        L.fy = y;
      }
    };
    w(bu, bv, 'b');
    w(ku, kv, 'k');
    w(fu, fv, 'f');
    L.near = near;
  }
}

/** What `drawHuntsman` draws with: a painted room's bark palette, or the greybox's flat one. */
export interface HuntPaint {
  body: number;
  belly: number;
  rim: number;
  spot: number;
  leg: number;
  band: number;
  eye: number;
  hunt: number;
  flash: number;
  /** Greybox: the front legs (its danger part) in this colour while it tells and lunges. */
  danger?: number;
}

/** Minimal drawing surface (Pixi Graphics). */
interface G {
  moveTo(x: number, y: number): G;
  lineTo(x: number, y: number): G;
  stroke(o: { color: number; width: number; alpha?: number; cap?: 'round'; join?: 'round' }): G;
  ellipse(x: number, y: number, rx: number, ry: number): G;
  poly(pts: number[]): G;
  circle(x: number, y: number, r: number): G;
  fill(o: { color: number; alpha?: number }): G;
}

function mixC(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (sh: number) => {
    const x = (a >> sh) & 255;
    const y = (b >> sh) & 255;
    return Math.round(x + (y - x) * k) << sh;
  };
  return ch(16) | ch(8) | ch(0);
}

const PT: number[] = [];

/** One body ellipse along the pose's axes (rotated: a polygon). */
function blob(
  g: G,
  P: HuntPose,
  u: number,
  v: number,
  ru: number,
  rv: number,
  color: number,
  alpha: number,
): void {
  PT.length = 0;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lu = u + Math.cos(a) * ru;
    const lv = v + Math.sin(a) * rv;
    PT.push(P.x + P.ux * lu * P.len + P.vx * lv, P.y + P.uy * lu * P.len + P.vy * lv);
  }
  g.poly(PT).fill({ color, alpha });
}

const at = (P: HuntPose, u: number, v: number): [number, number] => [
  P.x + P.ux * u * P.len + P.vx * v,
  P.y + P.uy * u * P.len + P.vy * v,
];

/** Draws a posed huntsman into `g`; `glow(x, y, r, color, alpha)` for its eyes (painted rooms), if given. */
export function drawHuntsman(
  g: G,
  P: HuntPose,
  C: HuntPaint,
  glow?: (x: number, y: number, r: number, color: number, alpha: number) => void,
): void {
  const a = P.alpha;
  if (a <= 0.01) return;
  const s = HUNT.scale;
  const f = P.flash;
  const leg = mixC(C.leg, C.flash, f);
  const legFar = mixC(mixC(C.leg, 0x000000, 0.35), C.flash, f * 0.8);
  const band = mixC(C.band, C.flash, f);
  const body = mixC(C.body, C.flash, f);
  const belly = mixC(C.belly, C.flash, f * 0.9);
  const rim = mixC(C.rim, C.flash, f);
  const danger = C.danger !== undefined && (P.tell > 0 || P.eyes >= 1) ? C.danger : undefined;
  const legsOf = (near: boolean) => {
    for (let k = 0; k < 8; k++) {
      const L = P.legs[k] as Leg;
      if (L.near !== near) continue;
      const c = danger !== undefined && k < 4 ? danger : near ? leg : legFar;
      // Femur thick, tibia and tarsus finer: a long tapering leg.
      g.moveTo(L.bx, L.by)
        .lineTo(L.kx, L.ky)
        .stroke({ color: c, width: 2.8 * s, alpha: a, cap: 'round' });
      g.moveTo(L.kx, L.ky)
        .lineTo(L.fx, L.fy)
        .stroke({ color: c, width: 1.7 * s, alpha: a, cap: 'round' });
      // The bands: pale rings across each segment (huntsmen's legs are banded).
      if (near || f > 0.3) {
        for (const [x0, y0, x1, y1, w] of [
          [L.bx, L.by, L.kx, L.ky, 2.9],
          [L.kx, L.ky, L.fx, L.fy, 1.8],
        ] as const) {
          const len = Math.hypot(x1 - x0, y1 - y0) || 1;
          // (Narrow pale rings, ~3 px long whatever the segment's length.)
          const k = Math.min(0.08, 1.6 / len);
          for (const u of [0.42, 0.78]) {
            const x = x0 + (x1 - x0) * u;
            const y = y0 + (y1 - y0) * u;
            const dx = (x1 - x0) * k;
            const dy = (y1 - y0) * k;
            g.moveTo(x - dx, y - dy)
              .lineTo(x + dx, y + dy)
              .stroke({ color: band, width: w * s, alpha: a * (near ? 0.75 : 0.4) });
          }
        }
        // The knee catches the light.
        g.circle(L.kx, L.ky, 1.6 * s).fill({ color: band, alpha: a * 0.7 });
      }
    }
  };
  legsOf(false);
  // The body: a flat abdomen and a smaller cephalothorax along the axis; the back (v +) catches the light.
  const flip = P.flipped ? -1 : 1;
  blob(g, P, -10 * s, 0, 13.5 * s, 5.5 * s, body, a);
  blob(g, P, 7 * s, 0.4 * s, 9 * s, 5 * s, body, a);
  blob(g, P, -10 * s, -2.4 * s * flip, 11 * s, 2.8 * s, belly, a * 0.9);
  // The rim along its back.
  {
    const [x0, y0] = at(P, -22 * s, 4.3 * s * flip);
    const [x1, y1] = at(P, -10 * s, 5.4 * s * flip);
    const [x2, y2] = at(P, 2 * s, 4.8 * s * flip);
    const [x3, y3] = at(P, 11 * s, 4.6 * s * flip);
    g.moveTo(x0, y0).lineTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3);
    g.stroke({ color: rim, width: 1.4 * s, alpha: a * 0.8, cap: 'round', join: 'round' });
  }
  // Mottling on the abdomen.
  for (const [u, v, r] of [
    [-13, 1.5, 1.8],
    [-8, 2.2, 1.4],
    [-4, 1.2, 1.6],
  ] as const) {
    const [x, y] = at(P, u * s, v * s * flip);
    g.circle(x, y, r * s).fill({ color: mixC(C.spot, C.flash, f), alpha: a * 0.8 });
  }
  // Eyes at the head's front edge: pale glints, the hunt colour in the tell.
  const eyeC = mixC(C.eye, C.hunt, P.eyes);
  for (const [u, v, r] of [
    [15.4, 1.8, 1.3],
    [14.6, 3.2, 1.05],
    [13.6, 0.4, 0.95],
  ] as const) {
    const [x, y] = at(P, u * s, v * s * flip);
    g.circle(x, y, r * s).fill({ color: f > 0.5 ? C.flash : eyeC, alpha: a });
  }
  if (glow) {
    const [ex, ey] = at(P, 14.8 * s, 1.8 * s * flip);
    glow(ex, ey, (5 + 9 * P.eyes) * s, eyeC, a * (0.12 + 0.45 * P.eyes));
    // The hit's warm bloom.
    if (f > 0) glow(P.x, P.y, 26 * s, C.flash, 0.35 * f * a);
  }
  legsOf(true);
}
