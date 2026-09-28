/**
 * Neighbour peek (level-toolchain §6, north-star §3.3): the terrain, lamps and lights of the rooms
 * around the current one, drawn at their world positions, so a room never ends in black and an
 * edge exit looks like the space carries on. Each room's terrain is drawn once into a
 * GraphicsContext and cached, so crossing a seam only re-parents cached geometry (no re-tessellate).
 */
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { Room } from '../../sim/world/rooms';
import { hashString } from './color';
import { type Dressing, getDressing } from './dressing';
import type { Light } from './lighting';
import { drawTerrain } from './terrain';
import { type Neighbour, regionOf } from './worldspace';

export interface RoomView {
  id: string;
  tiles: GraphicsContext;
  glow: GraphicsContext;
  /** Room px. */
  lights: Light[];
  lamps: number;
  dressing: Dressing;
}

/** Dressing of a room; world rooms seed by region so a region's backdrop and lamps agree. */
export function dressingFor(room: Room): Dressing {
  return getDressing(room.id, hashString(regionOf(room.id) ?? room.id));
}

/** Cache of drawn rooms (terrain + glow contexts, lights). */
export class RoomViews {
  private readonly cache = new Map<string, RoomView>();

  get(room: Room): RoomView {
    const hit = this.cache.get(room.id);
    if (hit) {
      // Re-insert: the Map's order is the LRU order.
      this.cache.delete(room.id);
      this.cache.set(room.id, hit);
      return hit;
    }
    const d = dressingFor(room);
    const tiles = new GraphicsContext();
    const glow = new GraphicsContext();
    const g = new Graphics(tiles);
    const gl = new Graphics(glow);
    const out = drawTerrain(g, gl, room, d);
    // The contexts were passed in, so destroying the Graphics keeps them.
    g.destroy();
    gl.destroy();
    const v: RoomView = { id: room.id, tiles, glow, lights: out.lights, lamps: out.lamps, dressing: d };
    this.cache.set(room.id, v);
    return v;
  }

  /** Drops the least recently used views beyond `max`, never one in `keep`. */
  prune(keep: ReadonlySet<string>, max: number): void {
    for (const [id, v] of this.cache) {
      if (this.cache.size <= max) break;
      if (keep.has(id)) continue;
      v.tiles.destroy();
      v.glow.destroy();
      this.cache.delete(id);
    }
  }

  clear(): void {
    this.prune(new Set(), 0);
  }
}

/** The neighbours' terrain (playfield, lit) and glow (emissive), positioned in current-room px. */
export class PeekLayer {
  readonly terrain = new Container({ label: 'peek' });
  readonly glow = new Container({ label: 'peek-glow' });
  /** The apron: solid rock wherever no world room is (so the view past a seam is never sky). */
  readonly apron = new Graphics({ label: 'apron' });

  /** Rebuilds for these neighbours; returns their lights moved into current-room px. */
  build(views: RoomViews, near: readonly Neighbour[]): Light[] {
    for (const c of this.terrain.removeChildren()) c.destroy();
    for (const c of this.glow.removeChildren()) c.destroy();
    const lights: Light[] = [];
    for (const n of near) {
      const v = views.get(n.room);
      const t = new Graphics(v.tiles);
      const g = new Graphics(v.glow);
      t.position.set(n.dx, n.dy);
      g.position.set(n.dx, n.dy);
      this.terrain.addChild(t);
      this.glow.addChild(g);
      for (const l of v.lights) lights.push({ ...l, x: l.x + n.dx, y: l.y + n.dy });
    }
    return lights;
  }
}
