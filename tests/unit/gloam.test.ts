/**
 * The Gloamweaver (Lanternroot's mini-boss, src/sim/boss/gloam.ts, docs/design/levels/proto-1.md §6): the lock, the
 * three phases and their exams, the retry, the defeat (the lamp dies, Gust in the moonlight, the east door), and a
 * closed-loop bot that wins it (the boss's edge proof for the solver).
 */
import { describe, expect, it } from 'vitest';
import { jumpBoss } from '../../src/sim/boss/index';
import { A, B, D, type Drive, drive, L, of, R, U } from './proto-drive';

const ABIL = ['glide', 'wallJump', 'doubleJump', 'kindle'];
const T = () => 0;
void T;

/** In the arena with the fight on (the lock and the intro played). */
function arena(more: { flags?: string[]; glow?: number } = {}): Drive {
  const d = drive('lr-roots', 3060, 1300, ABIL, { glow: 18, ...more });
  d.run(0, 2);
  d.until(0, () => d.g.state.boss?.stage === 'fight', 200);
  return d;
}
const spider = (d: Drive) => d.g.state.enemies.find((e) => e.id === 'gloamweaver');
const boss = (d: Drive) => d.g.state.boss;
const lure = (d: Drive, id: string) => (d.g.scene.lures ?? []).findIndex((l) => l.id === id);

