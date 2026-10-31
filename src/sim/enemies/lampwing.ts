/**
 * The lampwing: a small pale moth-wisp of the open air, drawn to her light (memory/enemies.md).
 *
 *  - `hover`: it wanders round its home inside its territory, steering softly toward wander points
 *    drawn from a hash of its id (no RNG), with a slow bob. It never enters a solid, never rises
 *    above the canopy, never dips to the water; one-way branches are open air to it.
 *  - She comes within its sight with a clear line: `curious` (it brakes, turns to her and rises:
 *    the tell), then it commits: `dive`, a swoop along an arc to where she stood when the tell
 *    ended (moving on dodges it; a gliding hero is led). At the bottom it hangs (`stall`): open,
 *    its touch harmless: her opening. Then it climbs to a perch above her (`pursue`) and tells again.
 *  - It gives up (`rest`, then `return` home, noticing nothing until it is there) when she is too far
 *    from its home, out of sight too long, when it has dived often enough, when her light goes out
 *    (she faded, or she carries nothing any more: memory/giving.md), when it has touched her (it
 *    bounces off her first), and when she gives it a glint (`gift`: it settles and goes home).
 *  - It sees only the light she carries: empty-handed she is dark to it; the more she carries, the
 *    further its sight reaches (`seenScale`).
 *  - Its dive is its attack; its touch hurts whenever it is not stalled. Hit, it is batted along the
 *    cut and tumbles (`hurt`), then climbs to try again. Dead, it falls and is gone.
 *
 * No gravity, no ground: it is a point of steering in free air, moved 1 px at a time per axis.
 */
import { lureAt } from '../lures';
import { roundHalfAway, solidAt } from '../physics/aabb';
import { nearLitLantern } from '../sanctuary';
import type { Scene, SolidRect } from '../scene';
import { seenScale } from '../seen';
import type { EnemyState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { frames, heldUnseen, type KindRules, mix, type StepInfo, segmentBlocked, setMode } from './common';
import { SENSE_WALLET, seenBy, shyOf } from './senses';

type L = Tuning['lampwing'];

/** The numbers of this flyer: the lampwing's, or the hawker's (a variant row, tuning.ts). */
function rowOf(t: Tuning, e: EnemyState): L {
  return e.kind === 'hawker' ? t.hawker : t.lampwing;
}

/** The flyers on this rig (they keep apart from each other). */
function flyer(e: EnemyState | undefined): e is EnemyState {
  return e?.kind === 'lampwing' || e?.kind === 'hawker';
}

/** Why a pursuit ended. */
export type GiveUpCause = 'far' | 'lost' | 'tired' | 'dark' | 'touch' | 'calm' | 'gift';

/** May its box be at (x, y)? Solids and the scene's edges, the canopy, the water of a pool. */
export function lampwingBlocked(scene: Scene, x: number, y: number, w: number, h: number, t: L): boolean {
  if (y < (scene.ceilingY ?? 0)) return true;
  if (solidAt(scene, x, y, w, h)) return true;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s === undefined || s.tag !== 'pool') continue;
    if (x < s.x + s.w && s.x < x + w && y + h > s.y - t.poolDepth - t.poolClear) return true;
  }
  return false;
}

/** Moves it by (vx, vy), 1 px at a time. Returns 1 if x was stopped, 2 if y was, 3 if both. */
function fly(e: EnemyState, scene: Scene, t: L, vx: number, vy: number): number {
  let hit = 0;
  e.rx += vx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  let d = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (lampwingBlocked(scene, e.x + d, e.y, e.w, e.h, t)) {
      e.rx = 0;
      hit |= 1;
      break;
    }
    e.x += d;
    n -= d;
  }
  e.ry += vy;
  n = roundHalfAway(e.ry);
  e.ry -= n;
  d = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (lampwingBlocked(scene, e.x, e.y + d, e.w, e.h, t)) {
      e.ry = 0;
      hit |= 2;
      break;
    }
    e.y += d;
    n -= d;
  }
  return hit;
}

/** Its own velocity, moved; an axis that is stopped loses its speed (it slides along what it met). */
function drift(e: EnemyState, scene: Scene, t: L): number {
  const hit = fly(e, scene, t, e.vx, e.vy);
  if ((hit & 1) !== 0) e.vx = 0;
  if ((hit & 2) !== 0) e.vy = 0;
  return hit;
}

/** Turns its velocity toward (dvx, dvy) by at most `accel` px/f². */
function steer(e: EnemyState, dvx: number, dvy: number, accel: number): void {
  let ax = dvx - e.vx;
  let ay = dvy - e.vy;
  const m = Math.sqrt(ax * ax + ay * ay);
  if (m > accel && m > 0) {
    ax = (ax * accel) / m;
    ay = (ay * accel) / m;
  }
  e.vx += ax;
  e.vy += ay;
}

// Scratch for `aim` (no allocation in the step path).
let aimX = 0;
let aimY = 0;
let aimLen = 0;

/**
 * Points `look` at its target and leaves in `aimX, aimY` the velocity that goes there at `speed`
 * (slowing inside `arrive` px, if given) and in `aimLen` the distance.
 */
function aim(e: EnemyState, speed: number, arrive: number): void {
  const dx = e.targetX - (e.x + e.w / 2);
  const dy = e.targetY - (e.y + e.h / 2);
  const len = Math.sqrt(dx * dx + dy * dy);
  aimLen = len;
  if (len <= 0) {
    aimX = 0;
    aimY = 0;
    return;
  }
  e.lookX = dx / len;
  e.lookY = dy / len;
  const sp = arrive > 0 && len < arrive ? (speed * len) / arrive : speed;
  aimX = e.lookX * sp;
  aimY = e.lookY * sp;
}

/** A smooth wave in [-1, 1] over u in [0, 1) made of two parabolas (exact arithmetic: no Math.sin). */
function wave(u: number): number {
  const x = u < 0.5 ? u * 2 : (u - 0.5) * 2;
  const s = 4 * x * (1 - x);
  return u < 0.5 ? s : -s;
}

// Her level of being seen this step (`update` sets it before anything else: memory/giving.md).
let SEEN = 0;

/** Her light: she is whole and carries something (empty-handed she is dark to it). */
const lit = (p: PlayerState): boolean => p.hp > 0 && p.faded === 0 && SEEN > 0;

