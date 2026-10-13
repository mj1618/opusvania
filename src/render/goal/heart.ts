/**
 * The heart of the grove, at the shrine in front of the hollow tree: a great bud of woven roots on
 * a low mound, shut and dark while it sleeps. Three small wicks stand round it, each a little
 * lantern of the same family as the three in the forest: one lights for each lantern she kindles
 * (left, the tall one, right = the stone, the crown, the far ledge), so progress can be read here.
 * Awake, the bud's straps part and its light shows; at the ending it stands fully open.
 *
 * Two containers: `back` (mound, wicks, rear straps) and `front` (the straps that close over the
 * light); the goal renderer draws the heart's own light between them, so a shut bud leaks it only
 * through its seams. Drawn once with Graphics; per frame only rotations and a few alphas.
 */
import { Container, Graphics } from 'pixi.js';
import { tone } from '../pickups/holder';
import { zoneWeights } from '../scene/lib/fx-zones';
import { GOAL } from './config';
import { CORE, leaf, line, makeGlass, ribbon, WOOD_TONES } from './lantern';
import { bezier, Path } from './logic';

interface Strap {
  g: Container;
  closed: number;
  open: number;
  /** How late it follows the opening (0 first .. 1 last). */
  lag: number;
}

export interface Wick {
  /** Where its light sits (world px, at rest). */
  x: number;
  y: number;
  lit: Graphics;
  /** 0 cold .. 1 lit. */
  warmth: number;
}

const STRAP = [0x143039, 0x222a14, 0x1b1e4a] as const;
const STRAP_FLANK = [0x0f262d, 0x1a200f, 0x14163a] as const;
const STRAP_BACK = [0x0a181e, 0x12160c, 0x0b0c26] as const;
const STRAP_RIM = [0x5a9aa0, 0x9c9a58, 0x9a8ce0] as const;
/** The inside of a strap, which the light catches once the bud stands open. */
const INNER = 0x8a4a1c;

/** Scale of a wick's glass against a lantern's. */
const WICK = 0.6;
/** Size of the bud against its first drawing (a 92 px bud stood as tall as she does). */
const BUD = 0.8;

