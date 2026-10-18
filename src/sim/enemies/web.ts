/**
 * The orb web (docs/design/creatures.md §2, wood.md R12, memory/creatures.md): a hazard-creature made
 * of strands (segments, `EnemySpawn.strands`). It is a creature in `scene.enemies` so that it has one
 * flat state record, guards a lamp, and is drawn and debugged like the others.
 *
 *  - **Touch.** Her box within `web.strandHalf` of an intact strand: the web holds her where she is
 *    (Caught: src/sim/grab.ts). The hold does no harm; the weaver that lives on it is what bites.
 *  - **Cut.** A slash cuts every intact strand its area meets (no hitstop, no pogo: silk gives). A
 *    strand no longer joined to an anchor falls too. The weaver senses touches, not cuts.
 *  - **Slack.** Its lamp snuffed (`guards`), the web goes dark and holds nothing.
 *
 * Its own state: `cut` (one character per strand: '0' intact, '1' cut, '2' fell), `seg` / `targetX`,
 * `targetY` (the last touch). Its box is its strands' bounds; its touch never hurts; blows do not hurt it.
 * Pure: + - * / sqrt, min, max.
 */

import { freeGrab, grabbable, grabPlayer } from '../grab';
import type { Box } from '../player/attack';
import type { EnemySpawn, Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import type { KindRules, StepInfo } from './common';

export type Strand = [number, number, number, number];

/** A web's strands as a graph: end points merged (to the pixel), which are anchors, and what joins what. */
export interface WebGraph {
  /** Node positions and whether each is an anchor (within `web.anchorPx` of a solid or the room's edge). */
  nx: number[];
  ny: number[];
  anchored: boolean[];
  /** Per strand: its two end nodes and its length. */
  a: number[];
  b: number[];
  len: number[];
  /** Per node: the strands that end there. */
  adj: number[][];
}

const GRAPHS = new WeakMap<object, WebGraph>();

/**
 * The graph of a web's strands (built once per spawn: the scene is static). `anchors`: points that hold
 * strands besides solids and the room's edges (`EnemySpawn.anchors`: a great lamp's heart).
 */
export function webGraph(
  strands: readonly Strand[],
  scene: Scene,
  t: Tuning,
  anchors: ReadonlyArray<readonly [number, number]> = [],
): WebGraph {
  const hit = GRAPHS.get(strands);
  if (hit) return hit;
  const g: WebGraph = { nx: [], ny: [], anchored: [], a: [], b: [], len: [], adj: [] };
  const index = new Map<string, number>();
  const node = (x: number, y: number): number => {
    const k = `${Math.round(x)},${Math.round(y)}`;
    let n = index.get(k);
    if (n === undefined) {
      n = g.nx.length;
      index.set(k, n);
      g.nx.push(Math.round(x));
      g.ny.push(Math.round(y));
      const px = t.web.anchorPx;
      g.anchored.push(
        anchorAt(scene, x, y, px) ||
          anchors.some((a) => (a[0] - x) * (a[0] - x) + (a[1] - y) * (a[1] - y) <= px * px),
      );
      g.adj.push([]);
    }
    return n;
  };
  for (let i = 0; i < strands.length; i++) {
    const s = strands[i] as Strand;
    const a = node(s[0], s[1]);
    const b = node(s[2], s[3]);
    g.a.push(a);
    g.b.push(b);
    const dx = s[2] - s[0];
    const dy = s[3] - s[1];
    g.len.push(Math.max(1, Math.sqrt(dx * dx + dy * dy)));
    (g.adj[a] as number[]).push(i);
    (g.adj[b] as number[]).push(i);
  }
  GRAPHS.set(strands, g);
  return g;
}

/** Is (x, y) within `px` of a solid or of the room's edges (where a strand is tied)? */
function anchorAt(scene: Scene, x: number, y: number, px: number): boolean {
  if (x <= px || x >= scene.width - px || y <= px || y >= scene.height - px) return true;
  for (const s of scene.solids) {
    const dx = x < s.x ? s.x - x : x > s.x + s.w ? x - (s.x + s.w) : 0;
    const dy = y < s.y ? s.y - y : y > s.y + s.h ? y - (s.y + s.h) : 0;
    if (dx * dx + dy * dy <= px * px) return true;
  }
  return false;
}

/** The strands of web enemy `index` (from its spawn). */
export function strandsOf(scene: Scene, index: number): readonly Strand[] {
  return (scene.enemies?.[index]?.strands ?? []) as readonly Strand[];
}

/** Does the segment pass through the box (inclusive)? Liang-Barsky. */
export function segmentInBox(s: Strand, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = s[2] - s[0];
  const dy = s[3] - s[1];
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [s[0] - x0, x1 - s[0], s[1] - y0, y1 - s[1]];
  for (let k = 0; k < 4; k++) {
    const pk = p[k] as number;
    const qk = q[k] as number;
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

/** The share along strand `s` (0..1 from its first end) of the point nearest (x, y). */
export function nearestT(s: Strand, x: number, y: number): number {
  const dx = s[2] - s[0];
  const dy = s[3] - s[1];
  const l2 = dx * dx + dy * dy;
  if (l2 <= 0) return 0;
  return Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l2));
}

/** The point at share `u` along strand `s`. */
export function pointOn(s: Strand, u: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = s[0] + (s[2] - s[0]) * u;
  out.y = s[1] + (s[3] - s[1]) * u;
  return out;
}

/** Strands still standing ('0'). */
export function intact(e: EnemyState, i: number): boolean {
  return e.cut.charCodeAt(i) === 48;
}

const P = { x: 0, y: 0 };

/** Marks every strand no longer joined to an anchor as fallen ('2'); returns how many fell. */
function dropLoose(e: EnemyState, g: WebGraph): number {
  const n = g.nx.length;
  const reach: boolean[] = new Array(n).fill(false);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (g.anchored[i]) {
      reach[i] = true;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const at = queue[q] as number;
    for (const s of g.adj[at] as number[]) {
      if (!intact(e, s)) continue;
      const o = g.a[s] === at ? (g.b[s] as number) : (g.a[s] as number);
      if (!reach[o]) {
        reach[o] = true;
        queue.push(o);
      }
    }
  }
  let fell = 0;
  const chars = e.cut.split('');
  for (let s = 0; s < chars.length; s++) {
    if (chars[s] !== '0') continue;
    if (!reach[g.a[s] as number] && !reach[g.b[s] as number]) {
      chars[s] = '2';
      fell++;
    }
  }
  if (fell > 0) e.cut = chars.join('');
  return fell;
}

export const web: KindRules = {
  width: () => 2,
  height: () => 2,
  hp: () => 99,
  hurtFrames: () => 1,
  hurtSafeFrames: () => 1,
  contactDamage: () => 0,
  deadFrames: () => 1,
  value: () => 0,

  /** `x`, `y` = its hub; the box is set from the strands (`init`). */
  place(e, spawn) {
    e.x = Math.round(spawn.x);
    e.y = Math.round(spawn.y);
    e.mode = 'hang';
    e.cut = '0'.repeat((spawn.strands ?? []).length);
  },

  init(e: EnemyState, spawn: EnemySpawn) {
    const list = spawn.strands ?? [];
    if (list.length === 0) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of list) {
      x0 = Math.min(x0, s[0], s[2]);
      x1 = Math.max(x1, s[0], s[2]);
      y0 = Math.min(y0, s[1], s[3]);
      y1 = Math.max(y1, s[1], s[3]);
    }
    e.x = Math.floor(x0);
    e.y = Math.floor(y0);
    e.w = Math.max(2, Math.ceil(x1 - x0));
    e.h = Math.max(2, Math.ceil(y1 - y0));
    e.targetX = spawn.x;
    e.targetY = spawn.y;
  },

  update(e, index, info) {
    const { state, scene, events } = info;
    const p = state.player;
    // Slack (its lamp went out): it holds nothing, and lets go of one it held.
    if (e.dispersed) {
      if (p.grab === index) freeGrab(state, info.t, 'gone', events);
      return false;
    }
    if (!grabbable(p)) return false;
    // (A web that never holds her: Lanternroot's orb.)
    if (scene.enemies?.[index]?.grab === false) return false;
    const list = strandsOf(scene, index);
    const h = info.t.web.strandHalf;
    const bx0 = p.x - h;
    const by0 = p.y - h;
    const bx1 = p.x + p.w + h;
    const by1 = p.y + p.h + h;
    if (bx1 < e.x || bx0 > e.x + e.w || by1 < e.y || by0 > e.y + e.h) return false;
    const cx = p.x + p.rx + p.w / 2;
    const cy = p.y + p.ry + p.h / 2;
    let best = -1;
    let bestD = Infinity;
    let bestT = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i] as Strand;
      if (!intact(e, i) || !segmentInBox(s, bx0, by0, bx1, by1)) continue;
      const u = nearestT(s, cx, cy);
      pointOn(s, u, P);
      const d = (P.x - cx) * (P.x - cx) + (P.y - cy) * (P.y - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
        bestT = u;
      }
    }
    if (best < 0) return false;
    pointOn(list[best] as Strand, bestT, P);
    e.seg = best;
    e.segT = bestT;
    e.targetX = P.x;
    e.targetY = P.y;
    events.push({ type: 'webTouch', id: e.id, x: P.x, y: P.y, strand: best });
    grabPlayer(state, index, events);
    return false;
  },

  /** The blade cuts every intact strand its area meets; loose ones fall. Nothing counts as a hit for her. */
  slashed(e, index, info: StepInfo, box: Box) {
    const list = strandsOf(info.scene, index);
    const h = info.t.web.strandHalf;
    let cut = 0;
    let sx = 0;
    let sy = 0;
    const chars = e.cut.split('');
    for (let i = 0; i < list.length; i++) {
      if (chars[i] !== '0') continue;
      const s = list[i] as Strand;
      if (!segmentInBox(s, box.x - h, box.y - h, box.x + box.w + h, box.y + box.h + h)) continue;
      chars[i] = '1';
      cut++;
      const u = nearestT(s, box.x + box.w / 2, box.y + box.h / 2);
      pointOn(s, u, P);
      sx += P.x;
      sy += P.y;
    }
    if (cut === 0) return 0;
    e.cut = chars.join('');
    const fell = dropLoose(e, webGraph(list, info.scene, info.t, info.scene.enemies?.[index]?.anchors));
    let left = 0;
    for (let i = 0; i < e.cut.length; i++) if (e.cut.charCodeAt(i) === 48) left++;
    info.events.push({ type: 'webCut', id: e.id, x: sx / cut, y: sy / cut, cut, fell, left });
    return 0;
  },

  /** Snuffed, it goes slack (dark, holding nothing). */
  disperse() {
    return 'slack';
  },

  /** Nothing about a web is a blow's business but its strands (`slashed`). */
  shove() {
    return 0;
  },

  /** A web is aware of her while it holds her. */
  sees(e, info) {
    return info.state.player.grab >= 0 && info.state.enemies[info.state.player.grab] === e;
  },

  harmless: () => true,
};
