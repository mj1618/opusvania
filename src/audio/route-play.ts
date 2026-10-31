/**
 * Play, as sound (memory/audio.md, the greybox-era pass): her moves, the thorn blade and what it meets,
 * the lamps' fling and snuff, the creatures' tells. Pure like router.ts: `routePlay` returns the cues an
 * event asks for, or null when it is not play (the router's grove sounds and giving then take it).
 *
 * The blade is the loud family: a blow is a crack (the meat) and a tick (the pitch, so it reads through
 * anything), both at the target but never quieter for distance; a kill adds a crunch and a tail. Her
 * hurt muffles the mix for the stagger (a layer, router.ts). Tells are heard as long as they last: a
 * creak's variant is the one nearest the tell's length, so the creak is the countdown.
 */

import { releaseFreeze, releaseGreat, releaseTicks } from '../render/lantern/release';
import { LOOK } from '../render/scene/lib/room-look';
import type { SimEvent } from '../sim/events';
import type { SoundId } from './bake';
import { CREAK_S, MOTH_CENTS, REAR_S } from './bake-play';
import { hash01, salt } from './dsp';
import { type AudioSnap, amp, type Cue, clamp01, cue, materialAt, type RouteContext } from './router';
import { AUDIO, type BusId, LAMP_HZ } from './tuning';

/** Creature kinds (a slash on anything else is a pod, a flame or the kit). */
const CREATURES = new Set([
  'burrback',
  'lampwing',
  'oldBurrback',
  'hawker',
  'web',
  'weaver',
  'weaverBoss',
  'gloamweaver',
  'mantis',
  'dangler',
  'juvenileBurrback',
  'carrier',
]);
const BEETLES = new Set(['burrback', 'juvenileBurrback', 'oldBurrback']);
const FLYERS = new Set(['hawker', 'lampwing']);
const BIG = new Set(['oldBurrback', 'weaverBoss', 'gloamweaver', 'mantis']);

/** The variant whose length (s) is nearest `s`. */
function nearest(list: readonly number[], s: number): number {
  let best = 0;
  list.forEach((v, k) => {
    if (Math.abs(v - s) < Math.abs((list[best] as number) - s)) best = k;
  });
  return best;
}

/** Cents from a wick's hum to a lamp kind's (the snuff is baked at the wick's). */
function lampCents(kind: string | undefined): number {
  const hz = kind === 'lantern' ? LAMP_HZ.lantern : kind === 'wick' || !kind ? LAMP_HZ.wick : LAMP_HZ.great;
  return 1200 * Math.log2(hz / LAMP_HZ.wick);
}

/**
 * The fling's events (src/sim/events.ts, memory/lures.md), spelled out here too so the sound builds against
 * a sim with or without them (the fling landed while this was written; identical members merge in the union).
 */
export type FlingEvent =
  | { type: 'flingStart'; id: string; x: number; y: number; frames: number }
  | { type: 'fling'; id: string; x: number; y: number; vx: number; vy: number; aimX: number; aimY: number }
  | { type: 'lureRelight'; id: string; x: number; y: number }
  | { type: 'lureEmber'; id: string; x: number; y: number };
export type PlayEvent = SimEvent | FlingEvent;

/** Round 7's blow fields (a creature's weight), and a snuff by a fling: read loosely, like the fling. */
type Loose = { weight?: 'light' | 'medium' | 'heavy'; fling?: boolean; trap?: boolean };