/** Can it see her (a clear line between the two centres), within `range` px if given? */
function sees(e: EnemyState, p: PlayerState, scene: Scene, range: number): boolean {
  if (!lit(p)) return false;
  const ex = e.x + e.w / 2;
  const ey = e.y + e.h / 2;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  if (range > 0 && (px - ex) * (px - ex) + (py - ey) * (py - ey) > range * range) return false;
  return !segmentBlocked(scene, ex, ey, px, py);
}

/** She is within `roostPx` of it, whole, and too dark to be seen (round 4): it roosts. */
function roosts(e: EnemyState, p: PlayerState, t: L): boolean {
  if (SEEN > 0 || p.hp <= 0 || p.faded > 0 || t.roostPx <= 0) return false;
  const dx = p.x + p.w / 2 - (e.x + e.w / 2);
  const dy = p.y + p.h / 2 - (e.y + e.h / 2);
  return dx * dx + dy * dy <= t.roostPx * t.roostPx;
}

/** Is she within its leash (her centre to its home), less `margin` px? */
function inLeash(e: EnemyState, p: PlayerState, t: L, margin = 0): boolean {
  const dx = p.x + p.w / 2 - e.homeX;
  const dy = p.y + p.h / 2 - e.homeY;
  const r = Math.max(0, t.leashPx - margin);
  return dx * dx + dy * dy <= r * r;
}

function face(e: EnemyState, dx: number, dead: number): void {
  if (dx > dead) e.facing = 1;
  else if (dx < -dead) e.facing = -1;
}

/** The next wander point: inside the territory, clear, and in plain view of its home. */
function pickWander(e: EnemyState, scene: Scene, t: L): void {
  const reach = e.radius * 0.8;
  let tx = e.homeX;
  let ty = e.homeY;
  for (let k = 0; k < 8; k++) {
    const n = e.wander++;
    const ox = ((mix(e.salt + 11, n) % 2001) / 1000 - 1) * reach * e.side;
    const oy = ((mix(e.salt + 12, n) % 2001) / 1000 - 1) * reach * 0.6;
    if (ox * ox + oy * oy > reach * reach) continue;
    const x = e.homeX + roundHalfAway(ox);
    const y = e.homeY + roundHalfAway(oy);
    if (lampwingBlocked(scene, Math.round(x - e.w / 2), Math.round(y - e.h / 2), e.w, e.h, t)) continue;
    if (segmentBlocked(scene, e.homeX, e.homeY, x, y)) continue;
    tx = x;
    ty = y;
    break;
  }
  e.targetX = tx;
  e.targetY = ty;
  const lo = frames(Math.min(t.wanderMin, t.wanderMax), 1);
  const hi = frames(Math.max(t.wanderMin, t.wanderMax), 1);
  e.wanderLeft = lo + (mix(e.salt + 13, e.wander) % (hi - lo + 1));
}

function giveUp(e: EnemyState, info: StepInfo, cause: GiveUpCause): void {
  const n = frames(rowOf(info.t, e).restFrames, 1);
  setMode(e, 'rest', n);
  e.chase = 0;
  e.lost = 0;
  e.dives = 0;
  // She went beyond its reach: for a while it tells only at one well inside it (not at every jump
  // at the edge of it).
  if (cause === 'far') e.noticeCd = frames(rowOf(info.t, e).retellFrames);
  // (One with its own dive count, tired: it lets her pass before it tells again: one pass, one dive.)
  if ((cause === 'tired' || cause === 'touch') && e.maxDives > 0)
    e.noticeCd = frames(rowOf(info.t, e).retellFrames);
  info.events.push({
    type: 'enemyGiveUp',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    facing: e.facing,
    cause,
    frames: n,
  });
}

/** The solid that stops its box from moving 1 px along x (`ax` = -1 / 1) or y (`ay`). */
function blocker(e: EnemyState, scene: Scene, ax: number, ay: number): SolidRect | undefined {
  const x = e.x + ax;
  const y = e.y + ay;
  for (const s of scene.solids) {
    if (x < s.x + s.w && s.x < x + e.w && y < s.y + s.h && s.y < y + e.h) return s;
  }
  return undefined;
}

/**
 * On the way home and stopped dead by a solid that lies between: aim for the nearer end of the
 * face it is against (just clear of the corner), for at most `DETOUR` frames, then home again.
 */
const DETOUR = 300;
const CLEAR = 6;
const STUCK = 20;
function detour(e: EnemyState, scene: Scene, t: L): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const dy = e.homeY > cy ? 1 : -1;
  const dx = e.homeX > cx ? 1 : -1;
  const sy = blocker(e, scene, 0, dy);
  const sx = sy ? undefined : blocker(e, scene, dx, 0);
  let ax = cx;
  let ay = cy;
  let bx = cx;
  let by = cy;
  if (sy) {
    ax = sy.x - e.w / 2 - CLEAR;
    bx = sy.x + sy.w + e.w / 2 + CLEAR;
  } else if (sx) {
    ay = sx.y - e.h / 2 - CLEAR;
    by = sx.y + sx.h + e.h / 2 + CLEAR;
  } else return;
  const free = (x: number, y: number): boolean =>
    !lampwingBlocked(scene, Math.round(x - e.w / 2), Math.round(y - e.h / 2), e.w, e.h, t);
  const da = Math.abs(ax - cx) + Math.abs(ay - cy);
  const db = Math.abs(bx - cx) + Math.abs(by - cy);
  const aOk = free(ax, ay);
  const bOk = free(bx, by);
  if (!aOk && !bOk) return;
  const useA = aOk && (!bOk || da <= db);
  e.targetX = useA ? ax : bx;
  e.targetY = useA ? ay : by;
  e.lost = DETOUR;
  e.chase = 0;
}

const HELD = { x: 0, y: 0 };

/** Where she is held (a lure's flame she circles, a web's grip), or null if nothing holds her. */
function heldAt(info: StepInfo): { x: number; y: number } | null {
  const p = info.state.player;
  if (p.hp <= 0 || p.faded > 0) return null;
  const l = p.lure >= 0 ? info.scene.lures?.[p.lure] : undefined;
  if (l) return lureAt(l, info.state.frame, info.t, HELD);
  if (p.grab >= 0) {
    HELD.x = p.grabX;
    HELD.y = p.grabY;
    return HELD;
  }
  return null;
}

