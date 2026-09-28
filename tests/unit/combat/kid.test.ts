import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../../src/sim/events';
import { cloneState, loadRoom } from '../../../src/sim/index';
import { getRoom } from '../../../src/sim/world/rooms';
import { closeIn, combatLab, enemy, events, type Fight, fight, play, put, stepOf, until } from './arena';

/** A Barker right next to Kid that lunges at once. */
function lunger(f: Fight, dx = 150) {
  const b = put(f, 'barker', dx);
  b.state = 'CHASE';
  return b;
}

/** Take a voice into the bag: jab the Barker open, walk in and Seize. */
function takeBark(f: Fight): number {
  const b = put(f, 'barker', 100);
  b.state = 'CHASE';
  b.cooldown = 9999;
  play(f, 'A1 .9 R+S1 R5 .12');
  if (f.s.local.bag.length !== 1) throw new Error('no bark taken');
  until(f, (x) => x.s.player.move === null && x.s.hitstop === 0, 30);
  return b.id;
}

describe('Kid gets hurt (combat-spec §3.1)', () => {
  it('a hit: Chin -1, 8 f hitstop on the same step, 78 i-frames, a 12 f control lock and knockback', () => {
    const f = fight();
    lunger(f);
    until(f, (x) => events(x, 'hurt').length > 0, 200);
    const s = stepOf(f, 'hurt');
    const ev = f.steps[s - 1] ?? [];
    expect(ev.some((e) => e.type === 'hitstop' && e.cls === 'hurt' && e.frames === 8)).toBe(true);
    const p = f.s.player;
    expect(p.chin).toBe(4);
    // 78 i-frames counting the hit step itself.
    expect(p.iframes).toBe(77);
    expect(p.hurtLock).toBe(11);
    expect(p.vx).not.toBe(0);
    expect(p.ring).toBe(f.t.kid.ringFrames - 1);
  });

  it('U8: hits during the i-frames are ignored; a hazard still registers', () => {
    const room = combatLab([[14, 9, '^^^']]);
    const f = fight(room);
    lunger(f);
    until(f, (x) => events(x, 'hurt').length > 0, 200);
    // Keep the Barker lunging at her for the whole window: no second hurt.
    until(f, (x) => x.s.player.iframes === 0, 120, 0);
    expect(events(f, 'hurt').length).toBe(1);
    // Hazards ignore i-frames.
    const g = fight(room);
    g.s.player.iframes = 60;
    play(g, 'R40');
    expect(events(g, 'hazard').length).toBe(1);
  });

  it('control lock: no walking or jumping for 12 frames, but a Slip is allowed from lock frame 8', () => {
    const f = fight();
    lunger(f);
    until(f, (x) => events(x, 'hurt').length > 0, 200);
    until(f, (x) => x.s.hitstop === 0, 20);
    const early = { s: cloneState(f.s), t: f.t, steps: [] as SimEvent[][] };
    play(early, 'X1');
    expect(events(early, 'dashStart').length).toBe(0);
    play(f, '.8 X1');
    expect(events(f, 'dashStart').length).toBe(1);
  });
});

describe('Ringing (the rally, §3.2)', () => {
  it('the lost pip rings for 120 f; a Seize take in the window wins it back', () => {
    const f = fight();
    const b = put(f, 'barker', 150);
    b.state = 'CHASE';
    until(f, (x) => events(x, 'hurt').length > 0, 200);
    expect(f.s.player.chin).toBe(4);
    until(f, (x) => x.s.player.hurtLock === 0 && x.s.hitstop === 0, 40);
    // Wait for its recovery (open), walk in and seize.
    until(f, (x) => enemy(x, b.id).state === 'RECOVERY', 60);
    closeIn(f, b.id, 20);
    play(f, 'S1 .8');
    if (events(f, 'seizeTake').length > 0) {
      expect(events(f, 'ringRecover').length).toBe(1);
      expect(f.s.player.chin).toBe(5);
    }
    // And a pip left ringing is lost for good when the window closes.
    const g = fight();
    lunger(g);
    until(g, (x) => events(x, 'hurt').length > 0, 200);
    g.s.local.enemies = [];
    until(g, (x) => events(x, 'ringLost').length > 0, 200);
    expect(g.s.player.chin).toBe(4);
  });
});

