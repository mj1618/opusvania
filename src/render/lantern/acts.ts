/**
 * The Canopy's small events, drawn (round 9; docs/design/levels/first-area.md v8, memory/canopy-render.md):
 *
 *   spill     the hatch's first fling (`teach` landmark `first-fling`): while its lamp burns and she has never flung
 *             from it, a thin stream of moths spills off the flame toward the far limb and loops back: the line
 *             the fling takes, shown by the creatures that take it every night. Gone (scattered) once its `sets`
 *             flag is saved.
 *   arrivals  an ambush's creatures (`EnemySpawn.arrive`, `enemyArrive`): a tell while it is on its way (grit
 *             trickling from where it will drop, dust at a burrow mouth, the ground cracking), then the arrival as
 *             an event: a burrow mouth torn in a wall and a lip of earth over the crawler's back, a mound of earth
 *             thrown up where one digs out of the floor, a shadow growing on the floor under one that drops and a
 *             burst of dust where it lands. The creature's own eased motion is enemies/arrive.ts.
 *   flare     a patch she passes through (`patchMark`): a ring of moonlight runs out along the ground, a column
 *             breathes up and a few motes lift: the save took.
 *   kept      the kin's lights (`light` landmarks: `kin-lamp` in the hub, `kin-light` in the bower): a small warm
 *             flame in a split seed husk, kept low and steady, the room's one warm light (a point light too).
 *   stones    a map station's hung moth-stones (`MoonPatch.hangs`, the hub's `p-crossing` by the kin's lamp): a crook of
 *             root arching over the kin's husk, each stone she has brought back (`cn-stone-*` flags) hanging from it on a
 *             thread, warm on the flame's side; one just hung (`stoneHung`) swings in and glints; all swing (less) as
 *             the station opens the map (`mapStation`).
 *   door      a way out lit from beyond (`door` landmarks, `door-limbs` in the well's hollow; canopy r9b): the open night
 *             past the doorway glows, its moonlight spills down and in across the hollow in a slow breathing beam that
 *             pools on the floor below, and motes drift up out of the hollow along that light and out through it. A
 *             pull, not an arrow: the brightest, liveliest thing in the hollow is the way on.
 *
 * Render only: reads the sim view and the room, never writes. Deterministic: hashes and the render clock.
 */
import type { Graphics } from 'pixi.js';
import { fireflyAt, roostsLit } from '../../sim/firefly';
import type { Lure } from '../../sim/scene';
import { tuning } from '../../sim/tuning';
import type { CameraView, SimView } from '../contract';
import type { LightRegistry } from '../lights';
import { hash01 } from './config';
import type { GlowPool } from './glow';

/**
 * The premise's pictures (the Canopy r10, review r9 #2; the sim's side in memory/canopy.md "The premise"):
 *  - the firefly's pass at the gap (`state.kit.firefly`, `fireflyAt`): a small cold-gold light that flees, blinking
 *    in a firefly's rhythm, a short trail; where it relights a lamp a thread of its light runs to the flame;
 *  - the hub's roosts (`roostsLit`): where a freed trap's moths settled, pale moths at rest on the bark, opening and
 *    closing their wings, a few always in the air, a cool breath of moonlight over them.
 */
export const PREMISE = {
  firefly: { core: 0xf4ffb0, glow: 0xd8ff7a, trail: 14, blink: 1.7, size: 4 },
  /** Moths at rest per roost (one per this many px² of its rect, clamped), and how many fly round it. */
  roost: { per: 1100, min: 22, max: 70, flying: 8, moth: 0xeef0e2, glow: 0xbcd4ff, size: [9, 14] as const },
};

export const ACTS = {
  spill: {
    /** Moths in the stream, seconds a loop takes (out to the limb and back), how far the arc sags under the line. */
    n: 32,
    loop: [4.2, 6.4] as const,
    sag: 0.32,
    /** Where it ends: a top this far east of the flame at least (px), aimed this far over it and along it. */
    minDx: 360,
    over: 70,
    along: 160,
    /** Seconds the stream takes to scatter once she has flung. */
    out: 1.6,
    /** Half wingspan px, wingbeats a second. */
    size: [5, 8.5] as const,
    beat: [10, 15] as const,
    lit: 0xffe2b0,
    /** Out from the flame a moth is moonlit (pale), not a dark speck: the night's falling leaves are dark specks. */
    dark: 0xcfd6dc,
  },
  arrive: {
    /** A drop: the tell's grit (px wide), the shadow's widest (px) and darkest, the landing's dust (s). */
    grit: 70,
    shadow: 90,
    shadowA: 0.55,
    land: 0.7,
    /** A burrow mouth: its size (px), how long it stays open after (s); the mound thrown up from a floor. */
    mouth: [46, 34] as const,
    open: 2.4,
    mound: 64,
    dirt: 0x2a1c12,
    earth: 0x0c0806,
    hole: 0x020101,
    dust: 0x9a8468,
    /** A way on's mouth: how near a side edge an arrive point must be (px); the passage's dark (px deep, alpha). */
    mouthReach: 260,
    mouthDark: [260, 0.9] as const,
    eyes: 0xffb35a,
    lit: 0x6a5238,
    /** The burst's cloud (dark earth, soft) and a hole's crumbled rim. */
    cloud: 0x2a2620,
    rim: 0x9aa8b0,
  },
  flare: {
    /** Seconds, the ring's reach (px) and its height, the column's height. */
    secs: 1.3,
    ring: 170,
    flat: 0.22,
    column: 260,
    motes: 9,
    color: 0xdce8ff,
    core: 0xf4f8ff,
  },
  door: {
    /** The opening's half height (px over the landmark, which sits on its floor) and the glow in it. */
    half: 120,
    moon: 0xcfe4f2,
    core: 0xf2f8ff,
    glow: 0.42,
    /** The spill: its length (px), its angle down from level (radians), how strongly it shows. */
    beam: 820,
    angle: 0.55,
    beamA: 0.1,
    /** Motes drawn up out of the hollow: count, seconds per trip, how far back into the hollow they start (px). */
    motes: 22,
    trip: [6, 10] as const,
    reach: [380, 1150] as const,
    /** The point light at the door. */
    light: 0.55,
    radius: 560,
  },
  stones: {
    /** The crook: how high it rises over the husk and how far it reaches across (px); a stone's size; threads. */
    rise: 150,
    reach: 120,
    size: [9, 13] as const,
    thread: [26, 64] as const,
    stone: 0x2a2a32,
    lit: 0x6a6c78,
    carve: 0x0c0c10,
    carveLit: 0x9fb8cc,
    /** Seconds a stone just hung swings and glints. */
    swing: 3.2,
    wood: 0x140d09,
    woodLit: 0x4a3420,
  },
  kept: {
    /** The husk's size, the flame's height (px), its light's reach and strength. */
    husk: 24,
    flame: 22,
    reach: 360,
    light: 0.75,
    warm: 0xffb36b,
    core: 0xffd9a0,
    flameC: 0xff8a34,
    husk0: 0x120a06,
    huskLit: 0x6a3a1c,
  },
};

