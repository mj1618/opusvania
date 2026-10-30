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
 *
 * Render only: reads the sim view and the room, never writes. Deterministic: hashes and the render clock.
 */
import type { Graphics } from 'pixi.js';
import type { Lure } from '../../sim/scene';
import { tuning } from '../../sim/tuning';
import type { CameraView, SimView } from '../contract';
import type { LightRegistry } from '../lights';
import { hash01 } from './config';
import type { GlowPool } from './glow';

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

type ArriveWay = 'drop' | 'wall' | 'ground' | 'fly';
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
