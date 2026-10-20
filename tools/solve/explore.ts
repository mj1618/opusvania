/**
 * The explorer (Lanternroot's solver, docs/design/levels/proto-1.md §9, memory/lanternroot.md): a breadth-first search
 * over **moves in the real sim**. A node is a standing state of hers (feet on ground, settled); an edge is a macro
 * (a closed-loop input program: walk, hop, jump and double jump, glides, a wall climb, a drop through a one-way, a
 * fling off a flame in reach with every aim and a chain after it, a gust hop, a pogo, a kindle) played on a copy of
 * the state until she stands again (or falls into a catch, meets thorns, is hurt, or leaves by an exit: then the
 * branch ends there). Nodes are told apart by where she stands (x in `quant` px bins, the exact top) and by the room's
 * light (which flames burn, which moss is on, which flags are set), so a kindle that lights a stair opens new nodes.
 *
 * It answers two questions for the solver: can she get from here to there with this kit (an edge proof: the input
 * tape that does it comes back), and can she get there at all without it (the skip-hunter: the search runs with the
 * tool taken away and must not reach the locked place). It proves reach, not ease: a found line may be a hard one.
 * Creatures can be left out (`creatures: false`: movement only); flames, moss, gates, bark and thorns are all real.
 *
 * Pure: Node and the page (no DOM).
 */
import type { SimEvent } from '../../src/sim/events';
import { cloneState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { kindleTarget } from '../../src/sim/light';
import { flingTarget } from '../../src/sim/lures';
import { oneWayUnder } from '../../src/sim/physics/aabb';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import type { Tuning } from '../../src/sim/tuning';
import { type World, withShortcuts } from '../../src/sim/world';

const L = ActionBit.left;
const R = ActionBit.right;
const U = ActionBit.up;
const D = ActionBit.down;
const J = ActionBit.jump;
const A = ActionBit.attack;
const B = ActionBit.lamp;

/** What a macro sees each frame and returns: the input for this frame (or -1: the macro is over). */
type Program = (s: GameState, k: number, prev: number) => number;

export interface Macro {
  name: string;
  /** Frames after which it gives up. */
  max: number;
  prog: Program;
  /** It runs its whole program even standing still (a gust waits for its puff). */
  wait?: boolean;
}

export interface ExploreNode {
  key: string;
  state: GameState;
  /** The node it was reached from ('' = a start), the macro, and the input frames of that macro. */
  from: string;
  macro: string;
  tape: number[];
  depth: number;
  /** Frames from the start along its line. */
  frames: number;
}

export interface ExploreResult {
  nodes: Map<string, ExploreNode>;
  /** Exits she left by: exit id -> the node she left from, the macro and its frames up to the crossing. */
  exits: Map<string, { from: ExploreNode; macro: string; tape: number[] }>;
  /** With `allExits`: up to `allExits` crossings of each exit, from different nodes (the Downwood's world search). */
  exitsAll: Map<string, Array<{ from: ExploreNode; macro: string; tape: number[] }>>;
  /** Nodes whose search stopped early (the node budget). */
  truncated: boolean;
  steps: number;
}

export interface ExploreOpts {
  scene: Scene;
  tuning: Tuning;
  /** Standing states to start from. */
  start: GameState[];
  /** x bin of a node, px (default 32). */
  quant?: number;
  /** At most this many nodes (default 4000). */
  maxNodes?: number;
  /** Leave creatures out (default false: movement only, the usual skip hunt). */
  creatures?: boolean;
  /**
   * Glow she has at the start of every macro (kindles are fuelled by the solver's own count; default the max).
   * `null`: her glow as it is (a driver's leg, replayed for real afterwards).
   */
  glow?: number | null;
  /** Stop as soon as a node satisfies this (an edge proof). */
  goal?: (s: GameState) => boolean;
  /** Fling chains and aims to try (default all eight aims, chains with the same aim and with Up). */
  flings?: boolean;
  /** Let a node's search include pogo macros (down cuts in the air). Default true. */
  pogo?: boolean;
  /**
   * Warm lamps never run out (default true): every lamp that burned at the start burns again after each move, so
   * the search is over places, not over which lamps are spent (more anchors only add reach: a superset, the right
   * side to err on for a skip hunt). Lamps that set a flag (`sets`) are spent for real.
   */
  keepLamps?: boolean;
  /** The world (its links): an arrival-only opening is no exit (default: every opening is one). */
  world?: World;
  /**
   * `moves` (default): breadth-first by moves. `time`: earliest first by frames (Dijkstra): every node is first
   * reached at the earliest time any found line gets there, so a clock (a moonwick's burn) is judged fairly.
   */
  order?: 'moves' | 'time';
  /** Kindles in the search (default true; a driver's leg that must not spend glow on the way says false). */
  kindle?: boolean;
  /** Stop as soon as she leaves by this exit (an edge proof to an exit). */
  goalExit?: string;
  /** Keep up to this many crossings of each exit (`exitsAll`), not just the first. */
  allExits?: number;
  /** More macros for every node (the Downwood's `glideClimbMacros`). */
  more?: Macro[];
  /**
   * Node keys an earlier search of this room already expanded: not expanded again (an incremental search from a new
   * start only adds what is new; the Downwood's world search).
   */
  known?: ReadonlySet<string>;
}

/** Her feet. */
export function feet(s: GameState): { x: number; y: number } {
  return { x: s.player.x + s.player.w / 2, y: s.player.y + s.player.h };
}

/** The room's light and doors as they stand: which flames burn, which moss is on, which flags are set. */
function lightKey(s: GameState, scene: Scene): string {
  let k = '';
  const list = scene.lures ?? [];
  for (let i = 0; i < s.lures.hp.length; i++) {
    const l = list[i];
    if (l && l.kind !== 'moonwick' && !l.sets) continue;
    k += (s.lures.hp[i] ?? 0) > 0 ? '1' : s.lures.ember[i] ? 'e' : '0';
  }
  k += '|';
  for (const m of s.light.moss) k += m ? '1' : '0';
  k += '|';
  for (const b of s.kit.bark) k += b > 0 ? '1' : '0';
  return `${k}|${s.save.flags.length}|${s.save.opened.length}`;
}

function keyOf(s: GameState, quant: number, scene: Scene): string {
  const f = feet(s);
  return `${Math.floor(f.x / quant)},${Math.round(f.y)}|${lightKey(s, scene)}`;
}

/** Warm lamps burning in `ref` burn again in `s` (embers out, no ember left: `keepLamps`). */
function relight(s: GameState, ref: GameState, scene: Scene): void {
  const list = scene.lures ?? [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || l.kind === 'moonwick' || l.sets) continue;
    if ((ref.lures.hp[i] ?? 0) > 0) {
      s.lures.hp[i] = ref.lures.hp[i] as number;
      s.lures.ember[i] = 0;
      s.lures.out[i] = 0;
    }
  }
}

