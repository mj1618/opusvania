/**
 * LDtk definitions (layers, enums, entity and level field defs) generated from model.ts.
 * Code is the source of truth: `npm run world -- build` rewrites `defs` and the world test
 * fails when the project's defs differ from what this file generates. Uids of existing defs are
 * kept (matched by identifier) so instances stay valid; new ones take `nextUid`.
 */
import type { Project, ProjectJson } from './ldtk';
import { GRID, iidFor, LDTK_VERSION } from './ldtk';
import {
  BRUSH_DOCS,
  BRUSH_FIELDS,
  ENTITY_KINDS,
  ENTITY_SPECS,
  ENUMS,
  type EnumName,
  type FieldSpec,
  LEVEL_FIELDS,
  PAINT_AIR,
  PATH_SHAPES,
  RECT_SHAPES,
  SHAPES,
  type Shape,
  SLOPE_TILE_NAMES,
  TILE_NAMES,
  tileValue,
} from './model';

export const LAYERS = {
  entities: 'Entities',
  brushes: 'Brushes',
  paint: 'Paint',
  collision: 'Collision',
} as const;

/** LDtk identifier of a brush or entity def. */
export const defIdent = (name: string): string => name[0]?.toUpperCase() + name.slice(1);

/** Which brush fields each shape shows in the editor. */
export const SHAPE_FIELDS: Record<Shape, string[]> = {
  fill: ['op', 'tile', 'tag'],
  rect: ['op', 'tile', 'tag'],
  shaft: ['op', 'tile', 'tag'],
  blob: ['op', 'tile', 'rough', 'seed', 'tag'],
  arch: ['op', 'tile', 'thick', 'tag'],
  tunnel: ['op', 'tile', 'pts', 'width', 'rough', 'seed', 'tag'],
  ledges: ['op', 'tile', 'pts', 'width', 'thick', 'tag'],
  poly: ['op', 'tile', 'pts', 'tag'],
  ramp: ['op', 'tile', 'pts', 'grade', 'tag'],
  curve: ['op', 'pts', 'grade', 'tag'],
  stamp: ['name', 'flipX', 'tag'],
};

const TILE_COLOURS = [
  '#2A2230',
  '#C8A060',
  '#FF3030',
  '#FF3070',
  '#FF6030',
  '#FF6060',
  '#60FFFF',
  ...SLOPE_TILE_NAMES.map(() => '#4A3A50'),
];
const hexInt = (c: string) => Number.parseInt(c.slice(1), 16);

class Uids {
  private map = new Map<string, number>();
  constructor(private json: ProjectJson) {
    const d = json.defs as unknown as Record<
      string,
      { identifier: string; uid: number; fieldDefs?: { identifier: string; uid: number }[] }[]
    >;
    for (const l of d.layers ?? []) this.map.set(`layer:${l.identifier}`, l.uid);
    for (const e of d.enums ?? []) this.map.set(`enum:${e.identifier}`, e.uid);
    for (const e of d.entities ?? []) {
      this.map.set(`entity:${e.identifier}`, e.uid);
      for (const fd of e.fieldDefs ?? []) this.map.set(`field:${e.identifier}/${fd.identifier}`, fd.uid);
    }
    for (const fd of d.levelFields ?? []) this.map.set(`levelField:${fd.identifier}`, fd.uid);
  }
  get(key: string): number {
    const have = this.map.get(key);
    if (have !== undefined) return have;
    const uid = this.json.nextUid++;
    this.map.set(key, uid);
    return uid;
  }
}

function fieldDef(
  fs: FieldSpec,
  uid: number,
  enumUid: (n: EnumName) => number,
  display?: string,
): Record<string, unknown> {
  const enumName = fs.kind.startsWith('Enum:') ? (fs.kind.slice(5) as EnumName) : undefined;
  const base = enumName ? `LocalEnum.${enumName}` : fs.kind === 'Multilines' ? 'Multilines' : fs.kind;
  const type = enumName
    ? `F_Enum(${enumUid(enumName)})`
    : (
        {
          Int: 'F_Int',
          Float: 'F_Float',
          Bool: 'F_Bool',
          String: 'F_String',
          Multilines: 'F_Text',
          Point: 'F_Point',
        } as Record<string, string>
      )[fs.kind];
  let defaultOverride: unknown = null;
  const d = fs.def;
  if (!fs.array && d !== undefined && d !== null) {
    if (fs.kind === 'Int') defaultOverride = { id: 'V_Int', params: [d] };
    else if (fs.kind === 'Float') defaultOverride = { id: 'V_Float', params: [d] };
    else if (fs.kind === 'Bool') defaultOverride = { id: 'V_Bool', params: [d] };
    else defaultOverride = { id: 'V_String', params: [d] };
  }
  return {
    identifier: fs.name,
    doc: fs.doc ?? null,
    __type: fs.array ? `Array<${base}>` : base,
    uid,
    type,
    isArray: fs.array === true,
    canBeNull: fs.optional === true,
    arrayMinLength: null,
    arrayMaxLength: null,
    editorDisplayMode: display ?? (fs.kind === 'Point' ? 'PointStar' : 'NameAndValue'),
    editorDisplayScale: 1,
    editorDisplayPos: 'Beneath',
    editorLinkStyle: 'StraightArrow',
    editorDisplayColor: null,
    editorAlwaysShow: false,
    editorShowInWorld: true,
    editorCutLongValues: true,
    editorTextSuffix: null,
    editorTextPrefix: null,
    useForSmartColor: fs.name === 'op',
    exportToToc: false,
    searchable: false,
    min: null,
    max: null,
    regex: null,
    acceptFileTypes: null,
    defaultOverride,
    textLanguageMode: fs.name === 'claims' ? 'LangJson' : null,
    symmetricalRef: false,
    autoChainRef: false,
    allowOutOfLevelRef: true,
    allowedRefs: 'OnlySame',
    allowedRefsEntityUid: null,
    allowedRefTags: [],
    tilesetUid: null,
  };
}

