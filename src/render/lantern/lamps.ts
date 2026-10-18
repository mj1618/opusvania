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
import { hash01, LR } from './config';
import type { GlowPool } from './glow';
import { MothClouds, mothCount } from './moths';

const AT = { x: 0, y: 0 };

interface LampInfo {
  /** Where its thread is tied (null: hangs from a twig out of the dark above). */
  tieY: number | null;
  /** A moonwick standing on something: the ground under it (null: it hangs). */
  standY: number | null;
  size: number;
  moonwick: boolean;
  moths: number;
}

interface Fx {
  kind: 'snuff' | 'kindle' | 'fan' | 'refuse' | 'cold' | 'launch' | 'snap' | 'relight';
  x: number;
  y: number;
  t: number;
  life: number;
  i: number;
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
  /** Lamps flung from and smouldering (by index). */
  private readonly embers = new Set<number>();
  /** Seconds since a lamp went out here (by index), for the husk's settle. */
  private readonly outT = new Map<number, number>();
  /** Moonwick kindle blooms: seconds since (by index). */
  private readonly lit = new Map<number, number>();
  /** Point light ids this module registered last frame. */
  private readonly lightIds = new Set<string>();
  private readonly clouds: MothClouds;

  constructor(
    private readonly scene: SimView['scene'],
    private readonly lights: LightRegistry,
  ) {
    const lures = scene.lures ?? [];
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
      this.info.push({
        tieY,
        standY: moonwick ? standY : null,
        size: sizeOf(l),
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
    this.clouds = new MothClouds(
      lures.map((l, i) => {
        const inf = this.info[i] as LampInfo;
        const firefly = l.id.includes('firefly');
        return {
          x: l.x,
          y: l.y,
          size: firefly ? 70 : inf.size,
          count: inf.moonwick ? 0 : mothCount(firefly ? 70 : inf.size, firefly ? 1.6 : 1),
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
          this.fx.push({ kind: 'snuff', x: ev.x, y: ev.y, t: 0, life: 0.9, i });
          this.burst(ev.x, ev.y, ev.moths ?? 0, ev.id ?? '', sim);
          break;
        }
        case 'lureEmber':
          this.embers.add(i);
          break;
        case 'lureRelight':
          this.embers.delete(i);
          this.outT.delete(i);
          this.fx.push({ kind: 'relight', x: ev.x, y: ev.y, t: 0, life: 0.5, i });
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
        case 'lureCold':
          this.fx.push({ kind: 'cold', x: ev.x, y: ev.y, t: 0, life: 0.8, i });
          break;
      }
    }
  }

  /** Moths out of a snuffed lamp: they burst out, then stream to the nearest real moonlight. */
  private burst(x: number, y: number, n: number, id: string, sim: SimView): void {
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
    const count = Math.min(LR.lamp.freedMax, Math.max(4, n));
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
      });
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
    const halfW = cam.w / 2 / cam.zoom + 200;
    const halfH = cam.h / 2 / cam.zoom + 200;
    const cands: Array<{ i: number; d: number; x: number; y: number; r: number; c: number; k: number }> = [];
    const fling = (p as unknown as { fling?: number }).fling ?? -1;
    for (let i = 0; i < lures.length; i++) {
      const l = lures[i] as Lure;
      const info = this.info[i] as LampInfo;
      const at = flameAt(sim.lures, i, l, f, tuning, AT);
      const x = at.x;
      const y = at.y;
      if (Math.abs(x - cam.x) > halfW + 400 || Math.abs(y - cam.y) > halfH + 400) continue;
      const hp = sim.lures.hp[i] ?? 0;
      const burning = hp > 0;
      if (!info.moonwick) this.clouds.set(i, x, y, burning && !this.embers.has(i), dt);
      const s = info.size;
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
      // The thread it hangs by (a swinging lamp's runs from its pivot).
      const topY = y - s * 0.62;
      const tieX = l.swing ? l.x : x;
      const tieY = info.tieY ?? y - 900;
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
        mid.add(x, y + s * 0.12, s * 0.5 * flick, LR.lamp.core, 0.55 * flick, s * 0.62 * flick);
        // The halo (bloom carries it further).
        glow.add(x, y, s * 2.4 * flick, LR.lamp.halo, 0.3);
        cands.push({
          i,
          d: Math.hypot(x - cam.x, y - cam.y),
          x,
          y,
          r: LR.lamp.light[l.kind as 'wick'] ?? 300,
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
    this.drawFreed(dt, clock, front, glowFront);
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
        glow.add(f.x, f.y, 40 + 60 * e, LR.lamp.halo, 0.6 * (1 - u));
      }
    }
  }

  private drawFreed(dt: number, clock: number, front: Graphics, glow: GlowPool): void {
    for (let k = this.freed.length - 1; k >= 0; k--) {
      const m = this.freed[k] as Freed;
      m.age += dt;
      if (m.age < 0) continue;
      if (m.age > m.life) {
        this.freed.splice(k, 1);
        continue;
      }
      // Out in a burst, then steering to the moonlight, faster as they go.
      const steer = Math.min(1, Math.max(0, (m.age - 0.35) / 0.8));
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 220 + 340 * steer;
      m.vx += ((dx / d) * speed - m.vx) * Math.min(1, dt * 2.2 * steer + dt * 0.4);
      m.vy += ((dy / d) * speed - m.vy) * Math.min(1, dt * 2.2 * steer + dt * 0.4);
      m.vx += Math.sin(clock * 7 + m.seed * 40) * 40 * dt * 10;
      m.vy += Math.cos(clock * 6 + m.seed * 30) * 30 * dt * 10;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const fade = Math.min(1, m.age * 4) * Math.min(1, (m.life - m.age) * 1.5) * (d < 60 ? d / 60 : 1);
      const flap = Math.abs(Math.sin(clock * 30 + m.seed * 50));
      const w = 6 + 4 * m.seed;
      moth(front, m.x, m.y, w, flap, m.vx >= 0 ? 1 : -1, LR.lamp.freed, 0.95 * fade);
      if (m.age < 0.6) glow.add(m.x, m.y, 10, LR.lamp.halo, 0.3 * (1 - m.age / 0.6));
    }
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

  /** Forgets this module's lights (the room is going). */
  destroy(): void {
    for (const id of this.lightIds) this.lights.remove(id);
    this.clouds.destroy();
  }
}
