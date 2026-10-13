/**
 * The foreground: big, dark, out-of-focus plants right in front of the lens that frame the shot.
 *
 *   top      boughs and vines hanging in from the top edge
 *   bottom   ferns, grass and broad leaves along the bottom edge
 *   trunks   a leaning trunk framing each end of the scene, and thin lianas hanging through the
 *            full height here and there between them
 *
 * Each plant is drawn once as vectors (lib/fx-foliage.ts), baked at half size into one atlas and
 * blurred there once: that is the whole depth-of-field, and it costs one sprite batch per frame.
 * Per frame the sprites only sway (wind) and fade.
 *
 * COMPOSITION RULES
 * - Heavy masses stay in the top ~15% and bottom ~10% of the frame; only thin vines and frond
 *   tips reach further in. The path through the middle of the frame stays clear.
 * - The layer has parallax 1.35, so it sweeps past faster than the playfield. The top group
 *   would sweep right through the frame when the camera climbs, so it is mostly locked to the
 *   screen vertically (`topLock`): climbing reveals a little more of the boughs instead.
 * - Anything the character is behind turns translucent (`fadeTo`) until it has passed.
 * - Layout is seeded: the same every run, different on every screen of the scene.
 */
import { BlurFilter, Container, Graphics, Matrix, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';
import { VIEW_H } from '../../contract';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { fxDebug } from '../lib/fx-debug';
import { bough, broadLeaves, fern, grass, lianas, trunk, vine } from '../lib/fx-foliage';
import { prng, wind } from '../lib/look';

export const FOREGROUND = {
  seed: 0xf09e,
  /** Atlas px per layer px, and the blur (in atlas px) that makes the plants out of focus. */
  bakeScale: 0.5,
  blur: 2.2,
  /** Trunks are the nearest things of all: baked this much smaller again, so twice as soft. */
  trunkBake: 0.5,
  atlasWidth: 2048,
  /** Overall opacity: a little of the scene glows through, so the frame is deep, not cardboard. */
  alpha: 0.96,
  /** 0..1: how much of the camera's vertical travel the top group ignores. */
  topLock: 0.95,
  /** Sway amplitudes (radians of rotation for hanging things, of skew for growing things). */
  /** The layer fades out between these zooms: in a close-up it would be one giant blur. */
  zoomFade: [1.15, 2] as const,
  swayTop: 0.022,
  swayBottom: 0.05,
  /** Opacity of a plant while the character is behind it, and how fast it gets there (1/s). */
  fadeTo: 0.3,
  fadeRate: 7,
  /**
   * Trunks frame the two ends of the scene: with the camera clamped at an end they sit at the
   * frame edge. Layer x, so: screen x = 960 + x - (anchor.x + (cam.x - anchor.x) * 1.35).
   */
  trunks: [
    { x: -730, width: 230, lean: 150 },
    { x: 6540, width: 250, lean: -170 },
  ],
  /** Lianas hang through the full height here and there (layer x, lean in px). */
  lianas: [
    { x: 2165, lean: -180 },
    { x: 3560, lean: 90 },
    { x: 4932, lean: 220 },
  ],
};

type Group = 'top' | 'bottom' | 'trunk';

interface Piece {
  g: Graphics;
  group: Group;
  x: number;
  y: number;
  phase: number;
  /** Local bounds of the drawing. */
  b: Rectangle;
  sprite?: Sprite;
  fade: number;
  /** Extra reduction when baking: smaller = blurrier (nearer the lens). */
  bake: number;
  /** Trunks only: the shape, to test whether the character is really behind it. */
  trunk?: { width: number; lean: number; height: number };
}

export class ForegroundLayer implements EnvModule {
  private ctx!: SceneContext;
  private readonly top = new Container({ label: 'fg-top' });
  private readonly rest = new Container({ label: 'fg-bottom+trunks' });
  private pieces: Piece[] = [];
  /** Layer y of the frame's top edge when the camera rests on the ground. */
  private groundTop = 0;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const cov = ctx.layers.coverage('foreground');
    const rnd = prng(FOREGROUND.seed);
    const pieces: Piece[] = [];
    const add = (group: Group, x: number, y: number, draw: (g: Graphics) => void): void => {
      const g = new Graphics();
      draw(g);
      const lb = g.getLocalBounds();
      pieces.push({
        g,
        group,
        x,
        y,
        phase: rnd(),
        b: new Rectangle(lb.x, lb.y, lb.width, lb.height),
        fade: 1,
        bake: 1,
      });
    };

    // Top: hanging from just above the frame edge of the ground-level view.
    this.groundTop = ctx.layers.anchor.y - VIEW_H / 2;
    const ty = this.groundTop - 66;
    for (let x = cov.x - 200 + rnd() * 300; x < cov.x + cov.w + 200; x += 400 + rnd() * 420) {
      const r = rnd();
      if (r < 0.42) {
        const dir = rnd() < 0.5 ? -1 : 1;
        add('top', x, ty, (g) => bough(g, rnd, 300 + rnd() * 240, 120 + rnd() * 80, dir));
      } else if (r < 0.66) {
        const n = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          add('top', x + i * (40 + rnd() * 70), ty, (g) => vine(g, rnd, 130 + rnd() * 230));
        }
      } else if (r < 0.82) {
        const dir = rnd() < 0.5 ? -1 : 1;
        add('top', x, ty, (g) => bough(g, rnd, 150 + rnd() * 90, 80 + rnd() * 40, dir));
        add('top', x + dir * 60, ty, (g) => vine(g, rnd, 110 + rnd() * 120));
      }
    }

    // Bottom: growing from just below the frame edge of the ground-level view.
    const by = this.groundTop + VIEW_H + 16;
    for (let x = cov.x - 100 + rnd() * 200; x < cov.x + cov.w + 100; x += 250 + rnd() * 330) {
      const r = rnd();
      if (r < 0.32) add('bottom', x, by, (g) => fern(g, rnd, 130 + rnd() * 80));
      else if (r < 0.56) add('bottom', x, by, (g) => grass(g, rnd, 150 + rnd() * 130, 170 + rnd() * 110));
      else if (r < 0.74) add('bottom', x, by, (g) => broadLeaves(g, rnd, 130 + rnd() * 70));
      else if (r < 0.9) {
        add('bottom', x, by, (g) => grass(g, rnd, 120 + rnd() * 80, 220));
        add('bottom', x + 70, by + 6, (g) => fern(g, rnd, 120 + rnd() * 60));
      }
    }

    for (const t of FOREGROUND.trunks) {
      add('trunk', t.x, cov.y - 60, (g) => trunk(g, rnd, t.width, cov.h + 160, t.lean));
      const piece = pieces[pieces.length - 1] as Piece;
      piece.trunk = { width: t.width, lean: t.lean, height: cov.h + 160 };
      piece.bake = FOREGROUND.trunkBake;
    }

    for (const l of FOREGROUND.lianas) {
      add('trunk', l.x, cov.y - 60, (g) => lianas(g, rnd, cov.h + 120, l.lean));
    }

    this.pieces = pieces;
    this.bake();
    fxDebug('foreground', FOREGROUND);
    fxDebug('layers', ctx.layers);
    ctx.layers.foreground.addChild(this.rest, this.top);
    ctx.layers.foreground.alpha = FOREGROUND.alpha;
  }

  /** Draws every piece into one atlas at reduced size, blurs it once, and makes the sprites. */
  private bake(): void {
    const { bakeScale: s, blur, atlasWidth } = FOREGROUND;
    const pad = Math.ceil(blur * 2.5) + 2;
    const renderer = this.ctx.renderer;
    const max = Math.min(
      4096,
      (renderer as unknown as { texture?: { maxTextureSize?: number } }).texture?.maxTextureSize ?? 4096,
    );

    // Shelf packing, tallest first.
    const cells = this.pieces
      .map((p) => {
        const k = s * p.bake;
        return {
          p,
          k,
          w: Math.ceil(p.b.width * k) + pad * 2,
          h: Math.ceil(p.b.height * k) + pad * 2,
          x: 0,
          y: 0,
        };
      })
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
    const height = Math.min(max, cy + shelf);

    const raw = RenderTexture.create({ width: atlasWidth, height, resolution: 1, antialias: true });
    let first = true;
    for (const c of cells) {
      if (c.y + c.h > height) continue;
      renderer.render({
        container: c.p.g,
        target: raw,
        clear: first,
        clearColor: [0, 0, 0, 0],
        transform: new Matrix(c.k, 0, 0, c.k, c.x + pad - c.p.b.x * c.k, c.y + pad - c.p.b.y * c.k),
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
      sprite.anchor.set((pad - p.b.x * c.k) / c.w, (pad - p.b.y * c.k) / c.h);
      sprite.scale.set(1 / c.k);
      sprite.position.set(p.x, p.y);
      p.sprite = sprite;
      (p.group === 'top' ? this.top : this.rest).addChild(sprite);
    }
  }

  update(frame: SceneFrame): void {
    const layers = this.ctx.layers;
    const cam = frame.camera;
    const vis = layers.visible('foreground', cam);
    const f = layers.parallax('foreground');
    // How far the view has climbed from the ground-level view, in layer px.
    const climbed = this.groundTop - (layers.anchor.y + (cam.y - layers.anchor.y) * f - VIEW_H / 2);
    const topShift = -climbed * FOREGROUND.topLock;
    this.top.y = topShift;
    const [z0, z1] = FOREGROUND.zoomFade;
    const zoomed = Math.min(1, Math.max(0, (cam.zoom - z0) / (z1 - z0)));
    layers.foreground.alpha = FOREGROUND.alpha * (1 - zoomed);
    layers.foreground.visible = zoomed < 1;

    // The character in this layer's coordinates (it is drawn at parallax 1).
    const p = frame.sim.player;
    const px = vis.x + vis.w / 2 + (p.cx - cam.x);
    const py = vis.y + vis.h / 2 + (p.cy - cam.y);
    const k = Math.min(1, frame.dt * FOREGROUND.fadeRate);

    for (const piece of this.pieces) {
      const s = piece.sprite;
      if (!s) continue;
      const oy = piece.group === 'top' ? topShift : 0;
      const x0 = piece.x + piece.b.x;
      const y0 = piece.y + piece.b.y + oy;
      if (
        x0 > vis.x + vis.w + 60 ||
        x0 + piece.b.width < vis.x - 60 ||
        y0 > vis.y + vis.h + 60 ||
        y0 + piece.b.height < vis.y - 60
      ) {
        s.visible = false;
        piece.fade = 1;
        continue;
      }
      s.visible = true;
      const w = wind(piece.x, frame.clock, piece.phase);
      if (piece.group === 'top') s.rotation = w * FOREGROUND.swayTop;
      else if (piece.group === 'bottom') s.skew.x = -w * FOREGROUND.swayBottom;

      if (piece.group === 'top' || piece.trunk) {
        const mx = 44;
        const my = 64;
        const t = piece.trunk;
        const behind = t
          ? Math.abs(px - (piece.x + t.lean * ((py - piece.y) / t.height - 0.5))) < t.width * 0.5 + mx
          : px > x0 - mx && px < x0 + piece.b.width + mx && py > y0 - my && py < y0 + piece.b.height + my;
        piece.fade += ((behind ? FOREGROUND.fadeTo : 1) - piece.fade) * k;
        s.alpha = piece.fade;
      }
    }
  }
}
