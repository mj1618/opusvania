/**
 * The map in a persona's head: the solids it has seen (or all of them, for a persona that knows the
 * room), turned into walkable surfaces and a graph of moves between them (walk on, jump across, jump
 * up, drop down), with a shortest-path planner. Pure: Node and the page.
 *
 * Reach is approximate (memory/movement-controller.md "Reach"), with a safety margin: a planned jump
 * that fails is remembered as bad and the planner routes round it.
 */
import type { Scene, SolidRect } from '../../src/sim/scene';

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
  /** A bounce cap's top (never stood on: it throws her up this many px, jump held). */
  cap?: number;
}

export type MoveKind = 'walk' | 'jump' | 'up' | 'drop' | 'through' | 'climb' | 'cut' | 'bounce';

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
  /** A jump across a gap no jump spans, over a chain of pogo targets (seed-cases): down cuts on the way. */
  pogo?: boolean;
  /** A climb: the face she kicks up first (`dir` = the way she holds into it). */
  faceX?: number;
  /** A bounce: off the cap `from` is (it throws her up this many px with jump held). */
  capRise?: number;
}

/** Most px between a launch, the seed-cases and the landing for a pogo chain the planner trusts. */
const POGO_SPAN = 320;

/**
 * Seed-cases spanning a gap from `ax` to `bx` (feet line `y`): every hop of the chain, the first from the
 * lip and the last onto the far side, at most `POGO_SPAN` px, the cases near the launch height.
 */
