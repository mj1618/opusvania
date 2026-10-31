import { homeClear, slashBlocks, slashEnemies, slashKills } from '../enemies';
import type { GlideEndReason, HurtSource, JumpKind, SimEvent, SlashDir, SlashEndReason } from '../events';
import { beatGrab, freeGrab, tickGrab } from '../grab';
import { ActionBit, axisX, type InputFrame } from '../input';
import { floorBarkAt, slashKit, thornAt } from '../kit';
import { kindle, kindleTarget, spendGlow, startGust } from '../light';
import {
  chaseCatchAt,
  chaseHoldNear,
  chaseRest,
  flameAt,
  flingAim,
  flingLaunch,
  flingTarget,
  lessonInReach,
  lurePull,
  slashLures,
  tickLures,
  trapNear,
} from '../lures';
import {
  type Body,
  type Collider,
  edgeOpen,
  kickableAt,
  moveX,
  moveY,
  noDropUnder,
  oneWayUnder,
  solidAt,
} from '../physics/aabb';
import { slashPods } from '../pods';
import type { Scene } from '../scene';
import type { EnemyState, GameState, Motion, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { type Box, slashBox } from './attack';
import type { MoveParams, SlashStep } from './params';

/**
 * The player movement controller: run with accel/decel/turn, variable-height jump, coyote time,
 * jump buffer, apex hang, double jump, dash (with dash-jump cancel), wall slide + wall jump, fast
 * fall, wing glide, one-way drop-through and three corner corrections. Everything is always enabled.
 *
 * A small state machine (normal / wallSlide / dash; the glide is a flag inside normal) run in a fixed per-frame order: freeze ->
 * latch presses -> mode update (velocity) -> move X then Y -> post (timers, ground and wall probes,
 * transitions, facing, events). All numbers come from MoveParams (tuning + assists).
 */

/** A player at rest with its feet centre at (feetX, feetY), facing right. Lifted out of any solid. */
/** A fresh player (re-formed, placed) keeps the count of her offers and the glint she let go, still in flight. */
export function keepOffer(p: PlayerState, old: PlayerState): void {
  p.offerSeq = old.offerSeq;
  p.giftTo = old.giftTo;
  p.giftIndex = old.giftIndex;
  p.giftTimer = old.giftTimer;
  p.giftFrames = old.giftFrames;
  p.giftX = old.giftX;
  p.giftY = old.giftY;
}

export function createPlayer(feetX: number, feetY: number, t: Tuning, scene: Scene): PlayerState {
  const w = t.body.width;
  const h = t.body.height;
  const x = Math.max(0, Math.min(scene.width - w, Math.round(feetX - w / 2)));
  let y = Math.round(feetY) - h;
  for (let i = 0; i < scene.height && solidAt(scene, x, y, w, h); i++) y--;
  const grounded = solidAt(scene, x, y + 1, w, h) || oneWayUnder(scene, x, y, w, h);
  return {
    x,
    y,
    rx: 0,
    ry: 0,
    w,
    h,
    vx: 0,
    vy: 0,
    facing: 1,
    mode: 'normal',
    modeFrames: 0,
    motion: grounded ? 'idle' : 'fall',
    motionFrames: 0,
    grounded,
    contactFrames: 0,
    wallDir: 0,
    inputX: 0,
    skid: false,
    dashDir: 0,
    dashTimer: 0,
    freeze: 0,
    airDash: t.dash.airDashes,
    dj: t.jump.doubleJumps,
    airTopY: y,
    gliding: false,
    attack: 'none',
    attackFacing: 1,
    attackFrames: 0,
    attackActive: false,
    attackSeq: 0,
    attackHits: 0,
    attackWall: false,
    attackHeavy: false,
    attackStep: 1,
    attackFinisher: false,
    lungeX: 0,
    hang: 0,
    hitstop: 0,
    kickX: 0,
    hp: Math.max(1, Math.round(t.health.max)),
    hpMax: Math.max(1, Math.round(t.health.max)),
    invuln: 0,
    stagger: 0,
    faded: 0,
    hurtDir: 0,
    hurtSeq: 0,
    fadeIn: 0,
    inputLock: 0,
    kindling: -1,
    kindlingLamp: -1,
    lure: -1,
    lureFrames: 0,
    lureBeats: 0,
    lureOut: 0,
    lureCd: 0,
    lurePend: 0,
    pullX: 0,
    lureGrace: -1,
    lureGraceFrames: 0,
    lureAimX: 0,
    lureAimY: -1,
    lureThrow: 0,
    lureCore: 0,
    fling: -1,
    flingFrames: 0,
    flingCd: 0,
    flingBuf: 0,
    lampArmed: false,
    lessonK: 0,
    catchK: 0,
    chainX: Math.round(feetX),
    chainY: y + h,
    lureBack: -1,
    lureArc: [],
    thrown: false,
    wingsAssist: false,
    wingsHeld: false,
    grab: -1,
    grabX: 0,
    grabY: 0,
    grabGrace: 0,
    lit: 0,
    glow: 0,
    moonlit: 0,
    mend: 0,
    lampHold: 0,
    gustCd: 0,
    gustHop: 1,
    seen: 0,
    seenLevel: 0,
    offering: 0,
    offerSeq: 0,
    giftTo: '',
    giftIndex: -1,
    giftTimer: 0,
    giftX: 0,
    giftY: 0,
    offerBuf: 0,
    offerCd: 0,
    offerHold: 0,
    giftFrames: 0,
    offerTarget: null,
    safeX: Math.round(feetX),
    safeY: y + h,
    groundX: Math.round(feetX),
    groundY: y + h,
    safeFrames: 0,
    coyote: 0,
    jumpBuf: 0,
    djBuf: 0,
    dashBuf: 0,
    forceTimer: 0,
    kick: 0,
    forceDir: 0,
    dashCd: 0,
    stick: 0,
    slideT: 0,
    retainVx: 0,
    retainTimer: 0,
    dropTimer: 0,
    dropY: 0,
    fromJump: false,
    cut: false,
    sustain: 0,
    sustainV: 0,
    framesSinceJump: 0,
    stepDist: 0,
    carried: false,
    launchY: y,
    attackBuf: 0,
    attackCd: 0,
    comboStep: 0,
    comboTimer: 0,
    hangUsed: 0,
  };
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Per-step context: everything the controller functions below share. */
class Ctx implements Collider {
  inX = 0;
  jumpPressedNow = false;
  skipMove = false;
  dashMoving = false;
  jumped = false;
  /** Her y at the start of the step (the rolling-ground snap measures the drop from it). */
  y0 = 0;

  constructor(
    readonly state: GameState,
    readonly p: PlayerState,
    readonly scene: Scene,
    readonly input: InputFrame,
    readonly prev: InputFrame,
    readonly P: MoveParams,
    readonly events: SimEvent[],
  ) {}

  pressed(bit: number): boolean {
    return (this.input & bit) !== 0 && (this.prev & bit) === 0;
  }

  held(bit: number): boolean {
    return (this.input & bit) !== 0;
  }

  get fx(): number {
    return this.p.x + this.p.w / 2;
  }

  get fy(): number {
    return this.p.y + this.p.h;
  }

  solid(x: number, y: number): boolean {
    return solidAt(this.scene, x, y, this.p.w, this.p.h);
  }

  /** A wall there that takes a slide and a kick (not a `kick: false` solid, not a dead scene edge). */
  kickable(x: number, y: number): boolean {
    return kickableAt(this.scene, x, y, this.p.w, this.p.h);
  }

  dropping(y: number): boolean {
    return this.p.dropTimer > 0 && y <= this.p.dropY;
  }

  // Collider.
  blockedX(b: Body, dir: number): boolean {
    return solidAt(this.scene, b.x + dir, b.y, b.w, b.h);
  }

  blockedY(b: Body, dir: number): boolean {
    if (solidAt(this.scene, b.x, b.y + dir, b.w, b.h)) return true;
    return dir > 0 && !this.dropping(b.y) && oneWayUnder(this.scene, b.x, b.y, b.w, b.h);
  }

  /** Standing on something if the body were at (x, y). */
  groundAt(x: number, y: number): boolean {
    if (this.solid(x, y + 1)) return true;
    return !this.dropping(y) && oneWayUnder(this.scene, x, y, this.p.w, this.p.h);
  }

  /** X blocked: dash corner correction, or ledge pop-up when airborne. */
  onBlockX(b: Body, dir: number): boolean {
    const p = this.p;
    const P = this.P;
    if (p.mode === 'dash') {
      for (let k = 1; k <= P.dashCorrectPx; k++) {
        for (let s = -1; s <= 1; s += 2) {
          const ny = b.y + s * k;
          if (!this.solid(b.x, ny) && !this.solid(b.x + dir, ny)) {
            b.y = ny;
            this.events.push({
              type: 'cornerCorrect',
              kind: 'dash',
              x: this.fx,
              y: this.fy,
              dx: 0,
              dy: s * k,
            });
            return true;
          }
        }
      }
      return false;
    }
    // Rolling ground: running into a low ledge she rises onto it, speed and grounding kept.
    if (p.grounded && p.mode === 'normal') {
      for (let k = 1; k <= P.stepUpPx; k++) {
        const ny = b.y - k;
        if (this.solid(b.x, ny)) return false;
        if (!this.solid(b.x + dir, ny)) {
          b.y = ny;
          b.ry = 0;
          return true;
        }
      }
      return false;
    }
    if (p.grounded || p.mode !== 'normal') return false;
    for (let k = 1; k <= P.ledgePopPx; k++) {
      const ny = b.y - k;
      if (this.solid(b.x, ny)) return false;
      if (!this.solid(b.x + dir, ny)) {
        b.y = ny;
        b.ry = 0;
        p.vy = Math.min(p.vy, 0);
        this.events.push({ type: 'cornerCorrect', kind: 'ledge', x: this.fx, y: this.fy, dx: 0, dy: -k });
        return true;
      }
    }
    return false;
  }

  /** Y blocked while rising: head-bump corner correction. */
  onBlockY(b: Body, dir: number): boolean {
    const p = this.p;
    if (dir > 0 || p.vy >= 0 || p.mode !== 'normal') return false;
    // Only in the vx direction when moving; both (facing first) when not.
    const d0 = p.vx > 0 ? 1 : p.vx < 0 ? -1 : p.facing;
    const both = p.vx === 0;
    for (let s = 1; s <= this.P.headCorrectPx; s++) {
      for (let i = 0; i < (both ? 2 : 1); i++) {
        const d = i === 0 ? d0 : -d0;
        const nx = b.x + d * s;
        if (!this.solid(nx, b.y - 1) && !this.solid(nx, b.y)) {
          b.x = nx;
          this.events.push({ type: 'cornerCorrect', kind: 'head', x: this.fx, y: this.fy, dx: d * s, dy: 0 });
          return true;
        }
      }
    }
    return false;
  }
}

function latch(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (c.pressed(ActionBit.jump)) {
    p.jumpBuf = P.jumpBufferFrames;
    p.djBuf = P.doubleJumpBufferFrames;
    p.carried = false; // a new hold; a ground jump it launches marks it carried again
  }
  if (c.pressed(ActionBit.dash)) p.dashBuf = P.dashBufferFrames;
  if (c.pressed(ActionBit.attack)) p.attackBuf = P.attackBuffer;
}

function endSlash(c: Ctx, reason: SlashEndReason): void {
  const p = c.p;
  if (p.attack === 'none') return;
  c.events.push({ type: 'slashEnd', x: c.fx, y: c.fy, dir: p.attack, hits: p.attackHits, reason });
  p.attack = 'none';
  p.attackActive = false;
}

/** The numbers of the slash in progress (or of the last one). */
function stepOf(c: Ctx): SlashStep {
  return c.P.steps[c.p.attackStep - 1] ?? (c.P.steps[0] as SlashStep);
}

/** The step's numbers for what it hits: a throw-cut (`attackHeavy`) hits `throwCutPower` x as hard and holds longer. */
function hitStepOf(c: Ctx): SlashStep {
  const st = stepOf(c);
  if (!c.p.attackHeavy) return st;
  const A = c.P.tuning.attack;
  const h = Math.max(0, Math.round(A.throwCutHitstop));
  return {
    ...st,
    power: st.power * Math.max(1, A.throwCutPower),
    hitstopBonus: st.hitstopBonus + h,
    hitstopFoe: st.hitstopFoe + h,
  };
}

/**
 * The slash's own clock, then a buffered press: a slash starts as soon as the cooldown allows, in
 * any mode but the dash (the press waits for the dash to end). It never locks movement.
 *
 * Combo: a forward or up slash that starts while the chain is alive (`comboTimer`) is the next
 * step, 1 -> 2 -> 3 (the finisher), then 1 again; a pause starts over at 1. A down slash is always
 * the step-1 blow (so pogo timing never changes) and leaves the chain where it was.
 */
function updateSlash(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (p.attack !== 'none') {
    const cur = stepOf(c);
    p.attackFrames++;
    if (p.attackFrames >= cur.duration) endSlash(c, 'done');
    else p.attackActive = p.attackFrames >= cur.startup && p.attackFrames < cur.startup + cur.active;
  }
  // Caught by a lure, her moves are replaced by beating free: no new slash (a press is a beat).
  if (p.attackBuf === 0 || p.attackCd > 0 || p.mode === 'dash' || p.lure >= 0 || p.grab >= 0) return;
  // Pressed together with a dash that is about to start: the dash goes first, the slash after it.
  if (p.dashBuf > 0 && p.mode === 'normal' && canDash(c)) return;
  endSlash(c, 'chain');
  // Up wins; Down only in the air (on the ground it is a forward slash, as in Hollow Knight), except over a
  // bark floor panel: standing on or beside one, ↓ + attack cuts the floor (src/sim/kit.ts `floorBarkAt`).
  const down =
    c.held(ActionBit.down) &&
    (!p.grounded || floorBarkAt(c.state, c.scene, slashBox(p, 'down', p.facing, P.tuning, 1)));
  const dir: SlashDir = c.held(ActionBit.up) ? 'up' : down ? 'down' : 'fwd';
  // A direction pressed with the slash counts at once; on a wall she already faces away from it.
  const turn = p.mode === 'normal' && p.forceTimer === 0 && c.inX !== 0;
  let step = 1;
  if (dir !== 'down') {
    step = p.comboTimer > 0 && p.comboStep > 0 && p.comboStep < P.steps.length ? p.comboStep + 1 : 1;
    p.comboStep = step;
  }
  const st = P.steps[step - 1] as SlashStep;
  p.comboTimer = st.cooldown + P.comboWindow;
  p.attack = dir;
  p.attackFacing = turn ? (c.inX > 0 ? 1 : -1) : p.facing;
  p.attackStep = step;
  p.attackFinisher = step === P.steps.length;
  p.attackFrames = 0;
  p.attackActive = st.startup === 0;
  p.attackSeq++;
  p.attackHits = 0;
  p.attackWall = false;
  // The throw-cut: a slash started in a lamp throw's launch is heavy (area 1 plan r5).
  p.attackHeavy = p.thrown && p.lureThrow > 0 && p.lure < 0;
  p.attackBuf = 0;
  p.attackCd = st.cooldown;
  // Commitment through motion: a lunge on the ground, a brief hang in the air (once per step per airtime).
  p.lungeX = dir === 'fwd' && p.grounded && p.mode === 'normal' ? p.attackFacing * st.lunge : 0;
  p.hang = 0;
  const bit = 1 << step;
  if (dir !== 'down' && !p.grounded && p.mode === 'normal' && !p.gliding && (p.hangUsed & bit) === 0) {
    p.hang = st.hangFrames;
    p.hangUsed |= bit;
  }
  c.events.push({
    type: 'slash',
    x: c.fx,
    y: c.fy,
    dir,
    facing: p.attackFacing,
    seq: p.attackSeq,
    step,
    finisher: p.attackFinisher,
    startup: st.startup,
    active: st.active,
    duration: st.duration,
    cooldown: st.cooldown,
    lunge: p.lungeX,
    hang: p.hang,
    heavy: p.attackHeavy,
  });
  if (p.attackHeavy)
    c.events.push({
      type: 'throwCut',
      x: c.fx,
      y: c.fy,
      dir,
      facing: p.attackFacing,
      seq: p.attackSeq,
      step,
    });
}

/**
 * The lunge must never be what takes her off a ledge: unless forward is held, it stops where the
 * ground does. Holding back cancels it. Runs just before the move.
 */
function guardLunge(c: Ctx): void {
  const p = c.p;
  // The recoil of a hit likewise: it never shoves her off her footing (holding that way, it may).
  if (p.kickX !== 0 && p.grounded) {
    const k = p.kickX > 0 ? 1 : -1;
    if (c.inX !== k) {
      const far = Math.ceil(Math.abs(p.vx + p.kickX));
      for (let i = 1; i <= far; i++) {
        if (!c.groundAt(p.x + k * i, p.y)) {
          p.kickX = 0;
          break;
        }
      }
    }
  }
  if (p.lungeX === 0) return;
  const d = p.lungeX > 0 ? 1 : -1;
  if (c.inX === -d) {
    p.lungeX = 0;
    return;
  }
  if (!p.grounded || c.inX === d) return;
  const reach = Math.ceil(Math.abs(p.vx + p.kickX + p.lungeX));
  for (let k = 1; k <= reach; k++) {
    if (!c.groundAt(p.x + d * k, p.y)) {
      p.lungeX = 0;
      return;
    }
  }
}

/**
 * After the move: the live hit area against everything hittable. A hit gives hitstop and a little
 * recoil; a down slash that hits is a pogo (a fixed hop that refills the air dash and double jump).
 */
function resolveSlash(c: Ctx, state: GameState, podsT: Tuning['pods']): void {
  const p = c.p;
  const P = c.P;
  if (p.attack === 'none' || !p.attackActive) return;
  const dir = p.attack;
  const st = hitStepOf(c);
  const pogo = dir === 'down' && P.pogo && !p.grounded;
  const box = slashBox(p, dir, p.attackFacing, P.tuning, p.attackStep);
  const podStop = Math.max(0, Math.round(podsT.hitstopFrames)) + st.hitstopBonus;
  const E = P.tuning.enemies;
  // (The pogo keeps its short beat: its rhythm is the bounce.)
  const foeStop = pogo
    ? Math.max(0, Math.round(E.pogoHitstopFrames))
    : Math.max(0, Math.round(E.hitstopFrames)) + st.hitstopFoe;
  const first = c.events.length;
  const foes = slashEnemies(
    state,
    c.scene,
    box,
    p.attackSeq,
    dir,
    p.attackFacing,
    pogo,
    p.attackStep,
    st.power,
    st.knockback,
    foeStop,
    P.tuning,
    c.events,
  );
  const pods = slashPods(
    state,
    c.scene,
    box,
    p.attackSeq,
    dir,
    p.attackFacing,
    pogo,
    p.attackStep,
    st.power,
    st.knockback,
    podStop,
    podsT,
    c.events,
  );
  const lures = slashLures(
    state,
    c.scene,
    box,
    p.attackSeq,
    dir,
    p.attackFacing,
    pogo,
    p.attackStep,
    st.power,
    st.knockback,
    P.tuning,
    c.events,
  );
  // The level kit (src/sim/kit.ts): thorns and seed-cases to pogo off, a seed-case's clang, rotten bark.
  const kit = slashKit(
    state,
    c.scene,
    box,
    p.attackSeq,
    dir,
    p.attackFacing,
    pogo,
    p.attackStep,
    st.power,
    st.knockback,
    P.tuning,
    c.events,
  );
  const others = foes + pods + lures.hits;
  const hits = others + kit.hits;
  // Glanced off a braced shell: no hit, but she feels it (a beat, and a throw back off it). A down
  // cut that glances (a braced or curled burrback's top) still bounces her: the pogo, nothing taken.
  const glanced = slashBlocks() > 0 && foes === 0;
  if (glanced) {
    const stop = pogo ? E.pogoHitstopFrames : E.blockHitstopFrames;
    p.hitstop = Math.max(p.hitstop, Math.max(0, Math.round(stop)));
    if (dir === 'fwd' && p.mode === 'normal') p.kickX = -p.attackFacing * E.blockRecoil;
  }
  // A seed-case's clang, when nothing else was hit: the same hold and throw as a glance.
  if (kit.clang && hits === 0) {
    p.hitstop = Math.max(p.hitstop, kit.stop);
    if (dir === 'fwd' && p.mode === 'normal') p.kickX = -p.attackFacing * P.tuning.kit.seedCase.clangRecoil;
  }
  if (hits === 0) {
    if (glanced && pogo) pogoBounce(c);
    else if (!glanced && !kit.clang && p.attackHits === 0) slashTerrain(c, box, dir, p.attackStep);
    return;
  }
  // A flame: a short beat while it holds (the pogo keeps its own), the loudest one when it goes out.
  const L = P.tuning.lures;
  const lureStop =
    lures.snuffs > 0
      ? Math.max(0, Math.round(L.snuffHitstop))
      : lures.hits > 0
        ? pogo
          ? Math.max(0, Math.round(E.pogoHitstopFrames))
          : Math.max(0, Math.round(L.hitstopFrames)) + st.hitstopBonus
        : 0;
  // The killing blow holds longer (`enemies.killHitstopBonus`: feel review problem 2).
  const killStop =
    foes > 0 && slashKills() > 0 && foeStop > 0 ? Math.max(0, Math.round(E.killHitstopBonus)) : 0;
  const hitstop = Math.max(
    foes > 0 ? foeStop + killStop : 0,
    pods > 0 ? podStop : 0,
    lureStop,
    kit.hits > 0 ? kit.stop : 0,
  );
  if (p.attackHits === 0) {
    const e = c.events[first];
    if (e?.type === 'slashHit')
      c.events.push({
        type: 'impact',
        x: e.x,
        y: e.y,
        dir,
        facing: p.attackFacing,
        step: p.attackStep,
        power: st.power,
        hits,
      });
  }
  p.attackHits += hits;
  p.hitstop = Math.max(p.hitstop, hitstop);
  if (dir === 'fwd') {
    if (p.mode === 'normal' && Math.abs(p.kickX) < (foes > 0 ? st.recoilFoe : st.recoil))
      p.kickX = -p.attackFacing * (foes > 0 ? st.recoilFoe : st.recoil);
  } else if (dir === 'up') {
    if (!p.grounded && p.mode === 'normal') p.vy += P.recoilUp;
  } else if (pogo && (others > 0 || kit.bounce || glanced)) pogoBounce(c);
}

/** Scratch for the terrain contact. */
const WALL = { x: 0, y: 0 };

/**
 * A forward or up cut that hit nothing met terrain (feel review problem 10): the first live frame its
 * area overlaps a solid (or the room's edge) on the side it swings to, once per slash. She holds
 * `attack.terrainHitstop`, a forward cut throws her back `terrainRecoil` and its lunge stops, and
 * `slashTerrain` gives render the contact point and the face's normal for sparks.
 */
function slashTerrain(c: Ctx, box: Box, dir: 'fwd' | 'up' | 'down', step: number): void {
  const p = c.p;
  if (dir === 'down' || p.attackWall) return;
  const facing = p.attackFacing;
  if (!terrainContact(c.scene, box, dir, facing, p, c.P.stepUpPx, WALL)) return;
  const A = c.P.tuning.attack;
  const stop = Math.max(0, Math.round(A.terrainHitstop));
  const recoil = dir === 'fwd' ? Math.max(0, A.terrainRecoil) : 0;
  p.attackWall = true;
  p.hitstop = Math.max(p.hitstop, stop);
  if (dir === 'fwd') {
    p.lungeX = 0;
    if (p.mode === 'normal' && Math.abs(p.kickX) < recoil) p.kickX = -facing * recoil;
  }
  c.events.push({
    type: 'slashTerrain',
    x: WALL.x,
    y: WALL.y,
    nx: dir === 'fwd' ? -facing : 0,
    ny: dir === 'fwd' ? 0 : 1,
    dir,
    facing,
    step,
    hitstop: stop,
    recoil,
  });
}

/**
 * Where a slash area meets terrain beyond her body (into `out`). `fwd`: the part of the area in front of
 * her body and above her feet less `stepUp` (the floor and a ledge she runs up are not walls); the
 * nearest face there, at that part's middle height (clamped to the solid). `up`: the part above her
 * head; the nearest underside, over her centre. Solids and the room's left / right edges (not an open
 * exit's span) count; one-ways do not. False when nothing is met.
 */
function terrainContact(
  scene: Scene,
  box: Box,
  dir: 'fwd' | 'up',
  facing: number,
  b: Body,
  stepUp: number,
  out: { x: number; y: number },
): boolean {
  const cx = b.x + b.w / 2;
  const fwd = dir === 'fwd';
  const x0 = fwd && facing > 0 ? Math.max(box.x, b.x + b.w) : box.x;
  const x1 = fwd && facing < 0 ? Math.min(box.x + box.w, b.x) : box.x + box.w;
  const y0 = box.y;
  const y1 = Math.min(box.y + box.h, fwd ? b.y + b.h - stepUp : b.y);
  if (x1 <= x0 || y1 <= y0) return false;
  const midY = (y0 + y1) / 2;
  let best = Number.POSITIVE_INFINITY;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (!s || x0 >= s.x + s.w || s.x >= x1 || y0 >= s.y + s.h || s.y >= y1) continue;
    const face = !fwd ? Math.min(y1, s.y + s.h) : facing > 0 ? Math.max(x0, s.x) : Math.min(x1, s.x + s.w);
    const dist = !fwd ? y1 - face : facing > 0 ? face - x0 : x1 - face;
    if (dist >= best) continue;
    best = dist;
    out.x = !fwd ? Math.max(s.x, Math.min(s.x + s.w, cx)) : face;
    out.y = !fwd ? face : Math.max(s.y, Math.min(s.y + s.h, midY));
  }
  // The room's outer walls (not through an open exit).
  if (fwd) {
    const edge =
      facing > 0
        ? x1 > scene.width && !edgeOpen(scene, 'e', y0, y1)
        : x0 < 0 && !edgeOpen(scene, 'w', y0, y1);
    const ex = facing > 0 ? scene.width : 0;
    const dist = facing > 0 ? ex - x0 : x1 - ex;
    if (edge && dist < best) {
      best = dist;
      out.x = ex;
      out.y = midY;
    }
  }
  return best < Number.POSITIVE_INFINITY;
}

/** The pogo: a fixed hop off what the down slash met, the air dash and double jump back. */
function pogoBounce(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (p.mode === 'wallSlide') {
    c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: p.wallDir });
    p.mode = 'normal';
    p.stick = 0;
  }
  endGlide(c, 'fastfall');
  p.vy = -P.pogoSpeed;
  p.fromJump = false;
  p.cut = false;
  p.sustain = 0;
  p.airDash = P.airDashes;
  p.dj = P.doubleJumps;
  p.hangUsed = 0;
  // (A pogo gives the gust's hop back too: Lanternroot.)
  p.gustHop = 1;
}

