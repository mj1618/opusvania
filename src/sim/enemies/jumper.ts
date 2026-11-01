/**
 * The jumping spider (`kind: 'jumper'`; docs/design/levels/reviews/canopy-r22-creatures.md, memory/enemies.md "The
 * jumper"): the leaper of the first area (Hollow Knight's Leaping Husk, Ori's hopper). A sight hunter under the lamp
 * rules: once it has seen her lit it keeps its distance in little step-hops, facing her; when it is ready it crouches
 * (the tell, `enemyWindup`), then pounces on a ballistic arc to where she stood as the tell closed (`enemyCharge`).
 *
 *  - The pounce lands on ground, always: the landing is a spot where its whole box stands on a top (a solid or a
 *    one-way branch) clear of solids and thorns, within `pounceMaxPx` sideways and `leapUpPx` / `leapDownPx` up or
 *    down; the arc must be clear of solids (a higher one is tried). It can leap up onto the ledge she is on.
 *  - A missed pounce leaves it open on landing (`recover`: harmless, a skid on): the punish. One that hit her lands,
 *    gathers itself and hops back.
 *  - Cut in the air (pounce, hop back), it is knocked down: it falls along the blow and lies open (`stunFrames`).
 *  - Cut on the ground (not open), it flinches and hops back out of reach (`back`), or over her when cornered: a fight
 *    is a dance. It is not invulnerable in the hop: a cut there knocks it down too. Then it may counter soon.
 *  - Fair: no attack of it lands within `health.invulnFrames + rehitGapFrames` of hurting her (the burrback's rule);
 *    nothing starts while she is held and it was off her screen (`heldUnseen`).
 *  - Dead, it is thrown along the blow, falls, skids and lies there `deadFrames` (render: on its back, legs curled).
 *
 * State (the shared flat record; what a field means for this kind):
 *  - `mode`: `sit` (idle, unaware), `hunt` (it knows her: holds its distance, waits), `skitter` (a step-hop along its
 *    ground), `windup` (the crouch), `charge` (the pounce, in the air, live), `recover` (open on the ground), `back`
 *    (a hop back or over her: in the air, harmless), `fall` (in the air with no arc: bonked, or knocked down), `hurt`,
 *    `dead`, `sleep` (its lamp is out; a cut wakes it for the fight).
 *  - `fromX, fromY` / `targetX, targetY`: a hop's or pounce's start and landing (feet centre); `span` = its frames,
 *    `timer` = frames left; `pushX` = its sideways speed (px/f), `pushY` = its starting vy (px/f).
 *  - `lookX, lookY`: where its eyes are (her body centre while it knows her). `facing`: toward her.
 *  - `landed`: on the ground. `stunned`: knocked down out of the air (it lies longer). `broken`: this pounce has hit her
 *    (harmless for the rest of it). `chargeLeft`: open frames left when a cut staggered it lying open.
 *  - `strikeCd`: frames until it may tell again. `chase`: frames since the notice (0 = unaware). `lost`: frames unseen.
 *    `roused`: a cut made it know her whatever the light. `alertCd`: frames until a rush may send it back again.
 *  - `noticeCd`: frames its touch stays harmless after it hurt her (the re-hit gap).
 *  - `keep`: 1 = cut in a hop back, it lands on its feet and comes straight back at her (no stun).
 *  - `walkLeft`: frames to its next idle hop; `rests`: hops taken (the schedule's hash); `stride`: px on the ground.
 *  - `ramSpeed`: the last blow's knockback (its death throw). `taken`: the death throw is given.
 *
 * Pure: + - * / sqrt, floor, round, min, max, abs; no RNG (a hash of its id).
 */
