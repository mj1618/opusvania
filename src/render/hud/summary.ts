/**
 * The end of the run, said without words: once the ending's hold is over (`goal.ended`) a quiet
 * tally fades in low on the screen. What she found, each as "n / total" with a gold sprig when it
 * was all of them: glints, great glints, lumen pods, creatures. Under it, smaller, how it went: time
 * (m:ss), hits taken, fades (only if any). Then, a breath later, a key cap with an R: restart.
 *
 * Painted into one canvas when the run ends (the numbers are known then), outside the post stage
 * like the rest of the HUD.
 */
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { SimView } from '../contract';
import { VIEW_W } from '../contract';
import { clockText } from '../goal/logic';

export const SUMMARY = {
  /** Centre of the upper row (what she found), logical px; the lower row (how it went) sits `rowGap` under it. */
  y: 910,
  rowGap: 64,
  font: 32,
  /** The "/ total" after a count, and the lower row, are this much smaller. */
  sub: 0.62,
  lower: 0.74,
  /** Icon box, the gap to its numeral, the gap between entries. */
  icon: 30,
  gap: 11,
  between: 62,
  /** Seconds after `endHold`: the row fades in from..to, the key from..to. */
  rowIn: [0.5, 2.1],
  keyIn: [2.6, 3.8],
  /** The R key stands this far past the right end of the rows' texture (which has 34 px of margin), px. */
  keyGap: 6,
  /** Under each entry its name in small caps (the pod and the shell could not be told without): px, tracking px, drop under the baseline. */
  label: 11.5,
  track: 1.6,
  labelDrop: 19,
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
  // Creatures felled: a burrback's shell, on its back.
  (g, s) => {
    const k = s / 30;
    g.save();
    g.scale(k, k);
    g.strokeStyle = COOL;
    g.fillStyle = 'rgba(16, 28, 40, 0.92)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-12, 5);
    g.bezierCurveTo(-11, -9, 11, -9, 12, 5);
    g.closePath();
    g.fill();
    g.stroke();
    // Plates and the three legs each side.
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-4, -5.4);
    g.quadraticCurveTo(-2.4, 0, -4.6, 5);
    g.moveTo(4, -5.4);
    g.quadraticCurveTo(2.4, 0, 4.6, 5);
    for (const x of [-8, -3, 3, 8]) {
      g.moveTo(x, 5);
      g.lineTo(x + (x < 0 ? -2.4 : 2.4), 10);
    }
    g.stroke();
    g.fillStyle = PALE;
    for (const x of [-7.4, 0, 7.4]) {
      g.beginPath();
      g.arc(x, 0.6, 1.1, 0, Math.PI * 2);
      g.fill();
    }
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
  // Great glints: the star in its bud.
  (g, s) => {
    const k = s / 30;
    g.save();
    g.scale(k, k);
    g.strokeStyle = COOL;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(-9, 2);
    g.quadraticCurveTo(-8, 11, 0, 12.5);
    g.quadraticCurveTo(8, 11, 9, 2);
    g.moveTo(0, 12.5);
    g.lineTo(0, 15);
    g.stroke();
    g.translate(0, -2);
    const grad = g.createLinearGradient(0, -12, 0, 10);
    grad.addColorStop(0, '#fff4dc');
    grad.addColorStop(1, '#f2a94e');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -12);
    g.quadraticCurveTo(1.4, -1.4, 7.4, 0);
    g.quadraticCurveTo(1.4, 1.4, 0, 10);
    g.quadraticCurveTo(-1.4, 1.4, -7.4, 0);
    g.quadraticCurveTo(-1.4, -1.4, 0, -12);
    g.fill();
    g.restore();
  },
  // Lumen pods: a seed pod with light in its seam.
  (g, s) => {
    const k = s / 30;
    g.save();
    g.scale(k, k);
    g.strokeStyle = COOL;
    g.fillStyle = 'rgba(16, 28, 40, 0.92)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -13);
    g.bezierCurveTo(9, -6, 9, 7, 0, 12);
    g.bezierCurveTo(-9, 7, -9, -6, 0, -13);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255, 190, 100, 0.95)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.quadraticCurveTo(-2, 0, 0, 8);
    g.stroke();
    g.restore();
  },
  // Wayside lamps: a small crook with its seed of glass, lit.
  (g, s) => {
    const k = s / 30;
    g.save();
    g.scale(k, k);
    g.strokeStyle = COOL;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-5, 13);
    g.bezierCurveTo(-8, 2, -6, -9, -1, -11.5);
    g.bezierCurveTo(3, -13.5, 7, -11, 6.4, -7);
    g.stroke();
    g.fillStyle = 'rgba(255, 178, 80, 0.95)';
    g.beginPath();
    g.moveTo(6.4, -6.6);
    g.bezierCurveTo(7, -3.6, 9.8, -1.6, 9.8, 1.2);
    g.bezierCurveTo(9.8, 3.6, 8.2, 5, 6.4, 5);
    g.bezierCurveTo(4.6, 5, 3, 3.6, 3, 1.2);
    g.bezierCurveTo(3, -1.6, 5.8, -3.6, 6.4, -6.6);
    g.closePath();
    g.fill();
    g.restore();
  },
  // Fades: her light gone up in three motes.
  (g, s) => {
    const k = s / 30;
    g.fillStyle = COOL;
    for (const [x, y, r] of [
      [-3, 7, 2.6],
      [3.5, -1, 2],
      [-1, -9, 1.4],
    ] as const) {
      g.beginPath();
      g.arc(x * k, y * k, r * k, 0, Math.PI * 2);
      g.fill();
    }
  },
];

