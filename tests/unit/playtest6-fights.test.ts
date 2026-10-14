import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemySpawn, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/**
 * Playtest 6, the fights (memory/enemies.md, combat.md, goal.md): the pogo no longer skips the
 * burrback; the masher re-forms at the light nearest to where she fell; the shaft's ram reaches
 * trunk B's bark; lamp-sky does not tell every 2 s at one at the edge of its reach; a blind drop
 * into the shaft is fair; a ram never lands sooner than 80 frames after the last hit.
 *
 * `FIGHT_TRACE=1 npx vitest run tests/unit/playtest6-fights.test.ts --disable-console-intercept`
 * prints the pogo timelines.
 */
const { jump: J, attack: A, left: LEFT, right: RIGHT, down: DOWN } = ActionBit;
const B = defaultTuning.burrback;
const H = defaultTuning.health;
const FLOOR = 800;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const burr = (x: number, facing: -1 | 1 = -1): EnemySpawn => ({
  id: 'b',
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
const flat = (enemies: EnemySpawn[]): Scene => ({ ...flatScene(), enemies });
const only = (s: Sim, id: string) => {
  for (const e of s.state.enemies) if (e.id !== id) Object.assign(e, { mode: 'dead', hp: 0, gone: true });
  const i = s.state.enemies.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`no ${id}`);
  return i;
};
const trace = (name: string, lines: string[]) => {
  if (process.env.FIGHT_TRACE) console.log(`--- ${name}\n${lines.join('\n')}`);
};
const summary = (name: string, r: Bout) => {
  if (process.env.FIGHT_TRACE)
    console.log(
      `${name}: ${(r.frames / 60).toFixed(1)} s, dead ${r.dead}, ${r.hits} hits, ${of(r.events, 'enemyCharge').length} rams, ${of(r.events, 'enemyHit').filter((h) => h.slash === 'down').length + of(r.events, 'enemyDie').filter((h) => h.slash === 'down').length} pogos landed, ${of(r.events, 'enemyBlock').filter((b) => b.slash === 'down').length} glanced`,
    );
};

interface Bout {
  dead: boolean;
  frames: number;
  hits: number;
  events: SimEvent[];
  lines: string[];
}

/**
 * A pogo fight with enemy `i`. `spam`: the POGO SPAMMER (playtest 6's skip): she jumps at it and
 * presses down + attack every time she comes down over it, whatever it is doing. Otherwise the
 * POGO READER: she reads the brace (15 frames) and jumps its ram, pogos it once it stands winded,
 * steers off the curled shell and cuts it forward when it is in reach.
 */
function pogoFight(s: Sim, i: number, spam: boolean, max = 1800): Bout {
  const lines: string[] = [];
  const from = s.events.length;
  let seen = from;
  let prev = 0;
  let readAt = -1;
  let f = 0;
  const foe = () => s.state.enemies[i] as EnemyState;
  for (; f < max && foe().mode !== 'dead' && s.state.player.faded === 0; f++) {
    const p = s.state.player;
    const e = foe();
    const at = feet(s);
    const dx = e.x + e.w / 2 - at.x;
    const side = dx >= 0 ? 1 : -1;
    const gap = Math.abs(dx) - e.w / 2 - p.w / 2;
    for (; seen < s.events.length; seen++) {
      const ev = s.events[seen] as SimEvent;
      if (ev.type === 'enemyWindup') readAt = f + 15;
      if (/^enemy(Windup|Charge|Recover|Block|Hit|Die|Turn)$|^hurt$/.test(ev.type))
        lines.push(
          `${String(f).padStart(4)}  her ${at.x},${at.y}  it ${e.x + e.w / 2} ${e.mode} tuck ${e.tuck}  ${ev.type} ${'cause' in ev ? ev.cause : ''}${'slash' in ev ? ev.slash : ''} ${'hpLeft' in ev ? ev.hpLeft : ''}`,
        );
    }
    // (Her down cut reaches 120 px under her centre and is live from its first frame: she presses it
    // a few frames before the shell is in reach, so it lands while she is still in the air.)
    const over = p.y + p.h / 2 + 120 + 3 * Math.max(0, p.vy) >= e.y && Math.abs(dx) < 50;
    let m = 0;
    if (!p.grounded) {
      if (Math.abs(dx) > 4) m |= dx > 0 ? RIGHT : LEFT;
      if (p.vy < 0 && (prev & J) !== 0) m |= J;
      const open =
        spam || e.braced || (e.mode === 'recover' && e.tuck === 0) || e.mode === 'walk' || e.mode === 'pause';
      // (The reader does not start a down cut she would finish standing in it.)
      const high = spam || e.y - (p.y + p.h) > 24;
      if (p.vy > 0 && over && open && high && (prev & A) === 0 && p.attackCd === 0) m |= DOWN | A;
      // (The reader steers off a curled shell to land beside it.)
      if (!spam && e.tuck > 0 && !e.braced)
        m = (m & ~(LEFT | RIGHT)) | (Math.abs(dx) < 70 ? (dx > 0 ? LEFT : RIGHT) : 0);
    } else if (spam) {
      m = side > 0 ? RIGHT : LEFT;
      if (Math.abs(dx) < 140 && (prev & J) === 0) m |= J;
    } else if (e.braced) {
      if (f >= readAt && (prev & J) === 0) m = J | (side > 0 ? RIGHT : LEFT);
    } else if (e.mode === 'recover' && e.tuck === 0 && gap < 90 && (prev & J) === 0) {
      m = J | (side > 0 ? RIGHT : LEFT);
    } else if (gap > 60) m = side > 0 ? RIGHT : LEFT;
    else {
      if (p.facing !== side) m |= side > 0 ? RIGHT : LEFT;
      if ((prev & A) === 0 && p.attackCd === 0) m |= A;
    }
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  for (; seen < s.events.length; seen++) {
    const ev = s.events[seen] as SimEvent;
    if (ev.type === 'enemyDie' || ev.type === 'hurt') lines.push(`${String(f).padStart(4)}  ${ev.type}`);
  }
  const events = s.events.slice(from);
  return { dead: foe().mode === 'dead', frames: f, hits: of(events, 'hurt').length, events, lines };
}

/** The landed down cuts on it, and how many rams (`enemyCharge`) came between each and the next. */
function pogoExchanges(ev: SimEvent[]): number[] {
  const between: number[] = [];
  let rams = -1;
  for (const e of ev) {
    if (e.type === 'enemyHit' || e.type === 'enemyDie') {
      if (e.slash !== 'down') continue;
      if (rams >= 0) between.push(rams);
      rams = 0;
    } else if (e.type === 'enemyCharge' && rams >= 0) rams++;
  }
  return between;
}

describe('the pogo is an answer, not a skip (playtest 6: four bounces, 1.6-2.6 s, no ram)', () => {
  it('a landed down cut curls it: the next bounce glances (she still bounces), and uncurling it braces at her even over it', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    const s = newSim(flat([burr(2200)]), t);
    s.place(2200, FLOOR - 150);
    const e = s.state.enemies[0] as EnemyState;
    // She hangs over it, a down cut each time she comes down within reach.
    const seen: string[] = [];
    let prev = 0;
    for (let f = 0; f < 150 && seen.length < 4; f++) {
      const p = s.state.player;
      const m = p.vy > 0 && p.y + p.h / 2 + 110 >= e.y && (prev & A) === 0 && p.attackCd === 0 ? DOWN | A : 0;
      const from = s.events.length;
      const braced = e.braced;
      step(s.state, m, s.tuning, s.scene, s.events);
      prev = m;
      for (const ev of s.events.slice(from)) {
        if (ev.type === 'enemyHit') {
          seen.push(`hit ${ev.slash}`);
          expect(e.tuck).toBeGreaterThan(B.tuckFrames - 5);
        } else if (ev.type === 'enemyBlock') {
          seen.push(`glance ${ev.slash}${braced ? ' braced' : ''}`);
          // A glance bounces her all the same.
          expect(s.state.player.vy).toBe(-defaultTuning.attack.pogoSpeed);
        } else if (ev.type === 'enemyWindup') seen.push('brace');
      }
    }
    // Curled: the next glances; uncurling, it braces at her over it; its braced top glances too.
    expect(seen).toEqual(['hit down', 'glance down', 'brace', 'glance down braced']);
    expect(e.hp).toBe(B.hp - 1);
    expect([B.tuckFrames, B.tuckBraceAbovePx]).toEqual([40, 200]);
  });

  it('the spammer meets a ram between every two pogos that land; it takes four times as long as it did', () => {
    const cases: Array<[string, () => { s: Sim; i: number }]> = [];
    for (const facing of [-1, 1] as const)
      for (const from of [2200, 2330, 2450])
        cases.push([
          `open ground from ${from}, it faces ${facing}`,
          () => {
            const s = newSim(flat([burr(2600, facing)]));
            s.place(from, FLOOR);
            return { s, i: 0 };
          },
        ]);
    for (const [id, x] of [
      ['burr-path', 1950],
      ['burr-shaft', 3340],
    ] as const)
      cases.push([
        `the grove, ${id}`,
        () => {
          const s = newSim(GROVE);
          const i = only(s, id);
          s.place(x, (GROVE.enemies ?? [])[i]?.y ?? 0);
          return { s, i };
        },
      ]);
    for (const [name, make] of cases) {
      const { s, i } = make();
      const r = pogoFight(s, i, true);
      trace(`spammer, ${name}`, r.lines);
      summary(`SUMMARY spammer, ${name}`, r);
      const between = pogoExchanges(r.events);
      expect(between.length, name).toBeGreaterThanOrEqual(2);
      expect(Math.min(...between), name).toBeGreaterThanOrEqual(1);
      expect(r.frames, name).toBeGreaterThan(60 * 6);
      expect(of(r.events, 'enemyBlock').filter((b) => b.slash === 'down').length, name).toBeGreaterThan(2);
    }
  });

  it('the pogo reader (jumps the ram, pogos it winded, steers off the curl, cuts what is in reach): no hit, dead', () => {
    for (const facing of [-1, 1] as const)
      for (const from of [2200, 2330, 2450]) {
        const s = newSim(flat([burr(2600, facing)]));
        s.place(from, FLOOR);
        const r = pogoFight(s, 0, false);
        const name = `from ${from}, it faces ${facing}`;
        trace(`pogo reader, ${name}`, r.lines);
        summary(`SUMMARY pogo reader, ${name}`, r);
        expect(r.dead, name).toBe(true);
        expect(r.hits, name).toBe(0);
        expect(
          of(r.events, 'enemyHit').filter((h) => h.slash === 'down').length,
          name,
        ).toBeGreaterThanOrEqual(2);
      }
    // (Not burr-path: the pilot climbs onto the branch over it and never comes down.)
    for (const [id, x] of [
      ['burr-shaft', 3340],
      ['burr-rise', 4800],
    ] as const) {
      const s = newSim(GROVE);
      const i = only(s, id);
      s.place(x, (GROVE.enemies ?? [])[i]?.y ?? 0);
      const r = pogoFight(s, i, false);
      trace(`pogo reader, ${id}`, r.lines);
      summary(`SUMMARY pogo reader, ${id}`, r);
      expect(r.dead, id).toBe(true);
      expect(r.hits, id).toBe(0);
    }
  });
});

describe('the ram carries its last stride into a wall (playtest 6: the shaft was always `spent`, never `wall`)', () => {
  const wall = { tag: 'trunk' as const, x: 2000, y: 500, w: 60, h: 300 };
  const stand = () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    return t;
  };
  it('a ram whose length runs out 1-32 px short of a wall runs on into it (stunned); 40 px short, spent', () => {
    for (const [short, cause] of [
      [1, 'wall'],
      [20, 'wall'],
      [B.chargeCarryPx, 'wall'],
      [40, 'spent'],
    ] as const) {
      // Its box's left edge after a full ram: 2060 + `short`.
      const x = 2060 + short + B.chargePx + 26;
      const s = newSim({ ...flatScene({ solids: [wall] }), enemies: [burr(x)] }, stand());
      s.place(x - 26 - 60, FLOOR);
      s.run('.2');
      s.place(x + 300, FLOOR);
      const ev = s.run('.60');
      expect(of(ev, 'enemyRecover')[0]?.cause, `${short} px short`).toBe(cause);
      if (cause === 'wall') expect(s.state.enemies[0]?.x).toBe(2060);
    }
  });

  it('in the shaft: the careful player`s second exchange (it braces at the doorway`s mouth, facing trunk B) ends in a wall stun', () => {
    // The ram from the mouth: box 3328-3380, 180 px on is 3560: 24 px short of the bark (3584).
    const s = newSim(GROVE);
    const i = only(s, 'burr-shaft');
    const e = s.state.enemies[i] as EnemyState;
    Object.assign(e, { x: 3330, facing: 1, mode: 'walk', roused: 300 });
    s.place(3470, 1280);
    const ev = s.run('.2');
    expect(of(ev, 'enemyWindup')).toHaveLength(1);
    // She hops it.
    const all = s.run('.14 L+J20 .40');
    expect(of(all, 'enemyRecover')[0]).toMatchObject({ cause: 'wall', frames: B.recoverWallFrames });
    expect(e.x + e.w).toBe(3584);
  });
});

