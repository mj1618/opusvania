/**
 * The prologue's timing sheet (its tuning file), v2 "The first night": the shot list in
 * docs/story/scenes/prologue-v2.md. Seconds are each beat's own clock (`bt`, from the start of
 * the beat); the played stretch (beat 3) has no fixed length, so beats after it start when it ends.
 * World px for the staging (memory/scene-and-units.md). The director (src/prologue/) and the
 * renderers read only these numbers; change the cut here.
 */

/** The beats, in order. `len` in seconds (the played stretch: null, it ends when she gets there). */
export const BEATS = [
  { id: 'breath', len: 10 },
  { id: 'hatch', len: 28 },
  { id: 'play', len: null },
  { id: 'hollow', len: 43 },
  { id: 'summit', len: 15 },
  { id: 'wake', len: 13 },
] as const;
export type BeatId = (typeof BEATS)[number]['id'];

/** 1. The breath (0-10 s), the locked image A cut short. */
export const BREATH = {
  fadeIn: [0, 1],
  /** The light breathes in 2.5 s and out 2.5 s. */
  period: 5,
  /** Touched, its breath slows to this period. */
  slowPeriod: 7.4,
  /** The warm blur comes in from the left, rests against the light, lifts away out of frame. */
  touchIn: [3.5, 4.8],
  touchOut: [6.8, 7.8],
  /** Two flickers (start times, each ~4 frames), a burst of grey grain, a breath that does not finish. */
  flickers: [7.95, 8.18],
  grain: [8.32, 8.82],
  brokenBreath: [8.82, 9.3],
  fadeOut: [9.3, 10],
} as const;

/** Where the hatching happens: the west moss by the pool (ground 1280). */
export const MOSS = 1280;

/** 2. Hatching (bt 0-28), frost on everything. */
export const HATCH = {
  /** The two cocoons hang from threads above; how low their bottoms hang (y of the case's middle). */
  sorrel: { x: 1240, y: 1060 },
  wing: { x: 1400, y: 1080 },
  /** The fox sleeps curled here (its middle, on the moss). */
  fox: 1320,
  /** Match cut out of black on the amber light in his cocoon, then the pull out. */
  fadeIn: [0, 0.6],
  pullOut: [1.2, 3],
  /** His splits; he tumbles out, shakes, looks up at the dance a long look. */
  sorrelSplit: 3.2,
  sorrelShake: [4.4, 5.6],
  lookUp: [5.6, 7],
  /** He looks at her cocoon (frost creeping up it), drops back under it and waits. */
  wait: [7, 10],
  /** Hers splits; she drops into the frost beside the fox's paw and lies there shivering, wings stuck. */
  wingSplit: 10,
  huddle: [10.6, 21],
  /** He folds his wing over hers; they shiver together; her eyes brighten, her wings open. */
  fold: [14, 21],
  /** He taps her wingtip, once. */
  tap: [21.2, 22],
  /** He hops back, ready, looking west; she looks at the fox a beat longer. */
  ready: [22.5, 24],
  lookFox: [24, 26.5],
  /** The camera eases out to the follow framing on her. */
  follow: [25, 28],
  /** The frost grade fades as the night goes on (gone by the time they play). */
  frostOut: [24, 30],
} as const;

/**
 * 3. The first night (played): Sorrel's course. Each leg is a recorded clip in the input DSL
 * (src/input/script.ts) played on his own sim body from the mark before it, then he waits at its
 * mark (feet, world px) until she is within `near` px. Found on the pure sim (no enemies, no
 * pickups): see memory/prologue.md.
 */
export const COURSE = {
  near: 120,
  /** She has been below him this long (s): he goes back for her and leads again. */
  lagBack: 4,
  /** Where each leg starts, by the level she is on when he comes back for her. */
  levels: [
    { y: 1280, leg: 0, from: { x: 1280, y: 1280 } },
    { y: 960, leg: 1, from: { x: 850, y: 960 } },
    { y: 704, leg: 2, from: { x: 1493, y: 704 } },
  ],
  /** He hops "come on" this often while he waits, s. */
  hopEvery: 3,
  hop: 'J3 .1',
  start: { x: 1280, y: MOSS },
  legs: [
    // 3a: west along the moss, a double jump up onto F1 (the somersault at the top).
    { id: 'f1', clip: 'L24 L+J16 L2 L+J16 L6 .30', mark: { x: 850, y: 960 }, unlock: 'jump' },
    // 3b: the race: F2, F3...
    { id: 'f3', clip: 'R4 R+J16 R12 .2 R4 R+J16 R14 .20', mark: { x: 1493, y: 704 }, unlock: 'jump' },
    // ...and F4, a dash across the gap past her (dash is hers from his dash on).
    { id: 'f4', clip: 'R6 R+J10 R+X1 R4 .30', mark: { x: 1944, y: 608 }, unlock: 'dash' },
  ],
  /** 3e: his dive after the glint off F4, wings open (glide is hers from when he opens them). */
  dive: { clip: 'L24 R4 .8 J2 .2 J118 L+J12 J76 .20' },
  /** The dance ring over F4, and the silver-edged moth's low sweep past him (s after he stops). */
  dance: { x: 1900, y: 400, rx: 170, ry: 38 },
  silverSweep: [1, 3.4],
  /** 3c: the glint drifts down between them; the hold; the give; he raises it, looks at her, tosses it. */
  glintFall: 3,
  holdCine: 3,
  giveHold: 0.5,
  hisHold: [0, 1.8],
  hisLook: [1.8, 2.6],
  toss: 2.8,
  /** 3d: bumps: her jump into it sends it to him, his hop sends it back; after this many of hers it sails west. */
  bumps: 2,
  /** 3e: where the glint comes down (the fox's nose at the pool's lip) and where the fox drinks. */
  nose: { x: 1528, y: 1214 },
  /** Control ends when she is within this of the fox; she is placed on its back. */
  foxReach: 160,
} as const;

