/**
 * What the world sounds like, as data: pure functions from sim events and state to cues (one-shots)
 * and layer targets (the continuous voices). No AudioContext here, so Vitest runs it over real sim
 * tapes, and one tape always routes to the same cues.
 *
 * - `route(event)`: one-shots a sim event asks for. Most events make no sound. Play (her moves, the
 *   blade, the lamps, the creatures' tells) is in route-play.ts.
 * - `ambient(snap)`: one-shots the world makes on its own this frame (drips, the far voice, claws on a
 *   wall slide, ants). Dice are keyed by frame, never drawn from a stream.
 * - `layers(snap, cam, clock)`: where every continuous voice should be now (state-driven, so
 *   unmuting mid-play or after a teleport is right at once).
 */

import { zoneWeights } from '../render/scene/lib/fx-zones';
import { wind } from '../render/scene/lib/look';
import { roostsLit } from '../sim/firefly';
import { flameAt, lureRowNow } from '../sim/lures';
import type { Scene, SceneTag } from '../sim/scene';
import type { GameState, PlayerState } from '../sim/state';
import type { Tuning } from '../sim/tuning';
import { SOUNDS, type SoundId } from './bake';
import { dbToGain, hash01, salt } from './dsp';
import { canopyAmbient, canopyLayers, routeCanopy } from './route-canopy';
import { fightPulse, routeLantern, signNotes } from './route-lr';
import { type PlayEvent, routePlay } from './route-play';
import { AUDIO, type BusId, bedOf, LAMP_BEAT, LAMP_HZ, PITCH } from './tuning';

/** The camera as audio hears it: the listener sits at the view centre. */
export interface AudioCam {
  x: number;
  y: number;
  zoom: number;
}

/** The little of a sim state the sound needs, as plain JSON (it is what a tape records). */
export interface AudioSnap {
  frame: number;
  /** The room (scene id): its bed (tuning.ts `BEDS`). */
  room?: string;
  /** A story beat holds her (`kit.story`): the bed ducks. */
  hold?: boolean;
  hero: Pick<
    PlayerState,
    | 'vx'
    | 'vy'
    | 'motion'
    | 'mode'
    | 'grounded'
    | 'gliding'
    | 'facing'
    | 'wallDir'
    | 'freeze'
    | 'faded'
    | 'kindling'
    | 'kindlingLamp'
  > & {
    /** Feet centre. */
    x: number;
    y: number;
    /** Hitstop, the hurt's stagger, the fling she is aiming (-1 none) and for how long (0..1 of its cap). */
    hitstop?: number;
    stagger?: number;
    fling?: number;
    aim?: number;
  };
  /**
   * Burning lamps (`scene.lures` with cuts left): flame centre, kind, how far it is heard (px), and `i`, its
   * index. Embers (a flame she flung from, smouldering) are not burning.
   */
  lures?: Array<{ i: number; x: number; y: number; kind: string; reach: number }>;
  /** Lanterns then lamps: foot position, lit, channel progress 0..1. */
  lights: Array<{ x: number; y: number; lit: boolean; progress: number; lamp: boolean }>;
  /** The light she carries: glints in hand and her seen level 0-4 (memory/giving.md). */
  wallet?: number;
  seenLevel?: number;
  /** Creatures: centre, kind, frames left of a gift's calm of `of` (0 = none). */
  creatures?: Array<{
    kind: string;
    x: number;
    y: number;
    gift: number;
    of: number;
    /** Round 3: frames left of its awareness of her, asleep (`dozing`), out of the fight (dead / hurt). */
    aware?: number;
    dozing?: boolean;
    down?: boolean;
    /** What it is doing (`EnemyState.mode`): ants skitter only while they walk. */
    mode?: string;
    id?: string;
    /** A big one's phase (the old burrback 1-3). */
    phase?: number;
  }>;
  /** A boss fight: its stage and phase, the creature's centre, the frame the phase began, her health low. */
  boss?: { stage: string; phase: number; x: number; y: number; since: number; low: boolean };
  /**
   * The Canopy (score.ts, route-canopy.ts). `fight`: the den's boss as the score reads it, from the boss framework
   * (the Keeper, round 12) or the old burrback's own phases: asleep, waking, fighting, down. `lit`: how lit she is
   * (the Keeper sees only in its cage's light). `flags`: the save flags the score cares for (`SCORE_FLAGS`).
   * `arena`: an ambush under way (1 its first beat, 2 a later one). `hatch`: the cocoon. `firefly`: where it flies.
   * `roosts`: lit roosts (freed moths at rest).
   */
  fight?: { kind: string; stage: 'sleep' | 'wake' | 'fight' | 'down'; phase: number; x: number; y: number };
  lit?: number;
  flags?: string[];
  arena?: number;
  hatch?: { presses: number; done: boolean; frames: number };
  firefly?: { x: number; y: number };
  roosts?: Array<{ x: number; y: number }>;
}

/** The save flags the score and the Canopy's sounds read (snap.flags). */
export const SCORE_FLAGS = new Set([
  'cn-hub-freed',
  'cn-out-vista',
  'cn-den-down',
  'cn-den-freed',
  'cn-tunnel-beat2',
  'cn-warn-hung',
]);

