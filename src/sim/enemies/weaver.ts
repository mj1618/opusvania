/**
 * The weaver (docs/design/creatures.md §2, wood.md R12, memory/creatures.md): an orb-weaver that lives
 * on its web (`EnemySpawn.web`). It senses touches, not cuts (vibration): the moment the web holds
 * her it runs along the strands to where she touched (`run`), counts (`windup`: its tell, a fixed
 * `countFrames`) and bites (`bite`: its touch is live) only if she is still held. Free in time, she
 * is never bitten; the count alone outlasts the fastest beat-free, so a touch right beside it is fair.
 * Then it goes home along the strands (`back`) and sits (`sit`). Its lamp snuffed (`guards`), it climbs
 * away (`leave`). Cut, it stops, staggers and goes home; dead, it drops off the web.
 *
 * It moves only on strands: `seg` / `segT` say where, and each step it walks the shortest path through
 * the web's graph (end points shared by strands) to its goal (`goalSeg`, `goalT`). A cut strand is not
 * a road; if its own is cut it steps onto the nearest strand still standing.
 * Pure: + - * / sqrt, min, max.
 */
import type { EnemySpawn, Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, type KindRules, type StepInfo, setMode } from './common';
import { intact, nearestT, pointOn, type Strand, strandsOf, type WebGraph, webGraph } from './web';

type W = Tuning['weaver'];

const P = { x: 0, y: 0 };

/** The index of its web in `state.enemies` (-1 = none). */
function webIndex(scene: Scene, index: number): number {
  const id = scene.enemies?.[index]?.web;
  if (!id) return -1;
  return (scene.enemies ?? []).findIndex((s) => s.id === id && s.kind === 'web');
}

/** Puts its box's centre on its place on the web. */
function sit(e: EnemyState, list: readonly Strand[]): void {
  const s = list[e.seg];
  if (!s) return;
  pointOn(s, e.segT, P);
  e.x = Math.round(P.x - e.w / 2);
  e.y = Math.round(P.y - e.h / 2);
}

/** The nearest point on a standing strand to (x, y): sets `seg`, `segT`. False if none stands. */
function snap(e: EnemyState, web: EnemyState, list: readonly Strand[], x: number, y: number): boolean {
  let best = -1;
  let bestD = Infinity;
  let bestT = 0;
  for (let i = 0; i < list.length; i++) {
    if (web.cut !== '' && !intact(web, i)) continue;
    const s = list[i] as Strand;
    const u = nearestT(s, x, y);
    pointOn(s, u, P);
    const d = (P.x - x) * (P.x - x) + (P.y - y) * (P.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
      bestT = u;
    }
  }
  if (best < 0) return false;
  e.seg = best;
  e.segT = bestT;
  return true;
}

// Scratch: distance of every node to the goal (Dijkstra over the standing strands).
let DIST: number[] = [];
const DONE: boolean[] = [];

function distances(g: WebGraph, web: EnemyState, goal: number, goalT: number): void {
  const n = g.nx.length;
  if (DIST.length < n) DIST = new Array(n);
  for (let i = 0; i < n; i++) {
    DIST[i] = Infinity;
    DONE[i] = false;
  }
  const len = g.len[goal] as number;
  DIST[g.a[goal] as number] = goalT * len;
  DIST[g.b[goal] as number] = Math.min(DIST[g.b[goal] as number] as number, (1 - goalT) * len);
  for (;;) {
    let at = -1;
    let d = Infinity;
    for (let i = 0; i < n; i++) {
      if (!DONE[i] && (DIST[i] as number) < d) {
        d = DIST[i] as number;
        at = i;
      }
    }
    if (at < 0) break;
    DONE[at] = true;
    for (const s of g.adj[at] as number[]) {
      if (!intact(web, s)) continue;
      const o = g.a[s] === at ? (g.b[s] as number) : (g.a[s] as number);
      const nd = d + (g.len[s] as number);
      if (nd < (DIST[o] as number)) DIST[o] = nd;
    }
  }
}

/** Path length from where it is to its goal (Infinity = no road). Needs `distances` for that goal. */
function pathLeft(e: EnemyState, g: WebGraph): number {
  if (e.seg === e.goalSeg) return Math.abs(e.goalT - e.segT) * (g.len[e.seg] as number);
  const len = g.len[e.seg] as number;
  return Math.min(
    e.segT * len + (DIST[g.a[e.seg] as number] as number),
    (1 - e.segT) * len + (DIST[g.b[e.seg] as number] as number),
  );
}

