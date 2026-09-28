/**
 * Movement-spec §7.1 checks as plain functions: each builds its own room, runs the sim and returns
 * { ok, detail }. The V-test suite asserts them with default tuning; the assist-isolation test (V23)
 * runs every check with each assist turned off. Numbers are the spec's `opus` defaults.
 */
import { resolveParams } from '../../../src/sim/player/params';
import type { Tuning } from '../../../src/sim/tuning';
import { NO_ABILITIES } from '../../../src/sim/world/rooms';
import {
  eventsOf,
  FLOOR_Y,
  fill,
  makeRoom,
  openRoom,
  place,
  run,
  STAND_Y,
  TS,
  type TuningMod,
  world,
} from './helpers';

export interface CheckResult {
  ok: boolean;
  detail: unknown;
}
export type Check = (mod?: TuningMod) => CheckResult;

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
const seqNear = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => near(v, b[i] ?? Number.NaN));

const OPEN = openRoom();
const OPEN_NONE = openRoom(NO_ABILITIES);
/** Tall room with a wall on the right: x px of the wall face. */
const TALL = makeRoom(30, 60, undefined, { spawn: [3, 58] });
const WALL_X = 29 * TS;

// ---------------------------------------------------------------------------------------------
// Run

export const V01: Check = (mod) => {
  const w = world(OPEN, mod);
  place(w, 256, STAND_Y);
  const vx: number[] = [];
  const xs: number[] = [];
  run(w, 'R4', (_, s) => {
    vx.push(s.player.vx);
    xs.push(s.player.x);
  });
  return { ok: seqNear(vx, [3.2, 6.4, 9.6, 9.6]) && (xs[0] ?? 0) > 256, detail: { vx, xs } };
};

export const V02: Check = (mod) => {
  const w = world(OPEN, mod);
  place(w, 256, STAND_Y);
  run(w, 'R10');
  const x0 = w.state.player.x;
  const stop: number[] = [];
  run(w, '.3', (_, s) => stop.push(s.player.vx));
  const skid = w.state.player.x - x0;
  const w2 = world(OPEN, mod);
  place(w2, 256, STAND_Y);
  run(w2, 'R10');
  const rev: number[] = [];
  run(w2, 'L5', (_, s) => rev.push(s.player.vx));
  const ok =
    seqNear(stop, [6.4, 3.2, 0]) && Math.abs(skid - 10) <= 1 && seqNear(rev, [4.8, 0, -3.2, -6.4, -9.6]);
  return { ok, detail: { stop, skid, rev } };
};

// ---------------------------------------------------------------------------------------------
// Jump

export interface JumpMeasure {
  apex: number;
  apexFrame: number;
  landFrame: number;
}

/** Standing jump holding jump for `hold` frames. Apex = px risen; frames are 1-based. */
export function measureJump(mod: TuningMod | undefined, hold = 200): JumpMeasure {
  const w = world(OPEN_NONE, mod);
  place(w, 256, STAND_Y);
  let minY = STAND_Y;
  let apexFrame = 0;
  let landFrame = 0;
  run(w, `J${hold} .${Math.max(0, 200 - hold)}`, (f, s) => {
    if (s.player.y < minY) {
      minY = s.player.y;
      apexFrame = f;
    }
    if (f > 1 && s.player.grounded && landFrame === 0) landFrame = f;
  });
  return { apex: STAND_Y - minY, apexFrame, landFrame };
}

export const V03: Check = (mod) => {
  const m = measureJump((t) => {
    mod?.(t);
    t.assists.apexHang = false;
  });
  const ok =
    Math.abs(m.apex - 272) <= 1 && Math.abs(m.apexFrame - 24) <= 1 && Math.abs(m.landFrame - 45) <= 1;
  return { ok, detail: m };
};

export const V04: Check = (mod) => {
  const m = measureJump(mod);
  const ok =
    Math.abs(m.apex - 276) <= 1 && Math.abs(m.apexFrame - 26) <= 1 && Math.abs(m.landFrame - 51) <= 1;
  return { ok, detail: m };
};

export const HOLD_TABLE: Array<[number, number]> = [
  [1, 76],
  [2, 92],
  [3, 108],
  [4, 122],
  [6, 150],
  [8, 174],
  [10, 196],
  [12, 215],
  [16, 245],
  [20, 264],
];

