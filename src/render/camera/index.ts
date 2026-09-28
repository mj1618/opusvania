/**
 * The camera (movement-spec §4, north-star §3.1): a pure TS module, no Pixi. It is stepped once
 * per sim frame from the post-step sim state and that frame's events, so it is deterministic and
 * unit-testable headless (tests/unit/camera.test.ts). The renderer keeps prev/curr and
 * interpolates both the camera and the player with the same alpha, then rounds to device pixels.
 *
 * Pipeline per frame: zoom (zone / shot target, critically damped) -> follow (x look-ahead,
 * y platform snapping / fall follow) -> look up/down -> seam bleed (edge exits) -> camera zones and
 * declared shots (blended on the clamped target, capped speed) -> clamp to room bounds (+ bleed)
 * -> [pre-shake view, used by tests] -> shake + kick.
 *
 * Units: everything is world px of the current room. The view is `VIEW_W / zoom` x `VIEW_H / zoom`
 * world px; the renderer scales the world by `zoom`. Across an edge exit the state is translated
 * into the new room's coordinates instead of being rebuilt, so the view never re-snaps.
 */
import type { SimEvent } from '../../sim/events';
import type { GameState } from '../../sim/index';
import { isHeld } from '../../sim/input';
import { defaultTuning } from '../../sim/tuning';
import type { CameraMode, CameraZoneDef, Room } from '../../sim/world/rooms';
import { type CameraTuning, cameraTuning } from './tuning';

/** Reference resolution. Everything renders at this size and the canvas is CSS-scaled to fit. */
export const VIEW_W = 1920;
export const VIEW_H = 1080;

export interface CameraState {
  roomId: string;
  /** Frames stepped (drives the shake noise). */
  t: number;
  /** Free-follow view centre x and anchor-line y (feet level), before zones and clamping. */
  fx: number;
  fy: number;
  targetY: number;
  focusDir: number;
  /** Reversal in progress: direction and where it started. */
  revDir: number;
  revStartX: number;
  look: number;
  lookTimer: number;
  /** Active zone index (-1 none). */
  zone: number;
  /** Blend offset: the jump in target view when the zone changed, decaying by zoneLerp per frame. */
  offX: number;
  offY: number;
  /** View top-left after clamping, before shake. */
  x: number;
  y: number;
  /** True when a room bound clamped the view this frame (framing rules yield to bounds). */
  clampedX: boolean;
  clampedY: boolean;
  trauma: number;
  kickX: number;
  shakeX: number;
  shakeY: number;
  /** Render zoom (the view is VIEW_W / zoom world px wide), its velocity and its target. */
  zoom: number;
  zoomV: number;
  zoomTarget: number;
  /** Px the view may run past each room bound this frame (edge exits nearby). */
  bleedN: number;
  bleedE: number;
  bleedS: number;
  bleedW: number;
  /** An edge transition is running: on arrival the state moves by -(edgeDX, edgeDY) px. */
  edgePending: boolean;
  edgeDX: number;
  edgeDY: number;
  /** Declared shot in progress: its zone (-1 none), frames since it started, frames held framed. */
  shotZone: number;
  shotT: number;
  shotHeld: number;
  /** `roomId#zone` of the shots already played (once per session unless the zone repeats). */
  shotsSeen: string[];
  /** Player centre (room px) this frame: a declared shot never frames the player out. */
  px: number;
  py: number;
}

/** A camera zone with the render-only fields resolved (px, after padding). */
export interface CamZone {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: CameraMode;
  /** View centre (lock/clampX/clampY) or bias point (frame), px. */
  cx: number;
  cy: number;
  zoom: number | undefined;
  weight: number;
  shot: {
    x: number;
    y: number;
    w: number;
    h: number;
    zoom: number | undefined;
    hold: number;
    repeat: boolean;
  } | null;
}

const TS = defaultTuning.world.tileSize;
const zoneCache = new WeakMap<Room, CamZone[]>();

/** The room's camera zones with zoom / weight / shot (read from the room file; cached per room). */
export function cameraZones(room: Room): CamZone[] {
  const hit = zoneCache.get(room);
  if (hit) return hit;
  const defs: CameraZoneDef[] = room.file?.cameraZones ?? [];
  const out = room.cameraZones.map((z, i): CamZone => {
    const d = defs[i];
    const s = d?.shot;
    return {
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      mode: z.mode,
      cx: z.cx,
      cy: z.cy,
      zoom: d?.zoom,
      weight: d?.weight ?? 0.5,
      shot: s
        ? {
            x: (s.rect[0] + room.padX) * TS,
            y: (s.rect[1] + room.padY) * TS,
            w: s.rect[2] * TS,
            h: s.rect[3] * TS,
            zoom: s.zoom,
            hold: s.hold,
            repeat: s.repeat,
          }
        : null,
    };
  });
  zoneCache.set(room, out);
  return out;
}

