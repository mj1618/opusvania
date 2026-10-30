# The Canopy, review round 1 (2026-10-30)

Reviewer brief: judge the Canopy (`?world=canopy&fresh`, `tools/levels/canopy.ts`) against the first areas of Hollow Knight,
Ori and Nine Sols, as a player and as a designer. Sources used: `docs/design/levels/first-area.md`,
`docs/design/reference-levels/` (README + the three write-ups), `memory/canopy.md`, `memory/movement-controller.md`
(Reach), the map at one scale (`ours/canopy/map.png` next to the references' `common.png` and `terrain-native.png`),
wide shots of every `cn-*` room with pickups, and short probes with `__game.goto` in a `-s=review` session.
All coordinates are room-local px, as in the generator.

## The short version

The Canopy hits the reference averages on paper (0.42 enemies a screen, 55% empty screens, locks before keys, the
first ability far and low and used at once) and still plays like a flat walk along logs in the sky. On the map at one
scale, the three references are a dense **cave**: solid mass carved into many small rooms. The Canopy is six huge boxes
of air with logs drawn across them. Most of the problems below come from that one difference. Without mass there are
no walls to hide secrets in, no ceilings to frame a fight, no corridors to set the pace, nothing under a fall that costs
anything, and nothing that makes one room look different from the next.

What works, and should be kept:
- **The claws in the well.** You can leave the well only by climbing, so the claws are used within seconds, just as Ori
  puts an energy cell beside the Wall Jump tree.
- **The glide used at once** over the wide gap.
- **Two real loops**, each closing on a one-way shortcut into the hub: the high west limb, and the canopy drop onto the
  east fork.
- **The upper limbs woken by the claws** (`wakes: 'wallJump'`).
- **The quiet hub with a save where you land.**
- **The moonlit mood.** The wood kit is beautiful in a still frame.

## The 10 most important problems, ranked

### 1. Six rooms, one road: there are no paths off the main route
**What.** There are 6 rooms and every one is on the critical path. To finish you must take all three seeds (one each
in the Thornlimb, the Grove and the canopy), so you must cross every room. The only fork is at the hub, west or east,
and east soon stops at the Spire's claw face. "Off the path" here means a pocket 300-600 px from the route inside the
same box: the crawlspace (1216-1920, 2016), the niche (4864-5376, 448), the nook (1984-2304, 704) and the sky-stub
(2816-3200, 896). Rooms run 5-10 screens each. The design doc counts 6 of 6 dead ends as paying, but the well is the
route itself and the crown is 600 px from it.

**Why it matters.**
- References: HK has 45 rooms, 27% on the critical path, a median room of 4.4 screens and 17 dead ends. Ori has 22
  rooms and 5 dead ends, each holding a major. Nine Sols has 39 rooms.
- `memory/paths-not-places.md`: the references put 7-40% of rooms on the main path; ours put 70-100%. This build is
  100%.
- A player never makes a choice that costs or pays anything. "Do I go down this side tunnel?" is the core question of
  the genre, and the Canopy never asks it.

**Fix.**
- **Cut the big boxes at their natural seams**, aiming for 16-20 rooms of 1.5-5 screens:
  - cn-west into three rooms: the descent (x 3200-6144), the low Thornlimb (1152-3200, the rot wall, thorns,
    crawlspace) and the Elder's well plus the upper limbs (0-2560).
  - cn-canopy into three rooms: the arrival (5632-7424), the kin-b climb plus crown (4032-7040, y < 1100) and the
    gap plus far limb (0-3600).
  - cn-grove into two rooms: the clearing (0-3456) and the Spire approach (3456-5376).
- **Then add 6-8 rooms off the path, each with one exit.** Each should be 1.5-3 screens and pay something that matters
  (see #4). Where:
  - (a) Off the hub's roots-e at x ~4800, y 2368: a side tunnel east under the Grove.
  - (b) Below the Grove's pit through the gap at 2304-2432. The pit has two holes, each with a cap; turn that hole
    into a drop to a hollow instead.
  - (c) West of the Elder (x 0-448, y 960-2300 in cn-west). Today that is empty void with a catch.
  - (d) Above the hatch's last branch, behind the camera's top, like Nine Sols' roofs.
  - (e) Off the canopy's far-limb tip (x < 896, y 1344).
  - (f) Behind the den's west root (0-320).
- **Re-measure** with `export-area.ts` and `metrics.ts`, aiming for no more than 60% of rooms on the path.

### 2. Sky with logs: 9% solid against 35-50%
**What.**
- Every room is open air with rolling 96-160 px limbs. The map makes this obvious: the Canopy is thin black strokes on
  beige, while HK, Ori and Nine Sols are black mass with beige carved out of it.
- Below every limb there is a `catches` volume (cn-grove `below` 0-5184, y 1900+; cn-canopy `below` 896-6976, y 2000+;
  cn-west `below` 1088-6144). A fall costs nothing (`memory/rooms.md`).
- In the shots, 50-70% of each frame is fogged sky and moon.

**Why it matters.**
- Everything else depends on this:
  - Secrets need something to be hidden inside (HK: 18 of 26 are breakable walls).
  - Fights need walls and ceilings (Ori's Hoppers fight in a tunnel).
  - Pacing needs corridors that hide what is next.
  - A sense of place needs enclosure and contrast; the wide-open sky only lands as a reveal if the player has just come
    out of somewhere tight.
- Ori's area is 80 screens of box but only 41 of air. Nine Sols' median clear height is 586 px.
- Our view is mostly empty, so nothing in it is a decision.

**Fix.**
- Add a `mass(x, y, w, h, tag)` helper to `Wood`: a solid the wood kit paints as heartwood, root or packed leaf, not as a
  limb. Use it to enclose roughly half of each room:
  - **cn-west.** Run the descent L2 → L4 inside a fallen hollow trunk: shell from x 1152 to 4608, y 1250 to 2100, with
    the limbs as its floor and a ceiling 450-600 px above each. Make the well (448-1088, 960-2304) a real shaft in the
    Elder with a solid core either side.
  - **cn-den.** Earth fill above y 700 and below the floor, the ledge cut into a wall, no sky (see #8).
  - **cn-grove.** Close the pit's sides with roots at x 1536 and x 4416 (1600-2100), and put a root floor at 1900
    instead of the catch, so the pit becomes a room.
  - **cn-canopy.** A packed-leaf ceiling at y ~150 over 4032-7040, so the crown reads as a bower that opens west onto
    the gap. The gap then lands as the one big reveal.
- Keep open sky for **2-3 vistas only** (the gap, the hub over the roots, the area's end). This is the
  `easy-path-same-fun` "mountain at vistas only" stance, applied to sky.

### 3. The peak comes at minute 2 and is never changed
**What.**
- Nothing locks the Grove: there is no gate on the hub's east exit, and the route `mid → seed-grove` needs nothing.
- A player who turns east from the landing therefore meets the area's densest room at about minute 2:
  - creatures: juv-lo, burr-step, burr-pit-w/e, burr-down, wing-a/b, dang-crown, hawk-spire;
  - 2 lamps, about 30 glints, 5 pods, the seed and the nightEyes nook.
- They clear all of it before they own anything. They come back after the claws only to cross 4,900 px to the Spire.
  Nothing in the Grove `wakes`, so the second and third crossings are a walk through a cleared room.
- The claw ambush, the only changed return, is on the west side.

**Why it matters.**
- References put the first set-piece fight right after the first new verb: Ori's 3 Hoppers come a minute after Sein,
  and HK's dense Platforms shaft comes after King's Pass and the well.
- They put the dense clearing where the player has the tools to enjoy it. A first area should build to its peak and
  then change it on the way back.
- Here the high point is spent first, and then the area slopes down: the canopy has 5 creatures over 15 screens, the
  den 1.

**Fix.** Pick one of two.
- **(a) Lock the Grove behind the claws.** End e1 (4032-5120, 1312) at a 320 px gap below a 450 px claw face, and give
  the lampoak's east side a kick face (`tree(..., true, 'east')`). The dense clearing is then the reward for the first
  ability, and you climb into it.
- **(b) Keep the east open but make it a teaser.**
  1. Move half the Grove's creatures into a `wakes: 'wallJump'` wave: burr-pit-e, wing-b, hawk-spire, plus a second
     dangler at (3800, 900).
  2. Put the crown seed behind a claw climb up the Grovemother's east face (mother at x 1792-2112). Today crown-a is
     reached by stepping up from step-2.
  3. Add a pocket that only opens with the glide, off down-2's tip. The third visit then pays too.

### 4. The secrets are signposted, few and small
**What.**
- **Few.** There are 5 hidden places; the "18 hidden things" are mostly glints from `hoard()`.
- **Signposted.** In-game, every cover draws as a **black rounded blob** with flecks: crawl-cover under L4, niche-cover
  at the upper east, sky-cover on the gap (it stands out in the `gap` shot). Bark walls are flat **orange striped
  planks** (rot-wall, rot-pit, den-rot, cache-wall), the brightest objects on screen. The three behind-rot- glints
  (2280-2440, 1520) sparkle in plain view beside the wall. A player reads each one as "secret here" from a screen away.
- **Small rewards.** keenBlade is +20 px of flame radius, nightEyes and quickWings are similar tweaks, and the
  "great" is a big glint. None of them adds health, a life piece or a new move.

**Why it matters.**
- The reference README calls secrets "the largest single gap": 20-36 per area, 34-73% of all pickups.
- HK's breakable walls look exactly like the wall. Ori's pockets are not even drawn on the map. Nine Sols hides them
  above the camera.
- HK's dead ends pay masks, vessel fragments, charms and grubs, and Ori's pay energy and life cells. The pay is why
  players check walls.
- A secret you can see is a pickup with a detour. A reward that changes nothing teaches the player to stop looking.

**Fix.**
- **Art.** Draw a cover as the mass it sits in. Once #2 exists, a cover is a section of heartwood or packed leaf, the
  same as its neighbours. Draw bark walls as trunk with a faint crack, not a plank crate. Never put glints where they
  show through a breakable.
- **Count: one secret per 2-3 screens of route, about 15-20.** Concrete additions:
  - the lampoak's trunk at the hub rungs (2496-2752, 1400-2200): a false face into a pocket;
  - a bark floor in roots-e at x 3800, y 2368, dropping to a stub at 2560 (becomes room (a) of #1);
  - a breakable panel on ul2 near x 3400 dropping to a hidden stub over the rot wall;
  - the eastoak hollow (4608-4800, 1400-1700);
  - the lesser tree hollow in the Grove (3456-3680, 1000-1400);
  - kin-b's trunk interior in the canopy (4032-4224, 600-1000);
  - above the camera over the canopy's arrival (6400-7000, y < 300);
  - the den's west root (0-320, 900-1400).
- **Rewards.** Give at least 4 of the pockets a real major. Add a life piece (a fifth lamp, assembled from 4 shards, as
  HK's masks) or a wallet or lantern upgrade. Put the weakest tweaks (keenBlade) on the visible routes instead.

### 5. Combat is one fight repeated: a walker on a flat log
**What.**
- **Flat ground.** All 9 ground creatures (7 burrbacks, 2 juveniles) stand on limbs that `pad()` levels. `limb()`
  never steps more than 12 px.
- **No terrain.** No fight has a wall, a ceiling, a slope or a hazard nearby. The whole area has **one** hazard strip,
  thorn-l4 (1792-2016, 1764).
- **No stakes.** A miss over the void is a free catch.
- **The set piece isn't one.** The post-claw ambush that should match Ori's Hoppers is three singles along a flat
  log: burr-ul-1 at 1500, burr-ul-2 at 2200, wing-ul at 3600.
- **The boss** has a 4,544 px open floor (320-4864 at 1408).
- **Mix.** There are 6 kinds (burrback, juvenile, lampwing, hawker, dangler, old burrback), all on `senses: 'always'`.

**Why it matters.**
- README fact 4: "the challenge is in groups and in terrain".
- HK's crossroads mix husks with aspids over acid and spikes. Ori's pressure is thorns, swinging spikes, the laser and
  shooter rows. Nine Sols' grunts stand on stairs and switchbacks, with lasers to dash through.
- Our burrback fight was good in the 4-screen grove because the grove has tiers and caps around it. On a bare log it is
  the same 1v1 every time.

**Fix.** Author 4 encounters where the terrain does work.
- **The claw ambush.** Cut ul (832-2560, 960) into a closed hollow:
  - a ceiling at 640 (`mass`), a wall at 2560;
  - burr-ul-1 and burr-ul-2 within 600 px of each other, and wing-ul moved to (2000, 750);
  - a claw face on the hollow's east wall as the way out.
  The new verb is then the escape and the high ground.
- **The Thornlimb descent.**
  - thorns on L3's top (2700-2880) and under L2's drop (3500-3700, 1500);
  - the lampwing (wing-l3) placed so it harries you over them.
- **The kin-b climb.**
  - hawk-cl moved to patrol the claw face at (4150, 700);
  - a thorn band on the face's lower third.
- **The Grove pit as an arena.** Closed sides (#2), both pit burrbacks, a lampwing and the caps' bounce together.
- **Thorns elsewhere.** Use thorns in the canopy too, e.g. under the far-lip (1760-2560, 1500) so a short glide costs
  something.
- **Target:** 3-5 hazard runs per room, not 1 in the area.

### 6. Quiet travel carries no movement problem
**What.** The design's own formula is "clearings at grove density joined by quiet travel **with a movement problem in
it**". The second half is missing. The travel stretches are flat walks:
- ul + ul2: 3,776 px, rising 256 px over 2,048 px;
- the hub's fork-w (768-2496) and fork-e/e1 (2752-5120): 4,100 px;
- the den floor: 4,544 px;
- the canopy's cl + t2: 2,624 px;
- the hatch: 10 screens.

Jumps between limbs are 64-256 px of height with gaps under the single-jump range of 410 px, so none of them ask
anything.

**Why it matters.**
- The memories agree: "movement and combat are good; the level design is what fails"
  (`strengths-feel-weakness-levels.md`) and "bland/obvious/monotone" (`matt-playtest-area1.md`).
- Our strongest asset is the controller (272 px jump, claws, glide, dash), and the travel never uses it.
- Ori's quiet stretches are swinging logs, thorn hops and water. HK's are platforming shafts.

**Fix.** Give each stretch of more than 1,500 px one 3-5 move problem tuned to the Reach table.
- **ul2 into three limbs.**
  - Gaps at 3000-3360 and 3900-4250 (the single-jump edge is 410).
  - Each next limb 192 px higher.
  - After the claws, a short kick between two trunks at 4250.
- **The hub's fork-e.** Cut at 3200-3520 with e1 lowered 256: a dash-or-fall choice, with the canopy drop landing on
  the far side.
- **The den floor.** Two root humps (300 tall, at 2600 and 3400) and a step down into the arena.
- **The canopy's cl.** Break it into 3 limbs, the middle one swaying (Ori's logs), if the kit can sway. Otherwise a
  thorn-under-gap pair.
- **The hatch.** Leave it as the quiet opening, but cut its 10 screens to about 5, matching Ori's 3-screen glade and
  HK's 1.5 screens to the first enemy.

### 7. The hub is a log, and its locks are off-screen
**What.**
- The Crossing is a long log with a save. The lampoak is background (`solid: false`). There is no character, no
  map, no shop, no landmark you would name.
- The design says the seed door is seen from the landing. It is at y 2368, **1,280 px below** the landing on the
  Fork (1088), outside the 1,080 px view; the `landing` shot shows none of it.
- The high west limb (hw, 0-1152, 704) shows as a stub at the top-left of the frame and reads as decoration, not as a
  lock.
- You cross the hub 4 times and nothing in it changes except, perhaps, the sockets.

**Why it matters.**
- Dirtmouth is the reference: 0 enemies, but Elderbug, a bench, 6 locked doors and the well, all in one walk, so it is
  a place you are glad to return to. Nine Sols' Pavilion has the NPCs and the skill tree.
- HK shows the final door 2 rooms from the well. A lock you can't see doesn't promise anything.

**Fix.**
- **Show the door from the landing.** Raise the root floor to y ~1750 (roots-w/roots-e), move the seed door to (2304,
  1750) and shorten the rungs to 3. The fall from the hatch (1792-3072) then passes the door, and the landing frames it
  with its three sockets.
- **Make the lampoak the landmark.** Light a socket lamp per seed so the hub visibly changes on each return.
- **Give the hub one resident** at the patch (1700, 1088): a moth, a keeper of the door. It can carry a line of the
  story (`story-taste.md`: relationships).
- **Make the high limb read as a lock.** End hw with a broken stub over a sheer face at 1152, so it reads as "up there,
  later".

### 8. Every room looks like the same place
**What.**
- Every room uses the same `art` default: the moon at screen (1420, 190), mood `cool`, the same fog and silhouettes.
  The only override is the canopy's moon, nudged to (1500, 200).
- In all 24 wide shots the moon sits in the top-right corner, including cn-den, "The burrow under the roots", which
  shows open sky.
- The kit's pieces look like placeholders: bark walls are flat orange crates, caps are flat lilac mushrooms, the root
  gate is a white bar grid, and covers are the black blobs.

**Why it matters.**
- The Ori terrain-native map changes palette room by room: gold to the west, blue in the glades, green in the caverns,
  orange at the Spirit Tree. HK's King's Pass, Dirtmouth and the Crossroads are three different places in the first 6
  minutes.
- `cohesion-and-human-feel.md` and the art-direction bar ask for a sense of place. Six rooms with one look do not make
  one.

**Fix.** Per-room `art` in the generator.
- **cn-den:** no moon, earth `mass`, a warm root-glow mood, the lamp colour of the old burrback's home.
- **cn-grove:** lamplit warm under the canopy, the wicks as key lights, no moon on the clearing floor.
- **cn-canopy:** above the cloud layer, the moon huge and low behind the crown, the only cold-white room.
- **cn-west:** thorny and dark, the moon hidden behind the Elder, picked out only down the well.
- **cn-hub:** the lampoak's glow growing with each seed.
- **The pieces:** repaint bark, caps and gates in the wood kit's painted style before more rooms use them.

### 9. The area ends flat
**What.**
- The den is a short drop to a save ledge (2300, 960), then the old burrback on a 4,544-px open floor with `radius:
  1500`. It has no walls to frame the camera, no stage marks (the doc lists that as weak) and no build-up.
- The area then ends on a trigger (`way-on`, 4704). The "vista" landmark at 4760, 1408 sits inside a root wall.
- There is no approach: you drop through the seed door and are at the save at once.

**Why it matters.**
- False Knight's approach (Crossroads_21) holds 4 secrets and a Husk Guard, and the arena is closed and about 1.5
  screens wide.
- Ori ends on the Spirit Tree, a 9-screen set-piece landmark and a save.
- Nine Sols puts Baichang at 58% of the route, with a node 5 widths before him and a heal machine at the door.
- A first area is remembered by its boss and its last view.

**Fix.**
- **Close the arena** to about 2 screens: walls at x 1100 and 3700 (`mass`), a ceiling at 500. The ledge save becomes
  a balcony over it, and a root gate seals the way back at the drop (a `gates` entry flagged by the fight).
- **Add an approach room** between the seed door and the den: 3 screens of root tunnel with one hard group (burrback
  pair + dangler) and a secret. The old burrback's tracks (stage marks) run along its floor.
- **Make the way on a reveal.** Past root-gate, a short climb out to the first real vista of the area beyond (the
  mountain, by `easy-path-same-fun`), with a landmark and the next area's first locked door in view.

### 10. The hero is lost at two room entries
**What.**
- **cn-west entry** (spawn 5800, 1150): she is inside a dense foreground leaf mass and barely visible (`entry` shot).
- **cn-canopy arrival** (7000, 1080), the first frame after the Spire climb, which should be the area's reward
  moment: she stands inside a leaf bush (`arrive` shot).

**Why it matters.**
- The first frame of a room tells the player where they are and what to do. HK and Ori never cover the hero at a room
  edge, and Ori's foreground leaves fade when the hero is behind them.
- Here the two most important arrivals (the descent to the claws, the reach of the canopy) open on a black smudge.

**Fix.**
- Keep foreground leaf masses and covers at least 400 px from every spawn and exit, and add that as a placement
  rule in the scene check.
- Or fade foreground foliage within ~200 px of the hero (render side).
- In cn-canopy, move the arrival to a clear limb end at (6700, 1088), framed against the moon.

## Smaller notes
- **Length and pace.**
  - The design says ~15 min and 47 screens. The references run 33-60 min.
  - The critical path, measured by eye, is ~50,000 px (about 26 view-widths). That is close to HK's 57k, but HK fills
    its 45 minutes with fights and side rooms. Ours has neither to fill time with.
  - Fix #1 and #5 before you add length.
- **Majors.** There are 11, against 15-23; most are big glints (see #4).
- **The free double jump** on a placed player (memory/canopy.md) makes the lock proofs a harness fiction. The hub's
  fork to the high west limb is 384 px, under jump + double (464). A short probe after a settled `goto` showed the
  air jump spent, so I could not break it in play, but the proof should run without zeroing `dj` once the sim fix
  lands.
- **The rule that falls cost nothing** needs a counterweight somewhere. Today no step in the area has a price.

## Scores (1-10, against the HK / Ori / Nine Sols first areas = 9-10)

| dimension | score | one line |
|---|---|---|
| layout | **3** | 6 rooms all on the path, one fork; loops and lock order are sound, but there is no choosing |
| density | **4** | numbers on target, but the peak (Grove) comes first and the travel between peaks is empty of problems |
| combat | **3** | 6 kinds, flat-log 1v1s, 1 hazard strip, no closed arena, a boss on an open floor |
| secrets | **2** | 5, all visibly marked by black blobs or orange planks; rewards are tweaks and glints |
| readability / look | **5** | the moonlit kit is lovely in a still, but six rooms look like one place, placeholder pieces, hero lost at two entries |
| pacing | **3** | the climax at minute 2, no build to the boss, a flat end |

**Overall: 3.5 / 10 against the references.**

The Canopy proves the method: measure the references, build to the numbers, prove the locks. It also proves that
the averages are not the game. What the three references share, and the Canopy lacks, is **mass**: rooms carved out of
solid ground, small enough to hold one idea, with walls that hide things and frame fights. The next round should not
add rooms of sky. Do #2 and #1 together:
1. Add `mass()`.
2. Cut the six boxes into about 16 rooms.
3. Hang 6-8 one-exit pockets off them, with real rewards behind walls that look like walls.
4. Then re-run the metrics, and compare the map's black-to-beige ratio with Ori's.
