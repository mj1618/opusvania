import { boxAt, KID_HURTBOX, rectsOverlap } from '../combat/boxes';
import type { Colour, SimEvent } from '../events';
import { type Body, type Collider, Move, moveX, moveY, solidAt } from '../physics/aabb';
import { feetEmbedded, slopeGround } from '../physics/slopes';
import type { Enemy, GameState, LocalState, Shot } from '../state';
import type { Tuning } from '../tuning';
import { dynSolidAt } from '../world/dynamic';
import type { Room } from '../world/rooms';
import { type AttackDef, enemyDef, type ProjectileDef } from './schema';

/**
 * Enemy projectiles and hanging objects (combat-spec §1.4: every projectile carries its owner's
 * sound, so a Seize can Catch it in flight). A shot is also a sound source (kind 'shot') while it
 * is seizable. Kinds: dart (straight), mortar (ballistic to a locked x; lands as a short blast),
 * blast, wave (runs along the floor), word (the Auctioneer's TWICE, hangs or follows Kid's head),
 * slab (hangs, then drops). Shots stop at tiles and dynamic solids (a brown slab is cover).
 */
class ShotCollider implements Collider {
  room: Room | null = null;
  ts = 0;

  blockedX(b: Body, dir: number): boolean {
    return (
      solidAt(this.room as Room, this.ts, b.x + dir, b.y, b.w, b.h) ||
      dynSolidAt(b.x + dir, b.y, b.w, b.h) ||
      feetEmbedded(this.room as Room, b.x + dir, b.y, b.w, b.h)
    );
  }

  blockedY(b: Body, dir: number): boolean {
    return (
      solidAt(this.room as Room, this.ts, b.x, b.y + dir, b.w, b.h) ||
      dynSolidAt(b.x, b.y + dir, b.w, b.h) ||
      (dir > 0 && slopeGround(this.room as Room, b.x, b.y, b.w, b.h))
    );
  }

  hazard(): boolean {
    return false;
  }
}
const col = new ShotCollider();

export interface ShotInit {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  gravity: number;
  dmg: number;
  life: number;
  seizable: boolean;
  colour: Colour;
  landW?: number;
  landH?: number;
  landFrames?: number;
  follow?: boolean;
}

/** Adds a shot for enemy `e`'s attack (and its source component when it can be seized). */
export function makeShot(
  state: GameState,
  e: Enemy,
  attackId: string,
  soundName: string | null,
  s: ShotInit,
): Shot {
  const L = state.local;
  const id = L.nextId++;
  const src = L.sources.find((x) => x.id === e.source);
  let soundId = 0;
  if (src && soundName)
    for (const sid of src.soundIds) {
      const snd = L.sounds.find((x) => x.id === sid);
      if (snd?.name === soundName) soundId = sid;
    }
  const shot: Shot = {
    id,
    enemy: e.id,
    owner: e.source,
    soundId,
    attackId,
    kind: s.kind,
    colour: s.colour,
    x: Math.round(s.x),
    y: Math.round(s.y),
    rx: 0,
    ry: 0,
    w: s.w,
    h: s.h,
    vx: s.vx,
    vy: s.vy,
    gravity: s.gravity,
    dmg: s.dmg,
    life: s.life,
    age: 0,
    seizable: s.seizable && soundId !== 0,
    spent: false,
    landW: s.landW ?? 0,
    landH: s.landH ?? 0,
    landFrames: s.landFrames ?? 0,
    follow: s.follow ?? false,
    born: state.frame,
  };
  L.shots.push(shot);
  if (shot.seizable)
    L.sources.push({
      id: L.nextId++,
      kind: 'shot',
      ent: id,
      char: '',
      x: shot.x,
      y: shot.y,
      w: shot.w,
      h: shot.h,
      soundIds: [soundId],
      solidWhenArmed: false,
      ghost: false,
      pendingSolid: false,
    });
  return shot;
}

/** Fires one volley of an attack's projectile (darts aim at Kid; mortars at the locked point). */
export function fireProjectile(
  state: GameState,
  e: Enemy,
  attackId: string,
  a: AttackDef,
  pr: ProjectileDef,
  events: SimEvent[],
): void {
  const p = state.player;
  const [fx, fy] = pr.from;
  const ox = e.facing > 0 ? e.x + fx : e.x + e.w - fx - pr.w;
  const oy = e.y + fy;
  const cx = ox + pr.w / 2;
  const cy = oy + pr.h / 2;
  const colour = a.cue.tint;
  if (pr.kind === 'dart') {
    const dx = p.x + p.w / 2 - cx;
    const dy = p.y + p.h / 2 - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    for (const extra of pr.fan)
      makeShot(state, e, attackId, a.sound, {
        kind: 'dart',
        x: ox,
        y: oy,
        w: pr.w,
        h: pr.h,
        vx: (dx / len) * pr.speed,
        vy: (dy / len) * pr.speed + extra,
        gravity: pr.gravity,
        dmg: pr.dmg,
        life: pr.life,
        seizable: pr.seizable,
        colour,
      });
  } else if (pr.kind === 'mortar') {
    // Semi-implicit Euler: after T steps y = y0 + vy0*T + g*T(T+1)/2, landing on the locked feet y.
    const T = pr.flightFrames;
    const g = pr.gravity;
    const vx = (e.aimX - cx) / T;
    const vy = (e.aimY - (oy + pr.h) - (g * T * (T + 1)) / 2) / T;
    makeShot(state, e, attackId, a.sound, {
      kind: 'mortar',
      x: ox,
      y: oy,
      w: pr.w,
      h: pr.h,
      vx,
      vy,
      gravity: g,
      dmg: pr.dmg,
      life: pr.life,
      seizable: pr.seizable,
      colour,
      ...(pr.land ? { landW: pr.land.w, landH: pr.land.h, landFrames: pr.land.frames } : {}),
    });
  } else return;
  events.push({ type: 'shot', enemy: e.id, attackId, kind: pr.kind, colour, x: cx, y: cy });
}

