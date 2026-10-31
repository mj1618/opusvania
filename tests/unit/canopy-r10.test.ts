/**
 * The Canopy, round 10 (review r9: the premise in play, the first lesson; docs/design/levels/first-area.md v10):
 *  - The first fling's lesson: near `wick-first` (until she has flung) her fall and her speed across ease to a drift,
 *    so every jump toward it from the lip is in reach for 20+ frames; a Lamp key held from the jump's start counts as
 *    a press when the flame comes into reach. No jump without the fling reaches the far limb.
 *  - The premise: three trap lamps on the route (the hub's, the Grove's west, the den's warning's) are cut out for
 *    good in three cuts from the floor under them (no fling off them), saved, their moths counted in `save.moths`;
 *    every other lamp she can fling off is a springboard that relights and is never saved (the well hollow's lamp, cut
 *    by a swing at the ambush's lampwing, once lost the shard for good).
 *  - The firefly's pass at the gap: landing below the chain starts it once; it relights the lamps she flung.
 *  - Roosts: the hub shows the moths of every trap lamp freed.
 *  - A gate never shuts on her: she is pushed clear.
 *  - Thorn returns inside a shut arena land at the far end of her floor, away from every bed.
 *  - The den's warning: 1,024 px of flat floor to the den's mouth; a fade there re-forms her on its floor (past the
 *    pit), at the mark patch.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { roostsLit } from '../../src/sim/firefly';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { gateShut } from '../../src/sim/kit';
import { createLures, flingTarget, snuffLure } from '../../src/sim/lures';
import { solidAt } from '../../src/sim/physics/aabb';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

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
const { jump: J, right: R, lamp: B, up: U, attack: A } = ActionBit;

describe('the first fling (r10, review r9 #1)', () => {
  const scene = getRoom('cn-hatch');
  const i = (scene.lures ?? []).findIndex((l) => l.id === 'wick-first');
  // (S5, the lip: 3,424-3,520 at 896; S4 ends at 3,296 at 736.)
  const jumps: Array<[string, number, number, number]> = [
    ['stand at the lip, jump right', 3444, 896, -1],
    ['stand at its end, jump right', 3500, 896, -1],
    ['run along it, jump', 3444, 896, 3500],
    ['run off S4, jump', 3000, 736, 3200],
    ['run off S4 to its end, jump', 3000, 736, 3290],
  ];
  for (const [name, x, y, runTo] of jumps)
    it(`${name}: in reach 20+ frames, and Lamp held from the jump flings`, () => {
      for (const held of [false, true]) {
        const s = at('cn-hatch', x, y, []);
        run(s, 0, 20);
        let f = 0;
        while (runTo > 0 && s.player.x + s.player.w / 2 < runTo && f++ < 200) run(s, R);
        let n = 0;
        let flung = false;
        for (let k = 0; k < 400; k++) {
          const ev = run(s, J | R | (held ? B : 0));
          if (ev.some((e) => e.type === 'flingStart')) flung = true;
          if (flung) break;
          if (flingTarget(s, withShortcuts(scene, s.save), t) === i) n++;
          if ((s.player.grounded && k > 5) || s.caught) break;
        }
        if (held) expect(flung, name).toBe(true);
        else expect(n, name).toBeGreaterThanOrEqual(runTo > 0 ? 24 : 20);
      }
    });

  it("Lamp pressed in reach and let go with no direction held flings her up-right (the lamp's aim), across with a steer", () => {
    for (const [, x, y, runTo] of jumps)
      for (const wait of [0, 20, 40]) {
        const s = at('cn-hatch', x, y, []);
        run(s, 0, 20);
        let f = 0;
        while (runTo > 0 && s.player.x + s.player.w / 2 < runTo && f++ < 200) run(s, R);
        let k = 0;
        while (flingTarget(s, withShortcuts(scene, s.save), t) !== i && k++ < 200) run(s, J | R);
        for (let w = 0; w < wait && flingTarget(s, withShortcuts(scene, s.save), t) === i; w++) run(s, 0);
        // (Let go with the stick at rest, then steered on toward the far limb.)
        const from = `${Math.round(s.player.x + 20)},${Math.round(s.player.y + 40)}`;
        run(s, B, 6);
        let landed = false;
        for (let n = 0; n < 300 && !landed && !s.caught; n++) {
          run(s, n === 0 ? 0 : R);
          landed = s.player.grounded;
        }
        expect(
          landed && s.player.x > 4200,
          `from ${x} after ${wait} (flung at ${from}): ${s.player.x}, ${s.player.y}`,
        ).toBe(true);
        // ...and the lesson is over: it flung once.
        expect(s.save.flags).toContain('lesson:cn-hatch:wick-first');
      }
  });

  it('no jump without the fling reaches the far limb (the lesson only slows her)', () => {
    for (const [, x, y, runTo] of jumps) {
      const s = at('cn-hatch', x, y, []);
      run(s, 0, 20);
      let f = 0;
      while (runTo > 0 && s.player.x + s.player.w / 2 < runTo && f++ < 200) run(s, R);
      let caught = false;
      for (let k = 0; k < 400 && !caught; k++) {
        run(s, J | R);
        caught = !!s.caught;
      }
      expect(caught).toBe(true);
    }
  });
});

// (r11: the warning's cage is hung by the firefly once the warning is cleared, before the den's mouth: cut standing on
// the root knuckle under it, 1,632.)
const WARN_FLAGS = ['cn-tunnel-clear', 'cn-firefly-warn', 'cn-warn-hung'];
const TRAPS: Array<[string, string, number, string[]?]> = [
  ['cn-hub', 'trap-crossing', 1600],
  ['cn-grove', 'trap-grove', 1600],
  ['cn-tunnel', 'trap-warn', 1632, WARN_FLAGS],
];

describe('the premise: trap lamps (r10, review r9 #2)', () => {
  for (const [room, id, floor, flags] of TRAPS)
    it(`${room}:${id} is a trap, no springboard, cut out for good from the floor in three cuts`, () => {
      const scene = getRoom(room);
      const k = (scene.lures ?? []).findIndex((l) => l.id === id);
      const l = scene.lures?.[k];
      expect(l?.trap).toBe(true);
      expect(l?.relight).toBeUndefined();
      const s = at(room, l?.x ?? 0, floor, CG, flags ?? []);
      // (A creature or a wave nearby is not the point here.)
      s.enemies.length = 0;
      run(s, 0, 30);
      // Never a fling target, even in reach.
      run(s, J, 14);
      expect(flingTarget(s, withShortcuts(scene, s.save), t)).toBe(-1);
      run(s, 0, 60);
      const before = s.save.moths;
      // (A jump and an up cut on the way up, again until it is out: a person's three swings.)
      const ev: SimEvent[] = [];
      for (let tries = 0; tries < 8 && (s.lures.hp[k] ?? 0) > 0; tries++) {
        run(s, J, 3, ev);
        run(s, J | U | A, 1, ev);
        run(s, J | U, 20, ev);
        run(s, 0, 40, ev);
      }
      const hits = ev.filter((e) => e.type === 'lureHit' && e.id === id).length;
      const snuff = ev.find((e) => e.type === 'lureSnuff' && e.id === id) as
        | Extract<SimEvent, { type: 'lureSnuff' }>
        | undefined;
      expect(hits).toBe(t.lures.trapHp - 1);
      expect(snuff?.trap).toBe(true);
      expect(snuff?.moths).toBe(l?.moths);
      expect(s.save.snuffed).toContain(`${room}:${id}`);
      expect(s.save.moths).toBe(before + (l?.moths ?? 0));
      // ...for good: no relight, and a new entry (or a reload of the save) finds it out.
      run(s, 0, 1200);
      expect(s.lures.hp[k]).toBe(0);
      const again = createLures(scene, t, JSON.parse(JSON.stringify(s.save)).snuffed);
      expect(again.hp[k]).toBe(0);
    });

  it('every other lamp she can fling off is a springboard: it relights, is never saved, frees nothing', () => {
    const bad: string[] = [];
    for (const room of Object.keys(W.rooms).filter((id) => id.startsWith('cn-'))) {
      const scene = getRoom(room);
      const den = new Set((scene.enemies ?? []).map((e) => (e as { snuffs?: string }).snuffs));
      for (const l of scene.lures ?? []) {
        if (l.kind !== 'wick' || l.trap || l.after || den.has(l.id) || l.id.startsWith('wick-valley'))
          continue;
        if (room === 'cn-den') continue;
        if (!(l.relight && l.relight > 0)) bad.push(`${room}:${l.id} does not relight`);
        if ((l.moths ?? -1) !== 0 && l.id !== 'wick-first') bad.push(`${room}:${l.id} holds moths`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the well hollow's lamp, cut by a swing at the ambush's lampwing, burns again (the shard's only way up)", () => {
    const scene = getRoom('cn-well');
    const k = (scene.lures ?? []).findIndex((l) => l.id === 'wick-hollow');
    const l = scene.lures?.[k];
    expect(l?.relight).toBeGreaterThan(0);
    const s = at('cn-well', 1289, 990);
    s.enemies.length = 0;
    // (The cut itself: the blade's snuff, as the coordinator's video had it.)
    const ev: SimEvent[] = [];
    snuffLure(s, withShortcuts(scene, s.save), k, t, ev, 1, 'fwd');
    expect(ev.some((e) => e.type === 'lureSnuff' && e.id === 'wick-hollow')).toBe(true);
    expect(s.save.snuffed).not.toContain('cn-well:wick-hollow');
    run(s, 0, (l?.relight ?? 0) + 5);
    expect(s.lures.hp[k]).toBeGreaterThan(0);
  });

  it('the hub shows the moths of each trap lamp freed (roosts)', () => {
    const hub = getRoom('cn-hub');
    const save = newSave([]);
    expect(roostsLit(hub, save)).toEqual([]);
    const lit: string[] = [];
    for (const [room, id] of TRAPS) {
      save.snuffed.push(`${room}:${id}`);
      lit.push((hub.roosts ?? []).find((r) => r.lure === `${room}:${id}`)?.id ?? '?');
      expect(roostsLit(hub, save).map((r) => r.id)).toEqual(lit);
    }
  });
});

describe("the hub's map station opens on her first pass (r10, review r9 #9)", () => {
  it('running through p-crossing shows the map once; later passes do not, a rest does', () => {
    const s = at('cn-hub', 3300, 1600, []);
    s.enemies.length = 0;
    const ev = run(s, ActionBit.left, 60);
    expect(ev.filter((e) => e.type === 'mapStation').length).toBe(1);
    expect(ev.some((e) => e.type === 'patchRest')).toBe(false);
    const back = run(s, R, 60);
    const again = run(s, ActionBit.left, 60);
    expect([...back, ...again].some((e) => e.type === 'mapStation')).toBe(false);
  });
});

// (r13: the gap's pass is the firefly's chase now: tests/unit/canopy-r13.test.ts.)
// (r13: the gap's pass is the firefly's chase now: tests/unit/canopy-r13.test.ts.)
describe('a gate never shuts on her (r10)', () => {
  it("the Grove's arena gate shutting with her in it pushes her clear", () => {
    const scene = getRoom('cn-grove');
    const g = (scene.gates ?? []).find((q) => q.id === 'arena-w');
    expect(g).toBeDefined();
    if (!g) return;
    const s = at('cn-grove', 1700, g.y + g.h - 8);
    s.enemies.length = 0;
    s.player.vy = 0;
    s.save.flags.push(g.shut as string);
    const ev = run(s, 0, 1);
    expect(ev.some((e) => e.type === 'gatePush' && e.id === 'arena-w')).toBe(true);
    const p = s.player;
    expect(gateShut(g, s.save.flags)).toBe(true);
    expect(p.x < g.x + g.w && g.x < p.x + p.w && p.y < g.y + g.h && g.y < p.y + p.h).toBe(false);
    expect(solidAt(withShortcuts(scene, s.save), p.x, p.y, p.w, p.h)).toBe(false);
    run(s, 0, 120);
    expect(s.player.grounded).toBe(true);
  });
});

describe('thorn returns inside a shut arena (r10, review r9 #3)', () => {
  it("walking into the Grove pit's bed with the gates shut puts her back away from every bed", () => {
    const scene = getRoom('cn-grove');
    const s = at('cn-grove', 2300, 1600, CG, ['cn-grove-wave']);
    s.enemies.length = 0;
    const bed = (scene.thorns ?? []).find((q) => q.id === 'thorn-p1');
    if (!bed) throw new Error('thorn-p1');
    let back: Extract<SimEvent, { type: 'fallReturn' }> | undefined;
    for (let k = 0; k < 400 && !back; k++)
      back = run(s, R).find((e) => e.type === 'fallReturn') as typeof back;
    expect(back).toBeDefined();
    for (const r of scene.thorns ?? []) {
      if (Math.abs(r.y - (back?.y ?? 0)) > 400) continue;
      const gap = Math.max(r.x - (back?.x ?? 0), (back?.x ?? 0) - (r.x + r.w));
      expect(gap, r.id).toBeGreaterThanOrEqual(t.room.arenaThornPx);
    }
    expect(back?.x ?? 0).toBeLessThan(bed.x - 400);
    // ...and inside the arena, never behind its west wall (the floor runs on under it into the secret pocket).
    expect(back?.x ?? 0).toBeGreaterThan(1472 + 20);
  });
});

describe("the den's warning (r10, review r9 #3 / #6)", () => {
  const scene = getRoom('cn-tunnel');
  it('1,024 px of flat floor from the pit to the den lid, no knuckle over it, the mouth at its east end', () => {
    const lid = (scene.gates ?? []).find((g) => g.id === 'den-lid');
    const pit = (scene.thorns ?? []).find((q) => q.id === 'thorn-pit');
    if (!lid || !pit) throw new Error('lid / pit');
    const x0 = pit.x + pit.w;
    expect(lid.x - x0).toBeGreaterThanOrEqual(1024);
    for (let x = x0; x < lid.x; x += 16) {
      expect(solidAt(scene, x, 1856, 8, 8), `floor at ${x}`).toBe(true);
      // (Clear over it up to the mouth's arch: its lintel 256 over the floor.)
      const h = x < 7808 - 8 ? 300 : 256;
      expect(solidAt(scene, x, 1856 - h, 8, h - 8), `clear over ${x}`).toBe(false);
    }
    const den = (scene.exits ?? []).find((e) => e.id === 'den');
    expect(den?.edge).toBe('e');
    expect(den?.to).toBe(1856);
  });

  it('a fade on the floor re-forms her on it at the mark patch (not behind the pit), with no rest there', () => {
    const s = at('cn-tunnel', 7500, 1856);
    s.enemies.length = 0;
    const ev = run(s, 0, 40);
    expect(ev.some((e) => e.type === 'patchMark' && e.id === 'p-warn')).toBe(true);
    expect(ev.some((e) => e.type === 'patchRest')).toBe(false);
    s.player.hp = 1;
    s.player.faded = 1;
    run(s, 0, 30);
    const x = s.player.x + s.player.w / 2;
    expect(s.room).toBe('cn-tunnel');
    const pit = (scene.thorns ?? []).find((q) => q.id === 'thorn-pit');
    expect(x).toBeGreaterThan((pit?.x ?? 0) + (pit?.w ?? 0));
  });
});
