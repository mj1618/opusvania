import type { AbilityId } from './abilities';
import type { InputFrame } from './input';
import { cloneKit, type KitState } from './kit';
import { cloneLight, type LightState } from './light-state';
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
   * frame. `attackSeq` numbers the slashes (0 = none yet); `attackHits` = targets this one has hit;
   * `attackWall`: this one has met terrain (`slashTerrain`, once per slash).
   */
  attack: AttackDir;
  attackFacing: -1 | 1;
  attackFrames: number;
  attackActive: boolean;
  attackSeq: number;
  attackHits: number;
  attackWall: boolean;
  /** The throw-cut: this slash started during a lamp throw's launch and hits heavy (`attack.throwCutPower`). */
  attackHeavy: boolean;
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
  /**
   * After a hazard return or a re-form (`room.returnFadeIn`): `fadeIn` = frames left of the fade-in (no
   * input reaches her, she cannot be hurt); `inputLock` = the input bits held as she came back: none is a
   * press until it is let go (a fresh press then counts); its hold still acts. Both 0 in ordinary play.
   */
  fadeIn: number;
  inputLock: number;
  /** Index of the lantern she is kindling this frame (`scene.lanterns`), -1 = none (memory/goal.md). */
  kindling: number;
  /** The same for a wayside lamp (`scene.lamps`), -1 = none. Never both at once. */
  kindlingLamp: number;
  /**
   * Lures (src/sim/lures.ts, memory/lures.md). `lure` = index of the lure whose core holds her (-1 =
   * none): she circles the flame and her moves are replaced by beating free (`lureFrames` since it
   * caught her, `lureBeats` pressed so far, `lureOut` = px her circle is pushed out by them, sinking
   * back; `lureCd` frames until the next beat counts). `pullX` = the pull's sideways momentum, on top
   * of `vx` in the move (her steering never eats it, so a pass through a field throws her).
   * `lureGrace` = the lure she last broke free of, which leaves her alone for `lureGraceFrames` more
   * (cores a throw passes through get theirs in `lures.grace`). `lureAimX, lureAimY` = the unit direction
   * the last beat would throw her now (set every caught frame: render's throw arrow). `lureThrow` = frames
   * left of the throw's window in which any core she passes through is given grace. `lureCore` = frames
   * in a row her centre has been inside a burning core without being caught (a core catches her moving
   * inward, or after `lures.catchFrames`).
   */
  lure: number;
  lureFrames: number;
  lureBeats: number;
  lureOut: number;
  lureCd: number;
  /** Beats pressed and not yet counted (a mash faster than `beatCd` waits here). */
  lurePend: number;
  pullX: number;
  lureGrace: number;
  lureGraceFrames: number;
  lureAimX: number;
  lureAimY: number;
  /**
   * The fling (memory/lures.md): `fling` = the lure she is aiming off (-1 = none), `flingFrames` = how long (the
   * world slows meanwhile), `flingCd` = frames before the next can start. While aiming `lureAimX/Y` is the aim
   * and `lureArc` the flight it gives. (`lure` and the beat fields are the old catch's: always -1 / 0 now.)
   */
  fling: number;
  flingFrames: number;
  flingCd: number;
  /** Where the fling chain began (her last ground before its first launch): landing back there is a miss. */
  chainX: number;
  chainY: number;
  lureThrow: number;
  lureCore: number;
  /** The way she came into the lure that holds her (-1 / 1): with nothing held the throw sends her back that way. */
  lureBack: number;
  /**
   * While caught: the flight the last beat would give her now, body-centre points `lures.arcEvery` frames
   * apart (flat `[x0, y0, x1, y1, ...]`, from the real controller on a copy of the state: walls, other
   * lures' pull). Empty when not caught. Render draws the throw's arc from it.
   */
  lureArc: number[];
  /** A throw's flight, from the last beat until she lands or jumps: no apex hang (one strength, held jump or not). */
  thrown: boolean;
  /**
   * The glide-lip assist (a catch zone's `glideAssist`): `wingsAssist` = she is over such a zone this step
   * (set by `step`); `wingsHeld` = her wings were opened by it and stay open without the button until she
   * lands, presses Down, dashes or meets a wall.
   */
  wingsAssist: boolean;
  wingsHeld: boolean;
  /**
   * A grab (src/sim/grab.ts, memory/creatures.md): `grab` = index of the creature (a web: `enemies[i]`)
   * holding her, -1 = none. Held where it caught her (`grabX, grabY` = her body centre then); beating
   * free uses the lure counters above (`lureFrames`, `lureBeats`, `lureCd`, `lurePend`). `grabGrace`
   * = frames nothing may grab her again (after a throw or a blow).
   */
  grab: number;
  grabX: number;
  grabY: number;
  grabGrace: number;
  /**
   * How lit she is by the lures' light (memory/creatures.md): 0 = dark, up to 1 at a flame's core.
   * In a lamp room a sight hunter sees her only while it is above 0. Set every step.
   */
  lit: number;
  /**
   * Lanternroot's light (src/sim/light.ts, memory/glow.md; only in rooms with `scene.glow`). `glow` = the light
   * she carries, in sparks (0 .. `glow.max`, kept through rooms; a fade drops all of it). `moonlit` = how lit she
   * is by burning moonwicks (0 .. 1, like `lit`): hawkers and danglers start no strike at her while it is above 0.
   * `mend` = frames of a mend's channel (0 = none; it lands at `glow.mendFrames`), `lampHold` = frames the Lamp
   * button has been held with nothing in reach (-1: the press went to a fling or a kindle), `gustCd` = frames
   * before the next gust, `gustHop` = 1 while the air hop is still hers this airtime.
   */
  glow: number;
  moonlit: number;
  mend: number;
  lampHold: number;
  gustCd: number;
  gustHop: number;
  /**
   * Being seen (src/sim/giving.ts, memory/giving.md): the creatures notice her by the light she
   * carries. `seenLevel` 0-4 (0 = she carries nothing: unseen; the steps are `tuning.giving.seen1..4`
   * of her wallet), `seen` = the same as 0..1 (level / 4). Set at the end of every step from
   * `pickups.count`; the creatures read the wallet as it stands when they move.
   */
  seen: number;
  seenLevel: number;
  /**
   * Offer (the `offer` action): `offering` = frames left of her holding a glint out (the pose; 0 =
   * none), `offerSeq` numbers her offers. The glint in flight: `giftTo` = what it goes to (`''` none,
   * `enemy`, `lantern`, `lamp`, `heart`), `giftIndex` its index in the scene's list, `giftTimer`
   * frames until it arrives, `giftX, giftY` the point it flies to (as it was when she gave it).
   */
  offering: number;
  offerSeq: number;
  giftTo: '' | 'enemy' | 'lantern' | 'lamp' | 'heart';
  giftIndex: number;
  giftTimer: number;
  giftX: number;
  giftY: number;
  /** Offer: a buffered press, and frames until the next offer may go; frames the button has been held (the stream). */
  offerBuf: number;
  offerCd: number;
  offerHold: number;
  /**
   * What a press of offer would land on THIS frame (the same rules as the offer: `offerTarget` in
   * src/sim/giving.ts), `{kind: burrback | lampwing | lantern | lamp | heart, id}`, or null (nothing in
   * reach, empty hands, out of control, the run over). Set at the end of every step. The HUD's offer
   * cap shows only while this is a creature (a press never meets "nothing in reach").
   */
  offerTarget: { kind: string; id: string } | null;
  /** The flight of the glint now in the air, frames in all (`giftTimer` counts it down): 3 to a lampwing after her, 8 to a light, 10 to a creature. */
  giftFrames: number;
  /** Last safe ground (feet centre): where she re-forms. `safeFrames` = frames in a row on safe ground. */
  safeX: number;
  safeY: number;
  safeFrames: number;
  /**
   * The last ground she stood on that passes the same checks, for any length of time (feet centre): where a
   * fall catch or thorns put her back (inset from its lip), so a fall costs the gap, not the stretch behind
   * it (first-timers on wood-hatch, 2026-10-17: put back behind S1's burl after every fall from S2).
   */
  groundX: number;
  groundY: number;

  // --- Controller internals (timers, buffers). Renderers should not need these.
  coyote: number;
  jumpBuf: number;
  djBuf: number;
  dashBuf: number;
  forceTimer: number;
  /** Frames left of a wall kick's rise that letting go of jump cannot cut (`tuning.wall.kickFrames`). */
  kick: number;
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
  /** Lanternroot: her glow dropped at a fade (it comes back as glow, not into the wallet). */
  glow?: boolean;
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
  /**
   * Value spent so far: on lanterns, lamps, rests, and given by hand (the `offer` action) to
   * creatures and to dormant lights. `count + spent + lost + offered` = everything gathered this run.
   */
  spent: number;
  /** Of `spent`: glints she gave by hand to creatures (memory/giving.md). */
  gifted: number;
  /** Value given to the heart: by hand during the run (`goal.heartGiven`), and all she carries at the end (memory/goal.md: the offering). */
  offered: number;
  /** Value lying in dropped clusters (`drops`), still to be picked up again. */
  lost: number;
  /**
   * Extra glints creatures have paid over their base worth (a kill by the finisher pays more):
   * counted at the kill. The ending's tally leaves them out of "found of all there were".
   */
  bonus: number;
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

