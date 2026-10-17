# Studio loop

The game is built one **piece** at a time: a scene, then a part of a scene, each brought to the bar before the next
starts. The bar is AAA, as judged against Ori and the Blind Forest, Hollow Knight and Nine Sols. The first piece is
scene 1, `docs/design/scenes/01-hatching-branch.md`. The whole-game plan is `docs/design/`. The test grove is a test
bed off to the side (debug panel), not part of the game.

For each piece, the orchestrator runs this loop as many times as it takes:

1. **Brief.** Each piece has a brief in `docs/design/scenes/` with its beats, its rules and a numbered "done means" list.
2. **Implement.** Sub-agents work in parallel. Each owns one directory and one clear target (an environment layer
   in `src/render/scene/layers/`, the character in `src/render/character/`, post in `src/render/post/`, the sim,
   audio). They don't edit each other's files or the shared contract (`src/render/contract.ts`,
   `src/render/stage.ts`, the layer tree); they ask for changes. Each one runs `npm run check` and looks at its
   own shots before reporting.
3. **Gather.** Merge, run `npm run check`, then `npm run shots` and the clips the brief needs.
4. **Review.** A separate review sub-agent, which did not write the code, looks at the shots and clips next to
   real Ori / HK / Nine Sols frames and plays the piece through the debug API. It judges each "done means" item as
   pass or fail with specifics, and ranks the three worst problems on screen. It is told to be harsh: "good for an
   indie" is a fail.
5. **Decide.** If any item fails, the worst problems become the next implement round (step 2). When every item
   passes and the orchestrator agrees from the pictures, Matt plays it. His word ends the loop, and the next
   piece starts.

A round that does not make a screenshot, a clip or the feel visibly better was wasted. AI scores are lint, not the
bar (`memory/ai-critics.md`): the orchestrator looks at the pictures itself before calling anything done.