function jumpCommon(c: Ctx, kind: JumpKind, dir: number): void {
  const p = c.p;
  p.jumpBuf = 0;
  p.djBuf = 0;
  p.coyote = 0;
  p.grounded = false;
  p.fromJump = true;
  p.thrown = false;
  p.cut = false;
  p.sustain = c.P.sustainFrames;
  p.sustainV = p.vy;
  p.framesSinceJump = 0;
  p.kick = kind === 'wall' ? c.P.wallKickFrames : 0;
  c.jumped = true;
  endGlide(c, 'release'); // (a press needs a release first, so this is only a safeguard)
  p.retainTimer = 0; // a jump (incl. wall jump) ends wall speed retention
  c.events.push({ type: 'jump', kind, x: c.fx, y: c.fy, dir });
}

function groundJump(c: Ctx, kind: JumpKind): void {
  c.p.vy = -c.P.jumpSpeed;
  c.p.vx += c.inX * c.P.hBoost;
  // (A coyote jump is off a ledge already: there is a drop under it, so its hold glides from the apex.)
  c.p.carried = kind !== 'coyote';
  c.p.launchY = c.p.y;
  jumpCommon(c, kind, c.inX);
}

/** Nearest wall within the wall-jump grace distance: side -1/1, or 0. Ties: the wall behind facing. */
function wallInRange(c: Ctx): number {
  const p = c.p;
  if (!c.P.wallJump) return 0;
  for (let k = 1; k <= c.P.wallCheckPx; k++) {
    const r = c.kickable(p.x + k, p.y);
    const l = c.kickable(p.x - k, p.y);
    if (r && l) return -p.facing;
    if (r) return 1;
    if (l) return -1;
  }
  return 0;
}

