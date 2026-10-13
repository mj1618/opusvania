import { Container } from 'pixi.js';
import type { Scene } from '../../sim/scene';
import { viewTop } from '../camera/index';
import { type CameraView, VIEW_H, VIEW_W } from '../contract';

/**
 * The layer tree, back to front (docs/art-direction.md "Layers, back to front"):
 *
 *   sky         screen space  the sky glow; never moves (0..VIEW_W x 0..VIEW_H logical units)
 *   far[0..2]   0.12 0.25 0.42 far forest silhouettes, far[0] is the farthest
 *   mid         0.68          big trunks, roots, vines, fog sheets
 *   playfield   1             terrain, moss, plants, the pool (what the collision rects become)
 *   enemies     1             the creatures' bodies (owned by src/render/enemies), just behind the character
 *   character   1             the character (owned by src/render/character)
 *   pickups     1             glints and their buds, over the character (owned by src/render/pickups)
 *   playfieldFront 1          what covers the character at its own depth: grass fringe, pool surface
 *   enemiesFront 1            their lower legs, dust and debris, over the grass fringe
 *   foreground  1.35          dark out-of-focus leaves and branches in front of everything
 *   air         1             god rays, motes, fireflies, ground mist
 *
 * World layers are authored in world px. A layer lines up with the playfield exactly when the
 * camera centre is at the anchor, and elsewhere scrolls at `parallax` times the camera's speed
 * (< 1 lags behind = far away, > 1 runs ahead = near). The anchor is the scene's horizontal
 * centre at the camera's lowest resting height, so "on the ground, mid-scene"
 * is where all layers agree. Use `visible(name, cam)` to know what part of a layer is on screen
 * and `coverage(name)` for the most the follow camera can ever show of it.
 *
 * Zoom scales every world layer about the view centre (close-ups keep their parallax offsets).
 */
export const LAYERS = [
  { name: 'sky', parallax: 0, screen: true },
  { name: 'far0', parallax: 0.12, screen: false },
  { name: 'far1', parallax: 0.25, screen: false },
  { name: 'far2', parallax: 0.42, screen: false },
  { name: 'mid', parallax: 0.68, screen: false },
  // Light shafts that pass behind the terrain and the character (owned by layers/air.ts).
  { name: 'airBack', parallax: 1, screen: false },
  // Warm light that passes behind the terrain: the heart waking, the ending (src/render/goal).
  { name: 'goalLight', parallax: 1, screen: false },
  { name: 'playfield', parallax: 1, screen: false },
  // The buds that hold great glints: behind the character (src/render/pickups).
  { name: 'pickupsBack', parallax: 1, screen: false },
  // The moth-lanterns and the heart of the grove (src/render/goal): behind the character.
  { name: 'goal', parallax: 1, screen: false },
  // Enemies' bodies (src/render/enemies): just behind the character.
  { name: 'enemies', parallax: 1, screen: false },
  { name: 'character', parallax: 1, screen: false },
  // Collectibles: over the character (a glint flies into her), under the grass fringe.
  { name: 'pickups', parallax: 1, screen: false },
  // What must cover the character at its own depth: grass fringe, the pool's surface (layers/playfield.ts).
  { name: 'playfieldFront', parallax: 1, screen: false },
  // Enemies' lower legs, dust and debris: in front of the grass fringe, so the scuttling feet read.
  { name: 'enemiesFront', parallax: 1, screen: false },
  { name: 'foreground', parallax: 1.35, screen: false },
  { name: 'air', parallax: 1, screen: false },
] as const;

export type LayerName = (typeof LAYERS)[number]['name'];

