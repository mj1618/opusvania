/**
 * Golden replay tapes (tests/replays/*.json), per movement-spec §7.3. A tape is a room + seed +
 * preset + input DSL, with two levels of expectation:
 *
 *  1. Behavioural (always checked, survives tuning changes): reach a target within maxFrames,
 *     at most N deaths, optional per-frame assertions on the normalised player view.
 *  2. Golden (checked only while the tuning hash matches): the exact end position/frame, the end
 *     hash and a hash every 60 frames. A tuning change marks goldens "stale" (not a failure); a
 *     hash change on the same tuning fails, with a message saying whether the sim code changed
 *     since recording (-> re-record) or not (-> determinism bug).
 *
 * Pure (no fs): the browser uses it too, for cross-runtime checks. File I/O is in tools/tape.ts.
 */

import { formatInputScript as formatTape, parseInputScript as parseTape } from '../input/script';
import type { SimEvent } from '../sim/events';
import type { GameState } from '../sim/index';
import type { Tuning } from '../sim/tuning';
import { type BuildMeta, buildMeta, explainMismatch, sameSim } from './build-info';
import { HeadlessSim, type SimSetup } from './headless';
import {
  type AbilitySet,
  type AssistSet,
  type DeepPartial,
  normEvent,
  overlaps,
  type PlayerView,
  resolveTarget,
  tuningHash,
} from './sim-adapter';

export const HASH_EVERY = 60;

export interface TapeAssert {
  /** Frame to check (state.frame after that step); default: the end. */
  frame?: number;
  /** Path into the player view (`grounded`, `x`, `state`...) or `room` for the room id. */
  path: string;
  eq?: unknown;
  min?: number;
  max?: number;
}

/** An event expectation (L3 brief §6.1): count events of `type` whose raw fields match `match`. */
export interface TapeEventExpect {
  type: string;
  match?: Record<string, unknown>;
  min?: number;
  max?: number;
}

export interface TapeExpect {
  /** Target the player must reach (see resolveTarget: `G`, `spawn:a`, `tile:x,y`...). */
  target?: string;
  /** The target must be reached within this many steps. */
  maxFrames?: number;
  /** Max deaths allowed (default 0). */
  maxDeaths?: number;
  assert?: TapeAssert[];
  events?: TapeEventExpect[];
}

export interface TapeGolden {
  tuningHash: string;
  build: BuildMeta;
  end: { x: number; y: number; frame: number; room: string };
  hash: string;
  /** State hash after every HASH_EVERY-th step. */
  hashes: string[];
}

export interface TapeFile {
  kind: 'tape';
  name: string;
  notes?: string;
  room?: string;
  spawn?: string;
  seed?: number;
  preset?: string;
  tuning?: DeepPartial<Tuning> | Record<string, unknown>;
  assists?: AssistSet;
  abilities?: AbilitySet;
  /** Exact start state (browser recordings made mid-game). Overrides room/spawn/seed. */
  start?: GameState;
  /** Input DSL (see src/debug/dsl.ts). */
  inputs: string;
  expect: TapeExpect;
  golden?: TapeGolden;
  /** Who made it: 'bot', 'browser', 'hand'. */
  source?: string;
}

export interface TapeRun {
  steps: number;
  hash: string;
  hashes: string[];
  end: PlayerView;
  room: string;
  reachedAt?: number;
  deaths: number;
  tuningHash: string;
  /** Player view per frame, for assertions. Index i = after step i+1. */
  views: PlayerView[];
  /** Counts per event expectation (same order as expect.events). */
  eventCounts: number[];
}

export function tapeSetup(t: TapeFile): SimSetup {
  const s: SimSetup = { seed: t.seed ?? 1 };
  if (t.room !== undefined) s.room = t.room;
  if (t.spawn !== undefined) s.spawn = t.spawn;
  if (t.preset !== undefined) s.preset = t.preset;
  if (t.tuning !== undefined) s.tuning = t.tuning;
  if (t.assists !== undefined) s.assists = t.assists;
  if (t.abilities !== undefined) s.abilities = t.abilities;
  if (t.start !== undefined) s.start = t.start;
  return s;
}

