/**
 * The prologue's sound (docs/story/scenes/prologue-v2.md; milestone 3), as data: pure functions from
 * what the prologue's director shows (`ProView`, read-only) to cues and to a mix over the game's own
 * layers. Every cue is keyed to a beat name and an offset read from the director's timing sheet
 * (render/prologue/script.ts), never to absolute seconds, so a re-timed beat carries its sound with it.
 *
 * - The breath: the Hush's breath alone in the dark (9 s in, 9 s out), the light's own tone breathing
 *   with the light, the warm blur as one warm low note (the maker's) that stops when it lifts, the
 *   light's tone stuttering into grain.
 * - Hatching: frost crackle, the fox's slow breath, cocoon creaks, first wingbeats, Sorrel's motif
 *   (slow, in 3/4) as he folds his wing over her, her theme's first two notes on the tap.
 * - The first night: the forest, Sorrel's 3/4 motif quick and light leading her (softer while he
 *   waits), his "come on" hops, then the dance's glass waltz faint above when he stops under it; the
 *   glint's bumps a bright tick; the sneeze.
 * - The hollow: the fox's laps; the ground opening, the Hush's breath rising close and dry; the case
 *   closing on a bone knock; the lights dimming to silence; the lamp's coral hum swelling toward her
 *   pitch; hiding: everything holds its breath, the hum stops dead as the wash moves on.
 * - The summit: wind, the dance's wings and music faint above, the mountain's breath huge and slow,
 *   Sorrel's motif joining the dance as he goes, her motif alone; the title on the Hush's D to A,
 *   then silence.
 * - The next night: wind and her one glint's faint tone.
 */
import { BEATS, BREATH, COURSE, HATCH, HOLLOW, SUMMIT, WAKE } from '../render/prologue/script';
import type { SoundId } from './bake';
import { hushPhase, isKnock } from './clock';
import { hash01, salt } from './dsp';
import type { AudioCam, Cue, RouteContext } from './router';
import { panOf } from './router';
import { AUDIO, type BusId } from './tuning';

/** What audio reads of the prologue each render frame (the director's plan, or the debug API's state). */
export interface ProView {
  beat: string;
  bt: number;
  t: number;
  done: boolean;
  phase?: string;
  pt?: number;
  phaseAt?: number;
  leg?: number;
  raceAt?: number;
  stopAt?: number;
  sneezeAt?: number;
  bumps?: number;
  inFerns?: boolean;
  fold?: number;
  tackleAt?: number;
  glint?: { on: boolean; x: number; y: number; holder: string };
  /** Sorrel's body: centre x, feet y, vy, grounded, mode. */
  sorrel?: { x: number; y: number; vy: number; grounded: boolean; gliding: boolean; dash: boolean } | null;
}

/** The director's plan (render/prologue/plan.ts) as a ProView: copies what audio needs, nothing else. */
export function viewOf(
  plan: {
    beat: string;
    bt: number;
    t: number;
    phase: string;
    pt: number;
    phaseAt: number;
    leg: number;
    raceAt: number;
    stopAt: number;
    sneezeAt: number;
    bumps: number;
    inFerns: boolean;
    fold: number;
    tackleAt: number;
    glint: { on: boolean; x: number; y: number; holder: string };
    sorrel: {
      cur: {
        x: number;
        y: number;
        w: number;
        h: number;
        vy: number;
        grounded: boolean;
        gliding: boolean;
        mode: string;
      };
    } | null;
  },
  done: boolean,
): ProView {
  const s = plan.sorrel?.cur;
  return {
    beat: plan.beat,
    bt: plan.bt,
    t: plan.t,
    done,
    phase: plan.phase,
    pt: plan.pt,
    phaseAt: plan.phaseAt,
    leg: plan.leg,
    raceAt: plan.raceAt,
    stopAt: plan.stopAt,
    sneezeAt: plan.sneezeAt,
    bumps: plan.bumps,
    inFerns: plan.inFerns,
    fold: plan.fold,
    tackleAt: plan.tackleAt,
    glint: { ...plan.glint },
    sorrel: s
      ? {
          x: s.x + s.w / 2,
          y: s.y + s.h,
          vy: s.vy,
          grounded: s.grounded,
          gliding: s.gliding,
          dash: s.mode === 'dash',
        }
      : null,
  };
}

