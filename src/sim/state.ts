import type { Colour, HitClass, MoveDir } from './events';
import type { InputFrame } from './input';
import type { Body } from './physics/aabb';
import type { Abilities, Spawn } from './world/rooms';

/** Everything the sim needs to continue. Plain JSON: no classes, Maps, typed arrays or functions. */
export interface GameState {
  version: 5;
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
  transition: {
    to: string;
    spawn?: string;
    timer: number;
    /** Edge exit: px to subtract from the body's position on arrival (the target room's origin minus this one's). */
    offset?: [number, number];
  } | null;
  /** Per-visit room stats (reset when a room loads). */
  roomStats: { deaths: number; goal: boolean; optional: boolean; frames: number };
  /** Frames of global freeze left (combat-spec §2): nothing moves, presses are latched. */
  hitstop: number;
  /**
   * This step's hitstop requests, max-merged (combat-spec §2). Cleared at the start of every
   * non-frozen step and after it is applied, so it is always empty between steps (L3 audit #4:
   * no module-level request state).
   */
  hitstopReq: { frames: number; cls: HitClass };
  /** Persists across rooms: Poundage, the Corner, the Runner/Lien, Beat-the-Count use (combat-spec §3.5). */
  run: RunState;
  /**
   * Room-local state (L3 brief §2.2): rebuilt from the room data by every loadRoom, which is the
   * room regeneration rule (every sound goes home when you leave). Arrays are sorted by id.
   */
  local: LocalState;
}

/**
 * Where a sound is. `consumed` = swallowed (the owner is Hoarse until the room reloads);
 * `held` = bought by a boss (Selling Your Bag), `at` = the enemy id; it goes home once he uses it.
 */
export type SoundStatus = 'home' | 'bag' | 'levied' | 'flight' | 'consumed' | 'held';

/** Run-level state (survives room loads; combat-spec §3.4-3.5). */
export interface RunState {
  poundage: number;
  /** `garnish` death mode: Poundage owed, paid from 50% of future earnings. */
  debt: number;
  /** Chin pips under a Lien (max Chin is reduced by this until the Runner is caught). */
  lien: number;
  /** The Runner holding your Poundage and Lien, waiting in the room (and spot) where you went down. */
  runner: { roomId: string; poundage: number; lien: number; x: number; feetY: number } | null;
  /** Last Corner rested at (where a counted-out Kid wakes up). */
  corner: { roomId: string; spawn: string };
  /** Beat the Count already used since the last Corner visit. */
  beatUsed: boolean;
  /** Times counted out this session. */
  countedOut: number;
  /** Every death this session (hazard deaths in gym rooms + counted outs): the HUD's counter, never reset by a room reload. */
  deaths: number;
  /** World fever (combat-spec C9): a debug integer in Phase 2. */
  fever: number;
}

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

export type SourceKind = 'object' | 'enemy' | 'levied' | 'shot';

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
  /** Objects Kid can't seize although they hum (the Auctioneer's lots: "under the hammer"). */
  locked?: boolean;
  /** Frames left ghosted by a SOLD (the Auctioneer's Cadence); a ghost regardless of its sounds. */
  soldT?: number;
}

/**
 * An enemy projectile or hanging object (combat-spec §1.4 rule 1: every projectile carries its
 * owner's sound, so it can be caught). The sound stays `home` while the shot flies; a Seize on the
 * shot takes it (disarming that attack). Shots are sources too (kind 'shot').
 */