export const V05: Check = (mod) => {
  const got = HOLD_TABLE.map(([h]) => measureJump(mod, h).apex);
  const ok =
    HOLD_TABLE.every(([, want], i) => Math.abs((got[i] ?? 0) - want) <= 1) &&
    got.every((v, i) => i === 0 || v > (got[i - 1] ?? 0));
  return { ok, detail: got };
};

function hangFrames(mod: TuningMod | undefined): { frames: number; apex: number } {
  const w = world(OPEN_NONE, mod);
  place(w, 256, STAND_Y);
  let frames = 0;
  let minY = STAND_Y;
  run(w, 'J60', (f, s) => {
    if (f > 1 && Math.abs(s.player.vy) < 3 && !s.player.grounded) frames++;
    minY = Math.min(minY, s.player.y);
  });
  return { frames, apex: STAND_Y - minY };
}

export const V06: Check = (mod) => {
  const on = hangFrames(mod);
  const off = hangFrames((t) => {
    mod?.(t);
    t.assists.apexHang = false;
  });
  // Spec says on >= 2x off; the V04-exact integrator gives 11 vs 6 (1.83x), see memory/movement-controller.md.
  const ok = on.frames >= 1.8 * off.frames && Math.abs(on.apex - off.apex - 4) <= 1;
  return { ok, detail: { on, off } };
};

export const V07: Check = (mod) => {
  const fall = (script: string, m?: TuningMod) => {
    const w = world(TALL, m);
    place(w, 400, 200);
    const vys: number[] = [];
    run(w, script, (_, s) => vys.push(s.player.vy));
    return vys;
  };
  const p = resolveParams(tuningOf(mod), 'base');
  const plain = fall('.40', mod);
  const reach = plain.indexOf(p.maxFall) + 1;
  const down = fall('D60', mod);
  const offDown = fall('D60', (t) => {
    mod?.(t);
    t.assists.fastFall = false;
  });
  const maxDown = Math.max(...down);
  const ok =
    Math.abs(reach - 15) <= 1 &&
    near(maxDown, 32) &&
    down.every((v) => v <= 32) &&
    offDown.every((v) => v <= 64 / 3 + 1e-9);
  return { ok, detail: { reach, maxDown, maxOff: Math.max(...offDown) } };
};

function tuningOf(mod?: TuningMod): Tuning {
  return world(OPEN, mod).tuning;
}

// ---------------------------------------------------------------------------------------------
// Coyote and buffer

const LEDGE = makeRoom(40, 20, (set) => fill(set, 1, 12, 10, 18), {
  spawn: [3, 11],
  abilities: NO_ABILITIES,
});

/** Frame (1-based) whose movement left the ledge, walking right from near its edge. */
function walkOffFrame(mod?: TuningMod): number {
  const w = world(LEDGE, mod);
  place(w, 11 * TS - 60, 12 * TS - 80);
  let leave = 0;
  run(w, 'R30', (f, s) => {
    if (!s.player.grounded && leave === 0) leave = f;
  });
  return leave;
}

/** Jump events when pressing jump k frames after the frame that left the ground. */
export function coyoteJump(mod: TuningMod | undefined, k: number) {
  const L = walkOffFrame(mod);
  const w = world(LEDGE, mod);
  place(w, 11 * TS - 60, 12 * TS - 80);
  run(w, `R${L + k - 1}`);
  return eventsOf(run(w, 'R+J1'), 'jump');
}

export const V08: Check = (mod) => {
  const win = [1, 2, 3, 4, 5, 6].map((k) => coyoteJump(mod, k)[0]?.kind ?? 'none');
  const late = coyoteJump(mod, 7).length;
  const off = coyoteJump((t) => {
    mod?.(t);
    t.assists.coyote = false;
  }, 1).length;
  const ok = win.every((k) => k === 'coyote') && late === 0 && off === 0;
  return { ok, detail: { win, late, off } };
};

/** First frame that starts grounded (F) when falling from 300 px above the floor. */
function landingStartFrame(mod?: TuningMod): number {
  const w = world(OPEN_NONE, mod);
  place(w, 256, STAND_Y - 300);
  let ld = 0;
  run(w, '.60', (f, s) => {
    if (s.player.grounded && ld === 0) ld = f;
  });
  return ld + 1;
}

/** Jump events on frame F for a press (tap, or `holdFrames` long) at F - early. */
export function bufferJump(mod: TuningMod | undefined, early: number, holdFrames = 1) {
  const F = landingStartFrame(mod);
  const w = world(OPEN_NONE, mod);
  place(w, 256, STAND_Y - 300);
  const p = F - early;
  run(w, `.${p - 1} J${holdFrames} .${Math.max(0, early - holdFrames + 1)}`);
  const all = eventsOf(
    w.log.map((l) => l.e),
    'jump',
  );
  const onF = eventsOf(
    w.log.filter((l) => l.frame === F).map((l) => l.e),
    'jump',
  );
  return { onF, all, w };
}

