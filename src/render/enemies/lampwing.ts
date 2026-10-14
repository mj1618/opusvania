// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * The lampwing: rig and drawing (into the shared enemies painter, behind the hero). A ghost-moth
 * seen from the front: a slim pale body with a small dark head and two dim pinprick eyes, two
 * pairs of narrow, tattered, dusky translucent wings with a pale edge and pale veins, thin
 * antennae, a long trailing abdomen with one dim lamp in it. The wings run on the sim's `flap`
 * phase; everything else is springs on the sim state.
 */
import type { EnemyState } from '../../sim/state';
import { approach, clamp, noise1, Spring, sat, smoothstep } from '../character/hooded/math';
import { LAMP } from './config';
import type { Painter, RGB, Shade } from './paint';

type V3 = [number, number, number];
const TAU = Math.PI * 2;

function hex(o: V3, h: number): void {
  o[0] = ((h >> 16) & 255) / 255;
  o[1] = ((h >> 8) & 255) / 255;
  o[2] = (h & 255) / 255;
}

function zone(o: V3, c: readonly number[], zw: readonly number[]): void {
  for (let k = 0; k < 3; k++) {
    const sh = 16 - k * 8;
    o[k] =
      (((c[0]! >> sh) & 255) * zw[0]! + ((c[1]! >> sh) & 255) * zw[1]! + ((c[2]! >> sh) & 255) * zw[2]!) /
      255;
  }
}

/**
 * What a sim mode is, for the acting. The dive's own modes may be named differently from build to
 * build, so they are matched by name and anything unknown falls back on how it moves:
 * `tell` (`curious`: it has seen her and is about to come), `swoop` (`dive`: the committed fast pass),
 * `open` (`stall`, `rest`: hanging exposed at the bottom of the arc), `climb` (`pursue`: up to a
 * perch to tell again; `return`: off home).
 */
export type LampPhase = '' | 'tell' | 'swoop' | 'open' | 'climb';
export function phaseOf(mode: string): LampPhase {
  switch (mode) {
    case 'curious':
    case 'aim':
    case 'tell':
      return 'tell';
    case 'dive':
    case 'swoop':
    case 'stoop':
    case 'strike':
      return 'swoop';
    case 'rest':
    case 'stall':
    case 'spent':
    case 'open':
    case 'bottom':
    case 'recover':
    case 'hang':
      return 'open';
    case 'pursue':
    case 'return':
    case 'climb':
    case 'rise':
    case 'retreat':
      return 'climb';
    default:
      return '';
  }
}

export class LampRig {
  readonly seed: number;
  private frame = -1;
  private px = 0;
  private py = 0;
  private cx = 0;
  private cy = 0;
  private pf = 0;
  private cf = 0;
  /** Drawn centre (world px), wing-beat phase, and the last drawn position (for the dissolve). */
  x = 0;
  y = 0;
  flap = 0;
  /** Which way it is turned, -1..1 (eased facing). */
  readonly turn = new Spring(1, 14, 0.7);
  /** Body lean, rad. */
  readonly lean = new Spring(0, 13, 0.45);
  /** Antennae lag behind the body, px. */
  readonly lagX = new Spring(0, 16, 0.4);
  readonly lagY = new Spring(0, 16, 0.4);
  /**
   * A staged beat (the prologue: render/prologue), or null: `lit` 0..1 scales its lamp (0 = dark:
   * hanging unseen until the Hush looks through it). Never set by the game.
   */
  cine: { lit: number } | null = null;
  /** 0..1 weights, eased. */
  keen = 0;
  /** The tell: 1 while curious, easing off after. */
  flare = 0;
  /** The held beat of the tell: wings thrown wide and held, 0..1 (in fast, released into the swoop). */
  hold = 0;
  slack = 0;
  /** The dive: swept into a swoop, hanging open, climbing away (0..1 each, eased); the heading it is turned to, rad (0 = head up); its speed, px/f. */
  swoop = 0;
  open = 0;
  climb = 0;
  head = 0;
  speed = 0;
  fold = 0;
  tumble = 0;
  /** Frames into the mode and since the last hit (fractional). */
  mf = 0;
  /** Seconds since it last shed a scale (dead, falling). */
  shedT = 0;
  /** The dead body has gone to scales (nothing more is drawn of it). */
  dissolved = false;
  hitAge = 1e6;
  private hitSeen = -1;
  struck = false;
  /** It was alive and on screen last update (so `gone` can dissolve it once). */
  live = false;
  wasDead = false;
  lastDir = 1;
  lastPower = 1;
  /** Calmed, 0..1 (eased), and the phase of its slow swell, rad. */
  calmK = 0;
  swell = 0;
  /** The interpolated sim phase last update, to slow the drawn beat without a jump. */
  private simFlap = 0;
  /** Starting back from a lantern's light: 1 at the start, easing off; and the render-only offset it is thrown by, px. */
  flinch = 0;
  /** It has just seen her (`enemyAware`): the lamp flares and swings onto her, 1 -> 0. */
  spot = 0;
  /** She gave it a glint (`enemyGiveUp` cause `gift`): the lamp turned from her and down, 1 -> 0 over `LAMP.gift.dimFor` s. */
  giftDim = 0;
  /** Roosting (the sim's `e.roosting`, memory/giving-render.md): hung still, wings folded round it, lamp down; 0..1. */
  roostK = 0;
  /** Seconds to its next slow roost mote (index.ts). */
  roostMote = 0;
  private awayX = 0;
  readonly offX = new Spring(0, 8, 0.55);
  readonly offY = new Spring(0, 8, 0.55);

