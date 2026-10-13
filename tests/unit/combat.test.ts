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
const S1 = defaultTuning.slash1;
const S2 = defaultTuning.slash2;
const S3 = defaultTuning.slash3;
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
/** Default tuning without the lunge: for tests that measure something else on the ground. */
function calm() {
  const t = cloneTuning(defaultTuning);
  t.slash1.lunge = 0;
  t.slash2.lunge = 0;
  t.slash3.lunge = 0;
  return t;
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
    expect(end).toBe(S1.durationFrames);
    expect(s.state.player.attack).toBe('none');
    expect([S1.startupFrames, S1.activeFrames, S1.durationFrames, S1.cooldownFrames]).toEqual([1, 6, 14, 17]);
  });

  it('cadence: mashing gives a slash every cooldown, an early press is buffered, a stale one is not', () => {
    const s = newSim(scene([]));
    const starts: number[] = [];
    const steps: number[] = [];
    let f = 0;
    frames(s, Array.from({ length: 90 }, () => 'A1 .1').join(' '), (ev) => {
      for (const e of ev)
        if (e.type === 'slash') {
          starts.push(f);
          steps.push(e.step);
        }
      f++;
    });
    // Three seconds of mashing: cut, return cut, finisher, over and over (gaps 17, 19, 27).
    const [c1, c2, c3] = [S1.cooldownFrames, S2.cooldownFrames, S3.cooldownFrames];
    expect([c1, c2, c3]).toEqual([17, 19, 27]);
    expect(starts).toEqual([0, 17, 36, 63, 80, 99, 126, 143, 162]);
    expect(steps).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
    // A press is good for `bufferFrames` frames, its own included: 7 frames early still chains on
    // the first possible frame...
    const early = S1.cooldownFrames - A.bufferFrames + 1;
    const b = newSim(scene([]));
    const ev = b.run(`A1 .${early - 1} A1 .${A.bufferFrames - 2}`);
    expect(only(ev, 'slash')).toHaveLength(1);
    expect(only(b.run('.1'), 'slash')).toEqual(['slash:fwd']);
    expect(b.state.frame).toBe(S1.cooldownFrames + 1);
    // ...and one frame earlier than that is dropped.
    const c = newSim(scene([]));
    expect(only(c.run(`A1 .${early - 2} A1 .30`), 'slash')).toHaveLength(1);
  });

  it('never locks movement: she runs, turns and jumps through a slash, which keeps its direction', () => {
    // (Without the lunge, which is the one thing a slash adds to her motion: see the lunge tests.)
    const still = newSim(scene([]), calm());
    const swing = newSim(scene([]), calm());
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
    expect(slashBox(body, 'fwd', 1, defaultTuning)).toEqual({ x: 1986, y: 708, w: 124, h: 88 });
    expect(slashBox(body, 'fwd', -1, defaultTuning)).toEqual({ x: 1890, y: 708, w: 124, h: 88 });
    expect(slashBox(body, 'up', 1, defaultTuning)).toEqual({ x: 1950, y: 636, w: 100, h: 124 });
    expect(slashBox(body, 'down', -1, defaultTuning)).toEqual({ x: 1950, y: 760, w: 100, h: 120 });
    // Against real pods (44 across): the last px that connects and the first that does not.
    expect(slashBox(body, 'fwd', 1, defaultTuning, 2)).toEqual(slashBox(body, 'fwd', 1, defaultTuning, 1));
    // The finisher: 135 ahead and 108 tall; 144 up and 120 wide. A down slash is the same at every step.
    expect(slashBox(body, 'fwd', 1, defaultTuning, 3)).toEqual({ x: 1986, y: 698, w: 149, h: 108 });
    expect(slashBox(body, 'fwd', -1, defaultTuning, 3)).toEqual({ x: 1865, y: 698, w: 149, h: 108 });
    expect(slashBox(body, 'up', 1, defaultTuning, 3)).toEqual({ x: 1940, y: 616, w: 120, h: 144 });
    expect(slashBox(body, 'down', 1, defaultTuning, 3)).toEqual(slashBox(body, 'down', 1, defaultTuning, 1));
    const hit = (pod: Pod, script: string) => {
      const s = newSim(scene([pod]), calm());
      s.run(script);
      return s.state.pods.burst === 1;
    };
    const reach = S1.fwdReach + PODS.radius;
    expect(hit(sit(2000 + reach - 1), 'A1 .8')).toBe(true);
    expect(hit(sit(2000 + reach), 'A1 .8')).toBe(false);
    // Facing left (a tap of Left moves her a few px first: measure where she ends up).
    const twin = newSim(scene([]), calm());
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
    const s = newSim(scene([sit(2090, 'pod')]), calm());
    expect(names(s.run('A1'))).toEqual(['slash:fwd']);
    const ev = s.run('.1');
    expect(names(ev)).toEqual(['slashHit', 'podBurst', 'impact']);
    expect(ev[2]).toEqual({
      type: 'impact',
      x: 2090,
      y: 778,
      dir: 'fwd',
      facing: 1,
      step: 1,
      power: 1,
      hits: 1,
    });
    const hit = ev[0];
    if (hit?.type !== 'slashHit') throw new Error('no hit');
    expect(hit).toMatchObject({ x: 2090, y: 778, dir: 'fwd', facing: 1, px: 2000, py: 760, pogo: false });
    expect([hit.step, hit.power, hit.knockback]).toEqual([1, 1, S1.knockback]);
    expect(hit.target).toEqual({ kind: 'pod', id: 'pod' });
    expect(hit.hitstop).toBe(PODS.hitstopFrames);
    const p = s.state.player;
    expect([p.hitstop, p.kickX, p.vx, p.attackHits, p.attackFrames]).toEqual([2, -S1.recoil, 0, 1, 1]);
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
    // (R41: the eased start costs 24 px, two and a half frames of running.)
    s.run('R41 R+A1 R1');
    expect(s.state.pods.burst).toBe(1);
    const x0 = s.state.player.x;
    s.run(`R${PODS.hitstopFrames + 10}`);
    // Ten frames of running after the hitstop: her own speed never dropped, and what the shove
    // back (6 px) takes, the rest of the lunge gives back.
    expect(s.state.player.vx).toBeCloseTo(defaultTuning.run.maxSpeed);
    expect(s.state.player.x - x0).toBeGreaterThanOrEqual(96 - 6);
    expect(s.state.player.x - x0).toBeLessThanOrEqual(96);
  });

  it('one hit per target per slash, however long they overlap', () => {
    const s = newSim(
      scene([
        { ...sit(2060, 'near'), hp: 3 },
        { ...sit(2100, 'far'), hp: 3 },
      ]),
    );
    const first = s.run('A1 .19');
    expect(only(first, 'slashHit', 'podHit', 'podBurst')).toEqual([
      'slashHit',
      'podHit',
      'slashHit',
      'podHit',
    ]);
    expect(only(first, 'impact')).toEqual(['impact']); // one impact per blow, however many it hits
    expect(s.state.pods.hp).toEqual([2, 2]);
    const end = first.find((e) => e.type === 'slashEnd');
    expect(end?.type === 'slashEnd' && end.hits).toBe(2);
    s.run('A1 .19');
    expect(s.state.pods.hp).toEqual([1, 1]);
    const third = s.run('A1 .30');
    expect(only(third, 'slashHit', 'podBurst')).toEqual(['slashHit', 'podBurst', 'slashHit', 'podBurst']);
    expect(s.state.pods.hp).toEqual([0, 0]);
    // An open pod is not a target any more.
    expect(only(s.run('A1 .19'), 'slashHit')).toEqual([]);
  });

  it('a pod that drifts into a live slash is hit on that frame, not only on the first', () => {
    const s = newSim(scene([sit(2000 + S1.fwdReach + PODS.radius + 30)]));
    let hitAt = -1;
    frames(s, 'R+A1 R8', (ev) => {
      if (names(ev).includes('slashHit')) hitAt = s.state.player.attackFrames;
    });
    expect(hitAt).toBeGreaterThan(S1.startupFrames);
    expect(hitAt).toBeLessThan(S1.startupFrames + S1.activeFrames);
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
    expect(s.state.pickups.count).toBe(3 * PODS.value1);
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
      power: 1,
      hpMax: 1,
      total: PODS.value1,
      value: PODS.value1,
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
    expect(s.state.pickups.count).toBe(PODS.value1);
    expect(s.state.pickups.taken).toBe(0); // `taken` counts the scene's pickups only
    expect(s.state.pods).toEqual({
      hp: [0],
      hitBy: [1],
      left: [0],
      timer: [0],
      gap: [5],
      paid: [3],
      burst: 1,
    });
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
    expect(s.state.pickups.count).toBe(PODS.value1);
    const fresh = createState(1, s.tuning, s.scene);
    expect(fresh.pods).toEqual({ hp: [1], hitBy: [0], left: [0], timer: [0], gap: [0], paid: [0], burst: 0 });
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
    expect(bad({ id: 'a', x: 1000, y: 1258, mount: 'sit', hp: 3 })).not.toThrow();
    expect(bad({ id: 'a', x: 1000, y: 1258, mount: 'sit', hp: 4 })).toThrow();
    expect(bad({ id: 'a', x: 1000, y: 1258, mount: 'sit', hp: 0 })).toThrow();
  });

  it('the grove has a dozen: six one-hit, four two-hit, two three-hit, clear of the glints', () => {
    const pods = GROVE.pods ?? [];
    expect(pods.length).toBeGreaterThanOrEqual(10);
    const tough = (n: number) => pods.filter((p) => (p.hp ?? 1) === n);
    expect([tough(1).length, tough(2).length, tough(3).length]).toEqual([6, 4, 2]);
    expect(podsWorth(GROVE, PODS)).toBe(6 * PODS.value1 + 4 * PODS.value2 + 2 * PODS.value3);
    // The pogo row stays one-hit, and the three-hit ones are where she can stand and combo.
    for (const p of pods) if (p.id.startsWith('pod-row-')) expect(p.hp ?? 1).toBe(1);
    for (const p of tough(3)) expect(p.mount).toBe('sit');
    expect(pods.filter((p) => p.mount === 'hang').length).toBeGreaterThanOrEqual(3);
    for (const p of pods)
      for (const g of GROVE.pickups ?? []) {
        const d = Math.sqrt((p.x - g.x) * (p.x - g.x) + (p.y - g.y) * (p.y - g.y));
        expect(d, `${p.id} vs ${g.id}`).toBeGreaterThan(70);
      }
  });
});

