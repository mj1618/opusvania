/**
 * A lumen pod: a closed seed-pod that holds light, the first thing the slash can break
 * (src/sim/pods.ts decides when). Small and in the values of the plants round it: it is found by
 * its shape and by the light in its seam, not by a pale husk. Two crescent bracts in front, a
 * darker panel between them (two back bracts) with warm light glowing softly down the seam, and a
 * small calyx where it joins its stalk. Struck, the crescents spring back like an opened seed case
 * and stay so, darker, round an empty cup with an ember that dies.
 *
 * Forms, so that a dozen do not repeat one silhouette:
 *  - `sit`: a bud nestled in a rosette, in one of three builds (squat, slender on a bowed stalk,
 *    plain), each leaning its own way;
 *  - `hang`: a cocoon, long and blunt, bound with two threads, on a stem;
 *  - a pod that takes more than one hit is a cluster: the main pod and a smaller bud at its base
 *    per extra hit. Each hit that does not open it bursts one of the small ones.
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
  /**
   * Size of a pod that takes 1, 2, 3 hits (1 = a 44 px husk, the sim's box). Kept well under the
   * hero: a 3-hit cluster stands about shoulder high.
   */
  scale: [0.6, 0.7, 0.8],
  /** A cluster's small buds: size relative to the main pod, and how far they lean out (rad). */
  budScale: 0.68,
  budLean: 0.95,
  /** Sitting builds [squat, slender, plain]: width, height, stalk px, lean (rad, times its side). */
  builds: [
    [1.14, 0.84, 10, -0.1],
    [0.86, 1.14, 19, 0.17],
    [1, 1, 14, -0.22],
  ],
  /** The hanging cocoon: width and height of the plain lantern. */
  cocoon: [0.76, 1.2],
  /** How far the crescents stand ajar once a tough pod has taken all but its last hit. */
  ajar: 0.24,
  /** A finisher (power 2) throws this much more into the springs. */
  finisher: 1.6,
};

/**
 * Husk colours per zone [cool glade, light well, violet stand]: the leaf values of the plants round
 * it, barely lifted (a pale husk with a bright rim was louder than the story props). `rim` is the
 * edge the key light catches, drawn faint.
 */
