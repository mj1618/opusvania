/**
 * The Canopy's world as sound (docs/design/levels/canopy-moments.md §5; memory/audio.md "The Canopy"). Pure like the
 * router: extra cues for an event (`routeCanopy`, added to whatever else the event asks for), the world's own cues per
 * sim frame (`canopyAmbient`: far insects, earth trickling, a drip's echo in the well, the firefly blinking as it flies,
 * freed moths stirring at their roosts, burrbacks huffing as they hunt her), and its continuous layers
 * (`canopyLayers`: the earth's rumble, the swarm over the hatch, the valley's false lights, the flyers' wings).
 *
 * The firefly's voice is its light: small cold glass pings tuned to the lamps (38 cents sharp, out of tune with the
 * world), its call three short and one long. Never answered here.
 *
 * The round-12 Keeper's events (`enemyFeed`, `cageDrop`, `mothSaved`, `mothEaten`, `cageSwing`, `cageFall`,
 * `cageRelease`) are read loosely: they sound when the sim lands them.
 */
import { noteOf } from './bake-music';
import { CREAK_S, MOTH_CENTS, REAR_S } from './bake-play';
import { dbToGain, hash01, salt } from './dsp';
import type { PlayEvent } from './route-play';
import {
  type AudioCam,
  type AudioSnap,
  amp,
  type Cue,
  clamp01,
  cue,
  type Layers,
  panOf,
  type RouteContext,
} from './router';
import { AUDIO, bedOf, LAMP_BEAT, LAMP_HZ } from './tuning';

type Loose = PlayEvent & {
  x: number;
  y: number;
  w?: number;
  h?: number;
  kind?: string;
  trap?: boolean;
  flag?: string;
  id?: string;
  presses?: number;
  phase?: string;
  n?: number;
  of?: number;
  lure?: string;
  why?: string;
  frames?: number;
  sweep?: boolean;
  on?: boolean;
  hitX?: number;
  hitY?: number;
  x0?: number;
  x1?: number;
  toX?: number;
  what?: string;
  tell?: number;
  cp?: number;
};

/** The lamp kind's hum row for a lure kind (route-play's rule: the ring and great lamps share the great's). */
const humKey = (kind: string): keyof typeof LAMP_HZ =>
  kind === 'wick' ? 'wick' : kind === 'lantern' ? 'lantern' : 'great';

/** The firefly's alarm: a burst of fast bright pings (its light flashing). */
function alarm(
  x: number,
  y: number,
  n: number,
  db: number,
  i: number,
  snap: AudioSnap,
  ctx: RouteContext,
): Cue[] {
  return Array.from({ length: n }, (_, k) =>
    cue('fireflyBlink', 'lantern', ctx, snap.frame, i * 8 + k, {
      x,
      y,
      db: db - k * 0.6,
      delay: k * 0.065 + hash01(ctx.seed, snap.frame, k, salt('alarm')) * 0.012,
      variant: 0,
      cents: 700 + (k % 2) * 500,
      priority: 4,
    }),
  );
}
const BOSS_KINDS = new Set(['oldBurrback', 'keeper']);

/** The firefly's call: three short, one long (`gap` s between the shorts). */
function call(
  x: number,
  y: number,
  db: number,
  gap: number,
  far: number,
  i: number,
  snap: AudioSnap,
  ctx: RouteContext,
): Cue[] {
  return [0, 1, 2, 3].map((k) =>
    cue('fireflyBlink', 'lantern', ctx, snap.frame, i * 8 + k, {
      x,
      y,
      db: db - (k === 3 ? 0 : 2),
      delay: k < 3 ? k * gap : 2 * gap + gap * 1.8,
      variant: k < 3 ? 0 : 2,
      cents: 0,
      far,
      priority: 4,
    }),
  );
}

