/**
 * What the prologue leaves in the Grove after the hand-over (render only; nothing in the sim): the
 * fox's case on its stalk by the pool, breathing, its warmth gone grey; the pale thread of root in the
 * moss beside it, steaming; the two empty husks on their threads where the siblings hatched.
 * The stage keeps it and updates it every frame once the prologue is over.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { LayerTree } from '../scene/layer-tree';
import { glowTexture } from '../world/paint';
import { CaseView } from './case';
import { HATCH, MOSS } from './script';

const PALE = 0xd9cfc4;

export class Remains {
  private readonly view = new Container({ label: 'prologue-remains' });
  private readonly caseV = new CaseView();
  private readonly g = new Graphics();
  private readonly steam: Sprite[] = [];

  constructor(layers: LayerTree) {
    layers.get('goal').addChildAt(this.view, 0);
    this.view.addChild(this.g, this.caseV.view);
    for (let i = 0; i < 5; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.tint = PALE;
      s.blendMode = 'add';
      this.steam.push(s);
      this.view.addChild(s);
    }
  }

  update(clock: number): void {
    this.caseV.draw(1, 1, clock);
    const g = this.g;
    g.clear();
    // The thread of root in the moss at the pool's lip.
    g.moveTo(1470, MOSS - 1);
    for (let i = 1; i <= 12; i++)
      g.lineTo(1470 + (i / 12) * 74, MOSS - 1 - 1.5 * Math.sin((i / 12) * 9 + clock * 0.3));
    g.stroke({ color: PALE, width: 1.6, alpha: 0.75 });
    for (const [i, s] of this.steam.entries()) {
      const u = (clock * 0.22 + i / this.steam.length) % 1;
      s.position.set(1478 + i * 12 + Math.sin(clock * 0.7 + i) * 6, MOSS - 6 - u * 50);
      s.alpha = 0.08 * Math.sin(u * Math.PI);
      s.setSize(30 + 40 * u, 30 + 40 * u);
    }
    // The two husks, empty, on their threads.
    for (const [i, c] of [HATCH.sorrel, HATCH.wing].entries()) {
      const sway = Math.sin(clock * 0.9 + i) * 2;
      const x = c.x + sway;
      const top = c.y - 40;
      g.moveTo(c.x, top - 700)
        .quadraticCurveTo(c.x + sway * 0.3, top - 300, x, top)
        .stroke({ color: 0xc8c0b0, width: 0.9, alpha: 0.45 });
      const pts: number[] = [];
      for (let k = 0; k <= 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        const sy = Math.cos(a);
        const w = 19 * (0.5 + 0.45 * (1 - sy) * 0.5 + 0.25 * Math.sin((1 - sy) * 1.6));
        let yy = top + 40 - sy * 40;
        if (sy < -0.2) yy -= 14 * (-sy - 0.2);
        pts.push(x + sx(a) * w * (1 + 0.15 * (sy < 0 ? -sy : 0)), yy);
      }
      g.poly(pts).fill({ color: 0x6a6458, alpha: 0.96 });
      g.ellipse(x, top + 64, 12, 5).fill({ color: 0x15120f, alpha: 0.95 });
    }
  }

  destroy(): void {
    this.caseV.destroy();
    this.view.destroy({ children: true });
  }
}

function sx(a: number): number {
  return Math.sin(a);
}
