/**
 * Draws the impact director's particles (world space): streak sparks, star flashes, shockwave
 * rings, speed lines, ink splats and comic words. `f` = the unlit actors layer (over everything),
 * `gl` = the emissive layer (blooms). Pixi only here; the model is src/render/juice/impact.ts.
 */
import type { Graphics } from 'pixi.js';
import { strokeText } from '../glyphs';
import { rngFor } from '../outline';
import type { ImpactDirector } from './impact';
import { JUICE } from './tuning';

const INK = 0xe0322f;

export function drawImpacts(f: Graphics, gl: Graphics, d: ImpactDirector): void {
  // Speed lines first (under the sparks): long thin wedges pointing at the contact point.
  for (const l of d.lines) {
    const t = l.age / l.life;
    const rnd = rngFor(l.seed, l.age >> 1);
    const n = JUICE.speedLineCount;
    const r0 = JUICE.speedLineInner * (1 + t * 0.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      const len = 500 + rnd() * 700;
      const w = 3 + rnd() * 7;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x0 = l.x + ca * r0;
      const y0 = l.y + sa * r0;
      const x1 = l.x + ca * (r0 + len);
      const y1 = l.y + sa * (r0 + len);
      f.poly([x0, y0, x1 - sa * w, y1 + ca * w, x1 + sa * w, y1 - ca * w]).fill({
        color: i % 2 === 0 ? 0xffffff : l.color,
        alpha: 0.55 * (1 - t),
      });
    }
  }

  for (const k of d.inks) {
    const t = Math.min(1, k.age / 4);
    const fade = k.age < 60 ? 1 : 1 - (k.age - 60) / 30;
    for (const b of k.blobs) {
      f.circle(k.x + b.dx * t, k.y + b.dy * t, b.r * (0.4 + 0.6 * t)).fill({
        color: INK,
        alpha: 0.85 * fade,
      });
    }
  }

  for (const r of d.rings) {
    const a = r.age - r.delay;
    if (a < 0) continue;
    const t = a / r.life;
    const e = 1 - (1 - t) ** 3;
    const rad = 8 + e * r.r1;
    const w = r.width * (1 - t) + 1;
    f.circle(r.x, r.y, rad).stroke({ width: w, color: r.color, alpha: 0.9 * (1 - t) });
    gl.circle(r.x, r.y, rad).stroke({ width: w * 1.6, color: r.color, alpha: 0.6 * (1 - t) });
  }

  for (const p of d.sparks) {
    const t = p.age / p.life;
    const sp = Math.hypot(p.vx, p.vy);
    const len = Math.max(4, sp * 2.2);
    const ux = sp > 0 ? p.vx / sp : 1;
    const uy = sp > 0 ? p.vy / sp : 0;
    const w = p.width * (1 - t * 0.6);
    f.moveTo(p.x - ux * len, p.y - uy * len)
      .lineTo(p.x, p.y)
      .stroke({ width: w, color: p.color, alpha: 1 - t * t, cap: 'round' });
    gl.moveTo(p.x - ux * len, p.y - uy * len)
      .lineTo(p.x, p.y)
      .stroke({ width: w * 2, color: p.color, alpha: 0.7 * (1 - t), cap: 'round' });
  }

  for (const s of d.stars) {
    const t = s.age / s.life;
    // Blooms out fast, then thins: big on frame 1.
    const R = s.r * (t < 0.25 ? 0.7 + 1.2 * t : 1 - (t - 0.25) * 0.4);
    const r = R * (0.22 - 0.1 * t);
    const pts: number[] = [];
    for (let i = 0; i < s.points * 2; i++) {
      const a = s.rot + (i / (s.points * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? R * (i % 4 === 0 ? 1 : 0.62) : r;
      pts.push(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
    }
    f.poly(pts).fill({ color: s.color, alpha: 1 - t * 0.5 });
    const inner = pts.map((v, i) => (i % 2 === 0 ? s.x + (v - s.x) * 0.55 : s.y + (v - s.y) * 0.55));
    f.poly(inner).fill({ color: 0xffffff, alpha: 1 - t * 0.3 });
    gl.poly(pts).fill({ color: s.color, alpha: 0.9 * (1 - t) });
    gl.circle(s.x, s.y, R * 0.9).fill({ color: 0xffffff, alpha: 0.35 * (1 - t) });
  }

  for (const w of d.words) {
    const t = w.age / w.life;
    // Slam in big, settle, drift up, then fade.
    const k = w.age < 4 ? 1.9 - (w.age / 4) * 0.9 : 1 + 0.04 * Math.sin(w.age * 0.5);
    const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const y = w.y - w.age * 1.2;
    const x = w.x + w.dir * w.age * 0.6;
    const size = w.size * k;
    // Dark keyline, then colour, then a white hot core: reads on any district.
    strokeText(f, w.text, x + 3, y + 4, size, {
      color: 0x12141a,
      width: size / 3.2,
      alpha: a * 0.9,
      angle: w.angle,
    });
    strokeText(f, w.text, x, y, size, { color: w.color, width: size / 4.2, alpha: a, angle: w.angle });
    strokeText(f, w.text, x, y, size, { color: 0xffffff, width: size / 12, alpha: a * 0.9, angle: w.angle });
    strokeText(gl, w.text, x, y, size, { color: w.color, width: size / 4, alpha: a * 0.5, angle: w.angle });
  }
}
