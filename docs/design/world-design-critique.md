# Critique: world-design.md (*Tallage*, L4 draft)

Reviewer: world-design critique, 2026-09-28. Subject: `docs/design/world-design.md` (draft for L4). Read alongside PLAN §1–2, `raw-L1-p4.md` Concept A, `combat-spec.md` §0, §1.4–1.5, §3.3–3.5, §5, `L3-novice-playtest.md`, `L3-audit.md`, and `memory/signature-mechanic.md`.

## Verdict

**Revise before building rooms.** The document is thorough, well-cited and structurally competent: the U-bend, the concertina, the Corner and Copyist rules, boss-as-machinery and the sanctioned Short Sale are all sound. But the slice as drawn is a 35–40-minute corridor with four doors you can't open for 90 minutes or more, and its gate rules (G3, G4, G6) push every reach gate into a sterile room: no pink, no enemies, white walls. That is the doc's own reaction to one decision, W1 ("one pink source gives an expert unlimited height"), and it quarantines the game's most delightful verb (the novice's "best moment of the session" was the pink spring) out of progression entirely (§3.3: a spring climb "is only legal as a teaching gate"). Bound the pink ladder and half the rules disappear.

The doc also contradicts itself in three places that matter for the slice (Corner spacing around the Grindstone, B8's reach margin, and the Static Flats' "bring your own" against W2), and three of the seven abilities are thin or dead weight on the doc's own lock counts.

Fresh and worth protecting: shed-weight-to-ride (B8), Mortgaged Row's build-with-a-budget, bosses becoming machinery, secrets that hum, the owner-chase lure, the Short Sale, and one idea the doc almost has but doesn't use: fever as a palette key.

---

## 1. Would the vertical slice make a player want to keep exploring?

### 1.1 The U-bend works as a shape; it fails as a metroidvania promise

Down through the Cellars, Slip at the bottom, up the Stairs, lift home: the loop closes and the shortcut is the reward. Good. But look at what the player can *choose* in 20 rooms:

- Rooms T1 → B6 (15 minutes): one path. The only branches are X1 (a quiet-hum closet), X4 (a soft cache) and two dead-end signposts (T3, T4).
- Rooms B7 → B14 (21 minutes): one path plus B8a, which a novice can enter but not climb.
- The hub's four other exits need: Off the Ropes (1:30), Writ (2:30), fever 3 (3:15), and the boss flag. A player stuck on the Grinder in B6 has nowhere to "go somewhere else" (§1.1's own Silksong rule).

Silksong's U-bend has Moss Grotto's side pockets and Bone Bottom's two exits inside the first fifteen minutes. This slice has none that pay off with the base kit. A vertical slice should demonstrate the loop the genre is named for at least once: see a branch, take it, get something. Recommendation 10 below gives the Cellars one real fork.

### 1.2 The first two minutes have no sounds in them

T1, T2, T3 and T4 all list `palette: none, enemies: none` at fever 0. The first Seize is in B1 at minute 3. The novice playtest is explicit: the first seize at 45 s "was the moment", and by 90 s the player was pressing V on everything. The world doc opens a game about seizing sounds with 60×17 tiles of "jumps ≤ 3 tiles and a jab crate". Put a seizable hum in T1 (the Receiver's cart she's thrown off is the obvious one: seize its rattle, and the cart is your first ghost) and give every hub room at least one sound.

### 1.3 The tedium hotspot: the Grindstone death run

§4.3 and §6.1 both say a Corner is "at most 3 rooms from the next one on the critical path" and "1 room from every boss door". The slice violates both:

- B5 Cellar Corner (minute 12) → B11 Mezzanine Corner (minute 27): five rooms and fifteen minutes between Corners, containing two "high" rooms, a med, a med and the mini-boss.
- The Grindstone's door is B9, which is not a Corner. A death at the Grindstone respawns at B5 and re-runs B6 (Grinder), B7 (Gulls, gap, curtain), B8 (plate and updraft) and B9 (three enemies) before the retry. That is a ten-minute death run to retry a mini-boss at minute 26. It is the single most likely place a first-time player quits the slice.

The "concertina" claim ("a rest before each peak") is also false for the B10 peak: the last rest is at minute 12. Fix: a Corner at B8's foot (the Shout Shaft floor is a natural "under the stairs" nook) or a B9 anteroom. That also makes B8→B9→B10 a 2-room approach.

### 1.4 The dumbwaiter's stated reason is wrong

