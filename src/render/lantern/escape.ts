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
  tell: { crack: 90, grit: 0x9a8468, shadow: 0.6, shake: 4 },
  /** A falling clod: its colours (body, lit rim), the trail's length (px). */
  rock: { body: 0x120d09, mid: 0x2c2119, lit: 0x7a6248, trail: 120, roots: 3 },
  /** The heap a landed rock leaves (x its width), the burst's grains. */
  land: { heap: 1.3, grains: 40 },
  /**
   * The collapse front: its body colour, the churning top's amplitude (px), clods thrown off it a second, the dust
   * bank's height over it (px) and alpha.
   */
  front: {
    body: 0x080605,
    edge: 0x2a2018,
    lit: 0x6a5644,
    churn: 34,
    clods: 70,
    bank: 260,
    bankA: 0.34,
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
  private readonly grains: Grain[] = [];
  private readonly heaps: Array<{ x: number; y: number; w: number; seed: number }> = [];
  private dustAcc = 0;
  private clodAcc = 0;
  private cloudT = 0;
  private readonly pathLen: number[] = [];
  private readonly light: PointLight = { x: 0, y: 0, radius: 0, color: ESCAPE.goal.color, intensity: 0 };

  static for(ctx: SceneContext, lights: LightRegistry): EscapeStage | null {
    if (LOOK.kit !== 'wood') return null;
    const E = (ctx.scene as { escape?: EscapeSpec }).escape;
    return E?.path && E.path.length >= 2 ? new EscapeStage(ctx, lights, E) : null;
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
    // Heaps a rock left (for good while she is in the room).
    for (const h of this.heaps) this.heap(b, h.x, h.y, h.w * ESCAPE.land.heap, h.seed);
    if (s && running) {
      this.drawRocks(b, f, clock, s);
      this.drawFront(f, dt, clock, s, view);
      this.roofDust(dt, s, view, sim);
      this.drawCloud(f, dt, clock, sim);
    }
    this.drawGrains(f, dt);
    // The goal: moonlight where the path comes out, stronger as she nears it.
    const end = this.E.path[this.E.path.length - 1] as [number, number];
    const p = sim.player;
    const near = running ? Math.max(0, 1 - Math.hypot(p.cx - end[0], p.cy - end[1]) / 2600) : 0;
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
          f.poly(pts, false).stroke({ color: 0x050302, width: 4, alpha: 0.9 });
          f.poly(pts, false).stroke({ color: R.lit, width: 1.5, alpha: 0.7 * u });
        }
        // The clod shaking loose out of the roof.
        const sh = T.shake * u * Math.sin(clock * 50 + i);
        this.clod(f, r.x + sh, r.y0 + r.w * (0.35 * u), r.w, hash01(r.id, 40) * 1000, 0, u * 0.5);
        // Grit trickling off it: more as it goes.
        const n = Math.floor(8 + 26 * u);
        for (let k = 0; k < n; k++) {
          const ph = (clock * (1.4 + hash01(r.id, k + 50)) + hash01(r.id, k + 60)) % 1;
          const gy = r.y0 + 10 + (r.y1 - r.y0) * ph * ph;
          const gx = r.x + (hash01(r.id, k + 70) - 0.5) * r.w * 0.7;
          f.rect(gx, gy, 2.6, 8 + 16 * ph).fill({ color: T.grit, alpha: 0.85 * (1 - ph * 0.7) });
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
        for (let k = 1; k <= 5; k++)
          f.ellipse(r.x, y - r.w - (k * R.trail) / 5, r.w * (0.4 - k * 0.05), R.trail / 6).fill({
            color: ESCAPE.dust.color,
            alpha: 0.28 * (1 - k / 6),
          });
        this.clod(f, r.x, y - r.w / 2, r.w, hash01(r.id, 40) * 1000, clock * 3, 1);
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
    g.ellipse(x - w * 0.12, y - w * 0.18, w * 0.3, w * 0.12).fill({ color: R.mid, alpha: k });
    g.ellipse(x - w * 0.18, y - w * 0.3, w * 0.18, w * 0.05).fill({ color: R.lit, alpha: 0.6 * k });
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

  /** The collapse front: a wall of falling earth and roots rising under her. */
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
    if (top > view.y1) return;
    const x0 = Math.max(F.x0, view.x0);
    const x1 = Math.min(F.x1, view.x1);
    if (x1 <= x0) return;
    const bottom = Math.max(view.y1, top + 200);
    // The churning top: a noisy line moving with time.
    const n = Math.max(8, Math.ceil((x1 - x0) / 28));
    const edge: number[] = [];
    for (let q = 0; q <= n; q++) {
      const x = x0 + ((x1 - x0) * q) / n;
      const y =
        top +
        Math.sin(x * 0.013 + clock * 5.3) * C.churn * 0.5 +
        Math.sin(x * 0.031 - clock * 7.9) * C.churn * 0.35 +
        (hash01('fe', Math.floor(x / 28) + Math.floor(clock * 12)) - 0.5) * C.churn * 0.5;
      edge.push(x, y);
    }
    // The dust bank over it (behind the clods), then the body.
    for (let q = 0; q <= n; q += 2) {
      const x = edge[q * 2] as number;
      const y = edge[q * 2 + 1] as number;
      this.glow.add(
        x,
        y - C.bank * 0.35,
        90,
        0x6a5848,
        C.bankA * (0.7 + 0.3 * Math.sin(clock * 3 + q)),
        C.bank * 0.5,
      );
    }
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
          alpha: 0.32,
        },
      );
      // Streaks falling in it.
      for (let k = 0; k < 10; k++) {
        const ph = (clock * (0.9 + 0.5 * hash01('cs', c * 17 + k)) + hash01('cso', c * 13 + k)) % 1;
        const y = yTop + (top - yTop) * ph;
        const x = cx + (hash01('csx', c * 11 + k) - 0.5) * w;
        b.rect(x, y, 3, 30 + 40 * ph).fill({ color: 0x3a2e24, alpha: 0.6 });
      }
    }
    f.poly([...edge, x1, bottom, x0, bottom]).fill({ color: C.body, alpha: 0.98 });
    // The lit lip: falling earth catching the moonlight from above.
    f.poly(edge, false).stroke({ color: C.lit, width: 4, alpha: 0.7 });
    // Inside, near its top: lumps of earth and roots tumbling down with it.
    for (let q = 0; q < n; q += 1) {
      const x = edge[q * 2] as number;
      const y = edge[q * 2 + 1] as number;
      const h = hash01('fl', q);
      const yy = y + 20 + ((clock * (60 + 50 * h) + h * 200) % 160);
      f.ellipse(x + 8, yy, 10 + 10 * h, 7 + 5 * h).fill({ color: C.edge, alpha: 0.7 * (1 - (yy - y) / 200) });
      if (q % 4 === 0) {
        const a = -Math.PI / 2 + (h - 0.5) * 1.6;
        f.moveTo(x, y + 6)
          .lineTo(x + Math.cos(a) * (30 + 40 * h), y + 6 + Math.sin(a) * (30 + 40 * h))
          .stroke({ color: 0x1c140e, width: 5, cap: 'round' });
      }
    }
    // Clods thrown up off its top, falling back into it.
    this.clodAcc += dt * C.clods * ((x1 - x0) / 1000);
    while (this.clodAcc >= 1) {
      this.clodAcc -= 1;
      const h = hash01('fc', this.grains.length + Math.floor(clock * 61));
      const x = x0 + (x1 - x0) * h;
      this.grains.push({
        x,
        y: top - 4,
        vx: (hash01('fcx', Math.floor(clock * 97)) - 0.5) * 120,
        vy: -160 - 220 * hash01('fcy', Math.floor(clock * 53) + this.grains.length),
        t: 0,
        life: 1.4,
        s: 3 + 6 * hash01('fcs', this.grains.length),
        floor: top + 10,
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
