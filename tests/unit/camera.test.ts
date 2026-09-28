import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HeadlessSim } from '../../src/debug/headless';
import { type TapeFile, tapeSetup } from '../../src/debug/tape';
import { parseInputScript } from '../../src/input/script';
import {
  type CameraState,
  createCamera,
  inView,
  stepCamera,
  VIEW_H,
  VIEW_W,
  viewCentre,
} from '../../src/render/camera/index';
import { cameraTuning as ct } from '../../src/render/camera/tuning';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { getRoom, type Room } from '../../src/sim/world/rooms';
import { fill, makeRoom } from './movement/helpers';

interface Rig {
  state: GameState;
  cam: CameraState;
  run(script: string, each?: (f: number) => void): void;
}

function rig(roomId: string, setup?: (s: GameState) => void): Rig {
  const tuning = cloneTuning(defaultTuning);
  const state = createState({ seed: 1, roomId }, tuning);
  setup?.(state);
  const cam = createCamera(state, getRoom(roomId));
  let frame = 0;
  return {
    state,
    cam,
    run(script, each) {
      for (const m of parseInputScript(script)) {
        const evs: SimEvent[] = [];
        step(state, m, tuning, evs);
        stepCamera(cam, state, getRoom(state.roomId), evs);
        frame++;
        each?.(frame);
      }
    },
  };
}

const FLAT: Room = makeRoom(80, 17, undefined, { spawn: [10, 15] });
const STEP3: Room = makeRoom(60, 17, (set) => fill(set, 14, 13, 58, 15), { spawn: [8, 15] });

