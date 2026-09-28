/**
 * Feel metrics (movement-spec §3.4, §7.4, §7.5), measured by running the headless sim in small
 * generated lab rooms. Everything is behavioural (inputs in, trajectory out), so it works on any
 * controller that the sim adapter understands, and on any preset / tuning override.
 */
import { HeadlessSim, type SimSetup } from '../../src/debug/headless';
import { ASSISTS, type AssistSet, normEvent, registerTestRoom, tileSize } from '../../src/debug/sim-adapter';
import { hashState } from '../../src/sim/hash';
import { ActionBit } from '../../src/sim/input';

const R = ActionBit.right;
const L = ActionBit.left;
const J = ActionBit.jump;
const X = ActionBit.dash;
const FPS = 60;

// ---------------------------------------------------------------------------------------------
// Lab rooms (Phase 0 legend: '#' solid, '.' air, 'P' spawn). Registered on demand, id = content hash.

function lab(name: string, rows: string[]): string {
  return registerTestRoom(`lab-${name}-${hashState(rows).slice(0, 6)}`, rows);
}

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || x === w - 1 || y === 0 ? '#' : '.')),
  );
}

function fill(g: string[][], x0: number, y0: number, x1: number, y1: number, ch = '#'): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y]) (g[y] as string[])[x] = ch;
}

const rows = (g: string[][]) => g.map((r) => r.join(''));

/** 80×24 flat floor (top of row 21), 20 tiles of headroom, spawn at col 3. */
function flatRoom(): string {
  const g = grid(80, 24);
  fill(g, 0, 21, 79, 23);
  (g[20] as string[])[3] = 'P';
  return lab('flat', rows(g));
}

/** Ledge (top of row 13, cols 0-12) above a floor 8 tiles lower (top of row 21). */
function ledgeRoom(): string {
  const g = grid(60, 24);
  fill(g, 0, 13, 12, 23);
  fill(g, 13, 21, 59, 23);
  (g[12] as string[])[3] = 'P';
  return lab('ledge', rows(g));
}

/** Floor at row 16 with a `w`-tile pit starting at col 20 (3 tiles deep). */
function gapRoom(w: number): { id: string; far: number; floorY: number } {
  const g = grid(70, 20);
  fill(g, 0, 16, 69, 19);
  fill(g, 20, 16, 19 + w, 18, '.');
  (g[15] as string[])[3] = 'P';
  const ts = tileSize();
  return { id: lab(`gap${w}`, rows(g)), far: (20 + w) * ts, floorY: 16 * ts };
}

/** Floor at row 16 to col 17, a 2-tile pit, then a block `h` tiles high from col 20. */
function climbRoom(h: number): { id: string; topY: number; floorY: number } {
  const g = grid(50, 22);
  fill(g, 0, 16, 49, 21);
  fill(g, 18, 16, 19, 19, '.');
  fill(g, 20, 16 - h, 49, 15);
  (g[15] as string[])[3] = 'P';
  const ts = tileSize();
  return { id: lab(`climb${h}`, rows(g)), topY: (16 - h) * ts, floorY: 16 * ts };
}

/** Tall shaft: a ledge at the top (row 6, cols 0-6), floor 50 tiles below. */
function towerRoom(): string {
  const g = grid(30, 60);
  fill(g, 0, 6, 6, 59);
  fill(g, 0, 57, 29, 59);
  (g[5] as string[])[3] = 'P';
  return lab('tower', rows(g));
}

// ---------------------------------------------------------------------------------------------

export interface FeelOptions {
  preset?: string;
  tuning?: SimSetup['tuning'];
  assists?: AssistSet;
}

function newSim(o: FeelOptions, room: string, extra: Partial<SimSetup> = {}): HeadlessSim {
  const s: SimSetup = { room, seed: 1, abilities: {}, ...extra };
  if (o.preset) s.preset = o.preset;
  if (o.tuning) s.tuning = o.tuning;
  if (o.assists || extra.assists) s.assists = { ...o.assists, ...extra.assists };
  return new HeadlessSim(s);
}

/** Steps until grounded (max n). */
function settle(sim: HeadlessSim, n = 30): void {
  for (let i = 0; i < n && !sim.view.grounded; i++) sim.step(0);
  sim.step(0);
}

