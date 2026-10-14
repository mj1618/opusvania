// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * The burrback: rig (what the sim state becomes, through springs) and drawing (into the shared
 * enemies painter). A low domed beetle: a heavy dark shell with a lichen fringe along its rim, a
 * row of dim lights on the flank, a small head tucked under the front with two feelers, six legs.
 *
 * Frames of reference:
 *   local   x along the screen (already mirrored by the turn factor `d`), y down, origin at the
 *           feet centre on the ground. `d` runs -1..1: +1 faces right, 0 = seen from behind
 *           mid-turn (it always turns away from the camera, so the head passes behind the shell).
 *   body    local, then squash and rotation about the middle of its height (`setBody`): everything
 *           that is part of the body goes through `bx/by`. Planted feet do not.
 */

import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import {
  approach,
  clamp,
  hash1,
  ik2,
  ikOut,
  lerp,
  noise1,
  pulse,
  Spring,
  sat,
  smoothstep,
} from '../character/hooded/math';
import { BURR } from './config';
import { bobAt, foot, footAt, LEG_ROW, LEG_SIDE, rockAt } from './gait';
import type { Painter, RGB, Shade } from './paint';

type V3 = [number, number, number];

function v3(hex: number): V3 {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Colours as floats, read once from the config (`loadColors()` again after editing `BURR.color`). */
const C = {
  shellTop: v3(0),
  shellLow: v3(0),
  sheen: v3(0),
  seam: v3(0),
  legNear: v3(0),
  legFar: v3(0),
  plateIn: v3(0),
  edge: [v3(0), v3(0), v3(0)],
  head: v3(0),
  headLow: v3(0),
  eye: v3(0),
  eyeGlow: v3(0),
  calmLight: v3(0),
  feeler: v3(0),
  fringeTop: v3(0),
  fringeTip: v3(0),
  crack: v3(0),
  crackEdge: v3(0),
  pop: v3(0),
  shadow: v3(0),
  dust: v3(0),
  dustPale: v3(0),
  mote: v3(0),
  sleep: v3(0),
  puff: v3(0),
  puffLow: v3(0),
  crest: [v3(0), v3(0), v3(0)],
  spot: [v3(0), v3(0), v3(0)],
  ramLight: v3(0),
  belly: v3(0),
  bellyLow: v3(0),
  seamOpen: v3(0),
  spark: v3(0),
  struck: v3(0),
  hitFlash: v3(0),
  rimPale: v3(0),
  star: v3(0),
};

export function loadColors(): void {
  const k = BURR.color;
  const set = (o: V3, hex: number): void => {
    const c = v3(hex);
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
  };
  set(C.shellTop, k.shellTop);
  set(C.shellLow, k.shellLow);
  set(C.sheen, k.sheen);
  set(C.seam, k.seam);
  set(C.legNear, k.legNear);
  set(C.legFar, k.legFar);
  set(C.plateIn, k.plateIn);
  for (let i = 0; i < 3; i++) set(C.edge[i]!, BURR.edgeColor[i]!);
  set(C.head, k.head);
  set(C.headLow, k.headLow);
  set(C.eye, k.eye);
  set(C.eyeGlow, k.eyeGlow);
  set(C.calmLight, BURR.calm.light);
  set(C.feeler, k.feeler);
  set(C.fringeTop, k.fringeTop);
  set(C.fringeTip, k.fringeTip);
  set(C.crack, k.crack);
  set(C.crackEdge, k.crackEdge);
  set(C.pop, k.pop);
  set(C.shadow, k.shadow);
  set(C.dust, k.dust);
  set(C.dustPale, k.dustPale);
  set(C.mote, k.mote);
  set(C.sleep, k.sleep);
  set(C.puff, k.puff);
  set(C.puffLow, k.puffLow);
  for (let i = 0; i < 3; i++) set(C.crest[i]!, BURR.crestColor[i]!);
  for (let i = 0; i < 3; i++) set(C.spot[i]!, BURR.spotColor[i]!);
  set(C.ramLight, BURR.ram.light);
  set(C.belly, BURR.ram.belly);
  set(C.bellyLow, BURR.ram.bellyLow);
  set(C.seamOpen, BURR.ram.seam);
  set(C.spark, BURR.ram.spark);
  set(C.struck, BURR.hit.struck);
  set(C.hitFlash, BURR.hit.flashColor);
  set(C.rimPale, BURR.ram.rimPale);
  set(C.star, BURR.ram.star);
}
loadColors();

export const COLORS = C;

function ease(t: number): number {
  const u = sat(t);
  return u * u * (3 - 2 * u);
}

/** Everything about one creature that outlives a frame. */
export class BurrRig {
  /** 0..1, fixed per creature: de-syncs pulses and idles. */
  readonly seed: number;
  /** Last sim frame seen, and the feet-centre x / walked distance before and at it. */
  private frame = -1;
  private px = 0;
  private cx = 0;
  private ps = 0;
  private cs = 0;
  /** Drawn feet centre (world px) and its speed (px/s). */
  x = 0;
  y = 0;
  vx = 0;
  private lastX = 0;
  /** Distance that drives the legs: walked px plus the shuffle of a turn. */
  dist = 0;
  private shuffle = 0;
  /** Turn factor of the body and of the head (the head leads). */
  d = 1;
  dHead = 1;
  /** 0 standing .. 1 settled on its belly (.. 1.25 hunkered in a flinch). */
  readonly crouch = new Spring(0, 11, 0.75);
  /** Head pulled in, 0..1. */
  readonly tuck = new Spring(0, 20, 0.7);
  /** Shell rotation, rad (+ = clockwise on screen). */
  readonly rock = new Spring(0, 15, 0.26);
  /** Squash along x (negative = shorter and taller). */
  readonly squash = new Spring(0, 30, 0.34);
  /** What trails: fringe and feelers lag by this many px. */
  readonly lag = new Spring(0, 17, 0.32);
  readonly feel0 = new Spring(0.5, 30, 0.45);
  readonly feel1 = new Spring(0.5, 30, 0.45);
  /** Where the eyes look, screen space (-1..1 each), how wary it is (0..1) and the blink (0..1 shut). */
  lookX = 1;
  lookY = 0.2;
  wary = 0;
  blink = 0;
  /** Blend weights that are eased, 0..1. */
  hurtK = 0;
  teeterK = 0;
  walkK = 1;
  /** The hit this rig last reacted to (sim frame). */
  private hitSeen = -1;
  private lastMode: EnemyState['mode'] = 'walk';
  /** Set for the one update in which a new hit was seen (the renderer throws chips). */
  struck = false;
  /** Calmed, 0..1 (eased): settled, slow breath, warm lights, lids down. */
  calmK = 0;
  /** Breath phase, rad: integrated, so its rate can change without a jump. */
  breath = 0;
  /** Seconds since a calm mote last lifted off it. */
  moteT = 0;
  /** Why the turn in progress started (set by the renderer from `enemyTurn`), and the side of what it turns from. */
  turnAct: '' | 'lantern' | 'wary' = '';
  actDir = 1;
  actNew = false;

  /** A turn with a cause has begun: `dir` = the side of the light / the edge it turns from. */
  react(cause: 'lantern' | 'wary', dir: number): void {
    this.turnAct = cause;
    this.actDir = dir;
    this.actNew = true;
  }
  /** Shying from a lantern's light: 1 through the flinch, easing off after the turn. */
  shyK = 0;
  /** Peering at an edge she is under, 0..1 (eased), and the side it peers to. */
  peerK = 0;
  peerDir = 1;
  /** Head craned out, 0..1; the body's weight shifted along the screen, px; burrs raised, 0..1. */
  readonly reach = new Spring(0, 13, 0.6);
  readonly back = new Spring(0, 13, 0.5);
  readonly bristle = new Spring(0, 24, 0.32);
  /** The bump of its touch: the mode start it belongs to, where the turn factors were, the way it was shoved. */
  private touchStart = -1;
  private touchD = 1;
  private touchDH = 1;
  touching = false;
  /** Set for the one update in which its touch landed (the renderer throws dust). */
  bumped = false;
  /** The side a squash is taken along: the blow's, or the bump's. */
  sqDir = 0;
  /**
   * It has noticed her (render only): the state, its eased weight, and the flash of the moment
   * it did (1, fading).
   */
  noticed = false;
  noticeK = 0;
  flash = 0;
  /** Standing, last update (a wary stand is 30-frame pauses with one frame of `walk` between them). */
  private stood = false;
  /** Death effects already thrown (bit 1: first break, bit 2: second). */
  deadStage = 0;
  /** Dust accumulator (render seconds). */
  dustT = 0;
  /** Sim frames into the current mode, fractional. */
  mf = 0;
  /** Frames since the last hit, fractional (large = never). */
  hitAge = 1e6;
  /** Held in a blow's hitstop; frames since it let go (large = never); the squash it is held at. */
  held = false;
  rel = 1e6;
  private hitSq = 0;
  /** Set for the one update in which a blow's hold ended (the renderer throws the skid's dust). */
  released = false;
  /**
   * The ram. Eased weights 0..1: braced (shell forward: the tell and the ram), ramming, spent.
   * `guard`: the brow plate out and down as a shield (1), lifted open when spent (< 0). `flatK`:
   * burrs laid back. `count`: the flash of the tell's count (1 on a beat, falling), `windU` its progress.
   */
  braceK = 0;
  ramK = 0;
  spentK = 0;
  flatK = 0;
  count = 0;
  windU = 0;
  readonly guard = new Spring(0, 30, 0.42);
  /**
   * A staged beat (the prologue: render/prologue/grove.ts), or null. `reach` 0..1 cranes the head
   * out toward what it watches, `open` 0..1 lifts the brow plate open, `watch` 0..1 holds its eyes on
   * the hero point it is given. Never set by the game.
   */
  cine: { reach: number; open: number; watch: number } | null = null;
  /** Rear feet scraping through the tell: phase in strokes; set for the one update a stroke starts. */
  scrapeP = 0;
  scraped = false;
  /** Set for the one update in which it braced. */
  braceNew = false;
  /** Which beat of the count it is on (0 .. beats - 1; -1 before the first); set for the one update a beat lands. */
  beatN = -1;
  beatNew = false;
  /** Seconds since the ram was let go (the release flash). */
  relT = 9;
  /** Stunned (stopped dead by a wall, a ledge, a light), 0..1 eased: a harder daze than spent. */
  stunK = 0;
  /** A cut glanced off its shell: the shudder (1, dying) and the seconds since. */
  ring = 0;
  ringT = 9;
  /** How the ram ended (set by the renderer from `enemyRecover`); `stopped` holds it for one update. */
  private spentCause: '' | 'spent' | 'wall' | 'ledge' | 'lantern' | 'touch' = '';
  private spentNew = false;
  stopped: '' | 'spent' | 'wall' | 'ledge' | 'lantern' | 'touch' = '';
  /** Seconds a spent one has panted since its last puff. */
  pantT = 0;
  /** Made whole after she faded (`enemyReset`): armed until it is next drawn, then seconds into the shake. */
  wakeArm = false;
  wakeT = 9;
  /** Share of the time it cannot brace that is left, 0..1 (its lights come back as it runs out). */
  cdK = 0;
  /**
   * Curled up after a pogo landed (`tuck` > 0), 0..1 eased: rolled tight on the ground, legs and head
   * in, rocking slowly (`curlPh`, rad), its lights down to one slit. Set for the one update it uncurls.
   */
  curlK = 0;
  curlPh = 0;
  private curled = false;
  /** A down cut glanced off its top (`enemyBlock` slash `down`): the clang (1, dying), seconds since, where (-1..1 along the screen). */
  ringTop = 0;
  ringTopT = 9;
  topU = 0;
  /** Set until the renderer has thrown the chips of a new clang (it needs the drawn top). */
  topNew = false;
  /** Hurrying out from under her as she drops onto it, 0..1 eased; `glance` = the look up at her (1, fading). */
  scurryK = 0;
  glance = 0;
  private scurried = false;

  /** Her down cut glanced off its top; `u` = where along it it struck (-1 left .. 1 right, screen). */
  blockTop(u: number): void {
    const K = BURR.clang;
    this.ringTop = 1;
    this.ringTopT = 0;
    this.topU = u;
    this.topNew = true;
    // Pounded flat for a moment (the rebound is the spring's), tipped away from where it was struck.
    this.squash.x = K.squash;
    this.squash.v = 0;
    this.sqDir = 0;
    this.rock.v += u * K.rock;
    this.bristle.v += K.bristle;
  }

  /** The next new hit is a down cut that landed (a pogo): it is pounded flat, not pushed along. */
  pogo = false;

  /** It turns to hurry out from under her (`enemyTurn` cause `drop`): a start and a look up. */
  startle(): void {
    this.squash.x = 0.1;
    this.squash.v = 0;
    this.sqDir = 0;
    this.bristle.v += 16;
    this.glance = 1;
  }

  /** Her cut glanced off its braced shell; `dir` = the way the cut was going. */
  block(dir: number): void {
    this.ring = 1;
    this.ringT = 0;
    this.squash.x = -0.11;
    this.squash.v = 0;
    this.sqDir = dir;
    this.rock.v -= this.d * 2.4;
    this.back.v += dir * 80;
    this.bristle.v += 18;
  }

  /** The ram is over (`enemyRecover`); `broken` = no ram ended: a blow from behind or above broke its brace. */
  spent(cause: 'spent' | 'wall' | 'ledge' | 'lantern' | 'touch', broken = false): void {
    this.spentCause = cause;
    this.spentNew = true;
    this.spentBroken = broken;
  }
  private spentBroken = false;

  /** It is whole and home again after she faded: it shakes it off when next seen. */
  reset(): void {
    this.wakeArm = true;
  }

  constructor(index: number) {
    this.seed = hash1(index * 131 + 17);
  }

  /**
   * `hx, hy` = where the hero is (her head), world px; `feetY` = her feet, `seen` = she is there to
   * be watched (not faded); `safe` = it is harmless for a lasting reason (inside a lit lantern's
   * sanctuary, the run is over); `clock` = render seconds; `drop` = she is dropping onto it from high
   * above (the sim's `dropping`, near it sideways).
   */
  update(
    e: EnemyState,
    simFrame: number,
    alpha: number,
    dt: number,
    hx: number,
    hy: number,
    clock: number,
    feetY = 0,
    seen = false,
    safe = false,
    drop = false,
  ): void {
    const B = BURR;
    const f = e.facing;
    const nx = e.x + e.w / 2 + e.rx;
    const ns = e.stride + (e.mode === 'walk' ? e.rx * f : 0);
    const fresh = this.frame < 0 || Math.abs(nx - this.cx) > 70 || simFrame < this.frame;
    if (fresh) {
      this.px = this.cx = nx;
      this.ps = this.cs = ns;
      this.frame = simFrame;
      this.d = this.dHead = f;
      this.hitSeen = e.hitFrame;
      this.deadStage = e.mode === 'dead' ? 3 : 0;
      this.crouch.snap(0);
      this.tuck.snap(0);
      this.rock.snap(0);
      this.squash.snap(0);
      this.lag.snap(0);
      this.hurtK = this.teeterK = 0;
      this.shuffle = 0;
      this.calmK = safe || e.calm > 0 ? 1 : 0;
      this.turnAct = '';
      this.shyK = this.peerK = 0;
      this.reach.snap(0);
      this.back.snap(0);
      this.bristle.snap(0);
      this.touchStart = simFrame - e.modeFrames;
      this.touching = false;
      this.stood = false;
      this.noticed = false;
      this.noticeK = this.flash = 0;
      this.rel = 1e6;
      this.held = false;
      const br = e.mode === 'windup' || e.mode === 'charge';
      this.braceK = this.flatK = br ? 1 : 0;
      this.ramK = e.mode === 'charge' ? 1 : 0;
      this.spentK = e.mode === 'recover' ? 1 : 0;
      this.guard.snap(br ? 1 : 0);
      this.ring = 0;
      this.spentNew = false;
      this.curled = e.tuck > 0 && !br && e.mode !== 'dead';
      this.curlK = this.curled ? 1 : 0;
      this.ringTop = 0;
      this.topNew = false;
      this.scurryK = this.glance = 0;
    } else if (simFrame !== this.frame) {
      this.px = this.cx;
      this.ps = this.cs;
      this.cx = nx;
      this.cs = ns;
      this.frame = simFrame;
    }
    const a = sat(alpha);
    this.x = this.px + (this.cx - this.px) * a;
    this.y = e.y + e.h;
    this.vx = fresh || dt <= 0 ? 0 : clamp((this.x - this.lastX) / dt, -900, 900);
    this.lastX = this.x;
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    if (e.mode !== 'dead') this.deadStage = 0;

    // --- Calm: eases in, and lifts over its last frames.
    const calmT = e.mode === 'dead' ? 0 : safe ? 1 : sat(e.calm / B.calm.fade);
    this.calmK += (calmT - this.calmK) * approach(calmT > this.calmK ? B.calm.in : B.calm.out, dt);
    const calm = this.calmK;
    this.breath += (2.1 + (B.calm.rate - 2.1) * calm + (B.ram.pant - 2.1) * this.spentK) * dt;

    // --- Its touch landed: `alert` with a shove (a plain flinch has none). Seen once per mode start.
    const modeStart = simFrame - e.modeFrames;
    this.bumped = false;
    const bumpMode = e.mode === 'alert' || e.mode === 'recover';
    if (bumpMode && e.knockVx !== 0 && modeStart !== this.touchStart && !fresh) {
      this.touchStart = modeStart;
      this.touchD = this.d;
      this.touchDH = this.dHead;
      this.bumped = true;
      const away = e.knockVx > 0 ? 1 : -1;
      this.sqDir = away;
      this.squash.x = -B.touch.squash;
      this.squash.v = 0;
      this.rock.v += away * B.touch.rock;
      this.bristle.v += B.touch.kick;
    }
    this.touching = bumpMode && modeStart === this.touchStart;

    // --- Standing with her below it and near: it peers at the edge she is under.
    const turningNow = e.mode === 'pause' && e.turning;
    if (!turningNow) this.turnAct = '';
    const standing = (e.mode === 'pause' && !e.turning) || (e.mode === 'walk' && e.vx === 0 && this.stood);
    this.stood = standing;
    const below = seen && feetY > e.y + e.h + B.peer.belowPx && Math.abs(hx - this.x) < B.peer.reachX;
    let peer = standing && below && calmT === 0;
    if (peer) this.peerDir = hx < this.x ? -1 : 1;

    // --- Noticing her: near, lit, on about its level. One start (burrs kicked up, it perks), then
    // it keeps its burrs raised and its eyes on her for as long as she is close.
    const N = B.notice;
    const awake = seen && calmT === 0 && this.calmK < 0.5 && e.mode !== 'dead';
    const near =
      Math.abs(hx - this.x) < N.reach + (this.noticed ? N.slack : 0) &&
      Math.abs(feetY - (e.y + e.h)) < N.level;
    const noticedNow = awake && near;
    if (noticedNow && !this.noticed && !fresh) {
      this.flash = 1;
      this.bristle.v += N.kick;
      if (e.mode === 'walk' || e.mode === 'pause') {
        this.squash.x = -0.08;
        this.squash.v = 0;
        this.sqDir = 0;
      }
    }
    this.noticed = noticedNow;
    this.noticeK += ((noticedNow ? 1 : 0) - this.noticeK) * approach(noticedNow ? N.in : N.out, dt);
    this.flash += (0 - this.flash) * approach(N.fade, dt);

    // --- Turning: the head swings round first, the body pivots after it.
    const lastD = this.d;
    /** 1 through the first beat of a turn that is a reaction (it has not begun to turn yet). */
    let react = 0;
    if (turningNow) {
      const total = Math.max(1, e.modeFrames + e.timer);
      const t = sat(this.mf / total);
      // A turn with a cause starts with the reaction to it; the turn itself takes what is left.
      const hold = this.turnAct === 'lantern' ? B.shy.hold : this.turnAct === 'wary' ? B.peer.hold : 0;
      const u = sat((t - hold) / (1 - hold));
      react = hold > 0 ? 1 - smoothstep(hold * 0.75, hold * 1.25, t) : 0;
      this.dHead = -f + 2 * f * ease(u / 0.5);
      this.d = -f + 2 * f * ease((u - 0.16) / 0.74);
      if (this.turnAct === 'wary' && react > 0.5) {
        peer = true;
        this.peerDir = this.actDir;
      }
    } else if (this.touching) {
      // The sim turns it away from her at once; drawn, it takes the bump first and turns after.
      const T = B.touch;
      // (Spent after its ram met her, it stays as it was, dazed, and comes round late.)
      const hold = e.mode === 'recover' ? T.hold * 2 : T.hold;
      this.dHead = this.touchDH + (f - this.touchDH) * ease((this.mf - hold) / T.head);
      this.d = this.touchD + (f - this.touchD) * ease((this.mf - hold - 2) / T.body);
    } else {
      // Peering, it turns to the edge's side; walking on, it comes back round.
      const want = peer || (this.peerK > 0.6 && standing) ? this.peerDir : f;
      const slow = this.peerK > 0.05;
      this.d += (want - this.d) * approach(slow ? 7 : 22, dt);
      this.dHead += (want - this.dHead) * approach(slow ? 11 : 30, dt);
      if (Math.abs(this.d - want) < 0.002) this.d = want;
      if (Math.abs(this.dHead - want) < 0.002) this.dHead = want;
    }
    this.peerK += ((peer ? 1 : 0) - this.peerK) * approach(peer ? B.peer.in : B.peer.out, dt);
    const shying = this.turnAct === 'lantern';
    if (shying) this.shyK = Math.max(this.shyK, react);
    if (!shying || react < 0.5) this.shyK += (0 - this.shyK) * approach(1 / B.shy.linger, dt);
    this.shuffle += Math.abs(this.d - lastD) * 15;
    this.dist = this.ps + (this.cs - this.ps) * a + this.shuffle;

    // --- A new hit: a sharp squash along the blow and a rock back.
    this.struck = false;
    if (e.hitFrame !== this.hitSeen) {
      this.hitSeen = e.hitFrame;
      if (e.hitFrame >= 0) {
        const pw = 0.75 + 0.25 * Math.max(1, e.hitPower);
        this.hitSq = this.pogo ? B.curl.pound * pw : -B.hit.squash * pw;
        this.squash.x = this.hitSq;
        this.squash.v = 0;
        this.sqDir = this.pogo ? 0 : e.hitDir;
        this.rel = 0;
        this.held = true;
        if (e.mode !== 'dead') this.rock.v += (e.hitDir || f) * B.hit.rock * pw * (this.pogo ? 0.5 : 1);
        this.struck = true;
      }
      this.pogo = false;
    }

    // The blow's hold: pinned in its squash for as long as the sim holds it, let go as the shove starts.
    const mode = e.mode;
    this.released = false;
    if (this.held) {
      if (e.hitstop > 0 && (mode === 'hurt' || mode === 'dead')) {
        this.squash.x = this.hitSq;
        this.squash.v = 0;
        this.rel = 0;
      } else {
        this.held = false;
        this.released = true;
      }
    } else if (this.rel < 1e5) this.rel += dt * 60;

    // --- The ram: brace (the tell), ram, spent.
    const R = B.ram;
    const wind = mode === 'windup';
    const ram = mode === 'charge';
    const spentM = mode === 'recover';
    const modeTotal = Math.max(1, e.modeFrames + e.timer);
    // --- Curled (a pogo landed): it rolls up at once and stays so through the flinch and the
    // winded time, until it uncurls (on the timer, or straight into its brace).
    const Cu = B.curl;
    const curledNow = e.tuck > 0 && mode !== 'dead' && !wind && !ram;
    const uncurled = this.curled && !curledNow;
    this.curled = curledNow;
    this.curlK +=
      ((curledNow ? 1 : 0) - this.curlK) * approach(curledNow ? Cu.in : wind ? Cu.outBrace : Cu.out, dt);
    if (this.curlK < 0.002) this.curlK = 0;
    // (Shoved or walked along while curled, it waddles on its round back instead of sliding.)
    this.curlPh += dt * (Cu.rockRate * (0.6 + 0.4 * this.curlK) + Math.abs(this.vx) * Cu.waddle);
    // Uncurled on the timer: it shakes itself out.
    if (uncurled && !wind) this.bristle.v += Cu.shake;
    this.braceNew = false;
    this.scraped = false;
    if (wind && this.lastMode !== 'windup' && !fresh) {
      this.braceNew = true;
      if (this.curlK > 0.3) {
        // Out of a curl: one motion, the shell rolls forward off its back into the wedge, rising
        // as it goes, the plate thrown out of the roll (no flattening first: it is already low).
        this.squash.x = -Cu.unrollStretch;
        this.squash.v = 0;
        this.sqDir = 0;
        this.rock.v += this.d * Cu.unrollRoll;
        this.guard.v += Cu.unrollGuard;
        this.bristle.v += Cu.unrollBristle;
      } else {
        // The plant: one quick flattening, the front thrown down, the plate shot forward.
        this.squash.x = 0.13;
        this.squash.v = 0;
        this.sqDir = 0;
        this.rock.v += this.d * 4;
        this.guard.v += 12;
      }
      this.scrapeP = 0;
      this.beatN = -1;
    }
    this.beatNew = false;
    if (ram && this.lastMode !== 'charge' && !fresh) this.relT = 0;
    else this.relT += dt;
    this.windU = wind ? sat(this.mf / modeTotal) : ram ? 1 : 0;
    if (wind) {
      const ph = R.beats * this.windU ** R.countPow;
      const fr = 1 - (ph - Math.floor(ph));
      this.count = fr * fr;
      const bn = Math.min(R.beats - 1, Math.floor(ph));
      if (bn !== this.beatN) {
        this.beatN = bn;
        this.beatNew = true;
      }
      const before = Math.floor(this.scrapeP * 2);
      this.scrapeP += (dt * 60 * R.scrapes) / modeTotal;
      this.scraped = Math.floor(this.scrapeP * 2) !== before || this.braceNew;
    } else this.count = ram ? 1 : 0;
    const bracedNow = wind || ram;
    this.braceK += ((bracedNow ? 1 : 0) - this.braceK) * approach(bracedNow ? 40 : 12, dt);
    this.flatK += ((bracedNow ? 1 : 0) - this.flatK) * approach(bracedNow ? 26 : 9, dt);
    this.ramK += ((ram ? 1 : 0) - this.ramK) * approach(ram ? 34 : 14, dt);
    /** Spent, it gathers itself over its last frames. */
    // (Curled, it is a closed shell, not a winded one: no open plates, no lifted front.)
    const gather = spentM && !curledNow ? sat(e.timer / R.gather) : 0;
    this.spentK += (gather - this.spentK) * approach(gather > this.spentK ? 16 : 9, dt);
    // (Only a wall: the sim stands it there three times as long. A ledge or a light is a jolt, then plain winded.)
    const stunned = spentM && this.spentCause === 'wall';
    this.stunK += ((stunned ? gather : 0) - this.stunK) * approach(stunned ? 20 : 7, dt);
    this.stopped = '';
    if (this.spentNew) {
      this.spentNew = false;
      const cause = this.spentCause;
      this.stopped = cause;
      if (this.spentBroken) {
        // Its brace broken by a blow: it drops where it stands, no skid.
        this.rock.v -= this.d * 2;
        this.bristle.v += 14;
      } else if (cause === 'spent') {
        // Its length run out: it skids on a little way and sits back.
        this.back.v += this.d * R.skid;
        this.rock.v -= this.d * 3;
      } else if (cause !== 'touch') {
        // Stopped dead by something: crumpled against it, thrown back off it.
        this.squash.x = -R.jolt;
        this.squash.v = 0;
        this.sqDir = this.d >= 0 ? 1 : -1;
        this.rock.v += this.d * 7;
        this.back.v -= this.d * R.joltBack;
        this.bristle.v += 30;
      }
    }
    if (this.ring > 0.01) {
      this.ringT += dt;
      this.ring = Math.exp(-R.ringFade * this.ringT);
    } else this.ring = 0;
    if (this.ringTop > 0.01) {
      this.ringTopT += dt;
      this.ringTop = Math.exp(-B.clang.fade * this.ringTopT);
    } else this.ringTop = 0;
    // --- Hurrying out from under her: low, fast, head in, a look up at her as it goes.
    const Sc = B.scurry;
    // (Standing while she is still coming down, it stays low and watches her.)
    const scurry =
      ((mode === 'walk' && Math.abs(e.vx) >= Sc.minVx) || (drop && (mode === 'walk' || mode === 'pause'))) &&
      !curledNow;
    if (scurry && !this.scurried && !fresh) this.glance = Math.max(this.glance, 0.8);
    this.scurried = scurry;
    this.scurryK += ((scurry ? 1 : 0) - this.scurryK) * approach(scurry ? Sc.in : Sc.out, dt);
    this.glance += (0 - this.glance) * approach(Sc.glanceFade, dt);
    this.wakeT += dt;
    const braceable = mode === 'walk' || mode === 'pause' || mode === 'alert' || mode === 'hurt';
    this.cdK = braceable ? sat(e.strikeCd / Math.max(1, tuning.burrback.strikeCooldown)) : 0;

    // --- Pose targets per mode.
    // A flinch starts with a start: one quick flattening before it hunkers.
    if (mode === 'alert' && this.lastMode !== 'alert' && !fresh && !this.touching) this.squash.x = 0.09;
    // The start at a lantern's light: the same quick flattening, and it is thrown back on its legs.
    if (shying && this.actNew && !fresh) {
      this.squash.x = 0.1;
      this.back.v = -this.actDir * B.shy.kick;
    }
    this.actNew = false;
    this.lastMode = mode;
    const resting = mode === 'pause' && !e.turning;
    const turning = mode === 'pause' && e.turning;
    const sliding = this.touching && Math.abs(e.knockVx) > 0.5;
    let crouchT = 0;
    let tuckT = 0;
    let leanT = 0;
    let backT = 0;
    let reachT = 0;
    let bristleT = 0;
    let squashT = 0;
    if (mode === 'walk' && !standing) leanT = this.d * B.gait.lean;
    else if (resting || standing) {
      crouchT = 1;
      tuckT = 0.2;
    } else if (turning) crouchT = 0.2;
    else if (sliding) {
      // Shoved back off her: up on its legs and skidding, head pulled in, burrs up.
      crouchT = 0.15;
      tuckT = 0.8;
      leanT = this.sqDir * 0.1;
      bristleT = 1;
    } else if (mode === 'alert') {
      crouchT = 1 + B.hunker / B.settle;
      tuckT = this.touching ? 0.6 : 0.4;
      bristleT = this.touching ? 0.45 * sat(e.timer / 8) : 0;
    } else if (mode === 'hurt') {
      crouchT = 0.15;
      tuckT = 0.75;
      leanT = e.hitDir * 0.1 * sat(Math.abs(e.knockVx) / 6);
    } else if (wind) {
      // Planted: front down, head under the plate, weight coiling back as the count runs.
      crouchT = R.crouch;
      tuckT = 0.85;
      leanT = this.d * R.pitch;
      backT = -this.d * (R.back + R.coil * this.windU * this.windU);
    } else if (ram) {
      crouchT = R.ramCrouch;
      tuckT = 1;
      leanT = this.d * R.ramPitch;
      backT = this.d * 4;
      squashT = R.stretch;
    } else if (spentM) {
      // Winded: sat back on its tail, front lifted, head hanging out, swaying.
      // (Stunned by what stopped it: nearly on its back, rocking.)
      const st = this.stunK;
      crouchT = R.sit * gather;
      reachT = 0.9 * gather;
      leanT =
        (-this.d * (R.tip + (R.stunTip - R.tip) * st) +
          (R.daze + (R.stunRock - R.daze) * st) *
            Math.sin(clock * R.dazeRate * (1 + 0.6 * st) + this.seed * 9)) *
        gather;
      backT = -this.d * 2 * gather;
      bristleT = 0.3 * gather;
    } else tuckT = 1;
    // It cannot brace yet: it keeps its head in a little.
    if (this.cdK > 0 && (mode === 'walk' || mode === 'pause'))
      tuckT = Math.max(tuckT, R.wary * sat(this.cdK * 3));
    // Shying from the light: ducked, head in, rocked back off its front legs, weight away from it.
    if (shying && react > 0) {
      crouchT += (B.shy.duck - crouchT) * react;
      tuckT += (1 - tuckT) * react;
      leanT += (-this.actDir * B.shy.rock - leanT) * react;
      backT = -this.actDir * B.shy.back * react;
    }
    tuckT = Math.max(tuckT, 0.55 * this.shyK);
    bristleT = Math.max(bristleT, N.bristle * this.noticeK);
    // Peering: low on its legs, weight back from the edge, the head craned out toward it.
    const pk = this.peerK;
    if (pk > 0.001) {
      crouchT += (B.peer.crouch - crouchT) * pk;
      tuckT *= 1 - pk;
      leanT += (-this.peerDir * B.peer.rock - leanT) * pk;
      backT += -this.peerDir * B.peer.back * pk;
      reachT = pk;
    }
    // Calmed: all the way down, head out and easy (a calmed turn keeps turning, slowly).
    if (calm > 0.001 && mode !== 'hurt' && mode !== 'dead') {
      // (Only where it stands: one that walks out of a sanctuary walks, with the calm in its lights.)
      if (!turning && (mode !== 'walk' || standing)) crouchT += (B.calm.settle - crouchT) * calm;
      tuckT += (0.08 - tuckT) * calm;
      leanT *= 1 - calm;
      bristleT *= 1 - calm;
    }
    // Hurrying out from under her: low on its legs, leaning into it, head in, burrs laid back.
    const sk = this.scurryK;
    if (sk > 0.001) {
      const moving = sat(Math.abs(e.vx) / Sc.minVx);
      crouchT += (Sc.crouch - crouchT) * sk * moving;
      tuckT += (Sc.tuck - tuckT) * sk;
      leanT += (this.d * Sc.lean - leanT) * sk * moving;
      bristleT += (-Sc.flat - bristleT) * sk;
      reachT *= 1 - sk;
    }
    // Curled: right down on the ground, head in, rocking slowly on its round back.
    const ck = this.curlK;
    if (ck > 0.001) {
      crouchT += (Cu.crouch - crouchT) * ck;
      tuckT += (1 - tuckT) * ck;
      leanT += (Cu.rock * Math.sin(this.curlPh + this.seed * 6) - leanT) * ck;
      backT *= 1 - ck;
      reachT *= 1 - ck;
      bristleT += (Cu.burrs - bristleT) * ck;
    }
    // A staged beat: the head out and up toward what it watches, the front lifting with it.
    const cine = this.cine;
    if (cine) {
      reachT = Math.max(reachT, cine.reach);
      leanT -= this.d * 0.26 * cine.reach;
    }
    const sharp =
      (mode === 'alert' && !sliding) || (shying && react > 0.5) || wind || (curledNow && ck < 0.9);
    this.crouch.omega = sharp ? 36 : mode === 'walk' ? 15 : 10;
    this.crouch.zeta = sharp ? 0.55 : 0.8;
    this.crouch.step(crouchT, dt);
    this.tuck.step(tuckT, dt);
    this.rock.zeta = bracedNow ? 0.55 : spentM || curledNow ? 0.34 : 0.26;
    this.rock.step(mode === 'dead' ? 0 : leanT, dt);
    this.squash.step(squashT, dt);
    this.guard.step(bracedNow ? 1 : cine && cine.open > 0 ? -cine.open : -R.lift * gather, dt);
    this.back.step(backT, dt);
    this.reach.step(reachT, dt);
    this.bristle.step(bristleT, dt);
    this.lag.step(this.vx * B.fringe.lag, dt);
    const skid =
      sliding ||
      (mode === 'hurt' && (e.hitstop > 0 || Math.abs(e.knockVx) > 0.5 || e.modeFrames < 9)) ||
      (spentM && this.spentCause === 'spent' && !this.spentBroken && this.mf < 7);
    this.hurtK += ((skid ? 1 : 0) - this.hurtK) * approach(skid ? 40 : 9, dt);
    const tee = mode === 'hurt' && e.teeter !== 0;
    this.teeterK += ((tee ? 1 : 0) - this.teeterK) * approach(tee ? 26 : 10, dt);
    // Eyes: ahead and a little down on the walk, wandering at rest, on her when it is wary.
    const watch = mode === 'alert' || mode === 'hurt' || bracedNow;
    this.wary += ((watch ? 1 : 0) - this.wary) * approach(watch ? 30 : 2.2, dt);
    let lx = f * 0.75;
    let ly = 0.3;
    if (resting) {
      lx = f * (0.2 + 0.7 * noise1(clock * 0.5 + this.seed * 31, 11));
      ly = 0.25 * noise1(clock * 0.4 + this.seed * 17, 12);
    }
    // (Peering, they are on her too; shying, they turn from the light and narrow; calm, they sink.)
    const onHer =
      Math.max(
        this.wary,
        0.9 * pk,
        this.noticeK,
        seen ? sat(this.cdK * 4) * 0.8 : 0,
        sk,
        this.cine?.watch ?? 0,
      ) *
      (1 - this.spentK);
    if (onHer > 0.02) {
      const dx = hx - this.x;
      const dy = hy - (this.y - 12);
      const dl = Math.hypot(dx, dy) || 1;
      lx += ((dx / dl) * 0.95 - lx) * sat(onHer * 1.5);
      ly += ((dy / dl) * 0.95 - ly) * sat(onHer * 1.5);
    }
    if (shying && react > 0) {
      lx += (-this.actDir * 0.7 - lx) * react;
      ly += (0.6 - ly) * react;
    }
    ly += (0.7 - ly) * calm * 0.8;
    // Spent, they roll.
    if (this.spentK > 0.01) {
      lx += (Math.cos(clock * 6.3 + this.seed * 5) * 0.9 - lx) * this.spentK;
      ly += (0.25 + Math.sin(clock * 6.3 + this.seed * 5) * 0.7 - ly) * this.spentK;
    }
    // (The look up at her as it starts to hurry: the eyes jump to her.)
    const lk = approach(mode === 'alert' || this.glance > 0.3 ? 40 : 9, dt);
    this.lookX += (lx - this.lookX) * lk;
    this.lookY += (ly - this.lookY) * lk;
    const bp = pulse(clock + this.seed * 9, 3.4, 0.14, 3 + Math.floor(this.seed * 50));
    this.blink = watch || this.noticeK > 0.5 ? 0 : bp > 0 ? Math.sin(Math.PI * bp) : 0;
    this.blink = Math.max(
      this.blink,
      B.shy.squint * (shying ? react : 0),
      0.3 * this.shyK,
      R.eye * this.braceK,
      0.5 * this.spentK,
    );
    // Curled, the lids are down to a slit; the look up at her is wide awake.
    this.blink = Math.max(this.blink, 0.75 * this.curlK) * (1 - this.glance);
    const walking = (mode === 'walk' && !standing) || turning;
    this.walkK += ((walking ? 1 : 0) - this.walkK) * approach(14, dt);
  }
}

// --- Drawing. Module-level scratch: nothing is allocated per frame.

const NT = 20;
const NB = 6;
const N_OUT = NT + NB;
const LX = new Float32Array(N_OUT);
const LY = new Float32Array(N_OUT);

/** Body transform (local -> world), set per creature by `setBody`. */
let mA = 1;
let mB = 0;
let mC = 0;
let mD = 1;
let mE = 0;
let mF = 0;

function setBody(ox: number, oy: number, sx: number, sy: number, rot: number, pivot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // world = o + pivot + R * (S * local - pivot)
  mA = c * sx;
  mB = -s * sy;
  mC = s * sx;
  mD = c * sy;
  mE = ox + s * pivot;
  mF = oy + pivot - c * pivot;
}

function bx(x: number, y: number): number {
  return mA * x + mB * y + mE;
}

function by(x: number, y: number): number {
  return mC * x + mD * y + mF;
}

/** A point on the flank: u -1..1 along the length (+ = toward the head), v 0..1 up the dome. */
let sX = 0;
let sY = 0;
function surface(u: number, v: number, d: number, rimH: number): void {
  const sn = sat(v) ** (1 / BURR.ey);
  const w = Math.max(0, 1 - sn * sn) ** (BURR.ex / 2);
  sX = d * (u * BURR.halfLen * w - BURR.shear * sn);
  sY = -rimH - BURR.dome * v;
}

const sh = (
  c0: V3,
  c1: V3,
  rim: number,
  cool: number,
  form: number,
  band: number,
): Shade & { alpha: number } => ({
  c0: c0 as unknown as RGB,
  c1: c1 as unknown as RGB,
  rim,
  cool,
  form,
  band,
  ember: 0,
  alpha: 1,
});

/** Working colours (base colours after the hit tone), and the shades that point at them. */
const W = {
  shellTop: v3(0),
  shellLow: v3(0),
  sheen: v3(0),
  seam: v3(0),
  leg0: v3(0),
  leg1: v3(0),
  head: v3(0),
  headLow: v3(0),
  eye: v3(0),
  feeler: v3(0),
  fringe0: v3(0),
  fringe1: v3(0),
  crack: v3(0),
  spot: v3(0),
  crest: v3(0),
  hornTip: v3(0),
  edge: v3(0),
  belly: v3(0),
  bellyLow: v3(0),
};
const SH_SHELL = sh(W.shellTop, W.shellLow, 0.3, 0.28, 0.1, 0.1);
const SH_SHEEN = sh(W.sheen, W.sheen, 0, 0, 0, 0.5);
const SH_HORN = sh(W.shellTop, W.hornTip, 0.3, 0.28, 0.1, 0.3);
const SH_CREST = sh(W.crest, W.crest, 0, 0, 0, 0.5);
const KEY: V3 = [1, 0.85, 0.63];
/**
 * Horn, ridge burrs and tail lip: [angle over the dome from the front (x pi), length, lean toward the head,
 * lean up, bow, half-width at the base].
 */
const SPIKES: readonly (readonly number[])[] = [
  [0.13, 11, 0.5, 0.55, 0.16, 3.6],
  [0.38, 5, -0.2, 0.15, 0, 3.5],
  [0.53, 6.2, -0.25, 0.15, 0, 3.8],
  [0.68, 5.8, -0.3, 0.1, 0, 3.7],
  [0.94, 6.6, -0.45, 0.55, -0.1, 3.4],
];
const SH_SEAM = sh(W.seam, W.seam, 0, 0, 0, 0.5);
const SH_LEG = sh(W.leg0, W.leg1, 0.12, 0.2, 0.06, 0.4);
const SH_HEAD = sh(W.head, W.headLow, 0.3, 0.3, 0.1, 0.3);
const SH_EYE = sh(W.eye, W.eye, 0, 0, 0, 0.5);
const SH_FEEL = sh(W.feeler, W.feeler, 0.1, 0.25, 0, 0.5);
const SH_FRINGE = sh(W.fringe0, W.fringe1, 0.25, 0.1, 0.1, 0.5);
const SH_CRACK = sh(W.crack, W.crack, 0, 0, 0, 0.5);
const SH_SPOT = sh(W.spot, W.spot, 0, 0, 0, 0.5);
const SH_EDGE = sh(W.edge, W.edge, 0, 0, 0, 0.5);
const SH_BELLY = sh(W.belly, W.bellyLow, 0.2, 0.1, 0.1, 0.5);

/**
 * The brow plate, set per creature: how far the front of the outline is pushed out and down
 * (negative = lifted), px. `rimPt` gives a point of the outline at screen angle `a` (0 = screen
 * right, pi = left) in `sX, sY`.
 */
let gOut = 0;
let gDown = 0;
/** Curled: the lower sides of the outline are drawn in under it (a ball, not a dome on a rim). */
let gPinch = 0;
function pinch(sn: number): number {
  const u = 1 - sn;
  return 1 - gPinch * u * u;
}
/** Where on its top a down cut glanced (world px), set when it is drawn: the renderer throws the chips from here. */
export const topHit = { x: 0, y: 0 };
/** Where the horn's tip was drawn (world px). */
let hornX = 0;
let hornY = 0;
function rimPt(a: number, d: number, aEff: number, rimH: number): void {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const sd = d >= 0 ? 1 : -1;
  const wf = smoothstep(0.3, 0.95, c * sd) * sat(Math.abs(d) * 1.6);
  sX = aEff * Math.sign(c) * Math.abs(c) ** BURR.ex - d * BURR.shear * sn + sd * gOut * wf;
  sY = -rimH - BURR.dome * sn ** BURR.ey + gDown * wf * (1 - 0.8 * sn);
  sX *= pinch(sn);
}

let toneDark = 0;
let toneLight = 0;
/** Beside the hero everything is a step darker (her light lifts it): 1 = no change. */
let nearDim = 1;
/** How lit the eyes' halo is this creature (set per creature by `drawBurrback`). */
let eyeLit = 1;
function tone(out: V3, base: V3, k = 1): void {
  // A blow takes it toward one flat desaturated dusk (not toward black: that hid it on dark ground).
  const dk = toneDark * k;
  const li = toneLight * k;
  for (let i = 0; i < 3; i++) {
    const b0 = base[i]! * nearDim;
    const b = b0 + (C.struck[i]! - b0) * dk;
    out[i] = b + (C.pop[i]! - b) * li;
  }
}

/** Cracks in flank coordinates (u, v pairs); the first two show at 2 hp, all of them at 1. */
const CRACKS: readonly (readonly number[])[] = [
  [0.02, 0.99, 0.1, 0.76, -0.02, 0.58, 0.09, 0.4, 0.03, 0.27],
  [0.1, 0.76, 0.24, 0.68, 0.3, 0.56],
  [-0.5, 0.82, -0.42, 0.6, -0.56, 0.44, -0.47, 0.24],
  [0.6, 0.7, 0.52, 0.5, 0.63, 0.33],
];

/** Where the six feet and knees ended up this frame (world px), for dust and debug. */
export const feet = { x: new Float32Array(6), y: new Float32Array(6), down: new Uint8Array(6) };

/**
 * Head, feelers and face. Drawn twice: under the shell (with the feelers), so a turn carries it
 * behind the dome, and again over the shell's brow as the face plate once it has come round.
 */
function drawHead(
  p: Painter,
  rig: BurrRig,
  rimH: number,
  rot: number,
  dead: boolean,
  curl: number,
  front: boolean,
): void {
  const B = BURR;
  const dH = rig.dHead;
  const H = B.head;
  const tuck = sat(rig.tuck.x);
  const aH = Math.abs(dH);
  const reach = rig.reach.x;
  const calm = rig.calmK;
  // Curled, the head goes right in under the shell; the look up at her lifts it.
  const ball = rig.curlK;
  const gl = rig.glance;
  const sk = rig.scurryK;
  const headLx =
    dH * (H.x - H.tuck * tuck + H.reach * reach - B.curl.headIn * ball - B.scurry.headIn * sk + 1.5 * gl);
  const headLy =
    -(H.y - (B.rim - rimH) * 0.55) - tuck * 1.2 + reach * 1.8 + calm * 0.9 + 4.5 * rig.spentK - 2.5 * gl;
  const hcx = bx(headLx, headLy);
  const hcy = by(headLx, headLy);
  if (aH > 0.12) {
    if (!front) {
      // Feelers: tap the ground ahead in turn as it walks; idle slowly at rest; back in a flinch.
      const F = B.feeler;
      const rootLx = headLx + dH * H.len * 0.62;
      const rootLy = headLy - H.high * 0.55;
      const rootH = -rootLy;
      const ground = Math.asin(sat(rootH / F.len));
      for (let i = 0; i < 2; i++) {
        const spring = i === 0 ? rig.feel0 : rig.feel1;
        const ang = spring.x;
        const len = F.len * (i === 0 ? 1 : 0.92) * (0.35 + 0.65 * aH);
        const tipLx = rootLx + dH * Math.cos(ang) * len - rig.lag.x * 0.6;
        const tipLy = Math.min(-0.3, rootLy + Math.sin(ang) * len);
        // A bowed stalk: the control point sits above the chord.
        const mxl = (rootLx + tipLx) / 2 + dH * 1.5;
        const myl = (rootLy + tipLy) / 2 - 3.6 - (ground - ang) * 2;
        for (let k = 0; k < 6; k++) {
          const u = k / 5;
          const a0 = (1 - u) * (1 - u);
          const a1 = 2 * u * (1 - u);
          const a2 = u * u;
          const lx = a0 * rootLx + a1 * mxl + a2 * tipLx;
          const ly = a0 * rootLy + a1 * myl + a2 * tipLy;
          p.px[k] = bx(lx, ly);
          p.py[k] = by(lx, ly);
          p.pw[k] = F.w * (1 - 0.55 * u) * (i === 0 ? 1 : 0.85);
        }
        p.ribbon(6, SH_FEEL, false, true);
      }
    }
    SH_HEAD.alpha = 1;
    p.ellipse(
      hcx,
      hcy,
      H.len * (0.45 + 0.55 * aH),
      H.high,
      rot +
        dH *
          (0.3 +
            0.35 * rig.lookY * Math.max(rig.wary, rig.peerK, rig.scurryK) +
            0.22 * reach -
            B.scurry.tilt * gl),
      SH_HEAD,
      14,
    );
    // The face: two small dim glints on the plate that slide toward what it watches (ahead as it
    // walks, at her when it is wary). Wider in a flinch, shut when it dies.
    // Calmed, the lids come most of the way down: two warm slits.
    const open =
      (dead ? 1 - curl : 1) * (1 - 0.92 * rig.blink) * (1 - B.calm.lids * calm * (1 - 0.5 * rig.walkK));
    if (open > 0.05) {
      const wide = 1 + 0.22 * sat(Math.max(rig.wary, 0.6 * rig.peerK, rig.noticeK));
      const show = sat(aH * 1.6 - 0.3);
      for (let i = 0; i < 2; i++) {
        const k = i === 0 ? 1 : 0.8;
        const elx = headLx + dH * H.len * (i === 0 ? 0.16 : 0.66);
        const ely = headLy - H.high * (i === 0 ? 0.1 : 0.2);
        // Blank pale eyes: the look is the eyes sliding on the plate, never a pupil (that read as a toy).
        // (Hurrying from under her, they roll right up to the top of the plate to watch her come down.)
        const ex = bx(elx, ely) + rig.lookX * 1.1 - Math.sign(dH) * 0.4;
        const ey = by(elx, ely) + rig.lookY * (1.1 + B.scurry.eyeUp * Math.max(sk, gl));
        const rx = H.eye * k * (0.6 + 0.4 * aH);
        const ry = H.eye * 1.1 * k * wide * open;
        SH_EYE.alpha = show;
        p.ellipse(ex, ey, rx, ry, rot, SH_EYE, 12);
        // A faint warm halo, so the two lights carry at play zoom (once, on the face over the brow).
        if (front) {
          const hr = H.eye * H.eyeHalo * k;
          p.glow(
            ex,
            ey,
            hr,
            C.eyeGlow as unknown as RGB,
            H.eyeGlow * show * (0.35 + 0.65 * open) * eyeLit,
            hr,
            0,
            10,
          );
        }
      }
    }
  }
}

/** Draws one burrback. Returns the alpha it was drawn with (0 = nothing). */
export function drawBurrback(
  p: Painter,
  /** The painter in front of the grass fringe: it gets the legs below the shell's rim. */
  pf: Painter,
  rig: BurrRig,
  e: EnemyState,
  clock: number,
  zw: readonly number[],
  /** 0..1: how close the hero's light is. */
  nearK: number,
): number {
  const B = BURR;
  const d = rig.d;
  const ad = Math.abs(d);
  const sd = Math.sqrt(Math.max(0, 1 - d * d));
  const dH = rig.dHead;
  const dead = e.mode === 'dead';
  const t = rig.mf;
  const seed = rig.seed;
  const ph = seed * 40;

  // --- Death timeline: flipped onto its back along the blow, legs curl, then it bursts (the renderer throws the plates).
  let roll = 0;
  let hop = 0;
  let curl = 0;
  let swell = 0;
  let deadK = 0;
  const dir = e.hitDir !== 0 ? e.hitDir : -e.facing;
  if (dead) {
    const D = B.death;
    if (t >= D.burst) return 0;
    const r = sat(t / D.roll);
    roll = dir * Math.PI * (1 - (1 - r) * (1 - r));
    hop = D.hop * Math.sin(Math.PI * r);
    curl = smoothstep(D.curl[0], D.curl[1], t);
    swell = smoothstep(D.burst - 3, D.burst, t);
    deadK = sat(t / 2);
  }

  // --- Tone of a hit: darker through the hold, then a lighter pop that fades. Never white.
  const age = rig.hitAge;
  // The killing blow snaps harder; right beside the hero everything is a step darker (her light lifts it).
  // (Dark for as long as the blow holds it, the pop as it is let go and thrown.)
  const rel = rig.rel;
  // The first frame or two of the hold are the flash: the outline goes pale, the fill has not darkened yet.
  const hitFlash = age < 20 ? 1 - smoothstep(B.hit.flash - 0.6, B.hit.flash + 0.6, age) : 0;
  const holdLine = rig.held ? Math.max(hitFlash, B.hit.holdLine) : hitFlash;
  toneDark = B.hit.dark * (rig.held ? 1 : 1 - smoothstep(0.2, 1.6, rel)) * (1 - 0.7 * hitFlash);
  toneLight = B.hit.pop * (dead ? 1.5 : 1) * smoothstep(0.2, 1.4, rel) * (1 - smoothstep(2, 4.2, rel));
  toneLight = Math.max(toneLight, 0.5 * swell);
  nearDim = 1 - nearK * B.nearHero.dark * (1 - toneLight);
  tone(W.shellTop, C.shellTop);
  tone(W.shellLow, C.shellLow);
  tone(W.sheen, C.sheen);
  tone(W.seam, C.seam, 0.6);
  tone(W.head, C.head);
  tone(W.headLow, C.headLow);
  tone(W.eye, C.eye, 0.3);
  // Braced, the eyes take the colour of its lights: a glare under the plate.
  for (let k = 0; k < 3; k++) W.eye[k] = W.eye[k]! + (C.ramLight[k]! - W.eye[k]!) * 0.7 * rig.braceK;
  // Calmed, the eyes take the lantern's warmth; right after a blow they are not lit.
  for (let k = 0; k < 3; k++) W.eye[k] = W.eye[k]! + (C.calmLight[k]! - W.eye[k]!) * 0.45 * rig.calmK;
  eyeLit = 1 - sat(toneDark * 1.2);
  tone(W.feeler, C.feeler);
  tone(W.fringe0, C.fringeTop);
  tone(W.fringe1, C.fringeTip);

  // --- Body frame.
  const g = B.gait;
  const walkK = rig.walkK * (1 - rig.hurtK) * (1 - deadK);
  const crouch = rig.crouch.x;
  const calm = rig.calmK;
  const breathS = Math.sin(rig.breath + ph);
  const R = B.ram;
  const spentK = rig.spentK * (1 - deadK);
  const braceK = rig.braceK * (1 - deadK);
  const ramK = rig.ramK * (1 - deadK);
  const breath =
    breathS * (0.022 + (B.calm.breath - 0.022) * calm + R.pantDepth * spentK) * sat(crouch) * (1 - deadK);
  // Curled: shorter and rounder, the dome its whole shape. A down cut glancing off the top: a pound.
  const Cu = B.curl;
  const K = B.clang;
  const ball = rig.curlK * (1 - deadK);
  const ringTop = rig.ringTop * (1 - deadK);
  const ringW = Math.sin(rig.ringTopT * 6.283 * K.hz);
  const rimH = Math.max(2.2, B.rim - B.settle * crouch + bobAt(rig.dist, g) * g.bob * walkK);
  const sq = rig.squash.x;
  // Calmed where it lies, the dome itself sags and spreads: a flatter shape, not only a lower one.
  const flat = calm * sat(crouch) * (1 - deadK);
  const sx = (1 + sq - breath * 0.4 + 0.12 * swell) * (1 + B.calm.spread * flat) * (1 - Cu.short * ball);
  const sy =
    (1 - sq * 0.85 + breath + 0.1 * swell) *
    (1 - B.calm.flat * flat) *
    // Braced, the wedge stands taller (stretched up off the ground; the pitch puts the height at the rear).
    (1 + R.tall * braceK * (1 - ramK)) *
    (1 + Cu.tall * ball) *
    (1 - K.pound * ringTop * Math.max(0, ringW));
  // Made whole again: 0..1 through coming round; the shake sits in the middle of it.
  const wakeU = rig.wakeT < R.wake ? rig.wakeT / R.wake : 1;
  const wakeShake = smoothstep(0.25, 0.4, wakeU) * (1 - smoothstep(0.55, 0.95, wakeU));
  const rot =
    rig.rock.x +
    rockAt(rig.dist, g) * g.rock * walkK * d +
    roll +
    e.teeter * rig.teeterK * (0.13 + 0.03 * Math.sin(clock * 14 + ph)) +
    // A cut rings off the shell; made whole again, it shakes itself.
    rig.ring * R.shakeRot * Math.sin(rig.ringT * 6.283 * R.shakeHz * 0.8 + 1) +
    ringTop * K.rot * Math.sin(rig.ringTopT * 6.283 * K.hz * 0.7 + 2) +
    wakeShake * R.wakeRock * Math.sin(rig.wakeT * 31);
  const pivot = -(rimH + B.dome) / 2;
  const sgn0 = d >= 0 ? 1 : -1;
  // The squash is taken on the side away from the blow, so it shunts along it.
  const shunt = -sq * B.halfLen * 0.55 * rig.sqDir;
  const ox =
    rig.x +
    shunt +
    rig.back.x * (1 - deadK) +
    rig.ring * R.shake * Math.sin(rig.ringT * 6.283 * R.shakeHz) +
    // Braced: it trembles harder as the count runs out.
    braceK * (1 - ramK) * R.tremble * rig.windU * Math.sin(clock * 74 + ph) +
    // Held in a blow: a fine shudder.
    (rig.held ? 1.3 * Math.sin(clock * 118 + ph) : 0);
  // Rolled back on its haunches: the turn is about the middle of its height, so lift it until the
  // rear of the rim rests on the ground instead of sinking through it.
  const tipA = Math.abs(Math.sin(rig.rock.x));
  const sitUp =
    spentK *
    Math.max(0, tipA * lerp(B.halfWide, B.halfLen, ad) * 0.92 - (1 - Math.cos(rig.rock.x)) * -pivot - rimH);
  // (The top rings: a fast small up-and-down that dies away.)
  const oy = rig.y - hop - sitUp + ringTop * K.bounce * ringW;
  setBody(ox - sgn0 * sitUp * 0.35, oy, sx, sy, rot, pivot);
  // The brow plate: out and down as far as the ground lets it (the pitch has dropped the front already).
  const guard = rig.guard.x * (1 - deadK);
  const aEff = lerp(B.halfWide, B.halfLen, ad);
  const sgn = d >= 0 ? 1 : -1;
  gOut = guard > 0 ? R.out * guard : 0;
  gPinch = Cu.pinch * ball;
  gDown =
    guard > 0
      ? Math.min(R.down * guard, Math.max(0, rimH - 1 - (aEff + gOut) * Math.sin(Math.max(0, rot * sgn))))
      : 5 * guard;
  const alpha = 1;
  p.alphaK = alpha;
  p.glowK = alpha;

  // --- Contact shadow.
  p.soft(
    rig.x,
    rig.y + 1.5,
    (B.halfLen + 4) * (0.72 + 0.28 * ad),
    5.5,
    C.shadow as unknown as RGB,
    B.shadowAlpha * (1 - 0.5 * sat(hop / 12)),
  );

  // --- Legs: solve all six, draw the far side now and the near side after the head.
  const L = B.leg;
  const scr = clock * 43;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 6; i++) {
      const side = LEG_SIDE[i]!;
      const depth = side * d;
      // Far side first; mid-turn the two sides are apart, so the order does not matter there.
      if (pass === 0 ? depth > 0 : depth <= 0) continue;
      const row = LEG_ROW[i]!;
      const home = L.home[row]!;
      const hipLx = home * L.hipIn * d + side * sd * L.hipZ;
      const hipLy = -(rimH + 1.5);
      const hipX = bx(hipLx, hipLy);
      const hipY = by(hipLx, hipLy);
      // Planted walk.
      footAt(rig.dist, i, g);
      const stand = home * d + side * sd * L.footZ;
      let fx = rig.x + stand + d * foot.along * rig.walkK;
      let fy = rig.y - foot.lift * rig.walkK * (1 - B.scurry.low * rig.scurryK);
      let down = foot.down || rig.walkK < 0.5;
      // Braced: front feet set wide ahead, the rear ones scrape back in turn. Spent: splayed.
      if (braceK > 0.001) {
        const bk = braceK * (1 - ramK);
        if (row === 0) fx += d * 4 * bk;
        else if (row === 2) {
          const s = rig.scrapeP + (side > 0 ? 0.5 : 0);
          const u = s - Math.floor(s);
          const drag = u < 0.7 ? u / 0.7 : 1 - (u - 0.7) / 0.3;
          fx -= d * (R.scrape * drag - 2) * bk;
          if (u >= 0.7) fy -= 5 * Math.sin((Math.PI * (u - 0.7)) / 0.3) * bk;
        }
      }
      if (spentK > 0.001) {
        // Front legs off the ground, hanging and pawing slowly; stunned, all six are in the air.
        const st = rig.stunK * (1 - deadK);
        const up = row === 0 ? 1 : row === 1 ? 0.25 + 0.75 * st : st;
        const w = clock * (5 + 9 * st) + i * 1.7 + ph;
        const axp = hipX + sgn0 * (row === 0 ? 9 : row === 1 ? 4 : -6) + side * sd * 5 + 2.6 * Math.sin(w);
        const ayp = hipY + 9.5 + 2.4 * Math.sin(w * 0.8 + 1);
        fx += stand * 0.2 * spentK * (1 - up);
        fx += (axp - fx) * spentK * up;
        fy += (ayp - fy) * spentK * up;
        if (up > 0.5) down = false;
      }
      // Ramming: swept back and paddling too fast to follow.
      if (ramK > 0.001) {
        const w = clock * 52 + i * 2.1 + ph;
        const rxp = ox + stand * 1.15 - d * 7 + 7 * Math.sin(w);
        const ryp = rig.y - Math.max(0, Math.sin(w + 1.3)) * 6;
        fx += (rxp - fx) * ramK;
        fy += (ryp - fy) * ramK;
        down = false;
      }
      // Skidding: legs splayed wide, scrabbling for grip.
      if (rig.hurtK > 0.001) {
        const w = scr + i * 2.3 + ph;
        const sxp = ox + stand * 1.4 + (row === 1 ? side * 4 : 0) + 4 * Math.sin(w);
        const syp = rig.y - Math.max(0, Math.sin(w + 1.2)) * 5.5;
        fx += (sxp - fx) * rig.hurtK;
        fy += (syp - fy) * rig.hurtK;
        down = false;
      }
      // At the brink: the legs over the edge find nothing and paw the air.
      if (rig.teeterK > 0.001 && row !== 1 && home * d * e.teeter > 0) {
        const w = clock * 21 + i * 1.9;
        const txp = hipX + e.teeter * (11 + 5 * Math.sin(w));
        const typ = hipY + 13 + 6 * Math.sin(w * 0.83 + 1);
        fx += (txp - fx) * rig.teeterK;
        fy += (typ - fy) * rig.teeterK;
        down = false;
      }
      // Curled: folded in under the shell, the feet drawn close (shuffling if it is moved).
      if (ball > 0.001) {
        const fxp = rig.x + stand * Cu.fold + d * foot.along * rig.walkK * 0.3;
        const fyp = rig.y - foot.lift * rig.walkK * 0.25;
        fx += (fxp - fx) * ball;
        fy += (fyp - fy) * ball;
        if (ball > 0.5) down = true;
      }
      // On its back: the legs kick, then curl in over the belly.
      if (deadK > 0) {
        const w = clock * 30 + i * 2.1;
        const kick = (1 - curl) * 3.2;
        const lx = home * d * (1.12 - 0.66 * curl) + side * sd * L.footZ + kick * Math.sin(w);
        const ly = 7.5 - 6.5 * curl + kick * 0.7 * Math.cos(w * 0.8);
        const dx = bx(lx, ly);
        const dy = by(lx, ly);
        fx += (dx - fx) * deadK;
        fy += (dy - fy) * deadK;
        down = false;
      }
      feet.x[i] = fx;
      feet.y[i] = fy;
      feet.down[i] = down ? 1 : 0;
      const kneeDir = row === 0 ? 1 : row === 2 ? -1 : 0.45;
      const bend = -(kneeDir * d + side * sd);
      ik2(hipX, hipY, fx, fy, L.upper, L.lower, clamp(bend, -1, 1), 0.25);
      const kx = ikOut.x;
      const ky = ikOut.y;
      const ex = ikOut.ex;
      const ey = ikOut.ey;
      const near = 0.5 + 0.5 * depth;
      const c0 = W.leg0;
      const c1 = W.leg1;
      for (let k = 0; k < 3; k++) {
        const base = C.legFar[k]! + (C.legNear[k]! - C.legFar[k]!) * near;
        const b0 = base * nearDim;
        const dk = b0 + (C.struck[k]! * 0.8 - b0) * toneDark;
        const v = dk + (C.pop[k]! - dk) * toneLight;
        c0[k] = v;
        c1[k] = v * 0.86;
      }
      p.px[0] = hipX;
      p.py[0] = hipY;
      p.px[1] = (hipX + kx) / 2;
      p.py[1] = (hipY + ky) / 2;
      p.px[2] = kx;
      p.py[2] = ky;
      p.px[3] = (kx + ex) / 2;
      p.py[3] = (ky + ey) / 2;
      p.px[4] = ex;
      p.py[4] = ey;
      p.pw[0] = L.w[0];
      p.pw[1] = (L.w[0] + L.w[1]) / 2;
      p.pw[2] = L.w[1] * 1.08;
      p.pw[3] = (L.w[1] + L.w[2]) / 2;
      p.pw[4] = L.w[2];
      // The near legs carry a thin pale edge so they read against dark ground.
      SH_LEG.rim = 0.15 + 0.25 * near;
      SH_LEG.cool = 0.15 + 0.2 * near;
      p.ribbon(5, SH_LEG, true, true);
      // Again in front of the grass, from the rim line down: the same geometry, so no join shows.
      // (Not on a body on its back: its legs are in the air, over the shell.)
      if (deadK < 0.3) {
        const clipY = rig.y - rimH + 2;
        let n = 0;
        if (ky >= clipY) {
          if (hipY < clipY) {
            const u = (clipY - hipY) / (ky - hipY);
            pf.px[n] = hipX + (kx - hipX) * u;
            pf.py[n] = clipY;
            pf.pw[n++] = L.w[0] + (L.w[1] - L.w[0]) * u;
          } else {
            pf.px[n] = hipX;
            pf.py[n] = hipY;
            pf.pw[n++] = L.w[0];
          }
          pf.px[n] = kx;
          pf.py[n] = ky;
          pf.pw[n++] = L.w[1] * 1.08;
        } else if (ey > clipY) {
          const u = (clipY - ky) / (ey - ky);
          pf.px[n] = kx + (ex - kx) * u;
          pf.py[n] = clipY;
          pf.pw[n++] = L.w[1] + (L.w[2] - L.w[1]) * u;
        }
        if (n > 0) {
          const k0 = n - 1;
          pf.px[n] = (pf.px[k0]! + ex) / 2;
          pf.py[n] = (pf.py[k0]! + ey) / 2;
          pf.pw[n] = (pf.pw[k0]! + L.w[2]) / 2;
          n++;
          pf.px[n] = ex;
          pf.py[n] = ey;
          pf.pw[n++] = L.w[2];
          // The colour runs hip -> foot along the whole leg; this piece is the lower end of it.
          c0[0] = c0[0]! * 0.93;
          c0[1] = c0[1]! * 0.93;
          c0[2] = c0[2]! * 0.93;
          pf.ribbon(n, SH_LEG, false, true);
        }
      }
    }
    if (pass === 1) break;

    drawHead(p, rig, rimH, rot, dead, curl, false);
  }

  // --- Shell outline in local space: the dome over the top (from screen right to left), then the belly.
  for (let k = 0; k < NT; k++) {
    rimPt((Math.PI * k) / (NT - 1), d, aEff, rimH);
    LX[k] = sX;
    LY[k] = sY;
  }
  // A chip out of the front of the crown at 1 hp.
  if (e.hp <= 1 && ad > 0.5) {
    const kc = d > 0 ? 5 : NT - 1 - 5;
    const kn = d > 0 ? 6 : NT - 1 - 6;
    LX[kc] = LX[kc]! - Math.sign(d) * 3.2;
    LY[kc] = LY[kc]! + 3.6;
    LX[kn] = LX[kn]! - Math.sign(d) * 0.6;
    LY[kn] = LY[kn]! + 0.8;
  }
  const sag = 2.6;
  for (let j = 0; j < NB; j++) {
    const u = (j + 1) / (NB + 1);
    const wf = smoothstep(0.5, 1, sgn * (2 * u - 1)) * sat(ad * 1.6);
    LX[NT + j] = (-aEff + 2 * aEff * u + sgn * gOut * wf * 0.85) * (1 - gPinch);
    LY[NT + j] = -rimH + sag * Math.sin(Math.PI * u) + gDown * wf;
  }
  const ccx = -d * B.shear * 0.4;
  const ccy = -rimH - B.dome * 0.42;
  // The zone's light on the top edge: a thin tinted rim that lifts the dome off the dark ground.
  for (let k = 0; k < 3; k++)
    KEY[k] = C.edge[0]![k]! * zw[0]! + C.edge[1]![k]! * zw[1]! + C.edge[2]![k]! * zw[2]!;
  // Calmed, the rim takes the lantern's warmth: the one change that carries at any zoom.
  for (let k = 0; k < 3; k++) KEY[k] = KEY[k]! + (C.calmLight[k]! - KEY[k]!) * B.calm.rim * calm;
  p.keyColor = KEY as unknown as RGB;
  SH_SHELL.rim = B.rimKey * (1 - 0.35 * toneDark) * (1 + B.calm.rimUp * calm);
  SH_SHELL.cool = B.rimCool;
  SH_HORN.rim = SH_SHELL.rim;
  // Bone: the crown line and the tips of horn and burrs. A little of the lantern's warmth when
  // calmed; it takes the tone of a hit like the shell.
  const Cr = B.crest;
  for (let k = 0; k < 3; k++) {
    const c = C.crest[0]![k]! * zw[0]! + C.crest[1]![k]! * zw[1]! + C.crest[2]![k]! * zw[2]!;
    W.crest[k] = c + (C.calmLight[k]! - c) * 0.3 * calm;
  }
  tone(W.crest, W.crest, 0.8);
  for (let k = 0; k < 3; k++) W.hornTip[k] = W.shellTop[k]! + (W.crest[k]! - W.shellTop[k]!) * Cr.tip;

  // --- The count, behind the shell: a halo in the ram's colour that swells on each beat and reaches
  // further every time; one hard flash as the ram is let go.
  const beatN = Math.max(0, rig.beatN);
  const relFlash = rig.relT < 0.5 ? Math.exp(-R.flashFade * rig.relT) * (1 - deadK) : 0;
  const countK = braceK * rig.count * (1 - 0.55 * ramK);
  if (countK > 0.01) {
    const hr = (R.rimHalo + R.rimHaloGrow * beatN) * (0.62 + 0.38 * rig.count);
    p.glow(
      bx(ccx, ccy),
      by(ccx, ccy),
      hr * 1.25,
      C.ramLight as unknown as RGB,
      (R.rimGlow + R.rimGlowGrow * beatN) * countK,
      hr,
      rot,
      20,
    );
  }
  if (relFlash > 0.02)
    p.glow(
      bx(ccx, ccy),
      by(ccx, ccy),
      R.flashR * 1.3,
      C.rimPale as unknown as RGB,
      R.flashK * relFlash,
      R.flashR,
      rot,
      22,
    );

  // --- Signature outline, drawn under the shell so the bases are hidden: a short upturned horn on
  // the brow, a row of blunt burrs along the ridge, a raised lip at the tail.
  const dd = clamp(d * 2.5, -1, 1);
  const bristle = clamp(rig.bristle.x, -0.3, 1.5);
  for (let i = 0; i < SPIKES.length; i++) {
    const sp = SPIKES[i]!;
    const a = Math.PI * sp[0]!;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const wfh = smoothstep(0.3, 0.95, c) * sat(ad * 1.6);
    const rx0 =
      (dd * aEff * Math.sign(c) * Math.abs(c) ** B.ex - d * B.shear * sn + sgn * gOut * wfh) * pinch(sn);
    const ry0 = -rimH - B.dome * sn ** B.ey + gDown * wfh * (1 - 0.8 * sn);
    let nx = rx0 - ccx;
    let ny = ry0 - ccy;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    // Bristling they stand longer and straighter; calmed they lie a little flatter.
    // Braced, the horn levels at her and the burrs lie back along the shell.
    const g1 = sat(guard);
    const flat = i === 0 || i === 4 ? 0 : rig.flatK * R.flat * (1 - deadK);
    const len =
      sp[1]! *
      (1 + B.touch.bristle * bristle * (i === 0 ? 0.45 : 1) - B.calm.burrs * calm) *
      (i === 0 ? (1 + (R.horn - 1) * g1) * (1 - Cu.horn * ball) : 1 - 0.3 * flat);
    // Lean: along the body (+ = toward the head) and up.
    const out = 0.55 - 0.4 * flat;
    const tx =
      rx0 +
      nx * len * out +
      dd * (sp[2]! - (i === 0 ? -0.55 * g1 : 0.5 * calm + 0.8 * flat)) * len -
      (i === 0 ? 0 : rig.lag.x * 0.25);
    const ty =
      ry0 +
      ny * len * out -
      sp[3]! * len * (i === 0 ? 1 - 1.15 * g1 : 1 - 0.7 * flat) +
      (i === 0 ? len * ball : 0);
    const b0x = rx0 - nx * 2.2;
    const b0y = ry0 - ny * 2.2;
    p.px[0] = bx(b0x, b0y);
    p.py[0] = by(b0x, b0y);
    const mx = (b0x + tx) / 2 + dd * sp[4]! * len;
    const my = (b0y + ty) / 2 + Math.abs(sp[4]!) * len * 0.5;
    p.px[1] = bx(mx, my);
    p.py[1] = by(mx, my);
    p.px[2] = bx(tx, ty);
    p.py[2] = by(tx, ty);
    p.pw[0] = sp[5]!;
    p.pw[1] = sp[5]! * 0.8;
    p.pw[2] = sp[5]! * 0.5;
    p.ribbon(3, SH_HORN, false, true);
    if (i === 0) {
      hornX = p.px[2]!;
      hornY = p.py[2]!;
    }
  }
  for (let k = 0; k < N_OUT; k++) {
    p.px[k] = bx(LX[k]!, LY[k]!);
    p.py[k] = by(LX[k]!, LY[k]!);
  }
  const top = -rimH - B.dome;
  p.shape(
    N_OUT,
    bx(ccx, ccy),
    by(ccx, ccy),
    SH_SHELL,
    bx(ccx, top + 5),
    by(ccx, top + 5),
    bx(ccx, -rimH + 1),
    by(ccx, -rimH + 1),
  );

  // --- The crown line: one pale stroke just inside the top of the outline, brow to tail.
  SH_CREST.alpha = Cr.alpha * (1 - 0.5 * toneDark);
  // A down cut glanced off the top: the line goes pale and a swelling runs out both ways from where it struck.
  const rt2 = ringTop * ringTop;
  if (ringTop > 0.01)
    for (let k = 0; k < 3; k++) W.crest[k] = W.crest[k]! + (C.rimPale[k]! - W.crest[k]!) * K.pale * rt2;
  const hitAtX = rig.x + rig.topU * aEff;
  let bestD = 1e9;
  for (let k = 0; k < 16; k++) {
    const u = k / 15;
    const a = Math.PI * (0.07 + 0.87 * u);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const lx = (aEff * Math.sign(c) * Math.abs(c) ** B.ex - d * B.shear * sn) * pinch(sn);
    const ly = -rimH - B.dome * sn ** B.ey;
    const ix = ccx - lx;
    const iy = ccy - ly;
    const il = Math.hypot(ix, iy) || 1;
    p.px[k] = bx(lx + (ix / il) * Cr.inset, ly + (iy / il) * Cr.inset);
    p.py[k] = by(lx + (ix / il) * Cr.inset, ly + (iy / il) * Cr.inset);
    // (A cut that rings off the shell runs along it as a swelling of the line, brow to tail.)
    let wv = rig.ring > 0 ? Math.exp(-(((u - rig.ringT * 5.5) / 0.16) ** 2)) * R.ringLine : 0;
    if (ringTop > 0.01) {
      const away = Math.abs(c - rig.topU) * 0.5;
      wv += Math.exp(-(((away - rig.ringTopT * K.run) / 0.13) ** 2)) * K.line * ringTop + K.lineAll * rt2;
      const dx = Math.abs(p.px[k]! - hitAtX);
      if (dx < bestD) {
        bestD = dx;
        topHit.x = p.px[k]!;
        topHit.y = p.py[k]!;
      }
    }
    p.pw[k] = Cr.w * (1 + (Cr.wLeft - 1) * zw[0]!) * Math.sin(Math.PI * u) ** 0.45 * (1 + wv);
  }
  if (bestD > 1e8) {
    topHit.x = bx(ccx, top);
    topHit.y = by(ccx, top);
  }
  p.ribbon(16, SH_CREST, false, false);
  // The struck spot itself: one small pale bloom on the crown, gone in a few frames.
  if (rt2 > 0.02)
    p.glow(topHit.x, topHit.y, K.glowR, C.spark as unknown as RGB, K.glow * rt2, K.glowR * 0.8, rot, 12);

  // --- The count, on the shell: its whole rim lit in the ram's colour, wider on every beat (the
  // read at play zoom: the silhouette itself flashes, five times, quickening), white-hot on release.
  // A blow: for a frame or two the same line is the pale outline of the struck shape.
  const rimK = Math.max(braceK * (0.25 + 0.75 * rig.count) * (1 - 0.35 * ramK), relFlash);
  const lineK = Math.max(rimK, holdLine);
  if (lineK > 0.02) {
    const hot = Math.max(rig.count ** 3 * 0.5 * braceK * (1 - ramK), relFlash);
    const hitK = holdLine >= rimK ? 1 : 0;
    for (let k = 0; k < 3; k++) {
      const c = C.ramLight[k]! + (C.rimPale[k]! - C.ramLight[k]!) * hot;
      W.edge[k] = c + (C.hitFlash[k]! - c) * hitK;
    }
    SH_EDGE.alpha = sat(lineK * 1.15);
    const wBase = hitK
      ? B.hit.flashW * (0.55 + 0.45 * hitFlash)
      : (R.rimW + R.rimGrow * beatN) *
          (0.3 + 0.7 * rig.count) *
          (1 - 0.5 * ramK) *
          (1 + (R.rimLeft - 1) * zw[0]!) +
        2.2 * relFlash;
    for (let k = 0; k < NT; k++) {
      const ix = LX[k]! - ccx;
      const iy = LY[k]! - ccy;
      const il = Math.hypot(ix, iy) || 1;
      const lx = LX[k]! + (ix / il) * 0.4;
      const ly = LY[k]! + (iy / il) * 0.4;
      p.px[k] = bx(lx, ly);
      p.py[k] = by(lx, ly);
      // Thinner where it meets the ground at either end.
      p.pw[k] = wBase * (0.45 + 0.55 * Math.sin((Math.PI * k) / (NT - 1)) ** 0.5);
    }
    p.ribbon(NT, SH_EDGE, true, true);
  }

  // --- The plate's edge: a bone line down the armoured front, lit on each beat of the count.
  const g1 = sat(guard) * smoothstep(0.45, 0.8, ad);
  if (g1 > 0.02) {
    const lit = sat(0.72 + 0.28 * rig.count + rig.ring);
    for (let k = 0; k < 3; k++) {
      const hot = W.crest[k]! + (C.ramLight[k]! - W.crest[k]!) * 0.3 * rig.count;
      W.edge[k] = hot + (1 - hot) * 0.6 * rig.ring;
    }
    SH_EDGE.alpha = R.edge * g1 * lit;
    for (let k = 0; k < 10; k++) {
      const u = k / 9;
      const af = Math.PI * (0.005 + 0.4 * u);
      rimPt(d >= 0 ? af : Math.PI - af, d, aEff, rimH);
      const ix = ccx - sX;
      const iy = ccy - sY;
      const il = Math.hypot(ix, iy) || 1;
      p.px[k] = bx(sX + (ix / il) * 1.6, sY + (iy / il) * 1.6);
      p.py[k] = by(sX + (ix / il) * 1.6, sY + (iy / il) * 1.6);
      p.pw[k] = R.edgeW * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.25))) * (1 + 0.5 * rig.ring);
    }
    p.ribbon(10, SH_EDGE, true, false);
    // The count again as a glint at the horn's tip: the one small light that says where it is going.
    const gl = rig.count * braceK * (1 - ramK * 0.5);
    if (gl > 0.02) {
      p.glow(
        hornX,
        hornY,
        R.glint * (0.5 + 0.5 * gl),
        C.ramLight as unknown as RGB,
        R.glintK * gl,
        R.glint * (0.5 + 0.5 * gl),
        0,
        10,
      );
      p.glow(hornX, hornY, 1.6, C.spark as unknown as RGB, 0.8 * gl, 1.6, 0, 8);
    }
    // A cut turned: the plate itself flashes where it took it.
    if (rig.ring > 0.03) {
      rimPt(d >= 0 ? 0.5 : Math.PI - 0.5, d, aEff, rimH);
      const fx = bx(sX - sgn * 5, sY + 3);
      const fy = by(sX - sgn * 5, sY + 3);
      p.glow(fx, fy, 15, C.spark as unknown as RGB, 0.5 * rig.ring * rig.ring * g1, 21, rot + sgn * 0.5, 14);
    }
  }

  const whole = 1;
  if (whole > 0.01) {
    // --- Plate seams: two dark lines over the dome, bulging with it.
    SH_SEAM.alpha = 0.85 * whole * smoothstep(0.15, 0.6, ad);
    // Spent, the plates stand open: the seams gape pale.
    // (A clang on the top: the plates ring, their seams catch the light for a moment.)
    const seamOpen = Math.max(spentK, K.seams * rt2);
    for (let k = 0; k < 3; k++)
      W.seam[k] = W.seam[k]! + (C.seamOpen[k]! * (1 - toneDark) - W.seam[k]!) * seamOpen;
    for (let s = 0; s < 2; s++) {
      const u = s === 0 ? 0.36 : -0.3;
      for (let k = 0; k < 7; k++) {
        const v = 0.03 + (k / 6) * (s === 0 ? 0.8 : 0.9);
        surface(u + (s === 0 ? 0.05 : -0.04) * v, v, d, rimH);
        p.px[k] = bx(sX, sY);
        p.py[k] = by(sX, sY);
        p.pw[k] = 0.55 + 0.75 * spentK * Math.sin(Math.PI * (0.15 + 0.85 * (k / 6)));
      }
      p.ribbon(7, SH_SEAM, false, false);
    }
    // --- Top plane: one crisp lighter band along the crown on the key-light side.
    SH_SHEEN.alpha = 0.9 * whole * (1 - toneDark);
    const a0 = Math.PI * 0.13;
    const a1 = Math.PI * 0.68;
    for (let k = 0; k < 14; k++) {
      const u = k / 13;
      const a = a0 + (a1 - a0) * u;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const lx = (aEff * Math.sign(c) * Math.abs(c) ** B.ex - d * B.shear * sn) * pinch(sn);
      const ly = -rimH - B.dome * sn ** B.ey;
      // Inset toward the middle of the shell.
      const ix = ccx - lx;
      const iy = ccy - ly;
      const il = Math.hypot(ix, iy) || 1;
      const inset = 4.2;
      p.px[k] = bx(lx + (ix / il) * inset, ly + (iy / il) * inset);
      p.py[k] = by(lx + (ix / il) * inset, ly + (iy / il) * inset);
      p.pw[k] = 1.5 * Math.sin(Math.PI * u) ** 1.3;
    }
    p.ribbon(14, SH_SHEEN, false, false);

    // --- Cracks: pale broken edges, one at 2 hp, the rest at 1.
    const flank = smoothstep(0.3, 0.75, ad);
    // (One more for each part of its life gone: none whole, all of them at its last point.)
    const nCr =
      e.hp >= e.hpMax
        ? 0
        : Math.ceil((1 - (e.hp - 1) / Math.max(1, e.hpMax - 1)) * (CRACKS.length - 1)) + (e.hp <= 1 ? 1 : 0);
    const wide = dead ? 2.4 + 2 * swell : 1;
    if (nCr > 0 && flank > 0.01) {
      W.crack[0] = C.crackEdge[0];
      W.crack[1] = C.crackEdge[1];
      W.crack[2] = C.crackEdge[2];
      SH_CRACK.alpha = whole * flank * (0.75 + 0.25 * sat(1 - age / 14));
      for (let c = 0; c < Math.min(nCr, CRACKS.length); c++) {
        const cr = CRACKS[c]!;
        const n = cr.length / 2;
        for (let k = 0; k < n; k++) {
          surface(cr[k * 2]!, cr[k * 2 + 1]!, d, rimH);
          p.px[k] = bx(sX, sY);
          p.py[k] = by(sX, sY);
          p.pw[k] = 0.55 * wide * (1 - 0.6 * (k / (n - 1)));
        }
        p.ribbon(n, SH_CRACK, false, false);
      }
    }

    // --- The row of lights on the flank: small, dim, slowly pulsing. Its only light.
    const S = B.spots;
    if (flank > 0.01) {
      const sc = W.spot;
      for (let k = 0; k < 3; k++)
        sc[k] = 0.82 * C.spot[0]![k]! * zw[0]! + C.spot[1]![k]! * zw[1]! + C.spot[2]![k]! * zw[2]!;
      // Calmed: one warm tone, all four breathing together with the body.
      for (let k = 0; k < 3; k++) sc[k] = sc[k]! + (C.calmLight[k]! - sc[k]!) * calm;
      // Braced: the colour of the ram.
      for (let k = 0; k < 3; k++) sc[k] = sc[k]! + (C.ramLight[k]! - sc[k]!) * 0.85 * braceK;
      const alert = e.mode === 'alert' ? sat(t / 3) * sat((e.timer + 4) / 6) : 0;
      // Its touch: they jump at once, then fall back through the flinch.
      const flash = rig.touching ? (B.touch.flash - 1) * (1 - smoothstep(1, 12, t)) : 0;
      const together = B.calm.dim * (1 - B.calm.pulse * (0.5 - 0.5 * breathS));
      // Walking: a pass runs down the row, front to back, in step with the ground it covers.
      const chaseK = rig.walkK * (1 - rig.hurtK);
      const wave = (rig.dist / S.walk) * Math.PI * 2;
      const seenK = rig.noticeK * (1 - calm);
      for (let i = 0; i < S.at.length; i++) {
        const sp = S.at[i]!;
        let br = 1 - S.pulse * (0.5 + 0.5 * Math.sin(clock * S.rate + ph - i * 0.9));
        const cw = 0.5 + 0.5 * Math.cos(wave - i * 1.35);
        br += (S.low + (S.high - S.low) * cw * cw * cw - br) * chaseK;
        br += (together - br) * calm;
        br *= 1 + (S.alert - 1) * alert * (1 - calm) + flash;
        // It has seen her: the whole row up, and a flash at the moment it did.
        br *= 1 + (B.notice.light - 1) * seenK + B.notice.flash * rig.flash * (1 - calm);
        br *= 1 - B.shy.dim * rig.shyK;
        // The count of the tell, all four as one; spent, nearly out; then back one by one, tail first.
        if (braceK > 0.001) br += (R.low + (R.peak - R.low) * rig.count - br) * braceK;
        if (spentK > 0.001) br += (R.dim * (0.75 + 0.25 * Math.sin(clock * 2.6 + i)) - br) * spentK;
        if (rig.cdK > 0) br *= 0.3 + 0.7 * sat((1 - rig.cdK) * 4.6 - (3 - i));
        if (wakeU < 1) br *= 0.12 + 0.88 * sat((wakeU - 0.4) * 8 - i);
        // Curled: the row goes out (the one slit at its front is all the light left).
        br *= 1 - (1 - Cu.lights) * ball;
        // Hurt badly: they flicker. Dying: they gutter out one after another.
        if (e.hp <= 1 && !dead) br *= 0.55 + 0.45 * (noise1(clock * 13 + i * 7.3, 3 + i) > -0.15 ? 1 : 0.25);
        if (dead) br *= t > 1 + i * 1.8 ? 0 : 1;
        if (toneDark > 0) br *= 1 - toneDark * 0.6;
        if (br <= 0.01) continue;
        surface(sp[0]!, sp[1]!, d, rimH);
        const wx = bx(sX, sY);
        const wy = by(sX, sY);
        const r = sp[2]!;
        SH_SPOT.alpha = S.core * flank * sat(br) * whole;
        // (A brighter light is a slightly larger one: the pass shows as size as well as value.)
        const rr = r * (0.82 + 0.18 * sat(br) + 0.22 * sat(br - 1));
        // Ramming, each light drags a streak.
        if (ramK > 0.05) {
          const len = R.streak * ramK;
          p.glow(
            wx - sgn * len * 0.5,
            wy,
            len * 0.5 + r,
            sc as unknown as RGB,
            0.42 * ramK * flank,
            r * 1.1,
            rot,
            10,
          );
        }
        p.ellipse(wx, wy, rr * (0.5 + 0.5 * ad), rr, rot, SH_SPOT, 10);
        p.glow(wx, wy, r * S.halo, sc as unknown as RGB, S.glow * br * flank * whole, r * S.halo, 0, 12);
      }
    }
  }

  // --- Fringe: short soft burr tufts along the rim, trailing what the shell does.
  const Fr = B.fringe;
  const fAlpha = 1;
  if (fAlpha > 0.01) {
    SH_FRINGE.alpha = fAlpha;
    const n = Fr.count;
    for (let i = 0; i < n; i++) {
      const u = -0.96 + (1.92 * i) / (n - 1);
      const h1 = hash1(i * 7 + 3);
      const h2 = hash1(i * 13 + 5);
      const rx = u * aEff * 0.97 + (h1 - 0.5) * 1.6;
      const ry = -rimH + sag * (1 - u * u) * 0.75 - 1.6;
      const len =
        Fr.len * (0.75 + 0.5 * h2) * (1 - 0.25 * Math.abs(u)) * (1 + 0.5 * bristle) * (1 - Cu.fringe * ball);
      const sway = Math.sin(clock * 1.7 + i * 1.3 + ph) * 0.35;
      const tx = rx + u * 2.6 * (1 + 1.6 * bristle) - rig.lag.x * (0.7 + 0.6 * h1) + sway;
      const ty = Math.min(-0.2, ry + len);
      const wv = Fr.w * (0.8 + 0.4 * h1);
      p.px[0] = bx(rx, ry - 1.2);
      p.py[0] = by(rx, ry - 1.2);
      p.px[1] = bx((rx + tx) / 2 + u * 0.5, (ry + ty) / 2);
      p.py[1] = by((rx + tx) / 2 + u * 0.5, (ry + ty) / 2);
      p.px[2] = bx(tx, ty);
      p.py[2] = by(tx, ty);
      p.pw[0] = wv;
      p.pw[1] = wv * 0.72;
      p.pw[2] = 0.12;
      p.ribbon(3, SH_FRINGE, true, false);
    }
  }
  // --- Spent: rolled back, it shows her its soft pale underside below the lifted rim, swelling with each breath.
  if (spentK > 0.02 && ad > 0.3) {
    for (let k = 0; k < 3; k++) {
      W.belly[k] = C.belly[k]! * (1 - toneDark);
      W.bellyLow[k] = C.bellyLow[k]! * (1 - toneDark);
    }
    SH_BELLY.alpha = sat(spentK * 1.5);
    // Broad and pale under the lifted front, turned to her: the wedge between the raised rim and
    // the ground, bulging with each breath.
    const bw = R.bellyLen * (0.5 + 0.5 * ad);
    const bh = (R.bellyHigh + 2 * breathS) * spentK;
    const x0 = -0.25 * aEff;
    const x1 = aEff * 0.9;
    const NBL = 8;
    for (let k = 0; k < NBL; k++) {
      const u = k / (NBL - 1);
      const lx = sgn * (x0 + (x1 - x0) * u) * (bw / R.bellyLen);
      p.px[k] = bx(lx, -rimH + 0.5);
      p.py[k] = by(lx, -rimH + 0.5);
      const v = 1 - u;
      const lx2 = sgn * (x0 + (x1 - x0) * v) * (bw / R.bellyLen);
      const ly2 = -rimH + 0.5 + bh * Math.sin(Math.PI * (0.06 + 0.94 * v)) ** 0.7;
      p.px[NBL + k] = bx(lx2, ly2);
      p.py[NBL + k] = by(lx2, ly2);
    }
    const mcx = sgn * (x0 + x1) * 0.5;
    p.shape(
      NBL * 2,
      bx(mcx, -rimH + bh * 0.4),
      by(mcx, -rimH + bh * 0.4),
      SH_BELLY,
      bx(mcx, -rimH),
      by(mcx, -rimH),
      bx(mcx, -rimH + bh),
      by(mcx, -rimH + bh),
    );
    // Soft creases across it (the plates of its underside).
    SH_SEAM.alpha = 0.32 * spentK;
    for (let c = 0; c < 3; c++) {
      const cu = 0.3 + 0.2 * c;
      const lx = sgn * (x0 + (x1 - x0) * cu) * (bw / R.bellyLen);
      const depth = bh * Math.sin(Math.PI * (0.06 + 0.94 * cu)) ** 0.7;
      for (let k = 0; k < 3; k++) {
        const v = k / 2;
        p.px[k] = bx(lx + sgn * 1.2 * Math.sin(Math.PI * v), -rimH + 1 + (depth - 1.5) * v);
        p.py[k] = by(lx + sgn * 1.2 * Math.sin(Math.PI * v), -rimH + 1 + (depth - 1.5) * v);
        p.pw[k] = 0.65;
      }
      p.ribbon(3, SH_SEAM, false, false);
    }
  }

  // --- Curled: one slit of light low at its front, where the eyes look out between the closed plates.
  if (ball > 0.02 && ad > 0.2) {
    rimPt(d >= 0 ? Cu.slitAt : Math.PI - Cu.slitAt, d, aEff, rimH);
    const ix = ccx - sX;
    const iy = ccy - sY;
    const il = Math.hypot(ix, iy) || 1;
    const lx = sX + (ix / il) * Cu.slitIn;
    const ly = sY + (iy / il) * Cu.slitIn;
    const wx = bx(lx, ly) + rig.lookX * 0.8;
    const wy = by(lx, ly);
    const sc = W.spot;
    for (let k = 0; k < 3; k++) {
      const z = C.spot[0]![k]! * zw[0]! + C.spot[1]![k]! * zw[1]! + C.spot[2]![k]! * zw[2]!;
      sc[k] = z + (C.eye[k]! - z) * Cu.slitPale;
    }
    // It breathes with the rock, and opens a little as the curl lets go.
    const open =
      sat((ball - 0.15) / 0.5) * (0.75 + 0.25 * Math.sin(rig.curlPh * 2 + seed * 4)) * (1 - toneDark);
    SH_SPOT.alpha = open;
    p.ellipse(wx, wy, Cu.slitW * (0.45 + 0.55 * ad), Cu.slitH * (1 + 1.5 * (1 - ball)), rot, SH_SPOT, 10);
    p.glow(wx, wy, Cu.slitGlowR, sc as unknown as RGB, Cu.slitGlow * open, Cu.slitGlowR * 0.6, rot, 10);
  }

  // --- The face plate over the brow (fades in as the head comes round; not on a body on its back).
  const faceK = smoothstep(0.4, 0.75, Math.abs(dH)) * (1 - deadK) * (1 - ball);
  if (faceK > 0.01) {
    p.alphaK = alpha * faceK;
    drawHead(p, rig, rimH, rot, dead, curl, true);
  }
  p.alphaK = 1;
  p.glowK = 1;
  // --- Winded: tiny pale motes circle over it (more, faster and wider when it is stunned).
  if (spentK > 0.05) {
    const st = rig.stunK;
    const n = st > 0.5 ? R.stunStars : R.stars;
    const cx0 = bx(ccx, top - 11);
    const cy0 = by(ccx, top - 11);
    const rr = R.starR * (1 + 0.3 * st);
    for (let i = 0; i < n; i++) {
      const a = clock * R.starRate * (1 + 0.5 * st) + (i * Math.PI * 2) / n + ph;
      const depth = Math.sin(a);
      const x = cx0 + Math.cos(a) * rr;
      const y = cy0 + depth * rr * 0.3 + Math.sin(a * 2 + i) * 1.2;
      const k = spentK * (0.55 + 0.45 * depth);
      p.glow(x, y, 5, C.star as unknown as RGB, 0.36 * k, 5, 0, 8);
      p.glow(x, y, 1.9, C.star as unknown as RGB, 1 * k, 1.9, 0, 8);
    }
  }
  return alpha;
}

