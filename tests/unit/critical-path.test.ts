import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/**
 * Playtest 3's layout: the lanterns are the critical path, and every wall on it is climbed the
 * same way by anyone (memory/scene-and-units.md, movement-controller.md "wall kick").
 *
 *  - a wall kick rises its full height however short the press, so a 90 ms tap climbs a shaft, or
 *    one wall, as surely as a hold;
 *  - trunk B stands on the floor: the floor ends inside the shaft, the second lantern is on top;
 *  - from the summit a walker comes down a stair (bough, catch branch, right branch) to the right
 *    rise without a jump and without touching burr-root's ground;
 *  - the far bluff (the old far ledge, now a wall down to the rise) stands in the way past the
 *    heart with the third lantern on top;
 *  - the way back west is trunk B's east face; the bark of trunk A leads up out of the well.
 */
const { jump: J, left: LEFT, right: RIGHT } = ActionBit;
const S = GROVE.solids;
const trunks = S.filter((r) => r.tag === 'trunk');
const [a, b] = trunks as [(typeof S)[number], (typeof S)[number]];
const farBluff = S.find((r) => r.tag === 'ground' && r.x === 5472) as (typeof S)[number];
const rise = S.find((r) => r.tag === 'ground' && r.x === 4608) as (typeof S)[number];
const list = GROVE.pickups ?? [];
const hurts = (ev: SimEvent[]) => ev.filter((e) => e.type === 'hurt').length;
const bumps = (ev: SimEvent[]) => ev.filter((e) => e.type === 'headBump').length;
const kicks = (ev: SimEvent[]) => ev.filter((e) => e.type === 'jump' && e.kind === 'wall').length;
const taken = (s: Sim, prefix: string) =>
  list.filter((p, i) => p.id.startsWith(prefix) && s.state.pickups.timers[i] !== 0).length;
const wait = (s: Sim, n: number) => {
  for (let f = 0; f < n; f++) step(s.state, 0, s.tuning, s.scene, s.events);
};

/**
 * The naive hand: holds `dir`; blocked by a wall or sliding down one she presses jump for `press`
 * frames, then not again for `beat`. Until `done()` (frames) or `max` (-1).
 */
function push(s: Sim, dir: -1 | 1, press: number, beat: number, done: () => boolean, max = 900): number {
  const way = dir > 0 ? RIGHT : LEFT;
  let left = 0;
  let rest = 0;
  for (let f = 0; f < max; f++) {
    if (done()) return f;
    const p = s.state.player;
    let m = way;
    const blocked = (p.grounded && p.wallDir === dir && p.vx === 0) || p.mode === 'wallSlide';
    if (left > 0) {
      m |= J;
      left--;
    } else if (rest > 0) rest--;
    else if (blocked) {
      m |= J;
      left = press - 1;
      rest = beat;
    }
    step(s.state, m, s.tuning, s.scene, s.events);
  }
  return done() ? max : -1;
}
const on = (s: Sim, y: number) => () => s.state.player.grounded && feet(s).y === y;
/** Hands: [frames the button is down, frames before the next press]. 5 frames = a 90 ms tap. */
const HANDS: Array<[number, number]> = [
  [4, 6],
  [5, 9],
  [5, 16],
  [6, 24],
  [12, 8],
  [30, 9],
];

