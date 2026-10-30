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

/**
 * The wood's vista (canopy review r3 #5, the way out's clifftop): the mountain under the moon, the first time the
 * story's goal is seen, and the valley's false lights spread over the floor far below it. Drawn in the wood's own
 * night (hazed blue ridges, firs along the near crest, snow on the moon side of the peak), from the room's `vista`
 * landmark (where it is framed from), `mountain` (its peak, world px: where it stands seen from the vista) and
 * `valley` (the lamp field). Near screen-fixed like the moon, over the far crowns (far2's composite), its own near ridge
 * and the valley's mist standing in for the wood below it. Render only.
 */
export const WOOD_VISTA = {
  /** Parallax of the whole against the camera (the moon's is ~0.02). */
  parallax: 0.05,
  /** Screen y of the range's foot and of the valley floor (logical px of the 1080 safe area). */
  footY: 760,
  floorY: 860,
  /** Half the range's span (px): wider than the widest view (2592) so 21:9 never sees its ends. */
  half: 1500,
  /** The peak's height over the foot, and the shoulders'. */
  peak: 360,
  /** Camera distance (world px) west of the vista point where it starts to show, and where it is full. */
  showFrom: 1100,
  showFull: 300,
  far: 0x22364e,
  near: 0x16222f,
  ridgeLit: 0x3a5474,
  snow: 0xc6d6ec,
  haze: 0x4a6a8c,
  lamp: 0xffb060,
  lampCore: 0xffe0b0,
  lamps: 220,
} as const;

export class WoodVista {
  private readonly root = new Container({ label: 'wood-vista' });
  private readonly range = new Graphics();
  private readonly field = new Graphics();
  /** The peak's screen x seen from the vista point (logical px), and the field's spread. */
  private readonly peakX: number;
  private readonly lamps: Array<[number, number, number, number]> = [];

  constructor(
    private readonly layers: LayerTree,
    private readonly at: { x: number; y: number },
    mountain: { x: number; y: number } | undefined,
    valley: { x: number; y: number; w?: number; h?: number } | undefined,
  ) {
    const L = layers.far[2];
    L?.addChild(this.root);
    this.root.addChild(this.range, this.field);
    // Seen from the vista point (the camera centred on it), the peak stands where the mountain landmark is on screen.
    // (Under the moon when the moon is in the view, the story's picture; else where the landmark puts it.)
    const moon = LOOK.moon;
    this.peakX =
      moon && moon.x > 0 && moon.x < SAFE_W
        ? moon.x + moon.r * 0.35
        : SAFE_W / 2 + ((mountain?.x ?? at.x + 1000) - at.x) * 0.6;
    const W = WOOD_VISTA;
    const r = prng(LOOK.seed * 31 + 7);
    // The lamps: clusters on the valley floor (villages of false light), thinning to strays.
    const span = (valley?.w ?? 2400) * 0.9;
    const cx = SAFE_W / 2 + ((valley?.x ?? at.x) + (valley?.w ?? 0) / 2 - at.x) * 0.6;
    const clusters = Array.from({ length: 7 }, () => [cx + (r() - 0.5) * span, r()] as const);
    for (let i = 0; i < W.lamps; i++) {
      const c = clusters[Math.floor(r() * clusters.length)] as readonly [number, number];
      const stray = r() < 0.25;
      const x = stray ? cx + (r() - 0.5) * span * 1.3 : c[0] + (r() - 0.5) * (60 + 120 * c[1]);
      const d = r();
      const y = W.floorY + 10 + d * d * 110 + (stray ? 0 : (r() - 0.5) * 20);
      this.lamps.push([x, y, 0.8 + (1 - d) * 1.6, r() * 6.28]);
    }
    this.paint();
  }

