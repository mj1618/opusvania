/**
 * The follow camera: a pure TS module, no Pixi. It is stepped once per sim frame from the
 * post-step sim state, so it is deterministic and unit-testable headless. The render driver keeps
 * the previous and current CameraState and interpolates them with the same alpha as the player.
 *
 * Per frame: horizontal look-ahead from averaged travel, spring follow -> vertical dead zone / fall follow ->
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
  /** Follow velocity (px/frame): the springs keep it continuous, so the view never jerks. */
  fvx: number;
  fvy: number;
  targetY: number;
  /** Slow average of the travel direction, -1..1. Scales the look-ahead. */
  lead: number;
  /** View top-left after clamping to the scene, world px. */
  x: number;
  y: number;
}

/**
 * Critically damped spring toward `target` (Game Programming Gems 4, "smooth damp"), one frame.
 * Returns [position, velocity]. Position and velocity are both continuous whatever the target does.
 */
export function smoothDamp(pos: number, vel: number, target: number, frames: number): [number, number] {
  const omega = 2 / Math.max(frames, 0.001);
  const k = 1 / (1 + omega + 0.48 * omega * omega + 0.235 * omega * omega * omega);
  const d = pos - target;
  const t = (vel + omega * d) * 1;
  return [target + (d + t) * k, (vel - omega * t) * k];
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
    fx: p.x + p.w / 2,
    fy: feet,
    fvx: 0,
    fvy: 0,
    targetY: feet,
    lead: 0,
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

  // Horizontal: lead by the slow-averaged travel direction, then follow on a damped spring.
  const want = Math.max(-1, Math.min(1, p.vx / ct.leadFullSpeed));
  cam.lead += (want - cam.lead) / ct.leadFrames;
  const targetX = cx + cam.lead * ct.lookaheadX;
  [cam.fx, cam.fvx] = smoothDamp(cam.fx, cam.fvx, targetX, p.mode === 'dash' ? ct.smoothXDash : ct.smoothX);

  // Vertical: dead zone (the target holds while the feet stay in the window), fast-fall follow.
  let smoothY = ct.smoothY;
  const feetScreen = (feet - cam.y) / VIEW_H;
  if (p.vy > ct.fallFollowVy) {
    cam.targetY = feet + ct.fallLookahead;
    smoothY = ct.smoothYFall;
  } else if (p.grounded || p.mode === 'wallSlide' || feetScreen < ct.winTop || feetScreen > ct.winBot) {
    cam.targetY = feet;
  }
  [cam.fy, cam.fvy] = smoothDamp(cam.fy, cam.fvy, cam.targetY, smoothY);
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
