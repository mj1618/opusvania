# Lampfall: technical foundation

Draft 1, 2026-10-17; §2.2, §3, §4, §5, §6 and §7 rescoped 2026-10-18 for an Ori-length game: 14 areas in five
regions, **~155 main rooms plus ~20 optional and ~285 lamps** (draft 1: 68 rooms, ~73 lamps), four kinds of find and
fast travel in Tier 2 (`world.md` §1–4, README). How the code grows from one test scene (the Grove) to that many rooms without rework.
This doc assumes `docs/design/core.md` (abilities are flags, lamps stay out for good, moon patches are the save
points, an auto-map with lamp markers, region sky driven by the share of its lamps snuffed). Calls big enough for
Matt are at the end, each with a recommendation. The doc assumes the recommendation until he answers.

**The short version:** HK-style rooms rather than one streamed Ori map. Rooms are big and placed in world
coordinates, and a short dip carries her momentum across each exit. Every room is one JSON file in today's
format plus exits and art parameters. Persistent progress is a small `save` object inside the deterministic
state. Each region's look is a "kit" of today's painters fed by per-room data. Staging puts only four things
ahead of the first real room.

## 1. What exists, and what is hard-coded to the Grove

The good news is that the sim was written against a `Scene` value from the start. `step(state, input, tuning,
scene)` is pure and gets the scene as an argument. Zod validation (`parseScene`) is generic, and the camera clamps
to whatever scene it is given. The single-scene assumptions are in the layers around the sim:

| Where | What assumes one scene | Cost to lift |
|---|---|---|
| `src/scene/index.ts` | Imports `grove.json` statically and exports one `GROVE`. The schema has no exits, doors, region, kit or art block | S |
| `src/main.ts` | Boots `GROVE`. `?nopickups` builds a stripped copy inline | S |
| `src/game.ts` | `scene` is `readonly` and set in the constructor. `reset()` means "restart the scene". There is no room swap | S |
| `src/sim/state.ts` (v20) | All state is room-local: `pickups.timers`, `pods`, `enemies` and `goal.lanterns` are indexed by the scene's array order. Nothing persists past a `reset()` | M |
| `src/sim/tuning.ts` `assists` / `doubleJumps` | Abilities are global tuning, all on. Nothing per save can gate them | S |
| `src/sim/goal.ts` (708 lines) | "Three lanterns wake the heart" is the Grove's objective, built into the state shape. core.md drops it | (rework, not tech) |
| `src/render/stage.ts` | Builds `SceneRenderer`, `LayerTree` and every renderer once for `game.scene`. No teardown and no rebuild. Only a few modules `destroy()` anything | M |
| `src/render/scene/lib/fx-zones.ts` | The three moods are at hard-coded world x (`ZONE_EDGES` 1500–2400 / 3500–4400), also baked into GLSL (`ZONE_GLSL`) | M (inside the kit work) |
| `far.ts`, `mid.ts`, `bg-bake.ts`, `pf-forms.ts` | Grove landmarks and anchors are constants: waterfall x 1960, hollow tree 4600, anchor literal 2880, mid's ledge table, "the three landmarks", the moth-stone and the shrine | L (the kit work, §2.4) |
| `src/render/goal/config.ts`, `hud/prompts.ts` | Moth routes and waypoints in Grove coordinates. The shaft prompt is at `[3328, 3584, 192]` | S (goes with the goal rework) |
| `tools/shots.ts`, `tools/look-stats.ts` | Camera stops are a Grove list, duplicated in two files | S |
| `tests/unit/*` | 26 test files import `GROVE`. The pilots (`goal-pilot`, `naive-pilot`, `critical-path`, `layout-pilot`) script Grove routes by coordinates | Keep them as the Grove's own tests |

