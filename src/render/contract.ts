/**
 * The shared read-only contract between the render driver (src/main.ts + src/render/stage.ts) and
 * the three parallel-owned renderers: scene/ (environment), character/ and post/. Change this file
 * only through the orchestrator: everyone compiles against it.
 *
 * Units: "world px" = sim px. At zoom 1 one logical view unit is one world px; the canvas is
 * rendered at full device resolution (the stage root is scaled, nothing is upscaled).
 *
 * THE VIEW SIZE (memory/view-size.md). The canvas fills the window, whatever its shape. The logical
 * view always contains the 16:9 SAFE AREA (SAFE_W x SAFE_H = 1920x1080 logical units) and extends
 * past it: a wider window sees more to the sides (Hor+), a narrower or taller one more above and
 * below (Vert+), up to VIEW_MAX_W x VIEW_MAX_H (beyond that the rest is a dark letterbox). Logical
 * coordinates keep the safe area at 0..SAFE_W x 0..SAFE_H, so the view centre is always
 * (SAFE_W / 2, SAFE_H / 2) and the visible view runs from (left, top) (<= 0) to (left + w, top + h).
 * Anything that covers the screen must cover that rect, read from `ctx.view()` (or `cam.w`, `cam.h`
 * for the size); anything centred stays inside the safe area.
 */
import type { Renderer } from 'pixi.js';
import type { Room } from '../scene/room';
import type { SimEvent } from '../sim/events';
import type { EnemyState, GameState, LuresState, PickupsState, PlayerState, PodsState } from '../sim/state';
import type { LightRegistry } from './lights';

/** The 16:9 safe area: always on screen, at logical 0..SAFE_W x 0..SAFE_H. */
export const SAFE_W = 1920;
export const SAFE_H = 1080;
/**
 * The safe area's size under its old name. NOT the view size: the view is at least this and often
 * more (`ctx.view()`, `cam.w` / `cam.h`). Use it only for what must fit on every screen.
 */
export const VIEW_W = SAFE_W;
export const VIEW_H = SAFE_H;
/**
 * The most the view extends to: 2.4:1 at the widest (21:9 monitors are 2.37-2.39) and 5:4 at the
 * tallest (1920x1536). Bakes that cannot be redrawn on a resize cover this much.
 */
export const VIEW_MAX_W = 2592;
export const VIEW_MAX_H = 1536;

/** The logical view this frame (logical units = world px at zoom 1). */
export interface ViewSize {
  /** Visible size, >= SAFE_W x SAFE_H, <= VIEW_MAX_W x VIEW_MAX_H. */
  readonly w: number;
  readonly h: number;
  /** The visible view's top-left in logical coordinates (<= 0: the safe area starts at 0, 0). */
  readonly left: number;
  readonly top: number;
  /** CSS px per logical unit (the stage root's scale). */
  readonly scale: number;
}

/** The view of a 16:9 window: exactly the safe area. */
export const SAFE_VIEW: ViewSize = { w: SAFE_W, h: SAFE_H, left: 0, top: 0, scale: 1 };

/**
 * The logical view for a canvas of cssW x cssH CSS px: the safe area fits (scale = the smaller of
 * the two ratios), the other axis extends, capped at VIEW_MAX_W x VIEW_MAX_H.
 */
export function viewSizeFor(cssW: number, cssH: number): ViewSize {
  const scale = Math.max(1e-6, Math.min(cssW / SAFE_W, cssH / SAFE_H));
  const w = Math.max(SAFE_W, Math.min(VIEW_MAX_W, cssW / scale));
  const h = Math.max(SAFE_H, Math.min(VIEW_MAX_H, cssH / scale));
  return { w, h, left: (SAFE_W - w) / 2, top: (SAFE_H - h) / 2, scale };
}

