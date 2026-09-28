# World design: *Tallage*

Status: **draft for L4** (world design for the vertical slice, plus a lighter full-game plan). Owner: world and level design. Date: 2026-09-28.
Scope: PLAN §1 (the world-design pillar), §3.4, §7 Phases 3, 5 and 6. Built on `docs/concepts/raw-L1-p4.md` Concept A, the grafts in `critique-L1-A.md` and `critique-L1-B.md`, `combat-spec.md`, `movement-spec.md`, `seize-levy-experiment.md`, and the L3 audit and novice playtest.
Units follow the movement spec: 64 px tiles, a 40×80 body, 60 Hz, a 30×16.9-tile view. Every number is a starting value that belongs in `tuning.ts` or content data.

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| W1 | **Sounds are movement.** A room's *palette* (the colours of every seizable sound in it, including enemy voices) is part of the player's kit. A pink sound works as an unlimited ladder, and brown and violet each add a recoil hop. | L3 proved that a down-levied pink spring anchors in mid-air and can be re-seized. That makes the Stairwell chain possible, so one pink source gives an expert unlimited height. Gates that ignore this will leak. |
| W2 | **The bag empties on room exit, so gates are local.** A reach gate only has to hold against *abilities plus the colours in its own room*. | Combat spec C6 already requires this. It keeps the validator's state small: abilities × flags × fever, never inventory. |
| W3 | **Two gate classes.** *Sealed* gates (a barrier from wall to wall, or floor to ceiling) hold no matter how you move, and every progression lock should be sealed where possible. *Reach* gates (height, gap, timing) hold only against a computed kit, need a 1-tile margin, and must be proven by the bot. | The L3 audit found Lot 7's spring gate fell to wall jump alone or double jump alone. Sealed gates can't fail that way. |
| W4 | **Two new terrain materials: white static render (walls) and static grille.** Static render can't be clung to, pogoed off or seized. A grille blocks bodies but lets sight, Writs and violet darts through. | Once the player has the wall jump, any wall is a ladder (movement spec §2.6). Without a no-cling surface, no height gate survives past the second district. The fiction supports it: white noise is unclaimable, so you can't get a grip on it. |
| W5 | **The city is layered by noise colour.** Brown sinks (foundries at the bottom), violet rises (the Exchange at the top), pink is street level, and white static lies outside the walls. | This gives world structure the same physics as Levy (brown falls, violet rises). The player can read altitude from colour, and the climb up the creditor chain is a literal climb. |
| W6 | **The fever is a one-way world clock (0–4).** It rises only when a district boss is repossessed. Each step changes rooms you've already visited. | This is critique B's graft 4, and Hollow Knight's Infected Crossroads applied to the whole city. It gives you a reason to backtrack without a checklist. |
| W7 | **The map is the Ledger.** You buy a district's lot outlines from the Copyist. Your footsteps ink in the rooms you walk. The ledger only updates at a Corner. | Hollow Knight's Cornifer and Quill, with critique B's trail-as-map graft. |
| W8 | **Beaten bosses become machinery.** Each district boss's signature sound becomes a permanent lift, updraft or bridge that shortens the map. | The critiques' Galloway principle. The shortcut *is* the reward, and it closes the loop back to the hub. |
| W9 | **Every ability is one of Kid's own distrained belongings, and you get it back by redistraining it.** | That's why pickups sit in pawn lots and evidence rooms. It suits a bailiff, and it isn't "powers that were always yours". |
| W10 | **Rope Skip (the double jump) is disabled at heavy.** It works at feather and middle. | The concept said "feather only". But any single brown sound makes you middle, which would make the skip vanish too often. Leaving heavy grounded keeps weigh-in meaningful without making the skip fragile. |

---

## 1. World premise as structure

### 1.1 The city of Tallage, laid out

In Tallage a sound is a title deed. The city settles by weight, the way noise settles in a spectrum: heavy rumbles sink and thin hisses rise. The poor live low among the engines, and the creditors live high, where the whistles are. Kid works her way up the chain of creditors, so her route through the city is **a climb**. It mirrors Silksong's pilgrimage from the depths to the Citadel, where the story is drawn on the map itself ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)).

```
 altitude   colour        district                         mechanic twist
 ─────────  ────────────  ───────────────────────────────  ──────────────────────────────
  top       violet        6 The Receivership               everything at once; fever 4
  high      violet/pink   1 The Bourse Stairs  (slice)      shout updrafts, auctions
  high      pink/violet   4 The Clock Tenements            tick platforms, Standing Count
  street    pink          HUB  The Tally                   crossroads; changes every fever step
  low       pink/ghost    3 Mortgaged Row                  already seized: build with a budget
  bottom    brown         2 The Foundry Gyms               weigh-in scales, bellows gusts
  outside   white         5 The Static Flats (east wall)   nothing seizable; bring your own
```

- **The Tally is the hub** and plays the part of Hollow Knight's Forgotten Crossroads: a central junction whose streets lead to many districts ([Fextralife](https://hollowknight.wiki.fextralife.com/Forgotten+Crossroads)). It is street level, the altitude where all the colours meet.
- **Why the city interconnects.** Debts chain across districts. Every district owes something to another, and its machinery runs on sounds pawned from elsewhere. The Foundry's bellows feed the Bourse's lifts, and the Tenements' clocks set the Exchange's trading hours. So shortcuts and lifts that cross district lines are *debt lines*, and a boss's repossessed sound becomes the machine that runs one (W8).
- **Unexplored exits are always visible**, and any lock you've seen is drawn on the ledger with its key glyph. Silksong's rule is that a stuck player should "go somewhere else" rather than be stonewalled ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)).

### 1.2 The fever ticker (a one-way world clock)

- `world.fever` is an integer from 0 to 4 kept in the save. It goes up only when a district boss is repossessed: the Auctioneer gives 1, Big Bellows 2, the Absentee Landlord 3, and the *second* of Mainspring and Old Static gives 4 (Districts 4 and 5 can be done in either order). It never goes down until the ending. The combat spec's C9 ("world tempo") reads it: the Count's beat is 12 → 8 frames and hot enemy variants appear.
- **Each step re-values the city.** In every district you've visited, at least 3 rooms change, drawing from four kinds of change:
  1. **New sounds.** New sources appear, such as crowds whose chatter gives you pink springs, or stronger shouts.
  2. **New routes.** Updrafts reach higher and closed gates open.
  3. **Swapped routes.** One route closes and another opens *in the same district*, for example a bridge re-mortgaged into a ghost.
  4. **New danger.** Hot variants and extra Gulls.
- **Safety rules the validator enforces.** A fever step may never remove the last route to a Corner or to any required key, and never traps a room. Every room must be escapable at every fever level. When a room gains a colour, every reach gate in it is re-validated, because W1 means a new pink source can break a gate.
- **You see and hear it.** The ticker board in the Tally jumps. Music BPM rises one step per level. Rooms that changed get a red **REVALUED** stamp on the ledger the next time you rest, which gives you a reason to go back.
- **Arc:** 0 at the Opening Bell → 1 after the Auctioneer → 2 → 3 at the Margin Call, when the east city gate opens to the Static Flats → 4 at the Blow-off Top, when the Receivership opens → **the Crash** at the ending, when the fever breaks and the city goes quiet. The redistributor epilogue plays at fever 0.

### 1.3 The Ledger (map) and Corners