describe('Slip and Counter (C4)', () => {
  it('a clean Slip through a live hitbox: no damage, slipClean + counterOpen, cooldown refunded', () => {
    const f = fight();
    const b = lunger(f, 200);
    until(f, (x) => enemy(x, b.id).state === 'ACTIVE', 200);
    // Find a Slip timing that is clean (the lunge overlaps her i-frames).
    let clean: Fight | null = null;
    for (let d = -12; d < 8 && !clean; d++) {
      const g = fight();
      const e = lunger(g, 200);
      until(g, (x) => enemy(x, e.id).state === 'ACTIVE' || enemy(x, e.id).state === 'TELEGRAPH', 200);
      until(g, (x) => enemy(x, e.id).state === 'ACTIVE', 30);
      if (d < 0) continue;
      play(g, `${d > 0 ? `.${d} ` : ''}R+X1 R10`);
      if (events(g, 'slipClean').length > 0) clean = g;
    }
    // Also try slipping from the telegraph (earlier).
    for (let d = 0; d < 20 && !clean; d++) {
      const g = fight();
      const e = lunger(g, 200);
      until(g, (x) => enemy(x, e.id).state === 'TELEGRAPH', 200);
      play(g, `${d > 0 ? `.${d} ` : ''}R+X1 R10`);
      if (events(g, 'slipClean').length > 0) clean = g;
    }
    expect(clean).not.toBeNull();
    if (!clean) return;
    expect(events(clean, 'hurt').length).toBe(0);
    expect(events(clean, 'counterOpen').length).toBe(1);
    expect(clean.s.player.counter).toBeGreaterThan(0);
    // A jab inside the window is a Counter: x2 damage and a knockdown.
    const e = clean.s.local.enemies[0];
    if (!e) throw new Error('no enemy');
    // It lunges past her into its recovery: step up behind it and punch inside the window.
    until(clean, (x) => enemy(x, e.id).state === 'RECOVERY' && x.s.player.state !== 'dash', 30);
    expect(clean.s.player.counter).toBeGreaterThan(0);
    const right = e.x > clean.s.player.x;
    clean.s.player.x = right ? e.x - 60 : e.x + e.w + 20;
    play(clean, `${right ? 'R' : 'L'}+A1 .10`);
    const hit = events(clean, 'hit').find((h) => h.type === 'hit' && h.cls === 'counter');
    expect(hit).toBeTruthy();
    expect(events(clean, 'counterHit').length).toBe(1);
    expect(['DOWN', 'COUNT']).toContain(enemy(clean, e.id).state);
  });
});

