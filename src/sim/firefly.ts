/**
 * The firefly's passes and the freed moths' roosts (the Canopy r10, review r9 #2; memory/canopy.md "The premise").
 *
 *  - **A pass** (`scene.fireflies`): the story's firefly is "a light that flees and relights lamps behind her" (Kuro's
 *    first pass in Ori). Her box centre in a pass's `trigger`, on the ground (she lands there), the first time (its
 *    `flag` not saved) saves the flag and starts it: the firefly flies the `path` at a steady speed over `frames` (`state.kit.firefly`: which pass,
 *    frames in, where it is now). Each lamp of `relights` it passes within `kit.firefly.relightPx` of while that lamp
 *    is out (or, since r11, smouldering behind her chain) burns again. No control is taken from her; nothing it does
 *    hurts. Since r11 (review r10 #4) a pass may also start on her first fling off one of its lamps (`onFling`) or
 *    on a story flag (`onFlag`), stop at a point to hang a cage (`hang`: its `sets` lights an `after` lamp), hold her
 *    input a beat (`hold`), and carry a camera hook for render (`look`).
 *  - **Roosts** (`scene.roosts`): where the moths of a freed trap lamp (`room:id` in `save.snuffed`) gather in this
 *    room. `roostsLit` says which; render draws them settled.
 *
 * Pure: + - * / sqrt, min, max (memory/sim-architecture.md).
 */
import type { SimEvent } from './events';
import type { FireflyPass, Roost } from './kit-data';
import { flameAt, lureHpMax, relightEmbers } from './lures';
import type { Scene } from './scene';
import type { GameState, SaveState } from './state';
import type { Tuning } from './tuning';

/** The firefly in this room now (room-local, `state.kit.firefly`): `pass` -1 = none flying. */
export interface FireflyState {
  /** Index in `scene.fireflies` of the pass under way, -1 = none. */
  pass: number;
  /** Frames into it. */
  frame: number;
  /** Where it is now (world px, the light's centre). */
  x: number;
  y: number;
  /**
   * The Canopy r13, a chase (`FireflyPass.chase`; render reads `x`, `y`, and `px`, `py` a step ago, since a chase is
   * not a function of the frame): `beat` 0 perched (hanging its light at the path's start, she not yet seen), 1 the
   * alarm, 2 flying, 3 waiting for her at a stop, 4 into the nest (to the shaft's top), 5 the call, -1 none. `t`
   * frames in the beat; `d` px along the path; `her` her progress along it (px).
   */
  beat: number;
  t: number;
  d: number;
  her: number;
  px: number;
  py: number;
  /**
   * The Canopy r14 (review r13 #5): the lure (index in `scene.lures`) of the last hook she flung off in the chase (-1
   * none): a fall puts her back there, drifting in its reach for `hold` frames (`lessonK` eases in as at the first
   * fling: time thickens round the flame).
   */
  hook: number;
  hold: number;
  /** 1 once she has flung off `hook` since she was last put back there (a landing then is a fall). */
  used: number;
}

export function createFirefly(): FireflyState {
  return {
    pass: -1,
    frame: 0,
    x: 0,
    y: 0,
    beat: -1,
    t: 0,
    d: 0,
    her: 0,
    px: 0,
    py: 0,
    hook: -1,
    hold: 0,
    used: 0,
  };
}

/** The point `d` px along `path` (into `out`). */
function along(
  path: ReadonlyArray<readonly [number, number]>,
  d: number,
  out: { x: number; y: number },
): void {
  let left = d;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as readonly [number, number];
    const b = path[i] as readonly [number, number];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (left <= len || i === path.length - 1) {
      const k = len > 0 ? Math.min(1, left / len) : 1;
      out.x = a[0] + dx * k;
      out.y = a[1] + dy * k;
      return;
    }
    left -= len;
  }
  const last = path[path.length - 1] as readonly [number, number];
  out.x = last[0];
  out.y = last[1];
}

