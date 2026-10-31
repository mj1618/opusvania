import { describe, expect, it } from 'vitest';
import { midiOf, type PitchedId } from '../../src/audio/bake-music';
import { canopyLayers, routeCanopy } from '../../src/audio/route-canopy';
import type { PlayEvent } from '../../src/audio/route-play';
import type { AudioSnap, Cue } from '../../src/audio/router';
import { nm, Score } from '../../src/audio/score';
import { AUDIO } from '../../src/audio/tuning';
import { flatScene } from './helpers';

/**
 * The Canopy round 14 in sound (memory/audio.md "Round 14"): the Keeper's honest tells (the sweep's tell unlike
 * eating, the rage beat stopping the music and bringing it back angry), the column carrying her motif home, the
 * escape's drive and its way out, rocks heard where they fall, the front's rumble, the chase going on after a fall.
 */
const scene = { ...flatScene(), id: 'cn-den' };
const ctx = { scene, seed: 1 };
const ev = (o: Record<string, unknown>) => o as unknown as PlayEvent;

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
const at = (c: Cue) => c.frame + c.delay * 60;
const fight = (angry = 0): Partial<AudioSnap> => ({
  fight: { kind: 'keeper', stage: 'fight', phase: 1, x: 1500, y: 900, angry },
});

describe('the Keeper r14', () => {
  it("the sweep's tell sounds like danger, not food: no crunch until it eats", () => {
    const s = snap(10, { fight: { kind: 'keeper', stage: 'fight', phase: 3, x: 1500, y: 900 } });
    const tell = routeCanopy(
      ev({ type: 'keeperSweepTell', id: 'k', x0: 1300, x1: 1700, y: 1344, frames: 42 }),
      0,
      s,
      ctx,
    );
    const eat = routeCanopy(
      ev({ type: 'keeperEat', id: 'k', x: 1500, y: 1300, frames: 90, sweep: true }),
      0,
      s,
      ctx,
    );
    expect(tell.map((c) => c.sound)).toContain('sweepTell');
    expect(tell.some((c) => c.sound === 'crunch' || c.sound === 'creak')).toBe(false);
    expect(eat.filter((c) => c.sound === 'crunch').length).toBeGreaterThanOrEqual(2);
    expect(eat.some((c) => c.sound === 'sweepTell')).toBe(false);
  });

  it('the rage beat: the music stops dead for its roar and comes back on the slam, angry', () => {
    const sc = new Score(ctx);
    const r = run(sc, 0, 1600, (f) => fight(f >= 940 ? 2 : f >= 900 ? 1 : 0), {
      0: [ev({ type: 'bossCue', id: 'k', x: 0, y: 0, set: 'intro', cue: 'intro', frame: 0 })],
      900: [ev({ type: 'keeperRage', id: 'k', x: 1500, y: 900, phase: 'rear', frames: 40 })],
      940: [ev({ type: 'keeperRage', id: 'k', x: 1500, y: 900, phase: 'slam', frames: 30 })],
    });
    expect(r.pieces[850]).toBe('boss1');
    expect(r.cuts).toContain(900);
    expect(r.pieces[920]).toBe('silence');
    expect(r.cues.filter((c) => c.bus === 'score' && c.frame > 900 && c.frame < 940)).toEqual([]);
    expect(r.pieces[945]).toBe('boss1');
    // Angry (the slam sets it): col legno sixteenths from its first bar, the flat second high over it.
    const first = r.cues.filter((c) => c.frame === 940 && c.bus === 'score');
    expect(first.filter((c) => c.sound === 'colLegno').length).toBe(16);
    expect(first.some((c) => c.sound === 'trem' && midi(c) === nm('Eb5'))).toBe(true);
  });
});