§4.1: "a death on the Stairs doesn't mean re-walking the Cellars." Deaths respawn at the last Corner, so the dumbwaiter never saves a death run. Its real job is to let a Short Sale player come back down for Rope Skip, and to tie a shortcut to the Grindstone kill (good, keep it), but the doc should say so, and the Corner fix above is what actually solves the death run.

### 1.5 B12, the put-back room, is the PLAN's stated main risk made mandatory

PLAN §2's main risk is that the concept "could slow into pick-up-and-place puzzling." The L3 audit said the Lot 7 flow check "can't show pick-up-and-place friction" because nothing is carried back. B12 answers that honestly: 75 tiles wide, carry a brown from the far end back over two Skip ledges and a Slip gap with two Gulls on you, and levy it onto the plate. Fine as a test, but it sits directly before the district boss, and it is the only room of its kind, so its verdict decides the concept with one sample. Two notes:

- Make the ferry the intended play (levy forward, it lands as a slab, re-seize, repeat) and make sure the Gulls can't Snatch the brown out of the bag mid-carry in a way that sends the player back to the far end (combat spec §4.3 Snatch removes the sound; if the brown revoices home after 480 f you've walked 75 tiles for nothing). Deeds don't revoice while in the room (§3.3), so a snatched deed should land near you, not teleport home. Confirm.
- Build B12 first and measure it with the L3 flow ratio against a jumps-only control. If it fails, the whole "levy as key" progression class is in doubt, so find out early.

### 1.6 Fever 1's revaluation of the slice is decoration

§4.7's five changes: pink crowds in T2 (a room with no reach exits, so it changes nothing you can do), a longer shout opening X2 (Poundage and a lore page), hot Barkers, a third Gull, the Rostrum reopening. Only X2 gives a reason to go back, and it's a cache. Hollow Knight's Infected Crossroads changes routes and adds a boss. See recommendation 4: make the arriving crowd *the key* to a new hub exit.

### 1.7 Smaller points