type ArriveWay = 'drop' | 'wall' | 'ground' | 'fly' | 'mouth';
interface Arrival {
  i: number;
  kind: string;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  /** Seconds the travel takes; seconds since it began. */
  secs: number;
  t: number;
  way: ArriveWay;
  /** The wall face's x and which way the crawler leaves it (a `wall`), the floor's y under it. */
  wallX: number;
  dir: number;
  floor: number;
  /** Half the creature's box (px). */
  hw: number;
  hh: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How a creature arrives from (fx, fy) to (x, y): falling, out of a wall, out of the ground, or on the wing. */
export function arriveWay(
  sim: SimView,
  kind: string,
  fx: number,
  fy: number,
  x: number,
  y: number,
  hw: number,
): { way: ArriveWay; wallX: number; dir: number } {
  const flyer = kind === 'lampwing' || kind === 'hawker';
  if (y - fy > 150) return { way: 'drop', wallX: 0, dir: 0 };
  const dir = x >= fx ? 1 : -1;
  // Out of a way on (canopy r9b: the den's warning's beat 2 comes out of the den's mouth): it starts by an exit on a
  // side edge, at its height. It comes out of the dark of the passage.
  if (!flyer) {
    const W = sim.scene.width;
    const side = fx > W - ACTS.arrive.mouthReach ? 1 : fx < ACTS.arrive.mouthReach ? -1 : 0;
    const exit = side
      ? (sim.scene.exits ?? []).find(
          (e) => e.edge === (side > 0 ? 'e' : 'w') && fy >= e.from - 8 && fy <= e.to + 8,
        )
      : undefined;
    if (exit) return { way: 'mouth', wallX: side > 0 ? W : 0, dir: -side };
  }
  // A wall face just behind where it starts (the side away from where it goes), at its height.
  for (const r of sim.scene.solids) {
    if (fy < r.y - 8 || fy - 40 > r.y + r.h) continue;
    const face = dir > 0 ? r.x + r.w : r.x;
    const gap = (fx - face) * dir;
    if (gap >= -hw && gap <= hw + 80 && (dir > 0 ? r.x < fx : r.x + r.w > fx))
      return { way: 'wall', wallX: face, dir };
  }
  return { way: flyer ? 'fly' : 'ground', wallX: 0, dir };
}

/** The nearest top under (x, y) (solids and one-ways); the room's floor if none. */
function floorUnder(sim: SimView, x: number, y: number): number {
  let top = sim.scene.height;
  for (const r of sim.scene.solids) if (r.x <= x && r.x + r.w >= x && r.y >= y - 4) top = Math.min(top, r.y);
  for (const r of sim.scene.oneWays ?? [])
    if (r.x <= x && r.x + r.w >= x && r.y >= y - 4) top = Math.min(top, r.y);
  return top;
}

/** The underside over (x, y): the nearest bottom of a solid above it (the room's top if none). */
function roofOver(sim: SimView, x: number, y: number): number {
  let low = 0;
  for (const r of sim.scene.solids)
    if (r.x <= x && r.x + r.w >= x && r.y + r.h <= y + 4) low = Math.max(low, r.y + r.h);
  return low;
}

/** A small moth, wings beating, at (x, y) heading `ang`; `k` 0..1 how near its flame (lit) it is. */
function moth(
  g: Graphics,
  x: number,
  y: number,
  s: number,
  flap: number,
  ang: number,
  k: number,
  a: number,
): void {
  const S = ACTS.spill;
  const c = mix(S.dark, S.lit, k);
  const w = s * (0.35 + 0.65 * Math.abs(flap));
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // Two wings across its heading, the body a short streak along it.
  for (const side of [-1, 1]) {
    const wx = x - sa * side * w * 0.7;
    const wy = y + ca * side * w * 0.7;
    g.ellipse(wx, wy, Math.max(0.8, w * 0.75), Math.max(0.8, s * 0.42)).fill({ color: c, alpha: a });
  }
  g.ellipse(x, y, 1.4, 1.4).fill({ color: mix(S.dark, 0xffffff, k * 0.6), alpha: a });
}

function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class Acts {
  private readonly arrivals = new Map<number, Arrival>();
  /** Patch flares: where and seconds since. */
  private readonly flares: Array<{ x: number; y: number; t: number }> = [];
  /** The first fling's stream: its lamp, its end on the far limb, how present (0..1). */
  private spill: { lure: number; l: Lure; ex: number; ey: number; k: number } | null = null;
  private readonly lights: string[] = [];
  /** Moth-stones just hung (their flag) and seconds since. */
  private readonly hung = new Map<string, number>();
  /** The firefly's recent places (its trail) and its relights (lamp, seconds since). */
  private readonly ffTrail: Array<[number, number]> = [];
  private readonly ffLit: Array<{ x: number; y: number; fx: number; fy: number; t: number }> = [];
  /** Roosts that just filled (their id, seconds since): the moths settle in. */
  private readonly roostNew = new Map<string, number>();

  constructor(
    sim: { scene: SimView['scene'] },
    private readonly reg: LightRegistry,
  ) {
    const S = sim.scene;
    const lms = (
      S.marks as { landmarks?: Array<{ id: string; kind: string; x: number; y: number }> } | undefined
    )?.landmarks;
    const teach = lms?.find((l) => l.kind === 'teach' && l.id === 'first-fling');
    if (teach && S.lures) {
      // Its lamp: the one nearest the mark.
      let best = -1;
      let bd = 260 * 260;
      S.lures.forEach((l, i) => {
        const d = (l.x - teach.x) ** 2 + (l.y - teach.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const l = best >= 0 ? S.lures[best] : undefined;
      if (l) {
        // Where it ends: the far side. The nearest top below the flame is the side she comes from; the stream goes to
        // the nearest top the other way, past `minDx`.
        const A = ACTS.spill;
        const tops = S.solids.filter((r) => r.y >= l.y + 60);
        const dxOf = (r: (typeof tops)[number]) =>
          r.x > l.x ? r.x - l.x : r.x + r.w < l.x ? r.x + r.w - l.x : 0;
        let near = 0;
        let nd = Number.POSITIVE_INFINITY;
        for (const r of tops) {
          const d = dxOf(r) ** 2 + (r.y - l.y) ** 2;
          if (d < nd && dxOf(r) !== 0) {
            nd = d;
            near = Math.sign(dxOf(r));
          }
        }
        let ex = l.x - near * 600;
        let ey = l.y + 300;
        let bd2 = Number.POSITIVE_INFINITY;
        for (const r of tops) {
          const dx = dxOf(r);
          if (Math.abs(dx) < A.minDx || Math.sign(dx) === near) continue;
          const d = dx * dx + (r.y - l.y) ** 2;
          if (d < bd2) {
            bd2 = d;
            ex = dx > 0 ? r.x + A.along : r.x + r.w - A.along;
            ey = r.y - A.over;
          }
        }
        this.spill = { lure: best, l, ex, ey, k: 1 };
      }
    }
  }

  onEvents(events: SimView['events'], sim: SimView): void {
    for (const e of events) {
      if (e.type === 'enemyArrive') {
        const i = (sim.scene.enemies ?? []).findIndex((s) => s.id === e.id);
        if (i < 0) continue;
        const st = sim.enemies[i];
        const hw = (st?.w ?? 60) / 2;
        const hh = (st?.h ?? 40) / 2;
        const w = arriveWay(sim, e.kind, e.fromX, e.fromY, e.x, e.y, hw);
        this.arrivals.set(i, {
          i,
          kind: e.kind,
          fromX: e.fromX,
          fromY: e.fromY,
          x: e.x,
          y: e.y,
          secs: e.frames / 60,
          t: 0,
          way: w.way,
          wallX: w.wallX,
          dir: w.dir,
          floor: floorUnder(sim, e.x, e.y),
          hw,
          hh,
        });
      } else if (e.type === 'patchMark') this.flares.push({ x: e.x, y: e.y, t: 0 });
      else if (e.type === 'stoneHung') this.hung.set(e.flag, 0);
      else if (e.type === 'fireflyRelight') {
        const ff = (sim as { kit?: { firefly?: { x: number; y: number } } }).kit?.firefly;
        this.ffLit.push({ x: e.x, y: e.y, fx: ff?.x ?? e.x, fy: ff?.y ?? e.y, t: 0 });
      } else if (e.type === 'fireflyStart') this.ffTrail.length = 0;
      // The map station opens: every stone on the crook swings (the map unrolls from it: render/map).
      else if (e.type === 'mapStation')
        for (const f of sim.save.flags) if ((this.hung.get(f) ?? 1e9) > 0.8) this.hung.set(f, 0.8);
    }
  }

  draw(
    dt: number,
    clock: number,
    sim: SimView,
    cam: CameraView,
    back: Graphics,
    front: Graphics,
    glowBack: GlowPool,
    glowFront: GlowPool,
  ): void {
    const hw = cam.w / 2 / cam.zoom + 300;
    const hh = cam.h / 2 / cam.zoom + 300;
    const seen = (x: number, y: number, pad = 0) =>
      Math.abs(x - cam.x) < hw + pad && Math.abs(y - cam.y) < hh + pad;
    this.drawSpill(dt, clock, sim, back, front, glowFront, seen);
    this.drawTells(clock, sim, back, seen);
    this.drawArrivals(dt, clock, sim, back, front, glowBack, seen);
    this.drawFlares(dt, clock, back, glowBack, glowFront);
    this.drawKept(clock, sim, back, glowBack, glowFront, seen);
    for (const [f, t] of this.hung) this.hung.set(f, t + dt);
    this.drawStones(clock, sim, back, glowFront, seen);
    this.drawDoors(clock, sim, back, glowBack, glowFront, seen);
    this.drawFirefly(dt, clock, sim, front, glowFront);
    this.drawDenMouth(clock, sim, glowBack, seen);
    this.drawRoosts(dt, clock, sim, back, glowBack, seen);
  }

  // --- The den's mouth (the tunnel's lid, canopy review r9 #6): a red-amber breath of light out of it, so the
  // warning's arrivals come out of light, and the boss's den reads as somewhere.
  private drawDenMouth(
    clock: number,
    sim: SimView,
    glow: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    for (const q of (
      sim.scene as { gates?: Array<{ id: string; x: number; y: number; w: number; h: number }> }
    ).gates ?? []) {
      if (!q.id.endsWith('lid')) continue;
      const cx = q.x + q.w / 2;
      const cy = q.y + q.h * 0.62;
      if (!seen(cx, cy, 400)) continue;
      const b = 0.8 + 0.2 * Math.sin(clock * 0.9) * Math.sin(clock * 0.37 + 1);
      glow.add(cx - 60, cy, 260, 0xc8582a, 0.2 * b, 200);
      glow.add(cx - 20, cy + 20, 120, 0xffa060, 0.22 * b, 110);
    }
  }

  // --- The firefly's pass (the gap): small, bright, fleeing; it relights what she put out behind her.
  private drawFirefly(dt: number, clock: number, sim: SimView, front: Graphics, glow: GlowPool): void {
    const F = PREMISE.firefly;
    const kit = sim.kit as unknown as { firefly?: { pass: number; frame: number; x: number; y: number } };
    const ff = kit.firefly;
    const passes = (sim.scene as { fireflies?: Array<{ path: Array<[number, number]>; frames: number }> })
      .fireflies;
    for (let k = this.ffLit.length - 1; k >= 0; k--) {
      const r = this.ffLit[k] as (typeof this.ffLit)[number];
      r.t += dt;
      if (r.t > 0.9) {
        this.ffLit.splice(k, 1);
        continue;
      }
      // A thread of its light runs from it to the flame, then the flame flares.
      const u = Math.min(1, r.t / 0.25);
      const a = 1 - Math.max(0, (r.t - 0.25) / 0.65);
      front
        .moveTo(r.fx, r.fy)
        .lineTo(r.fx + (r.x - r.fx) * u, r.fy + (r.y - r.fy) * u)
        .stroke({ color: F.glow, width: 1.5, alpha: 0.6 * a });
      glow.add(r.x, r.y, 30 + 60 * u, F.glow, 0.45 * a);
    }
    if (!ff || ff.pass < 0 || !passes) {
      if (this.ffTrail.length) this.ffTrail.length = 0;
      return;
    }
    const pass = passes[ff.pass];
    if (!pass) return;
    const at = fireflyAt(pass as never, ff.frame - 1 + sim.alpha);
    this.ffTrail.push([at.x, at.y]);
    if (this.ffTrail.length > F.trail) this.ffTrail.shift();
    // A firefly's signal: a glow that swells and dies in pulses, never quite out (it is looking for another).
    const ph = (clock * F.blink) % 1;
    const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(ph * Math.PI * 2)) ** 2;
    const n = this.ffTrail.length;
    for (let k = 0; k < n - 1; k++) {
      const [x0, y0] = this.ffTrail[k] as [number, number];
      const [x1, y1] = this.ffTrail[k + 1] as [number, number];
      const t = (k + 1) / n;
      front
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ color: F.glow, width: 1 + 2 * t, alpha: 0.35 * t * pulse });
    }
    // Its body: a dark speck with a lit tail, wings a blur.
    const dir = n > 1 ? Math.sign(at.x - (this.ffTrail[n - 2]?.[0] ?? at.x)) || 1 : 1;
    front.ellipse(at.x + dir * 3, at.y - 1, 3, 1.8).fill({ color: 0x1a1810, alpha: 0.9 });
    const flap = Math.abs(Math.sin(clock * 38));
    front.ellipse(at.x + dir * 2, at.y - 3 - flap * 2, 4, 1.4 + flap).fill({ color: 0xe8eadc, alpha: 0.35 });
    front.circle(at.x - dir * 2, at.y, F.size * (0.8 + 0.3 * pulse)).fill({ color: F.core, alpha: 0.95 });
    glow.add(at.x - dir * 2, at.y, 34 + 40 * pulse, F.glow, 0.55 * pulse + 0.2);
    glow.add(at.x - dir * 2, at.y, 160, F.glow, 0.1 * pulse);
  }

  // --- The hub's roosts: freed moths settled, more each trap she frees.
  private drawRoosts(
    dt: number,
    clock: number,
    sim: SimView,
    back: Graphics,
    glow: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const R = PREMISE.roost;
    const lit = roostsLit(sim.scene as never, sim.save as never);
    for (const [id, t] of this.roostNew) this.roostNew.set(id, t + dt);
    for (const r of lit) {
      if (!seen(r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h))) continue;
      if (!this.roostNew.has(r.id)) this.roostNew.set(r.id, sim.frame < 5 ? 99 : 0);
      const since = this.roostNew.get(r.id) ?? 99;
      const n = Math.max(R.min, Math.min(R.max, Math.round((r.w * r.h) / R.per)));
      for (let k = 0; k < n; k++) {
        const hx = hash01(r.id, k);
        const hy = hash01(r.id, k + 300);
        const x = r.x + r.w * (0.05 + 0.9 * hx);
        const y = r.y + r.h * (0.05 + 0.9 * hy);
        // Settling in: each lands at its own time over the first 3 s.
        const land = Math.min(1, Math.max(0, (since - hash01(r.id, k + 600) * 2.2) / 0.8));
        if (land <= 0) continue;
        const ox = (1 - land) * (hash01(r.id, k + 700) - 0.5) * 260;
        const oy = (1 - land) * -180;
        // At rest the wings open and close slowly, each in its own time.
        const open = 0.5 + 0.5 * Math.sin(clock * (0.6 + hash01(r.id, k + 900)) + k * 1.9);
        const w = R.size[0] + (R.size[1] - R.size[0]) * hash01(r.id, k + 800);
        const wx = w * (0.55 + 0.6 * open) * (land < 1 ? 1.2 : 1);
        const cx = x + ox;
        const cy = y + oy;
        back
          .poly([cx, cy, cx - wx, cy - w * 0.5, cx - wx * 0.8, cy + w * 0.45])
          .fill({ color: R.moth, alpha: 0.9 });
        back
          .poly([cx, cy, cx + wx, cy - w * 0.5, cx + wx * 0.8, cy + w * 0.45])
          .fill({ color: R.moth, alpha: 0.9 });
        back.ellipse(cx, cy, w * 0.18, w * 0.5).fill({ color: 0x3a3428, alpha: 0.8 });
      }
      // A few always in the air round it.
      for (let k = 0; k < R.flying; k++) {
        const a = clock * (0.7 + 0.3 * hash01(r.id, k + 50)) + k * 2.1;
        const x = r.x + r.w / 2 + Math.cos(a) * (r.w * 0.6 + 30);
        const y = r.y + r.h / 2 + Math.sin(a * 1.4) * (r.h * 0.6 + 20);
        const flap = Math.abs(Math.sin(clock * 24 + k));
        const w = 8;
        back.poly([x, y, x - w * 1.1, y - w * (0.2 + flap), x + w * 1.1, y - w * (0.2 + flap)]).fill({
          color: R.moth,
          alpha: 0.6,
        });
      }
      glow.add(
        r.x + r.w / 2,
        r.y + r.h / 2,
        Math.max(r.w, r.h) * 0.7,
        R.glow,
        0.07 + 0.02 * Math.sin(clock + r.x),
      );
    }
  }

