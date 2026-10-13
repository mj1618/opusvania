/**
 * The end of the run, said without words: once the ending's hold is over (`goal.ended`) a single
 * quiet row fades in low on the screen: glints gathered, time (m:ss), creatures felled, hits taken,
 * each a small icon and a numeral; then, a breath later, a key cap with an R: restart.
 *
 * Painted into one canvas when the run ends (the numbers are known then), outside the post stage
 * like the rest of the HUD.
 */
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { SimView } from '../contract';
import { VIEW_W } from '../contract';
import { clockText } from '../goal/logic';

export const SUMMARY = {
  /** Centre of the row, logical px. */
  y: 944,
  font: 34,
  /** Icon box, the gap to its numeral, the gap between entries. */
  icon: 30,
  gap: 12,
  between: 74,
  /** Seconds after `endHold`: the row fades in from..to, the key from..to. */
  rowIn: [0.5, 2.1],
  keyIn: [2.6, 3.8],
  keyY: 62,
  family: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
};

const RES = 3;
const PALE = 'rgba(255, 226, 170, 0.95)';
const COOL = 'rgba(158, 186, 200, 0.9)';

type Ctx = CanvasRenderingContext2D;

/** Icons are drawn in a box of `s` px centred on (0, 0). */
const ICONS: Array<(g: Ctx, s: number) => void> = [
  // Glints: the four-point star.
  (g, s) => {
    const h = s * 0.5;
    const w = h * 0.6;
    const q = h * 0.17;
    g.beginPath();
    g.moveTo(0, -h);
    g.quadraticCurveTo(q * 0.6, -q * 0.6, w, 0);
    g.quadraticCurveTo(q * 0.6, q * 0.6, 0, h);
    g.quadraticCurveTo(-q * 0.6, q * 0.6, -w, 0);
    g.quadraticCurveTo(-q * 0.6, -q * 0.6, 0, -h);
    g.closePath();
    const grad = g.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, '#fff4dc');
    grad.addColorStop(1, '#f2a94e');
    g.fillStyle = grad;
    g.fill();
  },
  // Time: an hourglass.
  (g, s) => {
    const h = s * 0.42;
    const w = s * 0.27;
    g.strokeStyle = PALE;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-w - 2, -h);
    g.lineTo(w + 2, -h);
    g.moveTo(-w - 2, h);
    g.lineTo(w + 2, h);
    g.stroke();
    g.beginPath();
    g.moveTo(-w, -h);
    g.bezierCurveTo(-w, -h * 0.3, -1.2, -h * 0.2, -1.2, 0);
    g.bezierCurveTo(-1.2, h * 0.2, -w, h * 0.3, -w, h);
    g.moveTo(w, -h);
    g.bezierCurveTo(w, -h * 0.3, 1.2, -h * 0.2, 1.2, 0);
    g.bezierCurveTo(1.2, h * 0.2, w, h * 0.3, w, h);
    g.stroke();
    g.fillStyle = 'rgba(255, 190, 100, 0.9)';
    g.beginPath();
    g.moveTo(-w * 0.72, h - 1);
    g.quadraticCurveTo(0, h * 0.2, w * 0.72, h - 1);
    g.closePath();
    g.fill();
  },
  // Creatures felled: a moth's wing, torn through.
  (g, s) => {
    const k = s / 30;
    g.save();
    g.scale(k, k);
    g.strokeStyle = COOL;
    g.fillStyle = 'rgba(16, 28, 40, 0.9)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-11, 8);
    g.bezierCurveTo(-9, -6, 2, -14, 12, -11);
    g.bezierCurveTo(12, -3, 7, 3, 3, 5);
    g.bezierCurveTo(5, 9, 0, 13, -5, 10);
    g.closePath();
    g.fill();
    g.stroke();
    // The cut.
    g.strokeStyle = PALE;
    g.lineWidth = 1.7;
    g.beginPath();
    g.moveTo(-9, -9);
    g.quadraticCurveTo(1, -1, 10, 11);
    g.stroke();
    g.restore();
  },
  // Hits taken: a health light gone dark.
  (g, s) => {
    const k = s / 30;
    g.save();
    g.scale(k, k);
    g.strokeStyle = COOL;
    g.fillStyle = 'rgba(12, 22, 34, 0.92)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -12);
    g.bezierCurveTo(1.6, -6, 8, -1, 8, 4);
    g.bezierCurveTo(8, 9, 4.6, 12, 0, 12);
    g.bezierCurveTo(-4.6, 12, -8, 9, -8, 4);
    g.bezierCurveTo(-8, -1, -1.6, -6, 0, -12);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(232, 100, 36, 0.85)';
    g.beginPath();
    g.arc(0, 5.5, 1.9, 0, Math.PI * 2);
    g.fill();
    g.restore();
  },
];

