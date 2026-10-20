/**
 * The Downwood's solver (memory/downwood.md): proves the built level's gating in the real sim.
 * `npx tsx tools/solve/downwood.ts [--stage s0,s1,...] [--max N] [--write]`.
 *
 * A world search over **arrivals**: an arrival is her state right after she came into a room (by an exit, the way
 * the sim carries her: `step` with the world swaps the room). From each new arrival the explorer
 * (tools/solve/explore.ts: walks, jumps, glides, climbs, drops, pogos, cuts, flings, dashes, in the real sim, the
 * creatures left out) searches the room; every exit it leaves by is played on through the crossing into the next
 * room, which is a new arrival. Each stage has a fixed kit (glades are taken out of the rooms: what a stage can
 * reach is what that kit reaches) and the flags it has earned:
 *   s0 nothing; s1 claws (the old burrback down); s2 claws + glide + the five moonseeds; s3 + the Weaver down;
 *   later-dj, later-dash: s3 + the double jump / the dash (the Moon Perch and the Lone Limb).
 * Each stage runs twice: lamps **spent** (every warm lamp out at every arrival: nothing a lamp gives is needed, the
 * lower bound) and lamps **kept** (every lamp burns again after every move: a superset, the skip hunt's side).
 *
 * The proofs (against the built layout, tools/levels/downwood-export.ts, i.e. place-score's input):
 *  - each stage's rooms, spent and kept, are exactly the layout's reach for that kit (locks hold, edges pass);
 *  - every link is crossed both ways it claims, at the first stage that has its kit (spent);
 *  - every find (seeds, hollows, stones, signs, patches, glades) is reached, every dead end entered;
 *  - no softlock: from every arrival (spent) a moon patch, or the glade of the next ability, can be reached.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getRoom } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, newSave, placePlayer, step } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { DEN_DOWN, WEAVER_DOWN } from '../levels/downwood';
import { exportDownwood, type Layout } from '../levels/downwood-export';
import { explore, feet, glideClimbMacros } from './explore';

const W = getWorld('downwood');
const T = cloneTuning(defaultTuning);
const SEEDS = ['seeds:1', 'seeds:2', 'seeds:3', 'seeds:4', 'seeds:5'];

export interface Stage {
  id: string;
  kit: string[];
  flags: string[];
  /** The layout's abilities this stage stands for (place-score's names), and keys / boss. */
  has: string[];
  keys: number;
  boss: boolean;
}
export const STAGES: Stage[] = [
  { id: 's0', kit: [], flags: [], has: [], keys: 0, boss: false },
  { id: 's1', kit: ['wallJump'], flags: [DEN_DOWN], has: ['claws'], keys: 0, boss: false },
  {
    id: 's2',
    kit: ['wallJump', 'glide'],
    flags: [DEN_DOWN, ...SEEDS],
    has: ['claws', 'glide'],
    keys: 5,
    boss: false,
  },
  {
    id: 's3',
    kit: ['wallJump', 'glide'],
    flags: [DEN_DOWN, ...SEEDS, WEAVER_DOWN],
    has: ['claws', 'glide'],
    keys: 5,
    boss: true,
  },
  {
    id: 'later-dj',
    kit: ['wallJump', 'glide', 'doubleJump'],
    flags: [DEN_DOWN, ...SEEDS, WEAVER_DOWN],
    has: ['claws', 'glide', 'doubleJump'],
    keys: 5,
    boss: true,
  },
  {
    id: 'later-dash',
    kit: ['wallJump', 'glide', 'dash'],
    flags: [DEN_DOWN, ...SEEDS, WEAVER_DOWN],
    has: ['claws', 'glide', 'dash'],
    keys: 5,
    boss: true,
  },
];

/** A room as a stage searches it: its glades taken out (the stage's kit is fixed). */
const SCENES = new Map<string, Room>();
function sceneOf(id: string): Room {
  let s = SCENES.get(id);
  if (!s) {
    const r = getRoom(id);
    s = { ...r, glades: [] };
    SCENES.set(id, s);
  }
  return s;
}

/** Every warm lamp of the room out (the spent run). */
function spendLamps(s: GameState, room: Room): void {
  const list = room.lures ?? [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || l.kind === 'moonwick' || l.kind === 'great' || l.kind === 'ring') continue;
    s.lures.hp[i] = 0;
    s.lures.out[i] = 1;
    s.lures.ember[i] = 0;
  }
}