**History worth knowing.** The L4–L6 loops (September, deleted in the 2026-10-13 reboot) built a full room
stack: LDtk tile worlds, section sheets cut into rooms, edge exits that kept momentum, and a progression solver
with bot search and a cache (`git show 2d4fa14^:memory/level-authoring.md`, `…/progression.md`). Matt's verdict
was that the rooms felt "small, disjointed, not like HK/Ori", and that infrastructure had run ahead of fun. This
plan keeps three ideas from that work: exits found from world placement, momentum carried across them, and the
monotonicity rule ("extra abilities never remove options"). It drops tiles and LDtk, because our terrain is
painted from rects, and it builds only as much tooling as the next room needs.

## 2. World structure

### 2.1 Rooms, not one streamed map (recommendation)

| | Rooms with a short dip (HK) | One seamless streamed map (Ori) |
|---|---|---|
| Sim | Unchanged: one static `Scene` per room, and arrays indexed per room | Needs spatial chunks, actors that wake and sleep, and global indexing |
| Render | Today's bake-per-scene pipeline as is: playfield 60 ms, backgrounds baked per layer | Tile streaming and eviction for six parallax layers and the plant meshes. This is engine work |
| Tests | Small deterministic pilots per room | Pilots over a huge scene, or a fake room cut |
| Parallel agents | One file per room, no merge conflicts | One shared map |
| What the player gets | HK is proof that this is fun. The risk is feeling disjointed (L6) | Continuity |

Choose rooms, and fight the disjointed feeling directly:
- **Rooms are big.** The Grove is 5760×1600, about 4.4 screens of area. A typical room is 2–6 screens, and a
  corridor can be 1. One room is a place, not a puzzle cell.
- **Rooms are placed in world coordinates** (`world.json`), so geography is real, the map draws itself, and
  openings line up.
- **Edge exits carry the whole player state** (velocity, glide, timers). A glide out of one room is a glide into
  the next. The dip is about 0.25 s and pure style, because the next room is already baked (§6).
- **The look flows across a region.** Kit parameters such as mood and fog can be keyed to world position, so
  neighbouring rooms meet in the same light.
- If play still feels cut up, the next step is a neighbour peek: render the next room's playfield across the seam
  before the cut (§7, stage 3). This doesn't require streaming.

### 2.2 Data format: adding a region means adding files

```
content/world.json                    regions [{id, kit, name}], areas [{id, region, hub: "room#patch"}],
                                      rooms [{id, x, y}] (world px), start {room, patch}
content/rooms/<region>/<room>.json    one room = today's scene format + the fields below
src/render/kits/<kit>/                one module per region kit (painters + defaults)
```
**Areas** (rescoped 2026-10-18) are a grouping, not a new level of tech: a room names its area, the area names its
hub patch (the fast-travel point, §4) and its region (the kit). The map, the moth-stone reveal, the per-area lints
(§5) and the area-run tapes key on it. New fields on a room. Everything else (solids, oneWays, enemies, ceilingY,
kick faces) stays as it is now:

| Field | Shape | Notes |
|---|---|---|
| `id`, `region`, `area` | `wood-hatch`, `wood`, `wood-floor` | id = `<region>-<name>`. The file path must match. `area` is one of world.json's areas (rescoped 2026-10-18) |
| `purpose` | `["teach", "rest"]` | the room's job (teach, test, combine, hub, glade, rest, vista, boss, set piece, secret, corridor; `regions/wood.md` §7 uses them). Read by the lints (§5) and the `room new` templates (rescoped 2026-10-18) |
| `finds` | `[{id, kind: stone\|sign\|hollow, x, y, upgrade?}]` | the three non-lamp finds (core.md §6). A hollow names its upgrade, a tuning id read by `resolveParams` (rescoped 2026-10-18) |
| `exits` | `[{edge: n\|s\|e\|w, from, to}]` | A span along a room edge (room px) where the implicit edge wall is open. **The target is not authored:** the world validator finds the neighbour whose mirror exit covers the same world span (the L5 rule) |
| `doors` | `[{id, x, y, to: "room#door"}]` | Only for non-edge links: a hollow in a trunk, a cave mouth. Press up |
| `gates` | `[{id, rect, needs: "wallJump"}]` | Declarative only. It says which ability a route needs and is checked by tests (§5). No sim effect |
| `lamps`, `patches`, `glades` | core.md's lamp rows, moon patches, ability glades | Each has an `id` that is stable forever, because the save refers to it. A patch can be `hub: true` (one an area, the fast-travel point) |
| `migration` | `[[x, y], ...]` | The freed moths' line toward the next room or region (core.md §3) |
| `camera` | `{locks?: [{rect, view}], vistas?: [{x, y, lift}]}` | Default: clamp to the room plus ceiling headroom, as today |
| `art` | `{seed, moods: [{x, mood}], landmarks: [{kind, x, y, ...}], ...}` | Read only by the region's kit (§2.4) |
| `shots` | `[{name, x, y}]` | The camera stops `npm run shots -- --room <id>` uses (replaces the Grove list in `tools/shots.ts`) |

