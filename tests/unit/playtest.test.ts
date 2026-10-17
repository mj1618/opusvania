import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Room } from '../../src/scene/room';
import type { SimEvent } from '../../src/sim/events';
import { createState } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { runHeadless } from '../../tools/playtest/headless';
import { buildMoves, buildSurfaces, plan, reachFor } from '../../tools/playtest/map';
import { observe } from '../../tools/playtest/observe';
import { PERSONAS } from '../../tools/playtest/personas';
import { crc32, encodePng, Raster } from '../../tools/playtest/png';
import { Recorder } from '../../tools/playtest/recorder';
import { cluster, loadError, reportMarkdown, summarize } from '../../tools/playtest/report';
import { parseTime, targetsFromMarkdown } from '../../tools/playtest/targets';

/** Two floors with a gap between, an exit through the east edge. */
function gapRoom(): Room {
  return {
    id: 'gap-lab',
    region: 'lab',
    width: 4000,
    height: 1200,
    spawn: { x: 400, y: 800 },
    solids: [
      { tag: 'ground', x: 0, y: 800, w: 1500, h: 400 },
      { tag: 'ground', x: 1720, y: 760, w: 2280, h: 440 },
    ],
    oneWays: [],
    exits: [{ id: 'east', edge: 'e', from: 0, to: 760 }],
  };
}

describe('playtest harness: the map in a persona head', () => {
  it('merges rolling tops into one surface, splits at a real step, and leaves out tops something sits on', () => {
    const scene = {
      ...gapRoom(),
      solids: [
        { tag: 'branch' as const, x: 0, y: 800, w: 100, h: 50 },
        { tag: 'branch' as const, x: 100, y: 790, w: 100, h: 50 },
        { tag: 'branch' as const, x: 200, y: 700, w: 100, h: 50 },
        { tag: 'ground' as const, x: 400, y: 800, w: 400, h: 50 },
        { tag: 'trunk' as const, x: 500, y: 300, w: 100, h: 500 },
      ],
    };
    const s = buildSurfaces(scene, [0, 1, 2, 3, 4], []);
    const spans = s.map((q) => [q.x0, q.x1]);
    expect(spans).toContainEqual([0, 200]);
    expect(spans).toContainEqual([200, 300]);
    // The floor under the trunk is two pieces; the trunk's own top is one.
    expect(spans).toContainEqual([400, 500]);
    expect(spans).toContainEqual([600, 800]);
  });

  it('plans a jump across a gap it can make, and not one it cannot', () => {
    const room = gapRoom();
    const s = buildSurfaces(room, [0, 1], []);
    const moves = buildMoves(s, reachFor([]));
    const a = s.find((q) => q.x0 === 0);
    const b = s.find((q) => q.x0 === 1720);
    expect(a && b).toBeTruthy();
    const route = plan(s, moves, a?.id ?? -1, (q) => q.id === b?.id);
    expect(route?.map((m) => m.kind)).toEqual(['jump']);
    const far = {
      ...room,
      solids: [room.solids[0], { tag: 'ground' as const, x: 2500, y: 760, w: 1500, h: 440 }],
    };
    const s2 = buildSurfaces(far as Room, [0, 1], []);
    expect(plan(s2, buildMoves(s2, reachFor([])), 0, (q) => q.x0 === 2500)).toBeNull();
    // With the glide and a drop, a long gap is in reach.
    expect(reachFor(['glide']).across(300)).toBeGreaterThan(reachFor([]).across(300) + 300);
    expect(reachFor(['glide', 'doubleJump']).across(0)).toBeGreaterThan(1200);
  });

  it('sees only what is in the view', () => {
    const room = gapRoom();
    const st = createState(1, cloneTuning(defaultTuning), room);
    const o = observe(st, room, { x: 0, y: 300, w: 1200, h: 700 });
    expect(o.solids).toEqual([0]);
    expect(o.exits).toEqual([]);
    const all = observe(st, room, { x: 0, y: 0, w: 4000, h: 1200 });
    expect(all.solids).toEqual([0, 1]);
    expect(all.exits.map((e) => e.id)).toEqual(['east']);
  });
});

