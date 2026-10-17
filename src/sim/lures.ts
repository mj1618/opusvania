/**
 * Lures: the story's false lamps (docs/design/core.md §3, memory/lures.md). Named `lure` in code
 * while the test grove's old wayside `lamps` (src/sim/goal.ts) still exist; they are unrelated.
 *
 *  - **Pull.** Inside a lure's `radius` she is accelerated toward the flame, harder the closer she is
 *    (edge -> core, with the square of how far in), plus a sideways **swirl** so she spirals in. In
 *    the air the vertical part goes into `vy` and the horizontal part into its own momentum
 *    `player.pullX` (added in the move, kept `pullXKeep` per frame), so her steering never eats it and
 *    a pass through a field bends and throws her. On the ground only a weak sideways drag acts.
 *  - **Caught.** Reaching the core she circles the flame (a tangent step, then back onto the circle
 *    with a sqrt: no trig), moving through moveX / moveY so walls still stop her. Her moves are
 *    replaced by beating free: each press of jump (or the blade) pushes her circle out; `beats`
 *    presses throw her along the held direction (the radius she is at when none is held), with a grace
 *    from that lure and from every core the throw passes through. A dash (owned)
 *    frees her at once; a blow frees her. A gentle lure does no damage. A core catches her only when she
 *    moves into it, or stays in it `catchFrames` (gravity she rides, not glue: feel review problem 9).
 *  - **Snuff.** The flame is a slash target like a pod: one hit per slash, hitstop, the down cut is a
 *    pogo. At 0 hp it is out for good: no pull, no catch; its moths are freed (`lureSnuff`).
 *
 * Pure: only + - * / sqrt, min, max, abs, floor, round (memory/sim-architecture.md).
 */
import { bossOwnsLure } from './boss/data';
import type { LureFreeHow, SimEvent, SlashDir } from './events';
import { swingOffset } from './paths';
import type { Box } from './player/attack';
import type { Lure, LureKind, Scene } from './scene';
import type { GameState, LuresState, PlayerState } from './state';
import type { Tuning } from './tuning';

export type LureRow = Tuning['lures']['kinds'][LureKind];

/** The numbers of a lure's kind. */
export function lureRow(t: Tuning, kind: LureKind): LureRow {
  return t.lures.kinds[kind];
}

/**
 * The numbers lure `i` (`l`) pulls by now: its kind's, or the row a boss has switched it to
 * (`state.lures.live.row`, memory/bosses.md: a great lamp's heart reaches further in the last phase).
 */
export function lureRowNow(lures: LuresState, i: number, l: Lure, t: Tuning): LureRow {
  const r = lures.live?.row[i];
  return r ? t.lures.kinds[r as LureKind] : t.lures.kinds[l.kind];
}

/**
 * Where lure `i`'s flame is on `frame` (into `out`): `lureAt`, moved by what a boss has done to it
 * (`state.lures.live.dx, dy`: the heart lowered). Every lure rule uses this.
 */
export function flameAt(
  lures: LuresState,
  i: number,
  l: Lure,
  frame: number,
  t: Tuning,
  out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  lureAt(l, frame, t, out);
  const live = lures.live;
  if (live) {
    out.x += live.dx[i] ?? 0;
    out.y += live.dy[i] ?? 0;
  }
  return out;
}

const SWING = { dx: 0, dy: 0 };

/**
 * Where lure `l`'s flame is on `frame` (written into `out`): its `x`, `y`, or for a swinging one
 * (`l.swing`) the point of its arc then (src/sim/paths.ts). Everything a lure does (pull, core,
 * orbit, the flame's box) happens there. The sim asks for `state.frame` (before the step's count);
 * render passes its interpolated frame (`frame - 2 + alpha`: the latest step used `frame - 1`).
 */
export function lureAt(
  l: Lure,
  frame: number,
  t: Tuning,
  out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  if (!l.swing) {
    out.x = l.x;
    out.y = l.y;
    return out;
  }
  swingOffset(l.swing, frame, t.lures.swing, SWING);
  out.x = l.x + SWING.dx;
  out.y = l.y - SWING.dy;
  return out;
}

