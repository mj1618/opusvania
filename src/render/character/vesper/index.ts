// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper, the moth: a night-flier who carries her own light. Skin id `vesper`.
 *
 *   rig.ts    pose generators + springs -> skeleton (2.5D, continuous turn, dragged hands)
 *   chain.ts  verlet chains with rest shapes (copy of hooded/chain.ts + per-segment ripple)
 *   wings.ts  the two wing membranes (five strands each) and the two antennae
 *   draw.ts   skeleton + chains -> shaded shapes (through hooded/paint.ts, one mesh)
 *   fx.ts     rising gold dust, light trails, landing dust
 *
 * Her light is the pair of lantern tips on her antennae: their midpoint is the point light 'ember'.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView, RenderContext } from '../../contract';
import type { PointLight } from '../../lights';
import { zoneWeights } from '../../scene/lib/fx-zones';
import { KEY_LIGHT } from '../../scene/lib/look';
import { clamp, noise1, Spring, sat, smoothstep } from '../hooded/math';
import type { CharacterSkin, SkinDef } from '../skin';
import { drawVesper, type View } from './draw';
import { BladeTrail, drawImpact, FX_GOLD, FX_GOLD_DEEP, FX_GOLD_HOT, Fx, Trail } from './fx';
import { Painter, rgb } from './paint';
import { HURT, J_CHEST, J_HEAD, J_HIP, Rig } from './rig';

import { Secondary } from './wings';

const LIGHT = 0xffe0a0;
const TURNS_KEY = 'vesper.turns';

export class VesperCharacter implements CharacterSkin {
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly fx = new Fx();
  /** Light trails: the two lantern tips, then the fore tip of wing A and of wing B. */
  private readonly trails = [
    new Trail(20, 0.13, 3.4),
    new Trail(20, 0.11, 3),
    new Trail(40, 0.5, 4.2, 11),
    new Trail(40, 0.5, 4.2, 11),
  ];
  private readonly light: PointLight = { x: 0, y: 0, radius: 300, color: LIGHT, intensity: 1 };
  private readonly hairX = new Spring(0, 17, 0.42);
  private readonly hairY = new Spring(0, 15, 0.4);
  private readonly hair2X = new Spring(0, 10.5, 0.34);
  private readonly hair2Y = new Spring(0, 9.5, 0.32);
  private readonly view: View;
  private readonly pts = new Float32Array(8);
  private readonly lastX = new Float32Array(4);
  private readonly lastY = new Float32Array(4);
  /** Where the glide's dust is shed: every strand tip of both wings. */
  private readonly hemPts = new Float32Array(20);
  /** ... and where she comes apart from: those, plus head, chest and hips. */
  private readonly bodyPts = new Float32Array(26);
  private fadeAcc = 0;
  private started = false;
  private flash = 0;
  private readonly back: [number, number] = [0, 0];
  private glintT = 9;
  private glintK = 0;
  private hitX = 0;
  private hitY = 0;
  private hitDx = 1;
  private hitDy = 0;
  private readonly blade = new BladeTrail();
  private readonly cutAt = (q: number, out: { x: number; y: number }): void => this.rig.strokeAt(q, out);
  private readonly tan = { x: 0, y: 0 };
  private readonly tan2 = { x: 0, y: 0 };