/** Lures (src/sim/lures.ts). Every array has one entry per `scene.lures`, same order. */
export interface LuresState {
  /** Cuts left; 0 = out, for good (it stays out until the room restarts). */
  hp: number[];
  /** `attackSeq` of the last slash that hit it (one hit per slash). */
  hitBy: number[];
  /** The frame it went out + 1 (0 = still burning). */
  out: number[];
  /** How many have gone out, and the moths freed in all. */
  snuffed: number;
  freed: number;
  /**
   * Embers (the fling's retry rule, wood-area1-v3 §2): 1 while a flame she flung from smoulders (not burning, not
   * yet out): it goes out for good when she lands on safe ground, and burns again if she falls or meets thorns.
   */
  ember: number[];
  /**
   * Moonwicks (Lanternroot, src/sim/light.ts): frames of burn left (`-1` = burns for good: `keep`, a set; 0 = cold
   * or not a moonwick). A moonwick burns while its `hp` is 1.
   */
  burn: number[];
  /**
   * Frames each lure leaves her alone (no pull, no catch): the one she broke free of and every core
   * her throw passed through (`lures.throwFrames`). 0 = acts.
   */
  grace: number[];
  /**
   * Lures a boss drives (memory/bosses.md), per `scene.lures` index; absent in rooms without one.
   * `row`: the tuning row it pulls by now ('' = its scene kind's: a great lamp's heart reaches further
   * in the last phase); `dx`, `dy`: where its flame is now from its scene point (the heart lowers);
   * `shield`: 1 = the blade passes through it (the heart while its boss guards it).
   */
  live?: LureLive;
}

