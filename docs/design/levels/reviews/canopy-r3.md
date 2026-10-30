# The Canopy, review round 3 (2026-10-30)

Reviewer brief: judge the Canopy v3 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`, HEAD a46886f)
against the first areas of Hollow Knight, Ori and Nine Sols, as a player and as a designer, and say what changed since
round 2 (`canopy-r2.md`). Sources used: `first-area.md`, `memory/canopy.md`, `memory/canopy-render.md`, the reference
README and the three write-ups, the map re-exported and drawn at one scale next to Ori's and HK's, `metrics.ts`
against the three references, a fresh wide shot of every stop in every room with pickups (16:9; den, Spire, nook and
way out again at 21:9), the bot reports in `playtest-reports/canopy-r3/`, frames of the v2-layout playthrough video,
the generator itself, and probes in a `-s=review3` session (`goto`, `teleport`, `input`, `kit()`, `enemies()`,
`scene()`, per-frame traces). All coordinates are room-local px, as in the generator, unless marked world.

## The short version

v3 did most of what round 2 asked. Every room is at least 2560 × 1440 and nothing outside them shows sky. The rooms
are carved with bitten outlines, and there are two real branches of about ten screens, with the weaver's web and the
ants in them. The glints are cut by 58%, so 57% of screens are empty again. The boss is drawn and has three phases,
the Grove has its lamps and moth swarms, and interiors now have depth, glow moss and two materials. On the map the
area finally reads like a reference first area.

It still fails in play and on screen, for three reasons:
- **Traversal was flattened to suit the bots.** About 9,200 px of the critical path is single-face claw climbing:
  hold toward the wall and tap jump. Only one of the seven climbs (the Spire's hawker) asks anything of the player.
  The movement is the game's best asset, and the area spends it on elevators.
- **The picture still shows the collision.** Masses paint as slabs, cabinets, pedestals and joists: the hub's high
  block, the way out's two blocks, the gap's roost, the Grovemother's squared base on stilts, and every terraced
  burl. Twenty interiors share two looks.
- **The key moments are broken or blank.** The boss's escape ledges are invisible. The moon is off screen in the
  hub, the fork and the way out. The ending's mountain and valley are not drawn at all, because the wood kit has no
  vista. Round 2's hub hollow bug is still there.

Round 1's line still holds in a third form: the structure is now close to the references, but the play and the
picture are not.

What works, and should be kept:
- **The macro structure.** Claws far and low at the well's foot, used at once. The hub's landing reads west (all
  three bots now go west first). The Grove is the claws' reward, the glide is used one room after the crown, three
  seeds open the door, and two loops and a shortcut close back into the hub.
- **The branches are now small adventures.** The rot branch (rot → crawl → webs → elder → a plug into the well) is a
  loop with its own creature and a moonDrop at the end. The cellar branch has the ants, a trapdoor that opens from
  below, and the tunnel's shortcut.
- **The Grove pit** (`cn-grove` pit shot). Two big warm lamps with moth swarms over a pit of burrbacks, teal caps at
  both ends: the game's signature image is finally on screen. With the hub landing and the crown, it is one of three
  frames that could sit next to Ori.
- **The web room** (`cn-webs`): an orb web strung across the whole hall over its lamp. One idea, read at a glance.
- **The boss's body.** The old burrback at 4.4× has a red-lit rear before the slam, a pale floor wave, and a curled
  ball for the roll. It is big, readable and nothing like the commons.
- **The jump at its edge** in `cn-limbs` (384 across, 192 up, over thorns) and **the glide on the path** after the
  gap: the tunnel's 1,024 px thorn pit, the way out's 1,344 px crossing to the door.
- **Every room fills 21:9**: checked on the den, the Spire, the nook and the way out.

## Since round 2, fix by fix

| r2 # | fix | v3 | status |
|---|---|---|---|
| 1 | the boss: drawn, phased, taproot, two ledges 192 up, 21:9 lock, woven gate, enemy-drawn check | drawn (4.4× rig, rear, wave, ball), three phases from tuning, taproot, lock 2,944 wide, `creature-renderers.test.ts` | **mostly done.** The two escape ledges are **invisible** (#2). The gate draws as a bird-cage, not woven roots. The arena is still a flat box (#6). |
| 2 | interiors per material, a non-lamp light per screen, rim | root fibres / earth lenses, deep parallax back, moss, fungus, worms, shafts, spores | **done, with new problems.** There are two looks for 20 rooms (#4). The warm tone paints flat mint polygons (#2). |
| 3 | rooms ≥ 2560 × 1440, no sky outside them | the generator throws below that size; walls painted past the room's edges | **done** |
| 4 | organic caves; tapered stacks for pillars and humps | `cave()` bites outlines, `burl()` / `hang()` tiers | **half.** On the map they are staircase rects. On screen they are slabs, plinths and joists (#3). |
| 5 | a movement problem in every climb; the glide on the path | the glide on the path (tunnel pit, way out, fork shelf), the limbs' edge jump. The climbs were later simplified for the bots: cross-chimney kicks removed, the out plug removed, the shaft's lampwing removed | **half, then partly reverted** (#1) |
| 6 | secrets that teach and hold | the giant's wall is the only way on; rot's walls fill floor to roof; three panels became walls; `finish()` check | **done.** The teaching wall reads as a post, and the hub's bank wall is broken first (#8, #9). |
| 7 | cut glints about 60% | 193 → 82; 57% of screens empty (refs 63-66%) | **done**; minors are still 8-14× the references |
| 8 | the Grove as the postcard | 480 px trunk, lamps 1.9× with moth swarms, warm wash, painted caps | **mostly done.** The Grovemother hangs as a squared slab on stilts, and the back is flat mint (#3, #2). |
| 9 | open and close the area; moon per room; seams | hatch trimmed to 5.1 screens; cliff, valley and door laid out; bower seam torn; crown disc fixed | **half.** The vista isn't drawn, the moon is off screen in three rooms, and the roost is still a box (#5). |
| 10 | two branches with the unused creatures; ~75-80 screens | rot branch with the web, cellar branch with the ants; 83 screens, 36% of them off the path | **done** |

## The 10 most important problems, ranked

### 1. The climbs are elevators
**What.**
- **The numbers.** The critical path climbs about 9,200 px on claws, about 8.5 view-heights, as one clean face at a
  time. The builder made every climb a single face, so the explorer bot (`climb` macro: toward a wall, jump at every
  slide) can prove it.
- **Climb by climb.** `memory/movement-controller.md` notes that wall kicks rise in full on a tap: one wall is enough.
  So each of these climbs is just "hold toward the wall, tap jump":

  | climb | room-local | height | what it asks today |
  |---|---|---|---|
  | the well (first use of the claws) | `cn-well` shaft 1024-1536, 4928 → 1152 | 3,776 | nothing. The west face is clean the whole way; the thorns `thorn-w2` / `thorn-w3` are on the east face, which she never touches. The two rests are optional. |
  | the fork's face | `cn-fork` x 2816, 1344 → 576 | 768 | nothing (fine: it is the reveal of the Grove) |
  | the Grovemother | `cn-grove` x 2016-2496, 1344 → 704 | 640 | nothing |
  | the Spire | `cn-spire` 640-1280, 1472 → 0 | 1,472 | **a hawker on its lamp's rhythm crosses the chimney** (`hawk-spire`, period 210). The only climb with a threat. |
  | the kin | `cn-bower` x 1280-1536, 1150 → 256 | ~900 | thorns on its lower third, entered from a limb above them. Mild. |
  | the limbs' tall trunk | `cn-limbs` x 2560, 1280 → 320 | 960 | nothing (fine: the way home) |
  | the way out's chimney | `cn-out` 768-1280, 1344 → 640 | 704 | nothing. The thorns are on the face she doesn't use, and the plug was removed. |

  Off the path: the Elder's chimney (`cn-elder` 768-1152, 2496 → 128, 2,368 px, west face clean) is the branch's
  climax and also asks nothing.
- **The bots aren't the bar.** The cross-chimney kick (384-640 px across) was "beyond the bots", so it was removed.
  Bots exist to find bugs. A human who just got the claws wants to use them on something.

**Why it matters.**
- `strengths-feel-weakness-levels.md`: movement and combat are good; the level design is what fails. This is the
  level design failing the movement again.
- HK's claw cannot climb one wall. Every Mantis Claw climb alternates walls, and the hard ones put spikes on the walls
  or saws in the gap.
- Ori's wall jump can climb one wall, but the Sunken Glades and the Hollow Grove make you leave it:
  - thorn patches on alternate faces;
  - a Spiked Slug on the wall;
  - a moving hazard in the shaft.
- Most of the references' climbs are trivial, and a few are set pieces. The Canopy has the trivial ones and none of
  the set pieces.

**Fix.** Keep four climbs clean (fork face, Grovemother, limbs trunk, the tunnel's return shaft): they are reveals or
ways home. Make four into set pieces, and teach the explorer a `kick across` macro instead of designing around it:

| climb | make it |
|---|---|
| **the well** | Leg 1 (notch → mouth, 4928 → 3200) stays clean: the first use, as Ori's energy cell beside the tree. Narrow legs 2 and 3 (3200 → 1152) to 384 (shaft 1088-1472) and put `thornsUp` on alternate faces every 320 px from 3100 up: west at 3100-2900, east at 2780-2580, west at 2460-2260, then the landing. She must kick across 6-8 times. Put `wing-am`'s twin on a patrol across 1,500-1,800 above the landing, so the fight happens at a rest, never on the face. Add a secret: a rotten panel in the west face at 1,600 into a niche (the claws then pay twice). |
| **the Elder** (optional: the hardest climb in the area, for a moonDrop) | The full 2,368 px with thorns alternating every 256, the rest at 1,472-1,856 kept. The **plug** comes back at 1,200: rotten heartwood across the chimney, cut from below while clinging, so the blade and the claws work together. |
| **the Spire** | Keep the hawker. Add thorns on the west face 800-1,000, so she must change wall exactly where the hawker crosses (lamp at 760): one timed switch. |
| **the way out** | Restore the breakable plug across the chimney at 1,000 (`bark`, 3 cuts), cut from a cling under it, with thorns on the east face 1,000-1,300. The last climb before the reveal should be the most interesting. |

### 2. Broken pieces at the key moments
**What.** All of these were verified in play.
- **The boss's escape ledges are invisible.** `cn-den` `oneWays` at (1024, 1152, w 256) and (2240, 1152, w 256)
  exist: from the floor at 1150 a jump lands her standing at feet 1152. Nothing is drawn there, in my screenshot or in
  the floor shot (`wide-2-floor`). The one safe answer to the ram and the roll is a platform the player cannot see.
- **The hub's bank hollow is still a flat pale-green shape** (round 2's video bug).
  - Reproduced: I broke `bank-wall` (`kit()`: `broken: true`) and walked in to (4060, 1600). A hard-edged mint
    trapezoid sits behind her, about 3800-4100 × 1420-1600, over a hollow that otherwise shows open sky.
  - The same flat mint fills the seed door's shaft (1792-2048 × 1664-2304; hub door shot) and the Grove's back (the
    diagonal mint shapes over the pit).
  - It is the warm-mood interior tone (`lib/interior.ts`: "warm moss green") painting the back as flat polygons.
- **The tunnel's top edge is still standable, in a new form.**
  - `teleport(1700, 0)` in `cn-tunnel` stands her on the room's top edge west of the door's shaft (1792-2048),
    grounded, indefinitely. Above y 0 the room is open air.
  - In play: from the shaft at (1980, 200), a kick right and then up-left carries her over the west wall's top to
    (1697, -115), still in `cn-tunnel`, on an all-black screen.
  - The crossing then places her in the hub at x 1792 below its floor line. Her y runs 2195 → 3381 in a 2,304 px
    room, so for about 1.3 s the hub is shown without her. She then reappears in the tunnel at (1792, 112).
  - Round 2's bug was a ledge. Now it is a pop and a black screen.
- **The moon is off screen in three rooms.**
  - `art.moon` is in **view px** (`sky.ts`: screen-fixed, 2% parallax), but the generator sets room px: hub
    `{x: 3000, y: 330}`, fork `{x: 2700, y: 640}`, way out `{x: 2700, y: 760, r: 200}`.
  - The view is 1,920 wide (2,592 at most), so none of the three moons is ever on screen. The hub had a moon in v2
    and lost it.
  - The way out's "low moon over the valley" is not in any of its five shots.
- **The crown's entry shot is pure black.** Its stop (1400, 1792) is on the room's bottom edge: she falls straight
  back into the bower.

**Why it matters.** These are the boss, the hub's first secret, the seed door and the ending: the four moments a
player remembers. A first area at the references' bar has none of these.

**Fix.**
- **The ledges.** Draw `oneWays` in the wood kit as root shelves: a thick root grown from the wall or a hanging root
  knot, its top lit. Add a content test that every `oneWay` in a wood room has a painter.
- **The warm tone.** Fix the warm interior so it paints like the cool one (fibres plus a deep back, tinted), not as
  flat polygons. Re-shoot the hub's east stop with `bank-wall` broken.
- **The top edge.** Treat everything outside a room's rect as solid except through an exit's span, or let the
  crossing fire as soon as her box leaves the room, not her centre.
- **The moons.** Set them in view px: hub (1500, 300, r 96, behind the lampoak's crown at the landing), fork (1650,
  380), out (1450, 360, r 200).
- **The crown.** Move its first stop onto `c1` (1600, 1600).

### 3. The picture still shows the boxes
**What.** The bitten outlines help on the map. On screen the same rects come back as furniture:
- **The hub's high block** (0-1024 × 576-1600): a flat-topped cube with a square corner, the first thing seen west of
  the landing.
- **The way out's two blocks** (0-768 and 1280-1792 × 640-1088): two black cabinets with a horizontal seam line
  across each. They frame the last climb.
- **The gap's roost** (`mass` stack 2752-3328 × 0-1280): still a black box hanging from the top of the sky with a few
  root tips. `hang()` was not used.
- **The Grovemother** (2016-2496, from -500 to 1344): a black slab cut square at 1344, standing on two thin painted
  stilts. It reads as a cabinet on legs. The area's landmark tree has no base.
- **Burls are plinths.** `burl(..., 2)` paints two stacked tables with lips:
  - the trunk's two burls under the seed (1664 / 1920 × 704);
  - the nook's burl (1280 × 1216, the moth-stone on a two-tier pedestal: an altar);
  - the tunnel hump (2304 × 1856);
  - the galleries' four-step stair (1280 × 1408).
- **Ceilings are joists.** A flat log slab with `cornerRoot` brackets at each wall:
  - the trunk hall (1536-2624 at 192);
  - the rot hall;
  - the whole crawl, a staircase of shelves;
  - the hub's giant's mouth (0-1408 × 1600-1920), whose roof and fibre posts read as a colonnade.
- **Big faces are slabs.** The well's two walls either side of the shaft are 1,000+ px flat black planes with a lit
  edge.

**Why it matters.**
- `art-direction.md`: "Collision is boxes; the picture must never show it", and "nothing rectangular".
- HK's Crossroads walls are shell plates that bulge and overhang. Ori's rock is lumpy, leans, and is lit on its
  ridges. Neither ever shows a plinth or a cabinet.
- This is now the largest single thing between a still of ours and a still of theirs.

**Fix.** All render side (`pf-mass.ts`, kit pieces). Do this before more layout.
- **Silhouettes from more than the rect.** Paint every free mass edge as a silhouette that departs from the rect by
  32-96 px:
  - bulges and hollows along a face every 200-400 px;
  - a lean of 2-4°;
  - a top that rolls down at the ends.
  Plumb only where `claws()` / `hole()` need a straight face, and even there break up the paint inside the face (bark
  plates, roots crossing).
- **Burls.** Paint a burl as **one** root flare, not stacked tiers: a single swelling silhouette from the floor
  narrowing to its top, with roots running down into the floor. The tiers are collision only.
- **Ceilings.** Paint ceilings as root mats (an irregular underside, roots hanging in clumps of uneven length), with
  no straight beam and no brackets.
- **The Grovemother.** Paint her down to the pit floor with a flared root base: the stilts become two of four big
  arching roots, with the walk-through under the arch. The hub's lampoak gets the same.
- **The roost.** A tapered hanging clump: wide at the top, ragged tips, no box edge (`hang()` in the generator, plus
  the root-clump painter).
- **The hub's high block and the way out's blocks.** A broken trunk top: a jagged break, the bark split, moss, no
  seam line.
- **Check.** Shoot the hub west and high stops, the trunk's seed stop, the nook, the gap and the way out's chimney,
  and put each beside an Ori still. No straight edge longer than 300 px may show outside a claw face.

### 4. Twenty interiors, two looks
**What.** Every enclosed room uses one of two materials:
- **Earth bands** (horizontal grey-violet lenses and root curtains): trunk, rot, crawl, webs, elder, cellar,
  galleries, larder, nook, hollowroot, tunnel, burrow, den and ledge. That is 14 rooms.
- **Root posts** (a forest of vertical blue fibres): well, limbs, Spire, bower, attic and sky. That is 6 rooms.

Each place, from its shots:

| room | reads as | still reads as boxes |
|---|---|---|
| hatch | a moonlit branch in the sky; good | nothing |
| hub | a hall of logs under the lampoak; good from the landing | the high block, the mouth's colonnade, mint shaft |
| trunk | "an earth cave" (bands), not inside a fallen trunk | joist roof, burl plinths |
| well | a blue bamboo forest | two flat wall slabs |
| limbs | the same blue bamboo forest | slab ceiling steps |
| rot / crawl / elder | one dark earth cave, three times | crawl's shelf staircase |
| webs | the web room; distinct | a box hall behind the web |
| fork | open night over the roots; fine | the knoll's stacked tiers |
| cellar / galleries / larder | earth bands again; the ants are too small to make it a nest | the galleries' burl stair |
| grove | the lamp pit; distinct | Grovemother on stilts, mint flats |
| spire / bower / attic / sky | blue bamboo again (the bower is the well with a hawker) | slab rests |
| crown | the moon room; distinct | nothing |
| gap | moon over a dark floor; fine | the roost box |
| tunnel / burrow / den / ledge | earth bands again | humps as plinths |
| out | fog with two cabinets | the two blocks, the cage door |

**Why it matters.** A metroidvania is learned by place. In HK's first hour, the Crossroads' blue shells, Greenpath's
moss and the Ancestral Mound's bone are different worlds. In ours, the trunk, the cellar and the den are the same
cave, and the well, the limbs and the bower are the same forest. Two looks are better than round 2's one, but it is
still not five places.

**Fix.** One material per region, plus one prop per room that nobody could put elsewhere. Render, from
`marks`/`art`:
- **West, the fallen giant** (trunk, rot, crawl): heartwood. Growth rings on the back, split grain running along the
  trunk's length, amber sap beads as the non-lamp light. The trunk's seed alcove under a ring of daylight.
- **The well and the Elder:** a moonlit shaft, the only cold-white interior. The pale moonbeam down the shaft is the
  key light, with frost-blue moss.
- **The cellar branch:** the ants' nest. Packed earth with tunnels in the back plane, larvae glows, seed caches
  stacked as props, the ants' trails lit.
- **High** (bower, attic, sky): bark and leaf. Leaf-litter mats, the open air through gaps in the canopy, hawker
  feathers.
- **The deep** (tunnel, den): root curtains as now. The den's back carries the old burrback's scrapes and shed
  shells: its home.

Then re-shoot and line up the trunk, cellar, den and well shots side by side. They must read as four places.

### 5. The ending reveal is blank
**What.**
- **No vista.** `cn-out` sets landmarks `vista`, `valley` (1792, 640, 2048 × 1600) and `mountain` (2900, 420). The
  wood kit draws none of them: the `Vista` painter (mountain range plus the valley's lamp field) runs only when
  `LOOK.band === 'night'` (Lanternroot; `render/lantern/index.ts`).
- **No moon.** The way out's moon is at (2700, 760), off screen (#2).
- **What the shots show.** From the clifftop and over the valley, the five shots show fog, two fir silhouettes, a
  thorn bed and the next area's door as a bird-cage on a ledge. Gliding across, the player sees nothing ahead but the
  cage and a firefly lamp.

**Why it matters.**
- The last view is what the player carries out: Ori's Spirit Tree, and HK's first look at Greenpath.
- The story is "toward the moon and the mountain" (`art-direction.md`: the mountain at vistas, each one closer), and
  this was to be the first such vista. The layout is right (cliff, 1,600 px drop, a glide to the door), and the
  picture throws it away.

**Fix.**
- **Render.** Enable `Vista` for wood rooms with a `vista` landmark, framed from the clifftop at 16:9 to 21:9: the
  range under the moon, snow on its upper right, the valley's floor of warm lamps (the next area's false lights)
  1,600 px below. Draw `next-door` and `root-gate` as root arches, not cages.
- **Level.**
  - Moon at (1450, 360, r 200) in view px.
  - A camera zone over 1792-3840 × 0-1600 with zoom 0.85, so the glide frames the cliff, the valley and the door at
    once.
  - Two or three real lures down in the valley (unreachable, on the thorns' far side), so the false lights are lit
    in the sim and the moths drift toward them.

### 6. The boss: readable, phased, and in a flat box
**What.**
- **Readability is good.** The rear (red-lit, trembling) tells the slam, the wave is a pale crest, and the roll is a
  separate curled ball.
- **Phase 1 is a metronome.** A 20 s probe with her standing on the floor: walk 90 frames, windup 28-42, charge,
  recover 32, repeat; a rear and slam after every four rams (`slamEveryRams`). It hit her 7 times.
- **The arena** (576-3264 × 448-1344, 2,688 wide):
  - one flat floor;
  - two escape ledges that are invisible (#2);
  - the taproot (`mass(2944, 448, 96, 808)`) drawn as a thin dark post, not a root you would read as "this is where
    it plants itself";
  - the back is the same earth bands as the tunnel.
- **The approach.** The tunnel's burrback pair and the glide pit come before it, but there is no build-up into the
  den itself. You drop from the tunnel onto the balcony and the fight starts.
- **The roll ball** is a plain dark disc with spikes: the least readable of its moves.

**Why it matters.**
- False Knight's arena is plain too, but it is lit by the boss's own hits: its attacks crack the floor. The fight
  reads because the player sees exactly where they are safe.
- Here the only height to escape to is invisible, and the floor is identical edge to edge, so the three phases play
  out as one flat chase.

**Fix.**
- **Level.**
  - Make the two ledges solid root shelves with claw faces under them, so a roll can be answered by a cling, not only
    a jump.
  - Put a 96 px root hump at the arena's centre (1856-2048), so the slam wave has to be jumped at a different spot
    from the ram.
  - Hang a lamp over the taproot (2992, 600) that the boss's phase 3 snuffs as it plants, so the arena darkens for
    the last phase.
  - Put a short root corridor between the balcony and the arena: a 384 px drop with the boss visible asleep below
    (HK's False Knight is seen before the fight).
- **Render.**
  - The taproot as a thick root plunging through the ceiling, bark split, with a glowing scar where it plants.
  - The roll ball with the dome's plates and spines turning, a dust trail, and the red eyes showing once a turn.
  - The den's back with scrape marks and shed shells.

### 7. The peak is flattened, and the main path meets five kinds
**What.**
- **No real peak.** The densest room is the Grove at 4 creatures in 3.6 screens: 1.1 a screen. HK's dense rooms reach
  4-5.5, and our own test grove 2.9.
- **Group fights.** Only the well's ambush (3, woken by the claws) and the Grove pit (4, spread over three tiers) are
  groups. Every other critical-path fight is one or two creatures on a flat floor:
  - trunk 2;
  - limbs 1;
  - fork 1;
  - Spire 1;
  - bower 2;
  - crown 1;
  - gap 1;
  - tunnel 2.
- **Kinds.** The critical path meets 5 kinds (juvenile, lampwing, burrback, hawker, old burrback). The web, the
  weaver, the ants and the danglers are all in pockets and branches, which most first plays skip.
- **Too many hawkers.** Six hawkers (Grove, Spire, bower ×2, gap, sky) make the high band one creature's territory.

**Why it matters.** README fact 3: highs and lows, not a flat average. The flat version is what Matt called
"monotone". The Grove's pit is the one place built for a peak, and it holds four.

**Fix** (level).
- **The Grove pit as a wave.** When she lands in the pit (1472-3200 × 1600), the lamps flare and a second wave comes
  from under the stilts: 2 juveniles and a dangler on the Grovemother's underside at (2256, 1360). That is 7 in the
  pit, about 2.5 a screen. Gate the way east (3200, 1472) with a root gate that opens on the wave's end, as HK's
  arena rooms do.
- **A new kind on the path.** Move one dangler pair onto the trunk's tier 2 (under the low roof at 448-1088 × 768),
  replacing `wing-t2`. Put one ant trail across the tunnel's floor (900-1700 × 1856), so the cellar branch is
  foreshadowed.
- **Fewer hawkers.** Cut `hawk-kin` from the bower (the kin climb has its thorns) and `hawk-far` from the gap, so the
  glide over the gap is a quiet, wide breath after the climb.

### 8. Wayfinding: the bots stop at a third, and nothing helps a human either
**What.**
- **The bot runs.** All three human-like bots stalled at a third of the critical path, and none reached the Grove.
  - casual: 8 rooms in 19:36;
  - average: 9 rooms, then lost in the rot branch until the 25:00 timeout;
  - skilled: 7 rooms, then gave up under the fork's glide shelf after 180 s.

  The bots are not the bar, but the causes are real:
  - **The rot branch swallows the post-claw player.** It is the nearest unknown after the claws, it hangs off both the
    trunk and the well, and it has no map: the west moth-stone is in the limbs' secret niche, so the branch is unmapped
    until the player finds a secret.
  - **The fork's glide shelf** (1792 × 768) shows a great glint, `shelf-great`, in plain view over the critical path
    of a player who has only the claws. It reads as a puzzle, not as "later".
  - **The hub's bank wall is broken before the teaching wall.** The skilled bot broke it at 0:32, a second after
    landing. The first breakable most players meet is a secret 1,300 px from where they land, not the giant's wall.
- **Saves.** There is no save patch between the hub and the den. The whole east loop has none: fork, Grove, Spire,
  bower, crown and gap, about 20 screens with the area's hawkers and hardest jumps.

**Why it matters.**
- README fact 10: saves come early and often. HK has a bench before every hard stretch.
- A lock should read as a lock (HK's high ledges are visibly out of reach; Ori's bramble is a wall). A visible reward
  on a shelf that is almost reachable reads as a jump the player is failing.

**Fix** (level).
- **The west map.** Move `stone-west` to the well's foot beside the claws (1900, 4928), on the path, so the branch is
  on the map the moment it matters. Put the limbs' niche hoard there instead.
- **The glide shelf.** Hide `shelf-great` behind a leaf cover (`cover`) seen only from the gap's drop, and make the
  shelf's underside a sheer overhang (no lit top visible from below).
- **The bank secret.** Raise the bank hollow behind the east limb's end (`east` limb 3168-3712 at 1280) so it needs
  the claws. It then pays on the return, and the giant's wall is the first break.
- **A save.** Add a patch at the bower's arrival (3800, 1408), the top of the Spire: the halfway point of the east
  loop.

### 9. Secrets: enough places, but the lesson and the rewards are weak
**What.**
- **Count.** 19 hidden places, near the references' 20-36.
- **The teaching wall reads as a post.** The giant's wall (1408 × 512-704) draws in the wall shot as a dark grey
  pillar between the floor and the beam: no crack, no rot colour, no glow. It works only because the corridor ends
  there.
- **Floor panels remain.** Four floor panels are still in place: trunk `rot-panel`, rot `crawl-panel`, fork
  `cellar-panel` and tunnel `burrow-panel`.
- **Rewards.**
  - The hoards are glint piles: 82 minors against the references' 6-10.
  - Two moonDrops (each a whole light) in one area: round 2 already called it generous.
  - The moth-stones are good.

**Fix.**
- **Render.** Paint rotten heartwood as rotten:
  - a darker, softer, warmer face;
  - a lit crack running diagonally;
  - a few loose chips at its foot;
  - a dust puff on each cut.

  Mandatory walls get it a little stronger than secret ones, never a different shape.
- **Level.**
  - Make the moonDrops shards: `moonShard`, 3 to a light (HK's masks). One shard in each branch's end, the third in
    the Elder's plug climb (#1).
  - Turn one floor panel (the fork's `cellar-panel`) into a wall in the stairs' side.
  - Cut the hoards to 2-3 glints plus one real thing each.

### 10. Too dark, and the hero gets lost in it
**What.**
- **Mean luma.** The mean luma of the wide shots runs 13-31 of 255: cellar and trunk 13, crawl 14, elder 15, rot and
  galleries 16, the hub 17. Most of each enclosed frame is solid black mass. The lit tops read, but the walls, backs
  and props sink.
- **The hero.** She is dark and small (by design), and in the Grove pit and the Spire she is the darkest thing near
  the darkest thing.

**Why it matters.** HK is dark too, but its masses carry a mid-value rim and texture, so its frames read as shapes on
a mid-grey. Ours read as black with a few lit lines.

**Fix** (render).
- Lift the mass interiors near the playfield to the shadow family's `#0b2a33`, not near-black, within 200 px of a lit
  top or face.
