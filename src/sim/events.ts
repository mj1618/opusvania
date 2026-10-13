import type { PickupKind } from './scene';

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
    };

export type SimEventType = SimEvent['type'];
