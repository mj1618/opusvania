/**
 * L2 playtest P2 tuning: wall slide ramps from calm to ~6.5 px/f (was a flat, sticky 4), and the
 * `celeste` preset stops at Celeste's RunReduce (13.5 f from full run), not its RunAccel.
 */
import { describe, expect, it } from 'vitest';
import { assignTuning, type PresetName, presetTuning } from '../../../src/sim/tuning';
import { makeRoom, openRoom, place, run, STAND_Y, TS, world } from './helpers';

const TALL = makeRoom(30, 60, undefined, { spawn: [3, 58] });
const WALL_X = 29 * TS;

function preset(name: PresetName) {
  return (t: Parameters<typeof assignTuning>[0]) => assignTuning(t, presetTuning(name));
}

/** Starts a slide from rest against the right wall; returns vy for each of the first n slide frames. */
function slideVy(name: PresetName, n: number, hold: 'R' | '.' = 'R'): number[] {
  const w = world(TALL, preset(name));
  place(w, WALL_X - 40, 600, 0, 0);
  run(w, 'R1');
  expect(w.state.player.state).toBe('wallSlide');
  const vy: number[] = [];
  run(w, `${hold}${n}`, (_, s) => vy.push(s.player.vy));
  return vy;
}

describe('wall slide ramp (L2 playtest P2)', () => {
  it('opus: starts calm (<= 3 px/f for 2 frames), reaches 6.5 px/f, and never exceeds it', () => {
    const vy = slideVy('opus', 60);
    expect(Math.max(...vy.slice(0, 2))).toBeLessThanOrEqual(3);
    expect(vy.at(-1)).toBeCloseTo(6.5, 9);
    expect(Math.max(...vy)).toBeLessThanOrEqual(6.5 + 1e-9);
    // Monotonic ramp: no stutter.
    for (let i = 1; i < vy.length; i++) expect(vy[i] ?? 0).toBeGreaterThanOrEqual((vy[i - 1] ?? 0) - 1e-9);
  });

  it('opus: a 17-tile shaft slides down in well under the old 4.5 s', () => {
    const w = world(TALL, preset('opus'));
    place(w, WALL_X - 40, 600, 0, 0);
    const y0 = w.state.player.y;
    let frames = 0;
    while (w.state.player.y - y0 < 17 * TS && frames < 600) {
      run(w, 'R1');
      frames++;
    }
    expect(frames).toBeLessThan(200);
  });

  it('neutral input keeps the slide and the same ramp', () => {
    const vy = slideVy('opus', 30, '.');
    expect(vy.at(-1)).toBeCloseTo(6.5, 9);
  });

  it('celeste: cap ramps from 20 px/s toward MaxFall over 1.2 s (Celeste WallSlideTime)', () => {
    const vy = slideVy('celeste', 80);
    expect(vy[0] ?? 0).toBeLessThanOrEqual(8 / 3 + 1e-9);
    expect(vy[36] ?? 0).toBeGreaterThan(10);
    expect(vy.at(-1)).toBeCloseTo(64 / 3, 6);
  });

  it('hk: constant WALLSLIDE_SPEED (no ramp)', () => {
    const vy = slideVy('hk', 30);
    expect(vy.at(-1)).toBeCloseTo(8.53, 9);
    expect(vy.slice(10).every((v) => Math.abs(v - 8.53) < 1e-9)).toBe(true);
  });
});

describe('celeste preset run stop (L2 playtest P2)', () => {
  it('stops from full run in ~13.5 frames (RunReduce 400 px/s²), turns at RunAccel', () => {
    const w = world(openRoom(), preset('celeste'));
    place(w, 256, STAND_Y);
    run(w, 'R20');
    expect(w.state.player.vx).toBeCloseTo(12, 9);
    let stop = 0;
    run(w, '.30', (f, s) => {
      if (!stop && s.player.vx === 0) stop = f - 20;
    });
    expect(stop).toBe(14);
    const t = world(openRoom(), preset('celeste'));
    place(t, 256, STAND_Y);
    run(t, 'R20');
    let turn = 0;
    run(t, 'L30', (f, s) => {
      if (!turn && s.player.vx <= 0) turn = f - 20;
    });
    expect(turn).toBe(6);
  });
});
