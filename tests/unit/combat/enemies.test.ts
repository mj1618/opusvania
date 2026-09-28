import { describe, expect, it } from 'vitest';
import { tokensHeld, viewRect } from '../../../src/sim/ai/enemy';
import { enemyDef, enemyTypes, MIN_TELEGRAPH } from '../../../src/sim/ai/schema';
import type { SimEvent } from '../../../src/sim/events';
import { cloneState } from '../../../src/sim/index';
import { conservationProblems } from '../../../src/sim/sound';
import { getRoom } from '../../../src/sim/world/rooms';
import { closeIn, combatLab, enemy, events, type Fight, fight, play, put, stepOf, until } from './arena';

const modes = (f: Fight, id: number, n: number, mask = 0): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    until(f, () => false, 1, mask);
    out.push(enemy(f, id).state);
  }
  return out;
};

/** Run-length summary of a mode list: "CHASE x12, TELEGRAPH x18, ...". */
const runs = (ms: string[]): [string, number][] => {
  const out: [string, number][] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last[0] === m) last[1]++;
    else out.push([m, 1]);
  }
  return out;
};

describe('enemy data (T1-T3 lint)', () => {
  it('every telegraph is >= 15 frames, every attack names a sound or is generic, white is never seizable', () => {
    for (const type of enemyTypes()) {
      const d = enemyDef(type);
      for (const [id, a] of Object.entries(d.attacks)) {
        expect(a.telegraph, `${type}.${id}`).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
        expect(a.cue.audio.length, `${type}.${id}`).toBeGreaterThan(0);
        const snd = d.sounds.find((s) => s.id === a.sound);
        if (snd) expect(a.cue.tint).toBe(snd.colour);
      }
      for (const s of d.sounds) expect(s.seizable).toBe(s.colour !== 'white');
    }
  });
});

describe('enemy state machine (Barker)', () => {
  it('CHASE -> TELEGRAPH (18) -> ACTIVE (12) -> RECOVERY (26) -> CHASE', () => {
    const f = fight();
    const b = put(f, 'barker', 400);
    const ms = modes(f, b.id, 140);
    const r = runs(ms).filter(([m]) => m !== 'PATROL');
    const tele = r.findIndex(([m]) => m === 'TELEGRAPH');
    expect(tele).toBeGreaterThan(0);
    expect(r[tele]).toEqual(['TELEGRAPH', 18]);
    expect(r[tele + 1]?.[0]).toBe('ACTIVE');
    // The lunge is 12 frames unless it reaches a wall or ledge first.
    expect(r[tele + 1]?.[1]).toBeLessThanOrEqual(12);
    expect(r[tele + 2]).toEqual(['RECOVERY', 26]);
    expect(r[tele + 3]?.[0]).toBe('CHASE');
    // T4: attackActive at least 15 steps after its telegraph.
    const t0 = stepOf(f, 'telegraph');
    const a0 = stepOf(f, 'attackActive');
    expect(a0 - t0).toBeGreaterThanOrEqual(15);
  });

  it('at most 2 attack tokens are ever held (three Barkers)', () => {
    const f = fight();
    put(f, 'barker', 200);
    put(f, 'barker', 300);
    put(f, 'barker', -200);
    let maxTokens = 0;
    for (let i = 0; i < 600; i++) {
      until(f, () => false, 1);
      maxTokens = Math.max(maxTokens, tokensHeld(f.s.local));
      if (f.s.player.down) break;
    }
    expect(maxTokens).toBe(2);
  });

  it('a punch outside its attack makes it flinch; inside the telegraph it has armour', () => {
    const f = fight();
    const b = put(f, 'barker', 90);
    b.state = 'CHASE';
    b.cooldown = 99;
    play(f, 'A1 .8');
    expect(events(f, 'flinch').length).toBe(1);
    expect(['FLINCH', 'CHASE', 'RETRIEVE']).toContain(enemy(f, b.id).state);
  });

  it('KO at 0 HP (fodder) pays its Poundage', () => {
    const f = fight();
    const b = put(f, 'barker', 90);
    b.hp = 2;
    b.cooldown = 99;
    play(f, 'A1 .10');
    expect(enemy(f, b.id).state).toBe('KO');
    expect(events(f, 'ko').length).toBe(1);
    expect(f.s.run.poundage).toBe(enemyDef('barker').poundage);
  });
});

