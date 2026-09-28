/**
 * The camera (movement-spec §4): a pure TS module, no Pixi. It is stepped once per sim frame from
 * the post-step sim state and that frame's events, so it is deterministic and unit-testable
 * headless (tests/unit/camera.test.ts). The renderer keeps prev/curr and interpolates both the
 * camera and the player with the same alpha, then rounds to device pixels.
 *
 * Pipeline per frame: follow (x look-ahead, y platform snapping / fall follow) -> look up/down ->
 * camera zones (blended) -> clamp to room bounds -> [pre-shake view, used by tests] -> shake + kick.
 */
import type { SimEvent } from '../../sim/events';
import type { GameState } from '../../sim/index';
import { isHeld } from '../../sim/input';
import { defaultTuning } from '../../sim/tuning';
import type { CameraZone, Room } from '../../sim/world/rooms';
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
}

function feetOf(s: GameState) {
  const p = s.player;
  return { cx: p.x + p.w / 2, cy: p.y + p.h / 2, feet: p.y + p.h };
}

function zoneIndexAt(room: Room, x: number, y: number, current: number): number {
  const zs = room.cameraZones;
  const inside = (z: CameraZone) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
  const cur = zs[current];
  // Last zone entered wins: keep the current one while inside it.
  if (cur && inside(cur)) return current;
  return zs.findIndex(inside);
}

export function createCamera(s: GameState, room: Room, ct: CameraTuning = cameraTuning): CameraState {
  const f = feetOf(s);
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
    zone: zoneIndexAt(room, f.cx, f.cy, -1),
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
  };
  place(cam, room, ct);
  return cam;
}

function freeView(cam: CameraState, ct: CameraTuning) {
  return { x: cam.fx - VIEW_W / 2, y: cam.fy - ct.anchorY * VIEW_H + cam.look };
}

/** The view a zone asks for, given the free-follow view. */
function zoneView(room: Room, zi: number, vx: number, vy: number) {
  const z = room.cameraZones[zi];
  if (!z) return { x: vx, y: vy };
  switch (z.mode) {
    case 'lock':
      return { x: z.cx - VIEW_W / 2, y: z.cy - VIEW_H / 2 };
    case 'clampX':
      return { x: z.cx - VIEW_W / 2, y: vy };
    case 'clampY':
      return { x: vx, y: z.cy - VIEW_H / 2 };
    case 'bounds':
      return { x: clampAxis(vx, z.x, z.w, VIEW_W), y: clampAxis(vy, z.y, z.h, VIEW_H) };
  }
}

/** Clamps a view edge to [lo, lo + size]; centres it if the span is smaller than the view. */
function clampAxis(v: number, lo: number, size: number, view: number): number {
  if (size <= view) return lo + (size - view) / 2;
  return Math.min(Math.max(v, lo), lo + size - view);
}

const TS = defaultTuning.world.tileSize;

/** Target view: free follow, overridden by the active zone. Unclamped. */
function targetView(cam: CameraState, room: Room, ct: CameraTuning) {
  const free = freeView(cam, ct);
  return zoneView(room, cam.zone, free.x, free.y);
}

function clampView(room: Room, vx: number, vy: number) {
  return { x: clampAxis(vx, 0, room.width * TS, VIEW_W), y: clampAxis(vy, 0, room.height * TS, VIEW_H) };
}

function place(cam: CameraState, room: Room, ct: CameraTuning): void {
  const t = targetView(cam, room, ct);
  const vx = t.x + cam.offX;
  const vy = t.y + cam.offY;
  const c = clampView(room, vx, vy);
  cam.clampedX = Math.abs(c.x - vx) > 1e-6;
  cam.clampedY = Math.abs(c.y - vy) > 1e-6;
  cam.x = c.x;
  cam.y = c.y;
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

/** Steps the camera one sim frame. `events` are the events of that sim step. */
export function stepCamera(
  cam: CameraState,
  s: GameState,
  room: Room,
  events: readonly SimEvent[],
  ct: CameraTuning = cameraTuning,
): void {
  if (cam.roomId !== room.id || events.some((e) => e.type === 'roomEnter' || e.type === 'respawn')) {
    const fresh = createCamera(s, room, ct);
    Object.assign(cam, fresh, { trauma: cam.trauma });
  }
  cam.t++;
  const p = s.player;
  const f = feetOf(s);
  const dashing = p.state === 'dash';

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
  cam.fx += (targetX - cam.fx) * (dashing ? ct.lerpXDash : ct.lerpX);

  // Vertical: platform snapping, window, fast-fall follow.
  let lerpY = ct.lerpY;
  const feetScreen = (f.feet - cam.y) / VIEW_H;
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

  // Zones (last entered wins). A zone change leaves an offset that decays by zoneLerp per frame.
  const zi = zoneIndexAt(room, f.cx, f.cy, cam.zone);
  if (zi !== cam.zone) {
    const before = clampView(room, cam.x, cam.y);
    cam.zone = zi;
    const after = clampView(room, targetView(cam, room, ct).x, targetView(cam, room, ct).y);
    cam.offX = before.x - after.x;
    cam.offY = before.y - after.y;
  }
  cam.offX *= 1 - ct.zoneLerp;
  cam.offY *= 1 - ct.zoneLerp;
  place(cam, room, ct);

  // Trauma and kick (added after clamping; rooms draw a solid apron so this never shows void).
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

/** View centre (pre-shake), handy for tests and the debug API. */
export function viewCentre(cam: CameraState): { x: number; y: number } {
  return { x: cam.x + VIEW_W / 2, y: cam.y + VIEW_H / 2 };
}

/** Is a world rect (partly) inside the pre-shake view? */
export function inView(cam: CameraState, x: number, y: number, w: number, h: number): boolean {
  return x < cam.x + VIEW_W && x + w > cam.x && y < cam.y + VIEW_H && y + h > cam.y;
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
