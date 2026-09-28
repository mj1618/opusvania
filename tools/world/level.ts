/**
 * LDtk level <-> LevelModel. The model is what bake, compile, lint, the sheet and the PNG
 * renderer work on; this file is the only place that knows how it is laid out in LDtk.
 */
import { defIdent, LAYERS } from './defs';
import {
  type EntityInstance,
  type FieldInstance,
  fieldValue,
  GRID,
  iidFor,
  type LayerInstance,
  type Level,
  levelIdent,
  makeFieldInstance,
  type Point,
  type Project,
  roomIdOf,
} from './ldtk';
import {
  BRUSH_FIELDS,
  type Brush,
  ENTITY_KINDS,
  ENTITY_SPECS,
  type Ent,
  type EntityKind,
  type FieldSpec,
  LEVEL_FIELDS,
  type LevelModel,
  PATH_SHAPES,
  RECT_SHAPES,
  SHAPES,
  type Shape,
} from './model';

interface DefInfo {
  uid: number;
  color: string;
  tags: string[];
  fields: Map<string, { uid: number }>;
}

function defsByIdent(p: Project): Map<string, DefInfo> {
  const out = new Map<string, DefInfo>();
  for (const e of p.json.defs.entities as unknown as {
    identifier: string;
    uid: number;
    color: string;
    tags: string[];
    fieldDefs: { identifier: string; uid: number }[];
  }[])
    out.set(e.identifier, {
      uid: e.uid,
      color: e.color,
      tags: e.tags,
      fields: new Map(e.fieldDefs.map((f) => [f.identifier, { uid: f.uid }])),
    });
  return out;
}

const toLdtkValue = (fs: FieldSpec, v: unknown): unknown => {
  if (v === undefined || v === null) return fs.array ? [] : null;
  if (fs.kind !== 'Point') return v;
  const pt = (x: unknown) => {
    const [cx, cy] = x as [number, number];
    return { cx, cy };
  };
  return fs.array ? (v as unknown[]).map(pt) : pt(v);
};
const fromLdtkValue = (fs: FieldSpec, v: unknown): unknown => {
  if (v === null || v === undefined) return undefined;
  if (fs.kind !== 'Point') return v;
  const pt = (x: unknown) => [(x as Point).cx, (x as Point).cy];
  return fs.array ? (v as unknown[]).map(pt) : pt(v);
};

function fieldsOut(
  specs: FieldSpec[],
  values: Record<string, unknown>,
  uidOf: (n: string) => number | undefined,
): FieldInstance[] {
  const out: FieldInstance[] = [];
  for (const fs of specs) {
    const uid = uidOf(fs.name);
    if (uid === undefined) continue;
    const v = values[fs.name] ?? fs.def ?? null;
    out.push(makeFieldInstance(fs.name, uid, fs.kind, fs.array === true, toLdtkValue(fs, v)));
  }
  return out;
}

function entityInstance(
  lv: { id: string; worldX: number; worldY: number },
  layer: string,
  index: number,
  identifier: string,
  def: DefInfo,
  rect: [number, number, number, number],
  fieldInstances: FieldInstance[],
): EntityInstance {
  const [x, y, w, h] = rect;
  return {
    __identifier: identifier,
    __grid: [x, y],
    __pivot: [0, 0],
    __tags: def.tags,
    __tile: null,
    __smartColor: def.color,
    __worldX: lv.worldX + x * GRID,
    __worldY: lv.worldY + y * GRID,
    iid: iidFor(`${lv.id}/${layer}/${index}`),
    width: w * GRID,
    height: h * GRID,
    defUid: def.uid,
    px: [x * GRID, y * GRID],
    fieldInstances,
  };
}

function layerInstance(
  lv: { id: string; uid: number; w: number; h: number },
  name: string,
  type: 'IntGrid' | 'Entities',
  defUid: number,
  seed: number,
): LayerInstance {
  return {
    __identifier: name,
    __type: type,
    __cWid: lv.w,
    __cHei: lv.h,
    __gridSize: GRID,
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __tilesetDefUid: null,
    __tilesetRelPath: null,
    iid: iidFor(`${lv.id}/layer/${name}`),
    levelId: lv.uid,
    layerDefUid: defUid,
    pxOffsetX: 0,
    pxOffsetY: 0,
    visible: true,
    optionalRules: [],
    intGridCsv: [],
    autoLayerTiles: [],
    seed,
    overrideTilesetUid: null,
    gridTiles: [],
    entityInstances: [],
  };
}

