# Lampfall: look and sound

Draft 1, 2026-10-17; §1.3, §2, §4, §5, §6 and §7 rescoped 2026-10-18 for an Ori-length game (five regions split
into 14 areas, 12 abilities, four kinds of find; `world.md` §2, `core.md` §4 and §6). How five regions and their
14 areas look and sound distinct and Ori/HK-grade without building each one by hand.
Builds on `core.md` (pillars, lamp kinds), `world.md` (regions, rooms, tiers) and `tech.md` (rooms, region kits as
modules plus per-room `art` data). The quality bar and the Grove's rules stay in `docs/art-direction.md` and the
`memory/` notes. This doc changes the light language and adds what new regions need. The Grove is the proof of
quality: its pipeline carries forward, but its Grove-only numbers don't. Big calls are in §8 with recommendations,
and the doc assumes the recommendation until Matt answers.

## 1. Visual language

### 1.1 Two lights, never confused
The story's contrast is the picture's contrast. Every light in the game is one of these, and the player can tell
which from **hue, height, shape and motion**, never from hue alone.

| | **The moon (real, safe)** | **The lamps (false, danger)** |
|---|---|---|
| Hue | cool silver-blue: core `#dce8f6`, light `#9fbfe0`, fill `#5f84b0` | the firefly's gold: core `#fff1c8` going white-hot, body `#ffc35a`, haze `#ff8f3a` going to `#a8421e` at the edge |
| Where | high, far, from above; one direction per room | low, close, at her height, a point you can fly into |
| Shape | broad and soft: slanted shafts, pools of light on moss, rim light on edges facing up | a hard bright core, a round falloff that **ends at the pull radius**, a swarm in orbit |
| Motion | slow breathing, about 5 s, the way the Grove's shafts move today | too steady: no wind response; a hungry slow throb; flickers switch on a beat |
| Feeling | rest, the way home, power (glades and moon patches are moonlight) | pull, speed, predators, death (husks of dead moths under it) |

