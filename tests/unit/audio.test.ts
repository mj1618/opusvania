import { describe, expect, it } from 'vitest';
import { bakeSound, SOUNDS, type SoundId } from '../../src/audio/bake';
import { BREATH_FRAMES, hushPhase, isKnock, PULSE_FRAMES } from '../../src/audio/clock';
import { Conductor } from '../../src/audio/conductor';
import { biquad, peak, rms } from '../../src/audio/dsp';
import { type ProView, proCues, proMix } from '../../src/audio/prologue';
import {
  type AudioCam,
  type AudioSnap,
  ambient,
  type Cue,
  layers,
  materialAt,
  route,
  snapOf,
  voiceFrame,
} from '../../src/audio/router';
import { AUDIO } from '../../src/audio/tuning';
import { parseInputScript } from '../../src/input/script';
import { BEATS, HOLLOW } from '../../src/render/prologue/script';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { carrying, flatScene, newSim, type Sim } from './helpers';

/**
 * The sound as data: the router's mapping over real sim tapes (what makes a sound and what must
 * not), its determinism, the Hush's clock, and the baked one-shots (clean edges, no hiss above
 * 9 kHz, the same samples from the same seed). No AudioContext anywhere: memory/audio.md.
 */
const CTX = { scene: GROVE, seed: 1 };
const CAM: AudioCam = { x: 1120, y: 1000, zoom: 1 };

interface Frame {
  events: SimEvent[];
  snap: AudioSnap;
}

/** Runs a script on the sim and keeps each step's events and the state after it. */
function tape(s: Sim, script: string): Frame[] {
  const out: Frame[] = [];
  for (const input of parseInputScript(script)) {
    const events: SimEvent[] = [];
    step(s.state, input, s.tuning, s.scene, events);
    out.push({ events, snap: snapOf(s.state, s.scene, s.tuning.goal.channelFrames) });
  }
  return out;
}

/** The cues a tape's events route to (no ambience). */
function routed(frames: Frame[]): Cue[] {
  return frames.flatMap((f) => f.events.flatMap((e, i) => route(e, i, f.snap, CTX)));
}

const sounds = (cues: Cue[]) => cues.map((c) => c.sound);

describe('the Hush clock', () => {
  it('beats every 4.2 s and breathes every 18 s, swelling at the knock', () => {
    expect(PULSE_FRAMES).toBe(252);
    expect(BREATH_FRAMES).toBe(1080);
    expect(hushPhase(252).swell).toBeCloseTo(1, 6);
    expect(hushPhase(126).swell).toBeCloseTo(0, 6);
    expect(isKnock(252) && isKnock(504) && !isKnock(253) && !isKnock(0)).toBe(true);
    expect(hushPhase(270).air).toBeCloseTo(1, 3);
    expect(hushPhase(0).vowel).toBe(0);
    expect(hushPhase(540).vowel).toBeCloseTo(1, 6);
  });
});