const dirBit = (d: number) => (d > 0 ? R : d < 0 ? L : 0);

/** She is standing and settled (no hitstop, slow, on the ground for 2 frames). */
function settled(s: GameState): boolean {
  const p = s.player;
  return p.grounded && p.hitstop === 0 && p.contactFrames >= 2 && Math.abs(p.vx) < 1 && p.fling < 0;
}

/**
 * An air move: the program runs until she has left the ground and come down on it again (then it is over and she
 * settles with nothing held).
 */
function air(prog: Program): Program {
  let up = false;
  return (s, k, prev) => {
    if (k === 0) up = false;
    if (!s.player.grounded) up = true;
    else if (up && k > 2) return -1;
    if (k > 40 && !up) return -1;
    return prog(s, k, prev);
  };
}

/** The base macros (dir -1 / 1 each). */
export function baseMacros(): Macro[] {
  const out: Macro[] = [];
  for (const d of [-1, 1]) {
    const h = dirBit(d);
    const tag = d > 0 ? 'R' : 'L';
    for (const n of [6, 18, 48])
      out.push({ name: `walk${tag}${n}`, max: n + 200, prog: (_s, k) => (k < n ? h : 0) });
    for (const hold of [5, 12, 30])
      out.push({ name: `hop${tag}${hold}`, max: 240, prog: air((_s, k) => h | (k < hold ? J : 0)) });
    // Straight up, then drift that way.
    out.push({ name: `up${tag}`, max: 240, prog: air((_s, k) => (k < 30 ? J : 0) | (k >= 12 ? h : 0)) });
    // Jump, then a double jump at the apex (held), drifting.
    out.push({
      name: `dj${tag}`,
      max: 260,
      prog: air((_s, k) => h | (k < 22 ? J : k < 24 ? 0 : k < 50 ? J : 0)),
    });
    // Up, double jump, then drift that way (onto a ledge above).
    out.push({
      name: `djup${tag}`,
      max: 260,
      prog: air((_s, k) => (k < 22 ? J : k < 24 ? 0 : k < 50 ? J : 0) | (k >= 28 ? h : 0)),
    });
    // Jump and hold it: the glide below the launch height.
    out.push({ name: `glide${tag}`, max: 400, prog: air(() => h | J) });
    // Jump, double jump at the apex, hold on: the long glide.
    out.push({ name: `djglide${tag}`, max: 400, prog: air((_s, k) => h | (k < 22 ? J : k < 24 ? 0 : J)) });
    // Walk off a lip, then the wings.
    out.push({
      name: `offglide${tag}`,
      max: 400,
      prog: (s, k, prev) => {
        const p = s.player;
        if (k > 0 && p.grounded && k > 120) return -1;
        return h | (!p.grounded && p.vy > 1 ? J : 0) | (prev & J && !p.grounded ? J : 0);
      },
    });
    // Walk off, double jump as she falls, wings.
    out.push({
      name: `offdj${tag}`,
      max: 400,
      prog: (s, k, prev) => {
        const p = s.player;
        if (k > 120 && p.grounded) return -1;
        if (p.grounded) return h;
        // (Press once falling, hold for the glide.)
        return h | (p.vy > 2 || prev & J ? J : 0);
      },
    });
    // A wall climb: toward the wall, a press of jump on the ground and at every slide; over the top.
    out.push({
      name: `climb${tag}`,
      max: 600,
      prog: (s, k, prev) => {
        const p = s.player;
        if (k > 20 && p.grounded) return -1;
        const press = (p.grounded && k < 4) || p.mode === 'wallSlide';
        return h | (press && !(prev & J) ? J : 0) | (!press && prev & J && p.vy < 0 && p.kick > 0 ? J : 0);
      },
    });
    // Climb, then let the wings carry her off the top of the face the other way.
    out.push({
      name: `climbglide${tag}`,
      max: 600,
      prog: (s, k, prev) => {
        const p = s.player;
        if (k > 20 && p.grounded) return -1;
        if (k > 300) return dirBit(-d) | J;
        const press = (p.grounded && k < 4) || p.mode === 'wallSlide';
        return h | (press && !(prev & J) ? J : 0);
      },
    });
  }
  // Down through a one-way.
  out.push({ name: 'drop', max: 200, prog: air((_s, k) => (k < 2 ? D | J : 0)) });
  return out;
}

