/**
 * The escape, drawn (the Canopy r14, docs/design/levels/canopy-moments.md moment 7; the sim is src/sim/escape.ts,
 * `scene.escape`, `state.kit.escape`, memory/canopy.md v14): after the great release the den's roof gives and she
 * climbs out ahead of it.
 *
 *   rocks     each `rockfall` keyed to her progress: its tell first (a crack spreading in the roof over it, grit
 *             trickling, the clod shaking loose, its shadow on what it will hit darkening), then the fall (a clod of
 *             earth and roots with a dust trail, `kit.escape.rockY`), then the land (a burst, a little heap left)
 *   front     the collapse front (`kit.escape.front` while `frontOn`): a wall of falling earth and roots rising under
 *             her, its top churning, clods thrown up off it, a dust bank over it; opaque near-black below
 *   dust      grit and dust pouring off the roof everywhere in view, more as it goes on (the shake is the camera's:
 *             camera/shake.ts `escapeRumble`)
 *   cloud     the freed moths stream ahead of her along `escape.path` toward the moonlight: the only light that leads
 *   goal      the moonlight above (the roof's beam is keeper.ts's): a cool glow at the path's end, stronger as she nears
 *
 * Render only: reads the scene and the kit state, never writes them.
 */
import { Container, Graphics } from 'pixi.js';
import type { CameraView, SimView } from '../contract';
import type { LightRegistry, PointLight } from '../lights';
import type { SceneContext } from '../scene/index';
import { mix } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';
import { moth } from './lamps';

export const ESCAPE = {
  /** The tell: the crack's reach (px), grit per second at its end, the shadow's alpha at its end. */
  tell: { crack: 110, grit: 0xc4b092, shadow: 0.6, shake: 5 },
  /**
   * A falling clod: its colours (body, mid, the moonlit rim: r15, near-black clods were lost on the darkened den), the
   * trail's length (px), its size (x the rock's width, at least `min` px).
   */
  rock: { body: 0x1e1610, mid: 0x46372a, lit: 0xaab6c6, trail: 170, roots: 4, size: 1.1, min: 72 },
  /** The heap a landed rock leaves (x its width), the burst's grains. */
  land: { heap: 1.3, grains: 40 },
  /**
   * The collapse front: its body colour, the churning top's amplitude (px), clods thrown off it a second, the dust
   * bank's height over it (px) and alpha.
   */
  front: {
    body: 0x070504,
    edge: 0x231a13,
    mid: 0x3a2d22,
    /** Its rim, lit by the moonlit column over the den (cool, so it reads against the warm earth). */
    lit: 0x9aa6b6,
    /** How far a crown heaves (px), the lumps' spacing (px), torn roots' length (px). */
    churn: 40,
    /** The churning clods: one a slot `lump` px apart, radius (px). Torn roots on every fifth slot: length, width. */
    lump: 30,
    clodR: [10, 34] as const,
    root: [90, 200] as const,
    rootW: 18,
    clods: 26,
    /** Dust boiling off it: puffs a second per 1000 px, their radius (px, start / end), rise (px), alpha, colours. */
    puffs: 10,
    puffR: [24, 90] as const,
    puffRise: 170,
    puffA: 0.42,
    dust: 0x221a13,
    dustLit: 0x6e665c,
    /** Curtains of earth pouring off the roof into it (behind her): how many across the view, their width (px). */
    curtains: 7,
    curtainW: [40, 110] as const,
  },
  /** Roof grit while it runs: grains per second per 1000 px of view, at its start and after `buildSecs`. */
  dust: { rate: [40, 140] as const, buildSecs: 16, color: 0x5e4e3e },
  /** The cloud along the path: moths drawn, their speed (px/s), size, colour; how far behind her they start (px). */
  cloud: { n: 70, speed: 420, size: [8, 12] as const, color: 0xe8eeff, behind: 120 },
  /** The goal's glow at the path's end (px, alpha). */
  goal: { r: 420, a: 0.22, color: 0xcfe0ff },
  /**
   * The den goes dark behind the play plane as the roof comes in (moments.md: "the cloud as the only light"): a dark
   * over the back, to `dark` alpha over `darkSecs`, so the moonlight, the cloud and the rims read.
   */
  dark: 0.5,
  darkSecs: 6,
};

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  s: number;
  floor: number;
  /** A chunk of earth (drawn as a clod), not a grain of grit. */
  clod?: boolean;
}

interface EscapeView {
  on: number;
  t: number;
  cp: number;
  frontOn: number;
  front: number;
  rock: number[];
  rockT: number[];
  rockY: number[];
}