/** A path's length, px. */
export function pathLength(path: ReadonlyArray<readonly [number, number]>): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as readonly [number, number];
    const b = path[i] as readonly [number, number];
    n += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
  }
  return n;
}

const AT = { x: 0, y: 0 };
const FL = { x: 0, y: 0 };

/** Frames into pass `f` it reaches its `hang` point (-1 = no hang). */
export function fireflyHangAt(f: FireflyPass): number {
  const h = f.hang;
  if (!h) return -1;
  const total = pathLength(f.path);
  const to = pathLength(f.path.slice(0, Math.min(f.path.length, h.point + 1)));
  return Math.round((f.frames * to) / Math.max(1, total));
}

/** A pass's whole length, frames: its flight and its stop. */
export function fireflyFrames(f: FireflyPass): number {
  return f.frames + (f.hang ? f.hang.frames : 0);
}

/** Where pass `f` is `frame` frames in (into `out`): render may call it with an interpolated frame. */
export function fireflyAt(f: FireflyPass, frame: number, out: { x: number; y: number } = { x: 0, y: 0 }) {
  // (A stop at its hang point: the flight's clock waits there.)
  const ha = fireflyHangAt(f);
  const fl = ha >= 0 && f.hang ? (frame <= ha ? frame : Math.max(ha, frame - f.hang.frames)) : frame;
  const k = Math.max(0, Math.min(1, fl / Math.max(1, f.frames)));
  along(f.path, pathLength(f.path) * k, out);
  return out;
}

/** Her progress along a path: the arc length of the nearest point on it to (`x`, `y`), and its distance (into `out`). */
function project(
  path: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
  out: { d: number; dist: number },
  lo = 0,
  hi = Number.POSITIVE_INFINITY,
): void {
  let best = Number.POSITIVE_INFINITY;
  let at = 0;
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as readonly [number, number];
    const b = path[i] as readonly [number, number];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const ll = dx * dx + dy * dy;
    const len = Math.sqrt(ll);
    // (Only the stretch of path between `lo` and `hi` (arc px): an S crosses itself, and her nearest point must be
    // the stretch she is on, not one further on that passes by her.)
    const k0 = len > 0 ? Math.max(0, Math.min(1, (lo - run) / len)) : 0;
    const k1 = len > 0 ? Math.max(0, Math.min(1, (hi - run) / len)) : 1;
    if (run > hi || run + len < lo) {
      run += len;
      continue;
    }
    const kk = ll > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / ll : 0;
    const k = Math.max(k0, Math.min(k1, kk));
    const qx = a[0] + dx * k - x;
    const qy = a[1] + dy * k - y;
    const q = qx * qx + qy * qy;
    if (q < best) {
      best = q;
      at = run + len * k;
    }
    run += len;
  }
  out.d = at;
  out.dist = Math.sqrt(best);
}

const PJ = { d: 0, dist: 0 };

/** The arc length of path point `n` (its stops, `chase.waits`). */
function pointD(path: ReadonlyArray<readonly [number, number]>, n: number): number {
  return pathLength(path.slice(0, Math.max(1, Math.min(path.length, n + 1))));
}

/** Can a chase start in this room now (its flag not saved, the ability it needs owned)? */
function chaseReady(state: GameState, f: FireflyPass): boolean {
  if (!f.chase || state.save.flags.includes(`${f.flag}-done`)) return false;
  const need = f.chase.needs;
  return !need || (state.save.abilities as readonly string[]).includes(need);
}

/** Lights chase hook `id` (its `after` flag saved, burning now): `fireflyKindle`. */
function kindle(
  state: GameState,
  scene: Scene,
  f: FireflyPass,
  id: string,
  t: Tuning,
  events: SimEvent[],
): void {
  const lures = scene.lures ?? [];
  const i = lures.findIndex((l) => l.id === id);
  const l = lures[i];
  if (!l) return;
  const flag = l.after;
  if (flag && !state.save.flags.includes(flag)) {
    state.save.flags.push(flag);
    events.push({ type: 'flagSet', flag, by: f.id, x: l.x, y: l.y });
  }
  const s = state.lures;
  s.ember[i] = 0;
  s.hp[i] = lureHpMax(l, t);
  s.out[i] = 0;
  events.push({ type: 'fireflyKindle', id: f.id, lure: l.id, x: l.x, y: l.y });
}

