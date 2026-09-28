import { requestHitstop } from '../combat/hitstop';
import type { SimEvent } from '../events';
import { solidAt } from '../physics/aabb';
import { rngInt } from '../rng';
import { pay } from '../run';
import { bagRemove, refreshSource, sendHome, soundById } from '../sound';
import type { Enemy, GameState, Shot, Sound, Source } from '../state';
import type { Tuning } from '../tuning';
import { dynSolidAt } from '../world/dynamic';
import type { Room } from '../world/rooms';
import {
  attackArmed,
  centreOf,
  type DamageOpts,
  knockdown,
  resume,
  type SeizeResult,
  setMode,
  soundOf,
  startAttack,
  tokensHeld,
} from './enemy';
import { type AttackDef, type EnemyDef, enemyDef, param, paramList } from './schema';
import { followKid, makeShot, removeShot, shotById } from './shots';

/**
 * The Auctioneer (combat-spec §5), a scripted greybox boss on top of the generic FSM: the generic
 * code runs his STAGGER, DOWN and COUNT; this file picks his moves (Cadence forced every 3rd
 * action), runs Patter, Gavel, Hop, Cadence ("Going once... twice... SOLD"), Selling Your Bag and
 * "Uses what he bought", and the phase change. Every number is in content/enemies/auctioneer.json.
 * Lots are the room's locked object sources, left to right.
 */

export function isBoss(e: Enemy): boolean {
  return e.boss !== null;
}

/** The room's lots (locked humming objects), left to right. */
export function lots(state: GameState): Source[] {
  return state.local.sources.filter((s) => s.kind === 'object' && s.locked).sort((a, b) => a.x - b.x);
}

function fever(state: GameState): number {
  return Math.max(0, Math.min(4, Math.max(state.run.fever, state.local.fever)));
}

function setFever(
  state: GameState,
  t: Tuning,
  level: number,
  events: SimEvent[],
  at: { x: number; y: number },
): void {
  const f = Math.max(0, Math.min(t.boss.feverMax, level));
  if (f === state.local.fever) return;
  state.local.fever = f;
  events.push({ type: 'fever', level: f, ...at });
}

function beatLen(state: GameState, d: EnemyDef): number {
  const beats = paramList(d, 'cadenceBeat');
  return beats[Math.min(beats.length - 1, fever(state))] as number;
}

/** Removes the hanging TWICE word and unmarks the lots. */
function clearCall(state: GameState, e: Enemy): void {
  const b = e.boss;
  if (!b) return;
  if (b.word) removeShot(state.local, b.word);
  b.word = 0;
  b.lots = [];
  b.beat = 0;
}

/** Integer-stepped line of sight from his centre to Kid's, blocked by tiles and dynamic solids (slabs). */
export function lineOfSight(state: GameState, room: Room, e: Enemy, ts: number): boolean {
  const p = state.player;
  const x0 = e.x + e.w / 2;
  const y0 = e.y + e.h / 3;
  const x1 = p.x + p.w / 2;
  const y1 = p.y + p.h / 2;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 8));
  for (let i = 1; i < n; i++) {
    const x = Math.floor(x0 + ((x1 - x0) * i) / n);
    const y = Math.floor(y0 + ((y1 - y0) * i) / n);
    if (solidAt(room, ts, x, y, 1, 1) || dynSolidAt(x, y, 1, 1)) return false;
  }
  return true;
}

