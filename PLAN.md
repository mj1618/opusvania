# Plan

## Goal
One scene, the Grove, that could sit next to Ori and the Blind Forest or Hollow Knight in a
screenshot or a ten-second clip and not look out of place: the place, the light, the character and
the way it moves. `docs/art-direction.md` is the brief and the bar.

## Where we are
The earlier game (levels, story, combat, enemies, audio, HUD, the old character) was deleted; git
history has it. What is left is a small skeleton:

- A deterministic 60Hz sim with the full movement set, all enabled: run, variable jump, coyote
  time, jump buffer, apex hang, double jump, dash, wall slide and wall jump, fast fall, corner
  corrections, one-way platforms.
- One scene (`content/scene/grove.json`): three screens wide, collision as tagged rects.
- A render skeleton with placeholders: the layer tree, a capsule for the character, an identity
  post stage, a light registry, a soft follow camera.
- Tools to judge the result: `npm run shots` (stills) and `npm run clip` (motion).

Next: the environment, the character (Ember) and the post stage are built in parallel, each in
its own directory, and judged from shots and clips.

## Deliberately out of scope
More scenes, a world map, story, enemies, combat, health, abilities to unlock, HUD and menus,
audio, saves, image or sound assets, mobile/touch. Nothing is added to the sim unless the look
or the feel of this one scene needs it.
