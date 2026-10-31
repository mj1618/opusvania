/**
 * The score (memory/audio.md "The score"; docs/design/levels/canopy-moments.md §5). Silence is the default: music
 * comes only at the hatch's title, the glades (a piece of the theme), an ambush (a regular pulse: regular is the
 * enemy), the den's boss, the great cage's release and the clifftop vista.
 *
 * Home is D, modal; the forest's chord is D A E B in rubbed glass; Wing's motif is A rising to D, then E, F, back to
 * E, on plucked strings, unresolved: she never reaches home on her own. It resolves once, at the vista, harmonised
 * for the first time, and ends on A over D, open, because the journey isn't over.
 *
 * Deterministic and sim-driven like the router: a stateful director fed every sim step (events and snap) by the
 * conductor, live and offline alike. Pieces are bars of notes on a grid of sim frames (`AUDIO.score.beat`; the boss's
 * bar is the Keeper's swing, `bossBeat`). Each bar's notes are emitted as cues (bus `score`) at the bar's start, with
 * delays; a cut (`ScoreStep.cut`) lets go of everything already scheduled (a boss falling, a room left).
 *
 * The round-12 Keeper's names (canopy-moments.md §6) are read loosely so the score attaches when they land: `cageSwing`,
 * `cageFall`, `bossCue` (`intro` / `p2` / `p3`), `bossPhase`, `bossUnlock`. Until then the old burrback's own
 * `enemyWake`, `enemyPhase`, `enemyDie` drive it.
 */
import { releaseFreeze, releaseGreat } from '../render/lantern/release';
import { midiOf, noteOf, type PitchedId } from './bake-music';
import { dbToGain, hash01, salt } from './dsp';
import type { PlayEvent } from './route-play';
import type { AudioSnap, Cue, Layers, RouteContext } from './router';
import { AUDIO } from './tuning';

type Inst = PitchedId | 'drum' | 'colLegno';
/** One note: instrument, MIDI pitch (a drum's variant), start and length in 16ths of the bar, dB, pan, far. */
interface Note {
  i: Inst;
  m: number;
  at: number;
  dur?: number;
  db?: number;
  pan?: number;
  far?: number;
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F#3' -> MIDI. */
export function nm(s: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error(`Bad note ${s}`);
  return (
    12 * (Number(m[3]) + 1) + (NAMES[m[1] as string] as number) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  );
}
const ns = (s: string) => s.split(' ').filter(Boolean).map(nm);

/** Wing's motif (docs/audio-direction.md §2): A rising to D, then E, F, back to E. */
export const MOTIF = ns('A4 D5 E5 F5 E5');

// ---------------------------------------------------------------- the theme ("the Canopy")

interface ThemeBar {
  /** Rubbed-glass chord (held the bar; two halves if `ch2`). */
  ch: string;
  ch2?: string;
  /** Felt left hand: eight eighths. */
  lh: string;
  /** Plucked melody: [16th, note, 16ths]. */
  mel: Array<[number, string, number]>;
}
// The harmony (round 13: the A section was i - VI - iv - V, the most common minor progression there is). Now modal and
// the forest's: D Dorian, whose IV is G MAJOR (its B natural is the forest's chord, D A E B), the sixth with its
// raised eleventh (Bb with E: her motif's E over it), and no leading tone: the turn back is A with its second (B), not
// its third (C#). Only the vista's last turn home keeps a real dominant colour, and it goes home by B flat and C.
const DM9 = { ch: 'D3 A3 E4', lh: 'D2 A2 E3 F3 A3 F3 E3 A2' };
const BB = { ch: 'F3 A3 E4', lh: 'Bb1 F2 A2 D3 F3 D3 A2 F2' };
const GM = { ch: 'G3 B3 D4', lh: 'B1 G2 D3 A3 B3 A3 D3 G2' };
const ASUS = { ch: 'E3 A3 D4', ch2: 'E3 A3 B3', lh: 'A1 E2 A2 D3 E3 B2 A2 E2' };
const C9 = { ch: 'E3 G3 D4', lh: 'C2 G2 D3 E3 G3 E3 D3 G2' };
const FA = { ch: 'F3 A3 C4', lh: 'A1 F2 C3 F3 A3 F3 C3 F2' };
const GA = { ch: 'G3 B3 D4', ch2: 'E3 A3 C#4', lh: 'B1 G2 D3 G2 A1 E2 A2 C#3' };

/** The theme, whole: A (the motif, twice), B (the moths' version, in F), then the motif resolving home. */
export const THEME: ThemeBar[] = [
  {
    ...DM9,
    mel: [
      [0, 'A4', 8],
      [8, 'D5', 4],
      [12, 'E5', 4],
    ],
  },
  {
    ...BB,
    mel: [
      [0, 'F5', 12],
      [12, 'E5', 4],
    ],
  },
  {
    ...GM,
    mel: [
      [0, 'D5', 12],
      [12, 'C5', 4],
    ],
  },
  { ...ASUS, mel: [[0, 'A4', 16]] },
  {
    ...DM9,
    mel: [
      [0, 'A4', 8],
      [8, 'D5', 4],
      [12, 'E5', 4],
    ],
  },
  {
    ...BB,
    mel: [
      [0, 'F5', 4],
      [4, 'G5', 4],
      [8, 'A5', 8],
    ],
  },
  {
    ...C9,
    mel: [
      [0, 'G5', 4],
      [4, 'F5', 4],
      [8, 'E5', 4],
      [12, 'D5', 4],
    ],
  },
  { ...ASUS, mel: [[0, 'E5', 16]] },
  // B: the moths' version of her motif (C F G A G: the same shape in F, the relative major).
  {
    ...BB,
    mel: [
      [0, 'C5', 8],
      [8, 'F5', 4],
      [12, 'G5', 4],
    ],
  },
  {
    ...FA,
    mel: [
      [0, 'A5', 12],
      [12, 'G5', 4],
    ],
  },
  {
    ...GM,
    mel: [
      [0, 'F5', 8],
      [8, 'E5', 4],
      [12, 'D5', 4],
    ],
  },
  { ...ASUS, mel: [[0, 'E5', 16]] },
  {
    ...BB,
    mel: [
      [0, 'C5', 8],
      [8, 'F5', 4],
      [12, 'G5', 4],
    ],
  },
  {
    ...C9,
    mel: [
      [0, 'A5', 8],
      [8, 'C6', 4],
      [12, 'A5', 4],
    ],
  },
  {
    ...GA,
    mel: [
      [0, 'G5', 8],
      [8, 'F5', 4],
      [12, 'E5', 4],
    ],
  },
  // The motif once more, harmonised, and for the first time it goes home.
  {
    ...BB,
    mel: [
      [0, 'A4', 8],
      [8, 'D5', 4],
      [12, 'E5', 4],
    ],
  },
  {
    ...C9,
    mel: [
      [0, 'F5', 12],
      [12, 'E5', 4],
    ],
  },
  { ch: 'D3 A3 E4', lh: 'D2 A2 D3 E3 A3 E3 D3 A2', mel: [[0, 'D5', 16]] },
];

/** Bars of a theme bar `b` at `level` (2 the glade's soft pieces, 3 the vista: harmonised in full). */
function themeBar(b: ThemeBar, k: number, level: number, d: Dice): Note[] {
  const out: Note[] = [];
  const two = !!b.ch2;
  ns(b.ch).forEach((m, j) => {
    out.push({ i: 'glass', m, at: 0, dur: two ? 8 : 17, db: -2 - j, pan: -0.4 + 0.4 * j });
  });
  if (b.ch2)
    ns(b.ch2).forEach((m, j) => {
      out.push({ i: 'glass', m, at: 8, dur: 9, db: -2 - j, pan: -0.4 + 0.4 * j });
    });
  const lh = ns(b.lh);
  lh.forEach((m, j) => {
    if (level < 3 && j % 2 === 1) return;
    out.push({ i: 'felt', m, at: j * 2 + d.jit(j, 0.25), db: (j === 0 ? 0 : -5) + d.vel(j), pan: -0.2 });
  });
  for (const [at, n, dur] of b.mel)
    out.push({ i: 'harp', m: nm(n), at, dur: dur + 2, db: 1 + d.vel(at + 20), pan: 0.12 });
  if (level >= 3) {
    // Harmonised for the first time: bowed strings under her (the root's octave), and doubling her in the B section.
    const root = (lh[0] as number) + 12;
    out.push({ i: 'strings', m: root, at: 0, dur: 16, db: -3, pan: -0.3 });
    if (k >= 8 && k < 15)
      for (const [at, n, dur] of b.mel) out.push({ i: 'strings', m: nm(n) - 12, at, dur, db: -4, pan: 0.3 });
    if (k >= 15)
      for (const [at, n, dur] of b.mel) out.push({ i: 'strings', m: nm(n), at, dur, db: -3, pan: 0.3 });
    if (k === 8 || k === 12) out.push({ i: 'celesta', m: nm('C6'), at: 0, db: -4, pan: 0.4, far: 0.3 });
    if (k === 13) out.push({ i: 'celesta', m: nm('E6'), at: 8, db: -5, pan: 0.4, far: 0.3 });
  }
  return out;
}

// ---------------------------------------------------------------- the pieces

/** Seeded dice for a bar: small timing and velocity drift so no two plays are identical. */
interface Dice {
  jit(k: number, sixteenths: number): number;
  vel(k: number): number;
  u(k: number): number;
}

interface Piece {
  /** Frames per beat (`meter` to the bar: four unless told; a beat is four 16ths). */
  beat: number;
  meter?: number;
  /** Bars it lasts; absent = loops. */
  bars?: number;
  bar(k: number, d: Dice, s: Score): Note[];
}

const bars = (...xs: Note[][]) => xs;

/** The vista: the theme whole, harmonised, resolving; then A over D, open. */
const VISTA: Piece = {
  beat: AUDIO.score.beat,
  bars: THEME.length + 3,
  bar(k, d) {
    const b = THEME[k];
    if (b) return themeBar(b, k, 3, d);
    if (k === THEME.length)
      return [
        ...ns('D3 A3 E4').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 30,
          db: -2 - j,
          pan: -0.4 + 0.4 * j,
        })),
        { i: 'strings', m: nm('D3'), at: 0, dur: 28, db: -4, pan: -0.3 },
        { i: 'felt', m: nm('D2'), at: 0, db: -2, pan: -0.2 },
        { i: 'harp', m: nm('A4'), at: 4, db: -2, pan: 0.15 },
        { i: 'celesta', m: nm('A5'), at: 8, db: -4, pan: 0.35, far: 0.4 },
      ];
    return [];
  },
};

