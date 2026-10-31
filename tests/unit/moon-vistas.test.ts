/**
 * The moon at vistas only (review r9 #8: the same disc in ~16 of 24 stops): over the Canopy's wide stops, the disc
 * shows at no more than a handful, and at the hatch's opening, the hub's clearing and the way out over the valley.
 */
import { describe, expect, it } from 'vitest';
import { moonShown } from '../../src/render/scene/lib/moon-vistas';
import { ROOMS } from '../../src/scene/index';

describe('the moon at vistas', () => {
  const stops = Object.values(ROOMS)
    .filter((r) => r.id.startsWith('cn-'))
    .flatMap((r) =>
      ((r as { shots?: { wide?: Array<{ name: string; x: number; y: number }> } }).shots?.wide ?? []).map(
        (s) => ({
          room: r.id,
          ...s,
        }),
      ),
    );

  it('shows at the opening, the clearing and the valley', () => {
    expect(moonShown('cn-hatch', 864, 1022)).toBe(1);
    expect(moonShown('cn-hub', 2960, 1600)).toBe(1);
    expect(moonShown('cn-out', 2500, 1000)).toBe(1);
  });

  it('is hidden in the fork, the gap, the well and the hub away from its clearing', () => {
    expect(moonShown('cn-fork', 1400, 1344)).toBe(0);
    expect(moonShown('cn-gap', 2700, 1500)).toBe(0);
    expect(moonShown('cn-well', 1000, 3000)).toBe(0);
    expect(moonShown('cn-hub', 6160, 1152)).toBe(0);
  });

  it('a room outside the Canopy is unchanged', () => {
    expect(moonShown('test-grove', 0, 0)).toBe(1);
  });

  it('the disc is in at most 6 of the area wide stops (a stop over half shown counts)', () => {
    const shown = stops.filter((s) => moonShown(s.room, s.x, s.y) > 0.5);
    expect(stops.length).toBeGreaterThan(40);
    expect(shown.length, shown.map((s) => `${s.room}:${s.name}`).join(', ')).toBeLessThanOrEqual(6);
  });
});
