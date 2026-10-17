/**
 * The story's camera beats (memory/staging.md): the vista's hold over the title, the hub's look up at the
 * firefly's glimpse, the glade's bask. Data: `room.marks.stage` (src/scene/stage.ts). Like the kick and
 * the goal camera this is a render-side offset on the follow view (and a factor on its zoom): the follow
 * camera never sees it, and she keeps control the whole time (journey.md: no input is held).
 *
 * A beat starts on its cue: the story flag a trigger sets (`flagSet`), or, while a room has no trigger
 * for it yet, the first entry into a camera zone this visit (and only if the flag is not in the save).
 * The bask starts on the room's `gladeGrant`. One beat at a time; the newest wins.
 *
 * When the trigger carries a sim hold (`storyHold` / `storyHoldEnd`), the framing holds exactly as long as
 * her input does.
 *
 * `STAGE_BEATS` publishes how long each beat has been running (render s; -1 = not this visit; `DONE` = done
 * in an earlier visit) for the greybox staging that draws the rest (render/greybox/staging.ts).
 */
import type { Room } from '../../scene/room';
import type { SimEvent } from '../../sim/events';
import type { CameraView } from '../contract';

/** Seconds of each beat's ease in / out (the hold is the data's). */
export const STAGE_CAM = {
  finale: { in: 1.4, out: 1.6 },
  /**
   * The camera never stands still in a held beat: over its hold it pushes in by `push` (a share of its zoom) and
   * drifts `drift` px (toward where it looks); a `storyHold` with no shot pushes in on her by `holdPush` over
   * `holdSecs`. `heldIn` / `heldOut`: seconds the hold state takes to come and go.
   */
  push: 0.06,
  drift: 60,
  holdPush: 0.05,
  holdSecs: 4,
  heldIn: 0.35,
  heldOut: 0.5,
  /** How far over the room's top (and past its sides) the finale's wide frame may look (open sky over the crown), px. */
  skyAbove: 1600,
  vista: { in: 1.0, out: 1.1 },
  glimpse: { in: 0.7, out: 0.8 },
  bask: { in: 0.7, out: 0.9 },
};

/** A beat done in an earlier visit (its after-state is drawn, nothing plays). */
export const DONE = 1e6;

export const STAGE_BEATS = { vista: -1, glimpse: -1, bask: -1, finale: -1 };

/**
 * A held beat reads as a scene, not a freeze (plan r5, item 9): `held` 0..1 = how far a beat holds the view now (a
 * stage shot's weight, or a sim `storyHold` with no shot): the HUD fades by it; `look` = what the camera shows, for
 * her head to turn to (`w` = how firmly). Written by `StageCamera.update`, read by the HUD and the character.
 */
export const STAGE_HOLD = { held: 0, look: { x: 0, y: 0, w: 0 } };

