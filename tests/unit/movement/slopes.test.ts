/**
 * Floor slopes (north star §3.2, level-toolchain §3.3): 1:4, 1:2 and 1:1 heightfield tiles under
 * the feet's two middle columns. Running over them never leaves the ground (ground stick), keeps
 * vx exactly, jumps are normal jumps, and a mirrored run in the mirrored room is exactly mirrored.
 */
import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../../src/input/script';
import type { SimEvent } from '../../../src/sim/events';
import { createState, type GameState, step } from '../../../src/sim/index';
import { feetEmbedded, floorPx, slopeTop } from '../../../src/sim/physics/slopes';
import { cloneTuning, defaultTuning } from '../../../src/sim/tuning';
import {
  buildRoom,
  getRoom,
  mirrorRoomFile,
  type RoomFile,
  registerRoom,
  SLOPE_SHAPES,
  Tile,
  tileAt,
} from '../../../src/sim/world/rooms';

const NONE = { wallJump: false, dash: false, doubleJump: false, pogo: false };
const TS = 64;
const W = 60;
const H = 17;

/** Column profile: `top` = first solid row; `slope` = a slope char sitting on it (row top-1). */
type Col = { top: number; slope?: string };
function course(): Col[] {
  const c: Col[] = [];
  const put = (x0: number, x1: number, top: number) => {
    for (let x = x0; x <= x1; x++) c[x] = { top };
  };
  c[0] = { top: 0 };
  put(1, 9, 14);
  ['①', '②', '③', '④'].forEach((s, i) => {
    c[10 + i] = { top: 14, slope: s };
  });
  put(14, 14, 13);
  ['⑤', '⑥'].forEach((s, i) => {
    c[15 + i] = { top: 13, slope: s };
  });
  put(17, 17, 12);
  c[18] = { top: 12, slope: '◢' };
  put(19, 22, 11);
  c[23] = { top: 12, slope: '◣' };
  put(24, 25, 12);
  c[26] = { top: 13, slope: '⑹' };
  c[27] = { top: 13, slope: '⑸' };
  put(28, 29, 13);
  ['⑷', '⑶', '⑵', '⑴'].forEach((s, i) => {
    c[30 + i] = { top: 14, slope: s };
  });
  put(34, W - 2, 14);
  c[W - 1] = { top: 0 };
  return c;
}

function slopeRoom(id: string, spawnX: number): RoomFile {
  const cols = course();
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      const c = cols[x] as Col;
      if (y === 0 || y >= c.top) r += '#';
      else if (c.slope && y === c.top - 1) r += c.slope;
      else if (x === spawnX && y === (cols[spawnX] as Col).top - 1) r += 'P';
      else r += '.';
    }
    rows.push(r);
  }
  return { id, abilities: NONE, rows };
}

registerRoom(buildRoom(slopeRoom('slope-lab', 3)));
registerRoom(buildRoom(slopeRoom('slope-lab-far', W - 4)));
registerRoom(buildRoom(mirrorRoomFile(slopeRoom('slope-lab', 3), 'slope-lab~m')));

function play(roomId: string, script: string) {
  const t = cloneTuning(defaultTuning);
  const events: SimEvent[] = [];
  const state = createState({ seed: 1, roomId }, t, events);
  const trace: { x: number; y: number; vx: number; vy: number; grounded: boolean; ev: SimEvent[] }[] = [];
  for (const input of parseInputScript(script)) {
    const ev: SimEvent[] = [];
    step(state, input, t, ev);
    const p = state.player;
    trace.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, ev });
  }
  return { state, trace, t };
}

/** Surface y (first floor row) under a body's middle columns, searching down from its feet. */
function surfaceUnder(state: GameState): number {
  const room = getRoom(state.roomId);
  const p = state.player;
  for (let y = p.y + p.h - 64; y < p.y + p.h + 256; y++)
    if (floorPx(room, p.x + 19, y) || floorPx(room, p.x + 20, y)) return y;
  return -1;
}

describe('slope tables', () => {
  it('R and L tables are mirrors; heights run 1..64 continuously along each grade', () => {
    for (const s of SLOPE_SHAPES) {
      const m = SLOPE_SHAPES.find((x) => x.dir === -s.dir && x.run === s.run && x.k === s.k);
      expect(m).toBeDefined();
      for (let i = 0; i < TS; i++) expect(slopeTop(s.tile, i)).toBe(slopeTop(m?.tile as number, TS - 1 - i));
    }
    // Along an R chain the height rises by at most 1 px per column and ends at a full tile.
    for (const run of [1, 2, 4]) {
      const chain = SLOPE_SHAPES.filter((s) => s.dir === 1 && s.run === run).sort((a, b) => a.k - b.k);
      let prev = 0;
      for (const s of chain)
        for (let i = 0; i < TS; i++) {
          const h = TS - slopeTop(s.tile, i);
          expect(h - prev).toBeGreaterThanOrEqual(0);
          expect(h - prev).toBeLessThanOrEqual(1);
          prev = h;
        }
      expect(prev).toBe(TS);
    }
  });

  it('marks the solid tile at each high end as a shin; rectilinear rooms have no slopes', () => {
    const r = getRoom('slope-lab');
    expect(r.slopes).toBe(true);
    expect(tileAt(r, 14, 13)).toBe(Tile.shin);
    expect(tileAt(r, 17, 12)).toBe(Tile.shin);
    expect(tileAt(r, 19, 11)).toBe(Tile.shin);
    expect(tileAt(r, 22, 11)).toBe(Tile.shin);
    expect(tileAt(r, 20, 11)).toBe(Tile.solid);
    expect(getRoom('gym-01').slopes).toBe(false);
    expect(getRoom('hub').slopes).toBe(false);
  });
});

