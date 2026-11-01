import { describe, expect, it } from 'vitest';
import { CREAK_S, MOTH_CENTS, REAR_S } from '../../src/audio/bake-play';
import { Conductor } from '../../src/audio/conductor';
import type { PlayEvent } from '../../src/audio/route-play';
import {
  type AudioCam,
  type AudioSnap,
  ambient,
  type Cue,
  layers,
  route,
  snapOf,
} from '../../src/audio/router';
import { AUDIO, LAMP_HZ } from '../../src/audio/tuning';
import { parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { carrying, flatScene, newSim, type Sim } from './helpers';

/**
 * The greybox-era sound pass as data (memory/audio.md): what her moves, the blade, the lamps and the
 * creatures route to. Real sim tapes where the sim can stage it, hand-made events where the sim's own
 * tests already stage the moment (the fling, a boss's tell).
 */
const FLOOR = 800;
const CAM: AudioCam = { x: 2000, y: 600, zoom: 1 };

interface Frame {
  events: SimEvent[];
  snap: AudioSnap;
}

function tape(s: Sim, script: string): Frame[] {
  const out: Frame[] = [];
  for (const input of parseInputScript(script)) {
    const events: SimEvent[] = [];
    step(s.state, input, s.tuning, s.scene, events);
    out.push({ events, snap: snapOf(s.state, s.scene, s.tuning) });
  }
  return out;
}

const routed = (frames: Frame[], scene: Scene) =>
  frames.flatMap((f) => f.events.flatMap((e, i) => route(e, i, f.snap, { scene, seed: 1 })));
const sounds = (cues: Cue[]) => cues.map((c) => c.sound);

/** A flat room with a burrback just ahead of her, its back turned, and a wick over the floor to the left. */
const fight: Scene = {
  ...flatScene(),
  enemies: [{ id: 'b', kind: 'burrback', x: 2090, y: FLOOR, facing: 1, hp: 3 }],
  lures: [{ id: 'w', kind: 'wick', x: 1500, y: 640 }],
};

describe('the blade', () => {
  it('a combo is three swishes, the finisher fuller; a blow is a crack and a tick at full level', () => {
    const s = carrying(newSim(fight));
    s.place(2000, FLOOR);
    const f = tape(s, 'A1 .22 A1 .24 A1 .40');
    const cues = routed(f, fight);
    const swish = cues.filter((c) => c.sound.startsWith('slash'));
    expect(sounds(swish)).toEqual(['slash1', 'slash2', 'slash3']);
    expect(swish[2]?.db).toBeGreaterThan(swish[0]?.db ?? 0);
    const hits = f.flatMap((x) => x.events).filter((e) => e.type === 'slashHit');
    expect(hits.length).toBeGreaterThan(0);
    const crack = cues.filter((c) => c.sound === 'hitCrack');
    const tick = cues.filter((c) => c.sound === 'hitTick');
    expect(crack).toHaveLength(hits.length);
    expect(tick).toHaveLength(hits.length);
    // The blade's sounds are on the combat bus and never fade with the camera's distance.
    for (const c of [...crack, ...tick]) {
      expect(c.bus).toBe('combat');
      expect(c.place).toBe('hero');
    }
    // A blow is the loudest thing she does; the swish is quieter than what it hits.
    expect(crack[0]?.db ?? -99).toBeGreaterThan(swish[0]?.db ?? 0);
  });

  it('the finisher ticks a fourth lower than the cuts, and a heavy creature lower still', () => {
    const snap = tape(newSim(fight), '.1')[0]?.snap as AudioSnap;
    const hit = (stepN: number, power: number, weight?: 'light' | 'medium' | 'heavy'): Cue | undefined =>
      route(
        {
          type: 'slashHit',
          x: 2100,
          y: 760,
          dir: 'fwd',
          facing: 1,
          target: { kind: 'burrback', id: 'b' },
          px: 2020,
          py: 760,
          pogo: false,
          hitstop: 4,
          step: stepN,
          power,
          knockback: 6,
          weight,
        } as PlayEvent,
        0,
        snap,
        { scene: fight, seed: 1 },
      ).find((c) => c.sound === 'hitTick');
    expect((hit(3, 2)?.cents ?? 0) + 200).toBeLessThan(hit(1, 1)?.cents ?? 0);
    expect((hit(1, 1, 'heavy')?.cents ?? 0) + 150).toBeLessThan(hit(1, 1, 'medium')?.cents ?? 0);
    // (Canopy r22: the finisher lands a second, lower body a beat late; a cut does not.)
    const cracks = (stepN: number, power: number): Cue[] =>
      route(
        {
          type: 'slashHit',
          x: 2100,
          y: 760,
          dir: 'fwd',
          facing: 1,
          target: { kind: 'burrback', id: 'b' },
          px: 2020,
          py: 760,
          pogo: false,
          hitstop: 4,
          step: stepN,
          power,
          knockback: 6,
          weight: 'medium',
        } as PlayEvent,
        0,
        snap,
        { scene: fight, seed: 1 },
      ).filter((c) => c.sound === 'hitCrack');
    expect(cracks(1, 1)).toHaveLength(1);
    const fin = cracks(3, 2);
    expect(fin).toHaveLength(2);
    expect(Math.min(...fin.map((c) => c.cents ?? 0))).toBeLessThan(-500);
  });

  it('a kill is a crunch with a tail after the hitstop; a glance off a braced shell is a clang; her hurt muffles the mix', () => {
    const snap = tape(newSim(fight), '.1')[0]?.snap as AudioSnap;
    const ctx = { scene: fight, seed: 1 };
    const die = route(
      {
        type: 'enemyDie',
        id: 'b',
        kind: 'burrback',
        x: 2100,
        y: 760,
        facing: 1,
        slash: 'fwd',
        dir: 1,
        power: 1,
        hpMax: 3,
        knockback: 6,
        hitstop: 7,
        frames: 30,
        value: 0,
        glintFrames: 0,
        stagger: 0,
      },
      0,
      snap,
      ctx,
    );
    expect(sounds(die)).toEqual(['crunch', 'killTail', 'killWet']);
    expect(die[1]?.delay).toBeGreaterThanOrEqual(7 / 60);
    const block = route(
      {
        type: 'enemyBlock',
        id: 'b',
        kind: 'burrback',
        x: 2100,
        y: 760,
        hitX: 2080,
        hitY: 750,
        facing: -1,
        slash: 'fwd',
        dir: 1,
        step: 1,
        hitstop: 4,
        recoil: 6,
        mode: 'windup',
        frames: 10,
      },
      0,
      snap,
      ctx,
    );
    // (The Canopy r19: a shield struck, a clank and its ring.)
    expect(sounds(block)).toEqual(['clang', 'clang']);
    const hurt = { ...snap, hero: { ...snap.hero, stagger: 12 } };
    expect(layers(hurt, CAM, 0, ctx).muffleHz).toBeLessThan(1000);
    expect(layers(snap, CAM, 0, ctx).muffleHz).toBeGreaterThan(15000);
  });
});

describe('the lamps', () => {
  const ctx = { scene: fight, seed: 1 };
  const snap = (): AudioSnap => tape(newSim(fight), '.1')[0]?.snap as AudioSnap;

  it('a burning wick hums near her at its out-of-tune pitch, louder and brighter the nearer; none far off', () => {
    const s = newSim(fight);
    s.place(1500, FLOOR);
    const near = layers(tape(s, '.1')[0]?.snap as AudioSnap, CAM, 0, ctx);
    s.place(3900, FLOOR);
    const far = layers(tape(s, '.1')[0]?.snap as AudioSnap, CAM, 0, ctx);
    expect(near.lamp).toBeGreaterThan(0);
    expect(near.lampHz).toBeCloseTo(LAMP_HZ.wick, 3);
    // 38 cents sharp of the forest's A4.
    expect(1200 * Math.log2(LAMP_HZ.wick / 440.49)).toBeCloseTo(38, 0);
    expect(far.lamp).toBe(0);
    expect(near.lampLp).toBeGreaterThan(far.lampLp);
    // Nearing a lamp draws the world back a little.
    expect(near.duck).toBeLessThan(far.duck);
  });

  it('the fling: a held swell while she aims (the world ducked), a launch, the flame falling silent, then the moths', () => {
    const base = snap();
    const aiming = { ...base, hero: { ...base.hero, fling: 0, aim: 0.5 } };
    const L = layers(aiming, CAM, 0, ctx);
    expect(L.aim).toBeGreaterThan(0);
    expect(L.duck).toBeLessThan(0.5);
    expect(L.lamp).toBeGreaterThan(layers(base, CAM, 0, ctx).lamp);
    const r = (e: PlayEvent) => route(e, 0, base, ctx);
    expect(sounds(r({ type: 'flingStart', id: 'w', x: 1500, y: 640, frames: 36 }))).toEqual(['slowIn']);
    expect(sounds(r({ type: 'fling', id: 'w', x: 1500, y: 640, vx: 15, vy: -5, aimX: 1, aimY: 0 }))).toEqual([
      'launch',
      'wing',
    ]);
    expect(sounds(r({ type: 'lureEmber', id: 'w', x: 1500, y: 640 }))).toEqual(['snuff']);
    const snuff = {
      type: 'lureSnuff' as const,
      id: 'w',
      kind: 'wick' as const,
      x: 1500,
      y: 640,
      dir: 'fwd' as const,
      moths: 4,
      freed: 4,
      snuffed: 1,
      heal: 1,
    };
    // Flung from: only the moths (its tone fell at the ember). Cut out: the snuff, then the moths.
    const flung = r({ ...snuff, fling: true } as PlayEvent);
    expect(sounds(flung)).not.toContain('snuff');
    const chimes = flung.filter((c) => c.sound === 'glintNote');
    expect(chimes).toHaveLength(4);
    // Rising up the forest's chord, in tune.
    chimes.forEach((c, k) => {
      expect(Math.abs(c.cents - (MOTH_CENTS[k] ?? 0))).toBeLessThan(5);
    });
    expect(sounds(flung)).toContain('mothRush');
    expect(sounds(r(snuff))[0]).toBe('snuff');
  });

  it("a chain's flames going out on one landing climb the chord as one phrase, with one rush of wings", () => {
    const base = snap();
    const snuff = (id: string): SimEvent =>
      ({
        type: 'lureSnuff',
        id,
        kind: 'wick',
        x: 1500,
        y: 640,
        dir: 'fwd',
        moths: 5,
        freed: 5,
        snuffed: 1,
        heal: 1,
        fling: true,
      }) as SimEvent;
    const events = [snuff('a'), snuff('b'), snuff('c')];
    const c = new Conductor({ scene: fight, seed: 1 });
    const cues = c.step(events, base, CAM, 0, false);
    const chimes = cues.filter((q) => q.sound === 'glintNote');
    expect(chimes).toHaveLength(MOTH_CENTS.length);
    const order = [...chimes].sort((a, b) => a.delay - b.delay);
    for (let k = 1; k < order.length; k++)
      expect(order[k]?.cents ?? 0).toBeGreaterThan(order[k - 1]?.cents ?? 0);
    expect(cues.filter((q) => q.sound === 'mothRush')).toHaveLength(1);
  });

  it('a lantern snuffs at its own pitch, a fifth under a wick', () => {
    const lantern: Scene = { ...fight, lures: [{ id: 'L', kind: 'lantern', x: 1500, y: 600 }] };
    const e: PlayEvent = { type: 'lureEmber', id: 'L', x: 1500, y: 600 };
    const c = route(e, 0, snap(), { scene: lantern, seed: 1 })[0];
    expect(c?.cents).toBeCloseTo(-702, 0);
  });
});

describe('the creatures', () => {
  const ctx = { scene: fight, seed: 1 };
  const snap = (): AudioSnap => tape(newSim(fight), '.1')[0]?.snap as AudioSnap;

  it("a beetle's brace creaks as long as it lasts: the variant nearest the tell", () => {
    const s = carrying(
      newSim({ ...fight, enemies: [{ id: 'b', kind: 'burrback', x: 2200, y: FLOOR, facing: -1 }] }),
    );
    s.place(2000, FLOOR);
    const f = tape(s, '.120');
    const wind = f.flatMap((x) => x.events).find((e) => e.type === 'enemyWindup');
    expect(wind).toBeDefined();
    const creak = routed(f, fight).find((c) => c.sound === 'creak');
    expect(creak?.bus).toBe('creatures');
    if (wind?.type === 'enemyWindup') {
      const s0 = wind.frames / 60;
      const best = CREAK_S.reduce(
        (b, v, k) => (Math.abs(v - s0) < Math.abs((CREAK_S[b] ?? 0) - s0) ? k : b),
        0,
      );
      expect(creak?.variant).toBe(best);
    }
  });

  it('a dangler tells with its silk and drops when the tell ends; the old burrback rears and slams', () => {
    const r = (e: PlayEvent) => route(e, 0, snap(), ctx);
    const d = r({
      type: 'enemyWindup',
      id: 'd',
      kind: 'dangler',
      x: 2000,
      y: 400,
      dir: 1,
      frames: 40,
      px: 300,
      speed: 0,
    });
    expect(sounds(d)).toEqual(['silkTense', 'drop']);
    expect(d[1]?.delay).toBeCloseTo(40 / 60, 5);
    const rear = r({ type: 'enemyRear', id: 'o', kind: 'oldBurrback', x: 2000, y: 700, frames: 75 });
    expect(rear[0]?.variant).toBe(REAR_S.indexOf(1.25));
    const slam = r({
      type: 'enemySlam',
      id: 'o',
      kind: 'oldBurrback',
      x: 2000,
      y: 800,
      big: true,
      shook: false,
      px: 600,
    });
    expect(sounds(slam)).toEqual(['slam']);
    expect(slam[0]?.db).toBeGreaterThan(AUDIO.creatures.slamDb);
    const dive = r({
      type: 'enemyDive',
      id: 'h',
      kind: 'hawker',
      x: 2000,
      y: 400,
      tx: 2100,
      ty: 760,
      dir: 1,
      frames: 30,
      dive: 1,
    });
    expect(sounds(dive)).toEqual(['dive']);
  });

  it('ants skitter now and then while they walk near her, never from far off', () => {
    const base = snap();
    const ant = (x: number) => ({
      ...base,
      creatures: [{ kind: 'carrier', x, y: 780, gift: 0, of: 1, mode: 'walk' }],
    });
    const count = (x: number) =>
      Array.from({ length: 600 }, (_, f) => ambient({ ...ant(x), frame: f }, CAM, ctx))
        .flat()
        .filter((c) => c.sound === 'skitter').length;
    expect(count(2050)).toBeGreaterThan(5);
    expect(count(2050)).toBeLessThan(60);
    expect(count(3500)).toBe(0);
  });
});

describe('the night-wood bed', () => {
  it('each room has its own: the roots are hushed and still, the canopy airy; the owl calls only where it is open', () => {
    const s = newSim(flatScene());
    const base = tape(s, '.1')[0]?.snap as AudioSnap;
    const bed = (room: string) => layers({ ...base, room }, CAM, 3, { scene: flatScene(), seed: 1 });
    expect(bed('wood-rootroad').roar).toBeLessThan(bed('wood-canopy').roar / 3);
    expect(bed('wood-rootroad').hissL).toBeLessThan(bed('wood-canopy').hissL / 3);
    const calls = (room: string) =>
      Array.from({ length: 60 * 120 }, (_, f) =>
        ambient({ ...base, room, frame: f }, CAM, { scene: flatScene(), seed: 1 }),
      )
        .flat()
        .filter((c) => c.sound === 'voice').length;
    expect(calls('wood-wicks')).toBeGreaterThan(0);
    expect(calls('wood-well')).toBe(0);
  });

  it('a story hold ducks the bed; one tape always routes to the same cues', () => {
    const base = tape(newSim(fight), '.1')[0]?.snap as AudioSnap;
    expect(layers({ ...base, hold: true }, CAM, 0, { scene: fight, seed: 1 }).duck).toBeLessThan(0.5);
    const run = () => {
      const s = carrying(newSim(fight));
      s.place(2000, FLOOR);
      const c = new Conductor({ scene: fight, seed: 1 });
      return tape(s, 'A1 .22 A1 .24 A1 .30 R30 J20 .40').flatMap((x) =>
        c.step(x.events, x.snap, CAM, 0, false),
      );
    };
    expect(run()).toEqual(run());
  });
});
