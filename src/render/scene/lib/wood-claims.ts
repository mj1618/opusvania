/**
 * Who draws what she can stand on in a wood room (canopy review r3 #2: the den's escape ledges were simulated and
 * never drawn). Pure: no Pixi, so the content test (tests/unit/wood-standables.test.ts) can walk every room.
 *
 * - `root` / `ground` solids: the mass painter (pf-mass.ts).
 * - `trunk` solids: a solid tree in `marks.trees` (or, without marks, the trunk itself).
 * - Other solids (`branch`, ...): a stretch in `marks.stretches` (or, without marks, the runs of abutting rects).
 * - One-way ledges: a root shelf (`shelfFor`): grown out of the wall beside it, or hung from the ceiling over it.
 */
import type { Room } from '../../../scene/room';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShelfPlan {
  x0: number;
  x1: number;
  y: number;
  /** The wall it grows out of (`w` = a face at its west end, `e` at its east end), or none. */
  wall: 'w' | 'e' | null;
  /** The ceiling it hangs from when it has no wall (y of the lowest underside over it), or null (open sky). */
  ceil: number | null;
}

const isMassTag = (tag: string): boolean => tag === 'root' || tag === 'ground';

/** How a one-way ledge is drawn: out of the wall it touches, or hanging from the ceiling over it. */
export function shelfFor(room: Room, o: { x: number; y: number; w: number }): ShelfPlan {
  const masses = room.solids.filter((s) => isMassTag(s.tag));
  const near = 40;
  const spans = (q: Rect) => q.y < o.y + 24 && q.y + q.h > o.y - 8;
  const west = masses.some((q) => spans(q) && Math.abs(q.x + q.w - o.x) <= near);
  const east = masses.some((q) => spans(q) && Math.abs(q.x - (o.x + o.w)) <= near);
  let ceil: number | null = null;
  // (A limb over it holds it as well as a roof.)
  for (const q of room.solids) {
    const b = q.y + q.h;
    if (b <= o.y - 32 && q.x < o.x + o.w && q.x + q.w > o.x) ceil = ceil === null ? b : Math.max(ceil, b);
  }
  return { x0: o.x, x1: o.x + o.w, y: o.y, wall: west ? 'w' : east ? 'e' : null, ceil };
}

/**
 * The standable things in a wood room that no painter claims (empty = all drawn). Each entry names the rect.
 * Mirrors the claims the wood's painters make (pf-branch.ts `planTrees` / `planStretches`, pf-mass.ts).
 */
export function unclaimedStandables(room: Room): string[] {
  if (room.art?.kit !== 'wood') return [];
  const out: string[] = [];
  const trees = room.marks?.trees ?? [];
  const marks = room.marks?.stretches ?? [];
  for (const s of room.solids) {
    const name = `${room.id} solid ${s.tag} (${s.x}, ${s.y}, ${s.w} x ${s.h})`;
    if (isMassTag(s.tag)) continue;
    if (s.tag === 'trunk') {
      if (!trees.length || underEnd(room, s)) continue;
      const t = trees.find(
        (q) => q.solid && q.x - q.w / 2 <= s.x + 1 && q.x + q.w / 2 >= s.x + s.w - 1 && q.bottom >= s.y + 1,
      );
      if (!t) out.push(name);
      continue;
    }
    if (!marks.length) continue;
    const claimed = marks.some(
      (m) =>
        s.x >= m.x0 &&
        s.x < m.x1 &&
        (m.y0 === undefined || s.y >= m.y0) &&
        (m.y1 === undefined || s.y < m.y1),
    );
    if (!claimed && !underEnd(room, s)) out.push(name);
  }
  for (const o of room.oneWays) {
    const sh = shelfFor(room, o);
    // A shelf is drawn when it has something to grow from or hang on (or stands in open sky as a limb's stub).
    if (!sh.wall && sh.ceil === null && room.marks?.backs?.length)
      out.push(`${room.id} one-way (${o.x}, ${o.y}, w ${o.w}) has no wall or ceiling to hang from`);
  }
  return out;
}

/**
 * A small solid tucked under a limb's end (the hatch's gap rise: the snapped end and the crown limb's root are
 * painted over it): within 220 px of a stretch's end, at most 220 px under its walk.
 */
function underEnd(room: Room, s: Rect): boolean {
  const tops = room.solids.filter((q) => q.tag === 'branch');
  return (room.marks?.stretches ?? []).some((m) =>
    [m.x0, m.x1].some((ex) => {
      const top = tops.find((q) => Math.abs(q.x - ex) < 2 || Math.abs(q.x + q.w - ex) < 2)?.y;
      return (
        top !== undefined &&
        s.w * s.h <= 160 * 160 &&
        Math.abs(s.x + s.w / 2 - ex) <= 220 &&
        s.y + s.h >= top &&
        s.y <= top + 220
      );
    }),
  );
}
