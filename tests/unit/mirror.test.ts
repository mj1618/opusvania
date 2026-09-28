import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { TapeFile } from '../../src/debug/tape';
import { formatInputScript, parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { presetTuning } from '../../src/sim/tuning';
import {
  type Abilities,
  buildRoom,
  GYM_ROOMS,
  getRoom,
  mirrorRoomFile,
  registerRoom,
} from '../../src/sim/world/rooms';

const DIR = join(__dirname, '../replays');
const TAPES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as TapeFile);

/** Per-frame player snapshots of a tape run under the opus preset. */
function playerTrace(room: string, abilities: Abilities, inputs: string): GameState['player'][] {
  const t = presetTuning('opus');
  const s = createState({ seed: 1, roomId: room }, t);
  Object.assign(s.player.abilities, abilities);
  const out: GameState['player'][] = [];
  for (const m of parseInputScript(inputs)) {
    const evs: SimEvent[] = [];
    step(s, m, t, evs);
    out.push(JSON.parse(JSON.stringify(s.player)));
  }
  return out;
}

/** V22: mirrored inputs in the mirrored room give an exactly mirrored trajectory, every frame. */
describe('V22 mirror symmetry', () => {
  const L = ActionBit.left;
  const R = ActionBit.right;
  const mirrorMask = (m: number) => (m & ~(L | R)) | (m & L ? R : 0) | (m & R ? L : 0);

  // Golden tapes plus a seeded random tape per room (exercises every move, deaths included).
  let seed = 4242;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const btns = ['R', 'L', 'R+J', 'L+J', 'J', 'X', 'R+X', 'L+X', 'D', 'U', '.', 'D+A', 'R+D+A', 'D+J'];
  const randomTape = () =>
    Array.from(
      { length: 80 },
      () => `${btns[Math.floor(rnd() * btns.length)]}${1 + Math.floor(rnd() * 16)}`,
    ).join(' ');

  for (const id of GYM_ROOMS) {
    it(id, () => {
      const room = getRoom(id);
      if (room.padX !== 0) throw new Error(`${id} is padded`);
      // Copies without `next`, so reaching G doesn't transition into an unmirrored room.
      const o = registerRoom(buildRoom({ ...room.file, id: `${id}~o`, next: undefined }));
      const m = registerRoom(buildRoom(mirrorRoomFile({ ...room.file, next: undefined })));
      const W = room.width * 64;
      const tapes = [...TAPES.filter((t) => t.room === id).map((t) => t.inputs), randomTape()];
      for (const tape of tapes) {
        const masks = parseInputScript(tape);
        const mirrored = formatInputScript(masks.map(mirrorMask));
        const abilities = { ...room.abilities, dash: true, doubleJump: true, pogo: true, wallJump: true };
        const a = playerTrace(o.id, abilities, tape);
        const b = playerTrace(m.id, abilities, mirrored);
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          const q = b[i];
          if (!p || !q) throw new Error('trace length mismatch');
          const ok =
            q.x === W - p.x - p.w &&
            q.y === p.y &&
            q.vx === -p.vx &&
            q.vy === p.vy &&
            q.state === p.state &&
            q.facing === -p.facing &&
            q.grounded === p.grounded;
          if (!ok)
            throw new Error(
              `${id} frame ${i + 1}: ${JSON.stringify({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, s: p.state })} vs mirrored ${JSON.stringify({ x: W - q.x - q.w, y: q.y, vx: -q.vx, vy: q.vy, s: q.state })}`,
            );
        }
      }
    });
  }
});