/** Is chase hook `id` dark (never yet kindled)? */
function dark(state: GameState, scene: Scene, id: string): boolean {
  const l = (scene.lures ?? []).find((q) => q.id === id);
  return !!l?.after && !state.save.flags.includes(l.after);
}

/**
 * One step of a chase (the Canopy r13, moment 4): perched until she is in its `trigger` (or its other starts), then
 * the alarm, then it keeps `lead` ahead of her progress along `path` (never back), kindling its hooks as it passes,
 * waiting at its stops for one who fell behind; at the path's end it dives into the nest, waits at the shaft's top
 * for her, calls, and is gone. Deterministic: a pure function of the state and her moves.
 */
function chaseStep(state: GameState, scene: Scene, f: FireflyPass, t: Tuning, events: SimEvent[]): void {
  const ff = state.kit.firefly;
  const c = f.chase;
  if (!c) return;
  const K = t.kit.firefly;
  const p = state.player;
  const path = f.path;
  const total = pathLength(path);
  const say = (phase: 'start' | 'wait' | 'go' | 'nest' | 'call' | 'gone') =>
    events.push({ type: 'fireflyChase', id: f.id, phase, x: Math.round(ff.x), y: Math.round(ff.y) });
  ff.px = ff.x;
  ff.py = ff.y;
  ff.t++;
  // Perched: its light hung at the path's start, its back to her, until it sees her.
  if (ff.beat === 0) {
    fireflyAt(f, 0, AT);
    ff.x = AT.x;
    ff.y = AT.y;
    const again = state.save.flags.includes(f.flag);
    if (again ? !onTrigger(state, f) : !starts(state, scene, f)) return;
    if (!again) {
      state.save.flags.push(f.flag);
      events.push({ type: 'flagSet', flag: f.flag, by: f.id, x: AT.x, y: AT.y });
    }
    events.push({ type: 'fireflyStart', id: f.id, x: AT.x, y: AT.y, frames: f.frames });
    ff.beat = 1;
    ff.t = 0;
    ff.d = 0;
    say('start');
    return;
  }
  if (ff.beat === 1) {
    if (ff.t < Math.round(K.alarmFrames)) return;
    ff.beat = 2;
    ff.t = 0;
  }
  // Her progress: the nearest point of the stretch of path behind the firefly, while she is near it (a fall to the
  // floor keeps the last).
  project(path, p.x + p.w / 2, p.y + p.h / 2, PJ, ff.her - K.nearPx, ff.d + 1);
  // (r14, review r13 #5: not while she falls (out of a fling's aim, sinking): a fall past the line is no progress.)
  // (Her progress is made on the line, in the air: standing on the shelf under the S is none.)
  const falling = (!p.grounded && p.fling < 0 && p.vy > K.fallVy) || !!state.caught;
  // (r14, first-timer ft14chase: gliding low into the nest, her nearest point clamped at the firefly's own and pushed
  // it on, a ratchet to the nest while the S was never flown. At the clamp she must be close to it.)
  const clamped = PJ.d >= ff.d - 1 && PJ.dist > K.edgePx;
  if (PJ.dist <= K.nearPx && p.faded === 0 && !falling && !p.grounded && !clamped) ff.her = PJ.d;
  if (ff.hold > 0) ff.hold--;
  // (The last hook she flung off: a fall puts her back there.)
  const lures = scene.lures ?? [];
  const line = [...c.kindles, ...(f.relights ?? [])];
  for (const q of events) {
    if (q.type !== 'fling' || !line.includes(q.id)) continue;
    ff.hook = lures.findIndex((l) => l.id === q.id);
    ff.used = 1;
  }
  // (r14: a landing mid-chase, off a hook past the first and short of the nest, is a fall: held a beat, then back at
  // that hook (src/sim/index.ts's catch calls `chaseBack`). Once only: landed again without a fling, she stays.)
  const first = lures.findIndex((q) => q.id === c.kindles[0]);
  if (
    (ff.beat === 2 || ff.beat === 3) &&
    p.grounded &&
    !state.caught &&
    p.faded === 0 &&
    ff.used === 1 &&
    ff.hook >= 0 &&
    ff.hook !== first &&
    ff.her < total - K.nestPx
  ) {
    const frames = Math.max(1, Math.round(t.room.catchFrames));
    const id = `chase:${lures[ff.hook]?.id ?? ''}`;
    state.caught = { id, frames: 0 };
    events.push({ type: 'fallCatch', id, x: Math.round(p.x + p.w / 2), y: Math.round(p.y + p.h), frames });
  }
  if (ff.beat === 2 || ff.beat === 3) {
    // Its goal: its lead ahead of her, but never past a stop she is not yet near.
    let goal = Math.min(total, ff.her + c.lead[1]);
    let stop = -1;
    for (const w of c.waits) {
      const wd = pointD(path, w);
      if (wd >= ff.d - 1 && ff.her < wd - c.lead[0]) {
        stop = wd;
        break;
      }
    }
    if (stop >= 0) goal = Math.min(goal, stop);
    const gap = goal - ff.d;
    const hurry = ff.d - ff.her < c.lead[0] ? K.chaseHurry : 0;
    const v = gap > 0 ? Math.min(K.chaseMax, gap * K.chaseEase + hurry, gap) : 0;
    ff.d += v;
    // (Held a beat where its lead runs out, it waits there flashing; on again once its goal is well ahead.)
    const held = gap <= 0.5 && ff.d < total - 0.5;
    if (ff.beat === 2) {
      ff.t = held ? ff.t : 0;
      if (held && ff.t >= Math.round(K.waitAfter)) {
        ff.beat = 3;
        ff.t = 0;
        say('wait');
      }
    } else if (gap > K.goPx) {
      ff.beat = 2;
      ff.t = 0;
      say('go');
    }
    along(path, ff.d, AT);
    ff.x = AT.x;
    ff.y = AT.y;
    // The hooks it passes catch fire.
    const R = K.relightPx;
    for (const id of c.kindles) {
      const l = (scene.lures ?? []).find((q) => q.id === id);
      if (!l || !dark(state, scene, id)) continue;
      if ((l.x - ff.x) * (l.x - ff.x) + (l.y - ff.y) * (l.y - ff.y) <= R * R)
        kindle(state, scene, f, id, t, events);
    }
    // (And the chain's lamps it passes burn again if she put them out before: its line is always lit ahead of her.)
    for (const id of f.relights ?? []) {
      const i = lures.findIndex((q) => q.id === id);
      const l = lures[i];
      if (!l || (state.lures.hp[i] ?? 0) > 0 || state.lures.ember[i]) continue;
      if ((l.x - ff.x) * (l.x - ff.x) + (l.y - ff.y) * (l.y - ff.y) > R * R) continue;
      state.lures.hp[i] = lureHpMax(l, t);
      state.lures.out[i] = 0;
      events.push({ type: 'lureRelight', id: l.id, x: l.x, y: l.y, by: 'firefly' });
      events.push({ type: 'fireflyRelight', id: f.id, lure: l.id, x: l.x, y: l.y });
    }
    // (r14: never into the nest while she falls: it waits at the path's end until she is flying or down.)
    if (ff.d >= total - 0.5 && !falling) {
      ff.beat = 4;
      ff.t = 0;
      say('nest');
    }
    return;
  }
  // Into the nest: to the shaft's top, then it waits for her there.
  if (ff.beat === 4) {
    const dx = c.end[0] - ff.x;
    const dy = c.end[1] - ff.y;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd > K.nestSpeed) {
      ff.x += (dx / dd) * K.nestSpeed;
      ff.y += (dy / dd) * K.nestSpeed;
      return;
    }
    ff.x = c.end[0];
    ff.y = c.end[1];
    // (She is in the nest (near its mouth, the path's end): it calls.)
    const mouth = path[path.length - 1] as readonly [number, number];
    const hx = p.x + p.w / 2 - mouth[0];
    const hy = p.y + p.h / 2 - mouth[1];
    if (hx * hx + hy * hy > K.callPx * K.callPx && ff.t < Math.round(K.callWait)) return;
    ff.beat = 5;
    ff.t = 0;
    say('call');
    return;
  }
  // The call: one slow, long flash up at the sky. Nothing answers. Up the shaft and gone.
  if (ff.beat === 5 && ff.t >= Math.round(K.callFrames)) {
    const done = `${f.flag}-done`;
    if (!state.save.flags.includes(done)) state.save.flags.push(done);
    say('gone');
    events.push({ type: 'fireflyHide', id: f.id, x: Math.round(ff.x), y: Math.round(ff.y) });
    events.push({ type: 'fireflyEnd', id: f.id, x: Math.round(ff.x), y: Math.round(ff.y) });
    ff.pass = -1;
    ff.beat = -1;
    ff.frame = 0;
  }
}

