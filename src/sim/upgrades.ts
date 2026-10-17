/**
 * Upgrades (docs/design/core.md §6, memory/level-kit.md): the small rewards of moonlit hollows. Each is a
 * save flag `upgrade:<id>` and one number: `withUpgrades` hands the step a tuning with the owned ones
 * applied (`step` calls it first, so `resolveParams` and every rule read the upgraded numbers). The
 * numbers live in `tuning.upgrades`; a new upgrade is a row there and a line here.
 *
 * Pure: shallow copies of the tuning's groups, only when an upgrade is owned (a save without one gets
 * the very tuning object back).
 */
import type { SaveState } from './state';
import type { Tuning } from './tuning';

/** Every upgrade, in the order the region docs list them. */
export const UPGRADE_IDS = ['quickWings', 'keenBlade'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

/** What each one changes. */
const APPLY: Record<UpgradeId, (t: Tuning) => Tuning> = {
  // Quick wings: beat free of a lure (or a grab) in fewer presses.
  quickWings: (t) => ({ ...t, lures: { ...t.lures, beats: t.upgrades.quickWings.beats } }),
  // Keen blade: the flame's hit box grows (snuffs from further off).
  keenBlade: (t) => ({
    ...t,
    lures: { ...t.lures, flameRadius: t.lures.flameRadius + t.upgrades.keenBlade.flameRadiusAdd },
  }),
};

export function isUpgrade(id: string): id is UpgradeId {
  return (UPGRADE_IDS as readonly string[]).includes(id);
}

/** The save flag of an upgrade. */
export function upgradeFlag(id: UpgradeId): string {
  return `upgrade:${id}`;
}

/** The upgrades the save owns, in `UPGRADE_IDS` order. */
export function upgradesOwned(save: Pick<SaveState, 'flags'>): UpgradeId[] {
  return UPGRADE_IDS.filter((id) => save.flags.includes(upgradeFlag(id)));
}

/** `t` with the save's upgrades applied (`t` itself when it owns none). */
export function withUpgrades(t: Tuning, save: Pick<SaveState, 'flags'>): Tuning {
  let out = t;
  const flags = save.flags;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i] as string;
    if (!f.startsWith('upgrade:')) continue;
    const id = f.slice(8);
    if (isUpgrade(id)) out = APPLY[id](out);
  }
  return out;
}
