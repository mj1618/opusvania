/**
 * L6 camera (memory/camera.md): seams, zoom, declared shots and frame zones. Rooms are built
 * inline (60x17 greybox pairs joined by edge exits, and one wide room with zones), so these do not
 * depend on authored content.
 */
import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import {
  type CameraState,
  createCamera,
  inView,
  stepCamera,
  VIEW_H,
  VIEW_W,
  viewCentre,
  viewSize,
} from '../../src/render/camera/index';
import { cameraTuning as ct } from '../../src/render/camera/tuning';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, spawnEnemyAt, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { buildRoom, getRoom, type RoomFile, registerRoom } from '../../src/sim/world/rooms';

const TS = 64;
const W = 60;
const H = 17;
const NONE = { wallJump: false, dash: false, doubleJump: false, pogo: false };

/** Floor at row 15; border openings: e/w on rows [a, b], n on columns [a, b], s = a floor hole. */
function rows(open: { e?: number[]; w?: number[]; n?: number[]; s?: number[] }, spawn: [number, number]) {
  const g = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y >= 15 ? '#' : '.')),
  );
  const span = (a: number[] | undefined, f: (i: number) => void) => {
    if (a) for (let i = a[0] ?? 0; i <= (a[1] ?? -1); i++) f(i);
  };
  span(open.e, (y) => ((g[y] as string[])[W - 1] = '.'));
  span(open.w, (y) => ((g[y] as string[])[0] = '.'));
  span(open.n, (x) => ((g[0] as string[])[x] = '.'));
  span(open.s, (x) => {
    for (let y = 15; y < H; y++) (g[y] as string[])[x] = '.';
  });
  (g[spawn[1]] as string[])[spawn[0]] = 'P';
  return g.map((r) => r.join(''));
}

// A (0,0) | B (60,0) joined on rows 12-14; U (0,-17) above A, a floor hole over A's columns 20-23.
registerRoom(
  buildRoom({
    id: 'camw-a',
    abilities: NONE,
    rows: rows({ e: [12, 14], n: [20, 23] }, [40, 14]),
    exits: [
      { side: 'e', from: 12, to: 14, room: 'camw-b', offset: [60, 0], spawn: 'edge-w12' },
      { side: 'n', from: 20, to: 23, room: 'camw-u', offset: [0, -17], spawn: 'edge-s20' },
    ],
  } as RoomFile),
);
registerRoom(
  buildRoom({
    id: 'camw-b',
    abilities: NONE,
    rows: rows({ w: [12, 14] }, [20, 14]),
    exits: [{ side: 'w', from: 12, to: 14, room: 'camw-a', offset: [-60, 0], spawn: 'edge-e12' }],
  } as RoomFile),
);
registerRoom(
  buildRoom({
    id: 'camw-u',
    abilities: NONE,
    rows: rows({ s: [20, 23] }, [10, 14]),
    exits: [{ side: 's', from: 20, to: 23, room: 'camw-a', offset: [0, 17], spawn: 'edge-n20' }],
  } as RoomFile),
);
const ORIGIN: Record<string, [number, number]> = {
  'camw-a': [0, 0],
  'camw-b': [60 * TS, 0],
  'camw-u': [0, -17 * TS],
};

// A wide room: free follow on the left, a vista zone with a declared shot on the right.
const ZW = 120;
const zoneRows = Array.from({ length: 30 }, (_, y) =>
  Array.from({ length: ZW }, (_, x) =>
    x === 0 || y === 0 || x === ZW - 1 || y >= 28 ? '#' : x === 5 && y === 27 ? 'P' : '.',
  ).join(''),
);
function zoneRoom(id: string, extra: Partial<NonNullable<RoomFile['cameraZones']>[number]> = {}) {
  return registerRoom(
    buildRoom({
      id,
      abilities: NONE,
      rows: zoneRows,
      cameraZones: [
        {
          rect: [12, 1, 107, 27],
          mode: 'vista',
          shot: { rect: [40, 2, 40, 20], zoom: 0.75, hold: 60, repeat: false },
          ...extra,
        },
      ],
    } as RoomFile),
  );
}
zoneRoom('camw-vista');
zoneRoom('camw-vista-repeat', { shot: { rect: [40, 2, 40, 20], zoom: 0.75, hold: 60, repeat: true } });
zoneRoom('camw-open', { mode: 'open', shot: undefined });
zoneRoom('camw-frame', { mode: 'frame', value: [100, 5], weight: 0.5, shot: undefined });

interface Frame {
  room: string;
  cam: CameraState;
  s: GameState;
  ev: string[];
}

