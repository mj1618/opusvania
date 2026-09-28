/**
 * Ports an ASCII RoomFile (content/gym) to a room sheet: collision as exact rect brushes (a
 * greedy cover, so the bake reproduces every tile), every special character as an entity with
 * its char pinned. Compiling the result gives back the same rows and maps (tests/unit/world.test.ts).
 */
import { type RoomFile, RoomFileSchema } from '../../src/sim/world/room-schema';
import { padding } from './compile';
import { formatSheet, rectCover, TILE_NAMES } from './model';

const VALUE: Record<string, number> = { '#': 1, '=': 2, '^': 3, v: 4, '<': 5, '>': 6, o: 7 };
const TS = 64;

export function portRoom(input: RoomFile, id: string, at: [number, number]): Record<string, unknown> {
  const f = RoomFileSchema.parse(input);
  const rows = f.rows;
  const W = rows[0]?.length ?? 0;
  const H = rows.length;
  const [padX, padY] = padding(W, H);
  const ch = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const grid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[y * W + x] = VALUE[ch(x, y)] ?? 0;
  const air = grid.map((v) => (v === 0 ? 1 : 0));
  const brushes: unknown[] = [['fill']];
  for (const [x, y, w, h] of rectCover(air, W, H)) brushes.push(['rect', 'carve', [x, y, w, h]]);
  const others = grid.map((v) => (v > 1 ? v : 0));
  for (const [x, y, w, h, v] of rectCover(others, W, H)) {
    const tile = TILE_NAMES[v - 1];
    if (tile === 'oneWay' && h === 1) brushes.push(['oneway', [x, y], w]);
    else if (tile?.startsWith('spike')) brushes.push(['spikes', tile.slice(5).toLowerCase(), [x, y, w, h]]);
    else brushes.push(['rect', 'add', [x, y, w, h], { tile }]);
  }
  const entities: unknown[] = [];
  const point = (kind: string, x: number, y: number, props?: Record<string, unknown>) =>
    entities.push(props && Object.keys(props).length ? [kind, [x, y], props] : [kind, [x, y]]);
  const drop = (o: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
    );
  // Rect components (sources, plates, gates): must be solid rectangles of their char.
  const seen = new Uint8Array(W * H);
  const component = (x0: number, y0: number): [number, number, number, number] => {
    const c = ch(x0, y0);
    const stack = [x0, y0];
    let [ax, ay, bx, by, n] = [x0, y0, x0, y0, 0];
    seen[y0 * W + x0] = 1;
    while (stack.length) {
      const y = stack.pop() as number;
      const x = stack.pop() as number;
      n++;
      ax = Math.min(ax, x);
      ay = Math.min(ay, y);
      bx = Math.max(bx, x);
      by = Math.max(by, y);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || ch(nx, ny) !== c) continue;
        seen[ny * W + nx] = 1;
        stack.push(nx, ny);
      }
    }
    if (n !== (bx - ax + 1) * (by - ay + 1))
      throw new Error(`${f.id}: "${c}" at ${x0},${y0} is not a rectangle; port it by hand`);
    return [ax, ay, bx - ax + 1, by - ay + 1];
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = ch(x, y);
      if (c === 'P') point('spawn', x, y);
      else if (c === 'R') point('respawn', x, y);
      else if (c === 'G') point('goal', x, y);
      else if (c === 'g') point('goal', x, y, { optional: true });
      else if (c === '+') point('corner', x, y);
      else if (c in f.doors) {
        const d = f.doors[c] as { to: string; spawn?: string };
        point('door', x, y, drop({ name: c, to: d.to, toDoor: d.spawn, char: c }));
      } else if (c in f.enemies) point('enemy', x, y, { type: f.enemies[c], char: c });
      else if (c in f.pickups) {
        const p = f.pickups[c] as { grants: string[]; id?: string };
        point('pickup', x, y, drop({ grants: p.grants, id: p.id, char: c }));
      } else if (c in f.rests) point('rest', x, y, drop({ name: f.rests[c]?.name, char: c }));
      else if (!seen[y * W + x] && (c in f.sources || c in f.plates || c in f.gates)) {
        const r = component(x, y);
        if (c in f.sources) {
          const s = f.sources[c] as { sound: string; colour: string; locked: boolean };
          entities.push([
            'source',
            r,
            drop({ sound: s.sound, colour: s.colour, locked: s.locked || undefined, char: c }),
          ]);
        } else if (c in f.plates)
          entities.push(['plate', r, drop({ pressedBy: f.plates[c]?.pressedBy, char: c })]);
        else {
          const g = f.gates[c] as Record<string, unknown>;
          entities.push([
            'gate',
            r,
            drop({ ...g, opensOn: g.opensOn === 'plate' ? undefined : g.opensOn, char: c }),
          ]);
        }
      }
    }
  for (const p of f.prompts) {
    if (!Number.isInteger(p.at[0]) || !Number.isInteger(p.at[1]))
      throw new Error(`${f.id}: prompt at ${p.at} is not on a tile`);
    entities.push(['prompt', p.at, drop({ keys: p.keys, until: p.until, near: p.near })]);
  }
  for (const z of f.cameraZones)
    entities.push([
      'camera',
      z.rect,
      drop({ mode: z.mode === 'bounds' ? undefined : z.mode, value: z.value }),
    ]);
  for (const [name, l] of Object.entries(f.locks)) {
    const m = /^rect:(\d+),(\d+),(\d+),(\d+)$/.exec(l.target);
    const nums = m ? m.slice(1).map(Number) : [];
    const aligned = m && nums.every((n) => n % TS === 0);
    let rect = [0, 0, 1, 1];
    let target: string | undefined;
    if (aligned)
      rect = [
        (nums[0] as number) / TS - padX,
        (nums[1] as number) / TS - padY,
        (nums[2] as number) / TS,
        (nums[3] as number) / TS,
      ];
    else {
      target = l.target;
      const gy = rows.findIndex((r) => r.includes('G'));
      if (l.target === 'G' && gy >= 0) rect = [rows[gy]?.indexOf('G') as number, gy, 1, 1];
    }
    entities.push([
      'lock',
      rect,
      drop({
        name,
        requires: l.requires,
        target,
        from: l.from,
        prelude: l.prelude,
        moves: l.moves,
        hold: l.hold === 'reach' ? undefined : l.hold,
        teachGate: l.teachGate || undefined,
        region: l.region,
        note: l.note,
      }),
    ]);
  }
  const sheet: Record<string, unknown> = {
    id,
    at,
    size: [W, H],
    name: f.name,
    abilities: Object.entries(f.abilities)
      .filter(([, on]) => on)
      .map(([a]) => a),
    hazard: f.hazard === 'death' ? undefined : f.hazard,
    spawnGrace: f.spawnGrace || undefined,
    next: f.next,
    draft: true,
    claims: Object.keys(f.claims).length ? f.claims : undefined,
    notes: f.notes || undefined,
    brushes,
    entities,
  };
  return Object.fromEntries(Object.entries(sheet).filter(([, v]) => v !== undefined));
}

export const portRoomText = (input: RoomFile, id: string, at: [number, number]): string =>
  formatSheet(portRoom(input, id, at));
