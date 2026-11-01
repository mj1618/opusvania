/**
 * Sim events of the lamp-rule creatures (memory/creatures.md): grabs, lamp-guarders dispersing, the
 * old burrback's feint and waking, the orb web and its weaver. Part of `SimEvent` (src/sim/events.ts).
 * Enemy events: `x`, `y` = the centre of its box.
 */
import type { GrabFreeHow } from './grab';
import type { EnemyKind } from './scene';

export type CreatureEvent =
  /** A creature (a web's strand) holds her where she is: Caught (`player.grab`). `x`, `y` = her body centre. */
  | { type: 'grab'; id: string; kind: EnemyKind; x: number; y: number }
  /** A press while grabbed (`beats` of `of`). */
  | { type: 'grabBeat'; id: string; x: number; y: number; beats: number; of: number }
  /** Out of the grab: `how`, the throw (`vx`, `vy`; 0 unless beaten free), frames nothing may grab her. */
  | {
      type: 'grabFree';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      how: GrabFreeHow;
      vx: number;
      vy: number;
      grace: number;
    }
  /**
   * Its lamp went out (`lure` = its id) and a lamp-guarder gives up: `sleep` (a crawler curls up),
   * `leave` (a flyer or the weaver goes away), `slack` (a web stops holding). `quiet`: it was out before
   * she came into the room (no show).
   */
  | {
      type: 'enemyDisperse';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      lure: string;
      how: 'sleep' | 'leave' | 'slack';
      quiet: boolean;
    }
  /** The old burrback's shell drops between its two braces (the feint): `frames` until the second brace. */
  | { type: 'enemyFeint'; id: string; kind: EnemyKind; x: number; y: number; dir: number; frames: number }
  /** The old burrback wakes in its den (`frames` until it moves; harmless meanwhile). */
  | { type: 'enemyWake'; id: string; kind: EnemyKind; x: number; y: number; dir: number; frames: number }
  /** She touched a web: strand `strand`, at (`x`, `y`) on it. */
  | { type: 'webTouch'; id: string; x: number; y: number; strand: number }
  /** A slash cut strands of a web: `cut` by the blade, `fell` (no longer anchored), `left` intact. `x`, `y` = the cut. */
  | { type: 'webCut'; id: string; x: number; y: number; cut: number; fell: number; left: number }
  /** The weaver runs along its strands to (`tx`, `ty`), `px` of path, about `frames` away. */
  | {
      type: 'enemyRun';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      tx: number;
      ty: number;
      px: number;
      frames: number;
    }
  /**
   * A big creature (`hpMax` 6 or more: the old burrback) lost another third of its health: `third` = how
   * many thirds are gone (1, 2). Render: a crack in the shell; its health is `enemies[i].hp / hpMax`.
   */
  | {
      type: 'enemyCrack';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      hpLeft: number;
      hpMax: number;
      third: number;
    }
  /**
   * A throw-cut (a cut in a throw's launch) met it: it answers in its own way (a braced beetle flips, the old
   * burrback unrolls, a hawker is knocked out of its dive, a dangler's silk parts). `mode` = what it was doing.
   */
  | { type: 'enemyHeavy'; id: string; kind: EnemyKind; x: number; y: number; dir: number; mode: string }
  /**
   * The old burrback as a boss (round 5): `enemyPhase` (2 the roll, 3 the taproot); `enemyRear` the slam's
   * tell; `enemySlam` (`y` = its den floor; `big` at phase 2; `shook` = she was shaken off a ledge; `px` its
   * reach); `enemyRoll` / `enemyBounce` (off a wall) / `enemyUnroll` (`how`); `enemyTaproot` (`n` = which).
   */
  | { type: 'enemyPhase'; id: string; kind: EnemyKind; x: number; y: number; phase: number }
  | { type: 'enemyRear'; id: string; kind: EnemyKind; x: number; y: number; frames: number }
  | {
      type: 'enemySlam';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      big: boolean;
      shook: boolean;
      px: number;
    }
  | { type: 'enemyRoll'; id: string; kind: EnemyKind; x: number; y: number; dir: number; speed: number }
  | { type: 'enemyBounce'; id: string; kind: EnemyKind; x: number; y: number; dir: number; speed: number }
  | {
      type: 'enemyUnroll';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      how: 'pogo' | 'thrown' | 'heavy' | 'tired';
    }
  | { type: 'enemyTaproot'; id: string; kind: EnemyKind; x: number; y: number; n: number; frames: number }
  /** A carrier went into its crack (`under`), or came back out at its trail's start (`emerge`). `y` = its feet. */
  | { type: 'enemyUnder'; id: string; kind: EnemyKind; x: number; y: number }
  | { type: 'enemyEmerge'; id: string; kind: EnemyKind; x: number; y: number }
  /** A hawker on a rhythm swept through its lamp's orbit and took a moth (`lure` = the lamp; `x`, `y` = the flame). */
  | { type: 'enemySnatch'; id: string; kind: EnemyKind; x: number; y: number; lure: string }
  /** A dangler's thread was cut (tied at `fromX`, `fromY`): it falls. */
  | {
      type: 'enemyThreadCut';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      fromX: number;
      fromY: number;
    }
  /** The weaver's bite: `hit` = she was still held (its touch is live for `frames`). */
  | { type: 'enemyBite'; id: string; kind: EnemyKind; x: number; y: number; hit: boolean; frames: number }
  /**
   * The jumping spider (src/sim/enemies/jumper.ts) hops `px` toward `dir` over `frames`: a `step` to keep its
   * distance, an `idle` one, `back` out of her reach, or `over` her when cornered.
   */
  | {
      type: 'enemyHop';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      dir: number;
      px: number;
      frames: number;
      why: 'step' | 'idle' | 'back' | 'over';
    }
  /**
   * It came down (`y` = its feet): from a `pounce` (`hit` = it had hit her), a hop `back`, or a `fall` (knocked
   * down, bonked). `frames` = how long it lies open (0 = up at once).
   */
  | {
      type: 'enemyLand';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      dir: number;
      cause: 'pounce' | 'back' | 'fall';
      hit: boolean;
      frames: number;
    };
