/**
 * Fairness-bot fighters for the combat report (combat-spec §6.4). One parameterised policy:
 *
 *   competent  reaction 12 f, 5% wrong reads, all verbs (jab -> seize -> levy -> Count), Catches
 *   signature  = competent, but prefers the Catch / Return to sender / Repossess loop over punching
 *   jabOnly    = competent, never seizes or levies (the boss's final Count Seize excepted: it is the
 *              only way to win that fight)
 *   sloppy     reaction 24 f, 25% wrong reads, never Catches
 *   reactor    reaction exactly 15 f, only evades, never attacks
 *
 * Perception: the world (enemies, shots, sounds) is seen `delay` steps late; Kid's own body is
 * current (a player knows her own inputs). Threats are judged by forking the DELAYED snapshot with
 * Kid's current body and new attack starts suppressed (so the bot never sees an attack before its
 * telegraph was visible for `delay` frames), then trying a fixed menu of 9 evasive macros for 45
 * frames; it picks the first that avoids damage. That is a skilled player who has learned the
 * attacks, reacting late. Offense is geometry: the strike boxes vs the extrapolated hurtboxes.
 * Seeded with its own RNG (never the sim's); every run is an input list (replayable as a tape).
 */
import { clonePlain } from '../../src/debug/headless';
import { enemyDef } from '../../src/sim/ai/schema';
import { rectsOverlap } from '../../src/sim/combat/boxes';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit as B } from '../../src/sim/input';
import { moveHitbox } from '../../src/sim/player/moves';
import type { Enemy, GameState, MoveState, Shot } from '../../src/sim/state';
import type { Tuning } from '../../src/sim/tuning';

export interface FighterOpts {
  name: string;
  delay: number;
  /** Chance a given read (evade choice, catch, count press) goes wrong. */
  error: number;
  /** none = punches only; all = every verb. */
  verbs: 'none' | 'all';
  /** Prefer Catch / Return / Repossess over punching. */
  signature: boolean;
  catches: boolean;
  evadeOnly: boolean;
}

export const FIGHTERS: Record<string, FighterOpts> = {
  competent: {
    name: 'competent',
    delay: 12,
    error: 0.05,
    verbs: 'all',
    signature: false,
    catches: true,
    evadeOnly: false,
  },
  signature: {
    name: 'signature',
    delay: 12,
    error: 0.05,
    verbs: 'all',
    signature: true,
    catches: true,
    evadeOnly: false,
  },
  jabOnly: {
    name: 'jabOnly',
    delay: 12,
    error: 0.05,
    verbs: 'none',
    signature: false,
    catches: false,
    evadeOnly: false,
  },
  sloppy: {
    name: 'sloppy',
    delay: 24,
    error: 0.25,
    verbs: 'all',
    signature: false,
    catches: false,
    evadeOnly: false,
  },
  reactor: {
    name: 'reactor',
    delay: 15,
    error: 0,
    verbs: 'none',
    signature: false,
    catches: false,
    evadeOnly: true,
  },
};

export interface Mind {
  opts: FighterOpts;
  t: Tuning;
  rand: () => number;
  /** Committed input plan (masks), consumed one per step. */
  plan: number[];
  /** Per-instance read decisions (right/wrong), keyed by a threat id. */
  reads: Record<string, boolean>;
  prev: number;
  lastEval: number;
}

export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alive = (s: GameState): Enemy[] =>
  s.local.enemies.filter((e) => e.state !== 'KO' && e.state !== 'REPOSSESSED');
const downed = (e: Enemy) => e.state === 'DOWN' || e.state === 'COUNT';
const kidCx = (s: GameState) => s.player.x + s.player.w / 2;
const cx = (e: { x: number; w: number }) => e.x + e.w / 2;
const lr = (d: number) => (d > 0 ? B.right : d < 0 ? B.left : 0);

/** The press edge of `bit` this step (needs the button up last step). */
function press(m: Mind, bit: number): number {
  return (m.prev & bit) !== 0 ? 0 : bit;
}