/** Zoom a zone holds while the player is inside it. */
export function zoneZoom(z: CamZone | undefined, ct: CameraTuning = cameraTuning): number {
  if (!z) return ct.zoomDefault;
  if (z.zoom !== undefined) return z.zoom;
  return z.mode === 'open' ? ct.zoomOpen : z.mode === 'vista' ? ct.zoomVista : ct.zoomDefault;
}

/** Zoom of a declared shot: its own, else the largest zoom that fits its rect. */
export function shotZoom(shot: NonNullable<CamZone['shot']>, ct: CameraTuning = cameraTuning): number {
  const fit = Math.min(VIEW_W / shot.w, VIEW_H / shot.h);
  return clampZoom(shot.zoom ?? fit, ct);
}

function clampZoom(z: number, ct: CameraTuning): number {
  return Math.min(ct.zoomMax, Math.max(ct.zoomMin, z));
}

/** View size in world px at a zoom. */
export function viewSize(zoom: number): { w: number; h: number } {
  return { w: VIEW_W / zoom, h: VIEW_H / zoom };
}

function feetOf(s: GameState) {
  const p = s.player;
  return { cx: p.x + p.w / 2, cy: p.y + p.h / 2, feet: p.y + p.h };
}

function zoneIndexAt(room: Room, x: number, y: number, current: number): number {
  const zs = room.cameraZones;
  const inside = (z: { x: number; y: number; w: number; h: number }) =>
    x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
  const cur = zs[current];
  // Last zone entered wins: keep the current one while inside it.
  if (cur && inside(cur)) return current;
  return zs.findIndex(inside);
}

export function createCamera(s: GameState, room: Room, ct: CameraTuning = cameraTuning): CameraState {
  const f = feetOf(s);
  const zone = zoneIndexAt(room, f.cx, f.cy, -1);
  const zoom = clampZoom(zoneZoom(cameraZones(room)[zone], ct), ct);
  const cam: CameraState = {
    roomId: room.id,
    t: 0,
    fx: f.cx + s.player.facing * ct.lookaheadX,
    fy: f.feet,
    targetY: f.feet,
    focusDir: s.player.facing,
    revDir: 0,
    revStartX: s.player.x,
    look: 0,
    lookTimer: 0,
    zone,
    offX: 0,
    offY: 0,
    x: 0,
    y: 0,
    clampedX: false,
    clampedY: false,
    trauma: 0,
    kickX: 0,
    shakeX: 0,
    shakeY: 0,
    zoom,
    zoomV: 0,
    zoomTarget: zoom,
    bleedN: 0,
    bleedE: 0,
    bleedS: 0,
    bleedW: 0,
    edgePending: false,
    edgeDX: 0,
    edgeDY: 0,
    shotZone: -1,
    shotT: 0,
    shotHeld: 0,
    shotsSeen: [],
    px: f.cx,
    py: f.cy,
  };
  updateBleed(cam, s, room, ct);
  place(cam, room, ct);
  return cam;
}

function freeView(cam: CameraState, ct: CameraTuning) {
  const v = viewSize(cam.zoom);
  return { x: cam.fx - v.w / 2, y: cam.fy - ct.anchorY * v.h + cam.look };
}

/** The view a zone (or its declared shot) asks for, given the free-follow view. */
function zoneView(cam: CameraState, room: Room, vx: number, vy: number, ct: CameraTuning) {
  const zs = cameraZones(room);
  const { w: vw, h: vh } = viewSize(cam.zoom);
  const shot = zs[cam.shotZone]?.shot;
  if (shot) {
    // Centre on the shot, but keep the player inside the view's inner margin (input stays live).
    const mx = vw * ct.shotPlayerMargin;
    const my = vh * ct.shotPlayerMargin;
    const x = shot.x + shot.w / 2 - vw / 2;
    const y = shot.y + shot.h / 2 - vh / 2;
    return {
      x: Math.min(Math.max(x, cam.px + mx - vw), cam.px - mx),
      y: Math.min(Math.max(y, cam.py + my - vh), cam.py - my),
    };
  }
  const z = zs[cam.zone];
  if (!z) return { x: vx, y: vy };
  switch (z.mode) {
    case 'lock':
      return { x: z.cx - vw / 2, y: z.cy - vh / 2 };
    case 'clampX':
      return { x: z.cx - vw / 2, y: vy };
    case 'clampY':
      return { x: vx, y: z.cy - vh / 2 };
    case 'bounds':
      return { x: clampAxis(vx, z.x, z.w, vw), y: clampAxis(vy, z.y, z.h, vh) };
    case 'frame':
      return { x: vx + (z.cx - (vx + vw / 2)) * z.weight, y: vy + (z.cy - (vy + vh / 2)) * z.weight };
    case 'open':
    case 'vista':
      return { x: vx, y: vy };
  }
}

