/**
 * The render driver: builds the display tree, owns the camera and the render clock, and calls the
 * three renderers in order every render frame. Nothing here draws anything itself.
 *
 *   app.stage
 *   └ root                 scaled to device pixels; below it everything is in logical view units,
 *     │                    the 16:9 safe area at 0..SAFE_W x 0..SAFE_H, the view around it to the
 *     │                    window's edges (ga.view(): contract.ts ViewSize, memory/view-size.md)
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
import { CameraBeats } from './camera/beats';
import { DipOverlay } from './camera/dip';
import { type CameraState, createCamera, lerpCamera, resizeCamera, stepCamera } from './camera/index';
import { CameraKick } from './camera/kick';
import { ReformShot } from './camera/reform';
import { RoomFade } from './camera/room-fade';
import { type CameraTuning, cameraFor } from './camera/tuning';
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
import { SceneRenderer } from './scene/index';
import { setRoomLook } from './scene/lib/room-look';
import { SwarmRenderer } from './swarm/index';

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
  /** The moth swarm leaving without her (memory/swarm.md). */
  readonly swarm: SwarmRenderer;
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
  /** Leaving the room (a black fade over the exit's hold) and the dip of a caught fall: camera/room-fade.ts. */
  private readonly roomFade: RoomFade;
  /** The room's scripted beats: the hatch kick, the lean toward the swarm (camera/beats.ts). */
  private readonly beats: CameraBeats;
  /** The follow camera's tuning for this room (`room.camera` framing over `cameraTuning`). */
  private readonly ct: CameraTuning;

  constructor(
    private readonly ga: GameApp,
    private readonly game: Game,
  ) {
    const scene = game.scene;
    this.ct = cameraFor(scene);
    this.roomFade = new RoomFade(scene.camera?.fadeIn ?? 0);
    this.beats = new CameraBeats(scene.camera);
    // The room's look first: shaders are built with its zone edges and key light (room-look.ts).
    setRoomLook(scene);
    this.ctx = {
      renderer: ga.app.renderer,
      scene,
      lights: this.lights,
      viewScale: ga.viewScale,
      view: ga.view,
    };
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
    this.swarm = new SwarmRenderer(this.ctx, L);
    this.post = new PostStage(this.ctx, this.scene.layers.root);
    this.hud = new Hud();
    this.overlay = new HitboxOverlay(scene);
    ga.root.addChild(
      this.scene.layers.root,
      this.dip.layer,
      this.roomFade.layer,
      this.hud.layer,
      this.overlay.layer,
    );

    const v0 = ga.view();
    this.cam = createCamera(game.state, scene, this.ct, v0.w, v0.h);
    // Boot: the room comes up from black (if it says so). Not when booted paused (`?manual`: the tools
    // and tests want the picture at once); `__game.load()` restarts with the fade.
    if (game.mode !== 'manual') this.roomFade.fadeIn();
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
      const v = ga.view();
      if (events.some((e) => e.type === 'spawn')) {
        const from = this.followView;
        this.cam = createCamera(game.state, scene, this.ct, v.w, v.h);
        this.prevCam = { ...this.cam };
        // A re-form glides there under a dip; a restart (a new state) dips (or fades up from black, if
        // the room says so); a teleport just cuts.
        if (events.some((e) => e.type === 'reform')) this.reformShot.reform(from, this.followView);
        else if (game.state !== state) {
          this.reformShot.restart();
          this.roomFade.fadeIn();
        } else this.reformShot.clear();
        state = game.state;
      } else {
        resizeCamera(this.cam, scene, v.w, v.h, this.ct);
        this.prevCam = { ...this.cam };
        stepCamera(this.cam, game.state, scene, this.ct);
      }
      this.beats.onStep(events, game.state.frame);
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
    // The window may have changed shape since the last sim step: the camera sees through the new view.
    const vs = this.ga.view();
    resizeCamera(this.prevCam, this.game.scene, vs.w, vs.h, this.ct);
    resizeCamera(this.cam, this.game.scene, vs.w, vs.h, this.ct);
    const player = playerView(this.game.prev.player, this.game.state.player, alpha);
    const follow = lerpCamera(this.prevCam, this.cam, alpha);
    const o = this.override;
    const events = this.pending;
    this.pending = [];
    this.kick.update(dt, events);
    const st = this.game.state;
    this.beats.update(dt, st.frame, alpha, {
      hatch: st.hatch,
      vx: st.player.vx,
      grounded: st.player.grounded,
    });
    const rs = this.reformShot;
    rs.update(dt);
    this.dip.set(rs.dip, vs);
    this.roomFade.update(dt, events, vs);
    const base: CameraView = o
      ? {
          x: o.x ?? (o.on === 'player' ? player.cx : follow.x),
          y: o.y ?? (o.on === 'player' ? player.cy : follow.y),
          zoom: o.zoom ?? 1,
          w: vs.w,
          h: vs.h,
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
    const view: CameraView = o
      ? { x: base.x + this.kick.x, y: base.y + this.kick.y, zoom: base.zoom, w: vs.w, h: vs.h }
      : {
          x: base.x + this.kick.x + gc.x + rs.x + this.beats.x,
          y: base.y + this.kick.y + gc.y + rs.y + this.beats.y,
          zoom: base.zoom * gc.zoom,
          w: vs.w,
          h: vs.h,
        };
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
    this.scene.update(dt, this.clock, view, sim);
    this.character.update(dt, this.clock, player, events, this.game.state.hatch);
    this.enemies.update(dt, this.clock, view, sim);
    this.pickups.update(dt, this.clock, view, sim);
    this.goal.update(dt, this.clock, view, sim);
    this.giving.update(dt, this.clock, view, sim);
    this.swarm.update(dt, this.clock, view, sim);
    this.post.update(dt, this.clock, view);
    this.hud.update(dt, this.clock, sim, vs);
    this.overlay.draw(view, player);
    this.view = view;
    this.drawn = player;
    for (const fn of this.afterUpdate) fn(dt);
  }

  /** Draws the frame to the canvas. */
  present(): void {
    this.ga.app.render();
  }

  /** Call when the canvas size or resolution changed (the view's shape may have too). */
  resize(): void {
    const v = this.ga.view();
    resizeCamera(this.prevCam, this.game.scene, v.w, v.h, this.ct);
    resizeCamera(this.cam, this.game.scene, v.w, v.h, this.ct);
    this.post.resize();
  }
}
