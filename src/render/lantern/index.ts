/**
 * Lanternroot's pieces, painted (docs/design/levels/proto-1.md §8, memory/lanternroot-art.md): everything in
 * a Lanternroot room that is not terrain, backdrop or Wing. One environment module (scene/index.ts adds it
 * to the room's modules); each part is its own file:
 *
 *   lamps.ts      warm seed-pod lamps, moonwicks, the fling's aim, snuffs and freed moths
 *   kit.ts        bark, heartwood, brambles, gates (silk curtain, root-silk seal), covers, signs, the cap,
 *                 hollows, moon patches, glades, doors, moth-stones, moonmoss
 *   creatures.ts  the dangler, spiderlings, the hawker, the juvenile beetle, the Gloamweaver and its web
 *   fx.ts         the blade's answer: sparks, the blow's light, kill pops, sparks of glow flying into her;
 *                 kindle, gust and mend
 *
 * Layers: `goal` (behind her: lamps, kit, creatures' bodies) and `air` (over her: moths, sparks, covers).
 * Render only: reads the sim view, never writes it.
 */
import { Container, Graphics } from 'pixi.js';
import type { EnvModule, SceneContext, SceneFrame } from '../scene/index';
import { lanternTops } from '../scene/lib/lr-terrain';
import { isInterior, LOOK } from '../scene/lib/room-look';
import { Acts } from './acts';
import { Creatures } from './creatures';
import { drawMotes, InteriorDepth } from './fore';
import { Fx } from './fx';
import { GlowPool } from './glow';
import { KeeperStage } from './keeper';
import { Kit } from './kit';
import { Lamps } from './lamps';
import { Moonlight } from './moonlight';
import { NightBack } from './night-back';
import { Opening } from './opening';
import { Vista, WoodVista } from './vista';
import { VistaRiver } from './vista-river';
import { RootWater } from './water';

export class LanternPieces implements EnvModule {
  private lamps!: Lamps;
  private readonly kit = new Kit();
  private readonly creatures = new Creatures();
  private fx!: Fx;
  /** The Canopy's small events (acts.ts): the first fling's moths, arrivals, patch flares, the kin's lights. */
  private acts: Acts | null = null;
  /** The den's great cage and its keeper (keeper.ts, the Canopy r12): light, shadows, moths, the column, the moon. */
  private keeper: KeeperStage | null = null;
  /** The opening (opening.ts, the Canopy r12): the swarm's shadows, the title, the valley's lights and knots. */
  private opening: Opening | null = null;
  /** The ending's vista (vista-river.ts, the Canopy r12): the roosts' streams joining, the river round her glide. */
  private river: VistaRiver | null = null;
  private water: RootWater | null = null;
  private depth: InteriorDepth | null = null;
  private vista: Vista | WoodVista | null = null;
  private moon: Moonlight | null = null;
  private night: NightBack | null = null;
  private anchorY = 0;
  private readonly back = new Graphics();
  private readonly front = new Graphics();
  private readonly glowBack = new GlowPool('lr-glow-back');
  /** Additive light laid over the pieces behind her (a lamp's luminous heart). */
  private readonly glowMid = new GlowPool('lr-glow-mid');
  private readonly glowFront = new GlowPool('lr-glow-front');

