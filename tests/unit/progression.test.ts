/**
 * Progression validator (tools/progression): schema additions, world extraction, static proofs, the
 * solver on a hand-made graph with a table oracle, design-graph checks, and one small end-to-end
 * trap probe on a lab room with the real bot.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerTestRoom, roomLayout } from '../../src/debug/sim-adapter';
import { buildRoom } from '../../src/sim/world/rooms';
import {
  checkDesign,
  DesignGraphSchema,
  loadDesign,
  reachTiles,
  simAbility,
  solveDesign,
} from '../../tools/progression/intended';
import { runJob } from '../../tools/progression/job';
import type { Answer, Query } from '../../tools/progression/oracle';
import { Oracle } from '../../tools/progression/oracle';
import { SearchPool } from '../../tools/progression/pool';
import { ledges, probeTraps } from '../../tools/progression/probes';
import { solve } from '../../tools/progression/solver';
import {
  type Ability,
  extractWorld,
  isSubset,
  type RoomNode,
  staticallyUnreachable,
  type WorldGraph,
} from '../../tools/progression/world';

const ROOT = resolve(import.meta.dirname, '../..');
const NONE = { wallJump: false, dash: false, doubleJump: false, pogo: false };

describe('room schema: progression annotations', () => {
  it('pickups and rests are empty tiles with entities; locks and gate requires parse', () => {
    const r = buildRoom({
      id: 'pg-schema',
      abilities: NONE,
      rows: ['#####', '#Pab#', '#####'],
      pickups: { a: { grants: ['dash'] } },
      rests: { b: { name: 'bench' } },
      locks: { top: { target: 'tile:2,1', requires: ['dash'] } },
    });
    const pk = r.entities.find((e) => e.kind === 'pickup');
    expect(pk).toMatchObject({ char: 'a', grants: ['dash'], id: 'pg-schema:a' });
    expect(r.entities.find((e) => e.kind === 'rest')).toMatchObject({ char: 'b', id: 'bench' });
    expect(r.tiles[(pk?.ty ?? 0) * r.width + (pk?.tx ?? 0)]).toBe(0);
    expect(r.file.locks.top).toMatchObject({ requires: ['dash'], hold: 'reach', teachGate: false });
  });

  it('rejects a pickup char that clashes and an unknown ability', () => {
    expect(() =>
      buildRoom({
        id: 'x',
        abilities: NONE,
        rows: ['###', '#P#', '###'],
        pickups: { '#': { grants: ['dash'] } },
      }),
    ).toThrow(/clashes/);
    expect(() =>
      buildRoom({
        id: 'x',
        abilities: NONE,
        rows: ['###', '#P#', '###'],
        pickups: { a: { grants: ['fly' as 'dash'] } },
      }),
    ).toThrow();
  });
});

describe('world graph extraction', () => {
  const world = extractWorld();
  it('reads doors, G -> next, grants, gates, locks and palettes from the rooms', () => {
    expect(world.errors).toEqual([]);
    const hub = world.rooms.hub as RoomNode;
    expect(hub.exits).toHaveLength(24);
    expect(hub.pickups[0]).toMatchObject({ id: 'grant:hub', implicit: true });
    const lot7 = world.rooms['lot-7'] as RoomNode;
    expect(lot7.exits.map((x) => `${x.target}->${x.to}`)).toEqual(['G->hub']);
    expect(lot7.palette).toEqual(['brown', 'pink']);
    expect(world.rooms['the-pit']?.palette).toEqual(['brown', 'pink', 'violet']); // barker + grinder voices
    const gate = lot7.gates.find((g) => g.id === 'lot-7/gate:D');
    expect(gate?.target).toBe('rect:2560,448,128,320');
    expect(lot7.gates.find((g) => g.kind === 'lock')).toMatchObject({
      requires: ['levy'],
      hold: 'reach',
      teachGate: true,
    });
  });

  it('static proof: without Seize the plate never presses, so the far side of gate D is sealed', () => {
    const l = roomLayout('lot-7');
    const sp = l.spawns.default as { tx: number; ty: number };
    const target = 'rect:2560,448,128,320';
    expect(staticallyUnreachable(l, sp, ['wallJump', 'dash', 'doubleJump', 'pogo', 'levy'], target)).toBe(
      true,
    );
    expect(staticallyUnreachable(l, sp, ['seize'], target)).toBe(false);
    // Without Seize the pink partition is solid too: the whole upper room is sealed off.
    expect(staticallyUnreachable(l, sp, ['wallJump', 'levy'], 'rect:1536,512,64,256')).toBe(true);
  });
});

/** A hand-made graph: A (start) -> B -> C one way; B has a Dash pickup; C gets home only with Dash. */
function tinyWorld(): WorldGraph {
  const room = (id: string, extra: Partial<RoomNode>): RoomNode => ({
    id,
    name: id,
    hash: id,
    width: 30,
    height: 17,
    grant: [],
    entries: ['default'],
    exits: [],
    pickups: [],
    rests: [],
    gates: [],
    hazards: { spikes: 0, orbs: 0, enemies: [], sources: 0 },
    palette: [],
    ...extra,
  });
  const exit = (from: string, target: string, to: string) => ({
    id: `${from}/${target}`,
    room: from,
    kind: 'door' as const,
    char: target,
    target,
    to,
    toSpawn: 'default',
    tx: 0,
    ty: 0,
  });
  return {
    start: { room: 'A', spawn: 'default' },
    rooms: {
      A: room('A', { exits: [exit('A', 'exit:1', 'B')] }),
      B: room('B', {
        exits: [exit('B', 'G', 'C')],
        pickups: [
          {
            id: 'dash-shoes',
            room: 'B',
            grants: ['dash'],
            implicit: false,
            target: 'tile:5,5',
            tx: 5,
            ty: 5,
          },
        ],
      }),
      C: room('C', { exits: [exit('C', 'exit:2', 'A')] }),
    },
    links: [],
    errors: [],
    warnings: [],
  };
}

