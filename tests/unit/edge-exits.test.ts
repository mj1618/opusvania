/**
 * Edge exits (memory/level-authoring.md): rooms next to each other in the world are joined along
 * matching border openings. Crossing keeps the whole player state (momentum, timers) and puts the
 * body at the same world position in the next room after the usual transition freeze.
 */
import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { hashState } from '../../src/sim/hash';
import { createState, type GameState, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import {
  buildRoom,
  EDGE_DEPTH,
  getRoom,
  type RoomFile,
  registerRoom,
  Tile,
  tileAt,
} from '../../src/sim/world/rooms';

const NONE = { wallJump: false, dash: false, doubleJump: false, pogo: false };
const W = 30;
const H = 17;

function rows(
  open: { e?: [number, number]; w?: [number, number]; n?: [number, number]; s?: [number, number] },
  spawn?: [number, number],
) {
  const g = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y >= 15 ? '#' : '.')),
  );
  const span = (a: [number, number] | undefined, f: (i: number) => void) => {
    if (a) for (let i = a[0]; i <= a[1]; i++) f(i);
  };
  span(open.e, (y) => {
    (g[y] as string[])[W - 1] = '.';
  });
  span(open.w, (y) => {
    (g[y] as string[])[0] = '.';
  });
  span(open.n, (x) => {
    (g[0] as string[])[x] = '.';
  });
  span(open.s, (x) => {
    for (let y = 15; y < H; y++) (g[y] as string[])[x] = '.';
  });
  const [sx, sy] = spawn ?? [3, 14];
  (g[sy] as string[])[sx] = 'P';
  return g.map((r) => r.join(''));
}

// A (0,0) | B (30,0) side by side, joined on rows 12-14. C (0,-17) above A, joined on columns 10-13.
registerRoom(
  buildRoom({
    id: 'edge-a',
    abilities: NONE,
    rows: rows({ e: [12, 14], n: [10, 13] }),
    exits: [
      { side: 'e', from: 12, to: 14, room: 'edge-b', offset: [30, 0], spawn: 'edge-w12' },
      { side: 'n', from: 10, to: 13, room: 'edge-c', offset: [0, -17], spawn: 'edge-s10' },
    ],
  } as RoomFile),
);
registerRoom(
  buildRoom({
    id: 'edge-b',
    abilities: NONE,
    rows: rows({ w: [12, 14] }, [20, 14]),
    exits: [{ side: 'w', from: 12, to: 14, room: 'edge-a', offset: [-30, 0], spawn: 'edge-e12' }],
  } as RoomFile),
);
registerRoom(
  buildRoom({
    id: 'edge-c',
    abilities: NONE,
    rows: rows({ s: [10, 13] }, [20, 14]),
    exits: [{ side: 's', from: 10, to: 13, room: 'edge-a', offset: [0, 17], spawn: 'edge-n10' }],
  } as RoomFile),
);

const TS = 64;
const ORIGIN: Record<string, [number, number]> = { 'edge-a': [0, 0], 'edge-b': [30, 0], 'edge-c': [0, -17] };
const worldX = (s: GameState) => (ORIGIN[s.roomId]?.[0] ?? 0) * TS + s.player.x;
const worldY = (s: GameState) => (ORIGIN[s.roomId]?.[1] ?? 0) * TS + s.player.y;

function play(roomId: string, script: string, spawn?: string) {
  const t = cloneTuning(defaultTuning);
  const events: SimEvent[] = [];
  const s = createState({ seed: 1, roomId, spawn }, t, events);
  const frames: { room: string; x: number; y: number; vx: number; vy: number; ev: string[] }[] = [];
  for (const input of parseInputScript(script)) {
    const before = events.length;
    step(s, input, t, events);
    frames.push({
      room: s.roomId,
      x: worldX(s),
      y: worldY(s),
      vx: s.player.vx,
      vy: s.player.vy,
      ev: events.slice(before).map((e) => e.type),
    });
  }
  return { s, frames, t };
}

