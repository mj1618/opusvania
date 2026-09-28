/**
 * Hitbox / hurtbox helpers (combat-spec §1.2, §3.1), shared by Kid's moves, enemies and levied
 * objects. Boxes are [x, y, w, h] relative to an owner's top-left when facing right; facing left
 * mirrors them as x' = ownerW - x - w. Every attack instance keeps a hit list so a target is hit
 * at most once per instance.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BoxDef = readonly [number, number, number, number];

/** World rect of a box on an owner at (ox, oy) with width ow, facing +1 / -1. */
export function boxAt(ox: number, oy: number, ow: number, facing: number, b: BoxDef): Rect {
  const [bx, by, bw, bh] = b;
  return { x: ox + (facing > 0 ? bx : ow - bx - bw), y: oy + by, w: bw, h: bh };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function centre(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Squared distance between rect centres (tie-breaks: nearest centre). */
export function centreDist2(a: Rect, b: Rect): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  return dx * dx + dy * dy;
}

export function hitListAdd(list: number[], id: number): boolean {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

/** Kid's hurtbox (smaller than the 40x80 collision box, combat-spec §1.2). */
export const KID_HURTBOX: BoxDef = [6, 8, 28, 68];
