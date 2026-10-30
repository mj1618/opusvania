/**
 * The Canopy, round 9 (review r8, docs/design/levels/reviews/canopy-r8.md):
 *  - #1 / #8: the well's hollow. Up the stair, the door to the limbs is in frame (16:9 and 21:9: the `door-notice`
 *    zone); the ambush floor is fitted until the wave is cleared; its lampwing's post is off her column.
 *  - #4: the den's warning is a two-beat arena: the lid holds, the fit zone frames it, beat 1 arrives from 400+ px, and
 *    beat 2 (up out of the den's mouth) the same once beat 1 is down; the lid opens on the clear.
 *  - #5: glints in the Canopy at most 25.
 *  - #7: the gap's chain is three lamps: of down, down-left and left off the second, at least two bring the third into
 *    reach, and none lands on the thorns without a lamp in reach on the way.
 *  - #9: the kin's lamp is a map station by the save: a rest shows the map and hangs the stones she has read, one
 *    more each return.
 */
import { describe, expect, it } from 'vitest';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
import { zoneAt } from '../../src/render/camera/zones';
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
const CG = ['wallJump', 'glide'] as never;

function at(
  room: string,
  x: number,
  y: number,
  kit = CG,
): { s: GameState; scene: ReturnType<typeof getRoom> } {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], kit, newSave(kit));
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
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
const lampIx = (scene: ReturnType<typeof getRoom>, id: string) =>
  (scene.lures ?? []).findIndex((l) => l.id === id);

/** The settled view (world rect) on her where she stands, at a window of vw x vh. */
function view(s: GameState, scene: ReturnType<typeof getRoom>, vw: number, vh: number) {
  const ct = cameraFor(scene);
  const cam = createCamera(s, scene, ct, vw, vh);
  for (let k = 0; k < 120; k++) {
    run(s, scene, 0, 1, []);
    stepCamera(cam, s, scene, ct);
  }
  const v = lerpCamera(cam, cam, 1);
  return { x0: v.x - v.w / 2, y0: v.y - v.h / 2, x1: v.x + v.w / 2, y1: v.y + v.h / 2 };
}

describe("the well's hollow (review r8 #1 / #8)", () => {
  for (const [vw, vh] of [
    [1920, 1080],
    [2560, 1080],
    [1920, 1200],
  ] as const)
    it(`up the stair, the door to the limbs is in frame at ${vw}x${vh}`, () => {
      const { s, scene } = at('cn-well', 1720, 1152);
      const v = view(s, scene, vw, vh);
      const door = (scene.exits ?? []).find((e) => e.id === 'limbs');
      expect(door).toBeDefined();
      // The opening (x 2,304-2,560 at its floor's height) is inside the view, and so is she.
      expect(v.x0).toBeLessThanOrEqual(2304);
      expect(v.x1).toBeGreaterThanOrEqual(2496);
      expect(v.y0).toBeLessThanOrEqual(door?.from ?? 0);
      expect(v.y1).toBeGreaterThanOrEqual(1152);
    });

  it('the ambush floor is fitted until the wave is cleared', () => {
    const scene = getRoom('cn-well');
    const zones = scene.camera?.zones ?? [];
    expect(zoneAt(zones, 1200, 1100, [])?.id).toBe('ambush');
    expect(zoneAt(zones, 1200, 1100, ['cn-well-clear'])).toBeNull();
  });

  it("the ambush's lampwing waits off her column (by the lamp), not over where she walks in", () => {
    const scene = getRoom('cn-well');
    const wing = (scene.enemies ?? []).find((e) => e.id === 'wing-am');
    const trig = (scene.triggers ?? []).find((q) => q.id === 'ambush');
    expect(wing && trig).toBeTruthy();
    if (!wing || !trig) return;
    expect(wing.x).toBeGreaterThan(trig.x + trig.w);
  });

  it('the moon shard on the west shelf is the fight side’s: a fling off the hollow lamp, from the ambush floor', () => {
    const { s, scene } = at('cn-well', 1300, 1152, ['wallJump'] as never);
    const ev: SimEvent[] = [];
    // A jump under the lamp finds it (in the ambush's trigger: the fight is on).
    let k = 0;
    while (flingTarget(s, scene, t) !== lampIx(scene, 'wick-hollow') && k++ < 60)
      run(s, scene, ActionBit.jump, 1, ev);
    expect(flingTarget(s, scene, t)).toBe(lampIx(scene, 'wick-hollow'));
    expect(s.save.flags).toContain('cn-well-ambush');
    const UL = ActionBit.up | ActionBit.left;
    for (let i = 0; i < 4; i++) run(s, scene, UL | ActionBit.lamp, 1, ev);
    run(s, scene, UL, 1, ev);
    run(s, scene, ActionBit.left, 120, ev);
    expect(s.save.taken).toContain('cn-well:shard-well');
  });
});

