/**
 * Lanternroot's scripted proofs (tools/solve/proto-1.ts): the edges a plain search cannot judge, played in the real
 * sim with closed-loop hands. Each leg of movement inside them is still the explorer's (a line found from where she
 * stands, the creatures and the clocks as they are), so a driver only adds what a search over places cannot: the
 * order of things, a wait, a rhythm, a fight.
 *
 *  - `vault`: kindle M-g1, round the wall to M-g2, fan M-g1 through the window and kindle M-g2, round to M-g3, fan
 *    M-g2, kindle M-g3: the set burns whole, the vault's silk drops, a moon-drop.
 *  - `answer`: gust the bramble pair out from under them (the rest of the trunk's lamps spent), then strike the cap
 *    long, short, short, long.
 *  - `ram`: stand on the heartwood's root shelf; the burrback rams the face and breaks it; walk in to H3.
 *  - `gloam`: the Gloamweaver, start to finish.
 *
 * Pure: Node and tests.
 */
import type { Room } from '../../src/scene/room';
import { PROTO_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { kindleTarget } from '../../src/sim/light';
import type { GameState } from '../../src/sim/state';
import type { Tuning } from '../../src/sim/tuning';
import { explore, feet, pathTo } from './explore';
import { meets, setup } from './proto-1';

const L = ActionBit.left;
const R = ActionBit.right;
const U = ActionBit.up;
const J = ActionBit.jump;
const A = ActionBit.attack;
const B = ActionBit.lamp;

export interface DriverResult {
  ok: boolean;
  frames: number;
  why?: string;
  /** Every input it gave, run-length (`[mask, count, ...]`): replayed from the same setup it is the same run. */
  tape?: number[];
}

/** The setups the drivers start from (a stored tape replays from the same one). */
export const DRIVER_SETUPS: Record<
  string,
  { room: string; at: string; kit: string[]; flags?: string[]; creatures: boolean }
> = {
  vault: {
    room: 'lr-hall',
    at: 'gallery-w',
    kit: ['glide', 'wallJump', 'doubleJump', 'kindle', 'gust'],
    creatures: false,
  },
  answer: {
    room: 'lr-night',
    at: 'cap-side',
    kit: ['glide', 'wallJump', 'doubleJump', 'kindle', 'gust'],
    creatures: true,
  },
  ram: {
    room: 'lr-roots',
    at: 'heartwood-top',
    kit: ['glide', 'wallJump', 'doubleJump', 'kindle'],
    flags: ['gloam-down'],
    creatures: true,
  },
  gloam: {
    room: 'lr-roots',
    at: 'arena',
    kit: ['glide', 'wallJump', 'doubleJump', 'kindle'],
    creatures: true,
  },
};

/** A run being driven: its state, room, tuning and the events of every step. */
class Run {
  frames = 0;
  events: SimEvent[] = [];
  /** The inputs given, run-length. */
  tape: number[] = [];
  constructor(
    public s: GameState,
    readonly room: Room,
    readonly t: Tuning,
  ) {}

  /** Steps `mask` `n` frames; returns their events. */
  run(mask: number, n = 1): SimEvent[] {
    const from = this.events.length;
    for (let i = 0; i < n; i++) {
      step(this.s, mask, this.t, this.room, this.events, PROTO_WORLD);
      this.frames++;
      const k = this.tape.length;
      if (k >= 2 && this.tape[k - 2] === mask) this.tape[k - 1] = (this.tape[k - 1] as number) + 1;
      else this.tape.push(mask, 1);
    }
    return this.events.slice(from);
  }

  /** Steps `mask` (or `mask(k)`) until `pred`, at most `max` frames. */
  until(mask: number | ((k: number) => number), pred: () => boolean, max = 600): boolean {
    for (let k = 0; k < max; k++) {
      if (pred()) return true;
      this.run(typeof mask === 'number' ? mask : mask(k));
    }
    return pred();
  }

  /**
   * A leg: the explorer finds a line from here to `to` (a place or a find of the room, or a predicate), with the
   * creatures and the clocks as they stand, and it is played for real. False if no line was found.
   */
  leg(
    to: string | ((s: GameState) => boolean),
    opts: { creatures?: boolean; budget?: number; kindle?: boolean } = {},
  ): boolean {
    const goal = typeof to === 'string' ? (s: GameState) => meets(this.room, to, s) : to;
    if (goal(this.s)) return true;
    const res = explore({
      scene: this.room,
      tuning: this.t,
      start: [this.s],
      world: PROTO_WORLD,
      creatures: opts.creatures ?? true,
      keepLamps: false,
      glow: null,
      kindle: opts.kindle ?? false,
      maxNodes: opts.budget ?? 1500,
      order: 'time',
      goal,
    });
    for (const n of res.nodes.values()) {
      if (!goal(n.state)) continue;
      for (const m of pathTo(res, n).tape) this.run(m);
      if (process.env.LR_DEBUG && !goal(this.s))
        console.log('leg diverged:', pathTo(res, n).macros.join(' > '), feet(n.state), this.feet());
      return goal(this.s);
    }
    if (process.env.LR_DEBUG) console.log('leg: no line', res.nodes.size, res.truncated);
    return false;
  }

  feet(): { x: number; y: number } {
    return feet(this.s);
  }

  lure(id: string): number {
    return (this.room.lures ?? []).findIndex((l) => l.id === id);
  }

  burning(id: string): boolean {
    return (this.s.lures.hp[this.lure(id)] ?? 0) > 0;
  }
}

/** A driver's start (its setup; the creatures left out where it says). */
export function driverStart(name: string): { state: GameState; room: Room; t: Tuning } {
  const d = DRIVER_SETUPS[name];
  if (!d) throw new Error(`no driver ${name}`);
  const { state, room, t } = setup({ room: d.room, at: d.at, kit: d.kit, flags: d.flags ?? [], lamps: [] });
  if (d.creatures) return { state, room, t };
  state.enemies = state.enemies.map((e) => ({ ...e, gone: true }));
  return { state, room: { ...room, enemies: [] } as Room, t };
}

/** Walks to feet x `x` on the ground she stands on (pressing only while far: no slide past it), settled. */
function walkTo(r: Run, x: number, max = 120): boolean {
  return r.until(
    () => {
      const dx = x - r.feet().x;
      const v = r.s.player.vx;
      if (Math.abs(dx) < 10) return 0;
      // (Press while the speed it has would not carry it past.)
      if (Math.abs(v) * 6 > Math.abs(dx)) return 0;
      return dx > 0 ? R : L;
    },
    () => Math.abs(x - r.feet().x) < 12 && Math.abs(r.s.player.vx) < 0.5,
    max,
  );
}

/** Taps Lamp (a kindle in reach, or a gust that way with nothing in reach): 2 frames held, then let go. */
function tapLamp(r: Run, aim = 0): void {
  r.run(aim | B, 2);
  r.run(0, 3);
}

/** Puzzle 5, the vault. */
function vault(): DriverResult {
  // (The proof is the route and the clocks: the gallery's creatures are left out, the hawker's shy rule is in
  // tests/unit/proto-1-puzzles.test.ts. Three kindles are 18 glow: she comes with a full meter.)
  const { state, room, t } = driverStart('vault');
  const r = new Run(state, room, t);
  if (!r.leg('vault-s1', { creatures: false, budget: 2500 }))
    return { ok: false, frames: r.frames, why: 'S1 not reached' };
  // Kindle M-g1 where it stands.
  r.until(
    () => (r.feet().x < 3980 ? R : L),
    () => kindleTarget(r.s, room, t) >= 0,
    120,
  );
  tapLamp(r);
  if (!r.burning('m-g1')) return { ok: false, frames: r.frames, why: 'M-g1 not kindled' };
  const t1 = r.frames;
  // Round W1 to S2.
  if (!r.leg('vault-s2', { creatures: false, budget: 8000 }))
    return { ok: false, frames: r.frames, why: 'S2 not reached' };
  const gone1 = !r.burning('m-g1');
  // Fan M-g1 back through the window (she faces west on S2's west end), then kindle M-g2.
  walkTo(r, 4300);
  tapLamp(r, L);
  r.until(
    () => (r.feet().x < 4460 ? R : L),
    () => kindleTarget(r.s, room, t) >= 0,
    60,
  );
  tapLamp(r);
  if (!r.burning('m-g2'))
    return { ok: false, frames: r.frames, why: `M-g2 not kindled (M-g1 out on arrival: ${gone1})` };
  // Round W2 to S3 (M-g1, fanned, and M-g2 still burn); kindle M-g3.
  r.until(
    () => (r.feet().x < 4460 ? R : L),
    () => Math.abs(r.feet().x - 4460) < 6,
    40,
  );
  r.run(0, 2);
  if (process.env.LR_DEBUG)
    console.log(
      'before leg2',
      r.feet(),
      r.s.player.grounded,
      r.s.lures.hp.join(''),
      r.s.lures.burn.join(','),
      r.frames - t1,
    );
  if (!r.leg('vault-s3', { creatures: false, budget: 6000 }))
    return { ok: false, frames: r.frames, why: 'S3 not reached' };
  r.until(
    () => (r.feet().x < 4760 ? R : L),
    () => kindleTarget(r.s, room, t) >= 0,
    60,
  );
  const ev3 = r.events.length;
  tapLamp(r);
  r.run(0, 4);
  if (process.env.LR_DEBUG)
    console.log(
      'g3 tap',
      r.feet(),
      r.s.player.glow,
      r.events
        .slice(ev3)
        .map((e) => e.type)
        .join(','),
    );
  if (!r.s.save.flags.includes('vault-open'))
    return {
      ok: false,
      frames: r.frames,
      why: `the set did not burn whole (g1 ${r.burning('m-g1')}, g2 ${r.burning('m-g2')}, g3 ${r.burning('m-g3')}; ${r.frames - t1} frames from the first kindle)`,
    };
  // Into the vault: its moon-drop.
  if (!r.leg('find:vault-drop', { creatures: false }))
    return { ok: false, frames: r.frames, why: 'the moon-drop not reached' };
  return { ok: true, frames: r.frames, tape: r.tape };
}

/** The Answer on the cap. */
function answer(): DriverResult {
  const { state, room, t } = driverStart('answer');
  const r = new Run(state, room, t);
  // Under the bramble crown: a gust up puts both of its lamps out.
  if (!r.leg((s) => Math.abs(feet(s).x - 3030) < 30 && s.player.grounded, { creatures: false }))
    return { ok: false, frames: r.frames, why: 'not under the brambles' };
  r.run(0, 4);
  tapLamp(r, U);
  r.run(0, 40);
  if (r.burning('l-b1a') || r.burning('l-b1b'))
    return { ok: false, frames: r.frames, why: 'the bramble pair still burns' };
  // To the cap's side, facing it.
  if (!r.leg((s) => Math.abs(feet(s).x - 3440) < 16 && s.player.grounded, { creatures: false }))
    return { ok: false, frames: r.frames, why: 'not at the cap' };
  r.run(0, 30);
  r.s.player.facing = 1;
  const gaps = [50, 20, 20, 50];
  r.run(A, 1);
  for (const g of gaps) {
    r.run(0, g - 1);
    r.run(A, 1);
  }
  r.run(0, 30);
  return r.s.save.flags.includes('answer')
    ? { ok: true, frames: r.frames, tape: r.tape }
    : { ok: false, frames: r.frames, why: 'the cap did not answer' };
}

/** Puzzle 4, the ram. */
function ram(): DriverResult {
  const { state, room, t } = driverStart('ram');
  const r = new Run(state, room, t);
  const hi = (room.bark ?? []).findIndex((b) => b.id === 'heartwood');
  // She stands on the shelf by its west lip; the beetle braces at her and rams the face.
  r.until(
    () => (r.feet().x > 5540 ? L : 0),
    () => r.feet().x <= 5540,
    60,
  );
  const broke = r.until(0, () => (r.s.kit.bark[hi] ?? 1) <= 0, 900);
  if (!broke) return { ok: false, frames: r.frames, why: 'the burrback never broke the heartwood' };
  const how = r.events.find((e) => e.type === 'barkBreak' && e.id === 'heartwood');
  if (how?.type !== 'barkBreak' || how.by !== 'ram')
    return { ok: false, frames: r.frames, why: 'broken, not by the ram' };
  if (!r.leg('find:h3', { creatures: true, budget: 2000 }))
    return { ok: false, frames: r.frames, why: 'H3 not reached' };
  return { ok: true, frames: r.frames, tape: r.tape };
}

/** The Gloamweaver, start to finish, with every creature in. */
function gloam(): DriverResult {
  const { state, room, t } = driverStart('gloam');
  const r = new Run(state, room, t);
  const spider = () => r.s.enemies.find((e) => e.id === 'gloamweaver');
  const boss = () => r.s.boss;
  if (!r.until(0, () => boss()?.stage === 'fight', 240))
    return { ok: false, frames: r.frames, why: 'no lock' };
  // P1: at a cold low wick, wait for it to come (round its orb, or a lunge at her), kindle, cut it where it falls.
  for (const [place, wick, wx, wy] of [
    ['arena-w1', 'm-w1', 2140, 1010],
    ['arena-w4', 'm-w4', 3620, 1010],
    ['arena-w1', 'm-w1', 2140, 1010],
    ['arena-w4', 'm-w4', 3620, 1010],
  ] as const) {
    if (boss()?.phase !== 1 || boss()?.stage !== 'fight') break;
    if (!r.leg(place)) return { ok: false, frames: r.frames, why: `P1: ${place} not reached` };
    const near = () => {
      const e = spider();
      if (!e || !['hunt', 'windup', 'dive', 'stall', 'climb'].includes(e.mode)) return false;
      const dx = e.x + e.w / 2 - wx;
      const dy = e.y + e.h / 2 - wy;
      return dx * dx + dy * dy < 360 * 360;
    };
    if (
      !r.until(
        (k) => {
          if (process.env.LR_DEBUG && k % 200 === 0)
            console.log(
              '  wait',
              k,
              r.feet(),
              spider()?.mode,
              spider()?.x,
              spider()?.y,
              r.s.player.hp,
              boss()?.phase,
            );
          return guardInput(r, wx, k, wy + 50);
        },
        () => near() && !r.burning(wick) && kindleTarget(r.s, room, t) >= 0,
        2400,
      )
    )
      return { ok: false, frames: r.frames, why: 'P1: it never came' };
    if (r.s.player.glow < t.glow.kindleCost)
      return { ok: false, frames: r.frames, why: 'P1: no glow to kindle' };
    const ev0 = r.events.length;
    tapLamp(r);
    if (process.env.LR_DEBUG)
      console.log(
        'P1 tap',
        r.feet(),
        spider()?.mode,
        spider()?.x,
        spider()?.y,
        r.events
          .slice(ev0)
          .map((e) => e.type)
          .join(','),
      );
    if (!r.until(0, () => spider()?.mode === 'recover', 120))
      return { ok: false, frames: r.frames, why: 'P1: not exposed' };
    const cut = cutWhileOpen(r, spider);
    if (process.env.LR_DEBUG) console.log('P1 cuts', cut, spider()?.hp, spider()?.mode, r.feet());
    if (!cut) return { ok: false, frames: r.frames, why: 'P1: could not cut it' };
  }
  if (!r.until(0, () => boss()?.phase === 2 && boss()?.stage === 'fight', 400))
    return { ok: false, frames: r.frames, why: `P2 never began (phase ${boss()?.phase})` };
  // P2: away from each drop (its safe place), then cut it while it hangs winded.
  for (let guard = 0; guard < 12 && boss()?.phase === 2; guard++) {
    if (!r.until(0, () => boss()?.tell === 'swing' || boss()?.phase !== 2, 600)) break;
    const safe = boss()?.safeX ?? -1;
    if (safe > 0) r.leg((s) => Math.abs(feet(s).x - safe) < 40 && s.player.grounded && feet(s).y >= 1290);
    if (!r.until(0, () => spider()?.mode === 'recover' || boss()?.phase !== 2, 400)) continue;
    cutWhileOpen(r, spider);
  }
  if (!r.until(0, () => boss()?.phase === 3 && boss()?.stage === 'fight', 600))
    return { ok: false, frames: r.frames, why: `P3 never began (phase ${boss()?.phase})` };
  // P3: the west low wick's moss to the west high wick, a fling past the hub to the east one; both lit: it falls.
  if (!r.leg('arena-w1')) return { ok: false, frames: r.frames, why: 'P3: W1 not reached' };
  tapLamp(r);
  if (!r.leg('arena-w2')) return { ok: false, frames: r.frames, why: 'P3: W2 not reached' };
  tapLamp(r);
  if (!r.leg('arena-w3', { budget: 2500 })) return { ok: false, frames: r.frames, why: 'P3: W3 not reached' };
  tapLamp(r);
  if (!r.until(0, () => spider()?.mode === 'recover', 200))
    return { ok: false, frames: r.frames, why: 'P3: it did not fall' };
  cutWhileOpen(r, spider);
  r.run(0, 300);
  return r.s.save.flags.includes('gloam-down')
    ? { ok: true, frames: r.frames, tape: r.tape }
    : { ok: false, frames: r.frames, why: `not beaten (phase ${boss()?.phase}, hp ${spider()?.hp})` };
}

/**
 * One frame of a careful wait at `home` (feet x) among spiderlings: away from one that tells or drops near her,
 * a cut at one that hangs open in reach, back home otherwise.
 */
function guardInput(r: Run, home: number, k: number, homeY = 0): number {
  const p = r.s.player;
  const f = r.feet();
  for (const e of r.s.enemies) {
    if (e.kind !== 'dangler' || e.gone || e.mode === 'dead') continue;
    const ex = e.x + e.w / 2;
    const dx = ex - f.x;
    if ((e.mode === 'windup' || e.mode === 'drop' || e.mode === 'swing') && Math.abs(dx) < 260)
      return dx > 0 ? L : R;
    if (
      (e.mode === 'stall' || e.mode === 'recover' || e.mode === 'fall') &&
      Math.abs(dx) < 90 &&
      e.y < p.y + p.h
    ) {
      p.facing = dx >= 0 ? 1 : -1;
      const above = e.y + e.h < p.y + 10;
      return k % 20 < 2 ? A | (above ? U : 0) : above ? U : 0;
    }
  }
  if (!p.grounded) return k % 40 < 30 && homeY > 0 && f.y > homeY ? J | (f.x < home ? R : L) : 0;
  // (Off her ledge: back up onto it.)
  if (homeY > 0 && f.y > homeY + 8 && Math.abs(f.x - home) < 120)
    return k % 40 < 30 ? J | (f.x < home ? R : L) : 0;
  return Math.abs(f.x - home) > 10 ? (f.x < home ? R : L) : 0;
}

/** Walks to the open creature and cuts it while it stays open. */
function cutWhileOpen(r: Run, who: () => GameState['enemies'][number] | undefined): boolean {
  let hits = 0;
  for (let k = 0; k < 400; k++) {
    const e = who();
    if (!e || (e.mode !== 'recover' && e.mode !== 'fall')) break;
    const ex = e.x + e.w / 2;
    const f = r.feet();
    const dx = ex - f.x;
    if (!r.s.player.grounded) {
      r.run(0);
      continue;
    }
    if (Math.abs(dx) > 70) {
      r.run(dx > 0 ? R : L);
      continue;
    }
    r.s.player.facing = dx >= 0 ? 1 : -1;
    const hp = e.hp;
    // (Up if it hangs over her, else forward.)
    const over = e.y + e.h < r.s.player.y;
    const ev = r.run(over ? U | A | J : A, 1);
    r.run(over ? U : 0, 18);
    void ev;
    if ((who()?.hp ?? hp) < hp) hits++;
  }
  return hits > 0;
}

export const DRIVERS: Record<string, () => DriverResult> = { vault, answer, ram, gloam };

void cloneState;
