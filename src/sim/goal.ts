/**
 * The goal of the scene: three moth-lanterns and the heart of the grove (memory/goal.md).
 *
 *  - A lantern (`scene.lanterns`) is dormant until she kindles it: standing at it, on the ground,
 *    carrying at least its cost in glints, for `channelFrames` in a row. Stepping away, a hit or a
 *    slash breaks the channel and nothing is spent. Kindling takes the cost out of her wallet
 *    (`state.pickups.count`; `spent` goes up by as much). With too little she is told once per approach.
 *  - A lit lantern stays lit until the restart. It is a rest point: standing at it hurt for
 *    `restFrames` makes her whole for a glint a light (`giving.restCost`; up to `health.reformHp`
 *    for nothing: memory/giving.md), and the lit lantern she last stood at is where she re-forms.
 *  - Glints given to a dormant light by hand (`LanternState.given`, src/sim/giving.ts) are kept: its
 *    price is less by that much, and one given its whole price catches wherever she is.
 *  - Kindling calms the creatures round it for a while.
 *  - A wayside lamp (`scene.lamps`) is a lesser lantern: the same rules and a smaller price, its own
 *    events (`lamp...`), and it does not count toward the heart.
 *  - A dormant lantern or lamp is noticed as she comes near (`lanternNotice` / `lampNotice`), once
 *    per approach, so the picture can answer a player who never stops at it.
 *  - When every lantern is lit the heart (`scene.heart`) wakes. Walking into it then ends the run:
 *    `gather` with a summary, control is taken for `holdFrames`, then `endHold` and the scene rests
 *    (`ended`) until the restart.
 *
 * Runs at the end of every step, after the pickups (so a glint that lands this frame counts).
 */
import { calmEnemies, enemyRules, homeClear } from './enemies';
import type { SimEvent } from './events';
import { ActionBit } from './input';
import { pickupsWorth } from './pickups';
import type { Box } from './player/attack';
import { podsWorth } from './pods';
import type { Lantern, Scene } from './scene';
import type { GameState, GoalState, LanternState, PlayerState } from './state';
import type { Tuning } from './tuning';

const dormant = (): LanternState => ({
  lit: false,
  litFrame: -1,
  channel: 0,
  rest: 0,
  short: 0,
  refused: false,
  noticed: false,
  passed: false,
  pledged: false,
  still: 0,
  keyed: true,
  given: 0,
});

export function createGoal(scene: Scene): GoalState {
  return {
    lanterns: (scene.lanterns ?? []).map((l) => ({ ...dormant(), keyed: l.key === undefined })),
    lit: 0,
    restAt: -1,
    lamps: (scene.lamps ?? []).map(dormant),
    lampsLit: 0,
    restLamp: -1,
    restHold: false,
    heart: { awake: false, frames: 0, hinted: false, ready: false, waited: false },
    gathered: false,
    ending: {
      frames: 0,
      glints: 0,
      bonus: 0,
      time: 0,
      kills: 0,
      hits: 0,
      glintsTotal: 0,
      pods: 0,
      podsTotal: 0,
      greats: 0,
      greatsTotal: 0,
      enemiesTotal: 0,
      deaths: 0,
      lamps: 0,
      lampsTotal: 0,
      offered: 0,
      offerTier: 0,
      offerNext: 0,
      gifted: 0,
      calmed: 0,
    },
    offer: { total: 0, given: 0, tier: 0 },
    grove: { flowers: false, paths: false, canopy: false },
    ended: false,
    heartGiven: 0,
    run: { start: -1, hits: 0, deaths: 0 },
  };
}

const whole = (n: number, min: number): number => Math.max(min, Math.round(n));

/** What a lantern takes: its own `cost`, or the default. */
export function lanternCost(l: Lantern, t: Tuning['goal']): number {
  return whole(l.cost ?? t.cost, 0);
}

/** What a wayside lamp takes: its own `cost`, or the lamps' default. */
export function lampCost(l: Lantern, t: Tuning['goal']): number {
  return whole(l.cost ?? t.lampCost, 0);
}

/** A lantern's trigger box: centred on its foot, standing up from the surface. */
export function lanternBox(l: { x: number; y: number }, t: Tuning['goal']): Box {
  const w = whole(t.lanternWidth, 2);
  const h = whole(t.lanternHeight, 2);
  return { x: l.x - (w >> 1), y: l.y - h, w, h };
}

