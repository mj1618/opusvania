# User inbox

Things that need the user. Each item is marked **blocking** or **non-blocking**, with the default the orchestrator is using meanwhile. The user can answer inline; the orchestrator reads this at the start of every loop.

## Open

- **Non-blocking: concept direction.** From 12 randomised concepts, two independent critics both picked *DISTRAINT*: Kid Tallow, a disgraced boxer turned bailiff, seizes the sounds that give things legal existence in a feverish boomtown. Seize un-makes things, and throwing a sound builds with it. Summary in `docs/ideas.md`, full pitch in `docs/concepts/raw-L1-p4.md`. It's provisional until a greybox experiment shows it doesn't slow the action. **Default:** proceed. Veto or redirect any time.
- **Non-blocking: title.** The naming pass covered 58 candidates and checked the top 10 for conflicts (`docs/concepts/naming.md`). It recommends **TALLAGE**: no conflicts found on Steam, itch or IGDB, and tallage.com/.io appear unregistered. Carried sounds get the in-game noun "tonguestone". Runners-up are *Tonguestone* and *Kid Tallow*. **Default:** Tallage.
- **Non-blocking: gh token scope.** The `gh` token lacks the `workflow` scope, so pushes that change `.github/workflows/` go over SSH instead. To fix it, run `gh auth refresh -s workflow`.
- **Non-blocking: movement feel playtest (when you can, about 10 minutes).** Open https://mj1618.github.io/opusvania/ and play from the hub through the 14 gym rooms with keyboard or gamepad. Press `` ` `` for the tuning panel; the blind A/B preset toggle is moving to F3. Tell me which preset feels best (`opus`, `celeste` or `hk`) and anything floaty, sticky or laggy. Agent critique: `docs/reports/L2-playtest.md`. **Default:** the `opus` preset with the playtester's fixes.

## Resolved

- 2026-09-28: builds. Repo made public; GitHub Pages at https://mj1618.github.io/opusvania/.
- 2026-09-28: no real artwork or paid APIs for now; no Sentry; keep looping until stopped; concept is the orchestrator's call but must be unique.
