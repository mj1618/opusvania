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
 *  - **Gates** (`scene.gates`): a solid while the save's `flags` lack its `flag`; with `shut`, an arena's
 *    door, open until `shut` is set (she is in), and a fade while it stands re-arms it (`rearmArenas`).
 *    **Triggers** (`scene.triggers`) set a flag when her box centre enters them.
 *
 * Bark and gates are added to the solids by `withShortcuts` (src/sim/world.ts) while they stand,
 * tagged `kit` so they are never safe ground. The slash meets the kit inside `resolveSlash`
 * (src/sim/player/player.ts) through `slashKit`; the rest runs in `updateKit`, once a step after her
 * move. One hit per slash per piece (`attackSeq` vs `*HitBy`).
 *
 * Pure: + - * / floor round min max abs.
 */
import type { SimEvent, SlashDir } from './events';
import { updateFinds } from './finds';
import { createFirefly, type FireflyState, updateFireflies } from './firefly';
import type { Bark, BounceCap } from './kit-data';
import { strikeBell } from './light';
import { lureHpMax } from './lures';
import { solidAt } from './physics/aabb';
import type { Box } from './player/attack';
import type { Scene, SolidRect } from './scene';
import type { EnemyState, GameState, PlayerState, SaveState } from './state';
import type { Tuning } from './tuning';

/** The room's kit, as she finds it (room-local: rebuilt on every entry from the scene and the save). */
export interface KitState {
  /** Cuts left per `scene.bark` (0 = broken: the save has it). */
  bark: number[];
  /** The last slash that hit each piece (one hit per slash). */
  barkHitBy: number[];
  seedHitBy: number[];
  thornHitBy: number[];
  capHitBy: number[];
  /** Per `scene.gates`: 1 once its flag is set (open), 0 shut. */
  gates: number[];
  /** A thorn's hold is under way (`state.caught`): its length in frames; 0 = none. */
  hold: number;
  /** `state.frame + 1` of the step a down cut bounced off thorns (that step the touch is forgiven). */
  pogoFrame: number;
  /** A down cut met a bounce cap this step: its index (the pogo is thrown the cap's height), -1 none. */
  capPogo: number;
  /** Firefly signs (src/sim/finds.ts): the one she stands by (-1 none) and for how many still frames. */
  signAt: number;
  signStill: number;
  /** A held story beat (a trigger's `hold`): frames of it left (no input reaches her), and the trigger. */
  story: number;
  storyBy: string;
  /** Fall catches so far per `scene.catches` (room-local): a zone's `glideAssist` reads it. */
  catchCount: number[];
  /** The firefly's pass under way (src/sim/firefly.ts; `pass` -1 = none). */
  firefly: FireflyState;
}

/** A gate stands (a solid) with these flags: until its `flag`, and an arena's door only once `shut` is set. */
export function gateShut(g: { flag: string; shut?: string | undefined }, flags: readonly string[]): boolean {
  if (flags.includes(g.flag)) return false;
  return g.shut === undefined || flags.includes(g.shut);
}

/** Is an arena locked now (a gate with `shut` standing)? */
export function arenaShut(scene: Scene, flags: readonly string[]): boolean {
  for (const g of scene.gates ?? []) if (g.shut !== undefined && gateShut(g, flags)) return true;
  return false;
}

/**
 * A fade while an arena's door is shut re-arms it: its `shut` flag leaves the save (the door stands open behind her
 * as she re-forms, and its trigger shuts it again). Called at the end of a fade, before the creatures go home.
 */
export function rearmArenas(
  scene: Scene,
  save: SaveState,
  enemies?: readonly (EnemyState | undefined)[],
): void {
  const out: string[] = [];
  const drop = (f: string) => {
    const k = save.flags.indexOf(f);
    if (k < 0) return;
    save.flags.splice(k, 1);
    out.push(f);
  };
  for (const g of scene.gates ?? []) {
    if (g.shut === undefined || !gateShut(g, save.flags)) continue;
    // (Only an arena's lock-in, shut by a trigger: the Canopy r12's rubble shuts on the den's collapse for good.)
    const shut = g.shut;
    if (!(scene.triggers ?? []).some((tr) => tr.sets === shut)) continue;
    drop(shut);
  }
  // An ambush (`rearm`, review r7 #2) plays again until every creature it wakes is down (its `sets` saved, or killed
  // now). Called with no creatures (a fresh entry into the room), only the saved flags count.
  const spawns = scene.enemies ?? [];
  for (const tr of scene.triggers ?? []) {
    if (!tr.rearm || !save.flags.includes(tr.sets)) continue;
    let down = true;
    for (let i = 0; i < spawns.length && down; i++) {
      const sp = spawns[i];
      if (sp?.wakes !== tr.sets) continue;
      if (sp.sets && save.flags.includes(sp.sets)) continue;
      if (!enemies || !killed(enemies[i])) down = false;
    }
    if (!down) drop(tr.sets);
  }
  // (A wave's later beats ride on its first: a beat whose waking flag was taken back takes back the flag it set, so a
  // fade in beat 2 replays the wave from beat 1, never both beats at once.)
  for (let k = 0; k < out.length; k++)
    for (const sp of spawns) if (sp.wakes === out[k] && sp.sets) drop(sp.sets);
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
    capHitBy: (scene.caps ?? []).map(() => 0),
    gates: (scene.gates ?? []).map((g) => (gateShut(g, save.flags) ? 0 : 1)),
    hold: 0,
    pogoFrame: 0,
    capPogo: -1,
    signAt: -1,
    signStill: 0,
    story: 0,
    storyBy: '',
    catchCount: (scene.catches ?? []).map(() => 0),
    firefly: createFirefly(),
  };
}

