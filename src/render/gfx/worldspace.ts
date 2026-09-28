/**
 * World-space facts the renderer needs to make rooms feel like one place (north-star §3.3):
 * where each LDtk room sits in the world, which rooms are near enough to peek into, the region a
 * room's backdrop is generated over, and every beacon landmark. Pure (no Pixi); reads the compiled
 * world layout only. Rooms outside the LDtk world (gyms, hub, rings) are islands at the origin.
 */
import { tuning } from '../../sim/tuning';
import { WORLD_LAYOUT } from '../../sim/world/content';
import { getRoom, type LandmarkDef, ROOMS, type Room } from '../../sim/world/rooms';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TS = tuning.world.tileSize;

export function isWorldRoom(id: string): boolean {
  return id in WORLD_LAYOUT;
}

/** World px of the room's tile (0, 0) (padding shifts it up/left). Non-world rooms: (0, 0). */
export function roomOrigin(room: Room): { x: number; y: number } {
  const l = WORLD_LAYOUT[room.id];
  if (!l) return { x: 0, y: 0 };
  return { x: (l.x - room.padX) * TS, y: (l.y - room.padY) * TS };
}

/** The room's rect in world px. */
export function roomRect(room: Room): Rect {
  const o = roomOrigin(room);
  return { x: o.x, y: o.y, w: room.width * TS, h: room.height * TS };
}

/** A world room's region: its id prefix (`tally-cross` -> `tally`). Non-world rooms: null. */
export function regionOf(id: string): string | null {
  if (!isWorldRoom(id)) return null;
  const i = id.indexOf('-');
  return i < 0 ? id : id.slice(0, i);
}

const regionCache = new Map<string, Rect>();

/** World px bounding box of every room in a region. */
export function regionBox(region: string): Rect {
  const hit = regionCache.get(region);
  if (hit) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of Object.keys(WORLD_LAYOUT)) {
    if (regionOf(id) !== region) continue;
    const r = roomRect(getRoom(id));
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  regionCache.set(region, box);
  return box;
}

/** The box a room's backdrop is generated over: its region, or the room itself (non-world). */
export function backdropBox(room: Room): Rect {
  const region = regionOf(room.id);
  return region ? regionBox(region) : { x: 0, y: 0, w: room.width * TS, h: room.height * TS };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface Neighbour {
  room: Room;
  /** Its origin minus the current room's origin, px. */
  dx: number;
  dy: number;
}

/** World rooms whose rect comes within `margin` px of this room (not the room itself). */
export function neighbours(room: Room, margin: { x: number; y: number }): Neighbour[] {
  if (!isWorldRoom(room.id)) return [];
  const r = roomRect(room);
  const grown = { x: r.x - margin.x, y: r.y - margin.y, w: r.w + 2 * margin.x, h: r.h + 2 * margin.y };
  const out: Neighbour[] = [];
  for (const id of Object.keys(WORLD_LAYOUT)) {
    if (id === room.id) continue;
    const n = getRoom(id);
    const nr = roomRect(n);
    if (overlaps(grown, nr)) out.push({ room: n, dx: nr.x - r.x, dy: nr.y - r.y });
  }
  return out;
}

/** Rects (px, relative to this room) inside `area` (also relative) that no world room covers. */
export function voidRects(room: Room, area: Rect): Rect[] {
  const o = roomOrigin(room);
  const rooms = Object.keys(WORLD_LAYOUT).map((id) => roomRect(getRoom(id)));
  const out: Rect[] = [];
  const tx0 = Math.floor(area.x / TS);
  const ty0 = Math.floor(area.y / TS);
  const tx1 = Math.ceil((area.x + area.w) / TS);
  const ty1 = Math.ceil((area.y + area.h) / TS);
  const covered = (tx: number, ty: number) => {
    const wx = o.x + tx * TS + TS / 2;
    const wy = o.y + ty * TS + TS / 2;
    return rooms.some((r) => wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h);
  };
  for (let ty = ty0; ty < ty1; ty++) {
    let run = -1;
    for (let tx = tx0; tx <= tx1; tx++) {
      const empty = tx < tx1 && !covered(tx, ty);
      if (empty && run < 0) run = tx;
      else if (!empty && run >= 0) {
        const last = out[out.length - 1];
        // Merge with the row above when the run matches (keeps the rect count small).
        if (last && last.x === run * TS && last.w === (tx - run) * TS && last.y + last.h === ty * TS)
          last.h += TS;
        else out.push({ x: run * TS, y: ty * TS, w: (tx - run) * TS, h: TS });
        run = -1;
      }
    }
  }
  return out;
}

export interface Beacon {
  name: string;
  kind: NonNullable<LandmarkDef['beacon']>;
  /** Footprint, world px. */
  rect: Rect;
  depth: number;
  roomId: string;
}

let beaconCache: Beacon[] | null = null;

/** Default parallax factor of a beacon's backdrop copy (the far2 layer's). */
export const BEACON_DEPTH = 0.42;

/** Every beacon landmark in the world, world px. */
export function allBeacons(): Beacon[] {
  if (beaconCache) return beaconCache;
  const out: Beacon[] = [];
  for (const room of ROOMS.values()) {
    if (!isWorldRoom(room.id)) continue;
    const o = roomOrigin(room);
    for (const l of room.file.landmarks) {
      if (!l.beacon) continue;
      const [x, y, w, h] = l.rect;
      out.push({
        name: l.name,
        kind: l.beacon,
        rect: { x: o.x + (x + room.padX) * TS, y: o.y + (y + room.padY) * TS, w: w * TS, h: h * TS },
        depth: l.depth ?? BEACON_DEPTH,
        roomId: room.id,
      });
    }
  }
  beaconCache = out;
  return out;
}