| Element | Rule | Precedent |
|---|---|---|
| **Corner** (Rest) | The stool and bucket where your cutman patches you up. It saves, refills Chin, resets Beat-the-Count (combat spec §3.5) and **inks the ledger**. | Hollow Knight's bench plus Quill: the map fills in only at the next bench ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)) |
| **Copyist** | One per district, and **found by sound**: you can hear his quill scratching two rooms away, and blotted papers lead to him. He sells the district's lot outlines (the room shapes and exits) for Poundage. | Cornifer, whom you hear humming a few rooms away and follow by his papers ([Fandom](https://hollowknight.fandom.com/wiki/Cornifer)) |
| **Trail ink** | Rooms you've walked are drawn in the ink of your footsteps. Rooms you've only seen, bought, or glimpsed through a door are drawn as outlines. | Critique B graft 5 (GALL) |
| **Red ink** | Each lot lists its sounds as colour glyphs, and a glyph turns red once you've seized that sound. An enemy is **fully on record** when all of its voices are red (the Probate graft), which makes the bestiary part of the ledger. | Critique B graft 2 |
| **Lock glyphs** | A lock you've seen is drawn in its key's glyph (plate, spring, skip, rope, writ, fever N). | Dread's colour-coded doors, which keep you from getting lost ([Mark Brown, via Famiboards](https://famiboards.com/threads/mark-brown-presents-metroid-dread-boss-keys-or-why-you-didnt-get-lost-in-metroid-dread.730/)) |
| **Deed register** | Repossessing a district boss gives you that district's register, which marks every *source* in the district (not the secrets). | A reward for mastery that makes it easy to go back for completion |
| **Position** | Hidden by default. The "Tally Stamp" sponsorship (a charm) shows it. | Hollow Knight's Wayward Compass |

---

## 2. Ability progression

The order is set by which locks each ability opens *across the whole map*, not in one room (PLAN §3.4). Times are for a first playthrough.

| # | Ability (the belonging you redistrain) | What it does | Acquired | ~Time | Locks it opens across the map |
|---|---|---|---|---|---|
| 0 | **Jab kit, Seize, Levy** (brown, pink), **Weigh-in** (derived, not an ability) | Combat spec §1. Weight is 0/1/2+ brown sounds. | Start (T1) | 0:00 | Seize walls, springs, plates, cracked floors (heavy Drop), updrafts (feather), gust corridors (heavy) |
| 1 | **Slip**, from her *ring shoes* | A 4.5-tile dash with i-frames, plus the Counter | B6 Distraint Store, the bottom of the slice's U-bend | 0:12 | Gaps of 8–13 tiles, slip curtains. Hub: the Pawn Loft approach. Foundry: gust-gap timing. Row: ghost-bridge gaps. |
| 2 | **Rope Skip**, from her *skipping rope* | Double jump, +3 tiles; not at heavy (W10) | B10 Grindstone Ring (mini-boss) | 0:25 | Ledges of 5–7 tiles. Hub: the Foundry lift shaft ledges. Bourse: the Mezzanine. Foundry: scale towers. |
| 3 | **Off the Ropes**, from her *ring ropes* | Wall slide and wall jump on any clingable wall | District 2, the Foundry Gyms (boss prelude) | 1:30 | Chimneys and shafts ≥ 9 tiles. Hub: T1's west chimney to Mortgaged Row. Bourse: X5 above B2. |
| 4 | **Writ**, from her *bailiff's writ book* (a promotion) | A ranged seize of a humming object in line of sight (range TBD, about 8 tiles). Its string doubles as a grapple while the object still hums; seize the anchor and you drop. | District 3, Mortgaged Row | 2:30 | Sources behind grilles or across pits. Grapple chasms. Hub: the Clock Tenements gate. Bourse: X3 Barred Lot. |
| 5 | **Hue and Cry**, the crowd's roar that answers her | Ride any sound stream (a broker's shout, an enemy's roar, the bellows) as a current. You can cancel it into a jump or a Slip, like Ori's Bash out of a ride. | District 3 boss reward (a mid-game movement ability, per critique B graft 1) | 3:15 | Long static chasms, shafts plastered with static render, riding a golem's roar. Bourse: the shouts reach the Rostrum roof. |
| 6 | **Standing Count**, the *referee's watch* | Freeze a seized-from object for ten beats in its last position | District 4, the Clock Tenements | 4:15 | Timed machinery: falling lifts, closing shutters, swinging lot gates in every district |
| 7 | **Corner Satchel**, the *cutman's satchel* | A second compartment. Levy two colours as a combo: violet + pink makes a rising platform, and pink + brown makes a floor-breaking bouncer. | District 5, the Static Flats | 5:00 | Reinforced floors (2 tiles thick), static-render shafts ≥ 16 tiles, the Receivership vaults |

**Violet** exists from the start as an enemy voice (the Gull's Screech, the Auctioneer's Patter). The first violet *object* sources appear in the Clock Tenements, as critique A suggested ("violet arrives later").

---

## 3. Gate taxonomy

### 3.1 The kit reach table

Gates are measured against this table. The numbers are feather estimates from the movement-spec integrator (flat ground, full-speed run-up, and +0.25 tiles of ledge pop on heights). **The search bot is the authority**, and these figures are for planning only.

| Kit | Max height (tiles) | Max flat gap (tiles) |
|---|---|---|
| Base (feather) | 4.5 | 7.6 |
| Base, middle / heavy | 3.8 / 2.8 | 6.6 / 5.1 |
| + Slip (air slip, dash-jump) | 4.5 | 15.2 |
| + Rope Skip | 7.6 | 14.0 |
| + Slip + Rope Skip | 7.6 | 23.2 |
| + Off the Ropes | unlimited on clingable walls (+~4 per cycle) | unlimited between clingable walls |
| **Pink sound in room** | **unlimited** (the down-levy spring ladder, re-seized) | **unlimited** (about 14 tiles of drift per bounce) |
| Brown / violet sound in room | +2.75 / +1.5 per sound (recoil hop) | +~3 / +~1.5 per hop |
| Pogo target (spikes, orb, enemy, and levied objects until combat says otherwise) | +2.75 per target, **and refills the Skip and air Slip** | same |
| Updraft / Hue and Cry stream | the stream's length | the stream's length |

### 3.2 Universal gate rules

- **G1. Sealed means sealed.** The barrier spans wall to wall or floor to ceiling with no gap, is at least 1 tile thick, and the bounding surfaces around it are solid. The room has no second route around it at *any* kit obtainable before its key.
- **G2. Reach gates carry a margin.** The requirement must exceed the best kit available *without the key* by at least **1 tile**. With the key, the requirement must be at most **80% of the key kit's maximum** when the gate is teaching, or at most 90% when it is testing.
- **G3. Palette check (W1).** A reach gate may not share a room with a pink sound (object *or* voice, including a Barker that can wander in). Brown, violet and pogo targets are added to the reach you must beat. **Pink is a ladder.**
- **G4. No refuelling inside a gated span.** Keep spikes, orbs and enemies out of any gap or shaft the gate measures. Chasms use **static pits** (1 pip and a respawn at safe ground; not pogo-able), never spike floors.
- **G5. Hazards can't be tanked.** A hit gives 78 frames of i-frames (combat spec §3.1), so a damage-class hazard can be walked through. Anything used as a gate must be hazard-class: 1 pip and a respawn at safe ground.
- **G6. From Off the Ropes onward, every wall inside a reach gate's vertical span is static render** (W4).
- **G7. Every gate is checked against "kit without key."** For each gate with key K, the validator removes K from the game, computes every kit and flag state still reachable, and the bot must **fail** the gate with each of them. Only listed sanctioned breaks may pass. This check is the fix for the L3 audit finding.
- **G8. Teaching gates may become obsolete.** A gate whose key is a starting verb (Seize, Levy) only has to hold against the kit at its earliest visit. It is marked `teachGate` and `obsoleteAfter: <ability>`, and it may never guard a progression item.

### 3.3 Gate types and their hold rules