function hasEvent(evs: ReturnType<HeadlessSim['step']>, type: string): boolean {
  return evs.some((e) => normEvent(e).type === type);
}

export interface JumpShape {
  heightPx: number;
  apexFrames: number;
  airFrames: number;
  dwellFrames: number;
  /** Frames from apex back to the takeoff height. */
  fallFrames: number;
  /** Horizontal distance from takeoff to landing (px), when running. */
  distancePx: number;
}

/** Jump from standing (or running, `runIn` frames first), holding jump for `hold` frames. */
function measureJump(o: FeelOptions, hold: number, runIn = 0): JumpShape {
  const sim = newSim(o, flatRoom());
  settle(sim);
  const dir = runIn > 0 ? R : 0;
  for (let i = 0; i < runIn; i++) sim.step(dir);
  const y0 = sim.view.y;
  const x0 = sim.view.x;
  const ys: number[] = [];
  let apexStep = 0;
  let landStep = 0;
  let minY = y0;
  for (let i = 1; i <= 600; i++) {
    const evs = sim.step((i <= hold ? J : 0) | dir);
    const v = sim.view;
    ys.push(v.y);
    if (v.y < minY) {
      minY = v.y;
      apexStep = i;
    }
    if (i > 1 && (hasEvent(evs, 'land') || v.grounded)) {
      landStep = i;
      break;
    }
  }
  const h = y0 - minY;
  const dwell = ys.filter((y) => y <= minY + 0.1 * h).length;
  return {
    heightPx: h,
    apexFrames: apexStep,
    airFrames: landStep,
    dwellFrames: dwell,
    fallFrames: landStep - apexStep,
    distancePx: sim.view.x - x0,
  };
}

export interface RunShape {
  topSpeed: number;
  framesToFull: number;
  stopDistancePx: number;
  stopFrames: number;
  turnFrames: number;
}

function measureRun(o: FeelOptions): RunShape {
  const sim = newSim(o, flatRoom());
  settle(sim);
  const vx: number[] = [];
  for (let i = 0; i < 60; i++) {
    sim.step(R);
    vx.push(sim.view.vx);
  }
  const top = Math.max(...vx);
  const framesToFull = vx.findIndex((v) => v >= top * 0.99) + 1;
  const branch = sim.clone();
  const x0 = sim.view.x;
  let stopFrames = 0;
  for (let i = 1; i <= 120; i++) {
    sim.step(0);
    if (Math.abs(sim.view.vx) < 1e-9) {
      stopFrames = i;
      break;
    }
  }
  let turnFrames = 0;
  for (let i = 1; i <= 120; i++) {
    branch.step(L);
    if (branch.view.vx <= -top * 0.99) {
      turnFrames = i;
      break;
    }
  }
  return { topSpeed: top, framesToFull, stopDistancePx: sim.view.x - x0, stopFrames, turnFrames };
}

function measureMaxFall(o: FeelOptions): number {
  const sim = newSim(o, towerRoom());
  settle(sim);
  let max = 0;
  for (let i = 0; i < 400; i++) {
    sim.step(i < 30 ? R : 0);
    max = Math.max(max, sim.view.vy);
    if (i > 40 && sim.view.grounded) break;
  }
  return max;
}

export interface DashShape {
  supported: boolean;
  distancePx: number;
  frames: number;
  speed: number;
}

function measureDash(o: FeelOptions): DashShape {
  const sim = newSim(o, flatRoom(), { abilities: { dash: true } });
  settle(sim);
  const x0 = sim.view.x;
  let start = -1;
  let end = -1;
  let speed = 0;
  for (let i = 1; i <= 90; i++) {
    const evs = sim.step(i === 1 ? X : 0);
    if (hasEvent(evs, 'dashStart') && start < 0) start = i;
    if (sim.view.state === 'dash') speed = Math.max(speed, Math.abs(sim.view.vx));
    if (start > 0 && (hasEvent(evs, 'dashEnd') || (sim.view.state !== 'dash' && i > start + 1))) {
      end = i;
      break;
    }
  }
  if (start < 0) return { supported: false, distancePx: 0, frames: 0, speed: 0 };
  return { supported: true, distancePx: sim.view.x - x0, frames: end - start, speed };
}

/**
 * Coyote window: walk off the ledge; the largest k such that pressing jump k frames after the
 * last grounded frame still produces a jump.
 */