/** The hatch's title: the motif once on plucked string over the forest's chord in glass, held on E. */
const OPENING: Piece = {
  beat: AUDIO.score.beat,
  bars: 4,
  bar(k, d) {
    const mel = MOTIF;
    return (
      bars(
        [
          ...ns('D3 A3 E4 B4').map((m, j) => ({
            i: 'glass' as const,
            m,
            at: 0,
            dur: 44,
            db: -3 - j,
            pan: -0.45 + 0.3 * j,
          })),
          { i: 'harp', m: mel[0] as number, at: 0, dur: 10, db: d.vel(1) },
          { i: 'harp', m: mel[1] as number, at: 8, dur: 6, db: d.vel(2) },
          { i: 'harp', m: mel[2] as number, at: 12, dur: 6, db: d.vel(3) },
        ],
        [
          { i: 'harp', m: mel[3] as number, at: 0, dur: 14, db: 1 + d.vel(4) },
          { i: 'harp', m: mel[4] as number, at: 12, dur: 28, db: d.vel(5) },
          { i: 'felt', m: nm('D2'), at: 0, db: -8, pan: -0.25 },
        ],
        [{ i: 'celesta', m: nm('B5'), at: 6, db: -8, pan: 0.4, far: 0.7 }],
        [],
      )[k] ?? []
    );
  },
};

/** The glades' pieces of the theme (a rest, a find): two bars, one of three shapes, soft. */
const GLADE: Piece = {
  beat: AUDIO.score.beat,
  bars: 3,
  bar(k, d, s) {
    const which = s.gladeShape;
    const pick = which === 0 ? [0, 1] : which === 1 ? [8, 9] : [6, 7];
    const b = THEME[pick[k] ?? -1];
    if (!b) return [];
    return themeBar(b, pick[k] as number, 2, d).map((n) => ({ ...n, db: (n.db ?? 0) - 3, far: 0.25 }));
  },
};

/** An ambush: col legno, exact sixteenths; a tremolo pedal on D, then E flat; the falling fourth; a drum. */
const tension = (level: number): Piece => ({
  beat: AUDIO.score.beat,
  bar(k, d) {
    const eb = k % 4 === 2;
    const root = eb ? nm('Eb2') : nm('D2');
    const fifthBelow = eb ? nm('Bb1') : nm('A1');
    const out: Note[] = [];
    for (let j = 0; j < 16; j++) {
      const acc = j === 0 || j === 8 ? 0 : j === 6 || j === 14 ? -4 : -9;
      out.push({ i: 'colLegno', m: j % 4, at: j, db: acc + d.vel(j) * 0.5 - (level < 2 ? 2 : 0), pan: 0.25 });
    }
    out.push(
      { i: 'trem', m: root, at: 0, dur: 17, db: -1, pan: -0.3 },
      { i: 'trem', m: root + 7, at: 0, dur: 17, db: -5, pan: -0.1 },
    );
    out.push(
      { i: 'marc', m: root, at: 0, dur: 8, db: -2, pan: -0.2 },
      { i: 'marc', m: fifthBelow, at: 10, dur: 6, db: -4, pan: -0.2 },
    );
    out.push({ i: 'drum', m: 0, at: 0, db: -4 });
    if (level >= 2) {
      out.push({ i: 'drum', m: 2, at: 8, db: -3 }, { i: 'drum', m: 1, at: 14, db: -8 });
      const cl = k % 4 < 2 ? ns('F5 G5') : ns('E5 F5');
      cl.forEach((m, j) => {
        out.push({ i: 'trem', m, at: 0, dur: 17, db: -9, pan: 0.35 - 0.2 * j });
      });
    }
    return out;
  },
});

/** An ambush cleared: the forest's chord comes back, and the motif's first rising steps. */
const CLEAR: Piece = {
  beat: AUDIO.score.beat,
  bars: 2,
  bar(k) {
    if (k > 0) return [];
    return [
      ...ns('D3 A3 E4').map((m, j) => ({
        i: 'glass' as const,
        m,
        at: 0,
        dur: 26,
        db: -3 - j,
        pan: -0.4 + 0.4 * j,
      })),
      { i: 'harp', m: nm('A4'), at: 0 },
      { i: 'harp', m: nm('D5'), at: 2 },
      { i: 'harp', m: nm('E5'), at: 4, dur: 24 },
      { i: 'drum', m: 0, at: 0, db: -10 },
    ];
  },
};

const BB_ = AUDIO.score.bossBeat;
/** The den's boss wakes: a blow, the bass's low D, a tremolo rising out of the dark. */
const WAKE: Piece = {
  beat: BB_,
  bars: 1,
  bar() {
    return [
      { i: 'drum', m: 3, at: 0, db: 2 },
      { i: 'marc', m: nm('D1'), at: 0, dur: 12, db: 0, pan: -0.2 },
      { i: 'marc', m: nm('D2'), at: 0, dur: 12, db: -3, pan: 0.1 },
      { i: 'trem', m: nm('A2'), at: 2, dur: 14, db: -3, pan: -0.3 },
      { i: 'trem', m: nm('D3'), at: 6, dur: 10, db: -5, pan: 0.2 },
      { i: 'strings', m: nm('Eb3'), at: 8, dur: 8, db: -6, pan: 0.35 },
    ];
  },
};

/**
 * The Keeper's harmony (round 13: retimed to the longer fight). Over a D pedal, as the den's floor is the great cage's
 * hum over D3: D minor, its fourth over D, the flat second over D (the Phrygian dread), then the falling fourth's A.
 * P2's bar is one swing of the cage (three swings = its shortest P2), so its phrase is three bars; P3 is four.
 */
const P1_ROOTS = ['D2', 'D2', 'D2', 'A1'];
const P1_PAD = ['D3 F3 A3', 'D3 G3 Bb3', 'Eb3 G3 Bb3', 'E3 A3 C#4'];
const P2_ROOTS = ['D2', 'Bb1', 'A1'];
const P2_PAD = ['D3 F3 A3', 'D3 F3 Bb3', 'C#3 E3 A3'];
const P3_ROOTS = ['D2', 'Bb1', 'Eb2', 'A1'];
const P3_PAD = ['D3 F3 A3', 'D3 F3 Bb3', 'Eb3 G3 Bb3', 'E3 A3 C#4'];
/** The threatened motif (P2): hers, sinking chromatically over the three swings. */
const P2_MEL: Array<Array<[number, string, number]>> = [
  [
    [0, 'A4', 4],
    [4, 'D5', 4],
    [8, 'E5', 4],
    [12, 'F5', 4],
  ],
  [
    [0, 'E5', 8],
    [8, 'Eb5', 8],
  ],
  [
    [0, 'D5', 8],
    [8, 'C#5', 8],
  ],
];

/**
 * The boss (canopy-moments.md Moment 6). P1: earth knocks on its gait over the pedal, the great cage's hum the floor
 * (the lamp voice), growing the longer it lasts (col legno eighths from the second bar, sixteenths from the fifth).
 * P2: a bar is one swing (knocks at both ends), tremolo high up that only the light lets through (score.ts `shape`:
 * in the dark the score closes in with the world), her motif sinking over the three swings, on strings, then in felt
 * octaves. P3: full tension, eighths, the motif fast in felt octaves, a cluster up high, a bass ostinato from bar 5.
 */
const boss = (phase: number): Piece => ({
  beat: BB_,
  bar(k, d, s) {
    const out: Note[] = [];
    if (phase === 1) {
      const j4 = k % 4;
      const root = nm(P1_ROOTS[j4] as string);
      out.push({ i: 'marc', m: root, at: 0, dur: 10, db: -1, pan: -0.25 });
      out.push({ i: 'strings', m: nm('D3'), at: 0, dur: 16, db: -6, pan: -0.35 });
      ns(P1_PAD[j4] as string).forEach((m, j) => {
        out.push({ i: 'strings', m: m + 12, at: 0, dur: 16, db: -9 - j, pan: -0.2 + 0.3 * j });
      });
      out.push(
        { i: 'drum', m: 2, at: 0, db: -1 },
        { i: 'drum', m: 0, at: 6, db: -9 },
        { i: 'drum', m: 1, at: 8, db: -4 },
      );
      if (j4 === 3) out.push({ i: 'drum', m: 0, at: 12, db: -8 }, { i: 'drum', m: 1, at: 14, db: -6 });
      // (r14: after its rage beat it is angry to the end: sixteenths at once, the drum pushing every eighth, the flat
      // second high over it, the bass in driving octaves. The fight changed and the music says so.)
      const mad = s.angry >= 2;
      const step = k >= 4 || mad ? 1 : 2;
      if (mad) {
        for (let j = 2; j < 16; j += 4) out.push({ i: 'drum', m: 0, at: j, db: -8 });
        ns('Eb5 E5').forEach((m, j) => {
          out.push({ i: 'trem', m, at: 0, dur: 17, db: -10 - j, pan: 0.4 - 0.3 * j });
        });
        for (let j = 0; j < 8; j++)
          out.push({ i: 'marc', m: root + (j % 2 === 1 ? 12 : 0), at: j * 2, dur: 2, db: -8, pan: -0.1 });
      }
      if (k >= 1 || mad)
        for (let j = 0; j < 16; j += step)
          out.push({
            i: 'colLegno',
            m: j % 4,
            at: j,
            db: (j % 8 === 0 ? -3 : j % 2 === 0 ? -10 : -15) + d.vel(j),
            pan: 0.3,
          });
      return out;
    }
    if (phase === 2) {
      const j3 = k % 3;
      const cycle = Math.floor(k / 3);
      const root = nm(P2_ROOTS[j3] as string);
      out.push({ i: 'marc', m: root, at: 0, dur: 10, db: -1, pan: -0.25 });
      out.push({ i: 'marc', m: root + 7, at: 8, dur: 6, db: -4, pan: -0.25 });
      ns(P2_PAD[j3] as string).forEach((m, j) => {
        out.push({ i: 'strings', m, at: 0, dur: 16, db: -7 - j, pan: -0.3 + 0.3 * j });
        out.push({ i: 'trem', m: m + 12, at: 0, dur: 17, db: -7 - j, pan: 0.1 + 0.2 * j });
      });
      // The swing's two ends land on 1 and 3.
      out.push({ i: 'drum', m: 3, at: 0, db: 0 }, { i: 'drum', m: 2, at: 8, db: -2 });
      for (let j = 0; j < 16; j++)
        out.push({ i: 'colLegno', m: j % 4, at: j, db: (j % 4 === 0 ? -4 : -12) + d.vel(j), pan: 0.3 });
      // The light's own register: a high cluster the dark filters away.
      ns(j3 === 2 ? 'E5 F5' : 'F5 G5').forEach((m, j) => {
        out.push({ i: 'trem', m: m + 12, at: 0, dur: 17, db: -10, pan: 0.4 - 0.25 * j });
      });
      for (const [at, n, dur] of P2_MEL[j3] ?? []) {
        if (cycle % 2 === 0) out.push({ i: 'strings', m: nm(n), at, dur, db: -1, pan: 0.2 });
        else {
          out.push({ i: 'felt', m: nm(n), at, dur: dur + 2, db: -1 + d.vel(at), pan: 0.15 });
          out.push({ i: 'felt', m: nm(n) - 12, at, dur: dur + 2, db: -5, pan: 0.05 });
        }
      }
      return out;
    }
    // P3: eighths on the drum, the cluster, her motif fast in felt octaves; the fallen cage's hum is an octave down.
    const j4 = k % 4;
    const root = nm(P3_ROOTS[j4] as string);
    out.push({ i: 'marc', m: root, at: 0, dur: 10, db: 0, pan: -0.25 });
    out.push({ i: 'marc', m: root - 5 < 26 ? root + 7 : root - 5, at: 8, dur: 6, db: -3, pan: -0.25 });
    ns(P3_PAD[j4] as string).forEach((m, j) => {
      out.push({ i: 'strings', m, at: 0, dur: 16, db: -5 - j, pan: -0.3 + 0.3 * j });
      out.push({ i: 'trem', m: m + 12, at: 0, dur: 17, db: -7 - j, pan: 0.1 + 0.2 * j });
    });
    out.push({ i: 'drum', m: 3, at: 0, db: 0 }, { i: 'drum', m: 2, at: 8, db: -2 });
    for (let j = 2; j < 16; j += 2)
      if (j !== 8) out.push({ i: 'drum', m: j % 4 === 0 ? 1 : 0, at: j, db: -7 });
    for (let j = 0; j < 16; j++)
      out.push({ i: 'colLegno', m: j % 4, at: j, db: (j % 4 === 0 ? -4 : -12) + d.vel(j), pan: 0.3 });
    ns('E5 F5').forEach((m, j) => {
      out.push({ i: 'trem', m, at: 0, dur: 17, db: -8, pan: 0.4 - 0.25 * j });
    });
    const fast = ns(j4 % 2 === 0 ? 'A4 D5 E5 F5 E5 D5 C#5 D5' : 'A4 D5 E5 F5 G5 F5 E5 Eb5');
    fast.forEach((m, j) => {
      out.push({ i: 'felt', m, at: j * 2, db: -1 + d.vel(j), pan: 0.15 });
      out.push({ i: 'felt', m: m + 12, at: j * 2, db: -7, pan: 0.25 });
    });
    if (k >= 4)
      for (let j = 0; j < 8; j++)
        out.push({ i: 'marc', m: root + (j % 2 === 1 ? 12 : 0), at: j * 2, dur: 2, db: -9, pan: -0.1 });
    return out;
  },
});