| Gate | Key | Class | Geometric rule that makes it hold |
|---|---|---|---|
| **Seize wall** (a humming partition) | Seize | Sealed | Spans the corridor floor to ceiling, at least 1 tile thick, with a solid ceiling. The corridor must be no taller than the partition. **Height variant:** the source's bottom edge sits more than *kit height + 2 tiles* above the floor, because up-seize reaches 2 tiles above a jump's apex (1.25 body + 0.75 hitbox). |
| **Levy build: spring climb** | Levy + a pink source *in this room* | Reach | Ledge height = kit height + at least 1, and at most 7 tiles for a floor spring. Lot 7's hall (6 tiles) is the base-kit case. It is exempt from G3 (the pink is the key) but must hold against *every other* ability obtainable before this point, so it is **only legal as a teaching gate** (G8). A progression gate must be a plate door. |
| **Levy build: plate door** | A slab or heavy | Sealed | The door is sealed (G1). The plate and at least one brown source are in the same room. The plate is at least 1 tile from the door, so you can't press it from the door side while standing in the doorway. |
| **Weigh-in: cracked floor** | Heavy Drop (the Overhand at heavy) | Sealed | At least 1 tile thick and spanning the shaft wall to wall, with no other way down. Two brown sources are *above* it in the same room. **Reinforced** floor (2 tiles thick) needs the Satchel's pink + brown bouncer. |
| **Weigh-in: gust corridor** | Heavy | Sealed by force | Ceiling at most 3 tiles high, so you can't jump over. At least 10 tiles long. The gust pushes non-heavy at **at least 14 px/f**: faster than a run (9.6) and faster than Slip's net rate (288 px per 26-frame cycle ≈ 11 px/f). Heavy takes ×0 knockback and walks through at 0.85 run. The corridor itself contains no sources. |
| **Weigh-in: updraft** (a broker's shout) | Feather | Reach | The column lifts feather only. The shaft is static render (G6) and taller than every non-feather kit, *including the room palette* (G3). Brown sources sit on the room floor, so going heavy for a plate and then shedding weight to ride up is the combine. |
| **Weigh-in: feather boards** | Feather | Valve | Creaking boards give way under middle or heavy and drop you into a lower route. This is a one-way valve, never a dead end: the lower route must lead back to a Corner. |
| **White-static zone** | Carrying sounds in | Reach | Nothing in the zone can be seized, clung to or pogoed, and the bag leaks its oldest sound every 180 f. The distance to cross is greater than the kit gap with no sounds. The place where you need your build is at most `180 f × run` ≈ 27 tiles past the last source, so one sound is always enough. |
| **Owner-chase** (lure) | Levy a voice away from its chained owner | Sealed, timed | A portcullis on the owner's chain opens while the owner is at least *N* tiles from its post. The door is at most *(min open time × 9.6 px/f) × 0.5* from where you levy, and the open time is capped by revoicing (480 f). Only used for **soft or optional** gates, because enemy AI is chaotic (`memory/signature-mechanic.md`). |
| **Slip gap** | Slip | Reach | Before Rope Skip: gap from 8.6 to 12 tiles over a static pit, with a pink-free, enemy-free approach (G3, G4). After Rope Skip: at least 15 tiles. |
| **Slip curtain** | Slip i-frames | Sealed by hazard | A hazard-class curtain (G5) under a sealed ceiling, at most 3 tiles thick (inside Slip's 288 px). |
| **Rope Skip ledge** | Rope Skip | Reach | 5.5–7 tiles in a pink-free room with no pogo targets. Room sources count toward the height you must beat (brown +2.75, so a room with a brown source needs at least 8.3 tiles, or no brown at all). |
| **Ropes shaft** | Off the Ropes | Reach | At least 9 tiles of clingable wall, in a pink-free room with no updrafts or pogo targets. **This is the last gate that uses clingable walls: from here on, every height gate follows G6.** |
| **Writ lock** | Writ | Sealed | The humming source (a bolt or latch) sits behind a **static grille** more than seize reach (52 px) away. Line of sight passes through the grille, and bodies don't. |
| **Writ grapple** | Writ | Reach | A static chasm at least 25 tiles wide, or at least 12 tiles wide with the far side at least 3 tiles higher, and static render within reach. The anchor hums, and seizing it drops you (a twist on the gate). |
| **Hue and Cry stream** | Hue and Cry | Reach | A static chasm or a static-render shaft longer than the full kit reach (at least 25 tiles flat or 12 high), crossable only along the sound stream. |
| **Standing Count timer** | Standing Count | Sealed by time | The machinery closes or falls in *T* frames, and *T* × kit speed is less than the required distance by at least 25%. Design for the fever-4 Count (10 × 8 f = 80 f of freeze), not the fever-0 one. |
| **Fever lock** | `fever ≥ N` | Sealed (a world door) | A sealed door (G1) with a visible sign, such as the city gate or the Receivership shutters. **Additive** fever gates (a stronger shout) follow the reach rules against the kit you can have when fever N first happens. |
| **One-way shortcut: seize latch** | Seize, from the far side | Sealed | The humming bolt is on the far face of a wall at least 1 tile thick (64 px, more than the 52 px seize reach), with no line of sight from the near side, so Writ can't cheat it later. Once opened it stays open (a save flag). |
| **One-way: drop / chute** | none | Valve | The drop is higher than the kit height at the time you first pass it. It may turn two-way later, which is harmless for a shortcut. If it is a *progression valve*, G6 and G7 apply. |
| **Boss shutter** | the boss flag | Sealed | G1. It opens on repossession or KO. |
| **Machinery** (a lift, updraft or bridge) | the boss flag | Sealed | The lift shaft is sealed until the machine runs (W8). |
| **Secret wall** (a quiet hum) | Seize | Sealed | Hums at 0.5× amplitude and is audible only within 6 tiles. **Secrets hum quietly, never silently**: any breakable must be discoverable by sound. |

**Soft gates** (for pacing, not order): enemies, owner-chase caches, optional mini-bosses. Silksong keeps 17 optional bosses against 12 mandatory ones and makes some of them skippable ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)). BorisTheBrave's distinction between hard and soft requirements is the vocabulary here ([Lock and Key Dungeons](https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons/)).

