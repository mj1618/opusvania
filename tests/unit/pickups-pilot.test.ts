import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { pickupsWorth } from '../../src/sim/pickups';
import type { Pickup } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim, wallClimb } from './helpers';

/**
 * Proof that every glint in the grove can be gathered with the real controller.
 *
 * Each group of pickups has a station: a place to stand that the route pilots in scene.test.ts
 * already prove reachable (the ground, a platform top). From there a simple pilot goes for each
 * pickup with real physics: runs toward it, jumps when it is overhead (off the edge with coyote
 * time if the ground ends first), double-jumps at the apex if still short. The shaft glints are
 * taken by the wall-jump pilot, the one on the tall trunk after the route pilot's hop onto it. If you move a rect or a pickup and one becomes unreachable, this
 * names it.
 */
const J = ActionBit.jump;
const bit = (d: number) => (d > 0 ? ActionBit.right : d < 0 ? ActionBit.left : 0);
const list = GROVE.pickups ?? [];
const T = defaultTuning.pickups;
const tallTrunk = GROVE.solids.filter((r) => r.tag === 'trunk')[1] ?? { x: 0, y: 0, w: 0 };

/** Runs an input script until she lands (or it ends). */
function hold(s: Sim, script: string): void {
  let air = false;
  for (const part of script.split(' ')) {
    const m = /^(.+?)(\d+)$/.exec(part);
    if (!m) throw new Error(`bad script ${part}`);
    for (let i = 0; i < Number(m[2]); i++) {
      s.run(`${m[1]}1`);
      if (!s.state.player.grounded) air = true;
      else if (air) return;
    }
  }
}