/**
 * Glide that way to a face, then climb it (the Downwood's Gorge: snag to snag). Opt-in (`more`): the proven
 * Lanternroot lines and skip hunts predate it.
 */
export function glideClimbMacros(): Macro[] {
  const out: Macro[] = [];
  for (const d of [-1, 1]) {
    const h = dirBit(d);
    const tag = d > 0 ? 'R' : 'L';
    out.push({
      name: `glideclimb${tag}`,
      max: 900,
      prog: (s, k, prev) => {
        const p = s.player;
        if (k > 20 && p.grounded) return -1;
        if (p.mode === 'wallSlide') return h | (!(prev & J) ? J : 0);
        if (k < 24) return h | J;
        return h | (p.vy > 0 ? J : prev & J && p.vy < 0 && p.kick > 0 ? J : 0);
      },
    });
  }
  return out;
}

/** Dashes (only with the dash owned): a run and a dash, a jump and a dash at its top, each way. */
export function dashMacros(): Macro[] {
  const X = ActionBit.dash;
  const out: Macro[] = [];
  for (const d of [-1, 1]) {
    const h = dirBit(d);
    const tag = d > 0 ? 'R' : 'L';
    out.push({ name: `dash${tag}`, max: 200, prog: air((_s, k) => h | (k >= 4 && k < 6 ? X : 0)) });
    out.push({ name: `walkdash${tag}`, max: 240, prog: air((_s, k) => h | (k >= 14 && k < 16 ? X : 0)) });
    out.push({
      name: `jdash${tag}`,
      max: 240,
      prog: air((_s, k) => h | (k < 14 ? J : 0) | (k >= 16 && k < 18 ? X : 0)),
    });
  }
  return out;
}

