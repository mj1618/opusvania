/**
 * Lanternroot's light (docs/design/levels/proto-1.md §3, §5; memory/glow.md): the rules of the prototype level's
 * rooms, all data-driven and inert elsewhere.
 *
 *  - **Glow** (`player.glow`, only in rooms with `scene.glow`): hits, kills, lamps out and glints fill it
 *    (`glowGain`, read off the step's own events at its end, so no other rule needs to know); Mend and Kindle
 *    spend it (src/sim/player/player.ts `lampVerb`); a fade leaves all of it where she fell (`dropGlow`).
 *    Glints are saved as taken there (`save.taken` `room:id`) and count for completion.
 *  - **Moonwicks** (`lures[].kind: 'moonwick'`): cold until kindled (`kindle`), then they burn
 *    `moonwick.burn` frames (`lureGutter` for the last `gutter`, `lureCold` at the end), or for good (`keep`, or a
 *    `wickSets` set burning whole on one frame: its flag saved, `wickSet`). They are fling anchors that never
 *    ember (src/sim/lures.ts), the blade passes through them, and their silver light is no lamp light
 *    (src/sim/enemies/senses.ts): it makes hawkers and danglers shy (`shyOf`) and moonmoss solid.
 *  - **Moonmoss** (`scene.moonmoss`): a ledge solid (or one-way) only while its centre is in a burning
 *    moonwick's light; one that would appear inside her waits until she is clear (`mossOn` / `mossOff`).
 *  - **Gust** (`startGust`, the flight in `updateLight`): a puff that snuffs warm lamps from range, fans a burning
 *    moonwick, knocks a hawker out of its strike, knocks a dangler back up its thread, shoves beetles.
 *  - **Bells** (`scene.bells`, struck in src/sim/kit.ts `slashKit`): the gaps between strikes in the dark make a
 *    phrase (`strikeBell`); the right one sets the bell's flag.
 *  - **Glow pods** (`pods[].regrow`), **respawning creatures** (`enemies[].respawn`, `fight`), and **heartwood**
 *    a burrback's ram breaks (`barkBreak {by: 'ram'}`).
 *
 * Pure: + - * / sqrt floor round min max abs.
 */
import { createEnemy } from './enemies';
import type { SimEvent } from './events';
import { createLight, type LightState, wickBurn } from './light-state';
import { flameAt, lureHpMax, snuffLure } from './lures';
import { solidAt } from './physics/aabb';
import { PICKUP_TAKEN } from './pickups';
import { podHpMax } from './pods';
import type { Scene, SolidRect } from './scene';
import type { GameState, LuresState, PlayerState, SaveState } from './state';
import type { Tuning } from './tuning';

export { createLight, wickBurn };

const F = { x: 0, y: 0 };

/** The save key of a piece of this room. */
function key(scene: Scene, id: string): string {
  return `${scene.id}:${id}`;
}

/** Her body centre. */
function cx(p: PlayerState): number {
  return p.x + p.w / 2;
}
function cy(p: PlayerState): number {
  return p.y + p.h / 2;
}

// --- Set-up (createLocal).

/**
 * The room's moonwicks as she finds them: cold, except those the save keeps burning (`keep` ones she lit, the
 * wicks of a set that burned whole: `room:id` in `save.opened`), which burn for good (`burn` -1).
 */
export function initWicks(lures: LuresState, scene: Scene, save: SaveState): void {
  const list = scene.lures ?? [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l?.kind !== 'moonwick') continue;
    // (`lit`: a wick that burns for good from the start: the boss rush's arenas, where no one kindles.)
    const kept = l.lit === true || save.opened.includes(key(scene, l.id));
    lures.hp[i] = kept ? 1 : 0;
    lures.out[i] = 0;
    lures.burn[i] = kept ? -1 : 0;
  }
}

/** In a glow room the glints she has taken (ever) are gone: `save.taken` has `room:id`. */
export function initTaken(state: Pick<GameState, 'pickups'>, scene: Scene, save: SaveState): void {
  if (!scene.glow) return;
  const list = scene.pickups ?? [];
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g && save.taken.includes(key(scene, g.id))) state.pickups.timers[i] = PICKUP_TAKEN;
  }
}