/** A read of threat `key`: right with probability 1 - error, decided once. */
function reads(m: Mind, key: string): boolean {
  if (!(key in m.reads)) m.reads[key] = m.rand() >= m.opts.error;
  return m.reads[key] as boolean;
}

/**
 * Fork of the delayed snapshot with Kid's current body; no enemy may start a new attack (and the
 * boss can't pick a new move), so it only plays out what has already been telegraphed.
 */
/** Tuning for forks (set by decide). */
let t0: Tuning;

const KID_CAUSED = new Set(['STAGGER', 'DOWN', 'COUNT', 'LAUNCHED', 'FLINCH', 'KO', 'REPOSSESSED', 'RISE']);

function fork(seen: GameState, now: GameState): GameState {
  const f = clonePlain(seen);
  f.player = clonePlain(now.player);
  f.prevInput = now.prevInput;
  f.local.bag = [...now.local.bag];
  // She knows what her own hits and Catches did (a stagger, a knockdown) without waiting to see it.
  f.local.enemies = f.local.enemies.map((e) => {
    const n = now.local.enemies.find((x) => x.id === e.id);
    return n && KID_CAUSED.has(n.state) && n.state !== e.state ? clonePlain(n) : e;
  });
  for (const e of f.local.enemies) {
    if (e.state !== 'TELEGRAPH' && e.state !== 'ACTIVE') e.cooldown = 9999;
    if (e.boss && e.state === 'CHASE') e.stateFrame = -9999;
  }
  // Bring the world up to now (what she saw, played forward by what she knows of the attacks),
  // with Kid held where she is: the fork's clock then matches hers.
  const age = now.frame - seen.frame;
  const body = clonePlain(now.player);
  const ev: SimEvent[] = [];
  for (let i = 0; i < age; i++) {
    ev.length = 0;
    f.player = clonePlain(body);
    step(f, 0, t0, ev);
    for (const e of f.local.enemies) if (e.state !== 'TELEGRAPH' && e.state !== 'ACTIVE') e.cooldown = 9999;
  }
  f.player = clonePlain(body);
  f.prevInput = now.prevInput;
  f.hitstop = now.hitstop;
  f.frame = now.frame;
  return f;
}

/** Steps a fork with a macro (masks then idle) for `n` steps; returns damage taken and when. */
function trial(
  base: GameState,
  t: Tuning,
  macro: number[],
  n: number,
): { hurt: number; at: number; hits: number } {
  const s = clonePlain(base);
  let hurt = 0;
  let at = -1;
  let hits = 0;
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    ev.length = 0;
    step(s, macro[i] ?? 0, t, ev);
    for (const e of ev) {
      if (e.type === 'hurt' || e.type === 'hazard') {
        hurt += e.dmg;
        if (at < 0) at = i;
      } else if (e.type === 'hit' || e.type === 'catch' || e.type === 'seizeTake') hits++;
    }
    if (s.roomId !== base.roomId) break;
  }
  return { hurt, at, hits };
}

const rep = (mask: number, n: number) => Array.from({ length: n }, () => mask);

/** The fixed evasion menu (each macro: its masks; idle afterwards). */
function evasions(s: GameState): { name: string; masks: number[] }[] {
  const p = s.player;
  const out = [
    { name: 'stay', masks: [] as number[] },
    { name: 'L', masks: rep(B.left, 24) },
    { name: 'R', masks: rep(B.right, 24) },
    { name: 'J', masks: rep(B.jump, 18) },
    { name: 'LJ', masks: rep(B.left | B.jump, 18).concat(rep(B.left, 10)) },
    { name: 'RJ', masks: rep(B.right | B.jump, 18).concat(rep(B.right, 10)) },
  ];
  if (p.abilities.dash) {
    out.push({ name: 'LX', masks: [B.left | B.dash].concat(rep(B.left, 16)) });
    out.push({ name: 'RX', masks: [B.right | B.dash].concat(rep(B.right, 16)) });
  }
  out.push({ name: 'DJ', masks: [B.down | B.jump].concat(rep(0, 4)) });
  return out;
}

