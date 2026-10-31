/**
 * The prompts (review r9 #1): the first fling's cap is at full strength from the first frame a flame is in reach,
 * it outlasts the reach, and no lesson is ever shown for a move she does not own (the glide's cap showed in the
 * hatch with nothing owned). Drives the real sim off the hatch's lip and the real `Prompts` over it.
 */
import { describe, expect, it } from 'vitest';
import type { SimView } from '../../src/render/contract';
import { hudLink } from '../../src/render/hud/link';
import { fadeStep, owns } from '../../src/render/hud/prompt-logic';
import { Prompts } from '../../src/render/hud/prompts';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');

function view(s: GameState, scene: ReturnType<typeof getRoom>, events: SimEvent[]): SimView {
  const p = s.player;
  return {
    frame: s.frame,
    alpha: 1,
    player: { ...p, cx: p.x + p.w / 2, feetY: p.y + p.h, cy: p.y + p.h / 2 },
    events,
    scene,
    pickups: s.pickups,
    pods: s.pods,
    goal: s.goal,
    enemies: s.enemies,
    lures: s.lures,
    save: s.save,
    rest: s.rest,
    kit: s.kit,
    boss: s.boss ?? null,
  } as unknown as SimView;
}

/** A running jump off the hatch's lip past `wick-first`, with nothing pressed after: the cap's strength per frame. */
function lipJump(abilities: string[]): { reach: boolean[]; alpha: number[]; lesson: (string | null)[] } {
  const scene = getRoom('cn-hatch');
  const C = abilities as never;
  const s = createState(1, t, scene, [], C, newSave(C));
  placePlayer(s, 3440, 892, t, withShortcuts(scene, s.save), []);
  s.hatch = null as never;
  const pr = new Prompts();
  pr.enabled = true;
  hudLink.on = true;
  const out = { reach: [] as boolean[], alpha: [] as number[], lesson: [] as (string | null)[] };
  let jumped = -1;
  for (let k = 0; k < 150; k++) {
    const fx = s.player.x + s.player.w / 2;
    if (jumped < 0 && s.player.grounded && fx >= 3500) jumped = k;
    const ev: SimEvent[] = [];
    const mask = ActionBit.right | (jumped >= 0 && k - jumped < 18 ? ActionBit.jump : 0);
    step(s, mask, t, withShortcuts(scene, s.save), ev, W);
    pr.update(1 / 60, k / 60, view(s, scene, ev));
    out.reach.push(flingTarget(s, scene, t) >= 0);
    const inner = pr as unknown as { alpha: number; lesson: string | null };
    out.alpha.push(inner.alpha);
    out.lesson.push(inner.alpha > 0.003 ? inner.lesson : null);
  }
  return out;
}

describe('the prompts (review r9 #1)', () => {
  it('owns: the glide and the kick need their ability, the fling and the offer do not', () => {
    expect(owns([], 'glide')).toBe(false);
    expect(owns(['glide'], 'glide')).toBe(true);
    expect(owns([], 'kick')).toBe(false);
    expect(owns(['wallJump'], 'kick')).toBe(true);
    expect(owns([], 'fling')).toBe(true);
    expect(owns([], 'offer')).toBe(true);
  });

  it('fadeStep: no fade-in is full at once; a fade-out takes its time', () => {
    expect(fadeStep(0, true, 1 / 60, { fadeIn: 0, fadeOut: 0.3 })).toBe(1);
    expect(fadeStep(1, false, 0.15, { fadeIn: 0, fadeOut: 0.3 })).toBeCloseTo(0.5);
  });

  it('the first fling: full strength on every frame in reach, and it outlasts the reach', () => {
    const r = lipJump([]);
    const inReach = r.reach.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(inReach.length).toBeGreaterThan(0);
    for (const i of inReach) {
      expect(r.lesson[i]).toBe('fling');
      expect(r.alpha[i]).toBeGreaterThanOrEqual(0.9);
    }
    // It stays up for at least 0.5 s past the last frame in reach (a reach of 8 frames is otherwise 133 ms).
    const last = inReach[inReach.length - 1] as number;
    let after = 0;
    while (r.lesson[last + 1 + after] === 'fling' && (r.alpha[last + 1 + after] ?? 0) >= 0.9) after++;
    expect(after).toBeGreaterThanOrEqual(30);
  });

  it('never the glide in the hatch without the glide; the fling keeps its place over it', () => {
    const none = lipJump([]);
    expect(none.lesson.includes('glide')).toBe(false);
    // With the glide owned, the fall after the reach may teach it, but not while the fling's cap is up.
    const glide = lipJump(['glide']);
    const firstFling = glide.lesson.indexOf('fling');
    const firstGlide = glide.lesson.indexOf('glide');
    expect(firstFling).toBeGreaterThanOrEqual(0);
    if (firstGlide >= 0) expect(firstGlide).toBeGreaterThan(firstFling + 30);
  });
});
