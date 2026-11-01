// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The hit itself, for every creature kind (canopy r22 "What makes a hit satisfying", memory/feel.md "Hit juice"):
 * driven only by sim events, so a kind added tomorrow gets it for free.
 *
 *  - `slashHit` on a creature (it carries `weight`; pods and flames do not):
 *    - **the cut**: a thin bright crescent across the body along the slash, 3 frames (4 and longer on the finisher);
 *    - **ichor** thrown along the blow (more for weight, the finisher, a kill), with gravity: drops land on the
 *      room's solids (ground.ts, read only) and leave splats that fade over a second or two; each has a little glow
 *      so it reads in the dark. Colour per family (`ichorFamily`): beetles amber, ants gold, spiders pale green-white,
 *      moths and dragonflies dust (light, they drift and leave only a smudge).
 *  - a kill (`slashHit.kill`, or an `enemyDie` no slash reported): **the burst**, a short bright flash and a fast ring
 *    at the body, and a bigger spray.
 *
 * Render time only (`dt`); every random number is a hash of the event's frame, position and index, so a capture
 * repeats. Two painters: `back` in the enemies layer (behind her: the flash and the cut never paint white on her),
 * `front` over the grass fringe (drops and splats, so a splat on a mossy top shows).
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { CameraView, RenderContext, SimView } from '../contract';
import { type Contact, sweepPoint } from './ground';
import { Painter, type RGB, rgb, type Shade } from './paint';

export type IchorFamily = 'amber' | 'ant' | 'spider' | 'dust';

/** Which ichor a kind bleeds. Kinds are matched by name, so kinds other builders add land in the right family. */
export function ichorFamily(kind: string): IchorFamily {
  const k = kind.toLowerCase();
  if (/carrier|ant/.test(k)) return 'ant';
  if (/spider|huntsman|dangler|weaver|web|mantis/.test(k)) return 'spider';
  if (/wing|moth|hawker|dragonfly/.test(k)) return 'dust';
  return 'amber';
}

interface FamilyLook {
  /** The drop's core, its glow, the splat it leaves. */
  core: number;
  glow: number;
  splat: number;
  /** Glow strength of a drop in flight (x its size), and of a fresh splat. */
  glowK: number;
  splatGlow: number;
  /** Gravity (px/s^2) and air drag (/s): dust brakes and sinks, ichor arcs. */
  g: number;
  drag: number;
  /** Seconds a splat lies before it is gone. */
  splatLife: readonly [number, number];
  /** Size x. */
  size: number;
}

