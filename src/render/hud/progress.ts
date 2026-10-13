/**
 * The goal's progress in the HUD: three small standing crooks, one per moth-lantern, and after
 * them a bud for the heart of the grove. A crook is a cool outline until its lantern is kindled,
 * then gold with a bead in its seed; the bud opens when the heart wakes.
 *
 * They are line glyphs half the size of the health lights and stand in their own row under the
 * count (health hangs, these stand), so the two are never read as one. Shown only while it matters:
 * near a lantern or the heart, when one changes, for a few seconds after.
 *
 * Painted once into small canvases; animated on render time only.
 */
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { SimView } from '../contract';

export const PIPS = {
  /** Foot of the first crook, logical px from the row's left / top; distance between crooks. */
  x: 64,
  step: 36,
  /** The bud stands this much further on. */
  gap: 12,
  /** 1.15 with a 0.78 grey-blue line could not be read at a glance (playtest 2): now 1.8 and pale. */
  scale: 1.8,
  /** Seconds: fade in, fade out, stay after a change, stay after she leaves a lantern. */
  fadeIn: 0.2,
  fadeOut: 0.9,
  hold: 4.5,
  nearHold: 0.8,
  /** A lantern (or the heart) this close keeps them on screen, px. */
  nearX: 380,
  nearY: 260,
  /** A pip catches this long after its lantern does (the glints have to arrive first). */
  delay: 0.45,
};

const RES = 4;
const CW = 28;
const CH = 34;
/** The foot in the cell. */
const FX = 11;
const FY = 28;

function paint(draw: (g: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CW * RES;
  canvas.height = CH * RES;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(RES, RES);
    g.translate(FX, FY);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    draw(g);
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGenerateMipmaps: true });
  source.scaleMode = 'linear';
  return new Texture({ source });
}

function crook(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(-2.5, 0);
  g.bezierCurveTo(-5, -8, -3.4, -16, 0, -18.5);
  g.bezierCurveTo(3, -20.6, 7.6, -19.6, 7.4, -15.6);
}

function drop(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(7.4, -15.2);
  g.bezierCurveTo(8, -12.6, 10.4, -11, 10.4, -8.6);
  g.bezierCurveTo(10.4, -6.6, 9, -5.4, 7.4, -5.4);
  g.bezierCurveTo(5.8, -5.4, 4.4, -6.6, 4.4, -8.6);
  g.bezierCurveTo(4.4, -11, 6.8, -12.6, 7.4, -15.2);
  g.closePath();
}

function seat(g: CanvasRenderingContext2D, path: (g: CanvasRenderingContext2D) => void, fill: boolean): void {
  g.save();
  g.shadowColor = 'rgba(2, 10, 16, 0.9)';
  g.shadowBlur = 5 * RES;
  g.shadowOffsetY = 1 * RES;
  g.strokeStyle = 'rgba(2, 10, 16, 0.6)';
  g.fillStyle = 'rgba(2, 10, 16, 0.55)';
  g.lineWidth = 2.6;
  path(g);
  if (fill) g.fill();
  g.stroke();
  g.restore();
}

function crookDark(): Texture {
  return paint((g) => {
    seat(g, crook, false);
    seat(g, drop, true);
    g.strokeStyle = 'rgba(198, 222, 232, 0.96)';
    g.lineWidth = 1.5;
    crook(g);
    g.stroke();
    g.fillStyle = 'rgba(8, 18, 28, 0.94)';
    g.strokeStyle = 'rgba(198, 222, 232, 0.92)';
    g.lineWidth = 1.1;
    drop(g);
    g.fill();
    g.stroke();
  });
}

function crookLit(): Texture {
  return paint((g) => {
    const stem = g.createLinearGradient(0, 0, 0, -20);
    stem.addColorStop(0, 'rgba(214, 150, 84, 0.75)');
    stem.addColorStop(1, 'rgba(255, 216, 150, 1)');
    g.strokeStyle = stem;
    g.lineWidth = 1.6;
    crook(g);
    g.stroke();
    const glass = g.createLinearGradient(0, -15, 0, -5);
    glass.addColorStop(0, 'rgba(150, 66, 16, 0.95)');
    glass.addColorStop(1, 'rgba(255, 178, 70, 1)');
    g.fillStyle = glass;
    g.strokeStyle = 'rgba(255, 226, 168, 0.95)';
    g.lineWidth = 0.9;
    drop(g);
    g.fill();
    g.stroke();
  });
}