function startState(stage: Stage): GameState {
  const room = sceneOf(W.start);
  const save = newSave(stage.kit as never);
  save.flags.push(...stage.flags);
  save.visited.push(room.id);
  const s = createState(1, T, room, [], stage.kit as never, save);
  placePlayer(s, room.spawn.x, room.spawn.y, T, withShortcuts(room, s.save), []);
  // (The hatching is a scene of its own: here she is out of the cocoon already.)
  s.hatch = null as never;
  return s;
}

/** Plays a tape from a state and on through the crossing; the state in the next room, or null. */
function cross(from: GameState, scene: Room, tape: number[]): GameState | null {
  const s = cloneState(from);
  const ev: SimEvent[] = [];
  for (const m of tape) {
    ev.length = 0;
    step(s, m, T, scene, ev, W);
  }
  for (let k = 0; k < 90 && s.room === scene.id; k++) {
    ev.length = 0;
    step(s, 0, T, scene, ev, W);
  }
  return s.room !== scene.id ? s : null;
}

function arrivalKey(s: GameState, via: string): string {
  const p = s.player;
  return [
    s.room,
    via,
    Math.round(p.x / 96),
    Math.round(p.y / 96),
    Math.sign(Math.round(p.vy)),
    Math.sign(Math.round(p.vx)),
    [...s.save.opened].sort().join(','),
  ].join('|');
}

export interface StageResult {
  stage: string;
  lamps: 'spent' | 'kept';
  rooms: Set<string>;
  /** `room#exit` crossed (she left the room by it into its neighbour). */
  crossed: Set<string>;
  /** `room:find` reached. */
  finds: Set<string>;
  /** Arrival graph: arrival key -> next arrival keys; patches / glades reached from each arrival. */
  graph: Map<string, Set<string>>;
  rests: Map<string, Set<string>>;
  arrivals: number;
  truncated: string[];
  /** Standing spots outside a room's rect (an arrival-only opening walked out of: a bug). */
  outside: string[];
  ms: number;
}

/** What a node of a room's search has reached: finds by the save, patches / signs / glades by where she stands. */
function findsAt(room: Room, s: GameState, out: Set<string>, rests: Set<string>): void {
  for (const k of s.save.taken) if (k.startsWith(`${room.id}:`)) out.add(k);
  if (!s.player.grounded) return;
  const f = feet(s);
  for (const p of room.patches ?? [])
    if (Math.abs(f.x - p.x) < 64 && Math.abs(f.y - p.y) < 8) {
      out.add(`${room.id}:${p.id}`);
      rests.add(`${room.id}:${p.id}`);
    }
  for (const g of getRoom(room.id).glades ?? [])
    if (f.x >= g.x && f.x <= g.x + g.w && f.y >= g.y && f.y <= g.y + g.h + 8) {
      out.add(`${room.id}:${g.id}`);
      rests.add(`${room.id}:${g.id}`);
    }
  for (const g of room.signs ?? [])
    if (Math.abs(f.x - g.x) < 100 && f.y <= g.y + 1 && f.y >= g.y - 200) out.add(`${room.id}:${g.id}`);
  for (const g of room.triggers ?? [])
    if (f.x >= g.x && f.x <= g.x + g.w && f.y >= g.y && f.y <= g.y + g.h + 8) out.add(`${room.id}:${g.id}`);
}

export function runStage(stage: Stage, lamps: 'spent' | 'kept', maxNodes = 2500, log = false): StageResult {
  const t0 = performance.now();
  const res: StageResult = {
    stage: stage.id,
    lamps,
    rooms: new Set(),
    crossed: new Set(),
    finds: new Set(),
    graph: new Map(),
    rests: new Map(),
    arrivals: 0,
    truncated: [],
    outside: [],
    ms: 0,
  };
  const seen = new Set<string>();
  /** Per room, the node keys already expanded in this stage (each new arrival searches only what is new). */
  const known = new Map<string, Set<string>>();
  const queue: Array<{ key: string; state: GameState }> = [];
  const s0 = startState(stage);
  const k0 = arrivalKey(s0, 'start');
  seen.add(k0);
  queue.push({ key: k0, state: s0 });
  while (queue.length > 0) {
    const { key, state } = queue.shift() as { key: string; state: GameState };
    res.arrivals++;
    const room = sceneOf(state.room);
    res.rooms.add(room.id);
    const start = cloneState(state);
    if (lamps === 'spent') spendLamps(start, room);
    const r = explore({
      scene: room,
      tuning: T,
      start: [start],
      world: W,
      maxNodes,
      keepLamps: lamps === 'kept',
      allExits: 4,
      known: known.get(room.id) ?? new Set(),
      more: glideClimbMacros(),
    });
    if (r.truncated) res.truncated.push(`${room.id} (${key})`);
    const k0 = known.get(room.id) ?? new Set<string>();
    for (const nk of r.nodes.keys()) k0.add(nk);
    known.set(room.id, k0);
    const next = new Set<string>();
    const rests = new Set<string>();
    for (const n of r.nodes.values()) {
      findsAt(room, n.state, res.finds, rests);
      const f = feet(n.state);
      if (
        n.macro !== 'start' &&
        n.state.player.grounded &&
        (f.x < 0 || f.x > room.width || f.y > room.height)
      )
        res.outside.push(`${room.id} (${Math.round(f.x)}, ${Math.round(f.y)})`);
    }
    for (const [exit, list] of r.exitsAll) {
      for (const x of list) {
        const s = cross(x.from.state, room, x.tape);
        if (!s) continue;
        res.crossed.add(`${room.id}#${exit}`);
        for (const k of s.save.taken) res.finds.add(k);
        const k = arrivalKey(s, `${room.id}#${exit}`);
        next.add(k);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ key: k, state: s });
      }
    }
    res.graph.set(key, next);
    res.rests.set(key, rests);
    if (log)
      console.log(
        `  ${stage.id}/${lamps} ${room.id}: ${r.nodes.size} nodes, exits ${[...r.exitsAll.keys()].join(' ')}`,
      );
  }
  res.ms = performance.now() - t0;
  return res;
}

