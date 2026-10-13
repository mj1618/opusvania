/**
 * Her health, as light: a row of small lanterns, each a seed of warm light hanging from a curled
 * filament like the lantern tips of her antennae. Lit = a warm point in a fine husk; lost = the
 * husk stays, dark, with a faint ember in it.
 *
 * Everything is painted once into small canvases (so it is crisp at any window size and is never
 * graded or bloomed: the HUD sits outside the post stage) and animated here on render time only:
 * a lost light gutters out, the row shakes and the lanterns swing on their filaments, the last
 * one pulses uneasily, all go dark when she fades and rekindle one after another when she re-forms.
 */
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { SimView } from '../contract';

export const LIGHTS = {
  /** Top of the first filament (the point a lantern swings from), logical px from the top left. */
  x: 70,
  y: 42,
  /** Distance between lanterns, and how much lower each hangs than the first (repeats). */
  step: 39,
  drop: [0, 2.5, 0.5, 3],
  /** Overall size of a lantern (1 = a 16 x 24 px seed on a 9 px filament). */
  scale: 1.3,
  /** Brightness of the bead of light, of the soft glow round it (both added) and of a dark one's ember. */
  core: 0.92,
  halo: 0.25,
  ember: 0.5,
  /** Seconds a light takes to gutter out / to rekindle, and the delay between rekindling lights. */
  gutter: 0.7,
  kindle: 0.5,
  kindleStep: 0.13,
  /** The last light: seconds per pulse and how far it dips (0..1). */
  lastPeriod: 1.35,
  lastDip: 0.5,
  /** Cluster shake on a hit: impulse px/s, spring stiffness and damping. */
  shake: 150,
  shakeK: 700,
  shakeC: 20,
  /** Lantern swing: impulse rad/s on a hit, spring stiffness and damping, idle sway in rad. */
  swing: 4.6,
  swingK: 85,
  swingC: 6,
  sway: 0.035,
  /** Seconds: fade in, stay at full health with nothing happening, fade out. */
  fadeIn: 0.22,
  hold: 4,
  fadeOut: 1.3,
  /** A living enemy this close (px, x / y) keeps the lights on screen. */
  nearX: 500,
  nearY: 320,
  /**
   * A fade's sting (playtest 3: the re-form did not read as a cost). She comes back dimmer: the
   * lights that return catch late (`reformDelay` s, then `reformStep` apart) and burn at
   * `reformDim` of their light until `reformBack` s after the re-form; the ones she did not get
   * back show cold in their husks (`chill`, a pale point, for `chillHold` s, gone by `chillOut`).
   */
  reformDelay: 0.45,
  reformStep: 0.3,
  reformDim: 0.5,
  reformBack: [2.2, 4.4],
  chill: 0.8,
  chillHold: 3.2,
  chillOut: 5,
};

/** Canvas pixels per logical px. */
const RES = 4;
/** Texture cell in logical px and where the filament's top (the pivot) is in it. */
const CW = 64;
const CH = 72;
const PX = 32;
const PY = 16;
/** The lantern, relative to the pivot: top point, centre of the belly, belly radius, bottom. */
const TOP = 9;
const BELLY = 24.5;
const R = 7.6;
const BOTTOM = 33;
/** Where the light sits in it. */
const CORE = 26.5;

interface Light {
  root: Container;
  husk: Sprite;
  ember: Sprite;
  /** A cold point in a husk she did not get back when she re-formed. */
  chill: Sprite;
  lit: Sprite;
  core: Sprite;
  halo: Sprite;
  on: boolean;
  /** 0 steady, 1 guttering out, 2 rekindling. */
  anim: 0 | 1 | 2;
  t: number;
  delay: number;
  level: number;
  flinch: number;
  angle: number;
  spin: number;
}

/** A spark the HUD asks its batch to draw (lantern-space px, energy, heat). */
export interface HudSpark {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  g: number;
  /** 0 amber .. 1 white-hot when fresh. */
  heat: number;
}

