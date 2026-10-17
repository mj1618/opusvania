// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Tatter (memory/hatch-and-tatter.md; docs/design/journey.md): a moth of her kind, the other late
 * hatchling, one wing torn short, sat on the branch at the room's `marks.tatter`. It is Wing's rig,
 * wings and painter (vesper/), smaller, re-paletted a step greyer (`Painter.grade`), unarmed, its
 * light nearly out, and its near wing torn (`Secondary.tear`). Render only: no sim body.
 *
 * What it does (all from what render can see: the hatching, her, the clock):
 *   rest      sat hunched, breathing slow, antennae moving, the torn wing twitching wrong;
 *   watch     its head on her cocoon while she is shut in, on her as she breaks out and runs by;
 *   the swarm looks up as it passes, up off its heels, its wings lift to fly and cannot, it sinks back;
 *   after     stays behind: looks the way she went now and then.
 */
import type { Container } from 'pixi.js';
import type { Room } from '../../scene/room';
import { createPlayer } from '../../sim/player/player';
import { tuning } from '../../sim/tuning';
import type { PlayerView, RenderContext } from '../contract';
import { SWARM_PASS, swarmPassFocus, swarmPassWeight } from '../swarm/timing';
import { clamp, lerp, noise1, sat, smoothstep } from './math';
import { drawMothWing, flapWind, TORN, WHOLE, type WingPose } from './tatter-wing';
import { drawVesper, type View } from './vesper/draw';
import { Painter, rgb } from './vesper/paint';
import { J_COLLAR, Rig } from './vesper/rig';
import { Secondary } from './vesper/wings';

/** Knobs (seconds of render time, world px). */
export const TATTER = {
  /** Its size next to hers. */
  scale: 0.82,
  /** The re-palette: saturation and value of its solids and of its lights, and a tint (greyer, a little cooler). */
  grade: { sat: 0.42, val: 0.92, tint: rgb(0xf2f0f6), lightSat: 0.4, lightVal: 0.55 },
  /** Its lantern tips are nearly out; its eyes are dim. */
  glow: 0.28,
  eyes: 0.62,
  /** How torn the near wing is (0..1), and how far it is held off its back (degrees: it cannot fold it). */
  tear: 1,
  hold: 0,
  /**
   * The torn wing is held half open at a wrong angle (of the glide's spread), raised off its back
   * (degrees, negative = up) so its bitten outline shows against the pale stage over the branch.
   */
  splay: 0.9,
  droop: 25,
  /** Its try at the air: a hop off the branch (px) at the wings' peak, and how hard it lands back (it crumples). */
  hop: 16,
  /**
   * Its moth wings (tatter-wing.ts), angles of the span on screen for a moth facing west (rad, y down:
   * negative = raised): the good wing at rest and at the top of its try, the torn one drooping and how
   * little it lifts; spans in px (the torn one shorter).
   */
  wings: { good: -0.85, goodTry: -1.45, torn: 0.34, tornTry: 0, goodSpan: 33, tornSpan: 25 },
  /** Its snapped antenna's length (of a whole one). */
  antenna: 0.5,
  /**
   * The swarm (render/swarm/timing.ts: `SWARM_PASS`, `swarmPassWeight`, `swarmPassFocus`): it looks up
   * `swarmLead` s ahead of the pass weight, at the pass's focus (the moon, view px) taken into the world
   * round where the camera would be with her (`camDy` above her feet), drifting `swarmDx` across it.
   */
  swarmLead: 0.6,
  swarmDx: [-260, 320],
  camDy: -238,
  /**
   * Its try at the air, in s relative to the pass (`SWARM_PASS`): up off its heels from `in` + strain[0]
   * to `full` + strain[1]; the wings lift from `full` + tryWings[0..2]; it sinks back and looks down from
   * `hold` + sink[0..1]. (The crumple after its hop holds it low until the sink lets go.)
   */
  strain: [-0.4, 0, -1.0],
  tryWings: [0.3, 0.9, 1.8],
  sink: [-1.0, 0.8],
  /** She is "near" within this many px (it watches her); further, it lets go and only glances her way. */
  near: 900,
  /** After she has gone: a glance the way she went about every `glanceEvery` s. */
  glanceEvery: 7.5,
  glanceLen: 2.6,
} as const;

