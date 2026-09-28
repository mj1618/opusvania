# User inbox

Things that need the user. Each item is marked **blocking** or **non-blocking**, with the default the orchestrator is using meanwhile. The user can answer inline; the orchestrator reads this at the start of every loop.

## Open

- **Non-blocking: concept direction.** From 12 randomised concepts, two independent critics both picked *DISTRAINT*: Kid Tallow, a disgraced boxer turned bailiff, seizes the sounds that give things legal existence in a feverish boomtown. Seize un-makes things, and throwing a sound builds with it. Summary in `docs/ideas.md`, full pitch in `docs/concepts/raw-L1-p4.md`. It's provisional until a greybox experiment shows it doesn't slow the action. **Default:** proceed. Veto or redirect any time.
- **Non-blocking: title.** "Distraint" is already a 2015 game. Working title is **Tallage** (the city). A proper naming pass with a trademark search comes later.
- **Non-blocking: gh token scope.** The `gh` token lacks the `workflow` scope, so pushes that change `.github/workflows/` go over SSH instead. To fix it, run `gh auth refresh -s workflow`.

## Resolved

- 2026-09-28: builds. Repo made public; GitHub Pages at https://mj1618.github.io/opusvania/.
- 2026-09-28: no real artwork or paid APIs for now; no Sentry; keep looping until stopped; concept is the orchestrator's call but must be unique.