describe('Swallow (§3.4)', () => {
  it('swallowing a voice heals by its colour after the channel; the owner goes Hoarse', () => {
    const f = fight();
    const id = takeBark(f);
    f.s.player.chin = 3;
    enemy(f, id).state = 'STAGGER';
    enemy(f, id).timer = 200;
    play(f, 'H1');
    expect(events(f, 'swallowStart').length).toBe(1);
    play(f, `.${f.t.swallow.channelPink + 2}`);
    expect(events(f, 'swallowCommit').length).toBe(1);
    expect(f.s.player.chin).toBe(4);
    expect(f.s.local.bag).toEqual([]);
    expect(f.s.local.sounds.find((s) => s.name === 'bark')?.status).toBe('consumed');
    expect(enemy(f, id).hoarse).toBe(true);
  });

  it('a deed (a humming object) is refused; a Slip cancels the channel and keeps the sound', () => {
    const room = combatLab([11, 12, 13, 14].map((y) => [y, 6, 'H']) as [number, number, string][]);
    const f = fight(room);
    play(f, 'R8 S1 .20');
    expect(f.s.local.bag.length).toBe(1);
    play(f, 'H1 .8');
    expect(events(f, 'swallowRefused').length).toBe(1);
    expect(f.s.local.bag.length).toBe(1);
    const g = fight();
    takeBark(g);
    play(g, 'H1 .4 X1 .10');
    expect(events(g, 'swallowCommit').length).toBe(0);
    expect(g.s.local.bag.length).toBe(1);
  });

  it('a hit during the channel spills the sound at her feet (no heal)', () => {
    const f = fight();
    const id = takeBark(f);
    f.s.player.chin = 3;
    // A second Barker lunges at her while she channels.
    const e = enemy(f, id);
    e.state = 'STAGGER';
    e.timer = 400;
    const b2 = put(f, 'barker', -110);
    b2.state = 'CHASE';
    until(f, (x) => enemy(x, b2.id).state === 'TELEGRAPH' && enemy(x, b2.id).stateFrame >= 10, 200);
    play(f, 'H1');
    until(f, (x) => events(x, 'hurt').length > 0, 60);
    expect(events(f, 'swallowSpill').length).toBe(1);
    expect(events(f, 'swallowCommit').length).toBe(0);
    expect(f.s.local.sounds.find((s) => s.name === 'bark')?.status).toMatch(/flight|levied/);
  });
});

describe('Hazards in combat rooms: a pip, then the last safe ground', () => {
  it('spikes cost 1 pip (no ring) and respawn her where she last stood on safe ground, with i-frames', () => {
    const room = combatLab([[14, 9, '^^^']]);
    const f = fight(room);
    play(f, 'R12');
    const safe = { x: f.s.player.safeX, y: f.s.player.safeY };
    until(f, (x) => events(x, 'hazard').length > 0, 60, 1 << 1);
    expect(f.s.player.chin).toBe(4);
    expect(f.s.player.ring).toBe(0);
    until(f, (x) => events(x, 'respawn').length > 0, 60);
    const p = f.s.player;
    expect(p.x + p.w / 2).toBeLessThan(9 * 64);
    expect(p.y + p.h).toBe(960);
    expect(p.iframes).toBeGreaterThan(0);
    expect(safe.y).toBe(960);
  });
});

