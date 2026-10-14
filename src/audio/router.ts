/**
 * What the world sounds like, as data: pure functions from sim events and state to cues (one-shots)
 * and layer targets (the continuous voices). No AudioContext here, so Vitest runs it over real sim
 * tapes, and one tape always routes to the same cues.
 *
 * - `route(event)`: one-shots a sim event asks for. Most events make no sound.
 * - `ambient(snap)`: one-shots the world makes on its own this frame (drips, the far voice, the
 *   Hush's knock, claws on a wall slide). Dice are keyed by frame, never drawn from a stream.
 * - `layers(snap, cam, clock)`: where every continuous voice should be now (state-driven, so
 *   unmuting mid-play or after a teleport is right at once).
 */

import { zoneWeights } from '../render/scene/lib/fx-zones';
import { wind } from '../render/scene/lib/look';
import type { SimEvent } from '../sim/events';
import type { Scene, SceneTag } from '../sim/scene';
import type { GameState, PlayerState } from '../sim/state';
import { SOUNDS, type SoundId } from './bake';
import { hushPhase, isKnock, PULSE_FRAMES } from './clock';
import { dbToGain, hash01, salt } from './dsp';
import { AUDIO, type BusId, HUSH, PITCH } from './tuning';

/** The camera as audio hears it: the listener sits at the view centre. */
export interface AudioCam {
  x: number;
  y: number;
  zoom: number;
}

/** The little of a sim state the sound needs, as plain JSON (it is what a tape records). */
export interface AudioSnap {
  frame: number;
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
  };
  /** Lanterns then lamps: foot position, lit, channel progress 0..1. */
  lights: Array<{ x: number; y: number; lit: boolean; progress: number; lamp: boolean }>;
}

export function snapOf(state: GameState, scene: Scene, channelFrames: number): AudioSnap {
  const p = state.player;
  const of = Math.max(1, channelFrames);
  const lights: AudioSnap['lights'] = [];
  for (const lamp of [false, true]) {
    const list = (lamp ? scene.lamps : scene.lanterns) ?? [];
    const st = lamp ? state.goal.lamps : state.goal.lanterns;
    list.forEach((l, i) => {
      const s = st[i];
      lights.push({ x: l.x, y: l.y, lit: !!s?.lit, progress: Math.min(1, (s?.channel ?? 0) / of), lamp });
    });
  }
  return {
    frame: state.frame,
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
    },
    lights,
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
}

