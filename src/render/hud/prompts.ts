/**
 * The two things the grove cannot teach by itself, said once, quietly (playtest 3: her wings
 * flutter on a long fall, which says "wings", not "hold"; a tapper never found the glide):
 *
 *  - the glide: only over a REAL fall (playtest 4: it came up after landings, in fights and on
 *    island hops): she has fallen `fallFrames` without gliding, or has just run off a ledge, AND the
 *    ground is more than `dropPx` under her feet both where she is and where she is heading, AND no
 *    creature is within `creaturePx`. The jump key's cap stands beside her HELD from its first
 *    frame: pressed down, a bar under it filling for as long as it is held, two wing strokes open
 *    either side. It goes the instant she lands, and for good once she has glided.
 *  - the wall kick: on a wall slide that has lasted `slideFrames` (a few frames: every hand kicked
 *    before the old 24), the same cap, TAPPED, with a small stroke up and away from the bark. Gone
 *    for good after her first wall jump. (Walls that take no kick give no slide: the sim's `kick: false`.)
 *  - the offer (memory/giving.md; playtest-giving: nothing in the world prompted V, the natural run
 *    never pressed it): the offer key's cap, TAPPED, beside her, while a press would land on a
 *    creature that is aware of her (the sim's `player.offerTarget`: round 3, so a press never meets
 *    "nothing in reach"). Gone for good once a gift has landed (`enemyGift`); after `offerShows`
 *    showings with no press she is not nagged again until her next fade.
 *
 * "For good" is kept in localStorage (try / catch: private windows have none). In `?manual` (the
 * capture tools, the tests) nothing shows and the storage is not touched, so shots stay clean;
 * `__prompts.enabled = true` turns them on there, `__prompts.reset()` forgets what she has learned.
 *
 * Drawn in the HUD's own way: pale line work on a soft dark seat, painted once, no box of text.
 * The HUD has no camera; where she is on screen comes from `hudLink` (the goal renderer).
 */
import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { SimView } from '../contract';
import { VIEW_H, VIEW_W } from '../contract';
import { hudLink } from './link';

export const PROMPTS = {
  /** Frames of plain falling (not gliding, not hurt) before the glide's key shows; the wings' own flutter starts at 14. */
  fallFrames: 12,
  /** ...and she must be this far under the top of her arc, px (a hop on the flat never asks). */
  fallPx: 40,
  /** ...with the ground more than this far under her feet, px, here and `aheadFrames` of travel ahead. */
  dropPx: 260,
  aheadFrames: 16,
  /** ...and no living creature within this, px. */
  creaturePx: 300,
  /**
   * ...and never in a climb (playtest 5: five times in 3 s between kicks up the shaft, and stepping
   * off trunk A into the shaft she had to climb): not for `afterWall` frames after a wall slide or a
   * wall kick, and not in a chimney: bark within `chimneyPx` of her box on BOTH sides, anywhere
   * from her head to `chimneyBelow` px under her feet. Above the summit there is no bark beside
   * her, so the glide off the top is still taught.
   */
  afterWall: 90,
  chimneyPx: 236,
  chimneyBelow: 150,
  /**
   * ...nor anywhere in the wall-jump shaft below the summit, where the upper part has bark on one
   * side only: [x from, x to, the summit's y]. Scene data by hand: if trunk A or B moves, move it.
   */
  shafts: [[3328, 3584, 192]],
  /** The offer's lesson: showings with no press between them before it rests until her next fade. */
  offerShows: 5,
  /** The kick's cap is drawn this much larger than the glide's (27 px at 1920 was small). */
  kickScale: 1.28,
  /** Frames of one wall slide before the kick's key shows. */
  slideFrames: 6,
  /** Seconds: fade in, how long it stays after the fall / slide ends (glide, kick), fade out; and once she has done it. */
  fadeIn: 0.1,
  linger: 0.2,
  lingerKick: 0.7,
  fadeOut: 0.3,
  learned: 0.35,
  /** Where it stands from her body centre, world px (x to the side away from the wall for the kick). */
  dx: 62,
  dy: -66,
  /** Cap half-size, logical px. */
  cap: 13.5,
  /** The hold: seconds per loop, pressed from..to (of the loop), how far the cap sinks px. */
  holdLoop: 2.2,
  holdDown: [0.0, 0.9],
  /** The tap: seconds per loop, pressed for this share of it. */
  tapLoop: 0.95,
  tapDown: 0.24,
  sink: 2.6,
  alpha: 0.92,
  family: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  storage: 'opusvania.taught',
};

