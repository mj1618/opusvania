/**
 * The carriers (ants; area1-plan-r5 §2.1, memory/creatures.md): scavengers. A line of them walks a fixed
 * trail from the pool under a lamp down to a crack in the floor, each carrying a dead moth's wing, goes in,
 * and comes back out at the trail's start with the next. They do not hunt her: they bite on contact, and
 * one that finds her standing on its trail ahead stops, tells and bites. One cut kills one. When their
 * lamp goes out (`guards`) they finish the trip and stop coming.
 *
 * Spawn: `{kind: 'carrier', x, y (the trail's start, feet), trail: [[x, y], ...] (the rest of it, feet, the
 * last point the crack), phase? (0..1 of its loop, so a line is spaced out), guards?}`, or `follow: '<id>'`
 * to walk another carrier's trail. Deterministic: it follows the trail on rails (no physics), at
 * `tuning.carrier.speed`.
 *
 * State: `segT` = how far along the trail (px); `span` = the trail's length; `facing` = the way it walks;
 * mode `walk` (carrying), `alert` (the bite's tell), `bite`, `under` (in the crack: not drawn, harmless),
 * `hurt`, `dead`. `strikeCd` = after a bite, no other for a while.
 *
 * Pure: + - * / sqrt, floor, round, min, max.
 */

import type { EnemySpawn, Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, heldUnseen, type KindRules, type StepInfo, setMode } from './common';

type C = Tuning['carrier'];

/** A trail: points (feet) and the length up to each. */
interface Trail {
  xs: number[];
  ys: number[];
  at: number[];
  len: number;
}

const TRAILS = new WeakMap<Scene, Map<string, Trail>>();

/** The trail spawn `id` walks (its own `trail`, or the one of the carrier it `follow`s), cached per scene. */
export function trailOf(scene: Scene, id: string): Trail | null {
  let m = TRAILS.get(scene);
  if (!m) {
    m = new Map();
    TRAILS.set(scene, m);
  }
  const hit = m.get(id);
  if (hit) return hit;
  const list = scene.enemies ?? [];
  let s: EnemySpawn | undefined = list.find((q) => q.id === id);
  // (One hop of `follow`: the trail's owner.)
  if (s?.follow) s = list.find((q) => q.id === s?.follow);
  if (!s?.trail) return null;
  const pts: Array<readonly [number, number]> = [[s.x, s.y], ...s.trail];
  const tr: Trail = { xs: [], ys: [], at: [], len: 0 };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as readonly [number, number];
    if (i > 0) {
      const dx = p[0] - (tr.xs[i - 1] ?? 0);
      const dy = p[1] - (tr.ys[i - 1] ?? 0);
      tr.len += Math.sqrt(dx * dx + dy * dy);
    }
    tr.xs.push(p[0]);
    tr.ys.push(p[1]);
    tr.at.push(tr.len);
  }
  m.set(id, tr);
  return tr;
}

/** The point `d` px along the trail (feet), and the way it heads there (-1 / 1, 0 = straight down / up). */
function along(tr: Trail, d: number, out: { x: number; y: number; dir: number }): void {
  const n = tr.xs.length;
  if (n === 1 || d <= 0) {
    out.x = tr.xs[0] ?? 0;
    out.y = tr.ys[0] ?? 0;
    out.dir = n > 1 ? Math.sign((tr.xs[1] ?? 0) - out.x) : 1;
    return;
  }
  let i = 1;
  while (i < n - 1 && (tr.at[i] ?? 0) < d) i++;
  const a = tr.at[i - 1] ?? 0;
  const b = tr.at[i] ?? 0;
  const k = b > a ? Math.min(1, (d - a) / (b - a)) : 1;
  const x0 = tr.xs[i - 1] ?? 0;
  const y0 = tr.ys[i - 1] ?? 0;
  const x1 = tr.xs[i] ?? 0;
  const y1 = tr.ys[i] ?? 0;
  out.x = x0 + (x1 - x0) * k;
  out.y = y0 + (y1 - y0) * k;
  out.dir = Math.sign(x1 - x0);
}

const P = { x: 0, y: 0, dir: 0 };

/** Puts it where `segT` says (its feet on the trail). */
function put(e: EnemyState, tr: Trail): void {
  along(tr, e.segT, P);
  e.x = Math.round(P.x - e.w / 2);
  e.y = Math.round(P.y - e.h);
  if (P.dir !== 0) e.facing = P.dir < 0 ? -1 : 1;
}

/** The loop's length in px of walk: the trail, then the time in the crack. */
const loopPx = (tr: Trail, c: C): number => tr.len + Math.max(0, c.underFrames) * c.speed;

/** She stands on its trail just ahead of it (her feet at its feet's height, in front within `noticePx`). */
function onTrailAhead(e: EnemyState, info: StepInfo, c: C): boolean {
  const p = info.state.player;
  if (!p.grounded || p.hp <= 0 || p.faded > 0) return false;
  if (Math.abs(p.y + p.h - (e.y + e.h)) > c.trailYPx) return false;
  const pc = p.x + p.w / 2;
  const ec = e.x + e.w / 2;
  const ahead = (pc - ec) * e.facing;
  return ahead > 0 && ahead - p.w / 2 - e.w / 2 <= c.noticePx;
}

