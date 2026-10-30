/**
 * One of our worlds (or one room) in the reference-level schema (docs/design/reference-levels/BRIEF.md), so it is
 * measured and drawn exactly like Hollow Knight's, Ori's and Nine Sols' first areas:
 *   npx tsx tools/reference/export-area.ts <world id | room id> [out.json]
 * Default out: docs/design/reference-levels/ours/<id>/area.json. Our px are the schema's px (pxPerUnit 1).
 * Then `tools/reference/area-svg.ts` draws it and `tools/reference/metrics.ts` measures it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ROOMS } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { WORLDS } from '../../src/scene/world';
import type { AreaEnemy, AreaFile, AreaRoom, AreaTerrain, AreaThing } from './schema';

/** Difficulty 1-5 of each creature kind for a first-timer, with the reason (memory/creatures.md, enemies.md). */
const DIFFICULTY: Record<string, [number, string, number]> = {
  // kind: [difficulty, why, contact damage in lights]
  carrier: [1, 'walks a line, no attack; harmless unless touched', 1],
  burrback: [2, 'ground ram with a tell and a winded beat; 5 hp', 1],
  lampwing: [2, 'flier: tell, committed dive at where she stood, climbs; 3 hp', 1],
  dangler: [2, 'drops from a ceiling on a thread when she passes under', 1],
  hawker: [3, 'flier that hunts her across the room', 1],
  web: [1, 'a web that holds her: a hazard, not a fighter', 1],
  oldBurrback: [4, 'mini-boss burrback: tougher ram, more hp', 2],
  weaver: [5, 'boss: three phases in a web arena', 2],
  gloamweaver: [5, 'boss', 2],
  mantis: [5, 'boss duel', 2],
};

/** Each of our worlds' critical path, room by room (the rooms on the way to its end). */
const CRITICAL: Record<string, string[]> = {
  // v2 / v3 (2026-10-30): the claws in the west and back by the upper limbs, the Grove behind them, up the Spire to the
  // crown's glide, over the gap and down into the Crossing, through the seed door to the den and out.
  canopy: [
    'cn-hatch',
    'cn-hub',
    'cn-trunk',
    'cn-well',
    'cn-limbs',
    'cn-hub',
    'cn-fork',
    'cn-grove',
    'cn-spire',
    'cn-bower',
    'cn-crown',
    'cn-bower',
    'cn-gap',
    'cn-hub',
    'cn-tunnel',
    'cn-den',
    'cn-out',
  ],
};

/** Each world's rooms whose way in is hidden (a rotten panel, a plug, a cover): all they hold is a secret. */
const HIDDEN_ROOMS: Record<string, string[]> = {
  // v3: the two branches behind rotten bark (the rot branch past the giant's panel, the cellar branch past the
  // fork's), and the pockets behind walls, covers and panels.
  canopy: [
    'cn-rot',
    'cn-crawl',
    'cn-webs',
    'cn-elder',
    'cn-cellar',
    'cn-galleries',
    'cn-larder',
    'cn-hollowroot',
    'cn-nook',
    'cn-sky',
    'cn-burrow',
    'cn-ledge',
  ],
};

const glyph = (kind: string) => DIFFICULTY[kind] ?? [3, 'unknown kind', 1];

