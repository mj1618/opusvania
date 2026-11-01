/**
 * The greybox-era sound pass (memory/audio.md, 2026-10-18): what playing the wood sounds like. Her
 * steps, wings and wall kicks; the thorn blade and what it meets (flesh, shell, wood); the lamps' fling
 * and snuff and the moths it frees; the creatures' tells. Same rules as bake.ts: every tone inharmonic
 * or detuned with noise in its attack, every envelope from zero to zero, nothing harsh above ~7 kHz.
 *
 * Combat is the loud family on purpose (Matt, 2026-10-18: the attack was "average and not satisfying"):
 * a blow is three layers (a crack, a body, a pitched tick that reads through anything), a kill a pop
 * and a crunch with a tail. Still organic: chitin, wood and glass, never a synth blip.
 */
import { at, click, exp, len, type Recipe, rubbed, swell } from './bake-lib';
import { arEnv, biquad, mixInto, modes, normalize, pink, saturate, shape, white } from './dsp';
import { LAMP_HZ, PITCH } from './tuning';

export const PLAY_SOUNDS = {
  // Her: soft steps, the wings opening and folding, the push off a wall.
  pad: 6,
  kick: 4,
  wingOpen: 4,
  wingFold: 4,
  // The thorn blade: one cut per combo step, and what it meets.
  slash1: 4,
  slash2: 4,
  slash3: 3,
  hitCrack: 5,
  hitTick: 4,
  clang: 4,
  crunch: 4,
  killTail: 3,
  hurt: 4,
  pogo: 4,
  thock: 4,
  bounce: 3,
  silkSnap: 4,
  // The lamps: the moment held, the launch, the snuff, the moths let go.
  slowIn: 2,
  launch: 4,
  snuff: 3,
  mothRush: 2,
  // A trap's release (the Canopy r11): the cage's bars snapping and falling, the swell under the stream.
  cageBreak: 3,
  releaseSwell: 2,
  // Creatures' tells and moves. `creak` / `rear` variants are lengths (the router picks by the tell's frames).
  creak: 4,
  rumble: 3,
  buzzUp: 3,
  dive: 3,
  silkTense: 3,
  drop: 3,
  rear: 3,
  slam: 2,
  skitter: 6,
  // The huntsman (r22): its scuttle's patter, the held breath of its tell, the thwip of its lunge.
  patter: 4,
  huntTell: 3,
  thwip: 4,
} as const;
export type PlaySoundId = keyof typeof PLAY_SOUNDS;

/** Seconds of each `creak` and `rear` variant: the router plays the one nearest the tell's length. */
export const CREAK_S = [0.3, 0.45, 0.65, 0.95] as const;
export const REAR_S = [0.55, 0.85, 1.25] as const;

/** Small bursts of noise ringing a short resonance: grit, scales, shell bits, claws. */
function grains(
  out: Float32Array,
  sr: number,
  r: () => number,
  count: number,
  t0: number,
  t1: number,
  lo: number,
  hi: number,
  tau: number,
  amp: number,
  bunch = 1,
): void {
  for (let g = 0; g < count; g++) {
    const t = t0 + (t1 - t0) * r() ** bunch;
    const f = lo + (hi - lo) * r();
    modes(
      out,
      sr,
      [{ f, tau: tau * (0.6 + 0.8 * r()), amp: amp * (0.35 + 0.65 * r()), ph: r() }],
      at(sr, t),
      0.0003,
    );
  }
}

/** Noise through a band-pass whose centre follows `f(t)` (s), shaped by `env`. */
function swept(
  sr: number,
  r: () => number,
  d: number,
  f: (t: number) => number,
  q: number,
  env: (t: number) => number,
  kind: 'white' | 'pink' = 'white',
): Float32Array {
  const n = len(sr, d);
  const x = kind === 'white' ? white(n, r) : pink(n, r);
  biquad(x, sr, 'bandpass', (i) => f(i / sr), q);
  return shape(x, sr, env);
}

/** Low-passed noise: a thud, a push of air. */
function thud(sr: number, r: () => number, d: number, hz: number, env: (t: number) => number): Float32Array {
  const x = white(len(sr, d), r);
  biquad(x, sr, 'lowpass', hz);
  biquad(x, sr, 'lowpass', hz);
  return shape(x, sr, env);
}

/** A sine gliding from `f0` to `f1` (exponentially, over `glide` s), shaped by `env`: a pop, a membrane. */
function glide(sr: number, d: number, f0: number, f1: number, glideS: number, env: (t: number) => number) {
  const n = len(sr, d);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * exp(f0, f1, t / glideS)) / sr;
    x[i] = Math.sin(ph) * env(t);
  }
  return x;
}

