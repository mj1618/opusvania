/**
 * The playfield: the painted skin of the collision rects and everything growing on it.
 *
 *   layers.playfield
 *     water.back        the pool body (behind the banks' edges and the character)
 *     terrain           baked, lit tiles (lib/pf-terrain.ts painted, lib/pf-bake.ts lit)
 *     plants            live meshes swaying in the wind (lib/pf-plants.ts, lib/pf-flora.ts)
 *     halos             additive glow around lantern flowers and glow mushrooms
 *   layers.playfieldFront   in front of the character, same depth:
 *     water.front       the tint and surface line over whatever wades in the pool
 *     fringe            low dark grass over the character's feet, lily pads
 *
 * Structure, knobs and gotchas: memory/playfield.md.
 */
import type { Container } from 'pixi.js';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { bakeTerrain } from '../lib/pf-bake';
import { BendField } from '../lib/pf-field';
import { FloraBuilder, type FloraMesh } from '../lib/pf-flora';
import { growGarden } from '../lib/pf-plants';
import { paintTerrain } from '../lib/pf-terrain';
import { Water } from '../lib/pf-water';

export const PLAYFIELD = {
  /** Terrain is baked at the view scale, clamped to this range (texture px per world px). */
  bakeScaleMin: 1.5,
  bakeScaleMax: 2,
  /** Plant meshes are split into chunks this wide (world px) for culling. */
  chunk: 480,
  /** How much glow plants and their halos brighten when the character or a light is near. */
  glowGain: 1.5,
  haloGain: 1.6,
} as const;

export class PlayfieldLayer implements EnvModule {
  private ctx!: SceneContext;
  private front!: Container;
  private field!: BendField;
  private flora: FloraMesh[] = [];
  private water: Water | null = null;
  private poolX: [number, number] = [0, 0];
  /** Rolling CPU cost of update(), ms (read by `window.__pf` in dev for profiling). */
  cpuMs = 0;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.front = ctx.layers.playfieldFront;
    const scene = ctx.scene;
    const { paint, info } = paintTerrain(scene);
    const scale = Math.min(PLAYFIELD.bakeScaleMax, Math.max(PLAYFIELD.bakeScaleMin, ctx.viewScale()));
    const baked = bakeTerrain(ctx.renderer, paint, scale);
    paint.albedo.destroy();
    paint.relief.destroy();

    this.field = new BendField(scene.width, scene.height);
    const garden = {
      back: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      front: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      halo: new FloraBuilder(PLAYFIELD.chunk, scene.width),
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
    pf.addChild(baked.layer, back.container, halo.container);
    this.front.addChild(fringe.container);
    // Dev-only handle for profiling (toggle the containers, read cpuMs): see memory/playfield.md.
    if (import.meta.env.DEV)
      (globalThis as { __pf?: unknown }).__pf = { layer: this, back: pf, front: this.front };
    console.info(
      `[playfield] ${baked.tiles} tiles (${baked.megapixels.toFixed(1)} MP at x${scale}) baked in ${baked.ms.toFixed(0)} ms; ` +
        `${garden.back.vertexCount + garden.front.vertexCount + garden.halo.vertexCount} plant vertices`,
    );
  }

  update(frame: SceneFrame): void {
    const t0 = performance.now();
    const { ctx } = this;
    const { player, events } = frame.sim;
    const lights = ctx.lights.list;
    this.field.update(frame.dt, player, lights, events);
    const vis = ctx.layers.visible('playfield', frame.camera);
    for (const f of this.flora) {
      f.update(frame.clock, vis.x, vis.x + vis.w, PLAYFIELD.glowGain, PLAYFIELD.haloGain);
    }
    if (this.water) {
      const on = this.poolX[1] > vis.x - 40 && this.poolX[0] < vis.x + vis.w + 40;
      this.water.update(frame.dt, frame.clock, player, lights, events, on);
    }
    this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.05;
  }
}
