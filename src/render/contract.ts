/**
 * The shared read-only contract between the render driver (src/main.ts + src/render/stage.ts) and
 * the three parallel-owned renderers: scene/ (environment), character/ and post/. Change this file
 * only through the orchestrator: everyone compiles against it.
 *
 * Units: "world px" = sim px. The logical view is VIEW_W x VIEW_H world px at zoom 1; the canvas
 * is rendered at full device resolution (the stage root is scaled, nothing is upscaled).
 */
import type { Renderer } from 'pixi.js';
import type { SimEvent } from '../sim/events';
import type { Scene } from '../sim/scene';
import type { EnemyState, PickupsState, PlayerState, PodsState } from '../sim/state';
import type { LightRegistry } from './lights';

/** Logical view size in world px at zoom 1 (16:9). */
export const VIEW_W = 1920;
export const VIEW_H = 1080;

/** Where the camera is this render frame (already interpolated between sim frames). */
export interface CameraView {
  /** View centre in world px. */
  readonly x: number;
  readonly y: number;
  /** 1 = the logical view; 4 = a 480x270 world px close-up. */
  readonly zoom: number;
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
  readonly scene: Scene;
  /** Collectibles at the latest sim frame: `timers[i]` belongs to `scene.pickups[i]`. Read only. */
  readonly pickups: Readonly<PickupsState>;
  /** Lumen pods at the latest sim frame: `hp[i] > 0` = `scene.pods[i]` is still closed. Read only. */
  readonly pods: Readonly<PodsState>;
  /** Enemies at the latest sim frame: `enemies[i]` belongs to `scene.enemies[i]`. Read only. */
  readonly enemies: readonly Readonly<EnemyState>[];
}

/** Services every renderer gets at construction. */
export interface RenderContext {
  readonly renderer: Renderer;
  readonly scene: Scene;
  /** Dynamic point lights: the character registers its ember, environment and post read them. */
  readonly lights: LightRegistry;
  /** Device pixels per world px at zoom 1 (canvas width / VIEW_W). Changes on window resize. */
  viewScale(): number;
}

/** Converts a world point on the playfield (parallax 1) to logical view coordinates (0..VIEW_W, 0..VIEW_H). */
export function worldToView(cam: CameraView, wx: number, wy: number): { x: number; y: number } {
  return { x: VIEW_W / 2 + (wx - cam.x) * cam.zoom, y: VIEW_H / 2 + (wy - cam.y) * cam.zoom };
}
