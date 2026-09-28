import { parseInputScript } from '../../../src/input/script';
import type { SimEvent } from '../../../src/sim/events';
import { createState, type GameState, spawnEnemyAt, step } from '../../../src/sim/index';
import type { Enemy } from '../../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../../src/sim/tuning';
import { buildRoom, type RoomFile, registerRoom } from '../../../src/sim/world/rooms';

/**
 * Combat lab rooms: 30x17, floor on row 15 (feet at y 960), Kid at tile (4, 14) = x 276..316.
 * Enemies are spawned by the test (no spawn grace), so timings are exact.
 */
let n = 0;
export const COMBAT_ABILITIES = {
  wallJump: false,
  dash: true,
  doubleJump: false,
  pogo: false,
  seize: true,
  levy: true,
};

export function combatLab(paint: [number, number, string][] = [], extra: Partial<RoomFile> = {}): string {
  const rows = Array.from({ length: 17 }, (_, y) =>
    y === 0 || y >= 15 ? '#'.repeat(30) : `#${'.'.repeat(28)}#`,
  ).map((r) => r.split(''));
  (rows[14] as string[])[4] = 'P';
  for (const [y, x, text] of paint)
    for (let i = 0; i < text.length; i++) (rows[y] as string[])[x + i] = text[i] as string;
  const id = `combatlab-${n++}`;
  registerRoom(
    buildRoom({
      id,
      rows: rows.map((r) => r.join('')),
      abilities: COMBAT_ABILITIES,
      hazard: 'pip',
      sources: {
        H: { sound: 'partition', colour: 'pink' },
        F: { sound: 'furnace', colour: 'brown' },
        W: { sound: 'static', colour: 'white' },
      },
      ...extra,
    } as RoomFile),
  );
  return id;
}

export const FLOOR_Y = 960;
export const KID_X = 4 * 64 + 32;

export interface Fight {
  s: GameState;
  t: Tuning;
  steps: SimEvent[][];
}

export function fight(room = combatLab(), t: Tuning = cloneTuning(defaultTuning)): Fight {
  return { s: createState({ seed: 1, roomId: room }, t), t, steps: [] };
}

/** Spawns an enemy with its centre `dx` px right of Kid's centre, feet on the floor (or `feetY`). */
export function put(f: Fight, type: string, dx: number, feetY = FLOOR_Y): Enemy {
  const id = spawnEnemyAt(f.s, type, KID_X + dx, feetY);
  return f.s.local.enemies.find((e) => e.id === id) as Enemy;
}

export function play(f: Fight, script: string): Fight {
  for (const m of parseInputScript(script)) {
    const ev: SimEvent[] = [];
    step(f.s, m, f.t, ev);
    f.steps.push(ev);
  }
  return f;
}

/** Steps until `pred` holds (at most `max` steps, input `mask`); returns the steps taken or -1. */
export function until(f: Fight, pred: (f: Fight) => boolean, max = 600, mask = 0): number {
  for (let i = 0; i < max; i++) {
    if (pred(f)) return i;
    const ev: SimEvent[] = [];
    step(f.s, mask, f.t, ev);
    f.steps.push(ev);
  }
  return pred(f) ? max : -1;
}

export function events(f: Fight, type: string): SimEvent[] {
  return f.steps.flat().filter((e) => e.type === type);
}

/** 1-based index (into f.steps) of the first step with an event of `type`, from `from`. */
export function stepOf(f: Fight, type: string, from = 0): number {
  for (let i = from; i < f.steps.length; i++) if (f.steps[i]?.some((e) => e.type === type)) return i + 1;
  return -1;
}

export function enemy(f: Fight, id: number): Enemy {
  return f.s.local.enemies.find((e) => e.id === id) as Enemy;
}

/** Walks Kid toward enemy `id` until the gap between bodies is <= `gap` px (at most `max` steps). */
export function closeIn(f: Fight, id: number, gap = 24, max = 120): void {
  const R = 1 << 1;
  const L = 1 << 0;
  // Let the freeze, Kid's move and the knockback slide finish first.
  until(f, (x) => x.s.hitstop === 0 && !x.s.player.move && enemy(x, id).kb === 0, 60);
  for (let i = 0; i < max; i++) {
    const e = enemy(f, id);
    const p = f.s.player;
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    if (Math.abs(dx) - (e.w + p.w) / 2 <= gap) {
      // Face it and stop.
      until(f, () => Math.abs(f.s.player.vx) < 0.01, 20, 0);
      return;
    }
    until(f, () => false, 1, dx > 0 ? R : L);
  }
}
