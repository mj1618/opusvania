/**
 * When a line of text may be up (the Canopy r11, review r10 #8: "Your claws have hardened..." and "A new light
 * kindles." stayed ~5 s, over the well's ambush and the Grove's wave). Pure, no Pixi: the item line (item-line.ts)
 * shows what this says, and the unit test drives it with plain sim views.
 *
 *  - A line lasts `LINE_TIME.in + hold + out` = 2.5 s at most.
 *  - While a fight is near (`fightNear`: a creature aware of her or arriving within `near` px, alive), a new line
 *    waits; one already up goes within `cut` s (and comes back after the fight if it was cut in its first half). It
 *    shows once the fight's last creature is down or gone (or she is away).
 */

/** Seconds: fade in, hold, fade out (2.5 s in all), and how near a fight keeps lines down (px). */
export const LINE_TIME = { in: 0.3, hold: 1.5, out: 0.7, near: 800, cut: 0.2 };

/** The part of a sim view this needs. */
export interface FightView {
  player: { cx: number; cy: number };
  enemies: ReadonlyArray<{
    x: number;
    y: number;
    w: number;
    h: number;
    mode: string;
    gone: boolean;
    aware: number;
    arrive: number;
  }>;
}

/** Is a fight on near her: a live creature aware of her (or on its way in) within `near` px? */
export function fightNear(sim: FightView, near: number = LINE_TIME.near): boolean {
  const p = sim.player;
  for (const e of sim.enemies) {
    if (e.gone || e.mode === 'dead') continue;
    if (e.aware <= 0 && e.arrive <= 0) continue;
    const dx = e.x + e.w / 2 - p.cx;
    const dy = e.y + e.h / 2 - p.cy;
    if (dx * dx + dy * dy <= near * near) return true;
  }
  return false;
}

export class LineTimer {
  /** The line up (or waiting), '' = none. */
  text = '';
  /** Seconds it has been up (-1 = waiting for the fight to end). */
  private t = 1e6;
  /** Cut short by a fight: the alpha it is fading from (0 = not cutting). */
  private cutA = 0;
  /** Seconds a staged moment keeps lines down for, as a fight does (the great release's column: review r13 #1). */
  private holdT = 0;

  /** Keep lines down for `secs` (a moment on screen that text must not sit over); a line up is cut as by a fight. */
  hold(secs: number): void {
    this.holdT = Math.max(this.holdT, secs);
  }

  /** A new line (it replaces the one up). */
  show(text: string): void {
    this.text = text;
    this.t = -1;
    this.cutA = 0;
  }

  /** Forget it (a load). */
  clear(): void {
    this.t = 1e6;
    this.cutA = 0;
    this.holdT = 0;
  }

  /** Advances `dt` s with a fight near or not; returns the line's alpha (0..1). */
  update(dt: number, fightNow: boolean): number {
    const L = LINE_TIME;
    const fight = fightNow || this.holdT > 0;
    this.holdT = Math.max(0, this.holdT - dt);
    if (this.cutA > 0) {
      // A fight came while it was up: it goes over `cut` s, and comes back whole after the fight if it was cut in
      // its first half.
      this.cutA = Math.max(0, this.cutA - dt / L.cut);
      if (this.cutA > 0) return this.cutA;
      this.t = this.t < L.in + L.hold / 2 ? -1 : 1e6;
      return 0;
    }
    if (this.t < 0) {
      if (fight) return 0;
      this.t = 0;
    } else if (fight && this.alphaAt(this.t) > 0) {
      this.cutA = this.alphaAt(this.t);
      return this.cutA;
    }
    this.t += dt;
    return this.alphaAt(this.t);
  }

  /** The alpha `t` s into a line. */
  private alphaAt(t: number): number {
    const L = LINE_TIME;
    if (t < 0) return 0;
    if (t < L.in) return t / L.in;
    if (t < L.in + L.hold) return 1;
    if (t < L.in + L.hold + L.out) return 1 - (t - L.in - L.hold) / L.out;
    return 0;
  }
}
