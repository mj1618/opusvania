/**
 * The trap is set (the Canopy r13, docs/design/levels/canopy-moments.md moment 5; the room's `marks.stage.stream`
 * `{points, count, captured}`): a thin stream of moths drifts along the tunnel's high air toward the moon's side, seen
 * in the background through the fight. When the firefly hangs the cage `captured` and it lights, each `trapFill` takes
 * one moth out of the stream: it swerves, spirals in and joins the cage's orbit (the cloud's density is the fill:
 * lamps.ts). Full, the stream is gone, and something under the den answers (`denStir`: the slam's dust off the den's
 * lintel here; the shake is the camera's).
 *
 * Render only: reads the scene's stage mark, the lures' fill and the events.
 */
import { Graphics } from 'pixi.js';
import type { CameraView, SimView } from '../contract';
import type { SceneContext } from '../scene/index';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';
import { moth } from './lamps';

export const TRAP_STREAM = {
  /** Seconds a moth takes along the whole stream, ± share; its band's half width (px); size (px), colour. */
  secs: 14,
  spread: 0.3,
  half: 34,
  /** How far under the roof it runs where its mark lies inside the wood (px). */
  under: 330,
  size: [10, 15] as const,
  color: 0xe4e8f0,
  /**
   * A caught moth: seconds to swerve and spiral into the orbit, the orbit's radius (px) it ends on. (Review r13 #10:
   * at 8 px, warm, they read as dark flecks round the cage. Now 13 px, moonlit pale like the stream (`sheen`) until
   * the lamp's warmth takes them at the end, a pale trail behind, the lamp's pull drawn as a warm thread to it, and
   * the cage's light gulps as each arrives (`gulp` s, `gulpA`).)
   */
  bend: 1.5,
  orbit: 70,
  caught: 13,
  sheen: 0xeef2ff,
  warm: 0xffe0b0,
  trail: 4,
  gulp: 0.45,
  gulpA: 0.32,
  /** The slam's dust off the lintel (`denStir`): grains, how far along (px), their colour. */
  dust: 46,
  dustW: 260,
  dustColor: 0x6a5a48,
};

interface Bend {
  x0: number;
  y0: number;
  t: number;
  seed: number;
}

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  s: number;
}

export class TrapStream {
  private readonly front = new Graphics({ label: 'trap-stream-front' });
  private readonly glow = new GlowPool('trap-stream-glow');
  private readonly pts: Array<[number, number]>;
  private readonly len: number;
  private readonly count: number;
  private readonly lure: number;
  private readonly bends: Bend[] = [];
  private readonly grains: Grain[] = [];
  private readonly gulps: number[] = [];
  /** Moths the stream has lost to the cage (render's own count: each `trapFill` is one). */
  private taken = 0;
  private clock = 0;

  static for(ctx: SceneContext): TrapStream | null {
    if (LOOK.kit !== 'wood') return null;
    const st = (
      ctx.scene.marks?.stage as
        | { stream?: { points: Array<[number, number]>; count: number; captured?: string } }
        | undefined
    )?.stream;
    if (!st?.points || st.points.length < 2) return null;
    return new TrapStream(ctx, st);
  }

