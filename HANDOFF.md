# Handoff: the Canopy loop, stopped after round 22 (2026-11-02)

## Round 22: creature variety, hit feel, and fights you can't skip
Matt: "there could be more variety of enemies, and attacking them could be more satisfying… currently the enemies are
too boring and monotonous", then mid-round: "check with Ori, it has a good way of forcing you to deal with enemies. I
still feel like we can speedrun our level too much." Research, numbers and plan: `docs/design/levels/reviews/canopy-r22-creatures.md`.
- **Why it was monotonous:** about 50 of 74 regular creatures were the burrback rig at three sizes and 18 the moth
  art. The references' first areas have 8–20 kinds, and every one has a ranged creature, a leaper and a wall crawler;
  we had none.
- **New kinds** (sim + rig + sound + tests; `memory/enemies.md`, `memory/enemies-render.md`):
  - **bombardier** (ranged): lobs a burst of 3 boiling droplets after a 44 f tell; **a slash bats a droplet back**
    and one that hits it lays it open; up close it sprays a short cone (go behind or above). `state.shots` (state v23).
  - **jumper** (jumping spider, leaper): keeps 200–280 px, 26 f crouch, ballistic pounce that always lands on ground,
    open on a miss, hops back from a ground cut, knocked down if cut in the air.
  - **huntsman** (wall runner): scuttles its bark face, tells on her projected climb height, lunges across, clings
    to the far wall or falls open. On the well chimney and the Elder.
- **Re-looks:** carriers are ants carrying moth wings (`ant.ts`), hawkers are dragonflies (`dragonfly.ts`).
- **Readability pass:** everything new is drawn bigger with a value break and its own signature colour; the jumper is
  a velvet-black Phidippus with white marks; the juvenile is drawn at 0.85 with a paler young palette.
  `npx tsx tools/bestiary.ts --url <dev>` makes per-kind close-ups and play-zoom lineups (`shots/bestiary/`).
- **Hit feel** (`hitfx.ts`, `flung.ts`, `memory/feel.md`): a near-white creature flash held 5 frames (past her
  crescent), a cut streak, ichor thrown along the blow that lands and splats, a kill ring, juveniles batted away as
  corpses, a finisher-kill zoom punch, a wetter kill sound. Slash timings, reach, pogo, hitstop unchanged.
