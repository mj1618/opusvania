/**
 * L2 verification tooling: DSL, headless runner, event log, bot, feel report, gamepad check.
 * Uses its own lab rooms (registerTestRoom) so it survives gym/room rewrites.
 */
import { describe, expect, it } from 'vitest';
import { formatTape, parseTape } from '../../src/debug/dsl';
import { EventLog } from '../../src/debug/event-log';
import { formatTrace, runScenario } from '../../src/debug/headless';
import { playerView, registerTestRoom, resolveTarget } from '../../src/debug/sim-adapter';
import { Game } from '../../src/game';
import { isStandardPad } from '../../src/input/gamepad';
import { parseInputScript } from '../../src/input/script';
import { maskOf } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { search } from '../../tools/bot/search';
import { measureFeel } from '../../tools/feel-report/metrics';

const OPEN = registerTestRoom('tools-open', [
  '##############################',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#....................##......#',
  '#............................#',
  '#............................#',
  '#...............###..........#',
  '#............................#',
  '#.P..........................#',
  '##############################',
]);

// The 'a' spawn sits inside a sealed box: unreachable.
const SEALED = registerTestRoom('tools-sealed', [
  '#########',
  '#.......#',
  '#....####',
  '#....#a.#',
  '#.P..####',
  '#########',
]);

describe('input DSL', () => {
  it('parses the spec DSL and the Phase 0 syntax, mixed', () => {
    const masks = parseTape('.2 R3 R+J1 right*2 J');
    expect(masks).toEqual([
      0,
      0,
      maskOf(['right']),
      maskOf(['right']),
      maskOf(['right']),
      maskOf(['right', 'jump']),
      maskOf(['right']),
      maskOf(['right']),
      maskOf(['jump']),
    ]);
    expect(parseTape('X2 D+A1')).toEqual([maskOf(['dash']), maskOf(['dash']), maskOf(['down', 'attack'])]);
  });

  it('formatTape round-trips, including buttons the DSL lacks', () => {
    const masks = [
      0,
      0,
      maskOf(['left', 'jump']),
      maskOf(['special']),
      maskOf(['special']),
      maskOf(['right']),
    ];
    const text = formatTape(masks);
    expect(text).toBe('.2 L+J1 special*2 R1');
    expect(parseTape(text)).toEqual(masks);
    expect(parseTape([{ hold: ['right'], frames: 2 }])).toEqual(parseInputScript('right*2'));
  });
});

describe('headless runner', () => {
  it('matches the Game harness exactly (same hash for the same inputs)', () => {
    const script = '.5 R40 R+J20 R10 L+J8 .30';
    const r = runScenario({ room: OPEN, seed: 9, inputs: script, trace: true });
    const game = new Game(cloneTuning(defaultTuning), { seed: 9, roomId: OPEN });
    game.mode = 'manual';
    game.queueInput(parseTape(script));
    game.steps(parseTape(script).length);
    expect(r.final.hash).toBe(game.hash());
    expect(r.trace).toHaveLength(parseTape(script).length);
    expect(r.trace?.[6]?.in).toBe('R');
    expect(r.events.some((e) => e.e.type === 'jump' && e.e.kind === 'ground')).toBe(true);
    expect(formatTrace(r.trace ?? []).split('\n')).toHaveLength(r.steps + 1);
  });

  it('stops at a target and reports the frame', () => {
    const r = runScenario({ room: OPEN, inputs: 'R200', stop: { target: 'tile:10,10' } });
    expect(r.reachedAt).toBe(r.steps);
    expect(r.steps).toBeLessThan(200);
  });

  it('applies presets/tuning overrides and assists', () => {
    const base = runScenario({ room: OPEN, inputs: '.5 J30 .30', trace: true });
    const floaty = runScenario({
      room: OPEN,
      inputs: '.5 J30 .30',
      trace: true,
      tuning: { jump: { gravity: 3000 } },
    });
    const minY = (t: typeof base) => Math.min(...(t.trace ?? []).map((f) => f.p.y));
    expect(minY(floaty)).toBeLessThan(minY(base));
    expect(floaty.tuningHash).not.toBe(base.tuningHash);
  });
});