describe('edge exits', () => {
  it('open the border only along the span, EDGE_DEPTH tiles deep', () => {
    const a = getRoom('edge-a');
    expect(tileAt(a, W, 12)).toBe(Tile.empty);
    expect(tileAt(a, W + EDGE_DEPTH - 1, 14)).toBe(Tile.empty);
    expect(tileAt(a, W + EDGE_DEPTH, 13)).toBe(Tile.solid);
    expect(tileAt(a, W, 11)).toBe(Tile.solid);
    expect(tileAt(a, -1, 13)).toBe(Tile.solid);
    expect(tileAt(a, 11, -1)).toBe(Tile.empty);
    expect(tileAt(a, 14, -1)).toBe(Tile.solid);
    expect(a.spawns['edge-e12']).toEqual({ tx: W - 1, ty: 14 });
    expect(a.entities.filter((e) => e.kind === 'edge').map((e) => [e.char, e.to, e.spawn])).toEqual([
      ['e12', 'edge-b', 'edge-w12'],
      ['n10', 'edge-c', 'edge-s10'],
    ]);
    expect(() =>
      buildRoom({
        id: 'x',
        abilities: NONE,
        rows: ['#P#'],
        exits: [{ side: 'e', from: 0, to: 0, room: 'y', offset: [1, 0], spawn: 's' }],
      } as RoomFile),
    ).toThrow(/at least 30x17/);
  });

  it('running across keeps speed and world position, after the transition freeze', () => {
    const { frames, t } = play('edge-a', 'R200');
    const exit = frames.findIndex((f) => f.ev.includes('roomExit'));
    const enter = frames.findIndex((f) => f.ev.includes('roomEnter'));
    expect(exit).toBeGreaterThan(0);
    expect(enter - exit).toBe(t.world.edgeTransitionFrames);
    // North star §3.3: edge exits take at most 8 frames and never fade (the events say so).
    expect(t.world.edgeTransitionFrames).toBeLessThanOrEqual(8);
    const a = frames[exit] as (typeof frames)[number];
    const b = frames[enter] as (typeof frames)[number];
    expect(b.room).toBe('edge-b');
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
    expect(b.vx).toBe(a.vx);
    expect(a.vx).toBeGreaterThan(9);
    // Keeps running at full speed with no stop: the next step moves on by vx.
    const c = frames[enter + 1] as (typeof frames)[number];
    expect(c.x - b.x).toBeGreaterThan(9);
    expect(c.room).toBe('edge-b');
  });

  it('and back: B to A through the same opening', () => {
    const { frames } = play('edge-b', 'L200');
    const enter = frames.findIndex((f) => f.ev.includes('roomEnter'));
    expect(frames[enter]?.room).toBe('edge-a');
  });

  it('rising through a north exit keeps the upward velocity; falling through a south exit lands', () => {
    const t = cloneTuning(defaultTuning);
    const events: SimEvent[] = [];
    const s = createState({ seed: 1, roomId: 'edge-a' }, t, events);
    // Under the ceiling gap (columns 10-13), moving up fast (as off a spring).
    s.player.x = 11 * TS;
    s.player.y = 40;
    s.player.vy = -14;
    s.player.grounded = false;
    let steps = 0;
    while (s.roomId === 'edge-a' && steps++ < 30) step(s, 0, t, events);
    expect(s.roomId).toBe('edge-c');
    expect(s.player.y + s.player.h / 2).toBeGreaterThan((H - 1) * TS);
    expect(s.player.vy).toBeLessThan(0);
    // Spawn C at its floor opening and fall through into A (south exit), keeping vy.
    const { frames, s: c } = play('edge-c', '.120', 'edge-s10');
    const exit = frames.findIndex((f) => f.ev.includes('roomExit'));
    const enter = frames.findIndex((f) => f.ev.includes('roomEnter'));
    expect(exit).toBeGreaterThanOrEqual(0);
    expect(frames[enter]?.room).toBe('edge-a');
    expect(frames[enter]?.vy).toBe(frames[exit]?.vy);
    expect(frames[enter]?.vy).toBeGreaterThan(0);
    expect(c.roomId).toBe('edge-a');
    expect(c.player.grounded).toBe(true);
  });

  it('is deterministic (same inputs, same hash)', () => {
    const a = play('edge-a', 'R60 R+J20 R120');
    const b = play('edge-a', 'R60 R+J20 R120');
    expect(hashState(a.s)).toBe(hashState(b.s));
    expect(a.s.roomId).toBe('edge-b');
  });
});
