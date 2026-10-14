// biome-ignore-all lint/style/noNonNullAssertion: polygon maths over arrays indexed in range
/**
 * Small painting helpers on top of Graphics: soft glow sprites (a code-made radial texture),
 * vertical gradient fills, hand-cut blobs, and the sleeper silhouette that sits inside every pod.
 */
import { FillGradient, type Graphics, Sprite, Texture } from 'pixi.js';
import type { Pt } from './tissue';

let glowTex: Texture | null = null;

/** A 256 px radial falloff (gaussian-ish, no hard edge), white on transparent. */
export function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d');
  if (g) {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = (x + 0.5) / N - 0.5;
        const dy = (y + 0.5) / N - 0.5;
        const d = Math.sqrt(dx * dx + dy * dy) * 2;
        const f = d >= 1 ? 0 : Math.exp(-d * d * 4.2) * (1 - d * d) ** 2;
        const i = (y * N + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(f * 255);
      }
    g.putImageData(img, 0, 0);
  }
  glowTex = Texture.from(cv);
  return glowTex;
}

/** An additive soft light (or a normal-blended soft blob with `add` false). */
export function glow(x: number, y: number, r: number, color: number, alpha: number, add = true): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.width = r * 2;
  s.height = r * 2;
  s.tint = color;
  s.alpha = alpha;
  if (add) s.blendMode = 'add';
  return s;
}

/** A vertical gradient over the shape's own bounds: stops are [offset 0..1, colour, alpha?]. */
export function vgrad(stops: ReadonlyArray<readonly [number, number, number?]>): FillGradient {
  const g = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
  });
  for (const [o, c, a] of stops) g.addColorStop(o, a === undefined ? c : hexA(c, a));
  return g;
}

export function hgrad(stops: ReadonlyArray<readonly [number, number, number?]>): FillGradient {
  const g = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    textureSpace: 'local',
  });
  for (const [o, c, a] of stops) g.addColorStop(o, a === undefined ? c : hexA(c, a));
  return g;
}

function hexA(c: number, a: number): string {
  const h = (c & 0xffffff).toString(16).padStart(6, '0');
  const al = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${al}`;
}

/** A hand-cut closed blob: an ellipse whose radius wanders. */
export function blob(
  rng: () => number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rough = 0.18,
  n = 24,
): Pt[] {
  const ph = rng() * 6.28;
  const ph2 = rng() * 6.28;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rough * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 5 + ph2) * 0.4 + (rng() - 0.5) * 0.5);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

export function poly(g: Graphics, pts: readonly Pt[]): Graphics {
  return g.poly(pts.flat());
}

/** A ridge line: the top of a silhouette from x0 to x1, height by a sum of seeded sines. */
export function ridge(
  rng: () => number,
  x0: number,
  x1: number,
  base: number,
  amp: number,
  bottom: number,
  step = 12,
): Pt[] {
  const f = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const pts: Pt[] = [[x0, bottom]];
  for (let x = x0; x <= x1 + 0.1; x += step) {
    const y =
      base -
      amp *
        (0.55 * Math.sin(x * 0.004 + f[0]!) +
          0.3 * Math.sin(x * 0.011 + f[1]!) +
          0.15 * Math.sin(x * 0.029 + f[2]!));
    pts.push([x, y]);
  }
  pts.push([x1, bottom]);
  return pts;
}

/**
 * The sleeper: a curled human shape (knees to chest, head bowed), about `h` px tall, centred at
 * (cx, cy), rotated by `rot`. No face, no detail: a grey shadow inside the membrane.
 */
export function sleeper(
  g: Graphics,
  cx: number,
  cy: number,
  h: number,
  rot: number,
  color: number,
  alpha: number,
): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (x: number, y: number): Pt => [cx + (x * c - y * s) * h, cy + (x * s + y * c) * h];
  // Back and bottom, as one bean.
  const body: Pt[] = [
    P(-0.06, -0.3),
    P(0.1, -0.26),
    P(0.2, -0.12),
    P(0.22, 0.08),
    P(0.18, 0.28),
    P(0.06, 0.4),
    P(-0.08, 0.42),
    P(-0.16, 0.32),
    P(-0.1, 0.18),
    P(-0.16, 0.04),
    P(-0.2, -0.12),
    P(-0.16, -0.24),
  ];
  g.poly(body.flat()).fill({ color, alpha });
  // Knees drawn up.
  const kn = P(-0.2, 0.12);
  g.ellipse(kn[0], kn[1], h * 0.1, h * 0.17).fill({ color, alpha: alpha * 0.9 });
  // The bowed head.
  const hd = P(-0.12, -0.36);
  g.circle(hd[0], hd[1], h * 0.13).fill({ color, alpha });
}

/** A vertical light cone (a street lamp's fall), as a soft polygon fan with a gradient. */
export function cone(
  g: Graphics,
  x: number,
  y: number,
  topW: number,
  botW: number,
  h: number,
  color: number,
  a: number,
): void {
  g.poly([x - topW / 2, y, x + topW / 2, y, x + botW / 2, y + h, x - botW / 2, y + h]).fill(
    vgrad([
      [0, color, a],
      [0.6, color, a * 0.35],
      [1, color, 0],
    ]),
  );
}
