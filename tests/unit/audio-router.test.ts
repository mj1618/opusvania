import { describe, expect, it } from 'vitest';
import { audioData } from '../../src/audio/data';
import type { PlayOpts } from '../../src/audio/engine';
import { type AudioOut, EventRouter, type RouterState } from '../../src/audio/router';
import { parseInputScript } from '../../src/input/script';
import { hashState, step } from '../../src/sim/index';
import { newGame } from './helpers';

function fakeOut() {
  const played: { name: string; opts: PlayOpts }[] = [];
  const loops: { name: string; gain: number }[] = [];
  const rooms: string[] = [];
  const out: AudioOut = {
    play: (name, opts = {}) => {
      played.push({ name, opts });
      return true;
    },
    loopGain: (name, gain) => void loops.push({ name, gain }),
    setRoom: (id) => void rooms.push(id),
  };
  return { out, played, loops, rooms, names: () => played.map((p) => p.name) };
}

const sfx = audioData().sfx;

function state(frame: number, x: number, y: number, grounded: boolean, extra: object = {}): RouterState {
  return { frame, roomId: 'gym', player: { x, y, w: 40, h: 88, grounded, ...extra } };
}

describe('EventRouter: events', () => {
  it('maps Phase 0 and Phase 1 jump events', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.handle({ type: 'jump', x: 1, y: 2, coyote: false });
    r.handle({ type: 'jump', x: 1, y: 2, coyote: true });
    r.handle({ type: 'jump', kind: 'double' });
    r.handle({ type: 'jump', kind: 'wall' });
    r.handle({ type: 'jump', kind: 'buffered' });
    expect(f.names()).toEqual(['jump', 'jump', 'doubleJump', 'wallJump', 'jump']);
    expect(f.played[0]?.opts).toMatchObject({ x: 1, y: 2 });
  });

  it('scales landings by fall speed and picks the hard land', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    const l = sfx.events.land;
    r.handle({ type: 'land', x: 0, y: 0, speed: 100, variant: 0 });
    r.handle({ type: 'land', x: 0, y: 0, speed: l.refSpeedPxPerSec * 0.6, variant: 0 });
    r.handle({ type: 'land', x: 0, y: 0, speed: l.hardSpeedPxPerSec + 1, variant: 0 });
    r.handle({ type: 'land', vy: 4, fallPx: l.hardFallPx }); // Phase 1 shape
    expect(f.names()).toEqual([l.soft, l.soft, l.hard, l.hard]);
    expect(f.played[0]?.opts.volume).toBe(l.minVolume);
    expect(f.played[1]?.opts.volume).toBeCloseTo(0.6);
  });

  it('routes simple events, room changes, and ignores unknown events', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.handle({ type: 'dashStart', dir: 1 });
    r.handle({ type: 'headBump' });
    r.handle({ type: 'somethingNew' });
    r.handle({ type: 'roomEnter', roomId: 'hall', x: 0, y: 0 });
    expect(f.names()).toEqual(['dash', 'headBump']);
    expect(f.rooms).toEqual(['hall']);
    expect(r.log.map((e) => e.type)).toEqual(['dashStart', 'headBump', 'roomEnter']);
  });
});

describe('EventRouter: state-derived sounds', () => {
  it('derives footsteps from grounded movement, one per stride', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    const stride = sfx.events.footstep.stridePx;
    for (let i = 0; i <= 60; i++) r.update(state(i, i * 10, 0, true));
    expect(f.names().filter((n) => n === 'footstep')).toHaveLength(Math.floor(600 / stride));
  });

  it('no footsteps in the air or standing still', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    for (let i = 0; i <= 60; i++) r.update(state(i, i * 10, 0, false));
    for (let i = 61; i <= 120; i++) r.update(state(i, 600, 0, true));
    expect(f.names()).not.toContain('footstep');
  });

  it('stops deriving footsteps once the sim emits step events', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.handle({ type: 'step', x: 0, y: 0 });
    for (let i = 0; i <= 60; i++) r.update(state(i, i * 10, 0, true));
    expect(f.names().filter((n) => n === 'footstep')).toHaveLength(1);
  });

  it('drives the wall-slide loop from state, then from events', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.update(state(0, 0, 0, false, { state: 'wallSlide' }));
    r.update(state(1, 0, 5, false, { state: 'wallSlide' }));
    r.update(state(2, 0, 5, false, { state: 'air' }));
    const g = f.loops.map((l) => l.gain);
    expect(g[0]).toBeGreaterThan(0);
    expect(g[1]).toBe(0);

    const f2 = fakeOut();
    const r2 = new EventRouter(f2.out, sfx);
    r2.handle({ type: 'wallSlideStart' });
    r2.update(state(0, 0, 0, false));
    r2.update(state(1, 0, 20, false));
    r2.handle({ type: 'wallSlideEnd' });
    expect(f2.loops.at(-2)?.gain).toBe(1);
    expect(f2.loops.at(-1)?.gain).toBe(0);
  });
});

describe('EventRouter with the real sim', () => {
  it('sounds real jumps and landings, one render frame per step, without changing the sim', () => {
    const { state: s, tuning, events } = newGame({ seed: 5 });
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    const hashes: string[] = [];
    const drive = (script: string) => {
      for (const input of parseInputScript(script)) {
        events.length = 0;
        step(s, input, tuning, events);
        const before = hashState(s);
        for (const e of events) r.handle({ ...e }, s.frame);
        r.update(s);
        expect(hashState(s)).toBe(before);
        hashes.push(before);
      }
    };
    drive('_*30 right+jump*14 right*50');
    // An ordinary jump is a soft landing (derived fall height < hardFallPx) plus footsteps.
    expect(f.names()).toEqual(expect.arrayContaining(['jump', 'landSoft', 'footstep']));
    expect(f.names()).not.toContain('landHard');

    // Same inputs without audio give the same hashes.
    const g = newGame({ seed: 5 });
    const plain: string[] = [];
    for (const input of parseInputScript('_*30 right+jump*14 right*50')) {
      step(g.state, input, g.tuning, []);
      plain.push(hashState(g.state));
    }
    expect(hashes).toEqual(plain);
  });

  it('a long drop is a hard landing', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.update(state(0, 0, 0, false));
    r.update(state(1, 0, 400, false));
    r.handle({ type: 'land', x: 0, y: 488, speed: 1400, variant: 0 });
    r.update(state(2, 0, 400, true));
    r.update(state(3, 0, 350, false));
    r.handle({ type: 'land', x: 0, y: 438, speed: 1400, variant: 0 });
    expect(f.names()).toEqual([sfx.events.land.hard, sfx.events.land.soft]);
  });
});