import { oneWayUnder, roundHalfAway, solidAt } from '../physics/aabb';
import type { Scene } from '../scene';
import type { EnemyState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { frames, heldUnseen, type KindRules, mix, type StepInfo, segmentBlocked, setMode } from './common';
import { seenBy } from './senses';

type J = Tuning['jumper'];

/** An integer in [min, max] for its n-th draw of stream k. */
function pick(e: EnemyState, k: number, min: number, max: number): number {
  const lo = frames(Math.min(min, max));
  const hi = frames(Math.max(min, max));
  return lo + (mix(e.salt + k, e.rests) % (hi - lo + 1));
}

/** Something to stand on under the 1 px column at `px` for feet at `bottom` (a solid's top or a one-way). */
function floorAt(scene: Scene, px: number, bottom: number): boolean {
  if (px < 0 || px >= scene.width) return false;
  if (solidAt(scene, px, bottom, 1, 1)) return true;
  const ows = scene.oneWays;
  for (let i = 0; i < ows.length; i++) {
    const o = ows[i];
    if (o !== undefined && o.y === bottom && px >= o.x && px < o.x + o.w) return true;
  }
  return false;
}

/** Its box would be on ground (anything under any of it). */
function under(scene: Scene, e: EnemyState): boolean {
  return solidAt(scene, e.x, e.y + e.h, e.w, 1) || oneWayUnder(scene, e.x, e.y, e.w, e.h);
}

/**
 * In a rect of thorns or a fall's catch zone (a pit), with a margin, or on the room's bottom edge: it never lands in
 * a hazard or down a pit.
 */
function inThorns(scene: Scene, x: number, y: number, w: number, h: number): boolean {
  if (y + h >= scene.height) return true;
  const th = scene.thorns;
  if (th)
    for (let i = 0; i < th.length; i++) {
      const q = th[i];
      if (q && x - 8 < q.x + q.w && q.x < x + w + 8 && y - 8 < q.y + q.h && q.y < y + h + 8) return true;
    }
  const ca = scene.catches;
  if (ca)
    for (let i = 0; i < ca.length; i++) {
      const q = ca[i];
      if (q && x - 8 < q.x + q.w && q.x < x + w + 8 && y - 8 < q.y + q.h && q.y < y + h + 8) return true;
    }
  return false;
}

/** A box of its size with its feet centre at (cx, feet) stands there: clear, both ends and the middle on ground. */
function standsAt(scene: Scene, e: EnemyState, cx: number, feet: number): boolean {
  const x0 = Math.round(cx - e.w / 2);
  if (solidAt(scene, x0, feet - e.h, e.w, e.h)) return false;
  if (!floorAt(scene, x0, feet) || !floorAt(scene, x0 + e.w - 1, feet)) return false;
  if (!floorAt(scene, x0 + (e.w >> 1), feet)) return false;
  return !inThorns(scene, x0, feet - e.h, e.w, e.h);
}

/** The top of the first surface under feet centre `cx` from `from` down to `from + down` it stands on, or -1. */
function landingY(scene: Scene, e: EnemyState, cx: number, from: number, down: number): number {
  const x0 = cx - e.w / 2;
  const x1 = cx + e.w / 2;
  let best = -1;
  const consider = (y: number): void => {
    if (y < from || y > from + down || (best >= 0 && y >= best)) return;
    if (standsAt(scene, e, cx, y)) best = y;
  };
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s !== undefined && s.x < x1 && s.x + s.w > x0) consider(s.y);
  }
  const ows = scene.oneWays;
  for (let i = 0; i < ows.length; i++) {
    const o = ows[i];
    if (o !== undefined && o.x < x1 && o.x + o.w > x0) consider(o.y);
  }
  return best;
}

// The spot `spot()` found (feet centre).
const SPOT = { x: 0, y: 0 };

/**
 * A landing near (tx, feet `ty`): straight under or at it, else up to 96 px back toward `fx` (its side), else 48 px
 * past. `down` = how far below `ty` a top may be (she is in the air: the ground under her). False if none.
 */
function spot(scene: Scene, e: EnemyState, tx: number, ty: number, fx: number, down: number): boolean {
  const toward = fx < tx ? -1 : 1;
  // 0, back 4, back 8, ... back 96; then past 4 .. 48.
  for (let j = 0; j <= 36; j++) {
    const d = (j <= 24 ? j * 4 : -(j - 24) * 4) * toward;
    const x = Math.round(tx + d);
    const y = landingY(scene, e, x, ty - 6, down + 6);
    if (y >= 0) {
      SPOT.x = x;
      SPOT.y = y;
      return true;
    }
  }
  return false;
}

/** Where its box is `k` frames into the arc it is on (top-left, rounded). */
function arcX(e: EnemyState, k: number): number {
  return roundHalfAway(e.fromX + e.pushX * k - e.w / 2);
}
function arcY(e: EnemyState, k: number, g: number): number {
  return roundHalfAway(e.fromY + e.pushY * k + (g * k * k) / 2 - e.h);
}

/**
 * Sets the arc from its feet (fx, fy) to (tx, ty) over `n` frames into `fromX..pushY` and says whether every frame
 * of it is clear of solids.
 */