/** Plucked silk (Karplus-Strong, felt excitation): `f` Hz, `damp` per pass. */
function pluck(sr: number, r: () => number, d: number, f: number, damp: number): Float32Array {
  const n = len(sr, d);
  const p = Math.max(2, Math.round(sr / f));
  const line = white(p, r);
  biquad(line, sr, 'lowpass', 2500);
  const x = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const k = i % p;
    const v = line[k] as number;
    x[i] = v;
    line[k] = damp * 0.5 * (v + prev);
    prev = v;
  }
  return shape(x, sr, arEnv(0.001, 0, 1e3, d));
}

/** Mixes parts (each normalized first) at the given weights into the first's length. */
function blend(parts: Array<[Float32Array, number, number?]>): Float32Array[] {
  const n = Math.max(...parts.map(([x, , o]) => x.length + (o ?? 0)));
  const out = new Float32Array(n);
  for (const [x, g, o] of parts) {
    normalize([x]);
    mixInto(out, x, g, o ?? 0);
  }
  return normalize([out]);
}

/**
 * A creak of stick-slip friction: catches that come faster and higher as it winds up (the creak is
 * the countdown), each ringing a few wood modes around `f` Hz. `d` s long.
 */
function creakOf(
  sr: number,
  r: () => number,
  d: number,
  f: number,
  gapA: number,
  gapZ: number,
): Float32Array {
  const n = len(sr, d + 0.06);
  const x = new Float32Array(n);
  let t = 0.005;
  while (t < d) {
    const k = t / d;
    const ff = f * (1 + 0.45 * k) * (0.97 + 0.06 * r());
    modes(
      x,
      sr,
      [
        { f: ff, tau: 0.018, amp: 0.35 + 0.65 * k, ph: r() },
        { f: ff * 2.37, tau: 0.01, amp: (0.35 + 0.65 * k) * 0.5, ph: r() },
        { f: ff * 4.1, tau: 0.005, amp: (0.35 + 0.65 * k) * 0.2, ph: r() },
      ],
      at(sr, t),
      0.0008,
    );
    t += exp(gapA, gapZ, k) * (0.8 + 0.4 * r());
  }
  const grit = white(n, r);
  biquad(grit, sr, 'bandpass', f * 3, 1.5);
  shape(grit, sr, (tt) => (tt < d ? (tt / d) ** 2 * 0.25 : 0));
  mixInto(x, grit, 0.4);
  return shape(x, sr, arEnv(0.01, 0, 1e3, d + 0.06));
}

/** One cut of the thorn blade: air torn along a sweep, a thin glassy edge riding it, a push under. */
function cut(
  sr: number,
  r: () => number,
  d: number,
  sweep: (t: number) => number,
  edge: number,
  body: number,
  a: number,
): Float32Array[] {
  const air = swept(sr, r, d, sweep, 1.3, arEnv(a, 0.012, d * 0.22, d));
  // The edge: a resonant band (Q 14) a fifth over the sweep's top, so the blade has a timbre of its own.
  const zing = swept(
    sr,
    r,
    d,
    (t) => edge * (1 + 0.06 * Math.min(1, t / d)),
    14,
    arEnv(a, 0.008, d * 0.16, d),
  );
  const push = thud(sr, r, d, 260, arEnv(a * 1.4, 0.01, d * 0.2, d));
  biquad(air, sr, 'lowpass', 6500);
  return blend([
    [air, 1],
    [zing, 0.32],
    [push, body],
  ]);
}