export interface Shot {
  id: number;
  /** Enemy id that fired it, its source id, the sound it carries and the attack it belongs to. */
  enemy: number;
  owner: number;
  soundId: number;
  attackId: string;
  /** dart | mortar | wave | ring | word | slab. */
  kind: string;
  colour: Colour;
  x: number;
  y: number;
  rx: number;
  ry: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** px/f² added to vy each step. */
  gravity: number;
  dmg: number;
  /** Frames left; 0 = removed at the end of the step. */
  life: number;
  age: number;
  seizable: boolean;
  /** Already hit Kid (one hit per shot). */
  spent: boolean;
  /** Mortar: on landing it becomes a shockwave of this size for `waveFrames`. */
  landW: number;
  landH: number;
  landFrames: number;
  /** Words: follow Kid's head with a lag (Selling Your Bag), else hang in place. */
  follow: boolean;
  born: number;
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
  /** state.frame of the spawn step: it doesn't move that step, so the spawn position is hit-tested. */
  born: number;
  /** Frames left before it flies home (violet darts: levy.violetLife; 0 = no limit). */
  life: number;
  /** Ricochets left (violet darts bounce once off a solid). */
  bounces: number;
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
  | 'KO'
  | 'FLINCH'
  | 'HOP'
  | 'FLEE';

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
  /** Voices swallowed from it: those attacks are gone for the visit, it stops retrieving (§3.4). */
  hoarse: boolean;
  /** Home point (flyers hover around Kid; walkers patrol). Bob phase for flyers. */
  homeX: number;
  homeY: number;
  /** Locked aim (dive vector, mortar target) in px/f or px. */
  aimX: number;
  aimY: number;
  /** Projectiles left to fire in this attack, and frames to the next. */
  shotsLeft: number;
  shotT: number;
  /** Seizes the Runner still slips (combat-spec §3.5). */
  slips: number;
  /** Poundage it pays on a KO (x2 on a repossession). */
  poundage: number;
  /** Boss-only state (the Auctioneer), else null. */
  boss: BossState | null;
}

/** The Auctioneer's own state (combat-spec §5). */
export interface BossState {
  phase: 1 | 2;
  /** Actions started (Cadence is forced every 3rd). */
  actions: number;
  /** Lot indices marked by the current Cadence (-1 = none). */
  lots: number[];
  /** Cadence beat (1..3) while calling. */
  beat: number;
  /** Shot id of the hanging TWICE word (0 = none). */
  word: number;
  /** Phase 1 ended with the Gavel repossessed: phase 2 loses Gavel and the SOLD wave. */
  noGavel: boolean;
  /** Sound id bought by Selling Your Bag, used by his next action (0 = none). */
  bought: number;
  /** Final knockdown reached (a Seize now wins). */
  final: boolean;
  /** Target x for Hop / the pink spring. */
  hopTo: number;
  /** Pips Selling Your Bag charges this step (an empty bag pays in Chin); applied with the hits on Kid. */
  charge: number;
  /** Frames his voices stay guarded after a Return to sender (no grab-throw stagger lock). */
  guardT: number;
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
  shots: Shot[];
  plates: Plate[];
  gates: Gate[];
  /** Every enemy KO'd or repossessed (and there were enemies). */
  clear: boolean;
  /** Room fever (0..4): the Count's beat and boss tempo (combat-spec C9). */
  fever: number;
  /** Frames Kid has spent in a white-static zone (the bag leaks every combat.staticLeakFrames). */
  staticT: number;
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
  /** Total frames for this instance when the data can't know it up front (Swallow's channel), else 0. */
  len: number;
  /** A Counter (a strike inside the clean-slip window): x2 damage, knockdown, bigger box. */
  counter: boolean;
  /** Swallow: the sound being eaten. */
  soundId: number;
}

/** Controller states (movement-spec §2.1). POGO is an impulse inside 'normal', not a state. */
export type PlayerMode = 'normal' | 'wallSlide' | 'dash' | 'dead';

/** Kid's own Count after Chin runs out (combat-spec §3.5): Beat the Count or be Counted Out. */
export interface KidCount {
  /** Frames since she went down. */
  t: number;
  beat: number;
  /** Beat the Count is possible (unused since the Corner and a voice in the bag). */
  canRise: boolean;
  /** The one press was used (a mash counts as one press). */
  pressed: boolean;
}

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
  /** Newest buffered action press: the button (`attack|seize|levy|special`), resolved to a move on the start frame. */
  actBuf: { id: string; frames: number } | null;
  chin: number;
  /** Max Chin (kid.chin minus any Lien). */
  chinMax: number;
  iframes: number;
  hurtLock: number;
  /** Ringing (combat-spec §3.2): frames the last lost pip can still be won back. */
  ring: number;
  /** Counter window frames left after a clean Slip (combat-spec C4). */
  counter: number;
  /** This Slip already registered clean. */
  slipClean: boolean;
  /** Last safe ground (feet-centre px) for hazard respawns (combat-spec §3.1). */
  safeX: number;
  safeY: number;
  /** The respawn after this death freeze is a hazard respawn at safe ground (not a death). */
  hazardRespawn: boolean;
  /** Down for the Count (Chin 0), else null. */
  down: KidCount | null;
  /** Kid recoil after a punch lands (px/f) and frames left. */
  recoilVx: number;
  recoilT: number;
}

/** Deep copy via JSON, which also guarantees the state stays plain JSON. */
export function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}
