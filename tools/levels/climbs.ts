/**
 * The Canopy's set-piece climbs, played the way a person plays them (review r4 #1: the climbs were frame-perfect).
 *
 * A climb starts standing on a rest (she stands there long enough for it to be her safe ground), runs at a face and
 * jumps, then kicks at every wall touch after a reaction delay (frames of slide or rise along the face before the
 * press). Each touch is a choice the plan makes from what a person sees, the height she is at: kick up the same face
 * (hold into it) or kick across (hold away). It passes when she stands on the goal rest.
 *
 * `tests/unit/canopy-climbs.test.ts` holds every required climb to: passes at delays 0, 6 and 10 from three start x
 * 64 px apart, with every thorn strip grown 64 px at both ends (the margin), and fails with one face only.
 * CLI: `npx tsx tools/levels/climbs.ts [climb ...] [--margin 64] [--delays 0,6,10]` prints the table.
 */
import { getRoom } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const L = ActionBit.left;
const R = ActionBit.right;
const J = ActionBit.jump;
const U = ActionBit.up;
const A = ActionBit.attack;

/** One leg of a plan: `face` = kick up the face she is on until a touch at or over `until` (feet y), then across;
 * `zig` = kick across at every touch until one at or over `until`. The last leg runs to the goal. */
export interface Leg {
  mode: 'face' | 'zig';
  until?: number;
}

export interface Plan {
  name: string;
  /** The first face she jumps at: -1 west, 1 east. */
  first: -1 | 1;
  legs: Leg[];
  /** Frames she first moves away from the face (out from under a lip over the rest). */
  away?: number;
  /** Up cuts in the air (a plug across the chimney). */
  cut?: boolean;
  /** She walks toward the first face and jumps when her feet pass this x (the lip of a rest); one per start x. */
  jumpAt?: number[];
}

export interface Climb {
  id: string;
  room: string;
  /** What it is, for the table. */
  note: string;
  /** Start x (feet centre) on the rest, and the rest's top. */
  xs: number[];
  y: number;
  /** Standing here (feet at or over y) = passed; or leaving by the exit `exit`. */
  goal: { x0: number; x1: number; y: number; exit?: string };
  /** Every plan must pass (either face first where the shape allows). */
  plans: Plan[];
  /** Plans that must NOT pass (one face only: the set piece is not a ladder). */
  fails?: Plan[];
  /** The abilities she has. */
  kit?: string[];
}

export interface Result {
  pass: boolean;
  end: string;
  top: number;
  touches: string[];
  /** Where a thorn hit put her back (feet), if one did. */
  back?: { x: number; y: number };
}

const DIR = (d: number) => (d > 0 ? R : L);

/** The room with every thorn strip grown `margin` px at both ends, creatures and glades out. */
export function climbScene(room: string, margin = 0): Room {
  const full = getRoom(room);
  const thorns = (full.thorns ?? []).map((t) => ({ ...t, y: t.y - margin, h: t.h + 2 * margin }));
  return { ...full, enemies: [], glades: [], thorns } as Room;
}