  // --- A map station's hung moth-stones, on a crook over the kin's lamp (or over the patch, with no lamp near).
  private drawStones(
    clock: number,
    sim: SimView,
    back: Graphics,
    glow: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const St = ACTS.stones;
    const lms = (
      sim.scene.marks as { landmarks?: Array<{ id: string; kind: string; x: number; y: number }> } | undefined
    )?.landmarks;
    for (const p of sim.scene.patches ?? []) {
      const hangs = (p as { hangs?: Array<{ stone: string; flag: string }> }).hangs ?? [];
      if (!hangs.length) continue;
      // The kin's lamp beside it, if there is one (within 420 px).
      const lamp = (lms ?? []).find((l) => l.kind === 'light' && Math.abs(l.x - p.x) < 420);
      const bx = lamp ? lamp.x : p.x;
      const by = floorUnder(sim, bx, (lamp ? lamp.y : p.y) - 30);
      if (!seen(bx, by - 100, 200)) continue;
      // The crook: a root out of the ground behind the husk, up and over, its tip curling down.
      const side = lamp && lamp.x < p.x ? 1 : -1;
      const x0 = bx - side * 38;
      const top = by - St.rise;
      const x1 = bx + side * (St.reach - 38);
      const sway = Math.sin(clock * 0.6) * 2;
      const pt = (t: number): [number, number] => {
        // Up the stem (t 0-0.4), then across the arc (0.4-1).
        if (t < 0.4) {
          const u = t / 0.4;
          return [x0 - side * 6 * Math.sin(u * Math.PI), by - (by - top) * (1 - (1 - u) ** 2)];
        }
        const u = (t - 0.4) / 0.6;
        return [x0 + (x1 - x0) * u + sway * u, top - 18 * Math.sin(u * Math.PI) + 26 * u ** 3];
      };
      const n = 18;
      const line: Array<[number, number]> = [];
      for (let k = 0; k <= n; k++) line.push(pt(k / n));
      // (Tapering in three runs, a knot where a run ends: one even stroke read as a lamp post.)
      for (const [i0, i1, w] of [
        [0, 8, 8],
        [8, 14, 5.5],
        [14, n, 3],
      ] as const) {
        const seg = line.slice(i0, i1 + 1);
        for (const [ww, c, a, dy] of [
          [w, St.wood, 1, 0],
          [w * 0.3, St.woodLit, 0.6, -w * 0.3],
        ] as const) {
          back.moveTo(seg[0]?.[0] ?? x0, (seg[0]?.[1] ?? by) + dy);
          for (const [x, y] of seg.slice(1)) back.lineTo(x, y + dy);
          back.stroke({ color: c, width: ww, alpha: a, cap: 'round', join: 'round' });
        }
        const [kx, ky] = seg[seg.length - 1] ?? [x0, by];
        if (i1 < n) back.circle(kx, ky, w * 0.7).fill(St.wood);
      }
      // The stones hung so far, in the order of `hangs`, spread along the arc.
      const hungList = hangs.filter((h) => sim.save.flags.includes(h.flag));
      hungList.forEach((h, k) => {
        const t = 0.5 + (0.45 * (k + 0.5)) / Math.max(hangs.length, 1);
        const [hx, hy] = pt(t);
        const q = hash01(h.flag, 3);
        const len = St.thread[0] + (St.thread[1] - St.thread[0]) * q;
        const since = this.hung.get(h.flag);
        const fresh = since !== undefined && since < St.swing ? 1 - since / St.swing : 0;
        const ang =
          Math.sin(clock * (1.1 + q * 0.6) + q * 6) * 0.06 +
          fresh * Math.sin((since ?? 0) * 5.5) * 0.5 * fresh;
        const sx = hx + Math.sin(ang) * len;
        const sy = hy + Math.cos(ang) * len;
        back.moveTo(hx, hy).lineTo(sx, sy).stroke({ color: 0xa89a86, width: 1, alpha: 0.6 });
        const sz = St.size[0] + (St.size[1] - St.size[0]) * hash01(h.flag, 5);
        // A small slab, rounded, a little turned; warm on the flame's side, moth wings cut in its face.
        const tilt = ang * 0.6;
        const slab = [-0.55, 0, 0.5, 0.15, 0.6, 1.0, 0.45, 1.9, -0.05, 2.05, -0.6, 1.7, -0.62, 0.7].map(
          (v, j) => (j % 2 ? sy + v * sz + Math.sin(tilt) * 0 : sx + v * sz),
        );
        back.poly(slab).fill(St.stone);
        back
          .poly(slab.map((v, j) => (j % 2 ? v + 1 : sx + (v - sx) * 0.7 - side * 1.5)))
          .fill({ color: St.lit, alpha: 0.4 });
        back
          .ellipse(sx - side * sz * 0.42, sy + sz * 1.0, sz * 0.16, sz * 0.75)
          .fill({ color: ACTS.kept.warm, alpha: 0.35 });
        const wy = sy + sz * 0.95;
        const ws = sz * 0.32;
        back
          // (A moth, cut pale in the dark face: two dark eyes read as a mask.)
          .poly([sx, wy, sx - ws * 1.4, wy - ws * 1.0, sx - ws * 1.2, wy + ws * 0.3])
          .poly([sx, wy, sx + ws * 1.4, wy - ws * 1.0, sx + ws * 1.2, wy + ws * 0.3])
          .poly([sx, wy + 1, sx - ws * 0.9, wy + ws * 1.1, sx - ws * 0.3, wy + ws * 0.4])
          .poly([sx, wy + 1, sx + ws * 0.9, wy + ws * 1.1, sx + ws * 0.3, wy + ws * 0.4])
          .rect(sx - 0.7, wy - ws * 0.5, 1.4, ws * 1.6)
          .fill({ color: St.carveLit, alpha: 0.7 });
        glow.add(sx, wy, 10 + 6 * q, 0xcfe0ff, 0.12 + 0.05 * Math.sin(clock * 1.4 + k));
        if (fresh > 0) glow.add(sx, wy, 46, 0xe8f0ff, 0.5 * fresh * fresh);
      });
    }
  }

