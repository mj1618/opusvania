# Wood area 1: the director's review and redesign

2026-10-18. The director's review (`STUDIO.md`, "Cohesion first, rubric second") of chunk 1: `wood-hatch` → `wood-well`
(R1–R10) plus `wood-caps` (R14). It judges the chunk as one experience, next to the reference games, and redesigns it.
It is not a fix list.

**This doc wins over `regions/wood.md` for area 1** until wood.md is rewritten from it (§8 lists every doc it touches).
Matt's standing note for this review: rework freely, with no sunk cost. Where something built is kept, this doc says
why.

**What I used.**
- **The build:** a clean HEAD snapshot (18a0b3b) on its own port. I captured every room whole with labels, the hub and
  the burrow in player view, and the map.
- **The bots:** the region run (`--chunk wood-hatch..wood-well,wood-caps --upto wood-well --seconds 900`).
- **The reviews:** the paper review, level r1 and r2, feel r1 and r2, the plan, and the three first-timers (impatient
  r1, curious r1, casual r2).
- **The bar:** `quality-bar.md` §1 (the HK, Ori, Nine Sols and Celeste teardowns), `core.md`, `journey.md`,
  `creatures.md`, `memory/story.md`.
- **Since my snapshot:** the creature and feel commits that landed while I worked (5cbd0a7, daccfee, 0c28778). They
  bring an earned window and 2× size for the old burrback, a hawker that strikes, burrback stomps, deaths that cost a
  walk, and held story beats. This design assumes them.

## Round 5 revisions: the depth pass (2026-10-18, `reviews/area1-plan-r5.md`)

After rounds 3–4 the area reads as one journey (video r3, first-timer r5) and lacks depth. These win over everything
below, including the round 3 list. The thread: **the dead go somewhere.** Carriers take the moths that die at the
lamps down to a nest in the roots. The old beetle grew huge on them under the oak's floor, and her fight breaks that
floor and lets the moon in.

1. **The den is under the oak, and the boss gives the claws.**
   - The old burrback's arena sits directly under the oak's floor (the mesh and an earth plug are its ceiling).
   - **Glade 2 merges into it.** The den is the glade once the plug falls.
   - Three phases (~90 s):
     1. the beetle rule, with an anti-camp slam;
     2. a roll she breaks by being thrown down from W-den, or with a throw-cut;
     3. desperate rams she baits into the taproot.
   - Its death lets the moon column down the trunk into the den. In that light the wing-lined walls and the blind old
     beetle show, and she gets the claws where it died.
   - The climb-out is the column itself.
   - From the oak's floor the mesh now shows the dark and something breathing, not moonlight.
2. **One new creature kind: the carriers (ants),** scavengers on trails from a lamp's pool to cracks.
   - They are fodder that makes lit floors busy.
   - Their trails signpost finds and holes.
   - All trails end at the nest.
   - Never in R3–R5.
3. **The throw-cut:** a cut during a throw's launch is heavy. It breaks a brace, ends the roll, knocks a hawker off
   and cuts silk. It is taught at R6's T4 (W6's throw aimed at the landing's beetle).
