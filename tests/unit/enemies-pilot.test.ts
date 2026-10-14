import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim } from './helpers';

/**
 * Proof with the real controller and real inputs that every burrback in the grove can be killed
 * without being touched, that none of them blocks a route, and that losing all four lights ends in
 * a re-form on safe ground with play going on.
 */
const { jump: J, attack: A } = ActionBit;
const bit = (d: number) => (d > 0 ? ActionBit.right : d < 0 ? ActionBit.left : 0);
// The burrbacks (first in the scene's list; the lampwings are piloted in lampwing-pilot.test.ts).
const list = (GROVE.enemies ?? []).filter((e) => e.kind === 'burrback');
const burrs = (s: Sim) => s.state.enemies.slice(0, list.length);
const H = defaultTuning.health;
const B = defaultTuning.burrback;
const count = (ev: SimEvent[], type: string) => ev.filter((e) => e.type === type).length;

/** Stations: feet positions on each burrback's own surface, a little way off, by enemy id. */
const STATIONS: Record<string, [x: number, y: number]> = {
  'burr-bank': [40, 1088],
  'burr-path': [1900, 1280],
  'burr-ledge': [2880, 448],
  'burr-root': [4200, 1280],
  'burr-shaft': [3360, 1280],
  'burr-rise': [4780, 1088],
};

/**
 * Fights enemy `i` from wherever she stands: keeps a blade's length away, faces it and cuts when
 * it is in reach; when it braces she waits out the tell and hops over it as it rams (it passes
 * under her), then cuts it while it stands spent. Returns the frames it took, or -1.
 */