export function routeCanopy(e: PlayEvent, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] {
  const C = AUDIO.canopy;
  const f = snap.frame;
  const q = e as Loose;
  const h = snap.hero;
  const at = (sound: Cue['sound'], bus: Cue['bus'], db: number, over: Partial<Cue> = {}, k = 0) =>
    cue(sound, bus, ctx, f, i * 8 + k, { x: q.x ?? h.x, y: q.y ?? h.y, db, ...over });
  switch (e.type as string) {
    // The cocoon: each press a dry crackle of silk (unpitched, no blip); the breakout tears it and the wings open.
    case 'hatchStir':
      return [
        at('crunch', 'hero', -31 + (q.presses ?? 0), { place: 'hero', cents: 1000, priority: 3 }),
        at('scrape', 'hero', -33, { place: 'hero', delay: 0.04, priority: 2 }, 1),
      ];
    case 'hatch':
      return [
        at('crunch', 'hero', -25, { place: 'hero', cents: 700, priority: 5 }),
        at('wingOpen', 'hero', -24, { place: 'hero', delay: 0.12, priority: 5 }, 1),
      ];
    // The firefly: its call as it comes out, a struck match of glass at each lamp it lights, a hang's thread and
    // hook, a slow call as it goes (nothing answers).
    case 'fireflyStart':
      return call(q.x, q.y, C.callDb, 0.17, 0.2, i, snap, ctx);
    case 'fireflyRelight':
      return [at('fireflyKindle', 'lantern', C.kindleDb, { priority: 4 })];
    case 'fireflyHang':
      return [
        at('silkSnap', 'lantern', C.clinkDb, { cents: 900, priority: 4 }),
        at('clink', 'lantern', C.clinkDb, { delay: 0.12, priority: 3 }, 1),
      ];
    case 'fireflyEnd':
      return call(q.x, q.y, C.callDb - 4, 0.34, 0.6, i, snap, ctx);
    // The chase (moment 4): the alarm on its bolt, a short alarm while it waits for her, two pings as it goes on; at
    // the nest the music stops dead (score.ts) and its one slow call goes up the shaft, nothing answering.
    case 'fireflyChase':
      if (q.phase === 'start') return alarm(q.x, q.y, 7, C.callDb + 1, i, snap, ctx);
      if (q.phase === 'wait') return alarm(q.x, q.y, 3, C.callDb - 3, i, snap, ctx);
      if (q.phase === 'go') return alarm(q.x, q.y, 2, C.callDb - 2, i, snap, ctx);
      if (q.phase === 'call') return call(q.x, q.y, C.callDb, 0.55, 0.55, i, snap, ctx);
      // (r14) A fall put her back at her last hook: its air catches her (a soft swell at the flame, a wing) and the
      // firefly flashes twice where it waits. The music goes on where it was (score.ts).
      if (q.phase === 'back')
        return [
          at('slowIn', 'lantern', AUDIO.lamp.slowDb - 4, { x: h.x, y: h.y - 40, cents: 700, priority: 4 }),
          at(
            'wingOpen',
            'hero',
            C.backWingDb,
            { place: 'hero', x: h.x, y: h.y, delay: 0.08, priority: 3 },
            1,
          ),
          ...alarm(q.x, q.y, 2, C.callDb - 4, i, snap, ctx).map((c) => ({ ...c, delay: c.delay + 0.3 })),
        ];
      if (q.phase === 'gone')
        return [at('mothRush', 'lantern', AUDIO.lamp.rushDb - 8, { cents: 600, far: 0.6, priority: 2 })];
      return [];
    // A hook catches fire as it passes: a struck match of glass and the hum swelling in (its phrase note is the
    // score's, score.ts `stings`).
    case 'fireflyKindle':
      return [
        at('fireflyKindle', 'lantern', C.kindleDb + 1, { priority: 4 }),
        at('slowIn', 'lantern', AUDIO.lamp.slowDb - 6, { cents: 700, delay: 0.05, priority: 2 }, 1),
      ];
    // The trap is set (moment 5): each moth caught out of the stream is a flutter and a tick at the cage's own
    // out-of-tune pitch, falling into the hum's beat: the first ones anywhere, the last exactly on it (quantised to
    // ever coarser divisions of `LAMP_BEAT`): you hear them caught. Full, the den answers from below.
    case 'trapFill': {
      const kind = humKey(snap.fill?.kind ?? 'wick');
      const T = 1 / LAMP_BEAT[kind];
      const k = clamp01((q.n ?? 0) / Math.max(1, q.of ?? 1));
      const div = k < 0.3 ? 8 : k < 0.55 ? 4 : k < 0.8 ? 2 : 1;
      const g = T / div;
      const now = f / 60;
      const loose = (1 - k) ** 2 * g * 0.9 * (hash01(ctx.seed, f, q.n ?? 0, salt('fill')) - 0.5);
      const delay = Math.max(0, Math.ceil(now / g - 1e-6) * g - now + loose);
      const cents = 1200 * Math.log2((LAMP_HZ[kind] * (kind === 'wick' ? 2 : 4)) / 880);
      return [
        at('wing', 'lantern', C.fillWingDb + 4 * k, { delay, cents: 1000, far: 0.3 * (1 - k), priority: 1 }),
        at(
          'glintNote',
          'lantern',
          C.fillTickDb + 5 * k,
          { delay, cents, dur: 0.12, release: 0.08, priority: 2 },
          1,
        ),
      ];
    }
    case 'denStir':
      return [
        at('slam', 'creatures', AUDIO.creatures.slamDb - 2, {
          place: 'fixed',
          pan: 0.3,
          cents: -600,
          far: 0.6,
          delay: 0.35,
          priority: 5,
        }),
        at(
          'rumble',
          'creatures',
          AUDIO.creatures.rumbleDb,
          { place: 'fixed', pan: 0.2, cents: -1100, far: 0.5, delay: 0.4, priority: 3 },
          1,
        ),
        at('trickle', 'world', C.trickleDb + 8, { delay: 0.9, far: 0.3, priority: 2 }, 2),
      ];
    // Moonlight for two (moment 3; r15 acted beat by beat, `kinBeat`): it shuffles over to her, felt on bark.
    case 'kinSit':
      return [0, 1, 2].map((k) =>
        at(
          'pad',
          'hero',
          C.kinWingDb - 10 - k,
          { place: 'hero', delay: 0.25 + k * 0.42, cents: 300 - 150 * k, priority: 2 },
          k,
        ),
      );
    case 'kinBeat':
      return kinBeat(q, at);
    // The arena's root gates: a heavy thud shutting her in; drawing back with a groan.
    case 'gateShut':
      return [
        at('gateThud', 'world', C.gateDb, {
          x: q.x + (q.w ?? 0) / 2,
          y: q.y + (q.h ?? 0) / 2,
          place: 'hero',
          priority: 5,
        }),
      ];
    case 'gateOpen':
      return [
        at('gateGroan', 'world', C.groanDb, {
          x: q.x + (q.w ?? 0) / 2,
          y: q.y + (q.h ?? 0) / 2,
          priority: 4,
        }),
      ];
    // A guarded cage: the blade glances off its bars. A cut on a cage: a bar snaps.
    case 'lureGuarded':
      return [at('clang', 'combat', AUDIO.combat.clangDb - 2, { place: 'hero', cents: 500, priority: 4 })];
    case 'lureHit':
      // (r16: and the bar it broke lands on the floor under it, a beat later.)
      return q.trap
        ? [
            at('clink', 'lantern', C.clinkDb + 2, { place: 'hero', priority: 3 }),
            at('clink', 'lantern', C.clinkDb - 6, { cents: -500, delay: 0.42, priority: 2 }, 1),
          ]
        : [];
    // A shut root door pushed from its far side (r16): a dull knock of wood and a little grit falling.
    case 'shortcutShut':
      return [
        at('thock', 'world', C.clinkDb - 1, { cents: -700, priority: 3 }),
        at('scrape', 'world', C.clinkDb - 9, { delay: 0.08, priority: 2 }, 1),
        // (r18: and the silk drawn taut on the far side: a low creak a beat later, from beyond it.)
        at('creak', 'world', C.clinkDb - 7, { cents: -500, delay: 0.22, priority: 2 }, 2),
      ];
    // The Lamp pressed by a cage (r16): not like that. The cage rattles, three dull knocks of bars, no flame's answer.
    case 'lureRefuse':
      return [0, 1, 2].map((k) =>
        at(
          'clink',
          'lantern',
          C.clinkDb - 3 - k * 2,
          { cents: -900 + k * 250, delay: k * 0.07, priority: 3 },
          k,
        ),
      );
    // (The warning's deep slam from the den moved to `denStir`, round 13: the cage full.)
    // The boss's rams: the falling fourth in the bass (on the score bus, so it sits in the music).
    case 'enemyCharge':
      if (!BOSS_KINDS.has(q.kind ?? '') || snap.fight?.stage !== 'fight') return [];
      return [38, 33].map((m, k) => {
        const n = noteOf('marc', m);
        return {
          ...at(
            'marc',
            'score',
            AUDIO.score.db.marc + 1 - k * 2,
            { place: 'fixed', pan: -0.2, delay: k * 0.25, priority: 4 },
            k,
          ),
          variant: n.variant,
          cents: n.cents,
          dur: 0.6,
          release: AUDIO.score.release.marc,
        };
      });
    // The Keeper (round 12, loose until it lands).
    case 'cageDrop':
      return [
        at('glintNote', 'lantern', AUDIO.lamp.chimeDb - 4, { cents: 0, priority: 3 }),
        at('glintNote', 'lantern', AUDIO.lamp.chimeDb - 7, { cents: -700, delay: 0.3, priority: 3 }, 1),
      ];
    case 'enemyFeed':
      return [
        at('crunch', 'creatures', AUDIO.combat.crunchDb - 4, { cents: -900, priority: 5 }),
        at('settle', 'creatures', AUDIO.creatures.rearDb - 4, { cents: -600, delay: 0.25, priority: 4 }, 1),
      ];
    case 'mothEaten': {
      // Each a chime cut off (n of them, a hair apart).
      const n = Math.max(1, Math.min(3, (q as { n?: number }).n ?? 1));
      return Array.from({ length: n }, (_, k) =>
        at(
          'glintNote',
          'lantern',
          AUDIO.lamp.chimeDb - 3 - k,
          { cents: -500 + 200 * k, delay: k * 0.07, dur: 0.07, release: 0.03, priority: 3 },
          k,
        ),
      );
    }
    // The Keeper r13: a cut it shrugs off (`gate`: a dull knock and a snort) or one the light gives away (`lit`: the
    // dome rings dull; the score's stab comes with its sight); its lunge's in-breath; its turn to guard the cage; the
    // cage's bars under its claws or let go; the sweep's tell (claws drawn back across the floor) and the claws.
    case 'keeperGlance':
      return q.why === 'gate'
        ? [
            at('thump', 'combat', AUDIO.combat.clangDb - 3, {
              x: q.hitX ?? q.x,
              y: q.hitY ?? q.y,
              cents: -500,
              priority: 4,
            }),
            at(
              'exhale',
              'creatures',
              AUDIO.creatures.rearDb - 6,
              { cents: -900, delay: 0.12, priority: 3 },
              1,
            ),
          ]
        : [
            at('clang', 'combat', AUDIO.combat.clangDb - 2, {
              x: q.hitX ?? q.x,
              y: q.hitY ?? q.y,
              cents: -1100,
              priority: 4,
            }),
          ];
    case 'keeperLunge':
      return [
        at('catchBreath', 'creatures', AUDIO.creatures.rearDb + 1, { cents: -1000, priority: 5 }),
        at('scrape', 'creatures', AUDIO.creatures.rearDb - 4, { cents: -700, delay: 0.05, priority: 3 }, 1),
      ];
    case 'keeperGuard':
      return [
        at('rear', 'creatures', AUDIO.creatures.rearDb, { variant: 0, cents: -300, priority: 5 }),
        at('clang', 'combat', AUDIO.combat.clangDb - 6, { cents: -700, delay: 0.05, priority: 3 }, 1),
      ];
    case 'cageGuard':
      return q.on
        ? [
            at('clink', 'lantern', C.clinkDb + 2, { cents: -900, priority: 3 }),
            at(
              'scrape',
              'creatures',
              AUDIO.creatures.rearDb - 6,
              { cents: -400, delay: 0.08, priority: 2 },
              1,
            ),
          ]
        : [
            at('clink', 'lantern', C.clinkDb + 4, { cents: 0, priority: 4 }),
            at('clink', 'lantern', C.clinkDb + 3, { cents: 702, delay: 0.14, priority: 4 }, 1),
          ];
    // r14: the sweep's tell is danger, not food: claws raked back over the stone and a hiss drawn in through its
    // teeth, rising, sized to the tell (and the score's stab, score.ts). The claws: a low swoop, a scrape, the cloud
    // panicking. Only then it eats, open: wet crunches and a breath out (unlike anything before it).
    case 'keeperSweepTell': {
      const mid = ((q.x0 ?? q.x) + (q.x1 ?? q.x)) / 2;
      const len = (q.frames ?? 42) / 60;
      return [
        at('sweepTell', 'creatures', C.sweepTellDb, {
          x: snap.fight?.x ?? mid,
          y: snap.fight?.y ?? q.y,
          cents: Math.round(1200 * Math.log2(0.8 / Math.max(0.3, len))),
          priority: 6,
        }),
        at(
          'scrape',
          'creatures',
          AUDIO.creatures.rearDb - 3,
          { x: snap.fight?.x ?? mid, y: q.y, cents: 300, priority: 3 },
          1,
        ),
      ];
    }
    case 'keeperSweep':
      return [
        at('dive', 'creatures', AUDIO.creatures.diveDb + 4, {
          x: ((q.x0 ?? q.x) + (q.x1 ?? q.x)) / 2,
          cents: -900,
          priority: 5,
        }),
        at('scrape', 'creatures', AUDIO.creatures.rearDb - 2, { cents: -600, delay: 0.04, priority: 4 }, 1),
        at('mothRush', 'lantern', AUDIO.lamp.rushDb + 2, { cents: 500, delay: 0.08, priority: 4 }, 2),
      ];
    case 'keeperEat':
      if (q.sweep)
        return [0, 1, 2].flatMap((k) => [
          at(
            'crunch',
            'creatures',
            AUDIO.combat.crunchDb - 5 - 2 * k,
            { cents: -1100 - 150 * k, delay: 0.12 + k * 0.28, priority: 4 },
            k,
          ),
          ...(k === 2
            ? [
                at(
                  'exhale',
                  'creatures',
                  AUDIO.creatures.rearDb - 6,
                  { cents: -700, delay: 0.95, priority: 2 },
                  3,
                ),
              ]
            : []),
        ]);
      return [
        at('crunch', 'creatures', AUDIO.combat.crunchDb - 8, { cents: -1100, priority: 3 }),
        at('exhale', 'creatures', AUDIO.creatures.rearDb - 8, { cents: -700, delay: 0.3, priority: 2 }, 1),
      ];
    // r14, P1's beat: it rears and roars (it has a mouth), its shell creaking up; then one slam with no wave, the
    // roof shaken (grit). The score stops for the roar and comes back angry on the slam (score.ts).
    case 'keeperRage':
      if (q.phase === 'rear')
        return [
          at('roar', 'creatures', C.roarDb, { place: 'hero', x: q.x, y: q.y, priority: 7 }),
          at(
            'rear',
            'creatures',
            AUDIO.creatures.rearDb,
            { variant: nearestS(REAR_S, (q.frames ?? 40) / 60), cents: -400, priority: 5 },
            1,
          ),
        ];
      return [
        at('slam', 'creatures', AUDIO.creatures.slamDb + 3, { place: 'hero', cents: -300, priority: 7 }),
        at(
          'rockLand',
          'creatures',
          AUDIO.creatures.slamDb - 4,
          { place: 'hero', cents: -500, priority: 5 },
          1,
        ),
        at('trickle', 'world', C.trickleDb + 10, { delay: 0.35, far: 0.2, priority: 3 }, 2),
        at('trickle', 'world', C.trickleDb + 6, { x: q.x - 600, delay: 0.6, far: 0.3, priority: 2 }, 3),
      ];
    // r14: its health at the phase's floor with the phase not done: its shell clamps shut (a dull low knock, a
    // snort); open again: plates parting (a short creak up) and a breath in.
    case 'keeperGate':
      return q.on
        ? [
            at('clang', 'combat', AUDIO.combat.clangDb - 5, { cents: -1500, priority: 4 }),
            at(
              'exhale',
              'creatures',
              AUDIO.creatures.rearDb - 6,
              { cents: -900, delay: 0.1, priority: 3 },
              1,
            ),
          ]
        : [
            at('creak', 'creatures', AUDIO.creatures.creakDb, { variant: 0, cents: -300, priority: 4 }),
            at(
              'catchBreath',
              'creatures',
              AUDIO.creatures.rearDb - 6,
              { cents: -800, delay: 0.15, priority: 3 },
              1,
            ),
          ];
    // r14: the carcass rolls clear of the cage: its shell grinding over the floor, plates scraping, one last thump
    // on its back as it stops (into the last hit's silence).
    case 'keeperRoll': {
      const s2 = (q.frames ?? 70) / 60;
      return [
        at('rumble', 'creatures', AUDIO.creatures.rumbleDb + 2, { cents: -1100, delay: 0.05, priority: 5 }),
        at('scrape', 'creatures', AUDIO.creatures.rearDb - 4, { cents: -900, delay: 0.25, priority: 3 }, 1),
        at(
          'thumpWood',
          'creatures',
          AUDIO.creatures.wallDb,
          { x: q.toX ?? q.x, cents: -700, delay: s2 * 0.85, priority: 4 },
          2,
        ),
      ];
    }
    case 'keeperSight':
      // The light found her: its sharp in-breath. Lost her: a slow sniff.
      return (q as { lit?: boolean }).lit
        ? [at('catchBreath', 'creatures', AUDIO.creatures.rearDb - 4, { cents: -800, priority: 4 })]
        : [at('sniff', 'creatures', AUDIO.creatures.rearDb - 8, { cents: -600, priority: 2 })];
    case 'denCollapse': {
      const ph = (q as { phase?: string }).phase;
      if (ph === 'groan')
        return [
          // (r14: under the column's music: far and low, a warning, not the moment.)
          at('gateGroan', 'world', C.groanDb - 2, {
            cents: -700,
            place: 'fixed',
            pan: 0,
            far: 0.5,
            priority: 5,
          }),
          at(
            'rumble',
            'creatures',
            AUDIO.creatures.rumbleDb - 2,
            { cents: -900, place: 'fixed', pan: 0, far: 0.5, priority: 4 },
            1,
          ),
        ];
      if (ph === 'dust') return [at('trickle', 'world', C.trickleDb + 4, { far: 0.45, priority: 3 })];
      if (ph === 'rubble')
        return [
          at('slam', 'creatures', AUDIO.creatures.slamDb, {
            place: 'fixed',
            pan: 0,
            cents: -300,
            priority: 5,
          }),
          at('trickle', 'world', C.trickleDb + 8, { delay: 0.2, far: 0.2, priority: 3 }, 1),
        ];
      return [];
    }
    case 'mothSaved':
      return [
        at('glintNote', 'lantern', AUDIO.lamp.chimeDb - 4, {
          place: 'hero',
          x: h.x,
          y: h.y,
          cents: 0,
          priority: 3,
        }),
        at(
          'glintNote',
          'lantern',
          AUDIO.lamp.chimeDb - 5,
          { place: 'hero', x: h.x, y: h.y, cents: 702, delay: 0.12, priority: 3 },
          1,
        ),
      ];
    case 'cageSwing':
      return [at('creak', 'creatures', AUDIO.creatures.creakDb, { variant: 3, cents: -900, priority: 4 })];
    case 'cageFall':
      return [
        at('slam', 'creatures', AUDIO.creatures.slamDb, { place: 'hero', priority: 6 }),
        at('cageBreak', 'lantern', AUDIO.lamp.release.breakDb, { cents: -700, delay: 0.05, priority: 5 }, 1),
        at('mothRush', 'lantern', AUDIO.lamp.rushDb + 4, { cents: 300, delay: 0.1, priority: 4 }, 2),
      ];
    case 'cageRelease':
      return [
        at('mothRush', 'lantern', AUDIO.lamp.rushDb + 3, {
          place: 'fixed',
          pan: 0,
          panTo: 0,
          cents: 400,
          priority: 4,
        }),
      ];
    // r15, the slam's wave (review r14 #2): the floor is still dangerous after the slam. The crack opens at its feet
    // over the delay (splits coming faster, a groan swelling), then the fronts tear out of it (stone splitting, a low
    // shove); each front is then heard where it runs (canopyAmbient), panned by its x.
    case 'keeperWave': {
      if (q.phase !== 'slam') return [];
      const go = Math.max(0, q.frames ?? 12) / 60;
      return [
        at('fissure', 'creatures', C.fissureDb, { y: q.y, place: 'world', priority: 7 }),
        at(
          'rumble',
          'creatures',
          AUDIO.creatures.rumbleDb - 2,
          { y: q.y, cents: -900, delay: go * 0.5, priority: 4 },
          1,
        ),
        at('rockLand', 'creatures', C.rockLandDb - 3, { y: q.y, cents: -600, delay: go, priority: 6 }, 2),
        at('rootSnap', 'creatures', C.rootSnapDb - 2, { y: q.y, cents: -900, delay: go, priority: 5 }, 3),
      ];
    }
    // r15, the chase's catch: a press at a hook pulls her onto its flame (air drawn in, her wings snapping open on
    // it); the score plays the hook's note (score.ts stings).
    case 'flingStart': {
      const l = ctx.scene.lures?.find((x) => x.id === q.id);
      if (!snap.chase || !l?.hook) return [];
      return [at('hookPull', 'hero', C.hookPullDb, { place: 'hero', x: h.x, y: h.y, priority: 6 })];
    }
    // --- The escape (r14, moment 7; src/sim/escape.ts). Each rock's tell is heard where it will fall (placed in the
    // world, so panned by x): a root snapping in the roof, then grit trickling faster to the drop; the fall a swoop;
    // the landing stone. The front is a layer (canopyLayers). Checkpoints a soft chime in tune: safe here.
    case 'rockfall': {
      const tell = Math.max(1, q.tell ?? 24) / 60;
      const y = q.y;
      if (q.phase === 'tell') {
        const n = Math.max(1, Math.min(5, Math.round(tell / 0.18)));
        return [
          at('rootSnap', 'world', C.rootSnapDb, { y, place: 'world', priority: 6 }),
          at(
            'creak',
            'world',
            AUDIO.creatures.creakDb - 2,
            { y, variant: nearestS(CREAK_S, tell), cents: 600, priority: 4 },
            1,
          ),
          ...Array.from({ length: n }, (_, k) =>
            at(
              'trickle',
              'world',
              C.rockTrickleDb + (3 * k) / n,
              { y, delay: (tell * k) / n, priority: 4 },
              2 + k,
            ),
          ),
        ];
      }
      if (q.phase === 'fall')
        return [
          at('dive', 'world', C.rockFallDb, { y: y + 200, cents: -700, priority: 5 }),
          at('rootSnap', 'world', C.rootSnapDb - 4, { y, cents: -300, priority: 4 }, 1),
        ];
      return [
        at('rockLand', 'world', C.rockLandDb, { y, priority: 6 }),
        at('trickle', 'world', C.trickleDb + 6, { y, delay: 0.3, far: 0.2, priority: 2 }, 1),
      ];
    }
    case 'collapseFront':
      if (q.phase !== 'start') return [];
      return [
        at('slam', 'creatures', AUDIO.creatures.slamDb - 2, {
          y: q.y,
          place: 'fixed',
          pan: 0,
          cents: -700,
          far: 0.3,
          priority: 5,
        }),
        at('rootSnap', 'world', C.rootSnapDb - 2, { y: q.y - 200, delay: 0.15, priority: 4 }, 1),
      ];
    case 'escapeCheckpoint':
      return [0, 1].map((k) =>
        at(
          'glintNote',
          'lantern',
          C.checkpointDb - 2 * k,
          {
            place: 'hero',
            x: h.x,
            y: h.y,
            cents: (MOTH_CENTS[k === 0 ? 4 : 6] ?? 0) - 1200,
            delay: k * 0.11,
            priority: 4,
          },
          k,
        ),
      );
    // (r20, HK's shade) All she left where she faded is back with her: four notes rising through the moth scale, over
    // the last glint's chime, then her wings stir. Lost to a second fade: one low note, falling away.
    case 'shadeTaken':
      return [
        ...[0, 1, 2, 3].map((k) =>
          at(
            'glintNote',
            'lantern',
            C.shadeDb - k,
            {
              place: 'hero',
              x: h.x,
              y: h.y,
              cents: MOTH_CENTS[2 + 2 * k] ?? 0,
              delay: 0.06 + k * 0.09,
              priority: 5,
            },
            k,
          ),
        ),
        at('wingOpen', 'hero', C.backWingDb, { place: 'hero', x: h.x, y: h.y, delay: 0.45, priority: 3 }, 4),
      ];
    case 'shadeLost':
      return [
        at('glintNote', 'lantern', C.shadeLostDb, {
          place: 'hero',
          x: h.x,
          y: h.y,
          cents: (MOTH_CENTS[0] ?? 0) - 1200,
          priority: 4,
        }),
      ];
    case 'escapeHit':
      return q.what === 'front'
        ? [
            at('rumble', 'creatures', AUDIO.creatures.rumbleDb + 4, {
              place: 'hero',
              cents: -600,
              priority: 6,
            }),
            at('hurt', 'hero', AUDIO.combat.hurtDb - 4, { place: 'hero', delay: 0.03, priority: 6 }, 1),
          ]
        : [
            at('rockLand', 'creatures', C.rockLandDb + 2, { place: 'hero', cents: 300, priority: 7 }),
            at('hurt', 'hero', AUDIO.combat.hurtDb - 4, { place: 'hero', delay: 0.02, priority: 6 }, 1),
          ];
    case 'escapeStart': {
      // Put back at a checkpoint (a return): the cloud gathers round her again.
      if (!(ctx.events ?? []).some((x) => x.type === 'fallReturn')) return [];
      return [
        at('mothRush', 'lantern', AUDIO.lamp.rushDb - 4, {
          place: 'hero',
          x: h.x,
          y: h.y,
          cents: 300,
          priority: 3,
        }),
        at('wingOpen', 'hero', C.backWingDb, { place: 'hero', x: h.x, y: h.y, delay: 0.1, priority: 3 }, 1),
      ];
    }
    case 'escapeEnd':
      // Out ahead of it: the cloud pours on into the moonlight.
      return [
        at('mothRush', 'lantern', AUDIO.lamp.rushDb + 3, {
          place: 'fixed',
          pan: 0,
          panTo: 0.6,
          cents: 500,
          priority: 5,
        }),
        at(
          'wingOpen',
          'hero',
          C.backWingDb + 2,
          { place: 'hero', x: h.x, y: h.y, delay: 0.05, priority: 4 },
          1,
        ),
      ];
    default:
      return [];
  }
}

