/**
 * Look and motion knobs of the burrback (live through `window.__enemies.cfg`). Lengths are world px
 * in the creature's own frame: x along its length (forward = the way it faces), y up from the
 * ground it stands on. Gameplay numbers (speed, box, timings) are the sim's: `tuning.burrback`.
 */
export const BURR = {
  /** Shell: half-length seen from the side and from behind (mid-turn), dome height, rim height off the ground. */
  halfLen: 30,
  halfWide: 21,
  dome: 27,
  rim: 13,
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
    home: [21, 1.5, -19.5] as const,
    hipIn: 0.82,
    /** Sideways (toward / away from the camera) spread of hips and feet, seen mid-turn. */
    hipZ: 9,
    footZ: 15,
  },
  head: {
    /** Centre ahead of the shell's middle and above the ground; pulled back by this much when tucked. */
    x: 26.5,
    y: 16,
    /** A flat plate set under the brow horn: big enough to carry the eyes at play zoom, still dark. */
    len: 9.6,
    high: 6.9,
    tuck: 8,
    /** How far it cranes out (and down) when it peers at something, px. */
    reach: 5.5,
    /** Eye radius (the near one): two small warm lights, each with a faint halo (x the radius, strength). */
    eye: 2,
    eyeHalo: 3.2,
    eyeGlow: 0.11,
  },
  feeler: { len: 22, w: 0.95, tap: 0.5 },
  fringe: { count: 17, len: 4, w: 1.35, lag: 0.022 },
  spots: {
    /** Along the flank (u in -1..1 along the length, v 0..1 up the dome) and each one's radius. */
    at: [
      [0.53, 0.27, 1.7],
      [0.2, 0.32, 2.2],
      [-0.15, 0.32, 2.35],
      [-0.48, 0.27, 1.85],
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
    /**
     * Walking, the four run front to back like a slow chaser: one pass per `walk` px walked, each
     * light down to `low` between passes and up to `high` as the pass crosses it.
     */
    walk: 66,
    low: 0.22,
    high: 1.25,
  },
  /** Zone colours [left, centre, right] of its lights. */
  spotColor: [0x1fb4d8, 0xff6a24, 0x8a4cf0] as const,
  /**
   * The pale line along the crown and the pale tips of horn and burrs (bone): the thing that
   * separates it from the ground in value. One source colour per zone [left, centre, right],
   * chosen so it comes out of the zone grades at about the same value (the left grade crushes
   * mid-tones, the other two lift pale things toward white). Half-width in px, how far inside the
   * outline it runs, alpha, how pale the burr tips go.
   */
  crestColor: [0xf2ecdc, 0xb4a88e, 0xb2a6b6] as const,
  crest: {
    w: 1.25,
    inset: 1.1,
    alpha: 0.92,
    tip: 0.85,
    /** Wider by this in the left zone (its mist thins a fine line). */ wLeft: 1.35,
  },
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
    /** The motes a calmed one breathes out, and the crisp puff of a bump. */
    sleep: 0xffe6b8,
    puff: 0xb9c6b4,
    puffLow: 0x7f9088,
  },
  rimKey: 0.8,
  rimCool: 0.28,
  shadowAlpha: 0.5,
  hit: {
    /** Squash along the blow on the hit frame (share of its length), per point of power. */
    squash: 0.3,
    /** Rock-back kick, rad/s per point of power. */
    rock: 4.2,
    /**
     * Tone: for the first `flash` frames of the hold its whole outline is one pale line (`flashW` px,
     * `flashColor`) on a fill that has NOT gone dark yet; then it goes `dark` of the way to `struck`
     * (a flat desaturated dusk, lighter than black ground: pure dark hid the hit) for the rest of the
     * hold, the outline staying on at `holdLine`; `pop` after it.
     */
    dark: 0.62,
    pop: 0.42,
    struck: 0x2f2a34,
    flash: 2,
    flashW: 1.7,
    flashColor: 0xf6eedc,
    holdLine: 0.42,
    /** Chips a blow knocks off (a finisher's), their life in seconds: gone in about ten frames. */
    chips: 3,
    chipsFinisher: 5,
    chipLife: [0.13, 0.19] as const,
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
    /** Settled, the dome itself sags flat (share of its height) and spreads, and the burrs lie back. */
    flat: 0.2,
    spread: 0.06,
    burrs: 0.5,
    /** Breath: depth (share of its size) and rad/s; awake it is 0.022 at 2.1. */
    breath: 0.06,
    rate: 1.35,
    /** The lights: tone, brightness (x), pulse depth with the breath; the lids close by `lids`. */
    light: 0xffc070,
    dim: 1,
    pulse: 0.8,
    lids: 0.7,
    /** A pale mote drifts up off it this often (s), like a slow breath out: lives `moteLife` s, rises `moteRise` px/s. */
    mote: 0.75,
    moteLife: 2.3,
    moteRise: 30,
    moteSize: 2.6,
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
    /** Crisp puffs thrown low along the ground at the bump (and grit specks), their speed px/s, size px, life s. */
    crisp: 7,
    grit: 5,
    crispSpeed: [70, 190] as const,
    crispSize: [2.6, 5] as const,
    crispLife: [0.26, 0.42] as const,
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
    dust: 1.3,
    dustSize: 1.2,
  },
  /**
   * The ram (sim: `windup` 26 frames, `charge` 180 px, `recover` 45 frames; memory/enemies.md).
   * **Brace**: it plants, pitches its front down (`pitch` rad, `crouch`), weight coiled back (`back`
   * px, more by the end), the brow plate slides out and down as a shield (`out`, `down` px) with a
   * bone edge (`edgeW` px, `edge` alpha), the horn levels at her, the burrs lie back (`flat`), the
   * rear feet scrape (`scrape` px, `scrapes` strokes), and the lights go to `light` and count down
   * in `beats` quickening flashes (`countPow`: higher = the first gaps longer; each flash x `peak`,
   * between them x `low`).
   * **Block** (`enemyBlock`): the shell shudders (`shake` px, `shakeRot` rad at `shakeHz`, dying at
   * `ringFade` /s), the edge and the crown line flash (`ringLine`), `sparks` bright chips fly back.
   * **Ram**: lower and longer (`stretch`), legs paddling, lights streaked back `streak` px, dust
   * every `dustEvery` s. A stop at a wall / ledge / light is a jolt (`jolt` squash, `joltBack` px/s);
   * its own length run out is a skid (`skid` px/s of overshoot).
   * **Spent**: tipped back (`tip` rad), sat down (`sit`), the brow plate lifted (`lift`), the soft
   * belly showing (`belly` colour) and the seams open pale, head hanging out, panting (`pant` rad/s,
   * `pantDepth`), a daze wobble (`daze` rad at `dazeRate`), lights down to `dim`; it gathers itself
   * over its last `gather` frames. Then, while it cannot brace (`strikeCd`), its lights come back
   * one by one and it keeps its head in a little (`wary`).
   */
  ram: {
    light: 0xff3c26,
    pitch: 0.42,
    /** The wedge stands taller by this share of its height (stretched up off the ground, rear highest). */
    tall: 0.17,
    crouch: 0.3,
    back: 7,
    coil: 6,
    /** It trembles more as the count runs, px; a glint at the horn's tip on each beat (radius px, strength). */
    tremble: 1.3,
    glint: 5.5,
    glintK: 0.55,
    out: 14,
    down: 10,
    edgeW: 3.3,
    edge: 1,
    /**
     * The count, as one large thing: the whole rim of the shell lights in the ram's colour on each of
     * the five beats and falls off between them. Each beat reaches further than the last: the line is
     * `w` px wide on the first beat and `grow` px wider on each one after, with a halo behind the shell
     * of `halo` px (+ `haloGrow` per beat) at strength `glow` (+ `glowGrow`). `pale` is what the line
     * goes to at the top of a beat. On the release (the ram starts) everything flashes once, hard:
     * `flashR` px, strength `flashK`, dying at `flashFade` /s.
     */
    rimW: 1.25,
    rimGrow: 0.65,
    /** Wider by this in the left zone (dark blue on dark blue: the line has to carry more there). */
    rimLeft: 1.4,
    rimHalo: 30,
    rimHaloGrow: 9,
    rimGlow: 0.2,
    rimGlowGrow: 0.07,
    rimPale: 0xffd9b8,
    flashR: 70,
    flashK: 0.75,
    flashFade: 13,
    /** Each beat its front feet rake the ground and kick dust at her: puffs on the first beat, one more every `kickMore` beats. */
    kick: 1,
    kickMore: 2,
    flat: 1,
    horn: 1.3,
    scrape: 10,
    scrapes: 3,
    beats: 5,
    countPow: 1.4,
    peak: 2.3,
    low: 0.4,
    eye: 0.5,
    shake: 2.4,
    shakeRot: 0.04,
    shakeHz: 15,
    ringFade: 8,
    ringLine: 1.3,
    sparks: 9,
    spark: 0xffe6bc,
    stretch: 0.15,
    ramPitch: 0.17,
    ramCrouch: 0.7,
    streak: 28,
    dustEvery: 0.022,
    jolt: 0.34,
    joltBack: 150,
    skid: 250,
    tip: 0.62,
    sit: 0.75,
    lift: 0.55,
    /** Rolled back on its haunches: the pale underside it shows her, half-length and half-height, px. */
    bellyLen: 15,
    bellyHigh: 10.5,
    /**
     * Stopped dead by a wall it is stunned (the sim's `recoverWallFrames`), harder than spent: tipped `stunTip`
     * rad (nearly on its back), all legs off the ground pawing, rocking `stunRock` rad, lights out.
     * Tiny pale motes circle over it: `stars` of them when spent, `stunStars` when stunned, on an
     * orbit `starR` px wide at `starRate` rad/s.
     */
    stunTip: 0.95,
    stunRock: 0.13,
    stars: 3,
    stunStars: 5,
    starR: 15,
    starRate: 5.2,
    star: 0xfff0cc,
    belly: 0xb7a3a0,
    bellyLow: 0x77626a,
    seam: 0x9a8288,
    pant: 7.4,
    pantDepth: 0.12,
    daze: 0.07,
    dazeRate: 4.2,
    dim: 0.2,
    gather: 10,
    wary: 0.3,
    /** Seconds a creature made whole again takes to come round (`enemyReset`: a beat for her re-form to fade in, a shake, its lights back one by one), and the shake's size, rad. */
    wake: 1.7,
    wakeRock: 0.075,
  },
  /**
   * Curled (sim `tuck` > 0: a down cut landed; it stays curled through the flinch and the winded time
   * until it uncurls, usually straight into its brace). Rolls up at `in` /s (out at `out`, or `outBrace`
   * into a brace), right down on the ground (`crouch`), `short`er and `tall`er, its lower sides drawn
   * in under it (`pinch`: a ball, not a dome on a rim), horn
   * bent under (`horn`), fringe in (`fringe`), legs folded to `fold` of their stance, head `headIn` px
   * further in, burrs up a little (`burrs`), rocking `rock` rad at `rockRate` rad/s. Its row of lights
   * goes to `lights`; one slit of light at its front (`slitAt` rad up the outline, `slitIn` px inside
   * it, `slitW` x `slitH` px, `slitPale` toward the eyes' colour, a glow `slitGlowR` px at `slitGlow`).
   * A landed pogo pounds it flat (`pound`, squash per power) instead of pushing it along.
   * Uncurling into the brace is one motion: stretched up (`unrollStretch`), rolled forward over its
   * front (`unrollRoll` rad/s), the plate thrown out (`unrollGuard`), burrs kicked (`unrollBristle`).
   * Uncurling on the timer, it shakes itself out (`shake`).
   */
  curl: {
    in: 24,
    out: 7,
    outBrace: 11,
    crouch: 1.3,
    short: 0.1,
    /** The lower sides drawn in under it (share of its half-length at the ground): a ball. */
    pinch: 0.3,
    tall: 0.1,
    horn: 0.5,
    fringe: 0.45,
    fold: 0.5,
    headIn: 7,
    burrs: 0.3,
    rock: 0.075,
    rockRate: 2.4,
    /** Moved while curled, the rock runs faster by this, rad per px (a waddle, not a slide). */
    waddle: 0.05,
    lights: 0,
    slitAt: 0.3,
    slitIn: 3,
    slitW: 4.2,
    slitH: 0.55,
    slitPale: 0.35,
    slitGlowR: 7,
    slitGlow: 0.32,
    pound: 0.16,
    unrollStretch: 0.1,
    unrollRoll: 7,
    unrollGuard: 16,
    unrollBristle: 22,
    shake: 18,
  },
  /**
   * A down cut glanced off its top (`enemyBlock` slash `down`: a braced or a curled shell): a clang on
   * the TOP, not the front. Pounded flat (`squash`) and ringing up and down (`bounce` px, `pound` share,
   * `rot` rad, at `hz`, dying at `fade` /s), tipped away from where it was struck (`rock` rad/s), burrs
   * rattled (`bristle`). The crown line goes `pale` and a swelling (`line`, + `lineAll` everywhere) runs
   * out both ways from the spot at `run` (half-lengths /s); the spot blooms (`glowR` px, `glow`); the
   * seams catch the light (`seams`). `chips` hot chips spray UP in a `fan` (rad) at `speed` px/s.
   */
  clang: {
    squash: 0.14,
    bounce: 1.4,
    pound: 0.035,
    rot: 0.02,
    hz: 16,
    fade: 9,
    rock: 2.2,
    bristle: 12,
    pale: 0.7,
    line: 1.5,
    lineAll: 0.35,
    run: 5,
    glowR: 9,
    glow: 0.5,
    seams: 0.6,
    chips: 6,
    fan: 0.55,
    speed: [150, 290] as const,
  },
  /**
   * Hurrying out from under a falling hero (sim: `walk` at up to 3 px/f; `enemyTurn` cause `drop`):
   * when `walk` runs at `minVx` px/f or more, or she is dropping onto it and it walks or stands (render
   * reads the sim's `dropping`). Low (`crouch`), leaning into it (`lean`), feet lifted `low` less, head in (`tuck`),
   * burrs laid back (`flat`), eyes on her; it looks up at her as it starts (`tilt` rad of head, fading
   * at `glanceFade` /s). In at `in` /s, out at `out`. Dust off its heels every `dustEvery` s.
   */
  scurry: {
    minVx: 2.5,
    in: 30,
    out: 5,
    crouch: 0.8,
    lean: 0.1,
    low: 0.45,
    tuck: 0.9,
    flat: 0.35,
    tilt: 0.7,
    /** Head this much further in, px; the eyes slide this much further toward her, px. */
    headIn: 4,
    eyeUp: 1.4,
    glanceFade: 2.2,
    dustEvery: 0.05,
  },
  /**
   * Unbothered (memory/giving-render.md): she passes within `px` (and `level` px of its ground) and it
   * has not seen her: lids `lids` shut, the breath goes `breath` of the way to the calm one, a sleepy
   * mote every `mote` s (index.ts). In at `in` /s, out at `out` /s.
   */
  doze: { px: 340, level: 150, lids: 0.62, breath: 0.75, mote: 1.5, in: 2.5, out: 6 },
  /**
   * It has noticed her: the sim's `EnemyState.aware` (memory/giving.md: it sees the light she
   * carries, from farther the more she carries; never while she is empty-handed). Burrs up
   * (`bristle`, with a kick), eyes on her and wide, lights up by `light` and a flash of `flash` that
   * fades at `fade` /s; standing, it turns to her side (render only).
   */
  notice: {
    /** The moment it sees her: its eye halos flare x(1 + `eyeFlare`) on the flash (and widen by `eyeWide`), then stay x(1 + `eyeKeep`). */
    eyeFlare: 2.4,
    eyeWide: 0.35,
    eyeKeep: 0.6,
    bristle: 0.95,
    kick: 26,
    light: 1.6,
    flash: 1.1,
    fade: 3,
    in: 12,
    out: 3,
  },
} as const;