/** Feeler targets (angle below the forward horizon, rad), stepped once per frame by the renderer. */
export function stepFeelers(rig: BurrRig, e: EnemyState, clock: number, dt: number): void {
  const B = BURR;
  const F = B.feeler;
  const ph = rig.seed * 40;
  const rootH =
    B.head.y + B.head.high * 0.55 - (B.rim - Math.max(2.2, B.rim - B.settle * rig.crouch.x)) * 0.55;
  const ground = Math.asin(sat(rootH / F.len));
  for (let i = 0; i < 2; i++) {
    const spring = i === 0 ? rig.feel0 : rig.feel1;
    let target: number;
    const shyNow = rig.turnAct === 'lantern' && rig.shyK > 0.6;
    if (rig.calmK > 0.5 && e.mode !== 'hurt' && e.mode !== 'dead') {
      // Calmed: laid down on the ground ahead, barely moving.
      target = ground + 0.04 + 0.05 * Math.sin(rig.breath + i * 2 + ph);
      spring.omega = 6;
      spring.step(target, dt);
      continue;
    }
    if (rig.curlK > 0.4 && e.mode !== 'dead') {
      // Curled: folded back in under the shell.
      spring.omega = 30;
      spring.step(-2.5 + i * 0.2, dt);
      continue;
    }
    if (rig.scurryK > 0.4) {
      // Hurrying: swept back low, streaming.
      spring.omega = 34;
      spring.step(-2 + i * 0.25 + 0.15 * Math.sin(clock * 19 + i * 2), dt);
      continue;
    }
    if (shyNow) {
      // Thrown back from the light.
      spring.omega = 34;
      spring.step(-1.7 + i * 0.25, dt);
      continue;
    }
    if (rig.noticeK > 0.5 && rig.peerK <= 0.5 && (e.mode === 'walk' || e.mode === 'pause')) {
      // It has seen her: both up and forward, testing the air with a quick quiver.
      target = -0.75 + i * 0.3 + 0.12 * Math.sin(clock * 11 + i * 2.4 + ph);
      spring.omega = 22;
      spring.step(target, dt);
      continue;
    }
    if (rig.peerK > 0.5 && e.mode !== 'alert' && e.mode !== 'hurt' && e.mode !== 'dead') {
      // Peering: stretched out low toward the edge, feeling the air in turn.
      target = ground - 0.2 + 0.16 * Math.sin(clock * 2.6 + i * Math.PI + ph);
      spring.omega = 10;
      spring.step(target, dt);
      continue;
    }
    if (e.mode === 'walk') {
      // One tap per footfall, the two feelers in turn.
      const s = Math.sin((rig.dist / B.gait.cycle) * Math.PI * 2 + i * Math.PI);
      target = ground + 0.12 - F.tap * (0.5 + 0.5 * s);
    } else if (e.mode === 'alert') target = -1.9 + i * 0.2;
    else if (e.mode === 'hurt') target = -1.2 + i * 0.3 + 0.4 * Math.sin(clock * 30 + i * 2);
    else if (e.mode === 'dead') target = 0.9;
    else if (e.turning) target = ground - 0.5 + 0.2 * Math.sin(clock * 9 + i * 2.2);
    else
      target =
        ground -
        0.3 +
        0.22 * noise1(clock * 0.9 + ph + i * 5, 5 + i) +
        0.1 * Math.sin(clock * 1.3 + i * 2 + ph);
    spring.omega = e.mode === 'alert' ? 34 : e.mode === 'walk' ? 30 : 12;
    spring.step(target, dt);
  }
}
