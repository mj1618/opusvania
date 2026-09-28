import { boxAt, KID_HURTBOX, rectsOverlap } from '../combat/boxes';
import { requestHitstop } from '../combat/hitstop';
import type { HitClass, SimEvent } from '../events';
import { type Body, type Collider, Move, moveX, moveY, oneWayUnder, solidAt } from '../physics/aabb';
import { rngInt } from '../rng';
import { refreshSource, sendHome, soundById, sourceById } from '../sound';
import type { Enemy, EnemyMode, GameState, LocalState, Sound, Source } from '../state';
import { speedForHeight, type Tuning } from '../tuning';
import { dynSolidAt } from '../world/dynamic';
import type { Room } from '../world/rooms';
import { type AttackDef, type EnemyDef, enemyDef } from './schema';

/**
 * The generic enemy state machine (combat-spec §4.2, L3 brief §4.4): PATROL, CHASE, TELEGRAPH,
 * ACTIVE, RECOVERY, RETRIEVE, ABSORB, STAGGER, LAUNCHED, DOWN, COUNT, REPOSSESSED, RISE, KO.
 * Everything specific to an enemy comes from content/enemies/<id>.json. Attacks are armed only
 * while their sound is home (critique D1); at most combat.maxAttackTokens enemies telegraph or
 * attack at once. Random attack picks come from state.rng (weighted, no immediate repeat).
 */

/** Collider for enemies: tiles, one-ways (from above) and dynamic solids. */
class EnemyCollider implements Collider {
  room: Room | null = null;
  ts = 64;

  blockedX(b: Body, dir: number): boolean {
    return (
      solidAt(this.room as Room, this.ts, b.x + dir, b.y, b.w, b.h) || dynSolidAt(b.x + dir, b.y, b.w, b.h)
    );
  }

  blockedY(b: Body, dir: number): boolean {
    const r = this.room as Room;
    if (solidAt(r, this.ts, b.x, b.y + dir, b.w, b.h) || dynSolidAt(b.x, b.y + dir, b.w, b.h)) return true;
    return dir > 0 && oneWayUnder(r, this.ts, b.x, b.y, b.w, b.h);
  }

  hazard(): boolean {
    return false;
  }
}
const col = new EnemyCollider();

const INERT: ReadonlySet<EnemyMode> = new Set(['KO', 'REPOSSESSED']);
/** States in which the enemy's voices are open to a Seize (besides `rattled`). */
const OPEN: ReadonlySet<EnemyMode> = new Set([
  'TELEGRAPH',
  'RECOVERY',
  'STAGGER',
  'LAUNCHED',
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
]);

export function isInert(e: Enemy): boolean {
  return INERT.has(e.state);
}

export function isDowned(e: Enemy): boolean {
  return e.state === 'DOWN' || e.state === 'COUNT';
}

export function enemyById(L: LocalState, id: number): Enemy | undefined {
  for (const e of L.enemies) if (e.id === id) return e;
  return undefined;
}

export function hurtRect(e: Enemy): { x: number; y: number; w: number; h: number } {
  const d = enemyDef(e.type);
  return boxAt(e.x, e.y, e.w, e.facing, d.hurtbox);
}

