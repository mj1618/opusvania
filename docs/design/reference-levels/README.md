# Reference levels: the first areas of Hollow Knight, Silksong, Ori and Nine Sols, to scale (2026-10-30)

Matt asked for a complete map of each reference game's first area: layout, every hidden thing, start skills, every
enemy and its difficulty. Brief: `BRIEF.md`. One schema for all (`tools/reference/schema.ts`), one drawer, one
measure, applied to theirs and ours alike:

```
npx tsx tools/reference/export-area.ts <our world | room>           # ours -> ours/<id>/area.json
npx tsx tools/reference/area-svg.ts <area.json> [out.svg] --labels   # 1 px = 8 of our px, every game the same
npx tsx tools/reference/svg-png.ts <svg ...>                         # rasterise
npx tsx tools/reference/metrics.ts <area.json ...> --md              # the table below
```

| game | area | data | write-up |
|---|---|---|---|
| Hollow Knight | King's Pass, Dirtmouth, Forgotten Crossroads to False Knight + Vengeful Spirit | `hollow-knight/area.json` | `hollow-knight/README.md` |
| Hollow Knight: Silksong | Moss Grotto, Bone Bottom, the Marrow + Mosshome: Moss Mother, Silk Spear, to the Bell Beast | `silksong/area.json` | `silksong/README.md`, `silksong/EXTRACTED.md` |
| Ori and the Blind Forest DE | Sunken Glades + Spirit Caverns to the Spirit Tree | `ori/area.json` | `ori/README.md` |
| Nine Sols | Apeman Facility, Central Hall, Four Seasons Pavilion, Transport Hub to Tai-Chi Kick | `nine-sols/area.json` | `nine-sols/README.md`, `nine-sols/EXTRACTED.md` |
| ours | the test grove, the Downwood, Lanternroot | `ours/*/area.json` | |

