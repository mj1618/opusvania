import { describe, expect, it } from 'vitest';
import { INSTR, midiOf, noteOf, type PitchedId } from '../../src/audio/bake-music';
import { canopyAmbient, canopyLayers, routeCanopy } from '../../src/audio/route-canopy';
import type { PlayEvent } from '../../src/audio/route-play';
import { type AudioSnap, type Cue, layers } from '../../src/audio/router';
import { MOTIF, nm, Score } from '../../src/audio/score';
import { AUDIO, bedOf } from '../../src/audio/tuning';
import { flatScene } from './helpers';

/**
 * The score (memory/audio.md "The score"; canopy-moments.md §5): silence by default; the title's motif held on E;
 * an ambush's regular pulse and its clearing; the boss's phases, its last hit's total silence and its breath; the
 * vista's theme resolving home and ending open. Driven by hand-made snaps and events (the Keeper's names loosely).
 */
const scene = { ...flatScene(), id: 'cn-hub' };
const ctx = { scene, seed: 1 };

function snap(frame: number, over: Partial<AudioSnap> = {}): AudioSnap {
  return {
    frame,
    room: 'cn-hub',
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

/** Runs frames [from, to) with events at given frames; returns every cue and each frame's piece. */
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

/** The MIDI note a pitched cue sounds. */
const midi = (c: Cue) => midiOf(c.sound as PitchedId, c.variant) + c.cents / 100;
const notes = (cues: Cue[], sound: string) =>
  cues.filter((c) => c.sound === sound).sort((a, b) => a.frame + a.delay * 60 - (b.frame + b.delay * 60));

describe('the instruments', () => {
  it('every note is played from a baked one at most half a step away, in tune', () => {
    for (const id of Object.keys(INSTR) as PitchedId[]) {
      const I = INSTR[id];
      for (let m = I.lo; m <= I.hi; m++) {
        const n = noteOf(id, m);
        expect(Math.abs(n.cents), `${id} ${m}`).toBeLessThanOrEqual((I.step / 2) * 100);
        expect(midiOf(id, n.variant) + n.cents / 100).toBeCloseTo(m, 6);
      }
    }
    expect(nm('A4')).toBe(69);
    expect(nm('Bb1')).toBe(34);
    expect(nm('C#5')).toBe(73);
  });
});

describe('the score', () => {
  it('is silent by default: a room walked makes no music', () => {
    const s = new Score(ctx);
    const r = run(s, 0, 3000);
    expect(r.cues).toEqual([]);
    expect(new Set(r.pieces)).toEqual(new Set(['silence']));
  });

  it("the hatch's title: Wing's motif once on plucked string over the forest's chord in glass, held on E", () => {
    const s = new Score(ctx);
    const r = run(s, 0, 1500, () => ({ room: 'cn-hatch' }), {
      100: [{ type: 'hatch', x: 0, y: 0, cx: 0, cy: 0, auto: false, frames: 100 }],
    });
    const harp = notes(r.cues, 'harp').map(midi);
    expect(harp).toEqual(MOTIF);
    expect(harp[harp.length - 1]).toBe(nm('E5'));
    const glass = notes(r.cues, 'glass').map(midi);
    expect(glass).toEqual(['D3', 'A3', 'E4', 'B4'].map(nm));
    // It waits out the breakout's breath of silence and the river's rush first.
    expect(Math.min(...r.cues.map((c) => c.frame))).toBeGreaterThanOrEqual(220);
  });

  it("an ambush: a regular pulse on its first beat, more on a later one, the forest's chord when it is cleared", () => {
    const s = new Score(ctx);
    const r = run(s, 0, 2400, (f) => ({ arena: f < 200 ? 0 : f < 1100 ? 1 : f < 1800 ? 2 : 0 }));
    expect(r.pieces[250]).toBe('tension1');
    expect(r.pieces[1200]).toBe('tension2');
    expect(r.pieces.slice(1800)).toContain('clear');
    const ticks = notes(
      r.cues.filter((c) => c.frame < 1100),
      'colLegno',
    );
    // Exact sixteenths: regular is the enemy.
    const t = (c: Cue) => c.frame / 60 + c.delay;
    const gaps = new Set(ticks.slice(1, 40).map((c, k) => Math.round((t(c) - t(ticks[k] as Cue)) * 6000)));
    expect(gaps).toEqual(new Set([Math.round((AUDIO.score.beat / 4 / 60) * 6000)]));
    expect(notes(r.cues, 'trem').length).toBeGreaterThan(4);
  });

  it("the boss: its wake, its phases on the swing's bar, the last hit's ring, total silence, then its breath", () => {
    const s = new Score({ ...ctx, scene: { ...scene, id: 'cn-den' } });
    const fight = (f: number): Partial<AudioSnap> => ({
      room: 'cn-den',
      fight: {
        kind: 'keeper',
        stage: f < 100 ? 'sleep' : f < 3000 ? 'fight' : 'down',
        phase: f < 1200 ? 1 : f < 2200 ? 2 : 3,
        x: 1500,
        y: 900,
      },
      lit: f % 400 < 200 ? 1 : 0,
    });
    const swing = {
      type: 'cageSwing',
      lure: 'great',
      x: 1500,
      y: 700,
      period: 240,
      reach: 700,
    } as unknown as PlayEvent;
    const r = run(s, 0, 3400, fight, {
      100: [{ type: 'bossCue', id: 'keeper', x: 0, y: 0, set: 'intro', cue: 'intro', frame: 0 } as PlayEvent],
      1200: [swing],
    });
    expect(r.pieces[150]).toBe('wake');
    expect(r.pieces[800]).toBe('boss1');
    expect(r.pieces[1700]).toBe('boss2');
    expect(r.pieces[2700]).toBe('boss3');
    expect(r.pieces[3100]).toBe('silence');
    expect(r.cuts).toContain(3000);
    // Nothing of the score after the last hit; the breath comes when the silence ends.
    expect(r.cues.filter((c) => c.bus === 'score' && c.frame >= 3000)).toEqual([]);
    const breath = r.cues.find((c) => c.sound === 'settle');
    expect(breath?.frame).toBe(3000 + AUDIO.score.lastRingFrames + AUDIO.score.silenceFrames);
    // The hush: everything at 0 inside the silence, back to 1 after; in P2 the mix muffles in the cage's shadow.
    const L = (f: number, lit: number, phase = 3) =>
      s.shape(
        layers(snap(f, { room: 'cn-den', lit }), { x: 0, y: 0, zoom: 1 }, 0, ctx),
        snap(f, { ...fight(f), lit, ...(phase ? {} : {}) }),
      );
    // (Round 13: it tails into the silence over `tailFrames`, not a hard cut, and comes back over `returnFrames`.)
    const S = AUDIO.score;
    const hit = 3000 + S.lastRingFrames;
    expect(L(hit - 1, 1).hush).toBe(1);
    expect(L(hit + S.tailFrames / 4, 1).hush).toBeGreaterThan(0.2);
    expect(L(hit + S.tailFrames / 4, 1).hush).toBeLessThan(1);
    expect(L(hit + S.tailFrames + 5, 1).hush).toBe(0);
    expect(L(hit + S.silenceFrames + S.returnFrames / 2, 1).hush).toBeLessThan(1);
    expect(L(hit + S.silenceFrames + S.returnFrames + 5, 1).hush).toBe(1);
  });

  it("in the swing (P2) the mix is bright in the cage's light and muffled in its shadow", () => {
    const s = new Score(ctx);
    s.step(
      [{ type: 'cageSwing', lure: 'g', x: 0, y: 0, period: 240, reach: 700 } as unknown as PlayEvent],
      snap(0),
    );
    const at = (lit: number, seen = 0) => {
      const sn = snap(1, {
        room: 'cn-den',
        lit,
        seen,
        fight: { kind: 'keeper', stage: 'fight', phase: 2, x: 0, y: 0 },
      });
      return s.shape(layers(sn, { x: 0, y: 0, zoom: 1 }, 0, ctx), sn);
    };
    // Seen: bright and present, the score open; in the dark: the world and the score closed in.
    expect(at(1, 1).muffleHz).toBeGreaterThan(15000);
    expect(at(1, 1).scoreHz).toBeGreaterThan(15000);
    expect(at(0).muffleHz).toBeLessThan(1500);
    expect(at(0).scoreHz).toBeLessThan(2500);
    // In its light but not yet seen: between.
    expect(at(1).muffleHz).toBeGreaterThan(at(0).muffleHz);
    expect(at(1).muffleHz).toBeLessThan(at(1, 1).muffleHz);
  });

  it("the Keeper's P2 is a three-swing phrase: her motif sinking A D E F | E Eb | D C#", () => {
    const s = new Score({ ...ctx, scene: { ...scene, id: 'cn-den' } });
    const fight = () => ({
      room: 'cn-den',
      fight: { kind: 'keeper', stage: 'fight' as const, phase: 2, x: 0, y: 0 },
    });
    const swing = {
      type: 'cageSwing',
      lure: 'g',
      x: 0,
      y: 0,
      period: 252,
      reach: 560,
    } as unknown as PlayEvent;
    const r = run(s, 0, 252 * 3 + 10, fight, { 0: [swing] });
    const mel = notes(r.cues, 'strings')
      .filter((c) => c.db > AUDIO.score.db.strings - 2)
      .map((c) => Math.round(midi(c)));
    expect(mel).toEqual([69, 74, 76, 77, 76, 75, 74, 73]);
  });

  it("the Keeper's sight: a stab on the score when its light finds her", () => {
    const s = new Score({ ...ctx, scene: { ...scene, id: 'cn-den' } });
    const fight = () => ({
      room: 'cn-den',
      fight: { kind: 'keeper', stage: 'fight' as const, phase: 2, x: 0, y: 0 },
    });
    const sight = (lit: boolean) =>
      ({ type: 'keeperSight', id: 'k', x: 0, y: 0, lit }) as unknown as PlayEvent;
    const r = run(s, 0, 400, fight, { 200: [sight(true)], 300: [sight(false)] });
    expect(r.cues.some((c) => c.frame === 200 && c.sound === 'drum')).toBe(true);
    expect(r.cues.some((c) => c.frame === 300)).toBe(false);
  });

  it('an ability found always gets its moment, even right after a glade', () => {
    const s = new Score(ctx);
    const rest = { type: 'patchRest', x: 0, y: 0 } as unknown as PlayEvent;
    const grant = { type: 'gladeGrant', id: 'g', ability: 'glide', x: 0, y: 0 } as unknown as PlayEvent;
    const r = run(s, 0, 60 * 30, () => ({}), { 10: [rest], [60 * 19]: [grant] });
    expect(r.pieces[200]).toBe('glade');
    expect(r.pieces[60 * 19 + 40]).toBe('grant');
  });

  it("the chase: the call's ostinato, each kindle a note up its sharp chord, and at the nest it stops dead", () => {
    const s = new Score({ ...ctx, scene: { ...scene, id: 'cn-gap' } });
    const ev = (phase: string) =>
      ({ type: 'fireflyChase', id: 'f', phase, x: 0, y: 0 }) as unknown as PlayEvent;
    const kindle = { type: 'fireflyKindle', id: 'f', lure: 'h', x: 0, y: 0 } as unknown as PlayEvent;
    const r = run(s, 0, 900, () => ({ room: 'cn-gap', chase: { beat: 2, lead: 400 } }), {
      10: [ev('start')],
      200: [kindle],
      300: [kindle],
      600: [ev('nest')],
    });
    expect(r.pieces[100]).toBe('chase');
    expect(r.pieces[700]).toBe('silence');
    expect(r.cuts).toContain(600);
    const k = r.cues.filter((c) => c.sound === 'celesta' && (c.frame === 200 || c.frame === 300));
    // Out of tune: the lamps' 38 cents sharp of D5 and A5.
    expect(k.map((c) => midi(c))).toEqual([expect.closeTo(74.38, 5), expect.closeTo(81.38, 5)]);
    expect(r.cues.filter((c) => c.bus === 'score' && c.frame > 600)).toEqual([]);
  });

  it("the duet on the kin's sit: her motif and its answer, ending on her E over its D", () => {
    const s = new Score({ ...ctx, scene: { ...scene, id: 'cn-crown' } });
    const sit = { type: 'kinSit', id: 'kin', x: 0, y: 0 } as unknown as PlayEvent;
    const r = run(s, 0, 60 * 30, () => ({ room: 'cn-crown' }), { 10: [sit] });
    expect(r.pieces[100]).toBe('duet');
    const harp = notes(r.cues, 'harp').map((c) => Math.round(midi(c)));
    expect(harp.slice(0, 5)).toEqual(MOTIF);
    expect(harp.at(-1)).toBe(nm('E5'));
    const felt = notes(r.cues, 'felt').filter((c) => c.db > AUDIO.score.db.felt - 10);
    expect(Math.round(midi(felt.at(-1) as Cue))).toBe(nm('D5'));
    // The bed drops under it.
    const s2 = new Score({ ...ctx, scene: { ...scene, id: 'cn-crown' } });
    run(s2, 0, 400, () => ({ room: 'cn-crown' }), { 10: [sit] });
    const sn = snap(400, { room: 'cn-crown' });
    expect(s2.shape(layers(sn, { x: 0, y: 0, zoom: 1 }, 0, ctx), sn).duck).toBeLessThan(0.2);
  });

  it('the vista: the theme whole, the motif going home to D at last, then A over D, open', () => {
    const s = new Score({ ...ctx, scene: { ...scene, id: 'cn-out' } });
    const flag = { type: 'flagSet', flag: 'cn-out-vista', by: 'out-vista', x: 0, y: 0 } as PlayEvent;
    const r = run(s, 0, 60 * 90, () => ({ room: 'cn-out' }), { 10: [flag] });
    expect(r.pieces[20]).toBe('vista');
    const harp = notes(r.cues, 'harp').map(midi);
    // Its first phrase is her motif; the last melody note is home.
    expect(harp.slice(0, 5)).toEqual(MOTIF);
    const melody = harp.filter((m) => m >= nm('A4'));
    expect(melody).toContain(nm('D5'));
    const bar = AUDIO.score.beat * 4;
    const lastBar = r.cues.filter((c) => c.bus === 'score' && c.frame === 10 + 18 * bar);
    expect(lastBar.filter((c) => c.sound === 'glass').map(midi)).toEqual(['D3', 'A3', 'E4'].map(nm));
    expect(
      lastBar.find((c) => c.sound === 'celesta') && midi(lastBar.find((c) => c.sound === 'celesta') as Cue),
    ).toBe(nm('A5'));
    // Played once; it holds through the glide into the next room.
    expect(r.pieces[60 * 80]).toBe('silence');
  });

  it('is deterministic: one tape, one score', () => {
    const go = () =>
      run(new Score(ctx), 0, 3000, (f) => ({ arena: f > 300 && f < 2000 ? 1 : 0 })).cues.map(
        (c) =>
          `${c.sound}:${c.frame}:${c.variant}:${c.cents.toFixed(2)}:${c.db.toFixed(2)}:${c.delay.toFixed(4)}`,
      );
    expect(go()).toEqual(go());
  });
});

describe("the Canopy's world", () => {
  it('each room has its bed: airy in the hatch, crown and gap, hushed in the well and the den, the earth only underground', () => {
    expect(bedOf('cn-crown').wind).toBeGreaterThan(bedOf('cn-well').wind + 10);
    expect(bedOf('cn-den').earth).toBeDefined();
    expect(bedOf('cn-crown').earth).toBeUndefined();
    expect(bedOf('cn-well').echo).toBeGreaterThan(0);
    expect(bedOf('cn-den').voice).toBe(false);
  });

  it("the firefly calls three short and one long, in the false lights' glass; it blinks on its own clock as it flies", () => {
    const sn = snap(0, { room: 'cn-gap' });
    const c = routeCanopy(
      { type: 'fireflyStart', id: 'f', x: 10, y: 10, frames: 300 } as PlayEvent,
      0,
      sn,
      ctx,
    );
    expect(c.map((x) => x.variant)).toEqual([0, 0, 0, 2]);
    expect(c.every((x) => x.sound === 'fireflyBlink')).toBe(true);
    const gaps = c.slice(1).map((x, k) => x.delay - (c[k] as Cue).delay);
    expect((gaps[2] as number) > (gaps[0] as number)).toBe(true);
    const blinks = Array.from({ length: 240 }, (_, f) =>
      canopyAmbient(
        snap(f, { room: 'cn-gap', firefly: { x: 0, y: 0 } }),
        { x: 0, y: 0, zoom: 1 },
        ctx,
      ).filter((x) => x.sound === 'fireflyBlink'),
    ).flat();
    expect(blinks.length).toBe(240 / AUDIO.canopy.blinkEvery);
  });

  it('the swarm is heard over the hatch before she breaks out, louder with each press', () => {
    const at = (frames: number, presses: number) =>
      canopyLayers(
        snap(frames, { room: 'cn-hatch', hatch: { frames, presses, done: false } }),
        { x: 0, y: 0, zoom: 1 },
        0,
        ctx,
      ).river;
    expect(at(0, 0)).toBe(0);
    expect(at(200, 0)).toBeGreaterThan(0);
    expect(at(200, 2)).toBeGreaterThan(at(200, 0));
  });
});