  // --- The way out lit from beyond.
  private drawDoors(
    clock: number,
    sim: SimView,
    back: Graphics,
    glowBack: GlowPool,
    glowFront: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const D = ACTS.door;
    const lms = (
      sim.scene.marks as { landmarks?: Array<{ id: string; kind: string; x: number; y: number }> } | undefined
    )?.landmarks;
    for (const l of lms ?? []) {
      if (l.kind !== 'door') continue;
      // Out is toward the nearer side wall of the room.
      const dir = l.x > sim.scene.width / 2 ? 1 : -1;
      const cx = l.x;
      const cy = l.y - D.half;
      const breathe = 0.85 + 0.1 * Math.sin(clock * 0.8) + 0.05 * Math.sin(clock * 2.3 + 1);
      const id = `door-${l.id}`;
      const light = this.reg.get(id);
      if (light) light.intensity = D.light * breathe;
      else {
        this.reg.set(id, { x: cx, y: cy, radius: D.radius, color: D.moon, intensity: D.light * breathe });
        this.lights.push(id);
      }
      // Where the spill lands: down and in from the doorway.
      const ca = Math.cos(D.angle);
      const sa = Math.sin(D.angle);
      if (!seen(cx, cy, 200) && !seen(cx - dir * ca * D.beam, cy + sa * D.beam, 200)) continue;
      // The opening: the night beyond, brightest past the threshold.
      glowBack.add(cx + dir * 30, cy, 150, D.moon, D.glow * breathe, D.half * 1.1);
      glowBack.add(cx + dir * 110, cy - 10, 80, D.core, 0.32 * breathe, D.half * 0.8);
      glowFront.add(cx + dir * 120, cy, 46, D.core, 0.22 * breathe, D.half * 0.6);
      // The spill: overlapping soft ellipses along the beam, widening and fading as it falls into the hollow.
      const rot = dir > 0 ? -D.angle : D.angle;
      for (let k = 0; k < 16; k++) {
        const t = (k + 0.5) / 16;
        const sway = Math.sin(clock * 0.5 + t * 4) * 8 * t;
        const bx = cx - dir * (ca * D.beam * t) + sway;
        const by = cy + sa * D.beam * t;
        glowBack.add(
          bx,
          by,
          80 + 120 * t,
          D.moon,
          D.beamA * 0.6 * breathe * (1 - 0.55 * t),
          34 + 44 * t,
          rot,
        );
      }
      const fx = cx - dir * ca * D.beam * 0.95;
      const fy = floorUnder(sim, fx, cy + 40);
      if (fy - cy < D.beam * 1.2) glowBack.add(fx, fy - 6, 230, D.moon, 0.12 * breathe, 26);
      // The motes: up out of the hollow along the light, quickening and brightening toward the door, out through it.
      for (let m = 0; m < D.motes; m++) {
        const q = hash01(`${l.id}m`, m);
        const q2 = hash01(`${l.id}n`, m);
        const trip = D.trip[0] + (D.trip[1] - D.trip[0]) * q2;
        const v = (clock / trip + q) % 1;
        const t = v ** 1.35;
        const sx = cx - dir * (D.reach[0] + (D.reach[1] - D.reach[0]) * q);
        const sy = Math.min(fy - 40, cy + 240 + 260 * q2);
        const ex = cx + dir * (90 + 60 * q);
        const ey = cy - 30 + 60 * q2;
        // An arc rising over the straight line, a wander across it.
        const lift = 120 + 120 * q2;
        const x = sx + (ex - sx) * t + Math.sin(clock * 0.9 + m * 1.7) * 14 * (1 - t);
        const y = sy + (ey - sy) * t - lift * Math.sin(Math.PI * t) + Math.cos(clock * 1.1 + m) * 8 * (1 - t);
        const a = Math.sin(Math.PI * Math.min(1, v * 1.15)) * (0.35 + 0.65 * t);
        if (a <= 0.02 || !seen(x, y)) continue;
        back.circle(x, y, 1.3 + 1.4 * q).fill({ color: D.core, alpha: 0.9 * a });
        if (m % 3 === 0) glowFront.add(x, y, 14 + 8 * q, D.moon, 0.3 * a);
      }
    }
  }

