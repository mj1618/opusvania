/**
 * The level kit (memory/level-kit.md, docs/design/regions/wood.md §7 "Terrain the sim doesn't have
 * yet"): generic, data-driven pieces any room can use.
 *
 *  - **Thorns** (`scene.thorns`, hazard rects, not solids). Touching them costs `kit.thorns.damage`
 *    (`hurt`, source `thorns`) and, if she still stands, she is held `holdFrames` (the room's catch
 *    hold: no input, no exits) and put back on her last safe ground (`fallReturn`), with
 *    `returnInvuln` frames of safety. That is Hollow Knight's spike rule, chosen over the enemy rule
 *    (a throw and play on) because a throw off thorns lands in more thorns. Thorns ignore her
 *    i-frames (a blow from a creature never carries her across a thorn bed). Safe ground keeps
 *    `safeMargin` px from them. A down cut on thorns is a pogo, and the frame it lands the touch is
 *    forgiven.
 *  - **Seed-cases** (`scene.seedCases`): static slash targets that never break and never block. A
 *    down cut bounces her (the pogo, with its refills); a forward or up cut clangs (`kitClang`).
 *  - **Rotten bark** (`scene.bark`): a solid until `hp` cuts (1 a cut, whatever its power) break it for
 *    good (`save.opened` gets `room:id`, like a shortcut). A floor panel takes only down cuts; the cut
 *    that breaks it does not bounce her, so she drops through.
 *  - **Gates** (`scene.gates`): a solid while the save's `flags` lack its `flag`. **Triggers**
 *    (`scene.triggers`) set a flag when her box centre enters them.
 *
 * Bark and gates are added to the solids by `withShortcuts` (src/sim/world.ts) while they stand,
 * tagged `kit` so they are never safe ground. The slash meets the kit inside `resolveSlash`
 * (src/sim/player/player.ts) through `slashKit`; the rest runs in `updateKit`, once a step after her
 * move. One hit per slash per piece (`attackSeq` vs `*HitBy`).
 *
 * Pure: + - * / floor round min max abs.
 */
import type { SimEvent, SlashDir } from './events';
import type { Bark } from './kit-data';
import type { Box } from './player/attack';
import type { Scene, SolidRect } from './scene';
import type { GameState, PlayerState, SaveState } from './state';
import type { Tuning } from './tuning';

/** The room's kit, as she finds it (room-local: rebuilt on every entry from the scene and the save). */
export interface KitState {
  /** Cuts left per `scene.bark` (0 = broken: the save has it). */
  bark: number[];
  /** The last slash that hit each piece (one hit per slash). */
  barkHitBy: number[];
  seedHitBy: number[];
  thornHitBy: number[];
  /** Per `scene.gates`: 1 once its flag is set (open), 0 shut. */
  gates: number[];
  /** A thorn's hold is under way (`state.caught`): its length in frames; 0 = none. */
  hold: number;
  /** `state.frame + 1` of the step a down cut bounced off thorns (that step the touch is forgiven). */
  pogoFrame: number;
}

/** The save key of a piece of this room. */
function key(scene: Scene, id: string): string {
  return `${scene.id}:${id}`;
}

/** Cuts a bark panel takes. */
export function barkHpMax(b: Bark, t: Tuning): number {
  return Math.max(1, Math.round(b.hp ?? t.kit.bark.hp));
}

export function createKit(scene: Scene, t: Tuning, save: SaveState): KitState {
  const bark = scene.bark ?? [];
  return {
    bark: bark.map((b) => (save.opened.includes(key(scene, b.id)) ? 0 : barkHpMax(b, t))),
    barkHitBy: bark.map(() => 0),
    seedHitBy: (scene.seedCases ?? []).map(() => 0),
    thornHitBy: (scene.thorns ?? []).map(() => 0),
    gates: (scene.gates ?? []).map((g) => (save.flags.includes(g.flag) ? 1 : 0)),
    hold: 0,
    pogoFrame: 0,
  };
}

export function cloneKit(k: KitState): KitState {
  return {
    bark: k.bark.slice(),
    barkHitBy: k.barkHitBy.slice(),
    seedHitBy: k.seedHitBy.slice(),
    thornHitBy: k.thornHitBy.slice(),
    gates: k.gates.slice(),
    hold: k.hold,
    pogoFrame: k.pogoFrame,
  };
}

/**
 * What the kit adds to the solids now (bark not broken, gates shut), and a key that changes when that
 * does ('' = nothing). Read by `withShortcuts`.
 */
export function kitSolids(scene: Scene, save: SaveState): { key: string; solids: SolidRect[] } {
  const solids: SolidRect[] = [];
  let k = '';
  for (const b of scene.bark ?? []) {
    if (save.opened.includes(key(scene, b.id))) continue;
    k += `b${b.id}|`;
    const s: SolidRect = { x: b.x, y: b.y, w: b.w, h: b.h, tag: 'root', kit: 'bark' };
    if (b.kick !== undefined) s.kick = b.kick;
    solids.push(s);
  }
  for (const g of scene.gates ?? []) {
    if (save.flags.includes(g.flag)) continue;
    k += `g${g.id}|`;
    const s: SolidRect = { x: g.x, y: g.y, w: g.w, h: g.h, tag: 'ledge', kit: 'gate' };
    if (g.kick !== undefined) s.kick = g.kick;
    solids.push(s);
  }
  return { key: k, solids };
}