  /** It gives up at a light (`ax, ay` = unit vector from the light to it), or is calmed from afar (`k` < 1). */
  shy(ax: number, ay: number, k: number): void {
    this.flinch = Math.max(this.flinch, k);
    this.awayX = ax;
    this.offX.v += ax * LAMP.shy.kick * k;
    this.offY.v += ay * LAMP.shy.kick * k * 0.7;
  }

  constructor(index: number) {
    let h = (index * 2654435761) >>> 0;
    h ^= h >>> 15;
    this.seed = (h % 1000) / 1000;
  }

  /** `safe` = harmless for a lasting reason (inside a lit lantern's ring, the run is over). */
  update(e: EnemyState, simFrame: number, alpha: number, dt: number, safe = false): void {
    const nx = e.x + e.w / 2 + e.rx;
    const ny = e.y + e.h / 2 + e.ry;
    const fresh =
      this.frame < 0 || Math.abs(nx - this.cx) + Math.abs(ny - this.cy) > 90 || simFrame < this.frame;
    if (fresh) {
      this.px = this.cx = nx;
      this.py = this.cy = ny;
      this.pf = this.cf = e.flap;
      this.frame = simFrame;
      this.turn.snap(e.facing);
      this.lean.snap(0);
      this.lagX.snap(0);
      this.lagY.snap(0);
      this.keen = this.flare = this.hold = this.slack = this.fold = this.tumble = 0;
      this.swoop = this.open = this.climb = this.head = this.speed = 0;
      this.hitSeen = e.hitFrame;
      this.calmK = safe || e.calm > 0 ? 1 : 0;
      this.flinch = 0;
      this.offX.snap(0);
      this.offY.snap(0);
      this.flap = this.simFlap = e.flap;
    } else if (simFrame !== this.frame) {
      this.px = this.cx;
      this.py = this.cy;
      this.pf = this.cf;
      this.cx = nx;
      this.cy = ny;
      this.cf = e.flap;
      this.frame = simFrame;
    }
    const a = sat(alpha);
    this.x = this.px + (this.cx - this.px) * a;
    this.y = this.py + (this.cy - this.py) * a;
    // The phase wraps at 1: go the short way round.
    let df = this.cf - this.pf;
    if (df < -0.5) df += 1;
    else if (df > 0.5) df -= 1;
    // The drawn beat follows the sim's, slowed while it is calm (so the two drift apart: only the
    // rate is the sim's, the phase is ours).
    const calmT = e.mode === 'dead' ? 0 : safe ? 1 : sat(e.calm / LAMP.calm.fade);
    this.calmK += (calmT - this.calmK) * approach(calmT > this.calmK ? LAMP.calm.in : LAMP.calm.out, dt);
    const sf = this.pf + df * a;
    let adv = sf - this.simFlap;
    if (adv < -0.5) adv += 1;
    else if (adv > 0.5) adv -= 1;
    this.simFlap = sf;
    {
      const roost = e.roosting && e.mode !== 'dead' ? 1 : 0;
      if (fresh) this.roostK = roost;
      // Folds slowly into the roost; snaps open the moment it wakes.
      this.roostK += (roost - this.roostK) * approach(roost ? LAMP.roost.in : LAMP.roost.out, dt);
    }
    if (!fresh) this.flap += adv * (1 - (1 - LAMP.calm.beat) * this.calmK) * (1 - this.roostK);
    this.flap -= Math.floor(this.flap);
    this.swell += LAMP.calm.rate * dt;
    this.flinch += (0 - this.flinch) * approach(LAMP.shy.ease, dt);
    this.spot = Math.max(0, this.spot - dt / LAMP.gift.spotFor);
    this.giftDim = Math.max(0, this.giftDim - dt / LAMP.gift.dimFor);
    this.offX.step(0, dt);
    this.offY.step(0, dt);
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    this.struck = false;
    if (e.hitFrame !== this.hitSeen) {
      this.hitSeen = e.hitFrame;
      if (e.hitFrame >= 0 && !fresh) this.struck = true;
    }
    this.lastDir = e.hitDir || e.facing;
    this.lastPower = e.hitPower;
    this.wasDead = e.mode === 'dead';
    if (!this.wasDead) this.dissolved = false;
    this.live = true;

    const mode = e.mode;
    const phase = phaseOf(mode);
    const curious = phase === 'tell';
    const keen = curious || phase === 'swoop' || mode === 'pursue';
    // The dive: how swept it is follows its speed; the heading it turns to is its flight's.
    const D = LAMP.dive;
    const sp = mode === 'hurt' || mode === 'dead' ? 0 : Math.hypot(e.vx, e.vy);
    this.speed += (sp - this.speed) * approach(20, dt);
    const fastK = sat((sp - 2.6) / (D.fast - 2.6));
    const swoopT = phase === 'swoop' ? Math.max(0.65, fastK) : 0;
    this.swoop += (swoopT - this.swoop) * approach(swoopT > this.swoop ? 18 : 9, dt);
    this.open += ((phase === 'open' ? 1 : 0) - this.open) * approach(phase === 'open' ? 12 : 6, dt);
    this.climb += ((phase === 'climb' ? 1 : 0) - this.climb) * approach(6, dt);
    let headT = 0;
    if (sp > 0.4 && swoopT > 0) {
      headT = Math.atan2(e.vx, -e.vy);
      // (Straight down could turn either way round: it goes over on the side it faces.)
      if (Math.abs(headT) > 2.9) headT = e.facing * Math.abs(headT);
    }
    this.head += (headT * D.turn * sat(this.swoop * 1.2) - this.head) * approach(13, dt);
    this.turn.omega = curious ? 30 : 12;
    this.turn.step(e.facing, dt);
    const leanT =
      mode === 'hurt' || mode === 'dead'
        ? 0
        : clamp(e.vx * LAMP.lean, -LAMP.leanMax, LAMP.leanMax) * (1 - this.swoop) +
          // (The tell: it rears back from her.)
          (curious ? -e.lookX * D.rear : 0) +
          this.awayX * LAMP.shy.lean * this.flinch;
    this.lean.step(leanT, dt);
    this.lagX.step(e.vx * 0.55, dt);
    this.lagY.step(e.vy * 0.55, dt);
    this.keen += ((keen ? 1 : 0) - this.keen) * approach(keen ? 16 : 4, dt);
    this.flare += ((curious ? 1 : 0) - this.flare) * approach(curious ? 14 : 3.5, dt);
    this.hold += ((curious ? 1 : 0) - this.hold) * approach(curious ? LAMP.hunt.hold : LAMP.hunt.release, dt);
    const slack = phase === 'open';
    this.slack += ((slack ? 1 : 0) - this.slack) * approach(5, dt);
    const fold =
      mode === 'dead'
        ? 1
        : mode === 'hurt'
          ? 0.7
          : Math.max(LAMP.shy.fold * this.flinch, LAMP.roost.fold * this.roostK);
    this.fold +=
      (fold - this.fold) *
      approach(mode === 'hurt' ? 40 : mode === 'dead' ? 14 : fold > this.fold ? 30 : 9, dt);
    this.tumble += ((mode === 'hurt' ? 1 : 0) - this.tumble) * approach(30, dt);
  }
}

