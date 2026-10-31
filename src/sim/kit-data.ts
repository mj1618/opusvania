/**
 * The level kit's scene data (memory/level-kit.md): generic pieces any room can use. Types only; the
 * JSON is validated by src/scene/kit.ts and played by src/sim/kit.ts (thorns, seed-cases, rotten bark,
 * flag gates, triggers) and src/sim/paths.ts (a swinging lantern's path). Every piece has an `id`,
 * unique in its room (ids are forever: `room:id` in the save).
 */

/** A rect of thorns (a hazard, not a solid): touching it costs `kit.thorns.damage` and puts her back on her last safe ground. A down cut on it is a pogo. */
export interface Thorns {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A hard seed-case: a static, never-breaking slash target at its centre (`x`, `y`), not a solid. A down cut bounces her (the pogo); a forward or up cut clangs. */
export interface SeedCase {
  id: string;
  x: number;
  y: number;
}

/**
 * Rotten bark: a solid that breaks for good after `hp` cuts (default `kit.bark.hp`); the save keeps
 * `room:id` in `opened`. `floor`: a floor panel, broken only by down cuts (pogos). `kick` as on a solid.
 */
export interface Bark {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor?: boolean;
  hp?: number;
  kick?: boolean | 'east' | 'west';
  /**
   * Heartwood (Lanternroot puzzle 4): not rotten, so the blade clangs off it (`kitClang` kind `heartwood`);
   * only a burrback's ram into its face breaks it (`barkBreak {by: 'ram'}`).
   */
  heartwood?: boolean;
}

/**
 * A gate: a solid while the save has not got `flag` in `flags` (the silk curtain that falls with the boss). With
 * `shut`, an arena's door: open until the save has `shut` (a trigger's flag: she is in), then a solid until `flag`
 * (the wave is down). A fade while it is shut takes `shut` back out of the save (the arena re-arms, HK's lock-in:
 * the door is open behind her when she re-forms, and the trigger shuts it again).
 */
export interface FlagGate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flag: string;
  shut?: string;
  kick?: boolean | 'east' | 'west';
}

/** A trigger: her box centre inside sets `sets` in the save's flags, once (a story beat, a lever, a lab plate). */
export interface FlagTrigger {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sets: string;
  /**
   * A held story beat (journey.md: input held <= 3 s): the step it sets its flag (once a save), no input
   * reaches her for `hold` frames (at most `kit.storyHoldMax`): she slows to a stand while the staging plays.
   * `storyHold` / `storyHoldEnd`; she cannot be hurt meanwhile.
   */
  hold?: number;
  /** The one beat that may hold longer (`kit.finaleHoldMax`): the finale's cloud, ~9 s (area 1 plan r3). */
  finale?: boolean;
  /** A flag set when the hold ends (the finale's east gate opens on the cloud's lift). */
  endSets?: string;
  /**
   * An ambush (the Canopy r8, review r7 #2): until every creature it wakes (`wakes: sets`) is down, a fade or a
   * new entry into the room takes `sets` back out of the save, so the ambush plays again from its arrival.
   */
  rearm?: boolean;
}

/**
 * A pendulum path (src/sim/paths.ts): the thing hangs `length` px under a pivot over its rest point
 * and swings `reach` px to each side, one full swing (there and back) every `period` frames, starting
 * `phase` (0..1) of the way into it. Missing numbers come from `tuning.lures.swing`.
 */
export interface Swing {
  length: number;
  reach?: number;
  period?: number;
  phase?: number;
}

/**
 * A bounce cap: a mushroom cap, a solid whose top throws her up when she lands on it (or pogos off
 * it). `tier` names a row of `kit.caps.tiers` (the height she is thrown, px); `height` overrides it.
 */
export interface BounceCap {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tier?: 'small' | 'mid' | 'big';
  height?: number;
  kick?: boolean | 'east' | 'west';
}