/** Table oracle: target -> abilities it needs (everything else is free). */
function tableAsk(needs: Record<string, Ability[]>) {
  return async (qs: Query[]): Promise<Answer[]> =>
    qs.map((q) =>
      isSubset(needs[`${q.room}|${q.target}`] ?? [], q.abilities)
        ? { verdict: 'yes', how: 'bot', ms: 0 }
        : { verdict: 'no', how: 'static', ms: 0 },
    );
}

describe('solver', () => {
  it('finds the softlock of skipping the pickup (world semantics)', async () => {
    const sol = await solve(tinyWorld(), tableAsk({ 'C|exit:2': ['dash'] }), { semantics: 'world' });
    expect(Object.values(sol.rooms).every((r) => r.reached)).toBe(true);
    expect(sol.pickups['dash-shoes']?.reached).toBe(true);
    // C with Dash goes home; C without it (the player walked past the pickup) is stuck.
    expect(sol.softlocks.map((s) => `${s.room}${JSON.stringify(s.abilities)}`)).toEqual(['C[]']);
    expect(sol.softlocks[0]?.proven).toBe(true);
    expect(sol.softlocks[0]?.path).toEqual(['A/exit:1', 'B/G']);
    expect(sol.rooms.C?.kits).toEqual([[]]);
  });

  it('strip removes an ability from every grant (G7 kit without key)', async () => {
    const sol = await solve(tinyWorld(), tableAsk({ 'C|exit:2': ['dash'] }), {
      semantics: 'world',
      strip: ['dash'],
    });
    expect(sol.states.some((s) => s.abilities.includes('dash'))).toBe(false);
    expect(sol.exits['C/exit:2']?.reached).toBe(false);
  });

  it('gym semantics: entering a room sets the abilities to its grant', async () => {
    const w = tinyWorld();
    (w.rooms.A as RoomNode).pickups.push({ id: 'grant:A', room: 'A', grants: ['dash'], implicit: true });
    const sol = await solve(w, tableAsk({ 'B|G': ['dash'] }), { semantics: 'gym' });
    // A grants dash, but B resets to nothing, so B's G (needs dash) is only reached after the pickup.
    expect(sol.exits['B/G']?.kits).toEqual([['dash']]);
    expect(sol.states.find((s) => s.room === 'B' && s.at === 'spawn:default')?.abilities).toEqual([]);
  });
});

