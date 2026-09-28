/**
 * THE seam between the verification tools (trace, headless runner, tapes, bot, feel report, clip
 * overlays) and the player controller / rooms. Tools never read `state.player.*`, tuning keys or
 * room internals directly; they go through this file. When the controller, tuning layout or room
 * format changes, this is the one file to fix. (The Phase 0 fallbacks were removed at the L2 merge.)
 *
 * Pure: no DOM, no Node APIs (runs in the browser and in Node).
 */
import type { SimEvent } from '../sim/events';
import { cloneState, createState, type GameState, hashState, step } from '../sim/index';
import { ActionBit, type InputFrame } from '../sim/input';
import {
  cloneTuning,
  presetTuning as controllerPresetTuning,
  defaultTuning,
  PRESET_NAMES,
  type PresetName,
  type Tuning,
} from '../sim/tuning';
import * as roomsModule from '../sim/world/rooms';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export const SIM_HZ = 60;
export const ABILITIES = ['wallJump', 'dash', 'doubleJump', 'pogo', 'seize', 'levy'] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilitySet = Partial<Record<Ability, boolean>>;

/** Assist toggles from movement-spec §3.1 `ASSISTS`. */
export const ASSISTS = [
  'coyote',
  'jumpBuffer',
  'variableJump',
  'apexHang',
  'fastFall',
  'headCorrect',
  'ledgePop',
  'dashCorrect',
  'wallSpeedRetain',
  'wallSlide',
  'wallJumpGrace',
  'wallJumpForce',
  'landingPreference',
  'dashJumpCancel',
  'wallJumpRefill',
] as const;
export type Assist = (typeof ASSISTS)[number];
export type AssistSet = Partial<Record<Assist, boolean>>;

// ---------------------------------------------------------------------------------------------
// Player view: a normalised, controller-independent snapshot used by every tool.

export interface PlayerView {
  /** Integer px, top-left of the hitbox. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** px per frame (+y is down). */
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  /** Controller state name ('normal', 'wallSlide', 'dash', 'dead'). */
  state: string;
  /** -1 / 1 when touching or sliding on a wall on that side, else 0. */
  wallDir: number;
  airDash: number;
  doubleJump: number;
  dashCooldown: number;
  dead: boolean;
  /** L3: current move id ('' = none) and its frame (1 = the press step). */
  move: string;
  moveFrame: number;
  /** Bag colours, oldest first. */
  bag: string[];
  /** Weight class (the movement profile). */
  weight: string;
  chin: number;
}

export function playerView(s: GameState): PlayerView {
  const p = s.player;
  return {
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    vx: p.vx,
    vy: p.vy,
    grounded: p.grounded,
    facing: p.facing,
    state: p.state,
    wallDir: p.wallDir,
    airDash: p.airDash,
    doubleJump: p.dj,
    dashCooldown: p.dashCd,
    dead: p.state === 'dead',
    move: p.move?.id ?? '',
    moveFrame: p.move?.frame ?? 0,
    bag: s.local.bag.map((id) => s.local.sounds.find((x) => x.id === id)?.colour ?? '?'),
    weight: p.profile,
    chin: p.chin,
  };
}

/** Is jump held on the mask the sim saw last step (needed for edge detection when branching). */
export function jumpHeldLastStep(s: GameState): boolean {
  return (num((s as unknown as Obj).prevInput) & ActionBit.jump) !== 0;
}

/** The input mask consumed on the last step, if the sim records it. */
export function lastInput(s: GameState): InputFrame | undefined {
  const v = (s as unknown as Obj).prevInput;
  return typeof v === 'number' ? v : undefined;
}

/**
 * Search-state key for bot dedup (movement-spec §8): quantised position/velocity plus every
 * discrete flag that changes what future inputs can do.
 */
export function botKey(s: GameState): string {
  const p = s.player;
  const held =
    s.prevInput & (ActionBit.jump | ActionBit.dash | ActionBit.attack | ActionBit.seize | ActionBit.levy);
  // Rising from a jump that release can still cut.
  const rising = p.fromJump && !p.cut ? 1 : 0;
  // Timers/flags that change what inputs can do.
  const flags = [
    p.forceTimer > 0,
    p.coyote > 0,
    p.jumpBuf > 0,
    p.dropTimer > 0,
    p.pogoTimer > 0,
    p.freeze > 0,
    p.cutDisabled,
    s.transition != null,
  ].reduce((m, b, i) => m | ((b ? 1 : 0) << i), 0);
  return [
    s.roomId,
    p.x >> 3,
    p.y >> 3,
    Math.round(p.vx),
    Math.round(p.vy),
    p.grounded ? 1 : 0,
    p.state,
    p.wallDir,
    p.airDash,
    p.dj,
    p.dashCd > 0 ? 1 : 0,
    held,
    rising,
    flags,
    signatureKey(s),
  ].join(',');
}

