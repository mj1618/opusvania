/**
 * The case (the game's case, first built here): a cocoon of bone-white skin lying on a short pale
 * stalk, translucent, and inside it the fox asleep as it slept at the hatching, breathing, its warmth
 * greying. Bone and cold: the Hush is never warm in colour. Drawn by the prologue's hollow, and left
 * standing by the pool after the hand-over (remains.ts).
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from '../world/paint';
import { Fox, foxPose } from './fox';
import { HOLLOW, MOSS } from './script';

const PALE = 0xd9cfc4;

function mixRgb(a: number, b: number, k: number): number {
  const ch = (sh: number): number =>
    Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class CaseView {
  readonly view = new Container({ label: 'case' });
  private readonly sleeper = new Fox();
  private readonly sp = foxPose();
  private readonly g = new Graphics();
  private readonly glow: Sprite;
  /** Its top (world px) and centre, after `draw`. */
  readonly top = { x: HOLLOW.x + 30, y: MOSS - 150 };
  readonly mid = { x: HOLLOW.x + 30, y: MOSS - 80 };
  /** Breath 0..1 this frame (for a light). */
  breath = 0;

  constructor() {
    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.setSize(280, 280);
    this.glow.tint = PALE;
    this.glow.blendMode = 'add';
    this.view.addChild(this.sleeper.view, this.g, this.glow);
  }

  /** `rise` 0..1 up out of the ground; `grey` 0..1 the warmth inside gone. */
  draw(rise: number, grey: number, clock: number): void {
    const c = this.g;
    c.clear();
    this.view.visible = rise > 0.01;
    if (rise <= 0.01) return;
    const H = HOLLOW;
    const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / 6.4);
    this.breath = b;
    const rx = H.caseRx * (0.35 + 0.65 * rise);
    const ch = H.caseH * rise * (1 + 0.02 * b);
    const cx = H.x + 30;
    const bottom = MOSS - H.stalk * rise;
    const cy = bottom - ch / 2;
    // Stalk: thick, pale, rooted in the moss.
    c.poly([cx - 16, MOSS + 2, cx - 9, bottom + 6, cx + 9, bottom + 6, cx + 18, MOSS + 2]).fill({
      color: 0xb4aea8,
    });
    c.moveTo(cx - 34, MOSS + 1)
      .quadraticCurveTo(cx - 14, MOSS - 6, cx - 10, bottom + 8)
      .stroke({ color: PALE, width: 2, alpha: 0.6 });
    // The fox asleep inside (under the skin), breathing; warm, greying.
    const sp = this.sp;
    sp.curl = 1;
    sp.eyes = 0;
    sp.ember = 0;
    sp.sink = 0;
    sp.breath = clock * 0.9;
    this.sleeper.view.position.set(cx - 4, cy + ch * 0.4);
    this.sleeper.view.scale.set(0.62 * (0.5 + 0.5 * rise));
    this.sleeper.view.alpha = rise;
    this.sleeper.view.tint = mixRgb(0xb48870, 0x7a8090, grey);
    this.sleeper.draw(sp, clock);
    // A cocoon lying on its stalk: full in the middle, drawn to a point at each end.
    const lens = (sc: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const x = Math.cos(a);
        const y = Math.sin(a) * (0.55 + 0.45 * (1 - Math.abs(Math.cos(a)) ** 3));
        pts.push(cx + x * rx * sc, cy + y * (ch / 2) * sc);
      }
      return pts;
    };
    c.poly(lens(1)).fill({ color: 0xd4dce8, alpha: 0.3 });
    c.poly(lens(0.8)).fill({ color: 0xeaf0f8, alpha: 0.08 + 0.05 * b });
    for (let i = 1; i < 8; i++) {
      const u = i / 8;
      const xx = cx - rx + 2 * rx * u;
      const hh = (ch / 2) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * 0.96;
      c.moveTo(xx - 6, cy - hh)
        .quadraticCurveTo(xx + 8, cy, xx - 4, cy + hh)
        .stroke({ color: 0xe6ecf4, width: 1.1, alpha: 0.35 });
    }
    c.poly(lens(1)).stroke({ color: 0xeef4fc, width: 2.6, alpha: 0.85 });
    c.poly(lens(0.94)).stroke({ color: 0xd8d6d4, width: 1.2, alpha: 0.45 });
    this.glow.position.set(cx, cy);
    this.glow.alpha = (0.05 + 0.05 * b) * rise;
    this.top.x = cx;
    this.top.y = cy - ch / 2;
    this.mid.x = cx;
    this.mid.y = cy;
  }

  destroy(): void {
    this.sleeper.destroy();
    this.view.destroy({ children: true });
  }
}
