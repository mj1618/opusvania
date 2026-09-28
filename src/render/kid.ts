import type { Graphics } from 'pixi.js';
import type { Game } from '../game';
import { countBeatFrames } from '../sim/ai/enemy';
import { boxAt, type Rect } from '../sim/combat/boxes';
import type { Colour, SimEvent } from '../sim/events';
import { moveDef, moveTotal } from '../sim/player/moves';
import type { MoveState, PlayerState } from '../sim/state';
import { tuning } from '../sim/tuning';
import { drawHand, drawKeycap, strokeText } from './glyphs';
import { dashedRect } from './outline';
import { CBT, colourHex, PALETTE } from './palette';
import { SparkSet } from './sparks';

interface Pt {
  x: number;
  y: number;
}

/** Move phase: -0.25..0 winding up, 1 at full reach, easing back to 0 in recovery. */
interface Phase {
  stage: 'startup' | 'active' | 'recovery';
  /** 0..1 within the stage. */
  t: number;
  /** Frame within the stage (1-based). */
  n: number;
  /** Extension along the move's path. */
  ext: number;
}

function phaseOf(m: MoveState): Phase {
  const d = moveDef(m.id);
  const S = d.startup;
  const A = d.spawnFrame !== undefined ? 1 : d.active;
  const R = Math.max(1, moveTotal(m) - S - A);
  const f = m.frame;
  if (f <= S) {
    const t = f / Math.max(1, S);
    return { stage: 'startup', t, n: f, ext: -0.25 * Math.sin(t * Math.PI * 0.5) };
  }
  if (f <= S + A) {
    const n = f - S;
    return { stage: 'active', t: n / A, n, ext: n === 1 ? 0.85 : 1 };
  }
  const n = f - S - A;
  const t = n / R;
  const hold = 2 / R;
  const u = Math.max(0, (t - hold) / (1 - hold));
  return { stage: 'recovery', t, n, ext: 1 - u * u * (3 - 2 * u) };
}

/**
 * Kid's combat body language (combat-spec §2, novice playtest §4): gloves that travel along each
 * strike's hitbox, the Seize hand (reach, whiff snap, take), the Levy flick, the Swallow ring,
 * the clean-slip flash and Counter glow, the hazard flash and respawn shimmer, and her own Count
 * when she's down. Render only: reads state and events, stepped once per sim step.
 */
export class KidRenderer {
  private readonly sparks = new SparkSet(31);
  private slipFlash = 0;
  private takeColour: Colour | null = null;
  private throwColour: Colour = 'white';
  private swallowColour: Colour = 'white';
  private swallowDone: { kind: 'commit' | 'spill' | 'refused'; age: number; colour: Colour } | null = null;
  private hazard: { x: number; y: number; age: number } | null = null;
  private hazardPending = false;
  private shimmer = -1;
  private countPulse = 0;
  private riseBurst = -1;
  private countedOut = -1;
  private whiffAge = -1;
  private guardAge = -1;

  constructor(private readonly game: Game) {}

