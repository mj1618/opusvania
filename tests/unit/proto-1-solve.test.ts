/**
 * Lanternroot's solver in the tests (tools/solve/proto-1.ts, docs/design/levels/proto-1.md §9): the world file is
 * sound; every edge of the level's graph replays its stored line in the real sim (the explorer found them:
 * `npx tsx tools/solve/proto-1.ts --write` refreshes them after a layout change); the scripted runs (the vault, the
 * Answer, the ram, the Gloamweaver) replay their inputs; the progression reaches every place and find with Kindle
 * before Gust, and a tool taken away leaves its locks shut; no softlock with every lamp spent; every kindle has
 * renewable fuel. The skip-hunter's searches are in tests/unit/proto-1-locks-{a,b,c}.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { PROTO_WORLD, validateWorld } from '../../src/scene/world';
import { step } from '../../src/sim/index';
import { EDGES } from '../../tools/levels/lanternroot-graph';
import { driverStart } from '../../tools/solve/drivers';
import {
  allTargets,
  edgeId,
  fuelProblems,
  meets,
  progress,
  readTapes,
  replay,
  softlocks,
} from '../../tools/solve/proto-1';

const TAPES = readTapes();

describe('Lanternroot: the world', () => {
  it('its own world file is sound: mirrors, connected, every room, glade and find reachable by its routes, no softlock', () => {
    expect(validateWorld(PROTO_WORLD)).toEqual([]);
    expect(PROTO_WORLD.start).toBe('lr-night');
    for (const id of ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache'])
      expect(PROTO_WORLD.rooms[id]?.placed).toBe(true);
  });

  it('every room is a glow room, painted with the lanternroot kit, chambers locked with a 20-frame slide', () => {
    for (const id of ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache']) {
      const r = getRoom(id);
      expect(r.glow).toBe(true);
      expect(r.art?.kit).toBe('lanternroot');
      for (const z of r.camera?.zones ?? []) {
        expect(z.lock).toBe(true);
        expect(z.frames).toBe(20);
      }
    }
  });
});

describe('Lanternroot: every edge replays its line', () => {
  for (const e of EDGES) {
    for (const back of e.both ? [false, true] : [false]) {
      const id = back ? `${e.room}:${e.to}->${e.from}` : edgeId(e);
      if (e.proof !== 'explore') continue;
      it(id, () => {
        const line = TAPES[id];
        expect(line, `no stored line for ${id}: run tools/solve/proto-1.ts --write`).toBeDefined();
        expect(replay(e, line ?? [], back).ok).toBe(true);
      });
    }
  }
});

describe('Lanternroot: the scripted runs replay', () => {
  const drivers = [...new Set(EDGES.filter((e) => e.proof.startsWith('driver:')).map((e) => e.proof))];
  for (const proof of drivers) {
    it(proof, () => {
      const name = proof.slice(7);
      const rle = (TAPES[proof]?.[0] ?? '').split(',').filter(Boolean).map(Number);
      expect(rle.length, `no stored run for ${proof}`).toBeGreaterThan(0);
      const { state, room, t } = driverStart(name);
      const events: Parameters<typeof step>[4] = [];
      for (let i = 0; i + 1 < rle.length; i += 2)
        for (let k = 0; k < (rle[i + 1] as number); k++) {
          events.length = 0;
          step(state, rle[i] as number, t, room, events, PROTO_WORLD);
        }
      for (const e of EDGES.filter((q) => q.proof === proof))
        expect(meets(room, e.to, state), e.to).toBe(true);
    });
  }
});

describe('Lanternroot: the progression', () => {
  it('reaches every place and find from the night’s spawn; Kindle comes first, then Gust', () => {
    const p = progress();
    expect(p.abilities).toEqual(['kindle', 'gust']);
    const missing = allTargets().filter((x) => !p.places.has(x));
    expect(missing).toEqual([]);
    for (const f of ['seal-open', 'shaft-open', 'gloam-down', 'curtain-open', 'answer'])
      expect(p.flags.has(f), f).toBe(true);
  });

  it('without Kindle the pit, the seal, the shaft, the boss and the cistern stay shut', () => {
    const p = progress({ without: ['lr-roots:kindle'] });
    expect(p.abilities).not.toContain('kindle');
    // (The pit is reached, by the hole: it is where Kindle waits.)
    expect(p.places.has('lr-roots:find:p-a3')).toBe(true);
    for (const f of ['seal-open', 'shaft-open', 'gloam-down']) expect(p.flags.has(f), f).toBe(false);
    for (const node of ['lr-roots:arena', 'lr-roots:cistern-w', 'lr-night:nest', 'lr-hall:find:h2'])
      expect(p.places.has(node), node).toBe(false);
  });

  it('without Gust the curtain, the brambles’ dark, the vault, the Answer and the cache stay shut', () => {
    const p = progress({ without: ['lr-roots:gust'] });
    expect(p.abilities).toEqual(['kindle']);
    for (const f of ['curtain-open', 'answer', 'vault-open']) expect(p.flags.has(f), f).toBe(false);
    for (const node of [
      'lr-night:crest',
      'lr-cache:cache-floor',
      'lr-hall:find:vault-drop',
      'lr-roots:find:h4',
    ])
      expect(p.places.has(node), node).toBe(false);
  });

  it('no softlock: from every place reached, with every warm lamp spent, a moon patch can be reached', () => {
    expect(softlocks()).toEqual([]);
  });

  it('every moonwick has renewable fuel in its chamber (a glow pod that regrows, or a creature that comes back)', () => {
    expect(fuelProblems()).toEqual([]);
  });
});
