# Reference levels: the first areas of Hollow Knight, Ori and Nine Sols, to scale (2026-10-30)

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
| Ori and the Blind Forest DE | Sunken Glades + Spirit Caverns to the Spirit Tree | `ori/area.json` | `ori/README.md` |
| Nine Sols | Apeman Facility, Central Hall, Four Seasons Pavilion, Transport Hub to Tai-Chi Kick | `nine-sols/area.json` | `nine-sols/README.md` |
| ours | the test grove, the Downwood, Lanternroot | `ours/*/area.json` | |

**Confidence.** All three are mined community data, not the game files: the games were not installed when the
researchers ran (Nine Sols is owned; HK and Ori to be bought). Exact: room sizes, exits, gates, pickups and their
requirements (randomizer tables), HK enemy counts per room (extracted from the game by hallownest-calculator), enemy HP
(wiki datamines, HK and Nine Sols). Approximate: terrain (traced from map art: no interior platforms), enemy positions
(HK: group centres; Ori and Nine Sols: placed from walkthroughs), Ori enemy HP (missing). The extractor for the real
files (UnityPy) is written for HK and waits for the install; it would replace the terrain and positions.

## The numbers (tools/reference/metrics.ts; a screen = 1920 x 1080 of ours)

| | HK | Ori | Nine Sols | our grove | Downwood | Lanternroot |
|---|---|---|---|---|---|---|
| screens (room boxes) | 329 | 88 | 172 | 4.4 | 145 | 14 |
| first-play minutes | ~45 | ~33 | ~60 | ~2 | ? | ? |
| enemies per screen | 0.31-0.46 | 0.18 | 0.27 | **2.93** | 0.33 | 2.25 |
| rooms with no enemy | 16 / 48 | 13 / 22 | 21 / 39 | 0 / 1 | 24 / 46 | 0 / 4 |
| densest room, enemies per screen | 5.5 | 1.0 | 1.2 | 2.9 | 4.0 | |
| mean difficulty (1-5) | 2.3 | 2.1 | 2.3 | 2.0 | 2.2 | 2.7 |
| enemy kinds | 30 | 9 | 11 | 2 | 9 | 6 |
| major pickups | 23 | 21 | 15 | 7 | 16 | 10 |
| secrets (hidden things) | 36 | 27 | 20 | **0** | **0** | **0** |
| screens with nothing in them | 65% | 63% | 66% | 0% | 31% | 0% |
| longest run of empty screens | 15 | 6 | 9 | 0 | 5 | 0 |
| saves | 8 | 2 (+ save anywhere) | 5 | 0 | 6 | 4 |

## What the data says (each with its number)
1. **Scale matches.** HK draws 64 px per unit, so its view IS ours (1920 x 1080); its knight runs 531 px/s to our
   576. Ori runs 546 px/s. Jumps differ: Ori 140, ours 272, HK ~330. A screen of theirs is a screen of ours.
2. **A first area is 30-60 minutes and 80-330 screens of box (40-190 of air).** The route runs at 1.25-2 view-widths a
   minute. Our grove is a 2-minute toy; the Downwood (145) is in range on size.
3. **Enemies: 0.2-0.5 per screen on average, but not evenly.** 40-60% of rooms have none; the densest rooms reach
   grove density (HK: 4-5.5 per screen, e.g. the Platforms shaft's 9 gruzzers + 7 tiktiks). Highs and lows, not a
   flat 0.3. The Downwood copied the average (0.33) and got the flat version: that is "monotone".
4. **Enemies are easy one at a time.** Mean difficulty ~2/5. HK commons die in 2-3 hits and hit for 1 of 5 masks;
   Nine Sols grunts take 4-8 hits and hit for 17-25% of health. The challenge is in groups and in terrain.
5. **Everyone hides things; we hide nothing.** 20-36 secrets per area (0.08-0.3 per screen), 34-73% of all pickups.
   How: breakable walls and floors (HK 18 of 26), hidden rooms behind fake walls (HK 8), off the map or above the
   camera (Ori 4, Nine Sols rooftops), under water, behind a parry/hack. They sit close: Ori's median is 0.35
   view-widths off the route; HK's are 0-4 rooms off, 11 of 26 on the critical path itself. **Our three levels have
   zero.** This is the largest single gap the data shows.
6. **Every dead end pays a major item** (HK 17 of 17, Ori 5 of 5, Nine Sols' one dead end holds the first ability).
7. **The first ability is far, low, and doubles the world.** Ori: Spirit Flame at minute 4 at the end of a dead-end
   tunnel, Wall Jump at minute 15 in the bottom-left hollow; each nearly doubles the reachable space (27 -> 49 -> 73
   screens); an energy cell sits on the wall beside the Wall Jump tree, so it is used within seconds. Nine Sols:
   Tai-Chi Kick opens a puzzle one screen away and a door closing a 25-width loop.
8. **Locks are shown long before keys.** HK: 16 gated exits, all seen before they open; the game's final door is 2
   rooms from the well. Ori: a bramble wall in the first screen opens hours later. Nine Sols: 10 gates seen, 4 open
   within the hour. Keys (Ori's 8 keystones) lie on the route: keys are progress, not secrets.
9. **The opening is quiet.** Ori: an empty 3-screen glade. HK: King's Pass, 7 harmless enemies in 32 screens. Nine
   Sols: a long corridor, one parry dummy. The first fight is a set piece (Ori's 3 Hoppers right after Sein; HK's
   well).
10. **The hub is quiet and crossed often.** Dirtmouth: 36 screens, 0 enemies, a bench, 6 locked doors. Nine Sols'
    Pavilion has no enemies. Saves come early (Nine Sols 0:30, HK ~4 min, Ori ~7 min, with save-anywhere at 2).
11. **Mostly horizontal.** Vertical : horizontal travel 0.26-0.47. Long bands, short shafts, one big vertical set
    piece (Ori's Spirit Caverns, Nine Sols' 8.5-screen lift).
12. **Rooms vary 1.5 to 36 screens** (HK median 4.4): halls 50%, hubs 15%, shafts 13%, set pieces 13%.

## What it means for us
The grove's density is right for a clearing and wrong for an area: no reference keeps it up, and none drops to a flat
average either. The Downwood matched the averages and lost the peaks, and like all our levels it hides nothing. So a
first area should be **clearings at grove density joined by quiet travel with a movement problem in it, with secrets
hidden near the route in every stretch**, a quiet hub crossed again and again, locks shown early, and the first
ability far and low, used at once, doubling the world. `docs/design/levels/first-area.md` builds one to those numbers.
