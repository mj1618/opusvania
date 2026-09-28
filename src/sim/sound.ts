import type { SimEvent } from './events';
import type { GameState, LocalState, Sound, Source } from './state';
import type { Tuning } from './tuning';

/**
 * The sound model (combat-spec §3.3, §7): every sound is conserved and lives in exactly one
 * place: home (armed at its owner source), in the bag, or levied (a thrown entity, landed or in
 * flight). The bag is a 3-slot FIFO: Levy throws the newest, a 4th take pushes the oldest home.
 * Weight class is derived from it (player/weight.ts).
 */

export function soundById(L: LocalState, id: number): Sound | undefined {
  for (const s of L.sounds) if (s.id === id) return s;
  return undefined;
}

export function sourceById(L: LocalState, id: number): Source | undefined {
  for (const s of L.sources) if (s.id === id) return s;
  return undefined;
}

/** Centre of a source (event and ribbon positions). */
export function sourceCentre(s: Source): { x: number; y: number } {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

/** True while the source has at least one sound at home (armed, humming). */
export function isArmed(L: LocalState, src: Source): boolean {
  for (const id of src.soundIds) if (soundById(L, id)?.status === 'home') return true;
  return false;
}

/** Newest sound in the bag (what Levy throws), or undefined. */
export function bagNewest(L: LocalState): Sound | undefined {
  const id = L.bag[L.bag.length - 1];
  return id === undefined ? undefined : soundById(L, id);
}

/** Number of brown sounds in the bag (weight class input). */
export function bagBrownCount(L: LocalState): number {
  let n = 0;
  for (const id of L.bag) if (soundById(L, id)?.colour === 'brown') n++;
  return n;
}

/** Removes a sound id from the bag if present. */
export function bagRemove(L: LocalState, id: number): boolean {
  const i = L.bag.indexOf(id);
  if (i < 0) return false;
  L.bag.splice(i, 1);
  return true;
}

/**
 * Puts a taken sound in the bag (newest). If the bag overflows, the oldest goes home (bagPush) and
 * its owner re-arms on the same frame (re-solidifying only when clear, see refreshSource).
 */
export function bagTake(state: GameState, sound: Sound, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  sound.status = 'bag';
  sound.at = 0;
  L.bag.push(sound.id);
  while (L.bag.length > t.bag.slots) {
    const oldId = L.bag.shift() as number;
    const old = soundById(L, oldId);
    if (!old) continue;
    const src = sourceById(L, old.owner);
    const c = src ? sourceCentre(src) : { x: 0, y: 0 };
    events.push({ type: 'bagPush', soundId: old.id, colour: old.colour, owner: old.owner, ...c });
    sendHome(state, old, events);
  }
}

/** A sound goes home to its owner: re-arms it (and its object re-solidifies when clear). */
export function sendHome(state: GameState, sound: Sound, events: SimEvent[]): void {
  const L = state.local;
  bagRemove(L, sound.id);
  if (sound.status === 'levied' || sound.status === 'flight') removeLevied(L, sound.at);
  sound.status = 'home';
  sound.at = 0;
  sound.awayFrames = 0;
  const src = sourceById(L, sound.owner);
  if (src) refreshSource(state, src, events);
}

/** Removes a levied entity and its source component (the sound itself is handled by the caller). */
export function removeLevied(L: LocalState, leviedId: number): void {
  const li = L.levied.findIndex((l) => l.id === leviedId);
  if (li >= 0) L.levied.splice(li, 1);
  const si = L.sources.findIndex((s) => s.kind === 'levied' && s.ent === leviedId);
  if (si >= 0) L.sources.splice(si, 1);
}

/** Does any actor (Kid, an enemy, a levied object) overlap this rect? */
export function actorOverlaps(state: GameState, x: number, y: number, w: number, h: number): boolean {
  const p = state.player;
  if (p.x < x + w && x < p.x + p.w && p.y < y + h && y < p.y + p.h) return true;
  for (const e of state.local.enemies) {
    if (e.state === 'KO' || e.state === 'REPOSSESSED') continue;
    if (e.x < x + w && x < e.x + e.w && e.y < y + h && y < e.y + e.h) return true;
  }
  for (const l of state.local.levied)
    if (l.x < x + w && x < l.x + l.w && l.y < y + h && y < l.y + l.h) return true;
  return false;
}

/**
 * Updates a source's ghost flag from its sounds. Going ghost is immediate (the take un-makes it on
 * the same step). Coming back is immediate too unless it is a solid object an actor overlaps, in
 * which case it stays ghost with `pendingSolid` and retries every step (nothing is ever crushed).
 */
export function refreshSource(state: GameState, src: Source, events: SimEvent[]): void {
  const armed = isArmed(state.local, src) && !((src.soldT ?? 0) > 0);
  const c = sourceCentre(src);
  if (!armed) {
    src.pendingSolid = false;
    if (!src.ghost) {
      src.ghost = true;
      events.push({ type: 'ghost', source: src.id, on: true, ...c });
    }
    return;
  }
  if (!src.ghost) return;
  if (src.kind === 'object' && src.solidWhenArmed && actorOverlaps(state, src.x, src.y, src.w, src.h)) {
    src.pendingSolid = true;
    return;
  }
  src.ghost = false;
  src.pendingSolid = false;
  events.push({ type: 'ghost', source: src.id, on: false, ...c });
}

/** Retries pending re-solidification (step 3 of the per-step order). */
export function retryPending(state: GameState, events: SimEvent[]): void {
  for (const s of state.local.sources) if (s.pendingSolid) refreshSource(state, s, events);
}

/**
 * Conservation invariant (C3): every sound id is in exactly one place. Returns a list of
 * problems (empty when fine). Used by tests and the fuzzer, not by the sim itself.
 */
export function conservationProblems(L: LocalState, slots: number): string[] {
  const out: string[] = [];
  if (L.bag.length > slots) out.push(`bag has ${L.bag.length} > ${slots}`);
  const inBag = new Map<number, number>();
  for (const id of L.bag) inBag.set(id, (inBag.get(id) ?? 0) + 1);
  const inLevied = new Map<number, number>();
  for (const l of L.levied) inLevied.set(l.soundId, (inLevied.get(l.soundId) ?? 0) + 1);
  for (const s of L.sounds) {
    const b = inBag.get(s.id) ?? 0;
    const lv = inLevied.get(s.id) ?? 0;
    if (s.status === 'home' && (b || lv)) out.push(`sound ${s.id} home but in bag/levied`);
    if (s.status === 'bag' && (b !== 1 || lv)) out.push(`sound ${s.id} bag status but bag count ${b}`);
    if ((s.status === 'levied' || s.status === 'flight') && (lv !== 1 || b))
      out.push(`sound ${s.id} levied but levied count ${lv}`);
    if ((s.status === 'consumed' || s.status === 'held') && (b || lv))
      out.push(`sound ${s.id} ${s.status} but in bag/levied`);
    if (!sourceById(L, s.owner)) out.push(`sound ${s.id} has no owner source ${s.owner}`);
  }
  for (const id of inBag.keys()) if (!soundById(L, id)) out.push(`bag holds unknown sound ${id}`);
  for (const id of inLevied.keys()) if (!soundById(L, id)) out.push(`levied holds unknown sound ${id}`);
  return out;
}
