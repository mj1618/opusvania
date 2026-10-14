/**
 * The prologue's picture (docs/story/scenes/mouthless-key-scenes.md section 1, about 90 s,
 * wordless): four shots on one clock, `t` seconds, which the director (src/prologue.ts) advances
 * with render time and hands in every frame.
 *
 *   0-14   the breath          a plate (plate.ts + breath.ts): the world kit at 1920x1080, own post
 *   14-42  the world from high  a plate (world.ts)
 *   42-60  the burrback and the caterpillar   in the Grove: the game's own layers and post, the
 *   60-90  two cocoons, a glint, the title    camera on a keyframed track, actors drawn here (grove.ts)
 *          (83.6-89.2 a plate: outside the Grove, the title: outside.ts)
 *
 * Over everything (under the HUD) a black for fades and dips. Render only: it reads the sim's
 * player and goal, and never writes to the sim; what the player may press is the director's.
 */
import { Container, Graphics } from 'pixi.js';
import type { CameraView, PlayerView, RenderContext, SimView } from '../contract';
import { VIEW_H, VIEW_W } from '../contract';
import type { LayerTree } from '../scene/layer-tree';
import { buildBreath } from './breath';
import { GroveActors } from './grove';
import { buildOutside } from './outside';
import { Plate } from './plate';
import { COCOONS, PROLOGUE_END, SHOT } from './script';
import { Track, window01 } from './track';
import { buildWorld } from './world';

/** Black over the whole view: 1 = black. Cuts between plates and the Grove go through it. */
const BLACK = new Track([
  { t: 0, v: [1] },
  { t: 0.01, v: [0] },
  { t: SHOT.world.start - 0.02, v: [0] },
  { t: SHOT.world.start - 0.01, v: [0] },
  // The burrback shot comes up out of the dip the world shot ends in.
  { t: SHOT.burr.start, v: [1], ease: 'hold' },
  { t: SHOT.burr.start + 1.4, v: [0], ease: 'out' },
]);

export class PrologueRenderer {
  /** Over the game's layers (plates, the black), under the dip and the HUD. */
  readonly layer = new Container({ label: 'prologue' });
  private readonly black = new Graphics();
  private readonly breath: Plate;
  private readonly world: Plate;
  private readonly outside: Plate;
  private readonly actors: GroveActors;
  /** Seconds on the prologue's clock: the director sets it before each update. */
  t = 0;

  constructor(ctx: RenderContext, layers: LayerTree) {
    const r = ctx.renderer;
    this.breath = new Plate(r, buildBreath);
    this.world = new Plate(r, buildWorld);
    this.outside = new Plate(r, buildOutside);
    this.actors = new GroveActors(ctx, layers);
    this.black.rect(-4, -4, VIEW_W + 8, VIEW_H + 8).fill(0x020306);
    this.layer.addChild(this.breath.sprite, this.world.sprite, this.outside.sprite, this.black);
    this.layer.eventMode = 'none';
  }

  /** The prologue has played to its end. */
  get done(): boolean {
    return this.t >= PROLOGUE_END;
  }

  /** The Grove is not on screen at all (a plate covers it): the stage may skip drawing it. */
  get groveHidden(): boolean {
    const t = this.t;
    return t < SHOT.burr.start || (t >= COCOONS.outside[0] + 1.2 && t < COCOONS.outside[1] - 0.2);
  }

  /** Umber is not in the picture yet (she is in her cocoon until it splits). */
  get heroHidden(): boolean {
    return this.t < COCOONS.umberSplit;
  }

  /** How much of the HUD shows: none until the very end. */
  get hudAlpha(): number {
    return window01(this.t, PROLOGUE_END - 0.6, PROLOGUE_END + 1.2);
  }

  /**
   * The camera this frame, from the follow camera's view and her (some keys lean on her), or
   * null where the game's own camera should be used untouched.
   */
  camera(follow: CameraView, player: PlayerView): CameraView | null {
    return this.actors.camera(this.t, follow, player);
  }

  /** Before the character renderer: actors that act with her, cues for her acting. `t` is set by the director. */
  update(dt: number, clock: number, view: CameraView, sim: SimView): void {
    const t = this.t;
    const inBreath = t < SHOT.world.start;
    const inWorld = t >= SHOT.world.start && t < SHOT.burr.start;
    const [o0, o1] = COCOONS.outside;
    const outK = window01(t, o0, o0 + 1.2) * (1 - window01(t, o1 - 1.2, o1));
    this.breath.sprite.visible = inBreath;
    this.world.sprite.visible = inWorld;
    this.outside.sprite.visible = outK > 0.001;
    this.outside.sprite.alpha = outK;
    if (inBreath) this.breath.render(t, dt);
    if (inWorld) this.world.render(t, dt);
    if (outK > 0.001) this.outside.render(t, dt);
    this.actors.update(t, dt, clock, view, sim);
    const k = BLACK.at(t);
    this.black.visible = k > 0.001;
    this.black.alpha = k;
  }

  destroy(): void {
    this.actors.destroy();
    this.breath.destroy();
    this.world.destroy();
    this.outside.destroy();
    this.layer.destroy({ children: true });
  }
}