function overlaps(a: Box, x: number, y: number, w: number, h: number): boolean {
  return a.x < x + w && x < a.x + a.w && a.y < y + h && y < a.y + a.h;
}

/** What one live slash frame did to the kit (read by `resolveSlash`). */
export interface KitHit {
  /** Targets hit (bark cuts, pogos off thorns and seed-cases): they count like any slash hit. */
  hits: number;
  /** A down cut that should bounce her (a pogo off thorns, a seed-case, bark that held). */
  bounce: boolean;
  /** A forward or up cut met a seed-case (and nothing else was hit): the clang's hold and throw. */
  clang: boolean;
  /** The hitstop the kit asks for (the largest of its hits). */
  stop: number;
}
const RES: KitHit = { hits: 0, bounce: false, clang: false, stop: 0 };

/**
 * Slash number `seq` (hit area `box`) against the kit. Pushes `slashHit` (target `thorns` / `seedCase` /
 * `bark`) and `barkHit` / `barkBreak` / `kitClang`; a bark panel that breaks goes into the save at once.
 */
export function slashKit(
  state: GameState,
  scene: Scene,
  box: Box,
  seq: number,
  dir: SlashDir,
  facing: number,
  pogo: boolean,
  step: number,
  power: number,
  knockback: number,
  t: Tuning,
  events: SimEvent[],
): KitHit {
  RES.hits = 0;
  RES.bounce = false;
  RES.clang = false;
  RES.stop = 0;
  const kit = state.kit;
  const K = t.kit;
  const p = state.player;
  const px = p.x + (p.w >> 1);
  const py = p.y + (p.h >> 1);
  const pogoStop = Math.max(0, Math.round(t.enemies.pogoHitstopFrames));
  const hit = (kind: 'thorns' | 'seedCase' | 'bark', id: string, x: number, y: number, stop: number) =>
    events.push({
      type: 'slashHit',
      x,
      y,
      dir,
      facing,
      target: { kind, id },
      px,
      py,
      pogo,
      hitstop: stop,
      step,
      power,
      knockback,
    });
  // Thorns: only a pogo (a down cut in the air) does anything: the bounce.
  const thorns = scene.thorns ?? [];
  if (dir === 'down' && pogo) {
    for (let i = 0; i < thorns.length; i++) {
      const r = thorns[i];
      if (!r || kit.thornHitBy[i] === seq || !overlaps(box, r.x, r.y, r.w, r.h)) continue;
      kit.thornHitBy[i] = seq;
      kit.pogoFrame = state.frame + 1;
      const x = Math.max(r.x, Math.min(r.x + r.w, px));
      hit('thorns', r.id, x, r.y, pogoStop);
      RES.hits++;
      RES.bounce = true;
      RES.stop = Math.max(RES.stop, pogoStop);
    }
  }
  // Seed-cases: a pogo off a down cut, a clang off any other.
  const seeds = scene.seedCases ?? [];
  const half = Math.round(K.seedCase.size) >> 1;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    if (!s || kit.seedHitBy[i] === seq || !overlaps(box, s.x - half, s.y - half, 2 * half, 2 * half))
      continue;
    if (dir === 'down' && !pogo) continue;
    kit.seedHitBy[i] = seq;
    if (dir === 'down') {
      hit('seedCase', s.id, s.x, s.y, pogoStop);
      RES.hits++;
      RES.bounce = true;
      RES.stop = Math.max(RES.stop, pogoStop);
      continue;
    }
    const stop = Math.max(0, Math.round(K.seedCase.clangHitstop));
    const hitX = Math.max(box.x, Math.min(box.x + box.w, s.x));
    const hitY = Math.max(box.y, Math.min(box.y + box.h, s.y));
    events.push({
      type: 'kitClang',
      id: s.id,
      kind: 'seedCase',
      x: s.x,
      y: s.y,
      hitX,
      hitY,
      dir,
      hitstop: stop,
      recoil: dir === 'fwd' ? K.seedCase.clangRecoil : 0,
    });
    RES.clang = true;
    RES.stop = Math.max(RES.stop, stop);
  }
  // Rotten bark: a cut a hit, whatever its power; a floor panel only from above.
  const bark = scene.bark ?? [];
  for (let i = 0; i < bark.length; i++) {
    const b = bark[i];
    const hp = kit.bark[i] ?? 0;
    if (!b || hp <= 0 || kit.barkHitBy[i] === seq) continue;
    if (b.floor && dir !== 'down') continue;
    if (!overlaps(box, b.x, b.y, b.w, b.h)) continue;
    kit.barkHitBy[i] = seq;
    const hpMax = barkHpMax(b, t);
    const hpLeft = hp - 1;
    kit.bark[i] = hpLeft;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const floor = b.floor === true;
    const stop = Math.max(
      0,
      Math.round(hpLeft > 0 ? (dir === 'down' && pogo ? pogoStop : K.bark.hitstop) : K.bark.breakHitstop),
    );
    const at = {
      x: Math.max(b.x, Math.min(b.x + b.w, px)),
      y: Math.max(b.y, Math.min(b.y + b.h, dir === 'down' ? b.y : py)),
    };
    hit('bark', b.id, at.x, at.y, stop);
    RES.hits++;
    RES.stop = Math.max(RES.stop, stop);
    if (hpLeft > 0) {
      events.push({ type: 'barkHit', id: b.id, x: cx, y: cy, dir, hpLeft, hpMax, floor });
      if (dir === 'down' && pogo) RES.bounce = true;
      continue;
    }
    const k = key(scene, b.id);
    if (!state.save.opened.includes(k)) state.save.opened.push(k);
    events.push({ type: 'barkBreak', id: b.id, x: cx, y: cy, w: b.w, h: b.h, dir, floor });
  }
  return RES;
}

