/**
 * Additive soft glows, pooled: each frame `begin()`, then `add(...)` per glow, then `end()` hides what was not
 * used. One soft texture (bg-bake's), so a glow is one sprite and costs only its fill.
 */
import { Container, Sprite } from 'pixi.js';
import { softTexture } from '../scene/lib/bg-bake';

export class GlowPool {
  readonly container: Container;
  private readonly sprites: Sprite[] = [];
  private used = 0;

  constructor(label: string, blend: 'add' | 'normal' = 'add') {
    this.container = new Container({ label });
    this.blend = blend;
  }
  private readonly blend: 'add' | 'normal';

  begin(): void {
    this.used = 0;
  }

  /** A soft disc (rx x ry) at (x, y). */
  add(x: number, y: number, rx: number, color: number, alpha: number, ry = rx, rot = 0): void {
    if (alpha <= 0.002 || rx <= 0.5) return;
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(softTexture());
      s.anchor.set(0.5);
      s.blendMode = this.blend;
      this.sprites.push(s);
      this.container.addChild(s);
    }
    this.used++;
    s.visible = true;
    s.position.set(x, y);
    s.setSize(rx * 2, ry * 2);
    s.rotation = rot;
    s.tint = color;
    s.alpha = Math.min(1, alpha);
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) (this.sprites[i] as Sprite).visible = false;
  }
}
