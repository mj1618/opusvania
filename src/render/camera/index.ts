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
import { isGreybox, type Room } from '../../scene/room';
import { solidAt } from '../../sim/physics/aabb';
import type { Scene } from '../../sim/scene';
import type { GameState } from '../../sim/state';
import { type CameraView, SAFE_H, SAFE_W } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';
import { zoneAt, zoneBelow, zoneBounds, zoneLean, zonesOf, zoneZoom, zoneZoomFrames } from './zones';

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
  /** The gap look's eased lead (world px, `gapLook`) and its spring's velocity. */
  gapX: number;
  gapV: number;
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
  /** The slide (frames) of the zone she was last in (a zone's `frames`, else the tuning's). */
  zoneFrames?: number;
  /** 0..1: how far a fall is leading the view (the zones yield to it). */
  fallK: number;
  /**
   * World px the view may show past the room's floor (eased): falling into a floor exit the camera looks on
   * into the room below, so a fall across a room seam stays framed (the hollow oak's trunk, 7e1c353).
   */
  seam: number;
  seamV: number;
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
  const own = (scene as Room).camera?.headroom;
  return Math.min(0, (scene.ceilingY ?? 0) - (own ?? ct.headroom));
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

/**
 * `clampAxis` with a soft knee `k` px wide at each end: the view eases into an edge instead of being stopped
 * dead by it (its speed is continuous), and still never passes it. `k` 0 = `clampAxis`.
 */
export function softClampAxis(v: number, lo: number, size: number, view: number, k: number): number {
  if (size <= view || k <= 0) return clampAxis(v, lo, size, view);
  const hi = lo + size - view;
  const kk = Math.min(k, (hi - lo) / 2);
  if (v < lo + kk) return lo + kk - kk * (1 - Math.exp(-(lo + kk - v) / kk));
  if (v > hi - kk) return hi - kk + kk * (1 - Math.exp(-(v - (hi - kk)) / kk));
  return v;
}

function place(cam: CameraState, scene: Scene, ct: CameraTuning): void {
  const top = viewTop(scene, ct);
  const line = feetLine(cam, ct);
  const W = shownW(cam);
  const H = shownH(cam);
  const freeX = cam.fx - W / 2;
  const freeY = cam.fy - line;
  cam.x = clampAxis(freeX, 0, scene.width, W);
  cam.y = clampAxis(freeY, top, scene.height + cam.seam - top, H);
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
    cam.y = clampAxis(cam.y + cam.oy, top, scene.height + cam.seam - top, H);
  }
  // Zoomed by a zone: the room's edges take the view softly (a zoom-out by the oak's east wall stopped the view
  // dead, 18 px/f^2, plan r3). Blended in with the zoom, so at zoom 1 nothing changes. (Soft both times: a zone's
  // shift pushing the view back into an edge must not meet a hard stop either.)
  const Z = ct.zones;
  const k = Z.edgeKnee * Math.min(1, Math.abs(1 - cam.zoom) / Z.kneeBlend);
  if (k > 0) {
    const sh = scene.height + cam.seam - top;
    const bx = softClampAxis(freeX, 0, scene.width, W, k);
    const by = softClampAxis(freeY, top, sh, H, k);
    cam.x = cam.ox === 0 ? bx : softClampAxis(bx + cam.ox, 0, scene.width, W, k);
    cam.y = cam.oy === 0 ? by : softClampAxis(by + cam.oy, top, sh, H, k);
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
  flags: readonly string[] = [],
): void {
  const zones = zonesOf(scene);
  if (zones.length === 0 && cam.zoom === 1 && cam.ox === 0 && cam.oy === 0) {
    place(cam, scene, ct);
    return;
  }
  const Z = ct.zones;
  const z = zoneAt(zones, cx, cy, flags);
  cam.zone = z ? z.id : '';
  const want = z ? zoneZoom(z) : 1;
  if (snap) {
    cam.zoom = want;
    cam.zvz = 0;
  } else
    [cam.zoom, cam.zvz] = smoothDamp(
      cam.zoom,
      cam.zvz,
      want,
      zoneZoomFrames(z, Z.zoomFrames, cam.zoneFrames),
    );
  // The free view (no shift) at this zoom, then the shift its bounds ask for.
  const ox = cam.ox;
  const oy = cam.oy;
  cam.ox = 0;
  cam.oy = 0;
  place(cam, scene, ct);
  const b = z ? zoneBounds(z) : null;
  // A zone's lean (the Canopy r14: the den's end on the fallen cage, the crown's sit on the pair and the moon).
  const ln = zoneLean(z);
  const lx = ln ? (ln.x - (cam.x + shownW(cam) / 2)) * ln.k : 0;
  const ly = (ln ? (ln.y - (cam.y + shownH(cam) / 2)) * ln.k : 0) + zoneBelow(z);
  const tx = b ? clampAxis(cam.x + lx, b.x, b.w, shownW(cam)) - cam.x : lx;
  // A fall leads down even inside a zone: its vertical bounds yield as the fall's lead comes in.
  const ty = (b ? clampAxis(cam.y + ly, b.y, b.h, shownH(cam)) - cam.y : ly) * (1 - cam.fallK);
  if (snap) {
    cam.ox = tx;
    cam.oy = ty;
    cam.ovx = 0;
    cam.ovy = 0;
  } else {
    // A zone may set its own slide (`frames`: Lanternroot's chambers slide in 20); leaving one for none, its own.
    if (z) cam.zoneFrames = z.frames ?? Z.frames;
    const fr = z ? (z.frames ?? Z.frames) : (cam.zoneFrames ?? Z.frames);
    [cam.ox, cam.ovx] = smoothDamp(ox, cam.ovx, tx, fr);
    [cam.oy, cam.ovy] = smoothDamp(oy, cam.ovy, ty, fr * (1 - 0.5 * cam.fallK));
    if (Math.abs(cam.ox) < 0.01 && Math.abs(cam.ovx) < 0.01 && tx === 0) cam.ox = cam.ovx = 0;
    if (Math.abs(cam.oy) < 0.01 && Math.abs(cam.ovy) < 0.01 && ty === 0) cam.oy = cam.ovy = 0;
  }
  if (!z && Math.abs(cam.zoom - 1) < 1e-4 && Math.abs(cam.zvz) < 1e-4) {
    cam.zoom = 1;
    cam.zvz = 0;
  }
  place(cam, scene, ct);
}

