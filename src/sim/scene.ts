import type { AbilityId } from './abilities';
import type { BossSpec } from './boss/data';
import type {
  Bark,
  BounceCap,
  FireflyPass,
  FireflySign,
  FlagGate,
  FlagTrigger,
  Hollow,
  Moonseed,
  MothStone,
  Roost,
  SeedCase,
  Swing,
  Thorns,
} from './kit-data';

/**
 * A room's collision data, as the sim sees it: plain axis-aligned rects in sim px. This is types
 * only; the data lives in content/rooms/<id>.json and is validated by src/scene/index.ts (which adds
 * the render-only fields: `Room` in src/scene/room.ts). The scene is static, so it is not part of
 * GameState.
 */

/** Semantic tag for the environment artists (how to skin the rect); the sim ignores it. */
export type SceneTag = 'ground' | 'pool' | 'ledge' | 'trunk' | 'floating' | 'root' | 'branch';

/** A solid box: blocks from every side. */
export interface SolidRect {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: SceneTag;
  /**
   * `false`: its faces give no wall slide and take no wall kick (she falls past them as past open
   * air, and is still stopped by them). `'east'` / `'west'`: only that face is a climb (a trunk
   * whose one flank is a shaft wall and whose other is clean bark). Default: every face is a climb.
   */
  kick?: boolean | 'east' | 'west';
  /** Set on the solids the level kit adds while they stand (src/sim/kit.ts): never safe ground. */
  kit?: 'bark' | 'gate' | 'cap' | 'moss';
}

/** A one-way platform: a line at `y` that only blocks a body falling onto it. Down+Jump drops through. */
export interface OneWay {
  x: number;
  y: number;
  w: number;
  tag: SceneTag;
  /**
   * Down + jump does not drop through it (it still lets her up from below): a mesh over a way she must
   * earn from the other side (the hub's root mesh over R10's climb-out: dropping through skipped the pit).
   * A flag name: refuses until that story flag is set (then it is a shortcut down: `wood-climbout`).
   */
  noDrop?: boolean | string;
}

/** `glint`: a drop of light worth 1. `great`: a rare one cradled in a bud, worth more. */
export type PickupKind = 'glint' | 'great';

/** Something to gather: a point in sim px (the centre of the light). */
export interface Pickup {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
}

/**
 * A lumen pod: a seed-pod of light the slash can burst (src/sim/pods.ts). `x`, `y` is its centre.
 * `sit`: it rests on a surface just below it. `hang`: it hangs from an underside or a branch above.
 */
export type PodMount = 'sit' | 'hang';
export interface Pod {
  id: string;
  x: number;
  y: number;
  mount: PodMount;
  /** Toughness: hit points, 1 (default) to 3. A hit takes its `power` (1, or 2 for the finisher). */
  hp?: number;
  /** A glow pod (Lanternroot): burst, its bud grows back this many frames later (renewable fuel). */
  regrow?: number;
}

/**
 * The kinds of enemy (src/sim/enemies.ts). `burrback`: a small armoured beetle that walks its
 * platform. `lampwing`: a small pale moth-wisp that hovers in the open air and drifts after her light.
 */
export type EnemyKind =
  | 'burrback'
  | 'lampwing'
  | 'oldBurrback'
  | 'hawker'
  | 'web'
  | 'weaver'
  | 'weaverBoss'
  | 'dangler'
  | 'juvenileBurrback'
  | 'carrier'
  | 'gloamweaver'
  | 'mantis';

/**
 * How a creature notices her (memory/creatures.md). `lamp`: by lamp light (she is seen while she is
 * lit by a burning lure: `player.lit`). `wallet`: the test grove's old rule, by the light she carries
 * (memory/giving.md). `always`: whenever she is in view (a mini-boss in its den).
 */
export type SenseMode = 'wallet' | 'lamp' | 'always';

/**
 * Where an enemy starts. Burrback: `x`, `y` = its feet centre, on a surface; `facing` = the way it
 * sets off; `radius` = how far from its start (box centre) it walks, where its ground would let it
 * go further (default: the whole of its ground). Lampwing: `x`, `y` = its home, the centre of its box and of its territory, in open
 * air; `radius` = how far from home it wanders (default `tuning.lampwing.radius`); `facing` = the
 * way it looks at first (its wander path is mirrored with it).
 */