function pogoChain(pogos: readonly { x: number; y: number }[], ax: number, bx: number, y: number): boolean {
  const lo = Math.min(ax, bx);
  const hi = Math.max(ax, bx);
  const xs = pogos
    .filter((q) => q.x > lo && q.x < hi && q.y > y - 96 && q.y < y + 160)
    .map((q) => q.x)
    .sort((a, b) => a - b);
  if (xs.length === 0) return false;
  let at = lo;
  for (const x of [...xs, hi]) {
    if (x - at > POGO_SPAN) return false;
    at = x;
  }
  return true;
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
    // Over its own range beats hanging past another's end (two surfaces abut at one height: the mesh by the floor).
    const d = Math.abs(topUnder(s, x) - y) + (x >= s.x0 && x <= s.x1 ? 0 : 3);
    if (d <= slack + 3 && d < bd) {
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
export function reachFor(abilities: readonly string[], margin = 0.95): Reach {
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
export function buildMoves(
  surfaces: readonly Surface[],
  reach: Reach,
  pogos: readonly { x: number; y: number }[] = [],
  /** Known standing solids (a wall in a gap blocks a jump across it; rotten bark in it is a cut). */
  walls: readonly { x: number; y: number; w: number; h: number; bark?: boolean }[] = [],
): Move[] {
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
        // A wall standing in the gap, higher than a jump: no jump; if it is rotten bark, a cut through.
        const ya = yAt(a, ax);
        const lo = Math.min(ax, bx);
        const hi = Math.max(ax, bx);
        const inGap = walls.filter(
          (w) => w.x < hi + 4 && w.x + w.w > lo - 4 && w.y < Math.min(ya, ya + dy) - 40 && w.y + w.h > ya - 8,
        );
        if (inGap.length > 0) {
          if (inGap.every((w) => w.bark) && Math.abs(dy) <= 24 && dx <= 200)
            push({ from: a.id, to: b.id, kind: 'cut', dir, launchX: ax, gap: dx, rise: dy, cost: dx + 40 });
          if (inGap.some((w) => w.y < Math.min(ya, ya + dy) - reach.up)) continue;
        }
        const pogo = dx > reach.across(dy) && Math.abs(dy) <= 64 && pogoChain(pogos, ax, bx, ya);
        if (dx > reach.across(dy) && !pogo) continue;
        // Abutting at about the same height (a one-way mesh beside the floor), or a step down: walked.
        const walk = dx <= 24 && (dy > 0 || (dx <= 2 && Math.abs(dy) <= ROLL));
        push({
          from: a.id,
          to: b.id,
          kind: walk ? 'walk' : 'jump',
          dir,
          launchX: ax,
          gap: dx,
          rise: dy,
          cost: dx + Math.abs(dy) * (dy < 0 ? 1.5 : 0.5) + (walk ? 10 : pogo ? 200 : 60),
          ...(pogo ? { pogo } : {}),
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

/** A face she can kick off: the side of a solid (or the room's edge) at `x`, kicked from the `w` side (w = the way she holds into it). */
export interface Face {
  x: number;
  w: number;
  y0: number;
  y1: number;
}

/** Every face the scene offers a kick on, from the solids given (indices) and the room's edges. */
export function facesOf(scene: Scene, solids: Iterable<number>): Face[] {
  const out: Face[] = [];
  for (const i of solids) {
    const s = scene.solids[i];
    if (!s || s.kick === false) continue;
    if (s.kick !== 'east') out.push({ x: s.x, w: 1, y0: s.y, y1: s.y + s.h });
    if (s.kick !== 'west') out.push({ x: s.x + s.w, w: -1, y0: s.y, y1: s.y + s.h });
  }
  if (scene.edgeKick !== false) {
    out.push({ x: 0, w: -1, y0: 0, y1: scene.height });
    out.push({ x: scene.width, w: 1, y0: 0, y1: scene.height });
  }
  return out;
}

/**
 * Wall climbs (she owns wall jump): from a surface to one above it that no jump reaches, up a kickable
 * face that rises beside where she can stand. Loose on purpose: the look-ahead (lines.ts) decides
 * whether the climb really goes, and a climb that does not is dropped like any failed move.
 */
export function buildClimbs(surfaces: readonly Surface[], faces: readonly Face[], reach: Reach): Move[] {
  const out: Move[] = [];
  for (const a of surfaces) {
    // Faces she can stand beside on `a` (the stand point on it), rising from its level.
    const near = faces.filter((fc) => {
      const stand = fc.x - fc.w * 26;
      if (stand < a.x0 - 8 || stand > a.x1 + 8) return false;
      const ya = topUnder(a, Math.max(a.x0, Math.min(a.x1, stand)));
      return fc.y0 < ya - 64 && fc.y1 >= ya - 220;
    });
    if (near.length === 0) continue;
    for (const b of surfaces) {
      if (b === a) continue;
      for (const fc of near) {
        const stand = fc.x - fc.w * 26;
        const ya = topUnder(a, Math.max(a.x0, Math.min(a.x1, stand)));
        const bx = Math.max(b.x0, Math.min(b.x1, fc.x));
        const yb = topUnder(b, bx);
        if (yb > ya - reach.up * 0.5 || ya - yb > 2800) continue;
        if (Math.abs(bx - fc.x) > 760) continue;
        const key = `climb:${fc.w}:${Math.round(fc.x)}>${b.x0},${b.pieces[0]?.y ?? 0}`;
        if (out.some((q) => q.key === key)) continue;
        out.push({
          from: a.id,
          to: b.id,
          kind: 'climb',
          dir: fc.w,
          launchX: stand,
          faceX: fc.x,
          cost: (ya - yb) * 2 + 150 + Math.abs(bx - fc.x),
          key,
          gap: Math.abs(bx - fc.x),
          rise: yb - ya,
        });
      }
    }
  }
  return out;
}

/**
 * Bounces: off a cap's top to a surface whose top she rises over (a little short of the full held rise) within
 * reach sideways (the wings add more on the way down). Moves from a cap are only bounces: nobody stands on one.
 */
export function buildBounces(surfaces: readonly Surface[], glide: boolean): Move[] {
  const out: Move[] = [];
  for (const c of surfaces) {
    if (!c.cap) continue;
    const cy = c.pieces[0]?.y ?? 0;
    for (const b of surfaces) {
      if (b === c) continue;
      const bx = Math.max(b.x0, Math.min(b.x1, (c.x0 + c.x1) / 2));
      const by = topUnder(b, bx);
      const rise = cy - by;
      if (rise > c.cap * 0.92) continue;
      const side = Math.max(0, b.x0 - c.x1, c.x0 - b.x1);
      const fall = Math.max(0, -rise);
      if (side > 420 + (glide ? 2.2 * (c.cap + fall) * 0.5 : 0.6 * fall)) continue;
      out.push({
        from: c.id,
        to: b.id,
        kind: 'bounce',
        dir: Math.sign(bx - (c.x0 + c.x1) / 2) || 1,
        launchX: (c.x0 + c.x1) / 2,
        capRise: c.cap,
        cost: side + Math.abs(rise) * 0.5 + 40,
        key: `bounce:${c.x0},${cy}>${b.x0},${b.pieces[0]?.y ?? 0}`,
        gap: side,
        rise: -rise,
      });
    }
  }
  return out;
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

/** A solid the kit adds while it stands: rotten bark, a shut gate, a shortcut not yet opened. */
export interface KitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'bark' | 'gate' | 'shortcut' | 'cap';
  /** A cap: the rise it throws her, jump held (kit.caps tiers x heldScale). */
  rise?: number;
  /** Gone when the save has this in `opened` (bark, shortcuts: `room:id`) or `flags` (a gate's flag). */
  open: string;
  kick?: boolean | 'east' | 'west';
}

/** The kit pieces of a room that stand until something opens them. */
/** kit.caps (src/sim/tuning.ts): tiers and the held scale. The look-ahead has the exact numbers anyway. */
const CAP_TIERS = { small: 320, mid: 448, big: 640 } as const;
const CAP_HELD = 1.2;

export function kitRects(scene: Scene): KitRect[] {
  const out: KitRect[] = [];
  for (const c of scene.caps ?? [])
    out.push({
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      kind: 'cap',
      open: '',
      rise: (c.height ?? CAP_TIERS[c.tier ?? 'mid']) * CAP_HELD,
      ...(c.kick !== undefined ? { kick: c.kick } : {}),
    });
  for (const b of scene.bark ?? [])
    out.push({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      kind: 'bark',
      open: `${scene.id}:${b.id}`,
      ...(b.kick !== undefined ? { kick: b.kick } : {}),
    });
  for (const g of scene.gates ?? [])
    out.push({
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      kind: 'gate',
      open: g.flag,
      ...(g.kick !== undefined ? { kick: g.kick } : {}),
    });
  for (const c of scene.shortcuts ?? [])
    out.push({ x: c.x, y: c.y, w: c.w, h: c.h, kind: 'shortcut', open: `${scene.id}:${c.id}` });
  return out;
}

/**
 * What the persona remembers of a room. Its solids are the room's plus the kit's standing pieces (bark,
 * gates, shut shortcuts: `kitRects`, indices after the room's own); one that opens drops out of the map.
 */
export class Mind {
  readonly solids = new Set<number>();
  /** Solids whose top edge has been in view (only those are ground it knows of). */
  readonly tops = new Set<number>();
  readonly oneWays = new Set<number>();
  surfaces: Surface[] = [];
  moves: Move[] = [];
  readonly bad = new Set<string>();
  /** The room's solids, then the kit's (see `kitRects`). */
  readonly rects: SolidRect[];
  private readonly kit: KitRect[];
  private openKey = '';
  private openSet = new Set<number>();
  private dirty = true;
  private reach: Reach;
  private abilities = '';

  constructor(
    readonly scene: Scene,
    /** It knows the whole room (a speedrunner who has run it before). */
    readonly knowsAll = false,
  ) {
    this.reach = reachFor([]);
    this.kit = kitRects(scene);
    this.rects = [
      ...scene.solids,
      ...this.kit.map(
        (k): SolidRect => ({
          x: k.x,
          y: k.y,
          w: k.w,
          h: k.h,
          tag: 'root',
          ...(k.kick !== undefined ? { kick: k.kick } : {}),
        }),
      ),
    ];
    if (knowsAll) {
      this.rects.forEach((_, i) => {
        this.solids.add(i);
        this.tops.add(i);
      });
      scene.oneWays.forEach((_, i) => {
        this.oneWays.add(i);
      });
    }
  }

  /**
   * Adds what is in view; returns true when something new was seen. `view` lets it see the kit's pieces,
   * `save` tells it which have opened.
   */
  see(
    solids: readonly number[],
    oneWays: readonly number[],
    abilities: readonly string[],
    tops: readonly number[] = solids,
    view: { x: number; y: number; w: number; h: number } | null = null,
    save: { opened: readonly string[]; flags: readonly string[] } | null = null,
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
    const n = this.scene.solids.length;
    if (view)
      this.kit.forEach((k, j) => {
        const i = n + j;
        if (this.solids.has(i)) return;
        if (k.x < view.x + view.w && view.x < k.x + k.w && k.y < view.y + view.h && view.y < k.y + k.h) {
          this.solids.add(i);
          if (k.y >= view.y && k.y <= view.y + view.h) this.tops.add(i);
          fresh = true;
        }
      });
    if (save) {
      const open = new Set<number>();
      this.kit.forEach((k, j) => {
        if ((k.kind === 'gate' ? save.flags : save.opened).includes(k.open)) open.add(n + j);
      });
      const key = [...open].join(',');
      if (key !== this.openKey) {
        this.openKey = key;
        this.openSet = open;
        fresh = true;
      }
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

  /** It owns the wall jump (climb moves are in the map). */
  get climber(): boolean {
    return this.abilities.split(',').includes('wallJump');
  }

  /** The kit's pieces standing now (bark not broken, gates shut, shortcuts not opened), with their kind. */
  kitStanding(): KitRect[] {
    const n = this.scene.solids.length;
    return this.kit.filter((_, j) => !this.openSet.has(n + j));
  }

  /** Known solids standing now (indices into `rects`). */
  standing(): number[] {
    return [...this.solids].filter((i) => !this.openSet.has(i)).sort((a, b) => a - b);
  }

  /** Faces she could kick off among what it knows. */
  faces(): Face[] {
    return facesOf({ ...this.scene, solids: this.rects }, this.standing());
  }

  refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const played = { ...this.scene, solids: this.rects };
    const standing = this.standing();
    this.surfaces = buildSurfaces(
      played,
      standing,
      [...this.oneWays].sort((a, b) => a - b),
      this.tops,
    );
    const n = this.scene.solids.length;
    const walls = standing.map((i) => {
      const r = this.rects[i] as SolidRect;
      return { x: r.x, y: r.y, w: r.w, h: r.h, bark: i >= n && this.kit[i - n]?.kind === 'bark' };
    });
    // Cap tops: marked with their rise; the only moves off them are bounces.
    const caps = this.kit.filter((k) => k.kind === 'cap');
    for (const q of this.surfaces) {
      const c = caps.find(
        (k) => q.x0 >= k.x - 1 && q.x1 <= k.x + k.w + 1 && Math.abs((q.pieces[0]?.y ?? 0) - k.y) <= 1,
      );
      if (c?.rise) q.cap = c.rise;
    }
    this.moves = buildMoves(this.surfaces, this.reach, this.scene.seedCases ?? [], walls).filter(
      (m) => !this.surfaces.find((q) => q.id === m.from)?.cap,
    );
    this.moves.push(...buildBounces(this.surfaces, this.abilities.split(',').includes('glide')));
    if (this.abilities.split(',').includes('wallJump'))
      this.moves.push(...buildClimbs(this.surfaces, facesOf(played, standing), this.reach));
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
