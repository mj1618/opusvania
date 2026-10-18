/**
 * The night layer's own backdrop (review proto-1 r1 §2, §5: A1's frame was ~60% empty sky), over the wood's:
 *
 *   far2  the forest below the fallen giant, two treelines over the wood's far composite: a hazed far one of
 *         spires and round crowns, its tops catching the moon, and a nearer one, darker, taller, the old giants
 *         among it; both sink under the crest so the vista from it reads (the room's `vista` landmark)
 *   mid   the giant's own broken crown where it lies (the chamber with the `nest` landmark): great limbs reaching up
 *         out of the log into the sky, boughs and a few clinging clumps of leaves, moonlit on their upper right;
 *         clear of the nest itself (they are background, never a climb)
 *
 * Placements map room points into each layer for the chamber camera that shows them (lib/lr-back.ts `toLayer`).
 * Baked once through the shared atmosphere pass. Render only.
 */
import { Container, Graphics } from 'pixi.js';
import type { Room } from '../../scene/room';
import type { SceneContext } from '../scene/index';
import type { LayerName, LayerRect } from '../scene/layer-tree';
import { type Atmosphere, bakeLayer, coverRect, type FogSpec, LayerView } from '../scene/lib/bg-bake';
import { fbm1, type Rng, rr, TO_LIGHT } from '../scene/lib/bg-shapes';
import { prng } from '../scene/lib/look';
import { ceilFloor, chamberCamX, moonHoles, type Placer, toLayer } from '../scene/lib/lr-back';

export const NIGHT_BACK = {
  /** The treelines: their base and tallest trees as room y at rest (the camera's lowest view), colour. */
  far: { base: 1180, tall: [110, 270] as const, color: 0x1a2a3e, gap: [26, 60] as const },
  near: { base: 1290, tall: [170, 390] as const, color: 0x0e1a28, gap: [34, 80] as const },
  /** How far the treelines sink under the vista (px) and over what half width (room px). */
  vistaSink: 230,
  vistaHalf: 1300,
  /** The crown: limb colour, the clinging leaves. */
  crown: 0x0a121c,
  leaves: 0x0c1824,
  scale: { far: 0.5, near: 0.7, mid: 1 },
} as const;

const flat = [1, 1, 1] as const;

function atm(depth: 0 | 1 | 2, rect: LayerRect): Atmosphere {
  return {
    fogColor: [0x2a405a, 0x1c2e44, 0x101c2a][depth] as number,
    fogTop: [0.5, 0.32, 0.14][depth] as number,
    fogGround: [0.62, 0.44, 0.24][depth] as number,
    fogY0: rect.y + rect.h * 0.35,
    fogY1: rect.y + rect.h * 0.9,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellColor: 0,
    wellStrength: 0,
    formDist: 24,
    formLit: 0.5,
    formShade: 0.35,
    rimDist: [4, 5, 6][depth] as number,
    rimColor: 0xb8d0ec,
    rimStrength: [0.35, 0.5, 0.65][depth] as number,
    mottle: 0.15,
    litGain: 1,
    sunMix: 0.3,
    sunColor: 0x9fc0e6,
    zoneParallax: [0.25, 0.42, 0.68][depth] as number,
    sideBody: 0.6,
    sideLit: 0.8,
    sideRim: 1,
    tint: flat,
    shadeTint: [0.36, 0.42, 0.52],
    gain: 1,
    saturation: 1,
    blur: [2.4, 1.4, 0.8][depth] as number,
  };
}

function fog(depth: 0 | 1 | 2, rect: LayerRect): FogSpec {
  return {
    color: [0x2c4462, 0x22384e, 0x182a3c][depth] as number,
    warm: 0x2c4462,
    yTop: rect.y + rect.h * 0.4,
    yFull: rect.y + rect.h * 0.95,
    alphaTop: 0.05,
    alpha: [0.3, 0.24, 0.16][depth] as number,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellAlpha: 0,
    scale: 1 / 1100,
    speed: 0.02,
    wisp: 0.8,
  };
}

/** A conifer: a spire with ragged tiers. */
function spire(g: Graphics, x: number, base: number, h: number, w: number, r: Rng): void {
  const pts: number[] = [x, base - h];
  const tiers = Math.max(4, Math.round(h / 26));
  for (let k = 1; k <= tiers; k++) {
    const t = k / tiers;
    const half = w * (0.12 + 0.88 * t) * (0.8 + 0.3 * r());
    pts.push(x + half, base - h + h * t - rr(r, 4, 12), x + half * 0.55, base - h + h * t);
  }
  const right = pts.slice(2);
  const left: number[] = [];
  for (let i = right.length - 2; i >= 0; i -= 2)
    left.push(2 * x - (right[i] as number) + rr(r, -3, 3), right[i + 1] as number);
  g.poly([x, base - h, ...right, x + w * 0.1, base + 60, x - w * 0.1, base + 60, ...left]);
}

