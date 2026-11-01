/**
 * The Canopy r19 (review r18 #2, #4; first-timers ft18a-c): the chase's hand-held diagonal reaches the nest, a fall
 * from hook-6 puts her back at hook-6, the glints she carries cross a door, and no room's view passes its top.
 */
import { describe, expect, it } from 'vitest';
import { getRoom, ROOMS } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { enterRoom, withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const CG = ['wallJump', 'glide'];
const { jump: J, right: R, left: L, up: U, down: D, lamp: B } = ActionBit;
type Of<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
const gap = getRoom('cn-gap');
const ix = (id: string) => (gap.lures ?? []).findIndex((l) => l.id === id);

function at(room: string, x: number, y: number): GameState {
  const scene = getRoom(room);
  const save = newSave(CG as never);
  const s = createState(1, t, scene, [], CG as never, save);
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
/** Press the Lamp with `aim`, then hold all of `aim` (a hand's diagonal) until `next` is in reach, `beat` more. */
function flingHeld(s: GameState, aim: number, next: string, ev: SimEvent[], beat = 0): boolean {
  for (let i = 0; i < 4; i++) run(s, aim | B, 1, ev);
  run(s, aim, 1, ev);
  for (let k = 0; k < 160; k++) {
    if (next && flingTarget(s, withShortcuts(gap, s.save), t) === ix(next)) {
      run(s, aim, beat, ev);
      return true;
    }
    run(s, aim, 1, ev);
    if (s.player.grounded && k > 4) return next === '';
  }
  return false;
}
const LINE: Array<[number, string]> = [
  [U, 'hook-2'],
  [U, 'hook-3'],
  [L, 'hook-4'],
  [D | L, 'hook-5'],
  [D | R, 'hook-6'],
  [D | L, 'hook-7'],
];

describe('the chase held as a hand holds it (r19, review r18 #4)', () => {
  it('down-left held from hook-6 through hook-7 (left, down-left or up-left at the press) reaches the nest', () => {
    for (const last of [L, D | L, U | L])
      for (const beat of [0, 12, 20]) {
        const { s, ev } = chaseStart();
        for (const [aim, next] of LINE) expect(flingHeld(s, aim, next, ev, beat)).toBe(true);
        flingHeld(s, last, '', ev);
        run(s, 0, 60, ev);
        expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'nest')).toBe(true);
        expect(ev.some((q) => q.type === 'fallReturn')).toBe(false);
      }
  });

  it('a fall after hook-6 (down onto the shelf, or past hook-7 into the gap) puts her back at hook-6', () => {
    for (const drop of [D, D | L]) {
      const { s, ev } = chaseStart();
      for (const [aim, next] of LINE.slice(0, 5)) expect(flingHeld(s, aim, next, ev)).toBe(true);
      for (let i = 0; i < 4; i++) run(s, drop | B, 1, ev);
      const ev2: SimEvent[] = [];
      for (let f = 0; f < 400 && !ev2.some((q) => q.type === 'fallReturn'); f++) run(s, drop, 1, ev2);
      const back = ev2.find((q) => q.type === 'fallReturn') as Of<'fallReturn'> | undefined;
      const h6 = gap.lures?.[ix('hook-6')];
      expect(back?.x).toBe(h6?.x);
      expect(flingTarget(s, withShortcuts(gap, s.save), t)).toBe(ix('hook-6'));
    }
  });
});

describe('what she carries and what the view shows (r19)', () => {
  it('the glints she carries cross a door (every r18 first-timer saw the count drop to 0)', () => {
    const s = at('cn-well', 1720, 2432);
    s.pickups.count = 5;
    enterRoom(s, t, W, 'cn-limbs', { kind: 'point', x: 200, y: 768 }, 'cn-well', []);
    expect(s.room).toBe('cn-limbs');
    expect(s.pickups.count).toBe(5);
  });

  it("no Canopy room's view goes past its top (the chase's hook-3, the Grove's door: a ruler line and sky)", () => {
    for (const r of Object.values(ROOMS)) {
      if (!r.id.startsWith('cn-') || r.id === 'cn-hatch') continue;
      expect((r as { camera?: { headroom?: number } }).camera?.headroom, r.id).toBe(0);
    }
  });
});
