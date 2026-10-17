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

## Next
Bring the story into play one increment at a time, each polished to the bar before the next. First the core verb:
a lamp that pulls Wing in, a swarm of moths circling it, and putting it out to free them, built in the Grove.
Matt plays it, and then we decide what comes next.
