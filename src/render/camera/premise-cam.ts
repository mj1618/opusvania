/**
 * The premise's camera beats (the Canopy r11, review r10 #2 / #4): the game takes the eye for a moment, never the
 * controls. Like the kick and the stage camera, an offset on the follow view and a factor on its zoom.
 *
 *   release  a trap's snuff (`lureSnuff` with `trap`): once the drawn frame's hold lets go (stage.ts), the view eases
 *            6% in about the cage (the cage keeps its place on screen and the frame tightens round it) and a little
 *            toward it, holds while the moths swirl, and eases back. The great cage pulls out instead and leans up,
 *            so the stream rising out of the den's roof stays in the picture.
 *   firefly  a sighting (`fireflyStart`): the view leans toward the firefly over 0.3 s and follows it a while; a pass
 *            with its own framing (`look`, the level's) frames that point with her instead.
 *   wake     the old burrback's wake (`enemyWake`): the view pushes in about it while it rises.
 *   snap     the Keeper's intro (`enemyFeed`, canopy review r12 #4): from the balcony's wide frame the view pushes in
 *            to `snap.to` about the snap, so the heave out of the dark fills a third of the frame, then lets go.
 *
 * Numbers: `PREMISE_CAM` (camera/tuning.ts). Render time only; reads the sim, writes nothing.
 */
import type { SimEvent } from '../../sim/events';
import { fireflyAt } from '../../sim/firefly';
import type { CameraView, SimView } from '../contract';
import { releaseGreat } from '../lantern/release';
import { PREMISE_CAM } from './tuning';

/** 0..1 of a beat `t` s in: up over `a`, held `h`, down over `b` (smooth both ways). */
function envelope(t: number, a: number, h: number, b: number): number {
  const s = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    return c * c * (3 - 2 * c);
  };
  if (t < 0) return 0;
  if (t < a) return s(t / a);
  if (t < a + h) return 1;
  return 1 - s((t - a - h) / b);
}

export class PremiseCamera {
  /** Offset to add to the view centre (world px), and a factor on its zoom. */
  x = 0;
  y = 0;
  zoom = 1;
  /** The release under way: the cage, seconds since, the great cage or not. */
  private rel: { x: number; y: number; t: number; great: boolean; wake: boolean; snap?: boolean } | null =
    null;
  /** The firefly's sighting: seconds since (null: none). */
  private ff: number | null = null;
  /** The lean last aimed at the firefly (kept as it eases back after its pass ends). */
  private ffX = 0;
  private ffY = 0;
  /** A pass's own framing under way, and how far in (0..1). */
  private look: { x: number; y: number; zoom?: number } | null = null;
  private lookK = 0;

  reset(): void {
    this.rel = null;
    this.ff = null;
    this.look = null;
    this.lookK = 0;
    this.x = this.y = 0;
    this.zoom = 1;
  }

