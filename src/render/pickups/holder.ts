/**
 * The bud that cradles a great glint: a slender stem with two leaves and a calyx of five sepals,
 * two behind the light and three in front, so the light sits inside it. It grows from the surface
 * under the glint, or hangs from the one above. When the glint is taken the sepals fall open and
 * the flower stays that way.
 *
 * Drawn once with Graphics in the foliage family (dark, with a warm edge where the light inside
 * catches it); only rotations change per frame.
 */
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../../sim/scene';
import { zoneWeights } from '../scene/lib/fx-zones';

const SEPAL_EDGE = 0xffc271;

/**
 * Bud colours per zone [cool glade, light well, violet stand], picked off the neighbouring plants
 * in `npm run shots` (the post grade then treats bud and plants alike). Kept on the dark side: the
 * bud is in no light mask, so nothing dims it next to the hero's light.
 */
export const TONES = {
  stem: [0x0b2f33, 0x2a3312, 0x10283a],
  lit: [0x3f8f86, 0x9a9a40, 0x4a7f9a],
  back: [0x08262b, 0x1e2a10, 0x0c2032],
  front: [0x0e3a3e, 0x3a4a18, 0x143448],
  leaf: [0x0f4044, 0x44521c, 0x163a4e],
} as const;

export function tone(c: readonly [number, number, number], w: readonly [number, number, number]): number {
  let out = 0;
  for (let k = 0; k < 3; k++) {
    const sh = 16 - k * 8;
    const v = ((c[0] >> sh) & 255) * w[0] + ((c[1] >> sh) & 255) * w[1] + ((c[2] >> sh) & 255) * w[2];
    out |= Math.round(v) << sh;
  }
  return out;
}

/** Where a bud is rooted: `dir` 1 = it grows up from a top, -1 = it hangs from an underside. */
export interface Root {
  x: number;
  y: number;
  dir: 1 | -1;
}

/** The nearest surface a bud at (x, y) could be attached to within `reach` px, or null. */
export function findRoot(scene: Scene, x: number, y: number, reach = 170): Root | null {
  let below = Number.POSITIVE_INFINITY;
  let above = Number.NEGATIVE_INFINITY;
  for (const r of scene.solids) {
    if (x < r.x + 6 || x > r.x + r.w - 6) continue;
    if (r.y >= y) below = Math.min(below, r.y);
    if (r.y + r.h <= y) above = Math.max(above, r.y + r.h);
  }
  for (const r of scene.oneWays) {
    if (x < r.x + 6 || x > r.x + r.w - 6) continue;
    if (r.y >= y) below = Math.min(below, r.y);
  }
  if (below - y <= reach) return { x, y: below, dir: 1 };
  // Hanging: the island's painted underside sags below its collision box, so root a little lower.
  if (y - above <= reach) return { x, y: above + HANG_SAG, dir: -1 };
  return null;
}

/** How far below a collision underside a hanging bud is rooted (inside the painted taper). */
const HANG_SAG = 26;

/** The first top at or below (x, y) within `reach` px, or null: where light would land. */
export function groundBelow(scene: Scene, x: number, y: number, reach = 420): number | null {
  let below = Number.POSITIVE_INFINITY;
  for (const r of scene.solids) if (x >= r.x && x <= r.x + r.w && r.y >= y) below = Math.min(below, r.y);
  for (const r of scene.oneWays) if (x >= r.x && x <= r.x + r.w && r.y >= y) below = Math.min(below, r.y);
  return below - y <= reach ? below : null;
}

interface Sepal {
  g: Graphics;
  /** Front sepals have a twin behind the hero that takes over once the bud has opened. */
  twin: Graphics | null;
  closed: number;
  open: number;
}

export class Holder {
  /** Behind the hero and the light: stem, leaves, back sepals, and the front ones once open. */
  readonly back = new Container();
  /** In front of the light while it is cupped: the three front sepals. Fades out as they open. */
  readonly front = new Container();
  /** Opened sepals behind the hero (twins of the front ones). */
  private readonly opened = new Container();
  /** The light's seat in world px this frame (follows the sway). */
  seatX = 0;
  seatY = 0;
  private readonly sepals: Sepal[] = [];
  private readonly height: number;
  private readonly lean: number;
  /** Open amount: a spring from 0 (cupped) to 1 (fallen open). */
  private openness = 0;
  /** The light's offset from the root along the stem at rest (negative = up). */
  private readonly seat: number;
  private vel = 0;

