import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { newSim, type Sim } from './helpers';

/**
 * Hazard returns never chain (impatient first-timer, 2026-10-17: put back on R6's T3 with jump + right
 * still held, she re-jumped into the same thorn branch, 3 hearts in ~3 s, twice). After a fall catch, a
 * thorn's return or a re-form she fades in (`room.returnFadeIn`: no input, untouchable), no button held
 * as she came back is a press until it is let go (its hold still acts), and a return is never a spot
 * whose natural next jump carries her back into thorns (src/sim/return.ts).
 *
 * The scene is R6's gap 3 as the first-timer met it (before the branch was raised): T3 to its lip at
 * 3648 (y 1472), a 1024 gap with floor thorns, T4 at y 1984, and a thorn branch over the jump's hump.
 */

const R = ActionBit.right;
const J = ActionBit.jump;
const T = defaultTuning.room;
const LIP = 3648;

const GAP: Scene = {
  id: 'test-gap',
  width: 6000,
  height: 2400,
  spawn: { x: 400, y: 1472 },
  solids: [
    { tag: 'ground', x: 0, y: 1472, w: LIP, h: 928 },
    { tag: 'ground', x: LIP, y: 2272, w: 1024, h: 128 },
    { tag: 'ground', x: 4672, y: 1984, w: 1328, h: 416 },
  ],
  oneWays: [],
  thorns: [
    { id: 'branch', x: 3798, y: 1112, w: 400, h: 160 },
    { id: 'floor', x: LIP, y: 2240, w: 1024, h: 32 },
  ],
};

const feet = (s: Sim) => ({
  x: s.state.player.x + s.state.player.w / 2,
  y: s.state.player.y + s.state.player.h,
});
function hold(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
/** Runs from x 3100 on T3 to `lead` px before the lip (standing long enough to be safe ground there). */
function toTheLip(lead: number, t = structuredClone(defaultTuning)): Sim {
  const s = newSim(GAP, t);
  s.place(3100, 1472);
  hold(s, 0, 40);
  for (let i = 0; i < 400 && feet(s).x < LIP - lead; i++) hold(s, R, 1);
  return s;
}

describe('hazard returns never chain', () => {
  it('the scene: a jump + right from T3 meets the branch; from 72 px in (the old return spot) every jump-glide does', () => {
    for (const lead of [0, 40, 80, 120]) {
      const s = toTheLip(lead);
      expect(
        hold(s, R | J, 120).find((e) => e.type === 'thornHit'),
        `lead ${lead}`,
      ).toMatchObject({ id: 'branch' });
    }
    const s = newSim(GAP);
    s.place(LIP - T.returnInset, 1472);
    hold(s, 0, 40);
    expect(hold(s, R | J, 120).some((e) => e.type === 'thornHit')).toBe(true);
  });

  it('jump + right held through the thorn hit costs one light, not three: no jump by itself, the hold glides her to T4', () => {
    for (const lead of [0, 40, 80, 120]) {
      const s = toTheLip(lead);
      const hp = s.state.player.hp;
      const ev = hold(s, R | J, 600);
      expect(
        ev.filter((e) => e.type === 'thornHit'),
        `lead ${lead}`,
      ).toHaveLength(1);
      expect(s.state.player.hp).toBe(hp - 1);
      expect(
        ev.filter((e) => e.type === 'jump'),
        `lead ${lead}`,
      ).toHaveLength(1);
      expect(ev.find((e) => e.type === 'fallReturn')).toMatchObject({
        id: 'thorns:branch',
        fadeIn: T.returnFadeIn,
      });
      expect(feet(s).y, `lead ${lead}`).toBe(1984);
    }
  });

  it('the return spot is one whose natural next jump (pressed afresh, held toward the lip) clears the thorns', () => {
    for (const lead of [0, 80]) {
      const s = toTheLip(lead);
      const back = hold(s, R | J, 200).find((e) => e.type === 'fallReturn') as
        | { x: number; y: number }
        | undefined;
      if (!back) throw new Error('not put back');
      expect(back.x).toBeLessThan(LIP - T.returnInset);
      expect(back.y).toBe(1472);
      hold(s, 0, 40);
      const after = hold(s, R | J, 300);
      expect(
        after.some((e) => e.type === 'thornHit'),
        `lead ${lead}`,
      ).toBe(false);
      expect(feet(s).y).toBe(1984);
    }
    // Without the probe she would be put back 72 px from the lip.
    const t = structuredClone(defaultTuning);
    t.room.returnProbeFrames = 0;
    const s = toTheLip(0, t);
    const back = hold(s, R | J, 200).find((e) => e.type === 'fallReturn') as { x: number } | undefined;
    expect(back?.x).toBe(LIP - T.returnInset);
  });

  it('she fades in (no input, untouchable), then holds act, and only a fresh press jumps', () => {
    const s = toTheLip(40);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 200 && !ev.some((e) => e.type === 'fallReturn'); i++) ev = hold(s, R | J, 1);
    const p = () => s.state.player;
    expect(p().invuln).toBeGreaterThanOrEqual(T.returnFadeIn - 1);
    // (The step that put her back was the fade-in's first frame.)
    expect(p().fadeIn).toBe(T.returnFadeIn - 1);
    const x0 = feet(s).x;
    hold(s, R | J, T.returnFadeIn - 1);
    expect(feet(s).x).toBe(x0);
    const walk = hold(s, R | J, 10);
    expect(feet(s).x).toBeGreaterThan(x0);
    expect(walk.some((e) => e.type === 'jump')).toBe(false);
    hold(s, R, 1);
    expect(hold(s, R | J, 1).some((e) => e.type === 'jump')).toBe(true);
  });

  it('a re-form after a fade: a fade-in, and the held jump waits to be pressed afresh', () => {
    const s = toTheLip(40);
    s.state.player.hp = 1;
    const ev = hold(s, R | J, 400);
    const reform = ev.find((e) => e.type === 'reform');
    expect(reform).toMatchObject({ fadeIn: T.returnFadeIn });
    expect(ev.slice(ev.indexOf(reform as SimEvent)).filter((e) => e.type === 'jump')).toEqual([]);
  });
});