/** The den's boss as the score reads it: the framework's stages, or an old burrback's own phases. */
function fightSnap(state: GameState): AudioSnap['fight'] {
  const b = state.boss;
  const big = state.enemies.find((e) => e.kind === 'oldBurrback' || (e.kind as string) === 'keeper');
  if (b) {
    const e = state.enemies.find((x) => !x.gone && (BOSSES.has(x.kind as string) || x.id === b.id)) ?? big;
    const stage =
      b.stage === 'wait'
        ? 'sleep'
        : b.stage === 'intro'
          ? 'wake'
          : b.stage === 'end' || b.stage === 'down'
            ? 'down'
            : 'fight';
    return {
      kind: (e?.kind as string) ?? b.id,
      stage,
      phase: Math.max(1, b.phase),
      x: e ? e.x + e.w / 2 : 0,
      y: e ? e.y + e.h / 2 : 0,
    };
  }
  if (!big) return undefined;
  const down = big.gone || big.mode === 'dead' || big.hp <= 0;
  const asleep = !!big.dozing || big.mode === 'sleep';
  // (Its `wake` mode comes back after blows too: only a whole one is waking.)
  const waking = (big.mode as string) === 'wake' && big.hp >= big.hpMax;
  return {
    kind: big.kind,
    stage: down ? 'down' : asleep ? 'sleep' : waking ? 'wake' : 'fight',
    phase: Math.max(1, big.phase),
    x: big.x + big.w / 2,
    y: big.y + big.h / 2,
  };
}
const BOSSES = new Set(['oldBurrback', 'keeper', 'gloamweaver', 'weaverBoss', 'mantis']);

/**
 * An ambush under way: a creature woken by a flag that is not yet down, whose own `sets` is not yet saved. 1 if a
 * trigger woke it (the first beat), 2 if another creature's `sets` did (a later beat).
 */
function arenaOf(state: GameState, scene: Scene): number {
  const flags = state.save.flags;
  const spawns = scene.enemies ?? [];
  const triggered = new Set((scene.triggers ?? []).map((t) => (t as { sets?: string }).sets));
  let level = 0;
  for (const e of state.enemies) {
    if (e.gone || e.mode === 'dead' || e.hp <= 0) continue;
    const sp = spawns.find((x) => x.id === e.id) as { wakes?: string; sets?: string } | undefined;
    if (!sp?.wakes || !sp.sets || !flags.includes(sp.wakes) || flags.includes(sp.sets)) continue;
    level = Math.max(level, triggered.has(sp.wakes) ? 1 : 2);
  }
  return level;
}

/** The boss fight as the sound reads it (loosely: the fields are the boss framework's). */
function bossSnap(state: GameState): AudioSnap['boss'] {
  const b = (state as { boss?: { stage?: string; phase?: number; phaseTime?: number; id?: string } }).boss;
  if (!b?.stage) return undefined;
  const e = state.enemies.find(
    (x) => x.kind === 'gloamweaver' || x.kind === 'weaverBoss' || x.kind === 'mantis',
  );
  const p = state.player;
  return {
    stage: b.stage,
    phase: b.phase ?? 1,
    x: e ? e.x + e.w / 2 : p.x,
    y: e ? e.y + e.h / 2 : p.y,
    since: state.frame - (b.phaseTime ?? 0),
    low: p.hp <= Math.max(1, Math.floor(p.hpMax / 3)),
  };
}