// --- Moonmoss in the solids.

const MOSS_SCENES = new WeakMap<Scene, { key: string; scene: Scene }>();

/** The scene as played with the moonmoss that is on now (solids, or one-ways for `oneWay` pieces). */
export function withMoss(scene: Scene, light: LightState): Scene {
  const list = scene.moonmoss;
  if (!list || list.length === 0) return scene;
  let k = '';
  for (let i = 0; i < list.length; i++) if (light.moss[i]) k += `${i}|`;
  if (k === '') return scene;
  const hit = MOSS_SCENES.get(scene);
  if (hit && hit.key === k) return hit.scene;
  const solids: SolidRect[] = [];
  const oneWays = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || !light.moss[i]) continue;
    if (m.oneWay) oneWays.push({ x: m.x, y: m.y, w: m.w, tag: 'ledge' as const });
    else solids.push({ x: m.x, y: m.y, w: m.w, h: m.h, tag: 'ledge', kit: 'moss' });
  }
  const eff: Scene = {
    ...scene,
    solids: solids.length ? [...scene.solids, ...solids] : scene.solids,
    oneWays: oneWays.length ? [...scene.oneWays, ...oneWays] : scene.oneWays,
  };
  MOSS_SCENES.set(scene, { key: k, scene: eff });
  return eff;
}

/** Is the point inside a burning moonwick's light? */
function silverAt(state: GameState, scene: Scene, t: Tuning, x: number, y: number): boolean {
  const list = scene.lures;
  if (!list) return false;
  const r = t.moonwick.light;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l?.kind !== 'moonwick' || (state.lures.hp[i] ?? 0) <= 0) continue;
    flameAt(state.lures, i, l, state.frame, t, F);
    const dx = x - F.x;
    const dy = y - F.y;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

// --- Glow.

/** Her glow meter's top (the vessel raises it: `withUpgrades`). */
export function glowMax(t: Tuning): number {
  return Math.max(0, Math.round(t.glow.max));
}

/** Adds `n` sparks (clamped to the meter), pushing `glowGain` if anything went in. */
export function gainGlow(
  state: GameState,
  t: Tuning,
  n: number,
  from: 'hit' | 'kill' | 'snuff' | 'glint',
  events: SimEvent[],
): void {
  const p = state.player;
  const max = glowMax(t);
  const add = Math.max(0, Math.min(max - p.glow, Math.round(n)));
  if (add <= 0) return;
  p.glow += add;
  events.push({ type: 'glowGain', n: add, from, glow: p.glow, max, x: cx(p), y: cy(p) });
}

/** Spends `n` sparks (`glowSpend`). The caller checked she has them. */
export function spendGlow(state: GameState, n: number, why: 'mend' | 'kindle', events: SimEvent[]): void {
  const p = state.player;
  p.glow = Math.max(0, p.glow - n);
  events.push({ type: 'glowSpend', n, for: why, glow: p.glow, x: cx(p), y: cy(p) });
}

/** A fade in a glow room: all her glow lies where she fell, a cluster that comes back as glow. */
export function dropGlow(state: GameState, scene: Scene, events: SimEvent[]): void {
  const p = state.player;
  const value = p.glow;
  if (value <= 0) return;
  const s = state.pickups;
  let y = p.y;
  // (Settled onto whatever is under her, as the wallet's cluster.)
  for (let i = 0; i < scene.height && !solidAt(scene, p.x, y + 1, p.w, p.h) && y + p.h < scene.height; i++)
    y++;
  const drop = {
    id: ++s.dropSeq,
    x: p.x + (p.w >> 1),
    y: y + (p.h >> 1),
    value,
    left: value,
    timer: 0,
    glow: true,
  };
  s.drops.push(drop);
  p.glow = 0;
  events.push({ type: 'glintsDrop', id: drop.id, x: drop.x, y: drop.y, value, wallet: s.count });
}

// --- Kindle.

