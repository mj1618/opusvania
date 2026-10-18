/**
 * Depth inside the giant (the hall, the roots, the cache): the near dark at the frame's edges and the air.
 *
 *  - **Foreground** (the `foreground` layer, parallax 1.35): out-of-focus near-black masses at the top and bottom
 *    edges of the frame, locked to the view vertically (as the wood's are) and sliding past faster than the world:
 *    fibre clumps and broken heartwood in the hall, root tangles in the roots. Baked once, blurred, as sprites.
 *    They withdraw from the frame's middle third, so nothing ever crosses her.
 *  - **Motes**: dust hanging in the air, lit where a lamp burns near (warm) or her own light (cool); cold specks in
 *    the roots. Stateless: a pure function of the render clock around the camera.
 *
 * The night layer keeps the wood's foreground and air modules.
 */
import { BlurFilter, Container, Graphics, type Renderer, RenderTexture, Sprite } from 'pixi.js';
import type { CameraView, SimView } from '../contract';
import type { LayerTree } from '../scene/layer-tree';
import { mix, prng } from '../scene/lib/look';
import type { LanternBand } from '../scene/lib/room-look';
import type { GlowPool } from './glow';

export const FORE = {
  /** World px between masses (at the layer's own scale), their size range, blur strength. */
  gap: 1100,
  size: [150, 280] as readonly number[],
  blur: 6,
  /** Near-black tones per band. */
  tone: { hall: 0x0a0605, roots: 0x020407, cache: 0x080504, night: 0x04070a } as Record<LanternBand, number>,
  rim: { hall: 0x3a2214, roots: 0x0e1e28, cache: 0x2e1c10, night: 0x16222e } as Record<LanternBand, number>,
  /** Motes: count, colours, how near (px) a lamp lights them. */
  motes: 90,
  moteWarm: 0xffc890,
  moteCold: 0xbfe0ff,
  litPx: 360,
} as const;

interface Piece {
  s: Sprite;
  /** Layer x, top or bottom edge, how far it reaches into the frame. */
  x: number;
  top: boolean;
  reach: number;
}

export class InteriorDepth {
  private readonly root = new Container({ label: 'lr-fore' });
  private readonly pieces: Piece[] = [];
  private readonly textures: RenderTexture[] = [];

  constructor(
    renderer: Renderer,
    private readonly layers: LayerTree,
    private readonly band: LanternBand,
    roomWidth: number,
    seed: number,
  ) {
    layers.foreground.addChild(this.root);
    const r = prng(seed * 31 + 7);
    // A few shapes, reused: each baked small, blurred once.
    const kinds = 4;
    for (let k = 0; k < kinds * 2; k++) this.textures.push(this.bake(renderer, r, k % 2 === 0, k));
    const span = roomWidth * 1.4 + 2000;
    for (let x = -1000, k = 0; x < span; x += FORE.gap * (0.7 + 0.6 * r()), k++) {
      const top = k % 2 === 0;
      const t = this.textures[(top ? 0 : 1) + 2 * Math.floor(r() * kinds)] as RenderTexture;
      const s = new Sprite(t);
      s.anchor.set(0.5, top ? 0 : 1);
      const sz = (FORE.size[0] as number) + r() * ((FORE.size[1] as number) - (FORE.size[0] as number));
      s.scale.set((sz / t.width) * 2 * (r() < 0.5 ? -1 : 1), (sz / t.width) * 2);
      this.root.addChild(s);
      this.pieces.push({ s, x, top, reach: sz * 0.6 });
    }
  }

