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
  half: 1900,
  /** The main peak's height over the foot. */
  peak: 360,
  /**
   * The range (review r4 #7: one symmetric cone, floating snow): peaks as [offset from the main peak in `half`s, height
   * as a share of `peak`, half-width in `half`s]. The main one stands under the moon, off the range's centre.
   */
  peaks: [
    [0, 1, 0.15],
    [-0.3, 0.7, 0.13],
    [0.24, 0.56, 0.12],
    [-0.58, 0.44, 0.16],
    [0.5, 0.36, 0.14],
  ] as ReadonlyArray<readonly [number, number, number]>,
  /** Camera distance (world px) west of the vista point where it starts to show, and where it is full. */
  showFrom: 1100,
  showFull: 300,
  far: 0x22364e,
  farLit: 0x34507a,
  farDark: 0x141f30,
  near: 0x16222f,
  wall: 0x0e1822,
  ridgeLit: 0x3a5474,
  snow: 0xc6d6ec,
  haze: 0x4a6a8c,
  river: 0x8aa6c8,
  lamp: 0xffb060,
  lampCore: 0xffe0b0,
  moth: 0xffe6c0,
} as const;

/** A valley lamp: screen place, size (core px), twinkle phase, and whether moths circle it (the nearer tiers). */
interface VistaLamp {
  x: number;
  y: number;
  s: number;
  ph: number;
  swarm: number;
}

