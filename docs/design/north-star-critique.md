# Critique: north-star.md (*Tallage*, L5 v1)

Reviewer: level design critique, 2026-09-28. Subject: `docs/design/north-star.md` v1. Read alongside STUDIO §1c, the four teardowns, `level-toolchain.md` §1 and §7, `world-design.md` rev 2, Concept A, the movement and combat specs, and the L3 novice playtest.

## Verdict

**Good bones, wrong unit of measure, and one flat spot in the middle.** The rulings in §0 are the best thing in the document: they stop the team arguing about numbers. The decisions in §2 (HK scale, square bones with skin and three floor slopes, no slope momentum, edge exits with peek, merge deferred) are the right ones and I would not reopen them. The first 20 minutes has three real beats: seizing the floor you stand on, the Great Scale as a machine you weigh, and the store lift arriving in the Gutter.

But the document measures *rooms* and *graphs*, and STUDIO §1c's diagnosis was that "we built what we measured". An agent team can land every number in §3 and still ship 25 disjointed boxes, because not one metric in §3 measures what happens *across a seam* or *across a region*: the same beacon at the same angle from two rooms, a street floor at the same height on both sides of a lot line, the shot the camera frames on arrival. Those are the things that make the Crossroads one place. §7 fixes the biggest of these below.

The fiction is spread thinly over an HK graph. Sound-is-title shapes the gates, the audio bed and the map fiction, but the *spaces* in the first 20 minutes would work the same if the hums were switches. And the walkthrough's default route makes the Slip's own test optional: you find it at 17:00 and then ride a lift.

Ranked changes are in §7. The top five are: author and measure the region as one section, not a room list; fix the Slip beat and end the 20 minutes by closing the loop from below; retire the lot-line bag reset; put two Tallage-only *spatial* ideas in the first region; and shrink the first blockout to a 7-room proof.

---

## 1. Will a region built to this spec feel like a place?

### 1.1 What the metrics can't see is exactly what makes a place

HK's cohesion in the Crossroads teardown comes from three things: **local continuity is perfect** at every door, the **roads run at five consistent depths** crossed by two spines, and **rooms are shots** timed to land a set piece in frame. None of the three is a §3 target.

- **Door alignment "exact, to 0 tiles"** is the only cross-seam rule, and it checks an opening, not a *floor*. A street can step 3 tiles at a lot line and pass.
- **Strata are implied** by the §4.1 diagram (roofs, street, gutter, cellars, deep) but never stated as heights, and nothing lints them. The Crossroads gets its "grid of roads" from y-bands within a few units. Make it a rule: **the hub has four named strata at fixed world rows** (roofs, street, gutter, cellars), every hub room's principal floor sits on one, and the metrics tool reports any hub floor that isn't. That one lint produces more HK legibility than the whole §3.2 table.
- **Beacons "drawn at true world position in neighbours' backdrops"** is listed but not tested. Add a sightline test: from every hub exterior room, and from the first three Cellars rooms via the hatch column, compute whether the Bell tower and Board fall inside the camera frustum at zoom 1.0 from the room's entrance anchor. Report the bearing. A beacon that's *data* but never in frame is not a beacon.
- **Camera zones ≥ 80%** counts zones, not shots. HK's 104 zones are *compositions*. The doc needs each set piece to declare its **framed shot** (a rectangle in tiles and a zoom), and the world PNG should draw those rectangles so a reviewer can see the picture the player will see. §4.2 gives room sizes (4 × 4.5) but never the shot.

### 1.2 Targets that can be gamed

