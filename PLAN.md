# Plan: Lampfall

## Goal
A metroidvania whose look and feel could sit next to Ori and the Blind Forest or Hollow Knight. The story is in
`memory/story.md`: Wing the moth flies by the real moon through the last firefly's false lights to bring her kind
home. The story is told by the world and the play, not by cutscenes or text. `docs/art-direction.md` is the visual brief and the bar.

## Where we are (2026-10-18 morning)
**Wood area 1, in greybox, is ready for Matt to play.** It runs from the hatching branch (`wood-hatch`, the only painted
room; art is paused) to the crown of the great oak: 10 rooms on the main path, plus a west root road. Six review rounds
took it from "random and disjointed" to one journey. The reviewers' verdict: in structure and staging it is now a peer
of the reference first areas (art aside). The next real gate is a human playing it.

**Measured on HEAD** (1fd2846): human-like bots got through 7 of 9 runs, in 15–17 minutes (people will take longer),
with 0–2 deaths. Each new thing arrives about a second apart.

**What's in area 1:**
- **Teaching:** the first five minutes teach the lamp's catch, throw and snuff, one idea per screen.
- **R6:** the glidewalk, with its lamp chain.
- **The oak:** the hub, with its glimpse of the firefly and Tatter's hollow.
- **R8:** the hawkers' clearing, with the rhythm hawker and a dark door.
- **R9:** the silk hall, with the dangler and the beetle together.
- **The roots:** a nest of carrier ants.
- **The den, under the oak:** the old burrback, a three-phase boss. Its staged death breaks the floor and grants the
  claws.
- **The climb:** up the inside of the oak to the crown.
- **The finale:** the moth cloud lifts off with Tatter.

**Known gaps:**
- The west root road is never found, because there's no reason to go west.
- The descent and the oak's interior still read plainly in grey.
- Only 4 creature kinds.
- No sound.
- The bots can't judge feel.

**Next steps:**
- Matt plays area 1.
- Then iterate on his notes.
- Then build area 2 (the high wood: the web, the Weaver, the canopy road) with the same onion loop.

**How to play it:** `npm run dev`, then http://localhost:5180 (a new game: `?fresh`). Keys:
- arrows or WASD to move;
- Z or Space to jump, held while falling to glide;
- C to attack, with up or down;
- Tab for the map;
- R to go back to the last rest;
- Enter for full screen.

**The design:** the through-line is "up, back to the sky" (`docs/design/regions/wood-area1-director.md`; the round
plans and reviews are in `docs/design/regions/reviews/`).

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
1. Matt plays wood area 1 and gives notes; the notes outrank every metric (`STUDIO.md`).
2. Iterate area 1 on those notes, using the onion loop: fix, then a human-like video review and a first-timer agent.
3. Build area 2, the high wood (the web gauntlet, the Weaver, whose boss framework is already in `lab-weaver`, and the
   canopy road), as one chunk. Then iterate it to the bar, then run a layer review of the whole wood.
4. Art and sound come at the end (Matt, 2026-10-18).
