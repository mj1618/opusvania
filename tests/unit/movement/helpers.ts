import { parseInputScript } from '../../../src/input/script';
import type { SimEvent } from '../../../src/sim/events';
import { createState, type GameState, step } from '../../../src/sim/index';
import { ActionBit, type InputFrame } from '../../../src/sim/input';
import { oneWayUnder, solidAt } from '../../../src/sim/physics/aabb';
import { resolveParams } from '../../../src/sim/player/params';
import { cloneTuning, defaultTuning, type Tuning } from '../../../src/sim/tuning';
import {
  type Abilities,
  ALL_ABILITIES,
  buildRoom,
  getRoom,
  type Room,
  registerRoom,
} from '../../../src/sim/world/rooms';

export const TS = 64;
let nextId = 0;

/**
 * Builds a test room from a list of "paint" operations on a W×H grid (border solid, inside air).
 * Rows are written top to bottom; `P` is required by the schema, so one is added at `spawn`.
 */
export function makeRoom(
  w: number,
  h: number,
  paint: (set: (tx: number, ty: number, ch: string) => void) => void = () => {},
  opts: { spawn?: [number, number]; abilities?: Abilities } = {},
): Room {
  const g: string[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.')),
  );
  paint((tx, ty, ch) => {
    const row = g[ty];
    if (row) row[tx] = ch;
  });
  const [sx, sy] = opts.spawn ?? [2, h - 2];
  const srow = g[sy];
  if (srow) srow[sx] = 'P';
  return registerRoom(
    buildRoom({
      id: `test-${nextId++}`,
      abilities: opts.abilities ?? ALL_ABILITIES,
      rows: g.map((r) => r.join('')),
    }),
  );
}

export function fill(
  set: (tx: number, ty: number, ch: string) => void,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ch = '#',
) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
}

export interface World {
  state: GameState;
  tuning: Tuning;
  room: Room;
  /** Events of every frame so far, with the frame number (1-based) they happened on. */
  log: Array<{ frame: number; e: SimEvent }>;
  frame: number;
}

export type TuningMod = (t: Tuning) => void;

export function world(room: Room, mod?: TuningMod, abilities?: Partial<Abilities>): World {
  const tuning = cloneTuning(defaultTuning);
  mod?.(tuning);
  const state = createState({ seed: 1, roomId: room.id }, tuning);
  if (abilities) Object.assign(state.player.abilities, abilities);
  return { state, tuning, room, log: [], frame: 0 };
}

/** Puts the player at (x, y) at rest, recomputing `grounded` like the sim does. */
export function place(w: World, x: number, y: number, vx = 0, vy = 0): void {
  const p = w.state.player;
  const r = getRoom(w.state.roomId);
  p.x = x;
  p.y = y;
  p.rx = 0;
  p.ry = 0;
  p.vx = vx;
  p.vy = vy;
  p.grounded = vy >= 0 && (solidAt(r, TS, x, y + 1, p.w, p.h) || oneWayUnder(r, TS, x, y, p.w, p.h));
  p.coyote = p.grounded ? resolveParams(w.tuning, p.profile).coyoteFrames : 0;
  p.airTopY = y;
  p.facing = 1;
}

/** Steps one frame; returns that frame's events. */
export function stepMask(w: World, mask: InputFrame): SimEvent[] {
  const evs: SimEvent[] = [];
  step(w.state, mask, w.tuning, evs);
  w.frame++;
  for (const e of evs) w.log.push({ frame: w.frame, e });
  return evs;
}

/** Runs a script; calls `each` after every frame. Returns all events of the run. */
export function run(
  w: World,
  script: string,
  each?: (frame: number, s: GameState, evs: SimEvent[]) => void,
): SimEvent[] {
  const all: SimEvent[] = [];
  for (const m of parseInputScript(script)) {
    const evs = stepMask(w, m);
    all.push(...evs);
    each?.(w.frame, w.state, evs);
  }
  return all;
}

export const B = ActionBit;

export function eventsOf<T extends SimEvent['type']>(
  evs: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return evs.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** Standard open test room 40×20 with a floor (row 18 top = 1152). */
export function openRoom(abilities?: Abilities): Room {
  return makeRoom(40, 20, undefined, { spawn: [4, 18], abilities });
}

export const FLOOR_Y = 19 * TS; // top of the bottom border row in openRoom
export const STAND_Y = FLOOR_Y - 80;
