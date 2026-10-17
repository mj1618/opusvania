/**
 * R4's first burrback for a slow, sloppy first-timer (first-timer casual r2: "came down on it with ↓+C and was
 * hurt instead of bounced"; "it hit me once from a body-length away"; "it slid to where I landed"). A replica of
 * the encounter: a 4 hp burrback under a wick on a long floor. The pilot reacts 20-30 frames after the brace,
 * its presses are off by up to 8 frames, it jumps the ram (over it when close), cuts it winded, and when it is
 * over the burrback's back it presses ↓+C (too early as often as not). `R4_TRACE=1` prints every run.
 */
import { describe, expect, it } from 'vitest';
import { mix } from '../../src/sim/enemies/common';
import type { SimEvent } from '../../src/sim/events';
import { createState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const FLOOR = 1344;
/** R4's teaching burrback braces longer than the row's 26 (`windup` on its spawn). */
const TELL = 32;
function r4(kind: 'burrback' | 'juvenileBurrback' = 'burrback'): Scene {
  return {
    id: 'r4',
    width: 3600,
    height: 1800,
    spawn: { x: 400, y: FLOOR },
    senses: 'lamp',
    solids: [{ tag: 'ground', x: 0, y: FLOOR, w: 3600, h: 456 }],
    oneWays: [],
    lures: [{ id: 'w3', kind: 'wick', x: 1984, y: 1144 }],
    enemies: [
      {
        id: 'burr',
        kind,
        x: 1984,
        y: FLOOR,
        facing: -1,
        hp: kind === 'burrback' ? 4 : undefined,
        radius: 576,
        guards: 'w3',
        windup: kind === 'burrback' ? TELL : undefined,
      },
    ],
  };
}

interface Run {
  won: boolean;
  frames: number;
  hits: number;
  fades: number;
  stompHurts: number;
  stomps: number;
}

function pilot(
  react: number,
  slop: number,
  seed: number,
  kind: 'burrback' | 'juvenileBurrback' = 'burrback',
  maxFrames = 60 * 90,
): Run {
  const t = cloneTuning(defaultTuning);
  const scene = r4(kind);
  const events: SimEvent[] = [];
  const state = createState(seed, t, scene, events);
  const J = ActionBit.jump;
  const A = ActionBit.attack;
  const D = ActionBit.down;
  const dice = (k: number, n: number) => mix(seed * 977 + k, n) % 1000;
  let roll = 0;
  let jumpAt = -1;
  let jumpDir = 0;
  let jumpHold = 0;
  let downAt = -1;
  let openSince = -1;
  let last = -100;
  let prev = 0;
  const run: Run = { won: false, frames: 0, hits: 0, fades: 0, stompHurts: 0, stomps: 0 };
  for (let f = 0; f < maxFrames; f++) {
    const p = state.player;
    const e = state.enemies[0];
    if (!e || e.mode === 'dead') {
      run.won = true;
      run.frames = f;
      break;
    }
    const pc = p.x + p.w / 2;
    const dx = e.x + e.w / 2 - pc;
    const toward = dx < 0 ? ActionBit.left : ActionBit.right;
    let m = 0;
    if (e.mode === 'windup' && jumpAt < 0 && jumpHold === 0) {
      jumpAt = f + react + (dice(1, roll++) % (2 * slop + 1)) - slop;
      jumpDir = Math.abs(dx) < 160 ? 1 : 0;
    }
    if (jumpAt >= 0 && f >= jumpAt && p.grounded) {
      jumpHold = 16;
      jumpAt = -1;
      downAt = -1;
    }
    if (jumpHold > 0) {
      m |= J | (jumpDir > 0 ? toward : 0);
      jumpHold--;
    } else if (!p.grounded) {
      // Over its back, coming down: ↓+C, sometimes early.
      if (downAt < 0 && p.vy > 0 && Math.abs(dx) < 70) downAt = f + (dice(2, roll++) % 12);
      if (downAt >= 0 && f >= downAt && f - last >= 12) {
        m |= D | A;
        last = f;
        downAt = -1;
      }
    } else if (e.mode === 'recover') {
      if (openSince < 0) openSince = f;
      if (f - openSince >= react) {
        if (Math.abs(dx) > 70) m |= toward;
        if (Math.abs(dx) < 140 && f - last >= 12 + (dice(3, roll++) % 6)) {
          m |= A;
          last = f;
        }
      }
    } else {
      openSince = -1;
      // Walk up to it and cut at it: a first-timer goes to the thing.
      if (Math.abs(dx) > 90) m |= toward;
      if (Math.abs(dx) < 130 && f - last >= 16) {
        m |= A;
        last = f;
      }
    }
    if ((m & J) !== 0 && (prev & J) === 0 && !p.grounded) m &= ~J;
    const wasDown = p.attack === 'down' && !p.grounded && p.y + p.h <= e.y + 24;
    const from = events.length;
    step(state, m, t, scene, events);
    prev = m;
    for (let i = from; i < events.length; i++) {
      const ev = events[i] as SimEvent;
      if (ev.type === 'hurt') {
        run.hits++;
        if (
          process.env.R4_HITS &&
          seed === Number(process.env.R4_HITS) &&
          react === Number(process.env.R4_REACT)
        )
          console.log(
            'hit',
            f,
            e.mode,
            'gap',
            Math.round(Math.abs(dx) - (p.w + e.w) / 2),
            'her',
            p.grounded ? 'g' : 'air',
            'm',
            m,
            'cd',
            e.strikeCd,
          );
        if (wasDown) {
          run.stompHurts++;
          if (process.env.R4_TRACE)
            console.log(
              'hurt in a down slash',
              f,
              e.mode,
              e.braced,
              e.tuck,
              'feet',
              p.y + p.h,
              'top',
              e.y,
              'vy',
              p.vy,
              'attackFrames',
              p.attackFrames,
              'hitBy',
              e.hitBy,
              p.attackSeq,
            );
        }
      }
      if (ev.type === 'fade') run.fades++;
      if (ev.type === 'enemyBlock' && ev.slash === 'down') run.stomps++;
    }
    run.frames = f;
  }
  return run;
}

describe("R4's first burrback, a slow first-timer", () => {
  const runs: Array<Run & { react: number; seed: number }> = [];
  for (const react of [20, 25, 30])
    for (let seed = 1; seed <= 6; seed++) runs.push({ ...pilot(react, 8, seed), react, seed });
  if (process.env.R4_TRACE)
    for (const r of runs)
      console.log(
        `react ${r.react} seed ${r.seed}: ${r.won ? 'won' : 'LOST'} in ${(r.frames / 60).toFixed(1)} s, hits ${r.hits}, fades ${r.fades}, stomps ${r.stomps}, hurt in a down slash over it ${r.stompHurts}`,
      );

  it('kills it every time without fading, taking at most 2 hits', () => {
    for (const r of runs) {
      expect(r.won).toBe(true);
      expect(r.fades).toBe(0);
      expect(r.hits).toBeLessThanOrEqual(2);
    }
  });

  it('a down slash coming down on its back never hurts her', () => {
    for (const r of runs) expect(r.stompHurts).toBe(0);
  });
});

describe("R4's juvenile beetle, the first creature: a slow first-timer", () => {
  const runs: Array<Run & { react: number; seed: number }> = [];
  for (const react of [20, 25, 30])
    for (let seed = 1; seed <= 6; seed++)
      runs.push({ ...pilot(react, 8, seed, 'juvenileBurrback'), react, seed });
  if (process.env.R4_TRACE)
    for (const r of runs)
      console.log(
        `juvenile react ${r.react} seed ${r.seed}: ${r.won ? 'won' : 'LOST'} in ${(r.frames / 60).toFixed(1)} s, hits ${r.hits}`,
      );

  it('kills it every time, taking at most one hit, with no pogo needed', () => {
    for (const r of runs) {
      expect(r.won).toBe(true);
      expect(r.hits).toBeLessThanOrEqual(1);
    }
  });
});