describe('design graph (world-design.md §4.8)', () => {
  it('loads the live slice design (docs/design/world-design.md) and plans G7 kits without each key', () => {
    // The design is edited by another stream: only check that it parses and the checks run.
    const g = loadDesign(resolve(ROOT, 'docs/design/world-design.md'));
    const rep = checkDesign(g);
    expect(rep.reachable.length).toBeGreaterThan(0);
    for (const p of rep.g7) {
      const key = simAbility(g, p.key);
      if (key) for (const k of p.simKits ?? []) expect(k, p.edge).not.toContain(key);
    }
  });

  it('checks reach proofs against the §3.1 table (palette counts only with Seize and Levy)', () => {
    expect(reachTiles([], [], 'height')).toBe(4.5);
    expect(reachTiles(['seize', 'levy'], ['pink'], 'height')).toBe(16.5);
    expect(reachTiles(['seize'], ['pink', 'brown'], 'height')).toBe(4.5);
    expect(reachTiles(['seize', 'levy', 'slip'], ['brown', 'violet'], 'gap')).toBe(19.7);
  });

  const mini = (edges: unknown[], rooms: unknown[] = []) =>
    DesignGraphSchema.parse({
      version: 1,
      start: { room: 'S', abilities: ['seize', 'levy'] },
      goals: [],
      rooms: [
        { id: 'S', corner: true },
        { id: 'P', palette: ['pink'] },
        { id: 'Q', grants: ['ability:slip'] },
        ...rooms,
      ],
      edges,
    });

  it('reports softlocks, G3 palettes and teach gates that guard a grant', () => {
    const g = mini([
      { id: 'a', from: 'S', to: 'P', dir: 'oneway' },
      { id: 'b', from: 'P', to: 'Q', dir: 'oneway', requires: ['ability:ropeSkip'], hold: 'reach' },
      {
        id: 'c',
        from: 'S',
        to: 'Q',
        dir: 'both',
        requires: ['ability:ropes'],
        hold: 'reach',
        teachGate: true,
      },
    ]);
    const rep = checkDesign(g);
    const by = (check: string) => rep.findings.filter((f) => f.check === check).map((f) => f.subject);
    expect(by('every reachable state can reach a Corner')[0]).toMatch(/^P /);
    expect(by('G3 palette')).toEqual(['b']);
    expect(by('teachGate edges never guard a grant')).toEqual(['c']);
    expect(rep.unreachable).toEqual(['Q']);
  });

  it('opens flags on traversal and gates on fever', () => {
    const g = mini(
      [
        { id: 'a', from: 'S', to: 'P', dir: 'oneway', opens: 'flag:latch' },
        { id: 'b', from: 'P', to: 'S', dir: 'oneway' },
        { id: 'c', from: 'S', to: 'Q', dir: 'oneway', requires: ['flag:latch', 'fever>=1'] },
        { id: 'd', from: 'S', to: 'B', dir: 'oneway' },
        { id: 'e', from: 'B', to: 'S', dir: 'oneway' },
      ],
      [{ id: 'B', grants: ['fever:1'] }],
    );
    const sol = solveDesign(g, { breaks: false });
    expect(sol.reached.has('Q')).toBe(true);
    expect(sol.states.find((s) => s.room === 'Q')).toMatchObject({ flags: ['latch'], fever: 1 });
  });
});

describe('trap probes (real bot, lab room)', () => {
  // A 7-tile pit between two ledges: jumpable across, not climbable out without wall jump.
  const rows = [
    '##############################',
    ...Array.from({ length: 7 }, () => '#............................#'),
    '#.P.......................G..#',
    ...Array.from({ length: 7 }, () => '#########......###############'),
    '##############################',
  ];
  registerTestRoom('pg-pit', rows, { next: 'pg-pit' });

  it('finds the ledges and reports the pit as a trap', async () => {
    expect(ledges('pg-pit').map((l) => `${l.x0}-${l.x1},${l.ty}`)).toEqual(['1-8,8', '15-28,8', '9-14,15']);
    const world = extractWorld({ start: 'pg-pit', rooms: ['pg-pit'] });
    const pool = new SearchPool(1);
    const oracle = new Oracle({ graph: world, pool, budget: 60_000, useTapes: false });
    const sol = await solve(world, (qs) => oracle.ask(qs), { semantics: 'world' });
    expect(sol.exits['pg-pit/G']?.reached).toBe(true);
    const rep = await probeTraps(world, sol, oracle, 60_000);
    expect(rep.traps.map((t) => t.ledge)).toEqual(['x9-14,y15']);
  }, 30_000);

  it('a search bounded to a region exhausts: a proof, not just "not found"', () => {
    // A 1-tile, 7-deep well: from its floor, G is out of reach (bounded to the well itself).
    registerTestRoom('pg-well', [
      '##############################',
      ...Array.from({ length: 7 }, () => '#............................#'),
      '#.P.......................G..#',
      ...Array.from({ length: 7 }, () => '############.#################'),
      '##############################',
    ]);
    const job = {
      room: 'pg-well',
      spawn: 'default',
      at: { tx: 12, ty: 15 },
      abilities: [],
      target: 'G',
      seed: 1,
    };
    const r = runJob({ ...job, budget: 200_000, region: 'rect:768,448,64,576' });
    expect(r.found).toBe(false);
    expect(r.exhausted).toBe(true);
  }, 30_000);
});