export interface LayerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class LayerTree {
  /** Parent of every layer. The post stage wraps this container. */
  readonly root = new Container({ label: 'layers' });
  readonly sky: Container;
  /** Far forest layers, farthest first. */
  readonly far: readonly Container[];
  readonly mid: Container;
  readonly playfield: Container;
  /** Enemies (owned by src/render/enemies): bodies under the character, `enemiesFront` over `playfieldFront`. */
  readonly enemies: Container;
  readonly enemiesFront: Container;
  readonly character: Container;
  /** Glints (owned by src/render/pickups); `pickupsBack` is under the character. */
  readonly pickups: Container;
  readonly pickupsBack: Container;
  /** In front of the character at parallax 1 (owned by layers/playfield.ts). */
  readonly playfieldFront: Container;
  readonly foreground: Container;
  readonly air: Container;
  /** Where every layer agrees with the playfield (world px). */
  readonly anchor: { x: number; y: number };
  private readonly byName = new Map<LayerName, Container>();

  constructor(private readonly scene: Scene) {
    for (const def of LAYERS) {
      const c = new Container({ label: def.name });
      this.byName.set(def.name, c);
      this.root.addChild(c);
    }
    this.sky = this.get('sky');
    this.far = [this.get('far0'), this.get('far1'), this.get('far2')];
    this.mid = this.get('mid');
    this.playfield = this.get('playfield');
    this.enemies = this.get('enemies');
    this.enemiesFront = this.get('enemiesFront');
    this.character = this.get('character');
    this.pickups = this.get('pickups');
    this.pickupsBack = this.get('pickupsBack');
    this.playfieldFront = this.get('playfieldFront');
    this.foreground = this.get('foreground');
    this.air = this.get('air');
    this.anchor = { x: scene.width / 2, y: Math.max(VIEW_H / 2, scene.height - VIEW_H / 2) };
  }

  get(name: LayerName): Container {
    const c = this.byName.get(name);
    if (!c) throw new Error(`No layer "${name}"`);
    return c;
  }

  parallax(name: LayerName): number {
    return LAYERS.find((l) => l.name === name)?.parallax ?? 1;
  }

  /** Positions every world layer for this camera. Called once per render frame by the stage. */
  applyCamera(cam: CameraView): void {
    for (const def of LAYERS) {
      if (def.screen) continue;
      placeLayer(this.get(def.name), cam, def.parallax, this.anchor);
    }
  }

  /** The part of a world layer on screen right now, in that layer's own coordinates. */
  visible(name: LayerName, cam: CameraView): LayerRect {
    const f = this.parallax(name);
    const w = VIEW_W / cam.zoom;
    const h = VIEW_H / cam.zoom;
    const cx = this.anchor.x + (cam.x - this.anchor.x) * f;
    const cy = this.anchor.y + (cam.y - this.anchor.y) * f;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  /**
   * The most of a world layer the follow camera (zoom 1, clamped to the scene, plus its headroom
   * above the scene top: camera/index.ts `viewTop`) can ever show.
   */
  coverage(name: LayerName): LayerRect {
    const s = this.scene;
    const lo = this.visible(name, { x: VIEW_W / 2, y: viewTop(s) + VIEW_H / 2, zoom: 1 });
    const hi = this.visible(name, { x: s.width - VIEW_W / 2, y: s.height - VIEW_H / 2, zoom: 1 });
    const x0 = Math.min(lo.x, hi.x);
    const y0 = Math.min(lo.y, hi.y);
    return {
      x: x0,
      y: y0,
      w: Math.max(lo.x, hi.x) + VIEW_W - x0,
      h: Math.max(lo.y, hi.y) + VIEW_H - y0,
    };
  }
}

/** Sets a world-space container's transform for a camera and parallax factor (1 = playfield). */
export function placeLayer(
  c: Container,
  cam: CameraView,
  parallax: number,
  anchor: { x: number; y: number },
): void {
  const cx = anchor.x + (cam.x - anchor.x) * parallax;
  const cy = anchor.y + (cam.y - anchor.y) * parallax;
  c.scale.set(cam.zoom);
  c.position.set(VIEW_W / 2 - cx * cam.zoom, VIEW_H / 2 - cy * cam.zoom);
}
