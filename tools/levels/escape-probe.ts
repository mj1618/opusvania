/**
 * The full escape played by a simple person-like controller (the Canopy r14, moment 7; r15: the den's floor run, then
 * the clifftop's chimney): from the fallen cage the moment the roof gives (`cn-den-collapse`), east along the floor,
 * over the mound, through the breach and the corridor into the way out, down its shaft, up the chimney's three legs
 * under the rising earth, onto the clifftop. Her moves are planned (a person knows where she jumps); `--careful` waits
 * for a rock telling or falling over where she goes next, seen only `--lag` frames after its grit starts (a person's
 * reaction); a kick waits `--delay` frames on the wall. Prints the escape's events, its length (the den, the way out),
 * the hits, and the tape in the input DSL (`npm run clip -- --room cn-den --at 1856,1344 --flags ... --script "<tape>"`).
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
  /** Frames in the den (to the crossing into the way out). */
  den: number;
  hits: string[];
  events: string[];
  tape: number[];
  end: string;
  /** The closest the front came under her feet while it ran (px), and the farthest (where she stands or holds a wall). */
  gapMin: number;
  gapMax: number;
}

const { jump: J, right: R, left: L } = ActionBit;

/** One run of the escape. `startX`: her feet on the den's floor when the roof gives. */
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
  const scene = () => withShortcuts(W.rooms[s.room]?.scene ?? den, s.save);
  placePlayer(s, o.startX ?? 1856, 1344, t, scene(), []);
  const plan = new EscapePlan(o);
  const tape: number[] = [];
  const hits: string[] = [];
  const events: string[] = [];
  let end = 'timeout';
  let denF = -1;
  let gapMin = 1e9;
  let gapMax = 0;
  let f = 0;
  for (; f < (o.max ?? 4800); f++) {
    const p = s.player;
    const cx = p.x + p.w / 2;
    const fy = p.y + p.h;
    const sc = scene();
    const m = plan.act(s, sc);
    const esc = s.kit.escape;
    // (Under her where she stands or holds a wall: in a kick's rise she is up to ~250 over where the front follows.)
    if (esc.frontOn === 1 && !s.caught && (p.grounded || p.mode === 'wallSlide') && esc.t > 30) {
      gapMin = Math.min(gapMin, esc.front - fy);
      gapMax = Math.max(gapMax, esc.front - fy);
    }
    if (o.trace && f % 3 === 0)
      console.error(
        `${f} ${s.room} (${Math.round(cx)},${Math.round(fy)}) g${p.grounded ? 1 : 0} ${p.mode} vy ${p.vy.toFixed(1)} m ${m} front ${esc.frontOn ? Math.round(esc.front) : '-'}`,
      );
    const ev: SimEvent[] = [];
    step(s, m, t, sc, ev, W);
    tape.push(m);
    for (const e of ev) {
      if (e.type === 'escapeHit') hits.push(`${f} ${s.room} ${e.what} (${e.x},${e.y})`);
      if (e.type === 'roomEnter' && e.room === 'cn-out' && denF < 0) denF = f;
      if (
        e.type === 'escapeStart' ||
        e.type === 'rockfall' ||
        e.type === 'collapseFront' ||
        e.type === 'escapeCheckpoint' ||
        e.type === 'escapeHit' ||
        e.type === 'escapeEnd' ||
        e.type === 'fallReturn' ||
        e.type === 'roomEnter'
      ) {
        const q = e as { phase?: string; id?: string; what?: string; cp?: number; y?: number; room?: string };
        events.push(
          `${f} ${e.type} ${q.phase ?? ''}${q.what ?? ''}${q.cp ?? ''}${q.room ?? ''} ${q.id ?? ''} y ${Math.round(q.y ?? 0)} her (${Math.round(cx)},${Math.round(fy)})`,
        );
      }
      if (e.type === 'escapeEnd') end = 'escaped';
    }
    if (end === 'escaped') break;
  }
  return { pass: end === 'escaped', frames: f, den: denF, hits, events, tape, end, gapMin, gapMax };
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
    max: Number(arg('max') ?? 4800),
  });
  if (!process.argv.includes('--quiet')) console.error(r.events.join('\n'));
  console.error(
    `${r.end} in ${r.frames} frames (${(r.frames / 60).toFixed(1)} s: the den ${(r.den / 60).toFixed(1)} s), front ${Math.round(r.gapMin)}-${Math.round(r.gapMax)} px under her, hits: ${r.hits.join('; ') || 'none'}`,
  );
  console.log(dsl(r.tape));
}
