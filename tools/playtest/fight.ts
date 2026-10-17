/**
 * Fights, by look-ahead (the same idea as lines.ts): when a creature is close, the persona plays a handful
 * of tactics forward in a copy of the sim for a couple of seconds (wait, back off, press and cut, pogo
 * its shell on the tell, hop over a ram, bait a ram into a wall and cut the stunned creature, run past)
 * and plays the one that comes out best (hits dealt and the kill against hits taken), for a short beat,
 * then looks again. Nothing here is creature-specific: the tells, the braced shell that only takes a
 * down cut and the wall stun all show in the look-ahead's outcome. Pure: Node and the page.
 */
import type { SimEvent } from '../../src/sim/events';
import { cloneState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { solidAt } from '../../src/sim/physics/aabb';
import type { Scene } from '../../src/sim/scene';
import type { EnemyState, GameState } from '../../src/sim/state';
import { withShortcuts } from '../../src/sim/world';
import { type Candidate, dirBit, type Line, type SimCtx } from './lines';

const D = ActionBit.down;
const J = ActionBit.jump;
const A = ActionBit.attack;

/** Creatures a fight is about (not silk, not dead, not asleep). */
export function hostile(e: EnemyState): boolean {
  if (e.gone || e.mode === 'dead' || e.kind === 'web') return false;
  const mode = e.mode as string;
  return mode !== 'sleep' && mode !== 'dispersed' && !(e as unknown as { dispersed?: boolean }).dispersed;
}

/** The creature a fight would be with: the nearest hostile one within reach of her, or -1. */
export function foe(s: GameState, rangeX = 420, rangeY = 260): number {
  const p = s.player;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  s.enemies.forEach((e, i) => {
    if (!hostile(e)) return;
    const dx = Math.abs(e.x + e.w / 2 - fx);
    const dy = Math.abs(e.y + e.h - fy);
    if (dx > rangeX || dy > rangeY) return;
    if (dx + dy < bd) {
      bd = dx + dy;
      best = i;
    }
  });
  return best;
}

function centre(e: EnemyState): { x: number; y: number } {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

/** A tactic: a controller aimed at enemy `i` (`fresh`, when given, makes the controller anew for each line). */
function tactic(
  name: string,
  act: (s: GameState, e: EnemyState, k: number, prev: number) => number,
  i: number,
  fresh?: () => (s: GameState, e: EnemyState, k: number, prev: number) => number,
): Candidate {
  return {
    name,
    make: (): Line => {
      const fn = fresh ? fresh() : act;
      return {
        name,
        max: 600,
        act(s, k, prev) {
          const e = s.enemies[i];
          const p = s.player;
          const caught =
            ((p as unknown as { lure?: number }).lure ?? -1) >= 0 ||
            ((p as unknown as { grab?: number }).grab ?? -1) >= 0;
          if (caught) return k % 6 < 2 ? A : 0;
          if (!e) return 0;
          return fn(s, e, k, prev);
        },
      };
    },
  };
}

/** Is there a wall `d` px away from her in direction `dir` at her height (scanned in 32 px steps)? */
function wallAt(scene: Scene, s: GameState, dir: number, upTo: number): number {
  const p = s.player;
  // The scene as played: shut gates and standing bark are walls too.
  const played = withShortcuts(scene, s.save);
  for (let d = 32; d <= upTo; d += 32) {
    const x = dir > 0 ? p.x + p.w + d : p.x - d;
    if (solidAt(played, x, p.y + 8, 1, p.h - 16)) return d;
  }
  return -1;
}

/** The tactics a persona knows against creature `i`. `toward`: the way its route goes on. */
export function fightTactics(scene: Scene, i: number, toward: number): Candidate[] {
  const out: Candidate[] = [];
  const toE = (s: GameState, e: EnemyState) => Math.sign(centre(e).x - (s.player.x + s.player.w / 2)) || 1;
  const dx = (s: GameState, e: EnemyState) => Math.abs(centre(e).x - (s.player.x + s.player.w / 2));
  const braced = (e: EnemyState) => e.braced || e.mode === 'windup' || e.mode === 'charge';
  out.push(tactic('wait', () => 0, i));
  out.push(
    tactic(
      'back off',
      (s, e) => {
        const away = -toE(s, e);
        return dirBit(away) | (s.player.grounded && s.player.wallDir === away ? J : 0);
      },
      i,
    ),
  );
  // Press: close in, cut when in reach and facing it; the shell forward: no forward cut (it glances).
  out.push(
    tactic(
      'press and cut',
      (s, e, _k, prev) => {
        const d = toE(s, e);
        const near = dx(s, e) < 120;
        let m = near ? 0 : dirBit(d);
        if (near && s.player.facing !== d) m |= dirBit(d);
        if (near && !braced(e) && !(prev & A) && s.player.facing === d) m |= A;
        return m;
      },
      i,
    ),
  );
  // Pogo: over it and a down cut (on its tell, when the braced shell takes only that).
  for (const lead of [0, 40])
    out.push(
      tactic(
        `pogo${lead ? ' (early)' : ''}`,
        (s, e, _k, prev) => {
          const p = s.player;
          const d = toE(s, e);
          const c = centre(e);
          const fx = p.x + p.w / 2;
          if (p.grounded) {
            if (dx(s, e) < 110 + lead && !(prev & J)) return J | dirBit(d);
            return dirBit(d);
          }
          let m = Math.abs(c.x - fx) > 12 ? dirBit(Math.sign(c.x - fx)) : 0;
          if (p.vy < 0 && prev & J) m |= J;
          if (p.y + p.h < e.y + 8 && Math.abs(c.x - fx) < 70 && !(prev & A)) m |= A | D;
          return m;
        },
        i,
      ),
    );
  // Hop over a ram coming at her, then turn and cut its back.
  out.push(
    tactic(
      'hop over',
      (s, e, _k, prev) => {
        const p = s.player;
        const d = toE(s, e);
        if (p.grounded && (e.mode === 'charge' || e.mode === 'windup') && dx(s, e) < 200 && !(prev & J))
          return J | dirBit(d);
        if (!p.grounded) return J | dirBit(d);
        if (dx(s, e) < 120 && !braced(e) && !(prev & A)) return A | (p.facing !== d ? dirBit(d) : 0);
        return 0;
      },
      i,
    ),
  );
  // Bait: to a wall (behind her, or beyond it: hop over it first) and wait; jump the ram (it hits the
  // wall: stunned, its shell open); cut it while it is stunned.
  for (const beyond of [false, true])
    out.push(
      tactic(
        beyond ? 'bait into the far wall' : 'bait into a wall',
        () => 0,
        i,
        () => {
          let side = 0;
          return (s, e, _k, prev) => {
            const p = s.player;
            const d = toE(s, e);
            const stunned = (e as unknown as { stunned?: boolean }).stunned;
            if (stunned) {
              if (dx(s, e) > 100) return dirBit(d);
              return !(prev & A) ? A | (p.facing !== d ? dirBit(d) : 0) : 0;
            }
            if (
              p.grounded &&
              (e.mode === 'charge' || (e.mode as string) === 'feint') &&
              dx(s, e) < 150 &&
              !(prev & J)
            )
              return J;
            if (!p.grounded)
              return prev & J && p.vy < 0
                ? J | (side === 0 ? 0 : dirBit(side))
                : side === 0
                  ? 0
                  : dirBit(side);
            // Beyond: first over it (a hop as it comes), then the wall on that side.
            if (beyond && side === 0) side = d;
            if (beyond && side !== 0 && Math.sign(centre(e).x - (p.x + p.w / 2)) === side) {
              if (dx(s, e) < 170 && !(prev & J)) return J | dirBit(side);
              return dirBit(side);
            }
            const away = beyond ? side : -d;
            const w = wallAt(scene, s, away, 1200);
            if (w > 90) return dirBit(away);
            return 0;
          };
        },
      ),
    );
  // Run past, on with the route (jumping it if it is in the way).
  out.push(
    tactic(
      'run past',
      (s, e, _k, prev) => {
        const p = s.player;
        let m = dirBit(toward);
        if (p.grounded && (dx(s, e) < 160 || p.wallDir === toward) && !(prev & J)) m |= J;
        else if (!p.grounded && prev & J && p.vy < 0) m |= J;
        return m;
      },
      i,
    ),
  );
  return out;
}

export interface Rollout {
  dealt: number;
  taken: number;
  killed: boolean;
  faded: boolean;
  caught: number;
  frames: number;
  /** It stood stunned (its shell open) at some point. */
  stunned: boolean;
}

/** Plays a tactic `frames` ahead and tallies what it does to both. */
export function rollout(ctx: SimCtx, scene: Scene, line: Line, i: number, frames: number): Rollout {
  const s = cloneState(ctx.state);
  const id = s.enemies[i]?.id ?? '';
  const ev: SimEvent[] = [];
  const r: Rollout = { dealt: 0, taken: 0, killed: false, faded: false, caught: 0, frames, stunned: false };
  let prev = s.prevInput;
  for (let k = 0; k < frames; k++) {
    const m = line.act(s, k, prev);
    prev = m;
    ev.length = 0;
    step(s, m, ctx.tuning, scene, ev);
    for (const e of ev) {
      if (e.type === 'hurt') r.taken++;
      if (e.type === 'enemyHit' && e.id === id) r.dealt += e.power ?? 1;
      if (e.type === 'enemyDie' && e.id === id) r.killed = true;
      if (e.type === 'fade') r.faded = true;
      if (e.type === 'fallCatch' || (e.type as string) === 'lureCaught') r.caught++;
      if (e.type === 'roomExit') return { ...r, frames: k };
    }
    if ((s.enemies[i] as unknown as { stunned?: boolean } | undefined)?.stunned) r.stunned = true;
    if (r.killed || r.faded) return { ...r, frames: k };
  }
  return r;
}

/** Lower is better: a hit taken costs more than three dealt; the kill is the prize; waiting costs a little. */
export function fightScore(r: Rollout, name: string): number {
  return (
    900 * r.taken -
    250 * r.dealt -
    (r.killed ? 3000 : 0) +
    (r.faded ? 6000 : 0) +
    400 * r.caught -
    (r.stunned ? 500 : 0) +
    (name === 'wait' || name === 'back off' ? 80 : 0) +
    (r.killed ? r.frames : 0)
  );
}

/** The best tactic now against creature `i`, by look-ahead over `horizon` frames. */
export function chooseTactic(
  ctx: SimCtx,
  scene: Scene,
  cands: readonly Candidate[],
  i: number,
  /** The tactic under way: kept unless another is clearly better (no dithering between two plans). */
  current = '',
  horizon = 480,
): { cand: Candidate; r: Rollout } | null {
  let best: { cand: Candidate; r: Rollout } | null = null;
  let bs = Number.POSITIVE_INFINITY;
  for (const c of cands) {
    const r = rollout(ctx, scene, c.make(), i, horizon);
    const sc = fightScore(r, c.name) - (c.name === current ? 300 : 0);
    const dbg = (globalThis as { __ptDebug?: (s: string) => void }).__ptDebug;
    if (dbg)
      dbg(
        `f${ctx.state.frame} fight ${c.name}: dealt ${r.dealt} taken ${r.taken}${r.killed ? ' KILL' : ''}${r.faded ? ' FADE' : ''} -> ${sc}`,
      );
    if (sc < bs) {
      bs = sc;
      best = { cand: c, r };
    }
  }
  return best;
}