/**
 * The great cage let go (r14: the area's peak): the column of freed moths rising into the moonbeam through the roof,
 * ~3 s alone before the roof gives. Wing's motif, for the first time carried to its end: A D E F E over B flat and C
 * (the theme's way home), then home to D, under it the one major chord in the area (D with its F sharp: the real
 * light), the forest's chord up in the moon's register and the celesta climbing after the moths. 150 bpm, 16th =
 * 0.1 s, so the resolution lands 1.6 s into the column and rings until the escape takes over.
 */
const COLUMN: Piece = {
  beat: AUDIO.score.columnBeat,
  bars: 3,
  bar(k, d) {
    if (k === 0)
      return [
        ...ns('F3 A3 D4').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 8,
          db: -2 - j,
          pan: -0.4 + 0.4 * j,
        })),
        ...ns('E3 G3 C4').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 8,
          dur: 9,
          db: -2 - j,
          pan: -0.4 + 0.4 * j,
        })),
        { i: 'felt', m: nm('Bb1'), at: 0, db: 0, pan: -0.25 },
        { i: 'felt', m: nm('F2'), at: 4, db: -6, pan: -0.2 },
        { i: 'felt', m: nm('C2'), at: 8, db: -1, pan: -0.25 },
        { i: 'felt', m: nm('G2'), at: 12, db: -6, pan: -0.2 },
        { i: 'strings', m: nm('Bb2'), at: 0, dur: 8, db: -3, pan: -0.3 },
        { i: 'strings', m: nm('D3'), at: 0, dur: 8, db: -7, pan: -0.1 },
        { i: 'strings', m: nm('C3'), at: 8, dur: 8, db: -2, pan: -0.3 },
        { i: 'strings', m: nm('E3'), at: 8, dur: 8, db: -6, pan: -0.1 },
        // Her motif, plucked, the bowed section an octave under her (it is everyone's now).
        { i: 'harp', m: nm('A4'), at: 0, dur: 5, db: 2 + d.vel(1), pan: 0.12 },
        { i: 'harp', m: nm('D5'), at: 5, dur: 3, db: 1 + d.vel(2), pan: 0.12 },
        { i: 'harp', m: nm('E5'), at: 8, dur: 2, db: 1 + d.vel(3), pan: 0.12 },
        { i: 'harp', m: nm('F5'), at: 10, dur: 3, db: 2 + d.vel(4), pan: 0.12 },
        { i: 'harp', m: nm('E5'), at: 13, dur: 3, db: 1 + d.vel(5), pan: 0.12 },
        { i: 'strings', m: nm('A3'), at: 0, dur: 5, db: -5, pan: 0.25 },
        { i: 'strings', m: nm('D4'), at: 5, dur: 3, db: -4, pan: 0.25 },
        { i: 'strings', m: nm('E4'), at: 8, dur: 2, db: -4, pan: 0.25 },
        { i: 'strings', m: nm('F4'), at: 10, dur: 3, db: -3, pan: 0.25 },
        { i: 'strings', m: nm('E4'), at: 13, dur: 3, db: -3, pan: 0.25 },
      ];
    if (k === 1)
      return [
        // Home: D, its F sharp once, the forest's chord in the moon's register; the celesta climbs after the moths.
        { i: 'harp', m: nm('D5'), at: 0, dur: 20, db: 3, pan: 0.12 },
        { i: 'harp', m: nm('D4'), at: 0, dur: 20, db: -3, pan: 0.05 },
        { i: 'strings', m: nm('D5'), at: 0, dur: 18, db: -2, pan: 0.25 },
        { i: 'strings', m: nm('D2'), at: 0, dur: 26, db: -1, pan: -0.3 },
        { i: 'strings', m: nm('A2'), at: 0, dur: 26, db: -4, pan: -0.15 },
        { i: 'strings', m: nm('F#3'), at: 0, dur: 26, db: -5, pan: 0.05 },
        { i: 'strings', m: nm('A3'), at: 0, dur: 26, db: -7, pan: 0.2 },
        { i: 'felt', m: nm('D2'), at: 0, db: 1, pan: -0.25 },
        { i: 'felt', m: nm('A2'), at: 4, db: -5, pan: -0.2 },
        { i: 'felt', m: nm('D3'), at: 8, db: -6, pan: -0.15 },
        { i: 'felt', m: nm('E3'), at: 12, db: -7, pan: -0.1 },
        ...ns('D4 A4 E5 B5').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 30,
          db: -1 - j,
          pan: -0.45 + 0.3 * j,
        })),
        ...ns('D6 E6 A6 B6 D7').map((m, j) => ({
          i: 'celesta' as const,
          m,
          at: 4 + 2 * j + d.jit(j, 0.3),
          db: -5 - j * 0.8,
          pan: 0.1 + 0.1 * j,
          far: 0.25 + 0.12 * j,
        })),
      ];
    if (k === 2)
      return [
        { i: 'celesta', m: nm('A6'), at: 0, db: -10, pan: 0.5, far: 0.8 },
        { i: 'celesta', m: nm('E6'), at: 6, db: -12, pan: 0.55, far: 0.85 },
      ];
    return [];
  },
};

/**
 * The escape (r14, moment 7): the area's one driving music, 150 bpm, while the roof comes down behind her. The
 * theme's heroic turn (D minor, B flat, C, A) under a bass in eighths and a galloping drum; her motif in octaves on
 * the bowed section (bars 1-4), then the moths' version of it (bars 5-8) with the harp running sixteenths over it
 * (the cloud leading her up). Layers by her progress (checkpoints) and by how near the front is under her.
 */
const ESC_ROOTS = ['D2', 'Bb1', 'C2', 'A1', 'Bb1', 'A1', 'G1', 'A1'];
const ESC_PAD = [
  'D4 F4 A4',
  'D4 F4 Bb4',
  'E4 G4 C5',
  'E4 A4 C#5',
  'D4 F4 Bb4',
  'C4 F4 A4',
  'D4 G4 Bb4',
  'E4 A4 C#5',
];
const ESC_MEL: Array<Array<[number, string, number]>> = [
  [
    [0, 'A4', 4],
    [4, 'D5', 4],
    [8, 'E5', 8],
  ],
  [
    [0, 'F5', 12],
    [12, 'E5', 4],
  ],
  [
    [0, 'D5', 4],
    [4, 'E5', 4],
    [8, 'F5', 4],
    [12, 'G5', 4],
  ],
  [
    [0, 'A5', 12],
    [12, 'E5', 4],
  ],
  [
    [0, 'C5', 4],
    [4, 'F5', 4],
    [8, 'G5', 8],
  ],
  [
    [0, 'A5', 12],
    [12, 'G5', 4],
  ],
  [
    [0, 'F5', 4],
    [4, 'E5', 4],
    [8, 'D5', 8],
  ],
  [[0, 'E5', 16]],
];
/** The den's floor run (r14's drive): her motif in octaves, then the moths' version with the harp running. */
function escRun(k: number, d: Dice, s: Score): Note[] {
  const j8 = k % 8;
  const root = nm(ESC_ROOTS[j8] as string);
  const pad = ns(ESC_PAD[j8] as string);
  const near = escNear(s);
  const out: Note[] = [];
  if (k === 0)
    out.push({ i: 'drum', m: 3, at: 0, db: 2 }, { i: 'marc', m: nm('D1') + 12, at: 0, dur: 6, db: 0 });
  // The bass: eighths, octaves on the off-beats that push.
  [0, 0, 12, 0, 0, 12, 0, 12].forEach((o, j) => {
    out.push({
      i: 'marc',
      m: root + o,
      at: j * 2,
      dur: 2,
      db: (j % 4 === 0 ? -1 : -6) + d.vel(j) * 0.4,
      pan: -0.2,
    });
  });
  out.push({ i: 'strings', m: root + 12, at: 0, dur: 16, db: -6, pan: -0.3 });
  pad.forEach((m, j) => {
    out.push({ i: 'trem', m, at: 0, dur: 17, db: -8 - j, pan: 0.1 + 0.2 * j });
  });
  // The gallop.
  out.push(
    { i: 'drum', m: 2, at: 0, db: -1 },
    { i: 'drum', m: 0, at: 6, db: -8 },
    { i: 'drum', m: 1, at: 8, db: -3 },
    { i: 'drum', m: 0, at: 12, db: -9 },
    { i: 'drum', m: 0, at: 14, db: -6 },
  );
  for (let j = 0; j < 16; j++)
    out.push({ i: 'colLegno', m: j % 4, at: j, db: (j % 4 === 0 ? -5 : -13) + d.vel(j + 20), pan: 0.3 });
  // The melody: her motif then theirs, the bowed section in octaves, felt doubling it once she is on her way.
  for (const [at, n, dur] of ESC_MEL[j8] ?? []) {
    out.push({ i: 'strings', m: nm(n), at, dur, db: -1, pan: 0.2 });
    out.push({ i: 'strings', m: nm(n) - 12, at, dur, db: -5, pan: 0.1 });
    if (s.escCp >= 1 || k >= 4)
      out.push({ i: 'felt', m: nm(n), at, dur: dur + 1, db: -3 + d.vel(at), pan: 0.15 });
  }
  // The cloud leading her: the harp running up the chord in sixteenths (the moths' half, and once she climbs).
  if (j8 >= 4 || s.escCp >= 2) {
    const arp = [...pad, ...pad.map((m) => m + 12)];
    for (let j = 0; j < 16; j++)
      out.push({
        i: 'harp',
        m: arp[j % arp.length] as number,
        at: j + d.jit(j, 0.1),
        dur: 1.5,
        db: -7 + (j % 4 === 0 ? 1 : 0) + d.vel(j + 40) * 0.5,
        pan: 0.35,
      });
  }
  // The front close under her: the flat second screaming high.
  if (near)
    ns('Eb6 E6').forEach((m, j) => {
      out.push({ i: 'trem', m, at: 0, dur: 17, db: -9 - j, pan: 0.45 - 0.3 * j });
    });
  return out;
}

