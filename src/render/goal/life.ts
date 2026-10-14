/**
 * What a lit lantern wakes round its foot: a handful of small glow-buds on the same ground, shut and
 * dark while the lantern is dormant (barely there), opening one after another into warm five-petal
 * flowers once it burns, nearest first. Drawn once with Graphics; per frame a scale and a rotation
 * each. Their lights are drawn by the goal renderer's batch at `lights`.
 */
import { Container, Graphics } from 'pixi.js';
import { TONES, tone } from '../pickups/holder';
import { zoneWeights } from '../scene/lib/fx-zones';
import { wind } from '../scene/lib/look';

interface Bloom {
  root: Container;
  bud: Graphics;
  flower: Container;
  x: number;
  h: number;
  delay: number;
  open: number;
  seed: number;
}

/** Offsets from the lantern's point, px (kept clear of where she stands and of the stem), and stalk heights. */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-178, 15],
  [-131, 24],
  [-92, 13],
  [-58, 20],
  [64, 17],
  [97, 26],
  [139, 14],
  [186, 21],
];

export class LanternLife {
  readonly root = new Container();
  /** World x, y and openness (0..1) of each flower's light: [x, y, open] * n. */
  readonly lights: number[] = [];
  private readonly blooms: Bloom[] = [];

  constructor(
    private readonly x: number,
    y: number,
    edgeL: number,
    edgeR: number,
    seed: number,
    /** Other places than a lantern's own (the heart's flowers): [px from `x`, stalk height]. */
    spots: ReadonlyArray<readonly [number, number]> = SPOTS,
    /** Seconds each 150 px of distance adds to a flower's turn. */
    private readonly spread = 1,
  ) {
    const w = zoneWeights(x);
    const stemTone = tone(TONES.stem, w);
    const leafTone = tone(TONES.leaf, w);
    for (let i = 0; i < spots.length; i++) {
      const [dx, h0] = spots[i] as readonly [number, number];
      const bx = x + dx;
      if (bx < edgeL + 8 || bx > edgeR - 8) continue;
      const s = (seed * 7.3 + i * 0.618) % 1;
      const h = h0 + 6 * s;
      const root = new Container();
      const stalk = new Graphics();
      const lean = (s - 0.5) * 7;
      stalk
        .moveTo(0, 2)
        .quadraticCurveTo(lean * 0.2, -h * 0.5, lean, -h)
        .stroke({ width: 1.3, color: stemTone, cap: 'round' });
      stalk
        .moveTo(lean * 0.3, -h * 0.4)
        .quadraticCurveTo(lean * 0.3 + 5, -h * 0.5 - 3, lean * 0.3 + 8, -h * 0.4 - 1)
        .quadraticCurveTo(lean * 0.3 + 4, -h * 0.4 + 1, lean * 0.3, -h * 0.4)
        .fill({ color: leafTone });
      // Shut: a slim dark bud.
      const bud = new Graphics();
      bud
        .moveTo(0, 1)
        .bezierCurveTo(-3, -1.5, -1.6, -5.5, 0, -7.5)
        .bezierCurveTo(1.6, -5.5, 3, -1.5, 0, 1)
        .closePath()
        .fill({ color: leafTone });
      bud.position.set(lean, -h);
      // Open: five warm petals.
      const flower = new Container();
      const petals = new Graphics();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.62;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const len = 7.2 - Math.abs(k - 2) * 0.7;
        petals
          .moveTo(0, 0)
          .quadraticCurveTo(c * len * 0.5 - sn * 2.4, sn * len * 0.5 + c * 2.4, c * len, sn * len)
          .quadraticCurveTo(c * len * 0.5 + sn * 2.4, sn * len * 0.5 - c * 2.4, 0, 0)
          .closePath()
          .fill({ color: k % 2 === 0 ? 0xffd39a : 0xf2a860 });
      }
      petals.circle(0, -1.6, 1.5).fill({ color: 0xfff1d6 });
      flower.addChild(petals);
      flower.position.set(lean, -h);
      flower.scale.set(0);
      root.addChild(stalk, bud, flower);
      root.position.set(bx, y);
      this.root.addChild(root);
      this.blooms.push({
        root,
        bud,
        flower,
        x: bx + lean,
        h,
        delay: 0.5 + (Math.abs(dx) / 150) * this.spread + s * 0.4,
        open: 0,
        seed: s,
      });
      this.lights.push(bx + lean, y - h - 3, 0);
    }
  }

  /** `t` = seconds the lantern has burnt (< 0 = dormant; large = long lit). */
  update(dt: number, clock: number, t: number): void {
    for (let i = 0; i < this.blooms.length; i++) {
      const b = this.blooms[i] as Bloom;
      const want = t > b.delay ? 1 : 0;
      b.open += (want - b.open) * Math.min(1, dt * (want > b.open ? 3.2 : 6));
      if (t > 1e5) b.open = 1;
      const o = b.open;
      // A small overshoot as it opens.
      const pop = o * (1 + 0.35 * Math.sin(Math.PI * o) * (1 - o));
      b.flower.scale.set(pop);
      b.flower.visible = o > 0.01;
      b.bud.scale.set(1 - 0.75 * o);
      b.root.rotation = wind(this.x + b.x * 0.3, clock, b.seed) * 0.11;
      this.lights[i * 3 + 2] = o;
    }
  }
}