describe('a wall kick does not ask for a hold', () => {
  const wall = { tag: 'trunk' as const, x: 2400, y: 0, w: 100, h: 800 };

  it('rises the full jump (272 px) on a one-frame tap; a held kick is what it was', () => {
    const top = (script: string, kickFrames: number) => {
      const s = newSim(flatScene({ solids: [wall] }));
      s.tuning.wall.kickFrames = kickFrames;
      s.place(2380, 800);
      s.run('R+J24 R12');
      expect(s.state.player.mode).toBe('wallSlide');
      const y0 = feet(s).y;
      let hi = y0;
      for (const part of script.split(' ')) {
        const m = /^(.+?)(\d+)$/.exec(part);
        if (!m) throw new Error(part);
        for (let i = 0; i < Number(m[2]); i++) {
          s.run(`${m[1]}1`);
          hi = Math.min(hi, feet(s).y);
        }
      }
      return y0 - hi;
    };
    expect(defaultTuning.wall.kickFrames).toBe(24);
    expect(top('L+J1 L40', 24)).toBe(272);
    expect(top('L+J5 L40', 24)).toBe(272);
    // Without the rule a tap is cut short (the old behaviour: a 90 ms tap gave 136 px).
    expect(top('L+J5 L40', 0)).toBeLessThan(150);
    // A hold is the same kick with or without it (plus the apex hang a hold has always had).
    expect(top('L+J40', 24)).toBe(top('L+J40', 0));
    expect(top('L+J40', 24)).toBeGreaterThanOrEqual(272);
  });

  it('only wall kicks: a tapped ground jump and a tapped double jump are as short as ever', () => {
    const s = newSim(flatScene());
    let hi = 800;
    for (const part of ['J5', '.14', 'J5', '.60']) {
      const m = /^(.+?)(\d+)$/.exec(part);
      if (!m) throw new Error(part);
      for (let i = 0; i < Number(m[2]); i++) {
        s.run(`${m[1]}1`);
        hi = Math.min(hi, feet(s).y);
      }
    }
    expect(800 - hi).toBeLessThan(250);
    expect(s.state.player.kick).toBe(0);
  });

  it('one wall is enough: holding into it and tapping gains about 230 px a kick', () => {
    const s = newSim(flatScene({ solids: [{ ...wall, y: -3000, h: 3800 }] }));
    s.place(2380, 800);
    const from = s.events.length;
    push(s, 1, 5, 9, () => feet(s).y < -400, 600);
    const n = kicks(s.events.slice(from));
    expect(n).toBeGreaterThan(3);
    expect(n).toBeLessThanOrEqual(7);
  });
});

describe('the shaft: the floor ends at trunk B, and a tap climbs it', () => {
  it('holding right at trunk B and tapping: up its bark to the summit, the lantern stirs, in a few seconds, whatever the hand', () => {
    for (const [press, beat] of HANDS) {
      const s = newSim({ ...GROVE, enemies: [] });
      // In through the doorway under trunk A, as she would come.
      s.place(3120, 1280);
      const from = s.events.length;
      const f = push(s, 1, press, beat, on(s, b.y));
      const ev = s.events.slice(from);
      const hand = `press ${press}, beat ${beat}`;
      expect(f, hand).toBeGreaterThan(0);
      expect(f, hand).toBeLessThan(480);
      expect(kicks(ev), hand).toBeLessThanOrEqual(9);
      expect(bumps(ev), hand).toBe(0);
      expect(
        ev.some((e) => e.type === 'lanternNotice' && e.id === 'lantern-crown'),
        hand,
      ).toBe(true);
      // She stands on trunk B's top within a few steps of the lantern.
      expect(Math.abs(feet(s).x - 3684), hand).toBeLessThan(120);
      wait(s, 70);
      // The trail up the bark came with her: the great glint at its foot and the glints on its side.
      expect(taken(s, 'great-arch'), hand).toBe(1);
      expect(taken(s, 'shaft-'), hand).toBeGreaterThanOrEqual(3);
    }
  });

  it('wall to wall with taps (turning to the other wall after each kick): on trunk A in four or five kicks', () => {
    for (const [press, beat] of HANDS) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(3456, 1280);
      const from = s.events.length;
      let dir = 1;
      let left = 0;
      let rest = 0;
      let f = 0;
      for (; f < 600 && !(s.state.player.grounded && feet(s).y <= a.y); f++) {
        const p = s.state.player;
        let m = 0;
        if (left > 0) {
          m |= J;
          left--;
        } else if (rest > 0) rest--;
        else if (p.mode === 'wallSlide' || (p.grounded && p.wallDir === dir)) {
          if (p.mode === 'wallSlide') dir = -p.wallDir;
          m |= J;
          left = press - 1;
          rest = beat;
        }
        if (feet(s).y < a.y - 30) dir = -1;
        m |= dir > 0 ? RIGHT : LEFT;
        step(s.state, m, s.tuning, s.scene, s.events);
      }
      const hand = `press ${press}, beat ${beat}`;
      expect(f, hand).toBeLessThan(600);
      expect(kicks(s.events.slice(from)), hand).toBeLessThanOrEqual(7);
    }
  });
});

