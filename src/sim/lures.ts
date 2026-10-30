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
import type { SimEvent, SlashDir } from './events';
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
  if (l.trap) return Math.max(1, Math.round(t.lures.trapHp));
  return Math.max(1, Math.round(lureRow(t, l.kind).hp));
}

/**
 * Is she within `lures.lessonPx` of a burning lesson lamp (`Lure.lesson`) whose `sets` flag the save lacks? (The first fling,
 * the Canopy r10: her fall slows there, src/sim/player/player.ts `gravity`.)
 */
export function lessonInReach(state: GameState, scene: Scene, t: Tuning): boolean {
  const list = scene.lures;
  if (!list) return false;
  const p = state.player;
  const cx = centreX(p);
  const cy = centreY(p);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l?.lesson || (state.lures.hp[i] ?? 0) <= 0) continue;
    if (l.sets && state.save.flags.includes(l.sets)) continue;
    const r = t.lures.lessonPx;
    const f = flameAt(state.lures, i, l, state.frame, t, F);
    if ((f.x - cx) * (f.x - cx) + (f.y - cy) * (f.y - cy) <= r * r) return true;
  }
  return false;
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
    ember: list.map(() => 0),
    // (Moonwicks start cold: src/sim/light.ts `initWicks` lights the ones the save keeps.)
    burn: list.map(() => 0),
  };
}

/** A moonwick (Lanternroot): her light's anchor, not a warm lamp (no pull, no moths, never cut out). */
export function isMoonwick(l: Lure | undefined): boolean {
  return l?.kind === 'moonwick';
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

/**
 * The burning lure she can fling off now (-1 = none): the nearest whose flame is within its kind's `fling`
 * radius of her body centre (a boss's shielded flame, a row with `fling` 0: never).
 */
export function flingTarget(state: GameState, scene: Scene, t: Tuning): number {
  const list = scene.lures;
  if (!list) return -1;
  const p = state.player;
  const cx = centreX(p);
  const cy = centreY(p);
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || (state.lures.hp[i] ?? 0) <= 0 || (state.lures.live?.shield[i] ?? 0) > 0) continue;
    // (A trap lamp is a cage to cut open, never a springboard: the Canopy r10.)
    if (l.trap) continue;
    const r = lureRowNow(state.lures, i, l, t).fling;
    if (!(r > 0)) continue;
    const f = flameAt(state.lures, i, l, state.frame, t, F);
    const d = (f.x - cx) * (f.x - cx) + (f.y - cy) * (f.y - cy);
    if (d <= r * r && d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * The unit direction the fling sends her (into `out`): the held direction, exactly (8-way); with nothing
 * held, straight out from the flame through her (Up at its very centre).
 */
export function flingAim(
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
  const l = scene.lures?.[p.fling];
  if (!l) return out;
  const f = flameAt(state.lures, p.fling, l, state.frame, t, F);
  const rx = centreX(p) - f.x;
  const ry = centreY(p) - f.y;
  const d = Math.sqrt(rx * rx + ry * ry);
  if (d > 0.5) {
    out.x = rx / d;
    out.y = ry / d;
  }
  return out;
}

/** Scratch for the fling's aim. */
const AIM = { x: 0, y: 0 };

/**
 * The fling's launch from lure `p.fling` along `flingAim` (the held `aimX`, `aimY`): `flingSpeed` (the sideways
 * part as `pullX`, as the old throw) plus `flingLift` up, the launch (`throwFrames` at `launchGravity`, `thrown`),
 * and the flame goes out behind her (`snuffLure`). Pushes `fling`, then the snuff's events.
 */
export function flingLaunch(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  aimX: number,
  aimY: number,
): void {
  const p = state.player;
  const i = p.fling;
  const l = scene.lures?.[i];
  // (The aim reads `p.fling`: before it is cleared.)
  flingAim(state, scene, t, aimX, aimY, AIM);
  p.fling = -1;
  p.flingFrames = 0;
  if (!l) return;
  const T = t.lures;
  const f = flameAt(state.lures, i, l, state.frame, t, F);
  const vx = AIM.x * T.flingSpeed;
  const vy = AIM.y * T.flingSpeed - T.flingLift;
  p.vx = 0;
  p.pullX = vx;
  p.vy = vy;
  p.lureThrow = Math.max(0, Math.round(T.throwFrames));
  p.thrown = true;
  // (The chain's first launch remembers the ground it left: landing back there is a miss.)
  if (!hasEmbers(state)) {
    p.chainX = p.groundX;
    p.chainY = p.groundY;
  }
  p.flingCd = Math.max(0, Math.round(T.flingCooldown));
  events.push({ type: 'fling', id: l.id, x: f.x, y: f.y, vx, vy, aimX: AIM.x, aimY: AIM.y });
  // (A burning moonwick is the reusable anchor: it never embers, it burns on behind her.)
  if (l.kind === 'moonwick') return;
  // Used up: it smoulders behind her (embers) until she lands safe (out for good) or fails (it burns again).
  state.lures.hp[i] = 0;
  state.lures.ember[i] = 1;
  events.push({ type: 'lureEmber', id: l.id, x: f.x, y: f.y });
}

/** Any flame smouldering behind her (embers)? */
export function hasEmbers(state: GameState): boolean {
  const e = state.lures.ember;
  for (let i = 0; i < e.length; i++) if (e[i]) return true;
  return false;
}

/** She landed safe (or left the room in flight): every ember goes out for good (`snuffLure`: moths, save, heal). */
export function commitEmbers(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const e = state.lures.ember;
  for (let i = 0; i < e.length; i++) {
    if (!e[i]) continue;
    e[i] = 0;
    snuffLure(state, scene, i, t, events, 1, 'fling');
  }
}

/** She fell or met thorns with embers behind her: they burn again (the chain can be tried again). */
export function relightEmbers(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const e = state.lures.ember;
  for (let i = 0; i < e.length; i++) {
    const l = scene.lures?.[i];
    if (!e[i] || !l) continue;
    e[i] = 0;
    state.lures.hp[i] = lureHpMax(l, t);
    const f = flameAt(state.lures, i, l, state.frame, t, F);
    events.push({ type: 'lureRelight', id: l.id, x: f.x, y: f.y });
  }
}

/**
 * Per-step bookkeeping that runs whatever she does (also in hitstop): the graces count down, and a toy room's
 * `relight` lamps burn again.
 */
export function tickLures(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const list = scene.lures;
  if (list) {
    const s = state.lures;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l?.relight || (s.hp[i] ?? 0) > 0 || !s.out[i]) continue;
      if (state.frame + 1 - (s.out[i] as number) < l.relight) continue;
      s.hp[i] = lureHpMax(l, t);
      s.out[i] = 0;
      const f = flameAt(s, i, l, state.frame, t, F);
      events.push({ type: 'lureRelight', id: l.id, x: f.x, y: f.y });
    }
  }
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
    // (A moonwick: the blade passes through it. She cannot snuff her own light.)
    if (l.kind === 'moonwick') continue;
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
    snuffLure(state, scene, i, t, events, dir === 'fwd' ? (facing < 0 ? -1 : 1) : facing < 0 ? -1 : 1, dir);
  }
  return res;
}

