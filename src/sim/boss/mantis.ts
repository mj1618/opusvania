/**
 * The Mantis, the boss rush's third boss (docs/design/demos/bossrush.md, memory/bosses.md): a duellist on the
 * floor under the brightest lamp, the fastest and most aggressive fight. Built on the boss framework
 * (src/sim/boss/index.ts: lock, phase table, cues, retry, defeat). Every attack has a tell (`bossTell`) and a
 * window after it; its body hurts only in a strike's dash and a dive, its blade by its own box (`boss.hit*`,
 * src/sim/index.ts). Numbers: `tuning.mantis` (lists of three are by phase).
 *
 *  - **Stalk**: it keeps the range it likes, facing her, then picks the next move from its phase's pattern.
 *  - **Strike**: a threat display (wings flared, the hunt colour quickening; the floor it will cross is shown),
 *    then a crouched dash through where she stood and on past. Jump it, or dash through with the Moonstep.
 *    Winded after: the window.
 *  - **Leap**: a crouch, a rise to over her, a hang with where it will land shown on the floor, a dive; stuck in
 *    the ground after (the window). P3: the landing sends a ripple along the floor toward her (jump it).
 *  - **Guard**: forelegs crossed. A cut from the front glances (`bossParry`) and it ripostes (a short tell, a wide
 *    cut); a cut from above (a pogo) or behind breaks it: stunned, the longest window.
 *  - **Flurry** (P2 on, when she is near): two quick cuts ahead, a step each.
 *  - **Crowded**: `pressHits` blows outside its windows and it hops back out of reach, then strikes.
 *  - **P3, the frenzy**: two moves chained with no stalk between (strike + leap, leap + strike, strike + strike).
 *
 * Pure: + - * / floor round min max abs.
 */
import type { KindRules, StepInfo } from '../enemies/common';
import { frames, setMode } from '../enemies/common';
import { lureHpMax } from '../lures';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { type BossCtx, type BossRules, defeat, enemyIndex, finish, lureIndex, setPhase, shift } from './core';

type M = Tuning['mantis'];

/** Its moves by phase, in order (a step that does not fit where she is becomes another: `fit`). */
const PATTERN: readonly (readonly string[])[] = [
  ['strike', 'leap', 'strike', 'guard', 'strike', 'leap', 'guard'],
  ['strike', 'flurry', 'leap', 'guard', 'strike', 'leap', 'flurry', 'guard'],
  ['strike+leap', 'flurry', 'leap+strike', 'guard', 'strike+strike', 'leap', 'flurry+leap'],
];

function cx(e: EnemyState): number {
  return e.x + e.w / 2;
}

function creature(c: BossCtx): EnemyState | null {
  return c.state.enemies[enemyIndex(c.scene, c.spec.creature)] ?? null;
}

/** By phase (1-based), from a list of three. */
function by(list: readonly number[], phase: number): number {
  return list[Math.max(0, Math.min(list.length - 1, phase - 1))] as number;
}

/** The floor and the span it moves in (its centre's x). */
function ground(c: BossCtx, e: EnemyState): { lo: number; hi: number; floor: number } {
  const a = c.spec.arena;
  return { lo: a.x + e.w / 2 + 8, hi: a.x + a.w - e.w / 2 - 8, floor: c.spec.floor ?? a.y + a.h };
}

/** Stands its feet at (x, floor) at height `h`. */
function stand(c: BossCtx, e: EnemyState, x: number, h: number): void {
  const g = ground(c, e);
  e.h = h;
  e.x = Math.round(Math.max(g.lo, Math.min(g.hi, x)) - e.w / 2);
  e.y = g.floor - h;
}

/** Her feet centre, and whether she is there to fight. */
function her(c: BossCtx): { x: number; y: number; here: boolean } {
  const p = c.state.player;
  return { x: p.x + p.w / 2, y: p.y + p.h, here: p.hp > 0 && p.faded === 0 };
}

