/**
 * How a run felt, frame by frame (humanrun.ts): a timeline per 10 s (what she was doing, threat, novelty,
 * idle and backtracking, deaths) and the feel metrics STUDIO.md "Cohesion first" asks for. Pure.
 */
import type { SimEvent } from '../../src/sim/events';
import type { GameState } from '../../src/sim/state';

export interface Bucket {
  /** Start, seconds. */
  t: number;
  rooms: string[];
  /** Frames of each: running / in the air / standing / fighting (a creature within 400) / caught or held / in the cocoon. */
  doing: Record<string, number>;
  /** The most creatures within 400 px at once. */
  threat: number;
  /** New 128 px cells stood in (novelty). */
  novelty: number;
  /** Frames with no button held and not moving. */
  idle: number;
  /** Frames moving through cells already left once. */
  backtrack: number;
  deaths: number;
  hits: number;
  catches: number;
  presses: number;
  /** One word: exploring / travelling / fighting / stuck / falling / waking. */
  label: string;
}

export interface FeelMetrics {
  /** Seconds from spawn to the first button (the cocoon listens from 2.5 s), and to the first frame with control. */
  firstInputS: number;
  controlS: number;
  /** % of the time with control: moving at half run speed or more, or in the air (flow) vs stood still. */
  flowPct: number;
  stoppedPct: number;
  deathsPer10Min: number;
  /** Repeats: a fall or a death within 20 s and 300 px of the one before (the same spot, tried again). */
  retryLoops: number;
  /** The longest stretch moving only through cells already walked, seconds. */
  longestRepeatS: number;
  /** Presses a second (with control). */
  inputDensity: number;
  /** Average seconds between "something new" (a new cell, a room first entered, an ability, a lamp out). */
  newEveryS: number;
}

const SURPRISES = new Set([
  'hurt',
  'enemyWindup',
  'enemyNotice',
  'enemyDive',
  'enemyFeint',
  'lureCaught',
  'grab',
  'enemyWake',
  'fallReturn',
  'reform',
]);

/**
 * Events a person did not plan for (the motor reacts to them with a reaction time). A ram after its tell
 * is no surprise (the tell was): the answer to it is planned, timed ahead.
 */
export function surprising(e: SimEvent): boolean {
  return SURPRISES.has(e.type as string);
}

export class Feel {
  readonly buckets: Bucket[] = [];
  private cells = new Map<string, Set<string>>();
  private left = new Set<string>();
  private lastCell = '';
  private prevMask = 0;
  private f = 0;
  private controlFrom = -1;
  private firstInput = -1;
  private flow = 0;
  private stopped = 0;
  private control = 0;
  private presses = 0;
  private news = 0;
  private repeatRun = 0;
  private repeatMax = 0;
  private deaths = 0;
  private falls: Array<{ f: number; x: number; y: number; room: string }> = [];
  private loops = 0;

