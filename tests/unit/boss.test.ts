import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom, parseScene } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { GAME_WORLD } from '../../src/scene/world';
import { jumpBoss, lockedScene } from '../../src/sim/boss/index';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { cloneState, type GameState, newSave } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { WeaverBot } from '../../tools/playtest/weaver-bot';
import { runFight } from '../../tools/playtest/weaver-run';

/** The Weaver and the boss framework (memory/bosses.md): lab-weaver. */

const LAB = getRoom('lab-weaver');
const SPEC = LAB.boss as NonNullable<Room['boss']>;
const L = ActionBit.left;
const R = ActionBit.right;
const A = ActionBit.attack;

/** A game in the lab, resting at the boss door's patch (`met`: a retry). */
function lab(met = false): { g: Game; events: SimEvent[] } {
  const save = newSave(LAB.abilities ?? []);
  save.patch = { room: LAB.id, id: 'p-door' };
  save.visited.push(LAB.id);
  if (met) save.flags.push(SPEC.met);
  const g = new Game(cloneTuning(defaultTuning), LAB, 1, () => 0, null, { world: GAME_WORLD, save });
  g.mode = 'manual';
  const events: SimEvent[] = [];
  g.afterStep.add((ev) => {
    for (const e of ev) events.push(e);
  });
  return { g, events };
}

function run(g: Game, input: number, n: number): void {
  for (let i = 0; i < n; i++) {
    g.queueInput([input]);
    g.stepOnce();
  }
}

const weaver = (s: GameState) => s.enemies.find((e) => e.id === SPEC.creature);
const lure = (s: GameState, id: string) => s.lures.hp[(LAB.lures ?? []).findIndex((l) => l.id === id)] ?? 0;

describe('the boss data', () => {
  it('lab-weaver names its heart, rings, web and creature', () => {
    expect(SPEC.kind).toBe('weaver');
    expect(SPEC.rings).toHaveLength(5);
    expect(LAB.lures?.find((l) => l.id === SPEC.heart)?.kind).toBe('great');
    expect(LAB.enemies?.find((e) => e.id === SPEC.creature)?.kind).toBe('weaverBoss');
  });

  it('refuses a boss whose heart is not a great lamp, or whose door is inside its arena', () => {
    const bad = JSON.parse(JSON.stringify(LAB)) as Room;
    (bad.lures ?? []).forEach((l) => {
      if (l.id === SPEC.heart) l.kind = 'wick';
    });
    expect(() => parseScene(bad)).toThrow(/heart/);
    const inside = JSON.parse(JSON.stringify(LAB)) as Room;
    const d = inside.boss?.lock[0];
    if (d) d.x = 1000;
    expect(() => parseScene(inside)).toThrow(/edge/);
  });
});

describe('the arena lock', () => {
  it('seals once her whole box is inside, saves `met`, and keeps her in', () => {
    const { g, events } = lab();
    run(g, L, 70);
    expect(g.state.boss?.locked).toBe(false);
    run(g, L, 30);
    expect(events.some((e) => e.type === 'bossLock')).toBe(true);
    expect(g.state.boss?.locked).toBe(true);
    expect(g.state.save.flags).toContain(SPEC.met);
    const p = g.state.player;
    expect(p.x).toBeGreaterThanOrEqual(SPEC.arena.x);
    expect(p.x + p.w).toBeLessThanOrEqual(SPEC.arena.x + SPEC.arena.w);
    expect(lockedScene(g.scene, g.state.boss).solids.length).toBe(g.scene.solids.length + SPEC.lock.length);
    // She cannot walk back out through the sealed door.
    run(g, R, 120);
    expect(g.state.player.x + g.state.player.w).toBeLessThanOrEqual(SPEC.arena.x + SPEC.arena.w);
    // The name card, then phase 1.
    run(g, 0, 100);
    expect(events.some((e) => e.type === 'bossCue' && e.cue === 'name')).toBe(true);
    expect(g.state.boss?.phase).toBe(1);
  });
});