function entityDef(
  identifier: string,
  uid: number,
  o: {
    color: string;
    resizable: boolean;
    toc: boolean;
    doc: string;
    tags: string[];
    hollow: boolean;
    fieldDefs: unknown[];
  },
): Record<string, unknown> {
  return {
    identifier,
    uid,
    tags: o.tags,
    exportToToc: o.toc,
    // Brushes may hang over the room edge (a section brush cut by a seam keeps its true geometry).
    allowOutOfBounds: o.tags.includes('brush'),
    doc: o.doc,
    width: GRID,
    height: GRID,
    resizableX: o.resizable,
    resizableY: o.resizable,
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null,
    keepAspectRatio: false,
    tileOpacity: 1,
    fillOpacity: o.hollow ? 0.08 : 0.35,
    lineOpacity: 1,
    hollow: o.hollow,
    color: o.color,
    renderMode: 'Rectangle',
    showName: true,
    tilesetId: null,
    tileRenderMode: 'FitInside',
    tileRect: null,
    uiTileRect: null,
    nineSliceBorders: [],
    maxCount: 0,
    limitScope: 'PerLevel',
    limitBehavior: 'MoveLastOne',
    pivotX: 0,
    pivotY: 0,
    fieldDefs: o.fieldDefs,
  };
}

function layerDef(
  identifier: string,
  uid: number,
  type: 'IntGrid' | 'Entities',
  extra: Record<string, unknown>,
) {
  return {
    __type: type,
    identifier,
    type,
    uid,
    doc: null,
    uiColor: null,
    gridSize: GRID,
    guideGridWid: 0,
    guideGridHei: 0,
    displayOpacity: 1,
    inactiveOpacity: type === 'IntGrid' ? 0.6 : 1,
    hideInList: false,
    hideFieldsWhenInactive: true,
    canSelectWhenInactive: true,
    renderInWorldView: true,
    pxOffsetX: 0,
    pxOffsetY: 0,
    parallaxFactorX: 0,
    parallaxFactorY: 0,
    parallaxScaling: true,
    requiredTags: [],
    excludedTags: [],
    autoTilesKilledByOtherLayerUid: null,
    uiFilterTags: [],
    useAsyncRender: false,
    intGridValues: [],
    intGridValuesGroups: [],
    autoRuleGroups: [],
    autoSourceLayerDefUid: null,
    tilesetDefUid: null,
    tilePivotX: 0,
    tilePivotY: 0,
    biomeFieldUid: null,
    ...extra,
  };
}

