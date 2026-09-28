import { z } from 'zod';
import raw from '../../../content/moves.json' with { type: 'json' };
import { boxAt, type Rect } from '../combat/boxes';
import type { MoveDir } from '../events';
import { ActionBit, type InputFrame } from '../input';
import type { MoveState, PlayerState } from '../state';

/**
 * The move table (combat-spec §1.3, §7): a generic action state machine over content/moves.json.
 * Every move is data. `kind` picks the handler in src/sim/combat/kid.ts (strike, seize, levy,
 * swallow); `input` says which button and aim start it; the hitstop class, cancels, damage and
 * modifiers (runMult, root, launch, pogo, counterable...) are all read from the entry, so a new
 * move is a new JSON entry, not new code (L3 audit #2).
 *
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
export const BUTTONS = ['attack', 'seize', 'levy', 'special'] as const;
export type Button = (typeof BUTTONS)[number];

const MoveDefSchema = z.object({
  kind: z.enum(['strike', 'seize', 'levy', 'swallow']),
  input: z.object({
    button: z.enum(BUTTONS),
    /** fwd = neither Up nor (airborne) Down; any = every aim (the aim becomes the move's dir). */
    aim: z.enum(['fwd', 'up', 'down', 'any']),
    air: z.boolean().optional(),
    /** Only while this move is running (the 1-2): its buffer waits for the cancel frame. */
    chainFrom: z.string().optional(),
  }),
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
  runMult: z.number().min(0).max(1).default(1),
  root: z.boolean().default(false),
  featherRecovery: z.boolean().default(false),
  heavyBonus: z.boolean().default(false),
  counterable: z.boolean().default(false),
  launch: z.boolean().default(false),
  pogo: z.boolean().default(false),
  cancels: z.array(z.object({ into: z.array(z.string()), fromFrame: z.number().int().positive() })),
});
export type MoveDef = z.infer<typeof MoveDefSchema>;

const Table = z.record(z.string(), MoveDefSchema).superRefine((t, ctx) => {
  for (const [id, d] of Object.entries(t)) {
    if (d.input.chainFrom && !t[d.input.chainFrom])
      ctx.addIssue({ code: 'custom', message: `${id}: chainFrom names unknown move ${d.input.chainFrom}` });
    for (const c of d.cancels)
      for (const into of c.into)
        if (into !== 'jump' && into !== 'dash' && !t[into])
          ctx.addIssue({ code: 'custom', message: `${id}: cancels into unknown move ${into}` });
    if (d.kind === 'levy' && (!d.spawns || d.spawnFrame === undefined))
      ctx.addIssue({ code: 'custom', message: `${id}: a levy needs spawns and spawnFrame` });
  }
});

const { '//': _doc, ...entries } = raw as Record<string, unknown>;
export const MOVES: Record<string, MoveDef> = Table.parse(entries);
/** Move ids in table order (the resolver's tie-break). */
export const MOVE_IDS = Object.keys(MOVES);

export function moveDef(id: string): MoveDef {
  const d = MOVES[id];
  if (!d) throw new Error(`Unknown move "${id}". Known: ${MOVE_IDS.join(', ')}`);
  return d;
}

/** Total frames of a move instance given its outcome (whiffs and dry levies are shorter/longer). */
export function moveTotal(m: MoveState): number {
  if (m.len > 0) return m.len;
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

/** The button a press asks for (seize > levy > special > attack when pressed together). */
export function pressedButton(pressed: InputFrame): Button | '' {
  if (pressed & ActionBit.seize) return 'seize';
  if (pressed & ActionBit.levy) return 'levy';
  if (pressed & ActionBit.special) return 'special';
  if (pressed & ActionBit.attack) return 'attack';
  return '';
}

/**
 * Which move a button starts right now (combat-spec §1.1): a chained move (`chainFrom` = the move
 * running) beats an aimed one, which beats a plain one; table order breaks ties. `chain` is true
 * when the answer only exists because of the running move (its buffer waits for the cancel frame).
 */
export function resolveMove(
  button: string,
  input: InputFrame,
  grounded: boolean,
  current: MoveState | null,
): { id: string; dir: MoveDir; chain: boolean } | null {
  const aim = aimOf(input, grounded);
  let best: string | null = null;
  let bestScore = -1;
  for (const id of MOVE_IDS) {
    const d = MOVES[id] as MoveDef;
    const inp = d.input;
    if (inp.button !== button) continue;
    if (inp.aim !== 'any' && inp.aim !== aim) continue;
    if (inp.air && grounded) continue;
    if (inp.chainFrom && current?.id !== inp.chainFrom) continue;
    const score = (inp.chainFrom ? 2 : 0) + (inp.aim === 'up' || inp.aim === 'down' ? 1 : 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  if (best === null) return null;
  const d = MOVES[best] as MoveDef;
  const dir: MoveDir = d.input.aim === 'any' ? aim : d.input.aim;
  return { id: best, dir, chain: d.input.chainFrom !== undefined };
}

/** The hitbox of a move instance as a world rect (facing mirror via the box module), or null. */
export function moveHitbox(p: PlayerState, m: MoveState, counterScale = 1): Rect | null {
  const d = moveDef(m.id);
  const b = d.hitboxes[m.dir] ?? d.hitboxes.fwd;
  if (!b) return null;
  const r = boxAt(p.x, p.y, p.w, m.facing, b);
  if (m.counter && counterScale !== 1) {
    // Grow by a whole number of px on each side so the box stays mirror-symmetric (U2).
    const gx = Math.round((r.w * (counterScale - 1)) / 2);
    const gy = Math.round((r.h * (counterScale - 1)) / 2);
    return { x: r.x - gx, y: r.y - gy, w: r.w + 2 * gx, h: r.h + 2 * gy };
  }
  return r;
}
