/**
 * The map in a persona's head: the solids it has seen (or all of them, for a persona that knows the
 * room), turned into walkable surfaces and a graph of moves between them (walk on, jump across, jump
 * up, drop down), with a shortest-path planner. Pure: Node and the page.
 *
 * Reach is approximate (memory/movement-controller.md "Reach"), with a safety margin: a planned jump
 * that fails is remembered as bad and the planner routes round it.
 */
import type { Scene } from '../../src/sim/scene';

/** One flat-ish piece of a surface: a top from x0 to x1 at y. */
export interface Piece {
  x0: number;
  x1: number;
  y: number;
}

/** A walkable run of tops (rolling steps of up to `ROLL` px merged), or a one-way. */
export interface Surface {
  id: number;
  x0: number;
  x1: number;
  pieces: Piece[];
  oneWay: boolean;
}

export type MoveKind = 'walk' | 'jump' | 'up' | 'drop' | 'through';

export interface Move {
  from: number;
  to: number;
  kind: MoveKind;
  /** The way she faces / holds through the move (-1 / 1; 0 for a drop-through). */
  dir: number;
  /** Where on `from` the move starts (feet x): an end for walk / jump / drop, a spot for up. */
  launchX: number;
  cost: number;
  /** Geometry key (`moveKey`): the launch and the target surface's west end and height. */
  key: string;
  /** Horizontal px to cross (0 for up / drop / through) and the height change (px, + = down). */
  gap: number;
  rise: number;
}

/** Rolling steps up to this many px are walked over (the sim's rolling ground is 12). */
export const ROLL = 16;
/** Her body (src/sim tuning: the box is 48 x 96; close enough for clearance checks). */
const BODY_H = 96;

