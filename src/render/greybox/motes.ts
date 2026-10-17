/**
 * The small grey juice (feel review problem 10, memory/feel.md): flat dust and sparks that answer her
 * body in a greybox room, where the painted field's dust does not run. Reads sim events and her state;
 * never changes the sim. Render time only; every mote's spread comes from a hash of a running count,
 * never Math.random, so a capture is the same every time.
 *
 * - Landing: dust puffs either side of her feet, more and wider the faster she came down; a hard
 *   landing adds a flat ring on the ground (and its shake, camera/shake.ts).
 * - Jumps: two puffs off the ground; off a wall, puffs off the wall; a double jump, a thin ring under her.
 * - Wall slide: dust rubbed off the wall at her hand while she slides, faster the faster she slides.
 * - `slashTerrain`: sparks off the face the blade met, along its normal, and a short white tick.
 */
import type { Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { PlayerView } from '../contract';
import { hash01 } from './moths';
import { GB } from './palette';

/** Dust: colour, alpha, gravity (px/s², dust floats: small), drag (1/s). Sparks: colour, life. */
const DUST = { color: 0xb8c2d6, alpha: 0.55, gravity: -40, drag: 5 };
const SPARK = { color: 0xfff0c0, life: 0.16, gravity: 900 };
/** Landing: puffs at a soft landing and at max fall speed; speed of a fall that counts as max. */
const LAND = { min: 2, max: 6, vyMax: 21 };
/** Wall slide: seconds between motes at max slide speed (and at a crawl). */
const SLIDE = { fast: 0.05, slow: 0.16, vyMax: 9 };

interface Mote {
  kind: 'dust' | 'spark' | 'ring' | 'tick';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  life: number;
}

export class Motes {
  private readonly list: Mote[] = [];
  /** A running count: the seed of each new mote's spread. */
  private n = 0;
  private slideAcc = 0;

  clear(): void {
    this.list.length = 0;
    this.slideAcc = 0;
  }

  get count(): number {
    return this.list.length;
  }

  private rnd(): number {
    return hash01('motes', this.n++);
  }

  private dust(x: number, y: number, vx: number, vy: number, r: number, life: number): void {
    this.list.push({ kind: 'dust', x, y, vx, vy, r, t: 0, life });
  }

  /** Reads this render frame's events. */
  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          if (events.some((o) => o.type === 'roomEnter')) this.clear();
          break;
        case 'land': {
          const k = Math.min(1, Math.max(0, e.vy / LAND.vyMax));
          const n = Math.round(LAND.min + (LAND.max - LAND.min) * k);
          for (let i = 0; i < n; i++) {
            const s = i % 2 === 0 ? -1 : 1;
            const sp = (60 + 220 * k) * (0.6 + 0.6 * this.rnd());
            this.dust(
              e.x + s * (6 + 10 * this.rnd()),
              e.y - 3,
              s * sp,
              -(10 + 40 * this.rnd()),
              4 + 4 * k,
              0.3 + 0.2 * k,
            );
          }
          if (e.hard) this.list.push({ kind: 'ring', x: e.x, y: e.y, vx: 0, vy: 0, r: 26, t: 0, life: 0.3 });
          break;
        }
        case 'jump': {
          if (e.kind === 'wall') {
            const wx = e.x - e.dir * 22;
            for (let i = 0; i < 3; i++)
              this.dust(
                wx,
                e.y - 20 - 30 * this.rnd(),
                e.dir * (40 + 80 * this.rnd()),
                20 - 40 * this.rnd(),
                4,
                0.3,
              );
          } else if (e.kind === 'double') {
            this.list.push({ kind: 'ring', x: e.x, y: e.y + 4, vx: 0, vy: 0, r: 18, t: 0, life: 0.22 });
          } else {
            for (let i = 0; i < 2; i++) {
              const s = i === 0 ? -1 : 1;
              this.dust(
                e.x + s * 8,
                e.y - 2,
                s * (50 + 60 * this.rnd()) - e.dir * 40,
                -10 - 20 * this.rnd(),
                4,
                0.25,
              );
            }
          }
          break;
        }
        case 'slashTerrain': {
          // Sparks off the face, along its normal, fanned.
          for (let i = 0; i < 6; i++) {
            const a = Math.atan2(e.ny, e.nx) + (this.rnd() - 0.5) * 1.6;
            const sp = 260 + 320 * this.rnd();
            this.list.push({
              kind: 'spark',
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - 80,
              r: 2,
              t: 0,
              life: SPARK.life * (0.7 + 0.6 * this.rnd()),
            });
          }
          this.list.push({ kind: 'tick', x: e.x, y: e.y, vx: 0, vy: 0, r: 6, t: 0, life: 0.1 });
          break;
        }
      }
    }
  }

  /** Advances by `dt` s (her state for the wall slide) and draws into `g`. */
  update(dt: number, p: PlayerView, g: Graphics): void {
    if (p.mode === 'wallSlide' && p.wallDir !== 0 && p.vy > 0.5) {
      const k = Math.min(1, p.vy / SLIDE.vyMax);
      this.slideAcc += dt;
      const every = SLIDE.slow + (SLIDE.fast - SLIDE.slow) * k;
      while (this.slideAcc >= every) {
        this.slideAcc -= every;
        const wx = p.cx + p.wallDir * (p.w / 2);
        this.dust(
          wx,
          p.y + 18 + 20 * this.rnd(),
          -p.wallDir * (20 + 40 * this.rnd()),
          -30 - 30 * this.rnd(),
          3.5,
          0.35,
        );
      }
    } else this.slideAcc = 0;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i] as Mote;
      m.t += dt;
      const u = m.t / m.life;
      if (u >= 1) {
        this.list.splice(i, 1);
        continue;
      }
      if (m.kind === 'dust') {
        m.vx *= Math.exp(-DUST.drag * dt);
        m.vy = m.vy * Math.exp(-DUST.drag * dt) + DUST.gravity * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        g.circle(m.x, m.y, m.r * (1 + 0.6 * u)).fill({ color: DUST.color, alpha: DUST.alpha * (1 - u) });
      } else if (m.kind === 'spark') {
        const x0 = m.x;
        const y0 = m.y;
        m.vy += SPARK.gravity * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        g.moveTo(x0, y0)
          .lineTo(m.x, m.y)
          .stroke({ color: SPARK.color, width: 2.5, alpha: 1 - u });
      } else if (m.kind === 'tick') {
        g.circle(m.x, m.y, m.r + 14 * u).stroke({ color: GB.flameHot, width: 3, alpha: 1 - u });
      } else {
        // A flat ring on the ground (a hard landing, a double jump, the clang's tick).
        const ease = 1 - (1 - u) * (1 - u);
        g.ellipse(m.x, m.y, m.r + 50 * ease, (m.r + 50 * ease) * 0.22).stroke({
          color: GB.solidTop,
          width: 3 * (1 - u) + 1,
          alpha: 0.6 * (1 - u),
        });
      }
    }
  }
}