- The Bourse is listed as "high, violet/pink", but you enter it by a hatch *down* from street level and spend fifteen minutes in Cellars full of brown. The "read altitude from colour" promise (W5) is broken by the first district. Either the Cellars are a brown Foundry annexe under the Bourse (say so, and put the Copyist's line about it in B5) or the slice starts by going up.
- §2's Off the Ropes row cites "Bourse: X5 above B2". There is no X5. Either add it (a Ropes-gated closet above the Strongroom Walk would be a good third come-back signpost) or delete the reference.
- The Floor Sells escape is a highlight on paper. Check that a player at 1 Chin after the boss can survive it; the 15-second checkpoints make it fine, but the "SOLD" wave at 0.85× minimum speed leaves no room for a missed spring. Consider 0.75× for the first checkpoint segment.
- The Runner (combat spec C8) is nowhere in the world doc. Where does it flee to in a 20-room slice? If it can leave the room, the ledger and the Corner rules need to know.

---

## 2. Ability order and power curve

| Ability | Time | Locks the doc actually names | Verdict |
|---|---|---|---|
| Slip | 0:12 | 4 | Good. Early, opens gaps everywhere, and the Counter. |
| Rope Skip | 0:25 | 3 | Good, but see W10. |
| Off the Ropes | 1:30 | 2 (one is X5, which doesn't exist) | The problem child: it forces G6 (see §3). |
| Writ | 2:30 | 3 | Good. The grapple-that-drops twist is the best late idea. |
| Hue and Cry | 3:15 | 2 | The trailer ability, but it arrives at the 60% mark and overlaps the feather updraft. |
| Standing Count | 4:15 | 0 designed ("timed machinery in every district", none exists yet) | Dead weight as written. |
| Corner Satchel | 5:00 | 2, both in the final district | Too late to be enjoyed. |

**Front-loaded movement, back-loaded keys.** By 1:30 the player has dash, double jump and wall jump: the whole stock kit. The remaining 3.5 hours add puzzle keys. That is the Metroid Dread shape, not Hollow Knight's, and it means the mid-game (District 2 and 3, 1:30–3:15) has no movement change beyond the wall jump. Hue and Cry at the District 2 boss instead of District 3 would fix the curve: Big Bellows' blasts are the obvious first stream to ride, and the Foundry's "get blown off ledges" twist becomes "or ride the blast" once you have it.

**Standing Count is redundant with Seize.** Concept A says a seized rattling lift "freezes in place". If Seize already freezes machinery (and it must, for un-making to read), what does a ten-beat freeze add? Only the difference "frozen solid" vs "ghosted passable", and that has to be made load-bearing or the ability is a second button for the same idea. It also makes three "Counts" (the knockdown Count, Beat the Count, Standing Count), which is a naming problem the novice will hit. Fold it into Writ (a writ-pinned object hangs in place while the string holds; seize the anchor and it falls), which gives Writ a second lock class and cuts one ability.

**Corner Satchel at 5:00 in a 5–8-hour game** is a combo system with 20% of the game left. Either move it to District 3 (Mortgaged Row is the build-with-a-budget district; two-colour builds belong there) or cut it and give the Row's boss Hue and Cry as planned.

**Violet is a colour with no traversal job for four hours.** It exists from the start as Gull and Auctioneer voices, its levy is a dart (combat) and a +1.5-tile hop, and its first traversal use is the Satchel's violet+pink platform at 5:00. Concept A gave violet a job the doc dropped: it "cuts ropes". A levied violet dart that severs a humming rope or latch at range is a gate type keyed by an *enemy voice* (seize the Gull's Screech, throw it at the rope holding a drawbridge). That is the signature loop (take it, throw it back) as traversal, it puts enemies *inside* gate rooms instead of banishing them (G4), and it costs one new object. See recommendation 6.

**W10 (Skip works at middle)** is the right call. But the doc never gives middle+Skip or middle+Slip numbers, and B12 depends on them (carrying one brown at middle over two Skip ledges and a 10-tile Slip gap). Add the rows to §3.1 before B12 is built.

---

## 3. Gate rules: sound, but they sterilise rooms

### 3.1 The root cause is W1, and the rules are symptoms

W1 makes pink unbounded (down-levy, bounce, down-seize, repeat). The doc then needs G3 (no reach gate shares a room with pink, including a Barker that might wander in), §3.3's rule that a spring climb can only ever be a teaching gate, W2's local bag to keep pink from leaking between rooms, and B8a as a separate room purely so its railing can't reach B8. Count the reach-gate rooms in the slice and check their palettes: B7's west segment ("sound-free and enemy-free"), B8 ("No pink"), B11 (`palette: []`), T1 (`roomPalette: []`). Every reach gate is in a room with nothing in it, and every room with things in it (B4, B9, B12, B14) has no reach exits. That is the samey-room problem in the first district, before any room is built.

**Bound the ladder instead.** Options, best first:

1. **Spring decay (flipping).** Each mid-air re-levy of the *same* pink within one airtime halves its bounce: 240 px → 120 → 60. The chain converges to about two bounces' worth (≈ 7.5 tiles above the first spring). It's still expert tech, the Stairwell still works (with re-tuned bar spacing), and the fiction is exact: a deed flipped too often loses value. G3 becomes "pink adds +7.5 tiles", the same shape as brown's +2.75, and reach gates can live in pink rooms if they're tall enough. Spring climbs become legal progression gates again.
2. **One aerial re-seize per airtime**, refilled on landing (the double-jump shape). Simpler to validate, less elegant in fiction.
3. Leave W1 and accept sterile gate rooms. Not recommended.

With 1 or 2, W2's local bag is still worth keeping (it protects the solver), but B8a no longer needs to be a separate room, G3 collapses into the reach table, and the "Barker wanders in" clause vanishes.

### 3.2 G6 (white walls in every height gate after 1:30) will define the look of the game, badly

Three-quarters of the game's height gates would be white-speckle shafts. Two costs:

- **It spoils District 5.** The Static Flats' whole identity is "nothing here can be seized or clung to." If static render is the default wall of every gate shaft from District 2 onward, the Flats are a bigger version of every corridor.
- **It's a negative tool.** You paint white to *forbid* climbing. Level designers get one move: box the shaft in static.

Concept A already has the alternative: featherweight gets "wall cling on humming surfaces". Make **clingable a property of humming walls only.** Plain masonry can't be clung to; a humming wall can, and seizing it removes the grip (it goes ghost). This inverts G6: the designer *places* ladders as seizable material (chalk marks say "climb here"), Off the Ropes interacts with the signature verb (seize the wall you were climbing to lose the ladder and gain a deed; a puzzle in one object), and white static stays rare and meaningful for the Flats. It also means a Ropes shaft *can* contain pink, brown and enemies, because the constraint is "how much humming wall is there", not "what else is in the room". §6.5's material rule shrinks by one entry (plain masonry loses its "can be clung to" line; humming gains it).

### 3.3 G4 and the Gull leash: don't make gate integrity depend on AI tuning

B7's gap holds only if the Gulls' leash keeps them east of the pit; a Gull over the pit is a pogo target that refills Slip. `memory/signature-mechanic.md` says enemy behaviour is chaotic enough that "small behaviour changes swing clear times 2x". The validator can't prove an enemy will never be somewhere. Make gated spans **sim-level exclusion volumes** (enemies can't enter, projectiles despawn) rather than leash tuning. One rectangle in the room data, enforced in `updateEnemies`, and G4 becomes checkable.