describe('the fight, played by a scripted player', () => {
  const first = runFight();

  it('is winnable: every phase, then the heart, without a hit', () => {
    expect(first.won).toBe(true);
    expect(Object.keys(first.phaseAt).map(Number)).toEqual([1, 2, 3, 4]);
    expect(first.hurts).toBe(0);
    // A perfect run is about a minute (first-timers: 2-4 minutes).
    expect(first.frames).toBeGreaterThan(40 * 60);
    expect(first.frames).toBeLessThan(110 * 60);
  });

  it('defeat sets the flag, opens the doors and the curtain, and saves the great lamp with its 60 moths', () => {
    const s = first.game.state;
    expect(s.save.flags).toContain(SPEC.flag);
    expect(s.boss?.stage).toBe('down');
    expect(s.boss?.locked).toBe(false);
    expect(first.events.some((e) => e.type === 'bossUnlock' && e.how === 'defeat')).toBe(true);
    expect(first.events.some((e) => e.type === 'gateOpen' && e.flag === SPEC.flag)).toBe(true);
    for (const id of [SPEC.heart, ...SPEC.rings]) expect(s.save.snuffed).toContain(`${LAB.id}:${id}`);
    expect(s.save.moths).toBe(60);
    expect(weaver(s)?.gone).toBe(true);
    // The firefly relit its wick.
    expect(first.events.some((e) => e.type === 'bossRelight')).toBe(true);
    expect(lure(s, SPEC.relight ?? '')).toBeGreaterThan(0);
  });

  it('every attack is told at least 30 frames before it is live', () => {
    const tells = first.events.filter((e) => e.type === 'bossTell');
    const attacks = first.events.filter((e) => e.type === 'bossAttack');
    expect(attacks.length).toBeGreaterThan(8);
    for (const a of attacks) {
      if (a.type !== 'bossAttack') continue;
      const t = tells.filter((x) => x.type === 'bossTell' && x.attack === a.attack && x.f <= a.f).at(-1);
      expect(t, `${a.attack} at ${a.f}`).toBeDefined();
      expect(a.f - (t?.f ?? 0)).toBeGreaterThanOrEqual(30);
    }
  });

  it('is deterministic', () => {
    expect(runFight().game.hash()).toBe(first.game.hash());
  });
});

describe('fairness', () => {
  it('P2: standing where the tell says is safe, every drop', () => {
    for (let drop = 0; drop < 3; drop++) {
      const { g, events } = lab(true);
      run(g, L, 100);
      jumpBoss(g.state, g.scene, g.tuning, 2, []);
      if (g.state.boss) g.state.boss.drop = drop;
      // To the tell.
      for (let i = 0; i < 300 && g.state.boss?.tell !== 'swing'; i++) run(g, 0, 1);
      const b = g.state.boss;
      expect(b?.tell).toBe('swing');
      expect(b?.safeX).toBeGreaterThan(SPEC.arena.x);
      // The safe place is clear of the band the arc covers.
      const safe = b?.safeX ?? 0;
      expect(safe < (b?.tellX0 ?? 0) || safe > (b?.tellX1 ?? 0)).toBe(true);
      g.teleport(safe, SPEC.floor ?? 2176);
      const from = events.length;
      run(g, 0, 200);
      expect(events.slice(from).filter((e) => e.type === 'hurt')).toHaveLength(0);
    }
  });

  it('P3: out of the lunge band and off the drop marker is safe', () => {
    const { g, events } = lab(true);
    run(g, L, 100);
    jumpBoss(g.state, g.scene, g.tuning, 3, []);
    let told = 0;
    for (let i = 0; i < 1800 && told < 6; i++) {
      run(g, 0, 1);
      const b = g.state.boss;
      if (b?.tell && b.tellFrames >= 28 && (b.tell === 'lunge' || b.tell === 'drop')) {
        told++;
        // Step off: beyond the band's far end (a lunge) or 200 px from the landing (a drop).
        const x =
          b.tell === 'lunge'
            ? b.dir > 0
              ? b.tellX1 + 60
              : b.tellX0 - 60
            : b.landX + (b.landX < 1088 ? 220 : -220);
        const inArena = Math.max(SPEC.arena.x + 40, Math.min(SPEC.arena.x + SPEC.arena.w - 40, x));
        if (inArena !== x) continue;
        g.teleport(x, SPEC.floor ?? 2176);
        const from = events.length;
        run(g, 0, 40);
        expect(
          events.slice(from).filter((e) => e.type === 'hurt'),
          b.tell,
        ).toHaveLength(0);
      }
    }
    expect(told).toBeGreaterThan(2);
  });

  it('P1: caught in the heart, it bites only after its count (and beating free is far quicker)', () => {
    const { g, events } = lab(true);
    run(g, L, 100);
    jumpBoss(g.state, g.scene, g.tuning, 1, []);
    const heart = LAB.lures?.find((l) => l.id === SPEC.heart);
    g.teleport(heart?.x ?? 0, (heart?.y ?? 0) + 40 + 60);
    let caught = -1;
    let bite = -1;
    for (let i = 0; i < 200; i++) {
      run(g, 0, 1);
      if (caught < 0 && g.state.player.lure >= 0) caught = i;
      if (bite < 0 && events.some((e) => e.type === 'hurt')) bite = i;
    }
    expect(caught).toBeGreaterThanOrEqual(0);
    expect(bite - caught).toBeGreaterThanOrEqual(defaultTuning.weaverBoss.biteCount);
  });

  it('P2: a cut through its thread drops it, stunned', () => {
    const { g, events } = lab(true);
    run(g, L, 100);
    jumpBoss(g.state, g.scene, g.tuning, 2, []);
    for (let i = 0; i < 400 && weaver(g.state)?.mode !== 'recover'; i++) run(g, 0, 1);
    const b = g.state.boss;
    expect(weaver(g.state)?.mode).toBe('recover');
    // Beside the thread, well above its back, cutting toward it.
    g.teleport((b?.pivotX ?? 0) + 70, 1800);
    run(g, L | A, 1);
    run(g, L, 8);
    expect(events.some((e) => e.type === 'bossThreadCut')).toBe(true);
    run(g, 0, 60);
    expect(events.some((e) => e.type === 'bossOpen' && e.how === 'stunned')).toBe(true);
  });
});