/** The air hop (a gust down at the apex), then the wings; and gusts tapped standing, each way. Only with Gust owned. */
export function gustMacros(): Macro[] {
  const out: Macro[] = [];
  // (Then she waits for the puff to fly its length.)
  for (const [n, aim] of [
    ['R', R],
    ['L', L],
    ['U', U],
    ['UR', U | R],
    ['UL', U | L],
  ] as const)
    out.push({ name: `gust${n}`, max: 50, wait: true, prog: (_s, k) => (k < 2 ? aim | B : k < 36 ? 0 : -1) });
  for (const d of [-1, 1]) {
    const h = dirBit(d);
    const tag = d > 0 ? 'R' : 'L';
    out.push({
      name: `gusthop${tag}`,
      max: 300,
      prog: air((_s, k) => {
        if (k < 22) return h | J;
        if (k < 24) return h;
        if (k < 40) return h | J;
        if (k < 42) return h | D | B;
        return h | J;
      }),
    });
  }
  return out;
}

/**
 * Cuts: standing cuts each way and up (three in a row: a bark wall's three, a lamp's two), and a jump with an up cut
 * or a forward cut at the top (a flame hung over her). What the blade can reach, she can put out or break.
 */
export function cutMacros(): Macro[] {
  const out: Macro[] = [];
  for (const [n, h] of [
    ['R', R],
    ['L', L],
  ] as const) {
    out.push({
      name: `cut${n}`,
      max: 90,
      wait: true,
      prog: (_s, k) => (k < 2 ? h : k < 70 ? (k % 20 < 2 ? A : 0) : -1),
    });
    out.push({
      name: `jcut${n}`,
      max: 200,
      prog: air((_s, k) => (k < 2 ? h : 0) | (k < 24 ? J : 0) | (k >= 18 && k % 20 < 2 ? A : 0)),
    });
  }
  out.push({ name: 'cutU', max: 90, wait: true, prog: (_s, k) => (k < 70 ? U | (k % 20 < 2 ? A : 0) : -1) });
  // (Standing down cuts: a floor panel under her feet.)
  out.push({ name: 'cutD', max: 90, wait: true, prog: (_s, k) => (k < 70 ? D | (k % 20 < 2 ? A : 0) : -1) });
  out.push({
    name: 'jcutU',
    max: 200,
    prog: air((_s, k) => U | (k < 24 ? J : 0) | (k >= 14 && k % 20 < 2 ? A : 0)),
  });
  out.push({
    name: 'djcutU',
    max: 220,
    prog: air((_s, k) => U | (k < 22 ? J : k < 24 ? 0 : k < 44 ? J : 0) | (k >= 36 && k % 18 < 2 ? A : 0)),
  });
  return out;
}

/** Pogo: a jump that way, then down cuts on what is under her while she falls. */
export function pogoMacros(): Macro[] {
  const out: Macro[] = [];
  for (const d of [-1, 0, 1]) {
    const h = dirBit(d);
    out.push({
      name: `pogo${d > 0 ? 'R' : d < 0 ? 'L' : 'U'}`,
      max: 400,
      prog: (s, k) => {
        const p = s.player;
        if (k > 10 && p.grounded) return -1;
        const cut = p.vy > 0 && k % 4 < 2;
        return h | (k < 20 ? J : 0) | (cut ? D | A : 0);
      },
    });
  }
  return out;
}

/**
 * Aims a fling takes in the search: the five that climb or carry (a down aim only loses height, which a fall gives
 * anyway: it reaches nothing the others do not, for a skip hunt).
 */
const AIMS: Array<[string, number]> = [
  ['R', R],
  ['UR', U | R],
  ['U', U],
  ['UL', U | L],
  ['L', L],
];

/**
 * Flings: an approach (a jump that way, straight up, or with the double jump), the lamp pressed the first frame a
 * flame is in reach, an aim held 3 frames, released; then the horizontal of the aim held, with the wings
 * (`glide`) or not, and every flame met in flight flung again with `chain` (the same aim, or up).
 */