describe('playtest harness: personas, headless', () => {
  it('every persona crosses the gap and leaves by the exit', () => {
    for (const persona of PERSONAS) {
      const r = runHeadless({ room: gapRoom(), persona, seconds: 60 });
      expect(r.trace.outcome, persona).toBe('exit');
      expect(r.trace.exitId).toBe('east');
      expect(r.trace.catches, persona).toHaveLength(0);
      expect(r.tape.length).toBe(r.trace.frames);
    }
  });

  it('a run is deterministic (same room, seed and persona: the same state at the end)', () => {
    const a = runHeadless({ room: gapRoom(), persona: 'cautious', seconds: 60 });
    const b = runHeadless({ room: gapRoom(), persona: 'cautious', seconds: 60 });
    expect(a.hash).toBe(b.hash);
    expect(a.tape).toEqual(b.tape);
  });

  it('wood-hatch: the naive player and the speedrunner reach the exit; the others finish a run', () => {
    for (const persona of PERSONAS) {
      const r = runHeadless({ room: 'wood-hatch', persona, seconds: 120 });
      expect(r.trace.frames).toBeGreaterThan(0);
      expect(r.trace.rooms[0]?.room).toBe('wood-hatch');
      if (persona === 'naive' || persona === 'speedrunner') {
        expect(r.trace.outcome, persona).toBe('exit');
        expect(r.trace.hatchFrame).not.toBeNull();
      }
    }
  });
});

describe('playtest harness: telemetry', () => {
  const room = gapRoom();
  const view = { x: 0, y: 0, w: 1920, h: 1080 };

  it('counts deaths, falls, hits by creature, and keys everything by room', () => {
    const st = createState(1, cloneTuning(defaultTuning), room);
    const rec = new Recorder('t', room.id, 1, 'test', { regionOf: () => 'lab' });
    const hurt = (id: string): SimEvent =>
      ({
        type: 'hurt',
        x: 10,
        y: 800,
        dir: 1,
        hp: 2,
        hpMax: 4,
        damage: 1,
        source: { kind: 'burrback', id },
        hitX: 0,
        hitY: 0,
        stagger: 10,
        invuln: 60,
      }) as SimEvent;
    rec.record(st, 0, [hurt('burr-a')], view, room);
    rec.record(st, 0, [hurt('burr-a'), hurt('burr-b')], view, room);
    rec.record(st, 0, [{ type: 'fade', x: 10, y: 800, frames: 60 }], view, room);
    rec.record(st, 0, [{ type: 'fallCatch', id: 'below', x: 10, y: 900, frames: 18 }], view, room);
    const t = rec.finish('stopped');
    expect(t.hitsByCreature).toEqual({ 'burr-a': 2, 'burr-b': 1 });
    expect(t.deaths).toHaveLength(1);
    expect(t.deaths[0]?.by).toBe('burr-b');
    expect(t.catches).toHaveLength(1);
    expect(t.framesByRoom).toEqual({ 'gap-lab': 4 });
    expect(t.framesByRegion).toEqual({ lab: 4 });
    expect(t.events.hurt).toBe(3);
  });

  it('time without progress past the limit is lost; walking back over old ground is backtracking', () => {
    const st = createState(1, cloneTuning(defaultTuning), room);
    const rec = new Recorder('t', room.id, 1, 'test', { lostAfter: 60, cell: 100 });
    const at = (x: number, vx: number) => {
      st.player.x = x - st.player.w / 2;
      st.player.vx = vx;
      rec.record(st, 2, [], view, room);
    };
    // Walk right through new cells (progress), stand still 90 frames (lost), walk back (backtracking).
    for (let x = 100; x < 600; x += 10) at(x, 10);
    for (let i = 0; i < 90; i++) at(600, 0);
    for (let x = 600; x > 100; x -= 10) at(x, -10);
    const t = rec.finish('stopped');
    expect(t.lost.length).toBeGreaterThanOrEqual(1);
    expect(t.lostFrames).toBeGreaterThanOrEqual(90);
    expect(t.backtrackFrames).toBeGreaterThan(30);
    expect(t.input.presses).toBe(1);
    expect(t.input.framesWithInput).toBe(t.frames);
  });

  it('summarizes, clusters falls and writes a report', () => {
    const r = runHeadless({ room: gapRoom(), persona: 'explorer', seconds: 60 });
    const s = summarize(r.trace);
    expect(s.outcome).toBe('exit east');
    const md = reportMarkdown(r.trace, {
      when: 'now',
      abilities: null,
      targets: { 'gap-lab': { lo: 5, hi: 20, source: 'x' } },
      files: [],
      command: 'test',
      lostAfter: 10,
    });
    expect(md).toContain('# Playtest: explorer in gap-lab');
    expect(md).toMatch(/\| gap-lab \| lab \| 0\.0 s \| [\d.]+ s \| 5-20 s/);
    const c = cluster([
      { room: 'a', x: 0, y: 0, f: 1 },
      { room: 'a', x: 100, y: 0, f: 2 },
      { room: 'a', x: 2000, y: 0, f: 3 },
    ]);
    expect(c.map((q) => q.n)).toEqual([2, 1]);
  });
});