describe('from the summit eastward without wings: a stair down to the right rise', () => {
  const lantern = (GROVE.lanterns ?? [])[1] as { x: number; y: number };

  it('holding right from the lantern: bough, catch branch, right branch, the rise; never burr-root’s ground, never a hit, whenever she sets off', () => {
    const lands = new Set<number>();
    for (let k = 0; k < 60; k++) {
      const s = newSim();
      wait(s, k * 31);
      s.place(lantern.x, lantern.y);
      const from = s.events.length;
      const seen: number[] = [];
      for (let f = 0; f < 400 && !(s.state.player.grounded && feet(s).y === rise.y); f++) {
        s.run('R1');
        const p = s.state.player;
        if (p.grounded && seen[seen.length - 1] !== feet(s).y) seen.push(feet(s).y);
      }
      // She is down on the rise at ~4770: 90 px before the wayside lamp, 140 before burr-rise's
      // patch (4914-5106, playtest 4: the walker's last fight). Standing there nothing reaches her.
      expect(feet(s).x, `start ${k * 31}`).toBeLessThan(4860);
      wait(s, 45);
      const ev = s.events.slice(from);
      // Summit and bough (192), the catch branch (448), the right branch (912), the rise (1088).
      expect(seen, `start ${k * 31}`).toEqual([192, 448, 912, 1088]);
      expect(hurts(ev), `start ${k * 31}`).toBe(0);
      expect(
        ev.some((e) => e.type === 'enemyNotice'),
        `start ${k * 31}`,
      ).toBe(false);
      lands.add(feet(s).y);
    }
    expect([...lands]).toEqual([rise.y]);
  });

  it('tapping at each edge, or holding a jump off one, still comes down on the stair or the rise, unhurt', () => {
    const lips: Array<[number, number]> = [
      [3880, 192],
      [4100, 448],
      [4580, 912],
    ];
    for (const [x, y] of lips) {
      for (const jump of ['R+J5', 'R+J14', 'R+J40']) {
        for (let k = 0; k < 60; k += 3) {
          const s = newSim();
          wait(s, k * 31);
          s.place(x, y);
          const from = s.events.length;
          s.run(`R2 ${jump}`);
          for (let f = 0; f < 500 && !s.state.player.grounded; f++) s.run(jump === 'R+J40' ? 'R+J1' : 'R1');
          wait(s, 45);
          const at = feet(s);
          const where = `${jump} off ${x},${y}, start ${k * 31}: ${at.x},${at.y}`;
          expect(hurts(s.events.slice(from)), where).toBe(0);
          // Never down on the ground between the root and the rise, where the burrback walks.
          expect(at.y === 1280 && at.x > 4160 && at.x < 4608, where).toBe(false);
        }
      }
    }
  });
});

describe('the far bluff: a wall in the way past the heart, the third lantern on top', () => {
  const lantern = (GROVE.lanterns ?? [])[2] as { x: number; y: number };
  const heart = GROVE.heart as { x: number; y: number };
  const f7 = S.filter((r) => r.tag === 'floating')[6] as (typeof S)[number];

  it('the geometry: the old far ledge is solid down to the rise, its west face 260 px past the heart', () => {
    // (Its top came down from 448 to 768 after playtest 4: the heart's wake was off the bottom of the
    // picture from the far lantern, 640 px below. Now the heart is 320 px below and 312 px west of it.)
    expect([farBluff.x, farBluff.y, farBluff.w, farBluff.y + farBluff.h]).toEqual([
      5472,
      768,
      288,
      GROVE.height,
    ]);
    expect(rise.x + rise.w).toBe(farBluff.x);
    // Still a climb: 320 px of face, as the first bluff's, more than a jump (272).
    expect(rise.y - farBluff.y).toBe(320);
    expect(rise.y - farBluff.y).toBeGreaterThan(defaultTuning.shape.jumpHeightPx);
    expect([lantern.x, lantern.y]).toEqual([5524, 768]);
    expect([heart.y - lantern.y, lantern.x - heart.x]).toEqual([320, 312]);
    expect(farBluff.x - heart.x).toBe(260);
    // F7 ends clear of a kick's swing off the face (145 px) and of the fall off the bluff's lip.
    expect([f7.x, f7.y, f7.w]).toEqual([5056, 592, 176]);
    expect(farBluff.x - (f7.x + f7.w)).toBeGreaterThanOrEqual(defaultTuning.body.width + 150 + 40);
  });

  it('from the heart, holding right and tapping when blocked: up the face onto the top, the lantern stirs; any hand, no head bump', () => {
    for (const [press, beat] of HANDS) {
      const s = newSim();
      s.place(heart.x, heart.y);
      const from = s.events.length;
      const f = push(s, 1, press, beat, on(s, farBluff.y));
      const ev = s.events.slice(from);
      const hand = `press ${press}, beat ${beat}`;
      expect(f, hand).toBeGreaterThan(0);
      expect(f, hand).toBeLessThan(420);
      expect(kicks(ev), hand).toBeLessThanOrEqual(6);
      expect(bumps(ev), hand).toBe(0);
      expect(hurts(ev), hand).toBe(0);
      expect(
        ev.some((e) => e.type === 'lanternNotice' && e.id === 'lantern-far'),
        hand,
      ).toBe(true);
      expect(Math.abs(feet(s).x - lantern.x), hand).toBeLessThan(140);
      wait(s, 60);
      expect(taken(s, 'cliff-'), hand).toBe(2);
    }
  });

  it('back down to the heart: walking off its west lip she drops to the rise (F7 does not catch her) a few steps past the shrine', () => {
    const s = newSim();
    s.place(lantern.x, lantern.y);
    const from = s.events.length;
    for (let f = 0; f < 200 && !(s.state.player.grounded && feet(s).y === rise.y); f++) s.run('L1');
    expect(feet(s).y).toBe(rise.y);
    expect(Math.abs(feet(s).x - heart.x)).toBeLessThan(160);
    expect(s.events.slice(from).filter((e) => e.type === 'land')).toHaveLength(1);
  });
});

