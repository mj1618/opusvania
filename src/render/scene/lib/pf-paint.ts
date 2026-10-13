/**
 * The two vector canvases the terrain is painted on before baking (see pf-bake.ts):
 * `albedo` (local colour) and `relief` (R height 0..1, G moss-ness, B bark-ness). Every shape goes
 * through here so the baker knows which tiles have anything in them.
 */
import { Graphics } from 'pixi.js';
import { BAKE } from './pf-bake';
import { bounds } from './pf-shape';

export interface ReliefOpts {
  /** 0..1: shade as moss (soft stipple, takes the key light strongly). */
  moss?: number;
  /** 0..1: shade as bark (vertical ridges). */
  bark?: number;
  /** Blend the height in softly instead of replacing what is under it. */
  alpha?: number;
}

export class Paint {
  readonly albedo = new Graphics();
  readonly relief = new Graphics();
  /** Per tile: the bounds of what was painted into it (x0, y0, x1, y1 in world px). */
  private readonly tiles = new Map<number, [number, number, number, number]>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** Colour only. */
  tint(pts: number[], color: number, alpha = 1): void {
    if (pts.length < 6) return;
    this.albedo.poly(pts).fill({ color, alpha });
    this.mark(pts);
  }

  /** Height only (grooves, bumps, material patches under existing colour). */
  bump(pts: number[], h: number, o: ReliefOpts = {}): void {
    if (pts.length < 6) return;
    const r = Math.round(Math.max(0, Math.min(1, h)) * 255);
    const g = Math.round((o.moss ?? 0) * 255);
    const b = Math.round((o.bark ?? 0) * 255);
    this.relief.poly(pts).fill({ color: (r << 16) | (g << 8) | b, alpha: o.alpha ?? 1 });
  }

  /** Colour and height together: a solid painted thing. */
  solid(pts: number[], color: number, h: number, o: ReliefOpts = {}, alpha = 1): void {
    this.tint(pts, color, alpha);
    this.bump(pts, h, o);
  }

  /** The world rect of tile (tx, ty) that has anything in it, or null if it is empty. */
  tileBounds(tx: number, ty: number): { x0: number; y0: number; x1: number; y1: number } | null {
    const b = this.tiles.get(ty * 4096 + tx);
    return b ? { x0: b[0], y0: b[1], x1: b[2], y1: b[3] } : null;
  }

  private mark(pts: number[]): void {
    const b = bounds(pts);
    const T = BAKE.tile;
    const tx0 = Math.max(0, Math.floor((b.x0 - 2) / T));
    const ty0 = Math.max(0, Math.floor((b.y0 - 2) / T));
    const tx1 = Math.min(Math.ceil(this.width / T) - 1, Math.floor((b.x1 + 2) / T));
    const ty1 = Math.min(Math.ceil(this.height / T) - 1, Math.floor((b.y1 + 2) / T));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const x0 = Math.max(tx * T, Math.floor(b.x0 - 2));
        const y0 = Math.max(ty * T, Math.floor(b.y0 - 2));
        const x1 = Math.min((tx + 1) * T, Math.ceil(b.x1 + 2));
        const y1 = Math.min((ty + 1) * T, Math.ceil(b.y1 + 2));
        const cur = this.tiles.get(ty * 4096 + tx);
        if (cur) {
          cur[0] = Math.min(cur[0], x0);
          cur[1] = Math.min(cur[1], y0);
          cur[2] = Math.max(cur[2], x1);
          cur[3] = Math.max(cur[3], y1);
        } else this.tiles.set(ty * 4096 + tx, [x0, y0, x1, y1]);
      }
    }
  }
}
