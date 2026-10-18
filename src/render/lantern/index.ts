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
import { LOOK } from '../scene/lib/room-look';
import { Creatures } from './creatures';
import { Fx } from './fx';
import { GlowPool } from './glow';
import { Kit } from './kit';
import { Lamps } from './lamps';
import { RootWater } from './water';

export class LanternPieces implements EnvModule {
  private lamps!: Lamps;
  private readonly kit = new Kit();
  private readonly creatures = new Creatures();
  private fx!: Fx;
  private water: RootWater | null = null;
  private readonly back = new Graphics();
  private readonly front = new Graphics();
  private readonly glowBack = new GlowPool('lr-glow-back');
  /** Additive light laid over the pieces behind her (a lamp's luminous heart). */
  private readonly glowMid = new GlowPool('lr-glow-mid');
  private readonly glowFront = new GlowPool('lr-glow-front');

  init(ctx: SceneContext): void {
    this.lamps = new Lamps(ctx.scene, ctx.lights);
    this.fx = new Fx(ctx.lights);
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
    void Container;
  }

  update(frame: SceneFrame): void {
    const { sim, dt, clock, camera } = frame;
    this.lamps.onEvents(sim.events, sim);
    this.kit.onEvents(sim.events, sim);
    this.fx.onEvents(sim.events, sim);
    this.water?.onEvents(sim.events, sim);
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
    this.water?.draw(dt, clock, sim, camera, this.glowFront);
    this.glowBack.end();
    this.glowMid.end();
    this.glowFront.end();
  }

  destroy(): void {
    this.lamps?.destroy();
    this.fx?.destroy();
  }
}