// --- Drawing.

const sh = (c0: V3, c1: V3, rim: number, cool: number, band: number): Shade & { alpha: number } => ({
  c0: c0 as unknown as RGB,
  c1: c1 as unknown as RGB,
  rim,
  cool,
  form: 0,
  band,
  ember: 0,
  alpha: 1,
});

const W = {
  wing0: [0, 0, 0] as V3,
  wing1: [0, 0, 0] as V3,
  edge: [0, 0, 0] as V3,
  body0: [0, 0, 0] as V3,
  body1: [0, 0, 0] as V3,
  dusk: [0, 0, 0] as V3,
  face: [0, 0, 0] as V3,
  eye: [0, 0, 0] as V3,
  lamp: [0, 0, 0] as V3,
  lampCore: [0, 0, 0] as V3,
  calmLight: [0, 0, 0] as V3,
  pop: [0, 0, 0] as V3,
  hunt: [0, 0, 0] as V3,
  flash: [0, 0, 0] as V3,
};
// The wings' rim is their pale edge: the painter's rim colours are set to `edge` for them.
const SH_WING = sh(W.wing0, W.wing1, 1, 1, 0.3);
const SH_VEIN = sh(W.edge, W.edge, 0, 0, 0.5);
const SH_SPOT = sh(W.edge, W.edge, 0, 0, 0.5);
const SH_PUPIL = sh(W.face, W.face, 0, 0, 0.5);
const SH_BODY = sh(W.body0, W.body1, 0.2, 0.25, 0.35);
const SH_TAIL = sh(W.body0, W.body1, 0.1, 0.2, 0.4);
const SH_FACE = sh(W.face, W.face, 0, 0, 0.5);
const SH_EYE = sh(W.eye, W.eye, 0, 0, 0.5);
const SH_ANT = sh(W.body1, W.body1, 0, 0, 0.5);
const SH_LAMP = sh(W.lampCore, W.lampCore, 0, 0, 0.5);
/** Set per creature by `drawLampwing`: how lit the wing spots are (halo strength) and how much larger. */
let spotGlow = 0;
let spotR = 1;
/** The flash of the tell's count on lamp and spots (1 outside the tell). */
let tellP = 1;

/**
 * Wing outlines in wing space: u along the span (0 root .. 1 tip), v across (- = leading edge).
 * Narrow triangles with a pointed apex and a notched, tattered outer margin.
 */
// The fore wing is hooked: the apex runs out past the margin and curls back (a sickle), with a deep
// notch under it. The hind wing ends in a long tail streamer. Neither is like the round ambient moths.
const FORE_RAW: readonly number[] = [
  0, -0.03, 0.34, -0.13, 0.7, -0.21, 0.95, -0.29, 1.05, -0.2, 0.9, -0.09, 0.83, 0.04, 0.88, 0.15, 0.76, 0.16,
  0.72, 0.29, 0.58, 0.23, 0.4, 0.21, 0.16, 0.12,
];
const HIND_RAW: readonly number[] = [
  0, -0.02, 0.45, -0.11, 0.86, -0.05, 0.98, 0.12, 0.86, 0.22, 0.9, 0.42, 0.8, 0.52, 0.84, 0.9, 0.8, 1.2, 0.7,
  0.84, 0.62, 0.5, 0.42, 0.4, 0.14, 0.22,
];
/** A closed outline rounded by a Catmull-Rom pass (three points per corner): no facets at zoom. */
function rounded(raw: readonly number[]): number[] {
  const n = raw.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + n - 1) % n) * 2;
    const b = i * 2;
    const c = ((i + 1) % n) * 2;
    const d = ((i + 2) % n) * 2;
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let ax = 0; ax < 2; ax++) {
        const p0 = raw[a + ax]!;
        const p1 = raw[b + ax]!;
        const p2 = raw[c + ax]!;
        const p3 = raw[d + ax]!;
        out.push(
          0.5 *
            (2 * p1 +
              (p2 - p0) * t +
              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
              (3 * p1 - p0 - 3 * p2 + p3) * t3),
        );
      }
    }
  }
  return out;
}
const FORE: readonly number[] = rounded(FORE_RAW);
const HIND: readonly number[] = rounded(HIND_RAW);
/** Vein ends on the margin (u, v), and the fan centre of each outline. */
const FORE_VEINS: readonly number[] = [1.0, -0.2, 0.86, 0.1, 0.73, 0.25, 0.5, 0.2];
const HIND_VEINS: readonly number[] = [0.94, 0.08, 0.88, 0.38, 0.8, 1.1];
const FORE_C: readonly number[] = [0.6, 0.03];
const HIND_C: readonly number[] = [0.55, 0.16];