function seed(g: CanvasRenderingContext2D): void {
  // A hanging seed: pointed where the filament meets it, round below.
  g.beginPath();
  g.moveTo(0, TOP);
  g.bezierCurveTo(1.6, TOP + 5.5, R, BELLY - 6.5, R, BELLY);
  g.bezierCurveTo(R, BELLY + 5.2, R * 0.55, BOTTOM, 0, BOTTOM);
  g.bezierCurveTo(-R * 0.55, BOTTOM, -R, BELLY + 5.2, -R, BELLY);
  g.bezierCurveTo(-R, BELLY - 6.5, -1.6, TOP + 5.5, 0, TOP);
  g.closePath();
}

function crook(g: CanvasRenderingContext2D): void {
  // The filament: a crook, like the curl at the end of an antenna.
  g.beginPath();
  g.moveTo(-5.4, 4.6);
  g.bezierCurveTo(-6.2, 0.6, -1.2, -1.6, 0, 2.2);
  g.bezierCurveTo(0.5, 4, 0.2, 6.5, 0, TOP + 0.5);
}

function paint(draw: (g: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CW * RES;
  canvas.height = CH * RES;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(RES, RES);
    g.translate(PX, PY);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    draw(g);
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGenerateMipmaps: true });
  source.scaleMode = 'linear';
  return new Texture({ source });
}

function huskTexture(): Texture {
  return paint((g) => {
    // A soft dark seat so pale fog behind cannot swallow it.
    g.save();
    g.shadowColor = 'rgba(2, 10, 16, 0.85)';
    g.shadowBlur = 7 * RES;
    g.shadowOffsetY = 1 * RES;
    g.fillStyle = 'rgba(2, 10, 16, 0.6)';
    seed(g);
    g.fill();
    g.strokeStyle = 'rgba(2, 10, 16, 0.5)';
    g.lineWidth = 2.4;
    crook(g);
    g.stroke();
    g.restore();
    // The husk: dark glass, a touch lighter at the shoulder.
    const body = g.createLinearGradient(0, TOP, 0, BOTTOM);
    body.addColorStop(0, 'rgba(30, 44, 58, 0.94)');
    body.addColorStop(0.5, 'rgba(14, 24, 36, 0.94)');
    body.addColorStop(1, 'rgba(7, 14, 22, 0.94)');
    g.fillStyle = body;
    seed(g);
    g.fill();
    // Its rim: cool, brighter on the upper left.
    const rim = g.createLinearGradient(-R, TOP, R, BOTTOM);
    rim.addColorStop(0, 'rgba(172, 196, 208, 0.82)');
    rim.addColorStop(0.55, 'rgba(104, 130, 146, 0.62)');
    rim.addColorStop(1, 'rgba(58, 80, 96, 0.5)');
    g.strokeStyle = rim;
    g.lineWidth = 1.05;
    seed(g);
    g.stroke();
    // A sliver of sheen inside the left shoulder.
    g.strokeStyle = 'rgba(190, 214, 226, 0.2)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(-1.6, TOP + 7.5);
    g.bezierCurveTo(-3.6, TOP + 10, -4.9, BELLY - 3.5, -4.7, BELLY + 0.5);
    g.stroke();
    // The calyx: two small bracts clasp the shoulder where the filament meets it.
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, TOP - 0.8);
      g.quadraticCurveTo(side * 3.9, TOP + 2.4, side * 5.6, TOP + 9.4);
      g.quadraticCurveTo(side * 2.3, TOP + 6.6, side * 0.3, TOP + 3.6);
      g.closePath();
      g.fillStyle = side < 0 ? 'rgba(74, 98, 110, 0.96)' : 'rgba(46, 66, 80, 0.96)';
      g.fill();
      g.strokeStyle = side < 0 ? 'rgba(176, 200, 210, 0.7)' : 'rgba(120, 146, 160, 0.55)';
      g.lineWidth = 0.6;
      g.stroke();
    }
    const line = g.createLinearGradient(-6, 0, 1, TOP);
    line.addColorStop(0, 'rgba(150, 176, 190, 0)');
    line.addColorStop(0.35, 'rgba(150, 176, 190, 0.6)');
    line.addColorStop(1, 'rgba(160, 186, 200, 0.8)');
    g.strokeStyle = line;
    g.lineWidth = 1.05;
    crook(g);
    g.stroke();
  });
}