/** Scratch flame positions (no allocation in the step). */
const F = { x: 0, y: 0 };

/** Cuts it takes to put out. */
export function lureHpMax(l: Lure, t: Tuning): number {
  return Math.max(1, Math.round(lureRow(t, l.kind).hp));
}

/**
 * The room's lures as she finds them: burning, except those the save says she put out (`save.snuffed`
 * holds `room:id`; memory/save.md): they start out (hp 0, `out` 1) and stay out for good.
 */
export function createLures(scene: Scene, t: Tuning, snuffed: readonly string[] = []): LuresState {
  const list = scene.lures ?? [];
  const isOut = list.map((l) => snuffed.includes(`${scene.id}:${l.id}`));
  return {
    hp: list.map((l, i) => (isOut[i] ? 0 : lureHpMax(l, t))),
    hitBy: list.map(() => 0),
    out: isOut.map((o) => (o ? 1 : 0)),
    snuffed: isOut.filter((o) => o).length,
    freed: 0,
    grace: list.map(() => 0),
  };
}

/** Is lure `i` burning and allowed to act on her (not the one she just broke free of)? */
function acts(state: GameState, i: number): boolean {
  if ((state.lures.hp[i] ?? 0) <= 0 || (state.lures.grace[i] ?? 0) > 0) return false;
  const p = state.player;
  return !(p.lureGrace === i && p.lureGraceFrames > 0);
}

/** Her body centre, sub-pixel exact. */
function centreX(p: PlayerState): number {
  return p.x + p.rx + p.w / 2;
}
function centreY(p: PlayerState): number {
  return p.y + p.ry + p.h / 2;
}

/** Scratch for `lurePull` (no allocation in the step). */
const PULL = { ax: 0, ay: 0 };

/**
 * The summed pull of every burning lure on her body centre, px/f² (`PULL.ax`, `PULL.ay`). Inside a
 * field: `pullEdge + (pullCore - pullEdge) f(k)`, k = 0 at the edge .. 1 at the core, f between k
 * (`curve` 0) and k² (`curve` 1), toward the flame,
 * plus `swirl` of it along the tangent (spin 1 = clockwise on screen).
 */
export function lurePull(state: GameState, scene: Scene, t: Tuning): { ax: number; ay: number } {
  PULL.ax = 0;
  PULL.ay = 0;
  const list = scene.lures;
  if (!list) return PULL;
  const p = state.player;
  const cx = centreX(p);
  const cy = centreY(p);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || !acts(state, i)) continue;
    const K = lureRowNow(state.lures, i, l, t);
    const f = flameAt(state.lures, i, l, state.frame, t, F);
    const rx = f.x - cx;
    const ry = f.y - cy;
    const d2 = rx * rx + ry * ry;
    if (d2 >= K.radius * K.radius || d2 === 0) continue;
    const d = Math.sqrt(d2);
    let k = Math.max(0, Math.min(1, (K.radius - d) / Math.max(1, K.radius - K.core)));
    for (let n = 1; n < K.sharp; n++) k *= k;
    const c = t.lures.curve;
    const a = K.pullEdge + (K.pullCore - K.pullEdge) * k * (1 - c + c * k);
    const ux = rx / d;
    const uy = ry / d;
    const s = (l.spin ?? 1) * K.swirl;
    // Clockwise tangent at her place = (uy, -ux) (y down).
    PULL.ax += a * (ux + s * uy);
    PULL.ay += a * (uy - s * ux);
  }
  return PULL;
}

/** The burning lure whose core her body centre is inside (-1 = none). */
export function lureCoreAt(state: GameState, scene: Scene, t: Tuning): number {
  const list = scene.lures;
  if (!list) return -1;
  const p = state.player;
  const cx = centreX(p);
  const cy = centreY(p);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || !acts(state, i)) continue;
    const c = lureRowNow(state.lures, i, l, t).core;
    const f = flameAt(state.lures, i, l, state.frame, t, F);
    const dx = f.x - cx;
    const dy = f.y - cy;
    if (dx * dx + dy * dy <= c * c) return i;
  }
  return -1;
}

