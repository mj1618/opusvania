# Canopy round 22: creature variety and hit feel

Matt, 2026-11-01: "there could be more variety of enemies, and attacking them could be more satisfying… currently the
enemies are too boring and monotonous."

## What the Canopy has now (counted from `content/worlds/canopy-rooms.json`)
| Kind | Count | How it is drawn | Attack shape |
|---|---|---|---|
| carrier | 22 | the burrback rig at 0.5 | bites on its trail |
| juvenileBurrback | 14 | the burrback rig at 0.72 | walks into her |
| burrback | 13 | the burrback rig | brace, ram |
| lampwing | 11 | the moth art | dive |
| hawker | 7 | the moth art | dive |
| dangler | 5 | Lanternroot spider piece | drop on silk |
| web + weaver, old burrback, Keeper | 1 each | | |

About 50 of the 74 regular creatures are **one rig at three sizes**, and 18 more are **one moth**. The r20 notes
already say hawkers and lampwings read as the friendly moths and carriers read as moss. There are in effect two
silhouettes and two attack shapes (walk-and-ram, dive). Nothing shoots, nothing leaps, nothing lives on a wall.

## What the references put in a first area (mined: `docs/design/reference-levels/*/area.json`)
| Game | Regular kinds in the first area | Archetypes |
|---|---|---|
| Hollow Knight (Crossroads + Greenpath) | ~20 | crawler (Crawlid), chasing flyer (Vengefly), **wall/ceiling crawler (Tiktik)**, walker that charges (Husk, Hornhead), **ranged flyer (Aspid)**, bobbing flyer (Gruzzer), **burrower (Goam)**, **curl-shell spitter (Baldur)**, **leaper (Leaping Husk)**, hidden ambusher (Mosscreep), exploder (Volatile Mosskin) |
| Silksong (Moss Grotto, Marrow, Docks) | ~20 | crawlers, flyers, **rollers**, **spitters**, circlers, a **mother that summons**, big bruisers |
| Ori (Sunken Glades and on) | 8 | **hopper**, wall-crawling spiked slug, rammer, **spitter**, swooping bird, drop slug, **shooter plant** |
| Nine Sols (first areas) | 12 | shielded spear, **ranged crossbow/turret**, exploding drone, trap crawler |

Every reference mixes at least one **ranged** threat, one **leaper**, and one **wall/ceiling** creature into its first
area. We have none of the three. Each archetype tests a different habit: a ranged one punishes standing still and
rewards closing the distance; a leaper punishes being predictable on the ground and rewards a side-step and an air
cut; a wall creature turns the climbs (our best verbs) into a fight.

## What makes a hit satisfying in the references
- **A bright flash on the creature** for 1–2 frames (HK, Silksong: white; Nine Sols: white/orange). Ours goes dark,
  then 55% toward a dull mauve: in a dark scene it barely reads. (Matt dislikes white on *her*, not on creatures.)
- **Something leaves the creature in the blow's direction**: HK's orange infection blobs, Silksong's silk shreds,
  Nine Sols' sparks. They have weight: they arc, fall and land.
- **A cut mark**: a bright streak across the body along the slash, one or two frames.
- **The body is batted** and light fodder flies. HK's kills **launch the corpse** with the blow, it bounces and lies
  there; the room keeps the evidence of the fight.
- **Deflect and punish moments**: Nine Sols' parry, HK's nail-clashing a Husk Guard, Silksong's parrying projectiles.
  Hitting something that is coming at you is the most satisfying hit there is.

