/**
 * Compiler: LevelModels (baked) -> today's RoomFile (level-toolchain §2.4 item 3, §2.6), so the
 * sim, bot, progression validator, tapes and dressing run world rooms unchanged. Characters for
 * doors, sources, plates, gates, enemies, pickups and rests are allocated per room (entities may
 * pin one with `char`); door targets are resolved across the whole world by door NAME. Edge exits
 * come from the world layout: every border opening that meets an equal opening in the next room.
 */

import { defaultTuning } from '../../src/sim/tuning';
import { type RoomFile, RoomFileSchema, TILE_CHARS } from '../../src/sim/world/room-schema';
import { openings } from './lint';
import { ENUMS, type Ent, type LevelModel, TILE_CHAR } from './model';

/** Characters the compiler may allocate (tile chars, P R G g +, quotes, backslash and space excluded). */
export const CHAR_POOL = [
  ...'123456789ABCDEFHIJKLMNOQSTUVWXYZabcdefhijklmnpqrstuwxyz0',
  ..."!$%&*-/:;?@[]_{}|~(),'`",
].filter((c) => !(c in TILE_CHARS));

export interface WorldRoomInfo {
  /** World position and size, tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  draft: boolean;
}

export interface CompiledWorld {
  note: string;
  world: Record<string, WorldRoomInfo>;
  rooms: RoomFile[];
}

export interface CompileResult {
  bundle: CompiledWorld;
  errors: string[];
  warnings: string[];
  /** Per room: entity index -> allocated char (for tools). */
  chars: Map<string, Map<number, string>>;
}

const CHAR_KINDS = new Set(['door', 'source', 'plate', 'gate', 'enemy', 'pickup', 'rest']);

/** Sim padding for rooms under the minimum size (same formula as buildRoom). */
export function padding(w: number, h: number): [number, number] {
  const W = Math.max(w, defaultTuning.world.minRoomW);
  const H = Math.max(h, defaultTuning.world.minRoomH);
  return [Math.floor((W - w) / 2), Math.ceil((H - h) / 2)];
}

const defKey = (e: Ent): string => {
  const { char: _c, ...rest } = e.props;
  return `${e.kind}:${JSON.stringify(rest)}`;
};

/** Allocates chars: pinned first, then per entity (enemies share one char per type). */
function allocate(m: LevelModel, err: (s: string) => void): Map<number, string> {
  const out = new Map<number, string>();
  const byChar = new Map<string, string>();
  m.entities.forEach((e, i) => {
    if (!CHAR_KINDS.has(e.kind)) return;
    const c = e.props.char;
    if (typeof c !== 'string') return;
    if (c in TILE_CHARS || c === ' ' || c === '"' || c === '\\') {
      err(`${m.id}: entities[${i}] ${e.kind} pins reserved char "${c}"`);
      return;
    }
    const k = defKey(e);
    const had = byChar.get(c);
    if (had !== undefined && (had !== k || e.kind === 'door'))
      err(`${m.id}: char "${c}" is pinned by two different ${e.kind === 'door' ? 'doors' : 'entities'}`);
    byChar.set(c, k);
    out.set(i, c);
  });
  const pool = CHAR_POOL.filter((c) => !byChar.has(c));
  const shared = new Map<string, string>();
  m.entities.forEach((e, i) => {
    if (!CHAR_KINDS.has(e.kind) || out.has(i)) return;
    const k = defKey(e);
    if (e.kind === 'enemy' && shared.has(k)) {
      out.set(i, shared.get(k) as string);
      return;
    }
    const c = pool.shift();
    if (!c) {
      err(`${m.id}: out of RoomFile characters (${CHAR_POOL.length}); split the room or move to RoomFile v2`);
      return;
    }
    shared.set(k, c);
    out.set(i, c);
  });
  return out;
}

const nonEmpty = <T>(a: T[] | undefined): T[] | undefined => (a && a.length > 0 ? a : undefined);
const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

