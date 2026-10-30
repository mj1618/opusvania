/**
 * Glide probe (canopy r9b): the ways a person crosses a gap off a lip, in the real sim, and where each lands. For
 * proving a glide lock: the jumps (plain, a jump and a kick at the far face) must fall short, the glides (held through,
 * from the apex, a walk-off) must land clean.
 *
 *   npx tsx tools/levels/glide-probe.ts <room> <x> <y> <lipX> [--dir=1|-1] [--creatures] [--kit=wallJump,glide]
 * (x, y) = her feet on the take-off ground; `lipX` = the x her feet pass where she jumps (or walks off). Each line:
 * the plan, where she lands (or the thorns), her lowest point, and with `--creatures` any hit she took.
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const L = ActionBit.left;
const R = ActionBit.right;
const J = ActionBit.jump;

export interface GlideRun {
  plan: string;
  /** 'land' on ground (feet x, y), 'thorns', or 'air' (never landed in the frames). */
  end: 'land' | 'thorns' | 'air';
  x: number;
  y: number;
  hits: number;
  frames: number;
}

/** What a plan sees each frame after the take-off. */
export interface Seen {
  /** Her vy. */
  vy: number;
  /** She has just touched a wall. */
  kick: boolean;
  /** Frames since a creature's strike began (`enemyDive`), -1 if none has. */
  dive: number;
  /** Centre to centre, px, to the nearest living flyer (Infinity if none), and its height over her centre. */
  foe: number;
  foeUp: number;
  /** Her held direction (toward the far side). */
  H: number;
  /** The way back. */
  B: number;
}

const A = ActionBit.attack;
/** Jump let go at the apex, pressed again and held (the glide from the apex). */
const apex = (k: number, s: Seen): number => (k === 0 || s.vy < 0 ? J : s.vy >= 0 && s.vy < 2 ? 0 : J);

/** The plans: what she presses from the lip on (frame k after the take-off). */
export const PLANS: Array<{
  name: string;
  walkOff?: boolean;
  answer?: boolean;
  input: (k: number, s: Seen) => number;
}> = [
  // A running jump, jump let go at the apex (as high as it goes), then nothing.
  { name: 'jump', input: (k, s) => s.H | (k === 0 || s.vy < 0 ? J : 0) },
  // A running jump held all the way (the carried glide opens 16 px under the take-off).
  { name: 'jump held', input: (_k, s) => s.H | J },
  { name: 'apex glide', input: (k, s) => s.H | apex(k, s) },
  // A jump, then a press as she starts to fall a little later (a late glide).
  { name: 'late glide', input: (k, s) => s.H | (k === 0 || s.vy < 0 ? J : s.vy < 6 ? 0 : J) },
  // A walk off the lip, jump pressed 6 frames later and held (the walk-off glide).
  { name: 'walk-off glide', walkOff: true, input: (k, s) => s.H | (k >= 6 ? J : 0) },
  // A walk off the lip and a jump late in the coyote window (the explorer's `offdj`: 51 px past a running jump),
  // let go at the apex, kicking at any wall it meets.
  {
    name: 'coyote jump + kick',
    walkOff: true,
    input: (k, s) => s.H | (k === 4 || (k > 4 && s.vy < 0) ? J : s.kick ? J : 0),
  },
  // A jump that kicks at any wall it meets (the claws' way: a jump and a kick at the far face).
  { name: 'jump + kick', input: (k, s) => s.H | (k === 0 || s.vy < 0 ? J : s.kick ? J : 0) },
  { name: 'apex glide + kick', input: (k, s) => s.H | (s.kick ? J : apex(k, s)) },
  // The answers to a strike at a glide from the apex (a creature's `enemyDive`, 4 frames to react):
  // a check back (the way back held 10 frames, the wings open),
  {
    name: 'apex, check back',
    answer: true,
    input: (k, s) => (s.dive >= 4 && s.dive < 14 ? s.B : s.H) | apex(k, s),
  },
  // a drop (jump let go 8 frames, then the wings again),
  {
    name: 'apex, drop',
    answer: true,
    input: (k, s) => s.H | (s.dive >= 4 && s.dive < 12 ? 0 : apex(k, s)),
  },
  // a cut as it comes (the blade pressed once it is within 140 px in its strike).
  {
    name: 'apex, cut',
    answer: true,
    input: (k, s) =>
      s.H |
      apex(k, s) |
      (s.dive >= 0 && s.foe < 150 && k % 2 === 0 ? A | (s.foeUp > 48 ? ActionBit.up : 0) : 0),
  },
];