/** She was just knocked out of a lure's orbit (`lureFree` how `hurt` this step): thrown along her aim instead. */
function strikeOut(info: StepInfo): boolean {
  const p = info.state.player;
  const ev = info.events;
  let freed = false;
  for (let i = ev.length - 1; i >= 0 && i >= ev.length - 12; i--) {
    const x = ev[i];
    if (x?.type === 'lureFree' && x.how === 'hurt') {
      freed = true;
      break;
    }
  }
  if (!freed || (p.lureAimX === 0 && p.lureAimY === 0)) return false;
  const L = info.t.lures;
  p.vx = 0;
  p.pullX = p.lureAimX * L.freeSpeed;
  p.vy = p.lureAimY * L.freeSpeed - L.freeLift;
  p.lureThrow = Math.max(0, Math.round(L.throwFrames));
  p.thrown = true;
  return true;
}

/**
 * A blow toward the rim (`EnemySpawn.rim`): out of a lamp's hold (or caught in a pass) she is thrown up and
 * over toward it, as a throw (`lures.freeSpeed`, the throw's frames); free, she is kicked toward it with a lift.
 */
function toRim(info: StepInfo, t: L, rim: number): void {
  const p = info.state.player;
  const d = rim > p.x + p.w / 2 ? 1 : -1;
  p.vx = 0;
  let held = p.lure >= 0;
  for (let i = info.events.length - 1; i >= 0 && i >= info.events.length - 12; i--) {
    const x = info.events[i];
    if (x?.type === 'lureFree' && x.how === 'hurt') held = true;
  }
  if (held) {
    const L = info.t.lures;
    p.pullX = d * Math.SQRT1_2 * L.freeSpeed;
    p.vy = -Math.SQRT1_2 * L.freeSpeed - L.freeLift;
    p.lureThrow = Math.max(0, Math.round(L.throwFrames));
    p.thrown = true;
    return;
  }
  p.pullX = 0;
  p.kickX = d * t.rimKick;
  p.vy = Math.min(p.vy, -t.rimLift);
}

/** A blow on a gliding moth (`glideKnockVx` > 0): on along her glide (`dir`), lifted `glideKnockLift`. */
function glideKnock(p: PlayerState, t: L, dir: number): void {
  p.vx = dir * t.glideKnockVx;
  p.kickX = 0;
  p.vy = -t.glideKnockLift;
}

/** A pass begins: `n` frames of swoop after the pull-back (`enemyDive` at the flame). */
function swoop(e: EnemyState, info: StepInfo, t: L, f: { x: number; y: number }, n: number): void {
  const span = frames(t.diveWindupFrames) + n;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  setMode(e, 'dive', span);
  e.span = span;
  // (One strike a pass at most: `taken` = it has struck her in this one.)
  e.taken = 0;
  e.fromX = cx;
  e.fromY = cy;
  e.targetX = f.x - e.side * t.passRadius;
  e.targetY = f.y - t.passHeight;
  e.vx = 0;
  e.vy = 0;
  e.rx = 0;
  e.ry = 0;
  info.events.push({
    type: 'enemyDive',
    id: e.id,
    kind: e.kind,
    x: cx,
    y: cy,
    tx: f.x,
    ty: f.y,
    dir: -e.side,
    frames: span,
    dive: 1,
  });
}

/** Was she standing when the blow came (her feet on a top)? */
function onGround(info: StepInfo): boolean {
  const p = info.state.player;
  return p.contactFrames > 0 ? false : solidAt(info.scene, p.x, p.y + p.h, p.w, 1);
}

const FL = { x: 0, y: 0 };

/**
 * The rhythm (a hawker with an `orbit`): it waits at a perch beside the flame (`passRadius` to the side,
 * `passHeight` above), tells (`passTellFrames`), pulls back and swoops through the orbit to the mirror perch
 * in `passFrames` (a curve through the flame), taking a moth at the flame (`enemySnatch`), and waits there
 * for the next pass: one every `period` frames. Returns false when it is not hunting on its rhythm now (its
 * lamp is out, it is hurt, dead or leaving: the ordinary rules then).
 */
