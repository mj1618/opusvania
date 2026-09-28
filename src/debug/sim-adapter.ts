/**
 * THE seam between the verification tools (trace, headless runner, tapes, bot, feel report, clip
 * overlays) and the player controller / rooms. Tools never read `state.player.*`, tuning keys or
 * room internals directly; they go through this file. When the Phase 1 controller lands
 * (movement-spec §2-3, §6), this is the one file to fix. Each probe is written to the spec and
 * falls back to the Phase 0 placeholder controller, so it works on both.
 *
 * Pure: no DOM, no Node APIs (runs in the browser and in Node).
 */
import type { SimEvent } from '../sim/events';
import { cloneState, createState, type GameState, hashState, step } from '../sim/index';
import { ActionBit, type InputFrame } from '../sim/input';
import * as tuningModule from '../sim/tuning';
import { cloneTuning, defaultTuning, type Tuning } from '../sim/tuning';
import * as roomsModule from '../sim/world/rooms';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/**
 * Reads an export the controller may or may not have yet (e.g. `PRESETS`, `registerRoom`) without
 * a static member access, so bundlers don't warn about a missing export before it lands.
 */
const optionalExport = (mod: object, name: string): unknown =>
  Object.getOwnPropertyDescriptor(mod, name)?.value as unknown;
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------------------------------------
// Controller generation. Phase 0 tuning is in px/s (`player.runSpeed`); the spec controller is px/f.

const TUNING_DEFAULTS = defaultTuning as unknown as Obj;
/** True while the Phase 0 placeholder controller is in the tree. */
export const LEGACY_CONTROLLER = isObj(TUNING_DEFAULTS.player) && 'runSpeed' in TUNING_DEFAULTS.player;
/** Multiply sim velocities by this to get px/frame. */
const VEL_TO_PX_PER_FRAME = LEGACY_CONTROLLER ? 1 / 60 : 1;

export const SIM_HZ = 60;
export const ABILITIES = ['wallJump', 'dash', 'doubleJump', 'pogo'] as const;
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
  /** Controller state name, lower camel ('normal', 'wallSlide', 'dash', 'dead'); 'normal' if unknown. */
  state: string;
  /** -1 / 1 when touching or sliding on a wall on that side, else 0. */
  wallDir: number;
  airDash: number;
  doubleJump: number;
  dashCooldown: number;
  dead: boolean;
}