function face(c: BossCtx, e: EnemyState): void {
  const h = her(c);
  if (Math.abs(h.x - cx(e)) > 4) e.facing = h.x < cx(e) ? -1 : 1;
}

function clearHit(c: BossCtx): void {
  c.boss.hitW = 0;
  c.boss.hitH = 0;
}

function setHit(c: BossCtx, x: number, y: number, w: number, h: number): void {
  const b = c.boss;
  b.hitX = Math.round(x);
  b.hitY = Math.round(y);
  b.hitW = Math.max(1, Math.round(w));
  b.hitH = Math.max(1, Math.round(h));
}

/** A tell: `attack` is live in `n` frames; `x0..x1` the floor it will cross. */
function tell(
  c: BossCtx,
  e: EnemyState,
  attack: 'strike' | 'leap' | 'flurry' | 'riposte',
  n: number,
  x0: number,
  x1: number,
): void {
  const b = c.boss;
  b.tell = attack;
  b.tellFrames = n;
  b.tellX0 = Math.round(Math.min(x0, x1));
  b.tellX1 = Math.round(Math.max(x0, x1));
  b.safeX = -1;
  const y = e.y + e.h / 2;
  c.events.push({
    type: 'bossTell',
    id: b.id,
    x: cx(e),
    y,
    attack,
    frames: n,
    x0: b.tellX0,
    x1: b.tellX1,
    safeX: -1,
    px: b.landX,
    py: ground(c, e).floor,
    len: Math.abs(b.tellX1 - b.tellX0),
    reach: 0,
    side: e.facing,
    dir: b.dir,
  });
  c.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: cx(e),
    y,
    dir: e.facing,
    frames: n,
    px: Math.abs(b.tellX1 - b.tellX0),
    speed: 0,
  });
}

function live(c: BossCtx, e: EnemyState, attack: 'strike' | 'leap' | 'flurry' | 'riposte', n: number): void {
  c.boss.tell = '';
  c.events.push({ type: 'bossAttack', id: c.boss.id, x: cx(e), y: e.y + e.h / 2, attack, frames: n });
}

/** Its window: winded (after an attack) or stunned (a broken guard). */
function open(c: BossCtx, e: EnemyState, n: number, how: 'winded' | 'stunned'): void {
  clearHit(c);
  c.boss.tell = '';
  c.boss.move = how === 'stunned' ? 'broken' : 'winded';
  c.boss.pressed = 0;
  stand(c, e, cx(e), c.t.mantis.height);
  setMode(e, 'recover', n);
  e.stunned = how === 'stunned';
  c.events.push({ type: 'bossOpen', id: c.boss.id, x: cx(e), y: e.y + e.h / 2, how, frames: n });
}

function stalk(c: BossCtx, e: EnemyState, n: number): void {
  clearHit(c);
  c.boss.move = 'stalk';
  c.boss.tell = '';
  e.stunned = false;
  stand(c, e, cx(e), c.t.mantis.height);
  setMode(e, 'walk', n);
}

// --- The moves.

function startStrike(c: BossCtx, e: EnemyState, M: M): void {
  const b = c.boss;
  const g = ground(c, e);
  const h = her(c);
  const x = cx(e);
  const dir = h.x < x - 2 ? -1 : h.x > x + 2 ? 1 : e.facing;
  const len = Math.max(M.strikeMin, Math.abs(h.x - x) + M.strikeOver);
  b.dir = dir;
  b.landX = Math.round(Math.max(g.lo, Math.min(g.hi, x + dir * len)));
  b.move = 'strike';
  e.facing = dir > 0 ? 1 : -1;
  stand(c, e, x, M.height);
  const n = frames(by(M.strikeTell, b.phase), 1);
  setMode(e, 'windup', n);
  tell(c, e, 'strike', n, x - (dir * e.w) / 2, b.landX + dir * (e.w / 2 + M.strikeReach));
}

