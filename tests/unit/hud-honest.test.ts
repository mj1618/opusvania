/**
 * The HUD and the lines (the Canopy r11, review r10 #8): the count is the freed moths alone (no " / "), a lantern pip
 * fills toward the next light, the area's tally is the map's, lines last 2.5 s at most and never stand over a fight
 * (a creature aware of her within 800 px, driven here by the real sim). Also the release's timeline (release.ts): one
 * tick per freed moth, in order, after the swirl.
 */
import { describe, expect, it } from 'vitest';
import { fightNear, LINE_TIME, LineTimer } from '../../src/render/hud/line-logic';
import { countText, pipFill } from '../../src/render/hud/moths';
import {
  RELEASE,
  releaseDepart,
  releaseDrawn,
  releaseFreeze,
  releaseGreat,
  releaseTicks,
} from '../../src/render/lantern/release';
import { mapTally } from '../../src/render/map/paint';
import { getRoom } from '../../src/scene/index';
import { createState, mothMilestone, placePlayer, step } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const t = cloneTuning(defaultTuning);

function fightView(s: GameState) {
  const p = s.player;
  return { player: { cx: p.x + p.w / 2, cy: p.y + p.h / 2 }, enemies: s.enemies };
}

describe('the count', () => {
  it('is the freed moths alone, never "x / y"', () => {
    for (const n of [0, 30, 60, 61, 349, 350, 2400]) {
      expect(countText(n)).toBe(String(n));
      expect(countText(n)).not.toContain('/');
    }
  });
  it('has a pip that fills toward the next light and is full past the last', () => {
    const at = (n: number) => {
      const m = mothMilestone(t, n);
      return pipFill(n, m.prev, m.next);
    };
    expect(at(0)).toBe(0);
    expect(at(30)).toBeCloseTo(0.5);
    expect(at(60)).toBe(0);
    expect(at(5000)).toBe(1);
  });
  it('the tally is on the map: moths of all the traps and cages opened', () => {
    const rooms = [
      {
        id: 'a',
        scene: {
          lures: [
            { id: 't1', trap: true, moths: 30 },
            { id: 'w', moths: 0 },
          ],
        },
      },
      { id: 'b', scene: { lures: [{ id: 't2', trap: true, moths: 40 }] } },
    ];
    expect(mapTally(rooms, ['a:t1'])).toBe('30 of 70 moths · 1 of 2 cages');
    expect(mapTally([{ id: 'c', scene: {} }], [])).toBeNull();
  });
});

describe('lines', () => {
  it('last 2.5 s at most', () => {
    expect(LINE_TIME.in + LINE_TIME.hold + LINE_TIME.out).toBeLessThanOrEqual(2.5);
    const l = new LineTimer();
    l.show('A new light kindles.');
    let up = 0;
    for (let f = 0; f < 600; f++) if (l.update(1 / 60, false) > 0.003) up++;
    expect(up / 60).toBeLessThanOrEqual(2.5);
    expect(up).toBeGreaterThan(60);
  });

  it('never show while a creature aware of her is within 800 px, and show once it is down', () => {
    const room = getRoom('cn-tunnel');
    const s = createState(1, t, room);
    // Beside the tunnel's first burrback (4620, 1856): it notices her.
    placePlayer(s, 4380, 1856, t, room, []);
    let aware = false;
    const l = new LineTimer();
    l.show('Your claws have hardened. Jump at a wall to climb.');
    let fightFor = 0;
    let last = 1;
    for (let f = 0; f < 240; f++) {
      step(s, 0, t, room, []);
      const fight = fightNear(fightView(s));
      if (fight) aware = true;
      fightFor = fight ? fightFor + 1 : 0;
      const a = l.update(1 / 60, fight);
      // In a fight it only fades, and is gone within `cut` s.
      if (fight) expect(a).toBeLessThanOrEqual(last + 1e-9);
      if (fightFor > LINE_TIME.cut * 60 + 1) expect(a).toBe(0);
      last = fight ? a : 1;
    }
    expect(aware).toBe(true);
    // Every creature down: the line comes up.
    for (const e of s.enemies) e.aware = 0;
    expect(fightNear(fightView(s))).toBe(false);
    let shown = 0;
    for (let f = 0; f < 60; f++) shown = Math.max(shown, l.update(1 / 60, fightNear(fightView(s))));
    expect(shown).toBe(1);
  });

  it('a creature far off is no fight', () => {
    const room = getRoom('cn-tunnel');
    const s = createState(1, t, room);
    placePlayer(s, 2200, 1856, t, room, []);
    for (const e of s.enemies) e.aware = 30;
    const near = s.enemies.some((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) < 800);
    expect(fightNear(fightView(s))).toBe(near);
  });
});

describe('the release', () => {
  it('ticks once per freed moth, in order, after the swirl, within the peel-off', () => {
    for (const n of [30, 40, 120]) {
      const ticks = releaseTicks(n);
      expect(ticks.length).toBe(n);
      for (let k = 1; k < n; k++) expect(ticks[k] as number).toBeGreaterThanOrEqual(ticks[k - 1] as number);
      expect(ticks[0] as number).toBeGreaterThanOrEqual(RELEASE.burst + RELEASE.circle);
      const drawn = releaseDrawn(n);
      expect(ticks[n - 1]).toBeCloseTo(releaseDepart(drawn - 1, drawn, n));
    }
  });
  it('draws twice the moths, and the great cage holds longer', () => {
    expect(releaseDrawn(30)).toBe(60);
    expect(releaseGreat(30)).toBe(false);
    expect(releaseGreat(120)).toBe(true);
    expect(releaseFreeze(30)).toBe(14);
    expect(releaseFreeze(120)).toBeGreaterThan(14);
  });
});