export interface LureLive {
  row: string[];
  dx: number[];
  dy: number[];
  shield: number[];
}

/**
 * What an enemy is doing. Every kind: `hurt` (staggered by a hit), `dead`.
 * Burrback: `walk`, `pause` (standing: a turn-around if `turning`, else a rest), `alert` (a flinch),
 * `windup` (braced, shell forward: the tell of its ram), `charge` (the ram), `recover` (spent: it
 * stands open after a ram).
 * Lampwing: `hover` (wandering round its home), `curious` (it has noticed her: the tell), `dive`
 * (the committed swoop at where she stood when the tell ended), `stall` (it hangs at the bottom of
 * the arc, open, its touch harmless), `pursue` (it climbs to a perch above her to try again), `rest`
 * (it has given up, or just touched her: it hangs where it is), `return` (flying home; it notices
 * nothing until it is there). The hawker is a lampwing.
 * Lamp rules (memory/creatures.md): `sleep` (a crawler curled asleep: its lamp went out, or an old
 * burrback before it wakes), `wake` (the old burrback waking: harmless), `feint` (the old burrback's
 * shell drops between its two braces), `leave` (a flyer or weaver whose lamp went out, going away).
 * Weaver: `sit` (at home on its web), `run` (along the strands to where she touched), `windup` (the
 * count before the bite: its tell), `bite` (its touch is live), `back` (home along the strands).
 * Web: `hang`.
 * Dangler (memory/creatures.md): `sit` (at its perch), `windup` (the tell: its thread shown), `drop`,
 * `swing` (live), `stall` (hangs open), `climb` (back up), `fall` (its thread cut), `recover` (stunned
 * where it fell), `leave`.
 * The Weaver boss (memory/bosses.md) adds: `swing` (on its thread), `climb` (up a thread or a trunk),
 * `perch` (up in the canopy or on a trunk, out of play), `fall` (its thread cut), `skitter` (running
 * off along the floor), `flee` (gone for good), `hunt` (on the floor, facing her).
 */
