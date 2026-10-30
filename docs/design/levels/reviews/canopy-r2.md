# The Canopy, review round 2 (2026-10-30)

Reviewer brief: judge the Canopy v2 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 24 rooms `cn-*`) against the
first areas of Hollow Knight, Ori and Nine Sols, as a player and as a designer, and say what changed since round 1
(`canopy-r1.md`). Sources used: `canopy-v2-brief.md`, `first-area.md`, `memory/canopy.md`, the reference README and
write-ups, the map re-exported and drawn at one scale (`ours/canopy/map.png` next to Ori's and HK's `common.png`),
`metrics.ts` against the three references, every wide shot in `shots/canopy-v2/`, per-room counts read from
`content/worlds/canopy-rooms.json`, and probes in a `-s=review2` session (`goto`, `input`, `enemies()`, `pickups()`).
All coordinates are room-local px, as in the generator, unless marked world.

## The short version

v2 did the hard structural thing round 1 asked for. The map now reads as a cave: black mass with rooms carved out of it
(43% solid against 9%), 24 rooms instead of 6, 14 on the critical path (58%), ten one-exit pockets, a peak that waits
for the first ability, and real rewards behind walls. On paper it is now a first area.

On screen it is not, for three reasons:
- **The carving is still boxes.** Every cave is an axis-aligned rect. The renderer paints those rects faithfully: flat
  tops, plumb faces, pillars with flared "capitals", ceilings like joists.
- **Every enclosed room has the same back wall.** 17 of 24 rooms show it: horizontal blue planks with zigzag black
  sticks, nearly black. A hollow trunk, a root tunnel, an earth den and a hidden attic all look like the inside of a
  wooden shed.
- **The rooms are too dark to read.** Firefly lamps are almost the only light, and there is no bioluminescence, no rim
  light and no depth.

The ending is also broken: the old burrback in the den is **not drawn at all**. It is an invisible single-phase
beetle in a flat box. Round 1's line still holds in a new form: the averages are met, and the place is not yet there.

What works, and should be kept:
- **The macro structure.** Pre-claws, the only way on is down the fallen giant to the well, as in Ori's Wall Jump
  hollow. The fork's claw face shows the Grove early, and the Grove is the claws' reward. The glide is used one room
  after the crown. Three seeds open the door, and two loops close back into the hub.
- **The hub landing** (`cn-hub` landing shot). The seed door with its three sockets sits in frame below her, the
  lampoak's socket cages hang top right, and Tatter stands beside her. This is the best-composed frame in the area.
- **The claw ambush.** The claws wake it (`wakes: 'wallJump'`, `cn-well` 192-1728 × 384-1152) in a closed hollow
  whose way out is the new verb.
- **Falls cost something now.** There are thorn floors in the limbs, the gap and the fork pit, and no catches outside
  the hatch.
- **Real rewards.** There are three moonDrops (each one more light, `upgrades.ts`), five moth-stones, long breath,
  night eyes and quick wings. Round 1 found only tweaks.
- **The crown** (`cn-crown`): the huge low moon behind the zigzag limbs is the one frame in the area that could sit
  next to Ori.

## Since round 1, problem by problem

