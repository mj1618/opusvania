import type { SimEvent } from '../events';
import { axisX, type InputFrame, isHeld, tickBuffer, wasPressed } from '../input';
import { collidesAt, moveX, moveY } from '../physics/aabb';
import { rngInt } from '../rng';
import type { GameState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import type { Room, Spawn } from '../world/rooms';

/**
 * PLACEHOLDER controller for Phase 0: run, jump with gravity, variable jump height, coyote time
 * and jump buffering. Phase 1 rewrites this as a proper state machine.
 */
export const DT = 1 / 60;

export function createPlayer(spawn: Spawn, t: Tuning): PlayerState {
  const ts = t.world.tileSize;
  const w = t.player.width;
  const h = t.player.height;
  return {
    x: Math.floor(spawn.tx * ts + ts / 2 - w / 2),
    y: (spawn.ty + 1) * ts - h,
    rx: 0,
    ry: 0,
    w,
    h,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    rising: false,
  };
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

export function updatePlayer(
  state: GameState,
  room: Room,
  input: InputFrame,
  t: Tuning,
  events: SimEvent[],
): void {
  const p = state.player;
  const prev = state.prevInput;
  const ts = t.world.tileSize;

  // Horizontal.
  const ax = axisX(input);
  const target = ax * t.player.runSpeed;
  const accel = p.grounded
    ? ax !== 0
      ? t.player.groundAccel
      : t.player.groundDecel
    : ax !== 0
      ? t.player.airAccel
      : t.player.airDecel;
  p.vx = approach(p.vx, target, accel * DT);
  if (ax !== 0) p.facing = ax > 0 ? 1 : -1;

  // Jump: buffer + coyote.
  p.jumpBuffer = tickBuffer(p.jumpBuffer, wasPressed(input, prev, 'jump'), t.jump.bufferFrames);
  p.coyote = p.grounded ? t.jump.coyoteFrames : Math.max(0, p.coyote - 1);
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    events.push({ type: 'jump', x: p.x + p.w / 2, y: p.y + p.h, coyote: !p.grounded });
    p.vy = -t.jump.jumpSpeed;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.grounded = false;
    p.rising = true;
  }
  if (p.rising && (p.vy >= 0 || !isHeld(input, 'jump'))) {
    if (p.vy < 0) p.vy *= t.jump.releaseCut;
    p.rising = false;
  }

  // Gravity.
  p.vy = Math.min(p.vy + t.jump.gravity * DT, t.jump.maxFallSpeed);

  // Move and collide.
  if (moveX(p, p.vx * DT, room, ts)) p.vx = 0;
  const fallSpeed = p.vy;
  if (moveY(p, p.vy * DT, room, ts)) {
    if (p.vy < 0) p.rising = false;
    p.vy = 0;
  }

  const wasGrounded = p.grounded;
  p.grounded = collidesAt(room, ts, p.x, p.y + 1, p.w, p.h);
  if (p.grounded && !wasGrounded) {
    events.push({
      type: 'land',
      x: p.x + p.w / 2,
      y: p.y + p.h,
      speed: fallSpeed,
      variant: rngInt(state, t.fx.landDustVariants),
    });
  }
}