let mA = 1;
let mB = 0;
let mC = 0;
let mD = 1;
let mE = 0;
let mF = 0;
function bx(x: number, y: number): number {
  return mA * x + mB * y + mE;
}
function by(x: number, y: number): number {
  return mC * x + mD * y + mF;
}

let toneDark = 0;
let toneLight = 0;
function tone(o: V3): void {
  for (let k = 0; k < 3; k++) {
    const d = o[k]! + (W.dusk[k]! - o[k]!) * toneDark;
    o[k] = d + (W.pop[k]! - d) * toneLight;
  }
}

function wing(
  p: Painter,
  outline: readonly number[],
  veins: readonly number[],
  centre: readonly number[],
  rootX: number,
  rootY: number,
  side: number,
  ang: number,
  len: number,
  chord: number,
  alpha: number,
  spot: boolean,
): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  // Span points outward and up by `ang`; the chord hangs at right angles to it.
  const ux = side * c * len;
  const uy = -s * len;
  const vx = side * s * len * chord;
  const vy = c * len * chord;
  const n = outline.length / 2;
  for (let k = 0; k < n; k++) {
    const u = outline[k * 2]!;
    const v = outline[k * 2 + 1]!;
    const lx = rootX + ux * u + vx * v;
    const ly = rootY + uy * u + vy * v;
    p.px[k] = bx(lx, ly);
    p.py[k] = by(lx, ly);
  }
  SH_WING.alpha = alpha;
  const tx = rootX + ux;
  const ty = rootY + uy;
  const clx = rootX + ux * centre[0]! + vx * centre[1]!;
  const cly = rootY + uy * centre[0]! + vy * centre[1]!;
  p.shape(n, bx(clx, cly), by(clx, cly), SH_WING, bx(rootX, rootY), by(rootX, rootY), bx(tx, ty), by(tx, ty));
  SH_VEIN.alpha = alpha * LAMP.vein;
  for (let k = 0; k < veins.length / 2; k++) {
    const u = veins[k * 2]!;
    const v = veins[k * 2 + 1]!;
    const ex = rootX + ux * u * 0.96 + vx * v * 0.96;
    const ey = rootY + uy * u * 0.96 + vy * v * 0.96;
    const mx = rootX + ux * u * 0.5 + vx * v * 0.34;
    const my = rootY + uy * u * 0.5 + vy * v * 0.34;
    p.px[0] = bx(rootX, rootY);
    p.py[0] = by(rootX, rootY);
    p.px[1] = bx(mx, my);
    p.py[1] = by(mx, my);
    p.px[2] = bx(ex, ey);
    p.py[2] = by(ex, ey);
    p.pw[0] = 0.3;
    p.pw[1] = 0.26;
    p.pw[2] = 0.14;
    p.ribbon(3, SH_VEIN, false, false);
  }
  if (spot) {
    // One ringed mark on the fore wing: the family likeness with the hero's eye-spots.
    const lx = rootX + ux * 0.66 + vx * 0.05;
    const ly = rootY + uy * 0.66 + vy * 0.05;
    const r = len * 0.068 * spotR;
    const ry = r * (0.55 + 0.45 * Math.min(1, chord));
    SH_SPOT.alpha = alpha * 0.75;
    p.ellipse(bx(lx, ly), by(lx, ly), r, ry, 0, SH_SPOT, 10);
    SH_PUPIL.alpha = alpha;
    p.ellipse(bx(lx, ly), by(lx, ly), r * 0.58, ry * 0.58, 0, SH_PUPIL, 8);
    // Hunting, the two spots open like eyes: a lit pupil and a halo in the hunt colour.
    if (spotGlow > 0.01) {
      SH_LAMP.alpha = sat(spotGlow * 2.4) * alpha;
      p.ellipse(bx(lx, ly), by(lx, ly), r * 0.5, ry * 0.5, 0, SH_LAMP, 8);
      p.glow(bx(lx, ly), by(lx, ly), r * 3.2, W.hunt as unknown as RGB, spotGlow, r * 3.2, 0, 12);
    }
  }
}