describe('event log tap', () => {
  it('logs every event with the frame that produced it and fires per-step callbacks', () => {
    const game = new Game(cloneTuning(defaultTuning), { seed: 1, roomId: OPEN });
    const log = new EventLog(game);
    const steps: number[] = [];
    log.onStep((s) => steps.push(s.f));
    game.mode = 'manual';
    game.queueInput(parseTape('.5 J10 .40'));
    game.steps(55);
    const jumps = log.recent().filter((e) => e.e.type === 'jump');
    expect(jumps).toHaveLength(1);
    expect(jumps[0]?.f).toBe(6);
    expect(steps).toHaveLength(55);
    expect(log.text()).toMatch(/^f\d+ land /m);
  });
});

describe('search bot', () => {
  it('finds a verified path onto a platform, deterministically', () => {
    const opts = { room: OPEN, target: 'tile:17,7', budget: 60_000 };
    const a = search(opts);
    expect(a.found).toBe(true);
    expect(a.verified).toBe(true);
    const b = search(opts);
    expect(b.tape).toBe(a.tape);
    expect(b.generated).toBe(a.generated);
    // The tape really gets there when replayed on its own.
    const r = runScenario({ room: OPEN, inputs: a.tape ?? '', stop: { target: 'tile:17,7' } });
    expect(r.reachedAt).toBeDefined();
  });

  it('reports an unreachable target as exhausted', () => {
    const r = search({ room: SEALED, target: 'a', budget: 400_000 });
    expect(r.found).toBe(false);
    expect(r.exhausted).toBe(true);
    expect(resolveTarget(SEALED, 'a')).toEqual({ x: 6 * 64, y: 3 * 64, w: 64, h: 64 });
  });

  it('respects the budget', () => {
    const r = search({ room: OPEN, target: 'tile:22,4', budget: 50 });
    expect(r.generated).toBeLessThanOrEqual(50 + 12);
  });
});

describe('feel report', () => {
  it('measures the assists the tuning declares', () => {
    const t = cloneTuning(defaultTuning);
    const f = measureFeel();
    // Coyote and buffer windows with the spec's meaning equal the frame counts in tuning.
    expect(f.raw.coyoteFrames).toBe(t.jump.coyoteFrames);
    expect(f.raw.bufferFrames).toBe(t.jump.bufferFrames);
    // Closed form for the Phase 0 controller: h ≈ v²/2g.
    const h = t.jump.jumpSpeed ** 2 / (2 * t.jump.gravity);
    expect(Math.abs(f.raw.fullJump.heightPx - h)).toBeLessThan(15);
    expect(f.metrics.tapFullRatio).toBeLessThan(0.5);
    expect(f.metrics.runTilesPerS).toBeCloseTo((t.player.runSpeed / 64) * 1, 1);
    // Coyote widens the gap-jump window.
    const gap = f.forgiveness[0];
    expect(gap && gap.on.successes - gap.off.successes).toBeGreaterThanOrEqual(t.jump.coyoteFrames - 1);
  });

  it('is deterministic and responds to tuning', () => {
    expect(measureFeel().metrics).toEqual(measureFeel().metrics);
    const low = measureFeel({ tuning: { jump: { jumpSpeed: 1000 } } });
    expect(low.metrics.jumpHeightTiles).toBeLessThan(measureFeel().metrics.jumpHeightTiles);
  });
});

describe('gamepad', () => {
  it('only trusts button indices on standard-mapping pads', () => {
    expect(isStandardPad({ mapping: 'standard' })).toBe(true);
    expect(isStandardPad({ mapping: '' })).toBe(false);
    expect(isStandardPad({ mapping: 'xr-standard' })).toBe(false);
  });
});

describe('player view', () => {
  it('normalises Phase 0 px/s velocities to px/frame', () => {
    const r = runScenario({ room: OPEN, inputs: '.5 R30' });
    expect(playerView(r.final.state).vx).toBeCloseTo(defaultTuning.player.runSpeed / 60, 5);
  });
});
