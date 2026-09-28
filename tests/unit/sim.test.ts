import { describe, expect, it } from 'vitest';
import { hashState, step } from '../../src/sim/index';
import { solidAt } from '../../src/sim/physics/aabb';
import { resolveParams } from '../../src/sim/player/params';
import { cloneTuning, defaultTuning, PRESET_NAMES, presetTuning } from '../../src/sim/tuning';
import {
  ALL_ABILITIES,
  buildRoom,
  GYM_ROOMS,
  getRoom,
  mirrorRoomFile,
  ROOMS,
} from '../../src/sim/world/rooms';
import { newGame, run } from './helpers';

describe('sim basics', () => {
  it('spawns the player standing on the floor and settles', () => {
    const { state, tuning } = newGame();
    const room = getRoom(state.roomId);
    const sp = room.spawns.default;
    expect(state.player.y + state.player.h).toBe(((sp?.ty ?? 0) + 1) * tuning.world.tileSize);
    expect(state.player.grounded).toBe(true);
    run(state, tuning, '_*60');
    expect(state.frame).toBe(60);
    expect(state.player.grounded).toBe(true);
    expect(state.player.vy).toBe(0);
    expect(state.player.w).toBe(40);
    expect(state.player.h).toBe(80);
  });

  it('never overlaps solids while running and jumping around', () => {
    const { state, tuning } = newGame({ roomId: 'gym-01' });
    for (const script of [
      'left*60 right*200',
      'right+jump*20 right*60',
      'left+jump*30 left*40 jump*10 _*40',
    ]) {
      for (let i = 0; i < 400; i++) {
        run(state, tuning, script.split(' ')[i % 3] ?? '_');
        const p = state.player;
        expect(solidAt(getRoom(state.roomId), 64, p.x, p.y, p.w, p.h)).toBe(false);
      }
    }
  });
});

describe('determinism', () => {
  const script = 'right*20 right+jump*15 right*30 left*10 left+jump*20 _*40 jump*5 _*60 R+X1 R20 D+A1';

  it('same seed + inputs => same hash', () => {
    const a = newGame({ seed: 99, roomId: 'gym-02' });
    const b = newGame({ seed: 99, roomId: 'gym-02' });
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
    const a = newGame({ seed: 5, roomId: 'gym-02' });
    const b = newGame({ seed: 5, roomId: 'gym-02' });
    run(a.state, a.tuning, 'right*25 right+jump*10');
    run(b.state, b.tuning, 'right*25 right+jump*10');
    const restored = JSON.parse(JSON.stringify(b.state));
    run(a.state, a.tuning, 'right*30 _*30');
    run(restored, b.tuning, 'right*30 _*30');
    expect(hashState(restored)).toBe(hashState(a.state));
  });
});

describe('rooms', () => {
  const base = { abilities: ALL_ABILITIES };
  it('validates room files with Zod', () => {
    expect(() => buildRoom({ ...base, id: 'bad', rows: ['#P#', '##'] })).toThrow(/length/);
    expect(() => buildRoom({ ...base, id: 'nospawn', rows: ['#.#'] })).toThrow(/P/);
    expect(() => buildRoom({ ...base, id: 'x', rows: ['#P?'] })).toThrow(/unknown tile/);
    expect(() => buildRoom({ id: 'noab', rows: ['#P#'] } as never)).toThrow();
  });

  it('pads small rooms to 30x17 with solid, keeping the sketch centred', () => {
    const r = buildRoom({ ...base, id: 'tiny', rows: ['###', '#P#', '###'] });
    expect([r.width, r.height]).toEqual([30, 17]);
    expect(r.spawns.default).toEqual({ tx: 1 + r.padX, ty: 1 + r.padY });
    const g1 = getRoom('gym-01');
    expect([g1.width, g1.height]).toEqual([60, 17]);
  });

  it('loads all 14 gym rooms plus the hub, each with abilities, claims and a goal', () => {
    expect(GYM_ROOMS).toHaveLength(14);
    expect(ROOMS.has('hub')).toBe(true);
    for (const id of GYM_ROOMS) {
      const r = getRoom(id);
      expect(
        r.entities.some((e) => e.kind === 'goal'),
        id,
      ).toBe(true);
      expect(r.file.claims.G, id).toBeTruthy();
    }
    const hub = getRoom('hub');
    expect(hub.entities.filter((e) => e.kind === 'door').map((e) => e.to)).toEqual(GYM_ROOMS);
  });

  it('mirrors a room file (spikes flip)', () => {
    const f = { ...base, id: 'm', rows: ['#####', '#P.>#', '#####'] };
    expect(mirrorRoomFile(f).rows[1]).toBe('#<.P#');
  });

  it('a hub door takes you to its room (Up), with a fade-out freeze', () => {
    const g = newGame({ roomId: 'hub' });
    const door = getRoom('hub').entities.find((e) => e.char === '3');
    if (!door) throw new Error('no door 3');
    g.state.player.x = door.tx * 64 + 12;
    const evs = run(g.state, g.tuning, 'up _*20');
    expect(evs.map((e) => e.type)).toContain('roomExit');
    expect(g.state.roomId).toBe('gym-03');
    expect(g.state.player.abilities).toEqual(getRoom('gym-03').abilities);
  });

  it('touching G marks the goal and moves on to the next room', () => {
    const g = newGame({ roomId: 'gym-01' });
    const goal = getRoom('gym-01').entities.find((e) => e.kind === 'goal');
    if (!goal) throw new Error('no goal');
    g.state.player.x = goal.tx * 64 - 50;
    const evs = run(g.state, g.tuning, 'right*10 _*20');
    expect(evs.filter((e) => e.type === 'goal')).toHaveLength(1);
    expect(g.state.roomId).toBe('gym-02');
  });
});

describe('tuning presets and profiles', () => {
  it('has opus, celeste and hk presets', () => {
    expect(PRESET_NAMES).toEqual(['opus', 'celeste', 'hk']);
    expect(presetTuning('opus')).toEqual(cloneTuning(defaultTuning));
    expect(presetTuning('celeste').jump.gravity).toBe(2);
    expect(presetTuning('hk').run.groundAccel).toBeGreaterThan(100);
    expect(presetTuning('hk').assists.apexHang).toBe(false);
  });

  it('a movement profile overrides the player tuning only while active', () => {
    const t = cloneTuning(defaultTuning);
    const base = resolveParams(t, 'base');
    const heavy = resolveParams(t, 'heavy');
    expect(heavy.jumpSpeed).toBeLessThan(base.jumpSpeed);
    expect(heavy.maxRun).toBeCloseTo(base.maxRun * 0.85);
    expect(t.run.maxSpeed).toBe(defaultTuning.run.maxSpeed); // base tuning untouched
    expect(() => resolveParams(t, 'nope')).toThrow(/Unknown movement profile/);

    const a = newGame({ roomId: 'gym-01' });
    a.state.player.profile = 'heavy';
    a.tuning.assists.apexHang = false;
    let minY = a.state.player.y;
    const y0 = minY;
    for (let i = 0; i < 40; i++) {
      step(a.state, 16, a.tuning, []);
      minY = Math.min(minY, a.state.player.y);
    }
    expect(y0 - minY).toBe(defaultTuning.profiles.heavy?.shape?.jumpHeightPx);
  });
});
