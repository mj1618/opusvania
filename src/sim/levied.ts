import type { Colour, MoveDir, SimEvent } from './events';
import { type Body, type Collider, Move, moveX, moveY, oneWayUnder, solidAt } from './physics/aabb';
import type { MoveParams } from './player/params';
import { bounce } from './player/player';
import { bagNewest, bagRemove } from './sound';
import type { GameState, Levied, PlayerState } from './state';
import { speedForHeight, type Tuning } from './tuning';
import { addDynSolid, dynSolidAt, solidAny } from './world/dynamic';
import type { Room } from './world/rooms';

/**
 * Levied entities (L3 brief §1.1, combat-spec §1.5): a thrown sound becomes an Actor on the
 * movement physics. Brown = a 64x48 slab that becomes a Solid once landed and clear of actors;
 * pink = a 64x16 spring pad that anchors on its first top-surface contact (or instantly under
 * Kid's feet for a downward levy in the air). Each levied object is also a sound source, so it can
 * be re-seized. `owner`, `dmg` and `hitList` are set now for combat (Return to sender).
 */

/** Collider for levied actors: tiles, one-ways (landing) and dynamic solids except itself. */
class LeviedCollider implements Collider {
  room: Room | null = null;
  ts = 64;
  skip = -1;

  blockedX(b: Body, dir: number): boolean {
    const r = this.room as Room;
    return solidAt(r, this.ts, b.x + dir, b.y, b.w, b.h) || dynSolidAt(b.x + dir, b.y, b.w, b.h, this.skip);
  }

  blockedY(b: Body, dir: number): boolean {
    const r = this.room as Room;
    if (solidAt(r, this.ts, b.x, b.y + dir, b.w, b.h) || dynSolidAt(b.x, b.y + dir, b.w, b.h, this.skip))
      return true;
    return dir > 0 && oneWayUnder(r, this.ts, b.x, b.y, b.w, b.h);
  }

  hazard(): boolean {
    return false;
  }
}

const col = new LeviedCollider();

export interface ColourDims {
  w: number;
  h: number;
  vx: number;
  vy: number;
  upVy: number;
  dropVy: number;
  gravityMult: number;
  dmg: number;
  recoilPx: number;
}

export function colourDims(c: Colour, t: Tuning): ColourDims {
  const L = t.levy;
  if (c === 'brown')
    return {
      w: L.brownW,
      h: L.brownH,
      vx: L.brownVx,
      vy: L.brownVy,
      upVy: L.brownUpVy,
      dropVy: L.brownDropVy,
      gravityMult: L.brownGravityMult,
      dmg: L.brownDmg,
      recoilPx: L.brownRecoilPx,
    };
  if (c === 'pink')
    return {
      w: L.pinkW,
      h: L.pinkH,
      vx: L.pinkVx,
      vy: L.pinkVy,
      upVy: L.pinkUpVy,
      dropVy: L.pinkDropVy,
      gravityMult: L.pinkGravityMult,
      dmg: L.pinkDmg,
      recoilPx: L.pinkRecoilPx,
    };
  return {
    w: L.violetW,
    h: L.violetH,
    vx: L.violetVx,
    vy: L.violetVy,
    upVy: L.violetUpVy,
    dropVy: L.violetDropVy,
    gravityMult: L.violetGravityMult,
    dmg: L.violetDmg,
    recoilPx: L.violetRecoilPx,
  };
}

/**
 * Launches the player upward so the rise is exactly `px` under the current profile, when applied
 * before the controller's gravity runs (outside updatePlayer): vy = -(v + g), so after this frame's
 * gravity it is -v, the same integrator as a jump/pogo (speedForHeight). Fixed height (no cut).
 */
export function launchPlayer(p: PlayerState, px: number, P: MoveParams, refill: boolean): void {
  const v = speedForHeight(P.gravity, px);
  bounce(p, v + P.gravity, P, { refill, cutDisabled: true });
  p.grounded = false;
  p.coyote = 0;
  p.jumpBuf = 0;
  p.djBuf = 0;
}

function syncSource(state: GameState, l: Levied): void {
  for (const s of state.local.sources) {
    if (s.kind === 'levied' && s.ent === l.id) {
      s.x = l.x;
      s.y = l.y;
      s.w = l.w;
      s.h = l.h;
      return;
    }
  }
}

