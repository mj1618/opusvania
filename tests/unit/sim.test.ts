import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { cloneState, hashState, step } from '../../src/sim/index';
import { collidesAt } from '../../src/sim/physics/aabb';
import { DT } from '../../src/sim/player/player';
import { defaultTuning } from '../../src/sim/tuning';
import { buildRoom, getRoom } from '../../src/sim/world/rooms';
import { newGame, run } from './helpers';

describe('sim basics', () => {
  it('spawns the player standing on the floor and settles', () => {
    const { state, tuning } = newGame();
    const floorTop = 18 * tuning.world.tileSize;
    expect(state.player.y + state.player.h).toBe(floorTop);
    run(state, tuning, '_*60');
    expect(state.frame).toBe(60);
    expect(state.player.grounded).toBe(true);
    expect(state.player.y + state.player.h).toBe(floorTop);
    expect(state.player.vy).toBe(0);
  });

  it('runs right at runSpeed', () => {
    const { state, tuning } = newGame();
    const x0 = state.player.x;
    run(state, tuning, 'right*30');
    expect(state.player.vx).toBe(tuning.player.runSpeed);
    expect(state.player.facing).toBe(1);
    expect(state.player.x).toBeGreaterThan(x0 + tuning.player.runSpeed * DT * 20);
  });

  it('is stopped by walls and never overlaps solids', () => {
    const { state, tuning } = newGame();
    const room = getRoom(state.roomId);
    for (const input of parseInputScript('left*120 right*400 right+jump*20 right*100')) {
      step(state, input, tuning, []);
      const p = state.player;
      expect(collidesAt(room, tuning.world.tileSize, p.x, p.y, p.w, p.h)).toBe(false);
    }
    const fresh = newGame();
    run(fresh.state, fresh.tuning, 'left*200');
    expect(fresh.state.player.x).toBe(tuning.world.tileSize); // flush against the left wall
    expect(fresh.state.player.vx).toBe(0);
  });

  it('jumps to about v²/2g and lands again, emitting events', () => {
    const { state, tuning } = newGame();
    run(state, tuning, '_*5');
    const y0 = state.player.y;
    const events = run(state, tuning, 'jump');
    expect(events.map((e) => e.type)).toContain('jump');
    let minY = state.player.y;
    for (let i = 0; i < 40; i++) {
      run(state, tuning, 'jump', events);
      minY = Math.min(minY, state.player.y);
    }
    const expected = tuning.jump.jumpSpeed ** 2 / (2 * tuning.jump.gravity);
    expect(y0 - minY).toBeGreaterThan(expected * 0.9);
    expect(y0 - minY).toBeLessThan(expected * 1.1);
    run(state, tuning, '_*60', events);
    expect(state.player.y).toBe(y0);
    expect(events.filter((e) => e.type === 'land')).toHaveLength(1);
  });

  it('cuts the jump short when jump is released (variable height)', () => {
    let fullMin = Infinity;
    let tapMin = Infinity;
    const a = newGame();
    const b = newGame();
    for (const i of parseInputScript('jump*40')) {
      step(a.state, i, a.tuning, []);
      fullMin = Math.min(fullMin, a.state.player.y);
    }
    for (const i of parseInputScript('jump*3 _*37')) {
      step(b.state, i, b.tuning, []);
      tapMin = Math.min(tapMin, b.state.player.y);
    }
    expect(tapMin).toBeGreaterThan(fullMin + 50);
  });

  it('buffers a jump pressed just before landing', () => {
    const { state, tuning } = newGame();
    run(state, tuning, 'jump*10'); // still in the air
    let framesToLand = 0;
    const probe = cloneState(state);
    while (!probe.player.grounded && framesToLand < 120) {
      step(probe, 0, tuning, []);
      framesToLand++;
    }
    // Press jump 3 frames before touching down; it should fire on landing.
    run(state, tuning, `_*${framesToLand - 3}`);
    const events = run(state, tuning, 'jump*6');
    expect(events.filter((e) => e.type === 'jump')).toHaveLength(1);
  });

  it('allows a coyote jump shortly after walking off a ledge, but not later', () => {
    const walkOff = () => {
      const g = newGame({ spawn: 'b' }); // on a 3-tile ledge in the gym
      run(g.state, g.tuning, '_*2');
      expect(g.state.player.grounded).toBe(true);
      let n = 0;
      while (g.state.player.grounded && n++ < 60) run(g.state, g.tuning, 'left');
      expect(g.state.player.grounded).toBe(false);
      return g;
    };
    const late = (frames: number) => {
      const g = walkOff();
      return run(g.state, g.tuning, `left*${frames} left+jump`).filter((e) => e.type === 'jump');
    };
    expect(late(2)).toHaveLength(1);
    expect(late(2)[0]).toMatchObject({ coyote: true });
    expect(late(defaultTuning.jump.coyoteFrames + 2)).toHaveLength(0);
  });
});

describe('determinism', () => {
  const script = 'right*20 right+jump*15 right*30 left*10 left+jump*20 _*40 jump*5 _*60';

  it('same seed + inputs => same hash', () => {
    const a = newGame({ seed: 99 });
    const b = newGame({ seed: 99 });
    run(a.state, a.tuning, script);
    run(b.state, b.tuning, script);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('different seed => different RNG state (and hash)', () => {
    const a = newGame({ seed: 1 });
    const b = newGame({ seed: 2 });
    run(a.state, a.tuning, script);
    run(b.state, b.tuning, script);
    expect(a.state.player).toEqual(b.state.player);
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });

  it('state survives a JSON round trip mid-run', () => {
    const a = newGame({ seed: 5 });
    const b = newGame({ seed: 5 });
    run(a.state, a.tuning, 'right*25 right+jump*10');
    run(b.state, b.tuning, 'right*25 right+jump*10');
    const restored = JSON.parse(JSON.stringify(b.state));
    run(a.state, a.tuning, 'right*30 _*30');
    run(restored, b.tuning, 'right*30 _*30');
    expect(hashState(restored)).toBe(hashState(a.state));
  });
});

describe('rooms', () => {
  it('validates room definitions', () => {
    expect(() => buildRoom({ id: 'bad', rows: ['#P#', '##'] })).toThrow();
    expect(() => buildRoom({ id: 'nospawn', rows: ['#.#'] })).toThrow();
    expect(() => buildRoom({ id: 'x', rows: ['#P?'] })).toThrow();
    const r = buildRoom({ id: 'ok', rows: ['#a#', '#P#', '###'] });
    expect(r.spawns).toEqual({ a: { tx: 1, ty: 0 }, default: { tx: 1, ty: 1 } });
  });

  it('loads named spawns', () => {
    const { state, tuning } = newGame({ roomId: 'hall', spawn: 'a' });
    expect(state.roomId).toBe('hall');
    const sp = getRoom('hall').spawns.a;
    expect(Math.floor(state.player.x / tuning.world.tileSize)).toBe(sp?.tx);
  });
});