4. **The second reward kind:** three moonlit hollows, one per act:
   - keen blade (R4's door pocket);
   - quick wings (R8);
   - night eyes (the oak's trunk-foot hollow).

   The first health milestone moves to **60 moths**, before the den, and the HUD shows "x / 60".
5. **The roots are a place and a web.** The root stair passes through **the nest** (a wide hall where every trail
   ends, the window onto the sleeping beetle in its west wall). From the nest, **the west root road** (claws) climbs
   to R5's glade floor: a loop back west to the high-wick locks. There are three floor–roots crossings: R5, the oak,
   R9.
6. **Tatter acts once and looks once.**
   - At the oak's first visit it leads her through a crack into the trunk-foot hollow: the oak's first snuff, with
     the moths spiralling up the trunk, and night eyes.
   - At the crown it tries its torn wings, looks at her, and walks ahead onto the canopy road.
7. **Teaching and fairness:**
   - R4's gap needs up-right, and the aim glyph shows on the first catch.
   - R4's adult flips by itself against the root step (the beetle rule seen first).
   - Deaths re-form her in the same room.
   - R8's hawker strikes only on its telegraphed pass and knocks her out of the pull with grace.
   - Held beats fade the HUD and show her looking, with no letterbox.
   - The descent keeps a fall-return point free of danglers.

## Round 3 revisions (2026-10-18, `reviews/area1-plan-r3.md`)

The video review (`reviews/area1-video-r1.md`) and first-timer r3 (`reviews/area1-firsttimer-average-r3.md`) showed
that the content is no longer random, but most of this design never reaches the screen. Five calls change. **Where a
section below disagrees with this list, this list wins.** The sections touched carry a "(r3)" note.

1. **One room for the oak.** The hub (R7) and `wood-heart` (R7b) merge into one room: the floor, the trunk and the
   crown, with no seam. The glimpse, W-ff and the crown ring become visible from the floor, and a fade inside the oak
   re-forms her inside it. Area 1 is 10 rooms.
2. **The light/dark rule is narrowed.**
   - R1–R5 have no forks: a miss is a retry of ≤ 5 s.
   - From R6 on, a dark way exists only where its entrance is in view from the spot where the light line is taken
     (R8's tunnel mouth, the oak's chimney).
   - **The dark way is Tatter's way:** it walks the dark routes, and the player sees it go in.
   - The permanence fallbacks stay as geometry, not as choices.
3. **The hawker's twist is timing, not a race.** Stragglers circle R8's throw lamp. Hawker B dives through the orbit
   on a rhythm and takes one each pass. She goes in just after a pass; caught during one, she is struck down into the
   tunnel.
4. **R3 and R4 teach one idea per screen** (the plan's §1):
   - **R3:** she lands outside W1's field; the stragglers circle W2, the snuff lamp; no hole after the knob.
   - **R4:** the juvenile has no lamp; W3 hangs over the root step and is put out with a standing cut; no lamp's pull
     overlaps a patrol before R6.
5. **R6 grows a lamp chain** (throw → wings → caught → throw) toward the oak's door: the throw's development before
   R8 times it.

---

## 1. Diagnosis: why it feels random and disjointed

The chunk passes most of its rubric (level r2: 127 of 132 items) and still isn't fun. **The rubric counts parts, and
the parts don't belong to each other.** Each room was designed to fix a line in a review, so each room adds a thing,
and the things never meet again. Ten concrete causes follow, most important first.

1. **The core verb is not the critical path.** "Every lamp is a rescue" is pillar 3, and the lamp is the best feel in
   the build (feel r2: "the lamp verb is now the best thing in the chunk"; all three first-timers name the catch, the
   throw or the guarded snuff as a best moment). Yet the bots cross the whole chunk putting out **1 lamp (speedrunner,
   naive) or 2 (cautious)**. The gates are glide gaps, a pogo and a mini-boss, so lamps are side content on a
   platforming level. HK's nail opens doors, kills crawlids, pogoes and breaks walls on the main path from minute 1.
   Ours is something you may also do.
2. **Nothing is developed; everything is introduced.** Area 1 holds about 15 distinct elements in 11 rooms, and most
   appear in one room and never come back:

   | Element | Used in |
   |---|---|
   | seed-cases | R4 |
   | the thorn branch | R6 |
   | hummocks | R8 |
   | the hawker | R8 |
   | the lantern | R9 |
   | the broken face | R9 |
   | bounce caps | R14 + the hub's climb to it |
   | the root knob | R3 |
   | the moth-stone, the hollow | R14 |
   | the dangler | sprinkled, never escalated |

   Celeste ch1 is one mechanic family in four beats. Ours is a sampler, and "random" is the honest word for a sampler.
3. **There is no want after minute 1.** The swarm leaves at 0:15 and the title lands at 1:00. After that, nothing in
   R3–R10 points at the swarm, the moon or a place to reach. The first-timers say so: "after the hub I had no idea what
   my actual goal was" (impatient), "wherever Tatter is going" (curious). HK has one question at Dirtmouth (the well),
   and Ori has the Spirit Tree and Sein. The hub here has three exits, none of which is the answer to anything.
4. **The geography is a corridor drawn diagonally.** The map (Tab) is a staircase of boxes stepping down and right,
   then a row, with the well under it. The hub is one box in the row, not a centre. Names like burrow, glade,
   glidewalk, hollow, hawkers, lantern, well and caps are a list, not a place. No room can see another room, no
   landmark is visible from two places, and the hatching tree is never seen again. You can't point to where you are.
5. **The abilities answer locks; they don't change the world.**
   - Glide is required in R5 and R6, then it's just how you cross gaps.
   - Wall jump arrives at the end, and its main job is to climb out of the hole the well put you in. The crown payoff
     is "one more lamp", which the curious first-timer called thin.
   - The pogo is treated like an ability ladder but is a required skill check at minute 3. The casual first-timer
     spent ~100 attempts there and would have quit at 2:00.
6. **The creatures have no ecology, and they don't bite.**
   - The beetle, hawker and danglers sit "where a lamp is". Nothing about each one's hunt relates to how she uses the
     lamp.
   - The first creature is met together with a lamp and a pogo (three new things), and the casual player lost 7 of 8
     pips to it.
   - The hawker and 3 of 4 danglers never land a hit (level r2), and R9's combination sits above the path.
   - About 8 minutes of the critical path have no threat at all.
7. **The finds have no meaning inside the chunk.** Every optional lamp says "5 moths" and changes nothing you can see.
   The first health milestone is in area 2. The moth-stone, the hollow and Tatter's payoff sit on the optional R14,
   which most players reach late or never.
8. **The story beats interrupt instead of carrying the play.**
   - Tatter is a prop at patches; its want is on an optional branch, and the root-ladder payoff is a TODO.
   - The firefly's glimpse is a camera pan to a glow-cap that has nothing to do with anything she does in area 1.
   - The vista happens to her while she runs.

   Beats are things that play near the player, not things the play is about.
9. **The arc has no middle.** Wonder (0–1), then a flat stretch of competence through five lateral rooms
   (glidewalk, hub, caps, hawkers, lantern) with nothing rising, then a pit. There's no fall and climb, no stakes
   that grow, no turn. The peak (the old burrback) is a beetle's exam with no story attached, and the chunk ends at
   ~22 min on a wick.
10. **The difficulty sits on the wrong beats.** The hardest required inputs are the earliest teaching beats: the
    seed-case pogo (minute 2–3), the thorn branch (2 deaths each for two first-timers) and the first beetle. The
    designed peaks are easier than the teaching.

### Minute by minute against the references (first-timer minutes, *est.*)

| Min | HK: King's Pass → Crossroads | Ori: Sunken Glades → Hollow Grove | Lampfall area 1 now | What the comparison shows |
|---|---|---|---|---|
| 0–1 | Fall in; the cave to the left pays geo | (prologue) Ori falls to the Glades; the Spirit Tree on the horizon | Hatch, the swarm leaves, the run (strong) | We match |
| 1–3 | Doors break under the nail; crawlids are harmless | The first cell in a cave by the start; a creature rams a wall open (enemy as tool) | Chase, vista + title, first wick, catch, snuff | Strong, but the vista doesn't say where to go next |
| 3–5 | The vertical room, a Vengefly over the climb, the Focus tablet; the floor collapses | Spirit Flame from Sein; a stated goal | Beetle + lamp + required pogo gap (three new things) | HK's first enemies are fodder; we open on our hardest read |
| 5–10 | Optional spike pogo, the gate, **Dirtmouth: silence, one question (the well)** | Keystones tour a small area around the Spirit Tree | Glide (great), glidewalk, thorn-branch deaths, the hub | HK's hub *asks* something. Ours offers three doors |
| 10–20 | Down the well; the Crossroads, a small cross-shaped space round one centre; a husk or aspid every other room; Cornifer's trail | Wall Jump at the first tree, payoff one wall up; the map stone | Caps (one beat ×4), hawker (misses), lantern (walked under), the lock | Theirs is one place getting deeper. Ours is a corridor of samples |
| 20–35 | False Knight in the centre of the map you've walked around; spell, lever shortcut | Hollow Grove's toy (bounce, webs), Charge Flame, the Grove opens back to the Glades | Pit, wall jump, climb-out, crown wick, then over (~22 min) | Their peak is in the middle of the world they built. Ours is under it, unseen, and the chunk ends on a wick |

**What HK and Ori do that we don't:**
- **One verb does everything.** HK's nail opens doors, kills, pogoes and breaks. Ori's jump plus Spirit Flame covers
  it, and every new skill is a jump upgrade.
- **One place with a centre.** Dirtmouth and the well, or the Spirit Tree.
- **One direction.** Down, or to the trees.
- **One family of enemies.**
- **Every new thing changes how an old thing reads.**

None of that needs art. It is all design.

---

## 2. The through-line and the arc

### The through-line: **up, back to the sky**

She was left behind by the swarm, and then she falls *into* the wood after its stragglers. The wood floor is a bowl
of dark under a roof she can't get through. The lights that trapped the stragglers are scattered across the floor.
In the middle of the bowl stands **the great hollow oak**. Its trunk is open inside, all the way up to a ring of
moonlight at its crown. **The way out is up the inside of the oak.** Every moth she frees flies there, spirals up
inside it and out into the moonlight. She can't follow, because her claws are too soft for its walls. The chunk is
about getting up that trunk.

What the player wants, and why, moment by moment:

| When | She wants | Because the game showed her |
|---|---|---|
| 0:00–1:30 | To catch the swarm | It leaves without her and Tatter. At the vista it breaks apart over the valley's lights, and stragglers peel off down into the wood |
| 1:30–6:00 | To save the stragglers, then to get away from the lights | The stragglers circle the first wick; a dead moth lies below it; the light grabs her too |
| 6:00–10:00 | To fly: the wings are new | Glide, then the glide gaps |
| 10:00–12:00 | **To get up the oak** | From the hub floor, looking up the trunk: moonlight at the top, every freed moth spiralling up and out, the firefly hanging a new light inside it. Tatter looks up and can't climb. Her walls slide. **This is the chunk's question, asked once and plainly** |
| 12:00–20:00 | To find a way up, and to free the moths on the way, because each cloud joins the ones going up the oak | The east floor is the only way on, its lights hold moths, and each snuff sends a cloud west to the oak |
| 20:00–27:00 | To get through the dark under the floor | A dead end with a bark floor (the move she knows) drops her into the roots. Through a gap she sees the old beetle asleep on a carpet of moth wings, and moonlight falling all the way down the trunk beyond it |
| 27:00–33:00 | **To climb.** Then to put out the firefly's light. Then to see the moths go | The claws, the trunk, the glow-cap she watched being hung, the root she can cut for Tatter, and at the crown every moth she freed, waiting |

### The emotional arc: **wonder → smallness → wings → competence → the dark → claws → release**

1. **Wonder** (0–1:30): the hatch, the run, the title, the swarm pouring into the valley.
2. **Smallness** (1:30–5): she drops into the dark floor. The light grabs her, a moth lies dead, and a beetle shows
   that light means being seen. Tatter is ahead of her, which is a comfort.
3. **Wings** (5–10): she glides, and the floor turns into a place she can cross.
4. **Competence** (10–20): she reads lit rooms. The trap becomes a tool (the throw), and three predators each hunt one
   step of what she does at a lamp.
5. **The dark** (20–27): the floor gives way into the roots. She sees the giant before she meets it, and she wins in
   the dark.
6. **Claws** (27): moonlight falls down the whole trunk onto her.
7. **Mastery and release** (27–33): the climb uses everything. She puts out the firefly's newest light, cuts Tatter's
   root, and the cloud of every moth she freed lifts off from the crown toward the valley.

The ending rhymes with the opening: she was left behind by a swarm, and now she sends one off herself, with Tatter
beside her. That shot is the chunk's payoff, and a first-timer can tell it back in one sentence.

### Set-ups and payoffs (five pairs)

| # | Set-up | Payoff |
|---|---|---|
| 1 | **The oak's crown ring** is seen from the vista (1:20) and again from the hub floor (10:30) | She stands in it (32:00) |
| 2 | **Every freed cloud flies to the oak** and up it (from 3:00). The moth-stone's carving shows moths climbing the oak | At the crown, the cloud waiting is *every moth she freed* (its size is the count), and it lifts off together. The finds have a picture |
| 3 | **The firefly hangs a glow-cap inside the trunk** (the glimpse, 10:30). It burns over the hub all middle-act as a lit lock | It is the trunk climb's key lamp: its pull is the road across, and she snuffs it (29:30). "Someone put this here" becomes "I put it out" |
| 4 | **Tatter can't climb** (it looks up at the hub, 10:30) | She cuts the hanging root at the crown. It falls down the trunk, and Tatter climbs up and sits beside her as the moths go (32:30) |
| 5 | **The lamp throws her** (the first catch, 2:00, and every catch after) | The valley's *Fling* (`core.md` §4): "in the wood the trap throws you; in the valley you learn to throw yourself." Inside the chunk, the trunk's crossings are throws |

Two smaller set-ups that pay inside the chunk:
- **Bark floors give way** (R4's way down, 4:30). R9's dead end is the same kind of floor, and the player already
  knows the move.
- **Juvenile beetle → beetle → old beetle.** The brace, the "pogo me" shell and the ram are read at three sizes before
  the pit.

---

## 3. The core set: fewer, deeper

**This chunk is about the lamp, and about the three predators that hunt at it.** Glide and the claws are how she
moves between lamps. Everything else is cut or deferred.

### The rule that ties them together
(r3: narrowed. No forks in R1–R5; from R6 on, a dark way only where its entrance is in view of the decision, and it is
Tatter's way. See "Round 3 revisions".)

**Light is the fast line, the dark is the slow line.** This is pillar 1 made into level design.
- Every lit route (a throw, a lamp's pull bending a glide, a snuff from a guarded spot) is the quick way through, and
  a predator guards it.
- Every room on the critical path also has a dark way (a lower floor, a tunnel under the roots, a longer climb). The
  dark way is safe, slower and pays nothing.

This does three jobs at once:
1. It makes the lamp the natural critical path for anyone who wants to move.
2. It meets `core.md`'s permanence rule: a lamp she puts out never strands her, because the dark way is still there.
3. It turns the old hard gates (the seed-case pogo, the thorn branch) into a choice of risk.

### The predators: each one hunts one step of the lamp verb
The lamp verb has three moments: **approach and land, stand and snuff, be caught and thrown.** Each predator is real
biology, and each punishes one of those moments.

| Predator | Real detail | What it punishes | Where it lives in a room |
|---|---|---|---|
| **Beetle** (burrback; the juvenile and the old one are rows of it) | Ground beetles eat the moths that fall dead under lights | **Landing and walking** under the lamp | On the floor in the light's pool, on the landing of a throw or a glide |
| **Dangler** | Spiders hang silk where moths circle and drop on what stops below | **Stopping to snuff.** It drops on the spot you have to stand on to cut the flame | On silk over the cut spot: the knob, the ledge under the wick |
| **Hawker** | Dragonflies hunt moths around lights at dusk | **Being caught.** A moth orbiting a flame is the easiest prey there is, so it dives at the orbit | In the air around a throw lamp |

The snuff answers all three, because they scatter when their lamp goes out. That is still the reward. The twist is
that the lamp you need to *throw* from can't be snuffed until you've used it, so at a throw lamp you face its hunter.

### Each element through the chunk

| Element | Introduce | Develop | Twist | Conclude |
|---|---|---|---|---|
| **Lamp: caught, thrown, snuffed** (wick only) | R3, 1:45: the stragglers' wick catches her; beating free **throws her up onto the next shelf** (the fast line; the dark dip is the slow one); a standing snuff from the knob | R4, 3:45: aim matters (a throw across the burrow gap; holding nothing throws her back). R6, 7:30: throw, then open the wings: the throw plus a glide is the longest line in the area | R8, 13:30: **caught is prey**: the hawker dives at her orbit. Beat free early and aim out of its lane. R9, 17:00: the throw line passes a dangler's silk | The trunk, 28:30–30:30: throws are the road up the inside of the oak, and the last one comes from the firefly's own glow-cap, which she then snuffs. The crown cloud is the total |
| **Glide** | R5, 5:00: the glade | R6, 6:00–10:00: safe → a pull bending the glide → throw + glide | The roots, 20:00: gliding down in the dark, where the landings are only lit by the wick that a dangler guards | The trunk: kick-glide across the shaft, bent by the glow-cap's pull |
| **Claws (wall jump)** | Locks: R3's hanging trunk (1:45); **the oak's walls** (10:30), where her kicks slide | Key in glade 2 (26:30); the climb-out (rest ledge) | Through the hub: the lock she stared at is now the road | The trunk: faces, thorn bands, a throw where the face ends, the hawker over the top third |
| **Blade + pogo** | R3: snuff from the knob. R4: the juvenile beetle (2 cuts, no brace) | R4: **down-cut the bark floor** (each cut bounces her: the pogo learnt on the floor, free). Optional: down-cut a flame from above (snuff and bounce) or a braced shell (a stomp) | The roots, 21:30: the **pogo-wick**, a required down-cut snuff that bounces her to the next ledge (a miss lands on a floor) | The old burrback (23:00–26:00): while it's braced, only the pogo hurts it |
| **Beetle** | R4, 3:00: the juvenile, then the adult under W3 (brace, ram; a snuff makes it curl and sleep) | R6, 9:00: an adult on a glide landing (snuff it on the pass and land in the dark) | R9, 17:30: beetle on the floor + dangler over the cut spot, at one wick (one snuff sends both) | **The old burrback**, the one that lives in the dark at the bottom of the oak, fat on the moths that fall down the trunk |
| **Dangler** | R9, 15:30: alone over a cut spot on a safe floor (the thread shows first; step back; cut it while it hangs) | R9: over a throw line. The roots: over a lit landing in the dark | R9: with the beetle | The trunk: from a knot-hole over the rest ledge's wick. (Its boss is the Weaver, area 2) |
| **Hawker** | R8, 12:00: alone at a wick over a safe floor; it dives at her when she's lit (the strike fix: 34–40 f) | R8, 13:30: at the throw lamp over the gap. **It dives at the caught** | (R8's twist *is* the development) | The trunk's open top third: it dives across the shaft while she kicks. (It goes on into area 2) |
| **Thorns** | R6: under the glide gaps (floor only) | R8: under the throw gap | The trunk: bands on the faces where the throw has to carry her past | |
| **Rotten bark** | R4, 4:30: **the bark floor over the hole** is the way down (critical path) | Secrets: R4's door pocket, R6's floor pocket, R8's hollow, the trunk's knot | R9, 19:30: the dead end's bark floor drops her into the roots: the same move, now a door into the unknown | |
| **Moonlight** (patches, glades) | The moon over R1 and R2; P1 | The glade's shaft (glide) | **The moon column inside the oak**: seen from the hub floor (up), through the root mesh (down, from glade 2) | She climbs the column itself and stands in its ring |

### Cut or deferred (ruthless)

| Element | Call | Why |
|---|---|---|
| **R14 `wood-caps`** (the whole room) and the hub's cap climb (B1–B3, the NW door) | **Cut** | One beat four times (level r2), and an optional branch that held the chunk's only story payoff and its map. Its jobs move: the dangler's intro to R9, the moth-stone to the hub, the hollow to R8, Tatter's root to the crown |
| **Bounce caps** | **Defer to area 2** | A second launcher competes with the throw, which is our own. Area 2 (the canopy) can make caps its toy and give them a full ladder |
| **Seed-cases** (R4's gap, seed-0) | **Cut** | The required pogo at minute 3 is where the casual player quits. The pogo now comes from the bark floor (free), then flames and shells (optional), then the pogo-wick (safe), then the old burrback |
| **The lantern** (R9's L1, the hub's L-gap as a floor lamp) | **Defer to area 2** | One room is not a ladder. Area 2 opens with lanterns (the climb's L2, the boughs' swinging lantern) and can build their 2-hit, swinging ladder. The hub keeps one lantern high in the crown as the postgame Fling promise (it burns over the crown; nothing on the critical path touches it) |
| **The thorn branch** in mid-air (R6 gap 3) | **Cut** | 2 deaths each for two first-timers. Thorns in area 1 are floors and wall bands only |
| **The broken-face shaft** at R9's east end, and **R11 `wood-climb`** as area 1's exit | **Merged** into the oak's trunk | The trunk is the wall-jump test and the look back. Area 2 starts at the crown |
| **The canopy line** (E-high, W-canopy, `dang-canopy`, R9's window) | **Moves to area 2** | From the crown it is area 2's first route east, over R8 and R9 (which then become a look back from above). R8 and R9 keep open ceilings for it |
| **The hub's alcove well and its lid** | **Cut** | The root mesh is the only link between the hub and the roots: up from below (the climb-out), then a drop back to P4 as a shortcut |
| **W-hummock** (the decoy light over hummock A) | **Cut** | A light that isn't the hawker's and catches a runner past the hawker's lane: the reason the hawker never hits (level r2) |
| **The bark wall on R6's critical path** | **Cut** | Bark means "a way down / something behind" now. A wall on the main path blurs that |
| **Firefly signs in R6 and R8** | **Moved** | One sign at the foot of the trunk (picked glow-cap stumps, beside the glimpse) and one in R9's dark half. Two signs, both near the firefly's story |
| **The cream "seen" thread** (the giving render) | **Cut** (if 0c28778 didn't already) | It reads as the lamp's pull |

Kept, and why:
- **R1** is the best minute in the build.
- **R2's vista** works. It now also shows the oak.
- **R3's teaching** is Celeste-clean.
- **R4's light-means-seen lesson.**
- **R5's glade ritual.**
- **R6's glide ladder.**
- **The hub as a moonlit hollow.**
- **R8's hummocks under the hawker's lane.**
- **The R9 → chute → pit → glade 2 → climb-out loop.** It is the build's best structure, because the lock and the key
  meet.
- **The old burrback as built** (5cbd0a7).

---

## 4. Spatial design: one bowl, one tree

### The geography

- **The wood floor is a bowl.** The ridge is to the west and high up, where the hatching tree stands in the canopy.
  The floor slopes down east into the hollow, and the great oak stands at the lowest point.
  - The built world already slopes this way: R3's floor is at world y ~5.7k, R6 at ~9.5k, the hub's floor at ~10.3k.
  - The redesign makes the slope the story: down from the ridge, down to the oak, then *up the oak*.
- **The oak is the centre.** Its hollow is the hub, and its roots run under the east floor. Its trunk rises about 2.5
  rooms. The crown sits level with the ridge's mid-slope (world y ~4.7k, R3's floor height). From the crown the
  canopy road runs east to the rim and the valley (area 2).
- **Three layers, used consistently:**
  - **canopy** (high): R1 and R2, then the crown;
  - **floor** (middle): R3–R9 and the hub;
  - **roots** (low): the chute, the pit and glade 2, under the hub and the east floor.
- **The moon is always east-north-east**, over the valley. Inside the oak the moon column falls straight down: from the
  crown, through the hub, through the root mesh, onto glade 2.

### Landmarks and sightlines

| From | You see | It tells you |
|---|---|---|
| R2's vista (1:20) | Three things in depth: the valley's lights far off with the swarm breaking up over them; **the great oak** in the hollow below, taller than everything, with a ring of moonlight at its crown; stragglers peeling down into the wood | Where the swarm went, where you are going (the oak), and where you're going now (down after the stragglers) |
| R3–R6, background layer | The oak's trunk, getting closer room by room, with freed clouds flying toward it | You are walking to it |
| R6's last landing | The oak's west door filling the right of the frame, cool moonlight inside | Arrival |
| The hub floor | Up: the trunk, the crown ring, the glow-cap, moths spiralling out. Down: moonlight through the root mesh from below | The goal, and that there is something under you |
| The moth-stone (hub) | The area drawn on the map, the roots faint under the hub; its carving shows moths climbing the oak | The shape of the place, and the way out |
| R8 and R9, west wall | The oak's bulk behind the arch | Home is behind you |
| The roots' window (21:00) | The old beetle asleep in a pit carpeted with wings; past it, the moon column landing on glade 2 | The peak, seen before it is met (level r2 problem 6) |
| The crown (32:00) | West: the slope up to the ridge and the hatching tree under the moon (the look back). East: the valley's lights, nearer than at the title | How far she has come, and where next |

### The loops, in physical terms
1. **The big loop** is the chunk: hub → east along the floor (R8, R9) → down through R9's bark floor → west through
   the roots under the floor → under the oak (glade 2) → up through the root mesh into the hub → up the trunk. She
   walks a circle around and under the place she first stood, which is why the oak feels like the centre.
2. **The shortcut:** the root mesh drops from the hub to P4 once she has climbed through it.
3. **The optional return west** (wall jump, ~4 min): R6's return bough → R5's east trunk → R4's hole climb → R3's high
   wick by the hanging trunk. The lock seen at 1:45 pays, and its moths join the cloud at the crown.

### Map sketch (the redesigned chunk)

```
 WEST (the ridge)                                                         EAST (the valley, the moon ☾)
 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 CANOPY  ┌─R1 hatch──────┐
         │ hatching tree │──┐┌─R2 chase──────────────────┐
         └───────────────┘  └┤ fallen trunk ↘  VISTA ◄─── sees: valley lights · the OAK's crown ring · stragglers
                             └───────────────────┬───────┘
                                                 ↓ the lip           ┌── CROWN (P5) ──┐ ──► area 2: canopy road east
                                                                     │ the cloud lifts │     over R8 and R9
 FLOOR   ┌─R3 first lights─┐┌─R4 burrow (P1)──┐                     │ Tatter's root   │
 (slopes │ W1 throw · knob │┤ juvenile · W3   │                     ├─ R7b the oak's ─┤
  down   └─────────────────┘│ throw gap       │                     │ heart: trunk    │
  east)                     └─bark floor──────┘                     │ climb (glow-cap)│
                           ┌──▼R5 glade (P2)─┐┌─R6 glidewalk──────┐┌┴─R7 the hollow ─┴┐┌─R8 clearing──┐┌─R9 silk hall─┐
                           │ wings · lip     ├┤ throw+glide · W6  ├┤ HUB (P3) stone   ├┤ hawkers      ├┤ danglers ·   │
                           └─────────────────┘└───────────────────┘│ Tatter · glimpse ││ hollow (sec.)││ beetle · bark│
                                                                   └──╥ root mesh ────┘└──────────────┘└────floor┬────┘
 ROOTS                                                    ┌glade 2 (P4)┐╥┌─ the pit ──────┐┌─ the root stair ◄─┘
                                                          │ moon column├╫┤ old burrback   ├┤ dark ledges, lit pockets,
                                                          │ CLAWS      │ │ (seen from the │◄ window   pogo-wick, P-chute
                                                          └────────────┘ └ window first) ─┘└──────────────────────────
```

---

## 5. The redesigned chunk, room by room

Minutes are a first-timer's, *est.*, calibrated on level r2's finding that the build's rooms run about 1.6× faster
than the old beat sheet's. The redesign adds play, not walking: about 31 minutes on the critical path, and **~35 with
the finds a first-timer takes**. Each room lists its arc purpose, its use of the core set, its encounter, its find and
its beat.

### Act 1: the fall (0:00–6:00)

**R1 `wood-hatch`** (kept; 0:00–0:40). *Wonder and the want.* The cocoon, the swarm leaving past the moon, Tatter's
failed hop, the run.
- Fix: the trunk in front of the second gap reads as a wall (the casual player fell 11 times). Push it behind the play
  plane or darken it.
- Fix: give the cocoon one visible prompt.
- No find. HK's "go left" find is in R2.

**R2 `wood-chase`** (kept; 0:40–1:40). *Wonder → the destination.* The fallen trunk run, then the vista as a held
beat on the lip (`hold`, daccfee; ≤ 150 frames).
- The vista frame shows three layers (§4): the valley's lights, the oak with its crown ring, and the stragglers.
- She drops over the lip after them.
- Find: W-cave behind the landing (kept).

**(r3) R3 and R4 are superseded by `reviews/area1-plan-r3.md` §1, beats 4–11:** one idea per framed screen; the
stragglers circle W2; the juvenile has no lamp; W3 is cut standing from the root step.

**R3 `wood-wicks`, "the first lights"** (reworked; 1:40–3:00). *Smallness: the light grabs you, and it can throw
you.*
- **The stragglers circle W1.** The dip under W1 gets a far wall too tall to climb from the dip floor.
- **The fast line:** jump at W1 from L, get caught (measured 17 of 17), beat free holding right, and the throw lands
  her on M. The arrow is the throw. If she holds nothing she is thrown back west, which costs nothing.
- **The slow line:** the dark dip's floor runs on east under M to root steps that come up at the knob, about 6 s
  longer.
- **First snuff:** W1's stragglers are freed by a jump-cut from M. The dead moth lies in the dip.
- W2 from the knob is kept as a standing cut.
- The hanging trunk with W-hi3 is the claws' first lock.
- Freed moths fly east (toward the oak, off screen).
- Encounter: none.

**R4 `wood-burrow`** (reworked; 3:00–5:00). *The blade against things, and light means seen.*
- **The juvenile beetle:** a beetle row with 2 hp and no brace, under a small wick near the door. The first creature
  dies in two cuts and teaches "hit it, it reacts" (the crawlid slot).
- **The adult** under W3: its brace and the amber shell. It ignores her in the dark and notices her in W3's light.
  Snuffing W3 (a jump-cut from the root step) curls it up asleep. That is the best moment the curious first-timer had,
  kept as the room's centre.
- **The gap:** the seed-cases are gone. A wick hangs over the gap with no creature near it. Being caught and thrown
  right lands her on F3. That is the throw's second use, with the aim now mattering.
  - The slow line is the dark lower floor (kept, at 1472), with a low root tunnel east under F3 to steps up.
- **P1 with Tatter**, ahead of her.
- **The way down: a bark floor over the hole.** Three down-cuts from a hop, and each cut bounces her (the pogo, learnt on solid
  floor, where a miss costs nothing). On the third the floor breaks and she falls into the glade. This is HK's
  collapsing floor, and the pogo, and the bark language, in one safe beat.
- Find: W-pocket behind the door bark (kept).

**R5 `wood-glade`** (kept; 5:00–6:00). *Wings.* The bask, glide, and the lip over the chasm. Find: W-alcove under the
lip (kept).

### Act 2: the floor (6:00–20:00)

**(r3) R6 grows a fourth beat:** the lamp chain over a long chasm toward the oak's door. T4's beetle patrols ≥ 300 px
from gap 3's lip.

**R6 `wood-glidewalk`** (reworked; 6:00–10:00). *Wings become joy, and the lamp joins the glide.*
- **Gap 1 (safe):** the walk-off under the root roof (kept).
- **Gap 2:** the high line is **caught at W5, thrown, wings open**: the throw plus a glide carries to T3. The low
  line is a walk-off glide under the pull. Both are kept; the high one is the fast line, the low one the slow.
- **Gap 3:** the thorn branch is gone. W6' hangs over the gap so that a glide passes through the edge of its pull
  (0.6 while gliding): steer through the bend, or get caught and throw out toward T4. Thorns on the floor below
  only.
- **Landing T4:** the adult beetle under the landing's wick. Snuff it on the pass (a glide cut) and she lands in the
  dark with the beetle asleep, or land in its light and fight.
- P-t3 kept.
- Find: the bark floor pocket.
- Beat: from T4 the oak's west door fills the frame.
- Fix needed (feel r2 #6): the one-held-input crossing via `wick-line`'s slingshot.

**(r3) The hub and R7b are one room, "the oak"** (Round 3 revisions, item 1). The two entries below describe its floor
and its trunk. The glimpse is a held look-up of the whole trunk, ending on Tatter turning to look up.

**R7 `wood-hollow`, the hub: "the hollow oak"** (reworked; first visit 10:00–11:30). *The question.* She enters at
floor level.
- **P3**, and the **moth-stone**: the area drawn on the map, the roots faint below. Its carving shows moths climbing
  a tree.
- **Tatter** sits under the trunk looking up.
- **The glimpse**, as a held beat: the camera looks up the trunk. A warm light hangs **W-ff, a glow-cap on the
  trunk's inner wall** about two thirds up, pulses twice and darts out through the crown. W-ff then burns over the
  hub all through act 2.
- **The first firefly sign** at the trunk's foot: a ring of picked glow-cap stumps.
- She can try the walls: kicks slide. That is the lock, met by hand.
- The root mesh in the floor glows with moonlight from below.
- **One way on: the east arch.** This is HK's Dirtmouth, a rest and one question, not a crossroads. (Area 2's knot is
  the crossroads.)
- Encounter: none.
- Every cloud freed anywhere in the area flies in through the arch or the door and spirals up the trunk.

**(r3) R8:**
- the camera frames both ledges and the lamp;
- the pit under the gap is the tunnel's mouth, in view and lit from below, so a miss drops her into the slow way;
- hawker B hunts W-throw's orbit on a rhythm (Round 3 revisions, item 3);
- Tatter walks into the tunnel on the first visit.

**R8 `wood-hawkers`, "the hawkers' clearing"** (reworked; 11:30–15:30). *The hawker, and being caught is being prey.*
- **West half:** hawker A at W7 over the hummocks, a safe floor. W-hummock is cut, so nothing throws her past its
  lane. Its strike (34–40 f) teaches the tell: the reticle, step aside, cut it in its stall.
- **East half: the throw gap.** A wick high over a thorn-floored gap. Hawker B hunts it.
  - **The fast line:** get caught, and while she orbits, B tells and dives at the orbit. Beat free before the strike
    and aim the throw out of its lane onto the far ledge.
  - **The slow line:** a dark root tunnel under the gap (no lamps, no moths, ~15 s longer).
  - The throw lamp can't be snuffed before she uses it. Afterwards she snuffs it from the far ledge with a jump-cut,
    and B leaves.
- **Find:** the dark half's bark mound hides the **moonlit hollow** (quick wings: beat free in 2 presses). Here it
  pays straight away: the next throw lamp, and every hawker, is easier.
- P-dark kept.
- Beat: the clearing's freed clouds fly back west over the arch to the oak.

**R9 `wood-silk`, "the silk hall"** (replaces `wood-lantern`; 15:30–19:30; no player saves exist yet, so the id can
change). *The dangler, and the predators together.* A tall hall where silk hangs from the canopy into the light.
- **Dangler alone:** a wick over a knob-like cut spot on a safe floor. The thread shows first, and it drops on the
  spot where she has to stand. Step back, let it drop, cut it while it hangs, or cut the flame from a jump instead.
- **Over a throw line:** a throw wick whose best line passes beside a dangler's silk. Wait out its drop, then go.
  The slow line runs under on the dark floor.
- **The composition** (the twist, on the critical path, not above it): an adult beetle in the light's pool, a dangler
  over the only cut spot, one wick. A single snuff sends both away, but reaching the spot means landing on the
  beetle's floor under the dangler.
- **Dark half:** the second firefly sign (a half-hung string of glow-caps, as if interrupted).
- **The dead end:** a bark floor like R4's. Her freed moths go west; nothing goes on east. She cuts down.
- **Fix:** level r2's "fiddly floor-panel timing hunt" goes, because the panel takes plain down-cuts from standing
  (each one bounces), exactly like R4's.

### Act 3: the roots (20:00–27:00)

**R10 `wood-well`, the root stair, the pit, glade 2** (reworked; 20:00–27:00). *The dark under everything, and the
threshold.*
- **The root stair** (the chute, kept): dark ledges stepping down west, with glide gaps. Two lit pockets, each a wick
  with a dangler over its landing.
- **The pogo-wick** (new, required, safe): a wick hung just under a ledge's lip so the natural way on is to drop and
  down-cut. It snuffs, bounces her to the next ledge, and a miss lands on a floor below.
- **The window:** a gap in the roots where the camera holds a beat. Below, the old burrback asleep on a carpet of
  wings. Past it, the moon column landing on glade 2.
- **P-chute** at the pit door: a death costs a short walk (daccfee).
- **The pit:** the old burrback as built in 5cbd0a7 (2×, earned window, pogo on the brace). Its den is lit by nothing,
  so as a mini-boss it ignores the lit rule.
  - A first-timer meets it having read the brace three times (juvenile, R4, R6, R9) and having pogoed on bark and on
    a flame.
- **Glade 2:** the moon column falls the whole height of the trunk onto her. "Your claws have hardened." P4.
- **The climb-out:** both faces, a rest ledge, up through the root mesh into the hub.
- Find: W8 behind the gate (kept).
- Encounter ladder here: dangler ×2 in the dark pockets, then the mini-boss.

### Act 4: the climb (27:00–33:00)

**R7 hub, second visit** (27:00–27:30). She comes up through the mesh. Tatter turns to watch her. Its look-up state
now faces her. The walls hold.

**R7b `wood-heart`, "the oak's heart"** (new room above the hub; ~2048 × 2600; 27:30–31:00). *Mastery: everything
at once, going up.* The hub's up-shaft continues into it.
- **Lower third:** two kickable faces and a rest ledge with a small wick, with a **dangler** dropping from a knot-hole
  onto the ledge's cut spot.
- **Middle third:** **W-ff, the firefly's glow-cap**, on the inner wall. Above it the near face is a thorn band. The
  way on is to be caught by W-ff and **thrown across** to the far face's holdable band, or to kick-glide across
  through its bend. Then she snuffs it from the far face.
  - This is the glimpse's payoff, and the chunk's last throw.
- **Upper third:** the open crown. A **hawker** hunts the crown wick and dives across the shaft while she kicks.
- **Find:** a bark knot with an optional wick.
- The postgame lantern burns across the crown gap: the Fling promise.
- **At the top: the hanging root.** One cut and it falls down the trunk.

**The crown** (end of R7b; 31:00–33:00). *Release.*
- **P5.**
- A held beat for the look-out: west up the slope to the hatching tree under the moon, east to the valley's lights.
- **The cloud:** every moth she has freed is circling the crown, and its size is the count. It lifts off east into
  the moonlight.
- **Tatter** climbs the fallen root and sits beside her.
- She can't follow the moths up. She goes east along the canopy, and area 2 begins.

### What changes in the numbers

| | Now (level r2) | Redesign |
|---|---|---|
| First-timer, critical path | ~22 min | ~31 min (+ ~4 of finds ≈ 35) |
| Wall jump | ~18 min | ~26:30 |
| Critical-path snuffs (bots) | 1–2 | ≥ 9: W1, W3, the R4 gap wick (after the throw), W6, R8's two, R9's, the pogo-wick, W-ff |
| Element kinds in area 1 | ~15, mostly once | 3 lamp moments, 3 predators + 2 rows, glide, claws, pogo, thorns, bark, moonlight: each in ≥ 3 rooms |
| Rooms | 11 | 11: R14 cut, R7b added, R9 rebuilt. (r3: 10, the hub and R7b merged into the oak) |
| Stretch of the critical path without a threat | ~8 min | ≤ 3 min (only the glade, the hub, the glade 2 rest) |
| Story on the critical path | the glimpse and Tatter's patches | the vista's oak, the stragglers, the dead moth, Tatter ahead, the glimpse, the stone's carving, the window, the column, the glow-cap snuffed, the root, the cloud |

### What has to be built (the kit and the engine stay; four small additions are essential)
1. **The throw must not depend on holding jump** (casual r2: found by accident, and the strength is what makes it
   fun). A throw is a launch, and a jump release doesn't cut it. While she's caught, show **the throw's arc**, or at
   least its length, along the arrow (Ori's Bash preview). *Essential: the throw becomes the critical path.* Sim
   (lures) plus render.
2. **Freed moths leave along the room's migration line toward the oak, not into the HUD counter.** At the crown,
   **one cloud sized by the moth count** circles and lifts off. *Essential: it is the finds' meaning and the chunk's
   payoff.* Render staging only; the count exists.
3. **The juvenile beetle**: a tuning row (2 hp, no brace, a short ram). No new code.
4. **The hawker's prey rule:** when she is caught in its lamp's light, it starts its tell at once and aims at the
   orbit. This is probably tuning on the existing lit sense; check it first.

Everything else uses what exists: lures, thorns, bark floors, flag gates, triggers with `hold`, patches, glades, the
moth-stone, signs, the hollow, danglers, the hawker, the old burrback, camera zones. **Deleted from the build:**
`wood-caps` and its hub climb, seed-cases from R4, the lantern from R9, the thorn branch, the alcove well and lid,
W-hummock, and the canopy line (moved to area 2).

---

## 6. Enemy ecology

**Why they are here.** The firefly hung its lights down the moths' road, and the stragglers that fell into the wood
circle them. Predators come to the circling. Each one waits at the moment a moth is weakest:
- the **beetle** on the ground for the moths that fall;
- the **dangler** on silk over the spot below the flame;
- the **hawker** in the air for the ones caught in the orbit.

The **old burrback** never needed a lamp. It lives at the bottom of the oak, where every moth that dies in the trunk
falls, and it has grown huge.

**What each does to a room.**
- The beetle makes landings and floors cost something.
- The dangler makes standing still to cut cost something.
- The hawker makes being caught cost something.

So a lit room's read is "where do I land, where do I stand, and do I let it catch me", and the snuff answers all
three at once.

**The minimum new creatures:** none. One row (the juvenile beetle) for a fair first fight. The bombardier, the web and
weaver, and the lanterns belong to area 2, where each gets its own ladder. Area 1's variety comes from three
predators that compose, not from more kinds. That matches Ori's first hour (3–5 kinds) more than HK's (8–10), and it
fits a game whose density is in movement.

**How fights escalate** (instances on the critical path, ~16 plus the mini-boss; the build has ~10, and most never
bite):

| Step | Where | What |
|---|---|---|
| 1. Fodder | R4 | Juvenile beetle, 2 cuts |
| 2. One predator, one lamp | R4, R8 west, R9 west | Adult beetle under W3; hawker A over a safe floor; dangler alone |
| 3. One predator on a moving line | R6 T4, R8 east, R9 throw line | Beetle on a glide landing; hawker at a throw lamp (it hunts the caught); dangler beside a throw line |
| 4. Two predators, one lamp | R9's composition | Beetle on the floor + dangler over the cut spot |
| 5. In the dark | The root stair | Danglers in the only lit pockets, over glide landings |
| 6. The exam | The pit | The old burrback, everything the beetle taught, plus the pogo |
| 7. Everything, moving up | The trunk | Dangler on the ledge, the firefly's lamp as the road, a hawker across the shaft, on the walls |

Every predator on the critical path must be able to bite a player who takes the fast line. That is the check level r2
showed we fail: the hawker and 3 of 4 danglers never hit. **Placement rule: put the dangler where she must stop, the
hawker where she is held, the beetle where she lands.**

---

## 7. What the reviewers should check next time

These are experience questions, not rubric items. Answer each from a first-timer's video or journal and from your own
play, in one or two sentences, with the moment it was decided.

1. **The one-sentence test.** After playing, can a first-timer say what the chunk was about? Pass: something like
   "I fell into the wood and had to climb the big tree to get out, freeing moths on the way". Fail: a list of rooms.
2. **When did they first want to climb the oak?** At the hub (~10:30)? Earlier, at the vista? Never?
3. **Did they use the lamp on purpose?** Count catches they chose to take (aimed throws) against catches that
   happened to them. Did the throw feel like theirs by R8?
4. **Did each predator bite them once, at its moment?** (The beetle at a landing, the dangler at a cut spot, the
   hawker while caught.) Did they work out *why* each was where it was?
5. **Did the snuff feel like the answer?** At R9's composition, did they go for the flame or the creatures?
6. **Did any element feel random?** Ask them to name a thing that "came out of nowhere". Anything named is a cut or
   a ladder candidate.
7. **Can they draw the map from memory**, roughly: where the oak is, what's under it, where they came in?
8. **Did they recognise the glow-cap in the trunk** as the one they saw hung? Did snuffing it feel like a turn?
9. **The crown.** Did the cloud read as *their* moths? Did a player who took more finds see a bigger cloud, and
   notice it? Did Tatter's climb land?
10. **The dark line.** Did anyone take a slow dark route? Did they feel the light/dark trade (fast and dangerous
    against slow and safe), or did the dark route read as a wrong way?
11. **Quit points.** Where would a casual player have stopped? Name the minute and the input. Nothing before 6:00 may
    take more than 3 tries.
12. **Peak placement.** Were the hardest moments the pit and the trunk, and not a teaching room?
13. **Time.** First-timer critical path 28–34 min, ~35 with finds. Wall jump at 25–28.

---

## 8. Follow-ups (owners update their own docs; this doc wins meanwhile)

- **`regions/wood.md`:**
  - rewrite §1–§10 and the rescope section for area 1 from this doc;
  - area 2 now starts at the crown (the canopy road east over R8 and R9), and R11 `wood-climb` is merged into R7b.
- **`journey.md` §1:** Tatter's want moves from the cap stair (beat 2) to the oak (the hub look-up, the crown root,
  both on the critical path). The firefly's wood row: the glow-cap is hung *inside the trunk* and snuffed in the
  climb.
- **`creatures.md` §2:** add the juvenile beetle row. Add the predator-per-moment rule (§6) to the design rules. The
  dangler's first room is R9, not R14.
- **`core.md` §3:** the throw is a launch (no jump-release cut), and the caught state shows its arc. Freed moths fly
  to the area's gathering point (the oak's crown in area 1).
- **`world.md` §2.3:** area 1's toy is "the trap's throw"; bounce caps move to area 2. The light/dark line rule (§3
  here) as a room guideline.
- **Level:** rebuild R3, R4, R6, R7, R8, R9 and R10's stair; add R7b; delete R14 and the hub's cap climb.
- **Feel and sim:** §5's four essentials.
- **Staging:** the vista's three layers, the glimpse inside the trunk, the window, the crown cloud and Tatter's climb.

---

## 9. Build notes (builders write here where they deviate or need to agree something)

### The oak, as built in round 3 (2026-10-18; memory/rooms.md "The oak")
- **One room:** `wood-hollow` is now the oak, world (27584, 6208), 3840 × 4208: the hollow (floor world y 10048, its
  doors, P3, the stone, the sign, Tatter, the mesh), the trunk and the crown. `wood-heart` is retired. The stub
  `wood-canopy` sits at (31424, 5952), on the crown's `canopy` exit. The oak's column is world x 30336.
- **For the builder of R6 and R8–R10:** when R6 grows (+2048), move `wood-hollow` and `wood-canopy` east with R8–R10
  (the oak to x 29632, the stub to 33472); nothing inside them changes.
- **Item 6:** catch rungs every ~550 (no fall over 620, tested from 12 drop points); the thorn band 140 (was 200); the
  glow-cap ledge under W-ff (a hop from it is caught; up-left beats land on the knot bridge in 36 of 36); the snuff from
  the bridge's tip in frames 0-8, framed by a zone; P-ledge, a moon patch at the rest ledge. A strike on the rim knocks her
  straight (the creatures agent, 816bf0d), and the catch ledge at 912 limits any fall off the lip to ~340.
- **Item 7:** the crown trigger is the finale (hold 540, `endSets: wood-crown-gone`), and the gate on the east exit
  opens on that flag. The stage `vista` frames the crown at zoom 0.5 for 9 s; the hatching tree's silhouette west is
  staging's (no prop exists yet). **For staging:** the oak has one `marks.tatter` (the floor, `until` the root), so
  Tatter's climb up the fallen root and its seat by P5 (x ~3616, y 576) need a staging mark of their own.
- **The crown hawker is on the rhythm** (`orbit: wick-crown`, 816bf0d): time the catch after a pass and the throw
  reaches the rim; mistimed, it strikes her straight down onto the ledges under the orbit (1080, 912).
- **Item 2:** the glimpse holds 180 and frames the crown ring and W-ff together (2752, 1300, zoom 0.5); the firefly
  hangs the glow-cap at W-ff's own point. No exit inside the tree (no green line in the trunk). A zoom-out at the
  trunk's foot is the camera agent's (a 0.5 zone there lurched the camera at the room's foot).
- **Fades:** `reform` at P3, not `reformPatch`: nearest-patch would stand her up at P5 after any fade near the top,
  past the root's cut. Sim: if `reformPatch` took only patches at or below where she lay, the oak would use it.
- Kept from round 2: W-ff snuffed from above (the bridge's tip), the dark way (the ledge's hole, the tunnel, the
  chimney to the bridge), the crown wick off the rim's lip, the root as a 1-cut curtain on the rim.

### The oak, round 4 (area1-video-r2 #1, #3; memory/rooms.md "The oak")
- **W-ff's catch is a choice.** It hangs 300 px off the near face over a floor (1776) that stands out of its pull;
  the near face holds only up to that floor. She hops into W-ff from the floor; the throw lands on the knot bridge,
  whose tip is over W-ff (the pogo snuff). Nothing grabs her on the face.
- **Falls stop within 600 px everywhere on the climb** (rungs, the floor, face ledges at 1248 / 1080 / 840, an upper
  rung at 1000, chimney rungs). A fade above the rest ledge re-forms her at P-ledge (`reformPatch`, 8036fc0).
- **The crown, after human-like runs in the oak:** footholds against the last face make it a stair of plain jumps;
  on the rim the root's knot, the crown wick (a standing cut, its hawker's blows land her on the rim: `rim`), P5 and
  the finale trigger sit close together, so the wick is out (and its hawker gone) before the release. The finale
  trigger spans the rim's full height and is the shut door (no gate). The postgame crown lantern is cut: in view
  of the rim it drew players off the top (the Fling promise belongs to area 2's canopy road). The human-like
  personas still end "lost" after the finale: they explore every unwalked cell before leaving (the pocket, the
  band's top), which a player who has just seen the cloud go would not do; claws -> P5 is ~45 s for every persona.
- **The first visit:** P3's glimpse holds 300 frames with the rest inside it; then Tatter's look-up under the trunk
  holds 180 (the trunk-foot zone frames it tall); the east arch is shut until both have played; then Tatter leads her
  out (`stage.tatters`, render's `climb.lead`). That is ~8 s of held beats plus the walk: ~15-17 s, still short of 25.
  Longer would need more held input (I'd rather not) or a reason to stand that isn't a hold.

### The oak, round 5 (plan r5 items 7, 9; memory/rooms.md "The oak")
- **The first visit is lived:** the glimpse holds 180; then Tatter goes in at a crack in the root flare at the trunk's
  foot; the bark (3 cuts) is the way east; the hollow inside holds W-foot (three stragglers, the oak's first snuff),
  night eyes, and Tatter in the moonlight, which leads her out to the east arch. No other held beat on the floor.
- **Tatter's crown beat:** a `stage.tatters` entry walks it ahead of her onto the canopy road east once
  `wood-crown-gone` is set (`vanish` at the exit); its wings, hop and look on `wood-crown` are render's poses.
- **The den under the oak (agreed for builder 1):** the boundary stays the oak's bottom edge (world y 10416); the
  oak's floor over the den is its ground (368) with the root mesh over the `climb` exit (oak x 2560-2944, world
  32192-32576, `noDrop` until `wood-climbout`). The **plug** is the den's: a flag gate in its room under the mesh,
  cleared by `wood-old-burrback-down` (the boss's `sets`); the climb-out goes up the column through that exit onto
  the mesh, and the den's top sets `wood-climbout` as now. The oak needs no new flag; its staging can read
  `wood-old-burrback-down` (the mesh breathing until then, the moon column stopping at P3's floor).

### The oak, round 6 (video r4 #4, #8; memory/rooms.md "The oak")
- **The thorn band is 60 px high on the slick face** (was 140; 4–7 hits a run): out of reach of a jump from the floor
  under W-ff. The climb's danger at the top is the crown wick's hawker.
- **Dressing:** overhang-only shapes (root curtains from the hollow's roof; the west wall stepping out toward the
  crown, so the trunk narrows to its ring), so no unreachable ledge is in view.
- **Tatter framed close:** camera zones `hollow` (1.4) and `crown-close` (1.3) for render's two beats.
