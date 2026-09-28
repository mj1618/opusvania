/**
 * Slope brushes (memory/level-authoring.md "L6 proof kit"): `ramp` with a grade and `curve` bake to
 * continuous heightfield chains that the sim runs over without leaving the ground.
 */
import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { createState, step } from '../../src/sim/index';
import { slopeTop } from '../../src/sim/physics/slopes';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { buildRoom, registerRoom, slopeEdgeHeight, TILE_CHARS, Tile } from '../../src/sim/world/rooms';
import { bake, curveColumns, rampColumns } from '../../tools/world/bake';
import { compileWorld } from '../../tools/world/compile';
import { lintWorld } from '../../tools/world/lint';
import { sheetToModel } from '../../tools/world/model';

const TS = 64;

function sheet() {
  return {
    id: 'lab-slopes',
    at: [0, 0],
    size: [70, 17],
    brushes: [
      ['fill'],
      ['rect', 'carve', [1, 1, 68, 13]],
      ['ramp', 'add', [4, 14], [12, 12], { grade: '1:4' }],
      ['rect', 'add', [12, 12, 2, 2]],
      ['ramp', 'add', [14, 12], [18, 10], { grade: '1:2' }],
      ['rect', 'add', [18, 10, 2, 4]],
      ['ramp', 'add', [20, 10], [22, 8], { grade: '1:1' }],
      [
        'curve',
        'add',
        [
          [22, 8],
          [30, 9],
          [40, 12],
          [50, 14],
        ],
        { grade: '1:1' },
      ],
    ],
    entities: [['spawn', [2, 13]]],
  };
}

/** Surface height (px above the row bottom... as world y) at a tile column's left and right edges. */
function edges(rows: string[], x: number): [number, number] {
  for (let y = 0; y < rows.length; y++) {
    const ch = rows[y]?.[x] as string;
    const t = TILE_CHARS[ch];
    if (t === Tile.solid) return [y * TS, y * TS];
    if (t !== undefined && t >= Tile.slopeR4a && t <= Tile.slopeL1)
      return [(y + 1) * TS - slopeEdgeHeight(t, false, TS), (y + 1) * TS - slopeEdgeHeight(t, true, TS)];
  }
  return [-1, -1];
}

describe('slope brushes', () => {
  it('ramp needs |dx| = run x |dy|', () => {
    expect(() =>
      rampColumns(
        [
          [0, 10],
          [5, 8],
        ],
        2,
      ),
    ).toThrow(/1:2/);
    expect(
      rampColumns(
        [
          [0, 10],
          [4, 8],
        ],
        2,
      ).cols.map((c) => c.row),
    ).toEqual([9, 9, 8, 8]);
    // Falling to the right = an L slope; columns listed from the low end.
    expect(
      rampColumns(
        [
          [0, 8],
          [2, 10],
        ],
        1,
      ).cols.map((c) => c.x),
    ).toEqual([1, 0]);
  });

  it('curve quantises to a continuous chain no steeper than its grade', () => {
    const c = curveColumns(
      [
        [0, 10],
        [7, 12],
        [12, 12],
        [20, 9],
      ],
      2,
    );
    expect(c.cols.map((k) => k.x)).toEqual([...Array(20).keys()]);
    expect(() =>
      curveColumns(
        [
          [0, 10],
          [2, 14],
        ],
        2,
      ),
    ).toThrow(/no 1:2/);
  });

  it('bakes, compiles and lints clean; the surface is continuous along the whole run', () => {
    const m = sheetToModel(sheet());
    m.collision = bake(m).collision;
    const out = compileWorld([m], new Map());
    expect(out.errors).toEqual([]);
    const lint = lintWorld([m], out);
    expect(lint.errors).toEqual([]);
    const room = out.bundle.rooms[0] as { rows: string[] };
    for (let x = 1; x < 60; x++) {
      const [, r] = edges(room.rows, x);
      const [l] = edges(room.rows, x + 1);
      expect(Math.abs(l - r), `columns ${x}|${x + 1}`).toBeLessThanOrEqual(1);
    }
    // Every slope surface is on the tables (sanity on the chars the compiler wrote).
    expect(slopeTop(Tile.slopeR1, 0)).toBe(63);
  });

  it('the sim runs the baked room end to end without leaving the ground', () => {
    const m = sheetToModel(sheet());
    m.collision = bake(m).collision;
    const out = compileWorld([m], new Map());
    registerRoom(buildRoom(out.bundle.rooms[0] as Parameters<typeof buildRoom>[0]));
    const t = cloneTuning(defaultTuning);
    const s = createState({ seed: 1, roomId: 'lab-slopes' }, t, []);
    let airborne = 0;
    let started = false;
    for (const input of parseInputScript('R400')) {
      step(s, input, t, []);
      if (s.player.vx >= 9.6) started = true;
      if (started && s.player.x < 58 * TS && !s.player.grounded) airborne++;
    }
    expect(started).toBe(true);
    expect(airborne).toBe(0);
    expect(s.player.y + s.player.h).toBe(14 * TS);
  });
});
