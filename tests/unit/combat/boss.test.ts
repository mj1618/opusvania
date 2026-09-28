import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../../src/input/script';
import { lots } from '../../../src/sim/ai/boss';
import { enemyDef, param } from '../../../src/sim/ai/schema';
import type { SimEvent } from '../../../src/sim/events';
import { createState, step } from '../../../src/sim/index';
import { conservationProblems } from '../../../src/sim/sound';
import type { Enemy, GameState } from '../../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../../src/sim/tuning';

const D = enemyDef('auctioneer');

interface Run {
  s: GameState;
  t: Tuning;
  ev: SimEvent[][];
  boss: Enemy;
}

function arena(seed = 3): Run {
  const t = cloneTuning(defaultTuning);
  const s = createState({ seed, roomId: 'auction' }, t);
  return { s, t, ev: [], boss: s.local.enemies[0] as Enemy };
}

function go(r: Run, script: string, invulnerable = true): void {
  for (const m of parseInputScript(script)) {
    if (invulnerable) r.s.player.iframes = 999;
    const ev: SimEvent[] = [];
    step(r.s, m, r.t, ev);
    r.ev.push(ev);
  }
}

function until(r: Run, pred: () => boolean, max = 2000): boolean {
  for (let i = 0; i < max && !pred(); i++) go(r, '.1');
  return pred();
}

const count = (r: Run, type: string) => r.ev.flat().filter((e) => e.type === type).length;

/** Stand Kid next to him on the lectern, facing him. */
function standBeside(r: Run): void {
  const b = r.boss;
  const p = r.s.player;
  const leftRoom = b.x - 13 * 64;
  p.x = leftRoom > 40 ? b.x - p.w - 6 : b.x + b.w + 6;
  p.y = b.y + b.h - p.h;
  p.vy = 0;
  p.facing = p.x < b.x ? 1 : -1;
}

