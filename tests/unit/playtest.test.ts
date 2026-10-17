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
import { cluster, reportMarkdown, summarize } from '../../tools/playtest/report';
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