  init(ctx: SceneContext): void {
    this.lamps = new Lamps(ctx.scene, ctx.lights);
    this.fx = new Fx(ctx.lights);
    if (LOOK.kit === 'wood') this.acts = new Acts(ctx, ctx.lights);
    this.keeper = KeeperStage.for(ctx, ctx.lights);
    this.opening = Opening.for(ctx);
    this.river = VistaRiver.for(ctx);
    if (this.keeper) this.lamps.handOff.add(this.keeper.cageId);
    const marks = ctx.scene.marks as
      | { landmarks?: Array<{ kind: string; x: number; y: number }> }
      | undefined;
    const v = marks?.landmarks?.find((l) => l.kind === 'vista');
    // The night's own backdrop (the forest below, the giant's crown) under the vista.
    if (LOOK.band === 'night') this.night = new NightBack(ctx);
    if (v && LOOK.band === 'night') this.vista = new Vista(ctx.layers, v);
    // The wood's vista (review r3 #5): the mountain under the moon and the valley's lamps, from the way out's cliff.
    else if (v && LOOK.kit === 'wood') {
      const lm = marks?.landmarks ?? [];
      this.vista = new WoodVista(
        ctx.layers,
        v,
        lm.find((l) => l.kind === 'mountain'),
        lm.find((l) => l.kind === 'valley') as { x: number; y: number; w?: number; h?: number } | undefined,
      );
    }
    this.anchorY = ctx.layers.anchor.y;
    if (isInterior() && LOOK.band) this.moon = new Moonlight(ctx.scene, ctx.layers, ctx.lights, LOOK.band);
    if (isInterior() && LOOK.band)
      this.depth = new InteriorDepth(ctx.renderer, ctx.layers, LOOK.band, ctx.scene.width, LOOK.seed);
    if (LOOK.band === 'roots') {
      const w = new RootWater(ctx.scene, lanternTops(ctx.scene));
      if (w.any) {
        this.water = w;
        ctx.layers.playfieldFront.addChild(w.container);
      }
    }
    const goal = ctx.layers.get('goal');
    goal.addChild(this.glowBack.container, this.back, this.glowMid.container);
    ctx.layers.air.addChild(this.front, this.glowFront.container);
    // The moth clouds: behind the lamp bodies, and over her (before the sparks' glow).
    this.lamps.attachClouds(goal, ctx.layers.air, goal.getChildIndex(this.back));
    void Container;
  }

  update(frame: SceneFrame): void {
    const { sim, dt, clock, camera } = frame;
    this.lamps.onEvents(sim.events, sim);
    this.kit.onEvents(sim.events, sim);
    this.fx.onEvents(sim.events, sim);
    this.moon?.onEvents(sim.events);
    this.water?.onEvents(sim.events, sim);
    this.acts?.onEvents(sim.events, sim);
    this.keeper?.onEvents(sim);
    this.back.clear();
    this.front.clear();
    this.glowBack.begin();
    this.glowMid.begin();
    this.glowFront.begin();
    this.kit.draw(dt, clock, sim, camera, this.back, this.front, this.glowBack, this.glowFront);
    this.lamps.draw(
      dt,
      clock,
      sim,
      camera,
      this.back,
      this.front,
      this.glowBack,
      this.glowMid,
      this.glowFront,
    );
    this.creatures.draw(dt, clock, sim, camera, this.back, this.front, this.glowMid);
    this.fx.draw(dt, clock, sim, this.front, this.glowFront);
    this.acts?.draw(dt, clock, sim, camera, this.back, this.front, this.glowBack, this.glowFront);
    this.moon?.draw(dt, clock, sim, camera, this.glowBack, this.glowFront);
    this.keeper?.draw(dt, clock, sim, camera);
    this.opening?.draw(dt, clock, sim, camera);
    this.river?.draw(dt, clock, sim, camera);
    this.water?.draw(dt, clock, sim, camera, this.glowFront);
    this.vista?.update(camera, clock);
    this.night?.update(clock, camera.x, camera.y, this.anchorY);
    if (this.depth && LOOK.band) {
      this.depth.update(camera, sim.player);
      drawMotes(clock, sim, camera, LOOK.band, this.glowFront);
    }
    this.glowBack.end();
    this.glowMid.end();
    this.glowFront.end();
  }

  destroy(): void {
    this.lamps?.destroy();
    this.fx?.destroy();
    this.acts?.destroy();
    this.keeper?.destroy();
    this.depth?.destroy();
    this.vista?.destroy();
    this.moon?.destroy();
  }
}