function arc(
  scene: Scene,
  e: EnemyState,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  n: number,
  g: number,
) {
  e.fromX = fx;
  e.fromY = fy;
  e.targetX = tx;
  e.targetY = ty;
  e.span = n;
  e.pushX = (tx - fx) / n;
  e.pushY = (ty - fy - (g * n * n) / 2) / n;
  for (let k = 1; k < n; k++) if (solidAt(scene, arcX(e, k), arcY(e, k, g), e.w, e.h)) return false;
  return true;
}

/** Its mode now (read after a call that may have changed it: no narrowing). */
const modeOf = (e: EnemyState): EnemyState['mode'] => e.mode;

/** Its feet centre. */
const feetX = (e: EnemyState): number => e.x + e.w / 2;
const feetY = (e: EnemyState): number => e.y + e.h;

/**
 * A pounce at her from where it stands (sets the arc), or false: no ground near where she is, out of reach, too
 * close to need one, or no clear arc.
 */
function plan(e: EnemyState, info: StepInfo, J: J): boolean {
  const p = info.state.player;
  const fx = feetX(e);
  const fy = feetY(e);
  let tx = p.x + p.w / 2;
  const ty = p.y + p.h;
  const dx0 = tx - fx;
  if (Math.abs(dx0) > J.pounceMaxPx) tx = fx + (dx0 < 0 ? -J.pounceMaxPx : J.pounceMaxPx);
  // (Standing, her feet are on a top; in the air the ground under her.)
  if (!spot(info.scene, e, tx, ty, fx, p.grounded ? 8 : J.leapDownPx)) return false;
  const sx = SPOT.x;
  const sy = SPOT.y;
  const dx = sx - fx;
  const dy = sy - fy;
  if (dy < -J.leapUpPx || dy > J.leapDownPx) return false;
  if (Math.abs(dx) > J.pounceMaxPx + 4) return false;
  if (Math.abs(dx) < J.pounceMinPx && Math.abs(dy) < 48) return false;
  const n0 = frames(J.flightBase + Math.sqrt(dx * dx + dy * dy * 0.25) / Math.max(1, J.flightPerPx), 6);
  for (let k = 0; k < 3; k++) if (arc(info.scene, e, fx, fy, sx, sy, n0 + k * 6, J.gravity)) return true;
  return false;
}

/**
 * A hop along its own ground toward `dir`: the furthest landing up to `px` away (at least `min`) that it stands on
 * with a clear arc of `n` frames. `ground`: every 4 px of the way has ground under its middle (a step-hop, not a
 * jump over a gap). Sets the arc; false if none.
 */
function hopArc(
  e: EnemyState,
  info: StepInfo,
  dir: number,
  px: number,
  min: number,
  n: number,
  ground: boolean,
): boolean {
  const scene = info.scene;
  const fx = feetX(e);
  const fy = feetY(e);
  for (let d = Math.floor(px); d >= Math.max(2, min); d -= 2) {
    const tx = fx + dir * d;
    if (!standsAt(scene, e, tx, fy)) continue;
    if (ground) {
      let ok = true;
      for (let s = 4; s < d && ok; s += 4) ok = floorAt(scene, Math.round(fx + dir * s), fy);
      if (!ok) continue;
    }
    if (arc(scene, e, fx, fy, tx, fy, frames(n, 2), info.t.jumper.gravity)) return true;
  }
  return false;
}

function push(e: EnemyState, info: StepInfo, why: 'step' | 'back' | 'over' | 'idle'): void {
  info.events.push({
    type: 'enemyHop',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.targetX < e.fromX ? -1 : 1,
    px: Math.round(Math.abs(e.targetX - e.fromX)),
    frames: e.span,
    why,
  });
}

/** A step-hop toward `dir` (on its ground, low): `skitter`. False if there is no room. */
function step(e: EnemyState, info: StepInfo, dir: number, why: 'step' | 'idle'): boolean {
  const J = info.t.jumper;
  if (!hopArc(e, info, dir, J.hopPx, 6, J.hopFrames, true)) return false;
  setMode(e, 'skitter', e.span);
  e.rests++;
  push(e, info, why);
  return true;
}

/**
 * Out of reach: a hop back from her (`backPx`), or over her when cornered (less than `backMinPx` behind). False when
 * it can go neither way.
 */