/** Builds (or rebuilds) the LDtk level for a model. `uid` comes from the existing level or nextUid. */
export function modelToLevel(p: Project, m: LevelModel, uid: number): Level {
  const defs = defsByIdent(p);
  const [w, h] = m.size;
  const worldX = m.at[0] * GRID;
  const worldY = m.at[1] * GRID;
  const lvInfo = { id: m.id, uid, w, h, worldX, worldY };
  const layerDefs = p.json.defs.layers;
  const layers: LayerInstance[] = [];
  for (const [i, ld] of layerDefs.entries()) {
    const li = layerInstance(lvInfo, ld.identifier, ld.type as 'IntGrid' | 'Entities', ld.uid, 1000 + i);
    if (ld.identifier === LAYERS.paint) li.intGridCsv = [...m.paint];
    else if (ld.identifier === LAYERS.collision) li.intGridCsv = [...m.collision];
    else if (ld.identifier === LAYERS.entities) {
      li.entityInstances = m.entities.map((e, idx) => {
        const ident = defIdent(e.kind);
        const def = defs.get(ident);
        if (!def) throw new Error(`no entity def ${ident}: run npm run world -- build`);
        const fis = fieldsOut(ENTITY_SPECS[e.kind].fields, e.props, (n) => def.fields.get(n)?.uid);
        return entityInstance(lvInfo, ld.identifier, idx, ident, def, e.rect, fis);
      });
    } else if (ld.identifier === LAYERS.brushes) {
      li.entityInstances = m.brushes.map((b, idx) => {
        const ident = defIdent(b.shape);
        const def = defs.get(ident);
        if (!def) throw new Error(`no brush def ${ident}: run npm run world -- build`);
        const values: Record<string, unknown> = { ...b };
        let rect: [number, number, number, number] = [0, 0, 1, 1];
        if (RECT_SHAPES.includes(b.shape) && b.rect) rect = b.rect;
        else if (b.shape === 'stamp' && b.rect) rect = [b.rect[0], b.rect[1], 1, 1];
        else if (PATH_SHAPES.includes(b.shape) && b.pts[0]) rect = [b.pts[0][0], b.pts[0][1], 1, 1];
        // Rect shapes and stamps keep their true rect (brushes may hang over the edge); a path
        // brush's position is only a handle, kept inside the level so it stays easy to grab.
        if (!RECT_SHAPES.includes(b.shape) && b.shape !== 'stamp')
          rect = [
            Math.min(Math.max(rect[0], 0), w - 1),
            Math.min(Math.max(rect[1], 0), h - 1),
            rect[2],
            rect[3],
          ];
        const fis = fieldsOut(BRUSH_FIELDS, values, (n) => def.fields.get(n)?.uid);
        return entityInstance(lvInfo, ld.identifier, idx, ident, def, rect, fis);
      });
    }
    layers.push(li);
  }
  const levelFieldUid = new Map(
    (p.json.defs.levelFields as { identifier: string; uid: number }[]).map((f) => [f.identifier, f.uid]),
  );
  return {
    identifier: levelIdent(m.id),
    iid: iidFor(`level:${m.id}`),
    uid,
    worldX,
    worldY,
    worldDepth: 0,
    pxWid: w * GRID,
    pxHei: h * GRID,
    __bgColor: '#E8F0F8',
    bgColor: null,
    useAutoIdentifier: false,
    bgRelPath: null,
    bgPos: null,
    bgPivotX: 0.5,
    bgPivotY: 0.5,
    __smartColor: '#F3F7FB',
    __bgPos: null,
    externalRelPath: null,
    fieldInstances: fieldsOut(LEVEL_FIELDS, m.fields, (n) => levelFieldUid.get(n)),
    layerInstances: layers,
    __neighbours: [],
  };
}

