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
  { id: 'hatch', len: 30 },
  { id: 'play', len: null },
  { id: 'hollow', len: 46 },
  { id: 'summit', len: 20 },
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
  /** Match cut out of black on the amber light in his cocoon, then the pull out (to about 3x). */
  fadeIn: [0, 0.6],
  pullOut: [1.2, 3],
  /** His splits; he tumbles out, shakes, looks up at the dance a long look. */
  sorrelSplit: 3.2,
  sorrelShake: [4.2, 5.2],
  lookUp: [5.4, 7.4],
  /** He looks at her cocoon (frost creeping up it), drops back under it and waits. */
  wait: [7.4, 10.4],
  /** Hers splits; she drops into the frost beside the fox's paw and lies there, rimed, shivering, wings stuck. */
  wingSplit: 10.4,
  huddle: [10.9, 19.8],
  /** She tries to open her wings; they don't. */
  tryOpen: [12.4, 13.8],
  /** He folds his wing over hers (5 s); they shiver together; her eyes brighten, she sits up, her wings open. */
  fold: [14.8, 19.8],
  brighten: [18.4, 19.8],
  opens: [19.8, 20.8],
  /** He taps her wingtip, once (held: a small flash where they touch). */
  tap: [21.2, 22.6],
  /** He hops back, ready, looking west; she looks back at the fox, a hand on its muzzle. */
  ready: [23, 24.2],
  lookFox: [24.4, 27.4],
  /** The camera eases out to the follow framing on her. */
  follow: [27.2, 30],
  /** The frost grade fades as the night goes on (gone by the time they play). */
  frostOut: [26, 32],
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
  /** 3e: where the glint comes down (the fox's nose, its muzzle in the pool). */
  nose: { x: 1632, y: 1350 },
  /** The sneeze, held close (s): then the played stretch is over and they come down onto the fox. */
  sneezeHold: 3,
  /** ...of which the glint rests on its nose this long before the sneeze. */
  sneezeWait: 0.8,
  /** (Kept for the autopilot's walk.) */
  foxReach: 160,
} as const;

/** The fox drinks here (its middle; it faces east, its head over the water). */
export const FOX_DRINK = 1440;
/** The water's surface in the pool (where the fox's muzzle goes in, where the ripples are). */
export const WATER = 1356;

/** 4. The hollow (bt 0-46). */
export const HOLLOW = {
  /** Down onto the fox's back from wherever they were; the glint popped up by the sneeze comes to her hands. */
  arrive: [0, 1.4],
  /** The fox shakes its head, drinks (muzzle in the pool), drinks again; the moss at its paws turns pale. */
  shake: [1.2, 1.8],
  drinks: [
    [1.8, 3.8],
    [4.2, 6.8],
  ],
  paling: [4.6, 7.2],
  /** The ground opens; the fox sinks, eyes closing; the moths flutter up. */
  open: [7.2, 8.7],
  sink: [7.7, 12.7],
  flutter: [7.6, 8.8],
  /** A root tip rises out of it to her face, pauses there (it looks, and does not see), and sinks back. */
  rootTip: [9.4, 13.6],
  /** The hollow closes; the case rises on its stalk; the warmth inside it greys. */
  close: [13.2, 14.2],
  caseRise: [13.6, 16.8],
  /** She lands on the case, kneels, and wraps both wings round it: his fold. It stays cold; her eyes dim. */
  land: [17.2, 18.4],
  fold: [18.2, 31],
  /** The lights dim; a pulse climbs the case's stalk and on up a pale thread; the camera follows it (2.5 s) to the lamp. */
  dim: [26.6, 28],
  pulse: [27.4, 29.9],
  lampLit: [29.8, 30.6],
  lampTurn: [30.4, 31.2],
  /** Played: the coral wash comes down toward her; get her off the case into the ferns and fold. */
  play: [31.4, 38.4],
  /** The wash crawls down the bark toward the case by the end of the played bit. */
  washIn: [31.4, 37.4],
  /** If she is still on the case: the lamp begins to come down, Sorrel tackles her into the ferns. */
  tackle: [36.6, 38.4],
  /** In the ferns: the wash crosses, stops over them (held), moves on, rests on the case, goes dark. */
  hide: [38.4, 46],
  /** ...its beats, s into the hide. */
  wash: { cross: 2.2, hold: 4.8, back: 6.2, dark: 7 },
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

/** 5. The summit (bt 0-20): he chooses the dance (and the one in it) and leaves her; she stays with the glint. */
export const SUMMIT = {
  fadeIn: [0, 0.8],
  /** He looks up at the dance; she looks down at the case's pale point below them, then out along its line. */
  looks: [0.4, 4],
  /** The silver-edged moth leaves the ring, swoops down to him, circles him and waits, hovering near. */
  silver: [3, 5.6],
  /** He turns to go (toward her). */
  turn: [5.6, 6.8],
  /** She holds the glint out to him: take it; or, stay. */
  offer: [6.8, 9.6],
  /** He folds her hands back over it with his wing. */
  foldBack: [9.6, 11.2],
  /** He taps her wingtip, and goes, up after the silver moth into the dance, not looking back; she watches. */
  tap: [11.2, 12.2],
  lift: [12.4, 15.4],
  /** Alone she unfolds her hands; the glint lights her. Held. */
  alone: [15.4, 20],
  end: 20,
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
