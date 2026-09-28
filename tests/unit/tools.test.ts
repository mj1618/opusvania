/**
 * L2 verification tooling: DSL, headless runner, event log, bot, feel report, gamepad check.
 * Uses its own lab rooms (registerTestRoom) so it survives gym/room rewrites.
 */
import { describe, expect, it } from 'vitest';
import { formatTape, parseTape } from '../../src/debug/dsl';
import { EventLog } from '../../src/debug/event-log';
import { formatTrace, runScenario } from '../../src/debug/headless';
import {
  LEGACY_CONTROLLER,
  nominalFeel,
  playerView,
  presetNames,
  presetTuning,
  registerTestRoom,
  resolveTarget,
} from '../../src/debug/sim-adapter';
import { Game } from '../../src/game';
import { isStandardPad } from '../../src/input/gamepad';
import { parseInputScript } from '../../src/input/script';
import { maskOf } from '../../src/sim/input';
import * as tuningModule from '../../src/sim/tuning';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { search } from '../../tools/bot/search';
import { measureFeel } from '../../tools/feel-report/metrics';

// Test rooms use only '#', '.', 'P' and are >= 30x17, so they load the same in both room formats.
const OPEN = registerTestRoom('tools-open', [
  '##############################',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
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

// A pocket at tile (6,2) sealed off from a 4x2-tile spawn area: unreachable, and small enough
// that the search exhausts quickly on any controller.
const SEALED = registerTestRoom('tools-sealed', [
  '##############################',
  '#....#########################',
  '#.P..#.#######################',
  ...Array.from({ length: 14 }, () => '##############################'),
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
    const r = runScenario({ room: OPEN, inputs: 'R200', stop: { target: 'tile:10,15' } });
    expect(r.reachedAt).toBe(r.steps);
    expect(r.steps).toBeLessThan(200);
  });

  it('applies presets/tuning overrides and assists', () => {
    const base = runScenario({ room: OPEN, inputs: '.5 J30 .30', trace: true });
    const floaty = runScenario({
      room: OPEN,
      inputs: '.5 J30 .30',
      trace: true,
      tuning: { jump: { gravity: defaultTuning.jump.gravity * 0.6 } },
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
    const opts = { room: OPEN, target: 'tile:17,12', budget: 60_000 };
    const a = search(opts);
    expect(a.found).toBe(true);
    expect(a.verified).toBe(true);
    const b = search(opts);
    expect(b.tape).toBe(a.tape);
    expect(b.generated).toBe(a.generated);
    // The tape really gets there when replayed on its own.
    const r = runScenario({ room: OPEN, inputs: a.tape ?? '', stop: { target: 'tile:17,12' } });
    expect(r.reachedAt).toBeDefined();
  });

  it('reports an unreachable target as exhausted', () => {
    const r = search({ room: SEALED, target: 'tile:6,2', budget: 400_000 });
    expect(r.found).toBe(false);
    expect(r.exhausted).toBe(true);
    expect(resolveTarget(SEALED, 'tile:6,2')).toEqual({ x: 6 * 64, y: 2 * 64, w: 64, h: 64 });
  });

  it('respects the budget', () => {
    const r = search({ room: OPEN, target: 'tile:22,9', budget: 50 });
    expect(r.generated).toBeLessThanOrEqual(50 + 12);
  });
});

describe('feel report', () => {
  it('measures what the tuning declares', () => {
    const nominal = nominalFeel(cloneTuning(defaultTuning));
    const f = measureFeel();
    // Coyote and buffer windows equal the frame counts in tuning. (The Phase 0 controller spends
    // one of its coyote frames on the frame that walks off the ledge.)
    expect(f.raw.coyoteFrames).toBe(LEGACY_CONTROLLER ? nominal.coyoteFrames - 1 : nominal.coyoteFrames);
    expect(f.raw.bufferFrames).toBe(nominal.jumpBufferFrames);
    // Apex within 10% of the configured jump height (apex hang may add a few px).
    expect(Math.abs(f.raw.fullJump.heightPx - nominal.jumpHeightPx)).toBeLessThan(nominal.jumpHeightPx * 0.1);
    expect(f.raw.run.topSpeed).toBeCloseTo(nominal.runPxPerFrame, 5);
    expect(f.metrics.tapFullRatio).toBeLessThan(0.5);
    // Coyote widens the gap-jump window.
    const gap = f.forgiveness[0];
    expect(gap && gap.on.successes - gap.off.successes).toBeGreaterThanOrEqual(nominal.coyoteFrames - 1);
  });

  it('is deterministic and responds to tuning', () => {
    expect(measureFeel().metrics).toEqual(measureFeel().metrics);
    const low = measureFeel({ tuning: { jump: { jumpSpeed: defaultTuning.jump.jumpSpeed * 0.7 } } });
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

describe('sim adapter', () => {
  it('finds the controller presets when the tuning module exports them', () => {
    const exported = Reflect.get(tuningModule, 'PRESETS') as Record<string, unknown> | undefined;
    expect(presetNames()).toEqual(exported ? Object.keys(exported) : ['default']);
    for (const n of presetNames()) expect(presetTuning(n)).toBeTruthy();
  });
});

describe('player view', () => {
  it('reports velocities in px/frame on any controller', () => {
    const r = runScenario({ room: OPEN, inputs: '.5 R30' });
    expect(playerView(r.final.state).vx).toBeCloseTo(nominalFeel(defaultTuning).runPxPerFrame, 5);
  });
});
