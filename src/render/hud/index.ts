/**
 * The HUD: one small cluster, top left. Her health as a row of lantern lights (lights.ts) and,
 * beneath it, the glint count: a living glint (the same shader as the ones in the world) and a
 * number. The count fades in when something is gathered, each new point makes the number tick
 * with a small pop, and it fades away again a few seconds after the last one; the lights stay
 * while she is hurt or an enemy is near.
 *
 * It sits outside the post stage (so it is never bloomed, graded or blurred) in logical view
 * units. The digits are painted once into a canvas with their own soft shadow and warm glow, so
 * they read over any of the three zones without a box behind them.
 */
import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { SimView } from '../contract';
import { GlintBatch, K_FLARE, K_GLINT, K_SPARK } from '../pickups/batch';
import { HealthLights } from './lights';

export const HUD = {
  /** Centre of the glint icon, logical px from the top left. */
  x: 70,
  y: 122,
  /** Where the count sits when the lights are hidden (it slides between the two). */
  yTop: 66,
  /** Digit height in logical px and the gap between icon and number. */
  font: 30,
  gap: 17,
  family: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  /** Seconds: fade in, stay after the last pickup, fade out, and between ticks of the number. */
  fadeIn: 0.16,
  hold: 3.6,
  fadeOut: 0.9,
  tick: 0.045,
  /** How far a digit swells when it changes. */
  pop: 0.3,
  iconQuad: 40,
  /** The icon is the world glint drawn this many times larger. */
  iconScale: 1.25,
};

const DIGITS = 4;
/** Canvas pixels per logical px in the digit atlas. */
const RES = 3;

export class Hud {
  readonly layer = new Container({ label: 'hud' });
  private readonly group = new Container();
  private readonly icon = new GlintBatch(32);
  private readonly health = new HealthLights();
  private readonly shake = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly glyphs: Texture[] = [];
  private readonly pops: number[] = [];
  private readonly shown: number[] = [];
  private advance = 0;
  /** The number on screen (chases the sim's count one step at a time). */
  private value = 0;
  private tickIn = 0;
  private alpha = 0;
  private hold = 0;
  private pulse = 0;

  constructor() {
    this.buildGlyphs();
    const shade = new Sprite(this.shadeTexture());
    shade.anchor.set(0.5);
    shade.position.set(HUD.x + 36, HUD.y);
    shade.scale.set(0.7);
    this.group.addChild(shade);
    for (let i = 0; i < DIGITS; i++) {
      const s = new Sprite(this.glyphs[0]);
      s.anchor.set(0.5);
      s.visible = false;
      this.sprites.push(s);
      this.pops.push(0);
      this.shown.push(-1);
      this.group.addChild(s);
    }
    this.shake.addChild(this.health.root, this.group, this.icon.mesh);
    this.layer.addChild(this.shake);
  }

