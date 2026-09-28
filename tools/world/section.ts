/**
 * Section sheets: author a whole region in WORLD tiles, then cut it into rooms (north star §3.3:
 * "author the region as one section, then cut rooms"). One brush can run across a seam (a tunnel
 * through two rooms) and bakes identically on both sides, because every brush raster is
 * translation-invariant: each room gets a translated copy of every brush that touches it.
 *
 *   { "section": "tally",
 *     "rooms": [ {"id": "tally-lane", "at": [0, 0], "size": [60, 34], "abilities": [...]}, ... ],
 *     "brushes": [ ...world tiles... ], "entities": [ ...world tiles... ], "paint": [ ... ] }
 *
 * Import replaces every room whose id starts with `<section>-` (rooms missing from the sheet are
 * deleted). Copies are tagged `s<index>` (`s<index>:<tag>`) so export can rebuild the section.
 */
import { z } from 'zod';
import { loadStamp } from './bake';
import {
  type Brush,
  BrushTuple,
  brushFromTuple,
  brushToTuple,
  type Ent,
  EntTuple,
  entFromTuple,
  entToTuple,
  formatSheet,
  type LevelModel,
  modelToSheet,
  PAINT_NAMES,
  paintName,
  rectCover,
  SheetSchema,
  sheetToModel,
} from './model';

const Int = z.number().int();
const RoomHeader = SheetSchema.omit({ brushes: true, entities: true, paint: true });

export const SectionSchema = z.strictObject({
  section: z
    .string()
    .regex(/^[a-z][a-z0-9]*$/, 'a section is one kebab word: its rooms are <section>-<room>'),
  /** Room-id prefixes this section owns (default: just the section). A region that spans districts
   * (the proof: tally-* and cellars-*) lists each; import replaces every room under any of them. */
  regions: z
    .array(z.string().regex(/^[a-z][a-z0-9]*$/))
    .min(1)
    .optional(),
  rooms: z.array(RoomHeader).min(1),
  brushes: z.array(BrushTuple),
  entities: z.array(EntTuple).default([]),
  paint: z.array(z.tuple([Int, Int, Int.positive(), Int.positive(), z.enum(PAINT_NAMES)])).default([]),
});
export type Section = z.input<typeof SectionSchema>;

type Rect = [number, number, number, number];
const TAG = /^s(\d+)(?::(.*))?$/;

/** World-tile bounding box of a brush (undefined = the whole room: `fill`). */
function brushBox(b: Brush): Rect | undefined {
  const fromPts = (pad: number, extra: [number, number] = [0, 0]): Rect => {
    const xs = b.pts.map((p) => p[0]);
    const ys = b.pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad;
    return [x0, y0, Math.max(...xs) + pad + extra[0] - x0 + 1, Math.max(...ys) + pad + extra[1] - y0 + 1];
  };
  const r = b.rect as Rect;
  switch (b.shape) {
    case 'fill':
      return undefined;
    case 'rect':
    case 'shaft':
    case 'arch':
      return r;
    case 'blob':
      return [r[0] - b.rough, r[1] - b.rough, r[2] + 2 * b.rough, r[3] + 2 * b.rough];
    case 'tunnel':
      return fromPts(Math.ceil(b.width / 2) + b.rough + 1);
    case 'ledges':
      return fromPts(0, [b.width, Math.max(1, b.thick)]);
    case 'poly':
    case 'ramp':
      return fromPts(1);
    case 'stamp': {
      const st = loadStamp(b.name ?? '');
      return [r[0], r[1], Math.max(...st.rows.map((x) => x.length)), st.rows.length];
    }
  }
}

const hits = (a: Rect, b: Rect) =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