  reset(): void {
    this.sparks.clear();
    this.slipFlash = 0;
    this.takeColour = null;
    this.swallowDone = null;
    this.hazard = null;
    this.hazardPending = false;
    this.shimmer = -1;
    this.countPulse = 0;
    this.riseBurst = -1;
    this.countedOut = -1;
    this.whiffAge = -1;
    this.guardAge = -1;
  }

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    const p = s.player;
    const rnd = this.sparks.rng();
    if (this.slipFlash > 0) this.slipFlash--;
    if (this.countPulse > 0) this.countPulse--;
    if (this.swallowDone && ++this.swallowDone.age > 24) this.swallowDone = null;
    if (this.hazard && ++this.hazard.age > CBT.hazardFlashFrames) this.hazard = null;
    if (this.shimmer >= 0 && ++this.shimmer > CBT.shimmerFrames) this.shimmer = -1;
    if (this.riseBurst >= 0 && ++this.riseBurst > CBT.riseBurstFrames) this.riseBurst = -1;
    if (this.countedOut >= 0) this.countedOut++;
    if (this.whiffAge >= 0 && ++this.whiffAge > CBT.whiffFrames) this.whiffAge = -1;
    if (this.guardAge >= 0 && ++this.guardAge > CBT.guardFrames) this.guardAge = -1;
    if (!p.move) this.takeColour = null;
    const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    for (const e of events) {
      switch (e.type) {
        case 'moveStart':
          this.takeColour = null;
          this.whiffAge = -1;
          this.guardAge = -1;
          break;
        case 'seizeTake':
          this.takeColour = e.colour;
          break;
        case 'whiff':
          if (e.move === 'seize' && p.move) {
            this.whiffAge = 0;
            const tip = this.seizeTip(p, p.move, p.x, p.y, 1);
            this.sparks.ring(tip.x, tip.y, PALETTE.seizeHand, 26, 10, 3);
            this.sparks.burst(rnd, tip.x, tip.y, 6, PALETTE.dust, {
              speed: 3,
              size: 9,
              life: 14,
              kind: 'puff',
              gravity: -0.05,
            });
          }
          break;
        case 'seizeGuarded':
        case 'seizeRefused':
          this.guardAge = 0;
          break;
        case 'levyThrow':
          this.throwColour = e.colour;
          break;
        case 'swallowStart':
          this.swallowColour = e.colour;
          this.swallowDone = null;
          break;
        case 'swallowCommit':
          this.swallowDone = { kind: 'commit', age: 0, colour: e.colour };
          this.sparks.ring(c.x, c.y - 12, colourHex(e.colour), 70, 18, 7);
          this.sparks.burst(rnd, c.x, c.y - 12, 10, colourHex(e.colour), {
            speed: 6,
            size: 7,
            gravity: -0.1,
          });
          break;
        case 'swallowSpill':
          this.swallowDone = { kind: 'spill', age: 0, colour: e.colour };
          this.sparks.burst(rnd, c.x, c.y - 12, 12, colourHex(e.colour), { speed: 7, size: 8, gravity: 0.6 });
          break;
        case 'swallowRefused':
          this.swallowDone = { kind: 'refused', age: 0, colour: 'white' };
          this.sparks.burst(rnd, c.x, c.y - 20, 6, PALETTE.white, { speed: 4, size: 4, life: 10 });
          break;
        case 'slipClean':
          this.slipFlash = CBT.slipFlashFrames;
          this.sparks.ring(c.x, c.y, PALETTE.flash, 70, 14, 6);
          this.sparks.ring(c.x, c.y, PALETTE.gold, 40, 18, 3);
          break;
        case 'hazard':
          this.hazard = { x: p.x, y: p.y, age: 0 };
          this.hazardPending = true;
          this.sparks.burst(rnd, e.x, e.y, 14, PALETTE.furious, { speed: 8, size: 8, up: 2 });
          break;
        case 'respawn':
          if (this.hazardPending) {
            this.shimmer = 0;
            this.sparks.ring(c.x, c.y, PALETTE.seizeHand, 60, 18, 4);
          }
          this.hazardPending = false;
          break;
        case 'roomEnter':
          this.hazardPending = false;
          this.countedOut = -1;
          break;
        case 'kidDown':
          this.sparks.burst(rnd, e.x, e.y + 30, 12, PALETTE.dust, {
            speed: 6,
            size: 12,
            kind: 'puff',
            gravity: 0,
          });
          this.countPulse = CBT.countPulseFrames;
          break;
        case 'beatCountTick':
          this.countPulse = CBT.countPulseFrames;
          break;
        case 'beatCountRise':
          this.riseBurst = 0;
          this.sparks.ring(c.x, c.y, PALETTE.gold, 110, 22, 9);
          this.sparks.burst(rnd, c.x, c.y, 16, PALETTE.gold, { speed: 10, size: 8, gravity: 0.1 });
          break;
        case 'countedOut':
          this.countedOut = 0;
          this.sparks.ring(c.x, c.y - 120, PALETTE.flash, 220, 30, 10);
          break;
        default:
          break;
      }
    }
    if (s.hitstop > 0 && !events.some((e) => e.type === 'hitstop')) return;
    this.sparks.step();
  }

  /** Body tint override (clean slip white, hazard red), or null. */
  tint(): number | null {
    if (this.slipFlash > 0) return PALETTE.flash;
    return null;
  }

  /** Alpha multiplier: fades Kid in during the respawn shimmer. */
  alpha(): number {
    return this.shimmer >= 0 ? Math.min(1, 0.2 + this.shimmer / CBT.shimmerFrames) : 1;
  }

  /** Screen darkening after Counted Out (the tenth bell), 0..1. */
  screenDim(): number {
    return this.countedOut < 0 ? 0 : Math.min(0.9, this.countedOut / CBT.countedOutFrames);
  }

  /** Kid lying down for her Count: drawn into the (unscaled) player graphics, origin = feet centre. */
  drawDown(g: Graphics, p: PlayerState): void {
    const w = p.h;
    const h = p.w - 6;
    const head = -p.facing;
    g.roundRect(-w / 2, -h, w, h, 10).fill(PALETTE.chin);
    // Closed eyes (x x) at the head end.
    const ex = head * (w / 2 - 14);
    for (const dx of [-5, 5]) {
      const x = ex + dx;
      g.moveTo(x - 3, -h + 9)
        .lineTo(x + 3, -h + 15)
        .moveTo(x + 3, -h + 9)
        .lineTo(x - 3, -h + 15);
    }
    g.stroke({ width: 2.5, color: PALETTE.enemyDark });
    // Gloves flopped on the floor.
    g.roundRect(-head * 8 - 11, -12, 22, 12, 5).fill(PALETTE.glove);
    g.roundRect(head * 14 - 11, -10, 22, 10, 5).fill(PALETTE.glove);
  }

  /** Draws the move overlays over Kid (world px). `kid` = interpolated top-left. */
  draw(f: Graphics, gl: Graphics, kid: Pt): void {
    const s = this.game.state;
    const p = s.player;
    const frame = s.frame;
    const cx = kid.x + p.w / 2;

    // Hazard: a red flash where she was hit (she vanishes until the respawn at safe ground).
    if (this.hazard) {
      const a = 1 - this.hazard.age / CBT.hazardFlashFrames;
      const white = this.hazard.age < 2;
      f.roundRect(this.hazard.x, this.hazard.y, p.w, p.h, 10).fill({
        color: white ? PALETTE.flash : PALETTE.furious,
        alpha: a,
      });
    }
    // Respawn shimmer: light columns closing in on her.
    if (this.shimmer >= 0 && p.state !== 'dead') {
      const t = this.shimmer / CBT.shimmerFrames;
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 26 * (1 - t);
        const hh = p.h * (1.4 - 0.4 * t);
        f.rect(cx + off - 2, kid.y + p.h - hh, 4, hh).fill({
          color: PALETTE.seizeHand,
          alpha: 0.6 * (1 - t),
        });
        gl.rect(cx + off - 3, kid.y + p.h - hh, 6, hh).fill({
          color: PALETTE.seizeHand,
          alpha: 0.4 * (1 - t),
        });
      }
    }

    if (p.down) this.drawCount(f, gl, p, kid, frame);

    // Counter window: a gold outline around her, pulsing.
    if (p.counter > 0 && p.state !== 'dead') {
      const k = 0.6 + 0.4 * Math.sin(frame * 0.6);
      const pad = 5;
      f.roundRect(kid.x - pad, kid.y - pad, p.w + 2 * pad, p.h + 2 * pad, 12).stroke({
        width: 3,
        color: PALETTE.gold,
        alpha: k * Math.min(1, p.counter / 8),
      });
      gl.roundRect(kid.x - pad, kid.y - pad, p.w + 2 * pad, p.h + 2 * pad, 12).stroke({
        width: 6,
        color: PALETTE.gold,
        alpha: 0.6 * k,
      });
    }

    if (p.state === 'dead' || p.down) {
      this.sparks.draw(f, gl);
      return;
    }
    const m = p.move;
    // Resting guard: two small gloves at her chest (combat rooms only).
    const guard = p.abilities.seize;
    const face = m ? m.facing : p.facing;
    const busyArm = m ? moveDef(m.id).kind : '';
    if (guard) {
      // The rear glove always rests; the lead glove rests unless a strike/levy uses it.
      this.glove(f, cx + face * 12, kid.y + 42, 20, 18, face, false, 0.95);
      if (!m || busyArm === 'swallow') this.glove(f, cx + face * 24, kid.y + 32, 22, 20, face, false, 1);
    }
    if (m) {
      const d = moveDef(m.id);
      const ph = phaseOf(m);
      if (d.kind === 'strike') this.drawStrike(f, gl, p, m, ph, kid);
      else if (d.kind === 'seize') this.drawSeize(f, gl, p, m, ph, kid, frame);
      else if (d.kind === 'levy') this.drawLevy(f, gl, p, m, ph, kid);
      else if (d.kind === 'swallow') this.drawSwallow(f, gl, p, m, kid, frame);
    }
    if (this.swallowDone?.kind === 'commit') {
      const t = this.swallowDone.age / 24;
      strokeText(f, '+', cx, kid.y - 14 - t * 40, 28, {
        color: colourHex(this.swallowDone.colour),
        alpha: 1 - t,
        width: 6,
      });
    } else if (this.swallowDone?.kind === 'refused') {
      const t = this.swallowDone.age / 24;
      strokeText(f, 'X', cx, kid.y + 22, 30, { color: PALETTE.white, alpha: 1 - t, width: 5 });
    }
    this.sparks.draw(f, gl);
  }

  // --- strikes ---

  private glove(
    f: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    face: number,
    counter: boolean,
    alpha: number,
  ): void {
    f.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.38).fill({ color: PALETTE.glove, alpha });
    f.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.38).stroke({
      width: counter ? 3 : 2,
      color: counter ? PALETTE.gold : PALETTE.gloveDark,
      alpha,
    });
    // Cuff on the wrist side, and a knuckle highlight.
    const cxw = x - (face * w) / 2 + face * 2;
    f.rect(Math.min(cxw, cxw - face * 5), y - h / 2 + 3, 5, h - 6).fill({ color: PALETTE.gloveCuff, alpha });
    f.rect(x + face * (w / 2 - 7) - 1.5, y - h / 2 + 4, 3, h * 0.35).fill({
      color: 0xffffff,
      alpha: 0.35 * alpha,
    });
  }

  private arm(f: Graphics, from: Pt, to: Pt, width: number = CBT.armWidth): void {
    f.moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: width + 3, color: PALETTE.enemyDark, alpha: 0.5, cap: 'round' });
    f.moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width, color: PALETTE.sleeve, alpha: 1, cap: 'round' });
  }

  private hitbox(p: PlayerState, m: MoveState, kid: Pt): Rect | null {
    const d = moveDef(m.id);
    const b = d.hitboxes[m.dir] ?? d.hitboxes.fwd;
    if (!b) return null;
    const r = boxAt(kid.x, kid.y, p.w, m.facing, b);
    if (m.counter) {
      const k = tuning.kid.counterBoxScale;
      const gx = Math.round((r.w * (k - 1)) / 2);
      const gy = Math.round((r.h * (k - 1)) / 2);
      return { x: r.x - gx, y: r.y - gy, w: r.w + 2 * gx, h: r.h + 2 * gy };
    }
    return r;
  }

  private drawStrike(f: Graphics, gl: Graphics, p: PlayerState, m: MoveState, ph: Phase, kid: Pt): void {
    const box = this.hitbox(p, m, kid);
    if (!box) return;
    const face = m.facing;
    const cx = kid.x + p.w / 2;
    const counter = m.counter;
    const hot = ph.stage === 'active' || (ph.stage === 'recovery' && ph.n <= 2);
    let size: readonly [number, number] = CBT.jabGlove;
    let path: (u: number) => Pt;
    let shoulder: Pt;
    if (m.id === 'uppercut') {
      size = CBT.hookGlove;
      shoulder = { x: cx + face * 6, y: kid.y + 30 };
      const a = { x: cx + face * 16, y: kid.y + 56 };
      const b = { x: cx + face * 10, y: box.y + 16 };
      const c = { x: cx + face * 46, y: kid.y + 20 };
      path = (u) => quad(a, c, b, u);
    } else if (m.id === 'overhand') {
      size = CBT.hookGlove;
      shoulder = { x: cx + face * 4, y: kid.y + 26 };
      const a = { x: cx - face * 4, y: kid.y - 6 };
      const b = { x: cx + face * 8, y: box.y + box.h - 18 };
      const c = { x: cx + face * 50, y: kid.y + 24 };
      path = (u) => quad(a, c, b, u);
    } else {
      if (m.id === 'cross') size = CBT.crossGlove;
      const y = box.y + box.h / 2;
      const rest = { x: cx + face * 24, y: kid.y + 32 };
      const far = { x: (face > 0 ? box.x + box.w : box.x) - (face * size[0]) / 2, y };
      shoulder = { x: cx + face * 4, y: kid.y + 30 };
      path = (u) => (u < 0 ? { x: rest.x + face * u * 40, y: rest.y } : lerpPt(rest, far, u));
    }
    const u = ph.ext;
    const fist = path(u);
    // Swoosh trail along the path while it's hot.
    if (hot) {
      const n = 8;
      const u0 = m.id === 'jab' || m.id === 'cross' ? Math.max(0, u - 0.7) : 0;
      for (let i = 0; i < n; i++) {
        const q0 = path(u0 + ((u - u0) * i) / n);
        const q1 = path(u0 + ((u - u0) * (i + 1)) / n);
        const w = (m.id === 'cross' ? 4 : 2) + (i / n) * (m.id === 'jab' ? 8 : 14);
        const col = counter ? PALETTE.gold : PALETTE.seizeHand;
        f.moveTo(q0.x, q0.y)
          .lineTo(q1.x, q1.y)
          .stroke({ width: w, color: col, alpha: 0.12 + (0.4 * i) / n, cap: 'round' });
      }
      if (m.id === 'jab' || m.id === 'cross') {
        // Speed lines behind the glove.
        const lines = m.id === 'cross' ? 4 : 3;
        for (let i = 0; i < lines; i++) {
          const yy = fist.y + (i - (lines - 1) / 2) * 7;
          const len = 26 + (i % 2) * 14;
          const x0 = fist.x - face * (size[0] / 2 + 6);
          f.moveTo(x0, yy)
            .lineTo(x0 - face * len, yy)
            .stroke({ width: 2, color: PALETTE.seizeHand, alpha: 0.55 });
        }
      }
    }
    this.arm(f, shoulder, fist);
    if (counter) {
      gl.circle(fist.x, fist.y, size[0] * 0.9).fill({ color: PALETTE.gold, alpha: 0.55 });
      f.circle(fist.x, fist.y, size[0] * 0.85).stroke({ width: 3, color: PALETTE.gold, alpha: 0.9 });
    }
    const gw = m.id === 'uppercut' || m.id === 'overhand' ? size[1] : size[0];
    const gh = m.id === 'uppercut' || m.id === 'overhand' ? size[0] : size[1];
    this.glove(f, fist.x, fist.y, gw, gh, face, counter, 1);
    // First active frame: a small white star at the knuckles.
    if (ph.stage === 'active' && ph.n === 1) {
      const kx = fist.x + (m.id === 'uppercut' ? 0 : face * (gw / 2 + 4));
      const ky = fist.y + (m.id === 'uppercut' ? -gh / 2 - 4 : m.id === 'overhand' ? gh / 2 + 4 : 0);
      f.star(kx, ky, 5, 12, 5).fill({ color: counter ? PALETTE.gold : PALETTE.flash, alpha: 0.95 });
      gl.star(kx, ky, 5, 14, 6).fill({ color: counter ? PALETTE.gold : PALETTE.flash, alpha: 0.6 });
    }
  }

  // --- seize ---

  /** The Seize hand's base and full-reach tip for a move (world px, kid top-left at x, y). */
  private seizePath(
    p: PlayerState,
    m: MoveState,
    x: number,
    y: number,
  ): { base: Pt; tip: Pt; angle: number } {
    const face = m.facing;
    const cx = x + p.w / 2;
    const box = this.hitbox(p, m, { x, y });
    const hs = CBT.handSize;
    if (m.dir === 'up') {
      const top = box ? box.y : y - 48;
      return {
        base: { x: cx + face * 6, y: y + 8 },
        tip: { x: cx + face * 6, y: top + hs * 0.6 },
        angle: -Math.PI / 2,
      };
    }
    if (m.dir === 'down') {
      const bot = box ? box.y + box.h : y + p.h + 48;
      return {
        base: { x: cx + face * 6, y: y + p.h - 8 },
        tip: { x: cx + face * 6, y: bot - hs * 0.6 },
        angle: Math.PI / 2,
      };
    }
    const far = box ? (face > 0 ? box.x + box.w : box.x) : cx + face * 90;
    const yy = y + 34;
    return {
      base: { x: cx + face * 12, y: yy },
      tip: { x: far - face * hs * 0.6, y: yy },
      angle: face > 0 ? 0 : Math.PI,
    };
  }

  private seizeTip(p: PlayerState, m: MoveState, x: number, y: number, ext: number): Pt {
    const { base, tip } = this.seizePath(p, m, x, y);
    return lerpPt(base, tip, ext);
  }

  private drawSeize(
    f: Graphics,
    gl: Graphics,
    p: PlayerState,
    m: MoveState,
    ph: Phase,
    kid: Pt,
    frame: number,
  ): void {
    const { base, tip, angle } = this.seizePath(p, m, kid.x, kid.y);
    const missed = m.outcome === 'whiff' || m.outcome === 'guard' || m.outcome === 'refused';
    let ext: number;
    let open: number;
    if (ph.stage === 'startup') {
      const t = ph.t;
      ext = 0.25 + 0.75 * (1 - (1 - t) * (1 - t));
      open = 0.4 + 0.6 * t;
    } else if (ph.stage === 'active') {
      ext = 1;
      open = 1;
    } else if (missed) {
      // Snap closed at full reach (range reads), then pull back.
      const hold = 3;
      ext = ph.n <= hold ? 1 : Math.max(0, 1 - (ph.n - hold) / 5);
      open = 0;
    } else {
      // A take: the hand snaps home holding the sound.
      ext = Math.max(0, 1 - ph.n / 3);
      open = 0;
    }
    // The reach: a faint dashed box of the Seize hitbox while the hand is out.
    if (ph.stage !== 'recovery' || (missed && ph.n <= 3)) {
      const box = this.hitbox(p, m, kid);
      if (box)
        dashedRect(
          f,
          box,
          2,
          missed ? PALETTE.white : PALETTE.seizeHand,
          CBT.reachAlpha * (missed ? 1.6 : 1),
        );
    }
    if (ext <= 0.02) return;
    const hand = lerpPt(base, tip, ext);
    // A pale ribbon arm with a slight wave (it is reaching for a sound).
    const n = 8;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    let prev = base;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const q = lerpPt(base, hand, u);
      const wv = Math.sin(u * Math.PI) * Math.sin(frame * 0.9 + u * 6) * 3;
      const pt = { x: q.x + nx * wv, y: q.y + ny * wv };
      f.moveTo(prev.x, prev.y)
        .lineTo(pt.x, pt.y)
        .stroke({ width: 7, color: PALETTE.seizeHand, alpha: 0.85, cap: 'round' });
      prev = pt;
    }
    gl.moveTo(base.x, base.y)
      .lineTo(hand.x, hand.y)
      .stroke({ width: 8, color: PALETTE.seizeHand, alpha: 0.25, cap: 'round' });
    const col = this.takeColour ? colourHex(this.takeColour) : PALETTE.seizeHand;
    if (this.takeColour && ph.stage === 'recovery') {
      f.circle(hand.x, hand.y, 12).fill(col);
      gl.circle(hand.x, hand.y, 14).fill({ color: col, alpha: 0.6 });
    }
    drawHand(
      f,
      hand.x,
      hand.y,
      CBT.handSize,
      angle,
      missed && this.guardAge >= 0 ? PALETTE.white : PALETTE.seizeHand,
      1,
      open,
    );
  }

  // --- levy ---

  private drawLevy(f: Graphics, gl: Graphics, p: PlayerState, m: MoveState, ph: Phase, kid: Pt): void {
    const face = m.facing;
    const cx = kid.x + p.w / 2;
    const sh = { x: cx + face * 4, y: kid.y + 28 };
    // Angles in facing-local space (0 = forward, -pi/2 = up).
    const A: Record<string, [number, number, number]> = {
      fwd: [-2.3, 0, 0.6],
      up: [0.9, -Math.PI / 2, -1.95],
      down: [-1.7, Math.PI / 2, 1.95],
    };
    const [cock, rel, fol] = A[m.dir] ?? A.fwd ?? [0, 0, 0];
    const rest = 0.9;
    let a: number;
    let alpha = 1;
    if (ph.stage === 'startup') a = rest + (cock - rest) * ph.t;
    else if (ph.stage === 'active') a = rel;
    else {
      a = rel + (fol - rel) * Math.min(1, ph.t * 2);
      alpha = 1 - Math.max(0, ph.t - 0.5) * 2;
    }
    const L = 36;
    const toWorld = (ang: number, r: number): Pt => ({
      x: sh.x + face * Math.cos(ang) * r,
      y: sh.y + Math.sin(ang) * r,
    });
    const hand = toWorld(a, L);
    // Whoosh arc from the cocked angle to the release on the throw frame and just after.
    if (ph.stage === 'active' || (ph.stage === 'recovery' && ph.n <= 3)) {
      const k = ph.stage === 'active' ? 1 : 1 - ph.n / 4;
      const c = m.outcome === 'whiff' ? PALETTE.hudDim : colourHex(this.throwColour);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const q0 = toWorld(cock + ((rel - cock) * i) / n, L + 6);
        const q1 = toWorld(cock + ((rel - cock) * (i + 1)) / n, L + 6);
        f.moveTo(q0.x, q0.y)
          .lineTo(q1.x, q1.y)
          .stroke({ width: 2 + i, color: c, alpha: k * (0.15 + (0.6 * i) / n), cap: 'round' });
      }
      if (m.outcome !== 'whiff') gl.circle(hand.x, hand.y, 16).fill({ color: c, alpha: 0.35 * k });
    }
    f.moveTo(sh.x, sh.y)
      .lineTo(hand.x, hand.y)
      .stroke({ width: CBT.armWidth, color: PALETTE.sleeve, alpha, cap: 'round' });
    const handAngle = face > 0 ? a : Math.PI - a;
    drawHand(
      f,
      hand.x,
      hand.y,
      18,
      handAngle,
      PALETTE.glove,
      alpha,
      ph.stage === 'startup' ? 0.1 : 0.8,
      PALETTE.gloveDark,
    );
  }

  // --- swallow ---

  private drawSwallow(f: Graphics, gl: Graphics, p: PlayerState, m: MoveState, kid: Pt, frame: number): void {
    if (m.outcome === 'refused' || !m.soundId) return;
    const channel = Math.max(1, m.len - moveDef('swallow').recovery);
    const k = Math.min(1, m.frame / channel);
    if (m.frame > channel) return;
    const c = colourHex(this.swallowColour);
    const cx = kid.x + p.w / 2;
    const cy = kid.y + 28;
    const R = 36;
    f.circle(cx, cy, R).stroke({ width: 7, color: PALETTE.bg, alpha: 0.6 });
    f.circle(cx, cy, R).stroke({ width: 2, color: c, alpha: 0.5 });
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI * 2 * k;
    f.moveTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R)
      .arc(cx, cy, R, a0, a1)
      .stroke({ width: 7, color: c, alpha: 1, cap: 'round' });
    gl.moveTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R)
      .arc(cx, cy, R, a0, a1)
      .stroke({ width: 9, color: c, alpha: 0.5 });
    // Motes spiral into her mouth.
    for (let i = 0; i < 4; i++) {
      const u = (((frame * 0.07 + i / 4) % 1) + 1) % 1;
      const ang = a0 + i * 1.7 + u * 3;
      const r = R * (1 - u);
      f.circle(cx + Math.cos(ang) * r, cy - 6 + Math.sin(ang) * r, 4 * (1 - u) + 1.5).fill({
        color: c,
        alpha: 0.9,
      });
    }
  }

  // --- Kid's Count ---

  private drawCount(f: Graphics, gl: Graphics, p: PlayerState, kid: Pt, frame: number): void {
    const d = p.down;
    if (!d) return;
    const s = this.game.state;
    const beatLen = countBeatFrames(s, tuning);
    const k = tuning.kid;
    const n = tuning.combat.kidCountBeats;
    const cx = kid.x + p.w / 2;
    const cy = kid.y + p.h - 170;
    const pulse = this.countPulse / CBT.countPulseFrames;
    const R = CBT.kidCountR * (1 + 0.12 * pulse);
    const canRise = d.canRise && !d.pressed;
    f.circle(cx, cy, R + 14).fill({ color: PALETTE.bg, alpha: 0.72 });
    // Rise window (beats riseBeatMin..riseBeatMax): a gold band behind those ticks.
    if (canRise) {
      const a0 = tickAngle(k.riseBeatMin - 1, n) - 0.2;
      const a1 = tickAngle(k.riseBeatMax - 1, n) + 0.2;
      f.moveTo(cx + Math.cos(a0) * (R + 6), cy + Math.sin(a0) * (R + 6))
        .arc(cx, cy, R + 6, a0, a1)
        .stroke({ width: 10, color: PALETTE.gold, alpha: 0.35 });
    }
    for (let i = 0; i < n; i++) {
      const a = tickAngle(i, n);
      const on = i < d.beat;
      const inWin = canRise && i + 1 >= k.riseBeatMin && i + 1 <= k.riseBeatMax;
      const col = on ? (inWin ? PALETTE.gold : PALETTE.flash) : inWin ? PALETTE.gold : PALETTE.hudDim;
      f.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10))
        .lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4))
        .stroke({ width: on ? 7 : 4, color: col, alpha: on ? 1 : 0.8, cap: 'round' });
    }
    if (d.beat > 0)
      strokeText(f, String(d.beat), cx, cy, CBT.kidCountNum * (1 + 0.25 * pulse), {
        color: PALETTE.flash,
        width: 6,
      });
    // The one-press prompt: the jump key, bright on a beat inside the window.
    if (canRise) {
      const near = Math.round(d.t / beatLen);
      const inWin = near >= k.riseBeatMin && near <= k.riseBeatMax;
      const onBeat = inWin && Math.abs(d.t - near * beatLen) <= k.riseWindow;
      const bob = Math.sin(frame * 0.25) * 3;
      const ks = onBeat ? CBT.keySize * 1.15 : CBT.keySize;
      const kx = cx + R + 50;
      drawKeycap(f, 'jump', kx, cy + bob, ks, inWin ? 1 : 0.5);
      if (onBeat)
        gl.roundRect(kx - ks / 2 - 4, cy + bob - ks / 2 - 4, ks + 8, ks + 8, 10).fill({
          color: PALETTE.gold,
          alpha: 0.6,
        });
      // Up chevron above the key: "get up".
      f.poly(
        [kx - 12, cy - ks / 2 - 10 + bob, kx, cy - ks / 2 - 22 + bob, kx + 12, cy - ks / 2 - 10 + bob],
        false,
      ).stroke({
        width: 4,
        color: inWin ? PALETTE.gold : PALETTE.hudDim,
        cap: 'round',
      });
    }
  }
}

function tickAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i / n) * Math.PI * 2;
}

function lerpPt(a: Pt, b: Pt, u: number): Pt {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

function quad(a: Pt, c: Pt, b: Pt, u0: number): Pt {
  const u = Math.max(0, Math.min(1, u0));
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
}
