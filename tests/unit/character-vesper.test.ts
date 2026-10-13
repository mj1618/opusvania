import { describe, expect, it } from 'vitest';
import { CameraKick } from '../../src/render/camera/kick';
import { cameraTuning } from '../../src/render/camera/tuning';
import { BladeTrail } from '../../src/render/character/vesper/fx';
import { J_COUNT, J_TOE_A, J_TOE_B, Rig, STROKES, strokeFor } from '../../src/render/character/vesper/rig';
import { Secondary } from '../../src/render/character/vesper/wings';
import type { PlayerView } from '../../src/render/contract';
import type { SimEvent } from '../../src/sim/events';
import { slashBox } from '../../src/sim/index';
import { tuning } from '../../src/sim/tuning';

function view(over: Partial<PlayerView>): PlayerView {
  const base = {
    x: 0,
    y: 0,
    w: 40,
    h: 80,
    vx: 0,
    vy: 0,
    facing: 1,
    mode: 'normal',
    modeFrames: 0,
    motion: 'idle',
    motionFrames: 0,
    grounded: true,
    contactFrames: 100,
    wallDir: 0,
    inputX: 0,
    skid: false,
    dashDir: 1,
    dashTimer: 0,
    freeze: 0,
    hitstop: 0,
    cx: 1000,
    cy: 1240,
    feetY: 1280,
  };
  return { ...base, ...over } as unknown as PlayerView;
}

const DT = 1 / 60;

