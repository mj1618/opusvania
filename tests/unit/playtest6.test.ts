import { describe, expect, it } from 'vitest';
import { createCamera, stepCamera } from '../../src/render/camera/index';
import { VIEW_H, VIEW_W } from '../../src/render/contract';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import type { EnemySpawn } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, hopOnto, newSim, type Sim } from './helpers';

/**
 * Playtest 6 (memory/enemies.md, goal.md): taking the ember is safe, as kindling is; the lampwings of
 * the high route and the rise; the ember's socket and the bud on the summit; a ram that does not
 * run in under a doorway. (The lamp's small sanctuary: lamps.test.ts; burr-root's arrivals:
 * critical-path.test.ts; two tells a fight: naive-pilot.test.ts.)
 */
const G = defaultTuning.goal;
const P = defaultTuning.pickups;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const picks = GROVE.pickups ?? [];
const ember = picks.find((p) => p.id === 'great-ember') as { x: number; y: number };
const emberIx = picks.findIndex((p) => p.id === 'great-ember');
const islands = GROVE.solids.filter((r) => r.tag === 'floating').slice(0, 3);
const f3 = islands[2] as (typeof islands)[number];
const foe = (s: Sim, id: string) => {
  const e = s.state.enemies.find((q) => q.id === id);
  if (!e) throw new Error(`no ${id}`);
  return e;
};
const idle = (s: Sim, n: number) => {
  for (let f = 0; f < n; f++) step(s.state, 0, s.tuning, s.scene, s.events);
};