| Target | How an agent hits it without making a place | Guard |
|---|---|---|
| Median room 5–6.5 scr², box fill 45–80% open | A large hollow box with a floor. The toolchain calls "size without content" a *high* risk; the north star's only content floor is "≥ 70% of rooms hold something", which one Poundage cache satisfies. | Add a dressing floor per screen (HK: 134 sprite-equivalents per scr² at final; greybox: ≥ 1 landmark or waymark prop, ≥ 3 breakables, ≥ 1 occluder per screen), and require the box fill to come from *authored* masses (stamps, arches, piers), not a `blob` with `rough`. |
| Landmark every ≤ 3 screen widths; 18–24 named landmarks in 22–28 rooms | Name a prop in every room. A named `Landmark` entity is not a landmark. | Test distinctiveness, not count: the blind-sort reviewer (P1) must *name* the room from a HUD-less screenshot, and two landmarks may not share a silhouette class. Cap landmarks at 1 per 1.5 rooms so they stay rare enough to matter. |
| Flow chain ≥ 15 s bot-optimal | A 135-tile flat corridor is a 15 s chain. | Join the cadence rule to the chain rule as one gate: a chain counts only if it contains a beat every 8–12 tiles *and* ≥ 2 verbs *and* ≥ 40% of its length on a slope or a drop. |
| Independent loops ≥ 3 | A 2-tile tunnel between two rooms closes a loop. | A loop counts if its two arcs differ in stratum or verb, and each arc is ≥ 2 rooms. |
| Dead ends 100% paying out | A Poundage cache at the end of every stub. HK's 14 pay a grub, a bench, a spell, a mask. | Tier the payouts: in a 22–28-room region, ≥ 3 dead ends pay a *major* (Chin piece, Corner, lore with a character, a view that reveals a route). |
| Rooms holding something ≥ 70% | See row 1. | Fold into the dressing floor. |
| Enemy-free rooms 45–55%, "landmark rooms stay empty" | With every room within 1 room of a landmark, "landmark room" is most rooms, and the empty share contradicts 0.3–0.5 enemies per scr². | Define "landmark room" as set-piece class only. |
| Corners every 3–6 min, region 4 Corners | The doc's own timeline puts 4 Corners in the first 20 min and none in the next 20–35. | Either 6–7 Corners for the region or "every 3–6 min in the first 20, every 6–10 after". Pick one. |

### 1.3 The room-list problem

§4.1 is the region as an ASCII *topology*. It has no heights, no widths, no sightlines. The teardowns' strongest process fact is that Ori's designers draw the polygons for a whole area before any art, and Team Cherry drew the Crossroads map first and treated it as the bar. The doc's own process (§7.6) goes tools → 16 rooms → 28 rooms, room by room, through a brush pipeline nobody has used yet. That is how you get 28 competent boxes.

**Author the region as one section first**: a world-space sheet (or a 1-pixel-per-tile PNG that the bake reads as the `Paint` layer) with the four strata, the Cross's volume, the hatch column, the spoil slide's grade, the shaft, and the beacon positions, drawn as one picture. Cut the lot lines *last*, where the seams are least visible (at necks and turns, never mid-street). The world owner approves the drawing before any room is compiled. This is the single change most likely to prevent "hit every number, still disjointed".

---

## 2. Is the first 20 minutes compelling?

### 2.1 What lands

- **0:40 the cart, 8:00 the hatch.** Seize a thing → seize the thing you stand on. That is a real twist, and it turns the first pip loss (the plank) into the answer. Keep it exactly.
- **9:15–12:30 the Great Scale.** Compression through the spoil neck, a reveal, then a room that is a machine and your weight is the lever. This is the best room in the doc and the one that's most *Tallage*.
- **17:30 the lift.** The bolted cage seen from the Gutter at ~6:30 and opened from below at 17:30 is the Shaman pillar done right, and the Gutter visit is optional, which is a risk (§2.3).
- **The ring shoes on a pedestal in Lot 19.** The only character beat in 20 minutes, and it's good.

### 2.2 Where it's flat

