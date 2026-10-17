import type { Room } from '../../scene/room';

/**
 * Camera constants. Distances in world px, times in 60 Hz sim frames.
 */
export const cameraTuning = {
  /** Feet sit at this fraction of the view height (when the scene bounds allow). */
  anchorY: 0.72,
  /**
   * Look-ahead: the view leads the player by up to lookaheadX in the direction of SUSTAINED
   * travel. The lead follows a slow average of vx / leadFullSpeed (leadFrames time constant), so
   * quick left-right reversals average out and the camera barely moves.
   */
  lookaheadX: 170,
  leadFullSpeed: 7,
  leadFrames: 55,
  /** Critically damped follow: roughly the frames taken to close most of the distance. */
  smoothX: 16,
  smoothXDash: 10,
  /** Vertical dead zone: the target only moves on landing, wall slide, or when the feet leave
   * this window (fractions of the view height). */
  winTop: 0.25,
  winBot: 0.78,
  smoothY: 22,
  /**
   * Fast-fall follow: past this fall speed, once the feet are `fallBelow` px under the line the view
   * rests on (so not when coming down from a jump), the camera leads below the feet.
   */
  fallFollowVy: 12,
  fallBelow: 48,
  fallLookahead: 128,
  smoothYFall: 9,
  /**
   * The faster follow of a long fall: used for a fall of more than `realFallPx` px (from the top of her
   * airtime) and for a room exit's drop; ordinary drops between ledges keep `smoothYFall`. With
   * `realFallPx` > 0 a long fall is also led every frame (not only when she passes the line). The
   * defaults (9, 0) keep the classic rule, every real fall at 9 (the test grove).
   */
  smoothYFastFall: 9,
  realFallPx: 0,
  /**
   * The speed lead (rooms with `realFallPx`; feel review r2: at max fall her feet sat at 0.93-0.97): from
   * the first frame she descends past her last ground, the fall's lead grows with her speed (`vy0` -> `vy1`
   * px/f) as well as with the drop, but never past the ground under her less `landUp` (camera/index.ts
   * `landBelow`: solids, one-ways, catch tops). Camera zones yield to it.
   */
  fallLead: { vy0: 2, vy1: 14, landUp: 0 },
  /**
   * Falling over a floor exit within `reach` px of the floor (and `margin` of its span), the view may show up to
   * `px` past the room's floor (eased over `frames`): a fall across a room seam stays framed (greybox rooms).
   */
  seamLook: { px: 1200, reach: 1600, margin: 64, frames: 6 },
  /**
   * Frames of a spring the vertical TARGET runs through before the view follows it (0 = none). With
   * it, a target that jumps (a fall's lead switching on) starts the view moving with no step in its
   * velocity: the onset eases in. Rooms set it; the test grove has none.
   */
  targetSmoothY: 0,
  /**
   * The kick when a slash lands (render-side, `kick.ts`): the view jumps this many world px against
   * the cut (a cut, the finisher), `vertical` x that for up / down cuts, and returns on a critically
   * damped spring of `omega` rad/s (35 = home, to within 5%, in about 8 frames). The blow that kills
   * an enemy kicks `kill` x as far; a snuff kicks as far as the finisher whatever cut it was. 3.5 / 7
   * until the chunk-1 feel review ("0.2% of a 1920 view: can't be seen"). Her hurt kicks `hurt` px along
   * the blow (the way she is thrown), a little down (feel review r2).
   */
  kick: { power1: 6, power2: 11, vertical: 0.8, omega: 35, kill: 1.4, hurt: 12 },
  /**
   * Screen shake (render-side, `shake.ts`, memory/feel.md): one trauma value 0..1. Each event adds
   * its `budget` (capped at 1); the view is offset `max` world px x trauma^`power` by smooth noise at `freq`
   * Hz, and trauma drains `decay` per second. Loudest first: her last light, her hurt, the snuff, a
   * kill, a ram into a wall, a bark break, a hard landing, the finisher, a clang, a cut into a wall.
   * `FEEL.shake` off (the accessibility toggle) stops it and the kick.
   */
  shake: {
    max: 30,
    /** The offset grows as trauma^`power` (feel review r2: trauma² left a kill at 2 px, under perception). */
    power: 1.5,
    decay: 1.8,
    freq: 24,
    budget: {
      fade: 0.6,
      hurt: 0.5,
      snuff: 0.45,
      /** The mini-boss's death (the old burrback): the area's loudest kill. */
      bigKill: 0.55,
      kill: 0.3,
      crack: 0.3,
      wallRam: 0.3,
      barkBreak: 0.3,
      hardLand: 0.2,
      finisher: 0.12,
      clang: 0.1,
      capBounce: 0.1,
      /** A cut into rotten bark: the crunch (first-timer r3: it gave no feedback). */
      barkHit: 0.16,
      terrain: 0.05,
    },
  },
  /**
   * Her being hurt, on screen (`hurt-fx.ts`, feel review r2: a dark vignette did not read on a dark room):
   * a short dark flash over the whole view (`flash` opacity for `flashSecs`), then a red edge that comes in
   * over `in` s at `edge` and is gone `out` s later; on her last light the edge is `edgeLast` and holds
   * `holdLast` s first (the sim's 14-frame hold).
   */
  hurtVignette: {
    flash: 0.4,
    flashSecs: 2 / 60,
    in: 0.03,
    out: 0.3,
    edge: 0.35,
    edgeLast: 0.6,
    holdLast: 0.25,
  },
  /**
   * Headroom: the view may rise above the scene top, to this far above the scene's canopy ceiling
   * (`scene.ceilingY`, the highest her box can go), so she keeps sky over her head on the summit and
   * at the top of a jump there. The layer tree's coverage grows by the same amount (`viewTop`).
   */
  headroom: 120,
  /**
   * Landing band: a landing only moves the vertical target when the new ground is more than `landUp`
   * above or `landDown` below the line the view rests on, so a chain of hops between islands of
   * about the same height does not bob the view. Once she has stayed on the ground for
   * `settleFrames` the view settles on her feet anyway.
   */
  landUp: 136,
  landDown: 64,
  settleFrames: 40,
  /**
   * Wing glide: the look-ahead grows by `extraX` in the direction of travel and the lead average
   * quickens to `leadFrames`; the view's target also leads `lookDown` px BELOW her feet (about 150 on screen once the spring's lag
   * at her sink rate is taken off) (she is sinking:
   * the landing has to be on screen), following on `smoothY`. `easeIn` / `easeOut` are the frames the
   * glide share takes to come and go; on landing the view eases back on the usual springs.
   */
  glide: { extraX: 300, leadFrames: 26, lookDown: 240, smoothY: 18, easeIn: 22, easeOut: 40 },
  /**
   * Standing at a lantern or the heart: once she has stood still for `frames`, within `reachX` /
   * `reachY` of one (its foot), the view eases `share` of the way from her to it (at most `maxX`) and
   * up by `lift`, so both are comfortably in frame. `ease` = frames of the ease (then the springs).
   */
  rest: { frames: 24, reachX: 260, reachY: 150, share: 0.5, maxX: 130, lift: 56, ease: 30 },
  /**
   * Fade and re-form (render-side, `reform.ts`). On `reform` the view glides from where she fell to
   * where she re-forms: `secMin`..`secMax` seconds by distance (`minDist`..`panCap` px); beyond
   * `panCap` the glide starts that far from its end (the rest is a cut under the dip). A soft dark
   * dip covers it: it comes on over the last `dipIn` s of the fade, holds for `dipHold` of the glide
   * and lifts by its end. `dip` / `dipCut` = how dark (0..1 of the overlay; `dipCut` when part of the
   * way is cut). Under `minDist` there is no dip, only a `secNear` ease. A restart dips from
   * `restartDip` and lifts over `restartSec`.
   */
  reform: {
    minDist: 200,
    panCap: 2400,
    secMin: 0.6,
    secMax: 0.9,
    secNear: 0.45,
    dipIn: 0.3,
    dipRise: 0.1,
    dipHold: 0.3,
    /** (r3 item 9: lighter, so a re-form is a dimmed glide, never a cut to black.) */
    dip: 0.45,
    dipCut: 0.6,
    restartDip: 0.9,
    restartSec: 0.5,
  },
  /**
   * Leaving a room and being caught after a fall (`roomExit` / `fallCatch`, room-fade.ts): a black
   * fade over the sim's hold (it reaches black `exitEarly` s before the room restarts), lifted over
   * `exitLift` s after `roomEnter`. A catch dips to `catchDepth` over its hold and lifts over `catchLift` s.
   * Into another room (memory/world.md) the dip lifts over `enterLift` s: the crossing should feel continuous.
   */
  /**
   * Camera zones (zones.ts, memory/level-kit.md): frames of the spring that eases the view's shift into
   * (and out of) a zone's bounds, and of the zoom's.
   */
  zones: { frames: 30, zoomFrames: 30 },
  room: {
    exitEarly: 0.12,
    exitLift: 0.9,
    enterLift: 0.3,
    /** 0: a catch or a hazard return no longer dips the world (plan r3, item 9: black cuts); she fades instead. */
    catchDepth: 0,
    catchLift: 0.35,
  },
};
export type CameraTuning = typeof cameraTuning;

/**
 * The follow camera's tuning for a room: `cameraTuning` with the room's own framing (`room.camera`:
 * `anchorY`, `lookaheadX`, `leadFrames`, `fallLookahead`, `smoothYFall`, `smoothYFastFall`, `realFallPx`,
 * `targetSmoothY`) on top. A room that sets none (the test
 * grove) gets `cameraTuning` itself, the very object.
 */
export function cameraFor(room: Room): CameraTuning {
  const c = room.camera;
  const keys = [
    'anchorY',
    'lookaheadX',
    'leadFrames',
    'fallLookahead',
    'smoothYFall',
    'smoothYFastFall',
    'realFallPx',
    'targetSmoothY',
  ] as const;
  if (!c || keys.every((k) => c[k] === undefined)) return cameraTuning;
  const out = { ...cameraTuning };
  for (const k of keys) out[k] = c[k] ?? cameraTuning[k];
  return out;
}
