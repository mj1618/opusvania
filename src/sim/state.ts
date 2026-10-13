import type { InputFrame } from './input';
import type { EnemyKind } from './scene';

/**
 * The whole sim state: plain JSON (finite numbers, strings, booleans, null), so it can be cloned,
 * hashed and compared. The scene is static and lives outside it.
 */

/** Controller state machine. */
export type PlayerMode = 'normal' | 'wallSlide' | 'dash';

/**
 * What the body is doing, for animation: derived at the end of every step from mode, ground
 * contact, velocity and input. `dash` includes the freeze frames at its start. `glide` is the wing
 * glide (mode stays 'normal', `gliding` is true).
 */
export type Motion = 'idle' | 'run' | 'skid' | 'rise' | 'fall' | 'glide' | 'wallSlide' | 'dash';

/** The thorn slash's direction; 'none' when she is not slashing. */
export type AttackDir = 'none' | 'fwd' | 'up' | 'down';

export interface PlayerState {
  // --- Body. (x, y) is the top-left of the collision box, integers. Feet centre = (x + w/2, y + h).
  x: number;
  y: number;
  /** Sub-pixel remainders in [-0.5, 0.5]. */
  rx: number;
  ry: number;
  w: number;
  h: number;
  /** Velocity in px/frame (x60 = px/s). vy > 0 is down. */
  vx: number;
  vy: number;

  // --- What an animator reads.
  facing: -1 | 1;
  mode: PlayerMode;
  /** Frames since `mode` last changed. */
  modeFrames: number;
  motion: Motion;
  /** Frames since `motion` last changed (0 on the frame it changes). */
  motionFrames: number;
  grounded: boolean;
  /** Frames since `grounded` last changed: time on the ground, or time in the air. */
  contactFrames: number;
  /** A solid is touching this side: -1 left, 1 right, 0 none. While wall sliding, the slide side. */
  wallDir: number;
  /** Held horizontal input this step: -1, 0, 1. */
  inputX: number;
  /** Braking against ground momentum. */
  skid: boolean;
  /** Dash direction (valid in mode 'dash') and frames of dash travel left. */
  dashDir: number;
  dashTimer: number;
  /** Freeze frames left (dash start: the body hangs before it moves). */
  freeze: number;
  /** Air dashes and double jumps left this airtime. */
  airDash: number;
  dj: number;
  /**
   * Highest point (smallest y) of the current airtime. A glide carries her, so it restarts the
   * count: after a glide this is where the wings last let go (a glided landing is never `hard`).
   */
  airTopY: number;
  /** Wing glide: wings open, sinking slowly (jump held while falling). `motion` is 'glide'. */
  gliding: boolean;
  /**
   * Thorn slash. `attack` is its direction from the `slash` event until `slashEnd` ('none'
   * otherwise); it and `attackFacing` (the side she faced when it started; a fwd slash goes that
   * way) never change mid-slash, whatever she does. `attackFrames` counts steps since it started
   * (0 on the `slash` frame; it holds during hitstop). `attackActive`: the hit area is live this
   * frame. `attackSeq` numbers the slashes (0 = none yet); `attackHits` = targets this one has hit.
   */
  attack: AttackDir;
  attackFacing: -1 | 1;
  attackFrames: number;
  attackActive: boolean;
  attackSeq: number;
  attackHits: number;
  /**
   * Combo step of the current (or last) slash: 1 the cut, 2 the return cut, 3 the finisher
   * (`attackFinisher`). A down slash is always step 1 and leaves the chain where it was.
   */
  attackStep: number;
  attackFinisher: boolean;
  /**
   * Lunge: extra horizontal px/f on top of `vx` from a forward slash on the ground, fading over a
   * few frames (signed: the slash's side). `hang`: frames left of the air hang of a forward / up
   * slash, while her fall is being held back.
   */
  lungeX: number;
  hang: number;
  /**
   * Hitstop frames left: a slash connected and the sim holds her for a beat (no movement, no
   * timers, `attackFrames` / `motionFrames` stand still; presses are still buffered). The rest of
   * the sim (pickups, pod glints, the frame count) and render time keep running.
   */
  hitstop: number;
  /** Recoil: extra horizontal px/f on top of `vx` (a shove from a slash that hit), fading fast. */
  kickX: number;
  /**
   * Health (memory/enemies.md). `hp` of `hpMax` lights. `invuln`: frames left in which nothing can
   * hurt her (she passes through enemies). `stagger`: frames left of the knockback after a hit,
   * while she is out of control (`hurtDir` = the way she was thrown, -1 / 1; `hurtSeq` counts the
   * hits taken). `faded`: at no health, frames left until she re-forms at the last safe ground
   * (no control; she falls and lies where the blow left her). All three are 0 in ordinary play.
   */
  hp: number;
  hpMax: number;
  invuln: number;
  stagger: number;
  faded: number;
  hurtDir: number;
  hurtSeq: number;
  /** Index of the lantern she is kindling this frame (`scene.lanterns`), -1 = none (memory/goal.md). */
  kindling: number;
  /** Last safe ground (feet centre): where she re-forms. `safeFrames` = frames in a row on safe ground. */
  safeX: number;
  safeY: number;
  safeFrames: number;