1. **The arrival vista spoils the Cross.** At 0:00 the player sees "the whole Tally laid out below": the Board, the tower, the lift wheel, Pawn Row's balls. Then T03 compresses and T04 is "the second reveal" of the same square 3.5 minutes later. Ori's spawn shows the Spirit Tree as a distant promise and pays it 25 minutes later; HK shows the Temple façade and seals the interior for the whole game. Make the viaduct vista a **promise**: the skyline (tower, the Board's glow on the smoke, the headframe wheel) and the *roar*, with the Cross itself roofed by its galleries and out of sight. Save the Board's face for T04.
2. **4:30–8:00 is a tour of closed doors with no pull.** The hub circuit is "optional, typically taken". Why would a first-time player take it? The only open onward route is the hatch, humming under their feet, and there's no goal yet. Most will drop at 4:30 and the "first loop closes" beat and the bolted-lift promise never happen. Two fixes, pick one:
   - **Make it a T-junction choice, like HK's well landing.** Two open ways down from the Cross: the hatch, and the West Stair to the Gutter, where the bolted cage is 2 rooms in and visibly a dead end. Both are *down*, both are open, one pays a promise. Then the roof loop stays optional and the doc stops assuming it's taken.
   - Or put something the player *needs* on the roof loop (the Tally ledger with the clerk on the top tier, reached by Chimney Walk), so loop L1 is walked before the hatch and the Bourse Gate is seen up close.
3. **The Slip is found and then not used.** §4.3 says Slip Test = "C07 pit exit", but the walkthrough's default is "seize the lift's bolt … the cage carries you up". The pit is the *other* way out. Ori's rule (Glades §13 item 7) is the pit with the key inside, *tested on the way out within 30 s*. Fix: **the bolt is across the 10-tile static pit.** Slip to reach it; the lift is the reward for the test. Introduce, test and shortcut in 30 s, in one room.
4. **The region's first 20 minutes end at a stub.** C09 Ticker Hall is a Corner and "the way up to the Bourse Stairs (stub)". The Glades end at the Spirit Tree; the Marsh's Den ends at a keystone door you saw from the other side. End the 20 minutes by **closing the loop from below**: the ticker cable you've followed since C08 rises into the Board's chain-drive; C09 is a vertical core under the Board with the crowd's roar pouring down through the gears; you open a grate from below and climb out into the Cross beside the hatch you dropped through at 8:00. That is the third reveal (the beacon's roots), the second far-side shortcut, and the region returning to its origin. The Bourse Stairs exit can stay as a sealed door in C09 for the ledger.
5. **Twelve and a half minutes without an enemy on the critical path.** "Loud, crowded and alive" and nothing pushes back until the Kennel. The only hub threat is a chained Barker on an optional stair. The city should *notice you* early and cheaply: a Receiver's clerk who snatches a seized puck from your bag in Rag Market (a pickpocket you chase, no damage), or one Stock Gull over Pawn Row at fever 0. The combat spec's Catch also arrives at 12:30 with no earlier telegraph to read; the L3 novice needed exactly that lead-in.
6. **The Kennel is a standard enemy room** and it's the one room in the walkthrough that reads as "the Seize-on-enemies test". Rubric P3 would fail it on the doc's own page. Give it a place role: the lots are where seized *dogs* are kept for auction (tags on their collars, a lot number over each post), and the owner-chase into X4 is the room's reason.
7. **17:30–20:00 "the choice" is admin.** "Spend 2–3 min on hub pockets, or go back down" is a menu. With fix 4 above, the pull is the cable and the roar under the Board.
8. **Nobody owns anything on screen.** "You can hear who owns what" but the only owners in 20 minutes are a clerk with a desk and the Copyist. One recurring code-drawn antagonist silhouette (a Receiver's clerk) at three points, the cart at 0:00, a balcony over the Cross at 3:30, and the Store at 16:00 watching you take back your shoes, would do more for "the city is alive" than the crowd bed.

### 2.3 Does the walk create curiosity, mastery, aliveness?

- **Curiosity:** yes at 3:30 (the lock showroom) and 6:30 (the cage), provided the Gutter is actually visited (fix 2). Weak between 12:30 and 17:00, where every room has one way on.
- **Mastery:** the Seize I→T→W chain is good; Levy's twist (throw weight *elsewhere*) is good. The Slip's chain is broken by the lift (fix 3). Weigh-in gets Introduce and Twist but no Test with a cost.
- **Alive and loud:** the beds and silhouettes are audio-visual paint. Aliveness comes from *change* and *reaction*: the local silence and heads turning on a seize (§5.1, buried) is the strongest idea in the identity kit and appears nowhere in the walkthrough. Add one more: **the night gets later.** The Bell tolls at ~10 and ~20 minutes (a frame-count clock, deterministic), the ticker rate and crowd gain step up, and the Cross at 17:30 is audibly louder than the Cross at 4:30. Cheap, on-fiction ("the loudest night of its fever"), and it makes the return feel like time passed.

---

## 3. Is it *Tallage*, or HK with boomtown paint?

The graph is the Crossroads with the names changed: well → hatch, Cornifer → Copyist, benches → Corners, Shaman pillar → store lift, Black Egg → Bell tower, acid → static gutters, the lock showroom → the compass. STUDIO §1 allows proven practice for what isn't the differentiator, and I'd keep all of it. The question is whether the *differentiator* touches the spaces.

**Where sound-is-title shapes space today:** the hatch (unmake the floor), the Scale (weight as a lever), the depth-pitch rule, the loudness map, the Copyist as an audible beacon, the lot-line studs. That's a good audio layer and two good rooms.

**Where it doesn't, and should:**

1. **Seizing unmakes things, but the region's geometry is fixed.** In 20 minutes the world changes shape four times (cart, barricade, hatch, a secret wall), each a door. Concept A's promise is that *every seizure changes the level*. Put **one room whose shape is a sound** in the first region: seize the Great Scale Hall's furnace roar and the hall goes dark and silent, the pans lock, the gallery lamps die and a different route (the cold flue) opens. Same room, two states, chosen by what you took.
2. **A foreclosed lot.** Mortgaged Row's "everything already seized, ghost geometry" is the most Tallage idea in the concept and it's deferred to district 3. Put **one foreclosed vault in the Cellars** (make C10 Vault Row's barred door instead a *silent* vault): dashed outlines you walk through the walls of, no hum, no light, the ledger shows it struck through. Its silence is its identity, and it teaches "quiet means gone" before the Row makes it a whole district.
3. **The weigh-bridge corridor** (§5.2 use 8: a floor that tilts with your weight class) is the one place where the *slope tech exists because of the mechanic*. It's listed as a use and not in the walkthrough. Promote it into the 20 minutes; it is the Cellars' equivalent of the Wellspring's rotating room, and it's the doc's best argument for building slopes at all.
4. **The lot-line bag reset is a validator convenience turned into fiction, and it fights flow.** "Any sound-assisted beat sits inside one room" means no spring-into-Slip across a seam, ever, and every carried sound "ribbons home" at every exit, which is the player watching their work undo at each doorway. That is rubric F4's "rooms resetting" complaint written into the design. The doc says "review this if the playtest flags it"; it will. **Empty the bag at Corners and region exits instead**, and have the validator hold reach gates against the *region's* carry-in palette (brown, pink, violet, a handful of sounds) rather than the room's. Sealed gates (W3) hold regardless. Keep the studs; they're a good waymark.
5. **The hub is a *road* in Ori and a *showroom* in HK.** Tallage's is both, and the doc gets that. What's missing is *commerce*: Pawn Row has no pawnbroker's patter, no auction in progress, no prices on the Board that the player can read as a *map* (the Board could list lots by district with their price, i.e. the ledger's table of contents in the sky). One readable Board line ("LOT 19, RING SHOES, DISTRAINT STORE") at 3:30 is a quest marker in fiction and costs a text prop.

Verdict on identity: the mechanic layer is Tallage, the graph is HK, and the spaces are about 70% generic. Items 1–3 above are three rooms' worth of work and would move it to "its own place".

---

## 4. Camera, terrain and room-model decisions

### 4.1 Camera: right scale, wrong vista behaviour

- **1.0 default with combat ≥ 0.9** is correct for a 52 px Seize and colour-fill telegraphs.
- **`vista` as a one-shot held 60–120 f then released** will read as a camera hiccup: a 1–2 s zoom out while the player is running, then a zoom back in while they're still in the same giant space. Ori's set-piece zoom is per *space*: the Spirit Tree is pulled back every time you're under it. Make the **zoom a property of the zone** (stay at 0.75 while inside the Cross's vista bounds) and make only the *framing bias* one-shot. "Not repeated on backtrack" then applies to the look-at, not the scale.
- **Say what the shot is.** "T04 4 × 4.5, vista 0.75" shows 1.33 × 1.33 screens of an 18 scr² square: 10% of it. The reveal is the Board's face and two tiers, so frame *that* (a 2 × 1.5-screen shot at 0.8 from the Rag Market mouth) and let the height be discovered by climbing. Consider the Cross at 3.5 × 3 screens; the sky and the tower give the height for free, and a square the eye can't take in isn't a square.
- **Look-up range** in tall rooms: HK's ±6 u (35% of screen height) is measured and not in the doc. A 12-tile balcony and a 4-tier square need it.