/** The cold moonwick in kindle reach (its `fling` radius of her body centre), nearest first; -1 none. */
export function kindleTarget(state: GameState, scene: Scene, t: Tuning): number {
  const list = scene.lures;
  if (!list) return -1;
  const p = state.player;
  const x = cx(p);
  const y = cy(p);
  const r = t.lures.kinds.moonwick.fling;
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l?.kind !== 'moonwick' || (state.lures.hp[i] ?? 0) > 0) continue;
    flameAt(state.lures, i, l, state.frame, t, F);
    const d = (F.x - x) * (F.x - x) + (F.y - y) * (F.y - y);
    if (d <= r * r && d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** The cost of a kindle (Bright Kindle lowers it: `withUpgrades`). */
export function kindleCost(t: Tuning): number {
  return Math.max(0, Math.round(t.glow.kindleCost));
}

/**
 * Moonwick `i` takes her light: `kindleCost` glow, then it burns `moonwick.burn` frames (for good if `keep`:
 * saved). Too little glow: `kindleRefuse` (the bud flickers once) and nothing else.
 */
export function kindle(state: GameState, scene: Scene, i: number, t: Tuning, events: SimEvent[]): boolean {
  const l = scene.lures?.[i];
  if (!l) return false;
  const p = state.player;
  const cost = kindleCost(t);
  flameAt(state.lures, i, l, state.frame, t, F);
  if (p.glow < cost) {
    events.push({ type: 'kindleRefuse', id: l.id, glow: p.glow, cost, x: F.x, y: F.y });
    return false;
  }
  if (cost > 0) spendGlow(state, cost, 'kindle', events);
  lightWick(state, scene, i, t, l.keep === true);
  events.push({
    type: 'lureKindle',
    id: l.id,
    burn: state.lures.burn[i] as number,
    keep: l.keep === true,
    cost,
    x: F.x,
    y: F.y,
  });
  return true;
}

/** Moonwick `i` burns: for its burn, or for good (`keep`: saved in `opened`). */
function lightWick(state: GameState, scene: Scene, i: number, t: Tuning, keep: boolean): void {
  const l = scene.lures?.[i];
  if (!l) return;
  state.lures.hp[i] = lureHpMax(l, t);
  state.lures.out[i] = 0;
  state.lures.burn[i] = keep ? -1 : wickBurn(l, t);
  if (keep) {
    const k = key(scene, l.id);
    if (!state.save.opened.includes(k)) state.save.opened.push(k);
  }
}

// --- Gust.

/**
 * A gust leaves her (Lamp tapped, nothing in reach, owned): from her centre along the held 8-way direction
 * (`aimX`, `aimY`; facing if none). Tapped with Down held in the air, it is also her hop (`gust.hopVy`, once an
 * airtime). Pushes `gust`.
 */
export function startGust(state: GameState, t: Tuning, aimX: number, aimY: number, events: SimEvent[]): void {
  const p = state.player;
  const G = t.gust;
  let dx = aimX;
  let dy = aimY;
  if (dx === 0 && dy === 0) dx = p.facing;
  const m = Math.sqrt(dx * dx + dy * dy);
  dx /= m;
  dy /= m;
  const hop = aimY > 0 && aimX === 0 && !p.grounded && p.gustHop > 0;
  if (hop) {
    p.gustHop = 0;
    p.vy = Math.min(p.vy, G.hopVy);
    p.fromJump = false;
    p.sustain = 0;
  }
  state.light.gust = { x: cx(p), y: cy(p), dx, dy, frames: Math.max(1, Math.round(G.frames)), hits: [] };
  p.gustCd = Math.max(0, Math.round(G.cooldown));
  events.push({ type: 'gust', x: cx(p), y: cy(p), dx, dy, frames: state.light.gust.frames, hop });
}

/** Do the gust's box (centre gx, gy) and the box overlap? */
function inGust(gx: number, gy: number, half: number, x: number, y: number, w: number, h: number): boolean {
  return gx - half < x + w && x < gx + half && gy - half < y + h && y < gy + half;
}

/** One frame of the gust in flight: it moves in small steps, meeting things once each, until a wall or its end. */
function flyGust(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const g = state.light.gust;
  if (!g) return;
  const G = t.gust;
  const half = Math.round(G.size) >> 1;
  const steps = 4;
  const v = G.speed / steps;
  for (let k = 0; k < steps; k++) {
    const nx = g.x + g.dx * v;
    const ny = g.y + g.dy * v;
    // (A solid stops it: the puff breaks on the wall.)
    if (solidAt(scene, Math.round(nx - half / 2), Math.round(ny - half / 2), half, half)) {
      events.push({ type: 'gustEnd', x: Math.round(g.x), y: Math.round(g.y), wall: true });
      state.light.gust = null;
      return;
    }
    g.x = nx;
    g.y = ny;
    gustMeets(state, scene, t, g, half, events);
  }
  if (--g.frames <= 0) {
    events.push({ type: 'gustEnd', x: Math.round(g.x), y: Math.round(g.y), wall: false });
    state.light.gust = null;
  }
}

/** What the gust meets where it is now (each once). */
function gustMeets(
  state: GameState,
  scene: Scene,
  t: Tuning,
  g: NonNullable<LightState['gust']>,
  half: number,
  events: SimEvent[],
): void {
  const lures = scene.lures ?? [];
  const L = state.lures;
  const r = t.lures.flameRadius;
  for (let i = 0; i < lures.length; i++) {
    const l = lures[i];
    if (!l || (L.hp[i] ?? 0) <= 0 || g.hits.includes(l.id)) continue;
    if ((L.live?.shield[i] ?? 0) > 0) continue;
    flameAt(L, i, l, state.frame, t, F);
    if (!inGust(g.x, g.y, half, F.x - r, F.y - r, 2 * r, 2 * r)) continue;
    if (l.kind === 'great' || l.kind === 'greatWide') continue;
    g.hits.push(l.id);
    if (l.kind === 'moonwick') {
      // Fanned: its burn starts over (a kept one burns for good anyway).
      if ((L.burn[i] ?? 0) > 0) L.burn[i] = wickBurn(l, t);
      events.push({ type: 'lureFan', id: l.id, burn: L.burn[i] as number, x: F.x, y: F.y });
      events.push({ type: 'gustHit', target: { kind: 'lure', id: l.id }, how: 'fan', x: F.x, y: F.y });
      continue;
    }
    events.push({ type: 'gustHit', target: { kind: 'lure', id: l.id }, how: 'snuff', x: F.x, y: F.y });
    snuffLure(state, scene, i, t, events, g.dx < 0 ? -1 : 1, 'gust');
  }
  const list = state.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.gone || e.arrive > 0 || e.mode === 'dead' || g.hits.includes(e.id)) continue;
    if (!inGust(g.x, g.y, half, e.x, e.y, e.w, e.h)) continue;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    if (e.kind === 'hawker' || e.kind === 'lampwing') {
      g.hits.push(e.id);
      // Out of its tell or its dive (a pass on a rhythm too): it hangs stalled, open.
      if (e.mode === 'curious' || e.mode === 'dive' || e.mode === 'stall') {
        const n = Math.max(1, Math.round(t.gust.hawkerStall));
        e.mode = 'stall';
        e.modeFrames = 0;
        e.timer = n;
        e.turning = false;
        e.braced = false;
        e.vx = 0;
        e.vy = 0;
        events.push({
          type: 'enemyStall',
          id: e.id,
          kind: e.kind,
          x: ex,
          y: ey,
          dir: e.facing,
          frames: n,
          cause: 'wall',
        });
        events.push({ type: 'gustHit', target: { kind: e.kind, id: e.id }, how: 'knock', x: ex, y: ey });
      }
    } else if (e.kind === 'dangler') {
      g.hits.push(e.id);
      // Swung off its drop: back up its thread (its strike undone).
      if (e.mode === 'windup' || e.mode === 'drop' || e.mode === 'swing') {
        e.mode = 'climb';
        e.modeFrames = 0;
        e.timer = 0;
        e.vx = 0;
        e.vy = 0;
        events.push({ type: 'gustHit', target: { kind: e.kind, id: e.id }, how: 'swing', x: ex, y: ey });
      }
    } else if (e.kind === 'burrback' || e.kind === 'juvenileBurrback') {
      g.hits.push(e.id);
      // A shove along the gust, no harm (it flinches).
      if (e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert' || e.mode === 'windup') {
        const dir = g.dx < 0 ? -1 : g.dx > 0 ? 1 : ex < g.x ? -1 : 1;
        e.mode = 'alert';
        e.modeFrames = 0;
        e.timer = 14;
        e.braced = false;
        e.turning = false;
        e.knockVx = dir * t.gust.shove;
        events.push({ type: 'gustHit', target: { kind: e.kind, id: e.id }, how: 'shove', x: ex, y: ey });
      }
    }
  }
}