  /** One mass: hanging fibre clumps / roots from the top, broken wood / root knees from the bottom. */
  private bake(renderer: Renderer, r: () => number, top: boolean, k: number): RenderTexture {
    const W = 260;
    const H = 260;
    const g = new Graphics();
    const tone = FORE.tone[this.band];
    const rim = FORE.rim[this.band];
    const roots = this.band === 'roots';
    if (top) {
      // From the top edge: strands and tangles hanging down, ragged ends.
      const n = 10 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) {
        const x = W * (0.15 + 0.7 * r());
        const len = H * (0.3 + 0.65 * r());
        const w = roots ? 6 + r() * 14 : 3 + r() * 9;
        const lean = (r() - 0.5) * 60;
        g.poly([
          x - w,
          0,
          x + w,
          0,
          x + lean * 0.6 + w * 0.3,
          len * 0.7,
          x + lean,
          len,
          x + lean * 0.5 - w * 0.3,
          len * 0.75,
        ]).fill(tone);
      }
      g.ellipse(W * 0.5, 0, W * 0.48, H * 0.22).fill(tone);
    } else {
      // From the bottom edge: a knee of wood / root, a broken stump, a fringe.
      g.poly([
        0,
        H,
        W * 0.1,
        H * 0.55,
        W * 0.32,
        H * 0.35,
        W * 0.55,
        H * 0.42,
        W * 0.78,
        H * 0.3,
        W,
        H * 0.6,
        W,
        H,
      ]).fill(tone);
      for (let i = 0; i < 6; i++) {
        const x = W * r();
        const h = H * (0.2 + 0.4 * r());
        g.poly([x - 6, H * 0.6, x + 6, H * 0.6, x + (r() - 0.5) * 20, H * 0.6 - h]).fill(tone);
      }
    }
    // A faint rim of the room's light on the inner edge, so the masses have form (mixed far toward the body).
    g.ellipse(W * 0.5, top ? H * 0.12 : H * 0.5, W * 0.3, H * 0.06).fill({
      color: mix(tone, rim, 0.5),
      alpha: 0.5,
    });
    g.filters = [new BlurFilter({ strength: FORE.blur, quality: 3 })];
    const pad = 24;
    const t = RenderTexture.create({ width: (W + pad * 2) / 2, height: (H + pad * 2) / 2, resolution: 1 });
    const holder = new Container();
    holder.addChild(g);
    g.position.set(pad, pad);
    holder.scale.set(0.5);
    renderer.render({ container: holder, target: t, clear: true });
    holder.destroy({ children: true });
    void k;
    return t;
  }

  update(cam: CameraView, her: { cx: number; cy: number }): void {
    const vis = this.layers.visible('foreground', cam);
    const midX = vis.x + vis.w / 2;
    // Where she is in this layer's coordinates (a world point at parallax 1, seen from a 1.35 layer).
    const a = this.layers.anchor;
    const hx = her.cx + 0.35 * (cam.x - a.x);
    const hy = her.cy + 0.35 * (cam.y - a.y);
    for (const p of this.pieces) {
      // Withdraw from the middle of the frame (full at the side fifths, pulled up / down past the edge in the
      // middle) and from wherever she is near that edge: nothing dark ever crosses her.
      const d = Math.abs(p.x - midX) / (vis.w / 2);
      const nearHer =
        Math.max(0, 1 - Math.abs(p.x - hx) / 520) *
        Math.max(0, 1 - Math.abs((p.top ? vis.y : vis.y + vis.h) - hy) / 460);
      // (Only the outer quarter of each side keeps them: in the middle half they read as smudges on the room.)
      const out = Math.max(Math.max(0, Math.min(1, (0.8 - d) / 0.2)), Math.min(1, nearHer * 2));
      p.s.visible = d < 1.3;
      if (!p.s.visible) continue;
      // (Out all the way: its whole height past the edge, so nothing of it is left in the frame.)
      const pull = out * Math.abs(p.s.height);
      p.s.position.set(p.x, p.top ? vis.y - pull : vis.y + vis.h + pull);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true);
  }
}

/** Dust in the air: lit warm near a burning lamp, cool near her; stateless around the camera. */
export function drawMotes(
  clock: number,
  sim: SimView,
  cam: CameraView,
  band: LanternBand,
  glow: GlowPool,
): void {
  const hw = cam.w / 2 / cam.zoom;
  const hh = cam.h / 2 / cam.zoom;
  const tile = 2 * Math.max(hw, hh) + 200;
  const lures = sim.scene.lures ?? [];
  const p = sim.player;
  for (let k = 0; k < FORE.motes; k++) {
    const a = Math.sin(k * 12.9898) * 43758.5453;
    const b = Math.sin(k * 78.233) * 12345.678;
    const u = a - Math.floor(a);
    const v = b - Math.floor(b);
    const sp = 6 + 10 * u;
    const wx =
      cam.x -
      tile / 2 +
      ((((u * tile + clock * sp + Math.sin(clock * 0.4 + k) * 20 - cam.x) % tile) + tile) % tile);
    const wy =
      cam.y -
      tile / 2 +
      ((((v * tile + Math.sin(clock * 0.3 + k * 1.7) * 30 + clock * (band === 'roots' ? 4 : -3) - cam.y) %
        tile) +
        tile) %
        tile);
    if (Math.abs(wx - cam.x) > hw + 20 || Math.abs(wy - cam.y) > hh + 20) continue;
    // How lit: the nearest burning lamp (warm) or her (cool).
    let warm = 0;
    for (let i = 0; i < lures.length; i++) {
      const l = lures[i];
      if (!l || (sim.lures.hp[i] ?? 0) <= 0) continue;
      const d = Math.hypot(l.x - wx, l.y - wy);
      if (d < FORE.litPx) warm = Math.max(warm, 1 - d / FORE.litPx);
    }
    const near = Math.max(0, 1 - Math.hypot(p.cx - wx, p.cy - wy) / 240);
    const base = band === 'roots' ? 0.06 : 0.04;
    const alpha = base + 0.5 * warm * warm + 0.25 * near;
    if (alpha < 0.03) continue;
    const c = warm > near ? FORE.moteWarm : FORE.moteCold;
    glow.add(wx, wy, 2.5 + 2 * u, c, alpha);
  }
}