/** The heart's trigger box: centred on its point, standing up from the ground. */
export function heartBox(c: { x: number; y: number }, t: Tuning['goal']): Box {
  const w = whole(t.heartWidth, 2);
  const h = whole(t.heartHeight, 2);
  return { x: c.x - (w >> 1), y: c.y - h, w, h };
}

/** A light she re-forms at: its foot, which list it is in (`lamp`) and its index there, and whether it burns. */
export interface RestPoint {
  x: number;
  y: number;
  lamp: boolean;
  i: number;
  lit: boolean;
}

/**
 * Where she re-forms if a light holds her: the foot of the light nearest to where she fell, of the
 * lit lanterns and lamps and of the wayside lamps she has passed (`passed`) even if dark. Playtest 6:
 * the masher's first four fades all re-formed her at the first lantern, 4.3 s from the shaft, three
 * times over the same ground. A dark lamp is not a promise like a lit light: it counts only while no
 * living creature's home is near it (the safe-ground rule, `health.safeEnemyPx`). None: undefined
 * (the last safe ground).
 */
export function restPoint(state: GameState, scene: Scene, t: Tuning): RestPoint | undefined {
  const p = state.player;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  let best: RestPoint | undefined;
  let bestD = 0;
  const consider = (l: Lantern, s: LanternState | undefined, lamp: boolean, i: number): void => {
    if (!s || !(s.lit || (lamp && s.passed))) return;
    if (!s.lit && creatureNear(state, l.x, l.y - p.h / 2, t)) return;
    const dx = l.x - fx;
    const dy = l.y - fy;
    const d = dx * dx + dy * dy;
    // (Nearest wins; on a tie, a lit light over a dark one, then the earlier in the scene.)
    if (best === undefined || d < bestD || (d === bestD && s.lit && !best.lit)) {
      best = { x: l.x, y: l.y, lamp, i, lit: s.lit };
      bestD = d;
    }
  };
  const lanterns = scene.lanterns ?? [];
  for (let i = 0; i < lanterns.length; i++)
    consider(lanterns[i] as Lantern, state.goal.lanterns[i], false, i);
  const lamps = scene.lamps ?? [];
  for (let i = 0; i < lamps.length; i++) consider(lamps[i] as Lantern, state.goal.lamps[i], true, i);
  return best;
}

/** Is a living creature's home too near this point for her to re-form at it unprotected? */
function creatureNear(state: GameState, x: number, y: number, t: Tuning): boolean {
  const px = t.health.safeEnemyPx;
  for (const e of state.enemies) {
    if (e.mode === 'dead') continue;
    const clear = homeClear(e, px, t);
    const hx = e.homeX - x;
    const hy = e.homeY - y;
    // (Homes only: the living go home as she re-forms.)
    if (hx * hx + hy * hy < clear * clear) return true;
  }
  return false;
}

/**
 * She has just re-formed (`reformPlayer`). At a light, that light does not make her whole until
 * she has stepped out of it and come back: a fade is not a rest. Whatever was pledged is off (a
 * third of her wallet is gone).
 */
export function goalReformed(g: GoalState, at: RestPoint | undefined): void {
  // A lit light she re-forms at is her rest point now (and does not make her whole until she has
  // stepped out of it and come back); a dark lamp is only where she stands up again.
  g.restHold = at?.lit === true;
  if (at?.lit) {
    g.restAt = at.lamp ? -1 : at.i;
    g.restLamp = at.lamp ? at.i : -1;
  }
  for (const l of g.lanterns) l.pledged = false;
  for (const l of g.lamps) l.pledged = false;
}

/** Index in `scene.pickups` of the pickup called `id` (-1 = none). */
function keyIndex(scene: Scene, id: string): number {
  const list = scene.pickups ?? [];
  for (let i = 0; i < list.length; i++) if (list[i]?.id === id) return i;
  return -1;
}

/** Glints already set loose and on their way to her: a cut pod's, a dead creature's. */
function inbound(state: GameState): number {
  let n = 0;
  const left = state.pods.left;
  for (let i = 0; i < left.length; i++) n += left[i] ?? 0;
  for (let i = 0; i < state.enemies.length; i++) n += state.enemies[i]?.spill ?? 0;
  return n;
}