export interface EnemySpawn {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  facing: -1 | 1;
  radius?: number;
  /**
   * Burrback with a `radius`: neither its ram nor a shove takes it out of that range (a guard on a
   * narrow perch: the fight stays where it stands, clear of the perch's ends).
   */
  fenced?: boolean;
  /** Its hit points, if not its kind's (`tuning.<kind>.hp`): the teaching one is weaker. */
  hp?: number;
  /** Lampwing: how far it notices her from (default `tuning.lampwing.noticePx`): one that watches a long lane. */
  sight?: number;
  /**
   * Lampwing / hawker: dives before it gives up (default `maxDives`). With it set, a creature that gave up tired
   * tells again only after `retellFrames` (leg 3b's lampwing, review r7 #9: one pass, one dive).
   */
  dives?: number;
  /**
   * A lamp-guarder (creatures.md §1.2): the id of the lure it guards. When that lure is snuffed it
   * disperses (`enemyDisperse`): a crawler curls up asleep, a flyer leaves the room, a weaver climbs
   * away, a web goes slack.
   */
  guards?: string;
  /** How it notices her, if not the room's (`Scene.senses`); an old burrback defaults to `always`. */
  senses?: SenseMode;
  /** Weaver: the id of the web (a `web` spawn of the same room) it lives on. */
  web?: string;
  /**
   * Web: its strands, each `[x0, y0, x1, y1]` (room px). Strands that share an end point are joined
   * (the weaver runs along them). `x`, `y` = the hub.
   */
  strands?: Array<[number, number, number, number]>;
  /** Dangler: the longest drop on its thread, px below the tie point (default `tuning.dangler.maxDrop`). */
  drop?: number;
  /** Burrback: its brace's tell in frames, if not the row's (a first encounter's is longer). */
  windup?: number;
  /**
   * Hawker: the lure whose circling moths it hunts on a rhythm (area1-plan-r3 §4.3): it waits at a perch
   * beside the flame, tells, and swoops through the orbit to the other side every `period` frames (default
   * `tuning.hawker.passPeriod`), taking a moth each pass; one caught there during a pass is struck down.
   */
  orbit?: string;
  period?: number;
  /**
   * Hawker: every blow of it sends her toward this x (room px), up and over, never away (round 4: the crown
   * hawker throws her onto the rim, never off it).
   */
  rim?: number;
  /** Once this story flag is set it leaves for good (`enemyDisperse`; round 4: the crown hawker at the finale). */
  until?: string;
  /**
   * Carrier: the rest of its trail after (`x`, `y`), feet points, the last one the crack it goes into; or
   * `follow` = another carrier whose trail it walks. `phase` (0..1) = where in its loop it starts.
   */
  trail?: Array<[number, number]>;
  follow?: string;
  phase?: number;
  /** Old burrback: the den's taproot (a root column, a solid in the room): its x span, `[x0, x1]`. */
  taproot?: [number, number];
  /** Old burrback: the story flag set as its phase 2 begins (the plug first cracks: staging's `crack`). */
  crack?: string;
  /** Old burrback: the lamp (id) that goes out as its phase 3 begins (it plants: the den darkens). */
  snuffs?: string;
  /**
   * A story flag set when it dies (the old burrback's root gate: src/sim/kit.ts). Several creatures may carry the
   * same flag (a wave): it is set when the last of them is down.
   */
  sets?: string;
  /** Dead, it comes back at its spawn this many frames later (the Gloamweaver's spiderlings: fuel in the fight). */
  respawn?: number;
  /** Only there while the room's boss fight is on (from the lock to its defeat; the spiderlings). */
  fight?: boolean;
  /**
   * Only there once the save has this ability or flag (Lanternroot's pit: the roots wake when she takes Kindle).
   * It comes in like a respawn (`enemyRespawn`) on the step it wakes.
   */
  wakes?: string;
  /**
   * With `wakes` (an ambush, the Canopy r8): it arrives instead of appearing. `enemies.arriveDelayFrames` after the
   * flag it shows at one of these points (same convention as `x`, `y`: the first at least `enemies.arriveClearPx`
   * from her body centre, else the farthest) and travels to its spawn over `enemies.arriveFrames`, harmless and out
   * of reach (`enemyArrive`, `EnemyState.arrive`).
   */
  arrive?: Array<[number, number]>;
  /**
   * Web: points that hold strands besides solids and the room's edges (the great lamp's heart, which
   * hangs on its own chain: a spoke cut from it falls alone).
   */
  anchors?: Array<[number, number]>;
  /** Web: `false` = its strands never hold her (Lanternroot's orb: the player keeps control). */
  grab?: boolean;
}

