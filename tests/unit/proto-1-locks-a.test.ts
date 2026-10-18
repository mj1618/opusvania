/**
 * Lanternroot's skip-hunter (tools/solve/proto-1.ts `huntLock`, docs/design/levels/proto-1.md §10.1): from the places
 * before each tool, without it, the explorer tries every move it knows (walks, hops, double jumps, glides, wall
 * climbs, flings off every warm lamp burning for ever with every aim and a chain after it, pogos, cuts, gust hops)
 * and must never reach what the tool opens. A search proves reach, so "held" means: none of those lines gets there
 * within the node budget (tools/levels/lanternroot-graph.ts `LOCKS`). Here each hunt has a short budget (`TEST_BUDGET`
 * nodes: the nearest ways round, in seconds); `npx tsx tools/solve/proto-1.ts --locks` runs the full ones (2500).
 */
import { describe, expect, it } from 'vitest';
import { LOCKS } from '../../tools/levels/lanternroot-graph';
import { huntLock } from '../../tools/solve/proto-1';

const TEST_BUDGET = 400;

/** The locks this file hunts (three files share them: vitest runs files side by side). */
const PART = 0;

describe('Lanternroot: the locks hold', () => {
  for (const k of LOCKS.filter((_, i) => i % 3 === PART)) {
    it(k.id, () => {
      const r = huntLock(k, Math.min(TEST_BUDGET, k.budget ?? TEST_BUDGET));
      expect(r.found ?? 'held', `a way round: ${r.found}`).toBe('held');
    }, 300_000);
  }
});
