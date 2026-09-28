/**
 * World graph extraction (progression validator, PLAN §4.3). Reads every registered room through the
 * sim adapter and builds the graph the solver walks: rooms, their entries (spawns), exits (doors and
 * G -> next), ability pickups (explicit `pickups` entities plus each room's declared `abilities`,
 * modelled as an implicit "grant" pickup at the entry), Rests, gates/locks with their `requires`
 * annotations, and hazards. Also the static (gravity-free) flood fill used for cheap proofs.
 */
import { createHash } from 'node:crypto';
import { ABILITIES, type Ability, type RoomLayout, roomIds, roomLayout } from '../../src/debug/sim-adapter';

export type { Ability };
export const ALL: readonly Ability[] = ABILITIES;

/** Sorted, de-duplicated ability list (canonical form used in keys and reports). */
export function abil(list: Iterable<Ability>): Ability[] {
  const s = new Set(list);
  return ALL.filter((a) => s.has(a));
}
export const abilKey = (a: readonly Ability[]): string => (a.length ? a.join('+') : 'none');
export const isSubset = (a: readonly Ability[], b: readonly Ability[]): boolean =>
  a.every((x) => b.includes(x));

export interface ExitNode {
  /** `room/exit:<char>` or `room/G`. */
  id: string;
  room: string;
  kind: 'door' | 'goal';
  char: string;
  /** Bot target in the room (`exit:<char>` or `G`). */
  target: string;
  to: string;
  toSpawn: string;
  tx: number;
  ty: number;
}

export interface PickupNode {
  /** Explicit: the pickup's `id` (default `room:char`); implicit room grant: `grant:<room>`. */
  id: string;
  room: string;
  grants: Ability[];
  /** Implicit = the room's declared `abilities`, granted on entry (gym semantics today). */
  implicit: boolean;
  /** Bot target (`tile:x,y`); implicit grants have none (collected on entry). */
  target?: string;
  tx?: number;
  ty?: number;
}

export interface RestNode {
  id: string;
  room: string;
  target: string;
}

export interface GateNode {
  /** `room/gate:<char>` or `room/lock:<name>`. */
  id: string;
  room: string;
  kind: 'gate' | 'lock';
  name: string;
  requires: Ability[];
  /** Bot target that counts as "passed" (a lock's own target; a gate's far-side tiles). */
  target: string;
  from: string;
  opensOn?: string;
  /** world-design §3: sealed barrier or reach (height/gap/timing) gate. */
  hold: 'sealed' | 'reach';
  /** G8: holds only against the kit at the room's earliest visit. */
  teachGate: boolean;
  /** G7: bounded search region (`rect:x,y,w,h`) so the bot can exhaust. */
  region?: string;
  note?: string;
  /** Why the target is what it is, or why the gate could not be audited. */
  derived?: string;
  problem?: string;
}

export interface RoomNode {
  id: string;
  name: string;
  /** sha1 of the parsed room file: the oracle cache key. */
  hash: string;
  width: number;
  height: number;
  grant: Ability[];
  /** Spawns other rooms arrive at, plus `default` (start, `next` arrivals, respawn). */
  entries: string[];
  exits: ExitNode[];
  pickups: PickupNode[];
  rests: RestNode[];
  gates: GateNode[];
  /** G with no `next` (completes the room; not an exit). */
  goalOnly?: { tx: number; ty: number };
  optionalGoal?: string;
  hazards: { spikes: number; orbs: number; enemies: string[]; sources: number };
  /** Seizable colours (object sources + enemy voices): part of the kit inside this room (W1/W2). */
  palette: string[];
}

export interface Link {
  exit: string;
  from: string;
  to: string;
  spawn: string;
}

export interface WorldGraph {
  start: { room: string; spawn: string };
  rooms: Record<string, RoomNode>;
  links: Link[];
  /** Structural problems (dangling doors, missing spawns, orphan rooms). */
  errors: string[];
  warnings: string[];
}

