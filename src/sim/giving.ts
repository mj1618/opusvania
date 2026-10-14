/**
 * Giving (memory/giving.md): the game plays like giving, not like collecting.
 *
 *  - SEEN. The creatures notice her by the light she carries (`pickups.count`), in steps
 *    (`seenLevel`): empty-handed she is unseen (a burrback does not brace or flinch at her, a
 *    lampwing does not see her); each step up scales how far they notice her from. A creature she
 *    has cut knows her whatever she carries (`roused`: src/sim/enemies/burrback.ts).
 *  - OFFER. The `offer` action gives one glint to what is in reach: a creature (calmed: it stops,
 *    lowers and does her no harm for `giftCalmFrames`), a dormant lantern or lamp (a part of its
 *    price, kept: `LanternState.given`), or the heart (into the offering, ahead of the ending). The
 *    glint leaves her wallet at the press and takes effect when it arrives (`offerFlightFrames`).
 *  - Rest = give: src/sim/goal.ts (a lit light heals for glints).
 *
 * Runs after the player and before the creatures each step, so a gift that lands this step holds
 * the creature already.
 */
import { giftEnemy } from './enemies';
import { segmentBlocked } from './enemies/common';
import type { SimEvent } from './events';
import { heartBox, lampCost, lanternBox, lanternCost } from './goal';
import { type InputFrame, isHeld, wasPressed } from './input';
import type { Box } from './player/attack';
import type { Scene } from './scene';
import { seenNow, seenScale } from './seen';
import type { GameState, PlayerState } from './state';
import type { Tuning } from './tuning';

/** Squared distance from (x, y) to the nearest point of box `b`. */
function dist2(x: number, y: number, b: Box): number {
  const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0;
  const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - (b.y + b.h) : 0;
  return dx * dx + dy * dy;
}

interface Target {
  to: PlayerState['giftTo'];
  i: number;
  x: number;
  y: number;
  kind: string;
  id: string;
}

/** A lampwing after her: its tell, its dive, its stall, its climb. */
const chasing = (e: { kind: string; mode: string }): boolean =>
  e.kind === 'lampwing' &&
  (e.mode === 'curious' || e.mode === 'dive' || e.mode === 'stall' || e.mode === 'pursue');

/**
 * What an offer now would go to: the nearest creature in reach that is not already calmed by a
 * gift (a clear line from her to it; a lampwing after her is in reach as far off as it sees her);
 * else the nearest dormant lantern or lamp in reach with some of its price still to give; else the
 * heart, if it is in reach and the run is not over. `lights`: lights and the heart only (the stream
 * of a held offer: a creature takes one glint per press).
 */
export function offerTarget(state: GameState, scene: Scene, t: Tuning, lights = false): Target | undefined {
  const p = state.player;
  const G = t.giving;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const r2 = G.offerReachPx * G.offerReachPx;
  const sight = Math.max(G.offerReachPx, seenScale(Math.max(1, seenNow(state, t)), G) * t.lampwing.noticePx);
  let best: Target | undefined;
  let bestD = 0;
  for (let i = 0; i < state.enemies.length && !lights; i++) {
    const e = state.enemies[i];
    if (!e || e.gone || e.mode === 'dead' || e.gift > 0) continue;
    if (p.giftTo === 'enemy' && p.giftIndex === i && p.giftTimer > 0) continue;
    const d = dist2(px, py, e);
    // (One that is after her she can reach as far as it can see her.)
    const own =
      e.sight > 0 ? Math.max(G.offerReachPx, (sight * e.sight) / Math.max(1, t.lampwing.noticePx)) : sight;
    // (Aware of her or braced at her: in reach a little further: round 4.)
    const meant = e.aware > 0 || e.braced;
    const r = chasing(e) ? own : meant ? Math.max(G.offerReachPx, G.offerAwareReachPx) : G.offerReachPx;
    if (d > r * r) continue;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    if (segmentBlocked(scene, px, py, ex, ey)) continue;
    if (best === undefined || d < bestD) {
      best = { to: 'enemy', i, x: ex, y: ey, kind: e.kind, id: e.id };
      bestD = d;
    }
  }
  if (best) return best;
  const goal = state.goal;
  if (goal.gathered) return undefined;
  for (const lamp of [false, true]) {
    const list = (lamp ? scene.lamps : scene.lanterns) ?? [];
    const lights = lamp ? goal.lamps : goal.lanterns;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const s = lights[i];
      if (!l || !s || s.lit) continue;
      const cost = lamp ? lampCost(l, t.goal) : lanternCost(l, t.goal);
      if (s.given >= cost) continue;
      const b = lanternBox(l, t.goal);
      const d = dist2(px, py, b);
      if (d > r2) continue;
      if (best === undefined || d < bestD) {
        best = {
          to: lamp ? 'lamp' : 'lantern',
          i,
          x: l.x,
          y: b.y + b.h / 2,
          kind: lamp ? 'lamp' : 'lantern',
          id: l.id,
        };
        bestD = d;
      }
    }
  }
  if (best) return best;
  const heart = scene.heart;
  if (heart) {
    const b = heartBox(heart, t.goal);
    if (dist2(px, py, b) <= r2)
      return { to: 'heart', i: 0, x: heart.x, y: b.y + b.h / 2, kind: 'heart', id: 'heart' };
  }
  return undefined;
}