export type EnemyMode =
  | 'walk'
  | 'pause'
  | 'alert'
  | 'hover'
  | 'curious'
  | 'pursue'
  | 'dive'
  | 'stall'
  | 'rest'
  | 'return'
  | 'windup'
  | 'charge'
  | 'recover'
  | 'hurt'
  | 'dead'
  | 'sleep'
  | 'wake'
  | 'feint'
  | 'leave'
  | 'sit'
  | 'run'
  | 'bite'
  | 'back'
  | 'hang'
  | 'swing'
  | 'climb'
  | 'perch'
  | 'fall'
  | 'skitter'
  | 'flee'
  | 'hunt'
  | 'drop'
  | 'under'
  | 'rear'
  | 'slam'
  | 'curl'
  | 'roll';

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
  /** Frames left of a timed mode (pause, alert, windup, recover, curious, rest, hurt, dead); 0 otherwise. */
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
  /**
   * Burrback: its shell is forward (`windup`, `charge`): a forward cut from the side it faces
   * glances off. `strikeCd`: frames until it may brace again; `chargeLeft`: px left of its ram (set
   * when it braces: the length it will go).
   */
  braced: boolean;
  strikeCd: number;
  chargeLeft: number;
  /**
   * Burrback: `rams` = times it has stood winded this life (from the second on it is tired: it
   * stands longer); `roused` = frames left of having been cut (it comes round to her and braces
   * from further off, in its range or not); `stirred` = frames left of having rammed (it comes
   * round to one inside its range); `broken`: the blow it is staggering from broke its brace (it
   * stands winded when the stagger ends).
   */
  rams: number;
  roused: number;
  stirred: number;
  broken: boolean;
  /** Burrback: neither its ram nor a shove takes it out of its range (the scene's `fenced`). */
  fenced: boolean;
  /**
   * Burrback: frames left curled up after a down cut landed on it (`enemyTuck`; 0 = not curled):
   * a down cut glances off its shell (she bounces off it, nothing is taken). The count holds at 1
   * until it may brace again; then it uncurls, into a brace if she is near (over it included).
   */
  tuck: number;
  /**
   * Lampwing: `dives` = dives made at her since it noticed her; `span` = the length of the current
   * dive in frames (`timer` counts it down) and `fromX, fromY` = where it began (centre): the arc
   * runs from there to `targetX, targetY`; `sight` = how far it notices her from.
   */
  dives: number;
  span: number;
  fromX: number;
  fromY: number;
  sight: number;
  /**
   * Lampwing: frames left in which it notices only one well inside its leash
   * (`lampwing.retellMarginPx`), after a tell or a chase came to nothing because she was out of it
   * (`enemyGiveUp` cause `far`): one at the edge of its reach is told once, not every jump.
   */
  noticeCd: number;
  /** Frames left of a calm (a lantern was kindled near it, or the run ended): its touch does nothing meanwhile. */
  calm: number;
  /**
   * Frames left of the calm a glint she gave it bought (memory/giving.md; `calm` covers it too, so
   * its touch does nothing, a burrback braces at nothing, a lampwing notices nothing). 0 = none.
   * A blow ends it. `gifts` = glints she has given it this life.
   */
  gift: number;
  gifts: number;
  /**
   * Frames left of its being aware of her (memory/giving.md): it has seen the light she carries, or
   * it is in a fight with her (a lampwing's tell, dive, stall and climb; a burrback that is braced,
   * roused or stirred). `enemyAware` fires as it becomes aware; 0 = she is unseen by it. Never while
   * it is calmed. Render: a lifted head, a turned eye; the HUD: "she is seen".
   */
  aware: number;
  /**
   * Burrback: it sleeps where it stands (round 3, memory/giving.md): she is within `burrback.dozePx`
   * and carries too little light to be seen, and it is not in a fight with her. It does not patrol
   * meanwhile; it wakes the step she carries light again (or leaves, or cuts it).
   */
  dozing: boolean;
  /**
   * Lampwing: it roosts (round 4, memory/giving.md): she is within `lampwing.roostPx` and too dark to
   * be seen; it hangs still, wings folded, lamp low; it wakes the step she carries light.
   */
  roosting: boolean;
  /** Glints spilled on death still on their way to her, frames to the next, and the gap between them. */
  spill: number;
  spillTimer: number;
  spillGap: number;
  // --- Lamp rules (memory/creatures.md).
  /** How it notices her: 0 = `wallet` (test grove), 1 = `lamp` (she is lit), 2 = `always`. */
  sense: number;
  /** A lamp-guarder: index of the lure it guards (`scene.lures`), -1 = none. */
  guard: number;
  /** Its lamp went out and it gave up (`enemyDisperse`): asleep (crawler), gone (flyer, weaver), slack (web). */
  dispersed: boolean;
  /**
   * Old burrback: `pogoed` = a pogo has landed in this brace (the next glances: one a brace); `stunned`
   * = its winded time came from a wall (its shell is open: every cut lands); `feints` = braces made in
   * this exchange (the first is the feint).
   */
  pogoed: boolean;
  stunned: boolean;
  feints: number;
  /**
   * Weaver: where it is on its web (`seg` = strand index, `segT` 0..1 along it from its first end) and
   * where it is going (`goalSeg`, `goalT`; -1 = nowhere). Web: `cut` = one character per strand:
   * '0' intact, '1' cut by her blade, '2' fell (no longer joined to an anchor); `seg` = the strand she
   * touched last, at (`targetX`, `targetY`).
   */
  seg: number;
  segT: number;
  goalSeg: number;
  goalT: number;
  cut: string;
  /** Old burrback: cuts that have landed in this open window (it gets up after `openHits`). */
  taken: number;
  /** Burrback: this ram's speed, px/f (0 = its row's `chargeSpeed`): faster to pass under a jump in progress. */
  ramSpeed: number;
  /**
   * Hawker on a rhythm (`EnemySpawn.orbit`): the lure whose circling moths it hunts (index, -1 = none) and
   * its pass period, frames. `side` = the perch it is at (-1 west, 1 east of the flame).
   */
  orbit: number;
  period: number;
  /**
   * 1 = it was on her screen (`enemies.screenHalfW/H` of her) when her latest catch began (a lamp's hold, a
   * grab), 0 = it was not: then it starts no strike on her until she is free (round 4: nothing arrives from
   * off-screen while she is helpless). Kept up to date while she is free.
   */
  catchSeen: number;
  /**
   * The old burrback as a boss (area1-plan-r5 §1, `tuning.oldBurrback.phased`): `phase` 1 the beetle rule,
   * 2 the roll, 3 the taproot (0 = not phased); `camp` = frames she has stood on a ledge (the slam comes at
   * `campFrames`); `taps` = its rams into the taproot this phase; `streak` = rams in a row (phase 3).
   */
  phase: number;
  camp: number;
  taps: number;
  streak: number;
  /**
   * Round 6: its slam's floor wave (`wave` = how far its fronts have run from `waveX` each way, px; 0 = none);
   * `waveHit` = a front met her feet on its floor this step (the framework hurts her); `slams` = its `rams` at
   * its last slam in the rotation (`slamEveryRams`).
   */
  wave: number;
  waveX: number;
  waveHit: boolean;
  slams: number;
  /** Lanternroot: 1 while silver light keeps it from starting a strike (`enemyShy` fired; src/sim/light.ts). */
  shy: number;
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
  /** She has come near it while it was dormant (`lanternNotice` fired); cleared once she is well away. */
  noticed: boolean;
  /**
   * She has come near it at least once this run (it stays set). A wayside lamp she has passed is a
   * re-form point even while dark (src/sim/goal.ts `restPoint`).
   */
  passed: boolean;
  /**
   * Dormant: she stood at it short while enough glints were already on their way to her (a pod
   * she had just cut). It catches the step they have landed, wherever she is by then.
   */
  pledged: boolean;
  /**
   * Frames she has stood still at it (no direction held, not cutting). A wayside lamp starts to
   * catch only after `tuning.goal.lampStillFrames` of that: spending there is a choice.
   */
  still: number;
  /**
   * It has what it needs besides its price: always true for a lantern without a `key` in the scene;
   * for one with a key, true once she has gathered that great glint (`lanternKey` fires then).
   */
  keyed: boolean;
  /** Glints given to it by hand while dormant (the `offer` action): its price is less by that much. */
  given: number;
}