describe('the column and the escape', () => {
  const great = ev({ type: 'lureSnuff', id: 'trap-den', trap: true, moths: 110, x: 1800, y: 1200 });
  it('the column carries her motif home to D, with the one F sharp, then the escape takes over without cutting it', () => {
    const sc = new Score(ctx);
    const r = run(
      sc,
      0,
      900,
      (f) =>
        f > 300 && f < 700
          ? { escape: { on: 1, cp: 0, of: 4, front: -1, gap: -1, rise: 0, x0: 0, x1: 0 } }
          : {},
      {
        10: [great],
        300: [ev({ type: 'escapeStart', id: 'e', x: 0, y: 0 })],
        700: [ev({ type: 'escapeEnd', id: 'e', x: 0, y: 0 })],
      },
    );
    const hold = 22;
    expect(r.pieces[10 + hold + 1]).toBe('column');
    const harp = r.cues
      .filter((c) => c.sound === 'harp' && c.frame < 300)
      .sort((a, b) => at(a) - at(b))
      .map(midi);
    expect(harp.slice(0, 6)).toEqual(['A4', 'D5', 'E5', 'F5', 'E5', 'D5'].map(nm));
    expect(r.cues.some((c) => c.sound === 'strings' && c.frame < 300 && midi(c) === nm('F#3'))).toBe(true);
    // The resolution lands ~1.6 s into the column.
    const home = r.cues.find(
      (c) => c.sound === 'harp' && midi(c) === nm('D5') && c.frame > 10 + hold + 30,
    ) as Cue;
    expect((at(home) - (10 + hold)) / 60).toBeCloseTo(1.6, 1);
    expect(r.pieces[320]).toBe('escape');
    expect(r.cuts.filter((f) => f >= 290 && f < 330)).toEqual([]);
    expect(r.pieces[720]).toBe('escaped');
    // The way out lands on the forest's chord over D, with her A on top: open.
    const out = r.cues.filter((c) => c.frame > 700 && c.sound === 'glass').map(midi);
    expect(out).toEqual(['D4', 'A4', 'E5', 'B5'].map(nm));
  });

  it("a great release in the last hit's silence ends the silence", () => {
    const sc = new Score(ctx);
    const down = (f: number): Partial<AudioSnap> => ({
      fight: { kind: 'keeper', stage: f < 100 ? 'fight' : 'down', phase: 3, x: 0, y: 0 },
    });
    run(sc, 0, 130, down);
    run(sc, 130, 131, down, { 130: [great] });
    const L = sc.shape(
      { hush: 1, scoreHz: 20000, muffleHz: 20000, duck: 1, lampHz: 300 } as never,
      snap(140, down(140)),
    );
    expect(L.hush).toBe(1);
  });

  it("a rock's tell is heard where it will fall; the front's rumble grows as it nears her", () => {
    const s = snap(10);
    const tell = routeCanopy(
      ev({ type: 'rockfall', id: 'r', phase: 'tell', x: 2400, y: 352, w: 96, tell: 64 }),
      0,
      s,
      ctx,
    );
    expect(tell[0]?.sound).toBe('rootSnap');
    expect(tell.every((c) => c.place === 'world' && c.x === 2400)).toBe(true);
    const trickles = tell.filter((c) => c.sound === 'trickle');
    expect(trickles.length).toBeGreaterThan(2);
    expect(Math.max(...trickles.map((c) => c.delay))).toBeLessThan(64 / 60);
    const land = routeCanopy(
      ev({ type: 'rockfall', id: 'r', phase: 'land', x: 2400, y: 1344, w: 96, tell: 64 }),
      0,
      s,
      ctx,
    );
    expect(land[0]?.sound).toBe('rockLand');
    const front = (gap: number) =>
      canopyLayers(
        snap(10, { escape: { on: 1, cp: 1, of: 4, front: 1100, gap, rise: 0.3, x0: 0, x1: 3000 } }),
        { x: 1000, y: 800, zoom: 1 },
        0,
        ctx,
      );
    expect(front(200).collapse).toBeGreaterThan(front(800).collapse);
    expect(front(200).collapseHz).toBeGreaterThan(front(800).collapseHz);
    expect(canopyLayers(snap(10), { x: 0, y: 0, zoom: 1 }, 0, ctx).collapse).toBe(0);
  });
});

describe('the chase r14', () => {
  it('a fall and a return to the hook: the phrase goes on where it was, the alarm while she drifts', () => {
    const sc = new Score({ ...ctx, scene: { ...scene, id: 'cn-gap' } });
    const chase = (phase: string) => ev({ type: 'fireflyChase', id: 'f', phase, x: 0, y: 0 });
    const kindle = ev({ type: 'fireflyKindle', id: 'f', lure: 'h', x: 0, y: 0 });
    const bar = AUDIO.score.chaseBeat * 4;
    const r = run(
      sc,
      0,
      1200,
      (f) => ({ room: 'cn-gap', chase: { beat: 2, lead: 300, hold: f >= 400 && f < 400 + 150 ? 150 : 0 } }),
      { 10: [chase('start')], 100: [kindle], 200: [kindle], 400: [chase('back')] },
    );
    expect(r.cuts.filter((f) => f >= 390)).toEqual([]);
    expect(r.pieces.slice(20).every((p) => p === 'chase')).toBe(true);
    // While she drifts at the hook: no pulse (the alarm and the chord alone); after, the pulse again.
    const barAt = (f0: number) => r.cues.filter((c) => c.frame === f0 && c.bus === 'score');
    const held = 10 + bar * Math.ceil((400 - 10) / bar);
    expect(barAt(held).some((c) => c.sound === 'felt')).toBe(false);
    expect(barAt(held).filter((c) => c.sound === 'glass').length).toBe(2);
    const after = 10 + bar * Math.ceil((560 - 10) / bar);
    expect(barAt(after).some((c) => c.sound === 'felt')).toBe(true);
  });

  it('a chase begun again in the same room picks up its phrase and keeps its chord', () => {
    const sc = new Score({ ...ctx, scene: { ...scene, id: 'cn-gap' } });
    const chase = (phase: string) => ev({ type: 'fireflyChase', id: 'f', phase, x: 0, y: 0 });
    const kindle = ev({ type: 'fireflyKindle', id: 'f', lure: 'h', x: 0, y: 0 });
    const room = (f: number) => (f >= 400 && f < 500 ? 'cn-bower' : 'cn-gap');
    const r = run(sc, 0, 900, (f) => ({ room: room(f), chase: { beat: 2, lead: 300 } }), {
      10: [chase('start')],
      100: [kindle],
      200: [kindle],
      600: [chase('start')],
    });
    expect(r.pieces[450]).toBe('silence');
    expect(r.pieces[650]).toBe('chase');
    // The chord of its two kindled hooks is still held.
    expect(r.cues.filter((c) => c.frame === 600 && c.sound === 'glass').length).toBe(2);
    expect(sc.kindles).toBe(2);
  });
});
