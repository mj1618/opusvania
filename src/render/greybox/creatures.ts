/**
 * Creatures in greybox (memory/greybox.md, memory/feel.md): filled shapes, one silhouette per kind,
 * each with its danger part drawn apart from its body, and answers to every blow. Replaces the debug
 * overlay's hitbox outlines in greybox rooms (F2 still draws those). Reads the sim (state, events);
 * never changes it. Animation runs on render time; seeds come from ids, never Math.random.
 *
 * - The body is drawn under her (`back`, the goal layer), the danger part, tells, flashes, shards and
 *   stars over her (`front`, the air layer): at melee range her rig no longer hides what hurts.
 * - Burrback: an earthen dome, its shell front a separate plate (dim red; white with a red rim while
 *   braced), the brace's draining bar and the ram's reach on the ground.
 * - Old burrback: a bigger ridged dome. While braced and not yet pogoed the top of its shell is the
 *   seed-case amber ("pogo me": the kit's own language), grey once pogoed; a wall stun flips it on its
 *   back, pale, legs up, with a green bar draining over its 90 frames. A clang: a big white star where
 *   the blade met it and the shell rings (a 4-frame shiver).
 * - Hawker: a slate body with beating wings and a beak / talons that point where it looks. The tell
 *   swells it 1.3x and flashes it in the hunt colour, quicker as the dive nears; a reticle on the ground
 *   under her marks where it will strike (it tightens over the last 12 frames) with a dashed dive line;
 *   the dive leaves a 6-frame smear and the reticle stays on the committed point.
 * - A hit: the silhouette white for the hitstop + 2 frames, squashed 1.15 x 0.85 and relaxing over 4.
 *   A kill: white for the kill's hitstop, then 8 shards and a ring; the body is not drawn after.
 */
import type { Graphics } from 'pixi.js';
import { coneBox } from '../../sim/enemies/bombardier';
import type { SimEvent } from '../../sim/events';
import type { Scene } from '../../sim/scene';
import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { drawHuntsman, type HuntPaint, HuntsmanRig } from '../enemies/huntsman';
import { hash01 } from './moths';

/** Colours (memory/greybox.md "Creatures"). Bodies are mid tones: lighter than the solids, darker than her lights. */
export const CREATURE = {
  burrback: 0x7b6b5c,
  oldBurrback: 0x6c6358,
  /** The carriers: a dark ant; the pale wing it carries (and its trail's scent dots). */
  carrier: 0x544b45,
  carried: 0xb8c0d0,
  /** The juvenile beetle: warmer and lighter than the floor so it never reads as a block of it. */
  juvenile: 0x9a8468,
  /** Crawlers' eyes: two pale points, so a body reads as a creature (first-timer r3). */
  eye: 0xf0e2b8,
  ridge: 0x4e463f,
  /** The old burrback's cracked shell (one crack per lost point). */
  crack: 0xd8cfc0,
  hawker: 0x5f6e86,
  weaver: 0x6e6280,
  dangler: 0x6a6478,
  /** The bombardier: a dark squat beetle with hot bands, its droplets and spray (hot orange, batted ones near white). */
  bombardier: 0x48404c,
  hot: 0xff8a2a,
  batted: 0xfff1c8,
  /** The huntsman: a warm grey-brown body, legs a shade darker with pale bands. */
  huntsman: 0x8a7462,
  /** The jumping spider: a dark brown body, pale eye discs (its read), pale palps. */
  jumper: 0x6e5a4c,
  other: 0x6b7385,
  belly: 0x2e2a2c,
  /** The danger part at rest, and in a tell / dive / brace (the hunt colour, as the boss view's). */
  danger: 0xa84040,
  hunt: 0xff4a3c,
  /** The braced shell's front, the hit flash, a clang's star. */
  armour: 0xe8ecf6,
  flash: 0xf4f6fb,
  /** "Pogo me": the seed-case amber; spent once pogoed. */
  amber: 0xffb347,
  spent: 0x5a6070,
  /** Open (stall, winded), stunned on its back. */
  open: 0x7dff9a,
  stun: 0xcfd6e2,
  aware: 0xffe14c,
  asleep: 0x8a7aa0,
  feint: 0xffb347,
} as const;

/**
 * A death that is a beat (the old burrback, the area's mini-boss): no shards; after the kill's
 * freeze it collapses over `collapse` s to `flat` of its height, `grey`, and lies there for the visit.
 */
const DEATH = { collapse: 0.7, flat: 0.35, grey: 0x3e3b3d };

/** Seconds per sim frame (render time runs at the sim's rate). */
const F = 1 / 60;
/** Squash on a hit: scale x / y at the peak, frames to relax after the hold. */
const SQUASH = { x: 1.15, y: 0.85, frames: 4 };
/** The hawker's tell: how much it swells; frames over which the reticle tightens; radii. */
const TELL = { swell: 1.3, tighten: 12, rWide: 84, rTight: 28 };
/** The hawker's wings reach this far past its centre, in box widths (they are drawn, they never hurt). */
const WING_SPAN = 0.8;
/** The dive's smear: sim frames kept. */
const SMEAR = 6;

interface Fx {
  /** Seconds since its last hit, and how long the white holds (hitstop + 2 frames). */
  hitT: number;
  hitHold: number;
  /** Seconds since it died, the kill's hold, and whether it has burst yet. */
  dieT: number;
  dieHold: number;
  burst: boolean;
  /** Seconds since a cut clanged off it. */
  clangT: number;
  /** The committed dive point (`enemyDive`). */
  diveX: number;
  diveY: number;
  /** The dive's smear: body centres, newest last, one per sim frame. */
  trail: number[];
  trailFrame: number;
  /** A big one's body as it fell (feet centre, size, facing): it lies there for the visit. */
  corpse: { x: number; y: number; w: number; h: number; m: number } | null;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  s: number;
  color: number;
  t: number;
  life: number;
}

/** The slam's floor warning (px each way at most); its wave's fade at the end (s) and its crest's height (px). */
export const SLAM_FX = { warnPx: 900, fade: 0.3, crest: 34 };
/** Small creatures at a wide frame: drawn x (`zoomAt` / zoom), up to `maxScale`; the pale rim under them. */
const SMALL = { zoomAt: 1.1, maxScale: 2.2, rim: 0.18 };
/** A carriers' trail: px between scent dots, their radius, opacity. */
const TRAIL_FX = { every: 26, dot: 2, alpha: 0.35 };

/** A throw-cut's hit (plan r5 item 2): the sweep's radius and life, the star's, the ring's. */
export const HEAVY_FX = { sweepR: 96, sweepLife: 0.28, star: 70, starLife: 0.36, ringLife: 0.4 };

/** A blocked cut (`enemyBlock`): star radii (side cut / down cut), its life, the ring's, sparks, the recoil puff. */
export const BLOCK_FX = {
  star: 56,
  starDown: 34,
  life: 0.3,
  ringLife: 0.28,
  sparkR: 70,
  sparkLife: 0.35,
  puffR: 16,
  puffLife: 0.45,
};

interface Burst {
  kind: 'ring' | 'star' | 'puff' | 'sparks' | 'sweep' | 'wave';
  /** `puff` / `sparks`: the way they go (unit x). */
  dir?: number;
  x: number;
  y: number;
  r: number;
  t: number;
  life: number;
}

function newFx(): Fx {
  return {
    hitT: 1e6,
    hitHold: 0,
    dieT: 1e6,
    dieHold: 0,
    burst: false,
    clangT: 1e6,
    diveX: Number.NaN,
    diveY: Number.NaN,
    trail: [],
    trailFrame: -1,
    corpse: null,
  };
}

/** Local box coordinates (0..w, 0..h, drawn facing +1) to world: anchored, scaled, mirrored to its facing. */
class Xf {
  /** World anchor, the anchor in local coordinates, scale, mirror (its facing). */
  wx = 0;
  wy = 0;
  ax = 0;
  ay = 0;
  sx = 1;
  sy = 1;
  m = 1;
  /** A shiver (world px, x). */
  dx = 0;
  set(e: EnemyState, anchor: 'feet' | 'centre', sx: number, sy: number): this {
    this.ax = e.w / 2;
    this.ay = anchor === 'feet' ? e.h : e.h / 2;
    this.wx = e.x + this.ax;
    this.wy = e.y + this.ay;
    this.sx = sx;
    this.sy = sy;
    this.m = e.facing;
    this.dx = 0;
    return this;
  }
  x(lx: number): number {
    return this.wx + this.dx + (lx - this.ax) * this.sx * this.m;
  }
  y(ly: number): number {
    return this.wy + (ly - this.ay) * this.sy;
  }
  /**
   * Maps a flat list of local points [x0, y0, x1, y1, ...] to world, into a NEW array: Pixi's
   * `Graphics.poly` keeps the array it is given (no copy), so a reused one redraws every shape as the last.
   */
  map(pts: readonly number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(this.x(pts[i] as number), this.y(pts[i + 1] as number));
    return out;
  }
}

/** A dome over a w x h box: flat bottom, walls to `shoulder` of the height, an elliptic top. Local points. */
function domePts(w: number, h: number, shoulder: number, out: number[]): number[] {
  out.length = 0;
  const sy = h * shoulder;
  out.push(0, h, 0, sy);
  const n = 12;
  for (let k = 1; k < n; k++) {
    const a = Math.PI + (k / n) * Math.PI;
    out.push(w / 2 + Math.cos(a) * (w / 2), sy + Math.sin(a) * sy);
  }
  out.push(w, sy, w, h);
  return out;
}

