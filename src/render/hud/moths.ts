/**
 * The moths she has freed (`save.moths`), a small count in the top-left corner under her lights (the
 * curious first-timer: "freed moths change nothing I can see, and there's no counter"). On a trap's release the
 * count ticks once per freed moth as they leave her for the moon (the timeline in lantern/release.ts); on any other
 * snuff a few small moths leave the flame's place on screen and fly into the count.
 *
 * The Canopy r11 (review r10 #8: "30 / 60" read as thirty of sixty moths): the number is the freed count alone. Under
 * it a small lantern pip fills toward the next light the moths buy (`health.mothMilestones`), with no second number.
 * The area's tally is the map's (render/map), not the HUD's.
 *
 * Shown on a snuff, a stone read and a rest, for a few seconds; otherwise away. Dark and small: a pale moth
 * chevron and thin serif digits, no box. Corner-anchored to the real view (any window shape); render
 * time only, seeds from counts (no Math.random). Reads the save and events; changes nothing.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { mothMilestone } from '../../sim/index';
import { tuning } from '../../sim/tuning';
import { STAGE_BEATS } from '../camera/stage-cam';
import type { CameraView, SimView, ViewSize } from '../contract';
import { releaseTicks } from '../lantern/release';

export const MOTHS_HUD = {
  /** The icon's centre from the view's top-left (logical px), and the gap to the number. */
  x: 52,
  y: 128,
  gap: 20,
  font: 26,
  /** Seconds: fade in, hold after the last change, fade out. */
  in: 0.25,
  hold: 4,
  out: 1,
  /** Moths that fly in on a snuff: at most this many (the rest tick at the end), first after `wait`, `every` apart. */
  fly: { max: 8, wait: 0.55, every: 0.11, secs: 1.15 },
  alpha: 0.85,
  /** The lantern pip under the count: its centre from the moth icon (px), its size, and its colours. */
  pip: { dx: 2, dy: 34, w: 9, h: 13, ink: 0xdfe6f2, fill: 0xffb85a, core: 0xffe2a8 },
};

/** The count as text: the freed moths alone, never "x / y" (review r10 #8). */
export function countText(moths: number): string {
  return String(Math.max(0, Math.round(moths)));
}

/** How full the lantern pip is: the share of the way from the last light the moths bought to the next (1 = none left). */
export function pipFill(moths: number, prev: number, next: number): number {
  if (next <= 0) return 1;
  return Math.min(1, Math.max(0, (moths - prev) / Math.max(1, next - prev)));
}

interface Flyer {
  x0: number;
  y0: number;
  t: number;
  /** Moths this one carries into the count. */
  n: number;
  seed: number;
}