/** The layout's reach for a kit (place-score's moves: requires, one-way, shortcuts opened from the far side). */
export function layoutReach(L: Layout, has: string[], keys: number, boss: boolean): Set<string> {
  const opened = new Set<number>();
  const seen = new Set([L.start]);
  const q = [L.start];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < q.length; i++) {
      const c = q[i] as string;
      L.links.forEach((l, li) => {
        const req = l.requires;
        const ok =
          !req ||
          (req.startsWith('keys:')
            ? keys >= Number(req.slice(5))
            : req === 'boss'
              ? boss
              : has.includes(req));
        if (!ok) return;
        if (l.a === c && !(l.shortcut && !opened.has(li)) && !seen.has(l.b)) {
          seen.add(l.b);
          q.push(l.b);
          grew = true;
        }
        if (l.b === c && !l.oneway) {
          if (l.shortcut && !opened.has(li)) {
            opened.add(li);
            grew = true;
          }
          if (!seen.has(l.a)) {
            seen.add(l.a);
            q.push(l.a);
            grew = true;
          }
        }
      });
    }
  }
  return new Set([...seen].map((id) => `dw-${id}`));
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x));
}

if (process.argv[1]?.endsWith('solve/downwood.ts')) {
  const args = process.argv.slice(2);
  const opt = (n: string) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const only = opt('stage')?.split(',');
  const lampsOpt = opt('lamps')?.split(',') as Array<'spent' | 'kept'> | undefined;
  const max = Number(opt('max') ?? 2500);
  const L = exportDownwood();
  const report: Record<string, unknown> = {};
  for (const st of STAGES) {
    if (only && !only.includes(st.id)) continue;
    const want = layoutReach(L, st.has, st.keys, st.boss);
    for (const lamps of lampsOpt ?? (['spent', 'kept'] as const)) {
      const r = runStage(st, lamps, max, args.includes('--log'));
      const extra = diff(r.rooms, want);
      const missing = diff(want, r.rooms);
      console.log(
        `${st.id} lamps ${lamps}: ${r.rooms.size} rooms (layout ${want.size}), ${r.arrivals} arrivals, ${Math.round(r.ms / 1000)} s` +
          `${extra.length ? `\n  EXTRA (a lock leaks): ${extra.join(' ')}` : ''}${missing.length ? `\n  MISSING (an edge fails): ${missing.join(' ')}` : ''}` +
          `${r.truncated.length ? `\n  truncated: ${r.truncated.length}` : ''}` +
          `${r.outside.length ? `\n  OUTSIDE a room: ${[...new Set(r.outside)].slice(0, 8).join(' ')}` : ''}`,
      );
      report[`${st.id}-${lamps}`] = {
        rooms: [...r.rooms].sort(),
        crossed: [...r.crossed].sort(),
        finds: [...r.finds].sort(),
        extra,
        missing,
        arrivals: r.arrivals,
        truncated: r.truncated,
        outside: [...new Set(r.outside)],
      };
    }
  }
  if (args.includes('--write')) {
    // (Merged into the last report: a run of some stages keeps the others' results.)
    const file = 'tools/solve/downwood-report.json';
    const old = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
    writeFileSync(file, `${JSON.stringify({ ...old, ...report }, null, 1)}\n`);
    console.log('wrote tools/solve/downwood-report.json');
  }
}