describe("the den's warning is a two-beat arena (review r8 #4)", () => {
  it('landing off the glide: the lid holds, the fit zone frames it, beat 1 then beat 2 arrive from 400+ px', () => {
    const { s, scene } = at('cn-tunnel', 7200, 1700);
    const ev: SimEvent[] = [];
    let k = 0;
    while (!s.save.flags.includes('cn-tunnel-wave') && k++ < 240) run(s, scene, 0, 1, ev);
    expect(s.save.flags).toContain('cn-tunnel-wave');
    const lid = (scene.gates ?? []).find((g) => g.id === 'den-lid');
    expect(lid && gateShut(lid as never, s.save.flags)).toBe(true);
    const cx = s.player.x + s.player.w / 2;
    const cy = s.player.y + s.player.h / 2;
    expect(zoneAt(scene.camera?.zones ?? [], cx, cy, s.save.flags)?.id).toBe('warning');
    const beat1: SimEvent[] = [];
    run(s, scene, 0, 60, beat1);
    const a1 = beat1.filter((e) => e.type === 'enemyArrive');
    expect(a1.map((e) => (e as { id: string }).id).sort()).toEqual(['wing-warn-1', 'wing-warn-2']);
    for (const e of a1)
      if (e.type === 'enemyArrive') expect(Math.hypot(e.fromX - cx, e.fromY - cy)).toBeGreaterThan(400);
    // Beat 1 down (its flag): beat 2 comes up out of the den's mouth.
    s.save.flags.push('cn-tunnel-beat2');
    const f0 = s.frame;
    const beat2: SimEvent[] = [];
    run(s, scene, 0, 60, beat2);
    const a2 = beat2.filter((e) => e.type === 'enemyArrive');
    expect(a2.map((e) => (e as { id: string }).id).sort()).toEqual(['burr-warn', 'juv-warn', 'juv-warn-2']);
    for (const e of a2) {
      if (e.type !== 'enemyArrive') continue;
      expect(frameOf(e) - f0).toBeGreaterThanOrEqual(30);
      expect(Math.hypot(e.fromX - cx, e.fromY - cy)).toBeGreaterThanOrEqual(400);
    }
    expect(lid && gateShut(lid as never, s.save.flags)).toBe(true);
    s.save.flags.push('cn-tunnel-clear');
    expect(lid && gateShut(lid as never, s.save.flags)).toBe(false);
    expect(zoneAt(scene.camera?.zones ?? [], cx, cy, s.save.flags)).toBeNull();
  });
});

describe('glints buy nothing: at most 25 (review r8 #5)', () => {
  it('the Canopy holds 25 glints or fewer', () => {
    let n = 0;
    for (const id of Object.keys(W.rooms).filter((q) => q.startsWith('cn-')))
      n += (getRoom(id).pickups ?? []).filter((p) => (p as { kind?: string }).kind === 'glint').length;
    expect(n).toBeLessThanOrEqual(25);
  });
});

describe("the gap's chain is three lamps (review r8 #7)", () => {
  const AIMS: Array<[string, number]> = [
    ['down', ActionBit.down],
    ['down-left', ActionBit.down | ActionBit.left],
    ['left', ActionBit.left],
  ];
  it('of down, down-left and left off the second lamp, two bring the third into reach; none falls to the thorns unlamped', () => {
    let reached = 0;
    const bad: string[] = [];
    for (const [name, aim] of AIMS) {
      const { s, scene } = at('cn-gap', 3250, 1420, ['wallJump'] as never);
      const ev: SimEvent[] = [];
      let k = 0;
      while (flingTarget(s, scene, t) !== lampIx(scene, 'wick-gap-2') && k++ < 120) run(s, scene, 0, 1, ev);
      expect(flingTarget(s, scene, t)).toBe(lampIx(scene, 'wick-gap-2'));
      for (let i = 0; i < 4; i++) run(s, scene, aim | ActionBit.lamp, 1, ev);
      run(s, scene, aim, 1, ev);
      let third = false;
      const after: SimEvent[] = [];
      for (k = 0; k < 200 && !s.player.grounded; k++) {
        run(s, scene, aim & ActionBit.left, 1, after);
        if (flingTarget(s, scene, t) === lampIx(scene, 'wick-gap-3')) third = true;
        if (after.some((e) => e.type === 'thornHit')) break;
      }
      if (third) reached++;
      if (!third && after.some((e) => e.type === 'thornHit'))
        bad.push(`${name}: thorns with no lamp on the way`);
    }
    expect(bad).toEqual([]);
    expect(reached).toBeGreaterThanOrEqual(2);
  });
});

describe('the kin’s lamp is a map station (review r8 #9)', () => {
  it('beside the save; a rest shows the map and hangs the stones she has read, one more each return', () => {
    const scene = getRoom('cn-hub');
    const save = (scene.patches ?? []).find((p) => p.id === 'p-crossing');
    const lamp = (scene.marks?.landmarks ?? []).find((l) => l.id === 'kin-lamp');
    expect(save?.map).toBe(true);
    expect(save && lamp && Math.abs(save.x - lamp.x)).toBeLessThanOrEqual(300);
    const { s } = at('cn-hub', save?.x ?? 0, save?.y ?? 0);
    s.save.taken.push('cn-well:stone-west');
    const ev: SimEvent[] = [];
    run(s, scene, 0, 120, ev);
    expect(ev.some((e) => e.type === 'mapStation')).toBe(true);
    const hung = ev.filter((e) => e.type === 'stoneHung');
    expect(hung.map((e) => (e as { flag: string }).flag)).toEqual(['cn-stone-west']);
    expect(s.save.flags).toContain('cn-stone-west');
    // Back again with the heart's stone read: one more hangs (two in all); the first is not hung twice.
    run(s, scene, ActionBit.right, 20, []);
    s.save.taken.push('cn-hub:stone-heart');
    run(s, scene, ActionBit.left, 20, []);
    const again: SimEvent[] = [];
    run(s, scene, 0, 120, again);
    const hung2 = again.filter((e) => e.type === 'stoneHung');
    expect(hung2.map((e) => [(e as { flag: string }).flag, (e as { hung: number }).hung])).toEqual([
      ['cn-stone-heart', 2],
    ]);
  });
});
