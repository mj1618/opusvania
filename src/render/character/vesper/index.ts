// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper, the moth: a night-flier who carries her own light. Skin id `vesper`.
 *
 *   rig.ts    pose generators + springs -> skeleton (2.5D, continuous turn, dragged hands)
 *   chain.ts  verlet chains with rest shapes (copy of hooded/chain.ts + per-segment ripple)
 *   wings.ts  the two wing membranes (five strands each) and the two antennae
 *   draw.ts   skeleton + chains -> shaded shapes (through hooded/paint.ts, one mesh)
 *   fx.ts     rising gold dust, light trails, landing dust
 *   slashfx/  the slash's look: one crescent per cut and the contact flash
 *
 * Her light is the pair of lantern tips on her antennae: their midpoint is the point light 'ember'.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import { tuning } from '../../../sim/tuning';
import type { PlayerView, RenderContext } from '../../contract';
import type { PointLight } from '../../lights';
import { zoneWeights } from '../../scene/lib/fx-zones';
import { KEY_LIGHT } from '../../scene/lib/look';
import { clamp, noise1, Spring, sat, smoothstep } from '../hooded/math';
import type { CharacterSkin, SkinDef } from '../skin';
import { BLADE_LEN, drawVesper, type View } from './draw';
import { drawSpinRings, FX_GOLD, FX_GOLD_DEEP, FX_GOLD_HOT, Fx, Trail } from './fx';
import { vesperLink } from './link';
import { Painter, rgb } from './paint';
import { HURT, J_CHEST, J_HAND_A, J_HEAD, J_HIP, MAX_TURNS, Rig } from './rig';
import { type SlashFrame, SlashMark } from './slashfx';

import { Secondary } from './wings';