/** The front creeping close under her (r15: it keeps ~240 px and creeps to 200 while she lingers). */
const escNear = (s: Score) => s.escGap >= 0 && s.escGap < AUDIO.score.escapeNearPx;

/** The front close under her: the flat second screaming high. */
function escScream(out: Note[]): void {
  ns('Eb6 E6').forEach((m, j) => {
    out.push({ i: 'trem', m, at: 0, dur: 17, db: -9 - j, pan: 0.45 - 0.3 * j });
  });
}

/**
 * r15: the way down (the corridor, the pocket, the root shaft, the low passage; no front yet). The drive holds its
 * breath: no gallop, a heartbeat drum and the clock of col legno over a D pedal, the cellos sinking chromatically
 * (D C# C B), the flat second held high, and fragments of her motif falling away down the shaft in the harp.
 */
const DOWN_BASS = ['D3', 'C#3', 'C3', 'B2'];
function escDown(kk: number, d: Dice, s: Score): Note[] {
  const out: Note[] = [];
  const j4 = kk % 4;
  if (kk === 0)
    out.push({ i: 'drum', m: 3, at: 0, db: -2 }, { i: 'marc', m: nm('D2'), at: 0, dur: 6, db: -2 });
  for (let j = 0; j < 8; j++)
    out.push({
      i: 'marc',
      m: nm('D2'),
      at: j * 2,
      dur: 1.5,
      db: (j % 4 === 0 ? -6 : -11) + d.vel(j) * 0.4,
      pan: -0.2,
    });
  out.push(
    { i: 'drum', m: 1, at: 0, db: -6 },
    { i: 'drum', m: 0, at: 3, db: -11 },
    { i: 'drum', m: 1, at: 8, db: -8 },
    { i: 'drum', m: 0, at: 11, db: -12 },
  );
  for (let j = 0; j < 16; j++)
    out.push({ i: 'colLegno', m: j % 4, at: j, db: (j % 4 === 0 ? -8 : -16) + d.vel(j + 20), pan: 0.3 });
  out.push({ i: 'strings', m: nm(DOWN_BASS[j4] as string), at: 0, dur: 16, db: -3, pan: -0.3 });
  out.push(
    { i: 'trem', m: nm('D4'), at: 0, dur: 17, db: -11, pan: 0.05 },
    { i: 'trem', m: nm('Eb4'), at: 0, dur: 17, db: -13, pan: 0.3 },
  );
  if (j4 === 2) out.push({ i: 'trem', m: nm('A4'), at: 8, dur: 9, db: -12, pan: 0.2 });
  // Her motif falling away down the shaft, far.
  if (j4 % 2 === 0)
    [
      ['E5', 0],
      ['D5', 3],
      ['A4', 6],
    ].forEach(([n, at], j) => {
      out.push({
        i: 'harp',
        m: nm(n as string) - (j4 === 2 ? 12 : 0),
        at: (at as number) + d.jit(j, 0.15),
        dur: 3,
        db: -5 - j,
        pan: 0.3,
        far: 0.35 + 0.15 * j,
      });
    });
  if (escNear(s)) escScream(out);
  return out;
}

/**
 * r15: the chimney, the earth rising under her. Over an A pedal (the long dominant: home is held back until the
 * clifftop), her motif climbing in sequence (A D E | F G A | B flat A G | A, E). It changes phrase as the earth rises
 * (`climbRise`) and with every phrase she climbs: first the bowed section in octaves, then felt doubling it and the harp
 * running the chord, then the motif in long notes climbing chromatically A B flat C C sharp, everything an octave up,
 * the drum on every eighth. The scream when the front creeps close.
 */
const CLIMB_PAD = ['D4 F4 A4', 'D4 F4 Bb4', 'D4 G4 Bb4', 'C#4 E4 A4'];
const CLIMB_MEL: Array<Array<[number, string, number]>> = [
  [
    [0, 'A4', 4],
    [4, 'D5', 4],
    [8, 'E5', 8],
  ],
  [
    [0, 'F5', 8],
    [8, 'G5', 4],
    [12, 'A5', 4],
  ],
  [
    [0, 'Bb5', 8],
    [8, 'A5', 4],
    [12, 'G5', 4],
  ],
  [
    [0, 'A5', 12],
    [12, 'E5', 4],
  ],
];
const CLIMB_LONG = ['A5', 'Bb5', 'C6', 'C#6'];
function escClimb(kk: number, d: Dice, s: Score): Note[] {
  const out: Note[] = [];
  const j4 = kk % 4;
  const R = AUDIO.score.climbRise;
  const byRise = s.escRise < R[0] ? 0 : s.escRise < R[1] ? 1 : 2;
  const ph = Math.max(byRise, Math.min(2, Math.floor(kk / 4)));
  const root = nm('A1');
  const pad = ns(CLIMB_PAD[j4] as string).map((m) => m + (ph === 2 ? 12 : 0));
  if (kk === 0)
    out.push({ i: 'drum', m: 3, at: 0, db: 3 }, { i: 'marc', m: root, at: 0, dur: 8, db: 1, pan: -0.2 });
  [0, 0, 12, 0, 0, 12, 0, 12].forEach((o, j) => {
    out.push({
      i: 'marc',
      m: root + o + (ph === 2 ? 12 : 0),
      at: j * 2,
      dur: 2,
      db: (j % 4 === 0 ? 0 : -5) + d.vel(j) * 0.4,
      pan: -0.2,
    });
  });
  out.push({ i: 'strings', m: nm('A2'), at: 0, dur: 16, db: -5, pan: -0.3 });
  pad.forEach((m, j) => {
    out.push({ i: 'trem', m, at: 0, dur: 17, db: -7 - j, pan: 0.1 + 0.2 * j });
  });
  out.push(
    { i: 'drum', m: 2, at: 0, db: 0 },
    { i: 'drum', m: 0, at: 6, db: -7 },
    { i: 'drum', m: 1, at: 8, db: -2 },
    { i: 'drum', m: 0, at: 12, db: -8 },
    { i: 'drum', m: 0, at: 14, db: -5 },
  );
  if (ph === 2) for (const at of [2, 4, 10]) out.push({ i: 'drum', m: 0, at, db: -9 + d.vel(at + 60) * 0.5 });
  for (let j = 0; j < 16; j++)
    out.push({
      i: 'colLegno',
      m: j % 4,
      at: j,
      db: (j % 4 === 0 ? -4 : -12) + d.vel(j + 20) + (ph > 0 ? 1 : 0),
      pan: 0.3,
    });
  if (ph < 2)
    for (const [at, n, dur] of CLIMB_MEL[j4] ?? []) {
      const m = nm(n) + (ph === 1 ? 12 : 0);
      out.push({ i: 'strings', m, at, dur, db: 0, pan: 0.2 });
      out.push({ i: 'strings', m: m - 12, at, dur, db: -4, pan: 0.1 });
      if (ph === 1) out.push({ i: 'felt', m: m - 12, at, dur: dur + 1, db: -2 + d.vel(at), pan: 0.15 });
    }
  else {
    const m = nm(CLIMB_LONG[j4] as string);
    out.push(
      { i: 'strings', m, at: 0, dur: 16, db: 1, pan: 0.2 },
      { i: 'strings', m: m - 12, at: 0, dur: 16, db: -3, pan: 0.1 },
      { i: 'felt', m: m - 12, at: 0, dur: 8, db: -1, pan: 0.15 },
      { i: 'felt', m: m - 24, at: 8, dur: 8, db: -4, pan: 0.1 },
    );
  }
  if (ph >= 1) {
    const arp = [...pad, ...pad.map((m) => m + 12)];
    for (let j = 0; j < 16; j++)
      out.push({
        i: 'harp',
        m: arp[j % arp.length] as number,
        at: j + d.jit(j, 0.1),
        dur: 1.5,
        db: -6 + (j % 4 === 0 ? 1 : 0) + d.vel(j + 40) * 0.5,
        pan: 0.35,
      });
  }
  if (escNear(s)) escScream(out);
  return out;
}

/**
 * The escape (r14, moment 7; r15 fitted to the new way out and a person's 25-35 s): the area's one driving music,
 * 150 bpm, in three sections by where she is (`Score.escSec`, each from its own bar 0): the den's floor run (`run`:
 * r14's drive), the way down to the chimney's foot (`down`: the drive holding its breath), the chimney with the earth
 * rising under her (`climb`: an A pedal, phrases by how high the earth has come). It resolves at the clifftop
 * (`escaped`, then the vista's theme).
 */
const ESCAPE: Piece = {
  beat: AUDIO.score.escapeBeat,
  bar(k, d, s) {
    const kk = Math.max(0, k - s.escFrom);
    if (s.escSec === 'down') return escDown(kk, d, s);
    if (s.escSec === 'climb') return escClimb(kk, d, s);
    return escRun(k, d, s);
  },
};

/**
 * Out ahead of it (r14, `escapeEnd`): the drive lets go into the moonlit passage by the theme's way home, B flat and C,
 * and lands on the forest's chord over D with her A on top: open, not her motif (the vista keeps that).
 */
