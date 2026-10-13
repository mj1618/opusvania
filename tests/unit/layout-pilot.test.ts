import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim, wallClimb } from './helpers';

/**
 * The layout's set pieces, flown and walked with the real controller (memory/playfield.md has the
 * map): the bluff in the floor path and the ways off it, the hollow, the far ledge without a
 * guard. If a rect or a glint moves and one of these stops working, the failing case names it.
 */
const S = GROVE.solids;
const ground = S.filter((r) => r.tag === 'ground');
const bluff = ground[3] as (typeof S)[number];
const terrace = ground[4] as (typeof S)[number];
const lanterns = GROVE.lanterns ?? [];
const list = GROVE.pickups ?? [];
const taken = (s: Sim, prefix: string) =>
  list.filter((p, i) => p.id.startsWith(prefix) && s.state.pickups.timers[i] !== 0).length;
const hurts = (ev: SimEvent[]) => ev.filter((e) => e.type === 'hurt').length;
const wait = (s: Sim, n: number) => {
  for (let f = 0; f < n; f++) step(s.state, 0, s.tuning, s.scene, s.events);
};

/** Holds an input until she has been in the air and stands still on something again (or `max` frames). */
function until(s: Sim, input: string, max = 600): number {
  let air = false;
  for (let f = 0; f < max; f++) {
    s.run(`${input}1`);
    if (!s.state.player.grounded) air = true;
    else if (air) return f;
  }
  return -1;
}

describe('the bluff: a rise in the floor path that must be climbed', () => {
  it('is 320 px over the path: a jump falls short, the branch or a double jump gets her up', () => {
    expect([bluff.x, bluff.y, bluff.w]).toEqual([2432, 960, 192]);
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(2300, 1280);
    s.run('R+J60 R30');
    expect(feet(s).y).toBe(1280);
    expect(hopOnto(s, bluff)).toBeGreaterThan(0);
  });

  it('the way home: jump off its west lip and hold; the wings carry her over the burrback and the whole pool to the first lantern', () => {
    const stone = lanterns[0] as { x: number; y: number };
    // Whether she jumps from a standstill at the lip or at the end of a run-up.
    for (const runUp of ['L1', 'L4', 'L14']) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(runUp === 'L1' ? bluff.x + 30 : bluff.x + 168, bluff.y);
      s.run(runUp);
      expect(until(s, 'L+J'), runUp).toBeGreaterThan(0);
      // (An early jump can clip the tip of the branch on the way down: still holding, she walks
      // off it and the wings open again.)
      if (feet(s).y !== stone.y) expect(until(s, 'L+J'), runUp).toBeGreaterThan(0);
      // Dry, past the pool's west lip, within a few steps of the lantern.
      expect(feet(s).y, runUp).toBe(stone.y);
      expect(feet(s).x, runUp).toBeLessThan(1536);
      expect(Math.abs(feet(s).x - stone.x), runUp).toBeLessThan(120);
      wait(s, 60);
      // The trail: every glint over the pool, in the one flight.
      expect(taken(s, 'pool-arc-'), runUp).toBe(5);
      expect(s.events.filter((e) => e.type === 'glideStart').length, runUp).toBeGreaterThanOrEqual(1);
    }
    // Without the wings the same inputs drop her on the far bank or in the water.
    const t = cloneTuning(defaultTuning);
    t.assists.glide = false;
    const q = newSim({ ...GROVE, enemies: [] }, t);
    q.place(bluff.x + 168, bluff.y);
    q.run('L14');
    until(q, 'L+J');
    if (feet(q).y === 1024) until(q, 'L+J');
    expect(feet(q).x).toBeGreaterThan(1536);
    expect(taken(q, 'pool-arc-')).toBeLessThan(5);
  });

  it('a jump and a double jump from its top reach F5: a short cut up to the high ledge', () => {
    const f5 = S.filter((r) => r.tag === 'floating')[4];
    if (!f5) throw new Error('no F5');
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(bluff.x + 96, bluff.y);
    expect(hopOnto(s, f5)).toBeGreaterThan(0);
  });

  it('the terrace under its east lip has no patrol: however she comes down, whenever, nothing is there to land on', () => {
    expect((GROVE.enemies ?? []).filter((e) => e.kind === 'burrback' && e.y === terrace.y)).toEqual([]);
    for (let k = 0; k < 12; k++) {
      for (const input of ['R', 'R+J']) {
        const s = newSim();
        wait(s, k * 37);
        s.place(bluff.x + bluff.w - 40, bluff.y);
        const from = s.events.length;
        until(s, input, 200);
        wait(s, 20);
        expect(hurts(s.events.slice(from)), `start ${k * 37}, ${input}`).toBe(0);
      }
    }
  });
});