export const HITFX = {
  family: {
    amber: {
      core: 0xf27a2c,
      glow: 0xff5a14,
      splat: 0x9a4418,
      glowK: 0.3,
      splatGlow: 0.3,
      g: 2600,
      drag: 1.8,
      splatLife: [1.3, 2.1],
      size: 1,
    },
    ant: {
      core: 0xf0a040,
      glow: 0xff8420,
      splat: 0x9a6a26,
      glowK: 0.28,
      splatGlow: 0.26,
      g: 2600,
      drag: 1.8,
      splatLife: [1.2, 1.9],
      size: 0.85,
    },
    spider: {
      core: 0xe4fbd8,
      glow: 0x9cf0b4,
      splat: 0xa8d8a4,
      glowK: 0.46,
      splatGlow: 0.32,
      g: 2600,
      drag: 1.8,
      splatLife: [1.3, 2.1],
      size: 1,
    },
    dust: {
      core: 0xe2d8ea,
      glow: 0xc6b8f0,
      splat: 0xb0a6bc,
      glowK: 0.3,
      splatGlow: 0.12,
      g: 520,
      drag: 3.2,
      splatLife: [0.6, 1],
      size: 0.8,
    },
  } as Record<IchorFamily, FamilyLook>,
  /**
   * (r22 first-timer: "ordinary hits are small orange sparks": more drops, a wider, longer cut, a stronger flash.)
   * Drops per blow by weight; + `finisher` on the finisher; a kill x `killK` + `kill`; a pogo x `pogoK`. */
  drops: { light: 8, medium: 10, heavy: 14, finisher: 4, killK: 1.3, kill: 5, pogoK: 0.7 },
  /** Drop speed (px/s, a kill x `killSpeed`), the fan's half-angle (rad), a lift added (px/s), radius (px). */
  speed: [300, 760] as const,
  killSpeed: 1.25,
  fan: 0.55,
  lift: 260,
  radius: [1.8, 3.6] as const,
  /** Longest a drop flies (s); the most drops and splats alive. */
  flight: 1.2,
  maxDrops: 180,
  maxSplats: 110,
  /**
   * The cut: a crescent `len` px (x weight) through the body along the slash, `width` px at its middle, bowed `bow` of
   * its length, `frames` render frames (the finisher: x `finLen`, x `finWidth`, `finFrames`), warm white, with a glow.
   */
  cut: {
    len: { light: 64, medium: 84, heavy: 150 },
    width: 5,
    bow: 0.14,
    frames: 4,
    finLen: 1.35,
    finWidth: 1.6,
    finFrames: 4,
    color: 0xfff3dc,
    glow: 0.5,
    /**
     * A warm light over the struck body for `flashFrames` (its rig goes near white too: BURR.hit.white): `flash` x
     * the cut's length is its radius, `flashK` its strength. Every kind gets it, rig or not.
     */
    flash: 0.5,
    flashK: 0.8,
    flashFrames: 5,
  },
  /** The kill: a flash `flash` px (x weight) for `flashS` s, a ring from 0.3 to `ring` x that over `ringS` s. */
  kill: {
    flash: { light: 44, medium: 64, heavy: 120 },
    flashS: 0.1,
    flashK: 1.1,
    ring: 1.25,
    ringS: 0.2,
    ringW: 6,
    ringK: 0.85,
    color: 0xfff0d6,
  },
} as const;

const WEIGHT_K = { light: 1, medium: 1.25, heavy: 2 } as const;
type Weight = keyof typeof WEIGHT_K;

/** A hash in [0, 1) of two integers (render-side: no Math.random, a capture repeats). */
export function hash01(a: number, b: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be59b) | 0, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

const FAMILIES: IchorFamily[] = ['amber', 'ant', 'spider', 'dust'];

interface Cut {
  x: number;
  y: number;
  ang: number;
  len: number;
  w: number;
  t: number;
  life: number;
}

interface Flash {
  x: number;
  y: number;
  r: number;
  t: number;
}

interface Burst {
  x: number;
  y: number;
  r: number;
  t: number;
  fam: number;
}

const SH: Shade & { alpha: number } = {
  c0: [0, 0, 0],
  c1: [0, 0, 0],
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.3,
  alpha: 1,
};

export class HitFx {
  readonly back = new Painter();
  readonly front = new Painter();
  /** CPU time of the last update, ms; drops and splats alive. */
  cpuMs = 0;
  drops = 0;
  splats = 0;
  // Drops in flight: struct of arrays, a ring buffer.
  private readonly dx = new Float32Array(HITFX.maxDrops);
  private readonly dy = new Float32Array(HITFX.maxDrops);
  private readonly dvx = new Float32Array(HITFX.maxDrops);
  private readonly dvy = new Float32Array(HITFX.maxDrops);
  private readonly dr = new Float32Array(HITFX.maxDrops);
  private readonly dt = new Float32Array(HITFX.maxDrops);
  private readonly df = new Uint8Array(HITFX.maxDrops);
  /** Each drop's own shade, 0 (the core) .. 1 (half way to the splat's dark): not one flat colour. */
  private readonly dk = new Float32Array(HITFX.maxDrops);
  private readonly dOn = new Uint8Array(HITFX.maxDrops);
  private dNext = 0;
  // Splats: where a drop landed, its size, its face (0 = a top, -1 / 1 = a wall facing that way), age and life.
  private readonly sx = new Float32Array(HITFX.maxSplats);
  private readonly sy = new Float32Array(HITFX.maxSplats);
  private readonly sr = new Float32Array(HITFX.maxSplats);
  private readonly sn = new Int8Array(HITFX.maxSplats);
  private readonly st = new Float32Array(HITFX.maxSplats);
  private readonly sl = new Float32Array(HITFX.maxSplats);
  private readonly sf = new Uint8Array(HITFX.maxSplats);
  private readonly sOn = new Uint8Array(HITFX.maxSplats);
  private sNext = 0;
  private readonly cuts: Cut[] = [];
  private readonly bursts: Burst[] = [];
  private readonly flashes: Flash[] = [];
  private readonly hit: Contact = { kind: 'none', x: 0, y: 0, nx: 0 };
  private readonly looks: Array<{ core: RGB; glow: RGB; splat: RGB; f: FamilyLook }>;
  private readonly cutC = rgb(HITFX.cut.color);
  private readonly killC = rgb(HITFX.kill.color);
  private readonly tmp: [number, number, number] = [0, 0, 0];
  private readonly tmp2: [number, number, number] = [0, 0, 0];

