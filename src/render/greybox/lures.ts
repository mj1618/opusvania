/**
 * Lures in greybox (memory/lures.md, memory/greybox.md): per lure a faint pull-field circle, the core
 * ring, the warm flame dot (it flickers on render time) and pips for its hp; a husk once it is out.
 * While she is inside a field, a thin line from her to the flame shows how hard it pulls. Events give
 * the beats: a ring per `lureBeat`, a flash per `lureHit`, a burst per `lureSnuff` (the loudest
 * thing on screen) and the freed moths.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { flameAt, lureRowNow } from '../../sim/lures';
import { slashBox } from '../../sim/player/attack';
import { tuning } from '../../sim/tuning';
import { withUpgrades } from '../../sim/upgrades';
import { STAGE_BEATS } from '../camera/stage-cam';
import type { SimView } from '../contract';
import { FreedMoths } from './moths';
import { GB } from './palette';
import { STAGING } from './staging';

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

/**
 * The dark a snuff leaves (feel review problem 4, memory/feel.md): a flat disc grows from the flame to
 * the old pull radius over `grow` s at `peak` opacity, then settles over `settle` s to a lasting `wash`
 * where the field was, so a cleared room looks safe. A lure out before she came in has the wash only.
 * `flash`: the frames of white on the frame the flame goes out.
 */
const DARK = { color: 0x04060a, grow: 0.5, settle: 0.7, peak: 0.42, wash: 0.2, flash: 2 } as const;

/**
 * The attack glyph (plan r3, item 1: a first-timer stood at W2's knob and never cut): before her first snuff
 * ever, once she has stood in reach of a flame `wait` s without cutting, a key cap over the flame says which
 * button cuts. Once a page load; gone when she cuts, after `hold` s, or `leave` s out of reach.
 */
export const LURE_GLYPH = {
  wait: 1.5,
  in: 0.25,
  hold: 4,
  out: 0.45,
  leave: 0.8,
  above: 64,
  key: 'C',
  size: 24,
  cap: 40,
  color: 0xe8ecf6,
  alpha: 0.85,
};
/** Shown this page load (the glyph shows once). */
let glyphShown = false;

/** Scratch for a flame's position this frame. */
const AT = { x: 0, y: 0 };

export class LureView {
  private readonly fx: Fx[] = [];
  readonly moths = new FreedMoths();
  /** Seconds since each lure went out while she was here (by id); absent = out before. */
  private readonly outT = new Map<string, number>();
  /** The attack glyph: a key cap and its letter, over her (add `glyph` to a layer over the lures). */
  readonly glyph = new Container({ label: 'greybox-attack-glyph' });
  private readonly glyphCap = new Graphics();
  private readonly glyphKey: Text;
  /** Seconds in reach without a cut; the glyph's age (-1 = not up) and its fade; seconds out of reach. */
  private reachT = 0;
  private glyphT = -1;
  private glyphA = 0;
  private awayT = 0;
  private glyphEnd = false;

  constructor() {
    const G = LURE_GLYPH;
    this.glyphKey = new Text({
      text: G.key,
      style: {
        fontFamily: 'Menlo, Consolas, monospace',
        fontSize: G.size,
        fontWeight: 'bold',
        fill: G.color,
      },
      resolution: 2,
    });
    this.glyphKey.anchor.set(0.5, 0.5);
    this.glyph.addChild(this.glyphCap, this.glyphKey);
    this.glyph.visible = false;
  }