const HORIZON = 45;

/** Is Kid about to take damage (as far as she can see)? If so, the evasion to use. */
function evade(m: Mind, seen: GameState, now: GameState, key: string, intended: number[]): number[] | null {
  const base = fork(seen, now);
  // Carry on as intended: does it hurt?
  const cur = trial(base, m.t, intended, HORIZON);
  if (cur.hurt === 0) return null;
  const menu = evasions(now);
  const right = reads(m, key);
  if (!right) {
    // A wrong read: a random evasion from the menu.
    const pick = menu[Math.floor(m.rand() * menu.length)] ?? menu[0];
    return pick ? [...pick.masks] : null;
  }
  let best: number[] | null = null;
  let bestHurt = cur.hurt;
  for (const ev of menu) {
    const r = trial(base, m.t, ev.masks, HORIZON);
    if (r.hurt < bestHurt) {
      best = ev.masks;
      bestHurt = r.hurt;
      if (r.hurt === 0) break;
    }
  }
  return best ? [...best] : null;
}

/** A threat key for read decisions: the attack instance (enemy + its telegraph start) or shot. */
function threatKey(seen: GameState): string {
  const parts: string[] = [];
  for (const e of seen.local.enemies)
    if (e.state === 'TELEGRAPH' || e.state === 'ACTIVE')
      parts.push(`${e.id}:${e.attackId}:${seen.frame - e.stateFrame - (e.state === 'ACTIVE' ? 1000 : 0)}`);
  for (const s of seen.local.shots) parts.push(`s${s.id}`);
  return parts.join('|') || 'contact';
}

/** Would move `id` (dir) started now hit enemy `e` on its first active frame (enemy extrapolated)? */
function strikeReaches(
  now: GameState,
  e: Enemy,
  id: string,
  dir: 'fwd' | 'up' | 'down',
  ahead: number,
): boolean {
  const p = now.player;
  const facing: 1 | -1 = cx(e) >= kidCx(now) ? 1 : -1;
  const ms: MoveState = {
    id,
    frame: 1,
    dir,
    facing,
    outcome: 'none',
    hitList: [],
    len: 0,
    counter: false,
    soundId: 0,
  };
  const box = moveHitbox({ ...p, x: p.x + p.vx * ahead * 0.5, y: p.y + p.vy * ahead * 0.5 }, ms);
  if (!box) return false;
  const d = enemyDef(e.type);
  const [hx, hy, hw, hh] = d.hurtbox;
  const ex = e.x + e.vx * ahead + e.kb * Math.min(ahead, 4);
  const ey = e.y + (d.flying ? e.vy * ahead : 0);
  const hr = { x: e.facing > 0 ? ex + hx : ex + e.w - hx - hw, y: ey + hy, w: hw, h: hh };
  return rectsOverlap(box, hr);
}

/** Seize box reaches something seizable soon (target `e`) from here. */
function seizeReaches(
  now: GameState,
  target: { x: number; y: number; w: number; h: number },
  dir: 'fwd' | 'up' | 'down',
): boolean {
  const p = now.player;
  const facing: 1 | -1 = cx(target) >= kidCx(now) ? 1 : -1;
  const ms: MoveState = {
    id: 'seize',
    frame: 1,
    dir,
    facing,
    outcome: 'none',
    hitList: [],
    len: 0,
    counter: false,
    soundId: 0,
  };
  const box = moveHitbox(p, ms);
  return !!box && rectsOverlap(box, target);
}

