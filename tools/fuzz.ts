/**
 * Seeded random-input fuzzer (L3 brief §6.1, checks C1 and C3).
 *
 *   npm run fuzz -- --room lot-7 --runs 500 --frames 3600            # C3 robustness, all verbs
 *   npm run fuzz -- --room lot-7 --no-verbs --runs 500 --frames 3600 # C1: never reaches G without verbs
 *   npm run fuzz -- --room the-pit --runs 500 --frames 3600 --json
 *
 * Input: holds of 1-30 frames of a random subset of the room's allowed actions (seeded, outside the
 * sim). Invariants checked EVERY step: no levied object, enemy or Kid box inside a solid (tiles or
 * dynamic); bag <= slots; sounds conserved (each id in exactly one place); Chin within [0, max];
 * no NaN (hashState throws); every enemy in a legal state; attack tokens <= max. After each run:
 * loadRoom and assert the room-local state deep-equals a fresh load (regeneration). Every 50th run
 * the room's expert tape (tests/replays/<room>.*) is replayed from that reloaded state and must reach G.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { HeadlessSim } from '../src/debug/headless';
import { overlaps, resolveTarget } from '../src/debug/sim-adapter';
import { parseInputScript } from '../src/input/script';
import { hashState, loadRoom } from '../src/sim/index';
import { ActionBit } from '../src/sim/input';
import { solidAt } from '../src/sim/physics/aabb';
import { conservationProblems } from '../src/sim/sound';
import type { GameState } from '../src/sim/state';
import { defaultTuning } from '../src/sim/tuning';
import { dynSolidAt, rebuildSolids } from '../src/sim/world/dynamic';
import { getRoom } from '../src/sim/world/rooms';
import { a4Scan, d3Scan } from './l3-verdict/checks';
import { installBuildInfo } from './lib/build-info';

installBuildInfo();

const LEGAL = new Set([
  'PATROL',
  'CHASE',
  'TELEGRAPH',
  'ACTIVE',
  'RECOVERY',
  'RETRIEVE',
  'ABSORB',
  'STAGGER',
  'LAUNCHED',
  'DOWN',
  'COUNT',
  'REPOSSESSED',
  'RISE',
  'KO',
  'FLINCH',
  'HOP',
  'FLEE',
]);

export interface FuzzOptions {
  room: string;
  runs: number;
  frames: number;
  seed: number;
  verbs: boolean;
  /** Expert inputs (DSL) replayed every 50th run; must reach G. */
  expert?: string;
}