export type BurrConfig = typeof BURR;

/**
 * The lampwing: a ghost-moth, seen from the front with its wings to either side. Lengths are world
 * px from the centre of its 36 x 30 box, y down. Gameplay numbers are `tuning.lampwing`.
 */
export const LAMP = {
  /** Fore and hind wing length, and how far the far-side pair shortens when it looks to one side. */
  fore: 31,
  hind: 20,
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
  body: { thoraxW: 3.9, thoraxH: 5.6, abdomenW: 2.5, abdomen: 21, head: 3 },
  antenna: { len: 15, w: 0.6 },
  leg: 7.5,
  /** Eye radius, and how dim the eyes are until it has seen her (share of full). */
  eye: 0.62,
  eyeDim: 0.6,
  /** Vein alpha (x the wing's). */
  vein: 0.32,
  /** The lamp hangs at the end of the long tail: a bulb with a pale core, the one bright thing on a dark creature. */
  lamp: {
    r: 2.6,
    core: 0.95,
    halo: 4,
    glow: 0.4,
    /** Slow pulse: depth and rad/s. */
    pulse: 0.55,
    rate: 1.1,
    /** Brighter by this factor while pursuing, and by this at the height of the tell. */
    keen: 1.35,
    flare: 2.6,
    /** Larger (x radius) while it hunts. */
    keenR: 1.25,
  },
  /**
   * Hunting (the `curious` tell, then `pursue`): the lamp and the eyes go from the zone's colour to
   * `color`, the ringed spots on the fore wings light up in it (`spot` = halo strength in the tell,
   * `spotKeen` in pursuit, radius x `spotR`). The tell itself is a held beat: all four wings thrown
   * wide and high (`fore`, `hind` rad, chord x `chord`) and held there on a fine shiver (`shiver`
   * rad at `shiverRate` rad/s), released into the first stroke of the swoop at `release` /s. In
   * pursuit the tail curls toward her (`tail` px) and the stroke deepens (x `stroke`).
   */
  hunt: {
    color: 0xff4630,
    spot: 0.5,
    spotKeen: 0.22,
    spotR: 1.5,
    fore: 1.22,
    hind: 0.08,
    chord: 1.08,
    shiver: 0.045,
    shiverRate: 46,
    hold: 20,
    release: 11,
    /**
     * Through the tell (36 frames): the fore wings creep `rise` rad higher and the hind ones `spread` lower,
     * the shiver grows by x(1 + `shiverUp`), lamp and spots flash in `beats` quickening beats (`countPow`,
     * between `countLow` and `countPeak` of their strength), and over its last quarter the wings lift
     * `coil` rad more as the body sinks `sink` px: the coil before the first stroke.
     */
    rise: 0.14,
    spread: 0.2,
    shiverUp: 1.6,
    beats: 5,
    countPow: 1.4,
    countLow: 0.55,
    countPeak: 1.25,
    coil: 0.16,
    sink: 3.5,
    tail: 5,
    stroke: 1.15,
    eye: 1.5,
  },
  /** [left, centre, right] zone tints: membrane at the root and the tip, the pale edge and veins, the body. */
  wingColor: [0x222c46, 0x7c5c3a, 0x2a2140] as const,
  wingTip: [0x0c1222, 0x35261a, 0x100c20] as const,
  edgeColor: [0x9db4cc, 0xc9bb98, 0xa79cc0] as const,
  bodyColor: [0x1d2436, 0x2a251d, 0x261e36] as const,
  lampColor: [0x1fb4d8, 0xf0a030, 0x8a4cf0] as const,
  color: {
    /** What a hit darkens it to. */
    dusk: 0x3a3745,
    face: 0x15111b,
    eye: 0xb4ab96,
    /** A hit: dark for the hold, then toward this for two frames. */
    pop: 0xcfc9be,
    scale: 0xbdb6a8,
  },
  wingAlpha: 0.97,
  farAlpha: 0.88,
  /**
   * A blow: for `flash` frames its edges and veins go pale (`flashColor`) on wings that have not changed
   * yet, then it goes `dark` of the way to `dusk` (a flat desaturated tone) through the hold, `pop` after.
   * A few scales fly along the cut, gone in `scaleLife` s.
   */
  hit: { dark: 0.6, pop: 0.3, flash: 2, flashColor: 0xf6eedc, scales: 4, scalesFinisher: 5, scaleLife: 0.26 },
  /**
   * The dive, acted on whatever the sim's modes are (lampwing.ts `phaseOf`).
   * Tell: it rears back from her (`rear` rad), a thin line of light from the lamp toward her (`aim` px
   * long at most, strength `aimK`, flashing with the count).
   * Swoop: the body turns head-first along its flight (`turn` of the way), stretched (`stretch`), wings
   * swept back toward the tail (`sweep` rad, length x `sweepLen`, chord x `sweepChord`), the lamp
   * dragging a streak (`streak` px + `streakV` per px/f, strength `streakK`). Full at `fast` px/f.
   * Open (the hover at the bottom of the arc, and a rest): wings spread flat and wide (`openFore`,
   * `openHind` rad) on a slow heavy beat (`openBeat` rad at `openRate` rad/s), tail hanging, eyes half
   * shut, the lamp down to `openDim`: the moment to cut it.
   * Climb (flying off): deep labouring strokes (x `climbStroke`).
   */
  dive: {
    rear: 0.32,
    aim: 120,
    aimK: 0.3,
    turn: 0.9,
    stretch: 0.2,
    sweep: -0.85,
    sweepLen: 0.92,
    sweepChord: 0.62,
    streak: 12,
    streakV: 5.5,
    streakK: 0.5,
    fast: 6,
    openFore: 0.2,
    openHind: -0.42,
    openBeat: 0.16,
    openRate: 6.5,
    openDim: 0.28,
    /** How far the membrane goes to the pale of its edge while it hangs open. */
    openPale: 0.7,
    openSag: 3,
    climbStroke: 1.3,
  },
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
  /**
   * Giving (memory/giving-render.md). Seeing her (`enemyAware`): the lamp flares x(1 + `spot`), halo
   * x(1 + `spotHalo`), fading over `spotFor` s, and the body is kicked toward her (`lean` of the shy kick).
   * Given a glint: a full shy away from her and the lamp down by `dim`, coming back over `dimFor` s.
   */
  gift: { spot: 1.8, spotHalo: 1.4, spotFor: 0.7, lean: 0.35, dim: 0.85, dimFor: 3 },
} as const;
