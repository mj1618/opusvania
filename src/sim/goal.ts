/**
 * The goal of the scene: three moth-lanterns and the heart of the grove (memory/goal.md).
 *
 *  - A lantern (`scene.lanterns`) is dormant until she kindles it: standing at it, on the ground,
 *    carrying at least its cost in glints, for `channelFrames` in a row. Stepping away, a hit or a
 *    slash breaks the channel and nothing is spent. Kindling takes the cost out of her wallet
 *    (`state.pickups.count`; `spent` goes up by as much). With too little she is told once per approach.
 *  - A lit lantern stays lit until the restart. It is a rest point: standing at it hurt for
 *    `restFrames` makes her whole, and the lit lantern she last stood at is where she re-forms.
 *  - Kindling calms the creatures round it for a while.
 *  - When every lantern is lit the heart (`scene.heart`) wakes. Walking into it then ends the run:
 *    `gather` with a summary, control is taken for `holdFrames`, then `endHold` and the scene rests
 *    (`ended`) until the restart.
 *
 * Runs at the end of every step, after the pickups (so a glint that lands this frame counts).
 */
import { calmEnemies, enemyRules } from './enemies';
import type { SimEvent } from './events';
import { ActionBit } from './input';
import { pickupsWorth } from './pickups';
import type { Box } from './player/attack';
import { podsWorth } from './pods';
import type { Lantern, Scene } from './scene';
import type { GameState, GoalState, PlayerState } from './state';
import type { Tuning } from './tuning';

export function createGoal(scene: Scene): GoalState {
  return {
    lanterns: (scene.lanterns ?? []).map(() => ({
      lit: false,
      litFrame: -1,
      channel: 0,
      rest: 0,
      short: 0,
      refused: false,
    })),
    lit: 0,
    restAt: -1,
    heart: { awake: false, frames: 0, hinted: false },
    gathered: false,
    ending: {
      frames: 0,
      glints: 0,
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
    },
    ended: false,
    run: { start: -1, hits: 0, deaths: 0 },
  };
}

const whole = (n: number, min: number): number => Math.max(min, Math.round(n));

/** What a lantern takes: its own `cost`, or the default. */
export function lanternCost(l: Lantern, t: Tuning['goal']): number {
  return whole(l.cost ?? t.cost, 0);
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

/** Where she re-forms if a lantern holds her: the foot of the lit lantern she last stood at. */
export function restPoint(state: GameState, scene: Scene): { x: number; y: number } | undefined {
  const i = state.goal.restAt;
  const l = i >= 0 ? scene.lanterns?.[i] : undefined;
  return l && state.goal.lanterns[i]?.lit ? l : undefined;
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
  const heart = scene.heart;
  if (g.heart.awake) g.heart.frames++;

  // The ending hold.
  if (g.gathered) {
    if (!g.ended && ++g.ending.frames >= whole(G.holdFrames, 1)) {
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
    } else if (control && standsIn(p, b)) {
      g.gathered = true;
      g.ending.frames = 0;
      g.ending.glints = wallet.count + wallet.spent + wallet.lost;
      g.ending.time = g.run.start < 0 ? 0 : state.frame - g.run.start;
      g.ending.kills = enemiesKilled(state);
      g.ending.hits = g.run.hits;
      // The tally: what there was to find. Glints: every pickup, every pod, and every creature at
      // its best (felled by the finisher).
      let foes = 0;
      for (const f of scene.enemies ?? []) foes += Math.max(0, Math.round(enemyRules(f.kind).value(t, true)));
      let greats = 0;
      let greatsTotal = 0;
      const picks = scene.pickups ?? [];
      for (let i = 0; i < picks.length; i++) {
        if (picks[i]?.kind !== 'great') continue;
        greatsTotal++;
        if ((wallet.timers[i] ?? 0) < 0) greats++;
      }
      g.ending.glintsTotal = pickupsWorth(scene, t.pickups) + podsWorth(scene, t.pods) + foes;
      g.ending.pods = state.pods.burst;
      g.ending.podsTotal = scene.pods?.length ?? 0;
      g.ending.greats = greats;
      g.ending.greatsTotal = greatsTotal;
      g.ending.enemiesTotal = state.enemies.length;
      g.ending.deaths = g.run.deaths;
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
      });
    }
  }

  const pcx = p.x + p.w / 2;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    const s = g.lanterns[i];
    if (!l || !s) continue;
    const b = lanternBox(l, G);
    const at = control && standsIn(p, b);

    if (s.lit) {
      // A rest point: where she re-forms, and where she is made whole.
      if (!at) {
        s.rest = 0;
        continue;
      }
      g.restAt = i;
      if (p.hp >= p.hpMax) {
        s.rest = 0;
        continue;
      }
      if (++s.rest < whole(G.restFrames, 1)) continue;
      const healed = p.hpMax - p.hp;
      p.hp = p.hpMax;
      s.rest = 0;
      events.push({ type: 'lanternRest', id: l.id, x: l.x, y: l.y, hp: p.hp, hpMax: p.hpMax, healed });
      continue;
    }

    const need = lanternCost(l, G);
    if (s.refused) {
      // Sideways only: a hop on the spot is still the same visit.
      if (Math.abs(pcx - l.x) > G.refuseLeavePx) s.refused = false;
    }
    const calm = at && p.attack === 'none' && !slashed && !g.gathered;
    if (calm && wallet.count >= need) {
      s.short = 0;
      const of = whole(G.channelFrames, 1);
      s.channel++;
      p.kindling = i;
      if (s.channel < of) {
        events.push({ type: 'lanternChannel', id: l.id, x: l.x, y: l.y, frames: s.channel, of });
        continue;
      }
      // Kindled.
      wallet.count -= need;
      wallet.spent += need;
      s.lit = true;
      s.litFrame = state.frame;
      s.channel = 0;
      s.short = 0;
      s.refused = false;
      p.kindling = -1;
      g.lit++;
      g.restAt = i;
      events.push({
        type: 'lanternKindle',
        id: l.id,
        x: l.x,
        y: l.y,
        cost: need,
        wallet: wallet.count,
        lit: g.lit,
        total: list.length,
      });
      calmEnemies(state, scene, t, events, l.x, b.y + b.h / 2, G.calmPx, whole(G.calmFrames, 0));
      if (g.lit === list.length && !g.heart.awake && heart) {
        g.heart.awake = true;
        g.heart.frames = 0;
        events.push({ type: 'heartWake', x: heart.x, y: heart.y });
      }
      continue;
    }
    if (s.channel > 0) {
      const reason =
        hurt || p.stagger > 0 || p.faded > 0 || p.hp <= 0
          ? 'hurt'
          : slashed || p.attack !== 'none'
            ? 'attack'
            : 'leave';
      events.push({ type: 'lanternCancel', id: l.id, x: l.x, y: l.y, frames: s.channel, reason });
      s.channel = 0;
    }
    // Too little: it says so once she has stood still at it a moment (a run through says nothing).
    const waiting = at && !g.gathered && wallet.count < need && Math.abs(p.vx) < G.refuseStillVx;
    s.short = waiting ? s.short + 1 : 0;
    if (waiting && !s.refused && s.short >= whole(G.refuseFrames, 1)) {
      s.refused = true;
      events.push({
        type: 'lanternRefuse',
        id: l.id,
        x: l.x,
        y: l.y,
        have: wallet.count,
        need,
        show: whole(G.refuseShowFrames, 0),
      });
    }
  }
}
