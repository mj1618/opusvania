/**
 * The swarm's shapes and its one behaviour so far (memory/swarm.md).
 *
 * A **formation** is a path of `PATH_POINTS` control points in frame space: logical view px from
 * the centre of the screen, at zoom 1, when the camera sits on the swarm's frame point. Each point
 * also has a band half width and a speed weight (lower = moths dwell there, so it fills up).
 * Moths flow along the path from its first point to its last and come round again (the shader).
 *
 * A **behaviour** decides, each render frame, where the frame point is (world px), how much of
 * each formation is in the blend, and the feed: how full the stream is, as a pure function of the
 * time since the swarm started (`tau`). Scene 1 has one behaviour, `river`. A lamp's swarm would be
 * a closed loop formation with its frame at the lamp; freed moths a formation with its frame on her.
 */
import { SWARM } from './config';
import { swarmPassWeight } from './timing';

export const PATH_POINTS = 8;

/** x, y (frame px), half width (px), speed weight. */
export type PathPoint = readonly [number, number, number, number];
export type Formation = readonly PathPoint[];

/**
 * Scene 1's formations. The moon is at view (1420, 190) = frame (460, -350); the look target's
 * frame fractions are converted with frame = (fx - 0.5) * 1920, (fy - 0.5) * 1080.
 */
export const FORMATIONS = {
  /**
   * The pass (~10 s): enters behind and above her (frame left, y 0.3-0.45), arcs up across the
   * moon disc and leaves right and up (y 0.1-0.2). A band 10-25% of the frame tall.
   */
  pass: [
    [-1650, 70, 50, 1.15],
    [-1100, -60, 62, 1.05],
    [-600, -215, 78, 1],
    [-110, -330, 84, 0.9],
    // A neck where it crosses the disc (8-20 on it), a knot after.
    [460, -350, 40, 1.25],
    [900, -290, 74, 0.8],
    [1320, -320, 58, 1.05],
    [1850, -470, 50, 1.15],
  ],
  /**
   * The run: the thinner stream ahead and above her (x 0.6-0.95, y 0.08-0.35). It comes in high
   * from behind, over the top of the frame, and lingers ahead before it goes.
   */
  lead: [
    [-1650, -760, 80, 1.6],
    [-1050, -650, 80, 1.5],
    [-480, -545, 85, 1.25],
    [80, -420, 100, 0.85],
    [480, -330, 110, 0.6],
    [860, -320, 100, 0.65],
    [1320, -420, 85, 1.05],
    [1850, -540, 75, 1.3],
  ],
  /**
   * Across the promise gap. Frame = the room's `promise` camera mark (3700, 860 in wood-hatch): the
   * river dips over the gap toward the far branch (x 4608-5120, top 896) and climbs away into the
   * far canopy past the room's east edge.
   */
  cross: [
    [-1750, -470, 85, 1.2],
    [-1100, -420, 95, 1.05],
    [-450, -330, 105, 0.95],
    [180, -250, 110, 0.9],
    [800, -215, 100, 0.95],
    [1250, -300, 90, 1.05],
    [1750, -480, 80, 1.2],
    [2350, -700, 70, 1.3],
  ],
} as const satisfies Record<string, Formation>;

export type FormationId = keyof typeof FORMATIONS;

/** Blends formations by weight (weights need not sum to 1; they are normalised). */
export function blendFormations(
  weights: Partial<Record<FormationId, number>>,
  /** Room-built shapes that replace the defaults (the river's `cross` comes from the room's swarm polyline). */
  shapes: Partial<Record<FormationId, Formation>> = {},
): PathPoint[] {
  const out: [number, number, number, number][] = [];
  let sum = 0;
  for (const w of Object.values(weights)) sum += Math.max(0, w ?? 0);
  if (sum <= 0) return FORMATIONS.pass.map((p) => [...p] as [number, number, number, number]);
  for (let i = 0; i < PATH_POINTS; i++) out.push([0, 0, 0, 0]);
  for (const [id, w0] of Object.entries(weights) as [FormationId, number][]) {
    const w = Math.max(0, w0) / sum;
    if (w === 0) continue;
    (shapes[id] ?? FORMATIONS[id]).forEach((p, i) => {
      const o = out[i] as [number, number, number, number];
      for (let k = 0; k < 4; k++) o[k] = (o[k] as number) + (p[k] as number) * w;
    });
  }
  return out;
}

