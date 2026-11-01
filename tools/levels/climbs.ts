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
 * CLI: `npx tsx tools/levels/climbs.ts [climb ...] [--margin 64] [--delays 0,6,10] [--creatures]` prints the table.
 *
 * With the creatures in (review r6 #3: `climbScene` stripped them, and leg 3's lampwing turned out a toll in 30 of 36
 * runs): `runClimb(..., { creatures: true })` keeps the room's creatures, plays on through a hit (the knock may undo the
 * climb) and counts them (`hits`) and what she killed (`kills`). `CREATURE_CLIMBS` are the plans held that way.
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
  /** She walks the other way to `jumpAt` (out of a rest onto its lip), then jumps holding toward the first face. */
  back?: boolean;
  /** Pickups (ids) she must have taken when she gets there: a reward off the line (review r5 #2). */
  takes?: string[];
  /** Jumps straight up from where she stands first, cutting up (a plug over a rest's lip), before the climb. */
  hops?: number;
  /** She walks off the lip at `jumpAt` instead of jumping (down the face first: a reward under the rest). */
  drop?: boolean;
  /** Kick delays it must pass at (default `DELAYS`): a reward off the line is a risk, held at 0 and 6 only. */
  delays?: number[];
  /** The strips' margin it must pass with (default `MARGIN`): a risk keeps half of it. */
  margin?: number;
  /** Frames she stands still on the rest first (watching a creature's dive go by). */
  wait?: number;
  /** Start x for this plan (one for every start: she stands there, a rest's lip). */
  at?: number;
  /**
   * She reads tells (with the creatures in, r22): while any creature of the room is in its tell or its strike she
   * kicks no more and slides on the wall she holds (a huntsman leaps where she was going: holding still dodges it).
   */
  wary?: boolean;
  /** Creatures (ids) she must have killed by the end (with the creatures in). */
  kills?: string[];
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
  /** Story flags saved before the climb (the Canopy r14: the den's escape, after the roof gives). */
  flags?: string[];
}

export interface Result {
  pass: boolean;
  end: string;
  top: number;
  touches: string[];
  /** Where a thorn hit put her back (feet), if one did. */
  back?: { x: number; y: number };
  /** With the creatures in: the hits she took, and the creatures she killed. */
  hits?: number;
  kills?: string[];
}

const DIR = (d: number) => (d > 0 ? R : L);

/** A pickup of the scene she has taken (its timer runs once it wakes toward her). */
function taken(s: ReturnType<typeof createState>, scene: Room, id: string): boolean {
  const i = (scene.pickups ?? []).findIndex((p) => p.id === id);
  return i >= 0 && (s.pickups.timers[i] ?? 0) !== 0;
}

/** The room with every thorn strip grown `margin` px at both ends, glades out, creatures out unless `creatures`. */
export function climbScene(room: string, margin = 0, creatures = false): Room {
  const full = getRoom(room);
  const thorns = (full.thorns ?? []).map((t) => ({ ...t, y: t.y - margin, h: t.h + 2 * margin }));
  return { ...full, enemies: creatures ? full.enemies : [], glades: [], thorns } as Room;
}

