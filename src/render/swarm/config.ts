/**
 * The moth swarm's knobs (memory/swarm.md). Live: `__fx.swarm` in the page, then `__game.render()`.
 *
 * Units: px are logical view px at zoom 1 (a layer px), s are render seconds. Colours are 0xRRGGBB.
 * Targets: docs/design/scenes/01-look-target.md §5.
 */

/** One depth layer of the swarm: its own mesh, in its own container of the layer tree. */
export interface SwarmLayerCfg {
  /** The layer tree container it draws in (scene/layer-tree.ts). */
  layer: 'swarmFar' | 'swarmMid' | 'swarmNear';
  /** How many moths this layer owns (alive or not: the feed decides how many fly). */
  count: number;
  /** Wingspan in px, smallest and largest (per moth, skewed toward the small end). */
  size: [number, number];
  /** Speed along the path, x the base (`period`): far moths cross the screen slower. */
  speed: number;
  /** The band's half width, x the formation's. */
  band: number;
  /** Shifts the whole path on screen (px): far moths a little higher, near ones down across her. */
  dx: number;
  dy: number;
  /** Flutter: sideways px at the largest size (scaled by size), and its rate range in Hz. */
  flutter: number;
  /** Wingbeat Hz range (each moth its own). */
  beat: [number, number];
  /** Depth of field: blur in px (near moths only). */
  blur: number;
  /** Mix toward the sky colour (haze) and the layer's overall opacity. */
  haze: number;
  alpha: number;
  /** Moon-side rim strength (1 = `rim` colour at full), and how much the moon's halo lights the wings through. */
  rim: number;
  /** x the feed: how full this layer is at the peak and in the thin tail (near moths only pass once). */
  peak: number;
  tail: number;
  /** Antennae and a separate head (only worth drawing when the moth is big enough). */
  detail: boolean;
}

export const SWARM = {
  /** Master switch (debug). */
  enabled: true,
  /** Shape work: every moth of each layer still in a grid round the view centre (`__fx.swarm.debug.lineup = true`). */
  debug: { lineup: false, spacing: 60 },
  /**
   * Seconds after the `hatch` event the head of the river comes into view (frame left). The first
   * moths are already `feed.headStart` s along the path then, just off screen.
   */
  delay: 1.2,
  /** A teleport (the capture tools) or a room without a hatching starts the swarm this far in: the thin lead stream. */
  lateStart: 14,
  /**
   * Seconds a moth of speed 1 takes along the whole path (about 3400 px for the pass): ~360 px/s.
   * Each moth is ±25% of that (`spread`).
   */
  period: 9.0,
  spread: 0.25,
  /**
   * How full the stream is over time (0..1 of each layer's moths), keyed by when a moth enters the
   * back of the path: `rampIn` s to full, full until `peakEnd`, down to `tail` over `decline` s;
   * after the release (the promise gap) down to nothing over `releaseFade` s.
   */
  feed: { headStart: 1.8, rampIn: 1.2, peakEnd: 6.0, decline: 5.0, tail: 0.3, releaseFade: 3.0 },
  /** Gaps and knots: the feed dips this deep (0..1) on a slow noise of this rate (Hz). */
  gaps: { depth: 0.75, rate: 0.32 },
  /**
   * Density waves along the river: two travelling compressions, `speed` x the flow, amplitudes as
   * a share of the strongest that keeps moths in order (1).
   */
  waves: { k: [2.1, 3.7] as [number, number], amp: [0.55, 0.3] as [number, number], speed: 1.5 },
  /** The band breathes: knots and necks, its half width x (1 ± `amp`) on a wave of `k` per path. */
  neck: { amp: 0.4, k: 1.3, rate: 0.35 },
  /** Formation blends (s): pass -> lead starting `leadFrom` s in, over `leadDur`; lead -> cross over `crossDur`. */
  blend: { leadFrom: 6.5, leadDur: 4.5, crossDur: 3.0 },
  /**
   * The frame the river is drawn in follows the camera: never backwards, and it keeps leaving at
   * `drift` px/s when she stands still. `omega` = spring stiffness (1/s) toward it, x and y.
   */
  follow: { drift: 55, omegaX: 2.4, omegaY: 1.2 },
  /**
   * The promise: the swarm lets go of her once her x (or the frame's) passes `promise.x0 - before`;
   * the frame then springs to the room's `promise` camera mark at `omega` and the feed dries up.
   */
  release: { before: 760, omega: 0.9 },
  /** Behaviours along the river (fraction of moths, and their timing). */
  dart: { share: 0.05, every: [4, 8] as [number, number], dur: 0.45, reach: 70 },
  loop: { share: 0.035, every: [6, 11] as [number, number], dur: 1.35, radius: [45, 80] as [number, number] },
  straggle: { share: 0.08, lateral: 2.2, slow: 0.78 },
  /** Lateral wander across the band (share of the half width) and its rate (Hz). */
  wander: { amp: 0.35, rate: 0.18 },
  /**
   * The wingbeat: how far each wing swings (rad either side) and how we see it: `tilt` 0 = from below
   * (a bow tie that squashes), pi/2 = side on (both wings up, then both down). Most of the way to side
   * on reads as a moth at 15 px.
   */
  flap: { amp: 1.2, tilt: 0.95 },
  /** Heading swing (rad) on top of the velocity, and the bank flutter. */
  heading: { swing: 0.3 },
  /** A brief silver glint under the wings: share of moths, how often each one can (s), length (s). */
  glint: { share: 0.05, every: 3.5, dur: 0.22, gain: 0.62 },
  colors: {
    /** Body and wings in silhouette (luma ~14). */
    body: 0x0a111c,
    /** What far moths haze toward (the sky away from the moon). */
    sky: 0x223a5c,
    /** Moonlight on wing edges (cool silver; never warm). */
    rim: 0xa6bddb,
    /** Moon through thin wings, on the halo. */
    membrane: 0x5d7899,
    glint: 0xc6d4e6,
  },
  /**
   * Moonlight on the moon-side half of the wings as the beat turns them to it (`gain`, `floor` when
   * edge-on; away from the moon only: backlit they stay silhouettes), and the moon-side edge (`rim`).
   */
  sheen: { gain: 0.3, floor: 0.2, rim: 0.6 },
  /** The moon's halo reach (x the disc radius) for rim and wing light. */
  halo: 3.2,
  layers: [
    {
      layer: 'swarmFar',
      count: 700,
      size: [4, 9.5],
      speed: 0.62,
      band: 1.25,
      dx: 40,
      dy: -40,
      flutter: 3,
      beat: [9, 15],
      blur: 0,
      haze: 0.48,
      alpha: 0.92,
      rim: 0.35,
      peak: 1,
      tail: 1,
      detail: false,
    },
    {
      layer: 'swarmMid',
      count: 260,
      size: [13, 27],
      speed: 1,
      band: 1,
      dx: 0,
      dy: 0,
      flutter: 9,
      beat: [8, 13],
      blur: 0,
      haze: 0.08,
      alpha: 1,
      rim: 1,
      peak: 1,
      tail: 1,
      detail: true,
    },
    {
      layer: 'swarmNear',
      count: 9,
      size: [30, 56],
      speed: 1.55,
      band: 2.2,
      dx: -60,
      dy: 360,
      flutter: 14,
      beat: [8, 11],
      blur: 3.5,
      haze: 0,
      alpha: 0.96,
      rim: 0.8,
      peak: 1,
      tail: 0,
      detail: true,
    },
  ] as SwarmLayerCfg[],
};

export type SwarmConfig = typeof SWARM;
