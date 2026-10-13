/**
 * The render driver: builds the display tree, owns the camera and the render clock, and calls the
 * three renderers in order every render frame. Nothing here draws anything itself.
 *
 *   app.stage
 *   └ root                 scaled to device pixels; below it everything is in logical view units
 *     ├ layers.root        the PostStage's target (filters go here)
 *     │   sky, far0..2, mid, playfield, character, pickups, foreground, air   (scene/layer-tree.ts)
 *     ├ hud                the glint count, not post-processed (render/hud)
 *     └ debug overlay      collision boxes, not post-processed
 *
 * Per render frame: interpolate camera and player (alpha between the last two sim frames) ->
 * apply the camera to the layers -> SceneRenderer.update -> CharacterRenderer.update ->
 * PickupRenderer.update -> PostStage.update -> hud -> overlay. `present()` then draws the frame.
 */
import { HitboxOverlay } from '../debug/overlay';
import type { Game } from '../game';
import type { SimEvent } from '../sim/events';
import type { PlayerState } from '../sim/state';
import type { GameApp } from './app';
import { type CameraState, createCamera, lerpCamera, stepCamera } from './camera/index';
import { CameraKick } from './camera/kick';
import { CharacterRenderer } from './character/index';
import type { CameraView, PlayerView, RenderContext, SimView } from './contract';
import { Hud } from './hud/index';
import { LightRegistry } from './lights';
import { PickupRenderer } from './pickups/index';
import { PostStage } from './post/index';
import { SceneRenderer } from './scene/index';

/**
 * Debug camera override (`__game.cam`). Every field is optional: a missing x / y follows the game
 * camera, `on: 'player'` centres on the player's collision box instead, zoom defaults to 1.
 * Overrides are not clamped to the scene.
 */
export interface CameraOverride {
  x?: number;
  y?: number;
  zoom?: number;
  on?: 'player';
}

export function playerView(prev: PlayerState, cur: PlayerState, alpha: number): PlayerView {
  const x = prev.x + (cur.x - prev.x) * alpha;
  const y = prev.y + (cur.y - prev.y) * alpha;
  return { ...cur, x, y, cx: x + cur.w / 2, cy: y + cur.h / 2, feetY: y + cur.h };
}

export class RenderStage {
  readonly lights = new LightRegistry();
  readonly ctx: RenderContext;
  readonly scene: SceneRenderer;
  readonly character: CharacterRenderer;
  readonly pickups: PickupRenderer;
  readonly hud: Hud;
  readonly post: PostStage;
  readonly overlay: HitboxOverlay;
  /** Seconds of render time since boot. */
  clock = 0;
  override: CameraOverride | null = null;
  /** The camera and player as last drawn. */
  view: CameraView;
  drawn: PlayerView;
  private cam: CameraState;
  private prevCam: CameraState;
  private pending: SimEvent[] = [];
  /** A blow landing shoves the view a few px (added at view time; the follow camera never sees it). */
  private readonly kick = new CameraKick();

  constructor(
    private readonly ga: GameApp,
    private readonly game: Game,
  ) {
    const scene = game.scene;
    this.ctx = { renderer: ga.app.renderer, scene, lights: this.lights, viewScale: ga.viewScale };
    this.scene = new SceneRenderer(this.ctx);
    this.scene.init(scene);
    this.character = new CharacterRenderer(this.ctx, this.scene.layers.character);
    this.pickups = new PickupRenderer(this.ctx, this.scene.layers.pickups, this.scene.layers.pickupsBack);
    this.post = new PostStage(this.ctx, this.scene.layers.root);
    this.hud = new Hud();
    this.overlay = new HitboxOverlay(scene);
    ga.root.addChild(this.scene.layers.root, this.hud.layer, this.overlay.layer);

    this.cam = createCamera(game.state, scene);
    this.prevCam = { ...this.cam };
    this.view = lerpCamera(this.prevCam, this.cam, 1);
    this.drawn = playerView(game.prev.player, game.state.player, 1);
    // The camera steps once per sim frame so it is as deterministic as the sim.
    game.afterStep.add((events) => {
      if (events.some((e) => e.type === 'spawn')) {
        this.cam = createCamera(game.state, scene);
        this.prevCam = { ...this.cam };
      } else {
        this.prevCam = { ...this.cam };
        stepCamera(this.cam, game.state, scene);
      }
      this.pending.push(...events);
    });
  }

  /** The follow camera's own view (ignoring any override), at the latest sim frame. */
  get followView(): CameraView {
    return lerpCamera(this.prevCam, this.cam, 1);
  }

  /**
   * Advances render time by `dt` seconds and updates every renderer for the state `alpha` of the
   * way from the previous sim frame to the latest (1 = the latest).
   */
  update(dt: number, alpha: number): void {
    this.clock += dt;
    const player = playerView(this.game.prev.player, this.game.state.player, alpha);
    const follow = lerpCamera(this.prevCam, this.cam, alpha);
    const o = this.override;
    const events = this.pending;
    this.pending = [];
    this.kick.update(dt, events);
    const base: CameraView = o
      ? {
          x: o.x ?? (o.on === 'player' ? player.cx : follow.x),
          y: o.y ?? (o.on === 'player' ? player.cy : follow.y),
          zoom: o.zoom ?? 1,
        }
      : follow;
    const view: CameraView = { x: base.x + this.kick.x, y: base.y + this.kick.y, zoom: base.zoom };
    const sim: SimView = {
      frame: this.game.state.frame,
      player,
      events,
      scene: this.game.scene,
      pickups: this.game.state.pickups,
      pods: this.game.state.pods,
    };
    this.scene.layers.applyCamera(view);
    this.scene.update(dt, this.clock, view, sim);
    this.character.update(dt, this.clock, player, events);
    this.pickups.update(dt, this.clock, view, sim);
    this.post.update(dt, this.clock, view);
    this.hud.update(dt, this.clock, sim);
    this.overlay.draw(view, player);
    this.view = view;
    this.drawn = player;
  }

  /** Draws the frame to the canvas. */
  present(): void {
    this.ga.app.render();
  }

  /** Call when the canvas size or resolution changed. */
  resize(): void {
    this.post.resize();
  }
}