describe('running over slopes', () => {
  it('right across 1:4, 1:2, 1:1 up and down: never airborne, vx constant, no land events', () => {
    const { trace } = play('slope-lab', 'R340');
    const start = trace.findIndex((f) => f.vx >= 9.6);
    expect(start).toBeGreaterThan(0);
    const end = trace.findIndex((f) => f.x > 50 * TS);
    expect(end).toBeGreaterThan(start);
    for (let i = start; i < end; i++) {
      const f = trace[i] as (typeof trace)[number];
      expect(f.grounded, `frame ${i} x=${f.x}`).toBe(true);
      expect(f.vx).toBe(9.6);
      expect(f.ev.filter((e) => e.type === 'land' || e.type === 'jump')).toEqual([]);
    }
    // It climbed three tiles and came back down.
    const ys = trace.slice(start, end).map((f) => f.y);
    expect(Math.min(...ys)).toBe(11 * TS - 80);
    expect(trace[end]?.y).toBe(14 * TS - 80);
  });

  it('left across the same course from the far end: never airborne', () => {
    const { trace } = play('slope-lab-far', 'L340');
    const start = trace.findIndex((f) => f.vx <= -9.6);
    const end = trace.findIndex((f) => f.x < 6 * TS);
    expect(end).toBeGreaterThan(start);
    for (let i = start; i < end; i++)
      expect(
        trace[i]?.grounded,
        `frame ${i} ${JSON.stringify(trace.slice(i - 3, i + 2).map((f) => [f.x, f.y, f.vy, f.grounded]))}`,
      ).toBe(true);
  });

  it('feet stay on the surface at the middle columns (never inside, never above) while grounded', () => {
    const t = cloneTuning(defaultTuning);
    const state = createState({ seed: 1, roomId: 'slope-lab' }, t, []);
    const room = getRoom('slope-lab');
    for (const input of parseInputScript('R300')) {
      step(state, input, t, []);
      const p = state.player;
      expect(feetEmbedded(room, p.x, p.y, p.w, p.h)).toBe(false);
      if (p.grounded) expect(surfaceUnder(state)).toBe(p.y + p.h);
    }
  });

  it('mirror: the mirrored run in the mirrored room is exactly mirrored (V22)', () => {
    const a = play('slope-lab', 'R200 R+J16 R60 .20 L+J20 L60');
    const b = play('slope-lab~m', 'L200 L+J16 L60 .20 R+J20 R60');
    expect(b.trace.length).toBe(a.trace.length);
    a.trace.forEach((f, i) => {
      const g = b.trace[i] as (typeof a.trace)[number];
      expect(g.x, `frame ${i}`).toBe(W * TS - f.x - 40);
      expect(g.y, `frame ${i}`).toBe(f.y);
      expect(g.vx).toBe(f.vx === 0 ? 0 : -f.vx);
    });
  });

  it('a jump from a slope is a normal jump (same rise as from flat ground)', () => {
    // Walk, stop (standing still on the slope), then a straight-up jump: the rise from the
    // take-off pixel is the flat-ground rise (the reach table stays exact).
    const rise = (walk: number) => {
      const { trace } = play('slope-lab', `R${walk} .20 J40 .40`);
      const y0 = trace[walk + 19]?.y as number;
      return y0 - Math.min(...trace.slice(walk + 20).map((f) => f.y));
    };
    const flat = rise(5);
    let onSlope = 0;
    for (let walk = 24; walk <= 78; walk += 3) {
      const { state } = play('slope-lab', `R${walk} .20`);
      const p = state.player;
      if ((p.y + p.h) % TS !== 0) onSlope++;
      expect(p.grounded).toBe(true);
      expect(rise(walk)).toBe(flat);
    }
    expect(onSlope).toBeGreaterThanOrEqual(6);
  });

  it('standing on a slope does not slide; walking back down it keeps contact', () => {
    const { trace } = play('slope-lab', 'R60 .60 L40');
    const stand = trace.slice(80, 120);
    expect(new Set(stand.map((f) => `${f.x},${f.y}`)).size).toBe(1);
    for (const f of trace.slice(125)) expect(f.grounded).toBe(true);
  });

  it('falling onto a slope lands with the feet on its surface', () => {
    const { state, trace } = play('slope-lab', 'R40 R+J20 R10 .60');
    expect(trace.some((f) => f.ev.some((e) => e.type === 'land'))).toBe(true);
    expect(state.player.grounded).toBe(true);
    expect(surfaceUnder(state)).toBe(state.player.y + state.player.h);
  });
});
