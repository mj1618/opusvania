/**
 * A lumen pod: a closed seed-pod that holds light, the first thing the slash can break
 * (src/sim/pods.ts decides when). A plump lantern with a pointed tip: two crescent bracts in front,
 * a darker panel between them (two back bracts) with warm light glowing softly down its seam, and a
 * small calyx where it joins its stalk. A `sit` pod stands on a short stalk in a rosette, clear of
 * the grass; a `hang` pod dangles from a stem and swings. Struck, the crescents spring back like an
 * opened seed case and stay so, darker, round an empty cup with an ember that dies.
 *
 * Drawn once with Graphics; per frame only rotations, a scale and one alpha change, and nothing at
 * all is touched while a pod is at rest except its sway.
 */
import { Container, Graphics } from 'pixi.js';
import type { Pod, Scene } from '../../sim/scene';
import { zoneWeights } from '../scene/lib/fx-zones';
import { TONES, tone } from './holder';

export const POD = {
  /** Half-height of the husk, px (the sim's box is 44). */
  size: 22,
  /** A sitting pod stands on a stalk this tall, so the grass fringe does not hide it. */
  stalk: 14,
  /** Seam light: resting opacity, how far it breathes and how fast (rad/s). */
  seam: 0.7,
  breathe: 0.28,
  breatheRate: 1.15,
  /** Motes that drift up from the tip: per second, per pod. */
  motes: 0.3,
  /** Seconds the ember inside a spent pod takes to die. */
  ember: 2.6,
  /** Springs: [stiffness, damping] of the swing (hang, sit), the bracts and the squash. */
  swingHang: [30, 1.9],
  swingSit: [150, 8],
  open: [120, 8.5],
  squash: [260, 13],
  /** What a hit throws into them: swing (rad/s), squash. */
  kickHang: 6.5,
  kickSit: 3.2,
  kickSquash: 5,
  /** Sway in the wind, radians per unit of wind(). */
  sway: 0.09,
};

/**
 * Husk colours per zone [cool glade, light well, violet stand]: a step lighter than the plants
 * behind (in the plain leaf tones the husk vanished), `rim` for the edge the key light catches.
 */
const HUSK = {
  front: [0x1f5c60, 0x55632a, 0x2a3f6c],
  panel: [0x0e3a41, 0x2c3816, 0x17254a],
  rim: [0x74c4b6, 0xbdb862, 0x7890c6],
  calyx: [0x2d7a6c, 0x6f7a2e, 0x3a5a8a],
} as const;

interface Bract {
  g: Graphics;
  closed: number;
  open: number;
  side: number;
}

/** Where a hanging pod's stem is fixed: the nearest underside or branch above its top. */
function attachAbove(scene: Scene, x: number, top: number): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const r of scene.solids)
    if (x >= r.x && x <= r.x + r.w && r.y + r.h <= top) best = Math.max(best, r.y + r.h);
  for (const r of scene.oneWays) if (x >= r.x && x <= r.x + r.w && r.y <= top) best = Math.max(best, r.y);
  return Number.isFinite(best) ? best : top;
}

export class PodView {
  readonly root = new Container();
  /** Centre of the husk in world px this frame (it moves with the swing), and its tip. */
  cx: number;
  cy: number;
  tipX = 0;
  tipY = 0;
  /** 0 closed .. 1 open (overshoots). */
  openness = 0;
  /** Light left inside: 1 closed, falling to 0 once spent. */
  glow = 1;
  spent = false;
  private readonly bracts: Bract[] = [];
  private readonly light = new Graphics();
  private readonly husk = new Container();
  private readonly dir: 1 | -1;
  /** Distance from the pivot (the surface or the stem's fixing) to the husk's centre. */
  private readonly arm: number;
  private readonly seed: number;
  private openV = 0;
  private swing = 0;
  private swingV = 0;
  private squash = 0;
  private squashV = 0;
  private lean = 0;
  /** Bracts and ember have settled: nothing but the sway needs touching. */
  private settled = false;

