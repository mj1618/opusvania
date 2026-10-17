/**
 * Freed moths, greybox (render only, memory/lures.md): on a `lureSnuff` its `moths` spiral out of the
 * flame, follow her loosely for about 6 s, then fly off up and away. Deterministic on render time:
 * every moth's quirks come from a hash of (lure id, index), never Math.random, and each moth is a
 * damped spring toward a target that is a pure function of its age and her position.
 */
import type { Graphics } from 'pixi.js';
import { GB } from './palette';

/** Seconds: spiralling out, then following her, then leaving. */
const SPIRAL = 1.1;
const FOLLOW = 6;
const LEAVE = 4;
/** The follow spring: stiffness (1/s²) and damping (1/s). */
const SPRING = 14;
const DAMP = 4.5;

interface Moth {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since the snuff. */
  age: number;
  /** Seeds: orbit radius, angular speed, phase, bob. */
  r: number;
  w: number;
  ph: number;
  bob: number;
  /** Where it came from (the flame). */
  fx: number;
  fy: number;
}

/** A small integer hash in [0, 1). */
export function hash01(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class FreedMoths {
  private readonly list: Moth[] = [];

  /** A lure went out at (x, y) with `n` moths. */
  free(id: string, x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = hash01(id, i * 4);
      this.list.push({
        x,
        y,
        vx: 0,
        vy: 0,
        age: 0,
        r: 50 + 50 * hash01(id, i * 4 + 1),
        w: (1.6 + 1.4 * hash01(id, i * 4 + 2)) * (i % 2 === 0 ? 1 : -1),
        ph: a * Math.PI * 2,
        bob: hash01(id, i * 4 + 3) * Math.PI * 2,
        fx: x,
        fy: y,
      });
    }
  }

  clear(): void {
    this.list.length = 0;
  }

  get count(): number {
    return this.list.length;
  }

  /** Advances by `dt` s toward her (px, py: her body centre) and draws into `g`. */
  update(dt: number, clock: number, px: number, py: number, g: Graphics): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i] as Moth;
      m.age += dt;
      const ang = m.ph + m.age * m.w;
      if (m.age < SPIRAL) {
        // Out of the flame on a widening spiral (placed, not sprung).
        const u = m.age / SPIRAL;
        const r = m.r * 1.3 * u;
        const nx = m.fx + Math.cos(ang * 2) * r;
        const ny = m.fy + Math.sin(ang * 2) * r - 40 * u;
        if (dt > 0) {
          m.vx = (nx - m.x) / dt;
          m.vy = (ny - m.y) / dt;
        }
        m.x = nx;
        m.y = ny;
      } else if (m.age < SPIRAL + FOLLOW) {
        // Loosely round her: a soft spring (px/s), so they stream after her when she moves.
        const tx = px + Math.cos(ang) * m.r;
        const ty = py - 50 + Math.sin(ang) * m.r * 0.6 + Math.sin(clock * 3 + m.bob) * 12;
        m.vx += ((tx - m.x) * SPRING - m.vx * DAMP) * dt;
        m.vy += ((ty - m.y) * SPRING - m.vy * DAMP) * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      } else {
        // Away: up and to the east (until rooms have a migration line), faster and faster.
        const u = m.age - SPIRAL - FOLLOW;
        if (u > LEAVE) {
          this.list.splice(i, 1);
          continue;
        }
        m.vx += (500 + 200 * Math.sin(m.bob)) * dt;
        m.vy -= (650 + 150 * Math.cos(m.bob)) * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }
      // A moth: a chevron about 12 px across whose wings beat (the V opens and closes), and a body dot.
      const beat = Math.sin(clock * 26 + m.bob);
      const fade = m.age > SPIRAL + FOLLOW ? Math.max(0, 1 - (m.age - SPIRAL - FOLLOW) / LEAVE) : 1;
      const span = 6 + 1.5 * Math.abs(beat);
      const lift = 2 + 5 * beat;
      g.moveTo(m.x - span, m.y - lift)
        .lineTo(m.x, m.y + 2)
        .lineTo(m.x + span, m.y - lift)
        .stroke({ color: GB.moth, width: 3, alpha: 0.9 * fade, join: 'round', cap: 'round' });
      g.circle(m.x, m.y + 1, 2.5).fill({ color: GB.moth, alpha: 0.95 * fade });
    }
  }
}