/** A [from, to] of a timing sheet by name, tolerant of a sheet being re-cut (missing: the fallback). */
function span(sheet: object, key: string, fallback: [number, number]): [number, number] {
  const v = (sheet as Record<string, unknown>)[key];
  if (Array.isArray(v) && typeof v[0] === 'number') return [v[0], (v[1] as number | undefined) ?? v[0]];
  if (typeof v === 'number') return [v, v];
  return fallback;
}
const beatLen = (id: string): number => {
  const b = BEATS.find((x) => x.id === id);
  return b?.len ?? 0;
};

/** Just intonation, cents from D4: the score's notes (docs/audio-direction.md §2). */
export const NOTE = {
  A3: -498,
  D4: 0,
  E4: 204,
  F4: 316,
  G4: 498,
  A4: 702,
  B4: 906,
  D5: 1200,
  E5: 1404,
  F5: 1516,
};
/** Wing's motif: A rising to D, then E, F, back to E. Beats. */
export const WING_MOTIF: Array<[number, number]> = [
  [0, NOTE.A3],
  [1, NOTE.D4],
  [2, NOTE.E4],
  [3, NOTE.F4],
  [4.5, NOTE.E4],
];
/** Sorrel's 3/4 lilt circling her top notes (a third above her): four bars of three beats. */
export const SORREL_MOTIF: Array<[number, number]> = [
  [0, NOTE.F4],
  [1, NOTE.E4],
  [1.5, NOTE.F4],
  [2, NOTE.A4],
  [3, NOTE.G4],
  [4, NOTE.F4],
  [5, NOTE.E4],
  [6, NOTE.A4],
  [7, NOTE.G4],
  [7.5, NOTE.F4],
  [8, NOTE.E4],
  [9, NOTE.F4],
];
const PHRASE_BEATS = 12;

/** Notes of a looping phrase that fall in (from, to] of its own clock, at `bpm`. */
function phraseNotes(
  motif: Array<[number, number]>,
  beats: number,
  bpm: number,
  from: number,
  to: number,
  loop: boolean,
) {
  const spb = 60 / bpm;
  const out: Array<{ t: number; cents: number; k: number }> = [];
  if (to <= from) return out;
  const len = beats * spb;
  const first = loop ? Math.floor(Math.max(0, from) / len) : 0;
  const last = loop ? Math.floor(to / len) : 0;
  for (let rep = first; rep <= last; rep++)
    motif.forEach(([b, cents], k) => {
      const t = rep * len + b * spb;
      if (t > from && t <= to) out.push({ t, cents, k: rep * 100 + k });
    });
  return out;
}

const DT = 1 / 60;

/**
 * The prologue's one-shots between the previous frame's view and this one. Crossings of a beat's
 * clock (`bt`) fire once; music is scheduled one frame ahead with an exact delay. Pure and seeded.
 */
