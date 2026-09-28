import type { JumpKind, SimEvent } from '../events';
import { ActionBit, axisX, type InputFrame } from '../input';
import {
  type Body,
  type Collider,
  hazardAt,
  Move,
  moveX,
  moveY,
  oneWayUnder,
  overlaps,
  pogoTargetAt,
  solidAt,
} from '../physics/aabb';
import type { GameState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { type Abilities, ALL_ABILITIES, type Room, type Spawn } from '../world/rooms';
import { BASE_PROFILE, type MoveParams } from './params';

/**
 * The player controller (movement-spec §2). A small state machine (normal / wallSlide / dash /
 * dead) run in a fixed per-frame order (§2.2) that the exact tests in tests/unit/movement depend
 * on. All numbers come from MoveParams (tuning + profile + assists).
 *
 * Performance note: the step allocates one context + collider and no closures (the search bot
 * runs millions of frames; per-step closures cost more than the physics under tsx/esbuild).
 */

export interface CreatePlayerOptions {
  abilities?: Abilities;
  profile?: string;
}

/** A player standing on the floor of the spawn tile, horizontally centred, facing into the room. */
export function createPlayer(
  spawn: Spawn,
  t: Tuning,
  room: Room,
  opts: CreatePlayerOptions = {},
): PlayerState {
  const ts = t.world.tileSize;
  const w = t.body.width;
  const h = t.body.height;
  const x = Math.floor(spawn.tx * ts + ts / 2 - w / 2);
  const y = (spawn.ty + 1) * ts - h;
  const p: PlayerState = {
    x,
    y,
    rx: 0,
    ry: 0,
    w,
    h,
    vx: 0,
    vy: 0,
    facing: 2 * spawn.tx + 1 <= room.width ? 1 : -1,
    state: 'normal',
    grounded: false,
    wallDir: 0,
    abilities: { ...(opts.abilities ?? ALL_ABILITIES) },
    profile: opts.profile ?? BASE_PROFILE,
    coyote: 0,
    jumpBuf: 0,
    djBuf: 0,
    dashBuf: 0,
    forceTimer: 0,
    forceDir: 0,
    dashCd: 0,
    dashTimer: 0,
    dashDir: 0,
    freeze: 0,
    stick: 0,
    retainVx: 0,
    retainTimer: 0,
    dropTimer: 0,
    dropY: 0,
    pogoTimer: 0,
    deathTimer: 0,
    fromJump: false,
    cut: false,
    cutDisabled: false,
    sustain: 0,
    sustainV: 0,
    framesSinceJump: 0,
    airDash: t.dash.airDashes,
    dj: t.jump.doubleJumps,
    airTopY: y,
    stepDist: 0,
    skid: false,
    respawn: null,
  };
  p.grounded = solidAt(room, ts, x, y + 1, w, h) || oneWayUnder(room, ts, x, y, w, h);
  return p;
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/**
 * Bounce the player upward (pogo now; Phase 2's nail hitbox calls the same function).
 * `cutDisabled` makes it a fixed-height bounce; `refill` restores the air dash and double jump.
 */
export function bounce(
  p: PlayerState,
  v: number,
  P: MoveParams,
  opts: { refill: boolean; cutDisabled: boolean },
) {
  p.vy = -v;
  p.cutDisabled = opts.cutDisabled;
  p.cut = false;
  p.fromJump = false;
  p.sustain = 0;
  if (opts.refill) {
    p.airDash = P.airDashes;
    p.dj = P.doubleJumps;
  }
}

/** Switches the player's movement profile (weight class etc.). Emits profileChange. */
export function setProfile(p: PlayerState, profile: string, events: SimEvent[]): void {
  if (p.profile === profile) return;
  events.push({ type: 'profileChange', from: p.profile, to: profile });
  p.profile = profile;
}

/** Per-step context: everything the controller functions below share. */
class Ctx implements Collider {
  inX = 0;
  jumpPressedNow = false;
  skipMove = false;
  dashMoving = false;

  constructor(
    readonly state: GameState,
    readonly p: PlayerState,
    readonly room: Room,
    readonly ts: number,
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
    return solidAt(this.room, this.ts, x, y, this.p.w, this.p.h);
  }

  dropping(y: number): boolean {
    return this.p.dropTimer > 0 && y <= this.p.dropY;
  }

  // Collider.
  blockedX(b: Body, dir: number): boolean {
    return solidAt(this.room, this.ts, b.x + dir, b.y, b.w, b.h);
  }

  blockedY(b: Body, dir: number): boolean {
    if (solidAt(this.room, this.ts, b.x, b.y + dir, b.w, b.h)) return true;
    return dir > 0 && !this.dropping(b.y) && oneWayUnder(this.room, this.ts, b.x, b.y, b.w, b.h);
  }

  hazard(b: Body): boolean {
    return hazardAt(this.room, this.ts, b, this.P);
  }

  /** Standing on something if the body were at (x, y). */
  groundAt(x: number, y: number): boolean {
    if (solidAt(this.room, this.ts, x, y + 1, this.p.w, this.p.h)) return true;
    return !this.dropping(y) && oneWayUnder(this.room, this.ts, x, y, this.p.w, this.p.h);
  }

  /** X blocked: dash corner correction, or ledge pop-up when airborne (spec §2.4). */
  onBlockX(b: Body, dir: number): boolean {
    const p = this.p;
    const P = this.P;
    if (p.state === 'dash') {
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
    if (p.grounded || p.state !== 'normal') return false;
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

  /** Y blocked while rising: head-bump corner correction (spec §2.4). */
  onBlockY(b: Body, dir: number): boolean {
    const p = this.p;
    if (dir > 0 || p.vy >= 0 || p.state !== 'normal') return false;
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
  if (c.pressed(ActionBit.attack) && c.held(ActionBit.down) && p.abilities.pogo)
    p.pogoTimer = P.pogoActiveFrames;
}

function jumpCommon(c: Ctx, kind: JumpKind, dir: number): void {
  const p = c.p;
  p.jumpBuf = 0;
  p.djBuf = 0;
  p.coyote = 0;
  p.grounded = false;
  p.fromJump = true;
  p.cut = false;
  p.cutDisabled = false;
  p.sustain = c.P.sustainFrames;
  p.sustainV = p.vy;
  p.framesSinceJump = 0;
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
  if (p.state === 'wallSlide') c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: d });
  p.state = 'normal';
  p.stick = 0;
  p.facing = d > 0 ? -1 : 1;
  jumpCommon(c, 'wall', -d);
}

/** Landing preference (§2.5): falling with ground within vy x buffer frames -> keep it buffered. */
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
    const onOneWayOnly =
      p.grounded && !c.solid(p.x, p.y + 1) && oneWayUnder(c.room, c.ts, p.x, p.y, p.w, p.h);
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
  if (p.jumpBuf > 0 && p.abilities.wallJump) {
    const d = wallInRange(c);
    if (d !== 0) {
      wallJump(c, d);
      return;
    }
  }
  if (p.djBuf > 0 && p.abilities.doubleJump && p.dj > 0 && !landingPreferred(c)) {
    p.vy = -c.P.doubleJumpSpeed;
    p.dj--;
    jumpCommon(c, 'double', c.inX);
  }
}

function canDash(c: Ctx): boolean {
  const p = c.p;
  return p.abilities.dash && p.dashCd === 0 && (p.grounded || p.airDash > 0);
}

function startDash(c: Ctx, dir: number): void {
  const p = c.p;
  const P = c.P;
  const air = !p.grounded;
  if (p.state === 'wallSlide') c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: p.wallDir });
  p.state = 'dash';
  p.dashDir = dir;
  p.facing = dir > 0 ? 1 : -1;
  p.dashTimer = P.dashFrames;
  p.dashCd = P.dashCooldownFrames;
  p.dashBuf = 0;
  if (air) p.airDash--;
  p.forceTimer = 0;
  p.fromJump = false;
  p.cut = false;
  p.cutDisabled = false;
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
  const heldEff = c.held(ActionBit.jump) && !p.cutDisabled;
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

function pogoCheck(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (p.pogoTimer <= 0 || p.grounded || !p.abilities.pogo) return;
  const probe = { x: p.x + (p.w - P.pogoProbeW) / 2, y: p.y + p.h, w: P.pogoProbeW, h: P.pogoProbeH };
  const target = pogoTargetAt(c.room, c.ts, probe, P);
  if (!target) return;
  bounce(p, P.pogoSpeed, P, { refill: true, cutDisabled: true });
  p.pogoTimer = 0;
  c.events.push({ type: 'pogo', x: c.fx, y: c.fy, target });
}

function normal(c: Ctx): void {
  horizontal(c); // a
  gravity(c); // b (a jump below overwrites vy, which is the same as skipping gravity)
  if (c.p.dashBuf > 0 && canDash(c)) {
    startDash(c, c.inX !== 0 ? c.inX : c.p.facing); // c
    return;
  }
  tryJump(c); // d
  pogoCheck(c); // e
}

function wallSlide(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  const d = p.wallDir;
  if (p.jumpBuf > 0 && p.abilities.wallJump) wallJump(c, d);
  else if (p.dashBuf > 0 && canDash(c)) startDash(c, -d);
  else {
    p.stick = c.inX === -d ? p.stick + 1 : 0;
    if (p.stick > P.stickFrames) {
      c.events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: d });
      p.state = 'normal';
      p.stick = 0;
      normal(c);
    } else {
      p.vx = 0;
      p.vy =
        p.vy > P.slideMax
          ? Math.max(p.vy - P.slideDecel, P.slideMax)
          : Math.min(p.vy + P.gravity * P.fallMult, P.slideMax);
    }
  }
}

