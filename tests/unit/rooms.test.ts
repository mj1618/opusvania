import { describe, expect, it } from 'vitest';
import { CameraBeats, leanWeight } from '../../src/render/camera/beats';
import { createCamera } from '../../src/render/camera/index';
import { cameraFor, cameraTuning } from '../../src/render/camera/tuning';
import { SAFE_H } from '../../src/render/contract';
import { LayerTree } from '../../src/render/scene/layer-tree';
import { coverRect } from '../../src/render/scene/lib/bg-bake';
import { DEFAULT_ROOM, GROVE, getRoom, parseScene, ROOM_IDS, WOOD_HATCH } from '../../src/scene/index';
import { ABILITIES } from '../../src/sim/abilities';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { solidAt } from '../../src/sim/physics/aabb';
import { resolveParams } from '../../src/sim/player/params';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { flatScene, newSim } from './helpers';

const R = ActionBit.right;
const J = ActionBit.jump;

/** A sim on `scene` that steps raw input masks. */
function sim(scene: Scene, abilities?: string[], t: Tuning = cloneTuning(defaultTuning)) {
  const events: SimEvent[] = [];
  const state = createState(1, t, scene, events, abilities);
  return {
    state,
    events,
    t,
    /** Steps `n` frames of `mask`; returns this run's events. */
    run(mask: number, n = 1): SimEvent[] {
      const from = events.length;
      for (let i = 0; i < n; i++) step(state, mask, t, scene, events);
      return events.slice(from);
    },
  };
}

/** Out of the cocoon at once: three presses of jump after the listening frames. */
function hatched(s: ReturnType<typeof sim>): void {
  s.run(0, s.t.hatch.listenFrom + 1);
  for (let i = 0; i < 3; i++) {
    s.run(J, 1);
    s.run(0, 2);
  }
  expect(s.state.hatch?.done).toBe(true);
}

describe('the room registry', () => {
  it('boots wood-hatch by default; the test grove is a room of its own', () => {
    expect(DEFAULT_ROOM).toBe('wood-hatch');
    expect(ROOM_IDS).toEqual(['wood-hatch', 'test-grove']);
    expect(getRoom('test-grove')).toBe(GROVE);
    expect(GROVE.id).toBe('test-grove');
    expect(() => getRoom('nowhere')).toThrow(/Rooms: wood-hatch, test-grove/);
  });

  it('every room has shot stops inside it', () => {
    for (const id of ROOM_IDS) expect(getRoom(id).shots?.wide.length).toBeGreaterThan(0);
  });

  it('rejects exits that are not spans of their edge, and overlapping ones', () => {
    const base = { ...flatScene(), pickups: [], pods: [] };
    expect(() => parseScene({ ...base, exits: [{ id: 'a', edge: 's', from: 0, to: 9000 }] })).toThrow(/span/);
    expect(() =>
      parseScene({
        ...base,
        exits: [
          { id: 'a', edge: 's', from: 0, to: 600 },
          { id: 'b', edge: 's', from: 500, to: 900 },
        ],
      }),
    ).toThrow(/overlap/);
  });
});