/**
 * A moth-lantern (src/sim/goal.ts): dormant until she kindles it with the light she carries.
 * `x`, `y` = its foot, on a surface (like the spawn: a feet-centre point); she kindles it standing
 * there. `cost` = the glints it takes (default `tuning.goal.cost`).
 */
export interface Lantern {
  id: string;
  x: number;
  y: number;
  cost?: number;
  /**
   * The id of a pickup (a great glint) it needs besides its price: until she has gathered that one
   * it will not catch, whatever she carries (it tells her: `lanternRefuse.key`).
   */
  key?: string;
}

/**
 * The kinds of lure (`tuning.lures.kinds`): rows of numbers, not code (docs/design/core.md §3).
 * `wick`: a small glow-cap light, one cut. `lantern`: a bigger hung light, two cuts. `ring` / `great`:
 * a great lamp's ring flames and heart (a boss arena, memory/bosses.md); `greatWide` is the heart's
 * row in its boss's last phase (a room names `great`; the boss switches the row in play).
 */
export type LureKind = 'wick' | 'lantern' | 'ring' | 'great' | 'greatWide' | 'moonwick';

/**
 * A lure: one of the story's false lamps (src/sim/lures.ts, memory/lures.md). Named `lure` in code
 * while the old wayside `lamps` still exist. `x`, `y` = the flame's centre, in open air. It pulls her
 * in like gravity, catches her at its core, and goes out for good under the blade.
 */
export interface Lure {
  id: string;
  kind: LureKind;
  x: number;
  y: number;
  /** Which way its swirl turns her: 1 = clockwise on screen (y down), -1 = anticlockwise. Default 1. */
  spin?: 1 | -1;
  /** It hangs on a chain and swings (src/sim/paths.ts, memory/level-kit.md); `x`, `y` = the bottom of the swing. */
  swing?: Swing;
  /** It burns only once this story flag is set (the firefly's glow-cap after the glimpse: src/sim/kit.ts). */
  after?: string;
  /**
   * Out, it burns again this many frames later, and its snuff is never saved (no moths counted): a toy room's lamp
   * (lab-feel), and since the Canopy r10 a springboard, one of the firefly's hung lights she flings off (the
   * firefly relights them behind her). A `trap` never relights.
   */
  relight?: number;
  /**
   * A trap lamp (the Canopy r10, review r9 #2: the story's verb): a cage of moths, not a springboard. No fling off
   * it (`flingTarget` skips it); the blade puts it out in `lures.trapHp` cuts, for good (saved), and its `moths`
   * are freed (`lureSnuff` with `trap: true`; `save.moths` counts them). Render draws it unlike a springboard.
   */
  trap?: boolean;
  /**
   * The first fling's lesson (the Canopy r10, review r9 #1): until she has flung off it once (`lesson:room:id` in the
   * save's flags), her fall and run ease to a drift near it (`lures.lessonPx`, `lessonFall`, `lessonRun`): the window
   * to press Lamp is wide.
   */
  lesson?: boolean;
  /**
   * Where a fling off it goes with no direction held (x, y; y down), instead of straight out from the flame through
   * her: the first fling's up-right across its gap (the Canopy r10: a first-timer who lets go with the stick at rest
   * drifted under the flame and was flung down into the gap).
   */
  aim?: [number, number];
  /**
   * A moonwick (`kind: 'moonwick'`, Lanternroot): once kindled it burns for good (the save keeps `room:id` in
   * `opened`): a route light.
   */
  keep?: boolean;
  /** A moonwick burning for good from the start (the boss rush: silver light no one has to kindle). */
  lit?: boolean;
  /** A lamp-held gate (Lanternroot): this story flag is set when it goes out (cut, flung or gusted). */
  sets?: string;
  /**
   * Guarded (the Canopy r11, review r10 #1: the great cage over the old burrback): until this story flag is in the
   * save (its keeper's `sets`: the boss down), the blade glances off it (`lureGuarded`, no cut taken).
   */
  guard?: string;
  /**
   * A held beat on its snuff (the Canopy r11: the great cage's release): no input reaches her for this many frames
   * (at most `kit.storyHoldMax`), nothing hurts her (`storyHold` / `storyHoldEnd`, id = the lure's).
   */
  hold?: number;
  /** The moths it holds, if not its kind's (the cache's firefly-lamp: the level's biggest release). */
  moths?: number;
  /** A moonwick that burns this many frames once kindled, if not `moonwick.burn` (the vault's: a shorter clock). */
  burn?: number;
}

