import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W } from '../../src/render/contract';
import { GROVE, parseScene, TILE } from '../../src/scene/index';
import { solidAt } from '../../src/sim/physics/aabb';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, wallClimb } from './helpers';

const S = GROVE.solids;
const byTag = (tag: string) => S.filter((r) => r.tag === tag);

describe('the grove scene', () => {
  it('is three screens wide and about one and a half tall, on the tile grid', () => {
    expect(GROVE.width).toBe(3 * VIEW_W);
    expect(GROVE.height / VIEW_H).toBeGreaterThan(1.4);
    expect(GROVE.height / VIEW_H).toBeLessThan(1.6);
    expect(GROVE.width % TILE).toBe(0);
    expect(GROVE.height % TILE).toBe(0);
  });

  it('rejects bad data', () => {
    expect(() => parseScene({ ...GROVE, solids: [{ tag: 'lava', x: 0, y: 0, w: 1, h: 1 }] })).toThrow();
    expect(() => parseScene({ ...GROVE, solids: [{ tag: 'ground', x: -5, y: 0, w: 10, h: 10 }] })).toThrow(
      /bounds/,
    );
  });

  it('has continuous ground, a pool, floating platforms, a trunk pair and high ledges', () => {
    const floor = [...byTag('ground'), ...byTag('pool')].sort((a, b) => a.x - b.x);
    let x = 0;
    for (const r of floor) {
      expect(r.x).toBe(x);
      expect(r.y + r.h).toBe(GROVE.height);
      x = r.x + r.w;
    }
    expect(x).toBe(GROVE.width);
    expect(byTag('floating').length).toBeGreaterThanOrEqual(5);
    expect(byTag('trunk')).toHaveLength(2);
    expect(byTag('ledge').length).toBeGreaterThanOrEqual(1);
    expect(GROVE.oneWays.length).toBeGreaterThanOrEqual(1);
  });

  it('spawns the player standing on the ground', () => {
    const s = newSim();
    expect(feet(s)).toEqual(GROVE.spawn);
    expect(s.state.player.grounded).toBe(true);
    const b = defaultTuning.body;
    expect(solidAt(GROVE, GROVE.spawn.x - b.width / 2, GROVE.spawn.y - b.height, b.width, b.height)).toBe(
      false,
    );
  });

  it('the floor is not a corridor: a bluff taller than a jump stands in it, and a hollow', () => {
    const J = defaultTuning.shape.jumpHeightPx;
    const ground = byTag('ground');
    const bluff = ground[3];
    const before = ground[2];
    const terrace = ground[4];
    const hollow = ground[6];
    if (!bluff || !before || !terrace || !hollow) throw new Error('ground rects missing');
    // The bluff: more than a jump from the path west of it, a comfortable step from the terrace east of it,
    // and the branch (a jump from the path) is the step up to it.
    expect(before.y - bluff.y).toBeGreaterThan(J + 32);
    expect(terrace.y - bluff.y).toBeLessThanOrEqual(192);
    const branch = GROVE.oneWays[0];
    if (!branch) throw new Error('no branch');
    expect(before.y - branch.y).toBeLessThan(J);
    expect(branch.y - bluff.y).toBeLessThanOrEqual(96);
    // Holding right and jumping when blocked no longer crosses the scene: it stops at the bluff.
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(100, 1088);
    for (let i = 0; i < 12; i++) s.run('R60 R+J30 R20');
    expect(feet(s).x).toBeLessThan(bluff.x);
    // The hollow: deeper than she is tall, out of it in one jump either way.
    const beside = ground[5];
    const root = byTag('root').find((r) => r.x === 3968);
    if (!beside || !root) throw new Error('no ground by the hollow');
    expect(hollow.y - beside.y).toBeGreaterThan(defaultTuning.body.height);
    expect(hollow.y - root.y).toBeLessThanOrEqual(192);
  });

  it('the floor ends inside the shaft: trunk B stands on it, and the way on is up and over', () => {
    const [a, b] = byTag('trunk');
    const floor = byTag('ground').find((r) => r.x === 3072);
    if (!a || !b || !floor) throw new Error('no trunk pair on the floor');
    // Trunk A keeps its doorway (the way in, and the way back out west); trunk B has none.
    expect(floor.y - (a.y + a.h)).toBe(112);
    expect(b.y + b.h).toBe(floor.y);
    // Walking east along the floor from the well stops at trunk B's bark.
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(3120, floor.y);
    s.run('R120');
    expect(feet(s)).toEqual({ x: b.x - 20, y: floor.y });
    // And west again, out under trunk A and up onto the terrace: the shaft is not a trap.
    s.run('L60');
    expect(feet(s).x).toBeLessThan(a.x);
    const terrace = byTag('ground')[4];
    if (!terrace) throw new Error('no terrace');
    expect(hopOnto(s, terrace)).toBeGreaterThan(0);
    // West of the shaft the floor is crossed on foot in both directions (the bluff by the branch or a double jump).
    const west = [...byTag('ground'), ...byTag('pool')].filter((r) => r.x < b.x).sort((p, q) => p.x - q.x);
    // (The root step at the bank's foot, 384, is tagged `root`: a tap jump up it, then one up the bank.)
    for (const order of [west, [...west].reverse()]) {
      const q = newSim({ ...GROVE, enemies: [] });
      const first = order[0];
      if (!first) throw new Error('no floor');
      q.place(first.x + first.w / 2, first.y);
      for (const r0 of order) {
        // (Past the root step at the bank's foot, which is a floor of its own to this pilot.)
        const r = r0.x === 384 ? { ...r0, x: 448, w: r0.w - 64 } : r0;
        expect(hopOnto(q, r, 600), `onto the floor at ${r.x}`).toBeGreaterThan(-1);
      }
    }
    // East of it too: hollow, root, the ground beyond, the right rise.
    const root = byTag('root').find((r) => r.x === 3968);
    const east = byTag('ground').filter((r) => r.x > b.x && r.y > 1000);
    const [hollow, beyond, rise] = east;
    if (!root || !hollow || !beyond || !rise) throw new Error('no floor east of the shaft');
    const open = { x: root.x + root.w, y: beyond.y, w: beyond.x + beyond.w - root.x - root.w };
    for (const order of [
      [hollow, root, open, rise],
      [rise, open, root, hollow],
    ]) {
      const q = newSim({ ...GROVE, enemies: [] });
      const first = order[0];
      if (!first) throw new Error('no floor');
      q.place(first.x + first.w / 2, first.y);
      for (const r of order) expect(hopOnto(q, r, 600), `onto the floor at ${r.x}`).toBeGreaterThan(-1);
    }
    // The branch is the step up the bluff, with single jumps.
    const k = newSim({ ...GROVE, enemies: [] });
    k.place(2100, 1280);
    k.run('J40 .20');
    expect(feet(k)).toEqual({ x: 2100, y: 1024 });
    k.run('R10 R+J40 .30');
    expect(feet(k).y).toBe(960);
    expect(k.state.player.grounded).toBe(true);
    expect(k.events.some((e) => e.type === 'jump' && e.kind === 'double')).toBe(false);
  });

  it('falling in the pool is harmless: you can jump out either side', () => {
    const pool = byTag('pool')[0];
    if (!pool) throw new Error('no pool');
    const s = newSim();
    s.place(pool.x + pool.w / 2, pool.y);
    const right = S.find((r) => r.tag === 'ground' && r.x === pool.x + pool.w);
    const left = S.find((r) => r.tag === 'ground' && r.x + r.w === pool.x);
    if (!right || !left) throw new Error('pool has no banks');
    expect(hopOnto(s, right)).toBeGreaterThan(0);
    expect(hopOnto(s, pool)).toBeGreaterThan(0);
    expect(hopOnto(s, left)).toBeGreaterThan(0);
  });

  it('route up the left: bank, five floating platforms, the high ledge, the trunk top', () => {
    const s = newSim();
    const route = [S[0], ...byTag('floating').slice(0, 5), byTag('ledge')[0], byTag('trunk')[0]];
    for (const r of route) {
      if (!r) throw new Error('route rect missing');
      expect(hopOnto(s, r), `onto ${r.tag} at ${r.x},${r.y}`).toBeGreaterThan(0);
    }
    // And on up to the top of the taller trunk: the highest point of the scene.
    const tall = byTag('trunk')[1];
    if (!tall) throw new Error('no second trunk');
    expect(hopOnto(s, tall)).toBeGreaterThan(0);
  });

  it('the trunk pair is a wall-jump shaft from the ground to the high ledge', () => {
    const [a, b] = byTag('trunk');
    if (!a || !b) throw new Error('no trunk pair');
    const s = newSim();
    s.place((a.x + a.w + b.x) / 2, 1280);
    expect(wallClimb(s, a.y, -1)).toBeGreaterThanOrEqual(2);
    expect(feet(s).y).toBe(a.y);
  });

  it('route up the right: root, branch, two floating platforms, the far bluff (the old far ledge, standing on the rise now)', () => {
    const s = newSim();
    s.place(3800, 1280);
    const far = byTag('ground').find((r) => r.x === 5472);
    const route = [
      byTag('root').find((r) => r.x === 3968),
      GROVE.oneWays[1],
      ...byTag('floating').slice(5),
      far,
    ];
    for (const r of route) {
      if (!r) throw new Error('route rect missing');
      expect(hopOnto(s, r), `onto ${r.tag} at ${r.x},${r.y}`).toBeGreaterThan(0);
    }
  });
});