/** The light in a lit crook's seed (added). */
function beadTexture(): Texture {
  return paint((g) => {
    const glow = g.createRadialGradient(7.4, -8.4, 0, 7.4, -8.4, 8);
    glow.addColorStop(0, 'rgba(255, 244, 220, 1)');
    glow.addColorStop(0.2, 'rgba(255, 210, 130, 0.8)');
    glow.addColorStop(0.5, 'rgba(255, 150, 60, 0.25)');
    glow.addColorStop(1, 'rgba(230, 110, 30, 0)');
    g.fillStyle = glow;
    g.fillRect(-FX, -FY, CW, CH);
  });
}

function bud(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(-4.6, 0);
  g.bezierCurveTo(-7.4, -6, -3, -12, 0.4, -17);
  g.bezierCurveTo(3.4, -12, 7.6, -6, 4.8, 0);
  g.closePath();
}

function budDark(): Texture {
  return paint((g) => {
    g.translate(3, 0);
    seat(g, bud, true);
    g.fillStyle = 'rgba(8, 18, 28, 0.94)';
    g.strokeStyle = 'rgba(198, 222, 232, 0.96)';
    g.lineWidth = 1.4;
    bud(g);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(198, 222, 232, 0.6)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(0.1, -1);
    g.quadraticCurveTo(-1.4, -8, 0.4, -15);
    g.stroke();
  });
}

