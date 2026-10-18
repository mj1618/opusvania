/**
 * The vista from the root plate's crest (docs/design/levels/proto-1.md §4 C1, §8 "The vista"): east over the
 * valley's lamp field to the mountain under the moon, the level's end seen as the story's next place. Shown where
 * the room marks a `vista` landmark, fading in as the camera comes east and up toward it.
 *
 * Painted once (a hazy range with snow catching the moon on its upper right, the valley's floor of tiny warm
 * lamps twinkling below it) and held near screen-fixed like the moon, over the far crowns (which sink out of the
 * way as the camera climbs to the crest). Render only.
 */
import { Container, Graphics } from 'pixi.js';
import { type CameraView, SAFE_H, SAFE_W } from '../contract';
import type { LayerTree } from '../scene/layer-tree';
import { mix, prng } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';

export const VISTA = {
  /** Screen place of the range's foot (fraction of the safe area) and its span (px). */
  footY: 0.64,
  span: 1500,
  /** Parallax of the whole (0 = screen-fixed like the moon). */
  parallax: 0.04,
  /** Camera x where it starts to show / is full (before the landmark), and the camera y above which it is full. */
  showFrom: 3200,
  showFull: 1300,
  /** Colours: the range (hazed toward the night), its snow, the lamps. */
  range: 0x22364e,
  rangeFar: 0x2c4462,
  snow: 0x9fb8d6,
  lamp: 0xffb060,
  lamps: 140,
} as const;

export class Vista {
  private readonly root = new Container({ label: 'lr-vista' });
  private readonly range = new Graphics();
  private readonly field = new Graphics();
  private readonly at: { x: number; y: number };

  constructor(
    private readonly layers: LayerTree,
    landmark: { x: number; y: number },
  ) {
    this.at = landmark;
    // Above the far composite (far2 hosts it): the far crowns are behind, the range over them, high in the frame.
    layers.far[2]?.addChild(this.root);
    this.root.addChild(this.range, this.field);
    this.paint();
  }

  private paint(): void {
    const g = this.range;
    const r = prng(LOOK.seed * 17 + 3);
    const span = VISTA.span;
    // Two ranges: the far one paler, the near one darker, ragged, peaks under the moon.
    for (const [k, col, h0] of [
      [0, VISTA.rangeFar, 300],
      [1, VISTA.range, 220],
    ] as const) {
      const pts: number[] = [-span / 2, 0];
      let y = 0;
      for (let x = -span / 2; x <= span / 2; x += 18) {
        const peak = Math.exp(-((x / (span * (k ? 0.22 : 0.3))) ** 2));
        y =
          -h0 * (0.25 + 0.75 * peak) * (0.85 + 0.15 * Math.sin(x * 0.02 + k)) -
          22 * (r() - 0.5) * (1 - peak * 0.5);
        pts.push(x, y);
      }
      pts.push(span / 2, 0, span / 2, 40, -span / 2, 40);
      g.poly(pts).fill(col);
      // Snow on the upper right of the peaks, catching the moon.
      if (k === 0) {
        for (let x = -span * 0.18; x < span * 0.2; x += 26) {
          const peak = Math.exp(-((x / (span * 0.3)) ** 2));
          const top = -h0 * (0.25 + 0.75 * peak);
          if (peak < 0.55) continue;
          g.poly([x, top + 6, x + 20, top + 30 + r() * 20, x + 6, top + 40]).fill({
            color: VISTA.snow,
            alpha: 0.35,
          });
        }
      }
    }
    // Haze over the range's foot (the valley's air).
    for (let k = 0; k < 5; k++)
      g.rect(-span / 2, -40 + k * 10, span, 60).fill({
        color: mix(VISTA.rangeFar, 0x5a7ca0, 0.4),
        alpha: 0.12,
      });
  }

  update(cam: CameraView, clock: number): void {
    const show = Math.max(
      0,
      Math.min(1, (cam.x - (this.at.x - VISTA.showFrom)) / (VISTA.showFrom - VISTA.showFull)),
    );
    const up = Math.max(0, Math.min(1, (this.at.y + 1100 - cam.y) / 700));
    const k = show * (0.35 + 0.65 * up);
    this.root.visible = k > 0.01;
    if (!this.root.visible) return;
    this.root.alpha = k;
    // Near screen-fixed: where the far2 layer must put it for the screen place we want.
    const L = this.layers.far[2];
    if (!L) return;
    const sx = (LOOK.moon?.x ?? 1420) + (this.at.x - cam.x) * VISTA.parallax;
    const sy = SAFE_H * VISTA.footY;
    const scale = L.scale.x || 1;
    this.root.position.set((sx - L.position.x) / scale, (sy - L.position.y) / scale);
    this.root.scale.set(1 / scale);
    // The valley's lamps: tiny warm points along the floor under the range, twinkling (redrawn: cheap).
    const f = this.field.clear();
    for (let i = 0; i < VISTA.lamps; i++) {
      const u = hash01('vista', i);
      const v = hash01('vista', i + 999);
      const x = (u - 0.5) * VISTA.span * 1.1;
      const y = 6 + v * v * 90;
      const tw = 0.55 + 0.45 * Math.sin(clock * (1.3 + u * 2) + i);
      const a = (0.35 + 0.65 * (1 - v)) * tw;
      f.circle(x, y, 1.2 + (1 - v) * 1.4).fill({ color: VISTA.lamp, alpha: a });
    }
    void SAFE_W;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