/** Her box overlaps (or comes within `margin` px of) a thorn rect: the index, -1 if none. */
export function thornAt(scene: Scene, p: PlayerState, margin = 0): number {
  const list = scene.thorns;
  if (!list) return -1;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r) continue;
    if (
      p.x - margin < r.x + r.w &&
      r.x < p.x + p.w + margin &&
      p.y - margin < r.y + r.h &&
      r.y < p.y + p.h + margin
    )
      return i;
  }
  return -1;
}

/** The catch hold now under way: a thorn's own length, else the room's fall catch. */
export function catchHold(state: GameState, t: Tuning): number {
  return Math.max(1, Math.round(state.kit.hold > 0 ? state.kit.hold : t.room.catchFrames));
}

/** She was just put back after a hold: a thorn's return gives her a moment of safety. */
export function afterCatch(state: GameState, t: Tuning): void {
  if (state.kit.hold <= 0) return;
  state.kit.hold = 0;
  state.player.invuln = Math.max(state.player.invuln, Math.round(t.kit.thorns.returnInvuln));
}

/**
 * Once a step, after her move: triggers set their flags, gates open with theirs, thorns hurt her. `hurt`
 * is the player's `hurtPlayer` (passed in: player.ts imports this module). Returns true if thorns hit her.
 */
export function updateKit(
  state: GameState,
  scene: Scene,
  t: Tuning,
  hurt: (dir: number, damage: number, id: string, hitX: number, hitY: number) => void,
  events: SimEvent[],
): boolean {
  const kit = state.kit;
  const save = state.save;
  const p = state.player;
  // A hold that ended some other way (a teleport, a restart) leaves no thorn hold behind.
  if (!state.caught && kit.hold > 0) kit.hold = 0;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  if (p.faded === 0) {
    for (const tr of scene.triggers ?? []) {
      if (cx < tr.x || cx >= tr.x + tr.w || cy < tr.y || cy >= tr.y + tr.h) continue;
      if (save.flags.includes(tr.sets)) continue;
      save.flags.push(tr.sets);
      events.push({ type: 'flagSet', flag: tr.sets, by: tr.id, x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 });
    }
  }
  const gates = scene.gates ?? [];
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (!g) continue;
    const open = save.flags.includes(g.flag) ? 1 : 0;
    if (open === kit.gates[i]) continue;
    kit.gates[i] = open;
    if (open)
      events.push({
        type: 'gateOpen',
        id: g.id,
        flag: g.flag,
        x: g.x + g.w / 2,
        y: g.y + g.h / 2,
        w: g.w,
        h: g.h,
      });
  }
  // Thorns.
  if (p.faded > 0 || p.hp <= 0 || state.exit || state.caught || state.goal.gathered) return false;
  if (kit.pogoFrame === state.frame + 1) return false;
  const i = thornAt(scene, p);
  if (i < 0) return false;
  const r = (scene.thorns ?? [])[i];
  if (!r) return false;
  const T = t.kit.thorns;
  const rc = r.x + r.w / 2;
  const dir = cx < rc ? -1 : cx > rc ? 1 : -p.facing;
  const hitX = (Math.max(p.x, r.x) + Math.min(p.x + p.w, r.x + r.w)) / 2;
  const hitY = (Math.max(p.y, r.y) + Math.min(p.y + p.h, r.y + r.h)) / 2;
  const damage = Math.max(1, Math.round(T.damage));
  hurt(dir, damage, r.id, hitX, hitY);
  const alive = state.player.hp > 0;
  const frames = alive ? Math.max(1, Math.round(T.holdFrames)) : 0;
  if (alive) {
    state.caught = { id: `thorns:${r.id}`, frames: 0 };
    kit.hold = frames;
  }
  events.push({ type: 'thornHit', id: r.id, x: cx, y: p.y + p.h, hp: state.player.hp, damage, frames });
  return true;
}