type At = (sound: Cue['sound'], bus: Cue['bus'], db: number, over?: Partial<Cue>, k?: number) => Cue;

/**
 * The kin's sit, beat by beat (r15, `kinBeat`; the duet's notes are score.ts's): its wings opening to the moon (one
 * full, the torn one catching short), the torn wing's try (a strained flutter that cannot hold) and its fall (folding
 * back half open, a soft drop), nothing through the held look, then Wing's answer (her wings opening once, only if
 * she stood by it), both folding, and its lean against her.
 */
function kinBeat(q: Loose, at: At): Cue[] {
  const C = AUDIO.canopy;
  const hero = { place: 'hero' as const };
  switch (q.phase) {
    case 'open':
      return [
        at('wingOpen', 'hero', C.kinWingDb, { ...hero, cents: -200, delay: 0.1, priority: 3 }),
        at(
          'wingOpen',
          'hero',
          C.kinWingDb - 3,
          { ...hero, cents: 150, delay: 0.24, dur: 0.07, release: 0.04, priority: 3 },
          1,
        ),
      ];
    case 'try':
      return [at('kinTry', 'hero', C.kinTryDb, { ...hero, priority: 4 })];
    case 'fail':
      return [
        at('wingFold', 'hero', C.kinWingDb - 1, { ...hero, cents: -500, priority: 4 }),
        at('scrape', 'hero', C.kinWingDb - 8, { ...hero, delay: 0.12, cents: -300, priority: 2 }, 1),
        at('pad', 'hero', C.kinWingDb - 6, { ...hero, delay: 0.2, cents: -200, priority: 2 }, 2),
      ];
    case 'answer':
      return (q as { her?: number }).her
        ? [
            at('wingOpen', 'hero', C.kinWingDb + 3, { ...hero, cents: 100, delay: 0.05, priority: 4 }),
            at('wing', 'hero', C.kinWingDb - 2, { ...hero, delay: 0.32, priority: 2 }, 1),
          ]
        : [];
    case 'fold':
      return [
        at('wingFold', 'hero', C.kinWingDb - 2, { ...hero, cents: -200, priority: 3 }),
        at('wingFold', 'hero', C.kinWingDb - 4, { ...hero, cents: -450, delay: 0.18, priority: 2 }, 1),
      ];
    case 'lean':
      return [at('pad', 'hero', C.kinWingDb - 8, { ...hero, delay: 0.3, cents: -100, priority: 2 })];
    default:
      return [];
  }
}