export const carrier: KindRules = {
  width: (t) => t.carrier.width,
  height: (t) => t.carrier.height,
  hp: (t) => t.carrier.hp,
  hurtFrames: (t) => t.carrier.hurtFrames,
  hurtSafeFrames: (t) => t.carrier.hurtSafeFrames,
  contactDamage: (t) => t.carrier.contactDamage,
  deadFrames: (t) => t.carrier.deadFrames,
  value: () => 0,

  place(e, spawn) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h);
    e.mode = 'walk';
    e.segT = 0;
    // (`phase` spaces a line out: set on its rails in `init`, once the trail is known.)
    e.period = Math.max(0, Math.min(1, spawn.phase ?? 0));
  },

  init(e, _spawn, scene, t) {
    const tr = trailOf(scene, e.id);
    if (!tr) return;
    const c = t.carrier;
    e.span = tr.len;
    const d = e.period * loopPx(tr, c);
    if (d < tr.len) {
      e.segT = d;
      put(e, tr);
    } else {
      // (Inside the crack for the rest of its loop.)
      e.segT = tr.len;
      put(e, tr);
      setMode(e, 'under', Math.max(1, Math.round((d - tr.len) / Math.max(0.1, c.speed))));
    }
  },

  update(e, _index, info) {
    const c = info.t.carrier;
    const tr = trailOf(info.scene, e.id);
    if (!tr || e.mode === 'dead') return false;
    if (e.strikeCd > 0) e.strikeCd--;
    e.vx = 0;
    e.vy = 0;
    if (e.mode === 'hurt') {
      if (--e.timer <= 0) setMode(e, 'walk', 0);
      return true;
    }
    if (e.mode === 'under') {
      if (--e.timer <= 0) {
        // Its lamp is out: it stays in (they stop coming).
        if (e.dispersed) {
          e.gone = true;
          return false;
        }
        e.segT = 0;
        put(e, tr);
        setMode(e, 'walk', 0);
        info.events.push({ type: 'enemyEmerge', id: e.id, kind: e.kind, x: e.x + e.w / 2, y: e.y + e.h });
      }
      return false;
    }
    if (e.mode === 'alert') {
      if (--e.timer <= 0) setMode(e, 'bite', frames(c.biteFrames, 1));
      return true;
    }
    if (e.mode === 'bite') {
      // A snap forward along the trail and back.
      const n = frames(c.biteFrames, 1);
      const k = n - e.timer;
      const out = k < n / 2 ? c.biteLunge : -c.biteLunge;
      e.segT = Math.max(0, Math.min(tr.len, e.segT + out));
      put(e, tr);
      if (--e.timer <= 0) {
        e.strikeCd = frames(c.biteCooldownFrames);
        setMode(e, 'walk', 0);
      }
      return true;
    }
    // On its way, carrying: unless she stands on the trail ahead (it turns to bite her: a tell first).
    if (e.strikeCd === 0 && !heldUnseen(e, info.state.player) && onTrailAhead(e, info, c)) {
      const n = frames(c.noticeFrames, 1);
      setMode(e, 'alert', n);
      info.events.push({
        type: 'enemyNotice',
        id: e.id,
        kind: e.kind,
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        dir: e.facing,
        frames: n,
      });
      return true;
    }
    e.segT += c.speed;
    if (e.segT >= tr.len) {
      e.segT = tr.len;
      put(e, tr);
      setMode(e, 'under', frames(c.underFrames, 1));
      info.events.push({ type: 'enemyUnder', id: e.id, kind: e.kind, x: e.x + e.w / 2, y: e.y + e.h });
      return false;
    }
    const x0 = e.x;
    put(e, tr);
    e.vx = e.x - x0;
    return true;
  },

  shove(e) {
    e.knockVx = 0;
    e.knockVy = 0;
    return 0;
  },

  /** In the crack it is no one's. */
  // (First-timer r6: "three ant hits in a row on a ledge": only a bite hurts; walking, they pass under her.)
  harmless: (e) => e.mode !== 'bite',

  /** It sees her only while it is about to bite. */
  sees: (e) => e.mode === 'alert' || e.mode === 'bite',

  /** Its lamp went out: it finishes the trip, goes in, and stays in. */
  disperse(e, _info, quiet) {
    if (quiet) e.gone = true;
    return 'leave';
  },

  /** It bit her: it goes on its way (no second bite for a while). */
  touched(e, info) {
    const c = info.t.carrier;
    e.strikeCd = frames(c.biteCooldownFrames);
    if (e.mode === 'alert' || e.mode === 'bite') setMode(e, 'walk', 0);
    // (One bite, then the line lets her be: every carrier near goes on its way for `lineCalmFrames`, never a
    // chain of bites from the ants behind it.)
    for (const o of info.state.enemies) {
      if (o.kind !== 'carrier' || o.mode === 'dead' || o.gone) continue;
      if (Math.abs(o.x - e.x) > c.lineCalmPx) continue;
      o.strikeCd = Math.max(o.strikeCd, frames(c.lineCalmFrames));
      if (o.mode === 'alert' || o.mode === 'bite') setMode(o, 'walk', 0);
    }
  },
};