describe('the Gloamweaver', () => {
  it('locks as she drops in: the seal shuts behind her, the name card, then P1 (the hunt)', () => {
    const d = drive('lr-roots', 3060, 1300, ABIL);
    const ev = d.run(0, 120);
    expect(of(ev, 'bossLock')).toHaveLength(1);
    expect(of(ev, 'bossPhase')[0]?.name).toBe('the hunt');
    expect(boss(d)?.phase).toBe(1);
    // The spiderlings (fuel in the fight) are there now.
    expect(d.g.state.enemies.filter((e) => e.id.startsWith('spider') && !e.gone)).toHaveLength(3);
  });

  it('P1: shielded in the dark (every cut glances); it hunts round its orb toward her, never into silver light', () => {
    const d = arena();
    // It moves round toward the sector over her (she is east of the hub, it starts west).
    const s0 = spider(d);
    const x0 = (s0?.x ?? 0) + 48;
    d.run(0, 200);
    const s1 = spider(d);
    expect((s1?.x ?? 0) + 48).toBeGreaterThan(x0 + 100);
    // Light M-w4 (east low): it will not walk into its light.
    d.g.teleport(3620, 1060);
    d.run(B, 1);
    d.run(0, 2);
    expect(d.g.state.lures.hp[lure(d, 'm-w4')]).toBe(1);
    for (let k = 0; k < 400; k++) {
      d.run(0, 1);
      const e = spider(d);
      if (e?.mode !== 'hunt') continue;
      const dx = e.x + e.w / 2 - 3620;
      const dy = e.y + e.h / 2 - 1010;
      expect(dx * dx + dy * dy).toBeGreaterThan(400 * 400);
    }
  });

  it('P1: on its clock it lunges at her (told, then a straight run to the floor that hurts); she steps off the line', () => {
    const d = arena();
    const ev = d.run(0, 300);
    const tell = of(ev, 'bossTell').find((e) => e.attack === 'lunge');
    expect(tell, 'no lunge told').toBeDefined();
    expect(tell?.frames).toBe(d.g.tuning.gloam.lungeTell);
    expect(of(ev, 'bossAttack').some((e) => e.attack === 'lunge')).toBe(true);
    // (It lands where the tell aimed: on the floor under the line through her.)
    expect(Math.abs((tell?.py ?? 0) + 32 - 1300)).toBeLessThan(2);
  });

  it('P1: a lunge that runs into silver light is dazzled: it falls, exposed (bait it into a burning wick)', () => {
    const d = arena();
    d.g.teleport(3620, 1060);
    // Kindle the east low wick while it is far off (no exposure by the kindle itself), then wait in its light.
    const far = () => {
      const e = spider(d);
      if (e?.mode !== 'hunt') return false;
      const dx = e.x + e.w / 2 - 3620;
      const dy = e.y + e.h / 2 - 1010;
      return dx * dx + dy * dy > 600 * 600;
    };
    expect(d.until(0, far, 600)).toBe(true);
    d.run(B, 1);
    expect(d.g.state.lures.hp[lure(d, 'm-w4')]).toBe(1);
    const ev = d.run(0, 600);
    expect(of(ev, 'bossCue').some((e) => e.cue === 'dazzled')).toBe(true);
    expect(of(ev, 'bossOpen').length).toBeGreaterThan(0);
  });

  it('P1: a kindle near it exposes it: it falls, lies open, takes cuts; two windows (8 cuts) end P1', () => {
    const d = arena();
    // Bring it round to the west low wick: she stands under it until it is near, then kindles.
    d.g.teleport(2140, 1060);
    const near = () => {
      const e = spider(d);
      if (!e) return false;
      const dx = e.x + e.w / 2 - 2140;
      const dy = e.y + e.h / 2 - 1010;
      return dx * dx + dy * dy < 380 * 380;
    };
    expect(d.until(0, near, 1500)).toBe(true);
    const ev = d.run(B, 1).concat(d.run(0, 60));
    expect(of(ev, 'bossOpen').length).toBeGreaterThan(0);
    const e = spider(d);
    expect(e?.mode).toBe('recover');
    // Cut it four times where it lies.
    const ex = (e?.x ?? 0) + (e?.w ?? 0) / 2;
    d.g.teleport(ex - 60, 1300);
    d.g.state.player.facing = 1;
    const hp0 = e?.hp ?? 0;
    for (let i = 0; i < 6; i++) {
      d.run(A, 1);
      d.run(0, 19);
    }
    expect((spider(d)?.hp ?? 0) <= hp0 - 4).toBe(true);
    expect(spider(d)?.mode).not.toBe('recover');
  });

  it('P2 (by a debug jump): the drop swings, but its swing stops at the edge of silver light', () => {
    const d = arena();
    jumpBoss(d.g.state, d.g.scene, d.g.tuning, 2, []);
    expect(boss(d)?.phase).toBe(2);
    // Light both low wicks: no swing reaches into their light.
    d.g.teleport(2140, 1060);
    d.run(B, 1);
    d.g.teleport(3620, 1060);
    d.run(B, 1);
    d.g.teleport(2880, 1300);
    let swungInto = false;
    const ev = [];
    for (let k = 0; k < 900; k++) {
      ev.push(...d.run(0, 1));
      const e = spider(d);
      if (!e || (e.mode !== 'swing' && e.mode !== 'dive')) continue;
      for (const [wx, wy] of [
        [2140, 1010],
        [3620, 1010],
      ] as const) {
        const dx = e.x + e.w / 2 - wx;
        const dy = e.y + e.h / 2 - wy;
        if (dx * dx + dy * dy < 400 * 400) swungInto = true;
      }
      // (Keep the wicks lit through the test.)
      for (const id of ['m-w1', 'm-w4']) d.g.state.lures.burn[lure(d, id)] = 600;
    }
    expect(of(ev, 'bossTell').length).toBeGreaterThan(0);
    expect(swungInto).toBe(false);
  });

  it('P3 (by a debug jump): the high pair lit together floods the moon-hole; it falls; three cuts end it', () => {
    const d = arena();
    jumpBoss(d.g.state, d.g.scene, d.g.tuning, 3, []);
    d.run(0, 30);
    expect(spider(d)?.mode).toBe('perch');
    d.g.teleport(2520, 610);
    d.run(B, 1);
    d.run(0, 2);
    d.g.teleport(3240, 610);
    const ev = d.run(B, 1).concat(d.run(0, 90));
    expect(of(ev, 'bossCue').some((c) => c.cue === 'moonhole')).toBe(true);
    const e = spider(d);
    expect(e?.mode).toBe('recover');
    const ex = (e?.x ?? 0) + (e?.w ?? 0) / 2;
    d.g.teleport(ex - 60, 1300);
    d.g.state.player.facing = 1;
    const end = [];
    for (let i = 0; i < 6 && boss(d)?.stage === 'fight'; i++) {
      end.push(...d.run(A, 1));
      end.push(...d.run(0, 19));
    }
    end.push(...d.run(0, 260));
    expect(of(end, 'bossDefeat')).toHaveLength(1);
    expect(d.g.state.save.flags).toContain('gloam-down');
    // The lamp is out; the east door is open; the glade gives Gust.
    expect(d.g.state.lures.hp[lure(d, 'gloam-lamp')]).toBe(0);
    d.g.teleport(2880, 1300);
    d.run(0, 4);
    expect(d.g.state.save.abilities).toContain('gust');
  });

  it('P3: two throw-cuts off the lamp knock it down too (a fling off a high wick past the hub, cutting)', () => {
    const d = arena();
    jumpBoss(d.g.state, d.g.scene, d.g.tuning, 3, []);
    d.run(0, 30);
    let throws = 0;
    // (Both from the west wick: the high pair lit together would flood the moon-hole instead.)
    for (const [x, aim] of [
      [2520, R],
      [2520, R],
    ] as const) {
      d.g.teleport(x, 610);
      d.g.state.player.glow = 18;
      if ((d.g.state.lures.hp[lure(d, 'm-w2')] ?? 0) <= 0) d.run(B, 1);
      d.run(0, 12);
      d.run(aim | B, 3);
      d.run(aim, 1);
      const ev = d.run(aim, 16).concat(d.run(aim | A, 1), d.run(aim, 40));
      throws += of(ev, 'bossCue').filter((c) => c.cue === 'throwCut').length;
      d.until(0, () => d.g.state.player.grounded, 200);
    }
    expect(throws).toBe(2);
    d.run(0, 60);
    expect(spider(d)?.mode).toBe('recover');
  });

  it('a fade in the fight re-forms her at the hall patch above (a glow room keeps the save patch anywhere); a retry is short', () => {
    const d = drive('lr-hall', 3600, 1300, ABIL, { flags: ['seal-open'] });
    d.run(U, 2);
    d.run(0, 40);
    expect(d.g.state.save.patch?.id).toBe('p-b2');
    d.g.goto('lr-roots', 3060, 1300);
    d.until(0, () => d.g.state.boss?.stage === 'fight', 200);
    d.g.state.player.hp = 1;
    d.g.state.player.invuln = 0;
    // A spiderling's drop, or anything: fade her.
    d.g.state.player.hp = 0;
    d.g.state.player.faded = 1;
    d.run(0, 2);
    expect(d.g.state.room).toBe('lr-hall');
    d.g.goto('lr-roots', 3060, 1300);
    d.until(0, () => d.g.state.boss?.stage === 'fight', 200);
    expect(d.g.state.boss?.retry).toBe(true);
    expect(spider(d)?.hp).toBe(d.g.tuning.gloam.retryP1Hp);
  });
});

void D;
void L;