  constructor(
    private readonly root: Root,
    lightX: number,
    lightY: number,
    seat: number,
    seed: number,
  ) {
    // The bud's base sits `seat` px under the light (toward the root).
    this.height = Math.max(24, Math.abs(root.y - lightY) - seat);
    this.lean = seed > 0.5 ? 1 : -1;
    const H = this.height;
    const lean = this.lean;
    const w = zoneWeights(lightX);
    const STEM = tone(TONES.stem, w);
    const STEM_LIT = tone(TONES.lit, w);
    const SEPAL_BACK = tone(TONES.back, w);
    const SEPAL_FRONT = tone(TONES.front, w);
    const LEAF = tone(TONES.leaf, w);
    for (const c of [this.back, this.front]) {
      c.position.set(lightX, root.y);
      c.scale.y = root.dir;
    }

    // Stem: local coords, base at (foot, 0), bud base at (0, -H), bowed to one side. The root is a
    // little off to the side so the stem arrives with a curve.
    const foot = lean * Math.min(16, H * 0.22);
    const bow = -lean * Math.min(13, H * 0.2);
    const stem = new Graphics();
    const N = 14;
    const lx: number[] = [];
    const ly: number[] = [];
    const rx: number[] = [];
    const ry: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const x = u * u * foot + 2 * u * t * (bow + foot * 0.5) + t * t * 0;
      const y = -H * (u * u * 0 + 2 * u * t * 0.52 + t * t);
      const dx = 2 * u * (bow + foot * 0.5 - foot) + 2 * t * (0 - (bow + foot * 0.5));
      const dy = -H * (2 * u * 0.52 + 2 * t * (1 - 0.52));
      const l = Math.hypot(dx, dy) || 1;
      const w = 2.3 - 1.1 * t;
      lx.push(x - (dy / l) * w);
      ly.push(y + (dx / l) * w);
      rx.push(x + (dy / l) * w);
      ry.push(y - (dx / l) * w);
    }
    stem.moveTo(lx[0] as number, (ly[0] as number) + 6);
    for (let i = 0; i <= N; i++) stem.lineTo(lx[i] as number, ly[i] as number);
    for (let i = N; i >= 0; i--) stem.lineTo(rx[i] as number, ry[i] as number);
    stem.lineTo(rx[0] as number, (ry[0] as number) + 6);
    stem.closePath().fill({ color: STEM });
    // Lit by the glint from above: a warm-green edge along the upper half.
    stem.moveTo(rx[Math.floor(N * 0.45)] as number, ry[Math.floor(N * 0.45)] as number);
    for (let i = Math.floor(N * 0.45) + 1; i <= N; i++) stem.lineTo(rx[i] as number, ry[i] as number);
    stem.stroke({ color: STEM_LIT, width: 1.1, alpha: 0.55 });
    // Two small leaves on the stem.
    for (const [t, side, len] of [
      [0.34, -lean, Math.min(20, H * 0.4)],
      [0.58, lean, Math.min(15, H * 0.3)],
    ] as const) {
      const i = Math.round(t * N);
      const bx = ((lx[i] as number) + (rx[i] as number)) / 2;
      const by = ((ly[i] as number) + (ry[i] as number)) / 2;
      const tx = bx + side * len;
      const ty = by - len * 0.5;
      stem
        .moveTo(bx, by)
        .bezierCurveTo(bx + side * len * 0.3, by - len * 0.75, tx - side * len * 0.2, ty - len * 0.2, tx, ty)
        .bezierCurveTo(tx - side * len * 0.3, ty + len * 0.45, bx + side * len * 0.4, by + len * 0.2, bx, by)
        .fill({ color: LEAF });
      stem
        .moveTo(bx, by)
        .quadraticCurveTo(bx + side * len * 0.5, by - len * 0.45, tx, ty)
        .stroke({ color: STEM_LIT, width: 0.8, alpha: 0.4 });
    }
    // Where it is rooted: a tuft of small dark leaves, so the stem comes out of something.
    for (const [a, len] of [
      [-1.25, 15],
      [-0.5, 19],
      [0.35, 17],
      [1.2, 14],
    ] as const) {
      const tx = foot + Math.sin(a) * len;
      const ty = -Math.cos(a) * len * 0.8;
      stem
        .moveTo(foot - 3, 4)
        .quadraticCurveTo(foot + Math.sin(a - 0.5) * len * 0.6, ty * 0.6, tx, ty)
        .quadraticCurveTo(foot + Math.sin(a + 0.5) * len * 0.6, ty * 0.5, foot + 3, 4)
        .fill({ color: a * lean > 0 ? LEAF : SEPAL_BACK });
    }
    this.back.addChild(stem, this.opened);

