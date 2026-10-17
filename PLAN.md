# Plan: Lampfall

## Goal
A metroidvania whose look and feel could sit next to Ori and the Blind Forest or Hollow Knight. The story is in
`memory/story.md`: Wing the moth flies by the real moon through the last firefly's false lights to bring her kind
home. The story is told by the world and the play, not by cutscenes or text. `docs/art-direction.md` is the visual brief and the bar.

## Where we are
**Rooms (tech stage 0, 2026-10-17).** The page boots into scene 1, `wood-hatch` (`content/rooms/wood-hatch.json`,
blocked out: the hatching branch, the promise gap, the bend down, the drop; plain wood-kit art). Abilities are
gated in the sim (it starts with none of glide, wall jump, double jump, dash). `?room=test-grove` (or the debug
panel's Room list) loads the old demo level as a test bed. memory/rooms.md.

The test grove (`content/rooms/test-grove.json`), about three screens wide, has:
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
Art is paused (Matt, 2026-10-18). Scene 1 keeps its art as the wood's look target. The game is now designed and
played in greybox one region at a time: `STUDIO.md` has the loop. First region: **the wood** (about 12 rooms, 35–45
min, glide and wall jump, the first predators, the Weaver).
- **Phase 0:** a greybox render mode, the lamp verb (pull, caught, snuff) in a lab room, the wood's paper design
  (`docs/design/regions/wood.md`), and a playtest harness with persona bots and telemetry.
- **Phase 1:** a multi-room engine (exits between rooms, moon patches that save and respawn, glades that give
  abilities, a map), then every wood room greyboxed from the paper design.
- **Phase 2:** loop the region (playtest → design review → revise) until it meets STUDIO.md's exit criteria and Matt
  says it's fun. Then the valley. Art is left until the end (Matt, 2026-10-18).
