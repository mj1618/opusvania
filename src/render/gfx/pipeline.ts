/**
 * The layered render pipeline (PLAN §4.3). Read-only with respect to the sim.
 *
 *   stage
 *   ├─ lightmap sprite (not rendered; maps filter coords to the light map)
 *   ├─ scene            [PostFilter: haze, grade, vignette, grain, aberration]
 *   │  ├─ bg            far0 / far1 / far2 / beacons / mid parallax layers (fogged, blurred by depth;
 *   │  │                world-anchored per region, so seams never pop: backdrop.ts);
 *   │  │                unlit on purpose: lit, the mid layer went as dark as the playfield and
 *   │  │                its pillars read as walls. Lamps still glow over it through the haze.
 *   │  ├─ lit           [LightingFilter: x light map]
 *   │  │  └─ playfield  the camera-moved world: apron, neighbour peek, terrain, door labels, dust
 *   │  │                (WorldRenderer.world). World-space layers are scaled by the camera zoom.
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
import { type Room, tileAt } from '../../sim/world/rooms';
import { cameraZones, shotZoom, VIEW_H, VIEW_W, zoneZoom } from '../camera/index';
import { cameraTuning } from '../camera/tuning';
import { AmbientField } from './ambient';
import { type Backdrop, type BackdropFrame, buildBackdrop } from './backdrop';
import { BeaconLayer } from './beacons';
import type { RenderClock } from './clock';
import { mix } from './color';
import type { Dressing } from './dressing';
import { LightingFilter, LightSystem } from './lighting';
import { AmbientView } from './particles';
import { PeekLayer, RoomViews } from './peek';
import { PerfHud, PerfMonitor } from './perf';
import { BloomPass, PostFilter } from './post';
import { QUALITY, type QualityName, type QualitySettings } from './quality';
import { isRockTile } from './terrain';
import { backdropBox, isWorldRoom, type Neighbour, neighbours, roomOrigin, voidRects } from './worldspace';

/** Render tuning for the world-space layers (memory/camera.md). */
export const worldRenderTuning = {
  /** Rooms this close to the current one (px) are drawn as neighbour peek. */
  peekMarginX: 2 * VIEW_W,
  peekMarginY: 2 * VIEW_H,
  /** The apron (solid rock where no room is) covers this far around the room. */
  apronMarginX: 2 * VIEW_W,
  apronMarginY: 2 * VIEW_H,
  /** Cached drawn rooms kept beyond the current set. */
  roomCache: 16,
  /** Frames the old backdrop fades out over when a seam changes region or district. */
  backdropFadeFrames: 30,
};

/** Snaps a view to whole screen px at `zoom`: the world layers sit at (-sx, -sy) scaled by zoom,
 * and x/y is the matching world top-left. Integer screen offsets keep a zoomed view shimmer-free. */
export function snapView(camX: number, camY: number, zoom: number) {
  const sx = Math.round(camX * zoom);
  const sy = Math.round(camY * zoom);
  return { sx, sy, x: sx / zoom, y: sy / zoom };
}

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
  /** Camera zoom (world layers are scaled by it; default 1). */
  camZoom?: number;
  /** Player centre (interpolated), world px, and whether it is dashing / alive. */
  player: { x: number; y: number; dashing: boolean; visible: boolean };
  /** 0..1 hit intensity (camera trauma, death flash): drives chromatic aberration. */
  hit: number;
  /** Combat juice (optional): impact frame 0..1 and its tint, slow-mo drama 0..1, render zoom
   * (screen = unzoomed screen px * z + (ox, oy); z = 1 is none). */
  impact?: number;
  impactColor?: number;
  drama?: number;
  zoom?: { z: number; ox: number; oy: number };
}

