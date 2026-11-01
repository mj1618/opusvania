/**
 * The Canopy, round 8 (review r7, docs/design/levels/reviews/canopy-r7.md):
 *  - #2: an ambush arrives, it does not appear on her. Entering each trigger from every side she can come from, the
 *    gates shut on the flag's step, the creatures show 30-45 frames later at least 400 px from her, and standing
 *    still she takes no hit for 60 frames.
 *  - #4: a moon patch she runs through is her re-form point (no rest): over the hollow's save without a stop, a fade in
 *    the ambush re-forms her there, not two legs down.
 *  - #1: the first fling (the hatch): no jump crosses the gap; a running jump finds the lamp, and a fling right lands
 *    her on the droop's limb. The gap's chain: a down-left fling off the first lamp brings the second into reach.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { gateShut } from '../../src/sim/kit';
import { flingTarget } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const C = ['wallJump'] as never;

function at(room: string, x: number, y: number): { s: GameState; scene: ReturnType<typeof getRoom> } {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], C, newSave(C));
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  return { s, scene };
}

function run(
  s: GameState,
  scene: ReturnType<typeof getRoom>,
  mask: number,
  n: number,
  out: SimEvent[],
): void {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, mask, t, withShortcuts(scene, s.save), e, W);
    for (const q of e) out.push({ ...q, frame: s.frame } as SimEvent);
  }
}

const frameOf = (e: SimEvent) => (e as unknown as { frame: number }).frame;

/** [room, trigger flag, where she comes in (feet), the input she comes in with]. */
const ENTRIES: Array<[string, string, number, number, number]> = [
  // The well's hollow: up the stair and west (r9: the block is gone), from the hollow's west, and landing in its middle.
  ['cn-well', 'cn-well-ambush', 1800, 1152, ActionBit.left],
  ['cn-well', 'cn-well-ambush', 940, 1152, ActionBit.right],
  ['cn-well', 'cn-well-ambush', 1290, 1100, 0],
  // The Grove: the drop west of the Grovemother, at both sides of it and onto the root step.
  ['cn-grove', 'cn-grove-wave', 1520, 1060, 0],
  ['cn-grove', 'cn-grove-wave', 1980, 1060, 0],
  ['cn-grove', 'cn-grove-wave', 1880, 1060, 0],
  // The tunnel's den warning (r8, #7): landing off the glide on the east floor, and standing at its far end.
  ['cn-tunnel', 'cn-tunnel-wave', 7200, 1700, ActionBit.right],
  ['cn-tunnel', 'cn-tunnel-wave', 7580, 1856, 0],
];

describe('ambushes arrive (review r7 #2)', () => {
  for (const [room, flag, x, y, mask] of ENTRIES)
    it(`${room} from (${x}, ${y}): gates first, creatures 30-45 frames later from 400+ px, 60 frames unhit`, () => {
      const { s, scene } = at(room, x, y);
      const ev: SimEvent[] = [];
      let k = 0;
      while (!s.save.flags.includes(flag) && k++ < 240) run(s, scene, mask, 1, ev);
      expect(s.save.flags).toContain(flag);
      const f0 = s.frame;
      const hp0 = s.player.hp;
      const cx = s.player.x + s.player.w / 2;
      const cy = s.player.y + s.player.h / 2;
      // Gates on this flag shut on the flag's own step.
      for (const g of (scene.gates ?? []).filter((q) => q.shut === flag)) {
        expect(gateShut(g as never, s.save.flags)).toBe(true);
        expect(ev.some((e) => e.type === 'gateShut' && e.id === g.id)).toBe(true);
      }
      // Standing still from here.
      const after: SimEvent[] = [];
      run(s, scene, 0, 60, after);
      const arrive = after.filter((e) => e.type === 'enemyArrive');
      expect(arrive.length).toBeGreaterThan(0);
      for (const e of arrive) {
        if (e.type !== 'enemyArrive') continue;
        const d = frameOf(e) - f0;
        expect(d).toBeGreaterThanOrEqual(30);
        expect(d).toBeLessThanOrEqual(45);
        expect(Math.hypot(e.fromX - cx, e.fromY - cy)).toBeGreaterThanOrEqual(400);
      }
      expect(after.some((e) => e.type === 'hurt')).toBe(false);
      expect(s.player.hp).toBe(hp0);
      // (Nothing of the wave was there before it arrived.)
      expect(after.some((e) => e.type === 'enemyRespawn')).toBe(false);
    });
});

