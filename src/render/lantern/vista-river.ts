/**
 * The area's ending, its vista (the Canopy r12, docs/design/levels/canopy-moments.md moment 7, the fallback: no escape
 * hazards). From the clifftop over the valley of lamps:
 *
 *   streams   far off over the canopy to the west, thin pale streams lift out of the wood where she freed each cage
 *             (the hub's roosts: one per freed trap in `save.snuffed`) and the den's cloud out of its shaft behind
 *             her; they curve up and join one river that goes away east toward the mountain under the moon. Its
 *             density is her count (`save.moths`).
 *   glide     the river comes down to her height along the glide from the clifftop's end to the door's ledge
 *             (`marks.landmarks` vista -> the `arch`): moths pass round her, in front and behind, a little faster
 *             than she glides. Flying with them is what she could not do at the hatch.
 *
 * The far streams are drawn in the far plane (`swarmFar`, parallax 0.4) placed from the vista's camera
 * (`marks.stage.vista`); the river at her height at parallax 1 (behind her in `goal`, in front in `air`).
 * Render only: reads the save and her place.
 */
import { Graphics } from 'pixi.js';
import type { CameraView, SimView } from '../contract';
import type { SceneContext } from '../scene/index';
import type { LayerTree } from '../scene/layer-tree';
import { mix } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';
import { moth } from './lamps';

export const VISTA_RIVER = {
  /** The far plane's parallax, the river's end on screen from the vista camera (safe px: toward the moon's mountain). */
  parallax: 0.4,
  to: [1500, 470] as const,
  /** Where each stream rises from (safe px from the vista camera): the hub's roosts far west, low; the den's behind. */
  roosts: [
    [470, 880],
    [600, 940],
    [740, 860],
  ] as const,
  den: [420, 300] as const,
  /** Moths in a stream (at a full count) and in the river, their size (px), speed (share of the path a second). */
  // (Canopy review r12 #5: 160 at 3-5.5 px read as a dozen pale specks. Thicker, bigger, a glow along it, and a floor
  // on the density whatever the count: `floor` of the full river at the least.)
  stream: 70,
  river: 340,
  size: [4, 7.5] as const,
  floor: 0.6,
  speed: [0.05, 0.09] as const,
  /** The count (`save.moths`) that fills the river: under it, fewer moths. */
  full: 220,
  color: 0xe8eef8,
  warm: 0xf4e2c0,
  /** The glide's river: moths, half thickness (px), speed (px/s), size (px), share drawn in front of her. */
  glide: { n: 300, half: 190, speed: 360, size: [9, 16] as const, front: 0.4, floor: 0.75 },
};

export class VistaRiver {
  private readonly far = new Graphics();
  private readonly back = new Graphics();
  private readonly front = new Graphics();
  private readonly glowFar = new GlowPool('vista-river-glow');
  private readonly cam0: { x: number; y: number; zoom: number };
  private readonly line: { x0: number; y0: number; x1: number; y1: number } | null;
  private readonly layers: LayerTree;
  private snuffed: readonly string[] = [];

  static for(ctx: SceneContext): VistaRiver | null {
    if (LOOK.kit !== 'wood') return null;
    const st = ctx.scene.marks?.stage as { vista?: { x: number; y: number; zoom?: number } } | undefined;
    return st?.vista ? new VistaRiver(ctx) : null;
  }

  private constructor(ctx: SceneContext) {
    const st = ctx.scene.marks?.stage as { vista: { x: number; y: number; zoom?: number } };
    this.cam0 = { x: st.vista.x, y: st.vista.y, zoom: st.vista.zoom ?? 1 };
    const lm = (ctx.scene.marks?.landmarks ?? []) as Array<{ kind: string; x: number; y: number }>;
    const from = lm.find((l) => l.kind === 'vista');
    const to = lm.find((l) => l.kind === 'arch');
    // The glide: from the clifftop's end out over the valley to the door's ledge (a little over it: she lands).
    let edge = from?.x ?? 0;
    if (from)
      for (const s of ctx.scene.solids)
        if (s.y === from.y && s.x <= from.x && s.x + s.w > edge) edge = s.x + s.w;
    this.line = from && to ? { x0: edge, y0: from.y - 40, x1: to.x, y1: to.y - 60 } : null;
    this.layers = ctx.layers;
    ctx.layers.get('swarmFar').addChild(this.glowFar.container, this.far);
    ctx.layers.get('goal').addChild(this.back);
    ctx.layers.air.addChild(this.front);
  }