/**
 * Walks up to `speed` px along the web toward its goal. Returns true when it is there (or has no road:
 * then it stays where it is and `seg` is unchanged).
 */
function walk(e: EnemyState, g: WebGraph, web: EnemyState, speed: number): boolean {
  if (e.goalSeg < 0) return true;
  distances(g, web, e.goalSeg, e.goalT);
  let left = speed;
  for (let k = 0; k < 16 && left > 0; k++) {
    const len = g.len[e.seg] as number;
    if (e.seg === e.goalSeg) {
      const d = (e.goalT - e.segT) * len;
      if (Math.abs(d) <= left) {
        e.segT = e.goalT;
        return true;
      }
      e.segT += (Math.sign(d) * left) / len;
      return false;
    }
    const a = g.a[e.seg] as number;
    const b = g.b[e.seg] as number;
    const costA = e.segT * len + (DIST[a] as number);
    const costB = (1 - e.segT) * len + (DIST[b] as number);
    if (costA === Infinity && costB === Infinity) return true;
    // (A tie means it stands on a node of a shortest path: it goes on, to the far end, never back.)
    const toA = costA < costB - 1e-6 || (Math.abs(costA - costB) <= 1e-6 && e.segT >= 0.5);
    const d = (toA ? e.segT : 1 - e.segT) * len;
    if (d > left) {
      e.segT += ((toA ? -1 : 1) * left) / len;
      return false;
    }
    left -= d;
    const at = toA ? a : b;
    // At a node: onto the strand that leads on the shortest way (the goal's own, if it ends here).
    let next = -1;
    let cost = Infinity;
    for (const s of g.adj[at] as number[]) {
      if (!intact(web, s)) continue;
      const fromA = g.a[s] === at;
      const c =
        s === e.goalSeg
          ? (fromA ? e.goalT : 1 - e.goalT) * (g.len[s] as number)
          : (g.len[s] as number) + (DIST[fromA ? (g.b[s] as number) : (g.a[s] as number)] as number);
      if (c < cost) {
        cost = c;
        next = s;
      }
    }
    if (next < 0) {
      e.segT = toA ? 0 : 1;
      return true;
    }
    e.seg = next;
    e.segT = g.a[next] === at ? 0 : 1;
  }
  return false;
}

/** Home: the point on the web nearest where it started. */
function goHome(e: EnemyState, web: EnemyState, list: readonly Strand[]): void {
  const keepSeg = e.seg;
  const keepT = e.segT;
  if (snap(e, web, list, e.homeX, e.homeY)) {
    e.goalSeg = e.seg;
    e.goalT = e.segT;
  } else e.goalSeg = -1;
  e.seg = keepSeg;
  e.segT = keepT;
}

function run(e: EnemyState, info: StepInfo, web: EnemyState, g: WebGraph): void {
  const W = info.t.weaver;
  e.goalSeg = web.seg;
  e.goalT = web.segT;
  setMode(e, 'run', 0);
  distances(g, web, e.goalSeg, e.goalT);
  const px = pathLeft(e, g);
  info.events.push({
    type: 'enemyRun',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    tx: web.targetX,
    ty: web.targetY,
    px: Number.isFinite(px) ? Math.round(px) : -1,
    frames: Number.isFinite(px) ? Math.ceil(px / Math.max(0.1, W.speed)) : -1,
  });
}

function back(e: EnemyState, web: EnemyState, list: readonly Strand[], W: W, wait = true): void {
  goHome(e, web, list);
  setMode(e, 'back', wait ? frames(W.backDelayFrames) : 0);
}