/** The tier (0-3) an offering of `n` glints reaches. */
export function offerTier(n: number, t: Tuning['goal']): number {
  return n >= t.offerTier3 ? 3 : n >= t.offerTier2 ? 2 : n >= t.offerTier1 ? 1 : 0;
}

/** `n` more of what she carries goes into the heart (the ending hold). */
function offer(state: GameState, scene: Scene, t: Tuning['goal'], n: number, events: SimEvent[]): void {
  const g = state.goal;
  const w = state.pickups;
  const heart = scene.heart;
  const p = state.player;
  const give = Math.max(0, Math.min(n, w.count, g.offer.total - g.offer.given));
  if (!heart) return;
  const tier = offerTier(g.offer.given + give, t);
  // (Nothing to give and no tier to pass: what she gave by hand has already been counted.)
  if (give <= 0 && tier <= g.offer.tier) return;
  w.count -= give;
  w.offered += give;
  g.offer.given += give;
  if (give > 0)
    events.push({
      type: 'heartOffer',
      x: heart.x,
      y: heart.y,
      px: p.x + p.w / 2,
      py: p.y + p.h / 2,
      value: give,
      given: g.offer.given,
      of: g.offer.total,
      wallet: w.count,
      tier,
    });
  while (g.offer.tier < tier) {
    g.offer.tier++;
    const need = g.offer.tier === 1 ? t.offerTier1 : g.offer.tier === 2 ? t.offerTier2 : t.offerTier3;
    events.push({
      type: 'heartTier',
      x: heart.x,
      y: heart.y,
      tier: g.offer.tier,
      given: g.offer.given,
      need,
    });
    // What the grove answers with, one part more for each tier: the shrine's flowers, the three
    // lantern paths' glow plants, the whole canopy's lights.
    const part = g.offer.tier === 1 ? 'flowers' : g.offer.tier === 2 ? 'paths' : 'canopy';
    g.grove[part] = true;
    events.push({
      type: 'groveWake',
      x: heart.x,
      y: heart.y,
      tier: g.offer.tier,
      part,
      given: g.offer.given,
      frame: g.ending.frames,
    });
  }
}

/** Control is taken: from `gather` on, for good unless `endedControl` gives it back after the hold. */
export function goalHolds(g: GoalState, t: Tuning['goal']): boolean {
  return g.gathered && !(g.ended && t.endedControl);
}

/**
 * What moves her while she is held (`goalHolds`): nothing, except that from `gather` she walks on
 * to the heart's centre and stops there, so the ending always finds her in the same place.
 */
export function heldInput(state: GameState, scene: Scene, t: Tuning['goal']): number {
  const heart = scene.heart;
  const p = state.player;
  if (!heart || state.goal.ended || t.heartWalkPx <= 0 || !p.grounded) return 0;
  const dx = heart.x - (p.x + p.w / 2);
  if (dx > t.heartWalkPx) return ActionBit.right;
  if (dx < -t.heartWalkPx) return ActionBit.left;
  return 0;
}

/** She stands in the box: on the ground (her feet on its base line), in the ordinary mode. */
function standsIn(p: PlayerState, b: Box): boolean {
  return p.grounded && p.mode === 'normal' && p.y + p.h === b.y + b.h && p.x < b.x + b.w && b.x < p.x + p.w;
}

function enemiesKilled(state: GameState): number {
  let n = 0;
  for (let i = 0; i < state.enemies.length; i++) if (state.enemies[i]?.mode === 'dead') n++;
  return n;
}

/**
 * One step of the goal. `first` = index in `events` of this step's first event (her `hurt` and
 * `slash` are read from there). `input` = the mask she pressed this step (for the run's clock).
 */
