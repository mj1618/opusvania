/**
 * Camera zones (memory/level-kit.md): rects in a room's `camera.zones` (src/scene/room.ts
 * `CameraZone`). While her body centre is inside one, the follow camera (camera/index.ts) eases its
 * zoom to the zone's and keeps the view inside the zone's bounds; leaving, both ease back. Pure TS,
 * stepped with the camera once per sim frame.
 *
 * Real view size (memory/view-size.md): `fit` picks the zoom that puts the whole frame inside the 16:9
 * safe area, which every window shows; a wider or taller window then sees more around it, and the
 * bounds clamp uses the real view, so a view bigger than the bounds centres on them.
 */
import type { CameraZone, Room } from '../../scene/room';
import type { Scene } from '../../sim/scene';
import { SAFE_H, SAFE_W } from '../contract';

/** The zones of a room (none for a plain scene). */
export function zonesOf(scene: Scene): readonly CameraZone[] {
  return (scene as Room).camera?.zones ?? [];
}

/** The zone a point is in (the first that holds it), or null. */
export function zoneAt(
  zones: readonly CameraZone[],
  x: number,
  y: number,
  flags: readonly string[] = [],
): CameraZone | null {
  for (const z of zones) {
    if (z.until && flags.includes(z.until)) continue;
    // (Only once its story flag is saved: the crown's `crown-sit` after the kin sits. Review r13 #4: the camera never
    // moved, as this was not read.)
    if (z.after && !flags.includes(z.after)) continue;
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z;
  }
  return null;
}

/** The rect a zone keeps the view inside: `bounds`, or with `lock` the zone itself; null = the scene's. */
export function zoneBounds(z: CameraZone): { x: number; y: number; w: number; h: number } | null {
  if (z.bounds) return z.bounds;
  if (z.lock) return { x: z.x, y: z.y, w: z.w, h: z.h };
  return null;
}

/** The zoom a zone asks for: `fit` = its frame (bounds, else the zone) inside the safe area; else `zoom` (1). */
export function zoneZoom(z: CameraZone): number {
  if (z.fit) {
    const f = zoneBounds(z) ?? z;
    return Math.max(0.5, Math.min(2, SAFE_W / f.w, SAFE_H / f.h));
  }
  return z.zoom ?? 1;
}

/** A zone's lean (the Canopy r14): the view's centre goes `k` of the way from her to (`x`, `y`). Read loosely. */
export function zoneLean(z: CameraZone | null): { x: number; y: number; k: number } | null {
  const l = (z as { lean?: { x: number; y: number; k: number } } | null)?.lean;
  return l && l.k > 0 ? l : null;
}

/** Frames a zone's zoom eases over: the camera's own, or the zone's slide if slower (a staged push-in: 2 s). */
export function zoneZoomFrames(z: CameraZone | null, own: number, last: number | undefined): number {
  return Math.max(own, z ? (z.frames ?? 0) : (last ?? 0));
}
