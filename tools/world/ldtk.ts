/**
 * LDtk 1.5.3 project I/O for the world pipeline (docs/research/level-toolchain.md §2.4, A1).
 *
 * The runtime never reads LDtk: tools/world compiles it to RoomFiles. This module only loads and
 * saves the project (levels in separate `.ldtkl` files), validates the subset we read with Zod
 * (loose objects: editor-internal keys we don't use survive a load/save round trip untouched),
 * computes the derived `__` fields we rely on (`__neighbours`, `toc`, entity `__grid`), and
 * formats JSON deterministically. Agents never edit these files by hand: they go through
 * `npm run world` (sheets), which owns uids and iids.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';

export const LDTK_VERSION = '1.5.3';
/** Collision grid = the sim's tile (64 px). Every layer uses it. */
export const GRID = 64;

/** Deterministic RFC-4122-shaped id from a name (sha1, like a v5 UUID). LDtk only needs uniqueness. */
export function iidFor(name: string): string {
  const h = createHash('sha1').update(`tallage:${name}`).digest('hex');
  const v = ((Number.parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------------------------
// Zod: the subset we read. Loose objects keep every other key.

const FieldInstanceZ = z.looseObject({
  __identifier: z.string(),
  __type: z.string(),
  __value: z.unknown(),
  defUid: z.number().int(),
  realEditorValues: z.array(z.unknown()),
});
const EntityInstanceZ = z.looseObject({
  __identifier: z.string(),
  iid: z.string(),
  defUid: z.number().int(),
  px: z.tuple([z.number().int(), z.number().int()]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fieldInstances: z.array(FieldInstanceZ),
});
const LayerInstanceZ = z.looseObject({
  __identifier: z.string(),
  __type: z.enum(['IntGrid', 'Entities', 'Tiles', 'AutoLayer']),
  __cWid: z.number().int().positive(),
  __cHei: z.number().int().positive(),
  __gridSize: z.number().int().positive(),
  iid: z.string(),
  layerDefUid: z.number().int(),
  intGridCsv: z.array(z.number().int()),
  entityInstances: z.array(EntityInstanceZ),
});
const LevelZ = z.looseObject({
  identifier: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'level identifiers are lower_snake (room id with _ for -)'),
  iid: z.string(),
  uid: z.number().int(),
  worldX: z.number().int(),
  worldY: z.number().int(),
  pxWid: z.number().int().positive(),
  pxHei: z.number().int().positive(),
  fieldInstances: z.array(FieldInstanceZ),
  externalRelPath: z.string().nullable().optional(),
  layerInstances: z.array(LayerInstanceZ).nullable().optional(),
});
const ProjectZ = z.looseObject({
  jsonVersion: z.string(),
  worldLayout: z.literal('GridVania'),
  worldGridWidth: z.number().int(),
  worldGridHeight: z.number().int(),
  defaultGridSize: z.literal(GRID),
  externalLevels: z.literal(true),
  nextUid: z.number().int(),
  defs: z.looseObject({
    layers: z.array(z.looseObject({ identifier: z.string(), uid: z.number().int(), type: z.string() })),
    entities: z.array(z.looseObject({ identifier: z.string(), uid: z.number().int() })),
    enums: z.array(z.looseObject({ identifier: z.string(), uid: z.number().int() })),
    levelFields: z.array(z.looseObject({ identifier: z.string(), uid: z.number().int() })),
  }),
  levels: z.array(LevelZ),
});

export type FieldInstance = z.infer<typeof FieldInstanceZ>;
export type EntityInstance = z.infer<typeof EntityInstanceZ>;
export type LayerInstance = z.infer<typeof LayerInstanceZ>;
export type Level = z.infer<typeof LevelZ> & { layerInstances: LayerInstance[] };
export type ProjectJson = z.infer<typeof ProjectZ>;

export interface Project {
  /** Absolute path of the .ldtk file. */
  path: string;
  json: ProjectJson;
  /** Same objects as json.levels, with their layers loaded. */
  levels: Level[];
}

/** Room id <-> LDtk level identifier (identifiers can't hold `-`). */
export const levelIdent = (roomId: string): string => roomId.replaceAll('-', '_');
export const roomIdOf = (ident: string): string => ident.replaceAll('_', '-');

function issues(e: z.ZodError, where: string): string {
  return e.issues.map((i) => `${where}: ${i.path.join('.')}: ${i.message}`).join('\n');
}

export function levelsDir(projectPath: string): string {
  return join(dirname(projectPath), basename(projectPath).replace(/\.ldtk$/, ''));
}

export function loadProject(path: string): Project {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = ProjectZ.safeParse(raw);
  if (!parsed.success) throw new Error(issues(parsed.error, path));
  const json = raw as ProjectJson;
  const levels: Level[] = [];
  for (const lv of json.levels) {
    if (lv.externalRelPath) {
      const file = join(dirname(path), lv.externalRelPath);
      const ext = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      const p = LevelZ.safeParse(ext);
      if (!p.success) throw new Error(issues(p.error, file));
      lv.layerInstances = (ext as Level).layerInstances;
    }
    if (!lv.layerInstances) throw new Error(`${path}: level ${lv.identifier} has no layers`);
    levels.push(lv as Level);
  }
  return { path, json, levels };
}

// ---------------------------------------------------------------------------------------------
// Derived fields.

const HEADER = {
  fileType: 'LDtk Project JSON',
  app: 'LDtk',
  doc: 'https://ldtk.io/json',
  schema: 'https://ldtk.io/files/JSON_SCHEMA.json',
  appAuthor: "Sebastien 'deepnight' Benard",
  appVersion: LDTK_VERSION,
  url: 'https://ldtk.io',
};

/** GridVania neighbours as LDtk computes them: n/s/e/w when edges touch, diagonals at corners. */
export function computeNeighbours(levels: Level[]): void {
  for (const a of levels) {
    const out: { levelIid: string; dir: string }[] = [];
    const ax1 = a.worldX + a.pxWid;
    const ay1 = a.worldY + a.pxHei;
    for (const b of levels) {
      if (a === b) continue;
      const bx1 = b.worldX + b.pxWid;
      const by1 = b.worldY + b.pxHei;
      const overlapX = a.worldX < bx1 && b.worldX < ax1;
      const overlapY = a.worldY < by1 && b.worldY < ay1;
      let dir = '';
      if (overlapX && overlapY) dir = 'o';
      else if (overlapY && bx1 === a.worldX) dir = 'w';
      else if (overlapY && b.worldX === ax1) dir = 'e';
      else if (overlapX && by1 === a.worldY) dir = 'n';
      else if (overlapX && b.worldY === ay1) dir = 's';
      else if (bx1 === a.worldX && by1 === a.worldY) dir = 'nw';
      else if (b.worldX === ax1 && by1 === a.worldY) dir = 'ne';
      else if (bx1 === a.worldX && b.worldY === ay1) dir = 'sw';
      else if (b.worldX === ax1 && b.worldY === ay1) dir = 'se';
      if (dir) out.push({ levelIid: b.iid, dir });
    }
    (a as Record<string, unknown>).__neighbours = out;
  }
}

/** Table of contents for entity defs flagged `exportToToc` (doors, pickups, rests, landmarks...). */
export function computeToc(p: Project): void {
  const defs = p.json.defs.entities as { identifier: string; exportToToc?: boolean }[];
  const worldIid = String((p.json as Record<string, unknown>).dummyWorldIid ?? iidFor('world'));
  const toc = defs
    .filter((d) => d.exportToToc)
    .map((d) => ({
      identifier: d.identifier,
      instancesData: p.levels.flatMap((lv) =>
        lv.layerInstances.flatMap((li) =>
          li.entityInstances
            .filter((e) => e.__identifier === d.identifier)
            .map((e) => ({
              iids: { worldIid, levelIid: lv.iid, layerIid: li.iid, entityIid: e.iid },
              worldX: lv.worldX + e.px[0],
              worldY: lv.worldY + e.px[1],
              widPx: e.width,
              heiPx: e.height,
              fields: Object.fromEntries(e.fieldInstances.map((f) => [f.__identifier, f.__value])),
            })),
        ),
      ),
    }));
  (p.json as Record<string, unknown>).toc = toc;
}

// ---------------------------------------------------------------------------------------------
// Saving.

/**
 * Writes the project and one `.ldtkl` per level (`<project>/<identifier>.ldtkl`, LDtk's own
 * naming), deleting level files no level refers to (LDtk does the same). Output is deterministic.
 */
export function saveProject(p: Project): string[] {
  const dir = levelsDir(p.path);
  const rel = basename(dir);
  mkdirSync(dir, { recursive: true });
  computeNeighbours(p.levels);
  computeToc(p);
  const written: string[] = [];
  const keep = new Set<string>();
  const stubs: unknown[] = [];
  for (const lv of p.levels) {
    const file = `${lv.identifier}.ldtkl`;
    keep.add(file);
    lv.externalRelPath = `${rel}/${file}`;
    const { layerInstances, externalRelPath: _x, ...rest } = lv;
    const levelFile = { __header__: HEADER, ...rest, externalRelPath: null, layerInstances };
    const text = formatJson(levelFile);
    const path = join(dir, file);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      writeFileSync(path, text);
      written.push(path);
    }
    stubs.push({ ...rest, externalRelPath: `${rel}/${file}`, layerInstances: null });
  }
  for (const f of readdirSync(dir))
    if (f.endsWith('.ldtkl') && !keep.has(f)) {
      rmSync(join(dir, f));
      written.push(join(dir, f));
    }
  const { levels: _l, ...projRest } = p.json;
  const text = formatJson({ __header__: HEADER, ...projRest, levels: stubs });
  if (!existsSync(p.path) || readFileSync(p.path, 'utf8') !== text) {
    writeFileSync(p.path, text);
    written.push(p.path);
  }
  return written;
}

/**
 * Pretty JSON, tab-indented like LDtk. Containers whose one-line form is short stay on one line;
 * `intGridCsv` prints one grid row per line (width from the sibling `__cWid`) so diffs are per row.
 */
export function formatJson(value: unknown): string {
  return `${fmt(value, '', undefined)}\n`;
}

function fmt(v: unknown, ind: string, rowWidth: number | undefined): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  const one = JSON.stringify(v);
  if (Array.isArray(v)) {
    if (rowWidth && v.length > rowWidth && v.every((x) => typeof x === 'number')) {
      const rows: string[] = [];
      for (let i = 0; i < v.length; i += rowWidth) rows.push(v.slice(i, i + rowWidth).join(','));
      return `[\n${rows.map((r) => `${ind}\t${r}`).join(',\n')}\n${ind}]`;
    }
    if (one.length + ind.length <= 110) return one;
    return `[\n${v.map((x) => `${ind}\t${fmt(x, `${ind}\t`, undefined)}`).join(',\n')}\n${ind}]`;
  }
  const obj = v as Record<string, unknown>;
  if (one.length + ind.length <= 110 && !('intGridCsv' in obj)) return one;
  const w = typeof obj.__cWid === 'number' ? obj.__cWid : undefined;
  const parts = Object.entries(obj).map(
    ([k, x]) => `${ind}\t${JSON.stringify(k)}: ${fmt(x, `${ind}\t`, k === 'intGridCsv' ? w : undefined)}`,
  );
  return `{\n${parts.join(',\n')}\n${ind}}`;
}

// ---------------------------------------------------------------------------------------------
// Field values (entity and level fields).

export type FieldKind = 'Int' | 'Float' | 'Bool' | 'String' | 'Multilines' | 'Point' | `Enum:${string}`;

export interface Point {
  cx: number;
  cy: number;
}

export function fieldType(kind: FieldKind, array: boolean): string {
  const base = kind.startsWith('Enum:') ? `LocalEnum.${kind.slice(5)}` : kind;
  return array ? `Array<${base}>` : base;
}

function editorValue(kind: FieldKind, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (kind) {
    case 'Int':
      return { id: 'V_Int', params: [v] };
    case 'Float':
      return { id: 'V_Float', params: [v] };
    case 'Bool':
      return { id: 'V_Bool', params: [v] };
    case 'Point': {
      const p = v as Point;
      return { id: 'V_String', params: [`${p.cx},${p.cy}`] };
    }
    default:
      return { id: 'V_String', params: [v] };
  }
}

/** A field instance in LDtk's shape (`__value` + `realEditorValues`). */
export function makeFieldInstance(
  identifier: string,
  defUid: number,
  kind: FieldKind,
  array: boolean,
  value: unknown,
): FieldInstance {
  const realEditorValues = array
    ? (value as unknown[]).map((x) => editorValue(kind, x))
    : [editorValue(kind, value)];
  return {
    __identifier: identifier,
    __type: fieldType(kind, array),
    __value: value ?? null,
    __tile: null,
    defUid,
    realEditorValues,
  };
}

export function fieldValue(list: FieldInstance[], identifier: string): unknown {
  return list.find((f) => f.__identifier === identifier)?.__value ?? null;
}