function wallJump(c: Ctx, d: number): void {
  const p = c.p;
  const P = c.P;
  p.vx = -d * P.wallJumpVx;
  p.vy = -P.jumpSpeed;
  if (c.inX !== 0 && P.wallForceFrames > 0) {
    p.forceTimer = P.wallForceFrames;
    p.forceDir = -d;
  } else p.forceTimer = 0;
  if (P.wallJumpRefill) {
    p.airDash = P.airDashes;
    p.dj = P.doubleJumps;
  }
  if (p.mode === 'wallSlide') c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: d });
  p.mode = 'normal';
  p.stick = 0;
  p.facing = d > 0 ? -1 : 1;
  jumpCommon(c, 'wall', -d);
}

/** Landing preference: falling with ground within vy x buffer frames -> keep it buffered. */
function landingPreferred(c: Ctx): boolean {
  return c.P.landingPreference && groundSoon(c);
}

/** Falling, and the ground is within reach of the jump buffer (vy x buffer frames). */
function groundSoon(c: Ctx): boolean {
  const p = c.p;
  if (p.vy <= 0) return false;
  const dist = Math.ceil(p.vy * c.P.jumpBufferFrames);
  for (let k = 0; k <= dist; k++) {
    if (c.solid(p.x, p.y + k)) return false;
    if (c.groundAt(p.x, p.y + k)) return true;
  }
  return false;
}