**Confidence.** HK is now read from the installed game files (2026-10-30, `hollow-knight/EXTRACTED.md`): every
collider, hazard, breakable, hidden-area mask, enemy (position, HP, damage) and pickup, the camera and the knight; only
the door graph and what each door needs are still the randomizer's tables. Silksong is read from the installed game
too (`silksong/EXTRACTED.md`: tiles, colliders, gates, every enemy, pickup, bench, hazard and secret mask; only gate
requirements, enemy names and difficulty are hand-read). Nine Sols is read from the installed game too
(`nine-sols/EXTRACTED.md`: tile colliders, one-ways, climbable walls, hazards, hidden-path covers, every enemy with its
HP from its stat asset, chests, saves, the camera and Yi's body and moves); its room split, the door graph and gates,
and item names are still the mined randomizer data. The rest below was mined community data,
not the game files: the games were not installed when the researchers ran. Exact: room sizes, exits, gates, pickups and their
requirements (randomizer tables), HK enemy counts per room (extracted from the game by hallownest-calculator), enemy HP
(wiki datamines). Approximate: terrain (traced from map art: no interior platforms), enemy positions
(Ori: placed from walkthroughs), Ori enemy HP (missing). HK's extractor
(`tools/reference/mined/hollow-knight/extract.py`, UnityPy) is the template for the others.

## The numbers (tools/reference/metrics.ts; a screen = 1920 x 1080 of ours)

| | HK | Silksong | Ori | Nine Sols | our grove | Downwood | Lanternroot |
|---|---|---|---|---|---|---|---|
| screens (room boxes) | 357 | 513 (248 of air) | 88 | 170 (88 of air) | 4.4 | 145 | 14 |
| first-play minutes | ~45 | ~45 | ~33 | ~60 | ~2 | ? | ? |
| enemies per screen | 0.48 (0.33 on the path) | 0.26 (0.20 on the path; 0.53 per air screen) | 0.18 | 0.59 with event spawns; 0.42 placed (0.81 per air screen) | **2.93** | 0.33 | 2.25 |
| rooms with no enemy | 19 / 45 | 9 / 34 | 13 / 22 | 18 / 39 | 0 / 1 | 24 / 46 | 0 / 4 |
| densest room, enemies per screen | 2.4 | 0.8 (1.6 per air screen) | 1.0 | 2.6 (the lift-shaft ambush; 5.6 per air screen placed, the cliff band) | 2.9 | 4.0 | |
| mean difficulty (1-5) | 2.1 | 2.0 | 2.1 | 1.9 | 2.0 | 2.2 | 2.7 |
| enemy kinds | 18 | 23 | 9 | 16 | 2 | 9 | 6 |
| major pickups | 17 | 8 | 21 | 16 | 7 | 16 | 10 |
| secrets (hidden things) | 33 | 19 (+ 8 secret walls) | 27 | 19 (+ 19 hidden-path covers) | **0** | **0** | **0** |
| screens with nothing in them | 59% | 67% | 63% | 57% | 0% | 31% | 0% |
| longest run of empty screens | 16 | 16 | 6 | 8 | 0 | 5 | 0 |
| saves | 6 | 7 | 2 (+ save anywhere) | 5 | 0 | 6 | 4 |

## What the data says (each with its number)
1. **Scale matches.** HK's camera (FOV 24 deg at z -38.1, from the files) shows 28.8 x 16.2 units, so 1 unit = 66.7 of
   our px and its view IS ours (1920 x 1080); its knight (33 x 85 px) runs 553 px/s to our 576. Ori runs 546 px/s.
   Jumps differ: Ori 140, ours 272, HK 352. A screen of theirs is a screen of ours. Silksong uses the same camera
   (66.7 px/u) but Hornet is **33 x 139 px** (Wing 80 tall): a view is 7.8 Hornets tall and 13.5 Wings, so copy its
   traversal in hero heights (x0.58), its composition in screens. She runs 550 px/s and jumps ~391 px. Nine Sols'
   camera (FOV 68 deg at 240 u, from the files) shows 576 x 324 units, so 1 unit = 3.34 of our px: Yi is **33 x 100
   px**, runs 500 px/s, jumps ~244 px (full hold), and its corridors are tight (median clear height 480 px = 4.8 Yi).
2. **A first area is 30-60 minutes and 80-510 screens of box (40-250 of air; Silksong 513 / 248, half its boxes rock).** The route runs at 1.25-2 view-widths a
   minute. Our grove is a 2-minute toy; the Downwood (145) is in range on size.
3. **Enemies: 0.2-0.5 per screen on average, but not evenly.** 40-60% of rooms have none; the densest rooms reach
   grove density (HK: 1.6-2.4 per screen, e.g. the Platforms shaft's 9 gruzzers + 7 tiktiks, the Goam room's 19). Highs and lows, not a
   flat 0.3. Nine Sols, read from its files, sits higher than the mined guess (0.42 placed per box screen, not 0.27)
   and makes its peaks with event spawns: 29 of its 100 enemies wake for a gauntlet or the 16-enemy lift ambush. The Downwood copied the average (0.33) and got the flat version: that is "monotone".
4. **Enemies are easy one at a time.** Mean difficulty ~2/5. HK commons die in 2-3 hits and hit for 1 of 5 masks;
   Nine Sols grunts take 4-8 hits and hit for 17-25% of health. The challenge is in groups and in terrain.
5. **Everyone hides things; we hide nothing.** 20-36 secrets per area (0.08-0.3 per screen), 34-73% of all pickups.
   How: breakable walls and floors (HK 19), hidden rooms under a dark mask (HK 18), off the map or above the
   camera (Ori 4, Nine Sols rooftops), under water, behind a parry/hack. They sit close: Ori's median is 0.35
   view-widths off the route; HK's are 0-4 rooms off, 11 of its 18 hidden-area masks in critical-path rooms.
   Silksong paints 164 dark masks over open pockets (8 of them behind breakable walls); 19 things (22%) sit under
   them, 8 in critical-path rooms, nearly all currency; its majors hide by distance (4 of 8 in dead ends). Nine Sols
   paints 19 hidden-path covers (vents and niches that look like wall until entered); 5 pickups lie under them, the rest
   are alternate routes, 7 with a trap robot or an elite inside; 15 of 19 sit in critical-path rooms. **Our three levels have
   zero.** This is the largest single gap the data shows.
6. **Every dead end pays a major item** (HK 17 of 17, Ori 5 of 5, Nine Sols' one dead end holds the first ability;
   Silksong 3 of 6, and the other 3 pay a chest, a bench or the fast-travel station).
7. **The first ability is far, low, and doubles the world.** Ori: Spirit Flame at minute 4 at the end of a dead-end
   tunnel, Wall Jump at minute 15 in the bottom-left hollow; each nearly doubles the reachable space (27 -> 49 -> 73
   screens); an energy cell sits on the wall beside the Wall Jump tree, so it is used within seconds. Nine Sols:
   Tai-Chi Kick opens a puzzle one screen away and a door closing a 25-width loop. Silksong is the exception: Silk
   Spear (a side room in Mosshome) opens no room; space opens with the Bell Beast's fast travel and later Needolin.
8. **Locks are shown long before keys.** HK: 16 gated exits, all seen before they open; the game's final door is 2
   rooms from the well. Ori: a bramble wall in the first screen opens hours later. Nine Sols: 10 gates seen, 4 open
   within the hour. Keys (Ori's 8 keystones) lie on the route: keys are progress, not secrets.
9. **The opening is quiet.** Ori: an empty 3-screen glade. HK: King's Pass, 6 harmless enemies in 34 screens. Nine
   Sols: a long corridor, one parry dummy. The first fight is a set piece (Ori's 3 Hoppers right after Sein; HK's
   well). Silksong: 2 slow fliers in the first room, the first fight room (8 Mossgrubs, 2 hits each) as its side loop,
   no hazard in either, then a bench 1.45 view widths before the first boss at ~minute 6.
10. **The hub is quiet and crossed often.** Dirtmouth: 39 screens, 0 enemies, a bench, 6 locked doors. Nine Sols'
    Pavilion has no enemies. Silksong's Bone Bottom: 40 air screens, 13 exits, 3 enemies on its upper ledges, a
    bench and a shop. Saves come early (Nine Sols 0:30, HK ~4 min, Ori ~7 min, with save-anywhere at 2).
11. **Mostly horizontal.** Vertical : horizontal travel 0.26-0.47. Long bands, short shafts, one big vertical set
    piece (Ori's Spirit Caverns, Nine Sols' 9.9-screen lift shaft).
12. **Rooms vary 1.6 to 39 screens** (HK median 4.8): halls 50%, hubs 15-20%, shafts 13%, set pieces 13%.
    Silksong builds fewer, bigger rooms (median 11 screens of box, 6 of air; 11 loops in 34 rooms, 3.85 exits each).

## What it means for us
The grove's density is right for a clearing and wrong for an area: no reference keeps it up, and none drops to a flat
average either. The Downwood matched the averages and lost the peaks, and like all our levels it hides nothing. So a
first area should be **clearings at grove density joined by quiet travel with a movement problem in it, with secrets
hidden near the route in every stretch**, a quiet hub crossed again and again, locks shown early, and the first
ability far and low, used at once, doubling the world. `docs/design/levels/first-area.md` builds one to those numbers.