export interface FuzzResult {
  room: string;
  runs: number;
  frames: number;
  verbs: boolean;
  violations: string[];
  /** Runs in which Kid reached G. */
  reachedG: number;
  expertChecks: number;
  expertFailures: number;
  /** A4 over every fuzzed step: feedback events checked and those missing a same-step hitstop. */
  a4: { checked: number; bad: string[] };
  /** D3/T4 over every fuzzed step: attacks checked and telegraph-gap violations. */
  d3: { attacks: number; bad: string[] };
  ms: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Invariant problems in a state (empty = fine). */
export function invariantProblems(s: GameState, slots: number, maxChin: number, maxTokens: number): string[] {
  const out: string[] = [];
  const room = getRoom(s.roomId);
  const ts = defaultTuning.world.tileSize;
  rebuildSolids(s, ts);
  const L = s.local;
  for (const l of L.levied) {
    if (solidAt(room, ts, l.x, l.y, l.w, l.h) || dynSolidAt(l.x, l.y, l.w, l.h, l.id))
      out.push(`levied ${l.id} (${l.colour} ${l.phase}) inside a solid at ${l.x},${l.y}`);
  }
  for (const e of L.enemies) {
    if (!LEGAL.has(e.state)) out.push(`enemy ${e.id} in illegal state ${e.state}`);
    if (e.state === 'KO' || e.state === 'REPOSSESSED') continue;
    if (solidAt(room, ts, e.x, e.y, e.w, e.h) || dynSolidAt(e.x, e.y, e.w, e.h))
      out.push(`enemy ${e.id} inside a solid at ${e.x},${e.y}`);
    if (!(e.hp >= 0)) out.push(`enemy ${e.id} hp ${e.hp}`);
  }
  const p = s.player;
  if (p.state !== 'dead' && (solidAt(room, ts, p.x, p.y, p.w, p.h) || dynSolidAt(p.x, p.y, p.w, p.h)))
    out.push(`Kid inside a solid at ${p.x},${p.y}`);
  out.push(...conservationProblems(L, slots));
  if (p.chin < 0 || p.chin > maxChin) out.push(`chin ${p.chin}`);
  const tokens = L.enemies.filter((e) => e.token).length;
  if (tokens > maxTokens) out.push(`${tokens} attack tokens`);
  if (p.chin > p.chinMax) out.push(`chin ${p.chin} > max ${p.chinMax}`);
  for (const sh of L.shots)
    if (!(sh.life >= 0) || !Number.isFinite(sh.x + sh.y)) out.push(`shot ${sh.id} bad`);
  try {
    hashState(s);
  } catch (err) {
    out.push(`hash: ${(err as Error).message}`);
  }
  return out;
}

export function fuzz(o: FuzzOptions): FuzzResult {
  const t0 = performance.now();
  const rand = rng(o.seed);
  const probe = new HeadlessSim({ room: o.room });
  const ab = probe.state.player.abilities;
  const actions = [
    ActionBit.left,
    ActionBit.right,
    ActionBit.up,
    ActionBit.down,
    ActionBit.jump,
    ActionBit.attack,
  ];
  if (ab.dash) actions.push(ActionBit.dash);
  if (o.verbs && ab.seize) actions.push(ActionBit.seize);
  if (o.verbs && ab.levy) actions.push(ActionBit.levy);
  if (o.verbs && ab.seize) actions.push(ActionBit.special);
  const abilities = o.verbs ? undefined : { seize: false, levy: false };
  const fresh = new HeadlessSim({ room: o.room, ...(abilities ? { abilities } : {}) });
  const goal = resolveTarget(o.room, 'G');
  const slots = fresh.tuning.bag.slots;
  const maxChin = fresh.tuning.kid.chin;
  const maxTokens = fresh.tuning.combat.maxAttackTokens;
  const violations: string[] = [];
  let reachedG = 0;
  let expertChecks = 0;
  let expertFailures = 0;
  const expert = o.expert ? parseInputScript(o.expert) : null;
  const a4 = { checked: 0, bad: [] as string[] };
  const d3 = { attacks: 0, bad: [] as string[] };
  for (let run = 0; run < o.runs && violations.length < 20; run++) {
    const sim = new HeadlessSim({ room: o.room, seed: run + 1, ...(abilities ? { abilities } : {}) });
    let f = 0;
    let reached = false;
    let left = false;
    const runSteps: ReturnType<typeof sim.step>[] = [];
    const runFrozen: boolean[] = [];
    while (f < o.frames && !reached && !left) {
      let mask = 0;
      for (const a of actions) if (rand() < 0.3) mask |= a;
      const hold = 1 + Math.floor(rand() * 30);
      for (let i = 0; i < hold && f < o.frames; i++, f++) {
        runFrozen.push(sim.state.hitstop > 0);
        const evs = sim.step(mask);
        runSteps.push(evs);
        if (evs.some((e) => e.type === 'goal')) reached = true;
        // Left the room (the goal's warp, or Counted Out to the Corner): the run ends.
        if (sim.state.roomId !== o.room) {
          left = true;
          break;
        }
        if (overlaps(sim.view, goal)) reached = true;
        const probs = invariantProblems(sim.state, slots, maxChin, maxTokens);
        if (probs.length) violations.push(`run ${run} frame ${f}: ${probs.join('; ')}`);
        if (reached || violations.length >= 20) break;
      }
    }
    if (reached) reachedG++;
    const r4 = a4Scan(runSteps);
    a4.checked += r4.checked;
    for (const b of r4.bad) if (a4.bad.length < 20) a4.bad.push(`run ${run} ${b}`);
    const r3 = d3Scan(runSteps, runFrozen);
    d3.attacks += r3.attacks;
    for (const b of r3.bad) if (d3.bad.length < 20) d3.bad.push(`run ${run} ${b}`);
    // Regeneration: a reload must equal a fresh load.
    if (sim.state.roomId === o.room) {
      // A Runner waiting in this room (Kid was Counted Out here) is run state, not regeneration.
      sim.state.run.runner = null;
      loadRoom(sim.state, o.room, undefined, sim.tuning, []);
      if (JSON.stringify(sim.state.local) !== JSON.stringify(fresh.state.local))
        violations.push(`run ${run}: reloaded local state differs from a fresh load`);
      if (expert && run % 50 === 0 && o.verbs) {
        expertChecks++;
        let ok = false;
        for (const m of expert) {
          sim.step(m);
          if (overlaps(sim.view, goal)) {
            ok = true;
            break;
          }
        }
        if (!ok) {
          expertFailures++;
          violations.push(`run ${run}: the expert tape no longer reaches G after a reload`);
        }
      }
    }
  }
  return {
    room: o.room,
    runs: o.runs,
    frames: o.frames,
    verbs: o.verbs,
    violations,
    reachedG,
    expertChecks,
    expertFailures,
    a4,
    d3,
    ms: Math.round(performance.now() - t0),
  };
}

/** The expert inputs for a room: its first expert tape in tests/replays (lot-7 -> lot-7.slab). */
export function expertFor(room: string): string | undefined {
  const file = { 'lot-7': 'lot-7.slab.json', 'lot-7-control': 'lot-7-control.json' }[room];
  if (!file) return undefined;
  try {
    const t = JSON.parse(readFileSync(resolve(import.meta.dirname, '../tests/replays', file), 'utf8')) as {
      inputs: string;
    };
    return t.inputs;
  } catch {
    return undefined;
  }
}

if (process.argv[1]?.endsWith('fuzz.ts')) {
  const { values: args } = parseArgs({
    options: {
      room: { type: 'string', default: 'lot-7' },
      runs: { type: 'string', default: '500' },
      frames: { type: 'string', default: '3600' },
      seed: { type: 'string', default: '1' },
      'no-verbs': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  const room = args.room as string;
  const r = fuzz({
    room,
    runs: Number(args.runs),
    frames: Number(args.frames),
    seed: Number(args.seed),
    verbs: !args['no-verbs'],
    expert: expertFor(room),
  });
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(
      `fuzz ${r.room} ${r.verbs ? 'all verbs' : 'no verbs'}: ${r.runs} runs x ${r.frames} f in ${r.ms} ms; reached G in ${r.reachedG} runs; expert re-checks ${r.expertChecks - r.expertFailures}/${r.expertChecks}; ${r.violations.length} violations; A4 ${r.a4.checked - r.a4.bad.length}/${r.a4.checked}; T4 ${r.d3.attacks - r.d3.bad.length}/${r.d3.attacks}`,
    );
    for (const v of r.violations.slice(0, 20)) console.log(`  ${v}`);
  }
  if (r.violations.length > 0) process.exitCode = 1;
}
