# Lanternroot: the painted level (render, combat picture, sound), 2026-10-18

The brief is `docs/design/levels/proto-1.md` (§8 art, §6 combat, build list (b)). The level agent owns the rooms
(`content/rooms/lr-*.json`, `content/worlds/proto-1.json`), the sim (glow, moonwicks, moss, gust, bells, the
Gloamweaver) and `src/scene/`; this is the render / sound side. Boot a room with `?room=lr-hall` (or `lr-night`,
`lr-roots`, `lr-cache`), the whole level with `?world=proto-1`.

## How it plugs in
- **The kit**: `art: {kit: 'lanternroot', band: 'night' | 'hall' | 'roots' | 'cache', seed}`. `room-look.ts`
  reads `band` (`LOOK.band`), `isLantern()`, `isInterior()` (every band but night). Hall / cache key light is warm
  amber, the roots' a thin cold moon, no sky moon inside.
- **Modules** (`scene/index.ts modulesFor`): night = the wood's six modules + `LanternPieces`; inside the giant =
  `LanternBackLayer` (replaces sky, far, mid) + `PlayfieldLayer` + `LanternPieces` (no wood foreground / air).
- **Playfield** (`layers/playfield.ts`): a Lanternroot room paints with `lr-terrain.ts`, bakes with
  `LANTERN_BAKE[band]` (pf-bake's lit relief), lays `lr-rim.ts`'s live rim and grows `lr-flora.ts`.
- **Post**: `LANTERN_GRADE[band]` / `LANTERN_POST` (post/config.ts) inside the giant; the night keeps WOOD_GRADE.
  `uGoalLook.w` = 1 in Lanternroot: a pixel already brighter than the lit-surface cap keeps its value under its own
  point light (without it every lamp's core went grey-green: the cap pulled it to 0.43 luma). 0 elsewhere.
- **Enemies** (`enemies/index.ts`): in Lanternroot the hawker is drawn on the lampwing's art and the juvenile on the
  burrback's rig scaled 0.72 about its feet (`Painter.scaleFrom`). Other rooms unchanged (gated on `isLantern()`).
- **`SimView.light`** (contract.ts `LightView`, read loosely in stage.ts): the sim's `state.light` (moss, bells,
  gust...). Everything new from the level's sim (`player.glow`, `.mend`, `lures.burn`, light events, `boss.ux`) is
  read through casts so render builds against HEAD with or without it.
- The test grove and wood-hatch render pixel-identical (every wide stop diffed against HEAD before each commit).

## The terrain painter (lr-terrain.ts): any rects, four materials
- An 8 px grid of the static solids; each rect is its own polygon, pushed 14 px under a neighbour (no seams),
  roughened where it meets air: tops 2 px (the lit lip stays on the collision to its edge), faces a 5 px lip
  overhang then -rf..+4 (she must never seem to stand in the paint), undersides in lumps; corners open on both
  sides rounded (7 px on top, up to 44 underneath).
- HK's cave rule: the silhouette is the shape, the material lives in a band along open edges (stepped dark insets
  toward `bodyDeep` inside; bands of value, fibres along faces, splinters a few px out). Hall: fibre strata under
  tops. Night: moonlit bark plates along the log under every top. Roots: twisted root cords near the top.
- **Small rects alone in the air (h <= 72, not touching anything) are shelves**: a bracket fungus (hall, cache), a
  root rung (roots), a snapped stub (night), hung from the solid above on roots / silk (`hangers`). One-ways too.
  A floating slab read as a brick; a hung shelf reads as a place.
