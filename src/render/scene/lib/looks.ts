/**
 * The five insides of the wood (canopy review r3 #4, r4 #4): which look a wood room with backs paints. Pure; its own
 * module so the room look (room-look.ts, the post grade) can read it without the painters.
 */
import type { Room } from '../../../scene/room';

export type Look = 'heartwood' | 'shaft' | 'nest' | 'canopy' | 'den';

/**
 * The Canopy's looks by region (review r4 #4: by rule, the pockets painted as an ants' nest and the five looks showed as
 * two families). A room's `art.look` wins over this.
 * - heartwood (amber grain, sap): the west's trunk branch, and the hub's giant;
 * - shaft (cold white, one moonbeam): the well and the Elder;
 * - nest (ochre earth, trails): the ants' three rooms, and the burrow (the carriers' nest since the Canopy v8);
 * - canopy (green-teal, leaf mats, gaps to the sky): the high band and the pockets off it, the way out and its ledge;
 * - den (umber earth, scrapes): the burrbacks' tunnel and den.
 */
const ROOM_LOOKS: Record<string, Look> = {
  'cn-hub': 'heartwood',
  'cn-trunk': 'heartwood',
  'cn-rot': 'heartwood',
  'cn-crawl': 'heartwood',
  'cn-webs': 'heartwood',
  'cn-well': 'shaft',
  'cn-elder': 'shaft',
  'cn-cellar': 'nest',
  'cn-galleries': 'nest',
  'cn-larder': 'nest',
  'cn-limbs': 'canopy',
  'cn-spire': 'canopy',
  'cn-bower': 'canopy',
  'cn-attic': 'canopy',
  'cn-sky': 'canopy',
  'cn-nook': 'canopy',
  'cn-hollowroot': 'canopy',
  'cn-ledge': 'canopy',
  'cn-out': 'canopy',
  'cn-tunnel': 'den',
  'cn-burrow': 'nest',
  'cn-den': 'den',
};

/**
 * A wood room's look: its `art.look`, else (a room the table above names) that, else from what is in it: ants make a
 * nest, the burrbacks' earth a den, a shaft twice as tall as wide a moonlit shaft, a deep mood the giant's heartwood,
 * anything else the canopy.
 */
export function lookOf(room: Room): Look {
  const set = (room.art as { look?: Look } | undefined)?.look;
  if (set) return set;
  const named = ROOM_LOOKS[room.id];
  if (named) return named;
  const kinds = new Set((room.enemies ?? []).map((e) => e.kind as string));
  if (kinds.has('carrier')) return 'nest';
  if (kinds.has('oldBurrback') || room.solids.some((s) => s.tag === 'ground')) return 'den';
  if (room.height >= room.width * 1.7) return 'shaft';
  if ((room.art?.moods ?? []).some((m) => m.mood === 'deep')) return 'heartwood';
  return 'canopy';
}

/**
 * The look whose grade the room takes (post/config.ts `WOOD_LOOK_GRADE`): only an enclosed room (its backs cover at
 * least half of it); a room open to the sky keeps the one cool night.
 */
export function gradeLookOf(room: Room): Look | null {
  const backs = (room.marks?.backs ?? []) as Array<{ w: number; h: number }>;
  if (!backs.length) return null;
  const a = backs.reduce((s, b) => s + b.w * b.h, 0);
  return a >= 0.5 * room.width * room.height ? lookOf(room) : null;
}