/** The index of the nearest length in `xs` to `s`. */
function nearestS(xs: readonly number[], s: number): number {
  let best = 0;
  xs.forEach((x, k) => {
    if (Math.abs(x - s) < Math.abs((xs[best] as number) - s)) best = k;
  });
  return best;
}

/** The Canopy's world by itself on this sim frame. */
export function canopyAmbient(snap: AudioSnap, cam: AudioCam, ctx: RouteContext): Cue[] {
  const C = AUDIO.canopy;
  const f = snap.frame;
  const seed = ctx.seed;
  const room = snap.room ?? ctx.scene.id;
  if (!room.startsWith('cn-')) return [];
  const bed = bedOf(room);
  const out: Cue[] = [];
  // Far insects: a trill or a few rasps now and then, never near (the night is theirs, not hers).
  if ((bed.insects ?? 0) > 0 && hash01(seed, f, salt('insect')) < (bed.insects ?? 0) / 60) {
    const depth = 0.4 + 0.6 * hash01(seed, f, salt('insect'), 1);
    const side = hash01(seed, f, salt('insect'), 2) * 2 - 1;
    out.push(
      cue('insect', 'world', ctx, f, 150, {
        x: cam.x + side * 900,
        y: cam.y - 200,
        db: C.insectDb - 8 * depth,
        place: 'fixed',
        pan: side * 0.8,
        far: depth,
        priority: 0,
      }),
    );
  }
  // Earth trickling from the roof where the earth rumbles.
  if (bed.earth !== undefined && hash01(seed, f, salt('trickle')) < C.trickleRate / 60) {
    const side = hash01(seed, f, salt('trickle'), 1) * 2 - 1;
    out.push(
      cue('trickle', 'world', ctx, f, 151, {
        x: cam.x + side * 700,
        y: cam.y - 350,
        db: C.trickleDb,
        far: 0.35 + 0.4 * hash01(seed, f, salt('trickle'), 2),
        priority: 0,
      }),
    );
  }
  // The firefly blinks as it flies, exactly on its own clock (regular is the enemy).
  if (snap.firefly && f % C.blinkEvery === 0)
    out.push(
      cue('fireflyBlink', 'lantern', ctx, f, 152, {
        x: snap.firefly.x,
        y: snap.firefly.y,
        db: C.blinkDb,
        variant: 0,
        cents: 0,
        priority: 2,
      }),
    );
  // r15, the slam's wave: each front heard where it runs along the floor (placed in the world: it travels and pans),
  // a stretch of grinding earth every `waveEvery` frames, thinning as it runs out.
  if (f % C.waveEvery === 0)
    for (const [k, w] of (snap.waves ?? []).entries()) {
      if (w.d <= 0) continue;
      const fade = Math.min(1, w.d / C.waveFadePx);
      for (const side of [-1, 1]) {
        const x = w.x + side * w.d;
        if (x < 0 || x > ctx.scene.width) continue;
        out.push(
          cue('waveGrit', 'creatures', ctx, f, 180 + k * 2 + (side > 0 ? 1 : 0), {
            x,
            y: w.y,
            db: C.waveDb - C.waveFallDb * fade,
            variant: (Math.floor(f / C.waveEvery) + (side > 0 ? 2 : 0)) % 4,
            cents: (hash01(seed, f, k, side, salt('wave')) - 0.5) * 300,
            priority: 4,
          }),
        );
      }
    }
  // Freed moths at their roosts: a soft stir of wings now and then near them.
  for (const [k, r] of (snap.roosts ?? []).entries()) {
    const near = 1 - Math.hypot(r.x - cam.x, r.y - cam.y) / C.roostPx;
    if (near <= 0 || hash01(seed, f, k, salt('roost')) >= 0.35 / 60) continue;
    out.push(
      cue('mothRush', 'lantern', ctx, f, 160 + k, {
        x: r.x,
        y: r.y,
        db: C.roostDb + amp(0.3 + 0.7 * near),
        cents: -300,
        far: 0.3,
        priority: 0,
      }),
    );
  }
  // A burrback hunting her huffs (it has a mouth): about every `huffS` s each, a little early or late.
  const per = Math.round(C.huffS * 60);
  (snap.creatures ?? []).forEach((c, k) => {
    if ((c.kind !== 'burrback' && c.kind !== 'juvenileBurrback') || c.down || !((c.aware ?? 0) > 0)) return;
    const d = Math.hypot(c.x - snap.hero.x, c.y - snap.hero.y);
    if (d > 700) return;
    const off = Math.floor(hash01(seed, k, salt('huff')) * per);
    if ((f + off) % per !== 0) return;
    const juv = c.kind === 'juvenileBurrback';
    out.push(
      cue('exhale', 'creatures', ctx, f, 170 + k, {
        x: c.x,
        y: c.y,
        db: C.huffDb - (juv ? 4 : 0),
        cents: juv ? 200 : -300,
        priority: 1,
      }),
    );
  });
  return out;
}

