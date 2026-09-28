import { parseInputScript } from '../../../src/input/script';
import type { SimEvent } from '../../../src/sim/events';
import { createState, type GameState, step } from '../../../src/sim/index';
import { cloneTuning, defaultTuning, type Tuning } from '../../../src/sim/tuning';
import { buildRoom, type RoomFile, registerRoom } from '../../../src/sim/world/rooms';

/** L3 lab rooms: 30x17, floor on row 15, the given rows painted over air. */
let n = 0;
export const SIG_ABILITIES = {
  wallJump: false,
  dash: true,
  doubleJump: false,
  pogo: false,
  seize: true,
  levy: true,
};

export const SOURCES = {
  H: { sound: 'partition', colour: 'pink' as const },
  F: { sound: 'furnace', colour: 'brown' as const },
  W: { sound: 'static', colour: 'white' as const },
};

/**
 * `paint` is a list of [row, col, text] strings written into an empty 30x17 room (row 15 = floor).
 * Returns the room id.
 */
export function lab(paint: [number, number, string][], extra: Partial<RoomFile> = {}): string {
  const rows = Array.from({ length: 17 }, (_, y) =>
    y === 0 || y >= 15 ? '#'.repeat(30) : `#${'.'.repeat(28)}#`,
  ).map((r) => r.split(''));
  for (const [y, x, text] of paint)
    for (let i = 0; i < text.length; i++) (rows[y] as string[])[x + i] = text[i] as string;
  const id = `siglab-${n++}`;
  registerRoom(
    buildRoom({
      id,
      rows: rows.map((r) => r.join('')),
      abilities: SIG_ABILITIES,
      sources: SOURCES,
      ...extra,
    } as RoomFile),
  );
  return id;
}

export interface Run {
  s: GameState;
  t: Tuning;
  /** Events per step (index 0 = step 1). */
  steps: SimEvent[][];
  /** State snapshots after each step (only when requested). */
  snaps: GameState[];
}

export function start(roomId: string, t: Tuning = cloneTuning(defaultTuning)): Run {
  return { s: createState({ seed: 1, roomId }, t), t, steps: [], snaps: [] };
}

/** Runs a DSL script; returns the run (events per step appended). */
export function play(r: Run, script: string, snap = false): Run {
  for (const m of parseInputScript(script)) {
    const ev: SimEvent[] = [];
    step(r.s, m, r.t, ev);
    r.steps.push(ev);
    if (snap) r.snaps.push(JSON.parse(JSON.stringify(r.s)) as GameState);
  }
  return r;
}

/** 1-based step index of the first event of `type` (or -1). */
export function firstStep(r: Run, type: string, from = 0): number {
  for (let i = from; i < r.steps.length; i++) if (r.steps[i]?.some((e) => e.type === type)) return i + 1;
  return -1;
}

export function count(r: Run, type: string): number {
  return r.steps.reduce((a, ev) => a + ev.filter((e) => e.type === type).length, 0);
}
