/**
 * The Canopy, round 12 (docs/design/levels/canopy-moments.md; memory/canopy.md v12):
 *  - The Keeper (moment 6): the den's old burrback on the boss framework. P1 the falling moths (caught, or eaten and
 *    cut while it eats), P2 at 7 the swinging cage (it sees her only in its light; blind, a cut from behind lands),
 *    P3 at 4 the fallen cage (its sweeps, a third freed a cut), the release of every moth saved; a fade restarts it
 *    with the cage full; the den's fight controller wins it.
 *  - The ending's fallback (moment 7): the roof gives after the release (groan, dust, the rubble's slope, settle),
 *    the slope stays, the hub's roosts empty.
 *  - The opening's hooks (moment 1): the break's flag, the black before it.
 *  - The hub's landing frame holds through the release (moment 2).
 *  - The first-timer's r11 findings: the limbs' gap, the giant's notch, the trunk's juvenile.
 */
import { describe, expect, it } from 'vitest';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { resetBoss } from '../../src/sim/boss/index';
import { resetEnemies } from '../../src/sim/enemies';
import type { SimEvent } from '../../src/sim/events';
import { roostsLeft, roostsLit } from '../../src/sim/firefly';
import { continueState, createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { gateShut, rearmArenas } from '../../src/sim/kit';
import { flameAt } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { runKeeper } from '../../tools/playtest/keeper-run';

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
const { jump: J, right: R, left: L, up: U, attack: A, lamp: B } = ActionBit;
type Of<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
const den = getRoom('cn-den');
const cageIx = (den.lures ?? []).findIndex((l) => l.id === 'trap-den');
const burr = (s: GameState) => s.enemies.find((e) => e.id === 'old-burr') as GameState['enemies'][number];
/** Where she stands to cut the fallen cage at `cx` from the side away from the Keeper (r14: a cut on it is its own). */
const farSide = (s: GameState, cx: number): number => {
  const e = burr(s);
  return e.x + e.w / 2 < cx ? cx + 40 : cx - 40;
};

/** (r13: P1 ends once two moths have fallen as well as at its health; P2 after two swings.) */
function toP2(s: GameState): void {
  if (s.boss) s.boss.drops = Math.max(s.boss.drops, t.keeper.p1Drops);
  burr(s).hp = t.keeper.p2Hp;
}
function toP3(s: GameState): void {
  if (s.boss) s.boss.phaseTime = Math.max(s.boss.phaseTime, t.keeper.p2MinFrames + 1);
  burr(s).hp = t.keeper.p3Hp;
}

/** She is on the den's floor (the lock), the fight under way, phase 1. */
function fight(x = 1000): { s: GameState; ev: SimEvent[] } {
  const s = at('cn-den', x, 1344);
  const ev = run(s, 0, 100);
  return { s, ev };
}

describe('the Keeper (r12, moment 6)', () => {
  it('is a keeper boss over the great cage; the lock and the wake begin phase 1 with 120 moths in the cage', () => {
    expect(den.boss?.kind).toBe('keeper');
    expect(den.boss?.heart).toBe('trap-den');
    const { s, ev } = fight();
    expect(ev.some((e) => e.type === 'bossLock')).toBe(true);
    expect((ev.find((e) => e.type === 'bossPhase') as Of<'bossPhase'>)?.phase).toBe(1);
    expect(s.boss?.left).toBe(120);
    expect(burr(s).keep).toBe(1);
    expect(burr(s).hpMax).toBe(16);
  });

  it('the intro: as the firefly leaves, a moth falls and the sleeper takes it, before she can be down', () => {
    const s = at('cn-den', 300, 320);
    const ev = run(s, 0, 600);
    const drop = ev.findIndex((e) => e.type === 'cageDrop');
    const fed = ev.findIndex((e) => e.type === 'enemyFeed');
    const end = ev.findIndex((e) => e.type === 'fireflyEnd');
    expect(drop).toBeGreaterThan(0);
    expect(fed).toBeGreaterThan(drop);
    expect(end).toBeGreaterThan(drop);
    expect(burr(s).mode).toBe('sleep');
  });

  it('P1: a moth falls; uncaught, it goes for it and eats, head down and open: a cut lands', () => {
    const { s } = fight(1000);
    const ev: SimEvent[] = [];
    let eatAt = -1;
    for (let f = 0; f < 900 && eatAt < 0; f++) {
      s.player.invuln = 30;
      run(s, 0, 1, ev);
      if (ev.some((e) => e.type === 'keeperEat')) eatAt = f;
    }
    expect(ev.some((e) => e.type === 'cageDrop')).toBe(true);
    const eaten = ev.find((e) => e.type === 'mothEaten') as Of<'mothEaten'>;
    expect(eaten?.n).toBe(1);
    expect(s.boss?.eaten).toBe(1);
    const e = burr(s);
    expect(e.mode).toBe('eat');
    expect(e.stunned).toBe(true);
    // In beside it, a cut: it lands.
    const hp = e.hp;
    placePlayer(s, e.x - 20, 1344, t, withShortcuts(den, s.save), []);
    s.player.facing = 1;
    const ev2 = run(s, R | A, 1);
    run(s, 0, 20, ev2);
    expect(ev2.some((q) => q.type === 'enemyHit' && q.id === 'old-burr')).toBe(true);
    expect(burr(s).hp).toBe(hp - 1);
  });

  it('P1: she catches a falling moth first: it is saved, nothing eaten', () => {
    const { s } = fight(1000);
    let caught = false;
    for (let f = 0; f < 900 && !caught; f++) {
      s.player.invuln = 30;
      const b = s.boss;
      if (b && b.moth === 2 && b.mothY > 900) {
        // (Her box onto the moth: a jump at the right moment.)
        placePlayer(s, b.mothX, b.mothY + 40, t, withShortcuts(den, s.save), []);
      }
      const ev = run(s, 0);
      caught = ev.some((e) => e.type === 'mothSaved');
    }
    expect(caught).toBe(true);
    expect(s.boss?.saved).toBe(1);
    expect(s.boss?.caught).toBe(1);
    expect(s.boss?.eaten).toBe(0);
  });

  it('P2 (r13: at 10): the cage swings (its period and reach), it sees her only in its light', () => {
    const { s } = fight(1000);
    toP2(s);
    const ev = run(s, 0, 1);
    expect(s.boss?.stage).toBe('shift');
    run(s, 0, 120, ev);
    expect(s.boss?.phase).toBe(2);
    const sw = ev.find((q) => q.type === 'cageSwing') as Of<'cageSwing'>;
    expect(sw?.period).toBe(t.keeper.swingPeriod);
    // A full swing once it is in its reach: the flame crosses the arena's middle both ways, ±reach.
    const l = den.lures?.[cageIx];
    run(s, 0, t.keeper.swingPeriod);
    let lo = 1e9;
    let hi = -1e9;
    for (let f = 0; f < t.keeper.swingPeriod; f++) {
      s.player.invuln = 30;
      run(s, 0);
      const fl = flameAt(s.lures, cageIx, l as never, s.frame, t, { x: 0, y: 0 });
      lo = Math.min(lo, fl.x);
      hi = Math.max(hi, fl.x);
    }
    expect(hi - (l?.x ?? 0)).toBeGreaterThan(t.keeper.swingReach - 20);
    expect((l?.x ?? 0) - lo).toBeGreaterThan(t.keeper.swingReach - 20);
    // In the dark (far from the cage's cone) it is blind and braces at nothing.
    let braced = 0;
    let blind = 0;
    for (let f = 0; f < 300; f++) {
      s.player.invuln = 30;
      const q = run(s, 0);
      if (s.boss?.lit === 0) blind++;
      if (s.boss?.lit === 0 && q.some((z) => z.type === 'enemyWindup')) braced++;
    }
    expect(blind).toBeGreaterThan(0);
    expect(braced).toBe(0);
  });

  it('P2: blind, a cut from behind lands; from its front it glances', () => {
    const { s } = fight(1000);
    toP2(s);
    run(s, 0, 140);
    const e = burr(s);
    // (Out of the light: the cage swung away; it faces west.)
    const far = () => Math.abs((s.boss?.cageX ?? 0) - (e.x + e.w / 2)) > 760;
    for (
      let f = 0;
      f < 900 && !(s.boss?.lit === 0 && far() && (e.mode === 'walk' || e.mode === 'pause'));
      f++
    ) {
      s.player.invuln = 30;
      run(s, 0);
    }
    expect(s.boss?.lit).toBe(0);
    const hp = e.hp;
    const behind = e.facing > 0 ? e.x - 30 : e.x + e.w + 30;
    placePlayer(s, behind, 1344, t, withShortcuts(den, s.save), []);
    s.player.facing = e.facing > 0 ? 1 : -1;
    s.player.invuln = 30;
    const ev = run(s, (e.facing > 0 ? R : L) | A, 1);
    run(s, 0, 10, ev);
    expect(ev.some((q) => q.type === 'enemyHit' && q.id === 'old-burr')).toBe(true);
    expect(burr(s).hp).toBe(hp - 1);
  });

  it('P3: the cage falls guarded until its first sweep (r13); a cut frees a third; 3 cuts, then it holds', () => {
    const { s } = fight(1000);
    toP2(s);
    run(s, 0, 200);
    toP3(s);
    const ev = run(s, 0, 200);
    expect(s.boss?.phase).toBe(3);
    const fall = ev.find((q) => q.type === 'cageFall') as Of<'cageFall'>;
    expect(fall?.x).toBe(den.boss?.lowered?.x);
    expect(ev.some((q) => q.type === 'lureSnuff' && q.id === 'wick-taproot')).toBe(true);
    // (r13: its bars are under its claws until its first sweep: the blade glances.)
    placePlayer(s, (fall?.x ?? 0) - 30, 1344, t, withShortcuts(den, s.save), []);
    s.player.invuln = 60;
    const g0 = run(s, U | A, 1);
    run(s, U, 24, g0);
    expect(g0.some((z) => z.type === 'lureGuarded' && z.id === 'trap-den')).toBe(true);
    expect(g0.some((z) => z.type === 'cageRelease')).toBe(false);
    const ev1: SimEvent[] = [];
    for (let f = 0; f < 1200 && !ev1.some((z) => z.type === 'cageGuard' && !z.on); f++) {
      s.player.invuln = 30;
      placePlayer(s, 700, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev1);
    }
    const sw = ev1.find((z) => z.type === 'mothEaten') as Of<'mothEaten'>;
    expect(sw?.n).toBe(t.keeper.sweepEat);
    // Cuts on the fallen cage: each a third of what is in it.
    const left0 = s.boss?.left ?? 0;
    placePlayer(s, (fall?.x ?? 0) - 30, 1344, t, withShortcuts(den, s.save), []);
    const cuts: Of<'cageRelease'>[] = [];
    for (let n = 0; n < 24 && cuts.length < t.keeper.cageCuts + 1; n++) {
      s.player.invuln = 60;
      // (r14: from the cage's side away from the Keeper: a cut that meets it is its own, not the cage's.)
      placePlayer(s, farSide(s, fall?.x ?? 0), 1344, t, withShortcuts(den, s.save), []);
      const q = run(s, U | A, 1);
      run(s, U, 24, q);
      cuts.push(...(q.filter((z) => z.type === 'cageRelease') as Of<'cageRelease'>[]));
    }
    expect(cuts.length).toBe(t.keeper.cageCuts);
    expect(cuts[0]?.moths).toBe(Math.round(left0 / 3));
    expect(s.lures.hp[cageIx]).toBeGreaterThan(0);
  });

  it('a fade restarts the fight: the cage full and hung, the den lamp lit, the creature whole', () => {
    const { s } = fight(1000);
    toP2(s);
    run(s, 0, 200);
    toP3(s);
    run(s, 0, 200);
    expect(s.boss?.phase).toBe(3);
    const ev: SimEvent[] = [];
    resetEnemies(s, den, t, ev);
    resetBoss(s, den, t, ev);
    expect(ev.some((q) => q.type === 'bossReset')).toBe(true);
    expect(s.boss?.left).toBe(120);
    expect(s.boss?.phase).toBe(0);
    const l = den.lures?.[cageIx];
    const fl = flameAt(s.lures, cageIx, l as never, s.frame, t, { x: 0, y: 0 });
    expect(fl.x).toBe(l?.x);
    expect(fl.y).toBe(l?.y);
    expect(s.lures.hp[cageIx]).toBe(t.lures.trapHp);
    const ti = (den.lures ?? []).findIndex((q) => q.id === 'wick-taproot');
    expect(s.lures.hp[ti]).toBeGreaterThan(0);
    expect(burr(s).hp).toBe(16);
  });

  it("the den's fight controller beats it alone from the balcony, and frees >= 60 of 120", () => {
    const r = runKeeper({ frames: 5 * 3600 });
    expect(r.won).toBe(true);
    expect(r.released).toBe(true);
    expect(r.freed).toBeGreaterThanOrEqual(60);
    // (Its phases in order, each from its threshold.)
    expect(r.phaseAt[2] ?? 0).toBeGreaterThan(r.phaseAt[1] ?? 0);
    expect(r.phaseAt[3] ?? 0).toBeGreaterThan(r.phaseAt[2] ?? 0);
    // (A casual win under 2:30.)
    expect((r.frames - r.lockAt) / 60).toBeLessThan(150);
  }, 120000);
});

describe("the ending's fallback (r12, moment 7)", () => {
  it('after the release the roof groans, dust falls, the rubble lands (r14: for the escape) and stays; the roosts empty', () => {
    const r = runKeeper({ frames: 5 * 3600 });
    const ev = r.events;
    const phases = ev.filter((e) => e.type === 'denCollapse').map((e) => (e as Of<'denCollapse'>).phase);
    expect(phases[0]).toBe('groan');
    expect(phases).toContain('dust');
    expect(phases).toContain('rubble');
    expect(phases.at(-1)).toBe('settle');
    const s = r.game.state;
    expect(s.save.flags).toContain('cn-den-collapse');
    expect(s.boss?.stage).toBe('down');
    const rubble = (den.gates ?? []).filter((g) => g.id.startsWith('rubble-'));
    // (r14: the escape's heap and torn roots, not r12's staircase.)
    // (r15: the escape runs east along the floor: the mound on it, two torn roots up the west side.)
    expect(rubble.map((g) => g.id)).toContain('rubble-mound');
    expect(rubble.length).toBeGreaterThanOrEqual(3);
    for (const g of rubble) expect(gateShut(g, s.save.flags)).toBe(true);
    const root = (den.gates ?? []).find((g) => g.id === 'taproot');
    expect(root && gateShut(root, s.save.flags)).toBe(false);
    // (A fresh entry keeps the den caved: the rubble's flag is not an arena's.)
    rearmArenas(den, s.save);
    expect(s.save.flags).toContain('cn-den-collapse');
    // The hub's roosts: freed earlier, gone on now.
    const hub = getRoom('cn-hub');
    const save = newSave([] as never);
    save.snuffed.push('cn-hub:trap-crossing');
    expect(roostsLit(hub, save).length).toBe(1);
    save.flags.push('cn-den-freed');
    expect(roostsLit(hub, save).length).toBe(0);
    expect(roostsLeft(hub, save).map((q) => q.id)).toContain('roost-crossing');
  }, 120000);
});

describe("the opening's hooks (r12, moment 1)", () => {
  it('the break sets the kin-try flag, never before the black has passed', () => {
    const hatch = getRoom('cn-hatch');
    const open = hatch.marks?.stage?.open;
    // (r18: 1 s of black, her light breathing in it; was 3 s.)
    expect(open?.black).toBe(60);
    expect(open?.zooms.length).toBe(t.hatch.presses);
    expect((hatch.marks?.tatter as { tryOn?: string } | undefined)?.tryOn).toBe('cn-hatched');
    const save = newSave([] as never);
    const s = createState(1, t, hatch, [], [] as never, save);
    const ev: SimEvent[] = [];
    // Three quick presses in the black.
    for (let f = 0; f < 400; f++) {
      const k = f === 10 || f === 30 || f === 50 ? J : 0;
      const e: SimEvent[] = [];
      step(s, k, t, withShortcuts(hatch, s.save), e, W);
      for (const q of e) ev.push({ ...q, f } as never);
    }
    const br = ev.find((q) => q.type === 'hatch') as Of<'hatch'> & { f: number };
    expect(br.f).toBeGreaterThanOrEqual(open?.black ?? 0);
    expect(ev.filter((q) => q.type === 'hatchStir').length).toBeGreaterThanOrEqual(3);
    expect(s.save.flags).toContain('cn-hatched');
  });
});

describe("the hub's landing frame through the release (r12, moment 2)", () => {
  it('holds the cage, the kin and the sky while the cloud swirls and streams; no drop after the hold', () => {
    const hub = getRoom('cn-hub');
    const k = (hub.lures ?? []).findIndex((l) => l.id === 'trap-crossing');
    const l = hub.lures?.[k];
    for (const [vw, vh] of [
      [1920, 1080],
      [2560, 1080],
    ] as const) {
      const s = at('cn-hub', l?.x ?? 0, 1600, []);
      s.enemies.length = 0;
      const ct = cameraFor(hub);
      const cam = createCamera(s, hub, ct, vw, vh);
      for (let f = 0; f < 90; f++) {
        run(s, 0);
        stepCamera(cam, s, hub, ct);
      }
      let out = -1;
      const ys: number[] = [];
      for (let f = 0; f < 420; f++) {
        const ev = run(s, f % 26 === 0 && out < 0 ? U | A : 0);
        stepCamera(cam, s, hub, ct);
        if (out < 0 && ev.some((q) => q.type === 'lureSnuff' && q.id === 'trap-crossing')) out = f;
        if (out >= 0) ys.push(lerpCamera(cam, cam, 1).y);
      }
      expect(out).toBeGreaterThanOrEqual(0);
      const v = lerpCamera(cam, cam, 1);
      const w = vw / cam.zoom;
      const h = vh / cam.zoom;
      expect(Math.abs((l?.x ?? 0) - v.x)).toBeLessThan(w / 2 - 60);
      expect(Math.abs((l?.y ?? 0) - v.y)).toBeLessThan(h / 2 - 60);
      // (After the hold, the view settles: it does not drop away under the stream.)
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(80);
      expect(s.save.flags).not.toContain('cn-hub-left');
    }
  });
});

describe("the first-timer's r11 findings (r12)", () => {
  it("the limbs' gap: a running jump off the first limb lands on the knuckle; so does the lamp let go unaimed", () => {
    const s = at('cn-limbs', 900, 768, ['wallJump']);
    s.enemies.length = 0;
    run(s, R, 20);
    run(s, R | J, 22);
    run(s, R, 30);
    run(s, 0, 30);
    expect(s.player.grounded).toBe(true);
    expect(s.player.y + s.player.h).toBeLessThan(800);
    expect(s.player.x).toBeGreaterThan(1300);
    // The lamp: in reach on the jump, Lamp held and let go with nothing held.
    const s2 = at('cn-limbs', 1200, 700, ['wallJump']);
    s2.enemies.length = 0;
    const ev = run(s2, B, 6);
    run(s2, 0, 90, ev);
    expect(ev.some((q) => q.type === 'fling')).toBe(true);
    expect(ev.some((q) => q.type === 'thornHit')).toBe(false);
    expect(s2.player.grounded).toBe(true);
    expect(s2.player.y + s2.player.h).toBeLessThanOrEqual(720);
    expect(s2.player.x).toBeGreaterThan(1350);
  });

  it("the giant's notch: a full jump west through the open wall clears the burl (it bonked the root at 512)", () => {
    const s = at('cn-trunk', 1600, 704, ['wallJump']);
    s.enemies.length = 0;
    s.save.opened.push('cn-trunk:giant-wall');
    const ev = run(s, L | J, 22);
    run(s, L, 30, ev);
    expect(s.player.x).toBeLessThan(1344);
  });

  it("a Continue at the Grove's save with its wave's lock saved finds the door open (ft12 was locked out)", () => {
    const save = newSave(['wallJump'] as never);
    save.patch = { room: 'cn-grove', id: 'p-grove' };
    save.flags.push('cn-grove-wave');
    save.visited.push('cn-grove');
    const s = continueState(1, t, W, save, []);
    const door = getRoom('cn-grove').gates?.find((g) => g.id === 'pit-door');
    expect(s.room).toBe('cn-grove');
    expect(door && gateShut(door, s.save.flags)).toBe(false);
  });

  it("the trunk's juvenile walks the top, away from both landings in the hall and (r17) from the door and the lip", () => {
    const trunk = getRoom('cn-trunk');
    const j = (trunk.enemies ?? []).find((e) => e.id === 'juv-t1');
    expect(j?.y).toBe(384);
    // (r17: both ends of the top are arrivals, the door (3,200) and the climb's lip (2,560). r18: it sleeps at its spot,
    // 300+ px from the door and 270+ from the lip, until she is down near it (canopy-r18.test.ts); awake it walks the
    // top's middle.)
    expect((j as { asleep?: boolean } | undefined)?.asleep).toBe(true);
    expect((j?.x ?? 0) - 2560).toBeGreaterThanOrEqual(270);
    expect(3136 - (j?.x ?? 0)).toBeGreaterThanOrEqual(300);
  });
});
