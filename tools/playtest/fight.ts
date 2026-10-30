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
import { defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { Aim, type Candidate, dirBit, type Line, type SimCtx } from './lines';

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
    // Carriers (ants) are terrain, not a fight: they bite on contact but never hunt, and the crack sends more.
    if (!hostile(e) || (e.kind as string) === 'carrier') return;
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
  /** It handles being caught by a lamp itself (the den's throw), rather than cutting free. */
  catches = false,
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
          if (caught && !(catches && e && ((p as unknown as { lure?: number }).lure ?? -1) >= 0))
            return k % 6 < 2 ? A : 0;
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

/** The scene's spawn row of creature `i` (its taproot, its home). */
function e0(
  scene: Scene,
  i: number,
): (NonNullable<Scene['enemies']>[number] & { taproot?: [number, number] }) | undefined {
  return scene.enemies?.[i] as
    | (NonNullable<Scene['enemies']>[number] & { taproot?: [number, number] })
    | undefined;
}

/**
 * The den (the old burrback's three phases), one controller for bots and people alike (`lead`: a person's lag,
 * frames; their motor adds the rest):
 * - never camp: off any ledge onto its floor (it slams campers off after 3 s);
 * - its ram (phase 1, 3): wait for it at a ram's length (in phase 3 with the taproot behind her, so the ram ends in
 *   the root), hop it as it comes, then cut it while it lies open;
 * - the roll (phase 2): jump as the ball comes and come down on it (a landing unrolls it), or get caught by the
 *   den's lamp and throw onto it, cutting at once (the throw-cut unrolls it); then cut it while it lies open.
 */
function denTactic(scene: Scene, i: number, lead: number): Candidate {
  return tactic(
    'the den',
    () => 0,
    i,
    () => {
      let aim: Aim | null = null;
      let lampTries = 0;
      // A jump decided is held its full length (a person's press; their hands lag the frame it was decided).
      let jumpUntil = -1;
      let rootWait = -1;
      // Its ground: from its home to its fence (`radius`) or a wall either way (where a ram ends).
      let range: [number, number] | null = null;
      const groundOf = (e: EnemyState): [number, number] => {
        const sp = e0(scene, i) as { x: number; y: number; radius?: number } | undefined;
        const home = sp?.x ?? e.x + e.w / 2;
        const r = sp?.radius ?? 1000;
        const fy = (sp?.y ?? e.y + e.h) - 40;
        let lo = home;
        while (lo > home - r && !solidAt(scene, lo - 16, fy, 1, 8)) lo -= 16;
        let hi = home;
        while (hi < home + r && !solidAt(scene, hi + 16, fy, 1, 8)) hi += 16;
        return [lo, hi];
      };
      const act = (s: GameState, e: EnemyState, k: number, prev: number): number => {
        range ??= groundOf(e);
        const p = s.player;
        const px = p.x + p.w / 2;
        const fy = p.y + p.h;
        const c = centre(e);
        const d = Math.sign(c.x - px) || 1;
        const dist = Math.abs(c.x - px);
        const floorY = e.y + e.h;
        const mode = e.mode as string;
        const stunned = !!(e as unknown as { stunned?: boolean }).stunned;
        const lamp = (scene.lures ?? [])
          .map((l, j) => ({ ...l, j }))
          .filter(
            (l) => !(s.lures.out[l.j] ?? 0) && Math.abs(l.y - floorY) < 460 && Math.abs(l.x - c.x) < 1400,
          )
          .sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px))[0];
        // Caught by the den's lamp: the throw aimed where the ball will be; free, cut at once (heavy).
        if (p.lure >= 0) {
          aim ??= new Aim(() => ({ x: c.x + e.vx * 18, y: floorY }), lead > 0 ? 3 : 1);
          return aim.act(s, scene, k, prev);
        }
        aim = null;
        if (p.thrown && p.lureThrow > 0) {
          const flameNear = !!lamp && Math.hypot(lamp.x - px, lamp.y - (p.y + p.h / 2)) < 110;
          if (dist < 200 && !flameNear && !(prev & A))
            return A | dirBit(d) | (c.y > p.y + p.h ? ActionBit.down : 0);
          return dirBit(d) | (prev & J ? J : 0);
        }
        // Up on a ledge over its floor: down (camping is slammed).
        if (p.grounded && floorY - fy > 60) return onOneWay(s, scene) ? (prev & J ? D : D | J) : dirBit(d);
        // Open on its back: in and cut.
        if (stunned) {
          if (!p.grounded) return dirBit(d);
          if (dist > 90) return dirBit(d);
          if (p.facing !== d) return dirBit(d);
          return prev & A ? 0 : A;
        }
        if (mode === 'roll') {
          const coming = Math.sign(e.vx) === -d && Math.abs(e.vx) > 0.5;
          if (!p.grounded) {
            // Over it: steer onto it; a down cut as it passes under (a landing unrolls it either way).
            let m = Math.abs(c.x + e.vx * 4 - px) > 16 ? dirBit(Math.sign(c.x + e.vx * 4 - px)) : 0;
            if (p.vy < 0 && prev & J) m |= J;
            if (c.y > p.y + p.h - 40 && Math.abs(c.x - px) < 70 && !(prev & A)) m |= A | ActionBit.down;
            return m;
          }
          const eta = (dist - 70) / Math.max(1, Math.abs(e.vx)) - lead;
          // The den's lamp (a few tries a fight): wait under it; as the ball comes, up into it (caught, out of
          // its way), then the throw aimed onto it and a cut as she flies (the throw-cut unrolls it).
          if (lamp && lampTries < 3 && !process.env.DEN_NO_LAMP) {
            const ldx = lamp.x - px;
            if (coming && eta < 22 && Math.abs(ldx) < 50) {
              lampTries++;
              return prev & J ? 0 : J;
            }
            if (!coming || eta > 40) return Math.abs(ldx) > 24 ? dirBit(Math.sign(ldx)) : 0;
          }
          // It comes: up as it is about to reach her (it passes under, she lands on it or behind it).
          if (coming && eta < 14 && !(prev & J)) return J;
          return 0;
        }
        if (mode === 'windup' || mode === 'charge' || mode === 'feint') {
          // Its tell: straight up (it lunges under a jump anywhere in the tell and lies open past her), unless
          // the end of its ground is close behind her (the ram would stop under her): then over it.
          const behind = d > 0 ? px - range[0] : range[1] - px;
          const vault = behind < 320;
          if (!p.grounded) return (prev & J && p.vy < 0 ? J : 0) | (vault ? dirBit(d) : 0);
          if (mode === 'windup' || dist - Math.abs(e.vx) * lead < 260)
            return prev & J ? 0 : J | (vault ? dirBit(d) : 0);
          return 0;
        }
        if (!p.grounded) return prev & J && p.vy < 0 ? J : 0;
        // Curled, rearing, waking: keep a ram's length, on its floor.
        if (['curl', 'rear', 'wake', 'alert', 'recover'].includes(mode)) return dist < 240 ? dirBit(-d) : 0;
        // Phase 3: the taproot behind her, so its ram ends in the root.
        // (If it will not come to her there, out to draw it as in phase 1. `DEN_HOLD`: never out; the v4 den's
        // solid shelves roof the floor, and a ram pulls up at a roof's mouth, so one drawn in the middle never
        // reaches the root: wait by it until the creature walks into the strip between the east shelf and it.)
        const root = e0(scene, i)?.taproot;
        if (e.phase >= 3 && root && (process.env.DEN_HOLD ? true : k - rootWait < 150)) {
          const side = Math.sign(c.x - (root[0] + root[1]) / 2) || -1;
          const spot = side < 0 ? root[0] - 110 : root[1] + 110;
          if (Math.abs(spot - px) > 30) return dirBit(Math.sign(spot - px));
          if (rootWait < 0 || k - rootWait > 400) rootWait = k;
          return 0;
        }
        // Phase 1: in to draw the ram (it braces once she is in its range), not under its nose, and with room
        // behind her for the ram to carry past (toward the middle of its ground when it is not there).
        const room = d > 0 ? px - range[0] : range[1] - px;
        if (e.braced) return dist < 140 ? dirBit(-d) : 0;
        if (room < 320 && dist > 260) return dirBit(d);
        if (dist > 170) return dirBit(d);
        if (dist < 110) return dirBit(-d);
        return 0;
      };
      return (s, e, k, prev) => {
        const m = act(s, e, k, prev);
        if (m & J && s.player.grounded && k >= jumpUntil) jumpUntil = k + 20;
        return k < jumpUntil && s.player.lure < 0 ? m | J : m;
      };
    },
    true,
  );
}

