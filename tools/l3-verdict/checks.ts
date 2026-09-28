/**
 * Measurements for the L3 verdict (docs/design/seize-levy-experiment.md §6.3). Each function
 * returns measured values; cli.ts turns them into PASS/FAIL rows and the decision (§6.4).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HeadlessSim } from '../../src/debug/headless';
import { tuningHash } from '../../src/debug/sim-adapter';
import { runTape, type TapeFile, trimTape } from '../../src/debug/tape';
import { parseInputScript } from '../../src/input/script';
import { enemyDef, enemyTypes } from '../../src/sim/ai/schema';
import type { SimEvent } from '../../src/sim/events';
import { createState, step } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { buildRoom, type RoomFile, registerRoom } from '../../src/sim/world/rooms';

export const ROOT = resolve(import.meta.dirname, '../..');
export const REPLAYS = join(ROOT, 'tests/replays');

export function loadTape(file: string): TapeFile {
  return JSON.parse(readFileSync(join(REPLAYS, file), 'utf8')) as TapeFile;
}

/** Steps a tape and returns per-step events, states-before-step hitstop flags and views. */
export interface Played {
  events: SimEvent[][];
  /** hitstop > 0 BEFORE the step (the step was a frozen one). */
  frozen: boolean[];
  grounded: boolean[];
  vx: number[];
  cx: number[];
  cy: number[];
  hashes: string[];
  reachedAt?: number;
}

export function play(t: TapeFile): Played {
  const sim = new HeadlessSim({
    ...(t.room ? { room: t.room } : {}),
    ...(t.seed !== undefined ? { seed: t.seed } : {}),
    ...(t.preset ? { preset: t.preset } : {}),
  });
  const out: Played = { events: [], frozen: [], grounded: [], vx: [], cx: [], cy: [], hashes: [] };
  const run = runTape(t);
  let i = 0;
  for (const m of parseInputScript(t.inputs)) {
    out.frozen.push(sim.state.hitstop > 0);
    out.events.push(sim.step(m));
    const p = sim.state.player;
    out.grounded.push(p.grounded);
    out.vx.push(p.vx);
    out.cx.push(p.x + p.w / 2);
    out.cy.push(p.y + p.h / 2);
    i++;
    if (i % 60 === 0) out.hashes.push(sim.hash());
    if (run.reachedAt !== undefined && i >= run.reachedAt) break;
  }
  if (run.reachedAt !== undefined) out.reachedAt = run.reachedAt;
  return out;
}

// ------------------------------------------------------------------------------------------
// Lab rooms (A1-A3, A5), the same construction as tests/unit/signature/lab.ts.

let labN = 0;
function lab(paint: [number, number, string][]): string {
  const rows = Array.from({ length: 17 }, (_, y) =>
    y === 0 || y >= 15 ? '#'.repeat(30) : `#${'.'.repeat(28)}#`,
  ).map((r) => r.split(''));
  for (const [y, x, text] of paint)
    for (let i = 0; i < text.length; i++) (rows[y] as string[])[x + i] = text[i] as string;
  const id = `verdict-lab-${labN++}`;
  registerRoom(
    buildRoom({
      id,
      rows: rows.map((r) => r.join('')),
      abilities: { wallJump: false, dash: false, doubleJump: false, pogo: false, seize: true, levy: true },
      sources: { H: { sound: 'partition', colour: 'pink' }, F: { sound: 'furnace', colour: 'brown' } },
    } as RoomFile),
  );
  return id;
}

function runLab(
  room: string,
  script: string,
): { states: GameState[]; events: SimEvent[][]; frozen: boolean[] } {
  const t = cloneTuning(defaultTuning);
  const s = createState({ seed: 1, roomId: room }, t);
  const states: GameState[] = [];
  const events: SimEvent[][] = [];
  const frozen: boolean[] = [];
  for (const m of parseInputScript(script)) {
    frozen.push(s.hitstop > 0);
    const ev: SimEvent[] = [];
    step(s, m, t, ev);
    events.push(ev);
    states.push(JSON.parse(JSON.stringify(s)) as GameState);
  }
  return { states, events, frozen };
}

const first = (evs: SimEvent[][], type: string): number =>
  evs.findIndex((e) => e.some((x) => x.type === type)) + 1;

function moveFrames(r: ReturnType<typeof runLab>, from = 0): number {
  let n = 0;
  for (let i = from; i < r.states.length; i++) if (r.states[i]?.player.move && !r.frozen[i]) n++;
  return n;
}