export function roomHash(l: RoomLayout): string {
  return createHash('sha1').update(JSON.stringify(l.file)).digest('hex').slice(0, 12);
}

const tileTarget = (tx: number, ty: number) => `tile:${tx},${ty}`;

export function extractWorld(opts: { start?: string; rooms?: string[] } = {}): WorldGraph {
  const ids = opts.rooms ?? roomIds().filter((id) => !id.startsWith('lab-') && !id.includes('~'));
  const start = opts.start ?? 'hub';
  const errors: string[] = [];
  const warnings: string[] = [];
  const rooms: Record<string, RoomNode> = {};
  const layouts = new Map<string, RoomLayout>();
  for (const id of ids) layouts.set(id, roomLayout(id));

  for (const [id, l] of layouts) {
    const exits: ExitNode[] = [];
    const pickups: PickupNode[] = [];
    const rests: RestNode[] = [];
    let goalOnly: RoomNode['goalOnly'];
    let optionalGoal: string | undefined;
    for (const e of l.entities) {
      if (e.kind === 'door' && e.to) {
        exits.push({
          id: `${id}/exit:${e.char}`,
          room: id,
          kind: 'door',
          char: e.char,
          target: `exit:${e.char}`,
          to: e.to,
          toSpawn: e.spawn ?? 'default',
          tx: e.tx,
          ty: e.ty,
        });
      } else if (e.kind === 'goal') {
        if (l.next)
          exits.push({
            id: `${id}/G`,
            room: id,
            kind: 'goal',
            char: 'G',
            target: 'G',
            to: l.next,
            toSpawn: 'default',
            tx: e.tx,
            ty: e.ty,
          });
        else goalOnly = { tx: e.tx, ty: e.ty };
      } else if (e.kind === 'optionalGoal') optionalGoal = 'g';
      else if (e.kind === 'pickup' && e.grants) {
        pickups.push({
          id: e.id ?? `${id}:${e.char}`,
          room: id,
          grants: [...e.grants],
          implicit: false,
          target: tileTarget(e.tx, e.ty),
          tx: e.tx,
          ty: e.ty,
        });
      } else if (e.kind === 'rest')
        rests.push({ id: `${id}/rest:${e.id ?? e.char}`, room: id, target: tileTarget(e.tx, e.ty) });
    }
    if (l.abilities.length > 0)
      pickups.unshift({ id: `grant:${id}`, room: id, grants: [...l.abilities], implicit: true });
    let spikes = 0;
    let orbs = 0;
    for (let ty = 0; ty < l.height; ty++)
      for (let tx = 0; tx < l.width; tx++) {
        const c = l.classAt(tx, ty);
        if (c === 'spike') spikes++;
        else if (c === 'orb') orbs++;
      }
    rooms[id] = {
      id,
      name: l.name,
      hash: roomHash(l),
      width: l.width,
      height: l.height,
      grant: [...l.abilities],
      entries: ['default'],
      exits,
      pickups,
      rests,
      gates: extractGates(l),
      ...(goalOnly ? { goalOnly } : {}),
      ...(optionalGoal ? { optionalGoal } : {}),
      hazards: { spikes, orbs, enemies: l.enemies, sources: l.sources.length },
      palette: [...l.palette],
    };
  }

  const links: Link[] = [];
  for (const r of Object.values(rooms)) {
    for (const x of r.exits) {
      const to = rooms[x.to];
      const lt = layouts.get(x.to);
      if (!to || !lt) {
        errors.push(`${x.id} leads to unknown room "${x.to}"`);
        continue;
      }
      if (!(x.toSpawn in lt.spawns)) {
        errors.push(`${x.id} leads to ${x.to} spawn "${x.toSpawn}", which does not exist`);
        continue;
      }
      if (!to.entries.includes(x.toSpawn)) to.entries.push(x.toSpawn);
      links.push({ exit: x.id, from: r.id, to: x.to, spawn: x.toSpawn });
    }
  }
  if (!rooms[start]) errors.push(`start room "${start}" does not exist`);
  for (const r of Object.values(rooms)) {
    if (r.id !== start && !links.some((k) => k.to === r.id))
      warnings.push(`${r.id}: no link leads here (orphan)`);
    if (r.exits.length === 0) warnings.push(`${r.id}: no exits (dead end)`);
    for (const g of r.gates) if (g.problem) warnings.push(`${g.id}: ${g.problem}`);
  }
  return { start: { room: start, spawn: 'default' }, rooms, links, errors, warnings };
}

