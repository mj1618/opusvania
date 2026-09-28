/**
 * Golden gym replays (movement-spec §7.3): `tests/replays/gym-NN.<abilities>.json`.
 * Shared by tests/unit/replays.test.ts and `npm run replays:update` (tests/replays/update.ts).
 *
 * Two levels of assertion:
 *  1. Behavioural (survives tuning changes): the tape reaches G within expect.maxFrames, zero deaths.
 *  2. Golden (only while tuningHash matches the current preset tuning): exact goal frame, end
 *     position and a state hash every 60 frames. A tuning change marks goldens stale, not failed.
 */
import { parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, hashState, step } from '../../src/sim/index';
import { type PresetName, presetTuning, type Tuning } from '../../src/sim/tuning';
import { type Abilities, getRoom } from '../../src/sim/world/rooms';

export interface GoldenReplay {
  room: string;
  seed: number;
  preset: PresetName;
  /** Abilities the tape runs with (defaults to the room's). */
  abilities: Abilities;
  tuningHash: string;
  /** Input tape in the spec DSL. */
  inputs: string;
  expect: {
    maxFrames: number;
    goalFrame: number;
    deaths: number;
    end: { x: number; y: number; frame: number };
    /** hashState after frames 60, 120, ... */
    hashes: string[];
  };
  notes?: string;
}

export function tuningHash(t: Tuning): string {
  return hashState(t);
}

export interface ReplayRun {
  goalFrame: number;
  deaths: number;
  states: string[];
  end: { x: number; y: number; frame: number };
  hashes: string[];
  frames: number;
  /** Per-frame player snapshots (for mirror tests). */
  trace: GameState['player'][];
}

export function runGolden(
  r: Pick<GoldenReplay, 'room' | 'seed' | 'preset' | 'abilities' | 'inputs'>,
  tuning?: Tuning,
): ReplayRun {
  const t = tuning ?? presetTuning(r.preset);
  const s = createState({ seed: r.seed, roomId: r.room }, t);
  Object.assign(s.player.abilities, r.abilities);
  let goalFrame = 0;
  let deaths = 0;
  const states = new Set<string>();
  const hashes: string[] = [];
  const trace: GameState['player'][] = [];
  let frame = 0;
  let end = { x: s.player.x, y: s.player.y, frame: 0 };
  for (const m of parseInputScript(r.inputs)) {
    const evs: SimEvent[] = [];
    step(s, m, t, evs);
    frame++;
    trace.push(JSON.parse(JSON.stringify(s.player)));
    states.add(s.player.state);
    deaths += evs.filter((e) => e.type === 'death').length;
    if (frame % 60 === 0) hashes.push(hashState(s));
    if (!goalFrame && evs.some((e) => e.type === 'goal' && e.kind === 'main' && e.roomId === r.room)) {
      goalFrame = frame;
      end = { x: s.player.x, y: s.player.y, frame };
    }
  }
  return { goalFrame, deaths, states: [...states], end, hashes, frames: frame, trace };
}

export function roomAbilities(room: string): Abilities {
  return { ...getRoom(room).abilities };
}

export function abilitiesTag(a: Abilities): string {
  const on = Object.entries(a)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return on.length === 0 ? 'none' : on.length === 4 ? 'all' : on.join('+');
}
