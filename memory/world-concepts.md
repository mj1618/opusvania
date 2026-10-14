# World mood frames (`/world-concepts.html`)

Four still 1920x1080 mood pieces for the "overgrown ruin" world (docs/art-direction.md), built before the game
commits to it. Separate from the game: `src/world-concepts/` imports only the Umber skin, `sim/player` (to make a
player state) and `scene/lib/look.ts` (prng, wind). Nothing in the game imports it; Vite builds only `index.html`.

## Run and capture
- Dev server on 5180: `http://localhost:5180/world-concepts.html`. Keys 1-4 switch; `?frame=N`; `?clean` hides the
  caption; `?t=6` steps render time from 0 to 6 s in 1/60 s steps and freezes there (same picture every time).
- `window.__wc = { frame, ready, show(n) }`. Capture: `playwright-cli -s=world resize 1920 1080`, goto
  `?frame=N&t=6&clean`, wait for `__wc.ready`, screenshot. All four run at 60 fps live.
- Shots: `shots/world-concepts/{1-street,2-edge,3-lamp,4-lab}.png`, `sheet.png`, and a breath pair
  (`1-street-breath-out/in.png`, t = 6.4 and 8.96).

## What each frame tests
1. **The kept street**: can a human street read as swallowed but cared for? Bus shelter with a case on the bench,
   a lightbox full of folded tissue, a queue of standing cases on the far kerb, cases hung like fruit from a root
   slung between buildings, the folded mountain on the horizon. Everything the Mouth owns breathes on one rhythm.
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

## Honest state (2026-10-14)
Edge and last lamp are the strongest. The street reads but its middle band is thin and the buildings flat. The lab
tells its story (handprint legible at 1080p) but its props still look like rubbery CG rather than painted.
