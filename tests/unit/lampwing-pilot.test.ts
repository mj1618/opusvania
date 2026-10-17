import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { slashBox, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemyState } from '../../src/sim/state';
import { defaultTuning } from '../../src/sim/tuning';
// Staged fights: she carries `LIGHT` glints, or the creatures would not see her (memory/giving.md).
import { feet, hopOnto, litSim as newSim, type Sim } from './helpers';

/**
 * Proof with the real controller and real inputs, in the grove: every lampwing can be killed (from
 * the ground with cuts, in mid-glide, and by pogo); the two over the right zone carry a pogo chain
 * from the summit to the far ledge; none of them can camp on her, trap her or spoil a route.
 */
const { jump: J, attack: A, left: LEFT, right: RIGHT, up: UP, down: DOWN } = ActionBit;
const bit = (d: number) => (d > 0 ? RIGHT : d < 0 ? LEFT : 0);
const all = GROVE.enemies ?? [];
const H = defaultTuning.health;
const L = defaultTuning.lampwing;
const index = (id: string) => {
  const i = all.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`no enemy ${id}`);
  return i;
};
const foe = (s: Sim, id: string) => s.state.enemies[index(id)] as EnemyState;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const tick = (s: Sim, m: number) => {
  const from = s.events.length;
  step(s.state, m, s.tuning, s.scene, s.events);
  return s.events.slice(from);
};
/** Is the lampwing inside the hit area of a slash started now (shrunk by `pad`: it will still be there next frame)? */
function inReach(s: Sim, e: EnemyState, dir: 'fwd' | 'up' | 'down', facing: number, pad = 6): boolean {
  const b = slashBox(s.state.player, dir, facing, s.tuning, 1);
  return b.x + pad < e.x + e.w && e.x < b.x + b.w - pad && b.y + pad < e.y + e.h && e.y < b.y + b.h - pad;
}

/**
 * Stands her ground and waits for it: a cut the moment it drifts into reach (forward either way,
 * or up). Returns the frames it took, or -1.
 */
function standAndCut(s: Sim, id: string, maxFrames = 1500): number {
  let prev = 0;
  for (let f = 0; f < maxFrames; f++) {
    const e = foe(s, id);
    if (e.mode === 'dead') return f;
    const p = s.state.player;
    let m = 0;
    if (p.attackCd === 0 && (prev & A) === 0) {
      if (inReach(s, e, 'fwd', p.facing)) m = A;
      else if (inReach(s, e, 'fwd', -p.facing)) m = bit(-p.facing) | A;
      else if (inReach(s, e, 'up', p.facing)) m = UP | A;
    }
    tick(s, m);
    prev = m;
  }
  return -1;
}

/**
 * The summit route: from trunk B's top, jump, double jump, glide right over the two lampwings and
 * pogo off each in turn (wings closed just long enough to come down on it), then glide on, cutting
 * the one that hangs on the glide line if it is in her way.
 * Returns what happened until she lands.
 */
function pogoRun(s: Sim) {
  s.place(3690, 192);
  const ids = ['lamp-glide-1', 'lamp-glide-2'];
  const hits: string[] = [];
  const log: SimEvent[] = [];
  let prev = 0;
  let k = 0;
  for (let f = 0; f < 600; f++) {
    const p = s.state.player;
    let m = RIGHT | J;
    if (f === 24 || f === 25) m = RIGHT;
    else if (f > 25) {
      while (k < ids.length && foe(s, ids[k] as string).mode === 'dead') k++;
      const e = k < ids.length ? foe(s, ids[k] as string) : undefined;
      if (e) {
        const dx = e.x + e.w / 2 - (p.x + p.w / 2);
        const over = e.y - (p.y + p.h);
        // Toward it; wings closed while she is nearly over it and still too high.
        m = (Math.abs(dx) > 8 ? bit(dx) : 0) | (Math.abs(dx) < 110 && over > 30 ? 0 : J);
        // Rising from a bounce: no fresh jump press (it would spend the double jump she just got back).
        if (hits.length > 0 && p.vy < 0) m = bit(dx);
        if (inReach(s, e, 'down', p.facing, 0) && (prev & A) === 0 && p.attackCd === 0)
          m = bit(dx) | DOWN | A;
      }
      // `lamp-sky` hangs on the glide line to the far bluff (playtest 4) and comes down to her while
      // she works the chain: a cut whenever it drifts into reach (forward, or up), and on through its tumble.
      const sky = foe(s, 'lamp-sky');
      if (sky.mode !== 'dead' && (m & A) === 0 && (prev & A) === 0 && p.attackCd === 0) {
        if (inReach(s, sky, 'fwd', p.facing, 0)) m |= A;
        else if (inReach(s, sky, 'up', p.facing, 0)) m |= UP | A;
      }
    }
    const ev = tick(s, m);
    prev = m;
    log.push(...ev);
    for (const h of of(ev, 'slashHit')) {
      if (h.pogo) hits.push(h.target.id);
      if (h.target.id === ids[k]) k++;
    }
    if (p.grounded && f > 30) break;
  }
  return { hits, log };
}

