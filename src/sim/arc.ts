/**
 * The fling's arc while she aims (memory/lures.md; Ori's Bash preview): each aiming step, the flight a release
 * now would give her with the direction she holds now: the real controller on a copy of the state (walls, the
 * launch, the flame going out), a body-centre point every `lures.arcEvery` frames, until she lands or
 * `lures.arcFrames` pass. Pure and deterministic (memory/sim-architecture.md); render reads `player.lureArc`.
 */
import type { SimEvent } from './events';
import { ActionBit } from './input';
import type { MoveParams } from './player/params';
import { updatePlayer } from './player/player';
import type { Scene } from './scene';
import { cloneState, type GameState } from './state';
import type { Tuning } from './tuning';

/** Scratch events for the copy (thrown away). */
const SCRATCH: SimEvent[] = [];
const DIRS = ActionBit.left | ActionBit.right | ActionBit.up | ActionBit.down;

/** The predicted flight as flat `[x0, y0, x1, y1, ...]` body-centre points (empty when she is not aiming). */
export function lureArc(state: GameState, scene: Scene, t: Tuning, P: MoveParams, input: number): number[] {
  if (state.player.fling < 0) return [];
  const g = cloneState(state);
  const q = g.player;
  // Lamp let go now, the stick as it is: the release step is the real one (the launch, then the rest of it).
  const held = input & DIRS;
  g.prevInput = held | ActionBit.lamp;
  // (Called at the end of a step, before its frame count moves on: the copy starts at the next step's frame.)
  g.frame = state.frame + 1;
  const every = Math.max(1, Math.round(t.lures.arcEvery));
  const n = Math.max(0, Math.round(t.lures.arcFrames));
  const out: number[] = [];
  for (let f = 0; f < n; f++) {
    SCRATCH.length = 0;
    updatePlayer(g, scene, held, P, t.pods, SCRATCH);
    g.prevInput = held;
    g.frame++;
    const cx = Math.round(q.x + q.w / 2);
    const cy = Math.round(q.y + q.h / 2);
    if (f % every === 0) out.push(cx, cy);
    if (f > 0 && (q.grounded || q.fling >= 0 || q.hp <= 0)) {
      if (f % every !== 0) out.push(cx, cy);
      break;
    }
    if (q.y > scene.height || q.x + q.w < 0 || q.x > scene.width) break;
  }
  return out;
}