function startLeap(c: BossCtx, e: EnemyState, M: M): void {
  const b = c.boss;
  const g = ground(c, e);
  b.move = 'leap';
  b.landX = Math.round(Math.max(g.lo, Math.min(g.hi, her(c).x)));
  face(c, e);
  stand(c, e, cx(e), M.crouch);
  const n = frames(by(M.leapTell, b.phase), 1);
  setMode(e, 'windup', n);
  tell(c, e, 'leap', n, b.landX - M.diveBand, b.landX + M.diveBand);
}

function startGuard(c: BossCtx, e: EnemyState, M: M): void {
  c.boss.move = 'guard';
  face(c, e);
  stand(c, e, cx(e), M.height);
  e.taps = 0;
  e.taken = e.hp;
  setMode(e, 'feint', frames(by(M.guardFrames, c.boss.phase), 1));
  c.events.push({
    type: 'bossCue',
    id: c.boss.id,
    x: cx(e),
    y: e.y + e.h / 2,
    set: 'guard',
    cue: 'raise',
    frame: c.boss.phaseTime,
  });
}

function startFlurry(c: BossCtx, e: EnemyState, M: M): void {
  const b = c.boss;
  b.move = 'flurry';
  face(c, e);
  b.dir = e.facing;
  e.dives = 0;
  stand(c, e, cx(e), M.height);
  const n = frames(by(M.flurryTell, b.phase), 1);
  setMode(e, 'windup', n);
  const x = cx(e);
  tell(c, e, 'flurry', n, x, x + e.facing * (M.flurryReach + 2 * M.flurryStep));
}

function startRiposte(c: BossCtx, e: EnemyState, M: M): void {
  const b = c.boss;
  b.move = 'riposte';
  face(c, e);
  b.dir = e.facing;
  setMode(e, 'windup', frames(M.ripTell, 1));
  const x = cx(e);
  tell(c, e, 'riposte', frames(M.ripTell, 1), x - e.facing * 60, x + e.facing * M.ripReach);
  c.events.push({ type: 'bossParry', id: b.id, x, y: e.y + e.h / 3 });
}

function startHop(c: BossCtx, e: EnemyState, M: M): void {
  const b = c.boss;
  const g = ground(c, e);
  const x = cx(e);
  const away = her(c).x < x ? 1 : -1;
  b.move = 'hop';
  b.pivotX = Math.round(x);
  b.landX = Math.round(Math.max(g.lo, Math.min(g.hi, x + away * M.hopDist)));
  b.pressed = 0;
  clearHit(c);
  setMode(e, 'back', frames(M.hopFrames, 1));
}

/** The pattern's next move, made to fit where she is. */
function pick(c: BossCtx, e: EnemyState): string {
  const b = c.boss;
  const M = c.t.mantis;
  const list = PATTERN[Math.max(0, Math.min(2, b.phase - 1))] as readonly string[];
  let m = list[b.moves % list.length] as string;
  b.moves++;
  const h = her(c);
  const d = Math.abs(h.x - cx(e));
  const high = h.y < ground(c, e).floor - 200;
  const first = m.split('+')[0] as string;
  // (A guard far from her is time wasted; a flurry out of reach too; she is up high: it comes for her.)
  if (first === 'guard' && d > M.range + 140) m = 'leap';
  if (first === 'flurry' && d > M.near * 1.5) m = m.replace('flurry', 'strike');
  if (high && (first === 'guard' || first === 'flurry')) m = 'leap';
  return m;
}

function begin(c: BossCtx, e: EnemyState, move: string, M: M): void {
  if (move === 'strike') startStrike(c, e, M);
  else if (move === 'leap') startLeap(c, e, M);
  else if (move === 'guard') startGuard(c, e, M);
  else if (move === 'flurry') startFlurry(c, e, M);
  else startStrike(c, e, M);
}