function rhythm(e: EnemyState, info: StepInfo, t: L): boolean {
  if (e.mode === 'dead' || e.mode === 'hurt' || e.mode === 'leave' || e.gone) return false;
  const l = info.scene.lures?.[e.orbit];
  if (!l || (info.state.lures.hp[e.orbit] ?? 0) <= 0) return false;
  const f = lureAt(l, info.state.frame, info.t, FL);
  const period = Math.max(
    frames(t.passTellFrames + t.diveWindupFrames + t.passFrames + 20),
    e.period || t.passPeriod,
  );
  const wait = period - frames(t.passTellFrames) - frames(t.diveWindupFrames) - frames(t.passFrames);
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  if (e.mode !== 'perch' && e.mode !== 'curious' && e.mode !== 'dive') {
    // (Joining its rhythm: to the nearer perch.)
    e.side = cx < f.x ? -1 : 1;
    setMode(e, 'perch', wait);
  }
  const px = f.x + e.side * t.passRadius;
  const py = f.y - t.passHeight;
  if (e.mode === 'perch') {
    e.targetX = px;
    e.targetY = py;
    aim(e, t.pursueSpeed, t.arrivePx);
    steer(e, aimX, aimY, t.pursueAccel);
    drift(e, info.scene, t);
    face(e, f.x - cx, 0);
    e.flap += t.flapHover;
    const p = info.state.player;
    // (Round 4: caught in its orbit once its rest after a pass is over, she is snatched at once: the pass
    // crosses the orbit `diveWindupFrames` + half of `snapPassFrames` after the catch, before a masher is free.
    // Caught in the rest just after a pass, she has the time to beat free: that is the timing.)
    if (
      t.snapPassFrames > 0 &&
      p.lure === e.orbit &&
      e.modeFrames >= frames(t.passRestFrames) &&
      !heldUnseen(e, p)
    ) {
      swoop(e, info, t, f, frames(t.snapPassFrames, 1));
    } else if (--e.timer <= 0 && heldUnseen(e, p)) {
      // (Held helpless and it was off her screen as she was caught: it waits.)
      e.timer = 1;
    } else if (e.timer <= 0 && shyOf(e, info, p.x + p.w / 2, p.y + p.h / 2)) {
      // (Silver light: it holds its perch until she is out of it.)
      e.timer = 1;
    } else if (e.timer <= 0) {
      const n = frames(t.passTellFrames, 1);
      setMode(e, 'curious', n);
      info.events.push({
        type: 'enemyNotice',
        id: e.id,
        kind: e.kind,
        x: cx,
        y: cy,
        dir: e.facing,
        frames: n,
      });
    }
  } else if (e.mode === 'curious') {
    steer(e, 0, 0, t.curiousAccel);
    drift(e, info.scene, t);
    e.flap += t.flapCurious;
    // (Round 5: it never starts a pass while she is caught in its orbit: the tell holds until she is free.)
    if (--e.timer <= 0) {
      if (info.state.player.lure === e.orbit || info.state.player.fling === e.orbit) e.timer = 1;
      else swoop(e, info, t, f, frames(t.passFrames, 1));
    }
  } else {
    // The pass: a pull-back, then a curve from its perch down through the flame and up to the mirror perch
    // (through her, if she circles in that orbit: it takes a moth from it, and she is one).
    const p = info.state.player;
    if (p.lure === e.orbit || p.fling === e.orbit) {
      f.x = p.x + p.w / 2;
      f.y = p.y + p.h / 2;
    }
    const w = frames(t.diveWindupFrames);
    const k = e.span - e.timer + 1;
    let ux = f.x - e.fromX;
    let uy = f.y - e.fromY;
    const d = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= d;
    uy /= d;
    const bx = e.fromX - ux * t.diveBackPx;
    const by = e.fromY - uy * t.diveBackPx;
    let gx: number;
    let gy: number;
    if (k <= w) {
      const q = w > 0 ? k / w : 1;
      gx = e.fromX + (bx - e.fromX) * q;
      gy = e.fromY + (by - e.fromY) * q;
    } else {
      const q = Math.min(1, (k - w) / Math.max(1, e.span - w));
      // Through the flame at the curve's middle: control = 2F - (A + B) / 2.
      const qx = 2 * f.x - (bx + e.targetX) / 2;
      const qy = 2 * f.y - (by + e.targetY) / 2;
      const a = (1 - q) * (1 - q);
      const b = 2 * (1 - q) * q;
      const c = q * q;
      gx = a * bx + b * qx + c * e.targetX;
      gy = a * by + b * qy + c * e.targetY;
      if (k - w === Math.ceil((e.span - w) / 2))
        info.events.push({ type: 'enemySnatch', id: e.id, kind: e.kind, x: f.x, y: f.y, lure: l.id });
    }
    const x0 = e.x;
    const y0 = e.y;
    e.x = Math.round(gx - e.w / 2);
    e.y = Math.round(gy - e.h / 2);
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    face(e, e.vx, 0.5);
    e.flap += t.flapDive;
    if (--e.timer <= 0) {
      // It lands on the far perch (its swoop's speed would carry it off the screen).
      e.side = -e.side;
      e.vx = 0;
      e.vy = 0;
      e.rx = 0;
      e.ry = 0;
      setMode(e, 'perch', wait);
    }
  }
  while (e.flap >= 1) e.flap -= 1;
  return true;
}

/** The tell is over: it commits to a dive at where she is now (led, if she glides). */
function startDive(e: EnemyState, info: StepInfo): void {
  const t = rowOf(info.t, e);
  const p = info.state.player;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  let tx = p.x + p.w / 2;
  let ty = p.y + p.h / 2;
  // Prey held by a flame (or a web): it strikes at the orbit's centre, where she is whichever way she circles.
  const prey = t.huntCaught ? heldAt(info) : null;
  if (prey) {
    tx = prey.x;
    ty = prey.y;
  }
  const span = (x: number, y: number): number => {
    const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    // A strike (the hawker): a short pull-back, then fast and straight (`strikeSpeed`, at most `strikeMaxFrames`).
    if (t.strikeSpeed > 0) {
      const m = Math.max(1, Math.min(frames(t.strikeMaxFrames, 1), Math.ceil(d / t.strikeSpeed)));
      return frames(t.diveWindupFrames) + m;
    }
    const lo = frames(t.diveMinFrames, 1);
    const hi = Math.max(lo, frames(t.diveMaxFrames, 1));
    return Math.max(lo, Math.min(hi, Math.round(d / Math.max(0.1, t.diveSpeed))));
  };
  let n = span(tx, ty);
  // A gliding hero holds her line: it dives at where the glide will have carried her.
  // (A hawker leads one on foot too, sideways only: her run, not her fall.)
  if (!prey && !p.gliding && t.diveLeadRun > 0 && p.vx !== 0) {
    for (let k = 0; k < 3; k++) {
      tx = p.x + p.w / 2 + p.vx * n * t.diveLeadRun;
      n = span(tx, ty);
    }
  }
  if (!prey && p.gliding && t.diveLeadGlide > 0) {
    for (let k = 0; k < 3; k++) {
      tx = p.x + p.w / 2 + p.vx * n * t.diveLeadGlide;
      ty = p.y + p.h / 2 + p.vy * n * t.diveLeadGlide;
      n = span(tx, ty);
    }
  }
  // Never further than its dive is long.
  const dx = tx - cx;
  const dy = ty - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > t.diveMaxPx && d > 0) {
    tx = cx + (dx * t.diveMaxPx) / d;
    ty = cy + (dy * t.diveMaxPx) / d;
    n = span(tx, ty);
  }
  setMode(e, 'dive', n);
  e.span = n;
  e.fromX = cx;
  e.fromY = cy;
  e.targetX = tx;
  e.targetY = ty;
  e.dives++;
  e.rx = 0;
  e.ry = 0;
  aim(e, 0, 0);
  face(e, tx - cx, 0);
  info.events.push({
    type: 'enemyDive',
    id: e.id,
    kind: e.kind,
    x: cx,
    y: cy,
    tx,
    ty,
    dir: e.facing,
    frames: n,
    dive: e.dives,
  });
}

