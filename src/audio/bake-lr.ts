/**
 * Lanternroot's sounds (docs/design/levels/proto-1.md §6, memory/audio.md "Lanternroot"): her light and what it
 * does. Same rules as bake.ts: every tone inharmonic or detuned with noise in its attack, every envelope from zero
 * to zero, nothing harsh above ~7 kHz but glass. Her light is glass and air (silver); the firefly's is the lamps'
 * hum (route-play); the cap and the signs speak in soft wood-glass chimes, the firefly's language.
 *
 *   glowChime   a spark of light reaching her: a small glass tick (the router pitches it up the chord by fill)
 *   glowBell    the meter full: a clear bowl note, so "I can kindle now" is heard
 *   kindle      her light given to a moonwick: a slow glass swell that blooms
 *   kindleRefuse  too little light: one dim flicker of glass
 *   gutter      a moonwick's last seconds: a tick of cooling glass
 *   wickCold    it goes out: a frost breath
 *   fan         a gust fans a burning moonwick: a breath and a shimmer
 *   mossOn / mossOff  lichen ledges appearing (a rising shimmer of fine grains) / going (falling)
 *   gust        her wingbeat that snuffs at range: a low whump and a rush of air
 *   gustHit     it meets something: a soft pat of air
 *   bellChime   the cap struck in the dark: a wooden glass bell (pitched per ring by the router)
 *   bellDull    struck with a lamp burning near: a muffled knock that counts nothing
 *   bellAnswer  the phrase: a chord blooming out of the cap
 *   signNote    a firefly sign flashing its phrase: a soft high chime per flash
 *   mendDraw / mendLand  light drawn into her while she holds; the mend landing (a warm bowl)
 */
import { at, bowl, click, exp, len, type Recipe, rubbed, swell } from './bake-lib';
import { arEnv, biquad, mixInto, modes, normalize, pink, shape, white } from './dsp';
import { PITCH } from './tuning';

export const LR_SOUNDS = {
  glowChime: 4,
  glowBell: 2,
  kindle: 2,
  kindleRefuse: 3,
  gutter: 4,
  wickCold: 2,
  fan: 3,
  mossOn: 3,
  mossOff: 2,
  gust: 4,
  gustHit: 3,
  bellChime: 4,
  bellDull: 3,
  bellAnswer: 1,
  signNote: 4,
  mendDraw: 2,
  mendLand: 2,
  // The Gloamweaver's fight: a heartbeat under it, and its hiss as it rears.
  pulse: 3,
  hiss: 3,
} as const;
export type LrSoundId = keyof typeof LR_SOUNDS;

/** Noise through a band-pass whose centre follows `f(t)`, shaped by `env`. */
function swept(
  sr: number,
  r: () => number,
  d: number,
  f: (t: number) => number,
  q: number,
  env: (t: number) => number,
): Float32Array {
  const x = pink(len(sr, d), r);
  biquad(x, sr, 'bandpass', (i) => f(i / sr), q);
  return shape(x, sr, env);
}

/** Low-passed noise: a push of air. */
function push(sr: number, r: () => number, d: number, hz: number, env: (t: number) => number): Float32Array {
  const x = white(len(sr, d), r);
  biquad(x, sr, 'lowpass', hz);
  biquad(x, sr, 'lowpass', hz);
  return shape(x, sr, env);
}

/** Mixes parts (each normalized first) at the given weights. */
function blend(parts: Array<[Float32Array, number, number?]>): Float32Array[] {
  const n = Math.max(...parts.map(([x, , o]) => x.length + (o ?? 0)));
  const out = new Float32Array(n);
  for (const [x, g, o] of parts) {
    normalize([x]);
    mixInto(out, x, g, o ?? 0);
  }
  return normalize([out]);
}

/** Fine glass grains spread over `d` s, their pitch walking from `f0` to `f1`: a shimmer. */
function shimmer(
  sr: number,
  r: () => number,
  d: number,
  f0: number,
  f1: number,
  count: number,
): Float32Array {
  const x = new Float32Array(len(sr, d + 0.3));
  for (let k = 0; k < count; k++) {
    const u = k / count;
    const t = d * u + (r() - 0.5) * 0.02;
    const f = exp(f0, f1, u) * (0.96 + 0.08 * r());
    modes(
      x,
      sr,
      [
        { f, tau: 0.05 + 0.08 * r(), amp: 0.4 + 0.6 * r(), ph: r() },
        { f: f * 2.71, tau: 0.03, amp: 0.2, ph: r() },
      ],
      at(sr, Math.max(0, t)),
      0.0006,
    );
  }
  return shape(x, sr, arEnv(0.002, 0, 1e3, d + 0.3));
}

