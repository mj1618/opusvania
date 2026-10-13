/**
 * What a fade cost her (memory/pickups.md, "Dropped clusters"): the glints she left where she fell.
 *
 * Waiting, they are a small huddle of dormant glints on the ground, breathing together, one of them
 * lifting its head now and then; a mote drifts up from them so the place can be found.
 * They are the glints of the world (same quad, same shader) but quieter than any of those. When she
 * comes back they wake at her touch and return to her one at a time, each landing on its `pickup
 * {drop}` event.
 *
 * State comes from `sim.pickups.drops` every frame (a load or a state jump just shows them lying
 * there); `glintsDrop` and `dropWake` only start the two moments. Render time only.
 */
import type { CameraView, SimView } from '../contract';
import { VIEW_H, VIEW_W } from '../contract';
import { type GlintBatch, K_FLARE, K_GLINT, K_SPARK } from '../pickups/batch';
import { smooth } from './logic';
import type { SurfaceLight } from './surface';

export const DROPS = {
  /** How many glints the huddle shows at most (a bigger loss is still one small huddle). */
  max: 7,
  /** A glint's quad half-size in px at scale 1 (the world glint's). */
  quad: 46,
  /** The lowest of them hangs this far over the ground, px (clear of the grass fringe). */
  height: 22,
  /** Waiting: scale and brightness of each, how dormant (1 = no white heat at all). */
  scale: 0.54,
  gain: 0.8,
  dormancy: 0.55,
  /** Seconds per shared breath, and how deep it goes. */
  breath: 3.6,
  breathDepth: 0.22,
  /** Every `beckon` s one of them lifts `beckonLift` px and brightens for a moment. */
  beckon: 2.6,
  beckonLift: 7,
  /** They stir as she comes within `nearPx` (fully by `nearFull`). */
  nearPx: 300,
  nearFull: 120,
  /** Motes that lift off them, one after another, so the place is found: how high px, seconds each, brightness. */
  motes: { n: 2, height: 64, seconds: 4.2, gain: 0.55 },
  /** Their glow on the ground: radii px, strength. */
  pool: { rx: 86, ry: 46, gain: 0.3 },
  /** Falling out of her as she fades: seconds to settle and to go quiet. */
  settle: 0.9,
  quiet: 2.2,
  /** Woken: scale and lift of the ones still waiting their turn; seconds of each flight back. */
  wakeScale: 0.7,
  wakeLift: 9,
  fly: 0.36,
};

interface Knot {
  /** Seconds since she dropped it (large = it was there already). */
  age: number;
  /** Seconds since she touched it, -1 = waiting. */
  wake: number;
  /** From `dropWake`: how many come back, seconds to the first landing and between landings. */
  n: number;
  first: number;
  gap: number;
  x: number;
  y: number;
  seen: boolean;
}

const LONG = 1e6;
const GOLDEN = 2.39996;

export class DropsView {
  private readonly knots = new Map<number, Knot>();
  /** A beat of light at her chest as one lands. */
  private land = 0;

  /** Where glint `k` of a huddle of `n` sits, relative to the cluster's foot: x in out[0], y in out[1]. */
  private spot(id: number, k: number, out: number[]): void {
    const a = k * GOLDEN + id * 1.7;
    const r = k === 0 ? 0 : 7 + 5.2 * Math.sqrt(k);
    out[0] = Math.cos(a) * r;
    // A low mound resting on the grass tips (the fringe in front hides anything lower): the middle
    // ones a little higher.
    out[1] = -DROPS.height - 9 * Math.abs(Math.sin(a)) * (k === 0 ? 1.9 : 1) - (k % 3) * 3.5;
  }

  private readonly tmp = [0, 0];

