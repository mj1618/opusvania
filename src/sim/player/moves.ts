import { z } from 'zod';
import raw from '../../../content/moves.json' with { type: 'json' };
import type { MoveDir } from '../events';
import { ActionBit, type InputFrame } from '../input';
import type { MoveState, PlayerState } from '../state';

/**
 * The move table (combat-spec §1.3, §7): a generic action state machine over content/moves.json.
 * L3 has jab, seize and levy; Cross, Uppercut, Overhand and Swallow are later entries.
 * Frame conventions: frame 1 is the press-consuming step (moveStart fires there); a move with
 * startup S is active on frames S+1..S+A; total = S + A + R (a whiff uses whiffRecovery).
 * Direction is read on the start frame: Up held = up; Down held while airborne = down; else fwd.
 */
const Box = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int().positive(),
  z.number().int().positive(),
]);
const MoveDef = z.object({
  startup: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  recovery: z.number().int().nonnegative(),
  whiffRecovery: z.number().int().nonnegative().optional(),
  spawnFrame: z.number().int().positive().optional(),
  dryTotal: z.number().int().positive().optional(),
  hitboxes: z.object({ fwd: Box.optional(), up: Box.optional(), down: Box.optional() }),
  spawns: z
    .object({
      fwd: z.tuple([z.number(), z.number()]),
      up: z.tuple([z.number(), z.number()]),
      down: z.tuple([z.number(), z.number()]),
    })
    .optional(),
  dmg: z.number().int().nonnegative(),
  cls: z.enum(['light', 'medium', 'heavy', 'seizeTake']),
  cancels: z.array(z.object({ into: z.array(z.string()), fromFrame: z.number().int().positive() })),
});
export type MoveDef = z.infer<typeof MoveDef>;
export type MoveId = 'jab' | 'seize' | 'levy';

const Table = z.object({ jab: MoveDef, seize: MoveDef, levy: MoveDef });
export const MOVES: Record<MoveId, MoveDef> = Table.parse(raw);

export function moveDef(id: string): MoveDef {
  const d = MOVES[id as MoveId];
  if (!d) throw new Error(`Unknown move "${id}"`);
  return d;
}

/** Total frames of a move instance given its outcome (whiffs and dry levies are shorter/longer). */
export function moveTotal(m: MoveState): number {
  const d = moveDef(m.id);
  // A dry levy (empty bag, decided on the spawn frame) is shorter.
  if (d.dryTotal !== undefined && m.outcome === 'whiff') return d.dryTotal;
  const miss = m.outcome === 'whiff' || m.outcome === 'guard' || m.outcome === 'refused';
  const rec = miss && d.whiffRecovery !== undefined ? d.whiffRecovery : d.recovery;
  return d.startup + (d.spawnFrame !== undefined ? 1 : d.active) + rec;
}

export function isActiveFrame(m: MoveState): boolean {
  const d = moveDef(m.id);
  return m.frame > d.startup && m.frame <= d.startup + d.active;
}

export function lastActiveFrame(m: MoveState): boolean {
  const d = moveDef(m.id);
  return d.active > 0 && m.frame === d.startup + d.active;
}

/** May `into` (a move id, 'jump' or 'dash') interrupt the current move on its current frame? */
export function canCancel(m: MoveState | null, into: string): boolean {
  if (!m) return true;
  for (const c of moveDef(m.id).cancels) if (m.frame >= c.fromFrame && c.into.includes(into)) return true;
  return false;
}

/** Aim on the start frame (combat-spec §1.1). */
export function aimOf(input: InputFrame, grounded: boolean): MoveDir {
  if ((input & ActionBit.up) !== 0) return 'up';
  if ((input & ActionBit.down) !== 0 && !grounded) return 'down';
  return 'fwd';
}

/** The hitbox of an active move as a world rect (facing mirror x' = w - x - bw). */
export function moveHitbox(
  p: PlayerState,
  m: MoveState,
): { x: number; y: number; w: number; h: number } | null {
  const b = moveDef(m.id).hitboxes[m.dir] ?? moveDef(m.id).hitboxes.fwd;
  if (!b) return null;
  const [bx, by, bw, bh] = b;
  const x = m.facing > 0 ? bx : p.w - bx - bw;
  return { x: p.x + x, y: p.y + by, w: bw, h: bh };
}