export function routePlay(e: PlayEvent, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] | null {
  const H = AUDIO.hero;
  const C = AUDIO.combat;
  const A = AUDIO.lamp;
  const K = AUDIO.creatures;
  const f = snap.frame;
  const h = snap.hero;
  /** A few cents of seeded detune on top of a set pitch, so a repeated blow is never the same twice. */
  const jitter = (sound: SoundId, k: number, spread = 30) =>
    (hash01(ctx.seed, f, i, k, salt(sound)) - 0.5) * spread;
  const at = (
    bus: BusId,
    sound: SoundId,
    x: number,
    y: number,
    db: number,
    over: Partial<Cue> = {},
    k = 0,
  ): Cue => cue(sound, bus, ctx, f, i * 8 + k, { x, y, db, ...over });
  // (Some events have no position (`collapseFront`): her feet then.)
  const ex = (e as { x?: number }).x ?? h.x;
  const ey = (e as { y?: number }).y ?? h.y;
  /** Hers: pans with her, never quieter for distance. */
  const hero = (sound: SoundId, db: number, over: Partial<Cue> = {}, k = 0) =>
    at('hero', sound, ex, ey, db, { place: 'hero', priority: 3, ...over }, k);
  /** The blade's: at the target (or her) but at full level wherever the camera is. */
  const blow = (sound: SoundId, x: number, y: number, db: number, over: Partial<Cue> = {}, k = 0) =>
    at('combat', sound, x, y, db, { place: 'hero', priority: 5, ...over }, k);
  /** A creature's: placed in the world (pan and distance from the camera). */
  const beast = (sound: SoundId, db: number, over: Partial<Cue> = {}, k = 0) =>
    at('creatures', sound, ex, ey, db, { priority: 4, ...over }, k);

  switch (e.type) {
    // --- Her moves: air, felt, scale-dust. ---
    case 'jump': {
      if (e.kind === 'wall')
        return [hero('wing', H.wingDb - 1), hero('kick', H.kickDb, { x: e.x - e.dir * 14, priority: 3 }, 1)];
      if (e.kind !== 'double') return [hero('wing', H.wingDb)];
      // The somersault: two beats and a whoosh that crosses her as she turns.
      const dir = e.dir || h.facing || 1;
      return [
        hero('wing', H.wingDb - 1),
        hero('wing', H.wingDb - 3, { delay: H.flutterS, cents: -60 }, 1),
        hero('whoosh', H.whooshDb, { pan: -0.35 * dir, panTo: 0.35 * dir }, 2),
      ];
    }
    case 'glideStart': {
      // The wings always open with a whoosh; out of a long fall they catch the air with a deep whumpf too.
      const k = clamp01((e.vy - H.catchVy[0]) / (H.catchVy[1] - H.catchVy[0]));
      const out = [hero('wingOpen', H.openDb + amp(0.55 + 0.45 * k))];
      if (k > 0) out.push(hero('catch', H.catchDb + amp(0.2 + 0.8 * k), { cents: -180 * k }, 1));
      return out;
    }
    case 'glideEnd':
      // Let go in the air (or a fast fall): the wings fold. Landing, a wall, a dash, a blow have their own sound.
      return e.reason === 'release' || e.reason === 'fastfall'
        ? [hero('wingFold', H.foldDb, { priority: 1 })]
        : [];
    case 'dashStart':
      // The wind-up frames are silent (the hold is the sound); the gust comes as she moves.
      return [hero('dash', H.dashDb, { delay: Math.max(1, h.freeze) / 60 })];
    case 'land': {
      const mat = materialAt(ctx.scene, e.x, e.y);
      const k = clamp01((e.vy - H.dustVy[0]) / (H.dustVy[1] - H.dustVy[0]));
      const out: Cue[] = [];
      if (mat === 'water') out.push(hero('splash', H.dustDb + amp(0.4 + 0.6 * k)));
      else out.push(hero('dust', H.dustDb + amp(0.25 + 0.75 * k)));
      if (e.hard && mat !== 'water')
        out.push(hero(mat === 'wood' ? 'thumpWood' : 'thump', H.thumpDb, { priority: 4 }, 1));
      return out;
    }
    case 'step': {
      // Soft: a tick on wood, a felted pad on earth and moss.
      const mat = materialAt(ctx.scene, e.x, e.y);
      if (mat === 'water') return [];
      return [hero(mat === 'wood' ? 'tick' : 'pad', mat === 'wood' ? H.tickDb : H.padDb, { priority: 0 })];
    }
    case 'wallSlideStart':
      return [hero('scrape', H.scrapeDb, { x: e.x + e.dir * 12 })];

    // --- The thorn blade. ---
    case 'slash': {
      const step = Math.min(3, Math.max(1, e.step)) as 1 | 2 | 3;
      const sound: SoundId = e.heavy ? 'slash3' : step === 1 ? 'slash1' : step === 2 ? 'slash2' : 'slash3';
      const dir = e.dir === 'up' ? C.dirCents.up : e.dir === 'down' ? C.dirCents.down : 0;
      const db = (C.slashDb[step - 1] ?? -25) + (e.heavy ? 3 : 0);
      return [
        at('combat', sound, e.x, e.y - 40, db, {
          place: 'hero',
          priority: 3,
          cents: dir + jitter(sound, 0, 60),
        }),
      ];
    }
    case 'slashHit': {
      const kind = e.target.kind;
      const step = Math.min(3, Math.max(1, e.step));
      const ty = e.y;
      if (CREATURES.has(kind)) {
        const w = (e as Loose).weight ?? (BIG.has(kind) ? 'heavy' : kind === 'carrier' ? 'light' : 'medium');
        const wDb = C.weightDb[w];
        const wC = C.weightCents[w];
        if (e.pogo)
          return [
            blow('pogo', e.px, e.py + 40, C.pogoDb),
            blow('hitCrack', e.x, ty, C.crackDb - 7 + wDb, { cents: wC + jitter('hitCrack', 1) }, 1),
            blow('hitTick', e.x, ty, C.tickDb - 5, { cents: wC + jitter('hitTick', 2) }, 2),
          ];
        // The finisher (and a heavy throw-cut) hits harder: a louder crack, the tick a fourth down.
        const heavy = e.power >= 2;
        return [
          blow('hitCrack', e.x, ty, C.crackDb + wDb + (heavy ? 2 : 0), {
            cents: wC - (heavy ? 200 : 0) + jitter('hitCrack', 1),
          }),
          blow(
            'hitTick',
            e.x,
            ty,
            C.tickDb + (heavy ? 1 : 0),
            {
              cents: (C.tickCents[step - 1] ?? 0) + wC + jitter('hitTick', 2),
            },
            1,
          ),
        ];
      }
      const out: Cue[] = [];
      if (e.pogo) out.push(blow('pogo', e.px, e.py + 40, C.pogoDb));
      if (kind === 'lure')
        out.push(blow('hitTick', e.x, ty, C.flameDb, { cents: C.flameCents + jitter('hitTick', 2) }, 1));
      else if (kind === 'pod')
        out.push(blow('hitTick', e.x, ty, C.flameDb - 2, { cents: 498 + jitter('hitTick', 2) }, 1));
      else if (kind === 'bark' || kind === 'thorns')
        out.push(blow('thock', e.x, ty, C.thockDb, { cents: jitter('thock', 2, 80) }, 1));
      else if (kind === 'seedCase')
        out.push(blow('clang', e.x, ty, C.clangDb - 3, { cents: 300 + jitter('clang', 2) }, 1));
      return out;
    }
    case 'slashTerrain':
      return [blow('thock', e.x, e.y, C.thockDb, { cents: jitter('thock', 0, 80), priority: 3 })];
    case 'enemyBlock':
      // The blade glances off a braced shell: chitin rings; a down cut that glances still bounces her.
      return e.slash === 'down'
        ? [blow('clang', e.hitX, e.hitY, C.clangDb - 2), blow('pogo', h.x, h.y, C.pogoDb - 2, {}, 1)]
        : [blow('clang', e.hitX, e.hitY, C.clangDb, { cents: jitter('clang', 0, 50) })];
    case 'kitClang':
      return [blow('clang', e.hitX, e.hitY, C.clangDb, { cents: 300 + jitter('clang', 0, 50) })];
    case 'barkBreak':
      return [
        blow('crunch', e.x, e.y, C.crunchDb - 3, { cents: -600 }),
        blow('thumpWood', e.x, e.y, H.thumpDb, {}, 1),
      ];
    case 'enemyDie': {
      const big = BIG.has(e.kind);
      // A pop and a crunch of shell, then the little tail as the bits settle (a beat after the hitstop).
      const out = [
        blow('crunch', e.x, e.y, C.crunchDb + (big ? 2 : 0), {
          cents: (big ? -500 : 0) + jitter('crunch', 0, 60),
          priority: 6,
        }),
        blow('killTail', e.x, e.y, C.tailDb, { delay: C.tailS + e.hitstop / 60, priority: 2, far: 0.15 }, 1),
      ];
      if (big) out.push(blow('slam', e.x, e.y, K.slamDb - 4, { delay: 0.05 }, 2));
      return out;
    }
    case 'enemyCrack':
      return [blow('crunch', e.x, e.y, C.crackShellDb, { cents: -300 + jitter('crunch', 0, 60) })];
    case 'hurt':
      return [at('combat', 'hurt', e.hitX, e.hitY, C.hurtDb, { place: 'hero', priority: 7 })];
    case 'capBounce':
      return [hero('bounce', C.bounceDb + (e.held ? 1 : 0), { cents: jitter('bounce', 0, 80) })];
    case 'webCut':
    case 'enemyThreadCut':
      return [blow('silkSnap', e.x, e.y, C.silkDb)];

    // --- The lamps: the fling (snap, aim, launch), the ember, the snuff and the freed moths. ---
    case 'flingStart':
      return [at('lantern', 'slowIn', e.x, e.y, A.slowDb, { place: 'hero', priority: 6 })];
    case 'fling': {
      const side = Math.abs(e.aimX) > 0.2 ? Math.sign(e.aimX) : 0;
      return [
        hero('launch', A.launchDb, { x: h.x, y: h.y, pan: -0.3 * side, panTo: 0.45 * side, priority: 6 }),
        hero('wing', H.wingDb - 2, { x: h.x, y: h.y, delay: 0.03 }, 1),
      ];
    }
    case 'lureEmber': {
      // The flame goes out as she leaves it: its own tone falling away into a soft breath of air.
      const kind = ctx.scene.lures?.find((l) => l.id === e.id)?.kind;
      return [
        at('lantern', 'snuff', e.x, e.y, A.snuffDb, { place: 'hero', cents: lampCents(kind), priority: 5 }),
      ];
    }
    case 'lureSnuff': {
      const flung = !!(e as Loose).fling;
      const out: Cue[] = [];
      // Cut out (not flung from): the snuff's falling tone now; flung from, it fell at the ember.
      if (!flung)
        out.push(
          at('lantern', 'snuff', e.x, e.y, A.snuffDb, {
            place: 'hero',
            cents: lampCents(e.kind),
            priority: 6,
          }),
        );
      // A trap's release (the Canopy r11): its own beat, timed with the picture (render/lantern/release.ts).
      if ((e as Loose).trap) return [...out, ...release(e.x, e.y, e.moths)];
      // A chain's embers go out together on the landing: one phrase climbing the chord, one rush of wings.
      const all: PlayEvent[] = (ctx.events ?? [e]).filter((q) => q.type === 'lureSnuff');
      const j = Math.max(0, all.indexOf(e));
      return [...out, ...moths(e.x, e.y, e.moths, flung ? 0.05 : 0.32, j, all.length)];
    }
    case 'lureRelight':
      // Embers catch again (a failed chain): the snap-in heard backwards would be too much; a soft swell up. Only a
      // flame still burning after the step (round 13: the gap's dark hooks were relit and put out again every frame,
      // five relights a frame before the chase: 259 swells in 13 s).
      if (!(snap.lures ?? []).some((l) => Math.abs(l.x - e.x) < 8 && Math.abs(l.y - e.y) < 8)) return [];
      return [at('lantern', 'slowIn', e.x, e.y, A.slowDb - 6, { cents: 700, priority: 3 })];
    case 'lureBeat':
      return [hero('wing', A.beatDb, { x: h.x, y: h.y })];
    case 'lureFree':
      return e.how === 'beat' ? [hero('launch', A.launchDb - 3, { x: h.x, y: h.y })] : [];

    // --- Creatures: tells you can hear (a player who listens plays better), moves, answers. ---
    case 'enemyWindup': {
      const s = e.frames / 60;
      if (BEETLES.has(e.kind)) {
        const big = e.kind === 'oldBurrback';
        return [
          beast('creak', K.creakDb + (big ? 3 : e.kind === 'juvenileBurrback' ? -3 : 0), {
            variant: nearest(CREAK_S, s),
            cents: (big ? -500 : e.kind === 'juvenileBurrback' ? 300 : 0) + jitter('creak', 0, 40),
          }),
        ];
      }
      if (e.kind === 'dangler' || e.kind === 'weaver' || e.kind === 'weaverBoss')
        return [
          beast('silkTense', K.silkDb, { cents: e.kind === 'dangler' ? 0 : -500 }),
          ...(e.kind === 'dangler' ? [beast('drop', K.dropDb, { delay: s }, 1)] : []),
        ];
      return [];
    }
    case 'enemyCharge':
      return BEETLES.has(e.kind)
        ? [
            beast('rumble', K.rumbleDb + (e.kind === 'oldBurrback' ? 4 : 0), {
              cents: e.kind === 'oldBurrback' ? -400 : 0,
            }),
          ]
        : [];
    case 'enemyRecover':
      // A ram into a wall: a thud and the shell ringing.
      return e.cause === 'wall'
        ? [beast('thumpWood', K.wallDb), beast('clang', K.wallDb - 4, { cents: -900, delay: 0.02 }, 1)]
        : [];
    case 'enemyNotice':
      if (FLYERS.has(e.kind)) return [beast('buzzUp', K.buzzDb, { cents: e.kind === 'lampwing' ? 500 : 0 })];
      if (BEETLES.has(e.kind)) return [beast('catchBreath', AUDIO.giving.sniffDb, { cents: -300 })];
      return [];
    case 'enemyDive':
      return FLYERS.has(e.kind) ? [beast('dive', K.diveDb, { cents: e.kind === 'lampwing' ? 500 : 0 })] : [];
    case 'enemyRear':
      return [beast('rear', K.rearDb, { variant: nearest(REAR_S, e.frames / 60), priority: 6 })];
    case 'enemySlam':
      return [
        beast('slam', K.slamDb + (e.big ? 2 : 0), { cents: e.big ? -200 : 0, priority: 6, place: 'hero' }),
      ];
    case 'enemyRoll':
      return [beast('rumble', K.rumbleDb + 4, { cents: -600 })];
    case 'enemyBounce':
      return [beast('thumpWood', K.wallDb), beast('clang', K.wallDb - 6, { cents: -1200 }, 1)];
    case 'enemyUnroll':
    case 'enemyFeint':
      return [beast('thump', K.wallDb - (e.type === 'enemyFeint' ? 6 : 0))];
    case 'enemyPhase':
      return [beast('settle', K.rearDb - 4, { cents: -400 })];
    case 'enemyTaproot':
      return [beast('creak', K.creakDb, { variant: nearest(CREAK_S, e.frames / 60), cents: -800 })];
    case 'enemyWake':
      return [beast('catchBreath', K.rearDb - 6, { cents: -700 })];
    case 'enemyArrive': {
      // An ambush's creature comes (the Canopy r8): from where it shows. A beetle scrabbles out of the earth (a
      // short rumble, higher for a juvenile), and a drop lands with a thump; a flyer's wings.
      const from = { x: e.fromX, y: e.fromY };
      if (FLYERS.has(e.kind)) return [beast('flutter', K.buzzDb - 3, from)];
      const drop = e.y - e.fromY > 150;
      const out = [
        beast('rumble', K.rumbleDb - 8, { ...from, cents: e.kind === 'juvenileBurrback' ? 500 : 200 }),
      ];
      if (drop) out.push(beast('thump', K.wallDb - 4, { delay: e.frames / 60 }, 1));
      return out;
    }
    case 'enemyDisperse':
      return e.quiet || e.how !== 'leave' ? [] : [beast('flutter', K.buzzDb - 4)];
    case 'enemySnatch':
      // A hawker took a circling moth: one small chime, falling.
      return [beast('glintNote', A.chimeDb - 4, { cents: -1200 })];
    case 'grab':
      return [beast('silkSnap', K.silkDb, { cents: -500, x: e.x, y: e.y })];
    default:
      return null;
  }

  /**
   * The freed moths: chimes rising up the forest's chord (in tune, unlike the lamp) and a rush of wings.
   * Flame `j` of `of` going out in one step takes its share of one phrase (the rush plays once).
   */
  /**
   * A trap's release (render/lantern/release.ts): the bars snap on the cut (in the hold), then once the hold lets go
   * the swell comes up under the stream, one chime per count tick climbing the forest's chord (thinned to at most
   * `R.chimes`), and a rush of wings as they leave her. The great cage: lower, longer, two rushes.
   */
  function release(x: number, y: number, n: number): Cue[] {
    const R = A.release;
    const great = releaseGreat(n);
    const hold = releaseFreeze(n) / 60;
    const ticks = releaseTicks(n);
    const out: Cue[] = [
      at(
        'lantern',
        'cageBreak',
        x,
        y,
        R.breakDb + (great ? 3 : 0),
        { place: 'hero', priority: 6, cents: great ? -500 : 0 },
        1,
      ),
      at(
        'lantern',
        'releaseSwell',
        x,
        y,
        // (r14: under the great cage's column the score carries the moment; the swell sits back.)
        R.swellDb - (great ? 4 : 0),
        { place: 'fixed', pan: 0, delay: hold + 0.15, priority: 5, cents: great ? -1200 : 0 },
        2,
      ),
    ];
    const max = great ? R.chimesGreat : R.chimes;
    const every = Math.max(1, Math.ceil(ticks.length / max));
    let c = 0;
    for (let k = 0; k < ticks.length; k += every, c++) {
      const note = c % MOTH_CENTS.length;
      const up = Math.floor(c / MOTH_CENTS.length) * 1200;
      out.push(
        at(
          'lantern',
          'glintNote',
          x,
          y,
          // (r15: the great cage's count ticks with the HUD, which steps out of the column's quiet: they draw back.)
          R.chimeDb - c * 0.35 + (great ? AUDIO.canopy.quietChimeDb : 0),
          {
            place: 'hero',
            delay: hold + (ticks[k] as number),
            cents: (MOTH_CENTS[note] ?? 0) + up + (great ? -1200 : 0) + jitter('glintNote', c, 6),
            priority: 3,
          },
          3 + c,
        ),
      );
    }
    const leave = hold + (ticks[0] ?? 2);
    // The rush pans toward the moon's side of the sky, where the stream goes.
    const side = (LOOK.moon ? Math.sign(LOOK.moon.x - 960) || 1 : 1) * 0.6;
    out.push(
      at(
        'lantern',
        'mothRush',
        x,
        y,
        A.rushDb + R.rushUp,
        { place: 'fixed', pan: 0, panTo: side, delay: leave, priority: 3 },
        60,
      ),
    );
    if (great)
      out.push(
        at(
          'lantern',
          'mothRush',
          x,
          y,
          A.rushDb + R.rushUp + 2,
          { place: 'fixed', pan: -0.3, panTo: side, delay: leave + 1.4, priority: 3 },
          61,
        ),
      );
    return out;
  }

  function moths(x: number, y: number, n: number, start: number, j: number, of: number): Cue[] {
    const per = of > 1 ? Math.max(1, Math.floor(MOTH_CENTS.length / of)) : A.chimes;
    const count = Math.min(per, Math.max(1, n));
    const out: Cue[] = [];
    for (let k = 0; k < count; k++) {
      const note = Math.min(MOTH_CENTS.length - 1, j * per + k);
      out.push(
        at(
          'lantern',
          'glintNote',
          x,
          y,
          A.chimeDb - note * 0.5,
          {
            place: 'hero',
            delay: start + note * A.chimeGapS,
            cents: (MOTH_CENTS[note] ?? 0) + jitter('glintNote', k, 8),
            priority: 3,
          },
          2 + k,
        ),
      );
    }
    if (j === 0)
      out.push(
        at(
          'lantern',
          'mothRush',
          x,
          y,
          A.rushDb + (of > 1 ? 3 : 0),
          { place: 'fixed', pan: -0.2, panTo: 0.5, delay: start, priority: 2 },
          1,
        ),
      );
    return out;
  }
}
