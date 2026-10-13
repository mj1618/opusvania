import { describe, expect, it } from 'vitest';
import { defaultBindings } from '../../src/input/bindings';
import { formatInputScript, parseInputScript } from '../../src/input/script';
import { GROVE, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, hashState, slashBox, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { podsWorth } from '../../src/sim/pods';
import type { Pod, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

const A = defaultTuning.attack;
const PODS = defaultTuning.pods;
const FLOOR = 800;
const names = (ev: SimEvent[]) =>
  ev
    .filter((e) => e.type !== 'step' && e.type !== 'apex')
    .map((e) =>
      e.type === 'slash' ? `slash:${e.dir}` : e.type === 'slashEnd' ? `slashEnd:${e.reason}` : e.type,
    );
const only = (ev: SimEvent[], ...types: string[]) =>
  names(ev).filter((n) => types.includes(n.split(':')[0] ?? ''));
const sit = (x: number, id = `p${x}`): Pod => ({ id, x, y: FLOOR - PODS.radius, mount: 'sit' });
const at = (x: number, y: number, id = `p${x}`): Pod => ({ id, x, y, mount: 'hang' });
const scene = (pods: Pod[], extra: Partial<Pick<Scene, 'solids' | 'oneWays'>> = {}): Scene => ({
  ...flatScene(extra),
  pods,
});
/** Runs a script one frame at a time, calling `each` after every step. */
function frames(s: Sim, script: string, each: (ev: SimEvent[]) => void): void {
  for (const m of parseInputScript(script)) {
    const from = s.events.length;
    step(s.state, m, s.tuning, s.scene, s.events);
    each(s.events.slice(from));
  }
}
const flip = (t: string) => t.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L'));

describe('input: the attack button', () => {
  it('is a seventh action: `A` in the DSL, C / J on the keyboard, X on a pad', () => {
    expect(ActionBit.attack).toBe(64);
    expect(parseInputScript('A1 R+A2 .1')).toEqual([64, 66, 66, 0]);
    expect(parseInputScript('attack*1 up+attack')).toEqual([64, 68]);
    expect(formatInputScript([64, 66, 66, 0])).toBe('A1 R+A2 .1');
    const b = defaultBindings();
    expect(b.keys.attack).toEqual(['KeyC', 'KeyJ']);
    expect(b.pad.attack).toEqual([2]);
    const all = Object.values(b.keys).flat();
    expect(new Set(all).size).toBe(all.length);
    const pad = Object.values(b.pad).flat();
    expect(new Set(pad).size).toBe(pad.length);
  });
});

describe('thorn slash', () => {
  it('timing: live one frame after the press for six frames, over after fourteen', () => {
    const s = newSim(scene([]));
    const live: number[] = [];
    let end = -1;
    let f = 0;
    frames(s, 'A1 .30', (ev) => {
      const p = s.state.player;
      if (f === 0) {
        expect(names(ev)).toEqual(['slash:fwd']);
        expect([p.attack, p.attackFrames, p.attackActive, p.attackSeq]).toEqual(['fwd', 0, false, 1]);
      }
      if (p.attackActive) live.push(f);
      if (names(ev).includes('slashEnd:done')) end = f;
      if (p.attack !== 'none') expect(p.attackFrames).toBe(f);
      f++;
    });
    expect(live).toEqual([1, 2, 3, 4, 5, 6]);
    expect(end).toBe(A.durationFrames);
    expect(s.state.player.attack).toBe('none');
    expect([A.startupFrames, A.activeFrames, A.durationFrames, A.cooldownFrames]).toEqual([1, 6, 14, 20]);
  });

  it('cadence: mashing gives a slash every cooldown, an early press is buffered, a stale one is not', () => {
    const s = newSim(scene([]));
    const starts: number[] = [];
    let f = 0;
    frames(s, Array.from({ length: 45 }, () => 'A1 .1').join(' '), (ev) => {
      if (names(ev).some((n) => n.startsWith('slash:'))) starts.push(f);
      f++;
    });
    expect(starts).toEqual([0, 20, 40, 60, 80]);
    // A press is good for `bufferFrames` frames, its own included: 7 frames early still chains on
    // the first possible frame...
    const early = A.cooldownFrames - A.bufferFrames + 1;
    const b = newSim(scene([]));
    const ev = b.run(`A1 .${early - 1} A1 .${A.bufferFrames - 2}`);
    expect(only(ev, 'slash')).toHaveLength(1);
    expect(only(b.run('.1'), 'slash')).toEqual(['slash:fwd']);
    expect(b.state.frame).toBe(A.cooldownFrames + 1);
    // ...and one frame earlier than that is dropped.
    const c = newSim(scene([]));
    expect(only(c.run(`A1 .${early - 2} A1 .30`), 'slash')).toHaveLength(1);
  });

  it('never locks movement: she runs, turns and jumps through a slash, which keeps its direction', () => {
    const still = newSim(scene([]));
    const swing = newSim(scene([]));
    const script = ['R10', 'R1', 'L6', 'L+J8', '.20'];
    const withA = ['R10', 'R+A1', 'L6', 'L+J8', '.20'];
    for (let i = 0; i < script.length; i++) {
      still.run(script[i] as string);
      swing.run(withA[i] as string);
      const a = still.state.player;
      const b = swing.state.player;
      expect([b.x, b.y, b.vx, b.vy, b.facing, b.motion]).toEqual([a.x, a.y, a.vx, a.vy, a.facing, a.motion]);
      if (i === 2) expect([b.attack, b.attackFacing, b.facing]).toEqual(['fwd', 1, -1]);
    }
  });

  it('directions: forward by default, Up = up, Down = down only in the air, a held side turns it', () => {
    const dirOf = (setup: string, press: string) => {
      const s = newSim(scene([]));
      s.run(setup);
      const e = s.run(press).find((x) => x.type === 'slash');
      return e?.type === 'slash' ? `${e.dir}${e.facing}` : 'none';
    };
    expect(dirOf('.1', 'A1')).toBe('fwd1');
    expect(dirOf('.1', 'L+A1')).toBe('fwd-1'); // pressed together with a turn: it goes the new way
    expect(dirOf('L5 .5', 'A1')).toBe('fwd-1');
    expect(dirOf('.1', 'U+A1')).toBe('up1');
    expect(dirOf('.1', 'D+A1')).toBe('fwd1'); // on the ground Down does nothing to it
    expect(dirOf('.1', 'U+D+A1')).toBe('up1');
    expect(dirOf('J12', 'D+A1')).toBe('down1');
    expect(dirOf('J12', 'U+A1')).toBe('up1');
    expect(dirOf('J12', 'L+A1')).toBe('fwd-1');
  });

  it('hit area: 110 ahead, a little behind, 88 tall; up and down reach 84 past head and feet', () => {
    const body = { x: 1980, y: 720, w: 40, h: 80 };
    expect(slashBox(body, 'fwd', 1, A)).toEqual({ x: 1986, y: 708, w: 124, h: 88 });
    expect(slashBox(body, 'fwd', -1, A)).toEqual({ x: 1890, y: 708, w: 124, h: 88 });
    expect(slashBox(body, 'up', 1, A)).toEqual({ x: 1950, y: 636, w: 100, h: 124 });
    expect(slashBox(body, 'down', -1, A)).toEqual({ x: 1950, y: 760, w: 100, h: 120 });
    // Against real pods (44 across): the last px that connects and the first that does not.
    const hit = (pod: Pod, script: string) => {
      const s = newSim(scene([pod]));
      s.run(script);
      return s.state.pods.burst === 1;
    };
    const reach = A.fwdReach + PODS.radius;
    expect(hit(sit(2000 + reach - 1), 'A1 .8')).toBe(true);
    expect(hit(sit(2000 + reach), 'A1 .8')).toBe(false);
    // Facing left (a tap of Left moves her a few px first: measure where she ends up).
    const twin = newSim(scene([]));
    twin.run('L1 .9');
    const cx = feet(twin).x;
    expect(hit(sit(cx - reach + 1), 'L1 .9 A1 .8')).toBe(true);
    expect(hit(sit(cx - reach), 'L1 .9 A1 .8')).toBe(false);
    expect(hit(sit(2000 - A.fwdBack - PODS.radius + 1), 'A1 .8')).toBe(true); // just behind her
    expect(hit(sit(2000 - A.fwdBack - PODS.radius), 'A1 .8')).toBe(false);
    // Standing, the up slash tops out 84 above her head (y 636).
    expect(hit(at(2000, 636 - PODS.radius + 1), 'U+A1 .8')).toBe(true);
    expect(hit(at(2000, 636 - PODS.radius), 'U+A1 .8')).toBe(false);
    expect(hit(at(2000 + 50 + PODS.radius, 700), 'U+A1 .8')).toBe(false);
    // A pod on the ground is in reach of a forward slash but not of an up slash.
    expect(hit(sit(2080), 'U+A1 .8')).toBe(false);
  });

  it('a hit: slashHit, hitstop that holds her and the slash, then a small recoil', () => {
    const s = newSim(scene([sit(2090, 'pod')]));
    expect(names(s.run('A1'))).toEqual(['slash:fwd']);
    const ev = s.run('.1');
    expect(names(ev)).toEqual(['slashHit', 'podBurst']);
    const hit = ev[0];
    if (hit?.type !== 'slashHit') throw new Error('no hit');
    expect(hit).toMatchObject({ x: 2090, y: 778, dir: 'fwd', facing: 1, px: 2000, py: 760, pogo: false });
    expect(hit.target).toEqual({ kind: 'pod', id: 'pod' });
    expect(hit.hitstop).toBe(PODS.hitstopFrames);
    const p = s.state.player;
    expect([p.hitstop, p.kickX, p.vx, p.attackHits, p.attackFrames]).toEqual([2, -A.recoilFwd, 0, 1, 1]);
    // Hitstop: the frame count runs, she and her clocks do not.
    const frame0 = s.state.frame;
    const frozen = { ...p };
    for (let i = PODS.hitstopFrames; i > 0; i--) {
      expect(names(s.run('.1'))).toEqual([]);
      expect(s.state.player).toEqual({ ...frozen, hitstop: i - 1 });
    }
    expect(s.state.frame).toBe(frame0 + PODS.hitstopFrames);
    // Then the recoil plays out: 3 + 2 + 1 px back, gone in three frames.
    const xs: number[] = [];
    frames(s, '.4', () => xs.push(s.state.player.x));
    expect(xs).toEqual([1977, 1975, 1974, 1974]);
    expect(s.state.player.attackFrames).toBe(5);
    expect([s.state.player.vx, s.state.player.kickX]).toEqual([0, 0]);
    expect(only(s.run('.20'), 'slashEnd', 'slashHit')).toEqual(['slashEnd:done']);
  });

  it('presses during hitstop are buffered, not lost', () => {
    const s = newSim(scene([sit(2090)]));
    s.run('A1 .1');
    expect(s.state.player.hitstop).toBe(2);
    expect(names(s.run('J1 .1'))).toEqual([]);
    expect(names(s.run('.1'))).toEqual(['jump']);
  });

  it('running through a pod barely slows her', () => {
    const s = newSim(scene([sit(2500)]));
    s.run('R38 R+A1 R1');
    expect(s.state.pods.burst).toBe(1);
    const x0 = s.state.player.x;
    s.run(`R${PODS.hitstopFrames + 10}`);
    // Ten frames of running after the hitstop, less the 6 px shove: her own speed never dropped.
    expect(s.state.player.vx).toBeCloseTo(defaultTuning.run.maxSpeed);
    expect(s.state.player.x - x0).toBe(96 - 6);
  });

  it('one hit per target per slash, however long they overlap', () => {
    const t = cloneTuning(defaultTuning);
    t.pods.hp = 2;
    const s = newSim(scene([sit(2060, 'near'), sit(2100, 'far')]), t);
    const first = s.run('A1 .19');
    expect(only(first, 'slashHit', 'podBurst')).toEqual(['slashHit', 'slashHit']);
    expect(s.state.pods.hp).toEqual([1, 1]);
    const end = first.find((e) => e.type === 'slashEnd');
    expect(end?.type === 'slashEnd' && end.hits).toBe(2);
    const second = s.run('A1 .19');
    expect(only(second, 'slashHit', 'podBurst')).toEqual(['slashHit', 'podBurst', 'slashHit', 'podBurst']);
    expect(s.state.pods.hp).toEqual([0, 0]);
    // An open pod is not a target any more.
    expect(only(s.run('A1 .19'), 'slashHit')).toEqual([]);
  });

  it('a pod that drifts into a live slash is hit on that frame, not only on the first', () => {
    const s = newSim(scene([sit(2000 + A.fwdReach + PODS.radius + 30)]));
    let hitAt = -1;
    frames(s, 'R+A1 R8', (ev) => {
      if (names(ev).includes('slashHit')) hitAt = s.state.player.attackFrames;
    });
    expect(hitAt).toBeGreaterThan(A.startupFrames);
    expect(hitAt).toBeLessThan(A.startupFrames + A.activeFrames);
  });

  it('dash: no slash during it; a press in the dash fires as it ends; a dash cuts a slash', () => {
    const s = newSim(scene([]));
    const ev: string[] = [];
    let slashAt = -1;
    let endAt = -1;
    let f = 0;
    frames(s, 'X1 .3 A1 .20', (e) => {
      ev.push(...names(e));
      if (names(e).includes('dashEnd')) endAt = f;
      if (names(e).includes('slash:fwd')) slashAt = f;
      if (s.state.player.mode === 'dash') expect(s.state.player.attack).toBe('none');
      f++;
    });
    expect(ev.slice(0, 3)).toEqual(['dashStart', 'dashEnd', 'slash:fwd']);
    expect(slashAt).toBe(endAt + 1);
    // Pressed together: the dash goes first, the slash right after it.
    const both = newSim(scene([]));
    expect(names(both.run('X+A1 .16'))).toEqual(['dashStart', 'dashEnd', 'slash:fwd']);
    // A dash during a slash ends it.
    const cut = newSim(scene([]));
    expect(names(cut.run('A1 .3 X1 .20'))).toEqual(['slash:fwd', 'slashEnd:dash', 'dashStart', 'dashEnd']);
  });

  it('wall slide: the slash goes away from the wall', () => {
    const s = newSim(scene([], { solids: [{ tag: 'trunk', x: 2200, y: 0, w: 100, h: 800 }] }));
    s.run('R+J30 R14');
    expect(s.state.player.mode).toBe('wallSlide');
    const e = s.run('R+A1').find((x) => x.type === 'slash');
    expect(e?.type === 'slash' && [e.dir, e.facing]).toEqual(['fwd', -1]);
    expect(s.state.player.mode).toBe('wallSlide');
  });

  it('glide: slashing does not close the wings', () => {
    const s = newSim(scene([at(2300, 420)]));
    s.run('R+J28 R1 R+J40');
    expect(s.state.player.gliding).toBe(true);
    const ev = s.run('R+J+A1 R+J30');
    expect(names(ev)).toEqual(['slash:fwd', 'slashEnd:done']);
    expect(s.state.player.gliding).toBe(true);
    const up = s.run('R+J+U+A1 R+J22');
    expect(only(up, 'slash', 'glideEnd')).toEqual(['slash:up']);
    // Down is the fast fall: the down slash closes them, as Down alone does.
    expect(only(s.run('J+D+A1 J+D3'), 'slash', 'glideEnd')).toEqual(['slash:down', 'glideEnd']);
  });

  it('pogo: a down slash that hits bounces her about 125 px and refills dash and double jump', () => {
    const spend = 'J28 .1 J20 X1 .13'; // spend the double jump and the air dash, then fall
    const twin = newSim(scene([]));
    twin.run(spend);
    const s = newSim(scene([sit(feet(twin).x)]));
    s.run(spend);
    expect([s.state.player.dj, s.state.player.airDash, s.state.player.grounded]).toEqual([0, 0, false]);
    while (feet(s).y < FLOOR - 110) s.run('.1');
    const ev = s.run('D+A1 D1');
    const hit = ev.find((e) => e.type === 'slashHit');
    expect(hit?.type === 'slashHit' && hit.pogo).toBe(true);
    const p = s.state.player;
    expect(p.vy).toBe(-A.pogoSpeed);
    expect([p.dj, p.airDash]).toEqual([1, 1]);
    const hitY = feet(s).y;
    let top = hitY;
    let up = 0;
    frames(s, '.40', () => {
      if (s.state.player.vy < 0) up++;
      top = Math.min(top, feet(s).y);
    });
    expect(hitY - top).toBeGreaterThan(115);
    expect(hitY - top).toBeLessThan(135);
    expect(up - PODS.hitstopFrames).toBeGreaterThanOrEqual(16);
    expect(up - PODS.hitstopFrames).toBeLessThanOrEqual(18);
    // The same thing with the pogo switched off: she just falls through.
    const t = cloneTuning(defaultTuning);
    t.assists.pogo = false;
    const off = newSim(scene([sit(2000)]), t);
    off.run('J28 .8');
    while (feet(off).y < FLOOR - 110) off.run('.1');
    const e2 = off.run('D+A1 D1').find((e) => e.type === 'slashHit');
    expect(e2?.type === 'slashHit' && e2.pogo).toBe(false);
    expect(off.state.player.vy).toBeGreaterThan(0);
    expect(off.state.pods.burst).toBe(1);
  });

  it('pogo chain: three pods a full-speed bounce apart, without touching the ground', () => {
    const gap = 290;
    const s = newSim(scene([sit(2300), sit(2300 + gap), sit(2300 + 2 * gap)]));
    const A_BIT = ActionBit.attack;
    const hold = ActionBit.right | ActionBit.down;
    const tops: number[] = [];
    let prev = 0;
    let landed = false;
    s.run('R+J20 R6');
    for (let f = 0; f < 200 && s.state.pods.burst < 3; f++) {
      const p = s.state.player;
      const next = (s.scene.pods ?? [])[s.state.pods.burst] as Pod;
      const near = Math.abs(p.x + 20 - next.x) < 60 && p.vy > 0 && feet(s).y > FLOOR - 150;
      const m = hold | (near && (prev & A_BIT) === 0 ? A_BIT : 0);
      const from = s.events.length;
      step(s.state, m, s.tuning, s.scene, s.events);
      if (s.events.slice(from).some((e) => e.type === 'slashHit')) tops.push(feet(s).y);
      if (s.state.player.grounded) landed = true;
      prev = m;
    }
    expect(s.state.pods.burst).toBe(3);
    expect(landed).toBe(false);
    expect(tops).toHaveLength(3);
    s.run(`.${PODS.releaseFrames + 3 * PODS.releaseStagger}`);
    expect(s.state.pickups.count).toBe(3 * PODS.value);
  });

  it('up slash in the air: a small push down, no pogo', () => {
    const s = newSim(scene([at(2000, 430)]));
    s.run('J14');
    const vy = s.state.player.vy;
    const ev = s.run('J+U+A1 J1');
    const hit = ev.find((e) => e.type === 'slashHit');
    expect(hit?.type === 'slashHit' && [hit.dir, hit.pogo]).toEqual(['up', false]);
    expect(s.state.player.vy).toBeGreaterThan(vy + A.recoilUp);
    expect(s.state.player.vy).toBeLessThan(0);
  });

  it('is deterministic (hitstop included) and mirror-symmetric', () => {
    const pods = [sit(2100), sit(2400), at(2250, 560), sit(2700)];
    const face = 'R1 .5';
    const script = 'A1 .6 R+J20 R+U+A1 R12 R+D+A1 R+D30 R+A1 R20 L+A1 L+X1 L+A1 L30 .10';
    const a = newSim(scene(pods));
    const b = newSim(scene(pods));
    a.run(face);
    b.run(face);
    const ev = a.run(script);
    b.run(script);
    expect(only(ev, 'slashHit').length).toBeGreaterThanOrEqual(3);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(cloneState(a.state))).toBe(hashState(a.state));
    const m = newSim(scene(pods.map((p) => ({ ...p, x: 4000 - p.x }))));
    m.run(flip(face));
    const mev = m.run(flip(script));
    expect(names(mev)).toEqual(names(ev));
    expect(feet(m).x - 2000).toBe(-(feet(a).x - 2000));
    expect(feet(m).y).toBe(feet(a).y);
    expect(m.state.pods).toEqual(a.state.pods);
  });
});

describe('lumen pods', () => {
  it('burst once, spill their glints into the one counter one at a time, and stay open', () => {
    const s = newSim(scene([sit(2090, 'pod')]));
    const ev: Array<[number, SimEvent]> = [];
    let f = 0;
    frames(s, 'A1 .60 A1 .30', (e) => {
      for (const x of e) ev.push([f, x]);
      f++;
    });
    const burst = ev.filter(([, e]) => e.type === 'podBurst');
    expect(burst).toHaveLength(1);
    const [bf, b] = burst[0] as [number, SimEvent];
    expect(b).toEqual({
      type: 'podBurst',
      id: 'pod',
      mount: 'sit',
      x: 2090,
      y: 778,
      dir: 'fwd',
      facing: 1,
      value: PODS.value,
      frames: PODS.releaseFrames,
      stagger: PODS.releaseStagger,
    });
    const got = ev.filter(([, e]) => e.type === 'pickup');
    expect(got.map(([g]) => g - bf)).toEqual([
      PODS.releaseFrames,
      PODS.releaseFrames + PODS.releaseStagger,
      PODS.releaseFrames + 2 * PODS.releaseStagger,
    ]);
    expect(
      got.map(([, e]) => e.type === 'pickup' && [e.id, e.kind, e.value, e.pod, e.combo, e.total]),
    ).toEqual([
      ['pod', 'glint', 1, true, 0, 1],
      ['pod', 'glint', 1, true, 1, 2],
      ['pod', 'glint', 1, true, 2, 3],
    ]);
    expect(s.state.pickups.count).toBe(PODS.value);
    expect(s.state.pickups.taken).toBe(0); // `taken` counts the scene's pickups only
    expect(s.state.pods).toEqual({ hp: [0], hitBy: [1], left: [0], timer: [0], burst: 1 });
  });

  it('do not collide with her: she walks and falls straight through', () => {
    const a = newSim(scene([sit(2100), at(2200, 700)]));
    const b = newSim(scene([]));
    const script = 'R20 R+J30 R40';
    a.run(script);
    b.run(script);
    expect(a.state.player).toEqual(b.state.player);
    expect(a.state.pods.burst).toBe(0);
  });

  it('a restart closes them again; a teleport does not', () => {
    const s = newSim(scene([sit(2090)]));
    s.run('A1 .5');
    expect(s.state.pods.burst).toBe(1);
    s.place(2000, 800);
    expect(s.state.pods.burst).toBe(1);
    s.run('.40');
    expect(s.state.pickups.count).toBe(PODS.value);
    const fresh = createState(1, s.tuning, s.scene);
    expect(fresh.pods).toEqual({ hp: [1], hitBy: [0], left: [0], timer: [0], burst: 0 });
    expect(fresh.pickups.count).toBe(0);
  });

  it('scene data is validated: ids, bounds, solids and a mount that exists', () => {
    const base = { ...GROVE, pods: [] as Pod[] };
    const bad = (p: Pod) => () => parseScene({ ...base, pods: [p] });
    expect(() => parseScene(base)).not.toThrow();
    expect(bad({ id: 'a', x: 1000, y: 1258, mount: 'sit' })).not.toThrow();
    expect(bad({ id: 'a', x: 1000, y: 1250, mount: 'sit' })).toThrow(/nothing to sit on/);
    expect(bad({ id: 'a', x: 1000, y: 1270, mount: 'sit' })).toThrow(/inside a solid/);
    expect(bad({ id: 'a', x: 1136, y: 914, mount: 'hang' })).not.toThrow();
    expect(bad({ id: 'a', x: 1700, y: 300, mount: 'hang' })).toThrow(/nothing to hang from/);
    expect(bad({ id: 'spawn-1', x: 1000, y: 1258, mount: 'sit' })).toThrow(/called "spawn-1"/);
    expect(bad({ id: 'a', x: 10, y: 1066, mount: 'sit' })).toThrow(/outside/);
  });

  it('the grove has about a dozen, worth three each, clear of the glints', () => {
    const pods = GROVE.pods ?? [];
    expect(pods.length).toBeGreaterThanOrEqual(10);
    expect(podsWorth(GROVE, PODS)).toBe(pods.length * 3);
    expect(pods.filter((p) => p.mount === 'hang').length).toBeGreaterThanOrEqual(3);
    for (const p of pods)
      for (const g of GROVE.pickups ?? []) {
        const d = Math.sqrt((p.x - g.x) * (p.x - g.x) + (p.y - g.y) * (p.y - g.y));
        expect(d, `${p.id} vs ${g.id}`).toBeGreaterThan(70);
      }
  });
});