### 4.2 Terrain: right bones, and two rules that will hurt

- **Square collision + skin + 1:4, 1:2, 1:1 floor slopes, no momentum, no ceiling slopes.** Correct, and the Glades teardown asked for the same. The 1:4 addition is right; 1:2 alone would have been steeper than Ori's biggest floor band.
- **45° on flow routes will feel like sliding down stairs.** A 10 px ground-stick per frame at run speed with no tangent speed is fine physically but reads as a staircase. Cap 45° at ≤ 5% of flow-chain length and use it for ramps between shelves; the Cellars' 10–15% share can live off the chains.
- **"No straight wall or ceiling longer than 12 tiles" applied to the hub will turn streets into caves.** A built city has straight facades. Restrict the collision-silhouette rule to the Cellars and to *walkable* hub tops; hub facades break their runs with props (signs, awnings, window grids, bunting), which is how the identity kit already describes them. Otherwise the `rough` brush will do to the Tally what it should only do to spoil.
- **The brush set will fight the Cellars' identity.** `blob` and `tunnel` make caves; the kit says "circles and heavy horizontals: round vault doors, barrel vaults, piers". State the split: **vault stamps (arch, pier, round door, barrel section) for chambers; rock and soil only for the connecting spoil tunnels.** Without that sentence, stage 1 will be cave blobs with vault doors glued on.
- **The dead band is bigger than the doc admits.** With W4 (cling only on facings) and no wall slopes, *every* wall that isn't a placed facing is a dead stop, in both regions. The level rule ("no flow route ends face-on at plain masonry at speed") is right; it needs a lint (bot flow-field: any chain that reaches a wall cell with |vx| > 6 px/f and no facing, spring or drop within 2 tiles is flagged).

