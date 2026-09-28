import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { defaultBindings } from '../../src/input/bindings';
import { KeyboardSource } from '../../src/input/keyboard';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

class FakeKey extends Event {
  constructor(
    type: string,
    readonly code: string,
    readonly repeat = false,
  ) {
    super(type, { cancelable: true });
  }
}

function setup() {
  const target = new EventTarget();
  const kb = new KeyboardSource(defaultBindings(), target as unknown as Window);
  const send = (type: 'keydown' | 'keyup', code: string, repeat = false) => {
    const e = new FakeKey(type, code, repeat);
    target.dispatchEvent(e);
    return e;
  };
  return { kb, send };
}

describe('keyboard source', () => {
  it('a tap between two samples reads as held for exactly one sample', () => {
    const { kb, send } = setup();
    send('keydown', 'Space');
    send('keyup', 'Space');
    expect(kb.sample()).toBe(ActionBit.jump);
    expect(kb.sample()).toBe(0);
  });

  it('prevents default on auto-repeat of game keys but ignores repeats otherwise', () => {
    const { kb, send } = setup();
    expect(send('keydown', 'Space').defaultPrevented).toBe(true);
    expect(send('keydown', 'Space', true).defaultPrevented).toBe(true);
    expect(send('keydown', 'KeyQ').defaultPrevented).toBe(false);
    expect(kb.sample()).toBe(ActionBit.jump);
  });
});

describe('Game live input', () => {
  it('drains live taps on scripted/manual steps so they do not fire later', () => {
    let pending = ActionBit.jump; // a tap that happened while the script was running
    const live = () => {
      const m = pending;
      pending = 0;
      return m;
    };
    const game = new Game(cloneTuning(defaultTuning), { seed: 1 }, live);
    game.queueInput([0]);
    game.stepOnce(); // scripted step: the tap is sampled and discarded
    expect(game.state.prevInput).toBe(0);
    game.stepOnce(); // realtime, no script: the stale tap must not appear
    expect(game.state.prevInput).toBe(0);
  });
});
