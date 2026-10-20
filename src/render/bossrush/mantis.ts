/**
 * The Mantis, painted (the boss rush's third boss; sim: src/sim/boss/mantis.ts, memory/bossrush.md). A tall
 * near-black silhouette under the brightest lamp: a long neck, a triangle head with two great pale eyes, raptorial
 * forelegs folded as if praying, wings laid along a long abdomen. Its tells are its own body first:
 *
 *  - the strike's **threat display**: it rears, the wings flare into two fans whose eyespots flash the hunt colour,
 *    quicker as the dash nears; the floor it will cross burns as an ember band;
 *  - the leap: a crouch, wings beating in the air, a reticle on the floor where it will land (tightening);
 *  - the guard: forelegs crossed high, their edges silver (cut it from above);
 *  - a riposte or flurry: a white flash on the blades, then the cut's crescent;
 *  - open: drooped and pale (winded), or knocked askew (a broken guard).
 *
 * Drawn behind her (`back`), its blade arcs and the floor's tells over her (`front`), glows additive. Render time
 * only; reads the sim, never writes it.
 */
import type { Graphics } from 'pixi.js';
import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import type { GlowPool } from '../lantern/glow';
import { mix } from '../scene/lib/look';

export const MANTIS = {
  body: 0x16241b,
  bodyLit: 0x2c4434,
  wing: 0x1a2a1e,
  wingVein: 0x4d6e52,
  eye: 0xdcffe6,
  hunt: 0xff5a3c,
  spot: 0xf2c060,
  blade: 0xe8f4ff,
  open: 0xd8e8d0,
  rim: 0xffb070,
  ember: 0xff7a3c,
  silk: 0xdfe4ee,
  /** Drawn size against its box (it stands ~1.3 times her height). */
  scale: 1.3,
  /** Pose easing, per second (snappy: it is the fast one). */
  ease: 16,
} as const;

interface Pt {
  x: number;
  y: number;
}

interface Fx {
  kind: 'parry' | 'dodge' | 'land' | 'break' | 'rear';
  x: number;
  y: number;
  t: number;
  life: number;
}

/** Eases `a` toward `b` at `rate` per second. */
function ease(a: number, b: number, rate: number, dt: number): number {
  return a + (b - a) * Math.min(1, rate * dt);
}

export class MantisPainter {
  // The pose, eased (render time).
  private lean = 0;
  private crouch = 0;
  private wing = 0;
  private reach = 0;
  private raise = 0;
  private down = 0;
  private tilt = 0;
  private droop = 0;
  private flap = 0;
  private stride = 0;
  private dead = 0;
  private tellT = 0;
  private tellKey = '';
  private readonly fx: Fx[] = [];

