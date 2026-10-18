/**
 * Lanternroot's puzzles and rules in its own rooms (docs/design/levels/proto-1.md §5, §6): what the solver's
 * movement search leaves out. The creatures' side of the puzzles (silver light makes the hawker and the dangler shy),
 * the lamps only Gust reaches (no body her blade or a fling can be in), the crossings between the rooms, and the
 * upgrades the level hides.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { PROTO_WORLD } from '../../src/scene/world';
import { slashBox } from '../../src/sim/player/attack';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withUpgrades } from '../../src/sim/upgrades';
import { ARRIVALS, EDGES } from '../../tools/levels/lanternroot-graph';
import { explore, play } from '../../tools/solve/explore';
import { edgeId, macro, readTapes, setup } from '../../tools/solve/proto-1';
import { B, drive, of } from './proto-drive';

const T = defaultTuning;
const KINDLE = ['glide', 'wallJump', 'doubleJump', 'kindle'];

describe('Lanternroot: silver light makes flyers shy', () => {
  it('puzzle 3: the gallery’s hawker strikes at her over the shaft in the dark, never by a burning M-c1', () => {
    // In the dark by the shaft's west lip: it tells and dives.
    const dark = drive('lr-hall', 4180, 1300, KINDLE, { glow: 18 });
    const ev = dark.run(0, 400);
    expect(of(ev, 'enemyNotice').filter((e) => e.id === 'h-c2').length).toBeGreaterThan(0);
    // The same spot, M-c1 kindled: it holds off (enemyShy), no tell while she stands in its light.
    const lit = drive('lr-hall', 4180, 1300, KINDLE, { glow: 18 });
    const ev2 = lit.run(B, 1).concat(lit.run(0, 400));
    expect(of(ev2, 'enemyShy').some((e) => e.id === 'h-c2')).toBe(true);
    expect(of(ev2, 'enemyNotice').filter((e) => e.id === 'h-c2')).toHaveLength(0);
  });

  it('puzzle 2: the dangler over M-s2 drops on her stop in the dark, and holds its perch once M-s2 burns', () => {
    const dark = drive('lr-hall', 3610, 700, KINDLE, { glow: 18 });
    const ev = dark.run(0, 200);
    expect(of(ev, 'enemyWindup').some((e) => e.id === 'd-b2')).toBe(true);
    const lit = drive('lr-hall', 3610, 700, KINDLE, { glow: 18 });
    const ev2 = lit.run(B, 1).concat(lit.run(0, 300));
    expect(of(ev2, 'enemyWindup').some((e) => e.id === 'd-b2')).toBe(false);
  });
});

describe('Lanternroot: lamps only Gust reaches', () => {
  /** Every place her body can be (on a grid) from which a cut or a fling would reach the flame, is in thorns. */
  function unreachable(room: string, lamp: string): string[] {
    const r = getRoom(room);
    const l = r.lures?.find((q) => q.id === lamp);
    if (!l) return [`no lamp ${lamp}`];
    const t = cloneTuning(defaultTuning);
    const fr = t.lures.flameRadius + t.upgrades.keenBlade.flameRadiusAdd;
    const reach = t.lures.kinds[l.kind].fling;
    const thorns = r.thorns ?? [];
    const solid = (b: { x: number; y: number; w: number; h: number }) =>
      r.solids.some((q) => b.x < q.x + q.w && q.x < b.x + b.w && b.y < q.y + q.h && q.y < b.y + b.h);
    const out: string[] = [];
    for (let y = l.y - 400; y <= l.y + 400; y += 8)
      for (let x = l.x - 400; x <= l.x + 400; x += 8) {
        const body = { x: x - 20, y: y - 40, w: 40, h: 80 };
        if (body.x < 0 || body.x + body.w > r.width || body.y < 0 || solid(body)) continue;
        if (
          thorns.some(
            (q) => body.x < q.x + q.w && q.x < body.x + body.w && body.y < q.y + q.h && q.y < body.y + body.h,
          )
        )
          continue;
        const d2 = (x - l.x) * (x - l.x) + (y - l.y) * (y - l.y);
        if (d2 <= reach * reach) out.push(`fling from ${x},${y}`);
        for (const dir of ['fwd', 'up', 'down'] as const)
          for (const facing of [-1, 1])
            for (const step of [1, 2, 3]) {
              const b = slashBox(body, dir, facing, t, step);
              if (b.x < l.x + fr && l.x - fr < b.x + b.w && b.y < l.y + fr && l.y - fr < b.y + b.h)
                out.push(`cut ${dir} from ${x},${y}`);
            }
      }
    return out.slice(0, 3);
  }

  it('the grille lamp (the curtain over the chimney) is deep in its thorn crown', () => {
    expect(unreachable('lr-hall', 'l-grille')).toEqual([]);
  });
  it('the bramble pair on the stub’s shoulder (the cap’s dark) are deep in theirs', () => {
    expect(unreachable('lr-night', 'l-b1a')).toEqual([]);
    expect(unreachable('lr-night', 'l-b1b')).toEqual([]);
  });
});

