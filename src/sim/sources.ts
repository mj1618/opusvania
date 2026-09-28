import { enemySeize, enemySeizePriority, spawnEnemy } from './ai/enemy';
import { centreDist2, type Rect, rectsOverlap } from './combat/boxes';
import { requestHitstop } from './combat/hitstop';
import type { SimEvent } from './events';
import { bagTake, isArmed, refreshSource, removeLevied, soundById, sourceCentre } from './sound';
import type { GameState, LocalState, Sound, Source, SourceKind } from './state';
import type { Tuning } from './tuning';
import type { Room } from './world/rooms';

/**
 * The sound-source component (combat-spec §7, L3 brief §1.1): ONE component for humming walls,
 * furnaces, static, enemies and levied objects. Seize never branches on "is this a wall": it asks
 * each source's kind handler for a priority (L3 brief §2.5) and hands the take to that handler.
 *
 *   priority: 1 Catch (enemy telegraphing), 2 open enemy, 3 downed enemy (repossess),
 *             4 levied object, 5 object source, 6 guarded enemy, 7 white static (refused)
 */
interface KindHandler {
  priority(state: GameState, src: Source): number;
  /** Hurt/seize rect of the source right now. */
  rect(state: GameState, src: Source): Rect;
  seize(state: GameState, src: Source, facing: number, t: Tuning, events: SimEvent[]): SeizeOutcome;
}

export type SeizeOutcome = 'take' | 'guard' | 'refused';

/** A take: the sound goes into the bag with the seizeTake feedback (hitstop, event, ribbon). */
function takeSound(
  state: GameState,
  s: Sound,
  at: { x: number; y: number },
  t: Tuning,
  events: SimEvent[],
): void {
  requestHitstop('seizeTake', t);
  events.push({ type: 'seizeTake', soundId: s.id, colour: s.colour, kind: s.kind, owner: s.owner, ...at });
  bagTake(state, s, t, events);
  const src = state.local.sources.find((x) => x.id === s.owner);
  if (src) refreshSource(state, src, events);
}

function firstHome(L: LocalState, src: Source, seizable: boolean): Sound | undefined {
  for (const id of src.soundIds) {
    const s = soundById(L, id);
    if (s && s.status === 'home' && (s.colour !== 'white') === seizable) return s;
  }
  return undefined;
}

const srcRect = (_: GameState, s: Source): Rect => s;

const HANDLERS: Record<SourceKind, KindHandler> = {
  object: {
    priority(state, src) {
      if (!isArmed(state.local, src)) return 0;
      return firstHome(state.local, src, true) ? 5 : 7;
    },
    rect: srcRect,
    seize(state, src, _facing, t, events) {
      const s = firstHome(state.local, src, true);
      const c = sourceCentre(src);
      if (!s) {
        events.push({ type: 'seizeRefused', target: src.id, ...c });
        return 'refused';
      }
      takeSound(state, s, c, t, events);
      return 'take';
    },
  },
  levied: {
    priority: () => 4,
    rect: srcRect,
    seize(state, src, _facing, t, events) {
      const L = state.local;
      const s = soundById(L, src.soundIds[0] ?? -1);
      if (!s) return 'refused';
      const c = sourceCentre(src);
      removeLevied(L, src.ent);
      takeSound(state, s, c, t, events);
      return 'take';
    },
  },
  enemy: {
    priority: (state, src) => enemySeizePriority(state, src),
    rect(state, src) {
      const e = state.local.enemies.find((x) => x.id === src.ent);
      return e ?? src;
    },
    seize(state, src, facing, t, events) {
      const e = state.local.enemies.find((x) => x.id === src.ent);
      const at = e ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : sourceCentre(src);
      return enemySeize(state, src, facing, t, events, (s) => takeSound(state, s, at, t, events)).outcome;
    },
  },
};

/**
 * Resolves a Seize hitbox against every source (step 8.1). Picks the best target by priority,
 * then nearest centre, then lowest id. Returns null when nothing is in the box (still whiffing).
 */
export function resolveSeize(
  state: GameState,
  box: Rect,
  facing: number,
  t: Tuning,
  events: SimEvent[],
): SeizeOutcome | null {
  let best: Source | null = null;
  let bestPri = 99;
  let bestD = 0;
  for (const src of state.local.sources) {
    const h = HANDLERS[src.kind];
    if (!rectsOverlap(box, h.rect(state, src))) continue;
    const pri = h.priority(state, src);
    if (pri === 0) continue;
    const d = centreDist2(box, h.rect(state, src));
    if (pri < bestPri || (pri === bestPri && d < bestD)) {
      best = src;
      bestPri = pri;
      bestD = d;
    }
  }
  if (!best) return null;
  return HANDLERS[best.kind].seize(state, best, facing, t, events);
}

/** Rebuilds the room-local state from room data (every loadRoom: room regeneration). */
export function buildLocal(room: Room, t: Tuning): LocalState {
  const L: LocalState = {
    nextId: 1,
    sources: [],
    sounds: [],
    bag: [],
    levied: [],
    enemies: [],
    plates: [],
    gates: [],
    clear: false,
  };
  for (const rs of room.sources) {
    const id = L.nextId++;
    const sid = L.nextId++;
    L.sources.push({
      id,
      kind: 'object',
      ent: 0,
      char: rs.char,
      x: rs.x,
      y: rs.y,
      w: rs.w,
      h: rs.h,
      soundIds: [sid],
      solidWhenArmed: true,
      ghost: false,
      pendingSolid: false,
    });
    L.sounds.push({
      id: sid,
      name: rs.sound,
      colour: rs.colour,
      kind: 'deed',
      owner: id,
      status: 'home',
      at: 0,
      awayFrames: 0,
    });
  }
  const ts = t.world.tileSize;
  for (const es of room.enemySpawns) spawnEnemy(L, es.type, es.tx * ts + ts / 2, (es.ty + 1) * ts);
  for (const p of room.plates) L.plates.push({ char: p.char, tiles: [...p.tiles], pressed: false, by: '' });
  for (const g of room.gates)
    L.gates.push({ char: g.char, tiles: [...g.tiles], open: false, opensOn: g.opensOn });
  return L;
}
