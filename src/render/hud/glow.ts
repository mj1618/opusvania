/**
 * Lanternroot's glow on the HUD (docs/design/levels/proto-1.md §3, memory/glow.md, memory/lanternroot-art.md): a
 * row of small glass beads under her health lights, one per pip (3 sparks), dark and subtle. A bead fills in
 * thirds as sparks come; a full pip brightens; when the meter is full the last bead rings (a brief bloom).
 * Spending (a mend, a kindle) drains beads from the right with a flicker. Only in rooms that play the glow
 * (`scene.glow`); everywhere else it is not there at all.
 *
 * Reads `player.glow` (loosely: the level's sim field) and the events `glowGain` / `glowSpend`. Vector, in the
 * HUD's logical units (never post-processed), corner-anchored with the health lights.
 */
import { Container, Graphics } from 'pixi.js';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';

export const GLOW_HUD = {
  /** The first bead's centre (logical px from the cluster's top left) and the spacing. */
  x: 66,
  y: 96,
  step: 20,
  /** Bead radius, ring width. */
  r: 6.2,
  ring: 1.4,
  /** Sparks per bead. */
  pip: 3,
  glass: 0x0f1820,
  ring0: 0x55687a,
  lit: 0xcfe4ff,
  core: 0xffffff,
  glow: 0x9fc4f0,
  /** Seconds a bead's flash lasts; how fast the shown value follows the real one (sparks per s). */
  flash: 0.35,
  follow: 22,
  /** Its alpha at rest, and while something is happening (a gain, a spend, a mend). */
  rest: 0.7,
  busy: 1,
} as const;

export class GlowMeter {
  readonly root = new Container({ label: 'hud-glow' });
  private readonly g = new Graphics();
  private shown = -1;
  private readonly flashT: number[] = [];
  private ringT = -1;
  private busy = 0;

  constructor() {
    this.root.addChild(this.g);
  }

  update(dt: number, clock: number, sim: SimView): void {
    const on = (sim.scene as { glow?: boolean }).glow === true;
    this.root.visible = on;
    if (!on) return;
    const p = sim.player as unknown as { glow?: number; mend?: number };
    const glow = Math.max(0, p.glow ?? 0);
    // The meter's size: the sim's max (a vessel raises it); the events say it when it changes.
    let max = this.max > 0 ? this.max : ((tuning as { glow?: { max?: number } }).glow?.max ?? 18);
    for (const e of sim.events) {
      const ev = e as unknown as { type: string; max?: number; n?: number };
      if (ev.type === 'glowGain') {
        if (ev.max) max = ev.max;
        this.busy = 1.6;
        // Each pip filled by this gain flashes.
        const before = Math.floor(Math.max(0, this.shown) / GLOW_HUD.pip);
        const after = Math.floor(glow / GLOW_HUD.pip);
        for (let k = before; k < after; k++) this.flashT[k] = 0;
        if (glow >= max && this.shown < max) this.ringT = 0;
      } else if (ev.type === 'glowSpend') this.busy = 1.6;
    }
    this.max = max;
    if (this.shown < 0 || sim.frame === 0) this.shown = glow;
    const d = glow - this.shown;
    this.shown += Math.sign(d) * Math.min(Math.abs(d), dt * GLOW_HUD.follow);
    if ((p.mend ?? 0) > 0) this.busy = 1;
    this.busy = Math.max(0, this.busy - dt);
    this.root.alpha = GLOW_HUD.rest + (GLOW_HUD.busy - GLOW_HUD.rest) * Math.min(1, this.busy);
    const G = GLOW_HUD;
    const beads = Math.max(1, Math.round(this.max / G.pip));
    const g = this.g.clear();
    for (let k = 0; k < beads; k++) {
      const x = G.x + k * G.step;
      const y = G.y + (k % 2) * 1.5;
      const fill = Math.max(0, Math.min(1, (this.shown - k * G.pip) / G.pip));
      const ft = this.flashT[k];
      const flash = ft === undefined ? 0 : Math.max(0, 1 - ft / G.flash);
      if (ft !== undefined) this.flashT[k] = ft + dt;
      // The bead: dark glass, a fine ring; its light grows in thirds; a full one glows.
      g.circle(x, y, G.r + 3).fill({ color: 0x000000, alpha: 0.35 });
      g.circle(x, y, G.r).fill({ color: G.glass, alpha: 0.85 });
      g.circle(x, y, G.r).stroke({ color: G.ring0, width: G.ring, alpha: 0.7 });
      if (fill > 0) {
        const full = fill >= 0.999;
        const rr = G.r * (0.35 + 0.55 * fill);
        if (full) g.circle(x, y, G.r * 2.1 + flash * 6).fill({ color: G.glow, alpha: 0.12 + 0.3 * flash });
        g.circle(x, y, rr).fill({ color: G.lit, alpha: full ? 0.95 : 0.55 });
        g.circle(x - rr * 0.25, y - rr * 0.3, rr * 0.4).fill({ color: G.core, alpha: full ? 0.9 : 0.4 });
      }
    }
    // Full: the last bead rings once (a bell's bloom), then breathes softly.
    if (this.ringT >= 0) {
      this.ringT += dt;
      const u = this.ringT / 0.7;
      if (u >= 1) this.ringT = -1;
      else {
        const x = G.x + (beads - 1) * G.step;
        g.circle(x, G.y, G.r + 22 * u).stroke({ color: G.lit, width: 2 * (1 - u), alpha: 0.9 * (1 - u) });
      }
    }
    if (this.shown >= this.max - 0.01) {
      const x = G.x + (beads - 1) * G.step;
      g.circle(x, G.y, G.r * 1.8).fill({ color: G.glow, alpha: 0.1 + 0.06 * Math.sin(clock * 2.4) });
    }
  }

  /** The meter's size in sparks (the sim's `glow.max` unless a vessel raised it); 0 until first read. */
  private max = 0;
}