const ESCAPED: Piece = {
  beat: AUDIO.score.escapeBeat,
  bars: 3,
  bar(k) {
    if (k === 0)
      return [
        { i: 'drum', m: 3, at: 0, db: -1 },
        { i: 'felt', m: nm('Bb1'), at: 0, db: 0, pan: -0.25 },
        { i: 'strings', m: nm('Bb2'), at: 0, dur: 8, db: -3, pan: -0.3 },
        ...ns('F3 A3 D4').map((m, j) => ({
          i: 'strings' as const,
          m,
          at: 0,
          dur: 8,
          db: -6 - j,
          pan: 0.1 * j,
        })),
        { i: 'strings', m: nm('F5'), at: 0, dur: 8, db: -2, pan: 0.2 },
        { i: 'felt', m: nm('C2'), at: 8, db: -1, pan: -0.25 },
        { i: 'strings', m: nm('C3'), at: 8, dur: 8, db: -3, pan: -0.3 },
        ...ns('E3 G3 C4').map((m, j) => ({
          i: 'strings' as const,
          m,
          at: 8,
          dur: 8,
          db: -6 - j,
          pan: 0.1 * j,
        })),
        { i: 'strings', m: nm('G5'), at: 8, dur: 8, db: -2, pan: 0.2 },
      ];
    if (k === 1)
      return [
        { i: 'felt', m: nm('D2'), at: 0, db: 0, pan: -0.25 },
        { i: 'felt', m: nm('A2'), at: 6, db: -7, pan: -0.2 },
        { i: 'strings', m: nm('D3'), at: 0, dur: 30, db: -4, pan: -0.3 },
        { i: 'strings', m: nm('A3'), at: 0, dur: 30, db: -6, pan: -0.1 },
        ...ns('D4 A4 E5 B5').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 40,
          db: -2 - j,
          pan: -0.45 + 0.3 * j,
        })),
        { i: 'harp', m: nm('A5'), at: 0, dur: 20, db: 0, pan: 0.15 },
        { i: 'celesta', m: nm('E6'), at: 8, db: -7, pan: 0.4, far: 0.5 },
      ];
    return [];
  },
};

/**
 * An ability found (a glade's grant, a hollow's upgrade): always its moment, whatever played before (round 13: the
 * glide at the crown got nothing, the Grove's glade piece had played 19 s earlier). Her motif over the forest's chord,
 * the bowed section under it for the first time outside the vista, a celesta answering; held on E, unresolved.
 */
const GRANT: Piece = {
  beat: AUDIO.score.beat,
  bars: 4,
  bar(k, d) {
    if (k === 0)
      return [
        ...ns('D3 A3 E4 B4').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 46,
          db: -2 - j,
          pan: -0.45 + 0.3 * j,
        })),
        { i: 'felt', m: nm('D2'), at: 0, db: -2, pan: -0.25 },
        { i: 'strings', m: nm('D3'), at: 0, dur: 40, db: -6, pan: -0.3 },
        { i: 'harp', m: nm('A4'), at: 0, dur: 8, db: 1 + d.vel(1), pan: 0.12 },
        { i: 'harp', m: nm('D5'), at: 6, dur: 4, db: d.vel(2), pan: 0.12 },
        { i: 'harp', m: nm('E5'), at: 9, dur: 4, db: d.vel(3), pan: 0.12 },
        { i: 'harp', m: nm('F5'), at: 12, dur: 6, db: 1 + d.vel(4), pan: 0.12 },
      ];
    if (k === 1)
      return [
        { i: 'harp', m: nm('E5'), at: 0, dur: 30, db: d.vel(5), pan: 0.12 },
        { i: 'felt', m: nm('A2'), at: 0, db: -5, pan: -0.25 },
        { i: 'strings', m: nm('B3'), at: 2, dur: 30, db: -9, pan: 0.25 },
        { i: 'celesta', m: nm('B5'), at: 8, db: -5, pan: 0.4, far: 0.3 },
        { i: 'celesta', m: nm('E6'), at: 12, db: -7, pan: 0.45, far: 0.4 },
      ];
    if (k === 2)
      return [
        { i: 'celesta', m: nm('A5'), at: 4, db: -9, pan: 0.4, far: 0.6 },
        { i: 'felt', m: nm('D2'), at: 0, db: -9, pan: -0.25 },
      ];
    return [];
  },
};

/**
 * The firefly's flight (moment 4): the area's first rhythmic music. Its call (three short, one long) as an ostinato
 * in its own out-of-tune glass (the lamps' 38 cents sharp); while it flies, a low plucked pulse in the forest's tune
 * under it (hers: urging, never a drum kit), and close behind it her harp running the forest's chord; every hook it
 * kindles adds a held tone to a growing out-of-tune chord (stacked fifths past the forest's four: D A E B F# C#,
 * sharp). Waiting for her, the alarm alone. At the nest it stops dead (score.ts `step`).
 */
export const CHASE_CHORD = ns('D4 A4 E5 B5 F#5 C#6');
const SHARP_ST = 0.38;
const CHASE: Piece = {
  beat: AUDIO.score.chaseBeat,
  bar(k, d, s) {
    const out: Note[] = [];
    const n = Math.min(s.kindles, CHASE_CHORD.length);
    const top = (n > 0 ? (CHASE_CHORD[n - 1] as number) : nm('D5')) + 12;
    // (r15: a rest of the chase is a breath too: she hangs at the hook until she presses.)
    const waiting = s.chaseBeat === 3 || s.chaseHold > 0 || s.chaseRest > 0;
    const close = !waiting && s.chaseLead < AUDIO.score.chaseClosePx;
    // The call: three short, one long, twice a bar.
    for (const h of [0, 8])
      [0, 2, 4, 6].forEach((at, j) => {
        out.push({
          i: 'celesta',
          m: (j === 3 ? top - 5 : top) + SHARP_ST,
          at: h + at,
          dur: j === 3 ? 3 : 1,
          db: (j === 3 ? -2 : -5) + d.vel(h + at) * 0.5 - (waiting ? 4 : 0),
          pan: 0.3,
          far: waiting ? 0.4 : 0.1,
        });
      });
    // The kindled hooks' chord, held.
    for (let j = 0; j < n; j++)
      out.push({
        i: 'glass',
        m: (CHASE_CHORD[j] as number) + SHARP_ST,
        at: 0,
        dur: 17,
        db: -4 - j * 0.5,
        pan: -0.4 + 0.16 * j,
      });
    if (waiting) return out;
    // Flying: her pulse under it, in tune.
    out.push(
      { i: 'felt', m: nm('D2'), at: 0, db: -2 + d.vel(1) * 0.5, pan: -0.2 },
      { i: 'felt', m: nm('A1'), at: 6, db: -8, pan: -0.2 },
      { i: 'felt', m: nm('D2'), at: 8, db: -4 + d.vel(2) * 0.5, pan: -0.2 },
      { i: 'felt', m: nm('E2'), at: 14, db: -8, pan: -0.2 },
    );
    if (k % 2 === 1) out.push({ i: 'marc', m: nm('D2'), at: 0, dur: 14, db: -8, pan: -0.3 });
    if (close) {
      const arp = ns(k % 2 === 0 ? 'D4 A4 E5 A4 D5 A4 E5 B4' : 'D4 A4 E5 B5 A4 E5 D5 A4');
      arp.forEach((m, j) => {
        out.push({
          i: 'harp',
          m,
          at: j * 2 + d.jit(j, 0.15),
          dur: 2,
          db: -4 + d.vel(j + 10) * 0.6,
          pan: 0.15,
        });
      });
    }
    return out;
  },
};

/**
 * Moonlight for two (moment 3, `kinSit`; r15 acted beat by beat): the area's only duet, its notes played on the sit's
 * beats (`kinBeat`, score.ts `duetBeat`), so the music and the acting are one scene. Wing's motif plucked as it comes
 * over; the moon in high glass as they look; the kin's line (hammered, brighter, a third above her) as its wings open;
 * its reach for the A as the torn wing tries (a tremolo a quarter-tone flat, straining) and the A breaking off as it
 * fails (the note caught and struck again, flat; a low thud); nothing through the held look but the air; her answer
 * (the motif rising quickly as her wings open) and with it the kin reaching the A in tune; both folding (G F E); the
 * lean: her E held over its D. Unanswered (she walked off), the kin's line alone.
 */
type DuetNote = Note;
const DUET_PHRASES: Record<string, (her: number) => DuetNote[]> = {
  come: () => [
    ...ns('D3 A3 E4').map((m, j) => ({
      i: 'glass' as const,
      m,
      at: 0,
      dur: 40,
      db: -4 - j,
      pan: -0.4 + 0.4 * j,
      far: 0.2,
    })),
    { i: 'harp', m: nm('A4'), at: 0, dur: 6, db: 0, pan: -0.15 },
    { i: 'harp', m: nm('D5'), at: 5, dur: 3, db: -1, pan: -0.15 },
    { i: 'harp', m: nm('E5'), at: 7.5, dur: 3, db: -1, pan: -0.15 },
    { i: 'harp', m: nm('F5'), at: 10, dur: 3, db: 0, pan: -0.15 },
    { i: 'harp', m: nm('E5'), at: 12.5, dur: 10, db: -1, pan: -0.15 },
  ],
  look: () => [
    { i: 'celesta', m: nm('B5'), at: 1, db: -8, pan: 0.4, far: 0.6 },
    { i: 'celesta', m: nm('E6'), at: 4, db: -10, pan: 0.45, far: 0.7 },
  ],
  open: () => [
    { i: 'felt', m: nm('F5'), at: 0, dur: 2, db: -3, pan: 0.2 },
    { i: 'felt', m: nm('E5'), at: 2, dur: 2, db: -4, pan: 0.2 },
    { i: 'felt', m: nm('F5'), at: 4, dur: 3, db: -3, pan: 0.2 },
  ],
  try: () => [
    { i: 'felt', m: nm('G5') - 0.15, at: 0, dur: 2, db: -4, pan: 0.2 },
    { i: 'trem', m: nm('A5') - 0.35, at: 1.5, dur: 4.5, db: -7, pan: 0.25 },
    { i: 'strings', m: nm('A4') - 0.3, at: 1.5, dur: 4.5, db: -10, pan: 0.2 },
  ],
  fail: () => [
    { i: 'felt', m: nm('D2'), at: 0, db: -9, pan: -0.1 },
    { i: 'felt', m: nm('E5') - 0.2, at: 0.3, dur: 0.5, db: -9, pan: 0.2 },
    { i: 'felt', m: nm('E5') - 0.2, at: 1.3, dur: 6, db: -5, pan: 0.2 },
    { i: 'glass', m: nm('A3'), at: 1, dur: 16, db: -9, pan: -0.2, far: 0.3 },
  ],
  turn: () => [
    ...ns('D3 A3').map((m, j) => ({
      i: 'glass' as const,
      m,
      at: 0,
      dur: 12,
      db: -11 - j,
      pan: -0.3 + 0.5 * j,
      far: 0.3,
    })),
  ],
  answer: (her) =>
    her
      ? [
          { i: 'harp', m: nm('A4'), at: 0, dur: 2, db: 1, pan: -0.15 },
          { i: 'harp', m: nm('D5'), at: 1.5, dur: 2, db: 0, pan: -0.15 },
          { i: 'harp', m: nm('E5'), at: 3, dur: 2, db: 0, pan: -0.15 },
          { i: 'harp', m: nm('F5'), at: 4.5, dur: 4, db: 1, pan: -0.15 },
          ...ns('D4 A4 E5 B5').map((m, j) => ({
            i: 'glass' as const,
            m,
            at: 0.5,
            dur: 24,
            db: -6 - j,
            pan: -0.45 + 0.3 * j,
          })),
          { i: 'felt', m: nm('A5'), at: 6, dur: 4, db: -2, pan: 0.2 },
        ]
      : [
          { i: 'felt', m: nm('F5') - 0.2, at: 1, dur: 2, db: -5, pan: 0.2 },
          { i: 'felt', m: nm('E5'), at: 3, dur: 4, db: -6, pan: 0.2 },
        ],
  fold: () => [
    { i: 'felt', m: nm('G5'), at: 0, dur: 2, db: -4, pan: 0.2 },
    { i: 'felt', m: nm('F5'), at: 2, dur: 2, db: -4, pan: 0.2 },
    { i: 'felt', m: nm('E5'), at: 4, dur: 4, db: -4, pan: 0.2 },
  ],
  lean: (her) => [
    ...(her ? [{ i: 'harp' as const, m: nm('E5'), at: 0, dur: 24, db: -1, pan: -0.15 }] : []),
    { i: 'felt', m: nm('D5'), at: 0.5, dur: 24, db: -3, pan: 0.2 },
    { i: 'felt', m: nm('D4'), at: 0.5, dur: 24, db: -10, pan: 0.15, far: 0.2 },
    { i: 'glass', m: nm('A3'), at: 0, dur: 30, db: -8, pan: -0.2, far: 0.3 },
    { i: 'celesta', m: nm('B5'), at: 8, db: -10, pan: 0.4, far: 0.6 },
  ],
};
/** The duet as a piece: its bars are silent (its notes come on the sit's beats); it holds the bed down meanwhile. */
const DUET: Piece = {
  beat: AUDIO.score.duetBeat,
  meter: 3,
  bars: 40,
  bar: () => [],
};

