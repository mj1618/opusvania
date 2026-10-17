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
 *     ├ hurt vignette        the dark pulse when she is hurt (camera/hurt-fx.ts)
 *     ├ dip                  the dark dip over a re-form / restart (camera/dip.ts), under the HUD
 *     ├ hud                health lights and the glint count, not post-processed (render/hud)
 *     └ debug overlay      collision boxes, not post-processed
 *
 * Per render frame: interpolate camera and player (alpha between the last two sim frames) ->
 * apply the camera to the layers -> SceneRenderer.update -> CharacterRenderer.update ->
 * PickupRenderer.update -> PostStage.update -> hud -> overlay. `present()` then draws the frame.
 */
import { TexturePool } from 'pixi.js';
import { HitboxOverlay } from '../debug/overlay';
import type { Game } from '../game';
import { isGreybox } from '../scene/room';
import type { SimEvent } from '../sim/events';
import type { PlayerState } from '../sim/state';
import type { GameApp } from './app';
import { CameraBeats } from './camera/beats';
import { DipOverlay } from './camera/dip';
import { HurtVignette } from './camera/hurt-fx';
import { type CameraState, createCamera, lerpCamera, resizeCamera, stepCamera } from './camera/index';
import { CameraKick } from './camera/kick';
import { ReformShot } from './camera/reform';
import { RoomFade } from './camera/room-fade';
import { CameraShake } from './camera/shake';
import { StageCamera } from './camera/stage-cam';
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
import { POST } from './post/config';
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
  ctx!: RenderContext;
  /** The room's renderers: rebuilt whenever she goes into another room (`rebuild`, render/lifecycle.ts). */
  scene!: SceneRenderer;
  character!: CharacterRenderer;
  enemies!: EnemyRenderer;
  pickups!: PickupRenderer;
  goal!: GoalRenderer;
  /** Giving, drawn: the glint she gives in flight, it being received, a calmed creature's warmth (memory/giving-render.md). */
  giving!: GivingRenderer;
  /** The moth swarm leaving without her (memory/swarm.md). */
  swarm!: SwarmRenderer;
  post!: PostStage;
  /** The HUD and the debug overlay stay for the whole session (they read the sim, not the room's art). */
  readonly hud: Hud;
  readonly overlay: HitboxOverlay;
  /** Seconds of render time since boot. */
  clock = 0;
  override: CameraOverride | null = null;
  /**
   * Called at the end of every `update` with its `dt` (after the view is final). Listeners only
   * read (the audio director hears the camera here); render knows nothing of them.
   */
  readonly afterUpdate = new Set<(dt: number) => void>();
  /** Called after the room's renderers were rebuilt for another room (with its id). */
  readonly onRoom = new Set<(room: string) => void>();
  /** The camera and player as last drawn. */
  view: CameraView;
  drawn: PlayerView;
  /** The room the renderers are built for, and how many times they have been built. */
  builtFor = '';
  builds = 0;
  private cam!: CameraState;
  private prevCam!: CameraState;
  private pending: SimEvent[] = [];
  /** A blow landing shoves the view a few px (added at view time; the follow camera never sees it). */
  private readonly kick = new CameraKick();
  /** Screen shake: one trauma value the loud beats add to (camera/shake.ts, memory/feel.md). */
  private readonly shake = new CameraShake();
  /** The dark pulse at the edges when she is hurt (camera/hurt-fx.ts). */
  private readonly hurtVignette = new HurtVignette();
  /** The heart waking leans the view toward it; the ending eases it in (render-side, like the kick). */
  private readonly goalCam = new GoalCamera();
  /** Fade / re-form / restart: the pan that replaces the cut and the dark dip over it (camera/reform.ts). */
  private readonly reformShot = new ReformShot();
  private readonly dip = new DipOverlay();
  /** Leaving the room (a black fade over the exit's hold) and the dip of a caught fall: camera/room-fade.ts. */
  private readonly roomFade: RoomFade;
  /** The room's scripted beats: the hatch kick, the lean toward the swarm (camera/beats.ts). */
  private beats!: CameraBeats;
  /** The story's camera beats from `marks.stage`: the vista hold, the glimpse, the bask (camera/stage-cam.ts). */
  private stageCam!: StageCamera;
  /** The follow camera's tuning for this room (`room.camera` framing over `cameraTuning`). */
  private ct!: CameraTuning;
  /** Post-processing as the page booted: a greybox room turns it off, a painted one back to this. */
  private readonly postWanted = POST.enabled;

  constructor(
    private readonly ga: GameApp,
    private readonly game: Game,
  ) {
    const scene = game.scene;
    this.roomFade = new RoomFade(scene.camera?.fadeIn ?? 0);
    this.hud = new Hud();
    this.overlay = new HitboxOverlay(scene);
    ga.root.addChild(
      this.hurtVignette.layer,
      this.dip.layer,
      this.roomFade.layer,
      this.hud.layer,
      this.overlay.layer,
    );
    this.build();
    // Boot: the room comes up from black (if it says so). Not when booted paused (`?manual`: the tools
    // and tests want the picture at once); `__game.load()` restarts with the fade.
    if (game.mode !== 'manual') this.roomFade.fadeIn();
    this.view = lerpCamera(this.prevCam, this.cam, 1);
    this.drawn = playerView(game.prev.player, game.state.player, 1);
    // The camera steps once per sim frame so it is as deterministic as the sim.
    let state = game.state;
    game.afterStep.add((events) => {
      // Another room (memory/world.md): tear the old room's renderers down and build the new one's.
      const rebuilt = game.scene.id !== this.builtFor;
      if (rebuilt) this.rebuild();
      const fade = events.find((e) => e.type === 'fade');
      if (fade?.type === 'fade') {
        const p = game.state.player;
        this.reformShot.fade(fade.frames, Math.hypot(p.safeX - fade.x, p.safeY - fade.y));
      }
      const v = ga.view();
      if (events.some((e) => e.type === 'spawn')) {
        const from = this.followView;
        this.cam = createCamera(game.state, game.scene, this.ct, v.w, v.h);
        this.prevCam = { ...this.cam };
        // A re-form glides there under a dip; a restart (a new state) dips (or fades up from black, if
        // the room says so); a teleport just cuts; into another room the room fade lifts (no glide
        // from a view of the old room).
        if (rebuilt) this.reformShot.clear();
        else if (events.some((e) => e.type === 'reform')) this.reformShot.reform(from, this.followView);
        // A fall catch's or a thorn's return: the view glides to where she is put, the world lit.
        else if (events.some((e) => e.type === 'fallReturn'))
          this.reformShot.reform(from, this.followView, undefined, false);
        else if (game.state !== state) {
          this.reformShot.restart();
          this.roomFade.fadeIn();
        } else this.reformShot.clear();
        state = game.state;
      } else {
        resizeCamera(this.cam, game.scene, v.w, v.h, this.ct);
        this.prevCam = { ...this.cam };
        stepCamera(this.cam, game.state, game.scene, this.ct);
      }
      this.beats.onStep(events, game.state.frame);
      this.pending.push(...events);
    });
  }

  /** Builds every renderer of the room being played (`game.scene`). */
  private build(): void {
    const ga = this.ga;
    const game = this.game;
    const scene = game.scene;
    this.ct = cameraFor(scene);
    this.beats = new CameraBeats(scene.camera);
    this.stageCam = new StageCamera(scene, game.state.save.flags);
    this.roomFade.setRoomFadeIn(scene.camera?.fadeIn ?? 0);
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
    // Greybox (memory/greybox.md): no post-processing, and the creatures are their boxes (drawn by
    // the greybox module), not their painted bodies.
    POST.enabled = isGreybox(scene) ? false : this.postWanted;
    if (isGreybox(scene)) {
      L.enemies.visible = false;
      L.enemiesFront.visible = false;
    }
    this.overlay.setScene(scene);
    ga.root.addChildAt(this.scene.layers.root, 0);
    const v = ga.view();
    this.cam = createCamera(game.state, scene, this.ct, v.w, v.h);
    this.prevCam = { ...this.cam };
    this.builtFor = scene.id;
    this.builds++;
  }

  /** Frees every renderer of the room (render/lifecycle.ts). */
  private teardown(): void {
    this.post.destroy();
    // The tree first (it holds every renderer's display objects, so their geometries are found), then
    // what each renderer keeps outside it (listeners, timers).
    this.scene.destroy();
    this.character.destroy();
    this.giving.destroy();
    this.lights.clear();
    // Filters borrow scratch textures from Pixi's pool (the post stage's are view-sized, a painted
    // room's bakes are up to 4096 px square): the next room fills it again.
    TexturePool.clear(true);
  }

  /** Tears the room's renderers down and builds them for the room now being played. */
  rebuild(): void {
    this.teardown();
    this.build();
    for (const fn of this.onRoom) fn(this.builtFor);
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
    this.shake.update(dt, events);
    this.hurtVignette.update(dt, events, vs);
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
    const sc = this.stageCam;
    sc.update(dt, events, this.cam.zone, follow, this.game.state.save.flags);
    // The kick and the shake: render-side offsets, the follow camera never sees them.
    const kx = this.kick.x + this.shake.x;
    const ky = this.kick.y + this.shake.y;
    const view: CameraView = o
      ? { x: base.x + kx, y: base.y + ky, zoom: base.zoom, w: vs.w, h: vs.h }
      : {
          x: base.x + kx + gc.x + rs.x + this.beats.x + sc.x,
          y: base.y + ky + gc.y + rs.y + this.beats.y + sc.y,
          zoom: base.zoom * gc.zoom * sc.zoom,
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
      lures: this.game.state.lures,
      save: this.game.state.save,
      rest: this.game.state.rest,
      kit: this.game.state.kit,
      boss: this.game.state.boss,
    };
    this.scene.layers.applyCamera(view);
    this.scene.update(dt, this.clock, view, sim);
    this.character.update(dt, this.clock, player, events, this.game.state.hatch, this.game.state.save.flags);
    this.enemies.update(dt, this.clock, view, sim);
    this.pickups.update(dt, this.clock, view, sim);
    this.goal.update(dt, this.clock, view, sim);
    this.giving.update(dt, this.clock, view, sim);
    this.swarm.update(dt, this.clock, view, sim);
    this.post.update(dt, this.clock, view);
    this.hud.update(dt, this.clock, sim, vs, view);
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