describe('the router over real tapes', () => {
  it('a ground jump is one wingbeat; footsteps on moss are silent; nothing is pitched', () => {
    const s = newSim(flatScene());
    const f = tape(s, '.10 R40 R+J20 R30 .30');
    const cues = routed(f);
    expect(f.some((x) => x.events.some((e) => e.type === 'step'))).toBe(true);
    expect(sounds(cues).filter((c) => c === 'wing')).toHaveLength(1);
    expect(sounds(cues)).not.toContain('tick');
    // Her movement sounds are all air, felt and dust.
    for (const c of cues) expect(['wing', 'dust']).toContain(c.sound);
    expect(cues.every((c) => c.bus === 'hero')).toBe(true);
  });

  it('the somersault is two beats and a whoosh that crosses her; a long drop lands hard', () => {
    const s = newSim(flatScene());
    const cues = routed(tape(s, '.10 J22 .2 J18 .70'));
    // The jump's beat, then the somersault's two and the whoosh.
    expect(sounds(cues)).toEqual(['wing', 'wing', 'wing', 'whoosh', 'dust', 'thump']);
    const [, , second, whoosh] = cues;
    expect(second?.delay).toBeGreaterThanOrEqual(AUDIO.hero.wingGapS);
    expect(Math.sign(whoosh?.pan ?? 0)).toBe(-Math.sign(whoosh?.panTo ?? 0));
  });

  it('the wings catch a fall with a whumpf, but open silently at the top of an arc', () => {
    const apex = routed(tape(newSim(flatScene()), '.10 J22 .2 J60 .60'));
    expect(sounds(apex)).not.toContain('catch');
    const fall = routed(tape(newSim(flatScene()), '.10 J22 .2 J10 .12 J40 .60'));
    const c = fall.find((x) => x.sound === 'catch');
    expect(c).toBeDefined();
    expect(c?.db).toBeGreaterThan(AUDIO.hero.catchDb - 12);
  });

  it('a dash waits out its wind-up frames before the gust', () => {
    const cues = routed(tape(newSim(flatScene()), '.10 R10 R+X3 R20'));
    const d = cues.find((c) => c.sound === 'dash');
    expect(d?.delay).toBeGreaterThan(0);
  });

  it('slashes, glints and turns make no sound yet', () => {
    const f = tape(newSim(), '.10 A1 .20 A1 .20 R60 L5 .20');
    const types = new Set(f.flatMap((x) => x.events.map((e) => e.type)));
    expect(types.has('slash') && types.has('pickup') && types.has('turn')).toBe(true);
    // (The lantern noticing her as she passes is the only sound here.)
    expect(sounds(routed(f)).every((x) => ['wing', 'dust', 'splash', 'lanternNotice'].includes(x))).toBe(
      true,
    );
  });

  it('the stone lantern: notice, refuse, the rubbed channel, then the kindle', () => {
    const s = newSim();
    // Too little light: it notices her and refuses.
    const short = routed(tape(s, '.5 R34 .40'));
    expect(sounds(short)).toContain('lanternNotice');
    expect(sounds(short)).toContain('lanternRefuse');
    // With enough, it is kindled under her (the channel is a layer, not a cue).
    carrying(s, 12);
    const f = tape(s, 'L30 R30 .80');
    const cues = routed(f);
    const k = cues.find((c) => c.sound === 'lanternKindle');
    expect(k?.bus).toBe('lantern');
    const mid = f.find((x) => x.snap.lights.some((l) => l.progress > 0.5 && !l.lit));
    expect(mid).toBeDefined();
    if (mid) expect(layers(mid.snap, CAM, 0, CTX).rub).toBeGreaterThan(0);
  });

  it('is deterministic: one tape, one set of cues', () => {
    const run = () => {
      const f = tape(newSim(), '.30 R40 R+J20 R10 .2 J30 R+X3 R30 .60');
      return f.flatMap((x) => [
        ...x.events.flatMap((e, i) => route(e, i, x.snap, CTX)),
        ...ambient(x.snap, CAM, CTX),
      ]);
    };
    expect(run()).toEqual(run());
  });

  it('knows what she stands on', () => {
    expect(materialAt(GROVE, 1120, 1280)).toBe('moss');
    expect(materialAt(GROVE, 1700, 1408)).toBe('water');
    const trunk = GROVE.solids.find((r) => r.tag === 'trunk');
    if (trunk) expect(materialAt(GROVE, trunk.x + 10, trunk.y)).toBe('wood');
  });
});