describe('camera (movement-spec §7.7)', () => {
  it('C1: jump and land at the same height -> camera y unchanged the whole jump', () => {
    const r = rig(FLAT.id);
    r.run('.120');
    const y0 = r.cam.y;
    const ys: number[] = [];
    r.run('J40 .30', () => ys.push(r.cam.y));
    expect(ys.every((y) => y === y0)).toBe(true);
  });

  it('C2: land 3 tiles higher -> y moves monotonically, no overshoot, settles within 60 f', () => {
    const r = rig(STEP3.id);
    r.run('.120');
    let landed = 0;
    const ys: number[] = [];
    r.run('R+J30 R6 .90', (f) => {
      if (!landed && r.state.player.grounded && r.state.player.y + 80 === 13 * 64) landed = f;
      if (landed) ys.push(r.cam.y);
    });
    expect(landed).toBeGreaterThan(0);
    const final = ys[ys.length - 1] ?? 0;
    for (let i = 1; i < ys.length; i++) expect(ys[i] ?? 0).toBeLessThanOrEqual((ys[i - 1] ?? 0) + 1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(final - 1e-9);
    expect(Math.abs((ys[60] ?? 0) - final)).toBeLessThan(2);
  });

  it('C3: falling down gym-09 keeps the feet within [15%, 85%] of the view (unless clamped by room bounds)', () => {
    const r = rig('gym-09');
    const bad: string[] = [];
    let falls = 0;
    const check = () => {
      if (r.state.roomId !== 'gym-09') return;
      const p = r.state.player;
      const feet = (p.y + p.h - r.cam.y) / VIEW_H;
      if (p.vy > 0) falls++;
      if (!r.cam.clampedY && (feet < 0.15 || feet > 0.85)) bad.push(`${r.state.frame}:${feet.toFixed(3)}`);
    };
    for (let i = 0; i < 200 && r.state.player.x < 15 * 64 - 20; i++) r.run('R1', check);
    r.run('.200', check);
    expect(falls).toBeGreaterThan(60);
    expect(r.state.roomId === 'gym-10' || r.state.player.y > 40 * 64).toBe(true);
    expect(bad).toEqual([]);
  });

  it('C4: the view never extends outside the room (pre-shake), with random play in every gym room', () => {
    let seed = 99;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    const btns = ['R', 'L', 'R+J', 'L+J', 'J', 'X', 'R+X', 'D', 'U', '.', 'D+A'];
    for (let n = 1; n <= 14; n++) {
      const id = `gym-${String(n).padStart(2, '0')}`;
      const r = rig(id);
      const script = Array.from(
        { length: 60 },
        () => `${btns[Math.floor(rnd() * btns.length)]}${1 + Math.floor(rnd() * 20)}`,
      ).join(' ');
      r.run(script, () => {
        const room = getRoom(r.state.roomId);
        expect(r.cam.x).toBeGreaterThanOrEqual(0);
        expect(r.cam.y).toBeGreaterThanOrEqual(0);
        expect(r.cam.x + VIEW_W).toBeLessThanOrEqual(room.width * 64 + 1e-6);
        expect(r.cam.y + VIEW_H).toBeLessThanOrEqual(room.height * 64 + 1e-6);
      });
    }
  });

  it('C5: holding Down looks down (>= 90% within 32 f of the press) and releasing returns', () => {
    const r = rig('gym-14');
    r.run('.60');
    r.run('D32');
    expect(r.cam.look).toBeGreaterThanOrEqual(0.9 * ct.lookDown);
    r.run(`D${ct.lookDelay + 60}`);
    expect(r.cam.look).toBeGreaterThanOrEqual(0.9 * ct.lookDown);
    r.run('.90');
    expect(Math.abs(r.cam.look)).toBeLessThan(0.1 * ct.lookDown);
  });

  it('C5 (gym-14): g is in view only while Look-Up is held; spikes only with Look-Down', () => {
    const r = rig('gym-14');
    const room = getRoom('gym-14');
    const g = room.entities.find((e) => e.kind === 'optionalGoal');
    if (!g) throw new Error('gym-14 has no g');
    const spikeY = (23 + room.padY) * 64 + 32;
    r.run('.60');
    expect(inView(r.cam, g.tx * 64, g.ty * 64, 64, 64)).toBe(false);
    expect(inView(r.cam, 64, spikeY, 64, 32)).toBe(false);
    r.run(`U${ct.lookDelay + 60}`);
    expect(inView(r.cam, g.tx * 64, g.ty * 64, 64, 64)).toBe(true);
    r.run('.120');
    expect(inView(r.cam, g.tx * 64, g.ty * 64, 64, 64)).toBe(false);
    r.run(`D${ct.lookDelay + 60}`);
    expect(inView(r.cam, 64, spikeY, 64, 32)).toBe(true);
  });

  it('C6: steady run -> the player screen x is constant (+-1 px) after 90 f', () => {
    const r = rig(FLAT.id);
    r.run('.60');
    const sx: number[] = [];
    r.run('R150', (f) => {
      if (f > 60 + 90) sx.push(r.state.player.x - r.cam.x);
    });
    expect(Math.max(...sx) - Math.min(...sx)).toBeLessThanOrEqual(1);
  });

  it('C7: a short tap the other way (< 48 px) does not flip the focus; a longer one does', () => {
    const r = rig(FLAT.id);
    r.run('R30 .30');
    expect(r.cam.focusDir).toBe(1);
    const x0 = r.state.player.x;
    r.run('L4 .10');
    expect(x0 - r.state.player.x).toBeLessThan(48);
    expect(r.cam.focusDir).toBe(1);
    r.run('L20');
    expect(r.cam.focusDir).toBe(-1);
  });

  it('C8: inside a lock zone the view centre reaches the zone centre within 90 f', () => {
    const room = getRoom('gym-14');
    const lock = room.cameraZones.find((z) => z.mode === 'lock');
    if (!lock) throw new Error('gym-14 has no lock zone');
    const r = rig('gym-14');
    const p = r.state.player;
    p.x = lock.x - 4 * 64;
    p.y = (12 + room.padY) * 64 + 64 - 80;
    r.run('.120');
    let entered = 0;
    r.run('R30', (f) => {
      if (!entered && r.cam.zone >= 0 && room.cameraZones[r.cam.zone] === lock) entered = f;
    });
    expect(entered).toBeGreaterThan(0);
    r.run(`.${90 - (120 + 30 - entered)}`);
    const c = viewCentre(r.cam);
    expect(Math.abs(c.x - lock.cx)).toBeLessThan(1);
    expect(Math.abs(c.y - lock.cy)).toBeLessThan(1);
  });

  it('C9: zone enter/exit blends: the view moves <= 40 px/frame for 12 frames after every zone change (gym-14 tape)', () => {
    const tape = JSON.parse(
      readFileSync(new URL('../replays/gym-14.all.json', import.meta.url), 'utf8'),
    ) as TapeFile;
    const sim = new HeadlessSim(tapeSetup(tape));
    const cam = createCamera(sim.state, getRoom(sim.state.roomId));
    const changes: string[] = [];
    const steps: string[] = [];
    let since = 99;
    for (const m of parseInputScript(tape.inputs)) {
      const x0 = cam.x;
      const y0 = cam.y;
      const z0 = cam.zone;
      const evs = sim.step(m);
      stepCamera(cam, sim.state, getRoom(sim.state.roomId), evs);
      if (cam.zone !== z0) {
        changes.push(`${z0}->${cam.zone}`);
        since = 0;
      }
      if (since++ < 12) {
        const d = Math.max(Math.abs(cam.x - x0), Math.abs(cam.y - y0));
        if (d > 40) steps.push(`f${sim.frame} ${changes.at(-1)}: ${d.toFixed(1)} px`);
      }
    }
    // The route enters the clampY zone, the lock zone, leaves it and enters the bounds zone.
    expect(changes).toEqual(['-1->0', '0->1', '1->-1', '-1->2']);
    expect(steps).toEqual([]);
  });

  it('C9b: dashing out of a lock zone next to a room bound pans instead of cutting', () => {
    const room = getRoom('gym-14');
    const lock = room.cameraZones.find((z) => z.mode === 'lock');
    if (!lock) throw new Error('gym-14 has no lock zone');
    const r = rig('gym-14');
    const p = r.state.player;
    p.x = lock.x + lock.w - 6 * 64;
    p.y = (12 + room.padY) * 64 + 64 - 80;
    r.run('.120');
    let maxStep = 0;
    let x0 = r.cam.x;
    r.run('R+X1 R40', () => {
      maxStep = Math.max(maxStep, Math.abs(r.cam.x - x0));
      x0 = r.cam.x;
    });
    expect(r.cam.zone).not.toBe(room.cameraZones.indexOf(lock));
    expect(maxStep).toBeLessThanOrEqual(40);
  });

  it('C10: running leads by >= 120 px, stopping drifts <= 80 px, reversals pan <= 25 px/frame (L2 playtest P2)', () => {
    const r = rig(makeRoom(120, 17, undefined, { spawn: [10, 15] }).id);
    const lead = () => viewCentre(r.cam).x - (r.state.player.x + r.state.player.w / 2);
    r.run('R150');
    expect(lead()).toBeGreaterThanOrEqual(120);
    const x1 = r.cam.x;
    r.run('.60');
    expect(r.cam.x - x1).toBeLessThanOrEqual(80);
    let maxStep = 0;
    let x0 = r.cam.x;
    r.run('L90', () => {
      maxStep = Math.max(maxStep, Math.abs(r.cam.x - x0));
      x0 = r.cam.x;
    });
    expect(r.cam.focusDir).toBe(-1);
    expect(maxStep).toBeLessThanOrEqual(25);
  });

  it('shake is deterministic and only comes from events (hard land, death, dash kick)', () => {
    const a = rig(FLAT.id);
    const b = rig(FLAT.id);
    a.run('.30 X1 .20');
    b.run('.30 X1 .20');
    expect(a.cam).toEqual(b.cam);
    expect(a.cam.trauma).toBe(0);
  });
});