/**
 * The L3 part of the bot key (brief §6.1): bag colours in order, source ghost bits, levied
 * (colour, phase, x>>3, y>>3), plate and gate bits, the move and its frame>>1, hitstop, enemies
 * (state, x>>3, y>>3). Empty for rooms with none of it, so gym keys are unchanged in practice.
 */
function signatureKey(s: GameState): string {
  const L = s.local;
  const p = s.player;
  let k = '';
  for (const id of L.bag) {
    const c = L.sounds.find((x) => x.id === id)?.colour ?? '?';
    k += c[0];
  }
  k += '|';
  for (const src of L.sources)
    if (src.kind === 'object') k += src.ghost ? (src.pendingSolid ? 'p' : 'g') : 'a';
  for (const l of L.levied) k += `|${l.colour[0]}${l.phase[0]}${l.x >> 3},${l.y >> 3}`;
  for (const pl of L.plates) k += pl.pressed ? 'P' : '_';
  for (const g of L.gates) k += g.open ? 'O' : 'C';
  if (p.move) k += `|${p.move.id[0]}${p.move.frame >> 1}${p.move.outcome[0]}`;
  if (p.actBuf) k += `|b${p.actBuf.id[0]}`;
  if (s.hitstop > 0) k += '|h';
  for (const e of L.enemies) k += `|${e.state[0]}${e.state[1]}${e.x >> 3},${e.y >> 3}`;
  return k;
}

// ---------------------------------------------------------------------------------------------
// Events.

export interface NormEvent {
  type: string;
  /** Jump kind (spec: ground|coyote|buffered|wall|double|pogo|dashJump), when the event has one. */
  kind?: string;
  raw: SimEvent;
}

export function normEvent(e: SimEvent): NormEvent {
  const r = e as unknown as Obj;
  let kind = typeof r.kind === 'string' ? r.kind : undefined;
  if (e.type === 'jump' && kind === undefined && typeof r.coyote === 'boolean') {
    kind = r.coyote ? 'coyote' : 'ground';
  }
  return kind === undefined ? { type: e.type, raw: e } : { type: e.type, kind, raw: e };
}

/** Short marker letter for clip overlays and contact sheets (spec §7.6: J, L, D, C...). */
export function eventMarker(e: NormEvent): string | undefined {
  switch (e.type) {
    case 'jump':
      return e.kind === 'wall' ? 'W' : e.kind === 'double' ? '2' : e.kind === 'coyote' ? 'Jc' : 'J';
    case 'land':
      return 'L';
    case 'dashStart':
      return 'D';
    case 'dashEnd':
      return 'd';
    case 'cornerCorrect':
      return 'C';
    case 'headBump':
      return 'H';
    case 'pogo':
      return 'P';
    case 'death':
      return 'X';
    case 'wallSlideStart':
      return 'S';
    // L3 (brief §6.1). Seize take S clashes with wall slide's S only in rooms with both.
    case 'seizeTake':
      return 'S';
    case 'seizeRefused':
    case 'seizeGuarded':
      return 's';
    case 'catch':
      return 'K';
    case 'levyThrow':
      return 'V';
    case 'levyLand':
      return 'v';
    case 'telegraph':
      return 'T';
    case 'hurt':
      return '!';
    case 'repossess':
      return 'C';
    case 'springBounce':
      return 'B';
    case 'plate':
      return '_';
    case 'hit':
      return '*';
    default:
      return undefined;
  }
}

export function isDeath(e: NormEvent): boolean {
  return e.type === 'death';
}

// ---------------------------------------------------------------------------------------------
// Tuning, presets, assists, abilities.

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Deep-merges plain JSON `src` into `target` in place (arrays and scalars replace). */
export function mergeInto(target: Obj, src: Obj): void {
  for (const [k, v] of Object.entries(src)) {
    const cur = target[k];
    if (isObj(v) && isObj(cur)) mergeInto(cur, v);
    else target[k] = JSON.parse(JSON.stringify(v)) as unknown;
  }
}