function evade(e: EnemyState, info: StepInfo): boolean {
  const J = info.t.jumper;
  const p = info.state.player;
  const px = p.x + p.w / 2;
  const away = px < feetX(e) ? 1 : px > feetX(e) ? -1 : -e.facing;
  let why: 'back' | 'over' = 'back';
  if (!hopArc(e, info, away, J.backPx, J.backMinPx, J.backFrames, false)) {
    // Cornered: over her head to the far side (harmless on the way), else what little room there is behind.
    const near = Math.abs(px - feetX(e));
    const over = near + p.w / 2 + e.w / 2 + 40;
    if (
      near <= J.rushPx + 40 &&
      over <= J.overPx &&
      hopArc(e, info, -away, J.overPx, over, J.overFrames, false)
    )
      why = 'over';
    else if (!hopArc(e, info, away, J.backMinPx, 8, J.backFrames, false)) return false;
  }
  // (It keeps its eyes on her whichever way it goes: facing her.)
  e.facing = px < feetX(e) ? -1 : 1;
  setMode(e, 'back', e.span);
  e.landed = false;
  e.rests++;
  push(e, info, why);
  return true;
}

/** One frame along its arc. Returns 1 when it has landed, -1 when a solid stopped it (it falls), 0 in flight. */
function fly(e: EnemyState, info: StepInfo, J: J): number {
  const k = e.span - e.timer + 1;
  if (k >= e.span) {
    e.x = Math.round(e.targetX - e.w / 2);
    e.y = e.targetY - e.h;
    e.rx = 0;
    e.ry = 0;
    return 1;
  }
  const nx = arcX(e, k);
  const ny = arcY(e, k, J.gravity);
  if (solidAt(info.scene, nx, ny, e.w, e.h)) {
    // Bonked (a gate shut, bark grew): it drops from here.
    e.knockVx = 0;
    e.knockVy = Math.max(0, e.pushY + J.gravity * k);
    return -1;
  }
  e.x = nx;
  e.y = ny;
  e.timer--;
  return 0;
}

/** Falls under gravity with its sideways shove. Returns true when it is on ground again. */
function drop(e: EnemyState, info: StepInfo, J: J): boolean {
  const scene = info.scene;
  // Sideways first, a pixel at a time, stopped by walls.
  e.rx += e.knockVx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  const d = n < 0 ? -1 : 1;
  while (n !== 0) {
    if (solidAt(scene, e.x + d, e.y, e.w, e.h)) {
      e.knockVx = 0;
      e.rx = 0;
      break;
    }
    e.x += d;
    n -= d;
  }
  e.knockVx -= Math.sign(e.knockVx) * Math.min(Math.abs(e.knockVx), 0.08);
  e.knockVy = Math.min(J.maxFall, e.knockVy + J.gravity);
  e.ry += e.knockVy;
  let m = roundHalfAway(e.ry);
  e.ry -= m;
  if (m < 0) {
    while (m < 0) {
      if (solidAt(scene, e.x, e.y - 1, e.w, e.h)) {
        e.knockVy = 0;
        e.ry = 0;
        break;
      }
      e.y--;
      m++;
    }
    return false;
  }
  while (m > 0) {
    if (under(scene, e)) break;
    e.y++;
    m--;
  }
  if (e.knockVy >= 0 && under(scene, e)) {
    e.ry = 0;
    e.knockVy = 0;
    return true;
  }
  // (Out of the room's open bottom: gone.)
  if (e.y > scene.height + 200) e.gone = true;
  return false;
}

/** A slide along its ground (a skid, a dead body's), stopped at walls and at the brink of a drop. */
function slide(e: EnemyState, info: StepInfo): void {
  if (e.knockVx === 0) return;
  const scene = info.scene;
  e.rx += e.knockVx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  const d = n < 0 ? -1 : 1;
  const fy = feetY(e);
  while (n !== 0) {
    const nx = e.x + d;
    const lead = d > 0 ? nx + e.w - 1 - 10 : nx + 10;
    if (solidAt(scene, nx, e.y, e.w, e.h) || !floorAt(scene, lead, fy)) {
      e.knockVx = 0;
      e.rx = 0;
      break;
    }
    e.x = nx;
    e.stride += 1;
    n -= d;
  }
  const decay = Math.max(0.05, info.t.jumper.skidDecay);
  e.knockVx = e.knockVx > 0 ? Math.max(0, e.knockVx - decay) : Math.min(0, e.knockVx + decay);
}