// --- Bells.

/** Is the bell in the dark (no warm lamp burning within `bells.darkPx`)? */
function bellDark(state: GameState, scene: Scene, t: Tuning, x: number, y: number): boolean {
  const list = scene.lures ?? [];
  const r = t.bells.darkPx;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || l.kind === 'moonwick' || (state.lures.hp[i] ?? 0) <= 0) continue;
    flameAt(state.lures, i, l, state.frame, t, F);
    const dx = F.x - x;
    const dy = F.y - y;
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}

/**
 * Bell `i` is struck (a cut or a pogo, once a slash: src/sim/kit.ts). In the dark the gap since the last strike
 * is read (`.` <= `shortMax`, `-` in `longMin`..`longMax`); a gap that is neither, or a phrase that has gone
 * wrong, starts the count over from this strike. The whole `rhythm` sets the bell's flag (`bellAnswer`).
 */
export function strikeBell(state: GameState, scene: Scene, i: number, t: Tuning, events: SimEvent[]): void {
  const b = scene.bells?.[i];
  const s = state.light.bells[i];
  if (!b || !s) return;
  if (b.dark !== false && !bellDark(state, scene, t, b.x, b.y)) {
    s.n = 0;
    s.seq = '';
    events.push({ type: 'bellDull', id: b.id, x: b.x, y: b.y });
    return;
  }
  if (state.save.flags.includes(b.sets)) {
    events.push({
      type: 'bellHit',
      id: b.id,
      n: b.rhythm.length + 1,
      of: b.rhythm.length + 1,
      gap: 0,
      beat: '',
      x: b.x,
      y: b.y,
    });
    return;
  }
  const B = t.bells;
  const gap = state.frame - s.last;
  s.last = state.frame;
  let beat = '';
  if (s.n > 0) beat = gap <= B.shortMax ? '.' : gap >= B.longMin && gap <= B.longMax ? '-' : '';
  if (s.n === 0 || beat === '' || !b.rhythm.startsWith(s.seq + beat)) {
    s.n = 1;
    s.seq = '';
    beat = '';
  } else {
    s.n++;
    s.seq += beat;
  }
  const of = b.rhythm.length + 1;
  events.push({ type: 'bellHit', id: b.id, n: s.n, of, gap: s.n > 1 ? gap : 0, beat, x: b.x, y: b.y });
  if (s.seq === b.rhythm) {
    state.save.flags.push(b.sets);
    events.push({ type: 'bellAnswer', id: b.id, flag: b.sets, x: b.x, y: b.y });
    events.push({ type: 'flagSet', flag: b.sets, by: b.id, x: b.x, y: b.y });
  }
}