const RES = 4;
const CELL = 72;
const PALE = 'rgba(226, 236, 240, 0.94)';
const PALE_N = 0xe2ecf0;

type Lesson = 'glide' | 'kick' | 'offer';
/** The keys of the offer (src/input/bindings.ts) and the letter on their cap. */
const OFFER_KEYS: Record<string, string> = { KeyV: 'V', KeyF: 'F', KeyI: 'I' };

/** A key cap with its letter (or the space bar's mark), pale on a soft dark seat. `wide` = half-width px. */
function paintCap(label: string, wide: number): Texture {
  const P = PROMPTS;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * RES;
  canvas.height = CELL * RES;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(RES, RES);
    g.translate(CELL / 2, CELL / 2);
    const r = P.cap;
    const box = (): void => {
      g.beginPath();
      g.roundRect(-wide, -r, wide * 2, r * 2, 4.5);
    };
    g.save();
    g.shadowColor = 'rgba(2, 10, 16, 0.9)';
    g.shadowBlur = 8 * RES;
    g.fillStyle = 'rgba(4, 14, 22, 0.66)';
    box();
    g.fill();
    g.restore();
    g.strokeStyle = PALE;
    g.lineWidth = 1.15;
    box();
    g.stroke();
    if (label === ' ') {
      // The space bar: a shallow bracket.
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-wide + 7, 0.5);
      g.lineTo(-wide + 7, 4);
      g.lineTo(wide - 7, 4);
      g.lineTo(wide - 7, 0.5);
      g.stroke();
    } else {
      g.font = `500 15.5px ${P.family}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillStyle = PALE;
      g.fillText(label, 0, 5.4);
    }
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGenerateMipmaps: true });
  source.scaleMode = 'linear';
  return new Texture({ source });
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How far the ground is under her feet, px: the nearest top (solid, pool or branch) under her box,
 * here and `ahead` frames of her sideways travel on (the smaller of the two: a hop that will land
 * on an island is not a fall). The scene's floor if there is nothing.
 */
function dropUnder(sim: SimView, ahead: number, only = false): number {
  const p = sim.player;
  const scene = sim.scene;
  const feet = p.feetY;
  const under = (x0: number, x1: number): number => {
    let top = scene.height;
    for (const r of scene.solids) if (r.x < x1 && r.x + r.w > x0 && r.y >= feet - 4) top = Math.min(top, r.y);
    for (const r of scene.oneWays)
      if (r.x < x1 && r.x + r.w > x0 && r.y >= feet - 4) top = Math.min(top, r.y);
    return top - feet;
  };
  const x = p.cx - p.w / 2;
  const dx = p.vx * ahead;
  // `only`: just where she is heading (as she steps off a ledge her box is still over it).
  const a = under(x + dx, x + dx + p.w);
  return only ? a : Math.min(under(x, x + p.w), a);
}

/** She is between two walls a kick apart (the wall-jump shaft): solids on both sides of her box within `px`. */
function inChimney(sim: SimView, px: number, below: number): boolean {
  const p = sim.player;
  const top = p.feetY - p.h;
  const bottom = p.feetY + below;
  const x0 = p.cx - p.w / 2;
  const x1 = p.cx + p.w / 2;
  let left = false;
  let right = false;
  for (const r of sim.scene.solids) {
    if (r.y >= bottom || r.y + r.h <= top) continue;
    if (r.x + r.w <= x0 + 2 && x0 - (r.x + r.w) < px) left = true;
    else if (r.x >= x1 - 2 && r.x - x1 < px) right = true;
  }
  if (left && right) return true;
  for (const z of PROMPTS.shafts)
    if (p.cx > (z[0] ?? 0) && p.cx < (z[1] ?? 0) && p.feetY > (z[2] ?? 0) + 8) return true;
  return false;
}

/** A press of offer would land on a creature now (`player.offerTarget`), and it is aware of her. */
function giftReady(sim: SimView): boolean {
  const to = sim.player.offerTarget;
  if (!to || (to.kind !== 'burrback' && to.kind !== 'lampwing')) return false;
  for (const e of sim.enemies ?? []) if (e.id === to.id) return e.aware > 0;
  return false;
}

function creatureNear(sim: SimView, px: number): boolean {
  const p = sim.player;
  for (const e of sim.enemies ?? []) {
    if (e.mode === 'dead' || e.gone) continue;
    if (Math.hypot(e.x + e.w / 2 - p.cx, e.y + e.h / 2 - p.cy) < px) return true;
  }
  return false;
}

export class Prompts {
  readonly root = new Container({ label: 'hud-prompts' });
  /** Off in `?manual` (captures, tests). */
  enabled = true;
  readonly taught: Record<Lesson, boolean> = { glide: false, kick: false, offer: false };
  private readonly store: boolean;
  private readonly caps = new Map<string, Texture>();
  private readonly cap = new Sprite();
  /** The cap's lower lip (it stays while the cap sinks onto it), the line of a hold, the wings, the kick's stroke. */
  private readonly lip = new Graphics();
  private readonly bar = new Graphics();
  private readonly wings: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private readonly away = new Graphics();
  /** The jump key she last pressed (a `KeyboardEvent.code`); Z until she has pressed one. */
  private key = 'KeyZ';
  /** The offer key she last pressed; V until she has pressed one. */
  private offerKey = 'KeyV';
  /** Showings of the offer's cap since her last press; at `offerShows` it rests (`offerRest`) until she fades. */
  private offerShown = 0;
  private offerRest = false;
  private offerWas = false;
  private shownKey = '';
  private frame = -1;
  private fall = 0;
  private slide = 0;
  /** Sim frames since she last slid on or kicked off a wall (large = long ago). */
  private sinceWall = 1e6;
  /** She left the ground without a jump, over a real drop (cleared when she lands). */
  private ranOff = false;
  private lesson: Lesson | null = null;
  private alpha = 0;
  private linger = 0;
  private t = 0;
  private x = 0;
  private y = 0;
  private side = 1;

  constructor() {
    let manual = false;
    try {
      manual = new URLSearchParams(window.location.search).has('manual');
    } catch {
      manual = true;
    }
    this.enabled = !manual;
    this.store = !manual;
    if (this.store) {
      try {
        const raw = window.localStorage.getItem(PROMPTS.storage);
        const got = raw ? (JSON.parse(raw) as Partial<Record<Lesson, boolean>>) : {};
        this.taught.glide = got.glide === true;
        this.taught.kick = got.kick === true;
        this.taught.offer = got.offer === true;
      } catch {
        // No storage: she is taught once per visit.
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'KeyK') this.key = e.code;
        else if (OFFER_KEYS[e.code]) this.offerKey = e.code;
      });
      (window as unknown as { __prompts?: Prompts }).__prompts = this;
    }
    this.cap.anchor.set(0.5);
    for (const side of [-1, 1] as const) {
      // A small wing: two strokes fanning up and out from beside the cap.
      const w = this.wings[side < 0 ? 0 : 1];
      w.moveTo(0, 2)
        .bezierCurveTo(side * 5, -6, side * 13, -9, side * 17, -5)
        .stroke({ width: 1.15, color: PALE_N, alpha: 0.9, cap: 'round' });
      w.moveTo(0, 2)
        .bezierCurveTo(side * 6, 0, side * 11, 1, side * 13, 4)
        .stroke({ width: 1, color: PALE_N, alpha: 0.6, cap: 'round' });
    }
    // Up and away: a short stroke with a barb.
    this.away
      .moveTo(0, 0)
      .lineTo(9, -11)
      .moveTo(3.4, -10.4)
      .lineTo(9, -11)
      .lineTo(8.8, -5.4)
      .stroke({ width: 1.2, color: PALE_N, alpha: 0.92, cap: 'round', join: 'round' });
    this.root.addChild(this.lip, this.bar, this.wings[0], this.wings[1], this.away, this.cap);
    this.root.visible = false;
  }

  /** Forgets what she has learned (dev). */
  reset(): void {
    this.taught.glide = false;
    this.taught.kick = false;
    this.taught.offer = false;
    this.offerShown = 0;
    this.offerRest = false;
    this.save();
  }

  private save(): void {
    if (!this.store) return;
    try {
      window.localStorage.setItem(PROMPTS.storage, JSON.stringify(this.taught));
    } catch {
      // Not kept: it will be said again next visit.
    }
  }

  private learn(l: Lesson): void {
    if (this.taught[l]) return;
    this.taught[l] = true;
    this.save();
  }

  update(dt: number, _clock: number, sim: SimView): void {
    const P = PROMPTS;
    const p = sim.player;
    // What she has done counts whether or not anything is shown.
    const drop = dropUnder(sim, P.aheadFrames);
    for (const e of sim.events) {
      if (e.type === 'glideStart') this.learn('glide');
      else if (e.type === 'jump' && e.kind === 'wall') {
        this.learn('kick');
        this.sinceWall = 0;
      } else if (e.type === 'fall') this.ranOff = dropUnder(sim, P.aheadFrames, true) > P.dropPx;
      else if (e.type === 'jump') this.ranOff = false;
      else if (e.type === 'enemyGift') this.learn('offer');
      else if (e.type === 'offer' || e.type === 'offerMiss') this.offerShown = 0;
      else if (e.type === 'fade') {
        this.offerShown = 0;
        this.offerRest = false;
      }
    }
    if (p.grounded) this.ranOff = false;
    const df = this.frame < 0 || sim.frame < this.frame ? 0 : Math.min(4, sim.frame - this.frame);
    this.frame = sim.frame;
    const free = p.faded <= 0 && p.stagger <= 0 && !sim.goal.gathered;
    const falling = free && !p.grounded && p.mode === 'normal' && !p.gliding && p.vy > 1.5;
    this.fall = falling ? this.fall + df : 0;
    this.slide = free && p.mode === 'wallSlide' ? this.slide + df : 0;
    this.sinceWall = p.mode === 'wallSlide' ? 0 : Math.min(1e6, this.sinceWall + df);
    if (sim.frame < 2) this.sinceWall = 1e6;

    let want: Lesson | null = null;
    if (this.enabled && hudLink.on) {
      if (!this.taught.kick && this.slide >= P.slideFrames) want = 'kick';
      else if (!this.taught.offer && !this.offerRest && free && giftReady(sim)) want = 'offer';
      else if (
        !this.taught.glide &&
        falling &&
        (drop > P.dropPx || (this.ranOff && this.fall < P.fallFrames)) &&
        (this.ranOff || (this.fall >= P.fallFrames && p.y - p.airTopY >= P.fallPx)) &&
        this.sinceWall > P.afterWall &&
        !inChimney(sim, P.chimneyPx, P.chimneyBelow) &&
        !creatureNear(sim, P.creaturePx)
      )
        want = 'glide';
    }
    // A new showing of the offer's cap; after `offerShows` of them unanswered it rests until a fade.
    // (A showing = the cap coming up from nothing: a flicker of the target inside one does not count.)
    if (want === 'offer' && !this.offerWas && (this.lesson !== 'offer' || this.alpha <= 0.003)) {
      if (this.offerShown >= P.offerShows) {
        this.offerRest = true;
        want = null;
      } else this.offerShown++;
    }
    this.offerWas = want === 'offer';
    // The glide's key goes the instant she lands (it used to linger 1.3 s over nothing).
    if (this.lesson === 'glide' && (p.grounded || p.mode === 'wallSlide')) {
      this.linger = 0;
      this.alpha = 0;
    }
    if (want) {
      if (this.lesson !== want || this.alpha <= 0.003) {
        // New: it stands where she is at once.
        if (this.lesson !== want) this.t = 0;
        // A hold is seen held from its first frame: it starts pressed, the bar a third full.
        if (want === 'glide') this.t = P.holdLoop * 0.3;
        this.lesson = want;
        this.side = want === 'kick' ? (p.wallDir > 0 ? -1 : 1) : 1;
        if (this.alpha <= 0.003) this.place(1);
      }
      this.linger = want === 'glide' ? P.linger : P.lingerKick;
    } else this.linger -= dt;
    const done = this.lesson !== null && this.taught[this.lesson];
    const on = this.lesson !== null && !done && this.linger > 0 && this.enabled;
    this.alpha = Math.min(
      1,
      Math.max(0, this.alpha + (on ? dt / P.fadeIn : -dt / (done ? P.learned : P.fadeOut))),
    );
    if (this.alpha <= 0.003) {
      this.root.visible = false;
      if (!on) this.lesson = null;
      return;
    }
    this.t += dt;
    this.place(Math.min(1, dt * 12));
    const a = this.alpha * this.alpha * (3 - 2 * this.alpha) * P.alpha;
    this.root.visible = true;
    this.root.alpha = a;
    this.root.position.set(Math.round(this.x * 2) / 2, Math.round(this.y * 2) / 2);
    this.root.scale.set(this.lesson === 'kick' ? P.kickScale : 1);

    // The cap for the key she uses (the jump's; the offer's on its lesson).
    const keyNow = this.lesson === 'offer' ? this.offerKey : this.key;
    if (this.shownKey !== keyNow) {
      this.shownKey = keyNow;
      const wide = keyNow === 'Space' ? P.cap * 2.3 : P.cap;
      let tex = this.caps.get(keyNow);
      if (!tex) {
        tex = paintCap(
          keyNow === 'Space' ? ' ' : (OFFER_KEYS[keyNow] ?? (keyNow === 'KeyK' ? 'K' : 'Z')),
          wide,
        );
        this.caps.set(keyNow, tex);
      }
      this.cap.texture = tex;
      this.lip
        .clear()
        .moveTo(-wide + 4, P.cap + 3.4)
        .lineTo(wide - 4, P.cap + 3.4)
        .stroke({ width: 1.1, color: PALE_N, alpha: 0.42, cap: 'round' });
    }
    const wide = keyNow === 'Space' ? P.cap * 2.3 : P.cap;
    const hold = this.lesson === 'glide';
    let down = 0;
    let held = 0;
    if (hold) {
      const ph = (this.t / P.holdLoop) % 1;
      const d0 = P.holdDown[0] as number;
      const d1 = P.holdDown[1] as number;
      down = smooth(d0, d0 + 0.05, ph) * (1 - smooth(d1, d1 + 0.05, ph));
      // How long it has been held, 0..1 of the press.
      held = down > 0 ? Math.min(1, Math.max(0, (ph - d0) / (d1 - d0))) : 0;
    } else {
      const ph = (this.t / P.tapLoop) % 1;
      down = smooth(0, 0.07, ph) * (1 - smooth(P.tapDown, P.tapDown + 0.1, ph));
      held = ph;
    }
    this.cap.y = P.sink * down;
    // Held: a bar under the key, there from the first frame, filling for as long as it is down.
    this.bar.visible = hold;
    if (hold) {
      const bw = wide + 7;
      const by = P.cap + 7.5;
      this.bar
        .clear()
        .roundRect(-bw, by, bw * 2, 5.4, 2.7)
        .fill({ color: 0x04101a, alpha: 0.6 })
        .stroke({ width: 1, color: PALE_N, alpha: 0.7 });
      const fillW = (bw * 2 - 2.4) * Math.min(1, held * 1.08);
      if (fillW > 1.2)
        this.bar
          .roundRect(-bw + 1.2, by + 1.2, fillW, 3, 1.5)
          .fill({ color: 0xffd9a0, alpha: 0.92 * down + 0.1 });
    }
    const open = hold ? (0.55 + 0.45 * smooth(0, 0.3, held)) * down : 0;
    for (const side of [-1, 1]) {
      const w = this.wings[side < 0 ? 0 : 1];
      w.visible = open > 0.01;
      w.alpha = open * 0.9;
      w.position.set(side * (wide + 6), P.sink * down - 3);
      w.scale.set(0.6 + 0.6 * open, 0.7 + 0.5 * open);
      w.rotation = side * (1 - open) * 0.7;
    }
    // Tapped at a wall: a stroke up and away from the bark, flicked on each press.
    const flick = this.lesson !== 'kick' ? 0 : smooth(0.02, 0.2, held) * (1 - smooth(0.45, 0.85, held));
    this.away.visible = flick > 0.01;
    this.away.alpha = flick;
    this.away.scale.set(this.side, 1);
    this.away.position.set(this.side * (wide + 6 + 5 * flick), -P.cap + 4 - 6 * flick);
  }

  /** Follows her (eased by `k`), kept inside the picture and clear of the bottom line. */
  private place(k: number): void {
    const P = PROMPTS;
    const z = hudLink.zoom;
    const tx = Math.min(VIEW_W - 60, Math.max(60, hudLink.x + this.side * P.dx * z));
    const ty = Math.min(VIEW_H - 80, Math.max(50, hudLink.y + P.dy * z));
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }
}