function land(e: EnemyState, info: StepInfo, cause: 'pounce' | 'back' | 'fall', open: number): void {
  e.landed = true;
  info.events.push({
    type: 'enemyLand',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h,
    dir: e.facing,
    cause,
    hit: e.broken,
    frames: open,
  });
}

/** It sees her (lit, in range, a clear line from its eyes): the lamp rules' sight. */
function sight(e: EnemyState, info: StepInfo, J: J): boolean {
  const p = info.state.player;
  if (p.hp <= 0 || p.faded > 0 || seenBy(e, info) <= 0) return false;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const ex = feetX(e);
  const ey = e.y + 4;
  if (Math.abs(px - ex) > J.noticePx || Math.abs(py - ey) > J.noticeDyPx) return false;
  // (Her middle or her head in view: one standing on a ledge above is seen over its edge.)
  return !segmentBlocked(info.scene, ex, ey, px, py) || !segmentBlocked(info.scene, ex, ey, px, p.y + 8);
}

function face(e: EnemyState, p: PlayerState): void {
  const dx = p.x + p.w / 2 - feetX(e);
  if (dx !== 0) e.facing = dx < 0 ? -1 : 1;
  e.lookX = p.x + p.w / 2;
  e.lookY = p.y + p.h / 2;
}

/** It gives her up: back to sitting (`enemyGiveUp`). */
function giveUp(e: EnemyState, info: StepInfo, cause: 'lost' | 'far' | 'dark'): void {
  e.chase = 0;
  e.lost = 0;
  setMode(e, e.dispersed ? 'sleep' : 'sit', 0);
  e.walkLeft = pick(e, 3, info.t.jumper.idleMin, info.t.jumper.idleMax);
  info.events.push({
    type: 'enemyGiveUp',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    facing: e.facing,
    cause,
    frames: 0,
  });
}

/** Up again after lying open or a hop: back to the fight, ready again after `cd`. */
function rise(e: EnemyState, info: StepInfo, cd: number): void {
  e.stunned = false;
  e.broken = false;
  setMode(e, 'hunt', 0);
  e.strikeCd = Math.max(e.strikeCd, frames(cd));
  if (e.chase === 0) e.chase = 1;
  void info;
}

/** The tell: it crouches, eyes on the spot it will land on (`enemyWindup`). */
function tell(e: EnemyState, info: StepInfo, J: J): void {
  const n = frames(J.windupFrames, 1);
  setMode(e, 'windup', n);
  e.facing = e.targetX < feetX(e) ? -1 : 1;
  info.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
    px: Math.round(Math.abs(e.targetX - feetX(e))),
    speed: Math.abs(e.pushX),
  });
}

function hunt(e: EnemyState, info: StepInfo, J: J, seen: boolean): boolean {
  const p = info.state.player;
  const dx = p.x + p.w / 2 - feetX(e);
  face(e, p);
  if (e.mode === 'skitter') {
    const r = fly(e, info, J);
    if (r < 0) {
      setMode(e, 'fall', 0);
      e.landed = false;
    } else if (r > 0) {
      e.stride += Math.abs(e.targetX - e.fromX);
      setMode(e, 'hunt', frames(J.hopGapFrames));
    }
    return true;
  }
  if (p.hp <= 0 || p.faded > 0) {
    giveUp(e, info, 'dark');
    return false;
  }
  if (Math.abs(dx) > J.losePx) {
    giveUp(e, info, 'far');
    return false;
  }
  if (!seen && e.roused === 0 && e.lost > J.lostFrames) {
    giveUp(e, info, 'lost');
    return false;
  }
  if (e.dispersed && e.roused === 0) {
    giveUp(e, info, 'dark');
    return false;
  }
  if (e.timer > 0) {
    e.timer--;
    return true;
  }
  const ready = e.strikeCd === 0 && (seen || e.roused > 0) && !heldUnseen(e, p);
  if (ready && plan(e, info, J)) {
    tell(e, info, J);
    return true;
  }
  const adx = Math.abs(dx);
  const dir = dx < 0 ? -1 : 1;
  // Rushed: it springs back out of reach, now and then (never every time: it can be caught).
  if (adx < J.rushPx && e.alertCd === 0 && Math.abs(p.y + p.h - feetY(e)) < 120) {
    e.alertCd = frames(J.rushCdFrames);
    if (evade(e, info)) return false;
  }
  const level = Math.abs(p.y + p.h - feetY(e)) <= 48;
  if (level && adx < J.keepMinPx && step(e, info, -dir, 'step')) return true;
  if (level && adx > J.keepMaxPx && step(e, info, dir, 'step')) return true;
  e.timer = frames(J.hopGapFrames);
  return true;
}

