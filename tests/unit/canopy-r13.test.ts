/**
 * The Canopy, round 13 (docs/design/levels/canopy-moments.md; review canopy-r12.md; memory/canopy.md v13):
 *  - The Keeper's length and bite (review #1, #2): 16 hp, phases gated on their moths / time / sweeps as well as hits,
 *    P2's lit glance and its lunge, P1's second moth on the ram's line, the fallen cage guarded until the first sweep,
 *    a cut on it turns the Keeper on her, the sweep's claws, the rubble at +150.
 *  - The firefly's flight (moment 4): the chase over the gap, its hooks kindled, its waits, the nest, the call.
 *  - The trap is set (moment 5): the warning's cage fills while she watches, then the den stirs.
 *  - Moonlight for two (moment 3): the kin sits by her in the crown.
 *  - The opening's river keyed to her progress (review #6): the promise's flag.
 */
import { describe, expect, it } from 'vitest';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
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
const { jump: J, right: R, left: L, up: U, down: D, attack: A, lamp: B } = ActionBit;
type Of<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
const den = getRoom('cn-den');
const cageIx = (den.lures ?? []).findIndex((l) => l.id === 'trap-den');
const burr = (s: GameState) => s.enemies.find((e) => e.id === 'old-burr') as GameState['enemies'][number];
/** Where she stands to cut the fallen cage at `cx` from the side away from the Keeper (r14: a cut on it is its own). */
const farSide = (s: GameState, cx: number): number => {
  const e = burr(s);
  return e.x + e.w / 2 < cx ? cx + 40 : cx - 40;
};

/** She is on the den's floor (the lock), the fight under way, phase 1. */
function fight(x = 1000): { s: GameState; ev: SimEvent[] } {
  const s = at('cn-den', x, 1344);
  const ev = run(s, 0, 100);
  return { s, ev };
}