function seatOn(g: Ctx): void {
  g.shadowColor = 'rgba(2, 12, 18, 0.95)';
  g.shadowBlur = 9 * RES;
  g.shadowOffsetY = 1.5 * RES;
}

/** One entry of the tally: an icon, a numeral, and (for what could be found) "/ total". */
export interface Entry {
  icon: number;
  text: string;
  of?: string;
  /** Over and above the total (what finishers paid): "+n", small, gold. */
  plus?: string;
  /** Its name, set in small caps under it. */
  label?: string;
  /** Everything of its kind was found: it gets a gold flourish. */
  all?: boolean;
}

function paintRows(rows: Entry[][]): Texture {
  const S = SUMMARY;
  const probe = document.createElement('canvas').getContext('2d');
  const fontOf = (px: number): string => `500 ${px}px ${S.family}`;
  const width = (t: string, px: number): number => {
    if (!probe) return t.length * px * 0.5;
    probe.font = fontOf(px);
    return probe.measureText(t).width;
  };
  const scaleOf = (r: number): number => (r === 0 ? 1 : S.lower);
  const rowWidth = (row: Entry[], k: number): number => {
    let total = -S.between * k;
    for (const e of row)
      total +=
        (S.icon + S.gap) * k +
        width(e.text, S.font * k) +
        (e.of ? width(e.of, S.font * S.sub * k) + 5 * k : 0) +
        (e.plus ? width(e.plus, S.font * S.sub * k) + 7 * k : 0) +
        S.between * k;
    return total;
  };
  const pad = 34;
  let widest = 0;
  for (let r = 0; r < rows.length; r++) widest = Math.max(widest, rowWidth(rows[r] as Entry[], scaleOf(r)));
  const cw = Math.ceil(widest) + pad * 2;
  const ch = Math.ceil(S.font * 1.5 + S.rowGap * (rows.length - 1) + S.labelDrop) + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = cw * RES;
  canvas.height = ch * RES;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(RES, RES);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] as Entry[];
      const k = scaleOf(r);
      const cy = pad + S.font * 0.75 + r * S.rowGap;
      const size = S.font * k;
      const base = cy + size * 0.34;
      let x = (cw - rowWidth(row, k)) / 2;
      for (const e of row) {
        const icon = ICONS[e.icon];
        // Twice: first only for the dark seat under it.
        for (const pass of [0, 1]) {
          g.save();
          if (pass === 0) {
            seatOn(g);
            g.globalAlpha = 0.7;
          } else if (r > 0) g.globalAlpha = 0.85;
          g.translate(x + (S.icon * k) / 2, cy);
          icon?.(g, S.icon * k);
          g.restore();
        }
        const tx = x + (S.icon + S.gap) * k;
        const tw = width(e.text, size);
        const put = (text: string, px: number, at: number, alpha: number): void => {
          g.font = fontOf(px);
          g.save();
          seatOn(g);
          g.fillStyle = 'rgba(2, 12, 18, 0.6)';
          g.fillText(text, at, base);
          g.fillText(text, at, base);
          g.restore();
          const grad = g.createLinearGradient(0, base - px * 0.7, 0, base);
          grad.addColorStop(0, e.all ? '#fffbe8' : '#fff4dc');
          grad.addColorStop(0.55, e.all ? '#ffe08a' : '#ffdc9c');
          grad.addColorStop(1, e.all ? '#ffb030' : '#f2ab52');
          g.fillStyle = grad;
          g.globalAlpha = alpha;
          g.fillText(text, at, base);
          g.globalAlpha = 1;
        };
        put(e.text, size, tx, r > 0 ? 0.85 : 1);
        let end = tx + tw;
        if (e.of) {
          put(e.of, size * S.sub, end + 5 * k, e.all ? 0.95 : 0.78);
          end += 5 * k + width(e.of, size * S.sub);
        }
        if (e.plus) {
          const px = size * S.sub;
          g.font = fontOf(px);
          g.save();
          seatOn(g);
          g.fillStyle = 'rgba(2, 12, 18, 0.6)';
          g.fillText(e.plus, end + 7 * k, base);
          g.restore();
          g.fillStyle = 'rgba(255, 196, 96, 0.95)';
          g.fillText(e.plus, end + 7 * k, base);
          end += 7 * k + width(e.plus, px);
        }
        if (e.label) {
          // Its name, small caps, cool and quiet, under the numeral.
          g.save();
          g.font = `600 ${S.label * (r > 0 ? 0.94 : 1)}px ${S.family}`;
          (g as Ctx & { letterSpacing: string }).letterSpacing = `${S.track}px`;
          seatOn(g);
          g.fillStyle = 'rgba(2, 12, 18, 0.7)';
          g.fillText(e.label.toUpperCase(), tx, base + S.labelDrop * k);
          g.shadowColor = 'transparent';
          g.fillStyle = 'rgba(176, 202, 214, 0.8)';
          g.fillText(e.label.toUpperCase(), tx, base + S.labelDrop * k);
          g.restore();
        }
        if (e.all) {
          // All of them: a sprig of gold under the entry, a small star at its end.
          g.save();
          g.shadowColor = 'rgba(255, 170, 50, 0.7)';
          g.shadowBlur = 4 * RES;
          g.strokeStyle = 'rgba(255, 214, 120, 0.95)';
          g.fillStyle = 'rgba(255, 224, 140, 0.95)';
          g.lineWidth = 1.2;
          const y0 = base + 9 + (e.label ? (S.labelDrop + 1) * k : 0);
          g.beginPath();
          g.moveTo(x + 2, y0 - 2);
          g.quadraticCurveTo((x + end) / 2, y0 + 5, end - 2, y0 - 2);
          g.stroke();
          for (const t of [0.2, 0.4, 0.6, 0.8]) {
            const lx = x + (end - x) * t;
            const ly = y0 + 3.4 * Math.sin(Math.PI * t) - 0.6;
            g.beginPath();
            g.ellipse(lx, ly - 2.4, 1.3, 3, t < 0.5 ? -0.7 : 0.7, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
        x = end + S.between * k;
      }
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
    const count = (icon: number, label: string, n: number, total: number): Entry =>
      total > 0
        ? { icon, label, text: String(n), of: `/ ${total}`, all: n >= total }
        : { icon, label, text: String(n) };
    // What she found, and under it how it went.
    const glints = count(0, 'glints', e.glints, e.glintsTotal);
    if (e.bonus > 0) glints.plus = `+${e.bonus}`;
    const found: Entry[] = [
      glints,
      count(4, 'great glints', e.greats, e.greatsTotal),
      count(5, 'pods', e.pods, e.podsTotal),
      count(2, 'creatures', e.kills, e.enemiesTotal),
    ];
    const went: Entry[] = [
      { icon: 1, label: 'time', text: clockText(e.time) },
      { icon: 3, label: 'hits', text: String(e.hits) },
    ];
    if ((e.lampsTotal ?? 0) > 0) found.push(count(6, 'lamps', e.lamps ?? 0, e.lampsTotal ?? 0));
    if (e.deaths > 0) went.push({ icon: 7, label: 'fades', text: String(e.deaths) });
    const rows = [found, went];
    const sig = JSON.stringify(rows);
    if (sig !== this.shown) {
      this.shown = sig;
      const old = this.row?.texture;
      if (!this.row) {
        this.row = new Sprite();
        this.row.anchor.set(0.5);
        this.row.position.set(VIEW_W / 2, SUMMARY.y + SUMMARY.rowGap / 2);
        this.key = new Sprite(paintKey());
        this.key.anchor.set(0.5);
        this.root.addChild(this.row, this.key);
      }
      this.row.texture = paintRows(rows);
      // The key stands at the end of the rows, level with their middle: under them it sat on the
      // page's hint line (the bottom 28 px are not ours).
      this.key?.position.set(
        VIEW_W / 2 + this.row.width / 2 + SUMMARY.keyGap,
        SUMMARY.y + SUMMARY.rowGap / 2 + 2,
      );
      old?.destroy(true);
    }
    this.t += dt;
    const S = SUMMARY;
    const a = smooth(S.rowIn[0] as number, S.rowIn[1] as number, this.t);
    this.root.visible = a > 0.003;
    if (this.row) {
      this.row.alpha = a;
      this.row.y = S.y + S.rowGap / 2 + 8 * (1 - a);
    }
    if (this.key) {
      const k = smooth(S.keyIn[0] as number, S.keyIn[1] as number, this.t);
      this.key.alpha = k * (0.62 + 0.2 * Math.sin(clock * 1.6));
    }
  }
}