describe('the Auctioneer (combat-spec §5)', () => {
  it('Cadence is forced every 3rd action: Going once (a lot is marked), twice (the TWICE word), SOLD', () => {
    const r = arena();
    until(r, () => count(r, 'sold') > 0);
    const starts = r.ev
      .flat()
      .filter((e) => e.type === 'telegraph')
      .map((e) => (e.type === 'telegraph' ? e.attackId : ''));
    expect(starts[2]).toBe('cadence');
    expect(count(r, 'lotMarked')).toBe(2);
    const soldLot = lots(r.s).find((l) => (l.soldT ?? 0) > 0);
    expect(soldLot?.ghost).toBe(true);
    expect(r.s.local.fever).toBe(1);
    // The floor shockwave runs outward both ways (phase 1 still has the Gavel).
    expect(r.s.local.shots.filter((s) => s.kind === 'wave').length).toBe(2);
    // The lot comes back after soldGhostFrames.
    go(r, `.${param(D, 'soldGhostFrames') + 2}`);
    expect(soldLot?.ghost).toBe(false);
  });

  it('seizing the hanging TWICE word breaks the Cadence: stunned 90 f, fever -1, nothing sold', () => {
    const r = arena();
    r.s.local.fever = 1;
    until(r, () => r.s.local.shots.some((s) => s.kind === 'word'));
    const word = r.s.local.shots.find((s) => s.kind === 'word');
    if (!word) throw new Error('no word');
    const p = r.s.player;
    // Stand under the word on the marked lot and Up+Seize.
    p.x = word.x + word.w / 2 - p.w / 2;
    p.y = 14 * 64 - p.h;
    go(r, 'U+S1 .8');
    expect(count(r, 'catch')).toBe(1);
    expect(r.boss.state).toBe('STAGGER');
    expect(r.boss.timer).toBeGreaterThan(param(D, 'twiceStun') - 10);
    expect(r.s.local.fever).toBe(0);
    go(r, '.40');
    expect(count(r, 'sold')).toBe(0);
    expect(r.s.local.sounds.find((s) => s.name === 'cadence')?.status).toBe('bag');
  });

  it('outbid: a brown slab resting on the marked lot fails the sale (stunned 45 f)', () => {
    const r = arena();
    until(r, () => count(r, 'lotMarked') > 0);
    const lot = lots(r.s)[r.boss.boss?.lots[0] ?? 0];
    if (!lot) throw new Error('no lot');
    // Drop a landed brown slab on it (as if levied there).
    const L = r.s.local;
    const snd = L.sounds.find((s) => s.name === 'gavel');
    if (!snd) throw new Error('no gavel');
    const id = L.nextId++;
    L.levied.push({
      id,
      soundId: snd.id,
      colour: 'brown',
      owner: snd.owner,
      x: lot.x,
      y: lot.y - 48,
      rx: 0,
      ry: 0,
      w: 64,
      h: 48,
      vx: 0,
      vy: 0,
      gravityMult: 1.2,
      phase: 'landed',
      solid: true,
      dmg: 6,
      hitList: [],
      squash: 0,
      born: r.s.frame,
      life: 0,
      bounces: 0,
    });
    snd.status = 'levied';
    snd.at = id;
    go(r, '.3');
    expect(count(r, 'outbid')).toBe(1);
    expect(r.boss.state).toBe('STAGGER');
  });

  it('Return to sender staggers him 90 f (no knockdown)', () => {
    const r = arena();
    const b = r.boss;
    b.state = 'RECOVERY';
    b.timer = 200;
    standBeside(r);
    go(r, 'S1 .12');
    expect(r.s.local.bag.length).toBe(1);
    standBeside(r);
    go(r, 'V1 .6');
    expect(r.ev.flat().some((e) => e.type === 'hit' && e.cls === 'heavy')).toBe(true);
    expect(b.state).toBe('STAGGER');
    expect(b.timer).toBeGreaterThan(param(D, 'returnStagger') - 12);
  });

  it('phase 1 ends in a knockdown; a Seize on his Count repossesses the Gavel and phase 2 starts', () => {
    const r = arena();
    const b = r.boss;
    b.hp = 1;
    b.state = 'RECOVERY';
    b.timer = 200;
    standBeside(r);
    go(r, 'J1 A1 .20');
    const st = b.state as string;
    if (st !== 'DOWN' && st !== 'COUNT') {
      standBeside(r);
      go(r, 'U+A1 .20');
    }
    expect(['DOWN', 'COUNT']).toContain(b.state);
    standBeside(r);
    go(r, 'S1 .8');
    expect(b.boss?.noGavel).toBe(true);
    expect(r.s.local.sounds.find((s) => s.name === 'gavel')?.status).toBe('bag');
    until(r, () => b.boss?.phase === 2, 60);
    expect(b.hp).toBe(param(D, 'phase2Hp'));
    expect(count(r, 'bossPhase')).toBe(1);
    expect(r.s.local.fever).toBe(1);
    expect(conservationProblems(r.s.local, r.t.bag.slots)).toEqual([]);
  });

  it('the final knockdown + Seize wins (repossessed, room clear)', () => {
    const r = arena();
    const b = r.boss;
    if (!b.boss) throw new Error('no boss');
    b.boss.phase = 2;
    b.hp = 1;
    b.state = 'RECOVERY';
    b.timer = 200;
    standBeside(r);
    go(r, 'U+A1 .20');
    expect(['DOWN', 'COUNT']).toContain(b.state);
    standBeside(r);
    go(r, 'S1 .20');
    expect(b.state).toBe('REPOSSESSED');
    expect(count(r, 'roomClear')).toBe(1);
    expect(r.s.run.poundage).toBe(2 * D.poundage);
  });

  it('Selling Your Bag (phase 2): in his sight her oldest sound becomes his, and he uses it next', () => {
    const r = arena();
    const b = r.boss;
    if (!b.boss) throw new Error('no boss');
    b.boss.phase = 2;
    // Hand her his Patter voice.
    const patter = r.s.local.sounds.find((s) => s.name === 'patter');
    if (!patter) throw new Error('no patter');
    patter.status = 'bag';
    r.s.local.bag.push(patter.id);
    b.boss.actions = 2; // the next action is the 3rd: Selling Your Bag
    until(r, () => count(r, 'soldBag') > 0 || count(r, 'sold') > 0, 600);
    // Invulnerable Kid can't be sold to: let her be vulnerable for the SOLD.
    if (count(r, 'soldBag') === 0) {
      const r2 = arena();
      const b2 = r2.boss;
      if (!b2.boss) throw new Error('no boss');
      b2.boss.phase = 2;
      const p2 = r2.s.local.sounds.find((s) => s.name === 'patter');
      if (!p2) throw new Error('no patter');
      p2.status = 'bag';
      r2.s.local.bag.push(p2.id);
      b2.boss.actions = 2;
      for (let i = 0; i < 600 && count(r2, 'soldBag') === 0; i++) {
        r2.s.player.chin = 5;
        go(r2, '.1', false);
      }
      expect(count(r2, 'soldBag')).toBe(1);
      expect(p2.status).toBe('held');
      until(r2, () => r2.ev.flat().some((e) => e.type === 'telegraph' && e.attackId === 'useViolet'), 400);
      expect(r2.ev.flat().some((e) => e.type === 'telegraph' && e.attackId === 'useViolet')).toBe(true);
      until(r2, () => p2.status === 'home', 200);
      expect(p2.status).toBe('home');
    }
  });
});