`src/world/` (outside the sim, like `src/scene/` today) loads and validates rooms. In the browser it uses
`import.meta.glob('/content/rooms/**/*.json')` with lazy imports, and in Node it reads files synchronously. The
sim still sees only the `Scene` type. Today's `parseScene` checks run per room, and a world pass adds: ids unique
across the world, every exit has its mirror, door targets exist, rooms don't overlap in world space, every room is
reachable in the room graph, and a region's kit exists.

### 2.3 Transitions

1. In the sim, the body's centre crosses an open exit span. The sim emits `roomExit {exit, to}` and holds her for
   `tuning.room.transitionFrames` (about 12). Frames still count, so the transition stays deterministic.
2. The harness (`Game`) looks up the neighbour (prefetched, §6) and calls the pure
   `enterRoom(state, nextScene, entry)`. That keeps `save` and the player's dynamic fields, moves her by the two
   rooms' world offset, rebuilds the room state from the new scene plus `save` (snuffed lamps start out, taken
   items start gone), and sets her safe ground to the entry.
3. Render: `RenderStage` swaps to the new room's prebuilt `SceneRenderer` under a short dip. The camera snaps,
   then eases as a re-form already does (`camera/reform.ts`).

Loading never happens inside `step()`. If a room isn't ready when the hold ends, `Game` simply doesn't step (as
when paused), so a tape replays identically on any machine.

### 2.4 Region art kits

Today the environment is a set of Grove-tuned modules: painters (`paintRock`, `limb`, `clump`,
`buildForest(plan)`, the plant species, `paintClimbFace`) wired to Grove constants. A **kit** has three parts:
- **Painters**, mostly shared. They live in `scene/lib/` and are the same functions as today.
- **A kit module**, one per region (`kits/wood`, `kits/valley` …). It holds the palette, the `ATM` objects per
  layer, the mood colours, the species lists, the tag-to-painter rules, the background plan, and the landmark
  painters it supports (waterfall, hollow tree, shrine…).
- **Per-room `art` data**: the seed, where each mood sits, which landmarks stand where.

`fx-zones.ts` becomes per-room mood stops passed to shaders as uniforms instead of the GLSL constants in
`ZONE_GLSL`. A new room in an existing region is then pure data: rects, `art`, and maybe one new landmark painter.
A new region is one kit module plus data. Region-wide state that changes the picture (core.md's darker, starrier
sky as lamps go out) is one uniform per region read from `save`.

*Easy path:* rooms in a region share about 90% of their look, and variety comes from seeds, mood stops and one or
two hand-made landmarks per room. HK's areas work the same way.

## 3. Persistent state

Split `GameState` into what persists and what belongs to the room. Both stay plain JSON inside the state, so
`hashState`, cloning and tapes keep working:

