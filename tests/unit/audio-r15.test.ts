import { describe, expect, it } from 'vitest';
import { midiOf, type PitchedId } from '../../src/audio/bake-music';
import { canopyAmbient, canopyLayers, routeCanopy } from '../../src/audio/route-canopy';
import type { PlayEvent } from '../../src/audio/route-play';
import { type AudioSnap, type Cue, creatureCues, layers } from '../../src/audio/router';
import { CHASE_CHORD, nm, Score } from '../../src/audio/score';
import { AUDIO } from '../../src/audio/tuning';
import type { Scene } from '../../src/sim/scene';
import { flatScene } from './helpers';

/**
 * The Canopy round 15 in sound (memory/audio.md "Round 15"): the slam's wave heard after the slam, the escape in three
 * sections fitted to the new way out and resolving into the vista, the chase's catch and its rests, the kin's sit beat
 * by beat, quiet moments, and a find's music never inside the sit.
 */
const scene = { ...flatScene(), id: 'cn-den' };
const ctx = { scene, seed: 1 };
const ev = (o: Record<string, unknown>) => o as unknown as PlayEvent;
const cam = { x: 1000, y: 800, zoom: 1 };

function snap(frame: number, over: Partial<AudioSnap> = {}): AudioSnap {
  return {
    frame,
    room: 'cn-den',
    hero: {
      x: 1000,
      y: 800,
      vx: 0,
      vy: 0,
      motion: 'idle',
      mode: 'ground',
      grounded: true,
      gliding: false,
      facing: 1,
      wallDir: 0,
      freeze: 0,
      faded: false,
      kindling: false,
      kindlingLamp: false,
    } as unknown as AudioSnap['hero'],
    lights: [],
    ...over,
  };
}

function run(
  score: Score,
  from: number,
  to: number,
  over: (f: number) => Partial<AudioSnap> = () => ({}),
  events: Record<number, PlayEvent[]> = {},
) {
  const cues: Cue[] = [];
  const pieces: string[] = [];
  const cuts: number[] = [];
  for (let f = from; f < to; f++) {
    const out = score.step(events[f] ?? [], snap(f, over(f)));
    cues.push(...out.cues);
    if (out.cut !== null) cuts.push(f);
    pieces.push(score.mood());
  }
  return { cues, pieces, cuts };
}
const midi = (c: Cue) => midiOf(c.sound as PitchedId, c.variant) + c.cents / 100;

describe("the slam's wave r15", () => {
  it('the crack opens at its feet first; the fronts go after the delay', () => {
    const cues = routeCanopy(
      ev({
        type: 'keeperWave',
        id: 'k',
        phase: 'slam',
        x: 1600,
        y: 1344,
        x0: 0,
        x1: 3200,
        frames: 12,
        speed: 12,
      }),
      0,
      snap(10),
      ctx,
    );
    expect(cues[0]?.sound).toBe('fissure');
    expect(cues[0]?.delay).toBe(0);
    const go = cues.find((c) => c.sound === 'rockLand') as Cue;
    expect(go.delay).toBeCloseTo(12 / 60, 5);
    expect(cues.every((c) => c.x === 1600)).toBe(true);
    expect(
      routeCanopy(ev({ type: 'keeperWave', id: 'k', phase: 'tell', x: 1600, y: 1344 }), 0, snap(10), ctx),
    ).toEqual([]);
  });

  it('each front is heard where it runs, both ways, until it is gone', () => {
    const f = AUDIO.canopy.waveEvery * 10;
    const fronts = canopyAmbient(
      snap(f, { waves: [{ x: 1600, y: 1344, d: 240, wait: 0 }] }),
      cam,
      ctx,
    ).filter((c) => c.sound === 'waveGrit');
    expect(fronts.map((c) => c.x).sort((a, b) => a - b)).toEqual([1360, 1840]);
    expect(fronts.every((c) => c.place === 'world' && c.y === 1344)).toBe(true);
    // The crack still opening: no fronts yet. Off the room: not heard.
    const wait = canopyAmbient(snap(f, { waves: [{ x: 1600, y: 1344, d: 0, wait: 6 }] }), cam, ctx);
    expect(wait.some((c) => c.sound === 'waveGrit')).toBe(false);
    const edge = canopyAmbient(snap(f, { waves: [{ x: 200, y: 1344, d: 400, wait: 0 }] }), cam, ctx);
    expect(edge.filter((c) => c.sound === 'waveGrit').map((c) => c.x)).toEqual([600]);
    // Farther run, quieter.
    const far = canopyAmbient(snap(f, { waves: [{ x: 1600, y: 1344, d: 1400, wait: 0 }] }), cam, ctx);
    expect((far.find((c) => c.sound === 'waveGrit') as Cue).db).toBeLessThan((fronts[0] as Cue).db - 5);
  });
});