/**
 * Lure `i` goes out for good (a slash's last cut, or a fling off it): its moths are freed, the save remembers
 * it (`room:id`; a boss's flames when the boss is beaten, a `relight` lure never), 1 light back. `by` = the
 * slash's direction, or `fling`.
 */
export function snuffLure(
  state: GameState,
  scene: Scene,
  i: number,
  t: Tuning,
  events: SimEvent[],
  side: number,
  by: SlashDir | 'fling' | 'gust',
): void {
  const l = scene.lures?.[i];
  if (!l) return;
  const s = state.lures;
  const p = state.player;
  const f = flameAt(s, i, l, state.frame, t, F);
  s.hp[i] = 0;
  s.out[i] = state.frame + 1;
  s.snuffed++;
  const moths = Math.max(0, Math.round(l.moths ?? lureRowNow(s, i, l, t).moths));
  s.freed += moths;
  const key = `${scene.id}:${l.id}`;
  if (!bossOwnsLure(scene.boss, l.id) && !l.relight && !state.save.snuffed.includes(key)) {
    state.save.snuffed.push(key);
    state.save.moths += moths;
  }
  // (In a glow room a lamp out pays glow instead of health: memory/glow.md.)
  const heal = scene.glow ? 0 : Math.max(0, Math.min(p.hpMax - p.hp, Math.round(t.lures.healOnSnuff)));
  p.hp += heal;
  events.push({
    type: 'lureSnuff',
    id: l.id,
    kind: l.kind,
    x: f.x,
    y: f.y,
    dir: by === 'fling' || by === 'gust' ? 'fwd' : by,
    moths,
    freed: s.freed,
    snuffed: s.snuffed,
    heal,
    fling: by === 'fling',
    side,
    ...(by === 'gust' ? { gust: true } : {}),
    ...(l.trap ? { trap: true, total: state.save.moths } : {}),
  });
  // A lamp-held gate (Lanternroot): its flag is set as it goes out.
  if (l.sets && !state.save.flags.includes(l.sets)) {
    state.save.flags.push(l.sets);
    events.push({ type: 'flagSet', flag: l.sets, by: l.id, x: f.x, y: f.y });
  }
}