/**
 * After her move in ordinary flight: the lure whose core catches her now (-1 = none). `px, py` = her
 * body centre before the move. A core catches her only when she moves inward (closer to its flame, which
 * may swing) or has been inside it `catchFrames` frames in a row (`player.lureCore`): she can stand or
 * drift beside a low wick without being glued to it. While her throw is young (`player.lureThrow`), a
 * core she passes through is given grace instead (no re-catch by the next wick).
 */
export function lureCatchAt(state: GameState, scene: Scene, t: Tuning, px: number, py: number): number {
  const p = state.player;
  const i = lureCoreAt(state, scene, t);
  const l = i >= 0 ? scene.lures?.[i] : undefined;
  if (!l) {
    p.lureCore = 0;
    return -1;
  }
  if (p.lureThrow > 0) {
    state.lures.grace[i] = Math.max(state.lures.grace[i] ?? 0, Math.max(0, Math.round(t.lures.graceFrames)));
    p.lureCore = 0;
    return -1;
  }
  p.lureCore++;
  const now = flameAt(state.lures, i, l, state.frame, t, F);
  const nx = centreX(p) - now.x;
  const ny = centreY(p) - now.y;
  const dNow = nx * nx + ny * ny;
  const was = flameAt(state.lures, i, l, state.frame - 1, t, F);
  const bx = px - was.x;
  const by = py - was.y;
  const inward = dNow < bx * bx + by * by;
  return inward || p.lureCore >= Math.max(1, Math.round(t.lures.catchFrames)) ? i : -1;
}

/**
 * The unit direction the last beat throws her (into `out`): the held direction, exactly (8-way), so the
 * stick alone picks it (Ori's Bash; the old radius bent by the stick threw her the wrong way in 7 of 34
 * rhythms). With nothing held, the radius she is at (out from the flame; Up at its very centre) is the
 * tie-break. (Up as that default put R3's mashers into W-hi3 over W1 in 5 of 9 rhythms; the radius in 2.)
 */
export function lureThrowAim(
  state: GameState,
  scene: Scene,
  t: Tuning,
  aimX: number,
  aimY: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const hm = Math.sqrt(aimX * aimX + aimY * aimY);
  if (hm > 0) {
    out.x = aimX / hm;
    out.y = aimY / hm;
    return out;
  }
  out.x = 0;
  out.y = -1;
  const p = state.player;
  const l = scene.lures?.[p.lure];
  if (!l) return out;
  const f = flameAt(state.lures, p.lure, l, state.frame, t, F);
  const rx = centreX(p) - f.x;
  const ry = centreY(p) - f.y;
  const d = Math.sqrt(rx * rx + ry * ry);
  if (d > 0.001) {
    out.x = rx / d;
    out.y = ry / d;
  }
  return out;
}

/** Scratch for the throw's aim. */
const AIM = { x: 0, y: 0 };

/** Caught by lure `i`: her circle starts where she is and sinks in to the orbit. */
export function catchPlayer(state: GameState, scene: Scene, i: number, t: Tuning, events: SimEvent[]): void {
  const l = scene.lures?.[i];
  if (!l) return;
  const p = state.player;
  const K = lureRowNow(state.lures, i, l, t);
  const f = flameAt(state.lures, i, l, state.frame, t, F);
  const dx = centreX(p) - f.x;
  const dy = centreY(p) - f.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  p.lure = i;
  p.lureFrames = 0;
  p.lureBeats = 0;
  p.lureCd = 0;
  p.lurePend = 0;
  p.lureOut = Math.max(0, d - K.core * t.lures.orbitShare);
  p.lureCore = 0;
  p.lureThrow = 0;
  p.pullX = 0;
  events.push({ type: 'lureCaught', id: l.id, kind: l.kind, x: f.x, y: f.y, spin: l.spin ?? 1 });
}

