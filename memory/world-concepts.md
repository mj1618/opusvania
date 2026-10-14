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

## Honest state after pass 2
Edge is at the Grove's level (5 planes, amber rims, a filled ground band). The lamp is close (soft corridor of
towers, rimmed flanks, reflection). The lab now tells the midpoint (HEARTH sign, dish under its torn dome with the
handprint, the maker hunched under silk, coat, torch, unopened jars) but the silk figure is still a sheet-ghost and
the dome a bubble. The street has a value hierarchy now (pink mountain glow, Umber the warm light) but its near props
(shelter, lamp post) are still clean vector. The moth-scale street proves the idea (jar cave, bench ledge, case as a
building, rivers, kerb drop into fog) but its plain, bench and glass are the flattest surfaces in the set.