describe('abilities', () => {
  it('wood-hatch starts with none of the four; the test grove and test scenes with all', () => {
    const t = cloneTuning(defaultTuning);
    expect(createState(1, t, WOOD_HATCH).save.abilities).toEqual([]);
    expect(createState(1, t, GROVE).save.abilities).toEqual([...ABILITIES]);
    expect(createState(1, t, flatScene()).save.abilities).toEqual([...ABILITIES]);
    // An explicit kit wins, in canonical order, unknown ids dropped.
    expect(createState(1, t, WOOD_HATCH, [], ['dash', 'glide', 'flight']).save.abilities).toEqual([
      'glide',
      'dash',
    ]);
  });

  it('resolveParams turns the moves she does not own off', () => {
    const t = cloneTuning(defaultTuning);
    const none = resolveParams(t, []);
    expect([none.glide, none.wallSlide, none.wallJump, none.dash, none.doubleJumps]).toEqual([
      false,
      false,
      false,
      false,
      0,
    ]);
    const all = resolveParams(t);
    expect([all.glide, all.wallSlide, all.wallJump, all.dash, all.doubleJumps]).toEqual([
      true,
      true,
      true,
      true,
      t.jump.doubleJumps,
    ]);
    // Always hers: variable jump, fast fall, pogo.
    expect([none.variableJump, none.pogo, none.fastFallMax]).toEqual([true, true, all.fastFallMax]);
  });

  it('without them: no dash, no double jump, no glide, no wall slide or kick', () => {
    const wall = { tag: 'trunk' as const, x: 2200, y: 0, w: 128, h: 800 };
    const scene = flatScene({ solids: [wall] });
    const s = sim(scene, []);
    expect(s.run(ActionBit.dash, 1).some((e) => e.type === 'dashStart')).toBe(false);
    s.run(0, 20);
    // Jump, then press again at the apex: no double jump; hold it falling: no glide.
    const air = [...s.run(J, 12), ...s.run(0, 14), ...s.run(J, 40)];
    expect(air.filter((e) => e.type === 'jump')).toHaveLength(1);
    expect(air.some((e) => e.type === 'glideStart')).toBe(false);
    s.run(0, 30);
    // Jump into the wall holding toward it, press again: she slides down nothing and kicks off nothing.
    const atWall = [...s.run(R | J, 20), ...s.run(R, 6), ...s.run(R | J, 6), ...s.run(R, 40)];
    expect(atWall.some((e) => e.type === 'wallSlideStart')).toBe(false);
    expect(atWall.filter((e) => e.type === 'jump' && e.kind === 'wall')).toHaveLength(0);
    // With them, the same wall takes a slide and a kick.
    const w = sim(scene);
    w.run(R | J, 20);
    const kick = [...w.run(R, 6), ...w.run(R | J, 6), ...w.run(R, 10)];
    expect(kick.some((e) => e.type === 'wallSlideStart')).toBe(true);
    expect(kick.some((e) => e.type === 'jump' && e.kind === 'wall')).toBe(true);
  });

  it('the Grove plays exactly as before: its pilots run with every ability', () => {
    const s = newSim(GROVE);
    expect(s.state.save.abilities).toEqual([...ABILITIES]);
    expect(s.state.hatch).toBeNull();
  });
});

describe('the hatching', () => {
  it('shut in: no input moves her; three presses (after the fade-up) break the cocoon', () => {
    const s = sim(WOOD_HATCH);
    const x0 = s.state.player.x;
    // Presses while the picture fades up do not count.
    const early = s.run(J, 1);
    expect(early.some((e) => e.type === 'hatchStir')).toBe(false);
    s.run(R, s.t.hatch.listenFrom);
    expect(s.state.player.x).toBe(x0);
    const stirs: SimEvent[] = [];
    for (let i = 0; i < 3; i++) {
      stirs.push(...s.run(ActionBit.attack, 1), ...s.run(0, 3));
    }
    const kinds = stirs.map((e) => e.type);
    expect(kinds.filter((k) => k === 'hatchStir')).toHaveLength(3);
    const hatch = stirs.find((e) => e.type === 'hatch');
    expect(hatch).toMatchObject({ auto: false, cx: WOOD_HATCH.hatch?.x, cy: WOOD_HATCH.hatch?.y });
    // The breaking press was not a jump; from then on she runs.
    expect(kinds).not.toContain('jump');
    s.run(R, 30);
    expect(s.state.player.x).toBeGreaterThan(x0 + 100);
  });

  it('with no input it stirs on its own and breaks after autoFrames', () => {
    const s = sim(WOOD_HATCH);
    const ev = s.run(0, s.t.hatch.autoFrames);
    const stirs = ev.filter((e) => e.type === 'hatchStir');
    expect(stirs.length).toBeGreaterThanOrEqual(3);
    expect(stirs.every((e) => e.type === 'hatchStir' && e.auto)).toBe(true);
    expect(ev.find((e) => e.type === 'hatch')).toMatchObject({ auto: true, frames: s.t.hatch.autoFrames });
  });

  it('a teleport ends it silently', () => {
    const s = newSim(WOOD_HATCH);
    s.place(1900, 960);
    expect(s.state.hatch?.done).toBe(true);
    expect(s.events.some((e) => e.type === 'hatch')).toBe(false);
  });
});

