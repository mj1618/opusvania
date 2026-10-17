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
import { makePersona } from './personas';
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
}

export interface HeadlessResult {
  trace: RunTrace;
  /** One input mask per sim step, from frame 0 (replay with `formatInputScript`). */
  tape: number[];
  hash: string;
}

export function runHeadless(opts: RunOpts): HeadlessResult {
  const room = typeof opts.room === 'string' ? getRoom(opts.room) : opts.room;
  const tuning = cloneTuning(defaultTuning);
  // The game's world (memory/world.md): an exit leads into the next room. A room built by a test (not
  // the registry's) plays alone: its exits restart it.
  const world = typeof opts.room === 'string' ? GAME_WORLD : null;
  const game = new Game(tuning, room, opts.seed ?? 1, () => 0, opts.abilities ?? null, { world });
  game.mode = 'manual';
  let events: readonly SimEvent[] = [];
  game.afterStep.add((ev) => {
    events = ev;
  });
  const persona = makePersona(opts.persona, opts.personaSeed ?? 1);
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
  for (let i = 0; i < maxFrames; i++) {
    const view = viewRect(lerpCamera(cam, cam, 1));
    const mask = persona.decide(observe(game.state, scene, view), scene);
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
  return { trace: rec.finish(outcome, persona.notes, persona.itinerary), tape, hash: game.hash() };
}
