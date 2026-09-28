/**
 * Sound made visible (the game's identity: in Tallage a sound is a title deed).
 *
 * - **Tear ribbons**: a Seize rips the sound out of its owner as a waveform ribbon in its noise
 *   colour that whips into Kid's sack; shards of the owner's outline fly off where it tore.
 * - **Hum rings**: every humming thing radiates outlines of itself in its colour (brown slow and
 *   heavy, pink double-pulsed, violet fast and thin). Stateless: a function of the sim frame.
 * - **Voice arcs**: an armed enemy's voice leaves its mouth as arcs ")))"; they speed up and
 *   brighten as a wind-up builds (part of the telegraph, in the attack's colour).
 * - **Levy trails**: a thrown sound leaves its waveform behind it.
 * - **White static**: crackling arcs and hopping sparks (unclaimable land looks dangerous).
 *
 * Model stepped once per sim step (deterministic, reseeded by reset()); draw functions are Pixi.
 */
import type { Graphics } from 'pixi.js';
import type { Colour, SimEvent } from '../../sim/events';
import type { GameState } from '../../sim/index';
import { NOISE_COLOURS } from '../gfx/palette';
import { rngFor } from '../outline';
import { colourHex } from '../palette';

/** Waveform per noise colour: cycles along a ribbon, amplitude px, stroke width, shape. */
export const WAVE: Record<
  Colour,
  { cycles: number; amp: number; width: number; shape: 'sine' | 'double' | 'saw' | 'noise' }
> = {
  brown: { cycles: 2.5, amp: 26, width: 11, shape: 'sine' },
  pink: { cycles: 4.5, amp: 19, width: 8, shape: 'double' },
  violet: { cycles: 8, amp: 13, width: 5, shape: 'saw' },
  white: { cycles: 12, amp: 9, width: 3, shape: 'noise' },
};

/** Hum rings per colour: period and life (steps), growth px, width, base alpha. */
export const HUM_RINGS: Record<
  Colour,
  { period: number; life: number; grow: number; width: number; alpha: number }
> = {
  brown: { period: 46, life: 58, grow: 46, width: 5, alpha: 0.42 },
  pink: { period: 30, life: 38, grow: 34, width: 3, alpha: 0.42 },
  violet: { period: 16, life: 22, grow: 24, width: 2, alpha: 0.45 },
  white: { period: 1, life: 1, grow: 0, width: 0, alpha: 0 },
};

export function waveAt(c: Colour, u: number, rnd?: () => number): number {
  const w = WAVE[c];
  const ph = u * Math.PI * 2;
  switch (w.shape) {
    case 'sine':
      return Math.sin(ph);
    case 'double':
      return 0.7 * Math.sin(ph) + 0.35 * Math.sin(ph * 2 + 0.8);
    case 'saw': {
      const f = (((u % 1) + 1) % 1) * 2 - 1;
      return f;
    }
    default:
      return rnd ? rnd() * 2 - 1 : Math.sin(ph * 3.1) * Math.sin(ph * 1.3);
  }
}

interface Tear {
  x: number;
  y: number;
  colour: Colour;
  age: number;
  life: number;
  seed: number;
  /** Reverse: the sound leaves the sack for (x, y) (a push home, an enemy's Snatch). */
  rev: boolean;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  len: number;
  age: number;
  life: number;
  color: number;
}

const TEAR_LIFE = 19;
/** Fraction of the tear's life at which the head reaches the sack. */
const TEAR_ARRIVE = 0.62;

export class SoundViz {
  tears: Tear[] = [];
  shards: Shard[] = [];
  /** Recent positions of levied things in flight (id → points, newest last). */
  trails = new Map<number, { pts: number[]; colour: Colour; age: number }>();
  /** Pops at the sack as a ribbon arrives. */
  pops: { age: number; colour: Colour }[] = [];
  private n = 0;

  reset(): void {
    this.tears = [];
    this.shards = [];
    this.trails.clear();
    this.pops = [];
    this.n = 0;
  }