/**
 * The coyote window still gives a jump: `coyote` frames left, and with the wings and no double jump in
 * hand only the first `glideCoyoteFrames` of it (later, a held press is the walk-off glide she meant;
 * with a double jump left a press in the air is a jump anyway, so the window stays whole).
 */
function coyoteJump(c: Ctx): boolean {
  const p = c.p;
  const P = c.P;
  if (p.coyote <= 0) return false;
  return !P.glide || p.dj > 0 || p.coyote > P.coyoteFrames - P.glideCoyoteFrames;
}

function tryJump(c: Ctx): void {
  const p = c.p;
  if (p.jumpBuf > 0 && (p.grounded || coyoteJump(c))) {
    const onOneWayOnly =
      p.grounded &&
      !c.solid(p.x, p.y + 1) &&
      oneWayUnder(c.scene, p.x, p.y, p.w, p.h) &&
      !noDropUnder(c.scene, c.state.save.flags, p.x, p.y, p.w, p.h);
    if (c.held(ActionBit.down) && onOneWayOnly) {
      p.dropTimer = c.P.dropThroughFrames;
      p.dropY = p.y + p.h;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.djBuf = 0;
      p.grounded = false;
      c.events.push({ type: 'dropThrough', x: c.fx, y: c.fy });
      return;
    }
    groundJump(c, !p.grounded ? 'coyote' : c.jumpPressedNow ? 'ground' : 'buffered');
    return;
  }
  if (p.jumpBuf > 0) {
    const d = wallInRange(c);
    if (d !== 0) {
      wallJump(c, d);
      return;
    }
  }
  if (p.djBuf > 0 && p.dj > 0 && !landingPreferred(c)) {
    p.vy = -c.P.doubleJumpSpeed;
    p.dj--;
    jumpCommon(c, 'double', c.inX);
  }
}

function canDash(c: Ctx): boolean {
  const p = c.p;
  return c.P.dash && p.dashCd === 0 && (p.grounded || p.airDash > 0);
}

function startDash(c: Ctx, dir: number): void {
  const p = c.p;
  const P = c.P;
  const air = !p.grounded;
  if (p.mode === 'wallSlide') c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: p.wallDir });
  endGlide(c, 'dash');
  endSlash(c, 'dash');
  p.kickX = 0;
  p.lungeX = 0;
  p.pullX = 0;
  p.hang = 0;
  p.mode = 'dash';
  p.dashDir = dir;
  p.facing = dir > 0 ? 1 : -1;
  p.dashTimer = P.dashFrames;
  p.dashCd = P.dashCooldownFrames;
  p.dashBuf = 0;
  if (air) p.airDash--;
  p.forceTimer = 0;
  p.retainTimer = 0;
  p.fromJump = false;
  p.cut = false;
  p.sustain = 0;
  p.stick = 0;
  p.vy = 0;
  c.events.push({ type: 'dashStart', x: c.fx, y: c.fy, dir, air });
  if (P.dashFreezeFrames > 0) {
    // The press frame is the first freeze frame.
    p.vx = 0;
    p.freeze = P.dashFreezeFrames - 1;
    c.skipMove = true;
  } else {
    p.vx = dir * P.dashSpeed;
    c.dashMoving = true;
  }
}

function horizontal(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (p.forceTimer > 0) return; // wall-jump force: vx held unchanged
  // Thrown by a hit: the knockback fades on its own until the last few frames, when she can steer again.
  if (p.stagger > P.steerFrames || p.faded > 0) {
    p.vx = approach(p.vx, 0, p.grounded && p.stagger === 0 ? P.groundDecel : P.hurtDecel);
    p.skid = false;
    return;
  }
  const inX = c.inX;
  const max = p.gliding ? P.glideMaxRun : P.maxRun;
  const target = inX * max;
  const turning = inX !== 0 && sign(p.vx) === -inX;
  let a: number;
  if (p.grounded) a = inX === 0 ? P.groundDecel : turning ? P.groundTurn : P.groundAccel;
  else if (p.gliding) a = inX === 0 ? P.glideDecel : turning ? P.glideTurn : P.glideAccel;
  else a = inX === 0 ? P.airDecel : turning ? P.airTurn : P.airAccel;
  if (Math.abs(p.vx) > max && sign(p.vx) === inX)
    a = p.grounded ? P.overspeedDecelGround : P.overspeedDecelAir;
  p.vx = approach(p.vx, target, a);
  const skidding = p.grounded && turning;
  if (skidding && !p.skid) c.events.push({ type: 'skid', x: c.fx, y: c.fy, dir: inX });
  p.skid = skidding;
}

function endGlide(c: Ctx, reason: GlideEndReason): void {
  c.p.wingsHeld = false;
  if (!c.p.gliding) return;
  c.p.gliding = false;
  c.events.push({ type: 'glideEnd', x: c.fx, y: c.fy, reason });
}

/** A buffered press is still waiting to become a jump: the wings stay shut so it can. */
function jumpPending(c: Ctx): boolean {
  const p = c.p;
  if (p.djBuf > 0 && p.dj > 0) return true;
  return p.jumpBuf > 0 && (coyoteJump(c) || groundSoon(c) || wallInRange(c) !== 0);
}

/**
 * Wing glide: jump held while falling. Starts and stops here (and in post: landing, wall slide;
 * startDash: dash). A hold that launched a ground jump (`carried`) only glides once she has dropped
 * below where she jumped from, so ordinary held jumps keep their arc.
 */
function updateGlide(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  const jump = c.held(ActionBit.jump);
  // The glide-lip assist: over a zone that has caught her enough, the wings need no button (src/sim/index.ts).
  const wings = jump || p.wingsAssist || p.wingsHeld;
  const want = P.glide && wings && !c.held(ActionBit.down) && !p.grounded;
  if (p.gliding) {
    if (!want) endGlide(c, wings ? 'fastfall' : 'release');
    return;
  }
  if (!want || p.vy <= P.glideMinVy) return;
  // (Not in the throw's launch: the wings open after it, so the throw is the same with jump held or not.)
  if (p.lureThrow > 0) return;
  if (p.carried && p.y < p.launchY + P.glideCarriedDropPx) return;
  if (jumpPending(c)) return;
  p.gliding = true;
  if (!jump && p.wingsAssist) p.wingsHeld = true;
  c.events.push({ type: 'glideStart', x: c.fx, y: c.fy, vy: p.vy });
}

/** Glide fall: the excess speed is shed geometrically (a catch you can see), then a steady sink. */
function glideFall(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  const over = p.vy - P.glideFall;
  if (over > 0) p.vy = Math.max(P.glideFall, p.vy - Math.max(P.glideCatchMin, over * P.glideCatchRate));
  else p.vy = Math.min(P.glideFall, p.vy + P.glideSinkAccel);
}

function gravity(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (p.gliding) {
    glideFall(c);
    return;
  }
  // The throw's launch (`lures.throwFrames`): one strength, whatever the jump button does.
  if (p.lureThrow > 0 && p.lure < 0) {
    p.vy = Math.min(p.vy + P.gravity * P.tuning.lures.launchGravity, P.maxFall);
    return;
  }
  const heldEff = c.held(ActionBit.jump);
  // variableJump off: releasing never cuts or ends the sustain (every jump is full height).
  const holdsRise = heldEff || !P.variableJump;
  // (A wall kick keeps its rise for a moment whatever the button does: a tap climbs too.)
  if (p.vy < 0 && !holdsRise && p.fromJump && p.kick === 0) p.cut = true;
  let g = P.gravity;
  if (p.vy >= 0) g *= P.fallMult;
  else if (p.cut && !P.releaseZero) g *= P.releaseMult;
  // (Not on a throw's flight: its strength never depends on the jump button.)
  if (heldEff && !p.thrown && Math.abs(p.vy) < P.apexHangVy) g *= P.apexHangMult;
  const cap = c.held(ActionBit.down) && p.vy >= P.maxFall ? P.fastFallMax : P.maxFall;
  p.vy = p.vy > cap ? approach(p.vy, cap, P.fastFallAccel) : Math.min(p.vy + g, cap);
  if (p.sustain > 0) {
    if (holdsRise) {
      p.vy = Math.min(p.vy, p.sustainV);
      p.sustain--;
    } else p.sustain = 0;
  }
  if (p.cut && P.releaseZero && p.framesSinceJump >= P.minJumpFrames && p.vy < 0) p.vy = 0;
  // Air hang of a slash: the fall is held back for a few frames. It never lifts her.
  if (p.hang > 0 && p.vy > P.hangVy) p.vy = P.hangVy + (p.vy - P.hangVy) * P.hangKeep;
  // The first fling's lesson (`Lure.lesson`, the Canopy r10): in its reach, her fall slows to a drift.
  // (`lessonK` eases in over `lessonEase` frames near the flame and out away from it: her caps across and down go from
  // the usual to `lessonRun` / `lessonFall` with it, so the slowing reads as time thickening, not a wall.)
  const L = P.tuning.lures;
  const ease = 1 / Math.max(1, L.lessonEase);
  const near = !p.grounded && !p.thrown && lessonInReach(c.state, c.scene, P.tuning);
  p.lessonK = near ? Math.min(1, p.lessonK + ease) : Math.max(0, p.lessonK - ease);
  if (p.lessonK > 0) {
    const capX = P.maxRun + (L.lessonRun - P.maxRun) * p.lessonK;
    let capY = P.maxFall + (L.lessonFall - P.maxFall) * p.lessonK;
    // (The Canopy r15, review r14 #5: put back at a chase's hook she hangs on it, not drifts off it.)
    if (near && chaseHoldNear(c.state, c.scene, P.tuning)) {
      const hang = P.tuning.kit.firefly.backFall;
      capY = P.maxFall + (hang - P.maxFall) * p.lessonK;
    }
    if (Math.abs(p.vx) > capX) p.vx = p.vx > 0 ? capX : -capX;
    if (p.vy > capY) p.vy = capY;
  }
}