  draw(
    e: EnemyState,
    dt: number,
    clock: number,
    sim: SimView,
    g: Graphics,
    front: Graphics,
    glow: GlowPool,
  ): void {
    const b = sim.boss;
    const spec = sim.scene.boss;
    if (!b || !spec) return;
    const floor = spec.floor ?? spec.arena.y + spec.arena.h;
    const M = tuning.mantis;
    const fx = e.x + e.w / 2;
    const fy = e.y + e.h;
    const f = e.facing || 1;
    const m = e.mode;
    const mv = b.move;
    // The tell's progress (0 -> 1) and its beat: flashes that quicken to the strike.
    const key = `${b.tell}:${b.phase}:${b.moves}`;
    if (b.tell && key !== this.tellKey) this.tellT = 0;
    this.tellKey = b.tell ? key : '';
    this.tellT = b.tell ? this.tellT + dt : 0;
    const of = Math.max(1, b.tellFrames / 60 + this.tellT);
    const tk = b.tell ? Math.min(1, this.tellT / of) : 0;
    const beat = b.tell ? 0.5 + 0.5 * Math.sin(this.tellT * (10 + 40 * tk)) : 0;
    // Target pose.
    let lean = 0;
    let crouch = 0;
    let wing = 0;
    let reach = 0;
    let raise = 0;
    let down = 0;
    let tilt = 0;
    let droop = 0;
    let air = false;
    if (b.stage === 'down' || e.gone) return;
    if (m === 'windup' && mv === 'strike') {
      // The threat display: rearing, the wings flared, the forelegs opening.
      wing = 0.35 + 0.65 * Math.min(1, tk * 1.6);
      raise = 0.25;
      reach = 0.15;
      crouch = -0.12;
    } else if (m === 'charge') {
      lean = 1;
      crouch = 0.45;
      reach = 1;
    } else if (m === 'windup' && mv === 'leap') {
      crouch = 0.55;
      wing = 0.2;
      raise = 0.2;
    } else if (m === 'hover') {
      air = true;
      wing = 0.75;
      raise = 0.55;
      tilt = mv === 'hang' ? f * 0.5 : -f * 0.2;
    } else if (m === 'dive') {
      air = true;
      wing = 0.3;
      reach = 1;
      tilt = Math.atan2(b.landX - fx, floor - fy + 1) * -1 * 0.9;
    } else if (m === 'back') {
      air = true;
      wing = 0.6;
      tilt = -f * 0.25;
    } else if (m === 'feint') {
      raise = 1;
      crouch = 0.1;
    } else if (m === 'windup' && (mv === 'riposte' || mv === 'flurry')) {
      raise = 0.7;
      reach = 0.2;
      wing = 0.2;
      lean = 0.15;
    } else if (m === 'slam') {
      reach = 1;
      lean = 0.35;
      crouch = 0.1;
    } else if (m === 'stall' && mv !== 'flurryGap') {
      down = 1;
      lean = 0.55;
      crouch = 0.35;
    } else if (m === 'stall') {
      reach = 0.5;
      lean = 0.25;
    } else if (m === 'recover') {
      droop = e.stunned ? 1 : 0.6;
      tilt = e.stunned ? -f * 0.35 : 0;
      crouch = 0.15;
    } else if (m === 'rear') {
      wing = 1;
      raise = 0.8;
      crouch = -0.25;
    } else if (m === 'pause') {
      raise = 0.3;
      crouch = 0.2;
    }
    const r = MANTIS.ease * (m === 'charge' || m === 'slam' || m === 'dive' ? 2.2 : 1);
    this.lean = ease(this.lean, lean, r, dt);
    this.crouch = ease(this.crouch, crouch, r, dt);
    this.wing = ease(this.wing, wing, r * 0.8, dt);
    this.reach = ease(this.reach, reach, r * 1.4, dt);
    this.raise = ease(this.raise, raise, r, dt);
    this.down = ease(this.down, down, r, dt);
    this.tilt = ease(this.tilt, tilt, r * 0.6, dt);
    this.droop = ease(this.droop, droop, r * 0.6, dt);
    this.dead = ease(this.dead, m === 'dead' ? 1 : 0, 1.5, dt);
    this.flap = air ? this.flap + dt * 38 : 0;
    this.stride += Math.abs(e.vx) * dt * 3.2;

    // --- The floor's tells (over her: she must see them).
    if (b.tell === 'strike' || b.tell === 'flurry' || b.tell === 'riposte') {
      const x0 = b.tellX0;
      const x1 = b.tellX1;
      const n = Math.max(2, Math.round((x1 - x0) / 120));
      for (let k = 0; k < n; k++) {
        const x = x0 + ((x1 - x0) * (k + 0.5)) / n;
        glow.add(x, floor - 4, (x1 - x0) / n, MANTIS.ember, (0.12 + 0.3 * tk) * (0.6 + 0.4 * beat), 16);
      }
      front.moveTo(x0, floor - 2).lineTo(x1, floor - 2);
      front.stroke({ color: MANTIS.hunt, width: 3, alpha: 0.2 + 0.55 * tk * (0.5 + 0.5 * beat) });
      // Chevrons along it point the way it will run.
      const dir = b.tell === 'strike' ? b.dir : f;
      for (let x = x0 + 40; x < x1 - 20; x += 90) {
        front
          .moveTo(x - dir * 10, floor - 18)
          .lineTo(x + dir * 6, floor - 10)
          .lineTo(x - dir * 10, floor - 2);
      }
      front.stroke({ color: MANTIS.hunt, width: 2, alpha: 0.15 + 0.4 * tk });
    }
    if (b.tell === 'leap' || m === 'dive') {
      // The reticle where it will land: a ring that tightens, a cross, a band on the floor.
      const lx = b.landX;
      const k = m === 'dive' ? 1 : tk;
      const rr = 110 - 60 * k;
      front.moveTo(lx + rr, floor - 6);
      front.ellipse(lx, floor - 6, rr, rr * 0.28);
      front.stroke({ color: MANTIS.hunt, width: 2.5, alpha: 0.35 + 0.5 * k * (0.6 + 0.4 * beat) });
      front.moveTo(lx - 18, floor - 6).lineTo(lx + 18, floor - 6);
      front.moveTo(lx, floor - 20).lineTo(lx, floor + 4);
      front.stroke({ color: MANTIS.hunt, width: 2, alpha: 0.5 + 0.4 * k });
      glow.add(lx, floor - 6, M.diveBand, MANTIS.ember, 0.15 + 0.3 * k, 22);
    }
    if (b.waveT > 0) {
      // P3's ripple: a crest of light running along the floor.
      const wx = b.waveX;
      const h = M.rippleH;
      front
        .moveTo(wx - 26, floor)
        .quadraticCurveTo(wx - 8, floor - h * 1.1, wx + b.waveDir * 18, floor - h * 0.3)
        .lineTo(wx + 26, floor);
      front.fill({ color: MANTIS.ember, alpha: 0.55 });
      glow.add(wx, floor - h / 2, 50, MANTIS.ember, 0.45, 30);
    }

    // --- The body.
    const s = MANTIS.scale;
    const lift = (this.crouch < 0 ? -this.crouch * 26 : 0) - this.crouch * 34;
    const waistV = 66 + lift * 0.6;
    const tl = this.tilt - this.dead * f * 1.2;
    const pitch = this.lean * 1.15 + this.droop * 0.35;
    // Local (u forward, v up) -> world: the pitch leans the upper body forward about the waist; tilt turns it all.
    const cw = Math.cos(pitch);
    const sw = Math.sin(pitch);
    const ct = Math.cos(tl);
    const st = Math.sin(tl);
    const cy0 = air ? e.h / 2 : 0;
    const W = (u: number, v: number, upper = true): Pt => {
      let uu = u;
      let vv = v;
      if (upper) {
        // (Pitch about the waist: v up turns toward u forward.)
        const du = u;
        const dv = v - waistV;
        uu = du * cw + dv * sw;
        vv = waistV - du * sw + dv * cw;
      }
      vv -= cy0 / s;
      // Tilt (the whole figure, about its middle when airborne, its feet on the ground).
      const ru = uu * ct - vv * st;
      const rv = uu * st + vv * ct;
      return { x: fx + f * ru * s, y: fy - cy0 - rv * s };
    };
    const fade = 1 - this.dead * 0.75;
    const body = mix(MANTIS.body, MANTIS.open, this.droop * 0.25 + this.dead * 0.2);
    const near = body;
    const far = mix(body, 0x000000, 0.35);
    // The lamp's light on it (its rim): from the brightest lamp, warm.
    const hi = (sim.scene.lures ?? []).findIndex((l) => l.id === spec.heart);
    const lamp = hi >= 0 ? sim.scene.lures?.[hi] : undefined;
    const lampOn = hi >= 0 && (sim.lures.hp[hi] ?? 0) > 0;
    const rdx = lamp ? lamp.x - fx : 0;
    const rdy = lamp ? lamp.y - (fy - 80) : -1;
    const rd = Math.hypot(rdx, rdy) || 1;
    const rimK = lampOn ? Math.max(0.25, 1 - rd / 1600) : 0.15;
    const rx = (rdx / rd) * 2.2;
    const ry = (rdy / rd) * 2.2;

    // Walking legs (two pairs; the far ones darker), feet on the floor or tucked in the air.
    const legs: Array<[number, number, number]> = [
      [4, 18, 0],
      [-10, -20, 1.6],
      [-6, -44, 3.1],
      [-14, -66, 4.4],
    ];
    for (let pass = 0; pass < 2; pass++) {
      const col = pass === 0 ? far : near;
      for (let k = pass; k < legs.length; k += 2) {
        const [hu, footU, ph] = legs[k] as [number, number, number];
        const sw2 = Math.sin(this.stride + ph) * 8;
        const hip = W(hu, waistV - 4, false);
        const foot = air
          ? W(hu + 10, waistV - 34, false)
          : this.dead > 0.5
            ? W(footU * 0.6, 4, false)
            : { x: fx + f * (footU + sw2) * s, y: fy };
        const kx = (hip.x + foot.x) / 2 + f * (k < 2 ? 14 : -10) * s;
        const ky = Math.min(hip.y, foot.y) - 18 * s;
        g.moveTo(hip.x, hip.y).lineTo(kx, ky).lineTo(foot.x, foot.y);
        g.stroke({ color: col, width: 3.2 * s, alpha: fade, join: 'round', cap: 'round' });
      }
    }
    // The abdomen: long, back and a little down, ridged.
    const abd = [
      W(6, waistV + 4, false),
      W(-24, waistV + 14, false),
      W(-56, waistV + 6, false),
      W(-84, waistV - 14, false),
      W(-92, waistV - 22, false),
      W(-66, waistV - 26, false),
      W(-34, waistV - 18, false),
      W(0, waistV - 8, false),
    ];
    g.poly(abd.flatMap((p) => [p.x, p.y])).fill({ color: near, alpha: fade });
    // Rim light along its back.
    const a1 = abd[1] as Pt;
    const a2 = abd[2] as Pt;
    const a3 = abd[3] as Pt;
    g.moveTo(a1.x + rx, a1.y + ry)
      .lineTo(a2.x + rx, a2.y + ry)
      .lineTo(a3.x + rx, a3.y + ry);
    g.stroke({ color: MANTIS.rim, width: 1.6, alpha: 0.55 * rimK * fade });
    // The wings: laid along the abdomen, or flared up into two fans with eyespots (the threat display).
    const wf = this.wing;
    if (wf < 0.25) {
      const w0 = W(2, waistV + 16);
      const w1 = W(-86, waistV - 6, false);
      const w2 = W(-40, waistV + 22, false);
      g.poly([w0.x, w0.y, w2.x, w2.y, w1.x, w1.y, (w0.x + w1.x) / 2, (w0.y + w1.y) / 2 + 6]).fill({
        color: MANTIS.wing,
        alpha: fade,
      });
    }
    if (wf > 0.05) {
      const base = W(-4, waistV + 22);
      const flap = Math.sin(this.flap) * 0.5 * (air ? 1 : 0);
      for (let k = 0; k < 2; k++) {
        // Two fans: the hind wing bigger, behind; each swept up-back from the thorax.
        const big = k === 0 ? 1.15 : 0.9;
        const a0 = (k === 0 ? 1.55 : 1.15) + flap;
        const span = (0.25 + 1.1 * wf) * (k === 0 ? 1 : 0.85);
        const R = (40 + 60 * wf) * big * s;
        const pts: number[] = [base.x, base.y];
        const n = 10;
        for (let i = 0; i <= n; i++) {
          const a = a0 + span * (i / n - 0.5) * 2 * 0.6;
          // (Angle measured from straight up, sweeping back: -sin for back along u.)
          const ru = -Math.sin(a - 1.2) * R;
          const rv = Math.cos(a - 1.2) * R;
          pts.push(base.x + f * ru, base.y - rv);
        }
        g.poly(pts).fill({
          color: mix(MANTIS.wing, 0x000000, k === 0 ? 0.25 : 0),
          alpha: (0.75 + 0.2 * wf) * fade,
        });
        // Veins.
        for (let i = 2; i < pts.length; i += 4)
          g.moveTo(base.x, base.y).lineTo(pts[i] as number, pts[i + 1] as number);
        g.stroke({ color: MANTIS.wingVein, width: 1, alpha: 0.5 * wf * fade });
        // The eyespot: a gold ring round a dark heart that flashes the hunt colour in the tell.
        const mi = Math.floor(n / 2) * 2 + 2;
        const ex = base.x + ((pts[mi] as number) - base.x) * 0.62;
        const ey = base.y + ((pts[mi + 1] as number) - base.y) * 0.62;
        const er = (9 + 9 * wf) * big * s;
        g.circle(ex, ey, er).fill({ color: MANTIS.spot, alpha: 0.8 * wf * fade });
        const hot = b.tell === 'strike' ? beat * tk : 0;
        g.circle(ex, ey, er * 0.62).fill({ color: mix(0x120806, MANTIS.hunt, hot), alpha: wf * fade });
        g.circle(ex - er * 0.2, ey - er * 0.2, er * 0.16).fill({ color: 0xffffff, alpha: 0.7 * wf * fade });
        if (hot > 0.05) glow.add(ex, ey, er * 3, MANTIS.hunt, 0.5 * hot);
      }
    }
    // The prothorax (its long neck) and the head.
    const neck0 = W(4, waistV + 2);
    const neckTop = W(16 + 4 * this.raise, 122 - this.droop * 18);
    g.moveTo(neck0.x, neck0.y).lineTo(neckTop.x, neckTop.y);
    g.stroke({ color: near, width: 11 * s, alpha: fade, cap: 'round' });
    g.moveTo(neck0.x + rx, neck0.y + ry).lineTo(neckTop.x + rx, neckTop.y + ry);
    g.stroke({ color: MANTIS.rim, width: 1.4, alpha: 0.6 * rimK * fade });
    const hL = W(12 + 4 * this.raise, 136 - this.droop * 22);
    const hR = W(34 + 4 * this.raise, 134 - this.droop * 22);
    const hM = W(26 + 4 * this.raise, 114 - this.droop * 22);
    g.poly([hL.x, hL.y, hR.x, hR.y, hM.x, hM.y]).fill({ color: near, alpha: fade });
    // Antennae, swept back, twitching.
    const tw = Math.sin(clock * 7) * 3;
    const an = W(22, 140 - this.droop * 22);
    const t1 = W(-6, 180 + tw - this.droop * 30);
    const t2 = W(8, 186 - tw - this.droop * 30);
    g.moveTo(an.x, an.y).quadraticCurveTo(an.x - f * 6, an.y - 30, t1.x, t1.y);
    g.moveTo(an.x, an.y).quadraticCurveTo(an.x, an.y - 34, t2.x, t2.y);
    g.stroke({ color: near, width: 1.4, alpha: fade });
    // The eyes: two great pale compound eyes at the head's corners; the hunt colour in a tell.
    const eyeC = b.tell ? mix(MANTIS.eye, MANTIS.hunt, Math.min(1, 0.3 + tk)) : MANTIS.eye;
    const eyeA = (0.85 - this.droop * 0.35) * fade;
    for (const p of [hL, hR]) g.circle(p.x, p.y, 5.2 * s).fill({ color: eyeC, alpha: eyeA });
    glow.add(
      (hL.x + hR.x) / 2,
      (hL.y + hR.y) / 2,
      26 + 30 * tk,
      eyeC,
      (0.35 + 0.5 * tk * (0.5 + 0.5 * beat)) * fade,
    );

    // The raptorial forelegs: the near one over the body, the far one darker behind it.
    for (let k = 1; k >= 0; k--) {
      const col = k === 0 ? near : far;
      const off = k === 0 ? 0 : -6;
      const coxa = W(14 + off, 104);
      // Knee and tip from the blend of folded / reaching / raised (guard) / driven down (stuck).
      const fold = { ku: 34, kv: 114, tu: 24, tv: 90 };
      const rch = { ku: 76, kv: 96, tu: 130, tv: 90 };
      const rai = { ku: 46 + off, kv: 158, tu: 6 - off * 2, tv: 136 };
      const dwn = { ku: 62, kv: 58, tu: 84, tv: 0 };
      const wF = Math.max(0, 1 - this.reach - this.raise - this.down);
      const tot = wF + this.reach + this.raise + this.down || 1;
      const mixp = (a: keyof typeof fold): number =>
        (fold[a] * wF + rch[a] * this.reach + rai[a] * this.raise + dwn[a] * this.down) / tot;
      const knee = W(mixp('ku'), mixp('kv'));
      const tip =
        this.down > 0.5 && !air ? { x: fx + f * mixp('tu') * s, y: fy + 4 } : W(mixp('tu'), mixp('tv'));
      g.moveTo(coxa.x, coxa.y).lineTo(knee.x, knee.y);
      g.stroke({ color: col, width: 7 * s, alpha: fade, cap: 'round' });
      g.moveTo(knee.x, knee.y).lineTo(tip.x, tip.y);
      g.stroke({ color: col, width: 4.2 * s, alpha: fade, cap: 'round' });
      // Spines on the femur's inner edge.
      for (let i = 1; i <= 3; i++) {
        const u = i / 4;
        const px = coxa.x + (knee.x - coxa.x) * u;
        const py = coxa.y + (knee.y - coxa.y) * u;
        g.moveTo(px, py).lineTo(px + (tip.x - knee.x) * 0.12, py + (tip.y - knee.y) * 0.12 + 4);
      }
      g.stroke({ color: col, width: 1.6, alpha: fade });
      // The blade's edge: silver in the guard and before a cut, else the lamp's glint.
      const keen =
        m === 'feint'
          ? 0.8 + 0.2 * Math.sin(clock * 9)
          : b.tell === 'riposte' || b.tell === 'flurry'
            ? beat
            : 0;
      g.moveTo(knee.x, knee.y - 1).lineTo(tip.x, tip.y - 1);
      g.stroke({
        color: keen > 0 ? MANTIS.blade : MANTIS.rim,
        width: keen > 0 ? 2.2 : 1.2,
        alpha: (keen > 0 ? 0.5 + 0.5 * keen : 0.4 * rimK) * fade,
      });
      if (keen > 0 && k === 0) glow.add(tip.x, tip.y, 30 + 30 * keen, MANTIS.blade, 0.25 * keen);
    }
    // Open: a pale breath on it (the window reads).
    if (m === 'recover' || (m === 'stall' && mv !== 'flurryGap'))
      glow.add(fx, fy - 70 * s, 90, MANTIS.open, 0.16 + 0.06 * Math.sin(clock * 6));

    // --- Its blade's arcs and motion (over her).
    if (m === 'charge') {
      for (let k = 1; k <= 4; k++) {
        const y = fy - 18 - k * 12;
        front.moveTo(fx - f * (40 + k * 30), y).lineTo(fx - f * (110 + k * 50), y);
      }
      front.stroke({ color: MANTIS.blade, width: 1.5, alpha: 0.35 });
    }
    if (m === 'slam' && b.hitW > 0) {
      const riposte = mv === 'riposte';
      const R = riposte ? M.ripReach : M.flurryReach;
      const cx = fx;
      const cy = fy - 70;
      const a0 = f > 0 ? -1.3 : Math.PI + 1.3;
      const a1 = f > 0 ? 0.9 : Math.PI - 0.9;
      const k = 1 - e.timer / Math.max(1, riposte ? M.ripLive : M.flurryLive);
      front.moveTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
      front.arc(cx, cy, R, a0, a0 + (a1 - a0) * Math.min(1, 0.4 + k), f < 0);
      front.stroke({
        color: MANTIS.blade,
        width: riposte ? 10 : 7,
        alpha: 0.75 * (1 - k * 0.6),
        cap: 'round',
      });
      glow.add(cx + f * R * 0.6, cy, R * 0.8, MANTIS.blade, 0.25 * (1 - k));
    }
    if (m === 'dive') {
      front.moveTo(fx, fy - 60).lineTo(fx - (b.landX - fx) * 0.25, fy - 240);
      front.stroke({ color: MANTIS.blade, width: 2, alpha: 0.3 });
    }

    // The sealed door: old silk.
    if (b.locked) {
      for (const d of spec.lock) {
        for (let k = 0; k < Math.max(6, d.w / 6); k++) {
          const x = d.x + (k * d.w) / Math.max(6, d.w / 6);
          g.moveTo(x, d.y).lineTo(x + Math.sin(clock + k) * 3, d.y + d.h);
        }
        g.stroke({ color: MANTIS.silk, width: 1, alpha: 0.45 });
        g.rect(d.x, d.y, d.w, d.h).fill({ color: MANTIS.silk, alpha: 0.12 });
      }
    }
  }

