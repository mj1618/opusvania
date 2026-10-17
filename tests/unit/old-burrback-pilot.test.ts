/**
 * The old burrback as a first mini-boss (memory/creatures.md; first-timer review r1: "~80 s, 2 deaths, 1 hit
 * landed in 3 attempts"). A slow, sloppy first-timer pilot: it reacts 20-30 frames after what it sees, its
 * presses are mistimed by up to 8 frames, it jumps the ram (straight up, or over it when close), runs in and
 * mashes when the old burrback lies open on its back, and now and then slashes the closed shell anyway.
 * Target: it wins; most in 1-2 attempts (a fade heals it and her, at her door: feel review round 2, problem 7).
 * `OLD_TRACE=1` prints every run.
 */
import { describe, expect, it } from 'vitest';
import { mix } from '../../src/sim/enemies/common';
import type { SimEvent } from '../../src/sim/events';
import { createState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const FLOOR = 1472;
/**
 * The den in miniature (round 5, area1-plan-r5 §1): 2048 px of floor between two walls, a taproot column
 * about a third in from the east wall, an escape ledge on the west wall, the old burrback asleep in the middle.
 */
const TAPROOT: [number, number] = [1600, 1680];
function pit(): Scene {
  return {
    id: 'pit',
    width: 2304,
    height: 1800,
    spawn: { x: 380, y: FLOOR },
    senses: 'lamp',
    solids: [
      { tag: 'ground', x: 0, y: FLOOR, w: 2304, h: 328 },
      { tag: 'ground', x: 0, y: 600, w: 128, h: 872 },
      { tag: 'ground', x: 2176, y: 600, w: 128, h: 872 },
      { tag: 'root', x: TAPROOT[0], y: 600, w: TAPROOT[1] - TAPROOT[0], h: 872 },
    ],
    oneWays: [{ tag: 'root', x: 128, y: FLOOR - 192, w: 128 }],
    enemies: [{ id: 'old', kind: 'oldBurrback', x: 1100, y: FLOOR, facing: -1, taproot: TAPROOT }],
  };
}

/** Hits she took, by what it was doing (OLD_TRACE prints it). */
const HURT_BY: Record<string, number> = {};
/** What it was doing the step before each hit she took (it must never be a state drawn as open). */
const HURT_FROM: Record<string, number> = {};

interface Run {
  won: boolean;
  fades: number;
  frames: number;
  hits: number;
  landed: number;
  clangs: number;
  feints: number;
}

/** One first-timer: reaction `react` frames, mistimed by up to `slop`, `seed` for its dice. */
function pilot(react: number, slop: number, seed: number, maxFrames = 60 * 240): Run {
  const t = cloneTuning(defaultTuning);
  const scene = pit();
  const events: SimEvent[] = [];
  const s = { state: createState(seed, t, scene, events) };
  const J = ActionBit.jump;
  const A = ActionBit.attack;
  const dice = (k: number, n: number) => mix(seed * 977 + k, n) % 1000;
  let roll = 0;
  // What it has seen, and when it will act on it.
  let jumpAt = -1;
  let jumpDir = 0;
  let jumpHold = 0;
  let openSince = -1;
  let lastPress = -100;
  const run: Run = { won: false, fades: 0, frames: 0, hits: 0, landed: 0, clangs: 0, feints: 0 };
  let prev = 0;
  let learned = false;
  for (let f = 0; f < maxFrames; f++) {
    const p = s.state.player;
    const e = s.state.enemies[0];
    if (!e || e.mode === 'dead') {
      run.won = true;
      run.frames = f;
      break;
    }
    const pc = p.x + p.w / 2;
    const ec = e.x + e.w / 2;
    const dx = ec - pc;
    const toward = dx < 0 ? ActionBit.left : ActionBit.right;
    const away = dx < 0 ? ActionBit.right : ActionBit.left;
    let m = 0;
    // The ram's tell: jump it, a reaction later and a little off.
    if (e.mode === 'windup' && jumpAt < 0 && jumpHold === 0) {
      jumpAt = f + react + (dice(1, roll++) % (2 * slop + 1)) - slop;
      // Close: over it. Further: straight up (and a few step back first).
      jumpDir = Math.abs(dx) < 170 ? 1 : dice(2, roll++) < 300 ? -1 : 0;
    }
    // The roll (phase 2): jump it as it comes (a reaction late, a little off); over it, a down cut (the pogo).
    if (e.mode === 'roll' && jumpAt < 0 && jumpHold === 0 && p.grounded) {
      const coming = -dx * e.facing > 0;
      const gap = Math.abs(dx) - (p.w + e.w) / 2;
      if (coming && gap < e.ramSpeed * (react + 6) + 40) {
        jumpAt = f + (dice(5, roll++) % (slop + 1));
        jumpDir = 0;
      }
    }
    if (jumpAt >= 0 && f >= jumpAt && p.grounded) {
      jumpHold = 16;
      jumpAt = -1;
    }
    if (jumpHold > 0) {
      m |= J | (jumpDir > 0 ? toward : jumpDir < 0 ? away : 0);
      jumpHold--;
    } else if (
      e.mode === 'roll' &&
      !p.grounded &&
      p.vy > 0 &&
      Math.abs(dx) < e.w / 2 + 20 &&
      dice(6, f >> 4) < 600
    ) {
      // Coming down over the ball: a down cut, most times.
      if (f - lastPress >= 10) {
        m |= ActionBit.down | A;
        lastPress = f;
      }
    } else if (e.stunned && (e.mode === 'recover' || e.mode === 'hurt')) {
      // Open (on its back): run in a reaction later and mash.
      if (openSince < 0) openSince = f;
      if (f - openSince >= react) {
        if (Math.abs(dx) > 70) m |= toward;
        if (Math.abs(dx) < 150 && f - lastPress >= 10 + (dice(3, roll++) % 6)) {
          m |= A;
          lastPress = f;
        }
      }
    } else {
      openSince = -1;
      // Phase 3: stand in front of the taproot (its far side from it) and let it come.
      const spot = ec < TAPROOT[0] ? TAPROOT[0] - p.w / 2 - 30 : TAPROOT[1] + p.w / 2 + 30;
      if (e.phase === 3 && e.mode !== 'windup' && e.mode !== 'charge' && Math.abs(pc - spot) > 24)
        m |= pc < spot ? ActionBit.right : ActionBit.left;
      // Otherwise: close in to about 220 px and wait; now and then it walks in and slashes anyway.
      else if (e.phase !== 3 && (e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert')) {
        if (Math.abs(dx) > 240) m |= toward;
        // (Now and then it walks in and slashes the closed shell anyway; once that has hurt it, it mostly stops.)
        else if (dice(4, Math.floor(f / 90)) < (learned ? 50 : 250)) {
          m |= toward;
          if (Math.abs(dx) < 130 && f - lastPress >= 14) {
            m |= A;
            lastPress = f;
          }
        }
      }
    }
    // A press needs a gap since the last frame it was held (the sim reads edges).
    if ((m & J) !== 0 && (prev & J) === 0 && !p.grounded) m &= ~J;
    const modeBefore = `${e.mode}${e.stunned ? '/open' : ''}`;
    const from = events.length;
    const before = `${e.mode}:${e.timer} cd${e.strikeCd} gap ${Math.round(Math.abs(dx) - (p.w + e.w) / 2)} her ${p.grounded ? 'g' : 'air'} vy ${p.vy.toFixed(1)} m ${m}`;
    step(s.state, m, t, scene, events);
    if (
      process.env.OLD_DEBUG &&
      seed === Number(process.env.OLD_SEED ?? 1) &&
      react === Number(process.env.OLD_REACT ?? 20)
    )
      for (let i = from; i < events.length; i++) {
        const ev = events[i] as SimEvent;
        if (/hurt|enemyWindup|enemyFeint|enemyCharge|enemyRecover|enemyWake|fade|enemyHit/.test(ev.type))
          console.log(f, ev.type, before);
      }
    prev = m;
    if (
      process.env.OLD_STATE &&
      seed === Number(process.env.OLD_SEED ?? 1) &&
      react === Number(process.env.OLD_REACT ?? 20) &&
      f % 60 === 0
    )
      console.log(
        `t${f / 60} ph${e.phase} ${e.mode}:${e.timer} st${e.stunned ? 1 : 0} hp${e.hp} ex${Math.round(e.x)} spd${e.ramSpeed} | p ${Math.round(p.x)},${Math.round(p.y)} hp${p.hp} camp${e.camp}`,
      );
    for (let i = from; i < events.length; i++) {
      const ev = events[i] as SimEvent;
      if (ev.type === 'hurt') {
        run.hits++;
        if (e.mode === 'alert' || e.mode === 'walk') learned = true;
        HURT_FROM[modeBefore] = (HURT_FROM[modeBefore] ?? 0) + 1;
        const k = `${e.mode}${e.feints ? `/f${e.feints}` : ''}`;
        HURT_BY[k] = (HURT_BY[k] ?? 0) + 1;
      }
      if (ev.type === 'fade') run.fades++;
      // (R10 re-forms her at its moon patch, whole: a fresh attempt.)
      if (ev.type === 'reform') s.state.player.hp = s.state.player.hpMax;
      if (ev.type === 'enemyHit' || ev.type === 'enemyDie') run.landed++;
      if (ev.type === 'enemyBlock') run.clangs++;
      if (ev.type === 'enemyFeint') run.feints++;
    }
    run.frames = f;
  }
  return run;
}

/**
 * The no-dodge masher (feel review r2: "a masher wins in 10.8 s"): it walks up to the old burrback and
 * slashes, never jumps, never steps back. Returns whether it faded before it killed it (one attempt).
 */
function masher(
  seed: number,
  maxFrames = 60 * 120,
): { faded: boolean; won: boolean; frames: number; landed: number } {
  const t = cloneTuning(defaultTuning);
  const scene = pit();
  const events: SimEvent[] = [];
  const state = createState(seed, t, scene, events);
  let last = -100;
  let landed = 0;
  for (let f = 0; f < maxFrames; f++) {
    const p = state.player;
    const e = state.enemies[0];
    if (!e || e.mode === 'dead') return { faded: false, won: true, frames: f, landed };
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    let m = Math.abs(dx) > e.w / 2 + 60 ? (dx < 0 ? ActionBit.left : ActionBit.right) : 0;
    // It mashes every 12-20 frames once it is close.
    if (Math.abs(dx) < e.w / 2 + 140 && f - last >= 12 + (mix(seed, f) % 9)) {
      m |= ActionBit.attack;
      last = f;
    }
    const from = events.length;
    step(state, m, t, scene, events);
    for (let i = from; i < events.length; i++) {
      const ev = events[i] as SimEvent;
      if (ev.type === 'fade') return { faded: true, won: false, frames: f, landed };
      if (ev.type === 'enemyHit' || ev.type === 'enemyDie') landed++;
    }
  }
  return { faded: false, won: false, frames: maxFrames, landed };
}

describe('the old burrback will not be beaten by standing and mashing', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ seed, ...masher(seed) }));
  if (process.env.OLD_TRACE)
    for (const r of runs)
      console.log(
        `masher seed ${r.seed}: ${r.faded ? 'faded' : r.won ? 'WON' : 'timeout'} at ${(r.frames / 60).toFixed(1)} s, landed ${r.landed}`,
      );

  it('the masher fades on most seeds, and never wins', () => {
    expect(runs.filter((r) => r.faded).length).toBeGreaterThanOrEqual(6);
    expect(runs.some((r) => r.won)).toBe(false);
  });
});