/**
 * One step of her offering: the press (buffered while she cannot give), the glint's flight, its
 * arrival. `held`: the run is over (nothing more is given by hand).
 */
export function updateOffer(
  state: GameState,
  scene: Scene,
  t: Tuning,
  input: InputFrame,
  held: boolean,
  events: SimEvent[],
): void {
  const p = state.player;
  const G = t.giving;
  const w = state.pickups;
  if (p.offering > 0) p.offering--;
  // The glint in flight.
  if (p.giftTimer > 0 && --p.giftTimer === 0) arrive(state, scene, t, events);
  if (p.hitstop > 0) {
    if (wasPressed(input, state.prevInput, 'offer'))
      p.offerBuf = Math.max(1, Math.round(G.offerBufferFrames));
    return;
  }
  if (p.offerCd > 0) p.offerCd--;
  p.offerHold = isHeld(input, 'offer') ? p.offerHold + 1 : 0;
  if (wasPressed(input, state.prevInput, 'offer')) p.offerBuf = Math.max(1, Math.round(G.offerBufferFrames));
  else if (p.offerBuf > 0) p.offerBuf--;
  const able = !held && p.hp > 0 && p.faded === 0 && p.stagger === 0 && p.mode !== 'dash';
  // Held on: a steady stream into a light or the heart (never a creature), one in flight at a time.
  const lead = Math.max(1, Math.round(G.offerStreamDelayFrames));
  const gap = Math.max(1, Math.round(G.offerStreamFrames));
  if (p.offerBuf === 0 && p.offerHold > lead && (p.offerHold - lead) % gap === 1 % gap) {
    if (!able || p.giftTimer > 0 || w.count < 1) return;
    const to = offerTarget(state, scene, t, true);
    if (to) give(state, to, events, t);
    return;
  }
  if (p.offerBuf === 0) return;
  if (!able || p.offerCd > 0 || p.giftTimer > 0) return;
  p.offerBuf = 0;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const target = w.count >= 1 ? offerTarget(state, scene, t) : undefined;
  if (!target) {
    // Empty hands, or nothing in reach to give to: she opens her hands and nothing is spent.
    p.offerCd = Math.max(0, Math.round(G.offerCooldownFrames));
    p.offering = Math.max(0, Math.round(G.offerPoseFrames));
    p.offerSeq++;
    events.push({ type: 'offerMiss', x: cx, y: cy, reason: w.count < 1 ? 'empty' : 'none', wallet: w.count });
    return;
  }
  give(state, target, events, t);
}

/**
 * What a press would land on now (`player.offerTarget`, end of every step): the offer's own target
 * rules, and null when a press would give nothing (empty hands, out of control, the run over).
 */