describe('the way back west: trunk B’s east face', () => {
  it('holding left from the heart and tapping when blocked crosses the whole scene back to the first lantern', () => {
    for (const [press, beat] of HANDS) {
      const s = newSim({ ...GROVE, enemies: [] });
      const heart = GROVE.heart as { x: number; y: number };
      s.place(heart.x, heart.y);
      const seen: string[] = [];
      const mark = (what: string, ok: boolean) => {
        if (ok && !seen.includes(what)) seen.push(what);
      };
      const f = push(
        s,
        -1,
        press,
        beat,
        () => {
          const at = feet(s);
          const g = s.state.player.grounded;
          mark('the hollow', g && at.y === 1376);
          mark('the summit bough', g && at.y === 192 && at.x > 3712);
          mark('trunk B', g && at.y === 192 && at.x < 3712);
          // (Off trunk B she drops into the shaft: out under trunk A on foot, or, if she meets
          // trunk A's bark on the way down, up it and along the high ledge. Either way west.)
          mark('the bluff', g && at.y === 960);
          return g && at.y === 1280 && at.x < 1500;
        },
        3600,
      );
      const hand = `press ${press}, beat ${beat}`;
      expect(f, hand).toBeGreaterThan(0);
      // (Up trunk B's east face she comes through the bough or straight onto the top.)
      expect(
        seen.filter((w) => w === 'trunk B' || w === 'the bluff'),
        `${hand}: ${seen.join(', ')}`,
      ).toEqual(['trunk B', 'the bluff']);
      expect(f, hand).toBeLessThan(1500);
      wait(s, 30);
      expect(taken(s, 'back-'), hand).toBe(2);
    }
  });
});