- `lanternTops(room)` gives the exposed tops for pieces that lie on them (the roots' water).
- Weak: big blocks still read as blocks from far off (rect collision); the edge band carries it close up.

## The backdrops inside the giant (lr-back.ts, layers/lantern-back.ts)
- Composed in layer coords, baked by bg-bake's atmosphere pass (`lanternAtm`, `lanternFog`), `LayerView` for mist.
- Hall far2: the hollow's far wall as long fibres with the grain, splits, silver moon cracks (live shimmer), warm
  light along the lamp band. Hall mid: heartwood columns flared at floor and vault, fibre curtains, small dead
  brackets, old webs with moths. Roots: descending root masses (far), big wet roots and rootlet curtains (mid).
- **Live pools**: behind every burning lamp the wall glows (a soft add sprite on far2 and mid placed at
  `px - (1 - f)(cam - anchor)`): put a lamp out and its patch of wall goes dark, so the hall shows progress.
  `LR_BACK.pool` (radius 380 / 260, alpha 0.16 / 0.1): at 0.32 the whole hall was an orange fog.

## The pieces (render/lantern/)
- `lamps.ts`: Physalis calyx lamps glowing from inside (edge darkest, 7 soft steps to a hot middle, ribs, sepals, an
  additive heart in `glowMid`), silk up to the solid above (or fading into the dark), circling moths (front / back
  of the loop), embers (dull red, smoke), lace husks that sway when they go out; the snuff: flash, torn paper
  scraps, freed moths that burst then stream to the nearest `marks.moonholes` point (H1's tell) or up. Moonwicks:
  glass buds on a knob of root/stone or silk; cold frost and a rare glint; kindled bloom, cool flame, light 420;
  gutter flicker from `lures.burn` < 120; fan / refuse / cold fx. The fling's aim: a ring of light, a wedge, the arc
  as fading sparks. Point lights: the 9 nearest burning lamps (`lr-lamp-<i>`).
- `kit.ts`: bark (plates, fungus skin, one crack per cut taken, shake), heartwood (close rings, sheen, ram scars at
  beetle height, splinters), brambles (arching canes from the foot, hooked thorns: a sine lattice read as a fence),
  curtains / seals that fall when their gate opens, covers (near-black root mass over her, thinning while she is
  inside, gone once their `opens` bark breaks), signs (a sunk slab, a carved firefly and its phrase, flashing it on
  the sim's clock while she is near), the bell-cap (gill rings lit per `light.bells[i].n`), moon patches, glades,
  hollows (shaft + token until `upgrade:<id>`), doors, moth-stones, bounce caps, seed-cases, moonmoss (lichen
  scars cold; lit shelf with a silver lip and glow, eased).
- `creatures.ts`: one spider painter (abdomen up with a pale chevron pattern, head down, eight jointed legs,
  eyes that kindle red on the tell) for danglers (thread, tell line to the drop point, splay on the drop, trail on
  the swing, belly-up when cut down), spiderlings (`fight`/`respawn`: 0.62 size, paler), webs (strands sag with
  length, dew), and the Gloamweaver (x3.3; P1 dark shield = only eyes and leg glints; P2 tell arc in glinting silk +
  an ember wash on the floor band; hanging open on its thread; exposed belly-up pale with a glow; silk doors).
- `fx.ts`: on `slashHit` a white-gold flash where the blade met it, a bright cut line across it, sparks the way
  the cut went; kill: a ring and motes in the creature's colour; `glowGain`: sparks streak from the blow into her;
  clangs (cold star; heartwood duller with chips), wall sparks, bark chips / spore puffs / a break's shower, her hurt
  star, kindle's pour of light into the bud, mend's motes drawn in, the gust's crescent with motes. Her aura: a cool
  point light `lr-aura`, reach 140 -> 260 with glow (only in `scene.glow` rooms).
- `water.ts`: the roots' still water on every floor lower than the room's height - 280: dark body over her shins
  (`playfieldFront`), a breathing surface line, drifting glints, rings off steps and landings, glints under lights.
- `fore.ts` (inside the giant only): near-black blurred masses at the frame's top / bottom edges on the foreground
  layer (1.35), locked to the view vertically, withdrawn from the middle third AND from wherever she is near that
  edge (without the second rule a bottom mass hid her when the camera clamped at a room edge); dust motes lit warm
  near a burning lamp, cool near her.
- `vista.ts`: where the night room marks a `vista` landmark, a hazy range under the moon with snow on its moonlit
  side and the valley's lamp field twinkling below, near screen-fixed over the far composite (far2 hosts it), fading
  in as the camera comes east and up. Weak: the wood's mid giants still stand in front of it at the crest.
- HUD `hud/glow.ts`: glass beads under the health lights, one per pip (3 sparks), filling in thirds; flash on a
  filled pip, a ring when full. Only in glow rooms.

## Sound (src/audio/bake-lr.ts, route-lr.ts; muted by default)
- Her light is glass and air, the firefly's lamps are the hum (route-play). glowChime (pitched up the chord by fill,
  `AUDIO.lr.glowCents`), glowBell when full, kindle (rubbed glass + a blooming bowl + air), kindleRefuse, gutter ticks
  that quicken over the gutter, wickCold, fan, mossOn / mossOff shimmer (one per step), gust whump, gustHit,
  bellChime (pitched per ring), bellDull, bellAnswer (chord), signNote (the signs' phrase, `signNotes` on the sim
  clock: kit.ts `phraseLit` and route-lr `PHRASE` must agree), mendDraw / mendLand. Beds `BEDS['lr-*']`.
  Moonwicks are left out of the lamp hum. Levels in `AUDIO.lr`; a hall fight measured -24.9 LUFS, -4.2 dBTP.

## Shots and what is weak (2026-10-18, end of round 1)
- `shots/lanternroot/<1920x1080|2560x1080|1440x1080>/<room>/wide-*.png` (gitignored; `npm run shots -- --room lr-hall
  --only=wide --pickups --size WxH`). Every shape is covered, no bars.
- Weak: big rect blocks still read as blocks from afar; the roots are very dark (by design, but the walk's rim is
  thin there); the vista is mostly hidden by the wood's mid giants; bramble crowns read a little like willows;
  the snuff's moth burst is small for a wick (the sim's moth count); spiderlings and the boss's P3 wrap of the
  Gloam lamp are simple; no map hollows yet (P2); the cache is the hall's look plus garlands, no firefly-lamp
  centrepiece yet.

## Dev loop (what worked)
- The shared tree is mid-edit by the level agent: iterate in a private worktree mirrored from it (`rsync src/
  content/`) with its own vite on another port (5180 is the orchestrator's), and shoot with a scratch script
  (`?room=<id>&manual`, teleport, step, tick, screenshot). `__game.boss({phase: n})` sets up a boss phase.
- Commit only render / audio paths; verify each commit on a clean worktree of HEAD with the files copied in
  (typecheck, lint, unit, e2e) and diff the grove's and the hatch's wide stops against HEAD.
- zsh does not split `$FILES`: write such loops in bash scripts.
