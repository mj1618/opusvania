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
 *  - The den's warning frames the den's mouth (render's note: beat 2's tell and arrivals played on the frame's bottom
 *    edge): the mouth and its step well inside the view at 16:9, 16:10 and 21:9.
 *  - The Grove's wave fires only once she is clear of the arena gates (a glide down through the opening set it with
 *    her head in the gate's rect, and the gate shut on her).
 */
import { describe, expect, it } from 'vitest';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
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
// (r10: the hump and the pit 128 further west, the warning's floor 1,024 to the den's mouth.)
const HUMP: [number, number] = [5822, 1472];
const LIP = 5942;
const FAR = 6912;
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

describe("the den's warning frames the den's mouth (r9b)", () => {
  // (r10, review r9 #6: the mouth is an arch in the east wall at the floor, 7,808-8,000 x 1,600-1,856; zoom 1.1.)
  for (const [vw, vh] of [
    [1920, 1080],
    [1920, 1200],
    [2560, 1080],
  ] as const)
    it(`the mouth and its arrivals well inside the view, the mouth in the frame's middle third, at ${vw}x${vh}`, () => {
      for (const x of [6980, 7400, 7800]) {
        const scene = getRoom('cn-tunnel');
        const s = createState(1, t, scene, [], GLIDE as never, newSave(GLIDE as never));
        s.save.flags.push('cn-tunnel-wave');
        placePlayer(s, x, 1856, t, withShortcuts(scene, s.save), []);
        const ct = cameraFor(scene);
        const cam = createCamera(s, scene, ct, vw, vh);
        for (let k = 0; k < 150; k++) {
          step(s, 0, t, withShortcuts(scene, s.save), [], W);
          stepCamera(cam, s, scene, ct);
        }
        const v = lerpCamera(cam, cam, 1);
        // (The view's w / h are screen px; the world rect is that over the zoom.)
        const w = vw / cam.zoom;
        const h = vh / cam.zoom;
        expect(cam.zoom).toBeGreaterThanOrEqual(1);
        expect(v.y + h / 2, `bottom at x ${x}`).toBeGreaterThanOrEqual(1856 + 96);
        expect(v.x + w / 2, `east edge at x ${x}`).toBeGreaterThanOrEqual(7960);
        const k = (1728 - (v.y - h / 2)) / h;
        expect(k, `mouth height in frame at x ${x}`).toBeGreaterThanOrEqual(1 / 3);
        expect(k, `mouth height in frame at x ${x}`).toBeLessThanOrEqual(2 / 3);
        // ...and the glide's landing, the pit's far lip, still in it.
        expect(v.x - w / 2).toBeLessThanOrEqual(6912 - 200);
      }
    });
});

describe("the Grove's wave waits until she is clear of the arena gates (r9b)", () => {
  it('the trigger starts at least her height under every gate it shuts', () => {
    const scene = getRoom('cn-grove');
    const trig = (scene.triggers ?? []).find((q) => q.id === 'pit-wave');
    expect(trig).toBeDefined();
    for (const g of scene.gates ?? []) {
      if ((g as { shut?: string }).shut !== trig?.sets) continue;
      const over = g.x < (trig?.x ?? 0) + (trig?.w ?? 0) && g.x + g.w > (trig?.x ?? 0);
      if (over) expect((trig?.y ?? 0) - (g.y + g.h), g.id).toBeGreaterThanOrEqual(t.body.height + 32);
    }
  });
});