type CanopyLayers = Pick<
  Layers,
  | 'earth'
  | 'river'
  | 'riverPan'
  | 'riverHz'
  | 'valley'
  | 'lampwing'
  | 'lampwingPan'
  | 'hawker'
  | 'hawkerPan'
  | 'collapse'
  | 'collapseHz'
  | 'collapsePan'
>;

export function canopyLayers(snap: AudioSnap, cam: AudioCam, clock: number, ctx: RouteContext): CanopyLayers {
  const C = AUDIO.canopy;
  const room = snap.room ?? ctx.scene.id;
  const out: CanopyLayers = {
    earth: 0,
    river: 0,
    riverPan: 0,
    riverHz: 2000,
    valley: 0,
    lampwing: 0,
    lampwingPan: 0,
    hawker: 0,
    hawkerPan: 0,
    collapse: 0,
    collapseHz: 120,
    collapsePan: 0,
  };
  if (!room.startsWith('cn-')) return out;
  // The escape's collapse front: louder and brighter the nearer it is under her, its tumble climbing as it rises.
  const es = snap.escape;
  if (es && es.front >= 0) {
    const near = clamp01(1 - (es.gap - C.collapseNearPx) / C.collapseFarPx);
    out.collapse = dbToGain(C.collapseDb) * (0.3 + 0.7 * near ** 1.4);
    out.collapseHz = 110 + 260 * near + 120 * es.rise;
    out.collapsePan = 0.35 * panOf((es.x0 + es.x1) / 2, cam);
  } else if (es) {
    // (r15: before the front, through the den's floor run, the corridor and down the shaft: the roof coming down
    // behind her, far and dull, from the den's side.)
    out.collapse = dbToGain(C.behindDb);
    out.collapseHz = 95;
    out.collapsePan = room === 'cn-den' ? -0.35 : -0.5;
  }
  const bed = bedOf(room);
  if (bed.earth !== undefined)
    out.earth =
      dbToGain(C.earthDb + bed.earth) *
      (0.7 + 0.2 * Math.sin((2 * Math.PI * clock) / 9.3) + 0.1 * Math.sin(clock * 0.37));
  // The swarm over the hatch, heard before it is seen: out of the black (1 s since r18) and on up over 1.5 s, closer
  // with each press.
  const ht = snap.hatch;
  if (ht && !ht.done) {
    const ramp = clamp01(ht.frames / 90);
    const k = 0.55 * ramp + 0.45 * clamp01(ht.presses / 3);
    out.river = ramp > 0 ? dbToGain(C.riverDb[0] + (C.riverDb[1] - 4 - C.riverDb[0]) * k) * ramp : 0;
    out.riverPan = 0.55 * Math.sin((2 * Math.PI * clock) / 7.5);
    out.riverHz = 1700 + 600 * k;
  }
  // The trap being set: the far stream's wings, thinning as the cage takes them.
  const fl = snap.fill;
  if (fl && out.river < 1e-5) {
    out.river = dbToGain(C.streamDb) * (1 - 0.7 * clamp01(fl.n / Math.max(1, fl.of)));
    out.riverPan = panOf(fl.x, cam) * 0.7;
    out.riverHz = 1900;
  }
  // The valley's false lights far below the promise lip.
  if (room === 'cn-hatch' && snap.hero.x > C.valleyFromX)
    out.valley = dbToGain(C.valleyDb) * clamp01((snap.hero.x - C.valleyFromX) / 500);
  // The nearest lampwing's hum and hawker's wings.
  for (const c of snap.creatures ?? []) {
    if (c.down || (c.kind !== 'lampwing' && c.kind !== 'hawker')) continue;
    const near = clamp01(1 - Math.hypot(c.x - cam.x, c.y - cam.y) / C.flyerPx);
    if (near <= 0) continue;
    if (c.kind === 'lampwing') {
      const g = dbToGain(C.lampwingDb) * near ** 2;
      if (g > out.lampwing) {
        out.lampwing = g;
        out.lampwingPan = panOf(c.x, cam) * 0.8;
      }
    } else {
      const g = dbToGain(C.hawkerDb) * near ** 2;
      if (g > out.hawker) {
        out.hawker = g;
        out.hawkerPan = panOf(c.x, cam) * 0.8;
      }
    }
  }
  return out;
}
