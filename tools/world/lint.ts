/**
 * World lint (level-toolchain §2.4 item 6, A5 subset): overlaps, room sizes, edge openings and
 * whether they meet an opening in the neighbouring room, and gravity-free connectivity (air or
 * entities the spawn can never reach, even flying).
 */
import type { RoomFile } from '../../src/sim/world/room-schema';
import type { CompileResult } from './compile';
import type { LevelModel } from './model';

export type Side = 'n' | 's' | 'e' | 'w';

export interface Opening {
  room: string;
  side: Side;
  /** Span along the edge, tiles in room coordinates (x for n/s, y for e/w), inclusive. */
  from: number;
  to: number;
  /** The room on the other side (every tile of the span opens into it), or undefined. */
  into?: string;
  /** Every outside tile of the span is non-solid in `into`. */
  matched: boolean;
}

const SCREEN = { w: 30, h: 17 };
const MAX = { w: 240, h: 68 };
const SEAM_MAX = 8;
const SEAM_FLAT = 3;

function tileAtWorld(models: LevelModel[], wx: number, wy: number): { m: LevelModel; v: number } | undefined {
  for (const m of models) {
    const x = wx - m.at[0];
    const y = wy - m.at[1];
    if (x >= 0 && y >= 0 && x < m.size[0] && y < m.size[1])
      return { m, v: m.collision[y * m.size[0] + x] as number };
  }
  return undefined;
}

/** Non-solid spans on every room border, and where they lead. */
export function openings(models: LevelModel[]): Opening[] {
  const out: Opening[] = [];
  for (const m of models) {
    const [W, H] = m.size;
    const sides: [Side, number, (i: number) => [number, number], [number, number]][] = [
      ['n', W, (i) => [i, 0], [0, -1]],
      ['s', W, (i) => [i, H - 1], [0, 1]],
      ['w', H, (i) => [0, i], [-1, 0]],
      ['e', H, (i) => [W - 1, i], [1, 0]],
    ];
    for (const [side, n, at, [ox, oy]] of sides) {
      let i = 0;
      while (i < n) {
        const [x, y] = at(i);
        if (m.collision[y * W + x] === 1) {
          i++;
          continue;
        }
        const from = i;
        let into: string | undefined;
        let matched = true;
        let first = true;
        while (i < n) {
          const [cx, cy] = at(i);
          if (m.collision[cy * W + cx] === 1) break;
          const t = tileAtWorld(models, m.at[0] + cx + ox, m.at[1] + cy + oy);
          const id = t?.m.id;
          if (first) into = id;
          else if (id !== into) break;
          first = false;
          if (!t || t.v === 1) matched = false;
          i++;
        }
        out.push({ room: m.id, side, from, to: i - 1, into, matched: matched && into !== undefined });
      }
    }
  }
  return out;
}

/** Gravity-free reachability from the spawn over the compiled rows (# and plates are walls). */
export function flood(room: RoomFile): { seen: Uint8Array; w: number; h: number } {
  const rows = room.rows;
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const walls = new Set(['#', ...Object.keys(room.plates ?? {})]);
  const seen = new Uint8Array(w * h);
  const start = rows.join('').indexOf('P');
  if (start < 0) return { seen, w, h };
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j] || walls.has(rows[ny]?.[nx] ?? '#')) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return { seen, w, h };
}

export function lintWorld(
  models: LevelModel[],
  res: CompileResult,
): { errors: string[]; warnings: string[]; openings: Opening[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < models.length; i++)
    for (let j = i + 1; j < models.length; j++) {
      const a = models[i] as LevelModel;
      const b = models[j] as LevelModel;
      if (
        a.at[0] < b.at[0] + b.size[0] &&
        b.at[0] < a.at[0] + a.size[0] &&
        a.at[1] < b.at[1] + b.size[1] &&
        b.at[1] < a.at[1] + a.size[1]
      )
        errors.push(`${a.id} and ${b.id} overlap in the world`);
    }
  for (const m of models) {
    const [w, h] = m.size;
    if (!m.fields.draft && (m.at[0] % SCREEN.w || m.at[1] % SCREEN.h || w % SCREEN.w || h % SCREEN.h))
      warnings.push(
        `${m.id}: position ${m.at} / size ${w}x${h} are not whole ${SCREEN.w}x${SCREEN.h} cells (north star §3.3)`,
      );
    if (w < SCREEN.w || h < SCREEN.h)
      warnings.push(
        `${m.id}: ${w}x${h} is under one screen (${SCREEN.w}x${SCREEN.h}); the sim pads it with solid`,
      );
    if (w > MAX.w || h > MAX.h) warnings.push(`${m.id}: ${w}x${h} is over ${MAX.w}x${MAX.h} (8 x 4 screens)`);
  }
  const ops = openings(models);
  const byId = new Map(models.map((m) => [m.id, m]));
  for (const o of ops) {
    if (o.matched) {
      // North star §3.3 (X2, X4): seams sit at necks (<= 8 tiles) and the floor is flat for 3
      // tiles either side of an east/west seam.
      const n = o.to - o.from + 1;
      if (n > SEAM_MAX)
        warnings.push(`${o.room}: ${o.side} seam is ${n} tiles wide (seams sit at necks <= ${SEAM_MAX})`);
      const m = byId.get(o.room) as LevelModel;
      if (o.side === 'e' || o.side === 'w') {
        const [W, H] = m.size;
        const floor = o.to + 1;
        for (let k = 0; k < SEAM_FLAT; k++) {
          const x = o.side === 'e' ? W - 1 - k : k;
          const flat = floor < H && m.collision[floor * W + x] === 1 && m.collision[o.to * W + x] !== 1;
          if (!flat) {
            warnings.push(
              `${o.room}: floor is not flat for ${SEAM_FLAT} tiles at the ${o.side} seam (y ${o.from}-${o.to}; column ${x})`,
            );
            break;
          }
        }
      }
      continue;
    }
    const span = `${o.side === 'n' || o.side === 's' ? 'x' : 'y'} ${o.from}-${o.to}`;
    warnings.push(
      `${o.room}: ${{ n: 'north', s: 'south', e: 'east', w: 'west' }[o.side]} edge opening (${span}) ${o.into ? `meets solid in ${o.into}` : 'leads out of the world'}`,
    );
  }
  for (const room of res.bundle.rooms) {
    const { seen, w, h } = flood(room);
    let lost = 0;
    const marks: string[] = [];
    const special = new Set([
      'G',
      'g',
      'R',
      '+',
      ...Object.keys(room.doors ?? {}),
      ...Object.keys(room.pickups ?? {}),
      ...Object.keys(room.rests ?? {}),
    ]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ch = room.rows[y]?.[x] ?? '#';
        if (ch === '#' || seen[y * w + x]) continue;
        if (special.has(ch)) marks.push(`"${ch}" at ${x},${y}`);
        else if (ch === '.') lost++;
      }
    if (marks.length) errors.push(`${room.id}: unreachable from the spawn even flying: ${marks.join(', ')}`);
    if (lost) warnings.push(`${room.id}: ${lost} air tiles are sealed off from the spawn`);
  }
  return { errors, warnings, openings: ops };
}