export function flingMacros(): Macro[] {
  const out: Macro[] = [];
  const approaches: Array<[string, (k: number) => number]> = [
    ['jR', (k) => R | (k < 30 ? J : 0)],
    ['jL', (k) => L | (k < 30 ? J : 0)],
    ['jU', (k) => (k < 30 ? J : 0)],
    ['djR', (k) => R | (k < 22 ? J : k < 24 ? 0 : J)],
    ['djL', (k) => L | (k < 22 ? J : k < 24 ? 0 : J)],
    ['djU', (k) => (k < 22 ? J : k < 24 ? 0 : J)],
    ['stand', () => 0],
  ];
  for (const kindle of [false, true])
    for (const [an, approach] of approaches)
      for (const [aimName, aim] of AIMS)
        for (const glide of [false, true])
          for (const chain of ['same', 'up', 'ul', 'ur'] as const) {
            // (A chain goes on with the same aim, or turns up; a straight-up chain may turn up-left or up-right.)
            if (chain === 'up' && aimName === 'U') continue;
            if ((chain === 'ul' || chain === 'ur') && aimName !== 'U') continue;
            const horiz = aim & (L | R);
            const chainAim =
              chain === 'up' ? U | horiz : chain === 'ul' ? U | L : chain === 'ur' ? U | R : aim;
            const tag = chain === 'same' ? '' : chain === 'up' ? '-cu' : `-c${chain === 'ul' ? 'l' : 'r'}`;
            out.push({
              name: `fling-${an}-${aimName}${glide ? '-g' : ''}${tag}${kindle ? '-k' : ''}`,
              max: 420,
              prog: makeFling(approach, aim, horiz, glide, chainAim, kindle),
            });
          }
  return out;
}

function makeFling(
  approach: (k: number) => number,
  aim: number,
  horiz: number,
  glide: boolean,
  chainAim: number,
  kindle = false,
): Program {
  // (The program keeps its own small state in a closure, reset at k 0.)
  let phase = 0;
  let t0 = 0;
  let flings = 0;
  let dj = false;
  return (s, k) => {
    if (k === 0) {
      phase = 0;
      t0 = 0;
      flings = 0;
      dj = false;
    }
    const p = s.player;
    if (phase === 0) {
      // Approach until a flame is in reach (not after 70 frames, nor once back on the ground).
      if (k > 70 || (k > 6 && p.grounded)) return -1;
      if (p.fling < 0 && p.flingCd === 0 && reachFlame(s)) {
        phase = 1;
        t0 = k;
        flings++;
        return aim | B;
      }
      return approach(k);
    }
    if (phase === 1) {
      // Aim held 3 more frames with the lamp, then let go.
      const a = flings > 1 ? chainAim : aim;
      if (k - t0 < 3) return a | B;
      phase = 2;
      t0 = k;
      return a;
    }
    // Flight: the horizontal held; wings after the launch; a flame met again is flung again (`kindle`: a cold
    // moonwick met is kindled in the air, and then flung off like any burning flame).
    if (p.grounded && k - t0 > 3) return -1;
    if (kindle && k - t0 > 2 && p.fling < 0 && !reachFlame(s) && coldInReach(s)) return B;
    if (k - t0 > 6 && p.fling < 0 && p.flingCd === 0 && flings < 6 && reachFlame(s)) {
      phase = 1;
      t0 = k;
      flings++;
      return chainAim | B;
    }
    // (After a chain link, the horizontal of the aim she last flew.)
    let m = flings > 1 ? chainAim & (L | R) : horiz;
    if (glide && k - t0 > 22) {
      // A double jump as the launch fades, then the wings.
      if (!dj && p.dj > 0 && p.vy > 0) {
        dj = true;
        return m;
      }
      m |= J;
    }
    return m;
  };
}

/** A burning flame (warm or a moonwick) in fling reach. */
let SCENE: Scene | null = null;
let TUNE: Tuning | null = null;
function reachFlame(s: GameState): boolean {
  if (!SCENE || !TUNE) return false;
  return flingTarget(s, withShortcuts(SCENE, s.save), TUNE) >= 0;
}

