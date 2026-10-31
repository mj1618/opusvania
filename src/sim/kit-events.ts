import type { SlashDir } from './events';

/**
 * The level kit's events (src/sim/kit.ts, memory/level-kit.md); part of `SimEvent`. Unless said
 * otherwise `x`, `y` = the piece's centre.
 *
 * - `thornHit`: thorns touched her (`x`, `y` = her feet): `hurt` (source `{kind: 'thorns'}`) fires
 *   with it; `frames` = the hold before she is put back on her last safe ground (`fallReturn` with the
 *   same `id` prefixed `thorns:`), 0 when the blow made her fade instead.
 * - `barkHit` / `barkBreak`: a cut landed on rotten bark (`hpLeft` of `hpMax` cuts left) / it broke for
 *   good (`w`, `h` its rect: the solid is gone from the next step).
 * - `kitClang`: a forward or up cut met a seed-case: nothing breaks, she is held `hitstop` frames and
 *   thrown back `recoil` px/f (`hitX`, `hitY` = where the blade met it).
 * - `gateShut`: an arena's door (`shut`) closes behind her: its trigger's flag is set (render: it drops).
 * - `flagSet`: a trigger (`by`) set a story flag in the save. `gateOpen`: a gate's flag is set: its
 *   solid is gone (`w`, `h` its rect).
 * - `gatePush`: a gate shut while her box overlapped it: she was moved clear by (`dx`, `dy`) (the Canopy r10: a
 *   gate never shuts on her).
 * - The firefly's pass (src/sim/firefly.ts, `state.kit.firefly`): `fireflyStart` (`x`, `y` = where it sets off,
 *   `frames` its length), `fireflyRelight` (it lit lamp `lure` as it passed: a `lureRelight` with `by: 'firefly'`
 *   comes first), `fireflyEnd` (`x`, `y` = the path's last point, where it is gone).
 *
 * A down cut on thorns or a seed-case, and every cut on bark, is a `slashHit` with `target.kind`
 * `thorns` / `seedCase` / `bark` (so the blade's contact, the impact and the pogo read as usual).
 */
export type KitEvent =
  | { type: 'thornHit'; id: string; x: number; y: number; hp: number; damage: number; frames: number }
  | {
      type: 'barkHit';
      id: string;
      x: number;
      y: number;
      dir: SlashDir;
      hpLeft: number;
      hpMax: number;
      floor: boolean;
    }
  | {
      type: 'barkBreak';
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      dir: SlashDir;
      floor: boolean;
      /** Lanternroot: heartwood broken by a burrback's ram (`by: 'ram'`, `dir` = its way), not by her blade. */
      by?: 'ram';
    }
  | {
      type: 'kitClang';
      id: string;
      /** A seed-case, or heartwood bark (Lanternroot: the blade clangs off it). */
      kind: 'seedCase' | 'heartwood';
      x: number;
      y: number;
      hitX: number;
      hitY: number;
      dir: SlashDir;
      hitstop: number;
      recoil: number;
    }
  | { type: 'flagSet'; flag: string; by: string; x: number; y: number }
  /**
   * A held story beat (a trigger's `hold`, journey.md: <= 3 s): from the next step no input reaches her for
   * `frames` (she slows to a stand), then `storyHoldEnd`; a button still held then is not a press (`x`, `y` =
   * her feet).
   */
  | { type: 'storyHold'; id: string; frames: number; x: number; y: number }
  | { type: 'storyHoldEnd'; id: string; x: number; y: number }
  | { type: 'gateOpen'; id: string; flag: string; x: number; y: number; w: number; h: number }
  | { type: 'gateShut'; id: string; flag: string; x: number; y: number; w: number; h: number }
  | { type: 'gatePush'; id: string; dx: number; dy: number; x: number; y: number }
  | { type: 'fireflyStart'; id: string; x: number; y: number; frames: number }
  | { type: 'fireflyRelight'; id: string; lure: string; x: number; y: number }
  | { type: 'fireflyEnd'; id: string; x: number; y: number }
  /** The firefly stops at its `hang` point (the Canopy r11): `frames` it holds there; `lure` the cage it hangs. */
  | { type: 'fireflyHang'; id: string; x: number; y: number; frames: number; lure?: string }
  /**
   * The Canopy r13, moment 4 (the chase, `FireflyPass.chase`): its beats. `start`: it sees her (the alarm flash,
   * then it bolts); `wait`: she fell behind (the low line, a fall), it hovers at its next stop flashing; `go`: she is
   * back within reach, it flies on; `nest`: it dives into the roost's mouth; `call`: at the shaft's top, one slow long
   * flash up at the sky (nothing answers); `gone`: up the shaft (`fireflyHide` comes with it). `x`, `y` = the firefly.
   */
  | {
      type: 'fireflyChase';
      id: string;
      phase: 'start' | 'wait' | 'go' | 'nest' | 'call' | 'gone';
      x: number;
      y: number;
    }
  /** The chase: a dark hook (`lure`) catches fire as it passes (a springboard from now on; `x`, `y` = the flame). */
  | { type: 'fireflyKindle'; id: string; lure: string; x: number; y: number }
  /** The chase's end: it is gone up the shaft from (`x`, `y`) (the nest is quiet after). */
  | { type: 'fireflyHide'; id: string; x: number; y: number }
  /**
   * The Canopy r13, moment 3 (`scene.sits`, `marks.tatter.sit`): she stood still near the kin long enough: it comes
   * to sit by her (render: the walk-over, the wings, the lean; the sim never moves the kin). `x`, `y` = her feet.
   */
  | { type: 'kinSit'; id: string; x: number; y: number }
  /**
   * The Canopy r13, moment 5 (`Lure.fills`): a moth of the passing stream is caught in the newly hung cage: `n` in
   * it now of `of` (`state.lures.fill`); it can be cut once full. `x`, `y` = the cage.
   */
  | { type: 'trapFill'; lure: string; n: number; of: number; x: number; y: number }
  /** The cage is full and something under the den's floor answers (the deep slam: render ~0.3 trauma, dust). */
  | { type: 'denStir'; lure: string; x: number; y: number }
  /**
   * A bounce cap threw her up (`x`, `y` = her feet): `vy` the speed (px/f, up), `height` the rise it
   * gives, `pogo` = off a down cut, `held` = jump was held (the higher throw).
   */
  | {
      type: 'capBounce';
      id: string;
      x: number;
      y: number;
      vy: number;
      height: number;
      pogo: boolean;
      held: boolean;
    }
  /** Finds (src/sim/finds.ts; `x`, `y` = the find's foot / a hollow's floor centre). The save has `room:id` in `taken`. */
  | { type: 'stoneRead'; id: string; room: string; area: string; x: number; y: number }
  | { type: 'signRead'; id: string; room: string; x: number; y: number; flag: string; rhythm: string }
  | { type: 'hollowGrant'; id: string; upgrade: string; x: number; y: number }
  /** A moonseed taken (the Downwood's keys): `count` = how many she holds now (the save's `seeds:<n>` flags). */
  | { type: 'seedTaken'; id: string; room: string; x: number; y: number; count: number };

/** What the kit adds to `slashHit.target.kind`. */
export type KitTargetKind = 'thorns' | 'seedCase' | 'bark' | 'cap' | 'bell';
