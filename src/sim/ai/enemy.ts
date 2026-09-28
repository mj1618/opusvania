import { boxAt, KID_HURTBOX, type Rect, rectsOverlap } from '../combat/boxes';
import { requestHitstop } from '../combat/hitstop';
import { SeizePri, type SeizePriority } from '../combat/priority';
import type { HitClass, SimEvent } from '../events';
import { sineAt } from '../math/sine';
import { type Body, type Collider, Move, moveX, moveY, oneWayUnder, solidAt } from '../physics/aabb';
import { feetEmbedded, floorAheadOnSlope, onSlopeGround, slopeGround } from '../physics/slopes';
import { rngInt } from '../rng';
import { pay } from '../run';
import { refreshSource, sendHome, soundById, sourceById } from '../sound';
import type { Enemy, EnemyMode, GameState, LocalState, Sound, Source } from '../state';
import { defaultTuning, speedForHeight, type Tuning } from '../tuning';
import { dynSolidAt } from '../world/dynamic';
import type { Room } from '../world/rooms';
import { bossCountSeized, bossOnDamage, bossReturnHit, bossStep, isBoss } from './boss';
import { type AttackDef, type EnemyDef, enemyDef } from './schema';
import { fireProjectile } from './shots';

/**
 * The generic enemy state machine (combat-spec §4.2): PATROL, CHASE, TELEGRAPH, ACTIVE, RECOVERY,
 * RETRIEVE, ABSORB, STAGGER, LAUNCHED, FLINCH, HOP, FLEE, DOWN, COUNT, REPOSSESSED, RISE, KO.
 * Everything specific to an enemy comes from content/enemies/<id>.json: its attacks (melee
 * hitboxes, charges, dives, projectiles), its movement kind (walk, fly, keepAway, flee, static)
 * and its numbers. Attacks are armed only while their sound is home (critique D1); at most
 * combat.maxAttackTokens enemies telegraph or attack at once; an attack only starts with the
 * enemy inside Kid's view (T5). Random picks come from state.rng (weighted, no immediate repeat).
 * The boss's move choice is scripted in boss.ts; everything else about him runs through here.
 */

/** Collider for enemies: tiles, one-ways (from above) and dynamic solids. `ts` is set per step. */
class EnemyCollider implements Collider {
  room: Room | null = null;
  ts = 0;

  box(b: Body, x: number, y: number): boolean {
    return solidAt(this.room as Room, this.ts, x, y, b.w, b.h) || dynSolidAt(x, y, b.w, b.h);
  }

  blockedX(b: Body, dir: number): boolean {
    if (this.box(b, b.x + dir, b.y)) return true;
    return feetEmbedded(this.room as Room, b.x + dir, b.y, b.w, b.h);
  }

  blockedY(b: Body, dir: number): boolean {
    const r = this.room as Room;
    if (this.box(b, b.x, b.y + dir)) return true;
    if (dir <= 0) return false;
    return slopeGround(r, b.x, b.y, b.w, b.h) || oneWayUnder(r, this.ts, b.x, b.y, b.w, b.h);
  }

  /** Slopes: walkers ride up a rising surface (feet sensor), as Kid does. */
  onBlockX(b: Body, dir: number): boolean {
    const r = this.room as Room;
    if (!r.slopes || this.box(b, b.x + dir, b.y)) return false;
    for (let k = 1; k <= SLOPE_STEP_PX; k++) {
      if (this.box(b, b.x + dir, b.y - k)) return false;
      if (!feetEmbedded(r, b.x + dir, b.y - k, b.w, b.h)) {
        b.y -= k;
        return true;
      }
    }
    return false;
  }

  hazard(): boolean {
    return false;
  }
}
const col = new EnemyCollider();
const SLOPE_STEP_PX = defaultTuning.slopes.stepPx;
const SLOPE_SNAP_PX = defaultTuning.slopes.snapExtraPx;

const INERT: ReadonlySet<EnemyMode> = new Set(['KO', 'REPOSSESSED']);
/** States in which the enemy's voices are open to a Seize (besides `rattled`). */
const OPEN: ReadonlySet<EnemyMode> = new Set([
  'TELEGRAPH',
  'RECOVERY',
  'STAGGER',
  'LAUNCHED',
  'FLINCH',
  'DOWN',
  'COUNT',
]);
/** States in which the body deals no contact damage. */
const HARMLESS: ReadonlySet<EnemyMode> = new Set([
  'DOWN',
  'COUNT',
  'STAGGER',
  'REPOSSESSED',
  'ABSORB',
  'KO',
  'RISE',
  'FLINCH',
  'FLEE',
]);
/** States a punch can interrupt with a flinch (never an attack: telegraphs and swings have armour). */
const FLINCHABLE: ReadonlySet<EnemyMode> = new Set([
  'PATROL',
  'CHASE',
  'RETRIEVE',
  'RECOVERY',
  'FLINCH',
  'HOP',
]);

export function isInert(e: Enemy): boolean {
  return INERT.has(e.state);
}

export function isDowned(e: Enemy): boolean {
  return e.state === 'DOWN' || e.state === 'COUNT';
}

export function isHarmless(e: Enemy): boolean {
  return HARMLESS.has(e.state);
}

export function enemyById(L: LocalState, id: number): Enemy | undefined {
  for (const e of L.enemies) if (e.id === id) return e;
  return undefined;
}

export function hurtRect(e: Enemy): Rect {
  return boxAt(e.x, e.y, e.w, e.facing, enemyDef(e.type).hurtbox);
}