/**
 * Where a fall in a chase puts her back (the Canopy r14, review r13 #5: a fall from the S sent her to the start
 * shelf): at the last hook she flung off, her centre on its flame, drifting in its reach for `backHold` frames (the
 * lesson's thickened air) so the press is hers again. The hook burns. Null when no chase is on or she used none.
 */
export function chaseBack(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
): { x: number; y: number } | null {
  const ff = state.kit.firefly;
  const f = scene.fireflies?.[ff.pass];
  if (!f?.chase || ff.beat < 2 || ff.beat > 4 || ff.hook < 0) return null;
  const l = scene.lures?.[ff.hook];
  if (!l) return null;
  const s = state.lures;
  // (Every hook of the chain she left smoulders no more: they burn again, springboards as before.)
  relightEmbers(state, scene, t, events);
  if ((s.hp[ff.hook] ?? 0) <= 0) {
    s.hp[ff.hook] = lureHpMax(l, t);
    s.out[ff.hook] = 0;
    events.push({ type: 'lureRelight', id: l.id, x: l.x, y: l.y, by: 'firefly' });
  }
  ff.hold = Math.max(1, Math.round(t.kit.firefly.backHold));
  ff.used = 0;
  events.push({
    type: 'fireflyChase',
    id: f.id,
    phase: 'back',
    x: Math.round(ff.x),
    y: Math.round(ff.y),
    lure: l.id,
  });
  return { x: l.x, y: Math.round(l.y + t.body.height / 2) };
}

