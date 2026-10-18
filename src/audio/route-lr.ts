/**
 * Lanternroot as sound (memory/audio.md "Lanternroot", docs/design/levels/proto-1.md §6): pure like router.ts.
 * `routeLantern` turns the level's light events into cues (null for any other event); `signNotes` is the signs'
 * flashing phrase, heard near them, on the sim's own clock so it keeps time with what render draws (kit.ts
 * `phraseLit`). The events are read loosely: the sound builds against a sim with or without them.
 */
import type { SoundId } from './bake';
import { type AudioSnap, type Cue, cue, type RouteContext } from './router';
import { AUDIO } from './tuning';

/** A light event, as much of it as the sound reads. */
type LightLoose = {
  type: string;
  x: number;
  y: number;
  n?: number;
  glow?: number;
  max?: number;
  from?: string;
  frames?: number;
  how?: string;
};

const LIGHT = new Set([
  'bossCue',
  'glowGain',
  'mendStart',
  'mend',
  'lureKindle',
  'kindleRefuse',
  'lureGutter',
  'lureCold',
  'lureFan',
  'wickSet',
  'mossOn',
  'mossOff',
  'gust',
  'gustHit',
  'bellHit',
  'bellDull',
  'bellAnswer',
]);

export function routeLantern(
  ev: { type: string },
  i: number,
  snap: AudioSnap,
  ctx: RouteContext,
): Cue[] | null {
  if (!LIGHT.has(ev.type)) return null;
  const e = ev as LightLoose;
  const L = AUDIO.lr;
  const f = snap.frame;
  const h = snap.hero;
  const mine = (sound: SoundId, db: number, over: Partial<Cue> = {}, k = 0): Cue =>
    cue(sound, 'hero', ctx, f, i * 8 + k, { x: h.x, y: h.y - 40, db, place: 'hero', priority: 4, ...over });
  const placed = (
    bus: 'lantern' | 'world',
    sound: SoundId,
    db: number,
    over: Partial<Cue> = {},
    k = 0,
  ): Cue => cue(sound, bus, ctx, f, i * 8 + k, { x: e.x, y: e.y, db, priority: 4, ...over });
  /** The first of this step's events of a type (many moss pieces at once are one sound). */
  const first = (): boolean =>
    (ctx.events ?? []).findIndex((o) => (o as { type: string }).type === e.type) === i;
  switch (e.type) {
    case 'bossCue': {
      // The Gloamweaver's P3: the moon-hole opens (a cold bloom, the moss lighting round the hub).
      const c = ev as { set?: string; cue?: string };
      if (c.set !== 'p3' || c.cue !== 'moonhole') return null;
      return [
        placed('lantern', 'kindle', L.kindleDb + 2, { priority: 7, far: 0.3, cents: -500 }),
        placed('lantern', 'mossOn', L.mossDb + 4, { delay: 0.3 }, 1),
      ];
    }
    case 'glowGain': {
      // A spark (or a few) reaching her: a glass tick climbing the chord with how full she is; full, a bell.
      const max = Math.max(1, e.max ?? 18);
      const fill = Math.max(0, Math.min(1, (e.glow ?? 0) / max));
      const step = Math.min(L.glowCents.length - 1, Math.floor(fill * (L.glowCents.length - 1)));
      const out = [mine('glowChime', L.glowDb, { cents: (L.glowCents[step] ?? 0) + 0, delay: 0.06 })];
      if ((e.glow ?? 0) >= max && (e.glow ?? 0) - (e.n ?? 0) < max)
        out.push(mine('glowBell', L.glowBellDb, { delay: 0.18, priority: 6 }, 1));
      return out;
    }
    case 'mendStart':
      return [mine('mendDraw', L.mendDb)];
    case 'mend':
      return [mine('mendLand', L.mendLandDb, { priority: 6 })];
    case 'lureKindle':
      return [placed('lantern', 'kindle', L.kindleDb, { priority: 6, far: 0.15 })];
    case 'kindleRefuse':
      return [placed('lantern', 'kindleRefuse', L.refuseDb)];
    case 'lureGutter': {
      // Its last seconds: ticks of cooling glass, coming faster (a clock you can hear).
      const s = Math.max(0.4, (e.frames ?? 120) / 60);
      const out: Cue[] = [];
      let t = 0;
      for (let k = 0; k < 8 && t < s; k++) {
        out.push(placed('lantern', 'gutter', L.gutterDb + k * 0.6, { delay: t, priority: 2 }, k));
        t += 0.42 * (1 - k / 10);
      }
      return out;
    }
    case 'lureCold':
      return [placed('lantern', 'wickCold', L.coldDb)];
    case 'lureFan':
      return [placed('lantern', 'fan', L.fanDb)];
    case 'wickSet':
      return [placed('lantern', 'bellAnswer', L.bellAnswerDb - 4, { priority: 6, far: 0.3 })];
    case 'mossOn':
      return first() ? [placed('lantern', 'mossOn', L.mossDb)] : [];
    case 'mossOff':
      return first() ? [placed('lantern', 'mossOff', L.mossDb - 2)] : [];
    case 'gust':
      return [mine('gust', L.gustDb, { priority: 5 })];
    case 'gustHit':
      return [placed('world', 'gustHit', L.gustHitDb)];
    case 'bellHit': {
      const n = Math.max(1, e.n ?? 1);
      return [
        placed('world', 'bellChime', L.bellDb, {
          cents: L.bellCents[Math.min(L.bellCents.length - 1, n - 1)] ?? 0,
          priority: 6,
        }),
      ];
    }
    case 'bellDull':
      return [placed('world', 'bellDull', L.bellDullDb)];
    case 'bellAnswer':
      return [placed('world', 'bellAnswer', L.bellAnswerDb, { priority: 7, far: 0.4 })];
  }
  return null;
}

/** Seconds of a sign's flash, gaps by beat (`.` short, `-` long), and its pause: kit.ts `phraseLit` keeps the same. */
export const PHRASE = { beat: 0.18, short: 0.28, long: 0.7, pause: 2.2 } as const;

/** The onsets (s into one loop) of a phrase's flashes, and the loop's length. */
export function phraseOnsets(rhythm: string): { at: number[]; total: number } {
  const gaps = [...rhythm].map((c) => (c === '-' ? PHRASE.long : PHRASE.short));
  const at: number[] = [];
  let t = 0;
  for (let k = 0; k <= gaps.length; k++) {
    at.push(t);
    t += PHRASE.beat + (k < gaps.length ? (gaps[k] as number) : 0);
  }
  return { at, total: t + PHRASE.pause };
}

/** The signs near her flashing their phrase this sim frame: one soft chime per flash. */
export function signNotes(snap: AudioSnap, ctx: RouteContext): Cue[] {
  const signs = ctx.scene.signs ?? [];
  const out: Cue[] = [];
  const h = snap.hero;
  const L = AUDIO.lr;
  signs.forEach((s, k) => {
    if (!s.rhythm || Math.hypot(s.x - h.x, s.y - h.y) > L.signPx) return;
    const { at, total } = phraseOnsets(s.rhythm);
    const t0 = (snap.frame / 60 + k * 1.7) % total;
    const t1 = t0 + 1 / 60;
    at.forEach((a, j) => {
      if (a >= t0 && a < t1)
        out.push(
          cue('signNote', 'world', ctx, snap.frame, 140 + k * 12 + j, {
            x: s.x,
            y: s.y - 44,
            db: L.signDb,
            priority: 2,
            far: 0.1,
          }),
        );
    });
  });
  return out;
}