export function playerView(s: GameState): PlayerView {
  const p = s.player as unknown as Obj;
  const rawState = typeof p.state === 'string' ? p.state : 'normal';
  const st = rawState.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  const dead = st === 'dead' || p.dead === true;
  const timers = isObj(p.timers) ? p.timers : {};
  return {
    x: num(p.x),
    y: num(p.y),
    w: num(p.w),
    h: num(p.h),
    vx: num(p.vx) * VEL_TO_PX_PER_FRAME,
    vy: num(p.vy) * VEL_TO_PX_PER_FRAME,
    grounded: p.grounded === true,
    facing: num(p.facing, 1) < 0 ? -1 : 1,
    state: st,
    wallDir: num(p.wallDir),
    airDash: num(p.airDash ?? p.airDashes),
    doubleJump: num(p.dj ?? p.doubleJumps),
    dashCooldown: num(p.dashCd ?? timers.dashCd ?? timers.dashCooldown),
    dead,
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
  const v = playerView(s);
  const p = s.player as unknown as Obj;
  const prev = num((s as unknown as Obj).prevInput);
  const held = prev & (ActionBit.jump | ActionBit.dash | ActionBit.attack);
  const rising = p.rising === true || p.cut === false ? 1 : 0;
  return [
    s.roomId,
    v.x >> 3,
    v.y >> 3,
    Math.round(v.vx),
    Math.round(v.vy),
    v.grounded ? 1 : 0,
    v.state,
    v.wallDir,
    v.airDash,
    v.doubleJump,
    v.dashCooldown > 0 ? 1 : 0,
    held,
    rising,
  ].join(',');
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

/** Preset overrides from the controller (`PRESETS` in src/sim/tuning.ts, spec §3.3), if any. */
function controllerPresets(): Record<string, Obj> {
  const p = optionalExport(tuningModule, 'PRESETS');
  return isObj(p) ? (p as Record<string, Obj>) : {};
}

export function presetNames(): string[] {
  const names = Object.keys(controllerPresets());
  return names.length > 0 ? names : ['default'];
}

/** Full tuning for a preset: defaults with the preset's values merged on top. */
export function presetTuning(name = 'default'): Tuning {
  const t = cloneTuning(defaultTuning);
  if (name === 'default') return t;
  const p = controllerPresets()[name];
  if (!p) throw new Error(`Unknown preset "${name}". Known: ${presetNames().join(', ')}`);
  // A preset may be a full tuning object or a set of overrides; merging covers both.
  mergeInto(t as unknown as Obj, p);
  return t;
}

/**
 * Turns assists on/off. Spec controller: `tuning.assists.<name>` booleans. Phase 0 controller:
 * maps coyote / jumpBuffer / variableJump onto its frame counts (1 frame = "off", because 0
 * disables jumping entirely in that controller). Returns the names it could not apply.
 */
export function setAssists(t: Tuning, assists: AssistSet): Assist[] {
  const tu = t as unknown as Obj;
  const unsupported: Assist[] = [];
  const bag = isObj(tu.assists) ? tu.assists : isObj(tu.ASSISTS) ? tu.ASSISTS : undefined;
  for (const [name, on] of Object.entries(assists) as [Assist, boolean][]) {
    if (bag && name in bag) {
      bag[name] = on;
      continue;
    }
    const legacy = tu.jump as Obj | undefined;
    const defs = TUNING_DEFAULTS.jump as Obj | undefined;
    if (LEGACY_CONTROLLER && legacy && defs) {
      if (name === 'coyote') legacy.coyoteFrames = on ? defs.coyoteFrames : 1;
      else if (name === 'jumpBuffer') legacy.bufferFrames = on ? defs.bufferFrames : 1;
      else if (name === 'variableJump') legacy.releaseCut = on ? defs.releaseCut : 1;
      else unsupported.push(name);
    } else unsupported.push(name);
  }
  return unsupported;
}

/** Current assist values (undefined for ones this controller doesn't have). */
export function getAssists(t: Tuning): AssistSet {
  const tu = t as unknown as Obj;
  const bag = isObj(tu.assists) ? tu.assists : undefined;
  const out: AssistSet = {};
  for (const a of ASSISTS) {
    if (bag && typeof bag[a] === 'boolean') out[a] = bag[a] as boolean;
  }
  if (!bag && LEGACY_CONTROLLER) {
    const j = tu.jump as Obj;
    out.coyote = num(j.coyoteFrames) > 1;
    out.jumpBuffer = num(j.bufferFrames) > 1;
    out.variableJump = num(j.releaseCut) < 1;
  }
  return out;
}

/**
 * Grants/removes abilities in a state (spec: room `abilities` + player ability flags). Probes
 * `state.player.abilities`, then `state.abilities`. Returns false if the controller has no
 * ability flags (Phase 0): the bot still restricts its macro set, so dash/pogo are "removed"
 * either way, but wallJump/doubleJump need the sim flags.
 */
export function applyAbilities(s: GameState, abilities: AbilitySet): boolean {
  const st = s as unknown as Obj;
  const p = st.player as Obj;
  const bag = isObj(p.abilities) ? p.abilities : isObj(st.abilities) ? st.abilities : undefined;
  if (!bag) return false;
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
  with: Ability[];
  without: Ability[];
}

/** Room `claims` (spec room JSON), e.g. `{ G: { with: [], without: ['dash'] }, g: null }`. */
export function roomClaims(roomId: string): Record<string, TargetClaim> {
  const r = getRawRoom(roomId);
  const out: Record<string, TargetClaim> = {};
  if (!isObj(r.claims)) return out;
  for (const [name, c] of Object.entries(r.claims)) {
    if (!isObj(c)) continue;
    out[name] = {
      with: Array.isArray(c.with) ? (c.with as Ability[]) : [],
      without: Array.isArray(c.without) ? (c.without as Ability[]) : [],
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
 * marker is in), which is what Phase 0 rooms have.
 */
export function roomTargets(roomId: string): Record<string, Rect> {
  const r = getRawRoom(roomId);
  const ts = tileSize();
  const out: Record<string, Rect> = {};
  const tileRect = (tx: number, ty: number): Rect => ({ x: tx * ts, y: ty * ts, w: ts, h: ts });
  const addEntity = (e: unknown, fallbackName?: string) => {
    if (!isObj(e)) return;
    const kind = String(e.kind ?? e.type ?? e.char ?? fallbackName ?? '');
    const name = kind === 'goal' ? 'G' : kind === 'optionalGoal' ? 'g' : kind;
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
 * Registers an ASCII test room (for feel-report labs and tests) and returns its id. Uses the
 * Phase 0 legend ('#', '.', 'P', 'a'-'z' spawns). Spec controller: swap in its room loader here.
 */
export function registerTestRoom(id: string, rows: string[]): string {
  const reg = optionalExport(roomsModule, 'registerRoom');
  if (typeof reg === 'function') {
    (reg as (d: unknown) => void)({ id, rows });
    return id;
  }
  const room = roomsModule.buildRoom({ id, rows });
  (roomsModule.ROOMS as Map<string, roomsModule.Room>).set(id, room);
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
