import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioData } from '../../src/audio/data';
import type { PlayOpts } from '../../src/audio/engine';
import { type AudioOut, EventRouter, type RouterState } from '../../src/audio/router';
import { HeadlessSim } from '../../src/debug/headless';
import { type TapeFile, tapeSetup } from '../../src/debug/tape';
import { parseInputScript } from '../../src/input/script';
import { hashState } from '../../src/sim/index';
import { buildRoom, registerRoom } from '../../src/sim/world/rooms';

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

function state(frame: number, vy: number): RouterState {
  return { frame, roomId: 'gym-01', player: { x: 0, y: 0, w: 40, h: 88, vy } };
}

describe('EventRouter: events', () => {
  it('maps jump kinds', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    for (const kind of ['ground', 'coyote', 'buffered', 'double', 'wall', 'dashJump'] as const)
      r.handle({ type: 'jump', kind, x: 1, y: 2, dir: 1 });
    expect(f.names()).toEqual(['jump', 'jump', 'jump', 'doubleJump', 'wallJump', 'dashJump']);
    expect(f.played[0]?.opts).toMatchObject({ x: 1, y: 2 });
  });

  it('lets the sim pick hard vs soft landings and scales volume by impact speed', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    const l = sfx.events.land;
    r.handle({ type: 'land', x: 0, y: 0, vy: 1, fallPx: 10, hard: false });
    r.handle({ type: 'land', x: 0, y: 0, vy: l.refVyPxPerFrame * 0.6, fallPx: 100, hard: false });
    r.handle({ type: 'land', x: 0, y: 0, vy: l.refVyPxPerFrame, fallPx: 400, hard: true });
    expect(f.names()).toEqual([l.soft, l.soft, l.hard]);
    expect(f.played[0]?.opts.volume).toBe(l.minVolume);
    expect(f.played[1]?.opts.volume).toBeCloseTo(0.6);
    expect(f.played[2]?.opts.volume).toBe(1);
  });

  it('routes simple events and room changes; events without a sound are ignored', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.handle({ type: 'dashStart', x: 0, y: 0, dir: 1, air: false });
    r.handle({ type: 'headBump', x: 0, y: 0 });
    r.handle({ type: 'step', x: 0, y: 0 });
    r.handle({ type: 'cornerCorrect', kind: 'head', x: 0, y: 0, dx: 1, dy: 0 });
    r.handle({ type: 'roomEnter', roomId: 'gym-02', x: 0, y: 0 });
    expect(f.names()).toEqual(['dash', 'headBump', 'footstep']);
    expect(f.rooms).toEqual(['gym-02']);
    expect(r.log.map((e) => e.type)).toEqual(['dashStart', 'headBump', 'step', 'roomEnter']);
  });

  it('opens the wall-slide loop only between wallSlideStart and wallSlideEnd, following vy', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    const w = sfx.events.wallSlide;
    r.update(state(0, 5));
    r.handle({ type: 'wallSlideStart', x: 0, y: 0, dir: 1 });
    r.update(state(1, w.refSpeedPxPerFrame * 2));
    r.update(state(2, 0.1));
    r.handle({ type: 'wallSlideEnd', x: 0, y: 0, dir: 1 });
    r.update(state(3, 5));
    expect(f.loops.map((l) => l.gain)).toEqual([0, 1, w.minGain, 0, 0]);
  });

  it('follows room changes made without events (restore, tape playback)', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    r.update(state(0, 0));
    r.update(state(1, 0));
    r.update({ ...state(2, 0), roomId: 'hub' });
    expect(f.rooms).toEqual(['gym-01', 'hub']);
  });
});