### 4.3 Room model: right, with one decision to test rather than assume

- **Edge exits, peek, ≤ 8 f, camera continuity, merge deferred with a trigger.** Right, and cheap.
- **"A room is the reset unit for enemies"** is HK's pacing tool, but in a 3-room Cellars ring with ≤ 2 enemies per room, a Barker re-spawning each time you cross a stud is the old rooms again. Try *reset at Corner rest* (Ori-like, and Silksong's direction) for the blockout and let the continuous-run playtest decide. Either is defensible; the doc shouldn't decide it without playing.
- **Peek shows the neighbour's *restored* state.** With W2 as written, a wall you ghosted looks solid in the peek from the next room. That's a visible reset at every seam. Change 4 in §3 removes it.

---

## 5. Is the rubric judgeable by an AI playtester from video and state?

The rubric has no **protocol**: who plays, with what access, what they write and when. As written, the same agent reads `__game.state()` (so O1's "before opening the ledger" is meaningless: it knows the room ids), reads the rubric (so P5's "unprompted" and F1's "unprompted" are impossible), and drives with playwright-cli at coarse timing (so it physically can't produce a 15 s flow chain with a beat every 1.2 s: the L3 novice notes the CLI's timing already).

**Add §6.0, the protocol, with three roles:**
1. **The blind runner.** No docs, no state, no ledger until the doc says. Screenshots and key presses only. Writes a think-aloud line every 30 s of play ("goal: …", "see: …", "want: …") and a room-graph sketch (an adjacency list with up/down) at minute 10. This is the L3 novice protocol, and it worked.
2. **The instrumented pass.** The bot runs the designated routes; `world -- metrics` and the trace produce S1–S3, T3, F2, E3, A2 and the seam checks.
3. **The critic.** Watches the clips (the clip tool exists) at 0.25× for seams and pops, and at 1× for flow and composition, and answers the judgement questions with timestamps.

**Question by question:**

| Q | Problem | Rewrite |
|---|---|---|
| O1 | Fine, once the runner can't read state. | Compare the sketch against `world.json`; ≥ 80% joins, all verticals right. |
| O2 | "Point toward" is vague. | The runner gives an 8-way compass direction from a screenshot; pass if within 45° of the true world vector in ≥ 90% of rooms. |
| O3 | Everything is named, so everything passes. | HUD-less screenshot; the runner *names* what they see; pass if the name matches the entity (or its obvious description) at every Corner and junction. |
| O4 | Good. Needs the 30 s log to exist. | Fail on 3 consecutive log lines with no nameable goal. |
| P1 | Good. | Keep. Run it on the critic, not the runner. |
| P2, P3 | Doc checks. | Make the fiction line a required level field and lint it; P3 stays a world-owner review. |
| P4 | Lint-able. | Automate: render each exit at world position and assert non-black pixels beyond the boundary. |
| P5 | "Never says 'level'" is unobservable for an agent reading a rubric. | **Hand-off test:** the runner writes a 100-word route description *for another player*, no map. A second agent draws the graph from it. Score joins. Also count place names vs room ids in the think-aloud (ids = 0). |
| E1 | An agent told to explore always detours. | The runner has a goal ("reach the Bourse door"). A detour counts only if the log names a *seen* thing as the reason, and that thing is in the sightline data. ≥ 2 in 20 min. |
| E2 | Good. | Keep; verify pay-offs against pickup flags. |
| E3 | Goodhart-able (§1.2). | Landmarks must be distinct silhouette classes; cadence measured on those. |
| E4 | "Empty reactions" is subjective. | The runner names each dead end's payout; check against state; ≥ 90%. |
| F1 | The second clause is impossible for the runner; the first is gameable (§1.2). | Bot chain with the beat/verb/slope conditions, plus the critic's timestamped answer to "does the terrain ever make the runner stop?" on the bot clip. |
| F2 | Good. | Automate from the bot trace. |
| F3 | "High intensity" undefined. | Define: enemy room with ≥ 2 attack tokens or a locked arena or hazard density above X. Automate from the timeline. |
| F4 | Same priming problem. | Automate: input dropped at a seam (trace), camera re-snap ≤ N px at a seam (trace); the critic reviews seam clips at 0.25× for pops. |
| S1–S3 | Good. | Keep. |
| T1–T3 | Good. | Keep. T2 from the think-aloud. |
| A1 | Agents can't listen. | Render the ambience bus to a spectrogram PNG per region and per stratum; pass on measured centroid and root-pitch separation. The user judges the *feel* at the taste checkpoint. |
| A2 | Automatable. | Audible radius vs first-visibility anchor along the critical path, from world data. |
| C1–C4 | Fine. | C2: each room lists ≥ 2 props from the region's motif subset (lint), critic spot-checks. |

**Add the missing cross-seam questions** (they're the point of the exercise): **X1 seam pairs**: for every edge exit, one image of both sides side by side at world position; the critic marks any floor step, palette jump or missing beacon. **X2 strata**: hub floors on the four bands (lint). **X3 beacon bearing**: the tower and the Board in frame from ≥ N rooms (lint).

---

## 6. Scope: can an agent team block out 22–28 rooms in one or two loops?

No, and the doc's own plan says so. Toolchain T1 is ≈ 22.5 agent-days over three streams (≈ 9–10 days wall-clock with A1–A3 on the critical path), then §7.6 adds slopes, zoom, peek and beacons in parallel, then stage 1 (16 rooms, ~90 scr²), then stage 2 with audio beds. That's three or four loops at STUDIO's loop size, and the first *room* work happens with a brush pipeline nobody has used. The toolchain's risk table already rates "size without content" as **high**. Sixteen rooms at 5–6 scr² each, first time out, will be sixteen big empty rooms.

**The smallest version that proves the approach is seven rooms, ~50 scr², about 8 minutes:** *arrival to the Great Scale.*

| Room | Why it's in |
|---|---|
| T02 Evictions Yard | Seize test, Levy introduce, the first seen lock (the Row gate), a static gutter |
| T03 Rag Market | The compression, breakables, crowd silhouettes |
| T04 Tally Cross (trimmed) | The reveal shot, the beacon, ≥ 4 visible locks, the Corner, the hatch, a stratum junction |
| T05 Pawn Row + T09 Chimney Walk | One loop (roofs over street), one far-side shortcut (a latch from the roof side onto the Cross's top tier), the Board seen from three rooms |
| C01 Spoil Slide | The flow chain, all three slopes, a seam crossed at speed, compression into the neck |
| C02 Great Scale Hall (+ C05 Copyist alcove) | The set piece, the signature object, the second Corner, an audible beacon |

It exercises every T1 tool once (world coordinates, edge exits, peek, zoom, slopes, stamps, landmarks, a beacon in a neighbour's backdrop, a Corner, camera shots, the metrics), every rubric section, and both region identities. It leaves out combat, the Slip and the U-bend, which is fine: they're L3/L4 problems, and this loop is about *place*. If seven rooms don't feel like one place, twenty-eight won't.

Start `world -- metrics` with eight metrics, not forty: area, median room, fully-visible-from-entrance, loops, dead-end payout, landmark cadence (distinct classes), death run, chain length with the beat condition. Add the strata and beacon lints. The rest come when the blockout exists to run them on.

Cut from the first loop: two music loops per region (one bed each is enough), 18–24 landmarks (six distinct ones), ≥ 7 signature uses (three: landmark, lock, platform), ticker particles and crowd bobbing (one occluder layer and the babble bed).

---

## 7. Ranked changes

1. **Author and measure the region as one section, not a room list.** Draw the hub and Cellars as one world-space picture with four fixed strata, the hatch column, the slide's grade, the shaft and the beacon positions; cut lot lines last at necks and turns. Add three cross-seam checks: strata lint, beacon-in-frame lint, and seam-pair images for the critic. (§1.1, §1.3, §5.)
2. **Fix the Slip beat and end the 20 minutes by closing the loop from below.** The lift bolt sits across the static pit, so Slip is introduced, tested and rewarded in 30 s. The ticker cable leads to a vertical core under the Board, a grate opens from below, and you climb out beside the hatch. (§2.2 items 3–4.)
3. **Retire the lot-line bag reset.** Empty the bag at Corners and region exits; validate reach gates against the region's carry-in palette; keep the studs as waymarks. It's the F4 complaint pre-written into the design, and it forbids sound-assisted chains across seams. (§3 item 4, §4.3.)
4. **Put two Tallage-only spatial ideas in the first region**: a foreclosed vault with ghost walls, and the weigh-bridge corridor in the walkthrough; optionally the Scale Hall with two states. Plus the night getting later (Bell tolls, crowd gain steps) so the Cross at 17:30 is louder than at 4:30. (§2.3, §3 items 1–3.)
5. **Shrink the first blockout to the 7-room proof** with 8 metrics and the trimmed content list. Stage 1 as written (16 rooms) becomes stage 2. (§6.)
6. **Write the rubric protocol** (blind runner with no state, instrumented pass, critic on clips) and rewrite P5, E1, F1, F4, A1, O3 and E4 as trace- or critic-based. Add X1–X3. (§5.)
7. **Make the arrival vista a promise, give every set piece a declared shot, and make vista zoom a zone property, not a one-shot.** Consider the Cross at 3.5 × 3 screens with height earned by climbing. Add HK's look-up range. (§2.2 item 1, §4.1.)
8. **Terrain rules by region, and fix the self-contradictions.** The straight-run rule is a Cellars collision rule; hub facades break runs with props. Vault stamps for chambers, rock only in spoil tunnels. 45° ≤ 5% of flow chains. Add the dead-band lint. Fix Corner spacing vs 4 Corners, "landmark rooms empty" vs 18–24 landmarks, and put a non-lethal threat before 12:30. Make the hub circuit a T-junction choice rather than an assumption. (§1.2, §2.2 items 2 and 5, §4.2.)

## What this critique can't see

Whether the Great Scale reads as awe or as a puzzle box, whether a code-drawn crowd can feel like a crowd, and whether 13.5 PH per screen with silhouettes and glow can carry a 3-screen square. Those are the user's calls at the taste checkpoint, and the 7-room proof is the cheapest way to put them in front of them.