**Sequence breaks.** We harden the ones we want into supported routes and block the rest. Unlisted breaks fail CI ([Bugnet](https://bugnet.io/blog/bug-tracking-for-metroidvania-games-with-sequence-breaks); Super Metroid's known wall-jump breaks, [Wikitroid](https://metroid.fandom.com/wiki/Sequence_Breaking)).

---

## 4. Vertical slice: the Tally hub plus the Bourse Stairs

**20 rooms (4 hub, 16 Bourse including the optional Flue) plus 4 secret closets**, about 30–40 minutes on a first play (PLAN Phase 5 wants 20–30 minutes of showable play; Phase 3 wants a hub, 3 ability gates, shortcut loops and one intended sequence break).

### 4.1 Shape: a U-bend that the boss closes into a loop

The opening follows Silksong's U-bend, which is linear and tightly paced, with the progression-critical lock "literally just around the corner from the key" ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)). You go **down** through the Cellars, collect the Slip at the **bottom**, and climb **up** the Stairs to the Rostrum. The Auctioneer's repossessed Gavel then drives the **Gavel Lift** back down to the Tally, which closes the U into a loop and opens the next district.

```
row +3                         [B14 Rostrum  ][B15 Lift Head]
row +2  [B12 Bidding Galleries ......][B13]        ‖ Gavel Lift
row +1  [B11 Mezz][B10 Ring][B9 Pit]  [B8          ‖
row  0  [T1 Yard][T2 Cross][T3 Pawn]  [ Shout  ]···[T4 Lift Foot]──▶ Foundry (lift down)
row -1           [B1 Hatch]           [ Shaft  ]        (T3→T4 street runs past the shaft;
row -2           [B2][B3][B4][B5][B6][B7 Ticker Hall][B8a Flue]  you hear the brokers through the wall)
                                           (B8a's vent runs up behind B8 to B13: the Short Sale)
                  └── latch shortcut B6→B1 closes the Cellars ring ──┘
secrets: X1 above T3 · X2 off the upper B8 · X3 behind a grille in B7 · X4 beside B4
```

**Why each shortcut.**
- The **B6→B1 latch** closes the Cellars into a ring, Hollow Knight style. After the Slip you can reach the hub in 2 rooms.
- The **B11→B5 dumbwaiter** links the two middle Corners, so a death on the Stairs doesn't mean re-walking the Cellars.
- The **Gavel Lift** links Rostrum ↔ Tally ↔ Foundry.

### 4.2 Rooms

Purpose key: **T**each, **Te**st, **Co**mbine, **R**eward, **Re**st, **Bo**ss, **S**hortcut, **H**ub. The palette lists every seizable colour in the room, voices included. "p" means pink, which counts as a ladder (G3).

| Id | Room | Size (tiles) | Purpose | Palette / enemies | Contents and beat |
|---|---|---|---|---|---|
| T1 | Evictions Yard | 60×17 | T (move, jab) | none / none | Start: Kid is thrown off a Receiver's cart. Jumps ≤ 3 tiles and a jab crate. The west chimney (12 tiles, clingable, pink-free) is the Ropes gate to Mortgaged Row, visible from the start. |
| T2 | Tally Cross | 30×34 | H, Re | none (fever 1 adds pink chatter crowds) / none | **Cross Corner**. The ticker board, a public ledger board (free Tally map) and the hatch down to B1. |
| T3 | Pawn Row | 60×17 | R (shop) | none / none | Pawnbroker (Chin pieces, ledger pins). The Clock Tenements gate (Writ grille) and the east city gate (fever ≥ 3) are both visible. A quiet-hum wall leads to X1. |
| T4 | Lift Foot | 30×34 | S | none / none | The dead Gavel Lift. Before the boss, it shows a lock glyph for the "Auctioneer's gavel". Below it, a sealed shaft leads to the Foundry. |
| B1 | Hatch Stair | 30×34 | T (seize) | p (the partition) / none | A pink partition seals the stair (a sealed seize wall). At the bottom, the east wall has the **latch door** (the bolt is on B6's side). |
| B2 | Strongroom Walk | 45×23 | T (levy), T (white) | p, white / none | A 6-tile ledge climbed by a forward levy of pink against the wall (teachGate, obsoleteAfter: ropeSkip). A white static strip at **head height** in the corridor teaches `seizeRefused` (novice fix). |
| B3 | Furnace Scales | 50×17 | T (weigh-in) | brown ×2 / none | Lot 7's plate and gate, two routes (slab or heavy). A 3-tile exit step that heavy can't clear. |
| B4 | Kennel Lots | 45×17 | T (combat: open vs guarded, the Catch) | p (Bark) / 2 Barkers | The spawn is on a raised stoop with 120 f of grace (novice fix). A chained Barker's post holds the X4 portcullis (owner-chase, soft). |
| B5 | Cellar Corner | 30×17 | Re, R | none / none | **Cellar Corner**. The Copyist (quill audible from B4 and B6) sells the Bourse ledger. The dumbwaiter's bottom end is dead until B11. |
| B6 | Distraint Store | 40×23 | Te, R, S | brown, violet (Grinder) / 1 Grinder | **Slip** (ring shoes) in a pawn lot, guarded by a Grinder with a wall to stun it against. Seize the latch bolt → the B6→B1 shortcut. |
| B7 | Ticker Hall | 60×17 | T (Slip), Te | violet (Gulls, *leashed east of the pit*) / 2 Stock Gulls | The west entry segment is sound-free and enemy-free, then a **10-tile static pit**. The Gulls' leash volume keeps them from hovering over the pit (G4). A hazard-class slip curtain (2 tiles, sealed ceiling). X3 is visible behind a grille. A side door at the east end leads to B8a. |
| B8 | Shout Shaft | 30×51 | Co (weigh-in twist), T (down-levy) | brown ×2 / none | A floor plate (heavy or slab) opens the shaft foot. The feather-only shout updraft (static render, 10 tiles) leads to B9. **No pink**, so the column's reach gates pass G3: the best kit here is about 10 tiles, using 2 brown recoils. |
| B8a | Short Sale Flue | 30×51 | optional; the break | p (a creaking railing) / none | A side door at B7's east end. A 4-tile pocket holds Poundage, which is what justifies the pink. The **Short Sale** vent sits 12 tiles up. It's a separate room because the bag empties at the door, so its pink can't leak into B8 (W2). |
| B9 | Trading Pit | 40×23 | Co (combat) | p, violet, brown (Barker, Gull, Clerk) / 1 Barker, 1 Gull, 1 Clerk | The Clerk teaches the white Tannoy. Slabs serve as cover. The doors don't lock (soft). The room has no reach exits, because pink is present (G3). |
| B10 | Grindstone Ring | 30×17 | Bo (mini-boss), R | brown, violet / The Grindstone | Mini-boss (§4.5). **Rope Skip** hangs in the ring. The shutter to B11 opens on the flag. |
| B11 | Mezzanine Corner | 30×23 | Re, T (Skip), S | none / none | **Mezzanine Corner**. A 6-tile static-render ledge (the Rope Skip gate, pink-free). Seize the dumbwaiter brake → the B11→B5 shortcut. |
| B12 | Bidding Galleries | 75×23 | Co (skip, slip, carry-back) | brown ×1 (far end) / 2 Gulls | The audit's **put-back room**: carry the brown from the far end (middle weight, so you can still skip) back over two Skip ledges and a Slip gap, and levy it onto the plate beside the door to B13. |
| B13 | Rostrum Corner | 30×17 | Re | none / none | **Rostrum Corner**, 1 room from the boss. The Short Sale vent emerges here (you can drop to B12, but can't go back up the vent). |
| B14 | The Rostrum | 30×17 | Bo | Auctioneer's voices / The Auctioneer | Combat spec §5. The Count on phase 2 is a win, followed by the **Floor Sells** escape (§4.6). |
| B15 | Gavel Lift Head | 30×34 | S, R | none / none | The escape's end. The Gavel Lift down to T4. A sky bridge to the Receivership is sealed (fever ≥ 4, and Hue and Cry). |
| X1 | Pawn Loft | 30×17 | R (secret) | none | A Chin piece. You find it by its quiet hum. |
| X2 | Vault of Voices | 30×17 | R (secret, fever) | none | Poundage and a lore ledger page. It opens at fever 1, when the shout reaches 15 tiles (the pre-fever top is 10, and B8's kit-with-palette max is about 10.5). |
| X3 | Barred Lot | 30×17 | R (secret, later) | none | A "sponsorship" charm behind a grille. The Writ reaches the latch (a come-back signpost). |
| X4 | Kennel Cache | 30×17 | R (soft) | none | Poundage. The owner-chase portcullis. |

### 4.3 Critical path, pacing and teaching

| # | Room | Min (cum.) | Intensity | Ability or verb beat (introduce → test → twist → combine) |
|---|---|---|---|---|
| 1 | T1, T2 | 2 | low | Move, jab |
| 2 | B1 | 3 | low | Seize: **introduce** (sealed wall; lock and key on one screen) |
| 3 | B2 | 5 | low | Levy pink: **introduce**; white static: introduce |
| 4 | B3 | 8 | med | Weigh-in: **introduce** (two routes) |
| 5 | B4 | 11 | high | Seize on enemies: introduce and test |
| 6 | B5 | 12 | rest | Corner and Copyist |
| 7 | B6 | 15 | high | Grinder test; **Slip acquired**; latch shortcut |
| 8 | B7 | 17 | med | Slip: **introduce**, then **test** (the curtain) |
| 9 | B8 | 20 | med | Weigh-in **twist** (heavy for the plate, then feather to ride); down-levy **introduced** by pit geometry that makes a forward throw useless |
| 10 | B9 | 23 | high | **Combine**: combat with all verbs |
| 11 | B10 | 26 | peak | Mini-boss; **Rope Skip acquired** |
| 12 | B11 | 27 | rest | Skip: **introduce**; dumbwaiter shortcut |
| 13 | B12 | 31 | med | **Combine**: skip, slip and carry-back |
| 14 | B13–B14 | 36 | peak | Auctioneer |
| 15 | B14–B15 | 37 | high | The Floor Sells escape; fever goes 0 → 1 |
| 16 | T4, T2 | 38 | low | The lift home. The hub is revalued, and the ledger shows REVALUED stamps. |

Intensity alternates low, medium and high, with a rest before each peak. That is Silksong's "concertina" pacing inside a linear act ([Mark Brown](https://gmtk.substack.com/p/the-world-design-of-hollow-knight)). Every Corner is at most 3 rooms (about 4 minutes) from the next one on the critical path, and each boss door is 1 room from a Corner.

### 4.4 The intended sequence break: "Short Sale" (B8a → B13)

- **The tech.** Use the Flue's pink railing and the Stairwell chain from L3's expression room. Down-levy pink, so a spring anchors under your feet and you recoil. Bounce, then **down-seize the spring you just left**, and repeat, climbing 12 tiles to the vent.
- **What it skips.** B9–B12, including the Grindstone and **Rope Skip**. You can fight the Auctioneer without the double jump.
- **Why it's safe.** From B13 you can drop into B12 and walk back down to B11 and B10, so Rope Skip stays obtainable. The Gavel Lift leads to the Foundry, and the Foundry entry needs Rope Skip (a 6-tile static-render ledge), so the player comes back for it. No softlock.
- **Why it's fair.** The novice playtest found that aims aren't discovered blind, so the break is expert-only, just as Super Metroid's wall-jump breaks were ([Wikitroid](https://metroid.fandom.com/wiki/Sequence_Breaking)). The Grindstone acknowledges it if you arrive late: "you skipped the undercard."
- **Validator.** The bot must find this edge *and no other* unintended edge. The pink lives in its own room, so the break can't leak into B8's gates.

### 4.5 The mini-boss and the boss

**The Grindstone** (B10, mini-boss). An elite Grinder with a third voice, and an arena with 2 plates.
- **Voices:**
  - Growl (brown) drives its Charge.
  - Whet (violet) drives Sparks.
  - Rattle (white, unseizable) drives a floor-spark ring that you have to jump.
- **The Count** repossesses its Growl.
- **Machinery:** its wheel becomes the dumbwaiter's motor. That's why the B11 brake works only after the fight, and it ties the shortcut to the kill.
- **Teaches:** the Catch on a charge, and slab cover.

**The Auctioneer** (B14, district boss). Exactly as combat spec §5 describes. The world-side additions:
- **Machinery:** the repossessed Gavel drives the Gavel Lift (combat spec §8 deferred this to Phase 3). If you win without repossessing the Gavel, the lift still runs from the final Count's repossession.
- **Fever:** 0 → 1 on the win.

### 4.6 The escape: "The Floor Sells" (B14 → B15)

This is Ori's escape pattern: the boss-equivalent set piece that uses only verbs you've already learned, with less room for error and a timer ([Ori Wiki: Ginso Tree](https://oriandtheblindforest.fandom.com/wiki/Ginso_Tree)). Our rules for it:
- It lasts at most 45 s, with a checkpoint every 15 s, because Ori's original restart-from-the-beginning is the part players hated.
- No new mechanic.
- The "SOLD" ghosting wave rises behind you at a speed below the critical path's minimum speed × 0.85.
- It uses pink springs only from lot sources, and no Rope Skip is required, because the break player may not have it.

### 4.7 How fever 1 revalues the slice (the first revisit change)

| Room | Change |
|---|---|
| T2 | Pink chatter crowds appear, so springs are now available in the hub. T2's reach exits are re-validated (it has none). |
| B8 | The shout column extends to 15 tiles, opening X2 |
| B4, B9 | Hot Barkers (furious modifiers become the default) |
| B7 | A third Gull. The ticker board shows 1. |
| B14 | The Rostrum becomes an open trading floor with 2 Gulls, and a return route to B13 |

### 4.8 Machine-readable graph

Grammar for the progression validator:
- **`requires`** is an AND-list of tokens:
  - `ability:<id>`
  - `flag:<id>`
  - `fever>=N`
  - `local:<colour>`: the colour must be in that room's palette; the bot solves it inside the room.
  - `weight:<class>`: reached inside the room.
  - `trick:<id>`: an expert technique; appears only on sanctioned breaks.
- **`hold`** is either `sealed` or `reach`.
- **Every reach edge** must pass G7 (the bot fails it with kit-without-key) unless it has `sanctionedBreak: true`.
- **`dir`** is `both` or `oneway`. **`opens`** names the flag set when the edge is first traversed or activated.

```json
{
  "version": 1,
  "slice": "tally+bourse",
  "units": { "tile": 64 },
  "abilities": ["seize", "levy", "slip", "ropeSkip", "ropes", "writ", "hueAndCry", "standingCount", "satchel"],
  "start": { "room": "T1", "abilities": ["seize", "levy"], "fever": 0 },
  "goals": ["flag:boss:auctioneer", "ability:slip", "ability:ropeSkip"],
  "rooms": [
    { "id": "T1", "name": "Evictions Yard", "district": "tally", "size": [60, 17], "purpose": ["teach"], "palette": [], "enemies": [] },
    { "id": "T2", "name": "Tally Cross", "district": "tally", "size": [30, 34], "purpose": ["hub", "rest"], "corner": true, "palette": [], "enemies": [], "fever": { "1": { "palette": ["pink"] } } },
    { "id": "T3", "name": "Pawn Row", "district": "tally", "size": [60, 17], "purpose": ["reward"], "shop": "pawnbroker", "palette": [], "enemies": [] },
    { "id": "T4", "name": "Lift Foot", "district": "tally", "size": [30, 34], "purpose": ["shortcut"], "palette": [], "enemies": [] },
    { "id": "B1", "name": "Hatch Stair", "district": "bourse", "size": [30, 34], "purpose": ["teach"], "teaches": ["seize"], "palette": ["pink"], "enemies": [] },
    { "id": "B2", "name": "Strongroom Walk", "district": "bourse", "size": [45, 23], "purpose": ["teach"], "teaches": ["levy", "white"], "palette": ["pink", "white"], "enemies": [] },
    { "id": "B3", "name": "Furnace Scales", "district": "bourse", "size": [50, 17], "purpose": ["teach"], "teaches": ["weighIn"], "palette": ["brown", "brown"], "enemies": [] },
    { "id": "B4", "name": "Kennel Lots", "district": "bourse", "size": [45, 17], "purpose": ["teach", "test"], "teaches": ["seizeEnemy", "catch"], "palette": ["pink"], "enemies": ["barker", "barker"] },
    { "id": "B5", "name": "Cellar Corner", "district": "bourse", "size": [30, 17], "purpose": ["rest", "reward"], "corner": true, "copyist": "bourse", "palette": [], "enemies": [] },
    { "id": "B6", "name": "Distraint Store", "district": "bourse", "size": [40, 23], "purpose": ["test", "reward", "shortcut"], "grants": ["ability:slip"], "palette": ["brown", "violet"], "enemies": ["grinder"] },
    { "id": "B7", "name": "Ticker Hall", "district": "bourse", "size": [60, 17], "purpose": ["teach", "test"], "teaches": ["slip"], "palette": ["violet"], "enemies": ["gull", "gull"], "fever": { "1": { "enemies": ["gull", "gull", "gull"] } } },
    { "id": "B8", "name": "Shout Shaft", "district": "bourse", "size": [30, 51], "purpose": ["combine", "teach"], "teaches": ["downLevy"], "palette": ["brown", "brown"], "enemies": [], "fever": { "1": { "updraftTopTiles": 15 } } },
    { "id": "B8a", "name": "Short Sale Flue", "district": "bourse", "size": [30, 51], "purpose": ["reward"], "optional": true, "grants": ["item:poundageCache"], "palette": ["pink"], "enemies": [] },
    { "id": "B9", "name": "Trading Pit", "district": "bourse", "size": [40, 23], "purpose": ["combine"], "palette": ["pink", "violet", "brown", "white"], "enemies": ["barker", "gull", "clerk"] },
    { "id": "B10", "name": "Grindstone Ring", "district": "bourse", "size": [30, 17], "purpose": ["boss", "reward"], "boss": "grindstone", "miniBoss": true, "grants": ["ability:ropeSkip", "flag:boss:grindstone"], "palette": ["brown", "violet", "white"], "enemies": ["grindstone"] },
    { "id": "B11", "name": "Mezzanine Corner", "district": "bourse", "size": [30, 23], "purpose": ["rest", "teach", "shortcut"], "corner": true, "teaches": ["ropeSkip"], "palette": [], "enemies": [] },
    { "id": "B12", "name": "Bidding Galleries", "district": "bourse", "size": [75, 23], "purpose": ["combine"], "palette": ["brown", "violet"], "enemies": ["gull", "gull"] },
    { "id": "B13", "name": "Rostrum Corner", "district": "bourse", "size": [30, 17], "purpose": ["rest"], "corner": true, "palette": [], "enemies": [] },
    { "id": "B14", "name": "The Rostrum", "district": "bourse", "size": [30, 17], "purpose": ["boss"], "boss": "auctioneer", "grants": ["flag:boss:auctioneer", "fever:1"], "palette": ["violet", "brown", "pink"], "enemies": ["auctioneer"] },
    { "id": "B15", "name": "Gavel Lift Head", "district": "bourse", "size": [30, 34], "purpose": ["shortcut", "reward"], "escapeEnd": true, "palette": [], "enemies": [] },
    { "id": "X1", "name": "Pawn Loft", "district": "tally", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:chinPiece"], "palette": [], "enemies": [] },
    { "id": "X2", "name": "Vault of Voices", "district": "bourse", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:poundageCache", "item:ledgerPage"], "palette": [], "enemies": [] },
    { "id": "X3", "name": "Barred Lot", "district": "bourse", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:sponsorship"], "palette": [], "enemies": [] },
    { "id": "X4", "name": "Kennel Cache", "district": "bourse", "size": [30, 17], "purpose": ["reward"], "secret": true, "grants": ["item:poundageCache"], "palette": [], "enemies": [] },
    { "id": "EX_ROW", "name": "to Mortgaged Row", "district": "row", "stub": true },
    { "id": "EX_FOUNDRY", "name": "to the Foundry Gyms", "district": "foundry", "stub": true },
    { "id": "EX_CLOCK", "name": "to the Clock Tenements", "district": "clock", "stub": true },
    { "id": "EX_FLATS", "name": "to the Static Flats", "district": "flats", "stub": true },
    { "id": "EX_RECEIVERSHIP", "name": "to the Receivership", "district": "receivership", "stub": true }
  ],
  "edges": [
    { "id": "e01", "from": "T1", "to": "T2", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e02", "from": "T2", "to": "T3", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e03", "from": "T3", "to": "T4", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e04", "from": "T2", "to": "B1", "dir": "both", "requires": [], "hold": "sealed", "gate": { "type": "hatch" } },
    { "id": "e05", "from": "B1", "to": "B2", "dir": "both", "requires": ["ability:seize", "local:pink"], "hold": "sealed", "gate": { "type": "seizeWall", "colour": "pink", "thicknessTiles": 1, "ceiling": true } },
    { "id": "e06", "from": "B2", "to": "B3", "dir": "both", "requires": ["ability:levy", "local:pink"], "hold": "reach", "teachGate": true, "obsoleteAfter": "ability:ropeSkip", "gate": { "type": "springClimb", "ledgeTiles": 6, "note": "must fail with base kit; reverse direction is a drop" } },
    { "id": "e07", "from": "B3", "to": "B4", "dir": "both", "requires": ["ability:levy", "local:brown"], "hold": "sealed", "gate": { "type": "plateDoor", "pressedBy": ["slab", "heavy"], "exitStepTiles": 3 } },
    { "id": "e08", "from": "B4", "to": "B5", "dir": "both", "requires": [], "hold": "sealed", "gate": null, "soft": "combat" },
    { "id": "e09", "from": "B4", "to": "X4", "dir": "both", "requires": ["ability:levy", "local:pink"], "hold": "sealed", "soft": true, "gate": { "type": "ownerChase", "owner": "barker", "openWhileAwayTiles": 6 } },
    { "id": "e10", "from": "B5", "to": "B6", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e11", "from": "B6", "to": "B1", "dir": "oneway", "requires": ["ability:seize"], "hold": "sealed", "opens": "flag:shortcut:storeLatch", "gate": { "type": "seizeLatch", "boltSide": "B6", "wallTiles": 1, "noLineOfSight": true } },
    { "id": "e11r", "from": "B1", "to": "B6", "dir": "oneway", "requires": ["flag:shortcut:storeLatch"], "hold": "sealed", "gate": { "type": "latchOpen" } },
    { "id": "e12", "from": "B6", "to": "B7", "dir": "both", "requires": ["ability:slip"], "hold": "reach", "gate": { "type": "slipGap", "gapTiles": 10, "floor": "staticPit", "approachPalette": [], "approachEnemies": [], "note": "gap sits in B7's sound-free west segment" } },
    { "id": "e13", "from": "B7", "to": "X3", "dir": "both", "requires": ["ability:writ"], "hold": "sealed", "gate": { "type": "writLock", "grille": true } },
    { "id": "e14", "from": "B7", "to": "B8", "dir": "both", "requires": ["ability:slip"], "hold": "sealed", "gate": { "type": "slipCurtain", "thicknessTiles": 2, "hazardClass": "respawn" } },
    { "id": "e15", "from": "B8", "to": "B9", "dir": "both", "requires": ["local:brown", "weight:heavy", "weight:feather"], "hold": "reach", "gate": { "type": "updraft", "carries": "feather", "heightTiles": 10, "walls": "staticRender", "foot": { "type": "plateDoor", "pressedBy": ["slab", "heavy"] }, "note": "reverse is a drop" } },
    { "id": "e16a", "from": "B7", "to": "B8a", "dir": "both", "requires": [], "hold": "sealed", "gate": null },
    { "id": "e16", "from": "B8a", "to": "B13", "dir": "oneway", "requires": ["ability:levy", "local:pink", "trick:springLadder"], "hold": "reach", "sanctionedBreak": true, "gate": { "type": "shortSaleVent", "heightTiles": 12 } },
    { "id": "e17", "from": "B8", "to": "X2", "dir": "both", "requires": ["fever>=1", "weight:feather"], "hold": "reach", "gate": { "type": "feverUpdraft", "heightTiles": 15, "preFeverTopTiles": 10, "kitMaxWithPaletteTiles": 10.5 } },
    { "id": "e18", "from": "B9", "to": "B10", "dir": "both", "requires": [], "hold": "sealed", "gate": null, "soft": "combat" },
    { "id": "e19", "from": "B10", "to": "B11", "dir": "oneway", "requires": ["flag:boss:grindstone"], "hold": "sealed", "gate": { "type": "bossShutter" } },
    { "id": "e19r", "from": "B11", "to": "B10", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "ringBackDoor", "note": "opens from the Mezzanine side so a Short Sale player can reach the Grindstone" } },
    { "id": "e20", "from": "B11", "to": "B12", "dir": "oneway", "requires": ["ability:ropeSkip"], "hold": "reach", "gate": { "type": "skipLedge", "ledgeTiles": 6, "walls": "staticRender", "roomPalette": [] } },
    { "id": "e20r", "from": "B12", "to": "B11", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "drop" } },
    { "id": "e21", "from": "B11", "to": "B5", "dir": "oneway", "requires": ["ability:seize", "flag:boss:grindstone"], "hold": "sealed", "opens": "flag:shortcut:dumbwaiter", "gate": { "type": "seizeLatch", "boltSide": "B11", "machinery": "grindstoneWheel" } },
    { "id": "e21r", "from": "B5", "to": "B11", "dir": "oneway", "requires": ["flag:shortcut:dumbwaiter"], "hold": "sealed", "gate": { "type": "lift" } },
    { "id": "e22", "from": "B12", "to": "B13", "dir": "both", "requires": ["ability:levy", "ability:ropeSkip", "ability:slip", "local:brown"], "hold": "sealed", "gate": { "type": "plateDoor", "pressedBy": ["slab"], "carryBack": { "sourceAt": "far", "skipLedges": 2, "slipGapTiles": 10 } } },
    { "id": "e23", "from": "B13", "to": "B12", "dir": "oneway", "requires": [], "hold": "sealed", "gate": { "type": "drop", "note": "lets a Short Sale player reach the Grindstone" } },
    { "id": "e24", "from": "B13", "to": "B14", "dir": "both", "requires": [], "hold": "sealed", "gate": { "type": "bossDoor" } },
    { "id": "e25", "from": "B14", "to": "B15", "dir": "oneway", "requires": ["flag:boss:auctioneer"], "hold": "sealed", "gate": { "type": "escape", "maxSeconds": 45, "checkpointEverySeconds": 15 } },
    { "id": "e25r", "from": "B15", "to": "B14", "dir": "oneway", "requires": ["fever>=1"], "hold": "sealed", "gate": { "type": "feverDoor" } },
    { "id": "e26", "from": "B15", "to": "T4", "dir": "both", "requires": ["flag:boss:auctioneer"], "hold": "sealed", "gate": { "type": "machinery", "machine": "gavelLift" } },
    { "id": "e27", "from": "T3", "to": "X1", "dir": "both", "requires": ["ability:seize"], "hold": "sealed", "gate": { "type": "quietHum" } },
    { "id": "e28", "from": "T1", "to": "EX_ROW", "dir": "both", "requires": ["ability:ropes"], "hold": "reach", "gate": { "type": "ropesShaft", "heightTiles": 12, "walls": "clingable", "roomPalette": [] } },
    { "id": "e29", "from": "T4", "to": "EX_FOUNDRY", "dir": "both", "requires": ["flag:boss:auctioneer"], "hold": "sealed", "gate": { "type": "machinery", "machine": "gavelLift", "note": "Foundry entry then needs ropeSkip (6-tile static-render ledge)" } },
    { "id": "e30", "from": "T3", "to": "EX_CLOCK", "dir": "both", "requires": ["ability:writ"], "hold": "sealed", "gate": { "type": "writLock", "grille": true } },
    { "id": "e31", "from": "T3", "to": "EX_FLATS", "dir": "both", "requires": ["fever>=3"], "hold": "sealed", "gate": { "type": "feverDoor", "sign": "city gate" } },
    { "id": "e32", "from": "B15", "to": "EX_RECEIVERSHIP", "dir": "both", "requires": ["fever>=4", "ability:hueAndCry"], "hold": "reach", "gate": { "type": "hueAndCryStream", "chasmTiles": 28, "floor": "staticPit" } }
  ],
  "validator": {
    "checks": [
      "every non-stub room reachable from start",
      "every reachable state can reach a Corner (no softlock), at every fever level",
      "goals reachable",
      "every reach edge fails with kit-without-key (G7) unless sanctionedBreak",
      "exactly the listed sanctioned breaks are found",
      "fever never decreases; a fever change re-validates reach edges in rooms whose palette changed",
      "teachGate edges never guard a grant"
    ]
  }
}
```

---

## 5. Full-game macro plan

**Structure:** a linear U-bend (District 1), then a hub-and-spoke middle (Districts 2 and 3 are gated in order), then an **open middle** where Districts 4 and 5 can be played in either order (Silksong's free-form Act 2), then a linear finale (District 6).

**Target: 5–8 hours** for a first playthrough (PLAN Phase 6), in about 130–150 rooms: 6 districts of 18–25 rooms, plus a hub of about 8. Bosses: 6 district bosses plus 3–5 optional ones (mini-bosses, rematches), inside PLAN's 8–12.

| # | District | Colour / altitude | Mechanic twist | Ability found | District boss → machinery | Fever after |
|---|---|---|---|---|---|---|
| 1 | **The Bourse Stairs** (slice) | pink/violet, high | Shout updrafts, auctions, the first weigh-in | Slip, Rope Skip | **The Auctioneer** → the Gavel Lift (Rostrum ↔ Tally ↔ Foundry) | 1 |
| 2 | **The Foundry Gyms** | brown, bottom | Scales everywhere: gust corridors (heavy only), cracked floors, heavy bags as swinging platforms. Fight heavy or get blown off. | Off the Ropes | **Big Bellows**, a forge-bellows golem whose blasts push you unless you're heavy → a standing **bellows updraft** from the Foundry to the Tally | 2 |
| 3 | **Mortgaged Row** | ghost/pink, low west | The reverse biome: everything is already seized, and you **build** the floors with a levy budget from a few sources. Its high-tension patrol zones are Assessor zones (below). | Writ | **The Absentee Landlord**: nothing but sounds, with no body. You win by getting every voice on record (Probate graft). → the **re-titled bridges** become permanent. Reward: Hue and Cry. | 3 (Margin Call: the east gate opens) |
| 4 | **The Clock Tenements** | violet/pink, high east | Platforms that exist only on the tick. Seize a master clock and the room freezes. Violet object sources arrive here. | Standing Count | **Mainspring**, the pawned master clock → **tick lifts** that keep time permanently | 4 if it is the second of Districts 4 and 5 to fall; otherwise it holds at 3 |
| 5 | **The Static Flats** | white, outside the east wall | Nothing is seizable and the bag leaks. You cross on sounds carried in from the edge rooms. | Corner Satchel | **Old Static**, a signal mast of white noise. It can't be seized, only *fed*: you levy sounds into its maw. → its mast becomes a **Hue and Cry highway** back to the city | 4 (Blow-off Top) if it is the second to fall; otherwise it holds at 3 |
| 6 | **The Receivership** | violet, top | Every mechanic, stacked. The vaults need Satchel combos, Standing Count timers, and Writ plus Hue and Cry chains. | none | **The Receiver** (who holds the belt), then the **Exchange Bell**. Repossessing the bell is **the Crash**. | → 0 (ending) |

**Assessor zones** are the equivalent of Metroid Dread's EMMI zones.
- **What they are.** Door-bounded patrol zones in the Row and the Tenements, where an invulnerable white-static Assessor hunts **by sound**. Seizes, levies and heavy landings draw it to you.
- **The rules we take from Dread** ([Josh Anthony](https://www.joshanthony.info/2021/11/06/examining-the-emmi-zones-of-metroid-dread/)):
  - They are limited in size and placed so that you cross them several times.
  - They mix open halls with tight corridors.
  - Getting caught respawns you at the zone door, not at the last Corner.
  - The zone visibly changes once it's beaten (the static filter lifts).
- **How you beat them.** The Assessor is disarmed for good when that district's boss is repossessed.

**The fever arc over time.**
- **Fever 0**, 0:00–0:40. The Opening Bell. It's warm, and the tempo is slow.
- **Fever 1**, about 0:40. The Bell rings. The hub gets crowded.
- **Fever 2**, about 2:00. Prices climb. The Foundry runs in overdrive, and the Row is re-mortgaged (ghost bridges swap).
- **Fever 3**, about 3:15. The Margin Call. Static creeps into the edges of the Tally, and people flee through the east gate.
- **Fever 4**, about 5:00. The Blow-off Top. Every enemy is hot, the Count is at its fastest, and the Receivership opens.
- **The Crash**, 6:00–7:30. The fever breaks. The epilogue is a quiet city you can walk back through, redistributing what you seized.

**Secrets in three layers**, after Animal Well's design for "three different people" ([Thinky Games](https://thinkygames.com/features/interview-how-animal-well-is-using-secrets-and-mysteries-to-be-a-different-kind-of-metroidvania/)):
1. The critical path.
2. Quiet-hum walls, Chin pieces, ledger pages and fever-revalued vaults.
3. A city-wide meta-secret: the red-ink pitch glyphs across all the district registers spell out the Exchange Bell's tune. Played at the Bell, it opens an optional ending room.

---

## 6. Level design rules for room builders

### 6.1 Metrics

Feather base values; the §3.1 table has the per-kit ones.

| Use | Height (tiles) | Gap (tiles) |
|---|---|---|
| Comfortable, base (critical path) | ≤ 3.5 | ≤ 6 |
| Stretch or test, base | 4.0–4.25 | 6.5–7.3 |
| Heavy class must fail | ≥ 3 (step) | ≥ 5.5 |
| Middle passes, heavy fails | 3 | 5.5–6 |
| Spring (floor) | ≤ 6.5 comfortable, 7 max | about 14 drift |
| Slip era, comfortable | — | ≤ 12 |
| Skip era, comfortable | ≤ 6 | ≤ 11 (≤ 18 with Slip) |
| Recoil hops | brown 2.75, pink 2, violet 1.5 | — |

- **Rooms** are at least 30×17. Boss arenas are exactly 30×17 with the camera locked. Shafts are multiples of 17 tall.
- **Doors and entrances** are at least 2 tiles wide and fill the whole door width. The novice overshot 1-tile door triggers seven times. Doors are on the floor or at a ledge; never make the player jump into one.
- **Corners** are at most 3 rooms apart on the critical path, and 1 room from every boss door.

### 6.2 Safe spacing around enemies

This comes from the combat-spec frame data plus the novice-playtest fixes.

| Enemy | Threat reach | Keep clear of every door, Corner and spawn by |
|---|---|---|
| Barker | Lunge: 4 tiles triggered, about 2.6 tiles of travel | 7 tiles, or a raised stoop |
| Grinder | Charge: 10-tile line of sight, up to 14 tiles of travel, stopped by walls and ledge edges | **Never share a floor lane with a door** unless a ledge edge or wall stops the charge at least 3 tiles short |
| Stock Gull | Dive: about 5 tiles along a locked vector, from 3–4 tiles up | 6 tiles horizontally |
| Clerk | Mortar landing within 90 f; Tannoy ring radius 1.5 tiles | 8 tiles, or out of line of sight |

- **120 frames of attack grace** after entering a room: no enemy may *start* a telegraph. This is a combat-sim request, and it's what fixes the Pit spawn problem.
- **At most 2 attack tokens** (combat spec). Put at most 3 enemies in any single view.
- **A seize fight needs a wall.** Grinders need a wall to stun against, and every arena gives the player a slab-cover spot.

### 6.3 Camera framing

- Put the **lock and its key on one screen** in any room that teaches a lock (Silksong: the lock is "just around the corner" early on).
- **Landing spots must be visible at takeoff.** Keep gaps under about 12 tiles, or add a camera zone or a lit landmark. Ledges more than 7 tiles above the player need a look-up hint or a camera zone, because the vertical view is about 8 tiles.
- **A visible, unreachable reward** (behind a grille, beyond a gap) is the standard signpost to come back later, like X3.

### 6.4 Teaching pattern: introduce → test → twist → combine

1. **Introduce** in safety, with no enemies. One verb only, and failure costs nothing: fall back and retry within 3 s.
2. **Test**: failure costs a pip, or a respawn at safe ground.
3. **Twist** in a new context: under combat, carrying weight, in the air (for example B8's down-levy, where the pit geometry makes a forward throw useless).
4. **Combine** with an older verb.

§4.3 shows the slice's instances. Every ability gets all four steps before its district's boss, and the boss is the final exam, the same role Ori's escapes play.

### 6.5 Readability

- **One material rule, no exceptions.**
  - Humming means solid and seizable, drawn with a vibrating outline in its colour.
  - Dashed means seized (a ghost).
  - White speckle means unclaimable: it can't be seized, clung to or pogoed.
  - Plain masonry can be clung to.
  - Spikes, orbs and enemies are pogo-able.
- **Keys wear their colour.** A plate's lamp is brown. A spring ledge has pink chalk marks. A skip ledge carries the rope glyph. A lock's glyph matches its entry on the ledger.
- **Secrets hum quietly, never silently.** Signpost them by sound, with spatial audio audible within 6 tiles.
- **Signpost aims.** The first down-levy and up-seize must each be the *only* working solution in a safe room. The novice found neither in 28 minutes.
- **Every seize gives feedback**: a whiff or a refusal flash on anything that can't be taken, including guarded enemies. The "open" state must be visible on enemies.
- **Confirm the beats.** A "cleared" flash when a room gate opens. A 20-frame beat on death. Room transitions under 300 ms (PLAN §1).

### 6.6 The builder's checklist, per room

1. List the room's palette, then apply G3 to every reach exit.
2. Mark every gate `sealed` or `reach`, then run the bot with kit-without-key (G7).
3. Make sure no pogo target or spike sits inside a gated span (G4), and that every gate hazard is respawn-class (G5).
4. From Off the Ropes onward, the walls in any height gate are static render (G6).
5. Check the spawn and door spacing (§6.2) and confirm the 120 f attack grace.
6. Every room must be escapable at every fever level.

---

## 7. Requests to other owners (not changed here)

| Owner | Request |
|---|---|
| Movement | Static render tiles (`noCling`, and not pogo-able). A static grille (blocks bodies; passes line of sight, Writs and violet darts). Rope Skip disabled at heavy (W10). An updraft volume that lifts feather only. A gust volume (≥ 14 px/f; heavy is immune). |
| Combat | 120 f of room-entry attack grace. A decision on whether levied objects are pogo targets (this doc assumes they are). Grindstone data (a third, white voice). |
| Tools | The progression validator reads the §4.8 JSON. The bot gains per-room palette and kit-without-key runs (G7) and the sanctioned-break whitelist. |
| Save | `world.fever` (0–4, monotone), shortcut flags, ledger state (walked, seen, bought, red ink). |

## Sources

- Mark Brown, "The World Design of Hollow Knight: Silksong" (U-bend, concertina, acts, Shakra and benches, the Infected Crossroads, "go somewhere else", optional bosses, secret walls): https://gmtk.substack.com/p/the-world-design-of-hollow-knight
- Mark Brown, Boss Keys (lock-and-key diagrams): https://www.youtube.com/playlist?list=PLc38fcMFcV_ul4D6OChdWhsNsYY3NA5B2; the Metroid Dread episode discussion (guidance, doors that funnel you forward): https://famiboards.com/threads/mark-brown-presents-metroid-dread-boss-keys-or-why-you-didnt-get-lost-in-metroid-dread.730/
- BorisTheBrave, "Lock and Key Dungeons" (hard and soft requirements, key types): https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons/
- Hollow Knight, Forgotten Crossroads as a hub: https://hollowknight.wiki.fextralife.com/Forgotten+Crossroads; Cornifer (you hear his humming, and papers lead to him): https://hollowknight.fandom.com/wiki/Cornifer
- Metroid Dread EMMI zones: https://www.joshanthony.info/2021/11/06/examining-the-emmi-zones-of-metroid-dread/ and https://metroid.nintendo.com/news/metroid-dread-report-vol-2/
- Ori and the Blind Forest, the Ginso Tree escape: https://oriandtheblindforest.fandom.com/wiki/Ginso_Tree
- Animal Well's three layers (Billy Basso): https://thinkygames.com/features/interview-how-animal-well-is-using-secrets-and-mysteries-to-be-a-different-kind-of-metroidvania/
- Sequence breaking: https://metroid.fandom.com/wiki/Sequence_Breaking and https://bugnet.io/blog/bug-tracking-for-metroidvania-games-with-sequence-breaks
- Internal: `docs/reports/L3-audit.md` (the gate bypass), `docs/reports/L3-novice-playtest.md` (aims, the Pit spawn, doors, feedback), `memory/signature-mechanic.md` (the mid-air spring and the re-seize chain).