/** Plays one plan from one start x with one reaction delay. */
export function runClimb(
  c: Climb,
  plan: Plan,
  x: number,
  delay: number,
  margin = 0,
  jumpAt?: number,
): Result {
  const t = cloneTuning(defaultTuning);
  const scene = climbScene(c.room, margin);
  const W = getWorld('canopy');
  const kit = (c.kit ?? ['wallJump']) as never;
  const s = createState(1, t, scene, [], kit, newSave(kit));
  placePlayer(s, x, c.y, t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
  const STAND = 40;
  let h: number = plan.first;
  let leg = 0;
  let touchK = -1;
  let prev = 0;
  let wall = 0;
  let top = 1e9;
  const touches: string[] = [];
  let end = 'timeout';
  let pass = false;
  /** The frame she jumps from the rest (at once, or at the lip). */
  let jumpF = jumpAt === undefined ? 0 : -1;
  let back: Result['back'];
  for (let k = 0; k < STAND + 1800; k++) {
    const p = s.player;
    const f = k - STAND;
    let m = 0;
    if (f >= 0) {
      const fx0 = p.x + p.w / 2;
      if (jumpF < 0 && jumpAt !== undefined && (plan.first > 0 ? fx0 >= jumpAt : fx0 <= jumpAt)) jumpF = f;
      const air = jumpF < 0 ? -1 : f - jumpF;
      if (air > 20 && p.grounded) {
        const fx = p.x + p.w / 2;
        const fy = Math.round(p.y + p.h);
        pass = fy <= c.goal.y && fx >= c.goal.x0 && fx <= c.goal.x1;
        end = pass ? 'goal' : `landed (${Math.round(fx)}, ${fy})`;
        break;
      }
      m = DIR(air >= 0 && air < (plan.away ?? 0) ? -h : h);
      if (p.grounded) m |= air >= 0 && air < 20 ? J : 0;
      else if (air >= (plan.away ?? 0) && (p.mode === 'wallSlide' || p.wallDir === h)) {
        if (touchK < 0) touchK = f;
        if (f - touchK >= delay && !(prev & J)) {
          const fy = Math.round(p.y + p.h);
          const lg = plan.legs[leg] ?? { mode: 'zig' };
          let across = true;
          if (lg.mode === 'face') {
            across = lg.until !== undefined && fy <= lg.until;
            if (across) leg++;
          } else if (lg.until !== undefined && fy <= lg.until) leg++;
          if (across) h = -h;
          m = DIR(h) | J;
          touchK = -1;
        }
      } else {
        touchK = -1;
        if (air >= 0 && air < 20 && prev & J) m |= J;
      }
      if (plan.cut && !p.grounded) m |= U | (f % 12 < 2 ? A : 0);
    }
    const ev: SimEvent[] = [];
    step(s, m, t, scene, ev, W);
    prev = m;
    const fy = Math.round(p.y + p.h);
    if (s.player.wallDir !== wall) {
      if (s.player.wallDir) touches.push(`${s.player.wallDir > 0 ? 'E' : 'W'}${fy}`);
      wall = s.player.wallDir;
    }
    if (f >= 0) top = Math.min(top, fy);
    const hit = ev.find((e) => e.type === 'thornHit');
    if (hit) {
      end = `thorns ${(hit as { id: string }).id} (${Math.round(p.x + p.w / 2)}, ${fy})`;
      // Where the return puts her (the hold, then the fade-in).
      for (let j = 0; j < 90; j++) step(s, 0, t, scene, [], W);
      back = { x: Math.round(s.player.x + s.player.w / 2), y: Math.round(s.player.y + s.player.h) };
      break;
    }
    if (s.exit) {
      pass = s.exit.id === c.goal.exit;
      end = pass ? 'goal (exit)' : `exit ${s.exit.id}`;
      break;
    }
  }
  return back ? { pass, end, top, touches, back } : { pass, end, top, touches };
}

export const DELAYS = [0, 6, 10];
export const MARGIN = 64;

// ---------------------------------------------------------------------------------------------------------------
// The required climbs (and the Elder, the optional hardest). Coordinates room-local, as in tools/levels/canopy.ts.

export const CLIMBS: Climb[] = [
  {
    id: 'well-1',
    room: 'cn-well',
    note: "leg 1 (the claws' first use): up the shaft's east face onto the mouth's floor",
    xs: [1280, 1344, 1408, 1472, 1500],
    y: 4928,
    goal: { x0: 1500, x1: 2560, y: 3200 },
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'well-2',
    room: 'cn-well',
    note: 'leg 2 (the teach): the mouth floor to the landing; the east face has a strip',
    xs: [2048, 2112, 2176],
    y: 3200,
    goal: { x0: 1536, x1: 2048, y: 2432 },
    plans: [
      { name: 'W face', first: -1, legs: [{ mode: 'face' }] },
      { name: 'E then W', first: 1, legs: [{ mode: 'face', until: 3200 }, { mode: 'face' }] },
    ],
    fails: [{ name: 'E face only', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'well-3',
    room: 'cn-well',
    note: 'leg 3: the landing to the hollow; west strip low, east strip high',
    xs: [1664, 1728, 1792],
    y: 2432,
    goal: { x0: 256, x1: 2560, y: 1152 },
    plans: [
      {
        name: 'E, over the W strip to W',
        first: 1,
        jumpAt: [1936, 1984, 2032],
        legs: [{ mode: 'face', until: 1856 }, { mode: 'face' }],
      },
    ],
    fails: [{ name: 'E face only', first: 1, jumpAt: [1936, 1984, 2032], legs: [{ mode: 'face' }] }],
  },
  {
    id: 'out-1',
    room: 'cn-out',
    note: 'the way out, leg 1: the chimney floor to the rest under the plug',
    xs: [1024, 1088, 1152],
    y: 1344,
    goal: { x0: 1152, x1: 1536, y: 1024 },
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'out-2',
    room: 'cn-out',
    note: 'the way out, leg 2: the rest, the plug, the clifftop',
    xs: [1344, 1408, 1472],
    y: 1024,
    goal: { x0: 0, x1: 1792, y: 384 },
    plans: [
      { name: 'W face, cutting', first: -1, cut: true, jumpAt: [1200, 1232, 1264], legs: [{ mode: 'face' }] },
    ],
  },
  {
    id: 'fork-face',
    room: 'cn-fork',
    note: "the fork's claw face up to the Grove: one clean face",
    xs: [2560, 2624, 2688],
    y: 1344,
    goal: { x0: 2752, x1: 3200, y: 576 },
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'spire-1',
    room: 'cn-spire',
    note: "the Spire's foot to the nook's mouth, up the east face",
    xs: [1024, 1088, 1152],
    y: 1472,
    goal: { x0: 1280, x1: 2560, y: 896 },
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'spire-neck',
    room: 'cn-spire',
    note: "the Spire's neck: out from under the nook's lip, kicks across",
    xs: [1296, 1328, 1352],
    y: 896,
    goal: { x0: 0, x1: 2560, y: 128, exit: 'bower' },
    plans: [
      { name: 'out, E then W', first: 1, away: 12, legs: [{ mode: 'face', until: 760 }, { mode: 'face' }] },
    ],
    fails: [{ name: 'E face only', first: 1, away: 12, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'elder-1',
    room: 'cn-elder',
    note: 'the Elder, leg 1: the floor to the rest in the east wall',
    xs: [880, 944, 1008],
    y: 2496,
    goal: { x0: 1024, x1: 1408, y: 1856 },
    plans: [
      { name: 'E face', first: 1, legs: [{ mode: 'face' }] },
      { name: 'W then E', first: -1, legs: [{ mode: 'face', until: 2496 }, { mode: 'face' }] },
    ],
    fails: [{ name: 'W face only', first: -1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'elder-2',
    room: 'cn-elder',
    note: "the Elder, leg 2: the rest to the plug's passage",
    xs: [1216, 1280, 1344],
    y: 1856,
    goal: { x0: 1024, x1: 2560, y: 1152 },
    plans: [
      {
        name: 'W then E',
        first: -1,
        jumpAt: [1072, 1048, 1024],
        legs: [{ mode: 'face', until: 1600 }, { mode: 'face' }],
      },
    ],
  },
  {
    id: 'elder-3',
    room: 'cn-elder',
    note: 'the Elder, leg 3: the passage, the plug, the gallery',
    xs: [1216, 1280, 1344],
    y: 1152,
    goal: { x0: 0, x1: 832, y: 512 },
    plans: [
      { name: 'W face, cutting', first: -1, cut: true, jumpAt: [1072, 1048, 1024], legs: [{ mode: 'face' }] },
    ],
  },
  {
    id: 'kin',
    room: 'cn-bower',
    note: "the kin (the bower's broken tree): up its east face from the limb, over the strip on its foot",
    xs: [1760, 1824, 1888],
    y: 1152,
    goal: { x0: 1280, x1: 1856, y: 384 },
    plans: [{ name: 'W face', first: -1, jumpAt: [1776, 1760, 1744], legs: [{ mode: 'face' }] }],
  },
];

if (process.argv[1]?.endsWith('climbs.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const margin = Number(opt('--margin') ?? 0);
  const delays = (opt('--delays') ?? DELAYS.join(',')).split(',').map(Number);
  const pick = args.length ? CLIMBS.filter((c) => args.includes(c.id)) : CLIMBS;
  for (const c of pick) {
    console.log(`\n${c.id} (${c.room}): ${c.note}`);
    for (const [kind, plans] of [
      ['must pass', c.plans],
      ['must fail', c.fails ?? []],
    ] as const)
      for (const plan of plans)
        for (const [i, x] of c.xs.entries())
          for (const d of delays) {
            const r = runClimb(c, plan, x, d, margin, plan.jumpAt?.[i]);
            const ok = kind === 'must pass' ? r.pass : !r.pass;
            console.log(
              `  ${ok ? 'ok  ' : 'FAIL'} ${kind} ${plan.name} x${x} d${d}: top ${r.top} ${r.end}` +
                `${r.back ? ` -> back (${r.back.x}, ${r.back.y})` : ''}  [${r.touches.slice(0, 14).join(' ')}]`,
            );
          }
  }
}
