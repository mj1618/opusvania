import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { parseInputScript } from '../../src/input/script';
import { runReplay } from '../../src/sim/replay';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

describe('replay', () => {
  it('record then playback reproduces the identical state hash', () => {
    const tuning = cloneTuning(defaultTuning);
    const game = new Game(tuning, { seed: 1234, roomId: 'gym-01' });
    game.mode = 'manual';
    game.steps(10);
    game.startRecording();
    game.queueInput(
      parseInputScript('right*30 right+jump*18 right*40 left+jump*12 left*30 _*60 jump*8 _*40'),
    );
    game.steps(238);
    const replay = game.stopRecording();
    expect(replay).not.toBeNull();
    if (!replay) return;
    expect(replay.inputs).toHaveLength(238);
    const liveHash = game.hash();
    expect(replay.endHash).toBe(liveHash);

    const a = runReplay(replay);
    const b = runReplay(JSON.parse(JSON.stringify(replay)));
    expect(a.hash).toBe(liveHash);
    expect(b.hash).toBe(liveHash);
    expect(a.matches).toBe(true);
    expect(a.events.some((e) => e.type === 'land')).toBe(true);
  });

  it('uses the tuning captured at record time, not the live tuning', () => {
    const tuning = cloneTuning(defaultTuning);
    const game = new Game(tuning, { seed: 1 });
    game.startRecording();
    game.queueInput(parseInputScript('right*20 jump*20 _*30'));
    game.steps(70);
    const replay = game.stopRecording();
    if (!replay) throw new Error('no replay');
    tuning.run.maxSpeed = 5; // live tweak after recording
    expect(runReplay(replay).matches).toBe(true);
  });

  it('detects a divergent replay', () => {
    const game = new Game(cloneTuning(defaultTuning), { seed: 1 });
    game.startRecording();
    game.queueInput(parseInputScript('right*20'));
    game.steps(20);
    const replay = game.stopRecording();
    if (!replay) throw new Error('no replay');
    replay.inputs[5] = 0;
    expect(runReplay(replay).matches).toBe(false);
  });

  it('captures load(), reseed(), setState() and tuning edits made while recording', () => {
    const tuning = cloneTuning(defaultTuning);
    const game = new Game(tuning, { seed: 3 });
    game.steps(5);
    const saved = JSON.parse(JSON.stringify(game.state));
    game.startRecording();
    game.queueInput(parseInputScript('right*20 jump*10 _*30 left*20'));
    game.steps(10);
    game.load('gym-02');
    game.steps(10);
    tuning.jump.gravity = 0.5; // live Tweakpane-style edit
    game.steps(10);
    game.reseed(99);
    game.steps(20);
    game.setState(saved);
    game.steps(10);
    game.load('hub'); // op after the last input
    const replay = game.stopRecording();
    if (!replay) throw new Error('no replay');
    expect(replay.ops?.map((o) => [o.op, o.at])).toEqual([
      ['load', 10],
      ['tuning', 20],
      ['seed', 30],
      ['state', 50],
      ['load', 60],
    ]);
    expect(runReplay(JSON.parse(JSON.stringify(replay))).matches).toBe(true);

    // Playing it back through the Game (as window.__game.replay.play does) matches too, even
    // with different live tuning, and applies the recorded tuning to the live object.
    const live = cloneTuning(defaultTuning);
    live.run.maxSpeed = 5;
    const other = new Game(live, { seed: 1 });
    other.mode = 'manual';
    const n = other.playReplay(replay);
    other.steps(n);
    expect(other.hash()).toBe(replay.endHash);
    expect(live.jump.gravity).toBe(0.5);
    expect(live.run.maxSpeed).toBe(defaultTuning.run.maxSpeed);
  });

  it('re-recording a playback yields an equivalent replay', () => {
    const game = new Game(cloneTuning(defaultTuning), { seed: 5 });
    game.startRecording();
    game.queueInput(parseInputScript('right*15 jump*5 _*10'));
    game.steps(15);
    game.load('gym-02');
    game.steps(15);
    const first = game.stopRecording();
    if (!first) throw new Error('no replay');
    const n = game.playReplay(first);
    game.startRecording();
    game.steps(n);
    const second = game.stopRecording();
    expect(second?.endHash).toBe(first.endHash);
    if (second) expect(runReplay(second).matches).toBe(true);
  });
});