  // --- The first fling's stream of moths.
  private drawSpill(
    dt: number,
    clock: number,
    sim: SimView,
    back: Graphics,
    front: Graphics,
    glow: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const s = this.spill;
    if (!s) return;
    const A = ACTS.spill;
    const burning = (sim.lures.hp[s.lure] ?? 0) > 0;
    const done = !!s.l.sets && sim.save.flags.includes(s.l.sets);
    const want = burning && !done ? 1 : 0;
    s.k += (want - s.k) * Math.min(1, (dt / (want ? 1.2 : A.out)) * 2.2);
    if (s.k < 0.01 || !seen(s.l.x, s.l.y, 600)) return;
    const fx = s.l.x;
    const fy = s.l.y;
    const dx = s.ex - fx;
    const dy = s.ey - fy;
    const len = Math.hypot(dx, dy);
    // The arc sags under the straight line (a moth glides down and out), then they come back higher.
    const nx = -dy / len;
    const ny = dx / len;
    const sag = len * A.sag * (dx >= 0 ? 1 : -1);
    for (let k = 0; k < A.n; k++) {
      const r = hash01('spill', k);
      const r2 = hash01('spill2', k);
      const loop = A.loop[0] + (A.loop[1] - A.loop[0]) * r;
      const u = (clock / loop + r2) % 1;
      // Out over 0..0.62 of its loop along the low arc, back over the rest along a high one (wider, faster).
      const out = u < 0.62;
      const v = out ? u / 0.62 : 1 - (u - 0.62) / 0.38;
      const bend = out ? sag * (0.7 + 0.6 * r) : -sag * (0.25 + 0.3 * r);
      const wob = Math.sin(clock * (2 + 2 * r) + k) * 14;
      const b = 4 * v * (1 - v) * bend;
      const x = fx + dx * v + nx * (b + wob);
      const y = fy + dy * v + ny * (b + wob) + Math.sin(clock * 3.1 + k * 1.7) * 6;
      // Heading: along the path, turned round on the way back.
      const ang =
        Math.atan2(dy + ny * bend * (4 - 8 * v), dx + nx * bend * (4 - 8 * v)) + (out ? 0 : Math.PI);
      const near = 1 - smooth(0, 0.55, v);
      // Scattering once flung: every moth peels off its line and fades.
      const a =
        s.k *
        (out ? 0.75 + 0.25 * near : 0.35) *
        smooth(0, 0.06, v) *
        smooth(0, 0.08, 1 - v) *
        (0.8 + 0.2 * r);
      const size = A.size[0] + (A.size[1] - A.size[0]) * r2;
      const flap = Math.sin(clock * (A.beat[0] + (A.beat[1] - A.beat[0]) * r) * 2 * Math.PI);
      const g = r < 0.35 ? front : back;
      moth(g, x, y, size, flap, ang, near * 0.9 + 0.1, a);
      if (near > 0.5) glow.add(x, y, 10, A.lit, 0.18 * a * near);
    }
  }

