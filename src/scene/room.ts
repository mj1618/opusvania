import type { Scene } from '../sim/scene';

/**
 * A room: the sim's `Scene` plus the fields only render, the tools and the acting agents read.
 * Every extra field is optional, so any `Scene` (a flat test scene) is a `Room` too. Data lives in
 * content/rooms/<id>.json, validated by src/scene/index.ts. Types only (no Zod) so render can import it.
 */
export interface Room extends Scene {
  /** A name for people (the debug panel). */
  title?: string;
  /** The region (`wood`, ...); absent for test rooms outside the world. */
  region?: string;
  /** Look parameters for the region's kit (memory/rooms.md). */
  art?: RoomArt;
  /** Points of interest the art and acting agents place things at. No sim effect. */
  marks?: RoomMarks;
  /** Camera stops and close-up spots for `npm run shots -- --room <id>`. */
  shots?: RoomShots;
  /** The room's own camera: framing overrides and its scripted beats (src/render/camera/beats.ts). */
  camera?: RoomCamera;
}

/**
 * Per-room camera. The first four override `cameraTuning` (src/render/camera/tuning.ts) for this room;
 * absent = the shared value (the test grove sets none). The beats are off unless set.
 */
export interface RoomCamera {
  /** Her feet line, as a share of the safe area's height from its top. */
  anchorY?: number;
  lookaheadX?: number;
  /** How far below her feet the view leads in a real fall, px. */
  fallLookahead?: number;
  smoothYFall?: number;
  /** Seconds of fade up from black at boot and at every restart of the room (0 / absent: none). */
  fadeIn?: number;
  /** A shove of the view on the `hatch` event, px (down: the cocoon bursts). */
  hatchKick?: number;
  /**
   * A lean of the view (`x`, `y` px) toward something, timed in seconds after the `hatch` event: it
   * eases in from `from` over `in`, holds `hold`, eases out over `out`. Sim time, so it never depends
   * on what she does.
   */
  lean?: { x: number; y: number; from: number; in: number; hold: number; out: number };
}

/** One of the art kit's mood stops: from world x on, the room leans this way (blended between stops). */
export interface MoodStop {
  x: number;
  mood: 'cool' | 'warm' | 'deep';
}

export interface RoomArt {
  /** The region kit that paints it. `grove` = the test grove's hand-placed look (landmarks, waterfall, well). */
  kit: 'grove' | 'wood';
  /** Seed for every layout choice the painters make. */
  seed: number;
  /**
   * The moon, the key light: where it hangs in the sky (view px of the 1920x1080 view: the sky is
   * screen space and never moves) and its disc radius in view px.
   */
  moon?: { x: number; y: number; r: number };
  /**
   * The far warm afterglow on the horizon (the valley's lamps, unseen yet): view px in the sky and
   * strength 0..1. The only warm in a room without lamps.
   */
  afterglow?: { x: number; y: number; strength: number };
  /** Mood stops along the room, west to east. Absent = cool all the way. */
  moods?: MoodStop[];
  /**
   * The camera centre y (world px) the background layers (far, mid) are composed for: where they
   * line up with the playfield. Absent = the camera's lowest resting y (the Grove's rule).
   */
  anchorY?: number;
  /**
   * The camera centre x the background layers line up at (default: the room's centre). Keeps a
   * backdrop composed for one room width in place when the room grows.
   */
  anchorX?: number;
}

/** A cocoon on the hatching branch: `x`, `y` = where its thread is tied (the hang point), `len` its length. */
export interface CocoonMark {
  id: string;
  x: number;
  y: number;
  len: number;
  /** `closed` = hers (she breaks out of it); `split` = an empty husk. */
  state: 'split' | 'closed';
}

export interface RoomMarks {
  cocoons?: CocoonMark[];
  /** Tatter, the torn-winged moth who stays: feet centre on the branch and the way it faces. */
  tatter?: { x: number; y: number; facing: -1 | 1 };
  /** The swarm's path through the sky, west to east (world px polyline). */
  swarm?: Array<[number, number]>;
  /**
   * The promise: a wide gap (`x0`..`x1`, at walk height `y`) the swarm crosses to a far branch she
   * cannot reach yet (glide answers it later). Her way bends down below it.
   */
  promise?: { x0: number; x1: number; y: number };
  /** Where the branch ends over the dark: she drops off here (the exit). Feet point. */
  drop?: { x: number; y: number };
  /** Camera hints for the acting / camera work: named views (centre in world px, optional zoom). */
  camera?: Array<{ id: string; x: number; y: number; zoom?: number; note?: string }>;
}

/** A camera stop: where she stands (feet centre); the follow camera frames her. */
export interface ShotStop {
  name: string;
  x: number;
  y: number;
}

export interface RoomShots {
  wide: ShotStop[];
  /**
   * Where the character close-ups are played (feet centre): `ground` needs ~600 px of flat ground to
   * its right; `idle` defaults to `ground`; `wall` a wall within a jump to the right (absent: the
   * wall close-ups are skipped).
   */
  closeup?: { ground: [number, number]; idle?: [number, number]; wall?: [number, number] };
}
