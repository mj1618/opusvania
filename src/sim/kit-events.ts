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
 * - `flagSet`: a trigger (`by`) set a story flag in the save. `gateOpen`: a gate's flag is set: its
 *   solid is gone (`w`, `h` its rect).
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
    }
  | {
      type: 'kitClang';
      id: string;
      kind: 'seedCase';
      x: number;
      y: number;
      hitX: number;
      hitY: number;
      dir: SlashDir;
      hitstop: number;
      recoil: number;
    }
  | { type: 'flagSet'; flag: string; by: string; x: number; y: number }
  | { type: 'gateOpen'; id: string; flag: string; x: number; y: number; w: number; h: number };

/** What the kit adds to `slashHit.target.kind`. */
export type KitTargetKind = 'thorns' | 'seedCase' | 'bark';