describe("the Keeper's length and bite (r13, review r12 #1, #2)", () => {
  it('16 hp; P1 holds at its gate until two moths have fallen (a cut there glances), then P2', () => {
    const { s } = fight(1000);
    const e = burr(s);
    expect(e.hpMax).toBe(16);
    e.hp = t.keeper.p2Hp;
    const ev: SimEvent[] = [];
    run(s, 0, 2, ev);
    // (Gated: no phase change, its health floors there.)
    expect(s.boss?.phase).toBe(1);
    expect(e.gate).toBe(t.keeper.p2Hp);
    // (A cut at the gate glances: `keeperGlance gate`.)
    for (let n = 0; n < 8 && !ev.some((q) => q.type === 'keeperGlance'); n++) {
      s.player.invuln = 60;
      const k = burr(s);
      k.stunned = true;
      placePlayer(s, k.x - 30, 1344, t, withShortcuts(den, s.save), []);
      s.player.facing = 1;
      run(s, R | A, 1, ev);
      run(s, 0, 20, ev);
    }
    const gl = ev.find((q) => q.type === 'keeperGlance') as Of<'keeperGlance'>;
    expect(gl?.why).toBe('gate');
    expect(burr(s).hp).toBe(t.keeper.p2Hp);
    burr(s).stunned = false;
    // (Its moths are brought forward: two fall, then P2.)
    for (let f = 0; f < 1800 && s.boss?.phase === 1; f++) {
      s.player.invuln = 30;
      placePlayer(s, 300, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev);
    }
    expect(ev.filter((q) => q.type === 'cageDrop').length).toBeGreaterThanOrEqual(t.keeper.p1Drops);
    expect(s.boss?.phase).toBe(2);
  });

  it("P1's second moth falls on the ram's line, between it and her", () => {
    const { s } = fight(1000);
    const ev: SimEvent[] = [];
    for (let f = 0; f < 2400 && ev.filter((q) => q.type === 'cageDrop').length < 2; f++) {
      s.player.invuln = 30;
      placePlayer(s, 400, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev);
    }
    const drops = ev.filter((q) => q.type === 'cageDrop') as Of<'cageDrop'>[];
    expect(drops.length).toBe(2);
    const e = burr(s);
    const ex = e.x + e.w / 2;
    const second = drops[1] as Of<'cageDrop'>;
    // (Between them: nearer her than the cage's point, on her side of it.)
    expect(Math.abs(second.landX - 430)).toBeLessThan(Math.abs(ex - 430) + 40);
    expect(second.landX).toBeLessThan(den.lures?.[cageIx]?.x ?? 0);
  });

  it('P2: lit, every cut but its eat glances (`keeperGlance lit`); the phase lasts two swings at least', () => {
    const { s } = fight(1000);
    if (s.boss) s.boss.drops = t.keeper.p1Drops;
    burr(s).hp = t.keeper.p2Hp;
    run(s, 0, 140);
    expect(s.boss?.phase).toBe(2);
    const ev: SimEvent[] = [];
    // Stand under the cage's flame (in its light), the Keeper laid open: a cut glances.
    let glanced = false;
    for (let n = 0; n < 20 && !glanced; n++) {
      const b = s.boss;
      const e = burr(s);
      s.player.invuln = 60;
      e.stunned = true;
      e.mode = 'recover';
      e.timer = 60;
      // (Her under the cage's flame, in its light; it just east of her.)
      const x = b?.cageX ?? 1856;
      e.x = x + 30;
      placePlayer(s, x - 20, 1344, t, withShortcuts(den, s.save), []);
      s.player.facing = 1;
      const q = run(s, R | A, 1, ev);
      run(s, 0, 12, q);
      glanced = q.some((z) => z.type === 'keeperGlance' && z.why === 'lit');
    }
    expect(glanced).toBe(true);
    // Its health floors at P3's threshold until two swings have passed.
    burr(s).hp = t.keeper.p3Hp;
    if (s.boss) s.boss.phaseTime = 10;
    run(s, 0, 2);
    expect(s.boss?.phase).toBe(2);
    expect(burr(s).gate).toBe(t.keeper.p3Hp);
  });

  it('P2: the light finds her close by and it lunges at once (a short tell)', () => {
    const { s } = fight(1000);
    if (s.boss) s.boss.drops = t.keeper.p1Drops;
    burr(s).hp = t.keeper.p2Hp;
    run(s, 0, 140);
    const ev: SimEvent[] = [];
    // Stand near it, on its floor; wait for the swing's light to come onto her.
    for (let f = 0; f < 1200 && !ev.some((q) => q.type === 'keeperLunge'); f++) {
      s.player.invuln = 30;
      const e = burr(s);
      if (s.boss?.lit === 0) placePlayer(s, e.x + e.w / 2 - 300, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev);
    }
    const lu = ev.find((q) => q.type === 'keeperLunge') as Of<'keeperLunge'>;
    expect(lu?.frames).toBe(t.keeper.lungeTell);
    expect(ev.some((q) => q.type === 'enemyWindup' && q.frames === t.keeper.lungeTell)).toBe(true);
  });

  it('P3: guarded until the first sweep; a cut on it then turns the Keeper on her (a ram at the cage)', () => {
    const { s } = fight(1000);
    if (s.boss) s.boss.drops = t.keeper.p1Drops;
    burr(s).hp = t.keeper.p2Hp;
    run(s, 0, 200);
    if (s.boss) s.boss.phaseTime = t.keeper.p2MinFrames + 1;
    burr(s).hp = t.keeper.p3Hp;
    const ev = run(s, 0, 200);
    expect(s.boss?.phase).toBe(3);
    expect((ev.find((q) => q.type === 'cageGuard') as Of<'cageGuard'>)?.on).toBe(true);
    // Its first sweep (she out of the cloud): the bars open.
    const ev2: SimEvent[] = [];
    for (let f = 0; f < 1500 && !ev2.some((q) => q.type === 'cageGuard' && !q.on); f++) {
      s.player.invuln = 30;
      placePlayer(s, 400, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev2);
    }
    expect(ev2.some((q) => q.type === 'keeperSweep')).toBe(true);
    expect((s.boss?.sweeps ?? 0) >= 1).toBe(true);
    // A cut on the cage: a third freed, and it turns on her.
    const cx = s.boss?.cageX ?? 0;
    const ev3: SimEvent[] = [];
    for (let n = 0; n < 6 && !ev3.some((q) => q.type === 'cageRelease'); n++) {
      s.player.invuln = 60;
      placePlayer(s, farSide(s, cx), 1344, t, withShortcuts(den, s.save), []);
      run(s, U | A, 1, ev3);
      run(s, U, 24, ev3);
    }
    expect(ev3.some((q) => q.type === 'cageRelease')).toBe(true);
    expect(ev3.some((q) => q.type === 'keeperGuard')).toBe(true);
    expect(ev3.some((q) => q.type === 'enemyWindup' && q.frames === t.keeper.guardTell)).toBe(true);
  });

  it("P3: the sweep's claws hurt her if she stands in the cloud; they eat 7", () => {
    const { s } = fight(1000);
    if (s.boss) s.boss.drops = t.keeper.p1Drops;
    burr(s).hp = t.keeper.p2Hp;
    run(s, 0, 200);
    if (s.boss) s.boss.phaseTime = t.keeper.p2MinFrames + 1;
    burr(s).hp = t.keeper.p3Hp;
    run(s, 0, 200);
    const ev: SimEvent[] = [];
    for (let f = 0; f < 1500 && !ev.some((q) => q.type === 'keeperSweep'); f++) {
      // (Out of the way until the tell, then into the cloud.)
      const b = s.boss;
      if (b?.moth !== 4) s.player.invuln = 30;
      const x = b?.moth === 4 ? (b?.cageX ?? 0) + 120 : 300;
      placePlayer(s, x, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev);
    }
    run(s, 0, 3, ev);
    const eaten = ev.find((q) => q.type === 'mothEaten') as Of<'mothEaten'>;
    expect(eaten?.n).toBe(t.keeper.sweepEat);
    expect(ev.some((q) => q.type === 'hurt')).toBe(true);
  });

  it('the den controller wins it in 60-120 s, and the rubble lands 150 frames after the release', () => {
    const r = runKeeper({ frames: 6 * 3600 });
    expect(r.won).toBe(true);
    expect(r.released).toBe(true);
    const secs = (r.frames - r.lockAt) / 60;
    expect(secs).toBeGreaterThan(50);
    expect(secs).toBeLessThan(150);
    const rel = r.events.find((e) => e.type === 'lureSnuff' && e.id === 'trap-den');
    const rub = r.events.find((e) => e.type === 'denCollapse' && e.phase === 'rubble');
    expect((rub?.f ?? 0) - (rel?.f ?? 0)).toBeGreaterThanOrEqual(t.keeper.collapseRubble);
    expect((rub?.f ?? 0) - (rel?.f ?? 0)).toBeLessThan(t.keeper.collapseRubble + 10);
  }, 180000);
});

