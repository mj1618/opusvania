/**
 * The environment renderer: everything in the picture except the character and the post stage.
 *
 * HOW IT IS ORGANISED
 *   layer-tree.ts   the named Pixi containers, back to front, and their parallax factors:
 *                   sky | far[0] far[1] far[2] | mid | playfield | character | foreground | air
 *                   The render driver applies the camera to them; modules never position a layer.
 *   layers/*.ts     one module per layer. A module owns its file and its layer container(s) and
 *                   nothing else, so several people can work at once without touching each other:
 *                     layers/sky.ts         -> layers.sky            (screen space)
 *                     layers/far.ts         -> layers.far[0..2]
 *                     layers/mid.ts         -> layers.mid
 *                     layers/playfield.ts   -> layers.playfield      (skins scene.solids / oneWays)
 *                     layers/foreground.ts  -> layers.foreground
 *                     layers/air.ts         -> layers.air
 *
 * HOW A MODULE PLUGS IN
 *   Export a class implementing EnvModule and list it in MODULES below (that one line is the only
 *   shared edit). `init(ctx)` runs once: build display objects and add them to your layer.
 *   `update(frame)` runs every render frame: animate from `frame.clock` / `frame.dt` (seconds of
 *   render time, which keeps running while the sim is frozen), react to `frame.sim.player` and
 *   `frame.sim.events`, read `ctx.lights.list` for dynamic lights (the character's ember), cull
 *   with `ctx.layers.visible(name, frame.camera)`. Never write to the sim. Never use Math.random
 *   for layout (seed your own PRNG) so screenshots are reproducible.
 *
 *   Shared helpers that more than one module needs go in src/render/scene/lib/ (create it).
 *   Colours and the value ladder come from docs/art-direction.md.
 */
import { isGreybox, type Room } from '../../scene/room';
import type { Scene } from '../../sim/scene';
import type { CameraView, RenderContext, SimView } from '../contract';
import { GreyboxLayer } from '../greybox/index';
import { LanternPieces } from '../lantern/index';
import { destroyTree } from '../lifecycle';
import { LayerTree } from './layer-tree';
import { AirLayer } from './layers/air';
import { FarLayers } from './layers/far';
import { ForegroundLayer } from './layers/foreground';
import { LanternBackLayer } from './layers/lantern-back';
import { MidLayer } from './layers/mid';
import { PlayfieldLayer } from './layers/playfield';
import { SkyLayer } from './layers/sky';
import { isInterior, isLantern } from './lib/room-look';

/** What a module gets once, at init. */
export interface SceneContext extends RenderContext {
  readonly layers: LayerTree;
}

/** What a module gets every render frame. */
export interface SceneFrame {
  /** Seconds of render time since the previous update (1/60 per step when stepping manually). */
  readonly dt: number;
  /** Seconds of render time since boot. Drives wind, shimmer, drifting: everything ambient. */
  readonly clock: number;
  readonly camera: CameraView;
  readonly sim: SimView;
}

export interface EnvModule {
  init(ctx: SceneContext): void;
  update(frame: SceneFrame): void;
  /** Frees what the module made outside its layers (the layers themselves are freed for it). */
  destroy?(): void;
}

/** Back to front. Add your module here. */
const MODULES: ReadonlyArray<new () => EnvModule> = [
  SkyLayer,
  FarLayers,
  MidLayer,
  PlayfieldLayer,
  ForegroundLayer,
  AirLayer,
];

/**
 * Lanternroot (docs/design/levels/proto-1.md, memory/lanternroot-art.md): the night layer is the wood's
 * modules plus the level's pieces (lamps, moonwicks, the kit, creatures, fx: render/lantern); inside the
 * giant its own backdrop replaces sky, far and mid.
 */
const LANTERN_NIGHT: ReadonlyArray<new () => EnvModule> = [...MODULES, LanternPieces];
const LANTERN_INSIDE: ReadonlyArray<new () => EnvModule> = [LanternBackLayer, PlayfieldLayer, LanternPieces];

function modulesFor(scene: Scene): ReadonlyArray<new () => EnvModule> {
  if (isGreybox(scene as Parameters<typeof isGreybox>[0])) return [GreyboxLayer];
  if (isInterior()) return LANTERN_INSIDE;
  if (isLantern()) return LANTERN_NIGHT;
  // A wood room with the level's pieces (art.pieces): the wood's modules and Lanternroot's pieces.
  if ((scene as Room).art?.pieces) return LANTERN_NIGHT;
  return MODULES;
}

export class SceneRenderer {
  readonly layers: LayerTree;
  private readonly modules: EnvModule[] = [];

  constructor(private readonly ctx: RenderContext) {
    this.layers = new LayerTree(ctx.scene);
  }

  /** Builds every layer for the scene. Call once. */
  init(_scene: Scene = this.ctx.scene): void {
    const ctx: SceneContext = { ...this.ctx, viewScale: this.ctx.viewScale, layers: this.layers };
    // A greybox room (memory/greybox.md) builds none of the painted layers: one flat module instead.
    for (const M of modulesFor(this.ctx.scene)) {
      const m = new M();
      m.init(ctx);
      this.modules.push(m);
    }
  }

  /**
   * Frees every layer and everything in them, the other renderers' display objects included (they
   * live in this tree): render/lifecycle.ts. Modules with more to free say so in `destroy()`.
   */
  destroy(): void {
    for (const m of this.modules) m.destroy?.();
    this.modules.length = 0;
    destroyTree(this.layers.root);
  }

  /** Once per render frame, after the camera has been applied to the layers. */
  update(dtSeconds: number, renderClock: number, camera: CameraView, sim: SimView): void {
    const frame: SceneFrame = { dt: dtSeconds, clock: renderClock, camera, sim };
    for (const m of this.modules) m.update(frame);
  }
}
