/**
 * Sim events of a boss fight (memory/bosses.md, src/sim/boss/). Part of `SimEvent` (src/sim/events.ts).
 * `x`, `y` = the boss creature's box centre unless said. The creature's hits, glances and touches are the
 * shared enemy events (`slashHit`, `enemyHit`, `enemyBlock`, `hurt`).
 */

/** What a tell warns of: P2's swing (the arc), P3's lunge and drop, P1's bite at the heart. */
export type BossAttack = 'swing' | 'lunge' | 'drop' | 'bite';

export type BossEvent =
  /** Her whole box is in the arena: the doors seal (`retry`: the save had `met`; `attempt` this visit). */
  | { type: 'bossLock'; id: string; x: number; y: number; retry: boolean; attempt: number }
  /** The doors open: `defeat`, or `reset` (she faded; the fight starts over when she comes back). */
  | { type: 'bossUnlock'; id: string; x: number; y: number; how: 'defeat' | 'reset' }
  /** A phase begins (`name` from the kind's phase table; `exam` = what it tests). */
  | { type: 'bossPhase'; id: string; x: number; y: number; phase: number; name: string; exam: string }
  /** A beat of a cue timeline (`set`: intro, p1end, ..., defeat; `cue`: its name; `frame` into the set). */
  | { type: 'bossCue'; id: string; x: number; y: number; set: string; cue: string; frame: number }
  /**
   * A tell starts: `attack` is live in `frames`. `x0`..`x1` = the danger along the floor, `safeX` = a
   * place it never reaches (-1 none). A swing also gives its thread: pivot (`px`, `py`), `len`, `reach`,
   * `side` (the end it drops to). A lunge: `dir`. A drop: `land` (its x).
   */
  | {
      type: 'bossTell';
      id: string;
      x: number;
      y: number;
      attack: BossAttack;
      frames: number;
      x0: number;
      x1: number;
      safeX: number;
      px: number;
      py: number;
      len: number;
      reach: number;
      side: number;
      dir: number;
    }
  /** The attack the tell warned of is live now (its touch hurts). */
  | { type: 'bossAttack'; id: string; x: number; y: number; attack: BossAttack; frames: number }
  /** It lies open: `winded` after an attack, `stunned` after its thread was cut (`frames` long). */
  | { type: 'bossOpen'; id: string; x: number; y: number; how: 'winded' | 'stunned'; frames: number }
  /** Its thread was cut by her blade (`x`, `y` = the cut): it falls. */
  | { type: 'bossThreadCut'; id: string; x: number; y: number }
  /** A ring flame's spoke falls with it (`ring` = the lure id, `left` = ring flames still burning). */
  | { type: 'bossRing'; id: string; x: number; y: number; ring: string; left: number }
  /** Beaten: the save's `flag` is set, the doors open, `moths` freed; `time` = frames since the lock. */
  | { type: 'bossDefeat'; id: string; x: number; y: number; flag: string; moths: number; time: number }
  /** She faded in the fight: it starts over (`retry` next time; the rings that will burn). */
  | { type: 'bossReset'; id: string; x: number; y: number; retry: boolean; rings: number }
  /** The firefly relit lure `lure` (a husk until now) after the fight. */
  | { type: 'bossRelight'; id: string; x: number; y: number; lure: string };
