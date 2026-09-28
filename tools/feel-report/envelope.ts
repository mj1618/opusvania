import type { FeelMetrics } from './metrics';

/**
 * Celeste and Hollow Knight reference values, from movement-spec §3.4 (computed with our
 * integrator from each game's published constants; 1 Celeste tile = 8 px and 1 HK unit are both
 * mapped to a 64 px tile). The envelope is [min, max] of the two; values outside it by more than
 * FLAG_TOLERANCE of the bound are flagged. A sanity guard, not a definition of "good".
 */
export interface Reference {
  label: string;
  unit: string;
  celeste: number;
  hk: number;
  /** Spec's target for the `opus` preset, for context. */
  opus?: number;
}

export const FLAG_TOLERANCE = 0.15;

export const REFERENCE: Partial<Record<keyof FeelMetrics, Reference>> = {
  jumpHeightTiles: { label: 'Full jump height', unit: 'tiles', celeste: 3.35, hk: 5.6, opus: 4.31 },
  jumpHeightBodies: { label: 'Full jump height', unit: 'bodies', celeste: 2.4, hk: 4.4, opus: 3.45 },
  timeToApexS: { label: 'Time to apex', unit: 's', celeste: 0.35, hk: 0.52, opus: 0.43 },
  airTimeS: { label: 'Air time, flat full jump', unit: 's', celeste: 0.65, hk: 1.02, opus: 0.85 },
  tapFullRatio: { label: 'Tap / full height', unit: 'ratio', celeste: 0.25, hk: 0.23, opus: 0.28 },
  apexDwellFrames: { label: 'Apex dwell (within 10% of apex)', unit: 'f', celeste: 13, hk: 18, opus: 18 },
  fallRiseGravityRatio: {
    label: 'Effective fall/rise gravity',
    unit: 'ratio',
    celeste: 3.0,
    hk: 1.6,
    opus: 1.73,
  },
  runTilesPerS: { label: 'Run speed', unit: 'tiles/s', celeste: 11.25, hk: 8.3, opus: 9.0 },
  runFramesToFull: { label: 'Frames to full run speed', unit: 'f', celeste: 5, hk: 0, opus: 3 },
  flatJumpDistanceOverHeight: {
    label: 'Flat running jump distance / height',
    unit: 'ratio',
    celeste: 2.2,
    hk: 1.5,
    opus: 1.8,
  },
  dashTiles: { label: 'Dash distance', unit: 'tiles', celeste: 4.5, hk: 5, opus: 4.5 },
  dashS: { label: 'Dash duration', unit: 's', celeste: 0.15, hk: 0.25, opus: 0.2 },
  dashOverRun: { label: 'Dash speed / run speed', unit: '×', celeste: 2.7, hk: 2.4, opus: 2.5 },
  maxFallTilesPerS: { label: 'Max fall', unit: 'tiles/s', celeste: 20, hk: 20, opus: 20 },
  coyoteMs: { label: 'Coyote time', unit: 'ms', celeste: 100, hk: 40, opus: 100 },
  bufferMs: { label: 'Jump buffer', unit: 'ms', celeste: 80, hk: 40, opus: 100 },
};

export type Verdict = 'in' | 'near' | 'OUT' | 'n/a';

export interface Row {
  key: keyof FeelMetrics;
  ref?: Reference;
  value: number | null;
  verdict: Verdict;
  /** Signed distance outside the envelope as a fraction of the nearest bound (0 inside). */
  outBy: number;
}

export function judge(key: keyof FeelMetrics, value: number | null): Row {
  const ref = REFERENCE[key];
  if (!ref || value === null) return { key, ...(ref ? { ref } : {}), value, verdict: 'n/a', outBy: 0 };
  const lo = Math.min(ref.celeste, ref.hk);
  const hi = Math.max(ref.celeste, ref.hk);
  let outBy = 0;
  // Relative to the bound, but at least 1 unit's worth for bounds near 0 (frames to full speed).
  if (value < lo) outBy = -(lo - value) / Math.max(Math.abs(lo), 1);
  else if (value > hi) outBy = (value - hi) / Math.max(Math.abs(hi), 1);
  const verdict: Verdict = outBy === 0 ? 'in' : Math.abs(outBy) <= FLAG_TOLERANCE ? 'near' : 'OUT';
  return { key, ref, value, verdict, outBy };
}
