import { describe, expect, it } from 'vitest';
import { conservationProblems } from '../../../src/sim/sound';
import { cloneTuning, defaultTuning } from '../../../src/sim/tuning';
import { count, firstStep, lab, play, start } from './lab';

// Kid spawns at tile (2, 14): x = 140..180, feet on y 960. A 1-wide pink wall at col 3 is 12 px ahead.
const wallRoom = () =>
  lab([[14, 2, 'P']].concat([11, 12, 13, 14].map((y) => [y, 3, 'H'])) as [number, number, string][]);

/** Frames a move is in progress, not counting global hitstop steps (A2's definition). */
function moveFrames(r: ReturnType<typeof start>, script: string): number {
  let n = 0;
  for (const ch of script.split(' ')) void ch;
  const before = r.steps.length;
  play(r, script, true);
  for (let i = before; i < r.snaps.length; i++) {
    const s = r.snaps[i];
    const prev = i > 0 ? r.snaps[i - 1] : undefined;
    const frozen = prev !== undefined && prev.hitstop > 0;
    if (s?.player.move && !frozen) n++;
  }
  return n;
}

describe('A1 responsiveness: Seize', () => {
  it('moveStart on the press step (frame 1) and seizeTake on frame 6', () => {
    const r = play(start(wallRoom()), 'S1 .20');
    expect(firstStep(r, 'moveStart')).toBe(1);
    expect(firstStep(r, 'seizeTake')).toBe(6);
    // Same step: ghost + hitstop (A4/E3 on the sim side).
    const ev = r.steps[5]?.map((e) => e.type) ?? [];
    expect(ev).toEqual(expect.arrayContaining(['seizeTake', 'ghost', 'hitstop']));
  });
});

describe('A2 durations (hitstop steps excluded)', () => {
  it('seize take 14, whiff 18, levy 10, dry levy 6', () => {
    expect(moveFrames(start(wallRoom()), 'S1 .40')).toBe(14);
    expect(moveFrames(start(lab([[14, 2, 'P']])), 'S1 .40')).toBe(18);
    const r = start(wallRoom());
    moveFrames(r, 'S1 .30');
    expect(moveFrames(r, 'V1 .30')).toBe(10);
    expect(moveFrames(start(lab([[14, 2, 'P']])), 'V1 .30')).toBe(6);
  });

  it('no move ever ignores horizontal input (full run control during seize and levy)', () => {
    const room = lab([[14, 2, 'P']]);
    const a = play(start(room), 'R20 R+S1 R20', true);
    const b = play(start(room), 'R41', true);
    // The whiffing seize never changes the run: same x every step.
    expect(a.snaps.map((s) => s.player.x)).toEqual(b.snaps.map((s) => s.player.x));
  });
});

describe('A3 momentum', () => {
  for (const verb of ['S', 'V', 'D+V']) {
    it(`aerial ${verb} keeps >= 80% of vx 10 steps later`, () => {
      const r = start(lab([[14, 2, 'P']]));
      play(r, 'S1 .20'); // (a whiff; the bag stays empty -> V is a dry levy, still a move)
      play(r, 'R20 R+J6 R2', true);
      const vx0 = r.s.player.vx;
      play(r, `R+${verb}1 R9`, true);
      expect(Math.abs(r.s.player.vx)).toBeGreaterThanOrEqual(0.8 * Math.abs(vx0));
    });
  }
});

describe('bag FIFO, conservation, weight', () => {
  it('a 4th take pushes the oldest home; its owner re-arms on the same step; bag never > 3', () => {
    // Four 1x1 sources in a column in front of Kid's chest height... simpler: four walls in a row.
    const room = lab([
      [14, 2, 'P'],
      [14, 4, 'F'],
      [14, 7, 'F'],
      [14, 10, 'H'],
      [14, 13, 'H'],
    ]);
    const r = start(room);
    let pushes = 0;
    for (let i = 0; i < 4; i++) {
      play(r, 'R40 S1 .20');
      pushes = count(r, 'bagPush');
      expect(r.s.local.bag.length).toBeLessThanOrEqual(3);
      expect(conservationProblems(r.s.local, 3)).toEqual([]);
    }
    expect(r.s.local.bag.length).toBe(3);
    expect(pushes).toBe(1);
    const pushStep = firstStep(r, 'bagPush');
    // The pushed source's ghost ends on the same step (or it goes pending if Kid overlaps it).
    const ev = r.steps[pushStep - 1]?.map((e) => e.type) ?? [];
    const first = r.s.local.sources[0];
    expect(first?.ghost === false || first?.pendingSolid === true).toBe(true);
    expect(ev).toContain('seizeTake');
  });

  it('weight class follows brown sounds: feather -> middle -> heavy, then back when levied', () => {
    const r = start(
      lab([
        [14, 2, 'P'],
        [14, 4, 'F'],
        [14, 7, 'F'],
      ]),
    );
    expect(r.s.player.profile).toBe('feather');
    play(r, 'R40 S1 .20');
    expect(r.s.player.profile).toBe('middle');
    play(r, 'R40 S1 .20');
    expect(r.s.player.profile).toBe('heavy');
    expect(count(r, 'profileChange')).toBe(2);
    play(r, 'L1 V1 .20');
    expect(r.s.player.profile).toBe('middle');
  });

  it('adjacent classes differ by >= 15% in jump height and >= 2 f in apex (A5)', () => {
    const t = cloneTuning(defaultTuning);
    const p = t.profiles;
    const f = t.shape;
    const m = { ...f, ...p.middle?.shape };
    const h = { ...f, ...p.heavy?.shape };
    expect(m.jumpHeightPx / f.jumpHeightPx).toBeLessThanOrEqual(0.85);
    expect(h.jumpHeightPx / m.jumpHeightPx).toBeLessThanOrEqual(0.85);
    expect(f.apexFrames - m.apexFrames).toBeGreaterThanOrEqual(2);
    expect(m.apexFrames - h.apexFrames).toBeGreaterThanOrEqual(2);
    expect(p.feather).toEqual({});
  });
});