- Give every face that takes the claws a faint cool rim, so the climbs read as walls she can use.
- Raise the earth back's value about 15% in the cellar branch and the trunk.

## Smaller notes
- **The free double jump** on a placed player is still zeroed by the harness (`memory/canopy.md`). The lock proofs
  remain a harness fiction until the sim fix lands.
- **Light shafts through solid.** Moon shafts are drawn across solid mass (the hub's east stop after the break: a
  shaft runs down through the black under the root floor). Clip shafts to air.
- **The doc and the data disagree.** The attic's comment says four danglers and the room has two (`dang-a1`, `dang-a3`).
- **The east half is unplayed by anything but the explorer.** Round 4 should get one long human-like run through the
  Grove, Spire, bower, gap and deep (start the bots at the fork with the claws), or a person.
- **The hatch** (5.1 screens) is right now. Its moonlit branch is the best-composed open room.
- **The critical path's vertical share** is about 0.45 (vertical : horizontal), at the top of the references'
  0.26-0.47. Most of it is the single-face climbing of #1.

## Scores (1-10, against the HK / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | **r3** | one line |
|---|---|---|---|---|
| layout | 3 | 6 | **6.5** | two real branches, loops, a shortcut and a trapdoor, rooms that fill any aspect; carved as staircase rects, and the rot branch swallows the post-claw player |
| density | 4 | 5 | **6** | 57% empty screens, glints cut 58%; the peak is flattened to 1.1 a screen and the path meets 5 kinds |
| combat | 3 | 4 | **5** | a drawn, three-phase boss, the web, the ants, a hawker on a rhythm; the arena is flat with invisible ledges, and the rest are 1-2 creatures on floors |
| traversal | - | - | **4** | one edge jump and four glides on the path, but 9,200 px of single-face claw climbing with one threat |
| secrets | 2 | 5 | **6** | 19 places, a mandatory wall in minute two, full-height walls, branch-end majors; the lesson reads as a post and the hub's secret comes first |
| readability / look | 5 | 4 | **5** | the Grove pit, the crown, the hatch and the web room are real; slabs, plinths and joists everywhere, two interiors for twenty rooms, three moons off screen, a blank vista |
| pacing | 3 | 5 | **5** | quiet opening, claws, peak, glide, boss: a sound curve; no save across 20 screens of the east loop, and the end shows nothing |

