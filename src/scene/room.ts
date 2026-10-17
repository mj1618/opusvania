import type { AbilityId } from '../sim/abilities';
import type { Scene } from '../sim/scene';
import type { StageMarks } from './stage';

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
  /**
   * Reachability claims inside the room for the world check (src/scene/world.ts, memory/world.md).
   * Absent = every exit, door, patch and glade of the room reaches every other with no ability.
   */
  routes?: RouteClaim[];
}

/**
 * "From `from` she can get to `to`" (ids of the room's exits, doors, patches, glades, or `spawn`),
 * with the abilities in `needs` (both ways unless `oneWay`). `door`: the way passes the shortcut of
 * that id, which opens from the `from` side: `from` -> `to` always (she opens it), `to` -> `from` only
 * once it is open. An ability gate is geometry plus one of these.
 */
export interface RouteClaim {
  from: string;
  to: string;
  needs?: AbilityId[];
  oneWay?: boolean;
  door?: string;
  /** Story flags that must be set to pass (a flag gate, memory/level-kit.md); set by triggers she reaches. */
  flags?: string[];
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
  /** Frames of the faster follow of a long fall (more than `realFallPx`) and of an exit's drop. */
  smoothYFastFall?: number;
  realFallPx?: number;
  /** Frames of the spring the vertical target runs through (no step in the view's velocity). */
  targetSmoothY?: number;
  /** Frames the look-ahead takes to build up (and to ease back when she stops). */
  leadFrames?: number;
  /** Seconds of fade up from black at boot and at every restart of the room (0 / absent: none). */
  fadeIn?: number;
  /** A shove of the view on the `hatch` event, px (down: the cocoon bursts). */
  hatchKick?: number;
  /**
   * While she is shut in, the view sits `y` px lower (the cocoon under the branch framed higher); after
   * the `hatch` event it holds `hold` s and eases back over `out` s. Yields to the run like the lean.
   */
  hatchFrame?: { y: number; hold: number; out: number };
  /**
   * A lean of the view (`x`, `y` px) toward something, timed in seconds after the `hatch` event: it
   * eases in from `from` over `in`, holds `hold`, eases out over `out`. Sim time, so it never depends
   * on what she does.
   */
  lean?: { x: number; y: number; from: number; in: number; hold: number; out: number };
  /** Camera zones (src/render/camera/zones.ts, memory/level-kit.md): zoom, lock and bounds while she is inside. */
  zones?: CameraZone[];
}

/**
 * A camera zone: while her body centre is inside the rect, the view eases to `zoom` (default 1; `fit`:
 * the zoom that puts the whole frame, `bounds` or the zone, inside the 16:9 safe area) and keeps inside
 * `bounds` (`lock`: the zone's own rect; a view at least that big centres on it).
 */
export interface CameraZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zoom?: number;
  fit?: boolean;
  lock?: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
}

/** One of the art kit's mood stops: from world x on, the room leans this way (blended between stops). */
export interface MoodStop {
  x: number;
  mood: 'cool' | 'warm' | 'deep';
}

export interface RoomArt {
  /**
   * `greybox`: drawn with flat shapes, hitboxes and labels instead of the painted layers (src/render/greybox,
   * memory/greybox.md); `kit` and `seed` are then unused. Default `painted`.
   */
  mode?: 'painted' | 'greybox';
  /** Greybox: show the marker labels (ids) at boot (default true; `__game.debug.labels()` / G toggles). */
  labels?: boolean;
  /** The region kit that paints it. `grove` = the test grove's hand-placed look (landmarks, waterfall, well). Required when painted. */
  kit?: 'grove' | 'wood';
  /** Seed for every layout choice the painters make. Required when painted. */
  seed?: number;
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
  /**
   * Tatter, the torn-winged moth who stays: feet centre on the branch and the way it faces. `want`: a
   * point it wants and cannot reach (the hub's root shelf): it looks at it, and when she arrives it turns
   * to her and tries for it once, and fails (render/character/tatter.ts). `when` / `until`: it is here only
   * once / until that story flag is set (the root ladder: it leaves the hub and is ahead of her after).
   */
  tatter?: { x: number; y: number; facing: -1 | 1; want?: [number, number]; when?: string; until?: string };
  /** The swarm's path through the sky, west to east (world px polyline). */
  swarm?: Array<[number, number]>;
  /**
   * The promise: a wide gap (`x0`..`x1`, at walk height `y`) the swarm crosses to a far branch she
   * cannot reach yet (glide answers it later). Her way bends down below it.
   */
  promise?: { x0: number; x1: number; y: number };
  /** Where the branch ends over the dark: she drops off here (the exit). Feet point. */
  drop?: { x: number; y: number };
  /** The trees the walk grows from (memory/rooms.md "Tree structure"). */
  trees?: TreeMark[];
  /** The walk's stretches: which rects form one limb, what it grows from, what its far end does. */
  stretches?: StretchMark[];
  /**
   * The promise's far branch: another tree's limb she cannot reach, no collision; a back layer paints it.
   * `points` run from its tip (west, over the promise gap) to its base (east, toward its tree); `width`
   * at the base, tapering to `tipWidth` (default `width`) at the tip.
   */
  farBranch?: { points: Array<[number, number]>; width: number; tipWidth?: number; tree?: string };
  /** Greybox: notes for the designer, written in the room at (x, y) (shown with the labels). */
  notes?: Array<{ x: number; y: number; text: string }>;
  /** Camera hints for the acting / camera work: named views (centre in world px, optional zoom). */
  camera?: Array<{ id: string; x: number; y: number; zoom?: number; note?: string }>;
  /** Greybox story staging (src/scene/stage.ts, memory/staging.md): render only. */
  stage?: StageMarks;
}

/**
 * A tree trunk: centre `x`, width `w` at the walk, from `top` to `bottom` (world y; it may run past the
 * room). `plane: 'walk'` = painted in the playfield behind her (she passes in front), `back` = a step
 * behind. `solid`: there is collision for it (a trunk solid with the same footprint), else decor only.
 */
export interface TreeMark {
  id: string;
  x: number;
  w: number;
  top: number;
  bottom: number;
  plane: 'walk' | 'back';
  solid?: boolean;
}

/**
 * One stretch of walk: every `branch` solid with `x0 <= x < x1` is its top (a run of narrow rects whose
 * tops roll a few px). It grows from `parent` (a tree id or another stretch's id) at `from` (world px,
 * on the parent), toward `grows`. `end` = what its far end does: `burl` (the next stretch abuts it,
 * higher), `knee` (abuts it, lower), `fork` (a gap to the next stretch of the same limb), `snap` (a gap
 * to another limb: a broken end), `trunk` (it ends in its own tree: its root), `tip` (the limb thins out
 * and ends).
 */
export interface StretchMark {
  id: string;
  x0: number;
  x1: number;
  parent: string;
  from: [number, number];
  grows: 'east' | 'west';
  end: 'burl' | 'knee' | 'fork' | 'snap' | 'trunk' | 'tip';
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

/** True if the room is drawn in greybox: flat shapes, hitboxes and labels (src/render/greybox, memory/greybox.md). */
export function isGreybox(room: Room): boolean {
  return room.art?.mode === 'greybox';
}
