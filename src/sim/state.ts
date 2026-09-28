import type { Colour, MoveDir } from './events';
import type { InputFrame } from './input';
import type { Body } from './physics/aabb';
import type { Abilities, Spawn } from './world/rooms';

/** Everything the sim needs to continue. Plain JSON: no classes, Maps, typed arrays or functions. */
export interface GameState {
  version: 4;
  /** Sim steps since the state was created. The sim's only clock. */
  frame: number;
  /** Seed the RNG was last seeded with (informational; `rng` is the live RNG state). */
  seed: number;
  rng: number;
  roomId: string;
  /** Input mask consumed on the previous step, for edge detection. */
  prevInput: InputFrame;
  player: PlayerState;
  /** Set while a room transition fades out; the player is frozen until it loads the target. */
  transition: { to: string; spawn?: string; timer: number } | null;
  /** Per-visit room stats (reset when a room loads). */
  roomStats: { deaths: number; goal: boolean; optional: boolean; frames: number };
  /** Frames of global freeze left (combat-spec §2): nothing moves, presses are latched. */
  hitstop: number;
  /**
   * Room-local state (L3 brief §2.2): rebuilt from the room data by every loadRoom, which is the
   * room regeneration rule (every sound goes home when you leave). Arrays are sorted by id.
   */
  local: LocalState;
}

export type SoundStatus = 'home' | 'bag' | 'levied' | 'flight';

/** A sound (combat-spec §7): conserved; each id is in exactly one place. */
export interface Sound {
  id: number;
  /** Data name (`partition`, `bark`...). */
  name: string;
  colour: Colour;
  /** Voices come from creatures (they regrow), deeds from objects. */
  kind: 'voice' | 'deed';
  /** Source id that owns it (where it goes home to). */
  owner: number;
  status: SoundStatus;
  /** Levied entity id while levied/in flight, else 0. */
  at: number;
  /** Frames away from home (voices revoice after combat.revoiceFrames). */
  awayFrames: number;
}

export type SourceKind = 'object' | 'enemy' | 'levied';

/**
 * The one sound-source component (combat-spec §7 anti-rework rule): humming walls, furnaces,
 * static, enemies and levied objects all go through it. `rect` follows the entity for enemy and
 * levied sources. A source is armed while any of its sounds is home.
 */
export interface Source {
  id: number;
  kind: SourceKind;
  /** Entity id for enemy/levied sources (0 for objects). */
  ent: number;
  /** Room char it came from (objects). */
  char: string;
  x: number;
  y: number;
  w: number;
  h: number;
  soundIds: number[];
  /** Objects: solid while armed (humming walls, furnaces, static). */
  solidWhenArmed: boolean;
  /** Seized: dashed outline, passable. */
  ghost: boolean;
  /** Re-armed but an actor overlaps it; re-solidifies when clear (retried every step). */
  pendingSolid: boolean;
}

/** A levied sound as an Actor on the movement physics (brown slab, pink spring, violet dart). */
export interface Levied {
  id: number;
  soundId: number;
  colour: Colour;
  /** Source id of the sound's owner (Return to sender). */
  owner: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  gravityMult: number;
  phase: 'flight' | 'landed';
  /** Landed slab that has materialised (in the dynamic solid list). */
  solid: boolean;
  dmg: number;
  /** Enemy ids already hit by this throw. */
  hitList: number[];
  /** Frames left showing a spring squash (render). */
  squash: number;
}

export type EnemyMode =
  | 'PATROL'
  | 'CHASE'
  | 'TELEGRAPH'
  | 'ACTIVE'
  | 'RECOVERY'
  | 'RETRIEVE'
  | 'ABSORB'
  | 'STAGGER'
  | 'LAUNCHED'
  | 'DOWN'
  | 'COUNT'
  | 'REPOSSESSED'
  | 'RISE'
  | 'KO';

export interface Enemy {
  id: number;
  type: string;
  /** Its sound-source component. */
  source: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** Knockback velocity (px/f), decays by combat.enemyKbDecay. */
  kb: number;
  facing: 1 | -1;
  grounded: boolean;
  state: EnemyMode;
  stateFrame: number;
  hp: number;
  /** Current / last attack id ('' = none). */
  attackId: string;
  /** Last attack started (no immediate repeat). */
  lastAttack: string;
  /** Frames before another attack may start. */
  cooldown: number;
  /** Frames the voices stay open after a punch. */
  rattled: number;
  /** Stagger / launch / down frames left for the current state. */
  timer: number;
  /** Count beat (1..countBeats) while in COUNT. */
  beat: number;
  /** Holds an attack token (TELEGRAPH/ACTIVE). */
  token: boolean;
  /** Sound id being retrieved (0 = none). */
  target: number;
  /** Charge distance travelled, or telegraph backstep done (px). */
  travel: number;
  furious: boolean;
  /** Hit list of the current attack instance (only Kid, id 0). */
  hitList: number[];
}