/** A broadleaf crown: a lumpy dome on a short trunk. */
function crown(g: Graphics, x: number, base: number, h: number, w: number, r: Rng): void {
  const pts: number[] = [];
  const n = 22;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI + (Math.PI * k) / n;
    const bump = 1 + 0.16 * Math.sin(k * 2.7 + r() * 2) + 0.08 * r();
    pts.push(x + Math.cos(a) * w * 0.5 * bump, base - h * 0.45 + Math.sin(a) * h * 0.55 * bump);
  }
  pts.push(x + w * 0.5, base + 60, x - w * 0.5, base + 60);
  g.poly(pts);
}

/** A treeline across the layer: spires and crowns, the odd old giant towering, filled solid below. */
function treeline(
  g: Graphics,
  rect: LayerRect,
  base: (x: number) => number,
  tall: readonly [number, number],
  gap: readonly [number, number],
  color: number,
  r: Rng,
): void {
  const x0 = rect.x - 100;
  const x1 = rect.x + rect.w + 100;
  const nz = fbm1(Math.floor(r() * 1000));
  for (let x = x0; x < x1; x += rr(r, gap[0], gap[1])) {
    const swell = 0.75 + 0.35 * nz(x / 700);
    const giant = r() < 0.05;
    const h = rr(r, tall[0], tall[1]) * swell * (giant ? 1.6 : 1);
    const b = base(x);
    if (r() < 0.62 || giant) spire(g, x, b, h, h * rr(r, 0.28, 0.4), r);
    else crown(g, x, b, h * 0.7, h * rr(r, 0.7, 1), r);
    // (Each shape filled on its own: overlapping sub-paths in one fill cancel each other out.)
    g.fill(color);
  }
  const pts: number[] = [x0, rect.y + rect.h + 400];
  for (let x = x0; x <= x1; x += 40) pts.push(x, base(x) - 30);
  pts.push(x1, rect.y + rect.h + 400);
  g.poly(pts).fill(color);
}

/** A limb: a tapered ribbon along a curve from (x0, y0) toward (x1, y1), bowing by `bow`. */
function limb(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  bow: number,
  r: Rng,
): number[] {
  const line: number[] = [];
  const n = 26;
  const nz = fbm1(Math.floor(r() * 1000));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const off = bow * Math.sin(Math.PI * t) + nz(t * 3) * L * 0.03;
    line.push(x0 + dx * t + (-dy / L) * off, y0 + dy * t + (dx / L) * off);
  }
  const left: number[] = [];
  const right: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const w = (w0 + (w1 - w0) * t ** 0.8) / 2;
    const ax = line[Math.max(0, k - 1) * 2] as number;
    const ay = line[Math.max(0, k - 1) * 2 + 1] as number;
    const bx = line[Math.min(n, k + 1) * 2] as number;
    const by = line[Math.min(n, k + 1) * 2 + 1] as number;
    const l = Math.hypot(bx - ax, by - ay) || 1;
    left.push(
      (line[k * 2] as number) - ((by - ay) / l) * w,
      (line[k * 2 + 1] as number) + ((bx - ax) / l) * w,
    );
    right.unshift(
      (line[k * 2] as number) + ((by - ay) / l) * w,
      (line[k * 2 + 1] as number) - ((bx - ax) / l) * w,
    );
  }
  g.poly([...left, ...right]);
  return line;
}

/** Boughs off a limb's line, each forking twice into twigs, and a clump of leaves at some tips. */
function boughs(
  g: Graphics,
  line: number[],
  w: number,
  r: Rng,
  leaves: Array<[number, number, number]>,
  depth = 0,
): void {
  const n = line.length / 2;
  const count = depth === 0 ? 4 : 2;
  for (let k = 0; k < count; k++) {
    const i = Math.floor(rr(r, 0.3, 0.92) * (n - 1));
    const x = line[i * 2] as number;
    const y = line[i * 2 + 1] as number;
    const ax = (line[Math.min(n - 1, i + 1) * 2] as number) - x;
    const ay = (line[Math.min(n - 1, i + 1) * 2 + 1] as number) - y;
    const a = Math.atan2(ay, ax) + (r() < 0.5 ? -1 : 1) * rr(r, 0.45, 0.95);
    const len = rr(r, 120, 320) * (depth ? 0.5 : 1);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const sub = limb(g, x, y, ex, ey, w * 0.5, 2, rr(r, -30, 30), r);
    g.fill(NIGHT_BACK.crown);
    if (depth < 1) boughs(g, sub, w * 0.5, r, leaves, depth + 1);
    else if (r() < 0.7) leaves.push([ex, ey, rr(r, 40, 90)]);
  }
}

export class NightBack {
  private readonly views: LayerView[] = [];

