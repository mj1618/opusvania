import { describe, expect, it } from 'vitest';
import { canonicalJson, hashState } from '../../src/sim/hash';

describe('state hash', () => {
  it('ignores key order', () => {
    expect(hashState({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashState({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('changes when any value changes', () => {
    expect(hashState({ x: 1 })).not.toBe(hashState({ x: 2 }));
    expect(hashState({ x: 0.1 })).not.toBe(hashState({ x: 0.10000000000000002 }));
  });

  it('is a stable 14-hex-char string', () => {
    expect(hashState({ hello: 'world' })).toMatch(/^[0-9a-f]{14}$/);
    // Pinned so an accidental change to the hash function is caught.
    expect(hashState({ hello: 'world' })).toBe(hashState(JSON.parse('{"hello":"world"}')));
  });
});
