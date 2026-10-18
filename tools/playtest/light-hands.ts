/**
 * Light hands for the human-like runs (review r1: "no human-like model knows kindle, gust or mend"): an overlay on a
 * persona's intent in a glow room (Lanternroot, memory/glow.md). It is a habit, not a plan: a person who holds the
 * Lamp kindles a cold bud they stand by when they can pay for it, and mends when hurt with nothing near. The motor
 * model (human.ts) still puts its delays and slips on what comes out. Gust is not taught (where to puff is a plan).
 */

import { ActionBit } from '../../src/sim/input';
import { kindleCost, kindleTarget } from '../../src/sim/light';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import type { Tuning } from '../../src/sim/tuning';

const B = ActionBit.lamp;
/** No creature this near (px, centre to centre): safe to mend. */
const CALM = 500;

export class LightHands {
  private mend = 0;
  private tap = 0;
  private last = -999;

  /** The intent this frame, with a kindle or a mend laid over it when the habit says so. */
  step(s: GameState, scene: Scene, t: Tuning, intent: number): number {
    if (scene.glow !== true) return intent;
    const p = s.player;
    if (this.mend > 0) {
      this.mend--;
      // (A hurt, or a creature come near, and the hands let go.)
      if (p.hp >= p.hpMax || this.near(s) || !p.grounded) {
        this.mend = 0;
        return intent;
      }
      return B;
    }
    if (this.tap > 0) {
      this.tap--;
      return this.tap > 0 ? intent | B : intent & ~B;
    }
    const owns = (s.save.abilities as readonly string[]).includes('kindle');
    if (owns && s.frame - this.last > 40 && p.glow >= kindleCost(t) && kindleTarget(s, scene, t) >= 0) {
      this.last = s.frame;
      this.tap = 2;
      return intent | B;
    }
    if (p.hp < p.hpMax && p.glow >= t.glow.mendCost && p.grounded && !this.near(s) && (intent & B) === 0) {
      this.mend = t.glow.mendFrames + 4;
      return B;
    }
    return intent;
  }

  private near(s: GameState): boolean {
    const p = s.player;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    for (const e of s.enemies) {
      if (e.gone || e.mode === 'dead') continue;
      const dx = e.x + e.w / 2 - px;
      const dy = e.y + e.h / 2 - py;
      if (dx * dx + dy * dy < CALM * CALM) return true;
    }
    return false;
  }
}