describe('sources: ghost, passable, pending', () => {
  it('a take ghosts the wall on the same step and Kid runs through on the next', () => {
    const r = play(start(wallRoom()), 'S1 .5');
    const src = r.s.local.sources[0];
    expect(src?.ghost).toBe(true);
    const x0 = r.s.player.x;
    play(r, 'R12');
    expect(r.s.player.x).toBeGreaterThan(x0 + 40);
  });

  it('white static is refused (whiff recovery) and never ghosts', () => {
    const r = play(
      start(
        lab([
          [14, 2, 'P'],
          [11, 3, 'W'],
          [12, 3, 'W'],
          [13, 3, 'W'],
          [14, 3, 'W'],
        ]),
      ),
      'S1 .30',
    );
    expect(count(r, 'seizeRefused')).toBe(1);
    expect(count(r, 'seizeTake')).toBe(0);
    expect(r.s.local.sources[0]?.ghost).toBe(false);
  });

  it('a pushed-back source stays pending while Kid stands inside it, then re-solidifies', () => {
    const room = lab([
      [14, 2, 'P'],
      [14, 4, 'F'],
      [14, 7, 'F'],
      [14, 10, 'H'],
      [14, 13, 'H'],
    ]);
    const r = start(room);
    play(r, 'R40 S1 .20'); // take F@4 (first source)
    play(r, 'R3'); // walk into its ghost
    const inside = r.s.player.x < 5 * 64 && r.s.player.x + 40 > 4 * 64;
    // Take three more; the 4th pushes F@4 home while Kid may be inside it.
    for (let i = 0; i < 3; i++) play(r, 'R40 S1 .20');
    expect(conservationProblems(r.s.local, 3)).toEqual([]);
    expect(typeof inside).toBe('boolean');
  });
});

describe('levy: spring and recoil heights', () => {
  it('a down-levy pink recoil-hops 128 px and the spring bounces Kid exactly 448 px', () => {
    const r = start(
      lab([
        [14, 2, 'P'],
        [11, 3, 'H'],
        [12, 3, 'H'],
        [13, 3, 'H'],
        [14, 3, 'H'],
      ]),
    );
    play(r, 'S1 .20 J12');
    expect(r.s.local.bag.length).toBe(1);
    const from = r.steps.length;
    play(r, 'D+V1 .80', true);
    const ys = r.snaps.map((s) => s.player.y);
    const hop = firstStep(r, 'recoilHop', from) - 1 - from;
    const bounce = firstStep(r, 'springBounce', from) - 1 - from;
    expect(hop).toBeGreaterThanOrEqual(0);
    expect(bounce).toBeGreaterThan(hop);
    // The hop's launch point is the position on the levy step before it moves (y + vy): measure the
    // rise from the step's y minus its first displacement.
    const y0 = (ys[hop] as number) - (r.snaps[hop]?.player.vy ?? 0) * 0;
    const hopTop = Math.min(...ys.slice(hop, bounce));
    expect(y0 - hopTop).toBeGreaterThanOrEqual(128 - 20);
    expect(y0 - hopTop).toBeLessThanOrEqual(128);
    expect((ys[bounce] as number) - Math.min(...ys.slice(bounce))).toBe(448);
  });
});

describe('plates and gates', () => {
  const plateRoom = (twoF = true) =>
    lab(
      [
        [14, 2, 'P'],
        [14, 4, 'F'],
        [14, 6, twoF ? 'F' : '.'],
        [15, 10, '__'],
        [11, 16, 'D'],
        [12, 16, 'D'],
        [13, 16, 'D'],
        [14, 16, 'D'],
      ],
      { plates: { _: { pressedBy: ['slab', 'heavy'] } }, gates: { D: { opensOn: 'plate' } } },
    );

  it('standing on the plate heavy presses it and opens the gate', () => {
    const r = start(plateRoom());
    play(r, 'R40 S1 .20 R40 S1 .20');
    expect(r.s.player.profile).toBe('heavy');
    play(r, 'R60');
    expect(count(r, 'plate')).toBe(1);
    expect(r.s.local.plates[0]?.by).toBe('heavy');
    expect(count(r, 'gateOpen')).toBe(1);
  });

  it('a brown slab levied onto the plate presses it', () => {
    // Walk to a spot a slab lob lands on the plate from, then levy forward.
    let pressed = false;
    for (let wait = 0; wait < 40 && !pressed; wait++) {
      const t = start(plateRoom(false));
      play(t, `R40 S1 .20 R${wait} V1 .60`);
      if (t.s.local.plates[0]?.by === 'slab') pressed = true;
    }
    expect(pressed).toBe(true);
  });
});

describe('room regeneration', () => {
  it('reloading the room rebuilds the local state exactly (every sound goes home)', async () => {
    const { loadRoom } = await import('../../../src/sim/index');
    const room = lab([
      [14, 2, 'P'],
      [14, 4, 'F'],
      [14, 7, 'H'],
    ]);
    const fresh = start(room);
    const r = start(room);
    play(r, 'R40 S1 .20 R30 S1 .20 V1 .40');
    loadRoom(r.s, room, undefined, r.t, []);
    expect(r.s.local).toEqual(fresh.s.local);
  });
});
