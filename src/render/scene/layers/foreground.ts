/**
 * The foreground: out-of-focus foliage right in front of the lens that frames the shot.
 *
 * Two depth planes, both inside `layers.foreground`:
 *   near  parallax 1.35  big boughs from the top, big ferns and leaves from the bottom, a trunk
 *                        at each end of the scene. Darkest, blurriest.
 *   far   parallax 1.15  a low fringe of sprigs and short vines along the top, grass, small ferns
 *                        and a few flowers along the bottom. Deep green, only slightly soft.
 *
 * Each plant is drawn once as vectors (lib/fx-foliage.ts), baked at half size into its plane's
 * atlas and blurred there once: that is the whole depth-of-field, and it costs two sprite batches
 * per frame. Per frame the sprites only move, sway (wind) and fade.
 *
 * COMPOSITION RULES
 * - The middle of the frame belongs to the game. Every plant knows where it is on screen: in the
 *   side fifths of the frame it hangs or grows to its full size, and as the camera carries it
 *   toward the centre it withdraws past the frame edge (`retract`), so the masses are always in
 *   the corners and only a low fringe runs along the top and bottom in between.
 * - The top plants would sweep right through the frame when the camera climbs (parallax > 1), so
 *   they are mostly locked to the screen vertically (`topLock`).
 * - Anything the character is behind turns translucent (`fadeTo`) until it has passed.
 * - Layout is seeded: the same every run, different on every screen of the scene.
 */