  constructor(
    readonly pod: Pod,
    scene: Scene,
    seed: number,
  ) {
    this.seed = seed;
    const S = POD.size;
    const hang = pod.mount === 'hang';
    this.dir = hang ? -1 : 1;
    const w = zoneWeights(pod.x);
    const STEM = tone(TONES.stem, w);
    const LIT = tone(TONES.lit, w);
    const DARK = tone(TONES.back, w);
    const LEAF = tone(TONES.leaf, w);
    const FRONT = tone(HUSK.front, w);
    const PANEL = tone(HUSK.panel, w);
    const RIM = tone(HUSK.rim, w);
    const CALYX = tone(HUSK.calyx, w);
    const lean = seed > 0.5 ? 1 : -1;

    // Pivot: the surface under a sitting pod, the fixing of a hanging one. Local "up" (-y) points
    // away from it, so a hanging pod is the same drawing turned over. `stemLen` = pivot to husk base.
    const pivot = hang ? attachAbove(scene, pod.x, pod.y - S) : pod.y + S;
    const stemLen = hang ? Math.max(0, pod.y - S - pivot) : POD.stalk;
    this.arm = S + stemLen;
    this.root.position.set(pod.x, pivot);
    this.root.scale.y = this.dir;
    this.cx = pod.x;
    this.cy = pod.y;

    const base = new Graphics();
    // The stalk: sturdy and a little bowed.
    const bow = lean * Math.min(6, stemLen * 0.3);
    const sw = hang ? 1.5 : 2.6;
    base
      .moveTo(-sw, 3)
      .quadraticCurveTo(bow - sw * 0.8, -stemLen * 0.5, -sw * 0.7, -stemLen - 2)
      .lineTo(sw * 0.7, -stemLen - 2)
      .quadraticCurveTo(bow + sw * 0.8, -stemLen * 0.5, sw, 3)
      .fill({ color: STEM });
    if (hang) {
      for (const side of [-1, 1]) {
        const len = side === lean ? 17 : 12;
        base
          .moveTo(0, 2)
          .bezierCurveTo(side * len * 0.4, -len * 0.5, side * len * 0.9, -len * 0.25, side * len, len * 0.25)
          .bezierCurveTo(side * len * 0.6, len * 0.3, side * len * 0.25, len * 0.2, 0, 2)
          .fill({ color: side === lean ? LEAF : DARK });
      }
    } else {
      // A rosette: leaves that rise a little before they fall outward, so they top the grass.
      for (const [a, len] of [
        [-1.3, 30],
        [-0.72, 24],
        [0.78, 26],
        [1.34, 32],
      ] as const) {
        const tx = Math.sin(a) * len;
        const ty = -Math.cos(a) * len * 0.75 - 6;
        base
          .moveTo(-3.5, 2)
          .quadraticCurveTo(Math.sin(a - 0.4) * len * 0.55, ty - 9, tx, ty)
          .quadraticCurveTo(Math.sin(a + 0.4) * len * 0.6, ty * 0.3 + 2, 3.5, 2)
          .fill({ color: Math.abs(a) > 1 ? DARK : LEAF });
        base
          .moveTo(0, 1)
          .quadraticCurveTo(tx * 0.5, ty * 0.8 - 3, tx * 0.94, ty)
          .stroke({ color: LIT, width: 0.7, alpha: 0.3 });
      }
    }
    this.root.addChild(base);

    // The husk: origin at its base (where it joins the stalk), pointed tip 2S and a little away.
    this.husk.position.set(0, -stemLen);
    const H = S * 2;
    const tipY = -H - 5;
    /** The lantern's outline on one side, base to tip. */
    const outline = (g: Graphics, side: number, wide: number): Graphics =>
      g.bezierCurveTo(side * wide * 1.15, -H * 0.02, side * wide * 1.02, -H * 0.62, 0, tipY);
    const bract = (side: number, front: boolean, closed: number, open: number): void => {
      const g = new Graphics();
      if (front) {
        // A crescent: the outer wall of the lantern, about a third of its width. Rotated open it
        // reads as a curled-back valve of a seed case.
        const wide = 21;
        outline(g.moveTo(0, 1), side, wide)
          .bezierCurveTo(side * wide * 0.5, -H * 0.66, side * wide * 0.56, -H * 0.2, 0, 1)
          .fill({ color: FRONT });
        // Its inner face, lit by what it holds.
        g.moveTo(side * 2, -H * 0.06)
          .bezierCurveTo(side * wide * 0.5, -H * 0.24, side * wide * 0.46, -H * 0.64, side * 1.2, tipY + 4)
          .stroke({ color: 0xffb060, width: 1.6, alpha: 0.3 });
        // A rib, and the rim the key light catches (upper right in the world).
        g.moveTo(side * 3, -1)
          .bezierCurveTo(side * wide * 0.86, -H * 0.1, side * wide * 0.78, -H * 0.6, side * 1, tipY + 3)
          .stroke({ color: PANEL, width: 0.9, alpha: 0.5 });
        const key = side > 0;
        g.moveTo(side * wide * 0.99, -H * 0.3)
          .bezierCurveTo(side * wide * 1.0, -H * 0.56, side * wide * 0.52, -H * 0.86, 0, tipY)
          .stroke({ color: RIM, width: 1.3, alpha: key ? 0.9 : 0.35 });
      } else {
        // The panel between the crescents: half the lantern each, darker.
        const wide = 17;
        outline(g.moveTo(0, 1), side, wide).lineTo(0, 1).fill({ color: PANEL });
        if (side < 0) {
          // The empty cup, seen once the case has opened.
          g.ellipse(0, -5, 7.5, 5).fill({ color: DARK });
          g.ellipse(0, -4, 5, 3).fill({ color: 0x05100f, alpha: 0.7 });
          // A curled tendril at the tip.
          g.moveTo(0, tipY + 1)
            .bezierCurveTo(lean * 1, tipY - 6, lean * 8, tipY - 8, lean * 6.5, tipY - 2)
            .stroke({ color: STEM, width: 1.1 });
        }
      }
      g.rotation = closed;
      this.husk.addChild(g);
      this.bracts.push({ g, closed, open, side });
    };
    bract(-1, false, 0, 0.36);
    bract(1, false, 0, -0.36);
    // The light inside: soft, three nested lenses down the seam of the panel.
    for (const [wd, a, col] of [
      [8.5, 0.16, 0xff9a3a],
      [4.6, 0.34, 0xffb050],
      [1.5, 0.8, 0xffe0a6],
    ] as const)
      this.light
        .moveTo(0, -H * 0.1)
        .bezierCurveTo(wd, -H * 0.34, wd * 0.8, -H * 0.72, 0, -H * 0.95)
        .bezierCurveTo(-wd * 0.8, -H * 0.72, -wd, -H * 0.34, 0, -H * 0.1)
        .fill({ color: col, alpha: a });
    this.husk.addChild(this.light);
    bract(-1, true, 0, 0.98);
    bract(1, true, 0, -0.98);
    // The calyx: three short pointed sepals clasping the base.
    const calyx = new Graphics();
    for (const [a, len] of [
      [-0.95, 12],
      [0, 9],
      [0.95, 12],
    ] as const) {
      const tx = Math.sin(a) * len;
      const ty = -Math.cos(a) * len - 1;
      calyx
        .moveTo(-3.6, 2)
        .quadraticCurveTo(tx - 3.5 * Math.cos(a), ty * 0.5, tx, ty)
        .quadraticCurveTo(tx + 3.5 * Math.cos(a), ty * 0.5, 3.6, 2)
        .fill({ color: a === 0 ? CALYX : LEAF });
    }
    calyx.ellipse(0, 1.5, 4.4, 2.6).fill({ color: STEM });
    this.husk.addChild(calyx);
    this.root.addChild(this.husk);
    this.pose(0);
    this.place();
  }