export function shotById(L: LocalState, id: number): Shot | undefined {
  for (const s of L.shots) if (s.id === id) return s;
  return undefined;
}

/** Removes a shot and its source component. */
export function removeShot(L: LocalState, id: number): void {
  const i = L.shots.findIndex((s) => s.id === id);
  if (i >= 0) L.shots.splice(i, 1);
  const si = L.sources.findIndex((s) => s.kind === 'shot' && s.ent === id);
  if (si >= 0) L.sources.splice(si, 1);
}

function syncSource(L: LocalState, s: Shot): void {
  for (const src of L.sources)
    if (src.kind === 'shot' && src.ent === s.id) {
      src.x = s.x;
      src.y = s.y;
      src.w = s.w;
      src.h = s.h;
      return;
    }
}

/** A mortar becomes a short ground blast where it lands. */
function land(L: LocalState, s: Shot, events: SimEvent[]): void {
  events.push({ type: 'shotLand', kind: s.kind, colour: s.colour, x: s.x + s.w / 2, y: s.y + s.h });
  if (s.landFrames <= 0) {
    s.life = 0;
    return;
  }
  const cx = s.x + s.w / 2;
  const bottom = s.y + s.h;
  s.kind = 'blast';
  s.x = Math.round(cx - s.landW / 2);
  s.y = bottom - s.landH;
  s.w = s.landW;
  s.h = s.landH;
  s.vx = 0;
  s.vy = 0;
  s.gravity = 0;
  s.life = s.landFrames;
  s.spent = false;
  const si = L.sources.findIndex((x) => x.kind === 'shot' && x.ent === s.id);
  if (si >= 0) L.sources.splice(si, 1);
  s.seizable = false;
}

/** Words follow Kid's head with a lag (Selling Your Bag); `lag` in frames. */
export function followKid(state: GameState, s: Shot, lag: number, gap: number): void {
  const p = state.player;
  const tx = p.x + p.w / 2 - s.w / 2;
  const ty = p.y - gap - s.h;
  s.x = Math.round(s.x + (tx - s.x) / lag);
  s.y = Math.round(s.y + (ty - s.y) / lag);
}

/** Step 6b: shots in id order. Hanging kinds (word, a slab before it drops) don't move by themselves. */
export function updateShots(state: GameState, room: Room, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  col.room = room;
  col.ts = t.world.tileSize;
  for (const s of L.shots) {
    s.age++;
    s.life--;
    if (s.born === state.frame) {
      syncSource(L, s);
      continue;
    }
    if (s.kind === 'word' || s.kind === 'blast') {
      syncSource(L, s);
      continue;
    }
    s.vy += s.gravity;
    const mx = moveX(s, s.vx, col);
    const my = moveY(s, s.vy, col);
    if (s.kind === 'mortar' || s.kind === 'slab') {
      if (my === Move.blocked && s.vy > 0) land(L, s, events);
      else if (mx === Move.blocked) s.vx = 0;
    } else if (mx === Move.blocked || my === Move.blocked) {
      events.push({ type: 'shotLand', kind: s.kind, colour: s.colour, x: s.x + s.w / 2, y: s.y + s.h / 2 });
      s.life = 0;
    }
    syncSource(L, s);
  }
  for (let i = L.shots.length - 1; i >= 0; i--) {
    const s = L.shots[i] as Shot;
    if (s.life <= 0) removeShot(L, s.id);
  }
}

/**
 * Shots vs Kid (step 8.4). Returns the damage of the first shot that hurts her. With the Slip's
 * i-frames up, a live shot over her is a clean Slip (`slipped.enemy` = its owner).
 */
export function shotsHitKid(
  state: GameState,
  inv: { hurt: boolean; slip: boolean },
  slipped: { enemy: number },
): { dmg: number; enemy: Enemy | null; fromX: number; attack: string } | null {
  const p = state.player;
  if (p.state === 'dead' || p.down) return null;
  const kid = boxAt(p.x, p.y, p.w, 1, KID_HURTBOX);
  const L = state.local;
  for (const s of L.shots) {
    if (s.spent || s.dmg <= 0 || s.life <= 0) continue;
    if (s.kind === 'word' || (s.kind === 'slab' && s.vy === 0 && s.gravity === 0)) continue;
    if (!rectsOverlap(s, kid)) continue;
    if (inv.slip && !inv.hurt) {
      s.spent = true;
      slipped.enemy = s.enemy;
      continue;
    }
    if (inv.hurt) continue;
    s.spent = true;
    if (s.kind === 'dart') s.life = 0;
    const e = L.enemies.find((x) => x.id === s.enemy) ?? null;
    return { dmg: s.dmg, enemy: e, fromX: s.x + s.w / 2 - s.vx, attack: s.attackId };
  }
  return null;
}

/** Enemy types whose shots exist (debug/tests). */
export function projectileKinds(type: string): string[] {
  const d = enemyDef(type);
  return Object.values(d.attacks)
    .map((a) => a.projectile?.kind)
    .filter((k): k is NonNullable<typeof k> => !!k);
}
