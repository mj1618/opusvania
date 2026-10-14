import { homeClear, slashBlocks, slashEnemies } from '../enemies';
import type { GlideEndReason, HurtSource, JumpKind, SimEvent, SlashDir, SlashEndReason } from '../events';
import { ActionBit, axisX, type InputFrame } from '../input';
import { type Body, type Collider, kickableAt, moveX, moveY, oneWayUnder, solidAt } from '../physics/aabb';
import { slashPods } from '../pods';
import type { Scene } from '../scene';
import type { EnemyState, GameState, Motion, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { slashBox } from './attack';
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
    kindling: -1,
    kindlingLamp: -1,
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
    safeX: Math.round(feetX),
    safeY: y + h,
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

  constructor(
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
  if (p.attackBuf === 0 || p.attackCd > 0 || p.mode === 'dash') return;
  // Pressed together with a dash that is about to start: the dash goes first, the slash after it.
  if (p.dashBuf > 0 && p.mode === 'normal' && canDash(c)) return;
  endSlash(c, 'chain');
  // Up wins; Down only in the air (on the ground it is a forward slash, as in Hollow Knight).
  const dir: SlashDir = c.held(ActionBit.up) ? 'up' : c.held(ActionBit.down) && !p.grounded ? 'down' : 'fwd';
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
  const st = stepOf(c);
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
  const hits = foes + pods;
  // Glanced off a braced shell: no hit, but she feels it (a beat, and a throw back off it). A down
  // cut that glances (a braced or curled burrback's top) still bounces her: the pogo, nothing taken.
  const glanced = slashBlocks() > 0 && foes === 0;
  if (glanced) {
    const stop = pogo ? E.pogoHitstopFrames : E.blockHitstopFrames;
    p.hitstop = Math.max(p.hitstop, Math.max(0, Math.round(stop)));
    if (dir === 'fwd' && p.mode === 'normal') p.kickX = -p.attackFacing * E.blockRecoil;
  }
  if (hits === 0) {
    if (glanced && pogo) pogoBounce(c);
    return;
  }
  const hitstop = Math.max(foes > 0 ? foeStop : 0, pods > 0 ? podStop : 0);
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
  } else if (pogo) pogoBounce(c);
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
}

function jumpCommon(c: Ctx, kind: JumpKind, dir: number): void {
  const p = c.p;
  p.jumpBuf = 0;
  p.djBuf = 0;
  p.coyote = 0;
  p.grounded = false;
  p.fromJump = true;
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
  c.p.carried = true;
  c.p.launchY = c.p.y;
  jumpCommon(c, kind, c.inX);
}

/** Nearest wall within the wall-jump grace distance: side -1/1, or 0. Ties: the wall behind facing. */
function wallInRange(c: Ctx): number {
  const p = c.p;
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

function tryJump(c: Ctx): void {
  const p = c.p;
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
    const onOneWayOnly = p.grounded && !c.solid(p.x, p.y + 1) && oneWayUnder(c.scene, p.x, p.y, p.w, p.h);
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
  return p.dashCd === 0 && (p.grounded || p.airDash > 0);
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
  if (!c.p.gliding) return;
  c.p.gliding = false;
  c.events.push({ type: 'glideEnd', x: c.fx, y: c.fy, reason });
}

/** A buffered press is still waiting to become a jump: the wings stay shut so it can. */
function jumpPending(c: Ctx): boolean {
  const p = c.p;
  if (p.djBuf > 0 && p.dj > 0) return true;
  return p.jumpBuf > 0 && (p.coyote > 0 || groundSoon(c) || wallInRange(c) !== 0);
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
  const want = P.glide && jump && !c.held(ActionBit.down) && !p.grounded;
  if (p.gliding) {
    if (!want) endGlide(c, jump ? 'fastfall' : 'release');
    return;
  }
  if (!want || p.vy <= P.glideMinVy) return;
  if (p.carried && p.y < p.launchY + P.glideCarriedDropPx) return;
  if (jumpPending(c)) return;
  p.gliding = true;
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
  const heldEff = c.held(ActionBit.jump);
  // variableJump off: releasing never cuts or ends the sustain (every jump is full height).
  const holdsRise = heldEff || !P.variableJump;
  // (A wall kick keeps its rise for a moment whatever the button does: a tap climbs too.)
  if (p.vy < 0 && !holdsRise && p.fromJump && p.kick === 0) p.cut = true;
  let g = P.gravity;
  if (p.vy >= 0) g *= P.fallMult;
  else if (p.cut && !P.releaseZero) g *= P.releaseMult;
  if (heldEff && Math.abs(p.vy) < P.apexHangVy) g *= P.apexHangMult;
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
  if (p.invuln > 0) p.invuln--;
  // Out of control: thrown by a hit (directions come back for the tail of it), or faded.
  const sides = ActionBit.left | ActionBit.right;
  const eff = p.faded > 0 || p.stagger > P.steerFrames ? 0 : p.stagger > 0 ? input & sides : input;
  const c = new Ctx(p, scene, eff, state.prevInput, P, events);
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
  updateSlash(c);
  const wasGrounded = p.grounded;
  const x0 = p.x;
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

  // 4. Move X then Y, with corner corrections.
  let impactVy = 0;
  if (!c.skipMove) {
    guardLunge(c);
    if (moveX(p, p.vx + p.kickX + p.lungeX, c)) {
      p.kickX = 0;
      p.lungeX = 0;
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

  p.grounded = p.vy >= 0 && c.groundAt(p.x, p.y);
  if (p.grounded) {
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
  const touchR = c.solid(p.x + 1, p.y);
  const touchL = c.solid(p.x - 1, p.y);
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
  p.hitstop = 0;
  p.kickX = 0;
  p.lungeX = 0;
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
export function trackSafeGround(state: GameState, scene: Scene, P: MoveParams): void {
  const p = state.player;
  const cx = p.x + p.w / 2;
  const bottom = p.y + p.h;
  let ok = p.grounded && p.mode === 'normal' && p.hp > 0 && p.stagger === 0 && p.faded === 0;
  if (ok) {
    ok = false;
    const solids = scene.solids;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s !== undefined && s.y === bottom && cx >= s.x && cx < s.x + s.w) ok = s.tag !== 'pool';
    }
  }
  if (ok) ok = !enemyNear(state.enemies, cx, p.y + p.h / 2, P.safeEnemyPx, P.tuning);
  p.safeFrames = ok ? p.safeFrames + 1 : 0;
  if (p.safeFrames >= P.safeFrames) {
    p.safeX = cx;
    p.safeY = bottom;
  }
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
  keepOffer(p, old);
  p.invuln = P.reformInvulnFrames;
  // A fade costs: she comes back with part of her health (a lit lantern is where she is made whole).
  p.hp = Math.max(1, Math.min(p.hpMax, Math.round(P.tuning.health.reformHp)));
  state.player = p;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  p.safeX = fx;
  p.safeY = fy;
  events.push({
    type: 'reform',
    x: fx,
    y: fy,
    fromX: old.x + old.w / 2,
    fromY: old.y + old.h,
    hp: p.hp,
    hpMax: p.hpMax,
    invuln: p.invuln,
  });
  events.push({ type: 'spawn', x: fx, y: fy });
}