/** The goal of the scene (src/sim/goal.ts, memory/goal.md): the lanterns, the heart, the ending. */
export interface GoalState {
  lanterns: LanternState[];
  /** How many are lit. */
  lit: number;
  /**
   * The lit lantern she last stood at: where she re-forms (index into `scene.lanterns`), -1 = none
   * yet, or the last light she stood at was a wayside lamp (`restLamp`).
   */
  restAt: number;
  /**
   * Wayside lamps (`scene.lamps`, same order): lesser lanterns with the same rules that do not count
   * toward the heart. `lampsLit` = how many burn; `restLamp` = the lit lamp she last stood at, if
   * that is more recent than any lantern (-1 otherwise): she re-forms there.
   */
  lamps: LanternState[];
  lampsLit: number;
  restLamp: number;
  /**
   * She has just re-formed at her rest point (`restAt` / `restLamp`): it does not make her whole
   * until she has stepped out of it and come back.
   */
  restHold: boolean;
  /**
   * The heart of the grove. `awake` once every lantern is lit; `frames` counts up from the frame
   * it woke (0 while asleep); `hinted`: she has walked up to it asleep (`heartSleep` fired);
   * `ready`: its wake has played (`tuning.goal.heartWakeFrames` after it woke: `heartReady`), only
   * now does standing in it end the run; `waited`: she stood in it before that (`heartWait`).
   */
  heart: { awake: boolean; frames: number; hinted: boolean; ready: boolean; waited: boolean };
  /** She has reached the woken heart (`gather`): control is taken and nothing can hurt her. */
  gathered: boolean;
  /**
   * The ending hold: `frames` since `gather` (it stops at `tuning.goal.holdFrames`), and the run's
   * summary as the `gather` event gave it (all 0 until then).
   */
  ending: {
    frames: number;
    /** Glints found of `glintsTotal` (never more than it); `bonus` = what finisher kills paid on top. */
    glints: number;
    bonus: number;
    time: number;
    kills: number;
    hits: number;
    /**
     * The tally: what there was to find (`...Total`) against what she found, and how often she faded.
     * `glintsTotal` = every pickup, every pod and every creature at its base worth.
     */
    glintsTotal: number;
    pods: number;
    podsTotal: number;
    greats: number;
    greatsTotal: number;
    enemiesTotal: number;
    deaths: number;
    /** Wayside lamps lit, of how many there are. */
    lamps: number;
    lampsTotal: number;
    /** The offering: what she carried into the heart (all of it is given during the hold), and the tier that reaches (0-3). */
    offered: number;
    offerTier: number;
    /** Glints her offering was short of the next tier (0 at the top tier). */
    offerNext: number;
    /** Glints she gave creatures by hand during the run, and how many creatures one calmed (memory/giving.md). */
    gifted: number;
    calmed: number;
  };
  /**
   * The offering to the woken heart, as it goes in during the ending hold: `total` = what she
   * carried at `gather`, `given` = how much of it has reached the heart so far, `tier` = the
   * thresholds (`tuning.goal.offerTier1..3`) `given` has passed (0-3).
   */
  offer: { total: number; given: number; tier: number };
  /**
   * What the grove has answered the offering with so far, one part more per tier passed
   * (`groveWake` fires as each is set): tier 1 the shrine's flowers, tier 2 the glow plants along
   * the three lanterns' paths, tier 3 the lights of the whole canopy.
   */
  grove: { flowers: boolean; paths: boolean; canopy: boolean };
  /** The hold is over (`endHold`): the scene stays calm until the restart. */
  ended: boolean;
  /** Glints given to the heart by hand during the run (the `offer` action): they count in the offering. */
  heartGiven: number;
  /** The run so far: the frame of her first input (-1 = none yet), the hits she has taken, the times she faded. */
  run: { start: number; hits: number; deaths: number };
}