describe('playtest harness: targets and pictures', () => {
  it('reads times and room targets from a region doc table', () => {
    expect(parseTime('90 s')).toEqual({ lo: 90, hi: 90 });
    expect(parseTime('1:30')).toEqual({ lo: 90, hi: 90 });
    expect(parseTime('2-3 min')).toEqual({ lo: 120, hi: 180 });
    expect(parseTime('1.5 min')).toEqual({ lo: 90, hi: 90 });
    expect(parseTime('soon')).toBeNull();
    const md =
      '| # | Room | Purpose | Target time |\n|---|---|---|---|\n| 1 | `wood-hatch` | the birth | 30-45 s |\n| 2 | wood-gate | a lock | 2 min |\n';
    expect(targetsFromMarkdown(md, ['wood-hatch', 'wood-gate', 'wood'])).toEqual({
      'wood-hatch': { lo: 30, hi: 45, source: '' },
      'wood-gate': { lo: 120, hi: 120, source: '' },
    });
  });

  it('encodes a valid PNG', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const r = new Raster(4, 3, [10, 20, 30, 255]);
    r.rect(1, 1, 2, 1, [255, 0, 0, 255]);
    const png = r.png();
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(3);
    // IDAT holds 3 rows of (1 filter byte + 4 RGBA pixels).
    const idat = png.indexOf('IDAT');
    const len = png.readUInt32BE(idat - 4);
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + len));
    expect(raw.length).toBe(3 * (1 + 16));
    expect([...raw.subarray(1 + 17 + 4, 1 + 17 + 8)]).toEqual([255, 0, 0, 255]);
    expect(encodePng(1, 1, new Uint8Array([1, 2, 3, 4])).length).toBeGreaterThan(40);
  });
});

describe('playtest harness: hands (look-ahead lines, climbs, fights)', () => {
  /** A 512-wide shaft rising 1400 from a floor to an exit at the top; both faces kickable. */
  function shaft(): Room {
    return {
      id: 'shaft-lab',
      region: 'lab',
      width: 2000,
      height: 1800,
      spawn: { x: 600, y: 1600 },
      solids: [
        { tag: 'ground', x: 0, y: 1600, w: 2000, h: 200 },
        { tag: 'trunk', x: 600 + 200, y: 0, w: 128, h: 1450 },
        { tag: 'trunk', x: 600 + 200 + 128 + 512, y: 0, w: 128, h: 1450 },
      ],
      oneWays: [],
      exits: [{ id: 'top', edge: 'n', from: 928, to: 1440 }],
    };
  }

  it('a persona that owns the wall jump climbs a shaft and leaves by its top', () => {
    const r = runHeadless({ room: shaft(), persona: 'speedrunner', seconds: 60, abilities: ['wallJump'] });
    expect(r.trace.outcome).toBe('exit');
    expect(r.trace.exitId).toBe('top');
    expect(r.trace.hurts).toHaveLength(0);
  });

  it('without it, the shaft is a lock: no way out found', () => {
    const r = runHeadless({ room: shaft(), persona: 'speedrunner', seconds: 30, abilities: [] });
    expect(r.trace.outcome).not.toBe('exit');
  });

  it('the look-ahead picks a line round thorns hanging over the jump (a walk-off glide under them)', () => {
    // A ledge, a long drop to a far floor, thorns where a jump's hump would go.
    const room: Room = {
      id: 'thorn-lab',
      region: 'lab',
      width: 4000,
      height: 1600,
      spawn: { x: 300, y: 800 },
      solids: [
        { tag: 'ground', x: 0, y: 800, w: 700, h: 800 },
        { tag: 'ground', x: 1700, y: 1300, w: 2300, h: 300 },
      ],
      oneWays: [],
      thorns: [{ id: 'branch', x: 780, y: 560, w: 500, h: 120 }],
      catches: [{ id: 'pit', x: 700, y: 1400, w: 1000, h: 200 }],
      exits: [{ id: 'east', edge: 'e', from: 1100, to: 1300 }],
    };
    const r = runHeadless({ room, persona: 'explorer', seconds: 60, abilities: ['glide'] });
    expect(r.trace.outcome).toBe('exit');
    expect(r.trace.hurts).toHaveLength(0);
  });

  it('a creature in the way is fought by look-ahead (or passed) without a fade', () => {
    const room: Room = {
      ...gapRoom(),
      id: 'burr-lab',
      solids: [{ tag: 'ground', x: 0, y: 800, w: 4000, h: 400 }],
      enemies: [{ id: 'burr', kind: 'burrback', x: 1400, y: 800, facing: -1 }],
      exits: [{ id: 'east', edge: 'e', from: 0, to: 800 }],
    };
    for (const persona of ['explorer', 'speedrunner']) {
      const r = runHeadless({ room, persona, seconds: 90 });
      expect(r.trace.outcome, persona).toBe('exit');
      expect(r.trace.deaths, persona).toHaveLength(0);
    }
  });
});

