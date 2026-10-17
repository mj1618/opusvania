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
import { viewTop } from '../../camera/index';
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
  clippings: 7,
  /** Grass tufts in the cut's reach that make a full box, and the size range of a clipping, px. */
  clipFull: 12,
  clipSize: [2.6, 5.2],
  /** How far above the walk line a cut still reaches grass (the blades are 10-40 px), px. */
  clipReach: 34,
  // Glow plants warm a little near the hero or a light; they never bloom (the owner's standing
  // complaint is brightness near her, and the lanterns must be the lights where they stand).
  glowGain: 0.28,
  haloGain: 0.22,
} as const;

/** Leaves knocked off what hangs under a top, per zone (the shade tones of the vines there). */
const LEAF_COOL = [0x0c3c40, 0x125248];
const LEAF_WARM = [0x1c3a1a, 0x33521f];
const LEAF_DEEP = [0x141a3a, 0x0e3a34];

export class PlayfieldLayer implements EnvModule {
  private ctx!: SceneContext;
  private front!: Container;
  private field!: BendField;
  private flora: FloraMesh[] = [];
  private water: Water | null = null;
  private flutter!: Flutter;
  private clippings!: Clippings;
  private info!: TerrainInfo;
  /** Grass tufts as [x, top y, colour] triples (Garden.turf). */
  private turf: number[] = [];
  private poolX: [number, number] = [0, 0];
  /** Rolling CPU cost of update(), ms (read by `window.__pf` in dev for profiling). */
  cpuMs = 0;
  private readonly bodies: Array<{ x: number; feetY: number; vx: number; reach: number; up: number }> = [];

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.front = ctx.layers.playfieldFront;
    const scene = ctx.scene;
    const { paint, info } = paintTerrain(scene);
    this.info = info;
    const scale = Math.min(PLAYFIELD.bakeScaleMax, Math.max(PLAYFIELD.bakeScaleMin, ctx.viewScale()));
    const baked = bakeTerrain(ctx.renderer, paint, scale, info.mist);
    paint.albedo.destroy();
    paint.relief.destroy();

    this.field = new BendField(scene.width, scene.height);
    const garden = {
      back: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      front: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      halo: new FloraBuilder(PLAYFIELD.chunk, scene.width),
      butterflies: [] as number[][],
      moths: [] as number[][],
      turf: [] as number[],
    };
    // (The top of the highest view: what hangs from the crown has to start above it.)
    growGarden(garden, info, scene.width, viewTop(scene));
    this.turf = garden.turf;
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
    // (Behind the character, the creatures and the slash mark: in `playfieldFront` they flew over
    // the cut itself, flat green triangles on the crescent.)
    pf.addChild(baked.layer, back.container, this.clippings.mesh, halo.container, this.flutter.mesh);
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
    const birth = frame.clock + startup;
    const [s0, s1] = PLAYFIELD.clipSize;
    // Grass: only where the cut really passes through it. The tufts that were grown on a walk line
    // within the blade's reach, ahead of her (the box reaches a little behind for the hit test);
    // each clipping leaves from one of them, in that tuft's own colour. A cut in the air, on bare
    // stone or over a mown patch throws nothing.
    const bx0 = mode > 0 ? p.cx : box.x;
    const bx1 = mode < 0 ? p.cx : box.x + box.w;
    const turf = this.turf;
    const hit: number[] = [];
    for (let i = 0; i < turf.length; i += 3) {
      const x = turf[i] as number;
      const y = turf[i + 1] as number;
      if (x < bx0 || x > bx1 || y < box.y || y - PLAYFIELD.clipReach > box.y + box.h) continue;
      hit.push(i);
    }
    if (hit.length > 0) {
      const n = Math.round(
        Math.min(1, hit.length / PLAYFIELD.clipFull) * PLAYFIELD.clippings * Math.min(1.3, power),
      );
      for (let k = 0; k < n; k++) {
        const i = hit[Math.floor(r() * hit.length)] as number;
        const x = (turf[i] as number) + (r() - 0.5) * 8;
        const y = (turf[i + 1] as number) - 5 - r() * 16;
        const out = mode !== 0 ? mode : x < box.x + box.w / 2 ? -1 : 1;
        const speed = (200 + r() * 320) * (0.8 + 0.3 * power);
        const up = ev.dir === 'down' ? 100 + r() * 200 : 50 + r() * 180;
        this.clippings.spawn(
          x,
          y,
          out * speed * (mode !== 0 ? 1 : 0.6),
          -up,
          birth + r() * 0.06,
          r() * 6.28,
          s0 + r() * (s1 - s0),
          r() < 0.75 ? 0 : 1,
          turf[i + 2] as number,
        );
      }
      return;
    }
    // No grass: a few leaves off what hangs INSIDE the box (an up cut under an island or a bough).
    const z = zoneAt(box.x + box.w / 2);
    const tones = z.warm > z.cool && z.warm > z.deep ? LEAF_WARM : z.deep > z.cool ? LEAF_DEEP : LEAF_COOL;
    for (const u of this.info.unders) {
      if (u.x1 < box.x || u.x0 > box.x + box.w) continue;
      const mx = Math.min(u.x1, Math.max(u.x0, box.x + box.w / 2));
      const uy = u.y(mx);
      if (uy < box.y || uy > box.y + box.h) continue;
      for (let i = 0; i < 3; i++) {
        this.clippings.spawn(
          Math.max(u.x0, box.x) + r() * (Math.min(u.x1, box.x + box.w) - Math.max(u.x0, box.x)),
          uy + r() * 30,
          (r() - 0.5) * 180 + mode * 100,
          -30 - r() * 100,
          birth + r() * 0.06,
          r() * 6.28,
          s0 + r() * (s1 - s0),
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
    // Ground creatures part the plants too (the burrbacks; fliers do not touch them).
    const bodies = this.bodies;
    bodies.length = 0;
    for (const e of frame.sim.enemies) {
      if (e.kind !== 'burrback' || e.mode === 'dead') continue;
      bodies.push({ x: e.x + e.w / 2, feetY: e.y + e.h, vx: e.vx, reach: e.w * 0.6, up: e.h + 10 });
    }
    this.field.update(frame.dt, player, lights, events, bodies);
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
