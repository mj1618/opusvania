import { describe, expect, it } from 'vitest';
import { fuzz } from '../../../tools/fuzz';

/**
 * The fast subset of the fuzzer (L3 audit #1: invariants must run in `npm run check`): seeded
 * random input in every combat room, checking conservation, overlap, tokens, Chin, legal states,
 * room regeneration, A4/T7 feedback and T4 telegraph gaps every step. The full run is
 * `npm run fuzz -- --room <id> --runs 500 --frames 3600`.
 */
const ROOMS = [
  'the-pit',
  'auction',
  'ring-barker',
  'ring-gull',
  'ring-grinder',
  'ring-clerk',
  'yard',
  'lot-7',
];

describe('fuzz invariants (fast subset)', () => {
  for (const room of ROOMS)
    it(room, () => {
      const r = fuzz({ room, runs: 6, frames: 900, seed: 7, verbs: true });
      expect(r.violations).toEqual([]);
      expect(r.a4.bad).toEqual([]);
      expect(r.d3.bad).toEqual([]);
    });
});