function begin(state: GameState, e: Enemy, id: string, t: Tuning, events: SimEvent[]): void {
  const d = enemyDef(e.type);
  const a = d.attacks[id] as AttackDef;
  startAttack(state, e, id, a, t, events);
  const b = e.boss;
  if (!b) return;
  if (id === 'cadence' || id === 'sellBag') {
    e.timer = 2 * beatLen(state, d);
    b.beat = 1;
    if (id === 'cadence') markLots(state, e, t, events);
    else events.push({ type: 'lotMarked', enemy: e.id, lot: -1, beat: 1, ...centreOf(e) });
  } else if (id === 'hop' || id === 'usePink') {
    // To the other end of the rostrum (or the arena's far side for the spring).
    // Alternates between his home spot and `span` px to its right.
    const span = param(d, id === 'hop' ? 'hopPx' : 'springPx');
    b.hopTo = Math.abs(e.x - e.homeX) < 1 ? e.homeX + span : e.homeX;
  } else if (id === 'useBrown') {
    const p = state.player;
    const pr = a.projectile;
    if (pr) {
      const s = makeShot(state, e, id, null, {
        kind: 'slab',
        x: p.x + p.w / 2 - pr.w / 2,
        y: p.y - param(d, 'slabHangPx'),
        w: pr.w,
        h: pr.h,
        vx: 0,
        vy: 0,
        gravity: 0,
        dmg: pr.dmg,
        life: pr.life + e.timer,
        seizable: false,
        colour: 'brown',
      });
      // It carries the bought sound: catch it in the telegraph and take it back.
      s.soundId = b.bought;
      s.seizable = true;
      state.local.sources.push({
        id: state.local.nextId++,
        kind: 'shot',
        ent: s.id,
        char: '',
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        soundIds: [b.bought],
        solidWhenArmed: false,
        ghost: false,
        pendingSolid: false,
      });
      b.word = 0;
      e.aimX = s.id;
    }
  }
}

/** Beat 1 of a Cadence: marks one lot (two in phase 2), preferring the one under Kid. */
function markLots(state: GameState, e: Enemy, _t: Tuning, events: SimEvent[]): void {
  const b = e.boss;
  if (!b) return;
  const all = lots(state);
  const free = all.map((s, i) => [s, i] as const).filter(([s]) => !(s.soldT && s.soldT > 0));
  if (free.length === 0) return;
  const p = state.player;
  const kx = p.x + p.w / 2;
  let near = free[0] as readonly [Source, number];
  for (const f of free)
    if (Math.abs(f[0].x + f[0].w / 2 - kx) < Math.abs(near[0].x + near[0].w / 2 - kx)) near = f;
  b.lots = [near[1]];
  if (b.phase === 2 && free.length > 1) {
    const rest = free.filter((f) => f[1] !== near[1]);
    const pick = rest[rngInt(state, rest.length)] as readonly [Source, number];
    b.lots.push(pick[1]);
  }
  for (const i of b.lots) {
    const s = all[i] as Source;
    events.push({ type: 'lotMarked', enemy: e.id, lot: i, beat: 1, x: s.x + s.w / 2, y: s.y });
  }
}

/** Beat 2: the pink TWICE word hangs above the marked lot (or above Kid's head for Selling Your Bag). */
function hangWord(state: GameState, e: Enemy, d: EnemyDef, events: SimEvent[]): void {
  const b = e.boss;
  if (!b) return;
  const w = param(d, 'wordW');
  const h = param(d, 'wordH');
  let x: number;
  let y: number;
  const selling = e.attackId === 'sellBag';
  if (selling) {
    const p = state.player;
    x = p.x + p.w / 2 - w / 2;
    y = p.y - param(d, 'wordHeadGap') - h;
  } else {
    const lot = lots(state)[b.lots[0] ?? -1];
    if (!lot) return;
    x = lot.x + lot.w / 2 - w / 2;
    y = lot.y - param(d, 'wordRise') - h / 2;
  }
  const s = makeShot(state, e, e.attackId, 'cadence', {
    kind: 'word',
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    gravity: 0,
    dmg: 0,
    life: e.timer + 2,
    seizable: true,
    colour: 'pink',
    follow: selling,
  });
  b.word = s.id;
  b.beat = 2;
  events.push({
    type: 'lotMarked',
    enemy: e.id,
    lot: b.lots[0] ?? -1,
    beat: 2,
    x: s.x + w / 2,
    y: s.y + h / 2,
  });
}

/** SOLD (Cadence): the marked lots ghost; the floor shockwave runs outward (unless the Gavel is gone). */
function sold(state: GameState, e: Enemy, d: EnemyDef, t: Tuning, events: SimEvent[]): void {
  const b = e.boss;
  if (!b) return;
  const all = lots(state);
  const a = d.attacks.cadence as AttackDef;
  const pr = a.projectile;
  for (const i of b.lots) {
    const lot = all[i];
    if (!lot) continue;
    lot.soldT = param(d, 'soldGhostFrames');
    refreshSource(state, lot, events);
    events.push({ type: 'sold', enemy: e.id, lot: i, x: lot.x + lot.w / 2, y: lot.y });
    if (pr && !b.noGavel)
      for (const dir of [-1, 1])
        makeShot(state, e, 'cadence', null, {
          kind: 'wave',
          x: dir < 0 ? lot.x - pr.w : lot.x + lot.w,
          y: lot.y - pr.h,
          w: pr.w,
          h: pr.h,
          vx: dir * pr.speed,
          vy: 0,
          gravity: 0,
          dmg: pr.dmg,
          life: pr.life,
          seizable: false,
          colour: 'pink',
        });
  }
  setFever(state, t, state.local.fever + 1, events, centreOf(e));
  clearCall(state, e);
}