/**
 * The leap (playtest 2: "the glide is not discovered"): the bluff's onward side. Any hold opens the
 * wings there: a jump still held as she runs off the lip, a held jump from the lip, a held kick up
 * the west wall. They carry her down a line of four glints, over the terrace, onto trunk A's bark;
 * she slides down it into the well at its foot, where the wayside lamp stands. A plain fall lands
 * on the terrace under the line and walks there.
 */
describe('the leap: off the bluff eastward, the wings carry her to the lamp at the trunk', () => {
  const lamp = (GROVE.lamps ?? [])[0] as { id: string; x: number; y: number };
  const typesOf = (ev: SimEvent[]) => ev.map((e) => e.type);

  it('jump still held as she runs off the lip: wings at once, all four glints, the bark, the lamp', () => {
    expect([lamp.id, lamp.x, lamp.y]).toEqual(['lamp-trunk', 3160, 1280]);
    // From anywhere on the top: a hop on the spot with jump held, then right, still holding.
    for (const x of [2450, 2500, 2560]) {
      const s = newSim();
      s.place(x, bluff.y);
      s.run('J56');
      expect(feet(s)).toEqual({ x, y: bluff.y });
      const from = s.events.length;
      let glide = 0;
      for (let f = 0; f < 200 && !(s.state.player.grounded && feet(s).y === lamp.y); f++) {
        s.run('R+J1');
        if (s.state.player.gliding) glide++;
      }
      const ev = s.events.slice(from);
      // The wings opened as she left the edge and held for most of a second.
      const start = ev.find((e) => e.type === 'glideStart');
      expect(start && Math.abs(start.x - (bluff.x + bluff.w)) < 60, `from ${x}`).toBe(true);
      expect(glide, `from ${x}`).toBeGreaterThan(40);
      // The bark of trunk A caught her, she slid down it, and stands in the well at the lamp.
      expect(typesOf(ev), `from ${x}`).toContain('wallSlideStart');
      expect(typesOf(ev)).not.toContain('headBump');
      expect(hurts(ev)).toBe(0);
      expect(feet(s).y).toBe(lamp.y);
      expect(Math.abs(feet(s).x - lamp.x), `from ${x}`).toBeLessThan(44);
      expect(ev.filter((e) => e.type === 'lampNotice')).toHaveLength(1);
      wait(s, 60);
      expect(taken(s, 'leap-'), `from ${x}`).toBe(4);
    }
  });

  it('carrying 8 she kindles the lamp where the slide set her down, without another step', () => {
    const s = newSim();
    s.state.pickups.count = 4;
    s.place(2560, bluff.y);
    s.run('J56');
    for (let f = 0; f < 200 && !(s.state.player.grounded && feet(s).y === lamp.y); f++) s.run('R+J1');
    wait(s, 90);
    expect(s.state.goal.lamps[0]?.lit).toBe(true);
    expect(s.state.pickups.spent).toBe(8);
  });

  it('a held jump from the lip and a held kick up the west wall end the same way; a plain fall does not', () => {
    // A held jump from the lip: the wings open late (16 px under the lip), then the bark.
    const j = newSim();
    j.place(bluff.x + bluff.w - 30, bluff.y);
    j.run('R3');
    const fj = j.events.length;
    for (let f = 0; f < 200 && !(j.state.player.grounded && feet(j).y === lamp.y); f++) j.run('R+J1');
    expect(typesOf(j.events.slice(fj))).toEqual(expect.arrayContaining(['glideStart', 'wallSlideStart']));
    expect(Math.abs(feet(j).x - lamp.x)).toBeLessThan(44);
    // What a first-timer does at the west wall: jump at it, jump again (a kick), and keep holding.
    const k = newSim({ ...GROVE, enemies: [] });
    k.place(2380, 1280);
    k.run('R+J22 R1');
    const fk = k.events.length;
    let glide = 0;
    for (let f = 0; f < 260 && !(k.state.player.grounded && feet(k).y === lamp.y); f++) {
      k.run('R+J1');
      if (k.state.player.gliding) glide++;
    }
    expect(glide).toBeGreaterThan(50);
    expect(typesOf(k.events.slice(fk))).toContain('wallSlideStart');
    expect(Math.abs(feet(k).x - lamp.x)).toBeLessThan(44);
    // No hold: she drops onto the terrace 170 px out, under the line, with the first two of the four.
    const p = newSim();
    p.place(bluff.x + bluff.w - 40, bluff.y);
    until(p, 'R', 200);
    expect(feet(p).y).toBe(terrace.y);
    expect(feet(p).x).toBeLessThan(2850);
    wait(p, 60);
    expect(taken(p, 'leap-')).toBeLessThanOrEqual(2);
    // And without the wings the held run-off is that same fall.
    const t = cloneTuning(defaultTuning);
    t.assists.glide = false;
    const q = newSim(GROVE, t);
    q.place(2500, bluff.y);
    q.run('J56');
    until(q, 'R+J', 200);
    expect(feet(q).y).toBe(terrace.y);
  });
});

