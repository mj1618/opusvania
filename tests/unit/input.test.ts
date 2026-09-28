import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { ActionBit, axisX, maskOf, tickBuffer, wasPressed, wasReleased } from '../../src/sim/input';

describe('input frames', () => {
  it('parses string scripts', () => {
    const f = parseInputScript('right*2 right+jump _*1 jump*0');
    expect(f).toEqual([ActionBit.right, ActionBit.right, ActionBit.right | ActionBit.jump, 0]);
    expect(() => parseInputScript('fly*3')).toThrow(/Unknown action/);
    expect(() => parseInputScript('left*x')).toThrow(/Bad frame count/);
  });

  it('parses array scripts and raw masks', () => {
    expect(parseInputScript([{ hold: ['left'], frames: 2 }, 5, {}])).toEqual([
      ActionBit.left,
      ActionBit.left,
      5,
      0,
    ]);
  });

  it('detects edges and axes', () => {
    const j = maskOf(['jump']);
    expect(wasPressed(j, 0, 'jump')).toBe(true);
    expect(wasPressed(j, j, 'jump')).toBe(false);
    expect(wasReleased(0, j, 'jump')).toBe(true);
    expect(axisX(maskOf(['left']))).toBe(-1);
    expect(axisX(maskOf(['left', 'right']))).toBe(0);
  });

  it('buffers for N frames', () => {
    let b = tickBuffer(0, true, 3);
    const seen = [b];
    for (let i = 0; i < 4; i++) {
      b = tickBuffer(b, false, 3);
      seen.push(b);
    }
    expect(seen).toEqual([3, 2, 1, 0, 0]);
  });
});
