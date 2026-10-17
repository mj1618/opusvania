# Chunk 1 (wood area 1), iteration round 1: the plan

The orchestrator's synthesis, 2026-10-18. Sources:
- the level and pacing review (`chunk1-level-r1.md`);
- the feel review (`chunk1-feel-r1.md`; its fixes are already in progress with the two feel engineers);
- the bots' region run (`memory/playtest-harness.md`, three level bugs);
- the rescope (`docs/design/regions/wood.md`, rescope section: what area 1 must add to reach about 35 minutes);
- `docs/design/quality-bar.md`.

The first-timer journals (`chunk1-firsttimer-*-r1.md`) arrive during this round and feed round 2.

The goal is **area 1 of the wood** (hatch → well, plus the new branch) at **about 35 minutes for a first-timer**, passing the room and chunk rubric.

## Ranked work

| # | Problem | Fix | Owner |
|---|---|---|---|
| 1 | R10's mini-boss can be skipped (the wick throw lands her on the gate's top; a pogo off the shell reaches it too) | Close the air over the gate (a lintel, or a gate up to the roof). Move the wick so its pull can't reach the pit. Add a test: no route reaches glade 2 with the old burrback alive | level |
| 2 | Level bugs the bots found: R9's west door is blocked by the DJ ledge's stalk, and its spawn is inside the stalk. R8 going west: wick-bark's pull drags the jump at the root post 22 px short | Fix the geometry, and add tests | level |
| 3 | No loop, and the backtracking is doubled: about 9,000 px through cleared rooms to the well, then again after wall jump | Move the well's entrance to R9's dead end, so the lock and its key meet and the route becomes a loop. Add a high route east from the crown | level |
| 4 | Too few finds and only one reward kind (3 optional finds in about 20 minutes, all 5 moths) | Rescope finds: 4–6 more lamps, the area's moth-stone (it draws the map), two firefly signs, and one moonlit hollow (a small upgrade). Optional finds go from one every ~5 minutes to one every 2–3 | level, plus a small sim piece for the moth-stone and hollow if needed |
| 5 | Rooms are flat floors with one feature (R8 above all, R2 a staircase of boxes, R3 forgettable) | R8 and R9 grow to about 4 screens each, with height, two lines through them and composed encounters (hummocks across the hawker's dive lane). R2 gets a fallen trunk with real drops. R3 gets a root knot around its first wick. Every room gets one landmark you could sketch from memory | level |
| 6 | Creatures don't threaten. Each encounter is one creature under one lamp, the hawker never dives, and there are too few kinds | Add the **dangler** (a small spider that drops on silk, a small version of the Weaver). Overlap threats: R9's burrback moves onto the platform, plus at least 4 creature-plus-terrain combinations. The hawker must actually engage | creatures (dangler, hawker), then level placement |
| 7 | The new branch from the rescope: R14 `wood-caps` (the cap stair) with **bounce caps**, the dangler, the moth-stone, the secret hollow, 2–3 lamps and a drop back to the hub | Build bounce caps (a level-kit piece), then build the room | kit, then level |
| 8 | The hub doesn't read as a hub: no camera zones, its height and locks never come on screen | Camera zones: a rest frame at its patch, a look-up under the shaft | level (room camera data) |
| 9 | R6's last gap tests the walk-off glide nobody taught. The first gap's landing starts off-screen, and a death costs about 40 s | Teach the walk-off at the first gap (a low roof). Add a camera zone and a moon patch before the test | level |
| 10 | Rest breaks between about minute 10 and 17.5, and R6 has no patch | Patches in R6 and in R8's dark half (every 4 minutes or less) | level |
| 11 | The pogo has no safe intro (29 of 108 simple timings cross the first seed-case gap) | One bounce-in-place seed-case before the gap, over a safe floor | level |
| 12 | Set piece and story beats missing (R2 vista: no swarm, no title, no stragglers; the hub glimpse; R3's dead moth) | Greybox stand-ins: the swarm as a dot stream into the valley's lamps, a vista hold with the title text, the stragglers, a camera pan up to the firefly glimpse, the dead moth. Tatter's want (a root ladder she cuts down so it can climb): stage it in greybox | render staging (after the feel render work lands), plus level for triggers |

Done for this round when: `npm run check` passes, the bots' region run gets through with no skips (a test for #1), and every room has been re-shot. Then a fresh review panel scores it again. That means level, feel, and two new first-timers.
