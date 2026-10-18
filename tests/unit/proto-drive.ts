/**
 * Drives Lanternroot (the proto-1 world) in tests: a Game in that world, put anywhere with any kit, and small
 * closed-loop moves (walk to an x, a jump, a fling, a kindle). Not a test file: the proto-1 tests share it.
 */
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { PROTO_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { newSave } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { kindleTarget } from '../../src/sim/light';
import { flingTarget } from '../../src/sim/lures';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

export const L = ActionBit.left;
export const R = ActionBit.right;
export const U = ActionBit.up;
export const D = ActionBit.down;
export const J = ActionBit.jump;
export const A = ActionBit.attack;
export const B = ActionBit.lamp;

export interface Drive {
  g: Game;
  events: SimEvent[];
  run(mask: number, n?: number): SimEvent[];
  until(mask: number | ((k: number) => number), pred: () => boolean, max?: number): boolean;
  feet(): { x: number; y: number };
  walkTo(x: number, max?: number): boolean;
  scene(): Room;
}

/**
 * A game in the proto-1 world, booted in `room` with `abilities` and the save's `flags` / `opened`, standing at
 * (x, y) (feet). Every event kept.
 */
export function drive(
  room: string,
  x: number,
  y: number,
  abilities: string[] = ['glide', 'wallJump', 'doubleJump'],
  more: { flags?: string[]; opened?: string[]; taken?: string[]; glow?: number } = {},
): Drive {
  const t = cloneTuning(defaultTuning);
  const save = newSave(abilities as never);
  save.flags.push(...(more.flags ?? []));
  save.opened.push(...(more.opened ?? []));
  save.taken.push(...(more.taken ?? []));
  save.visited.push(room);
  const g = new Game(t, getRoom(room), 1, () => 0, null, { world: PROTO_WORLD });
  g.mode = 'manual';
  g.state.save = save;
  g.reset(room);
  g.state.save = save;
  const events: SimEvent[] = [];
  g.afterStep.add((ev) => events.push(...ev));
  g.goto(room, x, y);
  if (more.glow !== undefined) g.state.player.glow = more.glow;
  const d: Drive = {
    g,
    events,
    run(mask, n = 1) {
      const from = events.length;
      for (let i = 0; i < n; i++) {
        g.queueInput([mask]);
        g.stepOnce();
      }
      return events.slice(from);
    },
    until(mask, pred, max = 600) {
      for (let k = 0; k < max; k++) {
        if (pred()) return true;
        g.queueInput([typeof mask === 'number' ? mask : mask(k)]);
        g.stepOnce();
      }
      return pred();
    },
    feet() {
      const p = g.state.player;
      return { x: p.x + p.w / 2, y: p.y + p.h };
    },
    walkTo(tx, max = 600) {
      const ok = d.until(
        () => (d.feet().x < tx ? R : L),
        () => Math.abs(d.feet().x - tx) < 8,
        max,
      );
      d.run(0, 4);
      return ok;
    },
    scene() {
      return g.scene;
    },
  };
  return d;
}

/** The id of the flame in fling reach now, or null; the cold moonwick in kindle reach, or null. */
export function flameInReach(d: Drive): string | null {
  const i = flingTarget(d.g.state, d.g.scene, d.g.tuning);
  return i >= 0 ? (d.g.scene.lures?.[i]?.id ?? null) : null;
}
export function wickInReach(d: Drive): string | null {
  const i = kindleTarget(d.g.state, d.g.scene, d.g.tuning);
  return i >= 0 ? (d.g.scene.lures?.[i]?.id ?? null) : null;
}

/** A fling off whatever flame is in reach: Lamp with `aim`, held `hold` frames, let go; then `fly` until she lands. */
export function flingNow(d: Drive, aim: number, fly = aim & (L | R), hold = 4, max = 300): void {
  d.run(aim | B, hold);
  d.run(aim);
  d.until(fly, () => d.g.state.player.grounded, max);
}

export const of = <K extends SimEvent['type']>(ev: SimEvent[], type: K) =>
  ev.filter((e) => e.type === type) as Extract<SimEvent, { type: K }>[];
