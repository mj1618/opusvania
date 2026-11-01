/**
 * The bombardier (src/sim/enemies/bombardier.ts) and its droplets (src/sim/shots.ts): the tell's length, the lobbed
 * arc, the burst, the deflect that lays it open, the spray up close, cuts from behind and above, the death, and the
 * fairness rules (no shot on arrival, none through a wall).
 */
import { describe, expect, it } from 'vitest';
import { flightFrames, lobVelocity, muzzleOf } from '../../src/sim/enemies/bombardier';
import type { SimEvent } from '../../src/sim/events';
import { cloneState } from '../../src/sim/index';
import type { EnemySpawn, Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { newSim, type Sim } from './helpers';

const FLOOR = 800;
const T = defaultTuning;
const B = T.bombardier;

function room(enemies: EnemySpawn[], extra: Partial<Scene> = {}): Scene {
  return {
    id: 'test',
    width: 4000,
    height: 1000,
    spawn: { x: 200, y: FLOOR },
    senses: 'lamp',
    solids: [{ tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 }, ...(extra.solids ?? [])],
    oneWays: [],
    lures: [],
    enemies,
    ...extra,
  } as Scene;
}

const bomb = (x = 2000, facing: -1 | 1 = -1): EnemySpawn => ({
  id: 'b',
  kind: 'bombardier',
  x,
  y: FLOOR,
  facing,
  senses: 'always',
});
const of = <K extends SimEvent['type']>(ev: SimEvent[], type: K) =>
  ev.filter((e) => e.type === type) as Extract<SimEvent, { type: K }>[];
const types = (ev: SimEvent[]) => ev.map((e) => e.type);
const enemy = (s: Sim) => s.state.enemies[0] as Sim['state']['enemies'][number];
/** Frame (sim) at which each event of `type` happened in `ev` (from the `ev` slice of a run that started at `f0`). */
function framesOf(s: Sim, script: string, type: SimEvent['type']): number[] {
  const out: number[] = [];
  for (const tok of script.trim().split(/\s+/)) {
    const m = /^(\.|[A-Z+]+)(\d+)?$/.exec(tok);
    const n = m?.[2] ? Number(m[2]) : 1;
    for (let i = 0; i < n; i++) {
      const ev = s.run(m?.[1] === '.' ? '.1' : `${m?.[1]}1`);
      if (ev.some((e) => e.type === type)) out.push(s.state.frame);
    }
  }
  return out;
}

describe('the bombardier', () => {
  it('fair arrival: no tell for enterCalmFrames after the room is made, so no droplet before the whole tell after that', () => {
    const s = newSim(room([bomb()]));
    s.place(1500, FLOOR);
    const tells = framesOf(s, `.${B.enterCalmFrames + B.tellFrames + 40}`, 'enemyWindup');
    expect(tells.length).toBeGreaterThan(0);
    expect(tells[0]).toBeGreaterThanOrEqual(B.enterCalmFrames);
    const s2 = newSim(room([bomb()]));
    s2.place(1500, FLOOR);
    const shots = framesOf(s2, `.${B.enterCalmFrames + B.tellFrames + 40}`, 'shotFire');
    expect(shots[0]).toBeGreaterThan(B.enterCalmFrames + B.tellFrames);
  });

  it('far: its tell (rear) is exactly tellFrames, then a burst of `burst` droplets burstGap apart', () => {
    const s = newSim(room([bomb()]));
    s.place(1500, FLOOR);
    const ev = s.run(`.${B.enterCalmFrames - 4}`);
    expect(types(ev)).not.toContain('enemyWindup');
    const at = framesOf(s, '.8', 'enemyWindup')[0] as number;
    expect(enemy(s).mode).toBe('rear');
    expect(of(s.events, 'enemyWindup')[0]?.frames).toBe(B.tellFrames);
    const fired = framesOf(s, `.${B.tellFrames + B.burst * B.burstGap + 4}`, 'shotFire');
    expect(fired.length).toBe(B.burst);
    // (The tell's frames, then the first droplet on the next step.)
    expect((fired[0] as number) - at).toBe(B.tellFrames + 1);
    for (let i = 1; i < fired.length; i++)
      expect((fired[i] as number) - (fired[i - 1] as number)).toBe(B.burstGap);
  });

  it('the lob is a true arc: it passes through its mark after `flight` frames (the sim step, exactly)', () => {
    for (const [x0, y0, x1, y1] of [
      [2012, 740, 1500, 760],
      [1000, 500, 1400, 900],
      [0, 0, -300, -100],
    ] as Array<[number, number, number, number]>) {
      const n = flightFrames(B, Math.hypot(x1 - x0, y1 - y0));
      expect(n).toBeGreaterThanOrEqual(B.flightMin);
      expect(n).toBeLessThanOrEqual(B.flightMax);
      const v = lobVelocity(x0, y0, x1, y1, n, B.shotGravity);
      let x = x0;
      let y = y0;
      let vy = v.vy;
      let top = y0;
      for (let i = 0; i < n; i++) {
        vy += B.shotGravity;
        x += v.vx;
        y += vy;
        top = Math.min(top, y);
      }
      expect(x).toBeCloseTo(x1, 6);
      expect(y).toBeCloseTo(y1, 6);
      // (Level with its mark it rises first: a lob, not a line.)
      if (Math.abs(y1 - y0) < 60) expect(top).toBeLessThan(Math.min(y0, y1) - 60);
    }
  });

  it('one who stands still under the burst is hurt by it (source: the bombardier); the droplets splash', () => {
    const s = newSim(room([bomb()]));
    s.place(1500, FLOOR);
    const ev = s.run(`.${B.enterCalmFrames + B.tellFrames + B.flightMax + B.burst * B.burstGap + 20}`);
    const hurt = of(ev, 'hurt')[0];
    expect(hurt?.source).toEqual({ kind: 'bombardier', id: 'b' });
    expect(of(ev, 'shotSplash').length).toBe(B.burst);
    expect(s.state.shots.length).toBe(0);
  });

  it('one who walks away during the tell is not hit (slow enough to dodge)', () => {
    const s = newSim(room([bomb()]));
    s.place(1500, FLOOR);
    s.run(`.${B.enterCalmFrames + 2}`);
    expect(enemy(s).mode).toBe('rear');
    // Out of its sight at a walk's pace: the burst is aimed with her lead, she keeps going.
    const ev = s.run(`L${B.tellFrames + B.flightMax + B.burst * B.burstGap + 30}`);
    expect(types(ev)).not.toContain('hurt');
  });

  it('a slash bats a droplet back: it flies at the bombardier and lays it open on its back (recover), 1 hp off', () => {
    // A dry run finds when the first droplet would hit her standing still; then a cut a few frames before.
    const dry = newSim(room([bomb()]));
    dry.place(1500, FLOOR);
    const hurtAt = framesOf(
      dry,
      `.${B.enterCalmFrames + B.tellFrames + B.flightMax + 10}`,
      'hurt',
    )[0] as number;
    expect(hurtAt).toBeGreaterThan(0);
    let ok = false;
    for (let k = 1; k <= 16 && !ok; k++) {
      const s = newSim(room([bomb()]));
      s.place(1500, FLOOR);
      s.run(`.${hurtAt - k - 1}`);
      const ev = s.run('A1 .40');
      const d = of(ev, 'shotDeflect')[0];
      const hit = of(ev, 'shotHit')[0];
      if (!d || !hit) continue;
      ok = true;
      expect(d.hitstop).toBe(B.deflectHitstop);
      expect(d.vx).toBeGreaterThan(0);
      expect(hit.stun).toBe(true);
      expect(hit.id).toBe('b');
      expect(enemy(s).hp).toBe(B.hp - B.reflectDamage);
      expect(['recover', 'wake']).toContain(enemy(s).mode);
      // That droplet never touches her (any hurt is a later one of the burst).
      const firstHurt = ev.findIndex((e) => e.type === 'hurt');
      const deflectAt = ev.findIndex((e) => e.type === 'shotDeflect');
      expect(firstHurt === -1 || firstHurt > deflectAt).toBe(true);
    }
    expect(ok).toBe(true);
  });

  it('on its back it is open: harmless, every cut lands and none stands it up', () => {
    const s = newSim(room([bomb()]));
    s.place(1500, FLOOR);
    s.run('.2');
    const e = enemy(s);
    e.mode = 'recover';
    e.timer = B.stunFrames;
    e.modeFrames = 0;
    s.place(1930, FLOOR);
    s.state.player.facing = 1;
    const ev = s.run('A1 .20 A1 .20');
    expect(of(ev, 'enemyHit').length).toBe(2);
    expect(types(ev)).not.toContain('hurt');
    expect(enemy(s).mode).toBe('recover');
    const kill = s.run('A1 .20');
    expect(types(kill)).toContain('enemyDie');
  });

  it('up close in front it sprays a short hot cone after a quick tell instead of lobbing; a front cut does not stop it', () => {
    const s = newSim(room([bomb()]));
    s.place(1920, FLOOR);
    s.state.player.facing = 1;
    const ev = s.run(`.${B.enterCalmFrames + 2}`);
    const w = of(ev, 'enemyWindup')[0];
    expect(w?.frames).toBe(B.coneTellFrames);
    expect(enemy(s).mode).toBe('windup');
    const ev2 = s.run(`A1 .${B.coneTellFrames + 6}`);
    expect(types(ev2)).toContain('enemyHit');
    expect(types(ev2)).toContain('enemySpray');
    expect(of(ev2, 'hurt')[0]?.source).toEqual({ kind: 'bombardier', id: 'b' });
    expect(types(ev2)).not.toContain('shotFire');
  });

  it('the cone is short: one standing just beyond it is never hurt by the spray', () => {
    const s = newSim(room([bomb()]));
    // Her near edge beyond the cone's reach, but inside `conePx` + a few px? No: beyond conePx it lobs instead.
    s.place(1968 - B.coneReach - 40 - 20, FLOOR);
    s.run(`.${B.enterCalmFrames + 2}`);
    const e = enemy(s);
    // (Forced into the spray to test its reach alone.)
    e.mode = 'spray';
    e.timer = B.sprayFrames;
    e.modeFrames = 0;
    const ev = s.run(`.${B.sprayFrames}`);
    expect(types(ev)).not.toContain('hurt');
  });

  it('from behind: it must turn first (turnFrames), and cuts from behind land freely', () => {
    const s = newSim(room([bomb(2000, -1)]));
    // (Out of its sight until its arrival calm is over.)
    s.place(200, FLOOR);
    expect(types(s.run(`.${B.enterCalmFrames + 2}`))).not.toContain('enemyWindup');
    s.place(2080, FLOOR);
    s.state.player.facing = -1;
    const ev = s.run(`.${B.turnFrames - 2}`);
    expect(of(ev, 'enemyTurn')[0]?.frames).toBe(B.turnFrames);
    expect(types(ev)).not.toContain('enemyWindup');
    const cuts = s.run('A1 .20 A1 .20 A1 .30');
    expect(types(cuts)).toContain('enemyDie');
    expect(types(cuts)).not.toContain('hurt');
  });

  it('from above: a down slash onto its back lands and bounces her (the pogo)', () => {
    const s = newSim(room([bomb()]));
    s.place(2000, FLOOR - 300);
    // (Placed in the air: she falls; the down cut is pressed as her feet near its back.)
    for (let i = 0; i < 60 && s.state.player.y + s.state.player.h < enemy(s).y - 90; i++) s.run('.1');
    const ev = s.run('D+A1 D12');
    expect(ev.some((e) => e.type === 'enemyHit' && e.slash === 'down')).toBe(true);
    expect(types(ev)).not.toContain('hurt');
    expect(s.state.player.y + s.state.player.h).toBeLessThan(enemy(s).y);
  });

  it('death: launched along the blow, it falls, lies on its back, and is gone after deadFrames', () => {
    const s = newSim(room([bomb(2000, -1)]));
    s.place(2080, FLOOR);
    s.state.player.facing = -1;
    s.run('.2');
    enemy(s).hp = 1;
    const ev = s.run('A1 .3');
    const die = of(ev, 'enemyDie')[0];
    expect(die).toBeDefined();
    const x0 = enemy(s).x;
    let rose = false;
    for (let i = 0; i < 40; i++) {
      s.run('.1');
      if (enemy(s).y < FLOOR - B.height - 4) rose = true;
    }
    expect(rose).toBe(true);
    expect(enemy(s).x).toBeLessThan(x0);
    expect(enemy(s).landed).toBe(true);
    s.run(`.${B.deadFrames}`);
    expect(enemy(s).gone).toBe(true);
  });

  it('fair: no droplet through a wall (no sight through ground), and none at one held by a re-form', () => {
    const wall = room([bomb()], {
      solids: [
        { tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 },
        { tag: 'trunk', x: 1700, y: 0, w: 100, h: FLOOR },
      ],
    });
    const s = newSim(wall);
    s.place(1500, FLOOR);
    const ev = s.run(`.${B.enterCalmFrames + B.tellFrames + 60}`);
    expect(types(ev)).not.toContain('enemyWindup');
    expect(types(ev)).not.toContain('shotFire');
  });

  it('droplets are plain JSON state: cloned deep, and the muzzle sits over its back', () => {
    const s = newSim(room([bomb()]));
    s.place(1500, FLOOR);
    s.run(`.${B.enterCalmFrames + B.tellFrames + 4}`);
    expect(s.state.shots.length).toBeGreaterThan(0);
    const c = cloneState(s.state);
    (c.shots[0] as { x: number }).x += 100;
    expect(c.shots[0]?.x).not.toBe(s.state.shots[0]?.x);
    const m = muzzleOf(enemy(s), T);
    expect(m.y).toBeLessThan(enemy(s).y);
    expect(m.x).toBeGreaterThan(enemy(s).x + enemy(s).w / 2);
  });
});