export function runTape(t: TapeFile): TapeRun {
  const sim = new HeadlessSim(tapeSetup(t));
  const target = t.expect.target ? resolveTarget(sim.state.roomId, t.expect.target) : undefined;
  const hashes: string[] = [];
  const views: PlayerView[] = [];
  let reachedAt: number | undefined;
  let deaths = 0;
  let steps = 0;
  const want = t.expect.events ?? [];
  const eventCounts = want.map(() => 0);
  for (const input of parseTape(t.inputs)) {
    const evs = sim.step(input);
    steps++;
    for (const e of evs) {
      if (normEvent(e).type === 'death') deaths++;
      for (let i = 0; i < want.length; i++)
        if (eventMatches(e, want[i] as TapeEventExpect)) eventCounts[i] = (eventCounts[i] ?? 0) + 1;
    }
    const v = sim.view;
    views.push(v);
    if (target && reachedAt === undefined && overlaps(v, target)) reachedAt = steps;
    if (steps % HASH_EVERY === 0) hashes.push(sim.hash());
  }
  const run: TapeRun = {
    steps,
    hash: sim.hash(),
    hashes,
    end: sim.view,
    room: sim.state.roomId,
    deaths,
    tuningHash: tuningHash(sim.tuning),
    views,
    eventCounts,
  };
  if (reachedAt !== undefined) run.reachedAt = reachedAt;
  return run;
}

function eventMatches(e: SimEvent, w: TapeEventExpect): boolean {
  if (e.type !== w.type) return false;
  if (!w.match) return true;
  const r = e as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(w.match)) if (r[k] !== v) return false;
  return true;
}

export type GoldenStatus = 'match' | 'stale' | 'mismatch' | 'none';

export interface TapeCheck {
  name: string;
  ok: boolean;
  failures: string[];
  golden: GoldenStatus;
  /** Human-readable notes (stale reason, build mismatch explanation). */
  notes: string[];
  run: TapeRun;
}

function getPath(v: PlayerView, room: string, path: string): unknown {
  if (path === 'room') return room;
  return (v as unknown as Record<string, unknown>)[path];
}

export function checkTape(t: TapeFile): TapeCheck {
  const run = runTape(t);
  const failures: string[] = [];
  const notes: string[] = [];
  const e = t.expect;
  if (e.target !== undefined) {
    if (run.reachedAt === undefined)
      failures.push(`never reached target "${e.target}" in ${run.steps} steps`);
    else if (e.maxFrames !== undefined && run.reachedAt > e.maxFrames)
      failures.push(`reached "${e.target}" on step ${run.reachedAt}, after maxFrames ${e.maxFrames}`);
  }
  const maxDeaths = e.maxDeaths ?? 0;
  if (run.deaths > maxDeaths) failures.push(`${run.deaths} deaths (max ${maxDeaths})`);
  (e.events ?? []).forEach((w, i) => {
    const n = run.eventCounts[i] ?? 0;
    const what = `${w.type}${w.match ? JSON.stringify(w.match) : ''}`;
    if (w.min !== undefined && n < w.min) failures.push(`${n} ${what} events, expected >= ${w.min}`);
    if (w.max !== undefined && n > w.max) failures.push(`${n} ${what} events, expected <= ${w.max}`);
  });
  for (const a of e.assert ?? []) {
    const idx = a.frame === undefined ? run.views.length - 1 : a.frame - 1;
    const v = run.views[idx];
    if (!v) {
      failures.push(`assert ${a.path}: no frame ${a.frame}`);
      continue;
    }
    const val = getPath(v, run.room, a.path);
    const at = a.frame === undefined ? 'end' : `step ${a.frame}`;
    if (a.eq !== undefined && JSON.stringify(val) !== JSON.stringify(a.eq))
      failures.push(`${a.path} at ${at} = ${JSON.stringify(val)}, expected ${JSON.stringify(a.eq)}`);
    if (a.min !== undefined && !(typeof val === 'number' && val >= a.min))
      failures.push(`${a.path} at ${at} = ${JSON.stringify(val)}, expected >= ${a.min}`);
    if (a.max !== undefined && !(typeof val === 'number' && val <= a.max))
      failures.push(`${a.path} at ${at} = ${JSON.stringify(val)}, expected <= ${a.max}`);
  }

  let golden: GoldenStatus = 'none';
  const g = t.golden;
  if (g) {
    if (g.tuningHash !== run.tuningHash) {
      golden = 'stale';
      notes.push(
        `golden stale: tuning changed since recording (${g.tuningHash} -> ${run.tuningHash}); behavioural checks still ran. Refresh with npm run tape -- update.`,
      );
    } else if (g.hash === run.hash && g.hashes.every((h, i) => run.hashes[i] === h)) {
      golden = 'match';
    } else {
      golden = 'mismatch';
      const firstBad = g.hashes.findIndex((h, i) => run.hashes[i] !== h);
      const where =
        firstBad >= 0
          ? `first differs by step ${(firstBad + 1) * HASH_EVERY}`
          : `only the end hash differs (${g.end.x},${g.end.y} -> ${run.end.x},${run.end.y})`;
      const why = explainMismatch(g.build, buildMeta(g.build.stateVersion));
      failures.push(`golden hash mismatch (${where}). ${why}`);
      if (!sameSim(g.build, buildMeta(g.build.stateVersion)))
        notes.push('sim fingerprint differs from the recording build');
    }
  }
  return { name: t.name, ok: failures.length === 0, failures, golden, notes, run };
}

