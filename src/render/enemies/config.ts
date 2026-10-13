/**
 * Look and motion knobs of the burrback (live through `window.__enemies.cfg`). Lengths are world px
 * in the creature's own frame: x along its length (forward = the way it faces), y up from the
 * ground it stands on. Gameplay numbers (speed, box, timings) are the sim's: `tuning.burrback`.
 */
export const BURR = {
  /** Shell: half-length seen from the side and from behind (mid-turn), dome height, rim height off the ground. */
  halfLen: 27,
  halfWide: 19,
  dome: 22.5,
  rim: 11.5,
  /** How far the top of the dome sits behind the middle (the hunched back). */
  shear: 4.5,
  /** Superellipse exponents of the dome outline (x, y): lower = boxier. */
  ex: 0.82,
  ey: 0.92,
  /** Settled on its belly (rest, flinch): how far the rim drops; and the flinch drops this much more. */
  settle: 6,
  hunker: 1.5,

  gait: {
    /** Body travel per full leg cycle, px, and the share of the cycle a foot stays planted. */
    cycle: 25,
    stance: 0.62,
    /** Swing height of a foot, px. */
    lift: 4.2,
    /** Shell bob (px) and rock (rad) per footfall. */
    bob: 1.3,
    rock: 0.028,
    /** Forward lean while walking, rad. */
    lean: 0.045,
  },
  leg: {
    /** Thigh and shin, px; half-widths at hip, knee and foot. */
    upper: 9,
    lower: 11,
    w: [2.2, 1.8, 0.7] as const,
    /** Hip homes along the body (front, middle, rear) and how far the feet stand out from the hips. */
    home: [17, 1.5, -15.5] as const,
    hipIn: 0.82,
    /** Sideways (toward / away from the camera) spread of hips and feet, seen mid-turn. */
    hipZ: 9,
    footZ: 15,
  },
  head: {
    /** Centre ahead of the shell's middle and above the ground; pulled back by this much when tucked. */
    x: 26,
    y: 8,
    len: 8.5,
    high: 5.6,
    tuck: 8,
    eye: 1.05,
  },
  feeler: { len: 15, w: 0.85, tap: 0.5 },
  fringe: { count: 17, len: 4, w: 1.35, lag: 0.022 },
  spots: {
    /** Along the flank (u in -1..1 along the length, v 0..1 up the dome) and each one's radius. */
    at: [
      [0.52, 0.2, 0.95],
      [0.2, 0.25, 1.3],
      [-0.14, 0.25, 1.4],
      [-0.47, 0.2, 1.05],
    ] as const,
    /** Core alpha, halo radius (x the spot radius) and halo strength at rest. */
    core: 0.9,
    halo: 3.4,
    glow: 0.22,
    /** Slow pulse: depth and rad/s. */
    pulse: 0.22,
    rate: 1.5,
    /** Brighter by this factor in a flinch. */
    alert: 1.6,
  },
  /** Zone colours [left, centre, right] of its lights. */
  spotColor: [0x74dfee, 0xf2b25a, 0xb690f2] as const,
  color: {
    shellTop: 0x2c2028,
    shellLow: 0x120b11,
    sheen: 0x46384a,
    seam: 0x0d070e,
    legNear: 0x21151f,
    legFar: 0x110a12,
    head: 0x2a1c26,
    eye: 0xb3ad9e,
    feeler: 0x2a1b26,
    fringeTop: 0x1b2318,
    fringeTip: 0x36452b,
    crack: 0x070308,
    crackEdge: 0x514350,
    /** The lighter tone a hit pops it to (not white). */
    pop: 0x54404b,
    shadow: 0x02060a,
    dust: 0x4a5a5c,
    mote: 0xffc86a,
  },
  rimKey: 0.3,
  rimCool: 0.28,
  shadowAlpha: 0.5,
  hit: {
    /** Squash along the blow on the hit frame (share of its length), per point of power. */
    squash: 0.2,
    /** Rock-back kick, rad/s per point of power. */
    rock: 4.2,
    /** Tone: how dark it goes during the hold and how far to `pop` after it. */
    dark: 0.6,
    pop: 0.33,
  },
  death: {
    /** Frames: roll onto its back by; the legs are curled by; the shell splits from..to; fades from..to. */
    roll: 10,
    hop: 13,
    curl: [4, 16] as const,
    split: [13, 23] as const,
    fade: [19, 29.5] as const,
    gap: 6,
    fragments: 12,
    motes: 9,
  },
  dust: { alpha: 0.2, size: 5 },
} as const;

export type BurrConfig = typeof BURR;
