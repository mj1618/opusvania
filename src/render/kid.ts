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

/** Where the rig last drew Kid's hands and head (world px). */
export interface RigPoints {
  F: Pt;
  B: Pt;
  head: Pt;
  mouth: Pt;
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
 * Kid's combat overlays (combat-spec §2, novice playtest §4): the Seize hand (reach, whiff snap,
 * take) leaving her glove, the Swallow ring, sparks, the clean-slip flash, the respawn shimmer and
 * her own Count ring. Her body, gloves, strikes, Levy throw and hazard flash are the rig
 * (src/render/rig). Render only: reads state and events, stepped once per sim step.
 */
export class KidRenderer {
  private readonly sparks = new SparkSet(31);
  private slipFlash = 0;
  private takeColour: Colour | null = null;
  private swallowColour: Colour = 'white';
  private swallowDone: { kind: 'commit' | 'spill' | 'refused'; age: number; colour: Colour } | null = null;
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

  /**
   * Draws the move overlays over Kid (world px). `kid` = interpolated top-left; `rig` = her glove,
   * head and mouth as the rig last drew them (src/render/rig), so the Seize hand leaves her glove.
   */
  draw(f: Graphics, gl: Graphics, kid: Pt, rig: RigPoints): void {
    const s = this.game.state;
    const p = s.player;
    const frame = s.frame;
    const cx = kid.x + p.w / 2;

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

    if (p.state === 'dead' || p.down) {
      this.sparks.draw(f, gl);
      return;
    }
    // Gloves, strikes and the Levy throw are the rig's arms (src/render/rig); here only the
    // Seize hand and the Swallow ring, which carry reach and progress information.
    const m = p.move;
    if (m) {
      const d = moveDef(m.id);
      const ph = phaseOf(m);
      if (d.kind === 'seize') this.drawSeize(f, gl, p, m, ph, kid, frame, rig.F);
      else if (d.kind === 'swallow') this.drawSwallow(f, gl, m, rig.mouth, frame);
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
    glove: Pt,
  ): void {
    const { tip, angle } = this.seizePath(p, m, kid.x, kid.y);
    const base = glove;
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

  // --- swallow ---

  private drawSwallow(f: Graphics, gl: Graphics, m: MoveState, mouth: Pt, frame: number): void {
    if (m.outcome === 'refused' || !m.soundId) return;
    const channel = Math.max(1, m.len - moveDef('swallow').recovery);
    const k = Math.min(1, m.frame / channel);
    if (m.frame > channel) return;
    const c = colourHex(this.swallowColour);
    const cx = mouth.x;
    const cy = mouth.y + 6;
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