```ts
GameState = {
  version, frame, seed, rng, prevInput,
  room: string,                       // current room id
  player: PlayerState,                // body, health, timers (as today)
  local: { enemies, lamps, pickups, … },   // rebuilt by enterRoom; indexed by the room's arrays
  save: {
    abilities: string[],              // 'glide', 'wallJump', 'fling', …  (core.md §4)
    snuffed: string[],                // 'wood-hatch:wick-1': stays out forever
    moths: number,                    // freed total (milestones, ending)
    taken: string[],                  // one-time items (glade gifts)
    flags: string[],                  // doors opened, walls broken, story beats ('firefly-fled-1')
    visited: string[],                // rooms seen (the map)
    patch: { room, id },              // last moon patch: where she re-forms and where Continue starts
    time: number,                     // frames played
  },
}
```
- **Abilities gate the controller in one place.** `resolveParams(tuning, save.abilities)` turns off what she
  doesn't own (`doubleJumps: 0`, `glide: false`, …), so player code stays the same. A new ability is a flag plus
  its move, and old rooms need no rework (core.md §4). For debugging: `?abilities=all|glide,dash`,
  `__game.grant(id)`, `__game.save()`.
- **Room re-entry:** creatures and their state reset, as core.md §5 says. Anything in `save` stays. The room asks
  `save` when it is built, not the other way round.
- **Saving:** the `save` object plus `version` goes to `localStorage`, behind a Zod schema and a chain of
  `migrate(vN → vN+1)` functions. It is a few KB. The game autosaves when she rests at a moon patch, takes an
  ability, snuffs a lamp, or enters a room. Continue loads her at `save.patch`. Start with one slot. Slots and
  settings come later.
- **Determinism:** loading a save means `createState(seed, save)`. A tape records its start `save`, so tests can
  start "in the valley with glide and wall jump" in one line.

**At full size (rescoped 2026-10-18).** The built save (v22, `memory/save.md`) also keeps `opened`, `seen` and
`crossed` for the map. Three additions carry the rescope, and none is a new system:
- **Finds** are `taken` entries like glade gifts (`room:stone-1`, `room:sign-2`, `room:hollow-1`). Moonlit hollows
  also feed `resolveParams(tuning, save.abilities, hollows)`, so an upgrade is a tuning number, as an ability is a
  flag. The health milestones (110 / 350 / 800 / 1,400 / 2,100 moths) are computed from `save.moths`, never stored.
- **Fast-travel points** are the hub patches she has rested at: a `rested` list of `room:patch` ids (Tier 2, §4).
- **Size.** At ~175 rooms the id lists grow: ~285 snuffed lamps, ~800 `seen` ids (lamps, exits, patches, finds),
  ~450 crossed exits, ~175 visited rooms. As flat `room:id` strings that is ~50 KB of JSON, three times the 16 KB
  budget (§6), and it sits inside the state that is cloned and hashed. **Store the lists grouped by room**
  (`{"valley-roost-chasm": ["lantern-3", ...]}`), which drops the repeated room prefix (about half the bytes), and
  keep `seen` and `crossed` (map-only data) out of `hashState`'s per-frame path by hashing a save revision counter
  that bumps on every write. Measure both with a full-game save fixture before Tier 2.

## 4. Map screen and fast travel (rescoped 2026-10-18)

**Map v1** (needed before the second region, M): a pause overlay in render, outside the sim. It is drawn
automatically from `world.json` and each room's solids and one-ways, scaled to about 1/20 and simplified to soft
shapes in the region's map tint. Visited rooms show (`save.visited`). Markers: Wing, the moon patches, and every
lamp still burning as a lit dot (core.md: "the map is the to-do list"), with snuffed lamps as dim husks. It needs
no hand-drawn map art and no mapmaker.

**Map at scale (rescoped 2026-10-18).** Map v1 exists (Tab, `memory/world.md`) and scales the visited rooms to fit
(≤ 1/8). At ~175 rooms that is unreadable, so the map opens on her **area** at a fixed scale and zooms out to the
region and the whole road. A touched moth-stone draws its area's unvisited rooms faint and shows the area's count of
unseen lamps (core.md §6); collected firefly signs show as a row of glyphs. Per-area map textures are cached and
rebuilt only when that area's `visited` or `seen` changes.

