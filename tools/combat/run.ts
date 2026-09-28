/**
 * Runs one fairness-bot fight (tools/combat/fighter.ts) headless and collects the §6.4 metrics.
 */
import { clonePlain, HeadlessSim } from '../../src/debug/headless';
import type { SimEvent } from '../../src/sim/events';
import type { GameState } from '../../src/sim/state';
import { decide, FIGHTERS, type Mind, seeded } from './fighter';

export interface FightResult {
  room: string;
  fighter: string;
  seed: number;
  /** Frames to roomClear (every enemy KO'd or repossessed), or undefined. */
  clear?: number;
  /** Counted outs (the fight is lost). */
  countedOut: number;
  hurts: number;
  chinLost: number;
  hazards: number;
  ringRecovered: number;
  ringStarted: number;
  takes: number;
  catches: number;
  levies: number;
  swallows: number;
  repossessions: number;
  kos: number;
  counterHits: number;
  cleanSlips: number;
  /** Longest stretch (frames) with no punch, seize, levy or slip started, after engaging. */
  longestIdle: number;
  /** First frame of combat (a telegraph, a hit, a hurt or a Seize); TTK counts from here. */
  engaged?: number;
  inputs: number[];
  steps?: SimEvent[][];
  frozen?: boolean[];
  frames: number;
}

export interface FightOpts {
  room: string;
  fighter: string;
  seed: number;
  maxFrames?: number;
  record?: boolean;
  /** Stop at the first counted out (a lost fight) instead of fighting on from the Corner. */
  stopOnLoss?: boolean;
  /** Mutate the fresh state before the fight (isolation setups). */
  setup?: (s: GameState) => void;
  /** Called after every step (trace checks that need the state). */
  onStep?: (s: GameState, events: SimEvent[], before: GameState) => void;
}

const ENGAGE = new Set(['telegraph', 'hit', 'hurt', 'seizeTake', 'catch', 'seizeGuarded']);

export function runFight(o: FightOpts): FightResult {
  const opts = FIGHTERS[o.fighter];
  if (!opts) throw new Error(`Unknown fighter ${o.fighter}`);
  const sim = new HeadlessSim({ room: o.room, seed: o.seed });
  o.setup?.(sim.state);
  const mind: Mind = {
    opts,
    t: sim.tuning,
    rand: seeded(o.seed),
    plan: [],
    reads: {},
    prev: 0,
    lastEval: -99,
  };
  const hist: GameState[] = [];
  const max = o.maxFrames ?? 3600;
  const r: FightResult = {
    room: o.room,
    fighter: o.fighter,
    seed: o.seed,
    countedOut: 0,
    hurts: 0,
    chinLost: 0,
    hazards: 0,
    ringRecovered: 0,
    ringStarted: 0,
    takes: 0,
    catches: 0,
    levies: 0,
    swallows: 0,
    repossessions: 0,
    kos: 0,
    counterHits: 0,
    cleanSlips: 0,
    longestIdle: 0,
    inputs: [],
    frames: 0,
  };
  if (o.record) {
    r.steps = [];
    r.frozen = [];
  }
  let idle = 0;
  for (let f = 0; f < max; f++) {
    hist.push(clonePlain(sim.state));
    if (hist.length > opts.delay + 1) hist.shift();
    const seen = hist[0] as GameState;
    const mask = decide(mind, seen, sim.state);
    mind.prev = mask;
    r.frozen?.push(sim.state.hitstop > 0);
    const before = o.onStep ? clonePlain(sim.state) : sim.state;
    const evs = sim.step(mask);
    o.onStep?.(sim.state, evs, before);
    r.steps?.push(evs);
    r.inputs.push(mask);
    r.frames = f + 1;
    let verb = false;
    if (r.engaged === undefined && evs.some((e) => ENGAGE.has(e.type))) {
      r.engaged = f + 1;
      idle = 0;
    }
    for (const e of evs) {
      switch (e.type) {
        case 'hurt':
          r.hurts++;
          r.chinLost += e.dmg;
          break;
        case 'hazard':
          r.hazards++;
          r.chinLost += e.dmg;
          break;
        case 'ringStart':
          r.ringStarted++;
          break;
        case 'ringRecover':
          r.ringRecovered++;
          break;
        case 'seizeTake':
          r.takes++;
          break;
        case 'catch':
          r.catches++;
          break;
        case 'levyThrow':
          r.levies++;
          break;
        case 'swallowCommit':
          r.swallows++;
          break;
        case 'repossess':
          r.repossessions++;
          break;
        case 'ko':
          r.kos++;
          break;
        case 'counterHit':
          r.counterHits++;
          break;
        case 'slipClean':
          r.cleanSlips++;
          break;
        case 'countedOut':
          r.countedOut++;
          break;
        case 'roomClear':
          if (r.clear === undefined) r.clear = f + 1;
          break;
        case 'moveStart':
        case 'dashStart':
          verb = true;
          break;
        default:
          break;
      }
    }
    if (sim.state.hitstop === 0) idle = verb ? 0 : idle + 1;
    if (r.clear === undefined && r.engaged !== undefined) r.longestIdle = Math.max(r.longestIdle, idle);
    if (r.clear !== undefined) break;
    if (r.countedOut > 0 && o.stopOnLoss !== false) break;
    if (sim.state.roomId !== o.room) break;
  }
  return r;
}
