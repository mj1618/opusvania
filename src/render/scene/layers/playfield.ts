/**
 * The playfield: the painted skin of the collision rects and everything growing on it.
 *
 *   layers.playfield
 *     water.back        the pool body (behind the banks' edges and the character)
 *     terrain           baked, lit tiles (lib/pf-terrain.ts painted, lib/pf-bake.ts lit)
 *     plants            live meshes swaying in the wind (lib/pf-plants.ts, lib/pf-flora.ts)
 *     halos             additive glow around lantern flowers and glow mushrooms
 *     fliers            butterflies and moths (lib/pf-flutter.ts)
 *   layers.playfieldFront   in front of the character, same depth:
 *     water.front       the tint and surface line over whatever wades in the pool
 *     fringe            low dark grass over the character's feet, lily pads
 *
 * Structure, knobs and gotchas: memory/playfield.md.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import { slashBox } from '../../../sim/index';
import { tuning } from '../../../sim/tuning';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { prng } from '../lib/look';
import { bakeTerrain } from '../lib/pf-bake';
import { Clippings } from '../lib/pf-clippings';
import { BendField } from '../lib/pf-field';
import { FloraBuilder, type FloraMesh } from '../lib/pf-flora';
import { Flutter } from '../lib/pf-flutter';
import { growGarden } from '../lib/pf-plants';
import { zoneAt } from '../lib/pf-shape';
import { paintTerrain, type TerrainInfo } from '../lib/pf-terrain';
import { Water } from '../lib/pf-water';

export const PLAYFIELD = {
  /** Terrain is baked at the view scale, clamped to this range (texture px per world px). */
  bakeScaleMin: 1.5,
  bakeScaleMax: 2,
  /** Plant meshes are split into chunks this wide (world px) for culling. */
  chunk: 480,
  /** How much glow plants and their halos brighten when the character or a light is near. */
  /** Clippings a slash throws from a full box of grass (fewer with less foliage in reach). */
  clippings: 16,
  glowGain: 0.7,
  haloGain: 0.7,
} as const;

/** Clipping colours per zone (blade bodies and lit tips), and a petal. */
const CLIP_COOL = [0x125a56, 0x1a7a70, 0x2f9a88];
const CLIP_WARM = [0x234a20, 0x3f6a2a, 0x7c8a30];
const CLIP_DEEP = [0x0e4a30, 0x14603c, 0x1f8a50];
const CLIP_PETAL = 0xb8ae98;

export class PlayfieldLayer implements EnvModule {
  private ctx!: SceneContext;
  private front!: Container;
  private field!: BendField;
  private flora: FloraMesh[] = [];
  private water: Water | null = null;
  private flutter!: Flutter;
  private clippings!: Clippings;
  private info!: TerrainInfo;
  private poolX: [number, number] = [0, 0];
  /** Rolling CPU cost of update(), ms (read by `window.__pf` in dev for profiling). */
  cpuMs = 0;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.front = ctx.layers.playfieldFront;
    const scene = ctx.scene;
    const { paint, info } = paintTerrain(scene);
    this.info = info;
    const scale = Math.min(PLAYFIELD.bakeScaleMax, Math.max(PLAYFIELD.bakeScaleMin, ctx.viewScale()));
    const baked = bakeTerrain(ctx.renderer, paint, scale);
    paint.albedo.destroy();
    paint.relief.destroy();

    this.field = new BendField(scene.width, scene.height);
    const garden = {
      back: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      front: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      halo: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      butterflies: [] as number[][],
      moths: [] as number[][],
    };
    growGarden(garden, info, scene.width);
    const rect = this.field.rect;
    const back = garden.back.build(this.field.texture, rect, false);
    const halo = garden.halo.build(this.field.texture, rect, true);
    const fringe = garden.front.build(this.field.texture, rect, false);
    this.flora = [back, halo, fringe];