describe('taking the ember is a ceremony: nothing may hurt her in it, nor for a beat after', () => {
  it('the ember hangs over F3 and takes 54 frames to reach her', () => {
    expect([ember.x, ember.y]).toEqual([1500, 650]);
    expect(ember.x).toBeGreaterThan(f3.x);
    expect(ember.x).toBeLessThan(f3.x + f3.w);
    expect(P.greatFrames).toBe(54);
    expect(G.keyCalmPx).toBe(600);
    expect(G.keyCalmFrames).toBe(60);
  });

  it('lamp-f3 already in its dive at her as she touches the ember (playtest 6: hit in two of three captures): it gives up, and she is untouched for the 54 frames and 60 more', () => {
    let staged = 0;
    for (let k = 0; k < 40; k++) {
      const s = newSim();
      idle(s, k * 13);
      // She stands on F3 under it, short of the ember, until it has told and commits.
      s.place(f3.x + 60, f3.y);
      let dived = false;
      for (let f = 0; f < 400 && !dived; f++) {
        step(s.state, 0, s.tuning, s.scene, s.events);
        dived = foe(s, 'lamp-f3').mode === 'dive';
      }
      if (!dived) continue;
      staged++;
      // A few frames into the dive she steps under the ember (the dive is at where she stood, beside it).
      idle(s, 3 + (k % 9));
      s.state.player.invuln = 0;
      s.place(ember.x - 16, f3.y);
      const from = s.events.length;
      step(s.state, 0, s.tuning, s.scene, s.events);
      expect(of(s.events.slice(from), 'pickupWake').map((e) => e.id)).toContain('great-ember');
      for (let f = 0; f < P.greatFrames + G.keyCalmFrames - 1; f++) {
        step(s.state, 0, s.tuning, s.scene, s.events);
        // Every living creature near her is calmed for as long as it lasts.
        expect(foe(s, 'lamp-f3').calm, `start ${k}, frame ${f}`).toBeGreaterThan(0);
      }
      const ev = s.events.slice(from);
      expect(of(ev, 'hurt'), `start ${k}`).toEqual([]);
      expect(of(ev, 'lanternKey')).toHaveLength(1);
      expect(s.state.pickups.timers[emberIx]).toBe(-1);
      expect(of(ev, 'enemyGiveUp').filter((e) => e.id === 'lamp-f3' && e.cause === 'calm')).toHaveLength(1);
      // Calmed, it tells nothing and dives at nothing.
      expect(of(ev, 'enemyNotice').filter((e) => e.id === 'lamp-f3')).toEqual([]);
      expect(of(ev, 'enemyDive').filter((e) => e.id === 'lamp-f3')).toEqual([]);
    }
    expect(staged).toBeGreaterThan(20);
  });

  it('the real approach, 30 start times: up the islands, onto the ember and standing there: no hit from the step it wakes until 60 frames after it is hers', () => {
    for (let k = 0; k < 30; k++) {
      const s = newSim();
      idle(s, k * 17);
      s.place(200, 1088);
      // (The bank's burrback and the glade's lampwing are the way there, not this test.)
      s.state.player.invuln = 1e9;
      for (const r of islands) expect(hopOnto(s, r), `start ${k}`).toBeGreaterThanOrEqual(0);
      s.state.player.invuln = 0;
      let woke = -1;
      let hers = -1;
      for (let f = 0; f < 400 && (hers < 0 || f < hers + G.keyCalmFrames); f++) {
        const from = s.events.length;
        const dx = ember.x - feet(s).x;
        s.run(Math.abs(dx) <= 8 ? '.1' : dx > 0 ? 'R1' : 'L1');
        const ev = s.events.slice(from);
        if (woke < 0 && of(ev, 'pickupWake').some((e) => e.id === 'great-ember')) woke = f;
        if (hers < 0 && of(ev, 'lanternKey').length > 0) hers = f;
        if (woke >= 0 && f > woke)
          expect(of(ev, 'hurt'), `start ${k}, frame ${f - woke} of the take`).toEqual([]);
      }
      expect(woke, `start ${k}`).toBeGreaterThanOrEqual(0);
      expect(hers - woke, `start ${k}`).toBe(P.greatFrames);
    }
  });

  it('on F3’s landing (its west end) no dive comes with less than the whole 36-frame tell, and the whole tell is on screen', () => {
    const T = defaultTuning.lampwing;
    let dives = 0;
    for (let k = 0; k < 30; k++) {
      const s = newSim();
      idle(s, k * 19);
      // She arrives as a player does (a hop up from F2) and stands where she landed.
      s.place((islands[1]?.x ?? 0) + 180, islands[1]?.y ?? 0);
      s.state.player.invuln = 1e9;
      const cam = createCamera(s.state, GROVE);
      const tell = new Map<string, number>();
      const seen = new Map<string, boolean>();
      let landed = false;
      for (let f = 0; f < 420; f++) {
        const from = s.events.length;
        const p = s.state.player;
        if (!landed) {
          // A hop as a first-timer makes it: run, jump held through the rise, let go over F3's end.
          const over = feet(s).x >= f3.x + 24;
          s.run(over ? '.1' : p.grounded || p.vy < 0 ? 'R+J1' : 'R1');
          landed = s.state.player.grounded && feet(s).y === f3.y;
        } else s.run('.1');
        stepCamera(cam, s.state, GROVE);
        for (const e of s.events.slice(from)) {
          if (e.type === 'enemyNotice') {
            tell.set(e.id, f);
            seen.set(e.id, true);
          } else if (e.type === 'enemyDive' && e.id === 'lamp-f3') {
            dives++;
            expect(f - (tell.get(e.id) ?? -999), `start ${k}`).toBe(T.curiousFrames);
            expect(seen.get(e.id), `start ${k}: its tell left the screen`).toBe(true);
          }
        }
        // While it tells, its whole box is in the picture.
        const w = foe(s, 'lamp-f3');
        if (w.mode === 'curious') {
          const inView =
            w.x >= cam.x && w.x + w.w <= cam.x + VIEW_W && w.y >= cam.y && w.y + w.h <= cam.y + VIEW_H;
          if (!inView) seen.set(w.id, false);
        }
      }
      expect(landed, `start ${k}`).toBe(true);
      expect(feet(s).x, `start ${k}`).toBeLessThan(f3.x + 130);
    }
    expect(dives).toBeGreaterThan(20);
  });
});