  /** A slash opened it: `sx`, `sy` = the direction of the blow (unit-ish). */
  strike(sx: number, sy: number): void {
    this.spent = true;
    this.settled = false;
    this.openV += 9;
    const hang = this.dir < 0;
    // Sideways blows swing it; vertical ones squash it and tip it a little to its own side.
    const side = Math.abs(sx) > 0.3 ? Math.sign(sx) : (this.seed > 0.5 ? 1 : -1) * 0.35;
    // Positive swing carries the husk toward +x, hanging or sitting.
    this.swingV += side * (hang ? POD.kickHang : POD.kickSit);
    this.squashV -= POD.kickSquash * (Math.abs(sy) > 0.3 ? 1.4 : 1);
    this.lean = side;
  }

  /** Something brushed past (the hero walking through): a small nudge. */
  nudge(v: number): void {
    this.swingV += v;
  }

  /** Snap to closed (restart) or spent (already burst). */
  set(spent: boolean): void {
    this.spent = spent;
    this.openness = spent ? 1 : 0;
    this.glow = spent ? 0 : 1;
    this.openV = 0;
    this.swing = 0;
    this.swingV = 0;
    this.squash = 0;
    this.squashV = 0;
    this.settled = false;
  }

  /** `sway` = wind lean in radians. `clock` drives the breathing. */
  update(dt: number, clock: number, sway: number): void {
    const hang = this.dir < 0;
    const [ks, cs] = hang ? POD.swingHang : POD.swingSit;
    const rest = sway * (hang ? 1 : 0.35);
    this.swingV += ((rest - this.swing) * (ks as number) - this.swingV * (cs as number)) * dt;
    this.swing += this.swingV * dt;
    if (!this.settled) {
      const target = this.spent ? 1 : 0;
      this.openV +=
        ((target - this.openness) * (POD.open[0] as number) - this.openV * (POD.open[1] as number)) * dt;
      this.openness += this.openV * dt;
      this.squashV +=
        (-this.squash * (POD.squash[0] as number) - this.squashV * (POD.squash[1] as number)) * dt;
      this.squash += this.squashV * dt;
      this.glow = this.spent ? Math.max(0, this.glow - dt / POD.ember) : Math.min(1, this.glow + dt * 2);
      this.pose(clock);
      this.settled =
        Math.abs(this.openness - target) < 0.002 &&
        Math.abs(this.openV) < 0.01 &&
        Math.abs(this.squash) < 0.002 &&
        Math.abs(this.squashV) < 0.01 &&
        this.glow === (this.spent ? 0 : 1);
    } else if (!this.spent) {
      // Shut and at rest: only the seam breathes.
      this.light.alpha = POD.seam * (1 + POD.breathe * Math.sin(clock * POD.breatheRate + this.seed * 6.283));
    }
    this.root.rotation = this.swing * this.dir;
    this.place();
  }