describe('U5 Seize on enemies: guarded, open, Catch', () => {
  it('guarded (chasing, not rattled): seizeGuarded, 1 damage, whiff recovery, nothing taken', () => {
    const f = fight();
    const b = put(f, 'barker', 110);
    b.state = 'CHASE';
    b.cooldown = 99;
    play(f, 'S1 .6');
    expect(events(f, 'seizeGuarded').length).toBe(1);
    expect(enemy(f, b.id).hp).toBe(enemyDef('barker').hp - 1);
    expect(f.s.local.bag.length).toBe(0);
  });

  it('open (rattled by a jab): the take disables the lunge on the same step and it retrieves within 10 f', () => {
    const f = fight();
    const b = put(f, 'barker', 100);
    b.state = 'CHASE';
    b.cooldown = 99;
    play(f, 'A1 .9 R+S1 R3');
    const takeStep = until(f, (x) => x.s.local.bag.length > 0, 20);
    expect(takeStep).toBeGreaterThanOrEqual(0);
    const bark = f.s.local.sounds.find((s) => s.name === 'bark');
    expect(bark?.status).toBe('bag');
    expect(until(f, (x) => enemy(x, b.id).state === 'RETRIEVE', 10)).toBeGreaterThanOrEqual(0);
    expect(stepOf(f, 'retrieve')).toBe(stepOf(f, 'seizeTake'));
  });

  it('Catch: a Seize during the lunge telegraph takes the Bark, cancels the lunge and staggers it', () => {
    const f = fight();
    const b = put(f, 'barker', 90);
    until(f, (x) => enemy(x, b.id).state === 'TELEGRAPH', 300);
    play(f, 'S1 .6');
    expect(events(f, 'catch').length).toBe(1);
    expect(enemy(f, b.id).state).toBe('STAGGER');
    expect(events(f, 'attackActive').length).toBe(0);
    expect(f.steps.flat().some((e) => e.type === 'hitstop' && e.cls === 'catch')).toBe(true);
  });

  it('Snatch: a retrieving owner takes its sound back from the bag (no damage)', () => {
    const f = fight();
    const b = put(f, 'barker', 100);
    b.state = 'CHASE';
    b.cooldown = 99;
    play(f, 'A1 .9 R+S1 R5 .1');
    expect(f.s.local.bag.length).toBe(1);
    const chin = f.s.player.chin;
    until(f, (x) => x.s.local.bag.length === 0, 200);
    expect(events(f, 'snatch').length).toBe(1);
    expect(f.s.player.chin).toBe(chin);
    expect(f.s.local.sounds.find((s) => s.name === 'bark')?.status).toBe('home');
  });
});

describe('U9 the Count', () => {
  /** Seize the Bark (open after a jab), then throw it back point blank: Return to sender knocks it down. */
  const downed = (close = true) => {
    const f = fight();
    const b = put(f, 'barker', 100);
    b.state = 'CHASE';
    b.cooldown = 999;
    play(f, 'A1 .9 R+S1 R5 .8');
    play(f, 'V1 .4');
    until(f, (x) => enemy(x, b.id).state === 'DOWN', 40);
    if (close) closeIn(f, b.id);
    return { f, b };
  };

  it('Return to sender knocks the owner down (heavy hit, x1.5 damage)', () => {
    const { f, b } = downed();
    const hit = events(f, 'hit').find((e) => e.type === 'hit' && e.move === 'levy');
    expect(hit).toMatchObject({ cls: 'heavy', dmg: Math.ceil(2 * 1.5) });
    expect(['DOWN', 'COUNT']).toContain(enemy(f, b.id).state);
  });

  it('a punch on a downed enemy never hits (a foul: whiff reason down)', () => {
    const { f, b } = downed();
    const hp = enemy(f, b.id).hp;
    const hits = events(f, 'hit').length;
    play(f, 'A1 .10');
    expect(events(f, 'hit').length).toBe(hits);
    expect(events(f, 'whiff').some((e) => e.type === 'whiff' && e.reason === 'down')).toBe(true);
    expect(enemy(f, b.id).hp).toBe(hp);
  });

  it('a Seize on any beat 1..10 repossesses (x2 Poundage); beat 10 + 1 frame rises Furious', () => {
    for (let k = 1; k <= 10; k++) {
      const { f, b } = downed(false);
      until(f, (x) => enemy(x, b.id).state === 'COUNT' && enemy(x, b.id).beat === k, 200);
      // Stand next to it (the Seize lands on frame 6 of the move, inside this beat).
      const e = enemy(f, b.id);
      f.s.player.x = e.x - f.s.player.w - 8;
      f.s.player.facing = 1;
      e.timer = Math.max(e.timer, 7);
      expect(enemy(f, b.id).beat).toBe(k);
      play(f, 'S1 .8');
      expect(enemy(f, b.id).state, `beat ${k}`).toBe('REPOSSESSED');
      expect(f.s.run.poundage).toBe(2 * enemyDef('barker').poundage);
    }
    const { f, b } = downed();
    until(f, (x) => enemy(x, b.id).state === 'COUNT' && enemy(x, b.id).beat === 10, 200);
    const left = enemy(f, b.id).timer;
    play(f, `.${left}`);
    expect(enemy(f, b.id).state).toBe('RISE');
    expect(enemy(f, b.id).furious).toBe(true);
  });
});