/** The highest top under (x, y) that ends a fall (solid, one-way, catch zone; within her width), or far below. */
export function landBelow(scene: Scene, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const s of scene.solids)
    if (x + 18 >= s.x && x - 18 <= s.x + s.w && s.y >= y && s.y < best) best = s.y;
  for (const o of scene.oneWays)
    if (x + 18 >= o.x && x - 18 <= o.x + o.w && o.y >= y && o.y < best) best = o.y;
  // A catch zone ends a fall too (it puts her back): its top counts as ground.
  for (const c of scene.catches ?? []) if (x >= c.x && x <= c.x + c.w && c.y >= y && c.y < best) best = c.y;
  return best;
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
    gapX: 0,
    gapV: 0,
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
    fallK: 0,
    seam: 0,
    seamV: 0,
  };
  stepZones(cam, scene, p.x + p.w / 2, p.y + p.h / 2, ct, true, s.save.flags);
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
    stepZones(cam, scene, cx, p.y + p.h / 2, ct, false, s.save.flags);
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
  // A lip or a glide: lead toward the far side so the landing (or the wall she would meet) is in view.
  const gap = gapAhead(scene, p, ct);
  const GL = ct.gapLook;
  const gapWant = gap ? Math.sign(gap.x - cx) * Math.min(GL.lead, Math.abs(gap.x - cx) / 2) : 0;
  [cam.gapX, cam.gapV] = smoothDamp(cam.gapX, cam.gapV, gapWant, GL.ease);
  // (The usual lead counts toward it: the gap look only adds what is missing.)
  const usual = cam.lead * (ct.lookaheadX + G.extraX * cam.glide);
  const sg = Math.sign(cam.gapX);
  const lead = usual + sg * Math.max(0, Math.abs(cam.gapX) - usual * sg);
  const targetX = cx + lead + cam.restX;
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
  // The speed lead (feel review r2: at max fall her feet sat at 0.93-0.97), so the view shows the floor
  // before she reaches it.
  // Over a floor exit, falling: the view may look on past the floor into the room below (greybox rooms; a
  // painted room's bakes stop at its edge). Eased in and out, so the bound never jumps.
  const S = ct.seamLook;
  let seamWant = 0;
  if (S.px > 0 && isGreybox(scene as Room) && !p.grounded && p.vy > 0)
    for (const ex of scene.exits ?? [])
      if (
        ex.edge === 's' &&
        cx >= ex.from - S.margin &&
        cx <= ex.to + S.margin &&
        feet > scene.height - S.reach &&
        // (Nothing under her ends the fall first: a hop over a floor exit roofed by a mesh is no fall into it.)
        landBelow(scene, cx, feet) >= scene.height
      )
        seamWant = S.px;
  [cam.seam, cam.seamV] = smoothDamp(cam.seam, cam.seamV, seamWant, S.frames);
  if (cam.seam < 0.5 && seamWant === 0) cam.seam = cam.seamV = 0;
  const L = ct.fallLead;
  // From the first frame she descends, the lead grows with her fall speed (`vy0` -> `vy1`), never past
  // the ground under her (`landBelow`): the view starts down with her and stops with the floor in view.
  const u = Math.min(1, Math.max(0, (p.vy - L.vy0) / (L.vy1 - L.vy0)));
  const kv = !p.grounded && drop > 0 ? u * u * (3 - 2 * u) : 0;
  if (ct.realFallPx > 0 && !p.grounded && p.vy > 0 && (drop > 0 || s.exit)) {
    const k = s.exit ? 1 : Math.max(kv, Math.min(1, Math.max(0, drop / ct.realFallPx)) ** 2);
    const land = landBelow(scene, cx, feet);
    cam.targetY = Math.max(cam.targetY, Math.min(feet + ct.fallLookahead * k, land - L.landUp));
    smoothY = ct.smoothYFall + (ct.smoothYFastFall - ct.smoothYFall) * k;
    fastK = k;
  } else if (s.exit && p.vy > 0) {
    // Leaving the room by a drop: lead her down every frame, so she falls through the middle of the
    // frame while the room fades out.
    cam.targetY = feet + ct.fallLookahead;
    smoothY = ct.smoothYFastFall;
    fastK = 1;
  }
  cam.fallK = fastK;
  if (p.gliding) {
    // She is sinking: lead below her feet so the landing is in view. Only ever downward.
    cam.targetY = Math.max(cam.targetY, feet + G.lookDown * cam.glide);
    smoothY = G.smoothY;
    // Down to where the glide meets the world (the far ledge's face or the floor short of it), so a ledge out of
    // reach is seen to be out of reach; followed tighter, so the view does not lag her sink.
    if (gap && gap.y > feet) {
      cam.targetY = Math.max(cam.targetY, Math.min(gap.y, feet + GL.down));
      smoothY = GL.smoothY;
    }
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
    const hi = scene.height + cam.seam - shownH(cam) + line;
    if (hi >= lo) target = Math.min(hi, Math.max(lo, target));
  }
  // The target through its own spring first (when the room asks): the view's velocity never steps.
  if (ct.targetSmoothY > 0) {
    [cam.ty, cam.tvy] = smoothDamp(cam.ty, cam.tvy, target, ct.targetSmoothY * (1 - 0.55 * fastK));
    target = cam.ty;
  }
  [cam.fy, cam.fvy] = smoothDamp(cam.fy, cam.fvy, target, smoothY);
  stepZones(cam, scene, cx, p.y + p.h / 2, ct, false, s.save.flags);
}

