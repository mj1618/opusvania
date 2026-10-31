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
const DM9 = { ch: 'D3 A3 E4', lh: 'D2 A2 E3 F3 A3 F3 E3 A2' };
const BB = { ch: 'F3 A3 D4', lh: 'Bb1 F2 A2 D3 F3 D3 A2 F2' };
const GM = { ch: 'F3 Bb3 D4', lh: 'G1 D2 F2 Bb2 D3 Bb2 F2 D2' };
const ASUS = { ch: 'E3 A3 D4', ch2: 'E3 A3 C#4', lh: 'A1 E2 A2 D3 E3 C#3 A2 E2' };
const C9 = { ch: 'E3 G3 D4', lh: 'C2 G2 D3 E3 G3 E3 D3 G2' };
const FA = { ch: 'F3 A3 C4', lh: 'A1 F2 C3 F3 A3 F3 C3 F2' };
const GA = { ch: 'F3 Bb3 D4', ch2: 'E3 A3 C#4', lh: 'G1 D2 F2 Bb2 A1 E2 A2 C#3' };

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
  /** Frames per beat (four to the bar). */
  beat: number;
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

/** The boss's chords by bar: D minor, D minor, B flat, A (the fourth bar: the falling fourth's A). */
const BOSS_ROOTS = ['D2', 'D2', 'Bb1', 'A1'];
const BOSS_PAD = ['D3 F3 A3', 'D3 F3 A3', 'D3 F3 Bb3', 'E3 A3 C#4'];
/** The threatened motif (P2): hers, sinking chromatically. */
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
  [[0, 'D5', 16]],
  [[0, 'C#5', 16]],
];

/**
 * The boss (canopy-moments.md Moment 6). P1: earth knocks on its gait, the great cage's hum the floor (the lamp
 * voice), the bass's pedal. P2: the pulse follows the swing (a bar = one ~4 s swing: knocks at both ends), tremolo,
 * her motif sinking. P3: full tension, eighths, the motif fast in felt octaves, a cluster up high.
 */
const boss = (phase: number): Piece => ({
  beat: BB_,
  bar(k, d) {
    const j4 = k % 4;
    const root = nm(BOSS_ROOTS[j4] as string);
    const out: Note[] = [];
    out.push({ i: 'marc', m: root, at: 0, dur: 10, db: -1, pan: -0.25 });
    ns(BOSS_PAD[j4] as string).forEach((m, j) => {
      out.push({ i: 'strings', m, at: 0, dur: 16, db: -8 - j + (phase - 1) * 2, pan: -0.3 + 0.3 * j });
    });
    out.push({ i: 'strings', m: root + 12, at: 0, dur: 16, db: -5, pan: -0.35 });
    if (phase === 1) {
      out.push(
        { i: 'drum', m: 2, at: 0, db: -1 },
        { i: 'drum', m: 0, at: 6, db: -9 },
        { i: 'drum', m: 1, at: 8, db: -4 },
      );
      if (j4 === 3) out.push({ i: 'drum', m: 0, at: 12, db: -8 }, { i: 'drum', m: 1, at: 14, db: -6 });
      for (let j = 0; j < 16; j += 2)
        out.push({ i: 'colLegno', m: j % 4, at: j, db: (j % 8 === 0 ? -3 : -11) + d.vel(j), pan: 0.3 });
      return out;
    }
    // P2 and P3: the swing's two ends land on 1 and 3.
    out.push({ i: 'drum', m: 3, at: 0, db: 0 }, { i: 'drum', m: 2, at: 8, db: -2 });
    out.push({ i: 'marc', m: root - 5 < 26 ? root + 7 : root - 5, at: 8, dur: 6, db: -3, pan: -0.25 });
    ns(BOSS_PAD[j4] as string).forEach((m, j) => {
      out.push({ i: 'trem', m: m + 12, at: 0, dur: 17, db: -7 - j, pan: 0.1 + 0.2 * j });
    });
    for (let j = 0; j < 16; j++)
      out.push({ i: 'colLegno', m: j % 4, at: j, db: (j % 4 === 0 ? -4 : -12) + d.vel(j), pan: 0.3 });
    if (phase === 2) {
      for (const [at, n, dur] of P2_MEL[j4] ?? [])
        out.push({ i: 'strings', m: nm(n), at, dur, db: -1, pan: 0.2 });
      return out;
    }
    // P3: eighths on the drum, the cluster, her motif fast in felt octaves.
    for (let j = 2; j < 16; j += 2)
      if (j !== 8) out.push({ i: 'drum', m: j % 4 === 0 ? 1 : 0, at: j, db: -7 });
    ns('E5 F5').forEach((m, j) => {
      out.push({ i: 'trem', m, at: 0, dur: 17, db: -8, pan: 0.4 - 0.25 * j });
    });
    const fast = ns(j4 % 2 === 0 ? 'A4 D5 E5 F5 E5 D5 C#5 D5' : 'A4 D5 E5 F5 G5 F5 E5 Eb5');
    fast.forEach((m, j) => {
      out.push({ i: 'felt', m, at: j * 2, db: -1 + d.vel(j), pan: 0.15 });
      out.push({ i: 'felt', m: m + 12, at: j * 2, db: -7, pan: 0.25 });
    });
    return out;
  },
});

