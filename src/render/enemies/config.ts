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
    x: 23.5,
    y: 12.4,
    /** A flat plate set under the brow horn: big enough to carry the eyes at play zoom, still dark. */
    len: 9.6,
    high: 6.9,
    tuck: 8,
    /** How far it cranes out (and down) when it peers at something, px. */
    reach: 5.5,
    /** Eye radius (the near one): two small warm lights, each with a faint halo (x the radius, strength). */
    eye: 1.6,
    eyeHalo: 3.2,
    eyeGlow: 0.11,
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
    eye: 0xd0bd90,
    eyeGlow: 0xf0b060,
    feeler: 0x2a1b26,
    fringeTop: 0x1b2318,
    fringeTip: 0x36452b,
    crack: 0x070308,
    crackEdge: 0x514350,
    /** The lighter tone a hit pops it to (not white). */
    pop: 0x7d6873,
    shadow: 0x02060a,
    dust: 0x4a5a5c,
    /** The dust of a bump (its touch): paler, so it shows on dark ground without a blow's flash beside it. */
    dustPale: 0x9aa89a,
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
  /**
   * Calmed (`enemy.calm` > 0, inside a lit lantern's sanctuary, or the run is over): it settles on
   * its belly, breathes slowly, its lights go to one warm tone breathing together, its eyes close
   * to slits. Eases in at `in` /s, out at `out` /s, and starts to lift over the last `fade` frames.
   */
  calm: {
    in: 4.5,
    out: 2.6,
    fade: 26,
    settle: 1.14,
    /** Breath: depth (share of its size) and rad/s; awake it is 0.022 at 2.1. */
    breath: 0.05,
    rate: 1.35,
    /** The lights: tone, brightness (x), pulse depth with the breath; the lids close by `lids`. */
    light: 0xffb260,
    dim: 0.85,
    pulse: 0.55,
    lids: 0.7,
    /** A tiny warm mote lifts off the shell this often, s. */
    mote: 0.7,
    /** The rim on the shell's top edge goes this far to the warm tone, and this much stronger. */
    rim: 0.65,
    rimUp: 0.3,
  },
  /**
   * At a lit lantern's sanctuary (`enemyTurn` cause `lantern`): it shies from the light for the
   * first `hold` of the turn (ducks, pulls its head in, rocks back `rock` rad, weight `back` px
   * away, eyes narrowed, lights down by `dim`), turns in what is left, and stays tucked `linger` s.
   */
  shy: { hold: 0.42, duck: 0.8, rock: 0.11, back: 4, kick: 110, squint: 0.75, dim: 0.5, linger: 1.3 },
  /**
   * Wary of an edge she is under (`enemyTurn` cause `wary`, and the stand at the other end): it
   * cranes toward the edge for the first `hold` of the turn, weight `back` px back and rocked
   * `rock` rad; standing, it turns to her side and keeps peering (`reachX` = how far she may be).
   */
  peer: { hold: 0.42, crouch: 0.4, rock: 0.07, back: 3.5, belowPx: 24, reachX: 640, in: 7, out: 4 },
  /**
   * Its touch landed (`alert` with a shove): a sharp squash along the bump, a rock back, burrs and
   * fringe bristle (x their length), legs skid with dust; it holds its facing `hold` frames, then
   * the head comes round over `head` frames and the body over `body`.
   */
  touch: {
    squash: 0.3,
    rock: 3.4,
    bristle: 0.7,
    kick: 26,
    hold: 11,
    head: 11,
    body: 16,
    puffs: 6,
    flash: 1.9,
    /** Its dust is this much denser and larger than a blow's (it has to carry the bump on its own). */
    dust: 2.1,
    dustSize: 1.5,
  },
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
  wingColor: [0x3b4763, 0x968a6e, 0x73698a] as const,
  wingTip: [0x1a2236, 0x3e3628, 0x342c4a] as const,
  edgeColor: [0x8fa3ba, 0xbcae90, 0x968caa] as const,
  bodyColor: [0x66748e, 0xb2a68a, 0x898198] as const,
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
  wingAlpha: 0.9,
  farAlpha: 0.7,
  hit: { dark: 0.6, pop: 0.6, scales: 6, scalesFinisher: 10 },
  /**
   * Death: scales torn off by the blow; the body is flung, sheds, and goes to scales `dissolve`
   * frames after the hold (the sim keeps it up to 40), thinning over the last `fade`.
   */
  death: { torn: 10, dissolve: 18, scales: 16, scalesFinisher: 24, fade: 5 },
  /**
   * Calmed (`enemy.calm` > 0, inside a lit lantern's ring, or the run is over): the beat slows to
   * `beat` of the sim's, the stroke shrinks and the wings ride higher, it hangs on a slow swell
   * (`sway` px at `rate` rad/s), antennae and tail droop, the eyes close by `lids`, the lamp goes
   * to one warm tone (x `dim`) breathing with the swell.
   */
  calm: {
    in: 4,
    out: 2.4,
    fade: 26,
    beat: 0.55,
    stroke: 0.42,
    lift: 0.3,
    sway: 2.4,
    rate: 1.5,
    lids: 0.6,
    light: 0xffb260,
    dim: 1.25,
    halo: 1.7,
  },
  /**
   * Giving up at a lit lantern (`enemyGiveUp` cause `calm`): it starts back from the light (a
   * render-only kick of `kick` px/s on a spring, wings half shut by `fold`, lean `lean` rad away,
   * the lamp dipped by `dim`), easing off at `ease` /s. A calm from a kindling far off is `soft` of that.
   */
  shy: { kick: 95, fold: 0.5, lean: 0.4, dim: 0.65, ease: 3.2, soft: 0.35, near: 260 },
} as const;