/** A cold moonwick in kindle reach (and Kindle owned: the press would kindle it). */
function coldInReach(s: GameState): boolean {
  if (!SCENE || !TUNE || !(s.save.abilities as readonly string[]).includes('kindle')) return false;
  return kindleTarget(s, withShortcuts(SCENE, s.save), TUNE) >= 0;
}

/** A kindle: Lamp pressed standing by a cold moonwick (owned Kindle, glow topped up by the explorer). */
export function kindleMacro(): Macro {
  return { name: 'kindle', max: 60, prog: (_s, k) => (k === 0 ? B : 0) };
}

/** Kindles in the air: a jump (that way, or up, or with the double jump) and Lamp the first frame a cold bud is in reach. */
export function airKindleMacros(): Macro[] {
  const out: Macro[] = [];
  for (const [n, h, dj] of [
    ['U', 0, false],
    ['R', R, false],
    ['L', L, false],
    ['dU', 0, true],
    ['dR', R, true],
    ['dL', L, true],
  ] as const) {
    let done = false;
    out.push({
      name: `jkindle${n}`,
      max: 240,
      prog: air((s, k) => {
        if (k === 0) done = false;
        const jump = dj ? (k < 22 ? J : k < 24 ? 0 : k < 44 ? J : 0) : k < 24 ? J : 0;
        if (!done && k > 2 && SCENE && TUNE && kindleTarget(s, withShortcuts(SCENE, s.save), TUNE) >= 0) {
          done = true;
          return h | B;
        }
        return h | jump;
      }),
    });
  }
  return out;
}

/** The fling approaches worth trying from here: each must be able to carry her within reach of a burning flame. */
function approachesFor(s: GameState, scene: Scene): Set<string> {
  const out = new Set<string>();
  const list = scene.lures ?? [];
  const f = feet(s);
  const cy = f.y - 40;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || (s.lures.hp[i] ?? 0) <= 0 || l.kind === 'great') continue;
    const dx = l.x - f.x;
    const up = cy - l.y;
    if (Math.abs(dx) < 140 && Math.abs(up) < 140) out.add('stand');
    if (up > 600 || up < -400 || Math.abs(dx) > 640) continue;
    const single = up < 272 + 130;
    if (dx > -140) {
      if (single) out.add('jR');
      out.add('djR');
    }
    if (dx < 140) {
      if (single) out.add('jL');
      out.add('djL');
    }
    if (Math.abs(dx) < 300) {
      if (single) out.add('jU');
      out.add('djU');
    }
  }
  return out;
}

/** A cold moonwick within `px` of her feet (worth a kindle in the air)? */
function coldNear(s: GameState, scene: Scene, px: number): boolean {
  const list = scene.lures ?? [];
  const f = feet(s);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l?.kind !== 'moonwick' || (s.lures.hp[i] ?? 0) > 0) continue;
    if ((l.x - f.x) * (l.x - f.x) + (l.y - f.y) * (l.y - f.y) < px * px) return true;
  }
  return false;
}

/** Is there a burning flame within `px` of her (worth trying the flings)? */
function flameNear(s: GameState, scene: Scene, px: number): boolean {
  return flamesNear(s, scene, px) > 0;
}

/** Burning flames (fling anchors) within `px` of her feet. */
function flamesNear(s: GameState, scene: Scene, px: number): number {
  const list = scene.lures ?? [];
  const f = feet(s);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || (s.lures.hp[i] ?? 0) <= 0 || l.kind === 'great') continue;
    if ((l.x - f.x) * (l.x - f.x) + (l.y - f.y) * (l.y - f.y) < px * px) n++;
  }
  return n;
}

/**
 * Plays `macro` from a copy of `from`; returns the end state and what happened. `glow` tops up her glow first (a
 * kindle's cost is the solver's business).
 */