interface RockSpec {
  id: string;
  x: number;
  w: number;
  y0: number;
  y1: number;
  tell: number;
}

interface EscapeSpec {
  id: string;
  path: Array<[number, number]>;
  rocks: RockSpec[];
  front?: { x0: number; x1: number; y0: number; top: number };
  end: { x: number; y: number; w: number; h: number };
}

export class EscapeStage {
  private readonly back = new Graphics({ label: 'escape-back' });
  private readonly front = new Graphics({ label: 'escape-front' });
  private readonly glow = new GlowPool('escape-glow');
  private readonly glowBack = new GlowPool('escape-glow-back');
  private readonly root = new Container({ label: 'escape' });
  private readonly shade = new Graphics({ label: 'escape-dark' });
  private shadeK = 0;
  private readonly grains: Grain[] = [];
  private readonly heaps: Array<{ x: number; y: number; w: number; seed: number }> = [];
  private dustAcc = 0;
  private clodAcc = 0;
  private puffAcc = 0;
  private puffN = 0;
  private readonly puffs: Array<{ x: number; y: number; t: number; life: number; s: number }> = [];
  private cloudT = 0;
  private readonly pathLen: number[] = [];
  private readonly light: PointLight = { x: 0, y: 0, radius: 0, color: ESCAPE.goal.color, intensity: 0 };

  static for(ctx: SceneContext, lights: LightRegistry): EscapeStage | null {
    if (LOOK.kit !== 'wood') return null;
    const E = (ctx.scene as { escape?: EscapeSpec }).escape;
    // (r15: the escape runs on into the clifftop's chimney, `next`: a block there may have no cloud's path.)
    if (!E || !(E.path?.length >= 2 || E.front || E.rocks?.length)) return null;
    return new EscapeStage(ctx, lights, { ...E, path: E.path ?? [], rocks: E.rocks ?? [] });
  }

  private constructor(
    ctx: SceneContext,
    private readonly lights: LightRegistry,
    private readonly E: EscapeSpec,
  ) {
    let L = 0;
    this.pathLen.push(0);
    for (let i = 1; i < E.path.length; i++) {
      const a = E.path[i - 1] as [number, number];
      const b = E.path[i] as [number, number];
      L += Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.pathLen.push(L);
    }
    ctx.layers.get('airBack').addChild(this.shade);
    ctx.layers.get('goal').addChild(this.glowBack.container, this.back);
    this.root.addChild(this.front, this.glow.container);
    ctx.layers.air.addChild(this.root);
    lights.set('escape-goal', this.light);
  }

  private state(sim: SimView): EscapeView | null {
    return ((sim.kit as unknown as { escape?: EscapeView }).escape ?? null) as EscapeView | null;
  }

  /** The point `d` px along the path, and the path's length. */
  private along(d: number): [number, number] {
    const P = this.E.path;
    const L = this.pathLen;
    const dd = Math.max(0, Math.min(L[L.length - 1] as number, d));
    for (let i = 1; i < P.length; i++) {
      if (dd <= (L[i] as number) || i === P.length - 1) {
        const a = P[i - 1] as [number, number];
        const b = P[i] as [number, number];
        const seg = (L[i] as number) - (L[i - 1] as number);
        const u = seg > 0 ? (dd - (L[i - 1] as number)) / seg : 0;
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      }
    }
    return P[0] as [number, number];
  }

