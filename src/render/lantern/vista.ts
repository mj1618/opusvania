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
  /** Review r5 #8: one opaque range at three depths (far pale, mid, near dark with firs), the valley as hill bands
   *  receding upward, nearer darker. */
  far: 0x2a4262,
  farLit: 0x3e5a80,
  farDark: 0x1e3250,
  mid: 0x1a2b42,
  midLit: 0x2e4666,
  /** The valley's hill bands, far to near: their crest heights (screen y) and colours. */
  hillY: [800, 852, 912, 990] as readonly number[],
  hills: [0x18273a, 0x132032, 0x0e1826, 0x09111b] as readonly number[],
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
    // (Review r5 #8: the lamp clusters sit on the hills: each lamp is set on the crest of the band in front of it.)
    for (const l of this.lamps) {
      const k = (W.hillY as number[]).findIndex((hy) => hy >= l.y - 10);
      const band = k < 0 ? W.hillY.length - 1 : Math.max(0, k - 1);
      if (l.y > W.footY + 40) l.y = this.hillTop(band, l.x) + 3 + ((l.ph * 7) % 1) * 10;
    }
    this.paint();
  }

  /** The range's top at screen x (layer px): the sharper of its peaks, ragged. */
  private ridge(x: number): number {
    const W = WOOD_VISTA;
    // (Review r5 #8: five separate triangles on a horizon. One range: a high shared base the peaks rise out of, saddles
    // between them where their skirts meet, the base falling away toward the range's ends.)
    const end = Math.max(0, 1 - Math.abs(x - this.peakX) / (W.half * 0.95)) ** 0.6;
    let h = W.peak * (0.24 + 0.06 * Math.sin(x * 0.006) + 0.03 * Math.sin(x * 0.017)) * end;
    let second = 0;
    for (const [o, ph, hw] of W.peaks) {
      const d = Math.abs(x - (this.peakX + o * W.half)) / (hw * W.half * 1.7);
      // (Concave flanks with shoulders and notches down them: straight sides read as paper triangles.)
      const sd = x < this.peakX + o * W.half ? -1 : 1;
      if (d < 1) {
        const v =
          W.peak * ph * ((1 - d) ** 1.9 + 0.08 * (1 - d) * Math.sin((1 - d) * (sd > 0 ? 11 : 8) + o * 5) ** 2);
        if (v > h) {
          second = h;
          h = v;
        } else second = Math.max(second, v);
      }
    }
    // Where two skirts meet, the saddle fills in (a soft max): the peaks share one body.
    h += 0.35 * second * Math.max(0, 1 - (h - second) / (W.peak * 0.25));
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
    // The far range: one opaque body (pale: far), its faces opaque too (overlapping see-through faces read as glass).
    const top: number[] = [];
    for (let x = x0; x <= x1; x += 8) top.push(x, this.ridge(x));
    g.poly([...top, x1, W.footY + 120, x0, W.footY + 120]).fill({ color: W.far });
    // Each peak, lowest first (a taller one's faces lie over a lower one's): the shadow face west of a spur from its
    // apex, the moon face east of it, both clipped to where this peak is the range's top.
    const order = [...W.peaks].sort((p0, p1) => p0[1] - p1[1]);
    for (const [o, ph, hw] of order) {
      const cx = px + o * W.half;
      const apexY = W.footY - W.peak * ph;
      const w = hw * W.half * 1.7;
      const own = (x: number) => Math.abs(this.ridge(x) - (W.footY - this.peakH(x, o, ph, hw))) < 2;
      let xa = cx;
      while (xa > cx - w && own(xa - 8)) xa -= 8;
      let xb = cx;
      while (xb < cx + w && own(xb + 8)) xb += 8;
      const spur: number[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        spur.push(cx - w * 0.1 * t + 8 * Math.sin(t * 9 + o * 7) * t, apexY + (W.footY + 60 - apexY) * t);
      }
      // (The faces close on a slant from the saddle to the spur's foot: closed square, they read as blocks.)
      const shadow: number[] = [];
      for (let x = xa; x <= cx; x += 8) shadow.push(x, this.ridge(x));
      for (let k = spur.length / 2 - 1; k >= 0; k--) shadow.push(spur[k * 2] as number, spur[k * 2 + 1] as number);
      g.poly(shadow).fill({ color: W.farDark });
      const lit: number[] = [...spur];
      for (let x = xb; x >= cx; x -= 8) lit.push(x, this.ridge(x));
      g.poly(lit).fill({ color: mix(W.far, W.farLit, 0.55) });
      // Gullies down the lit face, darker, tapering (the face is rock, not a plane).
      for (let k = 0; k < 2; k++) {
        const gx = cx + (k + 0.5 + r() * 0.3) * (xb - cx) * 0.3;
        const gy = this.ridge(gx) + 8;
        const len = (W.footY - gy) * (0.25 + r() * 0.3);
        const bend = len * (0.12 + r() * 0.12);
        g.poly([gx, gy, gx + 5, gy + len * 0.1, gx + 3 + bend, gy + len, gx + 1 + bend * 0.8, gy + len * 0.6]).fill({
          color: W.farDark,
          alpha: 0.6,
        });
      }
      // Snow above the snowline, hugging the ridge.
      if (ph < 0.4) continue;
      const line = apexY + W.peak * ph * (0.3 + 0.08 * Math.sin(o * 11));
      const cap: number[] = [];
      const under: number[] = [];
      for (let x = xa; x <= xb; x += 8) {
        const y = this.ridge(x);
        if (y > line - 4) continue;
        cap.push(x, y);
        const tongue = Math.max(0, Math.sin((x - cx) * 0.07 + o * 5)) * 26 * (x > cx ? 1.4 : 0.6);
        under.push(x, Math.min(line + tongue, y + (line - y) * 0.9 + tongue));
      }
      if (cap.length < 6) continue;
      for (let k = under.length / 2 - 1; k >= 0; k--) cap.push(under[k * 2] as number, under[k * 2 + 1] as number);
      g.poly(cap).fill({ color: mix(W.far, W.snow, 0.72) });
      const sh: number[] = [];
      for (let x = xa; x <= cx; x += 8) {
        const y = this.ridge(x);
        if (y > line - 4) continue;
        sh.push(x, y);
      }
      if (sh.length >= 4) {
        sh.push(cx, apexY + 6, cx - w * 0.05, line);
        g.poly(sh).fill({ color: mix(W.farDark, W.snow, 0.32) });
      }
    }
    // Haze over its foot: a soft gradient (wavering bands), the range sinking into the valley's air.
    for (let k = 0; k < 10; k++)
      g.poly(band(x0, x1, W.footY - 120 + k * 16, 220 - k * 12, 31 + k)).fill({ color: W.haze, alpha: 0.05 });
    // The mid range: a nearer, lower ridge across the whole width, darker and more saturated, its moon side rimmed.
    const midTop: number[] = [];
    for (let x = x0 - 400; x <= x1 + 400; x += 10) midTop.push(x, this.midRidge(x));
    g.poly([...midTop, x1 + 400, W.footY + 300, x0 - 400, W.footY + 300]).fill({ color: W.mid });
    g.poly(ribbon(midTop, 2.5)).fill({ color: W.midLit, alpha: 0.5 });
    // Its folds: shaded spurs running down from its knolls.
    for (let x = x0 - 300; x < x1 + 300; x += 140 + r() * 160) {
      const y = this.midRidge(x);
      const len = 40 + r() * 60;
      g.poly([x, y + 2, x + 6, y + 2, x - 20 + len * 0.4, y + len, x - 30 + len * 0.4, y + len]).fill({
        color: mix(W.mid, W.hills[0] as number, 0.6),
        alpha: 0.9,
      });
    }
    // The valley: hill bands receding upward, each darker as it comes nearer, mist lying in the fold behind each,
    // firs on the crests.
    W.hillY.forEach((_, k) => {
      // The mist in the fold behind this band (a soft gradient, never a flat quad).
      const y0 = this.hillTop(k, px) - 30;
      for (let q = 0; q < 6; q++)
        g.poly(band(x0 - 400, x1 + 400, y0 - 10 + q * 7, 46 - q * 5, 51 + k * 7 + q)).fill({
          color: W.haze,
          alpha: 0.05 + 0.015 * (3 - k),
        });
      const crest: number[] = [];
      for (let x = x0 - 400; x <= x1 + 400; x += 10) crest.push(x, this.hillTop(k, x));
      const col = W.hills[k] as number;
      g.poly([...crest, x1 + 400, 1600, x0 - 400, 1600]).fill({ color: col });
      // Firs on the crest: tiered silhouettes, larger nearer, in clumps with gaps.
      // (Tiny even firs along a far crest read as a fence: none on the farthest, clumps with wide gaps on the rest.)
      const fh = [0, 11, 19, 30][k] as number;
      for (let x = x0 - 380; fh > 0 && x < x1 + 380; x += fh * (0.5 + r() * 0.8)) {
        if (Math.sin(x * 0.0031 + k * 2) + 0.5 * Math.sin(x * 0.011 + k) < 0.1) continue;
        const y = this.hillTop(k, x) + 2;
        fir(g, x, y, fh * (0.7 + r() * 0.7), col);
      }
      // The moon catches the nearer crests faintly.
      if (k >= 2) g.poly(ribbon(crest, 1.6)).fill({ color: W.ridgeLit, alpha: 0.25 });
    });
    // One nearer lamp tree on the nearest band (review r5 #8: a black disc on a stick): a trunk forking into three
    // limbs, an irregular crown of leaf clumps, the lamp hung on a thread from a limb, its moths.
    const tx = px - 640;
    const ty = this.hillTop(3, tx) + 6;
    const wall = W.hills[3] as number;
    g.poly([tx - 11, ty, tx - 6, ty - 70, tx - 9, ty - 120, tx + 3, ty - 122, tx + 7, ty - 70, tx + 12, ty]).fill({
      color: wall,
    });
    const limbs: Array<[number, number]> = [];
    for (const [ax, ay, ex, ey, w0] of [
      [0, -110, -64, -176, 7],
      [0, -116, 10, -206, 7],
      [2, -104, 76, -160, 6],
    ] as const) {
      g.poly(ribbonTaper([tx + ax, ty + ay, tx + (ax + ex) / 2 + 6, ty + (ay + ey) / 2 - 8, tx + ex, ty + ey], w0)).fill({
        color: wall,
      });
      limbs.push([tx + ex, ty + ey]);
    }
    for (const [lx, ly] of limbs)
      for (let k = 0; k < 6; k++) {
        const cxl = lx + (r() - 0.5) * 70;
        const cyl = ly - 10 + (r() - 0.6) * 36;
        g.poly(lobed(cxl, cyl, 22 + r() * 18, 14 + r() * 10, k * 7 + 3)).fill({ color: wall });
      }
    // The lamp hangs from the east limb on a thread.
    const [hx, hy] = limbs[2] as [number, number];
    const lampY = hy + 46;
    g.poly([hx - 6, hy + 4, hx - 5, lampY - 4, hx - 4, lampY - 4, hx - 5, hy + 4]).fill({ color: wall });
    this.lamps.push({ x: hx - 4.5, y: lampY + 2, s: 3.4, ph: 1.3, swarm: 22 });
  }

  /** The height of one peak's contribution at x (see `ridge`). */
  private peakH(x: number, o: number, ph: number, hw: number): number {
    const W = WOOD_VISTA;
    const d = Math.abs(x - (this.peakX + o * W.half)) / (hw * W.half * 1.7);
    if (d >= 1) return 0;
    const sd = x < this.peakX + o * W.half ? -1 : 1;
    const v = W.peak * ph * ((1 - d) ** 1.9 + 0.08 * (1 - d) * Math.sin((1 - d) * (sd > 0 ? 11 : 8) + o * 5) ** 2);
    const rag =
      9 * Math.sin(x * 0.045) + 6 * Math.sin(x * 0.13 + 1) + 3 * Math.sin(x * 0.31) + 2 * Math.sin(x * 0.7);
    return v + rag * Math.min(1, v / (W.peak * 0.25));
  }

  /** The mid range's top at x: low knolls rolling across the whole width under the range. */
  private midRidge(x: number): number {
    const W = WOOD_VISTA;
    return (
      W.footY -
      40 -
      34 * Math.sin(x * 0.0021 + 1.3) ** 2 -
      18 * Math.sin(x * 0.0057 + 0.4) -
      6 * Math.sin(x * 0.019) -
      3 * Math.sin(x * 0.05)
    );
  }

  /** The crest of hill band k (0 far .. 3 near) at x. */
  private hillTop(k: number, x: number): number {
    const W = WOOD_VISTA;
    const a = [10, 16, 26, 40][k] as number;
    return (
      (W.hillY[k] as number) +
      a * Math.sin(x * (0.0024 - k * 0.0003) + k * 1.7) +
      a * 0.4 * Math.sin(x * 0.0071 + k) +
      a * 0.12 * Math.sin(x * 0.027 + k * 3)
    );
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

/** A fir: a stem and three or four tiers of drooping boughs, narrowing up. */
function fir(g: Graphics, x: number, y: number, h: number, color: number): void {
  const pts: number[] = [x - h * 0.05, y];
  const tiers = h > 18 ? 4 : 3;
  const L: number[] = [];
  const R: number[] = [];
  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers;
    const t1 = (k + 0.85) / tiers;
    const w = h * 0.3 * (1 - t0 * 0.75);
    L.push(x - w, y - h * t0 - h * 0.05, x - w * 0.35, y - h * t1);
    R.push(x + w, y - h * t0 - h * 0.05, x + w * 0.35, y - h * t1);
  }
  for (let k = 0; k < L.length; k += 2) pts.push(L[k] as number, L[k + 1] as number);
  pts.push(x, y - h);
  for (let k = R.length - 2; k >= 0; k -= 2) pts.push(R[k] as number, R[k + 1] as number);
  pts.push(x + h * 0.05, y);
  g.poly(pts).fill({ color });
}

/** A lumpy clump (a crown's leaf mass): an ellipse with lobes round it. */
function lobed(cx: number, cy: number, rx: number, ry: number, seed: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const q = 1 + 0.16 * Math.sin(a * 5 + seed) + 0.08 * Math.sin(a * 11 + seed * 2);
    pts.push(cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q);
  }
  return pts;
}

/** A line that tapers from `w0` to a third of it. */
function ribbonTaper(line: number[], w0: number): number[] {
  const a: number[] = [];
  const b: number[] = [];
  const n = line.length / 2;
  for (let i = 0; i < n; i++) {
    const x = line[i * 2] as number;
    const y = line[i * 2 + 1] as number;
    const j = Math.min(n - 1, i + 1);
    const k = Math.max(0, i - 1);
    const dx = (line[j * 2] as number) - (line[k * 2] as number);
    const dy = (line[j * 2 + 1] as number) - (line[k * 2 + 1] as number);
    const d = Math.hypot(dx, dy) || 1;
    const w = (w0 * (1 - (i / Math.max(1, n - 1)) * 0.66)) / 2;
    a.push(x - (dy / d) * w, y + (dx / d) * w);
    b.push(x + (dy / d) * w, y - (dx / d) * w);
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