/** A small hash in [0, 1). */
function h01(i: number): number {
  let h = Math.imul(i ^ 0x2545f491, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export class MothCount {
  readonly root = new Container({ label: 'hud-moths' });
  private readonly g = new Graphics();
  private readonly num: Text;
  private shown = -1;
  /** A release's ticks still to come: seconds until each (render time). */
  private readonly ticks: number[] = [];
  /** The pip's flash when a light is bought (1 -> 0). */
  private bought = 0;
  private hold = 0;
  private alpha = 0;
  private pop = 0;
  private readonly flyers: Flyer[] = [];
  private seed = 0;

  constructor(family: string) {
    const style = { fontFamily: family, fontSize: MOTHS_HUD.font, fill: 0xdfe6f2 };
    this.num = new Text({ text: '0', style, resolution: 2 });
    this.num.anchor.set(0, 0.5);
    this.root.addChild(this.g, this.num);
    this.root.visible = false;
  }

  /** `cam`: the view the world was drawn with (to find the flame on screen). */
  update(dt: number, clock: number, sim: SimView, view: ViewSize, cam: CameraView, below: number): void {
    const M = MOTHS_HUD;
    const save = sim.save;
    const target = save.moths;
    if (this.shown < 0 || this.shown > target + this.inFlight()) {
      this.shown = target;
      this.flyers.length = 0;
      this.ticks.length = 0;
    }
    const ix = view.left + M.x;
    const iy = view.top + M.y + below;
    for (const e of sim.events) {
      if (e.type === 'lureSnuff' && e.moths > 0 && (e as { trap?: boolean }).trap) {
        // A trap's release: one tick per moth as they leave her (release.ts).
        for (const t of releaseTicks(e.moths)) this.ticks.push(t);
        this.ticks.sort((a, b) => a - b);
        this.hold = Math.max(this.hold, M.hold);
      } else if (e.type === 'lureSnuff' && e.moths > 0) {
        const sx = 960 + (e.x - cam.x) * cam.zoom;
        const sy = 540 + (e.y - cam.y) * cam.zoom;
        const k = Math.min(M.fly.max, e.moths);
        for (let i = 0; i < k; i++)
          this.flyers.push({
            x0: sx,
            y0: sy,
            t: -(M.fly.wait + i * M.fly.every),
            n: i === k - 1 ? e.moths - (k - 1) : 1,
            seed: this.seed++,
          });
      } else if (e.type === 'stoneRead' || e.type === 'patchRest') this.hold = Math.max(this.hold, M.hold);
      // (The sim's milestone: a light more. The count holds up and pops; her lights grow by one themselves.)
      else if (e.type === 'healthUp') {
        this.hold = Math.max(this.hold, M.hold + 2);
        this.pop = 1.8;
      }
    }
    // Anything not yet accounted for by a flyer (a load, a count from elsewhere) is shown at once.
    if (this.shown + this.inFlight() < target) this.shown = target - this.inFlight();
    const g = this.g.clear();
    // A release's ticks.
    for (let i = 0; i < this.ticks.length; i++) this.ticks[i] = (this.ticks[i] as number) - dt;
    while (this.ticks.length && (this.ticks[0] as number) <= 0) {
      this.ticks.shift();
      this.tick(1);
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i] as Flyer;
      f.t += dt;
      if (f.t < 0) continue;
      const u = Math.min(1, f.t / M.fly.secs);
      if (u >= 1) {
        this.tick(f.n);
        this.flyers.splice(i, 1);
        continue;
      }
      // A curve up and over into the count, quickening; the moth shrinks as it arrives.
      const e = u * u * (3 - 2 * u);
      const side = (h01(f.seed) - 0.5) * 260;
      const x = f.x0 + (ix - f.x0) * e + Math.sin(Math.PI * u) * side;
      const y = f.y0 + (iy - f.y0) * e - Math.sin(Math.PI * u) * (120 + 80 * h01(f.seed + 7));
      this.moth(g, x, y, Math.sin(clock * 26 + f.seed), 1 - 0.4 * u, 0.9);
    }
    // The finale (every moth she freed lifting off the crown): the count stays up the whole while.
    if (STAGE_BEATS.finale >= 0 && STAGE_BEATS.finale < 12) this.hold = Math.max(this.hold, 1);
    this.hold -= dt;
    const want = this.hold > 0 && this.shown > 0 ? 1 : 0;
    this.alpha = Math.min(1, Math.max(0, this.alpha + (want > this.alpha ? dt / M.in : -dt / M.out)));
    this.pop *= Math.exp(-dt * 8);
    const a = this.alpha * this.alpha * (3 - 2 * this.alpha);
    // The count itself: a pale moth and the number.
    if (a > 0.003) this.moth(g, ix, iy, 0.6 + 0.4 * Math.sin(clock * 3), 1.15 + 0.3 * this.pop, M.alpha * a);
    this.num.text = countText(this.shown);
    this.num.position.set(ix + M.gap, iy);
    this.num.scale.set(1 + 0.25 * this.pop);
    this.num.alpha = M.alpha * a;
    this.num.visible = a > 0.003;
    // The lantern pip: fills toward the next light the moths buy; flashes full as one is bought.
    const ms = mothMilestone(tuning, this.shown);
    this.bought *= Math.exp(-dt * 2.5);
    if (a > 0.003 && (ms.next > 0 || this.bought > 0.05))
      this.pip(
        g,
        ix + M.pip.dx,
        iy + M.pip.dy,
        Math.max(pipFill(this.shown, ms.prev, ms.next), this.bought),
        clock,
        a,
      );
    this.root.visible = a > 0.003 || this.flyers.length > 0;
  }

  private inFlight(): number {
    let n = this.ticks.length;
    for (const f of this.flyers) n += f.n;
    return n;
  }

  /** The count goes up by `n` (a moth arriving, a release's tick): a pop, and a bigger one when a light is bought. */
  private tick(n: number): void {
    const before = this.shown;
    this.shown += n;
    this.pop = Math.max(this.pop, 0.6);
    if (mothMilestone(tuning, this.shown).lights > mothMilestone(tuning, before).lights) {
      this.pop = 1.8;
      this.bought = 1;
      this.hold = Math.max(this.hold, MOTHS_HUD.hold + 2);
    }
    // The count shows itself when the first moth reaches it (feel review r2: not a "0" before).
    this.hold = Math.max(this.hold, MOTHS_HUD.hold);
  }

  /** The lantern pip: a small seed-pod lantern, its outline pale, lit from the bottom to `k` of its height. */
  private pip(g: Graphics, x: number, y: number, k: number, clock: number, alpha: number): void {
    const P = MOTHS_HUD.pip;
    const pts: number[] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = P.w * Math.sin(Math.PI * t ** 0.8);
      pts.push(x + w, y - P.h + 2 * P.h * t);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const w = P.w * Math.sin(Math.PI * t ** 0.8);
      pts.push(x - w, y - P.h + 2 * P.h * t);
    }
    g.poly(pts).fill({ color: 0x0a0d14, alpha: 0.45 * alpha });
    if (k > 0.001) {
      // The lit part: the pod clipped to below the fill line (it is convex: drop the points above, close on the line).
      const cut = y + P.h - 2 * P.h * k;
      const lit: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i] as number;
        const py = pts[i + 1] as number;
        const nx = pts[(i + 2) % pts.length] as number;
        const ny = pts[(i + 3) % pts.length] as number;
        if (py >= cut) lit.push(px, py);
        if (py >= cut !== ny >= cut) {
          const u = (cut - py) / (ny - py);
          lit.push(px + (nx - px) * u, cut);
        }
      }
      const flick = 0.85 + 0.15 * Math.sin(clock * 7.3);
      if (lit.length >= 6) g.poly(lit).fill({ color: P.fill, alpha: 0.85 * alpha * flick });
      g.circle(x, y + P.h * 0.35, 2.4 * Math.min(1, k * 3)).fill({ color: P.core, alpha: 0.9 * alpha });
    }
    g.poly(pts).stroke({ color: P.ink, width: 1.4, alpha: 0.7 * alpha });
    // Its stem.
    g.moveTo(x, y - P.h)
      .lineTo(x, y - P.h - 5)
      .stroke({ color: P.ink, width: 1.2, alpha: 0.6 * alpha });
  }

  /** A moth: a chevron whose wings beat (the greybox freed moths' look). */
  private moth(g: Graphics, x: number, y: number, beat: number, scale: number, alpha: number): void {
    const span = (6 + 1.5 * Math.abs(beat)) * scale;
    const lift = (2 + 5 * beat) * scale;
    g.moveTo(x - span, y - lift)
      .lineTo(x, y + 2 * scale)
      .lineTo(x + span, y - lift)
      .stroke({ color: 0xe8ecf6, width: 2.5 * scale, alpha, join: 'round', cap: 'round' });
    g.circle(x, y + scale, 2.2 * scale).fill({ color: 0xe8ecf6, alpha });
  }
}