  /** Bracts, tints, the light and the squash from the current spring values. */
  private pose(clock: number): void {
    const o = this.openness;
    const dull = Math.round(255 - 120 * Math.min(1, Math.max(0, o)) * (1 - this.glow * 0.6));
    const tint = (dull << 16) | (dull << 8) | dull;
    for (const b of this.bracts) {
      // The side the blow went toward opens a little further.
      const bias = this.spent ? 1 + 0.2 * Math.sign(b.side) * this.lean : 1;
      b.g.rotation = b.closed + (b.open - b.closed) * o * bias;
      b.g.tint = tint;
    }
    // Shut: the seam, breathing. Open: an ember low in the cup that dies.
    const ember = this.glow * this.glow;
    if (this.spent) {
      this.light.alpha = ember * 0.75;
      this.light.scale.set(0.7 + 0.9 * ember, 0.22 + 0.25 * ember);
    } else {
      this.light.alpha = POD.seam * (1 + POD.breathe * Math.sin(clock * POD.breatheRate + this.seed * 6.283));
      this.light.scale.set(1, 1);
    }
    this.husk.scale.set(1 - this.squash * 0.1, 1 + this.squash * 0.14);
  }

  /** Where the husk's centre and tip are in the world, from the swing. */
  private place(): void {
    const r = this.root.rotation;
    const sn = Math.sin(r) * this.dir;
    const cs = Math.cos(r) * this.dir;
    this.cx = this.root.x + this.arm * sn;
    this.cy = this.root.y - this.arm * cs;
    const tip = this.arm + POD.size + 5;
    this.tipX = this.root.x + tip * sn;
    this.tipY = this.root.y - tip * cs;
  }
}
