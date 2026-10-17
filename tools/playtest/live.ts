/**
 * A persona playing in the page with real keys: one in-page loop, once per animation frame, reads
 * `__game.state()` and the camera, lets the persona decide, and dispatches real `KeyboardEvent`s on
 * `window` for every button that changed (memory/debug-api.md: playwright-cli is ~1 s a call, so a
 * live bot has to live in the page). The game runs in realtime, so this goes through the real input
 * path (keyboard source, loop, sampler) that a person uses.
 *
 * Loaded from the dev server (Vite serves any project file): cli.ts `--live` does it, or by hand
 * with playwright-cli:
 *   eval "(async () => (await import('/tools/playtest/live.ts')).play({persona: 'explorer'}))()"
 * `record()` instead records a person's (or an agent's) own play until `stop()`.
 */
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { observe, viewRect } from './observe';
import { makePersona } from './personas';
import { Recorder, type RunTrace } from './recorder';

/** The key pressed for each action (the first default binding, src/input/bindings.ts). */
const KEYS: Array<[number, string, string]> = [
  [ActionBit.left, 'ArrowLeft', 'ArrowLeft'],
  [ActionBit.right, 'ArrowRight', 'ArrowRight'],
  [ActionBit.up, 'ArrowUp', 'ArrowUp'],
  [ActionBit.down, 'ArrowDown', 'ArrowDown'],
  [ActionBit.jump, 'KeyZ', 'z'],
  [ActionBit.dash, 'KeyX', 'x'],
  [ActionBit.attack, 'KeyC', 'c'],
  [ActionBit.offer, 'KeyV', 'v'],
];

function press(mask: number, prev: number): void {
  for (const [bit, code, key] of KEYS) {
    const now = (mask & bit) !== 0;
    const was = (prev & bit) !== 0;
    if (now !== was)
      window.dispatchEvent(new KeyboardEvent(now ? 'keydown' : 'keyup', { code, key, bubbles: true }));
  }
}

export interface LiveOpts {
  persona: string;
  personaSeed?: number;
  /** Seconds of play before it stops (default 300). */
  seconds?: number;
  /** Give up after this many seconds without progress (default 120). */
  giveUp?: number;
  until?: 'exit' | 'none';
  lostAfter?: number;
}

export interface LiveResult {
  trace: RunTrace;
  /** The buttons held per sim step, as far as a per-frame loop can tell (a tap may span a step). */
  tape: number[];
  /** Animation frames seen and sim steps taken (more than one step a frame when the page is slow). */
  rafs: number;
  steps: number;
}

function regionOf(scene: Scene): (room: string) => string | undefined {
  return (room) => (room === scene.id ? (scene as { region?: string }).region : undefined);
}

/** Plays one run from a fresh `load()` and resolves with its trace. */
export function play(opts: LiveOpts): Promise<LiveResult> {
  const g = window.__game;
  g.load();
  let scene = g.scene() as unknown as Scene;
  const persona = makePersona(opts.persona, opts.personaSeed ?? 1);
  const rec = new Recorder(opts.persona, scene.id, 1, 'live', {
    lostAfter: (opts.lostAfter ?? 10) * 60,
    regionOf: regionOf(scene),
  });
  const maxFrames = Math.round((opts.seconds ?? 300) * 60);
  const giveUp = Math.round((opts.giveUp ?? 120) * 60);
  const tape: number[] = [];
  let held = 0;
  let lastF = g.state().frame;
  let rafs = 0;
  g.resume();
  return new Promise((resolve) => {
    const end = (outcome: string): void => {
      press(0, held);
      held = 0;
      g.pause();
      resolve({
        trace: rec.finish(outcome, persona.notes, persona.itinerary),
        tape,
        rafs,
        steps: tape.length,
      });
    };
    const tick = (): void => {
      rafs++;
      const st = g.state();
      const f = st.frame;
      if (st.room !== scene.id) scene = g.scene() as unknown as Scene;
      const view = viewRect(g.cam().follow);
      if (f > lastF) {
        const ev = g.events(f - lastF) as unknown as SimEvent[];
        for (let i = lastF; i < f; i++) tape.push(held);
        rec.record(st, held, ev, view, scene, f - lastF);
        lastF = f;
        const why =
          (opts.until ?? 'exit') === 'exit' && ev.some((e) => e.type === 'roomExit')
            ? 'exit'
            : f >= maxFrames
              ? 'timeout'
              : rec.sinceProgress() > giveUp
                ? 'lost'
                : persona.finished
                  ? 'done'
                  : '';
        if (why) {
          end(why);
          return;
        }
      }
      const mask = persona.decide(observe(st, scene, view), scene);
      press(mask, held);
      held = mask;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let recording: { rec: Recorder; stop: boolean; done: Promise<RunTrace> } | null = null;

/**
 * Records telemetry of whoever is playing (real keys from a person, or an agent pressing keys with
 * playwright-cli) until `stop()`. Does not touch the input or the time mode (resume() if paused).
 */
export function record(name = 'human', lostAfter = 10): void {
  const g = window.__game;
  let scene = g.scene() as unknown as Scene;
  const rec = new Recorder(name, scene.id, 1, 'recorded', {
    lostAfter: lostAfter * 60,
    regionOf: regionOf(scene),
  });
  let lastF = g.state().frame;
  const state = { rec, stop: false, done: Promise.resolve(rec.t) };
  state.done = new Promise<RunTrace>((resolve) => {
    const tick = (): void => {
      const st = g.state();
      const f = st.frame;
      if (st.room !== scene.id) scene = g.scene() as unknown as Scene;
      if (f > lastF) {
        rec.record(
          st,
          st.prevInput,
          g.events(f - lastF) as unknown as SimEvent[],
          viewRect(g.cam().follow),
          scene,
          f - lastF,
        );
        lastF = f;
      } else if (f < lastF) lastF = f; // a load() restarted the frame count
      if (state.stop) {
        resolve(rec.finish('stopped'));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recording = state;
}

/** Ends `record()` and returns the trace (feed it to `npm run playtest -- --from <file.json>`). */
export async function stop(): Promise<RunTrace | null> {
  if (!recording) return null;
  recording.stop = true;
  const t = await recording.done;
  recording = null;
  return t;
}
