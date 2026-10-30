/**
 * The play plane's air (canopy r7, the value rule): Silksong's and Hollow Knight's first areas put the air behind the
 * hero at a mid value (luma ~40-80) and the solid at near-black, with a bright rim between. Ours had the air as dark as
 * the solid (hub 11-23, Grove 26-34), so the playable space did not part from the walls.
 *
 * One screen-space haze, screen-blended over everything behind the playfield (sky, far, mid, the interior's backs):
 * it lifts the darks most (`d + v - d * v`) and leaves the moon and the light shafts nearly where they were, so the
 * backs keep their shapes, go paler and lower in contrast (art direction: farther = paler), and the playfield, the
 * creatures and Wing, all drawn after it, stay dark against it. A soft gradient: a little more at the foot of the view
 * (ground mist) than at its top. Colour per look (the enclosed rooms' hue; the open rooms the cool night).
 */
import { FillGradient, Graphics } from 'pixi.js';
import type { ViewSize } from '../../contract';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { gradeLookOf, type Look } from '../lib/looks';

/** Haze colour (screen-blended: each channel is what it adds to black) at the view's top and foot, per look. */
export const VEIL: Record<Look | 'night' | 'nightDeep', { top: number; low: number }> = {
  night: { top: 0x182a34, low: 0x203a44 },
  // (An open room under a dark crown: the hub's back is the darkest of the open rooms, its air stayed at 40-45.)
  nightDeep: { top: 0x24384a, low: 0x2e4c5a },
  canopy: { top: 0x1a3430, low: 0x22443c },
  heartwood: { top: 0x2c2216, low: 0x382c1e },
  shaft: { top: 0x061416, low: 0x0a1c20 },
  nest: { top: 0x282010, low: 0x342816 },
  den: { top: 0x1e140c, low: 0x2a1c10 },
};

/** Open rooms that take another veil than the night's. */
const VEIL_ROOMS: Record<string, keyof typeof VEIL> = { 'cn-hub': 'nightDeep' };

export class VeilLayer implements EnvModule {
  private g = new Graphics();
  private ctx!: SceneContext;
  private last: ViewSize | null = null;
  private grad: FillGradient | null = null;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    if (ctx.scene.art?.kit !== 'wood') return;
    const { top, low } = VEIL[gradeLookOf(ctx.scene) ?? VEIL_ROOMS[ctx.scene.id] ?? 'night'];
    // (Flat strips overlapping by a pixel drew lines: the overlap is screened twice.)
    this.grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops: [0, 0.25, 0.5, 0.75, 1].map((t) => ({ offset: t, color: mix(top, low, t * t) })),
    });
    this.g.blendMode = 'screen';
    ctx.layers.get('veil').addChild(this.g);
  }

  update(_frame: SceneFrame): void {
    if (!this.g.parent) return;
    const v = this.ctx.view();
    const l = this.last;
    if (l && l.w === v.w && l.h === v.h && l.left === v.left && l.top === v.top) return;
    this.last = v;
    this.g
      .clear()
      .rect(v.left - 2, v.top - 2, v.w + 4, v.h + 4)
      .fill(this.grad as FillGradient);
  }

  destroy(): void {
    this.grad?.destroy();
    this.grad = null;
  }
}

function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