/**
 * What persists (docs/design/tech.md §3, memory/save.md): everything she has earned, across rooms,
 * fades and sessions. Plain JSON; ids of things in rooms are `room:id` (stable forever:
 * docs/design/world.md §5.6). Lists grow in the order things happen (deterministic). The rest of
 * `GameState` besides `player` and the clock is the room's own (`RoomLocal`): rebuilt from the scene
 * and this on every room entry.
 */
export interface SaveState {
  /** The abilities she owns, in `ABILITIES` order (src/sim/abilities.ts). */
  abilities: AbilityId[];
  /** Lures she put out (`room:lure`): they stay out for good. */
  snuffed: string[];
  /** Moths freed in all (the completion count, core.md §6). */
  moths: number;
  /** One-time things taken (`room:glade`). */
  taken: string[];
  /** Story beats and anything else said once (free-form ids). */
  flags: string[];
  /** Shortcuts opened (`room:shortcut`). */
  opened: string[];
  /** Rooms she has been in (the map), first visit first. */
  visited: string[];
  /** Things she has had in view (`room:id` of lures, exits, doors, patches, glades): the map draws them. */
  seen: string[];
  /** Exits and doors she has gone through, either way (`room:exit`): the map tells taken from not. */
  crossed: string[];
  /** The moon patch she last rested at: where a fade re-forms her and where Continue starts. */
  patch: { room: string; id: string } | null;
  /** Sim frames played (all sessions). */
  time: number;
}

/**
 * She crossed an open room edge (`scene.exits`) or went in at a door (`scene.doors`): the room holds
 * her for `of` frames (`tuning.room.transitionFrames`, or `exitFrames` when nothing is there and the
 * room will restart), then she enters `to` by `toExit` (`''` = the room restarts).
 */
export interface TransitState {
  /** The exit's (or door's) id in this room. */
  id: string;
  /** Frames since she crossed it, of `of`. */
  frames: number;
  of: number;
  /** The input held as she crossed: it goes on being held through the hold (her run, her glide). */
  input: InputFrame;
  /** The room she goes to and the exit (or door) she comes out of; `''` = none (the room restarts). */
  to: string;
  toExit: string;
  /** Through a door (she comes out at rest), not an edge (her momentum carries). */
  door: boolean;
}

/** Caught after a fall (`scene.catches`): the zone's id and frames since. */
export interface ExitState {
  id: string;
  frames: number;
}

/**
 * The moon patch she stands in (`at`: its index in `scene.patches`, -1 = none), frames she has stood
 * there, and whether she has rested this stay (she must step out and back to rest again).
 */
export interface RestState {
  at: number;
  frames: number;
  done: boolean;
}

