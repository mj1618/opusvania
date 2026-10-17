/**
 * The fall camera in every wood room (chunk-1 feel review, problem 5): wood-hatch's round-4 fall block
 * (`realFallPx` 250, `targetSmoothY` 10, `fallLookahead` 320; `smoothYFastFall` 6, not the hatch's 5:
 * with 5 the onset of the long straight drops here peaked at 8.2-8.7 px/f²) is in every greybox room of
 * the wood, and the follow camera, stepped headless beside the sim, never lurches (peak vertical
 * acceleration under 8 px/f²) and keeps her feet in the frame on three naive runs from each room's
 * spawn: a runner that hops every edge and wall, and walkers that step off every edge to the east and
 * to the west. A run ends at an exit, a fall catch, a blow or a fade. Her feet are measured above the
 * room's last `FOOT` px only (a catch or a drop exit at the room's foot is under the lowest view) and
 * outside camera zones (a `fit` zone frames the room as its designer chose: R7's whole-hub view puts her
 * feet at 0.95 on purpose).
 * Measured 2026-10-17: before (the default rule) feet reached 1.06-1.13 of the frame in R2, R5, R6,
 * R9, R11; now at most 0.95, and the peak acceleration is 7.1 (R2's drop to the exit).
 */
import { describe, expect, it } from 'vitest';
import { createCamera, landBelow, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { type CameraTuning, cameraFor, cameraTuning } from '../../src/render/camera/tuning';
import { SAFE_H } from '../../src/render/contract';
import { getRoom, ROOM_IDS } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { solidAt } from '../../src/sim/physics/aabb';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const R = ActionBit.right;
const L = ActionBit.left;
const J = ActionBit.jump;
/** The strip at the room's bottom the view cannot go below (a catch zone, a drop exit live there). */
const FOOT = 200;
/** A fall this long or longer must show the floor coming (feet at most `FALL_FEET` of the frame). */
const FALL = 300;
const FALL_FEET = 0.8;
const NEAR = 64;

/** The wood's greybox rooms (wood-hatch, painted, has its own run in rooms.test.ts). */
const WOOD = ROOM_IDS.filter((id) => id.startsWith('wood-') && id !== 'wood-hatch');

function groundAhead(scene: Scene, st: GameState, dir: number, ahead: number): boolean {
  const p = st.player;
  const x = dir > 0 ? p.x + p.w + ahead : p.x - ahead - 1;
  return solidAt(scene, x, p.y + p.h, 1, 16);
}

interface CamRun {
  frames: number;
  maxA: number;
  feetLo: number;
  feetHi: number;
  /** The lowest her feet got on screen while they were above the room's foot (`FOOT`), outside camera zones. */
  feetHiFree: number;
  /** The lowest her feet got on screen in a fall of more than `FALL` px (zones included), and where. */
  fallFeet: number;
  fallAt: string;
  /** The frame of the peak acceleration, and where her feet were then. */
  atA: number;
  atX: number;
  atY: number;
}

/** One naive run: `dir` held, hopping edges and walls when `hop`; the camera stepped beside it. */
function camRun(room: string, dir: 1 | -1, hop: boolean, ct?: CameraTuning): CamRun {
  const scene = getRoom(room);
  const t = cloneTuning(defaultTuning);
  const events: SimEvent[] = [];
  const s = createState(1, t, scene, events);
  const tune = ct ?? cameraFor(scene);
  const cam = createCamera(s, scene, tune);
  let prevY = lerpCamera(cam, cam, 1).y;
  let prevV = 0;
  let maxA = 0;
  let feetLo = 1;
  let feetHi = 0;
  let feetHiFree = 0;
  let fallFeet = 0;
  let fallAt = '';
  let ground = s.player.y + s.player.h;
  let hold = 0;
  let f = 0;
  let atA = 0;
  let atX = 0;
  let atY = 0;
  const key = dir > 0 ? R : L;
  for (; f < 60 * 25; f++) {
    const p = s.player;
    if (hop && hold === 0 && p.grounded && (p.wallDir === dir || !groundAhead(scene, s, dir, 12))) hold = 14;
    const from = events.length;
    step(s, key | (hold > 0 ? J : 0), t, scene, events);
    if (hold > 0) hold--;
    const fresh = events.slice(from);
    // A catch, a fade or a room exit: the run is over (each has its own camera rules, tested elsewhere).
    if (s.exit || s.caught || s.player.faded > 0) break;
    if (fresh.some((e) => e.type === 'spawn' || e.type === 'fallCatch' || e.type === 'hurt')) break;
    stepCamera(cam, s, scene, tune);
    const v = lerpCamera(cam, cam, 1);
    const vy = v.y - prevY;
    if (f > 2 && Math.abs(vy - prevV) > maxA) {
      maxA = Math.abs(vy - prevV);
      atA = f;
      atX = s.player.x;
      atY = s.player.y + s.player.h;
    }
    prevY = v.y;
    prevV = vy;
    const q = s.player;
    const top = v.y - cam.vh / 2 / cam.zoom;
    const feet = ((q.y + q.h - top) * cam.zoom - (cam.vh - SAFE_H) / 2) / SAFE_H;
    feetLo = Math.min(feetLo, feet);
    feetHi = Math.max(feetHi, feet);
    // Not in the room's last 200 px: a catch or a drop exit at the room's foot is under the lowest view.
    // Nor while a camera zone frames the view (its zoom, its bounds' shift): the designer's framing, the kit's tests.
    const zoned = cam.zone !== '' || cam.zoom !== 1 || cam.oy !== 0;
    if (q.y + q.h < scene.height - FOOT && !zoned) feetHiFree = Math.max(feetHiFree, feet);
    if (q.grounded) ground = q.y + q.h;
    else if (
      q.vy > 0 &&
      q.y + q.h - ground > FALL &&
      q.y + q.h < scene.height - FOOT &&
      // (The last `NEAR` px over the floor she lands on: it is in view, the landing is that frame or next.)
      landBelow(scene, q.x + q.w / 2, q.y + q.h) - (q.y + q.h) > NEAR &&
      // (Nor while the view stands on the room's floor: it can show no lower; a drop exit lives there.)
      v.y + cam.vh / 2 / cam.zoom < scene.height - 1 &&
      feet > fallFeet
    ) {
      fallFeet = feet;
      fallAt = `f${f} (${Math.round(q.x)}, ${Math.round(q.y + q.h)}) zone ${cam.zone || '-'}`;
    }
  }
  return { frames: f, maxA, feetLo, feetHi, feetHiFree, fallFeet, fallAt, atA, atX, atY };
}

describe('the fall camera in the wood rooms', () => {
  it('every wood greybox room carries the fall block', () => {
    expect(WOOD.length).toBeGreaterThanOrEqual(9);
    for (const id of WOOD) {
      const ct = cameraFor(getRoom(id));
      expect(ct, id).not.toBe(cameraTuning);
      expect([ct.realFallPx, ct.targetSmoothY, ct.smoothYFastFall, ct.fallLookahead], id).toEqual([
        250, 10, 6, 320,
      ]);
    }
    for (const id of ['wood-chase', 'wood-glidewalk', 'wood-lantern']) {
      const ct = cameraFor(getRoom(id));
      expect([ct.lookaheadX, ct.leadFrames], id).toEqual([330, 36]);
    }
  });

  for (const id of WOOD) {
    it(`${id}: no lurch, her feet in frame (runner east, walkers east and west)`, () => {
      for (const [dir, hop] of [
        [1, true],
        [1, false],
        [-1, false],
      ] as const) {
        const r = camRun(id, dir, hop);
        const what = `${id} ${dir > 0 ? 'east' : 'west'} ${hop ? 'runner' : 'walker'} (${r.frames} f)`;
        expect(r.maxA, what).toBeLessThan(8);
        expect(r.feetHiFree, what).toBeLessThan(0.97);
        expect(r.fallFeet, `${what} ${r.fallAt}`).toBeLessThanOrEqual(FALL_FEET);
        expect(r.feetLo, what).toBeGreaterThan(0.15);
      }
    });
  }
});