/** The tactics a persona knows against creature `i`. `toward`: the way its route goes on. */
/** Standing on a one-way (a drop-through ledge or mesh)? */
function onOneWay(s: GameState, scene: Scene): boolean {
  const p = s.player;
  if (!p.grounded) return false;
  const fy = p.y + p.h;
  return (scene.oneWays ?? []).some((o) => Math.abs(o.y - fy) <= 2 && o.x < p.x + p.w && o.x + o.w > p.x);
}

/** The old burrback's slam wave (round 6) is on its way to her and close: a person jumps it. */
function waveComing(s: GameState, e: EnemyState, lead: number): boolean {
  if (e.wave <= 0) return false;
  const v = defaultTuning.oldBurrback.slamWaveSpeed;
  const p = s.player;
  const ahead = Math.abs(p.x + p.w / 2 - e.waveX) - p.w / 2 - e.wave;
  return ahead > -v && ahead < v * (lead + 8);
}

export function fightTactics(scene: Scene, i: number, toward: number, lead = 0): Candidate[] {
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
        // Up on a one-way over it (an escape ledge): down through it first.
        if (onOneWay(s, scene) && e.y > s.player.y + s.player.h + 40 && dx(s, e) < 400)
          return prev & J ? ActionBit.down : ActionBit.down | J;
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
        // `lead` (a person, frames behind what they see): the jump goes where the ram will be, not where it is.
        const near = dx(s, e) - Math.abs(e.vx) * lead < 200;
        if (
          p.grounded &&
          (((e.mode === 'charge' || e.mode === 'windup' || e.mode === 'roll') && near) ||
            waveComing(s, e, lead)) &&
          !(prev & J)
        )
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
              (((e.mode === 'charge' || (e.mode as string) === 'feint' || e.mode === 'roll') &&
                dx(s, e) - Math.abs(e.vx) * lead < 150) ||
                waveComing(s, e, lead)) &&
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
              if (dx(s, e) - Math.abs(e.vx) * lead < 170 && !(prev & J)) return J | dirBit(side);
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
  // The old burrback as a boss (memory/creatures.md round 5): one plan through its three phases.
  if ((e0(scene, i)?.kind as string) === 'oldBurrback') out.push(denTactic(scene, i, lead));
  // Down to it: off the ledge she waits on (through a one-way, or off the end toward it), to bait its ram.
  out.push(
    tactic(
      'come down',
      (s, e, _k, prev) => {
        const p = s.player;
        if (!p.grounded) return 0;
        if (onOneWay(s, scene)) return prev & J ? ActionBit.down : ActionBit.down | J;
        return dirBit(toE(s, e));
      },
      i,
    ),
  );
  // Its lamp: a lamp-guarder (and every creature guarding the same wick, R9's beetle and dangler) gives up when
  // the flame it guards goes out. To the flame, up to it, cut it (up, down or ahead, as it hangs).
  out.push(
    tactic(
      'snuff its lamp',
      (s, e, _k, prev) => {
        const gi = (e as unknown as { guard?: number }).guard ?? -1;
        const l = scene.lures?.[gi];
        if (!l || (s.lures.out[gi] ?? 0) > 0) return 0;
        const p = s.player;
        const dx = l.x - (p.x + p.w / 2);
        const dy = l.y - (p.y + p.h / 2);
        if (Math.abs(dx) < 70 && Math.abs(dy) < 120) {
          if (prev & A) return 0;
          if (dy < -50) return A | ActionBit.up;
          if (dy > 50 && !p.grounded) return A | ActionBit.down;
          return A | dirBit(Math.sign(dx) || 1);
        }
        let m = dirBit(Math.sign(dx));
        if (p.grounded && dy < -90 && Math.abs(dx) < 170 && !(prev & J)) m |= J;
        else if (!p.grounded && prev & J && p.vy < 0) m |= J;
        return m;
      },
      i,
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