  // --- Controller internals (timers, buffers). Renderers should not need these.
  coyote: number;
  jumpBuf: number;
  djBuf: number;
  dashBuf: number;
  forceTimer: number;
  forceDir: number;
  dashCd: number;
  stick: number;
  slideT: number;
  retainVx: number;
  retainTimer: number;
  dropTimer: number;
  dropY: number;
  fromJump: boolean;
  cut: boolean;
  sustain: number;
  sustainV: number;
  framesSinceJump: number;
  stepDist: number;
  /** The current jump hold launched a ground-type jump, from this y (glide: see `carriedDropPx`). */
  carried: boolean;
  launchY: number;
  /** Slash: buffered press, and frames until the next one may start. */
  attackBuf: number;
  attackCd: number;
  /** Combo: the step the chain is on (0 = none), frames left to continue it, hangs used this airtime (bits). */
  comboStep: number;
  comboTimer: number;
  hangUsed: number;
}

/** A cluster of dropped glints (see `PickupsState.drops`). */
export interface GlintDrop {
  id: number;
  x: number;
  y: number;
  value: number;
  left: number;
  timer: number;
}

/** Collectibles (src/sim/pickups.ts). */
export interface PickupsState {
  /**
   * One entry per `scene.pickups`, same order: 0 = waiting, n > 0 = woken and on its way (it is
   * collected in n more steps), -1 = collected.
   */
  timers: number[];
  /**
   * The wallet: the value she carries now (a great glint counts for more than one). Everything
   * gathered goes in; kindling a lantern takes its cost out (`spent`).
   */
  count: number;
  /** Value spent on lanterns so far. `count + spent + lost` = everything gathered this run. */
  spent: number;
  /** Value lying in dropped clusters (`drops`), still to be picked up again. */
  lost: number;
  /**
   * Clusters of glints she dropped when she faded, oldest first: `id` (1, 2, ...), where it lies
   * (`x`, `y` = its centre), `value` = what it held, `left` = glints not yet back with her, `timer`
   * = 0 while it lies there, else frames until the next of them reaches her. Removed when `left`
   * is 0; kept through fades (a second fade adds another); gone on a restart.
   */
  drops: GlintDrop[];
  /** Clusters dropped so far (the next one's id - 1). */
  dropSeq: number;
  /** How many pickups have been collected. */
  taken: number;
  /** Index of the last pickup in the current chain (0 = first), and frames left to extend it. */
  combo: number;
  comboTimer: number;
  /** Frames until the collect queue is free: keeps pickups woken together from landing together. */
  gate: number;
}

/** Lumen pods (src/sim/pods.ts). Every array has one entry per `scene.pods`, same order. */
export interface PodsState {
  /**
   * Hit points left; 0 = burst and open (until the scene restarts). It starts at the pod's `hp`
   * in the scene (default 1), which is its `hpMax`.
   */
  hp: number[];
  /** `attackSeq` of the last slash that hit it (one hit per slash). */
  hitBy: number[];
  /**
   * Glints set loose and still on their way to her, frames until the next one arrives, the gap
   * between them, and how many of the pod's worth have been set loose so far.
   */
  left: number[];
  timer: number[];
  gap: number[];
  paid: number[];
  /** How many pods have burst. */
  burst: number;
}