function measureCoyote(o: FeelOptions): number {
  const sim = newSim(o, ledgeRoom());
  settle(sim);
  let last: HeadlessSim | null = null;
  for (let i = 0; i < 300; i++) {
    const before = sim.clone();
    sim.step(R);
    if (!sim.view.grounded && before.view.grounded) {
      last = before; // state at the end of the last grounded frame
      break;
    }
  }
  if (!last) return 0;
  let best = 0;
  for (let k = 1; k <= 20; k++) {
    const b = last.clone();
    for (let i = 1; i < k; i++) b.step(R);
    if (hasEvent(b.step(R | J), 'jump')) best = k;
  }
  return best;
}

/**
 * Jump buffer, in frames, with the spec's meaning (§2.2: a press on frame p fires on F, the first
 * frame that starts grounded, iff F - p <= JUMP_BUFFER_FRAMES - 1): the number of press frames
 * p <= F whose press still fires the jump on F. Walks off the ledge and sweeps the press frame.
 */
function measureBuffer(o: FeelOptions): number {
  const sim = newSim(o, ledgeRoom());
  settle(sim);
  // Walk right off the ledge (holding right throughout) and find the landing step.
  const states: HeadlessSim[] = [];
  let airborne = false;
  let land = -1;
  for (let i = 0; i < 600; i++) {
    states.push(sim.clone());
    sim.step(R);
    if (!sim.view.grounded) airborne = true;
    else if (airborne) {
      land = i; // step i produced the first grounded state
      break;
    }
  }
  if (land < 0) return 0;
  let best = -1;
  for (let k = 0; k <= 20; k++) {
    const p = land - k;
    const start = states[p];
    if (!start) break;
    const b = start.clone();
    let fired = false;
    for (let i = p; i <= land + 1; i++) {
      if (hasEvent(b.step(R | J), 'jump')) {
        fired = i >= land; // a jump before landing is a coyote jump, not a buffered one
        break;
      }
    }
    if (fired) best = k;
  }
  // k = land - p for p = land .. land - best; plus the plain press on F = land + 1 itself.
  return best + 2;
}

export interface Window {
  /** Successful press frames. */
  successes: number;
  /** Earliest/latest successful press step (relative to run start). */
  first: number;
  last: number;
  tried: number;
}

/** Forgiveness sweep: run right, press jump on step s (held `hold` frames), for every s. */
function sweep(
  o: FeelOptions,
  room: string,
  steps: number,
  success: (sim: HeadlessSim) => boolean,
  fail: (sim: HeadlessSim) => boolean,
  extra: Partial<SimSetup>,
): Window {
  const base = newSim(o, room, extra);
  settle(base);
  const snaps: HeadlessSim[] = [];
  const probe = base.clone();
  for (let s = 0; s < steps; s++) {
    snaps.push(probe.clone());
    probe.step(R);
  }
  const w: Window = { successes: 0, first: -1, last: -1, tried: steps };
  for (let s = 0; s < steps; s++) {
    const b = (snaps[s] as HeadlessSim).clone();
    const hold = 30;
    let ok = false;
    for (let i = 0; i < 240; i++) {
      b.step(R | (i < hold ? J : 0));
      if (b.view.dead || fail(b)) break;
      if (success(b)) {
        ok = true;
        break;
      }
    }
    if (ok) {
      w.successes++;
      if (w.first < 0) w.first = s;
      w.last = s;
    }
  }
  return w;
}

const ALL_OFF: AssistSet = Object.fromEntries(ASSISTS.map((a) => [a, false]));

export interface ForgivenessResult {
  name: string;
  description: string;
  on: Window;
  off: Window;
}