describe('falls and the exit', () => {
  it('a fall off the branch costs nothing: caught, she is back on her last ground at once', () => {
    const s = sim(WOOD_HATCH);
    hatched(s);
    // Stand on the burl's stretch a while (safe ground), then walk off the edge of gap A (2240).
    s.state.player.x = 2000;
    s.state.player.y = 960 - s.state.player.h;
    s.run(0, 30);
    const ev = s.run(R, 160);
    const caught = ev.find((e) => e.type === 'fallCatch');
    expect(caught).toMatchObject({ id: 'below' });
    const back = ev.find((e) => e.type === 'fallReturn');
    expect(back).toBeDefined();
    const i = ev.findIndex((e) => e.type === 'fallReturn');
    expect(ev[i + 1]?.type).toBe('spawn');
    // Back on the branch west of the gap, nothing lost.
    expect(back).toMatchObject({ x: 2240 - s.t.room.returnInset, y: 960 });
    expect(s.state.player.hp).toBe(s.state.player.hpMax);
    expect(s.state.save.abilities).toEqual([]);
  });

  it('dropping off the branch end leaves the room; it fades and starts again', () => {
    const s = sim(WOOD_HATCH, ['glide']);
    hatched(s);
    const ev: SimEvent[] = [];
    // From the branch end, walk off into the dark.
    const st = s.state;
    const drop = WOOD_HATCH.marks?.drop ?? { x: 0, y: 0 };
    st.player.x = drop.x - 120 - st.player.w / 2;
    st.player.y = drop.y - st.player.h;
    ev.push(...s.run(R, 200));
    const out = ev.find((e) => e.type === 'roomExit');
    expect(out).toMatchObject({ id: 'drop', edge: 's', frames: s.t.room.exitFrames });
    const enter = ev.findIndex((e) => e.type === 'roomEnter');
    expect(enter).toBeGreaterThan(0);
    expect(ev[enter + 1]).toMatchObject({ type: 'spawn', x: 864, y: 1024 });
    // A fresh room: the cocoon again, the save kept.
    expect(s.state.hatch).toEqual({ frames: expect.any(Number), presses: 0, done: false });
    expect(s.state.save.abilities).toEqual(['glide']);
    expect(s.state.exit).toBeNull();
  });
});

/** Feet centre and whether there is a top under the point `ahead` px in front of her leading edge. */
function groundAhead(scene: Scene, st: GameState, ahead: number): boolean {
  const p = st.player;
  const x = p.x + p.w + ahead;
  return solidAt(scene, x, p.y + p.h, 1, 1);
}

describe('wood-hatch play checks', () => {
  /**
   * The brief's naive player (done means 8): hold right; press jump (held ~14 frames) when blocked by
   * a wall or at the edge of a gap. Nothing else. From the break-out it has to reach the exit.
   */
  function naive(
    wait: 'auto' | 'press',
    edge = 12,
  ): { exit: string | null; frames: number; catches: number; hatchFrame: number } {
    const s = sim(WOOD_HATCH);
    if (wait === 'press') hatched(s);
    let hold = 0;
    let catches = 0;
    let hatchFrame = s.state.hatch?.done ? s.state.frame : -1;
    for (let f = 0; f < 60 * 60; f++) {
      const p = s.state.player;
      if (hold === 0 && p.grounded && (p.wallDir === 1 || !groundAhead(WOOD_HATCH, s.state, edge))) hold = 14;
      const mask = R | (hold > 0 ? J : 0);
      if (hold > 0) hold--;
      for (const e of s.run(mask, 1)) {
        if (e.type === 'hatch') hatchFrame = s.state.frame;
        if (e.type === 'fallCatch') catches++;
        if (e.type === 'roomExit') return { exit: e.id, frames: s.state.frame, catches, hatchFrame };
      }
    }
    return { exit: null, frames: s.state.frame, catches, hatchFrame };
  }

  it('the naive bot gets from the break-out to the exit (pressed out, and waiting for it)', () => {
    const pressed = naive('press');
    expect(pressed).toMatchObject({ exit: 'drop', catches: 0 });
    const waited = naive('auto');
    expect(waited).toMatchObject({ exit: 'drop', catches: 0 });
    // Under the brief's 45 s even when it waits 12 s for the cocoon.
    expect(waited.frames).toBeLessThan(45 * 60);
    // The reviewer's bot (jumps 24 px from an edge) too.
    expect(naive('press', 24)).toMatchObject({ exit: 'drop', catches: 0 });
    // The run lasts: the brief's 10-30 s from the hatch to the exit, even at full speed with no hesitation.
    const run = (pressed.frames - pressed.hatchFrame) / 60;
    console.info(
      `wood-hatch naive bot: hatch -> exit ${run.toFixed(1)} s, boot -> exit ${(waited.frames / 60).toFixed(1)} s waiting`,
    );
    expect(run).toBeGreaterThan(10);
    expect(run).toBeLessThan(30);
  });

  it('the route has height: it rises to a crown and comes down into the canopy', () => {
    const far = WOOD_HATCH.solids.find((q) => q.tag === 'branch' && q.x + q.w === WOOD_HATCH.width);
    const path = WOOD_HATCH.solids.filter((q) => q.tag === 'branch' && q !== far).sort((a, b) => a.x - b.x);
    const ys = path.map((q) => q.y);
    const start = ys[0] ?? 0;
    expect(start - Math.min(...ys)).toBeGreaterThanOrEqual(256);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(512);
    // No two stretches alike in length; none longer than the cocoon row's.
    const lens = path.map((q) => q.w);
    expect(new Set(lens).size).toBeGreaterThanOrEqual(lens.length - 2);
  });

  it('the far branch across the promise gap is out of reach with the starting kit', () => {
    // The far branch: another tree's, entering from the room's east edge beyond the promise gap.
    const far = WOOD_HATCH.solids.find((q) => q.tag === 'branch' && q.x + q.w === WOOD_HATCH.width);
    const promise = WOOD_HATCH.marks?.promise;
    expect(far).toBeDefined();
    expect(far?.x).toBe(promise?.x1);
    // Every top she can stand on is more than a jump (272) under it, or more than a running jump
    // (~410 px on the flat, less rising) short of it.
    const tops = WOOD_HATCH.solids.filter((q) => q !== far && q.tag === 'branch');
    const farTop = far?.y ?? 0;
    for (const q of tops) {
      const dx = Math.max(0, (far?.x ?? 0) - (q.x + q.w));
      const dy = q.y - farTop;
      expect(dy >= 300 || dx > 450, `top at ${q.x},${q.y}`).toBe(true);
    }
    // And the wide gap itself: a held running jump off the crown's end comes down below it, on the way on.
    const s = sim(WOOD_HATCH);
    hatched(s);
    const x0 = promise?.x0 ?? 0;
    s.state.player.x = x0 - 300;
    s.state.player.y = (promise?.y ?? 0) - s.state.player.h;
    s.run(R, 22);
    s.run(R | J, 20);
    const land = s.run(R, 40).find((e) => e.type === 'land');
    expect(land?.y).toBeGreaterThan((promise?.y ?? 0) + 100);
    expect(land?.x).toBeLessThan(promise?.x1 ?? 0);
  });
});