export function checkA1A2A3() {
  const wall = lab([
    [14, 2, 'P'],
    [11, 3, 'H'],
    [12, 3, 'H'],
    [13, 3, 'H'],
    [14, 3, 'H'],
  ]);
  const empty = lab([[14, 2, 'P']]);
  const take = runLab(wall, 'S1 .30');
  const whiff = runLab(empty, 'S1 .30');
  const lv = runLab(wall, 'S1 .30 V1 .20');
  const levyFrom = 31;
  // Horizontal input ignored during a move: compare a run with a whiffing seize to a plain run.
  const withMove = runLab(empty, 'R20 R+S1 R20').states.map((s) => s.player.x);
  const plain = runLab(empty, 'R41').states.map((s) => s.player.x);
  const ignored = withMove.filter((x, i) => x !== plain[i]).length;
  // A3: aerial seize / levy / down-levy at full air speed.
  const momentum: Record<string, number> = {};
  for (const verb of ['S', 'V', 'D+V']) {
    const r = runLab(wall, `S1 .20 R20 R+J6 R2 R+${verb}1 R9`);
    const at = 20 + 1 + 20 + 6 + 2; // step index of the press (0-based = 49th step)
    const vx0 = r.states[at - 1]?.player.vx ?? 0;
    const vx1 = r.states[at + 9]?.player.vx ?? 0;
    momentum[verb] = Math.abs(vx0) > 0 ? Math.abs(vx1) / Math.abs(vx0) : 0;
  }
  return {
    A1: { moveStartFrame: first(take.events, 'moveStart'), seizeTakeFrame: first(take.events, 'seizeTake') },
    A2: {
      seizeTake: moveFrames(take),
      seizeWhiff: moveFrames(whiff),
      levy: moveFrames(lv, levyFrom),
      horizontalIgnoredFrames: ignored,
    },
    A3: momentum,
  };
}

/** A5: jump height and apex frame per weight class, measured in a lab room (apexHang on). */
export function checkA5() {
  const room = lab([[14, 2, 'P']]);
  const out: Record<string, { heightPx: number; apexFrame: number; runSpeed: number }> = {};
  for (const prof of ['feather', 'middle', 'heavy']) {
    const t = cloneTuning(defaultTuning);
    const s = createState({ seed: 1, roomId: room }, t);
    s.player.profile = prof;
    s.player.abilities.seize = false; // keep the profile (weight is derived only while carrying the bag)
    const y0 = s.player.y;
    let minY = y0;
    let apex = 0;
    const jump = parseInputScript('J60');
    for (let i = 0; i < jump.length; i++) {
      step(s, jump[i] as number, t, []);
      if (s.player.y < minY) {
        minY = s.player.y;
        apex = i + 1;
      }
    }
    const s2 = createState({ seed: 1, roomId: room }, t);
    s2.player.profile = prof;
    s2.player.abilities.seize = false;
    for (const m of parseInputScript('R30')) step(s2, m, t, []);
    out[prof] = { heightPx: y0 - minY, apexFrame: apex, runSpeed: s2.player.vx };
  }
  return out;
}

/** A4 over a list of per-step event arrays: feedback events carry a same-step hitstop >= class. */
export function a4Scan(steps: SimEvent[][]): { checked: number; bad: string[] } {
  const t = defaultTuning.combat;
  const need = (e: SimEvent): number => {
    if (e.type === 'seizeTake') return t.hitstopSeizeTake;
    if (e.type === 'catch') return t.hitstopCatch;
    if (e.type === 'repossess') return t.hitstopRepossess;
    if (e.type === 'hurt') return t.hitstopHurt;
    if (e.type === 'counterHit') return t.hitstopCounter;
    if (e.type === 'hit')
      return e.cls === 'counter'
        ? t.hitstopCounter
        : e.cls === 'heavy'
          ? t.hitstopHeavy
          : e.cls === 'medium'
            ? t.hitstopMedium
            : t.hitstopLight;
    return -1;
  };
  let checked = 0;
  const bad: string[] = [];
  steps.forEach((evs, i) => {
    const hs = evs.find((e) => e.type === 'hitstop') as Extract<SimEvent, { type: 'hitstop' }> | undefined;
    for (const e of evs) {
      const n = need(e);
      if (n < 0) continue;
      checked++;
      const pos = 'x' in e && 'y' in e && Number.isFinite(e.x) && Number.isFinite(e.y);
      const colour = e.type !== 'seizeTake' || typeof e.colour === 'string';
      if (!hs || hs.frames < n || !pos || !colour)
        bad.push(`step ${i + 1}: ${e.type} (hitstop ${hs?.frames ?? 0} < ${n})`);
    }
  });
  return { checked, bad };
}