describe('the escape r15', () => {
  const esc = (front: number, rise = 0, gap = 240): AudioSnap['escape'] => ({
    on: 1,
    cp: 3,
    of: 6,
    front,
    gap: front >= 0 ? gap : -1,
    rise,
    x0: 0,
    x1: 2000,
  });

  it('runs on through the breach in sections (run, down, climb) and resolves into the vista', () => {
    const sc = new Score(ctx);
    const room = (f: number) => (f < 600 ? 'cn-den' : 'cn-out');
    const over = (f: number): Partial<AudioSnap> => ({
      room: room(f),
      escape: f < 600 ? esc(-1) : f < 1000 ? esc(-1) : esc(1500, Math.min(1, (f - 1000) / 1200)),
    });
    const flag = ev({ type: 'flagSet', flag: 'cn-out-vista', by: 'out-vista', x: 0, y: 0 });
    const r = run(sc, 0, 3600, over, {
      10: [ev({ type: 'escapeStart', id: 'e', x: 0, y: 0 })],
      600: [ev({ type: 'escapeStart', id: 'e', x: 0, y: 0 })],
      2300: [flag],
      2310: [ev({ type: 'escapeEnd', id: 'e', x: 0, y: 0 })],
    });
    expect(r.pieces[100]).toBe('escape');
    // The room change does not cut it.
    expect(r.pieces[700]).toBe('escape');
    expect(r.cuts.filter((f) => f >= 590 && f < 700)).toEqual([]);
    const bass = (from: number, to: number) =>
      r.cues
        .filter((c) => c.sound === 'marc' && c.frame >= from && c.frame < to)
        .map((c) => Math.round(midi(c)));
    // The den: D minor's drive; the way down: a D pedal, no gallop's big drum after its entry; the climb: an A pedal.
    expect(bass(10, 400)).toContain(nm('D2'));
    expect(bass(700, 1000).every((m) => m === nm('D2'))).toBe(true);
    expect(bass(1100, 1500)).toContain(nm('A1'));
    // Phrases change as the earth rises: the long chromatic climb at the top.
    const strings = r.cues
      .filter((c) => c.sound === 'strings' && c.frame >= 1900 && c.frame < 2300)
      .map(midi);
    expect(strings).toContain(nm('C#6'));
    // Out on the clifftop: the drive resolves (escaped), then the vista's theme.
    expect(r.pieces[2400]).toBe('escaped');
    const v = r.pieces.indexOf('vista');
    expect(v).toBeGreaterThan(2400);
    expect((v - 2300) / 60).toBeLessThan(6);
  });

  it('the scream only when the front creeps close (not at its usual 240)', () => {
    const sc = new Score({ ...ctx, scene: { ...scene, id: 'cn-out' } });
    const go = { 10: [ev({ type: 'escapeStart', id: 'e', x: 0, y: 0 })] };
    const usual = run(sc, 0, 400, () => ({ room: 'cn-out', escape: esc(1500, 0.2, 240) }), go);
    expect(usual.cues.some((c) => c.sound === 'trem' && Math.round(midi(c)) === nm('E6'))).toBe(false);
    const sc2 = new Score({ ...ctx, scene: { ...scene, id: 'cn-out' } });
    const close = run(sc2, 0, 400, () => ({ room: 'cn-out', escape: esc(1500, 0.2, 200) }), go);
    expect(close.cues.some((c) => c.sound === 'trem' && Math.round(midi(c)) === nm('E6'))).toBe(true);
  });

  it("the front's rumble follows its distance; before it, the roof coming down behind her", () => {
    const at = (gap: number) => canopyLayers(snap(10, { escape: esc(1500, 0.3, gap) }), cam, 0, ctx);
    expect(at(200).collapse).toBeGreaterThan(at(240).collapse);
    expect(at(240).collapse).toBeGreaterThan(at(400).collapse * 1.5);
    const behind = canopyLayers(snap(10, { escape: esc(-1) }), cam, 0, ctx);
    expect(behind.collapse).toBeGreaterThan(0);
    expect(behind.collapse).toBeLessThan(at(400).collapse);
  });
});