function rect(x: number, y: number, w: number, h: number): number[][] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function exportRoom(room: Room, ox: number, oy: number, out: AreaFile): void {
  const id = room.id;
  const r = room as Room & Record<string, unknown>;
  const t = (kind: AreaTerrain['kind'], x: number, y: number, w: number, h: number) =>
    out.terrain.push({ roomId: id, kind, poly: rect(ox + x, oy + y, w, h) });
  for (const s of room.solids) t('solid', s.x, s.y, s.w, s.h);
  // (Sealed air behind the Canopy's walls, r9: carved for the frame, never reached; rock on the map and in the measures.)
  const sealed =
    (r.marks as { sealed?: Array<{ x: number; y: number; w: number; h: number }> } | undefined)?.sealed ?? [];
  for (const s of sealed) t('solid', s.x, s.y, s.w, s.h);
  for (const o of room.oneWays) t('oneway', o.x, o.y, o.w, 0);
  for (const h of (r.thorns as Array<{ x: number; y: number; w: number; h: number }>) ?? [])
    t('hazard', h.x, h.y, h.w, h.h);
  for (const b of (r.bark as Array<{ x: number; y: number; w: number; h: number }>) ?? [])
    t('breakable', b.x, b.y, b.w, b.h);
  for (const g of (r.gates as Array<{ x: number; y: number; w: number; h: number }>) ?? [])
    t('door', g.x, g.y, g.w, g.h);
  for (const g of (r.shortcuts as Array<{ x: number; y: number; w: number; h: number }>) ?? [])
    t('door', g.x, g.y, g.w, g.h);

  const th = (kind: AreaThing['kind'], tid: string, x: number, y: number, value?: string) => {
    const thing: AreaThing = { id: `${id}:${tid}`, roomId: id, kind, at: [ox + x, oy + y], src: 'files' };
    if (value) thing.value = value;
    out.things.push(thing);
  };
  const cx = (b: { x: number; y: number; w?: number; h?: number }): [number, number] => [
    b.x + (b.w ?? 0) / 2,
    b.y + (b.h ?? 0) / 2,
  ];
  for (const p of room.pickups ?? [])
    th(p.kind === 'great' ? 'pickup-major' : 'pickup-minor', p.id, p.x, p.y, p.kind);
  for (const p of room.pods ?? []) th('breakable', p.id, p.x, p.y, `pod ${p.hp ?? 1}hp`);
  for (const g of (r.glades as Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    ability: string;
  }>) ?? [])
    th('pickup-major', g.id, ...cx(g), `ability:${g.ability}`);
  for (const h of (r.hollows as Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    upgrade: string;
  }>) ?? [])
    th('pickup-major', h.id, ...cx(h), `upgrade:${h.upgrade}`);
  for (const s of (r.moonseeds as Array<{ id: string; x: number; y: number }>) ?? [])
    th('pickup-major', s.id, s.x, s.y, 'key');
  for (const m of (r.mothStones as Array<{ id: string; x: number; y: number }>) ?? [])
    th('pickup-major', m.id, m.x, m.y, 'map');
  for (const p of (r.patches as Array<{ id: string; x: number; y: number }>) ?? [])
    th('save', p.id, p.x, p.y);
  for (const s of (r.signs as Array<{ id: string; x: number; y: number }>) ?? []) th('lore', s.id, s.x, s.y);
  for (const l of (r.lures as Array<{ id: string; kind: string; x: number; y: number }>) ?? [])
    th('lever', l.id, l.x, l.y, `lamp:${l.kind}`);
  for (const l of [...(room.lanterns ?? []), ...(room.lamps ?? [])]) th('lever', l.id, l.x, l.y, 'lantern');
  for (const c of (r.caps as Array<{ id: string; x: number; y: number; w: number; h: number }>) ?? [])
    th('landmark', c.id, ...cx(c), 'bounce cap');
  if (room.heart) th('landmark', 'heart', room.heart.x, room.heart.y, 'goal');

  for (const e of room.enemies ?? []) {
    const [difficulty, why, damage] = glyph(e.kind);
    const en: AreaEnemy = {
      id: `${id}:${e.id}`,
      roomId: id,
      kind: e.kind,
      at: [ox + e.x, oy + e.y],
      hp: (e as { hp?: number }).hp ?? 0,
      contactDamage: damage,
      behaviour: why,
      difficulty,
      src: 'files',
    };
    const radius = (e as { radius?: number }).radius;
    if (radius) en.patrol = radius;
    out.enemies.push(en);
  }
  const boss = (r.boss as { kind?: string; x?: number; y?: number } | undefined) ?? undefined;
  if (boss?.kind) {
    const [difficulty, why, damage] = glyph(boss.kind);
    out.enemies.push({
      id: `${id}:boss`,
      roomId: id,
      kind: boss.kind,
      at: [ox + (boss.x ?? room.width / 2), oy + (boss.y ?? room.height / 2)],
      hp: 0,
      contactDamage: damage,
      behaviour: why,
      difficulty,
      src: 'files',
    });
  }
}

export function exportArea(target: string): AreaFile {
  const out: AreaFile = {
    game: 'Lampfall',
    area: target,
    sources: ['our files: content/rooms, content/worlds'],
    units: { native: 'our px', pxPerUnit: 1, viewNative: [1920, 1080], how: 'identity' },
    hero: { box: [40, 80], run: 576, jump: 272, startAbilities: [], abilityOrder: [] },
    rooms: [],
    terrain: [],
    things: [],
    enemies: [],
    criticalPath: [],
  };
  const world = WORLDS[target];
  const placed: Array<{ room: Room; x: number; y: number }> = world
    ? Object.values(world.rooms)
        .filter((r) => r.placed)
        .map((r) => ({ room: r.scene as Room, x: r.x, y: r.y }))
    : [{ room: ROOMS[target] as Room, x: 0, y: 0 }];
  if (!placed[0]?.room) throw new Error(`No world or room "${target}"`);
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  for (const { room, x, y } of placed) {
    const ox = x - minX;
    const oy = y - minY;
    const exits = (room.exits ?? []).map((e) => {
      const ex: AreaRoom['exits'][number] = { to: e.id, side: e.edge, at: [ox, oy] };
      if (e.oneWay) ex.oneWay = true;
      return ex;
    });
    out.rooms.push({
      id: room.id,
      name: room.title ?? room.id,
      rect: [ox, oy, room.width, room.height],
      screens: +((room.width * room.height) / (1920 * 1080)).toFixed(2),
      shape: 'hall',
      onCriticalPath: (CRITICAL[target] ?? []).includes(room.id),
      exits,
    });
    exportRoom(room, ox, oy, out);
  }
  out.criticalPath = CRITICAL[target] ?? [];
  // Our secrets: what a cover hides, behind rotten bark (a wall or a floor panel), or a hollow (a hidden upgrade).
  for (const { room, x, y } of placed) {
    const covers =
      (room.marks as { covers?: Array<{ x: number; y: number; w: number; h: number }> } | undefined)
        ?.covers ?? [];
    const ox = x - minX;
    const oy = y - minY;
    for (const t of out.things) {
      if (t.roomId !== room.id) continue;
      const [tx, ty] = t.at;
      const under = covers.some(
        (c) => tx >= ox + c.x && tx <= ox + c.x + c.w && ty >= oy + c.y && ty <= oy + c.y + c.h,
      );
      const room2 = (HIDDEN_ROOMS[target] ?? []).includes(room.id);
      if (under || room2 || (t.value ?? '').startsWith('upgrade:'))
        t.hidden = { how: under ? 'behind a cover' : room2 ? 'in a hidden room' : 'a hollow' };
    }
  }
  const first = placed[0].room;
  out.hero.startAbilities = [...(first.abilities ?? ['glide', 'wallJump', 'doubleJump', 'dash'])];
  return out;
}

if (process.argv[1]?.endsWith('export-area.ts')) {
  const target = process.argv[2];
  if (!target) throw new Error('usage: export-area.ts <world | room> [out.json]');
  const path = process.argv[3] ?? `docs/design/reference-levels/ours/${target}/area.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(exportArea(target), null, 1)}\n`);
  console.log(`wrote ${path}`);
}