/** Shut in the cocoon (src/sim/hatch.ts): frames since the room started, presses counted, broken out yet. */
export interface HatchState {
  frames: number;
  presses: number;
  done: boolean;
}

/**
 * A boss fight (src/sim/boss/, memory/bosses.md): room-local, rebuilt on every entry from the scene and
 * the save (`met`: a retry; `flag`: beaten for good).
 */
export interface BossState {
  /** `scene.boss.id`. */
  id: string;
  /**
   * `wait`: not started, the arena open. `intro`: locked, the name card, nothing attacks. `fight`: a
   * phase is on. `shift`: between phases (a cue timeline runs, nothing attacks). `end`: beaten, the
   * defeat timeline runs. `down`: beaten for good (on every later entry too).
   */
  stage: 'wait' | 'intro' | 'fight' | 'shift' | 'end' | 'down';
  /** 0 before the fight, then the phase (1-based; the Weaver: 1 ring, 2 drops, 3 floor, 4 heart). */
  phase: number;
  /** The doors are sealed. */
  locked: boolean;
  /** This attempt is a retry (the save has `met`): the short first phase. */
  retry: boolean;
  /** Locks this visit (1 = the first attempt of this visit). */
  attempt: number;
  /** Frames since the lock, and since the phase began. */
  time: number;
  phaseTime: number;
  /** The cue timeline running ('' = none), frames into it, cues fired so far. */
  cueSet: string;
  cueFrames: number;
  cueNext: number;
  // --- The Weaver (src/sim/boss/weaver.ts); other kinds reuse what fits.
  /** P2: drops made so far (the next pivot is `drops[drop % n]`). */
  drop: number;
  /** The thread: its top (`pivotX`, `pivotY`), whether it holds the spider, its length, its swing's reach. */
  pivotX: number;
  pivotY: number;
  thread: boolean;
  len: number;
  reach: number;
  /** Which end of its arc the swing starts at (-1 west, 1 east). */
  side: number;
  /** The tell now showing ('' none): `swing` (P2's arc), `lunge` (P3's run), `drop` (P3's drop), `bite` (P1's count). */
  tell: string;
  /** Frames of it left before the attack is live. */
  tellFrames: number;
  /** The tell's danger along the floor (x span) and a place the attack never reaches (`safeX`, -1 = none). */
  tellX0: number;
  tellX1: number;
  safeX: number;
  /** P3: the lunge's way, where the drop lands, pogos taken. */
  dir: number;
  landX: number;
  /** The heart's offset now (it lowers at the end). */
  heartDy: number;
  /**
   * The Gloamweaver (Lanternroot): its place on the orb (a unit vector from the hub), exposures, throw-cuts taken in
   * P3, frames to its next P1 lunge.
   */
  ux: number;
  uy: number;
  exposed: number;
  throws: number;
  lunge: number;
  /**
   * The Mantis (src/sim/boss/mantis.ts): the move under way and the moves made (its pattern), the blows taken
   * since its last attack, the chain left in a combo, and its blade's live box (`hitW` 0 = none; any boss may
   * set one: src/sim/index.ts hurts her with it). `dodged`: the frame her Moonstep last went through a blow.
   */
  move: string;
  moves: number;
  pressed: number;
  chain: number;
  hitX: number;
  hitY: number;
  hitW: number;
  hitH: number;
  dodged: number;
  /** The Mantis's P3 ripple along the floor: where it is, its way, frames left (0 = none). */
  waveX: number;
  waveDir: number;
  waveT: number;
}

/** The part of the state that belongs to the room: rebuilt by every room entry (src/sim/world.ts). */
export interface RoomLocal {
  pickups: PickupsState;
  pods: PodsState;
  lures: LuresState;
  enemies: EnemyState[];
  goal: GoalState;
  exit: TransitState | null;
  caught: ExitState | null;
  hatch: HatchState | null;
  rest: RestState;
  /** The level kit's room state: bark cuts, gates, a thorn's hold (src/sim/kit.ts, memory/level-kit.md). */
  kit: KitState;
  /** The room's boss fight (memory/bosses.md), null in a room without one. */
  boss: BossState | null;
  /**
   * Where she first stood in this room (feet centre; the first ground that passes the safe checks after she
   * came in): her door. A fade with no moon patch to go to and no room `reform` point re-forms her here,
   * never beside what faded her (feel review round 2, problem 7). Null until she has stood.
   */
  entry: { x: number; y: number } | null;
  /**
   * Seam hysteresis (area 1 video r4 #7: 190 crown/canopy crossings in 3.5 min, each a fade): the exit she came
   * in by (`exit`) is shut behind her (a wall, a floor, or simply not crossed at the top) until `room.seamLockFrames`
   * have passed (`frames`). Null otherwise.
   */
  seam: { exit: string; frames: number } | null;
  /** Lanternroot's light pieces (src/sim/light.ts): the gust in the air, moonmoss, the bells, regrowing pods. */
  light: LightState;
}

