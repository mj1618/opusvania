# The Canopy: the first area built to the reference numbers (v9, 2026-10-31)

Design, room list and measurements: docs/design/levels/first-area.md; reviews that drove it:
docs/design/levels/reviews/canopy-r1.md .. canopy-r8.md; the reference data: docs/design/reference-levels/ (all four
exact since 2026-10-30).
Open: `?world=canopy&fresh` (27 rooms `cn-*`).

## How it is made (tools/levels/canopy.ts)
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`, then
  `npx tsx tools/levels/canopy-check.ts` (world check + progression) and `npx tsx tools/solve/canopy.ts [room ...]`
  (~10 min for all 55 claims since r4 counts bark cuts). Edit the generator, never the JSON.
- `PLACE`: each room's world rect, **at least 2560 x 1440** (throws otherwise), packed in bands that share edges (no
  holes between rooms). `LINKS`: room pairs and the shared opening (`at` = floor y on a side edge, west x on a top /
  bottom edge; `span`; `one` = the side she drops from). The constructor carves 128 px into every opening.
- **Carve, then fill**: `cave()` (bitten outline: corners cut, roof stepped up to `ceil`, walls stepped back `w` / `e`;
  `skip` x ranges keep the roof flat), `hole()` (a plain rect: claw faces, corridors), `air()`; pieces that are their
  own solid carve themselves (`bark`, `gate`, `cap`); then `fill()`. After `fill`: `mass()`, `burl()` (tiers narrowing
  up), `hang()` (tiers narrowing down, `keep` one face plumb), `limb()`, `tree()`, creatures, pickups.
- `back: true` (room) / `back()`; enclosed rooms get no moon (the constructor parks it). Every solid face takes the
  claws; `noClaws(x, y0, y1)` for a mass face, `limbNoClaws(x0, x1, top)` for a limb, `tree(..., kick)` defaults false.
- `finish()` throws if a rotten wall has air above / under it or a panel air beside it (r2: the rot cache was a
  hurdle), or a glint is stuck in mass. `dangler()` ties to the lowest roof within 320 px (bitten roofs move).
- `shortcut(id, ..., opens)`: the tunnel's door into the cellar (opens `w`, from the tunnel) and the cellar's trapdoor
  (opens `s`, from below); world routes use `door` (passable from `from`, the reverse only once open).
- Render (other builder) paints tapered stacks as terraces: prefer two big steps (`burl(..., 2)`) over many small.

## v9b (round 9's weak list): the tunnel's glide, the hawker, the chain's press
- **A glide lock wants a high take-off**: the glide gains ~2 px across for each px of drop, a jump ~0.4. v9's hump
  (256 over the far floor) let a jump held through land 25 px past the lip. v9b: the hump steps up from the west to a
  plumb east face that IS the pit's west wall (`PIT_W` 6080, top 1472, 384 over the far floor), pit 960, far face slick
  (`noClaws(PIT_E, ...)`). Highest ground at the lip: a step down by the lip is where people jump from.
- **`tools/levels/glide-probe.ts <room> <x> <y> <lipX> [--kit=] [--creatures] [--sweep --far=<x>]`**: every way across
  off a lip (jump, held, apex glide, late glide, walk-off glide, coyote jump + kick, jump + kick, and with `--creatures`
  the answers to a strike: check back, drop and re-glide, cut). The tunnel's numbers: jumps reach the thorns at
  6790-6828; glides land 7116 (late) to 7746 (walk-off); `--sweep` runs 36 arrival phases.
- **Thorns are a pogo** (HK's spike pogo: a down cut on them bounces her ~230 px on; the next touch hurts). A jump that
  reaches the thorns within ~250 px of the far lip crosses on one bounce: the explorer found it (`pogoR`). And **a lamp
  on a jump's descent is a pogo target too** (v9b's first try: the higher jump passed over `wick-pit` and bounced onto
  the lip). A lamp over a glide lock goes where only the glide passes (the far lip, 7000 x 1560).
- **The pit's hawker hunts her** (no `orbit`: on its clock the strike came whenever, and what she saw was the 6-frame
  pull-back): home under the roof over the pit's east half, `sight` 520 (the lip is 760 off), `guards` its lamp. Tell
  30 (`hawker.curiousFrames`; `creatures.test` holds it >= 30), a strike led to where her glide will be. Struck while
  gliding she is thrown on along it (`hawker.glideKnockVx` 8 / `glideKnockLift` 5; `touched(..., glide)`): every
  sweep phase still lands across. A check back (10 frames), a drop and a fresh glide, or a cut (an up cut when it is
  above) take no hit at all 36 phases of 36.
- **The fling keeps an early press** (`lures.flingBufferFrames` 8, `player.flingBuf`): a Lamp press in the cooldown
  after a fling still starts one for 8 frames while Lamp is held. The gap's lamp 2 (in reach 5 frames after lamp 1's
  release) took no press before +8; now any from +1. Only in the cooldown: a buffer on every unanswered press broke
  four of Lanternroot's stored lines (its glow rooms' Lamp verbs, mend / gust, take a press with no flame in reach).
- **Sim changes replay Lanternroot's tapes** (`proto-1-solve.test.ts`): the hawker's 30-frame tell moved one edge;
  `npx tsx tools/solve/proto-1.ts --write --edge=<id>` re-records it.
- **Bots**: a cell given up as "not reached in 45 s" gives up the rest of that ground (`giveUpGround`). The r9 run's
  skilled bot spent 45 s on each cell of the well's shard shelf in turn (100+ s). Their explorer still ranks every
  unwalked cell (rank 1) over exits (rank 3), so a door in frame waits until the room is walked.
- **route-video.ts v6**: the v9 route (gallery legs, the hollow's shard, the gap's chain and out by the fork, the
  warning's fight `until` `cn-tunnel-clear`).

## v9 (review r8): shape, frames, the second peak
- **Sealed air** (`sealDeep(d)` before `fill()`, `sealed(x0, y0, x1, y1)` by hand): mass more than `d` from any carved
  air or the room's edge becomes air she can never reach, with a back, listed in `marks.sealed`. The sim and the
  painter see air; `export-area.ts` (so the map, `metrics.ts`, `canopy-furniture.ts`) and the bots' map
  (`buildSurfaces`) see rock. Keep `d` >= 192 from anything reachable, and off the room's edge. **The bots walked at
  sealed floors for 45 s at a time until their map dropped them**: any new kind of unreachable air needs the same.
  Render painted the hub's sealed under-floor as the open sky backdrop, not the deep back (render's call).
- **Deep solid in frame**: `npx tsx tools/levels/canopy-frames.ts [room ...]` frames every wide stop with the real
  follow camera and its zones (headless, a second for all rooms) at 16:9 / 16:10 / 21:9 and prints look:check's
  deep share (> 96 px in); the bar is <= 30% a stop, a room's median <= 20%. It matched the review's numbers on v8.
- **The well is two climbing legs** (leg 1, leg 2's chimney), then the gallery: walked and jumped (terraces, a bough,
  a stair of one-ways under open air: a solid band over a stair step bumps the jump off it). A one-way stair needs
  no band within 272 px over any step's launch spot.
- **Fling lines**: `npx tsx tools/levels/fling-probe.ts <room> <lamp> <x> <y> [--set=<lamp>=x,y] [--glide] [--hold=]`
  prints every aim's flight off a lamp (lamps it brings into reach, landing, thorns). Reach is 110 px from her centre,
  so two aims off one lamp only share a third lamp within ~300 px of it (the paths fan out). After a fling, the next
  lamp can be in reach inside the 8-frame `flingCooldown` (v9b: the press is kept, `flingBufferFrames`).
- **The glide is weak over a shallow drop**: a held ground jump opens the wings 16 px under the take-off, already
  falling fast. The long glide is from the apex (let go, press again) or a walk-off. v9b raised the tunnel's take-off
  to 384 over the far floor (above).
- **Peaks along the route**: `canopy-furniture.ts --route` (`ROUTE`: room-local points from the hatch to the den;
  sliding 2-screen windows, things within 640 x 360 of her line, glints out) and the hub-to-Grove climbing share.
  A full-frame window counted every room's walls and flattened everything (median 4.8).
- **A map station** (sim): `MoonPatch.map` / `hangs` (`mapStation`, `stoneHung`); the hub's `p-crossing`.
- **Every creature-waking trigger has a camera zone keyed to its wave** (`canopy-check.ts`).

## v8 (review r7): the first ten minutes
- **A required lesson in a room crossed once**: a fling lamp goes out for good when she lands, so a required fling on a
  way walked again (the hub) needs a second way (claws, or a `relight` lamp) or it softlocks. And a lamp can be cut
  down for good with the blade: a required one gets `relight` (the first lamp: 90 frames; never saved). The hatch is crossed
  once, its fall catch is the soft floor (a catch relights the embers). The gap is past a jump by a margin: the
  explorer's `offdj` (a walk-off, then jump held in coyote time) reached 51 px further than a running jump.
- **A fall catch's return gave a free double jump** (`placePlayer` -> `createPlayer` takes the tuning's): a player who
  did not own it crossed the first fling's gap after a miss. The catch / thorn return caps `dj` at what she owns now
  (src/sim/index.ts); a plain `placePlayer` (teleport, the harnesses) still carries one: the tools zero it.
- **Ambushes** (sim): `arrive: [[x, y], ...]` on a `wakes` spawn (the first point 400+ px from her when it shows, else
  the farthest; it travels from there to its spawn, harmless and out of reach); trigger `rearm: true` (until every
  creature it wakes is down, a fade or a new entry takes the flag back); a woken creature whose own `sets` is saved
  stays out (a cleared wave stays clear); `rearmArenas` takes a beat's flag back with its waking flag. Creatures that
  wait for a flag start hidden (`createLight`), so a flag set on the first step still arrives. Lay a trigger where
  she comes in (the drop's column, the landing off a block), not over the whole floor, and the spawns (homes) away
  from it: arrival shows them coming, it does not move where they act from.
- **Patches mark on a pass** (`tuning.patch.markOnPass`, `patchMark`): no more "stand still to save".
- **A lampwing with `dives: n`** tells nothing for `retellFrames` once tired or after touching her, and is harmless
  meanwhile (her climb past its hover was the hits, not its dives).
- **Climbs at delay 16** (`DELAYS` 0 / 6 / 10 / 16): what fails is a first touch near a face's foot (the slide takes
  it off). Fixes: carry the face down (a root lip or column), raise the start (a root lip out of the rest), or jump
  from nearer the face. `drop: true` plans walk off a lip (a slide down onto a reward). The neck's column made the
  Spire's foot climb run on up to the bower: either ends `spire-1` now.
- **Lamps near a glide lock**: any lamp west of ~3,200 at 1,550-1,700 in the gap lets a clawed player fling up-left
  onto the far limb (the lit proofs): a fling carries ~1,000 px from low in the gap. Put chain lamps on each other's
  lines by moving the first, not the second.
- **The spread, round 8's bar** (`canopy-furniture.ts --check`): two rooms at >= 4x the median (the Grove, the tunnel
  at 7.0), a path room before the Grove at <= 0.8 (the fork), no three path rooms in a row within 20%, quiet >= 5
  (the burrow is the nest now). A peak in an 8.4-screen room needs ~57 things: count before promising one.
- **The den's escape shelves are one-ways**: a solid shelf over a boss's floor is a roof its ram stops under (the v7
  video: a free safe spot under and on the west shelf).

## v7 (review r6): peaks and quiet, not even coverage
- **Measure the spread, not the totals** (review r6 #1: v6 met every total and got flatter). `canopy-furniture.ts
  --check --rooms` (after `export-area.ts canopy`): things per box screen room by room (enemies, pickups, pods, bark,
  lamps, thorn strips, one-ways), their CV, rooms under 0.5, the busiest over the median, the share of thorn length in
  runs >= 640. Round 7's bar: CV >= 0.8, >= 6 quiet rooms, peak >= 5x median, >= 50% long runs, thorns in <= 14
  rooms, thorns >= 10,800 px, hit + ledges >= 1.5 per air screen. Reproduces the review's numbers exactly (population
  sd, raw box screens, hazards hero-scaled).
- **What moves the spread**: every thorn strip, glint, lamp and knuckle is one thing, whatever its size. Quiet rooms
  are near empty (a 1.8-screen room must hold 0 things to be under 0.5; a 2.4-screen one 1), so a quiet dead end pays
  one major. The peak (the Grove) needs ~9 a screen. The median falls by thinning the middle rooms (one find, no
  hoard), not by emptying the loud ones. Join trays into runs (one strip of 1,664 is one thing, 7 trays are 7).
- **Long runs and drops**: a run under a ledge she runs off lands her in it (the trunk's tier 1: a full-speed run off
  the top's lip travels ~190 px over a 192 drop): start the knuckle line where she comes down. A knuckle near a glide
  lock's lip is a skip (the gap: only east of x 2700 at y >= 2048).
- **Patches stand on solid ground, 128 wide and 192 clear** (the scene check): not on a one-way root; the well's
  `p-hollow` sits in the 128 px between the ambush block and the chimney.
- **A gate does not tie a dangler** (the scene check wants a solid's underside or a one-way): the Grove's wave dangler
  hangs under the Grovemother's trunk. A flyer's territory + 100 must hold no pod or great (the scene check).
- **Lamps' cores clear of solids** (40 px for a wick): mind the overhangs.
- **Fling lines in the proofs**: `tools/solve/canopy.ts` claims take `lit: true` (lamps burn, `keepLamps`), and every
  lock claim in a room with an unconditional wick runs a second time lit (`... lit` in the output). A fling west from
  a lamp carries ~400-500 px (15 px/f kept at 0.97 a frame) plus her air control: keep lamps that far from any lip
  a lock guards.
- **climbs.ts with creatures** (`runClimb(..., { creatures: true })`, `--creatures`, `CREATURE_CLIMBS`, `restSafe`): a
  lampwing notices her at 260 px; one 456 px over a rest never dives at her there (the rest is safe), so "watch its
  dive from the rest" needs her to draw it (hops on the lip). The plain plan past it takes 0-1 hits from two starts
  of three.
- **Grown rooms keep their world coords**: the tunnel and burrow grew 3,520 west (`TX`), their old content `+ TX`; the
  links' `at` are world px and did not move. The hollow root grew 480 down (the map's east edge).
- **The arena gates** (`arena-w`, `arena-e`, h 64 under y 1088, `shut: cn-grove-wave`): a gate is carved air plus its
  own solid; the zone `fit` + `until: cn-grove-clear` frames the pit.
- **Rewards**: majors are glades 2 + upgrades 4 + seeds 3 + stones 5 + moon shards 6 + greats; at 23 that leaves 3
  greats (the review's "greats 6" and "majors <= 23" cannot both hold).

## v6 (review r5): what changed in how it is built
- **The hub is 8,000 wide** (`HX` = 3520: the old hub's content sits that far east in it) and the west rooms (limbs,
  trunk, well, rot, crawl, webs, elder) moved 3,520 west with it; their top / bottom links' `at` (world x) moved too.
  It leaves a notch in the map under the hub's west half (open to the bottom), the one hole the bands now have.
- **An arena's door** (`gates[].shut`, src/sim/kit.ts `gateShut` / `rearmArenas`): open until the `shut` flag (a
  trigger's), then a solid until `flag`; a fade while it stands takes `shut` back out of the save (the door opens
  behind her as she re-forms, the trigger shuts it again: HK's lock-in, never a locked-out softlock). `gateShut`
  event for render / audio. The Grove: `pit-door` at the entry corridor's lip, east of `p-grove`.
  `tests/unit/canopy-arena.test.ts`.
- **A door shut from one side sits in the room it is shut from**: `rot-wall` is a shortcut in the well's corridor
  (opens `e`, from the rot hall), not in the rot room (the explorer, and a person, walked into the rot room first).
- **Rests and strips** (the way out, v6): each strip over a rest guards the face she must not take on the next leg;
  it must sit above the apex of the leg below's last kick into that rest (~200 px over its floor: a 384 px rest
  opening takes it) and below the next leg's touches on that face + their slide (a plug bump drops her 100-150 px:
  cut a plug on the leg whose face is clean below it). Leg 3's slick corner (`noClaws` on the west block over rest W)
  stops "one face" without a strip there.
- **climbs.ts plans**: `back` (walk out of a rest onto its lip, then jump the other way), `hops` (jumps in place with
  up cuts), `takes` (pickups it must have), `delays` / `margin` (a risk plan for a reward over a strip is held at
  0 / 6 with half the margin, 32).
- **Pods** sit through `pad()` (a limb's rolling rects levelled under the box; else "inside a solid"); none within a
  flyer's territory (the scene check throws).
- **Covers** run 64 px into the mass round the hollow (render's interior plan makes a cover a back, inset 48: an edge
  probing air reads as torn, `wood-looks.test.ts`).
- **Hidden routes** keep their locks with slick faces: the tunnel's tube drops onto the hump down a shaft whose faces
  refuse the claws, and the nearest climbable face is 256 px away (a kick off it reaches 2,368 but not 2,560).
- `npx tsx tools/levels/canopy-furniture.ts` (after `export-area.ts canopy`): thorns, things to hit, one-ways per
  air screen in hero heights for the four references and the Canopy.
- **Two-tier burls are props with a family** (render's `propFamilies`, `wood-props.test.ts`: five burl families, none
  in more than three rooms): the Canopy holds about 15 burl tapers in all. A hump that only needs to be ground is
  `burl(..., 1)` (one rect, not a taper); knuckles to stand on are one-ways.

## Climbs as set pieces (r4, review r3 #1)
- **Bots find bugs; they are not the bar.** v3 flattened every climb to one clean face for the bots; r4 put the
  moves back and taught the bots instead: the explorer's `chimneyMacros()` (tools/solve/explore.ts: `zig<dir><n>`
  = a full jump at a face, `n` kicks on it, then a kick across at every touch; `u` up cuts (a plug), `o` out from
  under a lip first, `zig?9f` up one face cutting forward on each swing back in) and the human bots' `zigLine` /
  `zigCandidates` (tools/playtest/lines.ts, offered for any climb with an opposite face 200-700 px across).
- **Measured**: a kick across a 384 px chimney rises ~222 px (31 frames), a kick up one face ~235. A 512 px chimney
  *loses* ~47 px a crossing, 640 more: chimneys meant for kicks across are 384 wide.
- **r4's strips were frame-perfect** (review r4 #1): laid in the gaps between one zig's touches with ~20 px margins,
  they passed only at a kick delay of 0-4 frames from one start x. A late kick slides her 20-40 px lower and the
  error adds up kick by kick (touches drift ~17-34 px a kick at a 6-10 frame delay), so a strip that picks the phase
  is a trap for a person.
- **v5's rule: a strip on one face at a time, a clean stretch on both where she changes wall.** A person reads
  "thorns on that wall: climb this one, cross above them". Climbing one face is always possible (one wall is
  enough: movement-controller.md), so the strips decide which face, never when. A change of wall needs ~470 px
  between the strip she leaves behind and the one ahead (her touch on the old face >= 64 below the strip over it,
  the touch on the new face, ~222 higher, >= 64 above the strip under it, over a 235 px kick spacing and the drift);
  shorter legs get one strip. A face that starts a climb reaches within ~190 px of the floor (a late kick at a
  falling touch slides off a face's foot: root lips, `mass(x, y, 64, 128)`). A rest in a chimney wall gets a root
  lip into the chimney (`oneWay(face, floor, 128)`): from its end the far face is a jump away (a standing jump from
  inside the rest misses the far face and falls down the leg below).
- **The fairness test** (`tools/levels/climbs.ts` CLIMBS + `tests/unit/canopy-climbs.test.ts`): every required climb
  (and the Elder) from three start x on its rest, a person's plan (`face` legs: kick up this face until a touch at or
  over `until`, then across; `zig`; `away` out from under a lip; `jumpAt` walk to the lip first; `cut` up cuts), at
  kick delays 0 / 6 / 10 with every strip grown 64 px at both ends; `fails` plans (one face only) must hit a strip,
  and the thorn must put her back on the rest she started from. CLI: `npx tsx tools/levels/climbs.ts [id] [--margin
  64]` prints every touch. Lay a strip from the CLI's touches, then run the test.
- `canopy-probe.ts` still plays the explorer's macros (frame-perfect zigs) for the proofs.
- **Plugs** (`plug()`): rotten bark lying across a chimney, a wall panel (every cut takes it, an up cut too),
  checked solid either side by `finish()`. The explorer counts bark cuts left in its node key (`barkHp: true`):
  a wall high on a claw face takes one cut a climb. A plug cut from below must not hide the only way to a side
  passage under it (the Elder's first plug sat under its passage: the well unreachable).
- **A thorn returns her to the last ground she stood on** (`groundX/Y`, any length of time, not `safeX`): r4's
  climber who went over leg 1's top straight into the chimney was sent 1,700 px down. v5: the chimney stands east of
  leg 1's top under the mouth's roof, so she lands on the mouth's floor first. Ground near a living creature is not
  ground for this (`safeEnemyPx` 200): no creature keeps a rest (r4's landing lampwing). A rolling limb can fail it
  too (her centre over a rect 4 px lower than the one she stands on).
- **The return walk could end inside a wall** (fixed in src/sim/return.ts, r5): `clearOfThorns` steps back along the
  top's rect, and the well landing's floor rect ran west under the mass and a rotten wall: she was put inside the
  bark and squeezed up 1,500 px. It now stops at the first spot her box does not fit.
- `npx tsx tools/levels/canopy-map.ts <room> [cell]`: the generated room in ASCII (`k` faces refusing claws, `e`
  creatures, `*` finds, `L` lamps, `P` patches).

## Gotchas (v3, still true)
- **Floor thorns sit in a shallow pit** (64 deep, r5): a flat bed on the way is floor the human bots (and tired
  people) walk into; a pit reads as a gap and gets jumped. Tier 2's bed under its 256 px roof was unjumpable: a
  jump bumped the roof and came down in it from any lip (the roof lifts over it now). Check a bed under a low roof
  with a real jump.
- **A creature spawned inside a kit solid is sealed in** (v4 video: the Grove wave's juveniles inside the bounce
  caps: never move, never cut, the wave's gate never opens). `finish()` now throws on a spawn inside a solid, cap,
  gate or bark (walkers probed at their feet and shoulders).
- **The den's solid shelves vs phase 3**: a ram pulls up under any roof lower than `strikeHeadroomPx` (200; v4's
  shelves left 160, so phase 3 opened only on a wall or the taproot, won by waiting by the root: fight.ts `DEN_HOLD`).
  v5: the shelves are at 1088 (256 over the floor, a full jump), 384 wide, 224 clear underneath. Any roof a boss
  rams under keeps >= 200.
- Rests carved into a wall must be **384 px tall** (a jump from the rest at once; a 256 niche bumps her head).
  Thin shelves sticking out of a wall are not rests: the human bot tries to climb their 48 px faces.
- **A ledge under a corridor's roof**: a step inside a 192 px corridor may be at most ~110 tall (she is 80).
- **A bitten cave corner can seal a doorway** (the den's balcony, v3: found only on video). Proofs now check
  `place:<id>` (feet at a `marks.places` point): add one for every entry that must reach the next floor.
- **Solids near the top edge of a `back` room**: the room has `roof: true` (sim: solid above y 0 except an `n`
  exit's span), so nothing stands on its top or flies out over a wall (the tunnel, review r3 #2).
- **A face must reach within ~250 px of the floor** to start a climb (the well's east face, the out chimney's step).
- **Thorns where a one-way drop lands are a trap**: the return puts her back on the ledge above (trunk thorn-t1 kept
  all three bots out of the giant's hall). Same for thorns in a low corridor on the only way (the well's).
- A shaft's top must open into something (the Elder's shaft was a closed tube under its gallery: check the map).
- A solid tree on a ledge blocks the walk along it; a limb end is a claw hold from below (the way out's return
  limb). A mass face above an exit takes the claws too: a climb there can reach what a jump cannot (the fork).
- The Grovemother stands on painted stilts (`stilt-w/e`, non-solid): a solid trunk to the pit floor walled the
  room in two.
- **A gated wave** (the Grove pit): a trigger sets a flag, creatures with `wakes: <flag>` appear; every creature
  carrying the same `sets` flag must die before it is set (src/sim/kit.ts, r4), and a gate on that flag opens. The
  explorer has no creatures: claims pass the flag in `flags`, and a lock claim checks the gate holds without it.
- **The old burrback's `snuffs`**: a lamp id that goes out as its phase 3 begins (the den darkens).
- **Moon shards** (`moonShard` hollows, flag `moonShard:<room>:<id>`): three make a light (`tuning.upgrades
  .moonShard.perLight`). The Canopy has three: the well's landing niche, the Elder's top, the larder.
- `phased` is not a spawn field: the old burrback's three phases come from `tuning.oldBurrback.phased` (true by
  default); the den only sets `taproot`.
- **Debug a failing claim**: `CANOPY_MAP=1 npx tsx tools/solve/canopy.ts <room>` prints the room in 64 px cells
  (`#` solid, `^` thorns, `B` bark, `G` gate / shortcut, `o` where the explorer stood).