/** The great cage let go: the forest's chord swelling up two octaves as the column rises, no motif (not yet). */
const GREAT_RELEASE: Piece = {
  beat: AUDIO.score.beat,
  bars: 4,
  bar(k) {
    if (k === 0)
      return [
        ...ns('D3 A3 E4 B4').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 40,
          db: -2 - j,
          pan: -0.45 + 0.3 * j,
        })),
        { i: 'strings', m: nm('D2'), at: 0, dur: 36, db: -6, pan: -0.3 },
        { i: 'strings', m: nm('A2'), at: 4, dur: 32, db: -8, pan: -0.1 },
      ];
    if (k === 1)
      return [
        ...ns('D4 A4 E5').map((m, j) => ({
          i: 'glass' as const,
          m,
          at: 0,
          dur: 30,
          db: -4 - j,
          pan: 0.45 - 0.3 * j,
        })),
        { i: 'celesta', m: nm('A5'), at: 4, db: -6, pan: 0.3, far: 0.4 },
        { i: 'celesta', m: nm('D6'), at: 8, db: -7, pan: 0.35, far: 0.5 },
        { i: 'celesta', m: nm('E6'), at: 12, db: -8, pan: 0.4, far: 0.6 },
      ];
    if (k === 2) return [{ i: 'celesta', m: nm('B6'), at: 0, db: -10, pan: 0.45, far: 0.8 }];
    return [];
  },
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
  greatRelease: GREAT_RELEASE,
  vista: VISTA,
};
/** Pieces that start on the next beat, not the next bar. */
const URGENT = new Set(['wake', 'boss1', 'tension1', 'tension2', 'greatRelease', 'vista']);

const BOSS_KINDS = new Set(['oldBurrback', 'keeper']);
/** Finds that earn a glade's piece of the theme. */
const GLADE_EVENTS = new Set([
  'gladeGrant',
  'hollowGrant',
  'seedTaken',
  'patchRest',
  'stoneHung',
  'healthUp',
]);

type Loose = {
  type: string;
  kind?: string;
  moths?: number;
  trap?: boolean;
  flag?: string;
  set?: string;
  cue?: string;
  how?: string;
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
      const keep = this.piece === 'glade' || this.piece === 'opening' || this.piece === 'vista';
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
            this.queue('vista', f);
          }
          break;
        case 'lureSnuff':
          if (e.trap && releaseGreat(e.moths ?? 0)) {
            cut = 0;
            this.piece = 'silence';
            this.queue('greatRelease', f + releaseFreeze(e.moths ?? 0) + 24);
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
        case 'cageSwing': {
          // The pulse follows the swing: a bar is one period.
          const period = (raw as { period?: number }).period ?? 0;
          if (period > 0) this.swingBeat = Math.max(30, Math.round(period / 4));
          this.swinging = true;
          break;
        }
        default:
          if (
            GLADE_EVENTS.has(e.type) &&
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

    // The boss's last hit (any kind: the framework's stage leaving `fight` for `end`, or the old burrback's death).
    const stage = fight?.stage ?? '';
    if (this.prevStage === 'fight' && stage === 'down' && fight && BOSS_KINDS.has(fight.kind))
      cut = this.fall(f, { x: fight.x, y: fight.y }, snap) ?? cut;
    this.prevStage = stage;

    // The continuous states: the boss's phases, an ambush and its clearing.
    if (fight && BOSS_KINDS.has(fight.kind) && fight.stage === 'fight' && f >= this.hushTo) {
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
      const onBar = since % (beat * 4) === 0;
      const now = this.piece === 'silence' || (URGENT.has(into) ? onBeat : onBar) || into === 'greatRelease';
      if (now) {
        if (into.startsWith('boss') && this.piece.startsWith('boss') && cut === null) {
          // A phase change keeps the grid (the swing's period) and lets the last bar ring.
        } else if (
          URGENT.has(into) &&
          this.piece !== 'silence' &&
          cut === null &&
          !this.piece.startsWith('boss')
        )
          cut = 0.15;
        this.piece = into;
        this.start = f;
        this.lastBar = -1;
        this.next = null;
      }
    }

    const cues: Cue[] = [];
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
    const bar = this.beatOf(this.piece) * 4;
    if (since >= 0 && since % bar === 0) {
      const k = since / bar;
      if (p.bars !== undefined && k >= p.bars) {
        this.piece =
          this.piece === 'wake' ? `boss${Math.max(1, Math.min(3, this.fightPhase || 1))}` : 'silence';
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

  /** A piece's beat (the boss's swinging phases keep the swing's period). */
  private beatOf(name: string): number {
    const p = PIECES[name] ?? SILENCE;
    return this.swingBeat > 0 && (name === 'boss2' || name === 'boss3') ? this.swingBeat : p.beat;
  }

  private emit(p: Piece, k: number, f: number): Cue[] {
    const seed = this.ctx.seed;
    const key = salt(this.piece);
    const dice: Dice = {
      jit: (j, s) => (hash01(seed, this.start, k, j, key, 1) - 0.5) * s,
      vel: (j) => (hash01(seed, this.start, k, j, key, 2) - 0.5) * 2.4,
      u: (j) => hash01(seed, this.start, k, j, key, 3),
    };
    const S = AUDIO.score;
    const sixteenth = this.beatOf(this.piece) / 4 / 60;
    return p.bar(k, dice, this).map((n, j) => {
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
    if (f >= this.hushFrom && f < this.hushTo) L.hush = 0;
    if (this.cageFallen) L.lampHz /= 2;
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
    const swing = this.swinging || (this.piece === 'boss2' && snap.fight?.kind === 'keeper');
    if (swing && snap.fight?.stage === 'fight') {
      const lit = Math.max(0, Math.min(1, snap.lit ?? 0));
      L.muffleHz = Math.min(L.muffleHz, 1100 + 18900 * lit ** 0.7);
    }
    return L;
  }
}

/** For tests: the MIDI note of every baked variant of an instrument. */
export const bakedMidi = (id: PitchedId, k: number) => midiOf(id, k);