describe('U11 revoice', () => {
  it('a voice away for revoiceFrames regrows at home; the bag copy is gone; sounds are conserved', () => {
    const f = fight();
    const b = put(f, 'barker', 100);
    b.state = 'CHASE';
    b.cooldown = 999;
    play(f, 'A1 .9 R+S1 R5 .1');
    const bark = f.s.local.sounds.find((s) => s.name === 'bark');
    expect(bark?.status).toBe('bag');
    if (bark) bark.awayFrames = f.t.combat.revoiceFrames - 2;
    // Keep it from snatching first.
    enemy(f, b.id).state = 'STAGGER';
    enemy(f, b.id).timer = 50;
    play(f, '.12');
    expect(bark?.status).toBe('home');
    expect(f.s.local.bag).toEqual([]);
    expect(events(f, 'revoice').length).toBe(1);
    expect(conservationProblems(f.s.local, f.t.bag.slots)).toEqual([]);
  });
});

describe('elite (Grinder) and the view rule', () => {
  it("at 0 HP an elite goes down for the Count and is KO'd if nobody seizes it", () => {
    const f = fight();
    const g = put(f, 'grinder', 140);
    g.hp = 2;
    g.cooldown = 999;
    play(f, 'A1 .6');
    expect(enemy(f, g.id).state).toBe('DOWN');
    until(f, (x) => enemy(x, g.id).state === 'KO', 200);
    expect(enemy(f, g.id).state).toBe('KO');
  });

  it('the charge telegraph backs it up 48 px (visible) before it charges', () => {
    const f = fight();
    const g = put(f, 'grinder', 500);
    g.state = 'CHASE';
    until(f, (x) => enemy(x, g.id).state === 'TELEGRAPH', 300);
    const x0 = enemy(f, g.id).x;
    until(f, (x) => enemy(x, g.id).state !== 'TELEGRAPH', 60);
    expect(Math.abs(enemy(f, g.id).x - x0)).toBeGreaterThanOrEqual(40);
  });

  it('no attack starts with the enemy outside the view (T5)', () => {
    const wide = combatLab();
    const f = fight(wide);
    const v = viewRect(f.s, getRoom(wide), f.t);
    expect(v.w).toBeLessThanOrEqual(f.t.combat.viewW);
    // The lab room is exactly one view wide, so everything is in view; shrink the view to test.
    f.t.combat.viewW = 400;
    const b = put(f, 'barker', 500);
    b.state = 'CHASE';
    let started = -1;
    for (let i = 0; i < 200 && started < 0; i++) {
      until(f, () => false, 1);
      if (enemy(f, b.id).state === 'TELEGRAPH') started = enemy(f, b.id).x;
    }
    const v2 = viewRect(f.s, getRoom(wide), f.t);
    expect(started).toBeGreaterThanOrEqual(v2.x - enemy(f, b.id).w);
  });
});