function normal(c: Ctx): void {
  updateGlide(c);
  horizontal(c); // a
  gravity(c); // b (a jump below overwrites vy, which is the same as skipping gravity)
  if (c.p.dashBuf > 0 && canDash(c)) {
    startDash(c, c.inX !== 0 ? c.inX : c.p.facing); // c
    return;
  }
  tryJump(c); // d
}

function wallSlide(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  const d = p.wallDir;
  if (p.jumpBuf > 0) wallJump(c, d);
  else if (p.dashBuf > 0 && canDash(c)) startDash(c, -d);
  else {
    p.stick = c.inX === -d ? p.stick + 1 : 0;
    if (p.stick > P.stickFrames) {
      c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: d });
      p.mode = 'normal';
      p.stick = 0;
      normal(c);
    } else {
      p.vx = 0;
      const cap = Math.min(P.slideMax, P.slideStartMax + P.slideRamp * p.slideT);
      p.slideT++;
      p.vy = p.vy > cap ? Math.max(p.vy - P.slideDecel, cap) : Math.min(p.vy + P.gravity * P.fallMult, cap);
    }
  }
}

function dash(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (P.dashJumpCancel && p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
    c.events.push({ type: 'dashEnd', x: c.fx, y: c.fy, dir: p.dashDir });
    p.mode = 'normal';
    p.dashTimer = 0;
    groundJump(c, 'dashJump');
    p.vx = p.dashDir * P.dashJumpVx;
  } else {
    p.vx = p.dashDir * P.dashSpeed;
    p.vy = 0;
    c.dashMoving = true;
  }
}

/**
 * One sim frame for the player. `state.prevInput` is the previous frame's mask (for edges); the
 * caller sets it to `input` afterwards. Returns false when hitstop held her (nothing of hers ran).
 */
export function updatePlayer(
  state: GameState,
  scene: Scene,
  input: InputFrame,
  P: MoveParams,
  podsT: Tuning['pods'],
  events: SimEvent[],
): boolean {
  const p = state.player;
  const mode0 = p.mode;
  const motion0 = p.motion;
  const grounded0 = p.grounded;
  const facing0 = p.facing;
  // (Held by a hitstop her i-frames stand still: a blow's hold costs her none of them.)
  if (p.invuln > 0 && p.hitstop === 0) p.invuln--;
  // Back from a hazard or a fade (`freshStart`): the fade-in takes no input at all, and a button she
  // held as she came back is never a press until it has been let go (its hold still counts: held right
  // she runs, held jump she glides off the lip, the safe line; she never re-jumps by itself).
  if (p.inputLock !== 0) p.inputLock &= input;
  let fresh = input;
  if (p.fadeIn > 0) {
    p.fadeIn--;
    fresh = 0;
  }
  // Out of control: thrown by a hit (directions come back for the tail of it), or faded.
  const sides = ActionBit.left | ActionBit.right;
  const eff = p.faded > 0 || p.stagger > P.steerFrames ? 0 : p.stagger > 0 ? fresh & sides : fresh;
  tickLures(state, scene, P.tuning, events);
  tickGrab(p);
  const c = new Ctx(state, p, scene, eff, state.prevInput | p.inputLock, P, events);
  c.inX = axisX(eff);
  p.inputX = c.inX;
  // Hitstop: a slash connected. She holds for a beat; presses are still buffered.
  if (p.hitstop > 0) {
    p.hitstop--;
    latch(c);
    return false;
  }
  controller(c);
  resolveSlash(c, state, podsT);
  if (p.stagger > 0) p.stagger--;

  // Animation bookkeeping: what the body is doing and for how long.
  p.modeFrames = p.mode === mode0 ? p.modeFrames + 1 : 0;
  p.contactFrames = p.grounded === grounded0 ? p.contactFrames + 1 : 0;
  const motion = motionOf(p);
  p.motionFrames = motion === motion0 ? p.motionFrames + 1 : 0;
  p.motion = motion;
  if (p.facing !== facing0)
    events.push({ type: 'turn', x: c.fx, y: c.fy, dir: p.facing, grounded: p.grounded });
  return true;
}

function motionOf(p: PlayerState): Motion {
  if (p.mode === 'dash') return 'dash';
  if (p.mode === 'wallSlide') return 'wallSlide';
  if (!p.grounded) return p.gliding ? 'glide' : p.vy < 0 ? 'rise' : 'fall';
  if (p.skid) return 'skid';
  return p.inputX !== 0 || p.vx !== 0 ? 'run' : 'idle';
}

function controller(c: Ctx): void {
  const { p, P, events } = c;

  // 1. Freeze (dash start): nothing moves, but presses are latched and the dash cooldown runs.
  if (p.freeze > 0) {
    p.freeze--;
    latch(c);
    if (p.dashCd > 0) p.dashCd--;
    if (p.attackCd > 0) p.attackCd--;
    if (p.comboTimer > 0) p.comboTimer--;
    return;
  }

  // 2. Latch presses into buffers.
  latch(c);
  c.jumpPressedNow = c.pressed(ActionBit.jump);
  // A grab (src/sim/grab.ts): she is held where it took her and beats free (the slash clock runs inside).
  const held = p.grab >= 0;
  if (held && caught(c)) return;
  // The fling off a lamp: aiming, she holds (the launch lets the ordinary step below run on).
  if (!held && fling(c)) return;
  // The rest of the Lamp button in a glow room (Lanternroot): kindle, mend, gust.
  if (!held && c.scene.glow) lampVerb(c);
  if (!held) updateSlash(c);
  const wasGrounded = p.grounded;
  const x0 = p.x;
  c.y0 = p.y;
  const vy0 = p.vy;

  // Wall speed retention: a wall zeroed vx recently and has gone -> restore it. Moving the other
  // way cancels it (Celeste does the same); otherwise it undoes wall jumps and turn-arounds.
  if (p.retainTimer > 0 && p.vx !== 0 && sign(p.vx) !== sign(p.retainVx)) p.retainTimer = 0;
  if (p.retainTimer > 0 && p.mode !== 'dash' && !c.blockedX(p, sign(p.retainVx))) {
    p.vx = p.retainVx;
    p.retainTimer = 0;
  }

  // 3. Mode update.
  if (p.mode === 'normal') normal(c);
  else if (p.mode === 'wallSlide') wallSlide(c);
  else if (p.mode === 'dash') dash(c);

  // The lures' pull bends what the mode made of her velocity (memory/lures.md).
  pull(c);
  catchHook(c);

  // 4. Move X then Y, with corner corrections.
  let impactVy = 0;
  if (!c.skipMove) {
    guardLunge(c);
    if (moveX(p, p.vx + p.kickX + p.lungeX + p.pullX, c)) {
      p.kickX = 0;
      p.lungeX = 0;
      p.pullX = 0;
      if (P.wallRetainFrames > 0 && p.retainTimer === 0 && p.vx !== 0 && p.mode !== 'dash') {
        p.retainVx = p.vx;
        p.retainTimer = P.wallRetainFrames;
      }
      if (p.mode !== 'dash') p.vx = 0;
    }
    // The canopy: the closer her head is to it, the slower she can rise. A soft stop, not a bump.
    if (p.vy < 0 && c.scene.ceilingY !== undefined) {
      const cap = Math.max(0, p.y - c.scene.ceilingY) * P.ceilingRate;
      if (-p.vy > cap) {
        p.vy = -cap;
        p.sustain = 0;
      }
    }
    const vyBefore = p.vy;
    if (moveY(p, p.vy, c)) {
      if (p.vy < 0) {
        events.push({ type: 'headBump', x: c.fx, y: p.y });
        p.cut = false;
        p.sustain = 0;
      } else impactVy = vyBefore;
      p.vy = 0;
    }
  }
  post(c, wasGrounded, x0, impactVy);
  if (!p.grounded && !wasGrounded && vy0 < 0 && p.vy >= 0 && !c.jumped)
    events.push({ type: 'apex', x: c.fx, y: c.fy });
}

/**
 * The pull of the lures (src/sim/lures.ts) on what the mode made of her velocity. In the air: the
 * vertical part into `vy`, the sideways part into `pullX` (kept `pullXKeep` a frame). On the ground:
 * `pullX` eases toward a weak drag while she holds a direction (standing still she never drifts), so
 * she can always walk away. A gliding body feels `glidePullMult` of it. Not in a dash (it ignores the
 * pull) or on a wall (she clings).
 */