function run(roomId: string, script: string, setup?: (s: GameState) => void, spawn?: string) {
  const t = cloneTuning(defaultTuning);
  const s = createState({ seed: 1, roomId, spawn }, t);
  setup?.(s);
  const cam = createCamera(s, getRoom(roomId));
  const frames: Frame[] = [];
  for (const m of parseInputScript(script)) {
    const evs: SimEvent[] = [];
    step(s, m, t, evs);
    stepCamera(cam, s, getRoom(s.roomId), evs);
    frames.push({ room: s.roomId, cam: { ...cam }, s, ev: evs.map((e) => e.type) });
  }
  return frames;
}

/** View centre in world px (the room's origin plus its local centre). */
function worldCentre(f: Frame) {
  const c = viewCentre(f.cam);
  const [ox, oy] = ORIGIN[f.room] ?? [0, 0];
  return { x: c.x + ox, y: c.y + oy };
}

describe('camera across seams (north-star §3.3: the camera keeps its world position)', () => {
  it('C11: running through an e/w edge exit never re-snaps (world view moves <= pan cap per frame)', () => {
    const frames = run('camw-a', 'R240');
    const enter = frames.findIndex((f) => f.ev.includes('roomEnter'));
    expect(frames[enter]?.room).toBe('camw-b');
    // Before the crossing the view ran past room A's east bound (bleed into the neighbour).
    const before = frames[enter - 1] as Frame;
    expect(before.cam.x + VIEW_W).toBeGreaterThan(W * TS);
    // After it, the view still shows room A to the west (the bound on B's west side bleeds too).
    expect((frames[enter] as Frame).cam.x).toBeLessThan(0);
    const cap = Math.max(ct.panMaxX, defaultTuning.run.maxSpeed * ct.panMaxVxMult) + 1;
    const jumps: string[] = [];
    for (let i = 1; i < frames.length; i++) {
      const a = worldCentre(frames[i - 1] as Frame);
      const b = worldCentre(frames[i] as Frame);
      if (Math.abs(b.x - a.x) > cap || Math.abs(b.y - a.y) > 1) jumps.push(`f${i} ${(b.x - a.x).toFixed(1)}`);
    }
    expect(jumps).toEqual([]);
  });

  it('C12: falling through an n/s edge exit keeps following (no jump at the seam)', () => {
    const frames = run('camw-u', 'R66 .150');
    // Spawned at column 10 of U, running right drops Kid through the hole at 20-23 into A.
    const enter = frames.findIndex((f) => f.ev.includes('roomEnter'));
    expect(frames[enter]?.room).toBe('camw-a');
    let worst = 0;
    let worstAt = -1;
    for (let i = 1; i < frames.length; i++) {
      const a = worldCentre(frames[i - 1] as Frame);
      const b = worldCentre(frames[i] as Frame);
      const d = Math.max(Math.abs(b.y - a.y), Math.abs(b.x - a.x));
      if (d > worst) worstAt = i;
      worst = Math.max(worst, d);
    }
    // Fast-fall follow (maxFall 21.3 px/f, lerpYFall) peaks near 43 px/f anywhere; the seam adds nothing.
    expect(worst, `worst at f${worstAt}, enter f${enter}`).toBeLessThanOrEqual(48);
    for (let i = enter - 2; i <= enter + 2; i++) {
      const a = worldCentre(frames[i - 1] as Frame);
      const b = worldCentre(frames[i] as Frame);
      expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(40);
    }
    // It ends settled on A's floor, inside A's bounds (the bleed fades as Kid walks away).
    const last = frames[frames.length - 1] as Frame;
    expect(last.cam.y + VIEW_H).toBeLessThanOrEqual(H * TS + 1e-6);
  });

  it('C4w: away from exits the view stays inside the room', () => {
    const frames = run('camw-b', 'R200 L60');
    const last = frames[frames.length - 1] as Frame;
    expect(last.cam.bleedW).toBe(0);
    expect(last.cam.x).toBeGreaterThanOrEqual(0);
    expect(last.cam.x + VIEW_W).toBeLessThanOrEqual(W * TS + 1e-6);
  });

  it('is deterministic across a seam', () => {
    const a = run('camw-a', 'R200 J1 R40');
    const b = run('camw-a', 'R200 J1 R40');
    expect(a.map((f) => f.cam)).toEqual(b.map((f) => f.cam));
  });
});

