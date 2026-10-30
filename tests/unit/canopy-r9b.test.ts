/**
 * The Canopy, round 9b (the round-9 builder's weak list, docs/design/levels/first-area.md):
 *  - The tunnel's glide crossing: the take-off is the hump's plumb east face, 384 over the far floor, over a 960 pit
 *    with a slick far face. From its top a jump, a jump and a kick, a walk-off jump late in coyote time all fall into
 *    the thorns (claws only); a jump held through, a glide from the apex and a walk-off glide all land on the far
 *    floor (tools/levels/glide-probe.ts).
 *  - The pit's hawker hunts her: a 30-frame tell, a strike where her glide will be. Struck, she is thrown on along her
 *    glide and still lands across; a check back, a drop and a fresh glide, or a cut take no hit.
 *  - The gap's chain: a Lamp press held from just after the first fling's release (inside the 8-frame cooldown,
 *    before the second lamp is in reach) flings the second lamp (`flingBufferFrames`).
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { probe } from '../../tools/levels/glide-probe';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
/** The hump's top (feet), the lip she jumps from (feet x), the far floor's lip. */
const HUMP: [number, number] = [5950, 1472];
const LIP = 6070;
const FAR = 7040;
const CLAWS = ['wallJump'];
const GLIDE = ['wallJump', 'glide'];

describe("the tunnel's glide crossing (r9b)", () => {
  it('no jump crosses: a jump, a jump and a kick, a coyote jump and a kick all fall into the thorns', () => {
    const runs = probe('cn-tunnel', HUMP[0], HUMP[1], LIP, 1, CLAWS, false, 300, 20, [
      'jump',
      'jump held',
      'jump + kick',
      'coyote jump + kick',
    ]);
    expect(runs.map((r) => `${r.plan}: ${r.end}`)).toEqual(runs.map((r) => `${r.plan}: thorns`));
    // ...and short of the far face by a margin (a better pogo or a later press must not find it).
    for (const r of runs) expect(r.x).toBeLessThan(FAR - 150);
  });

  it('every glide from a natural take-off lands clear of the lip', () => {
    const runs = probe('cn-tunnel', HUMP[0], HUMP[1], LIP, 1, GLIDE, false, 300, 20, [
      'jump held',
      'apex glide',
      'late glide',
      'walk-off glide',
    ]);
    for (const r of runs) {
      expect(r.end, r.plan).toBe('land');
      expect(r.x, r.plan).toBeGreaterThanOrEqual(FAR + 40);
    }
  });

  it('the hawker: struck mid-glide she still lands across; a check back, a drop or a cut takes no hit', () => {
    const bad: string[] = [];
    let struck = 0;
    for (const wait of [20, 70, 120, 170]) {
      for (const r of probe('cn-tunnel', HUMP[0], HUMP[1], LIP, 1, GLIDE, true, 300, wait, [
        'jump held',
        'apex glide',
        'walk-off glide',
        'apex, check back',
        'apex, drop',
        'apex, cut',
      ])) {
        if (r.end !== 'land' || r.x < FAR) bad.push(`${r.plan} @${wait}: ${r.end} (${r.x}, ${r.y})`);
        if (r.plan.startsWith('apex,') && r.hits > 0) bad.push(`${r.plan} @${wait}: hit`);
        if (!r.plan.startsWith('apex,')) struck += r.hits;
      }
    }
    expect(bad).toEqual([]);
    // (It does strike: a glide held through with no answer is hit.)
    expect(struck).toBeGreaterThan(0);
    expect(t.hawker.curiousFrames).toBeGreaterThanOrEqual(20);
    expect(t.hawker.glideKnockVx).toBeGreaterThan(0);
  });
});

describe("the gap's chain: an early press is kept (r9b)", () => {
  it('Lamp pressed and held 1-7 frames after the first release flings the second lamp', () => {
    const scene = getRoom('cn-gap');
    const ix = (id: string) => (scene.lures ?? []).findIndex((l) => l.id === id);
    const { down: D, left: L, lamp: B } = ActionBit;
    const eaten: number[] = [];
    for (let r = 1; r <= 7; r++) {
      const s = createState(1, t, scene, [], CLAWS as never, newSave(CLAWS as never));
      placePlayer(s, 3400, 1400, t, withShortcuts(scene, s.save), []);
      s.player.dj = 0;
      const ev: SimEvent[] = [];
      const run = (m: number) => {
        const e: SimEvent[] = [];
        step(s, m, t, withShortcuts(scene, s.save), e, W);
        ev.push(...e);
      };
      let k = 0;
      while (flingTarget(s, scene, t) !== ix('wick-gap-1') && k++ < 200) run(0);
      for (let i = 0; i < 4; i++) run(D | L | B);
      run(D | L);
      for (let f = 1; f <= 30; f++) run(D | L | (f >= r ? B : 0));
      const ids = ev.filter((e) => e.type === 'flingStart').map((e) => (e as { id: string }).id);
      if (!ids.includes('wick-gap-2')) eaten.push(r);
    }
    expect(eaten).toEqual([]);
  });
});