describe('the chase r15', () => {
  const gap: Scene = {
    ...flatScene(),
    id: 'cn-gap',
    lures: [{ id: 'hook-3', kind: 'wick', x: 0, y: 0, hook: true } as never],
  };
  const gctx = { scene: gap, seed: 1 };

  it('a press at a hook pulls her onto its flame: the pull, and her harp up into its sharp note', () => {
    const fs = ev({ type: 'flingStart', id: 'hook-3', x: 0, y: 0, frames: 36 });
    const s = snap(10, { room: 'cn-gap', chase: { beat: 2, lead: 300 } });
    expect(routeCanopy(fs, 0, s, gctx).map((c) => c.sound)).toEqual(['hookPull']);
    expect(routeCanopy(fs, 0, snap(10, { room: 'cn-gap' }), gctx)).toEqual([]);
    const sc = new Score(gctx);
    const kindle = ev({ type: 'fireflyKindle', id: 'f', lure: 'h', x: 0, y: 0 });
    const r = run(sc, 0, 200, () => ({ room: 'cn-gap', chase: { beat: 2, lead: 300 } }), {
      10: [ev({ type: 'fireflyChase', id: 'f', phase: 'start', x: 0, y: 0 })],
      50: [kindle],
      100: [fs],
    });
    const top = r.cues.filter((c) => c.frame === 100 && c.sound === 'celesta').map(midi);
    expect(top).toEqual([expect.closeTo((CHASE_CHORD[1] as number) + 12 + 0.38, 3)]);
    // The air thickening as a hook comes into reach (once, as it starts).
    const was = snap(9, { room: 'cn-gap', chase: { beat: 2, lead: 300 } });
    const now = snap(10, { room: 'cn-gap', chase: { beat: 2, lead: 300 } });
    now.hero.catchK = 0.2;
    expect(creatureCues(was, now, gctx).map((c) => c.sound)).toEqual(['slowIn']);
    expect(creatureCues(now, now, gctx)).toEqual([]);
  });

  it('a rest is a breath: the pulse stops while she hangs there, and comes back after', () => {
    const sc = new Score(gctx);
    const bar = AUDIO.score.chaseBeat * 4;
    const resting = (f: number) => f >= 300 && f < 500;
    const r = run(
      sc,
      0,
      800,
      (f) => ({ room: 'cn-gap', chase: { beat: 2, lead: 300, rest: resting(f) ? 1 : 0 } }),
      { 10: [ev({ type: 'fireflyChase', id: 'f', phase: 'start', x: 0, y: 0 })] },
    );
    const barAt = (f0: number) => r.cues.filter((c) => c.frame === f0 && c.bus === 'score');
    const held = 10 + bar * Math.ceil((300 - 10) / bar);
    expect(barAt(held).some((c) => c.sound === 'felt')).toBe(false);
    // The breath on arrival: the forest's chord in tune, her harp's A.
    expect(barAt(300).some((c) => c.sound === 'harp' && Math.round(midi(c)) === nm('A4'))).toBe(true);
    const after = 10 + bar * Math.ceil((520 - 10) / bar);
    expect(barAt(after).some((c) => c.sound === 'felt')).toBe(true);
  });
});

describe("the kin's sit r15", () => {
  const crown = { ...ctx, scene: { ...scene, id: 'cn-crown' } };
  const beat = (phase: string, her = 1) =>
    ev({ type: 'kinBeat', id: 'kin', phase, frames: 60, x: 0, y: 0, her });

  it('the torn wing tries and fails; Wing answers only if she is by it', () => {
    const s = snap(10, { room: 'cn-crown' });
    expect(routeCanopy(beat('try'), 0, s, crown).map((c) => c.sound)).toEqual(['kinTry']);
    expect(routeCanopy(beat('fail'), 0, s, crown)[0]?.sound).toBe('wingFold');
    expect(routeCanopy(beat('turn'), 0, s, crown)).toEqual([]);
    expect(routeCanopy(beat('answer', 1), 0, s, crown)[0]?.sound).toBe('wingOpen');
    expect(routeCanopy(beat('answer', 0), 0, s, crown)).toEqual([]);
  });

  it('the duet on the beats: its A flat and straining as the wing tries; reached in tune with her answer', () => {
    const sc = new Score(crown);
    const r = run(sc, 0, 900, () => ({ room: 'cn-crown' }), {
      10: [ev({ type: 'kinSit', id: 'kin', x: 0, y: 0 }), beat('come')],
      200: [beat('try')],
      300: [beat('fail')],
      400: [beat('turn')],
      500: [beat('answer', 1)],
      700: [beat('stay')],
    });
    const tr = r.cues.find((c) => c.frame === 200 && c.sound === 'trem') as Cue;
    expect(midi(tr)).toBeCloseTo(nm('A5') - 0.35, 2);
    expect(r.cues.filter((c) => c.frame === 400 && c.sound !== 'glass')).toEqual([]);
    const a5 = r.cues.find((c) => c.frame === 500 && c.sound === 'felt') as Cue;
    expect(Math.round(midi(a5) * 100) / 100).toBe(nm('A5'));
    expect(r.pieces[100]).toBe('duet');
    expect(r.pieces[750]).toBe('silence');
  });

  it("the glide's grant waits out the sit; the bed draws back in quiet moments", () => {
    const sc = new Score(crown);
    const grant = ev({ type: 'gladeGrant', id: 'g', ability: 'glide', x: 0, y: 0 });
    const r = run(sc, 0, 1200, (f) => ({ room: 'cn-crown', quiet: f >= 10 && f < 700 ? 'sit' : '' }), {
      10: [ev({ type: 'kinSit', id: 'kin', x: 0, y: 0 })],
      100: [grant],
      650: [beat('stay')],
    });
    expect(r.pieces.slice(100, 700).includes('grant')).toBe(false);
    expect(r.pieces.slice(700, 900).includes('grant')).toBe(true);
    const quiet = snap(100, { room: 'cn-out', quiet: 'vista' });
    const loud = snap(100, { room: 'cn-out' });
    const duck = (s: AudioSnap) => new Score(ctx).shape(layers(s, cam, 0, ctx), s).duck;
    expect(duck(quiet)).toBeLessThan(duck(loud) * 0.6);
  });
});