describe('the hollow: a real dip in the floor', () => {
  const hollow = ground[6] as (typeof S)[number];
  it('running in is harmless and one jump gets her out either way; a jump from the rim clears it', () => {
    expect([hollow.x, hollow.y, hollow.w]).toEqual([3744, 1376, 224]);
    const s = newSim({ ...GROVE, enemies: [] });
    // (From the strip of floor at trunk B's east foot: the trunk closes the floor west of it.)
    s.place(3734, 1280);
    s.run('R30');
    expect(feet(s).y).toBe(hollow.y);
    wait(s, 40);
    expect(taken(s, 'hollow-')).toBe(3);
    const root = S.find((r) => r.tag === 'root');
    if (!root) throw new Error('no root');
    expect(hopOnto(s, root)).toBeGreaterThan(0);
    s.place(hollow.x + 100, hollow.y);
    expect(hopOnto(s, ground[5] as (typeof S)[number])).toBeGreaterThan(0);
    // From the west rim one held jump clears it: onto the root, or over it.
    s.place(3734, 1280);
    until(s, 'R+J');
    expect(feet(s).x).toBeGreaterThan(root.x);
    expect(feet(s).y).toBeLessThanOrEqual(1280);
  });
});

describe('the far bluff (the old far ledge) has no guard', () => {
  it('a full held running jump from F7 lands safe, whenever she sets off (it used to land on a burrback 55 times in 60)', () => {
    const far = ground[9];
    if (!far) throw new Error('no far bluff');
    for (let k = 0; k < 60; k++) {
      const s = newSim();
      wait(s, k * 31);
      s.place(5080, 592);
      const from = s.events.length;
      s.run('R16 R+J60 R30 .60');
      expect(feet(s).y, `start ${k * 31}`).toBe(far.y);
      expect(hurts(s.events.slice(from)), `start ${k * 31}`).toBe(0);
    }
  });
});

/**
 * The wall-jump shaft (playtest 2: "the entry is a trap"). Both trunks come down to 112 px over
 * the floor, so the gap under each is a low doorway, not a ceiling at jump height, and their walls
 * start within a short hop of the ground. The terrace stops 128 px short of trunk A (the well).
 */