export function markOfferTarget(state: GameState, scene: Scene, t: Tuning, held: boolean): void {
  const p = state.player;
  const able = !held && p.hp > 0 && p.faded === 0 && p.stagger === 0 && state.pickups.count >= 1;
  const to = able ? offerTarget(state, scene, t) : undefined;
  if (!to) p.offerTarget = null;
  else if (p.offerTarget?.kind !== to.kind || p.offerTarget.id !== to.id)
    p.offerTarget = { kind: to.kind, id: to.id };
}

/** One glint leaves her hands for `target` (it arrives `giftFrames` later: `arrive`). */
function give(state: GameState, target: Target, events: SimEvent[], t: Tuning): void {
  const p = state.player;
  const G = t.giving;
  const w = state.pickups;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  w.count -= 1;
  if (target.to === 'heart') {
    // Into the offering at once (the tally: `offered`), as the ending's would.
    w.offered += 1;
    state.goal.heartGiven += 1;
  } else {
    w.spent += 1;
    if (target.to === 'enemy') w.gifted += 1;
  }
  // The flight: at once to a lampwing that is after her, a light's gap to a light, else the plain one.
  const e = target.to === 'enemy' ? state.enemies[target.i] : undefined;
  const n = Math.max(
    1,
    Math.round(
      e && chasing(e)
        ? G.offerWingFlightFrames
        : target.to === 'enemy'
          ? G.offerFlightFrames
          : G.offerLightFlightFrames,
    ),
  );
  p.giftTo = target.to;
  p.giftIndex = target.i;
  p.giftTimer = n;
  p.giftFrames = n;
  p.giftX = target.x;
  p.giftY = target.y;
  p.offerCd = Math.max(0, Math.round(G.offerCooldownFrames));
  p.offering = Math.max(0, Math.round(G.offerPoseFrames));
  p.offerSeq++;
  // (Her side: she turns to what she gives to.)
  if (target.x !== cx) p.facing = target.x < cx ? -1 : 1;
  events.push({
    type: 'offer',
    x: cx,
    y: cy,
    tx: target.x,
    ty: target.y,
    target: { kind: target.kind as OfferKind, id: target.id },
    frames: n,
    wallet: w.count,
    seq: p.offerSeq,
  });
}

export type OfferKind = 'burrback' | 'lampwing' | 'lantern' | 'lamp' | 'heart';

/** The glint has reached what she gave it to. If that is no longer there to take it, it comes back to her. */
function arrive(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  const w = state.pickups;
  const to = p.giftTo;
  const i = p.giftIndex;
  p.giftTo = '';
  p.giftIndex = -1;
  let took = false;
  if (to === 'enemy') took = giftEnemy(state, scene, t, i, events);
  else if (to === 'lantern' || to === 'lamp') {
    const lamp = to === 'lamp';
    const l = (lamp ? scene.lamps : scene.lanterns)?.[i];
    const s = (lamp ? state.goal.lamps : state.goal.lanterns)[i];
    if (l && s && !s.lit) {
      const cost = lamp ? lampCost(l, t.goal) : lanternCost(l, t.goal);
      if (s.given < cost) {
        s.given++;
        took = true;
        events.push({
          type: lamp ? 'lampGift' : 'lanternGift',
          id: l.id,
          x: l.x,
          y: l.y,
          given: s.given,
          need: Math.max(0, cost - s.given),
          wallet: w.count,
        });
      }
    }
  } else if (to === 'heart') {
    const heart = scene.heart;
    if (heart)
      events.push({
        type: 'heartGift',
        x: heart.x,
        y: heart.y,
        given: state.goal.heartGiven,
        wallet: w.count,
      });
    return;
  }
  if (took) return;
  // Nothing took it (it was cut down, the light caught meanwhile): it comes back.
  w.count += 1;
  w.spent -= 1;
  if (to === 'enemy') w.gifted -= 1;
  events.push({
    type: 'giftReturn',
    x: p.giftX,
    y: p.giftY,
    px: p.x + p.w / 2,
    py: p.y + p.h / 2,
    wallet: w.count,
  });
}