/** Rewrites `json.defs` from the model tables (keeps existing uids). */
export function syncDefs(json: ProjectJson): void {
  const uids = new Uids(json);
  const enumUid = (n: EnumName) => uids.get(`enum:${n}`);
  const OP_COLOURS: Record<string, string> = { add: '#8A5A2B', carve: '#7FD6FF' };
  const enums = (Object.keys(ENUMS) as EnumName[]).map((name) => ({
    identifier: name,
    uid: enumUid(name),
    values: ENUMS[name].map((id, i) => ({
      id,
      tileRect: null,
      color: hexInt(
        name === 'Op'
          ? (OP_COLOURS[id] as string)
          : name === 'Tile'
            ? (TILE_COLOURS[i] as string)
            : '#808080',
      ),
    })),
    iconTilesetUid: null,
    externalRelPath: null,
    externalFileChecksum: null,
    tags: [],
  }));
  const brushDefs = SHAPES.map((shape) => {
    const id = defIdent(shape);
    const fds = SHAPE_FIELDS[shape].map((n) => {
      const fs = BRUSH_FIELDS.find((x) => x.name === n) as FieldSpec;
      const display = n === 'pts' ? (shape === 'poly' ? 'PointPathLoop' : 'PointPath') : undefined;
      return fieldDef(fs, uids.get(`field:${id}/${n}`), enumUid, display);
    });
    return entityDef(id, uids.get(`entity:${id}`), {
      color: '#8A5A2B',
      resizable: RECT_SHAPES.includes(shape),
      toc: false,
      doc: `Brush: ${BRUSH_DOCS[shape]}${PATH_SHAPES.includes(shape) ? ' Geometry = `pts`; the entity position is only a handle.' : ''}`,
      tags: ['brush'],
      hollow: true,
      fieldDefs: fds,
    });
  });
  const gameDefs = ENTITY_KINDS.map((kind) => {
    const spec = ENTITY_SPECS[kind];
    const id = defIdent(kind);
    return entityDef(id, uids.get(`entity:${id}`), {
      color: spec.color,
      resizable: spec.rect,
      toc: spec.toc === true,
      doc: spec.doc,
      tags: ['game'],
      hollow: spec.rect,
      fieldDefs: spec.fields.map((fs) => fieldDef(fs, uids.get(`field:${id}/${fs.name}`), enumUid)),
    });
  });
  const intValues = (withAir: boolean) => [
    ...TILE_NAMES.map((n, i) => ({
      value: tileValue(n),
      identifier: n,
      color: TILE_COLOURS[i],
      tile: null,
      groupUid: 0,
    })),
    ...(withAir ? [{ value: PAINT_AIR, identifier: 'air', color: '#E8F4FF', tile: null, groupUid: 0 }] : []),
  ];
  const layers = [
    layerDef(LAYERS.entities, uids.get(`layer:${LAYERS.entities}`), 'Entities', {
      doc: 'Gameplay entities (compiled into the RoomFile).',
      excludedTags: ['brush'],
    }),
    layerDef(LAYERS.brushes, uids.get(`layer:${LAYERS.brushes}`), 'Entities', {
      doc: 'Shape brushes, applied in order by `npm run world -- bake`.',
      requiredTags: ['brush'],
      displayOpacity: 0.7,
    }),
    layerDef(LAYERS.paint, uids.get(`layer:${LAYERS.paint}`), 'IntGrid', {
      doc: 'Hand overrides applied after the brushes (air = force air).',
      intGridValues: intValues(true),
    }),
    layerDef(LAYERS.collision, uids.get(`layer:${LAYERS.collision}`), 'IntGrid', {
      doc: 'GENERATED by `npm run world -- build` from Brushes + Paint. Do not paint here: use Paint.',
      intGridValues: intValues(false),
      displayOpacity: 0.85,
    }),
  ];
  const levelFields = LEVEL_FIELDS.map((fs) => fieldDef(fs, uids.get(`levelField:${fs.name}`), enumUid));
  json.defs = {
    layers,
    entities: [...gameDefs, ...brushDefs],
    tilesets: [],
    enums,
    externalEnums: [],
    levelFields,
  } as unknown as ProjectJson['defs'];
}

/** A fresh, empty project (GridVania, 1-tile world grid, levels in separate files). */
export function newProjectJson(): ProjectJson {
  const json = {
    iid: iidFor('project'),
    jsonVersion: LDTK_VERSION,
    appBuildId: 473703,
    nextUid: 1,
    identifierStyle: 'Free',
    toc: [],
    worldLayout: 'GridVania',
    // One tile: GridVania snaps positions to the collision grid, so rooms can be any tile size
    // (70 x 30, 150 x 60...) and edges line up tile for tile (memory/level-authoring.md).
    worldGridWidth: GRID,
    worldGridHeight: GRID,
    defaultLevelWidth: 30 * GRID,
    defaultLevelHeight: 17 * GRID,
    defaultPivotX: 0,
    defaultPivotY: 0,
    defaultGridSize: GRID,
    defaultEntityWidth: GRID,
    defaultEntityHeight: GRID,
    bgColor: '#1B1720',
    defaultLevelBgColor: '#E8F0F8',
    minifyJson: false,
    externalLevels: true,
    exportTiled: false,
    simplifiedExport: false,
    imageExportMode: 'None',
    exportLevelBg: true,
    pngFilePattern: null,
    backupOnSave: false,
    backupLimit: 10,
    backupRelPath: null,
    levelNamePattern: 'room_%idx',
    tutorialDesc:
      'Tallage world. Agents edit it through `npm run world` (room sheets); see memory/level-authoring.md. Collision is generated from the Brushes layer (+ Paint): never paint Collision by hand.',
    customCommands: [{ command: 'npm run world -- build', when: 'AfterSave' }],
    flags: ['UseMultilinesType'],
    defs: { layers: [], entities: [], tilesets: [], enums: [], externalEnums: [], levelFields: [] },
    levels: [],
    worlds: [],
    dummyWorldIid: iidFor('world'),
  };
  syncDefs(json as unknown as ProjectJson);
  return json as unknown as ProjectJson;
}

export function layerUid(p: Project, name: string): number {
  const l = p.json.defs.layers.find((x) => x.identifier === name);
  if (!l) throw new Error(`project has no layer ${name}: run npm run world -- build`);
  return l.uid;
}