export function snapOf(state: GameState, scene: Scene, t: Tuning): AudioSnap {
  const p = state.player;
  const of = Math.max(1, t.goal.channelFrames);
  const lights: AudioSnap['lights'] = [];
  for (const lamp of [false, true]) {
    const list = (lamp ? scene.lamps : scene.lanterns) ?? [];
    const st = lamp ? state.goal.lamps : state.goal.lanterns;
    list.forEach((l, i) => {
      const s = st[i];
      lights.push({ x: l.x, y: l.y, lit: !!s?.lit, progress: Math.min(1, (s?.channel ?? 0) / of), lamp });
    });
  }
  const lures: NonNullable<AudioSnap['lures']> = [];
  (scene.lures ?? []).forEach((l, i) => {
    if ((state.lures.hp[i] ?? 0) <= 0) return;
    // (A moonwick is her light, not the firefly's: it does not hum like a lamp.)
    if ((l.kind as string) === 'moonwick') return;
    const f = flameAt(state.lures, i, l, state.frame, t);
    const row = lureRowNow(state.lures, i, l, t);
    // A cage of a hundred moths or more hums as a great lamp (the den's: over D3, canopy-moments.md Moment 6).
    const kind = l.trap && (l.moths ?? 0) >= 100 ? 'great' : l.kind;
    lures.push({ i, x: f.x, y: f.y, kind, reach: row.radius * AUDIO.lamp.reachScale });
  });
  // (The fling's fields are read loosely: the sound builds against a sim with or without them.)
  const fl = p as PlayerState & { fling?: number; flingFrames?: number };
  const fling = fl.fling ?? -1;
  const cap = (t.lures as { flingFrames?: number }).flingFrames ?? 36;
  return {
    frame: state.frame,
    room: scene.id,
    hold: (state.kit?.story ?? 0) > 0,
    hero: {
      x: p.x + p.w / 2,
      y: p.y + p.h,
      vx: p.vx,
      vy: p.vy,
      motion: p.motion,
      mode: p.mode,
      grounded: p.grounded,
      gliding: p.gliding,
      facing: p.facing,
      wallDir: p.wallDir,
      freeze: p.freeze,
      faded: p.faded,
      kindling: p.kindling,
      kindlingLamp: p.kindlingLamp,
      hitstop: p.hitstop,
      stagger: p.stagger,
      fling,
      aim: fling >= 0 ? Math.min(1, (fl.flingFrames ?? 0) / Math.max(1, cap)) : 0,
    },
    lights,
    lures,
    wallet: state.pickups.count,
    seenLevel: p.seenLevel ?? 0,
    boss: bossSnap(state),
    fight: fightSnap(state),
    lit: p.lit,
    flags: state.save.flags.filter((f) => SCORE_FLAGS.has(f)),
    arena: arenaOf(state, scene),
    hatch: state.hatch
      ? { presses: state.hatch.presses, done: state.hatch.done, frames: state.hatch.frames }
      : undefined,
    firefly:
      state.kit?.firefly && state.kit.firefly.pass >= 0
        ? { x: state.kit.firefly.x, y: state.kit.firefly.y }
        : undefined,
    roosts: roostsLit(scene, state.save).map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })),
    creatures: state.enemies
      .filter((e) => !e.gone)
      .map((e) => ({
        kind: e.kind,
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        gift: e.gift ?? 0,
        of: t.giving.giftCalmFrames,
        aware: e.aware ?? 0,
        dozing: !!e.dozing,
        down: e.mode === 'dead' || e.mode === 'hurt' || e.hp <= 0,
        mode: e.mode,
        id: e.id,
        phase: e.phase,
      })),
  };
}

/** One sound to play. */
export interface Cue {
  sound: SoundId;
  bus: BusId;
  /** The sim frame it belongs to, and seconds after that frame it starts. */
  frame: number;
  delay: number;
  /** World position (pan, distance). */
  x: number;
  y: number;
  /** Level in dB (tuning level and scaling folded in), and detune in cents. */
  db: number;
  cents: number;
  variant: number;
  /**
   * `hero`: hers: it pans with her on screen and is never quieter for distance. `world`: placed in
   * the world: pan and distance from the camera. A fixed `pan` overrides both; `panTo` sweeps to it.
   */
  place: 'hero' | 'world' | 'fixed';
  pan?: number;
  panTo?: number;
  /** 0 near and dry .. 1 far: duller, wetter, wider (the far send). */
  far: number;
  /** Higher survives voice stealing. */
  priority: number;
  /** Seconds it plays before it is let go over `release` s (a held note's length; absent = the whole buffer). */
  dur?: number;
  release?: number;
}

/** What the router needs besides the event: the scene and the seed. */
export interface RouteContext {
  scene: Scene;
  seed: number;
  /** The step's events (set by the conductor): sounds of many at once can share (three flames out on one landing). */
  events?: readonly PlayEvent[];
}

export type Material = 'moss' | 'wood' | 'water';

const WOOD: readonly SceneTag[] = ['trunk', 'root', 'branch'];