function smoother(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

interface Shot {
  kind: 'vista' | 'glimpse' | 'bask' | 'finale';
  x: number;
  y: number;
  zoom: number;
  in: number;
  hold: number;
  out: number;
  t: number;
}

export class StageCamera {
  /** Offset to add to the view centre (world px) and factor on its zoom. */
  x = 0;
  y = 0;
  zoom = 1;
  private shot: Shot | null = null;
  /** A sim `storyHold` with no shot of its own: seconds since it began (-1 = none) and its length. */
  private holdT = -1;
  private holdLen = 0;
  /** The hold state as eased (STAGE_HOLD.held for a shotless hold). */
  private heldK = 0;
  private readonly zonesSeen = new Set<string>();

  constructor(
    private readonly room: Room,
    flags: readonly string[],
  ) {
    this.reset(flags);
  }

  /** A new visit (the room built, or restarted): what is done already comes from the save. */
  private reset(flags: readonly string[]): void {
    const S = this.room.marks?.stage;
    this.shot = null;
    this.zonesSeen.clear();
    STAGE_BEATS.vista = S?.vista?.flag && flags.includes(S.vista.flag) ? DONE : -1;
    STAGE_BEATS.glimpse = S?.glimpse?.flag && flags.includes(S.glimpse.flag) ? DONE : -1;
    STAGE_BEATS.bask = -1;
    STAGE_BEATS.finale = S?.cloud && flags.includes(S.cloud.flag) ? DONE : -1;
  }

  /** 0..1: how far the current beat's framing is in. */
  get weight(): number {
    const s = this.shot;
    if (!s) return 0;
    return smoother(0, s.in, s.t) * (1 - smoother(s.in + s.hold, s.in + s.hold + s.out, s.t));
  }

  private start(kind: Shot['kind'], x: number, y: number, zoom: number, hold: number): void {
    const E = STAGE_CAM[kind];
    this.shot = { kind, x, y, zoom, in: E.in, hold, out: E.out, t: 0 };
    STAGE_BEATS[kind] = 0;
  }

  /** `zone`: the camera zone she is in ('' = none); `follow`: the view before the offset; `flags`: the save's. */
  update(
    dt: number,
    events: readonly SimEvent[],
    zone: string,
    follow: CameraView,
    flags: readonly string[],
  ): void {
    if (events.some((e) => e.type === 'roomEnter')) this.reset(flags);
    const S = this.room.marks?.stage;
    for (const k of ['vista', 'glimpse', 'bask', 'finale'] as const)
      if (STAGE_BEATS[k] >= 0 && STAGE_BEATS[k] < DONE) STAGE_BEATS[k] += dt;
    if (S) {
      const v = S.vista;
      const g = S.glimpse;
      for (const e of events) {
        if (e.type === 'flagSet') {
          if (v && e.flag === v.flag && STAGE_BEATS.vista < 0)
            this.start('vista', v.x, v.y, v.zoom ?? 1, v.hold);
          if (g && e.flag === g.flag && STAGE_BEATS.glimpse < 0)
            this.start('glimpse', g.x, g.y, g.zoom ?? 1, g.secs - 1.5);
          // The finale: the wide frame held while every moth she freed lifts off (the cloud's own seconds).
          // (A vista on the same flag frames it instead: only the cloud's clock runs then.)
          const c = S.cloud;
          if (c && e.flag === c.flag && STAGE_BEATS.finale < 0 && c.view && v?.flag !== c.flag) {
            const F = STAGE_CAM.finale;
            this.start(
              'finale',
              c.view.x,
              c.view.y,
              c.view.zoom,
              Math.max(0.5, (c.secs ?? 9) - F.in - F.out),
            );
          } else if (c && e.flag === c.flag && STAGE_BEATS.finale < 0) STAGE_BEATS.finale = 0;
        } else if (e.type === 'gladeGrant' && S.bask)
          this.start('bask', S.bask.x, S.bask.y, S.bask.zoom ?? 1, S.bask.secs);
      }
      // A sim-held story beat (a trigger with `hold`, memory/level-kit.md): the beat its flag just started
      // holds while her input does, and lets go when it does (she has the view back as she has control).
      for (const e of events) {
        if (e.type === 'storyHold' && (!this.shot || this.shot.t > 0)) {
          this.holdT = 0;
          this.holdLen = e.frames / 60;
        } else if (e.type === 'storyHoldEnd') this.holdT = -1;
        const sh = this.shot;
        if (!sh) continue;
        if (e.type === 'storyHold' && sh.t === 0) sh.hold = Math.max(sh.hold, e.frames / 60 - sh.in);
        else if (e.type === 'storyHoldEnd' && sh.t > sh.in && sh.t < sh.in + sh.hold) sh.hold = sh.t - sh.in;
      }
      if (zone && !this.zonesSeen.has(zone)) {
        this.zonesSeen.add(zone);
        if (v && v.zone === zone && STAGE_BEATS.vista < 0) this.start('vista', v.x, v.y, v.zoom ?? 1, v.hold);
        if (g && g.zone === zone && STAGE_BEATS.glimpse < 0)
          this.start('glimpse', g.x, g.y, g.zoom ?? 1, g.secs - 1.5);
      }
    }
    const s = this.shot;
    if (!s) {
      this.x = this.y = 0;
      this.zoom = 1;
      // A shotless hold: the view pushes in on her, slowly, for as long as it lasts (never a still frame).
      if (this.holdT >= 0) {
        this.holdT += dt;
        if (this.holdT >= this.holdLen) this.holdT = -1;
      }
      const want = this.holdT >= 0 ? 1 : 0;
      const C = STAGE_CAM;
      this.heldK =
        want > this.heldK
          ? Math.min(1, this.heldK + dt / C.heldIn)
          : Math.max(0, this.heldK - dt / C.heldOut);
      const u = this.holdT >= 0 ? Math.min(1, this.holdT / C.holdSecs) : 1;
      this.zoom = 1 + C.holdPush * this.heldK * u * u * (3 - 2 * u);
      STAGE_HOLD.held = this.heldK;
      STAGE_HOLD.look.w = 0;
      return;
    }
    s.t += dt;
    if (s.t >= s.in + s.hold + s.out) {
      this.shot = null;
      this.x = this.y = 0;
      this.zoom = 1;
      STAGE_HOLD.held = 0;
      STAGE_HOLD.look.w = 0;
      return;
    }
    const w = this.weight;
    // The framing stays inside the room (a bask by its west wall must not show past it), the view's
    // real size at the beat's zoom; a room smaller than that view is centred.
    const hw = follow.w / 2 / s.zoom;
    const hh = follow.h / 2 / s.zoom;
    const R = this.room;
    // (The finale may also look past the room's sides into the sky beyond: the valley east, the hatching tree west.)
    const side =
      s.kind === 'finale' ||
      (s.kind === 'vista' && R.marks?.stage?.cloud?.flag === R.marks?.stage?.vista?.flag)
        ? STAGE_CAM.skyAbove
        : 0;
    const left = -side;
    const right = R.width + side;
    const tx = right - left > 2 * hw ? Math.min(right - hw, Math.max(left + hw, s.x)) : (left + right) / 2;
    // (The finale, or a vista on the cloud's flag, may look up past the room's top into the open sky over the
    // crown: `skyAbove` px.)
    const sky =
      s.kind === 'finale' ||
      (s.kind === 'vista' && R.marks?.stage?.cloud?.flag === R.marks?.stage?.vista?.flag)
        ? STAGE_CAM.skyAbove
        : 0;
    const top = Math.min(0, R.ceilingY ?? 0) - sky;
    const ty =
      R.height - top > 2 * hh ? Math.min(R.height - hh, Math.max(top + hh, s.y)) : (R.height + top) / 2;
    // Through the hold the camera keeps moving: a slow push in and a drift toward what it shows.
    const C = STAGE_CAM;
    const u = Math.min(1, Math.max(0, (s.t - s.in) / Math.max(0.1, s.hold + s.out)));
    const ease = u * u * (3 - 2 * u);
    const dx = s.x - follow.x;
    const dy = s.y - follow.y;
    const dl = Math.max(1, Math.hypot(dx, dy));
    this.x = (tx - follow.x) * w + (dx / dl) * C.drift * ease * w;
    this.y = (ty - follow.y) * w + (dy / dl) * C.drift * 0.5 * ease * w;
    this.zoom = (1 + (s.zoom / follow.zoom - 1) * w) * (1 + C.push * ease * w);
    STAGE_HOLD.held = w;
    STAGE_HOLD.look.x = s.x;
    STAGE_HOLD.look.y = s.y;
    STAGE_HOLD.look.w = w;
  }
}