  constructor(
    private readonly ctx: RenderContext,
    layer: Container,
    frontLayer: Container,
  ) {
    this.looks = FAMILIES.map((f) => {
      const L = HITFX.family[f];
      return { core: rgb(L.core), glow: rgb(L.glow), splat: rgb(L.splat), f: L };
    });
    this.back.mesh.label = 'hitfx-back';
    this.front.mesh.label = 'hitfx-front';
    layer.addChild(this.back.mesh);
    frontLayer.addChild(this.front.mesh);
  }

  /** Reads the frame's events (the creature hits and kills). */
  private react(sim: SimView): void {
    const evs = sim.events;
    for (let k = 0; k < evs.length; k++) {
      const ev = evs[k] as SimEvent;
      if (ev.type === 'slashHit') {
        if (ev.weight === undefined) continue;
        this.blow(
          sim.frame,
          ev.x,
          ev.y,
          ev.dir,
          ev.facing,
          ev.step,
          ev.power,
          ev.weight,
          !!ev.kill,
          ev.pogo,
          ev.target.kind,
        );
      } else if (ev.type === 'enemyDie') {
        // A kill no slash reported (a bat-back, a throw): the burst and a spray on its own.
        let seen = false;
        for (let j = 0; j < evs.length; j++) {
          const o = evs[j] as SimEvent;
          if (o.type === 'slashHit' && o.kill && o.target.id === ev.id) seen = true;
        }
        if (!seen) {
          const dir = ev.slash ?? 'fwd';
          this.blow(
            sim.frame,
            ev.x,
            ev.y,
            dir,
            ev.dir || ev.facing || 1,
            1,
            ev.power,
            'medium',
            true,
            false,
            ev.kind,
            true,
          );
        }
      }
    }
  }