/**
 * The area's moth-stone (core.md §6): `x`, `y` = its foot on the ground. Touching it draws `area` (an
 * id of `world.json` `areas`) on the map, unvisited rooms faint, with its count of unseen lamps.
 */
export interface MothStone {
  id: string;
  x: number;
  y: number;
  area: string;
}

/**
 * A firefly sign (lore): `x`, `y` = its foot. Standing still beside it reads it once: the save keeps
 * `room:id` in `taken` and sets `flag` if given; `rhythm` is its flash pattern for render (`.` short,
 * `-` long).
 */
export interface FireflySign {
  id: string;
  x: number;
  y: number;
  flag?: string;
  rhythm?: string;
}

/**
 * A moonlit hollow: a hidden rect of moonlight; her body centre inside grants `upgrade` once (an id of
 * `UPGRADES`, src/sim/upgrades.ts: the save gets the flag `upgrade:<id>`).
 */
export interface Hollow {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  upgrade: string;
}

/**
 * A moonseed (the Downwood, memory/downwood.md): a key. `x`, `y` = its centre in the air. Her box touching it takes
 * it once ever (`taken` keeps `room:id`); the save then has the flags `seeds:1` .. `seeds:<n>` for the n she holds,
 * so a door that wants three is a gate on `seeds:3`.
 */
export interface Moonseed {
  id: string;
  x: number;
  y: number;
}

/**
 * The firefly's pass (the Canopy r10, review r9 #2: "a light that flees and relights lamps behind her", Kuro's first
 * pass in Ori): her box centre in `trigger`, grounded (she lands there), the first time (`flag` not in the save)
 * starts it; the firefly
 * then flies `path` (points in the air, world px) at a steady speed over `frames`, and every lamp of `relights` that
 * it passes within `kit.firefly.relightPx` of while that lamp is out burns again (`lureRelight` with `by:
 * 'firefly'`, then `fireflyRelight`). No control is taken from her. Room-local state: `state.kit.firefly`.
 */
export interface FireflyPass {
  id: string;
  /** Her box centre in it, grounded, starts the pass (a landing). Optional since r11 (`onFling`, `onFlag`). */
  trigger?: { x: number; y: number; w: number; h: number };
  flag: string;
  path: Array<[number, number]>;
  /** Frames the flight takes (a `hang` adds its own). */
  frames: number;
  relights?: string[];
  /**
   * (The Canopy r11, review r10 #4.) Started by her first fling off one of these lamps (that lamp smoulders: the
   * firefly relights it, embers or out, in front of her).
   */
  onFling?: string[];
  /** Started the step this story flag is in the save (the warning cleared: the second sighting). */
  onFlag?: string;
  /**
   * A stop: reaching path point `point` it holds there `frames` frames (hanging a cage), and saves `sets` as it
   * arrives (a lamp with `after: sets` lights then: the cage it hung). `fireflyHang` at the start of the stop.
   */
  hang?: { point: number; frames: number; sets?: string };
  /** A held beat on its start (input held this many frames, at most `kit.storyHoldMax`; nothing hurts her). */
  hold?: number;
  /**
   * A camera hook for render (sim never reads it): from frame `from` to `to` of the pass, frame (x, y) with her, at
   * `zoom` if given (render eases in and out).
   */
  look?: { x: number; y: number; zoom?: number; from: number; to: number };
  /**
   * The Canopy r13, moment 4: a chase instead of a timed pass (`frames` is then only the flight's pace at its
   * slowest). Once started it stays `lead` [min, max] px of path ahead of her nearest point on `path` (never back,
   * never escaping: the swarm-spline trick): at most `max` ahead it flies on, under `min` it hurries. Each hook of
   * `kindles` (dark `after` lamps, lit by `kit.firefly` passing within `relightPx`) catches fire as it passes
   * (`fireflyKindle`; a springboard from then on: the chase's flag lights them). `waits`: path points where it
   * hovers (flashing, `fireflyChase wait`) until she is back within `lead[1]` of it. `end`: the nest's shaft top: the
   * path's last point is the roost's mouth (`nest`), then a call (`kit.firefly.callFrames`) and up the shaft
   * (`fireflyHide`). `needs`: an ability she must own for it to start (the glide: before it the hooks stay dark).
   */
  chase?: {
    lead: [number, number];
    kindles: string[];
    waits: number[];
    end: [number, number];
    needs?: string;
  };
}

