/**
 * The bend field: a coarse grid over the scene that the plant shader samples at each plant's
 * base. R = how far plants there are pushed sideways (a damped spring per cell, so they wobble
 * back), G = how excited glow plants there are (rises fast near the character or a light, fades
 * slowly). Simulated on the CPU (a few thousand floats), uploaded as one tiny RGBA texture.
 */
import { BufferImageSource, Texture } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView } from '../../contract';
import type { PointLight } from '../../lights';

export const FIELD = {
  cellW: 12,
  cellH: 24,
  /** Spring: stiffness (1/s^2) and damping (1/s). Underdamped on purpose: grass wobbles back. */
  stiffness: 150,
  damping: 5.2,
  /** How hard the character's body drags cells to its target (1/s^2), and its reach in px. */
  push: 1100,
  reachX: 44,
  reachUp: 96,
  reachDown: 22,
  /** Sideways lean from running speed (px/frame at which it saturates). */
  dragSpeed: 7,
  /** Landing shiver: strength of the travelling ring, and how far it travels (px). */
  landKick: 9,
  landReach: 260,
  /** Seconds the ring takes to cross that reach, and its width in px. */
  landTime: 0.42,
  landWidth: 34,
  /** Glow: reach of the character in px, rise and fall time constants (s). */
  glowReach: 210,
  glowRise: 0.18,
  glowFall: 1.4,
} as const;

