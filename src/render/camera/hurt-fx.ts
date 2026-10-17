/**
 * Being hurt, on screen (memory/feel.md): on `hurt`, a short dark flash over the whole view (two frames),
 * then a red edge round the view (a clear middle, a breath of blood at the rim) that fades over 0.3 s;
 * on her last light the edge is deeper and holds through the sim's longer freeze. Feel review r2: the
 * old dark vignette only darkened edges that were already near black. Nothing white, and nothing on her
 * body (her own hurt look is her skin's: she goes dark). Render time only. The stage puts it over the
 * picture and under the dip, the HUD and the overlay; it covers the real view (any window shape).
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { SAFE_VIEW, type ViewSize } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';

/** The edge's colour (rgb 0..255) and where it starts (0 centre .. 1 corner). */
const EDGE = { color: [120, 14, 22], clear: 0.42 };
/** The flash: near black, a touch of blue so it is the night going out, not a fade to black. */
const FLASH = 0x03050a;

export class HurtVignette {
  readonly layer = new Container({ label: 'hurt-fx' });
  private readonly flash: Sprite;
  private readonly edge: Sprite;
  /** Seconds since the last hurt (large = none). */
  private t = 1e6;
  private last = false;

  constructor() {
    this.flash = new Sprite(Texture.WHITE);
    this.flash.tint = FLASH;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 144;
    const g = c.getContext('2d');
    if (g) {
      const [r, gr, b] = EDGE.color;
      const grad = g.createRadialGradient(128, 72, 0, 128, 72, 147);
      grad.addColorStop(0, `rgba(${r},${gr},${b},0)`);
      grad.addColorStop(EDGE.clear, `rgba(${r},${gr},${b},0)`);
      grad.addColorStop(0.8, `rgba(${r},${gr},${b},0.6)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},1)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.edge = new Sprite(Texture.from(c));
    this.layer.addChild(this.flash, this.edge);
    this.layer.eventMode = 'none';
    this.layer.visible = false;
    this.cover(SAFE_VIEW);
  }

  /** How strong the red edge is now, 0..1 (tests). */
  get level(): number {
    return this.layer.visible ? this.edge.alpha : 0;
  }

  /** The dark flash now, 0..1 (tests). */
  get flashLevel(): number {
    return this.layer.visible ? this.flash.alpha : 0;
  }

  update(
    dt: number,
    events: readonly SimEvent[],
    v: ViewSize = SAFE_VIEW,
    ct: CameraTuning = cameraTuning,
  ): void {
    let fresh = false;
    for (const e of events) {
      if (e.type === 'hurt') {
        this.t = 0;
        this.last = e.hp <= 0;
        fresh = true;
      } else if (e.type === 'spawn' && !events.some((o) => o.type === 'hurt')) this.t = 1e6;
    }
    if (!fresh) this.t += Math.max(0, dt);
    const V = ct.hurtVignette;
    const t = this.t;
    // The flash: full for its frames (counted on render time at 60 Hz), then gone.
    const flash = t < V.flashSecs - 1e-4 ? V.flash : 0;
    const hold = this.last ? V.holdLast : 0;
    const peak = this.last ? V.edgeLast : V.edge;
    let k = 0;
    if (t < V.in) k = t / V.in;
    else if (t < V.in + hold) k = 1;
    else if (t < V.in + hold + V.out) {
      const u = (t - V.in - hold) / V.out;
      k = (1 - u) * (1 - u);
    }
    if (t === 0) k = 1;
    this.flash.alpha = flash;
    this.edge.alpha = peak * k;
    this.layer.visible = flash > 0.002 || this.edge.alpha > 0.002;
    if (this.layer.visible) this.cover(v);
  }

  /** Covers the visible view (with 2 px to spare at every edge). */
  private cover(v: ViewSize): void {
    for (const s of [this.flash, this.edge]) {
      s.position.set(v.left - 2, v.top - 2);
      s.setSize(v.w + 4, v.h + 4);
    }
  }
}
