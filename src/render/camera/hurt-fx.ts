/**
 * Being hurt, on screen (memory/feel.md): a dark vignette pulse over the whole view on `hurt` (clear in
 * the middle, dark at the edges, a breath of red in it), on render time. Her last light pulses darker
 * and holds before it lets go. The flash on her body is her skin's (`Painter.whiteK`), the shake is
 * `shake.ts`. Drawn in code on a small canvas stretched over the view; the stage puts it over the
 * picture and under the dip, the HUD and the overlay.
 */
import { Sprite, Texture } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { SAFE_VIEW, type ViewSize } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';

/** Edge colour (rgb 0..255) and how far in from the edge the dark reaches (0 centre .. 1 corner). */
const LOOK = { color: [14, 4, 9], clear: 0.32, edge: 1 };

export class HurtVignette {
  readonly layer: Sprite;
  /** Seconds since the last hurt (large = none). */
  private t = 1e6;
  private last = false;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 144;
    const g = c.getContext('2d');
    if (g) {
      const [r, gr, b] = LOOK.color;
      // An ellipse: the gradient is drawn in a circle and the canvas is stretched to the view.
      const grad = g.createRadialGradient(128, 72, 0, 128, 72, 147);
      grad.addColorStop(0, `rgba(${r},${gr},${b},0)`);
      grad.addColorStop(LOOK.clear, `rgba(${r},${gr},${b},0)`);
      grad.addColorStop(0.75, `rgba(${r},${gr},${b},0.55)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},${LOOK.edge})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.layer = new Sprite(Texture.from(c));
    this.layer.label = 'hurt-vignette';
    this.layer.eventMode = 'none';
    this.layer.visible = false;
    this.cover(SAFE_VIEW);
  }

  /** How strong the pulse is now, 0..1 (exported for tests through `level`). */
  get level(): number {
    return this.layer.visible ? this.layer.alpha : 0;
  }

  update(
    dt: number,
    events: readonly SimEvent[],
    v: ViewSize = SAFE_VIEW,
    ct: CameraTuning = cameraTuning,
  ): void {
    for (const e of events) {
      if (e.type === 'hurt') {
        this.t = 0;
        this.last = e.hp <= 0;
      } else if (e.type === 'spawn' && !events.some((o) => o.type === 'hurt')) this.t = 1e6;
    }
    this.t += Math.max(0, dt);
    const V = ct.hurtVignette;
    const hold = this.last ? V.holdLast : 0;
    const peak = this.last ? V.peakLast : V.peak;
    const t = this.t;
    let k = 0;
    if (t < V.in) k = t / V.in;
    else if (t < V.in + hold) k = 1;
    else if (t < V.in + hold + V.out) {
      const u = (t - V.in - hold) / V.out;
      k = (1 - u) * (1 - u);
    }
    const a = peak * k;
    this.layer.visible = a > 0.002;
    this.layer.alpha = a;
    if (this.layer.visible) this.cover(v);
  }

  /** Covers the visible view (with 2 px to spare at every edge). */
  private cover(v: ViewSize): void {
    this.layer.position.set(v.left - 2, v.top - 2);
    this.layer.setSize(v.w + 4, v.h + 4);
  }
}