/**
 * Moonmoss (Lanternroot, src/sim/light.ts): a pale lichen ledge, solid (or one-way) only while its centre is
 * within `moonwick.light` px of a burning moonwick of the room.
 */
export interface Moonmoss {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay?: boolean;
}

/** A wick set (Lanternroot): when every wick of it burns on the same frame, `sets` is saved and they burn for good. */
export interface WickSet {
  id: string;
  wicks: string[];
  sets: string;
}

/**
 * A bell-cap (Lanternroot §5, the Answer): a slash target (`x`, `y` its centre) that counts the gaps between
 * strikes while no warm lamp burns within `bells.darkPx`; the `rhythm` (`.` short, `-` long gaps) sets `sets`.
 */
export interface Bell {
  id: string;
  x: number;
  y: number;
  rhythm: string;
  sets: string;
  dark?: boolean;
}

/**
 * An open span of a room edge: the edge wall is not there between `from` and `to` (room px along
 * the edge: x for `n` / `s`, y for `e` / `w`). When her box centre crosses the edge inside the span
 * she leaves the room (`roomExit`); until neighbouring rooms exist the room then restarts. The
 * target room is never authored: it will be found from world placement (docs/design/tech.md §2.2).
 */
export interface RoomExit {
  id: string;
  edge: 'n' | 's' | 'e' | 'w';
  from: number;
  to: number;
  /**
   * Where along the span the crossing counts (room px across the edge: y for `s` / `n`, x for `e` /
   * `w`). Default: the edge itself. A `s` exit with `at` above the room's bottom fires while she is
   * still in view (the fade over the drop starts sooner); the edge stays open as before.
   */
  at?: number;
  /**
   * A one-way drop (memory/world.md): she can leave by it but never come back the same way (a hole,
   * a ledge too high). Set on the side she leaves from; the neighbour's mirror exit is then arrival
   * only (crossing it does nothing). The world check treats the link as one-directional.
   */
  oneWay?: boolean;
}

/**
 * A moon patch (docs/design/core.md §5): a small shaft of real moonlight, the rest and save point.
 * `x`, `y` = its foot on the ground (a feet-centre point). Standing in it (grounded, still for
 * `tuning.patch.restFrames`, or a press of up) she rests: full health, the save remembers it, and a
 * fade re-forms her here from anywhere in the world (`patchRest`).
 */
export interface MoonPatch {
  id: string;
  x: number;
  y: number;
  /**
   * A map station (the Canopy r9, review r8 #9: the kin's lamp, HK's bench with Cornifer's quill): resting here shows
   * the map (`mapStation`; render opens it) and hangs the moth-stones she has read and not hung yet (`hangs`).
   */
  map?: boolean;
  /**
   * The stones this station hangs: `stone` = `room:id` of a moth-stone in `taken`; resting here with it read and
   * `flag` not yet set sets `flag` (`stoneHung`): one more each time she comes back. Render draws the hung ones.
   */
  hangs?: Array<{ stone: string; flag: string }>;
  /**
   * A re-form point only (the Canopy r10, review r9 #3: the den's warning's west lip): passing it marks it
   * (`patchMark`), standing on it never rests her (no heal, no `patchRest`). Mid-arena, a light to come back to.
   */
  mark?: boolean;
  /** Where passing marks it, if not its box (a `mark` patch: the den's warning's whole floor). */
  area?: { x: number; y: number; w: number; h: number };
}