/**
 * The mid-glide kill of `lamp-ledge`: from trunk A's top, jump, double jump and glide left at it;
 * a forward cut as she reaches it, on through it as it tumbles, then an up cut from under it.
 * She only ever cuts with her wings open.
 */
/** The mid-glide kill: she stops rising once her centre is this far above the lampwing's. */
const LEVEL = 20;
function glideKill(s: Sim) {
  const id = 'lamp-ledge';
  s.place(3264, 448);
  const cuts: string[] = [];
  let prev = 0;
  let landed = false;
  let died = false;
  for (let f = 0; f < 400 && !died && !landed; f++) {
    const p = s.state.player;
    const e = foe(s, id);
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    const dy = e.y + e.h / 2 - (p.y + p.h / 2);
    let m: number;
    if (f < 24) m = LEFT | J;
    else if (f < 26) m = LEFT;
    else {
      // Toward it, wings open; closed while she is far off and well above it, to come down to its height.
      // (Under the higher canopy the double jump would carry her far over it: once she is rising
      // above its height she lets go, which cuts the rise short, then holds again for the wings.)
      const tooHigh = p.vy < 0 && dy > LEVEL;
      m =
        (Math.abs(dx) > 6 ? bit(dx) : 0) | (tooHigh || (dy > 60 && Math.abs(dx) > 150 && p.vy >= 0) ? 0 : J);
      if (p.attackCd === 0 && (prev & A) === 0 && p.gliding) {
        if (dy < -30 && inReach(s, e, 'up', p.facing)) m |= UP | A;
        else if (inReach(s, e, 'fwd', dx < 0 ? -1 : 1, 12)) m |= A;
        else if (inReach(s, e, 'up', p.facing)) m |= UP | A;
      }
    }
    const ev = tick(s, m);
    prev = m;
    for (const h of of(ev, 'slashHit'))
      if (h.target.id === id) cuts.push(`${h.dir}:${s.state.player.gliding ? 'glide' : 'fall'}`);
    if (of(ev, 'enemyDie').some((d) => d.id === id)) died = true;
    if (f > 30 && s.state.player.grounded) landed = true;
  }
  return { cuts, died, landed };
}

