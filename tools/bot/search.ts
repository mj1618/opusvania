/**
 * Search bot (movement-spec §8): best-first (weighted A*) search over input macros, on the
 * headless sim, to find a path from a room's spawn to a target. Deterministic: same inputs ->
 * same tape, byte for byte (heap ties break on insertion order; no clocks or randomness affect
 * the result). Budget-limited; "not found" is "not found within budget" unless the reachable
 * space was exhausted, in which case the target is unreachable for this macro set.
 *
 * This is the reachability oracle the Phase 3 progression validator builds on:
 *   search({ room, target: 'G', abilities: { dash: true } }).found
 */

import { HeadlessSim, runScenario, type SimSetup } from '../../src/debug/headless';
import {
  type AbilitySet,
  botKey,
  normEvent,
  overlaps,
  type PlayerView,
  type Rect,
  resolveTarget,
  roomAbilities,
  roomInfo,
} from '../../src/debug/sim-adapter';
import { formatInputScript as formatTape, parseInputScript as parseTape } from '../../src/input/script';
import { ActionBit } from '../../src/sim/input';

export interface Macro {
  name: string;
  mask: number;
  /** Ability the macro needs (dash / pogo / seize / levy); others are always available. */
  needs?: 'dash' | 'pogo' | 'seize' | 'levy';
}

/**
 * The spec's 12 macros (`. L R J LJ RJ X LX RX DA LDA RDA`), `DJ` for drop-through, and the L3
 * verbs (`S US DS LS RS V UV DV LV RV RJS RJV`).
 */
export const ALL_MACROS: Macro[] = [
  { name: '.', mask: 0 },
  { name: 'L', mask: ActionBit.left },
  { name: 'R', mask: ActionBit.right },
  { name: 'J', mask: ActionBit.jump },
  { name: 'LJ', mask: ActionBit.left | ActionBit.jump },
  { name: 'RJ', mask: ActionBit.right | ActionBit.jump },
  // Not in the spec's list, but one-way drop-through (gym-06, gym-13) needs Down+Jump.
  { name: 'DJ', mask: ActionBit.down | ActionBit.jump },
  { name: 'X', mask: ActionBit.dash, needs: 'dash' },
  { name: 'LX', mask: ActionBit.left | ActionBit.dash, needs: 'dash' },
  { name: 'RX', mask: ActionBit.right | ActionBit.dash, needs: 'dash' },
  { name: 'DA', mask: ActionBit.down | ActionBit.attack, needs: 'pogo' },
  { name: 'LDA', mask: ActionBit.left | ActionBit.down | ActionBit.attack, needs: 'pogo' },
  { name: 'RDA', mask: ActionBit.right | ActionBit.down | ActionBit.attack, needs: 'pogo' },
  // L3 brief §3: Seize and Levy (dropped when the room or claim removes the ability).
  { name: 'S', mask: ActionBit.seize, needs: 'seize' },
  { name: 'US', mask: ActionBit.up | ActionBit.seize, needs: 'seize' },
  { name: 'DS', mask: ActionBit.down | ActionBit.seize, needs: 'seize' },
  { name: 'LS', mask: ActionBit.left | ActionBit.seize, needs: 'seize' },
  { name: 'RS', mask: ActionBit.right | ActionBit.seize, needs: 'seize' },
  { name: 'V', mask: ActionBit.levy, needs: 'levy' },
  { name: 'UV', mask: ActionBit.up | ActionBit.levy, needs: 'levy' },
  { name: 'DV', mask: ActionBit.down | ActionBit.levy, needs: 'levy' },
  { name: 'LV', mask: ActionBit.left | ActionBit.levy, needs: 'levy' },
  { name: 'RV', mask: ActionBit.right | ActionBit.levy, needs: 'levy' },
  { name: 'RJS', mask: ActionBit.right | ActionBit.jump | ActionBit.seize, needs: 'seize' },
  { name: 'RJV', mask: ActionBit.right | ActionBit.jump | ActionBit.levy, needs: 'levy' },
];

export function macrosFor(abilities: AbilitySet): Macro[] {
  return ALL_MACROS.filter((m) => !m.needs || abilities[m.needs] === true);
}

export interface SearchOptions extends SimSetup {
  room: string;
  target: string | Rect;
  /** Frames each macro is held (spec k = 4). */
  macroFrames?: number;
  /** Max child nodes simulated (each = macroFrames sim steps). Spec: 300k. */
  budget?: number;
  /** Depth cap in frames. */
  maxFrames?: number;
  /** Heuristic weight: 1 = A* (shortest in frames, slower), >1 greedier (faster, longer paths). */
  weight?: number;
  /** Speed estimate in px/frame used to turn distance into frames for the heuristic. */
  speedEstimate?: number;
  /**
   * 'flow' (default): distance to the target through non-solid tiles (BFS from the target), so
   * walls and mazes don't trap the search. 'euclid': straight-line distance (spec §8 original).
   */
  heuristic?: 'flow' | 'euclid';
  /**
   * Bounded region (px): states whose player box leaves it are pruned, so a search confined to a
   * gate's neighbourhood can EXHAUST (a proof) where the whole room would only run out of budget
   * (world-design G7). Reaching the target still counts wherever it is. Bounded searches compute the
   * reachable set (no maxFrames cap; a key is closed on its first visit), so found tapes may be long.
   */
  bounds?: Rect;
  /**
   * Aimed moves the search may not perform (`<move>:<dir>`, e.g. `seize:up`): a state where a
   * matching `moveStart` fired is pruned (the gate audit's aim checks).
   */
  forbid?: readonly string[];
}

