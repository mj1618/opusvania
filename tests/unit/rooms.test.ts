import { describe, expect, it } from 'vitest';
import worldJson from '../../content/world.json' with { type: 'json' };
import { CameraBeats, leanWeight } from '../../src/render/camera/beats';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor, cameraTuning } from '../../src/render/camera/tuning';
import { SAFE_H } from '../../src/render/contract';
import { LayerTree } from '../../src/render/scene/layer-tree';
import { coverRect } from '../../src/render/scene/lib/bg-bake';
import { DEFAULT_ROOM, GROVE, getRoom, parseScene, ROOM_IDS, WOOD_HATCH } from '../../src/scene/index';
import { ABILITIES } from '../../src/sim/abilities';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, placePlayer, step } from '../../src/sim/index';
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
    // (From content/world.json: the game's rooms, then the test rooms. A new room needs no edit here.)
    expect(ROOM_IDS).toEqual([...worldJson.rooms.map((r) => r.id), ...worldJson.tests]);
    expect(ROOM_IDS[0]).toBe(worldJson.start);
    expect(getRoom('test-grove')).toBe(GROVE);
    expect(GROVE.id).toBe('test-grove');
    expect(() => getRoom('nowhere')).toThrow(/Rooms: wood-hatch, wood-chase/);
  });

  it('every room has shot stops inside it', () => {
    for (const id of ROOM_IDS) expect(getRoom(id).shots?.wide.length).toBeGreaterThan(0);
  });

  it('rejects exits that are not spans of their edge, and overlapping ones', () => {
    const base = { ...flatScene(), pickups: [], pods: [] };
    expect(() =>
      parseScene({
        ...base,
        exits: [{ id: 'a', edge: 's', from: 0, to: 9000 }],
      }),
    ).toThrow(/span/);
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
  it('shut in: no input moves her; three presses of any button break the cocoon', () => {
    const s = sim(WOOD_HATCH);
    const x0 = s.state.player.x;
    s.run(0, s.t.hatch.listenFrom);
    expect(s.state.player.x).toBe(x0);
    const stirs: SimEvent[] = [];
    for (let i = 0; i < 3; i++) {
      stirs.push(...s.run(ActionBit.attack, 1), ...s.run(0, 3));
    }
    const kinds = stirs.map((e) => e.type);
    expect(kinds.filter((k) => k === 'hatchStir')).toHaveLength(3);
    const hatch = stirs.find((e) => e.type === 'hatch');
    expect(hatch).toMatchObject({
      auto: false,
      cx: WOOD_HATCH.hatch?.x,
      cy: WOOD_HATCH.hatch?.y,
    });
    // The breaking press was not a jump; from then on she runs.
    expect(kinds).not.toContain('jump');
    s.run(R, 30);
    expect(s.state.player.x).toBeGreaterThan(x0 + 100);
  });

  it('jump and a move key are presses too, even while the picture fades up; it breaks once it listens (curious first-timer)', () => {
    // The first-timer's opening: J10 .90, then R20 .60 J20 (A and X came after): jump, right, jump.
    const s = sim(WOOD_HATCH);
    const x0 = s.state.player.x;
    const ev = s.run(J, 10).concat(s.run(0, 90), s.run(R, 20), s.run(0, 60), s.run(J, 20));
    expect(ev.filter((e) => e.type === 'hatchStir' && !e.auto)).toHaveLength(3);
    expect(ev.find((e) => e.type === 'hatch')).toMatchObject({ auto: false, frames: 181 });
    expect(ev.some((e) => e.type === 'jump')).toBe(false);
    // Three quick presses during the fade-up count, and the cocoon breaks as it starts to listen.
    const q = sim(WOOD_HATCH);
    const early = q.run(J, 1).concat(q.run(0, 2), q.run(R, 1), q.run(0, 2), q.run(J, 1));
    expect(early.filter((e) => e.type === 'hatchStir')).toHaveLength(3);
    expect(early.some((e) => e.type === 'hatch')).toBe(false);
    const rest = q.run(0, q.t.hatch.listenFrom);
    expect(rest.find((e) => e.type === 'hatch')).toMatchObject({
      auto: false,
      frames: q.t.hatch.listenFrom + 1,
    });
    expect(q.state.player.x).toBe(x0);
  });

  it('with no input it stirs on its own and breaks after autoFrames', () => {
    const s = sim(WOOD_HATCH);
    const ev = s.run(0, s.t.hatch.autoFrames);
    const stirs = ev.filter((e) => e.type === 'hatchStir');
    expect(stirs.length).toBeGreaterThanOrEqual(3);
    expect(stirs.every((e) => e.type === 'hatchStir' && e.auto)).toBe(true);
    expect(ev.find((e) => e.type === 'hatch')).toMatchObject({
      auto: true,
      frames: s.t.hatch.autoFrames,
    });
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
    // Stand on S2 a while (safe ground), then walk off the edge of gap A.
    const s2 = stretch('S2');
    place(s, s2.x1 - 100);
    s.run(0, 30);
    const ev = s.run(R, 160);
    const caught = ev.find((e) => e.type === 'fallCatch');
    expect(caught).toMatchObject({ id: 'below' });
    const back = ev.find((e) => e.type === 'fallReturn');
    expect(back).toBeDefined();
    const i = ev.findIndex((e) => e.type === 'fallReturn');
    expect(ev[i + 1]?.type).toBe('spawn');
    // Back on the branch west of the gap, a step in from the lip (the rolling top counts as one), nothing lost.
    expect(back).toMatchObject({
      x: s2.x1 - s.t.room.returnInset,
      y: topAt(s2.x1 - s.t.room.returnInset),
    });
    expect(s.state.player.hp).toBe(s.state.player.hpMax);
    expect(s.state.save.abilities).toEqual([]);
  });

  it('dropping off the branch end leaves the room; it fades and starts again', () => {
    const s = sim(WOOD_HATCH, ['glide']);
    hatched(s);
    const ev: SimEvent[] = [];
    // From the branch end, walk off into the dark.
    const drop = WOOD_HATCH.marks?.drop ?? { x: 0, y: 0 };
    place(s, drop.x - 120);
    ev.push(...s.run(R, 200));
    const out = ev.find((e) => e.type === 'roomExit');
    expect(out).toMatchObject({
      id: 'drop',
      edge: 's',
      frames: s.t.room.exitFrames,
    });
    const enter = ev.findIndex((e) => e.type === 'roomEnter');
    expect(enter).toBeGreaterThan(0);
    expect(ev[enter + 1]).toMatchObject({ type: 'spawn', ...WOOD_HATCH.spawn });
    // A fresh room: the cocoon again, the save kept.
    // (Right still held as it starts again counts as a stir: a move key is a press.)
    expect(s.state.hatch).toEqual({
      frames: expect.any(Number),
      presses: expect.any(Number),
      done: false,
    });
    expect(s.state.save.abilities).toEqual(['glide']);
    expect(s.state.exit).toBeNull();
  });
});