  draw(_dt: number, clock: number, sim: SimView, cam: CameraView): void {
    this.far.clear();
    this.back.clear();
    this.front.clear();
    this.glowFar.begin();
    // (A look probe, `window.__vista = {moths, snuffed}`: the ending as if she had freed these. Never set in play.)
    const fake = (globalThis as { __vista?: { moths: number; snuffed: string[] } }).__vista;
    const freed = fake?.moths ?? sim.save.moths ?? 0;
    this.snuffed = fake?.snuffed ?? sim.save.snuffed ?? [];
    if (freed > 0) {
      this.drawFar(clock, cam, freed);
      this.drawGlide(clock, sim, cam, freed);
    }
    this.glowFar.end();
  }

  /** Screen (safe px, seen from the vista camera) -> the far layer's own coordinates now. */
  private far2(sx: number, sy: number, cam: CameraView): [number, number] {
    const V = VISTA_RIVER;
    const p = this.layers.parallax('swarmFar');
    const A = this.layers.anchor;
    const cx = A.x + (cam.x - A.x) * p;
    const cy = A.y + (cam.y - A.y) * p;
    const z0 = this.cam0.zoom;
    return [
      cx + (sx - 960) / z0 + (this.cam0.x - cam.x) * V.parallax,
      cy + (sy - 540) / z0 + (this.cam0.y - cam.y) * V.parallax,
    ];
  }

