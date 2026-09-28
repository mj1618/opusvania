/** Camera-relative stereo pan and distance attenuation (pure). Units are world pixels. */

export interface SpatialParams {
  /** Horizontal offset from the listener at which pan reaches ±panMax. */
  panWidthPx: number;
  /** Maximum absolute pan (keep < 1 so nothing is fully one-sided). */
  panMax: number;
  /** Within this distance a source plays at full volume. */
  refDistPx: number;
  /** Inverse-distance rolloff factor beyond refDist. */
  rolloff: number;
  /** Gain fades linearly to 0 between fadeStartPx and maxDistPx. */
  fadeStartPx: number;
  maxDistPx: number;
}

export interface Point {
  x: number;
  y: number;
}

export function spatialPan(src: Point, listener: Point, p: SpatialParams): number {
  const raw = (src.x - listener.x) / p.panWidthPx;
  return Math.max(-1, Math.min(1, raw)) * p.panMax;
}

export function spatialGain(src: Point, listener: Point, p: SpatialParams): number {
  const d = Math.hypot(src.x - listener.x, src.y - listener.y);
  if (d >= p.maxDistPx) return 0;
  let g = d <= p.refDistPx ? 1 : p.refDistPx / (p.refDistPx + p.rolloff * (d - p.refDistPx));
  if (d > p.fadeStartPx) g *= 1 - (d - p.fadeStartPx) / (p.maxDistPx - p.fadeStartPx);
  return g;
}

export function spatialize(src: Point, listener: Point, p: SpatialParams): { pan: number; gain: number } {
  return { pan: spatialPan(src, listener, p), gain: spatialGain(src, listener, p) };
}