describe('the three-hit combo', () => {
  const slashes = (ev: SimEvent[]) =>
    ev.flatMap((e) => (e.type === 'slash' ? [`${e.dir}${e.step}${e.finisher ? '!' : ''}`] : []));

  it('steps 1 -> 2 -> 3 while the chain is alive; the window is 14 frames after the cooldown', () => {
    const W = A.comboWindowFrames;
    const last = S1.cooldownFrames + W - 1; // the last frame (from the first press) that still chains
    const on = newSim(scene([]));
    expect(slashes(on.run(`A1 .${last - 1} A1 .1`))).toEqual(['fwd1', 'fwd2']);
    const late = newSim(scene([]));
    expect(slashes(late.run(`A1 .${last} A1 .1`))).toEqual(['fwd1', 'fwd1']);
    // The same from step 2 to the finisher, measured from step 2's own cooldown.
    const fin = newSim(scene([]));
    const gap2 = S2.cooldownFrames + W - 1;
    expect(slashes(fin.run(`A1 .16 A1 .${gap2 - 1} A1 .1`))).toEqual(['fwd1', 'fwd2', 'fwd3!']);
    const lost = newSim(scene([]));
    expect(slashes(lost.run(`A1 .16 A1 .${gap2} A1 .1`))).toEqual(['fwd1', 'fwd2', 'fwd1']);
    // After the finisher it starts over, however fast the next press.
    const loop = newSim(scene([]));
    expect(slashes(loop.run('A1 .16 A1 .18 A1 .26 A1 .1'))).toEqual(['fwd1', 'fwd2', 'fwd3!', 'fwd1']);
    expect(loop.state.player.attackStep).toBe(1);
    expect(loop.state.player.attackFinisher).toBe(false);
  });

  it('each step has its own timing, told in the slash event and kept in the state', () => {
    const s = newSim(scene([]));
    const seen: Record<number, { live: number[]; end: number; ev: SimEvent | undefined }> = {};
    let start = 0;
    let f = 0;
    frames(s, 'A1 .16 A1 .18 A1 .40', (ev) => {
      const p = s.state.player;
      const e = ev.find((x) => x.type === 'slash');
      if (e?.type === 'slash') {
        start = f;
        seen[e.step] = { live: [], end: -1, ev: e };
        expect([p.attackStep, p.attackFinisher]).toEqual([e.step, e.step === 3]);
      }
      const cur = seen[p.attackStep];
      if (cur && p.attackActive) cur.live.push(f - start);
      if (cur && names(ev).includes('slashEnd:done')) cur.end = f - start;
      f++;
    });
    expect(seen[1]?.live).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen[2]?.live).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen[3]?.live).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect([seen[1]?.end, seen[2]?.end, seen[3]?.end]).toEqual([14, 14, 20]);
    expect(seen[3]?.ev).toMatchObject({
      step: 3,
      finisher: true,
      startup: S3.startupFrames,
      active: S3.activeFrames,
      duration: S3.durationFrames,
      cooldown: S3.cooldownFrames,
      lunge: S3.lunge,
      hang: 0,
    });
    expect(seen[1]?.ev).toMatchObject({
      step: 1,
      finisher: false,
      startup: 1,
      active: 6,
      duration: 14,
      cooldown: 17,
    });
    expect(seen[2]?.ev).toMatchObject({
      step: 2,
      finisher: false,
      cooldown: S2.cooldownFrames,
      lunge: S2.lunge,
    });
  });

  it('up slashes count as steps; a down slash is always the step-1 blow and keeps the chain', () => {
    const s = newSim(scene([]));
    expect(slashes(s.run('A1 .16 U+A1 .18 A1 .1'))).toEqual(['fwd1', 'up2', 'fwd3!']);
    const up = newSim(scene([]));
    expect(slashes(up.run('U+A1 .16 U+A1 .18 U+A1 .1'))).toEqual(['up1', 'up2', 'up3!']);
    // In the air: cut, down slash (still step 1 timing, never a finisher), then the chain goes on.
    const air = newSim(scene([]));
    const ev = air.run('J28 .1 J10 A1 .16 D+A1 .16 A1 .1');
    expect(slashes(ev)).toEqual(['fwd1', 'down1', 'fwd2']);
    const down = ev.filter((e) => e.type === 'slash')[1];
    expect(down).toMatchObject({ startup: S1.startupFrames, cooldown: S1.cooldownFrames, hang: 0, lunge: 0 });
    // Down slashes alone never build to a finisher.
    const d = newSim(scene([]));
    expect(slashes(d.run('J28 .1 J+D+A1 J16 J+D+A1 J16 J+D+A1 .1'))).toEqual(['down1', 'down1', 'down1']);
  });

  it('the finisher hits harder: power 2, one more frame of hitstop, more recoil, a bigger area', () => {
    // A pod only the finisher reaches (157 px against 132), so the first two cuts whiff.
    const far = 2000 + S1.fwdReach + PODS.radius + 5;
    const s = newSim(scene([{ ...sit(far, 'pod'), hp: 3 }]), calm());
    const ev = s.run('A1 .16 A1 .18 A1 .3');
    expect(only(ev, 'slashHit', 'podHit', 'podBurst', 'impact')).toEqual(['slashHit', 'podHit', 'impact']);
    const hit = ev.find((e) => e.type === 'slashHit');
    expect(hit).toMatchObject({
      step: 3,
      power: 2,
      knockback: S3.knockback,
      hitstop: PODS.hitstopFrames + 1,
    });
    expect(ev.find((e) => e.type === 'impact')).toMatchObject({ step: 3, power: 2, x: far, hits: 1 });
    expect(ev.find((e) => e.type === 'podHit')).toMatchObject({ power: 2, hpLeft: 1, hpMax: 3, value: 1 });
    expect([s.state.player.hitstop, s.state.player.kickX]).toEqual([3, -S3.recoil]);
    expect(S3.recoil).toBeGreaterThan(S1.recoil);
    expect([S1.power, S2.power, S3.power]).toEqual([1, 1, 2]);
    expect([S1.hitstopBonus, S2.hitstopBonus, S3.hitstopBonus]).toEqual([0, 0, 1]);
  });

  it('lunge: 9 px on the cuts, 16 on the finisher, on the ground and forward only', () => {
    const s = newSim(scene([]));
    const xs: number[] = [];
    const moved: number[] = [];
    let x = s.state.player.x;
    for (const wait of [16, 18, 26]) {
      const e = s.run('A1').find((k) => k.type === 'slash');
      xs.push(e?.type === 'slash' ? e.lunge : -1);
      expect(s.state.player.lungeX).not.toBe(0);
      s.run(`.${wait}`);
      moved.push(s.state.player.x - x);
      x = s.state.player.x;
      expect(s.state.player.lungeX).toBe(0);
    }
    expect(xs).toEqual([S1.lunge, S2.lunge, S3.lunge]);
    expect(moved).toEqual([9, 9, 16]);
    // The lunge is gone in `lungeFrames`.
    const t = newSim(scene([]));
    let n = 0;
    frames(t, 'A1 .10', () => {
      if (t.state.player.lungeX !== 0) n++;
    });
    expect(n).toBe(A.lungeFrames - 1);
    // Facing left it goes left; an up slash and an air slash have none.
    const l = newSim(scene([]));
    l.run('L1 .9');
    const lx = l.state.player.x;
    l.run('A1 .16');
    expect(l.state.player.x - lx).toBe(-9);
    const none = (script: string) => {
      const k = newSim(scene([]));
      const e = k.run(script).find((q) => q.type === 'slash');
      return e?.type === 'slash' ? e.lunge : -1;
    };
    expect(none('U+A1')).toBe(0);
    expect(none('J10 A1')).toBe(0);
  });

  it('holding back cancels the lunge', () => {
    const s = newSim(scene([]));
    const still = newSim(scene([]), calm());
    s.run('A1 L8');
    still.run('A1 L8');
    expect(s.state.player.lungeX).toBe(0);
    expect(s.state.player.x - still.state.player.x).toBe(3); // only the press frame's 3 px
  });

  it('the lunge never takes her off a ledge unless she holds forward', () => {
    const platform = { tag: 'floating' as const, x: 1900, y: 500, w: 200, h: 40 };
    for (let d = 0; d <= 60; d += 3) {
      // Feet centre `d` px from the right edge: mash a whole chain with no direction held.
      const s = newSim(scene([], { solids: [platform] }));
      s.place(2100 - d, 500);
      s.run(Array.from({ length: 40 }, () => 'A1 .1').join(' '));
      expect([s.state.player.grounded, feet(s).y], `d=${d}`).toEqual([true, 500]);
      // And to the left, mirrored.
      const m = newSim(scene([], { solids: [platform] }));
      m.place(1900 + d, 500);
      m.run(`L1 .12 ${Array.from({ length: 40 }, () => 'A1 .1').join(' ')}`);
      expect([m.state.player.grounded, feet(m).y], `left d=${d}`).toEqual([true, 500]);
    }
    // Holding forward is a choice: off she goes.
    const off = newSim(scene([], { solids: [platform] }));
    off.place(2090, 500);
    off.run('R+A1 R12');
    expect(off.state.player.grounded).toBe(false);
  });

  it('air hang: a forward or up slash holds her fall for a few frames, never lifts her', () => {
    const tall = {
      ...flatScene(),
      height: 3400,
      solids: [{ tag: 'ground' as const, x: 0, y: 3200, w: 4000, h: 200 }],
    };
    const drop = (script: string) => {
      const s = newSim({ ...tall, pods: [] });
      s.place(2000, 600);
      const ys: number[] = [];
      const hangs: number[] = [];
      let f = 0;
      let landed = -1;
      frames(s, script, (ev) => {
        ys.push(s.state.player.y);
        for (const e of ev) if (e.type === 'slash') hangs.push(e.hang);
        if (landed < 0 && s.state.player.grounded) landed = f;
        f++;
      });
      return { ys, hangs, landed, s };
    };
    const plain = drop('.200');
    const mash = drop(Array.from({ length: 100 }, () => 'A1 .1').join(' '));
    // One hang per combo step per airtime: 4 + 4 + 6 frames, then slashes hang no more.
    expect(mash.hangs.slice(0, 3)).toEqual([S1.hangFrames, S2.hangFrames, S3.hangFrames]);
    expect(mash.hangs.slice(3).every((h) => h === 0)).toBe(true);
    expect(mash.hangs.length).toBeGreaterThan(4);
    // She never rises, and all the mashing in the world buys less than a third of a second.
    for (let i = 1; i < mash.ys.length; i++)
      expect(mash.ys[i]).toBeGreaterThanOrEqual(mash.ys[i - 1] as number);
    expect(mash.landed - plain.landed).toBeGreaterThan(5);
    expect(mash.landed - plain.landed).toBeLessThan(20);
    // The hang itself: falling at max speed, a cut brings her to a near stop for a moment.
    const one = drop('.40 A1 .30');
    const v = one.ys.slice(40, 46).map((y, i) => y - (one.ys[39 + i] as number));
    expect(v[0]).toBeLessThan(13);
    expect(v[3]).toBeLessThan(5);
    expect(one.ys[70] as number).toBeGreaterThan(one.ys[46] as number);
    // No hang on a down slash, none while gliding, none while rising matters (it cannot lift).
    expect(drop('.20 D+A1 .5').hangs).toEqual([0]);
    const up = newSim(scene([]));
    const y: number[] = [];
    const y0: number[] = [];
    const ref = newSim(scene([]));
    frames(up, 'J5 J+A1 J20', () => y.push(up.state.player.y));
    frames(ref, 'J26', () => y0.push(ref.state.player.y));
    expect(y).toEqual(y0);
  });

  it('the hang comes back on landing and on a pogo', () => {
    const s = newSim(scene([]));
    const hang = (script: string) => {
      const e = s.run(script).find((q) => q.type === 'slash');
      return e?.type === 'slash' ? e.hang : -1;
    };
    s.run('J28');
    expect(hang('A1 .30')).toBe(S1.hangFrames);
    expect(s.state.player.grounded).toBe(true);
    s.run('.20 J28');
    expect(hang('A1 .1')).toBe(S1.hangFrames);
    expect(s.state.player.hangUsed).not.toBe(0);
  });
});

