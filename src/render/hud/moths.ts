/**
 * The moths she has freed (`save.moths`), a small count in the top-left corner under her lights (the
 * curious first-timer: "freed moths change nothing I can see, and there's no counter"). On a snuff a few
 * small moths leave the flame's place on screen and fly into the count; each one that arrives ticks it up.
 * Once she has read an area's moth-stone, a second line under it: that area's lamps put out of all of them.
 *
 * Shown on a snuff, a stone read and a rest, for a few seconds; otherwise away. Dark and small: pale moth
 * chevrons and thin serif digits, no box. Corner-anchored to the real view (any window shape); render
 * time only, seeds from counts (no Math.random). Reads the save and events; changes nothing.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { getRoom, WORLD } from '../../scene/index';
import type { CameraView, SimView, ViewSize } from '../contract';

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
};

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
  private readonly lamps: Text;
  private shown = -1;
  private hold = 0;
  private alpha = 0;
  private pop = 0;
  private readonly flyers: Flyer[] = [];
  private seed = 0;
  private areaKey = '';
  private area: { out: number; total: number } | null = null;

  constructor(family: string) {
    const style = { fontFamily: family, fontSize: MOTHS_HUD.font, fill: 0xdfe6f2 };
    this.num = new Text({ text: '0', style, resolution: 2 });
    this.num.anchor.set(0, 0.5);
    this.lamps = new Text({ text: '', style: { ...style, fontSize: 18, fill: 0xb8c2d6 }, resolution: 2 });
    this.lamps.anchor.set(0, 0.5);
    this.root.addChild(this.g, this.num, this.lamps);
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
    }
    const ix = view.left + M.x;
    const iy = view.top + M.y + below;
    for (const e of sim.events) {
      if (e.type === 'lureSnuff' && e.moths > 0) {
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
    }
    // Anything not yet accounted for by a flyer (a load, a count from elsewhere) is shown at once.
    if (this.shown + this.inFlight() < target) this.shown = target - this.inFlight();
    const g = this.g.clear();
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i] as Flyer;
      f.t += dt;
      if (f.t < 0) continue;
      const u = Math.min(1, f.t / M.fly.secs);
      if (u >= 1) {
        this.shown += f.n;
        this.pop = 1;
        // The count shows itself when the first moth reaches it (feel review r2: not a "0" before).
        this.hold = Math.max(this.hold, M.hold);
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
    this.hold -= dt;
    const want = this.hold > 0 && this.shown > 0 ? 1 : 0;
    this.alpha = Math.min(1, Math.max(0, this.alpha + (want > this.alpha ? dt / M.in : -dt / M.out)));
    this.pop *= Math.exp(-dt * 8);
    const a = this.alpha * this.alpha * (3 - 2 * this.alpha);
    // The count itself: a pale moth and the number.
    if (a > 0.003) this.moth(g, ix, iy, 0.6 + 0.4 * Math.sin(clock * 3), 1.15 + 0.3 * this.pop, M.alpha * a);
    this.num.text = String(this.shown);
    this.num.position.set(ix + M.gap, iy);
    this.num.scale.set(1 + 0.25 * this.pop);
    this.num.alpha = M.alpha * a;
    this.num.visible = a > 0.003;
    // The area's lamps, once its moth-stone has been read.
    const key = `${sim.scene.id}|${sim.save.snuffed.length}|${sim.save.taken.length}`;
    if (key !== this.areaKey) {
      this.areaKey = key;
      this.area = this.areaOf(sim);
    }
    const area = this.area;
    if (area && a > 0.003) {
      this.lamps.text = `lamps ${area.out} / ${area.total}`;
      this.lamps.position.set(ix - 10, iy + 34);
      this.lamps.alpha = 0.75 * a;
      this.lamps.visible = true;
    } else this.lamps.visible = false;
    this.root.visible = a > 0.003 || this.flyers.length > 0;
  }

  private inFlight(): number {
    let n = 0;
    for (const f of this.flyers) n += f.n;
    return n;
  }

  /** The area of the room she is in, if its moth-stone has been read: lamps out of all its lamps. */
  private areaOf(sim: SimView): { out: number; total: number } | null {
    const save = sim.save;
    const a = WORLD.areas.find((x) => x.rooms.includes(sim.scene.id));
    if (!a) return null;
    let read = false;
    let total = 0;
    let out = 0;
    for (const id of a.rooms) {
      let room: ReturnType<typeof getRoom>;
      try {
        room = getRoom(id);
      } catch {
        continue;
      }
      for (const m of room.mothStones ?? []) if (save.taken.includes(`${id}:${m.id}`)) read = true;
      for (const l of room.lures ?? []) {
        total++;
        if (save.snuffed.includes(`${id}:${l.id}`)) out++;
      }
    }
    return read ? { out, total } : null;
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