export interface GameState {
  version: 22;
  /** The room (scene id) this state belongs to. */
  room: string;
  /** Sim steps taken. The sim's only clock. */
  frame: number;
  seed: number;
  /** Seeded RNG state (src/sim/rng.ts). */
  rng: number;
  prevInput: InputFrame;
  player: PlayerState;
  pickups: PickupsState;
  pods: PodsState;
  /** The story's lamps (`scene.lures`): memory/lures.md. */
  lures: LuresState;
  enemies: EnemyState[];
  goal: GoalState;
  save: SaveState;
  /** Leaving the room through an exit or a door: null while she is in it. */
  exit: TransitState | null;
  /** Caught after a fall (`scene.catches`; `id` = the zone): null unless she is being put back. */
  caught: ExitState | null;
  /** The hatching: null in a room without one (`scene.hatch`), or one she has been in before. */
  hatch: HatchState | null;
  /** The moon patch she stands in (`scene.patches`). */
  rest: RestState;
  /** The level kit's room state: bark cuts, gates, a thorn's hold (src/sim/kit.ts, memory/level-kit.md). */
  kit: KitState;
  /** The room's boss fight (memory/bosses.md), null in a room without one. */
  boss: BossState | null;
  /** Her door into this room (`RoomLocal.entry`). */
  entry: { x: number; y: number } | null;
  /**
   * Seam hysteresis (area 1 video r4 #7: 190 crown/canopy crossings in 3.5 min, each a fade): the exit she came
   * in by (`exit`) is shut behind her (a wall, a floor, or simply not crossed at the top) until `room.seamLockFrames`
   * have passed (`frames`). Null otherwise.
   */
  seam: { exit: string; frames: number } | null;
  /** Lanternroot's light pieces (src/sim/light.ts): the gust in the air, moonmoss, the bells, regrowing pods. */
  light: LightState;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player, lureArc: s.player.lureArc.slice() },
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
    lures: {
      hp: s.lures.hp.slice(),
      hitBy: s.lures.hitBy.slice(),
      out: s.lures.out.slice(),
      snuffed: s.lures.snuffed,
      freed: s.lures.freed,
      grace: s.lures.grace.slice(),
      ember: s.lures.ember.slice(),
      burn: s.lures.burn.slice(),
      ...(s.lures.live
        ? {
            live: {
              row: s.lures.live.row.slice(),
              dx: s.lures.live.dx.slice(),
              dy: s.lures.live.dy.slice(),
              shield: s.lures.live.shield.slice(),
            },
          }
        : {}),
    },
    enemies: s.enemies.map((e) => ({ ...e })),
    goal: {
      ...s.goal,
      lanterns: s.goal.lanterns.map((l) => ({ ...l })),
      lamps: s.goal.lamps.map((l) => ({ ...l })),
      heart: { ...s.goal.heart },
      ending: { ...s.goal.ending },
      offer: { ...s.goal.offer },
      grove: { ...s.goal.grove },
      run: { ...s.goal.run },
    },
    save: cloneSave(s.save),
    exit: s.exit ? { ...s.exit } : null,
    caught: s.caught ? { ...s.caught } : null,
    hatch: s.hatch ? { ...s.hatch } : null,
    rest: { ...s.rest },
    kit: cloneKit(s.kit),
    boss: s.boss ? { ...s.boss } : null,
    entry: s.entry ? { ...s.entry } : null,
    seam: s.seam ? { ...s.seam } : null,
    light: cloneLight(s.light),
  };
}

export function cloneSave(s: SaveState): SaveState {
  return {
    abilities: s.abilities.slice(),
    snuffed: s.snuffed.slice(),
    moths: s.moths,
    taken: s.taken.slice(),
    flags: s.flags.slice(),
    opened: s.opened.slice(),
    visited: s.visited.slice(),
    seen: s.seen.slice(),
    crossed: s.crossed.slice(),
    patch: s.patch ? { ...s.patch } : null,
    time: s.time,
  };
}

/** A new game's save: owning `abilities` and nothing else. */
export function newSave(abilities: readonly AbilityId[] = []): SaveState {
  return {
    abilities: abilities.slice(),
    snuffed: [],
    moths: 0,
    taken: [],
    flags: [],
    opened: [],
    visited: [],
    seen: [],
    crossed: [],
    patch: null,
    time: 0,
  };
}