  /** Paints 0-9 once: dark soft shadow, warm glow, a pale-gold face. */
  private buildGlyphs(): void {
    const pad = 16;
    const size = HUD.font;
    const font = `500 ${size * RES}px ${HUD.family}`;
    const probe = document.createElement('canvas').getContext('2d');
    let w = size * 0.5;
    if (probe) {
      probe.font = font;
      w = 0;
      for (let d = 0; d < 10; d++) w = Math.max(w, probe.measureText(String(d)).width / RES);
    }
    this.advance = Math.ceil(w) + 1;
    const cw = Math.ceil(w) + pad * 2;
    const ch = Math.ceil(size * 1.1) + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = cw * 10 * RES;
    canvas.height = ch * RES;
    const g = canvas.getContext('2d');
    if (g) {
      g.scale(RES, RES);
      g.font = `500 ${size}px ${HUD.family}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      const base = pad + size * 0.86;
      for (let d = 0; d < 10; d++) {
        const cx = d * cw + cw / 2;
        const ch0 = String(d);
        // A soft dark seat, so pale fog behind cannot swallow it.
        g.shadowColor = 'rgba(2, 12, 18, 0.9)';
        g.shadowBlur = 7 * RES;
        g.shadowOffsetY = 1.5 * RES;
        g.fillStyle = 'rgba(2, 12, 18, 0.55)';
        g.fillText(ch0, cx, base);
        g.fillText(ch0, cx, base);
        // Warm glow.
        g.shadowColor = 'rgba(255, 150, 40, 0.4)';
        g.shadowBlur = 5 * RES;
        g.shadowOffsetY = 0;
        g.fillStyle = 'rgba(255, 190, 110, 0.25)';
        g.fillText(ch0, cx, base);
        // The face.
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        const grad = g.createLinearGradient(0, base - size * 0.7, 0, base);
        grad.addColorStop(0, '#fff4dc');
        grad.addColorStop(0.55, '#ffdc9c');
        grad.addColorStop(1, '#f2ab52');
        g.fillStyle = grad;
        g.fillText(ch0, cx, base);
      }
    }
    const source = new CanvasSource({ resource: canvas, resolution: RES, autoGenerateMipmaps: true });
    source.scaleMode = 'linear';
    for (let d = 0; d < 10; d++)
      this.glyphs.push(new Texture({ source, frame: new Rectangle(d * cw, 0, cw, ch) }));
  }

  /** A faint dark cloud behind the whole counter. */
  private shadeTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 160;
    const g = canvas.getContext('2d');
    if (g) {
      g.translate(160, 80);
      g.scale(1, 0.5);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 160);
      grad.addColorStop(0, 'rgba(3, 14, 20, 0.42)');
      grad.addColorStop(0.5, 'rgba(3, 14, 20, 0.2)');
      grad.addColorStop(1, 'rgba(3, 14, 20, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, 160, 0, Math.PI * 2);
      g.fill();
    }
    return Texture.from(canvas);
  }

  update(dt: number, clock: number, sim: SimView): void {
    const count = sim.pickups.count;
    if (count < this.value) {
      // Restart.
      this.value = count;
      this.alpha = 0;
      this.hold = 0;
      this.layout(true);
    }
    if (count > this.value) {
      this.hold = HUD.hold;
      this.tickIn -= dt;
      // A big gain catches up faster, but still counts.
      const behind = count - this.value;
      while (this.tickIn <= 0 && this.value < count) {
        this.value++;
        this.tickIn += behind > 8 ? HUD.tick * 0.5 : HUD.tick;
        this.pulse = 1;
        this.layout(false);
      }
    } else {
      this.tickIn = 0;
      this.hold -= dt;
    }
    const want = this.hold > 0 ? 1 : 0;
    const rate = want > this.alpha ? dt / HUD.fadeIn : -dt / HUD.fadeOut;
    this.alpha = Math.min(1, Math.max(0, this.alpha + rate));
    this.pulse *= Math.exp(-dt * 9);

    // A scene opened without pickups is a clean plate: the lights show only when they matter.
    const quiet = (sim.scene.pickups ?? []).length === 0 && (sim.scene.pods ?? []).length === 0;
    const H = this.health;
    H.update(dt, clock, sim, quiet);
    this.shake.position.set(H.shakeX, H.shakeY);

    const a = this.alpha * this.alpha * (3 - 2 * this.alpha);
    this.group.visible = a > 0.003;
    this.group.alpha = a;
    // The count sits under the lights, and slides up into their place when they are away.
    const hv = H.alpha * H.alpha * (3 - 2 * H.alpha);
    const rise = (HUD.yTop - HUD.y) * (1 - hv);
    this.group.position.set(-10 * (1 - a), rise);
    const b = this.icon;
    b.begin();
    b.uniform[1] = HUD.iconQuad;
    b.uniform[3] = 1;
    if (this.group.visible) {
      for (let i = 0; i < DIGITS; i++) {
        const s = this.sprites[i] as Sprite;
        const p = (this.pops[i] as number) * Math.exp(-dt * 11);
        this.pops[i] = p;
        s.scale.set(1 + HUD.pop * p);
        s.y = HUD.y + 1 - 4 * p;
      }
      const x = HUD.x - 10 * (1 - a);
      const y = HUD.y + rise;
      b.quad(K_FLARE, x, y, 40, 40, 0.4 * this.pulse * a, 0, 0.6);
      const q = HUD.iconQuad * HUD.iconScale * (1 + 0.16 * this.pulse);
      b.quad(K_GLINT, x, y, q, q, (1.05 + 0.8 * this.pulse) * a, 0.2, 0);
    }
    // Flecks of a light that went out, motes of one that caught.
    for (const s of H.sparks) {
      if (s.life <= 0) continue;
      const k = s.life / s.max;
      const size = s.size * (0.55 + 0.45 * k);
      b.quad(
        K_SPARK,
        s.x,
        s.y,
        size,
        size,
        Math.min(1, k * 2.4) * Math.min(1, (1 - k) * 6) * 0.9 * H.alpha,
        0,
        k * k * s.heat,
      );
    }
    b.end(clock);
  }

  /** Puts the digits of `value` on the sprites; a digit that changed pops. */
  private layout(quiet: boolean): void {
    const text = String(Math.max(0, Math.min(10 ** DIGITS - 1, this.value)));
    for (let i = 0; i < DIGITS; i++) {
      const s = this.sprites[i] as Sprite;
      const d = i < text.length ? text.charCodeAt(i) - 48 : -1;
      s.visible = d >= 0;
      if (d < 0) {
        this.shown[i] = -1;
        continue;
      }
      // Right-aligned place value: compare by position from the right so 9 -> 10 pops both.
      const place = text.length - i;
      if (this.shown[i] !== d * 100 + place) {
        this.shown[i] = d * 100 + place;
        if (!quiet) this.pops[i] = 1;
        s.texture = this.glyphs[d] as Texture;
      }
      s.x = HUD.x + HUD.gap + this.advance * (i + 0.5);
    }
  }
}
