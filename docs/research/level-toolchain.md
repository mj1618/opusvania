# Level toolchain: baseline, editor, terrain, dressing, camera, streaming

L5 stream E (Phase W, step 3). Research only: no code was changed. The Hollow Knight and Ori teardowns (`docs/research/teardown-*.md`, streams A to D) own the detailed reference numbers; comparisons here use general knowledge and are labelled **estimated**. Our own numbers are **measured** from `content/gym/*.json` with a throwaway script (air extent = bounding box of every non-`#` tile, so the 1-tile border walls and the loader's padding are excluded), or **derived** from those.

Units follow `TEMPLATE.md`: tile 64 px, player 40 × 80 px, screen 30 × 16.875 tiles (1920 × 1080). 1 tile = 0.8 player heights (PH), 1 screen = 13.5 PH tall and 24 PH wide.

## 0. Decisions at a glance

| Question | Recommendation |
|---|---|
| Editor | **LDtk 1.5.3 stays the editor, but agents never type tiles.** Brushes (shape primitives) are stored as LDtk entities, and a deterministic **bake** turns them into the IntGrid. There is a compact text "room sheet" view for agents, and a **compiler** that outputs today's `RoomFile`, so the sim, bot, progression validator, tapes and dressing all work with new rooms on day one. |
| Collision | **The Hollow Knight approach first**: rectilinear collision on the 64 px grid, drawn with an organic, code-generated skin. Then add **floor-only slopes at 45° and 1:2 (26.6°)**, implemented as integer heightfield tiles. No curved collision: curves are baked into chains of slopes, and only the skin draws the smooth curve. |
| Rooms and world | GridVania world coordinates. **Edge exits keep your momentum** and are derived from where openings meet in the world layout. Up-press doors remain only for real doors, lifts and dumbwaiters. Rooms can be multi-screen, up to about 8 × 4 screens. |
| Camera | Add a render-only **zoom**, `frame` (bias) zones, one-shot `vista` zones and per-zone zoom. The existing blend and clamp model carries over. |
| Streaming | For now, neighbour "peek" rendering plus fast edge transitions. Merging a whole region into one sim space is a later option, not a requirement. |
| First build step | **LDtk → `RoomFile` compiler plus brush bake plus world coordinates and edge exits.** That alone unblocks a region blockout at teardown scale. |

## 1. Baseline: our current rooms

### 1.1 Room size distribution (measured)

25 rooms: 14 gym, the hub, 4 L3 rooms (lot-7, lot-7-control, the-pit, stairwell), and 6 L4 rooms (yard, 4 rings, auction).

| Metric | Width | Height | Area |
|---|---|---|---|
| Min | 0.33 scr (10 tiles, 8 PH), stairwell | 0.30 scr (5 tiles, 4 PH), gym-03 | 0.38 scr² |
| **Median** | **1.27 scr (38 tiles, 30 PH)** | **0.83 scr (14 tiles, 11 PH)** | **0.83 scr²** |
| Max | 3.10 scr (93 tiles, 74 PH), gym-14 | 2.67 scr (45 tiles, 36 PH), gym-09 | 5.88 scr² |
| Total, all 25 rooms | | | **31.8 scr²** |

- 15 of 25 rooms have less than one screen of air, and 8 fit completely inside a single view with no camera movement at all (auction, gym-05, gym-06, gym-11, three rings, the-pit).
- 18 of 25 are at most one screen tall. Only 2 are more than 2 screens wide: gym-14 (the camera lab) and the hub (a corridor 13 tiles tall).
- Shape: 16 are horizontal, 5 vertical (gym-07/08/09, stairwell, yard) and 1 is a set piece (gym-14). The room boundary is always a rectangle.

| 5 largest by air area | Air (tiles) | Screens (w × h) | PH (w × h) | Area (scr²) |
|---|---|---|---|---|
| gym-14 camera lab | 93 × 32 | 3.10 × 1.90 | 74 × 26 | 5.88 |
| hub | 85 × 13 | 2.83 × 0.77 | 68 × 10 | 2.18 |
| yard | 54 × 20 | 1.80 × 1.19 | 43 × 16 | 2.13 |
| gym-13 | 58 × 17 | 1.93 × 1.01 | 46 × 14 | 1.95 |
| gym-09 | 18 × 45 | 0.60 × 2.67 | 14 × 36 | 1.60 |

**Planned slice (derived from world-design §4.2):** 16 rooms, median 2.0 scr², largest 3.4 (the 75 × 23 rooms), 35 scr² in total. That is better, but it is still sized as a set of rooms rather than as a place. 30 × 17 is the most common size, and every size is a multiple of the screen.

**Comparison (estimated; the teardowns will replace these numbers).**
- Hollow Knight's camera shows roughly the same number of player heights as ours: PLAN's 13.5 PH per screen was chosen to match it.
- Ordinary HK rooms run about 1–3 screens on their long axis. Set-piece rooms run about 4–8.
- An HK area is dozens of rooms, and it reads as one continuous map because each room sits at a real map position.
- Ori has no rooms: an area is one seamless space many screens across.
- By either measure, **our median room is about half to a third of an ordinary HK room, and our whole game is roughly the area of one mid-sized HK zone** (an estimate).
- Size is not the main defect, though. Geography is (§1.2).

### 1.2 Graph structure (measured)

- **A star with no geography.** The hub is an 85-tile corridor, one floor 13 tiles tall, with 24 Up-press doors spaced every 3 tiles. Every other room is a spoke. The L3 and L4 rooms end in `G`, which teleports you back to the hub (`next: hub`). The gym is a 15-room chain (hub → gym-01 → … → gym-14 → hub), and it is the only loop.
- **Hub degree 24.** 24 of 24 non-hub rooms are dead ends as places: the only ways out are a goal teleport or death.
- **No room has a world position.** No two rooms share an edge, so a map could not be drawn. There are no one-way drops between rooms, no shortcuts, no second entrances and no sightlines into other rooms.
- **Transitions:** press Up on a door → 10 frames frozen with a fade → load at a named spawn. Momentum is not kept, and edge exits do not exist: outside the room counts as solid, "so nothing can leave it" (`rooms.ts`).
- **Comparison (estimated).**
  - HK areas are meshes. Most rooms have 2–4 exits on their edges, you walk through them keeping your momentum, and there are several loops and unlockable shortcuts per area.
  - Ori is continuous.
  - Our structure is a level-select screen, and it is the main reason the game feels "disjointed".

### 1.3 Terrain vocabulary (measured)

- **Tiles:** full 64 px solid, one-way, spikes in 4 directions, and the pogo orb. The dynamic solids are sources, plates and gates (tile components). That is the whole vocabulary.
- **No** slopes, half tiles, curves, overhang art, breakables, background walls or foreground masses.
- **Resolution:** the smallest feature is one tile = 0.8 PH, so every step and ledge is a multiple of 0.8 PH. Celeste's tile is about 0.73 of Madeline's hitbox height (**derived**: 8 px tiles against an 11 px hitbox), so the grid is not unusually coarse. What is unusual is that nothing covers it up: the collision grid *is* the art.
- **Per room (median):** 5 separate top surfaces, 14 solid corners, 35% of the file solid (range 24–76%). Shafts are mostly solid, because they are padded to a width of 30.
- **Area identity:**
  - One code-drawn skin: depth-shaded blocks with lit top rims (`src/render/gfx/terrain.ts`).
  - A seeded parallax "boomtown" backdrop, and 4 district palettes.
  - Hanging foreground occluders, lights and particles, set per room through `content/rooms-dressing/*.json`.
  - No authored landmarks: the dressing schema has lights and densities, but no placed props.
- **Comparison (estimated).**
  - HK's walkable collision is almost all flat floors and vertical walls, but its silhouettes are completely organic: painted rock lips, roots, shells and foreground masses overlap the collision edges.
  - Ori's terrain is spline and mesh based, with sloped and curved floors, walls and ceilings.
  - Ours looks like a spreadsheet, because what you see *is* the collision grid.

### 1.4 Landmarks, sightlines, camera (§5, §10; measured)

- **Landmarks:** 0 authored. The only unique props are gameplay objects: sources, the Corner stool, doors.
- **Vistas:** 0. With a median room of 0.83 scr² you can't have one, because there is nothing out of view to reveal.
- **Camera:**
  - Free follow with dual forward focus, platform snapping, look up/down and trauma shake.
  - Four zone modes (`lock`, `clampX`, `clampY`, `bounds`), used in 1 room (gym-14, 3 zones).
  - No zoom.
- **Transitions:** a door fade only; no seamless or edge transitions.

**Verdict.**
- The engine side (feel, camera smoothing, lighting) is ahead of the content side.
- The content pipeline can only express rectangles typed as text, and it has no notion of a world.
- Scale, geography and silhouette all need new tools. More rooms of the same kind won't fix it.

## 2. Editor options

### 2.1 What we need

1. **World layout.** Rooms at real coordinates, so edges line up, a map can be generated, and a reviewer (or the user) can look at a whole region at once.
2. **Big organic rooms that agents can author efficiently.**
   - A 6 × 3-screen room is 180 × 51 tiles, about 9,200 cells.
   - As ASCII, that's 51 lines of 180 characters in which the agent has to count columns. Agents make off-by-one errors, and diffs become unreadable.
   - We need higher-level operations: "carve a cave along this path, 5 tiles high" instead of 9,200 characters.
3. **Human editability** at taste checkpoints: the user or a designer drags things around in a visual editor.
4. **Machine validation** in `npm run check`: schema, freshness, edge matching, metric lint and progression.
5. **Mapping onto our gameplay schema** (sources, plates, gates, enemies, pickups, rests, locks, prompts, camera zones) without breaking the sim, bot, progression validator or tapes.

### 2.2 LDtk 1.5.x

What it gives us (LDtk JSON 1.5.3 is the current format; verified against `ldtk.io/json` and the minimal schema):

- **Worlds.**
  - `worldLayout` is one of `Free`, `GridVania`, `LinearHorizontal` or `LinearVertical`.
  - Under GridVania, levels snap to a `worldGridWidth` × `worldGridHeight` cell. For us that cell would be one screen, 30 × 17 tiles, so rooms are whole numbers of screens in the world view.
  - Every level has `worldX`, `worldY` and `worldDepth`, plus a computed `__neighbours` list with `dir` ∈ `n s e w ne nw se sw < > o` (the last three are depth and overlap).
- **Multi-screen levels.** Level size is free (`pxWid`, `pxHei`), so a room of 8 × 4 screens is just a big level.
- **Separate level files.**
  - With `externalLevels: true`, each level lives in its own `.ldtkl` file (`externalRelPath`).
  - This keeps diffs per room, allows streaming, and limits merge conflicts between parallel agents to one file each.
- **Layers.**
  - `IntGrid` layers hold per-cell integers in `intGridCsv`. That's collision, and 1.4+ adds IntGrid value groups.
  - `Entities` layers hold typed entities.
  - `AutoLayer` / `Tiles` layers hold rule-driven tiles. Auto-layer rules are pattern matchers over IntGrid neighbourhoods, up to 9 × 9 (1.5 sizes rules automatically), with chance, modulo, perlin and flip options.
- **Entities.**
  - Typed fields: Int, Float, String, Bool, Color, `Enum(name)`, FilePath, Tile, **`EntityRef`** (`{worldIid, levelIid, layerIid, entityIid}`) and **`Point`**, plus arrays of any of them (e.g. `Array<Point>`).
  - Entities can be resizable rectangles.
  - A `Points` array can be displayed and dragged in the editor as a path or loop, which makes it an editable polygon.
- **`toc`.** A project-level table of contents lists every instance of flagged entity types across all levels. The progression validator could read the whole world's doors, gates, pickups and rests without opening every level file.
- **Custom commands.** The project can run a shell command on load, before save or after save; LDtk asks the user to trust the project first. "Run after saving: bake + lint" gives a human in the editor instant validation.
- **Project traits.**
  - It's stable and free, and it's by Deepnight (Dead Cells). Development has slowed, but the format is documented and has a published JSON Schema and QuickType types.
  - Our risk is limited to the file format, because the runtime never reads LDtk directly (§2.6).

**What's awkward for agents.**
- Writing LDtk JSON by hand is fragile:
  - Every entity needs `iid`, `defUid`, `px`, `__grid`, `__pivot`, `__smartColor`, `__tags`, `width` and `height`.
  - Field instances need `defUid` plus editor-internal values.
  - `defs` hold uid counters.
  - `intGridCsv` is a flat array.
- Auto-layer output (`autoLayerTiles`) is only computed by the editor.
- There is **no headless CLI**, so an agent can't ask LDtk to validate or re-run rules.
- Mitigations:
  - Agents only touch LDtk through our TypeScript library (§2.5), which owns uids and iids. Iids are deterministic UUIDs derived from level id + entity name.
  - We validate against the official schema in tests.
  - We never rely on LDtk auto-layers for anything the game renders: our skin is procedural (§4).

### 2.3 Alternatives

| Option | For | Against | Verdict |
|---|---|---|---|
| **Tiled 1.11** | Real polygon and polyline objects, a natural fit for organic edges. `.world` files lay out several maps. Wang/terrain sets. A JS scripting API and a CLI export. The TMJ JSON is simpler than LDtk's. | World view is weaker than GridVania: no neighbour computation, no entity refs across maps, no toc. Entity typing ("custom types") is looser. Terrain sets need a tileset we don't have. PLAN rejected it once already. | A credible second choice. Its one real advantage (polygons) we can get from LDtk `Array<Point>` fields. |
| **Custom in-game editor** | Edits in the real renderer with real physics, so you can play-test instantly. Can show bot reachability and the camera live. | Weeks to reach basic usability (selection, undo, save, entity inspectors). Agents don't use GUIs anyway. Competes with gameplay work. | **Not now.** Later, a small "nudge" overlay (drag brush handles in the running game, write back through the dev server) gives most of the benefit. |
| **Procedural shape tools only** (brush scripts in TS, no editor) | The most efficient for agents. Deterministic, easy to diff. | No visual world overview. Humans can't touch it. Tends to look generated if nothing else is authored. | **Adopted as the authoring layer *inside* LDtk** (below), not instead of it. |
| **Keep ASCII** | Zero cost; agents can already write it. | Fails requirements 1–3. | Keep it for gym and unit-test rooms only. |

### 2.4 Recommendation: LDtk as the file of record, brushes as the authoring primitive

```
agent / human                         tools/world (Node, not sim)                        runtime (unchanged at first)
─────────────                         ─────────────────────────                          ────────────────────────────
room sheet (JSON, 1 brush per line) ─► import ─┐
LDtk editor (drag brushes, entities) ──────────┼─► content/world/tallage.ldtk + levels/*.ldtkl
                                               │      layers: Brushes (entities) · Collision (IntGrid, BAKED)
                                               │              Paint (IntGrid, hand overrides) · Entities · Dressing
                                               ├─► bake: brushes (CSG, in order) ⊕ Paint → Collision
                                               ├─► lint: schema, bake freshness, edges, metrics, sizes
                                               └─► compile ──► content/world/rooms/<id>.json (RoomFile: ASCII rows + maps)
                                                              + content/world/world.json (positions, edge exits, links)
                                                              ► sim loader, bot, progression, tapes, dressing: as today
```

1. **Brushes live in LDtk**, as entities on a `Brushes` layer.
   - A brush has `op` (add, carve), `shape` (enum), `pts` (`Array<Point>`), `size`/`width` (Int), `seed` (Int), `material` (Enum) and `tag` (String).
   - Humans see brushes as editable paths and rectangles in LDtk; agents see them as lines of JSON.
   - Order is significant: they are applied as CSG in list order, and the sheet can reorder them.
2. **`Collision` is generated, never hand-painted.**
   - Bake = rasterise the brushes in order, apply the `Paint` IntGrid overrides (0 = no override, or a forced tile value), then run post-passes:
     - remove 1-tile slivers unless a brush is tagged `keep`;
     - fill sealed air pockets;
     - later, place slope tiles (§3).
   - A **freshness check** in `npm run check` re-bakes in memory and fails if the stored IntGrid differs. It catches both a human painting the generated layer and an agent forgetting to bake.
3. **The compiler targets today's `RoomFile`.** ASCII `rows` plus `doors`, `sources`, `plates`, `gates`, `enemies`, `pickups`, `rests`, `locks`, `prompts` and `cameraZones`, with chars allocated automatically.
   - This makes **zero** changes to `src/sim/world/rooms.ts` for the first region. The bot, progression, tapes, dressing resolution and `__game.load` all work.
   - Two small schema additions are needed: `world: {x, y}` (tiles), and `exits` for edge transitions (§6).
   - When the ~60 free chars run out, or char-matching gets in the way (plates linked to gates by an `EntityRef`, not by character), move to `RoomFile` v2 with an entity list. That is a loader change, not a content change.
4. **Room sheet**: a compact view agents read and write, not a second source of truth. `npm run world -- sheet export B2` / `sheet import`. For example:

```jsonc
{ "level": "B2", "at": [4, 2], "size": [6, 2],            // world cell and size in screens
  "material": "brick", "district": "brown",
  "brushes": [
    ["fill"],                                              // start from solid
    ["blob",   "carve", [42, 20], [34, 11], {"rough": 2, "seed": 4}],       // main hall
    ["tunnel", "carve", [[0,27],[18,26],[40,29],[70,22],[120,24],[180,20]], 5, {"seed": 9}],
    ["shaft",  "carve", [150, 0], 6, 22],                  // x, top, width, depth
    ["ramp",   "add",   [40, 29], [48, 25]],               // steps now, slopes later
    ["ledges", "add",   [[96,18],[103,15],[110,12]], 4],   // run of 4-wide ledges
    ["oneway", [60, 20], 6],
    ["arch",   "carve", [120, 8], [20, 10], 2]
  ],
  "entities": [
    ["door", "e", [180, 18], {"to": "B3"}],                // edge exit: must meet an opening in B3's west edge
    ["rest", [22, 30], {"name": "Cellar Corner"}],
    ["enemy", "barker", [64, 29]],
    ["source", [30, 28, 2, 2], {"sound": "grind", "colour": "brown"}],
    ["landmark", "scale-beam", [42, 9]],
    ["camera", "vista", [140, 0, 40, 25], {"zoom": 0.8, "look": [165, 10]}]
  ] }
```

   That's about 20 lines for a 180 × 34-tile room. The equivalent ASCII is 34 lines of 180 characters.
5. **Brush set v1.** All shapes are in tiles and rasterised by sampling each tile's centre, which is exact and deterministic.
   - `fill`
   - `rect`
   - `poly` (points)
   - `blob` (an ellipse with a seeded, integer-noise boundary: organic chambers)
   - `tunnel` (carve along a polyline with a width and seeded width wobble: Ori-style caves)
   - `shaft`
   - `arch`
   - `ledges` (a run of platforms)
   - `oneway`
   - `ramp` (a staircase now, slopes after §3)
   - `stamp` (paste a named, authored chunk from `content/world/stamps/`: a vault door, a chimney, a Corner alcove)
6. **Metric-aware authoring.**
   - Brushes and entities can carry intent, e.g. `{"path": "critical"}`.
   - The linter measures gaps and rises along critical paths against `tools/progression/reach-table.json` and world-design §6.1: "the gap at 96,18 is 7 tiles; critical-path comfortable is ≤ 6".
   - Roughness never applies to tiles tagged as walkable critical floors.
7. **Seeing the result without a GUI.**
   - `npm run world -- png <region>` renders the whole region to a PNG at world coordinates: a minimal PNG encoder on `node:zlib`, so no new dependency. Collision, entities, edge links, camera zones and a flood-fill reachability tint are drawn. Agents `Read` the PNG; the user gets a map.
   - `npm run world -- ascii <level>` prints a region of a room.
   - In-game checks use `__game.load(id)` and playwright-cli screenshots, as today.
8. **LDtk project settings.**
   - GridVania with a 1920 × 1088 px world cell, i.e. 30 × 17 tiles. 17 × 64 = 1088 matches `minRoomH` and world-design's "multiples of 17" shafts.
   - IntGrid grid size 64.
   - `externalLevels: true`.
   - Entity types flagged for `toc`: Door, Gate, Lock, Pickup, Rest, Landmark.
   - A custom command after save: `npm run world -- bake --lint`.

### 2.5 How agents author a large organic room, step by step

1. **Path first.** Write the intended route as a polyline with beats (enter, see landmark, climb, fork, reward) before any terrain. It becomes a `tunnel`/`blob` skeleton plus `ledges`.
2. **Mass second.** Carve chambers (`blob`) at the beats, connect them with `tunnel`s, and add `shaft`s for verticality. Place landmarks where the path turns, so they can be seen from far away (§4.3).
3. **Detail third.** Platforms, one-ways, gates, sources, enemies, camera zones.
4. **Loop:** `bake → lint → png → bot/progression → __game.load + screenshot`, then adjust brushes. It never touches individual tiles, except through the `Paint` layer for the last few fixes.

The library: `tools/world/ldtk.ts` (load, save, deterministic ids, typed accessors, and a Zod schema for *our subset* of LDtk), `bake.ts`, `sheet.ts`, `compile.ts`, `lint.ts`, `png.ts`, and `cli.ts`.

### 2.6 How it maps onto our schema

| Today (`RoomFile`) | In LDtk | Compiles to |
|---|---|---|
| `rows` `#` `=` `^v<>` `o` | `Collision` IntGrid: 1 solid, 2 one-way, 3–6 spikes, 7 orb (8+ slopes later), baked from `Brushes` ⊕ `Paint` | ASCII rows |
| Room size, padding | Level `pxWid`/`pxHei`, whole screens (GridVania) | rows (no padding needed) |
| — (new) | `worldX`/`worldY` | `world: {x, y}` in tiles |
| `P`, `R`, `+` | `Spawn` (name), `SafeGround`/`Respawn`, `Corner` entities | chars |
| `doors` | `Door` entity: `kind` (`edge` / `up`), `to` = EntityRef to the matching Door | `exits` (edge) or `doors` (up) |
| `sources` | `Source`: a resizable rect with `sound`, `colour` (Enum), `locked` | a char per source (the rect fills the component) |
| `plates` | `Plate`: rect, `pressedBy` (Array<Enum>) | char |
| `gates` | `Gate`: rect, `opensOn`, `plate` (EntityRef), `requires` (Array<Enum Ability>), `hold`, `moves` (Array<String>) | char (+ plate link; v2 when chars clash) |
| `enemies` | `Enemy`: `type` (Enum generated from `content/enemies`), `facing` | char |
| `pickups`, `rests` | `Pickup` (`grants`, `id`), `Rest` (`name`); in toc | chars |
| `locks` | `Lock`: target rect = the entity's own size, `from` (EntityRef Spawn), `requires`, `moves`, `prelude`, `teachGate`, `region` (Point pair) | `locks` |
| `prompts` | `Prompt`: `keys` (Array<Enum>), `until`, `near` | `prompts` |
| `cameraZones` | `CameraZone`: rect, `mode` (+ `frame`, `vista`), `value` (Point), `zoom` (Float) | `cameraZones` |
| `abilities`, `claims`, `hazard`, `spawnGrace`, `notes` | Level fields (claims as a JSON string field) | same keys |
| `rooms-dressing/<id>.json` | Level fields `district`, `seed`, ambient; `Light`, `Landmark`, `Prop`, `Occluder` entities; `Material` IntGrid (skin materials) | a dressing JSON per room (render-only; the sim never sees it) |
| world-design §4.8 design graph | Level fields `district`, `purpose`, `fever`; toc | `world.json`; the validator diffs design against built rooms, as today |

## 3. Slopes and organic terrain

### 3.1 How the references do it (estimated; the teardowns should confirm)

- **Hollow Knight** is built in Unity from 2D colliders placed under hand-painted scenery.
  - Walkable collision is overwhelmingly flat floors and vertical walls. Sloped walkable surfaces are rare. The Knight's controller is box-based, and nothing in HK's movement depends on slopes.
  - The organic look comes entirely from art: rock lips overhang the collision edges, and foreground masses and background walls break up the silhouette.
  - Camera framing uses per-room lock areas (known from the modding community).
  - **Lesson:** you can read a space as organic without organic collision, as long as the silhouettes are organic.
- **Ori (Blind Forest, Will of the Wisps)** builds terrain from spline or mesh shapes with edge colliders.
  - Its controller follows the ground normal: running over hills, curved walls, climbable angled surfaces.
  - Bash, Dash and Glide all interact with arbitrary angles.
  - **Lesson:** Ori's "flow" comes partly from continuous undulating ground, where you never stop to step up, and partly from its camera and its speed. But arbitrary-angle collision is a deep dependency for a controller. The more a controller relies on surface normals, the harder exact integer reproducibility gets.

### 3.2 Options for an integer-AABB engine

| Option | Determinism | Controller cost | Look | Notes |
|---|---|---|---|---|
| A. Rectilinear collision + organic skin (HK) | Unchanged | None | Organic silhouettes; floors read flat | Needs skin rules so the art never lies about where you can stand |
| B. A + floor-only slope tiles, 45° and 1:2 | Integer heightfield lookups | Moderate (moveX step-up and ground-stick, ground probe) | Rolling floors and ramps; ceilings and walls stay rectilinear under the skin | The standard pixel-platformer technique (Monteiro's guide, the Sonic sensor model) |
| C. Arbitrary polygon/edge collision (Ori) | Needs fixed-point normals and ray casts; sin, cos and sqrt are banned in the sim | High: speed along surfaces, normal-based jumps, wall classes by angle | Truly curved | Rewrites the L2 controller that passed the exact V03–V05 and V22 tests. Not worth it. |

**Recommendation: A now, B next, never C.**
- A unblocks the region blockout immediately with no sim risk.
- B adds the part of Ori's flow that matters, running over uneven ground, at a bounded cost.
- Curves are a bake-time idea only. A `curve` brush quantises a spline to the nearest chain of flat, 1:2 and 45° segments, and the skin draws the smooth spline over it (§4.1).
- "22.5°" doesn't sit on a tile grid (tan 22.5° ≈ 0.414). Use 1:2 = 26.6°, which is exact in integers (one pixel up per two pixels across).

### 3.3 Slope design (option B)

- **Tile types (floor-only).**
  - `slope45R`, `slope45L` (rising to the right or left).
  - `slope12R_lo`, `slope12R_hi`, `slope12L_lo`, `slope12L_hi`: one 1:2 slope spans two tiles.
  - Each type has a precomputed `Int16Array(64)` surface table giving the top of solid per pixel column, all integers. For example, 45R gives `top[i] = 63 − i`; 1:2R_lo gives `top[i] = 63 − (i >> 1)`. The left versions are the mirrored tables, so V22 symmetry holds by construction.
  - Ceiling slopes are not supported. A sloped ceiling is a block-stepped ceiling with a sloped skin.
- **Sensor.**
  - Slopes only ever collide with the actor's **feet**, sampled at the two middle columns (`x + w/2 − 1` and `x + w/2`); the higher surface wins.
  - Two columns are needed because with an even width (40 px) a single centre column isn't mirror-symmetric.
  - Side and head checks ignore slope tiles: `solidAt` treats them as non-solid, so walls, wall-slide probes, corner correction and the head bonk are unchanged.
  - The body's corners overlap the slope visually by up to w/2 = 20 px on a 45° slope. This is standard, and the skin hides it.
- **Movement** fits the existing hooks:
  - **Uphill:** in `moveX`, when a 1 px step would put the feet below the slope surface, raise y to the surface (at most 1 px for 45°), provided the head is clear. This is the same mechanism as `onBlockX` corner correction: "shift perpendicular and retry". If the head is blocked, the move is blocked.
  - **Downhill (ground stick):** after the x move, if the actor started the frame grounded and `vy >= 0`, and the slope surface is no more than `ceil(|dx|) + 1` px below the feet, snap down and stay grounded. At run speed 9.6 px/f a 45° slope needs up to 10 px of snap. Without it, running downhill becomes a series of tiny falls, and coyote, landing and dust events fire every frame. That is the most common slope bug.
  - **Falling** onto a slope: `blockedY(+1)` is true when the feet sensor reaches the surface.
  - The ground probe `groundAt` gains the same sensor test.
  - **Horizontal speed stays constant along x**, as in HK and Celeste; slopes don't slow you. An optional `run.slopeUphillMult` in tuning defaults to 1.
  - **Jumping** off a slope uses the normal jump. There's no launch along the normal, so jump heights measured from the take-off pixel stay exactly as in the reach table.
  - **Dash:** a grounded dash follows the slope (it keeps the ground-stick flag). An air dash passes through the air part of slope tiles until the feet meet the surface. Both are tuning flags, so the feel pass can A/B them.
  - Where a slope meets flat ground or solid, the surfaces must be continuous by construction. The bake rejects discontinuous chains, e.g. a 45R top that doesn't meet the next tile's top.
- **Hazards:** no spikes on slopes (a lint error).
- **One-way slopes:** not in v1.
- **Other actors.**
  - Enemies, levied objects and shots share one helper, `feetSurfaceAt` / `pointSolid`.
  - Walker ledge detection must count a slope as ground. Otherwise a Barker turns round at the top of every ramp.
  - Shots hit the solid part of a slope tile (a point below the surface).

### 3.4 Impact on the rest of the system

| System | Impact of A (skin only) | Impact of B (slopes) |
|---|---|---|
| Controller | None | `moveX` step-up, ground stick, ground probe, dash flag. Allocation-free and closure-free on the per-pixel path (movement-controller.md performance rule). |
| Exact tests (V03–V05, V22 mirror) | None | Must stay bit-identical in rooms without slopes: the slope branch only runs when a feet-column tile is a slope. `mirrorRoomFile` swaps the L/R slope chars. Add V-tests for slopes: a walk up/down at every speed has no airborne frames; mirrored runs are identical. |
| Tapes / goldens | None | Existing rooms have no slopes, so hashes shouldn't change. The sim build stamp will change, so any mismatch reports "older build", which makes it diagnosable. Add gym-15 "Slopes" with claims plus a bot tape. |
| Bot | None | `botKey` is unchanged. The flow field treats slope cells as passable. Macros are unchanged. Search cost rises only slightly. |
| Progression validator | Must scale to big rooms (below) | Flood fill: slope cells are passable. Ledge probes: a slope top counts as ground. `reach-table.json` assumes flat take-off, so the lint measures rises from the actual take-off pixel. |
| Enemies / levied / shots | None | Shared surface helper; walker edge detection |
| Render | Skin (§4) | The skin draws the slope surface; the lit rim follows the heightfield |
| Determinism | None | Integer table lookups only. The bake may use floats, because its output is committed data that `check` verifies. But keep it to integer or rational maths anyway, so the freshness check can't flip on a V8 `Math.sin` change. |

**Big rooms and the validator (needed with A as well).**
- Today the oracle asks spawn → target questions per room, and the bot does best-first search through the room.
- A 180 × 51-tile room makes exhaustive "without" proofs far more expensive: a 6 × 9-tile pit already costs about 250k nodes to exhaust (progression.md).
- Add `Anchor` entities, i.e. waypoints on the critical path and at each gate's two sides.
- The compiler turns them into `spawn:<name>` targets, and the oracle queries anchor → anchor with `region` bounds.
- This keeps every search local, gives tapes short readable legs, and lets the probes start from real places instead of guessed ledges.

## 4. Set-dressing and landmarks without art assets

### 4.1 Procedural terrain skins (render-only, code-drawn)

- **Contour, not tiles.**
  - Run marching squares over the Collision field, at twice the tile resolution so corners can be rounded, to get outline polylines. Smooth them (Chaikin, 2 iterations), then displace them along the normal with seeded 1D value noise keyed by world position.
  - Fill with the existing depth shading from `terrain.ts`.
  - This alone makes rectangles look like masonry or rock.
  - Everything is precomputed once per room into a mesh or render texture in chunks. The sim never sees it.
- **Honesty rules** (the HK contract):
  1. **Walkable tops are exact.** Top edges with air above that you can stand on get at most ±2 px of displacement and never rise above the collision line. The lit rim stays on the true surface.
  2. **Walls and ceilings may be ragged**, up to 12 px into air and any amount into solid.
  3. **Overhangs** (lips, roots, cornices, hanging chains) may cover air only above head height relative to the floor below, and never over a landing spot on a critical path.
  4. **Foreground masses** hang from the top or sit at the screen edges, never over spikes (the existing gym-12 rule).
  5. A render test samples every walkable top in every room and checks the skin's mask against the collision.
- **Materials.**
  - A `Material` IntGrid layer, painted by brushes (`material` field), picks the edge treatment:
    - brick: stepped courses, occasional missing bricks;
    - rock: noise contour, strata lines;
    - timber: planks, posts at spans;
    - iron: rivets, straight edges with bevels;
    - vault: large smooth arcs;
    - soil.
  - Each material has a rim style, a surface pattern, a depth gradient and a lip set. That's about 6 materials at roughly half a day each.
- **Silhouette at scale.** For big chambers, the backdrop's mid layer gets **cutout silhouettes derived from the room's own geometry**: its negative space, offset and scaled. Distant arches and pillars then echo the chamber you're in instead of generic city blocks.

### 4.2 Placeable props and occluders

`Prop` and `Landmark` entities refer to **code-drawn prop definitions** in `content/props/*.json`: parameterised Pixi Graphics recipes, zero art.

- **Prop kit v1**, about 20 items:
  - Tallage furniture: ledgers, cash registers, scales, auction lamps, ticker boards, strongroom doors, dumbwaiter cages, pawn tags, bunting, chains, pipes, gantries, crates, tally-stick fences.
  - Each is a function of `(size, seed, palette)` with a few bool options.
- **Layers:** `back` (behind terrain, dimmed), `mid` (with the terrain, non-colliding), `front` (occluder, blurred and darkened, parallax 1.1–1.3).
- **Occluders:** an `Occluder` rect entity lets the author choose a *specific* foreground mass. Today's density slider becomes filler only.
- **Per-region palettes:** these already exist (the 4 districts). Add per-level overrides for lighting temperature and fog, and a region LUT (PLAN §4.3 step 6).

### 4.3 Avoiding the "randomly generated" feel

- **Authored landmarks, procedural filler.**
  - The rule of the pipeline: anything the player should *remember or navigate by* is placed by hand as a `Landmark` entity, with a name, and listed in `toc` so the map and the north star can count them.
  - Noise and density only fill the space between landmarks.
- **Landmark classes:**
  - **Beacon:** a big, lit silhouette seen from several rooms away, like the Tally's ticker board or a foundry chimney. It is drawn in the far or mid backdrop of *neighbouring* rooms too, at its true world position, which the world coordinates make possible.
  - **Waymark:** a unique mid-size prop at a junction, like a giant scale beam or a broken chandelier.
  - **Set piece:** a composed vignette with its own camera zone.
  - Spacing targets come from the teardowns. A working guess (estimated) is one waymark per junction and one beacon visible per 2–3 screens of travel.
- **Seeds are content.** Every procedural choice is keyed by (level id, brush or prop id). Moving one brush never re-rolls another room, and `seed` fields can be pinned when a result looks right.
- **Motifs per region, not per room.** Each region gets a shape language: arches in the Bourse, verticals in the Foundry. It's set by allowed materials, prop subsets and silhouette rules, not by per-room randomness.
- **Hero composition check.** The screenshot review, part of the Phase W cohesion pass, asks: from each rest and each junction, can you see a landmark, and is it one you've seen before?

## 5. Camera for big rooms

The existing pipeline (dual forward focus → platform snap/fall follow → look → zone blend → clamp → shake) is sound. See camera.md for the blend-basis lesson. What big rooms need:

1. **Zoom** (render-only).
   - `view = 1920 × 1080 / zoom`. All clamps and zones are computed in world px with the zoomed view size, and the blend offset is measured on the same basis (camera.md).
   - Range 0.75–1.15.
   - Readability floor: the player stays ≥ 60 px tall on a 1080p canvas (**derived**: 80 × 0.75).
   - Changes ease over about 40–60 frames and are capped per frame like `zoneBlendMaxPx`.
   - The backdrop render textures are baked with a 1/0.75 margin.
   - Fill-rate cost at zoom 0.75 is about 1.8× the terrain and light-map area (**derived**: 1/0.75²), so the low tier caps zoom at 0.9.
2. **Zone modes to add:**
   - `frame`: bias the target toward a point by a weight (0–1) without locking. For "show the landmark as you walk toward it" and for keeping a gate and its key on one screen (world-design §6.3).
   - `vista`: one-shot. On first entry per visit, blend to a framing (point + zoom), hold N frames while input stays live, then release. The Ori-style reveal of a big chamber. Never repeated on backtrack unless flagged.
   - `zoom` as an optional field on every zone. Boss arenas: `lock` + 0.9. Big chambers: `bounds` + 0.85.
3. **Vertical travel:**
   - The existing fall follow, plus `clampX` shafts.
   - Add an upward lead when vy is below −12 for spring and shout rides (B8, "design for the camera").
4. **Speed-scaled lookahead** for Slip and Skip chains: lead grows with |vx|, capped. The current effective lead at full run is about 136 px, which is short for 12-tile Slip gaps (landing visible at take-off).
5. **Bounds from the world, not the room.** With neighbour peek (§6), clamp to the room but allow a `bleed` of up to N px past an edge that has an open exit, so the next room's terrain shows as you approach.
6. **Authoring aids:**
   - The world PNG draws every zone and the 1920 × 1080 / zoom view rectangle at each anchor.
   - A lint warns when a critical-path landing is out of view at take-off (world-design §6.3), using the reach table and camera tuning.

Estimated effort: 2–3 agent-days, all render-side, with unit tests in the style of the existing camera tests (C1–C5).

## 6. Room streaming and transitions

**Now (one loop).**
- **Edge exits.**
  - The compiler finds openings on each level's border, pairs them with the neighbour's matching openings through GridVania coordinates (a lint error when they don't align), and emits `exits: [{side, from, to, room, dx, dy}]`.
  - In the sim, the outside of the room counts as air along an exit's span. When the body's centre crosses the edge, start a transition that keeps `vx`, `vy` and the facing, and places the body at the same world position in the new room.
  - Fade 8–12 frames. HK's cut-to-black is a few tenths of a second (estimated). Ours is already 10 frames.
  - The player keeps control on arrival, with at most 4 frames of input grace, and the coyote timer is kept, so running jumps across a boundary work.
  - Tapes may cross rooms; the tape `expect` can already assert `room`.
- **Up-doors** stay for real doors, lifts and the dumbwaiter, with `to` as an EntityRef.
- **Neighbour peek (render-only).**
  - Draw each open neighbour's terrain skin and backdrop outside the room bounds, positioned by world coordinates, dimmed slightly.
  - Combined with the camera `bleed`, the edge of a room shows the next room instead of black solid. That makes most of the difference between "disjointed rooms" and "a place", for about a day's work.
- **Prefetch.** Rooms are small JSON and the skin is baked per room. Bake the neighbours' skins during the fade-in or idle frames, so a transition never hitches. Budget: skin bake ≤ 4 ms per 30 × 17 chunk (to be measured).
- **Chunked terrain rendering.** Rooms up to 8 × 4 screens (240 × 68 tiles) are drawn as 32 × 17-tile chunks with view culling, because a single Graphics for a whole big room will hurt draw calls and GPU memory. The light-map and bloom passes are view-sized, so they don't scale with room size.

**Later (only if the blockout playtest asks for it).**
- A **merged region space**: the compiler concatenates a region's levels into one sim room, and the levels become camera `bounds` sections and "reset sections".
- Pros: truly seamless, like Ori.
- Cons:
  - Enemies and gates need section-scoped resets (HK resets a room's enemies when you re-enter it, and that is a pacing tool, not a bug).
  - Enemies need sleep radii.
  - The validator's per-room model becomes per-section.
- Physics cost doesn't grow with room size (tile lookups are O(1)), so it's feasible. But it's a design decision, not a tooling one. Defer it to the north star.

## 7. Phased plan

Estimates are in **agent-days**: one focused agent session of a few hours, including tests and an in-game check.

### Phase T1: unblock the region blockout (one loop, three parallel streams)

**Stream A: world pipeline (critical path).**
| # | Build | Est. |
|---|---|---|
| A1 | `tools/world/ldtk.ts`: load/save, deterministic ids, a Zod schema for our subset, a test against the official LDtk JSON Schema (vendored). A project skeleton `content/world/tallage.ldtk` (GridVania 1920 × 1088, IntGrid values, entity and enum defs, `externalLevels`). | 1.5 |
| A2 | The brush bake (fill, rect, poly, blob, tunnel, shaft, arch, ledges, oneway, ramp-as-stairs, stamp), `Paint` overrides, post-passes, freshness check. Room sheet import/export. | 2 |
| A3 | Compiler → `RoomFile` (auto chars) + `world.json`. Register `content/world/rooms` in `content.ts`. **The first step: with A1–A3 an agent can block out a region and play it through Up-doors.** | 1 |
| A4 | Edge exits in the sim (openings, momentum-keeping transition, arrival grace). Progression `world.ts` reads `exits`. Sim-adapter `exit:<side>` targets. Tapes across a boundary. | 1.5 |
| A5 | `world png` / `ascii` viewers. Lint: edge matching, sizes, critical-path metrics against the reach table, landing-in-view. | 1.5 |
| A6 | `Anchor` entities → spawns; region-bounded anchor-to-anchor oracle queries | 1 |

**Stream B: render (parallel after A1 defines the layers).**
| # | Build | Est. |
|---|---|---|
| B1 | Contour skin v1 (marching squares, smoothing, seeded displacement, the honesty rules and their render test), 3 materials (brick, rock, timber), chunked terrain | 3 |
| B2 | Camera zoom, `frame`, `vista`, per-zone zoom, speed-scaled lookahead, bleed | 2.5 |
| B3 | Neighbour peek rendering + skin prefetch | 1 |
| B4 | Prop kit v1 (about 10 props), `Landmark`/`Prop`/`Occluder`/`Light` entities → dressing JSON | 2 |

**Stream C: slopes (sim; independent of A and B until the bake emits slope tiles).**
| # | Build | Est. |
|---|---|---|
| C1 | Slope tiles, surface tables, feet sensor, step-up and ground stick, ground probe, mirror swap. The exact V-tests stay green; new slope V-tests. | 2.5 |
| C2 | Enemies/levied/shots surface helper, bot flow field, progression fill and probes, gym-15 "Slopes" room + claims + tape, the feel report on slopes | 2 |
| C3 | The bake emits slopes: the `ramp` brush and the `curve` brush (spline → 45°/1:2/flat chain), with a continuity lint | 1 |

Totals: A ≈ 8.5, B ≈ 8.5, C ≈ 5.5 agent-days. Run in parallel, the loop is about 9–10 agent-days of wall-clock work, with A1–A3 (≈ 4.5) as the critical path. **A region blockout can start once A1–A3 land**, even before A4 (use Up-doors), B (the current skin) or C (stairs instead of slopes).

### Phase T2: after the first blockout and playtest
- More materials and props, beacon landmarks drawn in neighbouring rooms' backdrops, per-region LUTs.
- `RoomFile` v2 (an entity list instead of chars) if char allocation or char-based plate–gate linking gets in the way.
- A small in-game "nudge" editor overlay: drag brushes and entities, write back through the Vite dev server. Only if the user wants to edit by hand.
- The merged region space (§6), only if the north star asks for Ori-style seamlessness.
- A 32 px collision grid, only if skinned 64 px geometry still reads as blocky at the taste checkpoint. It costs about 4× flow-field cells, and the spike hitboxes and metrics tables would need re-expressing.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| LDtk JSON written by our library is rejected or mangled by the editor (uids, editor-internal field values) | Medium | Official-schema test in `check`. A human opens the project once at the first taste checkpoint. The runtime never depends on LDtk, only on the compiled `RoomFile`. |
| Editor saves make noisy diffs, or a human paints the generated layer | Medium | Separate level files. The freshness check fails loudly. `Collision` is marked "generated" in its layer doc, and hand edits go in `Paint`. |
| Parallel agents collide on the project file (`defs`, `toc`) | Medium | Defs change rarely (one owner per loop). Level files are per-agent. The toc is regenerated by the bake, not hand-edited. |
| Big rooms make bot proofs and progression too slow for `check` | High without A6 | Anchors plus region-bounded queries. The cache (keyed on the compiled room hash) already exists. |
| The skin lies about collision (players jump at a painted ledge) | Medium | Honesty rules plus an automated mask test, and the blind novice playtest watches for it. |
| Slopes break exact movement tests or tapes | Low–Medium | The slope branch is only reachable on slope tiles. Run the V-tests and every committed replay in tests/replays before merging. Tuning flags allow A/B. |
| Procedural filler reads as "generated" | Medium | Authored landmarks as first-class entities, region motifs, pinned seeds, a screenshot review from every junction. |
| Size without content: big empty rooms | High | Not a tooling risk as such. The north star's density targets (enemies, secrets and landmarks per screen from the teardowns) become lint warnings in A5. |
| LDtk development stalls | Low impact | Only the file format is used. The sheet + bake + compiler also work without the editor. |

## 8. Sources

- LDtk JSON format and schema (version 1.5.3; `worldLayout`, `externalLevels`, `toc`, `__neighbours` dirs, layer types, EntityRef, `Array<Point>`): <https://ldtk.io/json/>, <https://ldtk.io/files/MINIMAL_JSON_SCHEMA.json>
- LDtk 1.5 release notes (automatic rule sizes up to 9 × 9, auto-layer performance): <https://github.com/deepnight/ldtk/releases/tag/v1.5.0>, <https://gamefromscratch.com/ldtk-1-5-released/>
- LDtk custom commands (run on load, before save or after save; trust prompt): <https://ldtk.io/docs/>, <https://cammin.github.io/LDtkToUnity/documentation/Installation/topic_StartupGuide.html>
- LDtk overview and docs: <https://ldtk.io/>
- Actor/Solid integer physics: Maddy Thorson, "Celeste and TowerFall Physics": <https://maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html>
- Tile slopes with a foot sensor, step-up and ground stick: Rodrigo Monteiro, "The guide to implementing 2D platformers": <http://higherorderfun.com/blog/2012/05/20/the-guide-to-implementing-2d-platformers/>; Sonic Physics Guide (sensors, heightmaps): <https://info.sonicretro.org/Sonic_Physics_Guide>
- Tiled worlds, terrain sets, scripting: <https://doc.mapeditor.org/en/stable/manual/worlds/>, <https://doc.mapeditor.org/en/stable/manual/terrain/>, <https://doc.mapeditor.org/en/stable/reference/scripting/>
- Our numbers: `content/gym/*.json` (measured, 2026-09-28), `src/sim/world/rooms.ts`, `src/sim/physics/aabb.ts`, `src/sim/player/player.ts`, `src/render/camera/tuning.ts`, `docs/design/world-design.md` §4.2 and §6, memory files `gym-rooms.md`, `camera.md`, `progression.md`, `bot.md`, `render-pipeline.md`.
- Hollow Knight and Ori construction details (collider style, camera lock areas, spline terrain) are general knowledge, labelled estimated. The parallel teardowns (`docs/research/teardown-*.md`) should confirm or correct them.