  update(
    dt: number,
    events: readonly SimEvent[],
    sim: Pick<SimView, 'kit' | 'scene' | 'alpha'>,
    follow: CameraView,
  ): void {
    for (const e of events) {
      if (e.type === 'lureSnuff' && (e as { trap?: boolean }).trap)
        this.rel = { x: e.x, y: e.y, t: -dt, great: releaseGreat(e.moths), wake: false };
      // The old burrback's wake: the same push, about the boss.
      else if (e.type === 'enemyWake' && e.kind === 'oldBurrback')
        this.rel = { x: e.x, y: e.y, t: -dt, great: false, wake: true };
      else if (e.type === 'enemyFeed')
        this.rel = { x: e.x, y: e.y, t: -dt, great: false, wake: false, snap: true };
      else if (e.type === 'fireflyStart') this.ff = -dt;
      // Each lamp it relights leans the view again (or holds the lean on).
      else if (e.type === 'fireflyRelight' || (e.type as string) === 'fireflyKindle')
        this.ff = this.ff === null ? -dt : Math.min(this.ff, PREMISE_CAM.firefly.in);
      else if (e.type === 'roomEnter') this.reset();
    }
    let x = 0;
    let y = 0;
    let zoom = 1;
    const r = this.rel;
    if (r) {
      r.t += dt;
      const S = PREMISE_CAM.snap;
      const C: { zoom: number; pan: number; in: number; hold: number; out: number; lift?: number } = r.snap
        ? { ...S, zoom: Math.max(1, S.to / Math.max(0.1, follow.zoom)) }
        : r.wake
          ? PREMISE_CAM.wake
          : r.great
            ? PREMISE_CAM.great
            : PREMISE_CAM.release;
      const k = envelope(r.t, C.in, C.hold, C.out);
      if (r.t > C.in + C.hold + C.out) this.rel = null;
      // Zoom about the cage: the cage stays where it is on screen while the frame closes on it (or opens round it).
      const z = 1 + (C.zoom - 1) * k;
      const toward = 1 - 1 / z + C.pan * k;
      x += (r.x - follow.x) * toward;
      y += (r.y - follow.y) * toward - (C.lift ?? 0) * k;
      zoom *= z;
    }
    // A pass that carries its own framing (`FireflyPass.look`, the level's: the den's mouth, the great cage): from its
    // frame `from` to `to` the view frames the point with her (half way between), at its zoom, easing in and out.
    const kit0 = sim.kit as unknown as { firefly?: { pass: number; frame: number } };
    const pass0 = (
      sim.scene as {
        fireflies?: Array<{ look?: { x: number; y: number; zoom?: number; from: number; to: number } }>;
      }
    ).fireflies?.[kit0.firefly?.pass ?? -1];
    const lk = kit0.firefly && kit0.firefly.pass >= 0 ? pass0?.look : undefined;
    if (lk) {
      const f = kit0.firefly?.frame ?? 0;
      const e = PREMISE_CAM.look;
      const u = Math.min((f - lk.from) / e.ease, (lk.to - f) / e.ease);
      const c = Math.min(1, Math.max(0, u));
      this.lookK = c * c * (3 - 2 * c);
      this.look = lk;
    } else if (this.look) {
      // (The pass ended inside its frame: ease out on render time.)
      this.lookK = Math.max(0, this.lookK - dt / PREMISE_CAM.look.out);
      if (this.lookK <= 0) this.look = null;
    }
    if (this.look && this.lookK > 0) {
      const k = this.lookK;
      x += ((this.look.x - follow.x) / 2) * k;
      y += ((this.look.y - follow.y) / 2) * k;
      if (this.look.zoom) zoom *= 1 + (this.look.zoom / follow.zoom - 1) * k;
    } else if (this.ff !== null) {
      // (A chase holds the lean as long as it runs: it and her in the frame, a little wider: canopy-moments moment 4.)
      const kc = sim.kit as unknown as { firefly?: { pass: number; beat?: number } };
      const chasing =
        (kc.firefly?.beat ?? 0) >= 1 && (kc.firefly?.beat ?? 0) <= 4 && (kc.firefly?.pass ?? -1) >= 0;
      if (chasing) this.ff = Math.min(this.ff, PREMISE_CAM.firefly.in + PREMISE_CAM.firefly.hold * 0.5);
      if (chasing) zoom *= PREMISE_CAM.chaseZoom;
      this.ff += dt;
      const C = PREMISE_CAM.firefly;
      const k = envelope(this.ff, C.in, C.hold, C.out);
      if (this.ff > C.in + C.hold + C.out) this.ff = null;
      const kit = sim.kit as unknown as { firefly?: { pass: number; frame: number } };
      const ffs = kit.firefly;
      const pass = (sim.scene as { fireflies?: unknown[] }).fireflies?.[ffs?.pass ?? -1];
      if (ffs && pass && ffs.pass >= 0) {
        const cx = ffs as unknown as { x?: number; y?: number };
        const at =
          (pass as { chase?: unknown }).chase && typeof cx.x === 'number'
            ? { x: cx.x, y: cx.y as number }
            : fireflyAt(pass as never, ffs.frame - 1 + sim.alpha);
        let dx = (at.x - follow.x) * C.pan;
        let dy = (at.y - follow.y) * C.pan;
        const d = Math.hypot(dx, dy);
        if (d > C.max) {
          dx *= C.max / d;
          dy *= C.max / d;
        }
        this.ffX = dx;
        this.ffY = dy;
      }
      x += this.ffX * k;
      y += this.ffY * k;
    }
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }
}