function pull(c: Ctx): void {
  const p = c.p;
  const L = c.P.tuning.lures;
  if (p.mode !== 'normal') {
    p.pullX = 0;
    return;
  }
  const a = lurePull(c.state, c.scene, c.P.tuning);
  if (p.grounded) {
    const drag = c.inX === 0 ? 0 : Math.max(-L.groundMax, Math.min(L.groundMax, a.ax * L.groundDrag));
    p.pullX = approach(p.pullX, drag, L.groundDecel);
    return;
  }
  const m = p.gliding ? L.glidePullMult : 1;
  p.pullX = Math.max(-L.pullXMax, Math.min(L.pullXMax, p.pullX * L.pullXKeep + a.ax * m));
  p.vy += a.ay * m;
}

/**
 * The Canopy r15 (review r14 #5): a chase's next hook (`Lure.hook`): her flight eases as she comes into its reach, a
 * beat to press, her fling's launch included (after the pull: the mode's velocity, the throw's too).
 */
function catchHook(c: Ctx): void {
  const p = c.p;
  const K = c.P.tuning.kit.firefly;
  const ce = 1 / Math.max(1, K.catchEase);
  const i =
    p.mode === 'normal' && !p.grounded && p.fling < 0 ? chaseCatchAt(c.state, c.scene, c.P.tuning) : -1;
  p.catchK = i >= 0 ? Math.min(1, p.catchK + ce) : Math.max(0, p.catchK - ce);
  if (p.catchK <= 0) return;
  const k = p.catchK * 0.35;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const across = p.vx + p.pullX;
  const l = i >= 0 ? c.scene.lures?.[i] : undefined;
  if (l && chaseRest(c.state, c.scene, i)) {
    // (A rest of the chase: she drifts onto the hook and hangs there, a breath, until she presses.)
    const f = flameAt(c.state.lures, i, l, c.state.frame, c.P.tuning, FLAME);
    const tx = clamp((f.x - (p.x + p.w / 2)) * 0.08, -K.restRun, K.restRun);
    const ty = clamp((f.y - (p.y + p.h / 2)) * 0.08, -K.restRise, K.restRun) + K.restFall;
    p.vy -= c.P.gravity * p.catchK;
    p.pullX += (tx - across) * k;
    p.vy += (ty - p.vy) * k;
    return;
  }
  // (Her speed across is her run plus the fling's pull: the two together eased to `catchRun`.)
  p.pullX += (clamp(across, -K.catchRun, K.catchRun) - across) * k;
  // (Gravity thinned so she floats into its reach; her rise eased to `catchRise`, her fall to `catchFall`.)
  p.vy -= c.P.gravity * K.catchFloat * p.catchK;
  if (p.vy > K.catchFall) p.vy += (K.catchFall - p.vy) * k;
  else if (p.vy < -K.catchRise) p.vy += (-K.catchRise - p.vy) * k;
}

/** Scratch for the orbit step and the throw's aim. */
const AIM_NOW = { x: 0, y: 0 };
const FLAME = { x: 0, y: 0 };

/**
 * One frame caught by a lure. A dash (owned, ready) frees her at once and the dash starts as usual; a
 * press of jump or the blade (buffered, `beatCd` apart) is a beat, and the last beat throws her (the
 * rest of the step runs on from the throw). Otherwise she circles the flame. Returns true when the
 * frame was spent circling.
 */
function caught(c: Ctx): boolean {
  const p = c.p;
  const P = c.P;
  const t = P.tuning;
  const L = t.lures;
  p.lureFrames++;
  if (p.lureCd > 0) p.lureCd--;
  // A slash already swinging plays out; no new one starts.
  updateSlash(c);
  // A dash frees her even with the air dash spent (the hold gives it back: forgiving).
  if (p.dashBuf > 0 && P.dash && p.dashCd === 0) {
    freeGrab(c.state, t, 'dash', c.events);
    p.airDash = Math.max(p.airDash, 1);
    return false;
  }
  // Presses of jump or the blade are beats: queued (up to `beatQueue`), so a mash faster than
  // `beatCd` is never lost; one buffered just before the grab counts as the first.
  const now = c.pressed(ActionBit.jump) || c.pressed(ActionBit.attack);
  const early = p.lureFrames === 1 && !now && (p.jumpBuf > 0 || p.attackBuf > 0);
  if (now || early) p.lurePend = Math.min(Math.max(1, Math.round(L.beatQueue)), p.lurePend + 1);
  p.jumpBuf = 0;
  p.djBuf = 0;
  p.attackBuf = 0;
  const aimY = (c.held(ActionBit.down) ? 1 : 0) - (c.held(ActionBit.up) ? 1 : 0);
  if (p.lurePend > 0 && p.lureCd === 0) {
    p.lurePend--;
    if (beatGrab(c.state, t, c.events, c.inX, aimY)) {
      p.airDash = P.airDashes;
      p.dj = P.doubleJumps;
      p.grounded = false;
      p.fromJump = false;
      p.sustain = 0;
      return false;
    }
  }
  // A grab holds her where it took her.
  p.pullX = 0;
  p.kickX = 0;
  p.lungeX = 0;
  p.vx = 0;
  p.vy = 0;
  p.grounded = false;
  p.coyote = 0;
  p.airTopY = p.y;
  tickHeld(p);
  return true;
}

/** The timers that run while she is held (a grab, a fling's aim). */
function tickHeld(p: PlayerState): void {
  if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.djBuf > 0) p.djBuf--;
  if (p.dashBuf > 0) p.dashBuf--;
  if (p.attackBuf > 0) p.attackBuf--;
  if (p.attackCd > 0) p.attackCd--;
  if (p.comboTimer > 0) p.comboTimer--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.kick > 0) p.kick--;
  if (p.forceTimer > 0) p.forceTimer--;
}

/**
 * The fling (memory/lures.md; Matt's play, 2026-10-18: Ori's Bash in place of the catch). Lamp pressed within a
 * burning flame's `fling` radius snaps the moment: she holds where she is (the world slows: `step`) and aims
 * with the stick; Lamp let go, or `flingFrames` up, flings her along the aim and the flame goes out behind her.
 * Returns true while she is aiming (the frame is spent holding).
 */
function fling(c: Ctx): boolean {
  const p = c.p;
  const P = c.P;
  const t = P.tuning;
  const L = t.lures;
  if (p.flingCd > 0) p.flingCd--;
  const aimY = (c.held(ActionBit.down) ? 1 : 0) - (c.held(ActionBit.up) ? 1 : 0);
  if (p.fling < 0) {
    // A press in the cooldown after a fling waits `flingBufferFrames` while Lamp is held (canopy r9b: the gap's second
    // lamp comes into reach 5 frames after the first's release, inside the cooldown, and an early press was eaten). A
    // press out of the cooldown is taken now or not at all (the glow rooms' Lamp verbs take it: lampVerb).
    // (`flingBuf` counts the frames the press may still start one, this one included.)
    // (The Canopy r10, `heldPress`: a press with no flame in reach, held on, waits for the first flame to come into
    // reach. Not in a glow room: Lanternroot's Lamp is held to mend.)
    if (c.pressed(ActionBit.lamp)) {
      p.flingBuf = p.flingCd > 0 ? 1 + Math.max(0, Math.round(L.flingBufferFrames)) : 1;
      p.lampArmed = !!L.heldPress && !c.scene.glow;
    } else if (!c.held(ActionBit.lamp)) {
      p.flingBuf = 0;
      p.lampArmed = false;
    }
    const armed = p.lampArmed && c.held(ActionBit.lamp);
    if (p.flingBuf <= 0 && !armed) return false;
    if (p.flingBuf > 0) p.flingBuf--;
    if (p.flingCd > 0 || p.mode === 'dash' || p.stagger > 0) return false;
    const i = flingTarget(c.state, c.scene, t);
    const l = i >= 0 ? c.scene.lures?.[i] : undefined;
    if (!l) {
      // (The Canopy r16: a press by a cage, which is never a springboard, is answered: "not like that".)
      if (c.pressed(ActionBit.lamp)) {
        const k = trapNear(c.state, c.scene, t);
        const q = k >= 0 ? c.scene.lures?.[k] : undefined;
        if (q) {
          const f = flameAt(c.state.lures, k, q, c.state.frame, t, FLAME);
          c.events.push({ type: 'lureRefuse', id: q.id, x: f.x, y: f.y, side: c.fx < f.x ? -1 : 1 });
        }
      }
      return false;
    }
    p.flingBuf = 0;
    p.lampArmed = false;
    // (The lesson's drift ends with the press: the flight she aims is the flight she gets, as the arc shows it.)
    p.lessonK = 0;
    p.fling = i;
    p.flingFrames = 0;
    endGlide(c, 'lure');
    if (p.mode === 'wallSlide') {
      c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: p.wallDir });
      p.mode = 'normal';
    }
    const f = flameAt(c.state.lures, i, l, c.state.frame, t, FLAME);
    c.events.push({ type: 'flingStart', id: l.id, x: f.x, y: f.y, frames: Math.round(L.flingFrames) });
  }
  p.flingFrames++;
  const gone = (c.state.lures.hp[p.fling] ?? 0) <= 0;
  if (gone) {
    p.fling = -1;
    p.flingFrames = 0;
    return false;
  }
  // (The Canopy r15, review r14 #5: a chase's hook pulls her onto its flame while she aims, and she is flung from it:
  // a late press flies the line an early one does.)
  const hl = c.scene.lures?.[p.fling];
  const launch = !c.held(ActionBit.lamp) || p.flingFrames >= Math.max(1, Math.round(L.flingFrames));
  if (hl?.hook) {
    const f = flameAt(c.state.lures, p.fling, hl, c.state.frame, t, FLAME);
    const k = launch ? 1 : t.kit.firefly.hookPull;
    const nx = Math.round(p.x + (f.x - (p.x + p.w / 2)) * k);
    const ny = Math.round(p.y + (f.y - (p.y + p.h / 2)) * k);
    if (!solidAt(c.scene, nx, ny, p.w, p.h)) {
      p.x = nx;
      p.y = ny;
    }
  }
  if (launch) {
    flingLaunch(c.state, c.scene, t, c.events, c.inX, aimY);
    p.airDash = P.airDashes;
    p.dj = P.doubleJumps;
    p.grounded = false;
    p.fromJump = false;
    p.sustain = 0;
    p.jumpBuf = 0;
    p.djBuf = 0;
    return false;
  }
  // Aiming: she holds still; the arrow is the aim.
  const a = flingAim(c.state, c.scene, t, c.inX, aimY, AIM_NOW);
  p.lureAimX = a.x;
  p.lureAimY = a.y;
  p.pullX = 0;
  p.kickX = 0;
  p.lungeX = 0;
  p.vx = 0;
  p.vy = 0;
  p.coyote = 0;
  p.airTopY = p.y;
  tickHeld(p);
  return true;
}

