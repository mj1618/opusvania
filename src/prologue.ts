/**
 * The prologue's director: the harness side of the opening (render/prologue draws it). It owns the
 * prologue's clock (advanced by render time, never wall time), decides what the player may press
 * (nothing until Umber's cocoon splits, then walk only, then nothing while she holds the glint)
 * and when the sim runs (it stands still until she drops to the moss), and puts her there.
 *
 * Boot (src/main.ts): it plays unless `?skipprologue`, or `?manual` (the capture tools and the tests
 * boot paused and want the Grove); `?prologue` plays it anyway, also under `?manual`, where it does
 * not touch the run mode: `__game.prologue.advance(n)` steps it (and the sim, once the sim runs).
 * Escape skips it.
 */
import type { Game } from './game';
import { PrologueRenderer } from './render/prologue/index';
import { COCOONS, PROLOGUE_END } from './render/prologue/script';
import type { RenderStage } from './render/stage';
import type { InputFrame } from './sim/input';
import { ActionBit } from './sim/input';

/** What a walk may carry: left and right only. */
const WALK = ActionBit.left | ActionBit.right;

export class PrologueDirector {
  /** Seconds on the prologue's clock. */
  t = 0;
  done = false;
  readonly renderer: PrologueRenderer;
  private dropped = false;

  constructor(
    private readonly game: Game,
    private readonly stage: RenderStage,
    /** true: it sets the run mode itself (frozen, then realtime). false under ?manual. */
    private readonly drive: boolean,
  ) {
    this.renderer = new PrologueRenderer(stage.ctx, stage.scene.layers);
    stage.attachPrologue(this.renderer, (dt) => this.update(dt));
    if (drive) game.mode = 'frozen';
  }

  /** The sim runs: she is out of her cocoon. */
  get simOn(): boolean {
    return this.done || this.dropped;
  }

  /** Advances the clock by `dt` render seconds (from the stage, before it draws). */
  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.renderer.t = this.t;
    if (!this.dropped && this.t >= COCOONS.umberSplit) this.drop();
    if (this.t >= PROLOGUE_END) this.finish();
  }

  /** The input the sim may see now. */
  mask(input: InputFrame): InputFrame {
    if (this.done) return input;
    if (!this.dropped || this.t < COCOONS.shake[1]) return 0;
    // Walk only, until the glint comes to her; then she holds still with it. No step right past
    // the water's edge (the pool is a few px east of where she lands).
    if (this.t >= COCOONS.glint[0] + 1.2) return 0;
    let w = input & WALK;
    const p = this.game.state.player;
    if (p.x + p.w / 2 >= COCOONS.fence) w &= ~ActionBit.right;
    return w;
  }

  /** Skip to the Grove. */
  skip(): void {
    if (this.done) return;
    if (!this.dropped) this.drop();
    this.t = PROLOGUE_END;
    this.renderer.t = this.t;
    this.finish();
  }

  /** Her cocoon splits: she drops to the moss (feet placed under it, in the air; the sim lets her fall). */
  private drop(): void {
    this.dropped = true;
    const c = COCOONS.umber;
    this.game.teleport(c.x, c.y + 26);
    if (this.drive) this.game.mode = 'realtime';
  }

  private finish(): void {
    this.done = true;
    if (this.drive && this.game.mode !== 'realtime') this.game.mode = 'realtime';
    this.stage.detachPrologue();
  }
}
