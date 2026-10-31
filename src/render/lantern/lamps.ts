/**
 * Lanternroot's lamps, painted (docs/design/levels/proto-1.md §8, memory/lanternroot-art.md):
 *
 *  - **Warm lamps** (the firefly's: `wick`, `lantern`, `ring`, `great`): seed-pod lanterns, a Physalis calyx
 *    of papery ribs glowing from inside, hung on silk from whatever is above (or a dead twig in the open).
 *    Burning: translucent amber, darker at the silhouette (paper seen edge-on), a hot core, a halo, a point
 *    light, and moths circling it. Flung from: an ember, dull red, smoking. Out: the lace husk (a Physalis
 *    skeleton), swaying a little in the dark it leaves.
 *  - **Moonwicks** (`moonwick`): a pale glass bud on a knob of root or stone, a faint frost inside while
 *    cold. Kindled: a silver bloom, a cool flame, a big cool light; the last 2 s it gutters (a readable clock);
 *    a gust fans it (a flare); out, a breath of frost.
 *  - The fling's aim, painted: a ring of light tightening on the flame, a wedge of light along her aim, the
 *    flight as fading sparks to a soft ring where she lands.
 *  - The snuff: a flash, the paper torn, moths bursting out and streaming to the real moonlight (the room's
 *    `marks.moonholes`; else up): an honest tell for anyone who watches where they go.
 *
 * Render only: reads `sim.lures`, `sim.player`, events.
 */
import type { Container, Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { flameAt } from '../../sim/lures';
import type { Lure } from '../../sim/scene';
import { tuning } from '../../sim/tuning';
import type { CameraView, SimView } from '../contract';
import type { LightRegistry } from '../lights';
import { mix } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01, LR, ROOM_LAMPS, TRAP } from './config';
import type { GlowPool } from './glow';
import { keeperFake } from './keeper';
import { MothClouds, mothCount } from './moths';
import {
  along,
  pathLength,
  RELEASE,
  releaseDepart,
  releaseDrawn,
  releaseGreat,
  releasePath,
} from './release';

const AT = { x: 0, y: 0 };

interface LampInfo {
  /** A trap lamp (the Canopy r10, `Lure.trap`): a cage of glow, a dense cloud, fallen moths under it. */
  trap: boolean;
  /** The ground under it (where its dead moths lie), or null. */
  floorY: number | null;
  /** Where its thread is tied (null: hangs from a twig out of the dark above). */
  tieY: number | null;
  /** A moonwick standing on something: the ground under it (null: it hangs). */
  standY: number | null;
  size: number;
  moonwick: boolean;
  moths: number;
}

interface Fx {
  kind:
    | 'snuff'
    | 'kindle'
    | 'fan'
    | 'refuse'
    | 'cold'
    | 'launch'
    | 'snap'
    | 'relight'
    | 'crack'
    | 'guard'
    | 'rattle';
  x: number;
  y: number;
  t: number;
  life: number;
  i: number;
  /** A cage's rattle (`lureRefuse`): the side she is on (-1 west, 1 east). */
  side?: number;
}

interface Freed {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  tx: number;
  ty: number;
  seed: number;
  /** A trap's moth (the Canopy r10): seconds it flies with her before it streams off toward the moon (0 = none). */
  follow: number;
  /** A released moth (the Canopy r11, release.ts): its stream, when it leaves her, its orbit round her. */
  rel?: {
    s: Stream;
    depart: number;
    rx: number;
    ry: number;
    a0: number;
    spin: number;
    size: number;
    dx: number;
  };
}

/** A release's stream: the curve its moths follow toward the moon, fixed when the first one leaves her. */
interface Stream {
  moths: number;
  side: number;
  path: number[] | null;
  len: number;
  speed: number;
}

/** A cage bar bursting off a trap (release.ts): a bowed stroke flying out, turning and falling. */
interface Bar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  len: number;
  bow: number;
  age: number;
  /** The ground under the cage (null: none): a bar lands and lies there. */
  floor: number | null;
}

interface Scrap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
  s: number;
}

/** A lamp's housing size by kind (px across). */
function sizeOf(l: Lure): number {
  const k = l.kind as string;
  return k === 'lantern'
    ? 50
    : k === 'great' || k === 'greatWide' || k === 'gloam'
      ? 96
      : k === 'ring'
        ? 44
        : k === 'moonwick'
          ? 26
          : 38;
}

/** The outline of a Physalis calyx, top (stem) to bottom (tip), `s` across: [x, y] pairs round it. */
function calyx(x: number, y: number, s: number, squash: number, open: number): number[] {
  const h = s * 1.25 * squash;
  const pts: number[] = [];
  const n = 22;
  for (let k = 0; k <= n; k++) {
    // Right side, top to bottom.
    const t = k / n;
    const w = s * 0.5 * Math.sin(Math.PI * t ** 0.78) * (1 + 0.1 * Math.sin(Math.PI * 2 * t));
    pts.push(x + w, y - h * 0.45 + h * t);
  }
  // The tip: a little open on a husk (`open`), a point when whole.
  if (open > 0)
    pts.push(
      x + s * 0.12 * open,
      y + h * 0.5 - h * 0.06 * open,
      x - s * 0.12 * open,
      y + h * 0.5 - h * 0.06 * open,
    );
  for (let k = n; k >= 0; k--) {
    const t = k / n;
    const w = s * 0.5 * Math.sin(Math.PI * t ** 0.78) * (1 + 0.1 * Math.sin(Math.PI * 2 * t));
    pts.push(x - w, y - h * 0.45 + h * t);
  }
  return pts;
}

/** The ribs of a calyx: `n` meridians from the stem to the tip, bulging with the body. */
function ribs(g: Graphics, x: number, y: number, s: number, squash: number, k0: number, k1: number): void {
  const h = s * 1.25 * squash;
  for (let k = k0; k <= k1; k++) {
    const f = k / 2; // -1 .. 1 across
    g.moveTo(x, y - h * 0.45);
    g.bezierCurveTo(x + s * 0.55 * f, y - h * 0.2, x + s * 0.5 * f, y + h * 0.25, x, y + h * 0.55);
  }
}

/** The calyx's stem end: a small dark star of sepals and the stalk's knot. */
function sepals(g: Graphics, x: number, y: number, s: number): void {
  const r = s * 0.16;
  const pts: number[] = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI + (k / 9) * Math.PI;
    const rr = k % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + 2 + Math.sin(a) * rr * 0.6);
  }
  pts.push(x + r, y + 3, x - r, y + 3);
  g.poly(pts).fill(0x2a160c);
}

/** A small moth seen side on: body, a forewing and a hindwing that beat (`flap` 0..1), facing `dir`. */
export function moth(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  flap: number,
  dir: number,
  color: number,
  alpha: number,
): void {
  const up = -w * (0.25 + 0.95 * flap);
  g.poly([
    x - dir * w * 0.15,
    y,
    x - dir * w * 0.75,
    y + up,
    x + dir * w * 0.25,
    y + up * 0.8,
    x + dir * w * 0.35,
    y - w * 0.05,
  ]).fill({
    color,
    alpha,
  });
  g.poly([
    x - dir * w * 0.1,
    y + w * 0.05,
    x - dir * w * 0.55,
    y + w * 0.3 - up * 0.25,
    x + dir * w * 0.15,
    y + w * 0.2,
  ]).fill({
    color: mix(color, 0x000000, 0.25),
    alpha: alpha * 0.9,
  });
  g.ellipse(x, y + w * 0.05, w * 0.32, w * 0.11).fill({ color: mix(color, 0x000000, 0.45), alpha });
}