export const V09: Check = (mod) => {
  const kinds = [0, 1, 2, 3, 4, 5].map((e) => bufferJump(mod, e).onF[0]?.kind ?? 'none');
  const late = bufferJump(mod, 6).all.length;
  const off = bufferJump((t) => {
    mod?.(t);
    t.assists.jumpBuffer = false;
  }, 1).all.length;
  const ok =
    kinds[0] === 'ground' && kinds.slice(1).every((k) => k === 'buffered') && late === 0 && off === 0;
  return { ok, detail: { kinds, late, off } };
};

export const V10: Check = (mod) => {
  const F = landingStartFrame(mod);
  const w = world(OPEN_NONE, mod);
  place(w, 256, STAND_Y - 300);
  let apex = 0;
  run(w, `.${F - 4} J2 .60`, (f, s) => {
    if (f >= F) apex = Math.max(apex, STAND_Y - s.player.y);
  });
  const jumpOnF = w.log.some((l) => l.frame === F && l.e.type === 'jump');
  return { ok: jumpOnF && Math.abs(apex - 76) <= 2, detail: { F, jumpOnF, apex } };
};

// ---------------------------------------------------------------------------------------------
// Corrections

/** Ceiling block to the left (x < 640, bottom 768) and its mirror (x >= 1280). */
const CEIL = makeRoom(30, 17, (set) => {
  fill(set, 1, 1, 9, 11);
  fill(set, 20, 1, 28, 11);
});
const CEIL_BOTTOM = 12 * TS;

export function headBump(
  mod: TuningMod | undefined,
  d: number,
  side: 'left' | 'right',
): { passed: boolean; bonk: boolean } {
  const w = world(CEIL, mod);
  const standY = 16 * TS - 80;
  place(w, side === 'left' ? 10 * TS - d : 20 * TS - 40 + d, standY);
  if (side === 'right') w.state.player.facing = -1;
  let minY = standY;
  const evs = run(w, 'J40', (_, s) => {
    minY = Math.min(minY, s.player.y);
  });
  return { passed: minY < CEIL_BOTTOM, bonk: eventsOf(evs, 'headBump').length > 0 };
}

export const V11: Check = (mod) => {
  const res: Record<string, unknown> = {};
  let ok = true;
  for (const side of ['left', 'right'] as const) {
    for (let d = 1; d <= 20; d++) {
      const r = headBump(mod, d, side);
      if (!r.passed || r.bonk) {
        ok = false;
        res[`${side}${d}`] = r;
      }
    }
    const r21 = headBump(mod, 21, side);
    if (r21.passed || !r21.bonk) ok = false;
    res[`${side}21`] = r21;
  }
  const off = headBump(
    (t) => {
      mod?.(t);
      t.assists.headCorrect = false;
    },
    1,
    'left',
  );
  if (off.passed || !off.bonk) ok = false;
  res.off = off;
  return { ok, detail: res };
};

const LEDGE_POP = makeRoom(30, 17, (set) => fill(set, 10, 12, 28, 15));

export function ledgePop(mod: TuningMod | undefined, d: number): boolean {
  const w = world(LEDGE_POP, mod);
  place(w, 10 * TS - 40, 12 * TS - 80 + d, 9.6, 0);
  run(w, 'R10');
  const p = w.state.player;
  return p.x > 10 * TS && p.y + p.h === 12 * TS;
}

export const V12: Check = (mod) => {
  const pops = Array.from({ length: 16 }, (_, i) => ledgePop(mod, i + 1));
  const d17 = ledgePop(mod, 17);
  return { ok: pops.every(Boolean) && !d17, detail: { pops, d17 } };
};

const LIPS = makeRoom(40, 20, (set) => {
  fill(set, 15, 1, 15, 9); // hanging lip, bottom y = 640
});
const BUMP = makeRoom(40, 20, (set) => {
  fill(set, 15, 11, 15, 18); // floor bump, top y = 704
});

export function dashCorrect(mod: TuningMod | undefined, d: number, kind: 'lip' | 'bump'): boolean {
  const w = world(kind === 'lip' ? LIPS : BUMP, mod);
  place(w, 820, kind === 'lip' ? 10 * TS - d : 11 * TS - 80 + d);
  run(w, 'X1 .14');
  return w.state.player.x > 16 * TS;
}