/**
 * A moonlit glade (core.md §4): a trigger rect that gives an ability once (`gladeGrant`; the save
 * keeps `room:id` in `taken` so it never gives twice).
 */
export interface Glade {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ability: AbilityId;
  /**
   * Shut until this flag is set (the den under the oak: the claws come in the moonlight the old burrback's death
   * lets in, where it died; before that the glade is the arena's floor and grants nothing).
   */
  when?: string;
}

/**
 * A door to another room that is not an edge (a hollow in a trunk, a cave mouth): `x`, `y` = its foot
 * (feet centre); press up standing in it. `to` = `room#door`: she comes out of that door, at rest.
 */
export interface RoomDoor {
  id: string;
  x: number;
  y: number;
  to: string;
}

/**
 * A shortcut (memory/world.md): a solid rect while closed, that opens from one side only. Her box
 * touching its face on the `opens` side (pushing into its west face for `w`, her head on its
 * underside for `s`, ...) opens it for good (`shortcutOpen`; the save keeps `room:id` in `opened`).
 * From the other side it is a wall.
 */
export interface Shortcut {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opens: 'n' | 's' | 'e' | 'w';
}

export interface Scene {
  id: string;
  /** Scene size in sim px. The edges and the bottom are solid (except `exits`); the top is open. */
  width: number;
  height: number;
  /** Where the player's feet (bottom-centre of the collision box) start. */
  spawn: { x: number; y: number };
  /**
   * The canopy: a soft ceiling for the player (the top of her box cannot rise above this y; she
   * eases to a stop under it: `tuning.ceiling`). Absent = the top is open all the way.
   */
  ceilingY?: number;
  /**
   * `false`: the scene's left and right edges give no wall slide and take no wall kick (they lead
   * nowhere). Default: they are walls like any other.
   */
  edgeKick?: boolean;
  /**
   * `true`: the top edge is solid too, except through an `n` exit's span (an enclosed room: nothing to stand on
   * over its roof, no flight out over a wall's top into the room above; canopy review r3 #2, the tunnel's top).
   * Default: the top is open.
   */
  roof?: boolean;
  solids: SolidRect[];
  oneWays: OneWay[];
  /** Collectibles, in a fixed order: `GameState.pickups.timers` is indexed like this array. */
  pickups?: Pickup[];
  /** Breakables, in a fixed order: the arrays of `GameState.pods` are indexed like this one. */
  pods?: Pod[];
  /** Enemies, in a fixed order: `GameState.enemies` is indexed like this array. */
  enemies?: EnemySpawn[];
  /**
   * How the room's creatures notice her (memory/creatures.md): `lamp` (by lamp light) or `wallet`
   * (the test grove's old rule). Absent = `wallet` (scenes built in code by the old tests); a room JSON
   * defaults to `lamp` (src/scene/index.ts), the test grove says `wallet`.
   */
  senses?: 'wallet' | 'lamp';
  /** Moth-lanterns, in a fixed order: `GameState.goal.lanterns` is indexed like this array. */
  lanterns?: Lantern[];
  /**
   * Wayside lamps, in a fixed order (`GameState.goal.lamps`): lesser lanterns, optional. Same data
   * and rules as a lantern (`cost` defaults to `tuning.goal.lampCost`); not counted for the heart.
   */
  lamps?: Lantern[];
  /**
   * The heart of the grove: a point on the ground (feet centre). It wakes when every lantern is
   * lit; walking into it then ends the run (src/sim/goal.ts).
   */
  heart?: { x: number; y: number };
  /**
   * The abilities she owns when a run starts in this room (src/sim/abilities.ts). Absent = all of
   * them (test scenes and the test grove).
   */
  abilities?: AbilityId[];
  /** Open spans of the room's edges: the ways out. */
  exits?: RoomExit[];
  /**
   * Catch zones: falling into one costs nothing. When her box centre enters it she is held for
   * `tuning.room.catchFrames`, then put back on her last safe ground (`fallCatch`, `fallReturn`).
   */
  catches?: CatchZone[];
  /**
   * The hatching (src/sim/hatch.ts): she starts shut in her cocoon here (`x`, `y` = the cocoon's
   * centre, for render; her body stands at `spawn`). Absent = she starts free.
   */
  /** The hatching (src/sim/hatch.ts): her cocoon; `sets` = a save flag set as she breaks out (the kin's try). */
  hatch?: { x: number; y: number; sets?: string };
  /** Lures (the story's lamps), in a fixed order: `GameState.lures` is indexed like this array. */
  lures?: Lure[];
  /** Moon patches: rest, save and re-form points. */
  patches?: MoonPatch[];
  /** Ability glades. */
  glades?: Glade[];
  /** Doors to other rooms that are not edges. */
  doors?: RoomDoor[];
  /** Shortcuts: solids that open from one side only. */
  shortcuts?: Shortcut[];
  /** The level kit (src/sim/kit.ts, memory/level-kit.md): hazards, pogo targets, breakables, flag gates, triggers. */
  thorns?: Thorns[];
  seedCases?: SeedCase[];
  bark?: Bark[];
  gates?: FlagGate[];
  triggers?: FlagTrigger[];
  /** Bounce caps (src/sim/kit.ts): mushroom caps that throw her up. */
  caps?: BounceCap[];
  /** Finds (src/sim/finds.ts, memory/level-kit.md): the area's moth-stone, firefly signs, moonlit hollows. */
  mothStones?: MothStone[];
  signs?: FireflySign[];
  hollows?: Hollow[];
  /** Moonseeds (the Downwood's keys, src/sim/finds.ts): a door that counts them is a gate on `seeds:<n>`. */
  moonseeds?: Moonseed[];
  /** The firefly's scripted passes (src/sim/firefly.ts): a light that flees and relights lamps behind her. */
  fireflies?: FireflyPass[];
  /** Where freed moths gather in this room, one rect per trap lamp freed anywhere (src/sim/firefly.ts). */
  roosts?: Roost[];
  /**
   * Where a fade re-forms her in this room while no moon patch is saved (instead of her last safe
   * ground, which is beside whatever faded her): the burrow's door before P1 (wood.md R4).
   */
  reform?: { x: number; y: number };
  /**
   * A fade in this room re-forms her at its moon patch nearest to where she lay **at or below her** (whole),
   * whatever patch the save holds (area 1 plan r3 / r4: a fade anywhere in the oak re-forms her in the oak,
   * never in R8, never above where she was); with none at or below, the usual rules (`reform`, her door).
   */
  reformPatch?: boolean;
  /** A boss fight (src/sim/boss/, memory/bosses.md): its arena, lock, flags and the things it is made of. */
  boss?: BossSpec;
  /**
   * The light economy (Lanternroot, src/sim/light.ts, memory/glow.md): hits, kills, snuffs and glints fill her
   * glow; the Lamp button also mends, kindles moonwicks and gusts; a fade drops her glow; glints are saved as taken.
   */
  glow?: boolean;
  /** Lanternroot's light pieces (src/sim/light.ts). */
  moonmoss?: Moonmoss[];
  wickSets?: WickSet[];
  bells?: Bell[];
}

/** A rect (sim px) that catches a fall: see `Scene.catches`. */
export interface CatchZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * The glide-lip assist (area 1 plan r3: "no loop longer than 3"): after this many catches here (room-local),
   * a fall over the zone opens her wings by itself (she owns glide), held open without the button until she
   * lands, presses Down, dashes or meets a wall.
   */
  glideAssist?: number;
  /**
   * Where a catch here puts her back (feet), instead of the last ground she stood on: the glade's lip, set back
   * from its edge, when that last ground was a ledge under the lip she glides off again (video r2: 15 catches).
   */
  back?: { x: number; y: number };
}