/** Is she standing in pass `f`'s trigger (a chase's restart: she is back on its shelf)? */
function onTrigger(state: GameState, f: FireflyPass): boolean {
  const p = state.player;
  const r = f.trigger;
  if (!r || !p.grounded || p.faded > 0) return false;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
}

/** Does pass `f` start this step (its flag not saved, none under way)? */
function starts(state: GameState, scene: Scene, f: FireflyPass): boolean {
  if (state.save.flags.includes(f.flag)) return false;
  const p = state.player;
  if (p.faded > 0) return false;
  // (Her first fling off one of its lamps: that lamp smoulders behind her now, the Canopy r11.)
  if (f.onFling) {
    const lures = scene.lures ?? [];
    for (const id of f.onFling) {
      const i = lures.findIndex((l) => l.id === id);
      if (i >= 0 && state.lures.ember[i]) return true;
    }
  }
  if (f.onFlag && state.save.flags.includes(f.onFlag)) return true;
  const r = f.trigger;
  if (!r || !p.grounded) return false;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
}

/** Starts a pass when she enters its trigger, moves the one under way, relights the lamps it passes. */
export function updateFireflies(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const list = scene.fireflies;
  if (!list || list.length === 0) return;
  const ff = state.kit.firefly;
  const p = state.player;
  // (A pass cut short before its stop, by a fade or leaving the room: the cage it was carrying is hung all the same.)
  for (let i = 0; i < list.length; i++) {
    // (A chase over (or its end reached by a later entry): every hook it would have kindled burns from now on.)
    const ch = list[i]?.chase;
    if (ch && ff.pass !== i && state.save.flags.includes(`${(list[i] as FireflyPass).flag}-done`))
      for (const id of ch.kindles) {
        const l = (scene.lures ?? []).find((q) => q.id === id);
        if (l?.after && !state.save.flags.includes(l.after)) state.save.flags.push(l.after);
      }
    const sets = list[i]?.hang?.sets;
    if (!sets || ff.pass === i || state.save.flags.includes(sets)) continue;
    if (state.save.flags.includes((list[i] as FireflyPass).flag)) state.save.flags.push(sets);
  }
  // (A chase, the Canopy r13: it perches at its start as soon as it may run, before she sees it.)
  if (ff.pass < 0) {
    for (let i = 0; i < list.length; i++) {
      const f = list[i] as FireflyPass;
      if (!chaseReady(state, f)) continue;
      ff.pass = i;
      ff.frame = 0;
      ff.beat = 0;
      ff.t = 0;
      ff.d = 0;
      ff.her = 0;
      fireflyAt(f, 0, AT);
      // (A chase she left before its end (a fall down the drop, out by the roost's shaft, a fade): r14, first-timer
      // ft14chase: it used to wait at its last stop by the nest, and a player back in the roost ended it unflown. Now it
      // perches at its start again and bolts when she is back on the shelf; the hooks it lit stay lit.)
      ff.x = ff.px = AT.x;
      ff.y = ff.py = AT.y;
      // (Its first hook is the light it is hanging: lit already.)
      const first = f.chase?.kindles[0];
      if (first && dark(state, scene, first)) kindle(state, scene, f, first, t, events);
      break;
    }
  }
  if (ff.pass >= 0 && list[ff.pass]?.chase) {
    ff.frame++;
    chaseStep(state, scene, list[ff.pass] as FireflyPass, t, events);
    return;
  }
  if (ff.pass < 0) {
    for (let i = 0; i < list.length; i++) {
      const f = list[i] as FireflyPass;
      if (f.chase) continue;
      if (!starts(state, scene, f)) continue;
      state.save.flags.push(f.flag);
      ff.pass = i;
      ff.frame = 0;
      fireflyAt(f, 0, AT);
      ff.x = AT.x;
      ff.y = AT.y;
      events.push({ type: 'fireflyStart', id: f.id, x: AT.x, y: AT.y, frames: fireflyFrames(f) });
      events.push({ type: 'flagSet', flag: f.flag, by: f.id, x: AT.x, y: AT.y });
      // (A held beat: she stands and watches, the Canopy r11's second sighting; nothing hurts her.)
      const hold = Math.min(Math.round(f.hold ?? 0), Math.round(t.kit.storyHoldMax));
      if (hold > 0) {
        state.kit.story = Math.max(state.kit.story, hold);
        state.kit.storyBy = f.id;
        p.invuln = Math.max(p.invuln, hold);
        events.push({ type: 'storyHold', id: f.id, frames: hold, x: p.x + p.w / 2, y: p.y + p.h });
      }
      break;
    }
  }
  if (ff.pass < 0) return;
  const f = list[ff.pass];
  if (!f) {
    ff.pass = -1;
    return;
  }
  ff.frame++;
  fireflyAt(f, ff.frame, AT);
  ff.x = AT.x;
  ff.y = AT.y;
  // Its stop: it hangs a cage (`sets` lights the `after` lamp it names) and holds there.
  if (f.hang && ff.frame === fireflyHangAt(f)) {
    const sets = f.hang.sets;
    const cage = sets ? (scene.lures ?? []).find((l) => l.after === sets) : undefined;
    events.push({
      type: 'fireflyHang',
      id: f.id,
      x: AT.x,
      y: AT.y,
      frames: f.hang.frames,
      ...(cage ? { lure: cage.id } : {}),
    });
    if (sets && !state.save.flags.includes(sets)) {
      state.save.flags.push(sets);
      events.push({ type: 'flagSet', flag: sets, by: f.id, x: AT.x, y: AT.y });
    }
  }
  const lures = scene.lures ?? [];
  const R = t.kit.firefly.relightPx;
  for (const id of f.relights ?? []) {
    const i = lures.findIndex((l) => l.id === id);
    const l = lures[i];
    if (!l || l.trap) continue;
    const s = state.lures;
    if ((s.hp[i] ?? 0) > 0) continue;
    const fl = flameAt(s, i, l, state.frame, t, FL);
    if ((fl.x - AT.x) * (fl.x - AT.x) + (fl.y - AT.y) * (fl.y - AT.y) > R * R) continue;
    // (Smouldering behind her chain too, the Canopy r11: it relights the lamp she just flung, in front of her. The
    // chain's other embers are hers to land.)
    s.ember[i] = 0;
    s.hp[i] = lureHpMax(l, t);
    s.out[i] = 0;
    events.push({ type: 'lureRelight', id: l.id, x: fl.x, y: fl.y, by: 'firefly' });
    events.push({ type: 'fireflyRelight', id: f.id, lure: l.id, x: fl.x, y: fl.y });
  }
  if (ff.frame >= fireflyFrames(f)) {
    events.push({ type: 'fireflyEnd', id: f.id, x: AT.x, y: AT.y });
    ff.pass = -1;
    ff.frame = 0;
  }
}