describe('a patch she runs through is not her save, she rests at it (r20); a fade re-forms her at the nearest (r21)', () => {
  it('over the hollow save without a stop, a fade in the ambush re-forms her at the hollow, the nearest patch', () => {
    const { s, scene } = at('cn-well', 2120, 1152);
    // She rested at the landing's save, two legs down.
    s.save.patch = { room: 'cn-well', id: 'p-landing' };
    const landing = (scene.patches ?? []).find((q) => q.id === 'p-landing');
    expect(landing).toBeDefined();
    const ev: SimEvent[] = [];
    // Run west over the stair's root and p-hollow (r9: 1,472), into the ambush, never stopping.
    let k = 0;
    while (s.player.x + s.player.w / 2 > 1390 && k++ < 200) run(s, scene, ActionBit.left, 1, ev);
    expect(ev.some((e) => e.type === 'patchMark' && e.id === 'p-hollow')).toBe(false);
    expect(ev.some((e) => e.type === 'patchRest')).toBe(false);
    expect(s.save.patch).toEqual({ room: 'cn-well', id: 'p-landing' });
    s.player.hp = 1;
    // Into the ambush, and stand there until she fades.
    k = 0;
    while (!s.save.flags.includes('cn-well-ambush') && k++ < 300)
      run(s, scene, (k & 15) < 12 ? ActionBit.left : ActionBit.left | ActionBit.jump, 1, ev);
    const fade: SimEvent[] = [];
    k = 0;
    while (s.player.faded === 0 && k++ < 1500) run(s, scene, 0, 1, fade);
    expect(s.player.faded).toBeGreaterThan(0);
    k = 0;
    while (s.player.faded > 0 && k++ < 600) run(s, scene, 0, 1, fade);
    expect(s.room).toBe('cn-well');
    // (r21, Matt: "go back to a near checkpoint": the hollow's patch, not the landing two legs down.)
    const hollow = (scene.patches ?? []).find((q) => q.id === 'p-hollow');
    expect(Math.abs(s.player.x + s.player.w / 2 - (hollow?.x ?? 0))).toBeLessThan(100);
    expect(Math.abs(s.player.y + s.player.h - (hollow?.y ?? 0))).toBeLessThan(8);
    expect(s.save.patch).toEqual({ room: 'cn-well', id: 'p-landing' });
    expect(s.player.hp).toBe(s.player.hpMax);
    // The ambush plays again: its flag was taken back.
    expect(s.save.flags).not.toContain('cn-well-ambush');
  });

  it('a rest at the hollow (standing still in it) makes it her re-form point, whole', () => {
    const { s, scene } = at('cn-well', 1472, 1152);
    s.save.patch = { room: 'cn-well', id: 'p-landing' };
    s.player.hp = 1;
    const ev: SimEvent[] = [];
    run(s, scene, 0, 60, ev);
    expect(ev.some((e) => e.type === 'patchRest' && e.id === 'p-hollow')).toBe(true);
    expect(s.save.patch).toEqual({ room: 'cn-well', id: 'p-hollow' });
    expect(s.player.hp).toBe(s.player.hpMax);
  });
});

describe('the first fling (review r7 #1)', () => {
  const lamp = (scene: ReturnType<typeof getRoom>, id: string) =>
    (scene.lures ?? []).findIndex((l) => l.id === id);

  it('the hatch: a running jump off the crown limb finds the lamp, and a fling right lands on the far limb', () => {
    const { s, scene } = at('cn-hatch', 3440, 892);
    s.hatch = null as never;
    const ev: SimEvent[] = [];
    let k = 0;
    let jumped = -1;
    while (flingTarget(s, scene, t) < 0 && k++ < 120) {
      const fx = s.player.x + s.player.w / 2;
      if (jumped < 0 && s.player.grounded && fx >= 3500) jumped = k;
      run(s, scene, ActionBit.right | (jumped >= 0 && k - jumped < 18 ? ActionBit.jump : 0), 1, ev);
    }
    expect(flingTarget(s, scene, t)).toBe(lamp(scene, 'wick-first'));
    // The fling: Lamp pressed with right held, let go a few frames later.
    for (let i = 0; i < 4; i++) run(s, scene, ActionBit.right | ActionBit.lamp, 1, ev);
    k = 0;
    do run(s, scene, ActionBit.right, 1, ev);
    while (!s.player.grounded && k++ < 240);
    const fx = s.player.x + s.player.w / 2;
    expect(fx).toBeGreaterThan(4272);
    expect(ev.some((e) => e.type === 'fallCatch')).toBe(false);
    // Flung once, the flag the camera's notice waits for is set.
    run(s, scene, 0, 2, ev);
    expect(s.save.flags).toContain('cn-first-fling');
  });

  it('the hatch: the first lamp put out (a cut) burns again: the required lesson never softlocks', () => {
    const { s, scene } = at('cn-hatch', 3440, 892);
    const i = lamp(scene, 'wick-first');
    s.lures.hp[i] = 0;
    s.lures.out[i] = s.frame + 1;
    const ev: SimEvent[] = [];
    run(s, scene, 0, 120, ev);
    expect(s.lures.hp[i]).toBeGreaterThan(0);
    expect(s.save.snuffed).not.toContain('cn-hatch:wick-first');
  });

  it('the gap: a down-left fling off the first lamp brings the second into reach', () => {
    const { s, scene } = at('cn-gap', 3560, 1344);
    const ev: SimEvent[] = [];
    let k = 0;
    while (flingTarget(s, scene, t) !== lamp(scene, 'wick-gap-1') && k++ < 120)
      run(s, scene, ActionBit.left, 1, ev);
    expect(flingTarget(s, scene, t)).toBe(lamp(scene, 'wick-gap-1'));
    const DL = ActionBit.down | ActionBit.left;
    for (let i = 0; i < 4; i++) run(s, scene, DL | ActionBit.lamp, 1, ev);
    // (Let go with the aim held: the launch goes exactly that way.)
    run(s, scene, DL, 1, ev);
    let reach = -1;
    for (k = 0; k < 80 && reach < 0; k++) {
      run(s, scene, ActionBit.left, 1, ev);
      const i = flingTarget(s, scene, t);
      if (i === lamp(scene, 'wick-gap-2')) reach = i;
    }
    expect(reach).toBe(lamp(scene, 'wick-gap-2'));
  });
});
