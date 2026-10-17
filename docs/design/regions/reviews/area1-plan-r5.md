# Wood area 1, round 5: the depth pass (the director's plan)

2026-10-18.

**The evidence.**
- `area1-video-r3.md` (c16099a; build 10b5cc9): "from the vista to the crown it reads as one journey", with about
  ten good beats in 17–20 minutes, "close to Sunken Glades / King's Pass in shape and staging, clearly below in
  depth".
- `area1-firsttimer-r5.md`: a first-timer finished the area with 0 deaths, called it "mostly one journey", and
  **would keep playing**.

**What this round is for.** The shape is right, so this is the **depth pass**. It covers a real boss, a little more
to fight, a second reward that is felt, a world with one more crossing in it, and one thing Tatter does.

**The rules.**
- Cohesion first.
- No sunk cost.
- Every reference game is the reference.
- Lean: every addition below is the smallest one that gives the depth, and §7 lists what we refuse.

**The one idea that ties this round together:**
- **The dead go somewhere.** Moths die at the lamps, and carriers take the bodies down into the roots. In the dark
  under the oak, the old beetle has grown huge on them, sealed in by the oak's floor.
- So her fight with it is what breaks the floor and lets the moon in, and the claws come from that moonlight.
- That chain links the new creature, the descent, the boss and the ability into one piece of ecology the player can
  watch.

---

## 1. The old burrback as a real first-area boss

### What's wrong
- **The video:** winners take 13–18 s with 0–1 hits. Two runs stalemated for 249 s and 426 s on the escape ledge.
- **The first-timer:** six identical cycles, "a bit long and samey", "no fanfare when it died". The claws are a
  separate pickup steps later.
- **The references:** False Knight has phases, arena destruction and a reveal. Baichung's arena is preceded by a
  rehearsal.

### The redesign: "the beetle under the oak"

**The arena moves under the oak.**
- **Where:** the den is directly beneath the oak's floor, so its ceiling *is* the root mesh and the earth plug
  around the trunk's foot. Glade 2 stops being a separate room behind a gate: **the den is the glade, once the plug
  falls.**
- **What it does to the descent:** the root stair runs east → west under R9 and R8 and ends at the den.
- **The set-up from above:**
  - From the oak's floor, the mesh no longer shows moonlight from below.
  - It shows the dark, and something big breathing (a slow rise and fall of shadow, and dust sifting through the
    mesh).
  - The moon column lands on P3 and stops at the floor.
- **The size:** ~1600 px wide, so the camera can frame it at a zoom where the beetle is ≥ 2.5× her height.
- **The props:**
  - **the taproot**, a thick root column from the den's ceiling to its floor, ~⅓ from the east wall;
  - **W-den**, a wick the firefly hung even here, high under the plug and reachable only by being caught;
  - the floor is a carpet of pale wing chevrons.

**Three phases**, ~90 s for a first-timer who wins first try (target 45–120 s):

| Phase | It does | She does | What's new |
|---|---|---|---|
| **1. The beetle rule** (100–60% hp, ~30–40 s) | Brace, ram, wall stun, belly-up: the rule taught in R4 (§6), now at boss size. **Anti-camp:** if she stays on a ledge or the taproot's knot for > 3 s, it rears and **slams**. A shockwave runs along the floor and up the walls and shakes her off any ledge it reaches | Bait the ram into a wall; 3 cuts on the belly. The pogo on its braced back is bonus damage | The slam |
| **Transition** (at 60%) | A huge slam. The whole oak shakes, dust pours through the mesh, the plug cracks and one thin blade of moonlight enters the den. It curls into a ball | Watch (a 1.5 s beat; input stays live) | The first light in the dark |
| **2. The roll** (60–25%, ~30–40 s) | It rolls: a shell ball crossing the den, bouncing off walls, speeding up each crossing. Cuts spark off it | **Get caught at W-den and throw herself down onto it.** A thrown body or a throw-cut (§2) knocks it out of the roll, belly-up, for 3 cuts. A plain pogo on the rolling shell does the same for the skilled. Jumping it is safe but doesn't end the phase | The lamp's throw as a weapon: the trap becomes the answer |
| **3. The taproot** (25–0%, ~20 s) | Desperate: no brace, three rams in a row at her, fast | Stand in front of the taproot and dodge. **Its ram into the taproot** stuns it longest, and cracks the plug further each time. Two taproot hits → it lies belly-up under the widening light → her last cut | The rule she learned (bait it into a wall) aimed at a new target |

**The death and the reveal (staged).**
1. On the last cut it doesn't burst. It **lies down** in the moonlight. Then the plug falls in pieces round it, and
   the whole moon column pours down the trunk into the den.