    const pf = ctx.layers.playfield;
    if (info.pool) {
      this.water = new Water(info.pool);
      this.poolX = [info.pool.x0, info.pool.x1];
      pf.addChild(this.water.back);
      this.front.addChild(this.water.front);
    }
    this.flutter = new Flutter(garden.butterflies, garden.moths);
    this.clippings = new Clippings();
    this.front.addChild(this.clippings.mesh);
    pf.addChild(baked.layer, back.container, halo.container, this.flutter.mesh);
    this.front.addChild(fringe.container);
    // Dev-only handle for profiling (toggle the containers, read cpuMs): see memory/playfield.md.
    if (import.meta.env.DEV)
      (globalThis as { __pf?: unknown }).__pf = { layer: this, back: pf, front: this.front };
    console.info(
      `[playfield] ${baked.tiles} tiles (${baked.megapixels.toFixed(1)} MP at x${scale}) baked in ${baked.ms.toFixed(0)} ms; ` +
        `${garden.back.vertexCount + garden.front.vertexCount + garden.halo.vertexCount} plant vertices`,
    );
  }

  /**
   * The world answers a slash: plants in its box whip away and are clipped, a gust runs on ahead,
   * bits of grass and leaf fly, the pool throws droplets. Render only; nothing here touches the sim.
   */
  private onSlash(ev: Extract<SimEvent, { type: 'slash' }>, frame: SceneFrame): void {
    const p = frame.sim.player;
    const box = slashBox({ x: p.x, y: p.y, w: p.w, h: p.h }, ev.dir, ev.facing, tuning, ev.step);
    // Each step of the combo hits a little harder; the finisher much harder.
    const power = ev.finisher ? 1.6 : 1 + 0.12 * Math.max(0, ev.step - 1);
    const startup = ev.startup / 60;
    const mode = ev.dir === 'fwd' ? (ev.facing >= 0 ? 1 : -1) : 0;
    this.field.slash(box, mode, power, startup, ev.active / 60);
    this.water?.slash(box, frame.clock + startup, power);

    const r = prng(ev.seq * 7919 + 13);
    const z = zoneAt(box.x + box.w / 2);
    const tones = z.warm > z.cool && z.warm > z.deep ? CLIP_WARM : z.deep > z.cool ? CLIP_DEEP : CLIP_COOL;
    const birth = frame.clock + startup;
    // Grass: a walkable top running through (or just under) the box.
    let top: { x0: number; x1: number; y: number } | null = null;
    for (const t of this.info.tops) {
      if (t.kind === 'poolFloor' || t.x1 < box.x || t.x0 > box.x + box.w) continue;
      if (t.y < box.y || t.y > box.y + box.h + 14) continue;
      if (!top || t.y < top.y) top = t;
    }
    if (top) {
      // Only what is ahead of her (the box reaches a little behind for the hit test).
      const x0 = Math.max(top.x0, mode > 0 ? p.cx : box.x);
      const x1 = Math.min(top.x1, mode < 0 ? p.cx : box.x + box.w);
      if (x1 <= x0) return;
      const n = Math.round((0.5 + 0.5 * ((x1 - x0) / box.w)) * PLAYFIELD.clippings * Math.min(1.5, power));
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0);
        const y = top.y - 6 - r() * 26;
        const petal = i < 3 && r() < 0.5;
        const out = mode !== 0 ? mode : x < box.x + box.w / 2 ? -1 : 1;
        const speed = (260 + r() * 420) * (0.8 + 0.3 * power);
        const up = ev.dir === 'down' ? 120 + r() * 240 : 60 + r() * 230;
        this.clippings.spawn(
          x,
          y,
          out * speed * (mode !== 0 ? 1 : 0.6),
          -up,
          birth + r() * 0.06,
          r() * 6.28,
          petal ? 3.2 + r() * 1.5 : 3.5 + r() * 4,
          petal ? 2 : r() < 0.7 ? 0 : 1,
          petal ? CLIP_PETAL : (tones[Math.floor(r() * tones.length)] as number),
        );
      }
      return;
    }
    // No grass: leaves knocked off whatever hangs in the box.
    for (const u of this.info.unders) {
      if (u.x1 < box.x || u.x0 > box.x + box.w) continue;
      const mx = Math.min(u.x1, Math.max(u.x0, box.x + box.w / 2));
      const uy = u.y(mx);
      if (uy < box.y - 30 || uy > box.y + box.h) continue;
      for (let i = 0; i < 7; i++) {
        this.clippings.spawn(
          Math.max(u.x0, box.x) + r() * (Math.min(u.x1, box.x + box.w) - Math.max(u.x0, box.x)),
          uy + r() * 40,
          (r() - 0.5) * 220 + mode * 120,
          -40 - r() * 120,
          birth + r() * 0.06,
          r() * 6.28,
          3.5 + r() * 3,
          1,
          tones[Math.floor(r() * tones.length)] as number,
        );
      }
      return;
    }
  }

  update(frame: SceneFrame): void {
    const t0 = performance.now();
    const { ctx } = this;
    const { player, events } = frame.sim;
    const lights = ctx.lights.list;
    for (const ev of events) {
      if (ev.type === 'slash') this.onSlash(ev, frame);
      else if (ev.type === 'spawn') this.clippings.clear();
    }
    this.field.update(frame.dt, player, lights, events);
    const vis = ctx.layers.visible('playfield', frame.camera);
    for (const f of this.flora) {
      f.update(frame.clock, vis.x, vis.x + vis.w, PLAYFIELD.glowGain, PLAYFIELD.haloGain);
    }
    this.flutter.update(frame.clock);
    this.clippings.update(frame.clock);
    if (this.water) {
      const on = this.poolX[1] > vis.x - 40 && this.poolX[0] < vis.x + vis.w + 40;
      this.water.update(frame.dt, frame.clock, player, lights, events, on);
    }
    this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.05;
  }
}