/**
 * She is out of lure `p.lure`'s hold. `beat`: thrown along `lureThrowAim` (the held direction `aimX`,
 * `aimY`; the radius she is at when none is held) at `freeSpeed` (the sideways part as `pullX`, plus
 * `freeLift` up), double jump and air dash back; for `throwFrames` every core she passes through gets
 * grace too. `dash` / `hurt` / `snuff`: no throw (the dash or the blow moves her). Either way that lure
 * leaves her alone for `graceFrames`.
 */
export function freePlayer(
  state: GameState,
  scene: Scene,
  t: Tuning,
  how: LureFreeHow,
  events: SimEvent[],
  aimX = 0,
  aimY = 0,
): void {
  const p = state.player;
  const i = p.lure;
  const l = scene.lures?.[i];
  p.lure = -1;
  p.lureBeats = 0;
  p.lureOut = 0;
  p.lureCd = 0;
  p.lurePend = 0;
  if (!l) return;
  const T = t.lures;
  const f = flameAt(state.lures, i, l, state.frame, t, F);
  const fx = f.x;
  const fy = f.y;
  let vx = 0;
  let vy = 0;
  if (how === 'beat') {
    // (`p.lure` is cleared above: aim with the lure's index restored for the radius.)
    p.lure = i;
    const a = lureThrowAim(state, scene, t, aimX, aimY, AIM);
    p.lure = -1;
    vx = a.x * T.freeSpeed;
    vy = a.y * T.freeSpeed - T.freeLift;
    p.vx = 0;
    p.pullX = vx;
    p.vy = vy;
    p.lureThrow = Math.max(0, Math.round(T.throwFrames));
  } else {
    p.pullX = 0;
  }
  const grace = Math.max(0, Math.round(T.graceFrames));
  p.lureGrace = i;
  p.lureGraceFrames = grace;
  state.lures.grace[i] = Math.max(state.lures.grace[i] ?? 0, grace);
  p.lureCore = 0;
  events.push({ type: 'lureFree', id: l.id, x: fx, y: fy, how, vx, vy, grace });
}

/** One beat: a press while caught. Returns true when it was the last one (she is free). */
export function beatLure(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  aimX = 0,
  aimY = 0,
): boolean {
  const p = state.player;
  const l = scene.lures?.[p.lure];
  if (!l) return false;
  const T = t.lures;
  const of = Math.max(1, Math.round(T.beats));
  p.lureBeats++;
  p.lureOut += T.beatPush;
  p.lureCd = Math.max(0, Math.round(T.beatCd));
  const f = flameAt(state.lures, p.lure, l, state.frame, t, F);
  events.push({ type: 'lureBeat', id: l.id, x: f.x, y: f.y, beats: p.lureBeats, of, out: p.lureOut });
  if (p.lureBeats < of) return false;
  freePlayer(state, scene, t, 'beat', events, aimX, aimY);
  return true;
}

/**
 * Where her body centre goes this frame while caught: a step of `orbitSpeed` along the tangent, then
 * back onto the circle of radius `core x orbitShare + lureOut`. Returns the move (dx, dy) in `out`.
 */
export function orbitStep(state: GameState, scene: Scene, t: Tuning, out: { dx: number; dy: number }): void {
  const p = state.player;
  out.dx = 0;
  out.dy = 0;
  const l = scene.lures?.[p.lure];
  if (!l) return;
  const T = t.lures;
  const K = lureRowNow(state.lures, p.lure, l, t);
  const r = K.core * T.orbitShare + p.lureOut;
  const cx = centreX(p);
  const cy = centreY(p);
  const f = flameAt(state.lures, p.lure, l, state.frame, t, F);
  const lx = f.x;
  const ly = f.y;
  let rx = cx - lx;
  let ry = cy - ly;
  let d = Math.sqrt(rx * rx + ry * ry);
  if (d < 0.001) {
    rx = 0;
    ry = 1;
    d = 1;
  }
  const s = l.spin ?? 1;
  // Clockwise tangent at (rx, ry) from the flame = (-ry, rx) / d (y down).
  const nx = rx + ((-ry * s) / d) * T.orbitSpeed;
  const ny = ry + ((rx * s) / d) * T.orbitSpeed;
  const n = Math.sqrt(nx * nx + ny * ny);
  out.dx = lx + (nx * r) / n - cx;
  out.dy = ly + (ny * r) / n - cy;
}

