/**
 * Foreground silhouettes for the inside of a hollow trunk (canopy r19, review r18 #1: the giant's inside framed by
 * leafy boughs, as if outdoors): torn bark lips hanging in from the top of the frame and splintered wood standing in
 * the bottom corners. Same contract as fx-foliage.ts: drawn once around a local origin (where it hangs from or stands
 * on), near-black with a faint rim on the lit side, baked and blurred by the foreground layer.
 */
import type { Graphics } from 'pixi.js';
import { foregroundTones, type Rnd } from './fx-foliage';
import { KEY_LIGHT } from './look';

const LX = -KEY_LIGHT.dirX;
const LY = -KEY_LIGHT.dirY;

/** Fills `pts` with its lit copy pushed toward the light underneath (the rim), then the body. */
function litPoly(
  g: Graphics,
  pts: number[],
  body: number,
  rim: number,
  rimAlpha: number,
  shift: number,
): void {
  g.poly(pts.map((v, i) => v + (i % 2 ? LY : LX) * shift)).fill({ color: rim, alpha: rimAlpha });
  g.poly(pts).fill({ color: body });
}

/**
 * A torn lip of bark hanging in from above (the hollow's broken rim): a slab `span` px across toward `dir`, its lower
 * edge torn into splinters and hanging fibre up to `drop` px down. Origin at the top of the frame.
 */
export function barkLip(g: Graphics, rnd: Rnd, span: number, drop: number, dir: number): void {
  const t = foregroundTones(rnd, 0.6, 0.5);
  const body = t.body[0] as number;
  const top = -120;
  const pts: number[] = [0, top, dir * span, top];
  // The lower edge, from the far end back to the origin: deep at the origin, thinning out, torn all along.
  let x = span;
  while (x > 0) {
    const k = x / span;
    const base = drop * (0.3 + 0.45 * (1 - k) ** 1.3);
    const w = 10 + rnd() * 26;
    const tip =
      rnd() < 0.45 ? base + drop * (0.15 + 0.5 * rnd()) * (1 - 0.6 * k) : base * (0.85 + 0.2 * rnd());
    pts.push(dir * x, base * (0.9 + 0.1 * rnd()), dir * (x - w * 0.5), tip);
    x -= w;
  }
  pts.push(0, drop * 0.8, -dir * 30, top);
  litPoly(g, pts, body, t.rim, t.rimAlpha, t.rimShift);
  // Grain across the slab: long thin lighter lines along it (the bark's own fibre).
  for (let i = 0; i < 5; i++) {
    const y = drop * (0.05 + 0.3 * rnd());
    const x0 = span * rnd() * 0.3;
    const x1 = x0 + span * (0.3 + 0.5 * rnd());
    g.poly([dir * x0, y, dir * x1, y + 4 + 6 * rnd(), dir * x1, y + 7 + 6 * rnd(), dir * x0, y + 3]).fill({
      color: t.body[3] as number,
    });
  }
  // A few loose fibres hanging past the splinters.
  for (let i = 0; i < 4; i++) {
    const fx = dir * span * (0.1 + 0.6 * rnd());
    const fy = drop * (0.35 + 0.2 * rnd());
    const len = drop * (0.3 + 0.5 * rnd());
    const sw = 3 + rnd() * 4;
    const bend = (rnd() - 0.5) * 40;
    g.poly([fx - sw, fy, fx + sw, fy, fx + bend + 1, fy + len, fx + bend - 1, fy + len]).fill({
      color: body,
    });
  }
}

/**
 * Splintered wood standing in a bottom corner: a heap of punk and three to six broken shards leaning out of it, the
 * longest about `size` px. Origin on the frame's bottom edge.
 */
export function splinters(g: Graphics, rnd: Rnd, size: number, dir: number): void {
  const t = foregroundTones(rnd, 0.6, 0.5);
  const body = t.body[0] as number;
  const n = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const bx = (rnd() - 0.5) * size * 0.9;
    const a = -Math.PI / 2 + dir * (0.15 + 0.6 * rnd()) * (rnd() < 0.25 ? -1 : 1);
    const len = size * (0.4 + 0.6 * rnd()) * (i ? 0.8 : 1);
    const w = size * (0.08 + 0.08 * rnd());
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // A shard: wide at its foot, broken off in a jag at its end.
    const nx = -sa;
    const ny = ca;
    const jag = 0.7 + 0.2 * rnd();
    const pts = [
      bx - nx * w,
      40 - ny * w,
      bx + ca * len * jag - nx * w * 0.35,
      40 + sa * len * jag - ny * w * 0.35,
      bx + ca * len,
      40 + sa * len,
      bx + ca * len * (jag + 0.08) + nx * w * 0.2,
      40 + sa * len * (jag + 0.08) + ny * w * 0.2,
      bx + ca * len * 0.8 + nx * w * 0.45,
      40 + sa * len * 0.8 + ny * w * 0.45,
      bx + nx * w,
      40 + ny * w,
    ];
    litPoly(g, pts, body, t.rim, t.rimAlpha, t.rimShift);
  }
  // The heap they stand in.
  const heap: number[] = [];
  const hw = size * 0.75;
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const lump = 0.8 + 0.35 * rnd();
    heap.push(-hw + 2 * hw * k, 60 - size * 0.22 * Math.sin(Math.PI * k) ** 0.7 * lump);
  }
  heap.push(hw, 80, -hw, 80);
  litPoly(g, heap, body, t.rim, t.rimAlpha * 0.7, t.rimShift);
}