  // --- An ambush's tell while its creature is on its way (the delay after the flag).
  private drawTells(
    clock: number,
    sim: SimView,
    back: Graphics,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const L = sim.light;
    const spawns = sim.scene.enemies ?? [];
    if (!L?.hidden || !L.respawn) return;
    const A = ACTS.arrive;
    const delay = Math.max(1, Math.round(tuning.enemies.arriveDelayFrames));
    spawns.forEach((s, i) => {
      if (!s.arrive || !L.hidden?.[i] || !(L.respawn?.[i] ?? 0)) return;
      const left = L.respawn?.[i] ?? 0;
      const u = 1 - Math.min(1, left / delay);
      // Its point: as the sim will pick (the first 400+ px from her, else the farthest).
      const e = sim.enemies[i];
      const ox = (e?.homeX ?? s.x) - s.x;
      const oy = (e?.homeY ?? s.y) - s.y;
      const bx = sim.player.cx - ox;
      const by = sim.player.cy - oy;
      let pick = s.arrive[0] as [number, number];
      let far = -1;
      for (const a of s.arrive) {
        const d = (a[0] - bx) ** 2 + (a[1] - by) ** 2;
        if (d >= 400 * 400) {
          pick = a;
          break;
        }
        if (d > far) {
          far = d;
          pick = a;
        }
      }
      const fx = pick[0] + ox;
      const fy = pick[1] + oy;
      if (!seen(fx, fy)) return;
      const hw = (e?.w ?? 60) / 2;
      const w = arriveWay(sim, s.kind, fx, fy, s.x + ox, s.y + oy, hw);
      const n = 8 + Math.floor(u * 16);
      if (w.way === 'drop' || w.way === 'fly') {
        // Grit trickling from the underside it will come from.
        const top = roofOver(sim, fx, fy);
        const floor = floorUnder(sim, fx, fy);
        for (let k = 0; k < n; k++) {
          const r = hash01('tell', k + i * 31);
          const v = (clock * (0.9 + 0.8 * r) + r) % 1;
          const gx = fx + (r - 0.5) * A.grit;
          const gy = top + v * v * Math.min(600, floor - top);
          back
            .rect(gx, gy, 2.2, 3 + 4 * v)
            .fill({ color: k % 3 ? A.dust : A.cloud, alpha: 0.85 * u * (1 - v * 0.7) });
        }
      } else if (w.way === 'mouth') {
        // Out of the passage's dark: dust breathing out along the floor, and eyes catching the light in there.
        const floor = floorUnder(sim, fx, fy - 30);
        for (let k = 0; k < n; k++) {
          const r = hash01('tell', k + i * 31);
          const v = (clock * (0.5 + 0.5 * r) + r) % 1;
          const px = w.wallX + w.dir * (20 + v * 160 * (0.4 + r));
          const py = floor - 4 - v * (10 + 26 * r);
          back.circle(px, py, 3 + 7 * v).fill({ color: k % 2 ? A.cloud : A.dust, alpha: 0.5 * u * (1 - v) });
        }
        // (Each creature its own pair, deeper in for the later ones; a blink now and then.)
        const deep = 40 + 30 * (i % 3);
        const ex = w.wallX + w.dir * (A.mouthDark[0] * 0.5 - deep);
        const ey = floor - 18 - 14 * (i % 2) - (s.kind === 'burrback' ? 14 : 0);
        const blink = Math.sin(clock * 2.3 + i * 1.7) > 0.93 ? 0.1 : 1;
        const ea = smooth(0.15, 0.6, u) * blink;
        for (const sd of [-1, 1]) back.circle(ex + sd * 6, ey, 2.2).fill({ color: A.eyes, alpha: 0.9 * ea });
      } else {
        // Dust breathing out of the wall's foot or the ground where it will break through.
        const gx = w.way === 'wall' ? w.wallX : fx;
        const floor = floorUnder(sim, fx, fy - 30);
        for (let k = 0; k < n; k++) {
          const r = hash01('tell', k + i * 31);
          const v = (clock * (0.7 + 0.6 * r) + r) % 1;
          const px = gx + (w.way === 'wall' ? w.dir * (8 + v * 40 * r) : (r - 0.5) * 70);
          const py = floor - 4 - v * (20 + 30 * r);
          back
            .circle(px, py, 2.5 + 6 * v)
            .fill({ color: k % 2 ? A.cloud : A.dust, alpha: 0.55 * u * (1 - v) });
        }
        // The ground or the wall's foot shudders: a crack darkening.
        const cx = w.way === 'wall' ? w.wallX : fx;
        back
          .moveTo(cx - 18 * u, floor - (w.way === 'wall' ? 36 * u : 0))
          .lineTo(cx + 6 * u, floor - (w.way === 'wall' ? 14 : 2))
          .lineTo(cx + 22 * u, floor)
          .stroke({ color: A.hole, width: 2 + 2 * u, alpha: 0.8 * u });
      }
    });
  }

  // --- The arrivals themselves.
  private drawArrivals(
    dt: number,
    clock: number,
    sim: SimView,
    back: Graphics,
    front: Graphics,
    glow: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const A = ACTS.arrive;
    for (const [key, a] of this.arrivals) {
      a.t += dt;
      const e = sim.enemies[a.i];
      const end = a.secs + Math.max(A.open, A.land) + 0.3;
      if (a.t > end || !e || (e.gone && a.t > 0.2)) {
        this.arrivals.delete(key);
        continue;
      }
      if (!seen(a.x, a.y) && !seen(a.fromX, a.fromY)) continue;
      const u = Math.min(1, a.t / a.secs);
      if (a.way === 'drop') {
        const top = roofOver(sim, a.fromX, a.fromY);
        // Grit and a few torn rootlets falling with it, early.
        for (let k = 0; k < 10; k++) {
          const r = hash01('dropgrit', k + a.i * 17);
          const v = Math.min(1, a.t * (1.2 + r) * 0.9);
          if (v >= 1) continue;
          const gx = a.fromX + (r - 0.5) * 2 * a.hw;
          const gy = top + v * v * (a.floor - top);
          back.rect(gx, gy, 1.8, 3 + 4 * v).fill({ color: A.dust, alpha: 0.7 * (1 - v) });
        }
        // Its shadow on the floor: grows and darkens as it nears.
        const sx = a.fromX + (a.x - a.fromX) * u;
        const sk = u < 1 ? smooth(0, 1, u) : 1 - smooth(0, 0.25, a.t - a.secs);
        const sw = A.shadow * (0.35 + 0.65 * sk);
        back.ellipse(sx, a.floor - 2, sw, sw * 0.16).fill({ color: A.hole, alpha: A.shadowA * sk });
        // The landing: a burst of dust both ways, a ring of grit.
        const lt = a.t - a.secs * 0.97;
        if (lt > 0 && lt < A.land) this.burst(back, glow, a.x, a.floor, lt / A.land, a.i, 1.2);
      } else if (a.way === 'wall') {
        // A burrow mouth torn in the wall's foot (stays open a while): a ragged hole into the wood with a crumbled
        // lit rim, a cloud of earth bursting out of it, clods spilled on the floor before it.
        const open = smooth(0, 0.18, a.t) * (1 - smooth(a.secs + A.open - 0.8, a.secs + A.open, a.t));
        const mw = Math.max(A.mouth[0], a.hw * 2.1);
        const mh = Math.max(A.mouth[1], a.hh * 2.2);
        this.hole(back, a.wallX, a.floor, a.dir, mw * open, mh * open, a.i);
        for (let k = 0; k < 7; k++) {
          const r = hash01('spillE', k + a.i * 13);
          const px = a.wallX + a.dir * (10 + r * 120 * smooth(0, 0.5, a.t));
          back.ellipse(px, a.floor - 2, 5 + 9 * r, 3 + 3 * r).fill({ color: A.dirt, alpha: 0.95 * open });
        }
        // Earth thrown out as it comes, and the cloud.
        if (u < 1) this.spray(back, a.wallX + a.dir * 6, a.floor - mh * 0.6, a.dir, a.t, a.i);
        this.cloud(back, a.wallX + a.dir * 30, a.floor - mh * 0.5, a.dir, a.t, a.i, mh);
        // Clods over its back while it is still in the mouth (its rear end is in the wood).
        const lip = 1 - smooth(0.2, 0.5, u);
        if (lip > 0.01)
          for (let k = 0; k < 5; k++) {
            const r = hash01('lip', k + a.i * 7);
            front
              .ellipse(
                a.wallX - a.dir * (2 + 10 * r),
                a.floor - mh * (0.15 + 0.85 * (k / 4)),
                9 + 8 * r,
                7 + 5 * r,
              )
              .fill({ color: A.earth, alpha: lip });
          }
      } else if (a.way === 'mouth') {
        // It comes out of the passage's dark (a shadow over the mouth while the wave comes, in front of it), kicking
        // dust out along the floor.
        const floor = floorUnder(sim, a.fromX, a.fromY - 30);
        const dark = smooth(0, 0.2, a.t) * (1 - smooth(a.secs, a.secs + 0.8, a.t));
        if (dark > 0.01) {
          // (Nested soft ovals round the passage's foot: strips with ruled edges read as a curtain.)
          const D = A.mouthDark[0];
          for (let k = 0; k < 8; k++) {
            const q = 1 - k / 8;
            front
              .ellipse(a.wallX, floor - 70, D * q, 170 * q)
              .fill({ color: A.hole, alpha: A.mouthDark[1] * dark * 0.16 });
          }
        }
        if (u < 0.7) this.spray(back, a.wallX + a.dir * 90, floor - 8, a.dir, a.t, a.i);
        this.cloud(back, a.wallX + a.dir * 120, floor - 20, a.dir, a.t, a.i, Math.max(40, a.hh * 2));
      } else if (a.way === 'ground') {
        // It digs out of the floor: a mound thrown up, a hole left, dust.
        const open = smooth(0, 0.15, a.t) * (1 - smooth(a.secs + A.open - 0.8, a.secs + A.open, a.t));
        const hx = a.fromX;
        back.ellipse(hx, a.floor - 2, 40 * open, 9 * open).fill({ color: A.hole, alpha: 0.9 });
        for (let k = 0; k < 9; k++) {
          const r = hash01('mound', k + a.i * 7);
          const side = k % 2 ? 1 : -1;
          const px = hx + side * (34 + r * 50 * smooth(0, 0.4, a.t));
          back.ellipse(px, a.floor - 3, 7 + 9 * r, 4 + 4 * r).fill({ color: A.dirt, alpha: 0.9 * open });
        }
        if (u < 0.6) this.spray(back, hx, a.floor - 6, 0, a.t, a.i);
        this.cloud(back, hx, a.floor - 16, 0, a.t, a.i, Math.max(40, a.hh * 2));
        // The mound in front of it while it heaves itself out.
        const m = 1 - smooth(0.12, 0.42, u);
        if (m > 0.01) {
          const W = A.mound;
          front
            .moveTo(hx - W, a.floor + 2)
            .bezierCurveTo(
              hx - W * 0.6,
              a.floor - 30 * m,
              hx + W * 0.5,
              a.floor - 34 * m,
              hx + W,
              a.floor + 2,
            )
            .closePath()
            .fill({ color: A.earth, alpha: Math.min(1, m * 1.4) });
          front
            .moveTo(hx - W * 0.7, a.floor - 14 * m)
            .bezierCurveTo(
              hx - W * 0.3,
              a.floor - 30 * m,
              hx + W * 0.3,
              a.floor - 32 * m,
              hx + W * 0.6,
              a.floor - 16 * m,
            )
            .stroke({ color: A.lit, width: 1.6, alpha: 0.4 * m });
        }
      } else {
        // On the wing: dust shaken off as it comes, a faint wake.
        const ex = e.x + e.w / 2;
        const ey = e.y + e.h / 2;
        for (let k = 0; k < 6; k++) {
          const r = hash01('wake', k + a.i * 5);
          const v = (a.t * (1.5 + r) + r) % 1;
          const px = ex - (a.x - a.fromX) * 0.08 * v + (r - 0.5) * 30;
          const py = ey + v * 50;
          back.circle(px, py, 1.4 + 1.6 * r).fill({ color: A.dust, alpha: 0.5 * (1 - v) * (1 - u * 0.6) });
        }
      }
      void clock;
    }
  }