  /** One blow: the cut, the drops, the kill's burst. */
  private blow(
    frame: number,
    x: number,
    y: number,
    dir: string,
    facing: number,
    step: number,
    power: number,
    weight: Weight,
    kill: boolean,
    pogo: boolean,
    kind: string,
    noCut = false,
  ): void {
    const fin = power >= 2 || step >= 3;
    const fam = FAMILIES.indexOf(ichorFamily(kind));
    const seed = (frame * 7919 + Math.round(x) * 31 + Math.round(y) * 17) | 0;
    let n = 0;
    const r = (): number => hash01(seed, n++);
    const f = facing >= 0 ? 1 : -1;
    // The blow's direction (screen angle, y down).
    const base = f > 0 ? 0 : Math.PI;
    const blowAng = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : base - f * 0.3;
    if (!noCut) {
      const C = HITFX.cut;
      // Cut 1 falls, cut 2 rises, the finisher is a rising cleave; an up cut is near upright; a pogo lies across the top.
      const ang =
        dir === 'up'
          ? -Math.PI / 2 + f * 0.35
          : dir === 'down'
            ? f * 0.18
            : base + f * (step === 1 ? 0.5 : step === 2 ? -0.5 : -0.75);
      this.cuts.push({
        x,
        y,
        ang,
        len: C.len[weight] * (fin ? C.finLen : 1),
        w: C.width * (fin ? C.finWidth : 1),
        t: 0,
        life: (fin ? C.finFrames : C.frames) / 60,
      });
      if (this.cuts.length > 12) this.cuts.shift();
      this.flashes.push({ x, y, r: C.len[weight] * C.flash * (fin ? 1.2 : 1), t: 0 });
      if (this.flashes.length > 8) this.flashes.shift();
    }
    if (kill) {
      this.bursts.push({ x, y, r: HITFX.kill.flash[weight] * (fin ? 1.2 : 1), t: 0, fam });
      if (this.bursts.length > 8) this.bursts.shift();
    }
    // The drops.
    const D = HITFX.drops;
    let count = D[weight] + (fin ? D.finisher : 0);
    if (kill) count = count * D.killK + D.kill;
    if (pogo) count *= D.pogoK;
    count = Math.round(count);
    const L = this.looks[fam]!.f;
    const sk = (kill ? HITFX.killSpeed : 1) * (fin ? 1.1 : 1);
    const wk = WEIGHT_K[weight];
    for (let i = 0; i < count; i++) {
      let a: number;
      if (dir === 'down') {
        // A pogo splashes up off the top, both ways.
        const side = i % 2 === 0 ? -1 : 1;
        a = -Math.PI / 2 + side * (0.35 + r() * 0.85);
      } else a = blowAng + (r() * 2 - 1) * HITFX.fan * (kill ? 1.35 : 1);
      const sp =
        (HITFX.speed[0] + r() * (HITFX.speed[1] - HITFX.speed[0])) * sk * (dir === 'down' ? 0.75 : 1);
      const off = (10 + r() * 10) * wk;
      this.drop(
        x + Math.cos(a) * off + (r() - 0.5) * 8 * wk,
        y + Math.sin(a) * off + (r() - 0.5) * 8 * wk,
        Math.cos(a) * sp,
        Math.sin(a) * sp - HITFX.lift * r(),
        (HITFX.radius[0] + r() * (HITFX.radius[1] - HITFX.radius[0])) *
          L.size *
          (kill ? 1.1 : 1) *
          Math.sqrt(wk),
        fam,
        r(),
      );
    }
  }

  private drop(x: number, y: number, vx: number, vy: number, rad: number, fam: number, tone: number): void {
    const i = this.dNext;
    this.dNext = (i + 1) % HITFX.maxDrops;
    this.dx[i] = x;
    this.dy[i] = y;
    this.dvx[i] = vx;
    this.dvy[i] = vy;
    this.dr[i] = rad;
    this.dt[i] = 0;
    this.df[i] = fam;
    this.dk[i] = tone;
    this.dOn[i] = 1;
  }

  private splat(x: number, y: number, rad: number, face: number, fam: number, seed: number): void {
    const i = this.sNext;
    this.sNext = (i + 1) % HITFX.maxSplats;
    const L = this.looks[fam]!.f;
    this.sx[i] = x;
    this.sy[i] = y;
    this.sr[i] = rad;
    this.sn[i] = face;
    this.st[i] = 0;
    this.sl[i] = L.splatLife[0] + hash01(seed, 99) * (L.splatLife[1] - L.splatLife[0]);
    this.sf[i] = fam;
    this.sOn[i] = 1;
  }

  /** Clears everything in flight (a room change, `load()`). */
  clear(): void {
    this.dOn.fill(0);
    this.sOn.fill(0);
    this.cuts.length = 0;
    this.bursts.length = 0;
    this.flashes.length = 0;
  }