/** True when `e` starts a move listed in `forbid` (`<move>:<dir>`). */
export function isForbiddenMove(e: { type: string }, forbid: readonly string[] | undefined): boolean {
  if (!forbid?.length || e.type !== 'moveStart') return false;
  const m = e as { move?: string; dir?: string };
  return forbid.includes(`${m.move}:${m.dir}`);
}

export interface SearchResult {
  found: boolean;
  /** True when every reachable (deduped) state was expanded without finding the target. */
  exhausted: boolean;
  room: string;
  target: Rect;
  abilities: AbilitySet;
  macros: string[];
  /** Solution length in frames and as a tape (DSL), when found. */
  frames?: number;
  tape?: string;
  /** The tape was replayed from scratch and reached the target on the same frame. */
  verified?: boolean;
  expanded: number;
  generated: number;
  uniqueStates: number;
  simFrames: number;
  ms: number;
  /** Closest approach to the target (px from the player box to the target rect). */
  closest: { distance: number; x: number; y: number; frame: number };
}

interface Node {
  parent: number;
  macro: number;
  /** Frames the macro actually ran (< macroFrames when the target was hit mid-macro). */
  frames: number;
  g: number;
  sim?: HeadlessSim;
}

/** Binary min-heap on (f, seq): deterministic tie-breaking. */
class Heap {
  private f: number[] = [];
  private seq: number[] = [];
  private id: number[] = [];

  get size(): number {
    return this.id.length;
  }

  push(f: number, seq: number, id: number): void {
    this.f.push(f);
    this.seq.push(seq);
    this.id.push(id);
    let i = this.id.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number | undefined {
    const n = this.id.length;
    if (n === 0) return undefined;
    const top = this.id[0];
    this.swap(0, n - 1);
    this.f.pop();
    this.seq.pop();
    this.id.pop();
    let i = 0;
    const m = n - 1;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let s = i;
      if (l < m && this.less(l, s)) s = l;
      if (r < m && this.less(r, s)) s = r;
      if (s === i) break;
      this.swap(i, s);
      i = s;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const fa = this.f[a] ?? 0;
    const fb = this.f[b] ?? 0;
    return fa < fb || (fa === fb && (this.seq[a] ?? 0) < (this.seq[b] ?? 0));
  }

  private swap(a: number, b: number): void {
    for (const arr of [this.f, this.seq, this.id]) {
      const t = arr[a] as number;
      arr[a] = arr[b] as number;
      arr[b] = t;
    }
  }
}

/** Distance in px from the player box to the target rect (0 when overlapping). */
export function rectDistance(p: PlayerView, r: Rect): number {
  const dx = Math.max(r.x - (p.x + p.w), p.x - (r.x + r.w), 0);
  const dy = Math.max(r.y - (p.y + p.h), p.y - (r.y + r.h), 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Flow field: px distance from every tile to the target through non-solid tiles (8-connected,
 * ignoring gravity and body size, so it never overestimates). Infinity = walled off.
 */
export function flowField(roomId: string, target: Rect): { dist: Float64Array; width: number; ts: number } {
  const room = roomInfo(roomId);
  const { width, height, tileSize: ts } = room;
  const dist = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const queue: number[] = [];
  const tx0 = Math.floor(target.x / ts);
  const ty0 = Math.floor(target.y / ts);
  const tx1 = Math.floor((target.x + target.w - 1) / ts);
  const ty1 = Math.floor((target.y + target.h - 1) / ts);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      dist[ty * width + tx] = 0;
      queue.push(ty * width + tx);
    }
  // Dijkstra-lite: 8-connected with diagonal cost sqrt(2); a simple queue with re-relaxation.
  const DIAG = Math.SQRT2 * ts;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi] as number;
    const x = i % width;
    const y = (i - x) / width;
    const d = dist[i] as number;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || room.solidAt(nx, ny)) continue;
        const nd = d + (dx !== 0 && dy !== 0 ? DIAG : ts);
        const j = ny * width + nx;
        if (nd < (dist[j] as number)) {
          dist[j] = nd;
          queue.push(j);
        }
      }
  }
  return { dist, width, ts };
}