export class Lamps {
  private readonly info: LampInfo[] = [];
  private readonly fx: Fx[] = [];
  private readonly freed: Freed[] = [];
  private readonly scraps: Scrap[] = [];
  private readonly bars: Bar[] = [];
  /**
   * A cage knocked (the Canopy r16: a cut, or the Lamp pressed by it): it swings on its thread and settles, so every
   * try at it is answered. Per lamp: seconds since, the way it swings (-1 west, 1 east), how far (px).
   */
  private readonly jolt = new Map<number, { t: number; side: number; k: number }>();
  /** Lamps flung from and smouldering (by index). */
  private readonly embers = new Set<number>();
  /** Seconds since a lamp went out here (by index), for the husk's settle. */
  private readonly outT = new Map<number, number>();
  /** Cages the firefly just hung (`fireflyHang`, the Canopy r11): seconds since (by index). */
  private readonly hung = new Map<number, number>();
  /** Moonwick kindle blooms: seconds since (by index). */
  private readonly lit = new Map<number, number>();
  /**
   * Lures whose release another module draws (the den's great cage: keeper.ts's column up to the roof, the Canopy
   * r12): their bars still burst here, their moths do not swirl round her.
   */
  readonly handOff = new Set<string>();
  /** Point light ids this module registered last frame. */
  private readonly lightIds = new Set<string>();
  /** This room's lamps against the kind's (ROOM_LAMPS). */
  private readonly roomK: { size: number; light: number; moths: number };
  private readonly clouds: MothClouds;

  constructor(
    private readonly scene: SimView['scene'],
    private readonly lights: LightRegistry,
  ) {
    const lures = scene.lures ?? [];
    this.roomK = ROOM_LAMPS[scene.id] ?? { size: 1, light: 1, moths: 1 };
    for (const l of lures) {
      const moonwick = (l.kind as string) === 'moonwick';
      let tieY: number | null = null;
      let standY: number | null = null;
      // What is above the flame (its thread ties there), and for a moonwick what is just under it.
      const px = l.swing ? l.x : l.x;
      for (const s of scene.solids) {
        if (px < s.x || px > s.x + s.w) continue;
        const bottom = s.y + s.h;
        if (bottom <= l.y - 20 && l.y - bottom < 900 && (tieY === null || bottom > tieY)) tieY = bottom;
        if (s.y >= l.y && s.y - l.y < 90 && (standY === null || s.y < standY)) standY = s.y;
      }
      for (const o of scene.oneWays) {
        if (px < o.x || px > o.x + o.w) continue;
        if (o.y >= l.y && o.y - l.y < 90 && (standY === null || o.y < standY)) standY = o.y;
      }
      if (l.swing) tieY = l.y - l.swing.length;
      const k = l.kind as string;
      let floorY: number | null = null;
      for (const q of [...scene.solids, ...scene.oneWays])
        if (px >= q.x && px <= q.x + q.w && q.y > l.y && (floorY === null || q.y < floorY)) floorY = q.y;
      this.info.push({
        trap: l.trap === true,
        floorY,
        tieY,
        standY: moonwick ? standY : null,
        // (The great cage, release.ts: a trap of `RELEASE.great` moths or more hangs at nearly three times the size.)
        size:
          sizeOf(l) *
          (moonwick ? 1 : this.roomK.size) *
          (l.trap && releaseGreat(l.moths ?? 0) && sizeOf(l) < 60 ? 2.6 : 1) *
          (l.trap ? (TRAP.roomSize[scene.id] ?? 1) : 1),
        moonwick,
        moths: moonwick
          ? 0
          : k === 'lantern'
            ? LR.lamp.mothsLantern
            : k === 'great' || k === 'gloam'
              ? LR.lamp.mothsGreat
              : LR.lamp.mothsWick,
      });
    }
    // The clouds: every warm lamp's moths on the GPU (the firefly's own lamp draws the biggest).
    const canopy = scene.id.startsWith('cn-');
    this.clouds = new MothClouds(
      lures.map((l, i) => {
        const inf = this.info[i] as LampInfo;
        const firefly = l.id.includes('firefly');
        return {
          x: l.x,
          y: l.y,
          size: firefly ? 70 : inf.size,
          // (The Canopy r10: a trap holds a dense cloud; the firefly's springboards hold a few stragglers.)
          count: inf.moonwick
            ? 0
            : mothCount(
                firefly ? 70 : inf.size,
                (firefly ? 1.6 : 1) *
                  this.roomK.moths *
                  (inf.trap ? TRAP.cloud : canopy ? TRAP.springCloud : 1),
              ),
        };
      }),
      7,
    );
  }

  /** The moth clouds' meshes: behind the lamps in `back` (at `index`), in front of her in `front`. */
  attachClouds(back: Container, front: Container, index: number): void {
    this.clouds.attach(back, front, index);
  }

