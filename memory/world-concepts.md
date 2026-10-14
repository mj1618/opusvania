# World mood frames (`/world-concepts.html`)

Five still 1920x1080 mood pieces for the "overgrown ruin" world (docs/art-direction.md), built before the game
commits to it. Separate from the game: `src/world-concepts/` imports only the Umber skin, `sim/player` (to make a
player state) and `scene/lib/look.ts` (prng, wind). Nothing in the game imports it; Vite builds only `index.html`.

## Run and capture
- Dev server on 5180: `http://localhost:5180/world-concepts.html`. Keys 1-5 switch; `?frame=N`; `?clean` hides the
  caption; `?t=6` steps render time from 0 to 6 s in 1/60 s steps and freezes there (same picture every time).
- `window.__wc = { frame, ready, show(n) }`. Capture: `playwright-cli -s=world resize 1920 1080`, goto
  `?frame=N&t=6&clean`, wait for `__wc.ready`, screenshot. All four run at 60 fps live.
- Shots: `shots/world-concepts/{1-street,2-edge,3-lamp,4-lab}.png`, `sheet.png`, and a breath pair
  (`1-street-breath-out/in.png`, t = 6.4 and 8.96).

## What each frame tests
1. **The kept street**: can a human street read as swallowed but cared for? Bus shelter with a case on the bench,
   a lightbox full of folded tissue, a queue of standing cases on the far kerb, cases hung like fruit from a root
   slung between buildings, the folded mountain on the horizon. Everything the Hush owns breathes on one rhythm.
2. **The edge**: the signature transition in one look: left the Grove's language pushed amber (wind in ferns and
   grass, glints, shafts), right bone-pale and still (no wind, spores that do not drift); the line runs down one tree.
3. **The last lamp**: the one neon-ish moment: a dead city dark to the sky, one sodium lamp, a moth swarm, root drawn
   back from its pool of light, Umber gliding in. Warm and small, not cyberpunk.
4. **The lab**: straight lines softened by tissue, cold light only (dish, screen), the cracked dish with its grey
   cloud and a handprint on the dusty lid; the sign, the poster, the screen's bat-and-ball, her case on its chair.

## How it is built (reusable if the game adopts the look)
- `lib/compose.ts` Composer: depth `Plane`s (layer.ts: one filter per plane does ambient, up to 8 screen-space point
  lights, value mottle, fog by amount + vertical ramp, optional split look left/right of an x band, blur), shader
  planes (plane.ts + bodies.ts: sky, split sky, folded mountain, fog with a light inside, steam, beams, shafts,
  dish cloud, CRT), `TissueBatch` strips (tissue.ts), mote fields (air.ts), Umber (hero.ts), a grade (post.ts:
  scene to RT, two bloom blurs added, one grade pass).
- **Breath** (`lib/time.ts`, 6.4 s, in 40% / out 60%) drives tissue swell, a ripple that travels along every root,
  pod and mountain glow, steam. Keep pod lights low: at full breath they blew out brighter than Umber.
- **Tissue strips**: kinds 0 root, 1 folded tissue, 2 pod membrane, 3 bark (does not breathe), 4 stalk/tube. A
  regular `sin` crease along a strip reads as a candy-stripe rope: creases must come from ridged noise.
- **Hanging root**: tapered strands read as icicles/stalactites. `kit.curtain` makes sagging loops plus strands with
  round tips; loops need span > sag or they read as handles.
- **Umber in a still**: `Hero` drives the real vesper skin with a hand-made `PlayerState` (standing on a fake floor,
  or `gliding` with nothing below) and settles 150 steps before the first picture.
- The folded mountain (`MOUNTAIN` body: lobes + warped ridged noise lit from a core) doubles as the lab ceiling.

## Pass 2 (2026-10-14): what changed and what worked
- Shots: `shots/world-concepts/pass2/` (five frames, `pass1-vs-pass2.png`, `street-two-scales.png`,
  `sheet-with-grove.png`). Pass 1 stays in `shots/world-concepts/` for comparison. Frame 5 (key 5) is the kept street
  at moth scale (`frames/moth.ts`). All five still run 60 fps live.
- **Plane filter (layer.ts) gained what makes cut-outs read as painted:** `edge` (8+8 alpha samples: fog creeps in at
  the silhouette, cores darken), `rim` / `rimDir` (key rim on edges facing it), `rimLights` (each scene light rims the
  edges facing it: the lamp, the dish, Umber), `brush` (value noise stretched along a wandering direction: strokes,
  not mottle) and `paint` (Kuwahara radius, a separate filter). Splitting a frame's flanks into their own planes so
  each gets a rim toward the corridor was the single biggest win on the lamp.
- **Ruins (lib/ruin.ts):** `ruin()` = lean, sag, stepped bites with hanging floor slabs and rods, roof clutter, peaks,
  hand-cut window quads (bricked / broken / lit); `windowGlows` (breathing case light behind lit windows), `drape`
  (fold riding a decimated roofline + pours), `grip` (fat root column over a corner so the rectangle is lost).
  Window grids still read "vector" up close: keep them in fog, let lights find only a few.
- **Tissue shader:** two-value lit/shadow with a noisy terminator, cool shadows, light through thin parts (`sss`),
  sheen only on noise peaks. Pattern frequencies are capped (`hs = min(hw, 22)`) or giant strips grow wood grain.
  Ridged-noise creases on roots read as topographic contour lines: keep root creases faint (0.14).
