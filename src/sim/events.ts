import type { EnemyKind, PickupKind, PodMount } from './scene';
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
/** What a slash hit: a lumen pod or an enemy (`kind` = the enemy's kind). */
export type SlashTarget = { kind: 'pod' | EnemyKind; id: string };
/** Why a slash ended: it played out, a dash cut it, a new slash replaced it, or she was hurt. */
export type SlashEndReason = 'done' | 'dash' | 'chain' | 'hurt';
export type GlideEndReason = 'release' | 'land' | 'wall' | 'dash' | 'fastfall' | 'hurt';
/** What hurt her. */
export type HurtSource = { kind: EnemyKind; id: string };

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
   * is over (`slashEnd`) `duration` frames after this event and the next may start `cooldown` frames
   * after it: all four are this step's own numbers. `seq` numbers the slashes. `step` is the combo
   * step (1 cut, 2 return cut, 3 finisher = `finisher`); `lunge` = the forward shove she starts with
   * (px/f, 0 in the air), `hang` = frames her fall is held back (0 on the ground).
   */
  | {
      type: 'slash';
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      seq: number;
      step: number;
      finisher: boolean;
      startup: number;
      active: number;
      duration: number;
      cooldown: number;
      lunge: number;
      hang: number;
    }
  /**
   * The slash hit a target (once per target per slash). `x`, `y` = the target's centre; `px`, `py` =
   * the centre of the player's box. `pogo`: a down slash, she bounces off it. `hitstop` = frames the
   * sim now holds her (`player.hitstop`). `step` / `power` (1, 1, 2 for the finisher) = how heavy;
   * `knockback` = what the blow gives the target, px/f along the slash (pods ignore it).
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
      step: number;
      power: number;
      knockback: number;
    }
  /**
   * A blow landed: one per step that hits anything, on the frame of its first hit, for the camera
   * and screen effects (the sim shakes nothing itself). `x`, `y` = the first target hit; `dir` /
   * `facing` = the slash; `power` 1 or 2 (finisher); `hits` = targets hit that frame.
   */
  | {
      type: 'impact';
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      step: number;
      power: number;
      hits: number;
    }
  | { type: 'slashEnd'; x: number; y: number; dir: SlashDir; hits: number; reason: SlashEndReason }
  /**
   * A slash hit a lumen pod (`x`, `y` = its centre) and it held: `hpLeft` of `hpMax` hit points
   * remain (`power` were taken). `value` glints are now on their way from it (those just knocked
   * loose plus any still in flight): the first reaches her `frames` steps from now, the rest
   * `stagger` apart, each as a `pickup` event with this pod's id and `pod: true`.
   */
  | {
      type: 'podHit';
      id: string;
      mount: PodMount;
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      power: number;
      hpLeft: number;
      hpMax: number;
      value: number;
      frames: number;
      stagger: number;
    }
  /**
   * A lumen pod burst (`x`, `y` = its centre) under a slash going `dir` / `facing`. `value` glints
   * are now on their way (the rest of its `total` worth, plus any still in flight): the first
   * reaches her `frames` steps from now, the rest `stagger` apart, each as a `pickup` event with
   * this pod's id and `pod: true`.
   */
  | {
      type: 'podBurst';
      id: string;
      mount: PodMount;
      x: number;
      y: number;
      dir: SlashDir;
      facing: number;
      power: number;
      hpMax: number;
      total: number;
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
      /** Set when a dead enemy spilled it: `id` is then the enemy's id, `x`, `y` its body centre. */
      enemy?: boolean;
      /** Set when it came back from a cluster she dropped: `id` is `drop-<n>`, `x`, `y` where it lay. */
      drop?: boolean;
    }
  /**
   * She faded and left `value` glints behind (a share of her wallet, which now holds `wallet`):
   * cluster number `id`, lying at `x`, `y` (where her body lay) until she comes back for it. Fires
   * in the step she re-forms, just before `reform`.
   */
  | { type: 'glintsDrop'; id: number; x: number; y: number; value: number; wallet: number }
  /**
   * She touched a dropped cluster: its `value` glints are on their way back, the first in `frames`
   * steps, the rest `stagger` apart, each a `pickup` event with `drop: true` and id `drop-<id>`.
   */
  | { type: 'dropWake'; id: number; x: number; y: number; value: number; frames: number; stagger: number }
  /**
   * Enemy events: `x`, `y` = the centre of the enemy's box, `facing` = the way it faces.
   * `enemyAlert`: she landed or slashed close by and it flinches for `frames`; `dir` = the side she is on.
   * Cause `touch`: its touch just hurt her (or met her while she kindled): it recoils from her, turns away.
   */
  | {
      type: 'enemyAlert';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      facing: number;
      dir: number;
      cause: 'land' | 'slash' | 'touch';
      frames: number;
    }
  /**
   * A lampwing has noticed her (in range, in plain view): it turns to her (`dir` = its new facing,
   * the side she is on) and holds `frames` of `curious` (the tell), then pursues.
   */
  | { type: 'enemyNotice'; id: string; kind: EnemyKind; x: number; y: number; dir: number; frames: number }
  /**
   * A lampwing's pursuit is over: she is too `far` from its home, `lost` from sight too long, it is
   * `tired` (it chased its full time), her light went `dark` (she faded), it `touch`ed her and
   * bounced off, or a lantern was kindled near it (`calm`; also at the ending). It rests `frames`, then flies home.
   */
  | {
      type: 'enemyGiveUp';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      facing: number;
      cause: 'far' | 'lost' | 'tired' | 'dark' | 'touch' | 'calm';
      frames: number;
    }
  /**
   * It turns round: `dir` = its new facing; it stands for `frames` first. `ledge`: its ground ends
   * ahead (it turns well short of a drop); `wall`; `lantern`: a lit lantern's sanctuary is ahead;
   * `wary`: she is below the edge ahead of it.
   */
  | {
      type: 'enemyTurn';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      dir: number;
      cause: 'ledge' | 'wall' | 'lantern' | 'wary';
      frames: number;
    }
  /**
   * A slash hurt it and it lives: `power` taken, `hpLeft` of `hpMax`. `slash` = the cut's direction,
   * `dir` = the side it is shoved to (-1 / 1) at `knockback` px/f (fading). It is held for `hitstop`
   * frames, then staggers for `frames`.
   */
  | {
      type: 'enemyHit';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      facing: number;
      slash: SlashDir;
      dir: number;
      power: number;
      hpLeft: number;
      hpMax: number;
      knockback: number;
      hitstop: number;
      frames: number;
    }
  /**
   * A slash killed it. Fields as `enemyHit`; the body stays for `frames` (after the `hitstop`), sliding
   * with the shove, then is removed (`enemies[i].gone`). `value` glints are on their way to her: the
   * first in `glintFrames` steps, the rest `stagger` apart, each a `pickup` event with `enemy: true`.
   */
  | {
      type: 'enemyDie';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      facing: number;
      slash: SlashDir;
      dir: number;
      power: number;
      hpMax: number;
      knockback: number;
      hitstop: number;
      frames: number;
      value: number;
      glintFrames: number;
      stagger: number;
    }
  /**
   * She was hurt: thrown toward `dir` (-1 / 1), `hp` of `hpMax` left after losing `damage`. `x`, `y` =
   * her feet centre; `hitX`, `hitY` = where the two bodies met. She is out of control for `stagger`
   * frames and cannot be hurt for `invuln` frames (both 0 when `hp` is 0: a `fade` follows).
   */
  | {
      type: 'hurt';
      x: number;
      y: number;
      dir: number;
      hp: number;
      hpMax: number;
      damage: number;
      source: HurtSource;
      hitX: number;
      hitY: number;
      stagger: number;
      invuln: number;
    }
  /** Her last light went out: she fades for `frames` (no control), then re-forms. */
  | { type: 'fade'; x: number; y: number; frames: number }
  /**
   * She re-formed at the last safe ground (`x`, `y`, feet centre) from where she lay (`fromX`,
   * `fromY`), with full health and `invuln` frames of safety. Living enemies are back at their starts.
   * A `spawn` event follows in the same step (she was placed: nothing should interpolate).
   */
  | {
      type: 'reform';
      x: number;
      y: number;
      fromX: number;
      fromY: number;
      hp: number;
      hpMax: number;
      invuln: number;
    }
  /**
   * Lantern events (src/sim/goal.ts, memory/goal.md): `x`, `y` = the lantern's foot (its point in
   * the scene), `id` = its id.
   *
   * `lanternRefuse`: she stands at a dormant lantern carrying `have` of the `need` glints it takes.
   * Once per approach (again only after she has gone away and come back).
   */
  | { type: 'lanternRefuse'; id: string; x: number; y: number; have: number; need: number; show: number }
  /**
   * She has come near a dormant lantern (her body centre within `tuning.goal.noticePx` of its
   * trigger box's centre), carrying `have` of the `need` it takes: once per approach, however fast
   * she passes (again only after she has been `noticeLeavePx` away). For the lantern to stir, the
   * count to show its price, her head to turn. Nothing happens in the sim.
   */
  | { type: 'lanternNotice'; id: string; x: number; y: number; have: number; need: number }
  /**
   * She is kindling it: every frame of the channel but the last, `frames` (1, 2, ...) of `of`. The
   * frame that would be `of` is `lanternKindle` instead.
   */
  | { type: 'lanternChannel'; id: string; x: number; y: number; frames: number; of: number }
  /**
   * The channel broke after `frames`: she stepped away or left the ground (`leave`), was `hurt`, or
   * drew her blade (`attack`). Nothing was spent.
   */
  | {
      type: 'lanternCancel';
      id: string;
      x: number;
      y: number;
      frames: number;
      reason: 'leave' | 'hurt' | 'attack';
    }
  /**
   * It is lit, until the restart. `cost` glints left her wallet, which now holds `wallet`
   * (`state.pickups.count`); `lit` of `total` lanterns burn. It is her rest point from now on.
   */
  | {
      type: 'lanternKindle';
      id: string;
      x: number;
      y: number;
      cost: number;
      wallet: number;
      lit: number;
      total: number;
    }
  /** Standing at a lit lantern made her whole: `healed` lights came back, `hp` of `hpMax` now. */
  | { type: 'lanternRest'; id: string; x: number; y: number; hp: number; hpMax: number; healed: number }
  /**
   * Wayside lamps (`scene.lamps`, `state.goal.lamps`): the lantern events under their own names,
   * with the same fields. `lampKindle`: `lit` of `total` LAMPS burn (lanterns are not counted, and a
   * lamp never wakes the heart).
   */
  | { type: 'lampNotice'; id: string; x: number; y: number; have: number; need: number }
  | { type: 'lampRefuse'; id: string; x: number; y: number; have: number; need: number; show: number }
  | { type: 'lampChannel'; id: string; x: number; y: number; frames: number; of: number }
  | {
      type: 'lampCancel';
      id: string;
      x: number;
      y: number;
      frames: number;
      reason: 'leave' | 'hurt' | 'attack';
    }
  | {
      type: 'lampKindle';
      id: string;
      x: number;
      y: number;
      cost: number;
      wallet: number;
      lit: number;
      total: number;
    }
  | { type: 'lampRest'; id: string; x: number; y: number; hp: number; hpMax: number; healed: number }
  /**
   * She walked up to the heart of the grove (`x`, `y` = its point on the ground) while it sleeps:
   * `lit` of `total` lanterns burn. Once per run.
   */
  | { type: 'heartSleep'; x: number; y: number; lit: number; total: number }
  /** The last lantern was kindled (this same step): the heart wakes. `x`, `y` = the heart. */
  | { type: 'heartWake'; x: number; y: number }
  /**
   * She walked into the woken heart: the run is over. `x`, `y` = the heart; `px`, `py` = her feet
   * centre. The summary: `glints` found of `glintsTotal` (spent, dropped and unspent alike; never
   * more than it), `bonus` = what finisher kills paid on top (not part of either), `time` = frames since her
   * first input, `lanterns` lit, `kills` = enemies killed, `hits` taken. Control is taken for
   * `frames`; `endHold` follows then.
   */
  | {
      type: 'gather';
      x: number;
      y: number;
      px: number;
      py: number;
      glints: number;
      bonus: number;
      time: number;
      lanterns: number;
      kills: number;
      hits: number;
      frames: number;
      /** The tally: of all the glints there were (`glintsTotal`: pickups, pods, creatures at base worth), pods, great glints, creatures; and her fades. */
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
    }
  /** The ending hold is over (`state.goal.ended`): the scene rests until the restart. `x`, `y` = the heart. */
  | { type: 'endHold'; x: number; y: number };

export type SimEventType = SimEvent['type'];