export function updateGoal(
  state: GameState,
  scene: Scene,
  t: Tuning,
  input: number,
  events: SimEvent[],
  first: number,
): void {
  const g = state.goal;
  const G = t.goal;
  const p = state.player;
  if (g.run.start < 0 && input !== 0) g.run.start = state.frame;
  let hurt = false;
  let slashed = false;
  for (let i = first; i < events.length; i++) {
    const type = events[i]?.type;
    if (type === 'hurt') {
      hurt = true;
      g.run.hits++;
    } else if (type === 'slash') slashed = true;
    else if (type === 'fade') g.run.deaths++;
  }
  p.kindling = -1;
  p.kindlingLamp = -1;
  const heart = scene.heart;
  if (g.heart.awake) {
    g.heart.frames++;
    // The wake is a short sequence of its own: the heart takes her in only once it has played.
    // Awake, it keeps what lives round it quiet (she may stand in its light and wait).
    if (heart && !g.gathered && G.heartCalmPx > 0 && g.heart.frames % 30 === 1)
      calmEnemies(state, scene, t, events, heart.x, heart.y - whole(G.heartHeight, 2) / 2, G.heartCalmPx, 45);
    if (!g.heart.ready && g.heart.frames >= whole(G.heartWakeFrames, 0)) {
      g.heart.ready = true;
      if (heart) events.push({ type: 'heartReady', x: heart.x, y: heart.y, waited: g.heart.waited });
    }
  }

  // The ending hold.
  if (g.gathered) {
    // The offering: what she carries goes into the heart, a little each step.
    if (!g.ended && (g.offer.given < g.offer.total || g.offer.tier < offerTier(g.offer.given, G))) {
      const since = g.ending.frames + 1 - whole(G.offerDelayFrames, 0);
      const span = whole(G.offerSpanFrames, 1);
      const gap = Math.max(1, Math.floor(span / Math.max(1, g.offer.total)));
      if (since >= 0 && since % gap === 0)
        offer(state, scene, G, Math.ceil((g.offer.total * gap) / span), events);
    }
    if (!g.ended && ++g.ending.frames >= whole(G.holdFrames, 1)) {
      // (A hold too short for it: the rest goes in at once.)
      offer(state, scene, G, g.offer.total, events);
      g.ended = true;
      events.push({ type: 'endHold', x: heart?.x ?? 0, y: heart?.y ?? 0 });
    }
  }

  const control = p.hp > 0 && p.faded === 0 && p.stagger === 0 && !hurt;
  const wallet = state.pickups;
  const list = scene.lanterns ?? [];

  // The heart: a hint while it sleeps; the end of the run once it is awake.
  if (heart && !g.gathered) {
    const b = heartBox(heart, G);
    const inside = p.x < b.x + b.w && b.x < p.x + p.w && p.y < b.y + b.h && b.y < p.y + p.h;
    if (!g.heart.awake) {
      if (inside && !g.heart.hinted && list.length > 0) {
        g.heart.hinted = true;
        events.push({ type: 'heartSleep', x: heart.x, y: heart.y, lit: g.lit, total: list.length });
      }
    } else if (control && standsIn(p, b) && !g.heart.ready) {
      // Early: she stands in the waking light until it is ready for her (her input stays hers).
      if (!g.heart.waited) {
        g.heart.waited = true;
        events.push({
          type: 'heartWait',
          x: heart.x,
          y: heart.y,
          frames: Math.max(0, whole(G.heartWakeFrames, 0) - g.heart.frames),
        });
      }
    } else if (control && standsIn(p, b)) {
      g.gathered = true;
      g.ending.frames = 0;
      g.ending.time = g.run.start < 0 ? 0 : state.frame - g.run.start;
      g.ending.kills = enemiesKilled(state);
      g.ending.hits = g.run.hits;
      // The tally: what there was to find. Glints: every pickup, every pod, and every creature at
      // its base worth. What finisher kills paid on top is the bonus, counted apart, so "found"
      // can never pass "all there were" and 100% does not ask for every kill by the finisher.
      let foes = 0;
      for (const f of scene.enemies ?? [])
        foes += Math.max(0, Math.round(enemyRules(f.kind).value(t, false)));
      let greats = 0;
      let greatsTotal = 0;
      const picks = scene.pickups ?? [];
      for (let i = 0; i < picks.length; i++) {
        if (picks[i]?.kind !== 'great') continue;
        greatsTotal++;
        if ((wallet.timers[i] ?? 0) < 0) greats++;
      }
      g.ending.glintsTotal = pickupsWorth(scene, t.pickups) + podsWorth(scene, t.pods) + foes;
      const all = wallet.count + wallet.spent + wallet.lost + wallet.offered;
      // (Every glint that reaches her comes from a pickup, a pod or a creature, so found <= total
      // by construction; nothing is clamped here.)
      g.ending.bonus = Math.max(0, Math.min(wallet.bonus, all));
      g.ending.glints = all - g.ending.bonus;
      g.ending.pods = state.pods.burst;
      g.ending.podsTotal = scene.pods?.length ?? 0;
      g.ending.greats = greats;
      g.ending.greatsTotal = greatsTotal;
      g.ending.enemiesTotal = state.enemies.length;
      g.ending.deaths = g.run.deaths;
      g.ending.lamps = g.lampsLit;
      g.ending.lampsTotal = scene.lamps?.length ?? 0;
      // The offering: all she carries, and what she gave by hand on the way, to the heart and to the
      // creatures (memory/giving.md: that light went into the grove too; the giver is not tier 0).
      const handed = g.heartGiven + wallet.gifted;
      const offered = wallet.count + handed;
      g.ending.offered = offered;
      g.ending.offerTier = offerTier(offered, G);
      g.ending.offerNext =
        g.ending.offerTier >= 3
          ? 0
          : (g.ending.offerTier === 2
              ? G.offerTier3
              : g.ending.offerTier === 1
                ? G.offerTier2
                : G.offerTier1) - offered;
      g.ending.gifted = wallet.gifted;
      let calmed = 0;
      for (const e of state.enemies) if (e.gifts > 0) calmed++;
      g.ending.calmed = calmed;
      g.offer.total = offered;
      g.offer.given = handed;
      g.offer.tier = 0;
      // Nothing of hers is left waiting to fire while she is held.
      p.jumpBuf = 0;
      p.djBuf = 0;
      p.dashBuf = 0;
      p.attackBuf = 0;
      const hold = whole(G.holdFrames, 1);
      calmEnemies(state, scene, t, events, heart.x, heart.y, -1, hold);
      events.push({
        type: 'gather',
        x: heart.x,
        y: heart.y,
        px: p.x + p.w / 2,
        py: p.y + p.h,
        glints: g.ending.glints,
        bonus: g.ending.bonus,
        time: g.ending.time,
        lanterns: g.lit,
        kills: g.ending.kills,
        hits: g.ending.hits,
        frames: hold,
        glintsTotal: g.ending.glintsTotal,
        pods: g.ending.pods,
        podsTotal: g.ending.podsTotal,
        greats: g.ending.greats,
        greatsTotal: g.ending.greatsTotal,
        enemiesTotal: g.ending.enemiesTotal,
        deaths: g.ending.deaths,
        lamps: g.ending.lamps,
        lampsTotal: g.ending.lampsTotal,
        offered: g.ending.offered,
        offerTier: g.ending.offerTier,
        offerNext: g.ending.offerNext,
        offerTiers: [G.offerTier1, G.offerTier2, G.offerTier3],
        gifted: g.ending.gifted,
        calmed: g.ending.calmed,
      });
    }
  }

  updateLights(state, scene, t, events, false, control, hurt, slashed);
  updateLights(state, scene, t, events, true, control, hurt, slashed);
}

