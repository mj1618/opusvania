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
import { AUDIO, bedOf } from './tuning';

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
};
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
      return q.trap ? [at('clink', 'lantern', C.clinkDb + 2, { place: 'hero', priority: 3 })] : [];
    case 'flagSet':
      // The warning's second beat: something enormous shifts in the den below.
      return q.flag === 'cn-tunnel-beat2'
        ? [
            at('slam', 'creatures', AUDIO.creatures.slamDb - 4, {
              place: 'fixed',
              pan: 0.6,
              cents: -500,
              far: 0.7,
              priority: 4,
            }),
          ]
        : [];
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
    case 'keeperEat':
      return [
        at('crunch', 'creatures', AUDIO.combat.crunchDb - 8, { cents: -1100, priority: 3 }),
        at('exhale', 'creatures', AUDIO.creatures.rearDb - 8, { cents: -700, delay: 0.3, priority: 2 }, 1),
      ];
    case 'keeperSight':
      // The light found her: its sharp in-breath. Lost her: a slow sniff.
      return (q as { lit?: boolean }).lit
        ? [at('catchBreath', 'creatures', AUDIO.creatures.rearDb - 4, { cents: -800, priority: 4 })]
        : [at('sniff', 'creatures', AUDIO.creatures.rearDb - 8, { cents: -600, priority: 2 })];
    case 'denCollapse': {
      const ph = (q as { phase?: string }).phase;
      if (ph === 'groan')
        return [
          at('gateGroan', 'world', C.groanDb + 2, { cents: -700, place: 'fixed', pan: 0, priority: 5 }),
          at(
            'rumble',
            'creatures',
            AUDIO.creatures.rumbleDb + 2,
            { cents: -900, place: 'fixed', pan: 0, priority: 4 },
            1,
          ),
        ];
      if (ph === 'dust') return [at('trickle', 'world', C.trickleDb + 6, { far: 0.3, priority: 3 })];
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
    default:
      return [];
  }
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
  'earth' | 'river' | 'riverPan' | 'riverHz' | 'valley' | 'lampwing' | 'lampwingPan' | 'hawker' | 'hawkerPan'
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
  };
  if (!room.startsWith('cn-')) return out;
  const bed = bedOf(room);
  if (bed.earth !== undefined)
    out.earth =
      dbToGain(C.earthDb + bed.earth) *
      (0.7 + 0.2 * Math.sin((2 * Math.PI * clock) / 9.3) + 0.1 * Math.sin(clock * 0.37));
  // The swarm over the hatch, heard before it is seen: out of the black over 3 s, closer with each press.
  const ht = snap.hatch;
  if (ht && !ht.done) {
    const ramp = clamp01(ht.frames / 180);
    const k = 0.55 * ramp + 0.45 * clamp01(ht.presses / 3);
    out.river = ramp > 0 ? dbToGain(C.riverDb[0] + (C.riverDb[1] - 4 - C.riverDb[0]) * k) * ramp : 0;
    out.riverPan = 0.55 * Math.sin((2 * Math.PI * clock) / 7.5);
    out.riverHz = 1700 + 600 * k;
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