2. In the light the player sees what the dark hid:
   - the den's walls are layered with moth wings, generations of them;
   - the beetle is old and pale, eyeless, and blind all along.
3. The light lands on her: the bask. **"Your claws have hardened. Jump at a wall to climb."** It happens where the
   boss died, in the light the fight let in.
4. The way out is straight up the column, through the broken plug, into the oak.

This is HK's "the armour is a lie and the floor breaks", in our own language: the dark was its home, the moon is her
power, and she let it in.

**Re-form and retries.**
- A fade re-forms her at P-den at the den's door (the stair's foot), ~5 s from the fight, with the creature healed.
- On a retry the transition beat is skipped (phase 1 resumes at full speed).

**Targets.**
- Winners take 45–120 s.
- Casual first try: survive ≥ 45 s; ≤ 4 fades to win.
- No stalemate over 10 s anywhere in the den.
- Skilled: 40–70 s.

**What has to be built:**
- **Sim / creatures:**
  - the old burrback on the boss phase table (it exists, built for the Weaver);
  - `slam` (a floor and wall shockwave);
  - `roll` (a shell ball with wall bounces, immune to cuts, ended by a stomp or a thrown hit);
  - the anti-camp rule;
  - two taproot-hit events.
- **Level:** the den under the oak; the plug as a flag-cleared solid (its death `sets`, which exists); the glade
  activated by the flag.
- **Staging:** the shake, the dust, the blade of light, the plug's fall, the wing walls, the bask.
- **Camera:** the den framed close.

---

## 2. Creature depth: one new kind, one new blade use, better compositions

### What's wrong
- The video counts 3 predators and 2 beetle rows, against HK's 8–10 by False Knight.
- Fights are mostly snuffed away.
- The blade has no development beyond the pogo ("hitting things is mostly sparks").

### What we add, and no more

**1. The carriers (ants), the one new kind.**
- **The biology:** scavengers. Ants carry dead insects home, and moths dead under a light are a feast. A line of
  ants walks a fixed trail from the pool under a lamp to a crack in the floor, each carrying a pale wing.
- **What they do:**
  - They don't hunt her. They bite on contact and turn to bite if she stands on their trail.
  - 1 hp each, a burst on death.
  - **When their lamp goes out they finish their trip and stop coming.**
