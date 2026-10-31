# The Canopy, review round 10 (2026-10-31)

Reviewer brief: judge the Canopy v10 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`) against the
first areas of Hollow Knight, Silksong, Ori and Nine Sols. It covers 2543fbe..3b30f8e and the deployed snapshot 8e55b4a
(canopy-play, the same as live). Round 10 was built to answer round 9's step back: no story happens in play. Score it,
say what changed, write the round-11 spec, and step back again.

Sources:
- the docs: `first-area.md` (v10), `memory/canopy.md` ("The premise"), `memory/canopy-render.md` (round 10),
  `art-direction.md`, `memory/story.md`, `canopy-r9.md`, the reference README and the four `EXTRACTED.md`, and Matt's
  notes (bland, monotone, over-signposted; density of choice; paths, not places; story told by the world);
- **Wing played live on the GPU** as a first-timer from the cocoon: a scratch Playwright page over `window.__game`
  (`launch({gpu: true})`, prompts on), driven in 1-4 s bursts of the input DSL, a screenshot after each, frames every
  6-30 frames at the moments. I knew the keys only from the prompts, and went where the screen pulled me;
- 30 wide shots (`npm run shots --only=wide --pickups`) of the hub, well, tunnel and den at 16:9, one live frame of
  the warning at 21:9;
- `canopy-furniture.ts --check --rooms --route` on 8e55b4a (`round 9's bar met`);
- the builder's boss clip `clips/canopy-r10-den-boss.mp4` (the average bot's win), cut into frames.

**Is there a first-timer mode?** `npm run firsttimer` exists (a sub-agent plays with real keys in bursts and keeps a
journal), but it boots the game world (`wood-hatch`): it has no `--world`, so it cannot play the Canopy. I used my own
GPU page instead.

What I could not do:
- **Play with hands.** Bursts of scripted keys find what the screen shows and what breaks, not whether it's fun.
- **Win the fights.** My reactive script faded in the trunk (thorns and a juvenile, walking blind), in the well's
  ambush (again) and stalled in the den's warning (beat 2 walked about and never engaged; lampwing 1 kept diving). I
  did not fight the boss. I judge the boss from the bot's clip and the room's data. The bots' 12 of 12 wins are not the bar.
- **Hear it.** Audio ships muted.

Where I teleported (after the first fling and the hub, to save time): to the well, the Grove, the gap, the tunnel's
hump and the den. Coordinates are room-local px.

## The short version

**7.5 / 10.** It's the first rise since round 8, and it comes from things no measure saw:
- **The first fling now teaches itself.** I jumped at the lamp without pressing anything. She drifted by the flame
  for most of 100 frames, the V cap stood at full strength the whole time, she sailed past and was caught. Next try
  I pressed V and let go: up-right, onto the far limb. I needed no docs, and no wrong cap showed.
- **The premise has a verb and a number.** Cut a caged lamp three times and it's out for good: 30 moths, a number on
  the HUD, a roost of pale moths on the hub's claw face. At 60 the game said "A new light kindles" and gave her a
  fifth lantern. Freeing moths makes her stronger, and that is a real loop.
