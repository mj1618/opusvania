/**
 * The den's full escape played by a simple person-like controller (the Canopy r14, moment 7): from the fallen cage
 * the moment the roof gives (`cn-den-collapse`), east along the floor, up onto the slab, across to the den's east
 * wall, up the chimney with the claws, through the roof's gate and along the passage. Her moves are planned (a person
 * knows where she jumps); `--careful` waits for a rock telling or falling over the next stand, seen only `--lag`
 * frames after its grit starts (a person's reaction); a kick waits `--delay` frames on the wall. Prints the escape's events, its length, the hits, and the tape in
 * the input DSL (`npm run clip -- --room cn-den --at 1856,1344 --flags ... --script "<tape>"`).
 *   npx tsx tools/levels/escape-probe.ts [--lag=15] [--delay=6] [--careful] [--x=1856] [--quiet]
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { EscapePlan } from '../playtest/escape-plan';

export const ESCAPE_FLAGS = ['cn-den-met', 'cn-den-fed', 'cn-den-down', 'cn-den-freed', 'cn-den-collapse'];

export interface EscapeRun {
  pass: boolean;
  frames: number;
  hits: string[];
  events: string[];
  tape: number[];
  end: string;
}

const { jump: J, right: R, left: L } = ActionBit;

/** One run of the escape. `startX`: her feet on the floor when the roof gives. */
export function runEscape(
  o: { lag?: number; delay?: number; careful?: boolean; startX?: number; max?: number; trace?: boolean } = {},
): EscapeRun {
  const t = cloneTuning(defaultTuning);
  const W = getWorld('canopy');
  const den = getRoom('cn-den');
  const kit = ['wallJump', 'glide'] as never;
  const save = newSave(kit);
  save.flags.push(...ESCAPE_FLAGS);
  const s: GameState = createState(1, t, den, [], kit, save);
  const scene = () => withShortcuts(den, s.save);
  placePlayer(s, o.startX ?? 1856, 1344, t, scene(), []);
  const E = den.escape;
  if (!E) throw new Error('cn-den has no escape');
  const plan = new EscapePlan(den, o);
  const tape: number[] = [];
  const hits: string[] = [];
  const events: string[] = [];
  let end = 'timeout';
  let f = 0;
  for (; f < (o.max ?? 3600); f++) {
    const p = s.player;
    const cx = p.x + p.w / 2;
    const fy = p.y + p.h;
    const m = plan.act(s);
    if (o.trace && f % 3 === 0)
      console.error(
        `${f} (${Math.round(cx)},${Math.round(fy)}) g${p.grounded ? 1 : 0} vy ${p.vy.toFixed(1)} m ${m} front ${s.kit.escape.frontOn ? Math.round(s.kit.escape.front) : '-'}`,
      );
    // (Her moves are planned, as a person's are; only what is new (the rocks' grit) reaches her `lag` frames late.)
    const use = m;
    const ev: SimEvent[] = [];
    step(s, use, t, scene(), ev, W);
    tape.push(use);
    for (const e of ev) {
      if (e.type === 'escapeHit') hits.push(`${f} ${e.what} (${e.x},${e.y})`);
      if (
        e.type === 'escapeStart' ||
        e.type === 'rockfall' ||
        e.type === 'collapseFront' ||
        e.type === 'escapeCheckpoint' ||
        e.type === 'escapeHit' ||
        e.type === 'escapeEnd' ||
        e.type === 'fallReturn'
      ) {
        const q = e as { phase?: string; id?: string; what?: string; cp?: number; y?: number };
        events.push(
          `${f} ${e.type} ${q.phase ?? ''}${q.what ?? ''}${q.cp ?? ''} ${q.id ?? ''} y ${Math.round(q.y ?? 0)} her (${Math.round(cx)},${Math.round(fy)})`,
        );
      }
      if (e.type === 'escapeEnd') end = 'escaped';
    }
    if (end === 'escaped') break;
    if (s.exit) {
      end = `exit ${s.exit.id}`;
      break;
    }
  }
  return { pass: end === 'escaped', frames: f, hits, events, tape, end };
}

/** Run-length DSL for a tape. */
export function dsl(tape: readonly number[]): string {
  const letters: Array<[number, string]> = [
    [L, 'L'],
    [R, 'R'],
    [J, 'J'],
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
  return out.join(' ');
}

if (process.argv[1]?.endsWith('escape-probe.ts')) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const r = runEscape({
    lag: Number(arg('lag') ?? 0),
    delay: Number(arg('delay') ?? 0),
    careful: process.argv.includes('--careful'),
    startX: Number(arg('x') ?? 1856),
    trace: process.argv.includes('--trace'),
    max: Number(arg('max') ?? 3600),
  });
  if (!process.argv.includes('--quiet')) console.error(r.events.join('\n'));
  console.error(
    `${r.end} in ${r.frames} frames (${(r.frames / 60).toFixed(1)} s), hits: ${r.hits.join('; ') || 'none'}`,
  );
  console.log(dsl(r.tape));
}