const LIGHT = 0xffe0a0;
/** She is "at" a lantern for her acting within this many px of its foot, sideways (its trigger is 24 either side). */
const LAMP_REACH = 62;
/** v3: the default became three turns; older keys' stored choices are ignored so everyone sees it. */
const TURNS_KEY = 'vesper.turns.v3';
/** Turns per double jump when nothing is stored or asked for (owner's choice, 2026-10-13). */
const DEFAULT_TURNS = 3;
/** The crescent: px its origin stands ahead of and (a forward cut) below her chest, at the target's height (`clear`: never lower than this over her feet on the ground); how far an up / down one is let out sideways, and its reach as a fraction of the sim's (which is measured from her centre, below the chest). */
const SLASH_LOOK = {
  ahead: 4,
  drop: 6,
  stretch: 1.4,
  held: 1.1,
  clear: 42,
  /** A pogo: the arc is moved at most this far (px, sideways / down / up) to sit on what it hit. */
  pogoX: 30,
  pogoDown: 30,
  pogoUp: 40,
  hidden: false,
};

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
  private readonly ringPts = new Float32Array(6);
  private started = false;
  private flash = 0;
  private readonly back: [number, number] = [0, 0];
  private glintT = 9;
  private glintK = 0;
  /** The slash's crescent and contact flash. */
  private readonly mark = new SlashMark();
  private readonly sf: SlashFrame = { dt: 0, held: false, ox: 0, oy: 0, cutQ: -1, pale: 1, groundY: 1e9 };
  /** The blade drawn long through the cut (one clean elongated blade that reaches its crescent), 1 = its own length. */
  private bladeSmear = 1;
  /** The blade frame's turn when the cut began: the crescent is laid in that frame (see `Rig.strokeAtRoll`). */
  private markRoll = 0;
  /** Where the crescent hangs from, as an offset from her body centre: fixed when the cut begins. */
  private markOx = 0;
  private markOy = 0;
  /** World y the crescent is never drawn below, besides the ground: the top of what a pogo landed on. */
  private markFloor = 1e9;
  /** A pogo that landed: the arc is held at this world point instead of on her body. */
  private markPin = false;
  private pinX = 0;
  private pinY = 0;
  private readonly markAt = (q: number, out: { x: number; y: number }): void => {
    this.rig.markAtRoll(q, this.markRoll, out);
  };
  private readonly tan = { x: 0, y: 0 };
  private readonly tan2 = { x: 0, y: 0 };

  private toast: HTMLElement | null = null;
  private toastTimer = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyT') this.setTurns((Rig.turns % MAX_TURNS) + 1, true);
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
      spot: 0,
      stream: 0,
      eyeLit: 1,
    };
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, painter: p, view } = this;
    rig.groundDist = player.grounded ? 0 : this.clearBelow(player);
    this.sideGaps(player);
    this.readGoal(player);
    rig.update(dt, clock, player, events);
    // Where the light leaves her (and comes to her): the open palm while she kindles, else her chest.
    {
      const j = rig.frame.j;
      const hand = (J_HAND_A + rig.offerSide) * 2;
      const k = rig.offerK;
      vesperLink.live = true;
      vesperLink.offerX = j[J_CHEST * 2]! + (j[hand]! - j[J_CHEST * 2]!) * k;
      vesperLink.offerY = j[J_CHEST * 2 + 1]! + (j[hand + 1]! - 2.5 - j[J_CHEST * 2 + 1]!) * k;
    }
    const sig = rig.sig;
    const fresh = sig.spawned || !this.started;
    if (fresh) {
      sec.reset();
      fx.clear();
      this.mark.clear();
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
    // (a wing trying to open in a fall counts: it must not swing out across her body)
    view.soar = Math.max(sec.soar, sec.soarW[0], sec.soarW[1]);
    view.stream = sec.stream;
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
    // The lantern catches: its light runs through her, lantern tip to eyes to wing spots.
    if (sig.kindled) {
      this.glintT = 0;
      this.glintK = 1;
    }
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
    // Through the cut it is drawn long enough to end on the crescent's inner edge (the path its
    // point is on): one clean elongated blade, never a second one. It is its own length again
    // two frames after the cut is through (it holds in hitstop with everything else).
    const seen = 0.5 + 0.5 * rig.slashLen;
    if (cq > 0 && cq < 1 && rig.clangK <= 0) {
      const tipR = rig.stroke.reach * rig.stroke.size * (1 - rig.stroke.thick) * rig.slashLen;
      this.bladeSmear = clamp((tipR - rig.handNow) / (BLADE_LEN * seen), 1, SLASH_LOOK.stretch);
    } else if (player.hitstop <= 0) this.bladeSmear += (1 - this.bladeSmear) * (1 - Math.exp(-dt * 60 * 0.9));
    // Frozen in hitstop a smear is just a longer sword: it draws back to a hint within two frames.
    if (player.hitstop > 0 && !sig.slashHit)
      this.bladeSmear +=
        (Math.min(this.bladeSmear, SLASH_LOOK.held) - this.bladeSmear) * (1 - Math.exp(-dt * 60 * 0.8));
    view.bladeLen = seen * this.bladeSmear;
    const chestX = rig.frame.j[J_CHEST * 2]!;
    const chestY = rig.frame.j[J_CHEST * 2 + 1]!;
    const heavy = rig.slashStep === 3 && rig.slashDir !== 'down';
    const mark = this.mark;
    // It hangs from her chest (a touch ahead: the gather leans back from where the cut lands). The
    // offset follows her chest while the blade is still crossing the arc (a rising cut lifts her a
    // dozen px in those frames) and is fixed to her body from there on.
    if (rig.cutStart || (cq >= 0 && cq < 1 && player.hitstop <= 0)) {
      this.markOx = chestX - player.cx + sg * SLASH_LOOK.ahead;
      this.markOy = chestY - player.cy + (rig.slashDir === 'fwd' ? SLASH_LOOK.drop : 0);
      // On the ground a forward cut never hangs lower than this over her feet (running, her chest
      // is low and most of a falling cut's crescent would be under the floor).
      if (player.grounded && rig.slashDir === 'fwd')
        this.markOy = Math.min(this.markOy, player.feetY - player.cy - SLASH_LOOK.clear);
    }
    if (rig.cutStart) {
      // Laid in her upright frame plus the cut's own roll: out of a somersault what is left of the
      // turn is gone in two frames, and a crescent laid in it hangs over her head, off the blade.
      this.markRoll = rig.slashRoll;
      this.markFloor = 1e9;
      this.markPin = false;
      const st = rig.stroke;
      const span = st.a1 - st.a0;
      mark.begin(
        {
          dir: rig.slashDir,
          step: rig.slashStep,
          heavy,
          facing: sg,
          reach: st.reach * st.size,
          q0: st.mark ? (st.mark[0] - st.a0) / span : st.show,
          q1: st.mark ? (st.mark[1] - st.a0) / span : 1,
          thick: st.thick,
          wide: 1,
          skew: st.skew,
        },
        this.markAt,
      );
    }
    const sf = this.sf;
    sf.dt = dt;
    sf.held = player.hitstop > 0 && !sig.slashHit;
    sf.cutQ = cq;
    sf.pale = view.pale;
    mark.frame(sf);
    // While the blade is crossing, the crescent's leading needle IS the blade's point: its origin
    // is set from where the point really is (hand joint + the drawn blade), then kept on her body.
    if (mark.tracking && rig.clangK <= 0 && rig.slashDir !== 'down') {
      const hj = (J_HAND_A + rig.swordSide) * 2;
      const bl = 2.2 + BLADE_LEN * view.bladeLen - 1.5;
      mark.leadAt(this.tan);
      this.markOx = rig.frame.j[hj]! + Math.cos(view.bladeAng) * bl - this.tan.x - player.cx;
      this.markOy = rig.frame.j[hj + 1]! + Math.sin(view.bladeAng) * bl - this.tan.y - player.cy;
    }
    sf.ox = this.markPin ? this.pinX : player.cx + this.markOx;
    sf.oy = this.markPin ? this.pinY : player.cy + this.markOy;
    // The ground under her cuts the crescent off: it is never drawn over the floor.
    sf.groundY = Math.min(this.markFloor, player.feetY + (player.grounded ? 0 : rig.groundDist) + 2);
    if (sig.slashHit) {
      // Where it lands: the target's side nearest her (the target draws its own burst).
      const dx = player.cx - rig.hitX;
      const dy = player.cy - rig.hitY;
      const dl = Math.hypot(dx, dy) || 1;
      // Along the cut: the way the blade's point is travelling right now.
      const q = sat(Math.max(0.05, cq));
      rig.strokeAt(Math.min(1, q + 0.04), this.tan);
      rig.strokeAt(Math.max(0, q - 0.04), this.tan2);
      const tx = this.tan.x - this.tan2.x;
      const ty = this.tan.y - this.tan2.y;
      const tl = Math.hypot(tx, ty) || 1;
      // A blocked cut reports the very point where the blade met the shell.
      const near = sig.blocked ? 0 : 14;
      let cx = rig.hitX + (dx / dl) * near;
      let cy = rig.hitY + (dy / dl) * near;
      if (rig.slashDir === 'down' && !sig.blocked) {
        // A pogo: the contact is the top of what is under her, as near under her feet as it gets,
        // and the arc is moved to sit on it (its lowest point on the contact).
        cx = rig.hitX + clamp(player.cx - rig.hitX, -18, 18);
        cy = rig.hitY - 12;
        const R = rig.stroke.reach * rig.stroke.size;
        this.markOx += clamp(cx - sf.ox, -SLASH_LOOK.pogoX, SLASH_LOOK.pogoX);
        this.markOy += clamp(cy - (sf.oy + R), -SLASH_LOOK.pogoUp, SLASH_LOOK.pogoDown);
        // It stays on what it hit: she is gone upward at once, and an arc carried up with her hangs in the air.
        this.markPin = true;
        sf.ox = this.pinX = player.cx + this.markOx;
        sf.oy = this.pinY = player.cy + this.markOy;
        // ... and never drawn into it.
        this.markFloor = cy + 3;
        sf.groundY = Math.min(sf.groundY ?? 1e9, this.markFloor);
      }
      mark.hit(cx, cy, tx / tl, ty / tl, -dx / dl, -dy / dl, rig.hitPower);
      if (!sig.blocked) this.flash = Math.max(this.flash, 0.2);
    }
    // --- Hurt, fading, re-forming.
    const bp = this.bodyPts;
    bp.set(this.hemPts);
    for (let i = 0; i < 3; i++) {
      const jj = i === 0 ? J_HEAD : i === 1 ? J_CHEST : J_HIP;
      bp[20 + i * 2] = rig.frame.j[jj * 2]!;
      bp[21 + i * 2] = rig.frame.j[jj * 2 + 1]!;
    }
    if (sig.hurt) {
      // A few dark scales knocked off her wings, thrown the way she is. Nothing pale, nothing lit.
      fx.scales(bp, 10, 9, player.vx || -player.facing, -0.6);
    }
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
    // At blur speed a sampled trail is a zigzag polygon: the rings take over from it.
    const slow = 1 - sat((Math.abs(rig.spinRate) - 26) / 14);
    for (let i = 0; i < 4; i++) {
      const x = pts[i * 2]!;
      const y = pts[i * 2 + 1]!;
      const v = fresh || dt <= 0 ? 0 : Math.hypot(x - this.lastX[i]!, y - this.lastY[i]!) / dt;
      this.lastX[i] = x;
      this.lastY[i] = y;
      const fast = sat((v - 330) / 600);
      let k: number;
      if (i < 2) k = fast * (1 - 0.75 * soar) + 0.3 * rig.spinW * slow;
      else
        k =
          (i - 2 === nearIdx
            ? fast * 0.75 * (1 - sat(Math.abs(rig.slashWing))) + 0.3 * rig.spinW * slow
            : 0) *
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
    const lit = (0.5 + 0.5 * hpK) * low * whole * rig.eyeLit;
    view.glow = glow * lit * (1 - 0.6 * rig.hurtDim);
    view.eyeLit = rig.eyeLit;
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
    p.dimK = rig.hurtDim;
    drawVesper(p, rig.frame, view, clock);
    p.dimK = 0;
    p.alphaK = 1;
    p.glowK = 1;
    this.trails[0]!.draw(p, FX_GOLD, FX_GOLD_HOT, 0.4);
    this.trails[1]!.draw(p, FX_GOLD, FX_GOLD_HOT, 0.32);
    // A fast somersault: her lights smear into rings round the ball.
    this.ringPts[0] = pts[0]!;
    this.ringPts[1] = pts[1]!;
    this.ringPts[2] = pts[2]!;
    this.ringPts[3] = pts[3]!;
    this.ringPts[4] = mid.rx[3]!;
    this.ringPts[5] = mid.ry[3]!;
    drawSpinRings(p, this.ringPts, 3, rig.spinCx, rig.spinCy, rig.spinRate, rig.spinW * whole);
    fx.draw(p, clock);
    if (!SLASH_LOOK.hidden) mark.draw(p, sf);
    p.end(player.cx, player.cy);

    const e = this.light;
    e.x = ex;
    e.y = ey;
    e.radius = 300 + 70 * rig.wDash + 90 * this.flash + 50 * soar;
    e.intensity = glow * 1.15 * lit;
  }

  /**
   * Somersault turns per double jump, 1 to 4: `?turns=1..4`, else what was chosen last
   * (localStorage), else three. T cycles it while playing; `window.__vesper.turns` reads and sets it for tools.
   */
  private initTurns(): void {
    if (typeof window === 'undefined') return;
    let n = DEFAULT_TURNS;
    try {
      const q = new URLSearchParams(window.location.search).get('turns');
      const saved = window.localStorage.getItem(TURNS_KEY);
      const pick = Number(q ?? saved);
      if (pick >= 1 && pick <= MAX_TURNS) n = Math.round(pick);
    } catch {
      // Storage can be blocked: the default.
    }
    Rig.turns = n;
    window.addEventListener('keydown', this.onKey);
    const self = this;
    (window as unknown as { __vesper?: unknown }).__vesper = {
      get turns(): number {
        return Rig.turns;
      },
      set turns(v: number) {
        self.setTurns(v, false);
      },
      /** For capture tools: hide her (a frame with and one without gives her silhouette by difference). */
      /** For capture tools: hide the slash's crescent and contact flash (the swing must read without them). */
      get markHidden(): boolean {
        return SLASH_LOOK.hidden;
      },
      set markHidden(v: boolean) {
        SLASH_LOOK.hidden = !!v;
      },
      /** Her acting at the lanterns and the heart, for tools: pose weights and what the wings, antennae and lights read. */
      get act(): Record<string, number> {
        const r = self.rig;
        return {
          kindle: r.kindleW,
          rest: r.restW,
          warm: r.warmW,
          touch: r.touchW,
          end: r.endW,
          guard: r.guard,
          reach: r.reachW,
          wait: r.waitW,
          give: r.giveW,
          look: r.noticeK,
          endT: r.endT,
          cloak: r.cloak,
          antLift: r.antLift,
          eyeLit: r.eyeLit,
          soar: r.soar,
          offerX: vesperLink.offerX,
          offerY: vesperLink.offerY,
        };
      },
      /** For capture tools: her mesh (walk up from it to hide what stands in front of her). */
      get mesh(): unknown {
        return self.painter.mesh;
      },
      get hidden(): boolean {
        return !self.painter.mesh.visible;
      },
      set hidden(v: boolean) {
        self.painter.mesh.visible = !v;
      },
    };
  }

  private setTurns(n: number, show: boolean): void {
    Rig.turns = Math.min(MAX_TURNS, Math.max(1, Math.round(n) || 1));
    try {
      window.localStorage.setItem(TURNS_KEY, String(Rig.turns));
    } catch {
      // Not remembered, then.
    }
    if (show) this.say(`somersault: ${Rig.turns === 1 ? '1 turn' : `${Rig.turns} turns`}`);
  }

  private say(text: string): void {
    if (!this.toast) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:18px;bottom:16px;padding:5px 10px;border-radius:6px;background:rgba(10,8,20,.6);' +
        'color:#e8dcc4;font:13px/1.2 Georgia,serif;letter-spacing:.03em;pointer-events:none;z-index:50;' +
        'transition:opacity .25s;opacity:0';
      document.body.appendChild(el);
      this.toast = el;
    }
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.toast) this.toast.style.opacity = '0';
    }, 1100);
  }

  /** The goal's cues for the rig, from the state the goal renderer left in the link (memory/goal.md). */
  private readGoal(p: PlayerView): void {
    const cue = this.rig.cue;
    const goal = vesperLink.goal;
    const sc = this.ctx.scene;
    cue.lamp = false;
    cue.kindle = -1;
    cue.rest = -1;
    cue.heart = false;
    cue.gathered = false;
    cue.ended = false;
    cue.emberId = '';
    cue.emberHangs = false;
    cue.carry = false;
    cue.lampKeyed = false;
    cue.away = false;
    cue.heartWait = false;
    if (!goal) return;
    // Lanterns, then the wayside lamps: one list, as the goal renderer keeps them (its `beads` are in this order).
    const nLant = sc.lanterns?.length ?? 0;
    const way = nLant > 0 ? (sc.lamps ?? []) : [];
    const count = nLant + way.length;
    const at = (i: number) => (i < nLant ? sc.lanterns?.[i] : way[i - nLant]);
    const g = tuning.goal;
    // The light she stands at: the one being kindled, else the nearest on her ground within reach.
    let best = -1;
    let bestD = LAMP_REACH;
    for (let i = 0; i < count; i++) {
      const l = at(i);
      if (!l || Math.abs(l.y - p.feetY) > 6) continue;
      const dd = Math.abs(l.x - p.cx);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    // Her kindle flag: `kindling` for a lantern, `kindlingLamp` for a wayside lamp (never both).
    const kindling =
      p.kindling >= 0 && p.kindling < nLant
        ? p.kindling
        : p.kindlingLamp >= 0 && p.kindlingLamp < way.length
          ? nLant + p.kindlingLamp
          : -1;
    if (kindling >= 0) best = kindling;
    const ls = best < 0 ? undefined : best < nLant ? goal.lanterns[best] : goal.lamps?.[best - nLant];
    const l = best >= 0 ? at(best) : undefined;
    if (best >= 0 && ls && l) {
      const bx = vesperLink.beads[best * 2] ?? l.x;
      const by = vesperLink.beads[best * 2 + 1] ?? l.y - (best < nLant ? 66 : 50);
      cue.lamp = true;
      cue.lampFootDx = l.x - p.cx;
      cue.lampDx = bx - p.cx;
      cue.lampUp = p.feetY - by;
      cue.lampLit = ls.lit;
      if (kindling === best && ls.channel > 0) cue.kindle = sat(ls.channel / Math.max(1, g.channelFrames));
      if (ls.lit && ls.rest > 0) cue.rest = sat(ls.rest / Math.max(1, g.restFrames));
    }
    if (sc.heart) {
      cue.heart = Math.abs(sc.heart.y - p.feetY) < 6;
      cue.heartDx = sc.heart.x - p.cx;
      cue.heartDy = sc.heart.y - p.feetY;
    }
    cue.gathered = goal.gathered;
    cue.ended = goal.ended;
    cue.heartWait = goal.heart.awake && goal.heart.waited && !goal.heart.ready && !goal.gathered;
    // Her head, near enough, for what she looks at.
    const hx = p.cx;
    const hy = p.feetY - 62;
    // The ember: the great glint the first keyed lantern wants.
    for (let i = 0; i < nLant; i++) {
      const key = sc.lanterns?.[i]?.key;
      const st = goal.lanterns[i];
      if (key === undefined || !st) continue;
      const pick = sc.pickups?.find((q) => q.id === key);
      if (!pick) continue;
      cue.emberId = key;
      cue.emberHangs = !st.keyed && !st.lit;
      cue.emberDx = pick.x - hx;
      cue.emberDy = pick.y - hy;
      cue.carry = st.keyed && !st.lit && st.channel === 0;
      cue.lampKeyed = best === i;
      break;
    }
    // A channel that runs on without her (she is on its leash, not at it): the nearest such glass.
    if (kindling < 0) {
      let far = 1e9;
      for (let i = 0; i < count; i++) {
        const st = i < nLant ? goal.lanterns[i] : goal.lamps?.[i - nLant];
        const li = at(i);
        if (!st || !li || st.lit || st.channel <= 0) continue;
        const bx = vesperLink.beads[i * 2] ?? li.x;
        const by = vesperLink.beads[i * 2 + 1] ?? li.y - 60;
        const dd = Math.hypot(bx - hx, by - hy);
        if (dd >= far) continue;
        far = dd;
        cue.away = true;
        cue.awayDx = bx - hx;
        cue.awayDy = by - hy;
      }
    }
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
    // ... and the rig how far the bark ahead of her is (she reaches for it before she is on it).
    const gap = p.facing >= 0 ? right - p.cx : p.cx - left;
    this.rig.wallAhead = (p.facing >= 0 ? right < sc.width : left > 0)
      ? gap - p.w / 2
      : Number.POSITIVE_INFINITY;
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKey);
      window.clearTimeout(this.toastTimer);
      this.toast?.remove();
    }
    vesperLink.live = false;
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
