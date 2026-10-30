# The Canopy, review round 5 (2026-10-30)

Reviewer brief: judge the Canopy v5 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`; the round-5
level pass f20a371..871a37b, the render pass d4d58db, docs 855143f) against the first areas of Hollow Knight,
Silksong, Ori and Nine Sols, and say what changed since round 4 (`canopy-r4.md`).

**New this round: all four references are exact.** HK, Silksong, Nine Sols (04621c6) and Ori (32abb77) are read
from the installed games (`reference-levels/*/EXTRACTED.md`). A section below says which of my round-4 conclusions
the exact numbers overturn.

Sources:
- the docs: `first-area.md` (the v5 section and the builders' weak list), `memory/canopy.md`,
  `memory/canopy-render.md`, `art-direction.md`, the reference README and the four `EXTRACTED.md` files;
- a fresh wide shot of every stop in every room with pickups (16:9, 104 frames), plus the way out at 21:9 and the
  hub at 16:10, and the mean luma of every shot;
- **the look references** (`~/code/opusvania-refs/`): HK's King's Pass and Crossroads renders at 1:1 (the Knight is
  85 px tall and Wing 80, so a HK view is our view), and Silksong's Tut_01 and Tut_02 cropped to a view **in hero
  heights** (Hornet 139 px, so a Wing-sized view of Silksong is 50 × 28 units), laid over our well chimney and Grove
  pit;
- the map re-exported (byte-identical, nothing to revert) and `metrics.ts` run over all four references and ours,
  plus my own measures from the `area.json` files: hazard lengths, room sizes, enemy spacing, calm at the doors;
- the climbs: `canopy-climbs.test.ts` (12 pass), then `climbs.ts` at kick delays 0 / 10 / 16 / 24 with no margin, to
  find where fair ends;
- the bot reports in `playtest-reports/canopy-r5/` and `canopy-r5-fork/`;
- probes in a `-s=review5` session: the Grove's beat 2 fired (`cn-grove-beat2`), and the den forced into phase 3
  (`p2At` / `p3At` 1, then `step`).

All coordinates are room-local px, as in the generator.

## The short version

v5 fixed the thing round 4 said was broken.
- **The climbs are fair.** Every required climb passes at a 16-frame reaction delay (267 ms), and most pass at 24.
  A thorn costs one leg, never the climb.
- **The way east is lit.** Two of the three fork bots climbed the fork's face and fought the Grove's wave. In round 4
  none did.
- **The west is shut until the claws.** No bot fell into the rot branch without them, and the claws now come about
  1:50 sooner.
- **The render pass landed.** Five looks show on screen, the thorns read at a glance, the den goes dark in phase 3,
  and the vista has a range.

It is the best Canopy yet, and it is still not a first area that stands next to the references. The reasons have
moved:
- **Fair has turned into flat.** 7 of the 12 climbs are one face held against a wall, and none asks for more than
  one change of wall. The way out, which was meant to be the final exam, is now a single kick and one face. The
  movement is our best asset (`strengths-feel-weakness-levels.md`), and the area no longer asks anything of it after
  the Spire's neck.
- **The well's bottom still pulls west.** The save, the moth-stone and the open corridor into the rot hall all sit on
  the bottom floor, beside the climb up. All three start bots took the claws at about 1:02 and then looped well, rot
  and trunk for 15 minutes.
- **The exact references show the screens between fights are empty.**
  - Thorns: 166 px per air screen, against 330-480 in the references (HK, Silksong and Nine Sols scaled to the hero;
    Ori 328 per screen).
  - Things to hit or break: about 1 placed pod in the whole area, against 1.7 a screen in Nine Sols. Ori has 42
    breakables and 26 orb plants, and never goes 2.8 view widths without something to hit, take or avoid.
  - Small ledges: 8 one-ways in the whole area, against 143 in Nine Sols.

  A screen without a fight in it is a corridor.
- **The shapes are the weak half of the look.** Side by side with Silksong and HK, our masses keep their detail
  inside a near-black slab with ruler-straight edges. Theirs put all the detail on a lobed, moss-lit edge, and the
  inside stays flat black.

Round 4's line holds a fifth time, but it has moved. The structure is close to the references, and the climbs are
now fair. What is missing is density between the peaks, a reason to read the climbs, and edges that look grown.

What works, and should be kept:
- **The thorns** (`bramble`). They have bone and rust barbs 24-40 px long, pointing into the air, with a warm rim and
  no glow within 64 px. In the well's chimney the east strip (2592-2740) is the clearest thing on the face from the
  mouth's floor. It says "climb the other wall" without a word. This is the best render fix of the round.
- **The looks by region.** In the contact sheet the shaft (white-blue), nest (ochre-grey), canopy (green-teal),
  heartwood (amber) and den (umber) can be told apart. The west's mean luma went from 12 to 22-27.
- **The snuff.** Forcing phase 3 in the den takes the frame's mean luma from 23 to 12 (verified). The arena visibly
  goes out, and the boss's pale shell becomes the brightest thing on screen.
- **The Grove at the pit** is still the area's peak. The Grovemother on arching roots, the two lamps and their
  swarms, the bounce caps and the two beats. Beat 2 spawns as written (verified): two juveniles, the dangler, the
  lampwing from `wick-b`, and the gate stays shut until they die.
- **The fork's lamp.** `wick-fork` (3000 × 440) over the face's top gives the clawed player the first warm light
  east of the hub. The fork bots went up to it.
- **The Spire's neck** (`spire-neck`). It is still the only climb that needs a change of wall at a height the player
  must judge. It is still the model.
- **The fairness test** (`climbs.ts` + `canopy-climbs.test.ts`). It plays a person's plan at several delays and
  start x, with a margin, a fail plan and a return check. It should guard every climb that gets added from now on.

## Since round 4, fix by fix

| r4 # | fix | v5 | status |
|---|---|---|---|
| 1 | fair climbs | strips one face at a time with a clean stretch where she changes wall; rests with root lips; landing save; the way out's rest under a raised plug; `climbs.ts` + the test at 0 / 6 / 10, 64 px margins, a fail plan; no grip tuning | **done, and overshot.** I re-ran it: everything passes at delay 16 and most at 24 with no margin. But 7 of 12 plans are one face only, none needs more than one change of wall, and the way out is a single kick and one face (#2). |
| 2 | the way on after the claws | the fork's thorn pit moved west into a pit, the last 384 px clean, `juv-e` on the knoll, `wick-fork` over the top; `elder-door` opens from the Elder; the hoard hidden by cover (observe.ts) | **done.** 2 of 3 fork bots climbed the face. New leak: the well's bottom opens east into the rot hall beside the claws (#1). |
| 3 | the west shut until the claws | `rot-door` high in tier 3 (sill 320 over the floor); roof strips cut in tier 2 and the rot hall; floor beds in 64 px pits | **done.** The claws come at 1:02 (r4: 2:52). |
| 4 | break the repeated props | burls lean, wrap and split; hangs are 3-7 twisting strands; top-hung clumps without organ pipes | **half.** The pleats and hems are gone, but two new stock props repeat: the leaning **stump-cone** (hatch, galleries, larder, nook, hollowroot, ledge, burrow) and the **hanging talon** (cellar, rot, galleries, tunnel, burrow). Two planters remain (#6). The 27-room contact-sheet check was not made a test. |
| 5 | the last slabs | plates, fissures, a root across every face over 600 px, knuckled corners; the roost as a nest | **half.** The roost is right: a ragged pouch. The slabs keep straight outlines. The detail went *inside* the mass, where it reads as near-black texture (#4). |
| 6 | thorns that read | bone and rust barbs, a warm rim, no glow within 64 px | **done.** The best fix this round. |
| 7 | looks by region and value | `ROOM_LOOKS`, tones, a mass tone and a post grade per look; west luma 12 → 23-25 | **done, with one merge.** Heartwood and den are both warm brown with horizontal bands (trunk 25, den 23 mean luma). The canopy look is still vertical posts in fog, now green (#7). |
| 8 | the peak and the boss as beats | Grove: beat 1 burrbacks, then juveniles, dangler and a lampwing, and a root step. Den: shelves 384 wide at 1088, a root shoulder for the reveal | **done as data.** Beat 2 bunches into one 280 px knot under the arch. Beat 1 is not a lock-in. The root step paints as a hanging planter (#5). |
| 9 | the snuff and the backs | `SNUFF` (luma 23 → 12); no ruled bands; the fork's seam and the Grove's flaps fixed; feathered covers | **done.** I saw no checker and no seam in any of the 104 frames. The taproot is still a thin post with rings (96 px, `taproot [2944, 3040]`). |
| 10 | the vista's far shapes | five peaks, shaded faces, attached snow, valley walls, a mist river, lamps at three depths, a lamp tree | **half.** The peaks are separate low-poly triangles whose flanks are see-through where they overlap. The mist river is a glassy quad, the lamp tree is a lollipop, and the valley floor is a flat dark band over 40% of the 21:9 frame (#8). |

## What the exact reference numbers change

Round 4 judged against mined numbers. All four references are now read from the game files, and four of my round-4
conclusions do not survive. Hero scale matters here:
- **HK:** the Knight is 85 px tall and Wing 80, so a HK screen is our screen.
- **Silksong:** Hornet is 139 px tall, so in hero heights its distances are ×0.58 of ours and its areas ×0.34.
- **Nine Sols:** Yi is 100 px tall, so ×0.8 and ×0.64.
- **Ori:** Ori is 54 px tall with a 140 px jump (2.6 bodies; Wing's is 3.4), on the same 1920 px view. Scaling by
  body height would blow its rooms up 2.2×, so Ori is compared per screen below (its EXTRACTED.md: our jump takes
  steps about 30% taller for the same feel).

| measure | HK | Silksong | Nine Sols | Ori (per screen) | **Canopy v5** | what changes |
|---|---|---|---|---|---|---|
| hazard strips / total length | 93 / 45,000 px | 127 / 67,700 | 37 / 23,100 | 54 / 15,600 | **25 / 6,800** | **Reversed.** r4 said "37 hazard runs, the references have 0-6", so too many. The truth is that every reference uses 2-10× our total thorn length. |
| hazard px per air screen (hero-scaled; Ori per screen) | 341 | 478 | 330 | 328 | **166** | We use about half the references' hazard. The fault in r4 was where the thorns were (phase-locked), not how many there were. Ori's hazards also hit harder than its enemies (lasers kill, thorns cost 1-2 of 3 cells). |
| solid share of the room boxes | 0.63 | 0.74 | 0.49 | 0.44 | **0.51** | r4 used HK 0.35 (traced). The references are rock with caves in it, and the Canopy is the airy one. |
| median room (box screens) / air screens, hero-scaled | 4.8 / 1.8-2.5 | 11.8 / ~2.0 | 3.3 / ~1.3 | 3.7 | **2.8 / 1.4** | Our rooms are the right size: between Nine Sols' tight bands and HK. Our largest room is 6.2 screens, though, and every reference has one huge place (King's Pass 34 screens, Dirtmouth 39, Bone Bottom 40 air, Nine Sols' hub 11.7 air plus a 10,670 px lift shaft). |
| air screens in the area, hero-scaled (Ori per screen) | ~132 | ~82 | ~56 | ~48 | **~41** | The Canopy is the smallest first area, at a third of HK, half of Silksong and a little under Ori's Glades (84 box screens, 63 view widths of route). That is fine for a test bed, but not the "Ori length" target (`memory`). |
| critical-path room share | 0.25 | 0.29 | 0.72 | 0.71 | **0.52** | Now exact: HK and Silksong are at half of ours, Nine Sols and Ori above us. The share alone is not the fault. |
| enemies per box screen | 0.55 | 0.26 (0.53 / air) | 0.59 (0.42 placed) | 0.57 (3 of 17 rooms empty) | **0.48** (8 of 27 rooms empty) | r4's "0.31 / 0.27 / 0.18" were low guesses. We are in range. |
| enemy nearest neighbour, median | 545 px | 1,057 | 534 (849 placed) | 905 | **320** | Ours cluster tightest. Nine Sols places enemies alone and makes crowds with events. |
| minor pickups | 4 | 41 | 13 | 11 | **58** | **Reversed.** r4 called our minors "6-10× the references". Against Silksong it is 1.4×. Drop it as a priority. |
| screens with nothing in them / longest empty run | 59% / 16 | 67% / 16 | 57% / 8 | 33% / 5 | **54% / 8** | Ori, the reference nearest our size, is the fullest: two thirds of its screens hold something. Our share is fine; our empty runs are long for an area this small. |
| things to hit between fights | 90 breakables (walls, floors, rocks) | 9 | 148 props + 21 (1.7 per air screen) | 42 breakables + 26 orb plants | **17 bark walls + 1 pod** | **New.** Nine Sols and Ori furnish every screen with a ledge to take or a thing to break. We furnish none. |
| one-way ledges | 0 (solid ledges) | 0 | 143 (1.6 per air screen, median 107 px) | 11 | **8** | Nine Sols' "density of choice" is small ledges. HK and Silksong get it from solid lumps. We have neither in the halls. |
| hidden pockets (masks / covers), median size | 18, 1,210 × 790 | 164 masks | 19, about 770 × 375; 15 of 19 on the path, mostly routes | 6 fading-art walls, about 530 × 355; hidden things a median 644 px off the route | **19 covers, about 450 × 320** | Our covers are Ori's trick at Ori's size. Against HK and Nine Sols they are niches (a sixth and a half of the area), and none hides a route. |
| calm at a critical-path door (first enemy, view widths) | 0.36-2.0 | 0.49-1.95 | 0.08-0.75 | 0.07-1.28 | **0.54-1.75** | Fine: ours is among the calmest. No change needed. |

So in round 6, **stop cutting** thorns and glints, and **add** furniture: hazard, things to hit, small ledges,
bigger pockets. The exact numbers also make the area's size and its missing big room visible for the first time. I
do not put those in the top 10 (no new rooms before the area plays well), but the hub is the cheapest place to start
(#9).

## The look against the references, at the same scale

**HK King's Pass and Crossroads_01 (1:1) against our hub, trunk and well.**
- **Composition.** HK fills 60-70% of a frame with mass at three or four depths. Near black, mid dark blue, far lit
  blue, each overlapping the next. Our frames have two planes: the playfield mass and one back (fog, bands or posts).
  The hub's door shot is mass on the right (the east block, 2048-4480 × 1600-2304) and flat sky on the left, with
  nothing between.
- **Silhouette.**
  - Every HK mass edge is a chain of rounded lobes 60-200 px across, outlined, with stalactite fringes of 40-150 px
    teeth on every ceiling.
  - Ours are straight runs with right-angle corners: the well's chimney walls, the hub's east block, the way out's
    two blocks, the trunk's tier stacks. Our ceilings carry a few drips and roots, not a fringe.
- **Detail density.** HK puts a shape boundary every 100-200 px along an edge and keeps the inside of the mass
  simple. Ours runs the other way: plates, fissures, grain and a diagonal root *inside* a near-black slab, and a plain
  4-8 px moss line on the edge. At play distance the inside reads as noise in the dark, and the edge reads as a
  ruler.
- **The walkable band.** HK's floors are a thin decorated band (tiles, shells, pale grass curls), the lightest thing
  in the frame. Ours have a lit moss rim, which reads, but nothing stands on it: no ferns, curls or stalks in
  silhouette.
- **Negative space.** HK's empty air is lit fog with far shapes in it. Ours is either flat fog (the well, mean luma
  50, with almost no shapes in the back) or banded wallpaper (heartwood).

**Silksong Tut_01 (the start shaft) against our well chimney, in hero heights.**
- The two compositions are nearly the same: a pale central shaft 4.8 heroes wide between dark walls with side
  galleries. This is the fairest comparison we have.
- Silksong's walls are black lobed silhouettes with a 40-80 px band of bright moss on every lit edge, moss icicles
  60-150 px under every underside, and long blades of grass leaning into the shaft.
- The back is busy at mid value: moss lobes and leaves at two depths behind fog.
- Ours: the same shaft is two flat dark planes with straight faces, root lips like planks, and a pale back with a few
  soft vertical strokes. The thorns are the only accent on the walls.

**Silksong Tut_02 (the first fight room) against the Grove pit.**
- Silksong's fight band floats in the middle of the frame. Lumpy moss caps on its top, fiddleheads standing in black
  silhouette on it (30-120 px), dripping moss under it, a lit mid-ground of moss lobes and fern curls behind, and
  shafts of light.
- Ours is the better-lit set piece (lamps, swarms, the Grovemother). But the bottom 30% of the frame is one
  undifferentiated black floor mass, the floor line is flat, and nothing stands on it but the two caps.

The lesson in one line: **move the detail from the inside of the mass to its edge, and put a busy mid-value plane
behind the play.** That is #4 and #7.

## The 10 most important problems, ranked

### 1. The well's bottom pulls the clawed player west
**What.**
- **The geometry.** The bottom floor (`cn-well` y 4928) has:
  - the save (`p-well`, 1900);
  - the moth-stone (`stone-west`, 2250), which draws the west on the map;
  - the open corridor east into the rot hall (rot room x 0-640 × 1216-1472, its `rot-wall` at 448 one cut).

  The way on is up: leg 1 from the same floor, then the mouth, the landing and the hollow, 3,800 px of climbing. The
  claws themselves (`claw-prize`) sit at (1440, 3900), on a ledge above all this. The solver's own comment says
  "without the claws the bottom is a pit (out only east to the rot hall)". So the rot hall is the bottom's door, and
  everything that says "this is a place" (save, stone) is next to it.
- **The bots.**
  - All three start runs took the claws at 1:02-1:13, then spent 13-15 minutes in well → rot → well → trunk loops.
    The well ↔ rot crossing happened 6-8 times a run. None reached leg 3.
  - The builder's reading is that the bots pick the chimney face from the map. That is true for leg 2's east strip
    (`thorn-w2`, 5-7 hits a run). But it does not explain why a clawed player keeps walking back into the rot hall.
    The floor does.
- **What a person sees.** After the claws she lands on the bottom. Ahead (east) is a flat corridor with a lit crack.
  Up is a 1,000 px face. A player chooses the flat corridor every time. The bottom also gives no view of the mouth or
  any light above it.

**Why it matters.**
- README fact 7: Ori's Wall Jump tree is at the bottom of its hollow, and the only way out of the hollow is the wall
  jump. An energy cell waits on the wall 1,370 px (0.7 view widths) of route after the tree, so the ability is used
  within seconds (exact, Ori's EXTRACTED.md).
- Silksong's first ability opens nothing, but its start shaft (Tut_01) has every side gallery hanging off the shaft
  you climb.
- A first ability's room should have one exit that needs it.

**Fix** (level).
- **The claws go to the floor.** Move `claw-prize` to the bottom floor at about (1300, 4928), the foot of leg 1's
  face. Picking them up faces her at the climb.
- **The rot corridor becomes a return.**
  - Turn `rot-wall` into a `shortcut` that opens only from the rot side (`opens: 'e'`).
  - The rot branch then has two ends you enter from the giant and leave by the well. From the well it is a shut root
    door, as the Elder's notch already is.
  - A no-claws player who drops to the bottom takes the claws and climbs.
- **Move the save and the stone up.** Put `p-well` and `stone-west` on the mouth's floor (y 3200, about 2300), the
  first rest of the climb. A thorn on leg 2 then returns her beside a save, and the map stone reads as a reward for
  leg 1.
- **A light up the shaft.** Hang a pale moon slit or a lamp's spill at the mouth (about 2100 × 3000), visible from
  the bottom, as the fork's `wick-fork` did for the fork.
- **Check.** Re-run the three start bots. Pass when two of three reach the landing (2432) within 4 minutes.

### 2. The climbs are fair and flat; the area's movement curve ends at the Spire
**What.**
- **The tolerance**, my re-run of `climbs.ts`, no margin:

  | delay (frames) | pass |
  |---|---|
  | 0, 6, 10 | 12 of 12 climbs (the test, with 64 px margins) |
  | 16 | 12 of 12 |
  | 24 | 7 of 12 fully. Spire-1, Spire neck and one start x of well-1, well-3 and Elder-1 fall short: a 400 ms reaction is too slow for them, which is fine. |

  A late kick now costs height, never a hit. The fail plans (one face only) all hit a strip. **This is fair.**
- **The shape of the plans:**
  - one face, held (7 of 12): well-1, out-1 (one kick), out-2 (with up cuts), the fork's face, spire-1, Elder-3,
    the kin;
  - one change of wall at a judged height (5 of 12): well-2 (optional: the west face alone passes), well-3, the
    Spire's neck, Elder-1 (optional), Elder-2;
  - two or more changes of wall: none.
- **The way out** (`cn-out`): leg 1 is one kick up the east face to the rest (floor 1024), and leg 2 is the west
  face cutting the plug (896-1280 × 448). The builder's own weak list says it: "fair but plain... no longer the final
  exam". The area's last climb is its easiest.
- **No second element.** No climb has a creature, a moving thing, a reward off the line or a route choice. Since the
  rule "no creature within 200 px of a rest" (`safeEnemyPx`), the well's lampwing is gone too.
- **The hardest climb is optional.** The Elder (`cn-elder`) is moderate, and it is the only one with two changes of
  wall across its legs.

**Why it matters.**
- Fair is the floor, not the bar.
- HK's Mantis Claw: the first climbs are clean walls, then within the same area come spike-lined shafts with flying
  enemies, geo on the dangerous face and a second route through a breakable wall.
- Ori's Wall Jump: the hollow is trivial, then the Spirit Caverns combine walls with spikes, enemies and Sein's
  shots.
- Nine Sols carries its vertical travel on 29 climbable wall strips (median 534 px), mixed with ledges, enemies and
  hazard floors.
- In each reference the verb gets a second thing to do within ten minutes. Ours gets nothing after the Spire.

**Fix** (level, each held by the fairness test at 0 / 6 / 10 with 64 px margins).
- **The way out is the final exam.**
  - Three legs from the chimney floor (1344): leg 1 to the rest (1024) as now; leg 2 to a second rest carved at
    about 640 in the west block; leg 3 cuts the plug.
  - Two changes of wall overall, strips by the v5 rule (≥ 470 px between the strip she leaves and the one ahead).
  - A reform rest between each leg.
  - The fail plan: one face only.
- **The well's leg 3 gets a second element.** A lampwing patrolling the chimney at 1500-1900, mid-leg and more than
  200 px from both rests. She must cut it from a wall or wait out its swing.
- **Rewards off the line.** A moon shard or a glint line on the thorned face, reachable by a kick in and out between
  strips:
  - the Elder's leg 2 (east face above the passage);
  - the well's leg 2 (east face, above `thorn-w2`).

  Risk becomes a choice, the HK geo-on-the-spikes pattern. Add a `CLIMBS` plan that takes it and passes at delay 0
  and 6.
- **Order** (r4 #9, still right): the well (teach), the fork face (clean), the Spire's neck (first set piece), the
  well's leg 3 lampwing on a return visit, the way out (exam). The Elder stays the optional hardest. It can now take
  one more change of wall.

### 3. The screens between fights are bare: furnish them to the exact numbers
**What.**
- **Hazard.** 25 strips, 6,800 px.
  - That is 166 px per air screen. The references, hero-scaled: HK 341, Nine Sols 330, Silksong 478.
  - Our strips are short (median 192 px against HK 125 / Nine Sols 374 / Silksong 171, but HK's mean is 484 and
    Nine Sols' 703: they lay long runs).
  - Thorns sit in 14 of 27 rooms. The limbs, the gap, the hub, the crown, the attic and the sky have no hazard to
    shape a jump.
- **Things to hit.** 17 bark walls (all secret doors) and 1 pod. Between fights there is nothing to break.
  - Nine Sols has 148 props (1.7 per air screen) and HK 90 breakables.
  - `density-of-choice.md` found by feel that the Grove is fun because every moment offers hit, collect, cut, lamp.
    The exact data says the references do it everywhere.
- **Small ledges.** 8 one-ways in 83 screens. Nine Sols: 143, median 107 px.
  - The tall halls have long flat floors and plain walls: the trunk's tiers, the tunnel (4480 × 2176), the den's
    floor (576-2944), the gap's floor and the galleries' east.
  - HK and Silksong get the same effect from lumpy solid ledges. We have neither.
- The quiet stretches the bots crossed fastest (limbs, hub, tunnel) are exactly these.

**Why it matters.**
- 54% of our screens are empty (refs 57-67%), so we are not over-full. But a reference's "empty" screen still has a
  spike run, a rock to break or three ledges to choose between. Ours has a floor.
- A movement game needs a movement problem in its travel. README "what it means for us": quiet travel *with a
  movement problem in it*.

**Fix** (level).
- **Hazard to about 300 px per air screen** (6,800 → about 12,000 px). Put it on the travel, never on a rest or a
  drop's landing, in strips of 256-640, each with a respawn ledge. For example:
  - the limbs (a floor strip in the gap between the west limbs);
  - the gap (a roof strip over the glide line, forcing a lower glide);
  - the tunnel's floor (two pits of 256);
  - the hub's crossing (one strip under the swing);
  - the crown (a strip on the glade's lip).
- **About 30 pods or breakable props** (from 1): bark knots, seed husks, hanging cocoons that pay 1-3 glints or a
  burst of moths, 2-3 per hall.
  - Put them where a fight is not, and some in mid-air on a jump's arc (hit, then pogo).
  - Pay for them by moving glints out of `hoard()` piles: the glint count can stay at 58.
- **Small ledges.** 20-30 one-ways or lumpy root knuckles of 96-160 px in the five tall halls named above. Each makes
  a second line through the room (high and fast, or low with the pods).
- **Check.** Re-run `metrics.ts`. Hazard ≥ 11,000 px total. Things to hit plus one-ways ≥ 0.8 per air screen. Empty
  screens stay between 50% and 60%.

### 4. The masses are drawn inside-out: detail in the slab, a ruler on the edge
**What.**
- **The slabs that remain** (all still read as rectangles at play distance):
  - the hub's east block (`root` 2048-4480 × 1600-2304: the door shot is half this one plane);
  - the well's chimney walls either side of 1920-2304. In the chimney shot there is a rectangular "window" cut into
    the west mass above the landing's root lip, and both faces are plumb planes 1,000 px tall;
  - the way out's two blocks either side of the chimney (all four lower shots, at 16:9 and 21:9);
  - the trunk's tier stacks (thorns and wall shots: three right-angle steps, flat plank floors);
  - the Grove's entry tiers (entry and tiers shots: three square steps);
  - the den's west wall (balcony shot).
- **Where the detail went.** v5 added plates, fissures, a crossing root, knuckled corners and a crust wash. All of it
  sits inside the mass at near-black values, where it reads as noise. The outline is still a straight run with a 4-8
  px moss line.
- **Side by side** (the look section): Silksong's and HK's masses are flat black inside and carry everything on the
  edge:
  - lobes;
  - a thick lit moss or shell band;
  - a fringe under every ceiling;
  - blades of grass leaning out.

**Why it matters.**
- `art-direction.md`: "Collision is boxes; the picture must never show it. Every edge is a painted silhouette."
- The eye reads edges first. A frame of straight edges reads as boxes however much bark is painted inside them.

**Fix** (render, `pf-mass.ts`).
- **Lobed outlines on every free edge.** The edge leaves the collision line, inside it on walls and outside it under
  ceilings, as a chain of lobes:
  - 60-200 px across, depth 16-48 px, every 100-250 px;
  - on claw faces within ±12 px of the collision so the cling still reads (they took the claws before);
  - corners as one big lobe or a root knuckle, never an angle.
- **A thick edge band.**
  - On every walkable top and lit face, a 30-60 px band of moss and bark, the brightest mass value in the room.
  - On every underside, a fringe of hanging roots and moss 60-200 px long, uneven, one every 40-120 px.
- **Flatten the inside.** Cut the plates, fissures and crust inside a mass to a third of their contrast more than
  120 px from an edge. The interior is the darkest plane.
- **Floor silhouettes.** Stalks, curled fern heads and grass blades, 30-120 px, standing on lit tops every 150-400
  px. They are not on claw faces, and they never stand where they could read as a ledge.
- **Start with** the well (both chimney walls), the hub's east block, the way out's blocks and the trunk's tiers.
- **Check** (shot test): a Sobel edge map of the chimney and hub door shots must have no straight run over 300 px
  along a mass outline.

### 5. The Grove's wave is not yet an arena, and beat 2 is a knot
**What.**
- **No lock-in.** The trigger (`pit-wave`, 1536-3200 × 1472) sets a flag but shuts nothing.
  - Beat 1's two burrbacks (`burr-pit-w` 1800, `burr-pit-e` 2850) stand awake in the pit before she arrives, so beat
    1 is the pit's ordinary walkers.
  - A bot that left one alive (`fork: skilled`: "beat 1, one burrback left") never saw beat 2 or an open gate, and
    went back to the fork.
  - Nothing on screen says "clear this".
- **Beat 2 is a knot.** The juveniles spawn at 2120 and 2400 and the dangler at 2256 × 1352: three of the four within
  280 px, under the arch, on her landing point (probe: all three on her in the first second).
  - The lampwing (2800 × 1120) is the only threat from another direction.
  - The root step (one-way 2560-2816 × 1376) is painted as a slab hung on four rope roots, the hub's "planter"
    again. It sits over `thorn-p1` (2560-2700), and the casual and skilled bots faded twice each at (2613-2686, 1607-1639):
    knocked off the step into the bed.
- **The save before it.** The last save before the Grove is the hub (`p-crossing`). The next is the bower. That is
  over five view widths with the area's peak in the middle (Silksong: a bench every 2.5-4.4 view widths, and one 1.45
  view widths before Moss Mother).

**Why it matters.**
- HK's three lock-in rooms (the aspid arena, the Glowing Womb, the False Knight) shut both doors on entry, and a
  wave announces itself.
- Nine Sols makes every peak with an event: 29 of its 100 enemies wake for a gauntlet or the lift ambush.
- A wave the player can walk out of, which starts with enemies that were already there, reads as a crowded room, not
  a set piece.

**Fix** (level).
- **Lock in.**
  - On `pit-wave`, a root gate drops at the pit's west lip (about 1472 × 1216-1472), as `pit-gate` holds the east.
  - Beat 1's burrbacks start asleep (`wakes: cn-grove-wave`), so the trigger starts the fight.
  - Both gates open on `cn-grove-clear`.
- **Spread beat 2.**
  - The juveniles drop from the pit's two ends: about 1700 and 2950, clear of the caps at 1536-1664 and 3008-3136.
  - The dangler from the Grovemother's crown over 2256.
  - The lampwing from `wick-b` as now.
  - She meets them from three directions, not in a knot.
- **The root step.** Move it off the thorn bed (2304-2496 × 1376, over clean floor) and paint it as a root knuckle
  growing from the west arch root, not hung (#6).
- **A save at the Grove's entry** (`p-grove`, about 400 × 576, the entry ledge), so a lost wave costs one walk down.
- **[render] The gate's signal.** On `cn-grove-clear` the east gate's roots draw up with a light that runs along them
  (the cyan beads brighten in sequence over 0.6 s), and the lamps' swarms lift.

### 6. Stock props and human objects
**What.**
- **The stump-cone.** One leaning, root-flared cone with a broken top, at the same scale and angle:
  - the hatch (burl shot);
  - the galleries' stair (1280 × 1408);
  - the larder floor;
  - the nook's burl;
  - the hollowroot floor;
  - the ledge;
  - the burrow's stone.

  Seven rooms show it, and in the contact sheet it is the first shape you recognise.
- **The hanging talon.** One curved black claw of 2-3 strands from the roof, in the cellar (in), rot (wall),
  galleries, tunnel (pair) and burrow (in).
- **Planters.** Two one-ways are painted as a slab hung on four rope-like roots:
  - the hub's swing (`oneWay` 2368-2560 × 1376, landing and door shots, unchanged since r4);
  - the Grove's new root step (#5).
- **A lattice truss.** The hub's `seed-door` (`gate` 1792-2048 × 1600, a floor gate) paints as an X-braced timber
  truss. It reads as a bridge built by people (door shot, 16:10 landing shot).
- **The fork's claw face as a curtain.** `paintTaper` reads the face at x 2816 (1344 → 576) and its foot as a taper,
  and paints a pleated fan sweeping up to the top (face shot). It is the old curtain at the size of a cliff.
- **The taproot** (den, 2944-3040) is a 96 px post with cyan rings.

**Why it matters.** `art-direction.md`: "no visible repetition", "no human buildings". The truss and the planters
are both. A stock prop in seven rooms is how a player names a place "the generated one".

**Fix** (render).
- **Burls.**
  - Draw from 3-4 families by seed: a split stump with two crowns; a root knee arching back into the floor; a fallen
    section lying on its side; a fungus-crusted knob.
  - No family twice in one room, no family in more than 3 of the 27.
  - Make the 27-room contact sheet a test: a silhouette hash per prop, at most 3 rooms sharing one.
- **Hangs.** Alternate the talon with a moss beard (fine strands, pale tips), a root curtain with gaps and a hanging
  seed pod. The same rule: at most 3 rooms per family.
- **One-ways (`shelfFor`).**
  - A ledge with a wall within 256 px is a root shelf growing out of that wall.
  - A ledge out in the open is a broken branch stub or a root knuckle rising from below.
  - Nothing hangs on ropes unless something real hangs it (a web, a vine from a limb that is drawn).
- **The seed door.** A woven root mat across the shaft, with the three seed sockets as the lock (keep them: they read
  as a lock), not a truss.
- **Claw faces are never tapers.** `findTapers` skips any rect whose face takes the claws for over 400 px. The fork's
  face gets the lobed edge of #4 with a cool rim.
- **The taproot.** 160-220 px thick, plunging from the roof with a twist, splitting into 3-4 roots where it plants,
  and a glowing scar (`wick-taproot`'s socket) on its face.

### 7. The backs: flat fog, banded wallpaper and two browns
**What.**
- **The shaft** (well, Elder): the back is pale, mean luma 50 and 67 at the hollow. It is near-empty: a few soft
  vertical strokes and the moon fog. It makes the faces read (good), but the frame has one plane behind the play
  where Silksong's Tut_01 has two (busy mid-value moss lobes behind fog).
- **Heartwood** (trunk, rot, crawl, webs) is amber with wide horizontal bands and huge concentric rings behind (rot
  wall, trunk low, webs). At 16:9 the bands read as a sepia striped wallpaper, the rings as a target.
- **Two browns.** The den family (tunnel, burrow, den) is umber-orange with horizontal bands. Trunk 25 against den 23
  mean luma, both warm, both banded. Desaturated, the trunk's wall shot and the den's floor shot are the same picture.
  Round 4's test ("trunk, cellar, well, bower told apart desaturated") was not run with the den, and the den is where
  it fails.
- **Canopy** (spire, nook, hollowroot, bower, attic, sky, ledge): green-teal fog with straight vertical posts at even
  spacing. It is r4's "blue fibre forest" in green. The posts are the same width and lean, five or six to a frame.

**Why it matters.** Wayfinding by look works now, which is the round's real gain. But the backs are where the
references put their depth (HK's three depths of lit arches, Silksong's moss lobes), and ours are one flat plane
each.

**Fix** (render, `lib/interior.ts`).
- **A mid-value plane in every look**, between the playfield and the deep back, at parallax about 0.93, value 40-60%
  of the way from the mass to the fog. The shapes are the look's own:
  - shaft: frost-root arches and hanging lichen;
  - heartwood: split grain panels and sap-lit knots;
  - nest: chambers and galleries in silhouette;
  - canopy: leaf clumps and branch forks;
  - den: roots and old shells.

  Coverage 25-40% of the back.
- **Heartwood's back.**
  - Drop the full-width horizontal bands and the concentric rings.
  - Grain runs along the giant (diagonal to the frame, per room), in broken panels 300-900 px long with dark splits
    between.
  - Rings only where a cut end shows (the rot hall's cache, the crawl's turn).
- **Split den from heartwood by value pattern.**
  - The den is cool umber-grey earth: lit from below by fungus, with dark root silhouettes hanging and few bands.
  - The heartwood is amber, lit from above through cracks.
  - Add the den's floor shot to the desaturated test.
- **The canopy's posts.** Vary their width 3:1, lean ±8°, fork a third of them, and break them with leaf clumps.
  Never more than four in a view.

### 8. The vista is a range of separate triangles
**What** (`cn-out` valley and door shots, 16:9 and 21:9).
- **The peaks.** Five low-poly triangles stand apart on a horizon line with no shared base. The main one sits well
  under the moon (good).
  - The flanks are semi-transparent where they overlap: the far peak shows through the near one's flank.
  - The snow is attached now, cut along the ridges.
- **The valley.** A flat dark band covers the bottom 40% of the 21:9 frame.
  - The "valley walls" read as two slightly different darks.
  - The mist river is a pale translucent quad lying on it, a slab of glass (valley shot, about 1080-1600 × 790-1080
    in view).
  - The lamp tree on the drop is a black disc on a stick.
- **What works.** The moon behind the peak, the lamps at three depths with their moths, the woven door on its ledge.
  It is still the area's best promise of the road.

**Why it matters.** The way out is the frame the player carries out. `art-direction.md`: depth by atmosphere, never
break the ordering. Overlapping translucent peaks break it.

**Fix** (render, `lantern/vista.ts`).
- **One range.**
  - The peaks share a base silhouette: saddles between them, and ridgelines linking each summit to the next and down
    to the near hills.
  - Each layer is opaque, and nearer layers are darker and more saturated.
  - At least three depths of ridge: far (pale), mid, near (dark, firs on its line).
- **The valley.**
  - Break the floor into 3-4 rolling hill bands receding upward, the near one darkest, with fir silhouettes on the
    crests.
  - The lamp clusters sit on the hills.
  - The mist is a soft gradient lying in the folds between bands, never a flat quad.
- **The lamp tree.** A drawn tree (trunk, two or three limbs, an irregular crown) with its lamp hung from a limb and
  moths around it.
- **21:9.** The extra width shows more range, not more empty floor.

### 9. The hub is a crossing, not a place
**What.**
- **Size.** `cn-hub` is 4,480 × 2,304 (4.98 box screens, about 2.5 of air). The references' hubs:
  - Dirtmouth, 39 screens, 0 enemies, 6 locked doors;
  - Silksong's Bone Bottom, 40 air screens (about 13.5 of ours in hero heights), 13 exits;
  - Nine Sols' Pavilion, 11.7 air screens (about 7.5 of ours).
- **What it has.** Ours holds a landing, a seed door, a covered hoard and six exits stacked in one slab-framed
  frame.
- **How it gets crossed.** The bots crossed it in 14-35 s each time. It is never somewhere to be.
- **No big room anywhere.** The exact data's clearest new fact is that every reference has one huge place (King's
  Pass 34 screens, Dirtmouth, Bone Bottom, Nine Sols' lift shaft). Our largest room is 6.2 screens.

**Why it matters.**
- README fact 10: the hub is quiet and crossed often. It is where the moon, the locks and the next ability's doors
  are learned.
- Fact 8: locks are shown long before keys. Our hub shows one lock (the seed door).

**Fix** (level). One pass: widen the hub to about 8,000 × 2,560 (about 10 box screens) by moving the fork's band east
by 3,520.
- A quiet clearing in the middle with the moon over it and no enemy.
- `p-crossing` at its heart, with the moth kin there.
- The seed door, the fork's way, the tunnel's mouth and the trunk's door all visible from the landing.
- Two more shown locks: a glide gap toward the gap room's sky (the glide is learned later), and a rotten wall too
  high for anything but the claws.
- Re-run the solver. The critical path is unchanged.

### 10. Secrets are niches, not places, and none hides a route
**What.**
- **The size.** 19 covers. Median about 450 × 320 (the bank 512 × 576, the pit 448 × 320, the kin 640 × 320, the
  hollow 320 × 384). HK's 18 dark pockets have a median of 1,210 × 790, about 6× the area, and Nine Sols' covers
  about 770 × 375. Ori's fading-art pockets (about 530 × 355) are our size, so size alone is not the fault; Ori
  makes up for it with a pocket a median 644 px off the route in every stretch.
- **What they hide.** Ours hide an item in a niche. Nine Sols' 19 covers hide 15 routes on the critical path (vents,
  tubes, alternate ways). HK's King's Pass teaches "dark edge = room" with 4 of them in the first room.
- **The counts are fine.** 31 majors, 17 bark walls, three moon shards. The hidden share (0.67) is inflated: whole
  branch rooms count as hidden in `HIDDEN_ROOMS`.

**Why it matters.** A secret the size of a niche is a pickup. A secret the size of a view is a place, and one that
hides a route changes how the player moves.

**Fix** (level).
- **Grow four pockets on the path to at least 768 × 448**, each with something to do inside, not only a glint pile
  (a pod to break, a small climb, a moth to free):
  - the hub's bank;
  - the fork's stone pocket (`stone-cover` 128 × 576);
  - the Grove's pit wall (`pit-cover` 1024 × 1344);
  - the bower's kin (`kin-cover` 64 × 704).
- **Two covered routes:**
  - a vent from the well's landing (2432) west to the limbs, behind a cover in the landing's west wall. It is a short
    way home after leg 2 and a second line for the return visit.
  - a covered tube in the tunnel's roof (about 2300-3500 × 1500) over the pit, an alternative to the pit's floor
    line.
- **The first-minute lesson.** One dark-edged pocket in `cn-hatch` (the branch end, about 5000 × 1300, under the
  limb) holding three glints, so "dark edge = room" is learned before the hub.

## Smaller notes
- **The bots, as evidence.**
  - Two things in their runs are plainly real for people: the well's bottom (#1) and the Grove's fades at the root
    step (#5).
  - The fork's `thorn-pit` (2240-2432) took 5-9 hits and two fades per fork bot at (2321, 1385). A pit 192 wide on
    the main floor is fine for people; leave it.
  - Teaching `lines.ts` to read strips is worth one pass, but a person's run is worth more.
  - **Round 6 still needs one human run (Matt) from the hatch to the Grove.** It has been asked for twice.
- **The bots' 1.4 s well ↔ rot flips** (4-6 per run) are the bots stepping back over the doorway. They are not a
  transition bug: the rot corridor's floor and the well's bottom line up (1472 / 4928). #1 removes the doorway from
  the well's side anyway.
- **The hub's moth kin** stands on the landing at 16:10. It reads as a second Wing at a glance (same size and
  silhouette). Give it a different value (paler, older wings) or a different pose.
- **Thorns on the Grove entry's roof** (`thorn-roof`, 1400-1656 × 192): the barbs read, but no ledge under it is
  within a jump of it (the entry tier at 576 is 350 px below). Unless a wall kick is meant to reach it, it is
  decoration with a hazard's cost to the eye. Drop it to a reachable
  height on a line she takes (the glide out over the pit), or cut it.
- **The den's shelves** (1088, 384 wide) read as thin planks on one stalk, each with a bounce cap on it. They work.
  The cap on a shelf the boss cannot reach is free height in phase 3. Check it is meant.
- **21:9 and 16:10.** The way out and the hub hold at both with nothing cut. The 21:9 vista's lower 40% is the flat
  valley floor (#8).
- **The free double jump** on a placed player is still zeroed by the harness (as r4).

## Scores (1-10, against the HK / Silksong / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | r4 | **r5** | one line |
|---|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | 6.5 | **6.5** | the west shut until the claws, the way east lit, the Elder a return; the well's bottom still opens west beside the claws, the hub is a crossing, and no room is bigger than 6 screens |
| density | 4 | 5 | 6 | 6.5 | **6** | enemies in range and a two-beat peak; measured against the exact references the travel is bare: half their hazard per screen, no props to hit, 8 ledges against Nine Sols' 143 |
| combat | 3 | 4 | 5 | 5.5 | **6** | two beats, a lampwing, wider shelves, a phase 3 you can see; no lock-in, beat 2 a knot on her landing, the root step over thorns |
| traversal | - | - | 4 | 4.5 | **6** | every climb fair to a 16-frame delay with one-leg returns; 7 of 12 are one face, none needs two changes of wall, and the way out is a kick |
| secrets | 2 | 5 | 6 | 6.5 | **6.5** | covers honest to the bots now, three shards, a lock shown in the hub; pockets are niches a sixth of HK's, and none hides a route |
| readability / look | 5 | 4 | 5 | 6 | **6.5** | five looks you can tell apart, thorns that read, a snuff you see, a fuller vista; straight-edged slabs with the detail inside them, two stock props in 5-7 rooms each, planters and a truss, two browns, a range of separate triangles |
| pacing | 3 | 5 | 5 | 4.5 | **5.5** | no more difficulty spike at minute 3, a save on the landing; the movement curve peaks at the Spire's neck and ends on the easiest climb; no save between the hub and the bower across the peak |

**Overall: 6 / 10 against the references** (r1: 3.5, r2: 4.5, r3: 5.5, r4: 5.5).

The first real step since round 3. A person can now play the critical path without hitting a wall, the west no
longer swallows a player without the claws, and the area has five places and a boss whose phase you can see. It is
not a 9 because the travel between its two peaks (the Grove and the den) asks nothing of the movement, and its masses
still read as boxes next to any reference frame.

**What improved since round 4:**
- the climbs are fair, by a test that plays like a person;
- the rot branch is shut until the claws, and the claws come at 1:02;
- the fork's face is climbed, and the Grove's wave is fought;
- the thorns read;
- five looks show, and the west is lit;
- the den's phase 3 darkens;
- the vista has a range and lamps at depth;
- the checker, the seam and the flaps are gone;
- the roost is a nest.

**What didn't:**
- the clawed player still loops the west, now through the well's bottom;
- the climbs went from traps to ladders;
- the masses are still slabs, now textured inside;
- two new stock props, and the planters;
- the wave is not an arena;
- the vista's shapes are separate and see-through.

**Conclusions changed by the exact references:**
- thorns are under-used (round 4 said over-used);
- minors are not a problem (round 4 said 6-10×);
- the references are more solid than we are;
- our rooms are the right size, but we lack the one big place every reference has;
- density between fights is a gap of furniture (hazard, props, ledges), not of creatures.

Round 6 should not add rooms beyond the hub's widening. It should:
1. make the well's bottom a one-way start;
2. give the climbs a second element and the way out its exam;
3. furnish the travel to the exact numbers;
4. move the masses' detail to the edge.

## Round 6: the ten fixes, ranked by impact

Each is one builder pass. The coordinates are in the problems above.
1. **[level] The well's bottom as a start, not a fork (#1).**
   - `claw-prize` on the bottom floor (about 1300 × 4928).
   - `rot-wall` becomes a shortcut that opens from the rot side.
   - `p-well` and `stone-west` up to the mouth's floor (about 2300 × 3200).
   - A light at the mouth seen from the bottom.
   - Pass: two of three start bots on the landing within 4 min.
2. **[level] Climbs with a second element, and the way out as the exam (#2).**
   - The way out in three legs with two changes of wall and a rest between.
   - A lampwing on the well's leg 3 (1500-1900).
   - A shard or glint line on the thorned face of the well's leg 2 and the Elder's leg 2.
   - All held by `canopy-climbs` at 0 / 6 / 10 with 64 px margins.
3. **[level] Furnish the travel to the exact numbers (#3).**
   - Hazard 6,800 → about 12,000 px in 256-640 px strips on the travel: limbs, gap, tunnel, hub, crown.
   - About 30 pods or breakable props (paid from the hoards).
   - 20-30 small ledges or knuckles in the tall halls.
   - `metrics.ts`: things to hit plus ledges ≥ 0.8 per air screen.
4. **[render] Edges, not insides (#4).**
   - Lobed outlines (60-200 px lobes every 100-250 px; claw faces within ±12 px).
   - A 30-60 px lit moss band on tops, and a 60-200 px root and moss fringe under every ceiling.
   - Interiors flattened.
   - Standing stalk and fern silhouettes on tops.
   - First: the well's chimney walls, the hub's east block, the way out's blocks, the trunk's tiers.
   - A no-straight-edge-over-300-px shot test.
5. **[level] The Grove's wave as an arena (#5).**
   - A west root gate on `pit-wave`; beat 1 asleep until then.
   - Beat 2 spread: juveniles from about 1700 and 2950, the dangler from the crown, the lampwing as now.
   - The root step moved off the thorn bed (2304-2496 × 1376).
   - `p-grove` at the entry ledge (about 400 × 576).
   - A visible gate release.
6. **[render] Stock props and human objects (#6).**
   - Burls and hangs from 3-4 families each, no family in more than 3 rooms, held by a contact-sheet test.
   - One-ways grown from a wall or root, never hung on ropes: the hub's swing and the Grove's step.
   - The seed door as a woven root mat.
   - Claw faces never painted as tapers: the fork's face.
   - The taproot 160-220 px thick.
7. **[render] The backs (#7).**
   - A mid-value plane at about 0.93 parallax in every look (25-40% coverage).
   - Heartwood grain in diagonal broken panels, no bands or rings.
   - Den split from heartwood by value pattern (cool umber, lit from below), with the den added to the desaturated
     test.
   - Canopy posts varied 3:1, forked, at most four a view.
8. **[render] The vista as one range (#8).**
   - Shared base and saddles, opaque layers at three depths.
   - The valley in 3-4 receding hill bands with firs.
   - Mist in the folds.
   - A drawn lamp tree.
   - 21:9 shows more range, not more floor.
9. **[level] The hub as a place (#9).**
   - Widened to about 8,000 × 2,560 (the fork band east 3,520).
   - A quiet moonlit clearing with the save and the kin.
   - Every exit seen from the landing.
   - Two more shown locks: a glide gap and a high rotten wall.
10. **[level] Secrets as places and routes (#10).**
    - Four path pockets grown to ≥ 768 × 448 with something to do inside: the bank, the stone pocket, the pit wall,
      the kin.
    - A covered vent from the well's landing to the limbs, and a covered tube over the tunnel's pit.
    - One dark-edged pocket in the hatch.

Then a person plays from the hatch to the Grove, and that run is the next review's evidence.