// --- Moment 4: the firefly's flight.
const gap = getRoom('cn-gap');
const HOOKS = ['hook-1', 'hook-2', 'hook-3', 'hook-4', 'hook-5', 'hook-6'];
const ix = (id: string) => (gap.lures ?? []).findIndex((l) => l.id === id);

/** In the air in reach of `from`: the Lamp, `aim`, let go; then on until `next` is in reach (or she lands). */
function fling(s: GameState, aim: number, next: string, ev: SimEvent[]): boolean {
  for (let i = 0; i < 4; i++) run(s, aim | B, 1, ev);
  run(s, aim, 1, ev);
  const hold = aim & (L | R);
  // ('chain': the chain's first or second lamp; either flings up-west into the roost's mouth.)
  const ok = (k: number) =>
    next === 'chain' ? k === ix('wick-gap-1') || k === ix('wick-gap-2') : k === ix(next);
  for (let k = 0; k < 160; k++) {
    const lid = flingTarget(s, withShortcuts(gap, s.save), t);
    if (ok(lid)) {
      // (She presses as the hook is nearest, the way one aims at it; the chain's lamp at once.)
      const l = gap.lures?.[lid];
      const dist = () =>
        l ? Math.hypot(l.x - (s.player.x + s.player.w / 2), l.y - (s.player.y + s.player.h / 2)) : 0;
      let d0 = dist();
      for (
        let j = 0;
        next !== 'chain' && j < 40 && flingTarget(s, withShortcuts(gap, s.save), t) === lid;
        j++
      ) {
        run(s, hold, 1, ev);
        if (dist() > d0) break;
        d0 = dist();
      }
      return true;
    }
    run(s, hold, 1, ev);
    if (s.player.grounded && k > 4) return false;
  }
  return false;
}