  /** A ragged hole into a wall face at its foot (`dir` = the open side), its rim crumbled and lit on the open side. */
  private hole(g: Graphics, wx: number, floor: number, dir: number, w: number, h: number, i: number): void {
    if (w < 2 || h < 2) return;
    const A = ACTS.arrive;
    const cy = floor - h * 0.55;
    const pts: number[] = [];
    const rim: number[] = [];
    const n = 14;
    for (let k = 0; k <= n; k++) {
      const ang = -Math.PI / 2 + (Math.PI * k) / n;
      const r = 0.82 + 0.3 * hash01('hole', k + i * 29);
      // Into the wood (behind the face) it is a full half-ellipse; out past the face only a few px of lip.
      const x = wx - dir * Math.cos(ang) * w * 0.5 * r;
      const y = cy + Math.sin(ang) * h * 0.55 * r;
      pts.push(x, Math.min(floor, y));
      if (k > 0 && k < n) rim.push(x, Math.min(floor, y));
    }
    pts.push(wx + dir * 6, floor, wx + dir * 6, cy - h * 0.5);
    g.poly(pts).fill({ color: A.hole });
    // The crumbled rim, a broken lit line round the top of the hole.
    for (let k = 0; k + 3 < rim.length; k += 4)
      g.moveTo(rim[k] as number, (rim[k + 1] as number) - 2)
        .lineTo(rim[k + 2] as number, (rim[k + 3] as number) - 2)
        .stroke({ color: A.rim, width: 2.2, alpha: 0.55 });
  }

  /** A cloud of earth bursting out of a hole and settling (dark against a pale air, soft). */
  private cloud(g: Graphics, x: number, y: number, dir: number, t: number, i: number, size: number): void {
    const A = ACTS.arrive;
    const v = t / 1.1;
    if (v >= 1) return;
    for (let k = 0; k < 9; k++) {
      const r = hash01('cloud', k + i * 11);
      const r2 = hash01('cloud2', k + i * 11);
      const reach = (1 - (1 - v) ** 2.2) * (30 + 120 * r);
      const px = x + (dir !== 0 ? dir : k % 2 ? 1 : -1) * reach + (r2 - 0.5) * 30;
      const py = y - reach * (0.2 + 0.5 * r2) + v * 20;
      g.circle(px, py, (0.25 + 0.5 * r) * size * (0.5 + v)).fill({
        color: A.cloud,
        alpha: 0.3 * (1 - v) * (1 - v),
      });
    }
  }

  /** Earth thrown out of a hole: clods on arcs, `dir` 0 = both ways. */
  private spray(g: Graphics, x: number, y: number, dir: number, t: number, i: number): void {
    const A = ACTS.arrive;
    for (let k = 0; k < 12; k++) {
      const r = hash01('spray', k + i * 19);
      const r2 = hash01('spray2', k + i * 19);
      const born = r2 * 0.5;
      const v = (t - born) / 0.55;
      if (v <= 0 || v >= 1) continue;
      const side = dir !== 0 ? dir : k % 2 ? 1 : -1;
      const vx = side * (40 + 140 * r);
      const vy = -(120 + 160 * r2);
      const s = v * 0.55;
      const px = x + vx * s;
      const py = y + vy * s + 0.5 * 900 * s * s;
      g.circle(px, py, 1.6 + 2.4 * r).fill({ color: k % 3 ? A.dirt : A.lit, alpha: 0.9 * (1 - v * 0.6) });
    }
  }

  /** A landing's dust: two low fans and a ring of grit, `v` 0..1 through it. */
  private burst(g: Graphics, glow: GlowPool, x: number, y: number, v: number, i: number, k: number): void {
    const A = ACTS.arrive;
    for (let n = 0; n < 12; n++) {
      const r = hash01('burst', n + i * 23);
      const side = n % 2 ? 1 : -1;
      const reach = (40 + 90 * r) * k;
      const px = x + side * reach * (1 - (1 - v) ** 2);
      const py = y - 6 - (10 + 22 * r) * Math.sin(Math.PI * Math.min(1, v * 1.4)) * 0.8;
      g.circle(px, py, (5 + 9 * r) * (0.5 + v)).fill({ color: A.dust, alpha: 0.28 * (1 - v) });
    }
    glow.add(x, y - 10, 60 * k, A.dust, 0.06 * (1 - v));
  }