describe('burr-root: every arrival on its ground is fair', () => {
  const foes = GROVE.enemies ?? [];
  const idx = foes.findIndex((e) => e.id === 'burr-root');
  const lamp = (GROVE.lamps ?? []).find((l) => l.id === 'lamp-root') as { x: number; y: number };

  it('it keeps 180 px off the root’s foot and still walks through the lamp at the rise’s foot', () => {
    expect(foes[idx]).toMatchObject({ x: 4476, y: 1280, radius: 110 });
    const s = newSim();
    s.state.player.invuln = 1e9;
    let lo = 9e9;
    let hi = 0;
    for (let f = 0; f < 3600; f++) {
      step(s.state, 0, s.tuning, s.scene, s.events);
      const e = s.state.enemies[idx];
      if (!e) throw new Error('no burr-root');
      lo = Math.min(lo, e.x);
      hi = Math.max(hi, e.x + e.w);
    }
    expect([lo, hi]).toEqual([4340, 4608]);
    expect(lo - 4160).toBe(180);
    expect(hi).toBeGreaterThan(lamp.x);
  });

  /** Runs an input until she has been in the air and stands again. */
  const until = (s: Sim, input: string, max = 500) => {
    let air = false;
    for (let f = 0; f < max; f++) {
      s.run(`${input}1`);
      if (!s.state.player.grounded) air = true;
      else if (air) return;
    }
  };
  const ARRIVALS: Array<[string, (s: Sim) => void]> = [
    [
      'running off the root',
      (s) => {
        s.place(4000, 1184);
        until(s, 'R');
      },
    ],
    [
      'out of the hollow with one held jump',
      (s) => {
        s.place(3856, 1376);
        until(s, 'R+J');
      },
    ],
    [
      'out of the hollow with taps, then off the root',
      (s) => {
        s.place(3930, 1376);
        push(s, 1, 5, 9, on(s, 1184), 200);
        until(s, 'R');
      },
    ],
    [
      'walking off the catch branch',
      (s) => {
        s.place(4060, 448);
        until(s, 'R');
      },
    ],
    [
      'stepping off the catch branch and letting go',
      (s) => {
        s.place(4060, 448);
        s.run('R12');
        until(s, '.');
      },
    ],
    [
      'a tap jump off the catch branch',
      (s) => {
        s.place(4060, 448);
        s.run('R5 R+J5');
        until(s, 'R');
      },
    ],
    [
      'a held jump off the catch branch',
      (s) => {
        s.place(4060, 448);
        s.run('R5');
        until(s, 'R+J');
      },
    ],
    [
      'a held jump off the bough',
      (s) => {
        s.place(3840, 192);
        s.run('R5');
        until(s, 'R+J');
      },
    ],
    [
      'walking off the right branch westward',
      (s) => {
        s.place(4300, 912);
        until(s, 'L');
      },
    ],
  ];

  it('60 start times each: off the root, out of the hollow, down from the catch branch and the bough, off the right branch: no hit on arrival', () => {
    for (const [name, go] of ARRIVALS) {
      for (let k = 0; k < 60; k++) {
        const s = newSim();
        wait(s, k * 31);
        const from = s.events.length;
        go(s);
        // Arrived, she stands and looks (three quarters of a second).
        wait(s, 45);
        // (A held jump off the bough is the glide's lane: it ends on F7 under `lamp-sky`, which dives
        // at one who stands there. That is its encounter, with its own tell; this is about the burrback.)
        const byBurr = s.events.slice(from).filter((e) => e.type === 'hurt' && e.source.kind === 'burrback');
        expect(byBurr.length, `${name}, start ${k * 31}, at ${feet(s).x},${feet(s).y}`).toBe(0);
      }
    }
  });
});

describe('the bark of trunk A is no way up any more: the well leads through the doorway', () => {
  const lamp = (GROVE.lamps ?? []).find((l) => l.id === 'lamp-high') as { x: number; y: number };
  const bridge = GROVE.oneWays.find((o) => o.y === a.y && o.x < a.x);

  it('the geometry: the high ledge still reaches trunk A as a branch; only trunk A’s east face (the shaft’s wall) is a climb', () => {
    const ledge = S.find((r) => r.tag === 'ledge');
    expect(ledge).toMatchObject({ x: 2816, y: 448, w: 160 });
    expect(bridge).toEqual({ tag: 'branch', x: 2976, y: 448, w: 224 });
    expect((bridge?.x ?? 0) + (bridge?.w ?? 0)).toBe(a.x);
    expect([lamp.x, lamp.y]).toEqual([3264, a.y]);
    expect(a.kick).toBe('east');
  });

  it('playtest 5 (a kicker went up the bark and never met lamp-trunk or burr-shaft): a jump at the bark gives no slide and no kick; holding right she walks under it into the shaft, where burr-shaft is', () => {
    for (const [press, beat] of HANDS) {
      const s = newSim();
      s.place(3130, 1280);
      const from = s.events.length;
      // Jump at the bark and keep pressing on her beat, as on any wall: nothing catches.
      let rest = 0;
      let held = 0;
      for (let f = 0; f < 240; f++) {
        let m = RIGHT;
        if (held > 0) {
          m |= J;
          held--;
        } else if (rest > 0) rest--;
        else {
          held = press;
          rest = beat;
        }
        step(s.state, m, s.tuning, s.scene, s.events);
        // Never higher than a jump and a double jump from the well's floor.
        expect(feet(s).y).toBeGreaterThan(a.y + 300);
        if (feet(s).x > a.x + a.w) break;
      }
      const ev = s.events.slice(from);
      const hand = `press ${press}, beat ${beat}`;
      expect(
        ev.some((e) => e.type === 'wallSlideStart'),
        hand,
      ).toBe(false);
      expect(kicks(ev), hand).toBe(0);
      // Through the doorway (its two glints on the way), onto the shaft floor.
      expect(feet(s).x, hand).toBeGreaterThan(a.x + a.w);
      expect(taken(s, 'well-'), hand).toBe(2);
    }
    // The shaft's own wall of the same trunk still takes kicks: wall to wall to trunk A's top.
    const w = newSim({ ...GROVE, enemies: [] });
    w.place(3456, 1280);
    let prev = 0;
    let slidesA = 0;
    for (let f = 0; f < 600 && !(w.state.player.grounded && feet(w).y <= a.y); f++) {
      const p = w.state.player;
      const dir = p.mode === 'wallSlide' ? -p.wallDir : p.facing;
      if (p.mode === 'wallSlide' && p.wallDir < 0) slidesA++;
      const m =
        (dir > 0 ? RIGHT : LEFT) |
        ((p.grounded || p.mode === 'wallSlide') && (prev & J) === 0 ? J : p.vy < 0 ? J : 0);
      step(w.state, m, w.tuning, w.scene, w.events);
      prev = m;
    }
    expect(slidesA).toBeGreaterThan(0);
    expect(feet(w).y).toBeLessThanOrEqual(a.y);
  });

  it('the left route still walks it: the high ledge, the branch, trunk A’s top are one floor', () => {
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(2850, 448);
    s.run('R45');
    expect(feet(s)).toEqual({ x: feet(s).x, y: a.y });
    expect(feet(s).x).toBeGreaterThan(a.x);
    expect(s.state.player.grounded).toBe(true);
  });
});

