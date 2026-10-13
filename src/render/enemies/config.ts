/**
 * Look and motion knobs of the burrback (live through `window.__enemies.cfg`). Lengths are world px
 * in the creature's own frame: x along its length (forward = the way it faces), y up from the
 * ground it stands on. Gameplay numbers (speed, box, timings) are the sim's: `tuning.burrback`.
 */
export const BURR = {
  /** Shell: half-length seen from the side and from behind (mid-turn), dome height, rim height off the ground. */
  halfLen: 27,
  halfWide: 19,
  dome: 22,
  rim: 12,
  /** How far the top of the dome sits behind the middle (the hunched back). */
  shear: 4.5,
  /** Superellipse exponents of the dome outline (x, y): lower = boxier. */
  ex: 0.82,
  ey: 0.92,
  /** Settled on its belly (rest, flinch): how far the rim drops; and the flinch drops this much more. */
  settle: 7.5,
  hunker: 1.5,

  gait: {
    /** Body travel per full leg cycle, px, and the share of the cycle a foot stays planted. */
    cycle: 30,
    stance: 0.58,
    /** Swing height of a foot, px. */
    lift: 6,
    /** Shell bob (px) and rock (rad) per footfall. */
    bob: 2,
    rock: 0.065,
    /** Forward lean while walking, rad. */
    lean: 0.045,
  },
  leg: {
    /** Thigh and shin, px; half-widths at hip, knee and foot. */
    upper: 9.5,
    lower: 12,
    w: [2.5, 2.1, 0.95] as const,
    /** Hip homes along the body (front, middle, rear) and how far the feet stand out from the hips. */
    home: [19, 1.5, -17.5] as const,
    hipIn: 0.82,
    /** Sideways (toward / away from the camera) spread of hips and feet, seen mid-turn. */
    hipZ: 9,
    footZ: 15,
  },
  head: {
    /** Centre ahead of the shell's middle and above the ground; pulled back by this much when tucked. */
    x: 22,
    y: 11.2,
    /** A small flat plate set under the brow horn. */
    len: 7.4,
    high: 5.3,
    tuck: 8,
    /** Eye radius (the near one): two small dim glints. */
    eye: 1.15,
  },
  feeler: { len: 22, w: 0.95, tap: 0.5 },
  fringe: { count: 17, len: 4, w: 1.35, lag: 0.022 },
  spots: {
    /** Along the flank (u in -1..1 along the length, v 0..1 up the dome) and each one's radius. */
    at: [
      [0.52, 0.22, 1.25],
      [0.2, 0.27, 1.65],
      [-0.14, 0.27, 1.8],
      [-0.47, 0.22, 1.35],
    ] as const,
    /** Core alpha, halo radius (x the spot radius) and halo strength at rest. */
    core: 0.9,
    halo: 3.4,
    glow: 0.26,
    /** Slow pulse: depth and rad/s. */
    pulse: 0.4,
    rate: 1.25,
    /** Brighter by this factor in a flinch. */
    alert: 1.6,
  },
  /** Zone colours [left, centre, right] of its lights. */
  spotColor: [0x1fb4d8, 0xf0a030, 0x8a4cf0] as const,
  /** What the zone's light puts on the shell's top edge: [left, centre, right]. */
  edgeColor: [0x8fc6da, 0xdcc49c, 0xb9a6e2] as const,
  color: {
    shellTop: 0x321f2e,
    shellLow: 0x120b11,
    sheen: 0x46384a,
    seam: 0x0d070e,
    legNear: 0x33242f,
    legFar: 0x1a1019,
    plateIn: 0x8c7883,
    /** The face plate: dark bone-grey, only a step off the shell; the eyes are dim glints on it. */
    head: 0x41363b,
    headLow: 0x231a20,
    eye: 0xb0a794,
    feeler: 0x2a1b26,
    fringeTop: 0x1b2318,
    fringeTip: 0x36452b,
    crack: 0x070308,
    crackEdge: 0x514350,
    /** The lighter tone a hit pops it to (not white). */
    pop: 0x7d6873,
    shadow: 0x02060a,
    dust: 0x4a5a5c,
    mote: 0xffc86a,
  },
  rimKey: 0.8,
  rimCool: 0.28,
  shadowAlpha: 0.5,
  hit: {
    /** Squash along the blow on the hit frame (share of its length), per point of power. */
    squash: 0.3,
    /** Rock-back kick, rad/s per point of power. */
    rock: 4.2,
    /** Tone: how dark it goes during the hold and how far to `pop` after it. */
    dark: 0.75,
    pop: 0.55,
  },
  death: {
    /** Frames (after the hold): on its back by `roll` (with a hop, px); legs curled over `curl`; it bursts at `burst`. */
    roll: 6,
    hop: 22,
    curl: [2, 8] as const,
    burst: 9,
    /** Shell plates thrown (and by a finisher), their speed along the cut and up, px/s; a finisher throws this much further. */
    plates: 8,
    platesFinisher: 10,
    speed: [70, 250] as const,
    up: [190, 360] as const,
    finisher: 1.45,
    motes: 6,
  },
  /** Darker by this share right beside the hero, whose light lifts it (it is not in her matte); reach in px. */
  nearHero: { dark: 0.2, reach: 240 },
  dust: { alpha: 0.26, size: 6 },
} as const;

