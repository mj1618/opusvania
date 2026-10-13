/**
 * The follow camera: a pure TS module, no Pixi. It is stepped once per sim frame from the
 * post-step sim state, so it is deterministic and unit-testable headless. The render driver keeps
 * the previous and current CameraState and interpolates them with the same alpha as the player.
 *
 * Per frame: horizontal look-ahead from averaged travel (further in a glide), spring follow -> vertical
 * dead zone / landing band / fall follow / glide look-down -> clamp to the scene bounds, with headroom
 * above the scene top (`viewTop`). Standing still at a lantern or the heart eases the view toward it;
 * while she is faded the view holds. Soft everywhere: nothing snaps except on a `spawn` event (and
 * the re-form's snap is covered by a render-side pan: `reform.ts`).
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
  /** 0..1: how far the glide framing (longer look-ahead, look-down) is in. */
  glide: number;
  /** Frames she has been on the ground without a break; frames she has stood still. */
  grounded: number;
  still: number;
  /** Eased offset toward the lantern / heart she is standing at (world px). */
  restX: number;
  restY: number;
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

/**
 * The highest the view's top edge can go (world y, <= 0): `headroom` above the scene's canopy ceiling.
 * The layer tree builds its coverage from this, so a change here grows the layers too.
 */
export function viewTop(scene: Scene, ct: CameraTuning = cameraTuning): number {
  return Math.min(0, (scene.ceilingY ?? 0) - ct.headroom);
}

function place(cam: CameraState, scene: Scene, ct: CameraTuning): void {
  const top = viewTop(scene, ct);
  cam.x = clampAxis(cam.fx - VIEW_W / 2, 0, scene.width, VIEW_W);
  cam.y = clampAxis(cam.fy - ct.anchorY * VIEW_H, top, scene.height - top, VIEW_H);
  // Held by the top or the bottom: the spring rests there too, so the view answers at once when
  // she comes back (a glide off the summit), not after the spring has crossed the slack.
  const fy = cam.y + ct.anchorY * VIEW_H;
  if (fy !== cam.fy) {
    if ((cam.fy < fy && cam.fvy < 0) || (cam.fy > fy && cam.fvy > 0)) cam.fvy = 0;
    cam.fy = fy;
  }
}

/** Where the view should lean while she stands still at (cx, feet): toward a lantern or the heart in reach. */
export function restOffset(
  cx: number,
  feet: number,
  scene: Scene,
  ct: CameraTuning = cameraTuning,
): { x: number; y: number } {
  const R = ct.rest;
  let best: { x: number; y: number } | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  const spots = scene.heart ? [...(scene.lanterns ?? []), scene.heart] : (scene.lanterns ?? []);
  for (const o of spots) {
    const d = Math.abs(o.x - cx);
    if (d > R.reachX || Math.abs(o.y - feet) > R.reachY || d >= bestD) continue;
    best = o;
    bestD = d;
  }
  if (!best) return { x: 0, y: 0 };
  return { x: Math.max(-R.maxX, Math.min(R.maxX, (best.x - cx) * R.share)), y: -R.lift };
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
    glide: 0,
    grounded: 0,
    still: 0,
    restX: 0,
    restY: 0,
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

  // Faded: the view holds where she fell (the springs run out; the re-form's pan starts from here).
  if (p.faded > 0) {
    [cam.fx, cam.fvx] = smoothDamp(cam.fx, cam.fvx, cam.fx, ct.smoothX);
    [cam.fy, cam.fvy] = smoothDamp(cam.fy, cam.fvy, cam.fy, ct.smoothY);
    cam.targetY = cam.fy;
    place(cam, scene, ct);
    return;
  }

  // Standing still at a lantern or the heart: lean toward it, eased in and out.
  cam.grounded = p.grounded ? cam.grounded + 1 : 0;
  cam.still = p.grounded && Math.abs(p.vx) < 0.5 ? cam.still + 1 : 0;
  const rest = cam.still > ct.rest.frames ? restOffset(cx, feet, scene, ct) : { x: 0, y: 0 };
  cam.restX += (rest.x - cam.restX) / ct.rest.ease;
  cam.restY += (rest.y - cam.restY) / ct.rest.ease;

  // Horizontal: lead by the slow-averaged travel direction (further, and sooner, in a glide), then
  // follow on a damped spring.
  const G = ct.glide;
  cam.glide += ((p.gliding ? 1 : 0) - cam.glide) / (p.gliding ? G.easeIn : G.easeOut);
  const want = Math.max(-1, Math.min(1, p.vx / ct.leadFullSpeed));
  cam.lead += (want - cam.lead) / (ct.leadFrames + (G.leadFrames - ct.leadFrames) * cam.glide);
  const targetX = cx + cam.lead * (ct.lookaheadX + G.extraX * cam.glide) + cam.restX;
  [cam.fx, cam.fvx] = smoothDamp(cam.fx, cam.fvx, targetX, p.mode === 'dash' ? ct.smoothXDash : ct.smoothX);

  // Vertical: dead zone (the target holds while the feet stay in the window), fast-fall follow.
  let smoothY = ct.smoothY;
  const feetScreen = (feet - cam.y) / VIEW_H;
  if (p.vy > ct.fallFollowVy && feet > cam.targetY + ct.fallBelow) {
    // A real fall (past the line the view rests on; coming down from a jump is not one).
    cam.targetY = feet + ct.fallLookahead;
    smoothY = ct.smoothYFall;
  } else if (p.mode === 'wallSlide' || feetScreen < ct.winTop || feetScreen > ct.winBot) {
    cam.targetY = feet;
  } else if (p.grounded) {
    // A landing near the line the view rests on leaves it alone (no bob from hop to hop); staying
    // on the ground settles it on her feet.
    // Just out of a glide the look-down runs out with the glide share, so a chain of glides (land,
    // run, take off again) keeps one line instead of rising at every landing.
    const line = feet + cam.restY + G.lookDown * cam.glide;
    const d = line - cam.targetY;
    if (cam.grounded > ct.settleFrames || cam.glide > 0.02 || d < -ct.landUp || d > ct.landDown)
      cam.targetY = line;
  }
  if (p.gliding) {
    // She is sinking: lead below her feet so the landing is in view. Only ever downward.
    cam.targetY = Math.max(cam.targetY, feet + G.lookDown * cam.glide);
    smoothY = G.smoothY;
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