  step(s: GameState, events: readonly SimEvent[]): void {
    this.n++;
    const rnd = rngFor(this.n, 911);
    for (const e of events) {
      if (e.type === 'bagPush' || e.type === 'snatch') {
        const snd = s.local.sounds.find((o) => o.id === e.soundId);
        if (snd && snd.colour !== 'white')
          this.tears.push({
            x: e.x,
            y: e.y,
            colour: snd.colour,
            age: 0,
            life: TEAR_LIFE,
            seed: this.n,
            rev: true,
          });
      }
      if (e.type === 'seizeTake') {
        if (e.colour === 'white') continue;
        this.tears.push({
          x: e.x,
          y: e.y,
          colour: e.colour,
          age: 0,
          life: TEAR_LIFE,
          seed: this.n,
          rev: false,
        });
        const c = colourHex(e.colour);
        for (let i = 0; i < 12; i++) {
          const a = rnd() * Math.PI * 2;
          const sp = 4 + rnd() * 9;
          this.shards.push({
            x: e.x + Math.cos(a) * 20,
            y: e.y + Math.sin(a) * 20,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 2,
            rot: a,
            vr: (rnd() - 0.5) * 0.6,
            len: 8 + rnd() * 16,
            age: 0,
            life: 10 + Math.floor(rnd() * 7),
            color: i % 4 === 0 ? 0xffffff : c,
          });
        }
      }
    }
    for (const t of this.tears) {
      t.age++;
      if (!t.rev && t.age === Math.round(t.life * TEAR_ARRIVE)) this.pops.push({ age: 0, colour: t.colour });
    }
    this.tears = this.tears.filter((t) => t.age < t.life);
    for (const p of this.pops) p.age++;
    this.pops = this.pops.filter((p) => p.age < 14);
    for (const q of this.shards) {
      q.x += q.vx;
      q.y += q.vy;
      q.vx *= 0.9;
      q.vy = q.vy * 0.9 + 0.35;
      q.rot += q.vr;
      q.age++;
    }
    this.shards = this.shards.filter((q) => q.age < q.life);

    // Levy trails: follow levied things in flight; fade out after landing.
    const seen = new Set<number>();
    for (const l of s.local.levied) {
      seen.add(l.id);
      let tr = this.trails.get(l.id);
      if (!tr) {
        tr = { pts: [], colour: l.colour, age: 0 };
        this.trails.set(l.id, tr);
      }
      if (l.phase === 'flight') {
        tr.pts.push(l.x + l.w / 2, l.y + l.h / 2);
        if (tr.pts.length > 32) tr.pts.splice(0, 2);
        tr.age = 0;
      } else {
        tr.age++;
        if (tr.pts.length > 0) tr.pts.splice(0, 4);
      }
    }
    for (const [id, tr] of this.trails) if (!seen.has(id) || tr.pts.length === 0) this.trails.delete(id);
  }

  /** Kid's sack in world px (she carries it on her back). */
  static sack(s: GameState, kid: { x: number; y: number }): { x: number; y: number } {
    const p = s.player;
    return { x: kid.x + p.w / 2 - p.facing * 16, y: kid.y + p.h * 0.42 };
  }

