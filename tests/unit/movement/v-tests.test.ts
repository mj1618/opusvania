import { describe, expect, it } from 'vitest';
import { ASSIST_NAMES, applyShape } from '../../../src/sim/tuning';
import { NO_ABILITIES } from '../../../src/sim/world/rooms';
import { CHECKS, HOLD_TABLE, measureJump } from './checks';
import { eventsOf, openRoom, place, run, STAND_Y, world } from './helpers';

/** movement-spec §7.1: every V-test with the `opus` defaults. */
describe('movement V-tests (opus defaults)', () => {
  for (const [id, { check }] of Object.entries(CHECKS)) {
    it(id, () => {
      const r = check();
      expect(r.ok, `${id} failed: ${JSON.stringify(r.detail)}`).toBe(true);
    });
  }

  it('V05 hold table matches exactly', () => {
    for (const [h, want] of HOLD_TABLE) expect(measureJump(undefined, h).apex).toBe(want);
  });

  it('V24 derive() round-trips: measured apex = shape for 3 random shapes', () => {
    // Seeded LCG so the shapes are fixed (and not Math.random).
    let s = 12345;
    const rnd = () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 3; i++) {
      const H = Math.round(128 + rnd() * 256);
      const T = Math.round(16 + rnd() * 16);
      const m = measureJump((t) => {
        t.shape.jumpHeightPx = H;
        t.shape.apexFrames = T;
        applyShape(t);
        t.assists.apexHang = false;
      });
      expect(Math.abs(m.apex - H), `H=${H} T=${T} got ${m.apex}`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.apexFrame - T), `H=${H} T=${T} apex frame ${m.apexFrame}`).toBeLessThanOrEqual(1);
    }
  });
});

/** movement-spec §7.2: sim latency. Run, jump and pogo respond on the press frame. */
describe('sim latency', () => {
  it('run moves x and jump sets vy on the press frame', () => {
    const w = world(openRoom());
    place(w, 256, STAND_Y);
    run(w, 'R1');
    expect(w.state.player.x).toBeGreaterThan(256);
    const j = world(openRoom());
    place(j, 256, STAND_Y);
    const evs = run(j, 'J1');
    expect(j.state.player.vy).toBeLessThan(0);
    expect(j.state.player.y).toBeLessThan(STAND_Y);
    expect(eventsOf(evs, 'jump')).toHaveLength(1);
  });

  it('dash gives feedback (dashStart) on the press frame and moves at +2', () => {
    const w = world(openRoom());
    place(w, 256, STAND_Y);
    const evs = run(w, 'X1');
    expect(eventsOf(evs, 'dashStart')).toHaveLength(1);
    run(w, '.1');
    expect(w.state.player.x).toBe(256);
    run(w, '.1');
    expect(w.state.player.x).toBe(256 + 24);
  });
});

/** V23: each assist off breaks only the checks it owns; every other check still passes. */
describe('V23 assist isolation', () => {
  for (const assist of ASSIST_NAMES) {
    it(`${assist} off`, () => {
      const unexpected: string[] = [];
      for (const [id, { check, assists }] of Object.entries(CHECKS)) {
        const owned = assists?.includes(assist) ?? false;
        const r = check((t) => {
          t.assists[assist] = false;
        });
        if (owned && r.ok) unexpected.push(`${id} still passes`);
        if (!owned && !r.ok) unexpected.push(`${id} broke: ${JSON.stringify(r.detail)}`);
      }
      expect(unexpected).toEqual([]);
    });
  }
});

describe('abilities gate moves', () => {
  it('no dash, wall jump, double jump or pogo without the ability', () => {
    const w = world(openRoom(NO_ABILITIES));
    place(w, 256, STAND_Y);
    const evs = run(w, 'X1 .20 J10 .1 J10 .10 D+A1 .40');
    expect(eventsOf(evs, 'dashStart')).toHaveLength(0);
    expect(eventsOf(evs, 'jump').map((e) => e.kind)).toEqual(['ground']);
  });
});