function litTexture(): Texture {
  return paint((g) => {
    g.save();
    seed(g);
    g.clip();
    // The glass warms from below: amber low in the belly, still dark at the shoulder.
    const glass = g.createLinearGradient(0, TOP + 4, 0, BOTTOM);
    glass.addColorStop(0, 'rgba(120, 52, 14, 0)');
    glass.addColorStop(0.55, 'rgba(150, 66, 16, 0.4)');
    glass.addColorStop(1, 'rgba(196, 96, 26, 0.7)');
    g.fillStyle = glass;
    g.fillRect(-R - 1, TOP - 1, R * 2 + 2, BOTTOM - TOP + 2);
    g.restore();
    // The rim takes the light: gold below, fading up the neck.
    const rim = g.createLinearGradient(0, TOP, 0, BOTTOM);
    rim.addColorStop(0, 'rgba(206, 150, 96, 0.25)');
    rim.addColorStop(0.45, 'rgba(240, 180, 110, 0.8)');
    rim.addColorStop(1, 'rgba(255, 222, 160, 0.98)');
    g.strokeStyle = rim;
    g.lineWidth = 1.05;
    seed(g);
    g.stroke();
    // A glassy fleck on the upper left.
    g.fillStyle = 'rgba(255, 244, 226, 0.42)';
    g.beginPath();
    g.ellipse(-3.4, BELLY - 4.2, 0.7, 1.6, 0.5, 0, Math.PI * 2);
    g.fill();
    const line = g.createLinearGradient(-6, 0, 1, TOP);
    line.addColorStop(0, 'rgba(230, 170, 100, 0)');
    line.addColorStop(0.5, 'rgba(230, 170, 100, 0.2)');
    line.addColorStop(1, 'rgba(244, 190, 120, 0.5)');
    g.strokeStyle = line;
    g.lineWidth = 1.05;
    crook(g);
    g.stroke();
  });
}

/** The light itself: a small hot bead low in the belly (added). */
function coreTexture(): Texture {
  return paint((g) => {
    const glow = g.createRadialGradient(0, CORE, 0, 0, CORE, 6.6);
    glow.addColorStop(0, 'rgba(255, 246, 226, 1)');
    glow.addColorStop(0.22, 'rgba(255, 222, 156, 0.95)');
    glow.addColorStop(0.5, 'rgba(255, 164, 70, 0.5)');
    glow.addColorStop(1, 'rgba(230, 110, 30, 0)');
    g.fillStyle = glow;
    g.fillRect(-PX, -PY, CW, CH);
  });
}

function haloTexture(): Texture {
  return paint((g) => {
    const glow = g.createRadialGradient(0, CORE, 0, 0, CORE, 24);
    glow.addColorStop(0, 'rgba(255, 170, 80, 0.8)');
    glow.addColorStop(0.3, 'rgba(255, 146, 58, 0.36)');
    glow.addColorStop(0.65, 'rgba(240, 120, 40, 0.09)');
    glow.addColorStop(1, 'rgba(240, 120, 40, 0)');
    g.fillStyle = glow;
    g.fillRect(-PX, -PY, CW, CH);
  });
}

function emberTexture(): Texture {
  return paint((g) => {
    const cy = CORE;
    const glow = g.createRadialGradient(0, cy, 0, 0, cy, 4.2);
    glow.addColorStop(0, 'rgba(255, 150, 70, 0.95)');
    glow.addColorStop(0.35, 'rgba(226, 92, 30, 0.5)');
    glow.addColorStop(1, 'rgba(160, 50, 10, 0)');
    g.fillStyle = glow;
    g.fillRect(-PX, -PY, CW, CH);
  });
}