describe('wood-hatch fits the wood backdrop', () => {
  it('far0 bakes as one tile, so the far pair pass (and with it the sky and the moon) is built', () => {
    // far.ts: far0 is baked at 0.62 with a 60 px pad and shown with the sky only when it is a single
    // tile (bg-bake MAX_TILE_W 2048). A wider room (a wider camera range) splits it, and the opaque far
    // composite then hides the sky: no moon (round 2, at 8192 wide).
    const r = coverRect(new LayerTree(WOOD_HATCH), 'far0', 60);
    expect(r.w * 0.62).toBeLessThanOrEqual(2048);
  });
});

describe('the room camera', () => {
  it('the test grove keeps the shared tuning; wood-hatch frames her feet at 0.62', () => {
    expect(cameraFor(GROVE)).toBe(cameraTuning);
    const ct = cameraFor(WOOD_HATCH);
    expect(ct.anchorY).toBe(0.62);
    const st = createState(1, cloneTuning(defaultTuning), WOOD_HATCH);
    const cam = createCamera(st, WOOD_HATCH, ct);
    const feet = st.player.y + st.player.h;
    expect((feet - cam.y) / SAFE_H).toBeCloseTo(0.62, 2);
  });

  it('the lean follows sim time after the hatch; a teleport or a restart ends it', () => {
    const lean = WOOD_HATCH.camera?.lean;
    expect(lean).toBeDefined();
    if (!lean) return;
    expect(leanWeight(lean, lean.from - 0.1)).toBe(0);
    expect(leanWeight(lean, lean.from + lean.in + 0.1)).toBe(1);
    expect(leanWeight(lean, lean.from + lean.in + lean.hold + lean.out + 0.1)).toBe(0);
    const b = new CameraBeats(WOOD_HATCH.camera);
    b.onStep([{ type: 'hatch', x: 0, y: 0, cx: 0, cy: 0, auto: false, frames: 200 }], 201);
    b.update(1 / 60, 201, 1);
    expect(b.y).toBeCloseTo(WOOD_HATCH.camera?.hatchKick ?? 0, 0);
    const mid = 201 + Math.round((lean.from + lean.in + 1) * 60);
    for (let i = 0; i < 30; i++) b.update(1 / 60, mid, 1);
    expect([b.x, b.y]).toEqual([lean.x, lean.y]);
    b.onStep([{ type: 'spawn', x: 0, y: 0 }], mid + 1);
    b.update(1 / 60, mid + 1, 1);
    expect([b.x, b.y]).toEqual([0, 0]);
  });
});