/**
 * The Canopy r13, moment 3 (`scene.sits`): she stands still (grounded, no input) within `r` of a sit once its `when` is
 * saved: after `frames`, `kinSit` and `sets` saved (once). The sim never moves the kin: render plays the walk-over.
 */
export function updateSits(state: GameState, scene: Scene, events: SimEvent[]): void {
  const sits = scene.sits;
  if (!sits || sits.length === 0) return;
  const kit = state.kit;
  const p = state.player;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  const still = p.grounded && p.hp > 0 && p.faded === 0 && p.vx === 0 && state.prevInput === 0;
  let any = false;
  for (const s of sits) {
    if (state.save.flags.includes(s.sets)) continue;
    if (s.when && !state.save.flags.includes(s.when)) continue;
    const dx = fx - s.x;
    const dy = fy - s.y;
    if (!still || dx * dx + dy * dy > s.r * s.r) continue;
    any = true;
    if (++kit.sitStill < s.frames) continue;
    state.save.flags.push(s.sets);
    events.push({ type: 'kinSit', id: s.id, x: Math.round(fx), y: Math.round(fy) });
    events.push({ type: 'flagSet', flag: s.sets, by: s.id, x: Math.round(fx), y: Math.round(fy) });
    kit.sitStill = 0;
    return;
  }
  if (!any) kit.sitStill = 0;
}

/** Is roost `r` lit (its trap lamp freed, its moths not yet gone on: `leaves`)? */
export function roostLit(r: Roost, save: SaveState): boolean {
  return save.snuffed.includes(r.lure) && !roostLeft(r, save);
}

/** Has roost `r`'s cloud gone on the migration (its `leaves` flag saved, the Canopy r12's ending)? */
export function roostLeft(r: Roost, save: SaveState): boolean {
  return !!r.leaves && save.flags.includes(r.leaves);
}

/** The roosts of this room whose moths have gone on (render: an empty roost, a few wing scales on the bark). */
export function roostsLeft(scene: Scene, save: SaveState): Roost[] {
  return (scene.roosts ?? []).filter((r) => roostLeft(r, save));
}

/** The roosts of this room whose trap lamps she has freed, in the room's order (render draws a settled cloud on each). */
export function roostsLit(scene: Scene, save: SaveState): Roost[] {
  return (scene.roosts ?? []).filter((r) => roostLit(r, save));
}
