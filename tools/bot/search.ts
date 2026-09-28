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
import { formatTape, parseTape } from '../../src/debug/dsl';
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
} from '../../src/debug/sim-adapter';
import { ActionBit } from '../../src/sim/input';

export interface Macro {
  name: string;
  mask: number;
  /** Ability the macro needs (dash / pogo); others are always available. */
  needs?: 'dash' | 'pogo';
}

/** The spec's 12 macros: `. L R J LJ RJ X LX RX DA LDA RDA`. */
export const ALL_MACROS: Macro[] = [
  { name: '.', mask: 0 },
  { name: 'L', mask: ActionBit.left },
  { name: 'R', mask: ActionBit.right },
  { name: 'J', mask: ActionBit.jump },
  { name: 'LJ', mask: ActionBit.left | ActionBit.jump },
  { name: 'RJ', mask: ActionBit.right | ActionBit.jump },
  { name: 'X', mask: ActionBit.dash, needs: 'dash' },
  { name: 'LX', mask: ActionBit.left | ActionBit.dash, needs: 'dash' },
  { name: 'RX', mask: ActionBit.right | ActionBit.dash, needs: 'dash' },
  { name: 'DA', mask: ActionBit.down | ActionBit.attack, needs: 'pogo' },
  { name: 'LDA', mask: ActionBit.left | ActionBit.down | ActionBit.attack, needs: 'pogo' },
  { name: 'RDA', mask: ActionBit.right | ActionBit.down | ActionBit.attack, needs: 'pogo' },
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

export function search(opts: SearchOptions): SearchResult {
  const t0 = performance.now();
  const k = opts.macroFrames ?? 4;
  const budget = opts.budget ?? 300_000;
  const maxFrames = opts.maxFrames ?? 60 * 60;
  const weight = opts.weight ?? 1.5;
  const speed = opts.speedEstimate ?? 12;
  const abilities = opts.abilities ?? roomAbilities(opts.room);
  const macros = macrosFor(abilities);
  const rootSim = new HeadlessSim({ ...opts, abilities });
  const target = resolveTarget(rootSim.state.roomId, opts.target);

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
        if (evs.some((e) => normEvent(e).type === 'death') || child.view.dead) {
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
      if (d < closest.distance) Object.assign(closest, { distance: d, x: v.x, y: v.y, frame: g });
      if (hit) {
        nodes.push({ parent: id, macro: mi, frames: hit, g });
        goal = nodes.length - 1;
        break;
      }
      if (g >= maxFrames) continue;
      const key = botKey(child.state);
      const prev = best.get(key);
      if (prev !== undefined && prev <= g) continue;
      best.set(key, g);
      nodes.push({ parent: id, macro: mi, frames: k, g, sim: child });
      heap.push(g + (weight * d) / speed, seq++, nodes.length - 1);
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
        check.steps === masks.length &&
        check.deaths === 0 &&
        parseTape(res.tape).length === masks.length;
    }
  }
  res.ms = Math.round(performance.now() - t0);
  return res;
}
