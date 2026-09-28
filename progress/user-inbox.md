# User inbox

Things that need the user. Each item is marked **blocking** or **non-blocking**, with the default the orchestrator is using meanwhile. The user can answer inline; the orchestrator reads this at the start of every loop.

## Open

- **Non-blocking: concept direction.** From 12 randomised concepts, two independent critics both picked *DISTRAINT*: Kid Tallow, a disgraced boxer turned bailiff, seizes the sounds that give things legal existence in a feverish boomtown. Seize un-makes things, and throwing a sound builds with it. Summary in `docs/ideas.md`, full pitch in `docs/concepts/raw-L1-p4.md`. It's provisional until a greybox experiment shows it doesn't slow the action. **Default:** proceed. Veto or redirect any time.
- **Non-blocking: title.** The naming pass covered 58 candidates and checked the top 10 for conflicts (`docs/concepts/naming.md`). It recommends **TALLAGE**: no conflicts found on Steam, itch or IGDB, and tallage.com/.io appear unregistered. Carried sounds get the in-game noun "tonguestone". Runners-up are *Tonguestone* and *Kid Tallow*. **Default:** Tallage.
- **Non-blocking: gh token scope.** The `gh` token lacks the `workflow` scope, so pushes that change `.github/workflows/` go over SSH instead. To fix it, run `gh auth refresh -s workflow`.
- **Non-blocking: movement feel playtest (when you can, about 10 minutes).** Open https://mj1618.github.io/opusvania/ and play from the hub through the 14 gym rooms with keyboard or gamepad. Press `` ` `` for the tuning panel; the blind A/B preset toggle is moving to F3. Tell me which preset feels best (`opus`, `celeste` or `hk`) and anything floaty, sticky or laggy. Agent critique: `docs/reports/L2-playtest.md`. **Default:** the `opus` preset with the playtester's fixes.

## Resolved

- 2026-09-28: **User: the game is super boring and basic. Fun is the top criterion.** Recorded in STUDIO.md §1d.

- 2026-09-28: builds. Repo made public; GitHub Pages at https://mj1618.github.io/opusvania/.
- 2026-09-28: no real artwork or paid APIs for now; no Sentry; keep looping until stopped; concept is the orchestrator's call but must be unique.

## L3 Seize/Levy experiment — human checks (non-blocking; brief §7)
Verdict PASS (docs/reports/L3-verdict.md). Clips: clips/l3-seize-wall, l3-pink-spring, l3-heavy-plate, l3-pit-seize-levy-count (.mp4/.gif/-sheet.png). Live: hub right-hand doors L (Lot 7), K (control), T (The Pit), S (Stairwell). Keys: V/I seize, B/O levy, C jab, X slip.
1. Tooltip test: in Lot 7 cold, do you try to seize everything within 2 minutes?
2. Punch: does a wall going silent land like a hit? (seizeTake hitstop 5 vs 8)
3. Weight: heavy = power or encumbrance? feather->middle felt in one jump?
4. Bag: do you always know what Levy will throw (NEXT caret)?
5. Put-back: do you levy for fun, or only when forced?
6. Disarm: can you see a Barker can't lunge and is chasing its sound?
7. Sound: brown/pink hums pleasant over 10 minutes? does the seize cut sell sound = existence?
8. Is the control room fun on its own?
9. Palette readable (incl. a CVD filter)?