/**
 * Where a gap ahead of her ends (`gapLook`), or null: in a glide, where her path (her speed, the glide's sink)
 * first meets a solid (the far ledge's face or top, or the floor short of it); standing or walking at a lip facing
 * a drop, the first ground across it.
 */
export function gapAhead(
  scene: Scene,
  p: GameState['player'],
  ct: CameraTuning = cameraTuning,
): { x: number; y: number } | null {
  const GL = ct.gapLook;
  const feet = p.y + p.h;
  if (p.gliding) {
    if (Math.abs(p.vx) < 0.5) return null;
    let x = p.x;
    let y = p.y;
    const vy = Math.max(p.vy, 0.5);
    for (let f = 1; f <= GL.frames; f++) {
      x += p.vx;
      y += vy;
      if (solidAt(scene, x, y, p.w, p.h)) return { x: x + p.w / 2, y: y + p.h };
    }
    return { x: x + p.w / 2, y: y + p.h };
  }
  if (!p.grounded) return null;
  const dir = p.facing;
  const toe = dir > 0 ? p.x + p.w : p.x;
  // At a lip: no ground right ahead of her toes.
  if (solidAt(scene, toe + dir * GL.near, feet, 1, 8)) return null;
  for (let d = GL.near + GL.step; d <= GL.scan; d += GL.step) {
    const x = toe + dir * d;
    const land = landBelow(scene, x, feet - 160);
    if (land <= feet + GL.below) return { x, y: land };
  }
  return null;
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