### 3.4 B8's own numbers fail G2

§4.2 B8: "the best kit here is about 10 tiles, using 2 brown recoils." The updraft is 10 tiles. G2 requires the requirement to exceed kit-without-key by at least 1 tile. Either the column is 12 tiles or the room has one brown (and the plate needs a slab, not heavy, which also removes the "get heavy, then shed" combine, so make it 12). X2 at 15 vs 10.5 is fine.

### 3.5 G7 asks a search bot to prove a negative

The L3 audit already caught the bot returning "not found in 1M nodes" for a gate that wall-jump-only cleared in 13k expansions once told about the ability. G7 runs that search for every reach edge × every kit-without-key × every fever level. Two consequences: CI gets slow, and "not found" is not "impossible". Keep reach gates rare (the doc already prefers sealed; go further and make every *progression* gate sealed or a geometric proof like the seize-wall height rule) and reserve the bot for teaching gates and secrets. The slice has 6 reach edges; that's manageable. The full game shouldn't have 60.

### 3.6 Static pits everywhere

G4 and G5 replace spike floors with static pits in every chasm. In a code-drawn game with five materials, every gap in the game being the same white speckle is a readability win and a monotony loss. Let brown-noise pits (a drop into a furnace glow) and ghosted-floor pits (a re-mortgaged street) be hazard-class too; the rule is "1 pip and respawn", not "white".

---

## 4. Is the Tallage logic doing work, or is it decoration?

| Element | Working? | Notes |
|---|---|---|
| Sound as title deed (Seize un-makes, Levy builds) | **Yes** | The whole gate taxonomy is built on it. The strongest part of the design. |
| Weigh-in as movement (W5, B8, gust corridors, feather boards) | **Yes** | Shed-to-ride in B8 is the slice's best beat and the trailer shot. |
| Colour by altitude (W5) | **Not yet** | The first district contradicts it (§1.7). Either apply it to the Cellars or drop the claim from §1.1. |
| Bag empties on exit (W2) | Yes for the solver, **but it contradicts District 5's "bring your own"** | A white-static gate is at most 27 tiles past a source *in the same room*. So the Flats are single-room puzzles with a source at the edge, not a district you cross on what you carried. Either make Flats rooms very large, or give the Flats an explicit W2 exception (the bag persists across Flats doors) and accept inventory state in the validator for one district. Say which. |
| Fever ticker (W6) | **Decoration in the slice, expensive in the full game** | "At least 3 rooms change in every visited district" × 4 steps is 40–60 room variants, each re-validated. And the slice's fever-1 changes open one cache. See recommendation 4. |
| Ledger map (W7) | Stock | Cornifer, Quill, Wayward Compass, Dread door glyphs, with a red-ink bestiary on top. The bestiary-in-the-ledger and the register reward are the two additions that earn their keep. Fine, cheap, keep. |
| Bosses become machinery (W8) | **Yes** | Concrete, both instances in the slice are wired to shortcuts. Keep. |
| Abilities as distrained belongings (W9) | Fiction only | Costs nothing. Keep. |
| Assessor zones | Stock | EMMI with a sound-detection rule. Genuine work only if the "seizes draw it" rule creates the stealth choice "do I take this sound and wake it". Design one zone before promising two districts of them. |

---

## 5. Originality

**Fresh:** shed-weight-to-ride; a mini-boss whose wheel powers your shortcut; a sanctioned sequence break that is the *mechanic's* expert form rather than a glitch; the owner-chase lure gate; the grapple whose anchor drops you when seized; the Floor Sells escape where the floor is literally being sold; secrets that hum; Mortgaged Row (build with a budget) and Old Static (a boss you feed, not hit).

**Stock:** the hub, benches, map vendor, position charm, a mini-boss that gives the double jump, the wall jump, an Ori escape after the boss, a lift home, the Infected Crossroads, EMMI zones, secret walls, "the second of two districts" open-middle. The doc knows this and cites each source; the risk isn't plagiarism, it's that the slice's *structure* is 90% Silksong Act 1 with a coat of paint and the fresh ideas are in single rooms. 