// --- The step.

/**
 * Lanternroot's per-step rules, last in the step (src/sim/index.ts): the gust's flight, the moonwicks' burn
 * and their sets, the moss, the glow pods and respawning creatures, heartwood under a ram, and the glow that
 * this step's events paid (`first` = this step's first event).
 */
export function updateLight(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  first: number,
): void {
  const light = state.light;
  const p = state.player;
  if (p.gustCd > 0) p.gustCd--;
  if (p.grounded) p.gustHop = 1;
  flyGust(state, scene, t, events);
  burnWicks(state, scene, t, events);
  wickSets(state, scene, t, events);
  updateMoss(state, scene, t, events);
  regrowPods(state, scene, events);
  respawn(state, scene, t, events);
  ramBreaks(state, scene, events, first);
  if (scene.glow) payGlow(state, scene, t, events, first);
  void light;
}

/** Burning moonwicks count down: the gutter's flicker begins, then they go cold. */
function burnWicks(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const list = scene.lures ?? [];
  const L = state.lures;
  const gutter = Math.max(0, Math.round(t.moonwick.gutter));
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l?.kind !== 'moonwick' || (L.hp[i] ?? 0) <= 0) continue;
    const b = L.burn[i] ?? 0;
    if (b <= 0) continue;
    L.burn[i] = b - 1;
    if (b - 1 === gutter && gutter > 0) {
      flameAt(L, i, l, state.frame, t, F);
      events.push({ type: 'lureGutter', id: l.id, frames: gutter, x: F.x, y: F.y });
    }
    if (b - 1 === 0) {
      L.hp[i] = 0;
      L.out[i] = state.frame + 1;
      flameAt(L, i, l, state.frame, t, F);
      events.push({ type: 'lureCold', id: l.id, x: F.x, y: F.y });
    }
  }
}