| r1 # | problem | v2 | verdict |
|---|---|---|---|
| 1 | six rooms, one road | 24 rooms, 58% critical, 10 pockets | **fixed in count**; the pockets are closets (see #5) |
| 2 | sky with logs, 9% solid | 43% solid, back walls, thorn floors | **fixed on the map**, but the solid is rects and the interiors one texture (#1, #2) |
| 3 | the peak at minute 2 | Grove behind the fork's claw face, ambush woken by claws | **fixed** |
| 4 | secrets signposted, few, small | 16 places painted as mass, real majors | **mostly fixed**; one is hop-over, none taught, 7 of 16 are floor panels (#6) |
| 5 | flat-log 1v1s, 1 hazard | 29 hazard runs, four fights with terrain | **improved**; the boss is broken (#3), 6 kinds still |
| 6 | travel with no problem | claw chimneys everywhere | **half**: vertical climbs replaced flat walks; nothing else is asked (#4) |
| 7 | the hub a log, locks off-screen | door in view, socket lamps, Tatter, high block | **fixed** |
| 8 | every room the same place | crown, gap, den, grove have own art | **half**: open rooms vary; 17 interiors are one shed (#1) |
| 9 | the area ends flat | closed arena, approach tunnel, balcony save | **half**: the boss is invisible and the reveal is a moon over a flat floor (#3, #8) |
| 10 | hero lost at entries | entries clear in every shot | **fixed** |

## The 10 most important problems, ranked

### 1. Every interior is the same dark shed
**What.**
- **One back wall for 17 rooms.** Every room with `back: true` paints the same wall: horizontal pale-blue grain
  stripes with black zigzag sticks across them. Those rooms are trunk, well, limbs, rot, crawl, elder, cellar,
  hollowroot, spire, nook, attic, sky, tunnel, burrow, den and ledge, plus the east half of the bower and the lower
  out. The "earth" rooms (tunnel, burrow, den, `mass: 'ground'`) are the same stripes with pebbles.
- **It reads as boards.** In `cn-trunk` seed and `cn-bower` hall it reads as horizontal boards: a barn or a crate,
  not heartwood, root or soil.
- **Too dark.** Measured by eye on the trunk, well, limbs, spire, tunnel and den shots, 90% of each frame sits in
  the darkest ~15% of value. The only lights are firefly lamps:
  - wick-t2 in the trunk;
  - wick-rot;
  - wick-tu and wick-tu2;
  - the den's two.
- **No glow.** The art direction's bioluminescence (cyan-white, rare violet) appears nowhere. `cn-spire` and
  `cn-well` shaft are near-black frames with a hero and three glints.
- **No depth.** The art direction's depth by atmosphere has nothing to work on: inside, there is one flat wall at one
  depth and the playfield in front of it.

**Why it matters.**
- The art direction asks that the picture never show the collision boxes, and for depth layers, a key light and small
  precious lights.
- The references' interiors are their most distinctive places: HK's Crossroads (blue-grey shells and lamp posts),
  Ori's Spirit Caverns (cyan crystal glow, layered rock), and Nine Sols' Apeman Facility (lit machinery in front of
  dark rock).
- Here, two thirds of the area's rooms share one look, so round 1's "every room looks like the same place" is back in
  a new form. A player cannot tell the trunk from the tunnel from the attic, and a cave you cannot tell apart cannot
  be learned. That makes it a layout problem as much as an art one.

**Fix.** One render pass, in `pf-mass.ts` and the back-wall painter.
- **Back walls per material.**
  - `root` (wood interiors): vertical fibre, the grain running along the trunk's length, with a second, darker
    parallax layer of roots and a fog band between.
  - `ground` (deep): packed earth with hanging root curtains, stones and no boards.
  - A per-room tint from `art.moods`: west deep teal, east moss green, deep warm umber.
- **A light budget per enclosed screen.** Each enclosed screen gets at least one non-lamp light: cyan moss clusters
  on tops (`#9ff3ff`), a glow fungus on a face, or a moonlight shaft through a crack. Concretely:
  - the trunk's alcove: a shaft from (1696, 64) onto the seed;
  - a cyan fungus band on the well shaft every ~600 px;
  - glow worms along the tunnel ceiling at 1280.
- **Lit tops.** The walk tops must be the highest local contrast in every frame. Raise the moss rim's value in
  enclosed rooms.
- **Check.** Re-shoot every `back` room and compare the trunk, tunnel and attic shots side by side: they must read as
  three places.

### 2. The caves are rectangles, and the small rooms are framed boxes in the sky
**What.**
- **Rect carving.** Every cave is an `air()` rect, and every `mass()` is a rect. The painter rounds their corners but
  keeps their silhouettes, so the collision shows everywhere:
  - pillars with flared tops in the trunk: `mass(1600, 320, 192, 384)` and `mass(1856, 512, 192, 192)`, which read as
    Greek columns;
  - the tunnel humps `mass(1280, 1664, 224, 192)` and `(2560, 1600, 320, 256)`, which read as stone pedestals;
  - the fork knoll `mass(1664, 1088, 384, 192)`;
  - the hub's high block (0-896 × 576-1280), a flat-topped cube;
  - the ledge's `mass(768, 640, 256, 192)`;
  - the bower's roof, a black rectangle over the moon in the top shot;
  - the gap's roost, `mass(2880, 0, 64, 1280)` and `(3136, 0, 64, 1024)`: a black slab hanging out of the sky.
- **The map shows it too.** Beside Ori's `common.png`, Ori's air is winding tunnels two to four hero-heights tall,
  with ragged walls, diagonal runs and pockets on every side. Ours is beige rectangles. Several rooms are a single box
  of air: limbs (0-3200 × 256-1024), den (640-2560 × 448-1280), attic, sky.
- **Rooms smaller than the view.** Eight rooms are narrower than 1920 or shorter than 1080:

  | room | size |
  |---|---|
  | crawl | 1792 × 1024 |
  | elder | 1152 × 1152 |
  | cellar | 1920 × 896 |
  | hollowroot | 1472 × 1152 |
  | attic | 1536 × 896 |
  | sky | 1920 × 1024 |
  | burrow | 1920 × 1024 |
  | **spire** (on the critical path) | 1664 × 2176 |

  Their shots show a plank rectangle floating in parallax sky with a black border. At 21:9 (a 2520-wide view) every
  1920-wide room does the same: nook, out, ledge.
- **Holes between rooms.** The world map has unclaimed holes between rooms, e.g. world (8000-9600, 4224-4864) between
  the hub, the fork, the cellar and the tunnel.

**Why it matters.**
- "Collision is boxes; the picture must never show it" (`art-direction.md`). CLAUDE.md requires any window shape to be
  filled, and these rooms visibly don't fill even 16:9.
- A secret pocket that appears as a framed diorama in the sky is a box, not a hollow found inside a tree.
- HK, Ori and Nine Sols rooms are never smaller than their camera; HK's minimum is 1.5 screens.

**Fix.**
- **The generator** (`tools/levels/canopy.ts`).
  1. Make every `PLACE` rect at least **2560 × 1440**: 21:9 plus headroom. `fill()` makes the extra mass.
  2. Re-pack the world, and fill the holes between rooms by growing their neighbours.
  3. Replace plain `air()` with a carving helper that bites the outline. Ceilings vary 64-160 px every 192-320 px,
     walls step 32-96 px every 256 px, and floors keep the sim's 12 px roll on walk tops. Corners get chamfer cuts.
     Keep exits and claw faces straight where a mechanic needs them (`claws()`, `noClaws()`).
  4. Replace the box pillars and humps with tapered stacks: three rects narrowing upward (a root burl), or a limb with
     `parent: 'mass'`.
- **Render.** Outside a `back: true` room's rect, paint the room's mass, never the sky, so a camera clamp at any aspect
  shows rock.
- **Check.** Re-run `area-svg.ts` and compare the beige outlines with Ori's. Shoot every pocket at 16:9, 16:10 and 21:9.

### 3. The boss is invisible, single-phase and in a flat box
**What.**
- **Not drawn.** In `cn-den` the old burrback (`old-burr`, 1700, 1280) is simulated but not drawn. In my probe it
  woke, walked (`mode: walk`, box 1306-1562 × 1126-1280, later 1870-2126) and stayed beside her for 10 s. Nothing was
  on screen, she took no damage, and it never braced. The den shots (balcony, floor, gate) show no creature either.
  The tunnel's burrbacks draw fine, so the fault is specific to this kind or this room.
- **Only phase 1.** It is the round-1 beetle: `hp: 20` and `radius: 900`, but no `phased` and no `taproot`. The sim
  already has the three-phase version from Area 1 round 5 (slam, roll, taproot; `memory/creatures.md`), and the den
  does not use it.
- **A flat arena.** The arena is 1920 × 832 of air with one 192 × 32 ledge at (2368, 1024). The creature's own tuning
  expects escape ledges 192 px up (`strikeHeadroomPx`, `braceUnderRoof`) and a taproot column.
- **The camera.** The lock (`zones: arena 640-2560`) is exactly one 16:9 view, so at 21:9 the room's edge shows.
- **The gate.** The root gate at (2560, 1024) is hard to find in the gate shot.

**Why it matters.**
- A first area is remembered by its boss (False Knight, Baichang; Ori's Spirit Tree set piece). Today the area ends
  on an empty room and a gate that opens when an unseen creature dies.
- The brief asked for "no fight on a flat open log", and the climax is exactly that.

**Fix.**
1. Find why `oldBurrback` does not render in the canopy world. Check the creature renderer's kind list for wood-kit
   rooms with `mass: 'ground'` and the layer order against `marks.backs`. Add a shot check that every scene enemy has
   a drawn sprite.
2. Set `phased: true` and `taproot: [1560, 1720]` on `old-burr`, with a root column from the ceiling at 448.
3. Add two escape ledges 192 px over the floor, at 900-1150 and 2050-2300, and keep the floor clear 96 px over its
   feet (`memory/creatures.md`).
4. Widen the arena so the camera lock covers 21:9 (air 512-2688), or let the zone clamp to the view.
5. Draw the root gate as woven roots like the seed door's seal, lit from behind once open.

### 4. Travel is one verb: claw up a chimney
**What.**
- **Claw climbs.** The critical path has seven straight claw climbs, most between two plumb walls:
  - the well shaft, 704-1216 × 1408-4160: 2,750 px with two thorn strips;
  - the limbs' tall trunk, 2560, 320-1024;
  - the fork's face, 2880, 576-1344;
  - the Grovemother, 2208, 704-1600;
  - the Spire chimney, 576-960 × 0-1728;
  - the kin, 1280-1536 × 256-1536;
  - the out chimney, 640-1024 × 896-2048.
- **More off the path.** Three more climbs return from pockets: tunnel, burrow, hollowroot.
- **Comfortable jumps.** Every horizontal problem sits inside the Reach table's "comfortable" band:
  - limbs l1 → l2 is a 320 px gap with a 192 px rise, and the floor under it is walkable between three thorn strips;
  - the tunnel humps are 192-256 px tall;
  - the crown's four limbs step 192 px each.
- **Nothing at the edge.** No jump asks for the 410 px edge, and nothing asks for a dash.
- **The glide opens one route.** It is the only `needs: ['glide']` route: the gap's shelf → far limb (1,200 px at
  512 below; the glide reaches ~2,700 there). After that, the tunnel, den and out ask for nothing new.

**Why it matters.**
- `strengths-feel-weakness-levels.md` says the movement is the game's best asset. Here it is used as an elevator.
- Ori's area uses each new verb in every room that follows: wall jump on thorn shafts, then chained with logs and
  water.
- HK's claw climbs carry spikes, saws or enemies on the wall.
- Seven bare chimneys in one area is the new monotone.

**Fix.** One pass over the critical path.
- **Every climb gets a twist.**
  - The well shaft: a mid-landing at 2816, thorns alternating every 350 px, a lampwing patrolling 2000-2400, and
    shortened to two 1,300 px legs.
  - The Spire: a hawker strike timed to the thorn switches (it exists, but on a 384 px chimney there is no room to
    dodge: widen to 640).
  - The out chimney: a breakable plug halfway up.
  - The kin: the thorn band on the lower third, plus a shelf to change face at 900.
- **Two jumps at the edge.** In limbs, widen l1 → l2 to 400 px, put thorns under the whole gap (520-1408), and raise
  l2 by 64 more.
- **Glide on the path after the gap.** Glide owners are the only players who reach the door, so the deep can require
  it:
  - in the tunnel, a thorn pit 2880-3900 at 1856 crossed from the hump top at 1600 (a 1,000 px flat glide);
  - in out, the top floor ends at 1100 over a drop, with the door on a ledge 1,400 px across.
- **Three glide pockets on the way back.** Example: a shelf in the fork's sky at (1500, 450), reached only gliding west
  from the face's top (2880, 576): 1,380 px flat, over jump + double's 768 and under the glide's 1,594.

### 5. The ten pockets are closets, and the area is short
**What.**
- **Tiny pockets.** The ten off-path rooms average 0.9 screens. Each is one carved rect with one exit and the same
  contents: a glowing hollow or stone, a glint hoard, sometimes a great. Only two hold a creature: cellar's juvenile
  and ledge's burrback.
- **Few off-path screens.** 50.2 of the area's 59.9 screens are critical (84%). Rooms pass the 60% target, but
  screens don't.
- **Short overall.** 60 screens in all is 68% of Ori's 88 and 18% of HK's 329. A first play at the references' 1.25-2
  view-widths a minute is ~15-20 minutes, against 30-60.

**Why it matters.**
- HK's side areas are **branches**: the Husk Guard corridor, and Ancestral Mound (21 screens, 11 baldurs, a bench).
  Ori's dead ends are tunnels with fights and puzzles before the cell.
- "Do I go down this side tunnel?" pays best when the tunnel is a small adventure. Ten one-screen closets with one
  template become a checklist.

**Fix.** Turn two pocket clusters into real branches of 3-4 rooms and 8-12 screens each, each with its own encounter
and a major at the end.
- **West: the rot branch.**
  1. Grow rot → crawl → elder into a branch under the well: the crawl becomes a 2-screen low tunnel.
  2. Add a web room: the weaver and its orb webs exist in the sim (`memory/creatures.md`) and are unused here.
  3. End on the elder's moonDrop.
- **East: the cellar branch.**
  1. Grow cellar into a 3-room root cellar under the fork.
  2. Put the carriers (ants) in it: they exist and are unused here.
  3. End on the cellar's moonDrop with a shortcut up into the tunnel (a one-way root drop).
- The other closets stay as single rooms, but each gets one distinct idea: the attic a dangler nest, the sky room a
  hawker roost, the burrow a dark room lit only by her lamp.
- Target about 75-80 screens, with off-path screens at about 25%.

### 6. Secrets: one you can hop over, none taught, and half are the same panel
**What.**
- **The rot cache is a hurdle.** The rot hall's cache wall (`rot-cache`, 2176, 832-1088) is a free-standing 64 ×
  256 post with 256 px of air above it (hall ceiling 576). From (2080, 1088) I jumped right once and landed at 2520.
  The cover lifted, and all eight `cache-` glints and `cache-great` were taken with the bark unbroken. The same
  geometry stands at `rot-wall` (640), on the second way down.
- **One shape for half the secrets.** 7 of the 12 breakables are 192 × 64 floor panels:
  - hub `cache-floor`;
  - trunk `rot-panel`;
  - rot `crawl-panel`;
  - fork `cellar-panel`;
  - grove `pit-panel`;
  - bower `kin-panel`;
  - tunnel `burrow-panel`.

  Each is found only by striking down on a faint seam.
- **Nothing teaches it.** No breakable stands on the critical path, so nothing teaches the player that the wood
  breaks. The first breakable most players will pass is the hub's bank wall at (3904, 1344), in the dark, at the end
  of the root floor.
- **The rest hide by darkness.** The other covers (limbs niche, fork stone pocket, Spire nook, attic, gap roost) are
  only areas the camera can't see into. They are hidden by darkness, not by reading a wall.
- **Glint flood.** There are 193 minor pickups (4.1 things a screen against 0.3-0.4), so only 35% of screens are
  empty, against 63-66%. The "119 hidden things" are mostly glints, and the real hidden places number 16.

**Why it matters.**
- HK's King's Pass ends on a wall you **must** break, so every player learns in minute 2 that walls can break. Then
  18 of its 26 secrets are breakable walls the player now checks.
- Floor panels only exist in HK as a minority.
- A wall you can hop over teaches the opposite: the secret was never behind anything.
- The glint flood hides the lows: no screen is empty enough for a hoard to feel like a find.

**Fix.**
- **Make the cache a wall.** Bring the rot hall's ceiling down to 832 over 2112-2688 (an `air()` split), so
  `rot-cache` fills its opening. Do the same for `rot-wall`, or make it 512 tall. Add a scene check: every non-floor
  bark spans its opening floor to ceiling.
- **Teach it on the path.** Make the trunk's tier-1 → tier-2 way a required rotten wall at (1536, 576-704) on the
  critical path, the King's Pass door. Its seam must be readable in that frame.
- **Convert three panels to walls.** The grove `pit-panel` becomes a wall at the pit's east (3200, 1472-1600). The
  hub `cache-floor` becomes a wall in the seed door's shaft side (2496, 1600-1760). The bower `kin-panel` becomes a
  wall at the west ledge's foot.
- **Cut the glints by about 60%.** Delete most `arc()` and `glints()` lines on the route and keep `hoard()` only
  behind covers, so that 55-60% of screens are empty again and every hoard is a find.

### 7. The Grove, the peak, does not look like one
**What.**
- **The mood didn't land.** `cn-grove` is set `mood: 'warm'` with the moon hidden. In all five shots it is the same
  blue fog as the fork, and its three wicks are small orange specks.
- **Open fog, not an arena.** The room has no back wall, so the "closed arena-pit" reads as open fog under a flat
  ceiling beam (0-3840 at 192).
- **The Grovemother is a stump.** It is a 192 px wide stump (`tree('mother', 2208, 192, 704, 1600)`). Its crown limbs
  (`crown-w` 1792-2016, `crown-e` 2592-2848 at 704) float free of it as two rectangles. So the room's landmark and
  its seed-holder read as two floating boxes and a post.
- **Placeholder caps.** The caps (`cap-w` 1536, `cap-e` 3008) are still the flat lilac mushrooms from round 1.

**Why it matters.**
- The densest room is where the player spends the most time. It should be the area's postcard, as the Platforms shaft
  is HK's and the Spirit Tree is Ori's.
- The game's signature image, moths circling a false lamp (`art-direction.md`), belongs here and is missing.

**Fix.**
- **Make the Grovemother a trunk.** 480 px wide, from the pit floor (1600) up through the ceiling, its crown limbs
  grown from it (`parent: 'mother'`), with the claw climb on its east face.
- **Back it.** Give the pit a back of grove trunks and fern masses: `back()` 704-3200 × 800-1600, with a foliage tint,
  not the shed wall.
- **Push the warmth.** Make the wicks big: radius ×2, warm light on the walls and tops within 500 px, and the moth
  swarms around them visible from the entry. Set afterglow warm at (2200, 1200).
- **Repaint the caps** as fat fungus in the kit's painted style, as round 1 asked.

### 8. The area still opens and ends flat
**What.**
- **The opening.** `cn-hatch` is unchanged: 10.1 screens of open sky with logs, 0 enemies and a catch, which is 17%
  of the area's screens. Round 1 asked to cut it to about 5.
- **The ending.**
  - `cn-out`'s reveal is a flat floor (0-1920 at 896) and the default moon.
  - There is no mountain (`easy-path-same-fun`: the mountain at vistas) and no landmark.
  - The next area's door (`next-door`, 1792, 640) draws as a white bar grid, the placeholder gate from round 1.
  - The area ends on a trigger.
- **The default moon.** The moon still sits at the default screen (1420, 190) in hub, fork, bower and out: every open
  room but three.

**Why it matters.**
- Ori opens on a 3-screen glade. HK reaches its first enemy in 1.5 screens.
- The last view is what the player carries into the next area: Ori's Spirit Tree, and HK's Crossroads giving onto
  Greenpath's gate.
- The story's whole direction is "toward the moon and the mountain", and the end shows neither as a goal.

**Fix.**
- **cn-hatch.** Trim to about 5 screens. Cut x 0-3500, keep the cocoon branch and the drop, and replace the catch with
  the hub as the landing.
- **cn-out's top.**
  - End the floor at x 1100 on a cliff lip.
  - Below, a valley of far lamps (the next area: the valley of lamps).
  - Above, the mountain under a low moon, using art `moon` at (1500, 700), r 200, plus a mountain silhouette layer.
  - Put the next door in a root arch on a ledge across the drop, lit, as the first locked door of the next area.
- **Move the moon per room.** Hub behind the lampoak's crown, fork low over the Grove's face (pulling east), bower
  hidden by the roof.

### 9. Seams and broken pieces on screen
**What.**
- **The bower back wall ends in mid-air.** `back(2560, 0, 4736, 1664)` stops at x 2560, so the hall shot splits into
  sky on the left and planks on the right, along a perfectly straight vertical line.
- **The gap's roost** is a rectangle hanging from the top of the sky, two 64 px columns, painted as a black box with
  a root fringe. It hides the roost, but it reads as "something odd here" from the shelf.
- **A dark disc on the moon.** In the crown glade shot a dark grey disc about 120 px across sits on the moon behind
  the hero at screen (1660, 340).
- **The export flag.** `export-area.ts` writes `onCriticalPath: false` for `cn-hub` although it is in `criticalPath`.
  It is a tool bug; the metrics count 14 critical rooms correctly.

**Why it matters.** These read as bugs in a still frame, and the bower's is in the arrival room after the Spire, a
reward moment.

**Fix.**
- **The bower.** Extend the back wall to the kin's face (x 1536), or fade its west 384 px to nothing.
- **A scene check.** Fail any `backs` rect whose edge lies in open air for more than 128 px.
- **The roost.** Paint it as a tapered hanging root clump, wide at the top and ragged below, or hang it from a limb
  that crosses the gap.
- **The disc.** Find its source (the hero's light halo against a bright sky?) and fix it.
- **The export.** Set the room flag from `CRITICAL`.

### 10. The fights have terrain now, but the cast is thin
**What.**
- **Better fights.**
  - The trunk: thorns, a low roof, a lampwing over thorn-t2, a fenced burrback.
  - The ambush hollow.
  - The grove pit with caps.
  - The tunnel pair between humps under a dangler.
  - The gap hawker harassing the glide line: a good idea.
- **Same cast.** It is still the same 6 kinds (references 9-30), all `senses: 'always'`.
- **The ambush floor is flat.** It is a 1,536 px flat floor at 1152.
- **Too many enemies.** Enemies are 0.58 per screen, double Ori's 0.18, and the Grove holds 7. That is fine for one
  peak, but the trunk, well, tunnel and bower hold 3-4 each, so the area has no rest stretch between hub and den
  except the climbs.

**Why it matters.**
- README fact 4: the challenge is in groups and terrain, and v2 now has both.
- The next step is variety (new silhouettes, new rules) and rhythm: the references keep 40-60% of rooms empty and put
  the groups in a few places.

**Fix.**
- **Add kinds.** Bring in the two unused kinds from the sim, the weaver's orb webs and the carriers, in the branches
  of #5. Add one ranged threat on the critical path: a hawker on a lamp `orbit` in the bower hall.
- **Shape the ambush floor.** Give the hollow two tiers: a 192 px step at 960 and a 256 px roof shelf over the east
  third.
- **Thin the middle.** Cut the trunk to two creatures, so the ambush and the Grove stand out.
- **Senses.** Set `senses: 'lamp'` where the room is dark and she carries the lamp, so sneaking is a choice. That is
  the game's own rule (`memory/creatures.md`).

## Smaller notes
- **Health.** Three moonDrops in a 20-minute area take her from 4 lights to 7. HK's first area yields one mask, from
  shards. Consider `moonDrop` shards, 3 to a light, or one drop per area, or later areas have nothing left to give.
- **Moth-stones.** Five moth-stones for 24 rooms is generous but fine; each opens a sub-area of the map.
- **The free double jump** on a placed player is still zeroed only by the harness (`memory/canopy.md`). The
  lock proofs stay a harness fiction until the sim fix lands.
- **The camera.** It shows sky beyond the Spire's west edge (the shots' left strip): another case of #2.
- **Dash.** The dash is not in this area's kit. If it comes later, leave dash-only gaps in the fork and limbs as
  "later" locks, as Ori's bramble wall does.

## Scores (1-10, against the HK / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | **r2** | one line |
|---|---|---|---|
| layout | 3 | **6** | a real cave graph with loops, gates and pockets; carved as rects, pockets are closets, short |
| density | 4 | **5** | 42% of rooms empty of enemies and a real peak; buried under 193 glints, 35% empty screens |
| combat | 3 | **4** | four fights use terrain and hazards; the boss is invisible and single-phase, 6 kinds |
| secrets | 2 | **5** | 16 places hidden in mass with real majors; one hop-over, nothing taught, 7 floor panels |
| readability / look | 5 | **4** | the crown and the hub landing are lovely; 17 interiors are one dark shed, boxes show, framed pockets |
| pacing | 3 | **5** | claws then Grove then glide then door: a sound curve; a 10-screen opening and a flat, broken end |

**Overall: 4.5 / 10 against the references** (r1: 3.5).

The structure is now close to right. A player who saw only the map would believe it, and a player who saw only the
shots would not. Round 3 should not add rooms. It should make the rooms we have look like different places carved
from a living tree, finish the boss, and give the travel the movement problems the controller deserves.

## Round 3: the ten fixes, ranked by impact

Each is one builder pass. The coordinates and details are in the problem above.
1. **Fix the boss (#3).** Make `old-burr` render in `cn-den`, set it `phased` with a `taproot`, add two escape ledges
   192 px up, size the arena lock for 21:9, and draw the root gate as woven roots. Add a shot check that every scene
   enemy is drawn.
2. **Interiors per material and light (#1).** Replace the plank back wall with vertical root fibre for `root` and earth
   with root curtains for `ground`, plus a parallax layer and a fog band. Give every enclosed screen one non-lamp light
   (cyan moss, glow fungus or a moonlight crack), tint per region, and brighten the walk-top rims.
3. **Rooms at least 2560 × 1440, and nothing outside them shows sky (#2).** Grow the PLACE rects of crawl, elder,
   cellar, hollowroot, attic, sky, burrow, spire, nook, out and ledge, re-pack the world, and fill the holes. Render
   mass outside `back` rooms.
4. **Carve organic caves (#2).** Add a carving helper with bitten ceilings and walls and chamfered corners. Replace box
   pillars and humps with tapered stacks: the trunk's two columns, the tunnel humps, the fork knoll, the hub high
   block's top, the ledge's block.
5. **A movement problem in every climb, and the glide on the path after the gap (#4).** Do the well mid-landing with
   alternating thorns and a lampwing, widen the Spire chimney with a timed hawker, put a plug in the out chimney, add a
   change-face shelf on the kin, push limbs l1 → l2 to the jump's edge over full thorns, add a 1,000 px glide over the
   tunnel's thorn pit and a glide to the out door, and put one glide pocket in the fork's sky.
6. **Secrets that teach and hold (#6).** Close the rot cache and the rot wall floor-to-ceiling, add a required rotten
   wall on the trunk's tier-1 exit, convert three floor panels to walls, and add the scene check for full-height
   walls.
7. **Cut the glints about 60% (#6).** Keep hoards only behind covers; target 55-60% empty screens and re-run
   `metrics.ts`.
8. **The Grove as the postcard (#7).** Make the Grovemother a 480 px trunk through the ceiling with the crown limbs
   grown from it, a grove back wall, big warm wicks with visible moth swarms, a warm afterglow, and painted caps.
9. **Open and close the area (#8).** Trim the hatch to about 5 screens. Make out's top a cliff over the valley of lamps
   with the mountain under a low moon and the next door in a lit root arch. Move the moon per open room. Fix the
   bower's back-wall seam, the roost box and the crown's disc (#9).
10. **Two real branches with the unused creatures (#5, #10).** Grow rot → crawl → elder into a 3-4 room west branch
    with the weaver's webs, and cellar into a 3-room east branch with the carriers and a shortcut into the tunnel,
    each 8-12 screens and ending on its moonDrop. Then re-measure; target about 75-80 screens and about 25% off-path.