**Fast travel (rescoped 2026-10-18): ships with Tier 2.** Travel between the hub moon patches from the map, from a
hub patch to any hub patch she has rested at (README rescope call 11). *Reason:* G5 asks that a return to the hub
take ≤ 2 minutes once play passes ~4 hours, and from the marsh on the shortcuts alone can't do that across five
regions; Tier 1 still has none (shortcuts instead). It is M: a `hub: true` flag on one patch an area, the `rested`
list (§3), a map pick, and a pure `travel(state, world, patch)` that `Game` applies between steps, as it applies
Continue, so a tape records it as an input event and replays identically. The room swap is the existing room change
with a longer dip.

## 5. Content authoring and validation (rescoped 2026-10-18)

**How rooms get made: hand-written JSON rects by agents**, as the Grove is today. Agents are good at it, the
pilots say exactly what broke, and the painters dress the rects automatically. Rejected or deferred:

| Option | Call | Why |
|---|---|---|
| LDtk or other tile tools | no | Tried in L5 and deleted. Our terrain is painted from rects, not tiles, and no human used the editor |
| Layout generators | no | Designed spaces are the game. Generation stays at the dressing level, where it already is |
| In-game nudge editor (Tweakpane: select a rect, move it with arrow keys, copy the JSON) | later (stage 3, M) | Useful for Matt to try ideas. Agents don't need it |
| `npm run room` CLI | yes, a bit at a time | `new <id>` (template + world slot), `check <id>`, `sheet <id>` (a PNG plan of solids, exits, lamps and jump-reach arcs for agents to look at), `shots <id>` |

**Validation, from cheap to expensive:**
1. **Schema and placement** (Zod plus today's `parseScene` rules) per room, and the world pass from §2.2. Always
   in `npm run check`.
2. **Route claims per room.** Each room lists `routes: [{from: "w", to: "lamp-2", needs: ["glide"]}]`. A test
   proves each route is reachable with `needs` and not reachable with `needs` minus any one item (the gate holds).
   It uses a generic bot: today's pilots turned into a small search over input macros (run, jump holds, glide,
   kicks), seeded and deterministic. Results are cached by room hash plus a sim fingerprint, as L5 did, so check
   stays fast. Monotonicity means a yes with fewer abilities answers every bigger kit.
3. **World progression check** (symbolic, cheap): rooms, exits, gates, glades granting abilities, and patches.
   Every ability is reachable in order, every room can get back to a patch (no softlocks), and every lamp is
   reachable with the full kit.
4. **Shots per room:** `npm run shots -- --room <id>` from the room's `shots` list, and the same for clips. As
   now, agents look at them against `docs/art-direction.md`. Looks are never asserted in check.
5. **Playtests by Matt.** These are the real bar (fun-over-process).

The Grove's hand-scripted pilots stay as the Grove's tests. The Grove becomes `test-grove`, playable with
`?room=test-grove` but outside the world graph, so its pilots keep guarding the movement feel.

### 5.1 At ~155 rooms (rescoped 2026-10-18)

Draft 1 planned 68 rooms; the rescope plans ~155 main rooms, ~20 optional ones and ~285 lamps, about 2.3x, written
by agents chunk by chunk (14 area chunks plus 2 optional, `world.md` §4.1). The wood's first 10 rooms show the cost:
each took a paper spec, a greybox, bot runs and fixes. At that rate the plan only works if everything per room that
can be generated or computed is. What that changes:

