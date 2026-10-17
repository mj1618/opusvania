import { describe, expect, it } from 'vitest';
import { DONE, STAGE_BEATS, StageCamera } from '../../src/render/camera/stage-cam';
import type { CameraView } from '../../src/render/contract';
import type { Room } from '../../src/scene/room';
import { StageSchema } from '../../src/scene/stage';
import type { SimEvent } from '../../src/sim/events';

const room = {
  id: 'stage-test',
  width: 4000,
  height: 2000,
  marks: {
    stage: StageSchema.parse({
      vista: { flag: 'vista', zone: 'v', x: 1500, y: 1000, zoom: 0.9, hold: 2 },
      glimpse: {
        flag: 'glimpse',
        x: 200,
        y: 100,
        secs: 4,
        path: [
          [0, 0],
          [10, 10],
        ],
        away: [
          [10, 10],
          [0, 0],
        ],
      },
    }),
  },
} as unknown as Room;
const view: CameraView = { x: 0, y: 0, zoom: 1, w: 1920, h: 1080 };
const flagSet = (flag: string) => ({ type: 'flagSet', flag, by: 't', x: 0, y: 0 }) as SimEvent;

describe('story staging camera (marks.stage)', () => {
  it('a vista on its flag: eases to the point, holds, gives the view back; she is never held', () => {
    const c = new StageCamera(room, []);
    expect(STAGE_BEATS.vista).toBe(-1);
    c.update(1 / 60, [flagSet('vista')], '', view, []);
    let peak = 0;
    for (let i = 0; i < 60 * 3; i++) {
      c.update(1 / 60, [], '', view, []);
      peak = Math.max(peak, c.weight);
    }
    expect(peak).toBeCloseTo(1, 3);
    expect(c.x).toBeCloseTo(1500, 0);
    expect(c.zoom).toBeCloseTo(0.9, 3);
    for (let i = 0; i < 60 * 2; i++) c.update(1 / 60, [], '', view, []);
    expect([c.x, c.y, c.zoom]).toEqual([0, 0, 1]);
    // Once only.
    c.update(1 / 60, [flagSet('vista')], '', view, []);
    expect(c.weight).toBe(0);
  });

  it('a zone cue stands in for a missing trigger, once a visit; a flag already saved means done', () => {
    const c = new StageCamera(room, []);
    c.update(1 / 60, [], 'v', view, []);
    expect(STAGE_BEATS.vista).toBeGreaterThanOrEqual(0);
    const d = new StageCamera(room, ['vista', 'glimpse']);
    d.update(1 / 60, [], 'v', view, ['vista', 'glimpse']);
    expect(STAGE_BEATS.vista).toBe(DONE);
    expect(STAGE_BEATS.glimpse).toBe(DONE);
    expect(d.weight).toBe(0);
  });

  it('the glimpse lasts its `secs`', () => {
    const c = new StageCamera(room, []);
    c.update(1 / 60, [flagSet('glimpse')], '', view, []);
    let f = 0;
    while (c.weight > 0 || f < 5) {
      c.update(1 / 60, [], '', view, []);
      f++;
      if (f > 600) break;
    }
    expect(f / 60).toBeCloseTo(4, 0);
  });
});

describe('story staging camera bounds', () => {
  it('a framing by the room edge stays inside the room', () => {
    const c = new StageCamera(room, []);
    const r = room.marks?.stage?.vista;
    if (r) r.x = 100;
    c.update(1 / 60, [flagSet('vista')], '', view, []);
    for (let i = 0; i < 90; i++) c.update(1 / 60, [], '', view, []);
    expect(c.x).toBeCloseTo(1920 / 2 / 0.9, 0);
    if (r) r.x = 1500;
  });
});
