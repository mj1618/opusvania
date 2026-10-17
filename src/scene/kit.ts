import { z } from 'zod';
import { defaultTuning } from '../sim/tuning';

/**
 * The level kit's room data (memory/level-kit.md): the Zod shapes `parseScene` (src/scene/index.ts)
 * spreads into the room schema, and the placement rules it runs (`checkKit`). Sim side: src/sim/kit.ts,
 * src/sim/paths.ts; render: src/render/greybox/kit.ts, src/render/camera/zones.ts.
 */

const int = z.number().int();
const id = z.string().min(1);
const rect = { id, x: int, y: int, w: int.positive(), h: int.positive() };
const kick = z.union([z.boolean(), z.literal('east'), z.literal('west')]).optional();

/** Fields of a room: thorns, seed-cases, rotten bark, flag gates, triggers. */
export const KIT_FIELDS = {
  thorns: z.array(z.object(rect).strict()).optional(),
  seedCases: z.array(z.object({ id, x: int, y: int }).strict()).optional(),
  bark: z
    .array(
      z.object({ ...rect, floor: z.boolean().optional(), hp: int.min(1).max(9).optional(), kick }).strict(),
    )
    .optional(),
  gates: z.array(z.object({ ...rect, flag: id, kick }).strict()).optional(),
  triggers: z.array(z.object({ ...rect, sets: id }).strict()).optional(),
};

/** A lure's `swing` (src/sim/paths.ts). */
export const SWING = z
  .object({
    length: int.min(64).max(2000),
    reach: int.min(0).max(1200).optional(),
    period: int.min(30).max(1200).optional(),
    phase: z.number().min(0).max(1).optional(),
  })
  .strict()
  .optional();

/**
 * `camera.zones` (render-only, src/render/camera/zones.ts): while her body centre is inside the rect the
 * view eases to `zoom` (or, with `fit`, the zoom that puts the whole frame inside the 16:9 safe area of
 * every window) and keeps inside `bounds` (with `lock`, the zone's own rect: a view at least that big
 * centres on it).
 */
export const CAMERA_ZONES = z
  .array(
    z
      .object({
        ...rect,
        zoom: z.number().min(0.5).max(2).optional(),
        fit: z.boolean().optional(),
        lock: z.boolean().optional(),
        bounds: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict().optional(),
      })
      .strict(),
  )
  .optional();

/** A route claim's `flags`: story flags that must be set to pass (the world check, src/scene/world.ts). */
export const ROUTE_FLAGS = z.array(id).optional();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface KitRoom {
  id: string;
  width: number;
  height: number;
  ceilingY?: number | undefined;
  spawn: { x: number; y: number };
  solids: Box[];
  thorns?: Array<Box & { id: string }> | undefined;
  seedCases?: Array<{ id: string; x: number; y: number }> | undefined;
  bark?: Array<Box & { id: string }> | undefined;
  gates?: Array<Box & { id: string; flag: string }> | undefined;
  triggers?: Array<Box & { id: string; sets: string }> | undefined;
  lures?:
    | Array<{
        id: string;
        kind: 'wick' | 'lantern' | 'ring' | 'great';
        x: number;
        y: number;
        swing?: { length: number; reach?: number | undefined; period?: number | undefined } | undefined;
      }>
    | undefined;
  camera?: { zones?: Array<Box & { id: string; bounds?: Box | undefined }> | undefined } | undefined;
}

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The kit's placement rules; `seen` = every id of the room so far (kit ids join it). Throws on a problem. */
export function checkKit(s: KitRoom, seen: Set<string>): void {
  const bad = (msg: string) => {
    throw new Error(`Scene "${s.id}": ${msg}`);
  };
  const named = (x: { id: string }) => {
    if (seen.has(x.id)) bad(`two things are called "${x.id}"`);
    seen.add(x.id);
  };
  const inside = (what: string, r: Box) => {
    if (r.x < 0 || r.y < Math.min(0, s.ceilingY ?? 0) || r.x + r.w > s.width || r.y + r.h > s.height)
      bad(`${what} leaves the scene bounds`);
  };
  // Her body at the spawn (40 x 80 over the feet point).
  const B = defaultTuning.body;
  const spawn = { x: s.spawn.x - B.width / 2, y: s.spawn.y - B.height, w: B.width, h: B.height };
  for (const r of s.thorns ?? []) {
    named(r);
    inside(`thorns "${r.id}"`, r);
    if (hits(r, spawn)) bad(`thorns "${r.id}" touch the spawn`);
  }
  const half = Math.round(defaultTuning.kit.seedCase.size) >> 1;
  for (const c of s.seedCases ?? []) {
    named(c);
    const box = { x: c.x - half, y: c.y - half, w: 2 * half, h: 2 * half };
    inside(`seed-case "${c.id}"`, box);
    if (s.solids.some((q) => hits(q, box))) bad(`seed-case "${c.id}" is inside a solid`);
  }
  for (const b of s.bark ?? []) {
    named(b);
    inside(`bark "${b.id}"`, b);
    if (s.solids.some((q) => hits(q, b))) bad(`bark "${b.id}" overlaps a solid (it is its own solid)`);
    if (hits(b, spawn)) bad(`bark "${b.id}" covers the spawn`);
  }
  for (const g of s.gates ?? []) {
    named(g);
    inside(`gate "${g.id}"`, g);
    if (s.solids.some((q) => hits(q, g))) bad(`gate "${g.id}" overlaps a solid (it is its own solid)`);
    if (hits(g, spawn)) bad(`gate "${g.id}" covers the spawn`);
  }
  for (const t of s.triggers ?? []) {
    named(t);
    inside(`trigger "${t.id}"`, t);
  }
  // A swinging lure: its pivot inside the room and the core clear of solids along the whole arc.
  const L = defaultTuning.lures;
  for (const l of s.lures ?? []) {
    if (!l.swing) continue;
    const len = l.swing.length;
    const reach = Math.min(len * 0.95, l.swing.reach ?? L.swing.reach);
    if (l.y - len < Math.min(0, s.ceilingY ?? 0)) bad(`lure "${l.id}" hangs from above the room`);
    const c = L.kinds[l.kind].core;
    for (let k = -4; k <= 4; k++) {
      const dx = (reach * k) / 4;
      const fx = l.x + dx;
      const fy = l.y - (len - Math.sqrt(len * len - dx * dx));
      const core = { x: fx - c, y: fy - c, w: 2 * c, h: 2 * c };
      if (fx - c < 0 || fx + c > s.width) bad(`lure "${l.id}" swings out of the room`);
      if (s.solids.some((q) => hits(q, core))) bad(`lure "${l.id}" swings into a solid`);
    }
  }
  for (const z of s.camera?.zones ?? []) {
    inside(`camera zone "${z.id}"`, z);
    if (z.bounds) inside(`camera zone "${z.id}"'s bounds`, z.bounds);
  }
}

/** The kit's things a route claim can name: triggers (they are where flags come from). */
export function kitNodes(s: { triggers?: Array<{ id: string }> | undefined }): string[] {
  return (s.triggers ?? []).map((t) => t.id);
}