import { BlurFilter, Container, Graphics, Matrix, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../../contract';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { fxDebug } from '../lib/fx-debug';
import {
  archRoot,
  bladeArc,
  broadLeaves,
  frond,
  leafBranch,
  toadstools,
  trunk,
  withPlane,
} from '../lib/fx-foliage';
import { zoneWeights } from '../lib/fx-zones';
import { PALETTE, prng, wind } from '../lib/look';

export const FOREGROUND = {
  seed: 0xf09e,
  /** Atlas px per layer px. */
  bakeScale: 0.5,
  atlasWidth: 2048,
  /** Per plane: parallax, blur in atlas px (x2 on screen), opacity. */
  near: { parallax: 1.35, blur: 2.2, alpha: 1 },
  far: { parallax: 1.15, blur: 1.3, alpha: 1 },
  /** Height of the bottom band's plants, px (5-8% of the frame once they stand in it). */
  band: 92,
  /**
   * The near plane's bottom plants: their size range, px. At full size they stand 250-350 px into
   * the frame, across the lit lip of the earth and the mist on the walk line, in the side thirds.
   */
  nearSize: [300, 410] as const,
  /**
   * The corner opposite the main bottom mass is not left empty: plants there come out this much
   * (0 = the old strict diagonal, 1 = both sides alike).
   */
  bottomOther: 0.85,
  /** `clear` / `full` for the bottom plants: out by the side thirds, gone from the middle third. */
  bottomClear: 0.13,
  bottomFull: 0.25,
  /** A middle tier on the far plane, on both sides of the frame: size range and spacing, px. */
  tier: { size: [170, 250] as const, every: [230, 360] as const },
  /** Camera x over which the corner pair swaps from top-left + bottom-right to its mirror. */
  mirrorAt: [2500, 3300] as const,
  /**
   * ...and back again over these camera x: at the east clamp (4800) the far lantern stands in the
   * frame's top right with the heart under it, the scene's last picture, and a leaf mass hung over it.
   */
  mirrorBack: [4150, 4650] as const,
  /**
   * Where on screen a plant is at full size: `full` and beyond (distance of its middle from the
   * frame centre, in frame widths) it is fully out; at `clear` and nearer the centre it is fully
   * withdrawn.
   */
  clear: 0.1,
  full: 0.27,
  /** 0..1: how much of the camera's vertical travel the top plants ignore. */
  topLock: 0.95,
  /**
   * The bottom plants are pinned to the frame's bottom edge while the camera is within this many
   * px above its ground-level rest (terraces, small hops): with true parallax a 130 px step up
   * dropped them 175 px, out of sight. Above that they sink away at their plane's parallax.
   */
  bottomFree: 330,
  /**
   * Bottom plants frame; they never stand on the walk line. Each one sinks until its top is this
   * many px under the lowest ground within `walkReach` px of the playfield span it is in front of
   * (its whole width; smoothed over `walkEase` px so it sinks and rises as the camera travels, never
   * pops). Pinned to the frame edge with the camera up on the bluff, they covered the terrace and
   * its creature. (`walkReach` was 250 from the plant's middle, which the wide ones outgrew.)
   */
  walkClear: 12,
  walkReach: 150,
  walkEase: 180,
  /**
   * Sunk under the walk line the bottom plants are near-black on near-black earth: they frame
   * nothing. A breath of the zone's haze lies behind them in the two bottom corners (in front of the
   * playfield's earth, behind both planes), so their silhouettes read again. It is a veil, not a
   * light: `alpha` in the very corner, nothing by `reach` px along the bottom edge, and its top
   * stays `clear` px under the lowest walk line it spans (at most `rise` px tall), fading out over
   * its upper `soft` share, so it never touches the walk line, a creature, a landing or a pickup.
   * `colors`: left, centre, right zone.
   */
  /**
   * ...and their lit edges are this much stronger than the top plants' (near, far): under the walk
   * line there is no bright backdrop to be a silhouette against, so the edge light is what draws them.
   */
  bottomRim: { near: 3, far: 2.3 },
  haze: {
    alpha: 0.6,
    reach: 820,
    rise: 300,
    clear: 20,
    soft: 0.5,
    colors: [0x1d5068, 0x33492c, 0x3b2c68] as const,
  },
  /**
   * On the high route the frame is canopy already: the near top plants pull back by this much of
   * their height and thin to this opacity when the camera is at its highest.
   */
  highRetract: 0,
  highAlpha: 1,
  /**
   * The floating islands are a road (the ember hangs over the third): no top plant hangs over one,
   * over the air a body's height above it (`above` px: where she stands, where a flier dives) or over
   * the arc between two neighbours. A plant whose box reaches `soft` px into such a rect is fully
   * withdrawn above the frame. It is a function of the camera alone, so it slides, never pops.
   */
  keep: { above: 190, side: 36, below: 40, soft: 70, arcGap: 420 },
  /** Sway amplitudes (radians of rotation for hanging things, of skew for growing things). */
  swayTop: 0.022,
  swayBottom: 0.045,
  /** Opacity of a plant while the character is behind it, and how fast it gets there (1/s). */
  fadeTo: 0.3,
  fadeRate: 7,
  /** The layer fades out between these zooms: in a close-up it would be one giant blur. */
  zoomFade: [1.15, 2] as const,
  /**
   * Trunks at the two ends of the scene (near-plane x: screen x = 960 + x - (anchor.x + (cam.x -
   * anchor.x) * 1.35)). None now: as opaque black they were a flat slab over the last 90 px of the
   * frame at the camera clamp and hid the far ledge with the hero on it (were x -730 / 6540).
   */
  trunks: [] as Array<{ x: number; width: number; lean: number }>,
  flowerColors: [PALETTE.glowViolet, PALETTE.glowCyan, PALETTE.keyGold, 0xff9fc2] as const,
};

const WALK_STEP = 16;
const HAZE_W = 128;
const HAZE_H = 64;

let hazeTex: Texture | null = null;

/**
 * The corner veil: white, densest in the bottom-left corner, easing to nothing toward the right
 * edge and over the upper `haze.soft` of its height. Mirrored for the right corner.
 */
function hazeTexture(): Texture {
  if (hazeTex) return hazeTex;
  const canvas = document.createElement('canvas');
  canvas.width = HAZE_W;
  canvas.height = HAZE_H;
  const c2 = canvas.getContext('2d');
  if (c2) {
    const img = c2.createImageData(HAZE_W, HAZE_H);
    for (let y = 0; y < HAZE_H; y++) {
      const v = Math.min(1, y / (HAZE_H - 1) / FOREGROUND.haze.soft);
      const up = v * v * (3 - 2 * v);
      for (let x = 0; x < HAZE_W; x++) {
        const u = x / (HAZE_W - 1);
        const along = (Math.cos(u * Math.PI) * 0.5 + 0.5) ** 1.3;
        const k = (y * HAZE_W + x) * 4;
        // Premultiplied white.
        const a = Math.round(255 * along * up);
        img.data[k] = 255;
        img.data[k + 1] = 255;
        img.data[k + 2] = 255;
        img.data[k + 3] = a;
      }
    }
    c2.putImageData(img, 0, 0);
  }
  hazeTex = Texture.from(canvas);
  return hazeTex;
}

type Plane = 'near' | 'far';
type Edge = 'top' | 'bottom' | 'trunk';

interface Piece {
  g: Graphics;
  plane: Plane;
  edge: Edge;
  x: number;
  y: number;
  phase: number;
  /** How far it withdraws (px, away from the frame) when it is in the middle of the screen. */
  retract: number;
  /** Local bounds of the drawing. */
  b: Rectangle;
  sprite?: Sprite;
  fade: number;
  /** Trunks only: the shape, to test whether the character is really behind it. */
  trunk?: { width: number; lean: number; height: number };
}

export class ForegroundLayer implements EnvModule {
  private ctx!: SceneContext;
  private readonly planes: Record<Plane, Container> = {
    far: new Container({ label: 'fg-far' }),
    near: new Container({ label: 'fg-near' }),
  };
  private pieces: Piece[] = [];
  /** Layer y of the frame's top edge when the camera rests on the ground. */
  private groundTop = 0;
  /** The lowest walk line near each `WALK_STEP` px of world x (see `walkClear`). */
  private walkLow = new Float32Array(0);
  /** The corner veils behind the bottom plants (`FOREGROUND.haze`): left, right. */
  private haze: Sprite[] = [];
  /** Playfield rects [x0, y0, x1, y1] the top plants keep out of (`FOREGROUND.keep`). */
  private keep: Array<[number, number, number, number]> = [];

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    {
      const kp = FOREGROUND.keep;
      const isles = ctx.scene.solids.filter((s) => s.tag === 'floating').sort((a, b) => a.x - b.x);
      this.keep = isles.map((s) => [s.x - kp.side, s.y - kp.above, s.x + s.w + kp.side, s.y + kp.below]);
      for (let i = 0; i + 1 < isles.length; i++) {
        const a = isles[i] as (typeof isles)[number];
        const b = isles[i + 1] as (typeof isles)[number];
        if (b.x - (a.x + a.w) < kp.arcGap)
          this.keep.push([a.x + a.w - 20, Math.min(a.y, b.y) - kp.above, b.x + 20, Math.max(a.y, b.y)]);
      }
    }
    const rnd = prng(FOREGROUND.seed);
    const pieces: Piece[] = [];
    const anchor = ctx.layers.anchor;
    const add = (
      plane: Plane,
      edge: Edge,
      x: number,
      y: number,
      retract: number,
      draw: (g: Graphics) => void,
    ): Piece => {
      const g = new Graphics();
      withPlane(plane === 'far', () => draw(g), edge === 'bottom' ? FOREGROUND.bottomRim[plane] : 1);
      const lb = g.getLocalBounds();
      const piece: Piece = {
        g,
        plane,
        edge,
        x,
        y,
        retract,
        phase: rnd(),
        b: new Rectangle(lb.x, lb.y, lb.width, lb.height),
        fade: 1,
      };
      pieces.push(piece);
      return piece;
    };
    /** The x range a plane must cover: what the follow camera can show at that parallax. */
    const span = (parallax: number): [number, number] => {
      const reach = (ctx.scene.width / 2 - VIEW_W / 2) * parallax + VIEW_W / 2;
      return [anchor.x - reach - 300, anchor.x + reach + 300];
    };

    // Both planes agree with the playfield at the anchor, so these two lines are the frame's
    // top and bottom edge for a camera resting on the ground, in either plane.
    this.groundTop = anchor.y - VIEW_H / 2;
    const top = this.groundTop;
    const bottom = this.groundTop + VIEW_H;

    // Near, top: big leafy boughs that fill a corner.
    const [n0, n1] = span(FOREGROUND.near.parallax);
    for (let x = n0 + rnd() * 300; x < n1; x += 250 + rnd() * 170) {
      const dir = rnd() < 0.5 ? -1 : 1;
      const drop = 330 + rnd() * 130;
      add('near', 'top', x, top - 40, drop + 200, (g) => leafBranch(g, rnd, 520 + rnd() * 260, drop, dir));
    }
    // Near, bottom: one big designed silhouette per spot (never the same kind twice running).
    const [s0, s1] = FOREGROUND.nearSize;
    let last = -1;
    for (let x = n0 + rnd() * 300; x < n1; x += 190 + rnd() * 110) {
      let kind = Math.floor(rnd() * 5);
      if (kind === last) kind = (kind + 1 + Math.floor(rnd() * 4)) % 5;
      last = kind;
      const size = s0 + rnd() * (s1 - s0);
      const dir = rnd() < 0.5 ? -1 : 1;
      const out = size * 1.25;
      if (kind === 0) add('near', 'bottom', x, bottom + 26, out, (g) => frond(g, rnd, size * 1.1, dir));
      else if (kind === 1)
        add('near', 'bottom', x, bottom + 24, out, (g) => broadLeaves(g, rnd, size * 0.95));
      else if (kind === 2) add('near', 'bottom', x, bottom + 22, out, (g) => bladeArc(g, rnd, size * 1.15));
      else if (kind === 3) add('near', 'bottom', x, bottom + 24, out, (g) => toadstools(g, rnd, size * 0.8));
      else add('near', 'bottom', x, bottom + 30, out, (g) => archRoot(g, rnd, size * 0.72, dir));
    }
    for (const t of FOREGROUND.trunks) {
      const height = (VIEW_H / 2) * 2 + (ctx.scene.height - VIEW_H) * FOREGROUND.near.parallax + 400;
      const y0 = anchor.y - (anchor.y - VIEW_H / 2) * FOREGROUND.near.parallax - VIEW_H / 2 - 120;
      add('near', 'trunk', t.x, y0, 0, (g) => trunk(g, rnd, t.width, height, t.lean)).trunk = {
        width: t.width,
        lean: t.lean,
        height,
      };
    }

    // Far, bottom: the low band that closes the frame, 5-8% of its height, everywhere: grass arcs,
    // small fronds and broad leaves shoulder to shoulder. It never withdraws.
    const [f0, f1] = span(FOREGROUND.far.parallax);
    for (let x = f0 + rnd() * 120; x < f1; x += 70 + rnd() * 70) {
      const r = rnd();
      const dir = rnd() < 0.5 ? -1 : 1;
      const size = FOREGROUND.band * (0.75 + rnd() * 0.55);
      if (r < 0.45) add('far', 'bottom', x, bottom + 16, 0, (g) => bladeArc(g, rnd, size * 1.15));
      else if (r < 0.8) add('far', 'bottom', x, bottom + 18, 0, (g) => frond(g, rnd, size, dir));
      else add('far', 'bottom', x, bottom + 18, 0, (g) => broadLeaves(g, rnd, size * 1.1));
    }

    // Far, bottom, middle tier: a taller plant now and then, out on both sides of the frame and
    // withdrawn in the middle, so the near masses have something between them and the band.
    const tier = FOREGROUND.tier;
    for (let x = f0 + rnd() * 300; x < f1; x += tier.every[0] + rnd() * (tier.every[1] - tier.every[0])) {
      const r = rnd();
      const dir = rnd() < 0.5 ? -1 : 1;
      const size = tier.size[0] + rnd() * (tier.size[1] - tier.size[0]);
      if (r < 0.4) add('far', 'bottom', x, bottom + 18, size * 1.2, (g) => frond(g, rnd, size, dir));
      else if (r < 0.7) add('far', 'bottom', x, bottom + 16, size * 1.2, (g) => bladeArc(g, rnd, size * 1.1));
      else add('far', 'bottom', x, bottom + 18, size * 1.2, (g) => toadstools(g, rnd, size * 0.75));
    }

    // The lowest ground near every x: a running maximum of the ground profile (y grows downward)
    // over reach + ease, then a triangle blur over the ease, which can only leave it at or below the
    // true lowest line within `walkReach`.
    {
      // The line she walks: the ground rects, and in the pool its FLOOR (she wades there; the mist's
      // `GroundProfile` gives the water surface, and plants stood in the pool up to it).
      const floors = ctx.scene.solids.filter((s) => s.tag === 'ground' || s.tag === 'pool');
      const n = Math.ceil(ctx.scene.width / WALK_STEP) + 1;
      const raw = Float32Array.from({ length: n }, (_, i) => {
        const x = i * WALK_STEP;
        let y = 0;
        for (const s of floors) if (x >= s.x - WALK_STEP && x <= s.x + s.w + WALK_STEP) y = Math.max(y, s.y);
        return y || ctx.scene.height;
      });
      const at = (a: Float32Array, i: number): number => a[Math.min(n - 1, Math.max(0, i))] as number;
      const eb = Math.max(1, Math.round(FOREGROUND.walkEase / WALK_STEP));
      const rb = Math.round(FOREGROUND.walkReach / WALK_STEP) + eb;
      const low = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let k = -rb; k <= rb; k++) m = Math.max(m, at(raw, i + k));
        low[i] = m;
      }
      this.walkLow = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        let w = 0;
        for (let k = -eb; k <= eb; k++) {
          const wk = eb + 1 - Math.abs(k);
          sum += at(low, i + k) * wk;
          w += wk;
        }
        this.walkLow[i] = sum / w;
      }
    }

    this.pieces = pieces;
    for (const plane of ['far', 'near'] as const) {
      this.bake(
        pieces.filter((p) => p.plane === plane),
        FOREGROUND[plane].blur,
        this.planes[plane],
      );
      this.planes[plane].alpha = FOREGROUND[plane].alpha;
    }
    this.haze = [0, 1].map(() => {
      const h = new Sprite(hazeTexture());
      h.anchor.set(0, 1);
      h.label = 'fg-haze';
      return h;
    });
    ctx.layers.foreground.addChild(...this.haze, this.planes.far, this.planes.near);
    fxDebug('foreground', FOREGROUND);
    fxDebug('layers', ctx.layers);
  }

  /** Draws the pieces into one atlas at reduced size, blurs it once, and makes the sprites. */
  private bake(pieces: Piece[], blur: number, parent: Container): void {
    const { bakeScale: k, atlasWidth } = FOREGROUND;
    const pad = Math.ceil(blur * 2.5) + 2;
    const renderer = this.ctx.renderer;

    // Shelf packing, tallest first.
    const cells = pieces
      .map((p) => ({
        p,
        w: Math.ceil(p.b.width * k) + pad * 2,
        h: Math.ceil(p.b.height * k) + pad * 2,
        x: 0,
        y: 0,
      }))
      .sort((a, b) => b.h - a.h);
    let cx = 0;
    let cy = 0;
    let shelf = 0;
    for (const c of cells) {
      if (cx + c.w > atlasWidth) {
        cx = 0;
        cy += shelf;
        shelf = 0;
      }
      c.x = cx;
      c.y = cy;
      cx += c.w;
      shelf = Math.max(shelf, c.h);
    }
    const height = Math.min(4096, cy + shelf);

    const raw = RenderTexture.create({ width: atlasWidth, height, resolution: 1, antialias: true });
    let first = true;
    for (const c of cells) {
      if (c.y + c.h > height) continue;
      renderer.render({
        container: c.p.g,
        target: raw,
        clear: first,
        clearColor: [0, 0, 0, 0],
        transform: new Matrix(k, 0, 0, k, c.x + pad - c.p.b.x * k, c.y + pad - c.p.b.y * k),
      });
      first = false;
    }

    const atlas = RenderTexture.create({ width: atlasWidth, height, resolution: 1, scaleMode: 'linear' });
    const soft = new Sprite(raw);
    soft.filters = [new BlurFilter({ strength: blur, quality: 4, resolution: 1 })];
    const holder = new Container();
    holder.addChild(soft);
    // Twice over itself: the blur keeps its soft edge but the body of every shape stays opaque.
    const again = new Sprite(raw);
    again.filters = [new BlurFilter({ strength: blur, quality: 4, resolution: 1 })];
    holder.addChild(again);
    renderer.render({ container: holder, target: atlas, clear: true, clearColor: [0, 0, 0, 0] });
    holder.destroy({ children: true });
    raw.destroy(true);

    for (const c of cells) {
      const p = c.p;
      p.g.destroy();
      if (c.y + c.h > height) continue;
      const sprite = new Sprite(
        new Texture({ source: atlas.source, frame: new Rectangle(c.x, c.y, c.w, c.h) }),
      );
      sprite.anchor.set((pad - p.b.x * k) / c.w, (pad - p.b.y * k) / c.h);
      sprite.scale.set(1 / k);
      p.sprite = sprite;
      parent.addChild(sprite);
    }
  }

  private walkLowAt(x: number): number {
    const a = this.walkLow;
    const f = Math.min(a.length - 1, Math.max(0, x / WALK_STEP));
    const i = Math.min(a.length - 2, Math.floor(f));
    return (a[i] as number) + ((a[i + 1] as number) - (a[i] as number)) * (f - i);
  }

  update(frame: SceneFrame): void {
    const layers = this.ctx.layers;
    const cam = frame.camera;
    const cfg = FOREGROUND;
    const [z0, z1] = cfg.zoomFade;
    const zoomed = Math.min(1, Math.max(0, (cam.zoom - z0) / (z1 - z0)));
    layers.foreground.alpha = 1 - zoomed;
    layers.foreground.visible = zoomed < 1;
    if (zoomed >= 1) return;

    // The layer itself is placed at the near plane's parallax; `vis` is what it shows.
    const vis = layers.visible('foreground', cam);
    const anchor = layers.anchor;
    const f = layers.parallax('foreground');
    // The character in near-plane coordinates (it is drawn at parallax 1).
    const p = frame.sim.player;
    const px = vis.x + vis.w / 2 + (p.cx - cam.x);
    const py = vis.y + vis.h / 2 + (p.cy - cam.y);
    const k = Math.min(1, frame.dt * cfg.fadeRate);
    const mt = Math.min(1, Math.max(0, (cam.x - cfg.mirrorAt[0]) / (cfg.mirrorAt[1] - cfg.mirrorAt[0])));
    const bt = Math.min(
      1,
      Math.max(0, (cam.x - cfg.mirrorBack[0]) / (cfg.mirrorBack[1] - cfg.mirrorBack[0])),
    );
    const mirror = mt * mt * (3 - 2 * mt) * (1 - bt * bt * (3 - 2 * bt));
    // 0 on the ground, 1 with the camera at the top of the scene.
    const high = Math.min(1, Math.max(0, (anchor.y - cam.y) / Math.max(1, anchor.y - VIEW_H / 2)));

    // The corner veils: from each bottom corner along the bottom edge, as tall as the room under
    // the lowest walk line they lie in front of.
    {
      const hz = cfg.haze;
      const w = zoneWeights(cam.x);
      let tint = 0;
      for (let c = 0; c < 3; c++) {
        const sh = 16 - c * 8;
        let v = 0;
        for (let z = 0; z < 3; z++) v += (((hz.colors[z] as number) >> sh) & 255) * (w[z] as number);
        tint |= Math.round(v) << sh;
      }
      const bottomY = vis.y + vis.h;
      for (let i = 0; i < 2; i++) {
        const h = this.haze[i] as Sprite;
        const dir = i ? -1 : 1;
        // The lowest line (largest y) under its span, at parallax 1 (screen x = world x - cam.x).
        let line = 0;
        for (let q = 0; q <= 8; q++) {
          const wx = cam.x - dir * (vis.w / 2) + dir * (q / 8) * hz.reach;
          line = Math.max(line, this.walkLowAt(wx));
        }
        const room = Math.min(hz.rise, bottomY - (vis.y + vis.h / 2 + (line - cam.y)) - hz.clear);
        h.visible = room > 24;
        if (!h.visible) continue;
        h.position.set(i ? vis.x + vis.w : vis.x, bottomY);
        h.scale.set((dir * hz.reach) / HAZE_W, room / HAZE_H);
        h.tint = tint;
        h.alpha = hz.alpha * Math.min(1, (room - 24) / 120);
      }
    }

    const rise = anchor.y - cam.y;
    for (const piece of this.pieces) {
      const s = piece.sprite;
      if (!s) continue;
      // A plane with another parallax is the same layer slid by the difference.
      const par = cfg[piece.plane].parallax;
      const sx = (cam.x - anchor.x) * (f - par);
      const sy = (cam.y - anchor.y) * (f - par);
      // How far this plane's view has climbed from the ground-level view: top plants ride along.
      const climbed = (anchor.y - cam.y) * par;
      const lock = piece.edge === 'top' ? -climbed * cfg.topLock : 0;

      // Where the plant's middle is across the frame: 0 = centre, 0.5 = the frame's edge.
      const mid = piece.x + sx + piece.b.x + piece.b.width / 2;
      // Mass sits in two opposite corners: top-left with bottom-right, or the mirror of that,
      // swapping (smoothly, with the camera) along the scene.
      const across = (mid - (vis.x + vis.w / 2)) / vis.w;
      const lo = piece.edge === 'bottom' ? cfg.bottomClear : cfg.clear;
      const hi = piece.edge === 'bottom' ? cfg.bottomFull : cfg.full;
      const side = (s0: number): number => {
        const t = Math.min(1, Math.max(0, (across * s0 - lo) / (hi - lo)));
        return t * t * (3 - 2 * t);
      };
      const out =
        piece.edge === 'trunk'
          ? 1
          : piece.edge === 'top'
            ? side(-1) * (1 - mirror) + side(1) * mirror
            : piece.plane === 'far'
              ? Math.max(side(1), side(-1))
              : Math.max(
                  side(1) * (1 - mirror) + side(-1) * mirror,
                  (side(-1) * (1 - mirror) + side(1) * mirror) * cfg.bottomOther,
                );
      let away = piece.retract * (1 - out) * (piece.edge === 'top' ? -1 : 1);
      let thin = 1;
      if (piece.edge === 'top' && piece.plane === 'near') {
        away -= piece.b.height * cfg.highRetract * high * out;
        thin = 1 + (cfg.highAlpha - 1) * high;
      }

      const x = piece.x + sx;
      let y =
        piece.edge === 'bottom'
          ? vis.y +
            vis.h +
            (piece.y - this.groundTop - VIEW_H) +
            away +
            Math.max(0, rise - cfg.bottomFree) * par
          : piece.y + sy + lock + away;
      if (piece.edge === 'bottom') {
        // The walk line of the playfield behind this plant, in this layer's coordinates.
        // The lowest one under the plant's whole width, not just its middle: the big near plants are
        // wider than twice `walkReach`, and their flanks stood in the pool at the frame's edge.
        let low = 0;
        for (let q = 0; q <= 6; q++) {
          const lx = piece.x + sx + piece.b.x + (piece.b.width * q) / 6;
          low = Math.max(low, this.walkLowAt(cam.x + lx - (vis.x + vis.w / 2)));
        }
        const line = vis.y + vis.h / 2 + (low - cam.y);
        // (A line far under the frame's bottom edge has nothing on it to hide: let go of it.)
        const under = Math.min(1, Math.max(0, (line - (vis.y + vis.h) - 80) / 140));
        y += Math.max(0, line + cfg.walkClear - (y + piece.b.y)) * (1 - under * under * (3 - 2 * under));
      }
      const x0 = x + piece.b.x;
      let y0 = y + piece.b.y;
      if (piece.edge === 'top') {
        // Its box in playfield px (parallax 1: the offset from the view's centre is the world's).
        const wx = cam.x + (x0 - (vis.x + vis.w / 2));
        const wy = cam.y + (y0 - (vis.y + vis.h / 2));
        let over = 0;
        for (const [ka, kb, kc, kd] of this.keep) {
          const ox = Math.min(kc, wx + piece.b.width) - Math.max(ka, wx);
          const oy = Math.min(kd, wy + piece.b.height) - Math.max(kb, wy);
          if (ox > 0 && oy > 0) over = Math.max(over, Math.min(1, Math.min(ox, oy) / cfg.keep.soft));
        }
        if (over > 0) {
          const o = over * over * (3 - 2 * over);
          y -= (piece.b.height + 60) * o;
          y0 = y + piece.b.y;
          thin *= 1 - o;
        }
      }
      if (
        x0 > vis.x + vis.w + 80 ||
        x0 + piece.b.width < vis.x - 80 ||
        y0 > vis.y + vis.h + 80 ||
        y0 + piece.b.height < vis.y - 80
      ) {
        s.visible = false;
        piece.fade = 1;
        continue;
      }
      s.visible = true;
      s.position.set(x, y);
      const w = wind(piece.x, frame.clock, piece.phase);
      if (piece.edge === 'top') s.rotation = w * cfg.swayTop;
      else if (piece.edge === 'bottom') s.skew.x = -w * cfg.swayBottom;

      const mx = 30;
      const my = 40;
      const tr = piece.trunk;
      const behind = tr
        ? Math.abs(px - (x + tr.lean * ((py - y) / tr.height - 0.5))) < tr.width * 0.5 + mx
        : px > x0 - mx && px < x0 + piece.b.width + mx && py > y0 - my && py < y0 + piece.b.height + my;
      piece.fade += ((behind ? cfg.fadeTo : 1) - piece.fade) * k;
      s.alpha = piece.fade * thin;
    }
  }
}