/** Plays one plan from one start x with one reaction delay. */
export function runClimb(
  c: Climb,
  plan: Plan,
  x: number,
  delay: number,
  margin = 0,
  jumpAt?: number,
  o: { creatures?: boolean } = {},
): Result {
  const t = cloneTuning(defaultTuning);
  const scene = climbScene(c.room, margin, o.creatures);
  const W = getWorld('canopy');
  const kit = (c.kit ?? ['wallJump']) as never;
  const save = newSave(kit);
  save.flags.push(...(c.flags ?? []));
  const s = createState(1, t, scene, [], kit, save);
  placePlayer(s, plan.at ?? x, c.y, t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
  const STAND = 40 + (plan.wait ?? 0);
  let hits = 0;
  const kills: string[] = [];
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
  let jumpF = jumpAt === undefined && !plan.hops ? 0 : -1;
  let back: Result['back'];
  let hops = plan.hops ?? 0;
  /** With the creatures in: a knock back onto the rest is a try lost, not the end (twice). */
  let retries = 2;
  let hopUp = false;
  let hopF = 0;
  /** Walking back to her start x on the rest after a knock (then the climb again). */
  let home = false;
  for (let k = 0; k < STAND + 1800; k++) {
    const p = s.player;
    const f = k - STAND;
    let m = 0;
    if (f >= 0 && hops > 0) {
      // Hops in place: jump (held to the top), cut up on the way, land, again.
      if (p.grounded && !hopUp) {
        if (f - hopF > 6) {
          m = J;
          hopUp = true;
          hopF = f;
        }
      } else if (!p.grounded) {
        m = J | U | ((f - hopF) % 12 < 2 ? A : 0);
      } else if (hopUp && f - hopF > 8) {
        hopUp = false;
        hops--;
        hopF = f;
      }
      if (hops === 0) touchK = -1;
    } else if (f >= 0 && home) {
      const fx0 = p.x + p.w / 2;
      const to = plan.at ?? x;
      if (Math.abs(fx0 - to) > 6) m = DIR(to - fx0);
      else {
        home = false;
        jumpF = jumpAt === undefined ? f + 1 : -1;
      }
    } else if (f >= 0) {
      const fx0 = p.x + p.w / 2;
      if (jumpF < 0 && plan.hops && jumpAt === undefined) jumpF = f;
      const walk = plan.back ? -plan.first : plan.first;
      if (jumpF < 0 && jumpAt !== undefined && (walk > 0 ? fx0 >= jumpAt : fx0 <= jumpAt)) jumpF = f;
      const air = jumpF < 0 ? -1 : f - jumpF;
      if (air > 20 && p.grounded) {
        const fx = p.x + p.w / 2;
        const fy = Math.round(p.y + p.h);
        pass = fy <= c.goal.y && fx >= c.goal.x0 && fx <= c.goal.x1;
        end = pass ? 'goal' : `landed (${Math.round(fx)}, ${fy})`;
        if (pass && plan.takes) {
          const missed = plan.takes.filter((id) => !taken(s, scene, id));
          if (missed.length) {
            pass = false;
            end = `goal without ${missed.join(', ')}`;
          }
        }
        if (pass && plan.kills) {
          const alive = plan.kills.filter((id) => !kills.includes(id));
          if (alive.length) {
            pass = false;
            end = `goal with ${alive.join(', ')} alive`;
          }
        }
        // (A creature's knock back onto the rest she started from is not the end: she climbs again.)
        if (!pass && o.creatures && fy === c.y && retries-- > 0) {
          // (r22: a huntsman's hit can throw her along the rest, away from the foot: she walks back to her start.)
          home = true;
          jumpF = -1;
          leg = 0;
          h = plan.first;
          touchK = -1;
          continue;
        }
        break;
      }
      m = DIR((air >= 0 && air < (plan.away ?? 0)) || (air < 0 && plan.back) ? -h : h);
      if (p.grounded) m |= air >= 0 && air < 20 && !plan.drop ? J : 0;
      else if (air >= (plan.away ?? 0) && (p.mode === 'wallSlide' || p.wallDir === h)) {
        if (touchK < 0) touchK = f;
        const tell = plan.wary && s.enemies.some((e) => e.mode === 'windup' || e.mode === 'charge');
        if (f - touchK >= delay && !(prev & J) && !tell) {
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
    for (const e of ev) {
      if (e.type === 'hurt') hits++;
      if (e.type === 'enemyDie') kills.push(e.id);
    }
    if (s.player.faded > 0) {
      end = 'faded';
      break;
    }
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
  const out: Result = back ? { pass, end, top, touches, back } : { pass, end, top, touches };
  if (o.creatures) {
    out.hits = hits;
    out.kills = kills;
  }
  return out;
}

/** Kick delays (r8, review r7 #9: 16, a relaxed kick, joined the default). */
export const DELAYS = [0, 6, 10, 16];
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
    // (r9, review r8 #1: leg 2 is the well's one chimney leg, and its strip (the bots' top hit source four rounds
    // running, on the line a relaxed hand slides down) is a bramble pit on the gallery's floor now: either face.)
    id: 'well-2',
    room: 'cn-well',
    note: 'leg 2: the mouth floor to the landing (the chimney top), either face',
    xs: [2048, 2112, 2176],
    y: 3200,
    goal: { x0: 1536, x1: 2304, y: 2432 },
    plans: [
      { name: 'W face', first: -1, legs: [{ mode: 'face' }] },
      { name: 'E face', first: 1, legs: [{ mode: 'face' }] },
      { name: 'E then W', first: 1, legs: [{ mode: 'face', until: 3200 }, { mode: 'face' }] },
    ],
  },
  {
    id: 'out-1',
    room: 'cn-out',
    note: 'the way out, leg 1: the chimney floor to rest E, up the east face',
    xs: [1024, 1088, 1152],
    y: 1856,
    goal: { x0: 1152, x1: 1536, y: 1344 },
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'out-2',
    room: 'cn-out',
    note: 'the way out, leg 2: rest E, the plug, rest W; the east face over rest E has a strip',
    xs: [1344, 1408, 1472],
    y: 1344,
    goal: { x0: 576, x1: 1024, y: 832 },
    plans: [
      { name: 'W face, cutting', first: -1, cut: true, jumpAt: [1200, 1232, 1264], legs: [{ mode: 'face' }] },
    ],
    fails: [
      { name: 'E face only', first: 1, back: true, jumpAt: [1216, 1216, 1216], legs: [{ mode: 'face' }] },
    ],
  },
  {
    id: 'out-3',
    room: 'cn-out',
    note: 'the way out, leg 3: rest W to the clifftop; the west face over rest W has a strip',
    xs: [704, 768, 832],
    y: 832,
    goal: { x0: 0, x1: 1792, y: 384 },
    plans: [{ name: 'E face', first: 1, jumpAt: [960, 992, 1008], legs: [{ mode: 'face' }] }],
    fails: [
      { name: 'W face only', first: -1, back: true, jumpAt: [992, 992, 992], legs: [{ mode: 'face' }] },
    ],
  },
  // (r15, review r14 #1: the escape's second leg, the clifftop's chimney with the escape live: the rocks keyed to her,
  // the plug shaken down, and the earth rising under her from the foot. The den's climb (r14's heap and wall) is gone.)
  {
    id: 'esc-1',
    room: 'cn-out',
    note: "the escape's chimney, leg 1 (r15): the foot to rest E up the east face, the earth rising under her",
    xs: [1024, 1088, 1152],
    y: 1856,
    goal: { x0: 1152, x1: 1536, y: 1344 },
    flags: ['cn-den-met', 'cn-den-fed', 'cn-den-down', 'cn-den-freed', 'cn-den-collapse'],
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'esc-2',
    room: 'cn-out',
    note: "the escape's chimney, leg 2 (r15): rest E to rest W up the west face, the plug shaken down",
    xs: [1344, 1408, 1472],
    y: 1344,
    goal: { x0: 576, x1: 1024, y: 832 },
    flags: ['cn-den-met', 'cn-den-fed', 'cn-den-down', 'cn-den-freed', 'cn-den-collapse'],
    plans: [{ name: 'W face', first: -1, jumpAt: [1200, 1232, 1264], legs: [{ mode: 'face' }] }],
  },
  {
    id: 'esc-3',
    room: 'cn-out',
    note: "the escape's chimney, leg 3 (r15): rest W over the top onto the clifftop",
    xs: [704, 768, 832],
    y: 832,
    goal: { x0: 0, x1: 1792, y: 384 },
    flags: ['cn-den-met', 'cn-den-fed', 'cn-den-down', 'cn-den-freed', 'cn-den-collapse'],
    plans: [{ name: 'E face', first: 1, jumpAt: [960, 992, 1008], legs: [{ mode: 'face' }] }],
  },
  {
    id: 'fork-face',
    room: 'cn-fork',
    note: "the fork's claw face up to the Grove: one clean face",
    xs: [2560, 2624, 2688],
    y: 1344,
    goal: { x0: 2752, x1: 3200, y: 576 },
    // (r22: the fork's nest cleared: its root door at the face's top is open.)
    flags: ['cn-nest-fork'],
    plans: [{ name: 'E face', first: 1, legs: [{ mode: 'face' }] }],
  },
  {
    id: 'spire-1',
    room: 'cn-spire',
    note: "the Spire's foot to the nook's mouth, up the east face",
    xs: [1024, 1088, 1152],
    y: 1472,
    // (r8: the mouth's root lip, 1,088-1,280, is the rest too; and the neck's root column now carries a climb from the
    // foot on up past the mouth to the bower: either ends it.)
    goal: { x0: 0, x1: 2560, y: 896, exit: 'bower' },
    plans: [
      { name: 'E face, then the neck', first: 1, legs: [{ mode: 'face', until: 900 }, { mode: 'face' }] },
    ],
  },
  {
    id: 'spire-neck',
    room: 'cn-spire',
    note: "the Spire's neck: out from under the nook's lip, kicks across",
    xs: [1296, 1328, 1352],
    y: 896,
    goal: { x0: 0, x1: 2560, y: 128, exit: 'bower' },
    plans: [
      {
        name: 'out on the lip, E then W',
        first: 1,
        back: true,
        jumpAt: [1150, 1150, 1150],
        legs: [{ mode: 'face', until: 760 }, { mode: 'face' }],
      },
    ],
    fails: [
      { name: 'E face only', first: 1, back: true, jumpAt: [1150, 1150, 1150], legs: [{ mode: 'face' }] },
    ],
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
      // The reward off the line (review r5 #2): glints on the east face over its strip, across and back.
      {
        name: 'W, cutting, in to the glints, W',
        first: -1,
        cut: true,
        jumpAt: [1072, 1048, 1024],
        delays: [0, 6],
        margin: 32,
        takes: ['risk-e-1', 'risk-e-2'],
        legs: [{ mode: 'face', until: 820 }, { mode: 'face', until: 1e9 }, { mode: 'face' }],
      },
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

/**
 * (Until r9: leg 3b with its lampwing in, review r6 #3: the climb is a choice, not a toll. The rest is safe (`restSafe`: it
 * hovers 456 px over the rest's floor, out of its sight, so she can stand there as long as she likes); the plain plan
 * (straight up past it) takes at most one hit from two of three starts at kick delays 6 and 10; hops with up cuts on
 * the rest's lip draw it down and kill it as it stalls there, unhurt. Held by tests/unit/canopy-climbs.test.ts.
 * (Review r6 wanted her to watch its dive from the rest: at its sight, 260 px, it never dives at her there; she has
 * to draw it, which is the up-cut plan.)
 */
export const CREATURE_CLIMBS: Array<{
  climb: string;
  plan: Plan;
  delays: number[];
  maxHits: number;
  of: number;
}> = [
  // (r9: leg 3b and its lampwing are gone, the gallery's two creatures sit off the climbs, and the Spire's foot with
  // its hawker at most one hit.)
  // (r22: the huntsmen. A blind climb past one takes at most one hit and still tops the leg, from every start at every
  // delay; a wary hand (it holds on the wall when one flattens) on the far face is never hit.)
  {
    climb: 'well-2',
    plan: { name: 'E then W', first: 1, legs: [{ mode: 'face', until: 3200 }, { mode: 'face' }] },
    delays: [0, 6, 10, 16],
    maxHits: 1,
    of: 3,
  },
  {
    climb: 'well-2',
    plan: { name: 'E face, wary', first: 1, wary: true, legs: [{ mode: 'face' }] },
    delays: [0, 6, 10, 16],
    maxHits: 0,
    // (From x 2,048 at delay 10 the bot kicks on up the east face past the landing for ever: its own loop, no hit.)
    of: 2,
  },
  {
    climb: 'elder-1',
    plan: { name: 'E face, wary', first: 1, wary: true, legs: [{ mode: 'face' }] },
    delays: [0, 6, 10, 16],
    maxHits: 0,
    of: 3,
  },
  {
    climb: 'elder-2',
    plan: {
      name: 'W then E',
      first: -1,
      jumpAt: [1072, 1048, 1024],
      legs: [{ mode: 'face', until: 1600 }, { mode: 'face' }],
    },
    delays: [0, 6, 10, 16],
    maxHits: 1,
    of: 3,
  },
  {
    climb: 'spire-1',
    plan: { name: 'E face, then the neck', first: 1, legs: [{ mode: 'face', until: 900 }, { mode: 'face' }] },
    delays: [0, 6, 10, 16],
    maxHits: 1,
    of: 3,
  },
];

/** Hits she takes standing on a climb's rest for `frames` with the room's creatures in (a rest is a rest). */
export function restSafe(c: Climb, x: number, frames = 600): number {
  const t = cloneTuning(defaultTuning);
  const scene = climbScene(c.room, 0, true);
  const W = getWorld('canopy');
  const kit = (c.kit ?? ['wallJump']) as never;
  const s = createState(1, t, scene, [], kit, newSave(kit));
  placePlayer(s, x, c.y, t, withShortcuts(scene, s.save), []);
  let hits = 0;
  for (let k = 0; k < frames; k++) {
    const ev: SimEvent[] = [];
    step(s, 0, t, scene, ev, W);
    hits += ev.filter((e) => e.type === 'hurt').length;
  }
  return hits;
}

if (process.argv[1]?.endsWith('climbs.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const creatures = args.includes('--creatures');
  if (creatures) args.splice(args.indexOf('--creatures'), 1);
  const margin = Number(opt('--margin') ?? 0);
  const delays = (opt('--delays') ?? DELAYS.join(',')).split(',').map(Number);
  if (creatures) {
    for (const cc of CREATURE_CLIMBS) {
      const c = CLIMBS.find((q) => q.id === cc.climb) as Climb;
      console.log(
        `\n${c.id} with its creatures: ${cc.plan.name} (at most ${cc.maxHits} hits from ${cc.of} starts)`,
      );
      for (const [i, x] of c.xs.entries())
        for (const d of cc.delays) {
          const r = runClimb(c, cc.plan, x, d, 0, cc.plan.jumpAt?.[i], { creatures: true });
          console.log(
            `  ${r.pass ? 'pass' : 'FAIL'} x${x} d${d}: ${r.hits} hits, killed [${(r.kills ?? []).join(' ')}], top ${r.top} ${r.end}  [${r.touches.slice(0, 14).join(' ')}]`,
          );
        }
    }
    process.exit(0);
  }
  const pick = args.length ? CLIMBS.filter((c) => args.includes(c.id)) : CLIMBS;
  for (const c of pick) {
    console.log(`\n${c.id} (${c.room}): ${c.note}`);
    for (const [kind, plans] of [
      ['must pass', c.plans],
      ['must fail', c.fails ?? []],
    ] as const)
      for (const plan of plans)
        for (const [i, x] of c.xs.entries())
          for (const d of plan.delays ?? delays) {
            const r = runClimb(c, plan, x, d, Math.min(margin, plan.margin ?? margin), plan.jumpAt?.[i]);
            const ok = kind === 'must pass' ? r.pass : !r.pass;
            console.log(
              `  ${ok ? 'ok  ' : 'FAIL'} ${kind} ${plan.name} x${x} d${d}: top ${r.top} ${r.end}` +
                `${r.back ? ` -> back (${r.back.x}, ${r.back.y})` : ''}  [${r.touches.slice(0, 14).join(' ')}]`,
            );
          }
  }
}