/** Predicted body of a seen enemy now (its velocity over the delay, knockback decaying). */
function predicted(seen: GameState, now: GameState, e: Enemy): Enemy {
  const age = now.frame - seen.frame;
  let x = e.x;
  let y = e.y;
  if (e.state !== 'DOWN' && e.state !== 'COUNT' && e.state !== 'STAGGER') {
    x += e.vx * age;
    if (enemyDef(e.type).flying) y += e.vy * age;
  }
  const k = Math.abs(e.kb);
  const n = Math.min(age, Math.ceil(k));
  x += Math.sign(e.kb) * (k * n - (n * (n - 1)) / 2);
  return { ...e, x, y };
}

/** Horizontal input toward x, stopping within `stop` px. */
function toward(now: GameState, x: number, stop: number): number {
  const d = x - kidCx(now);
  return Math.abs(d) <= stop ? 0 : lr(d);
}

function nearest(now: GameState, list: Enemy[]): Enemy | undefined {
  let best: Enemy | undefined;
  let bd = Infinity;
  for (const e of list) {
    const d = Math.abs(cx(e) - kidCx(now)) + Math.abs(e.y + e.h - (now.player.y + now.player.h)) * 0.5;
    if (d < bd) {
      best = e;
      bd = d;
    }
  }
  return best;
}

/** Gets Kid near an enemy standing on a higher surface (the boss's lectern, a platform). */
function climbToward(now: GameState, e: Enemy, m: Mind): number {
  const p = now.player;
  const feet = p.y + p.h;
  const eFeet = e.y + e.h;
  const dx = cx(e) - kidCx(now);
  // Below it on a one-way: drop through when it is below Kid.
  if (p.grounded && eFeet > feet + 32 && Math.abs(dx) < 400) return B.down | press(m, B.jump);
  // It stands higher: jump at it when close.
  if (p.grounded && eFeet < feet - 32 && Math.abs(dx) < e.w / 2 + 140) return lr(dx) | press(m, B.jump);
  if (!p.grounded && eFeet < feet) return lr(dx) | B.jump;
  return 0;
}

/**
 * One step of the policy. `seen` is the snapshot `delay` steps ago, `now` the current state.
 */
export function decide(m: Mind, seen: GameState, now: GameState): number {
  t0 = m.t;
  const p = now.player;
  const o = m.opts;
  // Down for her Count: one Jump press on beat 3 if she can rise (a wrong read mistimes it).
  if (p.down) {
    const d = p.down;
    const beat = m.t.combat.countBeatByFever[0] as number;
    const want = 3 * beat + 2;
    if (d.canRise && !d.pressed && o.verbs === 'all') {
      const ok = reads(m, `count:${now.frame - d.t}`);
      const at = ok ? want : want + 8;
      if (d.t + 1 === at) return press(m, B.jump);
    }
    return 0;
  }
  // Committed plan (an evasion) first; otherwise what she means to do, checked for damage.
  const key = threatKey(seen);
  const intent = m.plan.length > 0 ? null : o.evadeOnly ? loiter(seen, now) : offense(m, seen, now);
  if (now.frame - m.lastEval >= 3 || intent !== null) {
    m.lastEval = now.frame;
    // An action press (its direction is only facing) is checked then idle; movement is
    // checked as it continues for 3 frames (walking off a ledge into a wave, into a body).
    const acts = B.attack | B.seize | B.levy | B.special;
    const trialPlan = intent === null ? m.plan : intent & acts ? [intent] : rep(intent, 3);
    const ev = evade(m, seen, now, key, trialPlan);
    if (ev) {
      m.plan = ev;
      return m.plan.shift() ?? 0;
    }
  }
  if (m.plan.length > 0) return m.plan.shift() ?? 0;
  return intent ?? 0;
}

/** The reactor's loitering: a distance that cycles from close (provokes short attacks) to mid-range. */
function loiter(seen: GameState, now: GameState): number {
  const p = now.player;
  const e = nearest(
    now,
    alive(seen).map((x) => predicted(seen, now, x)),
  );
  if (!e) return 0;
  const gap = Math.abs(cx(e) - kidCx(now)) - (e.w + p.w) / 2;
  const want = [40, 120, 260][Math.floor(now.frame / 180) % 3] as number;
  if (gap < want - 24) return lr(kidCx(now) - cx(e));
  if (gap > want + 24) return lr(cx(e) - kidCx(now));
  return 0;
}

