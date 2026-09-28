/**
 * Signature-mechanic palette (L3 brief §5). Sound colours are the one thing the player must read
 * at a glance, so they are fixed tokens, pre-checked against the E1 readability rules: hue gap
 * between brown, pink and violet >= 60°, and every colour >= 3:1 luminance contrast vs the bg.
 * `paletteChecks()` recomputes those numbers (the e2e E1 test measures the rendered pixels).
 * Pure TS (no Pixi) so tests and tools can import it.
 */
import type { Colour } from '../sim/events';

export const PALETTE = {
  brown: 0xe8a23a,
  pink: 0xff4fa3,
  violet: 0x9d84ff,
  /** White static: desaturated (< 10%), so it reads as "sound-like but not a colour". */
  white: 0xd8dce6,
  /** Reference background and solid (brief §5 contrast table). */
  bg: 0x12141a,
  solid: 0x3a4150,
  /** Enemy bodies are neutral; their voices are the outline colours. */
  enemyBody: 0x9aa3b5,
  enemyDark: 0x2a2f3a,
  /** Furious eye, catch flash, hit flash. */
  furious: 0xff3b3b,
  gold: 0xffd84a,
  flash: 0xffffff,
  /** Repossessed enemies desaturate to this outline. */
  repossessed: 0x6b7280,
  plateBar: 0xc9b27a,
  plateSlot: 0x0d1018,
  lampOff: 0x3a3f4b,
  lampOn: 0xffd84a,
  gate: 0x8a93a8,
  hudPanel: 0x0b0d12,
  hudInk: 0xd6dbe6,
  hudDim: 0x5a6378,
  chin: 0xe8e4d8,
} as const;

/** The hex for a sound colour. */
export function colourHex(c: Colour | string): number {
  switch (c) {
    case 'brown':
      return PALETTE.brown;
    case 'pink':
      return PALETTE.pink;
    case 'violet':
      return PALETTE.violet;
    default:
      return PALETTE.white;
  }
}

/**
 * Per-colour vibration (brief §5): amplitude in px and frequency in Hz, driven by the sim frame.
 * Colour is never the only cue: each colour also has its own hum-wave shape and levied shape.
 */
export const VIBRATION: Record<Colour, { amp: number; hz: number }> = {
  brown: { amp: 2, hz: 5 },
  pink: { amp: 1.5, hz: 9 },
  violet: { amp: 1, hz: 15 },
  white: { amp: 0, hz: 0 },
};

/** Draw constants for the signature renderer (render-only numbers). */
export const SIG = {
  hummingFillAlpha: 0.35,
  hummingOutline: 4,
  /** Ghost: fill <= 40% of humming (E1), a thin dashed outline, no vibration. */
  ghostFillAlpha: 0.06,
  ghostOutline: 2,
  ghostOutlineAlpha: 0.55,
  dashOn: 10,
  dashOff: 6,
  /** pendingSolid blink rate. */
  pendingHz: 4,
  /** Hum waves inside a humming source: spacing, amplitude, alpha, width. */
  waveSpacing: 28,
  waveAmp: 5,
  waveAlpha: 0.5,
  waveWidth: 2,
  /** White static speckles per 1000 px² and their size. */
  speckleDensity: 1.1,
  speckleSize: 4,
  refusedFlashFrames: 3,
  slabFillAlpha: 0.85,
  slabBorder: 6,
  springSquashH: 7,
  /** Enemy telegraph: outline width at the start and end of the wind-up; max body tint. */
  teleOutline0: 4,
  teleOutline1: 11,
  teleTint: 0.7,
  enemyOutlinePad: 5,
  tetherAlpha: 0.4,
  countRingR: 20,
  countTicks: 10,
  gateDashedFrames: 10,
  plateDrop: 8,
  /** Hit flash frames by class (combat-spec §2). */
  hitFlash: { light: 3, medium: 4, heavy: 6, catch: 6, repossess: 6, seizeTake: 0, hurt: 0 } as Record<
    string,
    number
  >,
  catchGoldFrames: 6,
  hitstopShakePx: 3,
  ribbonFrames: 12,
  needleFrames: 8,
  /** Heavy Kid silhouette (render only): 72 tall, wider stance. */
  heavyScale: [1.3, 72 / 80] as const,
  middleScale: [1.12, 76 / 80] as const,
} as const;

// --- colour maths (used by paletteChecks and the E1 test) ---

export function rgbOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** WCAG relative luminance of an sRGB colour (0-255 channels). */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(...a);
  const lb = luminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** HSV hue in degrees (0-360). */
export function hueDeg(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** The E1 palette rules computed from the tokens (brief §5 table). */
export function paletteChecks(): { hueGapMin: number; contrastMin: number } {
  const cols = [PALETTE.brown, PALETTE.pink, PALETTE.violet].map(rgbOf);
  const hues = cols.map((c) => hueDeg(...c));
  let gap = 360;
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++) gap = Math.min(gap, hueGap(hues[i] ?? 0, hues[j] ?? 0));
  const bg = rgbOf(PALETTE.bg);
  const contrastMin = Math.min(...[...cols, rgbOf(PALETTE.white)].map((c) => contrastRatio(c, bg)));
  return { hueGapMin: gap, contrastMin };
}