- **What they do to a room:**
  - **They make lit floors busy** (HK's fodder in every other room) without adding a new threat.
  - **Their trails are signposts.** A trail always leads somewhere: into a bark crack (a pocket, a find), down a root
    hole (the way to the roots), or into the nest.
  - **They link the ecology to act 3.** Every trail in the area runs down to the carriers' nest in the roots, which
    the descent passes through (§4). The nest is where the old beetle feeds.
- **Where:**
  - R6 (under W6, trail into the floor pocket);
  - R8 (between the hummocks, trail into the hollow's bark);
  - R9 (under the composition, trail down to the bark floor, the way on);
  - the oak's floor (a short trail into the trunk-foot hollow, §5);
  - the roots (the nest, where the trails end).
  - Never in R3–R5, the teaching rooms.
- **Cost:** a crawler row (6 legs, small), a trail on `paths.ts` (built for swings and drifters), a carried-wing
  prop, and disperse-on-snuff (exists).

**2. The throw-cut, a new use of the blade.**
- **The rule:** a cut swung *during a throw's launch* (`player.thrown`, the first 20 frames after beating free) is a
  heavy cut: it does 3× damage and breaks a brace.
- **What it does:**
  - flips a braced beetle from the front;
  - knocks the rolling old burrback out of its roll;
  - knocks a hawker out of its dive (and it flees);
  - cuts a dangler's silk so it falls and is stunned.
- **Why it's the right development:** the throw is the area's best verb and the blade is its oldest. Combining them
  is the depth, with no new button, and it turns "a lamp hung over a beetle" (the first-timer's complaint) from a
  trap into an attack.
- **Taught:**
  - **R6 at T4.** W6 hangs so its throw line runs straight at the landing's beetle. Caught and thrown at it, any
    cut lands as a heavy cut: the beetle flips, belly-up.
  - The consequence states the rule (a big crack, a long hitstop, the beetle on its back).
  - From then on every lamp near a creature is a weapon.
- **Cost:** a flag on the slash while `thrown` (damage and `breaksBrace`), and a heavier hit render.

**3. Compositions that use them** (no new kinds):

| Room | Composition |
|---|---|
| R6 | The beetle at T4 + W6 (the throw-cut's teach) + carriers under W6 |
| R8 | The hawker's rhythm + carriers between the hummocks (a busy floor under a hunter) |
| R9 | A beetle on the floor, a dangler over the cut spot, carriers on the trail to the bark floor. The answer: snuff, or throw-cut the beetle from the dangler's wick |
| The descent | Danglers over the nest's lit landings; carriers in the nest |
| The den | The old burrback, W-den (the throw), the taproot |

**Counts:** 4 kinds (beetle, dangler, hawker, carriers), 2 beetle rows (juvenile, old), the boss, and one new blade
use. That is still below HK's 8–10. It sits at Ori's first-hour count (3–5) and above it in what the creatures do
with the signature verb, which is where our density lives.

---

## 3. A second reward kind that is felt in area 1, and finds that are signposted

### What's wrong
- One currency (moths) that buys nothing visible inside the area.
- One upgrade (quick wings).
- The health milestone falls outside the area.
- No run lingered at a secret.
- The first-timer: "I don't know what they buy me."

### The calls

**1. Moonlit hollows become area 1's second reward kind: three of them, one per act.** They already exist (core §6),
each one a tuning number.

| Act | Hollow | Where | What it pays, at once |
|---|---|---|---|
| Act 1 | **Keen blade** (+20 px snuff reach) | R4, behind the door's bark pocket (trailless; moonlight leaks through its cracks) | The high wicks she couldn't reach in R3 and R4 (the first-timer's 0:50 question) come into reach on the way back, and the snuff is easier everywhere after |
| Act 2 | **Quick wings** (beat free in 2) | R8, as built; the carriers' trail leads to it | R8's own timing and the stair |
| The oak | **Night eyes** (the map shows each room's unseen lamps) | The trunk-foot hollow, which Tatter leads her into (§5) | Every find in the area becomes a dot she can hunt |

**2. The first health milestone moves to 60 moths, before the pit.**
- The critical path's lamps before the den hold ~55–65 moths, so a player who snuffs most of what she passes, plus
  one or two finds, crosses 60 before the boss.
- A rusher may not.
- That is the reward: **the finds pay for the boss.**
- The rest of core's milestones are unchanged; this re-sets the first one from 110.

**3. The HUD shows what moths buy.**
- The moth count gets a small mark at the next milestone: "40 / 60", with a tick at 60.
- When it fills: the +1 light, a held half-second, and her lights growing by one.
- This uses the existing count and the existing max-health path.

**4. Signposting, in four tells used consistently:**
- **Carriers' trails** lead to pockets and holes.
- **Moonlight leaking** through cracks means a hollow behind.
- **Stragglers circling a crack** mean a lamp behind.
- **Cracks on every cut** (3529da4) answer "yes, this breaks".

A first-timer should be able to say "ants go somewhere" and "light behind cracks" by the oak.

---

## 4. The world as more of a web

### What's wrong
"A line with one loop under the oak, one shortcut (the mesh), and doors that open in order. No room offers a
meaningful choice of where to go next."

### Two crossings, both physical, both along the roots

**1. The nest (the descent becomes a place).**
- The root stair from R9's bark floor no longer just drops. It passes through **the carriers' nest**: a wide, low
  root hall where every trail in the area ends, piled with wings, lit by two pocket wicks with danglers over their
  landings.
- From the nest, three ways:
  1. **west**, down to the den (the critical path);
  2. **up a root shaft west** toward R6 and R5 (claws: §4.2);
  3. **back up east** (the stair, one-way down until the claws).
- **The window** onto the sleeping beetle is in the nest's west wall, held ≥ 3 s.
- This adds a minute of "somewhere" to act 3, with ~1:30–2:00 from R9's floor to the den door.

**2. The west root road (claws), a loop.**
- From the nest, a root shaft climbs west under the floor and comes up through **R5's glade floor** (a bark floor
  panel she sees from above in act 1, with carriers vanishing into it: a lock seen at 5:00).
- With the claws it is the way back west:
  - nest → R5 → R5's east trunk and hollow → R4's high wick, R3's high wick (the claws' first locks);
  - or R5 → R6's return bough → the oak.
- The return west becomes a loop through new ground, not a walk back. It also reaches the act-1 hollow's keen-blade
  payoff (the high wicks).

The world then has three crossings between floor and roots: R5 west, the oak in the middle, R9 east. The player can
draw it: two layers, a tree in the middle, and the dead carried down. HK's Crossroads is a web of one level; ours is
a web of two.

**Not added:** a third loop, fast travel, a second hub. The oak is the only centre.

---

## 5. Tatter's role in play: one beat that changes something

### What's wrong
Tatter walks, looks up and climbs, "but never *does* anything that changes the play". At the crown the first-timer
"wanted one beat. Without it the ending reads as 'your moths left you'".

### The beats

**1. The oak's floor: Tatter shows her the way into the dark.**
- After the glimpse and the look-up, Tatter walks to the trunk's foot and squeezes into a crack she hadn't noticed.
  Carriers go in there too.
- Behind the bark (3 cuts, with cracks) is a small hollow inside the trunk's base:
  - a wick with three stragglers, which she snuffs, and the moths spiral up the whole trunk in frame (the oak's
    first snuff);
  - the **night eyes** hollow;
  - Tatter sitting in its moonlight.
- **It changes the play:** an upgrade, and a lesson ("Tatter knows the dark ways"), so when Tatter later walks into
  R8's tunnel mouth, the player reads it.
- **It fixes the oak's first visit** (video #5): ~30–40 s lived, not 15 s held. The east arch opens when she comes
  back out.

**2. The crown: its one look.**
- As the cloud lifts, Tatter opens its wings, the whole one and the torn one. It tries one beat of flight and
  lands, then turns and looks at her.
- She folds her wings too (the rest pose).
- When the camera releases, **Tatter walks ahead of her onto the canopy road east**, leading area 2.
- The ending then reads as "we go on together, on foot", not "they left me".
- Render poses only (Wing's rig re-paletted): wings open, a hop, a look, a walk.

Not added: Tatter fighting, carrying, talking, or opening gates mid-fight. It stays a presence with one act of help.

---

## 6. The reviews' specific fixes, with owners

Owners:
- **level:** room JSON and geometry;
- **creatures:** creature sim and tuning;
- **lures:** the lamp sim and arc;
- **camera:** follow, zones, holds;
- **staging:** greybox set pieces;
- **render:** greybox draw and the HUD;
- **sim:** world rules and player.

| # | Problem (source) | Fix | Owners |
|---|---|---|---|
| a | **A death re-forms her a room back** (video #2) | Every critical-path room re-forms her in that room: R8 at the near ramp, R9 at its west door, the den at P-den. "The last patch" applies only to a patch in the same room | sim, level |
| b | **R8 lethal for the impatient; hit while helpless** (video #3; ft5 #3, #5) | **The hawker never starts a dive while she is caught.** It dives through the orbit on its rhythm, with the reticle on the orbit for ≥ 30 f before a pass, visible from the ramp. Caught during a pass, she is struck **out of the pull, down to the ramp**, with 2 s of no re-catch, and never 2 strikes in one pass. Struck = 1 pip | creatures, lures |
| c | **The throw's aim found by accident at the stair** (ft5 #1) | R4's gap: the far ledge is *high*, so holding right alone falls short and **up-right** is needed; the arc shows it. On the first catch of the game, the aim glyph ("hold a direction") shows once beside the arc. R6's chain then asks for two different aims | level, render |
| d | **The beetle rule clicks only at the boss** (ft5 #2) | R4's adult rams at her on the root step and **hits the step's face: wall stun, belly-up, green**. It happens by itself the first time she stands there, so she sees the belly before she has to use it. Then she gets 3 cuts, or snuffs W3. No adult sits under a lamp before that lesson | level, creatures |
| e | **The stair is unkind** (ft5 #3) | The first gap is glideable (the lamp is the better line, not the only one). The glide tug ×0.6 → ×0.45 on a passing glide. **No dangler over a fall-return point** (it never drops within 2 s of a return). The nest (§4.1) replaces the bare drops | level, lures, creatures |
| f | **The descent is under a minute** (video #4) | §4.1: the nest. The pogo-wick over a pit with no ledge under it | level |
| g | **Held moments read as freezes** (ft5 #4; no letterbox per our rules) | Four signals together: **the HUD fades out** for a held beat and back in at the end; **she acts**: her rig turns and lifts its head to look at what the camera shows; **the camera always moves** during a hold, so it is never a still frame; **holds stay ≤ 4 s**, except the crown | staging, render, camera |
| h | **The boss's death gives nothing** (ft5 #4) | §1: the claws from the moonlight its death lets in | level, staging |
| i | **Tatter needs one beat** (ft5 #4; video §7.5) | §5 | staging, level |
| j | **R9's beetle and R6's gap-2 thorns cost more than the peaks** (video #8) | R9: the beetle's patrol stops 200 px short of the landing ("land, then snuff"). R6 gap 2: a lower step under the far lip, so a short glide lands on it instead of in the thorns | level |
| k | **The oak's first visit is held, not lived** (video #5) | §5.1: the trunk-foot hollow | staging, level |
| l | **Tiny steps stop a walk** (ft5) | Step up any ledge ≤ 24 px while walking (Celeste and HK do) | sim |
| m | **The oak/roots seam bounces** (ft5) | The seam needs hysteresis: an exit fires only once her box is 64 px past it, and a re-entry within 20 f doesn't fade. With the den under the oak, the climb-out is the column itself (one seam, crossed once) | sim, level |
| n | **Nothing made me careful; 0 deaths** (ft5 §5) | Not a fix by itself. With a real boss and the slam, deaths should cluster in the den (C9). Don't make the teaching harder | (creatures, via §1) |

---

## 7. What *not* to add (easy path, same fun)

- **No currency, shops, charms or a charm menu.** The hollows do HK's charm job as tuning numbers (core §6).
- **No dialogue for Tatter or anyone,** and no letterbox. The world tells it (pillar 5).
- **No more than one new creature kind in area 1.**
  - Toads, bats, jumping spiders, weta and glow-worms stay in their regions.
  - The lantern, bounce caps and the web stay in area 2.
- **No second boss or mini-boss in area 1,** and no Weaver rehearsal beyond the danglers.
- **No new lamp kinds, no new ability, no new button.** The throw-cut is a cut at a moment, not an input.
- **No more than three hollows in area 1.**
- **No fast travel, no second hub, no extra loops** beyond the nest and the west road.
- **No new rig families.** The carriers are a crawler row; the old burrback's roll is its own shell, curled.
- **No difficulty added to the first five minutes.** Depth arrives from R6 on.
- **No padding for minutes.** If the area lands at ~25–30 min for a person with these, that is right.

---

## The plan, ranked (work order)

| # | Item | Owners |
|---|---|---|
| **1** | **The old burrback as a three-phase boss under the oak** (rule → roll → taproot), with the anti-camp slam, the staged death that lets the moon in, and **the claws in its light** (glade 2 merged into the den). 45–120 s, no stalemates | creatures, sim, level, staging, camera |
| **2** | **The throw-cut**: a cut during a throw's launch is heavy (breaks a brace, ends the roll, knocks a hawker off, cuts silk). Taught at R6's T4 | sim, creatures, render |
| **3** | **The teaching fixes**: the aim needed and shown at R4's gap (up-right, a glyph on the first catch); the beetle rule shown by itself at R4's step (it rams the step and flips) | level, render, creatures |
| **4** | **The carriers**, the one new kind: a scavenger trail under lamps, signposts to finds and holes, ending in **the nest**, which makes the descent a place (≥ 1:30) with the window in its wall | creatures, level, render, staging |
| **5** | **Fair deaths and catches**: re-form in the same room; R8's hawker strikes only on its telegraphed pass, knocks her out of the pull with 2 s grace, never twice a pass; no dangler over a fall return | sim, level, creatures, lures |
| **6** | **The second reward kind**: three moonlit hollows (keen blade R4, quick wings R8, night eyes in the oak's foot); the first health milestone at 60 moths, before the den; the HUD shows "x / 60" | level, sim (tuning), render; core.md §6 |
| **7** | **Tatter's beat in the oak**: it leads her into the trunk-foot hollow (the oak's first snuff spirals up the trunk in frame; night eyes). The oak's first visit is lived, ~30–40 s | staging, level |
| **8** | **The west root road**: from the nest up through R5's glade floor (claws), a loop back west to the high-wick locks | level |
| **9** | **Held beats read as scenes** (HUD fades, she looks, the camera always moving, ≤ 4 s), and **Tatter's crown beat** (its wings, a hop, a look, then it walks ahead onto the canopy road) | staging, render, camera |
| **10** | **Feel and level fixes**: a kinder stair (the first gap glideable, the glide tug ×0.45), tiny step-ups, seam hysteresis, R9's beetle short of the landing, R6 gap 2's lower step | level, sim, lures |

**Order of work:**
- **First 1, 2 and 3.** They are one lesson chain: the rule seen in R4, the throw-cut in R6, both tested by the boss.
- **Then 4 and 8,** the roots as a place and a web.
- **Then 5, 6 and 7.**
- **Then 9 and 10.**

After each block, run the human-like video and the first-timer agent.

**What the next review should answer:**
1. Is the den the peak, in time (45–120 s), deaths and memory?
2. Does a player say "the ants go somewhere", and did anyone follow a trail on purpose?
3. Did the first-timer use a throw-cut without being told, after R6?
4. Did anyone cross 60 moths before the den, and notice the +1?
5. Does the crown read as "we go on together"?
6. Was the area still one journey with all of this in it?