- The placed player's free double jump is still zeroed by the harness (`createPlayer` sets `dj` from tuning); a fall
  catch's or thorn's return caps it at what she owns since r8.

## The human-like bots (npm run humanplay)
- `--from <room> --abilities wallJump` (with `--world`): a run that starts mid-area (r4: from the fork).
- They head away from the side of the room they entered on (`wayOn`: landing east of the hub's middle sends them
  west) and skip anything 900 px behind once an exit ahead is seen. v2's hub (landing west of the middle) sent all
  three east to the fork; v3 sends all three west to the claws.
- Runs: playtest-reports/canopy-r3, canopy-r4 and canopy-r4-fork (first-area.md has the numbers). r4: they take
  the claws and loop the west; two or three tries at the well's chimney, then away.
- r5 (canopy-r5, canopy-r5-fork): claws at ~1:05, then loops of well / rot / trunk (their chimney lines choose the
  face from the map and climb leg 2's thorned east face); from the fork two of three climb the claw face and fight
  the Grove's wave. They see no pickup under a cover until inside it or its bark is broken (observe.ts, r5: the
  hub's covered hoard drew six jumps in r4). They walk into flat floor thorns: put beds in shallow pits.
- r6 (canopy-r6, canopy-r6-fork): all three start bots on the well's landing in 1:36-3:53 (the bottom as a start
  works), none past leg 3 (2,070-2,170), well <-> trunk loops after. A pit a bot meets before the claws must be a
  plain jump (the hub's 448 px pit turned all three back); no thorns where a limb's drop lands (the hub's east pit).
- r7 (canopy-r7): all three up leg 3 to the hollow (8:36, 8:55, 23:12; r6 none), two fought the ambush, one left by
  the limbs; still well <-> trunk loops, leg 2's strip 6-15 hits a run. The bots rest at a patch only when they
  happen to stand still in it: the casual one never rested at `p-hollow`, so its ambush fades cost legs 2-3 again.
- r8: **they fling** (`FlingAim` in lines.ts: a lamp line presses Lamp when `flingTarget` finds a flame, sweeps the
  aims reading `lureArc`, lets go on the best; the Lamp key is in the motor's `BITS` in human.ts: without it the
  lookahead flung and the hands never did, "did not go as foreseen"). v7's still played the old catch. Their old
  lamp-cut lines snuff lamps for good: a required lamp must `relight`. r8 run (canopy-r8): all three out of the
  hatch in the first minute, two clear the hollow's ambush, none finds the shelf to the limbs.
- r9 (canopy-r9): claws at 1:22-2:19; the average and skilled bots in the hollow at 3:37-3:54, the average on the
  door's floor 14 s after the ambush, then off to explore (the shard's shelf they cannot fling to, the well's bottom);
  none to the limbs. Their explorer chases unwalked ground before exits.
- r6: **they read strips** (lines.ts: a climb move whose face has a thorn strip in its span offers the clean far face
  first, `wall climb (the far face: ...)`, and `humanPick` takes it first).

## Measuring
`npx tsx tools/reference/export-area.ts canopy` (`CRITICAL`, `HIDDEN_ROOMS` there; `onCriticalPath` now from
`CRITICAL`) then `area-svg.ts` / `svg-png.ts` / `metrics.ts --md`. Lamps, pods, patches and every ant count as busy
cells: thin them to get empty screens.