/** Where the dive's arc is after `k` of its frames: a curve from its start that bends down first, eased. */
let arcX = 0;
let arcY = 0;
function arc(e: EnemyState, k: number, bend: number, t: L): void {
  if (t.strikeSpeed > 0) {
    // The strike: `diveWindupFrames` pulling back along the line (wings folding), then straight at the
    // committed point at an even speed.
    const w = frames(t.diveWindupFrames);
    let ux = e.targetX - e.fromX;
    let uy = e.targetY - e.fromY;
    const d = Math.sqrt(ux * ux + uy * uy);
    ux = d > 0 ? ux / d : 0;
    uy = d > 0 ? uy / d : 1;
    const bx = e.fromX - ux * t.diveBackPx;
    const by = e.fromY - uy * t.diveBackPx;
    if (k <= w) {
      const q = w > 0 ? k / w : 1;
      const s = q * q * (3 - 2 * q);
      arcX = e.fromX + (bx - e.fromX) * s;
      arcY = e.fromY + (by - e.fromY) * s;
      return;
    }
    const q = Math.min(1, (k - w) / Math.max(1, e.span - w));
    arcX = bx + (e.targetX - bx) * q;
    arcY = by + (e.targetY - by) * q;
    return;
  }
  const u = Math.max(0, Math.min(1, k / Math.max(1, e.span)));
  const s = u * u * (3 - 2 * u);
  // The bend point: under (or over) its start, at her height, a little toward her.
  const bx = e.fromX + (e.targetX - e.fromX) * (1 - bend);
  const by = e.targetY;
  const a = (1 - s) * (1 - s);
  const b = 2 * (1 - s) * s;
  const c = s * s;
  arcX = a * e.fromX + b * bx + c * e.targetX;
  arcY = a * e.fromY + b * by + c * e.targetY;
}

/** The dive is over (or something stopped it): it hangs where it is, open. */
function stall(e: EnemyState, info: StepInfo, cause: 'done' | 'wall'): void {
  const n = frames(rowOf(info.t, e).stallFrames, 1);
  setMode(e, 'stall', n);
  e.vx = 0;
  e.vy = 0;
  e.rx = 0;
  e.ry = 0;
  info.events.push({
    type: 'enemyStall',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
    cause,
  });
}

/** Up to a perch above her, on the side it is on, to tell again. */
function climb(e: EnemyState, info: StepInfo): void {
  const t = rowOf(info.t, e);
  const p = info.state.player;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const side = e.x + e.w / 2 < px ? -1 : 1;
  setMode(e, 'pursue', 0);
  e.chase = 0;
  e.lost = 0;
  e.targetX = px + side * t.perchSidePx;
  e.targetY = py - t.perchUpPx;
  info.events.push({
    type: 'enemyClimb',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    tx: e.targetX,
    ty: e.targetY,
    dir: e.facing,
  });
}

/** It has noticed her (or is ready to go again): the tell. */
function tell(e: EnemyState, info: StepInfo): void {
  const p = info.state.player;
  // (Not at one held helpless who never saw it coming: round 4.)
  if (heldUnseen(e, p)) return;
  // (Nor into silver light: Lanternroot's moonwicks make it shy.)
  if (shyOf(e, info, p.x + p.w / 2, p.y + p.h / 2)) return;
  // (The Canopy r18, ft17d: "glowed red then hit me ... I didn't see a wind-up I could read in time": a placement may
  // make the first tell of its life longer, `firstTell` x; the ones after keep the rhythm.)
  const first =
    e.dives === 0 ? Math.max(1, info.scene.enemies?.find((q) => q.id === e.id)?.firstTell ?? 1) : 1;
  const n = frames(rowOf(info.t, e).curiousFrames * first, 1);
  setMode(e, 'curious', n);
  e.targetX = p.x + p.w / 2;
  e.targetY = p.y + p.h / 2;
  aim(e, 0, 0);
  face(e, e.targetX - (e.x + e.w / 2), 0);
  info.events.push({
    type: 'enemyNotice',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
  });
}

