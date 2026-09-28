/**
 * The layered render pipeline (PLAN §4.3). Read-only with respect to the sim.
 *
 *   stage
 *   ├─ lightmap sprite (not rendered; maps filter coords to the light map)
 *   ├─ scene            [PostFilter: haze, grade, vignette, grain, aberration]
 *   │  ├─ bg            far0 / far1 / far2 / mid baked parallax layers (fogged, blurred by depth);
 *   │  │                unlit on purpose: lit, the mid layer went as dark as the playfield and
 *   │  │                its pillars read as walls. Lamps still glow over it through the haze.
 *   │  ├─ lit           [LightingFilter: x light map]
 *   │  │  └─ playfield  the camera-moved world: terrain, door labels, dust (WorldRenderer.world)
 *   │  ├─ actors        world space, unlit: L3 sources/levied/enemies, the player, juice. Anything
 *   │  │                the player must read (hums, ghosts, telegraphs) never depends on a lamp.
 *   │  ├─ emissive      additive, unlit glowing shapes, world space
 *   │  ├─ bloom         the emissive layer blurred at 1/4 and 1/8 res (BloomPass), additive
 *   │  ├─ ambient       soot (normal) + motes/embers (additive) particles
 *   │  └─ fg            dark foreground occluders (parallax 1.35)
 *   ├─ overlay          debug overlays, world space (unlit, un-graded)
 *   └─ ui               HUD, fades, perf HUD
 *
 * Hooks for other render code (e.g. sound-source visuals):
 *   - `layers.emissive`: add Graphics/Sprites in world px; they glow (bloom) and ignore lighting.
 *   - `layers.playfield` (= WorldRenderer.world): lit terrain and props.
 *   - `layers.actors`: unlit, still graded by post; gameplay-critical shapes.
 *   - `lights.providers.add(fn)`: push per-frame lights (world px, colour, radius, intensity).
 *   - `NOISE_COLOURS` in palette.ts for brown/pink/violet/white hums.
 */
