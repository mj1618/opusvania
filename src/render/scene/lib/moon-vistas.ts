/**
 * Where the moon's disc shows (the Canopy r10, review r9 #8: the same full disc was in about 16 of 24 stops; "it has
 * stopped being an event and become a sticker"). The real moon is the one constant in the sky (memory/story.md), and
 * the art direction shows it at vistas: in a Canopy room it shows only while the camera is in one of that room's
 * boxes below, fading over `fade` px past a box's edge. Elsewhere in the Canopy the canopy covers it (the far layers
 * close over its window) and moonlight is the cool key and the shafts. Rooms outside the Canopy are unchanged.
 *
 * Pure (camera centre in world px): the sky shader and the far layers' moon window read it.
 */

/** A box of camera centres (world px, room coordinates) and how far past its edges the disc fades out. */
export interface MoonVista {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  fade: number;
}

/**
 * The Canopy's moon vistas:
 *  - the hatch: the opening (the cocoons under the moon, the swarm streaming past it), gone before the crown limb;
 *  - the hub's clearing: the one open sky on the hub's floor, where the kin keeps its light;
 *  - the crown: the top of the tree, the area's high point;
 *  - the way out: over the valley of lamps, the mountain under the moon.
 */
export const MOON_VISTAS: Readonly<Record<string, readonly MoonVista[]>> = {
  'cn-hatch': [{ x0: 0, y0: -2000, x1: 1250, y1: 4000, fade: 300 }],
  'cn-hub': [{ x0: 2600, y0: 0, x1: 3400, y1: 2304, fade: 350 }],
  'cn-crown': [{ x0: -2000, y0: -2000, x1: 5000, y1: 5000, fade: 1 }],
  // (The Canopy r11: the den's roof opens onto the way out's clifftop, 0-600 x 128-384, the area's last beat: the moon
  // is there from her first step out.)
  'cn-out': [
    { x0: 1792, y0: -2000, x1: 6000, y1: 1700, fade: 450 },
    { x0: -2000, y0: -2000, x1: 700, y1: 520, fade: 300 },
  ],
};

/** 0..1: how much of the moon's disc shows with the camera at (x, y) in `roomId`. */
export function moonShown(roomId: string, x: number, y: number): number {
  const list = MOON_VISTAS[roomId];
  if (!list) return roomId.startsWith('cn-') ? 0 : 1;
  let best = 0;
  for (const v of list) {
    const dx = Math.max(v.x0 - x, 0, x - v.x1);
    const dy = Math.max(v.y0 - y, 0, y - v.y1);
    const d = Math.hypot(dx, dy);
    const t = Math.max(0, 1 - d / Math.max(1, v.fade));
    best = Math.max(best, t * t * (3 - 2 * t));
  }
  return best;
}