/** A set whose every wick burns now: its flag is saved and its wicks burn for good. */
function wickSets(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const sets = scene.wickSets ?? [];
  const list = scene.lures ?? [];
  for (let k = 0; k < sets.length; k++) {
    const w = sets[k];
    if (!w || state.light.sets[k]) continue;
    const idx = w.wicks.map((id) => list.findIndex((l) => l.id === id));
    if (idx.some((i) => i < 0 || (state.lures.hp[i] ?? 0) <= 0)) continue;
    state.light.sets[k] = 1;
    let sx = 0;
    let sy = 0;
    for (const i of idx) {
      lightWick(state, scene, i, t, true);
      const l = list[i];
      if (l) {
        sx += l.x;
        sy += l.y;
      }
    }
    if (!state.save.flags.includes(w.sets)) {
      state.save.flags.push(w.sets);
      events.push({
        type: 'flagSet',
        flag: w.sets,
        by: w.id,
        x: Math.round(sx / idx.length),
        y: Math.round(sy / idx.length),
      });
    }
    events.push({
      type: 'wickSet',
      id: w.id,
      flag: w.sets,
      wicks: w.wicks.slice(),
      x: Math.round(sx / idx.length),
      y: Math.round(sy / idx.length),
    });
  }
}

/** Moonmoss follows the silver light (a piece that would appear inside her waits until she is clear). */
function updateMoss(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const list = scene.moonmoss ?? [];
  const p = state.player;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m) continue;
    const want = silverAt(state, scene, t, m.x + m.w / 2, m.y + m.h / 2);
    const on = state.light.moss[i] === 1;
    if (want === on) continue;
    if (want) {
      const inside =
        p.x < m.x + m.w && m.x < p.x + p.w && p.y < m.y + (m.oneWay ? 1 : m.h) && m.y < p.y + p.h;
      if (inside) continue;
      state.light.moss[i] = 1;
      events.push({ type: 'mossOn', id: m.id, x: m.x, y: m.y, w: m.w, h: m.h });
    } else {
      state.light.moss[i] = 0;
      events.push({ type: 'mossOff', id: m.id, x: m.x, y: m.y, w: m.w, h: m.h });
    }
  }
}

/** Burst glow pods grow their bud back (`regrow` frames after the burst). */
function regrowPods(state: GameState, scene: Scene, events: SimEvent[]): void {
  const list = scene.pods ?? [];
  const s = state.pods;
  const r = state.light.regrow;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!q?.regrow || (s.hp[i] ?? 0) > 0) continue;
    // (Its glints first: the bud regrows once the burst has paid out.)
    if ((s.left[i] ?? 0) > 0) continue;
    if ((r[i] ?? 0) === 0) {
      r[i] = Math.max(1, Math.round(q.regrow));
      continue;
    }
    r[i] = (r[i] as number) - 1;
    if (r[i] !== 0) continue;
    s.hp[i] = podHpMax(q);
    s.paid[i] = 0;
    s.left[i] = 0;
    s.timer[i] = 0;
    s.hitBy[i] = 0;
    events.push({ type: 'podRegrow', id: q.id, x: q.x, y: q.y });
  }
}