import { AlphaFilter, type Application, Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { tuning } from '../../sim/tuning';
import { type Room, Tile, tileAt } from '../../sim/world/rooms';
import { VIEW_H, VIEW_W } from '../camera/index';
import { AmbientField } from './ambient';
import { type Backdrop, buildBackdrop } from './backdrop';
import type { RenderClock } from './clock';
import { hashString, mix } from './color';
import { type Dressing, getDressing } from './dressing';
import { LightingFilter, LightSystem } from './lighting';
import { AmbientView } from './particles';
import { PerfHud, PerfMonitor } from './perf';
import { BloomPass, PostFilter } from './post';
import { QUALITY, type QualityName, type QualitySettings } from './quality';
import { drawTerrain } from './terrain';

/** Render-side toggles for A/B comparisons and deterministic screenshots. */
export interface GfxToggles {
  lighting: boolean;
  post: boolean;
  bloom: boolean;
  backdrop: boolean;
  foreground: boolean;
  particles: boolean;
  /** HUD text (room name etc.): off for screenshot goldens (fonts differ across machines). */
  ui: boolean;
}

export interface FrameInput {
  clock: RenderClock;
  /** View top-left including shake, rounded. */
  camX: number;
  camY: number;
  /** Player centre (interpolated), world px, and whether it is dashing / alive. */
  player: { x: number; y: number; dashing: boolean; visible: boolean };
  /** 0..1 hit intensity (camera trauma, death flash): drives chromatic aberration. */
  hit: number;
}

export class GfxPipeline {
  readonly scene = new Container({ label: 'scene' });
  readonly layers = {
    bg: new Container({ label: 'bg' }),
    lit: new Container({ label: 'lit' }),
    mid: new Container({ label: 'mid' }),
    /** The camera-moved playfield; WorldRenderer passes its `world` container in. */
    playfield: null as unknown as Container,
    /** World-space, unlit (post still grades it): readability-critical actors, see the header. */
    actors: new Container({ label: 'actors' }),
    /** Screen-space holder of the bloom filter; add world-space things to `emissive`. */
    emissiveRoot: new Container({ label: 'emissive-root' }),
    emissive: new Container({ label: 'emissive' }),
    ambient: new Container({ label: 'ambient' }),
    fg: new Container({ label: 'fg' }),
    overlay: new Container({ label: 'overlay' }),
    ui: new Container({ label: 'ui' }),
  };
  readonly lights: LightSystem;
  readonly perf = new PerfMonitor();
  readonly perfHud = new PerfHud();
  readonly toggles: GfxToggles = {
    lighting: true,
    post: true,
    bloom: true,
    backdrop: true,
    foreground: true,
    particles: true,
    ui: true,
  };
  dressing: Dressing | null = null;
  /** Terrain emissive shapes (spikes, orbs, goals, lamp bulbs), rebuilt per room. */
  readonly terrainGlow = new Graphics({ label: 'terrain-glow' });
  /** The player's emissive accents (drawn by WorldRenderer). */
  readonly playerGlow = new Graphics({ label: 'player-glow' });
  /** Glowing juice (dash streaks, death burst, rings), drawn by WorldRenderer. */
  readonly fxGlow = new Graphics({ label: 'fx-glow' });
  private qualityName: QualityName = 'high';
  private q: QualitySettings = QUALITY.high;
  private backdrop: Backdrop | null = null;
  private field: AmbientField | null = null;
  private readonly ambientView = new AmbientView();
  private readonly lightingFilter: LightingFilter;
  private readonly postFilter: PostFilter;
  private readonly bloom: BloomPass;
  private readonly scaleFilter = new AlphaFilter({ alpha: 1 });
  private room: Room | null = null;
  private roomFrame = 0;
  private lamps = 0;
  private readonly renderer: Renderer;

  constructor(app: Application, playfield: Container) {
    this.renderer = app.renderer;
    this.layers.playfield = playfield;
    this.lights = new LightSystem(this.renderer);
    this.lightingFilter = new LightingFilter(this.lights);
    this.postFilter = new PostFilter(this.lights);
    this.bloom = new BloomPass(this.renderer, this.layers.emissive);
    const L = this.layers;
    const screen = new Rectangle(0, 0, VIEW_W, VIEW_H);
    this.scene.filterArea = screen;
    L.lit.filterArea = screen;
    L.emissiveRoot.blendMode = 'add';
    L.bg.addChild(L.mid);
    L.lit.addChild(L.playfield);
    L.emissive.addChild(this.terrainGlow, this.fxGlow, this.playerGlow);
    L.emissiveRoot.addChild(L.emissive);
    L.ambient.addChild(this.ambientView.soot, this.ambientView.glow);
    this.scene.addChild(L.bg, L.lit, L.actors, L.emissiveRoot, this.bloom.view, L.ambient, L.fg);
    L.ui.addChild(this.perfHud.container);
    app.stage.addChild(this.lights.screenSprite, this.scene, L.overlay, L.ui);
    const gl = (this.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    if (gl) this.perf.instrument(gl);
    this.applyQuality();
  }

  get quality(): QualityName {
    return this.qualityName;
  }

  setQuality(name: QualityName): void {
    this.qualityName = name;
    this.q = QUALITY[name];
    this.applyQuality();
    if (this.room) this.rebuildBackdrop(this.room);
    if (this.room && this.dressing) this.rebuildParticles(this.dressing);
  }

  private applyQuality(): void {
    const q = this.q;
    const T = this.toggles;
    // Render scale: the scene is filtered at this resolution (nested filters inherit it) and
    // scaled up. Changing renderer.resolution at runtime crashed Pixi's filter stack (text
    // textures are recreated on resolutionChange), so it is done with a filter instead.
    this.postFilter.resolution = q.renderScale;
    this.scaleFilter.resolution = q.renderScale;
    this.lights.setResolution(q.lightRes);
    this.bloom.configure(q.bloomStrength, q.bloomStrength, q.bloomQuality);
    this.bloom.enabled = q.bloom && T.bloom;
    this.layers.lit.filters = T.lighting ? [this.lightingFilter] : null;
    this.scene.filters = q.post && T.post ? [this.postFilter] : q.renderScale < 1 ? [this.scaleFilter] : null;
    this.layers.bg.visible = T.backdrop;
    this.layers.mid.visible = T.backdrop;
    this.layers.fg.visible = T.foreground;
    this.layers.ambient.visible = T.particles;
  }

  setToggles(t: Partial<GfxToggles>): GfxToggles {
    Object.assign(this.toggles, t);
    this.applyQuality();
    return { ...this.toggles };
  }

  /** Builds everything room-specific. `tiles` is the playfield Graphics terrain is drawn into. */
  buildRoom(room: Room, tiles: Graphics): void {
    this.room = room;
    this.roomFrame = 0;
    const d = getDressing(room.id, hashString(room.id));
    this.dressing = d;
    this.terrainGlow.clear();
    const out = drawTerrain(tiles, this.terrainGlow, room, d);
    this.lamps = out.lamps;
    this.lights.roomLights = out.lights;
    this.lights.ambient = { ...d.ambient };
    this.lights.player.color = mix(0xfff0dc, d.palette.lamp, 0.25);
    this.postFilter.setGrade({
      saturation: d.palette.grade.saturation * d.grade.saturation,
      contrast: d.palette.grade.contrast * d.grade.contrast,
      exposure: d.grade.exposure,
      gain: d.palette.grade.gain,
      lift: d.palette.grade.lift,
      vignette: d.grade.vignette,
      vignetteColor: d.palette.terrainDeep,
      grain: d.grade.grain,
      haze: d.grade.haze,
    });
    this.rebuildBackdrop(room);
    this.rebuildParticles(d);
  }

  private rebuildBackdrop(room: Room): void {
    const d = this.dressing;
    if (!d) return;
    this.backdrop?.destroy();
    const b = buildBackdrop(this.renderer, room, tuning.world.tileSize, d, this.q);
    this.backdrop = b;
    b.far.forEach((l, i) => {
      this.layers.bg.addChildAt(l.sprite, i);
    });
    this.layers.mid.addChild(b.mid.sprite);
    this.layers.fg.addChild(b.fg);
  }

  private rebuildParticles(d: Dressing): void {
    this.field = new AmbientField(d.particles, d.seed, this.q.particles);
    this.ambientView.setField(this.field, d.palette);
  }

  /** One sim step happened (deterministic per-frame state). */
  step(): void {
    this.roomFrame++;
    this.field?.step();
  }

  get framesInRoom(): number {
    return this.roomFrame;
  }

  /** Positions layers, renders the light map and sets per-frame uniforms. Call before app.render(). */
  draw(f: FrameInput): void {
    const { camX, camY, clock } = f;
    this.backdrop?.place(camX, camY);
    this.layers.playfield.position.set(-camX, -camY);
    this.layers.actors.position.set(-camX, -camY);
    this.layers.emissive.position.set(-camX, -camY);
    this.layers.overlay.position.set(-camX, -camY);

    const pl = this.lights.player;
    this.lights.playerLightOn = f.player.visible;
    pl.x = f.player.x;
    pl.y = f.player.y;
    pl.intensity = f.player.dashing ? 1 : 0.7;
    this.lights.render(clock, camX, camY);
    this.bloom.render(camX, camY);

    if (this.toggles.particles)
      this.ambientView.draw(
        camX,
        camY,
        clock.t,
        (sx, sy) => this.lights.sample(sx + camX, sy + camY, clock.t),
        (sx, sy) => this.solidAt(sx + camX, sy + camY),
      );

    const d = this.dressing;
    if (d) {
      const ab = this.q.aberration ? Math.min(1, Math.max(0, f.hit)) * 16 : 0;
      this.postFilter.setFrame(clock.frame, ab, d.ambient.level, this.q.grain, d.grade.grain);
    }
  }

  private solidAt(x: number, y: number): boolean {
    const r = this.room;
    if (!r) return false;
    const ts = tuning.world.tileSize;
    return tileAt(r, Math.floor(x / ts), Math.floor(y / ts)) === Tile.solid;
  }

  stats(): Record<string, unknown> {
    return {
      quality: this.qualityName,
      district: this.dressing?.district,
      dressing: this.dressing?.sources,
      lights: this.lights.roomLights.length,
      lightsDrawn: this.lights.frameLights.length,
      lightProviders: this.lights.providers.size,
      lamps: this.lamps,
      particles: this.ambientView.count,
      drawCalls: this.perf.drawCalls,
      toggles: { ...this.toggles },
      perf: this.perf.snapshot(),
    };
  }

  hudExtra(): Record<string, string | number> {
    return {
      quality: this.qualityName,
      lights: `${this.lights.frameLights.length}/${this.lights.roomLights.length + 1 + this.lights.providers.size}`,
      particle: this.ambientView.count,
      district: this.dressing?.district ?? '-',
    };
  }
}
