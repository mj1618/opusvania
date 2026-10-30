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

// Every set piece framed (r9, review r8 #8): a trigger that wakes creatures (its `sets` is some creature's `wakes`)
// has a camera zone over it that lets go when the wave is cleared (`until` = a flag those creatures set).
const framed: string[] = [];
for (const r of Object.values(w.rooms)) {
  const room = r.scene as unknown as {
    id: string;
    triggers?: Array<{ id: string; x: number; y: number; w: number; h: number; sets: string }>;
    enemies?: Array<{ wakes?: string; sets?: string }>;
    camera?: { zones?: Array<{ id: string; x: number; y: number; w: number; h: number; until?: string }> };
  };
  for (const t of room.triggers ?? []) {
    const woken = (room.enemies ?? []).filter((e) => e.wakes === t.sets);
    if (woken.length === 0) continue;
    const clears = new Set<string>();
    // (The wave's flags: what the woken set, and on down the beats they wake.)
    let wave = woken;
    for (let k = 0; k < 4 && wave.length; k++) {
      const next: typeof wave = [];
      for (const e of wave)
        if (e.sets && !clears.has(e.sets)) {
          clears.add(e.sets);
          next.push(...(room.enemies ?? []).filter((q) => q.wakes === e.sets));
        }
      wave = next;
    }
    const zone = (room.camera?.zones ?? []).find(
      (z) =>
        z.x < t.x + t.w &&
        t.x < z.x + z.w &&
        z.y < t.y + t.h &&
        t.y < z.y + z.h &&
        z.until !== undefined &&
        clears.has(z.until),
    );
    if (!zone) framed.push(`${room.id}:${t.id} (wakes ${woken.length}) has no camera zone keyed to its wave`);
  }
}
for (const f of framed) console.log(`[frame] ${f}`);
if (framed.length) process.exitCode = 1;
else console.log('every creature-waking trigger has a camera zone keyed to its wave');