export function play(
  from: GameState,
  macro: Macro,
  scene: Scene,
  t: Tuning,
  glow: number | null,
  world?: World,
): {
  state: GameState;
  tape: number[];
  outcome: 'stand' | 'exit' | 'fail' | 'timeout';
  exit?: string;
  steps: number;
} {
  const s = cloneState(from);
  if (glow !== null) s.player.glow = glow;
  SCENE = scene;
  TUNE = t;
  const tape: number[] = [];
  const events: SimEvent[] = [];
  let prev = s.prevInput;
  const hp0 = s.player.hp;
  for (let k = 0; k < macro.max; k++) {
    const m = macro.prog(s, k, prev);
    if (m < 0) {
      // The program is done: she has to stand again.
      for (let w = 0; w < 120 && !settled(s); w++) {
        tape.push(0);
        events.length = 0;
        step(s, 0, t, scene, events, world);
        const bad = judge(s, events, hp0);
        if (bad) return { state: s, tape, outcome: bad.outcome, exit: bad.exit, steps: k + w };
      }
      return { state: s, tape, outcome: settled(s) ? 'stand' : 'timeout', steps: k };
    }
    tape.push(m);
    events.length = 0;
    step(s, m, t, scene, events, world);
    prev = m;
    const bad = judge(s, events, hp0);
    if (bad) return { state: s, tape, outcome: bad.outcome, exit: bad.exit, steps: k };
    if (!macro.wait && k > 8 && settled(s) && !(m & (J | B)))
      return { state: s, tape, outcome: 'stand', steps: k };
  }
  return { state: s, tape, outcome: settled(s) ? 'stand' : 'timeout', steps: macro.max };
}

/** A step that ends the branch: an exit taken, a catch, thorns, a hurt. */
function judge(
  s: GameState,
  events: SimEvent[],
  hp0: number,
): { outcome: 'exit' | 'fail'; exit?: string } | null {
  for (const e of events) {
    if (e.type === 'roomExit') return { outcome: 'exit', exit: e.id };
    if (e.type === 'fallCatch' || e.type === 'thornHit' || e.type === 'hurt' || e.type === 'fade')
      return { outcome: 'fail' };
  }
  if (s.player.hp < hp0) return { outcome: 'fail' };
  return null;
}

/** The scene with its creatures (or without, for a movement-only search). */
function sceneFor(scene: Scene, creatures: boolean): Scene {
  return creatures ? scene : { ...scene, enemies: [] };
}

