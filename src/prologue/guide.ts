/**
 * Sorrel as a guide: a second body on the real sim (his own GameState, stepped with the same pure
 * `step()` and tuning as hers, in a Grove with no creatures and no glints), so every move he shows
 * is one she can copy with the same controls. He is driven by recorded input (the input DSL, the
 * course in render/prologue/script.ts) or by the director frame by frame; nothing he does touches
 * her sim. Harness side, like the Game: the sim stays pure and knows nothing of him.
 */
import { parseInputScript } from '../input/script';
import { cloneState, createState, placePlayer, step } from '../sim/index';
import type { InputFrame } from '../sim/input';
import type { Scene } from '../sim/scene';
import type { GameState } from '../sim/state';
import type { Tuning } from '../sim/tuning';

export class Guide {
  state: GameState;
  prev: GameState;
  /** The clip he is playing (frames of input), and how far into it. */
  private clip: InputFrame[] = [];
  private at = 0;

  constructor(
    private readonly tuning: Tuning,
    private readonly scene: Scene,
    seed: number,
  ) {
    this.state = createState(seed, tuning, scene);
    this.prev = cloneState(this.state);
  }

  /** Puts him at rest with his feet at (x, y) (in the air he falls from there). */
  place(x: number, y: number): void {
    placePlayer(this.state, x, y, this.tuning, this.scene, []);
    this.prev = cloneState(this.state);
    this.clip = [];
    this.at = 0;
  }

  /** Starts a recorded clip (input DSL). */
  play(script: string): void {
    this.clip = parseInputScript(script);
    this.at = 0;
  }

  /** The clip has run out (or none was given). */
  get idle(): boolean {
    return this.at >= this.clip.length;
  }

  /** Frames into the current clip. */
  get frame(): number {
    return this.at;
  }

  /** One step: the clip's next frame, or `input` when no clip is running. */
  step(input: InputFrame = 0): void {
    const i = this.at < this.clip.length ? (this.clip[this.at++] ?? 0) : input;
    this.prev = cloneState(this.state);
    step(this.state, i, this.tuning, this.scene, []);
  }

  /** Feet centre. */
  get x(): number {
    const p = this.state.player;
    return p.x + p.w / 2;
  }

  get y(): number {
    const p = this.state.player;
    return p.y + p.h;
  }
}