function translate(b: Brush, dx: number, dy: number): Brush {
  const out: Brush = { ...b, pts: b.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  if (b.rect) out.rect = [b.rect[0] + dx, b.rect[1] + dy, b.rect[2], b.rect[3]];
  return out;
}

/** Cuts a section into room models (not baked). */
export function sectionToModels(input: unknown): {
  section: string;
  regions: string[];
  models: LevelModel[];
} {
  const s = SectionSchema.parse(input);
  const regions = s.regions ?? [s.section];
  const brushes = s.brushes.map(brushFromTuple);
  const ents = s.entities.map(entFromTuple);
  const models: LevelModel[] = [];
  const owned = new Set<number>();
  for (const room of s.rooms) {
    if (!regions.some((r) => room.id.startsWith(`${r}-`)))
      throw new Error(
        `room ${room.id} is not in section ${s.section} (ids are <${regions.join('|')}>-<room>)`,
      );
    const [ox, oy] = room.at;
    const box: Rect = [ox, oy, room.size[0], room.size[1]];
    const roomBrushes = brushes.flatMap((b, i) => {
      const bb = brushBox(b);
      if (bb && !hits(bb, box)) return [];
      return [{ ...translate(b, -ox, -oy), tag: b.tag ? `s${i}:${b.tag}` : `s${i}` }];
    });
    const roomEnts: Ent[] = [];
    ents.forEach((e, i) => {
      const [x, y, w, h] = e.rect;
      if (x < ox || y < oy || x >= ox + box[2] || y >= oy + box[3]) return;
      if (x + w > ox + box[2] || y + h > oy + box[3])
        throw new Error(
          `entities[${i}] ${e.kind} at ${x},${y} crosses the edge of ${room.id}: keep entities inside one room`,
        );
      owned.add(i);
      roomEnts.push({ ...e, rect: [x - ox, y - oy, w, h] });
    });
    const paint = s.paint.flatMap(([x, y, w, h, v]) => {
      const x0 = Math.max(x, ox);
      const y0 = Math.max(y, oy);
      const x1 = Math.min(x + w, ox + box[2]);
      const y1 = Math.min(y + h, oy + box[3]);
      return x1 > x0 && y1 > y0 ? [[x0 - ox, y0 - oy, x1 - x0, y1 - y0, v]] : [];
    });
    const sheet = {
      ...room,
      brushes: roomBrushes.map(brushToTuple),
      entities: roomEnts.map(entToTuple),
      paint,
    };
    models.push(sheetToModel(sheet));
  }
  ents.forEach((e, i) => {
    if (!owned.has(i))
      throw new Error(`entities[${i}] ${e.kind} at ${e.rect[0]},${e.rect[1]} is in no room of the section`);
  });
  return { section: s.section, regions, models };
}

/** Rebuilds a section sheet (world tiles) from its rooms. Brushes not from a section come last. */
export function modelsToSection(
  section: string,
  models: LevelModel[],
  regions?: string[],
): Record<string, unknown> {
  const tagged = new Map<number, unknown[]>();
  const loose: unknown[] = [];
  const looseSeen = new Set<string>();
  const entities: unknown[] = [];
  const rooms: unknown[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const m of models) {
    x0 = Math.min(x0, m.at[0]);
    y0 = Math.min(y0, m.at[1]);
    x1 = Math.max(x1, m.at[0] + m.size[0]);
    y1 = Math.max(y1, m.at[1] + m.size[1]);
  }
  const W = x1 - x0;
  const H = y1 - y0;
  const paint = new Uint8Array(Math.max(0, W * H));
  for (const m of models) {
    const { brushes: _b, entities: _e, paint: _p, ...header } = modelToSheet(m);
    rooms.push(header);
    for (const b of m.brushes) {
      const t = TAG.exec(b.tag ?? '');
      const world = translate(b, m.at[0], m.at[1]);
      if (t) {
        const tag = t[2];
        const clean: Brush = { ...world };
        if (tag) clean.tag = tag;
        else delete clean.tag;
        if (!tagged.has(Number(t[1]))) tagged.set(Number(t[1]), brushToTuple(clean));
      } else {
        const tuple = brushToTuple(world);
        const k = JSON.stringify(tuple);
        if (!looseSeen.has(k)) loose.push(tuple);
        looseSeen.add(k);
      }
    }
    for (const e of m.entities)
      entities.push(
        entToTuple({ ...e, rect: [e.rect[0] + m.at[0], e.rect[1] + m.at[1], e.rect[2], e.rect[3]] }),
      );
    const [w, h] = m.size;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = m.paint[y * w + x] as number;
        if (v) paint[(m.at[1] + y - y0) * W + (m.at[0] + x - x0)] = v;
      }
  }
  const brushes = [...[...tagged.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t), ...loose];
  const out: Record<string, unknown> = { section };
  if (regions && (regions.length !== 1 || regions[0] !== section)) out.regions = regions;
  Object.assign(out, { rooms, brushes, entities });
  const pr = rectCover(paint, W, H).map(([x, y, w, h, v]) => [x + x0, y + y0, w, h, paintName(v)]);
  if (pr.length) out.paint = pr;
  return out;
}

/** Section JSON: rooms, brushes, entities and paint one per line. */
export function formatSection(sec: Record<string, unknown>): string {
  return formatSheet(sec).replace(/^ {2}"rooms": (\[.*\]),?$/m, (line, arr: string) => {
    const rooms = JSON.parse(arr) as unknown[];
    const comma = line.trimEnd().endsWith(',') ? ',' : '';
    return `  "rooms": [\n${rooms.map((r, i) => `    ${JSON.stringify(r)}${i < rooms.length - 1 ? ',' : ''}`).join('\n')}\n  ]${comma}`;
  });
}