export function centreOf(e: Enemy): { x: number; y: number } {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

/**
 * Spawns an enemy with its feet at (x centre, feetY). `grace` frames pass before its first attack
 * (the room's spawnGrace for room spawns; debug spawns use 0). Returns its id.
 */
export function spawnEnemy(L: LocalState, type: string, x: number, feetY: number, grace = 0): number {
  const d = enemyDef(type);
  const id = L.nextId++;
  const srcId = L.nextId++;
  const soundIds: number[] = [];
  for (const s of d.sounds) {
    const sid = L.nextId++;
    soundIds.push(sid);
    L.sounds.push({
      id: sid,
      name: s.id,
      colour: s.colour,
      kind: 'voice',
      owner: srcId,
      status: 'home',
      at: 0,
      awayFrames: 0,
    });
  }
  const ex = Math.round(x - d.body.w / 2);
  const ey = feetY - d.body.h;
  const e: Enemy = {
    id,
    type,
    source: srcId,
    x: ex,
    y: ey,
    rx: 0,
    ry: 0,
    w: d.body.w,
    h: d.body.h,
    vx: 0,
    vy: 0,
    kb: 0,
    facing: -1,
    grounded: !d.flying,
    state: d.movement.kind === 'flee' ? 'FLEE' : 'PATROL',
    stateFrame: 0,
    hp: d.hp,
    attackId: '',
    lastAttack: '',
    cooldown: grace,
    rattled: 0,
    timer: 0,
    beat: 0,
    token: false,
    target: 0,
    travel: 0,
    furious: false,
    hitList: [],
    hoarse: false,
    homeX: ex,
    homeY: ey,
    aimX: 0,
    aimY: 0,
    shotsLeft: 0,
    shotT: 0,
    slips: d.movement.flee?.slips ?? 0,
    poundage: d.poundage,
    boss: null,
  };
  if (d.class === 'boss')
    e.boss = {
      phase: 1,
      actions: 0,
      lots: [],
      beat: 0,
      word: 0,
      noGavel: false,
      bought: 0,
      final: false,
      hopTo: ex,
      charge: 0,
      guardT: 0,
    };
  L.enemies.push(e);
  L.sources.push({
    id: srcId,
    kind: 'enemy',
    ent: id,
    char: '',
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
    soundIds,
    solidWhenArmed: false,
    ghost: false,
    pendingSolid: false,
  });
  // Sorted by id: the sound ids were allocated after the source id.
  L.sources.sort((a, b) => a.id - b.id);
  return id;
}

export function sourceOf(L: LocalState, e: Enemy): Source | undefined {
  return sourceById(L, e.source);
}

export function soundOf(L: LocalState, e: Enemy, name: string): Sound | undefined {
  const src = sourceOf(L, e);
  if (!src) return undefined;
  for (const id of src.soundIds) {
    const s = soundById(L, id);
    if (s && s.name === name) return s;
  }
  return undefined;
}

export function attackArmed(L: LocalState, e: Enemy, a: AttackDef): boolean {
  if (a.sound === null) return false;
  return soundOf(L, e, a.sound)?.status === 'home';
}

function telegraphFrames(e: Enemy, a: AttackDef, t: Tuning): number {
  const d = enemyDef(e.type);
  return e.furious ? Math.max(t.combat.minTelegraph, a.telegraph + d.furious.telegraphDelta) : a.telegraph;
}

function speedMult(e: Enemy, t: Tuning): number {
  let m = e.furious ? enemyDef(e.type).furious.speedMult : 1;
  if (e.hoarse) m *= t.swallow.hoarseSpeedMult;
  return m;
}

export function setMode(e: Enemy, s: EnemyMode): void {
  if (e.token && s !== 'TELEGRAPH' && s !== 'ACTIVE') e.token = false;
  e.state = s;
  e.stateFrame = 0;
}

export function tokensHeld(L: LocalState): number {
  let n = 0;
  for (const e of L.enemies) if (e.token) n++;
  return n;
}

/** Beat length of every Count in this room right now (combat-spec §4.5, by fever). */
export function countBeatFrames(state: GameState, t: Tuning): number {
  const f = Math.max(
    0,
    Math.min(t.combat.countBeatByFever.length - 1, Math.max(state.run.fever, state.local.fever)),
  );
  return t.combat.countBeatByFever[f] as number;
}

/**
 * The sim's stand-in for the camera view (T5: no attack starts off-screen): a view-sized rect
 * centred on Kid, clamped to the room, inset by combat.viewInsetPx.
 */
export function viewRect(state: GameState, room: Room, t: Tuning): Rect {
  const ts = t.world.tileSize;
  const p = state.player;
  const c = t.combat;
  const rw = room.width * ts;
  const rh = room.height * ts;
  const w = Math.min(c.viewW, rw);
  const h = Math.min(c.viewH, rh);
  const x = Math.max(0, Math.min(rw - w, p.x + p.w / 2 - w / 2));
  const y = Math.max(0, Math.min(rh - h, p.y + p.h / 2 - h / 2));
  const k = c.viewInsetPx;
  return { x: x + k, y: y + k, w: w - 2 * k, h: h - 2 * k };
}

/** A voice this enemy is still missing and would go and get, if any (Hoarse: gone for good). */
function awayVoice(L: LocalState, e: Enemy): Sound | undefined {
  const src = sourceOf(L, e);
  if (!src || e.boss) return undefined;
  for (const id of src.soundIds) {
    const s = soundById(L, id);
    if (s && s.status !== 'home' && s.status !== 'consumed' && s.status !== 'held') return s;
  }
  return undefined;
}

/** Where a sound is (retrieve target): Kid's centre when bagged, the levied object otherwise. */
function soundPos(state: GameState, s: Sound): { x: number; y: number } | null {
  if (s.status === 'bag') {
    const p = state.player;
    return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }
  if (s.status === 'levied' || s.status === 'flight') {
    for (const l of state.local.levied) if (l.id === s.at) return { x: l.x + l.w / 2, y: l.y + l.h / 2 };
  }
  return null;
}

/** Back to its default behaviour, or to retrieving if one of its voices is still away. */
export function resume(state: GameState, e: Enemy): void {
  const d = enemyDef(e.type);
  if (d.movement.kind === 'flee') {
    setMode(e, 'FLEE');
    return;
  }
  const away = awayVoice(state.local, e);
  if (away) {
    e.target = away.id;
    setMode(e, 'RETRIEVE');
  } else {
    e.target = 0;
    setMode(e, 'CHASE');
  }
}

function groundAhead(room: Room, ts: number, e: Enemy, dir: number): boolean {
  const x = dir > 0 ? e.x + e.w : e.x - 1;
  return (
    solidAt(room, ts, x, e.y + 1, 1, e.h) ||
    dynSolidAt(x, e.y + 1, 1, e.h) ||
    oneWayUnder(room, ts, x, e.y, 1, e.h) ||
    // A downhill slope drops away from the leading edge (at 45° by half the body width).
    floorAheadOnSlope(room, x, e.y + e.h, (e.w >> 1) + SLOPE_SNAP_PX)
  );
}

export function startAttack(
  state: GameState,
  e: Enemy,
  id: string,
  a: AttackDef,
  t: Tuning,
  events: SimEvent[],
): void {
  const p = state.player;
  e.facing = p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1;
  e.attackId = id;
  e.lastAttack = id;
  e.token = true;
  e.hitList = [];
  e.travel = 0;
  e.state = 'TELEGRAPH';
  e.stateFrame = 0;
  e.timer = telegraphFrames(e, a, t);
  e.vx = 0;
  if (enemyDef(e.type).flying) e.vy = 0;
  // Mortars lock their landing point on the first telegraph frame (the brown mark on the floor).
  e.aimX = p.x + p.w / 2;
  e.aimY = p.y + p.h;
  e.shotsLeft = 0;
  e.shotT = 0;
  const colour = a.cue.tint;
  events.push({
    type: 'telegraph',
    enemy: e.id,
    attackId: id,
    colour,
    frames: e.timer,
    cue: a.cue.audio,
    ...centreOf(e),
  });
}

/** Weighted pick over attacks Kid is in range of (no immediate repeat when there is a choice). */
function pickAttack(state: GameState, e: Enemy, d: EnemyDef, snatch: boolean): [string, AttackDef] | null {
  const p = state.player;
  const dx = Math.abs(p.x + p.w / 2 - (e.x + e.w / 2));
  const dy = Math.abs(p.y + p.h / 2 - (e.y + e.h / 2));
  const cands: [string, AttackDef][] = [];
  for (const id of Object.keys(d.attacks).sort()) {
    const a = d.attacks[id] as AttackDef;
    if (a.snatch !== snatch) continue;
    if (!snatch && !attackArmed(state.local, e, a)) continue;
    if (dx > a.trigger.rangeX + e.w / 2 || dy > a.trigger.rangeY || dx < a.trigger.minX) continue;
    cands.push([id, a]);
  }
  if (cands.length === 0) return null;
  const pool = cands.length > 1 ? cands.filter(([id]) => id !== e.lastAttack) : cands;
  let total = 0;
  for (const [, a] of pool) total += a.trigger.weight;
  let r = pool.length > 1 ? rngInt(state, total) : 0;
  for (const c of pool) {
    r -= c[1].trigger.weight;
    if (r < 0) return c;
  }
  return pool[0] ?? null;
}

function walkToward(e: Enemy, tx: number, speed: number, stopPx: number): void {
  const dx = tx - (e.x + e.w / 2);
  if (Math.abs(dx) <= stopPx) {
    e.vx = 0;
    return;
  }
  e.facing = dx > 0 ? 1 : -1;
  e.vx = e.facing * speed;
}

function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

/** Flyers: steer toward (tx, ty) at `speed` on each axis (no gravity). */
function flyToward(e: Enemy, tx: number, ty: number, speed: number): void {
  const dx = tx - (e.x + e.w / 2);
  const dy = ty - (e.y + e.h / 2);
  e.vx = approach(e.vx, Math.max(-speed, Math.min(speed, dx / 8)), 0.5);
  e.vy = approach(e.vy, Math.max(-speed, Math.min(speed, dy / 8)), 0.5);
  if (Math.abs(dx) > 4) e.facing = dx > 0 ? 1 : -1;
}

/** Kid can be attacked: alive and not down for her own Count. */
function kidTargetable(state: GameState): boolean {
  return state.player.state !== 'dead' && state.player.down === null;
}

/** Try to start an attack (tokens, cooldown, footing and the view rule). */
function tryAttack(
  state: GameState,
  room: Room,
  e: Enemy,
  d: EnemyDef,
  snatch: boolean,
  t: Tuning,
  events: SimEvent[],
): boolean {
  if (e.cooldown > 0 || !kidTargetable(state)) return false;
  if (!d.flying && !e.grounded) return false;
  if (tokensHeld(state.local) >= t.combat.maxAttackTokens) return false;
  if (!rectsOverlap(hurtRect(e), viewRect(state, room, t))) return false;
  const pick = pickAttack(state, e, d, snatch);
  if (!pick) return false;
  startAttack(state, e, pick[0], pick[1], t, events);
  return true;
}

/** Step 7: every enemy in id order. */
export function updateEnemies(state: GameState, room: Room, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  const ts = t.world.tileSize;
  col.room = room;
  col.ts = ts;
  const p = state.player;
  const kx = p.x + p.w / 2;
  const ky = p.y + p.h / 2;
  const c = t.combat;
  for (const e of L.enemies) {
    if (isInert(e)) continue;
    const d = enemyDef(e.type);
    const mv = d.movement;
    const sm = speedMult(e, t);
    e.stateFrame++;
    if (e.cooldown > 0) e.cooldown--;
    if (isBoss(e) && bossStep(state, room, e, t, events)) {
      physics(e, d, t);
      syncEnemySource(L, e);
      continue;
    }
    const a = e.attackId ? d.attacks[e.attackId] : undefined;
    switch (e.state) {
      case 'PATROL': {
        const dist = Math.abs(kx - (e.x + e.w / 2)) + Math.abs(ky - (e.y + e.h / 2));
        // A room's spawn grace (e.cooldown) also holds off the aggro: it patrols until then.
        if (dist <= mv.aggroRange && kidTargetable(state) && e.cooldown === 0) {
          setMode(e, 'CHASE');
          break;
        }
        if (d.flying) {
          e.vx = e.facing * mv.patrolSpeed * sm;
          e.vy = 0;
          if (col.blockedX(e, e.facing)) e.facing = e.facing > 0 ? -1 : 1;
        } else {
          if (e.grounded && (!groundAhead(room, ts, e, e.facing) || col.blockedX(e, e.facing)))
            e.facing = e.facing > 0 ? -1 : 1;
          e.vx = mv.kind === 'static' ? 0 : e.facing * mv.patrolSpeed * sm;
        }
        break;
      }
      case 'CHASE': {
        chaseMove(state, room, e, d, sm, t, events);
        if (e.state !== 'CHASE') break;
        tryAttack(state, room, e, d, false, t, events);
        break;
      }
      case 'RETRIEVE': {
        const s = soundById(L, e.target);
        if (!s || s.status === 'home' || s.status === 'consumed' || s.status === 'held' || e.hoarse) {
          resume(state, e);
          break;
        }
        const pos = soundPos(state, s);
        if (!pos) break;
        const speed = mv.chaseSpeed * c.retrieveSpeedMult * sm;
        if (d.flying) flyToward(e, pos.x, pos.y, speed);
        else walkToward(e, pos.x, speed, s.status === 'bag' ? (e.w + p.w) / 2 + c.chaseGapPx : 0);
        if (s.status === 'levied' || s.status === 'flight') {
          const l = L.levied.find((x) => x.id === s.at);
          if (l && rectsOverlap(e, l)) {
            setMode(e, 'ABSORB');
            e.timer = c.absorbFrames;
            e.vx = 0;
            if (d.flying) e.vy = 0;
          }
        } else if (s.status === 'bag') {
          tryAttack(state, room, e, d, true, t, events);
          if (mv.jump && e.grounded && p.grounded) hopUp(e, mv.jump, kx, p, ts, c.enemyGravity);
        }
        break;
      }
      case 'ABSORB': {
        e.vx = 0;
        if (d.flying) e.vy = 0;
        if (--e.timer <= 0) {
          const s = soundById(L, e.target);
          if (s && (s.status === 'levied' || s.status === 'flight')) {
            events.push({ type: 'absorb', soundId: s.id, enemy: e.id, ...centreOf(e) });
            sendHome(state, s, events);
          }
          resume(state, e);
        }
        break;
      }
      case 'TELEGRAPH': {
        if (!a) {
          resume(state, e);
          break;
        }
        // A telegraphed attack whose sound left home is cancelled (Snatch has no sound).
        if (!a.snatch && a.sound !== null && !attackArmed(L, e, a)) {
          e.cooldown = a.trigger.cooldown;
          resume(state, e);
          break;
        }
        e.vx = a.teleBackPx > 0 ? (-e.facing * a.teleBackPx) / e.timer : 0;
        if (d.flying) e.vy = a.teleRisePx > 0 ? -a.teleRisePx / e.timer : 0;
        if (a.dive !== undefined && e.stateFrame === a.aimLockFrame) lockDive(e, a.dive, kx, ky);
        if (e.stateFrame >= e.timer) beginActive(state, e, a, t, events);
        break;
      }
      case 'ACTIVE': {
        if (!a) {
          resume(state, e);
          break;
        }
        activeStep(state, room, e, d, a, sm, t, events);
        break;
      }
      case 'RECOVERY': {
        e.vx = 0;
        if (d.flying) e.vy = 0;
        if (e.stateFrame >= e.timer) {
          e.attackId = '';
          resume(state, e);
        }
        break;
      }
      case 'STAGGER':
      case 'LAUNCHED':
      case 'FLINCH': {
        e.vx = 0;
        if (d.flying && e.state !== 'LAUNCHED') e.vy = 0;
        if (--e.timer <= 0 && (e.state !== 'LAUNCHED' || e.grounded || d.flying)) resume(state, e);
        break;
      }
      case 'HOP': {
        if (--e.timer <= 0 && (e.grounded || d.flying)) {
          e.vx = 0;
          resume(state, e);
        }
        break;
      }
      case 'FLEE': {
        fleeMove(room, e, d, kx, ts, c.enemyGravity);
        break;
      }
      case 'DOWN': {
        e.vx = 0;
        if (--e.timer <= 0) {
          if (d.class === 'runner') {
            setMode(e, 'FLEE');
            break;
          }
          setMode(e, 'COUNT');
          e.beat = 1;
          e.timer = countBeatFrames(state, t);
          events.push({ type: 'countTick', enemy: e.id, beat: 1, ...centreOf(e) });
        }
        break;
      }
      case 'COUNT': {
        e.vx = 0;
        if (--e.timer <= 0) {
          if (e.beat >= c.countBeats) {
            if (e.hp <= 0 && !isBoss(e)) {
              ko(state, e, t, events);
            } else {
              setMode(e, 'RISE');
              e.timer = c.riseFrames;
              e.furious = true;
              events.push({ type: 'rise', enemy: e.id, ...centreOf(e) });
            }
          } else {
            e.beat++;
            e.timer = countBeatFrames(state, t);
            events.push({ type: 'countTick', enemy: e.id, beat: e.beat, ...centreOf(e) });
          }
        }
        break;
      }
      case 'RISE': {
        e.vx = 0;
        if (--e.timer <= 0) resume(state, e);
        break;
      }
      default:
        break;
    }
    if (isInert(e)) continue;
    physics(e, d, t);
    syncEnemySource(L, e);
  }
}

function hopUp(
  e: Enemy,
  j: NonNullable<EnemyDef['movement']['jump']>,
  kx: number,
  p: GameState['player'],
  ts: number,
  g: number,
): void {
  const rise = e.y + e.h - (p.y + p.h);
  if (rise > ts / 2 && rise <= j.maxRisePx && Math.abs(kx - (e.x + e.w / 2)) <= j.withinPx)
    e.vy = -speedForHeight(g, j.risePx);
}

/** CHASE movement by kind (walk, fly, keepAway, static). */
function chaseMove(
  state: GameState,
  room: Room,
  e: Enemy,
  d: EnemyDef,
  sm: number,
  t: Tuning,
  events: SimEvent[],
): void {
  const p = state.player;
  const kx = p.x + p.w / 2;
  const mv = d.movement;
  const ts = t.world.tileSize;
  const c = t.combat;
  switch (mv.kind) {
    case 'fly': {
      const h = mv.hover as NonNullable<typeof mv.hover>;
      const side = e.x + e.w / 2 < kx ? -1 : 1;
      const bob = sineAt(state.frame + e.id * 17, h.bobPeriod, h.bobPx);
      flyToward(e, kx + side * h.offsetX, p.y - h.heightPx + bob, mv.chaseSpeed * sm);
      e.facing = kx >= e.x + e.w / 2 ? 1 : -1;
      return;
    }
    case 'keepAway': {
      const k = mv.keep as NonNullable<typeof mv.keep>;
      const dx = kx - (e.x + e.w / 2);
      const dist = Math.abs(dx);
      const toward = dx > 0 ? 1 : -1;
      e.facing = toward;
      if (dist < k.hopPx && e.grounded && e.cooldown === 0 && !col.blockedX(e, -toward)) {
        setMode(e, 'HOP');
        e.timer = k.hopFrames;
        e.vx = (-toward * k.hopBackPx) / k.hopFrames;
        e.vy = k.hopVy;
        e.cooldown = k.hopFrames * 2;
        events.push({ type: 'hop', enemy: e.id, ...centreOf(e) });
        return;
      }
      if (dist > k.maxPx) e.vx = toward * mv.chaseSpeed * sm;
      else if (dist < k.minPx && groundAhead(room, ts, e, -toward) && !col.blockedX(e, -toward))
        e.vx = -toward * mv.chaseSpeed * sm;
      else e.vx = 0;
      return;
    }
    case 'static':
      e.vx = 0;
      e.facing = kx >= e.x + e.w / 2 ? 1 : -1;
      return;
    default: {
      // Kid is below (a tile or more): don't stand over her, keep walking (off the ledge).
      // (No stopping gap either: standing at a ledge beside her deadlocked the Pit, L4 report.)
      const below = p.y + p.h >= e.y + e.h + ts;
      if (below && e.grounded) {
        // Turn only when she is clearly to one side; over her, keep going (off the ledge).
        const dx = kx - (e.x + e.w / 2);
        if (Math.abs(dx) > e.w / 2) e.facing = dx > 0 ? 1 : -1;
        e.vx = e.facing * mv.chaseSpeed * sm;
      } else walkToward(e, kx, mv.chaseSpeed * sm, (e.w + p.w) / 2 + c.chaseGapPx);
      if (mv.jump && e.grounded && p.grounded) hopUp(e, mv.jump, kx, p, ts, c.enemyGravity);
    }
  }
}

/** The Runner: away from Kid, turning at walls and jumping gaps. */
function fleeMove(room: Room, e: Enemy, d: EnemyDef, kx: number, ts: number, g: number): void {
  const f = d.movement.flee as NonNullable<EnemyDef['movement']['flee']>;
  if (e.stateFrame === 1 || (e.grounded && e.stateFrame % 30 === 0)) e.facing = kx > e.x + e.w / 2 ? -1 : 1;
  if (col.blockedX(e, e.facing)) {
    // Cornered: try the jump first, then turn.
    if (e.grounded) e.vy = -speedForHeight(g, f.jumpPx);
    else e.facing = e.facing > 0 ? -1 : 1;
  } else if (e.grounded && !groundAhead(room, ts, e, e.facing)) e.vy = -speedForHeight(g, f.jumpPx);
  e.vx = e.facing * f.speed;
}

function lockDive(e: Enemy, speed: number, kx: number, ky: number): void {
  const dx = kx - (e.x + e.w / 2);
  const dy = ky - (e.y + e.h / 2);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  e.aimX = (dx / len) * speed;
  e.aimY = (dy / len) * speed;
  e.facing = dx >= 0 ? 1 : -1;
}

function beginActive(state: GameState, e: Enemy, a: AttackDef, _t: Tuning, events: SimEvent[]): void {
  setMode(e, 'ACTIVE');
  e.token = true;
  e.timer = a.active;
  e.hitList = [];
  events.push({ type: 'attackActive', enemy: e.id, attackId: e.attackId, ...centreOf(e) });
  if (a.projectile) {
    e.shotsLeft = a.projectile.count;
    e.shotT = 0;
    fireDue(state, e, a, events);
  }
}

/** Fires the next projectile of an active attack when its interval is up. */
function fireDue(state: GameState, e: Enemy, a: AttackDef, events: SimEvent[]): void {
  const pr = a.projectile;
  if (!pr || e.shotsLeft <= 0) return;
  if (e.shotT > 0) {
    e.shotT--;
    return;
  }
  fireProjectile(state, e, e.attackId, a, pr, events);
  e.shotsLeft--;
  e.shotT = Math.max(0, pr.interval - 1);
}

function activeStep(
  state: GameState,
  room: Room,
  e: Enemy,
  d: EnemyDef,
  a: AttackDef,
  sm: number,
  t: Tuning,
  events: SimEvent[],
): void {
  const ts = t.world.tileSize;
  let rec = a.recovery;
  let end = e.stateFrame >= e.timer;
  if (a.dive !== undefined) {
    e.vx = e.aimX * sm;
    e.vy = e.aimY * sm;
    if (e.aimY > 0 && col.blockedY(e, 1)) {
      end = true;
      rec = a.stuckRecovery ?? a.recovery;
    } else if (col.blockedX(e, e.aimX > 0 ? 1 : -1) || (e.aimY < 0 && col.blockedY(e, -1))) end = true;
  } else {
    e.vx = e.facing * a.vx * sm;
    if (d.flying) e.vy = 0;
    if (a.stopAtWall && a.vx > 0 && col.blockedX(e, e.facing)) {
      end = true;
      rec = a.wallStunRecovery ?? a.recovery;
    } else if (a.stopAtLedge && a.vx > 0 && e.grounded && !groundAhead(room, ts, e, e.facing)) end = true;
  }
  if (!end) fireDue(state, e, a, events);
  if (end) {
    e.vx = 0;
    if (d.flying) e.vy = 0;
    setMode(e, 'RECOVERY');
    e.timer = rec;
    e.cooldown = a.trigger.cooldown;
  }
}

function physics(e: Enemy, d: EnemyDef, t: Tuning): void {
  const c = t.combat;
  // Flyers ignore gravity unless they are knocked out of the air.
  const falls = !d.flying || e.state === 'DOWN' || e.state === 'COUNT' || e.state === 'LAUNCHED';
  if (falls) e.vy = Math.min(c.enemyMaxFall, e.vy + c.enemyGravity);
  let vx = e.vx + e.kb;
  if (e.kb !== 0) e.kb = Math.abs(e.kb) <= c.enemyKbDecay ? 0 : e.kb - Math.sign(e.kb) * c.enemyKbDecay;
  const room = col.room as Room;
  const x0 = e.x;
  const onSlope = falls && e.grounded && onSlopeGround(room, e.x, e.y, e.w, e.h);
  if (moveX(e, vx, col) === Move.blocked) {
    vx = 0;
    e.kb = 0;
  }
  const my = moveY(e, e.vy, col);
  if (my === Move.blocked) e.vy = 0;
  // Ground stick down slopes (as Kid's controller does).
  if (onSlope && e.vy >= 0 && !col.blockedY(e, 1)) {
    const y0 = e.y;
    const max = Math.abs(e.x - x0) + SLOPE_SNAP_PX;
    for (let k = 0; k < max && !col.blockedY(e, 1); k++) e.y++;
    if (col.blockedY(e, 1)) {
      e.vy = 0;
      e.ry = 0;
    } else e.y = y0;
  }
  e.grounded = falls ? e.vy >= 0 && col.blockedY(e, 1) : false;
}

function syncEnemySource(L: LocalState, e: Enemy): void {
  const s = sourceOf(L, e);
  if (!s) return;
  s.x = e.x;
  s.y = e.y;
  s.w = e.w;
  s.h = e.h;
}

/** Removes an enemy's hanging shots (a KO'd or repossessed enemy's darts and words vanish). */
function dropShots(L: LocalState, e: Enemy): void {
  for (let i = L.shots.length - 1; i >= 0; i--) {
    const s = L.shots[i];
    if (s?.enemy !== e.id || s.kind === 'dart' || s.kind === 'mortar') continue;
    L.shots.splice(i, 1);
    const si = L.sources.findIndex((x) => x.kind === 'shot' && x.ent === s.id);
    if (si >= 0) L.sources.splice(si, 1);
  }
}

export function ko(state: GameState, e: Enemy, t: Tuning, events: SimEvent[]): void {
  setMode(e, 'KO');
  e.vx = 0;
  e.kb = 0;
  events.push({ type: 'ko', enemy: e.id, ...centreOf(e) });
  dropShots(state.local, e);
  pay(state, e.poundage, t, events, centreOf(e));
}

export function knockdown(_state: GameState, e: Enemy, t: Tuning, events: SimEvent[]): void {
  const d = enemyDef(e.type);
  setMode(e, 'DOWN');
  e.timer = d.class === 'runner' ? (d.movement.flee?.downFrames ?? t.combat.downFrames) : t.combat.downFrames;
  e.attackId = '';
  e.shotsLeft = 0;
  events.push({ type: 'down', enemy: e.id, ...centreOf(e) });
}

export interface DamageOpts {
  /** Force a knockdown (brown levy on a light enemy, Return to sender, Counter). */
  knock?: boolean;
  /** The hit's class (a boss's Return to sender staggers instead of knocking down). */
  cls?: HitClass;
  /** Launch vy (the Uppercut, a pink levy). */
  launchVy?: number;
  /** A Return to sender (bosses stagger for it). */
  returned?: boolean;
}

/**
 * Damage to an enemy. Fodder at 0 HP is KO'd; elites go down for the Count (and are counted out
 * at 0 HP); a boss's phase logic runs in boss.ts. A punch outside an attack makes a light enemy
 * flinch. Knockback is `kb` x kbScale.
 */
export function damageEnemy(
  state: GameState,
  e: Enemy,
  dmg: number,
  kb: number,
  t: Tuning,
  events: SimEvent[],
  o: DamageOpts = {},
): void {
  const d = enemyDef(e.type);
  e.rattled = t.combat.rattledFrames;
  e.kb = kb * d.kbScale;
  if (d.class === 'runner') {
    if (!isDowned(e)) knockdown(state, e, t, events);
    return;
  }
  e.hp = Math.max(0, e.hp - dmg);
  if (isDowned(e)) return;
  if (isBoss(e)) {
    bossOnDamage(state, e, t, events, o);
    return;
  }
  if (e.hp <= 0 && d.class === 'fodder') {
    ko(state, e, t, events);
    return;
  }
  if (e.hp <= 0 || o.knock) {
    knockdown(state, e, t, events);
    return;
  }
  if (o.launchVy !== undefined && d.kbScale >= t.combat.launchMinKbScale) {
    e.vy = o.launchVy;
    setMode(e, 'LAUNCHED');
    e.timer = t.combat.launchFrames;
    e.attackId = '';
    return;
  }
  if (d.flinchFrames > 0 && FLINCHABLE.has(e.state)) {
    setMode(e, 'FLINCH');
    e.timer = d.flinchFrames;
    e.attackId = '';
    events.push({ type: 'flinch', enemy: e.id, ...centreOf(e) });
  }
}

/** Seize priority for an enemy source (combat/priority.ts). */
export function enemySeizePriority(state: GameState, src: Source): SeizePriority {
  const e = enemyById(state.local, src.ent);
  if (!e || isInert(e)) return SeizePri.none;
  if (isDowned(e)) return SeizePri.downed;
  const d = enemyDef(e.type);
  if (d.class === 'runner') return SeizePri.open;
  let seizable = false;
  let anyHome = false;
  for (const id of src.soundIds) {
    const s = soundById(state.local, id);
    if (s?.status !== 'home') continue;
    anyHome = true;
    if (s.colour !== 'white') seizable = true;
  }
  if (!anyHome) return SeizePri.none;
  // Only white static left at home: it hums, but can't be taken.
  if (!seizable) return SeizePri.refused;
  if (e.state === 'TELEGRAPH') {
    const a = d.attacks[e.attackId];
    if (a && !a.snatch && a.sound !== null && attackArmed(state.local, e, a)) {
      const s = soundOf(state.local, e, a.sound);
      if (s && s.colour !== 'white') return SeizePri.catch;
    }
  }
  // The boss after a Return to sender: staggered but guarded (punish with punches, not a re-grab).
  if (e.boss && e.boss.guardT > 0 && !isDowned(e)) return SeizePri.guarded;
  if (OPEN.has(e.state) || e.rattled > 0) return SeizePri.open;
  return SeizePri.guarded;
}

export interface SeizeResult {
  outcome: 'take' | 'guard' | 'refused';
  soundId?: number;
}

/** First seizable voice at home, in seizeOrder. */
function firstVoice(L: LocalState, e: Enemy, d: EnemyDef): Sound | undefined {
  for (const name of d.seizeOrder) {
    const s = soundOf(L, e, name);
    if (s?.status === 'home' && s.colour !== 'white') return s;
  }
  return undefined;
}

/** Seize on an enemy source: Catch, open take, repossess (downed), guarded, refused, or the Runner. */
export function enemySeize(
  state: GameState,
  src: Source,
  kidFacing: number,
  t: Tuning,
  events: SimEvent[],
  take: (s: Sound) => void,
): SeizeResult {
  const L = state.local;
  const e = enemyById(L, src.ent) as Enemy;
  const d = enemyDef(e.type);
  const pos = centreOf(e);
  if (d.class === 'runner') return runnerSeized(state, e, d, t, events);
  if (isDowned(e)) {
    if (isBoss(e)) return bossCountSeized(state, e, t, events, take);
    // Repossess: removed for good; its first armed voice goes into the bag; pays double.
    setMode(e, 'REPOSSESSED');
    requestHitstop(state, 'repossess', t);
    events.push({ type: 'repossess', enemy: e.id, ...pos });
    dropShots(L, e);
    pay(state, e.poundage * t.combat.repossessPayMult, t, events, pos);
    const got = firstVoice(L, e, d);
    if (got) take(got);
    return got ? { outcome: 'take', soundId: got.id } : { outcome: 'take' };
  }
  const pri = enemySeizePriority(state, src);
  if (pri === SeizePri.guarded) {
    damageEnemy(state, e, 1, 0, t, events);
    requestHitstop(state, 'light', t);
    events.push({ type: 'seizeGuarded', target: e.id, ...pos });
    return { outcome: 'guard' };
  }
  if (pri === SeizePri.refused) {
    events.push({ type: 'seizeRefused', target: e.id, ...pos });
    return { outcome: 'refused' };
  }
  let s: Sound | undefined;
  const catching = pri === SeizePri.catch;
  if (catching) {
    const a = d.attacks[e.attackId];
    s = a?.sound ? soundOf(L, e, a.sound) : undefined;
  }
  if (s?.status !== 'home') s = firstVoice(L, e, d);
  if (!s) return { outcome: 'refused' };
  e.hp = Math.max(0, e.hp - 1);
  e.rattled = t.combat.rattledFrames;
  take(s);
  if (catching) {
    requestHitstop(state, 'catch', t);
    events.push({ type: 'catch', enemy: e.id, attackId: e.attackId, ...pos });
    setMode(e, 'STAGGER');
    e.timer = d.staggerFrames ?? t.combat.staggerFrames;
    e.attackId = '';
    e.shotsLeft = 0;
  } else if (!isBoss(e)) {
    // A tug toward Kid, and straight into RETRIEVE.
    e.kb = -kidFacing * t.combat.enemyKbSeizeTug * d.kbScale;
    // Timed states (stagger, launch, flinch) finish first; resume() then goes to RETRIEVE.
    if (e.state !== 'STAGGER' && e.state !== 'LAUNCHED' && e.state !== 'FLINCH') {
      e.attackId = '';
      setMode(e, 'RETRIEVE');
    }
  }
  if (!isBoss(e)) {
    e.target = s.id;
    events.push({ type: 'retrieve', soundId: s.id, enemy: e.id, ...pos });
  }
  if (e.hp <= 0 && d.class === 'fodder') ko(state, e, t, events);
  return { outcome: 'take', soundId: s.id };
}

/** Seize on the Runner: it slips the first few with a hop, then it's caught (redistrained). */
function runnerSeized(state: GameState, e: Enemy, d: EnemyDef, t: Tuning, events: SimEvent[]): SeizeResult {
  const f = d.movement.flee as NonNullable<EnemyDef['movement']['flee']>;
  const pos = centreOf(e);
  if (!isDowned(e) && e.slips > 0) {
    e.slips--;
    setMode(e, 'HOP');
    e.timer = f.slipFrames;
    e.vy = f.slipVy;
    e.vx = e.facing * f.speed;
    events.push({ type: 'runnerSlip', enemy: e.id, ...pos });
    return { outcome: 'guard' };
  }
  setMode(e, 'REPOSSESSED');
  requestHitstop(state, 'catch', t);
  events.push({ type: 'catch', enemy: e.id, attackId: '', ...pos });
  const r = state.run.runner;
  if (r) {
    state.run.poundage += r.poundage;
    state.run.lien = Math.max(0, state.run.lien - r.lien);
    state.player.chinMax = t.kid.chin - state.run.lien;
    events.push({ type: 'redistrained', poundage: r.poundage, ...pos });
    state.run.runner = null;
  }
  return { outcome: 'take' };
}

/** What hit Kid this step (step 8.2), for kid.ts to apply. */
export interface KidHit {
  dmg: number;
  enemy: Enemy | null;
  /** Source x for the knockback direction. */
  fromX: number;
  /** The attack id that hit ('contact' for a body). */
  attack: string;
}

/**
 * Enemy hitboxes and bodies vs Kid (step 8.2). A Snatch is applied here (0 damage: it takes its
 * sound back from the bag); a damaging hit is returned for the kid module to apply (first only).
 * With the Slip's i-frames up, a live hitbox over Kid is a clean Slip (`slipped` gets its enemy).
 */
export function enemyHitsOnKid(
  state: GameState,
  t: Tuning,
  events: SimEvent[],
  inv: { hurt: boolean; slip: boolean },
  slipped: { enemy: number },
): KidHit | null {
  const L = state.local;
  const p = state.player;
  if (!kidTargetable(state)) return null;
  const invulnerable = inv.hurt || inv.slip;
  const kid = boxAt(p.x, p.y, p.w, 1, KID_HURTBOX);
  for (const e of L.enemies) {
    if (isInert(e)) continue;
    const d = enemyDef(e.type);
    if (e.boss && e.boss.charge > 0) {
      const dmg = e.boss.charge;
      e.boss.charge = 0;
      if (!invulnerable) return { dmg, enemy: e, fromX: e.x + e.w / 2, attack: 'sellBag' };
    }
    if (e.state === 'ACTIVE' && e.attackId) {
      const a = d.attacks[e.attackId];
      if (a && !e.hitList.includes(0)) {
        for (const hb of a.hitboxes) {
          if (e.stateFrame < hb.fromFrame || e.stateFrame > hb.toFrame) continue;
          if (!rectsOverlap(boxAt(e.x, e.y, e.w, e.facing, hb.box), kid)) continue;
          if (a.snatch) {
            const s = soundById(L, e.target);
            if (s && s.status === 'bag') {
              e.hitList.push(0);
              events.push({ type: 'snatch', soundId: s.id, enemy: e.id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
              sendHome(state, s, events);
              p.recoilVx = e.facing * a.push;
              p.recoilT = t.combat.snatchPushFrames;
            }
          } else if (inv.slip && !inv.hurt && a.dmg > 0) {
            e.hitList.push(0);
            slipped.enemy = e.id;
          } else if (!invulnerable) {
            e.hitList.push(0);
            return { dmg: a.dmg, enemy: e, fromX: e.x + e.w / 2, attack: e.attackId };
          }
          break;
        }
      }
    }
    // Bodies: contact damage, except while Kid Slips (she slips past bodies; hitboxes still count).
    if (
      !invulnerable &&
      p.state !== 'dash' &&
      !HARMLESS.has(e.state) &&
      d.contactDmg > 0 &&
      rectsOverlap(hurtRect(e), kid)
    )
      return { dmg: d.contactDmg, enemy: e, fromX: e.x + e.w / 2, attack: 'contact' };
  }
  return null;
}

/** Levied projectiles in flight vs enemies (step 8.3): damage, knockdown, launch, Return to sender. */
export function leviedHitsEnemies(state: GameState, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  for (let i = 0; i < L.levied.length; i++) {
    const l = L.levied[i];
    if (l?.phase !== 'flight' || l.dmg <= 0) continue;
    const pierce = l.colour === 'violet' ? t.levy.violetPierce : 1;
    for (const e of L.enemies) {
      if (isInert(e) || isDowned(e) || l.hitList.includes(e.id) || l.hitList.length >= pierce) continue;
      if (enemyDef(e.type).class === 'runner') continue;
      if (!rectsOverlap(l, hurtRect(e))) continue;
      l.hitList.push(e.id);
      const d = enemyDef(e.type);
      const own = e.source === l.owner;
      const cls: HitClass = l.colour === 'brown' || own ? 'heavy' : 'medium';
      const dmg = own ? Math.ceil(l.dmg * t.combat.returnMult) : l.dmg;
      const kbv = cls === 'heavy' ? t.combat.enemyKbHeavy : t.combat.enemyKbMedium;
      const dir = l.vx !== 0 ? Math.sign(l.vx) : e.x + e.w / 2 >= l.x + l.w / 2 ? 1 : -1;
      const knock = own || (l.colour === 'brown' && d.kbScale > t.combat.knockdownKbScale);
      requestHitstop(state, cls, t);
      events.push({ type: 'hit', cls, move: 'levy', target: e.id, dmg, ...centreOf(e), dir });
      if (own && isBoss(e)) bossReturnHit(state, e, dmg, t, events);
      else
        damageEnemy(state, e, dmg, dir * kbv, t, events, {
          knock,
          cls,
          returned: own,
          ...(l.colour === 'pink' ? { launchVy: t.levy.pinkEnemyLaunchVy } : {}),
        });
      if (own) {
        // The owner re-absorbs its sound, but it's down and open for the Count.
        const s = soundById(L, l.soundId);
        if (s) {
          events.push({ type: 'absorb', soundId: s.id, enemy: e.id, ...centreOf(e) });
          sendHome(state, s, events);
          i--;
        }
        break;
      }
    }
  }
}

/** Landed springs launch enemies that land on them, once per enemy per spring (step 8.4). */
export function springEnemies(state: GameState, t: Tuning, events: SimEvent[]): void {
  for (const l of state.local.levied) {
    if (l.colour !== 'pink' || l.phase !== 'landed') continue;
    for (const e of state.local.enemies) {
      // Each spring launches a given enemy once (no endless trampolining under a slow walker).
      if (isInert(e) || isDowned(e) || e.vy < 0 || l.hitList.includes(e.id) || isBoss(e)) continue;
      if (enemyDef(e.type).flying) continue;
      const feet = e.y + e.h;
      if (e.x < l.x + l.w && l.x < e.x + e.w && feet >= l.y && feet <= l.y + l.h + 1) {
        l.hitList.push(e.id);
        e.vy = t.levy.pinkEnemyLaunchVy;
        l.squash = t.levy.pinkSquashFrames;
        events.push({ type: 'springBounce', levied: l.id, target: e.id, x: e.x + e.w / 2, y: feet });
      }
    }
  }
}

/** Bookkeeping (step 11): rattled timers and revoicing (voices away too long regrow at home). */
export function enemyBookkeeping(state: GameState, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  for (const e of L.enemies) if (e.rattled > 0) e.rattled--;
  for (const s of L.sounds) {
    if (s.kind !== 'voice' || s.status === 'home' || s.status === 'consumed' || s.status === 'held') continue;
    const src = sourceById(L, s.owner);
    const e = src ? enemyById(L, src.ent) : undefined;
    if (!e || isInert(e)) continue;
    const limit = isBoss(e) ? t.combat.bossRevoiceFrames : t.combat.revoiceFrames;
    if (++s.awayFrames >= limit) {
      if (s.status === 'bag') {
        const p = state.player;
        events.push({ type: 'bagLeak', soundId: s.id, colour: s.colour, x: p.x + p.w / 2, y: p.y + p.h / 2 });
      }
      events.push({ type: 'revoice', soundId: s.id, enemy: e.id, ...centreOf(e) });
      sendHome(state, s, events);
    }
  }
}

/** Every enemy KO'd or repossessed (the Runner doesn't count). */
export function allDown(L: LocalState): boolean {
  let any = false;
  for (const e of L.enemies) {
    if (enemyDef(e.type).class === 'runner') continue;
    any = true;
    if (!isInert(e)) return false;
  }
  return any;
}

export { refreshSource };