/** Where the camera is this render frame (already interpolated between sim frames). */
export interface CameraView {
  /** View centre in world px. */
  readonly x: number;
  readonly y: number;
  /** 1 = the logical view; 4 = a 480x270 world px close-up (of the safe area). */
  readonly zoom: number;
  /**
   * The logical view's size at zoom 1 (`ViewSize.w`, `.h`): what is on screen is w / zoom x h / zoom
   * world px around (x, y). Never assume 1920x1080.
   */
  readonly w: number;
  readonly h: number;
}

/**
 * The player this render frame. Every PlayerState field (src/sim/state.ts) of the latest sim
 * frame, except that `x`, `y` are interpolated between the previous and the latest sim frame (so
 * they are fractional), plus a few conveniences. Velocities are px per sim frame (x60 = px/s).
 */
export interface PlayerView extends Readonly<PlayerState> {
  /** Interpolated centre x and feet y (bottom-centre of the collision box) in world px. */
  readonly cx: number;
  readonly feetY: number;
  /** Interpolated centre y of the collision box. */
  readonly cy: number;
}

/** Read-only sim snapshot handed to the environment each render frame. */
export interface SimView {
  /** Latest sim frame number (60 per second while the sim runs; stands still when frozen). */
  readonly frame: number;
  /** How far this render frame is from the previous sim frame (0) to the latest (1): what `player` is interpolated by. */
  readonly alpha: number;
  readonly player: PlayerView;
  /** Sim events since the previous render update (usually 0-1 sim steps' worth). */
  readonly events: readonly SimEvent[];
  /** The room being played: the sim's scene plus its render-only fields (`art`, `marks`: src/scene/room.ts). */
  readonly scene: Room;
  /** Collectibles at the latest sim frame: `timers[i]` belongs to `scene.pickups[i]`. Read only. */
  readonly pickups: Readonly<PickupsState>;
  /** Lumen pods at the latest sim frame: `hp[i] > 0` = `scene.pods[i]` is still closed. Read only. */
  readonly pods: Readonly<PodsState>;
  /** Enemies at the latest sim frame: `enemies[i]` belongs to `scene.enemies[i]`. Read only. */
  /** The scene's objective: lanterns, heart, ending (memory/goal.md). */
  readonly goal: GameState['goal'];
  readonly enemies: readonly Readonly<EnemyState>[];
  /** Lures (the story's lamps, memory/lures.md): `hp[i] > 0` = `scene.lures[i]` still burns. Read only. */
  readonly lures: Readonly<LuresState>;
}

/** Services every renderer gets at construction. */
export interface RenderContext {
  readonly renderer: Renderer;
  /** The room being played: the sim's scene plus its render-only fields (`art`, `marks`: src/scene/room.ts). */
  readonly scene: Room;
  /** Dynamic point lights: the character registers its ember, environment and post read them. */
  readonly lights: LightRegistry;
  /** Device pixels per world px at zoom 1. Changes on window resize. */
  viewScale(): number;
  /** The logical view now (size, where its top-left is; the safe area is 0..SAFE_W x 0..SAFE_H). Changes on window resize. */
  view(): ViewSize;
}

/**
 * Converts a world point on the playfield (parallax 1) to logical view coordinates (the safe area is
 * 0..SAFE_W x 0..SAFE_H; the visible view is `ViewSize.left`.. and `.top`..).
 */
export function worldToView(cam: CameraView, wx: number, wy: number): { x: number; y: number } {
  return { x: SAFE_W / 2 + (wx - cam.x) * cam.zoom, y: SAFE_H / 2 + (wy - cam.y) * cam.zoom };
}

/** True if a world point (parallax 1) is within `pad` world px of the visible view. */
export function inView(cam: CameraView, wx: number, wy: number, pad = 0): boolean {
  return (
    Math.abs(wx - cam.x) <= cam.w / 2 / cam.zoom + pad && Math.abs(wy - cam.y) <= cam.h / 2 / cam.zoom + pad
  );
}
