# Plan: Lampfall

## Goal
A metroidvania whose look and feel could sit next to Ori and the Blind Forest or Hollow Knight. The story is in
`memory/story.md`: Wing the moth flies by the real moon through the last firefly's false lights to bring her kind
home. The story is told by the world and the play, not by cutscenes or text. `docs/art-direction.md` is the visual brief and the bar.

## Where we are
The demo level: one scene, the Grove (`content/scene/grove.json`), about three screens wide. It has:
- A deterministic 60Hz sim with the full movement set (run, variable jump, coyote time, jump buffer, apex hang,
  double jump, dash, glide, wall slide and wall jump, fast fall, corner corrections, one-way platforms), the blade,
  health with fade and re-form.
- Wing, the moth (`src/render/character/vesper/`).
- Glints, giving, three lanterns and the heart of the grove (the scene's goal).
- Two creatures, the burrback and the lampwing.
- A HUD.
- The painterly layered environment, post, camera, and muted gameplay audio.
- Tools: `npm run shots` (stills) and `npm run clip` (motion).

The earlier games (the L-loop levels, Kid Tallow, the "Kept World" story and its prologue, the other hero skins) were
deleted; git history has them.

## The plan for the whole game
`docs/design/` (start at its README): pillars, the ability chain, the world map and scope tiers, creatures and
bosses, the journey, the look and sound, the tech roadmap, and the open questions for Matt. Tier 1, the first
target, is the wood and the valley of lamps as a standalone chapter (27 rooms, 25 lamps, two bosses, 1.5–2 h).
The demo level is a test bed (`test-grove`) and constrains nothing in the real game.

## Next
One increment at a time, each played by Matt and polished to the bar before the next (`docs/design/README.md`,
"How we build it"). First: the lamp verb in the test grove as a greybox (pull with swirl, caught and beat free, snuff
with the blade, its predators scatter). Matt plays it. Then the lamp brought to the bar (flame, snuff, freed moths,
the two-light re-key), then tech stage 0 and the first real room, the hatching branch.