function compileRoom(
  m: LevelModel,
  chars: Map<number, string>,
  err: (s: string) => void,
  warn: (s: string) => void,
): RoomFile & { doorRefs: Record<string, { to: string; toDoor?: string }> } {
  const [W, H] = m.size;
  const [padX, padY] = padding(W, H);
  const TS = defaultTuning.world.tileSize;
  const rows = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => TILE_CHAR[m.collision[y * W + x] as number] ?? '#'),
  );
  const owner = new Int32Array(W * H).fill(-1);
  const place = (i: number, e: Ent, ch: string, point: boolean) => {
    const [x, y, w, h] = e.rect;
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) {
          err(`${m.id}: entities[${i}] ${e.kind} at ${tx},${ty} is outside the room`);
          continue;
        }
        const o = owner[ty * W + tx] as number;
        if (o >= 0)
          err(
            `${m.id}: entities[${i}] ${e.kind} and entities[${o}] ${m.entities[o]?.kind} overlap at ${tx},${ty}`,
          );
        const under = m.collision[ty * W + tx];
        if (point && under !== 0)
          err(
            `${m.id}: entities[${i}] ${e.kind} at ${tx},${ty} is inside collision (${TILE_CHAR[under as number]})`,
          );
        else if (!point && e.kind !== 'plate' && under !== 0)
          warn(`${m.id}: entities[${i}] ${e.kind} rect covers collision at ${tx},${ty} (the entity wins)`);
        owner[ty * W + tx] = i;
        (rows[ty] as string[])[tx] = ch;
      }
  };
  const doors: Record<string, { to: string; spawn?: string }> = {};
  const doorRefs: Record<string, { to: string; toDoor?: string }> = {};
  const sources: Record<string, unknown> = {};
  const plates: Record<string, unknown> = {};
  const gates: Record<string, unknown> = {};
  const enemies: Record<string, string> = {};
  const pickups: Record<string, unknown> = {};
  const rests: Record<string, unknown> = {};
  const prompts: unknown[] = [];
  const cameraZones: unknown[] = [];
  const landmarks: unknown[] = [];
  const locks: Record<string, unknown> = {};
  const doorNames = new Set<string>();
  let spawns = 0;
  m.entities.forEach((e, i) => {
    const p = e.props;
    const ch = chars.get(i) ?? '?';
    const [x, y, w, h] = e.rect;
    switch (e.kind) {
      case 'spawn':
        spawns++;
        place(i, e, 'P', true);
        break;
      case 'respawn':
        place(i, e, 'R', true);
        break;
      case 'goal':
        place(i, e, p.optional ? 'g' : 'G', true);
        break;
      case 'corner':
        place(i, e, '+', true);
        break;
      case 'door': {
        const name = String(p.name);
        if (doorNames.has(name)) err(`${m.id}: two doors named "${name}"`);
        doorNames.add(name);
        place(i, e, ch, true);
        doors[ch] = { to: String(p.to) };
        doorRefs[ch] = clean({ to: String(p.to), toDoor: p.toDoor as string | undefined });
        break;
      }
      case 'source':
        place(i, e, ch, false);
        sources[ch] = clean({ sound: p.sound, colour: p.colour, locked: p.locked ? true : undefined });
        break;
      case 'plate':
        place(i, e, ch, false);
        plates[ch] = clean({ pressedBy: nonEmpty(p.pressedBy as string[]) });
        break;
      case 'gate':
        place(i, e, ch, false);
        gates[ch] = clean({
          opensOn: p.opensOn,
          requires: nonEmpty(p.requires as string[]),
          hold: p.hold,
          moves: nonEmpty(p.moves as string[]),
        });
        break;
      case 'enemy':
        place(i, e, ch, true);
        enemies[ch] = String(p.type);
        break;
      case 'pickup':
        place(i, e, ch, true);
        pickups[ch] = clean({ grants: p.grants, id: p.id });
        if (!(p.grants as string[]).length) err(`${m.id}: entities[${i}] pickup grants nothing`);
        break;
      case 'rest':
        place(i, e, ch, true);
        rests[ch] = clean({ name: p.name });
        break;
      case 'prompt':
        prompts.push(clean({ at: [x, y], keys: p.keys, until: p.until, near: p.near }));
        break;
      case 'camera': {
        const pts = (p.shot as [number, number][] | undefined) ?? [];
        let shot: unknown;
        if (pts.length === 2) {
          const [a = [0, 0], b = [0, 0]] = pts;
          const sx = Math.min(a[0], b[0]);
          const sy = Math.min(a[1], b[1]);
          shot = clean({
            rect: [sx, sy, Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1],
            zoom: p.shotZoom,
            hold: p.hold,
            repeat: p.repeat ? true : undefined,
          });
        } else if (pts.length) err(`${m.id}: entities[${i}] camera shot needs exactly 2 corner points`);
        for (const [k, v] of [
          ['zoom', p.zoom],
          ['shotZoom', p.shotZoom],
        ] as const)
          if (typeof v === 'number' && (v < 0.75 || v > 1.1))
            err(`${m.id}: entities[${i}] camera ${k} ${v} is outside 0.75-1.1 (north-star §3.1)`);
        cameraZones.push(
          clean({ rect: [x, y, w, h], mode: p.mode, value: p.value, zoom: p.zoom, weight: p.weight, shot }),
        );
        break;
      }
      case 'lock': {
        const name = String(p.name);
        if (name in locks) err(`${m.id}: two locks named "${name}"`);
        const target =
          (p.target as string | undefined) ??
          `rect:${(x + padX) * TS},${(y + padY) * TS},${w * TS},${h * TS}`;
        locks[name] = clean({
          target,
          from: p.from,
          prelude: p.prelude,
          requires: p.requires,
          moves: nonEmpty(p.moves as string[]),
          hold: p.hold,
          teachGate: p.teachGate,
          region: p.region,
          note: p.note,
        });
        break;
      }
      case 'landmark':
        landmarks.push(clean({ name: String(p.name), rect: [x, y, w, h], beacon: p.beacon, depth: p.depth }));
        break;
    }
  });
  if (spawns !== 1) err(`${m.id}: needs exactly one spawn entity (has ${spawns})`);
  const f = m.fields;
  const ab = new Set(f.abilities as string[]);
  let claims: unknown;
  if (typeof f.claims === 'string' && f.claims.trim()) {
    try {
      claims = JSON.parse(f.claims);
    } catch (x) {
      err(`${m.id}: level field claims is not JSON (${(x as Error).message})`);
    }
  }
  const room = clean({
    id: m.id,
    name: (f.name as string) || m.id,
    abilities: Object.fromEntries(ENUMS.Ability.map((a) => [a, ab.has(a)])),
    rows: rows.map((r) => r.join('')),
    hazard: f.hazard,
    spawnGrace: f.spawnGrace || undefined,
    next: f.next,
    doors: Object.keys(doors).length ? doors : undefined,
    sources: Object.keys(sources).length ? sources : undefined,
    plates: Object.keys(plates).length ? plates : undefined,
    gates: Object.keys(gates).length ? gates : undefined,
    enemies: Object.keys(enemies).length ? enemies : undefined,
    pickups: Object.keys(pickups).length ? pickups : undefined,
    rests: Object.keys(rests).length ? rests : undefined,
    locks: Object.keys(locks).length ? locks : undefined,
    prompts: prompts.length ? prompts : undefined,
    cameraZones: cameraZones.length ? cameraZones : undefined,
    landmarks: landmarks.length ? landmarks : undefined,
    claims,
    notes: f.notes || undefined,
  });
  return { ...(room as unknown as RoomFile), doorRefs };
}