describe('the world by itself', () => {
  const frames = 60 * 120;
  const snapAt = (frame: number, base: AudioSnap): AudioSnap => ({ ...base, frame });
  const base = snapOf(newSim().state, GROVE, 30);
  const all = Array.from({ length: frames }, (_, f) => ambient(snapAt(f, base), CAM, CTX)).flat();

  it('drips are rare and irregular, the knock is exact, the far voice is never on the beat', () => {
    const drips = all.filter((c) => ['leaf', 'bark', 'plink'].includes(c.sound));
    expect(drips.length).toBeGreaterThan(120 / AUDIO.forest.dripMeanS / 2);
    expect(drips.length).toBeLessThan((120 / AUDIO.forest.dripMeanS) * 2);
    const gaps = drips.slice(1).map((c, i) => c.frame - (drips[i]?.frame ?? 0));
    expect(new Set(gaps).size).toBeGreaterThan(gaps.length / 2);
    const knocks = all.filter((c) => c.sound === 'knock');
    expect(knocks).toHaveLength(Math.floor((frames - 1) / PULSE_FRAMES));
    expect(knocks[0]?.pan).toBe(-(knocks[1]?.pan ?? 0));
    const calls = all.filter((c) => c.sound === 'voice');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      const off = c.frame % PULSE_FRAMES;
      expect(Math.min(off, PULSE_FRAMES - off)).toBeGreaterThanOrEqual(AUDIO.forest.voiceClearS * 60 - 1);
      expect(voiceFrame(1, c.frame)).toBe(true);
    }
  });

  it('a wave crossing the view is heard crossing; a lit lantern muffles the Hush', () => {
    const hiss = Array.from({ length: 400 }, (_, k) => layers(base, CAM, k / 20, CTX));
    const diff = hiss.filter((l) => Math.abs(l.hissL - l.hissR) > 0.1 * Math.max(l.hissL, l.hissR));
    expect(diff.length).toBeGreaterThan(100);
    const near = { ...base, lights: base.lights.map((l, i) => (i === 0 ? { ...l, lit: true } : l)) };
    const lantern = GROVE.lanterns?.[0];
    if (!lantern) throw new Error('no lantern');
    near.hero = { ...near.hero, x: lantern.x, y: lantern.y };
    const dark = { ...near, lights: base.lights };
    const safe = layers(near, CAM, 3, CTX);
    const open = layers(dark, CAM, 3, CTX);
    expect(safe.soilHz).toBeLessThan(open.soilHz);
    expect(safe.pulse).toBeLessThan(open.pulse);
    expect(safe.hum).toBeGreaterThan(0);
  });

  it('wingbeats are never closer than 80 ms', () => {
    const c = new Conductor(CTX);
    const s = newSim();
    const f = tape(s, '.10 J3 .1 J3 .1 J3 .30');
    const kept = f.flatMap((x) => c.step(x.events, x.snap, CAM, 0, false)).filter((q) => q.sound === 'wing');
    const t = kept.map((q) => q.frame / 60 + q.delay);
    for (let i = 1; i < t.length; i++)
      expect((t[i] ?? 0) - (t[i - 1] ?? 0)).toBeGreaterThanOrEqual(0.08 - 1e-6);
  });
});

describe('the baked sounds', () => {
  const sr = 24000;
  const glass: SoundId[] = [
    'lanternNotice',
    'lanternKindle',
    'lanternRest',
    'lampNotice',
    'lampKindle',
    'lampRest',
  ];

  it('start and end at zero, peak under full scale, and repeat exactly from one seed', () => {
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      const a = bakeSound(id, sr, 7);
      expect(a).toHaveLength(SOUNDS[id]);
      for (const v of a)
        for (const ch of v) {
          expect(ch.every(Number.isFinite), id).toBe(true);
          expect(peak(ch), id).toBeLessThanOrEqual(0.91);
          expect(Math.abs(ch[0] ?? 1), `${id} starts`).toBeLessThan(0.05);
          expect(Math.abs(ch[ch.length - 1] ?? 1), `${id} ends`).toBeLessThan(0.01);
        }
      if (id === 'wing') {
        expect(bakeSound(id, sr, 7)).toEqual(a);
        expect(bakeSound(id, sr, 8)[0]?.[0]).not.toEqual(a[0]?.[0]);
      }
    }
  });

  it('nothing but glass has real energy above 9 kHz', () => {
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      if (glass.includes(id)) continue;
      for (const v of bakeSound(id, 48000, 3).slice(0, 2)) {
        const x = v[0] as Float32Array;
        const hi = biquad(biquad(x.slice(), 48000, 'highpass', 9000), 48000, 'highpass', 9000);
        expect(rms(hi) / rms(x), id).toBeLessThan(0.05);
      }
    }
  });
});