/**
 * The Lamp button's other verbs in a glow room (docs/design/levels/proto-1.md §3 "Controls on one button"), after
 * the fling had its chance (a burning flame in reach takes the press first):
 *  1. a cold moonwick in reach, Kindle owned: **kindle** it (too little glow: `kindleRefuse`, nothing else);
 *  2. nothing in reach, held `glow.tapFrames`, grounded, still: **mend** (`mendStart`; it lands at
 *     `glow.mendFrames`: `glow.mendCost` for 1 light; held on, it mends again). Any other input, a hurt or the air
 *     breaks it (`mendBreak`), nothing spent;
 *  3. nothing in reach, a tap (let go within `tapFrames`), Gust owned: **gust** along the held direction.
 */
function lampVerb(c: Ctx): void {
  const p = c.p;
  const t = c.P.tuning;
  const G = t.glow;
  const st = c.state;
  const owns = (a: string) => (st.save.abilities as readonly string[]).includes(a);
  const tap = Math.max(1, Math.round(G.tapFrames));
  const aimY = (c.held(ActionBit.down) ? 1 : 0) - (c.held(ActionBit.up) ? 1 : 0);
  if (c.pressed(ActionBit.lamp)) {
    // (A press the fling refused, or a fresh one: a cold moonwick in reach takes it.)
    const k = owns('kindle') ? kindleTarget(st, c.scene, t) : -1;
    if (k >= 0) {
      kindle(st, c.scene, k, t, c.events);
      p.lampHold = -1;
      return;
    }
    p.lampHold = 1;
    p.lureAimX = c.inX;
    p.lureAimY = aimY;
    return;
  }
  if (c.held(ActionBit.lamp)) {
    if (p.lampHold <= 0) return;
    p.lampHold++;
    // (The way a tap will gust: the direction held through it, kept in the fling's aim fields.)
    if (c.inX !== 0 || aimY !== 0) {
      p.lureAimX = c.inX;
      p.lureAimY = aimY;
    }
    const others = c.input & ~ActionBit.lamp;
    if (p.mend > 0) {
      const why =
        others !== 0
          ? 'input'
          : !p.grounded
            ? 'air'
            : p.hp >= p.hpMax
              ? 'full'
              : p.glow < G.mendCost
                ? 'empty'
                : '';
      if (why !== '') {
        p.mend = 0;
        p.lampHold = -1;
        c.events.push({ type: 'mendBreak', why, x: c.fx, y: p.y + p.h / 2 });
        return;
      }
      p.mend++;
      if (p.mend >= Math.max(tap + 1, Math.round(G.mendFrames))) {
        spendGlow(st, Math.max(0, Math.round(G.mendCost)), 'mend', c.events);
        p.hp = Math.min(p.hpMax, p.hp + 1);
        c.events.push({ type: 'mend', hp: p.hp, glow: p.glow, x: c.fx, y: p.y + p.h / 2 });
        // (Held on, the next mend starts its channel over.)
        p.mend = 0;
        p.lampHold = 1;
      }
      return;
    }
    if (
      p.lampHold >= tap &&
      others === 0 &&
      p.grounded &&
      p.vx === 0 &&
      p.mode === 'normal' &&
      p.hp < p.hpMax &&
      p.glow >= G.mendCost
    ) {
      p.mend = tap;
      c.events.push({
        type: 'mendStart',
        frames: Math.max(1, Math.round(G.mendFrames) - tap),
        x: c.fx,
        y: p.y + p.h / 2,
      });
    }
    return;
  }
  // Let go.
  if (p.mend > 0) {
    p.mend = 0;
    c.events.push({ type: 'mendBreak', why: 'input', x: c.fx, y: p.y + p.h / 2 });
  } else if (p.lampHold > 0 && p.lampHold <= tap && owns('gust') && p.gustCd === 0) {
    // (Held now, else held during the tap.)
    const held = c.inX !== 0 || aimY !== 0;
    startGust(st, t, held ? c.inX : p.lureAimX, held ? aimY : p.lureAimY, c.events);
  }
  p.lampHold = 0;
}

/** 5. Post: timers, ground probe, walls, transitions, facing, events. */
function post(c: Ctx, wasGrounded: boolean, x0: number, impactVy: number): void {
  const p = c.p;
  const P = c.P;
  const { events } = c;
  if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.djBuf > 0) p.djBuf--;
  if (p.dashBuf > 0) p.dashBuf--;
  // A slash pressed during a dash waits for it: it fires on the first frame after.
  if (p.attackBuf > 0 && p.mode !== 'dash') p.attackBuf--;
  if (p.attackCd > 0) p.attackCd--;
  if (p.comboTimer > 0) p.comboTimer--;
  if (p.kickX !== 0) p.kickX = approach(p.kickX, 0, P.recoilDecay);
  if (p.lungeX !== 0) p.lungeX = approach(p.lungeX, 0, stepOf(c).lunge / P.lungeFrames);
  if (p.hang > 0) p.hang--;
  if (p.forceTimer > 0) p.forceTimer--;
  if (p.kick > 0) p.kick--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.dropTimer > 0) p.dropTimer = p.y > p.dropY ? 0 : p.dropTimer - 1;
  if (p.retainTimer > 0) p.retainTimer--;
  p.framesSinceJump++;

  if (c.dashMoving) {
    p.dashTimer--;
    if (p.dashTimer <= 0) {
      p.mode = 'normal';
      p.vx = p.dashDir * P.dashEndVx;
      events.push({ type: 'dashEnd', x: c.fx, y: c.fy, dir: p.dashDir });
    }
  }

  // Rolling ground: on the ground last frame, not now, and the ground only a few px lower: follow it down.
  if (wasGrounded && !c.jumped && p.vy >= 0 && p.mode !== 'wallSlide' && !c.groundAt(p.x, p.y)) {
    // Measured from where she stood: gravity's pull this frame counts toward the drop.
    for (let k = 1; p.y + k - c.y0 <= P.snapDownPx; k++) {
      if (c.solid(p.x, p.y + k)) break;
      if (c.groundAt(p.x, p.y + k)) {
        p.y += k;
        p.ry = 0;
        p.vy = 0;
        break;
      }
    }
  }
  p.grounded = p.vy >= 0 && c.groundAt(p.x, p.y);
  if (p.grounded) {
    p.thrown = false;
    // Coyote: N usable airborne frames after the frame that left the ground.
    p.coyote = P.coyoteFrames;
    p.airDash = P.airDashes;
    p.dj = P.doubleJumps;
    endGlide(c, 'land');
    p.hang = 0;
    p.hangUsed = 0;
    p.carried = false; // still held after landing: walking off an edge glides straight away
    if (!wasGrounded) {
      const fallPx = p.y - p.airTopY;
      // A move that ends exactly on the ground is not "blocked": the speed is still in vy.
      const impact = impactVy > 0 ? impactVy : p.vy;
      const hard = fallPx >= P.hardLandFallPx;
      events.push({ type: 'land', x: c.fx, y: c.fy, vy: impact, fallPx, hard });
      p.stepDist = 0;
    }
    p.airTopY = p.y;
  } else {
    if (wasGrounded && !c.jumped && p.mode === 'normal') events.push({ type: 'fall', x: c.fx, y: c.fy });
    if (!wasGrounded && p.coyote > 0) p.coyote--;
    // The wings carry her: the fall height (hard landings) counts from where they let go.
    if (p.y < p.airTopY || p.gliding) p.airTopY = p.y;
    p.skid = false;
  }
  if (p.vy >= 0) {
    p.cut = false;
    p.fromJump = false;
  }

  // Walls: 1 px probes. While sliding, wallDir stays the slide side.
  const inX = c.inX;
  // On the ground, a rolling step she would just run up is not a wall.
  const lip = p.grounded && P.stepUpPx > 0;
  const touchR = c.solid(p.x + 1, p.y) && !(lip && !c.solid(p.x + 1, p.y - P.stepUpPx));
  const touchL = c.solid(p.x - 1, p.y) && !(lip && !c.solid(p.x - 1, p.y - P.stepUpPx));
  if (p.mode === 'wallSlide') {
    const d = p.wallDir;
    if (p.grounded || !(d > 0 ? touchR : touchL) || !c.kickable(p.x + d, p.y)) {
      events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: d });
      p.mode = 'normal';
      p.stick = 0;
      p.wallDir = touchR ? 1 : touchL ? -1 : 0;
    }
  } else {
    p.wallDir = touchR && touchL ? (inX !== 0 ? inX : p.facing) : touchR ? 1 : touchL ? -1 : 0;
    if (
      p.mode === 'normal' &&
      !p.grounded &&
      p.vy >= 0 &&
      P.wallSlide &&
      inX !== 0 &&
      (inX > 0 ? touchR : touchL) &&
      c.kickable(p.x + inX, p.y)
    ) {
      endGlide(c, 'wall');
      p.mode = 'wallSlide';
      p.wallDir = inX;
      p.stick = 0;
      p.slideT = 0;
      p.forceTimer = 0;
      p.vx = 0;
      events.push({ type: 'wallSlideStart', x: c.fx, y: c.fy, dir: inX });
    }
  }

  // Facing.
  if (p.mode === 'wallSlide') p.facing = p.wallDir > 0 ? -1 : 1;
  else if (p.mode === 'normal') {
    if (p.forceTimer > 0) p.facing = p.forceDir > 0 ? 1 : -1;
    else if (inX !== 0) p.facing = inX > 0 ? 1 : -1;
  }

  // Footsteps.
  if (p.grounded && p.mode === 'normal') {
    p.stepDist += Math.abs(p.x - x0);
    if (p.stepDist >= P.footstepPx) {
      p.stepDist -= P.footstepPx;
      events.push({ type: 'step', x: c.fx, y: c.fy });
    }
  }
}