  /** `sackAt`: where the rig drew her sack this frame (falls back to an estimate from the hitbox). */
  draw(
    f: Graphics,
    gl: Graphics,
    s: GameState,
    kid: { x: number; y: number },
    frame: number,
    sackAt?: { x: number; y: number },
  ): void {
    const sack = sackAt ?? SoundViz.sack(s, kid);
    for (const [, tr] of this.trails) drawTrail(f, gl, tr.pts, tr.colour, frame);
    for (const t of this.tears) drawTear(f, gl, t, sack, frame);
    for (const q of this.shards) {
      const k = 1 - q.age / q.life;
      const dx = Math.cos(q.rot) * q.len * 0.5;
      const dy = Math.sin(q.rot) * q.len * 0.5;
      f.moveTo(q.x - dx, q.y - dy)
        .lineTo(q.x + dx, q.y + dy)
        .stroke({ width: 4, color: q.color, alpha: k });
      gl.moveTo(q.x - dx, q.y - dy)
        .lineTo(q.x + dx, q.y + dy)
        .stroke({ width: 7, color: q.color, alpha: 0.5 * k });
    }
    for (const p of this.pops) {
      const t = p.age / 14;
      const c = colourHex(p.colour);
      f.circle(sack.x, sack.y, 10 + 40 * (1 - (1 - t) ** 2)).stroke({
        width: 6 * (1 - t) + 1,
        color: c,
        alpha: 1 - t,
      });
      gl.circle(sack.x, sack.y, 26 * (1 - t) + 6).fill({ color: c, alpha: 0.6 * (1 - t) });
      if (p.age < 3) f.circle(sack.x, sack.y, 16 - p.age * 4).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
}

/** A waveform polyline between two points along a whip arc (control point lifted). */
function ribbon(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  u0: number,
  u1: number,
  colour: Colour,
  amp: number,
  phase: number,
  seed: number,
): number[] {
  const pts: number[] = [];
  const N = 30;
  const rnd = rngFor(seed, 3);
  const bez = (u: number): [number, number] => {
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1];
  };
  const cycles = WAVE[colour].cycles;
  for (let i = 0; i <= N; i++) {
    const u = u0 + ((u1 - u0) * i) / N;
    const [px, py] = bez(u);
    const [qx, qy] = bez(Math.min(1, u + 0.01));
    let nx = -(qy - py);
    let ny = qx - px;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const env = Math.sin((Math.PI * i) / N) ** 0.7;
    const w = waveAt(colour, (i / N) * cycles * Math.max(0.35, u1 - u0) * 2 - phase, rnd);
    pts.push(px + nx * w * amp * env, py + ny * w * amp * env);
  }
  return pts;
}

function strokeWave(
  f: Graphics,
  gl: Graphics,
  pts: number[],
  colour: Colour,
  width: number,
  alpha: number,
): void {
  if (pts.length < 4) return;
  const c = colourHex(colour);
  const n = NOISE_COLOURS[colour];
  gl.poly(pts, false).stroke({
    width: width * 2,
    color: n.core,
    alpha: 0.4 * alpha,
    cap: 'round',
    join: 'round',
  });
  f.poly(pts, false).stroke({
    width: width + 3,
    color: 0x12141a,
    alpha: 0.5 * alpha,
    cap: 'round',
    join: 'round',
  });
  f.poly(pts, false).stroke({ width, color: c, alpha, cap: 'round', join: 'round' });
  f.poly(pts, false).stroke({
    width: Math.max(1, width * 0.3),
    color: 0xffffff,
    alpha: 0.85 * alpha,
    cap: 'round',
    join: 'round',
  });
}

function drawTear(f: Graphics, gl: Graphics, t: Tear, sack: { x: number; y: number }, frame: number): void {
  const u = t.age / t.life;
  // Head: rips up out of the owner and whips over into the sack; tail: tears free, then follows.
  const hu = Math.min(1, u / TEAR_ARRIVE);
  const head = 1 - (1 - hu) ** 2.2;
  const tu = Math.max(0, (u - 0.3) / 0.6);
  const tail = Math.min(head, tu * tu);
  if (head - tail < 0.01) return;
  const [ax, ay, bx, by] = t.rev ? [sack.x, sack.y, t.x, t.y] : [t.x, t.y, sack.x, sack.y];
  const dx = bx - ax;
  const lift = 70 + Math.abs(dx) * 0.4;
  const cx = ax + dx * 0.35 - Math.sign(dx || 1) * 40;
  const cy = Math.min(ay, by) - lift;
  const stretch = head - tail;
  const w = WAVE[t.colour];
  const amp = w.amp * (0.6 + stretch * 1.2) * (1 - u * 0.4);
  const phase = frame * 0.35;
  const pts = ribbon(ax, ay, bx, by, cx, cy, tail, head, t.colour, amp, phase, t.seed + frame);
  const alpha = u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15;
  strokeWave(f, gl, pts, t.colour, w.width, alpha);
  // The torn end at the owner flares for the first frames.
  if (t.age < 6 && !t.rev) {
    const k = 1 - t.age / 6;
    const c = colourHex(t.colour);
    f.circle(t.x, t.y, 22 + (1 - k) * 30).stroke({ width: 5 * k + 1, color: c, alpha: k });
    gl.circle(t.x, t.y, 30).fill({ color: c, alpha: 0.5 * k });
  }
}

function drawTrail(f: Graphics, gl: Graphics, raw: number[], colour: Colour, frame: number): void {
  const n = raw.length / 2;
  if (n < 3) return;
  const w = WAVE[colour];
  const pts: number[] = [];
  const rnd = rngFor(frame, 17);
  for (let i = 0; i < n; i++) {
    const x = raw[2 * i] as number;
    const y = raw[2 * i + 1] as number;
    const j = Math.min(n - 1, i + 1);
    const k = Math.max(0, i - 1);
    let tx = (raw[2 * j] as number) - (raw[2 * k] as number);
    let ty = (raw[2 * j + 1] as number) - (raw[2 * k + 1] as number);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const env = i / (n - 1);
    const wv = waveAt(colour, i * 0.35 - frame * 0.25, rnd);
    pts.push(x - ty * wv * w.amp * 0.8 * env, y + tx * wv * w.amp * 0.8 * env);
  }
  strokeWave(f, gl, pts, colour, w.width * 0.8, 0.9);
}

/**
 * Hum rings around a humming rect (world px), stateless: `frame` + `id` pick the phase. `boost`
 * (0..1) speeds and brightens them (a telegraph building).
 */
export function drawHumRings(
  g: Graphics,
  gl: Graphics,
  r: { x: number; y: number; w: number; h: number },
  colour: Colour,
  frame: number,
  id: number,
  boost = 0,
): void {
  const H = HUM_RINGS[colour];
  if (H.alpha <= 0) return;
  const period = Math.max(6, Math.round(H.period * (1 - 0.5 * boost)));
  const life = Math.round(H.life * (1 - 0.3 * boost));
  const c = colourHex(colour);
  const off = (id * 17) % period;
  const count = Math.ceil(life / period);
  for (let n = 0; n < count; n++) {
    const age = ((frame + off) % period) + n * period;
    if (age >= life) continue;
    const t = age / life;
    const e = 1 - (1 - t) ** 2;
    const pad = 4 + e * H.grow * (1 + boost * 0.5);
    const a = H.alpha * (1 - t) * (1 + boost);
    const rr = Math.min(18, Math.min(r.w, r.h) / 3) + pad * 0.5;
    const R = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
    g.roundRect(R.x, R.y, R.w, R.h, rr).stroke({
      width: H.width * (1 - t * 0.5),
      color: c,
      alpha: Math.min(1, a),
    });
    gl.roundRect(R.x, R.y, R.w, R.h, rr).stroke({
      width: H.width * 2,
      color: NOISE_COLOURS[colour].core,
      alpha: Math.min(1, a * 0.7),
    });
    if (colour === 'pink' && t < 0.7) {
      // Pink's second pulse: a thinner echo just inside.
      const q = 6;
      g.roundRect(R.x + q, R.y + q, R.w - 2 * q, R.h - 2 * q, rr).stroke({
        width: 1.5,
        color: c,
        alpha: Math.min(1, a * 0.7),
      });
    }
  }
}

/**
 * Voice arcs ")))" leaving a mouth at (x, y) toward `dir`. `boost` 0..1 = a wind-up building
 * (faster, brighter, wider). Stateless.
 */
export function drawVoiceArcs(
  g: Graphics,
  gl: Graphics,
  x: number,
  y: number,
  dir: number,
  colour: Colour,
  frame: number,
  id: number,
  boost = 0,
): void {
  if (colour === 'white') return;
  const period = Math.round(22 - 12 * boost);
  const life = 30;
  const c = colourHex(colour);
  const w = WAVE[colour];
  const count = Math.ceil(life / period);
  const off = (id * 13) % period;
  for (let n = 0; n < count; n++) {
    const age = ((frame + off) % period) + n * period;
    if (age >= life) continue;
    const t = age / life;
    const R = 8 + t * (40 + 30 * boost);
    const span = 0.5 + 0.35 * boost;
    const a0 = dir > 0 ? -span : Math.PI - span;
    const a = (0.55 + 0.45 * boost) * (1 - t);
    const pts: number[] = [];
    const N = 12;
    const rnd = rngFor(frame, id + n);
    for (let i = 0; i <= N; i++) {
      const ang = a0 + (2 * span * i) / N;
      // The arc itself carries the colour's waveform (violet jagged, brown smooth).
      const wob = waveAt(colour, (i / N) * w.cycles * 0.4 + frame * 0.1, rnd) * (w.amp * 0.12) * (1 - t);
      pts.push(x + Math.cos(ang) * (R + wob), y + Math.sin(ang) * (R + wob));
    }
    const width = (w.width * 0.6 + 2 * boost) * (1 - t * 0.5);
    g.poly(pts, false).stroke({ width, color: c, alpha: Math.min(1, a), cap: 'round' });
    gl.poly(pts, false).stroke({
      width: width * 2.2,
      color: NOISE_COLOURS[colour].core,
      alpha: Math.min(1, a * 0.8),
      cap: 'round',
    });
  }
}

/** White static crackle: arcs jumping along/out of a rect, and hopping sparks. Stateless. */
export function drawStaticCrackle(
  g: Graphics,
  gl: Graphics,
  r: { x: number; y: number; w: number; h: number },
  frame: number,
  id: number,
): void {
  const rnd = rngFor(frame >> 1, id + 77);
  const edge = (): [number, number] => {
    const k = rnd() * 2 * (r.w + r.h);
    if (k < r.w) return [r.x + k, r.y];
    if (k < r.w + r.h) return [r.x + r.w, r.y + k - r.w];
    if (k < 2 * r.w + r.h) return [r.x + (k - r.w - r.h), r.y + r.h];
    return [r.x, r.y + (k - 2 * r.w - r.h)];
  };
  const bolts = 1 + Math.floor(rnd() * 3);
  for (let b = 0; b < bolts; b++) {
    if (rnd() < 0.3) continue;
    const [x0, y0] = edge();
    const out = rnd() < 0.5;
    const [x1, y1] = out
      ? [x0 + (x0 - (r.x + r.w / 2)) * (0.2 + rnd() * 0.3), y0 + (y0 - (r.y + r.h / 2)) * (0.2 + rnd() * 0.3)]
      : edge();
    const pts: number[] = [x0, y0];
    const segs = 5;
    for (let i = 1; i < segs; i++) {
      const u = i / segs;
      pts.push(x0 + (x1 - x0) * u + (rnd() - 0.5) * 26, y0 + (y1 - y0) * u + (rnd() - 0.5) * 26);
    }
    pts.push(x1, y1);
    gl.poly(pts, false).stroke({ width: 7, color: 0xcfe0ff, alpha: 0.55 });
    g.poly(pts, false).stroke({ width: 2.5, color: 0xffffff, alpha: 0.95 });
  }
  const sparks = Math.round((r.w + r.h) / 40);
  for (let i = 0; i < sparks; i++) {
    const [x, y] = edge();
    const h = rnd() * 10;
    g.rect(x - 2 + (rnd() - 0.5) * 10, y - h - 2, 3, 3).fill({ color: 0xffffff, alpha: 0.5 + rnd() * 0.5 });
  }
}
