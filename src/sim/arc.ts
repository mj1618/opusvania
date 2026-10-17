/**
 * The throw's arc while she is caught (director's area 1: "while she's caught, show the throw's arc";
 * Ori's Bash preview). Each caught step, the flight the last beat would give her from where she is now,
 * with the direction she holds now: the real controller on a copy of the state (walls, other lures' pull,
 * the launch), a body-centre point every `lures.arcEvery` frames, until she lands, is caught again or
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

/** The predicted flight as flat `[x0, y0, x1, y1, ...]` body-centre points (empty when not caught by a lure). */
export function lureArc(state: GameState, scene: Scene, t: Tuning, P: MoveParams, input: number): number[] {
  const p = state.player;
  if (p.lure < 0 || p.grab >= 0) return [];
  const g = cloneState(state);
  const q = g.player;
  const held = input & DIRS;
  // The last beat, now: the same code path as a real one (the throw, then the rest of that step).
  q.lureBeats = Math.max(0, Math.round(t.lures.beats) - 1);
  q.lurePend = 1;
  q.lureCd = 0;
  q.dashBuf = 0;
  q.jumpBuf = 0;
  q.attackBuf = 0;
  g.prevInput = held;
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
    if (f > 0 && (q.grounded || q.lure >= 0 || q.hp <= 0)) {
      if (f % every !== 0) out.push(cx, cy);
      break;
    }
    if (q.y > scene.height || q.x + q.w < 0 || q.x > scene.width) break;
  }
  return out;
}