/** Sets a dotted path (`jump.gravity`) in a tuning object. Throws on unknown paths (typo guard). */
export function setPath(target: Obj, path: string, value: unknown): void {
  const keys = path.split('.');
  let o: Obj = target;
  for (const k of keys.slice(0, -1)) {
    const next = o[k];
    if (!isObj(next)) throw new Error(`Unknown tuning path "${path}"`);
    o = next;
  }
  const last = keys[keys.length - 1] ?? '';
  if (!(last in o)) throw new Error(`Unknown tuning path "${path}"`);
  o[last] = value;
}

/** Leaves of `t` that differ from `base`, as a nested partial (undefined if none). */
export function diffInto(base: unknown, t: unknown): unknown {
  if (isObj(base) && isObj(t)) {
    const out: Obj = {};
    for (const k of Object.keys(t)) {
      const d = diffInto(base[k], t[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return JSON.stringify(base) === JSON.stringify(t) ? undefined : (JSON.parse(JSON.stringify(t)) as unknown);
}

export function tuningHash(t: Tuning): string {
  return hashState(t);
}

export function presetNames(): string[] {
  return [...PRESET_NAMES];
}

/** Full tuning for a preset ('default' is an alias for 'opus', the defaults). */
export function presetTuning(name = 'opus'): Tuning {
  if (name === 'default') return cloneTuning(defaultTuning);
  if (!(PRESET_NAMES as string[]).includes(name))
    throw new Error(`Unknown preset "${name}". Known: default, ${PRESET_NAMES.join(', ')}`);
  return controllerPresetTuning(name as PresetName);
}

/** Turns assists on/off (`tuning.assists.<name>`). Returns the names it could not apply. */
export function setAssists(t: Tuning, assists: AssistSet): Assist[] {
  const bag = t.assists as Record<string, boolean>;
  const unsupported: Assist[] = [];
  for (const [name, on] of Object.entries(assists) as [Assist, boolean][]) {
    if (name in bag) bag[name] = on;
    else unsupported.push(name);
  }
  return unsupported;
}

/**
 * The tuning's own statement of a few feel numbers, so tests can check measurements against the
 * values the controller was configured with.
 */
export interface NominalFeel {
  coyoteFrames: number;
  jumpBufferFrames: number;
  runPxPerFrame: number;
  /** Full-jump apex height the tuning aims for, before apex hang (px). */
  jumpHeightPx: number;
}

export function nominalFeel(t: Tuning): NominalFeel {
  return {
    coyoteFrames: t.assist.coyoteFrames,
    jumpBufferFrames: t.assist.jumpBufferFrames,
    runPxPerFrame: t.run.maxSpeed,
    jumpHeightPx: t.shape.jumpHeightPx,
  };
}

/** Current assist values. */
export function getAssists(t: Tuning): AssistSet {
  const out: AssistSet = {};
  const bag = t.assists as Record<string, unknown>;
  for (const a of ASSISTS) if (typeof bag[a] === 'boolean') out[a] = bag[a] as boolean;
  return out;
}

/** Grants/removes abilities in a state (`state.player.abilities`). Always true (kept for callers). */
export function applyAbilities(s: GameState, abilities: AbilitySet): boolean {
  const bag = s.player.abilities;
  for (const a of ABILITIES) if (a in abilities) bag[a] = abilities[a] === true;
  return true;
}

/** Abilities a room declares (spec room JSON `abilities`), or {} if rooms don't carry them. */
export function roomAbilities(roomId: string): AbilitySet {
  const r = getRawRoom(roomId);
  return isObj(r.abilities) ? (r.abilities as AbilitySet) : {};
}

/** Bot claims for one target (movement-spec §6.1): must be found with, and not without, these. */
export interface TargetClaim {
  /** Abilities the bot must reach the target with. */
  with: Ability[];
  /** Abilities or assists whose removal must make the target not found. */
  without: (Ability | Assist)[];
  /** The `with` search is informational (not a failure when not found in budget). */
  info?: boolean;
  budget?: number;
}

/**
 * Room `claims` (spec room JSON), e.g. `{ G: { with: [], without: ['dash'] }, g: null }`. Only
 * entries shaped like a claim (with a `with` list) count; other keys (`windows`, `camera`...) are
 * notes for other tools.
 */
export function roomClaims(roomId: string): Record<string, TargetClaim> {
  const r = getRawRoom(roomId);
  const out: Record<string, TargetClaim> = {};
  const claims = isObj(r.claims)
    ? r.claims
    : isObj(r.file) && isObj(r.file.claims)
      ? r.file.claims
      : undefined;
  if (!claims) return out;
  for (const [name, c] of Object.entries(claims)) {
    if (!isObj(c) || !Array.isArray(c.with)) continue;
    out[name] = {
      with: c.with as Ability[],
      without: Array.isArray(c.without) ? (c.without as (Ability | Assist)[]) : [],
      ...(c.info === true ? { info: true } : {}),
      ...(typeof c.budget === 'number' ? { budget: c.budget } : {}),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rooms, targets.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getRawRoom(id: string): Obj {
  return roomsModule.getRoom(id) as unknown as Obj;
}

export function tileSize(t: Tuning = defaultTuning): number {
  const w = (t as unknown as Obj).world;
  return isObj(w) ? num(w.tileSize, 64) : 64;
}

export function roomIds(): string[] {
  return [...roomsModule.ROOMS.keys()];
}

export interface RoomInfo {
  id: string;
  /** Tiles. */
  width: number;
  height: number;
  tileSize: number;
  solidAt(tx: number, ty: number): boolean;
}

export function roomInfo(id: string): RoomInfo {
  const room = roomsModule.getRoom(id);
  return {
    id,
    width: room.width,
    height: room.height,
    tileSize: tileSize(),
    solidAt: (tx, ty) => roomsModule.isSolidTile(room, tx, ty),
  };
}

/**
 * Named targets in a room. Spec rooms: goals `G` / `g` (64×64 triggers), found in `goals`,
 * `triggers` or `entities`. Always also offers every spawn as `spawn:<name>` (the tile the
 * marker is in).
 */
export function roomTargets(roomId: string): Record<string, Rect> {
  const r = getRawRoom(roomId);
  const ts = tileSize();
  const out: Record<string, Rect> = {};
  const tileRect = (tx: number, ty: number): Rect => ({ x: tx * ts, y: ty * ts, w: ts, h: ts });
  const addEntity = (e: unknown, fallbackName?: string) => {
    if (!isObj(e)) return;
    const kind = String(e.kind ?? e.type ?? e.char ?? fallbackName ?? '');
    const name =
      kind === 'goal'
        ? 'G'
        : kind === 'optionalGoal'
          ? 'g'
          : kind === 'door'
            ? `exit:${String(e.char)}`
            : kind;
    if (!/^(G|g|goal|exit)/.test(name)) return;
    if (typeof e.tx === 'number' && typeof e.ty === 'number') out[name] = tileRect(e.tx, e.ty);
    else if (typeof e.x === 'number' && typeof e.y === 'number')
      out[name] = { x: e.x, y: e.y, w: num(e.w, ts), h: num(e.h, ts) };
  };
  for (const key of ['goals', 'triggers', 'entities']) {
    const bag = r[key];
    if (Array.isArray(bag)) for (const e of bag) addEntity(e);
    else if (isObj(bag)) for (const [n, e] of Object.entries(bag)) addEntity(e, n);
  }
  const spawns = isObj(r.spawns) ? r.spawns : {};
  for (const [n, sp] of Object.entries(spawns)) {
    if (isObj(sp) && typeof sp.tx === 'number' && typeof sp.ty === 'number')
      out[`spawn:${n}`] = tileRect(sp.tx, sp.ty);
  }
  return out;
}

/**
 * Resolves a target spec: a name from roomTargets() (`G`, `spawn:a`, or bare `a` for a spawn),
 * `tile:tx,ty`, or `rect:x,y,w,h` (px).
 */
export function resolveTarget(roomId: string, target: string | Rect): Rect {
  if (typeof target !== 'string') return target;
  const tm = /^tile:(-?\d+),(-?\d+)$/.exec(target);
  const ts = tileSize();
  if (tm) return { x: Number(tm[1]) * ts, y: Number(tm[2]) * ts, w: ts, h: ts };
  const rm = /^rect:(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(target);
  if (rm) return { x: Number(rm[1]), y: Number(rm[2]), w: Number(rm[3]), h: Number(rm[4]) };
  const all = roomTargets(roomId);
  const hit = all[target] ?? all[`spawn:${target}`];
  if (!hit)
    throw new Error(`Room "${roomId}" has no target "${target}". Known: ${Object.keys(all).join(', ')}`);
  return hit;
}

export function overlaps(p: PlayerView, r: Rect): boolean {
  return p.x < r.x + r.w && p.x + p.w > r.x && p.y < r.y + r.h && p.y + p.h > r.y;
}

/**
 * Registers an ASCII test room (feel-report labs, tests) with no abilities and returns its id.
 * Use only `#`, `.` and one `P`, and make it at least 30×17 tiles: the loader pads smaller rooms, which would shift `tile:x,y` targets.
 */
export function registerTestRoom(
  id: string,
  rows: string[],
  extra: Partial<Omit<roomsModule.RoomFile, 'id' | 'rows'>> = {},
): string {
  const def = {
    id,
    rows,
    abilities: { wallJump: false, dash: false, doubleJump: false, pogo: false },
    ...extra,
  } as unknown as Parameters<typeof roomsModule.buildRoom>[0];
  roomsModule.registerRoom(roomsModule.buildRoom(def));
  return id;
}

// ---------------------------------------------------------------------------------------------
// Sim access (the only place tools call into the sim directly).

export interface NewSimOptions {
  roomId?: string;
  spawn?: string;
  seed?: number;
}

export function newState(opts: NewSimOptions, t: Tuning, events: SimEvent[] = []): GameState {
  return createState({ seed: opts.seed ?? 1, roomId: opts.roomId, spawn: opts.spawn }, t, events);
}

export function stepState(s: GameState, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  step(s, input, t, events);
}

export { cloneState, hashState };

/**
 * Puts the player on the floor of tile (tx, ty) at rest, as a spawn marker there would (progression
 * validator: start a search at a pickup or on a ledge). Abilities, profile and room state are kept.
 */
export function placePlayer(s: GameState, tx: number, ty: number, t: Tuning = defaultTuning): void {
  const p = s.player;
  const ts = tileSize(t);
  p.x = Math.floor(tx * ts + ts / 2 - p.w / 2);
  p.y = (ty + 1) * ts - p.h;
  p.rx = 0;
  p.ry = 0;
  p.vx = 0;
  p.vy = 0;
  p.grounded = false;
}

/** Tile classes the progression validator cares about (from the room's TileType codes). */
export type TileClass = 'empty' | 'solid' | 'oneWay' | 'spike' | 'orb';

/**
 * Everything the progression validator (tools/progression) reads from a room: tiles by class,
 * entities (goals, doors, pickups, rests, respawns), L3 sources/plates/gates/enemies and the
 * optional progression annotations (`pickups`, `rests`, `locks`, `gates.*.requires`). Tile coords
 * are room tiles (after padding); px = tile × tileSize.
 */
export interface RoomLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  padX: number;
  padY: number;
  classAt(tx: number, ty: number): TileClass;
  abilities: Ability[];
  next?: string;
  entities: {
    kind: string;
    char: string;
    tx: number;
    ty: number;
    to?: string;
    spawn?: string;
    grants?: Ability[];
    id?: string;
  }[];
  spawns: Record<string, { tx: number; ty: number }>;
  /** Sources as tile rects (a source is solid while home; white static can't be seized). */
  sources: { char: string; colour: string; tx: number; ty: number; tw: number; th: number }[];
  plates: { char: string; tiles: number[]; pressedBy: string[] }[];
  gates: { char: string; tiles: number[]; opensOn: string; requires: Ability[] }[];
  locks: Record<string, { target: string; from?: string; requires: Ability[]; note?: string }>;
  enemies: string[];
  /** The parsed room file (canonical JSON; hash it to key caches). */
  file: unknown;
}

const TILE_CLASS: TileClass[] = ['empty', 'solid', 'oneWay', 'spike', 'spike', 'spike', 'spike', 'orb'];

export function roomLayout(id: string): RoomLayout {
  const room = roomsModule.getRoom(id);
  const ts = tileSize();
  const f = room.file;
  return {
    id,
    name: room.name,
    width: room.width,
    height: room.height,
    tileSize: ts,
    padX: room.padX,
    padY: room.padY,
    classAt: (tx, ty) => TILE_CLASS[roomsModule.tileAt(room, tx, ty)] ?? 'solid',
    abilities: ABILITIES.filter((a) => room.abilities[a]),
    ...(room.next ? { next: room.next } : {}),
    entities: room.entities.map((e) => ({ ...e, ...(e.grants ? { grants: [...e.grants] } : {}) })),
    spawns: { ...room.spawns },
    sources: room.sources.map((s) => ({
      char: s.char,
      colour: s.colour,
      tx: s.x / ts,
      ty: s.y / ts,
      tw: s.w / ts,
      th: s.h / ts,
    })),
    plates: room.plates.map((p) => ({ char: p.char, tiles: [...p.tiles], pressedBy: [...p.pressedBy] })),
    gates: room.gates.map((g) => ({
      char: g.char,
      tiles: [...g.tiles],
      opensOn: g.opensOn,
      requires: [...(f.gates[g.char]?.requires ?? [])],
    })),
    locks: Object.fromEntries(
      Object.entries(f.locks).map(([k, l]) => [k, { ...l, requires: [...l.requires] }]),
    ),
    enemies: room.enemySpawns.map((e) => e.type),
    file: f,
  };
}