/** Tries to place a w×h box in free space near (x0, y0), then slides it toward (x1, y1). */
function place(
  room: Room,
  ts: number,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Body | null {
  let start: Body | null = null;
  for (let d = 0; d <= 32 && !start; d++) {
    for (const s of d === 0 ? [0] : [d, -d]) {
      if (!solidAny(room, ts, x0 + s, y0, w, h)) {
        start = { x: x0 + s, y: y0, rx: 0, ry: 0, w, h };
        break;
      }
    }
  }
  if (!start) return null;
  col.room = room;
  col.ts = ts;
  col.skip = -1;
  moveX(start, x1 - start.x, col);
  start.rx = 0;
  moveY(start, y1 - start.y, col);
  start.ry = 0;
  return start;
}

/**
 * Levy's spawn frame: throws the newest bag sound. Returns false (a dry levy) when the bag is
 * empty or there is no room to spawn it. A downward levy recoil-hops Kid (the Middle-voice graft).
 */
export function spawnLevy(
  state: GameState,
  room: Room,
  t: Tuning,
  P: MoveParams,
  dir: MoveDir,
  facing: 1 | -1,
  spawns: { fwd: readonly [number, number]; up: readonly [number, number]; down: readonly [number, number] },
  events: SimEvent[],
): boolean {
  const L = state.local;
  const sound = bagNewest(L);
  const p = state.player;
  if (!sound) return false;
  const d = colourDims(sound.colour, t);
  const ts = P.tileSize;
  const [ox, oy] = spawns[dir];
  const feet = p.y + p.h;
  const cx0 = Math.round(p.x + p.w / 2 - d.w / 2);
  let body: Body | null;
  if (dir === 'down') {
    // Start overlapping Kid's lowest part (free space), then drop it to just under her feet.
    body = place(room, ts, d.w, d.h, cx0, feet - d.h, Math.round(p.x + ox - d.w / 2), p.y + oy);
  } else if (dir === 'up') {
    // Centred above her head (bottom edge at oy).
    body = place(
      room,
      ts,
      d.w,
      d.h,
      cx0,
      p.y + p.h / 2 - d.h / 2,
      Math.round(p.x + ox - d.w / 2),
      p.y + oy - d.h,
    );
  } else {
    // Forward: (ox, oy) is the box's top-left when facing right (mirrored: x' = w - ox - boxW).
    const x1 = facing > 0 ? p.x + ox : p.x + p.w - ox - d.w;
    body = place(room, ts, d.w, d.h, cx0, Math.round(p.y + oy), Math.round(x1), Math.round(p.y + oy));
  }
  if (!body) return false;
  const id = L.nextId++;
  const anchored = dir === 'down' && sound.colour === 'pink';
  let vx = 0;
  let vy = 0;
  if (dir === 'fwd') {
    vx = facing * d.vx + t.levy.inheritVx * p.vx;
    vy = d.vy;
  } else if (dir === 'up') vy = d.upVy;
  else vy = d.dropVy;
  const l: Levied = {
    id,
    soundId: sound.id,
    colour: sound.colour,
    owner: sound.owner,
    x: body.x,
    y: body.y,
    rx: 0,
    ry: 0,
    w: d.w,
    h: d.h,
    vx: anchored ? 0 : vx,
    vy: anchored ? 0 : vy,
    gravityMult: d.gravityMult,
    phase: anchored ? 'landed' : 'flight',
    solid: false,
    dmg: d.dmg,
    hitList: [],
    squash: 0,
    born: state.frame,
  };
  L.levied.push(l);
  bagRemove(L, sound.id);
  sound.status = anchored ? 'levied' : 'flight';
  sound.at = id;
  L.sources.push({
    id: L.nextId++,
    kind: 'levied',
    ent: id,
    char: '',
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    soundIds: [sound.id],
    solidWhenArmed: false,
    ghost: false,
    pendingSolid: false,
  });
  const c = { x: l.x + l.w / 2, y: l.y + l.h / 2 };
  events.push({ type: 'levyThrow', soundId: sound.id, colour: sound.colour, dir, levied: id, ...c });
  if (anchored) events.push({ type: 'levyLand', soundId: sound.id, colour: sound.colour, levied: id, ...c });
  if (dir === 'down') {
    launchPlayer(p, d.recoilPx, P, false);
    events.push({ type: 'recoilHop', colour: sound.colour, x: p.x + p.w / 2, y: p.y + p.h });
  }
  return true;
}

function overlapsAnyActor(state: GameState, l: Levied): boolean {
  const p = state.player;
  if (p.x < l.x + l.w && l.x < p.x + p.w && p.y < l.y + l.h && l.y < p.y + p.h) return true;
  for (const e of state.local.enemies) {
    if (e.state === 'KO' || e.state === 'REPOSSESSED') continue;
    if (e.x < l.x + l.w && l.x < e.x + e.w && e.y < l.y + l.h && l.y < e.y + e.h) return true;
  }
  for (const o of state.local.levied) {
    if (o.id === l.id) continue;
    if (o.x < l.x + l.w && l.x < o.x + o.w && o.y < l.y + l.h && l.y < o.y + o.h) return true;
  }
  return false;
}

function materialise(l: Levied): void {
  l.solid = true;
  addDynSolid(l.x, l.y, l.w, l.h, l.id);
}

/** Step 6: levied entities in id order (flight -> landing -> landed; slabs materialise when clear). */
export function updateLevied(state: GameState, room: Room, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  const ts = t.world.tileSize;
  col.room = room;
  col.ts = ts;
  const g = t.jump.gravity;
  const cap = t.jump.fastFallMax;
  for (const l of L.levied) {
    col.skip = l.id;
    if (l.squash > 0) l.squash--;
    if (l.born === state.frame) {
      // Spawned this step: stays at its spawn position (hit-tested there in step 8.3).
      syncSource(state, l);
      continue;
    }
    if (l.phase === 'landed') {
      if (l.colour === 'brown') {
        // An unsupported slab falls again (its support was un-made).
        const supported =
          solidAt(room, ts, l.x, l.y + 1, l.w, l.h) ||
          dynSolidAt(l.x, l.y + 1, l.w, l.h, l.id) ||
          oneWayUnder(room, ts, l.x, l.y, l.w, l.h);
        if (!supported) {
          l.phase = 'flight';
          l.solid = false;
          const s = L.sounds.find((x) => x.id === l.soundId);
          if (s) s.status = 'flight';
        } else if (!l.solid && !overlapsAnyActor(state, l)) materialise(l);
      }
      if (l.phase === 'landed') {
        syncSource(state, l);
        continue;
      }
    }
    l.vy = Math.min(cap, l.vy + g * l.gravityMult);
    const mx = moveX(l, l.vx, col);
    if (mx === Move.blocked) l.vx = 0;
    const falling = l.vy > 0;
    const my = moveY(l, l.vy, col);
    if (my === Move.blocked) {
      if (falling) {
        l.phase = 'landed';
        l.vx = 0;
        l.vy = 0;
        l.rx = 0;
        l.ry = 0;
        const s = L.sounds.find((x) => x.id === l.soundId);
        if (s) s.status = 'levied';
        if (l.colour === 'brown' && !overlapsAnyActor(state, l)) materialise(l);
        events.push({
          type: 'levyLand',
          soundId: l.soundId,
          colour: l.colour,
          levied: l.id,
          x: l.x + l.w / 2,
          y: l.y + l.h / 2,
        });
      } else l.vy = 0;
    }
    syncSource(state, l);
  }
}

/**
 * Spring contacts (step 8.4): a landed pink spring bounces Kid to levy.pinkSpringPx (fixed
 * height, like the pogo) when her feet reach its top while not rising.
 */
export function springContacts(
  state: GameState,
  room: Room,
  t: Tuning,
  P: MoveParams,
  prevFeet: number,
  events: SimEvent[],
): void {
  const p = state.player;
  if (p.state === 'dead' || p.state === 'dash') return;
  const feet = p.y + p.h;
  for (const l of state.local.levied) {
    if (l.colour !== 'pink' || l.phase !== 'landed') continue;
    if (!(p.x < l.x + l.w && l.x < p.x + p.w)) continue;
    if (p.vy < 0 || feet < l.y || prevFeet > l.y + l.h) continue;
    // Stand Kid on the pad's top if there is room, then launch.
    const ny = l.y - p.h;
    if (ny !== p.y && !solidAny(room, P.tileSize, p.x, ny, p.w, p.h)) {
      p.y = ny;
      p.ry = 0;
    }
    launchPlayer(p, t.levy.pinkSpringPx, P, true);
    l.squash = t.levy.pinkSquashFrames;
    events.push({ type: 'springBounce', levied: l.id, target: 0, x: p.x + p.w / 2, y: p.y + p.h });
    return;
  }
}