**Authoring.**
- **`npm run room new <id> --area <area> --purpose <kind>` is required now, not "a bit at a time".** It writes the room
  file from a purpose template (the room kinds the wood's first chunk settles: teach, test, hub, glade, corridor,
  boss, set piece, secret), places it in a free world slot next to its neighbour with mirrored standard-span exits
  (`world.md` §5 rule 5), and adds its line to the room list. Today a room is also one hand-written import line in
  `FILES` (`src/scene/index.ts`, because tsx tools can't glob); at ~175 rooms that list is **generated** from
  `content/rooms/` (a codegen step in `npm run check` that fails if it is stale), not hand-edited.
- **`npm run room sheet <id>` and `sheet --area <area>`**: the PNG plan (solids, exits, lamps, finds, jump-reach arcs)
  per room and per area. Agents and reviewers read an area from one sheet instead of opening 12 rooms.
- **Hooks into old rooms are data** (`world.md` §5 rule 8): each tier adds lamp, find and solid rows to earlier
  rooms. A `room hooks <tier>` report lists every gate row whose ability arrives in that tier, so no promised lock is
  left unpaid.
- **Ids stay forever** across ~1,000 lamp, exit, patch and find ids. The world check rejects a duplicate or a reused
  retired id (a `retired` list in world.json).

**Validation.**
- **The world check stays symbolic and cheap.** Its BFS over `room:thing` nodes grows from ~100 nodes to ~1,000; it is
  still milliseconds. It gains the rescope's rules: every area has exactly one hub patch and one moth-stone, every
  ability's glade is reachable in `core.md` §4's order, every hollow names an upgrade that exists, and `world.md`
  §3's rule 8 (breakables and passables are one-way safe).
- **Route claims need the cache.** At ~3–5 routes a room, ~600 claims each needing a bot search is minutes, not
  seconds. The cache by room hash plus sim fingerprint (draft 1) becomes required: `npm run check` re-searches only
  rooms whose hash changed, and a tuning change that moves the fingerprint is a `check:full` job, run per region.
- **Lints computed from room data** (new, `world.md` §4.1), per area and per chunk, against the bar's chunk rubric
  (`quality-bar.md` §3b): purpose tags, the novelty minute (first-timer minutes come from the playtest harness's
  persona runs, `memory/playtest-harness.md`, kept in a per-area timing file), finds per minute (C3: one every 2–3
  min, ≥ 2 kinds), threat density per lit screen, rest spacing (C5, G6: a patch within ~4 min, one at every boss door),
  and creature kinds per chunk (C2: ≥ 3). They report in check and fail only on the musts.
- **Shots per room, reviewed per change.** ~175 rooms at ~3 stops is ~500 PNGs; nobody looks at all of them each loop.
  `npm run shots -- --room <id>` and `--area <area>` shoot what changed; a whole-region pass belongs to the region
  review (`STUDIO.md`).

## 6. Performance budgets and testing as the game grows (rescoped 2026-10-18)

**Measured today** (the Grove, production build, M5 Pro, Chromium on Metal, 1920×1080):

| | dpr 1 | dpr 2 |
|---|---|---|
| Boot to ready (load, parse, all bakes) | ~0.9–1.0 s | ~1.0–1.1 s |
| Playfield bake (44 tiles) | 22 MP, 60 ms | 39 MP, 62 ms |
| Textures in the display tree (excludes off-tree far bakes and post targets) | ~33 MP ≈ 130 MB | ~50 MP ≈ 200 MB |
| JS heap reported after boot | ~700 MB was the grove's baked Graphics contexts, kept by Pixi until destroyed with `context: true` (fixed 2026-10-17: grove ~174 MB, wood-hatch ~99 MB after GC; memory/world.md) | same |
| Bundle | 1.37 MB, 460 KB gzipped, one chunk | |
| GPU per frame at 3840×2160 (memory notes) | far 0.42, mid 0.7–0.8, post 0.8, air 0.3, foreground 0.1 ms | |

**Budgets** (room = up to ~6 screens of area; larger needs a reason):

| Budget | Target | Why |
|---|---|---|
| Build a room (all bakes and meshes) | ≤ 300 ms on M-series, ≤ 700 ms on the min-spec laptop | Done ahead of time while she is in the previous room. The dip never waits |
| Rooms resident | current + up to 2 neighbours (LRU), prebuilt when she nears an exit | GPU memory |
| GPU textures per room | ≤ 250 MB at dpr 2; ≤ 800 MB for everything resident | Integrated GPUs share system RAM |
| Frame | 16.7 ms; GPU ≤ 8 ms at 4K on M-series; CPU (sim + render update) ≤ 4 ms | Leaves headroom for bosses and swarms of freed moths |
| First boot to title | ≤ 2 s | Pages deploy, first impression |
| Transition visible time | ≤ 0.3 s | Momentum carry has to feel continuous |
| Bundle | split per region kit (dynamic `import()`) once over 2 MB; room JSON split per region too (~175 rooms at ~6 KB is ~1 MB) | Load only the region you're in |
| Save | < 16 KB, with id lists grouped by room (§3); measured with a full-game fixture | localStorage, instant; it is inside the cloned and hashed state |
| Map | open ≤ 100 ms; per-area textures cached | ~175 rooms drawn from solids (§4) |
| `npm run check` | ≤ ~30 s at full size, with the route cache | agents run it every loop |

This needs real teardown: every renderer and environment module gets a `destroy()` that frees its textures and
meshes (today only a few do), plus a leak test (load and unload a room 20 times, texture count flat).

**Testing as content grows:**
- Mechanics: unit tests on flat scenes (as now, `tests/unit/helpers.ts`).
- Per room, generated from the room list: schema, exits, route claims (cached), and that the shot stops exist.
- World: progression graph; save round-trip (save, load, equal hash); room-crossing determinism (a tape across
  three rooms gives the same hash in Node and in Chrome).
- Area-run tapes recorded by the bot, one per area (16 at full size; draft 1 had one per region). They go stale on
  tuning changes (a warning) and fail on hash changes with the same tuning. An area's tape starts from a saved
  `save` at its entrance, so one area's change never invalidates the others.
- `npm run check` stays under about 30 s, using caches. `npm run check:full` re-searches everything, run locally
  before merging region work (there is no CI now). At ~600 route claims it is long: run it per region
  (`check:full -- --region <id>`) and in full before a tier ships.
- `npm run perf -- --room <id>`: build ms, texture MB and frame ms against the budgets. Run locally, it reports
  and doesn't block.

## 7. Staged roadmap (rescoped 2026-10-18)

Sizes: S ≈ a session, M ≈ a few sessions, L ≈ a week of loops. Status on 2026-10-18: most of stages 0 and 1, and the
world check and map v1 from stage 2, are built (`memory/world.md`, `memory/save.md`, `memory/rooms.md`); the kit
seam is partial, and the boss framework's cue timelines exist (`memory/bosses.md`). The rescope adds stage 1b and
moves fast travel into stage 3.

**Stage 0: before the first real room** (the hatching branch in the wood). Still one room, but with real plumbing.

| Item | Size |
|---|---|
| Room loader and registry (`content/rooms/…`, `world.json`, `?room=`). The Grove moves to `test-grove`, and tests load by id | S |
| Abilities in `save`, gated in `resolveParams`, plus debug grant and URL. The opening starts without glide (core.md) | S |
| `GameState` split into `save` / `local` / player, with stable `room:thing` ids and a version bump | M |
| Kit seam v1: Grove constants (moods, landmarks, anchor 2880, mid ledges) read from the room's `art` and a `wood` kit module, so a second wood room isn't the Grove's waterfall again | L |
| Shot stops from the room JSON (`shots`) | S |

**Stage 1: before the second room** (the first transition).

| Item | Size |
|---|---|
| Edge exits and doors in the sim (`roomExit`, hold, `enterRoom`, momentum carry) and the room swap in `Game` | M |
| Render lifecycle: `destroy()` everywhere, neighbour prebuild, LRU, dip; the leak test; find the 700 MB heap | M |
| World validator (mirror exits, overlaps, graph) | S |
| Save/load v1: one slot, autosave, Continue at the last moon patch, migrations | M |
| Camera locks and vista lifts per room | S |
| `npm run room new / check / sheet` | S |

**Stage 1b: with the wood floor's current chunk** (new 2026-10-18; the chunk needs finds and the volume needs the
tools before the second area).

