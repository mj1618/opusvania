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
 * `STAGE_BEATS` publishes how long each beat has been running (render s; -1 = not this visit; `DONE` = done
 * in an earlier visit) for the greybox staging that draws the rest (render/greybox/staging.ts).
 */
import type { Room } from '../../scene/room';
import type { SimEvent } from '../../sim/events';
import type { CameraView } from '../contract';

/** Seconds of each beat's ease in / out (the hold is the data's). */
export const STAGE_CAM = {
  vista: { in: 1.0, out: 1.1 },
  glimpse: { in: 0.7, out: 0.8 },
  bask: { in: 0.7, out: 0.9 },
};

/** A beat done in an earlier visit (its after-state is drawn, nothing plays). */
export const DONE = 1e6;

export const STAGE_BEATS = { vista: -1, glimpse: -1, bask: -1 };

function smoother(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

interface Shot {
  kind: 'vista' | 'glimpse' | 'bask';
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
    for (const k of ['vista', 'glimpse', 'bask'] as const)
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
        } else if (e.type === 'gladeGrant' && S.bask)
          this.start('bask', S.bask.x, S.bask.y, S.bask.zoom ?? 1, S.bask.secs);
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
      return;
    }
    s.t += dt;
    if (s.t >= s.in + s.hold + s.out) {
      this.shot = null;
      this.x = this.y = 0;
      this.zoom = 1;
      return;
    }
    const w = this.weight;
    // The framing stays inside the room (a bask by its west wall must not show past it), the view's
    // real size at the beat's zoom; a room smaller than that view is centred.
    const hw = follow.w / 2 / s.zoom;
    const hh = follow.h / 2 / s.zoom;
    const R = this.room;
    const tx = R.width > 2 * hw ? Math.min(R.width - hw, Math.max(hw, s.x)) : R.width / 2;
    const ty = R.height > 2 * hh ? Math.min(R.height - hh, Math.max(hh, s.y)) : R.height / 2;
    this.x = (tx - follow.x) * w;
    this.y = (ty - follow.y) * w;
    this.zoom = 1 + (s.zoom / follow.zoom - 1) * w;
  }
}
