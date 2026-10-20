# Reference maps: the brief (2026-10-20)

Matt: "grab some of the maps for the reference games and see how they are laid out and whether that could give you
some clues." Our metroidvania levels (wood area 1, Lanternroot) came out disjointed, bland, obvious and not fun, while
our movement, combat and art are good. We want to learn, from real maps, how the great games lay out their opening
areas and their worlds, in numbers and rules we can design and check against.

## Each researcher
1. Find good full maps of your games: the in-game map fully revealed, fan-made room-accurate maps (vgmaps.com,
   game wikis, fextralife, ign, interactive maps), and per-area maps of the opening areas. Download them as image files
   into `shots/reference/maps/<game>/` (gitignored: never commit them) and record each source URL in
   `shots/reference/maps/<game>/sources.txt`. Prefer high-resolution, room-accurate maps. If a map is too big to view
   whole, crop and scale it with `sips` or Python (PIL if available) and look at the pieces.
2. Actually look at them, and measure the opening areas (the first 20–40 minutes) and the world's structure:
   - size: rooms and screens in the area, rough screens per minute of play, room size mix (single-screen, long halls,
     tall shafts, big set-piece rooms);
   - shape: the hub (if any) and how far everything is from it; loops (how many, how long); dead ends and what's in
     them; branching factor; exits per room; one-ways; how and when shortcuts open; how many times the player passes
     through the same space and from which sides;
   - verticality: the ratio of vertical to horizontal travel, and where the big vertical moves are;
   - pacing on the map: where benches/saves, bosses, ability pickups, NPCs, secrets and the area's set pieces sit;
     the gaps between them; where the quiet rooms are;
   - gating: what is visible but not reachable at first, how many locks the area shows, when each opens;
   - landmarks and orientation: what you can see from where, the area's spine, how one area hands off to the next;
   - the critical path versus the whole area (screens, time), and how much is optional.
3. Write `docs/design/reference-maps/<game-slug>.md`: the maps you used (paths + sources), the measurements, a
   plain-language description of each opening area's layout (as a simple ASCII or box sketch where it helps), and the
   10 most useful **rules** this game's layout teaches, each stated so a level designer could follow and check it
   ("every dead end holds a reward", "the hub is passed through at least 4 times in the first hour"...). Then say what
   each rule would have changed in our wood area 1 (`docs/design/regions/wood-area1-v3.md`) and Lanternroot
   (`docs/design/levels/proto-1.md`).

Be concrete and quantitative where you can; mark guesses as guesses. Don't spawn sub-agents, don't touch other files,
don't commit. Report: the files, and your top 5 rules.