/** What she stands on at feet (x, y): the top of a solid or one-way there. */
export function materialAt(scene: Scene, x: number, y: number): Material {
  for (const s of scene.solids)
    if (Math.abs(s.y - y) <= 2 && x >= s.x - 2 && x <= s.x + s.w + 2)
      return s.tag === 'pool' ? 'water' : WOOD.includes(s.tag) ? 'wood' : 'moss';
  for (const o of scene.oneWays)
    if (Math.abs(o.y - y) <= 2 && x >= o.x - 2 && x <= o.x + o.w + 2)
      return WOOD.includes(o.tag) ? 'wood' : 'moss';
  return 'moss';
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const amp = (k: number) => 20 * Math.log10(Math.max(1e-4, k));

/** A variant and a few cents of detune, seeded by frame, event index and sound (no repeats per tape). */
function pick(sound: SoundId, count: number, ctx: RouteContext, frame: number, i: number) {
  const s = salt(sound);
  return {
    variant: Math.floor(hash01(ctx.seed, frame, i, s) * count) % count,
    cents: (hash01(ctx.seed, frame, i, s, 1) - 0.5) * 80,
    trim: (hash01(ctx.seed, frame, i, s, 2) - 0.5) * 2,
  };
}

export function cue(
  sound: SoundId,
  bus: BusId,
  ctx: RouteContext,
  frame: number,
  i: number,
  over: Partial<Cue> & { x: number; y: number; db: number },
): Cue {
  const p = pick(sound, SOUNDS[sound], ctx, frame, i);
  return {
    sound,
    bus,
    frame,
    delay: 0,
    cents: p.cents,
    variant: p.variant,
    place: 'world',
    far: 0,
    priority: 1,
    ...over,
    db: over.db + p.trim,
  };
}

/**
 * The one-shots a sim event asks for (`i` = its index in the step, for the dice). Most events
 * make no sound: turns, skids, apexes. Play (her moves, the blade, the lamps, the creatures) is
 * route-play.ts; the grove's lanterns and giving are here.
 */
export function route(e: PlayEvent, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] {
  // The Canopy's world (route-canopy.ts): the hatch, the firefly, the gates, a cage's bars, the boss's rams; added to
  // whatever else the event asks for.
  const cn = routeCanopy(e, i, snap, ctx);
  const base = routeBase(e, i, snap, ctx);
  return cn.length ? [...base, ...cn] : base;
}

function routeBase(e: PlayEvent, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] {
  // Lanternroot's light (route-lr.ts): her glow, the moonwicks, moss, the gust, the cap.
  const lr = routeLantern(e, i, snap, ctx);
  if (lr) return lr;
  const play = routePlay(e, i, snap, ctx);
  if (play) return play;
  // The test grove's giving (a carried chord catching, offers, gifts) sounds only where creatures see by it.
  if ((ctx.scene.senses ?? 'wallet') !== 'wallet') return [];
  const L = AUDIO.lantern;
  const f = snap.frame;
  switch (e.type) {
    case 'lanternNotice':
    case 'lampNotice':
    case 'lanternRefuse':
    case 'lampRefuse':
    case 'lanternKindle':
    case 'lampKindle':
    case 'lanternRest':
    case 'lampRest': {
      const lamp = e.type.startsWith('lamp');
      const what = e.type.replace(/^(lantern|lamp)/, '') as 'Notice' | 'Refuse' | 'Kindle' | 'Rest';
      const sound = `${lamp ? 'lamp' : 'lantern'}${what}` as SoundId;
      const db =
        L[`${what.toLowerCase() as 'notice' | 'refuse' | 'kindle' | 'rest'}Db`] + (lamp ? L.lampTrim : 0);
      const out = [
        cue(sound, 'lantern', ctx, f, i, {
          x: e.x,
          y: e.y - 40,
          db,
          far: what === 'Kindle' ? 0.25 : 0.1,
          priority: what === 'Kindle' ? 6 : 4,
        }),
      ];
      // A rest paid in glints: each leaves her as a small note, falling down the chord.
      if ((e.type === 'lanternRest' || e.type === 'lampRest') && e.cost > 0)
        out.push(...restNotes(e.cost, i, snap, ctx));
      return out;
    }
    default:
      return routeGiving(e, i, snap, ctx);
  }
}

/** Cents above A3 for the chord tones a lantern climbs as it is given its price: A, B, then home D. */
const TOWARD_D = [0, 204, 498];
/** Cents below A5 of the notes a paid rest falls through: A, E, D, B, A (the forest's chord, downward). */
const FALLING = [0, -498, -702, -1018, -1200];

function restNotes(cost: number, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] {
  const G = AUDIO.giving;
  const h = snap.hero;
  return Array.from({ length: Math.min(cost, 8) }, (_, k) => ({
    ...cue('glintNote', 'hero', ctx, snap.frame, i * 16 + k, {
      x: h.x,
      y: h.y - 40,
      db: G.noteDb - k * 0.8,
      delay: 0.25 + k * G.noteGapS,
      place: 'hero' as const,
      priority: 3,
    }),
    cents: (FALLING[k % FALLING.length] ?? 0) + (hash01(ctx.seed, snap.frame, k, salt('note')) - 0.5) * 8,
  }));
}

/**
 * Giving (memory/giving.md): her offer is glass leaving her hands; what takes it answers (a breath for a
 * creature with a mouth, a bowl partial for a lantern, a deeper bowl for the heart). Creatures that notice
 * her draw a breath in; a lampwing's hum swells toward her light.
 */
function routeGiving(e: PlayEvent, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] {
  const G = AUDIO.giving;
  const f = snap.frame;
  const h = snap.hero;
  const mine = (sound: SoundId, db: number, over: Partial<Cue> = {}) =>
    cue(sound, 'hero', ctx, f, i, { x: h.x, y: h.y - 40, db, place: 'hero', priority: 3, ...over });
  switch (e.type) {
    case 'offer':
      return [mine('offerTone', G.offerDb)];
    case 'offerMiss':
      return [mine('flutter', G.missDb - (e.reason === 'none' ? 2 : 0), { priority: 1 })];
    case 'giftReturn':
      // The glint comes back to her: the same glass, a fifth higher, softer.
      return [mine('offerTone', G.returnDb, { cents: 702 })];
    case 'enemyGift': {
      const at = { x: e.x, y: e.y, place: 'world' as const, priority: 4 };
      if (e.kind === 'lampwing')
        return [cue('glassSettle', 'creatures', ctx, f, i, { ...at, db: G.glassDb, far: 0.1 })];
      // A ram (or its build-up) cut off: one long settling breath; otherwise a low exhale.
      const ram = e.was === 'windup' || e.was === 'charge';
      return [
        cue(ram ? 'settle' : 'exhale', 'creatures', ctx, f, i, { ...at, db: ram ? G.settleDb : G.exhaleDb }),
      ];
    }
    case 'lanternGift':
    case 'lampGift': {
      const lamp = e.type === 'lampGift';
      const p = e.given / Math.max(1, e.given + e.need);
      const step = TOWARD_D[Math.min(TOWARD_D.length - 1, Math.floor(p * TOWARD_D.length))] ?? 0;
      return [
        {
          ...cue('giftBowl', 'lantern', ctx, f, i, {
            x: e.x,
            y: e.y - 40,
            db: G.bowlDb + (lamp ? AUDIO.lantern.lampTrim : 0),
            far: 0.1,
            priority: 4,
          }),
          cents: step + (lamp ? 1200 : 0),
        },
      ];
    }
    case 'heartGift':
      return [
        cue('heartGift', 'lantern', ctx, f, i, { x: e.x, y: e.y - 60, db: G.heartDb, far: 0.2, priority: 5 }),
      ];
    case 'enemyAware': {
      // It notices her: a sharp little in-breath (a lampwing: its hum swelling toward her light), and the
      // chord of what she carries catches, a shiver of her own glass (louder the more she carries).
      const at = { x: e.x, y: e.y, place: 'world' as const, priority: 3 };
      const out =
        e.kind === 'lampwing'
          ? [cue('wingHum', 'creatures', ctx, f, i, { ...at, db: G.humDb, far: 0.05 })]
          : [cue('catchBreath', 'creatures', ctx, f, i, { ...at, db: G.sniffDb })];
      const lv = Math.max(0, Math.min(4, e.level));
      if (lv > 0) out.push(mine('chordCatch', G.catchDb + 2 * (lv - 1), { priority: 4, cents: 0 }));
      return out;
    }
    default:
      return [];
  }
}

/** Frames a sleeping creature breathes on: about every `sleepS`, each breath a little early or late. */
export function sleepBreath(seed: number, frame: number, who: number): boolean {
  const per = Math.round(AUDIO.giving.sleepS * 60);
  const off = Math.floor(hash01(seed, who, salt('sleep')) * per);
  const g = frame + off;
  const k = Math.floor(g / per);
  return g % per === Math.floor(hash01(seed, who, k, salt('sleep')) * 30);
}

/**
 * Between two snaps: a creature that loses her (its awareness runs out while it is neither calmed nor
 * down) lets a long out-breath settle.
 */
export function creatureCues(prev: AudioSnap | null, snap: AudioSnap, ctx: RouteContext): Cue[] {
  const was = prev?.creatures;
  const now = snap.creatures;
  if (!was || !now || was.length !== now.length) return [];
  const out: Cue[] = [];
  now.forEach((c, k) => {
    const p = was[k];
    if (!p || p.kind !== c.kind || !((p.aware ?? 0) > 0) || (c.aware ?? 0) > 0 || c.gift > 0 || c.down)
      return;
    if (c.kind === 'burrback')
      out.push(
        cue('settle', 'creatures', ctx, snap.frame, 130 + k, {
          x: c.x,
          y: c.y,
          db: AUDIO.giving.loseDb,
          cents: -120,
          priority: 2,
        }),
      );
  });
  return out;
}

/**
 * A calmed creature's breathing: intervals growing from `calmS[0]` to `calmS[1]` s over the gift's calm,
 * fading out with it. Breath k falls where the phase integral of 1 / interval crosses k + 1/2.
 */
export function calmBreath(elapsed: number, of: number): boolean {
  const [a, z] = AUDIO.giving.calmS;
  const span = Math.max(1, of) / 60;
  const b = (z - a) / span;
  const phase = (t: number) => (b > 0 ? Math.log(1 + (b * t) / a) / b : t / a) + 0.5;
  return elapsed > 0 && Math.floor(phase(elapsed / 60)) > Math.floor(phase((elapsed - 1) / 60));
}

/** Frames of the far voice's calls, up to and including `frame` (seeded, irregular: the forest never repeats). */
export function voiceFrame(seed: number, frame: number): boolean {
  const F = AUDIO.forest;
  const s = salt('voice');
  let t = Math.round((8 + hash01(seed, s, -1) * 12) * 60);
  for (let k = 0; t <= frame; k++) {
    if (t === frame) return true;
    t += Math.round(lerp(F.voiceGapS[0], F.voiceGapS[1], hash01(seed, s, k)) * 60);
  }
  return false;
}

/** The one-shots the world makes by itself on this sim frame. */
export function ambient(snap: AudioSnap, cam: AudioCam, ctx: RouteContext): Cue[] {
  const F = AUDIO.forest;
  const f = snap.frame;
  const out: Cue[] = [];
  const seed = ctx.seed;
  const bed = bedOf(snap.room ?? ctx.scene.id);
  // Lanternroot's firefly signs flashing their phrase near her, and the Gloamweaver's heartbeat (route-lr.ts).
  out.push(...signNotes(snap, ctx));
  out.push(...fightPulse(snap, ctx));
  out.push(...canopyAmbient(snap, cam, ctx));
  // Drips: rare, at canopy positions across the view, duller and wetter the farther back.
  if (bed.drips > 0 && hash01(seed, f, salt('drip')) < bed.drips / (F.dripMeanS * 60)) {
    const u = hash01(seed, f, salt('drip'), 1);
    const depth = hash01(seed, f, salt('drip'), 2) ** 0.7;
    const x = cam.x + (hash01(seed, f, salt('drip'), 3) - 0.5) * 2 * F.dripSpanPx;
    const pool = poolOf(ctx.scene);
    const [pl, pb] = F.dripMix;
    let sound: SoundId = u < (pl ?? 0.5) ? 'leaf' : u < (pl ?? 0.5) + (pb ?? 0.3) ? 'bark' : 'plink';
    let px = x;
    let py = cam.y - 200 - depth * 300;
    if (sound === 'plink') {
      if (pool && Math.abs(pool.x - cam.x) < F.dripSpanPx) {
        px = pool.x + (hash01(seed, f, salt('drip'), 4) - 0.5) * pool.w;
        py = pool.y;
      } else sound = 'leaf';
    }
    out.push(
      cue(sound, 'world', ctx, f, 100, {
        x: px,
        y: py,
        db: F.dripDb - 9 * depth,
        far: 0.2 + 0.8 * depth,
        priority: 0,
      }),
    );
    // A cold shaft answers each drip (the well): the same drip again, later, darker, all far.
    if ((bed.echo ?? 0) > 0)
      out.push(
        cue(sound, 'world', ctx, f, 100, {
          x: px,
          y: py,
          db: F.dripDb - 9 * depth + AUDIO.canopy.echoDb + amp(bed.echo ?? 0),
          delay: AUDIO.canopy.echoS * (0.8 + 0.4 * depth),
          far: 1,
          priority: 0,
        }),
      );
  }
  // The far voice: the forest's own mind, where the room is open enough to hear it.
  if (bed.voice && voiceFrame(seed, f)) {
    const side = hash01(seed, f, salt('voice'), 1) < 0.5 ? -1 : 1;
    out.push(
      cue('voice', 'world', ctx, f, 101, {
        x: cam.x + side * (500 + hash01(seed, f, salt('voice'), 2) * 500),
        y: cam.y - 300,
        db: F.voiceDb,
        place: 'fixed',
        pan: side * (0.35 + 0.3 * hash01(seed, f, salt('voice'), 3)),
        far: 1,
        priority: 2,
      }),
    );
  }
  // A burrback asleep breathes slow and soft, heard only near her (silence and sleep are safety).
  (snap.creatures ?? []).forEach((c, k) => {
    if (c.kind !== 'burrback' || !c.dozing) return;
    const d = Math.hypot(c.x - snap.hero.x, c.y - (snap.hero.y - 30));
    const near = 1 - d / AUDIO.giving.sleepPx;
    if (near <= 0 || !sleepBreath(seed, f, k)) return;
    out.push(
      cue('sleepBreath', 'creatures', ctx, f, 120 + k, {
        x: c.x,
        y: c.y,
        db: AUDIO.giving.sleepDb + amp(0.15 + 0.85 * near),
        cents: -150,
        priority: 0,
      }),
    );
  });
  // Calmed burrbacks breathe slower and slower, fading as the calm runs out.
  (snap.creatures ?? []).forEach((c, k) => {
    if (c.kind !== 'burrback' || c.gift <= 0) return;
    if (!calmBreath(c.of - c.gift, c.of)) return;
    out.push(
      cue('calmBreath', 'creatures', ctx, f, 110 + k, {
        x: c.x,
        y: c.y,
        db: AUDIO.giving.calmDb + amp(Math.max(0.08, c.gift / c.of)),
        priority: 1,
      }),
    );
  });
  // Ants (carriers): a tiny skitter now and then while they walk near her.
  const C = AUDIO.creatures;
  (snap.creatures ?? []).forEach((c, k) => {
    if (c.kind !== 'carrier' || c.down || c.mode === 'under' || c.mode === 'sleep') return;
    const near = 1 - Math.hypot(c.x - snap.hero.x, c.y - (snap.hero.y - 30)) / C.skitterPx;
    if (near <= 0 || hash01(seed, f, k, salt('skitter')) >= C.skitterRate / 60) return;
    out.push(
      cue('skitter', 'creatures', ctx, f, 140 + k, {
        x: c.x,
        y: c.y,
        db: C.skitterDb + amp(0.3 + 0.7 * near),
        priority: 0,
      }),
    );
  });
  // Claws on bark: sparse grains while she slides, more the faster.
  const h = snap.hero;
  if (h.mode === 'wallSlide' && !h.faded) {
    const k = clamp01(h.vy / 6.5);
    if (hash01(seed, f, salt('scrape')) < (AUDIO.hero.scrapeRate * (0.3 + 0.7 * k)) / 60)
      out.push(
        cue('scrape', 'hero', ctx, f, 103, {
          x: h.x + h.wallDir * 12,
          y: h.y - 30,
          db: AUDIO.hero.scrapeDb + amp(0.45 + 0.55 * k),
          place: 'hero',
          priority: 1,
        }),
      );
  }
  return out;
}

/** The scene's pool (its rect's top centre and width), if it has one. */
export function poolOf(scene: Scene): { x: number; y: number; w: number } | null {
  const p = scene.solids.find((s) => s.tag === 'pool');
  return p ? { x: p.x + p.w / 2, y: p.y, w: p.w } : null;
}

/** Where each continuous voice should be: linear gains, frequencies (Hz) and pans (-1..1). */
export interface Layers {
  roar: number;
  hissL: number;
  hissR: number;
  hissHz: number;
  air: number;
  airHz: number;
  airPan: number;
  rub: number;
  rubHz: number;
  rubPan: number;
  hum: number;
  humHz: number;
  humPan: number;
  pool: number;
  poolPan: number;
  steam: number;
  glass: number;
  /** The chord of the light she carries: a gain per tone (A4, E5, B5, D5), and where she is. */
  chord: [number, number, number, number];
  chordPan: number;
  /**
   * The nearest burning lamp's hum (voices/lamp.ts): gain, pitch and its beat partner (Hz), its low-pass
   * (opening as she nears), pan; the swarm's flutter on it; the fling's held swell (gain, band Hz).
   */
  lamp: number;
  lampHz: number;
  lampBeat: number;
  lampLp: number;
  lampPan: number;
  flutter: number;
  aim: number;
  aimHz: number;
  /** The world bed's gain (1 = as is; lower in held moments) and the low-pass over all but the lamps (Hz). */
  duck: number;
  muffleHz: number;
  /** Everything (1; 0 = the boss's last hit's total silence: score.ts). */
  hush: number;
  /** The Canopy's own layers (voices/canopy.ts): the earth's rumble, the swarm passing over the hatch (gain, pan,
   * band Hz), the valley's false lights far below, the nearest lampwing's and hawker's wings (gain, pan). */
  earth: number;
  river: number;
  riverPan: number;
  riverHz: number;
  valley: number;
  lampwing: number;
  lampwingPan: number;
  hawker: number;
  hawkerPan: number;
}

/** Screen pan of world x: -1..1 at the view's edges. */
export function panOf(x: number, cam: AudioCam): number {
  return Math.max(-1, Math.min(1, ((x - cam.x) * cam.zoom) / 960));
}

/** A slow seeded drift around 1, from incommensurate sines: no two gusts alike. */
function drift(seed: number, clock: number): number {
  const W = AUDIO.wind;
  let v = 0;
  W.driftS.forEach((p, k) => {
    v += Math.sin((2 * Math.PI * clock) / p + hash01(seed, salt('drift'), k) * 6.283);
  });
  return 1 + W.driftDepth * (v / W.driftS.length);
}

/** A lamp kind's hum row (the ring and great lamps share the great's). */
const lampKey = (kind: string): keyof typeof LAMP_HZ =>
  kind === 'wick' ? 'wick' : kind === 'lantern' ? 'lantern' : 'great';

export function layers(snap: AudioSnap, cam: AudioCam, clock: number, ctx: RouteContext): Layers {
  const W = AUDIO.wind;
  const H = AUDIO.hero;
  const L = AUDIO.lantern;
  const F = AUDIO.forest;
  const A = AUDIO.lamp;
  const h = snap.hero;
  const bed = bedOf(snap.room ?? ctx.scene.id);
  const zw = bed.zones ? zoneWeights(cam.x) : ([0, 0, 0] as [number, number, number]);

  // Wind: the same travelling wave that sways the grass, sampled across the view; the room sets its levels.
  const span = W.spanPx / Math.max(0.25, cam.zoom);
  const gust = 0.5 + 0.5 * Math.sin(clock * 0.23 - cam.x * 0.0005);
  const dr = drift(ctx.seed, clock);
  const sway = (x: number) => clamp01((0.3 * gust + 0.7 * Math.abs(wind(x, clock))) * dr);
  const db = (r: readonly number[], k: number, off: number) =>
    dbToGain(lerp(r[0] ?? -60, r[1] ?? -60, clamp01(k)) + off);
  const roar = db(W.roarDb, gust * dr, bed.wind);
  const hissL = db(W.hissDb, sway(cam.x - span), bed.leaves);
  const hissR = db(W.hissDb, sway(cam.x + span), bed.leaves);
  const hissHz = bed.zones ? W.hissHz[0] * zw[0] + W.hissHz[1] * zw[1] + W.hissHz[2] * zw[2] : bed.hissHz;

  // Her airflow while the wings are open.
  const speed = clamp01(Math.abs(h.vx) / 10.56);
  const gliding = h.gliding && !h.faded;
  const flight = gliding ? dbToGain(H.airDb) * (0.35 + 0.65 * speed) : 0;
  const airHz = 480 + 420 * speed;
  const airPan = panOf(h.x, cam) * H.panWidth;

  // The bowl she is kindling (the test grove's lanterns): a rubbed rim swelling with the channel.
  let rub = 0;
  let rubHz: number = PITCH.D3;
  let rubPan = 0;
  // (The channel runs on while she stays on its leash, so read the lights, not where she stands.)
  let kl: AudioSnap['lights'][number] | undefined;
  for (const l of snap.lights) if (!l.lit && l.progress > 0 && (!kl || l.progress > kl.progress)) kl = l;
  if (kl && !kl.lit && kl.progress > 0) {
    rub = dbToGain(L.rubDb + (kl.lamp ? L.lampTrim : 0)) * kl.progress ** 1.5;
    rubHz = kl.lamp ? PITCH.D4 : PITCH.D3;
    rubPan = panOf(kl.x, cam) * 0.6;
  }
  // A lit lantern near her hums, faint and steady.
  let hum = 0;
  let humHz: number = PITCH.D3;
  let humPan = 0;
  for (const l of snap.lights) {
    if (!l.lit) continue;
    const d = Math.hypot(l.x - h.x, l.y - h.y);
    const g = dbToGain(L.humDb + (l.lamp ? L.lampTrim : 0)) * clamp01(1 - d / L.humPx) ** 2;
    if (g > hum) {
      hum = g;
      humHz = l.lamp ? PITCH.D4 : PITCH.D3;
      humPan = panOf(l.x, cam) * 0.6;
    }
  }

  // The pool laps; in the grove the root steam breathes under the light well and the violet air is glassy.
  const pool = poolOf(ctx.scene);
  let poolG = 0;
  let poolPan = 0;
  if (pool) {
    const d = Math.hypot(pool.x - cam.x, pool.y - cam.y);
    const lap = 0.6 + 0.4 * Math.sin(clock * 0.7 + 2 * Math.sin(clock * 0.31));
    poolG = dbToGain(F.poolDb) * clamp01(1 - d / F.poolPx) ** 2 * lap;
    poolPan = panOf(pool.x, cam) * 0.7;
  }
  const steam = dbToGain(F.steamDb) * zw[1];
  const glass = dbToGain(F.glassDb) * zw[2] * (0.4 + 0.6 * gust);

  // What she carries makes a tone (the test grove's giving): one more chord tone per seen level.
  const level = h.faded ? 0 : Math.max(0, Math.min(4, snap.seenLevel ?? 0));
  const G = AUDIO.giving;
  const total = level > 0 ? dbToGain(lerp(G.chordDb[0], G.chordDb[1], (level - 1) / 3)) : 0;
  const each = level > 0 ? total / Math.sqrt(level) : 0;
  const chord = [0, 1, 2, 3].map((k) => (k < level ? each : 0)) as Layers['chord'];

  // The lamps: the nearest burning flame hums, steady and a little sharp of the forest; nearer, louder
  // and brighter, and the world's own sounds draw back a little (being drawn in).
  const bx = h.x;
  const by = h.y - 40;
  let near = 0;
  let lamp: NonNullable<AudioSnap['lures']>[number] | undefined;
  for (const l of snap.lures ?? []) {
    const k = clamp01(1 - Math.hypot(l.x - bx, l.y - by) / Math.max(1, l.reach));
    if (k > near || (h.fling ?? -1) === l.i) {
      near = (h.fling ?? -1) === l.i ? 1 : k;
      lamp = l;
      if ((h.fling ?? -1) === l.i) break;
    }
  }
  const key = lampKey(lamp?.kind ?? 'wick');
  const aiming = (h.fling ?? -1) >= 0;
  const aimK = aiming ? 0.35 + 0.65 * (h.aim ?? 0) : 0;
  const lampG = lamp ? dbToGain(A.humDb) * near ** 2 * (aiming ? 1.4 : 1) : 0;

  // Held moments: the fling's slowed aim, a story hold, a fade. And her hurt muffles all but the lamps.
  const held = Math.max(aiming ? 1 : 0, snap.hold ? 0.7 : 0, h.faded ? 0.5 : 0, 0.35 * near ** 2);
  const hurt = (h.stagger ?? 0) > 0 && !h.faded;
  const muffleHz = hurt ? AUDIO.combat.muffleHz : aiming ? 1400 + 2600 * (1 - aimK) : 20000;

  return {
    chord,
    chordPan: panOf(h.x, cam) * H.panWidth,
    roar,
    hissL,
    hissR,
    hissHz,
    air: flight,
    airHz,
    airPan,
    rub,
    rubHz,
    rubPan,
    hum,
    humHz,
    humPan,
    pool: poolG,
    poolPan,
    steam,
    glass,
    lamp: lampG,
    lampHz: LAMP_HZ[key],
    lampBeat: LAMP_BEAT[key],
    lampLp: lerp(A.humLp[0], A.humLp[1], near ** 1.5),
    lampPan: lamp ? panOf(lamp.x, cam) * 0.7 : 0,
    flutter: lamp ? dbToGain(A.flutterDb) * near : 0,
    aim: aiming ? dbToGain(A.aimDb) * aimK : 0,
    aimHz: LAMP_HZ[key] * (0.5 + 1.5 * (h.aim ?? 0)),
    duck: dbToGain(AUDIO.duckDb * clamp01(held)),
    muffleHz,
    hush: 1,
    ...canopyLayers(snap, cam, clock, ctx),
  };
}