  /** Reads this render frame's events. */
  onEvents(events: readonly SimEvent[], sim: SimView): void {
    for (const e of events) {
      if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) {
        // A restart: everything burns again, the moths are gone.
        this.moths.clear();
        this.fx.length = 0;
        this.outT.clear();
      } else if (e.type === 'slash') {
        this.reachT = 0;
        if (this.glyphT >= 0) this.glyphEnd = true;
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
        this.outT.set(e.id, 0);
        this.moths.free(e.id, e.x, e.y, e.moths);
      }
    }
  }

  /** Draws the lures under her (`back`) and the effects and moths over her (`front`). */
  draw(dt: number, clock: number, sim: SimView, back: Graphics, front: Graphics): void {
    const list = sim.scene.lures ?? [];
    const p = sim.player;
    const T = tuning.lures;
    // The flame's box half-size with her upgrades (keen blade reaches further), for the reach rim.
    const FR = list.length > 0 ? withUpgrades(tuning, sim.save).lures.flameRadius : T.flameRadius;
    for (const [id, t] of this.outT) this.outT.set(id, t + dt);
    let reach: { x: number; y: number } | null = null;
    // First the dark where flames went out: under every field still burning.
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l || (sim.lures.hp[i] ?? 0) > 0) continue;
      const R = lureRowNow(sim.lures, i, l, tuning).radius;
      const at = flameAt(sim.lures, i, l, sim.frame - 2 + sim.alpha, tuning, AT);
      const t = this.outT.get(l.id) ?? 1e6;
      const grow = Math.min(1, t / DARK.grow);
      const r = R * (1 - (1 - grow) * (1 - grow) * (1 - grow));
      const settle = Math.min(1, Math.max(0, (t - DARK.grow) / DARK.settle));
      const a = DARK.peak + (DARK.wash - DARK.peak) * settle * settle * (3 - 2 * settle);
      // Two steps, so the edge is soft even flat.
      back.circle(at.x, at.y, r).fill({ color: DARK.color, alpha: a * 0.45 });
      back.circle(at.x, at.y, r * 0.86).fill({ color: DARK.color, alpha: a * 0.65 });
      if (t < DARK.flash / 60) back.circle(at.x, at.y, 110).fill({ color: GB.flameHot, alpha: 0.95 });
    }
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l) continue;
      const K = lureRowNow(sim.lures, i, l, tuning);
      const hp = sim.lures.hp[i] ?? 0;
      // The firefly's glow-cap (a lure with `after`) is hung during the glimpse: not there until it is.
      if (l.after && STAGE_BEATS.glimpse >= 0 && STAGE_BEATS.glimpse < STAGING.glimpse.pulse0) continue;
      // Where the flame is now: a swinging one on its arc (memory/level-kit.md), on the sim's frame
      // interpolated like her (the latest step used frame - 1).
      const at = flameAt(sim.lures, i, l, sim.frame - 2 + sim.alpha, tuning, AT);
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
      // The core: where it catches her. It brightens and thickens as she nears it (explorer r2: the catch read
      // as an unseen rule).
      const dc = Math.hypot(p.cx - lx, p.cy - ly);
      const near = held
        ? 1
        : Math.max(0, Math.min(1, 1 - (dc - K.core) / Math.max(1, (K.radius - K.core) * 0.7)));
      back.circle(lx, ly, K.core).stroke({
        color: GB.core,
        width: held ? 4 : 2 + 2 * near,
        alpha: held ? 1 : 0.45 + 0.5 * near * near,
      });
      // The flame: a warm dot that breathes.
      const fl = 1 + 0.12 * Math.sin(clock * 9 + i * 1.7) + 0.06 * Math.sin(clock * 23 + i);
      back.circle(lx, ly, T.flameRadius * 1.6 * fl).fill({ color: GB.flame, alpha: 0.18 });
      back.circle(lx, ly, T.flameRadius * 0.75 * fl).fill({ color: GB.flame });
      back.circle(lx, ly - 2, T.flameRadius * 0.32 * fl).fill({ color: GB.flameHot });
      // In reach of her blade now (a standing forward or up cut would meet the flame's box): a crisp pale
      // rim and four ticks on the flame, so the snuff is a thing she sees she can do.
      if (!held && !grace && dc < 400) {
        const fr = FR;
        const body = { x: p.x, y: p.y, w: p.w, h: p.h };
        const hit = (b: { x: number; y: number; w: number; h: number }) =>
          lx + fr > b.x && lx - fr < b.x + b.w && ly + fr > b.y && ly - fr < b.y + b.h;
        if (hit(slashBox(body, 'fwd', p.facing, tuning)) || hit(slashBox(body, 'up', p.facing, tuning))) {
          reach = { x: lx, y: ly };
          const rr = fr + 7 + 1.5 * Math.sin(clock * 8);
          back.circle(lx, ly, rr).stroke({ color: GB.flameHot, width: 2, alpha: 0.85 });
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + Math.PI / 4;
            back
              .moveTo(lx + Math.cos(a) * (rr + 3), ly + Math.sin(a) * (rr + 3))
              .lineTo(lx + Math.cos(a) * (rr + 10), ly + Math.sin(a) * (rr + 10));
          }
          back.stroke({ color: GB.flameHot, width: 2, alpha: 0.85 });
        }
      }
      // Guarded by its boss (memory/bosses.md): a silk cage round the flame, the blade passes through.
      if ((sim.lures.live?.shield[i] ?? 0) > 0) {
        back.circle(lx, ly, T.flameRadius * 2.2).stroke({ color: 0xe6ecf5, width: 3, alpha: 0.7 });
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          back
            .moveTo(lx, ly)
            .lineTo(lx + Math.cos(a) * T.flameRadius * 2.2, ly + Math.sin(a) * T.flameRadius * 2.2);
        }
        back.stroke({ color: 0xe6ecf5, width: 1, alpha: 0.5 });
      }
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
      // throw her: the sim's own aim (`lureAimX, lureAimY`: the held direction; the radius when none).
      if (held) {
        // (Quick wings beats free in fewer: the upgraded number, src/sim/upgrades.ts.)
        const of = Math.max(1, Math.round(withUpgrades(tuning, sim.save).lures.beats));
        const top = ly - K.core - T.orbitShare * K.core - 46;
        for (let k = 0; k < of; k++) {
          const x = lx + (k - (of - 1) / 2) * 22;
          front.circle(x, top, 7).fill({ color: k < p.lureBeats ? GB.flameHot : GB.husk, alpha: 0.95 });
          front.circle(x, top, 7).stroke({ color: GB.flameHot, width: 2, alpha: 0.8 });
        }
        // The throw's arc (`player.lureArc`, the sim's own prediction: where the last beat would send her now):
        // dots along her flight, brighter once the last beat is due, and a ring where she lands.
        const last = p.lureBeats >= of - 1;
        const arc = p.lureArc;
        const n = arc.length >> 1;
        for (let k = 1; k < n; k++) {
          const ax = arc[k * 2] as number;
          const ay = arc[k * 2 + 1] as number;
          const fade = 1 - (0.6 * k) / n;
          front
            .circle(ax, ay, last ? 3.5 : 2.5)
            .fill({ color: GB.flameHot, alpha: (last ? 0.85 : 0.4) * fade });
        }
        if (n > 1) {
          const ex = arc[(n - 1) * 2] as number;
          const ey = arc[(n - 1) * 2 + 1] as number;
          front
            .circle(ex, ey, last ? 12 : 9)
            .stroke({ color: GB.flameHot, width: 2, alpha: last ? 0.8 : 0.35 });
        }
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
    this.moths.update(dt, clock, p.cx, p.cy, front, sim.scene.marks?.stage?.oak ?? null);
    this.drawGlyph(dt, sim, reach);
  }

  /** The attack glyph over the flame in reach (once, before her first snuff). */
  private drawGlyph(dt: number, sim: SimView, reach: { x: number; y: number } | null): void {
    const G = LURE_GLYPH;
    const first = sim.save.snuffed.length === 0 && sim.lures.snuffed === 0;
    if (this.glyphT < 0) {
      this.reachT = reach && first && !glyphShown ? this.reachT + dt : 0;
      if (this.reachT >= G.wait && reach) {
        glyphShown = true;
        this.glyphT = 0;
        this.glyphEnd = false;
        this.awayT = 0;
        this.glyph.position.set(reach.x, reach.y - G.above);
      }
    }
    if (this.glyphT >= 0) {
      this.glyphT += dt;
      this.awayT = reach ? 0 : this.awayT + dt;
      if (reach) this.glyph.position.set(reach.x, reach.y - G.above);
      if (this.glyphT > G.hold || this.awayT > G.leave || !first) this.glyphEnd = true;
      this.glyphA = this.glyphEnd
        ? Math.max(0, this.glyphA - dt / G.out)
        : Math.min(1, this.glyphA + dt / G.in);
      if (this.glyphEnd && this.glyphA <= 0) this.glyphT = -1;
    }
    this.glyph.visible = this.glyphA > 0;
    if (!this.glyph.visible) return;
    this.glyph.alpha = G.alpha * this.glyphA;
    const c = G.cap / 2;
    this.glyphCap
      .clear()
      .roundRect(-c, -c, G.cap, G.cap, 7)
      .fill({ color: 0x0b0e14, alpha: 0.75 })
      .roundRect(-c, -c, G.cap, G.cap, 7)
      .stroke({ color: G.color, width: 2, alpha: 0.9 });
  }
}