describe('playtest harness: a pinned build that does not load', () => {
  it('names the schema problem and the room files the commit touched', () => {
    const text = `ZodError: [\n  {\n    "code": "invalid_type",\n    "path": ["solids", 0, "w"],\n    "message": "Invalid input: expected number, received string"\n  }\n]\n    at parseScene (src/scene/index.ts:1:1)`;
    const out = loadError(text, 'content/rooms/wood-wicks.json\ntools/playtest/x.ts\n');
    expect(out).toContain('solids.0.w: Invalid input: expected number, received string');
    expect(out).toContain('room files this commit changed: content/rooms/wood-wicks.json');
    expect(
      loadError('SyntaxError: Unexpected token } in JSON at position 12\n    at JSON.parse', ''),
    ).toContain('SyntaxError: Unexpected token');
  });
});

describe('playtest harness: the human-like player (human.ts, feel.ts)', () => {
  const J = 1 << 4;
  it('the motor is deterministic per seed, late by its latency, and keeps a chord together', async () => {
    const { Motor, SKILLS } = await import('../../tools/playtest/human');
    const { ActionBit } = await import('../../src/sim/input');
    const row = { ...SKILLS.average, mispressPerMin: 0, doubleTap: 0 };
    const play = (seed: number) => {
      const m = new Motor(row, seed);
      const out: number[] = [];
      for (let f = 0; f < 200; f++) {
        const intent =
          f >= 20 && f < 40 ? ActionBit.right : f >= 100 && f < 104 ? ActionBit.down | ActionBit.attack : 0;
        out.push(m.step(f, intent));
      }
      return out;
    };
    const a = play(3);
    expect(play(3)).toEqual(a);
    const firstRight = a.findIndex((k) => k & ActionBit.right);
    expect(firstRight).toBeGreaterThanOrEqual(20);
    expect(firstRight).toBeLessThanOrEqual(20 + row.latency + row.jitter);
    // Down and the cut land on the same frame (a pogo is a chord).
    const d = a.findIndex((k, f) => f >= 100 && k & ActionBit.down);
    const c = a.findIndex((k, f) => f >= 100 && k & ActionBit.attack);
    expect(d).toBe(c);
    expect(J).toBe(ActionBit.jump);
  });

  it('a surprise waits a reaction time; a long jump is held at least as long as meant', async () => {
    const { Motor, SKILLS } = await import('../../tools/playtest/human');
    const { ActionBit } = await import('../../src/sim/input');
    const row = { ...SKILLS.casual, mispressPerMin: 0, doubleTap: 0 };
    const m = new Motor(row, 1);
    m.surprise(0, true);
    let pressed = -1;
    for (let f = 0; f < 60 && pressed < 0; f++) if (m.step(f, ActionBit.left) & ActionBit.left) pressed = f;
    // 240-330 ms x 1.25, less the eye's share (perception).
    expect(pressed).toBeGreaterThanOrEqual(Math.round(0.24 * 1.25 * 60) - row.perception - 1);
    const m2 = new Motor(row, 2);
    const keys: number[] = [];
    for (let f = 0; f < 80; f++) keys.push(m2.step(f, f < 18 ? ActionBit.jump : 0));
    expect(keys.filter((k) => k & ActionBit.jump).length).toBeGreaterThanOrEqual(18);
  });

  it('a person tries a rule of thumb first, then the next idea after each failure', async () => {
    const { humanPick } = await import('../../tools/playtest/human');
    const cands = ['walk off', 'jump (14 px, 18f)', 'standing hop (5f)', 'jump-glide (14 px, 18f)'].map(
      (name) => ({
        name,
        make: () => ({ name, max: 1, act: () => 0 }),
      }),
    );
    const m = { kind: 'jump', gap: 100, rise: 0 } as unknown as Parameters<typeof humanPick>[1];
    const ctx = { roof: false, glide: true, plainReach: 300, hold: 18 };
    expect(humanPick(cands, m, 0, ctx)?.name).toBe('jump (14 px, 18f)');
    expect(humanPick(cands, m, 1, ctx)?.name).toBe('standing hop (5f)');
    expect(humanPick(cands, m, 0, { ...ctx, roof: true })?.name).toBe('walk off');
  });

  it('feel: first input, flow, deaths per 10 min and a timeline of 10 s buckets', async () => {
    const { Feel } = await import('../../tools/playtest/feel');
    const s = createState(1, cloneTuning(defaultTuning), gapRoom());
    const feel = new Feel();
    for (let f = 0; f < 1200; f++) {
      s.player.x = 400 + f * 2;
      s.player.vx = f < 600 ? 6 : 0;
      s.player.grounded = true;
      feel.record(s, f >= 90 && f < 600 ? 2 : 0, f === 700 ? [{ type: 'fade' } as unknown as SimEvent] : []);
    }
    const r = feel.finish();
    expect(r.buckets.length).toBe(2);
    expect(r.metrics.firstInputS).toBeCloseTo(1.5);
    expect(r.metrics.flowPct).toBeCloseTo(50, 0);
    expect(r.metrics.deathsPer10Min).toBeCloseTo(30);
  });
});