/** What the router needs besides the event: the scene and the seed. */
export interface RouteContext {
  scene: Scene;
  seed: number;
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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const amp = (k: number) => 20 * Math.log10(Math.max(1e-4, k));

/** A variant and a few cents of detune, seeded by frame, event index and sound (no repeats per tape). */
function pick(sound: SoundId, count: number, ctx: RouteContext, frame: number, i: number) {
  const s = salt(sound);
  return {
    variant: Math.floor(hash01(ctx.seed, frame, i, s) * count) % count,
    cents: (hash01(ctx.seed, frame, i, s, 1) - 0.5) * 80,
    trim: (hash01(ctx.seed, frame, i, s, 2) - 0.5) * 2,
  };
}

function cue(
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
 * make no sound: footsteps on moss, turns, skids, apexes, slashes, glints (later milestones).
 */
export function route(e: SimEvent, i: number, snap: AudioSnap, ctx: RouteContext): Cue[] {
  const H = AUDIO.hero;
  const L = AUDIO.lantern;
  const f = snap.frame;
  const hero = (sound: SoundId, db: number, over: Partial<Cue> = {}) =>
    cue(sound, 'hero', ctx, f, i, { x: e.x, y: e.y, db, place: 'hero', priority: 3, ...over });
  switch (e.type) {
    case 'jump': {
      if (e.kind !== 'double') return [hero('wing', H.wingDb - (e.kind === 'wall' ? 1 : 0))];
      // The somersault: two beats and a whoosh that crosses her as she turns.
      const dir = e.dir || snap.hero.facing || 1;
      return [
        hero('wing', H.wingDb - 1),
        hero('wing', H.wingDb - 3, { delay: H.flutterS, cents: -60 }),
        hero('whoosh', H.whooshDb, { place: 'hero', pan: -0.35 * dir, panTo: 0.35 * dir }),
      ];
    }
    case 'glideStart': {
      // A soft deep whumpf out of a long fall, nothing after an apex.
      const k = clamp01((e.vy - H.catchVy[0]) / (H.catchVy[1] - H.catchVy[0]));
      if (k <= 0) return [];
      return [hero('catch', H.catchDb + amp(0.2 + 0.8 * k), { cents: -180 * k })];
    }
    case 'dashStart':
      // The wind-up frames are silent (the hold is the sound); the gust comes as she moves.
      return [hero('dash', H.dashDb, { delay: Math.max(1, snap.hero.freeze) / 60 })];
    case 'land': {
      const mat = materialAt(ctx.scene, e.x, e.y);
      const k = clamp01((e.vy - H.dustVy[0]) / (H.dustVy[1] - H.dustVy[0]));
      const out: Cue[] = [];
      if (mat === 'water') out.push(hero('splash', H.dustDb + amp(0.4 + 0.6 * k)));
      else out.push(hero('dust', H.dustDb + amp(0.25 + 0.75 * k)));
      if (e.hard && mat !== 'water')
        out.push(hero(mat === 'wood' ? 'thumpWood' : 'thump', H.thumpDb, { priority: 4 }));
      return out;
    }
    case 'step':
      // Silent on moss; the faintest tick on wood.
      return materialAt(ctx.scene, e.x, e.y) === 'wood' ? [hero('tick', H.tickDb, { priority: 0 })] : [];
    case 'wallSlideStart':
      return [hero('scrape', H.scrapeDb, { x: e.x + e.dir * 12 })];
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
      return [
        cue(sound, 'lantern', ctx, f, i, {
          x: e.x,
          y: e.y - 40,
          db,
          far: what === 'Kindle' ? 0.25 : 0.1,
          priority: what === 'Kindle' ? 6 : 4,
        }),
      ];
    }
    default:
      return [];
  }
}

/** Frames of the far voice's calls, up to and including `frame` (seeded; never on the knock). */
export function voiceFrame(seed: number, frame: number): boolean {
  const F = AUDIO.forest;
  const s = salt('voice');
  let t = Math.round((8 + hash01(seed, s, -1) * 12) * 60);
  for (let k = 0; t <= frame; k++) {
    // Never on the Hush's beat: slide a call that would land near a knock clear of it.
    const near = t % PULSE_FRAMES;
    const clear = Math.round(F.voiceClearS * 60);
    const at = near < clear ? t + clear : near > PULSE_FRAMES - clear ? t + 2 * clear : t;
    if (at === frame) return true;
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
  // Drips: rare, at canopy positions across the view, duller and wetter the farther back.
  if (hash01(seed, f, salt('drip')) < 1 / (F.dripMeanS * 60)) {
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
  }
  // The far voice: the forest's own mind, never on a beat.
  if (voiceFrame(seed, f)) {
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
  // The Hush's knock at the top of each swell: left, then right.
  if (isKnock(f)) {
    const beat = hushPhase(f).beat;
    out.push(
      cue('knock', 'hush', ctx, f, 102, {
        x: cam.x,
        y: cam.y + 400,
        db: AUDIO.hush.knockDb,
        place: 'fixed',
        pan: beat % 2 === 1 ? -0.22 : 0.22,
        far: 0.35,
        priority: 2,
      }),
    );
  }
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
  breath: number;
  f1: number;
  f2: number;
  pulse: number;
  soilHz: number;
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

export function layers(snap: AudioSnap, cam: AudioCam, clock: number, ctx: RouteContext): Layers {
  const W = AUDIO.wind;
  const M = AUDIO.hush;
  const H = AUDIO.hero;
  const L = AUDIO.lantern;
  const F = AUDIO.forest;
  const h = snap.hero;
  const zw = zoneWeights(cam.x);
  const mp = hushPhase(snap.frame);

  // A lit lantern near her muffles the Hush: safety is audible.
  let safe = 0;
  for (const l of snap.lights) {
    if (!l.lit || l.lamp) continue;
    const d = Math.hypot(l.x - h.x, l.y - h.y);
    safe = Math.max(safe, clamp01((M.safePx - d) / (M.safePx * (2 / 3))));
  }
  // Where root has reached, the world breathes with the Hush (gone near a lit lantern).
  const breathe = 1 + M.worldDepth * (mp.air - 0.5) * 2 * (1 - safe);

  // Wind: the same travelling wave that sways the grass, sampled across the view.
  const span = W.spanPx / Math.max(0.25, cam.zoom);
  const gust = 0.5 + 0.5 * Math.sin(clock * 0.23 - cam.x * 0.0005);
  const dr = drift(ctx.seed, clock);
  const sway = (x: number) => clamp01((0.3 * gust + 0.7 * Math.abs(wind(x, clock))) * dr);
  const db = (r: readonly number[], k: number) => dbToGain(lerp(r[0] ?? -60, r[1] ?? -60, clamp01(k)));
  const roar = db(W.roarDb, gust * dr) * breathe;
  const hissL = db(W.hissDb, sway(cam.x - span));
  const hissR = db(W.hissDb, sway(cam.x + span));
  const hissHz = W.hissHz[0] * zw[0] + W.hissHz[1] * zw[1] + W.hissHz[2] * zw[2];

  // The Hush, under the soil: breath (oo <-> aa) and the beating pulse.
  const air = lerp(mp.air, 0.35, safe);
  const breath = dbToGain(M.breathDb) * (0.06 + 0.94 * air) * (1 - 0.5 * safe);
  const pulse = dbToGain(M.pulseDb) * (0.03 + 0.97 * mp.swell) * (1 - 0.4 * safe);
  const vowel = lerp(mp.vowel, 0, safe);
  const f1 = lerp(HUSH.oo[0], HUSH.aa[0], vowel);
  const f2 = lerp(HUSH.oo[1], HUSH.aa[1], vowel);
  const soilHz = lerp(M.soilHz, M.safeHz, safe);

  // Her airflow while the wings are open.
  const speed = clamp01(Math.abs(h.vx) / 10.56);
  const gliding = h.gliding && !h.faded;
  const flight = gliding ? dbToGain(H.airDb) * (0.35 + 0.65 * speed) : 0;
  const airHz = 480 + 420 * speed;
  const airPan = panOf(h.x, cam) * H.panWidth;

  // The bowl she is kindling: a rubbed rim swelling with the channel.
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
  // A lit light near her hums, faint and steady.
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

  // The pool laps, the root steam breathes under the light well, the violet air is glassy.
  const pool = poolOf(ctx.scene);
  let poolG = 0;
  let poolPan = 0;
  if (pool) {
    const d = Math.hypot(pool.x - cam.x, pool.y - cam.y);
    const lap = 0.6 + 0.4 * Math.sin(clock * 0.7 + 2 * Math.sin(clock * 0.31));
    poolG = dbToGain(F.poolDb) * clamp01(1 - d / F.poolPx) ** 2 * lap;
    poolPan = panOf(pool.x, cam) * 0.7;
  }
  const steam = dbToGain(F.steamDb) * zw[1] * breathe;
  const glass = dbToGain(F.glassDb) * zw[2] * (0.4 + 0.6 * gust);

  return {
    roar,
    hissL,
    hissR,
    hissHz,
    breath,
    f1,
    f2,
    pulse,
    soilHz,
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
  };
}