  onEvents(events: readonly SimEvent[], sim: SimView): void {
    const lures = sim.scene.lures ?? [];
    const idx = (id: string): number => lures.findIndex((l) => l.id === id);
    for (const e of events) {
      const ev = e as unknown as { type: string; id?: string; x: number; y: number; moths?: number };
      if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) {
        this.fx.length = 0;
        this.freed.length = 0;
        this.scraps.length = 0;
        this.bars.length = 0;
        this.jolt.clear();
        this.embers.clear();
        this.outT.clear();
        this.lit.clear();
        continue;
      }
      const i = ev.id !== undefined ? idx(ev.id) : -1;
      switch (ev.type) {
        case 'lureSnuff': {
          this.embers.delete(i);
          this.outT.set(i, 0);
          const trap = (ev as { trap?: boolean }).trap === true;
          this.fx.push({ kind: 'snuff', x: ev.x, y: ev.y, t: 0, life: trap ? 1.6 : 0.9, i });
          this.burst(ev.x, ev.y, ev.moths ?? 0, ev.id ?? '', sim, trap);
          break;
        }
        case 'lureHit':
          if (this.info[i]?.trap) {
            this.fx.push({ kind: 'crack', x: ev.x, y: ev.y, t: 0, life: 0.55, i });
            // (The Canopy r16, first-timer ft15fix: "no feedback". The cage swings off the blade and a bar falls to
            // the floor: the cut has done something, and two more will finish it.)
            const dir = (ev as { dir?: string }).dir;
            this.jolt.set(i, { t: 0, side: dir === 'fwd' ? sim.player.facing || 1 : 0, k: TRAP.joltCut });
            this.dropBar(i, ev.x, ev.y, sim.player.facing || 1);
            // (Review r10 #3: teach the cut.) A bar breaks; on the first cut one moth gets out through the gap: it
            // circles her and goes, the promise of what three cuts do (the sim's `escape`; read loosely).
            const h = ev as { hpLeft?: number; hpMax?: number; escape?: number };
            const first = h.escape !== undefined ? h.escape > 0 : (h.hpLeft ?? 0) === (h.hpMax ?? 0) - 1;
            if (first) this.escape(ev.x, ev.y, `${ev.id}:${h.hpLeft ?? 0}`);
          }
          break;
        case 'fireflyHang': {
          const j = idx((ev as { lure?: string }).lure ?? '');
          if (j >= 0) this.hung.set(j, 0);
          break;
        }
        case 'lureGuarded':
          // The great cage while its keeper lives: the blade glances off the bars (a hard flash, sparks thrown back).
          this.fx.push({ kind: 'guard', x: ev.x, y: ev.y, t: 0, life: 0.4, i });
          break;
        case 'lureEmber':
          this.embers.add(i);
          break;
        case 'lureRelight':
          this.embers.delete(i);
          this.outT.delete(i);
          // (The Canopy r16, first-timer ft15fix: "lamps relight after a few seconds; nothing told me". It catches:
          // a hot pop, a ring, sparks thrown up: a lamp that is back reads from across the screen.)
          this.fx.push({ kind: 'relight', x: ev.x, y: ev.y, t: 0, life: 0.9, i });
          break;
        case 'flingStart':
          this.fx.push({ kind: 'snap', x: ev.x, y: ev.y, t: 0, life: 0.35, i });
          break;
        case 'fling':
          this.fx.push({ kind: 'launch', x: ev.x, y: ev.y, t: 0, life: 0.32, i });
          break;
        case 'lureKindle':
          this.lit.set(i, 0);
          this.fx.push({ kind: 'kindle', x: ev.x, y: ev.y, t: 0, life: 0.7, i });
          break;
        case 'lureFan':
          this.fx.push({ kind: 'fan', x: ev.x, y: ev.y, t: 0, life: 0.5, i });
          break;
        case 'kindleRefuse':
          this.fx.push({ kind: 'refuse', x: ev.x, y: ev.y, t: 0, life: 0.45, i });
          break;
        case 'lureRefuse': {
          if (i < 0) break;
          // (The Canopy r16: the Lamp by a cage. Not like that: the moths throw themselves at the bars on her side, the
          // cage rattles toward her and settles; no fling.)
          const side = (ev as { side?: number }).side ?? 1;
          this.fx.push({ kind: 'rattle', x: ev.x, y: ev.y, t: 0, life: 0.7, i, side });
          this.jolt.set(i, { t: 0, side, k: TRAP.joltRefuse });
          break;
        }
        case 'lureCold':
          this.fx.push({ kind: 'cold', x: ev.x, y: ev.y, t: 0, life: 0.8, i });
          break;
      }
    }
  }

  /** Moths out of a snuffed lamp: they burst out, then stream to the nearest real moonlight. */
  private burst(x: number, y: number, n: number, id: string, sim: SimView, trap = false): void {
    const holes =
      (sim.scene.marks as { moonholes?: Array<{ x: number; y: number }> } | undefined)?.moonholes ?? [];
    let tx = x + (hash01(id, 7) - 0.5) * 300;
    let ty = y - 1400;
    let best = Number.POSITIVE_INFINITY;
    for (const h of holes) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < best) {
        best = d;
        tx = h.x;
        ty = h.y;
      }
    }
    if (trap) this.release(x, y, n, id, sim);
    const count = trap ? 0 : Math.min(LR.lamp.freedMax, Math.max(4, n));
    for (let k = 0; k < count; k++) {
      const a = hash01(id, k) * Math.PI * 2;
      const sp = 120 + 260 * hash01(id, k + 99);
      this.freed.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        age: -0.03 * k * hash01(id, k + 5),
        life: 3.6 + 2 * hash01(id, k + 31),
        tx: tx + (hash01(id, k + 13) - 0.5) * 160,
        ty: ty + (hash01(id, k + 17) - 0.5) * 120,
        seed: hash01(id, k + 61),
        // A trap's moths fly with her a while, each leaving at its own time, then stream off toward the moon.
        follow: trap ? TRAP.follow[0] + (TRAP.follow[1] - TRAP.follow[0]) * hash01(id, k + 71) : 0,
      });
      if (trap) {
        const m = this.freed[this.freed.length - 1] as Freed;
        m.life += m.follow;
      }
    }
    // Torn paper: a few scraps of the calyx thrown out.
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (hash01(id, k + 200) - 0.5) * 3;
      const sp = 140 + 160 * hash01(id, k + 201);
      this.scraps.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: hash01(id, k + 202) * 6,
        vr: (hash01(id, k + 203) - 0.5) * 18,
        age: 0,
        s: 4 + 5 * hash01(id, k + 204),
      });
    }
  }

  /**
   * A trap's release (release.ts): the cage's bars burst out and fall, twice its moths pour out, swirl round her
   * once and stream off toward the moon one after another.
   */
  private release(x: number, y: number, n: number, id: string, sim: SimView): void {
    const R = RELEASE;
    const great = releaseGreat(n);
    const drawn = releaseDrawn(n);
    const side = LOOK.moon ? Math.sign(LOOK.moon.x - 960) || 1 : -1;
    const s: Stream = { moths: n, side, path: null, len: 1, speed: great ? R.speedGreat : R.speed };
    const lures = sim.scene.lures ?? [];
    const li = lures.findIndex((l) => l.id === id);
    const scale = li >= 0 ? (this.info[li]?.size ?? 38) / 38 : 1;
    for (let k = 0; k < (this.handOff.has(id) ? 0 : drawn); k++) {
      const a = hash01(id, k) * Math.PI * 2;
      const sp = (160 + 320 * hash01(id, k + 99)) * (great ? 1.4 : 1);
      const seed = hash01(id, k + 61);
      this.freed.push({
        x: x + Math.cos(a) * 12 * scale,
        y: y + Math.sin(a) * 12 * scale,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        // (They pour out over the first third of the burst, not all on one frame.)
        age: -0.18 * hash01(id, k + 5),
        life: 99,
        tx: x,
        ty: y,
        seed,
        follow: 0,
        rel: {
          s,
          depart: releaseDepart(k, drawn, n),
          rx: (70 + 120 * hash01(id, k + 7)) * (great ? 1.8 : 1),
          ry: (40 + 80 * hash01(id, k + 8)) * (great ? 1.6 : 1),
          a0: a,
          spin: (hash01(id, k + 9) < 0.5 ? -1 : 1) * (0.85 + 0.3 * hash01(id, k + 10)),
          size: R.size[0] + (R.size[1] - R.size[0]) * hash01(id, k + 11),
          dx: (hash01(id, k + 12) - 0.5) * 2,
        },
      });
    }
    // The bars: every one left burst outward, turning, and falls.
    const T = TRAP;
    const cw = T.cageW * 38 * scale;
    const ch = T.cageH * 38 * scale;
    const nb = T.bars + (great ? 9 : 0);
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2 + hash01(id, k + 400);
      const out = R.barOut[0] + (R.barOut[1] - R.barOut[0]) * hash01(id, k + 401);
      this.bars.push({
        x: x + Math.sin(a) * cw,
        y: y + (hash01(id, k + 402) - 0.5) * ch * 0.6,
        vx: Math.sin(a) * out * (great ? 1.3 : 1),
        vy: -Math.abs(Math.cos(a)) * out * 0.6 - 120,
        rot: (hash01(id, k + 403) - 0.5) * 0.6,
        vr: (hash01(id, k + 404) - 0.5) * 9,
        len: ch * (1.5 + 0.4 * hash01(id, k + 405)),
        bow: cw * 0.35 * (hash01(id, k + 406) < 0.5 ? -1 : 1),
        age: 0,
        floor: li >= 0 ? (this.info[li]?.floorY ?? null) : null,
      });
    }
  }

  /** One bar off a cut cage (the Canopy r16): it springs off the blade's side, turns and lies on the floor under it. */
  private dropBar(i: number, x: number, y: number, side: number): void {
    const info = this.info[i];
    const s = (info?.size ?? 38) / 38;
    const key = `bar${i}:${this.bars.length}:${Math.round(x)}`;
    this.bars.push({
      x: x + side * TRAP.cageW * 30 * s,
      y,
      vx: side * (90 + 60 * hash01(key, 1)),
      vy: -140 - 60 * hash01(key, 2),
      rot: (hash01(key, 3) - 0.5) * 0.6,
      vr: side * (5 + 4 * hash01(key, 4)),
      len: TRAP.cageH * 38 * s * 1.5,
      bow: TRAP.cageW * 38 * s * 0.35 * side,
      age: 0,
      floor: info?.floorY ?? null,
    });
  }

  /** One moth out through a broken bar (a cut on a trap): it circles her a while, then goes to the moon. */
  private escape(x: number, y: number, key: string): void {
    this.freed.push({
      x,
      y,
      vx: (hash01(key, 1) - 0.5) * 300,
      vy: -160,
      age: 0.05,
      life: 2.6 + 4,
      tx: x,
      ty: y - 200,
      seed: hash01(key, 2),
      follow: 2.6,
    });
  }

  /** Draws every lamp: threads and housings in `back` (behind her), moths, sparks and the aim in `front`. */
  draw(
    dt: number,
    clock: number,
    sim: SimView,
    cam: CameraView,
    back: Graphics,
    front: Graphics,
    glow: GlowPool,
    mid: GlowPool,
    glowFront: GlowPool,
  ): void {
    const lures = sim.scene.lures ?? [];
    const p = sim.player;
    const f = sim.frame - 2 + sim.alpha;
    for (const [i, t] of this.outT) this.outT.set(i, t + dt);
    for (const [i, t] of this.lit) this.lit.set(i, t + dt);
    for (const [i, t] of this.hung) if (t > 3) this.hung.delete(i);
    for (const [i, t] of this.hung) this.hung.set(i, t + dt);
    for (const [i, j] of this.jolt) {
      j.t += dt;
      if (j.t > 2.5) this.jolt.delete(i);
    }
    const halfW = cam.w / 2 / cam.zoom + 200;
    const halfH = cam.h / 2 / cam.zoom + 200;
    const cands: Array<{ i: number; d: number; x: number; y: number; r: number; c: number; k: number }> = [];
    const fling = (p as unknown as { fling?: number }).fling ?? -1;
    for (let i = 0; i < lures.length; i++) {
      const l = lures[i] as Lure;
      const info = this.info[i] as LampInfo;
      const at = flameAt(sim.lures, i, l, f, tuning, AT);
      if (this.handOff.has(l.id)) keeperFake(at, clock, l, info.floorY ?? l.y + 600);
      // (A knocked cage swings on its thread: a damped pendulum from where it hangs, lifting a little at the ends.)
      const jo = this.jolt.get(i);
      const sw = jo ? Math.exp(-jo.t * TRAP.joltDamp) * Math.sin(jo.t * TRAP.joltRate) : 0;
      const jx = jo ? jo.k * (jo.side === 0 ? 0.35 : jo.side) * sw : 0;
      const hangX = at.x;
      const x = at.x + jx;
      const y = at.y - Math.abs(jx) * 0.12 - (jo && jo.side === 0 ? jo.k * 0.5 * Math.max(0, sw) : 0);
      if (Math.abs(x - cam.x) > halfW + 400 || Math.abs(y - cam.y) > halfH + 400) continue;
      const hp = sim.lures.hp[i] ?? 0;
      const burning = hp > 0;
      // A cage the firefly has not hung yet (`after` a flag not saved, never put out): nothing is there.
      if (!burning && l.after && info.trap && !sim.save.snuffed.includes(`${sim.scene.id}:${l.id}`)) {
        this.clouds.set(i, x, y, false, dt);
        continue;
      }
      if (!info.moonwick) this.clouds.set(i, x, y, burning && !this.embers.has(i), dt);
      // (The Keeper's cage, the Canopy r12: its cloud thins as the moths are eaten or saved, `boss.left` of them.)
      const kb = sim.boss as unknown as {
        left?: number;
        swingT?: number;
        pivotX?: number;
        pivotY?: number;
      } | null;
      const keeps = info.trap && sim.scene.boss?.heart === l.id && kb && typeof kb.left === 'number';
      if (keeps)
        this.clouds.keep(i, Math.max(0, Math.min(1, (kb.left as number) / Math.max(1, l.moths ?? 1))));
      // (A cage filling in front of her, the Canopy r13 moment 5: its cloud is the moths caught so far.)
      const filling = (sim.lures as { fill?: number[] }).fill?.[i];
      if (!keeps && info.trap && typeof filling === 'number' && filling >= 0)
        this.clouds.keep(i, Math.max(0, Math.min(1, filling / Math.max(1, l.moths ?? 1))));
      // Just hung: it grows into its size as the firefly lets it down (eased, a little overshoot).
      const ht = this.hung.get(i);
      const grow = ht === undefined ? 1 : Math.min(1, ht / 0.9);
      const s =
        info.size *
        (ht === undefined ? 1 : 0.25 + 0.75 * (1 - (1 - grow) ** 3) + 0.06 * Math.sin(grow * Math.PI));
      const flick = 1 + 0.07 * Math.sin(clock * 9.1 + i * 1.7) + 0.05 * Math.sin(clock * 23.3 + i);
      if (info.moonwick) {
        this.drawWick(i, l, x, y, info, burning, clock, sim, back, glow, cands, cam);
        continue;
      }
      // The cache's centrepiece: the firefly's own lamp, a jar with a firefly made of glass in it.
      if (l.id.includes('firefly')) {
        // Hung on three silk lines from the vault.
        const tieY = info.tieY ?? y - 900;
        for (const dx of [-20, 0, 20]) back.moveTo(x + dx * 3, tieY).lineTo(x + dx * 0.4, y - 56);
        back.stroke({ color: LR.lamp.silk, width: 1.2, alpha: 0.5 });
        this.drawFirefly(i, x, y, burning, this.embers.has(i), clock, back, glow, mid);
        if (burning) {
          cands.push({ i, d: 0, x, y, r: 520, c: LR.lamp.lightColor, k: flick });
        }
        if (fling === i) this.aim(x, y, 60, clock, sim, front, glowFront);
        continue;
      }
      // A trap's dead: moths that circled until they fell, lying under it (the stakes are real; they stay).
      if (info.trap && info.floorY !== null) this.fallen(i, x, info.floorY, back);
      // The thread it hangs by (a swinging lamp's runs from its pivot).
      const topY = y - s * 0.62;
      let tieX = l.swing ? l.x : hangX;
      let tieY = info.tieY ?? y - 900;
      // Swinging (the Keeper's P2, the sim's `swingT`): a pendulum from the roof over where it hung.
      if (keeps && (kb.swingT ?? -1) >= 0) tieX = l.x;
      // On the floor (ripped down, P3): no thread; it lies on its side.
      const down = info.floorY !== null && y > info.floorY - s * 1.6 && info.trap;
      if (down) tieY = topY;
      const thread = burning ? LR.lamp.silk : mix(LR.lamp.silk, 0x000000, 0.4);
      back
        .moveTo(tieX, tieY)
        .quadraticCurveTo((tieX + x) / 2 + 4 * Math.sin(clock * 0.7 + i), (tieY + topY) / 2, x, topY);
      back.stroke({ color: thread, width: 1.4, alpha: info.tieY === null ? 0.3 : 0.6 });
      if (info.tieY === null) {
        // No solid above: a dead twig out of the dark holds it.
        back
          .moveTo(tieX - 40, tieY - 10)
          .lineTo(tieX + 30, tieY + 6)
          .stroke({ color: 0x0a0c10, width: 5, cap: 'round' });
      }
      // The stem knot on top.
      back.circle(x, topY + 2, 2.6).fill(0x2a1a10);
      const ember = this.embers.has(i);
      const squash = 1 + 0.03 * Math.sin(clock * 1.3 + i);
      if (burning && !ember) {
        // Translucent paper lit from inside: the edge (seen at a graze) darkest, the middle the hottest, in soft
        // steps; the ribs over it; a luminous heart laid on top (additive).
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          const col =
            t < 0.5
              ? mix(LR.lamp.paperEdge, LR.lamp.paper, t * 2)
              : mix(LR.lamp.paper, LR.lamp.paperHot, (t - 0.5) * 2);
          back
            .poly(calyx(x, y + s * 0.07 * t, s * (1 - 0.66 * t), squash * (1 - 0.12 * t), 0))
            .fill({ color: col, alpha: k === 0 ? 1 : 0.55 });
        }
        ribs(back, x, y, s, squash, -2, 2);
        back.stroke({ color: LR.lamp.rib, width: 1.2, alpha: 0.5 });
        ribs(back, x, y, s * 1.04, squash, -2, -2);
        ribs(back, x, y, s * 1.04, squash, 2, 2);
        back.stroke({ color: LR.lamp.rib, width: 1.6, alpha: 0.35 });
        sepals(back, x, y - s * 1.25 * squash * 0.45, s);
        if (info.trap) this.cage(i, x, y, s, hp, clock, back, glow, down ? TRAP.flank : 0);
        mid.add(x, y + s * 0.12, s * 0.5 * flick, LR.lamp.core, 0.55 * flick, s * 0.62 * flick);
        // The halo (bloom carries it further).
        glow.add(x, y, s * 2.4 * flick, LR.lamp.halo, 0.3);
        // A room whose lamps are its picture (ROOM_LAMPS): their warmth washes the wood round them.
        if (this.roomK.light > 1)
          glow.add(x, y + 60, 520 * this.roomK.light * 0.5, LR.lamp.halo, 0.1 * flick, 420);
        cands.push({
          i,
          d: Math.hypot(x - cam.x, y - cam.y),
          x,
          y,
          r: (LR.lamp.light[l.kind as 'wick'] ?? 300) * this.roomK.light,
          c: LR.lamp.lightColor,
          k: flick,
        });
      } else if (ember) {
        const fk = 0.6 + 0.4 * Math.sin(clock * 11 + i) * Math.sin(clock * 3.1 + i);
        back.poly(calyx(x, y, s, squash, 0)).fill({ color: 0x24120c });
        back
          .poly(calyx(x, y + s * 0.06, s * 0.55, squash, 0))
          .fill({ color: LR.lamp.ember, alpha: 0.5 + 0.4 * fk });
        ribs(back, x, y, s, squash, -2, 2);
        back.stroke({ color: 0x120806, width: 1.3, alpha: 0.7 });
        glow.add(x, y, s * 1.3, LR.lamp.ember, 0.3 * fk);
        cands.push({ i, d: Math.hypot(x - cam.x, y - cam.y), x, y, r: 120, c: 0xc0502a, k: 0.5 * fk });
        // Smoke curling up off it.
        for (let k = 0; k < 4; k++) {
          const u = (clock * 0.55 + k / 4 + i * 0.13) % 1;
          front
            .circle(x + Math.sin(clock * 1.7 + k * 2) * 7 * u, y - s * 0.6 - u * 70, 3 + 9 * u)
            .fill({ color: LR.lamp.smoke, alpha: 0.22 * (1 - u) });
        }
      } else {
        // The husk: a Physalis skeleton, lace over the dark, a little open at the tip. It settles after it goes out.
        const t = this.outT.get(i) ?? 10;
        const sway = Math.exp(-t * 1.5) * Math.sin(t * 9) * 0.18 + 0.03 * Math.sin(clock * 0.9 + i);
        const hx = x + sway * s;
        back.poly(calyx(hx, y, s * 0.96, 1, 1)).fill({ color: LR.lamp.husk, alpha: 0.5 });
        ribs(back, hx, y, s * 0.96, 1, -2, 2);
        back.stroke({ color: LR.lamp.lace, width: 1.2, alpha: 0.6 });
        // The lace between the ribs.
        for (let k = 1; k < 5; k++) {
          const yy = y - s * 0.4 + (k * s * 1.1) / 5;
          const w = s * 0.42 * Math.sin((Math.PI * k) / 5);
          back.moveTo(hx - w, yy).quadraticCurveTo(hx, yy + 3, hx + w, yy);
        }
        back.stroke({ color: LR.lamp.lace, width: 0.8, alpha: 0.35 });
      }
      // Aiming off this flame: the painted aim.
      if (fling === i) this.aim(x, y, s, clock, sim, front, glowFront);
    }
    this.clouds.update(clock);
    this.light(cands);
    this.drawFx(dt, front, glowFront);
    this.drawFreed(dt, clock, front, glowFront, sim);
  }

  /**
   * A trap's cage of glow: warm bars bowed round the lamp like a lantern's frame, meeting in a ring over it and a
   * knot under it, breathing with the moths' circling. Each cut breaks a bar (`hp` of `trapHp`), and the cage
   * shudders (`crack`).
   */
  private cage(
    i: number,
    x: number,
    y: number,
    s: number,
    hp: number,
    clock: number,
    g: Graphics,
    glow: GlowPool,
    /** On the floor (the Keeper's P3, canopy review r12 #4): turned onto its flank by this much, the bars on the
     *  spill side (up, once it lies) bent open and snapped, the rest crushed flatter against the floor. */
    flank = 0,
  ): void {
    const T = TRAP;
    const hpMax = Math.max(1, Math.round(tuning.lures.trapHp));
    const ca = Math.cos(flank);
    const sa = Math.sin(flank);
    // The cage's own frame (dx across, dy down) turned onto its flank about the flame.
    const R = (dx: number, dy: number): [number, number] => [x + dx * ca - dy * sa, y + dx * sa + dy * ca];
    // (Review r10 #3: one bar a cut, and one moth out through it; the rest burst on the last.)
    const broken = Math.min(T.bars, Math.max(0, hpMax - hp));
    const shake = this.fx.some((f) => f.kind === 'crack' && f.i === i) ? Math.sin(clock * 60) * 3 : 0;
    const rx = s * T.cageW;
    const ry = s * T.cageH;
    const top = -ry * 0.95;
    const bot = ry * 0.9;
    const down = flank !== 0;
    // (Fallen, it no longer turns: the bars lie where they broke.)
    const breath = down ? 1 : 1 + 0.03 * Math.sin(clock * 2.1 + i);
    const spin = down ? 0.4 : clock * 0.25 + i;
    for (let k = 0; k < T.bars; k++) {
      // Bars at their angle round the cage (front ones brighter); the broken ones are the last ones round.
      if (k >= T.bars - broken) continue;
      const a = (k / T.bars) * Math.PI * 2 + spin;
      let f = Math.sin(a);
      const front = 0.5 + 0.5 * Math.cos(a);
      // On its flank: the bars on the up side (`f` < 0 once turned) wrenched open, outward and snapped short; the
      // floor side flattened.
      const open = down && f * Math.sign(flank) < -0.2;
      if (down && !open) f *= 0.8;
      const bx = f * rx * breath * (open ? 1.7 : 1) + shake;
      const end = open ? 0.55 + 0.25 * hash01(`cb${i}`, k) : 1;
      const [x0, y0] = R(shake * 0.5, top);
      const [c1x, c1y] = R(bx, top + ry * 0.25);
      const [c2x, c2y] = R(bx * (open ? 1.25 : 1), top + (bot - top) * end - ry * 0.3 * end);
      const [ex, ey] = open ? R(bx * 1.35, top + (bot - top) * end) : R(0, bot);
      g.moveTo(x0, y0).bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
      g.stroke({ color: T.bar, width: 1 + 1.2 * front, alpha: 0.2 + 0.45 * front });
    }
    const [tx, ty] = R(0, top);
    g.ellipse(tx, ty, rx * 0.22 * (down ? 0.5 : 1), rx * 0.07 * (down ? 3 : 1)).stroke({
      color: T.bar,
      width: 1.6,
      alpha: 0.55,
    });
    const [kx, ky] = R(0, bot);
    g.circle(kx, ky, 3).fill({ color: T.bar, alpha: 0.6 });
    glow.add(x, y, Math.max(rx, ry) * 1.3, T.glow, 0.12 + 0.03 * Math.sin(clock * 2.1 + i));
  }

  /** Dead moths on the ground under a trap: pale wings spread or folded, a few. */
  private fallen(i: number, x: number, fy: number, g: Graphics): void {
    for (let k = 0; k < TRAP.fallen; k++) {
      const h = hash01(`fallen${i}`, k);
      const fx = x + (h - 0.5) * 150 + (hash01(`fallen${i}`, k + 40) - 0.5) * 40;
      const w = 6 + 4 * hash01(`fallen${i}`, k + 9);
      const rot = (hash01(`fallen${i}`, k + 17) - 0.5) * 1.2;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const P = (px: number, py: number): [number, number] => [
        fx + px * c - py * sn,
        fy - 1.5 + px * sn + py * c,
      ];
      const wing = (d: number): number[] => [
        ...P(0, 0),
        ...P(d * w * 1.2, -w * 0.35),
        ...P(d * w * 0.9, w * 0.35),
      ];
      g.poly(wing(-1)).fill({ color: TRAP.dead, alpha: 0.7 });
      g.poly(wing(1)).fill({ color: TRAP.dead, alpha: 0.7 });
      g.ellipse(fx, fy - 1.5, w * 0.35, w * 0.12).fill({ color: 0x2a2018, alpha: 0.8 });
    }
  }

  private drawWick(
    i: number,
    l: Lure,
    x: number,
    y: number,
    info: LampInfo,
    burning: boolean,
    clock: number,
    sim: SimView,
    back: Graphics,
    glow: GlowPool,
    cands: Array<{ i: number; d: number; x: number; y: number; r: number; c: number; k: number }>,
    cam: CameraView,
  ): void {
    const s = info.size;
    const W = LR.wick;
    const burn = (sim.lures as { burn?: readonly number[] }).burn?.[i] ?? 0;
    // Guttering: its last `gutter` frames flicker (a readable clock), deeper and faster toward the end.
    const gutter = burning && burn > 0 && burn < W.gutterFrames;
    const g = gutter ? burn / W.gutterFrames : 1;
    const flick = gutter
      ? 0.55 + 0.45 * Math.max(0, Math.sin(clock * (14 + (1 - g) * 22) + i)) * (0.6 + 0.4 * g)
      : 1 + 0.04 * Math.sin(clock * 3.1 + i);
    // What it stands on (a knob of root or stone), or the silk it hangs by.
    if (info.standY !== null) {
      const sy = info.standY;
      back.poly([x - 13, sy + 2, x - 7, y + s * 0.5, x + 7, y + s * 0.5, x + 15, sy + 2]).fill(W.stand);
      back.ellipse(x, sy, 18, 5).fill(W.stand);
      back
        .moveTo(x - 6, y + s * 0.55)
        .lineTo(x + 6, y + s * 0.55)
        .stroke({ color: W.standLit, width: 2, alpha: 0.6 });
    } else {
      const tieY = info.tieY ?? y - 200;
      back
        .moveTo(x, tieY)
        .lineTo(x, y - s * 0.7)
        .stroke({ color: W.silk, width: 1.2, alpha: 0.45 });
    }
    // The bud: a glass teardrop, point up.
    const bud: number[] = [];
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const r = s * 0.5 * (1 - 0.32 * Math.max(0, -Math.sin(a)) ** 1.6);
      bud.push(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * (Math.sin(a) < 0 ? 1.35 : 1));
    }
    const bloom = this.lit.get(i);
    const b = bloom === undefined ? 0 : Math.max(0, 1 - bloom / 0.6);
    if (burning) {
      back.poly(bud).fill({ color: W.glassLit, alpha: 0.85 });
      back.ellipse(x, y + 1, s * 0.22 * flick, s * 0.34 * flick).fill({ color: W.flame, alpha: 0.95 });
      back.ellipse(x - s * 0.17, y - s * 0.12, 1.6, s * 0.22).fill({ color: 0xffffff, alpha: 0.6 });
      glow.add(x, y, s * 3.4 * flick + b * 120, W.halo, 0.5 * flick + b * 0.5);
      glow.add(x, y, s * 1.1, W.flame, 0.55 * flick);
      // Its silver light as a filled pool over its whole reach (the shield she stands in), brightest near the bud
      // and fading to nothing at the edge: never a ring.
      glow.add(x, y, W.light * 0.95, W.halo, 0.07 * flick + b * 0.08);
      glow.add(x, y, W.light * 0.55, W.halo, 0.1 * flick + b * 0.1);
      cands.push({
        i,
        d: Math.hypot(x - cam.x, y - cam.y),
        x,
        y,
        r: W.light,
        c: W.lightColor,
        k: W.lightK * flick * (1 + b),
      });
      if (burn < 0) {
        // Burning for good: a slow, steady breath.
        glow.add(x, y, s * 5, W.halo, 0.08 + 0.03 * Math.sin(clock * 0.8 + i));
      }
    } else {
      // Cold glass: mostly the dark behind it, a pale edge where it curves away, a frosted core.
      back.poly(bud).fill({ color: W.glass, alpha: 0.38 });
      back.poly(bud).stroke({ color: W.frost, width: 1.2, alpha: 0.45 });
      // Frost inside: a dim core and a few crystal ticks.
      back.ellipse(x, y + 2, s * 0.16, s * 0.24).fill({ color: W.frost, alpha: 0.35 });
      back.ellipse(x - s * 0.16, y - s * 0.1, 1.4, s * 0.2).fill({ color: 0xdfe8f2, alpha: 0.35 });
      // Now and then a cold glint runs over the glass.
      const gl = Math.max(0, Math.sin(clock * 0.7 + i * 2.3)) ** 24;
      glow.add(x - s * 0.1, y - s * 0.15, s * 0.6, 0xdfeaff, 0.25 * gl + 0.04);
    }
    void l;
  }

  /**
   * The firefly-lamp (the cache): a tall jar on a root foot, its glass catching the light; inside, a firefly made of
   * glass, wings folded, its tail the lamp. Out, the jar dark and the firefly a cold husk: the marsh's reveal, early.
   */
  private drawFirefly(
    i: number,
    x: number,
    y: number,
    burning: boolean,
    ember: boolean,
    clock: number,
    g: Graphics,
    glow: GlowPool,
    mid: GlowPool,
  ): void {
    const W = 64;
    const H = 96;
    const flick = 1 + 0.05 * Math.sin(clock * 5.3 + i) + 0.03 * Math.sin(clock * 11 + i);
    // The jar: shoulders, a stopper, a pale edge where the glass curves away.
    const jar: number[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const w = W * 0.5 * (t < 0.12 ? 0.55 + 3 * t : 1 - 0.12 * (t - 0.12));
      jar.push(x + w, y - H * 0.5 + H * t);
    }
    for (let k = 24; k >= 0; k--) {
      const t = k / 24;
      const w = W * 0.5 * (t < 0.12 ? 0.55 + 3 * t : 1 - 0.12 * (t - 0.12));
      jar.push(x - w, y - H * 0.5 + H * t);
    }
    const lit = burning && !ember;
    g.poly(jar).fill({ color: lit ? 0x3a2410 : 0x14100c, alpha: 0.55 });
    // The firefly inside: head, thorax, folded wings, the tail.
    const fx = x;
    const fy = y + 4;
    g.ellipse(fx, fy - 26, 7, 6).fill(0x1a120c);
    g.ellipse(fx, fy - 14, 9, 10).fill(0x241810);
    g.poly([fx - 2, fy - 20, fx - 16, fy + 6, fx - 6, fy + 10]).fill({ color: 0x5a4a38, alpha: 0.8 });
    g.poly([fx + 2, fy - 20, fx + 16, fy + 6, fx + 6, fy + 10]).fill({ color: 0x5a4a38, alpha: 0.8 });
    g.moveTo(fx - 3, fy - 31).quadraticCurveTo(fx - 10, fy - 44, fx - 16, fy - 42);
    g.moveTo(fx + 3, fy - 31).quadraticCurveTo(fx + 10, fy - 44, fx + 16, fy - 42);
    g.stroke({ color: 0x241810, width: 1.4 });
    const tail = lit ? 0xffd27a : ember ? LR.lamp.ember : 0x3a3024;
    g.ellipse(fx, fy + 14, 10, 15).fill(tail);
    if (lit) {
      g.ellipse(fx, fy + 16, 5 * flick, 8 * flick).fill({ color: LR.lamp.core, alpha: 0.95 });
      mid.add(fx, fy + 14, 22 * flick, 0xffe0a0, 0.6);
      glow.add(x, y, 180 * flick, LR.lamp.halo, 0.32);
    } else if (ember) glow.add(fx, fy + 14, 30, LR.lamp.ember, 0.3);
    // Glass: the edge and a long highlight, the stopper and its root foot.
    g.poly(jar).stroke({ color: lit ? 0xffd8a0 : 0x6a6458, width: 1.4, alpha: lit ? 0.55 : 0.35 });
    g.roundRect(x - W * 0.2, y - H * 0.5 - 8, W * 0.4, 10, 3).fill(0x2a1a10);
    g.moveTo(x + W * 0.3, y - H * 0.3).quadraticCurveTo(x + W * 0.38, y, x + W * 0.32, y + H * 0.3);
    g.stroke({ color: 0xffffff, width: 2, alpha: lit ? 0.35 : 0.15 });
    g.poly([
      x - W * 0.45,
      y + H * 0.5,
      x + W * 0.45,
      y + H * 0.5,
      x + W * 0.3,
      y + H * 0.5 + 16,
      x - W * 0.3,
      y + H * 0.5 + 16,
    ]).fill(0x1a120c);
  }

  /** Point lights for the nearest lamps (the playfield is lit through post's light map: ≤ 12 on screen). */
  private light(
    cands: Array<{ i: number; d: number; x: number; y: number; r: number; c: number; k: number }>,
  ): void {
    cands.sort((a, b) => a.d - b.d);
    const keep = new Set<string>();
    for (const c of cands.slice(0, LR.lamp.maxLights)) {
      const id = `lr-lamp-${c.i}`;
      keep.add(id);
      const l = this.lights.get(id);
      if (l) {
        l.x = c.x;
        l.y = c.y;
        l.radius = c.r;
        l.color = c.c;
        l.intensity = c.k;
      } else this.lights.set(id, { x: c.x, y: c.y, radius: c.r, color: c.c, intensity: c.k });
    }
    for (const id of this.lightIds) if (!keep.has(id)) this.lights.remove(id);
    this.lightIds.clear();
    for (const id of keep) this.lightIds.add(id);
  }

  /** The fling's aim, painted: a ring of light tightening on the flame, a wedge along her aim, the flight. */
  private aim(
    x: number,
    y: number,
    s: number,
    clock: number,
    sim: SimView,
    front: Graphics,
    glow: GlowPool,
  ): void {
    const p = sim.player;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 12);
    const r = s * 1.4 + 8 * pulse;
    front.circle(x, y, r).stroke({ color: LR.aim.ring, width: 2.5, alpha: 0.85 });
    glow.add(x, y, r * 1.5, LR.aim.glow, 0.25);
    const ax = p.lureAimX;
    const ay = p.lureAimY;
    const a0 = r + 6;
    const a1 = r + 90;
    // A wedge of light, wide at the flame and pointed at the end.
    front
      .poly([
        x + ax * a0 - ay * 7,
        y + ay * a0 + ax * 7,
        x + ax * a1,
        y + ay * a1,
        x + ax * a0 + ay * 7,
        y + ay * a0 - ax * 7,
      ])
      .fill({ color: LR.aim.ring, alpha: 0.85 });
    const arc = p.lureArc;
    const n = arc.length >> 1;
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const px = arc[k * 2] as number;
      const py = arc[k * 2 + 1] as number;
      front.circle(px, py, 2.6 + 1.2 * (1 - u)).fill({ color: LR.aim.dot, alpha: 0.9 * (1 - 0.6 * u) });
      if (k % 3 === 0) glow.add(px, py, 14, LR.aim.glow, 0.25 * (1 - u));
    }
    if (n > 1) {
      const ex = arc[(n - 1) * 2] as number;
      const ey = arc[(n - 1) * 2 + 1] as number;
      front.ellipse(ex, ey, 16, 6).stroke({ color: LR.aim.ring, width: 2, alpha: 0.75 });
      glow.add(ex, ey, 40, LR.aim.glow, 0.3);
    }
  }

  private drawFx(dt: number, front: Graphics, glow: GlowPool): void {
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const f = this.fx[k] as Fx;
      f.t += dt;
      const u = f.t / f.life;
      if (u >= 1) {
        this.fx.splice(k, 1);
        continue;
      }
      const e = 1 - (1 - u) * (1 - u);
      if (f.kind === 'snuff') {
        // The light leaves it in one breath: a brief hot core, the warm swelling out and fading, a thin ring of
        // it running out (the moths' burst is the loud part).
        if (u < 0.1) glow.add(f.x, f.y, 60 + 200 * u, 0xfff0d0, 0.7 * (1 - u / 0.1));
        glow.add(f.x, f.y, 70 + 200 * e, LR.lamp.halo, 0.32 * (1 - u) * (1 - u));
        front
          .circle(f.x, f.y, 24 + 230 * e)
          .stroke({ color: LR.lamp.paperHot, width: 1.6, alpha: 0.5 * (1 - u) * (1 - u) });
      } else if (f.kind === 'kindle') {
        // A silver bloom: a soft swell of light out of the bud, a faint ring running out ahead of it.
        glow.add(f.x, f.y, 40 + 260 * e, LR.wick.halo, 0.45 * (1 - u) * (1 - u));
        glow.add(f.x, f.y, 30, 0xffffff, 0.6 * (1 - u));
        front.circle(f.x, f.y, 20 + 200 * e).stroke({ color: 0xeaf4ff, width: 1.2, alpha: 0.35 * (1 - u) });
      } else if (f.kind === 'fan') {
        glow.add(f.x, f.y, 80 + 140 * e, LR.wick.halo, 0.55 * (1 - u));
      } else if (f.kind === 'refuse') {
        // One dim flicker, nothing more (no text: proto-1 §3).
        glow.add(f.x, f.y, 36, LR.wick.halo, 0.35 * Math.sin(Math.PI * u));
      } else if (f.kind === 'cold') {
        for (let j = 0; j < 5; j++) {
          const a = -Math.PI / 2 + (j - 2) * 0.4;
          front
            .circle(f.x + Math.cos(a) * 30 * e, f.y + Math.sin(a) * 40 * e, 3 + 5 * u)
            .fill({ color: 0xcfe0f0, alpha: 0.3 * (1 - u) });
        }
      } else if (f.kind === 'snap') {
        front
          .circle(f.x, f.y, 90 * (1 - e) + 20)
          .stroke({ color: LR.aim.ring, width: 2.5, alpha: 0.8 * (1 - u) });
      } else if (f.kind === 'launch') {
        glow.add(f.x, f.y, 60 + 90 * e, LR.aim.glow, 0.6 * (1 - u));
      } else if (f.kind === 'relight') {
        glow.add(f.x, f.y, 40 + 110 * e, LR.lamp.halo, 0.75 * (1 - u));
        if (u < 0.15) glow.add(f.x, f.y, 30 + 120 * u, 0xfff0d0, 0.9 * (1 - u / 0.15));
        front
          .circle(f.x, f.y, 18 + 120 * e)
          .stroke({ color: LR.lamp.paperHot, width: 2, alpha: 0.6 * (1 - u) * (1 - u) });
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI / 2 + (hash01(`relight${f.i}`, k) - 0.5) * 2.2;
          const d = 14 + 70 * e;
          front
            .circle(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d + 40 * u * u, 2.2 * (1 - u) + 0.6)
            .fill({ color: LR.lamp.paperHot, alpha: 0.9 * (1 - u) });
        }
      } else if (f.kind === 'guard') {
        // A glance off the great cage's bars: a white-gold flash and sparks thrown back down.
        glow.add(f.x, f.y, 40 + 40 * e, 0xfff0c8, 0.6 * (1 - u));
        for (let k = 0; k < 7; k++) {
          const a = Math.PI * (0.15 + 0.7 * hash01(`guard${f.i}${Math.round(f.x)}`, k));
          const d = 16 + 90 * e;
          front
            .circle(f.x + Math.cos(a) * d * (k % 2 ? 1 : -1), f.y + Math.sin(a) * d * 0.6 + 60 * e * e, 2.2)
            .fill({ color: 0xfff0c8, alpha: 1 - u });
        }
      } else if (f.kind === 'rattle') {
        // The Lamp by a cage: a warm flash in the bars and the moths dashing at them on her side and falling back
        // (a dozen short strokes), the flame ducking.
        const side = f.side ?? 1;
        const s = this.info[f.i]?.size ?? 38;
        const rx = s * TRAP.cageW;
        glow.add(
          f.x + side * rx * 0.5,
          f.y,
          40 + 40 * e,
          TRAP.glow,
          0.5 * Math.sin(Math.PI * Math.min(1, u * 1.6)),
        );
        for (let k = 0; k < 12; k++) {
          const h = hash01(`rattle${f.i}`, k);
          const lag = 0.25 * hash01(`rattle${f.i}`, k + 20);
          const v = Math.max(0, Math.min(1, (u - lag) / 0.55));
          if (v <= 0 || v >= 1) continue;
          const reach = Math.sin(Math.PI * v);
          const yy = f.y + (h - 0.5) * s * TRAP.cageH * 1.4;
          const x0 = f.x + side * rx * 0.2;
          const x1 = f.x + side * rx * (0.75 + 0.3 * reach);
          front
            .moveTo(x0 + (x1 - x0) * reach * 0.6, yy)
            .lineTo(x0 + (x1 - x0) * reach, yy + (h - 0.5) * 6)
            .stroke({ color: 0xffe0a8, width: 1.6, alpha: 0.85 * (1 - v * 0.6), cap: 'round' });
        }
      } else if (f.kind === 'crack') {
        // A cut on a trap: a flash, a few sparks off the broken bar.
        glow.add(f.x, f.y, 50 + 70 * e, TRAP.glow, 0.7 * (1 - u));
        for (let k = 0; k < 5; k++) {
          const a = hash01(`crack${f.i}${Math.round(f.x)}`, k) * Math.PI * 2;
          const d = 20 + 70 * e;
          front
            .circle(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d + 30 * e * e, 2)
            .fill({ color: TRAP.bar, alpha: 1 - u });
        }
      }
    }
  }

  private drawFreed(dt: number, clock: number, front: Graphics, glow: GlowPool, sim: SimView): void {
    const p = sim.player;
    // Where the moon is, as a side of the sky (its view x in the room's look; the hatch's swarm went that way).
    const moonSide = LOOK.moon ? Math.sign(LOOK.moon.x - 960) || 1 : -1;
    const P = { x: 0, y: 0, tx: 0, ty: 0 };
    for (let k = this.freed.length - 1; k >= 0; k--) {
      const m = this.freed[k] as Freed;
      m.age += dt;
      if (m.age < 0) continue;
      if (m.rel) {
        if (!this.released(m, dt, clock, front, glow, sim, P, k)) this.freed.splice(k, 1);
        continue;
      }
      if (m.age > m.life) {
        this.freed.splice(k, 1);
        continue;
      }
      if (m.follow > 0) {
        if (m.age < m.follow) {
          // With her: a loose ring round her, each on its own orbit, lagging her moves.
          const a = clock * (1.2 + m.seed) + m.seed * 20;
          m.tx = p.cx + Math.cos(a) * (60 + 90 * m.seed);
          m.ty = p.cy - 40 + Math.sin(a * 1.3) * (40 + 50 * m.seed);
        } else if (m.age - dt < m.follow) {
          // Away: up and toward the moon's side of the sky, past the edge of the picture.
          m.tx = m.x + moonSide * (700 + 500 * m.seed);
          m.ty = m.y - 1400 - 400 * m.seed;
        }
      }
      // Out in a burst, then steering to the moonlight (or her), faster as they go.
      const steer = Math.min(1, Math.max(0, (m.age - 0.35) / 0.8));
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = m.follow > 0 && m.age < m.follow ? Math.min(420, 60 + d * 2.2) : 220 + 340 * steer;
      m.vx += ((dx / d) * speed - m.vx) * Math.min(1, dt * 2.2 * steer + dt * 0.4);
      m.vy += ((dy / d) * speed - m.vy) * Math.min(1, dt * 2.2 * steer + dt * 0.4);
      m.vx += Math.sin(clock * 7 + m.seed * 40) * 40 * dt * 10;
      m.vy += Math.cos(clock * 6 + m.seed * 30) * 30 * dt * 10;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const fade =
        Math.min(1, m.age * 4) *
        Math.min(1, (m.life - m.age) * 1.5) *
        (d < 60 && !(m.follow > 0 && m.age < m.follow) ? d / 60 : 1);
      const flap = Math.abs(Math.sin(clock * 30 + m.seed * 50));
      // (A trap's moths, with her a while, a little bigger: the eye follows them.)
      const w = (m.follow > 0 ? 8 : 6) + 4 * m.seed;
      moth(front, m.x, m.y, w, flap, m.vx >= 0 ? 1 : -1, LR.lamp.freed, 0.95 * fade);
      if (m.age < 0.6) glow.add(m.x, m.y, 10, LR.lamp.halo, 0.3 * (1 - m.age / 0.6));
      // A trap's freed moths carry a little moonlight (cool, not the lamp's warmth) while they fly with her.
      else if (m.follow > 0) glow.add(m.x, m.y, 14, TRAP.freedGlow, 0.18 * fade);
    }
    this.drawBars(dt, front, glow);
    for (let k = this.scraps.length - 1; k >= 0; k--) {
      const s = this.scraps[k] as Scrap;
      s.age += dt;
      if (s.age > 1.4) {
        this.scraps.splice(k, 1);
        continue;
      }
      s.vy += 380 * dt;
      s.vx *= 1 - dt * 1.5;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      const c = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const a = Math.min(1, (1.4 - s.age) * 2);
      front
        .poly([
          s.x + c * s.s,
          s.y + sn * s.s,
          s.x - sn * s.s * 0.5,
          s.y + c * s.s * 0.5,
          s.x - c * s.s,
          s.y - sn * s.s,
        ])
        .fill({ color: LR.lamp.husk, alpha: 0.85 * a });
    }
  }

  /**
   * A released moth (release.ts): out of the cage, once round her, then along the stream toward the moon. Returns
   * false when it has gone (off the stream's far end).
   */
  private released(
    m: Freed,
    dt: number,
    clock: number,
    front: Graphics,
    glow: GlowPool,
    sim: SimView,
    P: { x: number; y: number; tx: number; ty: number },
    k: number,
  ): boolean {
    const R = RELEASE;
    const r = m.rel as NonNullable<Freed['rel']>;
    const p = sim.player;
    const t = m.age;
    let x: number;
    let y: number;
    if (t < r.depart) {
      // Out of the cage (a burst slowing), then round her: each on its own ellipse, all turning one way or the
      // other, lagging her moves.
      const swirl = Math.max(0, t - R.burst * 0.6);
      const a = r.a0 + r.spin * swirl * ((Math.PI * 2) / (R.circle + 0.4));
      const ox = p.cx + Math.cos(a) * r.rx;
      const oy = p.cy - 50 + Math.sin(a) * r.ry;
      const pull = Math.min(1, Math.max(0, (t - R.burst * 0.35) / (R.burst * 1.2)));
      const steer = pull * pull * (3 - 2 * pull);
      m.vx *= Math.exp(-dt * 3.2);
      m.vy *= Math.exp(-dt * 3.2);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.x += (ox - m.x) * Math.min(1, dt * 7 * steer);
      m.y += (oy - m.y) * Math.min(1, dt * 7 * steer);
      x = m.x;
      y = m.y;
    } else {
      // The stream: fixed where she was when the first moth left, so its line stays put as she moves on.
      const s = r.s;
      if (!s.path) {
        s.path = releasePath(p.cx, p.cy - 60, s.side, s.moths);
        s.len = pathLength(s.path);
      }
      const u = ((t - r.depart) * s.speed) / s.len;
      if (u > 1.6) return false;
      along(s.path, u, P);
      // Strays from the line a little, wider as it goes, weaving.
      const off = r.dx * R.spread * (0.4 + u) + Math.sin(clock * 3 + m.seed * 30) * 14;
      const sx = P.x - P.ty * off;
      const sy = P.y + P.tx * off;
      // Eases in from where it was circling.
      const join = Math.min(1, (t - r.depart) / 0.45);
      const j = join * join * (3 - 2 * join);
      x = m.x + (sx - m.x) * j;
      y = m.y + (sy - m.y) * j;
      if (join >= 1) {
        m.x = sx;
        m.y = sy;
      }
      m.vx = P.tx * s.speed;
      m.vy = P.ty * s.speed;
    }
    // Pale gold out of the cage, cool by the time it is on its way.
    const cool = Math.min(1, Math.max(0, (t - R.burst) / (r.depart - R.burst + 0.6)));
    const col = mix(R.warm, R.cool, cool);
    const fade = Math.min(1, (t + 0.18) * 5);
    const flap = Math.abs(Math.sin(clock * (24 + 10 * m.seed) + m.seed * 50));
    const dir = t < r.depart ? (Math.sin(r.a0 + r.spin * t * 3.3) * r.spin >= 0 ? -1 : 1) : r.s.side;
    moth(front, x, y, r.size, flap, dir, col, 0.95 * fade);
    if (k % 3 === 0) glow.add(x, y, 16 + r.size, cool < 0.5 ? TRAP.glow : TRAP.freedGlow, 0.16 * fade);
    return true;
  }

  /** The cage's bars bursting off (release.ts): bowed strokes flying out, turning, falling, dimming. */
  private drawBars(dt: number, front: Graphics, glow: GlowPool): void {
    const R = RELEASE;
    for (let k = this.bars.length - 1; k >= 0; k--) {
      const b = this.bars[k] as Bar;
      b.age += dt;
      if (b.age > R.barLife) {
        this.bars.splice(k, 1);
        continue;
      }
      b.vy += R.barFall * dt;
      b.vx *= Math.exp(-dt * 1.2);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      // Landed: it lies on the ground (turned flat, a little bounce lost), dimming there.
      if (b.floor !== null && b.y >= b.floor - 3) {
        b.y = b.floor - 3;
        b.vy = 0;
        b.vx *= Math.exp(-dt * 10);
        b.vr = 0;
        const flat = Math.round(b.rot / Math.PI - 0.5) * Math.PI + Math.PI / 2;
        b.rot += (flat - b.rot) * Math.min(1, dt * 14);
      }
      const c = Math.cos(b.rot);
      const sn = Math.sin(b.rot);
      const hl = b.len / 2;
      const P = (px: number, py: number): [number, number] => [
        b.x + px * c - py * sn,
        b.y + px * sn + py * c,
      ];
      const [ax, ay] = P(0, -hl);
      const [mx, my] = P(b.bow, 0);
      const [bx, by] = P(0, hl);
      const a = 1 - (b.age / R.barLife) ** 2;
      const hot = Math.max(0, 1 - b.age / 0.5);
      front
        .moveTo(ax, ay)
        .quadraticCurveTo(mx, my, bx, by)
        .stroke({
          color: mix(TRAP.bar, 0xfff4dc, hot),
          width: 2.2 + 1.2 * hot,
          alpha: 0.9 * a,
          cap: 'round',
        });
      if (hot > 0) glow.add(b.x, b.y, 30, TRAP.glow, 0.4 * hot);
    }
  }

  /** Forgets this module's lights (the room is going). */
  destroy(): void {
    for (const id of this.lightIds) this.lights.remove(id);
    this.clouds.destroy();
  }
}