  update(dt: number, cam: CameraView, sim: SimView): void {
    const t0 = performance.now();
    for (const ev of sim.events) if (ev.type === 'spawn' || ev.type === 'roomEnter') this.clear();
    this.react(sim);
    const bk = this.back;
    const fr = this.front;
    bk.fw = fr.fw = Math.min(1.5, Math.max(0.06, 1 / Math.max(1e-3, cam.zoom * this.ctx.viewScale())));
    bk.begin();
    fr.begin();
    const scene = sim.scene;
    const halfW = cam.w / 2 / cam.zoom + 60;
    const halfH = cam.h / 2 / cam.zoom + 60;

    // --- The kill's burst: a flash, then a ring thrown out fast.
    const K = HITFX.kill;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.t += dt;
      if (b.t > Math.max(K.flashS, K.ringS)) {
        this.bursts.splice(i, 1);
        continue;
      }
      const look = this.looks[b.fam]!;
      const fu = b.t / K.flashS;
      if (fu < 1) {
        const k = (1 - fu) * (1 - fu);
        bk.glow(b.x, b.y, b.r * (0.8 + 0.4 * fu), this.killC, K.flashK * k, b.r * (0.8 + 0.4 * fu), 0, 24);
        bk.glow(b.x, b.y, b.r * 1.8, look.glow, 0.45 * k, b.r * 1.8, 0, 24);
      }
      const ru = b.t / K.ringS;
      if (ru < 1) {
        const e = 1 - (1 - ru) * (1 - ru) * (1 - ru);
        const c = this.tmp;
        for (let k = 0; k < 3; k++) c[k] = this.killC[k]! + (look.glow[k]! - this.killC[k]!) * ru;
        bk.ring(b.x, b.y, b.r * (0.3 + (K.ring - 0.3) * e), K.ringW * (1 - 0.8 * ru), c, K.ringK * (1 - ru));
      }
    }

