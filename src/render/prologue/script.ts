/**
 * The prologue's timing sheet (its tuning file): when every beat of the shot list in
 * docs/story/scenes/mouthless-key-scenes.md section 1 starts and ends, in seconds on the
 * prologue's own clock, and where in the Grove it is staged (world px). The renderers and the
 * director read only these numbers; change the cut here.
 */

export const SHOT = {
  /** 1. The breath: black, a small pale light breathing, a warm blur rests on it and lifts; it stutters. */
  breath: { start: 0, end: 14 },
  /** 2. The world from very high: frost-root spreads from the mountain, towns go out, the stag, the moths. */
  world: { start: 14, end: 42 },
  /** 3. Down into the Grove: the burrback and the caterpillar. */
  burr: { start: 42, end: 60 },
  /** 4. Two cocoons, a glint, the title. */
  cocoons: { start: 60, end: 90 },
} as const;

/** The whole prologue, seconds. */
export const PROLOGUE_END = SHOT.cocoons.end;

/** Shot 1, seconds. */
export const BREATH = {
  fadeIn: [0, 1.6],
  /** The light breathes in 2.5 s and out 2.5 s. */
  period: 5,
  /** Touched, its breath slows to this period. */
  slowPeriod: 7.4,
  /** The warm blur comes in from the left, rests against the light, lifts away out of frame. */
  touchIn: [4.6, 6.4],
  touchOut: [9, 10.4],
  /** Two flickers (start times, each ~4 frames), a burst of grey grain, a breath that does not finish. */
  flickers: [10.55, 10.86],
  grain: [11.05, 11.6],
  brokenBreath: [11.6, 12.25],
  fadeOut: [13.1, 14],
} as const;

/** Shot 2, seconds. */
export const WORLD = {
  fadeIn: [14, 16],
  /** The frost leaves the mountain's foot at `frost[0]` and has covered the near land by `frost[1]`. */
  frost: [14.6, 38],
  /** The stag: the frost reaches it, it sinks, root grows on from its antlers. */
  stagSink: [32.2, 35],
  stagRoot: [34.4, 38],
  /** The moth-flecks cross from here; the camera picks one and follows it down. */
  moths: [35.5, 42],
  follow: [38.6, 42],
  fadeOut: [41, 42],
} as const;

/** Shot 3, seconds and world px (the Grove's left glade, on the 1280 ground). */
export const BURR = {
  fadeIn: [42, 43.4],
  /** The camera comes down through the canopy and settles at play framing. */
  descend: [42, 47],
  /** The caterpillar's twig: where it clings (world px). */
  twig: { x: 760, y: 1210 },
  /** The burrback walks in from the west and stops over the caterpillar. */
  walkIn: [45.2, 50.2],
  enterX: 400,
  stopX: 724,
  /** Its head swings over the caterpillar, plate opening. */
  look: [50.2, 52.8],
  /** The caterpillar spins: a pale blur of silk, a cocoon in two seconds. */
  spin: [51.1, 53.1],
  /** It sniffs, loses interest and walks on east. */
  sniff: [52.8, 55.2],
  walkOn: [55.4, 61],
  exitX: 1180,
  ground: 1280,
} as const;

/** Shot 4, seconds and world px (the pool: water 1536-1856, the moss 1280 west of it). */
export const COCOONS = {
  /** Where the two cocoons hang from (a thread from above), and how low they hang. */
  sorrel: { x: 1700, y: 1060 },
  umber: { x: 1500, y: 1080 },
  /** Sorrel's splits, and he flies straight up to the dance. */
  sorrelSplit: 62.2,
  sorrelFly: [62.6, 65.4],
  /** The dance: a ring of moths in the canopy over the pool. */
  dance: { x: 1760, y: 420, rx: 170, ry: 38 },
  /** Hers splits; she drops to the moss (the sim takes her from here: walk only). */
  umberSplit: 66,
  /** A glint drifts down in front of her; walk is taken back when it arrives. */
  glint: [74, 77],
  /** She raises it to her face; the camera pushes in. */
  raise: [77, 78.4],
  /** She looks past it; the camera follows her eyes out of the Grove. */
  look: [81.6, 83.2],
  /** Outside: pale root steaming in the frost; the title in the sky. */
  outside: [83.6, 89.2],
  title: [85.2, 87.6],
  /** Back to her; control returns at the end. */
  back: [88.6, 90],
} as const;
