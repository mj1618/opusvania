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
 *
 * The view's size (`vw`, `vh`) is the real logical view (contract.ts `ViewSize`): at least the 16:9
 * safe area, more on a wider or taller window. Framing (the feet line, the vertical window) is
 * measured in the safe area, which is centred in the view, so every window shape frames her the
 * same and only sees more around; the clamp to the scene uses the real size.
 */
import type { Scene } from '../../sim/scene';
import type { GameState } from '../../sim/state';
import { type CameraView, SAFE_H, SAFE_W } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';
import { zoneAt, zoneBounds, zonesOf, zoneZoom } from './zones';

export interface CameraState {
  /** Free-follow view centre x and anchor-line y (feet level), before clamping. */
  fx: number;
  fy: number;
  /** Follow velocity (px/frame): the springs keep it continuous, so the view never jerks. */
  fvx: number;
  fvy: number;
  targetY: number;
  /** Her feet's y the last time she stood on the ground (a long fall is measured from it). */
  groundY: number;
  /** The vertical target after its own spring (`targetSmoothY`), and that spring's velocity. */
  ty: number;
  tvy: number;
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
  /** The view's size in world px at zoom 1 (the real logical view, >= the safe area). */
  vw: number;
  vh: number;
  /**
   * Camera zones (zones.ts, memory/level-kit.md): the zoom now (1 outside every zone) and its spring's
   * velocity; the eased shift (`ox`, `oy`, world px) that keeps the view inside the zone's bounds, and
   * its springs; the zone she is in ('' = none). On screen the view is `vw / zoom` x `vh / zoom` world px.
   */
  zoom: number;
  zvz: number;
  ox: number;
  oy: number;
  ovx: number;
  ovy: number;
  zone: string;
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

/** From the view's top edge to the line her feet rest on: the safe area's anchor line (world px at the zoom). */
function feetLine(cam: CameraState, ct: CameraTuning): number {
  return ((cam.vh - SAFE_H) / 2 + ct.anchorY * SAFE_H) / cam.zoom;
}

/** What the view shows in world px (its size over the zoom). */
function shownW(cam: CameraState): number {
  return cam.vw / cam.zoom;
}
function shownH(cam: CameraState): number {
  return cam.vh / cam.zoom;
}

function place(cam: CameraState, scene: Scene, ct: CameraTuning): void {
  const top = viewTop(scene, ct);
  const line = feetLine(cam, ct);
  const W = shownW(cam);
  const H = shownH(cam);
  cam.x = clampAxis(cam.fx - W / 2, 0, scene.width, W);
  cam.y = clampAxis(cam.fy - line, top, scene.height - top, H);
  // Held by the top or the bottom: the spring rests there too, so the view answers at once when
  // she comes back (a glide off the summit), not after the spring has crossed the slack.
  const fy = cam.y + line;
  // (Only a real clamp: `cam.y + line` can miss `cam.fy` by a rounding ulp, and zeroing the spring's
  // velocity on that made a fast follow stutter, every other frame, at half speed.)
  if (Math.abs(fy - cam.fy) > 1e-6) {
    if ((cam.fy < fy && cam.fvy < 0) || (cam.fy > fy && cam.fvy > 0)) cam.fvy = 0;
    cam.fy = fy;
  }
  // A camera zone's shift (eased: `stepZones`), then the scene's bounds again.
  if (cam.ox !== 0 || cam.oy !== 0) {
    cam.x = clampAxis(cam.x + cam.ox, 0, scene.width, W);
    cam.y = clampAxis(cam.y + cam.oy, top, scene.height - top, H);
  }
}

/**
 * Camera zones, once a sim frame (or at once with `snap`): the zoom eases toward the zone's (1 outside),
 * then the view's free position is placed, and the shift that would keep it inside the zone's bounds
 * eases in (and back out to 0 when she leaves). Springs throughout, so nothing jumps between zones.
 */
function stepZones(
  cam: CameraState,
  scene: Scene,
  cx: number,
  cy: number,
  ct: CameraTuning,
  snap = false,
): void {
  const zones = zonesOf(scene);
  if (zones.length === 0 && cam.zoom === 1 && cam.ox === 0 && cam.oy === 0) {
    place(cam, scene, ct);
    return;
  }
  const Z = ct.zones;
  const z = zoneAt(zones, cx, cy);
  cam.zone = z ? z.id : '';
  const want = z ? zoneZoom(z) : 1;
  if (snap) {
    cam.zoom = want;
    cam.zvz = 0;
  } else [cam.zoom, cam.zvz] = smoothDamp(cam.zoom, cam.zvz, want, Z.zoomFrames);
  // The free view (no shift) at this zoom, then the shift its bounds ask for.
  const ox = cam.ox;
  const oy = cam.oy;
  cam.ox = 0;
  cam.oy = 0;
  place(cam, scene, ct);
  const b = z ? zoneBounds(z) : null;
  const tx = b ? clampAxis(cam.x, b.x, b.w, shownW(cam)) - cam.x : 0;
  const ty = b ? clampAxis(cam.y, b.y, b.h, shownH(cam)) - cam.y : 0;
  if (snap) {
    cam.ox = tx;
    cam.oy = ty;
    cam.ovx = 0;
    cam.ovy = 0;
  } else {
    [cam.ox, cam.ovx] = smoothDamp(ox, cam.ovx, tx, Z.frames);
    [cam.oy, cam.ovy] = smoothDamp(oy, cam.ovy, ty, Z.frames);
    if (Math.abs(cam.ox) < 0.01 && Math.abs(cam.ovx) < 0.01 && tx === 0) cam.ox = cam.ovx = 0;
    if (Math.abs(cam.oy) < 0.01 && Math.abs(cam.ovy) < 0.01 && ty === 0) cam.oy = cam.ovy = 0;
  }
  if (!z && Math.abs(cam.zoom - 1) < 1e-4 && Math.abs(cam.zvz) < 1e-4) {
    cam.zoom = 1;
    cam.zvz = 0;
  }
  place(cam, scene, ct);
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

/**
 * A camera already settled on the player, for a view of vw x vh world px at zoom 1 (default: the
 * safe area).
 */
export function createCamera(
  s: GameState,
  scene: Scene,
  ct: CameraTuning = cameraTuning,
  vw: number = SAFE_W,
  vh: number = SAFE_H,
): CameraState {
  const p = s.player;
  const feet = p.y + p.h;
  const cam: CameraState = {
    fx: p.x + p.w / 2,
    fy: feet,
    fvx: 0,
    fvy: 0,
    targetY: feet,
    ty: feet,
    tvy: 0,
    groundY: feet,
    lead: 0,
    glide: 0,
    grounded: 0,
    still: 0,
    restX: 0,
    restY: 0,
    x: 0,
    y: 0,
    vw,
    vh,
    zoom: 1,
    zvz: 0,
    ox: 0,
    oy: 0,
    ovx: 0,
    ovy: 0,
    zone: '',
  };
  stepZones(cam, scene, p.x + p.w / 2, p.y + p.h / 2, ct, true);
  return cam;
}

/**
 * The window changed shape: the same follow state seen through a vw x vh view (re-clamped to the
 * scene). Nothing else moves, so a resize never jolts the springs.
 */
export function resizeCamera(
  cam: CameraState,
  scene: Scene,
  vw: number,
  vh: number,
  ct: CameraTuning = cameraTuning,
): void {
  if (cam.vw === vw && cam.vh === vh) return;
  cam.vw = vw;
  cam.vh = vh;
  place(cam, scene, ct);
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
    stepZones(cam, scene, cx, p.y + p.h / 2, ct);
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

  if (p.grounded) cam.groundY = feet;
  // Vertical: dead zone (the target holds while the feet stay in the window), fast-fall follow.
  let smoothY = ct.smoothY;
  /** 0..1: how far into a long fall (or the exit's drop) she is: the target's spring shortens with it. */
  let fastK = 0;
  // Where her feet are in the safe area (0 top, 1 bottom): the window is the same on every screen.
  const feetScreen = ((feet - cam.y) * cam.zoom - (cam.vh - SAFE_H) / 2) / SAFE_H;
  if (p.vy > ct.fallFollowVy && feet > cam.targetY + ct.fallBelow) {
    // A real fall (past the line the view rests on; coming down from a jump is not one).
    cam.targetY = feet + ct.fallLookahead;
    // A long fall (or the room's exit) gets the faster follow; a drop between ledges the usual one.
    smoothY = feet - cam.groundY > ct.realFallPx ? ct.smoothYFastFall : ct.smoothYFall;
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
  // Rooms that set `realFallPx`: below her last ground and falling, the view is led every frame, and
  // the lead and the follow's speed grow smoothly with the drop (`k` 0 -> 1 over `realFallPx`): a drop
  // between ledges gets a little lead on the usual follow, a long fall or the exit the full lead on the
  // fast one. Nothing switches in one frame.
  const drop = feet - cam.groundY - ct.fallBelow;
  if (ct.realFallPx > 0 && !p.grounded && p.vy > 0 && (drop > 0 || s.exit)) {
    const k = s.exit ? 1 : Math.min(1, Math.max(0, drop / ct.realFallPx)) ** 2;
    cam.targetY = Math.max(cam.targetY, feet + ct.fallLookahead * k);
    smoothY = ct.smoothYFall + (ct.smoothYFastFall - ct.smoothYFall) * k;
    fastK = k;
  } else if (s.exit && p.vy > 0) {
    // Leaving the room by a drop: lead her down every frame, so she falls through the middle of the
    // frame while the room fades out.
    cam.targetY = feet + ct.fallLookahead;
    smoothY = ct.smoothYFastFall;
    fastK = 1;
  }
  if (p.gliding) {
    // She is sinking: lead below her feet so the landing is in view. Only ever downward.
    cam.targetY = Math.max(cam.targetY, feet + G.lookDown * cam.glide);
    smoothY = G.smoothY;
  }
  // Rooms with the fall rule: the target never asks for a view past the scene's top or bottom, so the
  // springs ease into the bound instead of being stopped dead by the clamp (a fall toward a catch zone
  // or a drop exit at the room's foot hit 18-29 px/f² in one frame without this). Clamped before the
  // target's own spring, so the two springs in a row round the stop off.
  let target = cam.targetY;
  if (ct.realFallPx > 0) {
    // (Less a camera zone's shift: the view is the follow plus that shift, clamped once more.)
    const line = feetLine(cam, ct) - cam.oy;
    const lo = viewTop(scene, ct) + line;
    const hi = scene.height - shownH(cam) + line;
    if (hi >= lo) target = Math.min(hi, Math.max(lo, target));
  }
  // The target through its own spring first (when the room asks): the view's velocity never steps.
  if (ct.targetSmoothY > 0) {
    [cam.ty, cam.tvy] = smoothDamp(cam.ty, cam.tvy, target, ct.targetSmoothY * (1 - 0.5 * fastK));
    target = cam.ty;
  }
  [cam.fy, cam.fvy] = smoothDamp(cam.fy, cam.fvy, target, smoothY);
  stepZones(cam, scene, cx, p.y + p.h / 2, ct);
}

/** The view between two camera states (alpha 0 = prev, 1 = cur), with the current view's size (zoom 1 outside camera zones). */
export function lerpCamera(prev: CameraState, cur: CameraState, alpha: number): CameraView {
  const px = prev.x + shownW(prev) / 2;
  const py = prev.y + shownH(prev) / 2;
  return {
    x: px + (cur.x + shownW(cur) / 2 - px) * alpha,
    y: py + (cur.y + shownH(cur) / 2 - py) * alpha,
    zoom: prev.zoom + (cur.zoom - prev.zoom) * alpha,
    w: cur.vw,
    h: cur.vh,
  };
}
