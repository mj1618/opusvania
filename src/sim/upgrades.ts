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
export const UPGRADE_IDS = [
  'quickWings',
  'keenBlade',
  'nightEyes',
  'longBreath',
  'sharpWings',
  'glowVessel',
  'brightKindle',
  'moonDrop',
  'moonstep',
] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

/** What each one changes. */
const APPLY: Record<UpgradeId, (t: Tuning) => Tuning> = {
  // Quick wings: beat free of a grab (the web, the weaver) in fewer presses (the lamp's catch is gone: the fling).
  quickWings: (t) => ({
    ...t,
    grab: { ...t.grab, beats: Math.min(t.grab.beats, t.upgrades.quickWings.beats) },
  }),
  // Keen blade: the flame's hit box grows (snuffs from further off).
  keenBlade: (t) => ({
    ...t,
    lures: { ...t.lures, flameRadius: t.lures.flameRadius + t.upgrades.keenBlade.flameRadiusAdd },
  }),
  // Night eyes (area 1 plan r5): the map shows each room's lamps she has not seen. No sim number: the map
  // reads `upgradesOwned(save)`.
  nightEyes: (t) => t,
  // Long breath (wood-area1-v3): the fling's slow-time lasts longer (aiming at leisure).
  longBreath: (t) => ({
    ...t,
    lures: { ...t.lures, flingFrames: Math.round(t.lures.flingFrames * t.upgrades.longBreath.flingMult) },
  }),
  // Sharp wings (wood-area1-v3, C1's reward): a fling's launch cuts through creatures and silk. A row for now:
  // what a launch does to each creature is the creatures' rule (`upgradesOwned` has it; the launch is
  // `player.thrown` with `lureThrow` running).
  sharpWings: (t) => t,
  // Lanternroot (proto-1.md §3): the gallery vault's vessel raises the glow meter; the cache's Bright Kindle
  // makes a kindle cheaper.
  glowVessel: (t) => ({ ...t, glow: { ...t.glow, max: Math.max(t.glow.max, t.upgrades.glowVessel.max) } }),
  brightKindle: (t) => ({
    ...t,
    glow: { ...t.glow, kindleCost: Math.min(t.glow.kindleCost, t.upgrades.brightKindle.kindleCost) },
  }),
  // A moon-drop is one more light per hollow that gave one (its flag is `moonDrop:<room>:<hollow>`, counted below).
  moonDrop: (t) => t,
  // Moonstep (the boss rush, the Gloamweaver's reward): her dash goes through blows unhurt. No number: the hurt
  // checks read the flag (src/sim/index.ts `moonstepping`).
  moonstep: (t) => t,
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
  let drops = 0;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i] as string;
    if (f.startsWith('moonDrop:')) drops++;
    if (!f.startsWith('upgrade:')) continue;
    const id = f.slice(8);
    if (isUpgrade(id)) out = APPLY[id](out);
  }
  if (drops > 0) out = { ...out, health: { ...out.health, max: out.health.max + drops } };
  return out;
}