/** The cold a lost light leaves: a pale blue point where the bead was. */
function chillTexture(): Texture {
  return paint((g) => {
    const glow = g.createRadialGradient(0, CORE, 0, 0, CORE, 6);
    glow.addColorStop(0, 'rgba(206, 232, 255, 0.95)');
    glow.addColorStop(0.3, 'rgba(120, 178, 240, 0.5)');
    glow.addColorStop(1, 'rgba(60, 110, 200, 0)');
    g.fillStyle = glow;
    g.fillRect(-PX, -PY, CW, CH);
  });
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class HealthLights {
  /** Everything but the sparks; the HUD fades and shakes it. */
  readonly root = new Container({ label: 'hud-lights' });
  /** 0..1: how visible the row is this frame. */
  alpha = 0;
  /** Shake of the whole cluster this frame, px. */
  shakeX = 0;
  shakeY = 0;
  readonly sparks: HudSpark[] = [];
  private readonly lights: Light[] = [];
  private tex: {
    husk: Texture;
    lit: Texture;
    core: Texture;
    halo: Texture;
    ember: Texture;
    chill: Texture;
  } | null = null;
  /** Seconds since she last re-formed (large = long ago), and how many lights she came back with. */
  private stingT = 1e6;
  private stingHp = 0;
  private hp = -1;
  private hold = 0;
  private shakeVx = 0;
  private shakeVy = 0;
  private sparkAt = 0;
  private dark = 0;
  /** A tiny LCG for spark scatter (render only). */
  private rnd = 0x51f15e;

  constructor() {
    for (let i = 0; i < 24; i++)
      this.sparks.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 1, g: 0, heat: 1 });
  }

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private build(n: number): void {
    if (!this.tex)
      this.tex = {
        husk: huskTexture(),
        lit: litTexture(),
        core: coreTexture(),
        halo: haloTexture(),
        ember: emberTexture(),
        chill: chillTexture(),
      };
    const T = this.tex;
    while (this.lights.length < n) {
      const i = this.lights.length;
      const root = new Container();
      const mk = (t: Texture, add: boolean): Sprite => {
        const s = new Sprite(t);
        s.anchor.set(PX / CW, PY / CH);
        if (add) s.blendMode = 'add';
        root.addChild(s);
        return s;
      };
      const husk = mk(T.husk, false);
      const ember = mk(T.ember, true);
      const chill = mk(T.chill, true);
      chill.visible = false;
      const lit = mk(T.lit, false);
      const core = mk(T.core, true);
      const halo = mk(T.halo, true);
      root.position.set(LIGHTS.x + i * LIGHTS.step, LIGHTS.y + (LIGHTS.drop[i % LIGHTS.drop.length] ?? 0));
      this.root.addChild(root);
      this.lights.push({
        root,
        husk,
        ember,
        chill,
        lit,
        core,
        halo,
        on: false,
        anim: 0,
        t: 0,
        delay: 0,
        level: 0,
        flinch: 0,
        angle: 0,
        spin: 0,
      });
    }
    for (let i = 0; i < this.lights.length; i++) (this.lights[i] as Light).root.visible = i < n;
  }

  /** Where light `i`'s belly is now, in HUD px (for sparks). */
  private belly(l: Light): { x: number; y: number } {
    const s = LIGHTS.scale;
    return {
      x: l.root.x - Math.sin(l.angle) * BELLY * s,
      y: l.root.y + Math.cos(l.angle) * BELLY * s,
    };
  }

  private spark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    g: number,
    heat: number,
  ): void {
    const s = this.sparks[this.sparkAt] as HudSpark;
    this.sparkAt = (this.sparkAt + 1) % this.sparks.length;
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.max = life;
    s.life = life;
    s.size = size;
    s.g = g;
    s.heat = heat;
  }

  private gutter(l: Light, dir: number): void {
    if (!l.on && l.anim !== 2) return;
    l.on = false;
    l.anim = 1;
    l.t = 0;
    l.delay = 0;
    const p = this.belly(l);
    // The crack: a few flecks of the light fall out of it.
    for (let k = 0; k < 4; k++)
      this.spark(
        p.x + (this.rand() - 0.5) * 5,
        p.y + (this.rand() - 0.5) * 5,
        dir * (18 + 40 * this.rand()) + (this.rand() - 0.5) * 50,
        -50 - 50 * this.rand(),
        0.4 + 0.3 * this.rand(),
        2.1 + 1.2 * this.rand(),
        300,
        0.9,
      );
  }

  private kindle(l: Light, delay: number): void {
    l.on = true;
    l.anim = 2;
    l.t = 0;
    l.delay = delay;
  }

  /** `quiet`: a clean plate (the scene was opened without pickups): show only when it matters. `keep`: show regardless. */
  update(dt: number, clock: number, sim: SimView, quiet: boolean, keep = false): void {
    const L = LIGHTS;
    const p = sim.player;
    const max = Math.max(1, Math.min(12, p.hpMax | 0));
    const hp = Math.max(0, Math.min(max, p.hp | 0));
    const first = this.hp < 0;
    if (this.lights.length < max || (this.lights[max - 1] as Light | undefined)?.root.visible !== true)
      this.build(max);
    if (first) {
      for (let i = 0; i < max; i++) {
        const l = this.lights[i] as Light;
        l.on = i < hp;
        l.level = l.on ? 1 : 0;
      }
    }

    // --- What happened.
    for (const e of sim.events) {
      if (e.type === 'hurt') {
        this.hold = L.hold;
        this.shakeVx += e.dir * L.shake;
        this.shakeVy -= L.shake * 0.35;
        for (let i = 0; i < max; i++) {
          const l = this.lights[i] as Light;
          l.spin += e.dir * L.swing * (0.75 + 0.5 * ((i * 0.618) % 1));
          if (i >= e.hp && i < e.hp + e.damage) this.gutter(l, e.dir);
          else if (l.on) l.flinch = 1;
        }
      } else if (e.type === 'fade') {
        for (let i = 0; i < max; i++) this.gutter(this.lights[i] as Light, 0);
      } else if (e.type === 'reform') {
        this.hold = Math.max(L.hold, L.chillOut + 0.5);
        this.stingT = 0;
        this.stingHp = e.hp;
        for (let i = 0; i < max; i++) {
          const l = this.lights[i] as Light;
          if (i < e.hp) this.kindle(l, L.reformDelay + i * L.reformStep);
        }
      }
    }
    // --- And what is true now (a restart, or health set without an event).
    for (let i = 0; i < max; i++) {
      const l = this.lights[i] as Light;
      const want = i < hp;
      if (want === l.on) continue;
      this.hold = L.hold;
      if (want) this.kindle(l, Math.max(0, i - Math.max(0, this.hp)) * L.kindleStep);
      else this.gutter(l, 0);
    }
    if (!first && hp !== this.hp) this.hold = L.hold;
    this.hp = hp;

    // --- Is it wanted on screen?
    let busy = false;
    for (let i = 0; i < max; i++) if ((this.lights[i] as Light).anim !== 0) busy = true;
    if (!quiet) {
      for (const e of sim.enemies ?? []) {
        if (e.mode === 'dead' || e.gone) continue;
        if (Math.abs(e.x + e.w / 2 - p.cx) < L.nearX && Math.abs(e.y + e.h / 2 - p.cy) < L.nearY)
          this.hold = Math.max(this.hold, 1.6);
      }
    }
    this.hold -= dt;
    // `keep`: the rest of the cluster is up, and the corner has one layout.
    const show = hp < max || p.faded > 0 || busy || this.hold > 0 || keep;
    const rate = show ? dt / L.fadeIn : -dt / L.fadeOut;
    this.alpha = Math.min(1, Math.max(0, this.alpha + rate));
    const a = this.alpha * this.alpha * (3 - 2 * this.alpha);
    this.root.visible = a > 0.003;
    this.root.alpha = a;

    // --- The shake of the cluster (a damped spring).
    this.shakeVx += (-L.shakeK * this.shakeX - L.shakeC * this.shakeVx) * dt;
    this.shakeVy += (-L.shakeK * this.shakeY - L.shakeC * this.shakeVy) * dt;
    this.shakeX += this.shakeVx * dt;
    this.shakeY += this.shakeVy * dt;

    // While she lies faded even the embers are out.
    const dark = p.faded > 0 ? 1 : 0;
    this.dark += (dark - this.dark) * Math.min(1, dt * 5);

    // A fade's sting: for a few seconds after the re-form the lights she has burn low and the ones
    // she lost show cold. A restart, or being made whole, ends it.
    this.stingT += dt;
    if (first || hp >= max || p.faded > 0) this.stingT = 1e6;
    const dim =
      1 - (1 - L.reformDim) * (1 - smooth(L.reformBack[0] as number, L.reformBack[1] as number, this.stingT));
    const chill =
      this.stingT < L.chillOut
        ? smooth(L.reformDelay, L.reformDelay + 0.5, this.stingT) *
          (1 - smooth(L.chillHold, L.chillOut, this.stingT))
        : 0;

    const last = hp === 1 && p.faded <= 0;
    for (let i = 0; i < max; i++) {
      const l = this.lights[i] as Light;
      // Swing on the filament.
      const rest = L.sway * Math.sin(clock * 1.15 - i * 0.8) * (0.6 + 0.4 * Math.sin(clock * 0.37 + i));
      l.spin += (-L.swingK * (l.angle - rest) - L.swingC * l.spin) * dt;
      l.angle += l.spin * dt;
      l.root.rotation = l.angle;
      l.root.scale.set(L.scale);
      l.flinch *= Math.exp(-dt * 6);

      let level = l.on ? 1 : 0;
      let lift = 0;
      if (l.anim === 1) {
        l.t += dt;
        const k = Math.min(1, l.t / L.gutter);
        // A hot crack, then it stutters down: two or three catches before it is out.
        const crack = Math.max(0, 1 - k / 0.1) * 0.5;
        const stutter = 0.5 + 0.5 * Math.sin(k ** 1.5 * 34 + 1.3);
        level = Math.max(0, (1 - k) ** 1.15 * (0.22 + 0.78 * stutter)) + crack;
        if (k >= 1) l.anim = 0;
      } else if (l.anim === 2) {
        level = 0;
        if (l.delay > 0) {
          l.delay -= dt;
          if (l.delay <= 0) {
            // The warmth sweeps up: a mote lifts off as it catches, and the lantern bobs.
            const b = this.belly(l);
            for (let k = 0; k < 2; k++)
              this.spark(
                b.x + (this.rand() - 0.5) * 6,
                b.y,
                (this.rand() - 0.5) * 16,
                -34 - 26 * this.rand(),
                0.55 + 0.3 * this.rand(),
                1.9 + 0.8 * this.rand(),
                -30,
                0.25,
              );
            l.spin += (this.rand() - 0.5) * 1.6;
          }
        } else {
          l.t += dt;
          const k = Math.min(1, l.t / L.kindle);
          level = smooth(0, 0.3, k) * (1 + 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k));
          lift = Math.sin(Math.PI * k) * (1 - k) * 3;
          if (k >= 1) l.anim = 0;
        }
      } else if (l.on) {
        // It breathes, a slow wave along the row.
        level = 1 + 0.05 * Math.sin(clock * 1.7 - i * 0.9);
        if (last) {
          // The last light: a slow, uneasy pulse with a tremor in it.
          const s = 0.5 + 0.5 * Math.sin((clock * 6.2832) / L.lastPeriod);
          level = 1 - L.lastDip * (1 - s ** 1.6) + 0.035 * Math.sin(clock * 23) * (1 - s);
        }
        level *= 1 - 0.5 * l.flinch;
      }
      level *= dim;
      l.level = level;
      const cold = !l.on && l.anim === 0 && i >= this.stingHp ? chill : 0;
      l.chill.visible = cold > 0.004;
      l.chill.alpha = L.chill * cold * (0.8 + 0.2 * Math.sin(clock * 2.3 + i * 1.7));
      // A steady light keeps its warm glass and rim; only the bead and its glow rise and fall.
      const body = l.on && l.anim === 0 ? 1 : Math.min(1, level);
      l.lit.alpha = body;
      l.lit.visible = body > 0.004;
      // The bead and its glow swell and shrink about where the light sits.
      const cs = 0.62 + 0.38 * Math.min(1.5, level);
      l.core.alpha = Math.min(1, level * L.core);
      l.core.visible = level > 0.004;
      l.core.scale.set(cs);
      l.core.position.set(0, (1 - cs) * CORE);
      const hs = 0.8 + 0.22 * Math.min(1.6, level);
      l.halo.alpha = L.halo * level * (0.8 + 0.2 * level);
      l.halo.visible = level > 0.004;
      l.halo.scale.set(hs);
      l.halo.position.set(0, (1 - hs) * CORE);
      l.ember.alpha =
        L.ember * (1 - body) * (1 - this.dark) * (0.72 + 0.28 * Math.sin(clock * 2.1 + i * 1.9));
      l.root.y = L.y + (L.drop[i % L.drop.length] ?? 0) - lift;
    }

    // --- Sparks.
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy += s.g * dt;
      s.vx *= Math.exp(-2.5 * dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }
}