/** Goes for pickup `i` from wherever the player stands. Returns frames taken, or -1. */
function seek(s: Sim, i: number, maxFrames = 300): number {
  const p = list[i] as Pickup;
  let prev = 0;
  for (let f = 0; f < maxFrames; f++) {
    if (s.state.pickups.timers[i] !== 0) return f;
    const b = s.state.player;
    const at = feet(s);
    const dx = p.x - at.x;
    // How far the pickup is above the middle of the body.
    const need = at.y - b.h / 2 - p.y;
    let m = Math.abs(dx) > 6 ? bit(dx) : 0;
    if (need > b.h / 2) {
      const trigger = Math.min(240, Math.max(40, need * 0.8));
      const fresh = (prev & J) === 0;
      if (b.grounded) m |= Math.abs(dx) < trigger && fresh ? J : 0;
      else if (b.vy < 0) m |= J;
      else if (b.coyote > 0 && fresh) m |= J;
      else if (b.dj > 0 && fresh && p.y < b.y) m |= J;
    }
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  return -1;
}

/** Stations: feet positions on surfaces the route pilots reach. Pickup ids start with the key. */
const STATIONS: Array<[prefix: string, x: number, y: number]> = [
  ['spawn-', 1120, 1280],
  // (Giving rounds 2-3: the pool's glints are east of burr-path now, so she meets it dark after the
  // first lantern; none on the bluff's west end (a ghost coming back west is not lit right over it):
  // one over the east lip, the arc down to the terrace, two on the terrace.)
  ['pool-arc-', 2760, 1152],
  ['pool-', 2900, 1152],
  // (Round 4: the bank's two are on the far bluff's top by lantern-far (the no-pod ghost was 2 short), F1's
  // two on F2: she crosses the bank and F1 dark, past a sleeping burrback and a roosting lampwing.)
  ['bank-', 5530, 768],
  ['f1-', 1136, 832],
  ['f3-', 1150, 832],
  ['f4-', 1480, 704],
  ['ledge-', 2480, 528],
  ['crown-', 3260, 448],
  ['branch-', 2060, 1280],
  ['rise-', 2250, 1024],
  ['root-', 4080, 1184],
  ['f6-', 4460, 912],
  ['far-', 5180, 592],
  ['cliff-', 5380, 1088],
  ['shaft-', 3300, 448],
  ['great-bank', 330, 1088],
  ['great-crown', 3260, 448],
  // (At trunk B's foot, east of burr-shaft's patch: the middle of the shaft floor is its ground now.)
  ['great-arch', 3562, 1280],
  ['great-far', 5540, 768],
  ['great-hang', 1984, 1280],
  // (The ember the crown lantern wants: on F3, over the first lantern.)
  ['great-ember', 1380, 704],
  ['hollow-', 3780, 1376],
  // (The leap's line is flown in layout-pilot.test.ts; from the terrace under it each is a hop.)
  ['leap-', 2800, 1152],
];

describe('gathering every glint in the grove', () => {
  it('stations stand on something', () => {
    for (const [prefix, x, y] of STATIONS) {
      const s = newSim();
      s.place(x, y);
      s.run('.2');
      expect(s.state.player.grounded, `station for ${prefix}`).toBe(true);
      expect(feet(s), `station for ${prefix}`).toEqual({ x, y });
    }
  });

  it('all 73 can be collected: 66 glints and 7 great ones (one of them the ember over F3), worth 101', () => {
    const s = newSim();
    const missed: string[] = [];
    // The wall-jump shaft first: the climb itself passes through its glints.
    s.place(3456, 1280);
    expect(wallClimb(s, 448, -1)).toBeGreaterThanOrEqual(2);
    // The two in the doorway under trunk A (they hung on its bark until playtest 5: the bark is no
    // way up any more): a walk from the well into the shaft.
    s.place(3130, 1280);
    s.run('R24 .30');
    // The two up trunk B's east face (the way back west): a climb of one wall, a kick at a time.
    for (const [x, y, dir, top] of [[3780, 1376, -1, 192]] as const) {
      s.place(x, y);
      let prev = 0;
      for (let f = 0; f < 600 && !(s.state.player.grounded && feet(s).y === top); f++) {
        const b = s.state.player;
        const press = (b.grounded || b.mode === 'wallSlide') && (prev & J) === 0;
        const m = bit(dir) | (press || (!b.grounded && b.vy < 0 && (prev & J) !== 0) ? J : 0);
        step(s.state, m, s.tuning, s.scene, s.events);
        prev = m;
      }
      expect(feet(s).y, `climb from ${x},${y}`).toBe(top);
    }
    for (const [prefix, x, y] of STATIONS) {
      list.forEach((p, i) => {
        if (!p.id.startsWith(prefix) || s.state.pickups.timers[i] !== 0) return;
        s.place(x, y);
        // The crown is one hop further: from trunk A's top onto trunk B's, as the route pilot does.
        if (p.id === 'great-crown') hopOnto(s, tallTrunk);
        if (seek(s, i) < 0) missed.push(p.id);
      });
    }
    // The line in the sky over the right zone: the summit glide (jump, double jump at the top, hold)
    // gathers all of it in one flight and comes down on the far bluff's top.
    s.place(3684, 192);
    hold(s, 'R+J28 R1 R+J400');
    expect(feet(s).y).toBe(768);
    // Let the last ones arrive.
    s.run(`.${T.greatFrames + 30}`);
    list.forEach((p, i) => {
      if (s.state.pickups.timers[i] !== -1 && !missed.includes(p.id)) missed.push(p.id);
    });
    expect(missed).toEqual([]);
    expect(list).toHaveLength(73);
    expect(s.state.pickups.taken).toBe(73);
    // (The stations are teleports into creatures' patches and this pilot never fights: if their rams
    // fade her on the way, a third of the wallet lies where she fell. Gathered is what counts.
    // (And a lantern she runs past with its price catches behind her now: that is spent, not missing.)
    const w = s.state.pickups;
    expect(w.count + w.lost + w.spent).toBe(101);
    expect(pickupsWorth(GROVE, T)).toBe(101);
  });

  it('the sky line needs the wings: the same flight without them gathers none of its far half', () => {
    const sky = (s: Sim) =>
      list.filter(
        (p, i) => (p.id.startsWith('sky-') || p.id === 'great-sky') && s.state.pickups.timers[i] !== 0,
      );
    const glide = newSim({ ...GROVE, enemies: [] });
    glide.place(3684, 192);
    hold(glide, 'R+J28 R1 R+J400');
    expect(sky(glide).map((p) => p.id)).toHaveLength(7);
    const t = cloneTuning(defaultTuning);
    t.assists.glide = false;
    const fall = newSim({ ...GROVE, enemies: [] }, t);
    fall.place(3684, 192);
    hold(fall, 'R+J28 R1 R+J400');
    // (The first three hang on the jump and the double jump themselves.)
    expect(sky(fall).map((p) => p.id)).toEqual(['sky-1', 'sky-2', 'sky-3']);
    // Nor does a dash at the top of the double jump reach the great one (it is 160 px short).
    const dash = newSim({ ...GROVE, enemies: [] }, t);
    dash.place(3684, 192);
    hold(dash, 'R+J28 R1 R+J20 R+X1 R200');
    expect(sky(dash).some((p) => p.id === 'great-sky')).toBe(false);
  });
});