const SILENCE: Piece = { beat: AUDIO.score.beat, bar: () => [] };

const PIECES: Record<string, Piece> = {
  silence: SILENCE,
  opening: OPENING,
  glade: GLADE,
  tension1: tension(1),
  tension2: tension(2),
  clear: CLEAR,
  wake: WAKE,
  boss1: boss(1),
  boss2: boss(2),
  boss3: boss(3),
  column: COLUMN,
  escape: ESCAPE,
  escaped: ESCAPED,
  vista: VISTA,
  grant: GRANT,
  chase: CHASE,
  duet: DUET,
};
/** Pieces that start on the next beat, not the next bar. */
const URGENT = new Set([
  'wake',
  'boss1',
  'tension1',
  'tension2',
  'column',
  'escape',
  'escaped',
  'vista',
  'grant',
  'chase',
]);

const BOSS_KINDS = new Set(['oldBurrback', 'keeper']);
/**
 * An ability found (a glade's grant, a hollow's upgrade but a moon shard): always its own moment (`grant`), whatever
 * played before. A shard is one of three: a glade's phrase, like the other finds.
 */
const isGrant = (e: { type: string; upgrade?: string }) =>
  e.type === 'gladeGrant' || (e.type === 'hollowGrant' && e.upgrade !== 'moonShard');
/** Finds that earn a glade's piece of the theme (at most every `gladeGapS`). */
const GLADE_EVENTS = new Set(['hollowGrant', 'seedTaken', 'patchRest', 'stoneHung', 'healthUp']);

type Loose = {
  type: string;
  kind?: string;
  moths?: number;
  trap?: boolean;
  flag?: string;
  set?: string;
  cue?: string;
  how?: string;
  phase?: string;
  upgrade?: string;
};

export interface ScoreStep {
  cues: Cue[];
  /** Seconds after this step to let go of everything the score has scheduled (null = nothing). */
  cut: number | null;
}

export class Score {
  piece = 'silence';
  /** Frame of the piece's bar 0. */
  private start = 0;
  private lastBar = -1;
  private next: { piece: string; at: number } | null = null;
  private room = '';
  private played = new Set<string>();
  private lastGlade = -Infinity;
  gladeShape = 0;
  private wasArena = 0;
  private fightPhase = 0;
  /** The boss's last hit: total silence over these frames, its breath at the end. */
  private hushFrom = Infinity;
  private hushTo = -Infinity;
  /** The Keeper's cage on the floor (its hum an octave down), or swinging (the mix bright when she is lit). */
  private cageFallen = false;
  private swinging = false;
  private fellAt = { x: 0, y: 0 };
  private prevStage = '';
  /** Frames per beat in the boss's P2-P3, from the cage's swing (`cageSwing.period` / 4). */
  private swingBeat = 0;
  /** The frame she broke out of the cocoon (the river's breath of silence, then its rush overhead). */
  private hatchAt = -Infinity;
  /** The firefly's chase: hooks kindled, its beat (`kit.firefly.beat`), how far it leads her (px). */
  kindles = 0;
  chaseBeat = 0;
  chaseLead = 0;
  /** The last frame the Keeper's light stabbed (one a `stabGap` at most). */
  private lastStab = -Infinity;
  /** The duet's frames (the bed drops to near silence under it). */
  private duetAt = -Infinity;
  /** r14: the Keeper's P1 beat (`fight.angry`), and the roar's silence (no boss music until its slam). */
  angry = 0;
  private rageHold = -Infinity;
  /** r14: the chase's phrase (its bars go on from where they were after a fall or a restart), and its hold. */
  chaseHold = 0;
  private chaseOff = 0;
  private chaseBar = -1;
  private chaseRoom = '';
  /** r14: the escape (`snap.escape`): her last checkpoint, the front's gap under her (-1 off), a hit's muffle. */
  escCp = 0;
  escGap = -1;
  private hitUntil = -Infinity;
  /**
   * r15: the escape's section (`run` the den's floor, `down` the way down to the chimney's foot, `climb` the chimney
   * with the earth rising) and the bar it began on; how far the earth has risen (`escape.rise`).
   */
  escSec: 'run' | 'down' | 'climb' = 'run';
  escFrom = 0;
  escRise = 0;
  private escPlayed = '';
  /** r15: the vista's theme waits for the escape's resolution (the flag comes as she bursts out of the chimney). */
  private vistaAfter = false;
  /** r15: a find's music that came in a quiet moment (the frame), played once it is over. */
  private grantWait = -1;
  /** r15: she drifts onto a rest of the chase (`chase.rest`); the sit's duet (its notes on the beats), her answer. */
  chaseRest = 0;
  private duetOn = false;
  private kinHer = 0;

  constructor(private readonly ctx: RouteContext) {}

  /** What it is playing (the audit, `__game.audio`). */
  mood(): string {
    return this.piece;
  }

  reset(): void {
    this.piece = 'silence';
    this.next = null;
    this.lastBar = -1;
    this.played.clear();
    this.hushFrom = Infinity;
    this.hushTo = -Infinity;
    this.cageFallen = false;
    this.swinging = false;
    this.swingBeat = 0;
    this.prevStage = '';
    this.kindles = 0;
    this.chaseBeat = 0;
    this.chaseOff = 0;
    this.chaseBar = -1;
    this.chaseRoom = '';
    this.angry = 0;
    this.rageHold = -Infinity;
    this.escSec = 'run';
    this.escFrom = 0;
    this.escPlayed = '';
    this.vistaAfter = false;
    this.grantWait = -1;
    this.chaseRest = 0;
    this.duetOn = false;
  }

  private queue(piece: string, at: number): void {
    if (this.next && this.next.piece === piece) return;
    this.next = { piece, at };
  }