/** The breadth-first search. */
export function explore(o: ExploreOpts): ExploreResult {
  const quant = o.quant ?? 32;
  const maxNodes = o.maxNodes ?? 4000;
  const scene = sceneFor(o.scene, o.creatures ?? false);
  const t = o.tuning;
  const nodes = new Map<string, ExploreNode>();
  const exits = new Map<string, { from: ExploreNode; macro: string; tape: number[] }>();
  const exitsAll = new Map<string, Array<{ from: ExploreNode; macro: string; tape: number[] }>>();
  const queue: ExploreNode[] = [];
  const dashes = dashMacros();
  const base = baseMacros();
  const flings = o.flings === false ? [] : flingMacros();
  const pogos = o.pogo === false ? [] : [...pogoMacros(), ...cutMacros()];
  const gust = gustMacros();
  const kindle = kindleMacro();
  const airKindle = airKindleMacros();
  let steps = 0;
  for (const s0 of o.start) {
    const s = cloneState(s0);
    if (!o.creatures) s.enemies = s.enemies.map((e) => ({ ...e, gone: true }));
    const n: ExploreNode = {
      key: keyOf(s, quant, scene),
      state: s,
      from: '',
      macro: 'start',
      tape: [],
      depth: 0,
      frames: 0,
    };
    if (!nodes.has(n.key) && !o.known?.has(n.key)) {
      nodes.set(n.key, n);
      queue.push(n);
    }
  }
  const glow = o.glow === null ? null : (o.glow ?? Math.round(t.glow.max));
  let truncated = false;
  const byTime = o.order === 'time';
  const done = new Set<string>();
  while (queue.length > 0) {
    let n: ExploreNode;
    if (byTime) {
      // (The earliest node not yet expanded: a plain scan, the frontier is small.)
      let bi = 0;
      for (let i = 1; i < queue.length; i++)
        if ((queue[i] as ExploreNode).frames < (queue[bi] as ExploreNode).frames) bi = i;
      n = queue.splice(bi, 1)[0] as ExploreNode;
      if (done.has(n.key)) continue;
      done.add(n.key);
    } else n = queue.shift() as ExploreNode;
    if (o.goal?.(n.state)) return { nodes, exits, exitsAll, truncated, steps };
    const s = n.state;
    const owns = (a: string) => (s.save.abilities as readonly string[]).includes(a);
    const list: Macro[] = [...base, ...pogos];
    if (owns('dash')) list.push(...dashes);
    if (o.more) list.push(...o.more);
    const S = withShortcuts(scene, s.save);
    // (A tap of Lamp by a cold moonwick is a kindle, not a gust: only the kindle macro may spend her glow.)
    if (owns('gust') && scene.glow)
      list.push(...(kindleTarget(s, S, t) >= 0 ? gust.filter((g) => g.name.startsWith('gusthop')) : gust));
    if (o.kindle !== false && owns('kindle') && scene.glow) {
      if (kindleTarget(s, S, t) >= 0) list.push(kindle);
      else if (coldNear(s, S, 600)) list.push(...airKindle);
    }
    if (flings.length && flameNear(s, S, 640)) {
      // (Chains only where a second flame is near: the same aim alone otherwise. And only the approaches that can
      // bring a flame into reach: one that way or above, within a jump's, or a double jump's, rise.)
      const many = flamesNear(s, S, 1000) > 1;
      const ok = approachesFor(s, S);
      const chained = (n: string) => /-c[ulr](-k)?$/.test(n);
      const airKindle = o.kindle !== false && owns('kindle') && !!scene.glow && coldNear(s, S, 1000);
      list.push(
        ...flings.filter(
          (f) =>
            (many || !chained(f.name) || (airKindle && f.name.endsWith('-k'))) &&
            ok.has(f.name.split('-')[1] ?? '') &&
            (airKindle || !f.name.endsWith('-k')),
        ),
      );
    }
    const keep = o.keepLamps ?? true;
    for (const m of list) {
      const r = play(s, m, scene, t, scene.glow && glow !== null ? glow : null, o.world);
      steps += r.steps;
      if (keep) relight(r.state, s, scene);
      if (r.outcome === 'exit' && r.exit) {
        if (!exits.has(r.exit)) exits.set(r.exit, { from: n, macro: m.name, tape: r.tape });
        if (o.allExits) {
          const all = exitsAll.get(r.exit) ?? [];
          if (all.length < o.allExits) all.push({ from: n, macro: m.name, tape: r.tape });
          exitsAll.set(r.exit, all);
        }
        if (r.exit === o.goalExit) return { nodes, exits, exitsAll, truncated, steps };
        continue;
      }
      if (r.outcome !== 'stand') continue;
      // (Standing on a one-way she can drop through is fine; standing inside a solid never happens.)
      void oneWayUnder;
      const key = keyOf(r.state, quant, scene);
      const frames = n.frames + r.tape.length;
      if (o.known?.has(key)) continue;
      const was = nodes.get(key);
      if (was && (!byTime || was.frames <= frames || done.has(key))) continue;
      const node: ExploreNode = {
        key,
        state: r.state,
        from: n.key,
        macro: m.name,
        tape: r.tape,
        depth: n.depth + 1,
        frames,
      };
      nodes.set(key, node);
      if (o.goal?.(r.state)) return { nodes, exits, exitsAll, truncated, steps };
      if (nodes.size >= maxNodes) {
        truncated = true;
        return { nodes, exits, exitsAll, truncated, steps };
      }
      queue.push(node);
    }
  }
  return { nodes, exits, exitsAll, truncated, steps };
}

/** The macro chain (names) from a start to `node`, and its whole input tape. */
export function pathTo(res: ExploreResult, node: ExploreNode): { macros: string[]; tape: number[] } {
  const macros: string[] = [];
  const tapes: number[][] = [];
  let n: ExploreNode | undefined = node;
  while (n && n.from !== '') {
    macros.unshift(n.macro);
    tapes.unshift(n.tape);
    n = res.nodes.get(n.from);
  }
  return { macros, tape: tapes.flat() };
}

/** Nodes whose feet are inside the rect. */
export function nodesIn(
  res: ExploreResult,
  r: { x: number; y: number; w: number; h: number },
): ExploreNode[] {
  const out: ExploreNode[] = [];
  for (const n of res.nodes.values()) {
    const f = feet(n.state);
    if (f.x >= r.x && f.x < r.x + r.w && f.y >= r.y && f.y <= r.y + r.h) out.push(n);
  }
  return out;
}

export { A, B, D, J, L, R, U };
