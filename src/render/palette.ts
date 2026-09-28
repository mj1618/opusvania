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
  // --- L4 combat feedback ---
  /** Kid's boxing gloves (red leather, a pale cuff) and her sleeve. */
  glove: 0xd9443c,
  gloveDark: 0x7a1f1c,
  gloveCuff: 0xf2ead8,
  sleeve: 0x8d96aa,
  /** The Seize hand (pale, reads on any district). */
  seizeHand: 0xf6f0de,
  /** Ledger red ink: REPOSSESSED / SOLD / CLEARED stamps. */
  stampRed: 0xe0322f,
  stampPaper: 0xf3e6c8,
  /** Keycap prompt glyphs. */
  keyFace: 0xe9e4d6,
  keyLip: 0x6d6a62,
  keyEdge: 0x2a2d36,
  keyInk: 0x1b1d24,
  /** Poundage coins. */
  coin: 0xf0c64a,
  coinDark: 0x8a6414,
  /** Lien pips: red wax seal. */
  wax: 0xb3202a,
  waxDark: 0x5e0e14,
  /** The Corner (stool and bucket). */
  wood: 0x8a5a32,
  woodDark: 0x4e3019,
  bucket: 0x9aa4b4,
  bucketRim: 0xc9cfd9,
  woodLight: 0xb07a48,
  ropeRed: 0xd9443c,
  ropeWhite: 0xe9e4d6,
  ropeBlue: 0x3f6fd9,
  /** Boss bar. */
  bossBar: 0xd9443c,
  bossBarBack: 0x2a1416,
  /** Poof / KO dust. */
  dust: 0xc9c2b0,
  /** Gull beak, clerk eyeshade. */
  beak: 0xe0b04a,
  eyeshade: 0x3f8f5a,
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
  /**
   * Atmosphere hooks (src/render/gfx): humming sources and levied objects glow (emissive layer,
   * bloomed) and cast a small light in their noise colour; ghosts, pending and white static don't.
   * Enemies glow faintly while armed and strongly as a telegraph winds up.
   */
  glowOutlineAlpha: 0.75,
  glowFillAlpha: 0.14,
  glowVoiceAlpha: 0.3,
  glowTeleAlpha: 0.9,
  lightIntensity: 0.55,
  /** Light radius = this + half the source's larger side (px). */
  lightRadius: 150,
  enemyLightIntensity: 0.3,
  enemyLightRadius: 150,
  /** Heavy Kid silhouette (render only): 72 tall, wider stance. */
  heavyScale: [1.3, 72 / 80] as const,
  middleScale: [1.12, 76 / 80] as const,
} as const;

/** Draw constants for the L4 combat feedback layer (render-only numbers). */
export const CBT = {
  /** Glove size [w, h] per strike, and the Counter's gold glow. */
  jabGlove: [28, 24] as const,
  crossGlove: [36, 30] as const,
  hookGlove: [32, 28] as const,
  armWidth: 9,
  /** Seize reach box outline (dashed) alpha while the hand is out. */
  reachAlpha: 0.35,
  handSize: 32,
  whiffFrames: 10,
  takeFrames: 8,
  guardFrames: 10,
  refusedFrames: 8,
  slipFlashFrames: 6,
  /** Enemy Count ring: radius, tick size, number size, pulse frames. */
  countR: 38,
  countNum: 30,
  countPulseFrames: 8,
  countHandSize: 30,
  /** Kid's Count ring (over her while she's down). */
  kidCountR: 54,
  kidCountNum: 40,
  /** Stamps: frames of the slam (scale overshoot), start scale. */
  stampSlamFrames: 10,
  stampStartScale: 2.4,
  clearFrames: 70,
  koFrames: 36,
  hazardFlashFrames: 8,
  shimmerFrames: 18,
  riseBurstFrames: 22,
  countedOutFrames: 40,
  /** Prompts: fade speed per frame, bob px, key size px. */
  promptFade: 0.08,
  promptBob: 5,
  keySize: 46,
  promptNearTiles: 6,
  /** Flinch lean (radians) and squash while knocked back. */
  flinchLean: 0.16,
  kbLeanPer: 0.012,
  coinFrames: 28,
  coinsPerPayout: 6,
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