/** Clamps a view edge to [lo, lo + size]; centres it if the span is smaller than the view. */
function clampAxis(v: number, lo: number, size: number, view: number): number {
  if (size <= view) return lo + (size - view) / 2;
  return Math.min(Math.max(v, lo), lo + size - view);
}

/** Target view: free follow, overridden by the active zone. Unclamped. */
function targetView(cam: CameraState, room: Room, ct: CameraTuning) {
  const free = freeView(cam, ct);
  return zoneView(cam, room, free.x, free.y, ct);
}

/** Clamps a view top-left to the room plus this frame's seam bleed. */
function clampView(cam: CameraState, room: Room, vx: number, vy: number) {
  const { w: vw, h: vh } = viewSize(cam.zoom);
  const rw = room.width * TS;
  const rh = room.height * TS;
  return {
    x: clampAxis(vx, -cam.bleedW, rw + cam.bleedW + cam.bleedE, vw),
    y: clampAxis(vy, -cam.bleedN, rh + cam.bleedN + cam.bleedS, vh),
  };
}

/** Target view clamped to the room: the basis the zone blend offset is measured and applied on. */
function clampedTarget(cam: CameraState, room: Room, ct: CameraTuning) {
  const t = targetView(cam, room, ct);
  const c = clampView(cam, room, t.x, t.y);
  return { x: c.x, y: c.y, clampedX: Math.abs(c.x - t.x) > 1e-6, clampedY: Math.abs(c.y - t.y) > 1e-6 };
}

function place(cam: CameraState, room: Room, ct: CameraTuning): void {
  // The blend offset is added to the *clamped* target (the same basis it was measured on at the
  // zone change), then clamped again. Adding it to the unclamped target turned blends into cuts
  // whenever the free-follow target was past a room bound (L2 playtest P1).
  const t = clampedTarget(cam, room, ct);
  const c = clampView(cam, room, t.x + cam.offX, t.y + cam.offY);
  cam.clampedX = t.clampedX || Math.abs(c.x - (t.x + cam.offX)) > 1e-6;
  cam.clampedY = t.clampedY || Math.abs(c.y - (t.y + cam.offY)) > 1e-6;
  cam.x = c.x;
  cam.y = c.y;
}

/** Re-measures the blend offset so the view stays where it is while the target jumps. */
function rebase(cam: CameraState, room: Room, ct: CameraTuning): void {
  const after = clampedTarget(cam, room, ct);
  cam.offX = cam.x - after.x;
  cam.offY = cam.y - after.y;
}

/**
 * Seam bleed (level-toolchain §5.5): near an edge exit the room bound on that side relaxes by
 * (half view + bleedPadPx - distance from the player's centre to the exit span), so the view runs
 * on into the neighbour, and the same rule on the other side of the seam means nothing snaps.
 */
function updateBleed(cam: CameraState, s: GameState, room: Room, ct: CameraTuning): void {
  cam.bleedN = cam.bleedE = cam.bleedS = cam.bleedW = 0;
  if (room.exits.length === 0) return;
  const { w: vw, h: vh } = viewSize(cam.zoom);
  const f = feetOf(s);
  const rw = room.width * TS;
  const rh = room.height * TS;
  for (const x of room.exits) {
    const a = x.from * TS;
    const b = (x.to + 1) * TS;
    const horiz = x.side === 'n' || x.side === 's';
    const along = horiz ? f.cx : f.cy;
    const da = along < a ? a - along : along > b ? along - b : 0;
    const perp = x.side === 'n' ? f.cy : x.side === 's' ? rh - f.cy : x.side === 'w' ? f.cx : rw - f.cx;
    const dp = Math.max(0, perp);
    const d = Math.sqrt(da * da + dp * dp);
    const bleed = Math.max(0, (horiz ? vh : vw) / 2 + ct.bleedPadPx - d);
    if (x.side === 'n') cam.bleedN = Math.max(cam.bleedN, bleed);
    else if (x.side === 's') cam.bleedS = Math.max(cam.bleedS, bleed);
    else if (x.side === 'e') cam.bleedE = Math.max(cam.bleedE, bleed);
    else cam.bleedW = Math.max(cam.bleedW, bleed);
  }
}