function budLit(): Texture {
  return paint((g) => {
    g.translate(3, 0);
    // Open: three straps fallen apart round a light.
    g.strokeStyle = 'rgba(255, 216, 150, 0.98)';
    g.fillStyle = 'rgba(150, 70, 18, 0.9)';
    g.lineWidth = 1.1;
    for (const [a, len] of [
      [-0.95, 13],
      [0.95, 13],
      [-0.35, 15],
      [0.35, 15],
    ] as const) {
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(-2.2, 0);
      g.quadraticCurveTo(-3.6, -len * 0.5, 0, -len);
      g.quadraticCurveTo(3.6, -len * 0.5, 2.2, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    const glow = g.createRadialGradient(0, -7, 0, 0, -7, 9);
    glow.addColorStop(0, 'rgba(255, 246, 224, 1)');
    glow.addColorStop(0.25, 'rgba(255, 214, 136, 0.85)');
    glow.addColorStop(0.6, 'rgba(255, 150, 60, 0.2)');
    glow.addColorStop(1, 'rgba(230, 110, 30, 0)');
    g.fillStyle = glow;
    g.fillRect(-FX, -FY, CW, CH);
  });
}

interface Pip {
  root: Container;
  dark: Sprite;
  lit: Sprite;
  bead: Sprite | null;
  on: boolean;
  /** Seconds since it caught, < 0 while it waits to. */
  t: number;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class LanternPips {
  readonly root = new Container({ label: 'hud-pips' });
  /** 0..1: how visible the row is this frame. */
  alpha = 0;
  private readonly pips: Pip[] = [];
  private heart: Pip | null = null;
  private hold = 0;
  private frame = -1;
  /** A slow pulse through the row: she touched the sleeping heart, or it woke. */
  private pulse = -1;

  private make(dark: Texture, lit: Texture, bead: Texture | null, x: number): Pip {
    const root = new Container();
    const mk = (t: Texture, add: boolean): Sprite => {
      const s = new Sprite(t);
      s.anchor.set(FX / CW, FY / CH);
      if (add) s.blendMode = 'add';
      root.addChild(s);
      return s;
    };
    const d = mk(dark, false);
    const l = mk(lit, false);
    const b = bead ? mk(bead, true) : null;
    root.position.set(x, 0);
    root.scale.set(PIPS.scale);
    this.root.addChild(root);
    return { root, dark: d, lit: l, bead: b, on: false, t: 99 };
  }

  private build(n: number, withHeart: boolean): void {
    const dark = crookDark();
    const lit = crookLit();
    const bead = beadTexture();
    for (let i = 0; i < n; i++) this.pips.push(this.make(dark, lit, bead, PIPS.x + i * PIPS.step));
    if (withHeart) this.heart = this.make(budDark(), budLit(), null, PIPS.x + n * PIPS.step + PIPS.gap);
  }

  /** `y` = where the row's feet stand (the HUD slides it under whatever is showing above). */
  update(dt: number, clock: number, sim: SimView, y: number): void {
    const list = sim.scene.lanterns ?? [];
    const goal = sim.goal;
    if (list.length === 0) {
      this.root.visible = false;
      this.alpha = 0;
      return;
    }
    if (this.pips.length === 0) this.build(Math.min(8, list.length), sim.scene.heart !== undefined);
    const restart = sim.frame < this.frame;
    this.frame = sim.frame;

    let changed = false;
    for (const e of sim.events) {
      if (e.type === 'lanternKindle' || e.type === 'heartWake') {
        this.hold = PIPS.hold + 1.5;
        changed = true;
        if (e.type === 'heartWake') this.pulse = 0;
      } else if (e.type === 'heartSleep') {
        this.hold = PIPS.hold;
        this.pulse = 0;
      } else if (e.type === 'lanternRefuse') this.hold = Math.max(this.hold, 3);
      else if (e.type === 'lanternChannel' || e.type === 'lanternRest') this.hold = Math.max(this.hold, 1.5);
    }
    // What is true now.
    for (let i = 0; i < this.pips.length; i++) {
      const pip = this.pips[i] as Pip;
      const on = goal.lanterns[i]?.lit === true;
      if (on === pip.on) continue;
      pip.on = on;
      pip.t = on && changed && !restart ? -PIPS.delay : 99;
    }
    if (this.heart && this.heart.on !== goal.heart.awake) {
      this.heart.on = goal.heart.awake;
      this.heart.t = this.heart.on && changed && !restart ? -PIPS.delay - 0.9 : 99;
    }
    // Near a lantern or the heart they stay.
    const p = sim.player;
    const near = (x: number, yy: number): boolean =>
      Math.abs(x - p.cx) < PIPS.nearX && Math.abs(yy - 50 - p.cy) < PIPS.nearY;
    for (const l of list) if (near(l.x, l.y)) this.hold = Math.max(this.hold, PIPS.nearHold);
    if (sim.scene.heart && near(sim.scene.heart.x, sim.scene.heart.y))
      this.hold = Math.max(this.hold, PIPS.nearHold);
    if (restart) this.hold = 0;
    this.hold -= dt;
    const show = this.hold > 0 && !goal.gathered;
    this.alpha = Math.min(1, Math.max(0, this.alpha + (show ? dt / PIPS.fadeIn : -dt / PIPS.fadeOut)));
    if (restart) this.alpha = 0;
    const a = this.alpha * this.alpha * (3 - 2 * this.alpha);
    this.root.visible = a > 0.003;
    this.root.alpha = a;
    this.root.position.set(0, y);
    if (this.pulse >= 0) {
      this.pulse += dt;
      if (this.pulse > 2.4) this.pulse = -1;
    }
    if (!this.root.visible) return;

    const all = this.heart ? [...this.pips, this.heart] : this.pips;
    for (let i = 0; i < all.length; i++) {
      const pip = all[i] as Pip;
      pip.t += dt;
      const up = pip.on ? smooth(0, 0.18, pip.t) : 0;
      // The catch: a small swell that settles.
      const pop =
        pip.on && pip.t >= 0 && pip.t < 1 ? Math.sin(Math.PI * Math.min(1, pip.t / 0.5)) * (1 - pip.t) : 0;
      const wave =
        this.pulse >= 0 ? Math.max(0, Math.sin(Math.PI * smooth(0, 1, (this.pulse - i * 0.22) / 0.9))) : 0;
      pip.lit.alpha = up;
      pip.lit.visible = up > 0.004;
      pip.dark.alpha = 1 - 0.85 * up;
      if (pip.bead) {
        const breath = 0.86 + 0.08 * Math.sin(clock * 1.7 - i * 0.9);
        pip.bead.alpha = Math.min(1, up * breath + 0.6 * pop + (pip.on ? 0.3 : 0.22) * wave);
        pip.bead.visible = pip.bead.alpha > 0.004;
      } else if (!pip.on) {
        // The sleeping bud answers the pulse with a dull lift.
        pip.dark.alpha = 1 - 0.35 * wave;
      }
      pip.root.scale.set(PIPS.scale * (1 + 0.28 * pop + 0.06 * wave));
      pip.root.y = -3 * pop;
    }
  }
}