- **Nests (Ori's rule, `memory/canopy.md` v22):** three critical-path rooms hold the way on behind a root gate until
  every creature of the nest is dead (shared `sets` flag); the way back stays open; cleared stays cleared.
  Hub (bombardier + ants, `cn-nest-hub`), trunk tier 3 (jumper + juveniles, `cn-nest-trunk`), fork (two
  bombardiers + jumper, `cn-nest-fork`). Never put a creature that can leave the room alive (dangler, huntsman, a
  lamp-guarder) in a nest: the gate would never open.
- **Open after r22:**
  - No human has played it. Ask Matt whether the new creatures feel different and whether hits feel better.
  - A fourth nest later (bower ambush or spire), and a huntsman nest needs a "can't leave" rule first.
  - The bot route planner treats a nest gate as a wall: speedrunner numbers stop at the gates.
  - The speedrunner baseline in the r22 doc's first table had no `--goal` (the bot left by the nearest door); with
    `--goal` it already killed 1–5 a room.
  - The ants are still small beside her; the jumper's air-cut may be too generous; the juvenile half sinks into moss.
  - Ori's Bash on creatures (fling off a droplet or a lampwing) is the next big verb idea.
  - **First-timer r22a** (`playtest-reports/2026-11-01T16-00-37-firsttimer-r22a/journal.md`, Grove at 7 min, 5 fades):
    every creature had "one clear trick" and they fought differently (the jumper was the best fight; bat-and-dash
    on the bombardier "felt great"); ordinary hits felt small (boosted after: more ichor, a bigger cut, shake 0.1);
    gates opening off screen went unnoticed (a nest door now shakes; consider a camera glance at it). Still open
    from it: the adult burrback's ram reads as having no wind-up and caused most fades; hits from off screen (a
    bombardier at the screen edge on landing, a jumper at the foot of a blind drop); dead-end pits (the galleries'
    pit needing the wall jump, the giant's lower floor); ants read as background.

## Round 21: the first five minutes (after Matt: "didn't have to deal with a single enemy")
Deployed. Details are in `memory/canopy.md` v21.
- **Lesson:** the opening must be dense. Quiet stretches are earned later. Reading the references as "first areas open quiet" was wrong, and rounds 15–19 made the opening emptier by chasing bots' time-to-Grove.
- **Matt's rule, which replaces round 20's:** "for now just go back to a near checkpoint when you die, not back to the very start". A fade re-forms her at full health at the nearest of the room's moon patch, `reform` point or her door. The glint drop and its second-fade loss stay. The sections below that describe round 20's "last rested patch" rule are out of date on this point.
- **Added:** creatures from 6–8 s in the hatch, the hub, the giant, the fork and the cellar; the hub's root cellar secret. The campfire stays safe.
- **Sim fix:** going up through a room's top edge no longer throws away the jump.
- **Open after r21:**
  - Hits and fades are above the brief: first-timers took 6–27 hits and 0–5 fades in five minutes. The biggest costs are thorns, the Grove and the well's pit and ambush.
  - Hub crossings cost 3–4 hits, because creatures return on every entry.
  - None of the eight first-timers found the hub's root cellar.
  - After about 2.5 minutes the problem is direction, not emptiness: two runs never got the claws in 6 minutes.
  - No first-timer has played the last changes: the cage's 96 px reach, the shorter thorn bed, the hatch's `reform`.

## Round 20: difficulty (after Matt played: "I feel like it's very easy")
Deployed. Details are in `memory/canopy.md` v20; the death and healing rules are in `memory/enemies.md` under "Fade and re-form".
- **Death has stakes.** A fade sends her to the last moon patch she *rested* at (stopping in it, not running through),
  in any room, else the hatch. She drops all her glints in a cluster, and a second fade loses them. The escape and chase
  checkpoints are unchanged, and the den balcony saves on a pass so the Keeper's retry is fair.
- **Healing:**
  - springboard lamps no longer heal;
  - cages heal +1;
  - a rest heals her fully.
- **Bigger hits:** the old burrback's and the Keeper's ram and slam wave cost 2.
- **Bot-only grace removed:** juvenile and Keeper windows, and the breathers creatures took after hitting her.
- **New encounters:**
  - a hawker over the upper limbs' fling gap;
  - a mixed ambush in the bower;
  - carriers and a hawker on the east fork on the way home.
- **Open after r20:**
  - **The Keeper is easy once you know the trick:** jump in the brace for 41–48 s and no hits. A first-timer who
    jumps when the ram starts never leaves phase 1. Add pressure for experts, and teach the brace better.
  - **The Lamp Grove's locked-in wave:** bots read it as a trap and died on purpose to escape. Thorns there put her back
    up to 2,700 px, an old round 10 rule.
  - **Creatures that don't read as creatures:** hawkers and lampwings look like the friendly moths, carriers look like
    moss, and the dangler hangs over the drop into the giant. This is an art job.
  - **The hole from the cellar to the fork:** she falls back repeatedly, and one reading gave y 2,728 in a room
    1,920 tall. Check for a bug.
  - **The well's moon patch** is hard to see among its moonbeams.
- **Matt has now played.** Ask him how the new difficulty feels before tuning it further.

Give this file to the next orchestrator agent. It says where the work stands, how the loop ran, and what to do next.
Read it with `CLAUDE.md`, `memory/README.md` and `PLAN.md`. Note that `STUDIO.md` describes the older greybox loop
(2026-10-18); the loop below is what actually ran from Canopy round 1 to 19.

## What this is
- **Lampfall** (repo: Opusvania): a 2D metroidvania drawn and scored entirely in code. It runs on TypeScript, PixiJS v8
  and a deterministic 60 Hz sim, with Web Audio sound generated in code.
- **The Canopy** (`?world=canopy`) is the first area of the real game. Matt's goal for it is
  "a first area people will definitely remember".
- Its references are Hollow Knight, Silksong, Nine Sols and Ori.
- **Play it:** https://mj1618.github.io/opusvania/?world=canopy&fresh. `&fresh` ignores the save slot.

## Where it stands
- **The latest review is round 18, at 8.5/10:** `docs/design/levels/reviews/canopy-r18.md`. The score went
  7.8 (r12) → 8.1 → 8.4 (r14) → 8.5. Read its ranked weaknesses and its step-back first.
- **Round 19 (deployed):** the details are in `memory/canopy.md` v19.
  - **Answers in shape, not light:**
    - Root doors are roots and bark, with silk bands tied round a stake on the side that opens them. Bots now say
      "shortcuts from the other side".
    - The seed door has carved seed sockets instead of floating dots.
    - The moon shard says "Two more, and a new light kindles."
    - The lamp's flame streams the way a fling would throw her.
    - r16–r18's glows that read as interface are gone.
  - **Other fixes:**
    - No room's camera shows above the room's top.
    - The chase's hook 7 catches a held diagonal, and a fall puts her back at hook 6.
    - The escape chimney's thorns are gone.
    - The upper limbs' thorn bed is in frame.
    - The glint count carries through doors.
    - A burrback's blocked cut shows a shield arc and clanks.
  - **Merged with the close-up art pass** (see below). All checks pass, and look:check passes 357 of 357 frames.
  - **Regression: the route.** The r19 bots reached the Grove later: 6:13, 5:23, and one quit at 4:45. In r18 the
    three took 2:50–3:49. They weren't stuck on the fixed items. They went east before having the wall jump, didn't climb
    the hub's east bank once they had it, and dropped through the east fork's hidden way down into the cellar and
    galleries and circled there. One said "nothing pointed me west". r19 removed the warm glow on the west exit once
    you've visited the room beyond, which may be part of it. **Fix this first**, and fix it with the world's shape, not a
    glow: sightlines, a landmark, closing the hidden drop until later.
- **Close-up art pass (in round 19):**
  - Done: the fallen giant's interior is heartwood, the hub has moss banks going back into the night, and the Grove's
    hills are rounded crowns.
  - Still to do (`memory/canopy-render.md`, "Round 19"):
    - the Keeper's den: packed earth and root hair, plus story litter;
    - the Keeper's carcass, as a split shell with folded legs;
    - the freed moths, as two-tone beating wings instead of paper chevrons;
    - the well's walls;
    - leaf texture in the Grove's crowns;
    - moss on walked tops and moss beards under them;
    - the giant's "dark discs" (the `pf-mass` painter).
- **Matt's playthrough:** after round 19 he said it felt very easy, which led to round 20. Ask him for fuller notes; his
  notes outrank everything.

## Open problems, roughly by impact
0. **The route after the wall jump (r19 regression):** see above. Also still open:
   - the seed door's sockets read as "knots waiting for something";
   - one bot cut the first lamp for 25 s before trying the Lamp;
   - players can't tell when a burrback is safe to hit (one flipped, looked dead, and got up);
   - the giant's pale wall still reads as a post at first;
   - the review's idea of meeting the first root door from the side that opens it is not built.
1. **Close-up art.** The interiors still look like flat cards: see the list above. The Keeper's silhouette is weak (r18 #8).
2. **The first ten minutes answer with glows.** The root door, the seed door and the aim line read as interface. Matt
   hates over-signposting, and r16–r18 drifted into it. Answer through physical shapes, and cut glows that read as UI.
   Check what round 19 changed here.
3. **The chase is short.** Seven hooks take about 3.7 s. Round 19 fixed hook 7 and where a fall puts you back; it still
   needs to be longer.
4. **The Keeper's first phase stalls players who miss the rage beat.** A bot that never learns faded 6 times in 4 minutes.
5. **The escape's front reads as more ground.** It is near-black with no lit edge or dust.
6. **The kin's scene is too small and too far.** The kin stays about 150 px away, the wing gesture is about 60 px, and
   the tear can't be read.
7. **The glide's text line crosses the moon** at the crown.
8. **Unanswered for Matt:** the glint trade or shop.

## How the loop ran
Each round:
1. **Builder.** One background agent works in the main worktree,
   `/Users/matt/code/worktrees/opusvania/game-design-rain-world-metroidvania-a8d617`, on branch
   `claude/reference-level-mapping-01e2a2`.
   - Its brief names the problems, the lanes, the checks and "done", and asks for a report.
   - Lanes: level/sim is `tools/levels`, `content/worlds`, `src/sim`, `tools/solve` and `memory/canopy.md`. Render is
     `src/render/**` and `memory/canopy-render.md`. Audio is `src/audio/**` and `memory/audio.md`.
   - Two writers never share a worktree. Parallel work, such as the art pass, gets `isolation: worktree` and is merged
     afterwards.
2. **First-timer bots** play fresh with real keys and keep a journal: `npm run firsttimer -- --world canopy`, three runs
   one after another. They find bugs and confusions; they are not the difficulty bar.
3. **Reviewer, every few rounds.** It works read-only in the release worktree on port 5214, scores against the
   references, and writes `docs/design/levels/reviews/canopy-rN.md`.
4. **Verify and deploy, from the release worktree.** That worktree is
   `/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/release`,
   on branch `canopy-play`. If `/private/tmp` was cleaned, make a new worktree of `canopy-play`.
   ```
   git merge -X theirs --no-edit claude/reference-level-mapping-01e2a2
   npx tsx tools/levels/canopy-check.ts && npm run typecheck && npm run lint && npm run test
   npx playwright test --workers=2
   npm run build
   git push origin claude/reference-level-mapping-01e2a2 canopy-play && git push origin canopy-play:main
   ```
   - Pushing `main` deploys to GitHub Pages.
   - Before merging, check `git log` and `git status` for builder work that is only half committed.
5. **Show Matt** after each deploy. Send short clips or a video in parts under 19 MB each (he watches on his phone, via
   Discord), with sound. Then start the next round without asking what's next.

## Tools
- **Level:**
  - Regenerate: `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`.
  - Check: `npx tsx tools/levels/canopy-check.ts`.
  - Also: the solver `tools/solve/canopy.ts`, the climbs test, `canopy-furniture --check` and `npm run look:check`.
- **Video:** `tools/playtest/route-video.ts plan → render --audio → finish`.
- **Clips:** `npm run clip -- --pickups ...`. Without `--pickups` it strips the creatures.
- **Dev-server ports:** builders 5212, reviewers 5214, video 5216, audio 5218, art 5220. `npm run shots` uses 5180.

## Rules learned the hard way
- Never `git add -A` in the shared worktree; add files by name.
- Never commit anything from `~/code/opusvania-refs/` or `tools/reference/mined/`. The extracted reference data is
  internal only.
- Sound is on by default; Matt approved its taste on 2026-10-31. Audio is generated in code only.
- Don't use computer use on Steam; Matt declined it.
- Matt's taste:
  - fun and a sense of place over metrics;
  - many choices at every moment;
  - teach through the world, never with text tutorials or arrows;
  - movement and combat are our strengths, level design is the weak spot;
  - try ambitious things before cutting them;
  - no sunk cost.
- Story calls: make small ones yourself; take big direction to Matt (`memory/story.md`).
- When a background agent reports but leaves work of its own running, stop it, so it doesn't wake later and collide
  with the next builder.
- Check plan usage each round, and pause near the 5-hour limit.

## Suggested next steps
1. Ask Matt to play the deployed build and send notes. Turn his notes into round 20.
2. Without notes: fix the route regression (open problem 0) and check it with three first-timers. Then continue the close-up art (den, carcass, moths, the Keeper's silhouette). Then lengthen the chase,
   light the escape's front, and bring the kin's scene closer.
3. Record a full human-like run as video for the next review (r21).