export function probe(
  room: string,
  x: number,
  y: number,
  lipX: number,
  dir: 1 | -1,
  kit: string[],
  creatures: boolean,
  maxFrames = 300,
  wait = 20,
  only?: string[],
): GlideRun[] {
  const t = cloneTuning(defaultTuning);
  const W = getWorld('canopy');
  const out: GlideRun[] = [];
  for (const plan of PLANS) {
    if (only && !only.includes(plan.name)) continue;
    const scene = getRoom(room);
    const base = creatures ? scene : { ...scene, enemies: [] };
    const s = createState(1, t, base, [], kit as never, newSave(kit as never));
    placePlayer(s, x, y, t, withShortcuts(base, s.save), []);
    s.player.dj = 0;
    const H = dir > 0 ? R : L;
    const ev: SimEvent[] = [];
    const run = (m: number) => {
      const e: SimEvent[] = [];
      step(s, m, t, withShortcuts(base, s.save), e, W);
      for (const q of e) ev.push(q);
    };
    for (let i = 0; i < wait; i++) run(0);
    let k = 0;
    // Run to the lip.
    while (k++ < 600) {
      const fx = s.player.x + s.player.w / 2;
      if ((dir > 0 && fx >= lipX) || (dir < 0 && fx <= lipX)) break;
      if (plan.walkOff && !s.player.grounded) break;
      run(H);
    }
    let end: GlideRun['end'] = 'air';
    let f = 0;
    let wasWall = false;
    let dive = -1;
    for (; f < maxFrames; f++) {
      const p = s.player;
      const touching = p.wallDir;
      const kick = !!touching && !wasWall;
      wasWall = !!touching;
      const n = ev.length;
      let foe = Number.POSITIVE_INFINITY;
      let foeUp = 0;
      for (const e of s.enemies) {
        if ((e.kind !== 'hawker' && e.kind !== 'lampwing') || e.mode === 'dead' || e.gone) continue;
        const d = Math.hypot(e.x + e.w / 2 - (p.x + p.w / 2), e.y + e.h / 2 - (p.y + p.h / 2));
        if (d < foe) {
          foe = d;
          foeUp = p.y + p.h / 2 - (e.y + e.h / 2);
        }
      }
      run(plan.input(f, { vy: p.vy, kick, dive, foe, foeUp, H, B: dir > 0 ? L : R }));
      if (dive >= 0) dive++;
      if (dive < 0 && ev.slice(n).some((e) => e.type === 'enemyDive')) dive = 0;
      if (ev.some((e) => e.type === 'hurt' && e.source.kind === 'thorns')) {
        end = 'thorns';
        break;
      }
      if (f > 3 && s.player.grounded) {
        end = 'land';
        break;
      }
    }
    const hits = ev.filter((e) => e.type === 'hurt' && e.source.kind !== 'thorns').length;
    out.push({
      plan: plan.name,
      end,
      x: Math.round(s.player.x + s.player.w / 2),
      y: Math.round(s.player.y + s.player.h),
      hits,
      frames: f,
    });
  }
  return out;
}

if (process.argv[1]?.endsWith('glide-probe.ts')) {
  const [room, xs, ys, lips] = process.argv.slice(2);
  const dir = (process.argv.find((a) => a.startsWith('--dir='))?.slice(6) === '-1' ? -1 : 1) as 1 | -1;
  const kit = (process.argv.find((a) => a.startsWith('--kit='))?.slice(6) ?? 'wallJump,glide').split(',');
  const creatures = process.argv.includes('--creatures');
  const sweep = process.argv.includes('--sweep');
  if (!sweep) {
    for (const r of probe(room as string, Number(xs), Number(ys), Number(lips), dir, kit, creatures))
      console.log(
        r.plan.padEnd(18),
        r.end.padEnd(7),
        `(${r.x}, ${r.y})`,
        `f${r.frames}`,
        r.hits ? `hits ${r.hits}` : '',
      );
  } else {
    // Every arrival phase (a wait of 20..380 frames before the run, 10 apart): how often each glide is hit, and
    // how often it still lands clean.
    const tally = new Map<string, { n: number; hit: number; clean: number; thorns: number }>();
    for (let w = 20; w < 380; w += 10) {
      for (const r of probe(room as string, Number(xs), Number(ys), Number(lips), dir, kit, true, 300, w)) {
        const q = tally.get(r.plan) ?? { n: 0, hit: 0, clean: 0, thorns: 0 };
        q.n++;
        if (r.hits) q.hit++;
        if (
          r.end === 'land' &&
          r.x > (Number(process.argv.find((a) => a.startsWith('--far='))?.slice(6)) || 0)
        )
          q.clean++;
        if (r.end === 'thorns') q.thorns++;
        tally.set(r.plan, q);
      }
    }
    for (const [k, q] of tally)
      console.log(k.padEnd(18), `runs ${q.n} hit ${q.hit} clean ${q.clean} thorns ${q.thorns}`);
  }
}
