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
    if (isUpgrade(h.upgrade)) remember(save.flags, upgradeFlag(h.upgrade));
    events.push({ type: 'hollowGrant', id: h.id, upgrade: h.upgrade, x: h.x + h.w / 2, y: h.y + h.h });
  }
}
