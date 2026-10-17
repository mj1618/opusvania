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
  | { type: 'enemyBite'; id: string; kind: EnemyKind; x: number; y: number; hit: boolean; frames: number };