describe('lamp-ledge is an encounter on the high route (it saw no one on F5 or the high ledge at 260 px)', () => {
  const f5 = GROVE.solids.filter((r) => r.tag === 'floating')[4] as (typeof GROVE.solids)[number];
  const ledge = GROVE.solids.find((r) => r.tag === 'ledge') as (typeof GROVE.solids)[number];
  const spawn = (GROVE.enemies ?? []).find((e) => e.id === 'lamp-ledge') as EnemySpawn;

  it('its sight is 400: from its home it reaches F5’s east end and the ledge’s landing, not burr-ledge’s patch', () => {
    expect(spawn).toMatchObject({ x: 2700, y: 150, radius: 90, sight: 400 });
    const d = (x: number, y: number) => Math.hypot(x - spawn.x, y - 40 - spawn.y);
    expect(d(f5.x + f5.w - 30, f5.y)).toBeLessThan(400);
    expect(d(ledge.x + 20, ledge.y)).toBeLessThan(400);
    expect(d(ledge.x + ledge.w - 20, ledge.y)).toBeLessThan(400);
    expect(d(3090, ledge.y)).toBeGreaterThan(400);
  });

  it('standing on F5’s east end, or anywhere on the high ledge, she is noticed, and the tell is on screen before the dive', () => {
    for (const [x, y] of [
      [f5.x + f5.w - 30, f5.y],
      [ledge.x + 20, ledge.y],
      [ledge.x + ledge.w - 20, ledge.y],
    ] as const) {
      for (let k = 0; k < 8; k++) {
        const s = newSim();
        idle(s, k * 41);
        s.place(x, y);
        s.state.player.invuln = 1e9;
        const cam = createCamera(s.state, GROVE);
        let noticed = -1;
        let dived = -1;
        for (let f = 0; f < 600 && dived < 0; f++) {
          const from = s.events.length;
          s.run('.1');
          stepCamera(cam, s.state, GROVE);
          const ev = s.events.slice(from);
          if (noticed < 0 && of(ev, 'enemyNotice').some((e) => e.id === 'lamp-ledge')) noticed = f;
          if (of(ev, 'enemyDive').some((e) => e.id === 'lamp-ledge')) dived = f;
          const w = foe(s, 'lamp-ledge');
          if (w.mode === 'curious')
            expect(
              w.x >= cam.x && w.x + w.w <= cam.x + VIEW_W && w.y >= cam.y && w.y + w.h <= cam.y + VIEW_H,
              `at ${x},${y}, start ${k}: its tell is off screen`,
            ).toBe(true);
        }
        expect(noticed, `at ${x},${y}, start ${k}`).toBeGreaterThanOrEqual(0);
        expect(dived - noticed, `at ${x},${y}, start ${k}`).toBe(defaultTuning.lampwing.curiousFrames);
      }
    }
  });
});

describe('wing-rise and lamp-rise: its dive never ends at the lamp’s post', () => {
  const lamp = (GROVE.lamps ?? []).find((l) => l.id === 'lamp-rise') as { x: number; y: number };
  const lampIx = (GROVE.lamps ?? []).findIndex((l) => l.id === 'lamp-rise');
  const wing = (GROVE.enemies ?? []).find((e) => e.id === 'wing-rise') as EnemySpawn;
  const burr = (GROVE.enemies ?? []).find((e) => e.id === 'burr-rise') as EnemySpawn;

  it('lamp-rise stands 100 px further west (4760): 154 px before burr-rise’s patch, 330 px from wing-rise’s home', () => {
    expect([lamp.x, lamp.y]).toEqual([4760, 1088]);
    expect([wing.x, wing.y, wing.radius]).toEqual([5090, 900, 50]);
    expect(burr.x - (burr.radius ?? 0) - 26 - lamp.x).toBeGreaterThanOrEqual(150);
    expect(Math.hypot(wing.x - lamp.x, wing.y - (lamp.y - 40))).toBeGreaterThan(
      defaultTuning.lampwing.noticePx + (wing.radius ?? 0),
    );
  });

  it('one who stands at the lamp, dark or lit, for 20 s is never noticed by wing-rise nor braced at by burr-rise', () => {
    const s = newSim();
    s.state.pickups.count = 8;
    s.place(lamp.x, lamp.y);
    const from = s.events.length;
    idle(s, 1200);
    const ev = s.events.slice(from);
    expect(s.state.goal.lamps[lampIx]?.lit).toBe(true);
    expect(of(ev, 'enemyNotice').filter((e) => e.id === 'wing-rise')).toEqual([]);
    expect(of(ev, 'enemyWindup')).toEqual([]);
    expect(of(ev, 'hurt')).toEqual([]);
  });

  it('where she fights burr-rise it does come: its dives end over the rise’s open ground, 100 px and more from the post', () => {
    const s = newSim();
    s.state.player.invuln = 1e9;
    const stalls: number[] = [];
    for (const x of [4930, 5000, 5080]) {
      s.place(x, 1088);
      const from = s.events.length;
      idle(s, 500);
      for (const e of of(s.events.slice(from), 'enemyStall')) if (e.id === 'wing-rise') stalls.push(e.x);
    }
    expect(stalls.length).toBeGreaterThanOrEqual(2);
    for (const x of stalls) expect(x - lamp.x).toBeGreaterThanOrEqual(100);
  });
});