function offense(m: Mind, seen: GameState, now: GameState): number {
  const p = now.player;
  const o = m.opts;
  const busy = p.move !== null;
  const all = alive(seen).map((e) => predicted(seen, now, e));
  if (all.length === 0) {
    // Clear: walk to the goal (right, jumping now and then).
    const L = now.local;
    if (L.clear) return B.right | (p.grounded && now.frame % 30 === 0 ? press(m, B.jump) : 0);
    return 0;
  }
  const verbs = o.verbs === 'all';
  const L = now.local;
  // 1. The Runner: chase and catch it.
  const runner = all.find((e) => e.type === 'runner');
  // 2. Anything down for the Count: repossess (the boss's final Seize is allowed for everyone).
  const down = all.find((e) => downed(e) && e.type !== 'runner' && (verbs || e.boss !== null));
  const focus = runner ?? down;
  if (focus) {
    if (!busy && seizeReaches(now, focus, 'fwd')) return lr(cx(focus) - kidCx(now)) | press(m, B.seize);
    if (!busy && seizeReaches(now, focus, 'up')) return B.up | press(m, B.seize);
    const climb = climbToward(now, focus, m);
    if (climb) return climb;
    if (runner && !busy && strikeReaches(now, runner, 'jab', 'fwd', 4))
      return lr(cx(runner) - kidCx(now)) | press(m, B.attack);
    return toward(now, cx(focus), (focus.w + p.w) / 2 + 20);
  }
  // 3. Catches: a telegraph in reach, or a seizable shot about to pass through the Seize box.
  if (verbs && o.catches && !busy) {
    for (const e of alive(seen)) {
      if (e.state !== 'TELEGRAPH') continue;
      const a = enemyDef(e.type).attacks[e.attackId];
      if (!a || a.snatch || a.sound === null) continue;
      const snd = enemyDef(e.type).sounds.find((s) => s.id === a.sound);
      if (!snd?.seizable) continue;
      const left = e.timer - e.stateFrame - (now.frame - seen.frame);
      const pe = predicted(seen, now, e);
      if (left < 6) continue;
      for (const dir of ['fwd', 'up'] as const)
        if (
          seizeReaches(now, { x: pe.x - 8, y: pe.y, w: pe.w + 16, h: pe.h }, dir) &&
          reads(m, `catch:${e.id}:${seen.frame - e.stateFrame}`)
        )
          return (dir === 'up' ? B.up : lr(cx(pe) - kidCx(now))) | press(m, B.seize);
    }
    for (const s of seen.local.shots) {
      if (!s.seizable) continue;
      const age = now.frame - seen.frame + 6;
      const at: Shot = { ...s, x: s.x + s.vx * age, y: s.y + s.vy * age + (s.gravity * age * age) / 2 };
      for (const dir of ['fwd', 'up'] as const)
        if (seizeReaches(now, at, dir) && reads(m, `shot:${s.id}`))
          return (dir === 'up' ? B.up : lr(cx(at) - kidCx(now))) | press(m, B.seize);
    }
  }
  // Signature: a catchable telegraph out of reach is worth walking into Seize range for.
  if (verbs && o.signature && !busy && L.bag.length === 0) {
    for (const e of alive(seen)) {
      if (e.state !== 'TELEGRAPH' || e.boss) continue;
      const a = enemyDef(e.type).attacks[e.attackId];
      if (
        !a ||
        a.snatch ||
        a.sound === null ||
        !enemyDef(e.type).sounds.find((s) => s.id === a.sound)?.seizable
      )
        continue;
      const left = e.timer - e.stateFrame - (now.frame - seen.frame);
      const pe = predicted(seen, now, e);
      const g = Math.abs(cx(pe) - kidCx(now)) - (pe.w + p.w) / 2;
      if (left >= 10 && g < 160 && Math.abs(pe.y + pe.h - (p.y + p.h)) < 64)
        return toward(now, cx(pe), (pe.w + p.w) / 2 + 20);
    }
  }
  // 4. Swallow a voice when hurt and nothing is close.
  const newest = L.sounds.find((s) => s.id === L.bag[L.bag.length - 1]);
  const target = nearest(now, all) as Enemy;
  const gap = Math.abs(cx(target) - kidCx(now)) - (target.w + p.w) / 2;
  if (verbs && !busy && newest?.kind === 'voice' && p.chin <= p.chinMax - 2 && gap > 260 && p.grounded)
    return press(m, B.special);
  // 5. The bag: throw the newest sound back at its owner (Return to sender), else at the target.
  if (verbs && newest && !busy) {
    const owner = all.find((e) => e.source === newest.owner && !downed(e));
    const at = owner ?? target;
    const d = enemyDef(at.type);
    const dx = cx(at) - kidCx(now);
    const g = Math.abs(dx) - (at.w + p.w) / 2;
    if (d.flying || at.y + at.h < p.y) {
      // Above her: an upward levy when underneath.
      if (Math.abs(dx) < at.w / 2 + 12) return B.up | press(m, B.levy);
      return toward(now, cx(at), 8);
    }
    if (p.grounded && g <= 56 && g >= -8 && Math.abs(at.y + at.h - (p.y + p.h)) < 40)
      return lr(dx) | press(m, B.levy);
    if (at.boss && Math.abs(dx) < 300 && p.grounded) return lr(dx) | press(m, B.levy);
    const climb = climbToward(now, at, m);
    if (climb) return climb;
    return toward(now, cx(at), (at.w + p.w) / 2 + 30);
  }
  // 6. Seize an open enemy (recovering, staggered, launched, flinching or rattled).
  if (verbs && !busy) {
    const open =
      target.state === 'RECOVERY' ||
      target.state === 'STAGGER' ||
      target.state === 'LAUNCHED' ||
      target.state === 'FLINCH' ||
      target.rattled > 8;
    const src = now.local.sources.find((s) => s.id === target.source);
    const armed = src
      ? src.soundIds.some(
          (id) =>
            now.local.sounds.find((x) => x.id === id)?.status === 'home' &&
            now.local.sounds.find((x) => x.id === id)?.colour !== 'white',
        )
      : false;
    if (open && armed) {
      if (seizeReaches(now, target, 'fwd')) return lr(cx(target) - kidCx(now)) | press(m, B.seize);
      if (seizeReaches(now, target, 'up')) return B.up | press(m, B.seize);
      if (o.signature) return toward(now, cx(target), (target.w + p.w) / 2 + 20);
    }
  }
  // Climbing toward a higher target: finish the jump first (a punch now would cut it short).
  if (!p.grounded && p.vy < 0 && target.y + target.h < p.y + p.h - 32)
    return lr(cx(target) - kidCx(now)) | B.jump;
  // 7. Punch: jab (or the 1-2), uppercut above, overhand below; otherwise close in.
  if (!busy || (p.move?.id === 'jab' && p.move.frame >= 3)) {
    const dx = cx(target) - kidCx(now);
    if (p.move?.id === 'jab') return lr(dx) | press(m, B.attack);
    if (strikeReaches(now, target, 'jab', 'fwd', 5)) return lr(dx) | press(m, B.attack);
    if (strikeReaches(now, target, 'uppercut', 'up', 6)) return B.up | press(m, B.attack);
    if (!p.grounded && strikeReaches(now, target, 'overhand', 'down', 3)) return B.down | press(m, B.attack);
  }
  const climb = climbToward(now, target, m);
  if (climb) return climb;
  // Flyers hovering out of reach: wait under them (they come down to dive).
  const want = enemyDef(target.type).flying ? 60 : (target.w + p.w) / 2 + 30;
  return toward(now, cx(target), want);
}