| Item | Size |
|---|---|
| The find framework: `finds` rows (moth-stone, firefly sign, moonlit hollow) on the pickup tech, `taken` ids, hollows in `resolveParams`, the stone's map reveal (§3, §4) | S |
| `world.json` areas and the room `area` and `purpose` fields; the world check's per-area rules (§5.1) | S |
| `room new` with purpose templates and world placement, `sheet --area`, the generated room list (§5.1) | M |
| The lints from room data: novelty minute, finds per minute, threat density, rest spacing, kinds per chunk (§5.1) | M |

**Stage 2: before the second region** (the valley of lamps, area 3).

| Item | Size |
|---|---|
| Kit v2: kits as code-split modules, the valley kit built as a module plus data; room JSON split per region | L |
| Generic route bot, route claims per room, result cache (required at this volume, §5.1) | M |
| World progression check (symbolic) | S (built) |
| Map screen v1, then the area view and zoom (§4) | M (v1 built) + S |
| Perf harness and budgets per room; area-run tapes | S |

**Stage 3: before Tier 2** (the marsh, area 6).

| Item | Size |
|---|---|
| **Fast travel between hub patches** from the map (§4; README rescope call 11) | M |
| Save id lists grouped by room, the revision-counter hash, a full-game save fixture against the budget (§3, §6) | S |
| `room hooks <tier>`: the report of old rooms owed Tier 2 hooks (§5.1) | S |
| `check:full` per region | S |