/** Per-step bookkeeping that runs whatever she does (also in hitstop): the graces count down. */
export function tickLures(state: GameState): void {
  const p = state.player;
  if (p.lureGraceFrames > 0 && --p.lureGraceFrames === 0) p.lureGrace = -1;
  if (p.lureThrow > 0) p.lureThrow--;
  const g = state.lures.grace;
  for (let i = 0; i < g.length; i++) if ((g[i] as number) > 0) g[i] = (g[i] as number) - 1;
}

/**
 * Slash number `seq` (hit area `box`) against every burning flame it overlaps and has not hit yet.
 * Pushes `slashHit`, then `lureHit` or `lureSnuff`; a snuff gives health back and, if she was caught
 * by it, frees her. Returns the hits and how many went out.
 */
export function slashLures(
  state: GameState,
  scene: Scene,
  box: Box,
  seq: number,
  dir: SlashDir,
  facing: number,
  pogo: boolean,
  step: number,
  power: number,
  knockback: number,
  t: Tuning,
  events: SimEvent[],
): { hits: number; snuffs: number } {
  const res = { hits: 0, snuffs: 0 };
  const list = scene.lures;
  if (!list || list.length === 0) return res;
  const s = state.lures;
  const p = state.player;
  const T = t.lures;
  const r = T.flameRadius;
  const px = p.x + (p.w >> 1);
  const py = p.y + (p.h >> 1);
  for (let i = 0; i < list.length; i++) {
    const hp = s.hp[i] as number;
    if (hp <= 0 || s.hitBy[i] === seq) continue;
    const l = list[i];
    if (!l) continue;
    // (Guarded by its boss: the blade passes through it, memory/bosses.md.)
    if ((s.live?.shield[i] ?? 0) > 0) continue;
    const f = flameAt(s, i, l, state.frame, t, F);
    const lx = f.x;
    const ly = f.y;
    if (lx + r <= box.x || lx - r >= box.x + box.w || ly + r <= box.y || ly - r >= box.y + box.h) continue;
    s.hitBy[i] = seq;
    const hpMax = lureHpMax(l, t);
    const hpLeft = Math.max(0, hp - Math.max(1, Math.round(power)));
    s.hp[i] = hpLeft;
    res.hits++;
    const stop = hpLeft > 0 ? Math.round(T.hitstopFrames) : Math.round(T.snuffHitstop);
    events.push({
      type: 'slashHit',
      x: lx,
      y: ly,
      dir,
      facing,
      target: { kind: 'lure', id: l.id },
      px,
      py,
      pogo,
      hitstop: stop,
      step,
      power,
      knockback,
    });
    if (hpLeft > 0) {
      events.push({ type: 'lureHit', id: l.id, kind: l.kind, x: lx, y: ly, dir, hpLeft, hpMax });
      continue;
    }
    res.snuffs++;
    s.out[i] = state.frame + 1;
    s.snuffed++;
    const moths = Math.max(0, Math.round(lureRowNow(s, i, l, t).moths));
    s.freed += moths;
    // Out for good (memory/save.md): the save remembers it by `room:id`, and the moths it freed. A
    // boss's flames are saved when it is beaten (src/sim/boss/index.ts): a fight lost starts over.
    const key = `${scene.id}:${l.id}`;
    if (!bossOwnsLure(scene.boss, l.id) && !state.save.snuffed.includes(key)) {
      state.save.snuffed.push(key);
      state.save.moths += moths;
    }
    const heal = Math.max(0, Math.min(p.hpMax - p.hp, Math.round(T.healOnSnuff)));
    p.hp += heal;
    if (p.lure === i) freePlayer(state, scene, t, 'snuff', events);
    events.push({
      type: 'lureSnuff',
      id: l.id,
      kind: l.kind,
      x: lx,
      y: ly,
      dir,
      moths,
      freed: s.freed,
      snuffed: s.snuffed,
      heal,
    });
  }
  return res;
}