- **Big organic forms want shaders, not strips:** `CASE` (membrane, inner glow, sleeper silhouette as soft ellipses,
  branching veins, optional torn hole and bottom fade) for the giant case and the lab's dome; `MOUNTAIN` reused for
  the lightbox's packed tissue, the lab pedestal and lobes sagging from the ceiling. Glowing things go in their own
  plane (an `amb` multiply in a dark plane killed the case's glow).
- **The maker under silk:** the `SHROUD` height-field shader read as balloons / an armchair; a hand-drawn hunched
  silhouette (`smoothPath`), horizontal value gradient toward the dish, a few wide fold strokes, in a plane with
  `paint: 4` and light blur reads as a person under a sheet. `SHROUD` is kept in bodies.ts but unused.
- **Bottom thirds:** roots crossing a road toward the camera in perspective (thin at the kerb, fat at the frame's foot)
  plus `REFLECT` (wet streaks of each light) fill the ground band and lead the eye in; used in street, lamp, edge.
- Failed: crumpled strips in the lightbox (fingers), finger lobes round the dome base (a crown of candles), tapered
  stalks under a ledge (icicles), many short tributaries (worms), wood-grain on giant pods.

## Pass 3 (2026-10-14): what changed and what worked
- Shots: `shots/world-concepts/pass3/` (five frames, `pass2-vs-pass3.png`, `sheet-with-grove.png`, and
  `{1-street,4-lab,5-moth-street}-vs-grove.png`). Session `-s=world3`; capture = goto `?frame=N&t=6&clean`, wait
  for `__wc.ready`, screenshot (a zsh loop with `set -- $f` does not split: call each frame explicitly).
- **Ground in true perspective (`PAVE` in bodies.ts):** world coords from screen (eye height 1, focal 900, the
  street rotated so its vanishing point sits at x 1430). Voronoi stones (radius jittered, not all cells, or it
  reads as polka dots), air pits, lichen rosettes with a lobed bright rim, ridged-noise cracks, slab joints with
  moss spilling out, a speckled granite kerb stone, a lip highlight; a cut rectangle (`uP8`) for what stands in
  front. The same body with eye 2.5 and `side -1` paints the road far below the kerb (worn yellow line).
  `toScreen(wx, wy, z)` / `toWorld` in moth.ts place grains, moss stalks (setae + capsules: a forest at moth
  scale), rootlets (a random walk in world space, so it foreshortens) and the leaf (a 3D sheet: curl, droop past
  the edge, shadow clamped to the kerb).
- **A cliff needs its face toward the camera.** From on the pavement the kerb's face points away: it reads as a
  table edge. Put the camera a little out over the road (kerb line W.x = -0.9): the face becomes a wedge from the
  vanishing point, strata fanned toward it, roots pouring down it, then hide its foot in a luminous fog bank so the
  depth is unknown. The fog must be brighter than the plateau so the edge silhouettes against it.
- **Luminous volumes are what the Grove has and the ruins lacked:** `SHAFTS` (additive) under the lattice bench
  in the case's pink, with lit dust motes; a glowing fog bank with wisps and `STEAM` rising off it. Push grade
  contrast (1.14) and saturation (1.18) and darken the mid planes so the lights carry.
- **Life:** `lib/moths.ts` (small moths circling a light, pure function of t), a firefly with a trail (the one
  other warm source), a beetle on the leaf, a dandelion seed, a spider thread with dew, glinting quartz grains.
- **Wear (`lib/wear.ts`):** `rust` (patch, pit, chalky paint loss, a run), `streaks`, `beads` (condensation).
  Thin lighter "paint flakes" over rust patches read as rows of tiny hammers: dropped.
- **DOME (bodies.ts) for the lab:** lumpy outline (low noise on the angle), ribs from ridged noise along the angle
  (regular, they read as a scallop shell; a fibre texture keyed to the angle does the same), thin glowing membrane
  between ribs, pink in the creases, torn lip lit. A few sagging fibres across the tear (many straight ones read as
  wheel spokes).
- **The maker reads as a person** when: the silk ends at the seat so the chair legs show; the back humps, dips at
  the neck and the hooded head bumps forward lower than the shoulders; a bare hand (the `hand()` used for the
  print) reaches out of a sleeve toward the dish; the figure is darker than the window behind and rim-lit by the
  dish (`rimLights` 2.2, `lit` 0.5). A light ellipse on the hood read as a helmet ring.
- **Street:** a rooftop row with chimneys and aerials against the mountain; swallowed cars (side-view saloon,
  wheel arches, flat tyres, root draped via a fake `Ruin`) with a sleeper's case glowing pink in the driver's
  window; bollards, a bin; the shelter roof sags, posts lean with rust from the feet, the stop's roundel faded
  pink; the lamp leans with a base and a door; the frame-5 jar and leaf lie under the bench at human scale.
- Failed: runs of the case's tissue down the bench lip (candles again: use `drape` lobes instead), root straps
  over the case (stood up like stakes), a bite out of the kerb to show a face (a table with a notch).
- Pixi v8 warns on `Graphics.addChild` (Graphics is a leaf): draw into the Graphics or use a Container.

## Honest state after pass 3
Moth street (5) is near the Grove's level: dense at many depths, two warm lights, pink shafts, a fog bank, framing
blades; weakest are the case (a flat pink shape) and the jar (still a little graphic). The street (1) has colour and
a full mid-ground now but its lower third is empty road and the sling's cases stay grey. The lab (4) tells its
story at a glance (dome of flesh, the maker reaching) but stays monochrome and sparse by design; below the Grove in
richness. Edge (2) and lamp (3) unchanged from pass 2.
