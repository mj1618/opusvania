/**
 * The release, timed (the Canopy r11, review r10 #2: "the release is a hit spark, not a moment"). A trap's snuff
 * (`lureSnuff` with `trap`) is staged in four beats, every one on render time from the event's frame:
 *
 *   hold     the drawn frame holds `freeze` sim frames (stage.ts: a render-side hitstop; the sim is not touched)
 *   burst    the cage's bars burst outward and fall; twice the trap's moths pour out of it (`burst` s)
 *   circle   they swirl round her once (`circle` s), pale gold turning cool
 *   stream   one after another they peel off into a stream that flies toward the moon's side of the sky, slow
 *            enough to stay in frame for seconds; the HUD's count ticks once per freed moth as they leave
 *
 * (The camera's part is `PREMISE_CAM` in camera/tuning.ts.)
 *
 * The great cage (a trap of `great` moths or more: the den's, over the old burrback) holds longer, pours more, and
 * streams up (out of the den's roof) instead of across.
 *
 * Pure: no Pixi, no DOM. The lamps (lamps.ts), the HUD's count (hud/moths.ts), the camera (camera/release-cam.ts)
 * and the sound (src/audio) all read the same timeline, so the tick, the chime and the moth leaving agree.
 */

export const RELEASE = {
  /** Sim frames the drawn frame holds on a trap's snuff (a great cage's). */
  freeze: 14,
  freezeGreat: 22,
  /** A trap of at least this many moths is a great cage. */
  great: 90,
  /** Moths drawn per freed moth, and at most. */
  mult: 2,
  maxDrawn: 260,
  /** A freed moth's `moth()` size (lamps.ts: its span is ~1.1x this): 10-16 px across. */
  size: [9, 14.5] as const,
  /** Seconds: out of the cage; one swirl round her; the peel-off spread (a trap of 30, a great cage). */
  burst: 0.5,
  circle: 1.5,
  leave: [1.3, 3.2] as const,
  /** The great cage swirls longer (seconds added to `circle`). */
  circleGreat: 0.9,
  /** px/s along the stream, and the stream's shape: a curve from where she stood toward the moon (px). */
  speed: 240,
  speedGreat: 300,
  path: { mid: [520, -260] as const, end: [1700, -760] as const },
  pathGreat: { mid: [140, -520] as const, end: [420, -2100] as const },
  /** How far a moth strays from the stream's line (px), and how the colour turns (pale gold to cool). */
  spread: 70,
  warm: 0xffe6b0,
  cool: 0xd6e4ff,
  /** The cage's bars: how far they fly out (px/s), how fast they fall (px/s²), seconds they last. */
  barOut: [180, 420] as const,
  barFall: 900,
  barLife: 2.6,
  /**
   * Seconds after the great cage's snuff before a line may show (its column has risen out through the roof: keeper.ts
   * `KEEPER.column`, launched over 2.8 s, ~3.5 s to climb, after the 22-frame hold). Review r13 #1: "A new light
   * kindles." sat over the burst.
   */
  greatClear: 7.4,
};

/** Is a trap of `moths` the great cage? */
export function releaseGreat(moths: number): boolean {
  return moths >= RELEASE.great;
}

/** Sim frames the drawn frame holds for a trap of `moths`. */
export function releaseFreeze(moths: number): number {
  return releaseGreat(moths) ? RELEASE.freezeGreat : RELEASE.freeze;
}

/** Moths drawn for a trap of `moths`. */
export function releaseDrawn(moths: number): number {
  return Math.max(1, Math.min(RELEASE.maxDrawn, Math.round(moths * RELEASE.mult)));
}

/** Seconds (render time after the hold) the peel-off is spread over. */
export function releaseLeave(moths: number): number {
  const [a, b] = RELEASE.leave;
  return a + (b - a) * Math.min(1, Math.max(0, (moths - 30) / 90));
}

/** Seconds (render time after the hold) the drawn moth `k` of `drawn` leaves her for the stream. */
export function releaseDepart(k: number, drawn: number, moths: number): number {
  const circle = RELEASE.circle + (releaseGreat(moths) ? RELEASE.circleGreat : 0);
  const u = drawn > 1 ? k / (drawn - 1) : 0;
  return RELEASE.burst + circle + u * releaseLeave(moths);
}

/** Seconds (render time after the hold) each of the trap's `moths` ticks the count: as its moths leave her. */
export function releaseTicks(moths: number): number[] {
  const n = Math.max(0, Math.round(moths));
  const drawn = releaseDrawn(n);
  const out: number[] = [];
  for (let j = 0; j < n; j++) out.push(releaseDepart(Math.round(((j + 1) / n) * (drawn - 1)), drawn, n));
  return out;
}

/** The stream's curve for a trap of `moths` from (x0, y0) toward the moon's `side` (-1 / 1): 3 points (px). */
export function releasePath(
  x0: number,
  y0: number,
  side: number,
  moths: number,
): [number, number, number, number, number, number] {
  const P = releaseGreat(moths) ? RELEASE.pathGreat : RELEASE.path;
  return [x0, y0, x0 + side * P.mid[0], y0 + P.mid[1], x0 + side * P.end[0], y0 + P.end[1]];
}

/** A point `u` (0..1, past 1 straight on) along a quadratic curve [x0, y0, x1, y1, x2, y2]. */
export function along(
  p: readonly number[],
  u: number,
  out: { x: number; y: number; tx: number; ty: number },
): void {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0] = p;
  const t = Math.min(1, u);
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  // The tangent (unit) at t.
  let tx = 2 * (1 - t) * (x1 - x0) + 2 * t * (x2 - x1);
  let ty = 2 * (1 - t) * (y1 - y0) + 2 * t * (y2 - y1);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const over = Math.max(0, u - 1) * Math.hypot(x2 - x1, y2 - y1);
  out.x = a * x0 + b * x1 + c * x2 + tx * over;
  out.y = a * y0 + b * y1 + c * y2 + ty * over;
  out.tx = tx;
  out.ty = ty;
}

/** A curve's length (px), by chords. */
export function pathLength(p: readonly number[]): number {
  const P = { x: 0, y: 0, tx: 0, ty: 0 };
  let len = 0;
  let px = p[0] ?? 0;
  let py = p[1] ?? 0;
  for (let k = 1; k <= 16; k++) {
    along(p, k / 16, P);
    len += Math.hypot(P.x - px, P.y - py);
    px = P.x;
    py = P.y;
  }
  return len;
}
