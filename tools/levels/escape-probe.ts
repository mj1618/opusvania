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
  const lag = Math.max(0, o.lag ?? 0);
  const delay = Math.max(0, o.delay ?? 0);
  const tape: number[] = [];
  const hits: string[] = [];
  const events: string[] = [];
  let prev = 0;
  let end = 'timeout';
  let f = 0;
  // The stands she goes by, in order: the west shelf, the perches, the heap, the passage's floor.
  const gate = (id: string) => (den.gates ?? []).find((g) => g.id === id);
  const stands: Array<{ x0: number; x1: number; top: number }> = [{ x0: 1152, x1: 1536, top: 1088 }];
  for (let i = 1; gate(`rubble-${i}`); i++) {
    const g = gate(`rubble-${i}`);
    if (g) stands.push({ x0: g.x, x1: g.x + g.w, top: g.y });
  }
  const heap = gate('rubble-heap');
  if (heap) stands.push({ x0: heap.x, x1: heap.x + heap.w, top: heap.y });
  stands.push({ x0: 3264, x1: 3840, top: 384 });
  let next = 0;
  let jumped = -1;
  let dj = false;
  let wallT = -1;
  for (; f < (o.max ?? 3600); f++) {
    const p = s.player;
    const cx = p.x + p.w / 2;
    const fy = p.y + p.h;
    // (Where she stands now: the furthest stand under her feet; the next one is the goal.)
    if (p.grounded)
      for (let k = stands.length - 1; k >= 0; k--) {
        const q = stands[k];
        if (q && Math.abs(fy - q.top) <= 4 && cx >= q.x0 - 8 && cx <= q.x1 + 8) {
          next = Math.min(stands.length - 1, k + 1);
          if (k === stands.length - 1) next = k;
          break;
        }
      }
    const g = stands[next] as { x0: number; x1: number; top: number };
    const gx = next === stands.length - 1 ? 3800 : (g.x0 + g.x1) / 2;
    const dir = gx < cx ? -1 : 1;
    const H = dir < 0 ? L : R;
    let m = 0;
    if (s.caught) m = 0;
    else if (p.grounded) {
      dj = false;
      m = H;
      // (A careful person waits for a rock telling or falling over the next stand.)
      if (o.careful) {
        const esc = s.kit.escape;
        for (let i = 0; i < E.rocks.length; i++) {
          const r = E.rocks[i];
          const st = esc.rock[i] ?? 0;
          // (She sees the grit only `lag` frames after it starts.)
          const seen = st === 2 || (st === 1 && (esc.rockT[i] ?? 0) >= lag);
          if (r && seen && r.x + r.w / 2 > g.x0 && r.x - r.w / 2 < g.x1 && r.y1 <= g.top + 4) m = 0;
        }
      }
      // (Jump at the lip of what she stands on, or once the next stand's near edge is within reach.)
      const near = dir > 0 ? g.x0 - cx : cx - g.x1;
      const here = stands[Math.max(0, next - 1)];
      const lip = here && Math.abs(fy - here.top) <= 4 ? (dir > 0 ? here.x1 - cx : cx - here.x0) : 999;
      if (m && f - jumped > 12 && (near < 150 || lip < 24) && next < stands.length - 1) {
        m |= J;
        jumped = f;
      }
      // (Off the heap: at the den's east wall, a jump into it, then the claws up it.)
      if (next === stands.length - 1 && fy > 500) {
        m = R;
        if (cx > 3180 && f - jumped > 12) {
          m |= J;
          jumped = f;
        }
      }
    } else {
      // In the air: hold the jump 12 frames; steer at the stand, braking over it; a double jump if falling short.
      const over = cx >= g.x0 && cx <= g.x1;
      m = Math.abs(cx - gx) < 16 ? 0 : cx < gx ? R : L;
      if (next === stands.length - 1) {
        m = R;
        // (On the wall: a kick up it after `delay` frames, holding into it.)
        if (p.wallDir === 1 || p.mode === 'wallSlide') {
          if (wallT < 0) wallT = f;
          if (f - wallT >= delay && !(prev & J)) {
            m |= J;
            jumped = f;
            wallT = -1;
          }
        } else wallT = -1;
      }
      if (f - jumped < 22) m |= J;
      if (!dj && p.vy > 0 && (fy > g.top - 16 || next === stands.length - 1) && !over) {
        m |= J;
        dj = true;
      }
      if (dj && p.vy < 0) m |= J;
    }
    if (o.trace && f % 3 === 0)
      console.error(
        `${f} (${Math.round(cx)},${Math.round(fy)}) g${p.grounded ? 1 : 0} vy ${p.vy.toFixed(1)} next ${next} m ${m} front ${s.kit.escape.frontOn ? Math.round(s.kit.escape.front) : '-'}`,
      );
    // (Her moves are planned, as a person's are; only what is new (the rocks' grit) reaches her `lag` frames late.)
    const use = m;
    const ev: SimEvent[] = [];
    step(s, use, t, scene(), ev, W);
    tape.push(use);
    prev = m;
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