describe('lampwings in the grove, piloted', () => {
  it('from the ground: the two over the left islands dive at her and fall to her cuts as they arrive and hang, without a scratch', () => {
    const s = newSim();
    for (const [id, x, y] of [
      ['lamp-glade', 768, 960],
      ['lamp-f3', 1450, 704],
    ] as const) {
      s.place(x, y);
      expect(feet(s)).toEqual({ x, y });
      const from = s.events.length;
      const took = standAndCut(s, id);
      const ev = s.events.slice(from);
      expect(took, id).toBeGreaterThan(0);
      // It noticed her, dived, and died to cuts timed to its arrival and its stall, where she stood.
      expect(
        of(ev, 'enemyNotice').some((n) => n.id === id),
        id,
      ).toBe(true);
      expect(of(ev, 'enemyDive').filter((h) => h.id === id).length, id).toBeGreaterThanOrEqual(1);
      const hits = of(ev, 'enemyHit').filter((h) => h.id === id).length;
      expect(hits === L.hp - 1 || hits === L.hp - 2, id).toBe(true);
      expect(of(ev, 'enemyDie').filter((d) => d.id === id).length, id).toBe(1);
      expect(of(ev, 'hurt'), id).toEqual([]);
      expect([s.state.player.grounded, feet(s).y], id).toEqual([true, y]);
    }
  });

  it('in mid-glide off trunk A: a cut as she reaches the one by the high ledge, and she flies on through its tumble; whenever she sets off', () => {
    let cut = 0;
    let clean = 0;
    let n = 0;
    for (let wait = 0; wait < 2400; wait += 97) {
      const s = newSim();
      // (The ledge's burrback paces the branch by trunk A: out of the way, this is about the flyer.)
      Object.assign(foe(s, 'burr-ledge'), { mode: 'dead', gone: true });
      for (let f = 0; f < wait; f++) tick(s, 0);
      const run = glideKill(s);
      n++;
      if (run.cuts[0]?.endsWith('glide')) cut++;
      if (s.state.player.hp === H.max) clean++;
      expect(s.state.player.hp, `wait ${wait}`).toBeGreaterThanOrEqual(H.max - 1);
    }
    // (Three hit points and a dive of its own now: the kill in one flight is no longer asked for.)
    expect(cut).toBeGreaterThanOrEqual(n - 4);
    expect(clean).toBeGreaterThanOrEqual(15);
  });

  it('the pogo chain: summit to far ledge off the two over the right zone; the third run kills both', () => {
    const s = newSim();
    const first = pogoRun(s);
    // One flight, two bounces, each a lampwing; she comes down on the far bluff's top (y 768 since
    // playtest 4: it was lowered to put the far lantern and the heart in one picture).
    expect(first.hits).toEqual(['lamp-glide-1', 'lamp-glide-2']);
    expect(of(first.log, 'land').length).toBe(1);
    expect(feet(s).y).toBe(768);
    expect(feet(s).x).toBeGreaterThan(5472);
    expect(of(first.log, 'hurt')).toEqual([]);
    expect([foe(s, 'lamp-glide-1').hp, foe(s, 'lamp-glide-2').hp]).toEqual([L.hp - 1, L.hp - 1]);

    // Back on the summit she lets them drift home, then the same again, and again: each third bounce kills.
    s.place(3648, 192);
    for (let f = 0; f < 900; f++) tick(s, 0);
    expect([foe(s, 'lamp-glide-1').mode, foe(s, 'lamp-glide-2').mode]).toEqual(['hover', 'hover']);
    expect(pogoRun(s).hits).toEqual(['lamp-glide-1', 'lamp-glide-2']);
    s.place(3648, 192);
    for (let f = 0; f < 900; f++) tick(s, 0);
    const second = pogoRun(s);
    expect(second.hits).toEqual(['lamp-glide-1', 'lamp-glide-2']);
    expect(
      of(second.log, 'enemyDie')
        .filter((d) => d.id.startsWith('lamp-glide'))
        .map((d) => [d.id, d.slash, d.value]),
    ).toEqual([
      ['lamp-glide-1', 'down', L.value],
      ['lamp-glide-2', 'down', L.value],
    ]);
    expect(of(second.log, 'hurt')).toEqual([]);
    expect(s.state.player.hp).toBe(H.max);
    // Their glints all arrive, each once.
    for (let f = 0; f < 80; f++) tick(s, 0);
    const got = s.events.filter(
      (e) => e.type === 'pickup' && e.enemy && e.id.startsWith('lamp-glide'),
    ).length;
    expect(got).toBe(2 * L.value);
  });

  it('the summit run is robust to when she sets off (the lampwings wander)', () => {
    for (const wait of [0, 97, 333, 1000, 2222]) {
      const s = newSim();
      for (let f = 0; f < wait; f++) tick(s, 0);
      const run = pogoRun(s);
      expect(run.hits, `wait ${wait}`).toEqual(['lamp-glide-1', 'lamp-glide-2']);
      expect([feet(s).y, feet(s).x > 5472], `wait ${wait}`).toEqual([768, true]);
      expect(of(run.log, 'hurt'), `wait ${wait}`).toEqual([]);
    }
  });
});