export class WoodVista {
  private readonly root = new Container({ label: 'wood-vista' });
  private readonly range = new Graphics();
  private readonly field = new Graphics();
  /** The peak's screen x seen from the vista point (logical px), and the lamps at three depths. */
  private readonly peakX: number;
  private readonly lamps: VistaLamp[] = [];

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
    const cx = SAFE_W / 2 + ((valley?.x ?? at.x) + (valley?.w ?? 0) / 2 - at.x) * 0.6;
    const span = (valley?.w ?? 2400) * 0.9;
    // Three depths (review r4 #7: one flat field read as a town at night): far specks under the range, clusters on the
    // valley's hills, and a few near lamps, larger, with their moths.
    const tier = (
      n: number,
      clusters: number,
      y0: number,
      y1: number,
      s0: number,
      s1: number,
      spread: number,
      sw: number,
    ) => {
      const cs = Array.from(
        { length: clusters },
        () => [cx + (r() - 0.5) * spread, y0 + r() * (y1 - y0)] as const,
      );
      for (let i = 0; i < n; i++) {
        const c = cs[Math.floor(r() * cs.length)] as readonly [number, number];
        const rad = 30 + s1 * 20 * r();
        this.lamps.push({
          x: c[0] + (r() - 0.5) * rad * 2,
          y: c[1] + (r() - 0.5) * rad * 0.5,
          s: s0 + (s1 - s0) * r(),
          ph: r() * 6.28,
          swarm: sw && r() < 0.5 ? sw : 0,
        });
      }
    };
    // (The far tier converges on the mountain's foot, as the valley does.)
    tier(70, 6, W.footY + 8, W.footY + 34, 0.5, 1, Math.min(span, 900), 0);
    tier(110, 8, W.floorY - 6, W.floorY + 40, 0.9, 1.8, span, 0);
    tier(14, 3, W.floorY + 100, W.floorY + 170, 2, 3.2, span * 1.2, 14);
    this.paint();
  }

  /** The range's top at screen x (layer px): the sharper of its peaks, ragged. */
  private ridge(x: number): number {
    const W = WOOD_VISTA;
    let h = W.peak * 0.1 * (1 + 0.6 * Math.sin(x * 0.004));
    for (const [o, ph, hw] of W.peaks) {
      const d = Math.abs(x - (this.peakX + o * W.half)) / (hw * W.half);
      // (Concave flanks with shoulders and notches down them: straight sides read as paper triangles.)
      const sd = x < this.peakX + o * W.half ? -1 : 1;
      if (d < 1)
        h = Math.max(
          h,
          W.peak * ph * ((1 - d) ** 1.5 + 0.1 * (1 - d) * Math.sin((1 - d) * (sd > 0 ? 11 : 8) + o * 5) ** 2),
        );
    }
    const rag =
      9 * Math.sin(x * 0.045) + 6 * Math.sin(x * 0.13 + 1) + 3 * Math.sin(x * 0.31) + 2 * Math.sin(x * 0.7);
    return W.footY - h - rag * Math.min(1, h / (W.peak * 0.25));
  }

  private paint(): void {
    const W = WOOD_VISTA;
    const g = this.range;
    const r = prng(LOOK.seed * 17 + 11);
    const px = this.peakX;
    const x0 = px - W.half;
    const x1 = px + W.half;
    // The far range.
    const top: number[] = [];
    for (let x = x0; x <= x1; x += 8) top.push(x, this.ridge(x));
    g.poly([...top, x1, W.footY + 80, x0, W.footY + 80]).fill({ color: W.far });
    // Each peak: its moon side lit, its far side in shadow, split down a ragged spur from its apex; snow from the
    // crest down to a ragged snowline, attached to the ridge (no slivers floating in the air).
    for (const [o, ph, hw] of W.peaks) {
      const cx = px + o * W.half;
      const apexY = W.footY - W.peak * ph;
      const w = hw * W.half;
      // The spur: from the apex down and a little toward the shadow.
      const spur: number[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        spur.push(cx - w * 0.12 * t + 10 * Math.sin(t * 9 + o * 7) * t, apexY + (W.footY - apexY) * t);
      }
      // Shadow: the west face, between the ridge and the spur.
      const shadow: number[] = [];
      for (let x = cx - w; x <= cx; x += 8) shadow.push(x, this.ridge(x));
      for (let k = spur.length / 2 - 1; k >= 0; k--)
        shadow.push(spur[k * 2] as number, spur[k * 2 + 1] as number);
      g.poly(shadow).fill({ color: W.farDark, alpha: 0.55 });
      // Lit: the east face takes the moon, faintly.
      // (Only down to where a nearer shoulder of another peak takes over, and faint: overlapping pale faces read as
      // glass.)
      const lit: number[] = [...spur];
      let xe = cx;
      while (xe < cx + w * 0.8 && this.ridge(xe + 8) >= this.ridge(xe) - 0.5) xe += 8;
      for (let x = xe; x >= cx; x -= 8) lit.push(x, this.ridge(x));
      g.poly(lit).fill({ color: W.farLit, alpha: 0.2 });
      // Snow above the snowline, hugging the ridge.
      if (ph < 0.4) continue;
      const line = apexY + W.peak * ph * (0.32 + 0.08 * Math.sin(o * 11));
      const cap: number[] = [];
      const under: number[] = [];
      for (let x = cx - w; x <= cx + w; x += 8) {
        const y = this.ridge(x);
        if (y > line - 4) continue;
        cap.push(x, y);
        // Ragged: tongues of snow down the gullies, deeper on the lit side.
        const tongue = Math.max(0, Math.sin((x - cx) * 0.07 + o * 5)) * 26 * (x > cx ? 1.4 : 0.6);
        under.push(x, Math.min(line + tongue, y + (line - y) * 0.9 + tongue));
      }
      if (cap.length < 6) continue;
      for (let k = under.length / 2 - 1; k >= 0; k--)
        cap.push(under[k * 2] as number, under[k * 2 + 1] as number);
      g.poly(cap).fill({ color: W.snow, alpha: 0.42 });
      // The shaded half of the snow, bluer.
      const sh: number[] = [];
      for (let x = cx - w; x <= cx; x += 8) {
        const y = this.ridge(x);
        if (y > line - 4) continue;
        sh.push(x, y);
      }
      if (sh.length >= 4) {
        sh.push(cx, apexY + 6, cx - w * 0.06, line);
        g.poly(sh).fill({ color: W.farDark, alpha: 0.45 });
      }
      // Rock ribs down through it.
      for (let k = 0; k < 4; k++) {
        const x = cx + (r() - 0.3) * w * 0.7;
        const y = this.ridge(x) + 4;
        if (y > line) continue;
        const len = (line - y) * (0.5 + r() * 0.6);
        g.poly([x, y, x + 3, y, x + 8 + len * 0.3, y + len, x + 4 + len * 0.3, y + len]).fill({
          color: W.far,
          alpha: 0.75,
        });
      }
    }
    // Haze over its foot (wavering bands, no ruled edges).
    for (let k = 0; k < 6; k++)
      g.poly(band(x0, x1, W.footY - 90 + k * 26, 110, 31 + k)).fill({ color: W.haze, alpha: 0.07 });
    // The valley floor under the lamps (dark, a step lighter than the walls), so the walls have something to meet.
    g.poly(band(x0, x1, W.floorY - 24, 600, 91)).fill({ color: W.near });
    // The valley's walls: dark slopes from either side of the view converging on the mountain's foot.
    for (const side of [-1, 1] as const) {
      const pts: number[] = [];
      const xEdge = side < 0 ? x0 : x1;
      const xIn = px + side * 260;
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const x = lerp(xEdge, xIn, t);
        const y =
          lerp(W.footY - 40, W.floorY + 6, t ** 0.7) +
          (14 * Math.sin(t * 17 + side) + 7 * Math.sin(t * 41)) * (1 - t);
        pts.push(x, y);
      }
      // Firs along its crest, shrinking toward the mountain.
      for (let k = 0; k < pts.length - 2; k += 2) {
        if (r() < 0.35) continue;
        const t = k / pts.length;
        const fx = (pts[k] as number) + (r() - 0.5) * 8;
        const fy = (pts[k + 1] as number) + 3;
        const h = (12 + r() * 22) * (1 - 0.7 * t);
        g.poly([fx - h * 0.22, fy, fx, fy - h, fx + h * 0.22, fy]).fill({ color: W.wall });
      }
      pts.push(xIn + side * 120, W.floorY + 60, xIn, W.floorY + 400, xEdge, W.floorY + 400);
      g.poly(pts).fill({ color: W.wall });
      // Its rim catches the moon on the lit side.
      if (side > 0) g.poly(ribbon(pts.slice(0, 50), 2)).fill({ color: W.ridgeLit, alpha: 0.35 });
    }
    // The river of mist down the valley, narrowing toward the mountain: soft, thicker along its middle (a flat pale
    // quad read as a slab).
    for (let q = 0; q < 4; q++) {
      const river: number[] = [];
      const riverB: number[] = [];
      const wk = 1 - q * 0.22;
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const y = lerp(W.floorY + 260, W.footY + 18, t ** 0.8);
        const x = lerp(px - 420, px - 20, t) + 90 * Math.sin(t * 6.5) * (1 - t);
        const w = lerp(150, 10, t) * wk * (1 + 0.15 * Math.sin(t * 23 + q));
        river.push(x - w, y);
        riverB.push(x + w, y);
      }
      for (let k = riverB.length / 2 - 1; k >= 0; k--)
        river.push(riverB[k * 2] as number, riverB[k * 2 + 1] as number);
      g.poly(river).fill({ color: W.river, alpha: 0.03 });
    }
    // The valley's mist, over the floor where the lamps are.
    for (let k = 0; k < 5; k++)
      g.poly(band(x0, x1, W.floorY - 10 + k * 26, 80, 71 + k)).fill({ color: W.haze, alpha: 0.05 });
    // One nearer lamp tree, halfway down the drop (60% of the size of the wood's), so the drop reads as depth.
    const tx = px - 640;
    const ty = W.floorY + 150;
    const trunk: number[] = [tx - 8, ty, tx - 4, ty - 120, tx - 30, ty - 170, tx + 6, ty - 130, tx + 8, ty];
    g.poly(trunk).fill({ color: W.wall });
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
      const d = 30 + r() * 50;
      g.circle(tx + Math.cos(a) * d * 1.3, ty - 160 + Math.sin(a) * d * 0.6, 26 + r() * 22).fill({
        color: W.wall,
      });
    }
    g.poly([tx + 30, ty - 150, tx + 32, ty - 95, tx + 34, ty - 95, tx + 32, ty - 150]).fill({
      color: W.wall,
    });
    this.lamps.push({ x: tx + 33, y: ty - 88, s: 3.4, ph: 1.3, swarm: 22 });
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
    // The valley's false lights: warm points twinkling (redrawn each frame: cheap), a halo round the near ones, and
    // the moths circling the nearer tiers.
    const f = this.field.clear();
    for (const l of this.lamps) {
      const tw = 0.6 + 0.4 * Math.sin(clock * (0.9 + (l.ph % 1.3)) + l.ph);
      f.circle(l.x, l.y, l.s * 4).fill({ color: W.lamp, alpha: 0.06 * tw * l.s });
      f.circle(l.x, l.y, l.s).fill({ color: W.lampCore, alpha: 0.5 + 0.4 * tw });
      for (let k = 0; k < l.swarm; k++) {
        const a = clock * (0.8 + (k % 5) * 0.17) + k * 2.4 + l.ph;
        const rr = l.s * (4 + (k % 4) * 1.6);
        f.circle(l.x + Math.cos(a) * rr, l.y + Math.sin(a * 1.3) * rr * 0.6, 0.7 + (k % 3) * 0.25).fill({
          color: W.moth,
          alpha: 0.75,
        });
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A band across [x0, x1] at y, h tall, its edges wavering. */
function band(x0: number, x1: number, y: number, h: number, seed: number): number[] {
  const a: number[] = [];
  const b: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 60) {
    a.push(x, y + 10 * Math.sin(x * 0.004 + seed) + 5 * Math.sin(x * 0.013 + seed * 3));
    b.push(x, y + h + 12 * Math.sin(x * 0.0035 + seed * 2) + 5 * Math.sin(x * 0.011 + seed));
  }
  for (let k = b.length / 2 - 1; k >= 0; k--) a.push(b[k * 2] as number, b[k * 2 + 1] as number);
  return a;
}

/** A line of even width `w` (px). */
function ribbon(line: number[], w: number): number[] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < line.length; i += 2) {
    const x = line[i] as number;
    const y = line[i + 1] as number;
    a.push(x, y - w / 2);
    b.push(x, y + w / 2);
  }
  for (let k = b.length / 2 - 1; k >= 0; k--) a.push(b[k * 2] as number, b[k * 2 + 1] as number);
  return a;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
