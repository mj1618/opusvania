/**
 * A boss fight's room data (memory/bosses.md): types only. The JSON block is validated by
 * src/scene/boss.ts and played by src/sim/boss/index.ts (the framework every boss shares: arena lock,
 * phase table, cue timeline, retry, defeat) and one module per kind (src/sim/boss/weaver.ts).
 *
 * A boss is made of things the room already has: lures (its great lamp's heart and ring flames), a
 * creature (`scene.enemies`, the boss itself) and, for the Weaver, a web (the spokes). The block names
 * them by id, so the level builder places them like any lure or creature and copies this block.
 * Every position is in room px.
 */

export interface BossRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BossDoor extends BossRect {
  id: string;
}

export interface BossSpec {
  /** Unique in the room (a route node: `routes` may name it; the world check reaches its flag through it). */
  id: string;
  kind: 'weaver';
  /** The name card. */
  name: string;
  /** The fight's rect: the lock closes once her whole box is inside it. */
  arena: BossRect;
  /** Doors that seal while the fight is on (solids while locked; they open on a death and on defeat). */
  lock: BossDoor[];
  /** Set in the save when it is beaten (the silk curtain's gate opens on it). */
  flag: string;
  /** Set in the save at the first lock: every later attempt is a retry (the short first phase). */
  met: string;
  /** The boss creature (`scene.enemies` id; the Weaver: kind `weaverBoss`). */
  creature: string;
  /** The great lamp's heart (`scene.lures` id, kind `great`). */
  heart: string;
  /** The ring flames (`scene.lures` ids, kind `ring`), in order round the ring. */
  rings: string[];
  /** Rings that start as husks on a retry (wood.md §6: only rings 2-4 burn again). */
  retryOut: string[];
  /** The Weaver: the web whose strands are the P1 spokes (heart to each ring). */
  web?: string;
  /** The Weaver: P2's pivot xs, in order (it drops from the canopy over each in turn). */
  drops?: number[];
  /** The canopy's y (where P2's threads hang from) and the floor's (P3's ground). */
  canopy?: number;
  floor?: number;
  /** Where the heart hangs once the boss has fled (it lowers there, unguarded). */
  lowered?: { x: number; y: number };
  /** A lure the firefly relights after the fight (a husk until the boss is beaten). */
  relight?: string;
}

/** Is lure `id` part of this room's boss (its heart, a ring flame)? Those are saved when it is beaten, not when snuffed. */
export function bossOwnsLure(boss: BossSpec | undefined, id: string): boolean {
  if (!boss) return false;
  return boss.heart === id || boss.rings.includes(id);
}
