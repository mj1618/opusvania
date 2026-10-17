/**
 * Telemetry for one run, from sim state and events each frame. Pure: the same recorder runs in a
 * headless run (one call per sim step) and in the page (one call per animation frame, which may
 * cover 0-5 sim steps: `frames`). Everything is keyed by `state.room`, so a run through several
 * rooms (exits between rooms) is recorded the same way as one room. Metric definitions:
 * memory/playtest-harness.md.
 */
import type { SimEvent } from '../../src/sim/events';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import { contains, sceneLights, type ViewRect } from './observe';

export interface RecorderOpts {
  /** No progress for this many frames is time lost (default 10 s). */
  lostAfter?: number;
  /** Path trace: one point every this many frames (default 4). */
  traceEvery?: number;
  /** Progress grid, px (default 128): standing in a cell never visited before is progress. */
  cell?: number;
  /** A room's region, for time per area (Room.region). */
  regionOf?: (room: string) => string | undefined;
}

export interface Where {
  f: number;
  room: string;
  x: number;
  y: number;
}

export interface RoomVisit {
  room: string;
  region: string;
  enter: number;
  leave: number;
  /** How it left: an exit id, 'end' (the run stopped there). */
  how: string;
}

export interface LostStretch {
  room: string;
  from: number;
  to: number;
  /** The box she wandered in meanwhile, and its centre. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RunTrace {
  persona: string;
  startRoom: string;
  seed: number;
  /** headless | live */
  mode: string;
  frames: number;
  /** exit (left through an exit), timeout, lost (gave up after the lost limit), stopped. */
  outcome: string;
  exitId: string | null;
  /** Frame the cocoon broke (null: no hatching, or never). */
  hatchFrame: number | null;
  rooms: RoomVisit[];
  framesByRoom: Record<string, number>;
  framesByRegion: Record<string, number>;
  path: Array<{ f: number; room: string; x: number; y: number; g: number }>;
  deaths: Array<Where & { by: string }>;
  catches: Array<Where & { id: string }>;
  hurts: Array<Where & { kind: string; id: string; hp: number }>;
  hitsByCreature: Record<string, number>;
  /**
   * Encounters (memory/creatures.md): per creature, from the first thing it did about her (noticed,
   * braced, told, grabbed) to the last; hits it gave; how it ended (killed, dispersed by a snuff, or
   * passed: she moved on with it alive).
   */
  encounters: Record<
    string,
    { kind: string; room: string; first: number; last: number; hits: number; grabs: number; outcome: string }
  >;
  kills: Array<Where & { id: string }>;
  lost: LostStretch[];
  lostFrames: number;
  backtrackFrames: number;
  /** Lights (lanterns, lamps, lures): first frame seen in view, lit, snuffed. */
  lights: Record<
    string,
    {
      room: string;
      kind: string;
      x: number;
      y: number;
      seen: number | null;
      lit: number | null;
      snuffed: number | null;
    }
  >;
  /** Moths set free (a lure put out frees its `moths`): one entry per event, `n` moths. */
  mothsFreed: Array<Where & { id: string; n: number }>;
  /** Lures (memory/lures.md): times each caught her, and frames she spent caught. */
  lureCatches: Record<string, number>;
  luredFrames: number;
  abilities: Array<Where & { id: string }>;
  pickups: number;
  input: { presses: number; changes: number; activeFrames: number; framesWithInput: number };
  speed: { maxPxS: number; avgPxS: number; avgMovingPxS: number; distance: number };
  jumps: number;
  dashes: number;
  glides: number;
  /** Every event type seen, with its count (new sim events show up here before anything reads them). */
  events: Record<string, number>;
  notes: string[];
  /** Where the persona decided to go, and when (planning personas). */
  itinerary: Array<{ f: number; why: string; x: number; y: number }>;
}

/** Event types that mean a moth was freed (none in the sim yet: the names its builder is likely to pick). */
const FREED = /^(moth(Freed|Free|Released|Rescue)|cocoonOpen|free(d)?Moth)$/i;
const SNUFF = /snuff/i;

