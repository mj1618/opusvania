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
(spans equal both sides): split 1088..1344 (night <-> hall, climb back up its faces), knot 1984..2240 (night -> hall,
a floor bark panel; moved west in round 1 so its drop lands nowhere near the seal), chimney 5056..5312 (hall <-> night, the silk curtain on `curtain-open`), hole 576..832 (hall ->
roots), stair 1408..1664 (roots <-> hall: up by the moss), seal 2944..3200 (hall -> arena on `seal-open`), shaft
4480..4736 (hall <-> cistern on `shaft-open`; a trigger at the column's top sets it from below), the cache door
(night 3720 <-> cache, behind a gate on `answer`). Kit `glide, wallJump, doubleJump` everywhere; `kindle` from the
pit's glade, `gust` from the arena's (`when: gloam-down`).
| chamber | what is where (x) |
|---|---|
| A1 crown | the log (seal 340, H1 Long Breath, S1), patch 500, spawn 620, M-a1 800 on a stone (moss to the crow's nest 440..680 @420, entered only from below; glints on the moss), juvenile (range kept off the patch), the split, the thorn gully and L-a1 1480: the crown end stands at 740, 560 over the lip with no kick (**the first fling is required**), a hawker over the landing, glints along the flight |
| B1 trunk | L-b1c 2120, the knot panel 1984..2240, two juveniles, the burl (a bark lid over 5 glints, 2700), M-b1 2440 and its moss ladder to the sky limb (8 glints: a Kindle revisit, or L-b1c's fling), the bramble crown 2860..3160 (L-b1a/b, Gust only) on the stub 3160..3260, hawker, the ember run L-er1..5 (3280..3620) to a moon-drop on the stub, the cap 3500, the cache knot 3672 |
| C1 plate | sheer to the sky (`ceilingY` 0): the crest @300 only from the chimney; the chute west (its lid opens from above), patch, S4, the valley trigger |
| A2 split | the split's columns + bracket, the pit, the stone shelf (0..420 @520) by L-a2c..e (up, up, up-left), dangler, juveniles (and one that wakes with Kindle on the west floor), pods, the bark pocket 1700 |
| B2 hub | five warm lamps west (two rows) and a glint line high in the vault, juveniles, the knot's drop at 2112; the root curtain 3000..3048 (100..1000: no warm lamp's flight comes round it high); **the seal**: M-s1 hangs at (3300, 1010), M-s2 at (3440, 560), the dangler under the loft; the loft H2 (Bright Kindle) over them, its door a mesh at 3400..3480 @200 right over M-s2; patch 3600; M-c1 3730 at the tunnel's mouth |
| C2 gallery | **the thorn tunnel** 3780..4480 (200 tall under the hub's east wall and the roof slab 3860..4480 @1060; thorns at 1340), the shaft's gate on its east mouth 4480..4736 @1300, M-c2 4560, the hawker over the landing; on the roof the vault (S1 3860, W1 4180 with a window 568..632 and 100 px under it, S2 4280..4500 over a root lattice with its one hole at W1's foot, W2 4560, L1/L2/L3 steps from the gallery floor, S3 4720 + the vault's moon-drop 4860..4980), the alcove (L-c2a or S1, a bark wall, a hoard), the chimney columns 4992 / 5312, the grille 5640 in its thorn crown |
| A3 pit | floor 1350, the Kindle glade 120..320 and patch 400 (quiet: nothing lives in the pit until Kindle), two juveniles that wake with Kindle (1040, 1300, ranges ≥ 500 off the patch), pods, S2; **the flue** 860..1180 (staggered moss lit by M-a3c 1230 outside it; a niche at its top behind silk held by L-flue, caged in thorns over it: gust it out; a moon-drop); M-a3 1500 (burn 4 s) and four moss steps to M-a3b's ledge (keep) 1730 @740, three more and a root knot in the stair's mouth |
| B3 arena | the Gloamweaver (hub 2880, 640; orb 520), M-w1/M-w4 low ledges @1060 (their moss to the high ledges), M-w2 2520 / M-w3 3240 @610 (the high pair), spiderlings, two pods, the Gust glade, the east door |
| C3 cistern | the pool 4300..5200, the root column 4400..4816 up to the shaft (glints up it), juveniles on the west bank, danglers, the burrback (radius 134) and the heartwood 5480 under a root shelf (5500..5760 @1150), H3 (moon-drop) and S3 in the tunnel |
| cache | six moonwicks on glass shelves round the firefly-lamp (80 moths), two danglers and a juvenile (shy in the ring's light), the glow vessel on 1120..1320 @400 (the Answer's reward) |

## The graph and the solver (tools/levels/lanternroot-graph.ts, tools/solve/)
- Places are `marks.places`; `EDGES` (with `needs`, `flags`, `light`, `lamps`, `creatures`, `proof`) and `ARRIVALS`;
  the generator writes them as `routes` (validateWorld's coarse check), the solver proves them.
- `explore.ts`: BFS (or by time) over standing states in the real sim, edges = macros (walks, hops, jumps, double
  jumps, glides, wall climbs, drops, flings off every flame in reach with 5 aims and chains, gust taps / the hop,
  pogos, cuts, kindles standing and in the air; `-k` flings kindle a cold bud met in the flight and fling on off it).
  Node key: x bin 32 + top + the room's light (moonwicks, `sets` lamps, moss, bark broken, flags). Warm lamps burn
  for ever in a search (`keepLamps`: a superset of reach). With `creatures` the creatures are in and any hurt ends a
  branch (a line that is proven is one that never gets hit).
  `npx tsx tools/solve/explore-cli.ts <room> x y [--abilities ..] [--flags ..] [--goalflag f]`.
- `proto-1.ts`: every edge from its place with its kit, every other warm lamp spent (the puzzle edges and the walks
  **with the creatures in**): the explorer's line (macro names) or a driver; `--write` stores them in
  `proto-1-tapes.json` (the tests replay them: refresh after a layout change); `--edge=<id>` one edge, `--part=<f>`
  writes only its lines to a part file and `--merge <parts>` folds parts in (run edges side by side: one process an
  edge); `--locks` / `--lock=<id>` the skip-hunter; progression, softlocks (every lamp spent), fuel.
- **Must-use locks** (`LOCKS[].stripLures`): the puzzle's own anchor taken out of the room and the goal must stay out
  of reach with every warm lamp burning for ever: `gully-without-the-fling` (L-a1), `seal-without-m-s1` (goal
  `lit:m-s2`), `tunnel-without-m-c1`. With the tool-held-back locks (pit, nest, loft without Kindle; crest only by the
  chimney; curtain, brambles, vault, flue without Gust; H3 without the ram; the cistern before the boss): 13.
- `drivers.ts`: vault (fan M-g1 through W1's window, then M-g2 from S3), answer (gust the brambles, strike `-..-`),
  ram, gloam (the whole fight, every creature in, glow earned: it kindles at a cold low wick as the spider comes,
  round its orb or in a lunge). Their inputs are stored run-length under `driver:<name>`.
- `tools/levels/density.ts`: the density lint (kinds in view and within 600 px from every standing spot, first visit
  and revisit; signs, exits, doors and gates are not kinds); tests/unit/proto-1-density.test.ts holds it at 80% / 70%.
- `npm run humanplay -- run --world proto-1`: the human-like runs in the level's own world (the exits connect); in a
  glow room they kindle a bud they stand by and mend when hurt and alone (tools/playtest/light-hands.ts). Gust is not
  taught.
- Tests: proto-1-solve (world, every line, every driver tape, progression, softlocks, fuel), proto-1-locks (the
  skip-hunter, slow), proto-1-puzzles (shy flyers, the puzzles' tools, lamps only Gust reaches, crossings, upgrades),
  proto-1-density, light, gloam.

## Results (fix round 1, 2026-10-18; review docs/design/levels/reviews/proto-1-r1.md)
- 74 edge proofs (most with the creatures in) and 4 drivers, all replayed by the tests; progression Kindle > Gust,
  every place and find; no softlock; fuel everywhere. 13 locks held at 2500 nodes.
- The puzzles as the solver plays them, creatures in: First Light ~1.7 s of its 4 s (a perfect line; a person about
  twice that); the seal ~5 s (jump, kindle M-s1 in the air, fling up off it, kindle M-s2 in the flight); the guarded
  set ~1.4 s (kindle M-c1, fling through the tunnel, kindle M-c2 in the flight: fast, but nothing else crosses); the
  loft up the burning pair; the flue (Kindle the bud, climb, gust the caged lamp); the vault with one fan; the boss
  ~53 s.
- Not done in round 1: the reviewer's "keep moss alive with Gust while standing on it" (tried as the flue with a 2.5 s
  bud: a climb of quick hops beats any burn the light's 420 px allows, and a double jump off the last lit step reached
  the reward as the moss went out; the flue became Kindle + Gust's caged lamp instead; the vault is the fan puzzle).

## Gotchas (each cost a round)
- **A face that takes a climb must reach down to where she stands** (within her height): a face ending over her head
  is never met, a held direction carries her under it (the split's and the chimney's columns, the root column).
- **A gap between a shelf and a wall must be >= 48 px** to fall through; a shelf over the ground she climbs from is a
  ceiling (the vault's S2 / L0, S3 / L1 were both).
- **Anything that must be entered only one way needs walls and a roof**: a fling + double jump + glide carries ~1800
  px (the nest, the loft and the crest were all reached from across the room until enclosed / sealed).
- **Reach numbers** (round 1's probes, flat ground): a double jump rises 462; a double jump + glide carries **1500 px
  back to the same height** (a gap alone never needs a fling); a fling off a flame at her height adds only ~110 of
  height and ~350 of carry; the fling's power is the anchor's place (a bud hung at a jump's top launches her from
  there) and its speed in a low space: **a 200 px tunnel** holds a glide to ~500 px and a fling carries 900.
- **Warm lamps are anchors everywhere their flight goes**: the hub's lamp rows reached M-s2 800 px away (a UR fling,
  a double jump, the glide) until the root curtain stood between; a bud near a gate (M-c2) is an anchor for the
  vault over it. A must-use lock (strip the puzzle's anchor) finds these.
- **A moss overhang only blocks while it burns**: when the bud gutters mid-jump the staggered steps vanish and a
  double jump off the last lit step goes straight up.
- One button: a tap near a cold bud kindles, near a burning flame flings (glow.md).
- The step-ram needs the beetle's `radius` (its range's end is the face) and no roof 1 px past the face.
- The explorer is slower than a human (macros wait to settle): it proves reach, not that a clock is unbeatable.
- Thorn crowns that hide a lamp from the blade must reach 155 px sideways, 145 below and 120 above the flame (a
  forward cut reaches 135 from her centre, keen blade +20 on the flame box), or put a wall there.
- A walk-to in a driver must stop pressing early (her slide carries ~40 px): the vault's fan spot is 60 px wide.