/** Feet centre and whether there is a top under the point `ahead` px in front of her leading edge. */
/** Ground `ahead` px in front of her leading edge, within a rolling step (16 px) below her feet: no gap there. */
function groundAhead(scene: Scene, st: GameState, ahead: number): boolean {
  const p = st.player;
  const x = p.x + p.w + ahead;
  return solidAt(scene, x, p.y + p.h, 1, 16);
}

/** The walk top under x (the highest branch rect there). */
function topAt(x: number): number {
  const q = WOOD_HATCH.solids.filter((o) => o.tag === 'branch' && x >= o.x && x < o.x + o.w);
  return Math.min(...q.map((o) => o.y));
}

function stretch(id: string) {
  const s = WOOD_HATCH.marks?.stretches?.find((q) => q.id === id);
  if (!s) throw new Error(`no stretch ${id}`);
  return s;
}

/** Stands her (feet centre) on the walk top at x, at rest. */
function place(s: { state: GameState; t: Tuning }, x: number): void {
  placePlayer(s.state, x, topAt(x), s.t, WOOD_HATCH, []);
}

describe('wood-hatch play checks', () => {
  /**
   * The brief's naive player (done means 8): hold right; press jump (held ~14 frames) when blocked by
   * a wall or at the edge of a gap. Nothing else. From the break-out it has to reach the exit.
   */
  function naive(
    wait: 'auto' | 'press',
    edge = 12,
  ): {
    exit: string | null;
    frames: number;
    catches: number;
    hatchFrame: number;
  } {
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

  it('the route has height and every stretch rolls: rises to a crown, comes down into the canopy', () => {
    const stretches = WOOD_HATCH.marks?.stretches ?? [];
    expect(stretches.length).toBeGreaterThanOrEqual(8);
    const walk = WOOD_HATCH.solids.filter((q) => q.tag === 'branch');
    const tops = stretches.map((st) => walk.filter((q) => q.x >= st.x0 && q.x < st.x1));
    const mean = tops.map((qs) => qs.reduce((a, q) => a + q.y * q.w, 0) / qs.reduce((a, q) => a + q.w, 0));
    expect((mean[0] ?? 0) - Math.min(...mean)).toBeGreaterThanOrEqual(256);
    expect(Math.max(...mean) - Math.min(...mean)).toBeGreaterThanOrEqual(512);
    tops.forEach((qs, i) => {
      const id = stretches[i]?.id;
      // Covered end to end by narrow rects, each joint a rolling step, the whole stretch rolling.
      expect(
        qs.every((q) => q.w >= 48 && q.w <= 128),
        `${id} widths`,
      ).toBe(true);
      for (let k = 1; k < qs.length; k++) {
        const a = qs[k - 1];
        const b = qs[k];
        expect(b?.x, `${id} abuts`).toBe((a?.x ?? 0) + (a?.w ?? 0));
        expect(Math.abs((b?.y ?? 0) - (a?.y ?? 0)), `${id} step`).toBeLessThanOrEqual(12);
      }
      const ys = qs.map((q) => q.y);
      if (qs.length > 3) expect(Math.max(...ys) - Math.min(...ys), `${id} roll`).toBeGreaterThanOrEqual(8);
    });
    // No two stretches alike in length.
    const lens = stretches.map((st) => st.x1 - st.x0);
    expect(new Set(lens).size).toBeGreaterThanOrEqual(lens.length - 1);
  });

  it('the stretches grow from the trees and each other; the far branch is only a picture', () => {
    const m = WOOD_HATCH.marks;
    const ids = new Set([...(m?.trees ?? []).map((t) => t.id), ...(m?.stretches ?? []).map((t) => t.id)]);
    for (const st of m?.stretches ?? [])
      expect(ids.has(st.parent), `${st.id} parent ${st.parent}`).toBe(true);
    // Only the west trunk is collision.
    for (const t of m?.trees ?? [])
      expect(WOOD_HATCH.solids.some((q) => q.tag === 'trunk' && q.x <= t.x && q.x + q.w >= t.x)).toBe(
        !!t.solid,
      );
    // The far branch is a back-layer picture: no solid on its line, and it starts past the promise gap.
    const far = m?.farBranch;
    expect(far).toBeDefined();
    expect(far?.points[0]?.[0]).toBe(m?.promise?.x1);
    for (const [x, y] of far?.points ?? [])
      expect(WOOD_HATCH.solids.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h)).toBe(
        false,
      );
  });

  it('a held running jump off the crown into the promise gap comes down on her way on, below', () => {
    const promise = WOOD_HATCH.marks?.promise;
    const s = sim(WOOD_HATCH);
    hatched(s);
    place(s, (promise?.x0 ?? 0) - 300);
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

  it('the beats: the cocoon framed higher while shut in, the kick, the lean on sim time; running yields; a restart ends them', () => {
    const cam = WOOD_HATCH.camera;
    const lean = cam?.lean;
    const hf = cam?.hatchFrame;
    expect(lean && hf).toBeTruthy();
    if (!lean || !hf) return;
    expect(leanWeight(lean, lean.from - 0.1)).toBe(0);
    expect(leanWeight(lean, lean.from + lean.in + 0.1)).toBe(1);
    expect(leanWeight(lean, lean.from + lean.in + lean.hold + lean.out + 0.1)).toBe(0);
    const shut = {
      hatch: { frames: 100, presses: 0, done: false },
      vx: 0,
      grounded: true,
    };
    const out = {
      hatch: { frames: 200, presses: 3, done: true },
      vx: 0,
      grounded: true,
    };
    const running = { ...out, vx: 9.6 };
    const b = new CameraBeats(cam);
    b.update(1 / 60, 100, 1, shut);
    expect(b.y).toBe(hf.y);
    b.onStep([{ type: 'hatch', x: 0, y: 0, cx: 0, cy: 0, auto: false, frames: 200 }], 201);
    b.update(1 / 60, 201, 1, out);
    expect(b.y).toBeCloseTo(hf.y + (cam?.hatchKick ?? 0), 0);
    const mid = 201 + Math.round((lean.from + lean.in + 1) * 60);
    for (let i = 0; i < 30; i++) b.update(1 / 60, mid, 1, out);
    expect([b.x, b.y]).toEqual([lean.x, lean.y]);
    // She runs: within half a second the lean has given way; she stops: it comes back.
    for (let i = 0; i < 30; i++) b.update(1 / 60, mid, 1, running);
    expect(Math.abs(b.y)).toBeLessThan(1);
    for (let i = 0; i < 60; i++) b.update(1 / 60, mid, 1, out);
    expect(b.y).toBeCloseTo(lean.y, 0);
    b.onStep([{ type: 'spawn', x: 0, y: 0 }], mid + 1);
    b.update(1 / 60, mid + 1, 1, out);
    expect([b.x, b.y]).toEqual([0, 0]);
  });
});

describe('the room camera on a full naive run', () => {
  it('no lurch on the drops (camera acceleration under 8 px/f2 until the exit), space ahead while she runs', () => {
    const ct = cameraFor(WOOD_HATCH);
    const s = sim(WOOD_HATCH);
    hatched(s);
    const cam = createCamera(s.state, WOOD_HATCH, ct);
    let prevY = lerpCamera(cam, cam, 1).y;
    let prevV = 0;
    let maxA = 0;
    const ahead: number[] = [];
    let hold = 0;
    for (let f = 0; f < 60 * 30 && !s.state.exit; f++) {
      const p = s.state.player;
      if (hold === 0 && p.grounded && (p.wallDir === 1 || !groundAhead(WOOD_HATCH, s.state, 12))) hold = 14;
      s.run(R | (hold > 0 ? J : 0), 1);
      if (hold > 0) hold--;
      stepCamera(cam, s.state, WOOD_HATCH, ct);
      const v = lerpCamera(cam, cam, 1);
      const vy = v.y - prevY;
      if (f > 2) maxA = Math.max(maxA, Math.abs(vy - prevV));
      prevY = v.y;
      prevV = vy;
      const q = s.state.player;
      if (q.grounded && q.vx > 9 && f > 120) ahead.push(v.x - (q.x + q.w / 2));
    }
    expect(s.state.exit).not.toBeNull();
    expect(maxA).toBeLessThan(8);
    // Running right she sits at x 0.38-0.44 of the 1920 frame: the view's centre 115-230 px ahead of her.
    ahead.sort((a, b) => a - b);
    const mid = ahead[Math.floor(ahead.length / 2)] ?? 0;
    expect(mid).toBeGreaterThan(115);
    expect(mid).toBeLessThan(230);
  });
});
