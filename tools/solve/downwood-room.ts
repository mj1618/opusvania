/**
 * `npx tsx tools/solve/downwood-room.ts <room> <x> <y> [kit] [...more "room x y kit" groups]`: the explorer in one
 * Downwood room from a feet point with a kit (`none`, `wallJump`, `wallJump,glide`, ...), lamps kept and spent:
 * the exits each reaches. A quick check of one room's locks while editing (the whole proof is downwood.ts).
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { createState, newSave, placePlayer } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { explore, glideClimbMacros } from './explore';

const W = getWorld('downwood');
const t = cloneTuning(defaultTuning);
const args = process.argv.slice(2);
for (let i = 0; i + 2 < args.length; i += 4) {
  const room = { ...getRoom(args[i] as string), glades: [] };
  const x = Number(args[i + 1]);
  const y = Number(args[i + 2]);
  const kit = (args[i + 3] ?? 'none') === 'none' ? [] : (args[i + 3] as string).split(',');
  for (const keep of [true, false]) {
    const save = newSave(kit as never);
    save.flags.push('dw-den-down', 'seeds:1', 'seeds:2', 'seeds:3', 'seeds:4', 'seeds:5');
    const s = createState(1, t, room, [], kit as never, save);
    placePlayer(s, x, y, t, withShortcuts(room, s.save), []);
    if (!keep)
      (room.lures ?? []).forEach((l, k) => {
        if (l.kind === 'wick' || l.kind === 'lantern') {
          s.lures.hp[k] = 0;
          s.lures.out[k] = 1;
        }
      });
    const r = explore({
      scene: room,
      tuning: t,
      start: [s],
      world: W,
      maxNodes: 4000,
      keepLamps: keep,
      more: glideClimbMacros(),
    });
    console.log(
      `${room.id} (${x}, ${y}) [${kit.join(',') || 'none'}] lamps ${keep ? 'kept ' : 'spent'}: ${r.nodes.size} nodes${r.truncated ? ' (truncated)' : ''}, exits ${[...r.exits.keys()].sort().join(' ') || '-'}`,
    );
  }
}
