import type { JumpKind, SimEvent } from '../events';
import { ActionBit, axisX, type InputFrame } from '../input';
import { type Body, type Collider, moveX, moveY, oneWayUnder, solidAt } from '../physics/aabb';
import type { Scene } from '../scene';
import type { GameState, Motion, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import type { MoveParams } from './params';

/**
 * The player movement controller: run with accel/decel/turn, variable-height jump, coyote time,
 * jump buffer, apex hang, double jump, dash (with dash-jump cancel), wall slide + wall jump, fast
 * fall, one-way drop-through and three corner corrections. Everything is always enabled.
 *
 * A small state machine (normal / wallSlide / dash) run in a fixed per-frame order: freeze ->
 * latch presses -> mode update (velocity) -> move X then Y -> post (timers, ground and wall probes,
 * transitions, facing, events). All numbers come from MoveParams (tuning + assists).
 */

/** A player at rest with its feet centre at (feetX, feetY), facing right. Lifted out of any solid. */
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
    coyote: 0,
    jumpBuf: 0,
    djBuf: 0,
    dashBuf: 0,
    forceTimer: 0,
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
  }
  if (c.pressed(ActionBit.dash)) p.dashBuf = P.dashBufferFrames;
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
  c.jumped = true;
  p.retainTimer = 0; // a jump (incl. wall jump) ends wall speed retention
  c.events.push({ type: 'jump', kind, x: c.fx, y: c.fy, dir });
}

function groundJump(c: Ctx, kind: JumpKind): void {
  c.p.vy = -c.P.jumpSpeed;
  c.p.vx += c.inX * c.P.hBoost;
  jumpCommon(c, kind, c.inX);
}

/** Nearest wall within the wall-jump grace distance: side -1/1, or 0. Ties: the wall behind facing. */
function wallInRange(c: Ctx): number {
  const p = c.p;
  for (let k = 1; k <= c.P.wallCheckPx; k++) {
    const r = c.solid(p.x + k, p.y);
    const l = c.solid(p.x - k, p.y);
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
  const p = c.p;
  if (!c.P.landingPreference || p.vy <= 0) return false;
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
  const inX = c.inX;
  const target = inX * P.maxRun;
  const turning = inX !== 0 && sign(p.vx) === -inX;
  let a: number;
  if (p.grounded) a = inX === 0 ? P.groundDecel : turning ? P.groundTurn : P.groundAccel;
  else a = inX === 0 ? P.airDecel : turning ? P.airTurn : P.airAccel;
  if (Math.abs(p.vx) > P.maxRun && sign(p.vx) === inX)
    a = p.grounded ? P.overspeedDecelGround : P.overspeedDecelAir;
  p.vx = approach(p.vx, target, a);
  const skidding = p.grounded && turning;
  if (skidding && !p.skid) c.events.push({ type: 'skid', x: c.fx, y: c.fy, dir: inX });
  p.skid = skidding;
}

function gravity(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  const heldEff = c.held(ActionBit.jump);
  // variableJump off: releasing never cuts or ends the sustain (every jump is full height).
  const holdsRise = heldEff || !P.variableJump;
  if (p.vy < 0 && !holdsRise && p.fromJump) p.cut = true;
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
}

function normal(c: Ctx): void {
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
 * caller sets it to `input` afterwards.
 */
export function updatePlayer(
  state: GameState,
  scene: Scene,
  input: InputFrame,
  P: MoveParams,
  events: SimEvent[],
): void {
  const p = state.player;
  const mode0 = p.mode;
  const motion0 = p.motion;
  const grounded0 = p.grounded;
  const facing0 = p.facing;
  const c = new Ctx(p, scene, input, state.prevInput, P, events);
  c.inX = axisX(input);
  p.inputX = c.inX;
  controller(c);

  // Animation bookkeeping: what the body is doing and for how long.
  p.modeFrames = p.mode === mode0 ? p.modeFrames + 1 : 0;
  p.contactFrames = p.grounded === grounded0 ? p.contactFrames + 1 : 0;
  const motion = motionOf(p);
  p.motionFrames = motion === motion0 ? p.motionFrames + 1 : 0;
  p.motion = motion;
  if (p.facing !== facing0)
    events.push({ type: 'turn', x: c.fx, y: c.fy, dir: p.facing, grounded: p.grounded });
}

function motionOf(p: PlayerState): Motion {
  if (p.mode === 'dash') return 'dash';
  if (p.mode === 'wallSlide') return 'wallSlide';
  if (!p.grounded) return p.vy < 0 ? 'rise' : 'fall';
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
    return;
  }

  // 2. Latch presses into buffers.
  latch(c);
  c.jumpPressedNow = c.pressed(ActionBit.jump);
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
    if (moveX(p, p.vx, c)) {
      if (P.wallRetainFrames > 0 && p.retainTimer === 0 && p.vx !== 0 && p.mode !== 'dash') {
        p.retainVx = p.vx;
        p.retainTimer = P.wallRetainFrames;
      }
      if (p.mode !== 'dash') p.vx = 0;
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
  if (p.forceTimer > 0) p.forceTimer--;
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
    if (!wasGrounded) {
      const fallPx = p.y - p.airTopY;
      const hard = fallPx >= P.hardLandFallPx || impactVy >= P.maxFall;
      events.push({ type: 'land', x: c.fx, y: c.fy, vy: impactVy, fallPx, hard });
      p.stepDist = 0;
    }
    p.airTopY = p.y;
  } else {
    if (wasGrounded && !c.jumped && p.mode === 'normal') events.push({ type: 'fall', x: c.fx, y: c.fy });
    if (!wasGrounded && p.coyote > 0) p.coyote--;
    if (p.y < p.airTopY) p.airTopY = p.y;
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
    if (p.grounded || !(d > 0 ? touchR : touchL)) {
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
      (inX > 0 ? touchR : touchL)
    ) {
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
