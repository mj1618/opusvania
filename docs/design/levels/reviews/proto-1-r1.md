# Lanternroot (proto-1), review round 1

2026-10-18. An independent reviewer who did not build it. Build: `af522de`. Brief: `docs/design/levels/proto-1.md`.

**What I did:**
- Played `?world=proto-1&fresh` in a real-GPU page at 1920×1080. I used real keys through in-page loops: the spawn fight, the split, the hall, the pit, First Light, the stair climb out, the seal attempt and the arena entry. I used `goto`, `glow` and `flag` to reach places quickly.
- Ran `npm run solve` and `npm run solve -- --locks`.
- Replayed the solver's puzzle lines headless, with the creatures in and out.
- Measured density from the room data.
- Ran a human-like bot (`humanplay`, average, seed 1, 15 min).
- Watched all six play-through clips (contact sheets plus cut frames of `boss.mp4`).
- Looked at every chamber still, and measured the clips' loudness.

**What I did not do:**
- I did not judge sound by ear. Audio is muted by default; I only measured the WAVs.
- I did not fight the Gloamweaver to the end by hand. I judged it from the driver tape, its clip, a P1 screen and the code.

Matt judges fun. This review covers:
- bugs;
- solvability;
- density;
- fairness;
- control;
- readability;
- the look;
- design quality against the references.

Nothing below asks for a hint or a signpost.

---

## 0. What holds up

- **Solver: green.** All 61 edge proofs pass, and so do all 4 drivers: the vault, the Answer, the ram and the Gloamweaver (won at about 66 s with every creature in).
- **Progression and softlocks.** Kindle comes before Gust. Every place and find is reached. There is no softlock with every lamp spent, and every moonwick has renewable fuel.
- **Skip-hunter.** All 9 locks hold at budget 2500:
  - the pit, the nest and the loft without Kindle;
  - the crest only by the chimney;
  - the curtain, the brambles and the vault without Gust;
  - H3 without the ram;
  - the cistern before the boss.
- **Control.** I found no grab. The web is `grab: false`, and I walked through its strands. There is no held beat. The seal drops her into the arena with control kept.

  The only input locks are these:
  - the fling's own aim (36 f);
  - the 'fresh start' after a hazard or a re-form (`freshStart`, `room.returnFadeIn`).

  This passes the brief's §10.5.
