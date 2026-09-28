import type { ChainSpec } from './chain';

/**
 * Kid Tallow's look: colours, body proportions and animation numbers for the code-drawn cutout rig
 * (PLAN §5.1 "luminous silhouette", §5.3 cutout rigs). Local rig space: origin = feet centre,
 * +x = the way she faces, +y = down, 1 unit = 1 world px. Her collision box is 40 x 80 (x -20..20,
 * y -80..0); the drawing stays inside it except the cap, gloves on a punch and the swinging bits.
 */
export const KID = {
  // Silhouette: deep plum coat, near-black legs, bright accents that read against dark districts.
  rim: 0xffe7c2,
  rimAlpha: 0.9,
  coat: 0x2b2545,
  coatFar: 0x1d1930,
  coatHi: 0x463d6a,
  lining: 0x9c2f3f,
  collar: 0x3a3160,
  button: 0xf2c25a,
  legs: 0x1b1a26,
  legsFar: 0x121119,
  boot: 0x3b2a22,
  sole: 0x0c0a0e,
  skin: 0xa8705a,
  skinShade: 0x4a3036,
  cap: 0x5a4a5e,
  capBand: 0x241d2c,
  capHi: 0x7c6a80,
  feather: 0xf1e7d0,
  featherDash: 0x69c8ff,
  featherUsed: 0x5a6378,
  glove: 0xe0463b,
  gloveFar: 0xa8302b,
  gloveDark: 0x6a1a18,
  gloveHi: 0xff9a7a,
  wrap: 0xefe4cc,
  sack: 0x74593a,
  sackDark: 0x3e2d1d,
  sackStitch: 0xb08a58,
  strap: 0x2a1c14,
  hair: 0x3a2029,
  hairHi: 0x6a3a44,
  hairTie: 0xe0463b,
  eye: 0xfff4cc,
  eyeGlow: 0xffc86a,
  smear: 0xfff6e2,
  dashGhost: 0x8fd3ff,
  hurt: 0xffffff,
  gold: 0xffd84a,
} as const;

/** Body dimensions (px). */
export const BODY = {
  hipY: -31,
  thigh: 17,
  shin: 17,
  /** Hip to neck. */
  torso: 27,
  /** Shoulder height along the torso from the hip. */
  shoulderAt: 23,
  headR: 10,
  /** Neck to head centre. */
  neck: 10,
  upperArm: 12,
  foreArm: 12,
  gloveR: 6.5,
  thighW: 8.5,
  shinW: 7,
  armW: 5.5,
  coatHemBelowHip: 11,
  coatHemFlare: 10,
} as const;

/** Secondary motion chains (verlet). */
export const CHAINS: Record<'tail' | 'tailFar' | 'feather' | 'sack' | 'hair', ChainSpec> = {
  tail: { n: 5, seg: 6, gravity: 0.55, damping: 0.86, stiffness: 0.12, iterations: 2 },
  tailFar: { n: 5, seg: 5.5, gravity: 0.5, damping: 0.88, stiffness: 0.1, iterations: 2 },
  feather: { n: 4, seg: 5, gravity: 0.12, damping: 0.8, stiffness: 0.32, iterations: 2 },
  hair: { n: 5, seg: 4.5, gravity: 0.4, damping: 0.84, stiffness: 0.14, iterations: 2 },
  sack: { n: 2, seg: 11, gravity: 0.7, damping: 0.84, stiffness: 0.16, iterations: 2 },
};

/** Animation numbers (frames at 60 Hz unless noted). */
export const ANIM = {
  /** Boxer's bounce period while idle. */
  idleBounce: 26,
  idleFidgetAfter: 240,
  idleFidgetLen: 44,
  /** Run: px of travel per full stride cycle at a walk and at full speed. */
  strideWalk: 64,
  strideRun: 150,
  runLeanMax: 0.34,
  /** How fast the drawn pose chases the target (per step) for locomotion, moves, and the head. */
  follow: 0.38,
  followMove: 0.85,
  landFrames: 10,
  wallJumpFrames: 14,
  djFrames: 18,
  pogoFrames: 12,
  hurtFrames: 18,
  deathFrames: 40,
  riseFrames: 44,
  flexFrames: 30,
  turnFrames: 5,
  /** Juice squash from src/render/fx.ts is tuned for a rectangle; the rig bends its knees too. */
  juiceSquashMix: 0.55,
  /** A strike's arm may stretch this much on its active frames (cartoon smear). */
  armStretch: 1.7,
  trailLen: 7,
  trailMinSpeed: 5,
  afterimageEvery: 3,
  afterimageLife: 14,
  /** Seize: steps until the take lands in the sack and it pulses (the juice tear arrives at 12). */
  seizeOrbFrames: 12,
  sackPulseFrames: 18,
} as const;