export class Recorder {
  readonly t: RunTrace;
  private lostAfter: number;
  private traceEvery: number;
  private cell: number;
  private regionOf: (room: string) => string | undefined;
  private cells = new Map<string, Set<string>>();
  private lastCell = '';
  private leftCells = new Set<string>();
  private lastProgress = 0;
  private wander: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private room = '';
  private prevInput = 0;
  private prevAbilities = '';
  private movingFrames = 0;
  private speedSum = 0;
  private lastTrace = -1000;
  private lastPos: { x: number; y: number } | null = null;
  private frame = 0;

  constructor(persona: string, startRoom: string, seed: number, mode: string, opts: RecorderOpts = {}) {
    this.lostAfter = opts.lostAfter ?? 600;
    this.traceEvery = opts.traceEvery ?? 4;
    this.cell = opts.cell ?? 128;
    this.regionOf = opts.regionOf ?? (() => undefined);
    this.t = {
      persona,
      startRoom,
      seed,
      mode,
      frames: 0,
      outcome: 'stopped',
      exitId: null,
      hatchFrame: null,
      rooms: [],
      framesByRoom: {},
      framesByRegion: {},
      path: [],
      deaths: [],
      catches: [],
      hurts: [],
      hitsByCreature: {},
      encounters: {},
      kills: [],
      lost: [],
      lostFrames: 0,
      backtrackFrames: 0,
      lights: {},
      mothsFreed: [],
      lureCatches: {},
      luredFrames: 0,
      abilities: [],
      pickups: 0,
      input: { presses: 0, changes: 0, activeFrames: 0, framesWithInput: 0 },
      speed: { maxPxS: 0, avgPxS: 0, avgMovingPxS: 0, distance: 0 },
      jumps: 0,
      dashes: 0,
      glides: 0,
      events: {},
      notes: [],
      itinerary: [],
    };
  }