export function proCues(prev: ProView | null, cur: ProView, cam: AudioCam, ctx: RouteContext): Cue[] {
  if (cur.done) return [];
  const out: Cue[] = [];
  const same = prev !== null && prev.beat === cur.beat && !prev.done;
  const p0 = same ? prev.bt : -1e-6;
  const b = cur.bt;
  const at = (x: number) => p0 < x && b >= x;
  const key = Math.round(cur.t * 60);
  const add = (
    sound: SoundId,
    bus: BusId,
    db: number,
    over: Partial<Cue> & { x?: number; y?: number } = {},
    i = 0,
  ) => {
    const s = salt(sound);
    out.push({
      sound,
      bus,
      frame: key,
      delay: 0,
      x: cam.x,
      y: cam.y,
      db: db + (hash01(ctx.seed, key, i, s, 2) - 0.5) * 2,
      cents: (hash01(ctx.seed, key, i, s, 1) - 0.5) * 40,
      variant: Math.floor(hash01(ctx.seed, key, i, s) * 16),
      place: 'fixed',
      pan: 0,
      far: 0,
      priority: 3,
      ...over,
    });
  };
  const P = AUDIO.prologue;
  /** Music: notes of a phrase on a clock running from `start` (in this beat's clock or the play clock). */
  const music = (
    sound: SoundId,
    motif: Array<[number, number]>,
    beats: number,
    bpm: number,
    clock0: number,
    clock1: number,
    db: number,
    loop: boolean,
    over: Partial<Cue> = {},
    shift = 0,
  ) => {
    for (const n of phraseNotes(motif, beats, bpm, clock0 + DT, clock1 + DT, loop))
      add(sound, 'score', db, { delay: Math.max(0, n.t - clock1), cents: n.cents + shift, ...over }, n.k);
  };

  // The Hush's knock on the prologue's clock: in the breath, the hollow and the summit only. Ducked under
  // the hatching and the first night, so the pulse lands as a threat when it comes back in the hollow.
  const mix = proMix(cur);
  if (mix.knock && prev && !prev.done) {
    const f0 = Math.round(prev.t * 60);
    for (let f = f0 + 1; f <= key; f++)
      if (isKnock(f))
        add(
          'knock',
          'hush',
          AUDIO.hush.knockDb + 20 * Math.log10(Math.max(0.05, Math.min(2, mix.hush))),
          { pan: hushPhase(f).beat % 2 === 1 ? -0.22 : 0.22, far: 0.35, priority: 2 },
          60,
        );
  }
  switch (cur.beat) {
    case 'breath': {
      const [g0] = span(BREATH, 'grain', [8.32, 8.82]);
      if (at(g0)) add('staticBurst', 'score', P.staticDb, { far: 0.1 });
      break;
    }
    case 'hatch': {
      const fox = { x: (HATCH as { fox?: number }).fox ?? 1320, y: 1260 };
      const placed = (x: number, y: number) => ({ x, y, place: 'world' as const });
      // Frost crackle through the cold part of the hatching; the fox's slow breath while it sleeps.
      const [, frostEnd] = span(HATCH, 'frostOut', [24, 30]);
      if (b < frostEnd && hash01(ctx.seed, key, salt('frost')) < (P.frostRate / 60) * (1 - b / frostEnd))
        add('frost', 'world', P.frostDb, {
          ...placed(fox.x + (hash01(ctx.seed, key, 7) - 0.5) * 700, 1260),
          far: hash01(ctx.seed, key, 8) * 0.6,
          priority: 0,
        });
      for (let k = 0; k < 10; k++)
        if (at(1.5 + k * P.foxBreathS)) add('calmBreath', 'creatures', P.foxDb, placed(fox.x, fox.y), k);
      const sp = span(HATCH, 'sorrelSplit', [3.2, 3.2])[0];
      const wp = span(HATCH, 'wingSplit', [10, 10])[0];
      const so = (HATCH as { sorrel?: { x: number; y: number } }).sorrel ?? { x: 1240, y: 1060 };
      const wi = (HATCH as { wing?: { x: number; y: number } }).wing ?? { x: 1400, y: 1080 };
      if (at(sp - 0.7)) add('creak', 'world', P.creakDb, placed(so.x, so.y));
      if (at(wp - 0.7)) add('creak', 'world', P.creakDb, placed(wi.x, wi.y), 1);
      // First wingbeats: his as he shakes out, hers as her wings open; small heartbeats.
      const [sh] = span(HATCH, 'sorrelShake', [4.4, 5.6]);
      // Her wings open at `opens` (pass 3; else the fold's end); before that, a weak try that fails.
      const foldEnd = span(HATCH, 'fold', [14, 21])[1];
      const fold1 = span(HATCH, 'opens', [foldEnd, foldEnd])[0] + 0.3;
      const [try0] = span(HATCH, 'tryOpen', [-1, -1]);
      if (try0 >= 0)
        for (let k = 0; k < 2; k++)
          if (at(try0 + k * 0.4)) add('flutter', 'hero', P.shiverDb - 2, placed(wi.x, 1260), 4 + k);
      for (const [t0, x, k] of [
        [sh, so.x, 0],
        [sh + 0.32, so.x, 1],
        [fold1 - 0.3, wi.x, 2],
        [fold1 + 0.05, wi.x, 3],
      ] as const)
        if (at(t0)) add('wing', 'hero', P.wingDb, placed(x, 1240), k);
      // Sorrel's motif, slow and soft, as he folds his wing over her; her first two notes on the tap.
      const [f0] = span(HATCH, 'fold', [14, 21]);
      // (Two bars, so it has ended when he taps her: the fold is about 4 s.)
      const fl = span(HATCH, 'fold', [14, 21]);
      const foldBpm = Math.min(96, Math.max(66, (60 * 6) / Math.max(1, fl[1] - fl[0] + 0.3)));
      music('pluckBright', SORREL_MOTIF.slice(0, 7), 6, foldBpm, p0 - f0, b - f0, P.sorrelSlowDb, false);
      const [tap] = span(HATCH, 'tap', [21.2, 22]);
      music('pluck', WING_MOTIF.slice(0, 2), 2, 72, p0 - tap, b - tap, P.wingMotifDb, false);
      const [r0] = span(HATCH, 'ready', [22.5, 24]);
      if (at(r0)) add('wing', 'hero', P.wingDb - 3, placed(so.x - 60, 1240), 5);
      break;
    }
    case 'play': {
      const pt = cur.pt ?? b;
      const pp = same ? (prev.pt ?? p0) : pt - DT;
      const stopped = (cur.stopAt ?? -1) >= 0;
      const ph = cur.phase ?? 'leg';
      const so = cur.sorrel;
      const pan = so ? panOf(so.x, cam) * 0.4 : 0;
      // His motif leads her, quick and light; softer while he waits for her; it stops when he stops.
      if (!stopped) {
        const db = ph === 'wait' ? P.leadDb - 5 : P.leadDb;
        music('pluckBright', SORREL_MOTIF, PHRASE_BEATS, 138, pp, pt, db, true, { pan });
      } else {
        // Under the dance: its glass waltz, far above, until he dives after the glint.
        const s0 = cur.stopAt ?? 0;
        if (ph !== 'sail' && ph !== 'nose' && ph !== 'end')
          music(
            'bell',
            SORREL_MOTIF,
            PHRASE_BEATS,
            96,
            pp - s0,
            pt - s0,
            P.danceDb,
            true,
            { far: 0.9, pan: 0.1 },
            1200 - NOTE.A4 - 1200,
          );
      }
      // His hops and dives (his own body): a soft wingbeat; "come on" hops add two light notes.
      const ps = prev?.sorrel;
      if (so && ps) {
        if (ps.grounded && !so.grounded && so.vy < 0) {
          add('wing', 'hero', P.wingDb - 2, { x: so.x, y: so.y - 30, place: 'world' }, 11);
          if (ph === 'wait')
            for (const [k, c] of [
              [0, NOTE.A4],
              [1, NOTE.D5],
            ] as const)
              add('pluckBright', 'score', P.leadDb - 4, { delay: k * 0.16, cents: c, pan }, 12 + k);
        }
        if (so.dash && !ps.dash)
          add('dash', 'hero', AUDIO.hero.dashDb - 3, { x: so.x, y: so.y - 30, place: 'world' }, 13);
        if (so.gliding && !ps.gliding)
          add('whoosh', 'hero', AUDIO.hero.whooshDb, { x: so.x, y: so.y - 30, place: 'world' }, 14);
      }
      // The glint: drifting down (a faint glass shimmer), given to him, bumped (a bright tick).
      const g = cur.glint;
      const pg = prev?.glint;
      if (g?.on && pg && !pg.on)
        add('offerTone', 'hero', P.glintDb, { x: g.x, y: g.y, place: 'world', cents: 1200 }, 20);
      if (g && pg && g.holder === 'sorrel' && pg.holder !== 'sorrel')
        add('offerTone', 'hero', AUDIO.giving.offerDb, { x: g.x, y: g.y, place: 'world' }, 21);
      if ((cur.bumps ?? 0) > (prev?.bumps ?? 0))
        add(
          'glintNote',
          'hero',
          P.bumpDb,
          { x: g?.x ?? cam.x, y: g?.y ?? cam.y, place: 'world', cents: 0 },
          22,
        );
      if ((cur.sneezeAt ?? -1) >= 0 && (prev?.sneezeAt ?? -1) < 0)
        add('sneeze', 'creatures', P.sneezeDb, { x: COURSE.nose.x, y: COURSE.nose.y, place: 'world' }, 23);
      break;
    }
    case 'hollow': {
      const x = (HOLLOW as { x?: number }).x ?? 1440;
      const w = (y: number) => ({ x, y, place: 'world' as const });
      // The fox's laps: wet, slightly uneven, through both drinks.
      const drinks = ((HOLLOW as unknown as { drinks?: Array<readonly number[]> }).drinks ?? []) as Array<
        readonly number[]
      >;
      for (const [d0 = 0, d1 = 0] of drinks)
        if (b > d0 && b < d1 && hash01(ctx.seed, key, salt('lap')) < 2.6 / 60)
          add('lap', 'creatures', P.lapDb, w(1250), 30);
      const [o0] = span(HOLLOW, 'open', [6, 7.5]);
      if (at(o0)) add('rumble', 'hush', P.rumbleDb, { pan: 0, far: 0.2 }, 31);
      const [s0] = span(HOLLOW, 'sink', [6.5, 11.5]);
      for (let k = 0; k < 2; k++)
        if (at(s0 + 0.6 + k * 2.6)) add('calmBreath', 'creatures', P.foxDb - 4 * k, w(1260), 32 + k);
      const [rt] = span(HOLLOW, 'rootTip', [8.6, 11.6]);
      if (at(rt)) add('creak', 'hush', P.creakDb - 6, w(1180), 34);
      const [c0] = span(HOLLOW, 'close', [12, 13]);
      if (at(c0 + 0.5)) add('boneKnock', 'hush', P.boneDb, w(1240), 35);
      // Her shiver against the case: small dry flutters.
      const [fo0, fo1] = span(HOLLOW, 'fold', [17, 28]);
      if (b > fo0 && b < fo1 && hash01(ctx.seed, key, salt('shiver')) < 1.6 / 60)
        add('flutter', 'hero', P.shiverDb, w(1200), 36);
      if ((cur.tackleAt ?? -1) >= 0 && (prev?.tackleAt ?? -1) < 0) {
        add('whoosh', 'hero', AUDIO.hero.whooshDb, w(1220), 37);
        add('dust', 'hero', AUDIO.hero.dustDb, w(1280), 38);
      }
      break;
    }
    case 'summit': {
      // The dance's soft wings far above; its waltz faint; Sorrel's motif joins it as he lifts off.
      const [lift0] = span(SUMMIT, 'lift', [9.9, 12.6]);
      if (hash01(ctx.seed, key, salt('dance')) < 2.2 / 60)
        add(
          'flutter',
          'world',
          P.danceWingsDb,
          { pan: (hash01(ctx.seed, key, 3) - 0.5) * 0.9, far: 1, priority: 0 },
          40,
        );
      music('bell', SORREL_MOTIF, PHRASE_BEATS, 96, p0, b, P.danceDb, true, { far: 1, pan: 0.15 }, -NOTE.A4);
      // She holds the glint out to him: its tone; he folds her hands back (his wing); the tap: her two notes.
      const [of0] = span(SUMMIT, 'offer', [-1, -1]);
      if (of0 >= 0 && at(of0 + 0.3)) add('offerTone', 'hero', P.glintDb + 2, { pan: -0.05 }, 41);
      const [fb0] = span(SUMMIT, 'foldBack', [-1, -1]);
      if (fb0 >= 0 && at(fb0 + 0.2)) add('wing', 'hero', P.wingDb - 4, { pan: 0.05 }, 42);
      const [tp0] = span(SUMMIT, 'tap', [-1, -1]);
      if (tp0 >= 0)
        music('pluck', WING_MOTIF.slice(0, 2), 2, 72, p0 - tp0, b - tp0, P.wingMotifDb - 2, false);
      // His motif joins the dance as he goes (two bars, going farther).
      music('pluckBright', SORREL_MOTIF.slice(0, 7), 6, 120, p0 - lift0, b - lift0, P.leadDb - 2, false, {
        far: 0.8,
        pan: 0.3,
      });
      // Her motif alone, fitted into the time she is alone (it ends unresolved on E as the title comes).
      const end = (SUMMIT as { end?: number }).end ?? beatLen('summit');
      const alone = span(SUMMIT, 'alone', [Math.min(end - 4.5, lift0 + 3), end])[0];
      const aloneBpm = Math.min(110, Math.max(66, (60 * 4.5) / Math.max(0.5, end - 0.1 - alone)));
      music('pluck', WING_MOTIF, 6, aloneBpm, p0 - alone, b - alone, P.wingMotifDb, false, { pan: -0.1 });
      break;
    }
    case 'wake': {
      // The title on the Hush's D to A, then silence.
      const [t0] = span(WAKE, 'title', [0.2, 1.2]);
      if (at(t0)) add('hushCall', 'hush', P.callDb, { far: 0.4 }, 50);
      break;
    }
  }
  return out;
}

