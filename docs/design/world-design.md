# World design: *Tallage*

Status: **revision 2, for L4.** This revision answers `docs/design/world-design-critique.md`; see the Revision log at the end. Owner: world and level design. Date: 2026-09-28.
Scope: PLAN §1 (the world-design pillar), §3.4, and §7 Phases 3, 5 and 6. Built on:
- `docs/concepts/raw-L1-p4.md` Concept A, with the grafts in `critique-L1-A.md` and `critique-L1-B.md`
- `combat-spec.md`, `movement-spec.md` and `seize-levy-experiment.md`
- the L3 audit and the L3 novice playtest

Units follow the movement spec: 64 px tiles, a 40×80 body, 60 Hz, and a 30×16.9-tile view. Every number here is a starting value that belongs in `tuning.ts` or content data.

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| W1 | **Sounds are movement, and every sound's reach is finite.** A room's *palette* (the colour of every seizable sound in it, enemy voices included) is part of the kit. **Spring decay** bounds pink: within one airtime, each pink bounce is half the last (7 → 3.5 → 1.75 tiles), and a fourth pink levy in the same airtime is dry. Pink adds at most about 12.25 tiles above the takeoff apex. Brown adds 2.75 and violet 1.5 per hop. | L3's mid-air spring plus re-seize made pink an unlimited ladder. That forced every reach gate into an empty room. With a bound, the validator can reason about pink geometrically, and a spring climb can be a real progression gate. **This is a mechanic change and must be greybox-tested (§7).** |
| W2 | **The bag empties when you leave a room, so gates are local.** A reach gate only has to hold against *abilities + fever + its own room's palette*. The Static Flats get no exception to this: their rooms are long, and you carry sounds in from sources at the room's edge. | Combat spec C6 already requires this. It keeps the validator free of inventory state. |
| W3 | **Two gate classes.** *Sealed* gates are barriers that run wall to wall or floor to ceiling, and they hold whatever movement you have. Every progression lock should be sealed wherever possible. *Reach* gates (height, gap, time) need a margin of 1 tile, plus a geometric proof from the reach table (§3.1), with the bot as a second opinion. | The L3 audit found Lot 7's gate could be passed with only the wall jump or only the double jump. A bot's "not found" is not proof that something is impossible. |
| W4 | **Cling only on humming surfaces.** Wall slide and wall jump (Off the Ropes) grip only armed humming tiles ("facings"). Plain masonry can't be clung to. Seizing a facing ghosts it, so you lose the ladder and gain its sound. **Static render** (no cling, no pogo, no seize) survives only as the Static Flats' material. | This is Concept A's own rule. Designers *place* ladders instead of painting walls white to forbid climbing, the wall jump now plays against Seize, and the Flats stay distinctive. **This is a mechanic change (§7).** |
| W5 | **The city is layered by noise colour.** Brown sinks (the Foundry, the Bourse's strongroom cellars), violet rises (the Exchange), pink sits at street level, and white static lies outside the walls. | World structure follows the same physics as Levy. The slice teaches it: you go *down* into brown cellars and then *up* the pink and violet Stairs. |
| W6 | **The fever is a one-way world clock, and each step is a palette key.** Fever (0–4) counts the district bosses you've repossessed. Each step gives every visited district **one new route, keyed by the sound that arrives**, and **one new danger**. | This combines critique B's graft 4 with the critique's recommendation 4. Revisits become new routes rather than decoration, and the number of room variants stays small. |
| W7 | **The map is the Ledger.** The Copyist hands over the lot outlines. Rooms you've walked are inked by your footsteps. The ledger updates only at a Corner. | Hollow Knight's Cornifer plus the Quill, and critique B's trail-as-map graft. |
| W8 | **Beaten bosses become machinery.** A lift, an updraft or a bridge, which closes the loop back to the hub. | The Galloway principle from the L1 critiques. |
| W9 | **Every ability is one of Kid's own belongings that was distrained**, so she recovers it by redistraining it. | It's diegetic and costs nothing. |
| W10 | **Rope Skip (the double jump) is off at heavy** and works at feather and middle. | The concept said feather only. But a single brown sound makes you middle, which would switch the skip off far too often. |

---

## 1. World premise as structure

### 1.1 The city of Tallage, laid out

A sound is a title deed. The city settles by weight, the way noise settles in a spectrum. The poor live low among the engines, and the creditors live high among the whistles. Kid works her way up the chain of creditors, so her route is **a climb**. Silksong puts its whole story on the world map in the same way, as a pilgrimage from the depths to the Citadel ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)).

```
 altitude   colour         district                          twist
 ─────────  ─────────────  ────────────────────────────────  ───────────────────────────────
  top       violet         5 The Receivership                every tool stacked; fever 4
  high      pink/violet    1 The Bourse Stairs (slice)       shout updrafts, auctions
  street    pink           HUB The Tally                     crossroads; a new route each fever step
  below     brown          1 The Bourse Cellars (slice)      strongrooms: weigh-in teaching
  low west  ghost/pink     3 Mortgaged Row                   everything already seized: build on a budget
  bottom    brown          2 The Foundry Gyms                humming ring-ropes, bellows gusts
  outside   white          4 The Static Flats (east wall)    nothing seizable; carry sounds in from the edge
```

- **The Tally is the hub.** It plays the part of Hollow Knight's Forgotten Crossroads, a central junction connected to many areas ([Fextralife](https://hollowknight.wiki.fextralife.com/Forgotten+Crossroads)). **Every hub room has a sound at fever 0** (critique recommendation 5).
- **Why the city interconnects.** Debts chain the districts together. Each district's machinery runs on sounds pawned from another, so the cross-district lifts and updrafts are *debt lines*, and a boss's repossessed sound becomes the machine that drives one (W8).
- **What the player can always see.** Unexplored exits are always visible, and every lock you've seen is drawn with its key's glyph. Silksong's principle is to "go somewhere else" rather than be stonewalled ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)). The slice now always offers somewhere else to go: the Cellars fork, and the Row entrance once you have Rope Skip.

### 1.2 The fever ticker

`world.fever` is an integer from 0 to 4, kept in the save and **equal to the number of district bosses repossessed** (Auctioneer, Big Bellows, the Absentee Landlord, Old Static). It never goes down until the ending. Combat spec C9 reads it: the Count's beat runs 12 → 8 f, and hot enemy variants appear.

**Each step does exactly this, in every district you've visited:**
- **One route.** A sound arrives, and that sound is the key. For example, the fever-1 crowd in Tally Cross brings pink chatter, and pink springs reach a balcony that was visibly out of reach at fever 0.
- **One danger.** Hot variants, an extra flock, or a static creep.
- At most 5 steps × 5 districts, so there are **≤ 20 route/danger pairs** for the whole game.

**What the validator enforces:**
- A step may never remove the last route to a Corner or to any required key.
- Every room must be escapable at every fever level.
- A room whose palette changes has all of its reach gates re-checked.

**How the player learns about it.** The Tally's ticker board jumps. Music BPM goes up one step. Changed rooms get a red **REVALUED** stamp on the ledger the next time you rest.

**The arc:**
- **0**, the Opening Bell.
- **1** after the Auctioneer.
- **2** and **3** after Districts 2 and 3, in either order. Fever 3 is the Margin Call, and the east city gate opens.
- **4** after Old Static, the Blow-off Top. The Receivership opens.
- **The Crash** at the ending: the fever breaks, and the epilogue is a quiet city.

### 1.3 The Ledger and Corners

