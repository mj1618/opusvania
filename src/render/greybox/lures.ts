/**
 * Lures in greybox (memory/lures.md, memory/greybox.md): per lure a faint pull-field circle, the core
 * ring, the warm flame dot (it flickers on render time) and pips for its hp; a husk once it is out.
 * While she is inside a field, a thin line from her to the flame shows how hard it pulls. Events give
 * the beats: a ring per `lureBeat`, a flash per `lureHit`, a burst per `lureSnuff` (the loudest
 * thing on screen) and the freed moths.
 */
import type { Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { lureAt } from '../../sim/lures';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { FreedMoths } from './moths';
import { GB } from './palette';

interface Fx {
  kind: 'beat' | 'hit' | 'snuff' | 'catch' | 'free';
  x: number;
  y: number;
  /** Seconds since it started. */
  t: number;
  /** Seconds it lasts. */
  life: number;
  /** Size: the ring's start radius. */
  r: number;
}

const LIFE = { beat: 0.35, hit: 0.25, snuff: 0.9, catch: 0.4, free: 0.45 } as const;

/** Scratch for a flame's position this frame. */
const AT = { x: 0, y: 0 };

export class LureView {
  private readonly fx: Fx[] = [];
  readonly moths = new FreedMoths();

  /** Reads this render frame's events. */
  onEvents(events: readonly SimEvent[], sim: SimView): void {
    for (const e of events) {
      if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) {
        // A restart: everything burns again, the moths are gone.
        this.moths.clear();
        this.fx.length = 0;
      } else if (e.type === 'lureBeat')
        this.fx.push({ kind: 'beat', x: e.x, y: e.y, t: 0, life: LIFE.beat, r: 30 + e.out });
      else if (e.type === 'lureHit')
        this.fx.push({ kind: 'hit', x: e.x, y: e.y, t: 0, life: LIFE.hit, r: 24 });
      else if (e.type === 'lureCaught')
        this.fx.push({ kind: 'catch', x: e.x, y: e.y, t: 0, life: LIFE.catch, r: 70 });
      else if (e.type === 'lureFree')
        this.fx.push({ kind: 'free', x: sim.player.cx, y: sim.player.cy, t: 0, life: LIFE.free, r: 20 });
      else if (e.type === 'lureSnuff') {
        this.fx.push({ kind: 'snuff', x: e.x, y: e.y, t: 0, life: LIFE.snuff, r: 20 });
        this.moths.free(e.id, e.x, e.y, e.moths);
      }
    }
  }

  /** Draws the lures under her (`back`) and the effects and moths over her (`front`). */
  draw(dt: number, clock: number, sim: SimView, back: Graphics, front: Graphics): void {
    const list = sim.scene.lures ?? [];
    const p = sim.player;
    const T = tuning.lures;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l) continue;
      const K = T.kinds[l.kind];
      const hp = sim.lures.hp[i] ?? 0;
      // Where the flame is now: a swinging one on its arc (memory/level-kit.md), on the sim's frame
      // interpolated like her (the latest step used frame - 1).
      const at = lureAt(l, sim.frame - 2 + sim.alpha, tuning, AT);
      const lx = at.x;
      const ly = at.y;
      if (l.swing) {
        const py = l.y - l.swing.length;
        back.moveTo(l.x, py).lineTo(lx, ly).stroke({ color: GB.husk, width: 3, alpha: 0.9 });
        back.circle(l.x, py, 6).fill({ color: GB.husk });
      }
      if (hp <= 0) {
        // The husk: cold, small, no field.
        back.circle(lx, ly, 14).stroke({ color: GB.husk, width: 2, alpha: 0.5 });
        back.circle(lx, ly, 5).fill({ color: GB.husk, alpha: 0.8 });
        continue;
      }
      const held = p.lure === i;
      const grace = p.lureGrace === i && p.lureGraceFrames > 0;
      // The field: a faint wash and rim (dimmer while it leaves her alone).
      back.circle(lx, ly, K.radius).fill({ color: GB.field, alpha: grace ? 0.015 : 0.035 });
      back.circle(lx, ly, K.radius).stroke({ color: GB.field, width: 2, alpha: grace ? 0.1 : 0.22 });
      // The swirl's way round: three short arcs on the rim.
      const spin = l.spin ?? 1;
      for (let k = 0; k < 3; k++) {
        const a0 = clock * 0.6 * spin + (k * Math.PI * 2) / 3;
        const ar = K.radius - 10;
        // (A new sub-path first: arc() would join the previous point.)
        back
          .moveTo(lx + Math.cos(a0) * ar, ly + Math.sin(a0) * ar)
          .arc(lx, ly, ar, a0, a0 + 0.35 * spin, spin < 0)
          .stroke({
            color: GB.field,
            width: 3,
            alpha: grace ? 0.12 : 0.3,
          });
      }
      // The core.
      back.circle(lx, ly, K.core).stroke({ color: GB.core, width: held ? 4 : 2, alpha: held ? 1 : 0.6 });
      // The flame: a warm dot that breathes.
      const fl = 1 + 0.12 * Math.sin(clock * 9 + i * 1.7) + 0.06 * Math.sin(clock * 23 + i);
      back.circle(lx, ly, T.flameRadius * 1.6 * fl).fill({ color: GB.flame, alpha: 0.18 });
      back.circle(lx, ly, T.flameRadius * 0.75 * fl).fill({ color: GB.flame });
      back.circle(lx, ly - 2, T.flameRadius * 0.32 * fl).fill({ color: GB.flameHot });
      // hp pips over the flame (only for more than one cut).
      const max = Math.max(1, Math.round(K.hp));
      if (max > 1)
        for (let k = 0; k < max; k++) {
          const x = lx + (k - (max - 1) / 2) * 14;
          back.circle(x, ly - T.flameRadius - 16, 4).fill({ color: k < hp ? GB.flame : GB.husk });
        }
      // Inside its field (and not held): a line from her to the flame, as strong as the pull.
      if (!held && !grace) {
        const dx = lx - p.cx;
        const dy = ly - p.cy;
        const d = Math.hypot(dx, dy);
        if (d < K.radius) {
          const k = Math.max(0, Math.min(1, (K.radius - d) / Math.max(1, K.radius - K.core)));
          back
            .moveTo(p.cx, p.cy)
            .lineTo(lx, ly)
            .stroke({ color: GB.field, width: 1 + 3 * k, alpha: 0.15 + 0.5 * k * k });
        }
      }
      // Held: the beats it takes, as pips over the flame (over her), and where the last beat would
      // throw her: out along the radius she is at, bent toward the held direction (as the sim does).
      if (held) {
        const of = Math.max(1, Math.round(T.beats));
        const top = ly - K.core - T.orbitShare * K.core - 46;
        for (let k = 0; k < of; k++) {
          const x = lx + (k - (of - 1) / 2) * 22;
          front.circle(x, top, 7).fill({ color: k < p.lureBeats ? GB.flameHot : GB.husk, alpha: 0.95 });
          front.circle(x, top, 7).stroke({ color: GB.flameHot, width: 2, alpha: 0.8 });
        }
        let ox = p.cx - lx;
        let oy = p.cy - ly;
        const d = Math.hypot(ox, oy) || 1;
        ox /= d;
        oy /= d;
        if (p.inputX !== 0) {
          ox += p.inputX * T.freeSteer;
          const n = Math.hypot(ox, oy) || 1;
          ox /= n;
          oy /= n;
        }
        const last = p.lureBeats >= of - 1;
        const x0 = p.cx + ox * 30;
        const y0 = p.cy + oy * 30;
        const x1 = p.cx + ox * (last ? 140 : 90);
        const y1 = p.cy + oy * (last ? 140 : 90);
        front.moveTo(x0, y0).lineTo(x1, y1);
        front.moveTo(x1, y1).lineTo(x1 - ox * 18 - oy * 10, y1 - oy * 18 + ox * 10);
        front.moveTo(x1, y1).lineTo(x1 - ox * 18 + oy * 10, y1 - oy * 18 - ox * 10);
        front.stroke({ color: GB.flameHot, width: last ? 4 : 2, alpha: last ? 0.9 : 0.4 });
      }
    }
    // Effects.
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i] as Fx;
      f.t += dt;
      const u = f.t / f.life;
      if (u >= 1) {
        this.fx.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - u) * (1 - u);
      if (f.kind === 'beat') {
        front
          .circle(f.x, f.y, f.r + 40 * ease)
          .stroke({ color: GB.flameHot, width: 4 * (1 - u) + 1, alpha: 1 - u });
      } else if (f.kind === 'hit') {
        front.circle(f.x, f.y, f.r + 30 * ease).fill({ color: GB.flameHot, alpha: 0.6 * (1 - u) });
      } else if (f.kind === 'catch') {
        front.circle(f.x, f.y, f.r * (1 - ease) + 30).stroke({ color: GB.core, width: 3, alpha: 1 - u });
      } else if (f.kind === 'free') {
        front
          .circle(f.x, f.y, f.r + 60 * ease)
          .stroke({ color: GB.label, width: 3 * (1 - u) + 1, alpha: 0.8 * (1 - u) });
      } else {
        // The snuff: a hot flash, a ring that runs out past the old field, and spokes.
        if (u < 0.18)
          front.circle(f.x, f.y, 60 + 200 * u).fill({ color: GB.flameHot, alpha: 0.9 * (1 - u / 0.18) });
        front
          .circle(f.x, f.y, f.r + 300 * ease)
          .stroke({ color: GB.flame, width: 8 * (1 - u) + 1, alpha: 1 - u });
        front
          .circle(f.x, f.y, f.r + 170 * ease)
          .stroke({ color: GB.flameHot, width: 3, alpha: 0.7 * (1 - u) });
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI * 2) / 12 + 0.2;
          const r0 = 30 + 160 * ease;
          const r1 = r0 + 40 * (1 - u);
          front
            .moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0)
            .lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
        }
        front.stroke({ color: GB.flameHot, width: 3, alpha: 1 - u });
      }
    }
    this.moths.update(dt, clock, p.cx, p.cy, front);
  }
}