export interface Plate {
  char: string;
  /** Tile coords [tx, ty] pairs, flattened. */
  tiles: number[];
  pressed: boolean;
  by: '' | 'slab' | 'heavy';
}

export interface Gate {
  char: string;
  tiles: number[];
  open: boolean;
  opensOn: 'plate' | 'clear';
}

export interface LocalState {
  nextId: number;
  sources: Source[];
  sounds: Sound[];
  /** Sound ids, oldest first. */
  bag: number[];
  levied: Levied[];
  enemies: Enemy[];
  plates: Plate[];
  gates: Gate[];
  /** Every enemy KO'd or repossessed (and there were enemies). */
  clear: boolean;
}

/** A move in progress (content/moves.json). `frame` 1 is the press-consuming step. */
export interface MoveState {
  id: string;
  frame: number;
  dir: MoveDir;
  facing: 1 | -1;
  outcome: 'none' | 'take' | 'whiff' | 'guard' | 'refused' | 'hit';
  /** Target ids already hit by this instance. */
  hitList: number[];
}

/** Controller states (movement-spec §2.1). POGO is an impulse inside 'normal', not a state. */
export type PlayerMode = 'normal' | 'wallSlide' | 'dash' | 'dead';

export interface PlayerState extends Body {
  /** px/f, +y is down. */
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: PlayerMode;
  /** Ended the last frame standing on ground (solid or one-way). */
  grounded: boolean;
  /** Wall touching on that side (1 px probe): -1, 0 or 1. While sliding, the slide side. */
  wallDir: number;
  /** Ability gates. Rooms grant/deny these on load; the debug API can override. */
  abilities: Abilities;
  /** Movement profile name ('base' or a key of tuning.profiles). */
  profile: string;

  // Timers: N means N more usable frames. Used before they are decremented (spec §2.2).
  coyote: number;
  jumpBuf: number;
  /** Separate window for a buffered press to become a double jump (HK preset queues longer). */
  djBuf: number;
  dashBuf: number;
  /** Wall-jump forced-vx frames left, and the forced direction. */
  forceTimer: number;
  forceDir: number;
  dashCd: number;
  /** Dash frames left (moving frames), and freeze frames left (hitstop-style: nothing moves). */
  dashTimer: number;
  dashDir: number;
  freeze: number;
  /** Frames holding away from the wall while sliding. */
  stick: number;
  /** Frames in the current wall slide (the slide speed cap ramps up with it). */
  slideT: number;
  /** Wall speed retention (spec §2.4): vx that a wall zeroed, restorable for retainTimer frames. */
  retainVx: number;
  retainTimer: number;
  /** Drop-through: one-ways are ignored while dropTimer > 0 and top <= dropY. */
  dropTimer: number;
  dropY: number;
  pogoTimer: number;
  deathTimer: number;

  // Jump model (spec §2.5).
  /** Rising from a jump that release can cut. */
  fromJump: boolean;
  /** Released early: extra gravity (or vy = 0 in releaseMode 'zero') until the apex. */
  cut: boolean;
  /** Fixed-height bounce (pogo): jump release has no effect until the apex. */
  cutDisabled: boolean;
  /** Preset-only sustain (Celeste VarJumpTime): frames left holding vy at sustainV. */
  sustain: number;
  sustainV: number;
  framesSinceJump: number;

  /** Air dashes and double jumps left this airtime. */
  airDash: number;
  dj: number;

  /** Highest point (min y) since leaving the ground, for land.fallPx. */
  airTopY: number;
  /** Grounded distance since the last footstep event. */
  stepDist: number;
  /** Turning around on the ground (for the skid event's rising edge). */
  skid: boolean;
  /** Last respawn marker touched (null = the room's P). */
  respawn: Spawn | null;

  // L3 combat foundations.
  move: MoveState | null;
  /** Newest buffered action press (combat.actionBufferFrames). */
  actBuf: { id: string; frames: number } | null;
  chin: number;
  iframes: number;
  hurtLock: number;
  /** Kid recoil after a punch lands (px/f) and frames left. */
  recoilVx: number;
  recoilT: number;
}

/** Deep copy via JSON, which also guarantees the state stays plain JSON. */
export function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}