/** Starts a move from the pattern (a combo's second half waits in `chain`: 1 leap, 2 strike). */
function next(c: BossCtx, e: EnemyState, M: M): void {
  const parts = pick(c, e).split('+');
  c.boss.chain = parts[1] === 'leap' ? 1 : parts[1] === 'strike' ? 2 : parts[1] === 'flurry' ? 3 : 0;
  begin(c, e, parts[0] as string, M);
}

/** An attack is over: the window, or (in a combo) the second move after a short gap. */
function after(c: BossCtx, e: EnemyState, M: M, recover: number): void {
  const b = c.boss;
  if (b.chain > 0) {
    clearHit(c);
    b.move = 'gap';
    stand(c, e, cx(e), M.height);
    setMode(e, 'pause', frames(M.chainGap, 1));
    return;
  }
  open(c, e, recover, 'winded');
}

// --- One step of the fight.

function step(c: BossCtx, e: EnemyState, M: M): boolean {
  const b = c.boss;
  const g = ground(c, e);
  const h = her(c);
  const ph = b.phase;
  // Blows taken this step (`taken` = its hit points last step).
  const hit = e.taken - e.hp;
  e.taken = e.hp;
  if (b.waveT > 0) {
    // P3's ripple runs along the floor away from its landing.
    b.waveT--;
    b.waveX += b.waveDir * M.rippleSpeed;
    if (b.waveT <= 0 || b.waveX < g.lo - 40 || b.waveX > g.hi + 40) b.waveT = 0;
  }
  if (e.mode === 'walk') {
    clearHit(c);
    if (hit > 0) b.pressed += hit;
    face(c, e);
    if (b.pressed >= M.pressHits) {
      startHop(c, e, M);
      return false;
    }
    const d = h.x - cx(e);
    const ad = Math.abs(d);
    let v = 0;
    if (ad > M.range + 40) v = Math.sign(d) * M.walkSpeed;
    else if (ad < M.range - 80) v = -Math.sign(d) * M.backSpeed;
    const nx = Math.max(g.lo, Math.min(g.hi, cx(e) + v));
    stand(c, e, nx, M.height);
    if (--e.timer <= 0 && h.here) next(c, e, M);
  } else if (e.mode === 'back') {
    // The hop back: an arc away from her.
    const n = frames(M.hopFrames, 1);
    const k = 1 - e.timer / n;
    const x = b.pivotX + (b.landX - b.pivotX) * k;
    stand(c, e, x, M.height);
    e.y -= Math.round(4 * M.hopHeight * k * (1 - k));
    if (--e.timer <= 0) {
      stand(c, e, b.landX, M.height);
      b.chain = 0;
      startStrike(c, e, M);
    }
  } else if (e.mode === 'pause') {
    // A combo's gap: the second move comes.
    if (--e.timer <= 0) {
      const ch = b.chain;
      b.chain = 0;
      face(c, e);
      if (ch === 1) startLeap(c, e, M);
      else if (ch === 3) startFlurry(c, e, M);
      else startStrike(c, e, M);
    }
  } else if (e.mode === 'windup') {
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (b.move === 'leap' && b.tellFrames > 4) {
      // (The crouch follows her until it springs.)
      b.landX = Math.round(Math.max(g.lo, Math.min(g.hi, h.x)));
      b.tellX0 = b.landX - M.diveBand;
      b.tellX1 = b.landX + M.diveBand;
    }
    if (--e.timer <= 0) {
      if (b.move === 'strike') {
        live(c, e, 'strike', Math.max(1, Math.round(Math.abs(b.landX - cx(e)) / M.strikeSpeed)));
        stand(c, e, cx(e), M.crouch);
        setMode(e, 'charge', 0);
      } else if (b.move === 'leap') {
        b.pivotX = Math.round(cx(e));
        b.move = 'rise';
        stand(c, e, cx(e), M.height);
        setMode(e, 'hover', frames(M.leapRise, 1));
      } else if (b.move === 'flurry') {
        live(c, e, 'flurry', frames(M.flurryLive, 1) * 2 + frames(M.flurryGap, 1));
        setMode(e, 'slam', frames(M.flurryLive, 1));
      } else if (b.move === 'riposte') {
        live(c, e, 'riposte', frames(M.ripLive, 1));
        setMode(e, 'slam', frames(M.ripLive, 1));
      }
    }
  } else if (e.mode === 'charge') {
    // The dash: crouched, forelegs out; its blade reaches ahead of it.
    const x = cx(e);
    const there = Math.abs(b.landX - x) <= M.strikeSpeed;
    stand(c, e, there ? b.landX : x + b.dir * M.strikeSpeed, M.crouch);
    const r = M.strikeReach;
    setHit(c, b.dir > 0 ? e.x : e.x - r, e.y, e.w + r, e.h);
    if (there) after(c, e, M, frames(by(M.strikeRecover, ph), 1));
    return !there;
  } else if (e.mode === 'hover') {
    const top = g.floor - M.leapHeight;
    if (b.move === 'rise') {
      const n = frames(M.leapRise, 1);
      const k = 1 - (e.timer - 1) / n;
      const ease = 1 - (1 - k) * (1 - k);
      const x = b.pivotX + (b.landX - b.pivotX) * ease;
      stand(c, e, x, M.height);
      e.y = Math.round(g.floor - M.height - (M.leapHeight - M.height) * ease);
      if (--e.timer <= 0) {
        // The hang: where it lands is set now (her x), and shown.
        b.move = 'hang';
        b.landX = Math.round(Math.max(g.lo, Math.min(g.hi, h.x)));
        const n2 = frames(by(M.leapHang, ph), 1);
        setMode(e, 'hover', n2);
        e.facing = b.landX < cx(e) ? -1 : 1;
        tell(
          c,
          e,
          'leap',
          n2 + Math.round((M.leapHeight - M.height) / M.diveSpeed),
          b.landX - M.diveBand,
          b.landX + M.diveBand,
        );
      }
    } else {
      e.y = Math.round(top);
      if (--e.timer <= 0) {
        live(c, e, 'leap', Math.round((M.leapHeight - M.height) / M.diveSpeed));
        setMode(e, 'dive', 0);
      }
    }
  } else if (e.mode === 'dive') {
    // Straight at the committed point.
    const tx = b.landX;
    const ty = g.floor - M.height;
    const dx = tx - cx(e);
    const dy = ty - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= M.diveSpeed) {
      stand(c, e, tx, M.height);
      c.events.push({
        type: 'bossCue',
        id: b.id,
        x: cx(e),
        y: g.floor,
        set: 'leap',
        cue: 'land',
        frame: b.phaseTime,
      });
      if (ph >= 3) {
        b.waveX = cx(e);
        b.waveDir = h.x < cx(e) ? -1 : 1;
        b.waveT = frames(M.rippleFrames, 1);
      }
      after(c, e, M, frames(by(M.diveStall, ph), 1));
      return false;
    }
    e.x = Math.round(e.x + (dx / d) * M.diveSpeed);
    e.y = Math.round(e.y + (dy / d) * M.diveSpeed);
    return true;
  } else if (e.mode === 'slam') {
    // A cut: its blade's box ahead of it (a riposte reaches behind it a little too).
    const x = cx(e);
    if (b.move === 'flurry') {
      stand(c, e, x + (b.dir * M.flurryStep) / Math.max(1, frames(M.flurryLive, 1)), M.height);
      const r = M.flurryReach;
      setHit(c, b.dir > 0 ? cx(e) : cx(e) - r, e.y - 10, r, e.h + 10);
    } else {
      const r = M.ripReach;
      setHit(c, b.dir > 0 ? x - 60 : x - r, e.y - 30, r + 60, e.h + 30);
    }
    if (--e.timer <= 0) {
      clearHit(c);
      if (b.move === 'flurry' && e.dives === 0) {
        e.dives = 1;
        setMode(e, 'stall', frames(M.flurryGap, 1));
        b.move = 'flurryGap';
      } else if (b.move === 'flurry') after(c, e, M, frames(by(M.flurryRecover, ph), 1));
      else open(c, e, frames(M.ripRecover, 1), 'winded');
    }
  } else if (e.mode === 'stall' && b.move === 'flurryGap') {
    if (--e.timer <= 0) {
      b.move = 'flurry';
      face(c, e);
      b.dir = e.facing;
      setMode(e, 'slam', frames(M.flurryLive, 1));
    }
  } else if (e.mode === 'feint') {
    // The guard: a parried cut (blocks counted it) ripostes; a blow that landed (from above or behind) breaks it.
    clearHit(c);
    face(c, e);
    if (hit > 0) {
      c.events.push({
        type: 'bossCue',
        id: b.id,
        x: cx(e),
        y: e.y,
        set: 'guard',
        cue: 'break',
        frame: b.phaseTime,
      });
      open(c, e, frames(M.guardBroken, 1), 'stunned');
    } else if (e.taps > 0) {
      e.taps = 0;
      startRiposte(c, e, M);
    } else if (--e.timer <= 0) stalk(c, e, frames(by(M.stalk, ph) / 2, 1));
  } else if (e.mode === 'recover') {
    if (--e.timer <= 0) {
      e.stunned = false;
      stalk(c, e, frames(by(M.stalk, ph), 1));
    }
  }
  // The ripple's box (when nothing else of its blade is live).
  if (b.waveT > 0 && b.hitW === 0) setHit(c, b.waveX - 22, g.floor - M.rippleH, 44, M.rippleH);
  return false;
}