function fight(s: Sim, i: number, maxFrames = 900): number {
  let prev = 0;
  let over = 0;
  let hop = 0;
  for (let f = 0; f < maxFrames; f++) {
    const e = s.state.enemies[i];
    if (!e || e.mode === 'dead') return f;
    const p = s.state.player;
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    const gap = Math.abs(dx) - e.w / 2 - p.w / 2;
    let m = 0;
    const ram = e.mode === 'charge' || (e.mode === 'windup' && e.timer <= 6);
    if (!ram) over = 0;
    else if (over === 0) {
      over = Math.sign(dx) || 1;
      // (A short press: under the branch a full jump would land her on it.)
      hop = 10;
    }
    // (A hop carried her off its ground, into the pool below it: back up first.)
    const below = p.y + p.h > e.y + e.h + 8;
    if (below && !ram) {
      m = bit(dx) | (p.grounded ? ((prev & J) === 0 ? J : 0) : p.vy < 0 ? J : 0);
    } else if (ram && hop > 0 && (p.grounded ? (prev & J) === 0 : true)) {
      m = J | bit(over);
      hop--;
    } else if (ram) m = bit(over);
    else if (e.mode === 'windup') m = 0;
    else if (gap > 78) m = bit(dx);
    else if (gap < 34 && e.mode !== 'hurt' && e.mode !== 'recover') m = bit(-dx);
    else if ((prev & A) === 0) m = (p.facing === Math.sign(dx) ? 0 : bit(dx)) | A;
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  return -1;
}

describe('burrbacks in the grove, piloted', () => {
  it('every one can be killed from its own surface with forward cuts, without taking a hit', () => {
    const s = newSim();
    let glints = 0;
    for (let i = 0; i < list.length; i++) {
      const id = list[i]?.id as string;
      const st = STATIONS[id];
      if (!st) throw new Error(`no station for ${id}`);
      s.place(st[0], st[1]);
      expect(feet(s), `station of ${id}`).toEqual({ x: st[0], y: st[1] });
      // (burr-rise is fought under a lampwing: that pair is the careful pilot's, naive-pilot.test.ts.
      // Here the burrback alone.)
      for (const w of s.state.enemies)
        if (id === 'burr-rise' && w.id === 'wing-rise') Object.assign(w, { mode: 'dead', hp: 0, gone: true });
      const from = s.events.length;
      expect(fight(s, i), id).toBeGreaterThan(0);
      // (She may be in the air from the cut that killed it.)
      for (let f = 0; f < 60 && !s.state.player.grounded; f++) step(s.state, 0, s.tuning, s.scene, s.events);
      const die = s.events.slice(from).find((e) => e.type === 'enemyDie' && e.id === id);
      expect(die, id).toBeDefined();
      // (At burr-rise the lampwing over it dives at her meanwhile, and may fall to the same cuts.)
      for (const d of s.events.slice(from)) if (d.type === 'enemyDie') glints += d.value;
      expect(s.state.player.hp, `${id} hurt her`).toBe(H.max);
      expect(s.state.player.grounded, `${id}: she left its surface`).toBe(true);
      expect(feet(s).y).toBe(st[1]);
    }
    expect(burrs(s).every((e) => e.mode === 'dead')).toBe(true);
    expect(count(s.events, 'hurt')).toBe(0);
    for (let f = 0; f < 80; f++) step(s.state, 0, s.tuning, s.scene, s.events);
    expect(burrs(s).every((e) => e.gone && e.spill === 0)).toBe(true);
    // Their glints all reached the counter, each exactly once (pods she happened to cut pay too).
    const fromEnemies = s.events.filter((e) => e.type === 'pickup' && e.enemy).length;
    expect(fromEnemies).toBe(glints);
    expect(glints).toBeGreaterThanOrEqual(list.length * defaultTuning.burrback.value);
  });

  it('the stations on high surfaces are reached by the route pilots, burrbacks and all', () => {
    const s = newSim();
    const f = GROVE.solids.filter((r) => r.tag === 'floating');
    const ledges = GROVE.solids.filter((r) => r.tag === 'ledge');
    for (const r of [GROVE.solids[0], ...f.slice(0, 5), ledges[0]])
      expect(hopOnto(s, r as never), `onto ${r?.x},${r?.y}`).toBeGreaterThan(0);
    expect(
      fight(
        s,
        list.findIndex((e) => e.id === 'burr-ledge'),
      ),
    ).toBeGreaterThan(0);
    s.place(3800, 1280);
    const root = GROVE.solids.find((r) => r.tag === 'root' && r.x === 3968);
    // (No creature walks the far bluff's top: no patrol could clear its 288 px of the jump from F7.)
    const far = GROVE.solids.find((r) => r.tag === 'ground' && r.x === 5472);
    for (const r of [root, GROVE.oneWays[1], ...f.slice(5), far])
      expect(hopOnto(s, r as never), `onto ${r?.x},${r?.y}`).toBeGreaterThan(0);
    // Nothing on the way cost her everything: no fade was needed to get there.
    expect(count(s.events, 'fade')).toBe(0);
  });

  it('none blocks a route: each is cleared by one plain jump, both ways, without a scratch', () => {
    for (let i = 0; i < list.length; i++) {
      for (const dir of [-1, 1]) {
        // (Burrbacks only: the jump over burr-ledge westward carries on off the ledge's end into
        // lamp-ledge's air, which is that one's test.)
        const s = newSim({ ...GROVE, enemies: list });
        // Wait until it walks toward a spot she can stand on, then run at it from there and jump.
        let ok = false;
        for (let f = 0; f < 2400 && !ok; f++) {
          step(s.state, 0, s.tuning, s.scene, s.events);
          const e = s.state.enemies[i];
          if (!e) throw new Error('no enemy');
          // A run-up of 170 px where there is room, 120 where its patrol hugs a wall.
          const y = e.y + e.h;
          let from = 0;
          let standable = false;
          for (const run of [170, 120]) {
            from = e.x + e.w / 2 - dir * run;
            const q = newSim();
            q.place(from, y);
            standable = feet(q).x === from && feet(q).y === y && q.state.player.grounded;
            if (standable) break;
          }
          if (e.mode !== 'walk' || e.facing !== -dir || !standable) continue;
          s.place(from, y);
          let prev = 0;
          for (let k = 0; k < 70; k++) {
            const p = s.state.player;
            const gap = Math.abs(e.x + e.w / 2 - feet(s).x);
            // Once she is down on the far side she stops (what lives further on is another one's test).
            const past = p.grounded && Math.sign(feet(s).x - (e.x + e.w / 2)) === dir && gap > 80;
            let m = past ? 0 : bit(dir);
            if (p.grounded && k < 30 && gap < 110 && (prev & J) === 0) m |= J;
            else if (!p.grounded && p.vy < 0) m |= J;
            step(s.state, m, s.tuning, s.scene, s.events);
            prev = m;
          }
          expect(s.state.player.hp, `${list[i]?.id} from ${dir}`).toBe(H.max);
          expect(Math.sign(feet(s).x - (e.x + e.w / 2)), `${list[i]?.id} from ${dir}`).toBe(dir);
          ok = true;
        }
        expect(ok, `${list[i]?.id} from ${dir}: never had room`).toBe(true);
      }
    }
  });

  it('four hits: she fades, re-forms on safe ground with 2 lights, and play continues', () => {
    const s = newSim();
    // Safe ground first: the far side of the pool from burr-path, then over the pool to meet it.
    s.place(1400, 1280);
    for (let f = 0; f < 40; f++) step(s.state, 0, s.tuning, s.scene, s.events);
    expect([s.state.player.safeX, s.state.player.safeY]).toEqual([1400, 1280]);
    const i = list.findIndex((e) => e.id === 'burr-path');
    const hurts: number[] = [];
    let reform: Extract<SimEvent, { type: 'reform' }> | undefined;
    let prev = 0;
    for (let f = 0; f < 3000 && !reform; f++) {
      const p = s.state.player;
      const e = s.state.enemies[i];
      if (!e) throw new Error('no enemy');
      // Walk straight into it, every time; jump the pool on the way.
      const dx = e.x + e.w / 2 - feet(s).x;
      let m = bit(dx);
      const atPool = feet(s).x > 1460 && feet(s).x < 1900;
      if (atPool && p.grounded && (prev & J) === 0) m |= J;
      else if (atPool && !p.grounded && p.vy < 0) m |= J;
      const from = s.events.length;
      step(s.state, m, s.tuning, s.scene, s.events);
      prev = m;
      for (const ev of s.events.slice(from)) {
        if (ev.type === 'hurt') hurts.push(ev.hp);
        if (ev.type === 'reform') reform = ev;
      }
    }
    expect(hurts).toEqual([3, 2, 1, 0]);
    expect(count(s.events, 'fade')).toBe(1);
    if (!reform) throw new Error('never re-formed');
    const at = { x: reform.x, y: reform.y };
    const p = s.state.player;
    expect([p.hp, p.grounded, p.faded, p.stagger]).toEqual([H.reformHp, true, 0, 0]);
    // (She has taken one step since: the held direction counts again at once.)
    expect(Math.abs(feet(s).x - reform.x)).toBeLessThanOrEqual(10);
    expect(feet(s).y).toBe(reform.y);
    // Safe ground: a solid that is not the pool, well clear of every living enemy (all back home).
    const under = GROVE.solids.find((r) => r.y === reform?.y && reform.x >= r.x && reform.x < r.x + r.w);
    expect(under?.tag).toBe('ground');
    burrs(s).forEach((e, k) => {
      // (One step of walking since they were put back.)
      expect(Math.abs(e.x + e.w / 2 - (list[k]?.x ?? 0))).toBeLessThanOrEqual(2);
      expect([e.y + e.h, e.hp, e.stride <= 2]).toEqual([list[k]?.y, list[k]?.hp ?? B.hp, true]);
      expect(Math.hypot(e.x + e.w / 2 - at.x, e.y + e.h - at.y)).toBeGreaterThanOrEqual(H.safeEnemyPx);
    });
    // Play goes on: she goes back and kills it.
    for (let f = 0; f < 600 && Math.abs(feet(s).x - 1900) > 12; f++) {
      const q = s.state.player;
      const dx = 1900 - feet(s).x;
      const atPool = feet(s).x > 1460 && feet(s).x < 1880;
      let m = bit(dx);
      if (dx > 0 && atPool && q.grounded && (prev & J) === 0) m |= J;
      else if (atPool && !q.grounded && q.vy < 0) m |= J;
      step(s.state, m, s.tuning, s.scene, s.events);
      prev = m;
    }
    expect(fight(s, i)).toBeGreaterThan(0);
    expect(s.state.enemies[i]?.mode).toBe('dead');
  });

  it('a hit at a ledge or by the pool can drop her, never trap her or take her out of the scene', () => {
    // Thrown off the high ledge by burr-ledge, into the pool by burr-path.
    for (const [id, x, y, dir] of [
      ['burr-ledge', 2850, 448, 1],
      ['burr-path', 1900, 1280, 1],
    ] as const) {
      const s = newSim();
      const i = list.findIndex((e) => e.id === id);
      s.place(x, y);
      let hurt = false;
      for (let f = 0; f < 1500 && !hurt; f++) {
        const e = s.state.enemies[i];
        if (!e) throw new Error('no enemy');
        const from = s.events.length;
        step(
          s.state,
          bit((e.x + e.w / 2 - feet(s).x) * (Math.abs(e.x - x) < 200 ? 1 : 0) || dir),
          s.tuning,
          s.scene,
          s.events,
        );
        hurt = s.events.slice(from).some((ev) => ev.type === 'hurt');
      }
      expect(hurt, id).toBe(true);
      for (let f = 0; f < 120; f++) {
        step(s.state, 0, s.tuning, s.scene, s.events);
        const p = s.state.player;
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(GROVE.width);
        expect(p.y + p.h).toBeLessThanOrEqual(GROVE.height);
      }
      expect(s.state.player.grounded, id).toBe(true);
      // Still in control: she can jump.
      s.run('J1 .5');
      expect(s.state.player.grounded).toBe(false);
    }
  });
});
