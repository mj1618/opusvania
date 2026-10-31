/**
 * Sim events of a boss fight (memory/bosses.md, src/sim/boss/). Part of `SimEvent` (src/sim/events.ts).
 * `x`, `y` = the boss creature's box centre unless said. The creature's hits, glances and touches are the
 * shared enemy events (`slashHit`, `enemyHit`, `enemyBlock`, `hurt`).
 */

/** What a tell warns of: P2's swing (the arc), P3's lunge and drop, P1's bite at the heart. */
export type BossAttack = 'swing' | 'lunge' | 'drop' | 'bite' | 'strike' | 'leap' | 'flurry' | 'riposte';

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
  | { type: 'bossRelight'; id: string; x: number; y: number; lure: string }
  /** The win taught her something (`spec.grant`): an ability, an upgrade, and the card's line. */
  | { type: 'bossGrant'; id: string; x: number; y: number; ability: string; upgrade: string; text: string }
  /** Its guard caught her blade (the Mantis): a riposte follows. */
  | { type: 'bossParry'; id: string; x: number; y: number }
  /** Her dash went through a live blow unhurt (the Moonstep upgrade). */
  | { type: 'bossDodge'; id: string; x: number; y: number }
  // --- The Keeper (the Canopy's boss, src/sim/boss/keeper.ts; memory/canopy.md "The Keeper"). `lure` = the great
  // cage's id; the counts are moths. Live counts: `state.boss.left` / `saved` / `eaten` / `caught`.
  /** The intro (and every eat out of the dark before the fight): it heaves up out of the dark and takes a moth. */
  | { type: 'enemyFeed'; id: string; x: number; y: number }
  /**
   * A moth leaves the cage's orbit (`x`, `y` = the cage's flame): it flutters `frames` (the tell), then falls,
   * spiralling, to (`landX`, `landY`) on the floor.
   */
  | { type: 'cageDrop'; lure: string; x: number; y: number; frames: number; landX: number; landY: number }
  /** She touched a falling (or fallen) moth first: it clings to her to the end (`saved` = all saved so far). */
  | { type: 'mothSaved'; x: number; y: number; saved: number }
  /**
   * The Keeper ate `n` moths (`x`, `y` = its mouth): a fallen one (P1-2), or a sweep through the low cloud (P3);
   * `left` = moths still in the cage / the low cloud.
   */
  | { type: 'mothEaten'; enemy: string; x: number; y: number; n: number; left: number }
  /**
   * It stands head down over its food, open (`frames`): every cut lands (`sweep`: P3's sweep through the cloud,
   * `frames` = the sweep's tell, then the eat).
   */
  | { type: 'keeperEat'; id: string; x: number; y: number; frames: number; sweep: boolean }
  /** P2 begins: the cage's east root tears and it swings from its west root (`period` frames, `reach` px each way). */
  | { type: 'cageSwing'; lure: string; x: number; y: number; period: number; reach: number }
  /** P2: the light found her (`lit`: it sees her and comes) or lost her (blind: it goes for where it saw her last). */
  | { type: 'keeperSight'; id: string; x: number; y: number; lit: boolean }
  /** P3 begins: it rips the cage down; the cage lands bent on the floor at (`x`, `y`), the moths spill low. */
  | { type: 'cageFall'; lure: string; x: number; y: number }
  /** A cut on the fallen cage frees `moths` (a third of what was in it): they rise to the roof; `left` stay. */
  | { type: 'cageRelease'; lure: string; x: number; y: number; moths: number; left: number }
  /**
   * The ending (the fallback, round 12: no hazards): after the great release the den's roof gives. `groan` (the
   * roof), `dust` (falls along the roof's edges: `x`, `y` a spot), `rubble` (the slope's rubble lands: flag
   * `cn-den-collapse`), `settle` (quiet; moonlight down the shaft).
   */
  | { type: 'denCollapse'; phase: 'groan' | 'dust' | 'rubble' | 'settle'; x: number; y: number }
  /**
   * The Canopy r13: a cut glanced off the Keeper's dome for a boss reason (an `enemyBlock` comes with it): `lit` =
   * P2, she stands in the cage's light (only the dark, or its eat, lets her hurt it); `gate` = the phase is not done
   * with her yet (its time or its moths: it shrugs the blow off; render: the dome's crust flashes, no crack).
   */
  | {
      type: 'keeperGlance';
      id: string;
      x: number;
      y: number;
      hitX: number;
      hitY: number;
      why: 'lit' | 'gate';
    }
  /**
   * P2's new move (r13): it waited in the dark at the light's rim and the swing brought her into it: a short, fast
   * lunge (`frames` of tell, then a ram of `px`). An `enemyWindup` / `enemyCharge` follow as for any ram.
   */
  | { type: 'keeperLunge'; id: string; x: number; y: number; dir: number; frames: number; px: number }
  /** P3 (r13): a cut on its fallen cage turns it on her: it drops what it is doing and rams at the cage's side. */
  | { type: 'keeperGuard'; id: string; x: number; y: number; dir: number }
  /**
   * P3 (r13): the fallen cage's bars are under its claws (`on`: the blade glances, `lureGuarded`) until its first
   * sweep; then open (`on` false) to her cuts.
   */
  | { type: 'cageGuard'; lure: string; x: number; y: number; on: boolean }
  /**
   * P3 (r13): the sweep's claws go through the low cloud (`x0`..`x1` at the floor `y`): she is hurt if she stands in
   * it (the boss's blade box, `boss.hit*`, for `frames`).
   */
  | { type: 'keeperSweep'; id: string; x0: number; x1: number; y: number; frames: number }
  /** Round 13 (the full escape; not sent yet): a rock falls at (`x`, `y`) after `tell` frames of trickling grit. */
  | { type: 'rockfall'; x: number; y: number; tell: number }
  /** Round 13 (not sent yet): the collapse front's top (`y`) rising behind her. */
  | { type: 'collapseFront'; y: number };
