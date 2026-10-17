import type { Graphics } from 'pixi.js';
import type { KitState } from '../sim/kit';
import type { Scene } from '../sim/scene';
import { tuning } from '../sim/tuning';

/** What the collision overlay needs of the level kit (set by the debug API). */
export interface KitBoxes {
  kit: Readonly<KitState>;
  flags: readonly string[];
}

/**
 * The level kit's true boxes (memory/level-kit.md) for the collision overlay (F2): thorns red, a
 * seed-case's hit box amber, rotten bark brown while it stands (thick while cut), gates white while shut,
 * triggers cyan (dim once set).
 */
export function drawKitBoxes(g: Graphics, scene: Scene, k: KitBoxes): void {
  for (const r of scene.thorns ?? []) g.rect(r.x, r.y, r.w, r.h).stroke({ color: 0xff3b47, width: 2 });
  const half = tuning.kit.seedCase.size / 2;
  for (const c of scene.seedCases ?? [])
    g.rect(c.x - half, c.y - half, 2 * half, 2 * half).stroke({ color: 0xffb347, width: 2 });
  (scene.bark ?? []).forEach((b, i) => {
    const left = k.kit.bark[i] ?? 0;
    if (left <= 0) return;
    const max = b.hp ?? tuning.kit.bark.hp;
    g.rect(b.x, b.y, b.w, b.h).stroke({ color: 0xc9a46c, width: left < max ? 4 : 2 });
  });
  for (const gt of scene.gates ?? [])
    if (!k.flags.includes(gt.flag)) g.rect(gt.x, gt.y, gt.w, gt.h).stroke({ color: 0xffffff, width: 2 });
  for (const t of scene.triggers ?? [])
    g.rect(t.x, t.y, t.w, t.h).stroke({
      color: 0x5cc8e0,
      width: 2,
      alpha: k.flags.includes(t.sets) ? 0.3 : 0.9,
    });
}
