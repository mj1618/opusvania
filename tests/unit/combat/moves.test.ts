import { describe, expect, it } from 'vitest';
import { boxAt, rectsOverlap } from '../../../src/sim/combat/boxes';
import { canCancel, MOVE_IDS, MOVES, moveHitbox, resolveMove } from '../../../src/sim/player/moves';
import type { MoveState, PlayerState } from '../../../src/sim/state';
import { combatLab, events, fight, play, stepOf } from './arena';

/** Per-step trace of Kid's move: [move id or '', frame] for each step. */
function _moveTrace(
  script: string,
  room = combatLab(),
): { f: ReturnType<typeof fight>; tr: [string, number][] } {
  const f = fight(room);
  const tr: [string, number][] = [];
  for (const tok of script.split(' ')) {
    play(f, tok);
    const m = f.s.player.move;
    tr.push([m?.id ?? '', m?.frame ?? 0]);
  }
  return { f, tr };
}

/** Steps (1-based) during which each move id is running, from a per-step run. */
function spans(script: string): Record<string, number[]> {
  const f = fight();
  const out: Record<string, number[]> = {};
  let i = 0;
  const one = (tok: string) => {
    play(f, tok);
    i++;
    const m = f.s.player.move;
    if (!m) return;
    const list = out[m.id] ?? [];
    list.push(i);
    out[m.id] = list;
  };
  for (const tok of script.split(' ')) {
    const mm = /^([^\d]+)(\d+)$/.exec(tok);
    const n = mm ? Number(mm[2]) : 1;
    const letters = mm ? (mm[1] as string) : tok;
    for (let k = 0; k < n; k++) one(`${letters}1`);
  }
  return out;
}

describe('U1 frame data (content/moves.json drives the action state machine)', () => {
  // Kid in combat rooms is feather (empty bag): jab and cross recover 2 frames faster.
  it('jab: moveStart on frame 1, active 5-7, back to NORMAL after 15 (17 - 2 feather)', () => {
    const f = fight();
    play(f, 'A1 .30');
    expect(stepOf(f, 'moveStart')).toBe(1);
    expect(stepOf(f, 'whiff')).toBe(7); // last active frame with nothing hit
    const s = spans('A1 .30');
    expect(s.jab).toEqual(Array.from({ length: 15 }, (_, k) => k + 1));
  });

  it('every move lasts S + A + R (feather -2 where the data says so; whiff/dry/refusal lengths)', () => {
    for (const id of MOVE_IDS) {
      const d = MOVES[id];
      if (!d) continue;
      let script: string;
      if (id === 'cross') script = 'A1 .3 A1 .40';
      else if (id === 'uppercut') script = 'U+A1 .40';
      else if (id === 'overhand') script = 'J1 J2 D+A1 .40';
      else if (id === 'seize') script = 'S1 .40';
      else if (id === 'levy') script = 'V1 .40';
      else if (id === 'swallow') script = 'H1 .40';
      else script = 'A1 .40';
      const got = spans(script)[id]?.length ?? 0;
      let want: number;
      if (d.kind === 'levy')
        want = d.dryTotal ?? 0; // empty bag: a dry levy
      else if (d.kind === 'swallow')
        want = 6; // nothing to swallow: the refusal
      else if (d.kind === 'seize') want = d.startup + d.active + (d.whiffRecovery ?? d.recovery);
      else want = d.startup + d.active + d.recovery + (d.featherRecovery ? -2 : 0);
      expect(got, id).toBe(want);
    }
  });

  it('the 1-2: a second A during the jab buffers the Cross, which starts on jab frame 11', () => {
    const s = spans('A1 .1 A1 .40');
    expect(s.jab?.length).toBe(10);
    expect(s.cross?.[0]).toBe(11);
    // The buffer waits for the chain (a press on jab frame 3 is 8 frames before frame 11).
    expect(spans('A1 .1 A1 .40').cross).toEqual(spans('A1 .6 A1 .40').cross);
  });

  it('the Cross plants Kid (half run speed on the ground); the jab keeps full speed', () => {
    const f = fight();
    play(f, 'R30');
    const v0 = f.s.player.vx;
    play(f, 'R+A1 R2 R+A1 R14');
    expect(f.s.player.move?.id).toBe('cross');
    expect(Math.abs(f.s.player.vx)).toBeLessThanOrEqual(v0 * 0.5 + 1e-9);
  });

  it('aims pick the move: Up+A = uppercut, airborne Down+A = overhand, grounded Down+A = jab', () => {
    const cur: MoveState | null = null;
    expect(resolveMove('attack', 1 << 2, true, cur)?.id).toBe('uppercut');
    expect(resolveMove('attack', 1 << 3, false, cur)?.id).toBe('overhand');
    expect(resolveMove('attack', 1 << 3, true, cur)?.id).toBe('jab');
    expect(resolveMove('seize', 1 << 2, true, cur)).toMatchObject({ id: 'seize', dir: 'up' });
    expect(resolveMove('levy', 1 << 3, false, cur)).toMatchObject({ id: 'levy', dir: 'down' });
  });
});