describe('the way home off the bluff no longer snags F4', () => {
  it('F4 sits 96 px west: a held jump off the west lip never touches it', () => {
    const f4 = S.filter((r) => r.tag === 'floating')[3] as (typeof S)[number];
    expect([f4.x, f4.y, f4.w]).toEqual([1760, 608, 256]);
    for (const [x, run] of [
      [2462, 'L1'],
      [2440, 'L1'],
      [2500, 'L6'],
      [2600, 'L14'],
      [2620, 'L18'],
    ] as const) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(x, 960);
      s.run(run);
      const from = s.events.length;
      let air = false;
      for (let f = 0; f < 400; f++) {
        s.run('L+J1');
        if (!s.state.player.grounded) air = true;
        else if (air) break;
      }
      expect(
        s.events.slice(from).filter((e) => e.type === 'wallSlideStart'),
        `${x} ${run}`,
      ).toEqual([]);
    }
  });
});

describe('a hard landing is a real fall', () => {
  it('a drop off a ledge (up to 416 px) is not hard; 420 px and more is', () => {
    expect(defaultTuning.misc.hardLandFallPx).toBe(420);
    const land = (dropPx: number) => {
      const s = newSim(flatScene({ solids: [{ tag: 'ledge', x: 1000, y: 800 - dropPx, w: 400, h: 32 }] }));
      s.place(1380, 800 - dropPx);
      const ev = s.run('R60');
      const e = ev.find((q) => q.type === 'land');
      if (e?.type !== 'land') throw new Error('no landing');
      return e;
    };
    // (Max fall speed is reached after 160 px: it used to make every ledge drop "hard".)
    expect(land(192)).toMatchObject({ fallPx: 192, hard: false });
    expect(land(320)).toMatchObject({ fallPx: 320, hard: false });
    expect(land(416)).toMatchObject({ fallPx: 416, hard: false });
    expect(land(420)).toMatchObject({ fallPx: 420, hard: true });
    expect(land(640)).toMatchObject({ fallPx: 640, hard: true });
  });
});

describe('the bank has a step (playtest 5: its 192 px wanted a held jump or a kick; 100 ms taps never cleared it)', () => {
  it('a root step 96 px high at its foot: 6-frame taps and she is on the bank, from any run-up', () => {
    const step96 = S.find((r) => r.tag === 'root' && r.x === 384);
    expect(step96).toEqual({ tag: 'root', x: 384, y: 1184, w: 64, h: 96 });
    for (const from of [520, 600, 700, 900]) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(from, 1280);
      const f = push(s, -1, 6, 9, on(s, 1088));
      expect(f, `from ${from}`).toBeGreaterThan(0);
      expect(f, `from ${from}`).toBeLessThan(240);
    }
  });
});
