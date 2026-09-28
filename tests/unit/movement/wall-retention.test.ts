/**
 * L2 playtest P0: wall speed retention must never undo a wall jump or glue the player to a wall.
 * Touch a wall while rising (retention stores the pre-contact vx), then wall jump 0..4 frames
 * later: the jump must travel exactly as far as one made after retention has expired.
 */
import { describe, expect, it } from 'vitest';
import { assignTuning, PRESET_NAMES, type PresetName, presetTuning } from '../../../src/sim/tuning';
import { makeRoom, place, run, TS, world } from './helpers';

const TALL = makeRoom(30, 60, undefined, { spawn: [3, 58] });
const WALL_X = 29 * TS;
const W = 40;

function presetWorld(name: PresetName) {
  return world(TALL, (t) => assignTuning(t, presetTuning(name)));
}

/**
 * Rises into the right wall holding Right, waits `delay` frames after the contact frame (still
 * holding Right), then presses `btn` and holds it. Returns x relative to the wall contact x for
 * the 10 frames after the press, the vx on each of them, and the jump kinds.
 */
function wallJumpAfterContact(name: PresetName, delay: number, btn: 'L+J' | 'J' | 'R+J') {
  const w = presetWorld(name);
  const maxRun = w.tuning.run.maxSpeed;
  place(w, WALL_X - W - 3 * Math.ceil(maxRun), 1600, maxRun, -18);
  let contact = 0;
  for (let i = 0; i < 10 && !contact; i++) {
    run(w, 'R1');
    if (w.state.player.x === WALL_X - W) contact = w.frame;
  }
  expect(contact, `${name}: never reached the wall`).toBeGreaterThan(0);
  expect(w.state.player.vy, `${name}: must still be rising (no wall slide)`).toBeLessThan(0);
  const x0 = w.state.player.x;
  if (delay > 0) run(w, `R${delay}`);
  const xs: number[] = [];
  const vxs: number[] = [];
  const kinds: string[] = [];
  run(w, `${btn}10`, (_, s, evs) => {
    xs.push(s.player.x - x0);
    vxs.push(s.player.vx);
    for (const e of evs) if (e.type === 'jump') kinds.push(e.kind);
  });
  return { xs, vxs, kinds };
}

describe('wall speed retention never cancels a wall jump (L2 playtest P0)', () => {
  for (const name of PRESET_NAMES) {
    for (const btn of ['L+J', 'J', 'R+J'] as const) {
      it(`${name}: ${btn} on frames 0..4 after contact matches a late wall jump`, () => {
        const ref = wallJumpAfterContact(name, 8, btn);
        expect(ref.kinds[0]).toBe('wall');
        for (let d = 0; d <= 4; d++) {
          const r = wallJumpAfterContact(name, d, btn);
          expect(r.kinds[0], `${name} delay ${d}`).toBe('wall');
          // Never pulled back toward the wall while the kick is fresh (hk's neutral kick stops dead).
          expect(
            r.vxs.slice(0, 6).every((v) => v <= 0) && (r.vxs[0] ?? 0) < 0,
            `${name} ${btn} delay ${d}: vx ${r.vxs.map((v) => v.toFixed(2)).join(' ')}`,
          ).toBe(true);
          // Same travel (±1 px: the sub-pixel remainder at contact differs with the delay).
          const off = r.xs.map((x, i) => Math.abs(x - (ref.xs[i] ?? 0)));
          expect(Math.max(...off), `${name} ${btn} delay ${d}: ${r.xs} vs ${ref.xs}`).toBeLessThanOrEqual(1);
        }
      });
    }

    it(`${name}: holding away right after touching a wall leaves it without oscillating`, () => {
      const w = presetWorld(name);
      const maxRun = w.tuning.run.maxSpeed;
      place(w, WALL_X - W - 3 * Math.ceil(maxRun), 1600, maxRun, -18);
      run(w, 'R4');
      expect(w.state.player.x).toBe(WALL_X - W);
      const xs: number[] = [];
      run(w, 'L10', (_, s) => xs.push(s.player.x));
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] ?? 0, `xs ${xs.join(' ')}`).toBeLessThanOrEqual(xs[i - 1] ?? 0);
      expect(xs[xs.length - 1] ?? 0).toBeLessThan(WALL_X - W - 20);
    });
  }

  it('opus: reversing off a wall on the ground has no hitch (x moves away every frame)', () => {
    const w = presetWorld('opus');
    place(w, WALL_X - W - 40, 58 * TS + TS - 80);
    run(w, 'R8');
    expect(w.state.player.x).toBe(WALL_X - W);
    const xs: number[] = [];
    run(w, 'L6', (_, s) => xs.push(s.player.x));
    for (let i = 1; i < xs.length; i++) expect(xs[i] ?? 0, `xs ${xs.join(' ')}`).toBeLessThan(xs[i - 1] ?? 0);
  });
});
