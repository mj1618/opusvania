/**
 * The room's look, set once per page before the renderers are built (`setRoomLook`, called by
 * RenderStage). It is the seam between the shared painters and a room's `art` block
 * (content/rooms/<id>.json, src/scene/room.ts). One room per page: switching room reloads.
 *
 * What it moves today (memory/rooms.md):
 * - `kit`: `grove` keeps every hand-placed Grove landmark (waterfall, arch, log, hollow, mist stage,
 *   the terrain's landmarks); `wood` is the real game's wood: generic forest layers and its own
 *   playfield painter (pf-wood.ts). Layers ask `isGroveKit()`.
 * - The mood zones: every module's zone edges are the Grove's plus `zoneShift` (the cool / warm edge
 *   moves with the room's first non-cool mood stop, the warm / deep edge with its first deep one; a
 *   room that is cool all the way pushes both out of reach).
 * - The key light's entry x and colour (the moon, for the wood); its direction stays shared.
 * - The moon and the afterglow in the sky, the seed, and the background layers' vertical anchor.
 * Defaults (no room set: unit tests) are the Grove's, so nothing changes there.
 */
import type { Room } from '../../../scene/room';

/** The Grove's zone centres: the cool / warm and warm / deep edges (pf-shape, fx-zones, bg-bake agree on these). */
const GROVE_COOL_END = 1950;
const GROVE_DEEP_START = 3950;
/** A zone edge this far out is never reached. */
const OUT_OF_REACH = 100000;

/**
 * Lanternroot's layers (docs/design/levels/proto-1.md §8, memory/lanternroot-art.md): `night` is the wood
 * kit at canopy height under the moon; `hall` the amber lamp hall inside the fallen giant's trunk; `roots`
 * the black drowned roots under it; `cache` the firefly's workshop.
 */
export type LanternBand = 'night' | 'hall' | 'roots' | 'cache';

export interface RoomLook {
  roomId: string;
  kit: 'grove' | 'wood' | 'lanternroot';
  /** Lanternroot's layer (`art.band`); null in every other kit. */
  band: LanternBand | null;
  seed: number;
  /** Added to the Grove's [cool / warm] and [warm / deep] edges in every zone function and shader. */
  zoneShift: { left: number; right: number };
  /** Where the key light enters above the canopy (world px) and its colour. */
  keyEntryX: number;
  keyColor: number;
  /** The moon in the sky (view px), and the far warm afterglow; null in the Grove. */
  moon: { x: number; y: number; r: number } | null;
  afterglow: { x: number; y: number; strength: number } | null;
  /** The camera centre y the background layers are composed for (null = the lowest resting view: the Grove's rule). */
  anchorY: number | null;
}

/** The look in use. Read it; only `setRoomLook` writes it. */
export const LOOK: RoomLook = {
  roomId: 'test-grove',
  kit: 'grove',
  band: null,
  seed: 1,
  zoneShift: { left: 0, right: 0 },
  keyEntryX: 3400,
  keyColor: 0xffd9a0,
  moon: null,
  afterglow: null,
  anchorY: null,
};

/** The wood kit's moon: cool silver-blue (docs/design/scenes/01-look-target.md, `#dce8f6`). */
const MOON_KEY = 0xcfdcf0;

export function isGroveKit(): boolean {
  return LOOK.kit === 'grove';
}

/** A Lanternroot room (proto-1): its own playfield painter, game pieces and, inside the giant, backdrop. */
export function isLantern(): boolean {
  return LOOK.kit === 'lanternroot';
}

/** A Lanternroot room inside the giant or under it (no sky): the hall, the roots, the cache. */
export function isInterior(): boolean {
  return LOOK.kit === 'lanternroot' && LOOK.band !== 'night';
}

/** The lamp hall's key: warm lamplight. The roots': a thin cold moon through the cracks. */
const HALL_KEY = 0xffc078;
const ROOTS_KEY = 0x8fb0d8;

/**
 * Sets the look from the room's `art` block. Call before any renderer is built: shaders are
 * compiled with the zone edges and the key light of the moment they are built.
 */
export function setRoomLook(room: Room): void {
  const art = room.art;
  LOOK.roomId = room.id;
  // (Read loosely: the room schema learns `lanternroot` / `band` with the level's rooms.)
  const loose = art as { kit?: string; band?: string } | undefined;
  LOOK.kit = (loose?.kit as RoomLook['kit'] | undefined) ?? 'grove';
  const band = loose?.band;
  LOOK.band =
    LOOK.kit !== 'lanternroot'
      ? null
      : band === 'hall' || band === 'roots' || band === 'cache'
        ? band
        : 'night';
  LOOK.seed = art?.seed ?? 1;
  if (LOOK.kit === 'grove') {
    LOOK.zoneShift = { left: 0, right: 0 };
    LOOK.keyEntryX = 3400;
    LOOK.keyColor = 0xffd9a0;
    LOOK.moon = null;
    LOOK.afterglow = null;
    LOOK.anchorY = null;
    return;
  }
  const moods = [...(art?.moods ?? [{ x: 0, mood: 'cool' as const }])].sort((a, b) => a.x - b.x);
  const firstWarm = moods.find((m) => m.mood !== 'cool');
  const firstDeep = moods.find((m) => m.mood === 'deep');
  LOOK.zoneShift = {
    left: firstWarm ? firstWarm.x - GROVE_COOL_END : OUT_OF_REACH,
    right: firstDeep ? firstDeep.x - GROVE_DEEP_START : OUT_OF_REACH,
  };
  const moon = art?.moon ?? { x: 1420, y: 190, r: 88 };
  LOOK.moon = moon;
  LOOK.afterglow = art?.afterglow ?? null;
  // The moon is screen-fixed; its light enters the room on the moon's side.
  LOOK.keyEntryX = Math.round((room.width * moon.x) / 1920);
  LOOK.keyColor = MOON_KEY;
  LOOK.anchorY = art?.anchorY ?? null;
  if (LOOK.band === 'hall' || LOOK.band === 'cache') {
    // Inside the trunk: no sky. The key the bakes light with is the lamps' amber, from the upper right.
    LOOK.moon = null;
    LOOK.afterglow = null;
    LOOK.keyColor = HALL_KEY;
  } else if (LOOK.band === 'roots') {
    LOOK.moon = null;
    LOOK.afterglow = null;
    LOOK.keyColor = ROOTS_KEY;
  }
}