  // --- The patch flare.
  private drawFlares(
    dt: number,
    clock: number,
    back: Graphics,
    glowBack: GlowPool,
    glowFront: GlowPool,
  ): void {
    const F = ACTS.flare;
    for (let n = this.flares.length - 1; n >= 0; n--) {
      const f = this.flares[n] as { x: number; y: number; t: number };
      f.t += dt;
      const v = f.t / F.secs;
      if (v >= 1) {
        this.flares.splice(n, 1);
        continue;
      }
      // A ring running out along the ground (flat), thinning as it goes.
      const ring = 1 - (1 - Math.min(1, v * 1.4)) ** 3;
      const R = 30 + F.ring * ring;
      back
        .ellipse(f.x, f.y - 2, R, R * F.flat)
        .stroke({ color: F.color, width: 2.4 * (1 - v) + 0.5, alpha: 0.7 * (1 - v) });
      // The column: up quickly, then breathing out.
      const c = smooth(0, 0.12, v) * (1 - smooth(0.3, 1, v));
      glowBack.add(f.x, f.y - F.column * 0.45, 70, F.color, 0.3 * c, F.column * 0.6);
      glowFront.add(f.x, f.y - 6, 120 * (0.6 + 0.4 * ring), F.color, 0.22 * c, 26);
      glowFront.add(f.x, f.y - 30, 26, F.core, 0.4 * c);
      // Motes lifting off it.
      for (let k = 0; k < F.motes; k++) {
        const r = hash01('flare', k);
        const m = Math.min(1, v * (1.1 + 0.6 * r));
        const mx = f.x + (r - 0.5) * 120 + Math.sin(clock * 1.7 + k) * 5;
        const my = f.y - 8 - m * (80 + 140 * r);
        back.circle(mx, my, 1.2 + 1.2 * r).fill({ color: F.core, alpha: 0.85 * Math.sin(Math.PI * m) });
      }
    }
  }

  // --- The kin's kept lights.
  private drawKept(
    clock: number,
    sim: SimView,
    back: Graphics,
    glowBack: GlowPool,
    glowFront: GlowPool,
    seen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const K = ACTS.kept;
    const lms = (
      sim.scene.marks as { landmarks?: Array<{ id: string; kind: string; x: number; y: number }> } | undefined
    )?.landmarks;
    let n = 0;
    for (const l of lms ?? []) {
      if (l.kind !== 'light') continue;
      const id = `kept-${l.id}`;
      // A steady flame, breathing slowly; the odd small gutter.
      const r = hash01(l.id, 1);
      const breathe = 0.9 + 0.06 * Math.sin(clock * 1.3 + r * 6) + 0.04 * Math.sin(clock * 3.7 + r * 9);
      const gutter = Math.max(0, Math.sin(clock * 0.37 + r * 4)) ** 24 * 0.25;
      const k = breathe - gutter;
      const fy = floorUnder(sim, l.x, l.y - 30);
      const light = this.reg.get(id);
      if (light) {
        light.x = l.x;
        light.y = fy - K.husk - 8;
        light.intensity = K.light * k;
      } else {
        this.reg.set(id, {
          x: l.x,
          y: fy - K.husk - 8,
          radius: K.reach,
          color: K.warm,
          intensity: K.light * k,
        });
        this.lights.push(id);
      }
      n++;
      if (!seen(l.x, fy)) continue;
      const H = K.husk;
      // The husk: a split seed case set in the ground (a deep cup), warm light on the inside of its far wall and lip.
      back
        .moveTo(l.x - H * 0.9, fy - H * 0.82)
        .bezierCurveTo(l.x - H * 1.12, fy - H * 0.2, l.x - H * 0.55, fy + 3, l.x, fy + 3)
        .bezierCurveTo(l.x + H * 0.55, fy + 3, l.x + H * 1.12, fy - H * 0.2, l.x + H * 0.9, fy - H * 0.82)
        .closePath()
        .fill(K.husk0);
      // A few ribs down its side (a seed case, not a pot).
      for (let q = -1; q <= 1; q++)
        back
          .moveTo(l.x + q * H * 0.45, fy - H * 0.86)
          .quadraticCurveTo(l.x + q * H * 0.62, fy - H * 0.3, l.x + q * H * 0.3, fy)
          .stroke({ color: K.huskLit, width: 1.2, alpha: 0.35 * k });
      back.ellipse(l.x, fy - H * 0.82, H * 0.86, H * 0.26).fill({ color: K.huskLit, alpha: 0.95 * k });
      back.ellipse(l.x, fy - H * 0.78, H * 0.62, H * 0.14).fill({ color: K.warm, alpha: 0.75 * k });
      // Its torn halves, curling back off the cup, lit on their inner edge.
      for (const sd of [-1, 1]) {
        const tx = l.x + sd * H * (sd < 0 ? 1.35 : 1.15);
        const ty = fy - H * (sd < 0 ? 1.7 : 1.35);
        back
          .moveTo(l.x + sd * H * 0.98, fy - H * 0.5)
          .quadraticCurveTo(l.x + sd * H * 1.25, fy - H * 1.0, tx, ty)
          .quadraticCurveTo(l.x + sd * H * 0.95, fy - H * 1.0, l.x + sd * H * 0.7, fy - H * 0.72)
          .closePath()
          .fill(K.husk0);
        back
          .moveTo(l.x + sd * H * 0.72, fy - H * 0.74)
          .quadraticCurveTo(l.x + sd * H * 0.97, fy - H * 1.02, tx, ty)
          .stroke({ color: K.huskLit, width: 1.6, alpha: 0.8 * k });
      }
      // The flame: low and steady, a teardrop that leans with the air.
      const fx = l.x + Math.sin(clock * 1.1 + r) * 1.5;
      const top = fy - H * 0.8 - K.flame * k;
      const lean = Math.sin(clock * 0.9 + r * 3) * 2.5;
      const base = fy - H * 0.8;
      back
        .moveTo(fx - 6, base)
        .bezierCurveTo(fx - 7, base - K.flame * 0.5, fx + lean - 2, top + 4, fx + lean, top)
        .bezierCurveTo(fx + lean + 2, top + 4, fx + 7, base - K.flame * 0.5, fx + 6, base)
        .closePath()
        .fill({ color: K.flameC, alpha: 0.95 });
      back
        .ellipse(fx + lean * 0.3, base - K.flame * 0.32, 2.6, K.flame * 0.32)
        .fill({ color: 0xfff4e0, alpha: 0.95 });
      glowFront.add(fx, base - K.flame * 0.4, 26, K.core, 0.75 * k);
      glowFront.add(fx, base - K.flame * 0.3, 70, K.warm, 0.22 * k);
      glowBack.add(fx, fy - 40, K.reach * 0.6, K.warm, 0.3 * k, K.reach * 0.42);
      glowBack.add(fx, fy - 4, K.reach * 0.45, K.warm, 0.3 * k, 26);
      // A few embers lifting off it.
      for (let m = 0; m < 4; m++) {
        const q = hash01(`${l.id}e`, m);
        const v = (clock * (0.18 + 0.1 * q) + q) % 1;
        const ex = fx + Math.sin(clock * 1.3 + m * 2) * (4 + 10 * v);
        const ey = top - v * 90;
        back.circle(ex, ey, 1 + q * 0.6).fill({ color: K.core, alpha: 0.8 * Math.sin(Math.PI * v) });
      }
    }
    void n;
  }

  destroy(): void {
    for (const id of this.lights) this.reg.remove(id);
    this.lights.length = 0;
  }
}