/** Moves every room-px field of the camera by (dx, dy) (edge exits: into the next room's px). */
export function translateCamera(cam: CameraState, dx: number, dy: number): void {
  cam.fx += dx;
  cam.fy += dy;
  cam.targetY += dy;
  cam.revStartX += dx;
  cam.x += dx;
  cam.y += dy;
}

/** Arrival through an edge exit: keep the view at its world position and blend into the new room. */
function crossSeam(cam: CameraState, s: GameState, room: Room, ct: CameraTuning): void {
  translateCamera(cam, -cam.edgeDX, -cam.edgeDY);
  cam.roomId = room.id;
  cam.edgePending = false;
  cam.shotZone = -1;
  const f = feetOf(s);
  cam.px = f.cx;
  cam.py = f.cy;
  cam.zone = zoneIndexAt(room, f.cx, f.cy, -1);
  updateBleed(cam, s, room, ct);
  rebase(cam, room, ct);
}

/** 1-D value noise in [-1, 1] from an integer hash (render RNG, deterministic per seed). */
export function valueNoise(seed: number, u: number): number {
  const i = Math.floor(u);
  const f = u - i;
  const h = (n: number) => {
    let x = Math.imul(n ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return ((x >>> 0) / 4294967295) * 2 - 1;
  };
  const s = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * s;
}

/** Zoom target: the shot's, else the zone's; rooms with a live enemy stay at >= zoomEnemyMin. */
function zoomTargetOf(cam: CameraState, s: GameState, room: Room, ct: CameraTuning): number {
  const zs = cameraZones(room);
  const shot = zs[cam.shotZone]?.shot;
  let z = shot ? shotZoom(shot, ct) : zoneZoom(zs[cam.zone], ct);
  if (s.local.enemies.some((e) => e.hp > 0)) z = Math.max(z, ct.zoomEnemyMin);
  return clampZoom(z, ct);
}

/** Critically damped spring toward the target, speed-capped, snapping when settled. */
function stepZoom(cam: CameraState, ct: CameraTuning): void {
  const w = ct.zoomOmega;
  const d = cam.zoomTarget - cam.zoom;
  cam.zoomV += d * w * w - cam.zoomV * 2 * w;
  cam.zoomV = Math.max(-ct.zoomMaxRate, Math.min(ct.zoomMaxRate, cam.zoomV));
  cam.zoom += cam.zoomV;
  if (Math.abs(cam.zoomTarget - cam.zoom) < ct.zoomSnap && Math.abs(cam.zoomV) < ct.zoomSnap) {
    cam.zoom = cam.zoomTarget;
    cam.zoomV = 0;
  }
}

/** Steps the camera one sim frame. `events` are the events of that sim step. */
export function stepCamera(
  cam: CameraState,
  s: GameState,
  room: Room,
  events: readonly SimEvent[],
  ct: CameraTuning = cameraTuning,
): void {
  if (cam.roomId !== room.id || events.some((e) => e.type === 'roomEnter' || e.type === 'respawn')) {
    if (cam.edgePending && cam.roomId !== room.id) crossSeam(cam, s, room, ct);
    else {
      const fresh = createCamera(s, room, ct);
      Object.assign(cam, fresh, { trauma: cam.trauma, shotsSeen: cam.shotsSeen });
    }
  }
  // An edge transition started (or is running): remember the offset for the arrival step.
  const off = s.transition?.offset;
  cam.edgePending = !!off;
  cam.edgeDX = off ? off[0] : 0;
  cam.edgeDY = off ? off[1] : 0;

  cam.t++;
  const p = s.player;
  const f = feetOf(s);
  cam.px = f.cx;
  cam.py = f.cy;
  const dashing = p.state === 'dash';

  // Zoom first: every size below uses this frame's view.
  cam.zoomTarget = zoomTargetOf(cam, s, room, ct);
  stepZoom(cam, ct);
  const vh = VIEW_H / cam.zoom;

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
  const targetX = f.cx + cam.focusDir * ct.lookaheadX;
  const panMax = Math.max(ct.panMaxX, Math.abs(p.vx) * ct.panMaxVxMult);
  const stepX = (targetX - cam.fx) * (dashing ? ct.lerpXDash : ct.lerpX);
  cam.fx += Math.max(-panMax, Math.min(panMax, stepX));

  // Vertical: platform snapping, window, fast-fall follow.
  let lerpY = ct.lerpY;
  const feetScreen = (f.feet - cam.y) / vh;
  if (p.vy > ct.fallFollowVy) {
    cam.targetY = f.feet + ct.fallLookahead;
    lerpY = ct.lerpYFall;
  } else if (p.grounded || p.state === 'wallSlide' || feetScreen < ct.winTop || feetScreen > ct.winBot) {
    cam.targetY = f.feet;
  }
  cam.fy += (cam.targetY - cam.fy) * lerpY;

  // Look up / down.
  const inp = s.prevInput;
  const up = isHeld(inp, 'up');
  const down = isHeld(inp, 'down');
  const noX = !isHeld(inp, 'left') && !isHeld(inp, 'right');
  const looking = p.grounded && noX && up !== down && p.state === 'normal';
  cam.lookTimer = looking ? cam.lookTimer + 1 : 0;
  const lookTarget = looking && cam.lookTimer >= ct.lookDelay ? (up ? -ct.lookUp : ct.lookDown) : 0;
  cam.look += (lookTarget - cam.look) * ct.lookLerp;

  updateBleed(cam, s, room, ct);

  // Zones (last entered wins) and declared shots. A change of framing leaves an offset that decays
  // by zoneLerp per frame.
  const zs = cameraZones(room);
  const zi = zoneIndexAt(room, f.cx, f.cy, cam.zone);
  if (zi !== cam.zone) {
    cam.zone = zi;
    cam.shotZone = -1;
    const shot = zs[zi]?.shot;
    const key = `${room.id}#${zi}`;
    if (shot && (shot.repeat || !cam.shotsSeen.includes(key))) {
      cam.shotZone = zi;
      cam.shotT = 0;
      cam.shotHeld = 0;
      if (!cam.shotsSeen.includes(key)) cam.shotsSeen.push(key);
    }
    rebase(cam, room, ct);
  } else if (cam.shotZone >= 0) {
    const shot = zs[cam.shotZone]?.shot;
    cam.shotT++;
    const framed =
      Math.hypot(cam.offX, cam.offY) <= ct.shotArrivePx &&
      Math.abs(cam.zoom - cam.zoomTarget) <= ct.shotZoomEps;
    if (framed) cam.shotHeld++;
    if (!shot || cam.shotHeld >= shot.hold || cam.shotT >= ct.shotMaxFrames) {
      cam.shotZone = -1;
      rebase(cam, room, ct);
    }
  }
  // Exponential ease, capped so a long blend starts as a pan instead of a lurch.
  let dx = cam.offX * ct.zoneLerp;
  let dy = cam.offY * ct.zoneLerp;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > ct.zoneBlendMaxPx) {
    dx *= ct.zoneBlendMaxPx / d;
    dy *= ct.zoneBlendMaxPx / d;
  }
  cam.offX -= dx;
  cam.offY -= dy;
  place(cam, room, ct);

  // Trauma and kick (added after clamping; beyond the room the renderer draws the neighbours).
  for (const e of events) {
    if (e.type === 'land' && e.hard) cam.trauma = Math.min(1, cam.trauma + ct.traumaHardLand);
    else if (e.type === 'death') cam.trauma = Math.min(1, cam.trauma + ct.traumaDeath);
    else if (e.type === 'dashStart') cam.kickX += e.dir * ct.dashKickPx;
  }
  const amp = ct.shakeMaxPx * cam.trauma * cam.trauma;
  const u = (cam.t * ct.shakeHz) / 60;
  cam.shakeX = amp * valueNoise(ct.shakeSeed, u) + cam.kickX;
  cam.shakeY = amp * valueNoise(ct.shakeSeed + 1, u + 17.3);
  cam.trauma = Math.max(0, cam.trauma - ct.traumaDecay);
  cam.kickX *= ct.dashKickDecay;
}

/** View centre (pre-shake), handy for tests, audio and the debug API. */
export function viewCentre(cam: CameraState): { x: number; y: number } {
  const v = viewSize(cam.zoom);
  return { x: cam.x + v.w / 2, y: cam.y + v.h / 2 };
}

/** Is a world rect (partly) inside the pre-shake view? */
export function inView(cam: CameraState, x: number, y: number, w: number, h: number): boolean {
  const v = viewSize(cam.zoom);
  return x < cam.x + v.w && x + w > cam.x && y < cam.y + v.h && y + h > cam.y;
}

/** Legacy helper (Phase 0): centre on a point, clamped to the room. */
export function clampCamera(
  focusX: number,
  focusY: number,
  roomW: number,
  roomH: number,
  viewW = VIEW_W,
  viewH = VIEW_H,
) {
  return {
    x: Math.round(clampAxis(focusX - viewW / 2, 0, roomW, viewW)),
    y: Math.round(clampAxis(focusY - viewH / 2, 0, roomH, viewH)),
  };
}