    // Sepals: tip up at rotation 0, pivot at the bud's base.
    const draw = (len: number, wid: number, front: boolean, curl: number): Graphics => {
      const g = new Graphics();
      g.moveTo(0, 2)
        .bezierCurveTo(-wid, -len * 0.18, -wid * 0.95 + curl, -len * 0.7, curl * 1.6, -len)
        .bezierCurveTo(wid * 0.75 + curl, -len * 0.66, wid, -len * 0.2, 0, 2)
        .fill({ color: front ? SEPAL_FRONT : SEPAL_BACK });
      // The edge that faces the light catches it.
      const sgn = Math.sign(curl) || 1;
      g.moveTo(sgn * wid * 0.55, -len * 0.16)
        .bezierCurveTo(sgn * wid * 0.95, -len * 0.4, sgn * wid * 0.6 + curl, -len * 0.74, curl * 1.6, -len)
        .stroke({ color: SEPAL_EDGE, width: front ? 1.1 : 0.8, alpha: front ? 0.6 : 0.3 });
      if (front)
        g.moveTo(0, 0)
          .quadraticCurveTo(curl * 0.4, -len * 0.5, curl * 1.4, -len * 0.92)
          .stroke({ color: SEPAL_BACK, width: 0.9, alpha: 0.6 });
      g.position.set(0, -H);
      return g;
    };
    const mk = (
      len: number,
      wid: number,
      front: boolean,
      closed: number,
      open: number,
      curl: number,
    ): void => {
      const g = draw(len, wid, front, curl);
      g.rotation = closed;
      (front ? this.front : this.back).addChild(g);
      let twin: Graphics | null = null;
      if (front) {
        twin = draw(len, wid, true, curl);
        this.opened.addChild(twin);
      }
      this.sepals.push({ g, twin, closed, open });
    };
    mk(31, 7.5, false, -0.3, -1.0, 4.5);
    mk(30, 7.5, false, 0.34, 1.08, -4.5);
    mk(26, 7, true, -0.78, -1.7, 6);
    mk(25, 7, true, 0.8, 1.76, -6);
    mk(15, 6.5, true, 0.04 * lean, 2.6 * lean, 0);
    // The cup the sepals spring from.
    const cup = new Graphics();
    cup.ellipse(0, -H + 1, 5.6, 3.6).fill({ color: SEPAL_FRONT });
    cup.ellipse(0, -H + 2.2, 4.2, 2.2).fill({ color: SEPAL_BACK, alpha: 0.7 });
    this.opened.addChild(cup);
    const cupFront = new Graphics();
    cupFront.ellipse(0, -H + 1, 5.6, 3.6).fill({ color: SEPAL_FRONT });
    this.front.addChild(cupFront);
    this.opened.alpha = 0;
    this.seat = lightY - root.y;
    this.update(0, 0, false);
  }

  /** 1 = grows up from a top, -1 = hangs from an underside. */
  get dir(): 1 | -1 {
    return this.root.dir;
  }

  /** `sway` leans the bud (radians), `open` is whether the glint has left. */
  update(dt: number, sway: number, open: boolean): void {
    const seat = this.seat;
    // A soft spring so the sepals overshoot and settle.
    const target = open ? 1 : 0;
    const k = 90;
    const c = 7.5;
    this.vel += ((target - this.openness) * k - this.vel * c) * dt;
    this.openness += this.vel * dt;
    const o = this.openness;
    for (const s of this.sepals) {
      s.g.rotation = s.closed + (s.open - s.closed) * o + sway * 0.6;
      if (s.twin) s.twin.rotation = s.g.rotation;
    }
    // Once they have fallen open they belong behind her, not across her legs.
    const t = Math.min(1, Math.max(0, (o - 0.2) / 0.4));
    this.opened.alpha = t;
    this.front.alpha = 1 - t;
    const rot = sway * this.root.dir;
    this.back.rotation = rot;
    this.front.rotation = rot;
    // The seat rotates with the stem about the root.
    const sn = Math.sin(rot);
    const cs = Math.cos(rot);
    this.seatX = this.back.x - seat * sn;
    this.seatY = this.root.y + seat * cs;
  }

  /** Snap to cupped (restart) or open (already taken). */
  set(open: boolean): void {
    this.openness = open ? 1 : 0;
    this.vel = 0;
    this.opened.alpha = this.openness;
    this.front.alpha = 1 - this.openness;
  }
}