/**
 * The crossing built from the room's swarm polyline (`marks.swarm`, world px), in frame space around
 * the `at` point: the polyline resampled at the default `cross` formation's x offsets (held level past
 * its ends), with the default bands and speed weights. The level agent can move the path in the room
 * file and the river follows it.
 */
export function crossFromPolyline(
  line: readonly (readonly [number, number])[],
  at: { x: number; y: number },
): Formation {
  const yAt = (x: number): number => {
    const first = line[0] as readonly [number, number];
    const last = line[line.length - 1] as readonly [number, number];
    if (x <= first[0]) return first[1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] as readonly [number, number];
      const b = line[i] as readonly [number, number];
      if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-6, b[0] - a[0]);
    }
    return last[1];
  };
  return FORMATIONS.cross.map(([dx, , hw, sp]) => [dx, yAt(at.x + dx) - at.y, hw, sp] as const);
}

/**
 * The time table of a path: for each control point, the share of a moth's trip spent before it
 * (0 at the first point, 1 at the last). Segment time = chord length / speed weight.
 */
export function timeTable(path: readonly PathPoint[], out: number[] = []): number[] {
  out.length = 0;
  out.push(0);
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PathPoint;
    const b = path[i] as PathPoint;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = len / Math.max(0.05, (a[3] + b[3]) / 2);
    seg.push(t);
    total += t;
  }
  let acc = 0;
  for (const t of seg) {
    acc += t;
    out.push(acc / total);
  }
  return out;
}