describe('a blind drop onto a burrback is fair (playtest 6: from the summit into the shaft, hurt on the frame of its brace)', () => {
  it('from trunk B`s top, every way of stepping off west, at 30 start times: never touched before she is down, and its brace (if any) comes after she has landed', () => {
    let drops = 0;
    for (const hold of [10, 14, 17, 20, 24])
      for (let d = 0; d < 300; d += 10) {
        const s = newSim(GROVE);
        only(s, 'burr-shaft');
        for (let k = 0; k <= d; k++) step(s.state, 0, s.tuning, s.scene, s.events);
        s.place(3640, 192);
        s.run('.2');
        let landed = -1;
        let braced = -1;
        let hurt = -1;
        for (let f = 0; f < 200; f++) {
          const from = s.events.length;
          step(s.state, f < hold ? LEFT : 0, s.tuning, s.scene, s.events);
          const ev = s.events.slice(from);
          if (landed < 0 && of(ev, 'land').length) landed = f;
          if (braced < 0 && of(ev, 'enemyWindup').length) braced = f;
          if (hurt < 0 && of(ev, 'hurt').length) hurt = f;
        }
        const name = `hold ${hold}, start ${d}`;
        if (feet(s).y !== 1280 && hurt < 0) continue;
        drops++;
        expect(landed, name).toBeGreaterThan(0);
        if (braced >= 0) expect(braced, name).toBeGreaterThanOrEqual(landed);
        // Hurt at all only by a ram after the whole tell (she stood still after landing).
        if (hurt >= 0) expect(hurt, name).toBeGreaterThanOrEqual(landed + B.windupFrames);
      }
    expect(drops).toBeGreaterThan(100);
  });

  it('it gets out from under one who drops onto it, and not from under a glider', () => {
    const t = cloneTuning(defaultTuning);
    t.burrback.speed = 0;
    t.burrback.strikePx = 0;
    const s = newSim(flat([burr(2200)]), t);
    s.place(2200, FLOOR - 500);
    const ev = s.run('.80');
    expect(s.state.player.grounded).toBe(true);
    expect(of(ev, 'hurt')).toHaveLength(0);
    // It went the shorter way (left, a tie) at `dropSpeed` and stands clear of where she came down.
    const e = s.state.enemies[0] as EnemyState;
    expect(e.x + e.w).toBeLessThanOrEqual(s.state.player.x - B.dropClearPx);
    // Coming down left of its middle it goes right, and says so (it turns).
    const r = newSim(flat([burr(2200)]), t);
    r.place(2185, FLOOR - 500);
    const rev = r.run('.80');
    expect(of(rev, 'enemyTurn').filter((q) => q.cause === 'drop')).toHaveLength(1);
    expect(r.state.enemies[0]?.x).toBeGreaterThanOrEqual(r.state.player.x + r.state.player.w + B.dropClearPx);
    expect(of(rev, 'hurt')).toHaveLength(0);
    const g = newSim(flat([burr(2200)]), t);
    g.place(2200, FLOOR - 300);
    const gev = g.run('J200');
    expect(of(gev, 'enemyTurn').filter((e) => e.cause === 'drop')).toHaveLength(0);
    expect(of(gev, 'hurt')).toHaveLength(1);
    expect([B.dropPx, B.dropSpeed]).toEqual([300, 3]);
  });
});