function forgiveness(o: FeelOptions, flatJumpTiles: number, apexTiles: number): ForgivenessResult[] {
  const out: ForgivenessResult[] = [];
  const gapW = Math.max(1, Math.floor(flatJumpTiles) - 1);
  const gap = gapRoom(gapW);
  const gapOk = (s: HeadlessSim) => {
    const v = s.view;
    return v.grounded && v.x >= gap.far && v.y + v.h === gap.floorY;
  };
  const gapFail = (s: HeadlessSim) => s.view.y + s.view.h > gap.floorY;
  const steps = Math.ceil((20 * tileSize()) / 6) + 10;
  out.push({
    name: `gap-${gapW}`,
    description: `run-up jump across a ${gapW}-tile pit (max flat jump ${flatJumpTiles.toFixed(1)} tiles)`,
    on: sweep(o, gap.id, steps, gapOk, gapFail, {}),
    off: sweep(o, gap.id, steps, gapOk, gapFail, { assists: ALL_OFF }),
  });
  const h = Math.max(1, Math.floor(apexTiles));
  const climb = climbRoom(h);
  const climbOk = (s: HeadlessSim) => s.view.grounded && s.view.y + s.view.h === climb.topY;
  const climbFail = (s: HeadlessSim) => s.view.y + s.view.h > climb.floorY;
  out.push({
    name: `ledge-${h}`,
    description: `running jump over a 2-tile pit onto a ${h}-tile ledge (max jump ${apexTiles.toFixed(2)} tiles)`,
    on: sweep(o, climb.id, steps, climbOk, climbFail, {}),
    off: sweep(o, climb.id, steps, climbOk, climbFail, { assists: ALL_OFF }),
  });
  return out;
}

// ---------------------------------------------------------------------------------------------

export interface FeelMetrics {
  jumpHeightTiles: number;
  jumpHeightBodies: number;
  timeToApexS: number;
  airTimeS: number;
  tapFullRatio: number;
  apexDwellFrames: number;
  fallRiseGravityRatio: number;
  runTilesPerS: number;
  runFramesToFull: number;
  stopDistancePx: number;
  turnFrames: number;
  flatJumpDistanceOverHeight: number;
  dashTiles: number | null;
  dashS: number | null;
  dashOverRun: number | null;
  maxFallTilesPerS: number;
  coyoteMs: number;
  bufferMs: number;
}

export interface FeelReport {
  metrics: FeelMetrics;
  raw: {
    fullJump: JumpShape;
    tapJump: JumpShape;
    runningJump: JumpShape;
    run: RunShape;
    dash: DashShape;
    maxFallPxPerFrame: number;
    coyoteFrames: number;
    bufferFrames: number;
    playerHeightPx: number;
  };
  forgiveness: ForgivenessResult[];
}

export function measureFeel(o: FeelOptions = {}): FeelReport {
  const ts = tileSize();
  const probe = newSim(o, flatRoom());
  const bodyH = probe.view.h;
  const full = measureJump(o, 60);
  const tap = measureJump(o, 1);
  const run = measureRun(o);
  const running = measureJump(o, 60, 40);
  const dash = measureDash(o);
  const maxFall = measureMaxFall(o);
  const coyote = measureCoyote(o);
  const buffer = measureBuffer(o);
  const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  const rise = full.apexFrames;
  const fall = full.fallFrames;
  const metrics: FeelMetrics = {
    jumpHeightTiles: round(full.heightPx / ts),
    jumpHeightBodies: round(full.heightPx / bodyH),
    timeToApexS: round(full.apexFrames / FPS),
    airTimeS: round(full.airFrames / FPS),
    tapFullRatio: round(tap.heightPx / full.heightPx),
    apexDwellFrames: full.dwellFrames,
    fallRiseGravityRatio: round((rise / Math.max(1, fall)) ** 2),
    runTilesPerS: round((run.topSpeed * FPS) / ts),
    runFramesToFull: run.framesToFull,
    stopDistancePx: round(run.stopDistancePx, 1),
    turnFrames: run.turnFrames,
    flatJumpDistanceOverHeight: round(running.distancePx / Math.max(1, running.heightPx)),
    dashTiles: dash.supported ? round(dash.distancePx / ts) : null,
    dashS: dash.supported ? round(dash.frames / FPS) : null,
    dashOverRun: dash.supported ? round(dash.speed / Math.max(1e-9, run.topSpeed)) : null,
    maxFallTilesPerS: round((maxFall * FPS) / ts),
    coyoteMs: Math.round((coyote * 1000) / FPS),
    bufferMs: Math.round((buffer * 1000) / FPS),
  };
  return {
    metrics,
    raw: {
      fullJump: full,
      tapJump: tap,
      runningJump: running,
      run,
      dash,
      maxFallPxPerFrame: round(maxFall, 3),
      coyoteFrames: coyote,
      bufferFrames: buffer,
      playerHeightPx: bodyH,
    },
    forgiveness: forgiveness(o, running.distancePx / ts, full.heightPx / ts),
  };
}