**Stage 4: later, when play asks for it.** The in-game nudge editor (M). The neighbour peek across seams if the dip
feels disjointed (M). Save slots and the settings/assist menu (S). Scripted beats (the firefly's relights, the chase,
the drowned roots' rising water, the storm's gusts) run on the boss framework's deterministic cue timeline, which
exists; each new beat is data plus its hazard (S–M each).

## 8. Easy-path choices

| Chose | Over | Why the fun is the same |
|---|---|---|
| Rooms with a short dip | a streamed seamless world | HK shows it. Momentum carry and big rooms keep the flow, and the bake-per-scene renderer stays |
| Exits found from world placement | wiring each door by hand | No mismatched links. The map is free |
| Creatures reset on re-entry; only `save` persists | per-actor persistence | Standard in the genre, and what core.md already says |
| Auto-map drawn from collision | hand-drawn map art | No one gets lost, and it costs no art per room |
| No fast travel in Tier 1; hub-to-hub travel in Tier 2 (rescoped 2026-10-18) | building it up front, or never | Tier 1 ends before ~4 h of play and its shortcuts are enough; from the marsh on, G5's ≤ 2-minute return needs it, and it reuses the room change |
| Generated room list, templates and lints (rescoped 2026-10-18) | hand-wiring ~175 rooms | the same rooms, with the bookkeeping done by tools so agents spend their time on layout |
| Hand-written JSON rects | an editor or LDtk | Agents write JSON well. The dressing is already generated |
| One kit per region with per-room parameters | bespoke art code per room | Variety comes from seeds, moods and landmarks |
| Save = a few KB of JSON in localStorage | a save backend or cloud | It's a browser game and offline is fine |
| Bot reachability with a cache | hand-written pilots for every room | One tool covers every room and every gate |

## 9. Open questions for Matt

1. **Rooms with a short dip (HK), or one seamless world (Ori)?** *Recommend:* rooms, big (2–6 screens), with
   momentum carried across exits. Try the neighbour peek only if a playtest says it feels cut up.
2. **What is our minimum machine?** The budgets depend on it. *Recommend:* desktop browsers (Chrome, Safari,
   Firefox) on M-series Macs and a 3-year-old laptop with an integrated GPU, at 1080p. No mobile or touch.
3. **What happens to the Grove?** *Recommend:* keep it as `test-grove` (a test bed with its pilots, outside the
   world). The real wood rooms reuse its kit and its best pictures, not its layout.
4. **Save model.** *Recommend:* autosave on every progress event and room entry, Continue at the last moon patch,
   one slot at first. Nothing the player earned can be lost to a crash.
5. **Fast travel.** *Recommend:* not until playtests show backtracking for unreachable lamps is a chore.
   **Decided 2026-10-18** (README rescope call 11): hub-to-hub fast travel ships with Tier 2, because G5 requires a
   ≤ 2-minute return to the hub once play passes ~4 h. Tier 1 has none.
6. **Gamepad as first-class?** The input layer already has it (`src/input/gamepad.ts`). *Recommend:* yes, test
   every room with a pad, since the genre is played that way.