/**
 * What an enemy is doing. Every kind: `hurt` (staggered by a hit), `dead`.
 * Burrback: `walk`, `pause` (standing: a turn-around if `turning`, else a rest), `alert` (a flinch).
 * Lampwing: `hover` (wandering round its home), `curious` (it has noticed her: the tell), `pursue`
 * (drifting after her), `rest` (it has given up, or just touched her: it hangs where it is),
 * `return` (flying home; it notices nothing until it is there).
 */
export type EnemyMode =
  | 'walk'
  | 'pause'
  | 'alert'
  | 'hover'
  | 'curious'
  | 'pursue'
  | 'rest'
  | 'return'
  | 'hurt'
  | 'dead';

/**
 * One enemy (src/sim/enemies.ts). `GameState.enemies[i]` belongs to `scene.enemies[i]`. One flat
 * record for every kind (plain JSON): a field a kind does not use stays at its start value.
 */
export interface EnemyState {
  id: string;
  kind: EnemyKind;
  // --- Body. (x, y) is the top-left of its box, integers; feet centre = (x + w/2, y + h).
  x: number;
  y: number;
  w: number;
  h: number;
  /** Sub-pixel remainders of its movement. */
  rx: number;
  ry: number;
  /**
   * Velocity this step, px/f. Burrback: the walk (facing x speed) or the knockback, 0 when it
   * stands; `vy` is always 0. Lampwing: its flight (its own drift; while `hurt` / `dead` the
   * knockback and the fall).
   */
  vx: number;
  vy: number;
  /** The way it faces (a lampwing: the way it looks, toward what draws it). */
  facing: -1 | 1;
  hp: number;
  hpMax: number;
  mode: EnemyMode;
  /** Frames since `mode` last changed (0 on the frame it changes; it holds during `hitstop`). */
  modeFrames: number;
  /** Frames left of a timed mode (pause, alert, curious, rest, hurt, dead); 0 otherwise. */
  timer: number;
  /** Where it started: the centre of its box then (a lampwing's home, the middle of its territory). */
  homeX: number;
  homeY: number;
  /** The current pause is a turn-around (`facing` flipped when it began). Burrback. */
  turning: boolean;
  /** Distance walked so far, px (walking only, never knockback): drive the legs with it. Burrback. */
  stride: number;
  /** Knockback left, px/f (signed), fading; it moves the body while hurt or dead. */
  knockVx: number;
  knockVy: number;
  /** Frames it is held still by a hit (the same beat the player holds). */
  hitstop: number;
  /** The last hit: slash number, direction of the shove (-1 / 0 / 1), power, and the sim frame (-1 = never). */
  hitBy: number;
  hitDir: number;
  hitPower: number;
  hitFrame: number;
  /** Side of the ledge a shove pushed it to the brink of (-1 / 1), until it walks again; else 0. Burrback. */
  teeter: number;
  /** Dead and its body has been removed: draw nothing. */
  gone: boolean;
  /**
   * Lampwing: what it is drawn to, in scene px: its wander point while it hovers, her body centre
   * (where it last saw her) while `curious` / `pursue`, its home on the way back. `lookX, lookY` =
   * the unit vector from its centre toward that (0, 0 before it has one).
   */
  targetX: number;
  targetY: number;
  lookX: number;
  lookY: number;
  /**
   * Lampwing: wing-beat phase in [0, 1), one unit = one full beat. The sim advances it every step
   * at a rate that follows its effort (slow in a hover, faster in pursuit, a flutter while
   * `curious`, nearly still while tumbling; it stands still in a hitstop and once dead).
   */
  flap: number;
  /** Lampwing: the dead body has come to rest on something (it is `gone` a few frames later). */
  landed: boolean;
  // --- Internals.
  /** Frames until it may flinch again; frames of walking until its next rest; rests taken; schedule salt. */
  alertCd: number;
  walkLeft: number;
  rests: number;
  salt: number;
  /** Lampwing: territory radius; frames of this pursuit so far; frames since it last saw her. */
  radius: number;
  chase: number;
  lost: number;
  /** Lampwing: wander points drawn so far, frames until the next, the side its wander is mirrored to. */
  wander: number;
  wanderLeft: number;
  side: number;
  /** Lampwing: the push away from other lampwings this step, px/f². */
  pushX: number;
  pushY: number;
  /** Frames left of a calm (a lantern was kindled near it, or the run ended): its touch does nothing meanwhile. */
  calm: number;
  /** Glints spilled on death still on their way to her, frames to the next, and the gap between them. */
  spill: number;
  spillTimer: number;
  spillGap: number;
}