function seatOn(g: Ctx): void {
  g.shadowColor = 'rgba(2, 12, 18, 0.95)';
  g.shadowBlur = 9 * RES;
  g.shadowOffsetY = 1.5 * RES;
}

function paintRow(texts: string[]): Texture {
  const S = SUMMARY;
  const font = `500 ${S.font}px ${S.family}`;
  const probe = document.createElement('canvas').getContext('2d');
  const widths = texts.map((t) => {
    if (!probe) return t.length * S.font * 0.5;
    probe.font = font;
    return probe.measureText(t).width;
  });
  let total = -S.between;
  for (const w of widths) total += S.icon + S.gap + w + S.between;
  const pad = 30;
  const cw = Math.ceil(total) + pad * 2;
  const ch = Math.ceil(S.font * 1.5) + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = cw * RES;
  canvas.height = ch * RES;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(RES, RES);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.font = font;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const cy = ch / 2;
    const base = cy + S.font * 0.34;
    let x = pad;
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] as string;
      const icon = ICONS[i];
      // Twice: first only for the dark seat under it.
      for (const pass of [0, 1]) {
        g.save();
        if (pass === 0) {
          seatOn(g);
          g.globalAlpha = 0.7;
        }
        g.translate(x + S.icon / 2, cy);
        icon?.(g, S.icon);
        g.restore();
      }
      const tx = x + S.icon + S.gap;
      g.save();
      seatOn(g);
      g.fillStyle = 'rgba(2, 12, 18, 0.6)';
      g.fillText(text, tx, base);
      g.fillText(text, tx, base);
      g.restore();
      const grad = g.createLinearGradient(0, base - S.font * 0.7, 0, base);
      grad.addColorStop(0, '#fff4dc');
      grad.addColorStop(0.55, '#ffdc9c');
      grad.addColorStop(1, '#f2ab52');
      g.fillStyle = grad;
      g.fillText(text, tx, base);
      x = tx + (widths[i] as number) + S.between;
    }
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGenerateMipmaps: true });
  source.scaleMode = 'linear';
  return new Texture({ source });
}

/** A key cap with an R on it. */
function paintKey(): Texture {
  const S = SUMMARY;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size * RES;
  canvas.height = size * RES;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(RES, RES);
    g.translate(size / 2, size / 2);
    const r = 13;
    const box = (): void => {
      g.beginPath();
      g.roundRect(-r, -r, r * 2, r * 2, 5);
    };
    g.save();
    seatOn(g);
    g.fillStyle = 'rgba(4, 14, 22, 0.72)';
    box();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(214, 196, 160, 0.82)';
    g.lineWidth = 1.2;
    box();
    g.stroke();
    // The cap's lower lip.
    g.strokeStyle = 'rgba(214, 196, 160, 0.4)';
    g.beginPath();
    g.moveTo(-r + 4, r + 3);
    g.lineTo(r - 4, r + 3);
    g.stroke();
    g.font = `500 17px ${S.family}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255, 232, 190, 0.95)';
    g.fillText('R', 0, 6);
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGenerateMipmaps: true });
  source.scaleMode = 'linear';
  return new Texture({ source });
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class EndSummary {
  readonly root = new Container({ label: 'hud-summary' });
  private row: Sprite | null = null;
  private key: Sprite | null = null;
  private shown = '';
  private t = 0;

  update(dt: number, clock: number, sim: SimView): void {
    const goal = sim.goal;
    if (!goal.ended) {
      this.t = 0;
      this.root.visible = false;
      return;
    }
    const e = goal.ending;
    const texts = [String(e.glints), clockText(e.time), String(e.kills), String(e.hits)];
    const sig = texts.join('|');
    if (sig !== this.shown) {
      this.shown = sig;
      const old = this.row?.texture;
      if (!this.row) {
        this.row = new Sprite();
        this.row.anchor.set(0.5);
        this.row.position.set(VIEW_W / 2, SUMMARY.y);
        this.key = new Sprite(paintKey());
        this.key.anchor.set(0.5);
        this.key.position.set(VIEW_W / 2, SUMMARY.y + SUMMARY.keyY);
        this.root.addChild(this.row, this.key);
      }
      this.row.texture = paintRow(texts);
      old?.destroy(true);
    }
    this.t += dt;
    const S = SUMMARY;
    const a = smooth(S.rowIn[0] as number, S.rowIn[1] as number, this.t);
    this.root.visible = a > 0.003;
    if (this.row) {
      this.row.alpha = a;
      this.row.y = S.y + 8 * (1 - a);
    }
    if (this.key) {
      const k = smooth(S.keyIn[0] as number, S.keyIn[1] as number, this.t);
      this.key.alpha = k * (0.62 + 0.2 * Math.sin(clock * 1.6));
    }
  }
}
