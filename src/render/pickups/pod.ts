/**
 * A lumen pod: a closed seed-pod that holds light, the first thing the slash can break
 * (src/sim/pods.ts decides when). A plump husk of four bracts, two behind and two in front, with a
 * lens of warm light showing down the seam between them; a `sit` pod rests in a rosette of leaves,
 * a `hang` pod dangles from a short stem and swings. Struck, the bracts spring open and stay open,
 * darker, with an ember inside that dies over a few seconds.
 *
 * Drawn once with Graphics in the zone's plant colours (the great-glint bud's tones); per frame
 * only rotations, a scale and two alphas change.
 */
import { Container, Graphics } from 'pixi.js';
import type { Pod, Scene } from '../../sim/scene';
import { zoneWeights } from '../scene/lib/fx-zones';
import { TONES, tone } from './holder';

export const POD = {
  /** Half-height of the husk, px (the sim's box is 44). */
  size: 22,
  /** Seam light: resting brightness and how far it breathes. */
  seam: 0.8,
  breathe: 0.2,
  /** Seconds the ember inside a spent pod takes to die, and what stays. */
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

interface Bract {
  g: Graphics;
  closed: number;
  open: number;
  side: number;
}

function mixHex(a: number, b: number, t: number): number {
  let out = 0;
  for (const sh of [16, 8, 0]) out |= Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh;
  return out;
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
  /** Centre of the husk in world px this frame (it moves with the swing). */
  cx: number;
  cy: number;
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
    // The husk is a step lighter than the leaves round it, so it reads as a thing and not a gap.
    const BACK = mixHex(tone(TONES.back, w), tone(TONES.front, w), 0.7);
    const FRONT = mixHex(tone(TONES.front, w), LIT, 0.3);
    const LEAF = tone(TONES.leaf, w);
    const lean = seed > 0.5 ? 1 : -1;

    // Pivot: the surface under a sitting pod, the fixing of a hanging one. Local "up" (-y) points
    // away from it, so a hanging pod is the same drawing turned over.
    const pivot = hang ? attachAbove(scene, pod.x, pod.y - S) : pod.y + S;
    const stemLen = hang ? Math.max(0, pod.y - S - pivot) : 0;
    this.arm = S + stemLen;
    this.root.position.set(pod.x, pivot);
    this.root.scale.y = this.dir;
    this.cx = pod.x;
    this.cy = pod.y;

    const base = new Graphics();
    if (hang) {
      // A short bowed stem with two leaves at its fixing and a nub where the husk hangs.
      const bow = lean * Math.min(7, stemLen * 0.25);
      base
        .moveTo(-1.6, 3)
        .quadraticCurveTo(bow - 1.2, -stemLen * 0.5, -1.1, -stemLen - 3)
        .lineTo(1.1, -stemLen - 3)
        .quadraticCurveTo(bow + 1.2, -stemLen * 0.5, 1.6, 3)
        .fill({ color: STEM });
      for (const side of [-1, 1]) {
        const len = side === lean ? 17 : 12;
        base
          .moveTo(0, 2)
          .bezierCurveTo(side * len * 0.4, -len * 0.5, side * len * 0.9, -len * 0.25, side * len, len * 0.25)
          .bezierCurveTo(side * len * 0.6, len * 0.3, side * len * 0.25, len * 0.2, 0, 2)
          .fill({ color: side === lean ? LEAF : BACK });
      }
    } else {
      // A rosette: five leaves lying outward from under the husk.
      for (const [a, len] of [
        [-1.42, 25],
        [-0.85, 19],
        [0.9, 21],
        [1.45, 27],
        [0.1 * lean, 13],
      ] as const) {
        const tx = Math.sin(a) * len;
        const ty = -Math.cos(a) * len * 0.55 - 1;
        base
          .moveTo(-3.5, 2)
          .quadraticCurveTo(Math.sin(a - 0.45) * len * 0.6, ty - 4, tx, ty)
          .quadraticCurveTo(Math.sin(a + 0.45) * len * 0.6, ty * 0.3 + 2, 3.5, 2)
          .fill({ color: Math.abs(a) > 1 ? BACK : LEAF });
        base
          .moveTo(0, 1)
          .quadraticCurveTo(tx * 0.5, ty * 0.7 - 1, tx * 0.94, ty)
          .stroke({ color: LIT, width: 0.7, alpha: 0.28 });
      }
    }
    this.root.addChild(base);

    // The husk: origin at its base (where it joins stem or rosette), tip 2S away.
    this.husk.position.set(0, -stemLen);
    const H = S * 2;
    const bract = (side: number, front: boolean, closed: number, open: number): void => {
      const g = new Graphics();
      const out = front ? 21 : 19;
      const inner = front ? side * 2.2 : -side * 7;
      g.moveTo(0, 1)
        .bezierCurveTo(side * out * 1.05, -H * 0.05, side * out, -H * 0.66, side * 1.5, -H - 1)
        .bezierCurveTo(inner, -H * 0.7, inner, -H * 0.25, 0, 1)
        .fill({ color: front ? FRONT : BACK });
      if (front) {
        // A rib, a darker foot, and the edge the key light catches (upper right in the world).
        g.moveTo(side * 3, -2)
          .bezierCurveTo(side * out * 0.72, -H * 0.12, side * out * 0.62, -H * 0.62, side * 2.4, -H * 0.95)
          .stroke({ color: BACK, width: 1, alpha: 0.55 });
        g.moveTo(side * 5, 0)
          .quadraticCurveTo(side * out * 0.9, -H * 0.06, side * out * 0.98, -H * 0.3)
          .stroke({ color: BACK, width: 2.4, alpha: 0.4 });
        if (side * this.dir > 0 || !hang)
          g.moveTo(side * out * 0.95, -H * 0.42)
            .bezierCurveTo(side * out * 0.9, -H * 0.62, side * out * 0.5, -H * 0.86, side * 1.8, -H)
            .stroke({ color: LIT, width: 1.2, alpha: side > 0 ? 0.85 : 0.4 });
        // The inner face, lit by what it holds: it shows only as the seam while the pod is shut.
        g.moveTo(side * 1.2, -H * 0.1)
          .bezierCurveTo(side * 2.4, -H * 0.3, side * 2.4, -H * 0.7, side * 1.6, -H * 0.94)
          .stroke({ color: 0xffb760, width: 2.2, alpha: 0.42 });
      }
      g.rotation = closed;
      this.husk.addChild(g);
      this.bracts.push({ g, closed, open, side });
    };
    bract(-1, false, 0.05, 0.62);
    bract(1, false, -0.05, -0.62);
    // The light inside: a lens down the middle, between the back and the front bracts.
    this.light
      .moveTo(0, -H * 0.06)
      .bezierCurveTo(3.4, -H * 0.3, 2.8, -H * 0.72, 0, -H * 0.97)
      .bezierCurveTo(-2.8, -H * 0.72, -3.4, -H * 0.3, 0, -H * 0.06)
      .fill({ color: 0xffa94a });
    this.light
      .moveTo(0, -H * 0.16)
      .bezierCurveTo(1.2, -H * 0.36, 1, -H * 0.66, 0, -H * 0.86)
      .bezierCurveTo(-1, -H * 0.66, -1.2, -H * 0.36, 0, -H * 0.16)
      .fill({ color: 0xffe2a8 });
    this.husk.addChild(this.light);
    bract(-1, true, 0.03, 1.28);
    bract(1, true, -0.03, -1.28);
    // A curled tendril and two hairs at the tip.
    const tip = new Graphics();
    tip
      .moveTo(0, -H + 1)
      .bezierCurveTo(lean * 1, -H - 7, lean * 8, -H - 9, lean * 7, -H - 3)
      .stroke({ color: STEM, width: 1.1 });
    tip
      .moveTo(-1, -H + 2)
      .lineTo(-lean * 4, -H - 5)
      .moveTo(1, -H + 2)
      .lineTo(lean * 1.5, -H - 6)
      .stroke({ color: LIT, width: 0.6, alpha: 0.4 });
    this.husk.addChildAt(tip, 2);
    this.root.addChild(this.husk);
    this.update(0, 0, 0);
  }

  /** A slash opened it: `sx`, `sy` = the direction of the blow (unit-ish). */
  strike(sx: number, sy: number): void {
    this.spent = true;
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
  }

  /** `sway` = wind lean in radians. `clock` drives the breathing. */
  update(dt: number, clock: number, sway: number): void {
    const hang = this.dir < 0;
    const [ks, cs] = hang ? POD.swingHang : POD.swingSit;
    const rest = sway * (hang ? 1 : 0.35);
    this.swingV += ((rest - this.swing) * (ks as number) - this.swingV * (cs as number)) * dt;
    this.swing += this.swingV * dt;
    this.openV +=
      (((this.spent ? 1 : 0) - this.openness) * (POD.open[0] as number) -
        this.openV * (POD.open[1] as number)) *
      dt;
    this.openness += this.openV * dt;
    this.squashV +=
      (-this.squash * (POD.squash[0] as number) - this.squashV * (POD.squash[1] as number)) * dt;
    this.squash += this.squashV * dt;
    if (this.spent) this.glow = Math.max(0, this.glow - dt / POD.ember);
    else this.glow = Math.min(1, this.glow + dt * 2);

    const o = this.openness;
    for (const b of this.bracts) {
      // The side the blow went toward opens a little further.
      const bias = this.spent ? 1 + 0.18 * Math.sign(b.side) * this.lean : 1;
      b.g.rotation = b.closed + (b.open - b.closed) * o * bias;
      // Spent husks go dull.
      const d = Math.round(255 - 115 * Math.min(1, Math.max(0, o)) * (1 - this.glow * 0.6));
      b.g.tint = (d << 16) | (d << 8) | d;
    }
    const breathe = 1 + POD.breathe * Math.sin(clock * 1.6 + this.seed * 6.283);
    // Shut: the seam. Open: an ember that dies.
    const ember = this.glow * this.glow;
    this.light.alpha = this.spent ? ember * 0.7 : POD.seam * breathe;
    this.light.scale.set(this.spent ? 0.6 + 1.2 * ember : 1, this.spent ? 0.35 + 0.3 * ember : 1);
    this.root.rotation = this.swing * this.dir;
    this.husk.scale.set(1 - this.squash * 0.1, 1 + this.squash * 0.14);
    const sn = Math.sin(this.root.rotation);
    const cs2 = Math.cos(this.root.rotation);
    // The husk's centre: `arm` along local up from the pivot.
    this.cx = this.root.x + this.arm * sn * this.dir;
    this.cy = this.root.y - this.arm * cs2 * this.dir;
  }
}
