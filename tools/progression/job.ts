/**
 * One in-room reachability search (a "job"): plain JSON in and out, so it can run inline or in a
 * worker thread (pool.ts). Starts at a spawn, or at a tile (a pickup, a ledge) via placePlayer.
 */
import { HeadlessSim, runScenario, type SimSetup } from '../../src/debug/headless';
import { ABILITIES, type Ability, type AbilitySet, placePlayer } from '../../src/debug/sim-adapter';
import { search } from '../bot/search';

export interface Job {
  room: string;
  spawn: string;
  /** Start on the floor of this tile instead of at the spawn (room state is still a fresh load). */
  at?: { tx: number; ty: number };
  abilities: Ability[];
  target: string;
  budget: number;
  seed: number;
  preset?: string;
  /** Bounded region (`rect:x,y,w,h`, px): the search may not leave it (so it can exhaust). */
  region?: string;
}

export interface JobResult {
  found: boolean;
  exhausted: boolean;
  frames?: number;
  tape?: string;
  verified?: boolean;
  generated: number;
  ms: number;
  closest: number;
}

export function abilitySet(list: readonly Ability[]): AbilitySet {
  const out: AbilitySet = {};
  for (const a of ABILITIES) out[a] = list.includes(a);
  return out;
}

/** The SimSetup a job starts from (also used to replay evidence tapes). */
export function jobSetup(j: Pick<Job, 'room' | 'spawn' | 'at' | 'abilities' | 'seed' | 'preset'>): SimSetup {
  const base: SimSetup = {
    room: j.room,
    seed: j.seed,
    abilities: abilitySet(j.abilities),
    ...(j.preset ? { preset: j.preset } : {}),
  };
  if (!j.at) return { ...base, spawn: j.spawn };
  const sim = new HeadlessSim({ ...base, spawn: j.spawn });
  placePlayer(sim.state, j.at.tx, j.at.ty, sim.tuning);
  return { ...base, start: sim.state };
}

export function runJob(j: Job): JobResult {
  const rm = j.region ? /^rect:(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(j.region) : null;
  const bounds = rm ? { x: Number(rm[1]), y: Number(rm[2]), w: Number(rm[3]), h: Number(rm[4]) } : undefined;
  const r = search({
    ...jobSetup(j),
    room: j.room,
    target: j.target,
    budget: j.budget,
    ...(bounds ? { bounds } : {}),
  });
  return {
    found: r.found && r.verified === true,
    exhausted: r.exhausted,
    ...(r.frames !== undefined ? { frames: r.frames } : {}),
    ...(r.tape !== undefined ? { tape: r.tape } : {}),
    ...(r.verified !== undefined ? { verified: r.verified } : {}),
    generated: r.generated,
    ms: r.ms,
    closest: Math.round(r.closest.distance),
  };
}

/** Replays a tape from the job's start; returns the frame the target was reached (no deaths), if any. */
export function replayReaches(
  j: Pick<Job, 'room' | 'spawn' | 'at' | 'abilities' | 'seed' | 'preset' | 'target'>,
  tape: string,
): number | undefined {
  const r = runScenario({ ...jobSetup(j), inputs: tape, stop: { target: j.target } });
  return r.deaths === 0 ? r.reachedAt : undefined;
}
