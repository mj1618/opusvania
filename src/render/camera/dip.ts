/**
 * The dark dip that covers a re-form or a restart: one soft vignette over the whole view (darker
 * toward the edges, never white). Drawn in code on a small canvas, stretched over the view; the
 * stage puts it over the post-processed picture and under the HUD. `set(0)` hides it.
 */
import { Sprite, Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../contract';

const DIP = { color: [3, 5, 9], centre: 0.8, edge: 1 };

export class DipOverlay {
  readonly layer: Sprite;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 144;
    const g = c.getContext('2d');
    if (g) {
      const [r, gr, b] = DIP.color;
      const grad = g.createRadialGradient(128, 72, 20, 128, 72, 150);
      grad.addColorStop(0, `rgba(${r},${gr},${b},${DIP.centre})`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},${DIP.edge})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.layer = new Sprite(Texture.from(c));
    this.layer.label = 'dip';
    this.layer.setSize(VIEW_W + 4, VIEW_H + 4);
    this.layer.position.set(-2, -2);
    this.layer.eventMode = 'none';
    this.layer.visible = false;
  }

  /** `k` 0..1: how far the dip is on. */
  set(k: number): void {
    this.layer.visible = k > 0.002;
    this.layer.alpha = Math.min(1, Math.max(0, k));
  }
}