**The one trailer shot from this slice:** B8 Shout Shaft. Kid heavy with two brown deeds, stomping the plate; the shaft foot opens; she jumps and down-levies both browns, two recoil hops, slabs crashing into the plate below; the weigh-in needle swings to FEATHER; the broker's shout catches her and she rides the column up past the ticker board into the Trading Pit. Every system in one shot: seize, levy, weight, the world made of sound. Design the room for the camera.

**The thing a trailer should not show:** white speckle shafts. See §3.2.

---

## 6. Scope realism

The project is one day old (every commit is dated 2026-09-28) with 19 ASCII gym rooms and no LDtk pipeline. The slice needs:

- 24 rooms (two of them 30×51, one 75×23) plus 5 fever variants.
- 2 bosses (one with a white third voice) plus Gull and Clerk in the world.
- 7 new terrain systems: static render, static grille, feather updraft, gust volume, static pit, slip curtain, plate doors (exists), latch shortcuts, lift machinery.
- Corner/save, ledger map UI, Copyist, Pawnbroker shop, Poundage, the Runner's placement, the escape script, the boss-shutter and machinery flags, and the progression validator with per-room palette solving.

Room count is fine for agents. **Systems surface is the risk**, because each one is a UI or a save-state feature that the L3 novice will see raw. The doc already exceeds PLAN Phase 5's 20–30 minutes. Cut for the slice: the Pawnbroker shop (free ledger from the T2 board), the paid map (the Copyist gives it), the Runner (use `death.mode = 'garnish'` until the Runner is a room-local chase), and the Rostrum's fever-1 reopen. Merge B1 into T2's hatch, B13 into B12's end (a Corner alcove), and B15 into B14's back. That is 16 rooms, one fewer Corner problem, and inside PLAN's window.

The full-game plan (130–150 rooms, 6 districts, 9–11 bosses, Assessor zones, 40–60 fever variants) is not "a small game made to Hollow Knight's quality bar" (PLAN §3.5); it is Ori's size with a second content layer on top. Plan 4 districts and fever 0–3 and let the slice earn the rest.

---

## 7. Top 10 changes, ranked by impact

1. **Bound the pink ladder** (spring decay: each mid-air re-levy of the same pink halves its bounce). Then pink is "+~7.5 tiles", reach gates may share a room with pink, spring climbs are legal progression gates, and G3's "a Barker might wander in" clause, the B8a-as-separate-room hack and most of §3.3's exemptions go away. This is the change that un-sterilises the rooms.
2. **Replace G6 with "cling only on humming walls"** (Concept A's own rule). Ladders become placed, seizable material; Off the Ropes interacts with Seize; white static stays rare and District 5 keeps its identity.
3. **Put a Corner within one room of the Grindstone** (B8's foot or a B9 anteroom) and enforce the doc's own 3-room rule. The B5→B10 death run is the slice's most likely quit point.
4. **Make fever a palette key.** Each fever step must open one *route* per visited district, and the arriving sound is the key: T2's fever-1 crowd is the ladder to a hub balcony that was visibly unreachable at fever 0. Drop "≥ 3 rooms change" to "1 route + 1 danger" and the variant count halves.
5. **First seize inside 60 seconds.** A seizable hum in T1 (the cart) and at least one sound in every hub room at fever 0.
6. **Give violet a traversal job now:** a levied dart severs a humming rope or latch at range (Concept A: violet "cuts ropes"). A rope-cut gate keyed by a Gull's Screech makes seizing an enemy a traversal key and puts enemies inside gate rooms.
7. **Move Hue and Cry to the District 2 boss** (ride Big Bellows' blast), fold Standing Count into Writ (a writ-pinned object hangs), and move the Corner Satchel to District 3 or cut it. Three abilities with 0–2 locks each is too many.
8. **Fix B8's margin** (12-tile column) and make gated spans sim-enforced enemy-exclusion volumes, not leash tuning.
9. **Trim the slice to 16 rooms and 20–30 minutes** (merge B1/T2, B12/B13, B14/B15; drop shop, paid map and Runner for the slice). Build B12 first and run the flow ratio on it.
10. **Give the Cellars one real fork:** a heavy-only gust corridor off B3 to a Chin piece, so the two weigh-in routes lead to different places, and make B8a's Poundage pocket reachable by a novice with the vent reserved for experts.

Also fix: the X5 dangling reference; the dumbwaiter's rationale; middle+Skip and middle+Slip rows in §3.1; the W2/Static Flats contradiction; the Bourse's altitude claim; where the Runner flees.