export const lampwing: KindRules = {
  width: (t) => t.lampwing.width,
  height: (t) => t.lampwing.height,
  hp: (t) => t.lampwing.hp,
  hurtFrames: (t) => t.lampwing.hurtFrames,
  hurtSafeFrames: (t) => t.lampwing.hurtSafeFrames,
  contactDamage: (t) => t.lampwing.contactDamage,
  deadFrames: (t) => t.lampwing.deadFrames,
  value: (t, finisher) => (finisher ? t.lampwing.valueFinisher : t.lampwing.value),

  /** The scene's `x`, `y` = its home: the centre of its box and of its territory. */
  place(e, spawn, t) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h / 2);
    e.mode = 'hover';
    e.radius = Math.max(0, spawn.radius ?? rowOf(t, e).radius);
    e.sight = Math.max(0, spawn.sight ?? 0);
    e.maxDives = Math.max(0, Math.round(spawn.dives ?? 0));
    e.side = e.facing;
    e.targetX = e.x + e.w / 2;
    e.targetY = e.y + e.h / 2;
    // Each beats out of step with the others.
    e.flap = (e.salt % 1000) / 1000;
  },

  /** Its territory plus its sight: on re-forming she is outside what it can notice from anywhere it hovers. */
  homeClear: (e, t) => e.radius + Math.max(rowOf(t, e).noticePx, e.sight),

  /** Lampwings keep a little apart: a soft push between any two closer than `sepPx`. */
  prepare(info) {
    const list = info.state.enemies;
    const t = info.t.lampwing;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (flyer(e)) {
        e.pushX = 0;
        e.pushY = 0;
      }
    }
    if (t.sepPx <= 0) return;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!flyer(a) || a.mode === 'dead') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!flyer(b) || b.mode === 'dead') continue;
        const dx = b.x + b.w / 2 - (a.x + a.w / 2);
        const dy = b.y + b.h / 2 - (a.y + a.h / 2);
        const d2 = dx * dx + dy * dy;
        if (d2 >= t.sepPx * t.sepPx) continue;
        const d = Math.sqrt(d2);
        const k = t.sepAccel * (1 - d / t.sepPx);
        // Exactly on top of each other: apart sideways, the earlier one to its own side.
        const ux = d > 0 ? dx / d : -a.side;
        const uy = d > 0 ? dy / d : 0;
        a.pushX -= ux * k;
        a.pushY -= uy * k;
        b.pushX += ux * k;
        b.pushY += uy * k;
      }
    }
  },

  /**
   * Inside a lit lantern's sanctuary its touch does nothing; nor in the first beat of its tell
   * (`noticeSafeFrames`): a hit never lands sooner after the tell than she could have answered it.
   */
  harmless(e, info) {
    const G = info.t.goal;
    // (On a rhythm only its pass through the orbit is a danger: its perch and its tell are not.)
    if (e.orbit >= 0 && (e.mode === 'perch' || e.mode === 'curious')) return true;
    // (Its pull-back is still the tell: one climbing past its perch as a pass begins is not struck, round 4.)
    if (e.orbit >= 0 && e.mode === 'dive' && e.span - e.timer < frames(rowOf(info.t, e).diveWindupFrames))
      return true;
    // (Never two strikes in one pass, round 5.)
    if (e.orbit >= 0 && e.mode === 'dive' && e.taken > 0) return true;
    if (e.mode === 'curious' && e.modeFrames <= rowOf(info.t, e).noticeSafeFrames) return true;
    // Stalled at the bottom of its dive it is open; and for a beat as it lifts away. Having given up
    // (it hangs, then flies home) it is no danger either: its dive is its attack, and a body left
    // hanging in the middle of a fight after it has hit her must not hit her again.
    if (e.mode === 'stall' || e.mode === 'rest' || e.mode === 'return') return true;
    // (One with its own dive count that has spent its pass lets her by: her climb past its hover is no hit either,
    // the Canopy's leg 3b, review r7 #9.)
    if (e.maxDives > 0 && e.noticeCd > 0) return true;
    if (e.mode === 'pursue' && e.modeFrames <= rowOf(info.t, e).climbSafeFrames) return true;
    return nearLitLantern(info.state, info.scene, G, e.x + e.w / 2, e.y + e.h / 2);
  },

  /** It is aware of her while it is after her: the tell, the dive, the stall, the climb. */
  sees(e) {
    return e.mode === 'curious' || e.mode === 'dive' || e.mode === 'stall' || e.mode === 'pursue';
  },

  /** A glint she gave reached it: one that has noticed her gives up (`gift`) and goes home; it notices nothing while the calm lasts. */
  gift(e, info) {
    if (e.mode === 'curious' || e.mode === 'pursue' || e.mode === 'dive' || e.mode === 'stall')
      giveUp(e, info, 'gift');
    return 0;
  },

  /** Its lamp went out: it leaves the room (gone at once if the lamp was already out when she came in). */
  /** A throw-cut: out of its dive or its pass (or its tell) it is knocked away, and flees once it rights itself. */
  heavy(e) {
    if (e.mode === 'dive' || e.mode === 'curious' || e.mode === 'stall') e.broken = true;
    return false;
  },

  disperse(e, info, quiet) {
    setMode(e, 'leave', frames(rowOf(info.t, e).leaveFrames, 1));
    e.chase = 0;
    e.dives = 0;
    e.roosting = false;
    if (quiet) e.gone = true;
    return 'leave';
  },

  /** One that has noticed her gives up (`calm`): it rests, flies home and notices nothing on the way. */
  calm(e, info) {
    if (e.mode === 'curious' || e.mode === 'pursue' || e.mode === 'dive' || e.mode === 'stall')
      giveUp(e, info, 'calm');
  },

  update(e, _index, info) {
    const { scene, state } = info;
    const t = rowOf(info.t, e);
    // The run is over (src/sim/goal.ts): nothing is drawn to her any more.
    const over = state.goal.gathered;
    const p = state.player;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    let beat = t.flapHover;
    if (e.noticeCd > 0) e.noticeCd--;
    SEEN = seenBy(e, info);
    e.roosting = false;

    if (e.mode === 'dead') {
      if (!e.landed) {
        e.knockVy = Math.min(t.maxFall, e.knockVy + t.gravity);
        e.vx = e.knockVx;
        e.vy = e.knockVy;
        const hit = fly(e, scene, t, e.vx, e.vy);
        if ((hit & 1) !== 0) e.knockVx = 0;
        if ((hit & 2) !== 0) {
          if (e.knockVy > 0) {
            // It has come down on something: it lies there a moment.
            e.landed = true;
            e.knockVx = 0;
            e.timer = Math.min(e.timer, frames(t.landFrames, 1) + 1);
          }
          e.knockVy = 0;
        }
        e.knockVx =
          e.knockVx > 0 ? Math.max(0, e.knockVx - t.knockDecay) : Math.min(0, e.knockVx + t.knockDecay);
      } else {
        e.vx = 0;
        e.vy = 0;
      }
      if (--e.timer <= 0) {
        e.gone = true;
        e.vx = 0;
        e.vy = 0;
        e.knockVx = 0;
        e.knockVy = 0;
      }
      return false;
    }

    // A hawker on a rhythm (area1-plan-r3 §4.3): it hunts the moths circling its lamp, a pass every period.
    if (e.orbit >= 0 && rhythm(e, info, t)) return e.mode === 'dive';

    if (e.mode === 'leave') {
      // Its lamp went out (memory/creatures.md): up and away, harmless, then gone.
      steer(e, e.side * t.leaveSpeed * 0.5, -t.leaveSpeed, t.pursueAccel);
      drift(e, scene, t);
      e.flap += t.flapPursue;
      while (e.flap >= 1) e.flap -= 1;
      if (--e.timer <= 0 || e.y + e.h < (scene.ceilingY ?? 0)) {
        e.gone = true;
        e.vx = 0;
        e.vy = 0;
      }
      return false;
    }

    // Held prey wakes it from a rest or its way home (the director's hawker hunts the caught: wood-area1-director.md).
    if (
      (e.mode === 'rest' || e.mode === 'return') &&
      t.huntCaught &&
      !over &&
      e.calm === 0 &&
      heldAt(info) !== null &&
      inLeash(e, p, t) &&
      sees(e, p, scene, t.leashPx)
    ) {
      e.dives = 0;
      tell(e, info);
    }

    if (e.mode === 'hurt') {
      // Batted along the cut, tumbling; the shove fades and stops at solids.
      e.vx = e.knockVx;
      e.vy = e.knockVy;
      const hit = fly(e, scene, t, e.vx, e.vy);
      if ((hit & 1) !== 0) e.knockVx = 0;
      if ((hit & 2) !== 0) e.knockVy = 0;
      const d = Math.max(0, t.knockDecay);
      e.knockVx = e.knockVx > 0 ? Math.max(0, e.knockVx - d) : Math.min(0, e.knockVx + d);
      e.knockVy = e.knockVy > 0 ? Math.max(0, e.knockVy - d) : Math.min(0, e.knockVy + d);
      beat = t.flapHurt;
      if (--e.timer <= 0) {
        e.knockVx = 0;
        e.knockVy = 0;
        e.vx = 0;
        e.vy = 0;
        // (A throw-cut knocked it out of its dive (`broken`): it flees for good, round 5.)
        if (e.broken) {
          e.dispersed = true;
          setMode(e, 'leave', frames(t.leaveFrames, 1));
          return true;
        }
        // Struck, it climbs to come at her again if it can see her; else home (calmed: home).
        if (!over && e.calm === 0 && inLeash(e, p, t) && sees(e, p, scene, 0)) {
          climb(e, info);
        } else {
          setMode(e, 'return', 0);
          e.lost = 0;
          e.chase = 0;
          e.targetX = e.homeX;
          e.targetY = e.homeY;
        }
      }
    } else if (e.mode === 'hover' && roosts(e, p, t)) {
      // Round 4 (giving.md): she is near and too dark to be seen: it roosts, hanging still.
      e.roosting = true;
      steer(e, 0, 0, t.roostBrake);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      beat = t.flapRoost;
    } else if (e.mode === 'hover') {
      e.wanderLeft--;
      const dx = e.targetX - (e.x + e.w / 2);
      const dy = e.targetY - (e.y + e.h / 2);
      if (e.wanderLeft <= 0 || dx * dx + dy * dy < 64) pickWander(e, scene, t);
      aim(e, t.hoverSpeed, t.arrivePx);
      const period = frames(t.bobFrames, 2);
      const bob = t.bobSpeed * wave(((state.frame + (e.salt % period)) % period) / period);
      steer(e, aimX, aimY + bob, t.hoverAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      face(e, e.vx, 0.2);
      // (The light she carries sets how far it sees her: memory/giving.md.)
      // (A moth held by a flame is the easiest prey there is: a hawker sees one anywhere in its leash.)
      const prey = t.huntCaught && heldAt(info) !== null;
      const base = (e.sight > 0 ? e.sight : t.noticePx) * seenScale(SEEN, info.t.giving);
      const sight = prey ? Math.max(base, t.leashPx) : base;
      // (For a while after she has left its leash once, only one well inside it.)
      // (One with its own dive count that has tired: not at all for a while, one pass, one dive.)
      const margin = e.noticeCd > 0 && !prey ? (e.maxDives > 0 ? t.leashPx + 1 : t.retellMarginPx) : 0;
      if (sight > 0 && !over && e.calm === 0 && inLeash(e, p, t, margin) && sees(e, p, scene, sight)) {
        e.dives = 0;
        tell(e, info);
      }
    } else if (e.mode === 'curious') {
      // The tell: it brakes, turns to her and lifts a little.
      if (sees(e, p, scene, 0)) {
        e.targetX = px;
        e.targetY = py;
      }
      aim(e, 0, 0);
      face(e, e.targetX - (e.x + e.w / 2), 0);
      steer(e, 0, -t.curiousRise, t.curiousAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      beat = t.flapCurious;
      if (--e.timer <= 0) {
        e.lost = 0;
        // The tell is over: it commits, unless her light is out, she is gone, or a lantern's light is on it.
        const G = info.t.goal;
        if (!lit(p)) giveUp(e, info, 'dark');
        else if (nearLitLantern(state, scene, G, e.x + e.w / 2, e.y + e.h / 2)) giveUp(e, info, 'calm');
        else if (nearLitLantern(state, scene, G, px, py)) giveUp(e, info, 'calm');
        else if (!inLeash(e, p, t)) giveUp(e, info, 'far');
        else startDive(e, info);
      }
    } else if (e.mode === 'dive') {
      // Committed: along the arc to where she was, whatever she does now.
      const k = e.span - e.timer + 1;
      arc(e, k, Math.max(0, Math.min(1, t.diveBend)), t);
      const cx = e.x + e.w / 2 + e.rx;
      const cy = e.y + e.h / 2 + e.ry;
      e.vx = arcX - cx;
      e.vy = arcY - cy;
      const x0 = e.x;
      const y0 = e.y;
      const hit = fly(e, scene, t, e.vx, e.vy);
      e.vx = e.x - x0;
      e.vy = e.y - y0;
      face(e, e.vx, 0.5);
      beat = t.flapDive;
      const G = info.t.goal;
      // (A lamp-room hunter's dive is committed: it reads the dark only once it hangs at the bottom.)
      if (e.sense === SENSE_WALLET && !lit(p)) giveUp(e, info, 'dark');
      else if (nearLitLantern(state, scene, G, e.x + e.w / 2, e.y + e.h / 2)) giveUp(e, info, 'calm');
      else if (--e.timer <= 0) stall(e, info, 'done');
      else if (hit !== 0 && e.vx === 0 && e.vy === 0) stall(e, info, 'wall');
    } else if (e.mode === 'stall') {
      // It hangs at the bottom of the arc, open: her opening.
      steer(e, 0, 0, t.restBrake);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      beat = t.flapStall;
      if (--e.timer <= 0) {
        if (!lit(p)) giveUp(e, info, 'dark');
        else if (!inLeash(e, p, t)) giveUp(e, info, 'far');
        else if (e.dives >= (e.maxDives > 0 ? e.maxDives : frames(t.maxDives, 1))) giveUp(e, info, 'tired');
        else climb(e, info);
      }
    } else if (e.mode === 'pursue') {
      // The climb to a perch above her, to tell again from there.
      if (sees(e, p, scene, 0)) e.lost = 0;
      else e.lost++;
      e.chase++;
      const G = info.t.goal;
      const cause: GiveUpCause | '' = !lit(p)
        ? 'dark'
        : nearLitLantern(state, scene, G, e.x + e.w / 2, e.y + e.h / 2)
          ? 'calm'
          : !inLeash(e, p, t)
            ? 'far'
            : e.lost >= frames(t.lostFrames, 1)
              ? 'lost'
              : '';
      aim(e, t.pursueSpeed, t.arrivePx);
      const arrived = aimLen < t.arrivePx;
      face(e, px - (e.x + e.w / 2), 2);
      steer(e, aimX, aimY, t.pursueAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      const hit = drift(e, scene, t);
      if (cause !== '') giveUp(e, info, cause);
      else if ((arrived || hit !== 0 || e.chase >= frames(t.pursueFrames, 1)) && e.lost === 0) {
        if (e.dives >= (e.maxDives > 0 ? e.maxDives : frames(t.maxDives, 1))) giveUp(e, info, 'tired');
        else tell(e, info);
      } else if (e.chase >= frames(t.pursueFrames, 1) + frames(t.lostFrames, 1)) giveUp(e, info, 'lost');
    } else if (e.mode === 'rest') {
      steer(e, 0, 0, t.restBrake);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      if (--e.timer <= 0) {
        setMode(e, 'return', 0);
        e.lost = 0;
        e.chase = 0;
        e.targetX = e.homeX;
        e.targetY = e.homeY;
      }
    } else {
      // `return`: home, round whatever is in the way. `lost` = frames left of a detour, `chase` = frames stuck.
      if (e.lost > 0) {
        e.lost--;
        aim(e, t.returnSpeed, 0);
        if (aimLen < CLEAR || e.lost === 0) {
          e.lost = 0;
          e.targetX = e.homeX;
          e.targetY = e.homeY;
        }
      } else aim(e, t.returnSpeed, t.arrivePx);
      steer(e, aimX, aimY, t.returnAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      const x0 = e.x;
      const y0 = e.y;
      drift(e, scene, t);
      face(e, e.vx, 0.2);
      // Not a pixel of headway for a while: something lies between it and home.
      e.chase = e.x === x0 && e.y === y0 && e.lost === 0 ? e.chase + 1 : 0;
      if (e.chase >= STUCK) detour(e, scene, t);
      const hx = e.homeX - (e.x + e.w / 2);
      const hy = e.homeY - (e.y + e.h / 2);
      if (hx * hx + hy * hy <= t.homePx * t.homePx) {
        setMode(e, 'hover', 0);
        e.lost = 0;
        e.chase = 0;
        pickWander(e, scene, t);
      }
    }

    // The wing beat follows its effort.
    if (
      !e.roosting &&
      e.mode !== 'curious' &&
      e.mode !== 'hurt' &&
      e.mode !== 'dive' &&
      e.mode !== 'stall' &&
      t.pursueSpeed > 0
    ) {
      const sp = Math.min(1, Math.sqrt(e.vx * e.vx + e.vy * e.vy) / t.pursueSpeed);
      beat = t.flapHover + (t.flapPursue - t.flapHover) * sp;
    }
    e.flap += Math.max(0, beat);
    while (e.flap >= 1) e.flap -= 1;
    return true;
  },

  /** Along the cut, whichever way it goes: it is light. */
  shove(e, dir, side, knockback, t) {
    const kb = knockback * rowOf(t, e).knockScale;
    e.knockVx = dir === 'fwd' ? side * kb : 0;
    e.knockVy = dir === 'up' ? -kb : dir === 'down' ? kb : 0;
    e.rx = 0;
    e.ry = 0;
    // A blow out of nowhere starts a fresh count of dives.
    if (e.mode === 'hover' || e.mode === 'rest' || e.mode === 'return') e.dives = 0;
    return kb;
  },

  /** Its touch hurt her: it bounces off, away from her centre, and has had enough for now. */
  touched(e, info, dir, glide) {
    if (e.mode === 'dead') return;
    const t = rowOf(info.t, e);
    const p = info.state.player;
    // (`rim`: every blow of it sends her toward the rim, up and over, never off it: the crown, round 4.)
    const rim = info.scene.enemies?.find((s) => s.id === e.id)?.rim;
    if (rim !== undefined) toRim(info, t, rim);
    // A gliding moth struck goes on her way (canopy r9b: the tunnel's hawker knocked her straight down, or back,
    // into the pit almost every crossing): thrown along her glide and lifted, so the blow costs a light, not the
    // crossing. Held, the wings open again as the stagger ends.
    const keep = glide !== 0 && rim === undefined && t.glideKnockVx > 0;
    // On a rhythm: a moth caught in the orbit as it passes is struck straight down (into the tunnel under
    // a throw gap: a pip and the slow way), and the pass goes on to the other perch.
    if (e.orbit >= 0 && e.mode === 'dive') {
      e.taken = 1;
      // (Round 5: out of the pull, and that lamp leaves her alone `passGraceFrames`: no catch, strike, catch.)
      p.lureGrace = e.orbit;
      p.lureGraceFrames = Math.max(p.lureGraceFrames, frames(t.passGraceFrames));
      if (rim !== undefined) return;
      p.pullX = 0;
      if (keep) glideKnock(p, t, glide);
      else {
        p.vx = 0;
        p.vy = t.passKnockDown;
      }
      return;
    }
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    const dy = e.y + e.h / 2 - (p.y + p.h / 2);
    const len = Math.sqrt(dx * dx + dy * dy);
    e.vx = len > 0 ? (dx / len) * t.bounceSpeed : -dir * t.bounceSpeed;
    e.vy = len > 0 ? (dy / len) * t.bounceSpeed : 0;
    e.knockVx = 0;
    e.knockVy = 0;
    giveUp(e, info, 'touch');
    // (A hawker leaves her be for a while after a hit: harmless, noticing nothing.)
    if (t.touchCalmFrames > 0) e.calm = Math.max(e.calm, frames(t.touchCalmFrames));
    // Struck out of a flame's orbit (it hunts the caught): she flies out along the throw she was aiming
    // (the arc drawn while she circles), not wherever the blow's side would have sent her (human-like r1:
    // in R8 the blow dropped her into the thorn bed under the throw gap).
    if (rim !== undefined) return;
    if (t.huntCaught && strikeOut(info)) return;
    if (keep) {
      p.pullX = 0;
      glideKnock(p, t, glide);
      return;
    }
    // A hawker blow on one standing knocks her straight up, never sideways (area1-plan-r3: the crown hawker
    // must never carry her over the rim). (`hurtPlayer` has already cleared `grounded`: read her feet.)
    if (t.straightKnock && onGround(info)) {
      p.vx = 0;
      p.pullX = 0;
    }
  },
};

/**
 * The hawker (creatures.md §2, wood.md R8 / R11): a dusk dragonfly that hunts by sight round its lamp.
 * The lampwing's tuned sim (tell, committed dive, stall, climb) on its own row (`tuning.hawker`); in a
 * lamp room it sees her only while she is lit, and as a lamp-guarder it leaves when its lamp goes out.
 */
export const hawker: KindRules = {
  ...lampwing,
  width: (t) => t.hawker.width,
  height: (t) => t.hawker.height,
  hp: (t) => t.hawker.hp,
  hurtFrames: (t) => t.hawker.hurtFrames,
  hurtSafeFrames: (t) => t.hawker.hurtSafeFrames,
  contactDamage: (t) => t.hawker.contactDamage,
  deadFrames: (t) => t.hawker.deadFrames,
  value: (t, finisher) => (finisher ? t.hawker.valueFinisher : t.hawker.value),
};
