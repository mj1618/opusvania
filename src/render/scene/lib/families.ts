/**
 * Families for the wood's furniture (canopy review r6 #8: "the stalked one-way reads as a birdbath, 4 in the hub,
 * 3 in the trunk ...; the thorn tray is identical in 20 rooms"). Pure: the painters (pf-mass.ts `paintShelves`,
 * lantern/kit.ts `bramble`) and the test (tests/unit/wood-props.test.ts) read the same assignment.
 *
 * - A one-way's family is chosen by its mount (wood-claims.ts `shelfFor`): grown from a wall beside it (shelf fungi),
 *   or a limb's stub), from a mass within reach (a root out of it), from the floor (never a free-standing stalk: a
 *   leaning snag, a fallen log, a burl or an old stump it sits on, a root arching out of the floor and back, a heap of roots), or
 *   hung from a roof or limb over it.
 * - A thorn bed's family is its mat, its barbs and what grows off it: 3 x 3 x 2.
 * Rooms in id order; each piece takes the family of its kind used in the fewest rooms so far and not yet in its room.
 */
import { ROOMS } from '../../../scene/index';
import type { Room } from '../../../scene/room';
import { gradeLookOf } from './looks';
import { withSealedMass } from './sealed';
import { shelfFor } from './wood-claims';

export type ShelfMount = 'wall' | 'near' | 'floor' | 'hung';

export const SHELF_FAMILIES: Record<ShelfMount, readonly string[]> = {
  wall: ['bracket', 'tiers', 'stub'],
  near: ['elbow', 'knuckle', 'braid', 'fork'],
  floor: ['snag', 'fallen', 'burl', 'arch', 'stump', 'heap', 'hump'],
  hung: ['clump', 'beard'],
};

/**
 * `hump` is never picked by the spread: it is the fight furniture of an earth room's arena (a floor-mounted ledge
 * inside a `fit` camera zone of a den or nest room, canopy r9b: the den's warning, whose snags read as stools): a root
 * knuckling up out of the floor with the ledge on its crown.
 */
function arenaKnuckle(room: Room, o: { x: number; y: number; w: number }): boolean {
  const look = gradeLookOf(room);
  if (look !== 'den' && look !== 'nest') return false;
  const zones = ((
    room.camera as {
      zones?: Array<{ x: number; y: number; w: number; h: number; fit?: boolean; until?: string }>;
    }
  )?.zones ?? []) as Array<{ x: number; y: number; w: number; h: number; fit?: boolean; until?: string }>;
  // An arena's zone fits the fight or holds the frame until the wave clears.
  return zones.some(
    (z) => (z.fit || z.until) && o.x >= z.x && o.x + o.w <= z.x + z.w && o.y >= z.y && o.y <= z.y + z.h,
  );
}

/** The tallest drop under a ledge an old stump may carry (px). */
export const STUMP_MAX_H = 320;

export const THORN_MATS = ['mat', 'coil', 'thicket'] as const;
export const THORN_BARBS = ['spike', 'hook', 'pair'] as const;
/** What grows off the bed besides barbs: canes creeping up the wall and over the lips, or a tuft of dead stems. */
export const THORN_EXTRAS = ['creep', 'stems'] as const;
export const THORN_FAMILIES: readonly string[] = THORN_MATS.flatMap((m) =>
  THORN_BARBS.flatMap((b) => THORN_EXTRAS.map((e) => `${m}-${b}-${e}`)),
);

/** How a one-way is held (the mount decides the families it may take). */
export function shelfMount(room: Room, o: { x: number; y: number; w: number }): ShelfMount {
  const sh = shelfFor(room, o);
  return sh.wall ? 'wall' : sh.near ? 'near' : sh.floor !== null ? 'floor' : 'hung';
}

function woodRooms(): Room[] {
  return Object.values(ROOMS)
    .filter((q) => q.art?.kit === 'wood')
    .map((q) => withSealedMass(q))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The family used in the fewest rooms so far among those not yet in this room (all of them once each is). */
function pick(list: readonly string[], used: Set<string>, count: Map<string, number>): string {
  const fresh = list.filter((f) => !used.has(f));
  const pool = fresh.length ? fresh : list;
  return pool.reduce((a, b) => ((count.get(b) ?? 0) < (count.get(a) ?? 0) ? b : a));
}

let SHELVES: Map<string, string> | null = null;
let THORNS: Map<string, string> | null = null;

export const shelfKey = (roomId: string, i: number) => `${roomId}#${i}`;

/** Every wood one-way's family, keyed `room#index`. */
export function shelfFamilies(): Map<string, string> {
  if (SHELVES) return SHELVES;
  const out = new Map<string, string>();
  const count = new Map<string, number>();
  for (const room of woodRooms()) {
    const used = new Set<string>();
    room.oneWays.forEach((o, i) => {
      const mount = shelfMount(room, o);
      // (An old stump under a high ledge is a column: a stump only over a low drop.)
      const fl = shelfFor(room, o).floor;
      const list = SHELF_FAMILIES[mount].filter(
        (f) => f !== 'hump' && (f !== 'stump' || (fl !== null && fl - o.y <= STUMP_MAX_H)),
      );
      if (mount === 'floor' && arenaKnuckle(room, o)) {
        out.set(shelfKey(room.id, i), 'hump');
        return;
      }
      const f = pick(list, used, count);
      if (!used.has(f)) count.set(f, (count.get(f) ?? 0) + 1);
      used.add(f);
      out.set(shelfKey(room.id, i), f);
    });
  }
  SHELVES = out;
  return out;
}

/** Every wood thorn strip's family, keyed by its id. */
export function thornFamilies(): Map<string, string> {
  if (THORNS) return THORNS;
  const out = new Map<string, string>();
  const count = new Map<string, number>();
  for (const room of woodRooms()) {
    const used = new Set<string>();
    for (const t of (room as { thorns?: Array<{ id: string }> }).thorns ?? []) {
      const f = pick(THORN_FAMILIES, used, count);
      if (!used.has(f)) count.set(f, (count.get(f) ?? 0) + 1);
      used.add(f);
      out.set(`${room.id}:${t.id}`, f);
    }
  }
  THORNS = out;
  return out;
}