describe('Lanternroot: the crossings', () => {
  const TAPES = readTapes();
  for (const e of EDGES.filter((q) => q.to.startsWith('exit:') && q.proof === 'explore')) {
    const exit = e.to.slice(5);
    const arrive = ARRIVALS[`${e.room}#${exit}`];
    if (!arrive) continue;
    it(`${e.room}#${exit} lands her in ${arrive.split(':')[0]}, standing`, () => {
      const line = TAPES[edgeId(e)] ?? [];
      const { state, room, t } = setup({
        room: e.room,
        at: e.from,
        kit: ['glide', 'wallJump', 'doubleJump', ...(e.needs ?? [])],
        flags: e.flags ?? [],
        lamps: e.lamps ?? [],
      });
      let s = state;
      s.enemies = s.enemies.map((q) => ({ ...q, gone: true }));
      const scene = { ...room, enemies: [] };
      for (const name of line) {
        const r = play(s, macro(name), scene, t, 18, PROTO_WORLD);
        s = r.state;
        if (r.outcome === 'exit') break;
      }
      // On through the crossing (the hold carries her), then in the room beyond some line of hers stands her there.
      const there = arrive.split(':')[0] as string;
      const d = drive(e.room, 0, 0, ['glide', 'wallJump', 'doubleJump', ...(e.needs ?? [])], {
        flags: e.flags ?? [],
      });
      d.g.state = s;
      expect(d.until(0, () => d.g.state.room === there && d.g.state.exit === null, 60)).toBe(true);
      const next = getRoom(there);
      const res = explore({
        scene: next,
        tuning: t,
        start: [d.g.state],
        world: PROTO_WORLD,
        maxNodes: 300,
        goal: (q) => q.room === there && q.player.grounded,
      });
      const stood = [...res.nodes.values()].some((n) => n.state.room === there && n.state.player.grounded);
      expect(stood, `never stood in ${there}`).toBe(true);
    });
  }
});

describe('Lanternroot: the upgrades it hides', () => {
  it('the vessel raises the meter to 24; Bright Kindle makes a kindle 3; each moon-drop is a light', () => {
    const save = {
      flags: ['upgrade:glowVessel', 'upgrade:brightKindle', 'moonDrop:lr-night:h-er', 'moonDrop:lr-roots:h3'],
    };
    const t = withUpgrades(cloneTuning(T), save);
    expect(t.glow.max).toBe(24);
    expect(t.glow.kindleCost).toBe(3);
    expect(t.health.max).toBe(T.health.max + 2);
  });

  it('a moon-drop hollow gives its light for good', () => {
    const d = drive('lr-roots', 5600, 1300, KINDLE, { opened: ['lr-roots:heartwood'] });
    const hp0 = d.g.state.player.hpMax;
    d.walkTo(5670);
    d.run(0, 4);
    expect(d.g.state.save.flags).toContain('moonDrop:lr-roots:h3');
    expect(d.g.state.player.hpMax).toBe(hp0 + 1);
  });
});