## The round
Three new behaviours, each with its own silhouette, all real moth predators (creatures.md rule 1):
1. **Bombardier beetle** (ranged; planned for the wood in `docs/design/creatures.md`, HK's Aspid slot). Perches on a
   ledge, tail turns up and glows, lobs a burst of boiling droplets at where she is. **A cut bats a droplet back**;
   one that hits the bombardier stuns it open. Up close it sprays a short cone, so the answer is behind or above.
2. **Jumping spider** (leaper; Leaping Husk / Ori's hopper). Compact and furry with two huge front eyes that lock on.
   It side-steps to keep its distance, crouches (the tell), and pounces on a ballistic arc to where she stood. A
   missed pounce leaves it open on landing; hit, it hops back out of reach. Jumping spiders do stalk moths.
3. **Huntsman spider** (wall runner; Tiktik / Ori's slug). Flat, long splayed legs, lives on bark faces and trunks
   (huntsmen really hunt moths on tree trunks at night). Runs up and down its wall; when she is level and near it
   lunges off the wall across the gap and scrambles back. It turns wall-jump climbs into a fight.

Two re-looks, no new behaviour:
4. **Carriers become ants**: three body parts, elbowed antennae, each one carrying a pale moth wing over its head.
5. **Hawkers become dragonflies**: long segmented abdomen, four clear veined wings, huge eyes, blurred hover.

And the hit itself:
6. **Hit juice**: a bright hit flash on every creature, a cut streak, droplets thrown along the blow that fall and
   land, launched corpses that tumble, bounce and lie a few seconds, fodder that flies.

Placement (after the kinds land): every room of the first five minutes should hold two different archetypes, and no
room the same pair as the room before it.

## Matt, mid-round: "check with Ori, it has a good way of forcing you to deal with enemies. We can still speedrun our level too much"

**Ours now (speedrunner persona, headless, every ability, 2 runs a room):** hatch, hub, trunk, well, limbs, fork and
bower are crossed with **0 hits and 0 kills**; only the Grove (3) and the tunnel (3) touch her. Nothing on the way
to the Keeper needs a kill.

**Ori's Sunken Glades (mined, `docs/design/reference-levels/ori/area.json`):**
- **Enemies sit on the route line, not beside it:** 20 of 48 (42%) are within 300 px of the critical route and 14
  within 150 px; the route spends 30% of its length within 500 px of one. Hollow Knight's Crossroads: 6 of 198 within
  300 px. Ori is the game that puts the creature where your feet must go.
- **The geometry leaves no way round:** spiked slugs (14, the commonest) crawl the floors, walls *and ceilings* of the
  tunnels and shafts that are the only way; drop slugs hang over the pools you must cross; 7 shooter plants fire
  across the caverns' only corridor in rows.
- **A one-way drop into a closed fight:** Sein's hollow is reached by a hole you cannot climb back out of, and the
  first thing after the weapon is 3 Hoppers that do not respawn. You leave when they are dead.
- **Hoppers chase and leap ~470 px:** you cannot outrun them on foot, so passing is fighting.
- **The creature is the key:** the Rammer is baited into the rock to break it open; keystones (3 gates of 2, 2 and 4)
  sit among creatures on the route. Later, Bash makes creatures and their shots the only way across a gap.
- **The weapon switches the Glades on:** 7 enemies appear the moment Spirit Flame arrives, on the way back.

**What we take (the placement pass after the new kinds land):**
1. **Nests that shut the way on, never the way back.** 3–4 on the critical path in the first ten minutes: the exit
   ahead is held shut by the nest itself (a silk curtain spun across it by the spiders; roots for beetles) and falls
   when the last of its creatures dies (`enemies[].sets` + a flag gate). The way back stays open, so it reads as
   "clear this to go on", not as the Grove's trap.
2. **Creatures on the line:** every critical room puts one creature where the fast line's feet go: the only landing
   ledge (jumper), the climb's wall (huntsman), across the long crossing (bombardier), the tunnel floor (ants).
3. **The bar:** the speedrunner persona takes hits or must kill in every critical room, and the gates make it kill
   in 3–4. Re-run this table after the pass.
4. **Later (not this round):** Ori's Bash on creatures: fling off a bombardier's droplet or a lampwing's light.
