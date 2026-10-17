# Plan: Lampfall

## Goal
A metroidvania whose look and feel could sit next to Ori and the Blind Forest or Hollow Knight. The story is in
`memory/story.md`: Wing the moth flies by the real moon through the last firefly's false lights to bring her kind
home. The story is told by the world and the play, not by cutscenes or text. `docs/art-direction.md` is the visual brief and the bar.

## Where we are (2026-10-18)
**Wood area 1, in greybox, is being iterated on.** It runs from the hatching branch (`wood-hatch`, the only painted
room; art is paused) through to the crown of the great oak: 11 rooms, a target of about 35 minutes.

**The rebuild.** It follows the director's redesign (`docs/design/regions/wood-area1-director.md`), which came after
two review rounds and the first-timer reports found the chunk "random and disjointed". The through-line is "up, back
to the sky". The core set:
- **The lamp,** with three moments: caught, thrown and snuffed. Each moment has a predator that hunts it: the beetle,
  the dangler and the hawker.
- **Glide and claws.**
- **A rule for every room:** the lit line is fast, the dark line is slow and safe.

**Systems in place:**
- Rooms, exits, saves, moon patches, glades and the map.
- The level kit: thorns, bark, caps, gates, triggers, camera zones and story holds.
- Lures (the lamps).
- Creatures: the juvenile beetle, the beetle, the old burrback, the hawker, the dangler, and the web and weaver.
- The Weaver boss, in `lab-weaver` (area 2).
- Finds: the moth-stone, firefly signs and moonlit hollows.
- Feel: hitstop, shake, hurt feedback, motes, the throw arc.
- Greybox staging: the vista and title, the firefly glimpse, Tatter, the moth flight to the oak, the crown cloud.

**Testing:**
- Persona bots: `npm run playtest`.
- Human-like playthroughs, rendered as video: `npm run humanplay -- run`.
- First-timer agents: `npm run firsttimer`.
- Reviews are in `docs/design/regions/reviews/`.

**The process:** `STUDIO.md` (the onion; cohesion first, the rubric as lint; no sunk cost) and
`docs/design/quality-bar.md`. **The test grove** (`?room=test-grove`) is the old demo level, kept as a test bed.

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