export class GfxPipeline {
  /**
   * Holds the light-map sprite, the scene and the world overlay, so a render zoom (combat punch)
   * scales them together and the lighting/post filters stay registered. The UI is not zoomed.
   */
  readonly zoomRoot = new Container({ label: 'zoom-root' });
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
  private frame: BackdropFrame | null = null;
  /** The previous backdrop, fading out after a seam changed region / district. */
  private oldBackdrop: { b: Backdrop; frame: BackdropFrame; age: number } | null = null;
  private particleKey = '';
  private readonly views = new RoomViews();
  readonly peek = new PeekLayer();
  readonly beacons = new BeaconLayer();
  private near: Neighbour[] = [];
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
    L.bg.addChild(this.beacons.container, L.mid);
    L.lit.addChild(L.playfield);
    L.playfield.addChildAt(this.peek.terrain, 0);
    L.playfield.addChildAt(this.peek.apron, 0);
    L.emissive.addChild(this.peek.glow, this.terrainGlow, this.fxGlow, this.playerGlow);
    L.emissiveRoot.addChild(L.emissive);
    L.ambient.addChild(this.ambientView.soot, this.ambientView.glow);
    this.scene.addChild(L.bg, L.lit, L.actors, L.emissiveRoot, this.bloom.view, L.ambient, L.fg);
    L.ui.addChild(this.perfHud.container);
    this.zoomRoot.addChild(this.lights.screenSprite, this.scene, L.overlay);
    app.stage.addChild(this.zoomRoot, L.ui);
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
    this.beacons.container.visible = T.backdrop;
    this.layers.mid.visible = T.backdrop;
    this.layers.fg.visible = T.foreground;
    this.layers.ambient.visible = T.particles;
  }

  setToggles(t: Partial<GfxToggles>): GfxToggles {
    Object.assign(this.toggles, t);
    this.applyQuality();
    return { ...this.toggles };
  }

  /**
   * Builds everything room-specific. `tiles` is the playfield Graphics the room's terrain shows in
   * (its context is swapped for the cached drawing). `seam`: the room was entered through an edge
   * exit (the backdrop crossfades if the region or district changed; particles carry on).
   */
  buildRoom(room: Room, tiles: Graphics, seam = false): void {
    const prevFrame = this.frame;
    const prevDistrict = this.dressing?.district;
    this.room = room;
    this.roomFrame = 0;
    const view = this.views.get(room);
    const d = view.dressing;
    this.dressing = d;
    tiles.context = view.tiles;
    this.terrainGlow.context = view.glow;
    this.lamps = view.lamps;
    // Neighbour peek: the rooms around, at their world positions; their lamps light the seam.
    const T = worldRenderTuning;
    this.near = neighbours(room, { x: T.peekMarginX, y: T.peekMarginY });
    const nearLights = this.peek.build(this.views, this.near);
    this.lights.roomLights = [...view.lights, ...nearLights];
    this.views.prune(new Set([room.id, ...this.near.map((n) => n.room.id)]), T.roomCache);
    this.drawApron(room, d);
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
    this.frame = backdropFrame(room);
    // Same region and district: the new backdrop is the same picture, so it swaps silently.
    const pb = prevFrame?.box;
    const nb = this.frame.box;
    const sameSky =
      pb !== undefined &&
      prevDistrict === d.district &&
      pb.x === nb.x &&
      pb.y === nb.y &&
      pb.w === nb.w &&
      pb.h === nb.h;
    this.rebuildBackdrop(room, seam && !sameSky ? prevFrame : null);
    this.beacons.build(d.palette);
    const key = JSON.stringify([d.particles, d.seed, d.palette.mote]);
    if (!seam || key !== this.particleKey) this.rebuildParticles(d);
    this.particleKey = key;
  }

  /** Solid rock around a world room wherever no room is, so views past a seam never show sky. */
  private drawApron(room: Room, d: Dressing): void {
    const g = this.peek.apron.clear();
    if (!isWorldRoom(room.id)) return;
    const T = worldRenderTuning;
    const ts = tuning.world.tileSize;
    const area = {
      x: -T.apronMarginX,
      y: -T.apronMarginY,
      w: room.width * ts + 2 * T.apronMarginX,
      h: room.height * ts + 2 * T.apronMarginY,
    };
    const rects = voidRects(room, area);
    for (const r of rects) g.rect(r.x, r.y, r.w, r.h);
    if (rects.length) g.fill(d.palette.terrainDeep);
  }

  /** Rebuilds the backdrop; `fadeFrom` keeps the old one fading out on top (a seam's region change). */
  private rebuildBackdrop(room: Room, fadeFrom: BackdropFrame | null = null): void {
    const d = this.dressing;
    const frame = this.frame;
    if (!d || !frame) return;
    if (this.oldBackdrop) {
      this.oldBackdrop.b.destroy();
      this.oldBackdrop = null;
    }
    if (fadeFrom && this.backdrop) this.oldBackdrop = { b: this.backdrop, frame: fadeFrom, age: 0 };
    else this.backdrop?.destroy();
    const b = buildBackdrop(this.renderer, room, tuning.world.tileSize, d, this.q, frame);
    this.backdrop = b;
    // Under the old one (which fades out on top), in depth order.
    b.far.forEach((l, i) => {
      this.layers.bg.addChildAt(l.sprite, i);
    });
    this.layers.mid.addChildAt(b.mid.sprite, 0);
    this.layers.fg.addChildAt(b.fg, 0);
  }

  private rebuildParticles(d: Dressing): void {
    this.field = new AmbientField(d.particles, d.seed, this.q.particles);
    this.ambientView.setField(this.field, d.palette);
  }

  /** One sim step happened (deterministic per-frame state). */
  step(): void {
    this.roomFrame++;
    this.field?.step();
    const old = this.oldBackdrop;
    if (old && ++old.age >= worldRenderTuning.backdropFadeFrames) {
      old.b.destroy();
      this.oldBackdrop = null;
    }
  }

  get framesInRoom(): number {
    return this.roomFrame;
  }

  /** Positions layers, renders the light map and sets per-frame uniforms. Call before app.render(). */
  draw(f: FrameInput): void {
    const { clock } = f;
    const zoom = f.camZoom ?? 1;
    const v = snapView(f.camX, f.camY, zoom);
    const camX = v.x;
    const camY = v.y;
    this.backdrop?.place(camX, camY, zoom);
    const old = this.oldBackdrop;
    if (old && this.frame) {
      // The old room's frame is in its own px: move the view into it by the rooms' origin offset.
      const dx = this.frame.origin.x - old.frame.origin.x;
      const dy = this.frame.origin.y - old.frame.origin.y;
      old.b.place(camX + dx, camY + dy, zoom);
      old.b.setAlpha(Math.max(0, 1 - (old.age + clock.alpha) / worldRenderTuning.backdropFadeFrames));
    }
    const o = this.frame?.origin ?? { x: 0, y: 0 };
    this.beacons.place(camX + VIEW_W / (2 * zoom) + o.x, camY + VIEW_H / (2 * zoom) + o.y, zoom);
    for (const layer of [
      this.layers.playfield,
      this.layers.actors,
      this.layers.emissive,
      this.layers.overlay,
    ]) {
      layer.position.set(-v.sx, -v.sy);
      layer.scale.set(zoom);
    }

    const pl = this.lights.player;
    this.lights.playerLightOn = f.player.visible;
    pl.x = f.player.x;
    pl.y = f.player.y;
    pl.intensity = f.player.dashing ? 1 : 0.7;
    this.lights.render(clock, camX, camY, zoom);
    this.bloom.render(v.sx, v.sy, zoom);

    // Particles are a screen-space parallax field keyed to the world camera, so they carry on
    // across seams; the lookups map screen px back to room px.
    if (this.toggles.particles)
      this.ambientView.draw(
        camX + o.x,
        camY + o.y,
        clock.t,
        (sx, sy) => this.lights.sample(sx / zoom + camX, sy / zoom + camY, clock.t),
        (sx, sy) => this.solidAt(sx / zoom + camX, sy / zoom + camY),
      );

    const d = this.dressing;
    if (d) {
      const ab = this.q.aberration ? Math.min(1, Math.max(0, f.hit)) * 16 : 0;
      this.postFilter.setFrame(clock.frame, ab, d.ambient.level, this.q.grain, d.grade.grain);
    }
    this.postFilter.setImpact(f.impact ?? 0, f.impactColor ?? 0xffffff, f.drama ?? 0);
    const z = f.zoom && f.zoom.z > 1.0005 ? f.zoom : null;
    if (z) {
      this.zoomRoot.scale.set(z.z);
      this.zoomRoot.position.set(z.ox, z.oy);
    } else {
      this.zoomRoot.scale.set(1);
      this.zoomRoot.position.set(0, 0);
    }
  }

  /** Is the post filter (impact frames, drama grade) active at this quality? */
  get postOn(): boolean {
    return this.q.post && this.toggles.post;
  }

  private solidAt(x: number, y: number): boolean {
    const r = this.room;
    if (!r) return false;
    const ts = tuning.world.tileSize;
    return isRockTile(tileAt(r, Math.floor(x / ts), Math.floor(y / ts)));
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
      peek: this.near.map((n) => n.room.id),
      beacons: this.beacons.visible(),
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

/** Where a room's backdrop lives: its region box, its origin, and the view-centre range it needs. */
export function backdropFrame(room: Room): BackdropFrame {
  const box = backdropBox(room);
  const origin = roomOrigin(room);
  if (!isWorldRoom(room.id)) return { box, origin };
  const ts = tuning.world.tileSize;
  const ct = cameraTuning;
  let zoomMin = ct.zoomDefault;
  for (const z of cameraZones(room)) {
    zoomMin = Math.min(zoomMin, zoneZoom(z, ct));
    if (z.shot) zoomMin = Math.min(zoomMin, shotZoom(z.shot, ct));
  }
  zoomMin = Math.max(ct.zoomMin, zoomMin);
  const rw = room.width * ts;
  const rh = room.height * ts;
  const side = (s: string) => room.exits.some((x) => x.side === s);
  // The view centre stays half a view inside the room, except past an exit (bleed: up to bleedPadPx).
  const hx = Math.min(VIEW_W / (2 * ct.zoomMax), rw / 2);
  const hy = Math.min(VIEW_H / (2 * ct.zoomMax), rh / 2);
  const pad = ct.bleedPadPx;
  return {
    box,
    origin,
    view: {
      x0: origin.x + (side('w') ? -pad : hx),
      x1: origin.x + rw + (side('e') ? pad : -hx),
      y0: origin.y + (side('n') ? -pad : hy),
      y1: origin.y + rh + (side('s') ? pad : -hy),
      zoomMin,
    },
  };
}