  update(
    dt: number,
    clock: number,
    cam: CameraView,
    sim: SimView,
    back: GlintBatch,
    front: GlintBatch,
    surface: SurfaceLight,
    chestX: number,
    chestY: number,
  ): void {
    const D = DROPS;
    const drops = sim.pickups.drops ?? [];
    const knots = this.knots;
    for (const e of sim.events) {
      if (e.type === 'glintsDrop') {
        knots.set(e.id, { age: 0, wake: -1, n: e.value, first: 0, gap: 0, x: e.x, y: e.y, seen: true });
      } else if (e.type === 'dropWake') {
        const k = knots.get(e.id) ?? {
          age: LONG,
          wake: -1,
          n: 0,
          first: 0,
          gap: 0,
          x: e.x,
          y: e.y,
          seen: true,
        };
        k.wake = 0;
        k.n = e.value;
        k.first = e.frames / 60;
        k.gap = e.stagger / 60;
        knots.set(e.id, k);
      }
    }
    for (const k of knots.values()) k.seen = false;
    for (const d of drops) {
      let k = knots.get(d.id);
      if (!k) {
        // It was there already (a load, a state jump): no ceremony; one on its way back just finishes.
        k = { age: LONG, wake: -1, n: d.left, first: 0, gap: 0, x: d.x, y: d.y, seen: true };
        knots.set(d.id, k);
      }
      k.seen = true;
      if (k.wake < 0) k.n = d.left;
    }
    this.land *= Math.exp(-dt * 14);

    const half = sim.player.h / 2;
    const hw = VIEW_W / 2 / cam.zoom + 200;
    const hh = VIEW_H / 2 / cam.zoom + 200;
    const out = this.tmp;
    for (const [id, k] of knots) {
      k.age += dt;
      if (k.wake >= 0) k.wake += dt;
      const last = k.first + Math.max(0, k.n - 1) * k.gap;
      // Gone from the state: forget it, unless its last glints are still in the air.
      if (!k.seen && (k.wake < 0 || k.wake > last + 0.2)) {
        knots.delete(id);
        continue;
      }
      if (Math.abs(k.x - cam.x) > hw || Math.abs(k.y - cam.y) > hh) continue;
      const gx = k.x;
      const gy = k.y + half;
      const vis = Math.max(1, Math.min(D.max, k.n));
      const woke = k.wake >= 0;
      // How many have left the huddle so far, and which spots still hold one.
      let gone = 0;
      if (woke) {
        for (let j = 0; j < k.n; j++) {
          const landAt = k.first + j * k.gap;
          if (k.wake >= landAt - Math.min(D.fly, landAt)) gone = j + 1;
          else break;
        }
      }
      const near = 1 - smooth(D.nearFull, D.nearPx, Math.hypot(chestX - gx, chestY - (gy - 20)));
      const up = woke ? smooth(0, 0.16, k.wake) : 0;
      const fresh = 1 - smooth(0, D.quiet, k.age);
      const stir = Math.max(up, 0.55 * near, fresh);
      const breath = 1 - D.breathDepth * (0.5 + 0.5 * Math.sin((clock * 6.2832) / D.breath + id * 1.3));
      const turn = Math.floor(clock / D.beckon + id * 0.37);
      const bk = (clock / D.beckon + id * 0.37) % 1;
      const beck = Math.sin(Math.PI * smooth(0, 0.3, bk)) ** 2;

      // --- The huddle.
      let held = 0;
      for (let s = 0; s < vis; s++) {
        // Spot `s` is empty once the last glint that waited in it has gone.
        let waits = false;
        for (let j = gone; j < Math.min(k.n, gone + vis); j++) if (j % vis === s) waits = true;
        if (woke && !waits) continue;
        held++;
        this.spot(id, s, out);
        // Fresh from her: each falls from where her body lay to its place.
        const fall = 1 - smooth(0, D.settle, k.age - s * 0.06);
        const lift = (woke ? D.wakeLift * up : 0) + (turn % vis === s ? D.beckonLift * beck * (1 - up) : 0);
        const lean = 5 * near * Math.sign(chestX - gx) * (1 - up);
        const x = gx + (out[0] as number) * (1 + 0.5 * fall) + lean;
        const y = gy + (out[1] as number) - lift - (half - 6 + s * 3) * fall * fall;
        const hop = turn % vis === s ? beck * (1 - up) : 0;
        const size = D.scale + (D.wakeScale - D.scale) * stir + 0.06 * hop;
        const e = (D.gain * breath + (1 - D.gain) * stir + 0.25 * hop) * smooth(0, 0.12, k.age - s * 0.04);
        const dorm = D.dormancy * (1 - Math.max(stir, 0.6 * hop));
        back.quad(K_GLINT, x, y, D.quad * size, D.quad * size, e, (id * 0.31 + s * 0.173) % 1, dorm);
      }
      const here = Math.min(1, held / vis);

      // --- Their light on the ground under them, and the wisp that stands over them.
      const glow = (0.75 + 0.25 * stir) * breath * here * smooth(0, 0.5, k.age);
      surface.light(cam, gx, gy - 6, D.pool.rx, D.pool.ry, D.pool.gain * glow, 0.2);
      back.quad(K_FLARE, gx, gy - D.height - 6, 30, 20, 0.2 * glow, 0, 0);
      // A mote lifts off them now and then and drifts up: what the eye catches from across the screen.
      const M = D.motes;
      for (let m = 0; m < M.n; m++) {
        const ph = (clock / M.seconds + m / M.n + id * 0.41) % 1;
        const mx = gx + Math.sin(ph * 5 + m * 2 + id) * 7 + (m - 0.5) * 8;
        const my = gy - D.height - 10 - M.height * ph ** 0.8;
        back.quad(
          K_SPARK,
          mx,
          my,
          2.6,
          2.6,
          M.gain * Math.sin(Math.PI * ph) ** 1.5 * glow,
          0,
          0.5 * (1 - ph),
        );
      }

      if (!woke) continue;
      // --- Her touch: a soft swell at the huddle and along the ground.
      const t = k.wake;
      if (t < 0.6) {
        const f = smooth(0, 0.08, t) * (1 - t / 0.6) ** 1.6;
        back.quad(K_FLARE, gx, gy - D.height - 6, 34 + 30 * t, 26 + 20 * t, 0.42 * f, 0, 0.3);
        for (const dir of [-1, 1])
          back.quad(K_FLARE, gx + dir * (20 + 150 * t), gy - 5, 46, 7, 0.4 * f, 0, 0);
      }
      // --- They come back, one at a time.
      for (let j = 0; j < k.n; j++) {
        const landAt = k.first + j * k.gap;
        const fly = Math.min(D.fly, landAt);
        const u = (t - (landAt - fly)) / fly;
        if (u < 0) break;
        if (u >= 1) {
          if (u < 1 + dt / fly) this.land = 1;
          continue;
        }
        this.spot(id, j % vis, out);
        const sx = gx + (out[0] as number);
        const sy = gy + (out[1] as number) - D.wakeLift;
        const side = (j % 2 === 0 ? 1 : -1) * (14 + 16 * ((j * 0.618) % 1));
        // A short tail: the same path a little earlier.
        for (let q = 3; q >= 0; q--) {
          const uu = u - q * 0.07;
          if (uu <= 0) continue;
          const kk = uu ** 1.7;
          const arc = Math.sin(Math.PI * uu);
          const x = sx + (chestX - sx) * kk + side * arc * (1 - uu);
          const y = sy + (chestY - sy) * kk - 20 * arc;
          if (q === 0) {
            const size = D.wakeScale * (1 - 0.35 * uu);
            front.quad(K_GLINT, x, y, D.quad * size, D.quad * size, 1, (j * 0.173) % 1, 0);
          } else front.quad(K_SPARK, x, y, 3.2 - 0.6 * q, 3.2 - 0.6 * q, 0.6 - 0.15 * q, 0, 0.5);
        }
      }
    }
    if (this.land > 0.02) front.quad(K_FLARE, chestX, chestY, 11, 11, 0.3 * this.land, 0, 0.5);
  }
}