function layer(lv: Level, name: string): LayerInstance | undefined {
  return lv.layerInstances.find((l) => l.__identifier === name);
}

const SHAPE_BY_IDENT = new Map(SHAPES.map((s) => [defIdent(s), s]));
const KIND_BY_IDENT = new Map(ENTITY_KINDS.map((k) => [defIdent(k), k]));

/** Reads a level into the model. Throws on unknown entity types or bad sizes. */
export function levelToModel(lv: Level): LevelModel {
  const id = roomIdOf(lv.identifier);
  if (lv.pxWid % GRID || lv.pxHei % GRID || lv.worldX % GRID || lv.worldY % GRID)
    throw new Error(`level ${lv.identifier}: size and world position must be whole tiles (${GRID} px)`);
  const w = lv.pxWid / GRID;
  const h = lv.pxHei / GRID;
  const grid = (name: string) => {
    const li = layer(lv, name);
    const out = new Uint8Array(w * h);
    if (li && li.intGridCsv.length === w * h) out.set(li.intGridCsv);
    else if (li && li.intGridCsv.length > 0)
      throw new Error(`level ${lv.identifier}: ${name} has ${li.intGridCsv.length} cells, expected ${w * h}`);
    return out;
  };
  const fields: Record<string, unknown> = {};
  for (const fs of LEVEL_FIELDS) {
    const v = fromLdtkValue(fs, fieldValue(lv.fieldInstances, fs.name));
    if (v !== undefined) fields[fs.name] = v;
    else if (fs.def !== undefined) fields[fs.name] = structuredClone(fs.def);
  }
  const rectOf = (e: EntityInstance): [number, number, number, number] => {
    const [px, py] = e.px;
    if (px % GRID || py % GRID || e.width % GRID || e.height % GRID)
      throw new Error(`level ${lv.identifier}: ${e.__identifier} at ${px},${py} is off the ${GRID}px grid`);
    return [px / GRID, py / GRID, e.width / GRID, e.height / GRID];
  };
  const brushes: Brush[] = (layer(lv, LAYERS.brushes)?.entityInstances ?? []).map((e) => {
    const shape = SHAPE_BY_IDENT.get(e.__identifier) as Shape | undefined;
    if (!shape) throw new Error(`level ${lv.identifier}: unknown brush ${e.__identifier}`);
    const b: Brush = {
      shape,
      op: 'add',
      tile: 'solid',
      pts: [],
      width: 0,
      thick: 0,
      rough: 0,
      seed: 0,
      flipX: false,
    };
    for (const fs of BRUSH_FIELDS) {
      const v = fromLdtkValue(fs, fieldValue(e.fieldInstances, fs.name));
      if (v !== undefined) (b as unknown as Record<string, unknown>)[fs.name] = v;
    }
    if (b.name === undefined) delete b.name;
    if (b.tag === undefined) delete b.tag;
    // 'none' is the stored default (stairs / default curve grade); sheets omit it, so models do too.
    if (b.grade === 'none') delete b.grade;
    const r = rectOf(e);
    if (RECT_SHAPES.includes(shape)) b.rect = r;
    if (shape === 'stamp') b.rect = [r[0], r[1], 1, 1];
    return b;
  });
  const entities: Ent[] = (layer(lv, LAYERS.entities)?.entityInstances ?? []).map((e) => {
    const kind = KIND_BY_IDENT.get(e.__identifier) as EntityKind | undefined;
    if (!kind) throw new Error(`level ${lv.identifier}: unknown entity ${e.__identifier}`);
    const props: Record<string, unknown> = {};
    for (const fs of ENTITY_SPECS[kind].fields) {
      const v = fromLdtkValue(fs, fieldValue(e.fieldInstances, fs.name));
      if (v !== undefined) props[fs.name] = v;
      else if (fs.def !== undefined) props[fs.name] = structuredClone(fs.def);
    }
    return { kind, rect: rectOf(e), props };
  });
  return {
    id,
    at: [lv.worldX / GRID, lv.worldY / GRID],
    size: [w, h],
    fields,
    brushes,
    entities,
    paint: grid(LAYERS.paint),
    collision: grid(LAYERS.collision),
  };
}
