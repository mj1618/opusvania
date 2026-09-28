/**
 * Headless runner: the sim with no Game, no render and no DOM, for scripted scenarios in Node
 * (tools, tests, bot, feel report) and in the browser (tape checks). Everything goes through
 * sim-adapter.ts so it survives controller rewrites.
 *
 *   const r = runScenario({ room: 'hall', spawn: 'a', inputs: 'R30 R+J12 .40', trace: true });
 *   r.trace[12].p.vy; r.final.hash; r.events
 */

import { maskLabel, parseInputScript as parseTape, type InputScript as Tape } from '../input/script';
import type { SimEvent } from '../sim/events';
import type { GameState } from '../sim/index';
import type { InputFrame } from '../sim/input';
import type { Tuning } from '../sim/tuning';
import {
  type AbilitySet,
  type AssistSet,
  applyAbilities,
  cloneState,
  type DeepPartial,
  hashState,
  mergeInto,
  type NormEvent,
  newState,
  normEvent,
  overlaps,
  type PlayerView,
  playerView,
  presetTuning,
  type Rect,
  resolveTarget,
  roomAbilities,
  setAssists,
  stepState,
  tuningHash,
} from './sim-adapter';

/** One traced sim step: the frame number it produced, the input consumed, the player after it. */
export interface TraceFrame {
  f: number;
  /** Input label (DSL letters, `.` = nothing). */
  in: string;
  p: PlayerView;
  /** Events emitted during this step (type + kind; raw payload in `raw`). */
  ev: NormEvent[];
}

export interface LoggedEvent {
  f: number;
  e: NormEvent;
}

export interface SimSetup {
  room?: string;
  spawn?: string;
  seed?: number;
  /** Preset name (PRESETS in src/sim/tuning.ts; default 'opus'). */
  preset?: string;
  /** Overrides merged on top of the preset. */
  tuning?: DeepPartial<Tuning> | Record<string, unknown>;
  assists?: AssistSet;
  /** Abilities to grant/remove; defaults to the room's declared abilities. */
  abilities?: AbilitySet;
  /** Start from this exact state instead of a fresh room load (e.g. a browser recording). */
  start?: GameState;
}

/** A sim instance you can step, branch (clone) and inspect. */
export class HeadlessSim {
  state: GameState;
  readonly tuning: Tuning;
  /** Events from the most recent step. */
  lastEvents: SimEvent[] = [];
  /** Start-up events (roomEnter etc.). */
  readonly initEvents: SimEvent[] = [];

  constructor(setup: SimSetup = {}, fromClone?: { state: GameState; tuning: Tuning }) {
    if (fromClone) {
      this.state = fromClone.state;
      this.tuning = fromClone.tuning;
      return;
    }
    this.tuning = buildTuning(setup);
    if (setup.start) this.state = cloneState(setup.start);
    else
      this.state = newState(
        { roomId: setup.room, spawn: setup.spawn, seed: setup.seed ?? 1 },
        this.tuning,
        this.initEvents,
      );
    // A fresh room load gets the room's declared abilities; an exact start state keeps its own.
    const abilities = setup.abilities ?? (setup.start ? undefined : roomAbilities(this.state.roomId));
    if (abilities) applyAbilities(this.state, abilities);
  }

  step(input: InputFrame): SimEvent[] {
    const events: SimEvent[] = [];
    stepState(this.state, input, this.tuning, events);
    this.lastEvents = events;
    return events;
  }

  /** Branch: independent copy (tuning is shared; it is read-only to the sim). */
  clone(): HeadlessSim {
    return new HeadlessSim({}, { state: clonePlain(this.state), tuning: this.tuning });
  }

  get view(): PlayerView {
    return playerView(this.state);
  }

  get frame(): number {
    return this.state.frame;
  }

  hash(): string {
    return hashState(this.state);
  }
}

/**
 * Deep copy of plain JSON data. ~5x faster than a JSON round trip for small states, which matters
 * for the bot (millions of branches). The sim's own cloneState stays JSON-based on purpose.
 */