export class HeartView {
  readonly back = new Container();
  readonly front = new Container();
  /** Where the heart's light sits (world px). */
  readonly coreX: number;
  coreY: number;
  private readonly seatY: number;
  readonly wicks: Wick[] = [];
  /** 0 shut .. 1 in full bloom (it overshoots a little on the way). */
  openness = 0;
  private openV = 0;
  private readonly straps: Strap[] = [];
  private readonly inner: Graphics[] = [];
  private readonly hollow: Graphics;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {
    const w = zoneWeights(x);
    const wood = tone(WOOD_TONES.wood, w);
    const rim = tone(WOOD_TONES.rim, w);
    const body = tone(STRAP, w);
    const bodyBack = tone(STRAP_BACK, w);
    const flank = tone(STRAP_FLANK, w);
    const edge = tone(STRAP_RIM, w);
    this.coreX = x;
    this.coreY = y - 30;
    this.seatY = y - 30;

    // --- The mound: roots running out along the ground both ways.
    const g = new Graphics();
    for (const [x1, y1, bend, w0] of [
      [-66, 3, -7, 4.2],
      [62, 4, -8, 4.4],
      [-44, 5, -2, 3.2],
      [40, 5, -3, 3.4],
      [-86, 4, -3, 2.2],
      [84, 5, -2, 2.4],
    ] as const) {
      const p = new Path();
      bezier(p, [x1 * 0.12, -10, x1 * 0.4, -12 + bend, x1 * 0.8, y1 - 7, x1, y1], 10);
      ribbon(g, p.xs, p.ys, w0, 0.8).fill({ color: wood });
      line(g, p.xs.slice(1, -2), p.ys.slice(1, -2), 0, -w0 * 0.55).stroke({
        width: 0.9,
        color: rim,
        alpha: 0.22,
        cap: 'round',
      });
    }
    g.ellipse(0, 0, 46, 10).fill({ color: wood });

    // --- Three wicks: small crooks, each with a seed of glass.
    for (const [bx, height, side, lean] of [
      [-46, 64, -1, 9],
      [17, 128, 1, 3],
      [48, 50, 1, 12],
    ] as const) {
      const p = new Path();
      const H = height;
      bezier(
        p,
        [bx, 2, bx - 3 * side, -0.4 * H, bx + (lean - 5) * side, -0.8 * H, bx + lean * side, -0.95 * H],
        12,
      );
      bezier(
        p,
        [
          bx + lean * side,
          -0.95 * H,
          bx + (lean + 2) * side,
          -1.06 * H - 2,
          bx + (lean + 10) * side,
          -1.06 * H - 3,
          bx + (lean + 11.5) * side,
          -0.95 * H - 1,
        ],
        8,
      );
      ribbon(g, p.xs, p.ys, 2.1, 0.7).fill({ color: wood });
      line(g, p.xs.slice(2, -1), p.ys.slice(2, -1), -0.9, -0.3).stroke({
        width: 0.8,
        color: rim,
        alpha: 0.3,
        cap: 'round',
      });
      const hx = p.xs[p.xs.length - 1] as number;
      const hy = (p.ys[p.ys.length - 1] as number) + 0.5;
      const glass = makeGlass(w, wood, rim);
      glass.root.scale.set(WICK);
      glass.root.position.set(hx, hy);
      this.back.addChild(glass.root);
      this.wicks.push({ x: x + hx, y: y + hy + CORE * WICK, lit: glass.lit, warmth: 0 });
    }
    this.back.addChildAt(g, 0);

    // --- The bud: straps of root that close over the light. Each is drawn standing up from its
    // foot; shut they lean together, open they fall outward.
    const strap = (
      layer: Container,
      bx: number,
      by: number,
      len: number,
      wide: number,
      hook: number,
      color: number,
      closed: number,
      open: number,
      lag: number,
      lined: boolean,
    ): void => {
      bx *= BUD;
      by *= BUD;
      len *= BUD;
      wide *= BUD;
      hook *= BUD;
      const s = new Graphics();
      // A long pointed strap, its tip hooked `hook` px to the side.
      const tipX = hook;
      const tipY = -len;
      s.moveTo(-wide * 0.42, 1)
        .bezierCurveTo(-wide * 0.95, -len * 0.3, -wide * 0.62 + hook * 0.3, -len * 0.72, tipX, tipY)
        .bezierCurveTo(wide * 0.5 + hook * 0.5, -len * 0.68, wide * 0.95, -len * 0.28, wide * 0.42, 1)
        .closePath()
        .fill({ color });
      if (lined) {
        // The edge the key light finds.
        s.moveTo(-wide * 0.44, -1)
          .bezierCurveTo(-wide * 0.95, -len * 0.3, -wide * 0.62 + hook * 0.3, -len * 0.72, tipX, tipY)
          .stroke({ width: 1, color: edge, alpha: 0.22, cap: 'round' });
      }
      // Its inner face, warm: shown as it opens.
      const inner = new Graphics();
      const sgn = open < closed ? 1 : -1;
      inner
        .moveTo(sgn * wide * 0.36, -2)
        .bezierCurveTo(
          sgn * wide * 0.8,
          -len * 0.3,
          sgn * wide * 0.5 + hook * 0.4,
          -len * 0.66,
          tipX,
          tipY + 3,
        )
        .bezierCurveTo(
          sgn * wide * 0.2 + hook * 0.5,
          -len * 0.6,
          sgn * wide * 0.34,
          -len * 0.3,
          sgn * wide * 0.08,
          -2,
        )
        .closePath()
        .fill({ color: INNER, alpha: 0.5 });
      inner.alpha = 0;
      const c = new Container();
      c.addChild(s, inner);
      this.inner.push(inner);
      c.position.set(bx, by);
      c.rotation = closed;
      layer.addChild(c);
      this.straps.push({ g: c, closed, open, lag });
    };
    // The dark of the bud's inside, so nothing shows through between the straps.
    const hollow = new Graphics();
    hollow
      .moveTo(-24, 0)
      .bezierCurveTo(-34, -30, -14, -62, 0, -84)
      .bezierCurveTo(14, -62, 34, -30, 24, 0)
      .closePath()
      .fill({ color: tone([0x06141a, 0x0c0f08, 0x0a0a1e], w) });
    hollow.scale.set(BUD);
    this.back.addChild(hollow);
    this.hollow = hollow;
    // Rear pair, tallest: they cross at the tip.
    strap(this.back, -14, -6, 92, 24, 9, bodyBack, 0.15, -0.5, 0.5, true);
    strap(this.back, 14, -6, 88, 24, -9, bodyBack, -0.17, 0.46, 0.6, true);
    // Flanks.
    strap(this.front, -27, -2, 76, 22, 12, flank, 0.35, -0.92, 0.25, true);
    strap(this.front, 27, -2, 72, 22, -12, flank, -0.38, 0.86, 0.35, true);
    // Front pair and the short one between them.
    strap(this.front, -12, 1, 64, 21, 8, body, 0.17, -1.22, 0, true);
    strap(this.front, 13, 1, 58, 21, -8, body, -0.22, 1.3, 0.1, true);
    strap(this.front, 0, 2, 36, 18, 0, body, 0, 0.0, 0, true);
    // A few small leaves in the mound.
    const lf = new Graphics();
    for (const [lx, a, len] of [
      [-52, -2.1, 9],
      [-58, -1.2, 7],
      [50, -1.0, 9],
      [57, -1.9, 7],
    ] as const)
      leaf(lf, lx, 2, a, len, 2.6).fill({ color: tone([0x0f4044, 0x44521c, 0x1a2c52], w) });
    this.front.addChild(lf);
    this.back.position.set(x, y);
    this.front.position.set(x, y);
  }

  /** `target` = how open it should stand; `now` = no spring (a state jump). */
  update(dt: number, clock: number, target: number, now: boolean, lift = 0): void {
    // In full bloom the light leaves the bud and stands over it.
    this.coreY = this.seatY - lift;
    const [k, c] = GOAL.heart.open as [number, number];
    if (now) {
      this.openness = target;
      this.openV = 0;
    } else {
      const step = Math.min(dt, 1 / 30);
      this.openV += (k * (target - this.openness) - c * this.openV) * step;
      this.openness += this.openV * step;
    }
    const o = this.openness;
    for (let i = 0; i < this.straps.length; i++) {
      const s = this.straps[i] as Strap;
      // Later straps wait, then catch up.
      const a = Math.max(0, Math.min(1.15, (o - s.lag * 0.22) / (1 - s.lag * 0.22)));
      const breathe = Math.sin(clock * 0.9 + i * 1.7) * 0.012 * (1 + 2 * o);
      s.g.rotation = s.closed + (s.open - s.closed) * a + breathe;
      const inner = this.inner[i] as Graphics;
      inner.alpha = Math.min(1, a * 1.3);
      inner.visible = a > 0.01;
    }
    // Open, the hollow is full of light: its dark gives way.
    this.hollow.alpha = 1 - 0.6 * Math.min(1, o * 1.6);
    for (const wk of this.wicks) {
      wk.lit.alpha = wk.warmth;
      wk.lit.visible = wk.warmth > 0.004;
    }
  }
}