  /** How far along the path the point nearest (x, y) is (px). */
  private nearest(x: number, y: number): number {
    const P = this.E.path;
    let best = 1e12;
    let at = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1] as [number, number];
      const b = P[i] as [number, number];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const qx = a[0] + dx * u;
      const qy = a[1] + dy * u;
      const d = (qx - x) ** 2 + (qy - y) ** 2;
      if (d < best) {
        best = d;
        at = (this.pathLen[i - 1] as number) + Math.sqrt(l2) * u;
      }
    }
    return at;
  }

  private burst(x: number, y: number, n: number, k: number, floor: number): void {
    for (let i = 0; i < n; i++) {
      const h = hash01(`eb${this.grains.length}`, i);
      const a = -Math.PI * (0.1 + 0.8 * hash01('eba', i + this.grains.length));
      const sp = (80 + 260 * h) * k;
      this.grains.push({
        x: x + (hash01('ebx', i) - 0.5) * 40 * k,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        life: 0.8 + 0.8 * h,
        s: 2 + 4 * hash01('ebs', i) * k,
        floor,
      });
    }
  }

  onEvents(sim: SimView): void {
    for (const e0 of sim.events) {
      const e = e0 as unknown as {
        type: string;
        phase?: string;
        id?: string;
        x?: number;
        y?: number;
        w?: number;
      };
      if (e.type === 'rockfall' && e.phase === 'land') {
        const r = this.E.rocks.find((q) => q.id === e.id);
        const x = e.x ?? r?.x ?? 0;
        const y = e.y ?? r?.y1 ?? 0;
        const w = e.w ?? r?.w ?? 96;
        this.burst(x, y - 4, ESCAPE.land.grains, 1.3, y);
        if (!this.heaps.some((h) => h.x === x && h.y === y))
          this.heaps.push({ x, y, w, seed: hash01('eh', x) * 1000 });
      } else if (e.type === 'rockfall' && e.phase === 'fall') {
        this.burst(e.x ?? 0, (e.y ?? 0) + 6, 14, 0.6, 1e9);
      } else if (e.type === 'escapeStart') {
        // The roof lets go along its whole length: a fall of grit over the view (and the shake: camera/shake.ts).
        this.dustAcc += 60;
      } else if (e.type === 'escapeHit') {
        this.burst(e.x ?? 0, (e.y ?? 0) - 30, 30, 1, (e.y ?? 0) + 2);
      } else if (e.type === 'roomEnter') this.heaps.length = 0;
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    const s = this.state(sim);
    const b = this.back.clear();
    const f = this.front.clear();
    this.glow.begin();
    this.glowBack.begin();
    const running = !!s && s.on === 1;
    const view = {
      x0: cam.x - cam.w / 2 / cam.zoom - 100,
      x1: cam.x + cam.w / 2 / cam.zoom + 100,
      y0: cam.y - cam.h / 2 / cam.zoom - 100,
      y1: cam.y + cam.h / 2 / cam.zoom + 100,
    };
    // The dark over the back while it runs.
    const want = running ? Math.min(1, (s?.t ?? 0) / 60 / ESCAPE.darkSecs) : 0;
    this.shadeK += (want - this.shadeK) * Math.min(1, dt * 2);
    this.shade.clear();
    if (this.shadeK > 0.003)
      this.shade
        .rect(view.x0 - 400, view.y0 - 400, view.x1 - view.x0 + 800, view.y1 - view.y0 + 800)
        .fill({ color: 0x040306, alpha: ESCAPE.dark * this.shadeK });
    // Heaps a rock left (for good while she is in the room).
    for (const h of this.heaps) this.heap(b, h.x, h.y, h.w * ESCAPE.land.heap, h.seed);
    if (s && running) {
      this.drawRocks(b, f, clock, s);
      this.drawFront(f, dt, clock, s, view);
      this.roofDust(dt, s, view, sim);
      if (this.E.path.length >= 2) this.drawCloud(f, dt, clock, sim);
    }
    this.drawGrains(f, dt);
    // The goal: moonlight where the path comes out, stronger as she nears it.
    const end = (this.E.path[this.E.path.length - 1] ?? [0, 0]) as [number, number];
    const p = sim.player;
    const near =
      running && this.E.path.length >= 2
        ? Math.max(0, 1 - Math.hypot(p.cx - end[0], p.cy - end[1]) / 2600)
        : 0;
    this.light.x = end[0] - 200;
    this.light.y = end[1];
    this.light.radius = 900;
    this.light.intensity = 0.5 * near;
    if (near > 0)
      this.glowBack.add(end[0] - 260, end[1], ESCAPE.goal.r, ESCAPE.goal.color, ESCAPE.goal.a * near, 200);
    this.glow.end();
    this.glowBack.end();
  }

  /** Each rock: its tell (crack, grit, shaking clod, shadow), its fall, nothing once down (the heap is drawn). */
  private drawRocks(b: Graphics, f: Graphics, clock: number, s: EscapeView): void {
    const T = ESCAPE.tell;
    const R = ESCAPE.rock;
    this.E.rocks.forEach((r, i) => {
      const st = s.rock[i] ?? 0;
      if (st === 1) {
        const u = Math.min(1, (s.rockT[i] ?? 0) / Math.max(1, r.tell));
        // The crack spreading in the roof over it, lit from the dust behind.
        for (let k = 0; k < 5; k++) {
          const a = Math.PI * (0.15 + 0.7 * hash01(r.id, k)) * (k % 2 ? 1 : -1);
          const len = T.crack * (0.4 + 0.6 * hash01(r.id, k + 9)) * Math.min(1, u * 1.6);
          let x = r.x;
          let y = r.y0 + 2;
          const pts = [x, y];
          for (let q = 1; q <= 4; q++) {
            x += Math.cos(a) * (len / 4) + (hash01(r.id, k * 7 + q) - 0.5) * 10;
            y += Math.abs(Math.sin(a)) * (len / 16) + 2;
            pts.push(x, y);
          }
          f.poly(pts, false).stroke({ color: 0x050302, width: 5, alpha: 0.9 });
          f.poly(pts, false).stroke({ color: T.grit, width: 2.2, alpha: 0.85 * u });
        }
        // The clod shaking loose out of the roof.
        const sh = T.shake * u * Math.sin(clock * 50 + i);
        const rw = Math.max(R.min, r.w * R.size);
        this.clod(f, r.x + sh, r.y0 + rw * (0.35 * u), rw, hash01(r.id, 40) * 1000, 0, 0.35 + u * 0.65);
        // Grit trickling off it: more as it goes.
        const n = Math.floor(8 + 26 * u);
        for (let k = 0; k < n; k++) {
          const ph = (clock * (1.4 + hash01(r.id, k + 50)) + hash01(r.id, k + 60)) % 1;
          const gy = r.y0 + 10 + (r.y1 - r.y0) * ph * ph;
          const gx = r.x + (hash01(r.id, k + 70) - 0.5) * r.w * 0.7;
          f.rect(gx, gy, 3.4, 10 + 18 * ph).fill({ color: T.grit, alpha: 0.9 * (1 - ph * 0.6) });
        }
        // Where it will hit: grit bouncing off the perch, a pale splash that marks the spot in the dark.
        for (let k = 0; k < 10; k++) {
          const ph = (clock * (2.2 + hash01(r.id, k + 80)) + hash01(r.id, k + 90)) % 1;
          const gx =
            r.x + (hash01(r.id, k + 100) - 0.5) * r.w * 0.8 + (hash01(r.id, k + 110) - 0.5) * 40 * ph;
          const gy = r.y1 - 4 - Math.sin(Math.PI * ph) * (10 + 16 * hash01(r.id, k + 120));
          f.rect(gx, gy, 2.6, 2.6).fill({ color: T.grit, alpha: 0.8 * u * (1 - ph * 0.5) });
        }
        // A puff of dust breathing out of the crack, and the line of the trickle lit faintly all the way down.
        this.glow.add(r.x, r.y0 + 16, r.w * 0.9, T.grit, 0.22 * u, 30);
        this.glowBack.add(r.x, (r.y0 + r.y1) / 2, r.w * 0.35, T.grit, 0.06 * u, (r.y1 - r.y0) / 2);
        // Its shadow on what it will hit, darkening; a dull warm glint of warning in the dust there.
        b.ellipse(r.x, r.y1 - 2, r.w * (0.5 + 0.4 * u), 8 + 6 * u).fill({
          color: 0x000000,
          alpha: T.shadow * u,
        });
        this.glowBack.add(r.x, r.y1 - 20, r.w * 0.9, 0x8a6a48, 0.1 * u, 30);
      } else if (st === 2) {
        const y = s.rockY[i] ?? r.y0;
        // The trail of dust it drags down, then the clod.
        const rw = Math.max(R.min, r.w * R.size);
        // The dust it drags: a tapering streak (a stack of puffs read as pancakes), and grit lines in it.
        const ty = y - rw * 0.7;
        f.poly([
          r.x - rw * 0.42,
          ty,
          r.x + rw * 0.42,
          ty,
          r.x + rw * 0.12,
          ty - R.trail,
          r.x - rw * 0.12,
          ty - R.trail,
        ]).fill({ color: 0x8a7a66, alpha: 0.16 });
        for (let k = 0; k < 7; k++) {
          const gx = r.x + (hash01(r.id, k + 170) - 0.5) * rw * 0.7;
          const l = R.trail * (0.4 + 0.6 * hash01(r.id, k + 180));
          f.rect(gx, ty - l, 2.2, l).fill({ color: 0xa89880, alpha: 0.35 });
        }
        // (Grit and smaller clods falling with it.)
        for (let k = 0; k < 6; k++) {
          const gx = r.x + (hash01(r.id, k + 140) - 0.5) * rw * 1.2;
          const gy = y - rw * (0.6 + 1.6 * hash01(r.id, k + 150));
          f.ellipse(gx, gy, 4 + 5 * hash01(r.id, k + 160), 3 + 3 * hash01(r.id, k + 160)).fill({
            color: R.mid,
          });
        }
        this.clod(f, r.x, y - rw / 2, rw, hash01(r.id, 40) * 1000, clock * 3, 1);
        b.ellipse(r.x, r.y1 - 2, r.w * 0.9, 14).fill({ color: 0x000000, alpha: T.shadow });
      }
    });
  }

  /** A clod of earth and roots (`w` across) centred at (x, y), turned `rot`; `k` 0..1 of it showing. */
  private clod(g: Graphics, x: number, y: number, w: number, seed: number, rot: number, k: number): void {
    if (k <= 0.01) return;
    const R = ESCAPE.rock;
    const pts: number[] = [];
    const n = 11;
    for (let q = 0; q < n; q++) {
      const a = rot + (q / n) * Math.PI * 2;
      const rr = (w / 2) * (0.7 + 0.35 * hash01('cl', seed + q));
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85);
    }
    g.poly(pts).fill({ color: R.body, alpha: k });
    g.ellipse(x - w * 0.08, y - w * 0.12, w * 0.32, w * 0.16).fill({ color: R.mid, alpha: k });
    // (Its top lit by the moonlight above: the rim that makes it read on the dark den.)
    const rim: number[] = [];
    for (let q = 0; q <= 6; q++) {
      const a = -Math.PI * (0.92 - 0.75 * (q / 6));
      rim.push(x + Math.cos(a) * w * 0.42, y + Math.sin(a) * w * 0.36);
    }
    g.poly(rim, false).stroke({ color: R.lit, width: 3, alpha: 0.75 * k, cap: 'round' });
    g.ellipse(x - w * 0.16, y - w * 0.26, w * 0.16, w * 0.05).fill({ color: R.lit, alpha: 0.6 * k });
    // Broken roots out of it.
    for (let q = 0; q < R.roots; q++) {
      const a = rot + hash01('clr', seed + q) * Math.PI * 2;
      const r0 = w * 0.4;
      const r1 = w * (0.7 + 0.4 * hash01('cll', seed + q));
      g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        .lineTo(x + Math.cos(a + 0.2) * r1, y + Math.sin(a + 0.2) * r1)
        .stroke({ color: 0x241a12, width: 4, cap: 'round', alpha: k });
    }
  }

  /** A little heap of earth where a rock landed. */
  private heap(g: Graphics, x: number, y: number, w: number, seed: number): void {
    const pts: number[] = [x - w / 2, y + 2];
    for (let q = 0; q <= 10; q++) {
      const u = q / 10;
      const hgt = Math.sin(Math.PI * u) ** 0.8 * w * 0.28 * (0.8 + 0.4 * hash01('hp', seed + q));
      pts.push(x - w / 2 + w * u, y - hgt);
    }
    pts.push(x + w / 2, y + 2);
    g.poly(pts).fill({ color: ESCAPE.rock.body });
    for (let q = 0; q < 6; q++) {
      const u = 0.15 + 0.7 * hash01('hc', seed + q);
      const r = 5 + 7 * hash01('hr', seed + q);
      g.ellipse(x - w / 2 + w * u, y - Math.sin(Math.PI * u) * w * 0.2, r, r * 0.6).fill({
        color: mix(ESCAPE.rock.body, ESCAPE.rock.mid, hash01('hm', seed + q)),
      });
    }
  }

  /**
   * The collapse front (r15, review r14 #1: "a brown fog band"): the earth itself coming up under her. A row of heaving
   * lumps on fixed world slots (no band, no straight top), each a clod-studded crown with a cool rim lit from the
   * moonlit column above; torn roots thrashing up out of it; chunks thrown off its top; dust boiling up in puffs that
   * rise and spread (opaque earth-brown, never an additive glow). Near-black below its outer band (the silhouette rule).
   */
  private drawFront(
    f: Graphics,
    dt: number,
    clock: number,
    s: EscapeView,
    view: { x0: number; x1: number; y0: number; y1: number },
  ): void {
    const F = this.E.front;
    if (!F || s.frontOn !== 1) return;
    const C = ESCAPE.front;
    const top = s.front;
    if (top - C.churn * 3 > view.y1) return;
    const x0 = Math.max(F.x0, view.x0);
    const x1 = Math.min(F.x1, view.x1);
    if (x1 <= x0) return;
    const bottom = Math.max(view.y1, top + 400);
    // Its top heaves in long slow rolls (no straight line), and clods of earth churn up through it and sink back: world
    // slots `lump` apart, each rising and tumbling on its own beat, so its silhouette is rubble, never a band of domes.
    const base = (x: number): number =>
      top +
      C.churn *
        (0.5 * Math.sin(x * 0.0071 + clock * 1.6) +
          0.3 * Math.sin(x * 0.019 - clock * 2.7) +
          0.2 * Math.sin(x * 0.047 + clock * 4.1));
    const sp = C.lump;
    const clods: Array<{ cx: number; cy: number; r: number; h: number; i: number; rot: number }> = [];
    for (let i = Math.floor(x0 / sp) - 2; i <= Math.ceil(x1 / sp) + 2; i++) {
      const h = hash01('fl', i);
      const r = C.clodR[0] + (C.clodR[1] - C.clodR[0]) * hash01('flr', i) ** 1.6;
      const ph = (clock * (0.32 + 0.45 * hash01('flp', i)) + h) % 1;
      const cx = i * sp + (h - 0.5) * sp * 0.8 + Math.sin(clock * 0.9 + i) * 6;
      const cy = base(cx) + r * 0.5 - r * 1.5 * Math.sin(Math.PI * ph);
      clods.push({ cx, cy, r, h, i, rot: clock * (hash01('flt', i) - 0.5) * 2.4 + h * 6 });
    }
    const yAt = (x: number): number => {
      let y = base(x);
      for (const l of clods) {
        const u = (x - l.cx) / l.r;
        if (u > -1 && u < 1) y = Math.min(y, l.cy - l.r * 0.75 * Math.sqrt(1 - u * u));
      }
      return y;
    };
    const edge: number[] = [];
    for (let x = x0; x <= x1 + 12; x += 12) edge.push(Math.min(x, x1), base(Math.min(x, x1)));
    // Curtains of earth pouring off the roof down into it (behind her: she must stay readable in front of them).
    const b = this.back;
    for (let c = 0; c < C.curtains; c++) {
      const h = hash01('cu', c);
      const cx = view.x0 + (view.x1 - view.x0) * ((c + 0.2 + 0.6 * h) / C.curtains);
      if (cx < F.x0 || cx > F.x1) continue;
      const w = C.curtainW[0] + (C.curtainW[1] - C.curtainW[0]) * hash01('cuw', c);
      const yTop = view.y0;
      const sway = Math.sin(clock * 1.3 + c) * 8;
      b.poly([cx - w / 2, yTop, cx + w / 2, yTop, cx + w * 0.62 + sway, top, cx - w * 0.62 + sway, top]).fill(
        {
          color: C.edge,
          alpha: 0.5,
        },
      );
      b.moveTo(cx - w / 2, yTop)
        .lineTo(cx - w * 0.62 + sway, top)
        .stroke({ color: C.lit, width: 2, alpha: 0.3 });
      for (let k = 0; k < 10; k++) {
        const ph = (clock * (0.9 + 0.5 * hash01('cs', c * 17 + k)) + hash01('cso', c * 13 + k)) % 1;
        const y = yTop + (top - yTop) * ph;
        const x = cx + (hash01('csx', c * 11 + k) - 0.5) * w;
        b.rect(x, y, 3, 30 + 40 * ph).fill({ color: 0x3a2e24, alpha: 0.6 });
      }
    }
    // Dust boiling up off it: puffs that rise, swell and thin (behind the body's crown, over the air).
    this.puffAcc += dt * C.puffs * ((x1 - x0) / 1000);
    while (this.puffAcc >= 1) {
      this.puffAcc -= 1;
      const x = x0 + (x1 - x0) * hash01('fp', this.puffN++);
      this.puffs.push({
        x,
        y: yAt(x) + 10,
        t: 0,
        life: 1.3 + 0.9 * hash01('fpl', this.puffN),
        s: hash01('fps', this.puffN),
      });
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i] as { x: number; y: number; t: number; life: number; s: number };
      p.t += dt;
      if (p.t > p.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      const u = p.t / p.life;
      const r = C.puffR[0] + (C.puffR[1] - C.puffR[0]) * Math.sqrt(u) * (0.6 + 0.6 * p.s);
      const y = p.y - C.puffRise * u * (0.7 + 0.6 * p.s);
      const a = C.puffA * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.5);
      for (let k = 0; k < 5; k++) {
        const ang = p.s * 7 + k * 1.26 + Math.sin(clock * 1.5 + k) * 0.2;
        const ox = Math.cos(ang) * r * 0.5;
        const oy = Math.sin(ang) * r * 0.32 - (k % 2) * r * 0.2;
        f.circle(p.x + ox, y + oy, r * (0.42 + 0.22 * hash01('fpk', k + p.s * 50))).fill({
          color: C.dust,
          alpha: a,
        });
      }
      // (Its crown catches the moonlight a little: dust, not fog.)
      f.circle(p.x - r * 0.15, y - r * 0.55, r * 0.35).fill({ color: C.dustLit, alpha: a * 0.18 });
    }
    // The body: near-black under its crowns.
    f.poly([...edge, x1, bottom, x0, bottom]).fill({ color: C.body, alpha: 0.99 });
    // The churning clods: irregular lumps of earth, darker into the mass, a broken cool rim on the upper side of some.
    for (const l of clods) {
      if (l.cx + l.r < x0 - 20 || l.cx - l.r > x1 + 20) continue;
      const pts: number[] = [];
      for (let q = 0; q < 8; q++) {
        const a = l.rot + (q / 8) * Math.PI * 2;
        const rr = l.r * (0.72 + 0.4 * hash01('flq', l.i * 9 + q));
        pts.push(l.cx + Math.cos(a) * rr, l.cy + Math.sin(a) * rr * 0.78);
      }
      const above = Math.max(0, Math.min(1, (base(l.cx) - l.cy) / (l.r * 1.2)));
      f.poly(pts).fill({ color: mix(C.body, C.edge, 0.35 + 0.65 * above) });
      f.ellipse(l.cx - l.r * 0.15, l.cy - l.r * 0.25, l.r * 0.45, l.r * 0.22).fill({
        color: C.mid,
        alpha: 0.55 * above,
      });
      if (above > 0.25 && hash01('flm', l.i) < 0.6) {
        const rim: number[] = [];
        const a0 = Math.PI * (1.1 + 0.25 * hash01('fla', l.i));
        for (let q = 0; q <= 5; q++) {
          const a = a0 + (q / 5) * Math.PI * (0.35 + 0.3 * hash01('flb', l.i));
          rim.push(l.cx + Math.cos(a) * l.r * 0.85, l.cy + Math.sin(a) * l.r * 0.68);
        }
        f.poly(rim, false).stroke({ color: C.lit, width: 2.4, alpha: 0.7 * above, cap: 'round' });
      }
    }
    // Torn roots thrashing up out of it, every few slots: thick, forked, frayed at the tip.
    for (const l of clods) {
      if (((l.i % 5) + 5) % 5 !== 0 || l.cx < x0 - 40 || l.cx > x1 + 40) continue;
      const len = C.root[0] + (C.root[1] - C.root[0]) * hash01('frl', l.i);
      const lean = (hash01('fra', l.i) - 0.5) * 1.6 + Math.sin(clock * (2.6 + 2 * l.h) + l.i) * 0.28;
      const bx = l.cx + l.r * 0.6;
      const by = base(bx) + 18;
      const L: number[] = [];
      const R: number[] = [];
      let fx = 0;
      let fy = 0;
      for (let q = 0; q <= 8; q++) {
        const v = q / 8;
        const a = -Math.PI / 2 + lean * v + Math.sin(v * 3.4 + l.i) * 0.3;
        const x = bx + Math.cos(a) * len * v + Math.sin(clock * 4 + v * 3 + l.i) * 7 * v;
        const y = by + Math.sin(a) * len * v;
        const w = C.rootW * (1 - v * 0.82);
        L.push(x - w / 2, y);
        R.unshift(x + w / 2, y);
        if (q === 5) {
          fx = x;
          fy = y;
        }
      }
      f.poly([...L, ...R]).fill({ color: 0x170f0a });
      f.poly(L, false).stroke({ color: C.lit, width: 2.2, alpha: 0.28 });
      // (A fork off it.)
      const fa = -Math.PI / 2 + lean + (hash01('frf', l.i) < 0.5 ? -0.8 : 0.8);
      f.moveTo(fx, fy)
        .quadraticCurveTo(
          fx + Math.cos(fa) * len * 0.2,
          fy + Math.sin(fa) * len * 0.25,
          fx + Math.cos(fa) * len * 0.38,
          fy + Math.sin(fa) * len * 0.3,
        )
        .stroke({ color: 0x170f0a, width: 4, cap: 'round' });
      const tx = L[L.length - 2] as number;
      const ty = L[L.length - 1] as number;
      for (let k = 0; k < 4; k++)
        f.moveTo(tx + 2, ty)
          .lineTo(tx + 2 + (k - 1.5) * 8 + Math.sin(clock * 6 + k) * 3, ty - 8 - 5 * k)
          .stroke({ color: 0x2a1e14, width: 1.6, cap: 'round' });
    }
    // Chunks breaking off its top: thrown up, falling back into it.
    this.clodAcc += dt * C.clods * ((x1 - x0) / 1000);
    while (this.clodAcc >= 1) {
      this.clodAcc -= 1;
      const n = this.grains.length + Math.floor(clock * 61);
      const x = x0 + (x1 - x0) * hash01('fc', n);
      this.grains.push({
        x,
        y: yAt(x) - 4,
        vx: (hash01('fcx', n) - 0.5) * 160,
        vy: -200 - 260 * hash01('fcy', n),
        t: 0,
        life: 1.6,
        s: 5 + 11 * hash01('fcs', n),
        floor: top + 40,
        clod: true,
      });
    }
  }

  /** Grit and dust off the roof in view, building as the escape goes on. */
  private roofDust(
    dt: number,
    s: EscapeView,
    view: { x0: number; x1: number; y0: number; y1: number },
    sim: SimView,
  ): void {
    const D = ESCAPE.dust;
    const u = Math.min(1, s.t / 60 / D.buildSecs);
    const rate = (D.rate[0] + (D.rate[1] - D.rate[0]) * u) * ((view.x1 - view.x0) / 1000);
    this.dustAcc += dt * rate;
    const solids = sim.scene.solids;
    let guard = 0;
    while (this.dustAcc >= 1 && guard++ < 200) {
      this.dustAcc -= 1;
      const h = hash01('rd', this.grains.length + guard);
      const x = view.x0 + (view.x1 - view.x0) * h;
      // From the underside of whatever is over that x in view (or the view's top).
      let y = view.y0;
      let floor = view.y1;
      for (const q of solids) {
        if (x < q.x || x > q.x + q.w) continue;
        const under = q.y + q.h;
        if (under <= sim.player.cy && under > y) y = under;
        if (q.y > sim.player.cy - 400 && q.y < floor) floor = q.y;
      }
      this.grains.push({
        x,
        y: y + 2,
        vx: (hash01('rdx', guard + this.grains.length) - 0.5) * 20,
        vy: 40 + 80 * hash01('rdy', guard),
        t: 0,
        life: 2.4,
        s: 1.2 + 2.6 * hash01('rds', guard + this.grains.length),
        floor,
      });
    }
  }

  /** The freed moths streaming ahead of her along the path to the moonlight: the light that leads. */
  private drawCloud(f: Graphics, dt: number, clock: number, sim: SimView): void {
    const C = ESCAPE.cloud;
    this.cloudT += dt;
    const L = this.pathLen[this.pathLen.length - 1] as number;
    const from = Math.max(0, this.nearest(sim.player.cx, sim.player.cy) - C.behind);
    const span = Math.max(200, L - from);
    for (let k = 0; k < C.n; k++) {
      const h = hash01('ec', k);
      const u = (this.cloudT * (C.speed / span) * (0.75 + 0.5 * hash01('ecs', k)) + h) % 1;
      const [px, py] = this.along(from + u * span);
      const side = (hash01('ecd', k) - 0.5) * 70;
      const x = px + side + Math.sin(clock * 3 + k) * 10;
      const y = py + (hash01('ece', k) - 0.5) * 50 + Math.cos(clock * 2.6 + k * 1.3) * 10;
      const fade = Math.min(1, u * 6) * Math.min(1, (1 - u) * 6);
      const sz = C.size[0] + (C.size[1] - C.size[0]) * hash01('ecz', k);
      moth(
        f,
        x,
        y,
        sz,
        Math.abs(Math.sin(clock * (14 + 6 * h) + k)),
        side > 0 ? 1 : -1,
        C.color,
        0.92 * fade,
      );
      if (k % 3 === 0) this.glow.add(x, y, 34, C.color, 0.18 * fade);
    }
  }

  private drawGrains(f: Graphics, dt: number): void {
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const q = this.grains[i] as Grain;
      q.t += dt;
      q.vy += 520 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.t > q.life || q.y > q.floor) {
        this.grains.splice(i, 1);
        continue;
      }
      const a = 0.8 * (1 - q.t / q.life);
      if (q.clod) {
        f.ellipse(q.x, q.y, q.s, q.s * 0.75).fill({ color: ESCAPE.front.edge, alpha: Math.min(1, a * 1.3) });
        f.ellipse(q.x - q.s * 0.25, q.y - q.s * 0.35, q.s * 0.45, q.s * 0.2).fill({
          color: ESCAPE.front.lit,
          alpha: 0.6 * a,
        });
        continue;
      }
      f.rect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s * (1 + Math.min(3, q.vy / 300))).fill({
        color: ESCAPE.dust.color,
        alpha: a,
      });
    }
    if (this.grains.length > 1500) this.grains.splice(0, this.grains.length - 1500);
  }

  destroy(): void {
    this.lights.remove('escape-goal');
  }
}