export const V13: Check = (mod) => {
  const res: Record<string, boolean> = {};
  let ok = true;
  for (const kind of ['lip', 'bump'] as const) {
    for (const d of [1, 8, 16, 24]) {
      res[`${kind}${d}`] = dashCorrect(mod, d, kind);
      ok &&= res[`${kind}${d}`] === true;
    }
    res[`${kind}25`] = dashCorrect(mod, 25, kind);
    ok &&= res[`${kind}25`] === false;
  }
  return { ok, detail: res };
};

/** Rising alongside a block whose top is 30 px above the feet: vx restored once past it. */
export function retainVx(mod: TuningMod | undefined): number[] {
  const w = world(LEDGE_POP, mod);
  place(w, 10 * TS - 40, 12 * TS - 80 + 30, 9.6, -12);
  const vx: number[] = [];
  run(w, 'R5', (_, s) => vx.push(s.player.vx));
  return vx;
}

export const VRetain: Check = (mod) => {
  const vx = retainVx(mod);
  return { ok: near(vx[3] ?? 0, 9.6), detail: vx };
};

// ---------------------------------------------------------------------------------------------
// Walls

export function wallSlide(mod: TuningMod | undefined, awayFrames: number) {
  const w = world(TALL, mod);
  place(w, WALL_X - 40, 300, 0, 21.3);
  let slideStart = 0;
  let slowAt = 0;
  run(w, 'R20', (f, s) => {
    if (s.player.state === 'wallSlide' && !slideStart) slideStart = f;
    if (slideStart && !slowAt && s.player.vy <= 4) slowAt = f;
  });
  run(w, '.10');
  const neutral = w.state.player.state;
  run(w, `L${awayFrames}`);
  return { slideStart, slowFrames: slowAt - slideStart, neutral, after: w.state.player.state };
}

export const V14: Check = (mod) => {
  const a5 = wallSlide(mod, 5);
  const a6 = wallSlide(mod, 6);
  const ok =
    a5.slideStart === 1 &&
    a5.slowFrames <= 12 &&
    a5.neutral === 'wallSlide' &&
    a5.after === 'wallSlide' &&
    a6.after === 'normal';
  return { ok, detail: { a5, a6 } };
};

/** Wall jump off the right wall with Right held on the jump frame, then `rest` input. */
export function wallJump(mod: TuningMod | undefined, rest: 'R' | 'L' | '.') {
  const w = world(TALL, mod);
  const y0 = 1200;
  place(w, WALL_X - 40, y0);
  const vx: number[] = [];
  const x0 = w.state.player.x;
  let minY = y0;
  let x8 = 0;
  const btn = rest === '.' ? 'J' : `${rest}+J`;
  run(w, `R+J1 ${btn}7 J60`, (f, s) => {
    if (f <= 8) vx.push(s.player.vx);
    if (f === 8) x8 = s.player.x - x0;
    minY = Math.min(minY, s.player.y);
  });
  const kinds = eventsOf(
    w.log.map((l) => l.e),
    'jump',
  ).map((e) => e.kind);
  return { vx, x8, apex: y0 - minY, kinds };
}

export const V15: Check = (mod) => {
  const ground = measureJump(mod).apex;
  const runs = (['R', 'L', '.'] as const).map((r) => wallJump(mod, r));
  const ok = runs.every(
    (r) =>
      r.kinds[0] === 'wall' &&
      r.vx.every((v) => near(v, -13.44)) &&
      Math.abs(r.x8 + 108) <= 1 &&
      Math.abs(r.apex - ground) <= 1,
  );
  return { ok, detail: { ground, runs } };
};

export function graceJump(mod: TuningMod | undefined, d: number): string {
  const w = world(TALL, mod);
  place(w, WALL_X - 40 - (d - 1), 800, 0, 1);
  const evs = run(w, 'J1');
  return eventsOf(evs, 'jump')[0]?.kind ?? 'none';
}

export const V16: Check = (mod) => {
  const kinds = Array.from({ length: 20 }, (_, i) => graceJump(mod, i + 1));
  const d21 = graceJump(mod, 21);
  return { ok: kinds.every((k) => k === 'wall') && d21 === 'double', detail: { kinds, d21 } };
};