/**
 * Compiles every level. `external` = rooms outside the LDtk world (the ASCII gym/hub rooms) that
 * doors may lead to; their door chars are the `toDoor` names.
 */
export function compileWorld(models: LevelModel[], external: Map<string, RoomFile>): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (s: string) => errors.push(s);
  const warn = (s: string) => warnings.push(s);
  const chars = new Map<string, Map<number, string>>();
  const compiled = new Map<string, ReturnType<typeof compileRoom>>();
  for (const m of models) {
    if (compiled.has(m.id)) err(`duplicate room id ${m.id}`);
    if (external.has(m.id)) err(`room id ${m.id} is also an ASCII room in content/gym`);
    const c = allocate(m, err);
    chars.set(m.id, c);
    compiled.set(m.id, compileRoom(m, c, err, warn));
  }
  // Door targets by name.
  const doorChar = (roomId: string, name: string): string | undefined => {
    const m = models.find((x) => x.id === roomId);
    if (!m) return undefined;
    const i = m.entities.findIndex((e) => e.kind === 'door' && e.props.name === name);
    return i >= 0 ? chars.get(roomId)?.get(i) : undefined;
  };
  const exits = edgeExits(models, err);
  const rooms: RoomFile[] = [];
  for (const [id, r] of compiled) {
    const { doorRefs, ...room } = r;
    for (const [ch, ref] of Object.entries(doorRefs)) {
      const door = room.doors?.[ch] as { to: string; spawn?: string };
      if (compiled.has(ref.to)) {
        if (ref.toDoor !== undefined) {
          const c = doorChar(ref.to, ref.toDoor);
          if (!c) err(`${id}: door "${ch}" leads to ${ref.to} door "${ref.toDoor}", which does not exist`);
          else door.spawn = c;
        }
      } else if (external.has(ref.to)) {
        const ext = external.get(ref.to) as RoomFile;
        if (ref.toDoor !== undefined) {
          if (!(ref.toDoor in (ext.doors ?? {})))
            err(
              `${id}: door "${ch}" leads to ${ref.to} door "${ref.toDoor}", which is not one of its door chars`,
            );
          else door.spawn = ref.toDoor;
        }
      } else err(`${id}: door "${ch}" leads to unknown room "${ref.to}"`);
    }
    if (room.next && !compiled.has(room.next) && !external.has(room.next))
      err(`${id}: next "${room.next}" is not a room`);
    const ex = exits.get(id);
    if (ex?.length) (room as RoomFile & { exits: unknown }).exits = ex;
    const parsed = RoomFileSchema.safeParse(room);
    if (!parsed.success)
      for (const i of parsed.error.issues) err(`${id}: RoomFile ${i.path.join('.')}: ${i.message}`);
    rooms.push(room as RoomFile);
  }
  const world: Record<string, WorldRoomInfo> = {};
  for (const m of models)
    world[m.id] = { x: m.at[0], y: m.at[1], w: m.size[0], h: m.size[1], draft: m.fields.draft === true };
  return {
    bundle: {
      note: 'GENERATED by `npm run world -- build` from content/world.ldtk. Do not edit; see memory/level-authoring.md.',
      world,
      rooms,
    },
    errors,
    warnings,
    chars,
  };
}