// ---------------------------------------------------------------------------------------------
// Static (gravity-free) reachability: an over-approximation used as a proof of UNreachability.

/**
 * Which tiles block the flood fill for a given ability set. Terrain and plates always; a closed
 * gate unless its opening mechanism is available (plate: seize, and levy for slab-only plates;
 * clear: always, the jab is free); a home source unless it can be seized (white never can).
 * Ignores gravity and body size, so everything it calls reachable is a superset of the truth.
 */
export function blockers(l: RoomLayout, abilities: readonly Ability[], openGates = false): Uint8Array {
  const w = l.width;
  const out = new Uint8Array(w * l.height);
  for (let ty = 0; ty < l.height; ty++)
    for (let tx = 0; tx < w; tx++) if (l.classAt(tx, ty) === 'solid') out[ty * w + tx] = 1;
  const has = (a: Ability) => abilities.includes(a);
  const plateOpenable = l.plates.some(
    (p) => has('seize') && (p.pressedBy.includes('heavy') || (p.pressedBy.includes('slab') && has('levy'))),
  );
  for (const g of l.gates) {
    const open = openGates || (g.opensOn === 'plate' ? plateOpenable : true);
    if (open) continue;
    for (let i = 0; i < g.tiles.length; i += 2)
      out[(g.tiles[i + 1] as number) * w + (g.tiles[i] as number)] = 1;
  }
  for (const s of l.sources) {
    if (has('seize') && s.colour !== 'white') continue;
    for (let y = s.ty; y < s.ty + s.th; y++) for (let x = s.tx; x < s.tx + s.tw; x++) out[y * w + x] = 1;
  }
  return out;
}