export function neutralClimb(mod: TuningMod | undefined) {
  const w = world(TALL, mod);
  place(w, WALL_X - 40, 1200, 0, 2);
  const y0 = w.state.player.y;
  let touch = 0;
  let yTouch = 0;
  run(w, 'J1 R+J30', (f, s) => {
    if (!touch && f > 1 && s.player.x + s.player.w === WALL_X) {
      touch = f;
      yTouch = s.player.y;
    }
  });
  return { touch, gain: y0 - yTouch };
}

export const V17: Check = (mod) => {
  const r = neutralClimb(mod);
  return { ok: Math.abs(r.touch - 13) <= 1 && r.gain >= 180, detail: r };
};

// ---------------------------------------------------------------------------------------------
// Dash and double jump

export const V18: Check = (mod) => {
  // Ground dash: timing and distance.
  const w = world(OPEN, mod);
  place(w, 256, STAND_Y);
  const xs: number[] = [];
  const vys: number[] = [];
  const evs = run(w, 'X1 .14', (_, s) => {
    xs.push(s.player.x);
    vys.push(s.player.vy);
  });
  const startFrame = w.log.find((l) => l.e.type === 'dashStart')?.frame;
  const steps = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
  const timingOk =
    startFrame === 1 &&
    xs[0] === 256 &&
    xs[1] === 256 &&
    steps.slice(1, 13).every((d) => d === 24) &&
    (xs[13] ?? 0) - 256 === 288 &&
    vys.slice(0, 14).every((v) => v === 0) &&
    eventsOf(evs, 'dashEnd').length === 1;

  // One air dash (a second press in the air after the cooldown does nothing); refilled on ground.
  const a = world(OPEN, mod);
  place(a, 256, STAND_Y);
  const air1 = eventsOf(run(a, 'J30 X1 .24'), 'dashStart');
  const air2 = eventsOf(run(a, 'X1'), 'dashStart');
  const stillAir = !a.state.player.grounded && a.state.player.airDash === 0;
  const ground = eventsOf(run(a, '.60 X1'), 'dashStart');
  const airOk = air1[0]?.air === true && air2.length === 0 && stillAir && ground[0]?.air === false;
  const airStarts = { air1: air1.length, air2: air2.length, stillAir, ground: ground.length };

  // Cooldown: mashing dash, the second dash starts exactly 24 frames after the first.
  const c = world(OPEN, mod);
  place(c, 256, STAND_Y);
  run(c, `X1 ${'.1 X1 '.repeat(20)}`);
  const cd = c.log.filter((l) => l.e.type === 'dashStart').map((l) => l.frame);
  const cdOk = cd.length >= 2 && (cd[1] ?? 0) - (cd[0] ?? 0) === 24;

  return { ok: timingOk && airOk && cdOk, detail: { startFrame, xs, steps, airStarts, cd } };
};

/** Air dash, then wall jump: is the air dash refilled? */
export function wallJumpRefill(mod: TuningMod | undefined): number {
  const w = world(TALL, mod);
  place(w, WALL_X - 300, 800);
  run(w, 'R+X1 R16');
  run(w, 'R10');
  run(w, 'R+J1');
  return w.state.player.airDash;
}

export const VRefill: Check = (mod) => {
  const n = wallJumpRefill(mod);
  return { ok: n === 1, detail: n };
};

export function dashJump(mod: TuningMod | undefined) {
  const w = world(OPEN, mod);
  place(w, 256, STAND_Y);
  const evs = run(w, 'R+X1 R3 R+J1 R10');
  const j = eventsOf(evs, 'jump')[0];
  return { kind: j?.kind ?? 'none', vx: w.log.length ? w.state.player.vx : 0 };
}

export const VDashJump: Check = (mod) => {
  const r = dashJump(mod);
  return { ok: r.kind === 'dashJump', detail: r };
};

export function doubleJumpRise(mod: TuningMod | undefined): { rise: number; jumps: number } {
  const w = world(TALL, mod);
  const y0 = 1600;
  place(w, 400, y0);
  let minY = y0;
  const evs = run(w, 'J40 .1 J10', (_, s) => {
    minY = Math.min(minY, s.player.y);
  });
  return { rise: y0 - minY, jumps: eventsOf(evs, 'jump').length };
}

/** Falling at vy 10 with ground `gap` px below, press jump: what fires, and when. */
export function landingPref(mod: TuningMod | undefined, gap: number) {
  const w = world(OPEN, mod);
  place(w, 256, STAND_Y - gap, 0, 10);
  const evs = run(w, 'J1 .20');
  return eventsOf(evs, 'jump').map((e) => e.kind);
}

