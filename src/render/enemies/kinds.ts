/**
 * Which renderer draws which creature kind, per room look (no Pixi here: the check in
 * tests/unit/creature-renderers.test.ts reads it for every room in content/, so an invisible enemy cannot ship again;
 * canopy review r2 #3 found the old burrback, the juveniles and the hawkers simulated but never drawn in the wood).
 *
 * - `beetle`: the burrback's rig (render/enemies/burrback.ts), scaled per kind about its feet.
 * - `moth`: the lampwing's art (render/enemies/lampwing.ts).
 * - `ant`: the carriers' own rig (render/enemies/ant.ts; until r22 the burrback's rig at 0.5, which read as moss).
 * - `dragonfly`: the hawkers' own rig (render/enemies/dragonfly.ts; until r22 the lampwing's art: a friendly moth).
 * - `spider`: Lanternroot's pieces (render/lantern/creatures.ts: danglers, webs and their weavers, the Gloamweaver,
 *   the Weaver, the mantis), built in a Lanternroot room or a wood room with `art.pieces`.
 * - Greybox rooms draw every kind as its box (render/greybox/creatures.ts).
 */
import type { EnemyKind } from '../../sim/scene';

export type CreatureArt = 'beetle' | 'moth' | 'ant' | 'dragonfly' | 'spider' | 'greybox';

export interface LookKey {
  kit: 'grove' | 'wood' | 'lanternroot';
  /** A wood room with Lanternroot's pieces (`art.pieces`), or a Lanternroot room. */
  pieces: boolean;
  greybox: boolean;
}

/** The beetle rig's scale per kind in a painted room (the old burrback is 256 x 154 against the burrback's 52 x 34). */
export const BEETLE_SCALE: Partial<Record<EnemyKind, number>> = {
  burrback: 1,
  juvenileBurrback: 0.72,
  oldBurrback: 4.4,
};

const SPIDER_KINDS: ReadonlySet<string> = new Set([
  'dangler',
  'web',
  'weaver',
  'gloamweaver',
  'weaverBoss',
  'mantis',
]);

/** The renderer that draws `kind` in a room of this look, or null if nothing would draw it. */
export function creatureArt(kind: EnemyKind, look: LookKey): CreatureArt | null {
  if (look.greybox) return 'greybox';
  // The test grove draws only its own two kinds.
  if (look.kit === 'grove') return kind === 'burrback' ? 'beetle' : kind === 'lampwing' ? 'moth' : null;
  if (kind in BEETLE_SCALE) return 'beetle';
  if (kind === 'carrier') return 'ant';
  if (kind === 'hawker') return 'dragonfly';
  if (kind === 'lampwing') return 'moth';
  if (look.pieces && SPIDER_KINDS.has(kind)) return 'spider';
  return null;
}