// --- The phase table, cues and the fight.

export const mantisRules: BossRules = {
  phases: [
    { name: 'the threat', exam: 'read the display, jump the strike' },
    { name: 'the guard', exam: 'cut from above, never into its guard' },
    { name: 'the frenzy', exam: 'two moves at once' },
  ],

  cues: (t) => t.mantis.cues,

  init(c, _retry, down) {
    const { state, scene, spec } = c;
    const L = state.lures;
    const hi = lureIndex(scene, spec.heart);
    const l = scene.lures?.[hi];
    // The brightest lamp: burning, guarded (the blade passes through it) until it is beaten.
    if (l && hi >= 0) {
      L.hp[hi] = down ? 0 : lureHpMax(l, c.t);
      L.out[hi] = down ? 1 : 0;
      if (L.live) L.live.shield[hi] = 1;
    }
    L.snuffed = L.out.filter((o) => o > 0).length;
    const e = creature(c);
    if (!e) return;
    const M = c.t.mantis;
    e.hp = frames(by(M.hp, 1), 1);
    e.hpMax = e.hp;
    e.taken = e.hp;
    e.gone = down;
    e.stunned = false;
    e.span = 1;
    e.w = M.width;
    stand(c, e, e.homeX, M.height);
    setMode(e, down ? 'dead' : 'sit', 0);
  },

  update(c) {
    const { boss } = c;
    const e = creature(c);
    if (!e || boss.stage !== 'fight') return;
    if (e.hp > 0) return;
    clearHit(c);
    boss.waveT = 0;
    boss.tell = '';
    if (boss.phase < 3) {
      boss.move = 'rear';
      e.stunned = false;
      stand(c, e, cx(e), c.t.mantis.height);
      setMode(e, 'rear', 0);
      shift(c, `p${boss.phase}end`);
    } else {
      boss.move = 'dead';
      setMode(e, 'dead', frames(c.t.mantis.deadFrames, 1));
      stand(c, e, cx(e), c.t.mantis.crouch);
      defeat(c);
    }
  },

  jump(c, n) {
    const e = creature(c);
    if (n <= 1) {
      this.cue(c, 'intro', 'start');
      return;
    }
    this.cue(c, n === 2 ? 'p1end' : 'p2end', 'next');
    if (e) stand(c, e, e.homeX, c.t.mantis.height);
  },

  cue(c, set, cue) {
    const e = creature(c);
    const M = c.t.mantis;
    if (cue === 'next' || (set === 'intro' && cue === 'start')) {
      const n = set === 'intro' ? 1 : set === 'p1end' ? 2 : 3;
      setPhase(c, n);
      c.boss.moves = 0;
      c.boss.chain = 0;
      c.boss.pressed = 0;
      if (e) {
        e.hp = frames(by(M.hp, n), 1);
        e.hpMax = e.hp;
        e.taken = e.hp;
        e.span = n;
        stalk(c, e, frames(by(M.stalk, n), 1));
      }
    } else if (set === 'defeat' && cue === 'lampOut') {
      // The brightest lamp goes out with it: its moths go free.
      const hi = lureIndex(c.scene, c.spec.heart);
      const l = c.scene.lures?.[hi];
      if (l && hi >= 0 && (c.state.lures.hp[hi] ?? 0) > 0) {
        c.state.lures.hp[hi] = 0;
        c.state.lures.out[hi] = c.state.frame + 1;
        c.events.push({
          type: 'lureSnuff',
          id: l.id,
          kind: l.kind,
          x: l.x,
          y: l.y,
          dir: 'fwd',
          moths: 0,
          freed: 0,
          snuffed: c.state.lures.out.filter((o) => o > 0).length,
          heal: 0,
        });
      }
    } else if (set === 'defeat' && cue === 'done') {
      if (e) e.gone = true;
      finish(c);
    }
  },
};