const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' } as const;

/**
 * Edge exits: a border opening becomes an exit when the room on the other side has the mirror
 * opening over exactly the same tiles (both lint-matched). Rooms with exits must not be padded.
 */
function edgeExits(
  models: LevelModel[],
  err: (s: string) => void,
): Map<string, NonNullable<RoomFile['exits']>> {
  const out = new Map<string, NonNullable<RoomFile['exits']>>();
  const ops = openings(models).filter((o) => o.matched);
  const byId = new Map(models.map((m) => [m.id, m]));
  const MIN_W = defaultTuning.world.minRoomW;
  const MIN_H = defaultTuning.world.minRoomH;
  for (const o of ops) {
    const a = byId.get(o.room) as LevelModel;
    const b = byId.get(o.into as string) as LevelModel;
    const horiz = o.side === 'n' || o.side === 's';
    const shift = horiz ? a.at[0] - b.at[0] : a.at[1] - b.at[1];
    const opp = OPPOSITE[o.side];
    const back = ops.find(
      (x) => x.room === b.id && x.side === opp && x.from === o.from + shift && x.to === o.to + shift,
    );
    if (!back) continue; // spans differ: lint already warns about the other side
    for (const m of [a, b])
      if (m.size[0] < MIN_W || m.size[1] < MIN_H)
        err(
          `${m.id}: rooms with edge exits must be at least ${MIN_W}x${MIN_H} tiles (the sim pads smaller rooms)`,
        );
    const list = out.get(a.id) ?? [];
    list.push({
      side: o.side,
      from: o.from,
      to: o.to,
      room: b.id,
      offset: [b.at[0] - a.at[0], b.at[1] - a.at[1]],
      spawn: `edge-${opp}${back.from}`,
    });
    out.set(a.id, list);
  }
  return out;
}

/** The bundle as JSON: one row per line, everything else compact. */
export function formatBundle(b: CompiledWorld): string {
  const lines = ['{', `  "note": ${JSON.stringify(b.note)},`, '  "world": {'];
  const ids = Object.keys(b.world);
  ids.forEach((id, i) => {
    lines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(b.world[id])}${i < ids.length - 1 ? ',' : ''}`);
  });
  lines.push('  },', '  "rooms": [');
  b.rooms.forEach((r, i) => {
    const { rows, ...rest } = r;
    const entries = Object.entries({ ...rest, rows });
    lines.push('    {');
    entries.forEach(([k, v], j) => {
      const comma = j < entries.length - 1 ? ',' : '';
      if (k === 'rows') {
        lines.push('      "rows": [');
        (v as string[]).forEach((row, n) => {
          lines.push(`        ${JSON.stringify(row)}${n < (v as string[]).length - 1 ? ',' : ''}`);
        });
        lines.push(`      ]${comma}`);
      } else lines.push(`      ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    });
    lines.push(`    }${i < b.rooms.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]', '}');
  return `${lines.join('\n')}\n`;
}