  step(events: readonly PlayEvent[], snap: AudioSnap): ScoreStep {
    const f = snap.frame;
    const flags = snap.flags ?? [];
    let cut: number | null = null;
    const room = snap.room ?? '';
    if (room !== this.room) {
      // A room left mid-piece: an ambush or the boss do not follow her; the title, a glade's phrase and the vista
      // (the area's ending: it holds through the glide) play on.
      // (r15: the escape runs on through the den's breach into the way out.)
      const keep = ['glade', 'opening', 'vista', 'grant', 'duet', 'escape', 'escaped'].includes(this.piece);
      if (this.piece !== 'silence' && !keep) cut = 0.6;
      if (!keep) this.piece = 'silence';
      this.next = null;
      this.room = room;
      this.wasArena = 0;
      this.cageFallen = false;
      this.swinging = false;
      this.swingBeat = 0;
    }
    const fight = snap.fight;
    if (snap.chase) {
      this.chaseBeat = snap.chase.beat;
      this.chaseLead = snap.chase.lead;
      this.chaseHold = snap.chase.hold ?? 0;
    } else this.chaseHold = 0;
    const rest = snap.chase?.rest ?? 0;
    const rested = rest > 0 && this.chaseRest === 0;
    this.chaseRest = rest;
    this.angry = fight?.angry ?? 0;
    this.escCp = snap.escape?.cp ?? 0;
    this.escGap = snap.escape?.gap ?? -1;
    // (r15: the section by where she is; between the two rooms' escapes, the last one holds.)
    if (snap.escape) {
      this.escRise = snap.escape.rise;
      this.escSec = room === 'cn-den' ? 'run' : snap.escape.front >= 0 ? 'climb' : 'down';
    } else if (this.piece === 'escape' && room !== 'cn-den' && this.escSec === 'run') this.escSec = 'down';
    for (const raw of events) {
      const e = raw as Loose;
      switch (e.type) {
        case 'hatch':
          this.hatchAt = f;
          if (!this.played.has('opening')) {
            this.played.add('opening');
            this.queue('opening', f + 120);
          }
          break;
        case 'flagSet':
          if (e.flag === 'cn-out-vista' && !this.played.has('vista')) {
            this.played.add('vista');
            if (this.piece === 'escape' || this.next?.piece === 'escape' || this.piece === 'escaped') {
              // (r15: she bursts out of the chimney into the vista: the drive resolves first, then the theme.)
              this.vistaAfter = true;
              if (!this.played.has('escaped')) {
                this.played.add('escaped');
                this.queue('escaped', f);
              }
            } else this.queue('vista', f);
          }
          break;
        case 'lureSnuff':
          if (e.trap && releaseGreat(e.moths ?? 0)) {
            cut = 0;
            this.piece = 'silence';
            // The column rises as the hold lets go (r14: the area's peak). A cut in the last hit's silence ends it.
            this.queue('column', f + releaseFreeze(e.moths ?? 0));
            if (f < this.hushTo + AUDIO.score.returnFrames) {
              this.hushFrom = Infinity;
              this.hushTo = -Infinity;
            }
          }
          break;
        case 'escapeStart':
          if (!this.played.has('escaped') && this.piece !== 'escape' && this.next?.piece !== 'escape')
            this.queue('escape', f);
          break;
        case 'escapeEnd':
          if (!this.played.has('escaped')) {
            this.played.add('escaped');
            this.queue('escaped', f);
          }
          break;
        case 'escapeHit':
          this.hitUntil = f + ((raw as { frames?: number }).frames ?? 30) + 12;
          break;
        case 'keeperRage':
          if (e.phase === 'rear') {
            // It rears and roars: the music stops dead under it (route-canopy.ts plays the roar).
            if (this.piece !== 'silence') cut = 0.05;
            this.piece = 'silence';
            this.next = null;
            this.rageHold = f + ((raw as { frames?: number }).frames ?? 40) + 60;
          } else {
            // The slam: everything back at once, angry (the bar's grid starts on it).
            this.rageHold = -Infinity;
            this.piece = 'silence';
            this.queue('boss1', f);
          }
          break;
        case 'enemyWake':
          if (BOSS_KINDS.has(e.kind ?? '')) this.queue('wake', f);
          break;
        case 'bossCue':
          if (e.cue === 'intro' || e.set === 'intro') this.queue('wake', f);
          if (e.cue === 'p2' || e.cue === 'cageSwing') this.swinging = true;
          if (e.cue === 'p3') this.cageFallen = true;
          break;
        case 'cageFall':
          this.cageFallen = true;
          this.swinging = false;
          break;
        case 'enemyDie':
          if (BOSS_KINDS.has(e.kind ?? '')) cut = this.fall(f, raw, snap) ?? cut;
          break;
        case 'fireflyChase':
          if (e.phase === 'start' && this.piece !== 'chase') {
            // (r14: a chase begun again where one was left picks its phrase up where it was, its chord kept.)
            if (room !== this.chaseRoom) {
              this.kindles = 0;
              this.chaseBar = -1;
            }
            this.chaseRoom = room;
            this.chaseOff = this.chaseBar + 1;
            this.queue('chase', f);
          } else if (e.phase === 'nest' && (this.piece === 'chase' || this.next?.piece === 'chase')) {
            // It stops dead: the music cut, then its one slow call (route-canopy.ts), then the wind.
            cut = 0;
            this.piece = 'silence';
            this.next = null;
          }
          break;
        case 'fireflyKindle':
          if (this.piece === 'chase' || this.next?.piece === 'chase') this.kindles++;
          break;
        case 'trapFill':
          // The trap being set: no music, the dread is the hum (an ambush's clearing or a glade gives way).
          if ((raw as { n?: number }).n === 1) {
            const soft = ['clear', 'glade'];
            if (soft.includes(this.piece)) {
              cut = 0.8;
              this.piece = 'silence';
            }
            if (soft.includes(this.next?.piece ?? '')) this.next = null;
          }
          break;
        case 'kinSit':
          if (!this.played.has('duet') && !snap.arena) {
            this.played.add('duet');
            // (r15: a find's music just begun (the glide's, at the crown, seconds before the sit) gives way and comes
            // back once the sit is over, with the HUD's line.)
            if (this.piece === 'grant' || this.next?.piece === 'grant') this.grantWait = f;
            if (this.piece !== 'silence') cut = 0.8;
            this.piece = 'silence';
            this.queue('duet', f);
            this.duetAt = f;
            this.duetOn = true;
            this.kinHer = 0;
          }
          break;
        case 'kinBeat': {
          const kb = raw as { phase?: string; her?: number };
          if (kb.phase === 'answer') this.kinHer = kb.her ? 1 : 0;
          if (kb.phase === 'stay' && this.duetOn) {
            // (Its notes ring on; the bed comes back.)
            this.duetOn = false;
            if (this.piece === 'duet') this.piece = 'silence';
            if (this.next?.piece === 'duet') this.next = null;
          }
          break;
        }
        case 'cageSwing': {
          // The pulse follows the swing: a bar is one period.
          const period = (raw as { period?: number }).period ?? 0;
          if (period > 0) this.swingBeat = Math.max(30, Math.round(period / 4));
          this.swinging = true;
          break;
        }
        default:
          if (isGrant(e) && (snap.quiet || this.duetOn)) {
            // (r15: never inside a quiet moment (the sit, the column, the vista): it waits until the moment is over,
            // as the HUD's line does.)
            this.grantWait = f;
          } else if (isGrant(e) && fight?.stage !== 'fight') {
            // Always its moment: a glade's phrase playing gives way (round 13).
            if (this.piece === 'glade' || this.piece === 'clear') cut = 0.5;
            if (this.piece !== 'vista' && !this.piece.startsWith('tension')) {
              this.piece = 'silence';
              this.lastGlade = f;
              this.queue('grant', f + 20);
            }
          } else if (
            GLADE_EVENTS.has(e.type) &&
            !snap.quiet &&
            this.piece === 'silence' &&
            !this.next &&
            !snap.arena &&
            fight?.stage !== 'fight' &&
            f - this.lastGlade > AUDIO.score.gladeGapS * 60
          ) {
            this.lastGlade = f;
            this.gladeShape = Math.floor(hash01(this.ctx.seed, f, salt('glade')) * 3);
            this.queue('glade', f + 30);
          }
      }
    }

    // A find's music held back by a quiet moment: its moment once the quiet is over.
    if (this.grantWait >= 0 && !snap.quiet && !this.duetOn && fight?.stage !== 'fight') {
      this.grantWait = -1;
      if (this.piece !== 'vista') {
        if (this.piece !== 'silence' && cut === null) cut = 0.5;
        this.piece = 'silence';
        this.lastGlade = f;
        this.queue('grant', f + 60);
      }
    }
    const stings = this.stings(events, snap, rested);
    // The boss's last hit (any kind: the framework's stage leaving `fight` for `end`, or the old burrback's death).
    const stage = fight?.stage ?? '';
    if (this.prevStage === 'fight' && stage === 'down' && fight && BOSS_KINDS.has(fight.kind))
      cut = this.fall(f, { x: fight.x, y: fight.y }, snap) ?? cut;
    this.prevStage = stage;

    // The continuous states: the boss's phases, an ambush and its clearing.
    if (
      fight &&
      BOSS_KINDS.has(fight.kind) &&
      fight.stage === 'fight' &&
      f >= this.hushTo &&
      f >= this.rageHold
    ) {
      const want = `boss${Math.min(3, fight.phase)}`;
      if (
        this.piece !== want &&
        this.next?.piece !== want &&
        this.piece !== 'wake' &&
        this.next?.piece !== 'wake'
      )
        this.queue(want, f);
      this.fightPhase = fight.phase;
    }
    const arena = snap.arena ?? 0;
    if (arena > 0 && !this.piece.startsWith('boss')) {
      const want = `tension${arena}`;
      if (this.piece !== want && this.next?.piece !== want) this.queue(want, f);
    } else if (arena === 0 && this.wasArena > 0 && this.piece.startsWith('tension')) {
      this.queue('clear', f);
    }
    this.wasArena = arena;
    if (this.piece.startsWith('boss') && (!fight || fight.stage === 'down' || fight.stage === 'sleep')) {
      if (cut === null) cut = 0.4;
      this.piece = 'silence';
    }
    void flags;

    // Switch: urgent pieces on the next beat (now if silent), the rest on the next bar.
    if (this.next && f >= this.next.at) {
      const into = this.next.piece;
      const since = f - this.start;
      const beat = this.beatOf(this.piece);
      const onBeat = since % beat === 0;
      const onBar = since % (beat * this.meterOf(this.piece)) === 0;
      const now = this.piece === 'silence' || (URGENT.has(into) ? onBeat : onBar) || into === 'column';
      if (now) {
        if (into.startsWith('boss') && this.piece.startsWith('boss') && cut === null) {
          // A phase change keeps the grid (the swing's period) and lets the last bar ring.
        } else if (
          URGENT.has(into) &&
          this.piece !== 'silence' &&
          cut === null &&
          !this.piece.startsWith('boss') &&
          // (The column's last chord rings on under the escape: it takes over, it does not cut it off.)
          !(this.piece === 'column' && into === 'escape')
        )
          cut = 0.15;
        this.piece = into;
        this.start = f;
        this.lastBar = -1;
        this.next = null;
      }
    }

    const cues: Cue[] = [...stings];
    if (f === this.hushTo)
      // Out of the silence: its last breath out, long (it has a mouth), and then the world again.
      cues.push({
        sound: 'settle',
        bus: 'creatures',
        frame: f,
        delay: 0,
        x: this.fellAt.x,
        y: this.fellAt.y,
        db: AUDIO.creatures.rearDb - 2,
        cents: -700,
        variant: 0,
        place: 'world',
        far: 0.15,
        priority: 6,
      });
    const p = PIECES[this.piece] ?? SILENCE;
    const since = f - this.start;
    const bar = this.beatOf(this.piece) * this.meterOf(this.piece);
    if (since >= 0 && since % bar === 0) {
      const k = since / bar;
      if (p.bars !== undefined && k >= p.bars) {
        const after = this.piece === 'escaped' && this.vistaAfter;
        if (after) this.vistaAfter = false;
        this.piece = after
          ? 'vista'
          : this.piece === 'wake'
            ? `boss${Math.max(1, Math.min(3, this.fightPhase || 1))}`
            : 'silence';
        if (this.piece !== 'silence') {
          this.start = f;
          cues.push(...this.emit(PIECES[this.piece] as Piece, 0, f));
        }
      } else if (k !== this.lastBar) {
        this.lastBar = k;
        cues.push(...this.emit(p, k, f));
      }
    }
    return { cues, cut };
  }