/** Path length in px (control-point chords). */
export function pathLength(path: readonly PathPoint[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PathPoint;
    const b = path[i] as PathPoint;
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The feed's shape before gaps (the shader's `feed()` mirrors it): 0..1 by entry time. */
export function feedAt(tau: number, releaseTau: number, tail: number): number {
  const f = SWARM.feed;
  if (tau < -f.headStart) return 0;
  let d = smooth(-f.headStart, f.rampIn - f.headStart, tau);
  d *= 1 - (1 - tail) * smooth(f.peakEnd, f.peakEnd + f.decline, tau);
  d *= 1 - smooth(releaseTau, releaseTau + f.releaseFade, tau);
  return d;
}

/** What a behaviour hands the renderer each frame. */
export interface SwarmPlan {
  /** False: nothing is drawn. */
  active: boolean;
  /** Seconds since the swarm started (the feed's clock; may be negative while it waits). */
  tau: number;
  /** `tau` of the release, or a large number before it. */
  releaseTau: number;
  /** The frame point in world px (playfield parallax). */
  fx: number;
  fy: number;
  /** The blended path (frame px). */
  path: PathPoint[];
  /** How much of the path is the pass (0..1): it is pulled onto wherever the moon is on screen. */
  passShare: number;
}

export interface RiverInput {
  dt: number;
  camX: number;
  camY: number;
  /** Her centre x (world px). */
  heroX: number;
}

/**
 * Scene 1's behaviour: the river. Starts on `start(tau0)` (the hatch), passes over the moon, thins
 * to a stream that keeps just ahead of her (never back, never waiting: it drifts on when she
 * stops), and once she nears the promise gap it lets go and crosses to the far side and away.
 */
export class RiverBehaviour {
  private tau = -1e9;
  private started = false;
  private releaseTau = 1e6;
  private fx = 0;
  private fy = 0;
  private vx = 0;
  private vy = 0;
  private tx = 0;
  private prevCamX = 0;
  private prevCamXLock = 0;
  private releaseFx = -1e9;
  /** Debug: never let go (look at the pass anywhere in the room). */
  hold = false;

  constructor(
    /** World x past which the swarm lets go of her (the promise gap's near lip minus `release.before`). */
    private readonly releaseX: number,
    /** Where the frame goes once released (the promise camera mark). */
    private readonly crossAt: { x: number; y: number },
    /** The crossing's shape (room-built: `crossFromPolyline`); absent = the default. */
    private readonly crossShape?: Formation,
  ) {}

  /** Seconds since the `hatch` event (the swarm starts `SWARM.delay` s later). */
  get sinceHatch(): number {
    return this.tau + SWARM.delay;
  }

  get running(): boolean {
    return this.started;
  }

  /** Starts (or restarts) the swarm `tau0` s in, with the frame snapped onto the camera. */
  start(tau0: number, camX: number, camY: number): void {
    this.started = true;
    this.tau = tau0;
    this.releaseTau = 1e6;
    this.snap(camX, camY);
  }

  stop(): void {
    this.started = false;
    this.tau = -1e9;
    this.releaseTau = 1e6;
  }

  /** The camera jumped (a teleport): the frame jumps with it. */
  snap(camX: number, camY: number): void {
    this.fx = this.tx = this.prevCamX = this.prevCamXLock = camX;
    this.fy = camY;
    this.vx = this.vy = 0;
  }

  update(i: RiverInput): SwarmPlan {
    const dt = Math.min(i.dt, 0.1);
    if (!this.started) {
      return {
        active: false,
        tau: 0,
        releaseTau: 1e6,
        fx: i.camX,
        fy: i.camY,
        path: blendFormations({ pass: 1 }),
        passShare: 1,
      };
    }
    this.tau += dt;
    const F = SWARM.follow;
    const released = this.releaseTau < 1e5;
    if (
      !released &&
      !this.hold &&
      // Never before the pass over the moon is over: a player who runs at once still sees it.
      this.sinceHatch >= SWARM.pass.out &&
      (i.heroX > this.releaseX || this.tx > this.releaseX + 400)
    ) {
      this.releaseTau = this.tau;
      this.releaseFx = this.fx;
    }
    let tx: number;
    let ty: number;
    let tvx = 0;
    let wx = F.omegaX;
    let wy = F.omegaY;
    if (this.releaseTau < 1e5) {
      // Never back over her head: if she is already past the gap, it crosses on from where it is.
      tx = Math.max(this.crossAt.x, this.releaseFx);
      ty = this.crossAt.y;
      wx = wy = SWARM.release.omega;
    } else {
      // Never backwards; keeps leaving when she stands still.
      const camV = dt > 0 ? (i.camX - this.prevCamX) / dt : 0;
      const ahead = this.tx + F.drift * dt;
      if (i.camX >= ahead) {
        this.tx = i.camX;
        tvx = camV;
      } else {
        this.tx = ahead;
        tvx = F.drift;
      }
      tx = this.tx;
      ty = i.camY;
    }
    this.prevCamX = i.camX;
    // A critically damped spring that also follows the target's speed: no lag while she runs.
    const ax = wx * wx * (tx - this.fx) + 2 * wx * (tvx - this.vx);
    const ay = wy * wy * (ty - this.fy) - 2 * wy * this.vy;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.fx += this.vx * dt;
    this.fy += this.vy * dt;
    // The pass belongs to the sky: while it plays, the river rides with the camera like the moon.
    const lock = this.releaseTau < 1e5 ? 0 : swarmPassWeight(this.sinceHatch);
    if (lock > 0) {
      this.fx += (i.camX - this.fx) * lock;
      this.fy += (i.camY - this.fy) * lock;
      this.vx += (dt > 0 ? (i.camX - this.prevCamXLock) / dt - this.vx : 0) * lock;
      if (i.camX > this.tx) this.tx = i.camX;
    }
    this.prevCamXLock = i.camX;

    const B = SWARM.blend;
    // After the pass: the thinner stream ahead and above her.
    const lead = smooth(SWARM.pass.hold, SWARM.pass.hold + B.leadDur, this.sinceHatch);
    const cross = this.releaseTau < 1e5 ? smooth(this.releaseTau, this.releaseTau + B.crossDur, this.tau) : 0;
    const path = blendFormations(
      { pass: (1 - lead) * (1 - cross), lead: lead * (1 - cross), cross },
      this.crossShape ? { cross: this.crossShape } : {},
    );
    // Done: the last moth fed has had a full trip (at the slowest layer's pace) since the feed dried up.
    const slowest = Math.min(...SWARM.layers.map((l) => l.speed)) * (1 - SWARM.spread);
    const over = this.releaseTau + SWARM.feed.releaseFade + SWARM.period / slowest + 1;
    if (this.tau > over) this.started = false;
    return {
      active: true,
      tau: this.tau,
      releaseTau: this.releaseTau,
      fx: this.fx,
      fy: this.fy,
      path,
      passShare: (1 - lead) * (1 - cross),
    };
  }
}