/** The top band of a dome (the old burrback's "pogo me" shell): the arc above `cut` of the height. */
function domeTopPts(w: number, h: number, shoulder: number, cut: number, out: number[]): number[] {
  out.length = 0;
  const sy = h * shoulder;
  // Where the arc crosses y = cut * h: cos(a) from the ellipse.
  const yy = h * cut;
  const s = Math.min(1, Math.max(-1, (yy - sy) / sy));
  const a0 = Math.PI + Math.asin(-s);
  const a1 = 2 * Math.PI - Math.asin(-s);
  const n = 10;
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push(w / 2 + Math.cos(a) * (w / 2), sy + Math.sin(a) * sy);
  }
  return out;
}

/** The highest top of a solid or one-way at or below `y` under `x` (the ground a dive aims at). */
export function groundBelow(scene: Scene, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of scene.solids) if (x >= s.x && x <= s.x + s.w && s.y >= y - 4 && s.y < best) best = s.y;
  for (const o of scene.oneWays) if (x >= o.x && x <= o.x + o.w && o.y >= y - 4 && o.y < best) best = o.y;
  return Number.isFinite(best) ? best : y + 60;
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

function bodyColor(kind: string): number {
  switch (kind) {
    case 'burrback':
      return CREATURE.burrback;
    case 'oldBurrback':
      return CREATURE.oldBurrback;
    case 'juvenileBurrback':
      return CREATURE.juvenile;
    case 'hawker':
    case 'lampwing':
      return CREATURE.hawker;
    case 'weaver':
      return CREATURE.weaver;
    case 'dangler':
      return CREATURE.dangler;
    case 'bombardier':
      return CREATURE.bombardier;
    case 'jumper':
      return CREATURE.jumper;
    default:
      return CREATURE.other;
  }
}

const isFlyer = (k: string) => k === 'hawker' || k === 'lampwing';
const isCrawler = (k: string) => k === 'burrback' || k === 'oldBurrback' || k === 'juvenileBurrback';

/** The huntsman's rig in flat greybox colours (render/enemies/huntsman.ts); its front legs are the danger part. */
const HUNT_GREY: HuntPaint = {
  body: CREATURE.huntsman,
  belly: 0x5c4e44,
  rim: 0xb8a490,
  spot: 0x5c4e44,
  leg: 0x6e5e50,
  band: 0xc8b8a4,
  eye: CREATURE.eye,
  hunt: CREATURE.hunt,
  flash: CREATURE.flash,
  danger: CREATURE.hunt,
};

export class CreatureView {
  private readonly fx = new Map<string, Fx>();
  /** Huntsmen's rigs by id, and this frame's dt for them. */
  private readonly hunts = new Map<string, HuntsmanRig>();
  private dt = 1 / 60;
  private alpha = 1;
  private readonly shards: Shard[] = [];
  private readonly bursts: Burst[] = [];
  private readonly xf = new Xf();
  private readonly pa: number[] = [];

  private get(id: string): Fx {
    let f = this.fx.get(id);
    if (!f) {
      f = newFx();
      this.fx.set(id, f);
    }
    return f;
  }

  /** Reads this render frame's events. */
  /** `sim` (optional): her, for the recoil puff of a blocked cut. */
  /** The camera's zoom this frame (small creatures are drawn bigger when it is low). */
  private zoom = 1;
  /** The slash in progress is a throw-cut (`slash.heavy`). */
  private heavyOn = false;
  /** Her centre x this frame (the dangler's tell swings toward her side). */
  private herX = 0;

