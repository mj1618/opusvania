import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { parseInputScript } from '../../src/input/script';
import { runReplay } from '../../src/sim/replay';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

describe('replay', () => {
  it('record then playback reproduces the identical state hash', () => {
    const tuning = cloneTuning(defaultTuning);
    const game = new Game(tuning, { seed: 1234, roomId: 'gym' });
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
    tuning.player.runSpeed = 50; // live tweak after recording
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
});