describe('playtest harness: area 1 skills (throws, hatches, the pogo-wick, thorn beds)', () => {
  const room = (extra: Partial<Room>): Room => ({
    id: 'skills-lab',
    region: 'lab',
    width: 3000,
    height: 1600,
    spawn: { x: 200, y: 800 },
    solids: [],
    oneWays: [],
    exits: [],
    ...extra,
  });
  const all = (r: Room) => ({
    solids: r.solids.map((_, i) => i),
    oneWays: (r.oneWays ?? []).map((_, i) => i),
  });

  it('a thorn bed and a pit that catches are no floor; a drop through rungs stops at the first rung', () => {
    const r = room({
      solids: [
        { tag: 'ground', x: 0, y: 800, w: 600, h: 800 },
        { tag: 'ground', x: 1200, y: 1000, w: 600, h: 600 },
        { tag: 'ground', x: 600, y: 1400, w: 600, h: 200 },
      ],
      oneWays: [
        { tag: 'root', x: 1300, y: 600, w: 100 },
        { tag: 'root', x: 1300, y: 800, w: 100 },
      ],
      thorns: [{ id: 't', x: 1500, y: 968, w: 300, h: 32 }],
      catches: [{ id: 'pit', x: 600, y: 1340, w: 600, h: 60 }],
    } as Partial<Room>);
    const { solids, oneWays } = all(r);
    const surf = buildSurfaces(r, solids, oneWays);
    expect(surf.some((s) => s.x0 >= 600 && s.x1 <= 1200 && s.pieces[0]?.y === 1400)).toBe(false);
    const floor = surf.find((s) => s.pieces[0]?.y === 1000);
    expect(floor?.x1).toBe(1500);
    const moves = buildMoves(surf, reachFor(['glide']));
    const top = surf.find((s) => s.oneWay && s.pieces[0]?.y === 600);
    const through = moves.filter((m) => m.kind === 'through' && m.from === top?.id);
    expect(through.map((m) => surf[m.to]?.pieces[0]?.y)).toEqual([800]);
  });

  it('a gap no jump spans is crossed by a lamp in reach (a throw move), and the aimed throw lands', () => {
    const a = { id: 0, x0: 0, x1: 500, pieces: [{ x0: 0, x1: 500, y: 1000 }], oneWay: false };
    const b = { id: 1, x0: 1300, x1: 1800, pieces: [{ x0: 1300, x1: 1800, y: 700 }], oneWay: false };
    const reach = reachFor(['glide']);
    expect(buildMoves([a, b], reach).some((m) => m.from === 0 && m.to === 1)).toBe(false);
    const withLamp = buildMoves([a, b], reach, [], [], [{ x: 640, y: 720 }]);
    expect(withLamp.find((m) => m.from === 0 && m.to === 1)?.lure).toEqual({ x: 640, y: 720 });
  });

  it('reading the drawn arc: landing on the goal beats ending near it; through thorns never', async () => {
    const { arcScore } = await import('../../tools/playtest/lines');
    const r = room({ thorns: [{ id: 't', x: 900, y: 960, w: 200, h: 40 }] } as Partial<Room>);
    const goal = { id: 1, x0: 1400, x1: 1900, pieces: [{ x0: 1400, x1: 1900, y: 700 }], oneWay: false };
    const g = { x: 1600, y: 700, surface: goal };
    const lands = arcScore([600, 700, 1000, 600, 1500, 660], r, g, 40);
    const short = arcScore([600, 700, 1000, 800, 1300, 900], r, g, 40);
    const thorny = arcScore([600, 700, 950, 950, 1500, 660], r, g, 40);
    expect(lands).toBeLessThan(short);
    expect(thorny).toBeGreaterThan(1e5);
  });
});