describe("the firefly's flight (r13, moment 4)", () => {
  it('without the glide nothing perches and the hooks stay dark', () => {
    const s = at('cn-gap', 4000, 1344, ['wallJump']);
    run(s, 0, 30);
    expect(s.kit.firefly.pass).toBe(-1);
    for (const h of HOOKS) expect(s.lures.hp[ix(h)]).toBe(0);
  });

  it('the high line: perched, the alarm on the shelf, six hooks kindled in order as she flings them, into the nest; the call; gone', () => {
    const s = at('cn-gap', 4300, 1344);
    const ev: SimEvent[] = [];
    run(s, 0, 5, ev);
    // Perched, its hook lit.
    expect(s.kit.firefly.beat).toBe(0);
    expect(s.lures.hp[ix('hook-1')]).toBeGreaterThan(0);
    // On the shelf: the alarm, then it bolts.
    run(s, L, 40, ev);
    run(s, 0, 50, ev);
    expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'start')).toBe(true);
    // Under the first hook, a jump into its reach.
    for (let k = 0; k < 120 && Math.abs(s.player.x + s.player.w / 2 - 4150) > 12; k++)
      run(s, s.player.x + s.player.w / 2 < 4150 ? R : L, 1, ev);
    let n = 0;
    while (flingTarget(s, withShortcuts(gap, s.save), t) !== ix('hook-1') && n++ < 40) run(s, J, 1, ev);
    expect(flingTarget(s, withShortcuts(gap, s.save), t)).toBe(ix('hook-1'));
    // The S: up, up, west, down-west, down-east, down-west to the chain; up-west into the roost's mouth.
    const plan: Array<[number, string]> = [
      [U, 'hook-2'],
      [U, 'hook-3'],
      [L, 'hook-4'],
      [D | L, 'hook-5'],
      [D | R, 'hook-6'],
      [D | L, 'chain'],
    ];
    for (const [aim, next] of plan) {
      expect(fling(s, aim, next, ev)).toBe(true);
      // (Each hook is lit by the time she reaches it: the firefly is ahead.)
      if (next !== 'chain') expect(s.lures.hp[ix(next)]).toBeGreaterThan(0);
    }
    for (let i = 0; i < 4; i++) run(s, U | L | B, 1, ev);
    run(s, U | L, 1, ev);
    run(s, L, 80, ev);
    // In the pocket (its shelf, 2,944-3,136 x 1,216).
    expect(s.player.y + s.player.h).toBe(1216);
    const kindled = ev.filter((q) => q.type === 'fireflyKindle').map((q) => (q as Of<'fireflyKindle'>).lure);
    expect(kindled).toEqual(HOOKS);
    for (let f = 0; f < 900 && !ev.some((q) => q.type === 'fireflyHide'); f++) run(s, 0, 1, ev);
    const phases = ev.filter((q) => q.type === 'fireflyChase').map((q) => (q as Of<'fireflyChase'>).phase);
    expect(phases).toContain('nest');
    expect(phases).toContain('call');
    expect(phases.at(-1)).toBe('gone');
    expect(s.kit.firefly.pass).toBe(-1);
    // Out and back in: every hook burns (springboards now).
    const s2 = at('cn-gap', 4000, 1344, CG, [...s.save.flags]);
    run(s2, 0, 3);
    for (const h of HOOKS) expect(s2.lures.hp[ix(h)]).toBeGreaterThan(0);
  });

  it('she hangs back on the shelf: it waits for her at a stop, in her frame (never out of it 4 s)', () => {
    for (const [vw, vh] of [
      [1920, 1080],
      [1920, 1200],
      [2560, 1080],
    ] as const) {
      const s = at('cn-gap', 4300, 1344);
      const ev: SimEvent[] = [];
      run(s, L, 10, ev);
      const ct = cameraFor(gap);
      const cam = createCamera(s, gap, ct, vw, vh);
      let out = 0;
      let worst = 0;
      // She walks in onto the shelf and stands there (the low line, or a miss put back on it): it waits at a stop.
      for (let f = 0; f < 600; f++) {
        run(s, f < 40 ? L : 0, 1, ev);
        stepCamera(cam, s, gap, ct);
        const v = lerpCamera(cam, cam, 1);
        const ff = s.kit.firefly;
        const z = v.zoom;
        const inFrame =
          ff.pass >= 0 && Math.abs(ff.x - v.x) < vw / 2 / z - 40 && Math.abs(ff.y - v.y) < vh / 2 / z - 40;
        out = inFrame ? 0 : out + 1;
        worst = Math.max(worst, out);
      }
      expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'wait')).toBe(true);
      expect(s.kit.firefly.pass).toBeGreaterThanOrEqual(0);
      expect(worst).toBeLessThan(240);
    }
  });
});

