import { describe, expect, it } from 'vitest';
import { applyHitstop, beginHitstopStep, requestHitstop } from '../../../src/sim/combat/hitstop';
import type { SimEvent } from '../../../src/sim/events';
import { createState, step } from '../../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../../src/sim/tuning';
import { combatLab, events, fight, play, put } from './arena';

describe('U7 hitstop merge', () => {
  it('two requests on one step give the max, not the sum; the cap is 16', () => {
    const t = cloneTuning(defaultTuning);
    const s = createState({ seed: 1, roomId: combatLab() }, t);
    beginHitstopStep(s);
    requestHitstop(s, 'light', t);
    requestHitstop(s, 'heavy', t);
    requestHitstop(s, 'medium', t);
    const ev: SimEvent[] = [];
    applyHitstop(s, t, ev);
    expect(s.hitstop).toBe(t.combat.hitstopHeavy);
    expect(ev).toEqual([{ type: 'hitstop', frames: t.combat.hitstopHeavy, cls: 'heavy' }]);
    // Cap.
    t.combat.hitstopRepossess = 40;
    beginHitstopStep(s);
    requestHitstop(s, 'repossess', t);
    applyHitstop(s, t, []);
    expect(s.hitstop).toBe(t.combat.hitstopCap);
  });

  it('the request lives in the state and is cleared after it is applied (no module scratch)', () => {
    const t = cloneTuning(defaultTuning);
    const a = createState({ seed: 1, roomId: combatLab() }, t);
    const b = createState({ seed: 1, roomId: combatLab() }, t);
    requestHitstop(a, 'heavy', t);
    // Stepping another state is unaffected by a's pending request.
    const ev: SimEvent[] = [];
    step(b, 0, t, ev);
    expect(ev.some((e) => e.type === 'hitstop')).toBe(false);
    // A stray request made outside a step is dropped at the start of the next one.
    step(a, 0, t, ev);
    expect(a.hitstop).toBe(0);
    expect(a.hitstopReq.frames).toBe(0);
  });

  it('nothing moves during the freeze; a jump mashed during it comes out on the first free frame', () => {
    const f = fight();
    const e = put(f, 'barker', 70);
    play(f, 'A1 .4'); // jab lands on frame 5: light hitstop 4
    expect(events(f, 'hit').length).toBe(1);
    const x = e.x;
    const kid = f.s.player.x;
    expect(f.s.hitstop).toBeGreaterThan(0);
    play(f, 'J1');
    expect(e.x).toBe(x);
    expect(f.s.player.x).toBe(kid);
    play(f, `.${f.s.hitstop}`);
    const jumped = f.steps
      .slice(-3)
      .flat()
      .some((ev) => ev.type === 'jump');
    const next: SimEvent[] = [];
    step(f.s, 0, f.t, next);
    expect(jumped || next.some((ev) => ev.type === 'jump')).toBe(true);
  });
});
