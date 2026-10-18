/**
 * Lanternroot's backdrop inside the giant (the hall, the roots, the cache): replaces the sky, far and mid
 * modules for those bands (scene/index.ts). Composition and looks: lib/lr-back.ts.
 *
 *   sky    the dark of the hollow, a flat gradient over the whole view (any window shape)
 *   far2   the far inner wall (or the far roots), baked and lit by the atmosphere pass, its mist drifting
 *   mid    nearer columns, curtains, webs (or near roots)
 *   live   behind every burning lamp the wall glows warm (behind a moonwick, silver): put a lamp out and
 *          its patch of wall goes dark, so the hall shows what she has done; the moon cracks shimmer
 *
 * Reads only: the room, `sim.lures`. Never writes the sim.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { destroyTree } from '../../lifecycle';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { bakeLayer, coverRect, LayerView, softTexture } from '../lib/bg-bake';
import { TO_LIGHT } from '../lib/bg-shapes';
import { mix } from '../lib/look';
import {
  buildLanternFar,
  buildLanternMid,
  type Crack,
  LR_BACK,
  lanternAtm,
  lanternFog,
  lanternZone,
} from '../lib/lr-back';
import { LOOK } from '../lib/room-look';

type Band = 'hall' | 'roots' | 'cache';

interface Pool {
  i: number;
  far: Sprite;
  mid: Sprite;
  level: number;
  cool: boolean;
}

export class LanternBackLayer implements EnvModule {
  private ctx!: SceneContext;
  private band: Band = 'hall';
  private readonly sky = new Graphics();
  private skyKey = '';
  private far: LayerView | null = null;
  private mid: LayerView | null = null;
  private readonly pools: Pool[] = [];
  private readonly cracks: Array<{ c: Crack; s: Sprite; phase: number }> = [];
  /** Off-tree things to free with the room. */
  private readonly extra = new Container();

  destroy(): void {
    destroyTree(this.extra);
  }

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.band = (LOOK.band === 'night' ? 'hall' : (LOOK.band ?? 'hall')) as Band;
    const band = this.band;
    const room = ctx.scene;
    ctx.layers.sky.addChild(this.sky);
    // The floor line the composition hangs from: the camera's lowest resting view.
    const floorY = room.height - 160;
    const seed = LOOK.seed;

    const farRect = coverRect(ctx.layers, 'far2', 80);
    const farLayer = ctx.layers.far[2];
    const fb = buildLanternFar(band, farRect, floorY, seed);
    const farScale = Math.min(LR_BACK.scale.far, 4000 / farRect.h);
    const farTiles = bakeLayer(
      ctx.renderer,
      fb.content,
      farRect,
      farScale,
      lanternAtm(band, 'far', farRect),
      TO_LIGHT,
      fb.lights,
      0,
    );
    fb.content.destroy({ children: true, context: true });
    this.far = new LayerView(
      farTiles,
      lanternFog(band, 'far', farRect),
      { amp: 0, y0: farRect.y - 2000, y1: farRect.y - 1999 },
      { ...lanternZone(band, 0.42), anchorX: ctx.layers.anchor.x },
      undefined,
      { breath: 0, shimmer: 0, openings: 0.06 },
    );
    farLayer?.addChild(this.far.container);

    const midRect = coverRect(ctx.layers, 'mid', 60);
    const mb = buildLanternMid(band, midRect, floorY, seed);
    const midScale = Math.min(LR_BACK.scale.mid, 4000 / midRect.h);
    const midTiles = bakeLayer(
      ctx.renderer,
      mb.content,
      midRect,
      midScale,
      lanternAtm(band, 'mid', midRect),
      TO_LIGHT,
      mb.lights,
      0,
    );
    mb.content.destroy({ children: true, context: true });
    this.mid = new LayerView(
      midTiles,
      lanternFog(band, 'mid', midRect),
      { amp: band === 'roots' ? 0 : 1.2, y0: midRect.y + 200, y1: midRect.y + 600 },
      { ...lanternZone(band, 0.68), anchorX: ctx.layers.anchor.x },
      undefined,
      { breath: band === 'roots' ? 0 : 3, shimmer: 0, openings: 0 },
    );
    ctx.layers.mid.addChild(this.mid.container);

    // Light pooled on the wall behind each lamp (live: it goes when the lamp goes).
    const tex = softTexture();
    const poolFar = new Container({ label: 'lr-pools-far' });
    const poolMid = new Container({ label: 'lr-pools-mid' });
    farLayer?.addChild(poolFar);
    ctx.layers.mid.addChild(poolMid);
    (room.lures ?? []).forEach((l, i) => {
      const cool = (l.kind as string) === 'moonwick';
      const mk = (parent: Container, r: number): Sprite => {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.setSize(r * 2, r * 1.6);
        s.tint = cool ? LR_BACK.pool.cool : LR_BACK.pool.warm;
        s.blendMode = 'add';
        s.alpha = 0;
        parent.addChild(s);
        return s;
      };
      this.pools.push({
        i,
        far: mk(poolFar, LR_BACK.pool.far),
        mid: mk(poolMid, LR_BACK.pool.mid),
        level: -1,
        cool,
      });
    });
    for (const c of fb.cracks) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.position.set(c.x, c.y + c.len / 2);
      s.setSize(90, c.len * 1.3);
      s.tint = 0xa8c4ec;
      s.blendMode = 'add';
      s.alpha = 0.2;
      poolFar.addChild(s);
      this.cracks.push({ c, s, phase: c.x * 0.013 });
    }
  }

  update(frame: SceneFrame): void {
    this.drawSky();
    const { camera, clock, sim } = frame;
    const anchor = this.ctx.layers.anchor;
    this.far?.update(clock, camera.x, camera.y, anchor.y);
    this.mid?.update(clock, camera.x, camera.y, anchor.y);
    const lures = sim.scene.lures ?? [];
    const k = 1 - Math.exp(-frame.dt * 3);
    for (const p of this.pools) {
      const l = lures[p.i];
      if (!l) continue;
      const hp = sim.lures.hp[p.i] ?? 0;
      // A moonwick's light is only there while it burns (read loosely: the sim may name its state otherwise).
      const on = hp > 0 ? 1 : 0;
      p.level = p.level < 0 ? on : p.level + (on - p.level) * k;
      const flick = p.cool
        ? 1
        : 0.9 + 0.06 * Math.sin(clock * 7.3 + p.i) + 0.04 * Math.sin(clock * 13.1 + p.i * 2);
      // Where the wall behind the lamp is in each layer from this camera (layer x = px - (1 - f)(cam - anchor)).
      const at = (s: Sprite, f: number, a: number): void => {
        s.position.set(l.x - (1 - f) * (camera.x - anchor.x), l.y - (1 - f) * (camera.y - anchor.y));
        s.alpha = a * p.level * flick;
      };
      at(p.far, 0.42, LR_BACK.pool.farAlpha);
      at(p.mid, 0.68, LR_BACK.pool.midAlpha);
    }
    for (const c of this.cracks) {
      c.s.alpha = 0.16 + 0.06 * Math.sin(clock * 0.6 + c.phase) + 0.03 * Math.sin(clock * 2.1 + c.phase * 3);
    }
  }

  private drawSky(): void {
    const v = this.ctx.view();
    const key = `${v.left},${v.top},${v.w},${v.h}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const [top, bottom] = LR_BACK.sky[this.band];
    const g = this.sky.clear();
    const bands = 24;
    const bh = v.h / bands;
    for (let i = 0; i < bands; i++)
      g.rect(v.left, v.top + i * bh, v.w, bh + 1).fill({ color: mix(top, bottom, i / (bands - 1)) });
  }
}