/** Is the room's boss fight on (locked, not yet beaten)? */
function fightOn(state: GameState): boolean {
  const b = state.boss;
  return !!b && b.locked && b.stage !== 'end' && b.stage !== 'down';
}

/**
 * `respawn` creatures come back after their time; `fight` ones are there only while the fight is on; `wakes` ones
 * only once the save has their ability or flag.
 */
function respawn(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const list = scene.enemies ?? [];
  const L = state.light;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const e = state.enemies[i];
    if (!s || !e) continue;
    if (s.wakes) {
      const w = s.wakes;
      const on = (state.save.abilities as readonly string[]).includes(w) || state.save.flags.includes(w);
      // (A wave that has been cleared stays clear: a woken creature whose own `sets` flag is saved never comes back
      // on a new entry, the Canopy r8, HK's arenas. A living one can only have it at a fresh entry: the flag is set
      // when the last of its wave dies. A body still falling keeps its death.)
      const cleared = !!s.sets && state.save.flags.includes(s.sets) && e.mode !== 'dead';
      if (!on || cleared) {
        if (!L.hidden[i] || !e.gone) {
          L.hidden[i] = 1;
          L.respawn[i] = 0;
          e.gone = true;
        }
        continue;
      }
      if (L.hidden[i]) {
        // An ambush's creature arrives (review r7 #2): the gates shut on the flag's step, it shows a beat later at
        // its `arrive` point and travels in, harmless.
        if (s.arrive) {
          e.gone = true;
          if ((L.respawn[i] ?? 0) === 0) {
            L.respawn[i] = Math.max(1, Math.round(t.enemies.arriveDelayFrames));
            continue;
          }
          L.respawn[i] = (L.respawn[i] as number) - 1;
          if (L.respawn[i] !== 0) continue;
        }
        L.hidden[i] = 0;
        const fresh = createEnemy(s, t, scene);
        state.enemies[i] = fresh;
        if (s.arrive) {
          const n = Math.max(1, Math.round(t.enemies.arriveFrames));
          fresh.arrive = n;
          const pl = state.player;
          const bx = pl.x + pl.w / 2 - (fresh.homeX - s.x);
          const by = pl.y + pl.h / 2 - (fresh.homeY - s.y);
          const clear = t.enemies.arriveClearPx * t.enemies.arriveClearPx;
          let pick = s.arrive[0] as [number, number];
          let far = -1;
          for (const a of s.arrive) {
            const d = (a[0] - bx) * (a[0] - bx) + (a[1] - by) * (a[1] - by);
            if (d >= clear) {
              pick = a;
              break;
            }
            if (d > far) {
              far = d;
              pick = a;
            }
          }
          fresh.arriveX = pick[0] - s.x;
          fresh.arriveY = pick[1] - s.y;
          fresh.x += fresh.arriveX;
          fresh.y += fresh.arriveY;
          events.push({
            type: 'enemyArrive',
            id: s.id,
            kind: s.kind,
            x: fresh.homeX,
            y: fresh.homeY,
            fromX: fresh.homeX + fresh.arriveX,
            fromY: fresh.homeY + fresh.arriveY,
            frames: n,
          });
        } else events.push({ type: 'enemyRespawn', id: s.id, kind: s.kind, x: fresh.homeX, y: fresh.homeY });
        continue;
      }
    }
    if (s.fight) {
      const on = fightOn(state);
      if (!on && !L.hidden[i]) {
        L.hidden[i] = 1;
        L.respawn[i] = 0;
        e.gone = true;
        continue;
      }
      if (on && L.hidden[i]) {
        L.hidden[i] = 0;
        const fresh = createEnemy(s, t, scene);
        state.enemies[i] = fresh;
        events.push({ type: 'enemyRespawn', id: s.id, kind: s.kind, x: fresh.homeX, y: fresh.homeY });
        continue;
      }
      if (!on) continue;
    }
    if (!s.respawn) continue;
    const dead = e.mode === 'dead' || e.gone;
    if (!dead) {
      L.respawn[i] = 0;
      continue;
    }
    if ((L.respawn[i] ?? 0) === 0) {
      L.respawn[i] = Math.max(1, Math.round(s.respawn));
      continue;
    }
    L.respawn[i] = (L.respawn[i] as number) - 1;
    if (L.respawn[i] !== 0) continue;
    const fresh = createEnemy(s, t, scene);
    state.enemies[i] = fresh;
    events.push({ type: 'enemyRespawn', id: s.id, kind: s.kind, x: fresh.homeX, y: fresh.homeY });
  }
}