    // --- The struck body lights up for a few frames (behind her: never on her).
    const CF = HITFX.cut;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      const u = f.t / (CF.flashFrames / 60);
      f.t += dt;
      if (u >= 1) {
        this.flashes.splice(i, 1);
        continue;
      }
      bk.glow(f.x, f.y, f.r, this.cutC, CF.flashK * (1 - u * u), f.r * 0.8, 0, 20);
    }

    // --- The cuts: a crescent through the body along the slash, thinning out over its few frames.
    const C = HITFX.cut;
    for (let i = this.cuts.length - 1; i >= 0; i--) {
      const c = this.cuts[i]!;
      const u = c.t / c.life;
      c.t += dt;
      if (u >= 1) {
        this.cuts.splice(i, 1);
        continue;
      }
      const k = 1 - u * u;
      const len = c.len * (0.9 + 0.25 * u);
      const w = c.w * (1 - 0.55 * u);
      const ca = Math.cos(c.ang);
      const sa = Math.sin(c.ang);
      const N = 11;
      const p = bk;
      for (let j = 0; j < N; j++) {
        const s = j / (N - 1);
        const along = (s - 0.5) * len;
        // Bowed: the middle stands off the line toward the cut's outside (a crescent, not a stick).
        const bow = -C.bow * len * (1 - (2 * s - 1) ** 2);
        p.px[j] = c.x + ca * along - sa * bow;
        p.py[j] = c.y + sa * along + ca * bow;
        const taper = Math.sin(Math.PI * s) ** 0.8;
        p.pw[j] = w * taper + 0.2;
        p.pc[j * 3] = k * (0.5 + 0.5 * taper);
      }
      p.streak(N, this.cutC);
      for (let j = 0; j < N; j++) {
        p.pw[j] = p.pw[j]! * 4 + 2;
        p.pc[j * 3] = p.pc[j * 3]! * C.glow;
      }
      p.streak(N, this.cutC);
    }

    // --- The drops: thrown, they arc and fall; where they meet the room they splat.
    let alive = 0;
    const hit = this.hit;
    for (let i = 0; i < HITFX.maxDrops; i++) {
      if (!this.dOn[i]) continue;
      const fam = this.df[i]!;
      const look = this.looks[fam]!;
      const L = look.f;
      const t = this.dt[i]! + dt;
      this.dt[i] = t;
      const x0 = this.dx[i]!;
      const y0 = this.dy[i]!;
      const drag = Math.min(1, L.drag * dt);
      const vx = this.dvx[i]! * (1 - drag);
      const vy = this.dvy[i]! * (1 - drag) + L.g * dt;
      const x1 = x0 + vx * dt;
      const y1 = y0 + vy * dt;
      const rad = this.dr[i]!;
      if (t > HITFX.flight || y1 > scene.height + 40) {
        this.dOn[i] = 0;
        continue;
      }
      sweepPoint(scene, x0, y0, x1, y1, hit);
      if (hit.kind !== 'none') {
        this.dOn[i] = 0;
        if (hit.kind !== 'ceiling')
          this.splat(
            hit.x,
            hit.y,
            rad,
            hit.kind === 'wall' ? hit.nx : 0,
            fam,
            (i * 131 + Math.round(x1)) | 0,
          );
        continue;
      }
      this.dx[i] = x1;
      this.dy[i] = y1;
      this.dvx[i] = vx;
      this.dvy[i] = vy;
      alive++;
      if (Math.abs(x1 - cam.x) > halfW || Math.abs(y1 - cam.y) > halfH) continue;
      // Drawn stretched along its flight, with a little light round it.
      const sp = Math.hypot(vx, vy);
      const ang = Math.atan2(vy, vx);
      const stretch = Math.min(1.7, 1 + sp * 0.0016);
      const fade = Math.min(1, (HITFX.flight - t) / 0.2);
      const dc = this.tmp;
      const shade = this.dk[i]! * 0.55;
      for (let k = 0; k < 3; k++) dc[k] = look.core[k]! + (look.splat[k]! - look.core[k]!) * shade;
      SH.c0 = dc;
      SH.c1 = look.splat;
      SH.alpha = 0.95 * fade;
      fr.ellipse(x1, y1, rad * stretch, rad * 0.8, ang, SH, 10);
      fr.glow(x1, y1, rad * 3.4 * stretch, look.glow, L.glowK * fade, rad * 3.4, ang, 12);
    }
    this.drops = alive;

    // --- The splats: flat on a top (or up a wall), dulling and fading.
    let ns = 0;
    for (let i = 0; i < HITFX.maxSplats; i++) {
      if (!this.sOn[i]) continue;
      const t = this.st[i]! + dt;
      const life = this.sl[i]!;
      if (t >= life) {
        this.sOn[i] = 0;
        continue;
      }
      this.st[i] = t;
      ns++;
      const x = this.sx[i]!;
      const y = this.sy[i]!;
      if (Math.abs(x - cam.x) > halfW || Math.abs(y - cam.y) > halfH) continue;
      const look = this.looks[this.sf[i]!]!;
      const L = look.f;
      const rad = this.sr[i]!;
      const u = t / life;
      // It spreads on the first few frames, then lies.
      const spread = 0.55 + 0.45 * Math.min(1, t / 0.06);
      const a = (1 - u * u) * 0.9;
      const c = this.tmp2;
      // Fresh it is its own bright colour; it dulls toward the splat tone.
      const dull = Math.min(1, t / 0.35);
      for (let k = 0; k < 3; k++) c[k] = look.core[k]! + (look.splat[k]! - look.core[k]!) * dull;
      SH.c0 = c;
      SH.c1 = look.splat;
      SH.alpha = a;
      const face = this.sn[i]!;
      if (face === 0) {
        fr.ellipse(x, y - rad * 0.3, rad * 2.3 * spread, rad * 0.55, 0, SH, 12);
        fr.glow(
          x,
          y - rad * 0.5,
          rad * 4.5,
          look.glow,
          L.splatGlow * (1 - dull * 0.7) * (1 - u),
          rad * 2,
          0,
          12,
        );
      } else {
        // On a face it runs a little way down.
        const run = Math.min(1, t / 0.8) * rad * 2.5;
        fr.ellipse(
          x + face * rad * 0.3,
          y + run * 0.5,
          rad * 0.55,
          rad * 1.6 * spread + run * 0.5,
          0,
          SH,
          12,
        );
        fr.glow(x, y, rad * 3.5, look.glow, L.splatGlow * 0.7 * (1 - dull * 0.7) * (1 - u), rad * 3.5, 0, 12);
      }
    }
    this.splats = ns;

    bk.end(cam.x - halfW, cam.y - halfH, halfW * 2, halfH * 2);
    fr.end(cam.x - halfW, cam.y - halfH, halfW * 2, halfH * 2);
    this.cpuMs = performance.now() - t0;
  }
}