export class Tatter {
  readonly mesh;
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly view: View;
  private readonly me: PlayerView;
  private readonly x: number;
  private readonly y: number;
  private readonly facing: number;
  private readonly swarmY: number;
  /** Where the swarm's pass is densest (view px), or null. */
  private readonly focus: { x: number; y: number } | null;
  private started = false;
  private lookW = 0;
  private lookX = 0;
  private lookY = 0;
  /** Render time she has been out of its sight (for the glances after she is gone). */
  private goneT = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
    room: Room,
    at: { x: number; y: number; facing: -1 | 1 },
  ) {
    this.x = at.x;
    this.y = at.y;
    this.facing = at.facing;
    const st = createPlayer(at.x, at.y, tuning, room);
    st.facing = at.facing;
    const feetY = st.y + st.h;
    this.me = { ...st, cx: st.x + st.w / 2, cy: st.y + st.h / 2, feetY } as PlayerView;
    // The swarm's height over it (the room's swarm path), for the look up.
    const path = room.marks?.swarm ?? [];
    let sy = at.y - 560;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      if (at.x >= a[0] && at.x <= b[0]) sy = lerp(a[1], b[1], (at.x - a[0]) / Math.max(1, b[0] - a[0]));
    }
    this.swarmY = sy;
    this.focus = swarmPassFocus(room);
    const p = this.painter;
    p.mesh.label = 'tatter';
    this.mesh = p.mesh;
    // Pinned at its feet, so it can be drawn smaller than she is.
    p.mesh.pivot.set(this.me.cx, feetY);
    p.mesh.position.set(this.me.cx, feetY);
    p.mesh.scale.set(TATTER.scale);
    this.torn = this.facing < 0 ? 1 : 0;
    this.sec.tear[this.torn] = TATTER.tear;
    this.sec.splay[this.torn] = TATTER.splay;
    // ... and one antenna snapped short (the far one: it shows over its head).
    this.sec.antLen[this.torn === 1 ? 0 : 1] = TATTER.antenna;
    this.rig.perch = 1;
    this.view = {
      wings: this.sec.wings,
      antennae: this.sec.antennae,
      open: 0,
      hairX: 0,
      hairY: 0,
      hair2X: 0,
      hair2Y: 0,
      glow: TATTER.glow,
      tuck: 0,
      wall: 0,
      wallDir: 1,
      soar: 0,
      pale: 0.66,
      soarW: this.sec.soarW,
      back: [0, 0],
      glintT: 9,
      glintK: 0,
      slashW: 0,
      bladeAng: 0,
      bladeLen: 1,
      bladeOver: false,
      bladeFront: false,
      swordSide: 0,
      hop: 0,
      spot: 0,
      stream: 0,
      eyeLit: TATTER.eyes,
      unarmed: true,
      wingsHidden: true,
      // (no lantern balls: its light is out)
      tips: [0, 0],
    };
  }

  /**
   * `her`: Wing as drawn (null = not drawn: still inside), `cocoon` her cocoon's hang point,
   * `sinceBreak` render seconds since the break (large = none seen), `stirred` a stir this frame.
   */
  update(
    dt: number,
    clock: number,
    her: PlayerView | null,
    cocoon: { x: number; y: number } | null,
    sinceBreak: number,
    stirred: boolean,
  ): void {
    const T = TATTER;
    const rig = this.rig;
    const t = sinceBreak;
    this.lastT = t;
    const headY = this.y - 46;
    // --- What it looks at, and how firmly.
    let lx = this.x + this.facing * 200;
    let ly = this.y - 30;
    let lw = 0.25;
    if (!her && cocoon) {
      // Shut in: its eyes on her cocoon, and on every stir.
      lx = cocoon.x;
      ly = cocoon.y + 50;
      lw = 0.75;
    } else if (her) {
      const d = Math.abs(her.cx - this.x);
      const near = 1 - smoothstep(T.near * 0.6, T.near, d);
      lx = her.cx;
      ly = her.feetY - 50;
      lw = 0.3 + 0.7 * near;
      if (near < 0.05) this.goneT += dt;
      else this.goneT = 0;
      // She has gone: it looks the way she went now and then, and otherwise at the branch before it.
      if (this.goneT > 1.5) {
        const g = (this.goneT % T.glanceEvery) / T.glanceLen;
        const k = g < 1 ? Math.sin(Math.PI * g) ** 2 : 0;
        lx = lerp(this.x + this.facing * 80, her.cx, k);
        ly = lerp(this.y + 10, headY - 20, k);
        lw = 0.35 + 0.55 * k;
      }
    }
    // The swarm passing over the moon: its head comes up and follows it across the sky.
    const P = SWARM_PASS;
    const sw = swarmPassWeight(t + T.swarmLead);
    if (sw > 1e-3) {
      const u = sat((t - P.in) / (P.out - P.in));
      const camX = Math.max(960, her?.cx ?? this.x);
      const camY = (her?.feetY ?? this.y) + T.camDy;
      const f = this.focus;
      const sx = f ? camX + (f.x - 960) : this.x + 300;
      const sy = f ? camY + (f.y - 540) : this.swarmY;
      lx = lerp(lx, sx + lerp(T.swarmDx[0], T.swarmDx[1], u), sw);
      ly = lerp(ly, sy, sw);
      lw = lerp(lw, 1, sw);
    }
    // ... and after it, a look down at the branch: it stays.
    const sink =
      t < P.hold + T.sink[1] + 1
        ? smoothstep(P.hold + T.sink[0], P.hold + T.sink[0] + 0.5, t) *
          (1 - smoothstep(P.hold + T.sink[1] - 0.6, P.hold + T.sink[1], t))
        : 0;
    if (sink > 1e-3) {
      lx = lerp(lx, this.x + this.facing * 70, sink);
      ly = lerp(ly, this.y + 30, sink);
      lw = lerp(lw, 0.9, sink);
    }
    // Looking down, the antennae droop with the head (a lowered chin alone lifts them into rods).
    rig.antExtra = 34 * sink;
    rig.antCurlExtra = 0.12 * sink;
    // The look moves like a head, not a cursor.
    if (!this.started) {
      this.lookX = lx;
      this.lookY = ly;
      this.lookW = lw;
    }
    const k = 1 - Math.exp(-6 * dt);
    this.lookX += (lx - this.lookX) * k;
    this.lookY += (ly - this.lookY) * k;
    this.lookW += (lw - this.lookW) * (1 - Math.exp(-4 * dt));
    rig.look.x = this.lookX;
    rig.look.y = this.lookY;
    rig.look.w = this.lookW;
    // --- Its body: up off its heels for the swarm (and a little at her break), the wings' one try.
    const brk = t < 2 ? smoothstep(0, 0.25, t) * (1 - smoothstep(0.9, 1.8, t)) * 0.35 : 0;
    const strain =
      t < P.hold + T.strain[2] + 1
        ? smoothstep(P.in + T.strain[0], P.full + T.strain[1], t) *
          (1 - smoothstep(P.hold + T.strain[2] - 0.9, P.hold + T.strain[2], t))
        : 0;
    const stir = stirred ? 1 : 0;
    this.stirK = Math.max(this.stirK * Math.exp(-3 * dt), stir);
    rig.strain = Math.max(brk, strain, 0.18 * this.stirK);
    rig.perch = 1 - 0.75 * rig.strain;
    const tw =
      t < P.full + T.tryWings[2]
        ? smoothstep(P.full + T.tryWings[0], P.full + T.tryWings[1], t) *
          (1 - smoothstep(P.full + T.tryWings[1], P.full + T.tryWings[2], t))
        : 0;
    // The try: two beats of the wings (the torn one barely lifts), a hop off the branch, and it fails.
    const beats = Math.sin(Math.PI * 2.4 * Math.max(0, t - P.full - T.tryWings[0])) ** 2;
    rig.tryWings = tw * (0.5 + 0.5 * beats) * (0.9 + 0.1 * noise1(clock * 9, 171));
    const hu = (t - (P.full + T.tryWings[1] - 0.15)) / 0.5;
    this.hopY = hu > 0 && hu < 1 ? -T.hop * Math.sin(Math.PI * hu) ** 1.5 : 0;
    // ... and lands back hard: a crumple (lower, head down) that lets go slowly.
    const crumple =
      hu >= 1 && t < P.hold + T.sink[1] ? 1 - smoothstep(P.hold + T.sink[0], P.hold + T.sink[1], t) : 0;
    rig.strain *= 1 - crumple;
    rig.perch = Math.min(1, rig.perch + crumple);
    // The torn wing hangs splayed and limp, twitching now and then; in the try it lifts only a little.
    this.sec.hold[this.torn] = TATTER.hold;
    this.sec.splay[this.torn] = TATTER.splay;
    this.sec.droop[this.torn] = TATTER.droop * (1 + 0.06 * noise1(clock * 0.7, 181)) * (1 - 0.45 * tw);
    rig.update(dt, clock, this.me, []);
    const fresh = !this.started;
    if (fresh) this.sec.reset();
    this.sec.update(dt, clock, rig, rig.frame, this.me);
    const v = this.view;
    v.open = this.sec.open;
    v.soar = Math.max(this.sec.soar, this.sec.soarW[0], this.sec.soarW[1]);
    v.hairX = noise1(clock * 0.6, 61) * 0.4;
    v.hairY = noise1(clock * 0.8, 63) * 0.3;
    v.hair2X = noise1(clock * 1.1, 65) * 0.6;
    v.hair2Y = noise1(clock * 1.3, 67) * 0.5;
    v.wallDir = rig.frame.s[0]! >= 0 ? 1 : -1;
    // Its light: almost out; a little stronger while it strains toward the swarm.
    v.glow = T.glow * (1 + 0.6 * strain) * (0.92 + 0.08 * Math.sin(clock * 1.1));
    v.eyeLit = rig.eyeLit * T.eyes * (1 + 0.25 * sw);
    this.started = true;
    this.draw(clock);
  }

  private stirK = 0;
  private readonly goodPose: WingPose = { x: 0, y: 0, ang: 0, span: 1, lead: -1 };
  private readonly tornPose: WingPose = { x: 0, y: 0, ang: 0, span: 1, lead: -1 };

  /** A wing angle authored for a moth facing west (span pointing back = east) turned to its facing. */
  private angFor(a: number, back: number): number {
    return back > 0 ? a : Math.PI - a;
  }
  private lastT = 99;

  /** For tools (`__tatter`): what it is doing now. */
  get info(): Record<string, number> {
    const r = this.rig;
    return {
      t: this.lastT,
      perch: r.perch,
      strain: r.strain,
      tryWings: r.tryWings,
      soar: r.soar,
      soarW0: this.sec.soarW[0],
      soarW1: this.sec.soarW[1],
      hopY: this.hopY,
      lookW: r.look.w,
    };
  }
  /** The hop of its try, px (up = negative). */
  private hopY = 0;
  /** Which wing is torn (the near one as it sits). */
  private readonly torn: 0 | 1;

  private draw(clock: number): void {
    const p = this.painter;
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale() * TATTER.scale);
    p.fw = clamp(1 / scale, 0.06, 1.5);
    p.lx = 0.42;
    p.ly = -0.91;
    p.coolK = 0;
    p.keyK = 0.3;
    p.l2k = 0;
    p.grade = TATTER.grade;
    p.outline = 1.5;
    p.outlineColor = [0.03, 0.025, 0.045];
    p.outlineAlpha = 0.95;
    p.mesh.position.set(this.me.cx, this.me.feetY + this.hopY * TATTER.scale);
    p.begin();
    // Its own moth wings (tatter-wing.ts): the good one behind it, the torn one over it.
    const j = this.rig.frame.j;
    const rx = j[J_COLLAR * 2]!;
    const ry = j[J_COLLAR * 2 + 1]!;
    const back = -this.facing;
    const W = TATTER.wings;
    const tryK = this.rig.tryWings;
    const beat = Math.sin(clock * 9.5);
    const good = this.goodPose;
    good.x = rx + back * 1.5;
    good.y = ry - 1;
    good.ang = this.angFor(W.good + (W.goodTry - W.good) * tryK * (0.65 + 0.35 * beat), back);
    good.span = W.goodSpan;
    good.lead = back > 0 ? -1 : 1;
    const torn = this.tornPose;
    const tremble = 0.5 + 0.5 * Math.max(0, noise1(clock * 1.3, 191));
    torn.x = rx + back * 0.5;
    torn.y = ry + 1;
    torn.ang = this.angFor(
      W.torn +
        0.05 * Math.sin(clock * 1.1) +
        0.03 * tremble * Math.sin(clock * 17) +
        (W.tornTry - W.torn) * tryK * (0.5 + 0.5 * beat),
      back,
    );
    torn.span = W.tornSpan;
    torn.lead = back > 0 ? -1 : 1;
    const fw = flapWind(this.x, clock);
    p.outline = 1.2;
    drawMothWing(p, good, WHOLE, clock, 0, fw);
    p.outline = 1.5;
    drawVesper(p, this.rig.frame, this.view, clock);
    p.outline = 1.2;
    drawMothWing(p, torn, TORN, clock, tremble, fw);
    p.outline = 0;
    p.end(this.me.cx, this.me.feetY - 40);
  }

  destroy(): void {
    this.painter.mesh.destroy();
  }
}