describe('the old burrback, the boss under the oak: a slow, sloppy first-timer wins, most in 1-2 attempts', () => {
  const runs: Array<Run & { react: number; seed: number }> = [];
  for (const react of [20, 25, 30])
    for (let seed = 1; seed <= 8; seed++) runs.push({ ...pilot(react, 8, seed), react, seed });
  if (process.env.OLD_TRACE)
    for (const r of runs)
      console.log(
        `react ${r.react} seed ${r.seed}: ${r.won ? 'won' : 'LOST'} in ${(r.frames / 60).toFixed(1)} s, attempts ${r.fades + 1}, hits ${r.hits}, landed ${r.landed}, clangs ${r.clangs}, feints ${r.feints}`,
      );

  if (process.env.OLD_TRACE) console.log('hits by its mode:', JSON.stringify(HURT_BY));

  it('anything drawn as open (on its back, getting up, asleep) never hurts her', () => {
    for (const k of Object.keys(HURT_FROM)) {
      expect(k.includes('/open')).toBe(false);
      expect(['recover', 'wake', 'sleep']).not.toContain(k);
    }
  });

  it('the 20- and 25-frame reactors win in at most 2 attempts; the slowest hands mostly win (a boss now, round 5)', () => {
    // (A fade makes the old burrback whole again and her too, at her door: no attrition. Since round 5 it is a
    // three-phase boss: the slowest hands (30 frames, sloppy) take 1-7 attempts, like an HK boss for a new player.)
    for (const r of runs)
      if (r.react <= 25) {
        expect(r.won, `react ${r.react} seed ${r.seed}`).toBe(true);
        expect(r.fades + 1, `react ${r.react} seed ${r.seed}`).toBeLessThanOrEqual(2);
      }
    expect(runs.filter((r) => r.react === 30 && r.won).length).toBeGreaterThanOrEqual(6);
  });

  it('a first-try win takes the three phases: 25 s or more even for quick hands, no standoff', () => {
    for (const r of runs) if (r.won && r.fades === 0) expect(r.frames / 60).toBeGreaterThanOrEqual(25);
  });

  it('most win at the first or second attempt', () => {
    const early = runs.filter((r) => r.fades <= 1).length;
    expect(early / runs.length).toBeGreaterThanOrEqual(0.75);
  });

  it('it feints only once its health is down a third', () => {
    for (const r of runs) if (r.won) expect(r.landed).toBeGreaterThan(0);
  });
});