**Overall: 5.5 / 10 against the references** (r1: 3.5, r2: 4.5).

**What improved since round 2:**
- the boss exists;
- the rooms fill the screen;
- the branches are adventures;
- the glint flood is gone;
- interiors have depth and light;
- the Grove has its lamps.

**What didn't:**
- the shapes still read as boxes;
- the places still read as two;
- the travel got simpler, not richer;
- the ending is still blank.

Round 4 should not add rooms. It should:
1. fix the four broken moments;
2. make four climbs into set pieces a human will remember;
3. paint the masses as wood, not furniture.

## Round 4: the ten fixes, ranked by impact

Each is one builder pass. The coordinates are in the problems above.
1. **[level] Four climbs as set pieces (#1).**
   - The well's legs 2-3 narrowed to 384 with thorns on alternate faces every 320, and a lampwing at the landing.
   - The Elder's chimney with alternating thorns and its plug restored.
   - The way out's plug restored at 1,000.
   - A timed wall change under the Spire's hawker.

   Teach the explorer a kick-across macro instead of removing the move.
2. **[render] The broken moments (#2).**
   - Draw `oneWays` in the wood kit (the den's escape ledges), with a content test.
   - Fix the warm-mood interior's flat mint polygons: hub bank hollow, seed shaft, Grove back.
   - Root arches instead of cage gates.
3. **[render] Masses as wood, not furniture (#3).**
   - Silhouettes that leave the rect by 32-96 px; a burl as one root flare.
   - Ceilings as root mats, no joists or brackets.
   - The Grovemother and the lampoak on flared root bases.
   - The roost as a tapered hanging clump; broken-trunk tops for the hub's high block and the way out's blocks.
4. **[render] The ending vista in the wood kit (#5).** `Vista` for wood rooms with a `vista` landmark (range,
   snow, the valley's lamp field), framed from `cn-out`'s clifftop at 16:9 to 21:9.
5. **[level] Moons and the reveal's framing (#2, #5).**
   - Moons in view px: hub (1500, 300), fork (1650, 380), out (1450, 360, r 200).
   - A zoom-0.85 camera zone over the valley.
   - Two or three lures down in the valley.
   - The crown's first shot stop on `c1`.
6. **[level] The boss arena (#6).**
   - Solid root shelves with claw faces under them.
   - A centre hump (1856-2048, 96 tall).
   - A lamp over the taproot that phase 3 snuffs.
   - A short corridor where the sleeping boss is seen before the drop.
7. **[level] A real peak and the path's cast (#7).**
   - The Grove pit as a gated wave (7 creatures, about 2.5 a screen).
   - A dangler pair on the trunk's tier 2; an ant trail in the tunnel.
   - Two hawkers cut from the high band.
8. **[level] Wayfinding and saves (#8).**
   - `stone-west` at the well's foot.
   - The fork's glide-shelf great hidden from below.
   - The hub's bank hollow raised behind the east limb (claws to reach).
   - A save patch at the bower's arrival (3800, 1408).
9. **[render] Five places, not two (#4, #9, #10).**
   - A material per region: heartwood rings and sap in the giant; the moonlit shaft in the well; the ants' nest in
     the cellar branch; leaf and bark up high; the den as the burrback's home.
   - Rotten heartwood painted as rotten (crack, chips, dust).
   - Mass value lifted near the playfield, and a cool rim on claw faces.
10. **[level] Edges and leftovers (#2, #9).**
    - Make outside the room solid except through an exit's span (or fire the crossing when her box leaves the room),
      so the tunnel's top edge can't be stood on or flown over.
    - Moon-shards instead of two whole moonDrops.
    - The fork's `cellar-panel` as a wall.
    - Hoards down to 2-3 glints plus one real thing.
    - Then re-run `metrics.ts` and one long human-like run started at the fork.