/** One moth-lantern (src/sim/goal.ts). `GameState.goal.lanterns[i]` belongs to `scene.lanterns[i]`. */
export interface LanternState {
  /** Kindled: it burns until the scene restarts (a fade / re-form does not put it out). */
  lit: boolean;
  /** The sim frame it was kindled on, -1 while dormant (glow-up from `sim.frame - litFrame`). */
  litFrame: number;
  /** Frames she has stood at it kindling, 0 = not being kindled (of `tuning.goal.channelFrames`). */
  channel: number;
  /** Lit: frames she has stood at it hurt, toward being made whole (of `tuning.goal.restFrames`). */
  rest: number;
  /** Frames she has stood still at it carrying too little (it tells her at `tuning.goal.refuseFrames`). */
  short: number;
  /** It has told her she carries too little; it will not again until she has gone away and come back. */
  refused: boolean;
}

/** The goal of the scene (src/sim/goal.ts, memory/goal.md): the lanterns, the heart, the ending. */
export interface GoalState {
  lanterns: LanternState[];
  /** How many are lit. */
  lit: number;
  /** The lit lantern she last stood at: where she re-forms (index into `scene.lanterns`), -1 = none yet. */
  restAt: number;
  /**
   * The heart of the grove. `awake` once every lantern is lit; `frames` counts up from the frame
   * it woke (0 while asleep); `hinted`: she has walked up to it asleep (`heartSleep` fired).
   */
  heart: { awake: boolean; frames: number; hinted: boolean };
  /** She has reached the woken heart (`gather`): control is taken and nothing can hurt her. */
  gathered: boolean;
  /**
   * The ending hold: `frames` since `gather` (it stops at `tuning.goal.holdFrames`), and the run's
   * summary as the `gather` event gave it (all 0 until then).
   */
  ending: {
    frames: number;
    glints: number;
    time: number;
    kills: number;
    hits: number;
    /** The tally: what there was to find (`...Total`) against what she found, and how often she faded. */
    glintsTotal: number;
    pods: number;
    podsTotal: number;
    greats: number;
    greatsTotal: number;
    enemiesTotal: number;
    deaths: number;
  };
  /** The hold is over (`endHold`): the scene stays calm until the restart. */
  ended: boolean;
  /** The run so far: the frame of her first input (-1 = none yet), the hits she has taken, the times she faded. */
  run: { start: number; hits: number; deaths: number };
}

export interface GameState {
  version: 13;
  /** Sim steps taken. The sim's only clock. */
  frame: number;
  seed: number;
  /** Seeded RNG state (src/sim/rng.ts). */
  rng: number;
  prevInput: InputFrame;
  player: PlayerState;
  pickups: PickupsState;
  pods: PodsState;
  enemies: EnemyState[];
  goal: GoalState;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    pickups: {
      ...s.pickups,
      timers: s.pickups.timers.slice(),
      drops: s.pickups.drops.map((d) => ({ ...d })),
    },
    pods: {
      hp: s.pods.hp.slice(),
      hitBy: s.pods.hitBy.slice(),
      left: s.pods.left.slice(),
      timer: s.pods.timer.slice(),
      gap: s.pods.gap.slice(),
      paid: s.pods.paid.slice(),
      burst: s.pods.burst,
    },
    enemies: s.enemies.map((e) => ({ ...e })),
    goal: {
      ...s.goal,
      lanterns: s.goal.lanterns.map((l) => ({ ...l })),
      heart: { ...s.goal.heart },
      ending: { ...s.goal.ending },
      run: { ...s.goal.run },
    },
  };
}
