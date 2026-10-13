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
import { lanternCost } from '../../sim/goal';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { GOAL } from '../goal/config';
import { streamCount } from '../goal/logic';
import { GlintBatch, K_FLARE, K_GLINT, K_SPARK } from '../pickups/batch';
import { HealthLights } from './lights';
import { LanternPips } from './progress';
import { EndSummary } from './summary';

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
  /** The lantern pips stand this far under the count's row (or in its place when it is away). */
  pipsDrop: 50,
  /** A refusal shakes the count: px, and how fast it dies (per second). */
  refuse: 5,
  refuseDecay: 7,
  /** Seconds the whole cluster takes to leave when the run ends. */
  endFade: 1.1,
  /**
   * The count and the health lights never share a place: the count moves down out of the lights' slot
   * in `slideDown` s before they may show, and back up in `slideUp` s only once they are quite gone.
   * The lights are held back until the slide has passed `clear` (0..1 of the way down).
   */
  slideDown: 0.2,
  slideUp: 0.45,
  clear: 0.72,
  /** Glints left behind in a fade run out of the count one by one: seconds for the whole loss, at most per glint. */
  spill: 0.9,
  spillStep: 0.07,
};

/** A glint leaving the counter as it is spent (HUD px). */
interface Drop {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DIGITS = 4;
/** Canvas pixels per logical px in the digit atlas. */
const RES = 3;

export class Hud {
  readonly layer = new Container({ label: 'hud' });
  private readonly group = new Container();
  private readonly icon = new GlintBatch(72);
  private readonly pips = new LanternPips();
  private readonly summary = new EndSummary();
  private readonly drops: Drop[] = [];
  private dropAt = 0;
  private refuseT = -1;
  private frame = -1;
  /** 1 = showing, 0 = the run has ended and the cluster has gone. */
  private live = 1;
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
  /** 0 = the count sits in the lights' place, 1 = under them. */
  private slot = 0;
  /** Seconds between two glints leaving the count after a fade (0 = a loss shows at once). */
  private spillStep = 0;
  private spillIn = 0;

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
    this.shake.addChild(this.health.root, this.group, this.pips.root, this.icon.mesh);
    this.layer.addChild(this.shake, this.summary.root);
    for (let i = 0; i < 16; i++) this.drops.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0 });
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
    // The wallet as she sees it: while she kindles a lantern the glints streaming out of her have
    // left the count already (the sim takes the whole cost at the moment it catches).
    let count = sim.pickups.count;
    const kindling = sim.player.kindling;
    const lamp = kindling >= 0 ? sim.scene.lanterns?.[kindling] : undefined;
    const channel = sim.goal.lanterns[kindling]?.channel ?? 0;
    if (lamp && channel > 0) {
      const cost = lanternCost(lamp, tuning.goal);
      count -= streamCount(channel, Math.max(1, Math.round(tuning.goal.channelFrames)), cost, GOAL.kindle.by);
      this.hold = Math.max(this.hold, 1.2);
    }
    const restart = sim.frame < this.frame;
    this.frame = sim.frame;
    for (const e of sim.events) {
      if (e.type === 'lanternRefuse') {
        // "Not enough": the count shows itself and shakes its head.
        this.hold = Math.max(this.hold, e.show > 0 ? e.show / 60 : 2.6);
        this.refuseT = 0;
      } else if (e.type === 'lanternKindle') this.hold = Math.max(this.hold, 2.4);
      else if (e.type === 'glintsDrop') {
        // A fade cost her these: the count shows itself and they run out of it, one by one.
        this.hold = Math.max(this.hold, HUD.hold);
        this.spillStep = Math.min(HUD.spillStep, HUD.spill / Math.max(1, e.value));
        this.spillIn = 0.35;
      }
    }
    if (restart) {
      this.value = count;
      this.alpha = 0;
      this.hold = 0;
      this.live = 1;
      this.spillStep = 0;
      this.layout(true);
    }
    if (count >= this.value) this.spillStep = 0;
    if (count < this.value) {
      // Spent: the number runs down with the stream, a mote leaving the counter for each. What a
      // fade took runs out more slowly, so the loss is seen.
      this.hold = Math.max(this.hold, 1.6);
      let n = this.value - count;
      if (this.spillStep > 0) {
        this.spillIn -= dt;
        n = 0;
        while (this.spillIn <= 0 && n < this.value - count) {
          n++;
          this.spillIn += this.spillStep;
        }
      }
      const to = this.value - n;
      while (this.value > to) {
        this.value--;
        const d = this.drops[this.dropAt] as Drop;
        this.dropAt = (this.dropAt + 1) % this.drops.length;
        const k = (this.value * 0.618) % 1;
        d.max = d.life = 0.34 + 0.12 * k;
        d.x = 0;
        d.y = 0;
        d.vx = 70 + 60 * k;
        d.vy = 30 + 70 * ((k * 7.3) % 1);
      }
      if (n > 0) {
        this.pulse = 0.5;
        this.layout(false, -0.5);
      }
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

    // The run is over: the cluster leaves the picture to the ending, and the summary comes.
    this.live = Math.min(1, Math.max(0, this.live + (sim.goal.gathered ? -dt : dt * 3) / HUD.endFade));
    this.shake.alpha = this.live * this.live * (3 - 2 * this.live);
    this.shake.visible = this.live > 0.003;
    this.summary.update(dt, clock, sim);

    const a = this.alpha * this.alpha * (3 - 2 * this.alpha) * this.shake.alpha;
    this.group.visible = a > 0.003;
    this.group.alpha = a;
    let shakeX = 0;
    if (this.refuseT >= 0) {
      this.refuseT += dt;
      shakeX = HUD.refuse * Math.sin(this.refuseT * 38) * Math.exp(-this.refuseT * HUD.refuseDecay);
      if (this.refuseT > 0.8) this.refuseT = -1;
    }
    // The count sits under the lights, and takes their place when they are away. The two never
    // overlap: it moves down before they show, and moves back up only when they are quite gone.
    const lights = H.alpha > 0.003 ? 1 : 0;
    if (this.alpha <= 0.003 && this.pips.root.alpha * (this.pips.root.visible ? 1 : 0) <= 0.003)
      this.slot = lights;
    else if (lights > this.slot) this.slot = Math.min(1, this.slot + dt / HUD.slideDown);
    else if (lights < this.slot) this.slot = Math.max(0, this.slot - dt / HUD.slideUp);
    const hv = this.slot * this.slot * (3 - 2 * this.slot);
    const gk = Math.min(1, Math.max(0, (this.slot - HUD.clear) / (1 - HUD.clear)));
    const gate = gk * gk * (3 - 2 * gk);
    H.root.alpha *= gate;
    H.root.visible = H.root.visible && gate > 0.003;
    const rise = (HUD.yTop - HUD.y) * (1 - hv);
    this.group.position.set(-10 * (1 - a) + shakeX, rise);
    this.pips.update(dt, clock, sim, HUD.yTop + (HUD.y - HUD.yTop) * hv + HUD.pipsDrop * a + 12);
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
      const x = HUD.x - 10 * (1 - a) + shakeX;
      const y = HUD.y + rise;
      b.quad(K_FLARE, x, y, 40, 40, 0.4 * this.pulse * a, 0, 0.6);
      const q = HUD.iconQuad * HUD.iconScale * (1 + 0.16 * this.pulse);
      b.quad(K_GLINT, x, y, q, q, (1.05 + 0.8 * this.pulse) * a, 0.2, 0);
    }
    // Glints leaving the counter as they are spent.
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const k = Math.max(0, d.life / d.max);
      const size = 3.4 * (0.5 + 0.5 * k);
      b.quad(K_SPARK, HUD.x + 4 + d.x, HUD.y + rise + d.y, size, size, k * 0.95 * a, 0, 0.5 + 0.4 * k);
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
        Math.min(1, k * 2.4) * Math.min(1, (1 - k) * 6) * 0.9 * H.root.alpha * this.shake.alpha,
        0,
        k * k * s.heat,
      );
    }
    b.end(clock);
  }

  /** Puts the digits of `value` on the sprites; a digit that changed pops (`pop` < 0: it dips instead). */
  private layout(quiet: boolean, pop = 1): void {
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
        if (!quiet) this.pops[i] = pop;
        s.texture = this.glyphs[d] as Texture;
      }
      s.x = HUD.x + HUD.gap + this.advance * (i + 0.5);
    }
  }
}