  onEvents(events: readonly SimEvent[], sim?: SimView): void {
    for (const e of events) {
      // A moth milestone (the sim's `healthUp`): a light more, so two pale rings go out from her.
      if (e.type === 'healthUp' && sim) {
        this.bursts.push({ kind: 'ring', x: sim.player.cx, y: sim.player.cy, r: 24, t: 0, life: 0.6 });
        this.bursts.push({ kind: 'ring', x: sim.player.cx, y: sim.player.cy, r: 8, t: -0.2, life: 0.8 });
      }
      switch (e.type) {
        case 'spawn':
          // A restart or a re-form: creatures are whole and home again.
          if (events.some((o) => o.type === 'roomEnter' || o.type === 'reform')) this.clear();
          break;
        case 'enemyHit': {
          const f = this.get(e.id);
          f.hitT = 0;
          f.hitHold = (e.hitstop + 2) * F;
          break;
        }
        case 'enemyDie': {
          const f = this.get(e.id);
          f.dieT = 0;
          f.dieHold = Math.max(2, e.hitstop) * F;
          f.burst = false;
          f.hitT = 0;
          f.hitHold = f.dieHold;
          break;
        }
        case 'slash':
          // A throw-cut (the sim's `slash.heavy`): its hits read heavy until it ends.
          this.heavyOn = e.heavy === true;
          break;
        case 'slashEnd':
          this.heavyOn = false;
          break;
        case 'slashHit': {
          // A throw-cut (plan r5 item 2): a cut swung in a throw's launch lands heavy. Its read: a wide white
          // sweep along the blade's path, a big star and a ring at the target, flashed for longer.
          const heavy = this.heavyOn && e.target.kind !== 'pod';
          if (!heavy) break;
          const H = HEAVY_FX;
          const dir =
            e.dir === 'up' ? -Math.PI / 2 : e.dir === 'down' ? Math.PI / 2 : e.facing > 0 ? 0 : Math.PI;
          this.bursts.push({ kind: 'sweep', x: e.px, y: e.py, r: H.sweepR, t: 0, life: H.sweepLife, dir });
          this.bursts.push({ kind: 'star', x: e.x, y: e.y, r: H.star, t: 0, life: H.starLife });
          this.bursts.push({ kind: 'ring', x: e.x, y: e.y, r: 20, t: 0, life: H.ringLife });
          break;
        }
        // The old burrback as a boss (round 5): each beat of the fight answers on screen.
        case 'enemySlam':
          // A shockwave along its floor both ways (and up the walls it reaches), a ring where it landed.
          this.bursts.push({
            kind: 'wave',
            x: e.x,
            y: e.y,
            r: e.px,
            t: 0,
            // (Its fronts run at the sim's own speed, so what is drawn is what costs a pip.)
            life: e.px / (tuning.oldBurrback.slamWaveSpeed * 60) + SLAM_FX.fade,
          });
          this.bursts.push({ kind: 'ring', x: e.x, y: e.y - 20, r: e.big ? 60 : 40, t: 0, life: 0.4 });
          break;
        case 'enemyPhase':
          this.bursts.push({ kind: 'ring', x: e.x, y: e.y, r: 70, t: 0, life: 0.7 });
          this.bursts.push({ kind: 'ring', x: e.x, y: e.y, r: 30, t: -0.15, life: 0.7 });
          break;
        case 'enemyBounce':
          this.bursts.push({ kind: 'puff', x: e.x, y: e.y, r: 18, t: 0, life: 0.4, dir: -e.dir });
          this.bursts.push({ kind: 'star', x: e.x, y: e.y - 20, r: 26, t: 0, life: 0.15 });
          break;
        case 'enemyRoll':
          this.bursts.push({ kind: 'puff', x: e.x, y: e.y, r: 16, t: 0, life: 0.4, dir: -e.dir });
          break;
        case 'enemyUnroll':
        case 'enemyHeavy':
          // Knocked out of its roll, or a throw-cut landing on it: a big star and a ring.
          this.bursts.push({ kind: 'star', x: e.x, y: e.y, r: 64, t: 0, life: 0.3 });
          this.bursts.push({ kind: 'ring', x: e.x, y: e.y, r: 24, t: 0, life: 0.4 });
          break;
        case 'enemyTaproot':
          // Its ram into the taproot: a star on the root, sparks off it, bark dust.
          this.bursts.push({ kind: 'star', x: e.x, y: e.y, r: 60 + 12 * e.n, t: 0, life: 0.3 });
          this.bursts.push({ kind: 'sparks', x: e.x, y: e.y, r: 80, t: 0, life: 0.4, dir: 0 });
          this.bursts.push({ kind: 'puff', x: e.x, y: e.y + 30, r: 22, t: 0, life: 0.6, dir: 0 });
          break;
        case 'enemyUnder':
        case 'enemyEmerge':
          this.bursts.push({ kind: 'puff', x: e.x, y: e.y, r: 8, t: 0, life: 0.35, dir: 0 });
          break;
        case 'enemyBlock': {
          // Unmistakable (first-timer r4: "the armoured front gave only a small spark"; HK's nail clink): a big
          // white clink star and a ring at the blade, sparks thrown back toward her, and a puff of dust off her
          // feet the way the recoil throws her.
          const f = this.get(e.id);
          f.clangT = 0;
          const big = e.slash !== 'down';
          const B = BLOCK_FX;
          this.bursts.push({
            kind: 'star',
            x: e.hitX,
            y: e.hitY,
            r: big ? B.star : B.starDown,
            t: 0,
            life: B.life,
          });
          this.bursts.push({ kind: 'ring', x: e.hitX, y: e.hitY, r: 10, t: 0, life: B.ringLife });
          const back = big ? -e.facing : 0;
          this.bursts.push({
            kind: 'sparks',
            x: e.hitX,
            y: e.hitY,
            r: B.sparkR,
            t: 0,
            life: B.sparkLife,
            dir: back,
          });
          if (big && sim)
            this.bursts.push({
              kind: 'puff',
              x: sim.player.cx,
              y: sim.player.feetY,
              r: B.puffR,
              t: 0,
              life: B.puffLife,
              dir: back,
            });
          break;
        }
        case 'hurt':
          // Where the blow met her: a white star and a ring, off her body (the owner does not want her
          // turned pale: memory/character-vesper.md "Health"); the vignette and the shake do the rest.
          this.bursts.push({ kind: 'star', x: e.hitX, y: e.hitY, r: 40, t: 0, life: 0.12 });
          this.bursts.push({ kind: 'ring', x: e.hitX, y: e.hitY, r: 16, t: 0, life: 0.25 });
          break;
        case 'enemyCrack':
          // A third of the old burrback gone: shell chips fly off its top and a star (its cracks are drawn from hp).
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i - 2) * 0.45 + (hash01(e.id, e.third * 7 + i) - 0.5) * 0.3;
            const sp = 220 + 120 * hash01(e.id, e.third * 7 + i + 3);
            this.shards.push({
              x: e.x,
              y: e.y - 12,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              a,
              va: (hash01(e.id, i + 50) - 0.5) * 16,
              s: 8,
              color: i % 2 === 0 ? CREATURE.crack : bodyColor(e.kind),
              t: 0,
              life: 0.6,
            });
          }
          this.bursts.push({ kind: 'star', x: e.x, y: e.y - 12, r: 46, t: 0, life: 0.24 });
          break;
        case 'enemyDive': {
          const f = this.get(e.id);
          f.diveX = e.tx;
          f.diveY = e.ty;
          f.trail.length = 0;
          break;
        }
      }
    }
  }

  clear(): void {
    this.fx.clear();
    this.shards.length = 0;
    this.bursts.length = 0;
  }

  /** Draws every creature: bodies into `back` (under her), danger parts and effects into `front`. */
  draw(dt: number, clock: number, sim: SimView, back: Graphics, front: Graphics, zoom = 1): void {
    this.herX = sim.player.cx;
    this.zoom = zoom;
    this.dt = dt;
    this.alpha = sim.alpha;
    this.trails(back, sim);
    for (const f of this.fx.values()) {
      f.hitT += dt;
      f.dieT += dt;
      f.clangT += dt;
    }
    for (const e of sim.enemies) {
      if (e.kind === 'web') continue;
      const f = this.get(e.id);
      // The huntsman acts its own death (knocked off its wall, on its back, it fades): its rig, not shards.
      if (e.kind === 'huntsman') {
        if (!e.gone) this.huntsman(e, clock, back, front);
        continue;
      }
      const big = e.kind === 'oldBurrback';
      if (e.gone) {
        if (big && f.corpse) this.husk(back, f.corpse, 1);
        else if (f.dieT < 1e5 && !f.burst) this.burst(e, f);
        continue;
      }
      if (e.mode === 'dead') {
        if (f.dieT >= 1e5) continue; // dead with no blow seen (a load mid-death): nothing to show
        if (f.dieT < f.dieHold || e.hitstop > 0) {
          this.body(e, front, CREATURE.flash, 1);
        } else if (big) {
          // A death that is a beat (the old burrback; explorer r2): after the freeze it does not burst; it
          // sags, settles and lies there, grey, with a breath of dust. Quiet.
          if (!f.burst) {
            f.burst = true;
            f.corpse = { x: e.x + e.w / 2, y: e.y + e.h, w: e.w, h: e.h, m: e.facing };
            this.bursts.push({
              kind: 'ring',
              x: e.x + e.w / 2,
              y: e.y + e.h - 6,
              r: e.w * 0.4,
              t: 0,
              life: 0.6,
            });
          }
          if (f.corpse) {
            f.corpse.x = e.x + e.w / 2;
            f.corpse.y = e.y + e.h;
            this.husk(back, f.corpse, Math.min(1, (f.dieT - f.dieHold) / DEATH.collapse));
          }
        } else if (!f.burst) this.burst(e, f);
        continue;
      }
      // A carrier in its crack is not drawn (memory/creatures.md).
      if (e.kind === 'carrier' && e.mode === 'under') continue;
      this.creature(e, f, sim, clock, back, front);
    }
    this.shots(front, sim);
    this.effects(dt, front);
  }

  /** Droplets in flight (src/sim/shots.ts): hot beads with a short tail along their flight; a batted one near white. */
  private shots(g: Graphics, sim: SimView): void {
    for (const q of sim.shots ?? []) {
      const c = q.reflected ? CREATURE.batted : CREATURE.hot;
      g.moveTo(q.x - q.vx * 3, q.y - q.vy * 3)
        .lineTo(q.x, q.y)
        .stroke({ color: c, width: q.r, alpha: 0.35 });
      g.circle(q.x, q.y, q.r).fill({ color: c });
      g.circle(q.x, q.y, q.r * 0.45).fill({ color: CREATURE.flash });
    }
  }

  /**
   * The bombardier: a low wide dome with hot bands and a small head; its tail turret rises over its back for the lob
   * (the tip counts down in the hunt colour) and swings forward for the spray (the cone drawn while it sprays). Its own
   * droplet laid it on its back: flipped, legs kicking, a green bar draining.
   */
  private bombardier(
    e: EnemyState,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const w = e.w;
    const h = e.h;
    const xf = this.xf.set(e, 'feet', 1 + (SQUASH.x - 1) * sq, 1 + (SQUASH.y - 1) * sq);
    const open = e.mode === 'recover';
    if (open) {
      xf.ay = h / 2;
      xf.wy = e.y + h / 2;
      xf.sy = -xf.sy;
    }
    const dome = xf.map(
      domePts(w * 0.8, h * 0.8, 0.5, this.pa).map((v, i) => (i % 2 === 0 ? v : v + h * 0.2)),
    );
    for (let k = 0; k < 3; k++) {
      const lx = w * (0.2 + 0.25 * k) + (open ? Math.sin(clock * 14 + k * 2.1) * 4 : 0);
      back.rect(xf.x(lx) - 2, xf.y(h * 0.8), 4, h * 0.2 * Math.abs(xf.sy)).fill({ color: CREATURE.belly });
    }
    back.poly(dome).fill({ color: open ? CREATURE.stun : CREATURE.bombardier });
    if (!open)
      for (let k = 0; k < 3; k++) {
        const lx = w * (0.16 + 0.18 * k);
        back.poly(xf.map([lx, h * 0.45, lx + 5, h * 0.42, lx + 5, h * 0.95, lx, h * 0.95])).fill({
          color: CREATURE.hot,
          alpha: 0.75,
        });
      }
    // The head, small, in front.
    back
      .circle(xf.x(w * 0.9), xf.y(h * 0.7), h * 0.22)
      .fill({ color: mix(CREATURE.hot, CREATURE.belly, 0.5) });
    if (open) {
      back.poly(dome).stroke({ color: CREATURE.open, width: 3 });
      if (e.timer > 0) {
        const of = Math.max(e.timer, e.modeFrames + e.timer);
        const cx = e.x + w / 2;
        front.rect(cx - w / 2, e.y - 24, w, 4).fill({ color: CREATURE.belly, alpha: 0.6 });
        front.rect(cx - w / 2, e.y - 24, (w * e.timer) / of, 4).fill({ color: CREATURE.open });
      }
      if (white) front.poly(dome).fill({ color: CREATURE.flash, alpha: 0.95 });
      return;
    }
    // The tail turret: tucked low behind at rest; up over the back to lob, forward over the head to spray.
    const up = e.mode === 'rear' || e.mode === 'spit' ? 1 : 0;
    const fwd = e.mode === 'windup' || e.mode === 'spray' ? 1 : 0;
    const tx = up ? w * 0.3 : fwd ? w * 0.85 : -w * 0.05;
    const ty = up ? -h * 0.6 : fwd ? -h * 0.15 : h * 0.55;
    const pts = xf.map([
      w * 0.12,
      h * 0.5,
      w * (up || fwd ? 0.0 : -0.05),
      up || fwd ? -h * 0.3 : h * 0.6,
      tx,
      ty,
    ]);
    front
      .moveTo(pts[0] as number, pts[1] as number)
      .lineTo(pts[2] as number, pts[3] as number)
      .lineTo(pts[4] as number, pts[5] as number)
      .stroke({ color: CREATURE.bombardier, width: 7 });
    const telling = e.mode === 'rear' || e.mode === 'windup';
    let tip: number = CREATURE.danger;
    if (telling) {
      const of = Math.max(1, e.timer + e.modeFrames);
      const u = 1 - e.timer / of;
      const on = Math.sin(clock * (8 + 34 * u * u)) > 0;
      tip = on ? CREATURE.hunt : CREATURE.hot;
    } else if (e.mode === 'spit' || e.mode === 'spray') tip = CREATURE.flash;
    front.circle(pts[4] as number, pts[5] as number, 6).fill({ color: tip });
    if (e.mode === 'spray') {
      const c = coneBox(e, tuning);
      front.rect(c.x, c.y, c.w, c.h).fill({ color: CREATURE.hot, alpha: 0.45 });
    }
    if (white) front.poly(dome).fill({ color: CREATURE.flash, alpha: 0.95 });
  }

  /** The huntsman (render/enemies/huntsman.ts): its own rig in flat colours, its front legs red while it tells and lunges. */
  private huntsman(e: EnemyState, clock: number, g: Graphics, front: Graphics): void {
    let rig = this.hunts.get(e.id);
    if (!rig) {
      rig = new HuntsmanRig(e.id.length + 3);
      this.hunts.set(e.id, rig);
    }
    drawHuntsman(g, rig.pose(e, this.dt, clock, this.alpha), HUNT_GREY);
    if (e.mode === 'dead') return;
    // The shared language: a yellow eye over one aware of her; the tell's red bar draining (beside it: it is tall).
    const cx = e.x + e.w / 2;
    if (e.aware > 0) front.circle(cx, e.y - 12, 5).fill({ color: CREATURE.aware });
    if (e.mode === 'windup' && e.timer > 0) {
      const of = Math.max(e.timer, e.modeFrames + e.timer);
      front.rect(cx - 26, e.y - 26, 52, 4).fill({ color: CREATURE.belly, alpha: 0.6 });
      front.rect(cx - 26, e.y - 26, (52 * e.timer) / of, 4).fill({ color: CREATURE.hunt });
    }
  }

  /**
   * A big one's body, collapsing (`u` 0 -> 1) and then lying: the dome sags to a third of its height and
   * spreads, its colour drains to a cold grey; a dark crack line across it.
   */
  private husk(g: Graphics, c: { x: number; y: number; w: number; h: number; m: number }, u: number): void {
    const e = u * u * (3 - 2 * u);
    const sy = 1 - (1 - DEATH.flat) * e;
    const sx = 1 + 0.12 * e;
    const w = c.w * sx;
    const h = c.h * 0.86 * sy;
    const pts = domePts(w, h, 0.6, this.pa).map((v, i) => (i % 2 === 0 ? c.x - w / 2 + v : c.y - h + v));
    g.poly(pts).fill({ color: mix(CREATURE.oldBurrback, DEATH.grey, e) });
    g.moveTo(c.x - w * 0.3, c.y - h * 0.6)
      .lineTo(c.x - w * 0.05, c.y - h * 0.4)
      .lineTo(c.x + w * 0.2, c.y - h * 0.7)
      .stroke({ color: CREATURE.ridge, width: 2, alpha: 0.6 * e });
  }

  /** The kill's burst: 8 shards and a ring from the body's centre. */
  private burst(e: EnemyState, f: Fx): void {
    f.burst = true;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const col = bodyColor(e.kind);
    const size = Math.max(8, Math.min(16, (e.w + e.h) / 8));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + hash01(e.id, i) * 0.6;
      const sp = 200 + 180 * hash01(e.id, i + 11);
      this.shards.push({
        x: cx + Math.cos(a) * e.w * 0.2,
        y: cy + Math.sin(a) * e.h * 0.2,
        vx: Math.cos(a) * sp + e.hitDir * 60,
        vy: Math.sin(a) * sp - 160,
        a: a,
        va: (hash01(e.id, i + 23) - 0.5) * 18,
        s: size * (0.7 + 0.6 * hash01(e.id, i + 37)),
        color: i % 3 === 0 ? CREATURE.flash : col,
        t: 0,
        life: 0.55 + 0.25 * hash01(e.id, i + 51),
      });
    }
    this.bursts.push({ kind: 'ring', x: cx, y: cy, r: Math.max(e.w, e.h) * 0.5, t: 0, life: 0.35 });
  }

  /** One living creature. */
  private creature(e: EnemyState, f: Fx, sim: SimView, clock: number, back: Graphics, front: Graphics): void {
    const kind = e.kind;
    // A hit: white for the hold, the squash relaxing after it.
    let sq = 0;
    if (f.hitT < f.hitHold) sq = 1;
    else if (f.hitT < f.hitHold + SQUASH.frames * F) sq = 1 - (f.hitT - f.hitHold) / (SQUASH.frames * F);
    const white = f.hitT < f.hitHold;
    const asleep = e.mode === 'sleep' || e.mode === 'leave' || e.dozing || e.roosting;
    const tell =
      e.mode === 'curious' ||
      e.mode === 'windup' ||
      e.mode === 'feint' ||
      e.mode === 'wake' ||
      (kind === 'bombardier' && e.mode === 'rear');
    const cx = e.x + e.w / 2;

    if (isFlyer(kind)) this.flyer(e, f, sim, clock, back, front, sq, white);
    else if (isCrawler(kind)) this.crawler(e, f, clock, back, front, sq, white);
    else if (kind === 'weaverBoss') {
      // The boss view draws its body (boss.ts); here only the answer to a blow.
      if (white) front.rect(e.x, e.y, e.w, e.h).fill({ color: CREATURE.flash, alpha: 0.9 });
    } else if (kind === 'dangler') this.dangler(e, clock, back, front, sq, white);
    else if (kind === 'carrier') this.carrier(e, clock, back, front, sq, white);
    else if (kind === 'bombardier') this.bombardier(e, clock, back, front, sq, white);
    else if (kind === 'jumper') this.jumper(e, clock, back, front, sq, white);
    else if (kind === 'weaver') this.spider(e, clock, back, front, sq, white, false);
    else this.generic(e, back, front, sq, white);

    // What it senses (memory/creatures.md): a yellow eye over one aware of her, a grey dash over one asleep.
    const top = isFlyer(kind) && e.mode === 'curious' ? e.y - e.h * 0.25 : e.y;
    if (e.aware > 0) front.circle(cx, top - 12, 5).fill({ color: CREATURE.aware });
    else if (asleep)
      front
        .moveTo(cx - 9, top - 10)
        .lineTo(cx + 9, top - 10)
        .stroke({ color: CREATURE.asleep, width: 3 });
    // The tell counts down: a bar over it that empties (a brace red, a feint / wake / hawker's tell orange).
    if (tell && e.timer > 0) {
      const of = Math.max(e.timer, e.modeFrames + e.timer);
      const w = Math.max(e.w, 52);
      front.rect(cx - w / 2, top - 26, w, 4).fill({ color: CREATURE.belly, alpha: 0.6 });
      front.rect(cx - w / 2, top - 26, (w * e.timer) / of, 4).fill({
        color: e.mode === 'windup' ? CREATURE.hunt : CREATURE.feint,
      });
    }
  }

  /** Burrback and old burrback. */
  private crawler(
    e: EnemyState,
    f: Fx,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const old = e.kind === 'oldBurrback';
    if (old && (e.mode === 'roll' || e.mode === 'curl')) {
      this.ball(e, f, clock, back, front, white);
      return;
    }
    const stunned = e.stunned && (e.mode === 'recover' || e.mode === 'hurt');
    const feint = e.mode === 'feint';
    const curled = e.tuck > 0;
    let sx = 1 + (SQUASH.x - 1) * sq;
    let sy = 1 + (SQUASH.y - 1) * sq;
    if (feint || curled) {
      // Shell down, tucked low.
      sx *= 1.06;
      sy *= 0.82;
    }
    // Rearing for the slam (the anti-camp tell): up on its back legs, taller, its front lifted.
    const rear = e.mode === 'rear' ? Math.min(1, (e.modeFrames - e.timer + 1) / 8) : 0;
    if (rear > 0) {
      sy *= 1 + 0.35 * rear;
      sx *= 1 - 0.1 * rear;
      this.rearWarn(front, e, clock, rear);
    }
    // Alive at rest: it breathes; walking, its shell bobs with its steps (a body, not a block of floor).
    sy *=
      e.vx === 0
        ? 1 + 0.045 * Math.sin(clock * 3.3 + e.x * 0.01)
        : 1 + 0.05 * Math.abs(Math.sin(e.stride * 0.09));
    const xf = this.xf.set(e, 'feet', sx, sy);
    // A clang: the shell rings, a 4-frame shiver.
    if (f.clangT < 4 * F) xf.dx = (Math.floor(f.clangT / F) % 2 === 0 ? 3 : -3) * e.facing;
    const w = e.w;
    const h = e.h;
    const shoulder = old ? 0.62 : 0.58;
    if (stunned) {
      // On its back: the dome turned over, pale, legs kicking up, a green bar draining its open time.
      xf.ay = h / 2;
      xf.wy = e.y + h / 2;
      xf.sy = -sy;
      const pts = xf.map(domePts(w, h, shoulder, this.pa));
      // The open window, loud (first-timer r6: "never unambiguous that only the flipped state takes damage"): a
      // pulsing green glow round it, under the shell.
      if (old) {
        const pulse = 0.5 + 0.5 * Math.sin(clock * 9);
        const gx = e.x + w / 2;
        const gy = e.y + h * 0.6;
        back.ellipse(gx, gy, w * 0.75, h * 0.7).fill({ color: CREATURE.open, alpha: 0.12 + 0.12 * pulse });
        back
          .ellipse(gx, gy, w * 0.75, h * 0.7)
          .stroke({ color: CREATURE.open, width: 3, alpha: 0.5 + 0.4 * pulse });
      }
      back.poly(pts).fill({ color: white ? CREATURE.flash : CREATURE.stun });
      back.poly(pts).stroke({ color: CREATURE.open, width: 3 });
      if (old) this.cracks(back, e, xf, h, shoulder, CREATURE.ridge);
      for (let k = 0; k < 3; k++) {
        const lx = w * (0.25 + 0.25 * k);
        const kick = Math.sin(clock * 14 + k * 2.1) * 6;
        back
          .moveTo(xf.x(lx), xf.y(h))
          .lineTo(xf.x(lx + kick * 0.5), xf.y(h) - 12 - Math.abs(kick))
          .stroke({ color: CREATURE.belly, width: 4 });
      }
      if (e.timer > 0) {
        const of = Math.max(e.timer, e.modeFrames + e.timer);
        const cx = e.x + w / 2;
        const bh = old ? 8 : 4;
        front.rect(cx - w / 2, e.y - 24, w, bh).fill({ color: CREATURE.belly, alpha: 0.6 });
        front.rect(cx - w / 2, e.y - 24, (w * e.timer) / of, bh).fill({ color: CREATURE.open });
      }
      if (white) front.poly(pts).fill({ color: CREATURE.flash, alpha: 0.95 });
      return;
    }
    const braced = e.braced;
    const body = bodyColor(e.kind);
    // Legs under the shell: three dark stubs that walk with its stride.
    const step = e.stride * 0.18;
    for (let k = 0; k < 3; k++) {
      const lx = w * (0.22 + 0.28 * k) + Math.sin(step + k * 2.1) * 4;
      back.rect(xf.x(lx) - 3, xf.y(h * 0.8), 6, h * 0.2 * sy).fill({ color: CREATURE.belly });
    }
    const dome = xf.map(domePts(w, h * 0.86, shoulder, this.pa));
    back.poly(dome).fill({ color: braced ? mix(body, CREATURE.hunt, 0.18) : body });
    if (old) {
      // Ridges across the shell: the old one's armour.
      for (let k = 1; k <= 3; k++) {
        const lx = (w * k) / 4;
        back
          .moveTo(xf.x(lx), xf.y(h * 0.86 * shoulder * 0.25 + 4))
          .lineTo(xf.x(lx), xf.y(h * 0.82))
          .stroke({ color: CREATURE.ridge, width: 3 });
      }
      this.cracks(back, e, xf, h, shoulder, CREATURE.crack);
      // The top of the shell: amber while a pogo would land (braced, not yet pogoed), grey once it has.
      if (braced) {
        const band = xf.map(domeTopPts(w, h * 0.86, shoulder, 0.3, this.pa));
        front
          .poly(band)
          .fill({ color: e.pogoed ? CREATURE.spent : CREATURE.amber, alpha: e.pogoed ? 0.8 : 0.95 });
      }
    }
    if (braced) back.poly(dome).stroke({ color: CREATURE.hunt, width: 3 });
    // The eyes, near its front: two pale points (and two short feelers that twitch).
    const er = old ? 4 : 3;
    back.circle(xf.x(w * 0.74), xf.y(h * 0.4), er).fill({ color: CREATURE.eye, alpha: 0.9 });
    back.circle(xf.x(w * 0.84), xf.y(h * 0.44), er * 0.8).fill({ color: CREATURE.eye, alpha: 0.75 });
    const tw = Math.sin(clock * (e.vx === 0 ? 3.1 : 9) + e.x * 0.01) * 0.25;
    for (const k of [0, 1]) {
      const bx = xf.x(w * (0.8 + 0.06 * k));
      const by = xf.y(h * 0.3);
      const a = -0.5 - 0.35 * k + tw * (k ? 1 : -1);
      back
        .moveTo(bx, by)
        .lineTo(bx + Math.cos(a) * 14 * e.facing, by + Math.sin(a) * 14)
        .stroke({ color: CREATURE.belly, width: 2, alpha: 0.9 });
    }
    // The danger part: the shell's front plate, over her.
    const plate = [
      w * 0.8,
      h * 0.86 * shoulder * 0.35,
      w * 1.02,
      h * 0.86 * shoulder * 0.9,
      w * 1.02,
      h * 0.92,
      w * 0.84,
      h * 0.92,
    ];
    const pp = xf.map(plate);
    if (braced) {
      front.poly(pp).fill({ color: CREATURE.armour });
      front.poly(pp).stroke({ color: CREATURE.hunt, width: 3 });
      // How far the ram will carry it (during the brace), or what is left of it (the ram).
      const front0 = e.facing > 0 ? e.x + w : e.x;
      const reach = e.mode === 'windup' ? tuning.burrback.chargePx : e.chargeLeft;
      front
        .moveTo(front0, e.y + h - 2)
        .lineTo(front0 + e.facing * reach, e.y + h - 2)
        .stroke({ color: CREATURE.hunt, width: 2, alpha: 0.6 });
    } else front.poly(pp).fill({ color: CREATURE.danger, alpha: 0.9 });
    // Spent (winded): open to every cut.
    if (e.mode === 'recover') back.poly(dome).stroke({ color: CREATURE.open, width: 2, alpha: 0.8 });
    if (white) {
      front.poly(dome).fill({ color: CREATURE.flash, alpha: 0.95 });
      front.poly(pp).fill({ color: CREATURE.flash, alpha: 0.95 });
    }
  }

  /**
   * The old burrback curled (`curl`) or rolling (`roll`): a shell ball `rollTouchPx` high (what hurts is what is
   * drawn), its ridges turning with the distance rolled, speed streaks behind it; curling, it shivers.
   */
  private ball(e: EnemyState, f: Fx, clock: number, back: Graphics, front: Graphics, white: boolean): void {
    const r = tuning.oldBurrback.rollTouchPx / 2;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h - r;
    const curling = e.mode === 'curl';
    const sh = curling ? Math.sin(clock * 40) * 2 : 0;
    // Its turn: the distance rolled over its radius (render-only, from where it is).
    const ang = e.x / r;
    if (!curling && Math.abs(e.vx) > 0.5)
      for (let k = 1; k <= 3; k++)
        back
          .moveTo(cx - Math.sign(e.vx) * (r + 10 * k), cy - r * 0.5 + k * 10)
          .lineTo(cx - Math.sign(e.vx) * (r + 10 * k + Math.abs(e.vx) * 4), cy - r * 0.5 + k * 10)
          .stroke({ color: CREATURE.ridge, width: 2, alpha: 0.5 });
    back.circle(cx + sh, cy, r).fill({ color: white ? CREATURE.flash : CREATURE.oldBurrback });
    back.circle(cx + sh, cy, r).stroke({ color: CREATURE.hunt, width: 3, alpha: curling ? 0.6 : 0.9 });
    for (let k = 0; k < 4; k++) {
      const a = ang + (k * Math.PI) / 4;
      back
        .moveTo(cx + sh + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9)
        .lineTo(cx + sh - Math.cos(a) * r * 0.9, cy - Math.sin(a) * r * 0.9)
        .stroke({ color: CREATURE.ridge, width: 3 });
    }
    if (f.clangT < 4 * F) front.circle(cx, cy, r + 6).stroke({ color: CREATURE.flash, width: 3, alpha: 0.8 });
  }

  /** The slam's tell (`rear`): the floor it will shake, dashes running out both ways, pulsing; a ring over it. */
  private rearWarn(front: Graphics, e: EnemyState, clock: number, k: number): void {
    const fy = e.y + e.h;
    const cx = e.x + e.w / 2;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 20);
    const reach = Math.min(tuning.oldBurrback.slamReachPx, SLAM_FX.warnPx);
    for (const dir of [-1, 1])
      for (let d = 40; d < reach * k; d += 36)
        front
          .moveTo(cx + dir * d, fy - 2)
          .lineTo(cx + dir * (d + 18), fy - 2)
          .stroke({
            color: CREATURE.hunt,
            width: 4,
            alpha: (0.45 + 0.5 * pulse) * Math.max(0.35, 1 - d / reach),
          });
    front.circle(cx, e.y - 34, 16 + 8 * pulse).stroke({ color: CREATURE.hunt, width: 4, alpha: 0.9 });
  }

  /**
   * A carrier (an ant on its trail): three small segments, six legs that walk with its stride, a feeler, and on
   * its back the pale wing of a dead moth it carries home.
   */
  private carrier(
    e: EnemyState,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const fy = e.y + e.h;
    const cx = e.x + e.w / 2;
    // Readable at a wide frame (first-timer r6: "the ants were specks"): drawn bigger as the camera pulls out, about
    // its feet, with a pale rim under it.
    const k = Math.min(SMALL.maxScale, Math.max(1, SMALL.zoomAt / Math.max(0.05, this.zoom)));
    back.setTransform(k, 0, 0, k, cx * (1 - k), fy * (1 - k));
    front.setTransform(k, 0, 0, k, cx * (1 - k), fy * (1 - k));
    back.ellipse(cx - 2 * e.facing, fy - 7, 22, 9).fill({ color: CREATURE.carried, alpha: SMALL.rim });
    this.carrierBody(e, clock, back, front, sq, white);
    back.setTransform(1, 0, 0, 1, 0, 0);
    front.setTransform(1, 0, 0, 1, 0, 0);
  }

  private carrierBody(
    e: EnemyState,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const fy = e.y + e.h;
    const cx = e.x + e.w / 2;
    const dir = e.facing;
    const body = white ? CREATURE.flash : CREATURE.carrier;
    const by = fy - 7 - Math.abs(Math.sin(e.stride * 0.3)) * 1.5;
    const step = e.stride * 0.35;
    for (let k = 0; k < 3; k++) {
      const lx = cx + (k - 1) * 8 * dir;
      for (const side of [-1, 1]) {
        const sw = Math.sin(step + k * 2.1 + (side > 0 ? Math.PI : 0)) * 4;
        back
          .moveTo(lx, by + 2)
          .lineTo(lx + sw + side * 3, fy)
          .stroke({ color: CREATURE.belly, width: 1.5 });
      }
    }
    back.ellipse(cx - 10 * dir, by, 7 * (1 + 0.2 * sq), 5).fill({ color: body });
    back.ellipse(cx, by, 5, 4).fill({ color: body });
    back.circle(cx + 9 * dir, by - 1, 4).fill({ color: body });
    const tw = Math.sin(clock * 9 + e.x * 0.05) * 0.3;
    back
      .moveTo(cx + 11 * dir, by - 3)
      .lineTo(cx + (18 + 2 * tw) * dir, by - 9 + 3 * tw)
      .stroke({ color: CREATURE.belly, width: 1.5 });
    // The load: a dead moth's wing held over its back (a pale chevron), swaying with its steps.
    if (e.mode !== 'bite' && e.mode !== 'hurt') {
      const sway = Math.sin(e.stride * 0.3) * 0.15;
      const wx = cx - 2 * dir;
      const wy = by - 9;
      front
        .poly([
          wx + 6 * dir,
          wy + 2,
          wx - dir * 18 * Math.cos(sway),
          wy - 10 - 18 * Math.sin(sway),
          wx - 10 * dir,
          wy + 4,
        ])
        .fill({ color: CREATURE.carried, alpha: 0.85 });
    }
    if (e.mode === 'bite') front.circle(cx + 14 * dir, by, 5).fill({ color: CREATURE.hunt, alpha: 0.8 });
  }

  /**
   * The carriers' trails (round 5: "trails readable as paths"): from each carrier's start along its `trail` to its
   * crack, a faint dotted line of scent marks on the ground; the crack a small dark notch.
   */
  private trails(back: Graphics, sim: SimView): void {
    for (const sp of sim.scene.enemies ?? []) {
      if (sp.kind !== 'carrier' || !sp.trail || sp.trail.length === 0) continue;
      const pts: [number, number][] = [[sp.x, sp.y], ...sp.trail];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] as [number, number];
        const b = pts[i] as [number, number];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < len; d += TRAIL_FX.every) {
          const u = d / Math.max(1, len);
          back
            .circle(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 2, TRAIL_FX.dot)
            .fill({ color: CREATURE.carried, alpha: TRAIL_FX.alpha });
        }
      }
      const end = pts[pts.length - 1] as [number, number];
      back.ellipse(end[0], end[1] - 3, 10, 4).fill({ color: 0x050608, alpha: 0.9 });
    }
  }

  /**
   * The old burrback's health as cracks in its shell (staging item 6): one more jagged crack per point
   * lost, so the fight's progress reads on the body (no bar over a mini-boss). Drawn through `xf`, so
   * they turn over with it on its back.
   */
  private cracks(g: Graphics, e: EnemyState, xf: Xf, h: number, shoulder: number, color: number): void {
    const w = e.w;
    const lost = Math.max(0, Math.min(12, e.hpMax - e.hp));
    for (let k = 0; k < lost; k++) {
      const x0 = w * (0.15 + 0.7 * hash01(e.id, k * 3));
      const y0 = h * 0.86 * shoulder * (0.15 + 0.5 * hash01(e.id, k * 3 + 1));
      const dir = hash01(e.id, k * 3 + 2) < 0.5 ? -1 : 1;
      g.moveTo(xf.x(x0), xf.y(y0))
        .lineTo(xf.x(x0 + dir * 6), xf.y(y0 + 9))
        .lineTo(xf.x(x0 - dir * 3), xf.y(y0 + 16))
        .lineTo(xf.x(x0 + dir * 8), xf.y(y0 + 25))
        .stroke({ color, width: 2, alpha: 0.85 });
    }
  }

  /** Hawker (and the test grove's lampwing). */
  private flyer(
    e: EnemyState,
    f: Fx,
    sim: SimView,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const w = e.w;
    const h = e.h;
    const cx = e.x + w / 2;
    const cy = e.y + h / 2;
    const telling = e.mode === 'curious';
    const diving = e.mode === 'dive';
    const open = e.mode === 'stall';
    // The tell: it swells and flashes in the hunt colour, quicker as the dive nears.
    let swell = 1;
    let hot = 0;
    if (telling) {
      const of = Math.max(1, e.timer + e.modeFrames);
      const p = 1 - e.timer / of;
      swell = 1 + (TELL.swell - 1) * Math.min(1, p * 3);
      const hz = 3 + 11 * p;
      hot = (clock * hz) % 1 < 0.5 ? 1 : 0.35;
    }
    if (diving) hot = 1;
    const sx = swell * (1 + (SQUASH.x - 1) * sq);
    const sy = swell * (1 + (SQUASH.y - 1) * sq);
    const xf = this.xf.set(e, 'centre', sx, sy);
    xf.m = 1;

    // The dive's smear: where it was the last few frames.
    if (diving) {
      if (sim.frame !== f.trailFrame) {
        f.trailFrame = sim.frame;
        f.trail.push(cx, cy);
        if (f.trail.length > SMEAR * 2) f.trail.splice(0, 2);
      }
      for (let i = 0; i < f.trail.length; i += 2) {
        const k = (i / 2 + 1) / (f.trail.length / 2 + 1);
        back
          .ellipse(f.trail[i] as number, f.trail[i + 1] as number, w * 0.42 * (0.6 + 0.4 * k), h * 0.4)
          .fill({ color: CREATURE.hunt, alpha: 0.28 * k });
      }
    } else f.trail.length = 0;

    // The reticle: where the dive will strike, on the ground under that point.
    if (telling || diving) {
      const tx = diving && Number.isFinite(f.diveX) ? f.diveX : e.targetX;
      const ty = diving && Number.isFinite(f.diveY) ? f.diveY : e.targetY;
      const gy = groundBelow(sim.scene, tx, ty);
      let r = TELL.rTight;
      if (telling)
        r =
          e.timer > TELL.tighten
            ? TELL.rWide
            : TELL.rTight + (TELL.rWide - TELL.rTight) * (e.timer / TELL.tighten);
      const a = telling ? 0.45 + 0.4 * (1 - Math.min(1, e.timer / TELL.tighten)) : 0.9;
      back.ellipse(tx, gy - 2, r, r * 0.3).stroke({ color: CREATURE.hunt, width: 3, alpha: a });
      for (const s of [-1, 1]) {
        back
          .moveTo(tx + s * (r + 4), gy - 2)
          .lineTo(tx + s * (r + 16), gy - 2)
          .stroke({ color: CREATURE.hunt, width: 3, alpha: a });
      }
      // A dashed line from it to the point it dives at.
      if (telling) {
        const dx = tx - cx;
        const dy = ty - cy;
        const d = Math.hypot(dx, dy) || 1;
        for (let s = 24; s < d - 10; s += 26) {
          const s1 = Math.min(d - 10, s + 12);
          back.moveTo(cx + (dx * s) / d, cy + (dy * s) / d).lineTo(cx + (dx * s1) / d, cy + (dy * s1) / d);
        }
        back.stroke({
          color: CREATURE.hunt,
          width: 2,
          alpha: 0.35 + 0.35 * (1 - Math.min(1, e.timer / TELL.tighten)),
        });
      }
    }

    // Wings: two blades that beat with its flap phase.
    const body = bodyColor(e.kind);
    const beat = Math.sin(e.flap * Math.PI * 2);
    const wy = beat * h * 0.9;
    const wing = (s: number) =>
      xf.map([
        w / 2 + s * w * 0.12,
        h * 0.4,
        w / 2 + s * w * WING_SPAN,
        h * 0.45 - wy,
        w / 2 + s * w * 0.4,
        h * 0.8,
      ]);
    const fill = mix(body, CREATURE.hunt, 0.75 * hot);
    back.poly(wing(-1)).fill({ color: mix(fill, CREATURE.belly, 0.25) });
    back.poly(wing(1)).fill({ color: mix(fill, CREATURE.belly, 0.25) });
    // The body.
    const bx = xf.x(w / 2);
    const by = xf.y(h / 2);
    back.ellipse(bx, by, w * 0.3 * sx, h * 0.48 * sy).fill({ color: fill });
    if (open) back.ellipse(bx, by, w * 0.3 * sx, h * 0.48 * sy).stroke({ color: CREATURE.open, width: 2 });
    // The danger part, over her: the beak / talons, pointed where it looks (along its dive while diving).
    let lx = e.lookX;
    let ly = e.lookY;
    if (diving && (e.vx !== 0 || e.vy !== 0)) {
      const v = Math.hypot(e.vx, e.vy);
      lx = e.vx / v;
      ly = e.vy / v;
    }
    if (lx === 0 && ly === 0) ly = 1;
    const tip = h * 0.5 * sy + 14 * swell;
    const bw = h * 0.42 * sx;
    const beak = [
      bx + lx * tip,
      by + ly * tip,
      bx - ly * bw + lx * 4,
      by + lx * bw + ly * 4,
      bx + ly * bw + lx * 4,
      by - lx * bw + ly * 4,
    ];
    front.poly(beak).fill({ color: telling || diving ? CREATURE.hunt : CREATURE.danger, alpha: 0.95 });
    // The tell, at a glance from below: a hunt-coloured ring round it that closes in and quickens.
    if (telling) {
      const of = Math.max(1, e.timer + e.modeFrames);
      const p = 1 - e.timer / of;
      const r = w * (1.1 - 0.45 * p) * swell;
      front.circle(bx, by, r).stroke({ color: CREATURE.hunt, width: 2 + 2 * p, alpha: 0.35 + 0.5 * hot * p });
    }
    // The eye.
    back.circle(bx + lx * w * 0.12, by + ly * h * 0.12 - 3, 3).fill({ color: CREATURE.belly });
    if (white) {
      front.ellipse(bx, by, w * 0.3 * sx, h * 0.48 * sy).fill({ color: CREATURE.flash, alpha: 0.95 });
      front.poly(wing(-1)).fill({ color: CREATURE.flash, alpha: 0.9 });
      front.poly(wing(1)).fill({ color: CREATURE.flash, alpha: 0.9 });
    }
  }

  /**
   * The dangler (feel review r2: a 30 x 26 box read as nothing): its silk from the tie point, a round
   * abdomen about 40 px across and a small head under it, eight legs that fold in on the tell and splay as
   * it drops; the fangs are its danger part (dim red; hunt red in the tell and the drop). In the tell a
   * dashed line shows how far the silk will run.
   */
  private dangler(
    e: EnemyState,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const live = e.mode === 'windup' || e.mode === 'drop' || e.mode === 'swing';
    // The silk.
    if (!e.broken && e.mode !== 'fall' && e.mode !== 'recover')
      back
        .moveTo(e.fromX, e.fromY)
        .lineTo(cx, cy - e.h / 2)
        .stroke({ color: 0xdfe6f2, width: 1.5, alpha: 0.7 });
    if (e.mode === 'windup') {
      // The tell shows the whole path (first-timer r4: "the dashed line showed a vertical drop, then it swung
      // sideways into me"): dashes down the drop, then on round the swing's arc toward her side (the side the
      // sim swings to is hers when the drop ends), its far end marked, and a fainter arc the other way.
      const d = Math.max(0, e.targetY - cy);
      for (let y = 18; y < d; y += 22) back.moveTo(cx, cy + y).lineTo(cx, cy + Math.min(d, y + 10));
      back.stroke({ color: CREATURE.hunt, width: 2, alpha: 0.5 });
      const D = tuning.dangler;
      const len = Math.max(1, e.targetY - e.fromY);
      const reach = Math.asin(Math.min(1, Math.min(D.swingPx, len * 0.9) / len));
      const side = this.herX < e.fromX ? -1 : 1;
      for (const sd of [side, -side]) {
        const strong = sd === side;
        const n = Math.max(3, Math.round((len * reach) / 22));
        for (let i = 0; i < n; i += 2) {
          const a0 = (reach * i) / n;
          const a1 = (reach * Math.min(n, i + 1)) / n;
          back
            .moveTo(e.fromX + Math.sin(a0) * len * sd, e.fromY + Math.cos(a0) * len)
            .lineTo(e.fromX + Math.sin(a1) * len * sd, e.fromY + Math.cos(a1) * len);
        }
        back.stroke({ color: CREATURE.hunt, width: 2, alpha: strong ? 0.6 : 0.2 });
        if (strong)
          back
            .circle(e.fromX + Math.sin(reach) * len * sd, e.fromY + Math.cos(reach) * len, 7)
            .stroke({ color: CREATURE.hunt, width: 2, alpha: 0.6 });
      }
    }
    this.spider(
      e,
      clock,
      back,
      front,
      sq,
      white,
      true,
      live,
      e.mode === 'windup' ? 1 : e.mode === 'drop' ? -1 : 0,
    );
  }

  /**
   * A spider body (the dangler; the weaver small): abdomen, head, eight legs and the fangs. `fold` 1 =
   * legs tucked (a tell), -1 = splayed up (a drop), 0 = at rest, walking with the clock.
   */
  private spider(
    e: EnemyState,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
    small: boolean,
    live = e.mode === 'windup' || e.mode === 'bite' || e.mode === 'run',
    fold = e.mode === 'windup' ? 1 : 0,
  ): void {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const sx = 1 + (SQUASH.x - 1) * sq;
    const sy = 1 + (SQUASH.y - 1) * sq;
    const r = Math.max(e.w, e.h) * (small ? 0.68 : 0.55);
    const body = bodyColor(e.kind);
    const hot = live ? mix(body, CREATURE.hunt, 0.35) : body;
    // Legs: four a side, each a bent line from the body; they fold in and out.
    const legLen = r * (small ? 1.5 : 1.9);
    for (const side of [-1, 1])
      for (let k = 0; k < 4; k++) {
        const base = -0.9 + k * 0.6;
        const walk = fold === 0 ? Math.sin(clock * 6 + k * 1.7 + side) * 0.12 : 0;
        const a = side < 0 ? Math.PI - base - walk : base + walk;
        const tuck = fold > 0 ? 0.45 : fold < 0 ? 1.15 : 1;
        const kx = cx + Math.cos(a) * r * 0.9 * sx;
        const ky = cy + Math.sin(a) * r * 0.6 * sy;
        const ex = cx + Math.cos(a) * legLen * tuck * sx;
        const ey = cy + (fold < 0 ? -0.7 : 0.55) * legLen * tuck * sy * (0.6 + 0.4 * Math.abs(Math.sin(a)));
        back
          .moveTo(cx, cy)
          .lineTo(kx, ky - 6)
          .lineTo(ex, ey);
      }
    // (Lighter than the belly: dark legs vanished against the night, feel review r2.)
    back.stroke({
      color: mix(body, CREATURE.belly, 0.3),
      width: small ? 3.5 : 3,
      alpha: 0.95,
      join: 'round',
    });
    // Abdomen and head.
    back.ellipse(cx, cy - r * 0.15, r * sx, r * 0.9 * sy).fill({ color: hot });
    back.circle(cx, cy + r * 0.75 * sy, r * 0.42).fill({ color: mix(hot, CREATURE.belly, 0.3) });
    back.circle(cx - r * 0.15, cy + r * 0.7 * sy, 2.5).fill({ color: CREATURE.aware, alpha: 0.6 });
    back.circle(cx + r * 0.15, cy + r * 0.7 * sy, 2.5).fill({ color: CREATURE.aware, alpha: 0.6 });
    // The fangs, over her.
    const fy = cy + r * 1.05 * sy;
    for (const side of [-1, 1])
      front
        .moveTo(cx + side * r * 0.12, fy)
        .lineTo(cx + side * r * 0.3, fy + r * 0.35)
        .lineTo(cx + side * r * 0.05, fy + r * 0.2)
        .closePath()
        .fill({ color: live ? CREATURE.hunt : CREATURE.danger, alpha: 0.95 });
    if (white) {
      front.ellipse(cx, cy - r * 0.15, r * sx, r * 0.9 * sy).fill({ color: CREATURE.flash, alpha: 0.95 });
      front.circle(cx, cy + r * 0.75 * sy, r * 0.42).fill({ color: CREATURE.flash, alpha: 0.95 });
    }
  }

  /** Any other kind: a filled body with its danger side marked. */
  /**
   * A jumping spider: a round abdomen and a blocky head, two big pale eye discs with dark pupils toward her, short
   * legs. Its tell crouches it low and red, with the pounce's arc dashed to where it will land (it follows her until
   * the last frames); in the leap it is red and stretched; open (a miss, knocked down) it is the open green, on its
   * back when stunned.
   */
  private jumper(
    e: EnemyState,
    clock: number,
    back: Graphics,
    front: Graphics,
    sq: number,
    white: boolean,
  ): void {
    const fy = e.y + e.h;
    const cx = e.x + e.w / 2;
    const dir = e.facing;
    const tell = e.mode === 'windup';
    const leap = e.mode === 'charge';
    const open = e.mode === 'recover';
    const onBack = open && e.stunned;
    const crouch = tell ? 6 : 0;
    const by = fy - 13 + crouch;
    const body = white ? CREATURE.flash : open ? mix(CREATURE.jumper, CREATURE.open, 0.45) : CREATURE.jumper;
    // Legs: four a side, short and splayed; tucked up in a leap.
    for (let k = 0; k < 4; k++) {
      const hx = cx + (6 - k * 4) * dir;
      const reach = [26, 16, -10, -22][k] as number;
      const lift = leap ? -6 : onBack ? -22 : 0;
      const kx = hx + reach * 0.55 * dir;
      back
        .moveTo(hx, by + 2)
        .lineTo(kx, by - 8 + (onBack ? -6 : 0))
        .lineTo(hx + reach * dir, fy + lift + Math.sin(clock * 14 + k) * (onBack ? 4 : 0))
        .stroke({ color: CREATURE.belly, width: 2.5 });
    }
    const s = 1 + (SQUASH.x - 1) * sq;
    back.ellipse(cx - 12 * dir, by - 2, 13 * s, 11 / s).fill({ color: body });
    back.roundRect(cx - 4 + (dir > 0 ? 0 : -14), by - 13, 22, 19, 7).fill({ color: body });
    // The eyes: two big pale discs on the face, pupils on her.
    const look = Math.sign(this.herX - cx) || dir;
    for (let k = 0; k < 2; k++) {
      const ex = cx + (14 - k * 5) * dir;
      const ey = by - 5;
      front.circle(ex, ey, k === 0 ? 4.6 : 3.8).fill({ color: tell || leap ? CREATURE.hunt : CREATURE.eye });
      front.circle(ex + look * 1.2, ey, k === 0 ? 2.4 : 2).fill({ color: CREATURE.belly });
    }
    // Pale palps.
    front.circle(cx + 20 * dir, by + 4, 2.2).fill({ color: CREATURE.eye });
    // The danger: crouched red, and the arc it will fly.
    if (tell || leap) {
      front
        .ellipse(cx, by + 2, 24, 12)
        .stroke({ color: CREATURE.hunt, width: 3, alpha: tell ? 0.5 + 0.5 * Math.sin(clock * 30) : 0.9 });
      const g = tuning.jumper.gravity;
      const n = Math.max(2, e.span);
      for (let k = 2; k < n; k += 2) {
        const x = e.fromX + e.pushX * k;
        const y = e.fromY + e.pushY * k + (g * k * k) / 2 - e.h / 2;
        front.circle(x, y, 2.2).fill({ color: CREATURE.hunt, alpha: tell ? 0.55 : 0.25 });
      }
      front.circle(e.targetX, e.targetY - 3, 7).stroke({ color: CREATURE.hunt, width: 2 });
    }
    if (white) back.ellipse(cx, by - 4, 26, 14).fill({ color: CREATURE.flash, alpha: 0.6 });
  }

  private generic(e: EnemyState, back: Graphics, front: Graphics, sq: number, white: boolean): void {
    const xf = this.xf.set(e, 'centre', 1 + (SQUASH.x - 1) * sq, 1 + (SQUASH.y - 1) * sq);
    const pts = xf.map([0, 0, e.w, 0, e.w, e.h, 0, e.h]);
    const live = e.mode === 'windup' || e.mode === 'bite' || e.mode === 'run';
    back.poly(pts).fill({ color: bodyColor(e.kind) });
    const half = xf.map([e.w * 0.6, 0, e.w, 0, e.w, e.h, e.w * 0.6, e.h]);
    front.poly(half).fill({ color: live ? CREATURE.hunt : CREATURE.danger, alpha: 0.85 });
    if (white) front.poly(pts).fill({ color: CREATURE.flash, alpha: 0.95 });
  }

  /** The body's silhouette alone, in one colour (the kill's white hold). */
  private body(e: EnemyState, g: Graphics, color: number, alpha: number): void {
    if (isFlyer(e.kind)) {
      // Body and spread wings, squashed like a hit.
      const xf = this.xf.set(e, 'centre', SQUASH.x, SQUASH.y);
      xf.m = 1;
      const w = e.w;
      const h = e.h;
      g.ellipse(xf.x(w / 2), xf.y(h / 2), w * 0.3 * SQUASH.x, h * 0.48 * SQUASH.y).fill({ color, alpha });
      for (const s of [-1, 1])
        g.poly(
          xf.map([
            w / 2 + s * w * 0.12,
            h * 0.4,
            w / 2 + s * w * WING_SPAN,
            h * 0.2,
            w / 2 + s * w * 0.4,
            h * 0.8,
          ]),
        ).fill({ color, alpha });
      return;
    }
    const xf = this.xf.set(e, 'feet', SQUASH.x, SQUASH.y);
    const pts = isCrawler(e.kind)
      ? xf.map(domePts(e.w, e.h * 0.9, 0.6, this.pa))
      : xf.map([0, 0, e.w, 0, e.w, e.h, 0, e.h]);
    g.poly(pts).fill({ color, alpha });
  }

  /** Shards, rings and clang stars. */
  private effects(dt: number, g: Graphics): void {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i] as Shard;
      s.t += dt;
      if (s.t >= s.life) {
        this.shards.splice(i, 1);
        continue;
      }
      s.vy += 1100 * dt;
      s.vx *= Math.exp(-2.5 * dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.a += s.va * dt;
      const u = s.t / s.life;
      const r = s.s * (1 - 0.4 * u);
      const c = Math.cos(s.a);
      const n = Math.sin(s.a);
      g.poly([
        s.x + c * r,
        s.y + n * r,
        s.x - c * r * 0.5 - n * r * 0.6,
        s.y - n * r * 0.5 + c * r * 0.6,
        s.x - c * r * 0.5 + n * r * 0.6,
        s.y - n * r * 0.5 - c * r * 0.6,
      ]).fill({
        color: s.color,
        alpha: 1 - u * u,
      });
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i] as Burst;
      b.t += dt;
      const u = b.t / b.life;
      if (u >= 1) {
        this.bursts.splice(i, 1);
        continue;
      }
      // (A burst may start late: a negative age waits.)
      if (u < 0) continue;
      const ease = 1 - (1 - u) * (1 - u);
      if (b.kind === 'wave') {
        // The slam's wave (it costs a pip on the floor; a jump clears it): two fronts running out along the floor at
        // the sim's speed to its reach, each a bright crest over a red ridge, dust kicked up behind; fading at the end.
        const speed = tuning.oldBurrback.slamWaveSpeed * 60;
        const d = Math.min(b.r, speed * b.t);
        const end = Math.max(0, b.t - b.r / speed);
        const a = 1 - Math.min(1, end / SLAM_FX.fade);
        for (const sd of [-1, 1]) {
          const fx = b.x + sd * d;
          const H = SLAM_FX.crest;
          g.poly([fx + sd * 6, b.y, fx - sd * 14, b.y - H, fx - sd * 60, b.y]).fill({
            color: CREATURE.hunt,
            alpha: 0.75 * a,
          });
          g.moveTo(fx + sd * 6, b.y)
            .lineTo(fx - sd * 14, b.y - H)
            .stroke({ color: CREATURE.flash, width: 3, alpha: 0.95 * a });
          for (let k = 1; k <= 3; k++)
            g.circle(fx - sd * (30 + 22 * k), b.y - 6 - 5 * k, 4 + 2 * k).fill({
              color: 0x8a93a8,
              alpha: 0.35 * a,
            });
          g.moveTo(b.x, b.y - 1)
            .lineTo(fx, b.y - 1)
            .stroke({ color: CREATURE.hunt, width: 2, alpha: 0.3 * a });
        }
      } else if (b.kind === 'sweep') {
        // The heavy cut's sweep: a thick crescent about her, along the cut (`dir` = its angle), thinning out.
        const a0 = (b.dir ?? 0) - 1.1;
        const a1 = (b.dir ?? 0) + 1.1;
        const r = b.r * (0.8 + 0.3 * ease);
        g.moveTo(b.x + Math.cos(a0) * r, b.y + Math.sin(a0) * r)
          .arc(b.x, b.y, r, a0, a1)
          .stroke({ color: CREATURE.flash, width: 14 * (1 - u) + 2, alpha: 0.9 * (1 - u) });
        g.moveTo(b.x + Math.cos(a0) * r * 0.75, b.y + Math.sin(a0) * r * 0.75)
          .arc(b.x, b.y, r * 0.75, a0, a1)
          .stroke({ color: CREATURE.flash, width: 4 * (1 - u) + 1, alpha: 0.5 * (1 - u) });
      } else if (b.kind === 'sparks') {
        // Five sparks fanned back from the blade (straight up for a down cut), slowing and falling.
        const d = b.dir ?? 0;
        for (let k = 0; k < 5; k++) {
          const a =
            d === 0 ? -Math.PI / 2 + (k - 2) * 0.5 : (d > 0 ? 0 : Math.PI) + (k - 2) * 0.32 - d * 0.25;
          const dist = b.r * ease;
          const x0 = b.x + Math.cos(a) * dist;
          const y0 = b.y + Math.sin(a) * dist + 90 * b.t * b.t;
          g.moveTo(x0, y0)
            .lineTo(x0 - Math.cos(a) * 12 * (1 - u), y0 - Math.sin(a) * 12 * (1 - u))
            .stroke({ color: CREATURE.flash, width: 3, alpha: 1 - u });
        }
      } else if (b.kind === 'puff') {
        // Dust kicked up behind her feet as she is thrown back: three grey rounds drifting the recoil's way.
        const d = b.dir ?? 0;
        for (let k = 0; k < 3; k++) {
          const ox = d * (10 + 40 * ease) * (0.6 + 0.3 * k) - d * 8 * k;
          g.circle(
            b.x + ox,
            b.y - 6 - 14 * ease * (k % 2 ? 1 : 0.6),
            b.r * (0.5 + 0.5 * ease) * (1 - 0.2 * k),
          ).fill({
            color: 0x8a93a8,
            alpha: 0.4 * (1 - u),
          });
        }
      } else if (b.kind === 'ring') {
        g.circle(b.x, b.y, b.r + 70 * ease).stroke({
          color: CREATURE.flash,
          width: 4 * (1 - u) + 1,
          alpha: 0.85 * (1 - u),
        });
      } else {
        // A clang: an eight-point star, out fast and gone.
        const r = b.r * (0.75 + 0.5 * ease);
        const pts: number[] = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + 0.2;
          const rr = k % 2 === 0 ? r : r * 0.3;
          pts.push(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
        }
        g.poly(pts).fill({ color: CREATURE.flash, alpha: 1 - u * u });
      }
    }
  }
}