describe('lampwings in the grove: audit', () => {
  it('no camping: she stands on a small island and never fights; each touch is followed by a long leave', () => {
    for (const [id, x, y] of [
      ['lamp-glade', 768, 960],
      ['lamp-f3', 1450, 704],
    ] as const) {
      const s = newSim();
      s.place(x, y);
      s.state.player.hp = 99;
      const hurts: number[] = [];
      let close = 0;
      let longest = 0;
      let run = 0;
      const N = 3600;
      for (let f = 0; f < N; f++) {
        const ev = tick(s, 0);
        if (of(ev, 'hurt').length) hurts.push(f);
        const e = foe(s, id);
        const p = s.state.player;
        const near = Math.hypot(e.x + e.w / 2 - (p.x + 20), e.y + e.h / 2 - (p.y + 40)) < 90;
        close += near ? 1 : 0;
        run = near ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      // It does come (she is in its sight), but a touch sends it off: rest, home, the tell, the way back.
      expect(hurts.length, id).toBeGreaterThanOrEqual(2);
      const gaps = hurts.slice(1).map((h, i) => h - (hurts[i] as number));
      expect(Math.min(...gaps), id).toBeGreaterThanOrEqual(170);
      // Within arm's reach of her less than a fifth of the time, never for a second at a stretch.
      expect(close / N, id).toBeLessThan(0.2);
      expect(longest, id).toBeLessThan(60);
      // She was knocked about but never off into somewhere she cannot leave: still in control.
      s.state.player.invuln = 1e6;
      for (let f = 0; f < 200 && !s.state.player.grounded; f++) tick(s, 0);
      expect(s.state.player.grounded, id).toBe(true);
    }
  });

  it('an attack is three dives at most (under ten seconds), and then it is gone for more than a second and a half', () => {
    const s = newSim();
    s.place(1450, 704);
    // She cannot be hurt here, so nothing ends the chase early.
    s.state.player.invuln = 1e6;
    const e = () => foe(s, 'lamp-f3');
    const stints: number[] = [];
    const breaks: number[] = [];
    let on = 0;
    let off = 0;
    for (let f = 0; f < 3600; f++) {
      tick(s, 0);
      const m = e().mode;
      if (m === 'curious' || m === 'dive' || m === 'stall' || m === 'pursue') {
        if (on === 0 && off > 0 && stints.length > 0) breaks.push(off);
        on++;
        off = 0;
      } else {
        if (on > 0) stints.push(on);
        on = 0;
        off++;
      }
    }
    expect(stints.length).toBeGreaterThan(3);
    const cycle = L.curiousFrames + L.diveMaxFrames + L.stallFrames + L.pursueFrames;
    expect(Math.max(...stints)).toBeLessThanOrEqual(L.maxDives * cycle);
    expect(Math.max(...stints)).toBeLessThan(600);
    expect(Math.min(...breaks)).toBeGreaterThanOrEqual(100);
  });

  it('a hit anywhere they fly can drop her, never trap her or take her out of the scene', () => {
    // Where each one meets her: island edges on the left, the lip of the high ledge, the open air
    // of the summit glide (she falls to the floor between the root and the right rise).
    for (const [id, x, y, script] of [
      ['lamp-glade', 660, 960, ''],
      ['lamp-f3', 1370, 704, ''],
      ['lamp-ledge', 2840, 448, ''],
      // (The full summit glide now passes far over them. A lazy one, a short hop off the edge
      // and the wings late, flies through their air.)
      ['lamp-glide-1', 3690, 192, 'R+J8 R20 R+J400'],
    ] as const) {
      const s = newSim();
      Object.assign(foe(s, 'burr-ledge'), { mode: 'dead', gone: true });
      s.place(x, y);
      s.state.player.hp = 99;
      let hurt = false;
      let f = 0;
      const inputs = script ? inputsOf(script) : [];
      for (; f < 2400 && !hurt; f++) {
        const ev = tick(s, inputs[f] ?? 0);
        hurt = of(ev, 'hurt').some((h) => h.source.id === id);
        if (script && s.state.player.grounded && f > 40) break;
      }
      expect(hurt, id).toBe(true);
      for (let k = 0; k < 240; k++) {
        tick(s, 0);
        const p = s.state.player;
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(GROVE.width);
        expect(p.y).toBeGreaterThanOrEqual(GROVE.ceilingY ?? 0);
        expect(p.y + p.h).toBeLessThanOrEqual(GROVE.height);
      }
      expect(s.state.player.grounded, id).toBe(true);
      // Still in control, and the way on is open: the nearest island or rise is one hop away.
      s.state.player.invuln = 1e6;
      const at = feet(s);
      const goal = [...GROVE.solids]
        .filter((r) => r.y < at.y && r.y > at.y - 260 && r.x + r.w > at.x - 500 && r.x < at.x + 500)
        .sort((a, b) => Math.abs(a.x + a.w / 2 - at.x) - Math.abs(b.x + b.w / 2 - at.x))[0];
      if (goal) expect(hopOnto(s, goal), `${id}: out of ${at.x},${at.y}`).toBeGreaterThan(0);
      else {
        s.run('J1 .5');
        expect(s.state.player.grounded).toBe(false);
      }
    }
  });
});

function inputsOf(script: string): number[] {
  const out: number[] = [];
  for (const part of script.split(' ')) {
    const m = /^([A-Z+]+)(\d+)$/.exec(part);
    if (!m) continue;
    let mask = 0;
    for (const k of (m[1] as string).split('+'))
      mask |= k === 'R' ? RIGHT : k === 'L' ? LEFT : k === 'J' ? J : 0;
    for (let i = 0; i < Number(m[2]); i++) out.push(mask);
  }
  return out;
}
