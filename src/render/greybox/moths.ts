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
/**
 * To the oak (the director's area 1: every freed moth flies up inside the great hollow oak): with an oak in
 * the room's marks they follow her only `follow` s, then fly to its trunk at up to `speed` px/s (steering),
 * and climb its column spiralling (`climb` px/s, `swirl` of its width), gone at the crown ring; an oak out of
 * the room they fly toward until `gone` s have passed.
 */
export const TO_OAK = { follow: 2.4, speed: 520, steer: 2.6, climb: 260, swirl: 0.38, near: 140, gone: 5 };

/** Where the oak is, for the moths (room coordinates; marks.stage.oak). */
export interface OakPoint {
  x: number;
  y: number;
  top: number;
  w?: number;
}
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

  /** Advances by `dt` s toward her (px, py: her body centre), or on to the `oak`, and draws into `g`. */
  update(dt: number, clock: number, px: number, py: number, g: Graphics, oak: OakPoint | null = null): void {
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
      } else if (oak && m.age >= SPIRAL + TO_OAK.follow) {
        // To the oak, then up inside it.
        const T = TO_OAK;
        const w = oak.w ?? 320;
        const u = m.age - SPIRAL - T.follow;
        const atTrunk = Math.abs(m.x - oak.x) < T.near && m.y <= oak.y + 60;
        let tx = oak.x + Math.sin(ang) * w * T.swirl;
        let ty = oak.y - 80;
        if (atTrunk || m.y < oak.y - 200) ty = m.y - T.climb; // climbing: always a little above itself
        if (atTrunk) tx = oak.x + Math.sin(ang * 1.4) * w * T.swirl;
        const dx = tx - m.x;
        const dy = ty - m.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = atTrunk ? T.climb : T.speed;
        m.vx += ((dx / d) * sp - m.vx) * Math.min(1, dt * T.steer);
        m.vy += ((dy / d) * sp - m.vy) * Math.min(1, dt * T.steer);
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < oak.top || u > T.gone + 8) {
          this.list.splice(i, 1);
          continue;
        }
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
      let fade = m.age > SPIRAL + FOLLOW ? Math.max(0, 1 - (m.age - SPIRAL - FOLLOW) / LEAVE) : 1;
      if (oak && m.age >= SPIRAL + TO_OAK.follow) {
        // Into the crown's light near the top; an oak off in the distance takes them out of sight.
        const toTop = (m.y - oak.top) / 300;
        const far = Math.hypot(m.x - oak.x, m.y - oak.y) > 2500;
        const u = m.age - SPIRAL - TO_OAK.follow;
        fade = Math.min(1, Math.max(0, toTop)) * (far ? Math.max(0, 1 - u / TO_OAK.gone) : 1);
      }
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
