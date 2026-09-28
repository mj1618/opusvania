/**
 * LDtk world pipeline (tools/world, memory/level-authoring.md): the committed project is fresh
 * (defs, baked Collision and the compiled bundle are exactly what the code generates), valid
 * against LDtk's official schema, compiles without errors; ported rooms compile back to their
 * ASCII originals and replay their golden tapes bit-for-bit; sheets round-trip; bake is exact.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTape, isTapeFile } from '../../src/debug/tape';
import { WORLD_LAYOUT } from '../../src/sim/world/content';
import {
  ABILITY_NAMES,
  buildRoom,
  COLOURS,
  PROMPT_KEYS,
  type RoomFile,
  RoomFileSchema,
  registerRoom,
} from '../../src/sim/world/rooms';
import { bake } from '../../tools/world/bake';
import { compileWorld } from '../../tools/world/compile';
import { levelsDir, loadProject } from '../../tools/world/ldtk';
import { ENUMS, type LevelModel, modelToSheet, sheetToModel } from '../../tools/world/model';
import { renderWorld } from '../../tools/world/png';
import {
  asciiRooms,
  build,
  models,
  openProject,
  PROJECT_PATH,
  ROOT,
  staleness,
} from '../../tools/world/project';
import { checkSchema } from '../../tools/world/schema-check';
import { modelsToSection, sectionToModels } from '../../tools/world/section';

const PORTS: [string, string][] = [
  ['port-gym14', 'gym-14'],
  ['port-lot7', 'lot-7'],
  ['port-yard', 'yard'],
];

describe('world project (content/world.ldtk)', () => {
  it('is fresh: defs, Collision and content/world.compiled.json match the brushes and the code', () => {
    expect(staleness(), 'run `npm run world -- build` and commit').toEqual([]);
  });

  it('compiles and lints without errors', () => {
    const r = build(openProject(), { dryRun: true });
    expect([...r.errors, ...r.lint.errors]).toEqual([]);
    for (const room of r.bundle.rooms) expect(RoomFileSchema.safeParse(room).success, room.id).toBe(true);
  });

  it('passes the official LDtk 1.5.3 JSON schema (project and every level file)', () => {
    const schema = JSON.parse(readFileSync(join(ROOT, 'tools/world/vendor/ldtk-1.5.3.schema.json'), 'utf8'));
    expect(checkSchema(schema, JSON.parse(readFileSync(PROJECT_PATH, 'utf8')))).toEqual([]);
    const dir = levelsDir(PROJECT_PATH);
    const files = readdirSync(dir).filter((f) => f.endsWith('.ldtkl'));
    expect(files.length).toBe(loadProject(PROJECT_PATH).levels.length);
    for (const f of files)
      expect(
        checkSchema(
          { ...schema, $ref: '#/otherTypes/Level' },
          JSON.parse(readFileSync(join(dir, f), 'utf8')),
        ),
        f,
      ).toEqual([]);
  });

  it('registers every compiled room in the sim with its world position', () => {
    const r = build(openProject(), { dryRun: true });
    for (const room of r.bundle.rooms) {
      expect(WORLD_LAYOUT[room.id]).toBeDefined();
      expect(() => buildRoom(room)).not.toThrow();
    }
  });

  it('LDtk enums match the sim and content', () => {
    const enemies = readdirSync(join(ROOT, 'content/enemies'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect([...ENUMS.Enemy].sort()).toEqual(enemies);
    expect([...ENUMS.Ability]).toEqual(ABILITY_NAMES);
    expect([...ENUMS.Colour]).toEqual([...COLOURS]);
    expect([...ENUMS.PromptKey]).toEqual([...PROMPT_KEYS]);
  });
});

describe('ported rooms compile back to their ASCII originals', () => {
  const bundle = build(openProject(), { dryRun: true }).bundle;
  const ascii = asciiRooms();
  for (const [port, orig] of PORTS) {
    it(`${port} == ${orig} (rows, maps, fields) and replays ${orig}'s tapes exactly`, () => {
      const compiled = bundle.rooms.find((r) => r.id === port) as RoomFile;
      const original = ascii.get(orig) as RoomFile;
      const a = RoomFileSchema.parse({ ...compiled, id: 'x' });
      const b = RoomFileSchema.parse({ ...original, id: 'x' });
      expect(a).toEqual(b);
      // The sim sees the compiled room under the original id: every golden tape must still match.
      const dir = join(ROOT, 'tests/replays');
      const tapes = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown)
        .filter((t) => isTapeFile(t) && t.room === orig);
      expect(tapes.length).toBeGreaterThan(0);
      registerRoom(buildRoom({ ...compiled, id: orig }));
      try {
        for (const t of tapes) if (isTapeFile(t)) expect(checkTape(t).failures, t.name).toEqual([]);
      } finally {
        registerRoom(buildRoom(original));
      }
    });
  }
});

describe('room sheets', () => {
  it('round-trip: model -> sheet -> model keeps brushes, entities, fields and paint', () => {
    for (const m of models(openProject())) {
      const back = sheetToModel(JSON.parse(JSON.stringify(modelToSheet(m))));
      expect(back.brushes, m.id).toEqual(m.brushes);
      expect(back.entities, m.id).toEqual(m.entities);
      expect(back.fields, m.id).toEqual(m.fields);
      expect([...back.paint], m.id).toEqual([...m.paint]);
      expect([...bake(back).collision], m.id).toEqual([...m.collision]);
    }
  });

  it('rejects typos and bad entity props with the entity index', () => {
    const base = { id: 'test-a', at: [0, 0], size: [30, 17], brushes: [['fill']] };
    expect(() => sheetToModel({ ...base, brushs: [] })).toThrow();
    expect(() => sheetToModel({ ...base, entities: [['enemy', [3, 3], { type: 'dragon' }]] })).toThrow(
      /entities\[0\] enemy/,
    );
    expect(() => sheetToModel({ ...base, entities: [['spawn', [3, 3, 2, 2]]] })).toThrow(/point entity/);
    expect(() => sheetToModel({ ...base, id: 'Bad_Id' })).toThrow(/kebab/);
  });
});

describe('section sheets (a region in world tiles, cut into rooms)', () => {
  it('the sample region round-trips: export -> cut -> bake gives the stored rooms and the same section', () => {
    const stored = models(openProject()).filter((m) => m.id.startsWith('sample-'));
    const sec = modelsToSection('sample', stored);
    const cut = sectionToModels(JSON.parse(JSON.stringify(sec)));
    expect(cut.models.map((m) => m.id)).toEqual(stored.map((m) => m.id));
    for (const m of cut.models) {
      const s = stored.find((x) => x.id === m.id) as (typeof stored)[number];
      expect([...bake(m).collision], m.id).toEqual([...s.collision]);
      expect(m.entities, m.id).toEqual(s.entities);
    }
    expect(
      modelsToSection(
        'sample',
        cut.models.map((m) => ({ ...m, collision: bake(m).collision })),
      ),
    ).toEqual(sec);
  });

  it('a brush across a seam bakes the same tiles on both sides', () => {
    const sec = {
      section: 'seam',
      rooms: [
        { id: 'seam-a', at: [0, 0], size: [30, 17] },
        { id: 'seam-b', at: [30, 0], size: [30, 17] },
      ],
      brushes: [
        ['fill'],
        [
          'tunnel',
          'carve',
          [
            [2, 8],
            [30, 6],
            [57, 9],
          ],
          5,
          { rough: 2, seed: 3 },
        ],
      ],
      entities: [
        ['spawn', [3, 8]],
        ['spawn', [50, 8]],
      ],
    };
    const [a, b] = sectionToModels(sec).models.map((m) => ({ ...m, collision: bake(m).collision }));
    const one = sectionToModels({
      ...sec,
      rooms: [{ id: 'seam-all', at: [0, 0], size: [60, 17] }],
      entities: [['spawn', [3, 8]]],
    }).models[0] as LevelModel;
    const whole = bake(one).collision;
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 60; x++) {
        const part =
          x < 30 ? (a as LevelModel).collision[y * 30 + x] : (b as LevelModel).collision[y * 30 + x - 30];
        // Speck cleanup sees the room edge as solid, so allow a difference only on the seam columns.
        if (x !== 29 && x !== 30) expect(part, `${x},${y}`).toBe(whole[y * 60 + x]);
      }
    expect(() =>
      sectionToModels({
        ...sec,
        entities: [
          ['spawn', [3, 8]],
          ['camera', [25, 0, 10, 5]],
        ],
      }),
    ).toThrow(/crosses the edge/);
  });
});

describe('bake', () => {
  const rows = (sheet: Record<string, unknown>) => {
    const m = sheetToModel({ id: 'test-b', at: [0, 0], entities: [], ...sheet });
    const g = bake(m).collision;
    const [w, h] = m.size;
    return Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => '.#=^v<>o'[g[y * w + x] as number]).join(''),
    );
  };

  it('rects, one-ways, spikes and paint are exact', () => {
    expect(
      rows({
        size: [8, 5],
        brushes: [
          ['fill'],
          ['rect', 'carve', [1, 1, 6, 3]],
          ['oneway', [2, 2], 3],
          ['spikes', 'up', [5, 3, 2, 1]],
        ],
        paint: [[0, 4, 2, 1, 'air']],
      }),
    ).toEqual(['########', '#......#', '#.===..#', '#....^^#', '..######']);
  });

  it('tunnels are exactly `width` tiles across (odd and even), ledges and ramps follow their points', () => {
    expect(
      rows({
        size: [6, 7],
        brushes: [
          ['fill'],
          [
            'tunnel',
            'carve',
            [
              [0, 3],
              [5, 3],
            ],
            3,
          ],
        ],
      }),
    ).toEqual(['######', '######', '......', '......', '......', '######', '######']);
    expect(
      rows({
        size: [4, 6],
        brushes: [
          ['fill'],
          [
            'tunnel',
            'carve',
            [
              [0, 3],
              [3, 3],
            ],
            4,
          ],
        ],
      }),
    ).toEqual(['####', '....', '....', '....', '....', '####']);
    expect(
      rows({
        size: [7, 4],
        brushes: [
          [
            'ledges',
            'add',
            [
              [0, 1],
              [4, 3],
            ],
            2,
            { tile: 'oneWay' },
          ],
        ],
      }),
    ).toEqual(['.......', '==.....', '.......', '....==.']);
    expect(rows({ size: [5, 4], brushes: [['ramp', 'add', [0, 3], [4, 0]]] })).toEqual([
      '....#',
      '...##',
      '.####',
      '#####',
    ]);
  });

  it('blobs and arches are symmetric without roughness; rough blobs are deterministic', () => {
    const blob = rows({ size: [9, 7], brushes: [['blob', 'add', [0, 0, 9, 7]]] });
    for (const r of blob) expect(r).toBe([...r].reverse().join(''));
    expect(blob).toEqual([...blob].reverse());
    const arch = rows({ size: [8, 4], brushes: [['arch', 'add', [0, 0, 8, 4]]] });
    for (const r of arch) expect(r).toBe([...r].reverse().join(''));
    expect(arch[3]).toBe('########');
    const rough = {
      size: [40, 30],
      brushes: [['fill'], ['blob', 'carve', [4, 3, 32, 24], { rough: 3, seed: 5 }]],
    };
    expect(rows(rough)).toEqual(rows(rough));
    expect(rows(rough)).not.toEqual(
      rows({ ...rough, brushes: [['fill'], ['blob', 'carve', [4, 3, 32, 24], { rough: 3, seed: 6 }]] }),
    );
  });
});

describe('compile and lint catch authoring mistakes', () => {
  const compileOne = (sheet: Record<string, unknown>) => {
    const m = sheetToModel({
      id: 'test-c',
      at: [0, 0],
      size: [30, 17],
      brushes: [['fill'], ['rect', 'carve', [1, 1, 28, 14]]],
      ...sheet,
    });
    m.collision = bake(m).collision;
    return compileWorld([m], asciiRooms());
  };
  it('spawn count, entities in walls, overlaps, unknown door targets', () => {
    expect(compileOne({ entities: [] }).errors.join()).toMatch(/exactly one spawn/);
    expect(compileOne({ entities: [['spawn', [0, 0]]] }).errors.join()).toMatch(/inside collision/);
    expect(
      compileOne({
        entities: [
          ['spawn', [3, 14]],
          ['goal', [3, 14]],
        ],
      }).errors.join(),
    ).toMatch(/overlap/);
    expect(
      compileOne({
        entities: [
          ['spawn', [3, 14]],
          ['door', [5, 14], { name: 'a', to: 'nowhere' }],
        ],
      }).errors.join(),
    ).toMatch(/unknown room/);
    expect(
      compileOne({
        entities: [
          ['spawn', [3, 14]],
          ['door', [5, 14], { name: 'a', to: 'hub', toDoor: '~' }],
        ],
      }).errors.join(),
    ).toMatch(/not one of its door chars/);
    const ok = compileOne({
      entities: [
        ['spawn', [3, 14]],
        ['enemy', [8, 14], { type: 'barker' }],
        ['enemy', [12, 14], { type: 'barker' }],
      ],
    });
    expect(ok.errors).toEqual([]);
    expect(Object.keys(ok.bundle.rooms[0]?.enemies ?? {})).toHaveLength(1);
  });
});

describe('world map PNG', () => {
  it('renders a valid PNG of the whole world', () => {
    const r = build(openProject(), { dryRun: true });
    const img = renderWorld(models(openProject()), new Map(r.bundle.rooms.map((x) => [x.id, x])), {
      scale: 2,
    });
    expect([...img.png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(img.png.readUInt32BE(16)).toBe(img.w);
    expect(img.png.readUInt32BE(20)).toBe(img.h);
  });
});