/**
 * The Canopy r13, moment 3: a place to sit with the kin (`marks.tatter.sit` is render's copy). Once `when` is saved
 * (absent: always), her feet within `r` px of (`x`, `y`), standing still (grounded, no input) `frames` frames: `kinSit`,
 * and `sets` saved (once).
 */
export interface Sit {
  id: string;
  x: number;
  y: number;
  r: number;
  frames: number;
  when?: string;
  sets: string;
}

/**
 * Where freed moths gather (the Canopy r10, review r9 #2 / #9: the hub changes as she frees lamps): a rect in this
 * room that holds the moths of trap lamp `lure` (`room:id`) once the save has it in `snuffed`. Render draws a cloud
 * settled there; `roostsLit` (src/sim/firefly.ts) says which.
 */
export interface Roost {
  id: string;
  lure: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * The Canopy r12 (the ending, moment 7): once this flag is saved its moths have gone on the migration (the den's
   * great release): the roost is empty (`roostsLeft`), no longer lit.
   */
  leaves?: string;
}

/** A rect (sim px). */
export interface EscapeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The Canopy r14, moment 7: the full escape (src/sim/escape.ts; memory/canopy.md v14). Once `after` is saved and her
 * centre is in `area`, the escape runs until she reaches `end` (`sets` saved: over for good). Its hazards never cost
 * a light: a rock or the front puts her back at the last checkpoint she stood on (`escapeHit`, then `fallReturn` with
 * id `escape:<what>`), and everything past that checkpoint plays again.
 */
export interface Escape {
  id: string;
  after: string;
  sets: string;
  area: EscapeBox;
  /**
   * Where it ends (`sets` saved, `escapeEnd`). The Canopy r15: absent in a room it runs on out of (the den: `next`
   * names the room it goes on in, where a second block with the same `sets` takes it to its end).
   */
  end?: EscapeBox;
  next?: string;
  /** The Canopy r15: rotten bark (ids) that comes down for good as it begins (`barkBreak` by `escape`). */
  breaks?: string[];
  /** The way out as a line (render: the freed cloud streams along it ahead of her). */
  path: Array<[number, number]>;
  /** Where a hit puts her (feet `x`, `y`): marked when she stands (grounded) with her centre in `at`. The first is the start's. */
  checkpoints: Array<{ id: string; x: number; y: number; at: EscapeBox }>;
  /**
   * Rocks keyed to her progress: when her centre enters `when`, grit trickles at (`x`, `y0`) for `tell` frames
   * (`rockfall` phase `tell`), then a rock `w` px across falls from `y0` to `y1` (`fall`: it hurts while it falls),
   * and lands (`land`: harmless rubble, drawn by render). `cp`: the checkpoint it plays after (a return to that
   * checkpoint or an earlier one re-arms it).
   */
  rocks: Array<{
    id: string;
    x: number;
    w: number;
    y0: number;
    y1: number;
    when: EscapeBox;
    tell: number;
    cp: number;
  }>;
  /**
   * The collapse front (`collapseFront`, `state.kit.escape.front` = its top y): falling earth filling the place
   * from below across `x0`..`x1`. Off until her feet are `lag` px over `y0`; then it rises to stay `lag` under her
   * feet (at most `speed` px/f), creeping `creep` px/f closer while she stalls, never nearer than `near`, and never over
   * `top`. Her feet under its top hurt her.
   */
  front?: {
    x0: number;
    x1: number;
    y0: number;
    top: number;
    lag: number;
    near: number;
    speed: number;
    creep: number;
    /** The Canopy r15: it waits until her centre has been in this box (the chimney's foot), then rises. */
    start?: EscapeBox;
  };
}