export function search(opts: SearchOptions): SearchResult {
  const t0 = performance.now();
  const k = opts.macroFrames ?? 4;
  const budget = opts.budget ?? 300_000;
  const maxFrames = opts.maxFrames ?? 60 * 60;
  const weight = opts.weight ?? 1.5;
  const speed = opts.speedEstimate ?? 12;
  const bounds = opts.bounds;
  const abilities = opts.abilities ?? roomAbilities(opts.room);
  const macros = macrosFor(abilities);
  const rootSim = new HeadlessSim({ ...opts, abilities });
  const target = resolveTarget(rootSim.state.roomId, opts.target);
  const flow = (opts.heuristic ?? 'flow') === 'flow' ? flowField(rootSim.state.roomId, target) : null;
  /** Heuristic distance (px) from the player to the target. */
  const hDist = (v: PlayerView): number => {
    const d = rectDistance(v, target);
    if (!flow || d === 0) return d;
    const tx = Math.floor((v.x + v.w / 2) / flow.ts);
    const ty = Math.floor((v.y + v.h / 2) / flow.ts);
    const f = flow.dist[ty * flow.width + tx];
    // Inside a solid tile (body overlapping a wall edge) or walled off: fall back to straight line.
    return f === undefined || !Number.isFinite(f) ? d : Math.max(d, f);
  };

  const nodes: Node[] = [{ parent: -1, macro: -1, frames: 0, g: 0, sim: rootSim }];
  const best = new Map<string, number>([[botKey(rootSim.state), 0]]);
  const heap = new Heap();
  let seq = 0;
  heap.push(0, seq++, 0);
  let expanded = 0;
  let generated = 0;
  let simFrames = 0;
  let goal = -1;
  const v0 = rootSim.view;
  const closest = { distance: rectDistance(v0, target), x: v0.x, y: v0.y, frame: 0 };
  if (overlaps(v0, target)) goal = 0;

  while (goal < 0 && heap.size > 0 && generated < budget) {
    const id = heap.pop() as number;
    const node = nodes[id] as Node;
    const sim = node.sim;
    if (!sim) continue;
    node.sim = undefined; // closed: free the state, keep the path
    expanded++;
    for (let mi = 0; mi < macros.length && goal < 0; mi++) {
      const macro = macros[mi] as Macro;
      const child = sim.clone();
      let dead = false;
      let hit = 0;
      for (let f = 1; f <= k; f++) {
        const evs = child.step(macro.mask);
        simFrames++;
        if (
          evs.some((e) => normEvent(e).type === 'death' || isForbiddenMove(e, opts.forbid)) ||
          child.view.dead
        ) {
          dead = true;
          break;
        }
        if (overlaps(child.view, target)) {
          hit = f;
          break;
        }
      }
      generated++;
      if (dead) continue;
      const g = node.g + (hit || k);
      const v = child.view;
      const d = rectDistance(v, target);
      const h = hDist(v);
      if (d < closest.distance) Object.assign(closest, { distance: d, x: v.x, y: v.y, frame: g });
      if (hit) {
        nodes.push({ parent: id, macro: mi, frames: hit, g });
        goal = nodes.length - 1;
        break;
      }
      // Bounded (proof) searches compute the reachable set: no depth cap, first visit closes a key.
      if (g >= maxFrames && !bounds) continue;
      if (
        bounds &&
        !(
          v.x >= bounds.x &&
          v.y >= bounds.y &&
          v.x + v.w <= bounds.x + bounds.w &&
          v.y + v.h <= bounds.y + bounds.h
        )
      )
        continue;
      const key = botKey(child.state);
      const prev = best.get(key);
      if (prev !== undefined && (prev <= g || bounds)) continue;
      best.set(key, g);
      nodes.push({ parent: id, macro: mi, frames: k, g, sim: child });
      heap.push(g + (weight * h) / speed, seq++, nodes.length - 1);
    }
  }

  const res: SearchResult = {
    found: goal >= 0,
    exhausted: goal < 0 && heap.size === 0,
    room: opts.room,
    target,
    abilities,
    macros: macros.map((m) => m.name),
    expanded,
    generated,
    uniqueStates: best.size,
    simFrames,
    ms: 0,
    closest,
  };
  if (goal >= 0) {
    const masks: number[] = [];
    for (let i = goal; i > 0; ) {
      const n = nodes[i] as Node;
      const m = (macros[n.macro] as Macro).mask;
      for (let f = 0; f < n.frames; f++) masks.push(m);
      i = n.parent;
    }
    masks.reverse();
    res.frames = masks.length;
    res.tape = formatTape(masks);
    // Trust the result only after a clean replay from scratch.
    if (masks.length === 0) res.verified = true;
    else {
      const check = runScenario({ ...opts, abilities, inputs: res.tape, stop: { target } });
      res.verified =
        check.reachedAt !== undefined &&
        !check.events.some((x) => isForbiddenMove(x.e.raw, opts.forbid)) &&
        check.steps === masks.length &&
        check.deaths === 0 &&
        parseTape(res.tape).length === masks.length;
    }
  }
  res.ms = Math.round(performance.now() - t0);
  return res;
}