  private toast: HTMLElement | null = null;
  private toastTimer = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    this.setTurns(Rig.turns === 2 ? 1 : 2, true);
  };

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    this.initTurns();
    this.painter.mesh.label = 'vesper';
    layer.addChild(this.painter.mesh);
    ctx.lights.set('ember', this.light);
    const p = this.painter;
    p.lx = -KEY_LIGHT.dirX;
    p.ly = -KEY_LIGHT.dirY;
    p.keyColor = rgb(KEY_LIGHT.color);
    // The moon rim: brighter and bluer than the default fill, so dark shapes keep an edge.
    p.coolColor = [0.52, 0.68, 0.95];
    p.l2c = rgb(LIGHT);
    // Crisp, flat shapes (owner: highlights read washed out and blurry): no cool rim at all, a
    // faint warm key edge only, and no rim from her own lanterns (it moved with the antennae).
    p.coolK = 0;
    p.keyK = 0.22;
    this.view = {
      wings: this.sec.wings,
      antennae: this.sec.antennae,
      open: 0,
      hairX: 0,
      hairY: 0,
      hair2X: 0,
      hair2Y: 0,
      glow: 1,
      tuck: 0,
      wall: 0,
      wallDir: 1,
      soar: 0,
      pale: 1,
      soarW: this.sec.soarW,
      back: this.back,
      glintT: 9,
      glintK: 0,
      slashW: 0,
      bladeAng: 0,
      bladeLen: 1,
      bladeOver: false,
      bladeFront: false,
      swordSide: 0,
      hop: 0,
    };
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, painter: p, view } = this;
    rig.groundDist = player.grounded ? 0 : this.clearBelow(player);
    this.sideGaps(player);
    rig.update(dt, clock, player, events);
    const sig = rig.sig;
    const fresh = sig.spawned || !this.started;
    if (fresh) {
      sec.reset();
      fx.clear();
      this.blade.clear();
      for (const t of this.trails) t.clear();
    }
    sec.update(dt, clock, rig, rig.frame, player);

    // --- Head fur lags the head.
    const hx = rig.frame.j[J_HEAD * 2]!;
    const hy = rig.frame.j[J_HEAD * 2 + 1]!;
    if (fresh) {
      this.hairX.snap(hx);
      this.hairY.snap(hy);
      this.hair2X.snap(hx);
      this.hair2Y.snap(hy);
    }
    let lx = (this.hairX.step(hx, dt) - hx) * 0.22;
    let ly = (this.hairY.step(hy, dt) - hy) * 0.22;
    const lk = 1 / (1 + Math.hypot(lx, ly) / 3.6);
    lx *= lk;
    ly *= lk;
    view.hairX = lx + noise1(clock * 0.7, 51) * 0.35;
    view.hairY = ly + noise1(clock * 0.9, 53) * 0.25;
    // The outer mane: slower, looser, and ruffled by her speed.
    let mx = (this.hair2X.step(hx, dt) - hx) * 0.3;
    let my = (this.hair2Y.step(hy, dt) - hy) * 0.3;
    const mk = 1 / (1 + Math.hypot(mx, my) / 5);
    const ruffle = 0.4 + 0.9 * sat(Math.hypot(player.vx, player.vy) / 10);
    mx = mx * mk + noise1(clock * 2.1, 57) * ruffle * 0.7;
    my = my * mk + noise1(clock * 2.6, 59) * ruffle * 0.6;
    view.hair2X = mx;
    view.hair2Y = my;
    view.open = sec.open;
    view.tuck = rig.spinW;
    view.wall = rig.wWall;
    view.soar = sec.soar;
    // The left and right zones are graded up (post exposure 1.3-1.5): keep her face the same soft pale there.
    const zw = zoneWeights(player.cx);
    view.pale = 0.72 * zw[0] + 0.94 * zw[1] + 0.68 * zw[2];
    view.wallDir = rig.frame.s[0]! >= 0 ? 1 : -1;

    // --- Her light: the two lantern tips.
    const a0 = sec.antennae[0];
    const a1 = sec.antennae[1];
    const nearIdx = rig.frame.s[0]! >= 0 ? 0 : 1;
    const mid = sec.wings[nearIdx].strands[2]!;
    const pts = this.pts;
    pts[0] = a0.rx[a0.n - 1]!;
    pts[1] = a0.ry[a0.n - 1]!;
    pts[2] = a1.rx[a1.n - 1]!;
    pts[3] = a1.ry[a1.n - 1]!;
    for (let w = 0; w < 2; w++) {
      const st = sec.wings[w]!.strands;
      const tip = st[0]!;
      pts[4 + w * 2] = tip.rx[tip.n - 1]!;
      pts[5 + w * 2] = tip.ry[tip.n - 1]!;
      for (let k = 0; k < st.length; k++) {
        const c = st[k]!;
        this.hemPts[(w * 5 + k) * 2] = c.rx[c.n - 1]!;
        this.hemPts[(w * 5 + k) * 2 + 1] = c.ry[c.n - 1]!;
      }
    }
    const ex = (pts[0]! + pts[2]!) * 0.5;
    const ey = (pts[1]! + pts[3]!) * 0.5;
    const soar = sec.soar;

    // --- What is behind each wing: a shaft of light, or the light well's glow, shows through it.
    for (let w = 0; w < 2; w++) {
      const c = sec.wings[w]!.strands[2]!;
      const wx = c.rx[3]!;
      const wy = c.ry[3]!;
      let b = 0.3 * zw[1];
      for (let i = 0; i < 8; i++) {
        const l = this.ctx.lights.get(`shaft${i}`);
        if (!l || l.intensity <= 0) continue;
        // The beam runs along the key light's direction and lands at the light.
        const dx = wx - l.x;
        const dy = wy - l.y;
        const perp = (dx * KEY_LIGHT.dirY - dy * KEY_LIGHT.dirX) / 105;
        if (dx * KEY_LIGHT.dirX + dy * KEY_LIGHT.dirY < 60)
          b += Math.exp(-perp * perp) * Math.min(1, l.intensity * 2);
      }
      this.back[w]! += (sat(b) - this.back[w]!) * (fresh ? 1 : 1 - Math.exp(-5 * dt));
    }

    // --- Events.
    const feetX = player.cx;
    const feetY = player.feetY;
    if (sig.landed > 8) fx.dust(feetX, feetY, 0, clamp(sig.landed / 21, 0.15, 1), sig.landHard ? 6 : 3);
    if (sig.skid) fx.dust(feetX, feetY, player.vx > 0 ? 1 : -1, 0.45, 3);
    if (sig.dashStart && player.grounded) fx.dust(feetX, feetY, -player.dashDir, 0.45, 3);
    if (sig.wallJump) fx.dust(feetX - player.facing * 18, feetY - 12, 0, 0.3, 2);
    if (sig.doubleJump) this.flash = 0.6;
    // A glint goes in: a warm pulse through the lanterns and eyes.
    if (sig.pickup > 0) {
      this.flash = Math.max(this.flash, sig.great ? 1 : 0.35 + 0.5 * sig.pickup);
      // ... and it travels: lantern, down the antenna, eyes, wing eye-spots. A step stronger with
      // each glint of a run, capped.
      this.glintT = 0;
      this.glintK = sig.great ? 1.2 : Math.min(1.1, 0.7 + 0.1 * Math.max(0, sig.combo));
    }
    this.glintT += dt;
    view.glintT = this.glintT;
    view.glintK = this.glintK;
    // A beat of the wings puffs dust from the hems; so does the catch.
    if (sig.beat) fx.puff(this.hemPts, 10, 16, player.vx * 60, player.vy * 60);
    // The slash: the blade in her hand, its trail, and sparks where it lands (the target's side
    // nearest her; the pod draws its own burst).
    view.slashW = rig.slashW;
    view.bladeFront = rig.slashW > 0.3 && rig.wWall > 0.5;
    view.swordSide = rig.swordSide;
    view.hop = rig.slashHop;
    view.bladeOver = rig.slashDir === 'up' && rig.slashHome < 0.5 && !view.bladeFront;
    const sg = rig.slashFacing;
    view.bladeAng = Math.atan2(rig.bladeY, rig.bladeX);
    // The blade shortens seen end on, and smears a little longer at the height of the cut.
    const cq = rig.cutQ;
    view.bladeLen = (0.5 + 0.5 * rig.slashLen) * (1 + (cq > 0 && cq < 1 ? 0.3 * Math.sin(Math.PI * cq) : 0));
    const chestX = rig.frame.j[J_CHEST * 2]!;
    const chestY = rig.frame.j[J_CHEST * 2 + 1]!;
    const heavy = rig.slashStep === 3 && rig.slashDir !== 'down';
    if (rig.cutStart) {
      this.blade.begin(rig.stroke, heavy);
      // The finisher throws the wings wide: a little of their dust comes loose. Only then.
      if (heavy) fx.puff(this.hemPts, 10, 9, player.vx * 60 + sg * 60, player.vy * 60 - 30);
    }
    if (cq >= 0) this.blade.lay(chestX, chestY, cq, this.cutAt);
    this.blade.update(dt, player.hitstop > 0 && !sig.slashHit);
    if (sig.slashHit) {
      this.blade.pin();
      const dx = player.cx - rig.hitX;
      const dy = player.cy - rig.hitY;
      const dl = Math.hypot(dx, dy) || 1;
      this.hitX = rig.hitX + (dx / dl) * 14;
      this.hitY = rig.hitY + (dy / dl) * 14;
      // Along the cut: the way the blade's point is travelling right now.
      const q = sat(Math.max(0.05, cq));
      rig.strokeAt(Math.min(1, q + 0.04), this.tan);
      rig.strokeAt(Math.max(0, q - 0.04), this.tan2);
      const tx = this.tan.x - this.tan2.x;
      const ty = this.tan.y - this.tan2.y;
      const tl = Math.hypot(tx, ty) || 1;
      this.hitDx = tx / tl;
      this.hitDy = ty / tl;
      fx.sparks(this.hitX, this.hitY, this.hitDx, this.hitDy, rig.hitPower);
      this.flash = Math.max(this.flash, 0.2);
    }
    // --- Hurt, fading, re-forming.
    const bp = this.bodyPts;
    bp.set(this.hemPts);
    for (let i = 0; i < 3; i++) {
      const jj = i === 0 ? J_HEAD : i === 1 ? J_CHEST : J_HIP;
      bp[20 + i * 2] = rig.frame.j[jj * 2]!;
      bp[21 + i * 2] = rig.frame.j[jj * 2 + 1]!;
    }
    if (sig.hurt) fx.scatter(bp, 13, 7);
    // Her last light: she comes apart into dust as she goes.
    if (rig.fadeK > 0 && rig.fadeK < 1) {
      this.fadeAcc += dt * 150;
      const nn = Math.floor(this.fadeAcc);
      this.fadeAcc -= nn;
      if (nn > 0) fx.scatter(bp, 13, nn);
    }
    if (sig.reform) {
      fx.gather(player.cx, player.cy, 46, 38, 110);
      this.flash = 0;
    }
    // The lights rekindle as she comes together: one soft swell.
    if (rig.reformK > 0 && rig.reformK < 0.5) this.flash = Math.max(this.flash, 0.45 * rig.reformK * 2);
    this.flash = Math.max(0, this.flash - dt * 1.9);

    // --- Dust rises off the wings; more of it when she moves.
    const moving = sat(Math.hypot(player.vx, player.vy) / 10);
    const rate = fresh ? 0 : (2.2 + 9 * moving) * (1 - 0.7 * soar) + 22 * rig.wDash + 8 * this.flash;
    fx.shed(dt, rate, mid.rx[2]!, mid.ry[2]!, 13, player.vx * 9, player.vy * 9);
    // Gliding, it comes off the wing tips and the hem instead and hangs behind her as a fine trail.
    if (!fresh)
      fx.trail(
        dt,
        soar * (26 + 40 * moving + 110 * Math.max(0, rig.catchK)),
        this.hemPts,
        10,
        player.vx * 60,
        player.vy * 60,
      );
    fx.update(dt, clock);

    // --- Trails: lit by how fast each point is really moving. The wing tips draw long soft ones
    // while she glides.
    for (let i = 0; i < 4; i++) {
      const x = pts[i * 2]!;
      const y = pts[i * 2 + 1]!;
      const v = fresh || dt <= 0 ? 0 : Math.hypot(x - this.lastX[i]!, y - this.lastY[i]!) / dt;
      this.lastX[i] = x;
      this.lastY[i] = y;
      const fast = sat((v - 330) / 600);
      let k: number;
      if (i < 2) k = fast * (1 - 0.75 * soar) + 0.3 * rig.spinW;
      else
        k =
          (i - 2 === nearIdx ? fast * 0.75 * (1 - sat(Math.abs(rig.slashWing))) + 0.3 * rig.spinW : 0) *
            (1 - soar) +
          soar * (0.3 + 0.3 * fast);
      this.trails[i]!.push(dt, x, y, k);
    }
    this.started = true;

    // --- Draw.
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    p.fw = clamp(1 / scale, 0.06, 1.5);
    const flicker = 0.95 + 0.045 * noise1(clock * 4.3, 21) + 0.03 * Math.sin(clock * 1.3);
    const glow =
      flicker * (1 + 0.3 * rig.wDash + 0.55 * this.flash + 0.2 * soar + 0.25 * Math.max(0, rig.catchK));
    // Health shows in her lanterns: dimmer with each light lost, uneasy on the last one; out when she fades.
    const hpK = player.hpMax > 1 ? sat((player.hp - 1) / (player.hpMax - 1)) : 1;
    const low = player.hp <= 1 && player.hpMax > 1 ? 0.86 + 0.14 * Math.sin(clock * 5.2) : 1;
    const whole = (1 - rig.fadeK) * (1 - rig.reformK);
    const lit = (0.5 + 0.5 * hpK) * low * whole;
    view.glow = glow * lit;
    // While nothing can hurt her she pulses softly (alpha, never a white flash); gone when she has faded.
    const safe = player.invuln > 0 && player.stagger <= 0 && player.faded <= 0 ? sat(player.invuln / 12) : 0;
    const pulse = 0.5 - 0.5 * Math.cos(clock * 6.283 * HURT.flickerHz);
    const bodyA = whole * (1 - HURT.flickerDepth * safe * pulse);
    p.l2x = ex;
    p.l2y = ey;
    p.l2r = 60;
    p.l2k = 0;
    p.begin();
    this.trails[2]!.draw(p, FX_GOLD_DEEP, FX_GOLD, 0.2, clock);
    this.trails[3]!.draw(p, FX_GOLD_DEEP, FX_GOLD, 0.2, clock);
    p.alphaK = bodyA;
    p.glowK = whole;
    drawVesper(p, rig.frame, view, clock);
    p.alphaK = 1;
    p.glowK = 1;
    this.trails[0]!.draw(p, FX_GOLD, FX_GOLD_HOT, 0.4);
    this.trails[1]!.draw(p, FX_GOLD, FX_GOLD_HOT, 0.32);
    fx.draw(p, clock);
    this.blade.draw(p, chestX, chestY, 0.25 + 0.75 * view.pale);
    drawImpact(p, this.hitX, this.hitY, rig.hitT, rig.hitPower, this.hitDx, this.hitDy);
    p.end(player.cx, player.cy);

    const e = this.light;
    e.x = ex;
    e.y = ey;
    e.radius = 300 + 70 * rig.wDash + 90 * this.flash + 50 * soar;
    e.intensity = glow * 1.15 * lit;
  }

  /**
   * One somersault turn or two: `?turns=1|2`, else what was chosen last (localStorage), else two.
   * T flips it while playing; `window.__vesper.turns` reads and sets it for tools.
   */
  private initTurns(): void {
    if (typeof window === 'undefined') return;
    let n = 2;
    try {
      const q = new URLSearchParams(window.location.search).get('turns');
      const saved = window.localStorage.getItem(TURNS_KEY);
      n = q === '2' || q === '1' ? Number(q) : saved === '1' ? 1 : 2;
    } catch {
      // Storage can be blocked: the default.
    }
    Rig.turns = n === 2 ? 2 : 1;
    window.addEventListener('keydown', this.onKey);
    const self = this;
    (window as unknown as { __vesper?: unknown }).__vesper = {
      get turns(): number {
        return Rig.turns;
      },
      set turns(v: number) {
        self.setTurns(v === 2 ? 2 : 1, false);
      },
      /** For capture tools: hide her (a frame with and one without gives her silhouette by difference). */
      get hidden(): boolean {
        return !self.painter.mesh.visible;
      },
      set hidden(v: boolean) {
        self.painter.mesh.visible = !v;
      },
    };
  }

  private setTurns(n: number, show: boolean): void {
    Rig.turns = n === 2 ? 2 : 1;
    try {
      window.localStorage.setItem(TURNS_KEY, String(Rig.turns));
    } catch {
      // Not remembered, then.
    }
    if (!show) return;
    if (!this.toast) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:18px;bottom:16px;padding:5px 10px;border-radius:6px;background:rgba(10,8,20,.6);' +
        'color:#e8dcc4;font:13px/1.2 Georgia,serif;letter-spacing:.03em;pointer-events:none;z-index:50;' +
        'transition:opacity .25s;opacity:0';
      document.body.appendChild(el);
      this.toast = el;
    }
    this.toast.textContent = `somersault: ${Rig.turns === 2 ? '2 turns' : '1 turn'}`;
    this.toast.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.toast) this.toast.style.opacity = '0';
    }, 1100);
  }

  /** Px of clear air under the feet (to the nearest solid or one-way top below them). */
  private clearBelow(p: PlayerView): number {
    const x0 = p.cx - p.w / 2 + 2;
    const x1 = p.cx + p.w / 2 - 2;
    const sc = this.ctx.scene;
    let best = sc.height - p.feetY;
    for (const r of sc.solids)
      if (r.x < x1 && r.x + r.w > x0 && r.y >= p.feetY - 1) best = Math.min(best, r.y - p.feetY);
    for (const r of sc.oneWays)
      if (r.x < x1 && r.x + r.w > x0 && r.y >= p.feetY - 1) best = Math.min(best, r.y - p.feetY);
    return Math.max(0, best);
  }

  /** Solids beside her at wing height: tells each wing how far to fold and where the face is. */
  private sideGaps(p: PlayerView): void {
    const sc = this.ctx.scene;
    const y0 = p.cy - 62;
    const y1 = p.cy + 22;
    let left = 0;
    let right = sc.width;
    for (const r of sc.solids) {
      if (r.y >= y1 || r.y + r.h <= y0) continue;
      const rx1 = r.x + r.w;
      if (rx1 <= p.cx && rx1 > left) left = rx1;
      if (r.x >= p.cx && r.x < right) right = r.x;
    }
    const sec = this.sec;
    sec.faceX[0] = left;
    sec.faceX[1] = right;
    sec.foldT[0] = smoothstep(118, 44, p.cx - left);
    sec.foldT[1] = smoothstep(118, 44, right - p.cx);
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKey);
      window.clearTimeout(this.toastTimer);
      this.toast?.remove();
    }
    this.layer.removeChild(this.painter.mesh);
    this.painter.mesh.destroy();
    if (this.ctx.lights.get('ember') === this.light) this.ctx.lights.remove('ember');
  }
}

export const skin: SkinDef = {
  id: 'vesper',
  name: 'Vesper, the moth',
  create: (ctx, layer) => new VesperCharacter(ctx, layer),
};
