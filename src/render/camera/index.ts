/**
 * The follow camera: a pure TS module, no Pixi. It is stepped once per sim frame from the
 * post-step sim state, so it is deterministic and unit-testable headless. The render driver keeps
 * the previous and current CameraState and interpolates them with the same alpha as the player.
 *
 * Per frame: horizontal look-ahead with dual forward focus -> vertical dead zone / fall follow ->
 * clamp to the scene bounds. Soft everywhere: nothing snaps except on a `spawn` event.
 */
import type { Scene } from '../../sim/scene';
import type { GameState } from '../../sim/state';
import { type CameraView, VIEW_H, VIEW_W } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';

export interface CameraState {
  /** Free-follow view centre x and anchor-line y (feet level), before clamping. */
  fx: number;
  fy: number;
  targetY: number;
  focusDir: number;
  /** Reversal in progress: direction and where it started. */
  revDir: number;
  revStartX: number;
  /** View top-left after clamping to the scene, world px. */
  x: number;
  y: number;
}

/** Clamps a view edge to [lo, lo + size - view]; centres it if the span is smaller than the view. */
export function clampAxis(v: number, lo: number, size: number, view: number): number {
  if (size <= view) return lo + (size - view) / 2;
  return Math.min(Math.max(v, lo), lo + size - view);
}

function place(cam: CameraState, scene: Scene, ct: CameraTuning): void {
  cam.x = clampAxis(cam.fx - VIEW_W / 2, 0, scene.width, VIEW_W);
  cam.y = clampAxis(cam.fy - ct.anchorY * VIEW_H, 0, scene.height, VIEW_H);
}

/** A camera already settled on the player. */
export function createCamera(s: GameState, scene: Scene, ct: CameraTuning = cameraTuning): CameraState {
  const p = s.player;
  const feet = p.y + p.h;
  const cam: CameraState = {
    fx: p.x + p.w / 2 + p.facing * ct.lookaheadX,
    fy: feet,
    targetY: feet,
    focusDir: p.facing,
    revDir: 0,
    revStartX: p.x,
    x: 0,
    y: 0,
  };
  place(cam, scene, ct);
  return cam;
}

/** Steps the camera one sim frame toward the player. */
export function stepCamera(
  cam: CameraState,
  s: GameState,
  scene: Scene,
  ct: CameraTuning = cameraTuning,
): void {
  const p = s.player;
  const cx = p.x + p.w / 2;
  const feet = p.y + p.h;

  // Horizontal: dual forward focus. Flip only after moving focusSwitchPx the other way.
  const moveDir = p.vx > 0 ? 1 : p.vx < 0 ? -1 : 0;
  if (moveDir !== 0 && moveDir !== cam.focusDir) {
    if (cam.revDir !== moveDir) {
      cam.revDir = moveDir;
      cam.revStartX = p.x;
    }
    if ((p.x - cam.revStartX) * moveDir >= ct.focusSwitchPx) {
      cam.focusDir = moveDir;
      cam.revDir = 0;
    }
  } else if (moveDir === cam.focusDir) cam.revDir = 0;
  const targetX = cx + cam.focusDir * ct.lookaheadX;
  const panMax = Math.max(ct.panMaxX, Math.abs(p.vx) * ct.panMaxVxMult);
  const stepX = (targetX - cam.fx) * (p.mode === 'dash' ? ct.lerpXDash : ct.lerpX);
  cam.fx += Math.max(-panMax, Math.min(panMax, stepX));

  // Vertical: dead zone (the target holds while the feet stay in the window), fast-fall follow.
  let lerpY = ct.lerpY;
  const feetScreen = (feet - cam.y) / VIEW_H;
  if (p.vy > ct.fallFollowVy) {
    cam.targetY = feet + ct.fallLookahead;
    lerpY = ct.lerpYFall;
  } else if (p.grounded || p.mode === 'wallSlide' || feetScreen < ct.winTop || feetScreen > ct.winBot) {
    cam.targetY = feet;
  }
  cam.fy += (cam.targetY - cam.fy) * lerpY;
  place(cam, scene, ct);
}

/** The view between two camera states (alpha 0 = prev, 1 = cur), at zoom 1. */
export function lerpCamera(prev: CameraState, cur: CameraState, alpha: number): CameraView {
  return {
    x: prev.x + (cur.x - prev.x) * alpha + VIEW_W / 2,
    y: prev.y + (cur.y - prev.y) * alpha + VIEW_H / 2,
    zoom: 1,
  };
}
