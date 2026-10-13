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
  bough,
  broadLeaves,
  fern,
  flowerCluster,
  flowers,
  grass,
  leafBranch,
  trunk,
  vine,
  withPlane,
} from '../lib/fx-foliage';
import { PALETTE, prng, wind } from '../lib/look';

export const FOREGROUND = {
  seed: 0xf09e,
  /** Atlas px per layer px. */
  bakeScale: 0.5,
  atlasWidth: 2048,
  /** Per plane: parallax, blur in atlas px (x2 on screen), opacity. */
  near: { parallax: 1.35, blur: 1.5, alpha: 0.97 },
  far: { parallax: 1.15, blur: 0.9, alpha: 1 },
  /**
   * Where on screen a plant is at full size: `full` and beyond (distance of its middle from the
   * frame centre, in frame widths) it is fully out; at `clear` and nearer the centre it is fully
   * withdrawn.
   */
  clear: 0.2,
  full: 0.37,
  /** 0..1: how much of the camera's vertical travel the top plants ignore. */
  topLock: 0.95,
  /**
   * On the high route the frame is canopy already: the near top plants pull back by this much of
   * their height and thin to this opacity when the camera is at its highest.
   */
  highRetract: 0.55,
  highAlpha: 0.7,
  /** Sway amplitudes (radians of rotation for hanging things, of skew for growing things). */
  swayTop: 0.022,
  swayBottom: 0.045,
  /** Opacity of a plant while the character is behind it, and how fast it gets there (1/s). */
  fadeTo: 0.3,
  fadeRate: 7,
  /** The layer fades out between these zooms: in a close-up it would be one giant blur. */
  zoomFade: [1.15, 2] as const,
  /**
   * Trunks frame the two ends of the scene: with the camera clamped at an end they sit at the
   * frame edge. Near-plane x: screen x = 960 + x - (anchor.x + (cam.x - anchor.x) * 1.35).
   */
  trunks: [
    { x: -730, width: 230, lean: 150 },
    { x: 6540, width: 250, lean: -170 },
  ],
  flowerColors: [PALETTE.glowViolet, PALETTE.glowCyan, PALETTE.keyGold, 0xff9fc2] as const,
};

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

  init(ctx: SceneContext): void {
    this.ctx = ctx;
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
      withPlane(plane === 'far', () => draw(g));
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

    // Near, top: big boughs reaching a third of the way down. Seen whole only in the corners.
    const [n0, n1] = span(FOREGROUND.near.parallax);
    for (let x = n0 + rnd() * 300; x < n1; x += 520 + rnd() * 360) {
      const dir = rnd() < 0.5 ? -1 : 1;
      const drop = 240 + rnd() * 90;
      add('near', 'top', x, top - 40, drop + 170, (g) => leafBranch(g, rnd, 360 + rnd() * 200, drop, dir));
      if (rnd() < 0.4) {
        const color = FOREGROUND.flowerColors[Math.floor(rnd() * FOREGROUND.flowerColors.length)] as number;
        add('near', 'top', x - dir * 110, top - 30, 330, (g) =>
          flowerCluster(g, rnd, 190 + rnd() * 110, color),
        );
      }
    }
    // Near, bottom: big ferns and broad leaves rising a quarter of the way up.
    for (let x = n0 + rnd() * 300; x < n1; x += 400 + rnd() * 320) {
      const r = rnd();
      const size = 200 + rnd() * 90;
      if (r < 0.5) add('near', 'bottom', x, bottom + 24, size * 1.05, (g) => fern(g, rnd, size));
      else if (r < 0.8)
        add('near', 'bottom', x, bottom + 24, size * 1.05, (g) => broadLeaves(g, rnd, size * 0.9));
      else add('near', 'bottom', x, bottom + 20, size * 1.2, (g) => grass(g, rnd, size * 1.15, 260));
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

    // Far, top: a low fringe of sprigs and short vines.
    const [f0, f1] = span(FOREGROUND.far.parallax);
    for (let x = f0 + rnd() * 200; x < f1; x += 300 + rnd() * 300) {
      const r = rnd();
      const dir = rnd() < 0.5 ? -1 : 1;
      if (r < 0.55) {
        const drop = 90 + rnd() * 60;
        add('far', 'top', x, top - 46, drop * 0.3, (g) => bough(g, rnd, 170 + rnd() * 120, drop, dir));
      } else if (r < 0.85) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const len = 110 + rnd() * 150;
          add('far', 'top', x + i * (36 + rnd() * 50), top - 30, len * 0.55, (g) => vine(g, rnd, len));
        }
      }
    }
    // Far, bottom: grass, small ferns, a flower here and there.
    for (let x = f0 + rnd() * 200; x < f1; x += 230 + rnd() * 250) {
      const r = rnd();
      if (r < 0.36) {
        const size = 120 + rnd() * 70;
        add('far', 'bottom', x, bottom + 14, size * 0.45, (g) => grass(g, rnd, size, 150 + rnd() * 110));
      } else if (r < 0.62) {
        const size = 110 + rnd() * 60;
        add('far', 'bottom', x, bottom + 16, size * 0.45, (g) => fern(g, rnd, size));
      } else if (r < 0.78) {
        const size = 110 + rnd() * 50;
        add('far', 'bottom', x, bottom + 16, size * 0.4, (g) => broadLeaves(g, rnd, size));
      } else if (r < 0.93) {
        const size = 130 + rnd() * 70;
        const color = FOREGROUND.flowerColors[Math.floor(rnd() * FOREGROUND.flowerColors.length)] as number;
        add('far', 'bottom', x, bottom + 14, size * 0.4, (g) => grass(g, rnd, size * 0.7, 130));
        add('far', 'bottom', x + 20, bottom + 14, size * 0.35, (g) => flowers(g, rnd, size, color));
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
    ctx.layers.foreground.addChild(this.planes.far, this.planes.near);
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
    // 0 on the ground, 1 with the camera at the top of the scene.
    const high = Math.min(1, Math.max(0, (anchor.y - cam.y) / Math.max(1, anchor.y - VIEW_H / 2)));

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
      const across = Math.abs(mid - (vis.x + vis.w / 2)) / vis.w;
      const t = Math.min(1, Math.max(0, (across - cfg.clear) / (cfg.full - cfg.clear)));
      const out = t * t * (3 - 2 * t);
      let away = piece.retract * (1 - out) * (piece.edge === 'top' ? -1 : 1);
      let thin = 1;
      if (piece.edge === 'top' && piece.plane === 'near') {
        away -= piece.b.height * cfg.highRetract * high * out;
        thin = 1 + (cfg.highAlpha - 1) * high;
      }

      const x = piece.x + sx;
      const y = piece.y + sy + lock + away;
      const x0 = x + piece.b.x;
      const y0 = y + piece.b.y;
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