export function cloneKit(k: KitState): KitState {
  return {
    bark: k.bark.slice(),
    barkHitBy: k.barkHitBy.slice(),
    seedHitBy: k.seedHitBy.slice(),
    thornHitBy: k.thornHitBy.slice(),
    capHitBy: k.capHitBy.slice(),
    gates: k.gates.slice(),
    hold: k.hold,
    pogoFrame: k.pogoFrame,
    capPogo: k.capPogo,
    signAt: k.signAt,
    signStill: k.signStill,
    story: k.story,
    storyBy: k.storyBy,
    catchCount: k.catchCount.slice(),
    firefly: { ...k.firefly },
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
  for (const c of scene.caps ?? []) {
    k += `c${c.id}|`;
    const s: SolidRect = { x: c.x, y: c.y, w: c.w, h: c.h, tag: 'floating', kit: 'cap' };
    if (c.kick !== undefined) s.kick = c.kick;
    solids.push(s);
  }
  for (const g of scene.gates ?? []) {
    if (!gateShut(g, save.flags)) continue;
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
/**
 * A standing bark floor panel the down-cut area `box` reaches (a floor she stands on or beside). On the
 * ground ↓ + attack is a down-cut at such a panel (average first-timer r3: 150 tries at R4's bark floor,
 * because on the ground ↓ + attack was a forward cut and only a down-cut from the air reached it).
 */
export function floorBarkAt(state: GameState, scene: Scene, box: Box): boolean {
  const bark = scene.bark ?? [];
  for (let i = 0; i < bark.length; i++) {
    const b = bark[i];
    if (b?.floor && (state.kit.bark[i] ?? 0) > 0 && overlaps(box, b.x, b.y, b.w, b.h)) return true;
  }
  return false;
}

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
  const hit = (
    kind: 'thorns' | 'seedCase' | 'bark' | 'cap' | 'bell',
    id: string,
    x: number,
    y: number,
    stop: number,
  ) =>
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
  // Bounce caps: a pogo off one is thrown the cap's height (`updateKit` sets the speed after the bounce).
  const caps = scene.caps ?? [];
  if (dir === 'down' && pogo) {
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i];
      if (!c || kit.capHitBy[i] === seq || !overlaps(box, c.x, c.y, c.w, c.h)) continue;
      kit.capHitBy[i] = seq;
      kit.capPogo = i;
      hit('cap', c.id, Math.max(c.x, Math.min(c.x + c.w, px)), c.y, pogoStop);
      RES.hits++;
      RES.bounce = true;
      RES.stop = Math.max(RES.stop, pogoStop);
      break;
    }
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
    // Heartwood (Lanternroot): not rotten. The blade clangs off it (a pogo still bounces); only a ram breaks it.
    if (b.heartwood) {
      const hx = Math.max(box.x, Math.min(box.x + box.w, b.x + b.w / 2));
      const hy = Math.max(box.y, Math.min(box.y + box.h, b.y + b.h / 2));
      if (dir === 'down' && pogo) {
        hit('bark', b.id, Math.max(b.x, Math.min(b.x + b.w, px)), b.y, pogoStop);
        RES.hits++;
        RES.bounce = true;
        RES.stop = Math.max(RES.stop, pogoStop);
        continue;
      }
      const stop = Math.max(0, Math.round(K.seedCase.clangHitstop));
      events.push({
        type: 'kitClang',
        id: b.id,
        kind: 'heartwood',
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        hitX: hx,
        hitY: hy,
        dir,
        hitstop: stop,
        recoil: dir === 'fwd' ? K.seedCase.clangRecoil : 0,
      });
      RES.clang = true;
      RES.stop = Math.max(RES.stop, stop);
      continue;
    }
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
  // Bell-caps (Lanternroot, src/sim/light.ts `strikeBell`): any cut strikes one, a pogo bounces off it.
  const bells = scene.bells ?? [];
  const bh = Math.round(t.bells.size) >> 1;
  for (let i = 0; i < bells.length; i++) {
    const b = bells[i];
    const s = state.light.bells[i];
    if (!b || !s || s.hitBy === seq || !overlaps(box, b.x - bh, b.y - bh, 2 * bh, 2 * bh)) continue;
    s.hitBy = seq;
    const stop = dir === 'down' && pogo ? pogoStop : Math.max(0, Math.round(K.bark.hitstop));
    hit('bell', b.id, b.x, b.y, stop);
    RES.hits++;
    RES.stop = Math.max(RES.stop, stop);
    if (dir === 'down' && pogo) RES.bounce = true;
    strikeBell(state, scene, i, t, events);
  }
  return RES;
}

/** The rise a cap throws her (px): its `height`, else its tier's; `held` (jump held) throws higher. */
export function capHeight(c: BounceCap, t: Tuning, held: boolean): number {
  const T = t.kit.caps;
  const h = c.height ?? T.tiers[c.tier ?? 'small'];
  return h * (held ? T.heldScale : 1);
}

/**
 * The launch speed (px/f) that rises `h` px under gravity `g` with the sim's integrator (`tuning.ts`
 * `speedForHeight`, inlined: the sim does not import the helper's module twice).
 */
function launchSpeed(g: number, h: number): number {
  return (g * (-1 + Math.sqrt(1 + (8 * h) / g))) / 2;
}

/** Throws her up off cap `i` (a landing or a pogo): the speed, a pogo's refills, a `capBounce`. */
function bounceOff(
  state: GameState,
  scene: Scene,
  i: number,
  t: Tuning,
  held: boolean,
  pogo: boolean,
  events: SimEvent[],
): void {
  const c = (scene.caps ?? [])[i];
  if (!c) return;
  const p = state.player;
  const height = capHeight(c, t, held);
  // (Set after this step's move: the next step takes gravity off before it moves her, so one g more.)
  const vy = launchSpeed(t.jump.gravity, height) + t.jump.gravity;
  p.vy = -vy;
  if (p.grounded) {
    p.grounded = false;
    p.contactFrames = 0;
  }
  // A press that met the cap is spent on its higher throw, not a jump off it a frame later.
  p.coyote = 0;
  p.jumpBuf = 0;
  p.djBuf = 0;
  p.fromJump = false;
  p.cut = false;
  p.sustain = 0;
  p.airTopY = p.y;
  p.launchY = p.y;
  p.hangUsed = 0;
  // A bounce refills like a pogo (the double jump and the air dash she owns).
  p.airDash = Math.max(p.airDash, state.save.abilities.includes('dash') ? Math.round(t.dash.airDashes) : 0);
  p.dj = Math.max(p.dj, state.save.abilities.includes('doubleJump') ? Math.round(t.jump.doubleJumps) : 0);
  events.push({ type: 'capBounce', id: c.id, x: p.x + p.w / 2, y: p.y + p.h, vy, height, pogo, held });
}

/** The cap whose top her feet stand on (grounded), -1 if none. */
function capUnder(scene: Scene, p: PlayerState): number {
  const caps = scene.caps;
  if (!caps || !p.grounded) return -1;
  const cx = p.x + p.w / 2;
  const bottom = p.y + p.h;
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    if (c && c.y === bottom && cx >= c.x && cx < c.x + c.w) return i;
  }
  return -1;
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
  jumpHeld = false,
): boolean {
  const kit = state.kit;
  const save = state.save;
  const p = state.player;
  // Bounce caps: a pogo off one (the bounce just set the pogo's speed: the cap's is a pogo's, held),
  // or landing on one (jump held throws higher). Not while a hitstop holds her (the bounce waits).
  if (kit.capPogo >= 0) {
    bounceOff(state, scene, kit.capPogo, t, true, true, events);
    kit.capPogo = -1;
  } else if (p.hitstop === 0 && p.faded === 0 && p.mode !== 'dash' && !state.exit && !state.caught) {
    const c = capUnder(scene, p);
    if (c >= 0) bounceOff(state, scene, c, t, jumpHeld, false, events);
  }
  updateFinds(state, scene, t, events);
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
      // A held story beat: no input reaches her for its length (step), and nothing hurts her.
      const cap = tr.finale ? t.kit.finaleHoldMax : t.kit.storyHoldMax;
      const hold = Math.min(Math.round(tr.hold ?? 0), Math.round(cap));
      if (hold > 0) {
        kit.story = hold;
        kit.storyBy = tr.id;
        p.invuln = Math.max(p.invuln, hold);
        events.push({ type: 'storyHold', id: tr.id, frames: hold, x: cx, y: p.y + p.h });
      }
    }
  }
  // A creature whose death opens the way (`sets`: the old burrback's plug, wood.md R10). Only a real death
  // (killed: `dead`, or removed with no health left): a creature sent away without being killed (a finale's
  // dispersal, its lamp snuffed, an `until` flag, any later rule) never sets it.
  const spawns = scene.enemies ?? [];
  for (let i = 0; i < spawns.length; i++) {
    const sp = spawns[i];
    const e = state.enemies[i];
    if (!sp?.sets || !e || save.flags.includes(sp.sets)) continue;
    if (!killed(e)) continue;
    // (A wave: every creature carrying the same flag must be down, a hidden one not yet woken too.)
    let all = true;
    for (let j = 0; j < spawns.length && all; j++)
      if (j !== i && spawns[j]?.sets === sp.sets && !killed(state.enemies[j])) all = false;
    if (!all) continue;
    save.flags.push(sp.sets);
    events.push({ type: 'flagSet', flag: sp.sets, by: sp.id, x: e.x + e.w / 2, y: e.y + e.h });
  }
  // A lure that burns only once a story flag is set (`after`: the firefly's glow-cap, wood.md R7). Out
  // before it, lit the step the flag appears, and out for good once she has snuffed it.
  const lures = scene.lures ?? [];
  for (let i = 0; i < lures.length; i++) {
    const l = lures[i];
    if (!l?.after) continue;
    const want = save.flags.includes(l.after) && !save.snuffed.includes(`${scene.id}:${l.id}`);
    const hp = state.lures.hp[i] ?? 0;
    if (!want && hp > 0) {
      state.lures.hp[i] = 0;
      state.lures.out[i] = 1;
    } else if (want && hp <= 0) {
      // (A trap hung on a flag takes its cage's cuts, the Canopy r11: the warning's, hung by the firefly.)
      state.lures.hp[i] = lureHpMax(l, t);
      state.lures.out[i] = 0;
    }
  }
  updateFireflies(state, scene, t, events);
  const gates = scene.gates ?? [];
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (!g) continue;
    const open = gateShut(g, save.flags) ? 0 : 1;
    if (open === kit.gates[i]) continue;
    kit.gates[i] = open;
    // A gate never shuts on her (the Canopy r10: a Grove trigger once shut one on her head, stuck in a solid).
    if (!open) pushClear(state, scene, g, gates, events);
    events.push({
      type: open ? 'gateOpen' : 'gateShut',
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

/**
 * Gate `g` is shutting with her box in its rect: she is moved out the shortest way to a spot clear of every solid
 * and of every gate standing on this step's flags (`gatePush`). Her speed into the gate is dropped.
 */
function pushClear(
  state: GameState,
  scene: Scene,
  g: { id: string; x: number; y: number; w: number; h: number },
  gates: readonly { id: string; x: number; y: number; w: number; h: number; flag: string; shut?: string }[],
  events: SimEvent[],
): void {
  const p = state.player;
  if (!(p.x < g.x + g.w && g.x < p.x + p.w && p.y < g.y + g.h && g.y < p.y + p.h)) return;
  const flags = state.save.flags;
  const free = (x: number, y: number) => {
    if (solidAt(scene, x, y, p.w, p.h)) return false;
    for (const o of gates)
      if (gateShut(o, flags) && x < o.x + o.w && o.x < x + p.w && y < o.y + o.h && o.y < y + p.h)
        return false;
    return true;
  };
  const tries: Array<[number, number]> = [
    [p.x, g.y + g.h],
    [p.x, g.y - p.h],
    [g.x - p.w, p.y],
    [g.x + g.w, p.y],
  ];
  tries.sort(
    (a, b) => Math.abs(a[0] - p.x) + Math.abs(a[1] - p.y) - (Math.abs(b[0] - p.x) + Math.abs(b[1] - p.y)),
  );
  for (const [x, y] of tries) {
    if (!free(x, y)) continue;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    p.rx = 0;
    p.ry = 0;
    if (dy > 0) p.vy = Math.max(0, p.vy);
    if (dy < 0) p.vy = Math.min(0, p.vy);
    if (dx !== 0) p.vx = 0;
    events.push({ type: 'gatePush', id: g.id, dx, dy, x: p.x + p.w / 2, y: p.y + p.h });
    return;
  }
}

/** A creature really killed (`dead`, or removed with no health left), not sent away. */
function killed(e: { mode: string; gone: boolean; hp: number } | undefined): boolean {
  return !!e && (e.mode === 'dead' || (e.gone && e.hp <= 0));
}