describe('vesper rig', () => {
  it('plants the stance foot: no sliding in the lope at any frame rate', () => {
    for (const hz of [60, 144]) {
      const rig = new Rig();
      const dt = 1 / hz;
      let cx = 1000;
      rig.update(dt, 0, view({ cx }), [{ type: 'spawn', x: cx, y: 1280 }]);
      const slides: number[] = [];
      const last = [Number.NaN, Number.NaN];
      let airborne = 0;
      let frames = 0;
      for (let i = 0; i < hz * 3; i++) {
        cx += 9.6 * 60 * dt;
        rig.update(dt, i * dt, view({ cx, vx: 9.6, motion: 'run', inputX: 1 }), []);
        if (i < hz) continue;
        let anyDown = false;
        for (let side = 0; side < 2; side++) {
          const j = side === 0 ? J_TOE_A : J_TOE_B;
          const x = rig.frame.j[j * 2] ?? 0;
          const y = rig.frame.j[j * 2 + 1] ?? 0;
          const prev = last[side] ?? Number.NaN;
          const down = y > 1280 - 1.2;
          anyDown ||= down;
          if (down && !Number.isNaN(prev)) slides.push(Math.abs(x - prev));
          last[side] = down ? x : Number.NaN;
        }
        frames++;
        if (!anyDown) airborne++;
      }
      slides.sort((a, b) => a - b);
      expect(slides.length).toBeGreaterThan(20);
      expect(slides[Math.floor(slides.length * 0.25)] ?? 1).toBeLessThan(0.05);
      // A lope floats: both feet are off the ground for a good part of every stride.
      expect(airborne / frames).toBeGreaterThan(0.3);
    }
  });

  it('wings, antennae and joints stay finite and near the body through a teleport, turn, jump, double jump and dash', () => {
    const rig = new Rig();
    const sec = new Secondary();
    let clock = 0;
    const run = (p: PlayerView, ev: SimEvent[] = []): void => {
      rig.update(DT, clock, p, ev);
      if (rig.sig.spawned) sec.reset();
      sec.update(DT, clock, rig, rig.frame, p);
      clock += DT;
      for (let i = 0; i < J_COUNT * 2; i++) expect(Number.isFinite(rig.frame.j[i])).toBe(true);
      for (const c of sec.all) {
        for (let i = 0; i < c.n; i++) {
          expect(Math.abs((c.rx[i] ?? 0) - p.cx)).toBeLessThan(150);
          expect(Math.abs((c.ry[i] ?? 0) - p.cy)).toBeLessThan(150);
        }
      }
    };
    run(view({}), [{ type: 'spawn', x: 1000, y: 1280 }]);
    for (let i = 0; i < 30; i++) run(view({}));
    // Teleport without a spawn event: the jump in position must reset the cloth.
    for (let i = 0; i < 10; i++) run(view({ cx: 3000, cy: 440, feetY: 480 }));
    let cx = 3000;
    for (let i = 0; i < 40; i++) {
      cx += 9.6;
      run(view({ cx, cy: 440, feetY: 480, vx: 9.6, motion: 'run', inputX: 1 }));
    }
    for (let i = 0; i < 20; i++) {
      cx -= 6;
      run(view({ cx, cy: 440, feetY: 480, vx: -6, facing: -1, motion: 'run', inputX: -1 }));
    }
    let y = 480;
    let vy = -22;
    for (let i = 0; i < 60; i++) {
      const ev: SimEvent[] =
        i === 0
          ? [{ type: 'jump', kind: 'ground', x: cx, y, dir: -1 }]
          : i === 20
            ? [{ type: 'jump', kind: 'double', x: cx, y, dir: -1 }]
            : [];
      if (i === 20) vy = -18;
      vy = Math.min(21, vy + 0.9);
      y += vy;
      cx -= 9.6;
      run(
        view({
          cx,
          cy: y - 40,
          feetY: y,
          vx: -9.6,
          vy,
          facing: -1,
          grounded: false,
          motion: vy < 0 ? 'rise' : 'fall',
        }),
        ev,
      );
    }
    for (let i = 0; i < 12; i++) {
      cx += 24;
      run(
        view({ cx, cy: y - 40, feetY: y, vx: 24, facing: 1, grounded: false, motion: 'dash', mode: 'dash' }),
        i === 0 ? [{ type: 'dashStart', x: cx, y, dir: 1, air: true }] : [],
      );
    }
    for (let i = 0; i < 40; i++) {
      run(
        view({
          cx,
          cy: y - 40,
          feetY: y,
          vy: 4,
          wallDir: 1,
          facing: -1,
          grounded: false,
          motion: 'wallSlide',
          mode: 'wallSlide',
        }),
      );
    }
  });

  it('a somersault cut short by landing settles upright without a pop (one turn and two)', () => {
    for (const turns of [1, 2]) {
      Rig.turns = turns;
      const rig = new Rig();
      let clock = 0;
      const tick = (): number => {
        clock += DT;
        return clock;
      };
      const air = { cy: 1140, feetY: 1180, vy: -6, grounded: false, motion: 'rise' } as const;
      rig.update(DT, clock, view({}), [{ type: 'spawn', x: 1000, y: 1280 }]);
      for (let i = 0; i < 10; i++) rig.update(DT, tick(), view(air), []);
      rig.update(DT, tick(), view(air), [{ type: 'jump', kind: 'double', x: 1000, y: 1180, dir: 0 }]);
      for (let i = 0; i < 9; i++) rig.update(DT, tick(), view(air), []);
      expect(Math.abs(rig.spinPhi)).toBeGreaterThan(1);
      let prev = rig.spinPhi;
      let worst = 0;
      for (let i = 0; i < 40; i++) {
        rig.update(DT, tick(), view({ cy: 1140, feetY: 1180 }), []);
        // Whole turns are the same pose: compare the angles on the circle.
        const dphi = rig.spinPhi - prev;
        worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(dphi), Math.cos(dphi))));
        prev = rig.spinPhi;
      }
      // Never more than ~70 degrees in one frame on the way back, and it ends exactly upright.
      expect(worst).toBeLessThan(1.25);
      expect(rig.spinPhi).toBe(0);
      expect(rig.spinW).toBe(0);
    }
    Rig.turns = 2;
  });

  it('somersault: spin rate follows 1 / moment of inertia, whole turns, tight ball', () => {
    for (const turns of [1, 2]) {
      Rig.turns = turns;
      const rig = new Rig();
      let clock = 0;
      const air = view({ cy: 1140, feetY: 1180, vy: -6, grounded: false, motion: 'rise' });
      const tick = (ev: SimEvent[] = []): void => {
        rig.update(DT, clock, air, ev);
        clock += DT;
      };
      tick([{ type: 'spawn', x: 1000, y: 1180 }]);
      for (let i = 0; i < 20; i++) tick();
      const openI = rig.jointI;
      tick([{ type: 'jump', kind: 'double', x: 1000, y: 1180, dir: 0 }]);
      let total = 0;
      let prev = 0;
      let peak = 0;
      let peakI = 9;
      let minI = 9;
      let tuckedI = 1e9;
      const momentum: number[] = [];
      let frames = 0;
      let worstStep = 0;
      while (rig.spinning && frames < 80) {
        const a = Math.abs(rig.spinPhi);
        total += a - prev;
        worstStep = Math.max(worstStep, a - prev);
        prev = a;
        if (rig.spinOmega > peak) {
          peak = rig.spinOmega;
          peakI = rig.spinI;
        }
        minI = Math.min(minI, rig.spinI);
        if (rig.spinW > 0.98) tuckedI = Math.min(tuckedI, rig.jointI);
        // Away from the first and last tenth the momentum is constant: omega x I does not change.
        const u = (frames * DT) / (turns === 2 ? 0.56 : 0.48);
        if (u > 0.14 && u < 0.86) momentum.push(rig.spinOmega * rig.spinI);
        tick();
        frames++;
      }
      // Fastest exactly when she is tightest.
      expect(peakI).toBeCloseTo(minI, 2);
      expect(minI).toBeCloseTo(1, 2);
      const lo = Math.min(...momentum);
      const hi = Math.max(...momentum);
      expect((hi - lo) / hi).toBeLessThan(0.06);
      // Whole turns, ending upright, and no single frame jumps more than ~30 degrees.
      expect(rig.spinPhi).toBe(0);
      expect(total / (Math.PI * 2)).toBeGreaterThan(turns - 0.06);
      expect(worstStep).toBeLessThan(0.55);
      // The posed skeleton really is ~4x easier to turn in the ball: the model's ratio is its own.
      expect(openI / tuckedI).toBeGreaterThan(3.2);
      expect(openI / tuckedI).toBeLessThan(4.6);
      // Two turns spin faster than one.
      expect(peak).toBeGreaterThan(turns === 2 ? 26 : 18);
    }
    Rig.turns = 2;
  });

  it('glide: wings spread to both sides, stay spread through a turn, and fold on release', () => {
    const rig = new Rig();
    const sec = new Secondary();
    let clock = 0;
    let cx = 1000;
    let y = 600;
    const run = (over: Partial<PlayerView>, ev: SimEvent[] = []): void => {
      const p = view({ cx, cy: y - 40, feetY: y, grounded: false, ...over });
      rig.update(DT, clock, p, ev);
      if (rig.sig.spawned) sec.reset();
      sec.update(DT, clock, rig, rig.frame, p);
      clock += DT;
    };
    const tips = (): [number, number] => {
      const a = sec.wings[0].strands[0];
      const b = sec.wings[1].strands[0];
      return [(a?.rx[a.n - 1] ?? 0) - cx, (b?.rx[b.n - 1] ?? 0) - cx];
    };
    run({ motion: 'fall', vy: 21 }, [{ type: 'spawn', x: cx, y }]);
    for (let i = 0; i < 20; i++) run({ motion: 'fall', vy: 21 });
    // The catch from a long fall, with the sim's own speed trace.
    const trace = [16.4, 12.9, 10.5, 8.8, 7.6, 6.8, 6.2, 5.8, 5.4, 5.0, 4.8];
    let peak = 0;
    let beatPeak = 0;
    let beats = 0;
    for (let i = 0; i < 420; i++) {
      const vy = trace[i] ?? 4.8;
      cx += 10.56;
      y += vy;
      run(
        { motion: 'glide', gliding: true, vx: 10.56, vy, inputX: 1 },
        i === 0 ? [{ type: 'glideStart', x: cx, y, vy: 21.3 }] : [],
      );
      peak = Math.max(peak, rig.catchK);
      beatPeak = Math.max(beatPeak, rig.beat);
      if (rig.sig.beat) beats++;
    }
    // A steady glide is never frozen: a slow wing beat every few seconds.
    expect(beatPeak).toBeGreaterThan(0.8);
    expect(beats).toBeGreaterThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.5);
    expect(Math.abs(rig.catchK)).toBeLessThan(0.05);
    expect(rig.soar).toBeGreaterThan(0.98);
    let [a, b] = tips();
    // Wing A to screen-left, wing B to screen-right, each further out than she is tall.
    expect(a).toBeLessThan(-60);
    expect(b).toBeGreaterThan(60);
    expect(b - a).toBeGreaterThan(150);
    // A turn in the air: the facing flips at once, the speed reverses over ~22 frames.
    let vx = 10.56;
    for (let i = 0; i < 50; i++) {
      vx = Math.max(-10.56, vx - 0.9);
      cx += vx;
      y += 4.8;
      run({ motion: 'glide', gliding: true, vx, vy: 4.8, facing: -1, inputX: -1 });
      [a, b] = tips();
      expect(a).toBeLessThan(-45);
      expect(b).toBeGreaterThan(45);
    }
    // Release: back to the cape, nothing left spread.
    for (let i = 0; i < 60; i++) {
      cx += vx;
      y += 12;
      run(
        { motion: 'fall', vx, vy: 12, facing: -1 },
        i === 0 ? [{ type: 'glideEnd', x: cx, y, reason: 'release' }] : [],
      );
    }
    expect(rig.soar).toBeLessThan(0.01);
    for (const c of sec.all) {
      expect(c.scale).toBeLessThan(1.01);
      for (let i = 0; i < c.n; i++) expect(Math.abs((c.rx[i] ?? 0) - cx)).toBeLessThan(70);
    }
  });

  it("slash: three different strokes, each from the last one's follow-through; the cut holds through hitstop; back to rest", () => {
    const rig = new Rig();
    let clock = 0;
    const tick = (over: Partial<PlayerView> = {}, ev: SimEvent[] = []): void => {
      rig.update(DT, clock, view(over), ev);
      clock += DT;
    };
    const slash = (step: number, dir: 'fwd' | 'up' | 'down' = 'fwd'): SimEvent => ({
      type: 'slash',
      x: 1000,
      y: 1280,
      dir,
      facing: 1,
      seq: step,
      step,
      finisher: step === 3,
      startup: step === 3 ? 3 : 1,
      active: 6,
      duration: 14,
      cooldown: 17,
      lunge: 0,
      hang: 0,
    });
    tick({}, [{ type: 'spawn', x: 1000, y: 1280 }]);
    for (let i = 0; i < 20; i++) tick();
    // Step 1: on the press frame she has the blade; the cut is under way a frame later.
    tick({}, [slash(1)]);
    expect(rig.stroke).toBe(STROKES.fwd[0]);
    expect(rig.cutQ).toBeGreaterThanOrEqual(0);
    tick();
    expect(rig.slashW).toBeGreaterThan(0.9);
    expect(rig.cutQ).toBeGreaterThan(0.4);
    for (let i = 0; i < 15; i++) tick();
    // When the next press can come (17 frames) the blade is in her hand, part-way down in front of
    // her, and her body is still in the follow-through: the chain grows out of this, not from rest.
    expect(rig.slashW).toBe(1);
    expect(rig.slashHome).toBeGreaterThan(0);
    expect(rig.slashHome).toBeLessThan(0.75);
    expect(rig.slashBody).toBeGreaterThan(0.3);
    tick({}, [slash(2)]);
    expect(rig.stroke).toBe(STROKES.fwd[1]);
    // The press frame shows the gathered blade: the cut has not travelled yet.
    expect(rig.cutQ).toBeLessThan(0.05);
    // The blow lands: that frame still moves (the blade is caught in the cut), then it holds.
    tick({ hitstop: 2 }, [
      {
        type: 'slashHit',
        x: 1080,
        y: 1240,
        dir: 'fwd',
        facing: 1,
        target: { kind: 'pod', id: 'p' },
        px: 1000,
        py: 1240,
        pogo: false,
        hitstop: 2,
        step: 2,
        power: 1,
        knockback: 6,
      },
    ]);
    const t0 = rig.slashT;
    const q0 = rig.cutQ;
    expect(q0).toBeGreaterThan(0.4);
    tick({ hitstop: 1 });
    expect(rig.slashT).toBe(t0);
    expect(rig.cutQ).toBe(q0);
    for (let i = 0; i < 18; i++) tick();
    // The finisher gathers for its three frames before the cut starts.
    tick({}, [slash(3)]);
    expect(rig.stroke).toBe(STROKES.fwd[2]);
    expect(rig.cutQ).toBe(-1);
    tick();
    expect(rig.cutQ).toBe(-1);
    expect(rig.slashWing).toBeLessThan(0);
    tick();
    tick();
    expect(rig.cutQ).toBeGreaterThan(0.4);
    for (let i = 0; i < 6; i++) tick();
    expect(rig.slashWing).toBeGreaterThan(0.8);
    for (let i = 0; i < 60; i++) tick();
    expect(rig.slashW).toBe(0);
    expect(Math.abs(rig.slashWing)).toBeLessThan(0.01);
    for (let i = 0; i < J_COUNT * 2; i++) expect(Number.isFinite(rig.frame.j[i])).toBe(true);
    // A down slash is always the one blow; a dash ends a slash at once.
    tick({ grounded: false, motion: 'fall' }, [slash(3, 'down')]);
    expect(rig.stroke).toBe(STROKES.down[0]);
    tick({ grounded: false, motion: 'fall' });
    expect(rig.slashW).toBeGreaterThan(0.5);
    tick({ motion: 'dash', mode: 'dash' }, [
      { type: 'slashEnd', x: 0, y: 0, dir: 'down', hits: 0, reason: 'dash' },
    ]);
    expect(rig.slashW).toBe(0);
  });

  it('a lone tap is back in the sheath well before the old 29 frames; the near arm holds the thorn', () => {
    const rig = new Rig();
    let clock = 0;
    const tick = (over: Partial<PlayerView> = {}, ev: SimEvent[] = []): void => {
      rig.update(DT, clock, view(over), ev);
      clock += DT;
    };
    const slash = (facing: number): SimEvent => ({
      type: 'slash',
      x: 1000,
      y: 1280,
      dir: 'fwd',
      facing,
      seq: 1,
      step: 1,
      finisher: false,
      startup: 1,
      active: 6,
      duration: 14,
      cooldown: 17,
      lunge: 0,
      hang: 0,
    });
    tick({}, [{ type: 'spawn', x: 1000, y: 1280 }]);
    tick({}, [slash(1)]);
    expect(rig.swordSide).toBe(0);
    for (let i = 0; i < 21; i++) tick();
    expect(rig.slashW).toBe(0);
    for (let i = 0; i < 30; i++) tick({ facing: -1 });
    tick({ facing: -1 }, [slash(-1)]);
    expect(rig.swordSide).toBe(1);
    tick({ facing: -1 });
    // Mirrored: the blade goes left.
    expect(rig.bladeX).toBeLessThan(0);
  });

  it('the finisher hops and is back on the ground before the stroke ends; hurt, fade and reform envelopes', () => {
    const rig = new Rig();
    let clock = 0;
    const tick = (over: Partial<PlayerView> = {}, ev: SimEvent[] = []): void => {
      rig.update(DT, clock, view(over), ev);
      clock += DT;
    };
    tick({}, [{ type: 'spawn', x: 1000, y: 1280 }]);
    for (let i = 0; i < 10; i++) tick();
    tick({}, [
      {
        type: 'slash',
        x: 1000,
        y: 1280,
        dir: 'fwd',
        facing: 1,
        seq: 3,
        step: 3,
        finisher: true,
        startup: 3,
        active: 8,
        duration: 20,
        cooldown: 27,
        lunge: 0,
        hang: 0,
      },
    ]);
    let peak = 0;
    for (let i = 0; i < 9; i++) {
      tick();
      peak = Math.max(peak, rig.slashHop);
    }
    expect(peak).toBeGreaterThan(8);
    tick();
    expect(rig.slashHop).toBeLessThan(0.5);
    for (let i = 0; i < 60; i++) tick();
    // Hurt: thrown left; the recoil holds through the stagger and is gone soon after.
    tick({}, [
      {
        type: 'hurt',
        x: 1000,
        y: 1280,
        dir: -1,
        hp: 3,
        hpMax: 4,
        damage: 1,
        source: { kind: 'burrback', id: 'b' },
        hitX: 1030,
        hitY: 1260,
        stagger: 12,
        invuln: 70,
      },
    ]);
    expect(rig.sig.hurt).toBe(true);
    for (let i = 0; i < 6; i++) tick();
    expect(rig.hurtK).toBeGreaterThan(0.95);
    for (let i = 0; i < 30; i++) tick();
    expect(rig.hurtK).toBe(0);
    // Her last light: she dissolves, stays gone, and re-forms.
    tick({}, [{ type: 'fade', x: 1000, y: 1280, frames: 50 }]);
    for (let i = 0; i < 45; i++) tick();
    expect(rig.fadeK).toBe(1);
    tick({ cx: 400 }, [
      { type: 'reform', x: 400, y: 1280, fromX: 1000, fromY: 1280, hp: 4, hpMax: 4, invuln: 90 },
      { type: 'spawn', x: 400, y: 1280 },
    ]);
    expect(rig.fadeK).toBe(0);
    expect(rig.reformK).toBeGreaterThan(0.9);
    for (let i = 0; i < 40; i++) tick({ cx: 400 });
    expect(rig.reformK).toBe(0);
    for (let i = 0; i < J_COUNT * 2; i++) expect(Number.isFinite(rig.frame.j[i])).toBe(true);
  });

  it('strokes cover the sim hit area: the blade point reaches the edge of slashBox for every step', () => {
    const body = { x: 980, y: 1200, w: 40, h: 80 };
    for (const dir of ['fwd', 'up', 'down'] as const) {
      for (let step = 1; step <= 3; step++) {
        const st = strokeFor(dir, step);
        const box = slashBox(body, dir, 1, tuning, dir === 'down' ? 1 : step);
        const want = dir === 'fwd' ? box.x + box.w - 1000 : box.h;
        expect(st.reach).toBeCloseTo(want, 0);
      }
    }
  });

  it('blade trail: laid from the stroke, lives a few frames, holds in hitstop', () => {
    const trail = new BladeTrail();
    const at = (q: number, out: { x: number; y: number }): void => {
      out.x = Math.cos(q * 2);
      out.y = -Math.sin(q * 2);
    };
    trail.begin({ reach: 110, thick: 0.4, show: 0.2 }, false);
    expect(trail.live).toBe(false);
    for (const q of [0, 0.5, 0.85, 1]) {
      trail.lay(1000, 1240, q, at);
      trail.update(DT, false);
    }
    expect(trail.live).toBe(true);
    for (let i = 0; i < 30; i++) trail.update(DT, true);
    expect(trail.live).toBe(true);
    for (let i = 0; i < 12; i++) trail.update(DT, false);
    expect(trail.live).toBe(false);
  });

  it('camera kick: a few px against the cut, home in about 8 frames, nothing on a miss', () => {
    const kick = new CameraKick();
    const impact = (power: number, dir: 'fwd' | 'up' | 'down', facing: number): SimEvent => ({
      type: 'impact',
      x: 0,
      y: 0,
      dir,
      facing,
      step: power === 2 ? 3 : 1,
      power,
      hits: 1,
    });
    kick.update(DT, []);
    expect(kick.x).toBe(0);
    kick.update(0, [impact(1, 'fwd', 1)]);
    expect(kick.x).toBeCloseTo(-cameraTuning.kick.power1);
    expect(kick.y).toBe(0);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      kick.update(DT, []);
      // Critically damped: it never crosses to the other side.
      expect(kick.x).toBeLessThanOrEqual(0);
      peak = Math.max(peak, Math.abs(kick.x));
    }
    expect(Math.abs(kick.x)).toBeLessThan(0.06 * cameraTuning.kick.power1);
    for (let i = 0; i < 12; i++) kick.update(DT, []);
    expect(kick.x).toBe(0);
    kick.update(0, [impact(2, 'fwd', -1)]);
    expect(kick.x).toBeCloseTo(cameraTuning.kick.power2);
    // The blow that kills kicks harder.
    kick.update(0, [
      impact(2, 'fwd', 1),
      {
        type: 'enemyDie',
        id: 'b',
        kind: 'burrback',
        x: 0,
        y: 0,
        facing: 1,
        slash: 'fwd',
        dir: 1,
        power: 2,
        hpMax: 3,
        knockback: 11,
        hitstop: 3,
        frames: 30,
        value: 3,
        glintFrames: 16,
        stagger: 5,
      },
    ]);
    expect(kick.x).toBeCloseTo(-cameraTuning.kick.power2 * cameraTuning.kick.kill);
    kick.update(0, [impact(1, 'down', 1)]);
    expect(kick.y).toBeLessThan(0);
    expect(kick.x).toBe(0);
    expect(peak).toBeLessThan(cameraTuning.kick.power1);
  });
});