function centreOf(e: Enemy): { x: number; y: number } {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

/** Spawns an enemy with its feet on the floor of tile (tx, ty), centred. Returns its id. */
export function spawnEnemy(L: LocalState, type: string, x: number, feetY: number): number {
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
  const e: Enemy = {
    id,
    type,
    source: srcId,
    x: Math.round(x - d.body.w / 2),
    y: feetY - d.body.h,
    rx: 0,
    ry: 0,
    w: d.body.w,
    h: d.body.h,
    vx: 0,
    vy: 0,
    kb: 0,
    facing: -1,
    grounded: true,
    state: 'PATROL',
    stateFrame: 0,
    hp: d.hp,
    attackId: '',
    lastAttack: '',
    cooldown: 0,
    rattled: 0,
    timer: 0,
    beat: 0,
    token: false,
    target: 0,
    travel: 0,
    furious: false,
    hitList: [],
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

function sourceOf(L: LocalState, e: Enemy): Source | undefined {
  return sourceById(L, e.source);
}

function soundOf(L: LocalState, e: Enemy, name: string): Sound | undefined {
  const src = sourceOf(L, e);
  if (!src) return undefined;
  for (const id of src.soundIds) {
    const s = soundById(L, id);
    if (s && s.name === name) return s;
  }
  return undefined;
}

function attackArmed(L: LocalState, e: Enemy, a: AttackDef): boolean {
  if (a.sound === null) return false;
  return soundOf(L, e, a.sound)?.status === 'home';
}

function telegraphFrames(e: Enemy, a: AttackDef, t: Tuning): number {
  const d = enemyDef(e.type);
  return e.furious ? Math.max(t.combat.minTelegraph, a.telegraph + d.furious.telegraphDelta) : a.telegraph;
}

function speedMult(e: Enemy): number {
  return e.furious ? enemyDef(e.type).furious.speedMult : 1;
}

function setState(e: Enemy, s: EnemyMode): void {
  if (e.token && s !== 'TELEGRAPH' && s !== 'ACTIVE') e.token = false;
  e.state = s;
  e.stateFrame = 0;
}

function tokensHeld(L: LocalState): number {
  let n = 0;
  for (const e of L.enemies) if (e.token) n++;
  return n;
}

/** Sound this enemy is retrieving that is still away from home, if any. */
function awayVoice(L: LocalState, e: Enemy): Sound | undefined {
  const src = sourceOf(L, e);
  if (!src) return undefined;
  for (const id of src.soundIds) {
    const s = soundById(L, id);
    if (s && s.status !== 'home') return s;
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

/** Back to chasing, or to retrieving if one of its voices is still away. */
function resume(state: GameState, e: Enemy): void {
  const away = awayVoice(state.local, e);
  if (away) {
    e.target = away.id;
    setState(e, 'RETRIEVE');
  } else {
    e.target = 0;
    setState(e, 'CHASE');
  }
}

function groundAhead(room: Room, ts: number, e: Enemy, dir: number): boolean {
  const x = dir > 0 ? e.x + e.w : e.x - 1;
  return (
    solidAt(room, ts, x, e.y + 1, 1, e.h) ||
    dynSolidAt(x, e.y + 1, 1, e.h) ||
    oneWayUnder(room, ts, x, e.y, 1, e.h)
  );
}

function startAttack(
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
  const colour = a.cue.tint;
  events.push({ type: 'telegraph', enemy: e.id, attackId: id, colour, frames: e.timer, ...centreOf(e) });
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
    if (dx > a.trigger.rangeX + e.w / 2 || dy > a.trigger.rangeY) continue;
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
    const sm = speedMult(e);
    e.stateFrame++;
    if (e.cooldown > 0) e.cooldown--;
    const a = e.attackId ? d.attacks[e.attackId] : undefined;
    switch (e.state) {
      case 'PATROL': {
        const dist = Math.abs(kx - (e.x + e.w / 2)) + Math.abs(ky - (e.y + e.h / 2));
        if (dist <= mv.aggroRange && p.state !== 'dead') {
          setState(e, 'CHASE');
          break;
        }
        if (e.grounded && (!groundAhead(room, ts, e, e.facing) || col.blockedX(e, e.facing)))
          e.facing = e.facing > 0 ? -1 : 1;
        e.vx = e.facing * mv.patrolSpeed * sm;
        break;
      }
      case 'CHASE': {
        walkToward(e, kx, mv.chaseSpeed * sm, c.chaseStopPx);
        if (mv.jump && e.grounded) {
          const rise = e.y + e.h - (p.y + p.h);
          if (
            rise > ts / 2 &&
            rise <= mv.jump.maxRisePx &&
            Math.abs(kx - (e.x + e.w / 2)) <= mv.jump.withinPx
          )
            e.vy = -speedForHeight(c.enemyGravity, mv.jump.risePx);
        }
        if (e.cooldown === 0 && e.grounded && tokensHeld(L) < c.maxAttackTokens && p.state !== 'dead') {
          const pick = pickAttack(state, e, d, false);
          if (pick) startAttack(state, e, pick[0], pick[1], t, events);
        }
        break;
      }
      case 'RETRIEVE': {
        const s = soundById(L, e.target);
        if (!s || s.status === 'home') {
          resume(state, e);
          break;
        }
        const pos = soundPos(state, s);
        if (!pos) break;
        walkToward(
          e,
          pos.x,
          mv.chaseSpeed * c.retrieveSpeedMult * sm,
          s.status === 'bag' ? c.chaseStopPx : 0,
        );
        if (s.status === 'levied' || s.status === 'flight') {
          const l = L.levied.find((x) => x.id === s.at);
          if (l && rectsOverlap(e, l)) {
            setState(e, 'ABSORB');
            e.timer = c.absorbFrames;
            e.vx = 0;
          }
        } else if (
          s.status === 'bag' &&
          e.grounded &&
          tokensHeld(L) < c.maxAttackTokens &&
          p.state !== 'dead'
        ) {
          const pick = pickAttack(state, e, d, true);
          if (pick) startAttack(state, e, pick[0], pick[1], t, events);
        }
        if (mv.jump && e.grounded && s.status === 'bag') {
          const rise = e.y + e.h - (p.y + p.h);
          if (
            rise > ts / 2 &&
            rise <= mv.jump.maxRisePx &&
            Math.abs(kx - (e.x + e.w / 2)) <= mv.jump.withinPx
          )
            e.vy = -speedForHeight(c.enemyGravity, mv.jump.risePx);
        }
        break;
      }
      case 'ABSORB': {
        e.vx = 0;
        if (--e.timer <= 0) {
          const s = soundById(L, e.target);
          if (s && s.status !== 'home' && s.status !== 'bag') {
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
        if (!a.snatch && !attackArmed(L, e, a)) {
          e.cooldown = a.trigger.cooldown;
          resume(state, e);
          break;
        }
        e.vx = a.teleBackPx > 0 ? (-e.facing * a.teleBackPx) / e.timer : 0;
        if (e.stateFrame >= e.timer) {
          setState(e, 'ACTIVE');
          e.token = true;
          e.timer = a.active;
          e.hitList = [];
          events.push({ type: 'attackActive', enemy: e.id, attackId: e.attackId, ...centreOf(e) });
        }
        break;
      }
      case 'ACTIVE': {
        if (!a) {
          resume(state, e);
          break;
        }
        e.vx = e.facing * a.vx * sm;
        let rec = a.recovery;
        let end = e.stateFrame >= e.timer;
        if (a.stopAtWall && a.vx > 0 && col.blockedX(e, e.facing)) {
          end = true;
          rec = a.wallStunRecovery ?? a.recovery;
        } else if (a.stopAtLedge && a.vx > 0 && e.grounded && !groundAhead(room, ts, e, e.facing)) end = true;
        if (end) {
          e.vx = 0;
          setState(e, 'RECOVERY');
          e.timer = rec;
          e.cooldown = a.trigger.cooldown;
        }
        break;
      }
      case 'RECOVERY': {
        e.vx = 0;
        if (e.stateFrame >= e.timer) {
          e.attackId = '';
          resume(state, e);
        }
        break;
      }
      case 'STAGGER':
      case 'LAUNCHED': {
        e.vx = 0;
        if (--e.timer <= 0 && (e.state === 'STAGGER' || e.grounded)) resume(state, e);
        break;
      }
      case 'DOWN': {
        e.vx = 0;
        if (--e.timer <= 0) {
          setState(e, 'COUNT');
          e.beat = 1;
          e.timer = c.countBeatFrames;
          events.push({ type: 'countTick', enemy: e.id, beat: 1, ...centreOf(e) });
        }
        break;
      }
      case 'COUNT': {
        e.vx = 0;
        if (--e.timer <= 0) {
          if (e.beat >= c.countBeats) {
            if (e.hp <= 0) {
              ko(e, events);
            } else {
              setState(e, 'RISE');
              e.timer = c.riseFrames;
              e.furious = true;
              events.push({ type: 'rise', enemy: e.id, ...centreOf(e) });
            }
          } else {
            e.beat++;
            e.timer = c.countBeatFrames;
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
    physics(e, t);
    syncEnemySource(L, e);
  }
}

function physics(e: Enemy, t: Tuning): void {
  const c = t.combat;
  e.vy = Math.min(c.enemyMaxFall, e.vy + c.enemyGravity);
  let vx = e.vx + e.kb;
  if (e.kb !== 0) e.kb = Math.abs(e.kb) <= c.enemyKbDecay ? 0 : e.kb - Math.sign(e.kb) * c.enemyKbDecay;
  if (moveX(e, vx, col) === Move.blocked) {
    vx = 0;
    e.kb = 0;
  }
  const my = moveY(e, e.vy, col);
  if (my === Move.blocked) e.vy = 0;
  e.grounded = e.vy >= 0 && col.blockedY(e, 1);
}

function syncEnemySource(L: LocalState, e: Enemy): void {
  const s = sourceOf(L, e);
  if (!s) return;
  s.x = e.x;
  s.y = e.y;
  s.w = e.w;
  s.h = e.h;
}

function ko(e: Enemy, events: SimEvent[]): void {
  setState(e, 'KO');
  e.vx = 0;
  e.kb = 0;
  events.push({ type: 'ko', enemy: e.id, ...centreOf(e) });
}

function knockdown(e: Enemy, t: Tuning, events: SimEvent[]): void {
  setState(e, 'DOWN');
  e.timer = t.combat.downFrames;
  e.attackId = '';
  events.push({ type: 'down', enemy: e.id, ...centreOf(e) });
}

/**
 * Damage to an enemy. Fodder at 0 HP is KO'd; elites go down for the Count (and are counted out
 * at 0 HP, brief §8 #6). `knock` forces a knockdown (brown levy on a light enemy, Return to sender).
 */
export function damageEnemy(
  _state: GameState,
  e: Enemy,
  dmg: number,
  kb: number,
  knock: boolean,
  t: Tuning,
  events: SimEvent[],
): void {
  const d = enemyDef(e.type);
  e.hp = Math.max(0, e.hp - dmg);
  e.rattled = t.combat.rattledFrames;
  e.kb = kb * d.kbScale;
  if (isDowned(e)) return;
  if (e.hp <= 0 && d.class === 'fodder') {
    ko(e, events);
    return;
  }
  if (e.hp <= 0 || knock) knockdown(e, t, events);
}

/** Seize priority for an enemy source (1 = Catch ... 6 = guarded, 0 = not a target). */
export function enemySeizePriority(state: GameState, src: Source): number {
  const e = enemyById(state.local, src.ent);
  if (!e || isInert(e)) return 0;
  if (isDowned(e)) return 3;
  const armed = src.soundIds.some((id) => soundById(state.local, id)?.status === 'home');
  if (!armed) return 0;
  if (e.state === 'TELEGRAPH') {
    const a = enemyDef(e.type).attacks[e.attackId];
    if (a && !a.snatch && attackArmed(state.local, e, a)) return 1;
  }
  if (OPEN.has(e.state) || e.rattled > 0) return 2;
  return 6;
}

export interface SeizeResult {
  outcome: 'take' | 'guard' | 'refused';
  soundId?: number;
}

/** Seize on an enemy source: Catch, open take, repossess (downed) or guarded. */
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
  if (isDowned(e)) {
    // Repossess: removed for good; its first armed voice goes into the bag.
    setState(e, 'REPOSSESSED');
    requestHitstop('repossess', t);
    events.push({ type: 'repossess', enemy: e.id, ...pos });
    let got: Sound | undefined;
    for (const name of d.seizeOrder) {
      const s = soundOf(L, e, name);
      if (s?.status === 'home') {
        got = s;
        break;
      }
    }
    if (got) take(got);
    return got ? { outcome: 'take', soundId: got.id } : { outcome: 'take' };
  }
  const pri = enemySeizePriority(state, src);
  if (pri === 6) {
    damageEnemy(state, e, 1, 0, false, t, events);
    requestHitstop('light', t);
    events.push({ type: 'seizeGuarded', target: e.id, ...pos });
    return { outcome: 'guard' };
  }
  let s: Sound | undefined;
  const catching = pri === 1;
  if (catching) {
    const a = d.attacks[e.attackId];
    s = a?.sound ? soundOf(L, e, a.sound) : undefined;
  }
  if (s?.status !== 'home') {
    for (const name of d.seizeOrder) {
      const x = soundOf(L, e, name);
      if (x?.status === 'home') {
        s = x;
        break;
      }
    }
  }
  if (!s) return { outcome: 'refused' };
  e.hp = Math.max(0, e.hp - 1);
  e.rattled = t.combat.rattledFrames;
  take(s);
  e.target = s.id;
  if (catching) {
    requestHitstop('catch', t);
    events.push({ type: 'catch', enemy: e.id, attackId: e.attackId, ...pos });
    setState(e, 'STAGGER');
    e.timer = t.combat.staggerFrames;
    e.attackId = '';
  } else {
    // A tug toward Kid, and straight into RETRIEVE.
    e.kb = -kidFacing * t.combat.enemyKbSeizeTug * d.kbScale;
    // Timed states (stagger, launch) finish first; resume() then goes to RETRIEVE.
    if (e.state !== 'STAGGER' && e.state !== 'LAUNCHED') {
      e.attackId = '';
      setState(e, 'RETRIEVE');
    }
  }
  events.push({ type: 'retrieve', soundId: s.id, enemy: e.id, ...pos });
  if (e.hp <= 0 && d.class === 'fodder') ko(e, events);
  return { outcome: 'take', soundId: s.id };
}

/**
 * Enemy hitboxes and bodies vs Kid (step 8.2). A Snatch is applied here (0 damage: it takes its
 * sound back from the bag); a damaging hit is returned for the kid module to apply (first only).
 */
export function enemyHitsOnKid(
  state: GameState,
  t: Tuning,
  events: SimEvent[],
  invulnerable: boolean,
): { dmg: number; enemy: Enemy } | null {
  const L = state.local;
  const p = state.player;
  if (p.state === 'dead') return null;
  const kid = boxAt(p.x, p.y, p.w, 1, KID_HURTBOX);
  for (const e of L.enemies) {
    if (isInert(e)) continue;
    const d = enemyDef(e.type);
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
              p.recoilT = t.combat.kidRecoilFrames;
            }
          } else if (!invulnerable) {
            e.hitList.push(0);
            return { dmg: a.dmg, enemy: e };
          }
          break;
        }
      }
    }
    if (!invulnerable && !HARMLESS.has(e.state) && d.contactDmg > 0 && rectsOverlap(hurtRect(e), kid))
      return { dmg: d.contactDmg, enemy: e };
  }
  return null;
}

/** Levied projectiles in flight vs enemies (step 8.3): damage, knockdown, launch, Return to sender. */
export function leviedHitsEnemies(state: GameState, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  for (let i = 0; i < L.levied.length; i++) {
    const l = L.levied[i];
    if (l?.phase !== 'flight') continue;
    for (const e of L.enemies) {
      if (isInert(e) || isDowned(e) || l.hitList.includes(e.id)) continue;
      if (!rectsOverlap(l, hurtRect(e))) continue;
      l.hitList.push(e.id);
      const d = enemyDef(e.type);
      const own = e.source === l.owner;
      const cls: HitClass = l.colour === 'brown' || own ? 'heavy' : 'medium';
      const dmg = own ? Math.ceil(l.dmg * t.combat.returnMult) : l.dmg;
      const kbv = cls === 'heavy' ? t.combat.enemyKbHeavy : t.combat.enemyKbMedium;
      const dir = l.vx !== 0 ? Math.sign(l.vx) : e.x + e.w / 2 >= l.x + l.w / 2 ? 1 : -1;
      const knock = own || (l.colour === 'brown' && d.kbScale > 0.5);
      requestHitstop(cls, t);
      events.push({ type: 'hit', cls, move: 'levy', target: e.id, dmg, ...centreOf(e), dir });
      damageEnemy(state, e, dmg, dir * kbv, knock, t, events);
      if (l.colour === 'pink' && !isInert(e) && !isDowned(e)) {
        e.vy = t.levy.pinkEnemyLaunchVy;
        setState(e, 'LAUNCHED');
        e.timer = t.combat.launchFrames;
      }
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

/** Landed springs launch enemies that land on them (step 8.4). */
export function springEnemies(state: GameState, t: Tuning, events: SimEvent[]): void {
  for (const l of state.local.levied) {
    if (l.colour !== 'pink' || l.phase !== 'landed') continue;
    for (const e of state.local.enemies) {
      if (isInert(e) || isDowned(e) || e.vy < 0) continue;
      const feet = e.y + e.h;
      if (e.x < l.x + l.w && l.x < e.x + e.w && feet >= l.y && feet <= l.y + l.h + 1) {
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
    if (s.kind !== 'voice' || s.status === 'home') continue;
    const src = sourceById(L, s.owner);
    const e = src ? enemyById(L, src.ent) : undefined;
    if (!e || isInert(e)) continue;
    if (++s.awayFrames >= t.combat.revoiceFrames) {
      events.push({ type: 'revoice', soundId: s.id, enemy: e.id, ...centreOf(e) });
      sendHome(state, s, events);
    }
  }
}

/** Every enemy KO'd or repossessed. */
export function allDown(L: LocalState): boolean {
  if (L.enemies.length === 0) return false;
  for (const e of L.enemies) if (!isInert(e)) return false;
  return true;
}

export { refreshSource };
