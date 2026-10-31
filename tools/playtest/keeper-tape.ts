/**
 * The Keeper's fight as an input tape for a clip (the Canopy r13): headless from the den's balcony (claws and glide,
 * after `--pre` settle frames, as `npm run clip -- --room cn-den --at 300,320` starts), the den's plan with a
 * person's `--lag`, until the release and the rubble (r14 `--escape`: and the escape out onto the clifftop, careful, the
 * same lag). Prints the DSL tape; the fight's events on stderr.
 *   npx tsx tools/playtest/keeper-tape.ts [--lag=15] [--pre=30] [--escape]
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { EscapePlan } from './escape-plan';
import { fightTactics } from './fight';
import type { Line } from './lines';

const num = (k: string, d: number) =>
  Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const lag = num('lag', 15);
const pre = num('pre', 30);
const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const den = getRoom('cn-den');
const kit = ['wallJump', 'glide'] as never;
const s = createState(1, t, den, [], kit, newSave(kit));
placePlayer(s, 300, 320, t, withShortcuts(den, s.save), []);
const i = (den.enemies ?? []).findIndex((e) => e.id === 'old-burr');
const tape: number[] = [];
const log: string[] = [];
const seen: GameState[] = [];
const go = (m: number) => {
  const e: SimEvent[] = [];
  step(s, m, t, withShortcuts(W.rooms[s.room]?.scene ?? den, s.save), e, W);
  tape.push(m);
  for (const q of e)
    if (
      [
        'bossLock',
        'bossPhase',
        'hurt',
        'fade',
        'bossDefeat',
        'lureSnuff',
        'denCollapse',
        'keeperRage',
        'keeperSweepTell',
        'keeperRoll',
        'escapeStart',
        'escapeHit',
        'escapeEnd',
        'rockfall',
      ].includes(q.type)
    )
      log.push(`${tape.length} ${q.type}`);
};
for (let k = 0; k < pre; k++) step(s, 0, t, withShortcuts(den, s.save), [], W);
let line: Line | null = null;
let k = 0;
let prev = 0;
const { right: R, left: L, up: U, attack: A } = ActionBit;
for (let f = 0; f < 9000; f++) {
  const b = s.boss;
  if (!b || b.stage === 'end' || b.stage === 'down') break;
  const p = s.player;
  if (p.y + p.h < 1100 && b.stage === 'wait') {
    go(f < 200 ? 0 : R);
    continue;
  }
  seen.push(cloneState(s));
  while (seen.length > lag + 1) seen.shift();
  if (!line || k > 900) {
    line =
      fightTactics(den, i, 1, lag)
        .find((q) => q.name === 'the den')
        ?.make() ?? null;
    k = 0;
  }
  const m = line ? line.act(seen[0] ?? s, k++, prev) : 0;
  prev = m;
  go(m);
}
// The release: up cuts under the fallen cage, then the rubble.
for (let n = 0; n < 900 && !s.save.flags.includes('cn-den-freed'); n++) {
  const dx = (s.boss?.cageX ?? 0) - (s.player.x + s.player.w / 2);
  go(Math.abs(dx) > 60 ? (dx < 0 ? L : R) : n % 8 === 0 ? A | U : 0);
}
// (r14: then the escape, played as a careful person with the same lag, out onto the clifftop.)
if (process.argv.includes('--escape')) {
  while (!s.save.flags.includes('cn-den-collapse') && tape.length < 20000) go(0);
  // (r15: on through the breach into the way out and up its chimney, to the escape's end on the clifftop.)
  const plan = new EscapePlan({ careful: true, lag });
  for (let n = 0; n < 4800 && !s.save.flags.includes('cn-den-escaped'); n++)
    go(plan.act(s, withShortcuts(W.rooms[s.room]?.scene ?? den, s.save)));
  for (let n = 0; n < 240; n++) go(0);
} else for (let n = 0; n < 420; n++) go(0);
const letters: Array<[number, string]> = [
  [L, 'L'],
  [R, 'R'],
  [U, 'U'],
  [ActionBit.down, 'D'],
  [ActionBit.jump, 'J'],
  [A, 'A'],
  [ActionBit.lamp, 'B'],
];
const word = (m: number) =>
  letters
    .filter(([b]) => (m & b) !== 0)
    .map(([, c]) => c)
    .join('+') || '.';
const out: string[] = [];
for (let j = 0; j < tape.length; ) {
  let e = j;
  while (e < tape.length && tape[e] === tape[j]) e++;
  out.push(`${word(tape[j] as number)}${e - j}`);
  j = e;
}
console.error(log.join('\n'));
console.error(`${tape.length} frames`);
console.log(out.join(' '));
