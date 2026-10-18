/**
 * Lanternroot's backdrop inside the giant (the hall, the roots, the cache): replaces the sky, far and mid
 * modules for those bands (scene/index.ts). Composition and looks: lib/lr-back.ts.
 *
 *   sky     the hollow's air, a gradient over the whole view (any window shape) with a warm glowing band
 *   far0/1  the hollow going on past sight (hall, roots): the far wall and its ribs in the haze, far lamps
 *   far2    the great ribs standing out from the wall (the cache: its rings round the firefly's lamp)
 *   mid     near-dark pillars, the vault's lobes, curtains, webs (or near roots)
 *   live    far lamps twinkle; behind every burning lamp the wall glows warm (behind a moonwick, silver): put
 *           a lamp out and its patch of wall goes dark; silver lies on the backdrop behind each moon-hole's
 *           shaft; the moon cracks shimmer
 *
 * Reads only: the room, `sim.lures`. Never writes the sim.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { destroyTree } from '../../lifecycle';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import type { LayerName } from '../layer-tree';
import { bakeLayer, coverRect, LayerView, softTexture } from '../lib/bg-bake';
import { TO_LIGHT } from '../lib/bg-shapes';
import { mix, prng } from '../lib/look';
import {
  buildLanternDeep,
  buildLanternFar,
  buildLanternMid,
  type Crack,
  ceilFloor,
  type FarLamp,
  floorAt,
  LR_BACK,
  lanternAtm,
  lanternFog,
  lanternZone,
  moonHoles,
  type Placer,
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

const SIZE: Record<string, number> = {
  lantern: 50,
  great: 96,
  greatWide: 96,
  gloam: 96,
  ring: 44,
  moonwick: 26,
};

export class LanternBackLayer implements EnvModule {
  private ctx!: SceneContext;
  private band: Band = 'hall';
  private readonly sky = new Graphics();
  private skyKey = '';
  private readonly views: Array<{ v: LayerView; f: number }> = [];
  private readonly pools: Pool[] = [];
  private readonly twinkle: Array<{ s: Sprite; a: number; ph: number }> = [];
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
    const P: Placer = {
      room,
      anchor: ctx.layers.anchor,
      lamps: (room.lures ?? [])
        .filter((l) => (l.kind as string) !== 'moonwick')
        .map((l) => ({ x: l.x, y: l.y, size: SIZE[l.kind as string] ?? 38 })),
      holes: moonHoles(room),
      ...ceilFloor(room),
    };
    const tex = softTexture();
    const bake = (
      name: LayerName,
      parent: Container | undefined,
      which: 'deep0' | 'deep1' | 'far' | 'mid',
      f: number,
      pad: number,
      scale: number,
      build: (rect: ReturnType<typeof coverRect>) => {
        content: Container;
        lights: ReturnType<typeof buildLanternMid>['lights'];
        lamps?: FarLamp[];
        cracks?: Crack[];
      },
    ): void => {
      if (!parent) return;
      const rect = coverRect(ctx.layers, name, pad);
      const b = build(rect);
      const s = Math.min(scale, 4000 / rect.h);
      const tiles = bakeLayer(
        ctx.renderer,
        b.content,
        rect,
        s,
        lanternAtm(band, which, rect),
        TO_LIGHT,
        b.lights,
        0,
      );
      b.content.destroy({ children: true, context: true });
      const v = new LayerView(
        tiles,
        lanternFog(band, which, rect),
        which === 'mid' && band !== 'roots'
          ? { amp: 1.2, y0: rect.y + 200, y1: rect.y + 600 }
          : { amp: 0, y0: rect.y - 2000, y1: rect.y - 1999 },
        { ...lanternZone(band, f), anchorX: ctx.layers.anchor.x },
        undefined,
        {
          breath: which === 'mid' && band !== 'roots' ? 3 : 0,
          shimmer: 0,
          openings: which === 'far' ? 0.06 : 0,
        },
      );
      parent.addChild(v.container);
      this.views.push({ v, f });
      // Far lamps (or glowworms, the cache's jars): live, so they twinkle.
      const lampTint = band === 'roots' ? 0x9ff3ff : 0xffb468;
      for (const l of b.lamps ?? []) {
        const glow = new Sprite(tex);
        glow.anchor.set(0.5);
        glow.position.set(l.x, l.y);
        glow.setSize(l.s * 9, l.s * 9);
        glow.tint = lampTint;
        glow.blendMode = 'add';
        glow.alpha = 0.22;
        const core = new Sprite(tex);
        core.anchor.set(0.5);
        core.position.set(l.x, l.y);
        core.setSize(l.s * 1.6, l.s * 2);
        core.tint = band === 'roots' ? 0xdffcff : 0xffe2b0;
        core.blendMode = 'add';
        core.alpha = LR_BACK.farLamp.alpha;
        parent.addChild(glow, core);
        this.twinkle.push({ s: glow, a: 0.22, ph: l.ph }, { s: core, a: LR_BACK.farLamp.alpha, ph: l.ph });
      }
      for (const c of b.cracks ?? []) {
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.position.set(c.x, c.y + c.len / 2);
        sp.setSize(80, c.len * 1.3);
        sp.tint = 0xa8c4ec;
        sp.blendMode = 'add';
        sp.alpha = 0.2;
        parent.addChild(sp);
        this.cracks.push({ c, s: sp, phase: c.x * 0.013 });
      }
    };

    const deep = band !== 'cache';
    if (deep) {
      bake('far0', ctx.layers.far[0], 'deep0', 0.12, 60, LR_BACK.scale.deep, (rect) =>
        buildLanternDeep(band, 0, rect, floorY, seed, P),
      );
      bake('far1', ctx.layers.far[1], 'deep1', 0.25, 60, LR_BACK.scale.deep, (rect) =>
        buildLanternDeep(band, 1, rect, floorY, seed, P),
      );
    }
    const farLayer = ctx.layers.far[2];
    bake('far2', farLayer, 'far', 0.42, 80, LR_BACK.scale.far, (rect) =>
      buildLanternFar(band, rect, floorY, seed, P),
    );
    bake('mid', ctx.layers.mid, 'mid', 0.68, 60, LR_BACK.scale.mid, (rect) =>
      buildLanternMid(band, rect, floorY, seed, P),
    );

    // Light pooled on the wall behind each lamp (live: it goes when the lamp goes).
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
    // (Silver on the backdrop behind each moon-hole's shaft: lantern/moonlight.ts, which knows when a hole is open.)
    // The roots: a pale band of mist low behind the play, so dark shapes and her silhouette read against it.
    if (band === 'roots') {
      for (const [parent, f, a] of [
        [ctx.layers.far[1], 0.25, LR_BACK.mist.far],
        [farLayer, 0.42, LR_BACK.mist.mid],
      ] as const) {
        if (!parent) continue;
        const rect = coverRect(ctx.layers, f === 0.25 ? 'far1' : 'far2', 80);
        const y = floorAt(P, f) - LR_BACK.mist.lift;
        for (let x = rect.x; x < rect.x + rect.w; x += 700) {
          const s = new Sprite(tex);
          s.anchor.set(0.5);
          s.position.set(x + 350, y);
          s.setSize(1300, LR_BACK.mist.h);
          s.tint = LR_BACK.mist.color;
          s.blendMode = 'add';
          s.alpha = a;
          parent.addChild(s);
        }
      }
    }
    // The roots: thin shafts of moonlight down through cracks in the plate above, far off.
    if (band === 'roots') {
      const r = prng(seed * 13 + 1);
      const farRect = coverRect(ctx.layers, 'far2', 80);
      const n = Math.max(2, Math.round(farRect.w / 1300));
      for (let k = 0; k < n; k++) {
        const s = new Sprite(tex);
        s.anchor.set(0.5, 0);
        const x = farRect.x + ((k + 0.3 + 0.4 * r()) * farRect.w) / n;
        s.position.set(x, farRect.y + 40);
        s.setSize(70 + 50 * r(), farRect.h * 0.9);
        s.rotation = 0.12 + 0.1 * r();
        s.tint = 0x8fb4dc;
        s.blendMode = 'add';
        s.alpha = 0.12;
        poolFar.addChild(s);
        this.cracks.push({ c: { x, y: farRect.y, len: farRect.h, a: 0 }, s, phase: x * 0.01 });
      }
    }
  }

  update(frame: SceneFrame): void {
    this.drawSky();
    const { camera, clock, sim } = frame;
    const anchor = this.ctx.layers.anchor;
    for (const { v } of this.views) v.update(clock, camera.x, camera.y, anchor.y);
    const lures = sim.scene.lures ?? [];
    const k = 1 - Math.exp(-frame.dt * 3);
    // Where the wall behind a room point is in a layer from this camera (layer x = px - (1 - f)(cam - anchor)).
    const at = (s: Sprite, x: number, y: number, f: number): void => {
      s.position.set(x - (1 - f) * (camera.x - anchor.x), y - (1 - f) * (camera.y - anchor.y));
    };
    for (const p of this.pools) {
      const l = lures[p.i];
      if (!l) continue;
      const hp = sim.lures.hp[p.i] ?? 0;
      const on = hp > 0 ? 1 : 0;
      p.level = p.level < 0 ? on : p.level + (on - p.level) * k;
      const flick = p.cool
        ? 1
        : 0.9 + 0.06 * Math.sin(clock * 7.3 + p.i) + 0.04 * Math.sin(clock * 13.1 + p.i * 2);
      at(p.far, l.x, l.y, 0.42);
      p.far.alpha = LR_BACK.pool.farAlpha * p.level * flick;
      at(p.mid, l.x, l.y, 0.68);
      p.mid.alpha = LR_BACK.pool.midAlpha * p.level * flick;
    }
    for (const t of this.twinkle) {
      t.s.alpha =
        t.a * (0.78 + 0.16 * Math.sin(clock * 1.7 + t.ph) + 0.06 * Math.sin(clock * 6.1 + t.ph * 3));
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
    const stops = LR_BACK.sky[this.band];
    const g = this.sky.clear();
    const bands = 40;
    const bh = v.h / bands;
    for (let i = 0; i < bands; i++) {
      const t = (i / (bands - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      const c = mix(stops[k] as number, stops[k + 1] as number, t - k);
      g.rect(v.left, v.top + i * bh, v.w, bh + 1).fill({ color: c });
    }
  }
}
