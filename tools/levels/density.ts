/**
 * The density lint (docs/design/levels/proto-1.md §4; review r1 §2): `npx tsx tools/levels/density.ts [room ...]`.
 * From standing spots every 120 px along every top of a room (solids and one-ways, not under a ceiling, not on
 * thorns), how many *kinds* of thing are in view (her chamber's 1920 px, 1080 tall round her, held inside the
 * chamber) and within 600 px. The rule: at least 3 kinds in view and 2 within reach.
 *
 * Kinds: creature, collectible (glints, pods), breakable (bark, pods), flame (warm lamp, moonwick), tell (a hollow,
 * a cover, the cap, the moth-stone). Signs, exits, doors and gates are not kinds (review r1: they flattered it).
 * Two states: the first visit, as the room starts (creatures that wake later left out), and the revisit (every
 * glint taken, warm lamps spent, bark broken, hollows found; creatures and pods back, moonwicks there as buds).
 *
 * Quiet on purpose (§4): the first half of A3, the vista on C1, the patch alcoves (300 px round a patch), the arena
 * before the lock.
 */
import { getRoom } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';

export type Kind = 'creature' | 'collectible' | 'breakable' | 'flame' | 'tell';

interface Thing {
  kind: Kind;
  x: number;
  y: number;
}

export interface Spot {
  x: number;
  y: number;
  chamber: string;
  quiet: boolean;
  view: number;
  near: number;
}

export interface ChamberDensity {
  room: string;
  chamber: string;
  spots: number;
  quiet: number;
  /** Share of the chamber's (not quiet) spots that meet the rule, 0..1. */
  pass: number;
  /** The spots that fail (for the report). */
  thin: Array<{ x: number; y: number; view: number; near: number }>;
}

const STEP = 120;
const NEAR = 600;
const VIEW_H = 1080;

/** The things of a room by kind, in the given state. */
export function things(room: Room, revisit: boolean): Thing[] {
  const out: Thing[] = [];
  for (const e of room.enemies ?? []) {
    if (e.kind === 'web' || e.kind === 'gloamweaver' || e.fight) continue;
    if (e.wakes && !revisit) continue;
    out.push({ kind: 'creature', x: e.x, y: e.y });
  }
  if (!revisit) for (const p of room.pickups ?? []) out.push({ kind: 'collectible', x: p.x, y: p.y });
  for (const p of room.pods ?? []) {
    out.push({ kind: 'collectible', x: p.x, y: p.y });
    out.push({ kind: 'breakable', x: p.x, y: p.y });
  }
  if (!revisit)
    for (const b of room.bark ?? []) out.push({ kind: 'breakable', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  for (const l of room.lures ?? []) {
    if (l.kind === 'great') continue;
    if (l.kind !== 'moonwick' && revisit) continue;
    out.push({ kind: 'flame', x: l.x, y: l.y });
  }
  if (!revisit) {
    for (const h of room.hollows ?? []) out.push({ kind: 'tell', x: h.x + h.w / 2, y: h.y + h.h / 2 });
    for (const c of room.marks?.covers ?? []) out.push({ kind: 'tell', x: c.x + c.w / 2, y: c.y + c.h / 2 });
    for (const s of room.mothStones ?? []) out.push({ kind: 'tell', x: s.x, y: s.y });
  }
  for (const b of room.bells ?? []) out.push({ kind: 'tell', x: b.x, y: b.y });
  return out;
}

/** The standing spots of a room: every `STEP` px along each top, not under a ceiling, not on thorns. */
export function spots(room: Room): Array<{ x: number; y: number }> {
  const tops: Array<{ x0: number; x1: number; y: number }> = [];
  for (const s of room.solids) tops.push({ x0: s.x, x1: s.x + s.w, y: s.y });
  for (const o of room.oneWays ?? []) tops.push({ x0: o.x, x1: o.x + o.w, y: o.y });
  const solidAt = (x: number, y0: number, y1: number) =>
    room.solids.some((q) => x >= q.x && x < q.x + q.w && q.y < y1 && q.y + q.h > y0);
  const thornAt = (x: number, y: number) =>
    (room.thorns ?? []).some((q) => x >= q.x && x < q.x + q.w && y >= q.y - 4 && y <= q.y + q.h);
  const out: Array<{ x: number; y: number }> = [];
  for (const t of tops) {
    for (let x = t.x0 + STEP / 2; x < t.x1; x += STEP) {
      if (x < 0 || x > room.width || t.y <= 0 || t.y >= room.height) continue;
      // (Her body stands over the top: 80 px of it clear.)
      if (solidAt(x, t.y - 80, t.y - 1)) continue;
      if (thornAt(x, t.y)) continue;
      out.push({ x, y: t.y });
    }
  }
  return out;
}

function quietAt(room: Room, x: number, y: number, chamber: string): boolean {
  if ((room.patches ?? []).some((p) => Math.abs(p.x - x) < 300 && Math.abs(p.y - y) < 200)) return true;
  if (room.id === 'lr-roots' && x < 960) return true;
  if (room.id === 'lr-night' && chamber === 'c1') return true;
  const a = room.boss?.arena;
  if (a && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return true;
  return false;
}

/** The lint over a room, per chamber, in one state. */
export function density(room: Room, revisit: boolean): ChamberDensity[] {
  const all = things(room, revisit);
  const chambers = room.marks?.chambers ?? [{ id: room.id, x: 0, y: 0, w: room.width, h: room.height }];
  const out: ChamberDensity[] = [];
  for (const c of chambers) {
    let spotsN = 0;
    let quiet = 0;
    let pass = 0;
    const thin: ChamberDensity['thin'] = [];
    for (const sp of spots(room)) {
      if (sp.x < c.x || sp.x >= c.x + c.w || sp.y < c.y || sp.y > c.y + c.h) continue;
      spotsN++;
      if (quietAt(room, sp.x, sp.y, c.id)) {
        quiet++;
        continue;
      }
      const top = Math.max(c.y, Math.min(c.y + c.h - VIEW_H, sp.y - VIEW_H * 0.6));
      const inView = new Set<Kind>();
      const near = new Set<Kind>();
      for (const t of all) {
        if (t.x < c.x || t.x >= c.x + c.w || t.y < top || t.y > top + VIEW_H) continue;
        inView.add(t.kind);
        if ((t.x - sp.x) * (t.x - sp.x) + (t.y - sp.y) * (t.y - sp.y) <= NEAR * NEAR) near.add(t.kind);
      }
      if (inView.size >= 3 && near.size >= 2) pass++;
      else thin.push({ x: sp.x, y: sp.y, view: inView.size, near: near.size });
    }
    const n = spotsN - quiet;
    out.push({ room: room.id, chamber: c.id, spots: spotsN, quiet, pass: n > 0 ? pass / n : 1, thin });
  }
  return out;
}

if (process.argv[1]?.endsWith('density.ts')) {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  for (const id of ids.length ? ids : ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache']) {
    const room = getRoom(id);
    const first = density(room, false);
    const again = density(room, true);
    for (let i = 0; i < first.length; i++) {
      const a = first[i] as ChamberDensity;
      const b = again[i] as ChamberDensity;
      const pc = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
      console.log(
        `${id.padEnd(9)} ${a.chamber.padEnd(6)} spots ${String(a.spots).padStart(3)} (quiet ${String(a.quiet).padStart(2)})  first ${pc(a.pass)}  revisit ${pc(b.pass)}${process.argv.includes('-v') && b.thin.length ? `  thin: ${b.thin.map((t) => `${t.x},${t.y}`).join(' ')}` : ''}`,
      );
    }
  }
}