- **Flings commit.** A chain off L-a2c..e from the west floor saved `l-a2c` and `l-a2e` to `save.snuffed`.
- **Creatures come back.** They return when she enters a room again (j-a1 was back after a hall round trip), so fuel never runs out.
- **The night layer is the best-looking thing in the level.** B1 (the trunk's back with the stub, the bramble crown, five lamps, the cap, the knot door and the moon) is the one chamber that reads at a glance as a dense little machine.
- **The arena is a striking composition.** The orb web is centred on the Gloam lamp, with four wick ledges around it.

---

## 1. Bugs, softlocks, unfair moments, control

| # | what | repro | severity |
|---|---|---|---|
| B1 | **Health is hidden most of the time.** The health lanterns fade 3.6 s after the glint count last changed (`HUD.hold`). The glow beads stay up. In a combat level built around Mend, you can't see your health. | Get hit, wait 4 s, kindle a wick: `health()` says 4/4 and the corner shows only the beads (`s10-hud.png` in my scratch). `src/render/hud/index.ts:483`: lights show only while `hold > 0` or the old pips are up. | high (readability) |
| B2 | **The pit's patch sits on a hunting patrol.** The juveniles `j-a3a` / `j-a3b` (`senses: always`) walk 262–915, right across `p-a3` (440). She re-forms into them. | Land in the pit at 1 hp and stand still. Events: `hurt ×4, fade @12933, reform @12983, hurt ×5, fade @14058`. That is two fades in about 20 s, both at the patch. Brief §2: "no predator in sight of a patch". | medium |
| B3 | **The Answer's tempo is taught wrong.** S3 flashes its short gaps at 0.28 + 0.18 s = **28 f** onset to onset (`phraseLit`). The cap counts a short only at **≤ 24 f** (`bells.shortMax`). The blade can't strike faster than its 18 f cooldown, so a short is an **18–24 f window**. A player who copies the sign exactly lands in the 25–35 f dead zone, and the count resets. It only works if you mash the shorts. | `src/render/lantern/kit.ts:798` against `tuning.bells`. The driver uses gaps `[50, 20, 20, 50]`. | medium (fairness of the deep secret) |
| B4 | **The boss's phase name is the Weaver's.** `boss().phaseName` is "the ring" in P1. | `goto` the seal with `seal-open`, drop, `boss()` | low |
| B5 | **Mix.** The boss clip is the quietest stretch of the level: **−29.8 LUFS integrated**, against −25.8 for the hall tour and −26.5 for the pit. The climax sits under exploration. | `ffmpeg -af ebur128` on `shots/lanternroot/play/*.wav` | low–medium |
| B6 | **The stair exit is a blind wall-kick.** The climb face over the top moss step starts 160 px above it: the roots' ceiling face is y 0–240, and the step's top is at 400. A straight double jump falls back from hall y about 1400. It needs a jump into the 1408 face and two kicks. It is fair once known, and the solver proves it, but my first four real-key tries failed. I record it; I'm not asking for a hint. | `teleport(1600, 400)`, then jump + double jump: back on the step. With kicks on wall contact: out. | low (note for Matt) |
| B7 | **A spiderling-looking spider hangs at the floor for ~6 s after the win**, through "A new light kindles." The sim hides `fight` spiders once the fight is off, so this is probably the boss's corpse pose or a render leftover. | `boss.mp4` 62–68 s | low, unverified |

**Control (passes).** No grab, no held beat, and no input lock longer than the fling's aim, as listed in §0.

**Harness gaps** (not game bugs, but they hide game bugs):
- **The solver proves every puzzle edge with the creatures removed.** Its `setup()` and `replay()` default to `creatures: false`, and no edge in the graph sets it.
- **`humanplay` can't play proto-1.** `humanrun.ts` builds the `Game` on `GAME_WORLD`, so proto-1's exits don't link. In 15 min the bot reloaded lr-night 121 times. The juvenile was "killed" 66 times. It took 48 thorn-gully hits and never left the night.
- **No human-like model knows** kindle, gust, mend or the fling off a moonwick.

---

## 2. Density (the brief's rule: ≥3 kinds in view, ≥2 within 600 px)

**Method.**
- **Spots:** every 120 px along every standing top (solids and one-ways, not under a ceiling, not on thorns).
- **View:** the chamber's 1920 width (the zones lock sideways) by 1080 tall, following her vertically and clamped.
- **Kinds:** creature, collectible (glints, pods), breakable (bark), lamp or moonwick, a secret's tell (hollows, covers, signs, the cap, the stone), route (exits, doors, gates).
- **Strict and lenient:** strict counts pods as collectibles only. Lenient also counts pods as breakables and unlit moss scars as tells.
- **Scripts:** `density.mjs` / `density2.mjs` in my scratch.

| chamber | spots | **first visit** (strict) | first visit (lenient) | **revisit** (glints taken, warm lamps out, bark broken, hollows found; creatures and pods back) |
|---|---|---|---|---|
| A1 crown | 19 | 84% | 95% | **53%** |
| B1 trunk | 15 | 100% | 100% | **27%** (80% lenient) |
| C1 plate | 15 | 0% (quiet on purpose) | 0% | 0% |
| A2 split | 21 | 90% | 90% | 81% |
| B2 hub | 27 | 100% | 100% | 70% |
| C2 gallery | 29 | 100% | 100% | 100% |
| A3 pit | 18 | 72% (half quiet) | 89% | 72% |
| B3 arena | 23 | 70% (quiet before the lock) | 100% | 70% |
| C3 cistern | 19 | 84% | 100% | 84% |
| cache | 23 | 87% | 87% | 78% |

**The lint passes, and it flatters the level.** It counts signs, exits and gates as "kinds", and it counts things at the fresh state. What the eye sees is thinner:
- **Creatures:** 16 non-boss creatures in 10 chambers.
  - night: 2 (one juvenile in A1, one hawker in B1, none in C1);
  - hall: 9;
  - pit: 2;
  - cistern: 3;
  - cache: 0.
- **Glints:** the roots hold 8 in the whole room. The night's A1 has 26, but 20 of those are the nest's hoard behind Kindle.
- **Framing:** A1's frame at the spawn is about 60% empty sky. The play lives on a strip along the bottom fifth (`s00-spawn.png`). The grove fills its frame.
- **Revisits:** Kindle and Gust exist to send her back over seen screens, and those screens have lost their glints and warm lamps. B1 drops to 27% strict, and A1 to 53%.
- **Verdict:** dense the way the grove is in **B1, A2 and C2** only. Elsewhere it is "one creature and a lamp on a long floor".

---

## 3. Puzzles and secrets, each judged

**The headline:** the tools are rarely *needed*. I replayed the solver's stored lines with the creatures in (`wc.ts` in my scratch, using `tools/solve/explore.ts play`). Every puzzle line still met its goal with **no hurt**.

| puzzle | what the solver actually does | clever? | fair? | aha? |
|---|---|---|---|---|
| 1 **First Light** (A3) | Kindle M-a3, climb three moss steps in **~3.3 s** of the 12 s burn (my real keys), kindle M-a3b. | Tutorial | Yes | Visual only: the moss appearing is the moment. The timer never bites. |
| 2 **The Seal** (B2) | **Downhill, the reverse of the brief.** Double jump from the hub onto a gallery shelf (3936, 980), hop onto **M-s2's shelf**, kindle it, fling west twice, drop to the floor, run west and air-kindle M-s1. 252 f = **4.2 s**. M-s2's shelf is reachable without any tool, so the intended "fling up off M-s1 against the clock" is optional. D-b2 never hit the line. | No: it's routing | Yes | **No** |
| 3 **The Guarded Set** (C2) | Kindle M-c1, **walk down into the shaft and stand on the shaft gate** (4487, 1440: a safe spot in the middle of the "thorn shaft"), then jump + double jump to M-c2 and kindle it in the air. 122 f = **2 s**. No fling over thorns. H-c2 goes shy once and never lands a strike. Silver light as a shield is never needed. | No | Yes | **No** |
| 4 **The Ram** (H3) | The burrback's step-ram breaks heartwood. Tells: a clang, scars, the patrol ending at the wall. | **Yes**: the best idea in the level, a creature as the key | Yes | Yes, for a player who notices the bumps |
| 5 **The Vault** (C2, Gust) | Driver: about 9 s from the gallery floor on exactly 18 glow, fanning M-g1 through W1's window. Known: a fast human may light all three without the fan. | Good idea (fan from range to keep a set alive) | Yes | Possibly. It may be skippable by speed, which kills the aha. |
| boss as puzzle 6 | Kindle to expose, silver as a shield, the high-pair set floods the moon-hole. | Good structure | See §4 | The moon-hole is the aha |

**Secrets:**
- **H1, the hollow log.**
  - Tell (1), moths from L-a1 flying west into the log, is good and honest.
  - The log reads as a black rectangle, not a hollow limb.
  - Tell (3), the map's hollows, **isn't built** (lanternroot-art.md: "no map hollows yet").
  - It's 280 px west of the spawn and on the bot's line, so a human finds it within a minute. That makes it a surface find, not a hidden room.
- **H2, the moss loft.** It's well built: enclosed, entered from below, its steps lit by M-s2's light, under a cover. But puzzle 2 can be solved from the gallery side without ever standing in the hub under the loft, so tell (2), "puzzle 2 forces M-s2 to burn", fires while she's elsewhere. I didn't verify the lichen scars on screen.
- **H3, behind the heartwood.** Good: three honest tells, a creature as the key, and S3's phrase as a payoff.
- **The crow's nest.** Locked behind Kindle (held at 1330 nodes). It's a 20-glint hoard plus a sightline. Fine.
- **The ember run.** Visible from the trunk. The human-like bot spent about 6 minutes on L-er2..5 and gave up, so it reads as optional hard. Good.
- **The Answer.**
  - The idea is the level's best: a phrase found in one place, used in another, only in the dark. That is Tunic's manual in miniature.
  - The tempo is mis-taught (B3).
  - The **payoff, Bright Kindle (a kindle costs 3), arrives after the Answer, which is post-Gust**, when nothing is left that needs kindling. A deep secret should change play. The cache's set playing back the firefly's phrase is a nice beat, but it is the only one.
- **The knot panel.** It reads as a plank bridge you walk across, so a player crosses it rather than suspects it. That's honest enough, and the hall side shows the hole.

**Layering:** the layers are there on paper (surface, hidden rooms, a deep secret). In play, layer 2's tells lean on unbuilt pieces (the map), and two of the five puzzles collapse to routing. Against Animal Well, where every room's verb use is the point and secrets nest three deep, this is one deep.

---

## 4. Combat

**The attack.**
- The picture is better than the wood's:
  - a white-gold flash at the blow;
  - sparks streaking into her on `glowGain`;
  - the kill ring.
- In stills the juvenile reads as a small spiky disc (it's the burrback rig at 0.72), so there's little to "bat".
- Every hit feeds a meter you can see: that part works.

**Creatures as fights and puzzle pieces.**
- **Juveniles** are fuel and nothing else. They are 2 hp, wander onto you, and two of them fill the meter.
- **The dangler and the hawker as kindle-spot hunters** never touched a solver line, and they never needed to: the lines don't stop where they hunt, or the shy rule covers them.
- **The burrback-as-ram** is the one creature that is a real puzzle piece.
- In practice the shy rule only removes threat: it's a shield you never needed.

**The light economy has no tension.**
- **Fills too fast:**
  - glow was 17 / 18 at 0:30 from the spawn (pod + j-a1);
  - two pit juveniles took her from 0 to 18 in about 1 s of cutting;
  - three regrowing pods sit beside the first wick, and two beside the arena wicks.
- **No real choice:** the brief's choice between Mend and Kindle never comes up, because the next 6 sparks are seconds away.
- **The fade drop is meaningless:** what she drops is just as quickly refilled.
- The vault is the only place where 18 is a ceiling.

**The Gloamweaver.**
- **The structure is good:**
  - expose it with a kindle;
  - the Weaver's drops clipped by silver;
  - the moon-hole set;
  - a re-form 5 s above, with no hold.
- **As played (driver tape and clip):**
  - **P1 is a waiting game.** It won't enter lit strands, so after a kindle it waits out of range. In `boss.mp4` (about 8–16 s) the driver stands on the east low ledge for about 8 s waiting for it to come near a cold wick.
  - **Too small and not scary.** In the dark the spider is a small white blob with "<<<<" chevrons on the far left (`s14-arena.png`). Next to the Gloam lamp's bloom it reads as a will-o'-the-wisp, not a predator three times her size.
  - **The quietest part of the level** (B5).
- **Against the Weaver** (which Matt liked as an intro boss): the Weaver pressures you. This one avoids you. Not confirmed by human hands: no human-like fighter knows kindle.

---

## 5. The look and the sound

- **Night: close to the bar.** The wood kit's canopy, a moon with a face, lit moss rims and painted Physalis lamps. B1 is the screenshot of the level. A1 is mostly sky. C1's crest is two big black rect blocks with a gap: rect collision showing.
- **Hall: well off the bar, and it carries the level's biggest beat.**
  - The backdrop is a horizontally streaked brown wash, more like rippled water or a wood-grain texture than the inside of a tree.
  - There's no value structure, and no near-to-far depth.
  - The shelves float in a void, and the split's two columns hang and end in mid-air.
  - The **moonlight pouring down the split** is a faint smear at the top edge. The brief's best moment 1 ("from silver quiet into a hall of warm lamps and circling moths") doesn't read: no silver shaft, and no moths by the hundred, only a few specks per lamp.
  - The lamps are lovely. The space around them isn't.
- **Cache:** the hall's wash plus wick shelves. The firefly-lamp is a small jar. It doesn't feel like a deep secret's room.
- **Roots: the light layer fails.**
  - A3 is near-black. In the pit-tour and cistern sheets she's hard to find in a 480 px thumbnail.
  - Tops read only as a thin cyan line.
  - The 420 px silver light draws as a **thin circle outline** plus a ~200 px glow (`s09-firstlight.png`). It reads as a debug ring, and it doesn't "flood" anything.
  - Glowworm threads are good.
  - The moss ledges read as frosted slabs with icicles, which is legible.
- **Sound:** present.
  - hall −25.8 LUFS, pit −26.5, boss −29.8 (see B5);
  - LRA 9–12 LU.
  - I didn't judge timbre.

Against HK's Crossroads or Ori's Sunken Glades: the night stands near them, and the hall, cache and roots don't.

---

## 6. The arc and cohesion

- **Geography: one place, good.** The fallen giant is the strongest concept so far: crown, back, hollow, roots, plate. The sightlines are designed: the cap from the nest, the crest from the spawn.
- **The pit's quiet minute doesn't exist.**
  - The hole (576–832) drops her 30–280 px from two juveniles.
  - The Kindle glade is 400 px west of the landing.
  - So "a minute of drip and dark, then First Light" plays as "land in a fight, walk 3 s, get a tool".
  - Contrast is the brief's main emotional lever, and here it's gone.
- **Intensity is flat.** The puzzles are short and soft, and the boss avoids you, so the 5→9 swell the brief's §7 promises happens mostly on paper.
- **The first fling is optional.** A jump + double jump from the gully column lands on the crown (I checked headless: lands at 2241–2373, 816). L-a1 is a bonus, not the "first fling". Freedom is fine, but with puzzles 2 and 3 bypassed, the fling is rarely required anywhere on the main path.

---

## 7. The 10 worst problems, ranked

| # | problem | concrete fix | owner |
|---|---|---|---|
| 1 | **Puzzles 2 and 3 don't need their tools; First Light's timer never bites.** The seal goes downhill from the gallery side in 4.2 s. The guarded set is crossed by standing on the shaft gate, then a double jump, in 2 s. No hawker strike. | **Seal:** cut every tool-free way onto M-s2's shelf from the gallery (raise the 3860–3980 shelves, or roof them), so the only way up is a fling off a burning M-s1. **Shaft:** put the gate under a thorn bed (or a catch) so the pit has no standing spot. Widen it to past a double jump + glide (≥ 900 px), so only the fling off M-c1 crosses. Move H-c2's lane over the landing outside M-c2's 420 px. **First Light:** burn 6–7 s, or add one more step. **Solver:** add *must-use* locks: seal-without-fling, guarded-without-silver (hawker in), shaft-without-fling. Prove every puzzle edge with `creatures: true`. | level / sim |
| 2 | **Thin density outside B1, A2 and C2. Revisits go hollow.** 16 creatures in 10 chambers. A1 is 60% sky. B1 revisit is 27%. The roots have 8 glints. | Give every chamber a small ecology that renews: a hawker pair at the crown, juveniles on the trunk's back, beetles that eat glowworm beads in the roots, glint lines in A3's second half and C3's column, regrowing pods with glints. Lower A1's zone framing so the play fills the frame. Re-run the density lint on the **revisit** state and on the humanplay trace (once it can play proto-1). | level (+ art for framing) |
| 3 | **The hall, cache and roots are far below the bar.** A flat brown streaked wash, floating shelves, no moonlight shaft at the split, no moth clouds. The roots are near-black, and the silver light is a thin ring. | **Hall:** a real value structure: near-black ring-grain foreground masses; mid heartwood columns that reach floor *and* vault; a bright silver shaft at the split that lights the floor it lands on; the swarm's instanced moths (dozens a lamp, as the brief says). **Roots:** lift ambient and rim, a cool silhouette layer behind the play. **Silver light:** a filled pool that lights the surfaces near it (the light mask), no outline ring. **Cache:** its own look, with the firefly-lamp as the centrepiece. | art |
| 4 | **The Gloamweaver is a passive avoider, small and quiet.** P1 is waiting. The spider reads as a ghost blob. Its fight is the quietest part of the level. | **Sim:** in P1 it comes to her on a clock (a drop at her every 4–5 s from the nearest dark strand), so exposure is something you *answer* rather than wait for. Keep it out of lit strands, but let lit strands *trap* it (cornered sooner). **Art:** a big dark silhouette whose legs catch rim light from any lit wick, eyes as the tell, a sense of scale at the hub. **Sound:** boss bus up about 4 dB, tells in front. Rename P1. Then a human-like fighter run. | sim / art / sound |
| 5 | **The glow economy has no tension.** Full at 0:30. Two juveniles fill it. Pods beside every wick. Mend vs Kindle is never a choice. | Hit +2, kill +1, lamp out +3, glint +1 (glints are the trickle). Pods regrow at 60 s and pay 3. Max stays 18. Re-check: one fight should buy one kindle, not three. The solver's fuel check still holds (pods regrow; creatures come back). | sim / level |
| 6 | **Health is hidden** (B1). | In `glow` rooms, keep the health lights up whenever the beads are up, i.e. always. | render |
| 7 | **The pit's quiet minute and safe patch are broken** (B2). The hole drops her next to hunting juveniles, and the patch is on their patrol. | Move the hole east (≥ 1200 px of quiet black floor before the first creature), the glade to the far west under its crack, and the juveniles between the glade and the wick, fenced off from the patch (`fenced` or a step). | level |
| 8 | **The Answer's tempo is mis-taught (B3), and its payoff is spent.** The sign's short gap is 28 f; the cap's limit is 24 f; the blade's floor is 18 f. | `bells.shortMax` 34 and `longMin` 42 (or the sign's short gap 0.12 s), and test it against the sign's own timing. Pay something that changes play: let Bright Kindle come earlier, or make the cache pay a new fling verb or the glow vessel. | sim / level |
| 9 | **The verbs' teaching beats are optional, so the fling is rarely required.** The first fling over the gully is skippable by a double jump. With #1, the main path barely uses the fling off a moonwick. | Make the gully one double jump too wide from the column (or lower the column), so L-a1 is the first fling. Audit the main path for at least one forced use of each verb: fling off a warm lamp, fling off a moonwick, a kindle under threat, a gust that changes geometry. | level |
| 10 | **The test harness can't see the level's real problems.** The solver proves edges creature-free. `humanplay` boots `GAME_WORLD` (proto-1's exits unlinked: 121 reloads in 15 min). No human model knows kindle, gust or mend. | A `--world proto-1` path through `humanrun.ts` and `headless.ts`. Kindle, gust and mend in `human.ts` and `fight.ts`. `creatures: true` proofs. The density lint on traces. | tools (level/sim agent) |

---

## 8. Verdict

**The direction is more promising than wood area 1 was. This build doesn't yet show it.**

**Why it's more promising:**
- One coherent place with a readable geography.
- A small set of verbs (fling, kindle, gust) that open locks you saw early.
- A solver that actually proves the level.
- Three hidden rooms with honest tells.
- One genuinely good creature-as-key puzzle (the ram).
- One genuinely good deep secret (the Answer).
- A night layer that sits near the references.

Wood area 1 had none of that structure.

**Why it isn't there yet:**
- The level is still mostly *routing between buds against a loose clock*. The two signature puzzles (the seal, the guarded set) are solved by plain movement, without their tools, in 2–4 s.
- The economy never makes a fight matter.
- The boss waits for you.
- The hall (the heart of the level) and the roots are a long way from Ori or HK.
- It's dense in three of ten chambers.

A human playing it today would likely find it pretty at night, obvious in the hall, and dark in the roots. That is close to Matt's "bland, obvious" note on area 1, for different reasons.

**What would make it great:**
1. **Puzzles where the tool combination is the only way, and seeing that is the aha** (Animal Well's rule):
   - moss you must keep alive with Gust fans *while* standing on it;
   - a hawker you *lure* into silver to make it shy, so you can cross under it;
   - a burning moonwick as the only fling anchor over a gap a double jump can't cross;
   - the beetle as a ram used twice more, in new places.
2. **Every chamber dense and renewing**, like the grove, so a revisit with a new tool is a new pass through a live room rather than an empty corridor.
3. **A light economy tight enough that you fight because you need the next kindle.**
4. **A Gloamweaver that hunts**, so that kindling feels like counterplay rather than a timer.
5. **The hall painted as the place the whole level is named for.** Silver pouring down the split into amber, with moths by the hundred around each lamp, is the image that would sell this direction to Matt.
