# Reference maps: what the great games' layouts teach (2026-10-20)

Matt asked us to study real maps for clues to why our metroidvania levels (wood area 1, Lanternroot) came out
disjointed, bland and obvious. Three researchers measured the opening areas and worlds of Hollow Knight (and
Silksong), both Ori games, Super Metroid, Nine Sols and Animal Well, from room-accurate maps and randomizer/door data:
`hollow-knight.md`, `ori.md`, `super-metroid.md`, `nine-sols.md`, `animal-well.md`. The maps themselves are in
`shots/reference/maps/<game>/` (gitignored, with sources).

## The finding
**We design paths; they design places.** In every reference the way on is a thin thread through a large web of
optional, rewarding space. In ours almost every room is on the way on, so there is nothing to discover and nothing to
choose, which reads as obvious and monotone.

- Main path share of an area's rooms: Hollow Knight's Crossroads 7%, Greenpath 27%, Super Metroid's first hour ≤ 40%.
  Ours: wood area 1 ~85%, Lanternroot 80%, and all five new skeletons 68–100% (`node docs/design/skeletons/score.mjs`).
- Dead ends: a quarter of the references' rooms, and they all pay. Ours: 0–4 per level.
- Locks you can see: the Crossroads shows 8 locked ways for 3 open ones. Ours show about 1 for 2.
- Size: Hollow Knight's first 30 minutes cover 15–25 rooms and the Crossroads alone is 41. Our areas are 10–19 places.

Even when told to make places, our designers drew journeys: the bias is ours, so the rules below must be checked by
numbers (`score.mjs`), not trusted to a design's prose.

## The rules (where all the games agree)
Each is checkable on a map. Numbers are the references' ranges.

1. **The main path is a minority.** At most 30–40% of an area's rooms lie on the way to its next ability or exit.
2. **About a quarter of rooms are dead ends, and every dead end pays** something that changes the numbers: an
   ability, health or energy, a key, the map, a bench, an NPC with a use, a challenge room. Never currency alone.
3. **Show the locks and the goal before the way.** Two different locks in the first room or two, opened an hour
   later (Super Metroid, Ori's energy door). At least 2 visible locks per open exit early (Hollow Knight). The area's
   goal seen, dead or sealed, from the main path well before it can be entered (Ori, Nine Sols).
4. **A hub close to the start, crossed again and again.** At most a few rooms (≤ 8 screens) from the start, at least
   5 exits with 3 visibly locked at first, crossed 4+ times in the first 35 minutes, changed on each return, and the
   place shortcuts open into.
5. **Loops everywhere once the first tools arrive.** A tree before the first ability, a web after it: one loop per
   6–10 rooms, loops short (4–9 rooms; Animal Well's median is 6 screens), each early ability at least doubling the
   reachable space.
6. **A new ability goes to work at once, then reopens the known world.** Got at the far, low end of its branch;
   the room can only be left with it; a lock it opens within 1–3 rooms; and later 7+ things across the map, mostly in
   rooms already seen. About a third of an area's pickups wait for a later ability.
7. **Required finds in side pockets.** At least two doors on the main path need items found off it (Ori's
   keystones), and the door shows how many. Exploring is required, and nothing says where.
8. **Rooms vary wildly.** Single-screen pockets hold the rewards, long halls carry the travel, 2–3 tall shafts are
   the junctions (5–6 exits each), and a few giant set pieces hold the landmarks and the moments. The biggest space
   is at least 6× the median one. No two neighbours the same shape.
9. **One spine.** The opening descends (Super Metroid, Hollow Knight) or spirals around the start (Ori); ordinary
   areas are horizontal bands; one tall set-piece shaft per act.
10. **Rewards dense, rests placed.** A find about every screen (never more than 4 screens bare), a big find every
    8–10 screens, a rest within 2 rooms of each entrance and one just before every boss. Quiet rooms are optional dead
    ends with a rest, so the player chooses when to breathe.
11. **The first pass is quiet, the return is changed.** After the first ability the rooms you came through get new
    creatures, light or locks, so backtracking is a new scene (Super Metroid).
12. **One screen, one problem** for puzzles and secrets: the tell, the lock and the key fit in one view (Animal Well).

## What to do with it
Design an area as a place first: lay out the web of rooms (with its pockets, dead ends, shafts, loops and hub), then
thread the main path through it, then gate it. Check the layout with `score.mjs` before any room is built, and
redesign until the numbers pass.