export function clonePlain<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) return v.map(clonePlain) as T;
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = clonePlain((v as Record<string, unknown>)[k]);
  return out as T;
}

export function buildTuning(setup: Pick<SimSetup, 'preset' | 'tuning' | 'assists'>): Tuning {
  const t = presetTuning(setup.preset ?? 'opus');
  if (setup.tuning)
    mergeInto(t as unknown as Record<string, unknown>, setup.tuning as Record<string, unknown>);
  if (setup.assists) setAssists(t, setup.assists);
  return t;
}

export interface ScenarioStop {
  /** Stop as soon as the player overlaps this target (name, `tile:x,y`, `rect:x,y,w,h` or a Rect). */
  target?: string | Rect;
  /** Stop on the first death event. */
  onDeath?: boolean;
}

export interface Scenario extends SimSetup {
  inputs: Tape;
  /** Record a per-frame trace (default false; events are always logged). */
  trace?: boolean;
  stop?: ScenarioStop;
}

export interface ScenarioResult {
  /** Steps actually run (may be < inputs when a stop condition hit). */
  steps: number;
  final: { state: GameState; hash: string; player: PlayerView };
  events: LoggedEvent[];
  trace?: TraceFrame[];
  /** Frame on which the target was first overlapped, if any. */
  reachedAt?: number;
  deaths: number;
  tuningHash: string;
}

/** Loads a room, runs an input tape, returns the trace and final state. Deterministic. */
export function runScenario(sc: Scenario): ScenarioResult {
  const sim = new HeadlessSim(sc);
  const inputs = parseTape(sc.inputs);
  const target = sc.stop?.target !== undefined ? resolveTarget(sim.state.roomId, sc.stop.target) : undefined;
  const trace: TraceFrame[] | undefined = sc.trace ? [] : undefined;
  const events: LoggedEvent[] = sim.initEvents.map((e) => ({ f: sim.frame, e: normEvent(e) }));
  let reachedAt: number | undefined;
  let deaths = 0;
  let steps = 0;
  for (const input of inputs) {
    const evs = sim.step(input).map(normEvent);
    steps++;
    for (const e of evs) events.push({ f: sim.frame, e });
    const p = sim.view;
    trace?.push({ f: sim.frame, in: maskLabel(input), p, ev: evs });
    const died = evs.some((e) => e.type === 'death');
    if (died) deaths++;
    if (target && reachedAt === undefined && overlaps(p, target)) reachedAt = sim.frame;
    if (reachedAt !== undefined || (died && sc.stop?.onDeath)) break;
  }
  const res: ScenarioResult = {
    steps,
    final: { state: sim.state, hash: sim.hash(), player: sim.view },
    events,
    deaths,
    tuningHash: tuningHash(sim.tuning),
  };
  if (trace) res.trace = trace;
  if (reachedAt !== undefined) res.reachedAt = reachedAt;
  return res;
}

/** Renders a trace as fixed-width text, one line per frame (for agents reading logs). */
export function formatTrace(trace: readonly TraceFrame[]): string {
  const lines = ['frame  input   x      y      vx      vy     gnd state      move     bag  events'];
  for (const t of trace) {
    const p = t.p;
    const ev = t.ev.map((e) => (e.kind ? `${e.type}:${e.kind}` : e.type)).join(' ');
    lines.push(
      [
        String(t.f).padStart(5),
        t.in.padEnd(7),
        String(p.x).padStart(6),
        String(p.y).padStart(6),
        p.vx.toFixed(2).padStart(7),
        p.vy.toFixed(2).padStart(7),
        p.grounded ? ' G ' : ' . ',
        p.state.padEnd(10),
        (p.move ? `${p.move}${p.moveFrame}` : '-').padEnd(8),
        (p.bag.map((c) => c[0]).join('') || '-').padEnd(4),
        ev,
      ].join(' '),
    );
  }
  return lines.join('\n');
}