export class BendField {
  readonly cols: number;
  readonly rows: number;
  readonly texture: Texture;
  private readonly d: Float32Array;
  private readonly v: Float32Array;
  private readonly e: Float32Array;
  private readonly data: Uint8Array;
  private readonly source: BufferImageSource;
  private live = true;
  private readonly waves: Array<{ x: number; row: number; age: number; power: number }> = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cols = Math.ceil(width / FIELD.cellW);
    this.rows = Math.ceil(height / FIELD.cellH);
    const n = this.cols * this.rows;
    this.d = new Float32Array(n);
    this.v = new Float32Array(n);
    this.e = new Float32Array(n);
    this.data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) this.data[i * 4] = 128;
    this.source = new BufferImageSource({
      resource: this.data,
      width: this.cols,
      height: this.rows,
      format: 'rgba8unorm',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
    });
    this.texture = new Texture({ source: this.source });
  }

  /** x0, y0, 1/w, 1/h of the area the texture covers, for the shader. */
  get rect(): [number, number, number, number] {
    return [0, 0, 1 / (this.cols * FIELD.cellW), 1 / (this.rows * FIELD.cellH)];
  }

  /** Bend (-1..1) and glow excitement (0..1) at a world point (nearest cell). */
  sample(x: number, y: number): { bend: number; excite: number } {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / FIELD.cellW)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / FIELD.cellH)));
    const i = cy * this.cols + cx;
    return { bend: this.d[i] as number, excite: this.e[i] as number };
  }

  update(dt: number, player: PlayerView, lights: readonly PointLight[], events: readonly SimEvent[]): void {
    const h = Math.min(dt, 1 / 30);
    if (h <= 0) return;
    const { cols, rows, d, v, e } = this;
    const cw = FIELD.cellW;
    const ch = FIELD.cellH;

    for (const ev of events) {
      if (ev.type === 'spawn') {
        d.fill(0);
        v.fill(0);
      } else if (ev.type === 'land') {
        // A ring that travels outward through the plants; soft landings barely stir them.
        const power = Math.max(0.12, Math.min(1.5, (ev.vy - 3) / 13));
        this.waves.push({ x: ev.x, row: Math.floor((ev.y - 4) / ch), age: 0, power });
        if (this.waves.length > 4) this.waves.shift();
      }
    }
    for (let w = this.waves.length - 1; w >= 0; w--) {
      const wave = this.waves[w] as { x: number; row: number; age: number; power: number };
      wave.age += h;
      if (wave.age > FIELD.landTime) {
        this.waves.splice(w, 1);
        continue;
      }
      const radius = (wave.age / FIELD.landTime) * FIELD.landReach;
      const fade = 1 - wave.age / FIELD.landTime;
      const width = FIELD.landWidth;
      const a0 = Math.max(0, Math.floor((wave.x - radius - width * 2) / cw));
      const a1 = Math.min(cols - 1, Math.ceil((wave.x + radius + width * 2) / cw));
      for (let ry = Math.max(0, wave.row - 3); ry <= Math.min(rows - 1, wave.row + 1); ry++) {
        for (let cx = a0; cx <= a1; cx++) {
          const dx = (cx + 0.5) * cw - wave.x;
          const q = (Math.abs(dx) - radius) / width;
          if (q > 2.5 || q < -2.5) continue;
          const i = ry * cols + cx;
          v[i] =
            (v[i] as number) +
            (dx < 0 ? -1 : 1) * FIELD.landKick * wave.power * Math.exp(-q * q) * fade * h * 22;
        }
      }
      this.live = true;
    }

    // The character pushes cells its body overlaps.
    const px = player.cx;
    const top = player.feetY - FIELD.reachUp;
    const bottom = player.feetY + FIELD.reachDown;
    const c0 = Math.max(0, Math.floor((px - FIELD.reachX * 2.2) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((px + FIELD.reachX * 2.2) / cw));
    const r0 = Math.max(0, Math.floor(top / ch));
    const r1 = Math.min(rows - 1, Math.floor(bottom / ch));
    const drag = Math.max(-1, Math.min(1, player.vx / FIELD.dragSpeed));
    for (let ry = r0; ry <= r1; ry++) {
      const cy = (ry + 0.5) * ch;
      const fy = cy < player.feetY - 60 ? Math.max(0, 1 - (player.feetY - 60 - cy) / 40) : 1;
      for (let cx = c0; cx <= c1; cx++) {
        const u = ((cx + 0.5) * cw - px) / FIELD.reachX;
        const g = Math.exp(-u * u * 1.1);
        const target = Math.max(-1, Math.min(1, u * g * 1.9 + drag * g * 0.75));
        const f = Math.min(1, g * 1.6) * fy;
        const i = ry * cols + cx;
        v[i] = (v[i] as number) + (target - (d[i] as number)) * FIELD.push * f * h;
        // Extra damping while held, so held grass does not buzz.
        v[i] = (v[i] as number) * (1 - Math.min(1, f * 14 * h));
      }
    }
    if (r1 >= r0) this.live = true;

    // Glow excitement toward the nearest source.
    const sources: Array<{ x: number; y: number; r: number; k: number }> = [
      { x: px, y: player.cy, r: FIELD.glowReach, k: 1 },
    ];
    for (const l of lights) {
      if (l.intensity > 0)
        sources.push({ x: l.x, y: l.y, r: Math.max(FIELD.glowReach, l.radius), k: l.intensity });
    }
    const rise = 1 - Math.exp(-h / FIELD.glowRise);
    const fall = Math.exp(-h / FIELD.glowFall);
    for (const s of sources) {
      const a0 = Math.max(0, Math.floor((s.x - s.r) / cw));
      const a1 = Math.min(cols - 1, Math.ceil((s.x + s.r) / cw));
      const b0 = Math.max(0, Math.floor((s.y - s.r) / ch));
      const b1 = Math.min(rows - 1, Math.ceil((s.y + s.r) / ch));
      for (let ry = b0; ry <= b1; ry++) {
        for (let cx = a0; cx <= a1; cx++) {
          const dist = Math.hypot((cx + 0.5) * cw - s.x, (ry + 0.5) * ch - s.y) / s.r;
          if (dist >= 1) continue;
          const t = Math.min(1, s.k) * (1 - dist) ** 1.4;
          const i = ry * cols + cx;
          const cur = e[i] as number;
          if (t > cur) e[i] = cur + (t - cur) * rise;
        }
      }
      this.live = true;
    }

    if (!this.live) return;
    let any = false;
    const K = FIELD.stiffness;
    const C = FIELD.damping;
    const data = this.data;
    for (let i = 0, n = d.length; i < n; i++) {
      let di = d[i] as number;
      let vi = v[i] as number;
      let ei = e[i] as number;
      if (di !== 0 || vi !== 0) {
        vi += (-K * di - C * vi) * h;
        di += vi * h;
        if (di > 1.2) di = 1.2;
        else if (di < -1.2) di = -1.2;
        if (Math.abs(di) < 0.002 && Math.abs(vi) < 0.02) {
          di = 0;
          vi = 0;
        } else any = true;
        d[i] = di;
        v[i] = vi;
        data[i * 4] = Math.max(0, Math.min(255, Math.round(128 + di * 105)));
      }
      if (ei !== 0) {
        ei *= fall;
        if (ei < 0.004) ei = 0;
        else any = true;
        e[i] = ei;
        data[i * 4 + 1] = Math.round(Math.min(1, ei) * 255);
      }
    }
    this.source.update();
    this.live = any;
  }
}

/** Bend texel value back to -1.2..1.2 (keep in step with the shader). */
export const FIELD_DECODE = 'float fieldBend(float r) { return (r * 255.0 - 128.0) / 105.0; }';