describe('a ram never lands sooner than 80 frames after the last hit (playtest 6: 77 on burr-bank)', () => {
  it('the masher and the stander at every burrback of the road and the bank: ram hits come at least invuln + 10 frames after any hit', () => {
    let min = Number.POSITIVE_INFINITY;
    let rams = 0;
    for (const [id, xs] of [
      ['burr-bank', [60, 120, 330]],
      ['burr-path', [1900, 2400]],
      ['burr-shaft', [3340, 3550]],
      ['burr-rise', [4800, 5200]],
    ] as const)
      for (const x of xs)
        for (const wait of [0, 37, 111])
          for (const stop of [0, 20, 70])
            for (const cut of [true, false]) {
              const s = newSim(GROVE);
              const i = only(s, id);
              for (let f = 0; f < wait; f++) step(s.state, 0, s.tuning, s.scene, s.events);
              s.place(x, (GROVE.enemies ?? [])[i]?.y ?? 0);
              s.state.player.hp = 99;
              let last = -1;
              let prev = 0;
              for (let f = 0; f < 700 && s.state.enemies[i]?.mode !== 'dead'; f++) {
                const e = s.state.enemies[i] as EnemyState;
                const p = s.state.player;
                const side = e.x + e.w / 2 < feet(s).x ? -1 : 1;
                const gap = side > 0 ? e.x - (p.x + p.w) : p.x - (e.x + e.w);
                let m = 0;
                if (gap > stop) m = side > 0 ? RIGHT : LEFT;
                else {
                  if (p.facing !== side) m |= side > 0 ? RIGHT : LEFT;
                  if (cut && (prev & A) === 0) m |= A;
                }
                const ram = e.mode === 'charge';
                const from = s.events.length;
                step(s.state, m, s.tuning, s.scene, s.events);
                prev = m;
                if (of(s.events.slice(from), 'hurt').length === 0) continue;
                if (ram && last >= 0) {
                  rams++;
                  min = Math.min(min, f - last);
                }
                last = f;
              }
            }
    expect(rams).toBeGreaterThan(20);
    expect(min).toBeGreaterThanOrEqual(H.invulnFrames + B.rehitGapFrames);
    expect(H.invulnFrames + B.rehitGapFrames).toBe(80);
  });
});

