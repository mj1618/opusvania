import type { PickupKind, PodMount } from './scene';
import type { AttackDir } from './state';

/**
 * Typed sim events. `step()` appends the events of that step to the array it is given; the Game
 * harness hands them to render (`game.afterStep`). Consumers must never mutate the sim.
 *
 * `x`, `y` are the player's feet centre (bottom-centre of the collision box) in sim px, at the
 * moment of the event. `dir` is -1 (left) or 1 (right).
 */
export type JumpKind = 'ground' | 'coyote' | 'buffered' | 'wall' | 'double' | 'dashJump';
export type CornerKind = 'head' | 'ledge' | 'dash';
/** Why a glide ended: jump released, touched down, a wall slide began, a dash, or Down (fast fall). */
/** A slash direction (never 'none' in an event). */
export type SlashDir = Exclude<AttackDir, 'none'>;
/** What a slash hit. Pods for now; enemies will join this. */
export type SlashTarget = { kind: 'pod'; id: string };
/** Why a slash ended: it played out, a dash cut it, or a new slash replaced it. */
export type SlashEndReason = 'done' | 'dash' | 'chain';
export type GlideEndReason = 'release' | 'land' | 'wall' | 'dash' | 'fastfall';

export type SimEvent =
  /** The player was placed (boot, load, teleport): snap cameras and springs, don't interpolate. */
  | { type: 'spawn'; x: number; y: number }
  /** A jump left the ground / wall / air. `dir` is the held direction (0 = none; wall: away from it). */
  | { type: 'jump'; kind: JumpKind; x: number; y: number; dir: number }
  /** Left the ground without jumping (walked off an edge, dropped through). */
  | { type: 'fall'; x: number; y: number }
  /** Top of an arc: vy went from rising to not rising while airborne. */
  | { type: 'apex'; x: number; y: number }
  /** Touched down. `vy` is the impact speed in px/f (> 0), `fallPx` the drop from the arc's top. */
  | { type: 'land'; x: number; y: number; vy: number; fallPx: number; hard: boolean }
  /** A footstep: every `misc.footstepPx` of grounded travel. */
  | { type: 'step'; x: number; y: number }
  /** Facing flipped. `dir` is the new facing. */
  | { type: 'turn'; x: number; y: number; dir: number; grounded: boolean }
  /** Started braking against ground momentum (input opposes velocity). `dir` is the input direction. */
  | { type: 'skid'; x: number; y: number; dir: number }
  /** `dir` is the side the wall is on. */
  | { type: 'wallSlideStart'; x: number; y: number; dir: number }
  | { type: 'wallSlideEnd'; x: number; y: number; dir: number }
  | { type: 'dashStart'; x: number; y: number; dir: number; air: boolean }
  | { type: 'dashEnd'; x: number; y: number; dir: number }
  /**
   * The wings opened (jump held while falling). `vy` is the fall speed they have to catch, px/f:
   * about 1 just after an apex, up to maxFall (or fastFallMax) out of a long drop.
   */
  | { type: 'glideStart'; x: number; y: number; vy: number }
  /** The wings closed. `land` comes just before the `land` event, `wall` before `wallSlideStart`. */
  | { type: 'glideEnd'; x: number; y: number; reason: GlideEndReason }
  /**
   * A thorn slash began. `dir` and `facing` (the side she faced: a fwd slash goes that way) hold for
   * the whole slash. The hit area is live from `startup` frames later for `active` frames; the slash
   * is over (`slashEnd`) `duration` frames after this event. `seq` numbers the slashes.
   */
  | {
      type: 'slash';
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      seq: number;
      startup: number;
      active: number;
      duration: number;
    }
  /**
   * The slash hit a target (once per target per slash). `x`, `y` = the target's centre; `px`, `py` =
   * the centre of the player's box. `pogo`: a down slash, she bounces off it. `hitstop` = frames the
   * sim now holds her (`player.hitstop`).
   */
  | {
      type: 'slashHit';
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      target: SlashTarget;
      px: number;
      py: number;
      pogo: boolean;
      hitstop: number;
    }
  | { type: 'slashEnd'; x: number; y: number; dir: SlashDir; hits: number; reason: SlashEndReason }
  /**
   * A lumen pod burst (`x`, `y` = its centre) under a slash going `dir` / `facing`. It spills `value`
   * glints: the first reaches her `frames` steps from now, the rest `stagger` apart, each as a
   * `pickup` event with this pod's id and `pod: true`.
   */
  | {
      type: 'podBurst';
      id: string;
      mount: PodMount;
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      value: number;
      frames: number;
      stagger: number;
    }
  /** Head hit a ceiling while rising. `y` is the top of the box here. */
  | { type: 'headBump'; x: number; y: number }
  /** An assist nudged the body by (dx, dy) px around a corner. */
  | { type: 'cornerCorrect'; kind: CornerKind; x: number; y: number; dx: number; dy: number }
  /** Down+Jump on a one-way platform. */
  | { type: 'dropThrough'; x: number; y: number }
  /**
   * A pickup noticed the player and is now hers: it will be collected in exactly `frames` steps
   * wherever she goes (render flies it to her in that time). `x`, `y` = where the pickup hangs.
   */
  | { type: 'pickupWake'; id: string; kind: PickupKind; x: number; y: number; frames: number }
  /**
   * A pickup was absorbed. `x`, `y` = where it used to hang; `px`, `py` = the centre of the
   * player's box now (where it goes in). `combo` counts up from 0 through a quick run of pickups
   * (for pitch / brightness steps); `total` is the value gathered so far, this one included.
   */
  | {
      type: 'pickup';
      id: string;
      kind: PickupKind;
      value: number;
      x: number;
      y: number;
      px: number;
      py: number;
      combo: number;
      total: number;
      /** Set when it came out of a burst lumen pod: `id` is then the pod's id. */
      pod?: boolean;
    };

export type SimEventType = SimEvent['type'];