  /**
   * After a step (or several: `frames`): the state now, the input held, the events of those steps,
   * the camera's view and the room's scene.
   */
  record(
    state: GameState,
    input: number,
    events: readonly SimEvent[],
    view: ViewRect,
    scene: Scene,
    frames = 1,
  ): void {
    const t = this.t;
    const p = state.player;
    const x = p.x + p.w / 2;
    const y = p.y + p.h;
    const room = state.room;
    const f = this.frame + frames;
    this.frame = f;
    t.frames = f;

    if (room !== this.room) this.enterRoom(room, f, scene);
    t.framesByRoom[room] = (t.framesByRoom[room] ?? 0) + frames;
    const region = this.regionOf(room) ?? room;
    t.framesByRegion[region] = (t.framesByRegion[region] ?? 0) + frames;

    // Input density: presses = rising edges of any button.
    const rising = input & ~this.prevInput;
    for (let b = rising; b; b &= b - 1) t.input.presses++;
    if (input !== this.prevInput) t.input.changes++;
    if (input !== 0) t.input.framesWithInput += frames;
    this.prevInput = input;
    if (((p as unknown as { lure?: number }).lure ?? -1) >= 0) t.luredFrames += frames;
    const control = !state.exit && !state.caught && p.faded === 0 && !(state.hatch && !state.hatch.done);
    if (control) t.input.activeFrames += frames;

    // Speed and distance.
    const v = Math.hypot(p.vx, p.vy) * 60;
    if (control) {
      t.speed.maxPxS = Math.max(t.speed.maxPxS, v);
      this.speedSum += v * frames;
      if (v > 30) {
        this.movingFrames += frames;
        t.speed.avgMovingPxS += v * frames;
      }
    }
    if (this.lastPos && !events.some((e) => e.type === 'spawn'))
      t.speed.distance += Math.hypot(x - this.lastPos.x, y - this.lastPos.y);
    this.lastPos = { x, y };

    if (f - this.lastTrace >= this.traceEvery || events.some((e) => e.type === 'spawn')) {
      t.path.push({ f, room, x: Math.round(x), y: Math.round(y), g: p.grounded ? 1 : 0 });
      this.lastTrace = f;
    }

    for (const e of events) this.event(e, f, room, state);

    // Abilities gained (from the save, so any way of gaining one counts).
    const ab = state.save.abilities.join(',');
    if (ab !== this.prevAbilities) {
      const before = new Set(this.prevAbilities ? this.prevAbilities.split(',') : []);
      if (this.prevAbilities !== '' || f > frames)
        for (const id of state.save.abilities)
          if (!before.has(id)) {
            t.abilities.push({ f, room, x, y, id });
            this.progress(f);
          }
      this.prevAbilities = ab;
    }

    // Lights seen in view.
    for (const l of sceneLights(scene)) {
      const key = `${room}/${l.id}`;
      let rec = t.lights[key];
      if (!rec) {
        rec = { room, kind: l.kind, x: l.x, y: l.y, seen: null, lit: null, snuffed: null };
        t.lights[key] = rec;
      }
      if (rec.seen === null && contains(view, l.x, l.y - 48)) rec.seen = f;
    }

    // Progress cells, backtracking, lost time (only while she has control).
    if (control) {
      const ck = `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
      let set = this.cells.get(room);
      if (!set) {
        set = new Set();
        this.cells.set(room, set);
      }
      if (ck !== this.lastCell) {
        if (this.lastCell) this.leftCells.add(`${room}/${this.lastCell}`);
        this.lastCell = ck;
      }
      if (!set.has(ck)) {
        set.add(ck);
        this.progress(f);
      } else if (this.leftCells.has(`${room}/${ck}`) && v > 30) t.backtrackFrames += frames;
      const w = this.wander;
      if (w) {
        w.x0 = Math.min(w.x0, x);
        w.y0 = Math.min(w.y0, y);
        w.x1 = Math.max(w.x1, x);
        w.y1 = Math.max(w.y1, y);
      } else this.wander = { x0: x, y0: y, x1: x, y1: y };
    }
  }

  private enterRoom(room: string, f: number, _scene: Scene): void {
    const last = this.t.rooms[this.t.rooms.length - 1];
    if (last && last.leave < 0) last.leave = f;
    const fresh = !this.t.rooms.some((r) => r.room === room);
    this.t.rooms.push({ room, region: this.regionOf(room) ?? '', enter: f, leave: -1, how: '' });
    this.room = room;
    this.lastCell = '';
    if (fresh) this.progress(f);
  }

  /** Something new happened: close any stretch without progress (lost if long). */
  private progress(f: number): void {
    const gap = f - this.lastProgress;
    const w = this.wander;
    if (gap >= this.lostAfter && w) {
      this.t.lost.push({
        room: this.room,
        from: this.lastProgress,
        to: f,
        x0: w.x0,
        y0: w.y0,
        x1: w.x1,
        y1: w.y1,
      });
      this.t.lostFrames += gap;
    }
    this.lastProgress = f;
    this.wander = null;
  }

  /** Frames since the last progress (the runner gives up past a limit). */
  sinceProgress(): number {
    return this.frame - this.lastProgress;
  }

  /** A creature did something about her (`id`): its encounter starts or goes on. */
  private encounter(id: string, kind: string, f: number, room: string, outcome?: string): void {
    const t = this.t;
    const key = `${room}:${id}`;
    let en = t.encounters[key];
    if (!en) {
      en = { kind, room, first: f, last: f, hits: 0, grabs: 0, outcome: 'passed' };
      t.encounters[key] = en;
    }
    en.last = f;
    if (outcome) en.outcome = outcome;
  }

  private event(e: SimEvent, f: number, room: string, state: GameState): void {
    const t = this.t;
    t.events[e.type] = (t.events[e.type] ?? 0) + 1;
    const ex = (e as { x?: number }).x ?? 0;
    const ey = (e as { y?: number }).y ?? 0;
    // Creature events (enemy*, grab, webTouch) carry its id and kind: the encounter's clock.
    const cid = (e as { id?: string }).id;
    const ckind = (e as { kind?: string }).kind;
    if (
      cid &&
      ckind &&
      (e.type.startsWith('enemy') || e.type === 'grab') &&
      e.type !== 'enemyReset' &&
      !(e.type === 'enemyTurn' && (e as { cause?: string }).cause !== 'hit')
    ) {
      const key = `${room}:${cid}`;
      if (e.type === 'enemyDie') this.encounter(cid, ckind, f, room, 'killed');
      else if (e.type === 'enemyDisperse') {
        if (t.encounters[key]) this.encounter(cid, ckind, f, room, 'dispersed');
      } else this.encounter(cid, ckind, f, room);
      if (e.type === 'grab') (t.encounters[key] as { grabs: number }).grabs++;
    }
    if (e.type === 'hurt' && e.source) {
      this.encounter(e.source.id, e.source.kind, f, room);
      (t.encounters[`${room}:${e.source.id}`] as { hits: number }).hits++;
    }
    switch (e.type) {
      case 'hatch':
        t.hatchFrame = f;
        break;
      case 'roomExit': {
        const last = t.rooms[t.rooms.length - 1];
        if (last) last.how = e.id;
        t.exitId = e.id;
        break;
      }
      case 'fade':
        t.deaths.push({ f, room, x: ex, y: ey, by: t.hurts[t.hurts.length - 1]?.id ?? '?' });
        break;
      case 'fallCatch':
        t.catches.push({
          f,
          room,
          x: state.player.x + state.player.w / 2,
          y: state.player.y + state.player.h,
          id: e.id,
        });
        break;
      case 'hurt': {
        const id = e.source?.id ?? '?';
        t.hurts.push({ f, room, x: ex, y: ey, kind: e.source?.kind ?? '?', id, hp: e.hp });
        t.hitsByCreature[id] = (t.hitsByCreature[id] ?? 0) + 1;
        break;
      }
      case 'enemyDie':
        t.kills.push({ f, room, x: ex, y: ey, id: (e as { id?: string }).id ?? '?' });
        break;
      case 'pickup':
        t.pickups++;
        this.progress(f);
        break;
      case 'jump':
        t.jumps++;
        break;
      case 'dashStart':
        t.dashes++;
        break;
      case 'glideStart':
        t.glides++;
        break;
      case 'lanternKindle':
      case 'lampKindle':
        this.light(e.id, room, f, 'lit');
        this.progress(f);
        break;
      default: {
        const rec = e as { id?: unknown; moths?: unknown };
        const id = typeof rec.id === 'string' ? rec.id : '?';
        if ((e.type as string) === 'lureCaught') t.lureCatches[id] = (t.lureCatches[id] ?? 0) + 1;
        if (SNUFF.test(e.type)) {
          this.light(id, room, f, 'snuffed');
          if (typeof rec.moths === 'number' && rec.moths > 0)
            t.mothsFreed.push({ f, room, x: ex, y: ey, id, n: rec.moths });
          this.progress(f);
        } else if (FREED.test(e.type)) {
          t.mothsFreed.push({ f, room, x: ex, y: ey, id, n: typeof rec.moths === 'number' ? rec.moths : 1 });
          this.progress(f);
        }
      }
    }
  }

  private light(id: string, room: string, f: number, what: 'lit' | 'snuffed'): void {
    const key = `${room}/${id}`;
    const rec = this.t.lights[key] ?? { room, kind: '?', x: 0, y: 0, seen: f, lit: null, snuffed: null };
    if (rec[what] === null) rec[what] = f;
    this.t.lights[key] = rec;
  }

  /** Closes the run. */
  finish(outcome: string, notes: readonly string[] = [], itinerary: RunTrace['itinerary'] = []): RunTrace {
    const t = this.t;
    const f = this.frame;
    t.outcome = outcome;
    const last = t.rooms[t.rooms.length - 1];
    if (last && last.leave < 0) {
      last.leave = f;
      if (!last.how) last.how = 'end';
    }
    // A stretch still open at the end counts too.
    const gap = f - this.lastProgress;
    const w = this.wander;
    if (gap >= this.lostAfter && w) {
      t.lost.push({
        room: this.room,
        from: this.lastProgress,
        to: f,
        x0: w.x0,
        y0: w.y0,
        x1: w.x1,
        y1: w.y1,
      });
      t.lostFrames += gap;
    }
    const active = Math.max(1, t.input.activeFrames);
    t.speed.avgPxS = this.speedSum / active;
    t.speed.avgMovingPxS = this.movingFrames > 0 ? t.speed.avgMovingPxS / this.movingFrames : 0;
    t.speed.maxPxS = Math.round(t.speed.maxPxS);
    t.speed.avgPxS = Math.round(t.speed.avgPxS);
    t.speed.avgMovingPxS = Math.round(t.speed.avgMovingPxS);
    t.speed.distance = Math.round(t.speed.distance);
    t.notes.push(...notes);
    t.itinerary.push(...itinerary);
    return t;
  }
}