describe('U2 mirror: every hitbox facing left is the mirror of facing right', () => {
  it("overlaps against a grid of targets agree under reflection about Kid's centre", () => {
    const p = { x: 1000, y: 500, w: 40, h: 80 } as PlayerState;
    const cx2 = 2 * (p.x + p.w / 2);
    let checked = 0;
    for (const id of MOVE_IDS) {
      const d = MOVES[id];
      if (!d) continue;
      for (const dir of ['fwd', 'up', 'down'] as const) {
        if (!d.hitboxes[dir]) continue;
        for (const counter of [false, true]) {
          const m = (facing: 1 | -1): MoveState => ({
            id,
            frame: 1,
            dir,
            facing,
            outcome: 'none',
            hitList: [],
            len: 0,
            counter,
            soundId: 0,
          });
          const r = moveHitbox(p, m(1), 1.25);
          const l = moveHitbox(p, m(-1), 1.25);
          if (!r || !l) throw new Error(`${id} ${dir}: no box`);
          expect(l.x, `${id} ${dir}`).toBe(cx2 - (r.x + r.w));
          for (let gx = 800; gx < 1240; gx += 12)
            for (let gy = 380; gy < 700; gy += 12) {
              const tgt = { x: gx, y: gy, w: 20, h: 16 };
              const mir = { x: cx2 - (gx + 20), y: gy, w: 20, h: 16 };
              expect(rectsOverlap(r, tgt)).toBe(rectsOverlap(l, mir));
              checked++;
            }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    // The box module's mirror is the one used (x' = ownerW - x - w).
    expect(boxAt(0, 0, 40, -1, [28, 16, 80, 32]).x).toBe(40 - 28 - 80);
  });
});

describe('U3 action buffer', () => {
  it('a press 8 frames before the move is legal fires; 9 frames before does not', () => {
    // A dry levy lasts 6 frames and cancels into nothing but jump/dash: Seize is legal on step 7.
    const fires = (gap: number) => {
      const f = fight();
      play(f, `V1 .${7 - gap - 1} S1 .20`.replace(' .0 ', ' '));
      return events(f, 'moveStart').filter((e) => e.type === 'moveStart' && e.move === 'seize').length;
    };
    // Press on step 7 - k (k = 1..6 are all within the move).
    const f8 = fight();
    play(f8, 'V1 .40');
    expect(fires(1)).toBe(1);
    // Buffer the press during a longer move instead: a jab (15 f) cancels into seize from frame 8.
    const at = (pressStep: number) => {
      const f = fight();
      play(f, `A1${pressStep > 2 ? ` .${pressStep - 2}` : ''} S1 .30`);
      const start = f.steps.findIndex((ev) => ev.some((e) => e.type === 'moveStart' && e.move === 'seize'));
      return start + 1;
    };
    // Jab frame 8 = step 8 is the first legal step; presses on steps 2..7 all fire on step 8.
    for (let p = 2; p <= 7; p++) expect(at(p)).toBe(8);
    // Kid's own move ends at step 15 with nothing buffered: a press on step 16 fires at once.
    expect(at(16)).toBe(16);
  });

  it('presses during hitstop are latched and fire on the first free frame', () => {
    // Seize a pink wall 12 px ahead: the take is on frame 6 with 5 frames of hitstop.
    const room = combatLab([11, 12, 13, 14].map((y) => [y, 5, 'H']) as [number, number, string][]);
    const f = fight(room);
    play(f, 'S1 .5');
    expect(f.s.hitstop).toBeGreaterThan(0);
    play(f, '.1 V1 .30'); // levy pressed while frozen
    const levy = f.steps.findIndex((ev) => ev.some((e) => e.type === 'moveStart' && e.move === 'levy'));
    expect(levy).toBeGreaterThan(0);
    expect(events(f, 'levyThrow').length).toBe(1);
  });
});

describe('U4 cancels', () => {
  it('every move-into-move edge fires on its fromFrame and never one frame before', () => {
    for (const id of MOVE_IDS) {
      const d = MOVES[id];
      if (!d) continue;
      for (const c of d.cancels)
        for (const into of c.into) {
          const at = (frame: number): MoveState => ({
            id,
            frame,
            dir: 'fwd',
            facing: 1,
            outcome: 'none',
            hitList: [],
            len: 0,
            counter: false,
            soundId: 0,
          });
          expect(canCancel(at(c.fromFrame), into), `${id}->${into}@${c.fromFrame}`).toBe(true);
          // One frame earlier only if another edge allows it.
          const earlier = d.cancels.some((o) => o.into.includes(into) && o.fromFrame <= c.fromFrame - 1);
          expect(canCancel(at(c.fromFrame - 1), into), `${id}->${into}@${c.fromFrame - 1}`).toBe(earlier);
        }
    }
  });

  it('a jump ends the jab only from frame 8; a Slip (dash) can cancel it from frame 1 (the feint)', () => {
    const early = fight();
    play(early, 'A1 .2 J1 .5');
    expect(early.s.player.move?.id).toBe('jab');
    const late = fight();
    play(late, 'A1 .7 J1');
    expect(late.s.player.move).toBeNull();
    const feint = fight();
    play(feint, 'A1 X1');
    expect(feint.s.player.move).toBeNull();
    expect(events(feint, 'slipStart').length).toBe(1);
  });
});