  record(s: GameState, mask: number, events: readonly SimEvent[]): void {
    const f = this.f++;
    const bi = Math.floor(f / 600);
    let b = this.buckets[bi];
    if (!b) {
      b = {
        t: bi * 10,
        rooms: [],
        doing: {},
        threat: 0,
        novelty: 0,
        idle: 0,
        backtrack: 0,
        deaths: 0,
        hits: 0,
        catches: 0,
        presses: 0,
        label: '',
      };
      this.buckets[bi] = b;
    }
    const p = s.player;
    const x = p.x + p.w / 2;
    const y = p.y + p.h;
    if (!b.rooms.includes(s.room)) b.rooms.push(s.room);
    const shut = !!s.hatch && !s.hatch.done;
    const held =
      !!s.exit || !!s.caught || p.faded > 0 || ((p as unknown as { lure?: number }).lure ?? -1) >= 0;
    const near = s.enemies.filter(
      (e) => !e.gone && e.mode !== 'dead' && Math.abs(e.x + e.w / 2 - x) < 400 && Math.abs(e.y - p.y) < 300,
    ).length;
    b.threat = Math.max(b.threat, near);
    const moving = Math.abs(p.vx) > 4.8 || !p.grounded;
    const doing = shut
      ? 'cocoon'
      : held
        ? 'held'
        : near > 0
          ? 'fighting'
          : !p.grounded
            ? 'air'
            : moving
              ? 'run'
              : 'stand';
    b.doing[doing] = (b.doing[doing] ?? 0) + 1;
    const rising = mask & ~this.prevMask;
    let pressed = 0;
    for (let m = rising; m; m &= m - 1) pressed++;
    this.prevMask = mask;
    b.presses += pressed;
    if (this.firstInput < 0 && mask !== 0) this.firstInput = f;
    if (!shut && !held) {
      if (this.controlFrom < 0) this.controlFrom = f;
      this.control++;
      this.presses += pressed;
      if (moving) this.flow++;
      else if (p.grounded && Math.abs(p.vx) < 0.5) this.stopped++;
      if (mask === 0 && !moving) b.idle++;
      const ck = `${Math.floor(x / 128)},${Math.floor(y / 128)}`;
      let set = this.cells.get(s.room);
      if (!set) {
        set = new Set();
        this.cells.set(s.room, set);
      }
      if (ck !== this.lastCell) {
        if (this.lastCell) this.left.add(`${s.room}/${this.lastCell}`);
        this.lastCell = ck;
      }
      if (!set.has(ck)) {
        set.add(ck);
        b.novelty++;
        this.news++;
        this.repeatRun = 0;
      } else if (this.left.has(`${s.room}/${ck}`) && moving) {
        b.backtrack++;
        this.repeatRun++;
        this.repeatMax = Math.max(this.repeatMax, this.repeatRun);
      }
    }
    for (const e of events) {
      if (e.type === 'fade' || e.type === 'fallCatch') {
        if (e.type === 'fade') {
          b.deaths++;
          this.deaths++;
        } else b.catches++;
        const prev = this.falls[this.falls.length - 1];
        if (prev && prev.room === s.room && f - prev.f < 1200 && Math.hypot(prev.x - x, prev.y - y) < 300)
          this.loops++;
        this.falls.push({ f, x, y, room: s.room });
      }
      if (e.type === 'hurt') b.hits++;
      if (e.type === 'gladeGrant' || (e.type as string) === 'lureSnuff') this.news++;
    }
  }

  /** Closes the buckets (labels) and returns the metrics. */
  finish(): { buckets: Bucket[]; metrics: FeelMetrics } {
    for (const b of this.buckets) {
      const top = Object.entries(b.doing).sort((a, c) => c[1] - a[1])[0]?.[0] ?? '';
      b.label =
        top === 'cocoon'
          ? 'waking'
          : top === 'held' || b.deaths + b.catches > 0
            ? 'falling'
            : top === 'fighting'
              ? 'fighting'
              : b.novelty >= 6
                ? 'exploring'
                : b.idle > 300 || (b.novelty === 0 && b.backtrack < 120)
                  ? 'stuck'
                  : 'travelling';
    }
    const mins = Math.max(1, this.f) / 3600;
    const ctl = Math.max(1, this.control);
    return {
      buckets: this.buckets,
      metrics: {
        firstInputS: this.firstInput < 0 ? -1 : this.firstInput / 60,
        controlS: this.controlFrom < 0 ? -1 : this.controlFrom / 60,
        flowPct: (100 * this.flow) / ctl,
        stoppedPct: (100 * this.stopped) / ctl,
        deathsPer10Min: (this.deaths / mins) * 10,
        retryLoops: this.loops,
        longestRepeatS: this.repeatMax / 60,
        inputDensity: this.presses / (ctl / 60),
        newEveryS: this.news ? this.f / 60 / this.news : -1,
      },
    };
  }
}