/** A burrback's ram that met heartwood (its face at the creature's front) breaks it (`barkBreak {by: 'ram'}`). */
function ramBreaks(state: GameState, scene: Scene, events: SimEvent[], first: number): void {
  const bark = scene.bark;
  if (!bark?.some((b) => b.heartwood)) return;
  const end = events.length;
  for (let k = first; k < end; k++) {
    const ev = events[k];
    if (ev?.type !== 'enemyRecover' || ev.cause !== 'wall') continue;
    const e = state.enemies.find((q) => q.id === ev.id);
    if (!e) continue;
    const front = e.facing > 0 ? e.x + e.w : e.x;
    for (let i = 0; i < bark.length; i++) {
      const b = bark[i];
      if (!b?.heartwood || (state.kit.bark[i] ?? 0) <= 0) continue;
      const face = e.facing > 0 ? b.x : b.x + b.w;
      if (Math.abs(face - front) > 3) continue;
      if (e.y >= b.y + b.h || e.y + e.h <= b.y) continue;
      state.kit.bark[i] = 0;
      const kk = key(scene, b.id);
      if (!state.save.opened.includes(kk)) state.save.opened.push(kk);
      events.push({
        type: 'barkBreak',
        id: b.id,
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        w: b.w,
        h: b.h,
        dir: 'fwd',
        floor: b.floor === true,
        by: 'ram',
      });
    }
  }
}

/**
 * The glow this step paid (a glow room): a blade hit on a creature `glow.hit` (a kill `glow.kill` more), a warm
 * lamp out `glow.snuff`, every glint that reached her `glow.glint` (scene glints, pod glints, a dropped
 * cluster's). A scene glint taken is saved (`save.taken`).
 */
function payGlow(state: GameState, scene: Scene, t: Tuning, events: SimEvent[], first: number): void {
  const G = t.glow;
  let hit = 0;
  let kill = 0;
  let snuff = 0;
  let glint = 0;
  const end = events.length;
  for (let k = first; k < end; k++) {
    const ev = events[k];
    if (!ev) continue;
    if (ev.type === 'slashHit') {
      const kind = ev.target.kind;
      if (kind === 'pod' || kind === 'lure' || kind === 'thorns' || kind === 'seedCase' || kind === 'bark')
        continue;
      if (kind === 'cap' || kind === 'bell' || kind === 'web') continue;
      hit++;
      if (ev.kill) kill++;
    } else if (ev.type === 'lureSnuff') {
      if (ev.kind !== 'moonwick' && ev.kind !== 'great' && ev.kind !== 'greatWide') snuff++;
    } else if (ev.type === 'pickup') {
      glint += ev.value;
      if (!ev.pod && !ev.enemy && !ev.drop) {
        const kk = key(scene, ev.id);
        if (!state.save.taken.includes(kk)) state.save.taken.push(kk);
      }
    }
  }
  if (hit) gainGlow(state, t, hit * G.hit, 'hit', events);
  if (kill) gainGlow(state, t, kill * G.kill, 'kill', events);
  if (snuff) gainGlow(state, t, snuff * G.snuff, 'snuff', events);
  if (glint) gainGlow(state, t, glint * G.glint, 'glint', events);
}
