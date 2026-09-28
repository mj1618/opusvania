import { z } from 'zod';

/**
 * Placeholder rooms (Phase 0). Replaced by LDtk levels in Phase 1/3.
 * Legend: '#' solid, '.' empty, 'P' default spawn, 'a'-'z' named spawns.
 * A spawn marker means "stand on the floor of this tile, horizontally centred".
 */
const RoomDefSchema = z
  .object({
    id: z.string().min(1),
    rows: z.array(z.string().regex(/^[#.Pa-z]+$/, 'unknown tile character')).min(1),
  })
  .refine((r) => r.rows.every((row) => row.length === r.rows[0]?.length), 'rows must all be the same length')
  .refine((r) => r.rows.some((row) => row.includes('P')), 'room needs a P (default spawn)');

export type RoomDef = z.infer<typeof RoomDefSchema>;

export interface Spawn {
  /** Tile column/row of the marker. */
  tx: number;
  ty: number;
}

export interface Room {
  id: string;
  /** Size in tiles. */
  width: number;
  height: number;
  /** Row-major, 1 = solid. */
  solid: Uint8Array;
  spawns: Record<string, Spawn>;
}

const DEFS: RoomDef[] = [
  {
    id: 'gym',
    rows: [
      '####################################',
      '#..................................#',
      '#..................................#',
      '#..........................####....#',
      '#..................................#',
      '#..................................#',
      '#...................####...........#',
      '#..................................#',
      '#..................................#',
      '#...........####...............b...#',
      '#..............................###.#',
      '#..................................#',
      '#.....####.........................#',
      '#.....................###..........#',
      '#..................................#',
      '#..........####.....#..............#',
      '#...................#.......####...#',
      '#..P................#..............#',
      '####################################',
      '####################################',
    ],
  },
  {
    id: 'hall',
    rows: [
      '################################################',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#...............######.........................#',
      '#..............................................#',
      '#..........................#######.............#',
      '#..............................................#',
      '#..P..............................#.........a..#',
      '################################################',
      '################################################',
    ],
  },
];

export function buildRoom(def: RoomDef): Room {
  const parsed = RoomDefSchema.parse(def);
  const height = parsed.rows.length;
  const width = parsed.rows[0]?.length ?? 0;
  const solid = new Uint8Array(width * height);
  const spawns: Record<string, Spawn> = {};
  parsed.rows.forEach((row, ty) => {
    for (let tx = 0; tx < width; tx++) {
      const ch = row[tx];
      if (ch === '#') solid[ty * width + tx] = 1;
      else if (ch === 'P') spawns.default = { tx, ty };
      else if (ch && ch !== '.') spawns[ch] = { tx, ty };
    }
  });
  return { id: parsed.id, width, height, solid, spawns };
}

export const ROOMS: ReadonlyMap<string, Room> = new Map(DEFS.map((d) => [d.id, buildRoom(d)]));

export const DEFAULT_ROOM = 'gym';

export function getRoom(id: string): Room {
  const room = ROOMS.get(id);
  if (!room) throw new Error(`Unknown room "${id}". Known: ${[...ROOMS.keys()].join(', ')}`);
  return room;
}

export function isSolidTile(room: Room, tx: number, ty: number): boolean {
  // Outside the room counts as solid so nothing can leave it (transitions come in Phase 3).
  if (tx < 0 || ty < 0 || tx >= room.width || ty >= room.height) return true;
  return room.solid[ty * room.width + tx] === 1;
}