function dash(c: Ctx): void {
  const p = c.p;
  const P = c.P;
  if (P.dashJumpCancel && p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
    c.events.push({ type: 'dashEnd', x: c.fx, y: c.fy, dir: p.dashDir });
    p.state = 'normal';
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
 * One sim frame for the player (movement-spec §2.2). `state.prevInput` is the previous frame's
 * mask (for edges); the caller sets it to `input` afterwards.
 */
export function updatePlayer(
  state: GameState,
  room: Room,
  input: InputFrame,
  P: MoveParams,
  events: SimEvent[],
): void {
  const p = state.player;
  if (p.state === 'dead') {
    p.deathTimer--;
    if (p.deathTimer <= 0) respawn(state, room, P, events);
    return;
  }
  const c = new Ctx(state, p, room, P.tileSize, input, state.prevInput, P, events);

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
  c.inX = axisX(input);
  const wasGrounded = p.grounded;
  const x0 = p.x;

  // Wall speed retention (§2.4): a wall zeroed vx recently and has gone -> restore it.
  if (p.retainTimer > 0 && p.state !== 'dash' && !c.blockedX(p, sign(p.retainVx))) {
    p.vx = p.retainVx;
    p.retainTimer = 0;
  }

  // 3. State update.
  if (p.state === 'normal') normal(c);
  else if (p.state === 'wallSlide') wallSlide(c);
  else if (p.state === 'dash') dash(c);

  // 4. Move X then Y, with corner corrections and a hazard check per pixel step.
  let impactVy = 0;
  let killed = false;
  if (!c.skipMove) {
    const mx = moveX(p, p.vx, c);
    if (mx === Move.killed) killed = true;
    else if (mx === Move.blocked) {
      if (P.wallRetainFrames > 0 && p.retainTimer === 0 && p.vx !== 0 && p.state !== 'dash') {
        p.retainVx = p.vx;
        p.retainTimer = P.wallRetainFrames;
      }
      if (p.state !== 'dash') p.vx = 0;
    }
    if (!killed) {
      const vyBefore = p.vy;
      const my = moveY(p, p.vy, c);
      if (my === Move.killed) killed = true;
      else if (my === Move.blocked) {
        if (p.vy < 0) {
          events.push({ type: 'headBump', x: c.fx, y: p.y });
          p.cut = false;
          p.sustain = 0;
        } else impactVy = vyBefore;
        p.vy = 0;
      }
    }
  }
  if (killed || c.hazard(p)) {
    die(state, P, events);
    return;
  }
  post(c, wasGrounded, x0, impactVy);
}

/** 5. Post: timers, ground probe, walls, transitions, facing, events, triggers. */
function post(c: Ctx, wasGrounded: boolean, x0: number, impactVy: number): void {
  const p = c.p;
  const P = c.P;
  const { state, room, ts, events } = c;
  if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.djBuf > 0) p.djBuf--;
  if (p.dashBuf > 0) p.dashBuf--;
  if (p.forceTimer > 0) p.forceTimer--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.dropTimer > 0) p.dropTimer = p.y > p.dropY ? 0 : p.dropTimer - 1;
  if (p.pogoTimer > 0) p.pogoTimer--;
  if (p.retainTimer > 0) p.retainTimer--;
  p.framesSinceJump++;

  if (c.dashMoving) {
    p.dashTimer--;
    if (p.dashTimer <= 0) {
      p.state = 'normal';
      p.vx = p.dashDir * P.dashEndVx;
      events.push({ type: 'dashEnd', x: c.fx, y: c.fy, dir: p.dashDir });
    }
  }

  p.grounded = p.vy >= 0 && c.groundAt(p.x, p.y);
  if (p.grounded) {
    // Coyote: N usable airborne frames after the frame that left the ground (§2.2).
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
    if (!wasGrounded && p.coyote > 0) p.coyote--;
    if (p.y < p.airTopY) p.airTopY = p.y;
    p.skid = false;
  }
  if (p.vy >= 0) {
    p.cut = false;
    p.cutDisabled = false;
    p.fromJump = false;
  }

  // Walls: 1 px probes. While sliding, wallDir stays the slide side.
  const inX = c.inX;
  const touchR = c.solid(p.x + 1, p.y);
  const touchL = c.solid(p.x - 1, p.y);
  if (p.state === 'wallSlide') {
    const d = p.wallDir;
    if (p.grounded || !(d > 0 ? touchR : touchL)) {
      events.push({ type: 'wallSlideEnd', x: c.fx, y: c.fy, dir: d });
      p.state = 'normal';
      p.stick = 0;
      p.wallDir = touchR ? 1 : touchL ? -1 : 0;
    }
  } else {
    p.wallDir = touchR && touchL ? (inX !== 0 ? inX : p.facing) : touchR ? 1 : touchL ? -1 : 0;
    if (
      p.state === 'normal' &&
      !p.grounded &&
      p.vy >= 0 &&
      P.wallSlide &&
      p.abilities.wallJump &&
      inX !== 0 &&
      (inX > 0 ? touchR : touchL)
    ) {
      p.state = 'wallSlide';
      p.wallDir = inX;
      p.stick = 0;
      p.forceTimer = 0;
      p.vx = 0;
      events.push({ type: 'wallSlideStart', x: c.fx, y: c.fy, dir: inX });
    }
  }

  // Facing.
  if (p.state === 'wallSlide') p.facing = p.wallDir > 0 ? -1 : 1;
  else if (p.state === 'normal') {
    if (p.forceTimer > 0) p.facing = p.forceDir > 0 ? 1 : -1;
    else if (inX !== 0) p.facing = inX > 0 ? 1 : -1;
  }

  // Footsteps.
  if (p.grounded && p.state === 'normal') {
    p.stepDist += Math.abs(p.x - x0);
    if (p.stepDist >= P.footstepPx) {
      p.stepDist -= P.footstepPx;
      events.push({ type: 'step', x: c.fx, y: c.fy });
    }
  }

  // Triggers.
  for (const e of room.entities) {
    if (!overlaps(p, e.tx * ts, e.ty * ts, ts, ts)) continue;
    if (e.kind === 'respawn') {
      if (p.respawn?.tx !== e.tx || p.respawn?.ty !== e.ty) {
        p.respawn = { tx: e.tx, ty: e.ty };
        events.push({ type: 'checkpoint', x: c.fx, y: c.fy });
      }
    } else if (e.kind === 'goal') {
      if (!state.roomStats.goal) {
        state.roomStats.goal = true;
        events.push({ type: 'goal', kind: 'main', roomId: room.id, x: c.fx, y: c.fy });
        if (room.next) startTransition(state, room.next, undefined, P, events);
      }
    } else if (e.kind === 'optionalGoal') {
      if (!state.roomStats.optional) {
        state.roomStats.optional = true;
        events.push({ type: 'goal', kind: 'optional', roomId: room.id, x: c.fx, y: c.fy });
      }
    } else if (e.kind === 'door' && e.to && c.pressed(ActionBit.up) && p.grounded && !state.transition) {
      startTransition(state, e.to, e.spawn, P, events);
    }
  }
}

