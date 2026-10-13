import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemySpawn, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/**
 * The burrback's ram (memory/enemies.md). Two players meet one on open ground:
 *  - the MASHER walks up to it, stands at reach and mashes attack: she must take a hit;
 *  - the READER does the same until it braces (`enemyWindup`), hops over the ram, turns and cuts
 *    it while it stands spent: she must take none, and kill it.
 *
 * `RAM_TRACE=1 npx vitest run tests/unit/burrback-ram.test.ts --disable-console-intercept` prints
 * the timelines.
 */
const { jump: J, attack: A, left: LEFT, right: RIGHT } = ActionBit;
const B = defaultTuning.burrback;
const EN = defaultTuning.enemies;
const FLOOR = 800;
const burr = (x: number, facing: -1 | 1 = -1, id = 'b'): EnemySpawn => ({
  id,
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
const scene = (enemies: EnemySpawn[]): Scene => ({ ...flatScene(), enemies });
const foe = (s: Sim, i = 0) => s.state.enemies[i] as EnemyState;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const trace = (name: string, lines: string[]) => {
  if (process.env.RAM_TRACE) console.log(`--- ${name}\n${lines.join('\n')}`);
};

interface Fight {
  hits: number;
  dead: boolean;
  frames: number;
  blocks: number;
  windups: number;
  lines: string[];
  events: SimEvent[];
}

/**
 * One fight with enemy `i` of the sim. `read` false = the masher; true = the reader. She walks
 * toward it until it is a blade's length ahead, then acts.
 */
function fight(s: Sim, i: number, read: boolean, maxFrames = 900): Fight {
  const lines: string[] = [];
  const from = s.events.length;
  let seen = from;
  let prev = 0;
  let hop = 0;
  let wait = 0;
  let f = 0;
  const say = (what: string) => {
    const e = foe(s, i);
    lines.push(
      `${String(f).padStart(4)}  her ${String(feet(s).x).padStart(5)} hp ${s.state.player.hp}   it ${String(e.x + e.w / 2).padStart(6)} hp ${e.hp} ${e.mode.padEnd(7)} ${what}`,
    );
  };
  for (; f < maxFrames && foe(s, i).mode !== 'dead' && s.state.player.faded === 0; f++) {
    const p = s.state.player;
    const e = foe(s, i);
    const at = feet(s);
    const side = e.x + e.w / 2 < at.x ? -1 : 1;
    const gap = side > 0 ? e.x - (p.x + p.w) : p.x - (e.x + e.w);
    for (; seen < s.events.length; seen++) {
      const ev = s.events[seen] as SimEvent;
      if ('id' in ev && ev.id !== foe(s, i).id) continue;
      if (ev.type === 'enemyWindup') {
        say(`braces (${ev.frames} frames, then ${ev.px} px)`);
        // The reader answers after a person's quarter second.
        if (read) wait = 15;
      } else if (ev.type === 'enemyCharge') say('rams');
      else if (ev.type === 'enemyRecover') say(`spent (${ev.cause})`);
      else if (ev.type === 'enemyBlock') say('her cut glances off');
      else if (ev.type === 'enemyHit') say(`cut: ${ev.hpLeft} of ${ev.hpMax} left`);
      else if (ev.type === 'enemyDie') say('cut down');
      else if (ev.type === 'hurt') say('SHE IS HIT');
      else if (ev.type === 'enemyTurn') say(`turns (${ev.cause})`);
    }
    let m = 0;
    const braced = e.mode === 'windup' || e.mode === 'charge';
    if (read && wait > 0) {
      // Reaction time: she goes on as she was (no new press).
      wait--;
      if (wait === 0) hop = 12;
      m = 0;
    } else if (read && hop > 0) {
      // Over it: a hop toward it (a short press: under a branch a full jump would land her on it).
      m = (side > 0 ? RIGHT : LEFT) | J;
      hop--;
    } else if (read && braced) {
      // Still braced (she is down again, or was never in front): keep off its line.
      m = p.grounded && gap < 60 && (prev & J) === 0 ? J : 0;
    } else if (gap > 70) m = side > 0 ? RIGHT : LEFT;
    else {
      if (p.facing !== side) m |= side > 0 ? RIGHT : LEFT;
      if ((prev & A) === 0) m |= A;
    }
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  for (; seen < s.events.length; seen++) {
    const ev = s.events[seen] as SimEvent;
    if (ev.type === 'enemyDie') say('cut down');
    else if (ev.type === 'hurt') say('SHE IS HIT');
  }
  const ev = s.events.slice(from);
  return {
    hits: of(ev, 'hurt').length,
    dead: foe(s, i).mode === 'dead',
    frames: f,
    blocks: of(ev, 'enemyBlock').length,
    windups: of(ev, 'enemyWindup').length,
    lines,
    events: ev,
  };
}

describe('burrback: the ram', () => {
  it('she stands in front of it within reach: it braces for 26 frames (the tell), rams 180 px, then stands spent', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    const s = newSim(scene([burr(2200)]), t);
    // Out of reach in front: nothing. Behind it, close: nothing.
    s.place(2200 - 26 - B.strikePx - 24, FLOOR);
    expect(of(s.run('.60'), 'enemyWindup')).toHaveLength(0);
    s.place(2300, FLOOR);
    expect(of(s.run('.60'), 'enemyWindup')).toHaveLength(0);
    // In front, in reach.
    s.place(2200 - 26 - B.strikePx - 16, FLOOR);
    const ev = s.run('.1');
    const w = of(ev, 'enemyWindup')[0];
    expect(w).toMatchObject({ dir: -1, frames: B.windupFrames, px: B.chargePx, speed: B.chargeSpeed });
    expect(foe(s)).toMatchObject({ mode: 'windup', braced: true, vx: 0 });
    const x0 = foe(s).x;
    // She steps well away during the tell; it rams its whole length regardless and stops spent.
    const all = s.run('L60');
    expect(foe(s).x).toBe(x0 - B.chargePx);
    expect(of(all, 'enemyCharge')).toHaveLength(1);
    expect(of(all, 'enemyRecover')[0]).toMatchObject({ cause: 'spent', frames: B.recoverFrames });
    expect(foe(s)).toMatchObject({ mode: 'recover', braced: false });
    expect(of(all, 'hurt')).toHaveLength(0);
    // Spent, then cooling: she can stand in front of it and it does not brace again for a while.
    s.place(foe(s).x - 60, FLOOR);
    expect(of(s.run(`.${B.recoverFrames + B.strikeCooldown - 62}`), 'enemyWindup')).toHaveLength(0);
  });

  it('braced, a forward cut from its front glances off (no damage, she is thrown back); from behind and from above it lands', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    const s = newSim(scene([burr(2200)]), t);
    s.place(2110, FLOOR);
    s.run('.2');
    expect(foe(s).mode).toBe('windup');
    const x0 = feet(s).x;
    const ev = s.run('A8');
    expect(of(ev, 'enemyBlock')).toHaveLength(1);
    expect(of(ev, 'enemyBlock')[0]).toMatchObject({ slash: 'fwd', dir: 1, hitstop: EN.blockHitstopFrames });
    expect(of(ev, 'enemyHit')).toHaveLength(0);
    expect(foe(s).hp).toBe(B.hp);
    expect(foe(s).mode).toBe('windup');
    // Thrown back off it: 8 + 7 + ... less the lunge.
    expect(feet(s).x).toBeLessThan(x0 - 10);
    // From behind: a cut lands in full and breaks the windup.
    const b = newSim(scene([burr(2200)]), t);
    b.place(2110, FLOOR);
    b.run('.2');
    b.place(2290, FLOOR);
    const hit = b.run('L1 L+A6');
    expect(of(hit, 'enemyHit')).toHaveLength(1);
    expect(foe(b).mode).toBe('hurt');
    expect(foe(b).braced).toBe(false);
    // From above: a down slash lands and she bounces.
    const c = newSim(scene([burr(2200)]), t);
    c.place(2110, FLOOR);
    c.run('.2');
    c.place(2200, FLOOR - 70);
    const pogo = c.run('D+A4');
    expect(of(pogo, 'enemyHit')).toHaveLength(1);
    expect(c.state.player.vy).toBeLessThan(0);
  });

  it('spent, its touch does nothing (her opening); it is open to every cut and will not brace again for 150 frames after', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    const s = newSim(scene([burr(2200)]), t);
    s.place(2200 - 26 - B.strikePx - 16, FLOOR);
    s.run('.1');
    // She hops the ram and comes down on it.
    for (let f = 0; f < 80 && foe(s).mode !== 'recover'; f++) s.run(foe(s).timer <= 6 ? 'J1' : '.1');
    expect(foe(s).mode).toBe('recover');
    s.place(foe(s).x + 26, FLOOR);
    const ev = s.run(`.${B.recoverFrames - 2}`);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(foe(s).mode).toBe('recover');
    // The moment it walks again its touch counts (she is still standing in it).
    expect(of(s.run('.4'), 'hurt')).toHaveLength(1);
    expect([B.recoverFrames, B.strikeCooldown]).toEqual([45, 150]);
  });

  it('a range of its own: unprovoked it braces only at one inside it; cut from outside, it braces at her anyway; the ram runs its length either way', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    // Its box may be between 2074 and 2326 (`radius` 100); it stands at 2174-2226, facing left.
    const ranged = (): Scene => scene([{ ...burr(2200), radius: 100 }]);
    // Inside its range, in front: it braces, and the ram runs its whole length, out of the range
    // (she has backed off; it walks back in afterwards).
    const a = newSim(ranged(), t);
    a.place(2080, FLOOR);
    const ev = a.run('.1 L60');
    expect(of(ev, 'enemyWindup')[0]).toMatchObject({ px: B.chargePx });
    expect(of(ev, 'enemyRecover')[0]).toMatchObject({ cause: 'spent' });
    expect(foe(a).x).toBe(2174 - B.chargePx);
    // Just outside it, a blade's length from where it stands at its range's end: nothing, however long.
    const b = newSim(ranged(), t);
    foe(b).x = 2074;
    b.place(2040, FLOOR);
    expect(of(b.run('.90'), 'enemyWindup')).toHaveLength(0);
    // She cuts it from there: the blow lands, and as its stagger ends it braces at her and rams
    // out of its range (her cuts glance off meanwhile: mashing loses).
    const c = b.run('A1 .20 A1 .22 A1 .40');
    expect(of(c, 'enemyHit')).toHaveLength(1);
    const w = of(c, 'enemyWindup')[0];
    expect(w).toBeDefined();
    expect(of(c, 'enemyBlock').length).toBeGreaterThanOrEqual(1);
    expect(of(c, 'hurt')).toHaveLength(1);
    expect(of(c, 'enemyRecover')[0]).toMatchObject({ cause: 'touch' });
  });

  it('never braces at one who has no room to jump: under a low ceiling she is safe from the ram (the doorway under trunk A)', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    // A lintel 112 px over the floor (she is 80; the creature 34: a jump there clears 32).
    const lintel = { tag: 'trunk' as const, x: 1900, y: 400, w: 200, h: 288 };
    const s = newSim({ ...flatScene({ solids: [lintel] }), enemies: [burr(2200)] }, t);
    s.place(2070, FLOOR);
    expect(of(s.run('.90'), 'enemyWindup')).toHaveLength(0);
    // Out from under it: it braces at once.
    s.place(2125, FLOOR);
    expect(of(s.run('.2'), 'enemyWindup')).toHaveLength(1);
    expect(B.strikeHeadroomPx).toBeGreaterThan(112);
    // In the grove: the doorway is 112 high, and burr-shaft's range starts 50 px inside the shaft.
    const g = newSim(GROVE);
    const i = (GROVE.enemies ?? []).findIndex((e) => e.id === 'burr-shaft');
    g.place(3290, 1280);
    g.state.player.invuln = 1e9;
    let braced = 0;
    for (let f = 0; f < 1800; f++) {
      const from = g.events.length;
      step(g.state, 0, g.tuning, g.scene, g.events);
      braced += of(g.events.slice(from), 'enemyWindup').filter((e) => e.id === 'burr-shaft').length;
      expect(foe(g, i).x).toBeGreaterThanOrEqual(3378);
    }
    expect(braced).toBe(0);
  });

  it('hit weight: 4 frames of hitstop on a cut (7 on the finisher), it is shoved 32 px, she is pushed back 10; the recoil never takes her off a ledge', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    t.burrback.strikePx = 0;
    const s = newSim(scene([burr(2200)]), t);
    s.place(2110, FLOOR);
    const x0 = feet(s).x;
    const e0 = foe(s).x;
    const ev = s.run('A1 .30');
    expect(of(ev, 'slashHit')[0]).toMatchObject({ hitstop: 4, step: 1 });
    expect(foe(s).x - e0).toBe(32);
    // Lunge 9 px forward, recoil 4 + 3 + 2 + 1 back: a net step back of 1 (against a pod it nets +3: recoil 3).
    expect(feet(s).x - x0).toBe(9 - 10);
    expect([defaultTuning.slash1.recoilFoe, defaultTuning.slash3.recoilFoe]).toEqual([4, 6]);
    expect(EN.hitstopFrames + defaultTuning.slash3.hitstopFoe).toBe(7);
    // On a ledge's very end with her back to the drop: the recoil is dropped rather than shove her off.
    const plat = { tag: 'floating' as const, x: 2000, y: 600, w: 300, h: 48 };
    const l = newSim({ ...flatScene({ solids: [plat] }), enemies: [{ ...burr(2100), y: 600 }] }, t);
    l.place(2022, 600);
    l.state.player.x = 2000;
    const cut = l.run('R1 A1 .30');
    expect(of(cut, 'enemyHit')).toHaveLength(1);
    expect(l.state.player.grounded).toBe(true);
    expect(feet(l).y).toBe(600);
    expect(of(cut, 'fall')).toHaveLength(0);
  });

  it('the masher (walks up, stands at reach, mashes): her cuts glance off, the ram hits her', () => {
    for (const facing of [-1, 1] as const) {
      const s = newSim(scene([burr(2600, facing)]));
      s.place(2200, FLOOR);
      const r = fight(s, 0, false);
      trace(`masher, it faces ${facing}`, r.lines);
      expect(r.hits, `facing ${facing}`).toBeGreaterThanOrEqual(1);
      expect(r.blocks, `facing ${facing}`).toBeGreaterThanOrEqual(1);
      // She still wins, at a price she can pay.
      expect(r.dead, `facing ${facing}`).toBe(true);
      expect(r.hits, `facing ${facing}`).toBeLessThanOrEqual(2);
    }
  });

  it('the reader (sees it brace, hops the ram, cuts it spent): no hit, and it is dead', () => {
    for (const facing of [-1, 1] as const) {
      for (const from of [2200, 2260, 2330]) {
        const s = newSim(scene([burr(2600, facing)]));
        s.place(from, FLOOR);
        const r = fight(s, 0, true);
        trace(`reader from ${from}, it faces ${facing}`, r.lines);
        expect(r.hits, `from ${from}, facing ${facing}`).toBe(0);
        expect(r.dead, `from ${from}, facing ${facing}`).toBe(true);
        expect(r.windups, `from ${from}, facing ${facing}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('in the grove: the masher is hit by every burrback on the critical path and lives; the reader by none', () => {
    const at: Record<string, number> = { 'burr-path': 1900, 'burr-shaft': 3340, 'burr-rise': 4800 };
    for (const [id, x] of Object.entries(at)) {
      const i = (GROVE.enemies ?? []).findIndex((e) => e.id === id);
      const spawn = (GROVE.enemies ?? [])[i] as EnemySpawn;
      const m = newSim(GROVE);
      m.place(x, spawn.y);
      const a = fight(m, i, false);
      trace(`grove masher at ${id}`, a.lines);
      expect(a.hits, id).toBeGreaterThanOrEqual(1);
      expect(a.hits, id).toBeLessThanOrEqual(2);
      expect(a.dead, id).toBe(true);
      const r = newSim(GROVE);
      r.place(x, spawn.y);
      const b = fight(r, i, true);
      trace(`grove reader at ${id}`, b.lines);
      expect(b.hits, id).toBe(0);
      expect(b.dead, id).toBe(true);
    }
  });
});