describe('a retry', () => {
  it('a fade re-forms her at the door, opens it, and the next attempt has three ring flames', () => {
    const { g, events } = lab();
    run(g, L, 100);
    jumpBoss(g.state, g.scene, g.tuning, 2, []);
    g.state.player.hp = 1;
    // Stand in the first drop's band until it hits.
    for (let i = 0; i < 600 && !events.some((e) => e.type === 'fade'); i++) {
      const b = g.state.boss;
      if (b?.tell === 'swing' && b.tellFrames > 40) g.teleport((b.tellX0 + b.tellX1) / 2, SPEC.floor ?? 2176);
      run(g, 0, 1);
    }
    expect(events.some((e) => e.type === 'fade')).toBe(true);
    run(g, 0, 80);
    expect(events.some((e) => e.type === 'bossUnlock' && e.how === 'reset')).toBe(true);
    expect(events.some((e) => e.type === 'bossReset' && e.retry && e.rings === 3)).toBe(true);
    const s = g.state;
    expect(s.boss?.stage).toBe('wait');
    expect(s.boss?.locked).toBe(false);
    expect(Math.abs(s.player.x + s.player.w / 2 - 2752)).toBeLessThan(4);
    expect(lure(s, 'ring-1')).toBe(0);
    expect(lure(s, 'ring-5')).toBe(0);
    for (const id of ['ring-2', 'ring-3', 'ring-4']) expect(lure(s, id)).toBe(1);
    expect(weaver(s)?.mode).toBe('sit');
    expect(s.save.snuffed.some((k) => k.endsWith(SPEC.heart))).toBe(false);
  });

  it('a retry reaches P3 well inside 75 s, and is won', () => {
    const r = runFight({ retry: true });
    expect(r.won).toBe(true);
    expect(r.phaseAt[3]).toBeLessThan(75 * 60);
    expect(r.events.find((e) => e.type === 'bossLock' && e.retry)).toBeDefined();
  });
});

describe('beaten is for good', () => {
  it('a later visit finds the doors open, the lamp out, the Weaver gone and the curtain up', () => {
    const won = runFight();
    const save = won.game.state.save;
    const g = new Game(cloneTuning(defaultTuning), LAB, 1, () => 0, null, { world: GAME_WORLD, save });
    g.mode = 'manual';
    const s0 = cloneState(g.state);
    expect(s0.boss?.stage).toBe('down');
    run(g, L, 140);
    expect(g.state.boss?.locked).toBe(false);
    expect(weaver(g.state)?.gone).toBe(true);
    expect(lure(g.state, SPEC.heart)).toBe(0);
    expect(g.state.kit.gates[0]).toBe(1);
    void WeaverBot;
  });
});
