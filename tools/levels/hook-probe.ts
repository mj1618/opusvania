/**
 * Hook probe (the Canopy r14): her centre placed at offsets round a chase hook (lit), she presses Lamp at once with
 * an aim and holds its side: where she ends (the roost's pocket, the shelf, the bramble). For hanging the chase's
 * hooks so an on-reach press holds.
 *   npx tsx tools/levels/hook-probe.ts <hook-id> [--at=x,y] [--aims=L,UL,DL]
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const gap = getRoom('cn-gap');
const id = process.argv[2] ?? 'hook-7';
const lures = gap.lures ?? [];
const k = lures.findIndex((l) => l.id === id);
const l = lures[k];
if (!l) throw new Error(`no ${id}`);
const at = process.argv.find((a) => a.startsWith('--at='))?.slice(5);
if (at) {
  const [x, y] = at.split(',').map(Number);
  l.x = x as number;
  l.y = y as number;
}
const { left: L, right: R, up: U, down: D, lamp: B } = ActionBit;
const AIM: Record<string, number> = { L, UL: U | L, DL: D | L, U, R, UR: U | R, DR: D | R, D };
const aims = (process.argv.find((a) => a.startsWith('--aims='))?.slice(7) ?? 'L,UL').split(',');
const kit = ['wallJump', 'glide'] as never;
const flags = [
  'cn-firefly-gap',
  'cn-firefly-gap-done',
  ...lures.filter((q) => q.after).map((q) => q.after as string),
];
for (const name of aims) {
  const row: string[] = [];
  for (const [dx, dy] of [
    [60, -60],
    [80, 0],
    [60, 60],
    [0, -90],
    [0, 90],
    [-60, -60],
    [-80, 0],
    [-60, 60],
  ] as const) {
    const save = newSave(kit);
    save.flags.push(...flags);
    const s = createState(1, t, gap, [], kit, save);
    const sc = withShortcuts(gap, s.save);
    placePlayer(s, l.x + dx, l.y + dy + s.player.h / 2, t, sc, []);
    const aim = AIM[name] ?? L;
    let pressed = false;
    let end = 'air';
    for (let f = 0; f < 240; f++) {
      const ev: SimEvent[] = [];
      let m = aim & (L | R);
      if (!pressed && flingTarget(s, sc, t) === k) {
        m = aim | B;
        pressed = true;
        for (let i = 0; i < 3; i++) step(s, aim | B, t, sc, ev, W);
        step(s, aim, t, sc, ev, W);
        continue;
      }
      step(s, m, t, sc, ev, W);
      if (ev.some((q) => q.type === 'thornHit')) {
        end = `thorns (${Math.round(s.player.x)})`;
        break;
      }
      if (pressed && s.player.grounded && f > 6) {
        end = `${Math.round(s.player.x + s.player.w / 2)},${s.player.y + s.player.h}`;
        break;
      }
    }
    row.push(`${dx},${dy}:${pressed ? end : 'no reach'}`);
  }
  console.log(`${name.padEnd(3)} ${row.join('  ')}`);
}