describe('giving: carrying is risky, giving is gentle (memory/giving.md)', () => {
  const FLOOR = 800;
  const scene = {
    ...flatScene(),
    enemies: [{ id: 'b', kind: 'burrback' as const, x: 2400, y: FLOOR, facing: -1 as const }],
  };
  /** Steps one frame at a time with `mask(s)` and keeps the tape. */
  function drive(s: Sim, frames: number, mask: (s: Sim) => string): Frame[] {
    const out: Frame[] = [];
    for (let f = 0; f < frames; f++) out.push(...tape(s, mask(s)));
    return out;
  }
  const ctx = { scene, seed: 1 };
  const routeAll = (frames: Frame[]) =>
    frames.flatMap((x) => [
      ...x.events.flatMap((e, i) => route(e, i, x.snap, ctx)),
      ...ambient(x.snap, CAM, ctx),
    ]);

  it('a burrback draws breath as it sees her, her offer is glass, it answers with a breath, then calms slower and slower', () => {
    const s = newSim(scene);
    s.state.pickups.count = 15;
    s.place(2000, FLOOR);
    let offered = false;
    const frames = drive(s, 700, (q) => {
      const e = q.state.enemies[0];
      const near = e && Math.abs(e.x + e.w / 2 - (q.state.player.x + q.state.player.w / 2)) < 150;
      if (!offered && near && (e?.aware ?? 0) > 0) {
        offered = true;
        return 'O1';
      }
      return offered || near ? '.1' : 'R1';
    });
    const cues = routeAll(frames);
    const names = sounds(cues);
    expect(names).toContain('sniff');
    expect(names).toContain('offerTone');
    expect(names.some((n) => n === 'exhale' || n === 'settle')).toBe(true);
    expect(names.indexOf('offerTone')).toBeLessThan(names.findIndex((n) => n === 'exhale' || n === 'settle'));
    // Calm: two to four breaths, each further apart and fainter than the last.
    const calm = cues.filter((c) => c.sound === 'calmBreath');
    expect(calm.length).toBeGreaterThanOrEqual(2);
    expect(calm.length).toBeLessThanOrEqual(4);
    for (let k = 1; k < calm.length; k++) expect(calm[k]?.db ?? 0).toBeLessThan(calm[k - 1]?.db ?? 0);
    const gaps = calm.slice(1).map((c, k) => c.frame - (calm[k]?.frame ?? 0));
    for (let k = 1; k < gaps.length; k++) expect(gaps[k] ?? 0).toBeGreaterThan(gaps[k - 1] ?? 0);
  });

  it('empty hands make a dry flutter, not a tone', () => {
    const s = newSim(flatScene());
    s.state.pickups.count = 0;
    expect(sounds(routed(tape(s, '.5 O1 .20')))).toEqual(['flutter']);
  });

  it('the chord of what she carries: silent empty-handed, fuller and louder with every level', () => {
    const s = newSim(flatScene());
    const at = (n: number) => {
      s.state.pickups.count = n;
      const f = tape(s, '.1');
      const snap = f[0]?.snap as AudioSnap;
      return layers(snap, CAM, 0, CTX).chord;
    };
    expect(at(0)).toEqual([0, 0, 0, 0]);
    // (Level 1 is two glints since giving round 2: one is too small a light.)
    const one = at(2);
    // (Level 4 is 45 glints since giving round 2.)
    const four = at(50);
    expect(one.filter((g) => g > 0)).toHaveLength(1);
    expect(four.filter((g) => g > 0)).toHaveLength(4);
    const power = (c: number[]) => Math.sqrt(c.reduce((a, g) => a + g * g, 0));
    expect(power(four)).toBeGreaterThan(power(one) * 2);
  });

  it('a rest that costs glints lets them go as small falling notes; a lantern given its price climbs toward D', () => {
    const snap = tape(newSim(), '.1')[0]?.snap as AudioSnap;
    const rest: SimEvent = {
      type: 'lanternRest',
      id: 'l',
      x: 1448,
      y: 1280,
      hp: 4,
      hpMax: 4,
      healed: 3,
      free: 0,
      cost: 3,
      wallet: 2,
      short: false,
    };
    const notes = route(rest, 0, snap, CTX).filter((c) => c.sound === 'glintNote');
    expect(notes).toHaveLength(3);
    for (let k = 1; k < 3; k++) {
      expect(notes[k]?.cents ?? 0).toBeLessThan(notes[k - 1]?.cents ?? 0);
      expect(notes[k]?.delay ?? 0).toBeGreaterThan(notes[k - 1]?.delay ?? 0);
    }
    expect(route({ ...rest, cost: 0 }, 0, snap, CTX).filter((c) => c.sound === 'glintNote')).toHaveLength(0);
    const gift = (given: number, need: number) =>
      route({ type: 'lanternGift', id: 'l', x: 1448, y: 1280, given, need, wallet: 5 }, 0, snap, CTX)[0]
        ?.cents ?? 0;
    expect(gift(1, 11)).toBeLessThan(gift(6, 6));
    expect(gift(6, 6)).toBeLessThan(gift(11, 1));
  });
});