/** Draws one lampwing. */
export function drawLampwing(
  p: Painter,
  rig: LampRig,
  e: EnemyState,
  clock: number,
  zw: readonly number[],
): void {
  const L = LAMP;
  const dead = e.mode === 'dead';
  const t = rig.mf;
  const ph = rig.seed * 50;
  const d = clamp(rig.turn.x, -1, 1);
  const ad = Math.abs(d);

  // --- Colours for this zone, then the tone of a hit (dark for the hold, a pale pop after).
  zone(W.wing0, L.wingColor, zw);
  zone(W.wing1, L.wingTip, zw);
  zone(W.edge, L.edgeColor, zw);
  zone(W.body0, L.bodyColor, zw);
  zone(W.lamp, L.lampColor, zw);
  // Calmed, the lamp takes the lantern's warmth.
  const calm = rig.calmK;
  hex(W.calmLight, L.calm.light);
  for (let k = 0; k < 3; k++) W.lamp[k] = W.lamp[k]! + (W.calmLight[k]! - W.lamp[k]!) * calm;
  // Hunting, lamp, eyes and wing spots go to the one hunt colour, whatever the zone.
  const H = L.hunt;
  const hunt = Math.max(rig.keen, rig.flare) * (1 - calm) * (dead ? 0 : 1);
  hex(W.hunt, H.color);
  for (let k = 0; k < 3; k++) W.lamp[k] = W.lamp[k]! + (W.hunt[k]! - W.lamp[k]!) * hunt;
  // Pale at the core: most of the way to white (the body is dark now; the lamp is its one light).
  for (let k = 0; k < 3; k++) W.lampCore[k] = W.lamp[k]! + (1 - W.lamp[k]!) * 0.6;
  hex(W.dusk, L.color.dusk);
  hex(W.face, L.color.face);
  hex(W.eye, L.color.eye);
  for (let k = 0; k < 3; k++) W.eye[k] = W.eye[k]! + (W.hunt[k]! * 0.5 + 0.5 - W.eye[k]!) * 0.7 * hunt;
  hex(W.pop, L.color.pop);
  for (let k = 0; k < 3; k++) W.body1[k] = W.body0[k]! * 0.6 + W.dusk[k]! * 0.2;
  const age = rig.hitAge;
  // (Dark for the blow's hold, 4 frames or the finisher's 7, the pale pop as it is thrown.)
  const hitHold = e.hitstop > 0 ? age + e.hitstop : e.hitPower >= 2 ? 7 : 4;
  // (The first frame or two: its edges and veins flash pale on wings that have not darkened yet.)
  const hitFlash = age < 20 ? 1 - smoothstep(L.hit.flash - 0.6, L.hit.flash + 0.6, age) : 0;
  toneDark = L.hit.dark * (1 - smoothstep(hitHold - 0.6, hitHold + 0.8, age)) * (1 - 0.8 * hitFlash);
  toneLight =
    L.hit.pop *
    smoothstep(hitHold - 0.4, hitHold + 0.8, age) *
    (1 - smoothstep(hitHold + 2, hitHold + 4.4, age));
  // A dead one greys as it falls.
  if (dead) toneDark = Math.max(toneDark, 0.4 * sat(t / 14));
  tone(W.wing0);
  tone(W.wing1);
  tone(W.edge);
  // The struck outline: pale through the flash, and it stays half lit for the rest of the hold.
  hex(W.flash, L.hit.flashColor);
  const lineK = Math.max(hitFlash, e.hitstop > 0 ? 0.5 : 0);
  for (let k = 0; k < 3; k++) W.edge[k] = W.edge[k]! + (W.flash[k]! - W.edge[k]!) * lineK;
  // Hanging open it shows the pale faces of its wings (pale = soft, like the burrback's underside).
  const pale = L.dive.openPale * rig.open * (1 - calm) * (dead ? 0 : 1);
  for (let k = 0; k < 3; k++) {
    W.wing0[k] = W.wing0[k]! + (W.edge[k]! - W.wing0[k]!) * pale;
    W.wing1[k] = W.wing1[k]! + (W.edge[k]! - W.wing1[k]!) * pale * 0.6;
  }
  tone(W.body0);
  tone(W.body1);
  // The body thins away over its last frames (the dissolve takes over).
  const fade = dead ? sat(Math.min(L.death.dissolve - t, e.landed ? e.timer * 2 : 99) / L.death.fade) : 1;
  const alphaWas = p.alphaK;
  p.alphaK = alphaWas * (0.25 + 0.75 * fade);

  // --- Body frame: bob against the stroke, lean into the flight, tumble when struck, spiral when dead.
  const beat = Math.sin(rig.flap * TAU);
  const flying = 1 - rig.fold;
  // (Calmed, it hangs on a slow swell; thrown back from a light, the offset rides a spring.)
  const swell = Math.sin(rig.swell + ph);
  let ox = rig.x + rig.offX.x;
  let oy = rig.y + rig.offY.x + beat * L.bob * flying * (1 - 0.4 * calm) + swell * L.calm.sway * calm;
  let rot = rig.lean.x;
  const phase = phaseOf(e.mode);
  const tell = phase === 'tell';
  const Dv = L.dive;
  rot += rig.head;
  // Hanging open, it sags and lifts on its slow heavy beat.
  const openBeat = Math.sin(clock * Dv.openRate + ph);
  oy += Dv.openSag * openBeat * rig.open;
  if (tell || e.mode === 'pursue') {
    const k = rig.keen * L.wobble * (1 - rig.swoop);
    ox += noise1(clock * 4.3 + ph, 3) * k;
    oy += noise1(clock * 5.1 + ph, 4) * k * 0.8;
  }
  const dir = e.hitDir || 1;
  if (e.mode === 'hurt') {
    // End over end along the blow, one turn through the tumble, easing out upright.
    const total = Math.max(1, e.modeFrames + e.timer);
    const u = sat(t / total);
    rot += dir * TAU * (1 - (1 - u) * (1 - u));
  } else if (dead) {
    if (e.landed) rot = dir * 1.45;
    else {
      // A falling leaf: it rocks from side to side and slips sideways with each rock.
      const sway = Math.sin(t * 0.36 + ph);
      rot = dir * (0.5 + t * 0.16) + sway * 0.5;
      ox += Math.cos(t * 0.36 + ph) * 3.2 * sat(t / 8);
    }
  }
  // The tell's count: lamp and wing spots flash in quickening beats toward the swoop (the same
  // language as the burrback's brace), and the body sinks a little at the end of it.
  const tellU = tell ? sat(t / Math.max(1, e.modeFrames + e.timer)) : 0;
  tellP = 1;
  if (tell) {
    const tb = H.beats * tellU ** H.countPow;
    const tf = 1 - (tb - Math.floor(tb));
    tellP = H.countLow + (H.countPeak - H.countLow) * tf * tf;
    oy += H.sink * smoothstep(0.72, 1, tellU);
  }
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  // (Swooping, it is stretched along its flight.)
  const sqy = (dead && e.landed ? 0.7 : 1) * (1 + Dv.stretch * rig.swoop);
  mA = cr;
  mB = -sr * sqy;
  mC = sr;
  mD = cr * sqy;
  mE = ox;
  mF = oy + (dead && e.landed ? 9 : 0);

  // --- Wings. The stroke: up and down with `flap`; the hind pair lags; the chord narrows on the
  // upstroke and opens on the downstroke (the figure of eight, seen from the front).
  const slack = (1 - L.slack * rig.slack) * (1 - L.calm.stroke * calm);
  const mid = (L.up + L.down) / 2 + L.calm.lift * calm;
  const amp =
    ((L.up - L.down) / 2) *
    slack *
    flying *
    (1 + (H.stroke - 1) * rig.keen * (1 - rig.hold) * (1 - calm)) *
    (1 + (Dv.climbStroke - 1) * rig.climb);
  let fa = mid + amp * beat + rig.fold * (1.25 - mid) - rig.slack * 0.12;
  const hb = Math.sin((rig.flap - L.hindLag) * TAU);
  let ha = mid - L.hindDrop + amp * 0.85 * hb + rig.fold * (1.0 - mid + L.hindDrop);
  let chordF = 1 - L.twist * Math.cos(rig.flap * TAU) * flying - 0.35 * rig.fold;
  let chordH = 1 - L.twist * Math.cos((rig.flap - L.hindLag) * TAU) * flying - 0.35 * rig.fold;
  // The tell: the beat stops. All four wings are thrown wide and high and held there, shivering,
  // their faces to her; the release into the first stroke is the start of the swoop.
  const hold = rig.hold * flying;
  if (hold > 0.001) {
    // It builds through the tell (no dead hold): the wings creep higher and wider, the shiver
    // grows, and in the last of it the body sinks under them, coiled for the first stroke.
    const shiver = Math.sin(clock * H.shiverRate + ph) * H.shiver * (1 + H.shiverUp * tellU);
    const coil = smoothstep(0.72, 1, tellU);
    fa += (H.fore + H.rise * tellU + H.coil * coil + shiver - fa) * hold;
    ha += (H.hind - H.spread * tellU - shiver * 0.7 - ha) * hold;
    chordF += (H.chord - chordF) * hold;
    chordH += (H.chord - chordH) * hold;
  }
  // The swoop: wings swept back toward the tail, narrow, shivering: an arrowhead along its flight.
  const sw = rig.swoop * flying * (1 - hold) * (1 - calm);
  let wingLen = 1;
  if (sw > 0.001) {
    const fl = Math.sin(clock * 38 + ph) * 0.05;
    fa += (Dv.sweep + fl + 0.1 * beat - fa) * sw;
    ha += (Dv.sweep - 0.3 - fl - ha) * sw;
    chordF += (Dv.sweepChord - chordF) * sw;
    chordH += (Dv.sweepChord - chordH) * sw;
    wingLen = 1 + (Dv.sweepLen - 1) * sw;
  }
  // Hanging open: all four spread flat and wide, faces to her, on a slow heavy beat.
  const op = rig.open * flying * (1 - calm);
  if (op > 0.001) {
    fa += (Dv.openFore + Dv.openBeat * openBeat - fa) * op;
    ha += (Dv.openHind + Dv.openBeat * 0.7 * Math.sin(clock * Dv.openRate + ph - 0.8) - ha) * op;
    chordF += (1.1 - chordF) * op;
    chordH += (1.1 - chordH) * op;
  }
  spotGlow = (H.spot * rig.flare + H.spotKeen * rig.keen * (1 - rig.flare)) * (1 - calm) * (dead ? 0 : 1);
  spotGlow *= tellP;
  spotGlow *= 1 - toneDark;
  spotR = (1 + (H.spotR - 1) * Math.max(rig.hold, 0.4 * rig.keen)) * (0.85 + 0.15 * tellP);
  const crumple = 1 - 0.3 * rig.fold;
  // The killing blow tears the hind pair away (they go to scales).
  const torn = dead ? sat(t / 3) : 0;
  const keyC = p.keyColor;
  const coolC = p.coolColor;
  const wrap = p.coolWrap;
  p.keyColor = W.edge as unknown as RGB;
  p.coolColor = W.edge as unknown as RGB;
  p.coolWrap = 1;
  const shoulderY = -2.2;
  for (let pass = 0; pass < 2; pass++) {
    // Far side first (the side it is turned away from).
    const side = (pass === 0 ? -1 : 1) * (d >= 0 ? 1 : -1) * -1;
    const far = pass === 0;
    const k = far ? 1 - L.farShrink * ad : 1 + 0.06 * ad;
    const alpha = far ? L.farAlpha + (L.wingAlpha - L.farAlpha) * (1 - ad) : L.wingAlpha;
    const rx0 = side * 1.9 + d * 1.1;
    if (torn < 0.95)
      wing(
        p,
        HIND,
        HIND_VEINS,
        HIND_C,
        rx0,
        shoulderY + 2,
        side,
        ha,
        L.hind * k * crumple * (1 - torn) * wingLen,
        chordH,
        alpha,
        false,
      );
    wing(
      p,
      FORE,
      FORE_VEINS,
      FORE_C,
      rx0,
      shoulderY,
      side,
      fa,
      L.fore * k * crumple * wingLen,
      chordF,
      alpha,
      true,
    );
  }
  p.keyColor = keyC;
  p.coolColor = coolC;
  p.coolWrap = wrap;

  // --- Legs: thin threads hanging under the thorax, trailing the flight.
  const B = L.body;
  SH_ANT.alpha = 0.9;
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const row = i & 1;
    const rx = side * 1.3 + d * 0.5;
    const ry = 1.2 + row * 1.6;
    const len = L.leg * (row === 0 ? 1 : 0.8);
    const tx = rx + side * (2.2 - row * 0.6 + 1.4 * rig.fold) - rig.lagX.x * 0.8;
    const ty = ry + len - rig.lagY.x * 0.5 - 1.5 * rig.keen * (1 - row);
    p.px[0] = bx(rx, ry);
    p.py[0] = by(rx, ry);
    p.px[1] = bx(rx + side * 2.4, ry + len * 0.35);
    p.py[1] = by(rx + side * 2.4, ry + len * 0.35);
    p.px[2] = bx(tx, ty);
    p.py[2] = by(tx, ty);
    p.pw[0] = 0.42;
    p.pw[1] = 0.34;
    p.pw[2] = 0.16;
    p.ribbon(3, SH_ANT, false, false);
  }

  // --- Body: a long tapering abdomen that trails behind the flight, a narrow thorax, a small head.
  const droop = (0.25 + 0.3 * rig.slack + 0.4 * rig.fold + 0.3 * calm) * (1 - rig.swoop);
  const trail = 1 - rig.swoop;
  // (Hunting, the tail with its lamp curls toward her.)
  const aim = rig.keen * (1 - calm) * (dead ? 0 : 1);
  const sway = Math.sin(clock * 2.3 + ph) * 1.6 * trail;
  const tailX = -d * (1.4 + droop * 2.5) - rig.lagX.x * 1.5 * trail + e.lookX * H.tail * aim * trail + sway;
  const tailY =
    2 +
    B.abdomen -
    (Math.abs(rig.lagX.x) * 0.4 + Math.max(0, rig.lagY.x) * 0.6 + Math.abs(e.lookX) * 2 * aim) * trail;
  const midX = tailX * 0.3 - d * 0.6;
  const midY = 2 + B.abdomen * 0.5;
  let lampX = 0;
  let lampY = 0;
  for (let k = 0; k < 6; k++) {
    const u = k / 5;
    const a0 = (1 - u) * (1 - u);
    const a1 = 2 * u * (1 - u);
    const a2 = u * u;
    const lx = a1 * midX + a2 * tailX;
    const ly = a0 * 1.5 + a1 * midY + a2 * tailY;
    p.px[k] = bx(lx, ly);
    p.py[k] = by(lx, ly);
    p.pw[k] = B.abdomenW * (k === 0 ? 0.85 : 1 - u * 0.72);
    if (k === 5) {
      lampX = lx;
      lampY = ly;
    }
  }
  SH_TAIL.alpha = 1;
  p.ribbon(6, SH_TAIL, false, true);
  SH_BODY.alpha = 1;
  p.ellipse(bx(d * 0.5, -0.8), by(d * 0.5, -0.8), B.thoraxW, B.thoraxH, rot, SH_BODY, 12);
  const hxl = d * 1.7 + e.lookX * 0.7 * rig.keen;
  const hyl = -6 + e.lookY * 0.8 * rig.keen;

  // --- Antennae: two long thin threads, swept back and out; forward when keen.
  const A = L.antenna;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const spread = 0.75 - 0.3 * rig.keen + 0.35 * rig.slack + 0.5 * rig.fold + 0.3 * calm;
    const ang = -Math.PI / 2 + side * spread + d * 0.3;
    const rx = hxl + side * 0.9;
    const ry = hyl - B.head * 0.8;
    const tx = rx + Math.cos(ang) * A.len - rig.lagX.x * 1.3 + e.lookX * 2.2 * rig.keen;
    const ty =
      ry + Math.sin(ang) * A.len - rig.lagY.x * 1.3 + e.lookY * 1.5 * rig.keen + 3 * rig.slack + 2.5 * calm;
    const mx = (rx + tx) / 2 - side * 1.2;
    const my = (ry + ty) / 2 - 2.2;
    for (let k = 0; k < 5; k++) {
      const u = k / 4;
      const a0 = (1 - u) * (1 - u);
      const a1 = 2 * u * (1 - u);
      const a2 = u * u;
      const lx = a0 * rx + a1 * mx + a2 * tx;
      const ly = a0 * ry + a1 * my + a2 * ty;
      p.px[k] = bx(lx, ly);
      p.py[k] = by(lx, ly);
      p.pw[k] = A.w * (1 - 0.6 * u);
    }
    SH_ANT.alpha = 0.95;
    p.ribbon(5, SH_ANT, false, false);
  }

  // --- Head: small and dark, with two dim pinpricks that fix on what draws it.
  SH_FACE.alpha = 1;
  p.ellipse(bx(hxl, hyl), by(hxl, hyl), B.head * 0.86, B.head, rot, SH_FACE, 12);
  // (Tumbling, the eyes are screwed shut and the lamp gutters: it is helpless until it rights itself.)
  const shut = dead
    ? sat(t / 5)
    : Math.max(L.calm.lids * calm, 0.5 * rig.flinch, 0.85 * rig.tumble, 0.55 * rig.open);
  if (shut < 0.9) {
    const lx = e.lookX * 0.55;
    const ly = e.lookY * 0.5;
    SH_EYE.alpha = (1 - shut) * (L.eyeDim + (1 - L.eyeDim) * rig.keen);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ex = hxl + d * 0.5 + side * 0.82 + lx;
      const ey = hyl + 0.25 + ly;
      const r = L.eye * (1 + (H.eye - 1) * hunt);
      p.ellipse(bx(ex, ey), by(ex, ey), r, r * (1 - shut), 0, SH_EYE, 8);
    }
  }

  // --- The lamp: one small dim light in the abdomen on a slow pulse. It flares in the tell,
  // flickers when it is hurt, gutters out when it dies.
  const Lm = L.lamp;
  let br = 1 - Lm.pulse * (0.5 + 0.5 * Math.sin(clock * Lm.rate + ph));
  // Calmed: a little fuller, breathing with the swell; dipped for a moment when it shies.
  br += (L.calm.dim * (0.72 + 0.28 * swell) - br) * calm;
  br *= 1 + (Lm.keen - 1) * rig.keen + (Lm.flare - 1) * rig.flare;
  br *= tellP;
  if (rig.tumble > 0.01 && !dead) br *= 1 - rig.tumble * (0.55 + 0.35 * noise1(clock * 17 + ph, 6));
  br *= 1 - L.shy.dim * rig.flinch;
  br *= 1 - L.roost.dim * rig.roostK * (1 - 0.3 * (0.5 + 0.5 * Math.sin(clock * L.roost.breath + ph)));
  br *= (1 + L.gift.spot * rig.spot) * (1 - L.gift.dim * Math.min(1, rig.giftDim * 1.6));
  // Hanging open, the lamp is nearly down: it has nothing left for a moment.
  br *= 1 - (1 - Dv.openDim) * rig.open * (1 - calm);
  if (e.hp <= 1 && !dead) br *= 0.6 + 0.4 * (noise1(clock * 12 + ph, 7) > -0.2 ? 1 : 0.3);
  if (dead) br *= sat(1 - t / 12) * (0.5 + 0.5 * noise1(clock * 16 + ph, 8));
  br *= 1 - toneDark * 0.7;
  if (rig.cine) br *= rig.cine.lit;
  if (br > 0.02) {
    const lwx = bx(lampX, lampY);
    const lwy = by(lampX, lampY);
    // The tell: a thin line of light from the lamp toward her, longer and brighter as the count runs.
    if (tell && tellU > 0.05 && !dead) {
      const len = Dv.aim * (0.35 + 0.65 * tellU);
      const ll = Math.hypot(e.targetX - lwx, e.targetY - lwy) || 1;
      const ax = (e.targetX - lwx) / ll;
      const ay = (e.targetY - lwy) / ll;
      const al = Math.min(len, ll * 0.8);
      p.glow(
        lwx + ax * al * 0.5,
        lwy + ay * al * 0.5,
        al * 0.5,
        W.lamp as unknown as RGB,
        Dv.aimK * tellU * (0.5 + 0.5 * tellP) * (1 - calm),
        1.1,
        Math.atan2(ay, ax),
        10,
      );
    }
    // The swoop: the lamp drags a streak back along its flight.
    if (rig.swoop > 0.05 && rig.speed > 0.5 && !dead && e.hitstop === 0) {
      const sl = (Dv.streak + Dv.streakV * rig.speed) * rig.swoop;
      const vl = Math.hypot(e.vx, e.vy) || 1;
      p.glow(
        lwx - (e.vx / vl) * sl * 0.5,
        lwy - (e.vy / vl) * sl * 0.5,
        sl * 0.5 + Lm.r,
        W.lamp as unknown as RGB,
        Dv.streakK * rig.swoop * sat(br),
        Lm.r * 1.3,
        Math.atan2(e.vy, e.vx),
        10,
      );
    }
    const r = Lm.r * (1 + 0.55 * rig.flare * (0.7 + 0.3 * tellP)) * (1 + (Lm.keenR - 1) * hunt);
    SH_LAMP.alpha = Lm.core * sat(br);
    p.ellipse(bx(lampX, lampY), by(lampX, lampY), r * 0.8, r, rot, SH_LAMP, 10);
    const hr =
      r *
      Lm.halo *
      (1 + 1.1 * rig.flare * (0.6 + 0.4 * tellP)) *
      (1 + (L.calm.halo - 1) * calm) *
      (1 + L.gift.spotHalo * rig.spot);
    p.glow(bx(lampX, lampY), by(lampX, lampY), hr, W.lamp as unknown as RGB, Lm.glow * br, hr, 0, 12);
  }
  p.alphaK = alphaWas;
}
