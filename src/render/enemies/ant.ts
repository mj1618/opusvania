// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * The carriers drawn as ants (Canopy r22: on the burrback's rig at 0.5 they read as moss). Side view: a head with
 * mandibles and elbowed antennae that tap the ground ahead, a thorax, a narrow waist, a round glossy gaster, six thin
 * legs in a tripod gait driven by the distance along its trail (`segT`), and over its head, held in its mandibles, the
 * pale wing of a dead moth (the true detail: a line of them is a procession of little sails).
 *
 * Acting (sim: src/sim/enemies/carrier.ts): `walk` carrying; `alert` (the bite's tell): it drops the wing, rears up
 * off its front legs, mandibles wide, gaster curled under, eyes and jaws flashing the count in the hunt colour;
 * `bite`: a snap forward, jaws shut; back to `walk`: it picks the wing up again; `under`: not drawn; `hurt`: the flash
 * and a squash; `dead`: thrown along the blow, tumbling, one bounce, it lies on its back with its legs curled and
 * twitching, then fades (the sim drops the body after 30 frames; the corpse is the renderer's). The wing it carried
 * flutters down and lies a while (Litter).
 *
 * Reads only the sim state and `enemyDie` (which way the killing cut went). Knobs: `ANT` (live: `__enemies.ants.cfg`).
 */
import type { SimEvent } from '../../sim/events';
import type { EnemyState } from '../../sim/state';
import { approach, clamp, hash1, ik2, ikOut, noise1, sat, smoothstep } from '../character/math';
import type { CameraView, SimView } from '../contract';
import { foot, footAt, type GaitSpec, LEG_ROW, LEG_SIDE } from './gait';
import {
  applyTone,
  asRGB,
  Frame,
  groundBelow,
  hexTo,
  hitTone,
  Litter,
  rounded,
  shade,
  toneOut,
  type V3,
  wingPath,
} from './insect-kit';
import type { Painter } from './paint';

/** Look and motion knobs of the ant (world px in its own frame: x forward, y down, feet on y = 0). */
export const ANT = {
  gait: { cycle: 15, stance: 0.55, lift: 3.2 } as GaitSpec,
  /** Feet homes along the body (front, middle, rear), leg bones (femur, tibia, tarsus), roots on the thorax. */
  feet: [11.5, 2.5, -8.5] as const,
  roots: [5.6, 2.6, 0] as const,
  femur: 5.4,
  tibia: 6.2,
  tarsus: 2.4,
  /** Body bob per footfall, px; how far the far-side legs sit up / back (perspective), px. */
  bob: 0.5,
  far: [1.2, -1.1] as const,
  /** Antennae: scape and funiculus length, px; tap depth (rad) and how many taps per gait cycle. */
  scape: 5.6,
  flagellum: 8,
  tap: 0.42,
  taps: 2,
  /** The carried wing: length px, how far it leans back from upright (rad), its sway (rad), a faint halo. */
  wing: { len: 24, lean: 0.36, sway: 0.07, glow: 0.07, glowR: 0.75 },
  /** The tell: rear (rad, front up about the waist), gaster curl (rad), front feet lifted (px), count beats. */
  tell: {
    rear: 0.78,
    curl: 0.62,
    lift: 8,
    beats: 3,
    pow: 1.25,
    low: 0.35,
    peak: 1,
    glow: 0.85,
    shiver: 0.05,
  },
  /** The bite: forward pitch at the snap (rad), stretch of the front, px of reach added to the head. */
  bite: { pitch: -0.22, reach: 3.5, close: 0.42 },
  /** Wing pick-up after a bite, s. */
  pick: 0.24,
  /** Hit: flash frames (warm near-white), share of the way to the struck dusk through the hold, squash. */
  hit: { flash: 5, dark: 0.55, squash: 0.25 },
  /**
   * Death (render s, px/s): thrown along the cut (`fwd` / `up` / `down` velocities, x `fin` for a finisher),
   * spinning `spin` rad/s, `gravity`, one bounce (`bounce`), on its back; legs twitch `twitch` s; lies `lie` s, fades
   * `fade` s.
   */
  die: {
    fwd: [250, 290] as const,
    up: [70, 470] as const,
    down: [140, 110] as const,
    fin: 1.3,
    spin: 15,
    gravity: 1600,
    bounce: 0.32,
    twitch: 1.3,
    lie: 2.4,
    fade: 0.6,
  },
  /** Ends of its trail: it climbs out / goes in over this many px. */
  edge: 12,
  /**
   * Drawn this much larger than its frame's px (the box is 30 x 14). 1.55 since the readability pass: ~52 px long at
   * play zoom (was ~40, a speck beside her 80); jaws and gaster overhang the box a little, the legs more.
   */
  scale: 1.55,
  /** Drawn larger when the camera pulls out (first-timer r6: "the ants were specks"): from this zoom, up to max. */
  zoomAt: 1.05,
  maxScale: 1.4,
  color: {
    top: 0x3e2a24,
    low: 0x140d0c,
    // (A wood ant's two tones since the readability pass: a rust head and thorax over the dark gaster. One dark brown
    // was the ground's own value; the warm red part separates it on moss, bark and amber alike.)
    rust: 0xb4522a,
    rustLow: 0x4a1c0c,
    leg: 0x231714,
    sheen: 0xc29f86,
    eye: 0x0a0707,
    glint: 0xe0d0b0,
    hunt: 0xff4630,
    flash: 0xfff1da,
    dusk: 0x2f2a34,
    wing: 0xece2ca,
    wingTip: 0xcbb995,
    mark: 0x7a6650,
    vein: 0xa6926c,
  },
};

const C = {
  top: [0, 0, 0] as V3,
  low: [0, 0, 0] as V3,
  rust: [0, 0, 0] as V3,
  rustLow: [0, 0, 0] as V3,
  leg: [0, 0, 0] as V3,
  sheen: [0, 0, 0] as V3,
  eye: [0, 0, 0] as V3,
  glint: [0, 0, 0] as V3,
  hunt: [0, 0, 0] as V3,
  flash: [0, 0, 0] as V3,
  dusk: [0, 0, 0] as V3,
  wing: [0, 0, 0] as V3,
  wingTip: [0, 0, 0] as V3,
  mark: [0, 0, 0] as V3,
  vein: [0, 0, 0] as V3,
  jaw: [0, 0, 0] as V3,
};

const SH_BODY = shade(0.55, 0.3, 0.3, 0.32);
const SH_HEAD = shade(0.55, 0.3, 0.3, 0.32);
const SH_LEG = shade(0.25, 0.2, 0, 0.5);
const SH_JAW = shade(0.4, 0.15, 0, 0.5);
const SH_SHEEN = shade(0, 0, 0, 0.6);
const SH_EYE = shade(0, 0, 0, 0.5);
const SH_WING = shade(0.5, 0.25, 0.1, 0.22);
const SH_MARK = shade(0, 0, 0, 0.6);
const SH_VEIN = shade(0, 0, 0, 0.5);

/** A moth's fore wing, dead and a little worn: u along the span (0 root .. 1 tip), v across (+ = trailing edge). */
const MOTH_WING = rounded([
  0, 0, 0.3, -0.05, 0.7, -0.075, 1.0, -0.045, 0.97, 0.07, 0.87, 0.24, 0.79, 0.34, 0.74, 0.43, 0.55, 0.41, 0.3,
  0.28, 0.1, 0.12,
]);
const MOTH_VEINS = [0.95, 0.0, 0.84, 0.24, 0.66, 0.38] as const;

/**
 * A dead moth's wing in world space: root (rx, ry), span angle `ang` (world rad), length, which side of the span the
 * chord lies (`side` -1 / 1), `flat` = 1 face on .. 0 edge on, alpha.
 */
export function paintMothWing(
  p: Painter,
  rx: number,
  ry: number,
  ang: number,
  len: number,
  side: number,
  flat: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  const ux = Math.cos(ang) * len;
  const uy = Math.sin(ang) * len;
  const vx = -Math.sin(ang) * len * side * flat;
  const vy = Math.cos(ang) * len * side * flat;
  const n = wingPath(p, MOTH_WING, rx, ry, ux, uy, vx, vy);
  const W = ANT.wing;
  if (W.glow > 0)
    p.glow(
      rx + ux * 0.5 + vx * 0.18,
      ry + uy * 0.5 + vy * 0.18,
      len * W.glowR,
      asRGB(C.wing),
      W.glow * alpha,
      len * W.glowR,
      0,
      14,
    );
  SH_WING.c0 = C.wing;
  SH_WING.c1 = C.wingTip;
  SH_WING.alpha = 0.95 * alpha;
  p.shape(n, rx + ux * 0.55 + vx * 0.17, ry + uy * 0.55 + vy * 0.17, SH_WING, rx, ry, rx + ux, ry + uy);
  // Veins, a discal spot and a worn band near the margin: a real moth's wing, not a leaf.
  SH_VEIN.c0 = SH_VEIN.c1 = C.vein;
  SH_VEIN.alpha = 0.7 * alpha;
  for (let k = 0; k < 3; k++) {
    const u = MOTH_VEINS[k * 2]!;
    const v = MOTH_VEINS[k * 2 + 1]!;
    p.px[0] = rx;
    p.py[0] = ry;
    p.px[1] = rx + ux * u * 0.5 + vx * v * 0.35;
    p.py[1] = ry + uy * u * 0.5 + vy * v * 0.35;
    p.px[2] = rx + ux * u * 0.95 + vx * v * 0.95;
    p.py[2] = ry + uy * u * 0.95 + vy * v * 0.95;
    p.pw[0] = 0.45;
    p.pw[1] = 0.32;
    p.pw[2] = 0.16;
    p.ribbon(3, SH_VEIN);
  }
  SH_MARK.c0 = SH_MARK.c1 = C.mark;
  SH_MARK.alpha = 0.75 * alpha;
  const mx = rx + ux * 0.58 + vx * 0.17;
  const my = ry + uy * 0.58 + vy * 0.17;
  p.ellipse(mx, my, len * 0.075, len * 0.06 * Math.max(0.3, flat), ang, SH_MARK, 10);
  // (A dusky band just inside the outer margin, apex to tornus.)
  for (let k = 0; k < 4; k++) {
    const t = k / 3;
    const u = 0.925 - 0.215 * t;
    const v = -0.025 + 0.39 * t;
    p.px[k] = rx + ux * u + vx * v;
    p.py[k] = ry + uy * u + vy * v;
    p.pw[k] = len * (0.035 - 0.012 * Math.abs(t - 0.4));
  }
  SH_MARK.alpha = 0.4 * alpha;
  p.ribbon(4, SH_MARK);
}

function loadColors(): void {
  const K = ANT.color;
  hexTo(C.top, K.top);
  hexTo(C.low, K.low);
  hexTo(C.leg, K.leg);
  hexTo(C.rust, K.rust);
  hexTo(C.rustLow, K.rustLow);
  hexTo(C.sheen, K.sheen);
  hexTo(C.eye, K.eye);
  hexTo(C.glint, K.glint);
  hexTo(C.hunt, K.hunt);
  hexTo(C.flash, K.flash);
  hexTo(C.dusk, K.dusk);
  hexTo(C.wing, K.wing);
  hexTo(C.wingTip, K.wingTip);
  hexTo(C.mark, K.mark);
  hexTo(C.vein, K.vein);
}

class AntRig {
  frame = -1;
  private px = 0;
  private py = 0;
  private cx = 0;
  private cy = 0;
  private ps = 0;
  private cs = 0;
  /** Drawn feet centre (world), distance along its trail (drives the legs). */
  x = 0;
  y = 0;
  dist = 0;
  mf = 0;
  hitAge = 1e6;
  lastMode = '';
  /** Eased pose: rear (rad), gaster curl (rad), jaw open 0..1, forward pitch of the bite, head reach. */
  rear = 0;
  curl = 0;
  jaw = 0.15;
  pitch = 0;
  reach = 0;
  /** 1 = the wing in its jaws; the dropped wing (world root, span angle, fall), and the pick-up 0..1. */
  carry = 1;
  dropT = -1;
  dropX = 0;
  dropY = 0;
  dropA = 0;
  dropVy = 0;
  dropFloor = 0;
  dropDown = false;
  pickT = -1;
  /** The carry pose's wing root and angle last drawn (world), for a drop or a death. */
  wingX = 0;
  wingY = 0;
  wingA = 0;
  /** The killing blow's cut, from `enemyDie`. */
  dieSlash = '';
  dieDir = 1;
  diePower = 1;
  /** Death: -1 alive; else seconds since the body was thrown. */
  deadT = -1;
  dx = 0;
  dy = 0;
  dvx = 0;
  dvy = 0;
  rot = 0;
  spin = 0;
  landed = false;
  landT = 0;
  bounced = false;
  facing = 1;
  done = false;
  /** The scale it was last drawn at (about its feet). */
  drawK = 1;
  readonly seed: number;
  constructor(index: number) {
    this.seed = hash1(index * 977 + 13);
  }

  reset(): void {
    this.frame = -1;
    this.deadT = -1;
    this.done = false;
    this.carry = 1;
    this.dropT = -1;
    this.pickT = -1;
    this.rear = this.curl = this.pitch = this.reach = 0;
    this.jaw = 0.15;
    this.dieSlash = '';
  }

  update(e: EnemyState, simFrame: number, alpha: number): boolean {
    const nx = e.x + e.w / 2;
    const ny = e.y + e.h;
    const fresh =
      this.frame < 0 || Math.abs(nx - this.cx) + Math.abs(ny - this.cy) > 60 || simFrame < this.frame;
    if (fresh) {
      this.px = this.cx = nx;
      this.py = this.cy = ny;
      this.ps = this.cs = e.segT;
      this.frame = simFrame;
      this.carry = e.mode === 'alert' || e.mode === 'bite' ? 0 : 1;
      this.dropT = -1;
      this.pickT = -1;
      this.lastMode = e.mode;
    } else if (simFrame !== this.frame) {
      this.px = this.cx;
      this.py = this.cy;
      this.ps = this.cs;
      this.cx = nx;
      this.cy = ny;
      this.cs = e.segT;
      this.frame = simFrame;
    }
    const a = sat(alpha);
    this.x = this.px + (this.cx - this.px) * a;
    this.y = this.py + (this.cy - this.py) * a;
    this.dist = this.ps + (this.cs - this.ps) * a;
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    this.facing = e.facing;
    return fresh;
  }
}

const B = new Frame();
const F = new Frame();
const G = new Frame();

/** The carriers' renderer: rigs by enemy index, the wings they let go. */
export class AntArt {
  readonly cfg = ANT;
  private readonly rigs: (AntRig | undefined)[] = [];
  readonly litter = new Litter();
  private loaded = false;

  /** Once a frame, before the creatures: the killing cuts, and the litter (drawn under the ants). */
  begin(p: Painter, dt: number, events: readonly SimEvent[]): void {
    if (!this.loaded) {
      loadColors();
      this.loaded = true;
    }
    for (const ev of events) {
      if (ev.type !== 'enemyDie' || ev.kind !== 'carrier') continue;
      const i = this.idOf.get(ev.id);
      const rig = i === undefined ? undefined : this.rigs[i];
      if (!rig) continue;
      rig.dieSlash = ev.slash;
      rig.dieDir = ev.dir || ev.facing || 1;
      rig.diePower = ev.power;
    }
    this.litter.update(dt, (x, y, a, len, _kind, fade, flat) => {
      // (Centre given: the root is half a span back along it.)
      paintMothWing(p, x - Math.cos(a) * len * 0.5, y - Math.sin(a) * len * 0.5, a, len, 1, flat, fade);
    });
  }

  private readonly idOf = new Map<string, number>();

  recolor(): void {
    loadColors();
  }

  /** One carrier. Returns true if it was drawn. */
  draw(
    p: Painter,
    i: number,
    e: Readonly<EnemyState>,
    dt: number,
    clock: number,
    cam: CameraView,
    sim: SimView,
    halfW: number,
    halfH: number,
  ): boolean {
    let rig = this.rigs[i];
    if (!rig) {
      rig = new AntRig(i);
      this.rigs[i] = rig;
      this.idOf.set(e.id, i);
    }
    // In its crack it is no one's: not drawn (and it comes out fresh).
    if (e.mode === 'under') {
      if (rig.frame >= 0) rig.reset();
      return false;
    }
    const dead = e.mode === 'dead' || e.gone;
    if (e.gone && rig.deadT < 0) return false;
    if (dead && rig.done) return false;
    if (!e.gone) rig.update(e, sim.frame, sim.alpha);
    if (dead && rig.deadT < 0) this.die(rig, e, sim);
    if (!dead && rig.deadT >= 0) rig.reset();
    if (rig.deadT >= 0) {
      if (e.hitstop === 0 || e.gone) this.fly(rig, dt, sim);
      if (rig.done) return false;
    } else this.act(rig, e, dt, sim);
    const ax = rig.deadT >= 0 ? rig.dx : rig.x;
    const ay = rig.deadT >= 0 ? rig.dy : rig.y;
    if (Math.abs(ax - cam.x) > halfW || Math.abs(ay - cam.y) > halfH) return false;
    const v0 = p.vertexCount;
    const alphaWas = p.alphaK;
    if (rig.deadT >= 0) this.paintDead(p, rig, e, clock);
    else this.paint(p, rig, e, clock);
    p.alphaK = alphaWas;
    const k = ANT.scale * clamp(ANT.zoomAt / Math.max(0.05, cam.zoom), 1, ANT.maxScale);
    if (k > 1.001) p.scaleFrom(v0, ax, ay, k);
    rig.drawK = k;
    return true;
  }

  /** The pose for this frame, eased; the wing dropped and picked up. */
  private act(rig: AntRig, e: Readonly<EnemyState>, dt: number, sim: SimView): void {
    const A = ANT;
    const mode = e.mode;
    if (mode !== rig.lastMode) {
      const was = rig.lastMode;
      rig.lastMode = mode;
      // The tell starts: the wing is let go where it is held.
      if ((mode === 'alert' || mode === 'bite') && rig.carry > 0.5) {
        rig.carry = 0;
        rig.dropT = 0;
        rig.dropX = rig.wingX;
        rig.dropY = rig.wingY;
        rig.dropA = rig.wingA;
        rig.dropVy = -30;
        rig.dropDown = false;
        rig.dropFloor = rig.y;
        rig.pickT = -1;
      }
      // Back on its way: it picks the wing up again.
      if (mode === 'walk' && (was === 'alert' || was === 'bite') && rig.dropT >= 0) rig.pickT = 0;
    }
    if (rig.dropT >= 0 && rig.pickT < 0) {
      rig.dropT += dt;
      if (!rig.dropDown) {
        // It tips over forward and drops, rocking, to the ground just ahead of it.
        rig.dropVy = Math.min(90, rig.dropVy + 520 * dt);
        rig.dropY += rig.dropVy * dt;
        rig.dropX += Math.sin(rig.dropT * 9) * 30 * dt + e.facing * 18 * dt;
        const flatA = e.facing > 0 ? 0.06 : -Math.PI + 0.06;
        rig.dropA += (flatA - rig.dropA) * approach(14, dt);
        if (rig.dropY >= rig.dropFloor - 1.5) {
          rig.dropY = rig.dropFloor - 1.5;
          rig.dropDown = true;
        }
      }
    }
    if (rig.pickT >= 0) {
      rig.pickT += dt / A.pick;
      if (rig.pickT >= 1) {
        rig.pickT = -1;
        rig.dropT = -1;
        rig.carry = 1;
      }
    }
    // Targets by mode.
    const n = Math.max(1, e.modeFrames + e.timer);
    const u = sat(rig.mf / n);
    let rearT = 0;
    let curlT = 0;
    let jawT = rig.carry > 0.5 || rig.pickT >= 0 ? 0.12 : 0.3;
    let pitchT = 0;
    let reachT = 0;
    let rate = 18;
    if (mode === 'alert') {
      rearT = A.tell.rear * smoothstep(0, 0.4, u);
      curlT = A.tell.curl * smoothstep(0.05, 0.5, u);
      jawT = smoothstep(0.1, 0.45, u);
      rate = 30;
    } else if (mode === 'bite') {
      const close = u > A.bite.close - 0.12 && u < 0.72;
      pitchT = u < 0.6 ? A.bite.pitch : 0;
      reachT = u < 0.6 ? A.bite.reach : 0;
      rearT = u < 0.15 ? A.tell.rear * 0.5 : 0;
      curlT = A.tell.curl * 0.7;
      jawT = close ? 0 : 1;
      rate = 55;
    } else if (mode === 'hurt' || mode === 'dead') {
      jawT = 0.6;
      rate = 30;
    }
    // (The pick-up: head down to the wing, then up.)
    if (rig.pickT >= 0) pitchT += -0.18 * Math.sin(Math.PI * sat(rig.pickT));
    const k = approach(rate, dt);
    rig.rear += (rearT - rig.rear) * k;
    rig.curl += (curlT - rig.curl) * approach(rate * 0.7, dt);
    rig.jaw += (jawT - rig.jaw) * approach(mode === 'bite' ? 70 : 24, dt);
    rig.pitch += (pitchT - rig.pitch) * k;
    rig.reach += (reachT - rig.reach) * k;
    void sim;
  }

  /** The killing blow: the body is thrown along the cut (the sim keeps its box where it was). */
  private die(rig: AntRig, e: Readonly<EnemyState>, sim: SimView): void {
    const D = ANT.die;
    const dir = rig.dieDir || e.hitDir || e.facing || 1;
    const fin = (rig.diePower || e.hitPower) >= 2 ? D.fin : 1;
    const v = rig.dieSlash === 'up' ? D.up : rig.dieSlash === 'down' ? D.down : D.fwd;
    const j = 0.85 + 0.3 * rig.seed;
    rig.deadT = 0;
    rig.dx = rig.x;
    rig.dy = rig.y - 7;
    rig.dvx = dir * v[0] * fin * j;
    rig.dvy = -v[1] * fin * (1.1 - 0.2 * rig.seed);
    rig.rot = 0;
    rig.spin = -dir * e.facing * D.spin * j * (rig.dieSlash === 'down' ? 0.5 : 1);
    rig.landed = false;
    rig.bounced = false;
    rig.landT = 0;
    // The wing it carried (or had dropped) is let go: it flutters down and lies there.
    const k = rig.drawK;
    const wingLen = ANT.wing.len * k;
    if (rig.carry > 0.5 || rig.pickT >= 0) {
      const cxw = rig.x + (rig.wingX - rig.x) * k + Math.cos(rig.wingA) * wingLen * 0.5;
      const cyw = rig.y + (rig.wingY - rig.y) * k + Math.sin(rig.wingA) * wingLen * 0.5;
      this.litter.add(
        cxw,
        cyw,
        rig.dvx * 0.45,
        rig.dvy * 0.35,
        rig.wingA,
        wingLen,
        groundBelow(sim.scene, cxw, rig.y - 4),
        0,
        5,
      );
    } else if (rig.dropT >= 0) {
      const cxw = rig.x + (rig.dropX - rig.x) * k + Math.cos(rig.dropA) * wingLen * 0.5;
      const cyw = rig.y + (rig.dropY - rig.y) * k + Math.sin(rig.dropA) * wingLen * 0.5;
      this.litter.add(cxw, cyw, 0, 0, rig.dropA, wingLen, rig.dropY + 1, 0, 5);
    }
    rig.carry = 0;
    rig.dropT = -1;
    rig.pickT = -1;
  }

  /** The thrown body: ballistic, spinning, one bounce, then on its back (render seconds). */
  private fly(rig: AntRig, dt: number, sim: SimView): void {
    const D = ANT.die;
    rig.deadT += dt;
    if (!rig.landed) {
      rig.dvy += D.gravity * dt;
      rig.dx += rig.dvx * dt;
      rig.dy += rig.dvy * dt;
      rig.rot += rig.spin * dt;
      const floor = groundBelow(sim.scene, rig.dx, rig.dy - 10, 900) - 4.5;
      if (rig.dy >= floor && rig.dvy > 0) {
        rig.dy = floor;
        if (!rig.bounced && rig.dvy > 160) {
          rig.bounced = true;
          rig.dvy *= -D.bounce;
          rig.dvx *= 0.45;
          rig.spin *= 0.45;
        } else {
          rig.landed = true;
          rig.dvx = rig.dvy = 0;
        }
      }
    } else {
      rig.landT += dt;
      // It comes to rest on its back.
      const back = Math.round((rig.rot - Math.PI) / (2 * Math.PI)) * 2 * Math.PI + Math.PI;
      rig.rot += (back - rig.rot) * approach(16, dt);
      if (rig.landT > D.lie + D.fade) rig.done = true;
    }
    if (rig.deadT > 6) rig.done = true;
  }

  /** Colours for this frame: the zone-free palette, toned by the hit. */
  private tone(rig: AntRig, e: Readonly<EnemyState>): void {
    loadColorsBody();
    hitTone(rig.hitAge, e.hitstop, ANT.hit.flash, ANT.hit.dark);
    applyTone(C.top, C.flash, C.dusk);
    applyTone(C.low, C.flash, C.dusk);
    applyTone(C.leg, C.flash, C.dusk);
    applyTone(C.rust, C.flash, C.dusk);
    applyTone(C.rustLow, C.flash, C.dusk);
  }

  /** A live ant (walk, the tell, the bite, hurt). */
  private paint(p: Painter, rig: AntRig, e: Readonly<EnemyState>, clock: number): void {
    const A = ANT;
    const f = e.facing;
    const mode = e.mode;
    this.tone(rig, e);
    const flash = toneOut.flash;
    // The ends of its trail: it climbs out of the dark at the start and goes in at the crack.
    const span = Math.max(1, e.span);
    const endK = sat(Math.min(rig.dist, span - rig.dist) / A.edge);
    p.alphaK *= 0.15 + 0.85 * endK;
    const sink = (1 - endK) * 3;
    // The tell's count.
    const n = Math.max(1, e.modeFrames + e.timer);
    const u = sat(rig.mf / n);
    let tellP = 0;
    if (mode === 'alert') {
      const tb = A.tell.beats * u ** A.tell.pow;
      const tf = 1 - (tb - Math.floor(tb));
      tellP = A.tell.low + (A.tell.peak - A.tell.low) * tf * tf;
    } else if (mode === 'bite') tellP = 0.6 * (1 - u);
    const hurtK = mode === 'hurt' ? 1 - sat(rig.mf / 10) : 0;
    const g = A.gait;
    const walkD = rig.dist;
    const bob = mode === 'walk' ? A.bob * (0.5 - 0.5 * Math.cos((walkD / g.cycle) * Math.PI * 4)) : 0;
    const shiver = mode === 'alert' ? noise1(clock * 40 + rig.seed * 9, 3) * A.tell.shiver * (0.4 + u) : 0;
    const squash = A.hit.squash * Math.max(flash, hurtK * 0.6);
    const ox = rig.x;
    const oy = rig.y + sink + bob;
    // Base frame (ground, no pitch); front part pitched about the waist; gaster curled about the waist.
    const wx = -3.4;
    const wy = -8.2;
    B.set(ox, oy, f, 0);
    F.set(ox, oy, f, rig.rear + rig.pitch + shiver, wx, wy);
    G.set(ox, oy, f, rig.curl * 0.85 - rig.rear * 0.25 + rig.pitch * 0.3, wx, wy);
    // (A squash on a hit: lower and longer.)
    if (squash > 0) {
      F.oy += squash * 3;
      G.oy += squash * 3;
    }
    const reach = rig.reach;

    // --- Far legs, then the gaster and the waist, the thorax, near legs, the head and jaws, antennae.
    for (let pass = 0; pass < 2; pass++) {
      const near = pass === 1;
      if (near) this.body(p);
      for (let li = 0; li < 6; li++) {
        if (LEG_SIDE[li]! > 0 !== near) continue;
        const row = LEG_ROW[li]!;
        footAt(walkD, li, g);
        let fx = A.feet[row]! + foot.along;
        let fy = -foot.lift;
        if (mode !== 'walk') {
          // Standing: feet planted at home (no slide), the front pair raised and pawing in the tell.
          fx = A.feet[row]! + (li === 0 || li === 3 ? 0.5 : 0);
          fy = 0;
        }
        if (row === 0 && rig.rear > 0.05) {
          const lift = (rig.rear / A.tell.rear) * A.tell.lift;
          fx += lift * 0.5;
          fy -= lift * (0.7 + 0.3 * Math.sin(clock * 18 + li));
        }
        if (row === 0 && reach > 0.5) fx += reach;
        const farX = near ? 0 : A.far[0];
        const farY = near ? 0 : A.far[1];
        const rootF = row === 0 ? F : row === 1 ? F : B;
        const rlx = A.roots[row]! + farX * 0.5;
        const rly = -6.3 + farY * 0.5;
        const rx = rootF.x(rlx, rly);
        const ry = rootF.y(rlx, rly);
        const tx = B.x(fx + farX - A.tarsus * (row === 2 ? -0.6 : 0.6), fy + farY);
        const ty = B.y(fx + farX, fy + farY);
        const bend = row === 2 ? f : -f * (row === 1 ? 0.7 : 1);
        ik2(rx, ry, tx, ty, A.femur, A.tibia, bend, 0.35);
        p.px[0] = rx;
        p.py[0] = ry;
        p.px[1] = ikOut.x;
        p.py[1] = ikOut.y;
        p.px[2] = ikOut.ex;
        p.py[2] = ikOut.ey;
        const toeX = B.x(fx + farX + (row === 2 ? -1 : 1) * A.tarsus, fy + farY);
        p.px[3] = toeX;
        p.py[3] = ikOut.ey + 0.4;
        p.pw[0] = 0.95;
        p.pw[1] = 0.62;
        p.pw[2] = 0.42;
        p.pw[3] = 0.22;
        SH_LEG.c0 = SH_LEG.c1 = C.leg;
        SH_LEG.alpha = near ? 1 : 0.85;
        p.ribbon(4, SH_LEG);
      }
    }
    this.head(p, rig, mode, f, clock, reach, tellP, walkD);
  }

  /** Gaster, waist, thorax (in F / G). */
  private body(p: Painter): void {
    SH_BODY.c0 = C.top;
    SH_BODY.c1 = C.low;
    // Gaster: round and glossy, a little drooped; the waist's node; a sloped thorax.
    const gx = -10.6;
    const gy = -8.4;
    p.ellipse(G.x(gx, gy), G.y(gx, gy), 6.7, 5.1, G.rot(-0.14), SH_BODY, 18);
    SH_SHEEN.c0 = SH_SHEEN.c1 = C.sheen;
    SH_SHEEN.alpha = 0.32 * (1 - toneOut.dark);
    p.ellipse(G.x(-9.6, -11.2), G.y(-9.6, -11.2), 3.4, 1.2, G.rot(-0.22), SH_SHEEN, 10);
    // (Two faint segment lines across it.)
    SH_JAW.c0 = SH_JAW.c1 = C.low;
    SH_JAW.alpha = 0.55;
    for (let s = 0; s < 2; s++) {
      const sx = -8.4 - s * 3.1;
      for (let k = 0; k < 3; k++) {
        const v = -1 + k;
        const lx = sx + v * 0.6 * (s === 0 ? 1 : 0.8);
        const ly = gy + v * 4.4;
        p.px[k] = G.x(lx, ly);
        p.py[k] = G.y(lx, ly);
        p.pw[k] = 0.32;
      }
      p.ribbon(3, SH_JAW);
    }
    p.px[0] = F.x(-0.8, -8.0);
    p.py[0] = F.y(-0.8, -8.0);
    p.px[1] = B.x(-3.4, -8.3);
    p.py[1] = B.y(-3.4, -8.3);
    p.px[2] = G.x(-5.6, -8.2);
    p.py[2] = G.y(-5.6, -8.2);
    p.pw[0] = 1.2;
    p.pw[1] = 0.85;
    p.pw[2] = 1.2;
    p.ribbon(3, SH_BODY);
    p.ellipse(B.x(-3.4, -9.4), B.y(-3.4, -9.4), 1.5, 2.1, 0, SH_BODY, 10);
    SH_HEAD.c0 = C.rust;
    SH_HEAD.c1 = C.rustLow;
    p.ellipse(F.x(1.4, -8.3), F.y(1.4, -8.3), 4.6, 2.5, F.rot(0.2), SH_HEAD, 16);
    p.ellipse(F.x(5.7, -9.4), F.y(5.7, -9.4), 3.1, 2.8, F.rot(-0.1), SH_HEAD, 14);
  }

  /** Head, jaws, eye, antennae, and the wing it carries. */
  private head(
    p: Painter,
    rig: AntRig,
    mode: string,
    f: number,
    clock: number,
    reach: number,
    tellP: number,
    walkD: number,
  ): void {
    const A = ANT;
    const hx = 10.2 + reach;
    const hy = -9.8;
    // Neck.
    SH_BODY.c0 = C.top;
    SH_BODY.c1 = C.low;
    p.px[0] = F.x(6.5, -9.2);
    p.py[0] = F.y(6.5, -9.2);
    p.px[1] = F.x(hx - 2, hy + 0.3);
    p.py[1] = F.y(hx - 2, hy + 0.3);
    p.pw[0] = 1.1;
    p.pw[1] = 1.3;
    p.ribbon(2, SH_BODY);
    // Jaws: two curved blades from the front of the head, open in the tell, snapped shut in the bite.
    const jo = rig.jaw;
    for (let j = 0; j < 2; j++) {
      const side = j === 0 ? -1 : 1;
      const bxl = hx + 3.2;
      const byl = hy + 1.2 + side * 0.5;
      const ang = side * (0.08 + 0.95 * jo);
      const L = 4.6;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const curve = -side * (0.5 + 0.6 * (1 - jo));
      for (let k = 0; k < 3; k++) {
        const t = k / 2;
        const along = L * t;
        const bendA = curve * t * t;
        const lx = bxl + c * along - s * along * bendA * 0.5;
        const ly = byl + s * along + c * along * bendA * 0.5;
        p.px[k] = F.x(lx, ly);
        p.py[k] = F.y(lx, ly);
        p.pw[k] = 1.15 * (1 - 0.72 * t);
      }
      for (let k = 0; k < 3; k++) C.jaw[k] = C.low[k]! + (C.hunt[k]! - C.low[k]!) * 0.65 * tellP;
      SH_JAW.c0 = C.top;
      SH_JAW.c1 = C.jaw;
      SH_JAW.alpha = j === 0 ? 0.85 : 1;
      p.ribbon(3, SH_JAW, true, false);
    }
    // Head.
    SH_HEAD.c0 = C.rust;
    SH_HEAD.c1 = C.rustLow;
    p.ellipse(F.x(hx, hy), F.y(hx, hy), 4.2, 3.5, F.rot(-0.18), SH_HEAD, 16);
    // Eye: a small dark glossy dome with a pale glint; in the tell it flashes the hunt colour.
    const ex = hx + 0.9;
    const ey = hy - 0.8;
    SH_EYE.c0 = SH_EYE.c1 = C.eye;
    SH_EYE.alpha = 1;
    p.ellipse(F.x(ex, ey), F.y(ex, ey), 1.35, 1.15, 0, SH_EYE, 10);
    SH_EYE.c0 = SH_EYE.c1 = C.glint;
    SH_EYE.alpha = 0.75;
    p.ellipse(F.x(ex + 0.35, ey - 0.4), F.y(ex + 0.35, ey - 0.4), 0.45, 0.4, 0, SH_EYE, 6);
    if (tellP > 0.01) {
      p.glow(F.x(ex, ey), F.y(ex, ey), 3.6, asRGB(C.hunt), A.tell.glow * tellP, 3.6, 0, 12);
      p.glow(F.x(hx + 2, hy), F.y(hx + 2, hy), 11, asRGB(C.hunt), 0.28 * tellP, 11, 0, 14);
      p.glow(F.x(hx + 6.5, hy + 1.2), F.y(hx + 6.5, hy + 1.2), 4.2, asRGB(C.hunt), 0.55 * tellP, 4.2, 0, 12);
    }
    // Antennae: elbowed; the long scape up and forward, the whip bent down to tap the ground ahead, in turn.
    const alert = mode === 'alert' || mode === 'bite';
    for (let j = 0; j < 2; j++) {
      const near = j === 1;
      const rxl = hx + 1.4 + (near ? 0 : -0.6);
      const ryl = hy - 2.7 + (near ? 0 : -0.4);
      const tapPh = (walkD / A.gait.cycle) * Math.PI * 2 * A.taps + (near ? 0 : Math.PI) + rig.seed * 6;
      const tap = mode === 'walk' ? Math.max(0, Math.sin(tapPh)) * A.tap : 0.1 * Math.sin(clock * 3 + j);
      const scA = alert ? -0.75 : -0.95;
      const elx = rxl + Math.cos(scA) * A.scape;
      const ely = ryl + Math.sin(scA) * A.scape;
      const flA = alert
        ? -0.05 + (near ? 0 : -0.25) + 0.08 * Math.sin(clock * 30 + j)
        : 0.62 + tap + (near ? 0 : -0.1);
      const tlx = elx + Math.cos(flA) * A.flagellum;
      const tly = ely + Math.sin(flA) * A.flagellum;
      p.px[0] = F.x(rxl, ryl);
      p.py[0] = F.y(rxl, ryl);
      p.px[1] = F.x(elx, ely);
      p.py[1] = F.y(elx, ely);
      const mlx = elx + Math.cos(flA - 0.12) * A.flagellum * 0.5;
      const mly = ely + Math.sin(flA - 0.12) * A.flagellum * 0.5;
      p.px[2] = F.x(mlx, mly);
      p.py[2] = F.y(mlx, mly);
      p.px[3] = F.x(tlx, tly);
      p.py[3] = F.y(tlx, tly);
      p.pw[0] = 0.55;
      p.pw[1] = 0.45;
      p.pw[2] = 0.42;
      p.pw[3] = 0.5;
      SH_LEG.c0 = SH_LEG.c1 = C.leg;
      SH_LEG.alpha = near ? 1 : 0.8;
      p.ribbon(4, SH_LEG, false, true);
    }
    // --- The wing: held by its root in the jaws, standing up and back over it like a sail, swaying with its steps.
    const W = A.wing;
    const sway =
      Math.sin((walkD / A.gait.cycle) * Math.PI * 2 + 0.6) * W.sway +
      Math.sin(clock * 1.7 + rig.seed * 5) * 0.03;
    const rootLx = hx + 6.2;
    const rootLy = hy + 1.2;
    const rwx = F.x(rootLx, rootLy);
    const rwy = F.y(rootLx, rootLy);
    // Local span: up and leaning back; to world through the front's pitch and the facing.
    const la = -Math.PI / 2 - W.lean - sway;
    const sx = Math.cos(la);
    const sy = Math.sin(la);
    const wax = F.x(rootLx + sx, rootLy + sy) - rwx;
    const way = F.y(rootLx + sx, rootLy + sy) - rwy;
    const worldA = Math.atan2(way, wax);
    rig.wingX = rwx;
    rig.wingY = rwy;
    rig.wingA = worldA;
    const alphaK = p.alphaK;
    if (rig.carry > 0.5) paintMothWing(p, rwx, rwy, worldA, W.len, -f, 1, 1);
    else if (rig.dropT >= 0) {
      const pk = rig.pickT >= 0 ? smoothstep(0, 1, rig.pickT) : 0;
      // (Lifted back from where it lay into the jaws.)
      let da = worldA - rig.dropA;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const x = rig.dropX + (rwx - rig.dropX) * pk;
      const y = rig.dropY + (rwy - rig.dropY) * pk - Math.sin(Math.PI * pk) * 4;
      const flat = rig.dropDown && pk === 0 ? 0.55 : 0.55 + 0.45 * pk;
      paintMothWing(p, x, y, rig.dropA + da * pk, W.len, -f, flat, 1);
    }
    p.alphaK = alphaK;
  }

  /** Thrown, tumbling, then on its back with its legs curled and twitching; it fades at the end. */
  private paintDead(p: Painter, rig: AntRig, e: Readonly<EnemyState>, clock: number): void {
    const A = ANT;
    const D = A.die;
    const f = rig.facing;
    this.tone(rig, e);
    // (Greyed a little as it lies.)
    const fadeK = 1 - smoothstep(D.lie, D.lie + D.fade, rig.landT);
    p.alphaK *= fadeK;
    for (let k = 0; k < 3; k++) {
      C.top[k] = C.top[k]! + (C.dusk[k]! - C.top[k]!) * 0.25 * sat(rig.landT / 0.6);
    }
    // One rigid frame about the body's middle, which follows the throw.
    const pvx = 0;
    const pvy = -8.2;
    B.set(rig.dx, rig.dy + 8.2, f, rig.rot, pvx, pvy);
    F.set(rig.dx, rig.dy + 8.2, f, rig.rot + 0.12, pvx, pvy);
    G.set(rig.dx, rig.dy + 8.2, f, rig.rot + 0.35, pvx, pvy);
    const tw = rig.landed ? 1 - sat(rig.landT / D.twitch) : 0.6;
    for (let pass = 0; pass < 2; pass++) {
      const near = pass === 1;
      if (near) this.body(p);
      for (let li = 0; li < 6; li++) {
        if (LEG_SIDE[li]! > 0 !== near) continue;
        const row = LEG_ROW[li]!;
        const rlx = A.roots[row]!;
        const rly = -6.3;
        // Curled in: knees bent, feet drawn up under the belly; twitching while it is fresh.
        const twitch = tw * noise1(clock * 11 + li * 3.1 + rig.seed * 20, li) * 2.2;
        const kx = rlx + (row === 2 ? -3.2 : 2.6) + twitch * 0.5;
        const ky = rly + 3.4;
        const fx = rlx + (row === 2 ? -1.2 : 1.4) + twitch;
        const fy = rly + 5.6 + twitch * 0.4;
        p.px[0] = B.x(rlx, rly);
        p.py[0] = B.y(rlx, rly);
        p.px[1] = B.x(kx, ky);
        p.py[1] = B.y(kx, ky);
        p.px[2] = B.x(fx, fy);
        p.py[2] = B.y(fx, fy);
        p.pw[0] = 0.9;
        p.pw[1] = 0.6;
        p.pw[2] = 0.3;
        SH_LEG.c0 = SH_LEG.c1 = C.leg;
        SH_LEG.alpha = near ? 1 : 0.85;
        p.ribbon(3, SH_LEG);
      }
    }
    rig.jaw = 0.55;
    rig.carry = 0;
    rig.dropT = -1;
    this.head(p, rig, 'dead', f, clock, 0, 0, 0);
  }
}

/** The body colours afresh each frame (the tone mixes them in place). */
function loadColorsBody(): void {
  const K = ANT.color;
  hexTo(C.top, K.top);
  hexTo(C.low, K.low);
  hexTo(C.leg, K.leg);
  hexTo(C.rust, K.rust);
  hexTo(C.rustLow, K.rustLow);
}
