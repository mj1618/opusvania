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