describe('the shaft entry: a jump at either trunk from the floor catches a wall', () => {
  const [a, b] = S.filter((r) => r.tag === 'trunk') as [(typeof S)[number], (typeof S)[number]];
  const FLOOR = 1280;
  /** Runs a script; frames spent wall sliding, head bumps, and the wall she first caught (-1 west, 1 east, 0 none). */
  function attempt(s: Sim, script: string) {
    const from = s.events.length;
    let slide = 0;
    for (const part of script.split(' ')) {
      const m = /^(.+?)(\d+)$/.exec(part);
      if (!m) throw new Error(part);
      for (let i = 0; i < Number(m[2]); i++) {
        s.run(`${m[1]}1`);
        if (s.state.player.mode === 'wallSlide') slide++;
      }
    }
    const ev = s.events.slice(from);
    const first = ev.find((e) => e.type === 'wallSlideStart');
    return {
      slide,
      bumps: ev.filter((e) => e.type === 'headBump').length,
      wall: first && first.type === 'wallSlideStart' ? first.dir : 0,
    };
  }

  it('the geometry: a doorway 112 px high under trunk A, trunk B to the floor, a 256 px shaft, a well before trunk A', () => {
    expect([a.x, a.y, a.w, a.y + a.h]).toEqual([3200, 448, 128, 1168]);
    // (Playtest 3: trunk B stands on the floor now. One doorway, under trunk A: the way in and back out.)
    expect([b.x, b.y, b.w, b.y + b.h]).toEqual([3584, 192, 128, FLOOR]);
    expect(FLOOR - (a.y + a.h)).toBe(112);
    expect(FLOOR - (a.y + a.h)).toBeGreaterThan(defaultTuning.body.height + 24);
    // Nothing overhead at jump height anywhere on the approach: the only undersides are the two
    // doorways, a hop of 32 px under them (no one mistakes those for a way up).
    expect([terrace.x + terrace.w, terrace.y]).toEqual([3072, 1152]);
    expect(a.x - (terrace.x + terrace.w)).toBe(128);
  });

  it('from anywhere on the shaft floor, toward either trunk, a real jump (14 frames held or more) ends in a slide', () => {
    for (const dir of ['R', 'L']) {
      for (const hold of [14, 22, 30]) {
        // (Not from the 20 px right under a doorway: that is walking out, not jumping at a trunk.)
        for (let x = a.x + a.w + 40; x <= b.x - 40; x += 6) {
          const s = newSim({ ...GROVE, enemies: [] });
          s.place(x, FLOOR);
          const r = attempt(s, `${dir}+J${hold} ${dir}60`);
          const at = `${dir} from ${x}, held ${hold}`;
          expect(r.bumps, at).toBe(0);
          expect(r.wall, at).toBe(dir === 'R' ? 1 : -1);
          expect(r.slide, at).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  it('a running jump from outside: off the terrace she slides down trunk A into the well; from the east down trunk B', () => {
    // Running east along the terrace, jump pressed at any moment before the well: no head bump, a slide.
    // (A jump pressed down in the well bumps the doorway 32 px up: that is the doorway, not a trap.)
    for (let k = 0; k <= 20; k++) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(2860, terrace.y);
      const r = attempt(s, `R${k} R+J22 R80`);
      expect(r.bumps, `jump at frame ${k}`).toBe(0);
      expect(r.slide, `jump at frame ${k}`).toBeGreaterThanOrEqual(8);
    }
    // Running west from beyond the hollow.
    for (let k = 0; k <= 40; k += 2) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(4000, FLOOR);
      const r = attempt(s, `L${k} L+J22 L80`);
      expect(r.bumps, `jump at frame ${k}`).toBe(0);
      expect(r.slide, `jump at frame ${k}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('then the kick: slide, jump, and three kicks later she is on trunk A; the doorway is walked through both ways', () => {
    const s = newSim({ ...GROVE, enemies: [] });
    // In from the terrace on foot: down into the well, under trunk A, into the shaft.
    s.place(3000, terrace.y);
    const from = s.events.length;
    s.run('R60');
    expect(feet(s)).toEqual({ x: feet(s).x, y: FLOOR });
    expect(feet(s).x).toBeGreaterThan(a.x + a.w);
    expect(s.events.slice(from).some((e) => e.type === 'headBump')).toBe(false);
    s.place(3456, FLOOR);
    expect(wallClimb(s, a.y, -1)).toBe(3);
    expect(feet(s).y).toBe(a.y);
    // There is no way out the other side: trunk B's bark stops her, with the great glint at its foot.
    s.place(3456, FLOOR);
    s.run('R40 .70');
    expect(feet(s).x).toBe(b.x - 20);
    expect(taken(s, 'great-arch')).toBe(1);
    // Back out west on foot.
    s.run('L60');
    expect(feet(s).x).toBeLessThan(a.x);
    // Out of the well westward is one jump.
    s.place(3120, FLOOR);
    expect(hopOnto(s, terrace)).toBeGreaterThan(0);
  });
});

/**
 * The summit (playtest 2: "a 128 px target at the end of a jump + double jump at full run speed").
 * A bough runs 192 px east from trunk B's top at the same height (a one-way: 320 px to land on),
 * and a catch branch hangs 256 px under it for whoever still overshoots.
 */
describe('the summit: arriving is forgiving', () => {
  const [a, b] = S.filter((r) => r.tag === 'trunk') as [(typeof S)[number], (typeof S)[number]];
  const bough = GROVE.oneWays.find((o) => o.y === b.y);
  const catcher = GROVE.oneWays.find((o) => o.y === a.y && o.x > b.x);

  it('the geometry: bough flush with the top, catch branch one jump below, reaching past the bough', () => {
    expect(bough).toEqual({ tag: 'branch', x: 3712, y: 192, w: 192 });
    expect(catcher).toEqual({ tag: 'branch', x: 3808, y: 448, w: 320 });
    expect((bough?.x ?? 0) - (b.x + b.w)).toBe(0);
    expect((catcher?.y ?? 0) - b.y).toBeLessThan(defaultTuning.shape.jumpHeightPx);
  });

  it('every jump + double jump from trunk A that carries east lands on the top, the bough or the catch branch: 720 ways, none falls', () => {
    const where: Record<string, number> = {};
    for (let x = a.x + 10; x <= a.x + a.w - 8; x += 22) {
      for (const h1 of [8, 14, 22, 30]) {
        for (const gap of [1, 6, 12]) {
          for (const h2 of [4, 12, 30]) {
            for (const steer of ['R', '.', 'L']) {
              const s = newSim();
              s.place(x, a.y);
              let air = false;
              for (const part of `R6 R+J${h1} R${gap} R+J${h2} ${steer}240`.split(' ')) {
                const m = /^(.+?)(\d+)$/.exec(part);
                if (!m) throw new Error(part);
                for (let i = 0; i < Number(m[2]); i++) {
                  s.run(`${m[1]}1`);
                  if (!s.state.player.grounded) air = true;
                  else if (air) break;
                }
                if (air && s.state.player.grounded) break;
              }
              const at = feet(s);
              const k =
                at.y === b.y
                  ? at.x < b.x + b.w
                    ? 'top'
                    : 'bough'
                  : at.y === a.y && at.x > b.x
                    ? 'catch'
                    : at.x < b.x + b.w
                      ? 'short (trunk A, or down the shaft and out under a doorway)'
                      : 'fell east';
              where[k] = (where[k] ?? 0) + 1;
            }
          }
        }
      }
    }
    expect(where['fell east'] ?? 0).toBe(0);
    // Most arrive; the rest came up short (a tap for a double jump, or steering back) into the shaft.
    expect((where.top ?? 0) + (where.bough ?? 0)).toBeGreaterThan(400);
    expect(where.bough ?? 0).toBeGreaterThan(50);
    expect(where.catch ?? 0).toBeGreaterThan(0);
  });

  it('from the catch branch the summit is one held jump up through the bough, or a jump and a double jump', () => {
    if (!bough || !catcher) throw new Error('no bough');
    const s = newSim();
    s.place(3860, catcher.y);
    s.run('J40 .20');
    expect(feet(s)).toEqual({ x: 3860, y: bough.y });
    const q = newSim();
    q.place(4100, catcher.y);
    expect(hopOnto(q, b)).toBeGreaterThan(0);
    // The lampwing over the glide path takes no notice of her on either.
    for (const [x, y] of [
      [4108, catcher.y],
      [3884, bough.y],
    ] as const) {
      const w = newSim();
      w.place(x, y);
      const from = w.events.length;
      wait(w, 900);
      expect(w.events.slice(from).filter((e) => e.type === 'enemyNotice' || e.type === 'hurt')).toEqual([]);
    }
  });

  it('the summit glide still sets off from the lantern, and the take-off from the bough reaches the far ledge too', () => {
    const far = ground[9] as (typeof S)[number];
    for (const x of [3684, 3860]) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(x, b.y);
      s.run('R+J28 R1');
      until(s, 'R+J', 500);
      expect(feet(s).y, `from ${x}`).toBe(far.y);
      expect(feet(s).x, `from ${x}`).toBeGreaterThan(far.x);
    }
  });
});

/** First-timers (playtest 2's naive run): what the obvious inputs do now. */
describe('naive players', () => {
  const typesOf = (ev: SimEvent[]) => ev.map((e) => e.type);

  it('"runs right and cuts what is in the way": the pod at the moth-stone stops her at the first lantern and pays for it', () => {
    const s = newSim();
    const pods = GROVE.pods ?? [];
    const i = pods.findIndex((p) => p.id === 'pod-stone');
    const pod = pods[i] as { x: number };
    // Run until the pod is a blade's length ahead, then cut until it bursts, then just stand.
    let prev = 0;
    let f = 0;
    for (; f < 400 && s.state.pods.hp[i] !== 0; f++) {
      const dx = pod.x - feet(s).x;
      const m = dx > 90 ? ActionBit.right : (prev & ActionBit.attack) === 0 ? ActionBit.attack : 0;
      step(s.state, m, s.tuning, s.scene, s.events);
      prev = m;
    }
    expect(s.state.pods.hp[i]).toBe(0);
    wait(s, 100);
    const ev = s.events;
    // Noticed on the way in (short). Standing there cutting she may be told the price (4 of 12);
    // then the pod's ten land and it catches: lit within five seconds of her first step.
    const notice = ev.find((e) => e.type === 'lanternNotice');
    expect(notice && notice.type === 'lanternNotice' && notice.have < notice.need).toBe(true);
    const kindle = ev.findIndex((e) => e.type === 'lanternKindle');
    const refuse = ev.findIndex((e) => e.type === 'lanternRefuse');
    expect(kindle).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(kindle);
    expect(s.state.goal.lanterns[0]?.lit).toBe(true);
    expect(s.state.frame).toBeLessThan(300);
    expect(s.state.pickups.count).toBe(1);
    expect(hurts(ev)).toBe(0);
  });

  it('"cuts the pod and runs on at once" (playtest 3: the lantern stayed dark): it catches behind her as the pod\'s glints land', () => {
    const pods = GROVE.pods ?? [];
    const i = pods.findIndex((p) => p.id === 'pod-stone');
    const pod = pods[i] as { x: number };
    const s = newSim();
    let prev = 0;
    for (let f = 0; f < 400 && s.state.pods.hp[i] !== 0; f++) {
      const m =
        pod.x - feet(s).x > 90 ? ActionBit.right : (prev & ActionBit.attack) === 0 ? ActionBit.attack : 0;
      step(s.state, m, s.tuning, s.scene, s.events);
      prev = m;
    }
    const burst = s.state.frame;
    // Not a frame of waiting: right held from the burst on, into the pool.
    const ev = s.run('R60');
    const k = ev.find((e) => e.type === 'lanternKindle');
    expect(k).toMatchObject({ id: 'lantern-stone', pledged: true, away: true });
    expect(s.state.goal.lanterns[0]?.litFrame).toBeLessThanOrEqual(burst + 40);
    expect(feet(s).x).toBeGreaterThan(1600);
  });

  it('she is at the lantern whether she starts cutting 54 px from the pod or at the end of her reach (132)', () => {
    // (Nearer than that she ends up standing in the pod, past the lantern: noticed, not kindled.)
    const pods = GROVE.pods ?? [];
    const i = pods.findIndex((p) => p.id === 'pod-stone');
    const pod = pods[i] as { x: number };
    for (let d = 54; d <= 134; d += 8) {
      const s = newSim();
      let prev = 0;
      for (let f = 0; f < 400 && s.state.pods.hp[i] !== 0; f++) {
        const m =
          pod.x - feet(s).x > d ? ActionBit.right : (prev & ActionBit.attack) === 0 ? ActionBit.attack : 0;
        step(s.state, m, s.tuning, s.scene, s.events);
        prev = m;
      }
      wait(s, 100);
      expect(s.state.goal.lanterns[0]?.lit, `cut from ${d} px`).toBe(true);
    }
  });

  it('"holds right and taps jump": the first lantern notices her, the pool is crossed, the bluff stops her unhurt', () => {
    const s = newSim();
    for (let i = 0; i < 30; i++) s.run('R34 R+J6');
    const ev = s.events;
    expect(
      ev.filter((e) => e.type === 'lanternNotice').map((e) => (e.type === 'lanternNotice' ? e.id : '')),
    ).toEqual(['lantern-stone']);
    // At the foot of the bluff (a tap is not a climb): burr-path keeps 116 px off that wall now.
    expect(feet(s).x).toBeGreaterThan(2300);
    expect(feet(s).x).toBeLessThan(bluff.x);
    const late = ev.filter((e) => e.type === 'hurt' && e.x > 2330);
    expect(late).toEqual([]);
  });

  it('"walks into the step she cannot walk up": at the right rise that is the wayside lamp, and it starts to catch', () => {
    const lamp = (GROVE.lamps ?? [])[1] as { id: string; x: number; y: number };
    expect([lamp.id, lamp.x, lamp.y]).toEqual(['lamp-root', 4566, 1280]);
    const s = newSim({ ...GROVE, enemies: [] });
    s.state.pickups.count = 9;
    s.place(4300, 1280);
    const from = s.events.length;
    s.run('R45');
    // Pressed against the rise, not moving: she is at the lamp and the channel is running.
    expect(feet(s).x).toBe(4588);
    expect(s.state.player.kindlingLamp).toBe(1);
    s.run('R30');
    expect(typesOf(s.events.slice(from))).toEqual(
      expect.arrayContaining(['lampNotice', 'lampChannel', 'lampKindle']),
    );
    // With too little it says so instead (she is standing still against the wall).
    const q = newSim({ ...GROVE, enemies: [] });
    q.state.pickups.count = 3;
    q.place(4300, 1280);
    q.run('R60');
    expect(q.events.filter((e) => e.type === 'lampRefuse')).toHaveLength(1);
  });
});

describe('safe ground seen working: burr-root and the lamp on its ground', () => {
  const lamp = (GROVE.lamps ?? [])[1] as { id: string; x: number; y: number };
  const foes = GROVE.enemies ?? [];
  const idx = foes.findIndex((e) => e.id === 'burr-root');
  const G = defaultTuning.goal;

  it('dormant: its patrol reaches the lamp, in plain view along 450 px of flat ground', () => {
    const s = newSim();
    s.state.player.invuln = 1e9;
    let hi = 0;
    for (let f = 0; f < 1800; f++) {
      step(s.state, 0, s.tuning, s.scene, s.events);
      const e = s.state.enemies[idx];
      if (e) hi = Math.max(hi, e.x + e.w);
    }
    expect(hi).toBeGreaterThan(lamp.x);
  });

  it('kindling it under the creature costs her nothing; lit, the creature turns 110 px short of it for good and she can stand there', () => {
    const s = newSim();
    s.state.pickups.count = 8;
    // Wait for it to come to the wall end of its walk, then stand at the lamp in its way.
    for (let f = 0; f < 2000; f++) {
      const e = s.state.enemies[idx];
      if (e && e.facing > 0 && e.x + e.w > lamp.x - 140) break;
      step(s.state, 0, s.tuning, s.scene, s.events);
    }
    s.place(lamp.x, lamp.y);
    const from = s.events.length;
    wait(s, 60);
    expect(s.state.goal.lamps[1]?.lit).toBe(true);
    let nearest = 9e9;
    for (let f = 0; f < 3600; f++) {
      step(s.state, 0, s.tuning, s.scene, s.events);
      const e = s.state.enemies[idx];
      if (e && f > 200) nearest = Math.min(nearest, lamp.x - (e.x + e.w));
    }
    const ev = s.events.slice(from);
    expect(hurts(ev)).toBe(0);
    expect(s.state.player.hp).toBe(4);
    expect(nearest).toBeGreaterThanOrEqual(G.sanctuaryPx);
    expect(ev.filter((e) => e.type === 'enemyTurn' && e.cause === 'lantern').length).toBeGreaterThan(3);
    // It still has room to walk.
    const e = s.state.enemies[idx];
    expect(e?.mode).not.toBe('dead');
  });
});