  /**
   * Every frame in any boss room (lantern/creatures.ts): the flashes the fight's events leave in the world (the
   * parry's spark, the Moonstep's silver ring, a landing's dust, a guard breaking, a rear's cry).
   */
  flashes(dt: number, sim: SimView, front: Graphics, glow: GlowPool): void {
    this.onEvents(sim);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const q = this.fx[i] as Fx;
      q.t += dt;
      if (q.t >= q.life) {
        this.fx.splice(i, 1);
        continue;
      }
      const k = q.t / q.life;
      if (q.kind === 'parry' || q.kind === 'break') {
        const c = q.kind === 'parry' ? MANTIS.blade : MANTIS.spot;
        for (let j = 0; j < 8; j++) {
          const a = (j / 8) * Math.PI * 2;
          const r0 = 10 + 30 * k;
          const r1 = r0 + 40 * (1 - k);
          front.moveTo(q.x + Math.cos(a) * r0, q.y + Math.sin(a) * r0);
          front.lineTo(q.x + Math.cos(a) * r1, q.y + Math.sin(a) * r1);
        }
        front.stroke({ color: c, width: 3, alpha: 1 - k });
        glow.add(q.x, q.y, 80 * (1 - k * 0.5), c, 0.6 * (1 - k));
      } else if (q.kind === 'dodge') {
        front.moveTo(q.x + 20 + 90 * k, q.y);
        front.circle(q.x, q.y, 20 + 90 * k);
        front.stroke({ color: 0xd4e4ff, width: 3 * (1 - k) + 0.5, alpha: 0.8 * (1 - k) });
        glow.add(q.x, q.y, 70, 0xd4e4ff, 0.5 * (1 - k));
      } else if (q.kind === 'land') {
        front.moveTo(q.x + 30 + 160 * k, q.y);
        front.ellipse(q.x, q.y, 30 + 160 * k, 8 + 20 * k);
        front.stroke({ color: MANTIS.rim, width: 2, alpha: 0.6 * (1 - k) });
      } else if (q.kind === 'rear') {
        front.moveTo(q.x + 40 + 400 * k, q.y);
        front.circle(q.x, q.y, 40 + 400 * k);
        front.stroke({ color: MANTIS.hunt, width: 4 * (1 - k) + 1, alpha: 0.6 * (1 - k) });
      }
    }
  }

  private onEvents(sim: SimView): void {
    for (const ev of sim.events) {
      if (ev.type === 'bossParry') this.fx.push({ kind: 'parry', x: ev.x, y: ev.y, t: 0, life: 0.35 });
      else if (ev.type === 'bossDodge') this.fx.push({ kind: 'dodge', x: ev.x, y: ev.y, t: 0, life: 0.45 });
      else if (ev.type === 'bossCue' && ev.set === 'leap' && ev.cue === 'land')
        this.fx.push({ kind: 'land', x: ev.x, y: ev.y, t: 0, life: 0.5 });
      else if (ev.type === 'bossCue' && ev.set === 'guard' && ev.cue === 'break')
        this.fx.push({ kind: 'break', x: ev.x, y: ev.y + 40, t: 0, life: 0.5 });
      else if (ev.type === 'bossCue' && (ev.cue === 'rear' || ev.set === 'intro'))
        this.fx.push({ kind: 'rear', x: ev.x, y: ev.y, t: 0, life: 0.9 });
    }
  }
}