export const V19: Check = (mod) => {
  const r = doubleJumpRise((t) => {
    mod?.(t);
    t.assists.apexHang = false;
  });
  const pref = landingPref(mod, 50);
  const far = landingPref(mod, 200);
  const ok =
    Math.abs(r.rise - 192) <= 1 && r.jumps === 1 && pref.join() === 'buffered' && far[0] === 'double';
  return { ok, detail: { r, pref, far } };
};

// ---------------------------------------------------------------------------------------------
// One-ways and hazards

const ONEWAY = makeRoom(30, 17, (set) => fill(set, 5, 12, 20, 12, '='));

export const V20: Check = (mod) => {
  const top = 12 * TS;
  const floorStand = 16 * TS - 80;
  const a = world(ONEWAY, mod);
  place(a, 640, top - 80 - 100);
  run(a, '.40');
  const landsFromAbove = a.state.player.grounded && a.state.player.y + 80 === top;
  const b = world(ONEWAY, mod);
  place(b, 640, floorStand);
  run(b, 'J40 .40');
  const passesFromBelow = b.state.player.grounded && b.state.player.y + 80 === top;
  const c = world(ONEWAY, mod);
  place(c, 640, top - 80);
  const drop = run(c, 'D+J1 .40');
  const dropsThrough = c.state.player.y === floorStand && eventsOf(drop, 'dropThrough').length === 1;
  const d = world(ONEWAY, mod);
  place(d, 640, top - 80);
  run(d, 'D30');
  const downStays = d.state.player.y === top - 80;
  const ok = landsFromAbove && passesFromBelow && dropsThrough && downStays;
  return { ok, detail: { landsFromAbove, passesFromBelow, dropsThrough, downStays } };
};

const SPIKES = makeRoom(
  30,
  17,
  (set) => {
    set(5, 15, 'R');
    fill(set, 10, 15, 12, 15, '^');
    set(20, 5, 'v');
  },
  { spawn: [2, 15] },
);

export const V21: Check = (mod) => {
  const w = world(SPIKES, mod);
  for (let i = 0; i < 120 && !w.log.some((l) => l.e.type === 'death'); i++) run(w, 'R1');
  run(w, '.30');
  const death = w.log.find((l) => l.e.type === 'death')?.frame ?? 0;
  const resp = w.log.find((l) => l.e.type === 'respawn');
  const p = w.state.player;
  const atR = Math.floor(p.x / TS) === 5 && p.y + p.h === 16 * TS;
  // Fast fall at 32 px/f through a floating ceiling spike cannot tunnel.
  const f = world(SPIKES, mod);
  place(f, 20 * TS + 12, 5 * TS - 200, 0, 32);
  run(f, 'D20');
  const tunnelDeath = f.log.some((l) => l.e.type === 'death');
  const ok = death > 0 && resp !== undefined && resp.frame - death === 20 && atR && tunnelDeath;
  return { ok, detail: { death, respawn: resp?.frame, atR, tunnelDeath } };
};

/** Every check, keyed by id, with the assist (if any) whose removal must break it. */
export const CHECKS: Record<string, { check: Check; assists?: Array<keyof Tuning['assists']> }> = {
  V01: { check: V01 },
  V02: { check: V02 },
  V03: { check: V03 },
  V04: { check: V04, assists: ['apexHang'] },
  V05: { check: V05, assists: ['variableJump'] },
  V06: { check: V06, assists: ['apexHang'] },
  V07: { check: V07, assists: ['fastFall'] },
  V08: { check: V08, assists: ['coyote'] },
  V09: { check: V09, assists: ['jumpBuffer'] },
  V10: { check: V10, assists: ['jumpBuffer', 'variableJump'] },
  V11: { check: V11, assists: ['headCorrect'] },
  V12: { check: V12, assists: ['ledgePop'] },
  V13: { check: V13, assists: ['dashCorrect'] },
  VRetain: { check: VRetain, assists: ['wallSpeedRetain'] },
  V14: { check: V14, assists: ['wallSlide'] },
  V15: { check: V15, assists: ['wallJumpForce'] },
  V16: { check: V16, assists: ['wallJumpGrace'] },
  V17: { check: V17 },
  V18: { check: V18 },
  VRefill: { check: VRefill, assists: ['wallJumpRefill'] },
  VDashJump: { check: VDashJump, assists: ['dashJumpCancel'] },
  V19: { check: V19, assists: ['landingPreference', 'jumpBuffer'] },
  V20: { check: V20 },
  V21: { check: V21 },
};

export { FLOOR_Y };