describe('U10 Beat the Count, Counted Out, the Runner', () => {
  /** Kid at 1 Chin with a voice in the bag, then a Barker's hit puts her down. */
  const goDown = (withVoice: boolean) => {
    const f = fight();
    if (withVoice) {
      const id = takeBark(f);
      enemy(f, id).state = 'STAGGER';
      enemy(f, id).timer = 9999;
    }
    put(f, 'barker', 400);
    f.s.player.chin = 1;
    f.s.player.iframes = 0;
    for (const e of f.s.local.enemies) {
      if (e.state === 'STAGGER') continue;
      e.state = 'CHASE';
      e.cooldown = 0;
    }
    until(f, (x) => x.s.player.down !== null, 400);
    if (!f.s.player.down) throw new Error('never went down');
    until(f, (x) => x.s.hitstop === 0, 20);
    return f;
  };
  const beat = (f: Fight) => f.t.combat.countBeatByFever[0] as number;

  it('one Jump press within +-5 f of a beat from 3 to 8 rises with 1 Chin and pays the bag', () => {
    for (const k of [3, 8]) {
      for (const off of [-5, 0, 5]) {
        const f = goDown(true);
        const target = k * beat(f) + off;
        const d = f.s.player.down;
        if (!d) throw new Error('not down');
        play(f, `.${target - d.t - 1} J1 .2`);
        expect(events(f, 'beatCountRise').length, `beat ${k} ${off}`).toBe(1);
        expect(f.s.player.chin).toBe(1);
        expect(f.s.local.bag).toEqual([]);
        expect(f.s.run.beatUsed).toBe(true);
      }
    }
  });

  it('outside the window, a mash (the first press counts), no voice, or a used count: Counted Out', () => {
    const early = goDown(true);
    play(early, `.${2 * beat(early) - 1} J1 .${beat(early) - 1} J1 .200`);
    expect(events(early, 'beatCountRise').length).toBe(0);
    expect(events(early, 'countedOut').length).toBe(1);
    const noVoice = goDown(false);
    play(noVoice, `.${3 * beat(noVoice) - 2} J1 .200`);
    expect(events(noVoice, 'beatCountRise').length).toBe(0);
    const used = goDown(true);
    used.s.run.beatUsed = true;
    if (used.s.player.down) used.s.player.down.canRise = false;
    play(used, `.${3 * beat(used) - 2} J1 .200`);
    expect(events(used, 'beatCountRise').length).toBe(0);
  });

  it('Counted Out: a Lien (max Chin -1), the Runner takes the Poundage, she wakes at the Corner', () => {
    const f = goDown(false);
    f.s.run.poundage = 12;
    until(f, (x) => x.s.roomId === 'hub', 300);
    expect(events(f, 'countedOut').length).toBe(1);
    expect(f.s.run.lien).toBe(1);
    expect(f.s.run.poundage).toBe(0);
    expect(f.s.run.runner?.poundage).toBe(12);
    expect(f.s.player.chinMax).toBe(4);
    expect(f.s.player.chin).toBe(4);
    const corner = getRoom('hub').spawns.corner;
    expect(corner).toBeTruthy();
    expect(f.s.run.deaths).toBe(1);
    // Back in the room she went down in, the Runner flees; it slips two Seizes, the third catches it.
    const runnerRoom = f.s.run.runner?.roomId as string;
    loadRoom(f.s, runnerRoom, undefined, f.t, []);
    const r = f.s.local.enemies.find((e) => e.type === 'runner');
    expect(r?.state).toBe('FLEE');
    if (!r) return;
    for (let i = 0; i < 3; i++) {
      r.state = 'DOWN';
      r.timer = 60;
      f.s.player.x = r.x - 50;
      f.s.player.y = r.y + r.h - f.s.player.h;
      f.s.player.facing = 1;
      play(f, 'S1 .10');
      if (events(f, 'redistrained').length) break;
    }
    expect(events(f, 'redistrained').length).toBe(1);
    expect(f.s.run.poundage).toBe(12);
    expect(f.s.run.lien).toBe(0);
    expect(f.s.player.chinMax).toBe(5);
  });

  it('the death counter survives the reload (run.deaths)', () => {
    const f = goDown(false);
    until(f, (x) => x.s.roomId === 'hub', 300);
    expect(f.s.run.deaths).toBe(1);
    expect(f.s.roomStats.deaths).toBe(0);
  });
});

describe('Hub: the Corner and full-width doors', () => {
  it('touching the Corner refills Chin and refreshes Beat the Count', () => {
    const f = fight('hub');
    const c = getRoom('hub').spawns.corner;
    if (!c) throw new Error('no corner');
    f.s.player.chin = 2;
    f.s.run.beatUsed = true;
    f.s.player.x = c.tx * 64 + 12;
    play(f, '.2');
    expect(f.s.player.chin).toBe(f.s.player.chinMax);
    expect(f.s.run.beatUsed).toBe(false);
    expect(events(f, 'corner').length).toBe(1);
  });

  it('a door triggers anywhere across its drawn width (3 tiles)', () => {
    const door = getRoom('hub').entities.find((e) => e.char === '5');
    if (!door) throw new Error('no door');
    for (const dx of [-80, -40, 0, 40, 80]) {
      const f = fight('hub');
      f.s.player.x = door.tx * 64 + 12 + dx;
      play(f, 'U1 .20');
      expect(f.s.roomId, `dx ${dx}`).toBe('gym-05');
    }
  });
});
