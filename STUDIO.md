# Studio loop

The orchestrator runs one loop, as many times as it takes:

1. **Fan out.** Give each agent one directory and one clear target (an environment layer in
   `src/render/scene/layers/`, the character in `src/render/character/`, post in
   `src/render/post/`). Agents work in parallel and do not edit each other's files or the shared
   contract (`src/render/contract.ts`, `src/render/stage.ts`, the layer tree); they ask for changes.
2. **Gather.** Merge, run `npm run check`, then `npm run shots` and a few `npm run clip`s.
3. **Review.** Look at the pictures and clips next to real Ori / Hollow Knight frames. Judge them
   by `docs/art-direction.md`: value ordering by depth, the path reading, nothing rectangular,
   nothing still, fluid animation. Be specific about what is worst.
4. **Decide.** The worst thing on screen is the next task. Go to 1.

The quality bar is the art-direction doc, not a checklist of features. A loop that does not make a
screenshot or a clip visibly better was wasted.