describe('tougher pods', () => {
  const total = (ev: SimEvent[]) => ev.filter((e) => e.type === 'pickup').length;

  it('two hits: the first knocks a glint loose, the second bursts it for the rest', () => {
    const s = newSim(scene([{ ...sit(2090, 'pod'), hp: 2 }]));
    const a = s.run('A1 .1');
    expect(only(a, 'slashHit', 'podHit', 'podBurst')).toEqual(['slashHit', 'podHit']);
    expect(a.find((e) => e.type === 'podHit')).toEqual({
      type: 'podHit',
      id: 'pod',
      mount: 'sit',
      x: 2090,
      y: 778,
      dir: 'fwd',
      facing: 1,
      power: 1,
      hpLeft: 1,
      hpMax: 2,
      value: 1,
      frames: PODS.releaseFrames,
      stagger: PODS.releaseStagger,
    });
    expect(s.state.pods.hp).toEqual([1]);
    expect(s.state.pods.burst).toBe(0);
    const b = s.run('.17 A1 .1');
    expect(total(b)).toBe(1); // the loose glint arrived before the second cut
    expect(b.find((e) => e.type === 'podBurst')).toMatchObject({
      power: 1,
      hpMax: 2,
      total: PODS.value2,
      value: PODS.value2 - 1,
    });
    const c = s.run('.60 A1 .40');
    expect(total(c)).toBe(PODS.value2 - 1);
    expect(s.state.pickups.count).toBe(PODS.value2);
    expect(only(c, 'slashHit')).toEqual([]);
  });

  it('three hits: a full chain opens it on the finisher, and it pays 10 in all, once', () => {
    const s = newSim(scene([{ ...sit(2100, 'pod'), hp: 3 }]));
    const ev: Array<[number, SimEvent]> = [];
    let f = 0;
    frames(s, `${Array.from({ length: 30 }, () => 'A1 .1').join(' ')} .80 A1 .40`, (e) => {
      for (const x of e) ev.push([f, x]);
      f++;
    });
    const seq = ev.filter(([, e]) => ['slashHit', 'podHit', 'podBurst'].includes(e.type)).map(([, e]) => e);
    expect(seq.map((e) => e.type)).toEqual([
      'slashHit',
      'podHit',
      'slashHit',
      'podHit',
      'slashHit',
      'podBurst',
    ]);
    expect(seq.map((e) => (e.type === 'slashHit' ? e.step : e.type === 'podHit' ? e.hpLeft : -1))).toEqual([
      1, 2, 2, 1, 3, -1,
    ]);
    const burst = ev.find(([, e]) => e.type === 'podBurst') as [number, SimEvent];
    expect(burst[1]).toMatchObject({
      power: 2,
      hpMax: 3,
      total: 10,
      value: 8,
      stagger: PODS.releaseStaggerBig,
    });
    // Eight glints, three frames apart, from 16 frames after the burst.
    const after = ev.filter(([g, e]) => e.type === 'pickup' && g > burst[0]).map(([g]) => g - burst[0]);
    expect(after).toEqual([16, 19, 22, 25, 28, 31, 34, 37]);
    expect(s.state.pickups.count).toBe(PODS.value3);
    expect(s.state.pods.paid).toEqual([PODS.value3]);
    expect([PODS.value1, PODS.value2, PODS.value3]).toEqual([3, 6, 10]);
  });

  it('damage stays until a restart; a finisher takes two', () => {
    const far = 2000 + S1.fwdReach + PODS.radius + 5;
    const s = newSim(scene([{ ...sit(far, 'pod'), hp: 3 }]), calm());
    s.run('A1 .16 A1 .18 A1 .40'); // only the finisher reaches
    expect(s.state.pods.hp).toEqual([1]);
    s.place(far - 80, 800);
    s.run('.200');
    expect(s.state.pods.hp).toEqual([1]);
    expect(s.state.pickups.count).toBe(1);
    const ev = s.run('A1 .60');
    expect(ev.find((e) => e.type === 'podBurst')).toMatchObject({ total: 10, value: 9, hpMax: 3 });
    expect(s.state.pickups.count).toBe(10);
    expect(createState(1, s.tuning, s.scene).pods.hp).toEqual([3]);
  });

  it('with hitGlints 0 nothing comes loose early and the burst pays it all', () => {
    const t = cloneTuning(defaultTuning);
    t.pods.hitGlints = 0;
    const s = newSim(scene([{ ...sit(2090, 'pod'), hp: 2 }]), t);
    expect(total(s.run('A1 .21'))).toBe(0);
    expect(s.run('A1 .1').find((e) => e.type === 'podBurst')).toMatchObject({ value: PODS.value2 });
    s.run('.60');
    expect(s.state.pickups.count).toBe(PODS.value2);
  });
});
