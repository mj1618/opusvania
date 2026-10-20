/**
 * `npx tsx tools/levels/downwood-check.ts`: the Downwood's world check (src/scene/world.ts `validateWorld`) with the
 * two later locks named: the Moon Perch (double jump) and the Lone Limb (dash) are seen from the start and opened
 * by abilities found after this area, so the check may say only that they cannot be reached yet.
 */
import { getWorld, progression, validateWorld } from '../../src/scene/world';

/** Rooms behind abilities this area never gives (the design's "later" locks). */
export const LATER = ['dw-moonperch', 'dw-lone-limb'];

export function downwoodProblems(): string[] {
  const w = getWorld('downwood');
  return validateWorld(w).filter((m) => !LATER.some((r) => m.includes(`"${r}`)));
}

if (process.argv[1]?.endsWith('downwood-check.ts')) {
  const probs = downwoodProblems();
  for (const p of probs) console.log(p);
  console.log(probs.length ? `${probs.length} problems` : 'world ok');
  console.log('abilities in order:', progression(getWorld('downwood')).abilities.join(', '));
}