export type BurrConfig = typeof BURR;

/**
 * The lampwing: a ghost-moth, seen from the front with its wings to either side. Lengths are world
 * px from the centre of its 36 x 30 box, y down. Gameplay numbers are `tuning.lampwing`.
 */
export const LAMP = {
  /** Fore and hind wing length, and how far the far-side pair shortens when it looks to one side. */
  fore: 23,
  hind: 14.5,
  farShrink: 0.24,
  /** Beat: wing angle (rad above the horizontal) at the top and bottom of the stroke; the hind pair lags (beats). */
  up: 1.0,
  down: -0.45,
  hindLag: 0.13,
  hindDrop: 0.7,
  /** Body bob against the stroke, px; chord change through the stroke (the figure of eight). */
  bob: 1.5,
  twist: 0.24,
  /** Slack (rest / return): the stroke shrinks by this share. */
  slack: 0.3,
  /** Render-only flutter on top of the sim's path while it pursues, px. */
  wobble: 2.4,
  /** Lean per px/f of sideways speed, rad, and its cap. */
  lean: 0.11,
  leanMax: 0.5,
  body: { thoraxW: 2.9, thoraxH: 4.2, abdomenW: 2, abdomen: 13, head: 2.35 },
  antenna: { len: 12, w: 0.5 },
  leg: 6,
  /** Eye radius, and how dim the eyes are until it has seen her (share of full). */
  eye: 0.44,
  eyeDim: 0.6,
  /** Vein alpha (x the wing's). */
  vein: 0.32,
  lamp: {
    r: 1.15,
    core: 0.55,
    halo: 2.8,
    glow: 0.09,
    /** Slow pulse: depth and rad/s. */
    pulse: 0.55,
    rate: 1.1,
    /** Brighter by this factor while pursuing, and by this at the height of the tell. */
    keen: 1.25,
    flare: 2.4,
  },
  /** [left, centre, right] zone tints: membrane at the root and the tip, the pale edge and veins, the body. */
  wingColor: [0x5c6c80, 0x968a6e, 0x73698a] as const,
  wingTip: [0x2e3846, 0x3e3628, 0x342c4a] as const,
  edgeColor: [0x8a9aaa, 0xbcae90, 0x968caa] as const,
  bodyColor: [0x78859a, 0xb2a68a, 0x898198] as const,
  lampColor: [0x1fb4d8, 0xf0a030, 0x8a4cf0] as const,
  color: {
    /** What a hit darkens it to. */
    dusk: 0x1c1b28,
    face: 0x15111b,
    eye: 0xb4ab96,
    /** A hit: dark for the hold, then toward this for two frames. */
    pop: 0xcfc9be,
    scale: 0xbdb6a8,
  },
  wingAlpha: 0.82,
  farAlpha: 0.7,
  hit: { dark: 0.6, pop: 0.6, scales: 6, scalesFinisher: 10 },
  /**
   * Death: scales torn off by the blow; the body is flung, sheds, and goes to scales `dissolve`
   * frames after the hold (the sim keeps it up to 40), thinning over the last `fade`.
   */
  death: { torn: 10, dissolve: 18, scales: 16, scalesFinisher: 24, fade: 5 },
} as const;