/**
 * She is hurt: loses `damage`, is thrown toward `dir` and is out of control for a moment, then
 * cannot be hurt for a while. Whatever she was doing ends (slash, glide, dash, wall slide). At no
 * health she fades instead (`faded` counts down to the re-form, which `step` performs).
 */
export function hurtPlayer(
  state: GameState,
  P: MoveParams,
  dir: number,
  damage: number,
  source: HurtSource,
  hitX: number,
  hitY: number,
  events: SimEvent[],
): void {
  const p = state.player;
  const x = p.x + p.w / 2;
  const y = p.y + p.h;
  p.hp = Math.max(0, p.hp - damage);
  const out = p.hp === 0;
  p.hurtDir = dir;
  p.hurtSeq++;
  p.stagger = P.staggerFrames;
  p.invuln = out ? 0 : P.invulnFrames;
  // The blow lands: she (and what hit her: step) holds before the throw; her timers stand still.
  const hold = out ? P.fadeHitstop : P.hurtHitstop;
  events.push({
    type: 'hurt',
    x,
    y,
    dir,
    hp: p.hp,
    hpMax: p.hpMax,
    damage,
    source,
    hitX,
    hitY,
    stagger: p.stagger,
    invuln: p.invuln,
    hitstop: hold,
  });
  if (p.attack !== 'none') {
    events.push({ type: 'slashEnd', x, y, dir: p.attack, hits: p.attackHits, reason: 'hurt' });
    p.attack = 'none';
    p.attackActive = false;
  }
  if (p.gliding) {
    p.gliding = false;
    events.push({ type: 'glideEnd', x, y, reason: 'hurt' });
  }
  // A blow knocks her out of a grab (a web's hold, the weaver's bite): src/sim/grab.ts.
  if (p.grab >= 0) freeGrab(state, P.tuning, 'hurt', events);
  // A blow ends a fling's aim (the flame stays lit).
  p.fling = -1;
  p.flingFrames = 0;
  // And a mend (Lanternroot): nothing spent.
  if (p.mend > 0) {
    p.mend = 0;
    events.push({ type: 'mendBreak', why: 'hurt', x, y: p.y + p.h / 2 });
  }
  if (p.lampHold > 0) p.lampHold = -1;
  if (p.mode === 'dash') events.push({ type: 'dashEnd', x, y, dir: p.dashDir });
  else if (p.mode === 'wallSlide') events.push({ type: 'wallSlideEnd', x, y, dir: p.wallDir });
  if (p.mode !== 'normal') p.modeFrames = 0;
  p.mode = 'normal';
  p.vx = dir * P.hurtVx;
  p.vy = -P.hurtVy;
  if (p.grounded) p.contactFrames = 0;
  p.grounded = false;
  p.airTopY = p.y;
  p.motion = 'rise';
  p.motionFrames = 0;
  p.skid = false;
  p.freeze = 0;
  p.hitstop = hold;
  p.kickX = 0;
  p.lungeX = 0;
  p.pullX = 0;
  p.hang = 0;
  p.dashTimer = 0;
  p.coyote = 0;
  p.jumpBuf = 0;
  p.djBuf = 0;
  p.dashBuf = 0;
  p.attackBuf = 0;
  p.forceTimer = 0;
  p.kick = 0;
  p.retainTimer = 0;
  p.stick = 0;
  p.fromJump = false;
  p.cut = false;
  p.sustain = 0;
  p.carried = false;
  p.comboStep = 0;
  p.comboTimer = 0;
  if (out) {
    p.faded = P.fadeFrames;
    events.push({ type: 'fade', x, y, frames: p.faded });
  }
}

/**
 * Is a living enemy within `px` of the point, or its home within `px` (or within what its kind
 * asks: `homeClear`)?
 */
function enemyNear(enemies: EnemyState[], x: number, y: number, px: number, t: Tuning): boolean {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e.mode === 'dead') continue;
    const dx = e.x + e.w / 2 - x;
    const dy = e.y + e.h / 2 - y;
    if (dx * dx + dy * dy < px * px) return true;
    const hx = e.homeX - x;
    const hy = e.homeY - y;
    const clear = homeClear(e, px, t);
    if (hx * hx + hy * hy < clear * clear) return true;
  }
  return false;
}

/**
 * Safe ground: she has stood (or run) for `safeFrames` in a row on a solid that is not the pool
 * (not a one-way branch), in control, with no living enemy near. While that holds, where she is
 * is where she will re-form. Runs at the end of every step.
 */
export function trackSafeGround(state: GameState, scene: Scene, P: MoveParams): boolean {
  const p = state.player;
  const cx = p.x + p.w / 2;
  const bottom = p.y + p.h;
  let ok = p.grounded && p.mode === 'normal' && p.hp > 0 && p.stagger === 0 && p.faded === 0;
  if (ok) {
    ok = false;
    const solids = scene.solids;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s !== undefined && s.y === bottom && cx >= s.x && cx < s.x + s.w)
        ok = s.tag !== 'pool' && s.kit === undefined;
    }
  }
  // Never where a thorn bed is within reach of her box (memory/level-kit.md): she is put back here.
  if (ok) ok = thornAt(scene, p, P.tuning.kit.thorns.safeMargin) < 0;
  // Never inside a catch zone (a floor under a chasm, for the camera): being put back there is caught again.
  if (ok && scene.catches) {
    const cy = p.y + p.h / 2;
    for (const z of scene.catches) if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) ok = false;
  }
  if (ok) ok = !enemyNear(state.enemies, cx, p.y + p.h / 2, P.safeEnemyPx, P.tuning);
  p.safeFrames = ok ? p.safeFrames + 1 : 0;
  if (ok) {
    p.groundX = cx;
    p.groundY = bottom;
    // Her door into the room: the first ground she stood on here (a fade re-forms her there).
    if (!state.entry) state.entry = { x: cx, y: bottom };
  }
  if (p.safeFrames >= P.safeFrames) {
    p.safeX = cx;
    p.safeY = bottom;
  }
  return ok;
}

/**
 * The end of a fade: a fresh player at the last safe ground (the scene's spawn if an enemy that
 * is about to return to its start would be near it), or at `at` if given (the lit lantern she last
 * stood at: src/sim/goal.ts), whole, facing as she did, safe for a while.
 * The caller puts the living enemies back.
 */
export function reformPlayer(
  state: GameState,
  scene: Scene,
  P: MoveParams,
  events: SimEvent[],
  at?: { x: number; y: number },
): void {
  const old = state.player;
  let x = at ? at.x : old.safeX;
  let y = at ? at.y : old.safeY;
  // A lit lantern (`at`) is her rest point whatever lives near it; safe ground is checked.
  for (let i = 0; at === undefined && i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e || e.mode === 'dead') continue;
    const dx = e.homeX - x;
    const dy = e.homeY - (y - old.h / 2);
    const clear = homeClear(e, P.safeEnemyPx, P.tuning);
    if (dx * dx + dy * dy < clear * clear) {
      x = scene.spawn.x;
      y = scene.spawn.y;
      break;
    }
  }
  const p = createPlayer(x, y, P.tuning, scene);
  p.facing = old.facing;
  p.attackFacing = old.facing;
  p.attackSeq = old.attackSeq;
  p.hurtSeq = old.hurtSeq;
  // (In a glow room a fade has dropped it already: src/sim/light.ts `dropGlow`.)
  p.glow = old.glow;
  keepOffer(p, old);
  p.invuln = P.reformInvulnFrames;
  freshStart(p, P.tuning);
  // What a fade costs. In lamp rooms a walk: she is whole, and so are the creatures (feel review round 2,
  // problem 7; HK / Ori). In the test grove, part of her health (a lit lantern is where she is made whole).
  p.hp =
    scene.senses === 'lamp' ? p.hpMax : Math.max(1, Math.min(p.hpMax, Math.round(P.tuning.health.reformHp)));
  state.player = p;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  p.safeX = fx;
  p.safeY = fy;
  p.groundX = fx;
  p.groundY = fy;
  events.push({
    type: 'reform',
    x: fx,
    y: fy,
    fromX: old.x + old.w / 2,
    fromY: old.y + old.h,
    hp: p.hp,
    hpMax: p.hpMax,
    invuln: p.invuln,
    fadeIn: p.fadeIn,
  });
  events.push({ type: 'spawn', x: fx, y: fy });
}

/** Every input bit: `inputLock` set to it locks whatever is held on her first frame back. */
const ALL_INPUT = 0xffff;

/**
 * Put back after a hazard or re-formed (`room.returnFadeIn`): a fade-in with no input and no harm, and
 * no button held as she comes back counts as a press until it is let go and pressed again, so a held
 * jump + right cannot throw her straight back into what just hurt her (Celeste / HK).
 */
export function freshStart(p: PlayerState, t: Tuning): void {
  const n = Math.max(0, Math.round(t.room.returnFadeIn));
  p.fadeIn = n;
  p.inputLock = ALL_INPUT;
  p.invuln = Math.max(p.invuln, n);
}