export const weaver: KindRules = {
  width: (t) => t.weaver.width,
  height: (t) => t.weaver.height,
  hp: (t) => t.weaver.hp,
  hurtFrames: (t) => t.weaver.hurtFrames,
  hurtSafeFrames: (t) => t.weaver.hurtSafeFrames,
  contactDamage: (t) => t.weaver.contactDamage,
  deadFrames: (t) => t.weaver.deadFrames,
  value: (t, finisher) => (finisher ? t.weaver.valueFinisher : t.weaver.value),

  /** `x`, `y` = where it sits on its web (it is put on the nearest strand: `init`). */
  place(e, spawn) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h / 2);
    e.mode = 'sit';
  },

  init(e: EnemyState, spawn: EnemySpawn, scene: Scene) {
    const ws = (scene.enemies ?? []).find((s) => s.id === spawn.web && s.kind === 'web');
    const list = (ws?.strands ?? []) as readonly Strand[];
    const fake = { cut: '' } as EnemyState;
    if (snap(e, fake, list, spawn.x, spawn.y)) sit(e, list);
  },

  update(e, index, info) {
    const { state, scene } = info;
    const W = info.t.weaver;
    const p = state.player;
    if (e.mode === 'dead') {
      // Off the web: it drops.
      e.knockVy = Math.min(W.maxFall, e.knockVy + W.gravity);
      e.vx = 0;
      e.vy = e.knockVy;
      e.ry += e.vy;
      const n = Math.round(e.ry);
      e.ry -= n;
      e.y += n;
      if (--e.timer <= 0) e.gone = true;
      return false;
    }
    if (e.mode === 'leave') {
      // Its lamp went out: it climbs away up its silk.
      e.vx = 0;
      e.vy = -W.leaveSpeed;
      e.y -= Math.round(W.leaveSpeed);
      if (--e.timer <= 0 || e.y + e.h < 0) e.gone = true;
      return false;
    }
    const wi = webIndex(scene, index);
    const webE = state.enemies[wi];
    const list = strandsOf(scene, wi);
    if (!webE || list.length === 0 || e.seg < 0) {
      e.vx = 0;
      e.vy = 0;
      return false;
    }
    const g = webGraph(list, scene, info.t, scene.enemies?.[wi]?.anchors);
    // Its own strand cut from under it: it steps onto the nearest one still standing (or lets go).
    if (!intact(webE, e.seg)) {
      if (!snap(e, webE, list, e.x + e.w / 2, e.y + e.h / 2)) {
        setMode(e, 'leave', frames(W.leaveFrames, 1));
        return false;
      }
    }
    const x0 = e.x;
    const y0 = e.y;
    const held = p.grab === wi;
    let live = false;
    if (e.mode === 'hurt') {
      if (--e.timer <= 0) back(e, webE, list, W, false);
    } else if (e.mode === 'sit') {
      if (held) run(e, info, webE, g);
    } else if (e.mode === 'run') {
      if (!held) back(e, webE, list, W);
      else {
        // (Caught somewhere else meanwhile: there instead.)
        if (webE.seg !== e.goalSeg || webE.segT !== e.goalT) {
          e.goalSeg = webE.seg;
          e.goalT = webE.segT;
        }
        if (walk(e, g, webE, W.speed)) {
          const n = frames(W.countFrames, 1);
          setMode(e, 'windup', n);
          e.facing = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
          info.events.push({
            type: 'enemyWindup',
            id: e.id,
            kind: e.kind,
            x: e.x + e.w / 2,
            y: e.y + e.h / 2,
            dir: e.facing,
            frames: n,
            px: 0,
            speed: 0,
          });
        }
      }
    } else if (e.mode === 'windup') {
      // The count: it flashes, quickening. Free before it ends, she is never bitten.
      if (!held) back(e, webE, list, W);
      else if (--e.timer <= 0) {
        const n = frames(W.biteFrames, 1);
        setMode(e, 'bite', n);
        info.events.push({
          type: 'enemyBite',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          hit: true,
          frames: n,
        });
      }
    } else if (e.mode === 'bite') {
      live = true;
      if (--e.timer <= 0) back(e, webE, list, W);
    } else if (e.mode === 'back') {
      if (held) run(e, info, webE, g);
      else if (e.timer > 0) e.timer--;
      else if (walk(e, g, webE, W.homeSpeed)) setMode(e, 'sit', 0);
    }
    sit(e, list);
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    if (e.vx !== 0) e.facing = e.vx < 0 ? -1 : 1;
    return live;
  },

  /** It is aware of her while the web holds her and it comes for her. */
  sees(e) {
    return e.mode === 'run' || e.mode === 'windup' || e.mode === 'bite';
  },

  /** Its bite landed (she is thrown out of the web): home. */
  touched(e, info) {
    const wi = webIndex(info.scene, info.state.enemies.indexOf(e));
    const webE = info.state.enemies[wi];
    if (webE) back(e, webE, strandsOf(info.scene, wi), info.t.weaver);
  },

  /** Its lamp went out: it climbs away (gone at once if the lamp was out when she came in). */
  disperse(e, info, quiet) {
    setMode(e, 'leave', frames(info.t.weaver.leaveFrames, 1));
    if (quiet) e.gone = true;
    return 'leave';
  },

  /** It clings to its silk: a blow does not move it. */
  shove(e) {
    e.knockVx = 0;
    e.knockVy = 0;
    return 0;
  },

  /** Only its bite hurts. */
  harmless: (e) => e.mode !== 'bite',
};
