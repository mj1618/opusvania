/**
 * A persona run in the sim, no browser: the `Game` harness (src/game.ts) stepped one frame at a time
 * with the persona's input, the follow camera stepped beside it (src/render/camera, pure) so the
 * persona sees what the screen would show. Deterministic: the same room, seed, kit and persona give
 * the same run, and its input tape replays in the page (`--clip`).
 */
import { Game } from '../../src/game';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
import { getRoom } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { observe, viewRect } from './observe';
import { makePersona, type Persona } from './personas';
import { Recorder, type RunTrace } from './recorder';

export interface RunOpts {
  /** A room id, or a room itself (tests build their own). */
  room: string | Room;
  persona: string;
  /** The sim's seed (the page's `?seed`, default 1). */
  seed?: number;
  /** The persona's own dice. */
  personaSeed?: number;
  /** What she owns instead of the room's kit (`?abilities=`), null = the room's. */
  abilities?: string[] | null;
  /** Sim seconds before the run is stopped (default 300). */
  seconds?: number;
  /** Give up when lost (no progress) this many seconds (default 120: STUDIO.md's limit). */
  giveUp?: number;
  /** `exit`: stop at the first room exit (default); `none`: run to the time limit. */
  until?: 'exit' | 'none';
  lostAfter?: number;
  /** The room a speedrunner heads for (default: the placed room furthest from the start). */
  goal?: string;
  /** Start here (feet, room px) instead of the spawn: a teleport, so the hatching is skipped. */
  at?: { x: number; y: number };
  /** A chunk of a region: the run is through once she leaves this room by a way other than the one she came in by. */
  upto?: string;
  /** The chunk's rooms: through once she has been in every one (and out of `upto`, if given). */
  chunk?: string[];
}

export interface HeadlessResult {
  trace: RunTrace;
  /** One input mask per sim step, from frame 0 (replay with `formatInputScript`). */
  tape: number[];
  hash: string;
  persona: Persona;
}

export function runHeadless(opts: RunOpts): HeadlessResult {
  const room = typeof opts.room === 'string' ? getRoom(opts.room) : opts.room;
  const tuning = cloneTuning(defaultTuning);
  // The game's world (memory/world.md): an exit leads into the next room. A room built by a test (not
  // the registry's) plays alone: its exits restart it.
  const world = typeof opts.room === 'string' ? GAME_WORLD : null;
  const game = new Game(tuning, room, opts.seed ?? 1, () => 0, opts.abilities ?? null, { world });
  game.mode = 'manual';
  if (opts.at) game.teleport(opts.at.x, opts.at.y);
  let events: readonly SimEvent[] = [];
  game.afterStep.add((ev) => {
    events = ev;
  });
  const persona = makePersona(
    opts.persona,
    opts.personaSeed ?? 1,
    world
      ? { world, ...(opts.goal ? { goal: opts.goal } : {}), ...(opts.chunk ? { goals: opts.chunk } : {}) }
      : {},
  );
  const rec = new Recorder(opts.persona, room.id, opts.seed ?? 1, 'headless', {
    lostAfter: (opts.lostAfter ?? 10) * 60,
    regionOf: (id) => {
      if (id === room.id) return room.region;
      try {
        return getRoom(id).region;
      } catch {
        return undefined;
      }
    },
  });
  let scene = game.scene;
  let ct = cameraFor(scene);
  let cam = createCamera(game.state, scene, ct);
  const maxFrames = Math.round((opts.seconds ?? 300) * 60);
  const giveUp = Math.round((opts.giveUp ?? 120) * 60);
  const tape: number[] = [];
  let outcome = 'timeout';
  let uptoArrival = '';
  let uptoDone = false;
  const been = new Set<string>();
  for (let i = 0; i < maxFrames; i++) {
    const view = viewRect(lerpCamera(cam, cam, 1));
    const mask = persona.decide(observe(game.state, scene, view), scene, {
      state: game.state,
      tuning,
      ...(world ? { world } : {}),
    });
    tape.push(mask);
    game.queueInput([mask]);
    game.stepOnce();
    // A room exit may change the scene (multi-room engine): read it back every step.
    if (game.scene !== scene) {
      scene = game.scene;
      ct = cameraFor(scene);
    }
    if (events.some((e) => e.type === 'spawn')) cam = createCamera(game.state, scene, ct);
    else stepCamera(cam, game.state, scene, ct);
    rec.record(game.state, mask, events, viewRect(lerpCamera(cam, cam, 1)), scene);
    for (const e of events)
      if (e.type === 'roomEnter' && e.room === opts.upto && world) {
        const link = world.links[e.from];
        uptoArrival = link?.exit ?? '';
      }
    const out = events.find((e) => e.type === 'roomExit');
    if (opts.upto && out?.type === 'roomExit' && game.state.room === opts.upto && out.id !== uptoArrival)
      uptoDone = true;
    been.add(game.state.room);
    const covered = !opts.chunk || opts.chunk.every((r) => been.has(r));
    if ((uptoDone || !opts.upto) && (opts.upto || opts.chunk) && covered) {
      outcome = 'through';
      break;
    }
    if ((opts.until ?? 'exit') === 'exit' && events.some((e) => e.type === 'roomExit')) {
      outcome = 'exit';
      break;
    }
    if (rec.sinceProgress() > giveUp) {
      outcome = 'lost';
      break;
    }
    if (persona.finished) {
      outcome = 'done';
      break;
    }
  }
  return { trace: rec.finish(outcome, persona.notes, persona.itinerary), tape, hash: game.hash(), persona };
}
