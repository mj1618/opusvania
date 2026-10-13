import { parseInputScript } from '../../src/input/script';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';

/** A flat test scene: floor top at y = 800, 4000 wide, plus whatever solids / one-ways are given. */
export function flatScene(extra: Partial<Pick<Scene, 'solids' | 'oneWays'>> = {}): Scene {
  return {
    id: 'test',
    width: 4000,
    height: 1000,
    spawn: { x: 2000, y: 800 },
    solids: [{ tag: 'ground', x: 0, y: 800, w: 4000, h: 200 }, ...(extra.solids ?? [])],
    oneWays: extra.oneWays ?? [],
  };
}

export interface Sim {
  state: GameState;
  tuning: Tuning;
  scene: Scene;
  events: SimEvent[];
  /** Runs an input script; returns the events of just this run. */
  run(script: string): SimEvent[];
  place(x: number, y: number): void;
}

export function newSim(scene: Scene = GROVE, t: Tuning = cloneTuning(defaultTuning)): Sim {
  const events: SimEvent[] = [];
  const state = createState(1, t, scene, events);
  return {
    state,
    tuning: t,
    scene,
    events,
    run(script) {
      const from = events.length;
      for (const input of parseInputScript(script)) step(state, input, t, scene, events);
      return events.slice(from);
    },
    place(x, y) {
      placePlayer(state, x, y, t, scene, events);
    },
  };
}

export const feet = (s: Sim) => ({
  x: s.state.player.x + s.state.player.w / 2,
  y: s.state.player.y + s.state.player.h,
});

/**
 * A simple pilot: gets on top of a platform (anything with x, y, w), walking out from under it
 * first if needed, jumping when it is higher and double-jumping at the apex if still short.
 * Returns the frames it took, or -1 if it was not standing on it inside `maxFrames`.
 */
export function hopOnto(s: Sim, r: { x: number; y: number; w: number }, maxFrames = 420): number {
  const J = ActionBit.jump;
  const bit = (d: number) => (d > 0 ? ActionBit.right : d < 0 ? ActionBit.left : 0);
  let prev = 0;
  for (let f = 0; f < maxFrames; f++) {
    const p = s.state.player;
    const at = feet(s);
    const inset = Math.min(40, r.w / 2);
    const aim = Math.max(r.x + inset, Math.min(r.x + r.w - inset, at.x));
    if (p.grounded && at.y === r.y && at.x > r.x && at.x < r.x + r.w) return f;
    let m: number;
    const under = at.y > r.y && at.x > r.x - 60 && at.x < r.x + r.w + 60;
    if (under && p.grounded) {
      // Walk out to the nearer side before jumping, so the platform is not a ceiling.
      m = bit(at.x - r.x < r.x + r.w - at.x ? -1 : 1);
    } else {
      // While still below the top, stay just outside the edge so the platform is not a ceiling.
      const side = at.x < r.x + r.w / 2 ? r.x - 26 : r.x + r.w + 26;
      const goal = at.y > r.y && !p.grounded ? side : aim;
      m = Math.abs(at.x - goal) > 6 ? bit(goal - at.x) : 0;
      if (at.y > r.y) {
        // Hold jump while rising; at the top let go for a frame, then press again (double jump).
        if (p.grounded) m |= Math.abs(at.x - aim) < 280 && (prev & J) === 0 ? J : 0;
        else if (p.vy < 0) m |= J;
        else if (p.dj > 0 && (prev & J) === 0) m |= J;
      }
    }
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  return -1;
}

/**
 * Wall-jump pilot: zigzags up between two facing walls until the feet are above `topY`, then
 * holds `exitDir` to land. Returns the number of wall jumps, or -1 if it never got there.
 */
export function wallClimb(s: Sim, topY: number, exitDir: -1 | 1, maxFrames = 600): number {
  const J = ActionBit.jump;
  const bit = (d: number) => (d > 0 ? ActionBit.right : ActionBit.left);
  let dir = 1;
  let prev = 0;
  let jumps = 0;
  for (let f = 0; f < maxFrames; f++) {
    const p = s.state.player;
    if (feet(s).y <= topY && p.grounded) return jumps;
    let m: number;
    if (feet(s).y < topY - 40) m = bit(exitDir);
    else if (p.grounded) m = bit(dir) | ((prev & J) !== 0 ? 0 : J);
    else if (p.mode === 'wallSlide' && (prev & J) === 0) {
      dir = -p.wallDir;
      m = bit(dir) | J;
      jumps++;
    } else m = bit(dir) | (p.vy < 0 ? J : 0);
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  return -1;
}