| Element | Rule | Precedent |
|---|---|---|
| **Corner** (Rest) | The stool and bucket. It saves, refills Chin, resets Beat-the-Count, and **inks the ledger**. | Hollow Knight's bench plus the Quill ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)) |
| **Copyist** | One per district. You find him **by sound**: his quill scratches audibly two rooms away, and blotted papers lead to him. He gives you the district's lot outlines. In the slice they're free; later districts charge Poundage. | Cornifer, found by his humming and his papers ([Fandom](https://hollowknight.fandom.com/wiki/Cornifer)) |
| **Trail ink** | Rooms you've walked are drawn in footstep ink. Rooms you've only seen or been given are drawn as outlines. | Critique B graft 5 |
| **Red ink** | Each room lists its sounds as colour glyphs, and a glyph turns red once you've seized it. An enemy whose sounds are all red is **fully on record**, which makes the ledger a bestiary too. | Critique B graft 2 |
| **Lock glyphs** | A lock you've seen is drawn with its key's glyph. | Dread's colour-coded doors ([Mark Brown, via Famiboards](https://famiboards.com/threads/mark-brown-presents-metroid-dread-boss-keys-or-why-you-didnt-get-lost-in-metroid-dread.730/)) |
| **Deed register** | Your reward for repossessing a district's boss. It marks every *source* in that district. | Makes completion easier |
| **Position** | Hidden by default. The "Tally Stamp" sponsorship (a charm) shows it. It's outside the slice. | The Wayward Compass |

---

## 2. Ability progression

| # | Ability (the belonging you redistrain) | What it does | Where | ~Time | Locks it opens across the map |
|---|---|---|---|---|---|
| 0 | **Jab kit, Seize, Levy** (brown, pink, violet), **Weigh-in** (derived) | Combat spec §1. Violet's traversal job starts at once: **a violet dart cuts a plain rope at range.** | Start | 0:00 | Seize walls, spring climbs, plates, cracked floors, updrafts (feather), gusts (heavy), rope-cuts |
| 1 | **Slip**, from her *ring shoes* | A 4.5-tile dash with i-frames, plus the Counter | B5 Distraint Store, at the bottom of the U | 0:11 | Gaps of 8.6–12 tiles. In the slice (B6), the Foundry and the Row; later, the curtains in the Flats. |
| 2 | **Rope Skip**, from her *skipping rope* | Double jump, +3 tiles. Not at heavy (W10). | B10 Grindstone Ring (mini-boss) | 0:20 | Ledges of 5.5–7 tiles (B11); the Row's entry wall (T1, combined with a brown recoil); the Foundry entry |
| 3 | **Off the Ropes**, from her *ring ropes* | Wall slide and wall jump **on humming facings only** (W4) | District 2, early (the gym's ring-ropes are the first facings) | 0:45–1:30 | Facing chimneys everywhere: the Foundry, the Row, and X5 in the Cellars. Seizing a facing is a puzzle in its own right. |
| 4 | **Hue and Cry**, the crowd's roar | Ride any sound stream as a current. You can cancel out of it into a jump or a Slip (after Ori's Bash). | **Beating District 2's boss (Big Bellows)**: you ride its blast | 1:30–2:30 | The Foundry's gust shafts; the Bourse shouts past the Rostrum roof; the Flats' Hue and Cry highway; the Receivership sky bridge |
| 5 | **Writ**, from her *bailiff's writ book*, which now includes the **pin** | A ranged seize of a humming object in line of sight (about 8 tiles). The string works as a grapple while the object hums. **Pin:** a writ-tethered object hangs where it is while the string holds, and seizing the anchor drops it. This folds in the old Standing Count. | District 3, Mortgaged Row | 0:45–2:30 | Grille locks (X3, and hub pockets), grapple chasms, pinned lifts and shutters (timed machinery) in every district |
| 6 | **Corner Satchel**, from the *cutman's satchel* | A second compartment. Levy two colours as a combo: violet + pink makes a rising platform, and pink + brown makes a floor-breaking bouncer. | **Beating District 3's boss (the Absentee Landlord)** | 1:30–2:30 | Reinforced floors, tall no-facing shafts, the Row's budget builds, the Receivership vaults |

**The open middle.** After the slice, Districts 2 and 3 can be played in either order. Neither district's critical path needs the other district's abilities; only optional pockets do. **All the movement is in hand by about 2:30** (Hollow Knight's shape), and the second half is about combining it.

---

## 3. Gate taxonomy

### 3.1 The kit reach table

The planning numbers come from the movement-spec integrator: flat ground, a full-speed run-up, and +0.25 tiles of ledge pop on heights. **The bot confirms them.**

| Kit | Feather height / gap (tiles) | Middle height / gap | Heavy height / gap |
|---|---|---|---|
| Base | 4.5 / 7.6 | 3.8 / 6.6 | 2.8 / 5.1 |
| + Slip | 4.5 / 15.2 | 3.8 / 14.2 | 2.8 / ~12 |
| + Rope Skip | 7.6 / 14.0 | 6.9 / 12.5 | no skip (W10) |
| + Slip + Rope Skip | 7.6 / 23.2 | 6.9 / 22.1 | 2.8 / ~12 |
| + Off the Ropes | unlimited along humming facings (about 4 tiles per cycle) | same | same |
| **Pink in room** (bounded, W1) | floor spring 7. Chain: +7, +3.5, +1.75 above the takeoff apex (≤ 16.5 from the floor at feather). Gap: about +21 tiles of drift. | same bounces | same bounces |
| Brown / violet in room | +2.75 / +1.5 per hop, and +~3 / +~1.5 of gap | | |
| Pogo target (spikes, orb, enemy; levied objects too until combat decides) | +2.75 per target, **and it refills the Skip and the air Slip** | | |
| Updraft / Hue and Cry stream | the length of the stream | | |

### 3.2 Universal gate rules

- **G1. Sealed means sealed.** The barrier spans wall to wall, or floor to ceiling, with no gap, and is at least 1 tile thick with solid boundaries. There's no second route at any kit you can get before its key.
- **G2. Margins.** A reach requirement must be at least the best kit-without-key + 1 tile. With the key, it must be at most 80% of the key kit's maximum for teaching gates, and at most 90% for tests.
- **G3. Palette arithmetic.** Add the room's palette to the kit (§3.1). A single floor spring reaches 7 tiles, so **a reach gate under about 8 tiles still can't share a room with pink**. Taller gates can, and so can every sealed gate. Sounds past a gate's span that can't be reached before crossing it don't count.
- **G4. No refuelling in a gated span. Enforce it in the sim, not the AI.** Every gated gap or shaft is a **gate-span volume** in the room data. Enemies can't enter it, and enemy projectiles despawn at its edge. Spikes and orbs are never placed inside it.
- **G5. Hazards can't be tanked.** Anything used as a gate is hazard-class: it costs 1 pip and respawns you at safe ground. The pit material can be anything: static, furnace glow, or re-mortgaged ghost floor.
- **G6. Cling comes only from facings (W4).** A reach gate's span contains no humming facing unless Off the Ropes *is* its key.
- **G7. Proof.** Each reach gate carries a geometric proof: the requirement is greater than the §3.1 value for kit-without-key plus palette, and the side surfaces don't cling. The bot is the second check, and it must report "exhausted" within a bounded region of the room, not merely "not found". CI re-runs the bot only for rooms that changed. **Progression locks should be sealed wherever possible, and reach gates kept rare.**
- **G8. Teaching gates may go obsolete.** A gate keyed by a starting verb, or by the room's own palette, only has to hold against the kit at its earliest visit. It's marked `teachGate` / `obsoleteAfter`, and it never guards a grant.

### 3.3 Gate types and their hold rules

| Gate | Key | Class | Geometric rule |
|---|---|---|---|
| **Seize wall** (humming partition, cart or hatch) | Seize | Sealed | Fills the corridor floor to ceiling, or fills the hatch wall to wall, and is at least 1 tile thick. **Height variant:** the source sits more than *kit height + 2* tiles up (an up-seize reaches 2 tiles above the jump apex). |
| **Spring climb** | Levy + pink in room | Reach | As a teaching gate, 5.5–7 tiles. **As a progression gate**, with an ability plus pink as the key, it must be greater than kit-without-ability plus the pink bound. For example, "pink + Rope Skip" at feather needs more than 16.5 + 1, so it's only practical as a **pink + Writ grapple** or **pink + Hue and Cry** combination. |
| **Rope-cut** (new) | Violet in room | Sealed, or reach for a cage | A **plain** rope (not humming; a humming rope would just be seized) holds a drawbridge or a cage counterweight. The rope is at least 3 tiles past seize reach, across a gap or behind a grille (darts pass through grilles). If it's a cage, the shaft is taller than kit-without-violet + 1.5 + 1. The key is often an **enemy's voice**: seize the Gull's Screech and throw it at the rope. |
| **Plate door** | Slab or heavy | Sealed | G1. The plate and a brown source are in the same room, and the plate is at least 1 tile from the door. |
| **Cracked / reinforced floor** | Heavy Drop / Satchel bouncer | Sealed | At least 1 tile thick (reinforced: 2), spanning wall to wall. The browns are above it, in the same room. |
| **Gust corridor** | Heavy | Sealed by force | Ceiling ≤ 3 tiles, length ≥ 10 tiles, and the gust is ≥ 14 px/f (faster than a run at 9.6 and faster than Slip's net ~11). Heavy is immune. No sources inside. |
| **Updraft** (a broker's shout) | Feather | Reach | Lifts only a feather. Taller than every non-feather kit plus the palette. No facings in the shaft. |
| **Feather boards** | Feather | Valve | They break under middle or heavy and drop you onto a lower route that leads back to a Corner. |
| **White-static zone** (the Flats) | Carrying sounds in | Reach | You can't seize, cling or pogo, and you leak one sound every 180 f. The build point is at most about 27 tiles past the last source in the room. |
| **Owner-chase** (lure) | Levy a voice away | Sealed, timed | A portcullis on the owner's chain opens while the owner is at least *N* tiles from its post. The door is within half the open time × run speed. **Soft or optional only.** |
| **Slip gap** | Slip | Reach | 8.6–12 tiles before Rope Skip, and at least 24 after. The approach side is source-free (G3), and there's a gate-span volume (G4). |
| **Slip curtain** | Slip i-frames | Sealed by hazard | A hazard-class curtain (G5) under a sealed ceiling, at most 3 tiles thick. |
| **Skip ledge** | Rope Skip | Reach | 5.5–7 tiles in a room with no pink and no pogo targets. Brown and violet raise the minimum (G3). |
| **Facing chimney** | Off the Ropes | Reach | The facings cover the full height, and the height is at least kit-without-Ropes + palette + 1. **Choose the facing's colour on purpose**, because a facing is a source and it adds to the palette. |
| **Writ lock** | Writ | Sealed | A humming latch behind a **static grille**, more than 52 px of seize reach away. |
| **Writ grapple / pin** | Writ | Reach / sealed by time | A chasm or shaft longer than the full kit plus palette. For a pin, the machinery closes in *T* frames, where *T* × kit speed is at least 25% short of the distance; the pin holds while the string is intact. |
| **Hue and Cry stream** | Hue and Cry | Reach | A span longer than the full kit plus palette, crossable only along the stream. |
| **Fever lock** | `fever ≥ N` | Sealed | A visible world door. *Additive* fever routes (a new sound, a longer shout) follow the reach rules against the kit you can have when that fever first happens. |
| **Seize latch** (one-way shortcut) | Seize, from the far side | Sealed | The bolt is on the far face of a wall at least 1 tile thick (64 px, more than the 52 px seize reach), with no line of sight from the near side. It stays open (a save flag). |
| **Drop / chute** | none | Valve | Higher than the kit at first pass. Turning two-way later is fine for a shortcut. |
| **Boss shutter / machinery** | Boss flag | Sealed | G1 |
| **Quiet hum** (a secret) | Seize | Sealed | Hums at 0.5× and is audible within 6 tiles. **Secrets hum quietly, never silently.** |

**Soft gates** (for pacing, not order) are enemies, owner-chase caches and optional mini-bosses. Silksong has 17 optional bosses against 12 mandatory ones ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)). The hard and soft requirement split follows [BorisTheBrave](https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons/).

**Sequence breaks.** We harden the ones we want into supported routes, and any break not on the list fails CI ([Bugnet](https://bugnet.io/blog/bug-tracking-for-metroidvania-games-with-sequence-breaks); [Wikitroid](https://metroid.fandom.com/wiki/Sequence_Breaking)).

---

## 4. Vertical slice: the Tally plus the Bourse

**16 rooms** (3 hub rooms and 13 in the Bourse, one of them optional) **plus 6 secret closets. About 25–30 minutes.**

**Build order: B12 (the put-back room) comes first**, together with a jumps-only control. Run the L3 flow ratio on it before building anything else, because if carrying a sound back fails, "levy as key" is in doubt (critique §1.5).

### 4.1 Shape: a U-bend closed into a loop, with one real fork

The opening follows Silksong's linear U-bend, where each lock is "literally just around the corner from the key" ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)):
1. Go **down** through the brown Cellars.
2. Find the Slip at the **bottom**.
3. Climb **up** the pink and violet Stairs.
4. The Auctioneer's repossessed Gavel drives the **Gavel Lift** home to Pawn Row.

**The fork is in B2:**
- **Route A:** drop a slab on the plate, and the door opens to B3.
- **Route B:** go heavy and push through the gust corridor. It leads to the **X6 Bellows Closet**, which holds a Chin piece, and then drops into B3.

So there's a branch you can see, take, and be rewarded for.

```
row +3                       [B13 Rostrum ▲escape▲ Lift Head]
row +2  [B12 Bidding Galleries ......|Corner]    ‖ Gavel Lift
row +1  [B11 Mezz][B10 Ring][B9 Pit] [B8        ‖            (X2 off B8's upper shaft at fever 1,
row  0  [T1 Yard][T2 Cross][T3 Pawn Row ....... ‖ lift foot]   dropping into B12's upper gallery)
row -1           [hatch]             [ Shout   ]
row -2  [B1 Strongroom][B2 Scales][B3 Kennel][B4][B5 Store][B6 Ticker Hall][B7 Flue]
              X5 above B2 · X6 off B2 (the fork) · X4 off B3 · X3 behind B6's grille · X1 above T3
        latch B5 → T2 closes the Cellars ring · dumbwaiter B11 → B4 after the Grindstone
```

**What each shortcut is for:**
- **The B5 → T2 latch** closes the Cellars into a ring, so after the Slip you're two rooms from the hub.
- **The B11 → B4 dumbwaiter** ties a shortcut to the Grindstone kill (its wheel drives the motor). It gives fever-1 revisits of the Cellars (X5, X6) a quick route, and it lets a Short Sale player come back from the Mezzanine to the Cellars. *It doesn't help with death runs; the Corner placement does that (§4.3).*
- **The Gavel Lift** connects the Rostrum, Pawn Row and the Foundry.

### 4.2 Rooms

Purpose key: **T** teach, **Te** test, **Co** combine, **R** reward, **Re** rest, **Bo** boss, **S** shortcut, **H** hub. In the palette column, "p" is pink, which is bounded by W1 and G3.

| Id | Room | Size (tiles) | Purpose | Palette / enemies | Contents and beat |
|---|---|---|---|---|---|
| T1 | Evictions Yard | 60×17 | T (move, jab, **first seize by 0:45**) | brown (the cart) / none | Kid is thrown off a Receiver's cart, which jams in the yard gate. Seize its axle-grind: the cart becomes your first ghost, and you walk through. In the west wall is the **Row entry**: a 9-tile wall that needs Rope Skip plus a brown recoil hop from the cart's sound. |
| T2 | Tally Cross | 30×34 | H, Re | brown (the hatch). **Fever 1 adds pink crowd chatter.** / none | **Cross Corner**. The ticker board and a free Tally ledger. A brown **humming hatch** is the seize wall down to B1. A **balcony 12 tiles up** is visibly out of reach at fever 0; at fever 1, the crowd's pink springs reach it, and it leads to the Row roofs. |
| T3 | Pawn Row | 75×17 | S, R | pink (pawned wares) / none (fever 1: a Gull flock) | A closed Pawnbroker shutter ("back after the Bell"; outside the slice). The **Gavel Lift foot** is at the east end, with a sealed shaft down to the Foundry. The **east city gate** (fever ≥ 3). A quiet-hum wall leads to X1. |
| B1 | Strongroom Walk | 45×23 | T (levy), T (white) | p, white / none | Throw pink forward at the wall to climb a 6-tile ledge (teachGate). A white strip at **head height** triggers `seizeRefused`. |
| B2 | Furnace Scales | 60×23 | T (weigh-in), **fork** | brown ×2, violet (facings on the X5 chimney) / none | Lot 7's two routes now go to *different places*. Route A: slab → plate door → B3. Route B: heavy → gust corridor → X6 → drop into B3. The heavy exit step (3 tiles) still teaches "shed weight". A 17-tile violet facing chimney leads to X5 (needs Off the Ropes). |
| B3 | Kennel Lots | 45×17 | T (open vs guarded, the Catch) | p (Bark) / 2 Barkers | A raised spawn stoop and 120 f of attack grace. The owner-chase portcullis to X4. |
| B4 | Cellar Corner | 30×17 | Re, R | none / none | **Cellar Corner**. The Copyist (you can hear his quill from B3 and B5) gives you the Bourse ledger. The foot of the dumbwaiter. |
| B5 | Distraint Store | 40×23 | Te, R, S | brown, violet (Grinder) / 1 Grinder | **Slip** (her ring shoes) in a pawn lot. There's a wall to stun the Grinder against. The **latch bolt** leads to T2. |
| B6 | Ticker Hall | 60×23 | T (Slip, violet rope-cut), Te | violet (Gulls) / 2 Stock Gulls | The west approach has no sound sources, then a **10-tile pit** with a gate-span volume over it. East of the pit, **seize a diving Gull's Screech and throw the dart at the plain rope** holding the cage counterweight: the cage rises up an 8-tile shaft into B8. X3 sits behind a grille. A side door opens to B7. |
| B7 | Short Sale Flue | 30×51 | optional; the break | p (a creaking railing) / none | A **4-tile spring pocket with Poundage** that a novice can reach. The **vent 12 tiles up** is for experts (§4.4). It stays a separate room, because the pink bound (16.5) is above B8's 12-tile gates. |
| B8 | Shout Shaft | 30×51 | Co (weigh-in twist), T (down-levy), **Re** | brown ×2 / none | **The trailer shot.** You're heavy with two deeds, so you stomp the plate; you jump and down-levy both browns as two recoil hops; the needle swings to FEATHER; and the shout carries you **12 tiles** up (kit-with-palette is about 10.5). The **Ringside Corner** is on the top landing, one room from the Grindstone's door. |
| B9 | Trading Pit | 40×23 | Co (combat) | p, violet, brown, white (Barker, Gull, Clerk) / 3 | The Clerk teaches the white Tannoy. The doors don't lock, and the room has no reach exits. |
| B10 | Grindstone Ring | 30×17 | Bo (mini-boss), R | brown, violet, white / The Grindstone | **Rope Skip**. The shutter opens toward B11 on the flag. From the B11 side there's a back door, so a Short Sale player can get in. |
| B11 | Mezzanine Corner | 30×23 | Re, T (Skip), S | none / none | **Mezzanine Corner**. A 6-tile plain-masonry ledge. The **dumbwaiter brake** (seize it) leads to B4. |
| B12 | Bidding Galleries (+ **Rostrum Corner** alcove) | 75×23 | Co (skip, slip, **carry-back**), Re | brown ×1 (a strongbox at the far end), violet / 2 Gulls | The put-back room. Carry the brown back, or **ferry** it: levy it forward, re-seize it, repeat. Go over two 5-tile ledges and a 10-tile gap (at middle weight, 6.9 / 14.2) and levy it onto the plate. The plate door opens onto the Rostrum Corner alcove, and a seize latch on the alcove side opens it from within. No enemy owns the strongbox, so nothing can Snatch it. |
| B13 | The Rostrum | 30×51 | Bo, S | Auctioneer's voices / The Auctioneer | A 30×17 camera-locked arena (combat spec §5). After the win, the **Floor Sells** escape runs up the shaft to the lift head (§4.6). |

**Secret closets** (each 30×17, not counted in the 16):

| Id | Name | Found from | How you get in | Reward |
|---|---|---|---|---|
| X1 | Pawn Loft | T3 | quiet hum | Chin piece |
| X2 | Vault of Voices | B8 | The fever-1 shout reaches 15 tiles. The vault is **also a route**: it drops into B12's upper gallery. | a ledger page |
| X3 | Barred Lot | B6 | Writ, through the grille | a sponsorship |
| X4 | Kennel Cache | B3 | owner-chase | Poundage |
| X5 | Furnace Loft | B2 | Off the Ropes up a 17-tile chimney of violet facings | Poundage and a ledger page |
| X6 | Bellows Closet | B2 | the fork: heavy through the gust | Chin piece |

### 4.3 Critical path, pacing and Corners

| # | Room | Min (cum.) | Intensity | Beat (introduce → test → twist → combine) |
|---|---|---|---|---|
| 1 | T1 | 1 | low | Move and jab. **Seize introduced at 0:45** (the cart). |
| 2 | T2 | 2 | rest | Corner. Seize the hatch. |
| 3 | B1 | 4 | low | Levy (pink): **introduce**. White static: introduce. |
| 4 | B2 (+X6) | 7 (+1.5) | med | Weigh-in: **introduce**. The fork. |
| 5 | B3 | 9 | high | Seize on enemies: introduce and test |
| 6 | B4 | 10 | rest | Corner and Copyist |
| 7 | B5 | 12 | high | Grinder test. **Slip.** The latch. |
| 8 | B6 | 14 | med | Slip: **introduce, test**. Violet rope-cut: **introduce** (the enemy's voice is the key). |
| 9 | B8 | 16 | med / rest | Weigh-in **twist**, down-levy **introduce**. Ringside Corner. |
| 10 | B9 | 18 | high | **Combine** (combat) |
| 11 | B10 | 21 | peak | Grindstone. **Rope Skip.** |
| 12 | B11 | 22 | rest | Skip: **introduce**. The dumbwaiter. |
| 13 | B12 | 25 | med | **Combine**: skip, slip, carry-back. Rostrum Corner. |
| 14 | B13 | 29 | peak | Auctioneer, the escape, fever 0 → 1, the lift home |

**Corners:** T2, B4, B8 (top landing), B11, and B12 (the alcove). On the critical path there are **at most 3 rooms between Corners**, and each boss door is **at most 1 room** from a Corner. A death at the Grindstone respawns you at B8's top, so the run back is B9 (whose doors don't lock) and then the ring.

**Intensity** follows a concertina: low, medium and high alternate, with a rest before each peak.

### 4.4 The intended sequence break: "Short Sale" (B7 → B12's alcove)

- **The move.** The decayed spring chain. Jump, then down-levy pink: a spring anchors under your feet and you recoil. Bounce 7 tiles, down-seize the spring you just left, re-levy it at the apex (3.5 tiles), and so on. From a 4.25-tile jump apex, the chain reaches about 14.75 tiles, and the vent is at 12. A floor spring alone gives 7 tiles (10 with Rope Skip), so a novice can't reach it by accident.
- **What it skips.** B8–B12, including the Grindstone and Rope Skip.
- **Why it's safe.** You land in the Rostrum Corner alcove. From there you can open the plate door from inside, drop down to B11, and enter B10 by the back door, so Rope Skip stays obtainable. The Foundry and the Row entry both need Rope Skip, so you have to come back for it.
- **Why it's fair.** Aims aren't discovered blind (novice playtest), so this is expert-only. The Grindstone acknowledges it: "you skipped the undercard."
- **What the validator checks.** It must find this edge, and no other unintended edge.

### 4.5 The mini-boss and the boss

**The Grindstone** (B10) is an elite Grinder in an arena with 2 plates.
- **Its voices:**
  - Growl (brown) drives the Charge.
  - Whet (violet) drives Sparks.
  - Rattle (white, unseizable) drives a ring of floor sparks you have to jump.
- **The Count** repossesses its Growl.
- **Machinery:** its wheel becomes the dumbwaiter's motor.

**The Auctioneer** (B13) follows combat spec §5.
- **Machinery:** the Gavel drives the Gavel Lift.
- **Fever:** 0 → 1.
- **Death during the slice** uses `death.mode = 'garnish'` (combat spec's fallback). The Runner waits until it can be a room-local chase.

### 4.6 The escape: "The Floor Sells"

This follows Ori's escapes: a boss-scale set piece that uses only verbs you already have, with less room for error ([Ori Wiki](https://oriandtheblindforest.fandom.com/wiki/Ginso_Tree)).
- It lasts **≤ 45 s**, with a checkpoint **every 15 s**.
- It introduces no new mechanic and **doesn't require Rope Skip**.
- The rising "SOLD" wave moves at **0.75×** the critical-path minimum speed in the first segment, then 0.85×.
- It must be survivable at 1 Chin.

### 4.7 Fever 1 in the slice (one route and one danger per district)

| District | Route (the arriving sound is the key) | Danger |
|---|---|---|
| Tally | T2's pink crowd springs reach the 12-tile balcony, which leads to the **Row roofs**: a second, Rope-Skip-free way into District 3. | A Gull flock over T3 |
| Bourse | B8's shout reaches 15 tiles, which leads to X2 and then drops into B12's upper gallery: a quick path back to the Rostrum area. | Hot Barkers (B3, B9) |

### 4.8 Machine-readable graph

`requires` is an AND-list of tokens:
- `ability:<id>`
- `flag:<id>`
- `fever>=N`
- `local:<colour>`: the colour is in that room's palette, and the bot solves it inside the room.
- `weight:<class>`
- `trick:<id>`: allowed only on a sanctioned break.

Other fields:
- `hold` is `sealed` or `reach`.
- Every reach edge carries `proof` (the kit-without-key height or gap, and the requirement) and passes G7, unless it's a `sanctionedBreak`.
- Nodes with `zoneOf` are sub-areas of a room, not separate rooms.

```json
{
  "version": 2,
  "slice": "tally+bourse",
  "units": { "tile": 64 },
  "abilities": ["seize", "levy", "slip", "ropeSkip", "ropes", "hueAndCry", "writ", "satchel"],
  "mechanics": { "springDecay": { "factor": 0.5, "maxPinkBouncesPerAirtime": 3 }, "cling": "hummingFacingsOnly", "ropeSkipAtHeavy": false },
  "start": { "room": "T1", "abilities": ["seize", "levy"], "fever": 0 },
  "goals": ["flag:boss:auctioneer", "ability:slip", "ability:ropeSkip"],
  "rooms": [
    { "id": "T1", "name": "Evictions Yard", "district": "tally", "size": [60, 17], "purpose": ["teach"], "teaches": ["seize"], "palette": ["brown"], "enemies": [] },
    { "id": "T2", "name": "Tally Cross", "district": "tally", "size": [30, 34], "purpose": ["hub", "rest"], "corner": true, "palette": ["brown"], "enemies": [], "fever": { "1": { "palette": ["brown", "pink"] } } },
    { "id": "T3", "name": "Pawn Row", "district": "tally", "size": [75, 17], "purpose": ["shortcut", "reward"], "palette": ["pink"], "enemies": [], "fever": { "1": { "enemies": ["gull", "gull", "gull"] } } },
    { "id": "B1", "name": "Strongroom Walk", "district": "bourse", "size": [45, 23], "purpose": ["teach"], "teaches": ["levy", "white"], "palette": ["pink", "white"], "enemies": [] },
    { "id": "B2", "name": "Furnace Scales", "district": "bourse", "size": [60, 23], "purpose": ["teach", "fork"], "teaches": ["weighIn"], "palette": ["brown", "brown", "violet"], "enemies": [] },
    { "id": "B3", "name": "Kennel Lots", "district": "bourse", "size": [45, 17], "purpose": ["teach", "test"], "teaches": ["seizeEnemy", "catch"], "palette": ["pink"], "enemies": ["barker", "barker"], "fever": { "1": { "hot": true } } },
    { "id": "B4", "name": "Cellar Corner", "district": "bourse", "size": [30, 17], "purpose": ["rest", "reward"], "corner": true, "copyist": "bourse", "palette": [], "enemies": [] },
    { "id": "B5", "name": "Distraint Store", "district": "bourse", "size": [40, 23], "purpose": ["test", "reward", "shortcut"], "grants": ["ability:slip"], "palette": ["brown", "violet"], "enemies": ["grinder"] },
    { "id": "B6", "name": "Ticker Hall", "district": "bourse", "size": [60, 23], "purpose": ["teach", "test"], "teaches": ["slip", "ropeCut"], "palette": ["violet"], "enemies": ["gull", "gull"] },
    { "id": "B7", "name": "Short Sale Flue", "district": "bourse", "size": [30, 51], "purpose": ["reward"], "optional": true, "grants": ["item:poundageCache"], "palette": ["pink"], "enemies": [] },
    { "id": "B8", "name": "Shout Shaft", "district": "bourse", "size": [30, 51], "purpose": ["combine", "teach", "rest"], "corner": true, "teaches": ["downLevy"], "palette": ["brown", "brown"], "enemies": [], "fever": { "1": { "updraftTopTiles": 15 } } },
    { "id": "B9", "name": "Trading Pit", "district": "bourse", "size": [40, 23], "purpose": ["combine"], "palette": ["pink", "violet", "brown", "white"], "enemies": ["barker", "gull", "clerk"], "fever": { "1": { "hot": true } } },
    { "id": "B10", "name": "Grindstone Ring", "district": "bourse", "size": [30, 17], "purpose": ["boss", "reward"], "boss": "grindstone", "miniBoss": true, "grants": ["ability:ropeSkip", "flag:boss:grindstone"], "palette": ["brown", "violet", "white"], "enemies": ["grindstone"] },
    { "id": "B11", "name": "Mezzanine Corner", "district": "bourse", "size": [30, 23], "purpose": ["rest", "teach", "shortcut"], "corner": true, "teaches": ["ropeSkip"], "palette": [], "enemies": [] },
    { "id": "B12", "name": "Bidding Galleries", "district": "bourse", "size": [75, 23], "purpose": ["combine"], "palette": ["brown", "violet"], "enemies": ["gull", "gull"] },
    { "id": "B12c", "name": "Rostrum Corner", "district": "bourse", "zoneOf": "B12", "purpose": ["rest"], "corner": true, "palette": [], "enemies": [] },
    { "id": "B13", "name": "The Rostrum", "district": "bourse", "size": [30, 51], "purpose": ["boss", "shortcut"], "boss": "auctioneer", "grants": ["flag:boss:auctioneer", "fever:1"], "palette": ["violet", "brown", "pink"], "enemies": ["auctioneer"] },
    { "id": "X1", "name": "Pawn Loft", "district": "tally", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:chinPiece"], "palette": [], "enemies": [] },
    { "id": "X2", "name": "Vault of Voices", "district": "bourse", "size": [30, 17], "purpose": ["reward", "shortcut"], "secret": true, "grants": ["item:ledgerPage"], "palette": [], "enemies": [] },
    { "id": "X3", "name": "Barred Lot", "district": "bourse", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:sponsorship"], "palette": [], "enemies": [] },
    { "id": "X4", "name": "Kennel Cache", "district": "bourse", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:poundageCache"], "palette": [], "enemies": [] },
    { "id": "X5", "name": "Furnace Loft", "district": "bourse", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:poundageCache", "item:ledgerPage"], "palette": [], "enemies": [] },
    { "id": "X6", "name": "Bellows Closet", "district": "bourse", "size": [30, 17], "purpose": ["reward", "fork"], "secret": false, "grants": ["item:chinPiece"], "palette": [], "enemies": [] },
    { "id": "EX_ROW", "name": "to Mortgaged Row", "district": "row", "stub": true },
    { "id": "EX_ROW_ROOFS", "name": "to Mortgaged Row (roofs)", "district": "row", "stub": true },
    { "id": "EX_FOUNDRY", "name": "to the Foundry Gyms", "district": "foundry", "stub": true },
    { "id": "EX_FLATS", "name": "to the Static Flats", "district": "flats", "stub": true },
    { "id": "EX_RECEIVERSHIP", "name": "to the Receivership", "district": "receivership", "stub": true }
  ],
  "edges": [
    { "id": "e01", "from": "T1", "to": "T2", "dir": "both", "requires": ["ability:seize", "local:brown"], "hold": "sealed", "gate": { "type": "seizeWall", "object": "cart", "colour": "brown" } },
    { "id": "e02", "from": "T2", "to": "T3", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e03", "from": "T2", "to": "B1", "dir": "both", "requires": ["ability:seize", "local:brown"], "hold": "sealed", "gate": { "type": "seizeWall", "object": "hatch", "colour": "brown", "note": "from below: up-seize from a B1 spring" } },
    { "id": "e04", "from": "B1", "to": "B2", "dir": "both", "requires": ["ability:levy", "local:pink"], "hold": "reach", "teachGate": true, "obsoleteAfter": "ability:ropeSkip", "proof": { "reqTiles": 6, "kitWithoutKeyTiles": 4.5 }, "gate": { "type": "springClimb", "note": "reverse is a drop" } },
    { "id": "e05", "from": "B2", "to": "B3", "dir": "both", "requires": ["ability:levy", "local:brown"], "hold": "sealed", "gate": { "type": "plateDoor", "pressedBy": ["slab", "heavy"], "route": "A" } },
    { "id": "e06", "from": "B2", "to": "X6", "dir": "oneway", "requires": ["local:brown", "weight:heavy"], "hold": "sealed", "gate": { "type": "gustCorridor", "lengthTiles": 12, "ceilingTiles": 3, "gustPxPerFrame": 14, "route": "B" } },
    { "id": "e07", "from": "X6", "to": "B3", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "drop" } },
    { "id": "e08", "from": "B2", "to": "X5", "dir": "both", "requires": ["ability:ropes"], "hold": "reach", "proof": { "reqTiles": 17, "kitWithoutKeyTiles": 14.6, "note": "skip 7.6 + 2 brown 5.5 + violet facing 1.5" }, "gate": { "type": "facingChimney", "facingColour": "violet" } },
    { "id": "e09", "from": "B3", "to": "B4", "dir": "both", "requires": [], "hold": "sealed", "gate": null, "soft": "combat" },
    { "id": "e10", "from": "B3", "to": "X4", "dir": "both", "requires": ["ability:levy", "local:pink"], "hold": "sealed", "soft": true, "gate": { "type": "ownerChase", "owner": "barker", "openWhileAwayTiles": 6 } },
    { "id": "e11", "from": "B4", "to": "B5", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e12", "from": "B5", "to": "T2", "dir": "oneway", "requires": ["ability:seize"], "hold": "sealed", "opens": "flag:shortcut:storeLatch", "gate": { "type": "seizeLatch", "boltSide": "B5", "wallTiles": 1, "noLineOfSight": true } },
    { "id": "e12r", "from": "T2", "to": "B5", "dir": "oneway", "requires": ["flag:shortcut:storeLatch"], "hold": "sealed", "gate": { "type": "latchOpen" } },
    { "id": "e13", "from": "B5", "to": "B6", "dir": "both", "requires": ["ability:slip"], "hold": "reach", "proof": { "reqTiles": 10, "kitWithoutKeyTiles": 7.6, "axis": "gap", "note": "approach segment source-free; gate-span volume over the pit" }, "gate": { "type": "slipGap", "floor": "hazardPit" } },
    { "id": "e14", "from": "B6", "to": "B8", "dir": "both", "requires": ["local:violet"], "hold": "reach", "teachGate": true, "obsoleteAfter": "ability:ropeSkip", "proof": { "reqTiles": 8, "kitWithoutKeyTiles": 4.5 }, "gate": { "type": "ropeCut", "rope": "plain", "ropeBeyondSeizeTiles": 3, "cageShaftTiles": 8, "keyFrom": "gull screech", "note": "reverse is a drop" } },
    { "id": "e15", "from": "B6", "to": "B7", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e16", "from": "B6", "to": "X3", "dir": "both", "requires": ["ability:writ"], "hold": "sealed", "gate": { "type": "writLock", "grille": true } },
    { "id": "e17", "from": "B7", "to": "B12c", "dir": "oneway", "requires": ["ability:levy", "local:pink", "trick:springChain"], "hold": "reach", "sanctionedBreak": true, "proof": { "reqTiles": 12, "floorSpringTiles": 7, "decayedChainTiles": 14.75 }, "gate": { "type": "shortSaleVent" } },
    { "id": "e18", "from": "B8", "to": "B9", "dir": "both", "requires": ["local:brown", "weight:heavy", "weight:feather"], "hold": "reach", "proof": { "reqTiles": 12, "kitWithoutKeyTiles": 10.5, "note": "2 brown recoils; reverse is a drop" }, "gate": { "type": "updraft", "carries": "feather", "foot": { "type": "plateDoor", "pressedBy": ["slab", "heavy"] } } },
    { "id": "e19", "from": "B8", "to": "X2", "dir": "oneway", "requires": ["fever>=1", "weight:feather"], "hold": "reach", "proof": { "reqTiles": 15, "kitWithoutKeyTiles": 10.5 }, "gate": { "type": "feverUpdraft", "preFeverTopTiles": 12 } },
    { "id": "e20", "from": "X2", "to": "B12", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "drop", "note": "fever-1 route into the upper gallery" } },
    { "id": "e21", "from": "B9", "to": "B10", "dir": "both", "requires": [], "hold": "sealed", "gate": { "type": "bossDoor" } },
    { "id": "e22", "from": "B10", "to": "B11", "dir": "oneway", "requires": ["flag:boss:grindstone"], "hold": "sealed", "gate": { "type": "bossShutter" } },
    { "id": "e22r", "from": "B11", "to": "B10", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "ringBackDoor" } },
    { "id": "e23", "from": "B11", "to": "B12", "dir": "oneway", "requires": ["ability:ropeSkip"], "hold": "reach", "proof": { "reqTiles": 6, "kitWithoutKeyTiles": 4.5, "walls": "plain" }, "gate": { "type": "skipLedge" } },
    { "id": "e23r", "from": "B12", "to": "B11", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "drop" } },
    { "id": "e24", "from": "B11", "to": "B4", "dir": "oneway", "requires": ["ability:seize", "flag:boss:grindstone"], "hold": "sealed", "opens": "flag:shortcut:dumbwaiter", "gate": { "type": "seizeLatch", "boltSide": "B11", "machinery": "grindstoneWheel" } },
    { "id": "e24r", "from": "B4", "to": "B11", "dir": "oneway", "requires": ["flag:shortcut:dumbwaiter"], "hold": "sealed", "gate": { "type": "lift" } },
    { "id": "e25", "from": "B12", "to": "B12c", "dir": "oneway", "requires": ["ability:levy", "local:brown"], "hold": "sealed", "gate": { "type": "plateDoor", "pressedBy": ["slab"], "carryBack": { "ledgesTiles": [5, 5], "gapTiles": 10, "ferryAllowed": true } } },
    { "id": "e25r", "from": "B12c", "to": "B12", "dir": "oneway", "requires": ["ability:seize"], "hold": "sealed", "gate": { "type": "seizeLatch", "boltSide": "B12c" } },
    { "id": "e26", "from": "B12c", "to": "B13", "dir": "both", "requires": [], "hold": "sealed", "gate": { "type": "bossDoor" } },
    { "id": "e27", "from": "B13", "to": "T3", "dir": "both", "requires": ["flag:boss:auctioneer"], "hold": "sealed", "gate": { "type": "machinery", "machine": "gavelLift", "escape": { "maxSeconds": 45, "checkpointEverySeconds": 15, "waveSpeedFirstSegment": 0.75 } } },
    { "id": "e28", "from": "T3", "to": "X1", "dir": "both", "requires": ["ability:seize"], "hold": "sealed", "gate": { "type": "quietHum" } },
    { "id": "e29", "from": "T1", "to": "EX_ROW", "dir": "both", "requires": ["ability:ropeSkip", "local:brown"], "hold": "reach", "proof": { "reqTiles": 9, "kitWithoutKeyTiles": 7.25, "keyKitTiles": 10.35 }, "gate": { "type": "skipLedge", "combine": "brown recoil" } },
    { "id": "e30", "from": "T2", "to": "EX_ROW_ROOFS", "dir": "both", "requires": ["fever>=1", "local:pink"], "hold": "reach", "proof": { "reqTiles": 12, "kitWithoutKeyTiles": 10.35, "keyKitTiles": 16.5 }, "gate": { "type": "feverPaletteKey", "arrives": "pink crowd" } },
    { "id": "e31", "from": "T3", "to": "EX_FOUNDRY", "dir": "both", "requires": ["flag:boss:auctioneer"], "hold": "sealed", "gate": { "type": "machinery", "machine": "gavelLift", "note": "Foundry entry then needs ropeSkip" } },
    { "id": "e32", "from": "T3", "to": "EX_FLATS", "dir": "both", "requires": ["fever>=3"], "hold": "sealed", "gate": { "type": "feverDoor", "sign": "city gate" } },
    { "id": "e33", "from": "B13", "to": "EX_RECEIVERSHIP", "dir": "both", "requires": ["fever>=4", "ability:hueAndCry"], "hold": "reach", "proof": { "reqTiles": 28, "axis": "gap", "note": "static chasm; boss voices gone after the win" }, "gate": { "type": "hueAndCryStream" } }
  ],
  "validator": {
    "checks": [
      "every non-stub room reachable from start",
      "every reachable state can reach a Corner (no softlock), at every fever level",
      "goals reachable, with and without the sanctioned break",
      "every reach edge: proof holds against the reach table (kit-without-key + palette), then the bot exhausts a bounded region",
      "exactly the listed sanctioned breaks are found",
      "fever never decreases; a palette change re-validates that room's reach edges",
      "teachGate edges never guard a grant",
      "Corner spacing: at most 3 rooms between Corners on the critical path; every boss door at most 1 room from a Corner"
    ]
  }
}
```

---

## 5. Full-game macro plan

**Structure:**
1. **A linear U-bend.** The slice.
2. **An open middle.** Districts 2 and 3 in either order, like Silksong's free-form Act 2.
3. **Districts 4 and 5.** The Flats (a fever gate), then the linear finale.

**Target:** 5–7 hours in **about 100–115 rooms**: 5 districts of 18–22 rooms, plus a hub of 6.

**Bosses:** 5 district bosses, the Grindstone, and 2–3 optional ones. That's 8–9, inside PLAN's range of 8–12.

| # | District | Colour / altitude | Mechanic twist | Abilities | Boss → machinery | Fever after |
|---|---|---|---|---|---|---|
| 1 | **The Bourse** (Cellars + Stairs) | brown below, pink/violet above | Shout updrafts, auctions, the first weigh-in | Slip, Rope Skip | **The Auctioneer** → the Gavel Lift | 1 |
| 2 | **The Foundry Gyms** | brown, bottom | Gust corridors, cracked floors, heavy bags as swinging platforms, **humming ring-rope facings** | Off the Ropes; Hue and Cry (boss) | **Big Bellows** (its blasts push anyone who isn't heavy) → ride the blast (Hue and Cry) + a **standing bellows updraft** from the Foundry to the Tally | 2 or 3 |
| 3 | **Mortgaged Row** | ghost/pink, low west | Reverse biome: you build floors from a levy budget. **One Assessor zone**: a door-bounded patrol where an invulnerable static Assessor hunts **by sound**, so taking a sound wakes it. We design one before promising more. | Writ (with pin); Corner Satchel (boss) | **The Absentee Landlord**: nothing but voices, and you win by getting all of them on record → **re-titled bridges** | 2 or 3 |
| 4 | **The Static Flats** | white, outside the east wall | Long rooms (up to 90×17). Nothing can be seized and the bag leaks, so you cross on sounds carried in from the room's edge. | none (combines everything) | **Old Static**: can't be seized, only *fed* (levy sounds into its maw) → its mast becomes a **Hue and Cry highway** to the Receivership | 4 |
| 5 | **The Receivership** | violet, top | Everything stacked: Satchel combos, Writ pins, Hue and Cry chains, and the salvaged **clock vaults** where platforms exist only on the tick | none | **The Receiver** (who holds the belt), then the **Exchange Bell** → **the Crash** | → 0 (ending) |

**Cut: the Clock Tenements.** Standing Count folds into the Writ pin. Tick platforms move into the Receivership's vaults. Violet object sources now appear from the start (the Gulls in B6, and a ticker source in the Tally from fever 1).

**Dread's EMMI rules for the Assessor zone** ([Josh Anthony](https://www.joshanthony.info/2021/11/06/examining-the-emmi-zones-of-metroid-dread/)):
- Limited in size, and placed so you cross it several times.
- Open halls mixed with tight corridors.
- If you're caught, you respawn at the zone door.
- It visibly changes once it's cleared.

**Fever over time:**

| Fever | ~Time | What changes |
|---|---|---|
| 0 | 0:00–0:30 | — |
| 1 | ~0:30 | The Row roofs open |
| 2 | ~1:30 | The first of Districts 2 and 3 is done |
| 3 | ~2:45 | The Margin Call: the Flats open, and static creeps in at the Tally's edges |
| 4 | ~4:00 | The Blow-off Top: the Receivership opens |
| The Crash | 5:00–6:30 | Ending, then an epilogue |

**Secrets come in three layers**, after Animal Well's "three different people" ([Thinky Games](https://thinkygames.com/features/interview-how-animal-well-is-using-secrets-and-mysteries-to-be-a-different-kind-of-metroidvania/)):
1. The critical path.
2. Quiet hums, Chin pieces, ledger pages and fever routes.
3. The red-ink pitch glyphs across every register spell out the Exchange Bell's tune, which opens an optional ending room.

---

## 6. Level design rules for room builders

### 6.1 Metrics (feather; §3.1 has the rest)

| Use | Height (tiles) | Gap (tiles) |
|---|---|---|
| Comfortable, base (critical path) | ≤ 3.5 | ≤ 6 |
| Stretch or test, base | 4.0–4.25 | 6.5–7.3 |
| Heavy must fail | ≥ 3 (step) | ≥ 5.5 |
| Middle passes, heavy fails | 3 | 5.5–6 |
| Floor spring | ≤ 6.5 comfortable, 7 max | about 9 of drift |
| Slip era, comfortable | — | ≤ 12 (middle ≤ 11) |
| Skip era, comfortable | ≤ 6 (middle ≤ 5.5) | ≤ 11 (≤ 18 with Slip) |
| Recoil hops | brown 2.75, pink 2 (halving per chain step), violet 1.5 | — |

- **Rooms:** at least 30×17. Boss arenas are exactly 30×17 and camera-locked. Shafts are multiples of 17 tall.
- **Doors:** at least 2 tiles wide, and the whole width triggers the transition (the novice overshot 1-tile doors seven times). Never make a jump-in door.
- **Corners:** at most 3 rooms apart on the critical path, and at most 1 room from any boss door.
- **Hub rooms** have at least one sound at fever 0. The first Seize happens within 60 s.

### 6.2 Safe spacing around enemies

| Enemy | Threat reach | Keep this clear of doors, Corners and spawn points |
|---|---|---|
| Barker | Lunge, triggered at 4 tiles; travels about 2.6 | 7 tiles, or put the spawn on a raised stoop |
| Grinder | 10-tile line of sight; charges up to 14 tiles, and stops at walls and ledge edges | Never on a floor lane with a door, unless something stops it at least 3 tiles short |
| Stock Gull | Dives about 5 tiles from 3–4 tiles above | 6 tiles horizontally |
| Clerk | Mortar lands within 90 f; Tannoy ring radius 1.5 | 8 tiles, or out of line of sight |

- **120 f of attack grace after entering a room.**
- **At most 2 attack tokens**, and at most 3 enemies in view at once.
- **Gate-span volumes** keep enemies out of gated spans (G4). Don't tune leashes to do this job.

### 6.3 Camera framing

- Put the lock and its key on one screen in any room that teaches a lock.
- The landing spot must be visible at takeoff. Keep gaps under about 12 tiles, or add a camera zone or a landmark. A ledge more than 7 tiles above needs a look-up hint or a camera zone.
- A visible but unreachable reward (behind a grille, or on a balcony) is the standard way to say "come back later". T2's balcony is the model.
- **Design B8 for the camera.** It's the trailer shot: the needle swing and the ride up past the ticker board have to be framed in one continuous view.

### 6.4 The teaching pattern: introduce → test → twist → combine

1. **Introduce** in a safe room with one verb, where failure costs nothing.
2. **Test**: failure costs a pip, or a respawn at safe ground.
3. **Twist** in a new context. For example, B8 makes a forward throw useless, so the down-levy is the solution. B6 makes an enemy's voice the key.
4. **Combine** with an older verb.

§4.3 lists the instances in the slice. Every ability gets all four before its district boss, which is the final exam, the way Ori's escapes are.

### 6.5 Readability

- **One material rule.** Humming means solid and seizable, and if it's a facing you can also cling to it. Dashed means seized. White speckle means unclaimable (the Flats and grilles). Plain masonry means solid with no grip. Spikes, orbs and enemies can be pogoed.
- **Facings wear chalk marks** that say "climb here", in the facing's colour.
- **Keys wear their colour.** The plate's lamp is brown. A spring ledge has pink chalk. A rope-cut rope is plain hemp with a violet tag.
- **Secrets hum quietly, never silently.**
- **Aims are taught by geometry.** The first down-levy and the first up-seize must each be the *only* working solution in a safe room.
- **Every seize gets feedback**, including a refusal or a whiff. The "open" state is visible on enemies.
- **Beats:** a "cleared" flash, a 20 f pause on death, and room transitions under 300 ms.

### 6.6 Checklist for each room

1. List the palette, including any facings.
2. Give every reach exit a `proof` against §3.1 (G3, G7).
3. Mark gate-span volumes (G4). Every gate hazard is respawn-class (G5).
4. No facing sits inside a span unless Off the Ropes is the key (G6).
5. Check spawn and door spacing, and the 120 f grace (§6.2).
6. The room is escapable at every fever level, and the route and danger for each fever step are listed.

---

## 7. Mechanic changes for other owners (not changed here)

| Owner | Change | How to test it |
|---|---|---|
| **Movement** | **Cling only on humming facings:** the wall-slide and wall-jump probe requires an armed humming source tile. Gym rooms keep cling-anywhere as a debug profile, so the L2 tapes still hold. | Greybox a Ropes shaft. **Kill criterion:** if the novice tries to cling on plain walls 5 or more times in 10 minutes, or the human's feel rating drops, fall back to cling-anywhere, with static render as the no-cling material. |
| **Movement** | **Spring decay:** within one airtime, each pink bounce is ×0.5 of the previous one (7 → 3.5 → 1.75 tiles), and so is the pink recoil hop. A fourth pink levy in the same airtime is dry (`levyDry`). The count resets on grounding or a wall jump. | Unit test: the chain's apex is ≤ 16.5 tiles at feather. Re-tune the Stairwell's bar spacing. Check the novice still gets the spring delight from a single floor spring. |
| Movement | Rope Skip is off at heavy. An updraft volume lifts feather only. A gust volume (≥ 14 px/f) doesn't affect heavy. Static render and static grille exist (grille: blocks bodies; lets sight, Writs and violet darts through). | Exact tests, like the gym |
| **Combat** | **Violet darts cut plain ropes** (a new rope object with a `cut` event). **Gate-span volumes:** enemies can't enter, and enemy projectiles despawn at the edge. **120 f of room-entry attack grace.** A decision on whether levied objects can be pogoed. Grindstone data (it has a white third voice). The slice uses `death.mode = 'garnish'`. | Trace checks; the bot |
| Tools | The validator reads §4.8 and checks each `proof` against §3.1, then has the bot exhaust a bounded region. It knows the sanctioned-break whitelist and zone nodes. | CI, on changed rooms only |
| Save | `world.fever`, shortcut flags, and ledger state | — |

---

## Revision log (response to `world-design-critique.md`)

| # | Recommendation | Decision | Reason |
|---|---|---|---|
| 1 | Bound the pink ladder (spring decay) | **Adapted** | Adopted as halving per bounce within an airtime, **capped at 3 bounces**, and the recoil hop halves too. Without the cap and the recoil decay, the chain still sums to a large bound. The critique's "+7.5 tiles" assumed a 240 px spring, but ours is 448. The honest result: pink is now *finite* (≤ 16.5 tiles), which makes the validator geometric and makes pink + ability spring climbs legal. But **a single floor spring is 7 tiles on its own, so reach gates under ~8 tiles still can't share a room with pink.** B7 therefore stays a separate room (B8's gates are 12, which is below the 16.5 bound). The Barker "might wander in" clause is gone: G4 volumes and palette arithmetic replace it. |
| 2 | Cling only on humming walls | **Accepted, as facings** | Facings are ordinary seizable source tiles, at least 1 tile thick and backed by masonry. Seizing one removes the grip without opening a hole to the outside. Static render is now reserved for the Flats. There's a kill criterion, because this changes the L2 feel model (§7). |
| 3 | Corner within one room of the Grindstone; B5→B10 spacing; B8 margin | **Accepted** | The Ringside Corner is on B8's top landing. The spacing rule is now a validator check. B8's column is now 12 tiles (proof: 10.5 + 1). |
| 4 | Fever as a palette key | **Accepted** | Each step now brings "1 route (the arriving sound is the key) + 1 danger" per visited district. In the slice: T2's crowd opens the balcony to the Row roofs, and B8's longer shout opens X2 → B12. The old "≥ 3 rooms change" is dropped. |
| 5 | First seize within 60 s; violet traversal now | **Accepted; the violet part adapted** | The cart gate in T1, and a sound in every hub room. For violet: darts cut *plain* ropes, because a humming rope would just be seized, and that would make violet pointless. B6's cage is keyed by a Gull's Screech, so enemies now sit inside a gate room. |
| 6 | Hue and Cry earlier, Standing Count into Writ | **Accepted** | Hue and Cry is Big Bellows' reward. The Writ pin replaces Standing Count, which also removes the third "Count". |
| 7 | Corner Satchel: move or cut | **Moved** to the District 3 boss | The Row's budget builds are where two-colour combos teach best. |
| 8 | Trim the slice to ~16 rooms / 20–30 min | **Accepted**, with one change | B1 merged into T2's hatch, B13 into B12's alcove, B15 into B13's escape shaft, and T4 into T3. The shop, the paid map and the Runner are cut for the slice, and so is the Rostrum's fever reopen. |
| 9 | Give the Cellars a real fork | **Accepted** | B2's two weigh-in routes now diverge: the heavy route goes through the gust corridor to X6 (a Chin piece). B7's pocket can be reached by a novice. |
| 10 | Build the put-back room first | **Accepted** | It's first in the build order, with a jumps-only control and the flow ratio. Ferrying the sound is allowed. |
| — | B12 Snatch risk | **Rejected** | Owners only chase and Snatch their *own* sounds (combat spec §4.3). The strongbox is an ownerless deed, and deeds don't revoice in the room. It's stated in the room row. |
| — | Gull leash → sim exclusion volume | **Accepted** (G4) | Gate integrity can't depend on AI tuning. |
| — | G7 proving negatives | **Adapted** | A geometric proof from the reach table comes first. The bot is the second check and must *exhaust* a bounded region. Progression locks should be sealed where possible. CI runs only on changed rooms. |
| — | Static pits everywhere | **Accepted** | The rule is "hazard-class", not "white". |
| — | W2 vs the Flats | **Decided: no exception** | The Flats use long rooms with sources at the edge, which keeps the validator free of inventory state. |
| — | The Bourse's altitude contradicts W5 | **Accepted** | The Cellars are the Bourse's brown strongrooms below street level, so the slice now teaches the altitude rule. |
| — | X5 dangling, dumbwaiter rationale, escape speed, the Runner | **Accepted** | X5 is now the Furnace Loft (a facing chimney). The dumbwaiter's real purpose is stated. The first escape segment runs at 0.75×. The slice uses garnish mode. |
| — | Plan 4 districts and fever 0–3 | **Adapted: 5 districts, fever 0–4** | The brief asks for 5–6. The Clock Tenements are cut (their tick platforms move into the Receivership's vaults), and fever becomes a simple count of district bosses repossessed. About 100–115 rooms and 5–7 hours. |
| — | Design one Assessor zone before promising more | **Accepted** | Exactly one, in the Row. |

## Sources

- Mark Brown, "The World Design of Hollow Knight: Silksong": https://gmtk.substack.com/p/the-world-design-of-hollow-knight
- Mark Brown, Boss Keys: https://www.youtube.com/playlist?list=PLc38fcMFcV_ul4D6OChdWhsNsYY3NA5B2, and the Dread episode discussion: https://famiboards.com/threads/mark-brown-presents-metroid-dread-boss-keys-or-why-you-didnt-get-lost-in-metroid-dread.730/
- BorisTheBrave, "Lock and Key Dungeons": https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons/
- Hollow Knight, the Forgotten Crossroads: https://hollowknight.wiki.fextralife.com/Forgotten+Crossroads; Cornifer: https://hollowknight.fandom.com/wiki/Cornifer
- Metroid Dread's EMMI zones: https://www.joshanthony.info/2021/11/06/examining-the-emmi-zones-of-metroid-dread/ and https://metroid.nintendo.com/news/metroid-dread-report-vol-2/
- Ori, the Ginso Tree escape: https://oriandtheblindforest.fandom.com/wiki/Ginso_Tree
- Animal Well's three layers: https://thinkygames.com/features/interview-how-animal-well-is-using-secrets-and-mysteries-to-be-a-different-kind-of-metroidvania/
- Sequence breaking: https://metroid.fandom.com/wiki/Sequence_Breaking and https://bugnet.io/blog/bug-tracking-for-metroidvania-games-with-sequence-breaks
- Internal: `docs/design/world-design-critique.md`, `docs/reports/L3-audit.md`, `docs/reports/L3-novice-playtest.md`, `memory/signature-mechanic.md`