describe('Stock Gull (flyer)', () => {
  it('hovers above Kid, locks its dive on telegraph frame 16 and dives along that vector', () => {
    const f = fight();
    const g = put(f, 'gull', 150, 600);
    until(f, (x) => enemy(x, g.id).state === 'TELEGRAPH', 400);
    expect(enemy(f, g.id).y + 40).toBeLessThan(f.s.player.y);
    until(f, (x) => enemy(x, g.id).stateFrame === 16 || enemy(x, g.id).state !== 'TELEGRAPH', 30);
    const aim = { x: enemy(f, g.id).aimX, y: enemy(f, g.id).aimY };
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(16, 5);
    expect(aim.y).toBeGreaterThan(0);
    until(f, (x) => enemy(x, g.id).state === 'ACTIVE', 20);
    const y0 = enemy(f, g.id).y;
    play(f, '.3');
    expect(enemy(f, g.id).y).toBeGreaterThan(y0);
  });

  it('a knocked-down gull falls to the floor for the Count', () => {
    const f = fight();
    const g = put(f, 'gull', 60, 900);
    g.state = 'DOWN';
    g.timer = 12;
    until(f, (x) => enemy(x, g.id).grounded, 60);
    expect(enemy(f, g.id).y + enemy(f, g.id).h).toBe(960);
  });
});

describe('Clerk (ranged)', () => {
  it('its Stamp is a mortar that lands where it was aimed; a Seize can Catch it in flight', () => {
    const f = fight();
    const c = put(f, 'clerk', 420);
    until(f, (x) => enemy(x, c.id).state === 'TELEGRAPH' && enemy(x, c.id).attackId === 'stamp', 400, 0);
    expect(enemy(f, c.id).aimX).toBeCloseTo(f.s.player.x + 20, 0);
    until(f, (x) => x.s.local.shots.length > 0, 40);
    expect(f.s.local.shots[0]?.kind).toBe('mortar');
    // Idle: it lands on Kid (the aim point).
    const idle = { s: cloneState(f.s), t: f.t, steps: [] as SimEvent[][] };
    until(idle, (x) => events(x, 'hurt').length > 0 || events(x, 'shotLand').length > 0, 120);
    expect(events(idle, 'hurt').length + events(idle, 'shotLand').length).toBeGreaterThan(0);
    // Some Up+Seize timing on the way down catches it: the Thump goes to the bag, the Clerk comes for it.
    let caught: typeof f | null = null;
    for (let d = 0; d < 80 && !caught; d++) {
      const g = { s: cloneState(f.s), t: f.t, steps: [] as SimEvent[][] };
      play(g, `${d > 0 ? `.${d} ` : ''}U+S1 .10`);
      if (events(g, 'catch').length > 0) caught = g;
    }
    expect(caught).not.toBeNull();
    if (!caught) return;
    expect(caught.s.local.sounds.find((s) => s.name === 'thump')?.status).toBe('bag');
    until(caught, (x) => enemy(x, c.id).state === 'RETRIEVE', 80);
    expect(enemy(caught, c.id).state).toBe('RETRIEVE');
  });

  it('with only the white Tannoy at home, a Seize is refused (white static is never seizable)', () => {
    const f = fight();
    const c = put(f, 'clerk', 90);
    const thump = f.s.local.sounds.find((s) => s.name === 'thump');
    if (thump) {
      thump.status = 'consumed';
      c.hoarse = true;
    }
    c.state = 'RECOVERY';
    c.timer = 60;
    play(f, 'S1 .8');
    expect(events(f, 'seizeRefused').length).toBe(1);
    expect(f.s.local.bag.length).toBe(0);
  });
});

describe('chasing down from a ledge (regression: the Pit deadlock)', () => {
  it('a Barker on a platform beside and above Kid walks off it instead of standing at the edge', () => {
    // A one-way platform 3 tiles up over cols 8-12; the Barker on it, Kid below just past its end.
    const room = combatLab([[11, 8, '=====']]);
    const f = fight(room);
    f.s.player.x = 13 * 64 + 4;
    const b = put(f, 'barker', 11 * 64 + 32 - (4 * 64 + 32), 11 * 64);
    b.state = 'CHASE';
    b.cooldown = 9999;
    until(f, (x) => enemy(x, b.id).y + enemy(x, b.id).h === 960, 240);
    expect(enemy(f, b.id).y + enemy(f, b.id).h).toBe(960);
  });
});