/** B2/B3 from a played expert tape. */
export function stillness(p: Played) {
  let still = 0;
  let total = 0;
  let run = 0;
  let longestBeforeVerb = 0;
  let verbs = 0;
  const n = p.reachedAt ?? p.events.length;
  for (let i = 0; i < n; i++) {
    const isVerb = (p.events[i] ?? []).some(
      (e) => e.type === 'moveStart' && (e.move === 'seize' || e.move === 'levy'),
    );
    if (isVerb) {
      verbs++;
      longestBeforeVerb = Math.max(longestBeforeVerb, run);
      run = 0;
    }
    if (p.frozen[i]) continue;
    total++;
    const s = (p.grounded[i] ?? false) && Math.abs(p.vx[i] ?? 0) < 0.5;
    if (s) {
      still++;
      run++;
    } else run = 0;
  }
  return { still, total, share: total ? still / total : 0, verbs, longestPauseBeforeVerb: longestBeforeVerb };
}

/** Centre-path polyline length up to the target. */
export function pathLength(p: Played): number {
  let len = 0;
  const n = p.reachedAt ?? p.cx.length;
  for (let i = 1; i < n; i++) {
    const dx = (p.cx[i] ?? 0) - (p.cx[i - 1] ?? 0);
    const dy = (p.cy[i] ?? 0) - (p.cy[i - 1] ?? 0);
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/** D1 over one fight's event steps: after a Bark/Growl take, its attack is never active until the voice is back. */
export function d1Scan(steps: SimEvent[][]): { takes: number; bad: string[]; retrieveLags: number[] } {
  const away = new Map<number, number>(); // enemy id -> step the voice left
  const bad: string[] = [];
  const retrieveLags: number[] = [];
  let takes = 0;
  const takeStep = new Map<number, number>();
  steps.forEach((evs, i) => {
    for (const e of evs) {
      if (e.type === 'retrieve') {
        takes++;
        away.set(e.enemy, i);
        const t0 = takeStep.get(e.soundId);
        if (t0 !== undefined) retrieveLags.push(i - t0);
      } else if (e.type === 'seizeTake' && e.kind === 'voice') takeStep.set(e.soundId, i);
      else if (e.type === 'absorb' || e.type === 'snatch' || e.type === 'revoice' || e.type === 'repossess')
        away.delete(e.enemy);
      else if (e.type === 'attackActive' && away.has(e.enemy) && e.attackId !== 'snatch')
        bad.push(`step ${i + 1}: enemy ${e.enemy} ${e.attackId} active while its voice is away`);
    }
  });
  return { takes, bad, retrieveLags };
}

/** D3/T4: every attackActive comes >= 15 non-hitstop steps after its telegraph. */
export function d3Scan(
  steps: SimEvent[][],
  frozen: boolean[],
): { attacks: number; bad: string[]; minGap: number } {
  const tele = new Map<number, number>();
  const bad: string[] = [];
  let attacks = 0;
  let minGap = Infinity;
  const cum: number[] = [];
  let c = 0;
  for (let i = 0; i < steps.length; i++) {
    if (!frozen[i]) c++;
    cum.push(c);
  }
  steps.forEach((evs, i) => {
    for (const e of evs) {
      if (e.type === 'telegraph') tele.set(e.enemy, i);
      else if (e.type === 'attackActive') {
        attacks++;
        const t0 = tele.get(e.enemy);
        const g = t0 === undefined ? -1 : (cum[i] ?? 0) - (cum[t0] ?? 0);
        minGap = Math.min(minGap, g);
        if (g < 15)
          bad.push(`step ${i + 1}: enemy ${e.enemy} ${e.attackId} active ${g} steps after its telegraph`);
      }
    }
  });
  return { attacks, bad, minGap: Number.isFinite(minGap) ? minGap : 0 };
}

export function telegraphData(): { min: number; list: string[] } {
  let min = Infinity;
  const list: string[] = [];
  for (const type of enemyTypes()) {
    for (const [id, a] of Object.entries(enemyDef(type).attacks)) {
      min = Math.min(min, a.telegraph);
      list.push(`${type}.${id}=${a.telegraph}`);
    }
  }
  return { min, list };
}

/** Integrity: the tape carries no tuning overrides and its golden tuning hash matches. */
export function tapeIntegrity(t: TapeFile): {
  overrides: boolean;
  tuningMatches: boolean;
  trimStable: boolean;
  frames: number;
} {
  const sim = new HeadlessSim({ ...(t.room ? { room: t.room } : {}) });
  const cur = tuningHash(sim.tuning);
  const r = trimTape(t);
  return {
    overrides: t.tuning !== undefined && Object.keys(t.tuning).length > 0,
    tuningMatches: t.golden?.tuningHash === cur,
    trimStable: r.after === r.before,
    frames: r.before,
  };
}

/** F1: re-run a tape 3x; the 60-frame hash sequences must be identical. */
export function determinism(t: TapeFile): boolean {
  const a = runTape(t).hashes.join(',');
  return runTape(t).hashes.join(',') === a && runTape(t).hashes.join(',') === a;
}