/** SOLD (Selling Your Bag): in his line of sight and not invulnerable, her oldest sound becomes his. */
function soldBag(state: GameState, room: Room, e: Enemy, t: Tuning, events: SimEvent[]): number {
  const b = e.boss;
  const p = state.player;
  clearCall(state, e);
  if (!b || p.iframes > 0 || p.state === 'dash' || p.down) return 0;
  if (!lineOfSight(state, room, e, t.world.tileSize)) return 0;
  const L = state.local;
  const oldest = L.bag[0];
  if (oldest === undefined) return 1;
  const s = soundById(L, oldest) as Sound;
  bagRemove(L, s.id);
  s.status = 'held';
  s.at = e.id;
  b.bought = s.id;
  events.push({ type: 'soldBag', enemy: e.id, soundId: s.id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  return 0;
}

/** His next move from idle (Cadence forced every cadenceEvery-th action). */
function choose(state: GameState, e: Enemy, d: EnemyDef): string | null {
  const b = e.boss;
  if (!b) return null;
  if (b.bought) {
    const s = soundById(state.local, b.bought);
    if (s) return s.colour === 'brown' ? 'useBrown' : s.colour === 'pink' ? 'usePink' : 'useViolet';
  }
  const L = state.local;
  const cadenceArmed = attackArmed(L, e, d.attacks.cadence as AttackDef);
  const nth = (b.actions + 1) % param(d, 'cadenceEvery') === 0;
  if (nth && cadenceArmed) {
    if (b.phase === 2 && L.bag.length > 0 && (b.actions + 1) % (2 * param(d, 'cadenceEvery')) !== 0)
      return 'sellBag';
    return 'cadence';
  }
  const p = state.player;
  const front = e.facing > 0 ? e.x + e.w : e.x;
  const near = Math.abs(p.x + p.w / 2 - front) <= param(d, 'gavelRangePx');
  const pool: [string, number][] = [];
  if (attackArmed(L, e, d.attacks.patter as AttackDef)) pool.push(['patter', 3]);
  if (near && !b.noGavel && attackArmed(L, e, d.attacks.gavel as AttackDef)) pool.push(['gavel', 4]);
  pool.push(['hop', 1]);
  const choices = pool.length > 1 ? pool.filter(([id]) => id !== e.lastAttack) : pool;
  let total = 0;
  for (const [, w] of choices) total += w;
  let r = rngInt(state, total);
  for (const [id, w] of choices) {
    r -= w;
    if (r < 0) return id;
  }
  return choices[0]?.[0] ?? null;
}

/** Sends a bought sound home after he used it. */
function spend(state: GameState, e: Enemy, events: SimEvent[]): void {
  const b = e.boss;
  if (!b?.bought) return;
  const s = soundById(state.local, b.bought);
  if (s && s.status === 'held') sendHome(state, s, events);
  b.bought = 0;
}

/**
 * Step 7 for the boss. Returns true when it handled the state (idle, his attacks, rise and the
 * phase change); false lets the generic FSM run it (stagger, down, Count).
 */
export function bossStep(state: GameState, room: Room, e: Enemy, t: Tuning, events: SimEvent[]): boolean {
  const b = e.boss;
  if (!b) return false;
  const d = enemyDef(e.type);
  const p = state.player;
  if (b.guardT > 0) b.guardT--;
  const calling = e.state === 'TELEGRAPH' && (e.attackId === 'cadence' || e.attackId === 'sellBag');
  if (b.word && !calling) clearCall(state, e);
  if (b.lots.length && !calling && !(e.state === 'ACTIVE' && e.attackId === 'cadence')) b.lots = [];
  switch (e.state) {
    case 'PATROL':
    case 'CHASE': {
      if (e.state === 'PATROL') setMode(e, 'CHASE');
      e.vx = 0;
      e.facing = p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1;
      const ready =
        e.stateFrame >= param(d, 'idleFrames') &&
        e.cooldown === 0 &&
        p.state !== 'dead' &&
        !p.down &&
        tokensHeld(state.local) < t.combat.maxAttackTokens;
      if (!ready) return true;
      const id = choose(state, e, d);
      if (!id) return true;
      b.actions++;
      begin(state, e, id, t, events);
      return true;
    }
    case 'TELEGRAPH': {
      const a = d.attacks[e.attackId];
      if (!a) {
        resume(state, e);
        return true;
      }
      if (a.sound !== null && !attackArmed(state.local, e, a)) {
        // Its sound was taken mid-call (a Catch staggers him instead: that is the generic path).
        clearCall(state, e);
        resume(state, e);
        return true;
      }
      e.vx = 0;
      if (e.attackId === 'cadence' || e.attackId === 'sellBag') {
        const beat = beatLen(state, d);
        if (e.stateFrame === beat) hangWord(state, e, d, events);
        const w = b.word ? shotById(state.local, b.word) : undefined;
        if (w?.follow) followKid(state, w, param(d, 'followLag'), param(d, 'wordHeadGap'));
        if (e.attackId === 'cadence' && outbid(state, e)) {
          const lot = lots(state)[b.lots[0] ?? -1];
          events.push({
            type: 'outbid',
            enemy: e.id,
            lot: b.lots[0] ?? -1,
            x: lot ? lot.x + lot.w / 2 : e.x,
            y: lot ? lot.y : e.y,
          });
          stun(state, e, param(d, 'outbidStun'));
          return true;
        }
      }
      if (e.attackId === 'useBrown') {
        const s = shotById(state.local, e.aimX);
        if (!s) {
          // Caught in the telegraph: she took it back.
          b.bought = 0;
          setMode(e, 'RECOVERY');
          e.timer = a.recovery;
          return true;
        }
      }
      if (e.stateFrame >= e.timer) {
        setMode(e, 'ACTIVE');
        e.token = true;
        e.timer = a.active;
        e.hitList = [];
        events.push({ type: 'attackActive', enemy: e.id, attackId: e.attackId, ...centreOf(e) });
        activeStart(state, room, e, d, a, t, events);
      }
      return true;
    }
    case 'ACTIVE': {
      const a = d.attacks[e.attackId];
      if (!a) {
        resume(state, e);
        return true;
      }
      activeRun(state, e, d, a, events);
      if (e.stateFrame >= e.timer) {
        e.vx = 0;
        setMode(e, 'RECOVERY');
        e.timer = a.recovery;
      }
      return true;
    }
    case 'RECOVERY': {
      e.vx = 0;
      if (e.stateFrame >= e.timer) {
        e.attackId = '';
        setMode(e, 'CHASE');
      }
      return true;
    }
    case 'RISE': {
      e.vx = 0;
      if (--e.timer > 0) return true;
      if (b.phase === 1) startPhase2(state, e, d, t, events);
      else {
        // Counted out in the final phase: "one more round".
        e.hp = Math.ceil((param(d, 'phase2Hp') * param(d, 'finalRiseHpPct')) / 100);
        b.final = false;
        setFever(state, t, state.local.fever + 1, events, centreOf(e));
      }
      setMode(e, 'CHASE');
      return true;
    }
    default:
      return false;
  }
}

function activeStart(
  state: GameState,
  room: Room,
  e: Enemy,
  d: EnemyDef,
  a: AttackDef,
  t: Tuning,
  events: SimEvent[],
): void {
  const b = e.boss;
  if (!b) return;
  switch (e.attackId) {
    case 'patter': {
      e.shotsLeft = a.projectile?.count ?? 0;
      e.shotT = 0;
      const iv = paramList(d, 'patterInterval');
      e.timer = e.shotsLeft * (iv[Math.min(iv.length - 1, fever(state))] as number);
      break;
    }
    case 'cadence':
      sold(state, e, d, t, events);
      break;
    case 'sellBag':
      // An empty bag costs a pip instead (applied with the other hits on Kid this step).
      b.charge = soldBag(state, room, e, t, events);
      break;
    case 'hop':
    case 'usePink':
      e.vy = param(d, e.attackId === 'usePink' ? 'springVy' : 'hopVy');
      e.vx = (b.hopTo - e.x) / Math.max(1, e.timer);
      events.push({ type: 'hop', enemy: e.id, ...centreOf(e) });
      if (e.attackId === 'usePink') spend(state, e, events);
      break;
    case 'useBrown': {
      const s = shotById(state.local, e.aimX);
      if (s) {
        s.vy = a.projectile?.speed ?? 24;
        s.gravity = 0;
        s.seizable = false;
        const si = state.local.sources.findIndex((x) => x.kind === 'shot' && x.ent === s.id);
        if (si >= 0) state.local.sources.splice(si, 1);
        s.soundId = 0;
      }
      spend(state, e, events);
      break;
    }
    case 'useViolet': {
      const pr = a.projectile;
      if (pr) {
        const p = state.player;
        const [fx, fy] = pr.from;
        const ox = e.facing > 0 ? e.x + fx : e.x + e.w - fx - pr.w;
        const oy = e.y + fy;
        const dx = p.x + p.w / 2 - (ox + pr.w / 2);
        const dy = p.y + p.h / 2 - (oy + pr.h / 2);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        for (const extra of pr.fan)
          makeShot(state, e, 'useViolet', null, {
            kind: 'dart',
            x: ox,
            y: oy,
            w: pr.w,
            h: pr.h,
            vx: (dx / len) * pr.speed,
            vy: (dy / len) * pr.speed + extra,
            gravity: 0,
            dmg: pr.dmg,
            life: pr.life,
            seizable: false,
            colour: 'violet',
          });
        events.push({
          type: 'shot',
          enemy: e.id,
          attackId: 'useViolet',
          kind: 'dart',
          colour: 'violet',
          ...centreOf(e),
        });
      }
      spend(state, e, events);
      break;
    }
    default:
      break;
  }
}

function activeRun(state: GameState, e: Enemy, d: EnemyDef, a: AttackDef, events: SimEvent[]): void {
  if (e.attackId !== 'patter' || e.shotsLeft <= 0) return;
  if (e.shotT > 0) {
    e.shotT--;
    return;
  }
  const pr = a.projectile;
  if (!pr) return;
  const p = state.player;
  const [fx, fy] = pr.from;
  const ox = e.facing > 0 ? e.x + fx : e.x + e.w - fx - pr.w;
  const oy = e.y + fy;
  const dx = p.x + p.w / 2 - (ox + pr.w / 2);
  const dy = p.y + p.h / 2 - (oy + pr.h / 2);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  makeShot(state, e, 'patter', 'patter', {
    kind: 'dart',
    x: ox,
    y: oy,
    w: pr.w,
    h: pr.h,
    vx: (dx / len) * pr.speed,
    vy: (dy / len) * pr.speed,
    gravity: 0,
    dmg: pr.dmg,
    life: pr.life,
    seizable: true,
    colour: 'violet',
  });
  events.push({
    type: 'shot',
    enemy: e.id,
    attackId: 'patter',
    kind: 'dart',
    colour: 'violet',
    x: ox,
    y: oy,
  });
  e.shotsLeft--;
  const iv = paramList(d, 'patterInterval');
  e.shotT = (iv[Math.min(iv.length - 1, fever(state))] as number) - 1;
}

/** A landed brown slab resting on the marked lot: the sale fails ("outbid"). */
function outbid(state: GameState, e: Enemy): boolean {
  const b = e.boss;
  const lot = b ? lots(state)[b.lots[0] ?? -1] : undefined;
  if (!lot) return false;
  for (const l of state.local.levied) {
    if (l.colour !== 'brown' || l.phase !== 'landed') continue;
    if (l.y + l.h === lot.y && l.x < lot.x + lot.w && lot.x < l.x + l.w) return true;
  }
  return false;
}

function stun(state: GameState, e: Enemy, frames: number): void {
  clearCall(state, e);
  e.attackId = '';
  e.shotsLeft = 0;
  setMode(e, 'STAGGER');
  e.timer = frames;
}

function startPhase2(state: GameState, e: Enemy, d: EnemyDef, t: Tuning, events: SimEvent[]): void {
  const b = e.boss;
  if (!b) return;
  b.phase = 2;
  b.final = false;
  e.hp = param(d, 'phase2Hp');
  setFever(state, t, state.local.fever + 1, events, centreOf(e));
  events.push({ type: 'bossPhase', enemy: e.id, phase: 2, ...centreOf(e) });
}

/** Damage bookkeeping for the boss: 0 HP knocks him down for the Count (the phase gate). */
export function bossOnDamage(
  state: GameState,
  e: Enemy,
  t: Tuning,
  events: SimEvent[],
  _o: DamageOpts,
): void {
  const b = e.boss;
  // Rising into the next phase (or "one more round") at 0 HP: a hit can't knock him down again.
  if (!b || e.hp > 0 || e.state === 'RISE') return;
  clearCall(state, e);
  b.final = b.phase === 2;
  knockdown(state, e, t, events);
}

/** Return to sender on the boss: damage and a 90-frame stagger instead of a knockdown. */
export function bossReturnHit(state: GameState, e: Enemy, dmg: number, t: Tuning, events: SimEvent[]): void {
  e.hp = Math.max(0, e.hp - dmg);
  e.rattled = t.combat.rattledFrames;
  if (e.hp <= 0) {
    bossOnDamage(state, e, t, events, {});
    return;
  }
  // A stagger can't be extended, and his voices are guarded through it (L4: take -> return ->
  // take chains stagger-locked him and emptied both phases in 9 s).
  if (e.state === 'STAGGER') return;
  stun(state, e, param(enemyDef(e.type), 'returnStagger'));
  if (e.boss) e.boss.guardT = param(enemyDef(e.type), 'returnStagger');
}

/**
 * A Seize during his Count. Phase 1: you repossess the Gavel (phase 2 loses Gavel and the SOLD
 * wave) and he gets up into phase 2. Final: he is repossessed (the win).
 */
export function bossCountSeized(
  state: GameState,
  e: Enemy,
  t: Tuning,
  events: SimEvent[],
  take: (s: Sound) => void,
): SeizeResult {
  const b = e.boss;
  const pos = centreOf(e);
  requestHitstop(state, 'repossess', t);
  if (!b || b.final || b.phase === 2) {
    setMode(e, 'REPOSSESSED');
    clearCall(state, e);
    spend(state, e, events);
    events.push({ type: 'repossess', enemy: e.id, ...pos });
    pay(state, e.poundage * t.combat.repossessPayMult, t, events, pos);
    return { outcome: 'take' };
  }
  const gavel = soundOf(state.local, e, 'gavel');
  b.noGavel = true;
  events.push({ type: 'repossess', enemy: e.id, ...pos });
  let got: number | undefined;
  if (gavel?.status === 'home') {
    take(gavel);
    got = gavel.id;
  }
  // Consumed for the fight: the Gavel never revoices.
  if (gavel && gavel.status !== 'bag') gavel.status = 'consumed';
  setMode(e, 'RISE');
  e.timer = t.combat.riseFrames;
  return got !== undefined ? { outcome: 'take', soundId: got } : { outcome: 'take' };
}

/**
 * One of his shots was seized: a Patter dart ends the volley (flustered), the TWICE word breaks
 * the Cadence (stunned, fever -1), the bought slab is taken back.
 */
export function bossShotSeized(state: GameState, e: Enemy, shot: Shot, t: Tuning, events: SimEvent[]): void {
  const b = e.boss;
  if (!b) return;
  const d = enemyDef(e.type);
  if (shot.kind === 'word') {
    if (b.word === shot.id) b.word = 0;
    setFever(state, t, state.local.fever - 1, events, centreOf(e));
    stun(state, e, param(d, 'twiceStun'));
  } else if (shot.kind === 'dart' && e.attackId === 'patter' && e.state === 'ACTIVE') {
    stun(state, e, param(d, 'flusterFrames'));
  } else if (shot.kind === 'slab') {
    b.bought = 0;
  }
}

/** Sold lots come back (called every step before the dynamic solids are rebuilt). */
export function tickSold(state: GameState, events: SimEvent[]): void {
  for (const s of state.local.sources) {
    if (!s.soldT || s.soldT <= 0) continue;
    s.soldT--;
    if (s.soldT === 0) refreshSource(state, s, events);
  }
}

/** Tools/tests: make him start move `id` now (the F2 escape search forces each attack). */
export function forceBossMove(state: GameState, e: Enemy, id: string, t: Tuning, events: SimEvent[]): void {
  if (!e.boss) return;
  e.boss.actions++;
  begin(state, e, id, t, events);
}
