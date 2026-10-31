/**
 * The chase's high line as an input tape (the Canopy r13, moment 4): from the gap's shelf (feet 4300, 1344, claws and
 * glide, after `--pre` settle frames), walk in (the alarm), under the first hook, jump into its reach, then the S
 * fling by fling (each let go once the next hook is in reach), off the seventh (r14) west into the roost's mouth, then wait for the
 * call. Prints the tape in the input DSL for `npm run clip -- --room cn-gap --at 4300,1344 --script "<tape>"`, and
 * the events it met.
 *   npx tsx tools/levels/chase-probe.ts [--pre=30] [--fall]
 * `--fall`: she walks off the shelf's lip instead of flinging (the firefly waits at its stop).
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
const BEAT = Number(process.argv.find((a) => a.startsWith('--beat='))?.slice(7) ?? 0);
const CLOSEST = process.argv.includes('--closest');
const AIM7 =
  (
    { L: ActionBit.left, UL: ActionBit.up | ActionBit.left, DL: ActionBit.down | ActionBit.left } as Record<
      string,
      number
    >
  )[process.argv.find((a) => a.startsWith('--aim7='))?.slice(7) ?? 'L'] ?? ActionBit.left;
const pre = Number(process.argv.find((a) => a.startsWith('--pre='))?.slice(6) ?? 30);
const kit = ['wallJump', 'glide'] as never;
const s = createState(1, t, gap, [], kit, newSave(kit));
placePlayer(s, 4300, 1344, t, withShortcuts(gap, s.save), []);
const tape: number[] = [];
const seen: string[] = [];
const { jump: J, right: R, left: L, up: U, down: D, lamp: B } = ActionBit;
const run = (m: number, n = 1) => {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, m, t, withShortcuts(gap, s.save), e, W);
    tape.push(m);
    for (const q of e)
      if (q.type.startsWith('firefly') || q.type === 'fling')
        seen.push(
          `${tape.length} (${Math.round(s.player.x + s.player.w / 2)},${s.player.y + s.player.h}) ${q.type} ${(q as { phase?: string; lure?: string; id?: string }).phase ?? (q as { lure?: string }).lure ?? (q as { id?: string }).id ?? ''}`,
        );
  }
};
const ix = (id: string) => (gap.lures ?? []).findIndex((l) => l.id === id);
const reach = () => flingTarget(s, withShortcuts(gap, s.save), t);
for (let k = 0; k < pre; k++) step(s, 0, t, withShortcuts(gap, s.save), [], W);
run(L, 40);
run(0, 40);
if (process.argv.includes('--fall')) {
  run(L, 160);
  run(0, 300);
} else {
  for (let k = 0; k < 120 && Math.abs(s.player.x + s.player.w / 2 - 4150) > 12; k++)
    run(s.player.x + s.player.w / 2 < 4150 ? R : L);
  for (let n = 0; reach() !== ix('hook-1') && n < 40; n++) run(J);
  const plan: Array<[number, string]> = [
    [U, 'hook-2'],
    [U, 'hook-3'],
    [L, 'hook-4'],
    [D | L, 'hook-5'],
    [D | R, 'hook-6'],
    [D | L, 'hook-7'],
    [AIM7, ''],
  ];
  for (const [aim, next] of plan) {
    run(aim | B, 4);
    run(aim);
    const got = () => reach() === ix(next);
    for (let k = 0; k < 160 && (next === '' || !got()); k++) {
      run(aim & (L | R));
      if (next === '' && s.player.grounded && k > 4) break;
    }
    // (A person's beat between seeing the lamp in reach and pressing: `--beat`, while it stays in reach; `--closest`:
    // she presses as the lamp is nearest, the way one aims at it.)
    for (let k = 0; k < BEAT && got(); k++) run(aim & (L | R));
    if (CLOSEST && next !== '') {
      const lid = reach();
      const l = (gap.lures ?? [])[lid];
      const dist = () =>
        l ? Math.hypot(l.x - (s.player.x + s.player.w / 2), l.y - (s.player.y + s.player.h / 2)) : 0;
      let d0 = dist();
      for (let k = 0; k < 40 && reach() === lid; k++) {
        run(aim & (L | R));
        const d1 = dist();
        if (d1 > d0) break;
        d0 = d1;
      }
    }
  }
  run(0, 420);
}
// Run-length DSL.
const letters: Array<[number, string]> = [
  [L, 'L'],
  [R, 'R'],
  [U, 'U'],
  [D, 'D'],
  [J, 'J'],
  [B, 'B'],
];
const word = (m: number) =>
  letters
    .filter(([b]) => (m & b) !== 0)
    .map(([, c]) => c)
    .join('+') || '.';
const out: string[] = [];
for (let i = 0; i < tape.length; ) {
  let j = i;
  while (j < tape.length && tape[j] === tape[i]) j++;
  out.push(`${word(tape[i] as number)}${j - i}`);
  i = j;
}
console.error(seen.join('\n'));
console.error(
  `feet (${Math.round(s.player.x + s.player.w / 2)}, ${s.player.y + s.player.h}), ${tape.length} frames`,
);
console.log(out.join(' '));