  private drawFar(clock: number, cam: CameraView, freed: number): void {
    const V = VISTA_RIVER;
    const g = this.far;
    const dens = Math.min(1, V.floor + ((1 - V.floor) * freed) / V.full);
    const snuffed = this.snuffed;
    // The streams: the hub's (one per freed trap there or that roosts there) and the den's.
    const sources: Array<readonly [number, number]> = [];
    const hubTraps = snuffed.filter((s) => s.startsWith('cn-') && !s.startsWith('cn-den')).length;
    for (let i = 0; i < Math.min(V.roosts.length, Math.max(hubTraps, 0)); i++)
      sources.push(V.roosts[i] as readonly [number, number]);
    if (snuffed.some((s) => s.startsWith('cn-den'))) sources.push(V.den);
    const [tx, ty] = this.far2(V.to[0], V.to[1], cam);
    // The join: the streams meet over the valley's far side, then go on as one to the mountain.
    const [jx, jy] = this.far2(980, 470, cam);
    const curve = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      u: number,
      lift: number,
    ): [number, number] => {
      const mx = (ax + bx) / 2;
      const my = Math.min(ay, by) - lift;
      const a = (1 - u) * (1 - u);
      const b = 2 * u * (1 - u);
      const c = u * u;
      return [a * ax + b * mx + c * bx, a * ay + b * my + c * by];
    };
    sources.forEach(([sx0, sy0], si) => {
      const [sx, sy] = this.far2(sx0, sy0, cam);
      const n = Math.round(V.stream * dens);
      // A faint column of light where it rises out of the wood (the roost's place, far off).
      this.glowFar.add(sx, sy, 60, 0xcfe0ff, 0.1);
      for (let k = 0; k < n; k++) {
        const h = hash01(`vs${si}`, k);
        const u = (clock * (V.speed[0] + (V.speed[1] - V.speed[0]) * h) + h) % 1;
        const [x, y] = curve(sx, sy, jx, jy, u, 120 + 40 * si);
        const wob = Math.sin(clock * 2 + k) * 6 * (1 - u);
        const s = V.size[0] + (V.size[1] - V.size[0]) * hash01(`vz${si}`, k);
        const fade = Math.min(1, u * 8) * Math.min(1, (1 - u) * 8 + 0.6);
        moth(
          g,
          x + wob,
          y + (hash01(`vy${si}`, k) - 0.5) * 18,
          s,
          Math.abs(Math.sin(clock * 15 + k)),
          1,
          V.color,
          0.85 * fade,
        );
      }
    });
    if (sources.length === 0) return;
    // The river: one band from the join away to the mountain, its moths as many as she freed.
    const n = Math.round(V.river * dens);
    for (let k = 0; k < n; k++) {
      const h = hash01('vr', k);
      const u = (clock * (V.speed[0] + (V.speed[1] - V.speed[0]) * h) * 0.8 + h) % 1;
      const [x, y] = curve(jx, jy, tx, ty, u, 40);
      const side = (hash01('vrs', k) - 0.5) * 70 * (1 - 0.7 * u);
      const s = (V.size[0] + (V.size[1] - V.size[0]) * hash01('vrz', k)) * (1 - 0.45 * u);
      const fade = Math.min(1, (1 - u) * 5);
      // Its scale dust: a soft light along the band, so the river has a shape and not only specks.
      if (k % 8 === 0) this.glowFar.add(x, y + side * 0.5, 46 * (1 - 0.5 * u), 0xcfe0ff, 0.07 * fade);
      moth(
        g,
        x,
        y + side,
        s,
        Math.abs(Math.sin(clock * 15 + k * 1.3)),
        1,
        mix(V.color, 0xbcd4ff, u),
        0.85 * fade,
      );
    }
  }

  /** The river at her height along the glide: moths in a band round the line, passing her, in front and behind. */
  private drawGlide(clock: number, sim: SimView, cam: CameraView, freed: number): void {
    const L = this.line;
    if (!L) return;
    const G = VISTA_RIVER.glide;
    const p = sim.player;
    // Only while she is out over the valley (or about to step off), fading in over the clifftop's end.
    const along = (p.cx - L.x0) / (L.x1 - L.x0);
    const k = smooth((along + 0.15) / 0.2) * (1 - smooth((along - 1) / 0.1));
    if (k <= 0.01) return;
    const dx = L.x1 - L.x0;
    const dy = L.y1 - L.y0;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const n = Math.round(G.n * Math.min(1, G.floor + ((1 - G.floor) * freed) / VISTA_RIVER.full) * k);
    const halfW = cam.w / 2 / cam.zoom + 80;
    for (let i = 0; i < n; i++) {
      const h = hash01('gl', i);
      // Each one loops the line at its own pace; the band is a little wider over the valley's middle.
      const u = ((clock * G.speed * (0.8 + 0.4 * h)) / len + h) % 1;
      const off = (hash01('glo', i) - 0.5) * 2 * G.half * (0.6 + 0.4 * Math.sin(Math.PI * u));
      const x = L.x0 + ux * len * u - uy * off + Math.sin(clock * 2.3 + i) * 10;
      const y = L.y0 + uy * len * u + ux * off + Math.sin(clock * 3.1 + i * 1.7) * 12;
      if (Math.abs(x - cam.x) > halfW) continue;
      const s = G.size[0] + (G.size[1] - G.size[0]) * hash01('glz', i);
      const front = hash01('glf', i) < G.front;
      const fade = Math.min(1, u * 10) * Math.min(1, (1 - u) * 10);
      moth(
        front ? this.front : this.back,
        x,
        y,
        front ? s * 1.15 : s * 0.85,
        Math.abs(Math.sin(clock * 14 + i * 1.1)),
        1,
        front ? VISTA_RIVER.warm : VISTA_RIVER.color,
        (front ? 0.95 : 0.7) * fade * k,
      );
    }
  }
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
