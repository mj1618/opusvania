/**
 * Sim events of droplets in flight (src/sim/shots.ts) and the bombardier that fires them
 * (src/sim/enemies/bombardier.ts, memory/enemies.md "The bombardier"). Part of `SimEvent` (src/sim/events.ts).
 * `x`, `y` = the droplet's centre (or the creature's box centre for `enemySpray`). `shot` = the droplet's id
 * (`ShotState.id`); `owner` = the id of the creature that fired it.
 */
import type { EnemyKind } from './scene';
import type { AttackDir } from './state';

export type ShotEvent =
  /**
   * A droplet leaves the turret: `n` of `of` in the burst, aimed to pass through (`tx`, `ty`) after `flight` frames,
   * starting at `vx`, `vy`.
   */
  | {
      type: 'shotFire';
      shot: number;
      owner: string;
      kind: EnemyKind;
      x: number;
      y: number;
      vx: number;
      vy: number;
      tx: number;
      ty: number;
      flight: number;
      n: number;
      of: number;
    }
  /**
   * Her slash batted a droplet back (`dir` = the slash, `facing` hers): it holds `hitstop` frames with her, then flies
   * at `vx`, `vy` toward (`tx`, `ty`), its owner's centre (or straight back the way it came, its owner gone).
   */
  | {
      type: 'shotDeflect';
      shot: number;
      owner: string;
      x: number;
      y: number;
      dir: Exclude<AttackDir, 'none'>;
      facing: number;
      vx: number;
      vy: number;
      tx: number;
      ty: number;
      hitstop: number;
    }
  /** A droplet is spent: it splashed on the `ground` (or a wall), on `her`, on a `creature`, or flew `out` / cooled. */
  | {
      type: 'shotSplash';
      shot: number;
      owner: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      reflected: boolean;
      on: 'ground' | 'her' | 'creature' | 'out';
    }
  /**
   * A batted droplet hit a creature (`id`, `kind`): it took `damage` (`hpLeft` of `hpMax`), holds `hitstop`; `stun`:
   * it was the droplet's owner and lies open on its back for `frames`; `kill`: it died (`enemyDie` follows).
   * `dir` = the way the droplet was flying (-1 / 1).
   */
  | {
      type: 'shotHit';
      shot: number;
      owner: string;
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      dir: number;
      damage: number;
      hpLeft: number;
      hpMax: number;
      hitstop: number;
      stun: boolean;
      kill: boolean;
      frames: number;
    }
  /** The bombardier's close spray starts: a hot cone `reach` px toward `dir` for `frames`. */
  | {
      type: 'enemySpray';
      id: string;
      kind: EnemyKind;
      x: number;
      y: number;
      dir: number;
      reach: number;
      frames: number;
    };
