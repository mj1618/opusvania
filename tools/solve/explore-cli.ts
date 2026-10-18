/**
 * `npx tsx tools/solve/explore-cli.ts <room> [x y] [--abilities a,b] [--flags f,g] [--creatures]`: runs the explorer
 * from a point (default the room's spawn) and prints what she can stand on, by surface, and the exits she can leave by.
 */
import { getRoom } from '../../src/scene/index';
import { PROTO_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, newSave, placePlayer, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { explore, feet, pathTo } from './explore';

const args = process.argv.slice(2);
const room = getRoom(args[0] ?? 'lr-night');
const nums = args.filter((a) => /^-?\d+$/.test(a)).map(Number);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : null;
};
const t = cloneTuning(defaultTuning);
const abil = (opt('abilities') ?? (room.abilities ?? []).join(',')).split(',').filter(Boolean);
const save = newSave(abil as never);
save.flags.push(...(opt('flags') ?? '').split(',').filter(Boolean));
save.opened.push(...(opt('opened') ?? '').split(',').filter(Boolean));
const s = createState(1, t, room, [], abil, save);
if (nums.length >= 2)
  placePlayer(s, nums[0] as number, nums[1] as number, t, withShortcuts(room, s.save), []);
for (let i = 0; i < 30; i++) {
  // settle
}
const t0 = performance.now();
const goalFlag = opt('goalflag');
const res = explore({
  scene: room,
  tuning: t,
  start: [s],
  creatures: args.includes('--creatures'),
  world: PROTO_WORLD,
  maxNodes: Number(opt('max') ?? 6000),
  ...(goalFlag ? { goal: (q: typeof s) => q.save.flags.includes(goalFlag) } : {}),
});
if (goalFlag) {
  const hit = [...res.nodes.values()].find((n) => n.state.save.flags.includes(goalFlag));
  console.log(
    hit ? `goal ${goalFlag}: ${pathTo(res, hit).macros.join(' > ')}` : `goal ${goalFlag}: NOT FOUND`,
  );
}
const ms = performance.now() - t0;
const tops = new Map<number, number[]>();
for (const n of res.nodes.values()) {
  const f = feet(n.state);
  const list = tops.get(Math.round(f.y)) ?? [];
  list.push(Math.round(f.x));
  tops.set(Math.round(f.y), list);
}
console.log(
  `${res.nodes.size} nodes, ${res.steps} steps, ${Math.round(ms)} ms${res.truncated ? ' (truncated)' : ''}`,
);
for (const [y, xs] of [...tops.entries()].sort((a, b) => a[0] - b[0])) {
  xs.sort((a, b) => a - b);
  const spans: string[] = [];
  let a = xs[0] as number;
  let b = a;
  for (const x of xs.slice(1)) {
    if (x - b > 64) {
      spans.push(`${a}-${b}`);
      a = x;
    }
    b = x;
  }
  spans.push(`${a}-${b}`);
  console.log(`  y ${y}: ${spans.join(' ')}`);
}
for (const [id, e] of res.exits)
  console.log(`  exit ${id}: from ${e.from.key} by ${e.macro} (${pathTo(res, e.from).macros.join(' > ')})`);
const want = opt('path');
if (want) {
  const [wx, wy] = want.split(',').map(Number);
  for (const n of res.nodes.values()) {
    const f = feet(n.state);
    if (Math.abs(f.x - (wx as number)) < 40 && Math.abs(f.y - (wy as number)) < 4) {
      const pt = pathTo(res, n);
      console.log('path:', pt.macros.join(' > '));
      // Replay the tape and say where each fling, kindle and landing happened.
      const r2 = cloneState(s);
      const ev: SimEvent[] = [];
      for (const [k, m] of pt.tape.entries()) {
        ev.length = 0;
        step(r2, m, t, room, ev, PROTO_WORLD);
        for (const e of ev)
          if (
            e.type === 'fling' ||
            e.type === 'flingStart' ||
            e.type === 'land' ||
            e.type === 'lureKindle' ||
            e.type === 'jump'
          )
            console.log(
              `  ${k} ${e.type} ${'id' in e ? e.id : ''} at ${Math.round(e.x)},${Math.round(e.y)} feet ${Math.round(r2.player.x + 20)},${Math.round(r2.player.y + 80)}`,
            );
      }
      break;
    }
  }
}