  constructor(ctx: SceneContext) {
    const room = ctx.scene as Room;
    const P: Placer = {
      room,
      anchor: ctx.layers.anchor,
      lamps: [],
      holes: moonHoles(room),
      ...ceilFloor(room),
    };
    const marks = room.marks as { landmarks?: Array<{ kind: string; x: number; y: number }> } | undefined;
    const vista = marks?.landmarks?.find((l) => l.kind === 'vista');
    const nest = marks?.landmarks?.find((l) => l.kind === 'nest');
    const seed = (room.art?.seed ?? 1) * 29 + 5;
    const bake = (
      name: LayerName,
      parent: Container | undefined,
      depth: 0 | 1 | 2,
      scale: number,
      draw: (g: Graphics, rect: LayerRect, r: Rng) => void,
      index?: number,
    ): void => {
      if (!parent) return;
      const rect = coverRect(ctx.layers, name, 80);
      const c = new Container();
      const g = new Graphics();
      c.addChild(g);
      draw(g, rect, prng(seed + depth * 101));
      const tiles = bakeLayer(
        ctx.renderer,
        c,
        rect,
        Math.min(scale, 4000 / rect.h),
        atm(depth, rect),
        TO_LIGHT,
        undefined,
        0,
      );
      c.destroy({ children: true, context: true });
      const v = new LayerView(
        tiles,
        fog(depth, rect),
        { amp: 0, y0: rect.y - 2000, y1: rect.y - 1999 },
        {
          parallax: [0.25, 0.42, 0.68][depth] as number,
          tintL: flat,
          tintR: flat,
          mistL: 0x1c2e44,
          mistR: 0x1c2e44,
          anchorX: ctx.layers.anchor.x,
        },
        undefined,
        { breath: 0, shimmer: 0, openings: 0 },
      );
      if (index !== undefined) parent.addChildAt(v.container, Math.min(index, parent.children.length));
      else parent.addChild(v.container);
      this.views.push(v);
    };
    // The treelines, sinking under the vista.
    const sink = (f: number) => {
      if (!vista) return () => 0;
      const vx = toLayer(P, vista.x, vista.y, f).x;
      return (x: number): number =>
        NIGHT_BACK.vistaSink * Math.exp(-(((x - vx) / NIGHT_BACK.vistaHalf) ** 4));
    };
    const F = NIGHT_BACK.far;
    const N = NIGHT_BACK.near;
    const sinkFar = sink(0.42);
    const sinkNear = sink(0.42);
    // Both on far2, over the wood's far composite (far0 / far1 are drawn into that opaque sprite, so anything put
    // in them directly is hidden): the far treeline hazier and higher behind the near one.
    bake('far2', ctx.layers.far[2], 0, NIGHT_BACK.scale.far, (g, rect, r) =>
      treeline(g, rect, (x) => F.base + sinkFar(x), F.tall, F.gap, F.color, r),
    );
    bake('far2', ctx.layers.far[2], 1, NIGHT_BACK.scale.near, (g, rect, r) =>
      treeline(g, rect, (x) => N.base + sinkNear(x), N.tall, N.gap, N.color, r),
    );
    // The giant's broken crown, where the nest is (a chamber's worth of mid layer).
    if (nest) {
      bake('mid', ctx.layers.mid, 2, NIGHT_BACK.scale.mid, (g, _rect, r) => {
        // Composed for the chamber's camera at rest (its lowest view), where the crown lines up behind the log.
        const f = 0.68;
        const cx = chamberCamX(room, nest.x);
        const cy = ctx.layers.anchor.y;
        const at = (dx: number, dy: number): [number, number] => [
          nest.x + dx - (1 - f) * (cx - ctx.layers.anchor.x),
          P.floor + dy - (1 - f) * (cy - ctx.layers.anchor.y),
        ];
        const leaves: Array<[number, number, number]> = [];
        // Limbs out of the log: up and back past the nest's left, up and over to its right, one far left.
        const specs: Array<[number, number, number, number, number, number]> = [
          [-380, 40, -620, -1180, 150, 230],
          [380, 40, 760, -1220, 130, -260],
          [-120, 40, 120, -1380, 110, 140],
          [-700, 40, -1300, -760, 120, 120],
        ];
        for (const [ax, ay, bx, by, w, bow] of specs) {
          const [x0, y0] = at(ax, ay);
          const [x1, y1] = at(bx, by);
          const line = limb(g, x0, y0, x1, y1, w, 10, bow, r);
          g.fill(NIGHT_BACK.crown);
          boughs(g, line, w * 0.6, r, leaves);
        }
        // Twigs at the tips: the crown is long dead, bare against the sky.
        for (const [x, y, s0] of leaves) {
          for (let k = 0; k < 4; k++) {
            const a0 = rr(r, -Math.PI, 0);
            const l = s0 * rr(r, 0.5, 1.1);
            limb(g, x, y, x + Math.cos(a0) * l, y + Math.sin(a0) * l, 4, 1, rr(r, -8, 8), r);
            g.fill(NIGHT_BACK.crown);
          }
        }
      });
    }
  }

  update(clock: number, camX: number, camY: number, anchorY: number): void {
    for (const v of this.views) v.update(clock, camX, camY, anchorY);
  }
}