Rules:
- **Warm is reserved.** Inside the playfield, nothing is warm except lamps and the lamp-lit things near them
  (rims, moths, predators' eyes). No warm shafts, no golden wells, no warm glow plants. Warm sky glow exists only as
  a dim afterglow at the horizon of the far layers in the wood (§2), and it is gone by the valley.
- **Dark is not black.** "Dark is safe" means moonlit low key, not void: shadows stay in the teal-indigo family,
  and the mist stage behind the walk line (memory/background-layers.md) stays in every region, tinted by the moon.
- **Snuffing turns warm to cool.** When a lamp goes out its gold collapses into the core, a ring of darkness spreads
  out to the old pull radius (the reverse of today's `goal/wake.ts`), and the moonlight underneath shows (a local
  cool lift, 1–2 s). The husk keeps a faint grey-blue ember so the room still reads.
- **Region progress is the night clearing** (core.md): one uniform per region drives star density, sky depth and
  the moon's brightness, plus a slight cooling of the grade. Nothing else is re-painted.

### 1.2 Light hierarchy (brightest first)
1. **Lamp cores**: the only place for white-hot sparks in the world (post's `grade.spark`). They are the next thing
   to look at, which the gameplay wants.
2. **Wing's eyes and face**: as now (memory/character-vesper.md: dark figure, pale soft face, gold eyes).
3. **Moon patches and glades**: the brightest *areas*, never points.
4. **Bioluminescence**: cyan-white and the rare violet, small and dim (`glowGain` stays low). Cool, so it is on
   the moon's side, but never in shafts and never large.
5. **Moths**: dusky, about 60% value; lamp-warmed on the lamp side while trapped, cooled by the moon once free.

### 1.3 Readability
| What | Rule |
|---|---|
| Hero | Dark silhouette against a paler stage (the existing rule). Her 1.5 px dark outline stays. In lamp light she gets a warm rim on the lamp side only, so the player sees where the pull comes from on her body |
| Path | Platform tops keep the highest local contrast: a moon-silver moss rim (cool), turning warm inside a lamp's light. Background shapes never look like platforms (unchanged) |
| Pull radius | **The warm light's falloff ends at R.** If it is lit gold, it pulls; where gold ends, the pull ends. Backed up by air motes that spiral inward inside R (the mote shader evaluates the lamp field, still stateless) and by grass and leaves leaning toward the flame (bend field). No rings or UI. A faint ring can be an assist option |
| Catch core | The white-hot core's visible radius is the catch radius |
| Threats | Predators hunt in the light, so they are backlit: a dark body with a warm rim on the lamp side and eyes that catch the gold. Tells are a **value** change (a pale flash or a pale edge), not a hue change. Never cyan, because cyan is friendly |
| Hazards | Thorns are dark with pale tips; water is black with moon glints. A hazard never glows warm |
| Glass lamps | A gold core inside a cool glassy shell with a hard specular highlight; trapped moths drawn inside (world.md Q4) |
| Terrain toys (rescoped 2026-10-18) | Each new toy reads by **shape and value first**, and none glows warm. **Bounce caps** are dark mushroom caps with a moon-silver rim and a springy squash, never glowing, so they never read as a glow-cap wick. **Crumbling and crust surfaces** are rotten bark's language: pale cracks that widen (crumbling bark on a timer, crusts under a Fold). **Frost faces** carry a white-blue sheen and glints, distinct from the kickable stone faces. **Briar curtains** are thorns (dark with pale tips) hung in strands, so they read as thorns first and as passable only once Shadow dash teaches it. **Wind and updrafts** show as streaks, blown seeds or spindrift moving with the field's direction and period, the same way motes show a pull |
| Finds (rescoped 2026-10-18) | **Moth-stones** are carved stone, moonlit (cool), with a moth in relief. **Firefly signs** are things it hung and left, drawn cold like a husk (grey-blue, no glow) so warm stays reserved for lamps; when she stands still beside one it plays its rhythm once in a dim, small gold with no pull, then goes cold again. **Moonlit hollows** are small moon shafts (a glade, smaller), hidden but leaking a sliver of silver light |
| Her new moves | **Gust** is a pale cool ripple of air, never warm, that bends motes and snuffs a flame on contact. **Fold** is a dark dart with a pale streak and an impact ring. **Shadow dash** is a shrouded dash: her eyes the only light, a smear of dark |

### 1.4 Moths en masse (performance)
Moths are the reward and the completion count, so there will be many on screen. They are **not rigged and not CPU
sprites** (today's 5-moth flock in `air.ts` moves on the CPU and would not scale).

| Piece | How | Budget |
|---|---|---|
| A lamp's swarm | One instanced mesh per room. Each moth is a quad, and its wing flap is a vertex shader warp. Its orbit is a pure function of (seed, id, clock, lamp position and R), like today's motes: no CPU per moth | 20–60 per lamp; ≤ 400 on screen |
| A freed swarm | Event-driven (lamp id, count, position). 3–5 **leaders** on springs follow Wing's recent path, which render keeps in a ring buffer. Followers are leader plus seeded noise offsets, in the shader. After about 6 s the leaders move to the room's `migration` polyline and the swarm thins as it goes | ≤ 300 extra on screen; CPU ~0.05 ms |
| Colour shift | Each moth carries `freedAt`: lamp-warmed while it circles, easing to moon-cooled over ~2 s once free. The visible meaning of "free" is warm to cool | free |
| Dead moths | A few dark husks baked into the playfield under each lamp, removed when it is snuffed | free |
| The ending ceiling | Thousands of sleeping moths: baked once into a texture, plus a few hundred live ones that settle | one sprite |
| LOD | Moths in far layers are dots. Above budget, followers merge into leaders' "clouds" (one soft sprite with a few live moths on the edge) | — |

Target for all moths: ≤ 0.3 ms GPU at 4K and ≤ 0.1 ms CPU (tech.md's frame budget leaves room for this).

## 2. Region kits and their areas (rescoped 2026-10-18)

Each region is one kit module (tech.md §2.4). What changes between regions, in order of how much it changes the
picture: **palette and moon colour, the background plan's shapes, the playfield's material and species, the air's
particles, signature props and lamp housings, post grade.** The time of night deepens along the road, so the five
regions differ even in silhouette: dusk, early night, foggy deep night, clear cold night, then underground.

Every lamp burns the same firefly gold whatever its housing. Housings are what change per region: the firefly hangs
"every glowing thing it can find".

| | **Wood** (T1) | **Valley of lamps** (T1) | **Marsh** (T2) | **Pass** (T2) | **Cave** (T3) |
|---|---|---|---|---|---|
| Night | blue hour into dusk; a dim warm afterglow at the far horizon only | early night, a big low moon over the bowl | deep night, moon diffused by fog | clear, cold, the moon at its largest, dense stars | none: black, then the firefly's blaze |
| Palette (shadow / body / moon / accent) | teal-indigo / emerald moss / silver-teal / cyan glow caps (the Grove's left glade, made the norm) | blue-violet / dusk olive and straw (grass seen from below) / pale blue / violet seed heads | black-green / olive and bronze / green-silver / sickly marsh-gas green-gold (a drifter's lamp) | slate-indigo / lichen grey-green, frost / white-blue / frost glints | warm rock browns (lit) or blue-black (dark) / wet stone / none / the firefly's gold everywhere |
| Key shapes | trunks wider than the screen, roots as bridges, ferns as trees, mushrooms as buildings (moth scale) | tall vertical stems, grass blades as a forest, seed heads, thistle crowns, open sky, one dead roost tree | horizontal: still water, reed walls, drowned snags, hanging moss, mud banks | big wind-cut rock, steep faces, sparse alpine grass, cornices | rock folds, stalactites, the ceiling (where moths sleep), the mouth framing the sky |
| Signature props | hollow oak (hub), carved moth-stone, cocoons, the pool | Chinese-lantern seed pods (Physalis) as lamps, silk threads, the roost tree, dew on blades | lily pads, bubble and amber-resin lamps (glass), will-o'-wisp drifters, the bridge (bats) | the beacon (a dead tree hung with lights), cairn-like stones, wind streamers of silk | the collection: every lamp kind hung everywhere; the sleeping ceiling |
| Particles | spores (replacing fireflies: §8 Q5), motes in moon shafts, falling leaves, ground mist | wind-driven seeds and fluff along the grass wave, pollen | thick mist banks, midges, gas bubbles, rain rings on water | wind streaks, blown frost, spindrift off cornices | dust, drips, embers drifting up from the collection |
| Light | moon shafts through canopy gaps; wicks and lanterns | open moonlight from one side; many lamps in view at once (the region's name) | fog as a light carrier: every lamp a big soft volume; moon a smeared disc | hard moon rim on every rock edge; few, big lamps | in the dark, only freed moths and husks; in the blaze, warm is the ambient for the one time in the game |
| Mood references | Ori BF Sunken Glades and Hollow Grove at night; HK Greenpath; Ori WotW Silent Woods | Ori BF Valley of the Wind; HK Howling Cliffs for scale and open sky; Gris for one colour per place | Ori BF Thornfelt Swamp; Ori WotW Inkwater Marsh and Luma Pools; HK Fog Canyon and Queen's Gardens | Ori BF Sorrow Pass; Ori WotW Baur's Reach; HK Crystal Peak's verticality | HK Crystal Peak and Resting Grounds; Ori BF Moon Grotto; Ori WotW Mouldwood Depths (light vs dark) |
| Background plan | `buildForest` as is | **new** `buildMeadow`: stems, blades, seed heads (re-uses `clump`, `taper`, the sway mesh) | `buildForest` sparse (snags) + **new** reed walls (sway mesh strips) | **new** `buildCrags`: big rock masses from `paintRock` at background scale, with snow caps | **new** cave backdrop: rock walls in place of sky (a variant of `buildCrags`), the mouth as the only sky |
| Playfield material | moss and earth (today) | soil, grass sea, stems as climbable faces | mud, wide water (generalise `pf-water.ts` from a pool to a water band), reeds | rock and frost (kick faces in stone exist: `paintClimbFace`) | wet stone; the collection painted as props |
| New painters | re-key (§3); bounce caps, crumbling bark | meadow plan, grass-sea species, seed-pod lamp housing, roost tree, seed wheels, thistledown, lantern chains | reed species, water band, crusts, drifter and glass housings, fog volumes, the bridge | crags, snow caps, wind streak particles, frost faces, updrafts, beacon (L) and its beam | cave backdrop, briar and glow-worm curtains, ceiling with moths, blaze grade |

**Vistas and the mountain.** One shared `vista` painter draws the mountain under the moon: a fixed seeded ridge so
it is always the same mountain, with a distance parameter per region (scale, haze, how much moonlit snow shows). It
appears only in vista rooms and on the camera lift after a snuff (core.md), as an extra far layer behind far0. It
never needs to be in view elsewhere. Underground, the moths are the wayfinding.

### 2.1 Areas inside a kit (rescoped 2026-10-18)

The rescope splits each region into two or three areas of 30–50 minutes (`world.md` §2.2), and G7 asks every area
for a picture a player can name. **The kit stays per region, not per area** (`world.md` §4.1): an area is a set of
**mood records** in its kit (the per-room `art.moods` stops, tech.md §2.4), one or two **landmark painters**, and the
props of its signature toy. An area never gets its own palette or background plan; it moves inside its region's
along three axes: **height** (floor, canopy, crown, sky), **openness** (enclosed, a clearing, the open sky) and
**how lit** (dark galleries, a few lamps, a lamp field). The night still deepens region by region, not area by area.

| # | Area | Mood inside the kit | The picture to name (G7) | Landmarks and props | New painters (beyond the kit) |
|---|---|---|---|---|---|
| 1 | wood floor | the forest floor in blue hour: trunks wider than the screen, moon shafts through canopy gaps | "the hollow oak", "the well" | the cocoon branch, the hollow oak hub, the well, the grate, the moth-stone on the cap stair | bounce caps (a cap species with a rim and squash) |
| 2 | high wood | up in the boughs at the canopy line: more sky, more moon, branches as bridges; the web hall heavy with wings | "the web hall", "the knot", "the canopy edge" | the knot (a great burl hollow, the hub), the web hall, the grove's clearing ringed by trunks, the canopy edge where the first open moonlight falls | crumbling bark (rotten bark's painter on a crack timer); the great lamp (wood variant) |
| 3 | rim | the bowl seen whole from its lip: open sky, the lamp field below, grass-stem faces | "the rim" | the arrival vista, lantern chains, Physalis seed-pod lamps, the fling pit | lantern chains (strands), seed-pod housing, flicker housing |
| 4 | roost | the crossroads in the bowl: three loops around one dead tree | "the roost tree" | the dead roost tree (climbed whole as set piece 8), seed wheels, thistledown rafts on wind paths, Tatter's lamp | the roost tree (L), seed wheels, thistledown |
| 5 | bright floor | under the great lamp: the brightest place before the cave, warm close and cool far | "the bright floor" | the great lamp, the mantis's wing-littered perch, lantern rings | the great lamp (valley variant) |
| 6 | reedbeds | low, wet, horizontal: reed walls and open water in fog | "the reedbeds" | lily pads, crust floors, drifter lamps, the fog wall where the chase ends | water band, reed walls, crusts, fog volumes |
| 7 | fen | the drowned wood: dead snags out of black water, fog banks, the darkest so far | "the meadow" | sunken logs, glass and ember housings, the empty meadow (husks, the firefly-shaped lamp) | glass and ember housings, the meadow (S) |
| 8 | bridge | the span over black water, the colony's dark beneath it; then the drowned roots | "the bridge", "the drowned roots" | the bridge, the roost of bats, glass lamps hung below; the roots' shafts (the wood kit's roots, drowned and darker) | the bridge (M), rising black water |
| 9 | scree | open slopes under the largest moon, wind-cut rock, cairns | "the storm crossing" | cairns, falling scree, ice, the saddle in the storm | wind-field streaks, scree, ice |
| 10 | cliffs | vertical faces, cornices, updraft columns; the coldest and emptiest | "the cliffs" | frost faces, cornices, Tatter's empty patches | frost-face material, updraft spindrift |
| 11 | beacon | the crag under the beacon, lit by its beam | "the beacon" | the beacon (a dead tree hung with lights), swinging arms, the sweeping beam | the beacon (L), the beam (a moving light volume) |
| 12 | cave mouth | dark galleries; the last moonlight through a crack in the roof | "the crack of moonlight" | the wall-less face below the mouth, briar curtains, glow-worm curtains, drips, the ceiling stains | briar curtains, glow-worm curtains |
| 13 | cave of lights | the blaze: warm is the ambient, once | "the cave of lights" | the collection hung everywhere, the Bat-eater's ceiling | the blaze grade |
| 14 | home | the collection's nest, then black, then the mouth's view | "home" | the firefly's nest, the sleeping ceiling, the mouth vista over the whole road | the ending ceiling, the journey vista |
| opt | canopy | above the trees in the open sky: the wood kit at its highest, crown seas below | "the canopy" | sky lamps, updrafts, the canopy's great wick | none (the wood kit's crown seas, `memory/background-layers.md`) |
| opt | underways | root tunnels under the valley: the wood's roots and the cave's dark | "the underways" | crusts, glass lamps, the old toad's flooded chamber | none (the wood kit's roots in its darkest mood, the same root shafts the drowned roots use) |

So the 16 areas cost about **ten landmark painters and twenty toy, housing or effect painters** beyond the five
kits, most of them S, against draft 1's five kits with 1–3 painters each. No area needs its own background plan;
both optional areas reuse what their neighbours' kits already have.

## 3. Shared pipeline work (so a new region is mostly data)

**Shared and already general:** the bake pipeline (`bg-bake.ts bakeLayer`, the atmosphere shader with `ATM` depth
objects, `LifeSpec`, `StageSpec`), `buildForest(plan)` and `bg-shapes.ts`, the sway mesh, the playfield's
rect-to-terrain rules (steps, kick walls, islands, bank fronts, clear spots: `pf-terrain.ts`, `pf-forms.ts`), the
albedo/relief bake (`pf-bake.ts`), the plant mesh and bend field, the air volumes (shafts, mist, motes), the
foreground's screen-aware composition, and the whole post stage. These carry every region.

**Grove-specific today** (tech.md §1 lists the scene, game and state items; these are the look items):

| What | Where | Change | Size |
|---|---|---|---|
| Palette and key light as globals; the key is warm | `scene/lib/look.ts` `PALETTE`, `KEY_LIGHT` (entry x 3400, `keyWarm`) | kit palette and a per-room moon (entry, direction, colour); warm moves to the lamp kit | S |
| Two copies of the zones, with different edges | `fx-zones.ts` `ZONE_EDGES` + `ZONE_GLSL`; `pf-shape.ts` `zoneAt` / `ZONES` (cool/warm/deep), also in the bake shader's `uZone` | one source: per-room mood stops (`art.moods`, tech.md) as uniforms. Every `[left, centre, right]` triple in `AIR`, `SKY`, `MID`, `ZONE_GRADE` becomes a mood record in the kit | M (mechanical, touches every layer) |
| The sun map | `pf-shape.ts` `sunAt`, copied as `sun` in the bake shader | driven by the room's moon entry and its canopy openings, not Grove constants | S |
| Hand-placed set dressing (~120 four-digit constants in mid and far alone) | `mid.ts` `MID` (`glowClusters`, `moonHole`, `shaftPendant`, `shaftTongue`, `quiet`, `bluffClear`, `wellX`), `HOLLOW`; `far.ts` `WATERFALL`, `ARCH`, `LOG`, `BIRDS`, `HANG`; `air.ts` `AIR.shafts.beams` | become `art.landmarks` and `art.shafts` entries, or are derived (below). Each fix that exists for one Grove camera stays Grove data | L (staged) |
| The mist stage mirrors `grove.json` by hand | `mid.ts` `STAGE` (`steps`, `ledges`, `walls`, `pools`) | derive steps and ledges from the room's rects (the `fx-ground.ts` profile exists); keep `pools` and `walls` as optional art data | M |
| Fight spots, islands, landmarks | `pf-terrain.ts` `FIGHT_SPOTS`; `pf-islands.ts` `ISLES` (seven islands by index); `pf-forms.ts` `paintLandmarks` (moth-stone, cocoons, shrine) | fight spots from enemy spawns (half done already); islands pick a style by seed from a kit list; landmarks by `art.landmarks` kind | M |
| Lights picked by Grove ids | `post/config.ts` `POST.lights.goalIds` (`lantern0..2`, `heart`) | a `lamp` priority class: lamps always get a light slot, their radius = R | S |
| Fireflies as ambience | `air.ts` `AIR.fireflies`, `mid.ts` `fireflies` | replace with cool spores (the firefly is the last of its kind) | S |
| Warm light well, amber sky bloom | `sky.ts` `SKY` (centre amber, left moon, right dusk), far/mid `wellX` | the sky gets a moon, stars and the progress uniform; the well becomes a moon opening | M |
| Wind is one function | `look.ts` `wind()` + its GLSL copies (sway, plants, motes, audio) | add a per-kit amplitude and gust scale (the pass and valley blow harder); one source still | S |

**The rule after the refactor:** a region kit is a TS module of data plus at most a few painters. A room is rects
plus `art {seed, moods, moon, landmarks, shafts}`. The Grove becomes `test-grove` on the wood kit, and its
hand-tuned fixes live in its own `art` block, not in shared code.

## 4. Character and creature animation at scale

- **Wing stays hand-built.** Her rig (`vesper/rig.ts`, generators cross-faded by weight, springs, 120 Hz chains) is
  the game's best asset. Each new ability is one new generator, or a variant of one (rescoped 2026-10-18 for twelve
  abilities): Gust's wingbeat (S, one sharp beat and a recoil), fling orbit and release (M), caught and beating free
  (S), Fold's dive (M, wings folded, a streak, a landing impact), Shroud as the same fold gone dark (S on Fold, wings
  wrapped, her eyes the only light), Soar's full-span glide (S, the glide's generator with a wider span and an
  updraft lift), Grip's cling and slow climb (M, claws on the face), Moonflight wingbeats (M, can reuse the glide's
  wing strands), Shadow dash (S, the dash generator with Shroud's look).
- **Creatures are built from templates, not from scratch.** The burrback is 2149 lines, which is too much per
  creature. Shared already: `character/math.ts` (springs, IK), `enemies/gait.ts` (a stateless tripod gait), the
  painter. Step one: merge `enemies/paint.ts` (a copy of Wing's painter) back into one shared painter (S). Then four
  body plans with parameters:

| Template | Built from | Creatures | Size |
|---|---|---|---|
| Walker (6 or 8 legs) | `gait.ts`, generalised to n legs | spiders (danglers too), beetles (the bombardier), the mantis's base (+ scythe arms) | M once, then S–M per creature |
| Flyer | Wing's wing strands and the lampwing's hover | dragonflies, bats, the firefly; birds (ravens, the nightjar) as a feathered variant | M once, then M for the bird |
| Hopper | squash-and-stretch jump generator | toads, frogs, the skink's dart (low and long) | S–M |
| Chain | `vesper/chain.ts` verlet | centipedes, leeches, silk lines, the beacon's hanging lights | S |

- Every creature is a pure function of sim state plus springs (as today), so any frame can be drawn from the state:
  screenshots and tapes stay reproducible.
- Each creature: one silhouette that reads as solid black at 64 px, one tell, its bespoke art in the head and tell.
- **Bosses** sit on templates but are L each (the mantis, the bats as an instanced swarm on the flyer template, the
  firefly). The lamp grove and the beacon are mostly environment plus lamp rows.

## 5. UI and HUD

The HUD sits outside post (as now), top left, small, and uses **only cool tones, except to mean lamps**.

| Element | Look | From today |
|---|---|---|
| Health | A row of small moon-drops: pale silver beads on fine filaments. Lost = an empty grey husk. Today's gutter, shake, swing and rekindle animation stays | re-skin `hud/lights.ts` (it draws warm lanterns, which would read as false lights). S |
| Moth count | A tiny moth glyph and a number that fades in on change and ticks with a small pop | the glint count's behaviour in `hud/index.ts`, new glyph. S |
| Map (pause) | A night sky, not parchment: rooms as dim silver-blue shapes, **burning lamps as warm points** (the to-do list), snuffed lamps as tiny cold husks, moon patches as silver crescents, Wing as a gold eye-mark, migration lines as faint moth trails. Rescoped 2026-10-18: at ~175 rooms it opens on her **area** and zooms out to the region and the road; an area whose moth-stone she has touched draws its unvisited rooms faint and shows its count of unseen lamps; collected firefly signs are a row of rhythm glyphs along the bottom; from Tier 2 the hub patches she has rested at are brighter crescents she can travel to | tech.md §4 map v1 supplies the data. M, then S for the stones, the glyphs and travel |
| Item line at a glade | One line, small caps, pale silver, low centre, fades; one button glyph in the same style. A moonlit hollow uses the same line without a glyph | `hud/prompts.ts`. S |
| Title | Over the moon at the opening (story.md) | S |

No boss name cards and no other text (core.md pillar 5).

## 6. Audio plan (muted until Matt approves the taste)

What exists (memory/audio.md, all muted): the Grove's ambience (wind from render's `wind()`, drips, the far voice,
the pool), Wing's movement sounds, the lantern bowls, and the old giving sounds. The Hush layer belongs to the
dropped story.

**The sound of the two lights.** The forest and the moon are in tune (just intonation, home D, the forest chord D A
E B). **The lamps are out of tune:** each hums a steady tone a few cents off the chord so it beats against it. This
re-uses the Hush's beating-tone voice and its rule "regular is the enemy".

| Moment | Sound |
|---|---|
| A lamp in the room | a faint, perfectly steady hum, beating; plus the swarm's wing flutter as grains panned in a circle with the orbit |
| Entering the pull | the hum rises, its low-pass opens as she nears, the world's own sounds duck slightly: being drawn in |
| Caught | the hum dominates, everything else muffled; her wingbeats on each beat-free press |
| Snuff | the hum's pitch falls over ~0.3 s into a soft glassy *pff*; a beat of silence; the forest swells back (the world low-pass opens): the dark blooming outward, in sound |
| Freed moths | a soft rising rush of many wings, panned as the swarm follows her, fading the way the migration line goes |
| Moon patch, glade | the forest chord in rubbed glass (today's lantern-bowl voices, re-aimed); a glade plays the full chord with Wing's motif |

**Per-region ambience**, all from today's voices plus a few new ones. Areas vary their region's bed the way they
vary its look (rescoped 2026-10-18): by density and distance (fewer hums in the rim's open air, the bright floor's
hums massed; the high wood's wind louder than the floor's; the bridge's colony rustle under the fen's still air), not
by new voices.

| Region | Bed | Signature |
|---|---|---|
| Wood | two-band wind, drips (exists) | the far owl-like voice (exists) |
| Valley | broad wind over a grass sea, heard as waves crossing | many lamp hums at once, out of tune with each other: the region's name heard |
| Marsh | still air, water lap, fog low-passes everything | a far frog chorus that goes silent near predators; gas bubbles |
| Pass | high wind whistling over rock, very large reverb | silence between gusts; the beacon's hum heard from far away |
| Cave | drips, huge reverb, near silence | the collection: every lamp hum at once, a dense out-of-tune chord. At the end, silence and one answering firefly tone |

**Music: sparse and adaptive.** No constant score; silence is the default. Music appears at vistas, glades, great
lamps and bosses. Each region has 2–3 layers (bed, Wing's plucked motif, tension) crossfaded by state: in the dark,
in a pull, in a fight. The six major bosses and the two escapes (the chase and the drowned roots) get the only
rhythmic pieces (L each; try one for the mantis first); mini-bosses and the other set pieces use their region's
tension layer (rescoped 2026-10-18).

**Build first:** (1) the lamp set (hum, pull, caught, snuff, freed moths) with the first lamp increment, M; (2) the
bowls re-aimed to moon patches, S; (3) retire the Hush layer and the giving sounds with their systems, S; (4) the
valley's ambience, M; (5) a vista and glade sting, M. Each step ends in an A/B clip for Matt
(`npm run clip -- --audio --ab`), as now.

## 7. Cost and order (rescoped 2026-10-18)

S = a day or less of agent work, M = a few days, L = a week or more. Tiers as in the README and `world.md` §4: Tier 1
= wood + valley (areas 1–5, ~55 rooms, ~3.5 h); Tier 2 = marsh + pass + the underways (areas 6–11, +81 rooms); Tier
3 = cave + the canopy (areas 12–14, +36 rooms). Art waits for each chunk to pass in greybox (`STUDIO.md`), so the
order inside a tier follows the chunks.

| # | Item | Size | Tier |
|---|---|---|---|
| 1 | **Re-key the Grove to the two-light language**: moon key, moon well, no warm shafts, spores instead of fireflies, cool HUD health | M | 1, first |
| 2 | **Lamp visuals**: one flame shader (core, falloff to R, flicker, throb) with housings for wick and lantern; snuff (dark bloom, husk); mote spiral; lamp light class in post | M, then S per kind | 1, with the first lamp increment |
| 3 | **Moth swarms**: instanced orbit, freed flight with leaders, migration line, warm-to-cool shift | M | 1, same increment |
| 4 | Lamp sound set | M | 1, same increment (muted) |
| 5 | Kit refactor: palette and moon per room, mood stops (one zone source), derived mist stage, set dressing as art data, Grove as `test-grove` | L, staged | 1, before room 2 |
| 6 | Wood kit polish across **~17 rooms** in two areas (the floor's 11, the high wood's 6): seeds, moods, 1–2 landmarks per room; the area moods (§2.1) | M + S per room | 1 |
| 7 | Wood toys and finds: bounce caps, crumbling bark, the moth-stone, firefly signs, the moonlit hollow (§1.3) | S each | 1, with the wood floor's chunk |
| 8 | Valley kit: `buildMeadow`, grass sea species, seed-pod lamps, flicker housing; the roost tree (L); seed wheels, thistledown, lantern chains; **~38 rooms** in three areas | L + L + S each | 1 |
| 9 | Great lamp (wood and valley variants) | L | 1 |
| 10 | Vista painter (the mountain) and sky stars plus the progress uniform | M + S | 1 |
| 11 | HUD moth count, item lines; map screen look with areas, moth-stones and the sign glyphs | S + M + S | 1 |
| 12 | Shared creature painter; walker and flyer templates; Tier 1 creatures (9 kinds, `creatures.md` §6) | S + 2M + S–M each | 1 |
| 13 | Wing: Gust, fling, caught | S + M + S | 1 |
| 14 | Wood and valley ambience, stings, the Weaver's and the Mantis's music, the chase | M + M + L + L + L | 1 |
| 15 | Marsh kit (reeds, water band, crusts, fog volumes, drifter, glass and ember housings, the bridge, rising water), the meadow, Fold's and Shroud's look, Soar's | L + M + S + M + S | 2 |
| 16 | Pass kit (crags, snow, wind streaks, frost faces, updrafts), the beacon and its beam, Grip's look, Moonflight's | L + L + M + M | 2 |
| 17 | The underways (the wood kit's roots in a dark mood, shared with the drowned roots) | M | 2 |
| 18 | Map: fast travel between hub patches | S | 2 |
| 19 | Marsh and pass ambience, the Colony's, the Beacon's and the drowned roots' music | M + M + L + L + L | 2 |
| 20 | Cave kit (backdrop, briar and glow-worm curtains, the blaze, the ending ceiling), the firefly, Shadow dash's look | L + S + L + L + L + S | 3 |
| 21 | The canopy (the wood kit at crown height, sky lamps) | S–M | 3 |
| 22 | Cave ambience, the Bat-eater's and the firefly's music, the ending | M + L + L + M | 3 |

Order inside Tier 1: 1 → 2–4 (the core verb, in the Grove, Matt plays it) → 5 → 6–7 per wood chunk → 8 → the rest
as rooms need them.

## 8. Easy-path choices and open questions

### Easy-path choices (made)
| Chose | Over | Why the payoff is the same |
|---|---|---|
| Light radius = pull radius | rings, arrows or a pull UI | The player reads the field from the light itself, which is also the story |
| One flame shader + per-region housings | bespoke lamps per region | The variety players notice is the housing and the place; the glow is the lamps' shared identity |
| Moths as a stateless instanced mesh with a few spring leaders | boids or per-moth AI | Hundreds on screen for ~0.3 ms; it looks like a swarm |
| Region look as kit data plus 1–3 new painters each | hand-painted rooms | HK's areas work the same way; variety comes from seeds, moods and landmarks |
| Areas as moods and landmarks inside their region's kit (rescoped 2026-10-18) | a kit per area | 14 nameable pictures from five kits; each area moves its region along height, openness and how lit |
| Time of night deepening along the road | five unrelated colour schemes | Each region is distinct by construction, and the road reads as a journey |
| Region progress as one uniform | re-arting "restored" rooms | The Gris effect from one parameter (core.md) |
| The mountain as one seeded vista painter | a mountain in every background | It is a reward view; one painter, five distances |
| Creature templates (walker, flyer, hopper, chain) | a 2000-line rig per creature | Same quality bar for the readable silhouette and tell; a third of the code |
| A HUD drawn in two cool tones plus gold for lamps | a decorative frame | Fits the low key; the map doubles as the to-do list |
| Detuned lamp hums against an in-tune world | a written score for every room | The rule is heard everywhere at almost no cost; music saved for the moments that matter |

### Open questions for Matt
1. **Re-key the Grove.** Its centre is a golden light well with warm shafts, which under the new language reads as
   "danger". *Recommend:* make it a moon well (silver-teal, like today's left glade), keep warm only at lamps, and
   keep a dim warm afterglow on the far horizon of the wood only. This changes the current proof-of-quality
   picture, so it should be shot and compared side by side before it lands.
2. **Night deepens along the road** (dusk, early night, fog, clear cold night, underground). *Recommend:* yes. It
   makes the regions distinct for free and fits the story.
3. **Wing's own light.** Her eyes are gold (an owner decision, keep it) and her point light `ember` and antenna tips
   are warm. *Recommend:* keep the gold eyes, shift her cast light and tips to a neutral pale silver-cream, so she
   never reads as a lamp; moonlit glades could brighten it a step each.
4. **Health as moon-drops** instead of warm lanterns. *Recommend:* yes (S, animation kept).
5. **Fireflies as ambient particles go** (the firefly is the last of its kind, so a cloud of them breaks the story).
   *Recommend:* replace them with cool drifting spores now. Small, but it touches the current look.
6. **The cave is the one warm region**: the firefly's blaze is the ambient light until the end, then black.
   *Recommend:* yes. The climax of the light language is the scariest-looking place being the warmest.
7. **Audio: retire the Hush and re-use its beating tone for the lamps;** music sparse and adaptive with silence as
   the default. *Recommend:* yes to both, all still muted until you approve a clip.
8. **Pull radius without UI** (light = pull, plus spiralling motes and the swarm). *Recommend:* yes, with an
   optional ring in the assist menu if playtests show players misjudge it.
