/**
 * The render driver: builds the display tree, owns the camera and the render clock, and calls the
 * three renderers in order every render frame. Nothing here draws anything itself.
 *
 *   app.stage
 *   └ root                 scaled to device pixels; below it everything is in logical view units
 *     ├ layers.root        the PostStage's target (filters go here)
 *     │   sky, far0..2, mid, playfield, character, pickups, foreground, air   (scene/layer-tree.ts)
 *     ├ dip                  the dark dip over a re-form / restart (camera/dip.ts), under the HUD
 *     ├ hud                health lights and the glint count, not post-processed (render/hud)
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
import { DipOverlay } from './camera/dip';
import { type CameraState, createCamera, lerpCamera, stepCamera } from './camera/index';
import { CameraKick } from './camera/kick';
import { ReformShot } from './camera/reform';
import { CharacterRenderer } from './character/index';
import type { CameraView, PlayerView, RenderContext, SimView } from './contract';
import { EnemyRenderer } from './enemies/index';
import { GivingRenderer } from './giving/index';
import { GoalCamera } from './goal/camera';
import { GoalRenderer } from './goal/index';
import { Hud } from './hud/index';
import { LightRegistry } from './lights';
import { PickupRenderer } from './pickups/index';
import { PostStage } from './post/index';
import type { PrologueRenderer } from './prologue/index';
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
  readonly enemies: EnemyRenderer;
  readonly pickups: PickupRenderer;
  readonly goal: GoalRenderer;
  /** Giving, drawn: the glint she gives in flight, it being received, a calmed creature's warmth (memory/giving-render.md). */
  readonly giving: GivingRenderer;
  readonly hud: Hud;
  readonly post: PostStage;
  readonly overlay: HitboxOverlay;
  /** Seconds of render time since boot. */
  clock = 0;
  override: CameraOverride | null = null;
  /**
   * Called at the end of every `update` with its `dt` (after the view is final). Listeners only
   * read (the audio director hears the camera here); render knows nothing of them.
   */
  readonly afterUpdate = new Set<(dt: number) => void>();
  /** The camera and player as last drawn. */
  view: CameraView;
  drawn: PlayerView;
  private cam: CameraState;
  private prevCam: CameraState;
  private pending: SimEvent[] = [];
  /** A blow landing shoves the view a few px (added at view time; the follow camera never sees it). */
  private readonly kick = new CameraKick();
  /** The heart waking leans the view toward it; the ending eases it in (render-side, like the kick). */
  private readonly goalCam = new GoalCamera();
  /** Fade / re-form / restart: the pan that replaces the cut and the dark dip over it (camera/reform.ts). */
  private readonly reformShot = new ReformShot();
  private readonly dip = new DipOverlay();
  /** The opening, while it plays (render/prologue; its director, src/prologue.ts, advances its clock). */
  private prologue: PrologueRenderer | null = null;
  private prologueTick: ((dt: number) => void) | null = null;
  private prologueClock = 0;

  constructor(
    private readonly ga: GameApp,
    private readonly game: Game,
  ) {
    const scene = game.scene;
    this.ctx = { renderer: ga.app.renderer, scene, lights: this.lights, viewScale: ga.viewScale };
    this.scene = new SceneRenderer(this.ctx);
    this.scene.init(scene);
    this.character = new CharacterRenderer(this.ctx, this.scene.layers.character);
    this.enemies = new EnemyRenderer(this.ctx, this.scene.layers.enemies, this.scene.layers.enemiesFront);
    this.pickups = new PickupRenderer(this.ctx, this.scene.layers.pickups, this.scene.layers.pickupsBack);
    const L = this.scene.layers;
    this.goal = new GoalRenderer(this.ctx, {
      light: L.get('goalLight'),
      back: L.get('goal'),
      front: L.pickups,
    });
    this.giving = new GivingRenderer(this.ctx, L.pickups, L.get('goal'), this.goal);
    this.post = new PostStage(this.ctx, this.scene.layers.root);
    this.hud = new Hud();
    this.overlay = new HitboxOverlay(scene);
    ga.root.addChild(this.scene.layers.root, this.dip.layer, this.hud.layer, this.overlay.layer);

    this.cam = createCamera(game.state, scene);
    this.prevCam = { ...this.cam };
    this.view = lerpCamera(this.prevCam, this.cam, 1);
    this.drawn = playerView(game.prev.player, game.state.player, 1);
    // The camera steps once per sim frame so it is as deterministic as the sim.
    let state = game.state;
    game.afterStep.add((events) => {
      const fade = events.find((e) => e.type === 'fade');
      if (fade?.type === 'fade') {
        const p = game.state.player;
        this.reformShot.fade(fade.frames, Math.hypot(p.safeX - fade.x, p.safeY - fade.y));
      }
      if (events.some((e) => e.type === 'spawn')) {
        const from = this.followView;
        this.cam = createCamera(game.state, scene);
        this.prevCam = { ...this.cam };
        // A re-form glides there under a dip; a restart (a new state) dips; a teleport just cuts.
        if (events.some((e) => e.type === 'reform')) this.reformShot.reform(from, this.followView);
        else if (game.state !== state) this.reformShot.restart();
        else this.reformShot.clear();
        state = game.state;
      } else {
        this.prevCam = { ...this.cam };
        stepCamera(this.cam, game.state, scene);
      }
      this.pending.push(...events);
    });
  }

  /**
   * Puts the prologue over the game: its layer above the scene (under the dip and the HUD), its
   * camera in place of the follow camera, `tick(dt)` called first thing in every update.
   */
  attachPrologue(p: PrologueRenderer, tick: (dt: number) => void): void {
    this.prologue = p;
    this.prologueTick = tick;
    this.ga.root.addChildAt(p.layer, this.ga.root.getChildIndex(this.scene.layers.root) + 1);
    this.hud.layer.alpha = 0;
  }

  /** The prologue is over: its pieces go, the game's camera, hero and HUD come back. */
  detachPrologue(): void {
    const p = this.prologue;
    if (!p) return;
    this.prologue = null;
    this.prologueTick = null;
    p.destroy();
    this.scene.layers.root.visible = true;
    this.scene.layers.character.visible = true;
    this.scene.layers.pickups.alpha = this.scene.layers.pickupsBack.alpha = 1;
    this.prologueClock = 0;
    this.hudFade = 1;
  }

  /** The HUD comes up over this long once the prologue hands over (s). */
  private hudFade = 0;

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
    this.prologueTick?.(dt);
    const pro = this.prologue;
    const player = playerView(this.game.prev.player, this.game.state.player, alpha);
    const follow = lerpCamera(this.prevCam, this.cam, alpha);
    const o = this.override;
    const events = this.pending;
    this.pending = [];
    this.kick.update(dt, events);
    const rs = this.reformShot;
    rs.update(dt);
    this.dip.set(rs.dip);
    const base: CameraView = o
      ? {
          x: o.x ?? (o.on === 'player' ? player.cx : follow.x),
          y: o.y ?? (o.on === 'player' ? player.cy : follow.y),
          zoom: o.zoom ?? 1,
        }
      : follow;
    // The goal's camera moves belong to the follow camera only: a debug override stays where it was put.
    const gc = this.goalCam;
    gc.update(
      dt,
      events,
      this.game.state.goal,
      alpha,
      this.game.state.player.grounded,
      this.game.scene,
      follow,
    );
    let view: CameraView = o
      ? { x: base.x + this.kick.x, y: base.y + this.kick.y, zoom: base.zoom }
      : {
          x: base.x + this.kick.x + gc.x + rs.x,
          y: base.y + this.kick.y + gc.y + rs.y,
          zoom: base.zoom * gc.zoom,
        };
    // The prologue's camera track, unless a debug override holds the view.
    if (pro && !o) view = pro.camera(view, player) ?? view;
    const sim: SimView = {
      frame: this.game.state.frame,
      alpha,
      player,
      events,
      scene: this.game.scene,
      pickups: this.game.state.pickups,
      pods: this.game.state.pods,
      enemies: this.game.state.enemies,
      goal: this.game.state.goal,
    };
    this.scene.layers.applyCamera(view);
    if (pro) {
      this.prologueClock += dt;
      this.scene.layers.root.visible = !pro.groveHidden;
      this.scene.layers.character.visible = !pro.heroHidden;
      // The forest's glints wait: the first one she sees is the one that comes down to her.
      this.scene.layers.pickups.alpha = this.scene.layers.pickupsBack.alpha = pro.hudAlpha;
      // Before her: actors that act with her, and the cues for her acting.
      pro.update(dt, this.prologueClock, view, sim);
    }
    this.scene.update(dt, this.clock, view, sim);
    this.character.update(dt, this.clock, player, events);
    if (pro?.heroHidden) {
      // Still in her cocoon: her own light does not light the Grove.
      const ember = this.lights.get('ember');
      if (ember) ember.intensity = 0;
    }
    this.enemies.update(dt, this.clock, view, sim);
    this.pickups.update(dt, this.clock, view, sim);
    this.goal.update(dt, this.clock, view, sim);
    this.giving.update(dt, this.clock, view, sim);
    this.post.update(dt, this.clock, view);
    this.hud.update(dt, this.clock, sim);
    if (pro) this.hud.layer.alpha = pro.hudAlpha;
    else if (this.hudFade > 0) {
      this.hudFade = Math.max(0, this.hudFade - dt / 1.2);
      this.hud.layer.alpha = 1 - this.hudFade;
    }
    this.overlay.draw(view, player);
    this.view = view;
    this.drawn = player;
    for (const fn of this.afterUpdate) fn(dt);
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
