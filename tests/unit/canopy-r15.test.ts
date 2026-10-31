/**
 * The Canopy, round 15 (review canopy-r14.md; memory/canopy.md v15):
 *  - The escape felt (#1): low and east through the breach, then the clifftop's chimney under the rising earth (two
 *    blocks, one `sets`), the front on her heels and held to her wall clings, no light lost, the plug shaken down.
 *  - The fair wave (#2): `keeperWave` tells the rear, its fronts start `waveDelay` frames after the slam; in P3 no
 *    rotation slam close to her at the cage.
 *  - The rage beat's bridge (#6): `boss.bridge` 1 -> 2 -> 0 over the first fast ram.
 *  - The chase's hold (#5): put back at a hook she hangs there until she presses.
 *  - The sit acted (#3): `kinBeat`s in order to `stay`; walked off early it stays.
 *  - Quiet moments (#10): `kit.quiet` column / sit / vista.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import { KIN_PHASES } from '../../src/sim/quiet';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { ESCAPE_FLAGS, runEscape } from '../../tools/levels/escape-probe';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const CG = ['wallJump', 'glide'];

function at(room: string, x: number, y: number, kit: string[] = CG, flags: string[] = []): GameState {
  const scene = getRoom(room);
  const save = newSave(kit as never);
  save.flags.push(...flags);
  const s = createState(1, t, scene, [], kit as never, save);
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
  return s;
}
function run(s: GameState, input: number, n = 1, ev: SimEvent[] = []): SimEvent[] {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, input, t, withShortcuts(getRoom(s.room), s.save), e, W);
    ev.push(...e);
  }
  return ev;
}
const { jump: J, right: R, left: L, up: U, down: D, lamp: B } = ActionBit;
type Of<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
const den = getRoom('cn-den');
const out = getRoom('cn-out');
const burr = (s: GameState) => s.enemies.find((e) => e.id === 'old-burr') as GameState['enemies'][number];

describe('the escape felt (r15, review r14 #1)', () => {
  it("a person's plan gets out of the den and up the clifftop's chimney: running and careful; no hits", () => {
    const runs = [
      runEscape({}),
      runEscape({ careful: true, lag: 15 }),
      runEscape({ careful: true, lag: 15, delay: 10 }),
      runEscape({ careful: true, lag: 15, delay: 16 }),
    ];
    for (const r of runs) {
      expect(r.pass).toBe(true);
      expect(r.hits).toEqual([]);
      // (The den's floor run, then the way out: longer than r14's 9-12 s.)
      expect(r.den).toBeGreaterThan(3 * 60);
      expect(r.frames).toBeGreaterThan(10 * 60);
      expect(r.frames).toBeLessThan(25 * 60);
      // (The earth on her heels where she stands or holds a wall, never on her.)
      expect(r.gapMin).toBeGreaterThanOrEqual(120);
    }
    // (A careful player waits on the grit: longer.)
    expect(runs[2]?.frames ?? 0).toBeGreaterThan((runs[0]?.frames ?? 0) + 4 * 60);
  });

  it('two blocks, one `sets`: the den runs on into the way out; the breach opens with the collapse; the zones at 1.0', () => {
    expect(den.escape?.next).toBe('cn-out');
    expect(den.escape?.end).toBeUndefined();
    expect(out.escape?.sets).toBe(den.escape?.sets);
    expect(out.escape?.breaks).toContain('out-plug');
    const breach = (den.gates ?? []).find((g) => g.id === 'den-breach');
    expect(breach?.flag).toBe('cn-den-collapse');
    const z = (den.camera?.zones ?? []).find((q) => q.id === 'escape');
    expect(z?.zoom).toBe(1);
    const zo = (out.camera?.zones ?? [])[0];
    expect(zo?.id).toBe('escape');
    expect(zo?.zoom).toBe(1);
    expect(zo?.below).toBeGreaterThan(0);
  });

  it('in the way out the plug comes down as it begins, and the front waits for her at the chimney foot', () => {
    const s = at('cn-out', 300, 1344, CG, ESCAPE_FLAGS);
    const ev = run(s, 0, 4);
    expect(ev.some((q) => q.type === 'escapeStart' && q.id === 'out-escape')).toBe(true);
    expect(ev.some((q) => q.type === 'barkBreak' && q.id === 'out-plug' && q.by === 'escape')).toBe(true);
    expect(s.save.opened).toContain('cn-out:out-plug');
    // In the pocket: no front.
    run(s, 0, 120);
    expect(s.kit.escape.frontOn).toBe(0);
    expect(s.kit.escape.go).toBe(0);
  });

  it('the front climbs with her up a wall; a slide into it costs no light and puts her back on the checkpoint', () => {
    const s = at('cn-out', 1088, 1856, CG, ESCAPE_FLAGS);
    run(s, 0, 4);
    expect(s.kit.escape.go).toBe(1);
    // (The grit over rest E as she stands at the foot: it lands first.)
    const ev0 = run(s, 0, 120);
    expect(ev0.some((q) => q.type === 'rockfall' && q.id === 'rock-o2' && q.phase === 'land')).toBe(true);
    // Put on rest E (its checkpoint), then the front rises under her stand.
    placePlayer(s, 1408, 1344, t, withShortcuts(out, s.save), []);
    const ev = run(s, 0, 90);
    expect(ev.some((q) => q.type === 'escapeCheckpoint' && q.cp === 2)).toBe(true);
    expect(s.kit.escape.frontOn).toBe(1);
    const gap = s.kit.escape.front - 1344;
    expect(gap).toBeGreaterThanOrEqual(out.escape?.front?.near ?? 0);
    expect(gap).toBeLessThanOrEqual(out.escape?.front?.lag ?? 0);
    // Off rest E, down the chimney: the front has her; held, back on rest E, her lights as they were.
    const hp = s.player.hp;
    const ev2: SimEvent[] = [];
    for (let f = 0; f < 240 && !ev2.some((q) => q.type === 'fallReturn'); f++) run(s, L, 1, ev2);
    expect(ev2.some((q) => q.type === 'escapeHit' && q.what === 'front')).toBe(true);
    const back = ev2.find((q) => q.type === 'fallReturn') as Of<'fallReturn'>;
    expect(back?.id).toBe('escape:front');
    expect(back?.x).toBe(1408);
    expect(back?.y).toBe(1344);
    expect(s.player.hp).toBe(hp);
    expect(s.player.faded).toBe(0);
  });

  it('every rock is told; those ahead of her at least 40 frames', () => {
    for (const E of [den.escape, out.escape]) {
      expect(E?.rocks.every((r) => r.tell >= 8)).toBe(true);
      const ahead = (E?.rocks ?? []).filter((r) => r.tell > 16);
      expect(ahead.length).toBeGreaterThanOrEqual(2);
      for (const r of ahead) expect(r.tell).toBeGreaterThanOrEqual(40);
    }
  });

  it('escaped, the way out is quiet: no rocks, no front', () => {
    const s = at('cn-out', 300, 1344, CG, [...ESCAPE_FLAGS, 'cn-den-escaped']);
    const ev = run(s, R, 300);
    expect(
      ev.some((q) => q.type === 'rockfall' || q.type === 'escapeStart' || q.type === 'collapseFront'),
    ).toBe(false);
  });
});

// --- The Keeper.
function fight(x = 1000): GameState {
  const s = at('cn-den', x, 1344);
  run(s, 0, 100);
  return s;
}
function toP3(s: GameState): void {
  if (s.boss) s.boss.drops = t.keeper.p1Drops;
  burr(s).hp = t.keeper.p2Hp;
  run(s, 0, 200);
  if (s.boss) s.boss.phaseTime = t.keeper.p2MinFrames + 1;
  burr(s).hp = t.keeper.p3Hp;
  run(s, 0, 200);
}

describe('the fair wave (r15, review r14 #2)', () => {
  it('a slam with a wave is told as it rears (`keeperWave tell`, `boss.tell` slam) and its fronts start `waveDelay` after', () => {
    const s = fight();
    const ev: SimEvent[] = [];
    let tellAt = -1;
    let slamAt = -1;
    for (let f = 0; f < 5000 && slamAt < 0; f++) {
      s.player.invuln = 60;
      const e = run(s, 0, 1);
      ev.push(...e);
      if (tellAt < 0 && e.some((q) => q.type === 'keeperWave' && q.phase === 'tell')) {
        tellAt = f;
        expect(s.boss?.tell).toBe('slam');
        expect(s.boss?.tellX1 ?? 0).toBeGreaterThan(s.boss?.tellX0 ?? 0);
      }
      if (e.some((q) => q.type === 'keeperWave' && q.phase === 'slam')) slamAt = f;
    }
    expect(tellAt).toBeGreaterThanOrEqual(0);
    expect(slamAt).toBeGreaterThan(tellAt);
    const slam = ev.find((q) => q.type === 'keeperWave' && q.phase === 'slam') as Of<'keeperWave'>;
    expect(slam.frames).toBe(t.keeper.waveDelay);
    // The crack first: no front for `waveDelay` frames, then it runs.
    expect(burr(s).wave).toBe(0);
    expect(burr(s).waveWait).toBe(t.keeper.waveDelay);
    run(s, 0, t.keeper.waveDelay - 1);
    expect(burr(s).wave).toBe(0);
    run(s, 0, 2);
    expect(burr(s).wave).toBeGreaterThan(0);
  });

  it('in P3 it never rears for its rotation slam close to her while she is at the fallen cage', () => {
    const s = fight();
    toP3(s);
    expect(s.boss?.phase).toBe(3);
    const e = burr(s);
    const cx = s.boss?.cageX ?? 0;
    placePlayer(s, cx, 1344, t, withShortcuts(den, s.save), []);
    e.x = Math.round(cx + 220 - e.w / 2);
    e.mode = 'walk';
    e.vx = 0;
    e.knockVx = 0;
    e.stunned = false;
    e.strikeCd = 0;
    e.rams = e.slams + t.oldBurrback.slamEveryRams;
    s.player.invuln = 60;
    run(s, 0, 1);
    expect(burr(s).mode).not.toBe('rear');
  });
});

describe("the rage beat's bridge (r15, review r14 #6)", () => {
  it('`boss.bridge` is 1 from the beat, 2 while its first fast ram runs, 0 after', () => {
    const s = fight(1000);
    const seen: number[] = [];
    for (let f = 0; f < 6000; f++) {
      s.player.invuln = 60;
      run(s, 0, 1);
      const b = s.boss?.bridge ?? 0;
      if (seen.at(-1) !== b) seen.push(b);
      if (seen.length >= 4) break;
    }
    expect(seen.slice(0, 4)).toEqual([0, 1, 2, 0]);
  });
});

// --- The chase.
const gap = getRoom('cn-gap');
const ix = (id: string) => (gap.lures ?? []).findIndex((l) => l.id === id);
function flingOn(s: GameState, aim: number, next: string, ev: SimEvent[], beat = 0): boolean {
  for (let i = 0; i < 4; i++) run(s, aim | B, 1, ev);
  run(s, aim, 1, ev);
  for (let k = 0; k < 160; k++) {
    if (next && flingTarget(s, withShortcuts(gap, s.save), t) === ix(next)) {
      run(s, aim & (L | R), beat, ev);
      return true;
    }
    run(s, aim & (L | R), 1, ev);
    if (s.player.grounded && k > 4) return next === '';
  }
  return false;
}
function chaseStart(): { s: GameState; ev: SimEvent[] } {
  const s = at('cn-gap', 4300, 1344);
  const ev: SimEvent[] = [];
  run(s, L, 40, ev);
  run(s, 0, 40, ev);
  for (let k = 0; k < 120 && Math.abs(s.player.x + s.player.w / 2 - 4150) > 12; k++)
    run(s, s.player.x + s.player.w / 2 < 4150 ? R : L, 1, ev);
  let n = 0;
  while (flingTarget(s, withShortcuts(gap, s.save), t) !== ix('hook-1') && n++ < 40) run(s, J, 1, ev);
  return { s, ev };
}
const LINE: Array<[number, string]> = [
  [U, 'hook-2'],
  [U, 'hook-3'],
  [L, 'hook-4'],
  [D | L, 'hook-5'],
  [D | R, 'hook-6'],
  [D | L, 'hook-7'],
  [L, ''],
];

describe('the chase breathes (r15, review r14 #5)', () => {
  it("pressed a person's 12 or 18 frames after each hook is in reach, the S holds to the nest; every hook eases her", () => {
    for (const beat of [0, 12, 18]) {
      const { s, ev } = chaseStart();
      for (const [aim, next] of LINE) expect(flingOn(s, aim, next, ev, beat)).toBe(true);
      run(s, 0, 30, ev);
      expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'nest')).toBe(true);
      expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'back')).toBe(false);
    }
  });

  it('at a rest (hook-3) she hangs at the hook until she presses', () => {
    const { s, ev } = chaseStart();
    expect(gap.fireflies?.[0]?.chase?.rests).toContain('hook-3');
    expect(flingOn(s, U, 'hook-2', ev)).toBe(true);
    expect(flingOn(s, U, 'hook-3', ev)).toBe(true);
    // Two seconds without a press: she has drifted onto the hook and hangs there, in its reach.
    run(s, 0, 120, ev);
    const h = gap.lures?.[ix('hook-3')];
    const d = Math.hypot(
      (h?.x ?? 0) - (s.player.x + s.player.w / 2),
      (h?.y ?? 0) - (s.player.y + s.player.h / 2),
    );
    expect(d).toBeLessThan(50);
    expect(flingTarget(s, withShortcuts(gap, s.save), t)).toBe(ix('hook-3'));
    expect(s.player.catchK).toBeGreaterThan(0.9);
  });

  it('put back at a hook after a fall, she hangs there (not drifts off) until she presses', () => {
    const { s, ev } = chaseStart();
    for (const [aim, next] of LINE.slice(0, 4)) expect(flingOn(s, aim, next, ev)).toBe(true);
    flingOn(s, D | L, '', ev);
    const ev2: SimEvent[] = [];
    for (let f = 0; f < 160 && !ev2.some((q) => q.type === 'fallReturn'); f++) run(s, 0, 1, ev2);
    expect(ev2.some((q) => q.type === 'fireflyChase' && q.phase === 'back')).toBe(true);
    const y0 = s.player.y;
    run(s, 0, t.kit.firefly.backHold - 10);
    expect(Math.abs(s.player.y - y0)).toBeLessThan(40);
    expect(flingTarget(s, withShortcuts(gap, s.save), t)).toBe(ix('hook-5'));
  });
});

// --- The sit and the quiet moments.
const crown = getRoom('cn-crown');
describe('the sit acted (r15, review r14 #3) and the quiet moments (#10)', () => {
  const sit = crown.sits?.[0];
  it('standing by the kin: `kinSit`, then its beats in order to `stay`; quiet while they play', () => {
    const s = at('cn-crown', sit?.x ?? 0, sit?.y ?? 0, CG, sit?.when ? [sit.when] : []);
    const ev = run(s, 0, (sit?.frames ?? 0) + 900);
    expect(ev.some((q) => q.type === 'kinSit')).toBe(true);
    const beats = ev.filter((q) => q.type === 'kinBeat').map((q) => (q as Of<'kinBeat'>).phase);
    expect(beats).toEqual([...KIN_PHASES]);
    const answer = ev.find((q) => q.type === 'kinBeat' && q.phase === 'answer') as Of<'kinBeat'>;
    expect(answer.her).toBe(1);
    const quiet = ev
      .filter((q) => q.type === 'quietMoment' && q.why === 'sit')
      .map((q) => (q as Of<'quietMoment'>).on);
    expect(quiet).toEqual([1, 0]);
    expect(s.kit.kinSit.phase).toBe('stay');
    expect(s.kit.quiet.why).toBe('');
  });

  it('walked off before the lean, it stays at once', () => {
    const s = at('cn-crown', sit?.x ?? 0, sit?.y ?? 0, CG, sit?.when ? [sit.when] : []);
    run(s, 0, (sit?.frames ?? 0) + 100);
    expect(s.kit.kinSit.phase).not.toBe('');
    const ev = run(s, L, 120);
    expect(ev.some((q) => q.type === 'kinBeat' && q.phase === 'stay')).toBe(true);
  });

  it('the column is quiet until the roof gives; the clifftop vista is quiet', () => {
    // (The great release: the boss at its end, the collapse's count from the cage's snuff.)
    const s = fight();
    if (s.boss) {
      s.boss.stage = 'end';
      s.boss.collapse = 0;
    }
    s.player.invuln = 600;
    const ev = run(s, 0, t.keeper.collapseRubble + 20);
    const col = ev
      .filter((q) => q.type === 'quietMoment' && q.why === 'column')
      .map((q) => (q as Of<'quietMoment'>).on);
    expect(col).toEqual([1, 0]);
    const s2 = at('cn-out', 1300, 384, CG, [...ESCAPE_FLAGS, 'cn-den-escaped']);
    const ev2 = run(s2, 0, 30);
    expect(ev2.some((q) => q.type === 'quietMoment' && q.why === 'vista' && q.on === 1)).toBe(true);
  });
});