export const PLAY_RECIPES: Record<PlaySoundId, Recipe> = {
  /** A soft step on earth and moss: a felted pad and a few grains of leaf litter. */
  pad(sr, r) {
    const d = 0.09;
    const body = thud(sr, r, d, 320 + r() * 140, arEnv(0.003, 0.004, 0.016, d));
    const litter = new Float32Array(len(sr, d));
    grains(litter, sr, r, 2 + Math.floor(r() * 3), 0.002, 0.03, 1600, 3200, 0.0016, 1);
    return blend([
      [body, 1],
      [litter, 0.3],
    ]);
  },
  /** The push off a wall: claws scuff the bark (two quick catches), a woody knock, a little air. */
  kick(sr, r) {
    const d = 0.2;
    const n = len(sr, d);
    const scuff = white(n, r);
    biquad(scuff, sr, 'bandpass', 1300 + r() * 500, 1.3);
    const c2 = 0.018 + r() * 0.012;
    shape(
      scuff,
      sr,
      (t) =>
        Math.min(1, t / 0.0008) * (Math.exp(-t / 0.006) + (t > c2 ? 0.7 * Math.exp(-(t - c2) / 0.008) : 0)),
    );
    const knock = new Float32Array(n);
    const f = 300 + r() * 60;
    modes(knock, sr, [
      { f, tau: 0.025, amp: 1 },
      { f: f * 2.2, tau: 0.014, amp: 0.5 },
    ]);
    const push = thud(sr, r, d, 220, arEnv(0.008, 0.01, 0.04, d));
    return blend([
      [scuff, 0.8],
      [knock, 0.5],
      [push, 0.55],
    ]);
  },
  /** The wings open: membrane unfurling (a band rising through the air) and its snap taut. */
  wingOpen(sr, r) {
    const d = 0.3;
    const top = 1300 + r() * 400;
    const unfurl = swept(sr, r, d, (t) => exp(420, top, t / 0.12), 0.9, arEnv(0.05, 0.02, 0.05, d), 'pink');
    const snap = swept(sr, r, 0.08, () => 850 + r() * 200, 1.3, arEnv(0.002, 0, 0.012, 0.08));
    const push = thud(sr, r, d, 240, arEnv(0.05, 0.02, 0.06, d));
    return blend([
      [unfurl, 1],
      [snap, 0.5, at(sr, 0.085 + r() * 0.02)],
      [push, 0.45],
    ]);
  },
  /** The wings fold: a short falling rush. */
  wingFold(sr, r) {
    const d = 0.14;
    return blend([
      [swept(sr, r, d, (t) => exp(1300 + r() * 200, 520, t / 0.08), 1, arEnv(0.008, 0.005, 0.03, d)), 1],
    ]);
  },
  /** Step 1, the cut: a sweep rising fast through the air with the blade's edge on it. */
  slash1(sr, r) {
    const top = 3400 + r() * 600;
    return cut(sr, r, 0.16, (t) => exp(650, top, t / 0.065), top * 0.82, 0.3, 0.006);
  },
  /** Step 2, the return cut: the same blade coming back down. */
  slash2(sr, r) {
    const top = 3200 + r() * 600;
    return cut(sr, r, 0.16, (t) => exp(top, 800, t / 0.09), top * 0.7, 0.3, 0.005);
  },
  /** Step 3, the finisher: wider, lower, a longer arc with weight under it. */
  slash3(sr, r) {
    const d = 0.26;
    const top = 2500 + r() * 400;
    return cut(
      sr,
      r,
      d,
      (t) => (t < 0.07 ? exp(380, top, t / 0.07) : exp(top, 900, (t - 0.07) / 0.15)),
      1900 + r() * 200,
      0.65,
      0.012,
    );
  },
  /**
   * A blow that lands, the meat of it: a sharp crack, a body of low modes (70-310 Hz) with a felt thud,
   * a squelch of chitin, driven a little into saturation so it punches.
   */
  hitCrack(sr, r) {
    const d = 0.3;
    const n = len(sr, d);
    const body = new Float32Array(n);
    modes(
      body,
      sr,
      [
        { f: 96 + r() * 10, tau: 0.06, amp: 0.8 },
        { f: 152 + r() * 14, tau: 0.045, amp: 1 },
        { f: 232 + r() * 20, tau: 0.03, amp: 0.7 },
        { f: 365 + r() * 30, tau: 0.018, amp: 0.4 },
      ],
      0,
      0.0015,
    );
    const crack = swept(sr, r, 0.05, () => 1700 + r() * 600, 0.8, arEnv(0.0004, 0, 0.006, 0.05));
    const squelch = swept(sr, r, 0.12, (t) => exp(900, 450, t / 0.05), 2, arEnv(0.002, 0, 0.022, 0.12));
    const x = blend([
      [body, 1],
      [thud(sr, r, d, 330, arEnv(0.001, 0.004, 0.03, d)), 0.75],
      [crack, 0.55],
      [click(sr, r, n, 5000, 0.0015), 0.5],
      [squelch, 0.25],
    ])[0] as Float32Array;
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.8);
    return normalize([x]);
  },
  /** The blow's pitch, so it reads through anything: a wood-glass tick (~1.45 kHz) with a short ring. */
  hitTick(sr, r) {
    const d = 0.35;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const f = 1420 + r() * 60;
    modes(
      x,
      sr,
      [
        { f, tau: 0.075, amp: 1, beat: 3, ph: r() },
        { f: f * 2.32, tau: 0.03, amp: 0.4 },
        { f: f * 3.91, tau: 0.012, amp: 0.18 },
      ],
      0,
      0.0006,
    );
    normalize([x]);
    mixInto(x, click(sr, r, n, 4000, 0.001), 0.3);
    return normalize([shape(x, sr, arEnv(0.0004, 0, 1e3, d))]);
  },
  /** The blade glances off a braced shell: chitin rings (inharmonic, ~820 Hz up), a click, a small knock. */
  clang(sr, r) {
    const d = 0.6;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const f = 790 + r() * 60;
    modes(
      x,
      sr,
      [
        { f, tau: 0.17, amp: 1, beat: 4, ph: r() },
        { f: f * 1.47, tau: 0.12, amp: 0.7, beat: 6, ph: r() },
        { f: f * 2.63, tau: 0.08, amp: 0.45 },
        { f: f * 3.9, tau: 0.045, amp: 0.25 },
        { f: f * 5.2, tau: 0.025, amp: 0.12 },
      ],
      0,
      0.0005,
    );
    const knock = new Float32Array(n);
    modes(knock, sr, [{ f: 165 + r() * 15, tau: 0.03, amp: 1 }]);
    return blend([
      [x, 1],
      [click(sr, r, n, 6000, 0.0012), 0.45],
      [knock, 0.35],
    ]);
  },
  /** A kill: a pop (a low sine dropping 210 -> 55 Hz), the shell crunching (dense grit), a body under. */
  crunch(sr, r) {
    const d = 0.4;
    const n = len(sr, d);
    const pop = glide(sr, d, 230 + r() * 20, 80, 0.09, arEnv(0.002, 0.01, 0.06, d));
    const grit = new Float32Array(n);
    grains(grit, sr, r, 34 + Math.floor(r() * 10), 0, 0.085, 900, 3300, 0.002, 1, 1.8);
    const body = new Float32Array(n);
    modes(body, sr, [
      { f: 92 + r() * 8, tau: 0.06, amp: 0.8 },
      { f: 140 + r() * 10, tau: 0.045, amp: 0.8 },
      { f: 215 + r() * 16, tau: 0.03, amp: 0.5 },
    ]);
    const x = blend([
      [pop, 1],
      [grit, 0.6],
      [body, 0.6],
      [click(sr, r, n, 4500, 0.002), 0.4],
    ])[0] as Float32Array;
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.5);
    return normalize([x]);
  },
  /** After a kill, the little tail: bits settling (sparse grit thinning out) in a falling breath of air. */
  killTail(sr, r) {
    const d = 0.9;
    const n = len(sr, d);
    const air = swept(sr, r, d, (t) => exp(1500, 320, t / 0.7), 0.7, arEnv(0.03, 0, 0.22, d), 'pink');
    const bits = new Float32Array(n);
    grains(bits, sr, r, 14, 0.02, 0.6, 1200, 2800, 0.003, 1, 2.2);
    return blend([
      [air, 1],
      [bits, 0.45],
    ]);
  },
  /** She is hit: a sharp but muffled blow, a crackle of scales, the low thump. No voice (rule 1). */
  hurt(sr, r) {
    const d = 0.5;
    const n = len(sr, d);
    const blow = thud(sr, r, d, 900, arEnv(0.001, 0.003, 0.025, d));
    const low = new Float32Array(n);
    modes(low, sr, [
      { f: 64 + r() * 6, tau: 0.09, amp: 0.8 },
      { f: 102 + r() * 8, tau: 0.07, amp: 1 },
      { f: 158 + r() * 10, tau: 0.045, amp: 0.55 },
    ]);
    const scales = new Float32Array(n);
    grains(scales, sr, r, 16, 0.002, 0.12, 2000, 4400, 0.0012, 1, 1.5);
    const x = blend([
      [low, 1],
      [blow, 0.8],
      [click(sr, r, n, 2500, 0.002), 0.45],
      [scales, 0.22],
    ])[0] as Float32Array;
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.6);
    return normalize([x]);
  },
  /** A pogo: a taut membrane bop (95 -> 160 Hz) and the air she is flung up through. */
  pogo(sr, r) {
    const d = 0.25;
    const bop = glide(sr, d, 92 + r() * 8, 165, 0.06, arEnv(0.002, 0.005, 0.05, d));
    const thwip = swept(sr, r, d, (t) => exp(500, 2300, t / 0.09), 1.2, arEnv(0.005, 0.01, 0.035, d));
    return blend([
      [bop, 1],
      [thwip, 0.55],
      [click(sr, r, len(sr, d), 3000, 0.0015), 0.3],
    ]);
  },
  /** The blade bites wood (a wall, bark): a dry knock with a thud. */
  thock(sr, r) {
    const d = 0.2;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const f = 360 + r() * 50;
    modes(x, sr, [
      { f, tau: 0.04, amp: 1 },
      { f: f * 2.37, tau: 0.024, amp: 0.5 },
      { f: f * 4.15, tau: 0.012, amp: 0.25 },
    ]);
    return blend([
      [x, 1],
      [click(sr, r, n, 3200, 0.0015), 0.4],
      [thud(sr, r, d, 260, arEnv(0.001, 0, 0.015, d)), 0.45],
    ]);
  },
  /** A bounce cap: a soft membrane bwomp, rising. */
  bounce(sr, r) {
    const d = 0.42;
    const bwomp = glide(sr, d, 88 + r() * 8, 150, 0.13, arEnv(0.004, 0.02, 0.1, d));
    const skin = swept(sr, r, d, () => 300 + r() * 40, 2, arEnv(0.003, 0, 0.05, d));
    return blend([
      [bwomp, 1],
      [skin, 0.4],
      [swept(sr, r, d, (t) => exp(400, 1500, t / 0.15), 1, arEnv(0.01, 0.01, 0.06, d)), 0.3],
    ]);
  },
  /** Silk parting: a short high pluck. */
  silkSnap(sr, r) {
    const d = 0.3;
    const x = pluck(sr, r, d, 820 + r() * 160, 0.985);
    return blend([
      [x, 1],
      [click(sr, r, len(sr, d), 3500, 0.001), 0.3],
    ]);
  },
  /**
   * The fling's moment snapping in: time slowing, heard as air dropping away (a band falling 2 kHz -> 280
   * Hz) over a low glide down. The held swell after it is a layer (voices/lamp.ts).
   */
  slowIn(sr, r) {
    const d = 0.42;
    const fall = swept(sr, r, d, (t) => exp(2000, 280, t / 0.3), 0.9, arEnv(0.004, 0.02, 0.12, d), 'pink');
    const low = glide(sr, d, 140, 70, 0.3, arEnv(0.01, 0.02, 0.12, d));
    return blend([
      [fall, 1],
      [low, 0.45],
    ]);
  },
  /** The launch off the flame: a strong rush (300 Hz -> 1.8 kHz fast, back to 650), a wing snap, a push. */
  launch(sr, r) {
    const d = 0.5;
    const top = 1700 + r() * 300;
    const rush = swept(
      sr,
      r,
      d,
      (t) => (t < 0.06 ? exp(300, top, t / 0.06) : exp(top, 650, (t - 0.06) / 0.35)),
      0.8,
      arEnv(0.01, 0.03, 0.12, d),
      'pink',
    );
    const snap = swept(sr, r, 0.07, () => 1000 + r() * 200, 1.2, arEnv(0.001, 0, 0.01, 0.07));
    const push = thud(sr, r, d, 170, arEnv(0.006, 0.02, 0.07, d));
    return blend([
      [rush, 1],
      [snap, 0.4],
      [push, 0.7],
    ]);
  },
  /**
   * The snuff: the lamp's own out-of-tune tone (a wick's, two sines 1.3 Hz apart; the cue repitches it
   * for other kinds) falling an octave and away in 0.3 s, into a soft glassy *pff* of air.
   */
  snuff(sr, r) {
    const d = 0.75;
    const n = len(sr, d);
    const f = LAMP_HZ.wick;
    const tone = new Float32Array(n);
    for (const df of [0, 1.3]) {
      let ph = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (2 * Math.PI * (f + df) * 2 ** -Math.min(1, t / 0.3)) / sr;
        tone[i] = (tone[i] as number) + Math.sin(ph) * Math.exp(-t / 0.13);
      }
    }
    shape(tone, sr, arEnv(0.004, 0, 1e3, d));
    const pff = pink(n, r);
    biquad(pff, sr, 'lowpass', 1700);
    biquad(pff, sr, 'bandpass', 750, 0.8);
    shape(pff, sr, (t) => (t < 0.03 ? 0 : arEnv(0.012, 0.01, 0.07, d - 0.03)(t - 0.03)));
    return blend([
      [tone, 0.8],
      [pff, 0.6],
    ]);
  },
  /**
   * A trap's cage breaking (the Canopy r11): its bars are brittle gold straws. A bright snap of many small inharmonic
   * rings at once over a soft knock, a breath of air (the moths pouring out), then the bars landing one by one as a
   * thinning patter of tinks. Nothing above ~6 kHz.
   */
  cageBreak(sr, r) {
    const d = 1.6;
    const n = len(sr, d);
    const snap = new Float32Array(n);
    for (let k = 0; k < 9; k++) {
      const f = 1700 + 2600 * r();
      modes(
        snap,
        sr,
        [
          { f, tau: 0.035 + 0.08 * r(), amp: 0.6 + 0.4 * r(), ph: r() },
          { f: f * (2.31 + 0.2 * r()), tau: 0.02, amp: 0.2 },
        ],
        at(sr, 0.025 * r() ** 1.5),
        0.0008,
      );
    }
    mixInto(snap, click(sr, r, len(sr, 0.05), 5200, 0.004), 0.7);
    const knock = new Float32Array(n);
    modes(knock, sr, [
      { f: 150, tau: 0.07, amp: 1 },
      { f: 318, tau: 0.045, amp: 0.5 },
    ]);
    const tinks = new Float32Array(n);
    for (let k = 0; k < 12; k++) {
      const t = 0.32 + 1.05 * r() ** 0.9;
      const f = 1500 + 1900 * r();
      modes(
        tinks,
        sr,
        [{ f, tau: 0.04 + 0.05 * r(), amp: (0.5 + 0.5 * r()) * (1 - 0.5 * (t - 0.3)) }],
        at(sr, t),
        0.001,
      );
    }
    const air = swept(sr, r, 0.7, (t) => exp(600, 2100, t / 0.45), 0.8, swell(0.04, 0.35, 0.7), 'pink');
    return blend([
      [snap, 1],
      [knock, 0.45],
      [tinks, 0.35],
      [air, 0.3],
    ]);
  },
  /**
   * Under the release's stream (the Canopy r11): the forest's chord (D4 A4 D5 E5, in tune: the false lights are the
   * sharp ones) coming in one note after another, a breath of air rising through it, all fading as the moths go.
   */
  releaseSwell(sr, r) {
    const d = 3.4;
    const n = len(sr, d);
    const chord = new Float32Array(n);
    [-702, 0, 498, 702].forEach((c, k) => {
      const f = PITCH.A4 * 2 ** (c / 1200);
      const t0 = 0.12 + k * 0.32;
      const env = swell(0.6, 1.3, d - t0);
      let ph = r() * 6.28;
      let ph2 = r() * 6.28;
      for (let i = at(sr, t0); i < n; i++) {
        const t = i / sr - t0;
        ph += (2 * Math.PI * f) / sr;
        ph2 += (2 * Math.PI * (f * 2.003 + 0.4)) / sr;
        chord[i] = (chord[i] as number) + (Math.sin(ph) + 0.12 * Math.sin(ph2)) * env(t) * (1 - k * 0.12);
      }
    });
    const air = swept(sr, r, d, (t) => exp(380, 1900, t / 2.6), 0.9, swell(0.9, 1.6, d), 'pink');
    return blend([
      [chord, 1],
      [air, 0.45],
    ]);
  },
  /** The freed moths: a soft rising rush of many small wings, thinning out as they go (panned by the cue). */
  mothRush(sr, r) {
    const d = 1.6;
    const n = len(sr, d);
    const out = new Float32Array(n);
    for (let g = 0; g < 70; g++) {
      const t = 0.02 + 1.3 * r() ** 1.4;
      const k = t / 1.4;
      const w = swept(
        sr,
        r,
        0.05,
        () => exp(900, 2600, k) * (0.85 + 0.3 * r()),
        1.4,
        arEnv(0.006, 0.004, 0.01, 0.05),
      );
      mixInto(out, w, (0.4 + 0.6 * r()) * (1 - 0.6 * k), at(sr, t));
    }
    const air = swept(sr, r, d, (t) => exp(700, 2200, t / 1.2), 0.7, swell(0.25, 0.5, d), 'pink');
    return blend([
      [out, 1],
      [air, 0.5],
    ]);
  },
  /** A beetle braces: its shell creaks like root, the catches coming faster (a variant per length). */
  creak(sr, r, v) {
    return normalize([creakOf(sr, r, CREAK_S[v] ?? 0.45, 200 + r() * 30, 0.05, 0.012)]);
  },
  /** The ram: scrabbling legs and a low rumble. */
  rumble(sr, r) {
    const d = 0.7;
    const n = len(sr, d);
    const low = thud(sr, r, d, 150, arEnv(0.04, 0.3, 0.12, d));
    const legs = new Float32Array(n);
    for (let t = 0.01; t < 0.55; t += 0.05 + r() * 0.03)
      modes(legs, sr, [{ f: 380 + r() * 200, tau: 0.008, amp: 0.6 + 0.4 * r() }], at(sr, t), 0.0005);
    return blend([
      [low, 1],
      [legs, 0.45],
    ]);
  },
  /** A hawker's tell: its wings coming up to speed (pulses 38 -> 70 a second through a body band), swelling. */
  buzzUp(sr, r) {
    const d = 0.7;
    const n = len(sr, d);
    const x = new Float32Array(n);
    let t = 0.005;
    while (t < d - 0.03) {
      const k = t / d;
      modes(
        x,
        sr,
        [
          { f: 520 + 300 * k + r() * 60, tau: 0.006, amp: 0.3 + 0.7 * k, ph: r() },
          { f: 180 + 60 * k, tau: 0.01, amp: (0.3 + 0.7 * k) * 0.6, ph: r() },
        ],
        at(sr, t),
        0.0015,
      );
      t += 1 / exp(38, 70, k);
    }
    const hiss = swept(
      sr,
      r,
      d,
      () => 1400,
      1.2,
      (tt) => (tt < d ? (tt / d) ** 2 : 0),
    );
    return blend([
      [shape(x, sr, arEnv(0.05, 0, 1e3, d)), 1],
      [hiss, 0.25],
    ]);
  },
  /** The dive: a darkening swoop (2 kHz -> 350 Hz) with the wingbeat fading in it. */
  dive(sr, r) {
    const d = 0.55;
    const n = len(sr, d);
    const swoop = swept(sr, r, d, (t) => exp(2000, 350, t / 0.45), 1, arEnv(0.02, 0.05, 0.15, d), 'pink');
    const beat = new Float32Array(n);
    for (let t = 0.005; t < 0.4; t += 1 / 72)
      modes(
        beat,
        sr,
        [{ f: exp(900, 300, t / 0.4), tau: 0.005, amp: 1 - t / 0.45, ph: r() }],
        at(sr, t),
        0.0015,
      );
    return blend([
      [swoop, 1],
      [beat, 0.4],
    ]);
  },
  /** A dangler's tell: its silk drawn taut, a thin creaking tone rising. */
  silkTense(sr, r) {
    const d = 0.6;
    const n = len(sr, d);
    const x = new Float32Array(n);
    let ph = r() * 6.28;
    const f0 = 1050 + r() * 100;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * f0 * (1 + 0.35 * (t / d) ** 1.5)) / sr;
      // Stick-slip: the tone catches 26 times a second.
      const catchy = 0.55 + 0.45 * Math.max(0, Math.sin(2 * Math.PI * 26 * t)) ** 3;
      x[i] = Math.sin(ph) * catchy;
    }
    shape(x, sr, (t) => (t < d ? (t / d) ** 1.2 * (t > d - 0.03 ? (d - t) / 0.03 : 1) : 0));
    const rub = rubbed(sr, r, n, f0 * 1.2, swell(d * 0.8, 0.1, d), { breath: 0.8, pure: 0.1 });
    return blend([
      [x, 0.7],
      [rub, 0.5],
    ]);
  },
  /** The dangler drops: a quick falling zip down its thread. */
  drop(sr, r) {
    const d = 0.3;
    const zip = swept(sr, r, d, (t) => exp(2600, 600, t / 0.25), 3, arEnv(0.004, 0.02, 0.06, d));
    const tone = glide(sr, d, 1500 + r() * 200, 500, 0.25, arEnv(0.004, 0.02, 0.05, d));
    return blend([
      [zip, 1],
      [tone, 0.25],
    ]);
  },
  /** The old burrback rears for its slam: a deep creak of shell and a long in-breath (it has a mouth). */
  rear(sr, r, v) {
    const d = REAR_S[v] ?? 0.85;
    const n = len(sr, d + 0.06);
    const creak = creakOf(sr, r, d, 95 + r() * 15, 0.08, 0.02);
    const inb = pink(n, r);
    const k = (i: number) => Math.min(1, i / sr / d);
    biquad(inb, sr, 'bandpass', (i) => exp(300, 650, k(i)), 3);
    biquad(inb, sr, 'lowpass', 1800);
    shape(inb, sr, (t) => (t < d ? (t / d) ** 1.5 : Math.max(0, 1 - (t - d) / 0.05)));
    return blend([
      [creak, 1],
      [inb, 0.5],
    ]);
  },
  /** The slam: deep modes (38-150 Hz), a long thud, debris crunching and falling. */
  slam(sr, r) {
    const d = 1.2;
    const n = len(sr, d);
    const body = new Float32Array(n);
    modes(body, sr, [
      { f: 38 + r() * 4, tau: 0.25, amp: 1 },
      { f: 62 + r() * 6, tau: 0.18, amp: 0.8 },
      { f: 95 + r() * 8, tau: 0.1, amp: 0.6 },
      { f: 150 + r() * 12, tau: 0.06, amp: 0.4 },
    ]);
    const debris = new Float32Array(n);
    grains(debris, sr, r, 40, 0.01, 0.7, 600, 2600, 0.003, 1, 1.8);
    const x = blend([
      [body, 1],
      [thud(sr, r, d, 180, arEnv(0.002, 0.01, 0.09, d)), 0.8],
      [debris, 0.3],
      [click(sr, r, n, 2500, 0.003), 0.3],
    ])[0] as Float32Array;
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.4);
    return normalize([x]);
  },
  /** Ants: a tiny skitter of three to six feet on bark. */
  /**
   * A huntsman's burst along the bark: a dry rapid patter, eight feet ticking on wood (~40 a second), a little
   * hollow knock under the first ones, gone in a fifth of a second. Drier and lower than the ants' skitter.
   */
  patter(sr, r) {
    const d = 0.2;
    const x = new Float32Array(len(sr, d));
    let t = 0.002;
    let k = 0;
    while (t < d - 0.02) {
      const a = (1 - t / d) * (0.55 + 0.45 * r());
      modes(
        x,
        sr,
        [
          { f: 1500 + r() * 900, tau: 0.0012, amp: a, ph: r() },
          { f: 3100 + r() * 700, tau: 0.0006, amp: a * 0.4, ph: r() },
          ...(k < 3 ? [{ f: 420 + r() * 80, tau: 0.006, amp: a * 0.5, ph: r() }] : []),
        ],
        at(sr, t),
        0.0003,
      );
      t += 0.018 + r() * 0.016;
      k++;
    }
    return normalize([x]);
  },
  /**
   * The tell (r22, 24 frames: 0.4 s): it flattens to the bark. A held breath drawn in (band-passed air rising) over a
   * slow creak of its joints tightening, cut dead at the end: the stillness before the spring.
   */
  huntTell(sr, r) {
    const d = 0.4;
    const n = len(sr, d);
    const air = pink(n, r);
    biquad(air, sr, 'bandpass', (i) => exp(500, 1300, i / sr / d), 2.2);
    biquad(air, sr, 'lowpass', 2600);
    shape(air, sr, (t) => (t < d ? (t / d) ** 1.6 * (t > d - 0.012 ? (d - t) / 0.012 : 1) : 0));
    const creak = creakOf(sr, r, d - 0.04, 260 + r() * 30, 0.06, 0.022);
    return blend([
      [air, 0.7],
      [creak, 0.8],
    ]);
  },
  /** The lunge: a thwip, air whipped past a taut leg (noise swept 700 Hz -> 3.4 kHz in 70 ms) with a tick at its head. */
  thwip(sr, r) {
    const d = 0.16;
    const n = len(sr, d);
    const whip = swept(sr, r, d, (t) => exp(700, 3400, t / 0.07), 2.5, arEnv(0.004, 0.02, 0.07, d));
    const tone = glide(sr, d, 900 + r() * 100, 2400, 0.07, arEnv(0.003, 0.01, 0.05, d));
    return blend([
      [whip, 1],
      [tone, 0.22],
      [click(sr, r, n, 2600, 0.002), 0.35],
    ]);
  },
  skitter(sr, r) {
    const d = 0.09;
    const x = new Float32Array(len(sr, d));
    const count = 3 + Math.floor(r() * 4);
    for (let k = 0; k < count; k++)
      modes(
        x,
        sr,
        [{ f: 2500 + r() * 1500, tau: 0.0007, amp: 0.5 + 0.5 * r() }],
        at(sr, k * (0.008 + r() * 0.008)),
        0.0002,
      );
    return normalize([x]);
  },
};

/**
 * The forest's chord in cents above A5, for the freed moths' chimes (D5 E5 A5 B5 D6 E6 A6 B6 D7): in tune,
 * unlike the lamps. A chain's flames going out on one landing climb it as one phrase.
 */
export const MOTH_CENTS = [-702, -498, 0, 204, 498, 702, 1200, 1404, 1698] as const;