  private constructor(
    ctx: SceneContext,
    st: { points: Array<[number, number]>; count: number; captured?: string },
  ) {
    // (Kept in the air: where the mark's line runs inside the wood (the tunnel's roof), it is drawn just under it, so
    // it is seen in the frame through the fight, never over rock.)
    const solids = ctx.scene.solids;
    const inSolid = (x: number, y: number) =>
      solids.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const fine: Array<[number, number]> = [];
    for (let i = 1; i < st.points.length; i++) {
      const a = st.points[i - 1] as [number, number];
      const b = st.points[i] as [number, number];
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 80));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        let y = a[1] + ((b[1] - a[1]) * k) / n;
        for (let g = 0, q = inSolid(x, y); q && g < 8; g++, q = inSolid(x, y))
          y = q.y + q.h + TRAP_STREAM.under;
        fine.push([x, y]);
      }
    }
    // Smoothed, so a step in the roof is not a step in the stream.
    this.pts = fine.map((p, i) => {
      const a = fine[Math.max(0, i - 2)] as [number, number];
      const b = fine[Math.min(fine.length - 1, i + 2)] as [number, number];
      return [p[0], Math.max(p[1], (a[1] + b[1] + p[1]) / 3)] as [number, number];
    });
    let L = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1] as [number, number];
      const b = this.pts[i] as [number, number];
      L += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    this.len = L;
    this.count = st.count;
    this.lure = (ctx.scene.lures ?? []).findIndex((l) => l.id === st.captured);
    // (Behind her, in front of the bake: the high air of the tunnel.)
    ctx.layers.get('goal').addChild(this.glow.container);
    ctx.layers.air.addChild(this.front);
  }

  /** The point `d` px along the stream. */
  private at(d: number): [number, number] {
    let left = d;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1] as [number, number];
      const b = this.pts[i] as [number, number];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= l || i === this.pts.length - 1) {
        const u = Math.min(1, left / Math.max(1, l));
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      }
      left -= l;
    }
    return this.pts[0] as [number, number];
  }

  /** Moth `k` of the stream now: where, and its seed. */
  private mothAt(k: number): [number, number, number] {
    const S = TRAP_STREAM;
    const h = hash01('ts', k);
    const secs = S.secs * (1 + (hash01('tsp', k) - 0.5) * 2 * S.spread);
    const u = (this.clock / secs + h) % 1;
    const [x, y] = this.at(u * this.len);
    const side = (hash01('tss', k) - 0.5) * 2 * S.half;
    return [x + Math.sin(this.clock * 1.3 + k) * 10, y + side + Math.sin(this.clock * 2.1 + k * 1.7) * 8, h];
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    void cam;
    const S = TRAP_STREAM;
    this.clock = clock;
    const lures = sim.scene.lures ?? [];
    const l = lures[this.lure];
    const fill = (sim.lures as { fill?: number[] }).fill?.[this.lure];
    // The cage already full (or cut) when she came: the stream is long gone.
    const hung = !!l && (!l.after || sim.save.flags.includes(l.after));
    if (fill === undefined || fill < 0) this.taken = hung ? this.count : 0;
    for (const e of sim.events) {
      const ev = e as unknown as { type: string; lure?: string; n?: number; x?: number; y?: number };
      if (ev.type === 'trapFill' && l && ev.lure === l.id) {
        // The next moth of the stream to pass nearest the cage swerves out of it.
        const k = this.taken;
        const [x, y] = this.mothAt(k);
        this.bends.push({ x0: x, y0: y, t: 0, seed: hash01('tb', k) });
        this.taken = Math.min(this.count, Math.max(this.taken + 1, ev.n ?? 0));
      } else if (ev.type === 'denStir') this.slam(sim);
    }

    const f = this.front.clear();
    this.glow.begin();
    // The stream: what is left of it.
    for (let k = this.taken; k < this.count; k++) {
      const [x, y, h] = this.mothAt(k);
      const s = S.size[0] + (S.size[1] - S.size[0]) * h;
      // (In the air layer: in `goal` the room's light mask took them to dark specks away from the lamps.)
      moth(f, x, y, s, Math.abs(Math.sin(clock * (12 + 5 * h) + k)), 1, S.color, 0.85);
      this.glow.add(x, y, 26, 0xdce8ff, 0.12);
    }
    // The caught: a swerve out of the stream, then a tightening spiral into the cage's orbit (wings turning regular).
    for (let i = this.bends.length - 1; i >= 0; i--) {
      const b = this.bends[i] as Bend;
      b.t += dt;
      const u = b.t / S.bend;
      if (u >= 1 || !l) {
        this.bends.splice(i, 1);
        if (l) this.gulps.push(0);
        continue;
      }
      const e = u * u * (3 - 2 * u);
      const turn = b.seed * 6.28 + u * 9;
      const r = S.orbit * (1 + 2.5 * (1 - e));
      const cx = l.x + Math.cos(turn) * r;
      const cy = l.y + Math.sin(turn) * r * 0.55;
      const x = b.x0 + (cx - b.x0) * e;
      const y = b.y0 + (cy - b.y0) * e - Math.sin(Math.PI * u) * 60;
      // Its beat falls into the lamp's: from its own flutter to the cage's steady one.
      const flap = Math.abs(Math.sin(clock * (14 + 6 * b.seed) * (1 - e) + clock * 18 * e));
      // The pull: a warm thread from the lamp to it, strongest as it leaves the stream.
      f.moveTo(x, y)
        .lineTo(l.x, l.y)
        .stroke({
          color: S.warm,
          width: 1.5,
          // (Long, it read as a laser line across the frame: only near the lamp.)
          alpha:
            0.28 *
            Math.sin(Math.PI * Math.min(1, u * 1.4)) *
            Math.max(0, 1 - Math.hypot(x - l.x, y - l.y) / 320),
        });
      // A pale trail behind it along its swerve.
      for (let q = 1; q <= S.trail; q++) {
        const uq = Math.max(0, u - q * 0.035);
        const eq = uq * uq * (3 - 2 * uq);
        const tq = b.seed * 6.28 + uq * 9;
        const rq = S.orbit * (1 + 2.5 * (1 - eq));
        const qx = b.x0 + (l.x + Math.cos(tq) * rq - b.x0) * eq;
        const qy = b.y0 + (l.y + Math.sin(tq) * rq * 0.55 - b.y0) * eq - Math.sin(Math.PI * uq) * 60;
        this.glow.add(qx, qy, 14 - q * 2, S.sheen, 0.2 * (1 - q / (S.trail + 1)));
      }
      const col = mixRGB(S.sheen, S.warm, Math.max(0, (u - 0.6) / 0.4));
      moth(f, x, y, S.caught, flap, Math.cos(turn) > 0 ? -1 : 1, col, 0.97);
      this.glow.add(x, y, 30, col, 0.22);
    }
    // The cage's light gulps as each one joins it.
    for (let i = this.gulps.length - 1; i >= 0; i--) {
      const t = (this.gulps[i] as number) + dt;
      this.gulps[i] = t;
      if (t >= S.gulp || !l) {
        this.gulps.splice(i, 1);
        continue;
      }
      const v = t / S.gulp;
      if (l) this.glow.add(l.x, l.y, 90 + 90 * v, S.warm, S.gulpA * (1 - v));
    }
    this.drawGrains(dt);
    this.glow.end();
  }

  /** The den answers: dust shaken off the lintel of the den's mouth (the room's east end, over the floor). */
  private slam(sim: SimView): void {
    const S = TRAP_STREAM;
    const gates =
      (sim.scene as { gates?: Array<{ x: number; y: number; w: number; h: number }> }).gates ?? [];
    // (The den's mouth: the room's east-most gate, or its east edge high up.)
    const mouth = [...gates].sort((a, b) => b.x - a.x)[0];
    const x = mouth ? mouth.x + mouth.w / 2 : sim.scene.width - 200;
    const y = mouth ? mouth.y - 10 : 1400;
    for (let k = 0; k < S.dust; k++) {
      const h = hash01('sd', k + this.grains.length);
      this.grains.push({
        x: x + (h - 0.5) * S.dustW,
        y: y + hash01('sdy', k) * 20,
        vx: (hash01('sdx', k) - 0.5) * 40,
        vy: 20 + 120 * hash01('sdv', k),
        t: -0.25 * hash01('sdt', k),
        life: 1.2 + hash01('sdl', k),
        s: 1.5 + 3.5 * hash01('sds', k),
      });
    }
  }

  private drawGrains(dt: number): void {
    const S = TRAP_STREAM;
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const q = this.grains[i] as Grain;
      q.t += dt;
      if (q.t < 0) continue;
      if (q.t > q.life) {
        this.grains.splice(i, 1);
        continue;
      }
      q.vy += 420 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      this.front.circle(q.x, q.y, q.s).fill({ color: S.dustColor, alpha: 0.75 * (1 - q.t / q.life) });
    }
  }
}

/** Two 0xRRGGBB colours mixed `t` of the way. */
function mixRGB(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number): number => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}