/** How the prologue bends the game's layers this frame (multipliers and overrides). */
export interface ProMix {
  /** The world's ambience (wind, pool, steam, glass air, drips): 0 silent .. 1 as in play. */
  bed: number;
  /** The Hush: breath and pulse multipliers, the frame its clock reads, its low-pass, a held breath. */
  hush: number;
  pulse: number;
  hushFrame: number | null;
  soilHz: number | null;
  hold: boolean;
  /** The Hush's 4.2 s knock sounds (off under the hatching and the first night). */
  knock: boolean;
  /** The maker's warm low note, the light's own tone, the lamp's coral hum, her glint's tone (linear gains). */
  maker: number;
  light: number;
  lamp: number;
  glint: number;
}

const env = (t: number, [a, b]: [number, number]) =>
  b <= a ? (t >= a ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a)));

export function proMix(v: ProView): ProMix {
  const P = AUDIO.prologue;
  const b = v.bt;
  const m: ProMix = {
    bed: 1,
    hush: 1,
    pulse: 1,
    hushFrame: Math.round(v.t * 60),
    soilHz: null,
    hold: false,
    knock: true,
    maker: 0,
    light: 0,
    lamp: 0,
    glint: 0,
  };
  const g = (db: number) => 10 ** (db / 20);
  switch (v.beat) {
    case 'breath': {
      // Alone in the dark: no forest, the Hush's breath nearer than in the Grove, the light's tone.
      m.bed = 0;
      m.hush = g(P.breathHushDb);
      m.pulse = 0;
      m.soilHz = 700;
      const fadeIn = env(b, span(BREATH, 'fadeIn', [0, 1]));
      const fadeOut = 1 - env(b, span(BREATH, 'fadeOut', [9.3, 10]));
      const [ti0, ti1] = span(BREATH, 'touchIn', [3.5, 4.8]);
      const [to0, to1] = span(BREATH, 'touchOut', [6.8, 7.8]);
      const period = b < ti0 ? BREATH.period : BREATH.slowPeriod;
      const breathe = 0.55 + 0.45 * Math.cos((2 * Math.PI * b) / period);
      const [fl0, fl1] = span(BREATH, 'flickers', [7.95, 8.18]);
      const flick = (b >= fl0 && b < fl0 + 4 / 60) || (b >= fl1 && b < fl1 + 4 / 60) ? 0 : 1;
      const [gr0] = span(BREATH, 'grain', [8.32, 8.82]);
      const [bb0, bb1] = span(BREATH, 'brokenBreath', [8.82, 9.3]);
      const broken = b >= bb0 && b < bb1 ? Math.sin((Math.PI * (b - bb0)) / (bb1 - bb0)) * 0.6 : 0;
      m.light = g(P.lightDb) * fadeIn * (b < gr0 ? breathe * flick : broken);
      m.maker = g(P.makerDb) * Math.min(env(b, [ti0, ti1]), 1 - env(b, [to0, to1]));
      m.hush *= Math.max(0.2, fadeOut);
      break;
    }
    case 'hatch':
      m.bed = 0.55;
      m.hush = 0.5;
      m.knock = false;
      break;
    case 'play':
      m.bed = 1;
      m.hush = 0.7;
      m.knock = false;
      // The glint she holds has its faint tone (it is the only light either of them has).
      m.glint = v.glint?.on && v.glint.holder === 'wing' ? g(P.glintToneDb) : 0;
      break;
    case 'hollow': {
      // The Hush rises close and dry from the opening to the closing; the lights dim to silence; the lamp
      // swells toward her light; hidden, everything holds its breath, and the hum stops dead.
      const [o0] = span(HOLLOW, 'open', [6, 7.5]);
      const [, c1] = span(HOLLOW, 'close', [12, 13]);
      const near = env(b, [o0 - 0.5, o0 + 1.5]) * (1 - env(b, [c1, c1 + 2]));
      m.hush = 0.7 + near * (g(P.hollowHushDb) - 0.7);
      m.soilHz = 420 + near * 2600;
      const [d0, d1] = span(HOLLOW, 'dim', [24, 26]);
      // The wood draws back while the Hush is close; then its lights dim to silence.
      m.bed = (1 - 0.5 * near) * (1 - env(b, [d0, d1]));
      const [pu0, pu1] = span(HOLLOW, 'pulse', [25, 27]);
      m.pulse = b > pu0 && b < pu1 ? 3 : 1;
      const [l0] = span(HOLLOW, 'lampLit', [26.5, 27.6]);
      const [h0] = span(HOLLOW, 'hide', [35.6, 43]);
      const wash = (HOLLOW as { wash?: { back?: number; dark?: number } }).wash ?? {};
      const stop = h0 + (wash.back ?? 6.2);
      const hidden = (v.inFerns && (v.fold ?? 0) > 0.5) || b >= h0;
      m.lamp = b < l0 || b >= stop ? 0 : g(P.lampDb) * (0.25 + 0.75 * env(b, [l0, l0 + 5]));
      if (hidden && b < stop) {
        m.hold = true;
        m.knock = false;
        m.bed = 0;
        m.pulse = 0;
      }
      // After the wash goes dark the wood breathes out again.
      if (b >= stop) m.bed = env(b, [stop + 0.5, stop + 4]) * 0.8;
      m.glint = b > (span(HOLLOW, 'land', [16, 17.2])[0] ?? 16) && !hidden ? g(P.glintToneDb) : 0;
      break;
    }
    case 'summit': {
      // Up high: wind, the mountain's breath huge and slow (low, open), no pool, no drips.
      m.bed = 0.8;
      m.hush = g(P.mountainDb);
      m.soilHz = 260;
      m.pulse = 0.6;
      // The glint: held out, folded away under his wing (dim), then unfolded alone (full).
      {
        const [fb0] = span(SUMMIT, 'foldBack', [99, 99]);
        const [al0] = span(SUMMIT, 'alone', [99, 99]);
        m.glint = g(P.glintToneDb) * (b >= fb0 && b < al0 ? 0.3 : 1);
      }
      break;
    }
    case 'wake': {
      // Silence over the title and the black (after the Hush's call); then just wind and her glint.
      const [fu0, fu1] = span(WAKE, 'fadeUp', [7.2, 8.6]);
      const up = env(b, [fu0, fu1]);
      m.bed = up * 0.7;
      m.hush = up * 0.4;
      m.pulse = 0;
      m.knock = false;
      m.glint = up * g(P.glintToneDb);
      break;
    }
  }
  return m;
}