  /**
   * Accents on the score bus outside the bar (round 13): the Keeper's light finding her (P2: a stab of the high
   * cluster, a blow; she is seen), its lunge and its turn to guard the cage (the falling fourth's D struck), a hook
   * the firefly kindles (the next note of its phrase, in its own sharp glass, an octave over the chord it adds).
   */
  private stings(events: readonly PlayEvent[], snap: AudioSnap, rested = false): Cue[] {
    const f = snap.frame;
    const notes: Note[] = [];
    /** Notes on the chase's grid (its 16th) and on the duet's (its 16th, `duetDb` under). */
    const quick: Note[] = [];
    const duet: Note[] = [];
    const chasing = this.piece === 'chase' || this.next?.piece === 'chase';
    // r15: she drifts onto a rest of the chase: a breath (the forest's chord in tune, her harp's A, soft).
    if (rested && chasing)
      quick.push(
        ...ns('D4 A4 E5').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0.5 * j,
          dur: 14,
          db: -6 - j,
          pan: -0.3 + 0.3 * j,
          far: 0.3,
        })),
        { i: 'harp', m: nm('A4'), at: 1, dur: 6, db: -3, pan: 0.15 },
      );
    const inFight = snap.fight?.stage === 'fight';
    for (const raw of events) {
      const e = raw as Loose & { lit?: boolean };
      if (
        e.type === 'keeperSight' &&
        e.lit &&
        inFight &&
        this.piece.startsWith('boss') &&
        f - this.lastStab >= AUDIO.score.stabGap
      ) {
        this.lastStab = f;
        notes.push(
          { i: 'drum', m: 3, at: 0, db: 1 },
          { i: 'marc', m: nm('D2'), at: 0, dur: 4, db: 0, pan: -0.2 },
          { i: 'trem', m: nm('F6'), at: 0, dur: 5, db: -4, pan: 0.35 },
          { i: 'trem', m: nm('E6'), at: 0, dur: 5, db: -5, pan: 0.1 },
          { i: 'strings', m: nm('Eb5'), at: 0.5, dur: 6, db: -5, pan: 0.25 },
        );
      } else if ((e.type === 'keeperLunge' || e.type === 'keeperGuard') && inFight)
        notes.push(
          { i: 'drum', m: 2, at: 0, db: -1 },
          { i: 'marc', m: nm('D2'), at: 0, dur: 3, db: 1, pan: -0.2 },
          { i: 'marc', m: nm('D3'), at: 0, dur: 3, db: -4, pan: 0.1 },
        );
      else if (e.type === 'keeperRage' && e.phase === 'slam' && inFight)
        notes.push(
          { i: 'drum', m: 3, at: 0, db: 3 },
          { i: 'drum', m: 2, at: 0.5, db: 0 },
          { i: 'marc', m: nm('D1') + 12, at: 0, dur: 6, db: 2, pan: -0.2 },
          { i: 'marc', m: nm('D2'), at: 0, dur: 6, db: -2, pan: 0 },
          { i: 'strings', m: nm('Eb4'), at: 0, dur: 6, db: -3, pan: 0.2 },
          { i: 'strings', m: nm('D5'), at: 0, dur: 6, db: -4, pan: 0.3 },
          { i: 'trem', m: nm('Eb5'), at: 0, dur: 8, db: -6, pan: 0.4 },
        );
      else if (e.type === 'keeperSweepTell' && inFight) {
        // The sweep's tell: a held cluster swelling (the flat second over the pedal) and the bass's E flat: danger.
        // (A sting's 16th is the score's beat / 4.)
        const len = ((raw as { frames?: number }).frames ?? 42) / (AUDIO.score.beat / 4);
        notes.push(
          { i: 'trem', m: nm('Eb5'), at: 0, dur: len, db: -5, pan: 0.35 },
          { i: 'trem', m: nm('E5'), at: 0.5, dur: len - 0.5, db: -6, pan: 0.15 },
          { i: 'trem', m: nm('Bb5'), at: 1, dur: len - 1, db: -7, pan: 0.45 },
          { i: 'marc', m: nm('Eb2'), at: 0, dur: len, db: -3, pan: -0.2 },
        );
      } else if (e.type === 'keeperSweep' && inFight)
        notes.push(
          { i: 'drum', m: 3, at: 0, db: 2 },
          { i: 'marc', m: nm('D2'), at: 0, dur: 3, db: 1, pan: -0.2 },
        );
      else if (e.type === 'escapeCheckpoint' && this.piece === 'escape') {
        // A checkpoint: a high bell of the cloud's chord, climbing with her (safe here).
        const cp = Math.max(1, (raw as { cp?: number }).cp ?? 1);
        const m = ns('A5 D6 E6 A6')[Math.min(3, cp - 1)] as number;
        notes.push(
          { i: 'celesta', m, at: 0, db: -2, pan: 0.3 },
          { i: 'glass', m: m - 12, at: 0, dur: 6, db: -6, pan: 0.2 },
        );
      } else if (e.type === 'kinBeat' && this.duetOn) {
        const kb = raw as { phase?: string; her?: number };
        const her = kb.phase === 'answer' ? (kb.her ? 1 : 0) : this.kinHer;
        duet.push(...(DUET_PHRASES[kb.phase ?? '']?.(her) ?? []));
      } else if (e.type === 'flingStart' && chasing && snap.chase) {
        // r15, the catch: pulled onto the hook's flame, her harp runs up the forest's chord into its sharp note (the
        // next of the chase's chord): she meets its light.
        const id = (raw as { id?: string }).id;
        if (this.ctx.scene.lures?.find((l) => l.id === id)?.hook) {
          const n = Math.max(0, Math.min(this.kindles, CHASE_CHORD.length - 1));
          const top = (CHASE_CHORD[n] as number) + 12 + SHARP_ST;
          quick.push(
            ...ns('D4 A4 E5').map((m, j) => ({
              i: 'harp' as const,
              m,
              at: j * 0.6,
              dur: 2,
              db: -3 + j,
              pan: 0.1 + 0.1 * j,
            })),
            { i: 'celesta', m: top, at: 2.4, db: 0, pan: 0.3 },
            { i: 'glass', m: top - 12, at: 2.4, dur: 8, db: -3, pan: 0.2 },
          );
        }
      } else if (e.type === 'fireflyKindle' && this.piece === 'chase') {
        const n = Math.max(1, Math.min(this.kindles, CHASE_CHORD.length));
        const m = (CHASE_CHORD[n - 1] as number) + 12 + SHARP_ST;
        notes.push(
          { i: 'celesta', m, at: 0, db: 0, pan: 0.3 },
          { i: 'glass', m: m - 12, at: 0, dur: 10, db: -2, pan: 0.2 },
        );
      }
    }
    const S = AUDIO.score;
    return [
      ...(notes.length ? this.cuesOf(notes, f, S.beat / 4 / 60) : []),
      ...(quick.length ? this.cuesOf(quick, f, S.chaseBeat / 4 / 60) : []),
      ...(duet.length
        ? this.cuesOf(
            duet.map((n) => ({ ...n, db: (n.db ?? 0) + S.duetDb })),
            f,
            S.duetBeat / 4 / 60,
          )
        : []),
    ];
  }

  /** The boss falls: the score cut, the ring held, then total silence, then its breath. Returns the cut (s). */
  private fall(f: number, at: { x?: number; y?: number }, snap: AudioSnap): number | null {
    if (this.hushTo >= f) return null;
    this.piece = 'silence';
    this.next = null;
    this.hushFrom = f + AUDIO.score.lastRingFrames;
    this.hushTo = this.hushFrom + AUDIO.score.silenceFrames;
    this.fellAt = { x: at.x ?? snap.hero.x, y: at.y ?? snap.hero.y };
    return 0;
  }

  /** Beats to a piece's bar. */
  private meterOf(name: string): number {
    return (PIECES[name] ?? SILENCE).meter ?? 4;
  }

  /** A piece's beat (the boss's swinging phases keep the swing's period). */
  private beatOf(name: string): number {
    const p = PIECES[name] ?? SILENCE;
    return this.swingBeat > 0 && (name === 'boss2' || name === 'boss3') ? this.swingBeat : p.beat;
  }

  private emit(p: Piece, k0: number, f: number): Cue[] {
    const seed = this.ctx.seed;
    let k = k0;
    if (this.piece === 'chase') {
      k = k0 + this.chaseOff;
      this.chaseBar = k;
    }
    if (this.piece === 'escape' && this.escSec !== this.escPlayed) {
      // (r15: a new section starts at its own bar 0.)
      this.escPlayed = this.escSec;
      this.escFrom = k;
    }
    const key = salt(this.piece);
    const dice: Dice = {
      jit: (j, s) => (hash01(seed, this.start, k, j, key, 1) - 0.5) * s,
      vel: (j) => (hash01(seed, this.start, k, j, key, 2) - 0.5) * 2.4,
      u: (j) => hash01(seed, this.start, k, j, key, 3),
    };
    return this.cuesOf(p.bar(k, dice, this), f, this.beatOf(this.piece) / 4 / 60);
  }

  /** Notes to cues on the score bus (`sixteenth` s per 16th). */
  private cuesOf(notes: Note[], f: number, sixteenth: number): Cue[] {
    const S = AUDIO.score;
    return notes.map((n, j) => {
      const pitched = n.i !== 'drum' && n.i !== 'colLegno';
      const at = pitched ? noteOf(n.i as PitchedId, n.m) : { variant: n.m, cents: 0 };
      const c: Cue = {
        sound: n.i,
        bus: 'score',
        frame: f,
        delay: Math.max(0, n.at) * sixteenth,
        x: 0,
        y: 0,
        db: S.db[n.i] + (n.db ?? 0),
        cents: at.cents,
        variant: at.variant,
        place: 'fixed',
        pan: n.pan ?? 0,
        far: n.far ?? 0,
        priority: n.i === 'drum' || n.i === 'marc' ? 3 : 2,
      };
      if (n.dur !== undefined) {
        c.dur = n.dur * sixteenth;
        c.release = S.release[n.i];
      }
      void j;
      return c;
    });
  }

  /** The score's say over the continuous layers: total silence after the last hit, the Keeper's cage hum and light. */
  shape(L: Layers, snap: AudioSnap): Layers {
    const f = snap.frame;
    const S = AUDIO.score;
    // The last hit: the ring held, then the den tails into silence (round 13: not a hard cut, so it reads as meant),
    // held, and comes back with its breath.
    if (f >= this.hushFrom && f < this.hushTo + S.returnFrames) {
      const into = (f - this.hushFrom) / Math.max(1, S.tailFrames);
      const back = (f - this.hushTo) / Math.max(1, S.returnFrames);
      L.hush = f < this.hushTo ? Math.max(0, 1 - into) ** 2.2 : Math.min(1, Math.max(0, back)) ** 0.7;
    }
    if (this.cageFallen) L.lampHz /= 2;
    // The escape: a hit muffles the music while she is held (it goes on, where it was).
    if (f < this.hitUntil) L.scoreHz = Math.min(L.scoreHz, S.darkScoreHz);
    // The duet: the bed drops to near silence under it.
    const sinceDuet = f - this.duetAt;
    if (sinceDuet >= 0 && (this.duetOn || this.piece === 'duet' || sinceDuet < 60))
      L.duck = Math.min(L.duck, dbToGain(S.duetDuckDb * Math.min(1, sinceDuet / 90)));
    // r15, quiet moments (`kit.quiet`): the world's bed draws back (the score and the moment's own sounds do not).
    const qdb = snap.quiet ? S.quietBedDb[snap.quiet] : undefined;
    if (qdb !== undefined) L.duck = Math.min(L.duck, dbToGain(qdb));
    // The breakout: one breath of silence, then the river's rush right overhead, its tail thinning away.
    const since = f - this.hatchAt;
    const C = AUDIO.canopy;
    if (since >= 0 && since < 36) L.river = 0;
    else if (since >= 36 && since < 36 + C.riverTailS * 60) {
      const k = (since - 36) / (C.riverTailS * 60);
      L.river = dbToGain(C.riverDb[1]) * (1 - k) ** 1.6;
      L.riverPan = 0.15 + 0.35 * k;
      L.riverHz = 2300 - 500 * k;
    }
    // The swing: the mix bright and present when its light is on her, muffled in its shadow (she hears when she is
    // seen). Only in the fight with the swinging cage (the Keeper's P2), or the old burrback's roll phase meanwhile.
    // P2, the swing: when its light has her (it sees her: `seen`) the mix is bright and present, the score open; in
    // its shadow the world and the score close in, muffled and near (she hears when she is seen). Between, how lit
    // she is by the cage's light.
    const swing = this.swinging || (this.piece === 'boss2' && snap.fight?.kind === 'keeper');
    if (swing && !this.cageFallen && snap.fight?.stage === 'fight') {
      const lit = Math.max(0, Math.min(1, snap.lit ?? 0));
      const ex = Math.max(snap.seen ? 1 : 0, 0.75 * lit ** 0.7);
      L.muffleHz = Math.min(L.muffleHz, S.darkHz + (20000 - S.darkHz) * ex ** 1.5);
      L.scoreHz = Math.min(L.scoreHz, S.darkScoreHz + (20000 - S.darkScoreHz) * ex ** 1.5);
    }
    return L;
  }
}

/** For tests: the MIDI note of every baked variant of an instrument. */
export const bakedMidi = (id: PitchedId, k: number) => midiOf(id, k);