export function startTransition(
  state: GameState,
  to: string,
  spawn: string | undefined,
  P: MoveParams,
  events: SimEvent[],
): void {
  if (state.transition) return;
  const p = state.player;
  state.transition =
    spawn === undefined ? { to, timer: P.transitionFrames } : { to, spawn, timer: P.transitionFrames };
  events.push({ type: 'roomExit', roomId: state.roomId, to, x: p.x + p.w / 2, y: p.y + p.h });
}

function die(state: GameState, P: MoveParams, events: SimEvent[]): void {
  const p = state.player;
  if (p.state === 'wallSlide')
    events.push({ type: 'wallSlideEnd', x: p.x + p.w / 2, y: p.y + p.h, dir: p.wallDir });
  p.state = 'dead';
  p.deathTimer = P.deathFreezeFrames;
  p.vx = 0;
  p.vy = 0;
  p.freeze = 0;
  state.roomStats.deaths++;
  events.push({ type: 'death', x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

function respawn(state: GameState, room: Room, P: MoveParams, events: SimEvent[]): void {
  const old = state.player;
  const sp = old.respawn ?? room.spawns.default;
  if (!sp) throw new Error(`Room ${room.id} has no spawn`);
  const ts = P.tileSize;
  const x = Math.floor(sp.tx * ts + ts / 2 - old.w / 2);
  const y = (sp.ty + 1) * ts - old.h;
  const p: PlayerState = {
    ...old,
    x,
    y,
    rx: 0,
    ry: 0,
    vx: 0,
    vy: 0,
    state: 'normal',
    grounded: solidAt(room, ts, x, y + 1, old.w, old.h) || oneWayUnder(room, ts, x, y, old.w, old.h),
    wallDir: 0,
    coyote: 0,
    jumpBuf: 0,
    djBuf: 0,
    dashBuf: 0,
    forceTimer: 0,
    dashCd: 0,
    dashTimer: 0,
    freeze: 0,
    stick: 0,
    retainTimer: 0,
    dropTimer: 0,
    pogoTimer: 0,
    deathTimer: 0,
    fromJump: false,
    cut: false,
    cutDisabled: false,
    sustain: 0,
    airDash: P.airDashes,
    dj: P.doubleJumps,
    airTopY: y,
    stepDist: 0,
    skid: false,
  };
  state.player = p;
  events.push({ type: 'respawn', x: x + p.w / 2, y: y + p.h });
}