export function yAt(s: Surface, x: number): number {
  let best = s.pieces[0];
  let bd = Number.POSITIVE_INFINITY;
  for (const q of s.pieces) {
    const d = x < q.x0 ? q.x0 - x : x > q.x1 ? x - q.x1 : 0;
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best?.y ?? 0;
}

/** Surfaces from solids and one-ways: the tops nothing sits on, rolling runs merged. */
export function buildSurfaces(
  scene: Scene,
  solids: readonly number[],
  oneWays: readonly number[],
  /** Only these solids' tops are walkable (their top edge was seen); default: all of `solids`. */
  tops: ReadonlySet<number> | null = null,
): Surface[] {
  const rects = solids.map((i) => scene.solids[i]).filter((r) => r !== undefined);
  const topRects = solids
    .filter((i) => !tops || tops.has(i))
    .map((i) => scene.solids[i])
    .filter((r) => r !== undefined);
  const pieces: Piece[] = [];
  for (const s of topRects) {
    // The top, minus where another solid sits on it (no room for her body there).
    let spans: Array<[number, number]> = [[s.x, s.x + s.w]];
    for (const o of rects) {
      if (o === s) continue;
      if (!(o.y < s.y && o.y + o.h > s.y - BODY_H)) continue;
      spans = spans.flatMap(([a, b]): Array<[number, number]> => {
        const c0 = o.x;
        const c1 = o.x + o.w;
        if (c1 <= a || c0 >= b) return [[a, b]];
        const out: Array<[number, number]> = [];
        if (c0 > a) out.push([a, c0]);
        if (c1 < b) out.push([c1, b]);
        return out;
      });
    }
    for (const [a, b] of spans) if (b - a >= 24) pieces.push({ x0: a, x1: b, y: s.y });
  }
  pieces.sort((a, b) => a.x0 - b.x0 || a.y - b.y);
  // Merge abutting pieces whose tops differ by a rolling step.
  const chains: Piece[][] = [];
  for (const q of pieces) {
    const c = chains.find((ch) => {
      const last = ch[ch.length - 1];
      return !!last && q.x0 <= last.x1 + 1 && q.x0 >= last.x1 - 1 && Math.abs(q.y - last.y) <= ROLL;
    });
    if (c) c.push(q);
    else chains.push([q]);
  }
  const out: Surface[] = chains.map((ch, id) => ({
    id,
    x0: ch[0]?.x0 ?? 0,
    x1: ch[ch.length - 1]?.x1 ?? 0,
    pieces: ch,
    oneWay: false,
  }));
  for (const i of oneWays) {
    const o = scene.oneWays[i];
    if (o)
      out.push({
        id: out.length,
        x0: o.x,
        x1: o.x + o.w,
        pieces: [{ x0: o.x, x1: o.x + o.w, y: o.y }],
        oneWay: true,
      });
  }
  return out;
}

/** The highest top of `s` under a body `half` px either side of x (her box rests on the highest). */
export function topUnder(s: Surface, x: number, half = 24): number {
  let y = Number.POSITIVE_INFINITY;
  for (const q of s.pieces) if (q.x0 < x + half && q.x1 > x - half) y = Math.min(y, q.y);
  return Number.isFinite(y) ? y : yAt(s, x);
}

/** The surface under her feet (null in the air or on nothing known). */
export function surfaceAt(surfaces: readonly Surface[], x: number, y: number, slack = 6): Surface | null {
  let best: Surface | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const s of surfaces) {
    if (x < s.x0 - 24 || x > s.x1 + 24) continue;
    const d = Math.abs(topUnder(s, x) - y);
    if (d <= slack && d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

export interface Reach {
  /** How high a jump lands (px above take-off). */
  up: number;
  /** Horizontal px a running jump covers, landing `dy` px below take-off (dy < 0: above). */
  across(dy: number): number;
}

/** Reach for what she owns, with a margin (memory/movement-controller.md "Reach"). */
export function reachFor(abilities: readonly string[], margin = 0.82): Reach {
  const dj = abilities.includes('doubleJump');
  const glide = abilities.includes('glide');
  const H = dj ? 464 : 272;
  const half = dj ? 384 : 235;
  return {
    up: H * margin,
    across(dy) {
      if (dy < -H * margin) return -1;
      const base = half * (1 + Math.sqrt(Math.max(0, 1 + dy / H)));
      // The glide table (memory/movement-controller.md): jump + double + glide is 1594 px on the flat and
      // ~2.2 px more per px of drop; a held jump off a ledge without the double, 330 + 2.25 per px of drop.
      let sail = 0;
      if (glide && dj && dy >= 0) sail = 1594 + 2.2 * dy - base;
      else if (glide && dy > 64) sail = Math.max(0, 330 + 2.25 * dy - base);
      return (base + sail) * margin;
    },
  };
}

/** Every move between known surfaces. */
export function buildMoves(surfaces: readonly Surface[], reach: Reach): Move[] {
  const moves: Move[] = [];
  const byId = new Map(surfaces.map((s) => [s.id, s]));
  const push = (m: Omit<Move, 'key' | 'gap' | 'rise'> & { gap?: number; rise?: number }): void => {
    const b = byId.get(m.to);
    const key = `${m.kind}:${m.dir}:${Math.round(m.launchX)}>${b?.x0 ?? 0},${b?.pieces[0]?.y ?? 0}`;
    moves.push({ ...m, key, gap: m.gap ?? 0, rise: m.rise ?? 0 });
  };
  for (const a of surfaces) {
    for (const b of surfaces) {
      if (a === b) continue;
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (overlap <= 0) {
        // Side by side: across a gap (or an abutting step too big to roll over).
        const dir = b.x0 >= a.x1 ? 1 : -1;
        const ax = dir > 0 ? a.x1 : a.x0;
        const bx = dir > 0 ? b.x0 : b.x1;
        const dx = Math.abs(bx - ax);
        const dy = yAt(b, bx) - yAt(a, ax);
        if (dx > reach.across(dy)) continue;
        const walk = dx <= 24 && dy > 0;
        push({
          from: a.id,
          to: b.id,
          kind: walk ? 'walk' : 'jump',
          dir,
          launchX: ax,
          gap: dx,
          rise: dy,
          cost: dx + Math.abs(dy) * (dy < 0 ? 1.5 : 0.5) + (walk ? 10 : 60),
        });
        continue;
      }
      // Stacked: one above the other over a shared x range.
      const lo = Math.max(a.x0, b.x0);
      const hi = Math.min(a.x1, b.x1);
      const ya = yAt(a, (lo + hi) / 2);
      const yb = yAt(b, (lo + hi) / 2);
      if (yb < ya - ROLL) {
        // b is above: jump up from beside one of its ends (not from under it: the head would hit).
        if (ya - yb > reach.up) continue;
        const spots: Array<[number, number]> = [];
        if (b.x0 - 40 > a.x0 + 8) spots.push([b.x0 - 40, 1]);
        if (b.x1 + 40 < a.x1 - 8) spots.push([b.x1 + 40, -1]);
        if (b.oneWay) spots.push([(lo + hi) / 2, 0]);
        for (const [x, dir] of spots)
          push({
            from: a.id,
            to: b.id,
            kind: 'up',
            dir,
            launchX: x,
            rise: yb - ya,
            cost: (ya - yb) * 1.5 + 80,
          });
      } else if (yb > ya + ROLL) {
        // b is below: walk off an end of a that hangs over b, or drop through a one-way.
        if (a.oneWay) {
          push({
            from: a.id,
            to: b.id,
            kind: 'through',
            dir: 0,
            launchX: (lo + hi) / 2,
            rise: yb - ya,
            cost: (yb - ya) * 0.5 + 40,
          });
          continue;
        }
        if (a.x1 > b.x0 + 24 && a.x1 < b.x1 - 24)
          push({
            from: a.id,
            to: b.id,
            kind: 'drop',
            dir: 1,
            launchX: a.x1,
            rise: yb - ya,
            cost: (yb - ya) * 0.5 + 30,
          });
        if (a.x0 < b.x1 - 24 && a.x0 > b.x0 + 24)
          push({
            from: a.id,
            to: b.id,
            kind: 'drop',
            dir: -1,
            launchX: a.x0,
            rise: yb - ya,
            cost: (yb - ya) * 0.5 + 30,
          });
      }
    }
  }
  return moves;
}

/** A move by its geometry (stable when the surfaces are rebuilt with new ids). */
export function moveKey(m: Move): string {
  return m.key;
}

/**
 * Shortest route (Dijkstra) from surface `from` to the first surface `goal` accepts; `bad` holds the
 * keys of moves that failed. Returns the moves in order ([] when already there, null when no route).
 */
export function plan(
  surfaces: readonly Surface[],
  moves: readonly Move[],
  from: number,
  goal: (s: Surface) => boolean,
  bad: ReadonlySet<string> = new Set(),
): Move[] | null {
  const byId = new Map(surfaces.map((s) => [s.id, s]));
  const start = byId.get(from);
  if (!start) return null;
  if (goal(start)) return [];
  const dist = new Map<number, number>([[from, 0]]);
  const via = new Map<number, Move>();
  const open = new Set<number>([from]);
  const done = new Set<number>();
  const out = new Map<number, Move[]>();
  for (const m of moves) {
    if (bad.has(moveKey(m))) continue;
    const l = out.get(m.from) ?? [];
    l.push(m);
    out.set(m.from, l);
  }
  while (open.size > 0) {
    let u = -1;
    let ud = Number.POSITIVE_INFINITY;
    for (const id of open) {
      const d = dist.get(id) ?? Number.POSITIVE_INFINITY;
      if (d < ud) {
        ud = d;
        u = id;
      }
    }
    open.delete(u);
    done.add(u);
    const su = byId.get(u);
    if (su && u !== from && goal(su)) {
      const path: Move[] = [];
      let c = u;
      while (c !== from) {
        const m = via.get(c);
        if (!m) break;
        path.unshift(m);
        c = m.from;
      }
      return path;
    }
    for (const m of out.get(u) ?? []) {
      if (done.has(m.to)) continue;
      const nd = ud + m.cost;
      if (nd < (dist.get(m.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(m.to, nd);
        via.set(m.to, m);
        open.add(m.to);
      }
    }
  }
  return null;
}

/** What the persona remembers of a room. */
export class Mind {
  readonly solids = new Set<number>();
  /** Solids whose top edge has been in view (only those are ground it knows of). */
  readonly tops = new Set<number>();
  readonly oneWays = new Set<number>();
  surfaces: Surface[] = [];
  moves: Move[] = [];
  readonly bad = new Set<string>();
  private dirty = true;
  private reach: Reach;
  private abilities = '';

  constructor(
    readonly scene: Scene,
    /** It knows the whole room (a speedrunner who has run it before). */
    readonly knowsAll = false,
  ) {
    this.reach = reachFor([]);
    if (knowsAll) {
      scene.solids.forEach((_, i) => {
        this.solids.add(i);
        this.tops.add(i);
      });
      scene.oneWays.forEach((_, i) => {
        this.oneWays.add(i);
      });
    }
  }

  /** Adds what is in view; returns true when something new was seen. */
  see(
    solids: readonly number[],
    oneWays: readonly number[],
    abilities: readonly string[],
    tops: readonly number[] = solids,
  ): boolean {
    let fresh = false;
    for (const i of tops)
      if (!this.tops.has(i)) {
        this.tops.add(i);
        fresh = true;
      }
    for (const i of solids)
      if (!this.solids.has(i)) {
        this.solids.add(i);
        fresh = true;
      }
    for (const i of oneWays)
      if (!this.oneWays.has(i)) {
        this.oneWays.add(i);
        fresh = true;
      }
    const ab = abilities.join(',');
    if (ab !== this.abilities) {
      this.abilities = ab;
      this.reach = reachFor(abilities);
      fresh = true;
    }
    if (fresh) this.dirty = true;
    return fresh;
  }

  refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.surfaces = buildSurfaces(
      this.scene,
      [...this.solids].sort((a, b) => a - b),
      [...this.oneWays].sort((a, b) => a - b),
      this.tops,
    );
    this.moves = buildMoves(this.surfaces, this.reach);
  }

  under(x: number, y: number): Surface | null {
    this.refresh();
    return surfaceAt(this.surfaces, x, y);
  }

  route(from: number, goal: (s: Surface) => boolean): Move[] | null {
    this.refresh();
    return plan(this.surfaces, this.moves, from, goal, this.bad);
  }

  /** The surface a point is best reached from: the nearest top under it within a jump, else the nearest top. */
  standFor(x: number, y: number): Surface | null {
    this.refresh();
    let best: Surface | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const s of this.surfaces) {
      const cx = Math.max(s.x0, Math.min(s.x1, x));
      const sy = yAt(s, cx);
      const below = sy - y;
      const d =
        Math.abs(cx - x) + (below >= -8 && below <= this.reach.up ? below * 0.25 : Math.abs(below) * 3);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
}