/** A small struck glass: a tick with two inharmonic partials and a breath of noise in its attack. */
function glass(sr: number, r: () => number, d: number, f: number, tau: number): Float32Array {
  const x = new Float32Array(len(sr, d));
  modes(
    x,
    sr,
    [
      { f, tau, amp: 1, beat: 1.1, ph: r() },
      { f: f * 2.32, tau: tau * 0.5, amp: 0.35, ph: r() },
      { f: f * 3.91, tau: tau * 0.25, amp: 0.12, ph: r() },
    ],
    0,
    0.002,
  );
  mixInto(x, click(sr, r, len(sr, 0.03), 4000, 0.004), 0.12);
  return shape(x, sr, arEnv(0.001, 0, 1e3, d));
}

export const LR_RECIPES: Record<LrSoundId, Recipe> = {
  glowChime(sr, r) {
    return normalize([glass(sr, r, 0.45, PITCH.A4 * 2 * (0.995 + 0.01 * r()), 0.16)]);
  },
  glowBell(sr, r) {
    const n = len(sr, 2.2);
    return normalize([bowl(sr, r, n, PITCH.E5, 3, 0.45)]);
  },
  kindle(sr, r) {
    const d = 1.8;
    const n = len(sr, d);
    // A rubbed glass swelling in, a high bowl blooming over it, a breath of air as the light leaves her.
    const rub = rubbed(sr, r, n, PITCH.A4 * 2, swell(0.35, 0.6, d), { breath: 1.2, pure: 0.5 });
    const bloom = bowl(sr, r, n, PITCH.E5 * 2, 2, 0.35);
    const air = swept(sr, r, 0.6, (t) => exp(600, 2600, t / 0.4), 1.2, arEnv(0.12, 0.05, 0.18, 0.6));
    return blend([
      [rub, 0.8],
      [bloom, 0.55, at(sr, 0.22)],
      [air, 0.35],
    ]);
  },
  kindleRefuse(sr, r) {
    return normalize([glass(sr, r, 0.25, PITCH.A4 * (0.99 + 0.02 * r()), 0.05)], 0.5);
  },
  gutter(sr, r) {
    return normalize([glass(sr, r, 0.18, PITCH.B5 * 1.5 * (0.97 + 0.06 * r()), 0.03)]);
  },
  wickCold(sr, r) {
    const d = 0.7;
    const frost = swept(sr, r, d, (t) => exp(3200, 900, t / 0.5), 2.5, arEnv(0.04, 0.05, 0.2, d));
    return blend([
      [frost, 1],
      [glass(sr, r, 0.4, PITCH.E5 * 1.5, 0.08), 0.3],
    ]);
  },
  fan(sr, r) {
    const d = 0.6;
    return blend([
      [swept(sr, r, d, (t) => exp(500, 1800, t / 0.3), 0.9, arEnv(0.05, 0.05, 0.15, d)), 1],
      [shimmer(sr, r, 0.3, PITCH.A4 * 4, PITCH.E5 * 4, 9), 0.4],
    ]);
  },
  mossOn(sr, r) {
    return normalize([shimmer(sr, r, 0.55, PITCH.D4 * 4, PITCH.A4 * 4, 22)], 0.8);
  },
  mossOff(sr, r) {
    return normalize([shimmer(sr, r, 0.45, PITCH.A4 * 4, PITCH.D4 * 2, 14)], 0.7);
  },
  gust(sr, r) {
    const d = 0.55;
    const whump = push(sr, r, d, 180, arEnv(0.01, 0.02, 0.09, d));
    const rush = swept(
      sr,
      r,
      d,
      (t) => exp(380 + r() * 80, 1500, t / 0.12) * (t > 0.12 ? exp(1, 0.6, (t - 0.12) / 0.3) : 1),
      1.1,
      arEnv(0.015, 0.02, 0.12, d),
    );
    return blend([
      [whump, 1],
      [rush, 0.75],
    ]);
  },
  gustHit(sr, r) {
    const d = 0.2;
    return blend([[push(sr, r, d, 500, arEnv(0.004, 0.006, 0.04, d)), 1]]);
  },
  bellChime(sr, r) {
    // A cap is wood and gill: a woody strike, then a hollow glassy ring (inharmonic, a little beating).
    const d = 1.6;
    const x = new Float32Array(len(sr, d));
    const f = PITCH.D4 * 2 * (0.998 + 0.004 * r());
    modes(
      x,
      sr,
      [
        { f, tau: 0.7, amp: 1, beat: 0.8, ph: r() },
        { f: f * 2.43, tau: 0.35, amp: 0.4, beat: 1.4, ph: r() },
        { f: f * 4.07, tau: 0.15, amp: 0.15, ph: r() },
        { f: f * 0.5, tau: 0.25, amp: 0.3, ph: r() },
      ],
      0,
      0.002,
    );
    mixInto(x, click(sr, r, len(sr, 0.04), 1800, 0.006), 0.25);
    return normalize([shape(x, sr, arEnv(0.001, 0, 1e3, d))]);
  },
  bellDull(sr, r) {
    const d = 0.3;
    const x = new Float32Array(len(sr, d));
    modes(x, sr, [
      { f: 180 + r() * 20, tau: 0.05, amp: 1, ph: r() },
      { f: 410, tau: 0.03, amp: 0.4, ph: r() },
    ]);
    biquad(x, sr, 'lowpass', 900);
    mixInto(x, push(sr, r, d, 400, arEnv(0.002, 0.004, 0.03, d)), 0.6);
    return normalize([shape(x, sr, arEnv(0.001, 0, 1e3, d))]);
  },
  bellAnswer(sr, r) {
    const d = 4;
    const n = len(sr, d);
    const notes = [PITCH.D4, PITCH.A4, PITCH.E5, PITCH.A4 * 2];
    const out = new Float32Array(n);
    notes.forEach((f, k) => {
      mixInto(out, bowl(sr, r, n, f, 3, 0.7), 0.6, at(sr, k * 0.11));
    });
    mixInto(out, shimmer(sr, r, 1.2, PITCH.A4 * 4, PITCH.E5 * 4, 30), 0.3);
    return normalize([shape(out, sr, arEnv(0.002, 0, 1e3, d))]);
  },
  signNote(sr, r) {
    return normalize([glass(sr, r, 0.6, PITCH.E5 * 2 * (0.997 + 0.006 * r()), 0.22)]);
  },
  mendDraw(sr, r) {
    const d = 0.7;
    const n = len(sr, d);
    return blend([
      [rubbed(sr, r, n, PITCH.A4, swell(0.5, 0.1, d), { breath: 1.4, pure: 0.35 }), 1],
      [swept(sr, r, d, (t) => exp(2400, 700, t / 0.6), 2, arEnv(0.2, 0.3, 0.08, d)), 0.5],
    ]);
  },
  mendLand(sr, r) {
    const n = len(sr, 2);
    return normalize([bowl(sr, r, n, PITCH.D4, 3, 0.5)]);
  },
  pulse(sr, r) {
    // Lub-dub: two deep thumps in the chest (sub and its knock), the second softer, a breath of low air.
    const d = 0.75;
    const x = new Float32Array(len(sr, d));
    for (const [t0, g] of [
      [0, 1],
      [0.21, 0.62],
    ] as const) {
      const f = 44 + r() * 4;
      modes(
        x,
        sr,
        [
          { f, tau: 0.16, amp: g },
          { f: f * 1.6, tau: 0.09, amp: g * 0.55 },
          { f: f * 3.1, tau: 0.03, amp: g * 0.25 },
        ],
        at(sr, t0),
        0.004,
      );
    }
    biquad(x, sr, 'lowpass', 420);
    mixInto(x, push(sr, r, d, 180, arEnv(0.005, 0.02, 0.18, d)), 0.35);
    return normalize([shape(x, sr, arEnv(0.002, 0, 1e3, d))]);
  },
  hiss(sr, r) {
    // A great spider rearing: a chittering hiss (noise sweeping down, fluttered by its mouthparts).
    const d = 0.7;
    const x = swept(sr, r, d, (t) => exp(5200, 1500, t / d), 1.4, arEnv(0.04, 0.1, 0.35, d));
    for (let i = 0; i < x.length; i++)
      x[i] = (x[i] as number) * (0.6 + 0.4 * Math.sin((i / sr) * Math.PI * 2 * 31));
    // (Nothing but glass reaches past ~9 kHz: the hiss stays below it.)
    biquad(x, sr, 'lowpass', 5200);
    biquad(x, sr, 'lowpass', 5200);
    return normalize([x]);
  },
};
