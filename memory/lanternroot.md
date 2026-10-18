# Lanternroot: prototype level 1, level + sim + solver (2026-10-18)

The brief: docs/design/levels/proto-1.md (this is its build list (a)). Render, sound and the combat picture are
memory/lanternroot-art.md. The economy: memory/glow.md. The new rules: memory/lures.md "Moonwicks", memory/level-kit.md
"Lanternroot's pieces", memory/bosses.md "The Gloamweaver".

## Open it
- `?world=proto-1`: the whole level from the night's spawn, its own save slot (`lampfall.save.proto-1`; `?fresh`).
- `?room=lr-night` / `lr-hall` / `lr-roots` / `lr-cache`: a test boot in that room, still in its world (exits lead on).
  `__game.goto('lr-roots', 2880, 1300)`, `__game.grant('kindle', 'gust')`, `__game.glow(18)` for spot checks.

## The rooms (tools/levels/lanternroot.ts generates them: edit it, never the JSON)
World `content/worlds/proto-1.json`: night (0, 0), hall (0, 1536), roots (0, 3072), cache (7680, 0). Each layer room is
5760 x 1536 = three 1920 chambers (camera zones locked, `frames` 20; the arena its own 1792 x 1080 zone). Exits
(spans equal both sides): split 1088..1344 (night <-> hall, climb back up its faces), knot 2624..2880 (night -> hall,
a floor bark panel), chimney 5056..5312 (hall <-> night, the silk curtain on `curtain-open`), hole 576..832 (hall ->
roots), stair 1408..1664 (roots <-> hall: up by the moss), seal 2944..3200 (hall -> arena on `seal-open`), shaft
4480..4736 (hall <-> cistern on `shaft-open`; a trigger at the column's top sets it from below), the cache door
(night 3720 <-> cache, behind a gate on `answer`). Kit `glide, wallJump, doubleJump` everywhere; `kindle` from the
pit's glade, `gust` from the arena's (`when: gloam-down`).
| chamber | what is where (x) |
|---|---|
| A1 crown | the log (seal 340, H1 Long Breath, S1), patch 500, spawn 620, M-a1 800 on a stone (moss to the crow's nest 440..680 @420, entered only from below), juvenile, the split, the thorn gully and L-a1 1480 (the first fling) |
| B1 trunk | L-b1c 2120, the knot panel, the bramble crown 2860..3160 (L-b1a/b, Gust only) on the stub 3160..3260, hawker, the ember run L-er1..5 (3280..3620) to a moon-drop on the stub, the cap 3500, the cache knot 3672 |
| C1 plate | sheer to the sky (`ceilingY` 0): the crest @300 only from the chimney; the chute west (its lid opens from above), patch, S4, the valley trigger |
| A2 split | the split's columns + bracket, the pit, the stone shelf (0..420 @520) by L-a2c..e (up, up, up-left), dangler, juveniles, the bark pocket 1700 |
| B2 hub | M-s1 2250 (low), fungus shelves 2280..3720 (the first out of a double jump's reach: the fling off M-s1), M-s2 3600 @650 + dangler, the seal 2944..3200, patch 3330, the loft over it (enclosed, entered from below at 3400..3480: moss lit by M-s2), six warm lamps |
| C2 gallery | the shaft pit 4250..4950 (M-c1 4130, M-c2 5030, hawker, moss down to the gate), the vault (S1 3860, W1 4180 with a window 568..632, L0, S2 4300..4500, W2 4560, L1/L2/L3 steps, S3 4720 + the vault 4860..4980), the alcove chain L-c2a..c to a bark hoard, the chimney columns 4992 / 5312, the grille 5640 in its thorn crown |
| A3 pit | floor 1350, the Kindle glade 120..320, patch 440, juveniles, three pods, S2, M-a3 1500 and the moss stair, M-a3b (keep) 1760 @770 |
| B3 arena | the Gloamweaver (hub 2880, 640; orb 520), M-w1/M-w4 low ledges @1060 (their moss to the high ledges), M-w2 2520 / M-w3 3240 @610 (the high pair), spiderlings, two pods, the Gust glade, the east door |
| C3 cistern | the pool 4300..5200, the root column 4400..4816 up to the shaft, danglers, the burrback (radius 134) and the heartwood 5480 under a root shelf (5500..5760 @1150), H3 (moon-drop) and S3 in the tunnel |
| cache | six moonwicks on glass shelves round the firefly-lamp (80 moths), Bright Kindle on 1120..1320 @400 |

## The graph and the solver (tools/levels/lanternroot-graph.ts, tools/solve/)
- Places are `marks.places`; `EDGES` (with `needs`, `flags`, `light`, `lamps`, `proof`) and `ARRIVALS`; the generator
  writes them as `routes` (validateWorld's coarse check), the solver proves them.
- `explore.ts`: BFS (or by time) over standing states in the real sim, edges = macros (walks, hops, jumps, double
  jumps, glides, wall climbs, drops, flings off every flame in reach with 5 aims and chains, gust taps / the hop,
  pogos, cuts, kindles standing and in the air). Node key: x bin 32 + top + the room's light (moonwicks, `sets`
  lamps, moss, bark broken, flags). Warm lamps burn for ever in a search (`keepLamps`: a superset of reach).
  `npx tsx tools/solve/explore-cli.ts <room> x y [--abilities ..] [--flags ..] [--path x,y] [--goalflag f]`.
- `proto-1.ts`: every edge from its place with its kit, every other warm lamp spent: the explorer's line (macro
  names) or a driver; `--write` stores them in `proto-1-tapes.json` (the tests replay them: refresh after a layout
  change); `--locks` / `--lock=<id>` the skip-hunter; progression, softlocks (every lamp spent), fuel.
- `drivers.ts`: vault (fan M-g1 through W1's window), answer (gust the brambles, strike `-..-`), ram, gloam (the whole
  fight, every creature in, glow earned). Their inputs are stored run-length under `driver:<name>`.
- Tests: proto-1-solve (world, every line, every driver tape, progression, softlocks, fuel), proto-1-locks (the
  skip-hunter, slow), proto-1-puzzles (shy flyers, lamps only Gust reaches, crossings, upgrades), light, gloam.

## Results (2026-10-18)
- `npm run solve`: all 61 edge proofs found (each line replayed in the tests), the 4 drivers win (vault ~9 s from the
  gallery floor with exactly 18 glow; the Answer; the ram; the Gloamweaver ~66 s, every creature in, glow earned),
  progression Kindle > Gust with every place and find reached, no softlock with every lamp spent, every moonwick has
  renewable fuel. `npm run solve -- --locks` (budget 2500): all 9 locks held (pit, nest, loft without Kindle; the
  crest only by the chimney; curtain, brambles, vault without Gust; H3 without the ram; the cistern before the boss).
  The tests run the hunts at 400 nodes (three files, ~35 s).
- Known: the vault's 5 s clock is judged by the explorer, which is slower than a human: a very fast player may light
  all three without the fan (a knob: the vault wicks' `burn`). The cache's Bright Kindle shelf is reachable by its
  glass shelves without kindling (the cache is behind the Answer anyway). The crow's nest wants the moss (held at
  2500 nodes); the explorer never tries creatures as stepping stones (pogo off a juvenile).

## Gotchas (each cost a round)
- **A face that takes a climb must reach down to where she stands** (within her height): a face ending over her head
  is never met, a held direction carries her under it (the split's and the chimney's columns, the root column).
- **A gap between a shelf and a wall must be >= 48 px** to fall through; a shelf over the ground she climbs from is a
  ceiling (the vault's S2 / L0, S3 / L1 were both).
- **Anything that must be entered only one way needs walls and a roof**: a fling + double jump + glide carries ~1800
  px (the nest, the loft and the crest were all reached from across the room until enclosed / sealed).
- One button: a tap near a cold bud kindles, near a burning flame flings (glow.md).
- The step-ram needs the beetle's `radius` (its range's end is the face) and no roof 1 px past the face.
- The explorer is slower than a human (macros wait to settle): it proves reach, not that a clock is unbeatable.
- Thorn crowns that hide a lamp from the blade must reach 155 px sideways, 145 below and 120 above the flame (a
  forward cut reaches 135 from her centre, keen blade +20 on the flame box).