/** The fight's context for the creature's own update (null outside a Mantis fight of this room). */
function fightOf(info: StepInfo): BossCtx | null {
  const { state, scene } = info;
  const spec = scene.boss;
  const boss = state.boss;
  if (!spec || !boss || spec.kind !== 'mantis') return null;
  return { rules: mantisRules, state, scene, spec, boss, t: info.t, events: info.events };
}

export const mantis: KindRules = {
  width: (t) => t.mantis.width,
  height: (t) => t.mantis.height,
  hp: (t) => by(t.mantis.hp, 1),
  hurtFrames: (t) => t.mantis.hurtFrames,
  hurtSafeFrames: (t) => t.mantis.hurtSafeFrames,
  contactDamage: (t) => t.mantis.contactDamage,
  deadFrames: (t) => t.mantis.deadFrames,
  value: () => 0,

  place(e, spawn) {
    // (`x`, `y` = its feet centre.)
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h);
    e.homeX = spawn.x;
    e.mode = 'sit';
  },

  update(e, _index, info) {
    const c = fightOf(info);
    if (!c) return false;
    const b = c.boss;
    if (b.stage === 'down' || e.mode === 'dead') {
      clearHit(c);
      return false;
    }
    if (b.stage !== 'fight') {
      // Before the lock and in the intro it stands and watches her; between phases it rears.
      clearHit(c);
      b.waveT = 0;
      if (e.mode !== 'rear') face(c, e);
      e.taken = e.hp;
      return false;
    }
    const x0 = e.x;
    const y0 = e.y;
    const hot = step(c, e, info.t.mantis);
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    return hot;
  },

  sees(_e, info) {
    const b = info.state.boss;
    return !!b && (b.stage === 'fight' || b.stage === 'intro');
  },

  /** Its guard: a forward cut from the side it faces glances off (and it will riposte). */
  blocks(e, dir, px) {
    if (e.mode !== 'feint' || dir !== 'fwd') return false;
    const front = (px - (e.x + e.w / 2)) * e.facing >= -8;
    if (front) e.taps++;
    return front;
  },

  shove(e) {
    e.knockVx = 0;
    e.knockVy = 0;
    return 0;
  },

  tough: () => true,
  undying: () => true,
};