describe('the summit: the bud and the ember’s socket no longer share the lantern’s side', () => {
  const lantern = (GROVE.lanterns ?? []).find((l) => l.id === 'lantern-crown') as { x: number; y: number };
  const bud = picks.find((p) => p.id === 'great-crown') as { x: number; y: number };
  const bough = GROVE.oneWays.find((o) => o.y === lantern.y && o.x >= 3712) as { x: number; w: number };

  it('great-crown hangs 84 px east of the lantern’s foot, over the bough (it was 36 px west of it, on trunk B’s top)', () => {
    expect([lantern.x, lantern.y]).toEqual([3684, 192]);
    expect([bud.x, bud.y]).toEqual([3768, 134]);
    expect(bud.x).toBeGreaterThan(bough.x);
    expect(bud.x).toBeLessThan(bough.x + bough.w);
    const pod = (GROVE.pods ?? []).find((p) => p.id === 'pod-bough') as { x: number };
    expect(pod.x - bud.x).toBeGreaterThanOrEqual(80);
  });

  it('standing at the lantern leaves it hanging; a few steps east along the bough it is hers', () => {
    const s = newSim({ ...GROVE, enemies: [] });
    const ix = picks.findIndex((p) => p.id === 'great-crown');
    s.place(lantern.x, lantern.y);
    idle(s, 90);
    expect(s.state.pickups.timers[ix]).toBe(0);
    s.run('R12 .70');
    expect(s.state.pickups.timers[ix]).toBe(-1);
    expect(feet(s).y).toBe(lantern.y);
  });
});

describe('a ram does not run in under a doorway, nor does a shove carry it there', () => {
  // A lintel 112 px over the floor (the doorway under trunk A), open ground east of it.
  const door = { tag: 'trunk' as const, x: 1000, y: 0, w: 128, h: 800 - 112 };
  // (Its own walk keeps out of the doorway: a range, as burr-shaft has.)
  const burr = (x: number): EnemySpawn => ({ id: 'b', kind: 'burrback', x, y: 800, facing: -1, radius: 60 });
  const sc = (x: number) => ({ ...flatScene({ solids: [door] }), enemies: [burr(x)] });

  it('its ram at one who stands by the mouth ends at the mouth (`ledge`), with its length unspent', () => {
    const s = newSim(sc(1290));
    s.place(1200, 800);
    s.state.player.invuln = 1e9;
    let lo = 9e9;
    const from = s.events.length;
    for (let f = 0; f < 400; f++) {
      step(s.state, 0, s.tuning, s.scene, s.events);
      lo = Math.min(lo, s.state.enemies[0]?.x ?? 0);
    }
    const ev = s.events.slice(from);
    expect(of(ev, 'enemyWindup').length).toBeGreaterThanOrEqual(1);
    expect(of(ev, 'enemyRecover')[0]?.cause).toBe('ledge');
    expect(lo).toBe(door.x + door.w);
  });

  it('cut toward the doorway from the east, it is shoved to the mouth and no further (the fight stays where it can brace at her)', () => {
    const s = newSim(sc(1290));
    s.tuning.burrback.strikePx = 0;
    const e = s.state.enemies[0];
    if (!e) throw new Error('no burrback');
    s.state.player.invuln = 1e9;
    let lo = 9e9;
    let cuts = 0;
    for (let n = 0; n < 3; n++) {
      // It stands a few px from the mouth; she is east of it, facing it, a blade's length off.
      e.x = door.x + door.w + 10;
      s.place(e.x + e.w + 50, 800);
      cuts += of(s.run('L1 .1 L+A1'), 'enemyHit').length;
      for (let f = 0; f < 40; f++) {
        cuts += of(s.run('.1'), 'enemyHit').length;
        lo = Math.min(lo, e.x);
      }
    }
    expect(cuts).toBeGreaterThanOrEqual(2);
    expect(lo).toBe(door.x + door.w);
  });
});