describe('camera zoom (north-star §3.1)', () => {
  it('C13: an open zone eases to 0.9 over ~50 f, monotonically, without overshoot', () => {
    const frames = run('camw-open', 'R400');
    const entered = frames.findIndex((f) => f.cam.zone === 0);
    expect(entered).toBeGreaterThan(0);
    const zs = frames.slice(entered).map((f) => f.cam.zoom);
    for (let i = 1; i < zs.length; i++) expect(zs[i] ?? 0).toBeLessThanOrEqual((zs[i - 1] ?? 0) + 1e-12);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(ct.zoomOpen - 1e-9);
    // 45-60 f to settle (spec); 95% of the change inside 60 f, and exact at the end.
    expect(1 - (zs[60] ?? 1)).toBeGreaterThan(0.95 * (1 - ct.zoomOpen));
    expect(1 - (zs[30] ?? 1)).toBeLessThan(0.95 * (1 - ct.zoomOpen));
    expect(zs[zs.length - 1]).toBe(ct.zoomOpen);
    // The zoomed view is wider and still clamped to the room.
    const last = frames[frames.length - 1] as Frame;
    expect(viewSize(last.cam.zoom).w).toBeCloseTo(VIEW_W / ct.zoomOpen, 6);
    expect(last.cam.x + viewSize(last.cam.zoom).w).toBeLessThanOrEqual(ZW * TS + 1e-6);
  });

  it('C15: a live enemy holds the zoom at >= 0.9, even in a vista', () => {
    const frames = run('camw-vista', 'R400', (s) => {
      spawnEnemyAt(s, 'barker', 100 * TS, 28 * TS);
    });
    const zs = frames.map((f) => f.cam.zoom);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(ct.zoomEnemyMin - 1e-9);
  });

  it('zoom always stays within the limits', () => {
    for (const id of ['camw-vista', 'camw-open', 'camw-frame'])
      for (const f of run(id, 'R300 L100 R200')) {
        expect(f.cam.zoom).toBeGreaterThanOrEqual(ct.zoomMin);
        expect(f.cam.zoom).toBeLessThanOrEqual(ct.zoomMax);
      }
  });
});

describe('declared shots and frame zones', () => {
  it('C14: a vista shot frames its rect at its zoom, holds, keeps Kid in view, then releases', () => {
    const frames = run('camw-vista', 'R50 .400');
    const start = frames.findIndex((f) => f.cam.shotZone === 0);
    expect(start).toBeGreaterThan(0);
    const end = frames.findIndex((f, i) => i > start && f.cam.shotZone === -1);
    expect(end).toBeGreaterThan(start);
    const held = frames[end - 1] as Frame;
    expect(held.cam.shotHeld).toBe(59);
    expect(held.cam.zoom).toBeCloseTo(0.75, 2);
    // Framed as close to the shot centre as keeping Kid inside the margin allows.
    const shotCx = (40 + 20) * TS;
    const c = viewCentre(held.cam);
    const vw = viewSize(held.cam.zoom).w;
    const px = held.s.player.x + held.s.player.w / 2;
    expect(Math.abs(c.x - Math.min(shotCx, px - ct.shotPlayerMargin * vw + vw / 2))).toBeLessThan(2);
    for (const f of frames.slice(start, end)) {
      const p = f.s.player;
      expect(inView(f.cam, p.x, p.y, p.w, p.h)).toBe(true);
    }
    // Released: back to the vista's own zoom.
    expect((frames[frames.length - 1] as Frame).cam.zoom).toBeCloseTo(ct.zoomVista, 3);
  });

  it('C14b: a shot plays once per session; `repeat` replays it on every entry', () => {
    const script = 'R50 .300 L60 .30 R60 .60';
    const count = (fs: Frame[]) =>
      fs.filter((f, i) => i > 0 && f.cam.shotZone === 0 && (fs[i - 1] as Frame).cam.shotZone !== 0).length;
    expect(count(run('camw-vista', script))).toBe(1);
    expect(count(run('camw-vista-repeat', script))).toBe(2);
  });

  it('a frame zone pulls the view toward its point by its weight', () => {
    const frames = run('camw-frame', 'R60 .200');
    const last = frames[frames.length - 1] as Frame;
    const free = run('camw-open', 'R60 .200').at(-1) as Frame;
    // Same run, same player position; the frame zone's view sits closer to (100, 5) tiles.
    const target = { x: 100 * TS, y: 5 * TS };
    const d = (f: Frame) => Math.hypot(viewCentre(f.cam).x - target.x, viewCentre(f.cam).y - target.y);
    expect(last.cam.zone).toBe(0);
    expect(d(last)).toBeLessThan(d(free) - 200);
  });
});