describe('EventRouter with the real sim', () => {
  /** Runs the sim with the router attached exactly as AudioSystem does (every event, then update). */
  function drive(sim: HeadlessSim, inputs: string, r: EventRouter, hashes?: string[]) {
    for (const m of parseInputScript(inputs)) {
      const evs = sim.step(m);
      const before = hashState(sim.state);
      for (const e of evs) r.handle(e, sim.state.frame);
      r.update(sim.state);
      expect(hashState(sim.state)).toBe(before);
      hashes?.push(before);
    }
  }

  it('every movement sound is triggered by a real sim event (golden tapes + a spike death)', () => {
    const f = fakeOut();
    const r = new EventRouter(f.out, sfx);
    const dir = join(__dirname, '../replays');
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const t = JSON.parse(readFileSync(join(dir, file), 'utf8')) as TapeFile;
      drive(new HeadlessSim(tapeSetup(t)), t.inputs, r);
    }
    const rows = Array.from({ length: 17 }, (_, y) =>
      y === 0 || y === 16
        ? '#'.repeat(30)
        : y === 15
          ? '#.P......^^^^^^..............#'
          : `#${'.'.repeat(28)}#`,
    );
    registerRoom(
      buildRoom({
        id: 'audio-spikes',
        rows,
        abilities: { wallJump: false, dash: false, doubleJump: false, pogo: false },
      }),
    );
    drive(new HeadlessSim({ room: 'audio-spikes' }), 'R60 .90', r);
    // A held wall slide (the re-solved tapes no longer slide for long): jump at gym-07's left wall.
    drive(new HeadlessSim({ room: 'gym-07' }), 'L+J20 L40', r);

    const want = [
      ...['jump', 'doubleJump', 'wallJump', 'dashJump', 'landSoft', 'landHard', 'footstep'],
      ...['dash', 'headBump', 'pogo', 'death', 'respawn'],
    ];
    const got = new Set(f.names());
    expect(want.filter((n) => !got.has(n))).toEqual([]);
    expect(f.loops.some((l) => l.name === sfx.events.wallSlide.loop && l.gain > 0)).toBe(true);
  });

  it('audio does not change the sim', () => {
    const r = new EventRouter(fakeOut().out, sfx);
    const withAudio: string[] = [];
    drive(new HeadlessSim({ room: 'gym-01', seed: 5 }), '.30 R+J14 R50', r, withAudio);
    const plain = new HeadlessSim({ room: 'gym-01', seed: 5 });
    const hashes = parseInputScript('.30 R+J14 R50').map((m) => {
      plain.step(m);
      return hashState(plain.state);
    });
    expect(withAudio).toEqual(hashes);
  });
});

describe('EventRouter: L3 hums follow the sim', () => {
  it('Lot 7 route A: hums start per home sound, the partition is seized, the spring flies and lands', () => {
    const calls: string[] = [];
    const f = fakeOut();
    const out: AudioOut = {
      ...f.out,
      hums: {
        reset: (list) => void calls.push(`reset:${list.map((h) => `${h.id}/${h.colour}`).join(',')}`),
        seize: (id) => void calls.push(`seize:${id}`),
        fly: (id) => void calls.push(`fly:${id}`),
        land: (id, _at, thud) => void calls.push(`${thud ? 'land' : 'rehum'}:${id}`),
        setPosition: () => {},
      },
    };
    const r = new EventRouter(out, sfx);
    const tape = JSON.parse(
      readFileSync(join(import.meta.dirname, '../replays/lot-7.slab.json'), 'utf8'),
    ) as TapeFile;
    const sim = new HeadlessSim(tapeSetup(tape));
    for (const e of sim.initEvents) r.handle(e, 0, sim.state);
    for (const m of parseInputScript(tape.inputs))
      for (const e of sim.step(m)) r.handle(e, sim.state.frame, sim.state);
    // Four object sources: partition (pink), two furnaces (brown), static (white).
    const colours = (calls[0] ?? '')
      .replace('reset:', '')
      .split(',')
      .map((h) => h.split('/')[1]);
    expect(colours.sort()).toEqual(['brown', 'brown', 'pink', 'white']);
    const seizes = calls.filter((c) => c.startsWith('seize:'));
    const flies = calls.filter((c) => c.startsWith('fly:'));
    const lands = calls.filter((c) => c.startsWith('land:'));
    expect(seizes.length).toBe(2);
    expect(flies.length).toBe(2);
    expect(lands.length).toBe(2);
    // The first thing seized is the first thing thrown (the pink partition -> spring).
    expect(flies[0]?.slice(4)).toBe(seizes[0]?.slice(6));
  });
});