  private paint(): void {
    const W = WOOD_VISTA;
    const g = this.range;
    const r = prng(LOOK.seed * 17 + 11);
    const px = this.peakX;
    const ridge = (x: number, k: number): number => {
      // A main peak at px with a shoulder east, lesser peaks either side, ragged.
      const d = (x - px) / W.half;
      const main = Math.exp(-((d / 0.16) ** 2)) * W.peak;
      const shoulder = Math.exp(-(((d - 0.2) / 0.12) ** 2)) * W.peak * 0.55;
      const west = Math.exp(-(((d + 0.42) / 0.18) ** 2)) * W.peak * 0.42;
      const east = Math.exp(-(((d - 0.55) / 0.2) ** 2)) * W.peak * 0.35;
      const base = W.peak * 0.12 * (1 + Math.sin(x * 0.004 + k));
      const rag = 10 * Math.sin(x * 0.05 + k) + 6 * Math.sin(x * 0.13 + k * 3);
      return W.footY - Math.max(main, shoulder, west, east, base) - rag * (0.3 + 0.7 * (main / W.peak));
    };
    // The far range.
    const top: number[] = [];
    for (let x = px - W.half; x <= px + W.half; x += 12) top.push(x, ridge(x, 0));
    g.poly([...top, px + W.half, W.footY + 80, px - W.half, W.footY + 80]).fill({ color: W.far });
    // Its west flanks in shadow, the moon side lit: snow on the upper right of the peaks as one cap per peak (narrow
    // per-step slivers read as stripes).
    const slope = (x: number): number => ridge(x + 6, 0) - ridge(x - 6, 0);
    const shade: number[] = [];
    const lit: number[] = [];
    for (let x = px - W.half; x <= px + W.half; x += 12) {
      const y = ridge(x, 0);
      const h = (W.footY - y) / W.peak;
      shade.push(x, y + (slope(x) < 0 ? 0 : 4 + 60 * h));
      lit.push(x, y + (h > 0.55 ? (slope(x) > 0 ? 18 + 80 * (h - 0.55) : 4 + 14 * (h - 0.55)) : 0));
    }
    // (Shadow: below the ridge on the slopes that face away from the moon.)
    const shadePoly: number[] = [...top];
    for (let i = shade.length / 2 - 1; i >= 0; i--)
      shadePoly.push(shade[i * 2] as number, shade[i * 2 + 1] as number);
    g.poly(shadePoly).fill({ color: 0x101a28, alpha: 0.5 });
    const capPoly: number[] = [...top];
    for (let i = lit.length / 2 - 1; i >= 0; i--)
      capPoly.push(lit[i * 2] as number, lit[i * 2 + 1] as number);
    g.poly(capPoly).fill({ color: W.snow, alpha: 0.26 });
    // (The crest itself catches the most.)
    const crest: number[] = [...top];
    for (let i = lit.length / 2 - 1; i >= 0; i--)
      crest.push(
        lit[i * 2] as number,
        (top[i * 2 + 1] as number) + ((lit[i * 2 + 1] as number) - (top[i * 2 + 1] as number)) * 0.35,
      );
    g.poly(crest).fill({ color: W.snow, alpha: 0.22 });
    // A few dark rock ribs down through the snow.
    for (let k = 0; k < 7; k++) {
      const x = px + (r() - 0.35) * 220;
      const y0 = ridge(x, 0) + 6;
      const len = 30 + r() * 90;
      g.poly([x, y0, x + 4, y0, x + 10 + len * 0.35, y0 + len, x + 6 + len * 0.35, y0 + len]).fill({
        color: W.far,
        alpha: 0.7,
      });
    }
    // Haze over its foot.
    for (let k = 0; k < 6; k++)
      g.rect(px - W.half, W.footY - 120 + k * 30, W.half * 2, 200).fill({ color: W.haze, alpha: 0.07 });
    // The near ridge: dark, firs along its crest.
    const near: number[] = [];
    for (let x = px - W.half; x <= px + W.half; x += 16) {
      const y = W.footY + 30 - 70 * (0.5 + 0.5 * Math.sin(x * 0.0026 + 2)) - 20 * Math.sin(x * 0.011);
      near.push(x, y);
    }
    g.poly([...near, px + W.half, W.floorY + 260, px - W.half, W.floorY + 260]).fill({ color: W.near });
    for (let i = 0; i < near.length; i += 2) {
      if (r() < 0.45) continue;
      const x = (near[i] as number) + (r() - 0.5) * 10;
      const y = (near[i + 1] as number) + 4;
      const h = 14 + r() * 26;
      g.poly([x - h * 0.22, y, x, y - h, x + h * 0.22, y]).fill({ color: W.near });
    }
    // The valley's mist, over the floor where the lamps are.
    for (let k = 0; k < 5; k++)
      g.rect(px - W.half, W.floorY - 30 + k * 26, W.half * 2, 90).fill({ color: W.haze, alpha: 0.06 });
  }

  update(cam: CameraView, clock: number): void {
    const W = WOOD_VISTA;
    const show = Math.max(0, Math.min(1, (cam.x - (this.at.x - W.showFrom)) / (W.showFrom - W.showFull)));
    this.root.visible = show > 0.01;
    if (!this.root.visible) return;
    this.root.alpha = show;
    const L = this.layers.far[2];
    if (!L) return;
    // Near screen-fixed: framed from the vista point, drifting a little as the camera moves off it.
    const sx = (this.at.x - cam.x) * W.parallax;
    const sy = (this.at.y - cam.y) * W.parallax * 0.6;
    const ox = SAFE_W / 2 + (sx - SAFE_W / 2) * cam.zoom;
    const oy = SAFE_H / 2 + (sy - SAFE_H / 2) * cam.zoom;
    const scale = L.scale.x || 1;
    this.root.position.set((ox - L.position.x) / scale, (oy - L.position.y) / scale);
    this.root.scale.set(cam.zoom / scale);
    // The valley's false lights: warm points twinkling (redrawn each frame: cheap), a halo round the near ones.
    const f = this.field.clear();
    for (const [x, y, s, ph] of this.lamps) {
      const tw = 0.6 + 0.4 * Math.sin(clock * (0.9 + (ph % 1.3)) + ph);
      f.circle(x, y, s * 4).fill({ color: W.lamp, alpha: 0.06 * tw * s });
      f.circle(x, y, s).fill({ color: W.lampCore, alpha: 0.5 + 0.4 * tw });
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