/** Fills in / refreshes the golden section from a fresh run of the current build. */
export function withGolden(t: TapeFile): TapeFile {
  const run = runTape(t);
  return {
    ...t,
    golden: {
      tuningHash: run.tuningHash,
      build: buildMeta(),
      end: { x: run.end.x, y: run.end.y, frame: run.steps, room: run.room },
      hash: run.hash,
      hashes: run.hashes,
    },
  };
}

/** Builds a tape from a setup + input masks (bot output, browser recording), with goldens. */
export function makeTape(
  name: string,
  setup: SimSetup,
  inputs: readonly number[] | string,
  expect: TapeExpect,
  source?: string,
): TapeFile {
  const t: TapeFile = {
    kind: 'tape',
    name,
    inputs: typeof inputs === 'string' ? formatTape(parseTape(inputs)) : formatTape(inputs),
    expect,
  };
  if (source) t.source = source;
  if (setup.start) t.start = setup.start;
  else {
    if (setup.room !== undefined) t.room = setup.room;
    if (setup.spawn !== undefined) t.spawn = setup.spawn;
  }
  t.seed = setup.seed ?? 1;
  if (setup.preset !== undefined) t.preset = setup.preset;
  if (setup.tuning !== undefined) t.tuning = setup.tuning;
  if (setup.assists !== undefined) t.assists = setup.assists;
  if (setup.abilities !== undefined) t.abilities = setup.abilities;
  return withGolden(t);
}

/**
 * Greedy tape trimmer (L3 brief §6.1): repeatedly shortens each input segment by one frame
 * (dropping it at zero) while the behavioural expectations still pass and the target is reached no
 * later; cuts everything after the target; repeats until nothing changes. Deterministic, so a
 * trimmed tape re-trims to the same length (the verdict's integrity guard checks that).
 */
export function trimTape(t: TapeFile): { tape: TapeFile; before: number; after: number; tries: number } {
  const base = { ...t, golden: undefined };
  const behaves = (inputs: string): TapeRun | null => {
    const c = checkTape({ ...base, inputs });
    return c.ok ? c.run : null;
  };
  const first = behaves(t.inputs);
  if (!first) throw new Error(`trimTape: ${t.name} does not pass before trimming`);
  const cut = (masks: number[], run: TapeRun): number[] =>
    run.reachedAt !== undefined ? masks.slice(0, run.reachedAt) : masks;
  let masks = cut(parseTape(t.inputs), first);
  let best = first.reachedAt ?? masks.length;
  const before = best;
  let tries = 0;
  for (let changed = true; changed; ) {
    changed = false;
    // Segments: runs of identical masks.
    for (let i = 0; i < masks.length; ) {
      let n = 1;
      while (masks[i + n] === masks[i]) n++;
      const next = [...masks.slice(0, i), ...masks.slice(i + 1)];
      tries++;
      const run = behaves(formatTape(next));
      const at = run?.reachedAt ?? next.length;
      if (run && at <= best) {
        masks = cut(next, run);
        best = at;
        changed = true;
        // Stay on this segment (it is one frame shorter now, or gone).
      } else i += n;
    }
  }
  const tape = withGolden({ ...t, inputs: formatTape(masks), source: `${t.source ?? 'hand'}+trim` });
  return { tape, before, after: best, tries };
}

export function isTapeFile(x: unknown): x is TapeFile {
  return typeof x === 'object' && x !== null && (x as { kind?: unknown }).kind === 'tape';
}
