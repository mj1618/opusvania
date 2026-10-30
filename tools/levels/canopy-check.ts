/**
 * `npx tsx tools/levels/canopy-check.ts`: the Canopy's world check (src/scene/world.ts `validateWorld`), its
 * progression, and the generator's own scene checks (secret walls fill their openings, rooms at least 2560 x 1440).
 */
import { getWorld, progression, validateWorld } from '../../src/scene/world';

const w = getWorld('canopy');
const problems = validateWorld(w);
for (const p of problems) console.log(`[world] ${p}`);
const p = progression(w);
console.log(
  `abilities in order: ${p.abilities.join(' -> ')}; ${problems.length ? `${problems.length} problems` : 'world check passes'}`,
);
process.exitCode = problems.length ? 1 : 0;
