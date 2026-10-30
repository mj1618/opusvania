/**
 * Finds (docs/design/core.md §6, memory/level-kit.md): the three small kinds of optional reward beside
 * the lamps. Each is once ever: the save keeps `room:id` in `taken` (like a glade).
 *
 *  - **Moth-stone**: her box touching it (`finds.stoneWidth` x `stoneHeight` over its foot) draws its
 *    `area` on the map (render reads `taken` and the stone's `area`): `stoneRead`.
 *  - **Firefly sign**: standing still beside it (grounded, no direction held, not moving) for
 *    `finds.signFrames` reads it: its `flag` (if any) is set; `signRead` carries its `rhythm` for render.
 *  - **Moonlit hollow**: her body centre inside the rect grants its upgrade (the flag
 *    `upgrade:<id>`, src/sim/upgrades.ts): `hollowGrant`.
 *  - **Moonseed** (the Downwood's keys): her box touching it (`finds.seedSize` square round it) takes it:
 *    `seed:<room>:<id>` and `seeds:1..n` in `flags`, `seedTaken`.
 *
 * Finds never change where she can go (the world check knows: src/scene/world.ts).
 * Pure: + - * / min max abs.
 */
import type { SimEvent } from './events';
import type { Scene } from './scene';
import type { GameState } from './state';
import type { Tuning } from './tuning';
import { isUpgrade, upgradeFlag } from './upgrades';

/** Adds `id` to a save list once. True if it was new. */
function remember(list: string[], id: string): boolean {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

/** Once a step, after her move (from `updateKit`). `still` counts the frames she has stood by a sign. */
export function updateFinds(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  const save = state.save;
  const kit = state.kit;
  if (p.faded > 0 || p.hp <= 0) {
    kit.signStill = 0;
    return;
  }
  const F = t.finds;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  const cx = fx;
  const cy = p.y + p.h / 2;
  const key = (id: string) => `${scene.id}:${id}`;
  for (const s of scene.mothStones ?? []) {
    const hw = F.stoneWidth / 2;
    if (p.x >= s.x + hw || p.x + p.w <= s.x - hw || p.y >= s.y || p.y + p.h <= s.y - F.stoneHeight) continue;
    if (!remember(save.taken, key(s.id))) continue;
    events.push({ type: 'stoneRead', id: s.id, room: scene.id, area: s.area, x: s.x, y: s.y });
  }
  // A sign: still beside it.
  let by = -1;
  const signs = scene.signs ?? [];
  for (let i = 0; i < signs.length; i++) {
    const s = signs[i];
    if (!s || save.taken.includes(key(s.id))) continue;
    if (Math.abs(fx - s.x) <= F.signWidth / 2 && fy <= s.y + 1 && fy >= s.y - F.signHeight) {
      by = i;
      break;
    }
  }
  const still = p.grounded && p.inputX === 0 && p.vx === 0 && p.attack === 'none';
  kit.signStill = by >= 0 && still && kit.signAt === by ? kit.signStill + 1 : by >= 0 && still ? 1 : 0;
  kit.signAt = by;
  const sign = by >= 0 ? signs[by] : undefined;
  if (sign && kit.signStill >= Math.max(1, Math.round(F.signFrames))) {
    remember(save.taken, key(sign.id));
    if (sign.flag) remember(save.flags, sign.flag);
    kit.signStill = 0;
    events.push({
      type: 'signRead',
      id: sign.id,
      room: scene.id,
      x: sign.x,
      y: sign.y,
      flag: sign.flag ?? '',
      rhythm: sign.rhythm ?? '',
    });
  }
  for (const h of scene.hollows ?? []) {
    if (cx < h.x || cx >= h.x + h.w || cy < h.y || cy >= h.y + h.h) continue;
    if (!remember(save.taken, key(h.id))) continue;
    // (A moon-drop, Lanternroot: one more light per hollow, counted by `withUpgrades` from its own flag.)
    if (h.upgrade === 'moonDrop') remember(save.flags, `moonDrop:${key(h.id)}`);
    // (A moon shard, the Canopy: three make a light, counted by `withUpgrades` the same way.)
    else if (h.upgrade === 'moonShard') remember(save.flags, `moonShard:${key(h.id)}`);
    else if (isUpgrade(h.upgrade)) remember(save.flags, upgradeFlag(h.upgrade));
    events.push({ type: 'hollowGrant', id: h.id, upgrade: h.upgrade, x: h.x + h.w / 2, y: h.y + h.h });
  }
  // A moonseed: her box touching its box. The count she holds is the number of `seed:` flags; `seeds:<n>` for each
  // n up to it, so a gate on `seeds:3` opens at the third.
  const half = F.seedSize / 2;
  for (const sd of scene.moonseeds ?? []) {
    if (p.x >= sd.x + half || p.x + p.w <= sd.x - half || p.y >= sd.y + half || p.y + p.h <= sd.y - half)
      continue;
    if (!remember(save.taken, key(sd.id))) continue;
    remember(save.flags, `seed:${key(sd.id)}`);
    let count = 0;
    for (let i = 0; i < save.flags.length; i++) if ((save.flags[i] as string).startsWith('seed:')) count++;
    for (let n = 1; n <= count; n++) remember(save.flags, `seeds:${n}`);
    events.push({ type: 'seedTaken', id: sd.id, room: scene.id, x: sd.x, y: sd.y, count });
  }
}
