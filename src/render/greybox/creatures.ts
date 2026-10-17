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
import type { SimEvent } from '../../sim/events';
import type { Scene } from '../../sim/scene';
import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { hash01 } from './moths';

/** Colours (memory/greybox.md "Creatures"). Bodies are mid tones: lighter than the solids, darker than her lights. */
export const CREATURE = {
  burrback: 0x7b6b5c,
  oldBurrback: 0x6c6358,
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
  kind: 'ring' | 'star' | 'puff' | 'sparks' | 'sweep';
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
    default:
      return CREATURE.other;
  }
}

const isFlyer = (k: string) => k === 'hawker' || k === 'lampwing';
const isCrawler = (k: string) => k === 'burrback' || k === 'oldBurrback' || k === 'juvenileBurrback';

export class CreatureView {
  private readonly fx = new Map<string, Fx>();
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
  draw(dt: number, clock: number, sim: SimView, back: Graphics, front: Graphics): void {
    this.herX = sim.player.cx;
    for (const f of this.fx.values()) {
      f.hitT += dt;
      f.dieT += dt;
      f.clangT += dt;
    }
    for (const e of sim.enemies) {
      if (e.kind === 'web') continue;
      const f = this.get(e.id);
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
      this.creature(e, f, sim, clock, back, front);
    }
    this.effects(dt, front);
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
    const tell = e.mode === 'curious' || e.mode === 'windup' || e.mode === 'feint' || e.mode === 'wake';
    const cx = e.x + e.w / 2;

    if (isFlyer(kind)) this.flyer(e, f, sim, clock, back, front, sq, white);
    else if (isCrawler(kind)) this.crawler(e, f, clock, back, front, sq, white);
    else if (kind === 'weaverBoss') {
      // The boss view draws its body (boss.ts); here only the answer to a blow.
      if (white) front.rect(e.x, e.y, e.w, e.h).fill({ color: CREATURE.flash, alpha: 0.9 });
    } else if (kind === 'dangler') this.dangler(e, clock, back, front, sq, white);
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
        front.rect(cx - w / 2, e.y - 24, w, 4).fill({ color: CREATURE.belly, alpha: 0.6 });
        front.rect(cx - w / 2, e.y - 24, (w * e.timer) / of, 4).fill({ color: CREATURE.open });
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
      if (b.kind === 'sweep') {
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
