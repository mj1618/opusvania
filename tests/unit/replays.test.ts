import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatInputScript, parseInputScript } from '../../src/input/script';
import { ActionBit } from '../../src/sim/input';
import { presetTuning } from '../../src/sim/tuning';
import { buildRoom, GYM_ROOMS, getRoom, mirrorRoomFile, registerRoom } from '../../src/sim/world/rooms';
import { type GoldenReplay, runGolden, tuningHash } from '../replays/golden';

const DIR = join(__dirname, '../replays');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const REPLAYS = FILES.map((f) => ({ f, r: JSON.parse(readFileSync(join(DIR, f), 'utf8')) as GoldenReplay }));

describe('golden gym replays (tests/replays)', () => {
  it('every gym room has a replay', () => {
    expect(new Set(REPLAYS.map((x) => x.r.room))).toEqual(new Set(GYM_ROOMS));
  });

  for (const { f, r } of REPLAYS) {
    describe(f, () => {
      const res = runGolden(r);

      it('behavioural: reaches G within maxFrames with zero deaths', () => {
        expect(res.goalFrame, 'never reached G').toBeGreaterThan(0);
        expect(res.goalFrame).toBeLessThanOrEqual(r.expect.maxFrames);
        expect(res.deaths).toBe(0);
        expect(res.states.every((s) => ['normal', 'wallSlide', 'dash'].includes(s))).toBe(true);
      });

      const stale = tuningHash(presetTuning(r.preset)) !== r.tuningHash;
      it.skipIf(stale)('golden: exact goal frame, end position and hash every 60 frames', () => {
        expect(res.goalFrame).toBe(r.expect.goalFrame);
        expect(res.end).toEqual(r.expect.end);
        expect(res.hashes).toEqual(r.expect.hashes);
      });
      if (stale) console.warn(`${f}: golden is stale (tuning changed); run npm run replays:update`);
    });
  }
});

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
      expect(room.padX).toBe(0);
      // Copies without `next`, so reaching G doesn't transition into an unmirrored room.
      const o = registerRoom(buildRoom({ ...room.file, id: `${id}~o`, next: undefined }));
      const m = registerRoom(buildRoom(mirrorRoomFile({ ...room.file, next: undefined })));
      const W = room.width * 64;
      const golden = REPLAYS.find((x) => x.r.room === id)?.r;
      const tapes = [golden?.inputs ?? '', randomTape()];
      for (const tape of tapes) {
        const masks = parseInputScript(tape);
        const mirrored = formatInputScript(masks.map(mirrorMask));
        const abilities = { ...room.abilities, dash: true, doubleJump: true, pogo: true, wallJump: true };
        const a = runGolden({ room: o.id, seed: 1, preset: 'opus', abilities, inputs: tape });
        const b = runGolden({ room: m.id, seed: 1, preset: 'opus', abilities, inputs: mirrored });
        for (let i = 0; i < a.trace.length; i++) {
          const p = a.trace[i];
          const q = b.trace[i];
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