/** 4-connected flood fill from a tile over non-blocking tiles. */
export function flood(l: RoomLayout, block: Uint8Array, tx: number, ty: number): Uint8Array {
  const w = l.width;
  const seen = new Uint8Array(w * l.height);
  const i0 = ty * w + tx;
  if (block[i0]) return seen;
  const stack = [i0];
  seen[i0] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= l.height) continue;
      const j = ny * w + nx;
      if (seen[j] || block[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/** Tile rect (inclusive tile coords) a bot target covers, or undefined for unknown names. */
export function targetTiles(
  l: RoomLayout,
  target: string,
): { x0: number; y0: number; x1: number; y1: number } | undefined {
  const ts = l.tileSize;
  const tm = /^tile:(-?\d+),(-?\d+)$/.exec(target);
  if (tm) return { x0: Number(tm[1]), y0: Number(tm[2]), x1: Number(tm[1]), y1: Number(tm[2]) };
  const rm = /^rect:(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(target);
  if (rm) {
    const x = Number(rm[1]);
    const y = Number(rm[2]);
    return {
      x0: Math.floor(x / ts),
      y0: Math.floor(y / ts),
      x1: Math.floor((x + Number(rm[3]) - 1) / ts),
      y1: Math.floor((y + Number(rm[4]) - 1) / ts),
    };
  }
  const e =
    target === 'G'
      ? l.entities.find((x) => x.kind === 'goal')
      : target === 'g'
        ? l.entities.find((x) => x.kind === 'optionalGoal')
        : target.startsWith('exit:')
          ? l.entities.find((x) => x.kind === 'door' && x.char === target.slice(5))
          : undefined;
  if (e) return { x0: e.tx, y0: e.ty, x1: e.tx, y1: e.ty };
  const sp = l.spawns[target.replace(/^spawn:/, '')];
  return sp ? { x0: sp.tx, y0: sp.ty, x1: sp.tx, y1: sp.ty } : undefined;
}

/**
 * Proof of unreachability: true when no tile of `target` is in the gravity-free flood fill from
 * the start tile with this ability set. The player's body also overlaps the tile above its feet
 * tile, so the fill counts a target tile touched from below or the side.
 */
export function staticallyUnreachable(
  l: RoomLayout,
  from: { tx: number; ty: number },
  abilities: readonly Ability[],
  target: string,
): boolean {
  const t = targetTiles(l, target);
  if (!t) return false;
  const seen = flood(l, blockers(l, abilities), from.tx, from.ty);
  for (let y = t.y0 - 1; y <= t.y1 + 1; y++)
    for (let x = t.x0 - 1; x <= t.x1 + 1; x++) {
      if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
      if (seen[y * l.width + x]) return false;
    }
  return true;
}

/**
 * Tile gates with `requires` get an automatic target: the tiles next to the gate that are cut off
 * from the audit start when the gate is shut (everything else open). Locks carry their own target.
 */
function extractGates(l: RoomLayout): GateNode[] {
  const out: GateNode[] = [];
  const sp = l.spawns.default;
  for (const g of l.gates) {
    if (g.requires.length === 0) continue;
    const node: GateNode = {
      id: `${l.id}/gate:${g.char}`,
      room: l.id,
      kind: 'gate',
      name: g.char,
      requires: [...g.requires],
      target: '',
      from: 'default',
      opensOn: g.opensOn,
      hold: g.hold,
      teachGate: false,
    };
    if (!sp) {
      node.problem = 'room has no default spawn';
      out.push(node);
      continue;
    }
    // Near side: everything reachable from the spawn with every gate open except this one.
    const block = blockers(l, ALL, true);
    const w = l.width;
    const gateSet = new Set<number>();
    for (let i = 0; i < g.tiles.length; i += 2)
      gateSet.add((g.tiles[i + 1] as number) * w + (g.tiles[i] as number));
    for (const i of gateSet) block[i] = 1;
    const near = flood(l, block, sp.tx, sp.ty);
    const far: number[] = [];
    for (const i of gateSet) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= l.height || block[j] || near[j] || gateSet.has(j)) continue;
        far.push(nx, ny);
      }
    }
    if (far.length === 0) {
      node.problem =
        'the gate does not cut anything off from the spawn (nothing behind it, or a way around it)';
      out.push(node);
      continue;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < far.length; i += 2) {
      x0 = Math.min(x0, far[i] as number);
      x1 = Math.max(x1, far[i] as number);
      y0 = Math.min(y0, far[i + 1] as number);
      y1 = Math.max(y1, far[i + 1] as number);
    }
    const ts = l.tileSize;
    node.target = `rect:${x0 * ts},${y0 * ts},${(x1 - x0 + 1) * ts},${(y1 - y0 + 1) * ts}`;
    node.derived = `far side of gate ${g.char}: tiles x ${x0}-${x1}, y ${y0}-${y1}`;
    out.push(node);
  }
  for (const [name, k] of Object.entries(l.locks)) {
    const node: GateNode = {
      id: `${l.id}/lock:${name}`,
      room: l.id,
      kind: 'lock',
      name,
      requires: [...k.requires],
      target: k.target,
      from: k.from ?? 'default',
      hold: k.hold,
      teachGate: k.teachGate,
      ...(k.region ? { region: k.region } : {}),
      ...(k.note ? { note: k.note } : {}),
    };
    if (!targetTiles(l, k.target)) node.problem = `unknown target "${k.target}"`;
    if (!l.spawns[node.from]) node.problem = `unknown spawn "${node.from}"`;
    out.push(node);
  }
  return out;
}

/** Layout cache (roomLayout builds closures; the solver asks often). */
const layoutCache = new Map<string, RoomLayout>();
export function layout(id: string): RoomLayout {
  let l = layoutCache.get(id);
  if (!l) {
    l = roomLayout(id);
    layoutCache.set(id, l);
  }
  return l;
}