describe('the prologue (milestone 3): cues keyed to beats, a mix over the game', () => {
  /** Walks a synthetic prologue through its cinematic beats at 60 fps (the played one briefly). */
  function walk(): { cues: Cue[]; views: ProView[] } {
    const views: ProView[] = [];
    let t = 0;
    for (const b of BEATS) {
      const len = b.len ?? 6;
      for (let bt = 0; bt < len; bt += 1 / 60) {
        views.push({ beat: b.id, bt, t, done: false, phase: 'leg', pt: bt, stopAt: -1, bumps: 0 });
        t += 1 / 60;
      }
    }
    views.push({ beat: 'wake', bt: 99, t, done: true });
    const cues: Cue[] = [];
    let prev: ProView | null = null;
    for (const v of views) {
      cues.push(...proCues(prev, v, CAM, CTX));
      prev = v;
    }
    return { cues, views };
  }

  it('each beat has its sounds, once, from its own timing sheet', () => {
    const { cues } = walk();
    const n = (s: string) => cues.filter((c) => c.sound === s).length;
    expect(n('staticBurst')).toBe(1);
    expect(n('creak')).toBe(3);
    expect(n('boneKnock')).toBe(1);
    expect(n('rumble')).toBe(1);
    expect(n('hushCall')).toBe(1);
    // The knock: in the breath, the hollow and the summit; never under the hatching or the first night.
    const beatAt = (f: number) => {
      let t = 0;
      for (const b of BEATS) {
        t += (b.len ?? 6) * 60;
        if (f <= t) return b.id;
      }
      return 'wake';
    };
    const knocks = cues.filter((c) => c.sound === 'knock').map((c) => beatAt(c.frame));
    expect(knocks.length).toBeGreaterThan(3);
    expect(knocks.filter((b) => b === 'hatch' || b === 'play')).toHaveLength(0);
    expect(knocks).toContain('hollow');
    // Sorrel's motif slow at the fold (12 notes), then leading her; her first two notes on the tap.
    expect(cues.filter((c) => c.sound === 'pluck' && c.frame < 60 * 40)).toHaveLength(2);
    expect(n('pluckBright')).toBeGreaterThan(12);
    // Music is scheduled a frame ahead: never late, never more than a frame early.
    for (const c of cues.filter((q) => q.bus === 'score')) {
      expect(c.delay).toBeGreaterThanOrEqual(0);
      expect(c.delay).toBeLessThanOrEqual(1 / 60 + 1e-9);
    }
    expect(walk().cues).toEqual(cues);
  });

  it('the breath is the Hush alone with the light; the warm note only while the blur rests on it', () => {
    const at = (bt: number) => proMix({ beat: 'breath', bt, t: bt, done: false });
    expect(at(2).bed).toBe(0);
    expect(at(2).maker).toBe(0);
    expect(at(5.5).maker).toBeGreaterThan(0);
    expect(at(8.5).maker).toBe(0);
    expect(at(2).light).toBeGreaterThan(0);
    expect(at(8.6).light).toBe(0);
    expect(at(2).hush).toBeGreaterThan(1);
  });

  it('hidden in the ferns, everything holds its breath; the lamp stops dead when the wash moves on', () => {
    const hollow = (bt: number, fold = 0) =>
      proMix({ beat: 'hollow', bt, t: 0, done: false, inFerns: fold > 0, fold });
    // (Read from the timing sheet: the prologue is re-cut often.)
    const open = HOLLOW.open[1];
    const played = (HOLLOW.play[0] + HOLLOW.play[1]) / 2;
    const after = HOLLOW.hide[0] + HOLLOW.wash.back + 0.5;
    expect(hollow(open).soilHz ?? 0).toBeGreaterThan(1500);
    expect(hollow(played).lamp).toBeGreaterThan(0);
    const hid = hollow(played, 1);
    expect(hid.hold && hid.bed === 0 && hid.pulse === 0 && !hid.knock).toBe(true);
    expect(hollow(after).lamp).toBe(0);
  });
});
