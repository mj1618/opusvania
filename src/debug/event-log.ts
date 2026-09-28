import type { Game } from '../game';
import type { SimEvent } from '../sim/events';
import type { LoggedEvent } from './headless';
import { lastInput, normEvent } from './sim-adapter';

export interface StepInfo {
  /** state.frame after the step. */
  f: number;
  input: number | undefined;
  events: LoggedEvent[];
}

/**
 * Debug tap on the live Game: a ring buffer of every sim event (stamped with the frame that
 * produced it) and per-step callbacks. Uses the Game's own hooks (`bus.onAny` sees every event,
 * including load() ones; `afterStep` fires once per step with that step's events), so the sim
 * and Game don't know about it. Read-only with respect to the sim.
 */
export class EventLog {
  private buf: LoggedEvent[] = [];
  /** Events from the most recent step. */
  last: LoggedEvent[] = [];
  private stepListeners = new Set<(s: StepInfo) => void>();

  constructor(
    private readonly game: Game,
    readonly capacity = 2000,
  ) {
    game.bus.onAny((e: SimEvent) => {
      this.buf.push({ f: game.state.frame, e: normEvent(e) });
      if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
    });
    game.afterStep.add((events) => {
      const f = game.state.frame;
      this.last = events.map((e) => ({ f, e: normEvent(e) }));
      if (this.stepListeners.size === 0) return;
      const info: StepInfo = { f, input: lastInput(game.state), events: this.last };
      for (const fn of this.stepListeners) fn(info);
    });
  }

  /** Last n events (all kept if n omitted), oldest first. Plain JSON. */
  recent(n?: number): LoggedEvent[] {
    const out = n === undefined ? this.buf : this.buf.slice(-n);
    return JSON.parse(JSON.stringify(out)) as LoggedEvent[];
  }

  /** Same as recent(), one readable line per event: `f123 jump:ground x=.. y=..`. */
  text(n?: number): string {
    return this.recent(n)
      .map(({ f, e }) => {
        const raw = e.raw as unknown as Record<string, unknown>;
        const fields = Object.entries(raw)
          .filter(([k]) => k !== 'type' && k !== 'kind')
          .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : JSON.stringify(v)}`)
          .join(' ');
        return `f${f} ${e.kind ? `${e.type}:${e.kind}` : e.type} ${fields}`.trimEnd();
      })
      .join('\n');
  }

  clear(): void {
    this.buf = [];
    this.last = [];
  }

  onStep(fn: (s: StepInfo) => void): () => void {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  get frame(): number {
    return this.game.state.frame;
  }
}
