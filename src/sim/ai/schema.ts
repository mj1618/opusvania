import { z } from 'zod';
import barker from '../../../content/enemies/barker.json' with { type: 'json' };
import grinder from '../../../content/enemies/grinder.json' with { type: 'json' };
import { COLOURS } from '../world/rooms';

/**
 * Enemy data schema (combat-spec §4.1, L3 subset). Boxes are [x, y, w, h] in px relative to the
 * enemy's top-left when facing right (mirrored as x' = bodyW - x - w when facing left).
 * Telegraphs are validated >= 15 frames (the 250 ms pillar, check D3).
 */
const Box = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int().positive(),
  z.number().int().positive(),
]);
export type Box = z.infer<typeof Box>;

const MIN_TELEGRAPH = 15;

const Attack = z.object({
  /** Sound id this attack comes from; it is armed only while that sound is home. null = generic (Snatch). */
  sound: z.string().nullable(),
  /** Snatch: only used while retrieving a sound from Kid's bag. */
  snatch: z.boolean().default(false),
  trigger: z.object({
    /** Kid's centre within rangeX horizontally (either side; the enemy turns) and rangeY vertically. */
    rangeX: z.number().positive(),
    rangeY: z.number().nonnegative(),
    cooldown: z.number().int().nonnegative(),
    weight: z.number().int().positive(),
  }),
  telegraph: z.number().int().min(MIN_TELEGRAPH),
  /** Backs up this far over the telegraph (px). */
  teleBackPx: z.number().nonnegative().default(0),
  active: z.number().int().positive(),
  recovery: z.number().int().positive(),
  /** Recovery after hitting a wall (wall stun). */
  wallStunRecovery: z.number().int().positive().optional(),
  hitboxes: z.array(
    z.object({ fromFrame: z.number().int().positive(), toFrame: z.number().int().positive(), box: Box }),
  ),
  /** Forward speed while active (px/f), and whether it stops at walls / ledge edges. */
  vx: z.number().default(0),
  stopAtWall: z.boolean().default(false),
  stopAtLedge: z.boolean().default(false),
  dmg: z.number().int().nonnegative(),
  /** Snatch push on Kid (px/f). */
  push: z.number().default(0),
  cue: z.object({
    tint: z.enum(COLOURS),
    audio: z.string(),
    pulses: z.number().int().nonnegative().default(0),
  }),
});
export type AttackDef = z.infer<typeof Attack>;

export const EnemySchema = z
  .object({
    id: z.string(),
    body: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
    hurtbox: Box,
    hp: z.number().int().positive(),
    contactDmg: z.number().int().nonnegative(),
    kbScale: z.number().min(0).max(1.5),
    poundage: z.number().int().nonnegative(),
    flying: z.boolean(),
    class: z.enum(['fodder', 'elite', 'boss']),
    sounds: z.array(z.object({ id: z.string(), colour: z.enum(COLOURS), seizable: z.boolean() })).min(1),
    seizeOrder: z.array(z.string()),
    attacks: z.record(z.string(), Attack),
    movement: z.object({
      patrolSpeed: z.number().nonnegative(),
      chaseSpeed: z.number().nonnegative(),
      aggroRange: z.number().positive(),
      /** Hop toward Kid when she is up to maxRisePx higher and within withinPx horizontally. */
      jump: z
        .object({
          risePx: z.number().positive(),
          maxRisePx: z.number().positive(),
          withinPx: z.number().positive(),
        })
        .optional(),
    }),
    furious: z.object({ speedMult: z.number().positive(), telegraphDelta: z.number().int() }),
  })
  .superRefine((e, ctx) => {
    const ids = new Set(e.sounds.map((s) => s.id));
    for (const s of e.sounds)
      if ((s.colour === 'white') === s.seizable)
        ctx.addIssue({
          code: 'custom',
          message: `${e.id}.${s.id}: white sounds are exactly the unseizable ones (T2)`,
        });
    for (const id of e.seizeOrder)
      if (!ids.has(id))
        ctx.addIssue({ code: 'custom', message: `${e.id}: seizeOrder names unknown sound ${id}` });
    for (const [aid, a] of Object.entries(e.attacks)) {
      if (a.sound !== null && !ids.has(a.sound))
        ctx.addIssue({ code: 'custom', message: `${e.id}.${aid}: unknown sound ${a.sound}` });
      const snd = e.sounds.find((s) => s.id === a.sound);
      if (snd && a.cue.tint !== snd.colour)
        ctx.addIssue({ code: 'custom', message: `${e.id}.${aid}: cue tint must be its sound's colour (T3)` });
      if (a.telegraph + e.furious.telegraphDelta < MIN_TELEGRAPH && e.furious.telegraphDelta < 0) {
        // Furious telegraphs are clamped at runtime (combat.minTelegraph); nothing to report.
      }
    }
  });
export type EnemyDef = z.infer<typeof EnemySchema>;

const DEFS: Record<string, EnemyDef> = {};
for (const raw of [barker, grinder]) {
  const d = EnemySchema.parse(raw);
  DEFS[d.id] = d;
}

export function enemyDef(type: string): EnemyDef {
  const d = DEFS[type];
  if (!d) throw new Error(`Unknown enemy "${type}". Known: ${Object.keys(DEFS).join(', ')}`);
  return d;
}

export function enemyTypes(): string[] {
  return Object.keys(DEFS);
}