/**
 * One step of the lanterns (`lamp` false) or of the wayside lamps (`lamp` true): the same rules,
 * their own lists, prices and event names. Only a lantern counts for the heart.
 */
function updateLights(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  lamp: boolean,
  control: boolean,
  hurt: boolean,
  slashed: boolean,
): void {
  const g = state.goal;
  const G = t.goal;
  const p = state.player;
  const wallet = state.pickups;
  const list = (lamp ? scene.lamps : scene.lanterns) ?? [];
  const lights = lamp ? g.lamps : g.lanterns;
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  const coming = inbound(state);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    const s = lights[i];
    if (!l || !s) continue;
    const b = lanternBox(l, G);
    const at = control && standsIn(p, b);
    const id = l.id;
    const x = l.x;
    const y = l.y;

    if (s.lit) {
      // A rest point: where she re-forms, and where she is made whole.
      const here = lamp ? g.restLamp === i : g.restAt === i;
      if (!at) {
        s.rest = 0;
        // Out of the light she re-formed in (on her own feet): coming back to it is a rest again.
        if (here && g.restHold && control && p.grounded) g.restHold = false;
        continue;
      }
      if (!here) g.restHold = false;
      g.restAt = lamp ? -1 : i;
      g.restLamp = lamp ? i : -1;
      if (p.hp >= p.hpMax || g.restHold) {
        s.rest = 0;
        continue;
      }
      // (Once a visit: rested as far as she could give for, she stays as she is until she steps away.)
      const of = whole(G.restFrames, 1);
      if (s.rest >= of || ++s.rest < of) continue;
      // Rest = give (memory/giving.md): up to a re-form's health for nothing, every light above that
      // for `giving.restCost` glints, as far as her wallet goes.
      const floor = Math.min(p.hpMax, whole(t.health.reformHp, 1));
      const base = Math.max(p.hp, floor);
      const price = whole(t.giving.restCost, 0);
      const bought = price > 0 ? Math.min(p.hpMax - base, Math.floor(wallet.count / price)) : p.hpMax - base;
      const free = base - p.hp;
      const cost = bought * price;
      const healed = free + bought;
      wallet.count -= cost;
      wallet.spent += cost;
      p.hp = base + bought;
      // Made whole: the next rest is a new one. Short of it: none again this visit.
      if (p.hp >= p.hpMax) s.rest = 0;
      events.push({
        type: lamp ? 'lampRest' : 'lanternRest',
        id,
        x,
        y,
        hp: p.hp,
        hpMax: p.hpMax,
        healed,
        free,
        cost,
        wallet: wallet.count,
        short: p.hp < p.hpMax,
      });
      continue;
    }

    // (What she has given it by hand is kept: its price is less by that much.)
    const need = Math.max(0, (lamp ? lampCost(l, G) : lanternCost(l, G)) - s.given);
    // A lantern may want a great glint of the scene besides its price: until she has gathered it,
    // it will not catch (it tells her what it wants: `lanternRefuse.key`).
    const key = l.key === undefined ? -1 : keyIndex(scene, l.key);
    const keyAt = key >= 0 ? scene.pickups?.[key] : undefined;
    const keyed = key < 0 || (wallet.timers[key] ?? 0) < 0;
    // Taking it is a ceremony (the great glint's flight to her): nothing may hurt her in it, nor for
    // a beat after. The creatures round her are calmed, as by a kindling.
    if (keyAt && ((wallet.timers[key] ?? 0) > 0 || (keyed && !s.keyed)))
      calmEnemies(state, scene, t, events, pcx, pcy, G.keyCalmPx, whole(G.keyCalmFrames, 0));
    if (keyed && !s.keyed && keyAt) {
      s.keyed = true;
      events.push({ type: 'lanternKey', id, x, y, key: keyAt.id, kx: keyAt.x, ky: keyAt.y });
    }
    s.keyed = keyed;
    // Noticed as she comes near, once per approach: nothing happens here, the picture answers.
    const nx = pcx - (b.x + b.w / 2);
    const ny = pcy - (b.y + b.h / 2);
    const far = nx * nx + ny * ny;
    if (s.noticed) {
      if (far > G.noticeLeavePx * G.noticeLeavePx) s.noticed = false;
    } else if (control && !g.gathered && far <= G.noticePx * G.noticePx) {
      s.noticed = true;
      s.passed = true;
      events.push({
        type: lamp ? 'lampNotice' : 'lanternNotice',
        id,
        x,
        y,
        have: wallet.count,
        need,
        ...(keyAt && !keyed ? { key: { id: keyAt.id, x: keyAt.x, y: keyAt.y } } : {}),
      });
    }
    if (s.refused) {
      // Sideways only: a hop on the spot is still the same visit.
      if (Math.abs(pcx - l.x) > G.refuseLeavePx) s.refused = false;
    }
    // A lamp wants intent: she has stood still at it a moment (a lantern is the goal: it starts at once).
    const idle = at && p.inputX === 0 && Math.abs(p.vx) < G.refuseStillVx && p.attack === 'none' && !slashed;
    s.still = idle ? s.still + 1 : 0;
    const meant = !lamp || s.channel > 0 || s.still >= whole(G.lampStillFrames, 0);
    const calm = at && p.attack === 'none' && !slashed && !g.gathered && meant;
    // Once started it runs on while she stays on its leash, whatever she does there.
    const lx = pcx - l.x;
    const held =
      s.channel > 0 &&
      control &&
      !g.gathered &&
      lx <= G.kindleLeashPx &&
      lx >= -G.kindleLeashPx &&
      ny <= G.kindleLeashUpPx &&
      ny >= -G.kindleLeashUpPx;
    // Pledged: she stands at it short, and what she lacks is already in the air on its way to her
    // (the pod she cut at its foot). From here it catches the step those have landed, wherever she
    // is by then; while she stays, the channel shows (a slash does not break it any more).
    if (
      !s.pledged &&
      keyed &&
      at &&
      meant &&
      !g.gathered &&
      wallet.count < need &&
      wallet.count + coming >= need
    )
      s.pledged = true;
    if (s.pledged && wallet.count + coming < need) s.pledged = false;
    // Given its whole price by hand (and it has its key): it catches, wherever she is. A LANTERN given
    // part of it by hand is promised: it catches the step her wallet covers the rest, wherever she is
    // (as a pledge does), so laying light down never strands her (playtest-giving: the ghost gave
    // lantern-far all she had and stood empty at a dead end). Lamps are optional: they wait for her.
    const promised = !lamp && s.given > 0 && keyed && wallet.count >= need;
    const paid =
      ((s.pledged && wallet.count >= need) || (s.given > 0 && need === 0 && keyed) || promised) &&
      !g.gathered;
    if (keyed && (paid || ((calm || held) && wallet.count >= need) || (s.pledged && at))) {
      s.short = 0;
      const of = whole(G.channelFrames, 1);
      if (at) {
        if (lamp) p.kindlingLamp = i;
        else p.kindling = i;
      }
      // (Waiting on the pledged glints, the count holds one short of the end.)
      if (!paid) s.channel = wallet.count >= need ? s.channel + 1 : Math.min(s.channel + 1, of - 1);
      if (!paid && s.channel < of) {
        events.push({ type: lamp ? 'lampChannel' : 'lanternChannel', id, x, y, frames: s.channel, of });
        continue;
      }
      // Kindled.
      const pledged = s.pledged;
      wallet.count -= need;
      wallet.spent += need;
      s.pledged = false;
      s.lit = true;
      s.litFrame = state.frame;
      s.channel = 0;
      s.short = 0;
      s.still = 0;
      s.refused = false;
      p.kindling = -1;
      p.kindlingLamp = -1;
      g.restAt = lamp ? -1 : i;
      g.restLamp = lamp ? i : -1;
      g.restHold = false;
      if (lamp) g.lampsLit++;
      else g.lit++;
      events.push({
        type: lamp ? 'lampKindle' : 'lanternKindle',
        id,
        x,
        y,
        cost: need,
        wallet: wallet.count,
        lit: lamp ? g.lampsLit : g.lit,
        total: list.length,
        pledged,
        away: !at,
      });
      calmEnemies(state, scene, t, events, l.x, b.y + b.h / 2, G.calmPx, whole(G.calmFrames, 0));
      const heart = scene.heart;
      if (!lamp && g.lit === list.length && !g.heart.awake && heart) {
        g.heart.awake = true;
        g.heart.frames = 0;
        events.push({ type: 'heartWake', x: heart.x, y: heart.y });
      }
      continue;
    }
    if (s.channel > 0) {
      const reason = hurt || p.stagger > 0 || p.faded > 0 || p.hp <= 0 ? 'hurt' : 'leave';
      events.push({ type: lamp ? 'lampCancel' : 'lanternCancel', id, x, y, frames: s.channel, reason });
      s.channel = 0;
    }
    // Too little: it says so once she has stood still at it a moment (a run through says nothing).
    const waiting = at && !g.gathered && (wallet.count < need || !keyed) && Math.abs(p.vx) < G.refuseStillVx;
    s.short = waiting ? s.short + 1 : 0;
    if (waiting && !s.refused && s.short >= whole(G.refuseFrames, 1)) {
      s.refused = true;
      events.push({
        type: lamp ? 'lampRefuse' : 'lanternRefuse',
        id,
        x,
        y,
        have: wallet.count,
        need,
        show: whole(G.refuseShowFrames, 0),
        ...(keyAt && !keyed ? { key: { id: keyAt.id, x: keyAt.x, y: keyAt.y } } : {}),
      });
    }
  }
}