/** The fox drinks here (its middle; it faces east, its head over the water). */
export const FOX_DRINK = 1420;

/** 4. The hollow (bt 0-40). */
export const HOLLOW = {
  /** The fox shakes its head, drinks, drinks again; the moss at its paws turns pale. */
  shake: [0, 1],
  drinks: [
    [1.2, 2.6],
    [3, 5.4],
  ],
  paling: [3.6, 6],
  /** The ground opens; the fox sinks, eyes closing; the moths flutter up; a root tip rises to her face and sinks. */
  open: [6, 7.5],
  sink: [6.5, 11.5],
  flutter: [6.4, 7.6],
  rootTip: [8.6, 11.6],
  /** The hollow closes; the case rises on its stalk; the ember on its tail goes grey. */
  close: [12, 13],
  caseRise: [12.4, 15.6],
  /** She lands against the case and folds her wing over it; shivers; Sorrel hovers, looking round. */
  land: [16, 17.2],
  fold: [17, 28],
  /** The lights dim; a pulse runs up the stalk; the lamp lights coral and swings toward her glint. */
  dim: [24, 26],
  pulse: [25, 27],
  lampLit: [26.5, 27.6],
  lampTurn: [27, 28],
  /** Played: the coral wash comes down toward her; get her off the case into the ferns and fold. */
  play: [28.6, 35.6],
  /** The wash reaches the case by the end of the played bit; it crosses the ferns after. */
  washIn: [28.6, 34.6],
  /** If she is still on the case: the lamp begins to dive, Sorrel tackles her into the ferns. */
  tackle: [33.8, 35.6],
  /** In the ferns: the wash crosses, slows, stops over them (held), moves on, rests on the case, goes dark. */
  hide: [35.6, 43],
  /** ...its beats, s into the hide: across to the ferns, held over them, back to the case, dark. */
  wash: { cross: 2.4, hold: 4.8, back: 6.2, dark: 7 },
  /** Where the hollow and the case are (the fox drank here), and the ferns 200 px west. */
  x: 1440,
  ferns: 1250,
  /** The case: half-width, height, the stalk under it. */
  caseRx: 96,
  caseH: 92,
  stalk: 22,
  /** The lampwing that wakes (lamp-f3's home). */
  lamp: { x: 1470, y: 420 },
} as const;

/** 5. The summit (bt 0-15): he chooses the dance and leaves her; she stays with the glint. */
export const SUMMIT = {
  fadeIn: [0, 0.8],
  /** He looks up at the dance; she looks out over the world. */
  looks: [0.4, 3.4],
  /** The silver-edged moth leaves the ring and circles him once. */
  silver: [3, 5.2],
  /** He turns to her and offers: a hand to her, then up at the dance (come). */
  offer: [5.2, 7.2],
  /** She hesitates, and folds her wing over the glint. */
  fold: [7.4, 8.4],
  /** He taps her wingtip, and goes up into the dance; she watches him there. */
  tap: [9, 9.7],
  lift: [9.9, 12.6],
  end: 15,
} as const;

/** 6. Title, then the next night (bt 0-12): the title over the summit, black, she wakes by the pool. */
export const WAKE = {
  title: [0.2, 1.2],
  titleOut: [5.2, 6.2],
  black: [6.2, 7.2],
  fadeUp: [7.2, 8.6],
  /** She wakes under a leaf where the fox slept. */
  at: { x: 1300, y: MOSS },
  rise: [8.4, 10.5],
  /** Control and the HUD at the end. */
  hud: [12, 13],
} as const;

// --- v1 (retired from the opening; the code is kept: world.ts, outside.ts) ---

/** v1 shot 2's timeline, as world.ts's world-from-high plate still plays it. */
export const WORLD = {
  fadeIn: [14, 16],
  frost: [14.6, 38],
  stagSink: [32.2, 35],
  stagRoot: [34.4, 38],
  moths: [35.5, 42],
  follow: [38.6, 42],
  fadeOut: [41, 42],
} as const;

/** v1's outside plate and title timing (outside.ts). */
export const OUTSIDE = { span: [83.6, 89.2] } as const;