const HUSK = {
  front: [0x14494c, 0x46541f, 0x172e4a],
  panel: [0x0a2c31, 0x222d11, 0x101e3a],
  rim: [0x4f9a90, 0x8f8f48, 0x56719e],
  calyx: [0x1c5a52, 0x55602a, 0x223c5a],
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
  /** A cluster's small buds, one per extra hit it takes (their two crescents); each bursts on a hit. */
  private readonly armour: Bract[][] = [];
  private readonly peel: number[] = [];
  private readonly peelV: number[] = [];
  /** Hits taken so far (0 .. tier - 1 while it is still shut). */
  damage = 0;
  /** Overall size of the husk (POD.scale for its tier). */
  readonly size: number;
  /** Half-height of the main husk in world px. */
  private readonly half: number;
  /** A sitting pod leans a little, each its own way (rad). */
  private readonly tilt: number;
  /** The seam light of each small bud of a cluster (index = armour ring). */
  private readonly budLight: Graphics[] = [];
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

  /** `tier` = hits it takes to open: 1, 2 or 3. Tougher pods are larger and armoured. */
  constructor(
    readonly pod: Pod,
    scene: Scene,
    seed: number,
    readonly tier = 1,
  ) {
    this.seed = seed;
    this.size = POD.scale[Math.min(3, Math.max(1, tier)) - 1] ?? 1;
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
    // Build: which of the forms this one is.
    const pick = Math.floor(((seed * 7.13) % 1) * POD.builds.length) % POD.builds.length;
    const build = POD.builds[pick] ?? [1, 1, POD.stalk, 0];
    const wideK = (hang ? POD.cocoon[0] : build[0]) ?? 1;
    const tallK = (hang ? POD.cocoon[1] : build[1]) ?? 1;
    this.tilt = hang ? 0 : (build[3] ?? 0) * lean;
    this.half = S * tallK * this.size;
    const pivot = hang ? attachAbove(scene, pod.x, pod.y - S) : pod.y + S;
    // The drawn husk stays centred on the sim's box: a hanging one exactly, a sitting one near it.
    const stemLen = hang ? Math.max(0, pod.y - this.half - pivot) : (build[2] ?? POD.stalk) + 3 * (tier - 1);
    this.arm = this.half + stemLen;
    this.root.position.set(pod.x, pivot);
    this.root.scale.y = this.dir;
    this.cx = pod.x;
    this.cy = pod.y;

    const base = new Graphics();
    // The stalk: sturdy and a little bowed.
    const bow = lean * Math.min(6, stemLen * 0.3);
    const sw = (hang ? 1.1 : 1.9) * (0.7 + 0.5 * this.size * this.size);
    base
      .moveTo(-sw, 3)
      .quadraticCurveTo(bow - sw * 0.8, -stemLen * 0.5, -sw * 0.7, -stemLen - 2)
      .lineTo(sw * 0.7, -stemLen - 2)
      .quadraticCurveTo(bow + sw * 0.8, -stemLen * 0.5, sw, 3)
      .fill({ color: STEM });
    if (hang) {
      for (const side of [-1, 1]) {
        const len = side === lean ? 12 : 8;
        base
          .moveTo(0, 2)
          .bezierCurveTo(side * len * 0.4, -len * 0.5, side * len * 0.9, -len * 0.25, side * len, len * 0.25)
          .bezierCurveTo(side * len * 0.6, len * 0.3, side * len * 0.25, len * 0.2, 0, 2)
          .fill({ color: side === lean ? LEAF : DARK });
      }
    } else {
      // A rosette: leaves that rise a little before they fall outward, so they top the grass.
      // They cup the bud: it is nestled in them, not held up over them.
      const leaf = 0.62 + 0.3 * this.size + 0.1 * pick;
      for (const [a, l0] of [
        [-1.3, 30],
        [-0.72, 24],
        [0.78, 26],
        [1.34, 32],
      ] as const) {
        const len = l0 * leaf;
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
          .stroke({ color: LIT, width: 0.7, alpha: 0.2 });
      }
    }
    this.root.addChild(base);

    // The husk: origin at its base (where it joins the stalk), pointed tip 2S and a little away.
    this.husk.position.set(0, -stemLen);
    const H = S * 2 * tallK;
    const tipY = hang ? -H - 1 : -H - 5;
    /** The outline on one side, base to tip: a lantern with a point, or a cocoon with a blunt end. */
    const outline = (g: Graphics, side: number, wide: number): Graphics =>
      hang
        ? g.bezierCurveTo(side * wide * 0.9, -H * 0.16, side * wide * 1.5, -H * 0.98, 0, tipY)
        : g.bezierCurveTo(side * wide * 1.15, -H * 0.02, side * wide * 1.02, -H * 0.62, 0, tipY);
    const bract = (side: number, front: boolean, closed: number, open: number): void => {
      const g = new Graphics();
      if (front) {
        // A crescent: the outer wall of the lantern, about a third of its width. Rotated open it
        // reads as a curled-back valve of a seed case.
        const wide = 21 * wideK;
        outline(g.moveTo(0, 1), side, wide)
          .bezierCurveTo(side * wide * 0.5, -H * 0.66, side * wide * 0.56, -H * 0.2, 0, 1)
          .fill({ color: FRONT });
        // Its inner face, lit by what it holds: a breath of warmth, not a stripe.
        g.moveTo(side * 2, -H * 0.1)
          .bezierCurveTo(side * wide * 0.5, -H * 0.26, side * wide * 0.46, -H * 0.62, side * 1.2, tipY + 6)
          .stroke({ color: 0xffa050, width: 1.4, alpha: 0.14 });
        if (hang) {
          // Two threads bind the cocoon.
          for (const u of [0.42, 0.7])
            g.moveTo(side * wide * 0.3, -H * (u - 0.07))
              .quadraticCurveTo(side * wide * 0.7, -H * (u + 0.02), side * wide * 1.02, -H * (u + 0.07))
              .stroke({ color: PANEL, width: 1.3, alpha: 0.75 });
        } else {
          // A rib.
          g.moveTo(side * 3, -1)
            .bezierCurveTo(side * wide * 0.86, -H * 0.1, side * wide * 0.78, -H * 0.6, side * 1, tipY + 3)
            .stroke({ color: PANEL, width: 0.9, alpha: 0.5 });
        }
        // The rim the key light catches (upper right in the world): faint.
        const key = side > 0;
        if (hang)
          g.moveTo(side * wide * 0.72, -H * 0.3)
            .quadraticCurveTo(side * wide * 1.05, -H * 0.6, side * wide * 0.98, -H * 0.82)
            .stroke({ color: RIM, width: 1.2, alpha: key ? 0.42 : 0.14 });
        else
          g.moveTo(side * wide * 0.99, -H * 0.3)
            .bezierCurveTo(side * wide * 1.0, -H * 0.56, side * wide * 0.52, -H * 0.86, 0, tipY)
            .stroke({ color: RIM, width: 1.2, alpha: key ? 0.42 : 0.14 });
      } else {
        // The panel between the crescents: half the lantern each, darker.
        const wide = 17 * wideK;
        outline(g.moveTo(0, 1), side, wide).lineTo(0, 1).fill({ color: PANEL });
        if (side < 0) {
          // The empty cup, seen once the case has opened.
          g.ellipse(0, -5, 7.5, 5).fill({ color: DARK });
          g.ellipse(0, -4, 5, 3).fill({ color: 0x05100f, alpha: 0.7 });
          // A curled tendril at the tip.
          if (!hang)
            g.moveTo(0, tipY + 1)
              .bezierCurveTo(lean * 1, tipY - 6, lean * 8, tipY - 8, lean * 6.5, tipY - 2)
              .stroke({ color: STEM, width: 1.1 });
        }
      }
      g.rotation = closed;
      this.husk.addChild(g);
      this.bracts.push({ g, closed, open, side });
    };
    // A cluster: one small bud at the base per extra hit it takes, leaning out, behind the main pod.
    // Ring 0 (the first to burst) is on the side the pod leans to. They live in `armour` / `peel`.
    for (let ring = 0; ring < tier - 1; ring++) {
      const side = ring === 0 ? lean : -lean;
      const bud = new Container();
      const k = POD.budScale * (ring === 0 ? 1 : 0.86);
      bud.position.set(side * 13 * wideK, -H * 0.1);
      bud.rotation = side * POD.budLean * (ring === 0 ? 1 : 1.12);
      bud.scale.set(k);
      const bh = S * 2;
      const tip = -bh - 4;
      const half = (g: Graphics, sd: number, wide: number): Graphics =>
        g.bezierCurveTo(sd * wide * 1.15, -bh * 0.02, sd * wide * 1.02, -bh * 0.62, 0, tip);
      // Its little stalk, then the dark panel, the light in it, and two crescents that fold back.
      const back = new Graphics();
      back.moveTo(-2.2, 6).lineTo(-1.6, -2).lineTo(1.6, -2).lineTo(2.2, 6).fill({ color: STEM });
      half(back.moveTo(0, 1), -1, 16).lineTo(0, 1).fill({ color: PANEL });
      half(back.moveTo(0, 1), 1, 16).lineTo(0, 1).fill({ color: PANEL });
      bud.addChild(back);
      const lamp = new Graphics();
      for (const [wd, a, col] of [
        [6.5, 0.14, 0xff9a3a],
        [3.4, 0.36, 0xffb050],
        [1.3, 0.8, 0xffe0a6],
      ] as const)
        lamp
          .moveTo(0, -bh * 0.14)
          .bezierCurveTo(wd, -bh * 0.36, wd * 0.8, -bh * 0.7, 0, -bh * 0.92)
          .bezierCurveTo(-wd * 0.8, -bh * 0.7, -wd, -bh * 0.36, 0, -bh * 0.14)
          .fill({ color: col, alpha: a });
      bud.addChild(lamp);
      this.budLight[ring] = lamp;
      const layer: Bract[] = [];
      for (const sd of [-1, 1]) {
        const g = new Graphics();
        half(g.moveTo(0, 1), sd, 20)
          .bezierCurveTo(sd * 10, -bh * 0.66, sd * 11, -bh * 0.2, 0, 1)
          .fill({ color: ring === 0 ? FRONT : CALYX });
        g.moveTo(sd * 19.6, -bh * 0.3)
          .bezierCurveTo(sd * 20, -bh * 0.56, sd * 10.5, -bh * 0.86, 0, tip)
          .stroke({ color: RIM, width: 1.6, alpha: sd * side > 0 ? 0.4 : 0.14 });
        bud.addChild(g);
        layer.push({ g, closed: 0, open: sd * 1.05, side: sd });
      }
      this.husk.addChild(bud);
      this.armour.push(layer);
      this.peel.push(0);
      this.peelV.push(0);
    }
    bract(-1, false, 0, -0.36);
    bract(1, false, 0, 0.36);
    // The light inside: soft, three nested lenses down the seam of the panel.
    for (const [w0, a, col] of [
      [7, 0.12, 0xff9a3a],
      [3.8, 0.3, 0xffb050],
      [1.35, 0.8, 0xffe0a6],
    ] as const) {
      const wd = w0 * wideK;
      this.light
        .moveTo(0, -H * 0.1)
        .bezierCurveTo(wd, -H * 0.34, wd * 0.8, -H * 0.72, 0, -H * 0.95)
        .bezierCurveTo(-wd * 0.8, -H * 0.72, -wd, -H * 0.34, 0, -H * 0.1)
        .fill({ color: col, alpha: a });
    }
    this.husk.addChild(this.light);
    bract(-1, true, 0, -0.98);
    bract(1, true, 0, 0.98);
    // The calyx: three short pointed sepals clasping the base.
    const calyx = new Graphics();
    for (const [a, l0] of [
      [-0.95, 12],
      [0, 9],
      [0.95, 12],
    ] as const) {
      const len = l0 * (hang ? 0.8 : 1) * (0.6 + 0.4 * wideK);
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

  /** A slash hit it without opening it: a layer of armour peels, the seam widens, it jolts. */
  hit(sx: number, sy: number, power: number, damage = this.damage + 1): void {
    this.damage = Math.min(this.tier - 1, Math.max(this.damage, damage));
    this.jolt(sx, sy, power * 1.25);
    this.openV += 3;
  }

  /** A slash opened it: `sx`, `sy` = the direction of the blow (unit-ish). */
  strike(sx: number, sy: number, power = 1): void {
    this.spent = true;
    this.damage = this.tier - 1;
    this.openV += 9;
    this.jolt(sx, sy, power);
  }

  private jolt(sx: number, sy: number, power: number): void {
    const k = power >= 2 ? POD.finisher : power;
    this.settled = false;
    const hang = this.dir < 0;
    // Sideways blows swing it; vertical ones squash it and tip it a little to its own side.
    const side = Math.abs(sx) > 0.3 ? Math.sign(sx) : (this.seed > 0.5 ? 1 : -1) * 0.35;
    // Positive swing carries the husk toward +x, hanging or sitting.
    this.swingV += side * (hang ? POD.kickHang : POD.kickSit) * k;
    this.squashV -= POD.kickSquash * (Math.abs(sy) > 0.3 ? 1.4 : 1) * k;
    this.lean = side;
  }

  /** Something brushed past (the hero walking through): a small nudge. */
  nudge(v: number): void {
    this.swingV += v;
  }

  /** Snap to closed with `damage` hits taken (restart: 0) or spent (already burst). */
  set(spent: boolean, damage = 0): void {
    this.spent = spent;
    this.damage = spent ? this.tier - 1 : Math.min(this.tier - 1, damage);
    for (let j = 0; j < this.peel.length; j++) {
      this.peel[j] = spent || j < this.damage ? 1 : 0;
      this.peelV[j] = 0;
    }
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
    const rest = sway * (hang ? 1 : 0.35) + this.tilt;
    this.swingV += ((rest - this.swing) * (ks as number) - this.swingV * (cs as number)) * dt;
    this.swing += this.swingV * dt;
    if (!this.settled) {
      const target = this.spent ? 1 : this.tier > 1 ? (this.damage / (this.tier - 1)) * POD.ajar : 0;
      let peeling = false;
      for (let j = 0; j < this.peel.length; j++) {
        const want = this.spent || j < this.damage ? 1 : 0;
        const pv =
          (this.peelV[j] as number) +
          ((want - (this.peel[j] as number)) * 90 - (this.peelV[j] as number) * 7) * dt;
        this.peelV[j] = pv;
        this.peel[j] = (this.peel[j] as number) + pv * dt;
        if (Math.abs(want - (this.peel[j] as number)) > 0.002 || Math.abs(pv) > 0.01) peeling = true;
      }
      this.openV +=
        ((target - this.openness) * (POD.open[0] as number) - this.openV * (POD.open[1] as number)) * dt;
      this.openness += this.openV * dt;
      this.squashV +=
        (-this.squash * (POD.squash[0] as number) - this.squashV * (POD.squash[1] as number)) * dt;
      this.squash += this.squashV * dt;
      this.glow = this.spent ? Math.max(0, this.glow - dt / POD.ember) : Math.min(1, this.glow + dt * 2);
      this.pose(clock);
      this.settled =
        !peeling &&
        Math.abs(this.openness - target) < 0.002 &&
        Math.abs(this.openV) < 0.01 &&
        Math.abs(this.squash) < 0.002 &&
        Math.abs(this.squashV) < 0.01 &&
        this.glow === (this.spent ? 0 : 1);
    } else if (!this.spent) {
      // Shut and at rest: only the seam breathes.
      this.light.alpha = this.seamAlpha(clock);
    }
    this.root.rotation = this.swing * this.dir;
    this.place();
  }

  /** The seam's opacity: tougher pods hold more light, and a damaged one leaks more. */
  private seamAlpha(clock: number): number {
    const more = 1 + 0.12 * (this.tier - 1) + 0.22 * this.damage;
    const breathe = 1 + POD.breathe * Math.sin(clock * POD.breatheRate + this.seed * 6.283);
    return Math.min(0.92, POD.seam * more * breathe);
  }

  /** Bracts, tints, the light and the squash from the current spring values. */
  private pose(clock: number): void {
    const o = this.openness;
    for (let j = 0; j < this.armour.length; j++) {
      const k = this.peel[j] as number;
      // A burst bud stays open and dull, its light gone.
      const kk = Math.min(1, Math.max(0, k));
      const d = Math.round(255 - 110 * kk);
      for (const b of this.armour[j] as Bract[]) {
        b.g.rotation = b.open * k;
        b.g.tint = (d << 16) | (d << 8) | d;
      }
      const lamp = this.budLight[j];
      if (lamp) lamp.alpha = POD.seam * (1 - kk) * (1 - kk);
    }
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
      this.light.alpha = this.seamAlpha(clock);
      // The seam widens as the crescents come ajar.
      this.light.scale.set(1 + 1.1 * Math.max(0, this.openness), 1);
    }
    this.husk.scale.set(this.size * (1 - this.squash * 0.1), this.size * (1 + this.squash * 0.14));
  }

  /** Where the husk's centre and tip are in the world, from the swing. */
  private place(): void {
    const r = this.root.rotation;
    const sn = Math.sin(r) * this.dir;
    const cs = Math.cos(r) * this.dir;
    this.cx = this.root.x + this.arm * sn;
    this.cy = this.root.y - this.arm * cs;
    const tip = this.arm + this.half + 4 * this.size;
    this.tipX = this.root.x + tip * sn;
    this.tipY = this.root.y - tip * cs;
  }
}
