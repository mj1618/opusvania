/**
 * Where the ground is, for effects that hug it (mist), land on it (leaves) or hover over it
 * (fireflies). Derived from the scene's collision rects; the pool counts as its water surface.
 */
import { BufferImageSource, Texture } from 'pixi.js';
import type { Scene } from '../../../sim/scene';

const GROUND_TAGS = new Set(['ground', 'root']);
/** Height encoding of the profile texture: y = Y0 + value * RANGE (shared with the shaders). */
export const PROFILE_Y0 = 800;
export const PROFILE_RANGE = 800;
const STEP = 16;

export class GroundProfile {
  /** Top surface y at every STEP px of scene x. */
  private readonly tops: Float32Array;
  readonly width: number;

  constructor(scene: Scene) {
    this.width = scene.width;
    const n = Math.ceil(scene.width / STEP) + 1;
    this.tops = new Float32Array(n).fill(scene.height);
    const waterline = Math.max(
      ...scene.solids.filter((s) => s.tag === 'ground' && s.y > scene.height / 2).map((s) => s.y),
    );
    for (const s of scene.solids) {
      const top = s.tag === 'pool' ? waterline + 18 : GROUND_TAGS.has(s.tag) ? s.y : null;
      if (top === null) continue;
      const i0 = Math.max(0, Math.floor(s.x / STEP));
      const i1 = Math.min(n - 1, Math.ceil((s.x + s.w) / STEP));
      for (let i = i0; i <= i1; i++) this.tops[i] = Math.min(this.tops[i] as number, top);
    }
  }

  /** The highest and lowest ground surface y between two world x. */
  range(x0: number, x1: number): [number, number] {
    const i0 = Math.max(0, Math.floor(x0 / STEP));
    const i1 = Math.min(this.tops.length - 1, Math.ceil(x1 / STEP));
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = i0; i <= i1; i++) {
      const v = this.tops[i] as number;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  /** Ground surface y under world x (the highest ground-like rect there). */
  top(x: number): number {
    const i = Math.min(this.tops.length - 1, Math.max(0, Math.round(x / STEP)));
    return this.tops[i] as number;
  }

  /**
   * The profile as a 1-row texture (R = height, see PROFILE_Y0 / PROFILE_RANGE), blurred over
   * `soften` px so mist flows over steps instead of following them like a ruler.
   */
  texture(soften = 96): Texture {
    const n = this.tops.length;
    const r = Math.max(1, Math.round(soften / STEP));
    const data = new Uint8Array(n * 4).fill(255);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let w = 0;
      for (let k = -r; k <= r; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        const wk = r + 1 - Math.abs(k);
        sum += (this.tops[j] as number) * wk;
        w += wk;
      }
      const v = (sum / w - PROFILE_Y0) / PROFILE_RANGE;
      data[i * 4] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
    return new Texture({
      source: new BufferImageSource({
        resource: data,
        width: n,
        height: 1,
        format: 'rgba8unorm',
        alphaMode: 'no-premultiply-alpha',
        scaleMode: 'linear',
        addressMode: 'clamp-to-edge',
      }),
    });
  }

  /** Scene x -> the profile texture's u: `u = x * map[0] + map[1]`. */
  get uMap(): [number, number] {
    const n = this.tops.length;
    return [1 / (STEP * n), 0.5 / n];
  }
}