describe('the trap is set (r13, moment 5)', () => {
  it('hung empty, the cage fills one moth at a time over 3 s (it glances until full); full, the den stirs', () => {
    const s = at('cn-tunnel', 7300, 1856, CG, ['cn-tunnel-clear']);
    const tun = getRoom('cn-tunnel');
    const k = (tun.lures ?? []).findIndex((l) => l.id === 'trap-warn');
    const ev: SimEvent[] = [];
    s.enemies.length = 0;
    for (let f = 0; f < 400 && !ev.some((q) => q.type === 'fireflyHang'); f++) run(s, 0, 1, ev);
    run(s, 0, 2, ev);
    expect(s.lures.hp[k]).toBeGreaterThan(0);
    expect(s.lures.fill?.[k]).toBeLessThan(5);
    // (Her input is held while the firefly comes and hangs it.)
    for (let f = 0; f < 120 && s.kit.story > 0; f++) run(s, 0, 1, ev);
    expect(s.lures.fill?.[k]).toBeLessThan(40);
    // A cut while it fills glances.
    placePlayer(s, 7552, 1632, t, withShortcuts(tun, s.save), []);
    run(s, U | A, 1, ev);
    run(s, U, 12, ev);
    expect(ev.some((q) => q.type === 'lureGuarded' && q.id === 'trap-warn')).toBe(true);
    run(s, 0, 200, ev);
    const fills = ev.filter((q) => q.type === 'trapFill') as Of<'trapFill'>[];
    expect(fills.length).toBe(40);
    expect(fills.at(-1)?.n).toBe(40);
    expect(ev.some((q) => q.type === 'denStir')).toBe(true);
    // Full, it takes cuts.
    const ev2: SimEvent[] = [];
    run(s, U | A, 1, ev2);
    run(s, U, 12, ev2);
    expect(ev2.some((q) => q.type === 'lureHit' && q.id === 'trap-warn')).toBe(true);
  });
});

describe('moonlight for two (r13, moment 3)', () => {
  it('with her wings, standing still by the kin 2 s: `kinSit`, once; not while walking', () => {
    const crown = getRoom('cn-crown');
    const sit = crown.sits?.[0];
    expect(sit?.id).toBe('kin-sit');
    expect(crown.marks?.tatter?.sit?.r).toBe(sit?.r);
    expect(crown.camera?.zones?.find((z) => z.id === 'crown-sit')?.after).toBe('cn-kin-sat');
    // (The sit is in the glade: she has her wings there.) Walking about: nothing; still: after 2 s.
    const s = at('cn-crown', sit?.x ?? 0, sit?.y ?? 0, CG, ['cn-crown-wings']);
    const ev: SimEvent[] = [];
    for (let f = 0; f < 200; f++) run(s, f % 30 < 15 ? L : R, 1, ev);
    expect(ev.some((q) => q.type === 'kinSit')).toBe(false);
    placePlayer(s, sit?.x ?? 0, sit?.y ?? 0, t, withShortcuts(crown, s.save), []);
    run(s, 0, 150, ev);
    expect(ev.filter((q) => q.type === 'kinSit').length).toBe(1);
    expect(s.save.flags).toContain('cn-kin-sat');
    expect(run(s, 0, 300).some((q) => q.type === 'kinSit')).toBe(false);
  });
});

describe("the opening's river (r13, review r12 #6)", () => {
  it("the river's tail waits for her at the promise: a flag there, 30 s at most", () => {
    const hatch = getRoom('cn-hatch');
    const open = hatch.marks?.stage?.open;
    expect(open?.tailFlag).toBe('cn-promise');
    expect(open?.hatchTail).toBe(1800);
    const tr = hatch.triggers?.find((q) => q.sets === 'cn-promise');
    expect(tr).toBeDefined();
    const z = hatch.camera?.zones?.find((q) => q.id === 'promise');
    expect(tr?.x).toBe(z?.x);
  });
});
