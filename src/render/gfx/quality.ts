/**
 * Quality tiers. `high` is the look; `med` halves the expensive buffers; `low` keeps the layers,
 * lighting and readability but drops the full-screen post pass, bloom and most particles, for weak
 * GPUs (PLAN §1 polish bar: 60 fps on a mid-range 2020 laptop).
 */
export interface QualitySettings {
  /** Internal render resolution (the canvas is CSS-scaled to the window either way). */
  renderScale: number;
  /** Lightmap resolution as a fraction of the 1920x1080 view. */
  lightRes: number;
  /** Blur the far parallax layers when baking them (one-off per room, cheap). */
  bakeBlur: boolean;
  /** Resolution of the baked far layers. */
  bakeRes: number;
  bloom: boolean;
  /** Glow brightness (alpha of the blurred copies). */
  bloomStrength: number;
  bloomQuality: number;
  /** Full-screen post pass (grade, vignette, grain, aberration, haze). */
  post: boolean;
  grain: boolean;
  aberration: boolean;
  /** Multiplier on the dressing's particle counts. */
  particles: number;
  /** Soft (layered) edges on foreground occluders. */
  softForeground: boolean;
}

export const QUALITY = {
  low: {
    renderScale: 2 / 3,
    lightRes: 0.25,
    bakeBlur: false,
    bakeRes: 0.35,
    bloom: false,
    bloomStrength: 0,
    bloomQuality: 1,
    post: false,
    grain: false,
    aberration: false,
    particles: 0.3,
    softForeground: false,
  },
  med: {
    renderScale: 1,
    lightRes: 0.35,
    bakeBlur: true,
    bakeRes: 0.5,
    bloom: true,
    bloomStrength: 0.8,
    bloomQuality: 2,
    post: true,
    grain: false,
    aberration: true,
    particles: 0.6,
    softForeground: true,
  },
  high: {
    renderScale: 1,
    lightRes: 0.5,
    bakeBlur: true,
    bakeRes: 0.5,
    bloom: true,
    bloomStrength: 1,
    bloomQuality: 3,
    post: true,
    grain: true,
    aberration: true,
    particles: 1,
    softForeground: true,
  },
} satisfies Record<string, QualitySettings>;

export type QualityName = keyof typeof QUALITY;
export const QUALITY_NAMES = Object.keys(QUALITY) as QualityName[];

export function isQualityName(s: string | null | undefined): s is QualityName {
  return !!s && (QUALITY_NAMES as string[]).includes(s);
}