- **The map is the game's own.** It is an inked bark sheet with "The Canopy" on it, carved air and no ids.
- **A fade in the warning puts her back on its floor** (the `p-warn` mark on the glide's landing).

But **none of the premise lands as a moment**, and the area's climax isn't about it:
- **The release** is a normal hit's spark, then ~30 pale flecks drifting round her for 3 s. There's no hitstop
  beyond the cut's, no camera move and no sound. The empty cage hangs. My eye was on the beetles.
- **I could miss all three traps or free them by accident.** From the hub's drop, holding right took me east to the
  fork's claw face and down into the cellar. The hub's cage is 1,800 px west, out of frame from the landing. I freed
  the warning's trap by accident while up-cutting a lampwing under it.
- **The firefly** is a green glow on a thread that crosses the gap in 5 s. All three lamps were lit when I got there
  (I hadn't flung them), so it relit nothing, and it showed nothing of who hangs the lights.
- **The boss is a beetle with nothing to do with lamps or moths.** In the clip, its defeat opens a gate and the den
  goes dim. There's no cage, no freed cloud, no reward and no view. The area ends on its least premise-bearing
  fight.

The gate hasn't changed: **Matt plays from the hatch.** The minute-one blocker that round 9 found is gone, so he
can now.

## What got better, and what didn't

**Better (keep):**
- **The lesson** (#1 of r9): the drift (`lessonK`), a full-strength cap from the first frame, no glide cap without
  the glide, the default up-right aim. It's as kind as Ori's first Bash and costs no text.
- **Two kinds of lamp you can tell apart:** a cage of fine gold bars with dark moths spiralling in, against a bare
  hung lantern. The cage reads at play zoom in the hub, the Grove and the warning.
- **Moths buy light.** The count's first milestone (60) adds a lantern, which gives the count a reason to exist.
- **Freed is saved and shown:** after a reload, the warning's cage hangs empty and outlined. The hub's roost is a
  bright cluster of pale moths on the claw face, a change you can see on every crossing.
- **The map** (r9 #4): a drawn sheet that unrolls, the region's name, freed traps as cool rings.
- **The Grove's pit with its cage:** I cut the trap mid-wave, between the beetles. It's the density of choice Matt
  asked for: fight, or spend three jumps freeing moths while two beetles turn on you.
- **The glide past the hawker:** it struck at f 9,629 and she glided again and landed on the warning's floor.
- **The well**: teal, quiet, a lit door two jumps from the hollow. The bottom's walls lost most of their disc chains.
- **Lime moss** tamed to tufts. **The moon** is now at the vistas (the hatch, the hub's clearing), not everywhere.

**Not better:**
- **No person has played it.** It's still round 9's gate, though now nothing blocks it.
- **The premise as staging:** the release, the firefly and the boss (above).
- **The traps' placement:** off the walked line, or inside a fight's swing line.
- **The den look:** a flat umber card with translucent arcs and ovals. The warning's floor carries two big root hoops
  (read as croquet hoops: the sim's knuckles are gone, the picture's are not). The boss arena's shelves stand on
  X-braced stands, like trestle tables. At 21:9 from the floor's middle, the den's mouth sits on the frame's right
  edge.
- **Boxes left:** the hub's high block under the gap is a box with a dark panel and a knob edge, a straight black band
  runs along the room's top there, and the well's amber-striped post is still by the east wall.
- **The HUD's "30 / 60"** reads as 30 of 60 moths. It's the next health milestone, and after 60 it jumps to "/ 350".
- **Text lines linger:** "Your claws have hardened..." and "A new light kindles." stay up ~5 s, over the ambush and
  over the wave.
- **`juv-pile`'s turn loop** (every 25 frames while she's 1,700 px off) is still there from r8.

## Since round 9, fix by fix

| r9 # | fix | v10 | status |
|---|---|---|---|
| 1 | the first fling's lesson | drift `lessonK`, held press, up-right aim; cap full from frame 1, ability-gated | **done.** Played blind: in reach and capped for most of a ~100-frame drift; the second try flung clean. |
| 2 | the premise as play | 3 traps (30/30/40), saved, counted, roosts, firefly's pass, springboards relight | **done as systems, weak as moments.** Release small and silent; traps missable or freed by accident; firefly relit nothing on my route. |
| 3 | retries before the hard part | `p-warn` mark, arena thorn returns | **done.** `patchMark:p-warn` on the glide's landing. |
| 4 | a drawn map | bark sheet, carved air, no ids, unroll | **done.** Rooms read as large flat washes, but it's the game's map now. |
| 5 | hollows as pockets | `hollowCavities`, no knob chains, plain runs on tall faces | **mostly.** The well's bottom and the hub's under-floor are fixed; the hub's high block is still a framed box. |
| 6 | the warning as an arena | 1,024 floor, mouth arch, zoom 1.1, den banks, beetles 1.22x | **half.** The floor is long. On screen: two root hoops on it, the mouth at the frame's edge, a flat card behind. |
| 7 | the boss as payoff | beatable (bots 12/12, 55-109 s), `p-den`, shells and scrapes | **beatable, not a payoff.** No premise in it, nothing on defeat. The tunnel's "shell" reads as a glass dome. |
| 8 | moon at vistas, moss tamed | `moonShown`, lime 0.6x chroma, tufts | **done.** |
| 9 | a hub that changes | roosts, the station on a pass | **done.** The roost is the hub's best new thing. The landing still shows nothing. |
| 10 | the human run | none | **not done.** `firsttimer` can't load the Canopy. |

## The numbers against the four references

`canopy-furniture.ts --check --rooms --route` on 8e55b4a; Silksong ×0.58 and Nine Sols ×0.8 where hero-scaled.

| measure | HK | Silksong | Ori | Nine Sols | Canopy v9b | **Canopy v10** | read |
|---|---|---|---|---|---|---|---|
| air screens (hero) | 132 | 44 | 48 | 56 | 46.7 | **46.8** | Ori's size |
| hazard px per air screen (hero) | 340 | 877 | 328 | 374 | 228 | **228** | under every reference |
| hazard runs ≥ 640 (share) | 0.71 | 0.55 | 0.34 | 0.71 | 0.79 | **0.79** | in range |
| hit + ledges per air screen (hero) | 0.68 | 0.2 | 1.11 | 2.95 | | **1.82** | Ori to Nine Sols |
| room density mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.40 / 2.16 | 2.51 / 1.69 | 2.18 / 1.69 | **2.18 / 1.69** | Nine Sols' shape |
| spread (CV) | 1.10 | 0.96 | 0.59 | 1.08 | 0.83 | **0.83** | in range |
| quiet rooms | 16 / 48 | 9 / 34 | 2 / 17 | 7 / 39 | 5 / 27 | **5 / 27** | in range |
| busiest ÷ median | 8.9 | 5.4 | 2.6 | 7.7 | 5.3 | **5.33** (the Grove 9.0) | in range |
| route peaks (things a screen ÷ median 3) | | | | | 3.8× / 3.0× | **3.8× (Grove) / 3.0× (warning)** | two peaks |
| route up ÷ path | | | 0.22 | | 0.17 | **0.14** (hub → Grove 0.18) | horizontal |
| saves | 7 | 7 | 2 | 5 | 8 | **8** | generous |

**The premise, counted** (no tool measures this; from the rooms and my play):

| | HK | Silksong | Ori | Nine Sols | **Canopy v10** |
|---|---|---|---|---|---|
| authored premise beats in the first area | 4+ (Elderbug, the husks, False Knight's crash, the dead Crossroads) | 4+ (Hornet taken, pilgrims, Moss Mother, Bone Bottom) | 4+ (Naru, Sein, Kuro's shadow, the Spirit Tree) | 4+ (captives, Shennong, the first Sol, the hub) | **3 systemic** (the cage cut, the roost, the firefly's pass), **0 staged** |
| the first boss carries the premise | yes (the infection's first big host) | yes (the moss's mother) | yes (Kuro's chase) | yes (a Sol) | **no** (a beetle, its lamp incidental) |
| a beat that takes the camera | the crash, the arena lock | Hornet's capture | the escape, the tree | the boss intro | **the Grove's gates only** |

The level numbers didn't move this round, and that's right: round 10 added no bars. The score moved because the
first minute works and the premise exists. What is left is in the second table.

## What I played, and what it felt like

- **The hatch.** Three presses at the cocoon (`hatch` f 326). Holding right: she falls at the first gap (x 1,972),
  is caught and is back on the limb in ~50 frames, three times running. That's kind, but it took me three falls to
  try a running jump. Then gaps, and the lip (x 3,424-3,520, 96 px wide).
- **The first fling.** A running jump at the lamp, no keys: she drifts. The cap (a "V" in a box by the flame, a
  ring, a bar under it) is at full strength from the first frame and stays up while she drifts past the flame for
  most of 100 frames. Then she falls and is caught. Second try, V pressed 40 frames after take-off
  (`flingStart` f 1,956): time holds, the aim arc shows up-right, she lets go (f 1,986) and lands on the far limb
  (f 2,035). The cap says V, not "hold, aim, let go", but the default aim carried me. This is the area's first good
  minute.
- **The hub, the way I went.** I came off the drop holding right, as the hatch had taught me. The landing frame
  shows a trunk, a limb and a ledge: no cage and no moths. Right led me to the fork's claw face (a lock: no claws yet),
  back west, a drop, and **I was in the cellar** (f 2,943), then the galleries. The cellar is a khaki cave with flat
  ovals behind and a blue log floor. A tiny ant died in one cut. I never saw the hub's cage on that line.
- **The hub's trap** (walking back west). The cage shows at the frame's top left 600 px before it, hung high, fine
  gold bars, dark moths circling. The Lamp key does nothing at it, and no prompt shows. Three up-cuts from 47 px east
  missed it. From under it, three cuts (f 4,903 / 4,945 / 4,987) put it out:
  - the dark moths scatter;
  - pale moths drift round her, up and away over ~3 s;
  - the cage hangs empty;
  - "✓ 30 / 60" fades in at the top left.

  It's pretty, and it's small. The cloud is ~30 flecks of 6-10 px, there's no pause or zoom, and nothing says what
  happened. Without the docs I'd read "30 / 60" as a collection count with 30 to go.
- **The hub, west.** `patchMark` and `mapStation` fire on a pass (f 5,564). The map unrolls: the bark sheet. The kin
  stands by its coal under the crook. **The roost** (the hub's claw face, west) is a bright stack of pale moths on the
  dark wall: the area's clearest "you did that". The moon sits over the clearing, and it's earned there now.
- **The trunk** (on the way to the well). Umber, a thorn bed, a juvenile. Walking blind, I faded there. That's on me.
- **The well** (teleported to the bottom: the claws, `gladeGrant`). Teal and quiet. The amber-striped post still
  stands by the east wall. At the hollow, the ambush flags 13 frames after the patch, and the pair and the lampwing
  arrive 36 frames later. My fighter faded again (the braced fronts). The claws line hung over the fight. The door:
  three running jumps to `cn-limbs`, clean.
- **The Grove.** Walking in, I took a thorn hit (`thorn-p1`) on the way into the pit. Gates shut, zoom 0.81, the pair
  walk in. The west lamp is a cage, and the east one is a bare springboard: the two kinds side by side, the best
  frame for the idea. I cut the cage during the wave (f 7,967 / 8,009 / 8,051): `healthUp`, a fifth lantern, "A new
  light kindles." It's the most layered moment in the area. The count ticks 30 → 60 over a few seconds.
- **The gap** (from the bower side). I jumped at the chain and passed over it (reach 110 px), and dropped to the floor
  below. `fireflyStart` f 8,721: a pale green glow with a thread of light crosses from the lamps, down past her, off
  the bottom, 300 frames. Nothing was out, so nothing was relit. It's a will-o'-wisp. It doesn't read as a creature,
  and I couldn't tell it hangs the lights.
- **The tunnel and the warning** (with the glide granted). From the hump, a run-off and a held jump: the glide, the
  hawker's strike mid-glide (f 9,629, a light lost), a second glide, the warning's floor (f 9,667), the mark, beat 1's
  lampwings 18 frames later. I up-cut at lampwing 2 under the cage and **freed the trap without meaning to** (f 9,768
  / 9,799 / 9,847): 40 moths, unseen behind the fight. Beat 2's three stayed in `walk` through ten bursts. The floor
  is long now, but two big root hoops stand on it, and the backdrop is a flat brown card with dark arcs.
- **The boss** (the clip). The balcony, the drop, a pale spined dome with red eyes, a dark pillar with a violet eye
  at the taproot. The trestle shelves. 66 s of bait, jumps and cuts; at the end, the room dims and the bot walks
  east. The den has no find, no trap and no view. Its lamp (`wick-taproot`) goes out in phase 3, which is the only
  link to the premise, and it reads as the room getting darker.

## The 10 most important problems, ranked

### 1. [level] The area's climax isn't about its premise: make the den the great cage
**What.**
- The old burrback's defeat sets `cn-den-down` and opens the gate. The den holds no trap, no find and no moths.
- The area ends on a beetle in a dimming room.

**Why it matters.**
- Every reference's first boss is the premise made big: False Knight is the infection's first big host, Moss Mother
  is the moss, a Sol is the regime.
- `story.md`'s bosses are "the mantis under the brightest lamp", "a grove of lamps that pull". The first boss should
  be the first big lamp.
- It's also the area's last impression, the one Matt will remember.

**Fix.**
- **The great cage.**
  - Over the arena, hung from the den's roof at ~(1,900, 700): `trap-den`, 120 moths, a 3x cage.
  - The old burrback is its keeper. It roosts under the light, and phase 3's taproot draws from it (the existing
    `wick-taproot` becomes the cage's root).
  - While it lives, the cage can't be cut (a `guardedBy` on the lure: the cut glances off).
- **The ending.**
  - On the boss's defeat, the cage drops its guard. Three cuts free the area's biggest cloud.
  - The den's roof gate (a new `opens` on `lureSnuff trap-den`) opens to the way out's moonlit shaft.
  - The way out's first stop (`cn-out`) is the valley vista: the moon, the mountain, every moth freed so far
    streaming toward it.
- **Check.**
  - `canopy-r11.test.ts`: the cage is uncuttable with the boss alive, cuttable after, and its snuff opens the roof.
  - A `place:` claim that the way out needs the cage freed.
  - A clip from the last hit to the vista, ≤ 25 s, no control lost for more than 3 s.

### 2. [render] The release is a hit spark, not a moment
**What.** At play zoom, a trap's snuff is the cut's own flash, then ~30 pale flecks (6-10 px) circling her for 2-4 s
and drifting up. No pause, no camera, no sound. In a fight it's lost entirely.

**Why it matters.**
- This is the game's verb and its completion number, so it should be the most satisfying thing in the area.
- Ori's spirit wells and HK's grub rescues are tiny events, and each one stops for a beat.

**Fix.**
- On `lureSnuff {trap}`:
  - a hitstop of 14 frames;
  - the camera eases 6% in toward the cage over 0.4 s and back over 1 s;
  - the cage's bars burst outward and fall;
  - the cloud is 2x the trap's count, at 10-16 px, pale gold turning cool.
- The cloud circles her once (1.5 s), then leaves as a **visible stream** toward `LOOK.moon.x` that stays in frame
  ≥ 2 s.
- The HUD count ticks once per moth that leaves the frame.
- **Ask Matt about sound for this one beat**: a rising chord of moth chimes. It is where audio pays most.
- **Check.**
  - A scripted capture of each trap's snuff at 16:9 and 21:9: ≥ 40 freed moths ≥ 10 px on screen at +1 s;
    the stream in frame at +3 s; the cage's bars falling.
  - The same capture mid-fight (the Grove's wave): the release is readable over the beetles (luma contrast ≥ 30).

### 3. [level] Traps off the walked line, freed by accident, and never taught
**What.**
- The hub's cage (5,200 × 1,380) is 1,800 px west of the drop's landing and out of its frame. Holding right, the way
  the hatch taught, leads to the fork and the cellar.
- The warning's cage (7,744 × 1,650) hangs over the fight floor, in the up-cut line at a lampwing: I freed it by
  accident.
- Nothing tells the player a cage can be cut. Three cuts from 47 px east all miss.

**Why it matters.**
- A missed first trap is a missed premise. An accidental one is a premise you didn't see.
- HK's first grub cries out from a jar you can see from the corridor. Ori's first spirit light glows on the line.

**Fix.**
- **The hub's cage in the landing's frame:** move it to ~6,300 × 1,400, on the walked floor east of the drop, so the
  landing frame shows it with its moths before she moves. Or set a camera `look` zone on the landing that pans 600 px
  west for 1.5 s on the first arrival.
- **Teach the cut without text:**
  - the first cut on any trap breaks one bar, and **one moth escapes** through the gap and circles her;
  - hang the hub's cage 40 px lower, so a standing up-cut reaches it.
- **The warning's cage as the fight's prize:** move it off the fight floor's swing line, over the den's mouth on the
  lintel (it can only be cut from the cellar shortcut's ledge, 7,808-8,000 × 1,408), where she stands after beat 2.
  Or put it behind the lid, so beat 2's clear opens the way to it.
- **Widen the cut's catch** on a trap to ±64 px (the cage is drawn ~90 px wide).
- **Check.**
  - In the hub's landing frame at 16:9 and 21:9, the cage is in frame.
  - A walk with right held from the drop passes under the cage, or the look zone shows it.
  - In the warning, a plain up-cut plan against beat 1 never hits the cage.

### 4. [level + render] The firefly is a passing glow, and the cause is never shown
**What.**
- The gap's pass runs 300 frames on first landing below the chain, and relights only lamps she has put out.
- Coming from the bower and dropping (as I did) or walking in, nothing is out, so it relights nothing.
- It's drawn as a green glow with a thread. There's no body, and nothing ties it to the cages.

**Why it matters.**
- `story.md` rule 3: "Early on it's a light that flees and relights lamps behind her (as with Kuro in Ori)."
- Kuro's first pass is a shadow over the whole screen, and you see what it does.

**Fix.**
- **Trigger it on her first fling off the chain** (`lureSnuff {fling}` on `wick-gap-1` or 2 with the flag unset),
  so a lamp is out. It relights that lamp **in front of her**, then flees.
- **A second sighting before the boss:** at the warning, after beat 2, the firefly is seen at the den's mouth
  **hanging a new cage** (a short `stage` beat), then flees into the den. The cause is shown, and the boss is set up
  (#1).
- **Render:**
  - a body: a 20-28 px dark beetle-like silhouette with a lantern abdomen pulsing cold gold;
  - wing blur;
  - the thread of light to each lamp it touches, with a 0.3 s camera lean toward it.
- **Check.**
  - In a capture of each sighting, the firefly's body is ≥ 20 px and in the frame's middle two thirds for ≥ 2 s.
  - A relight happens in frame in the gap's pass for any route that flings the chain.

### 5. [render] The den and the warning are a flat card
**What.**
- The tunnel's east half, the warning and the den are one umber plane with translucent ovals and dark arcs. The
  den's banks (`denBanks`) don't show at the warning's or arena's stops.
- On the warning's floor, two big root hoops stand where the sim has none.
- The arena's shelves stand on X-braced stands, like trestle tables.
- The tunnel's "shell" landmark reads as a glass dome.

**Why it matters.**
- These are the area's second peak and its climax. HK's False Knight arena and Silksong's Moss Mother's grove are
  the most dressed rooms of their areas, not the flattest.

**Fix.**
- **The den look:**
  - three depth planes: far pale fog, mid banks with burrow mouths, near root columns;
  - no translucent arcs;
  - air luma 45-60 with value steps between the planes ≥ 8.
- **The warning's floor:** no root hoop over the walked floor (root mounts only at the floor's ends, under 120 px
  tall).
- **The arena's one-ways:** roots grown from the walls, not stands.
- **The shell:** an opaque shed back with plates and a split, half buried.
- **Check.** `look:check` for the den look: no translucent oval or arc shape over 300 px in the back planes, three
  planes present at every stop. Before / after at the warning's and the arena's stops at 16:9 and 21:9.

### 6. [level] The hub's first view and its way up are unreadable
**What.**
- The drop's landing frame shows nothing to do: no cage, no kin, no roost.
- The high block under the gap's entry is a framed box with a straight black band along the room's top.
- From the block, the way into the gap wasn't clear to me in four tries.

**Why it matters.** Dirtmouth's first frame is a town and a bench. Bone Bottom's is a village. The hub is crossed
more often than any room, and its first frame sets the area.

**Fix.**
- **Compose the landing:** a `fit` zone at the drop's landing (0.9) that frames the cage (#3) and the clearing's moon.
  The kin turns toward her on the first landing.
- **The way to the gap:** a lit claw face on the block's east side, with moss on its holds. Make the block a mass of
  roots, not a box.
- **Check.**
  - A `place:` claim: from the landing, the gap's entry is reached with the claws in one climb.
  - A shot at the landing with the cage, the kin and the moon in frame.

### 7. [level] No person, and the first-timer tool can't load the Canopy
**What.**
- Ten rounds, no person.
- `npm run firsttimer` boots `wood-hatch`, with no `--world`.

**Why it matters.**
- Every finding above (the right-holding route, the missed cage, the accidental snuff) is a person's thirty seconds.

**Fix.**
- `firsttimer start --world canopy`: the page opens with `?world=canopy&fresh`, R goes to the Canopy's last save.
- Before round 11's review:
  - a first-timer sub-agent plays from the hatch to the boss with only the prompts, and keeps a journal;
  - **Matt plays from the hatch** (the lesson no longer blocks him), recorded with the event log.
- **Check.** The journal exists. The review quotes three moments from it.

### 8. [render] The HUD and the lines miscount and linger
**What.**
- "30 / 60" means the next health milestone, but reads as moths of a total. After 60 it shows "/ 350".
- The area line (`lamps x / y · moths a / b`) shows only after a stone is read.
- "Your claws have hardened..." and "A new light kindles." stay up ~5 s, over the ambush and the wave.

**Fix.**
- **The count:** freed moths alone ("✓ 60"). Under it, a lantern pip that fills toward the next light (no second
  number).
- **The area's tally on the map**, not the HUD: "Canopy · 60 of 100 moths · 2 of 3 cages".
- **Lines:** ≤ 2.5 s. If a creature is aware within 800 px, they show after the fight's last kill.
- **Check.** A prompts / HUD unit test: no line is up while an aware enemy is within 800 px; the count has no " / ".

### 9. [render] The boss reads as a pale shrimp in a workshop
**What.** The old burrback at 4.4x is a pale spined dome with red eyes. On its back in the roll it's a white ribbed
shell. The arena behind it is the flat card (#5) and the trestles. The taproot's violet eye on the dark pillar is the
best shape in the room.

**Why it matters.** The False Knight and the Moss Mother are the darkest, heaviest shapes in their rooms, lit from
one side.

**Fix.**
- The old burrback's shell dark (luma ≤ 30), its plates rimmed by the great cage's warm light (#1), its eyes the only
  red.
- Its ram's dust and slam wave 1.5x.
- Its intro: on the drop to the floor, it rises from sleep in 1.5 s, and the camera locks on (the `zones.arena`
  lock already exists).
- **Check.** A capture of the intro and each phase: the boss is the darkest large shape in the frame, with a rim
  luma ≥ 120.

### 10. [level] Small leftovers
- **`juv-pile`'s turn loop** (every 25 frames, from r8): find the stuck state.
- **The trunk's thorn bed with a juvenile on its far side** faded a blind walker. It's fine for a side room, but the
  bed's west edge needs a readable step (a root lip) before it.
- **The well's amber-striped post** at the bottom (still a placeholder after three rounds).
- **The first gap of the hatch:** three catches in a row when holding right. After the second, the limb could show a
  root bridge's broken end (the jump's cue).

## The step back: what is the single biggest gap now?

Round 9's answer was "no story happens in play". Round 10 put the story into the sim: cages, a count, a roost, a
firefly path, a lantern for every 60 moths. Those are the right pieces, and the area is better for them.

**The biggest gap now is staging: nothing in the area is directed.** Every premise beat is a system that fires at
play zoom, in passing, without the camera, time or sound:
- the release is a spark;
- the firefly is a glow on a path;
- the roost appears off screen while she is away;
- the boss fight ends in a dimmer room.

The references' first areas are remembered for three or four moments where the game takes your eye for two seconds
and shows you something:
- HK: the False Knight's crash;
- Ori: Kuro's shadow;
- Silksong: Hornet dragged in;
- Nine Sols: the first Sol's reveal.

The Canopy has one directed moment, the Grove's gates shutting. It is still the area's best.

So round 11's single theme is: **direct three moments, and end the area on the premise.**
1. **The first release in the hub (#2, #3).** You see the cage from the landing, the first cut lets one moth out, the
   third bursts it, the cloud circles and streams to the moon, and the count ticks.
2. **The firefly hanging a cage at the den's mouth (#4).** The cause is shown.
3. **The great cage over the old burrback (#1).** The boss, the biggest release, the roof opening onto the valley.

Stop polishing systems until these three are directed, and ask Matt about sound for the release (it is the beat that
most needs it).

## Scores (1-10, against the HK / Silksong / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | r4 | r5 | r6 | r7 | r8 | r9 | **r10** | one line |
|---|---|---|---|---|---|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | 6.5 | 6.5 | 7 | 7 | 7 | 7.5 | **7.5** | the warning's long floor; the hub's landing blank, its cage off the line |
| density | 4 | 5 | 6 | 6.5 | 6 | 6 | 7 | 7 | 7 | **7.5** | the Grove's cage mid-wave is real layered choice |
| combat | 3 | 4 | 5 | 5.5 | 6 | 6 | 6.5 | 7 | 7 | **7** | the boss beatable; the warning's beat 2 idle in my play; no boss intro |
| traversal | - | - | 4 | 4.5 | 6 | 6 | 6.5 | 7 | 7 | **7.5** | the first fling teaches itself; the glide past the hawker |
| secrets | 2 | 5 | 6 | 6.5 | 6.5 | 6.5 | 6.5 | 6.5 | 6.5 | **6.5** | unchanged |
| readability / look | 5 | 4 | 5 | 6 | 6.5 | 6.5 | 7 | 7 | 7 | **7** | the map, the tufts, the moon at vistas; the den a flat card, the hub's box, hoops |
| pacing | 3 | 5 | 5 | 4.5 | 5.5 | 5.5 | 6 | 6.5 | 7 | **7.5** | retries in front of the warning; minute one no longer a wall |
| story and place in play | | | | | | | | | 4 | **5.5** | cages, a count that buys light, a roost; no directed moment, a premise-less boss |

**Overall: 7.5 / 10** (r1 3.5, r2 4.5, r3 5.5, r4 5.5, r5 6, r6 6, r7 6.5, r8 7, r9 7).

## Round 11: the ten fixes, ranked by impact

Gate: Matt's run from the hatch, recorded.

**Level**
1. **The great cage over the boss** (#1): `trap-den` (120 moths) guarded by the old burrback; its defeat makes the
   cage cuttable; the snuff opens the den's roof to the way out's valley vista.
2. **Traps on the walked line, the cut taught** (#3): the hub's cage in the drop's landing frame (move it to
   ~6,300 × 1,400 or a look zone); the first cut lets one moth escape; the cut's catch ±64; the warning's cage off the
   fight floor's swing line.
3. **The firefly seen doing it** (#4, level side): its gap pass triggered on her first fling off the chain, relighting
   that lamp in front of her; a second sighting at the den's mouth hanging a cage after beat 2.
4. **The hub's first view and its way up** (#6): a `fit` zone at the landing framing the cage and moon, the kin
   turning; a lit claw route from the high block to the gap.
5. **A person, and `firsttimer --world canopy`** (#7): the tool loads the Canopy; a first-timer journal and Matt's
   recorded run before the review.

**Render**
6. **The release as a moment** (#2): 14 f hitstop, a 6% camera ease, bars bursting, a 2x cloud of 10-16 px moths that
   circles once and streams to the moon in frame ≥ 2 s, the count ticking per moth; sound for this beat if Matt
   approves.
7. **The den as a place** (#5): three depth planes, no translucent arcs, no hoops on the warning's floor, arena
   one-ways grown from the walls, an opaque shed shell.
8. **The firefly as a creature** (#4, render side): a 20-28 px body with a pulsing cold-gold lantern, wing blur, threads
   to the lamps it touches, a 0.3 s camera lean.
9. **An honest HUD and short lines** (#8): "✓ 60" with a lantern pip for the next light, the area tally on the map, lines
   ≤ 2.5 s and never over an aware enemy.
10. **The boss's look and intro** (#9): a dark shell rimmed by the cage's light, red eyes only, 1.5x dust and wave, a
    1.5 s wake on her drop with the arena lock.