describe('lamp-sky does not tell again and again at one at the edge of its reach (playtest 6: six tells in 12 s, no dive)', () => {
  it('one who dithers round the far bluff and F7 for 12 s: a tell that ends in `far` is not followed by another within `retellFrames` unless she comes well inside', () => {
    const L = defaultTuning.lampwing;
    let fruitless = 0;
    for (const [x, y] of [
      [5300, 1088],
      [5400, 1088],
      [5100, 592],
      [5200, 592],
      [5500, 768],
    ] as const)
      for (const period of [50, 70, 90, 120])
        for (const hold of [6, 12, 20, 30])
          for (const dir of [1, -1]) {
            const s = newSim(GROVE);
            const i = only(s, 'lamp-sky');
            s.place(x, y);
            s.state.player.invuln = 1e9;
            s.state.player.hp = 99;
            let prev = 0;
            let farAt = -1;
            for (let f = 0; f < 720; f++) {
              const p = s.state.player;
              const d = Math.floor(f / 240) % 2 === 0 ? dir : -dir;
              let m = d > 0 ? RIGHT : LEFT;
              if (f % period < hold) m |= J;
              if (p.mode === 'wallSlide' && (prev & J) === 0) m = (p.wallDir > 0 ? LEFT : RIGHT) | J;
              const from = s.events.length;
              step(s.state, m, s.tuning, s.scene, s.events);
              prev = m;
              for (const ev of s.events.slice(from)) {
                if (!('id' in ev) || ev.id !== 'lamp-sky') continue;
                if (ev.type === 'enemyGiveUp' && ev.cause === 'far') {
                  fruitless++;
                  farAt = f;
                }
                if (ev.type === 'enemyNotice' && farAt >= 0 && f - farAt < L.retellFrames) {
                  // Only one who has come well inside its leash.
                  const e = s.state.enemies[i] as EnemyState;
                  const dx = p.x + p.w / 2 - e.homeX;
                  const dy = p.y + p.h / 2 - e.homeY;
                  expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(L.leashPx - L.retellMarginPx);
                }
              }
            }
          }
    expect(fruitless).toBeGreaterThan(10);
    expect([L.retellFrames, L.retellMarginPx]).toEqual([300, 200]);
  });
});