export const jumper: KindRules = {
  width: (t) => t.jumper.width,
  height: (t) => t.jumper.height,
  hp: (t) => t.jumper.hp,
  hurtFrames: (t) => t.jumper.hurtFrames,
  hurtSafeFrames: (t) => t.jumper.hurtSafeFrames,
  contactDamage: (t) => t.jumper.contactDamage,
  deadFrames: (t) => t.jumper.deadFrames,
  value: () => 0,

  /** `x`, `y` = its feet centre, on a top. */
  place(e, spawn, t) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = spawn.y - e.h;
    e.mode = 'sit';
    e.landed = true;
    e.radius = Math.max(0, spawn.radius ?? 0);
    e.lookX = spawn.x + spawn.facing * 200;
    e.lookY = spawn.y - 40;
    e.walkLeft = pick(e, 3, t.jumper.idleMin, t.jumper.idleMax);
  },

  update(e, _index, info) {
    const J = info.t.jumper;
    const p = info.state.player;
    const x0 = e.x;
    const y0 = e.y;
    if (e.strikeCd > 0) e.strikeCd--;
    if (e.alertCd > 0) e.alertCd--;
    if (e.noticeCd > 0) e.noticeCd--;
    if (e.roused > 0) e.roused--;
    let live = true;
    const done = (): boolean => {
      e.vx = e.x - x0;
      e.vy = e.y - y0;
      return live;
    };

    if (e.mode === 'dead') {
      // Thrown along the blow as the kill's hold lets go, then it falls, skids and lies there.
      if (e.taken === 0) {
        e.taken = 1;
        const kb = Math.max(4, e.ramSpeed);
        e.knockVx = (e.hitDir || 1) * kb * J.deathKnock;
        e.knockVy = -J.deathLift;
        e.landed = false;
      }
      if (!e.landed) {
        if (drop(e, info, J)) {
          e.landed = true;
          e.knockVx *= 0.6;
        }
      } else slide(e, info);
      if (--e.timer <= 0) e.gone = true;
      live = false;
      return done();
    }

    // Ground gone from under it (bark broken, a gate opened): it falls.
    if (
      e.landed &&
      e.mode !== 'charge' &&
      e.mode !== 'back' &&
      e.mode !== 'skitter' &&
      !under(info.scene, e)
    ) {
      e.landed = false;
      e.knockVx = 0;
      e.knockVy = 0;
      if (e.mode !== 'hurt') setMode(e, 'fall', 0);
    }

    if (e.mode === 'hurt') {
      if (!e.landed) {
        // Knocked out of the air: it falls along the blow and lies open. (Cut in a hop back it lands on its feet and
        // comes straight back at her: `keep`.)
        if (drop(e, info, J)) {
          e.knockVx = 0;
          if (!e.stunned && e.keep === 1) {
            e.keep = 0;
            land(e, info, 'fall', 0);
            rise(e, info, 0);
          } else {
            e.keep = 0;
            const n = frames(e.stunned ? J.stunFrames : J.recoverFrames, 1);
            setMode(e, 'recover', n);
            land(e, info, 'fall', n);
          }
        }
        live = false;
        return done();
      }
      if (--e.timer > 0) return done();
      // The flinch is over: lying open, it lies on; otherwise it springs back out of reach.
      if (e.chargeLeft > 0) {
        setMode(e, 'recover', e.chargeLeft);
        e.chargeLeft = 0;
        live = false;
        return done();
      }
      if (!evade(e, info)) rise(e, info, J.counterFrames);
      live = modeOf(e) !== 'back';
      return done();
    }

    if (e.mode === 'fall') {
      if (drop(e, info, J)) {
        e.knockVx = 0;
        if (e.stunned) {
          const n = frames(J.stunFrames, 1);
          setMode(e, 'recover', n);
          land(e, info, 'fall', n);
        } else {
          land(e, info, 'fall', 0);
          if (e.chase > 0) rise(e, info, J.counterFrames);
          else setMode(e, e.dispersed ? 'sleep' : 'sit', 0);
        }
      }
      live = false;
      return done();
    }

    if (e.mode === 'recover') {
      // Open: harmless, every cut lands. A missed pounce skids on.
      slide(e, info);
      live = false;
      if (--e.timer <= 0) {
        const near = Math.abs(p.x + p.w / 2 - feetX(e)) < J.keepMinPx;
        const hitHer = e.broken;
        rise(e, info, pick(e, 5, J.cdMin, J.cdMax));
        // (Up again with her close, or after a pounce that hit her: it springs back first.)
        if ((near || hitHer) && p.hp > 0 && evade(e, info)) return done();
      }
      return done();
    }

    if (e.mode === 'back') {
      const r = fly(e, info, J);
      if (r < 0) {
        setMode(e, 'fall', 0);
      } else if (r > 0) {
        land(e, info, 'back', 0);
        rise(e, info, J.counterFrames);
      }
      live = false;
      return done();
    }

    if (e.mode === 'charge') {
      const r = fly(e, info, J);
      if (r < 0) {
        setMode(e, 'fall', 0);
        live = false;
      } else if (r > 0) {
        const hit = e.broken;
        const n = frames(hit ? J.touchRecoverFrames : J.recoverFrames, 1);
        setMode(e, 'recover', n);
        e.broken = hit;
        // (A miss skids on: `skidPx`, the way it flew.)
        if (!hit) e.knockVx = (e.pushX < 0 ? -1 : 1) * Math.sqrt(2 * Math.max(0.05, J.skidDecay) * J.skidPx);
        land(e, info, 'pounce', n);
        live = false;
      } else live = !e.broken;
      return done();
    }

    if (e.mode === 'windup') {
      face(e, p);
      // The landing follows her until the last `lockFrames`; then it is set (she can step off it).
      if (e.timer > frames(J.lockFrames) && p.hp > 0) {
        const keep = {
          fx: e.fromX,
          fy: e.fromY,
          tx: e.targetX,
          ty: e.targetY,
          n: e.span,
          vx: e.pushX,
          vy: e.pushY,
        };
        if (!plan(e, info, J)) {
          e.fromX = keep.fx;
          e.fromY = keep.fy;
          e.targetX = keep.tx;
          e.targetY = keep.ty;
          e.span = keep.n;
          e.pushX = keep.vx;
          e.pushY = keep.vy;
        }
      }
      e.facing = e.targetX < feetX(e) ? -1 : 1;
      if (--e.timer <= 0) {
        const n = e.span;
        setMode(e, 'charge', n);
        e.landed = false;
        e.broken = false;
        info.events.push({
          type: 'enemyCharge',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          dir: e.facing,
          px: Math.round(Math.abs(e.targetX - e.fromX)),
          frames: n,
        });
      }
      return done();
    }

    const seen = sight(e, info, J);
    e.lost = seen ? 0 : e.lost + 1;

    if (e.mode === 'sleep') {
      // Its lamp is out: asleep where it is, until a cut wakes it for the fight.
      live = false;
      if (e.roused > 0) rise(e, info, J.counterFrames);
      return done();
    }

    if (e.mode === 'sit' || (e.mode === 'skitter' && e.chase === 0)) {
      if (seen && !heldUnseen(e, p)) {
        // It has seen her: the eyes lock on, then the hunt.
        face(e, p);
        e.chase = 1;
        const n = frames(J.noticeFrames, 1);
        setMode(e, 'hunt', 0);
        e.strikeCd = Math.max(e.strikeCd, n);
        info.events.push({
          type: 'enemyNotice',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          dir: e.facing,
          frames: n,
        });
        return done();
      }
      if (e.mode === 'skitter') {
        const r = fly(e, info, J);
        if (r < 0) {
          setMode(e, 'fall', 0);
          e.landed = false;
        } else if (r > 0) {
          e.stride += Math.abs(e.targetX - e.fromX);
          setMode(e, 'sit', 0);
        }
        return done();
      }
      // Idle: a hop now and then, home-ward once it has strayed.
      if (--e.walkLeft <= 0) {
        e.walkLeft = pick(e, 3, J.idleMin, J.idleMax);
        const off = feetX(e) - e.homeX;
        const dir = Math.abs(off) > J.homePx ? (off > 0 ? -1 : 1) : mix(e.salt, e.rests) % 2 === 0 ? -1 : 1;
        if (!step(e, info, dir, 'idle')) step(e, info, -dir, 'idle');
        if (modeOf(e) === 'skitter') e.facing = e.targetX < e.fromX ? -1 : 1;
      }
      return done();
    }

    e.chase++;
    hunt(e, info, J, seen);
    const m = modeOf(e);
    live = m !== 'back' && m !== 'sit' && m !== 'sleep';
    return done();
  },

  shove(e, dir, side, knockback, t) {
    const J = t.jumper;
    e.ramSpeed = knockback;
    e.roused = Math.max(e.roused, frames(J.rouseFrames));
    if (e.chase === 0) e.chase = 1;
    // Lying open, it lies on after the flinch (the rest of its time); a second cut keeps what was left.
    // (Less the flinch: the cuts do not stretch its window.)
    if (e.mode === 'recover') e.chargeLeft = Math.max(1, e.timer - frames(J.hurtFrames));
    else if (e.mode !== 'hurt') e.chargeLeft = 0;
    // (A step-hop is on the ground: put back on it.)
    if (e.mode === 'skitter') {
      e.y = e.fromY - e.h;
      e.ry = 0;
    }
    // (A throw-cut on the ground knocks it flat: it lies open after the flinch.)
    if (e.pogoed) {
      e.pogoed = false;
      if (e.landed && e.mode !== 'charge' && e.mode !== 'back') e.chargeLeft = frames(J.stunFrames);
    }
    if (!e.landed || e.mode === 'charge' || e.mode === 'back' || e.mode === 'fall') {
      // In the air: knocked down along the blow (out of a hop back: knocked on, it lands on its feet).
      if (e.mode === 'back') e.keep = 1;
      else e.stunned = true;
      e.landed = false;
      e.chargeLeft = 0;
      e.knockVx = side * knockback * J.airKnock;
      e.knockVy = dir === 'up' ? -knockback * 0.7 : dir === 'down' ? knockback * 0.6 : -2;
      e.rx = 0;
      e.ry = 0;
      return Math.abs(e.knockVx);
    }
    e.knockVx = 0;
    e.knockVy = 0;
    return 0;
  },

  /** A throw-cut knocks it flat wherever it is: down, and lying open (the blow is dealt as usual). */
  heavy(e) {
    e.stunned = true;
    e.pogoed = true;
    return false;
  },

  /** Crouched for the pounce it takes the cut and leaps anyway (the tell is honest: cut once and get out). */
  tough: (e) => e.mode === 'windup' && !e.stunned,

  /** It knows her from the notice to giving up. */
  sees(e) {
    return e.chase > 0 && e.mode !== 'sit' && e.mode !== 'sleep' && e.mode !== 'dead';
  },

  /** Lying open, hopping off, falling, asleep, dead: no harm. A pounce that has hit her is spent. */
  harmless(e) {
    return (
      e.mode === 'recover' ||
      e.mode === 'back' ||
      e.mode === 'fall' ||
      e.mode === 'sleep' ||
      e.mode === 'dead' ||
      e.noticeCd > 0 ||
      (e.mode === 'charge' && e.broken) ||
      (e.mode === 'hurt' && !e.landed)
    );
  },

  /** It hurt her: no other attack for the re-hit gap; a pounce flies on spent, anything else springs back. */
  touched(e, info) {
    const J = info.t.jumper;
    const gap = info.t.health.invulnFrames + J.rehitGapFrames;
    e.strikeCd = Math.max(e.strikeCd, frames(gap - J.windupFrames));
    // (Nor its plain touch: she walks into it, the next hurt is the gap away.)
    e.noticeCd = Math.max(e.noticeCd, frames(gap));
    e.roused = Math.max(e.roused, frames(J.rouseFrames));
    if (e.chase === 0) e.chase = 1;
    if (e.mode === 'charge') {
      e.broken = true;
      return;
    }
    if (e.landed && e.mode !== 'recover' && e.mode !== 'hurt') evade(e, info);
  },

  /** A lantern kindled near it, or the end: it settles where it is. */
  calm(e, info, n) {
    if (!e.landed) return;
    e.chase = 0;
    setMode(e, 'sit', 0);
    e.strikeCd = Math.max(e.strikeCd, n);
    e.walkLeft = pick(e, 3, info.t.jumper.idleMin, info.t.jumper.idleMax);
  },

  /** Its lamp went out: it settles down asleep (a cut wakes it for the fight). */
  disperse(e) {
    if (e.landed && e.mode !== 'recover' && e.mode !== 'hurt') {
      e.chase = 0;
      setMode(e, 'sleep', 0);
    }
    return 'sleep';
  },
};
