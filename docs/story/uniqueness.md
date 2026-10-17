# Is it different enough from Ori, Hollow Knight and Nine Sols?

Method: those three are each clearly their own game, so measure how far apart THEY are on each axis, then ask whether
ours is at least that far from its nearest neighbour on each axis.

| Axis | Ori (Blind Forest / Wisps) | Hollow Knight | Nine Sols | Ours (Mouthless, round 23) | Nearest | Distance |
|---|---|---|---|---|---|---|
| Hero | glowing forest spirit, an adopted child | silent bug knight, a hollow vessel | cat-like warrior out for revenge | a dark mouthless moth with a week to live, who can only give | HK (an insect) | medium |
| World | living magical forest | fallen underground bug kingdom | "Taopunk" sci-fi ruins under myth | the human world swallowed by grown tissue, seen at moth scale, at night | Nine Sols (tech under myth) | **far** |
| Antagonist | a grieving mother owl / a blighted forest | a god's light infecting a kingdom | alien overlords who farmed humans | a brain grown from human cells, left to starve, that sealed the world to feed it | Nine Sols (humans kept as resource) | far |
| Core idea | family, sacrifice, renewal | what is lost in a kingdom's lie; emptiness | revenge vs compassion; what we owe the exploited | giving vs taking; a love that keeps vs a love that lets go | Ori (sacrifice, renewal) | medium |
| Tone | tender, tearjerking | melancholy, eerie, lore-dense | intense, dramatic, moral | tender + eerie: Ori's heart in a world as strange as Nine Sols' | blend | medium |
| How the story is told | wordless prologue + narrator | almost all lore in places and items | cutscenes, dialogue, a found family | wordless, mythic surface, truth found in places at the midpoint | HK | medium |
| Real-world hook | none | none | Taoist myth | Cortical Labs: brains grown on chips, a real company | none | **far** |
| Signature mechanic | movement flow (Bash) | the nail, pogo, charms | parry and talismans | carrying light makes you seen; giving (Offer) is the final weapon; empty-handed you slip through | none | far (in the sim since 2026-10-14; not yet drawn) |
| Combat today | platforming-first | nail combo, pogo, benches | parry-heavy | thorn slash combo, pogo, lantern rest points | HK | **close** |
| Structure today | restore three lights / elements | kill three dreamers to open the way | kill the nine Sols | light three lanterns to wake a heart | Ori and HK | **close** |

## Verdict
**As a story and a world: yes, it is as different from each of them as they are from each other.** Nobody has done a
grown-brain antagonist, a human world at moth scale, or a hero whose whole power is giving. The real-world hook
(lab-grown brains) is something none of the three has, and the overgrown-ruin look is clearly its own.

**As a game, not yet.** Today's mechanics and structure are the closest thing to a copy:
- **Combat** is Hollow Knight's grammar (a nail-like combo, pogo, rest points).
- **The "light three things" structure** is the shape all three share (Ori's elements, HK's dreamers, Nine Sols' Sols)
  and Ori's in particular.

## The three adjacency risks and what to do
1. **Hollow Knight: insect hero + light + a spreading force + sleepers.** HK has a moth tribe, a god of light, an infection
   that spreads, and dreamers sealed asleep. Keep clear: our moths never worship light (they *carry and give* it); the
   Hush is pale bone and breath, never orange glow or infected eyes; the sleepers are *fed*, not sealing anything.
2. **Ori: lush home forest, gather light to restore, a hero who gives herself.** Keep clear: the forest is one region;
   light is something you *give away*, not collect for power; the ending is two siblings and a whole species warming
   something until it lets go (not the hero becoming a tree).
3. **Nine Sols: myth over tech, humans kept as a resource.** Different enough already: our keeper is a starving made
   thing that thinks it is caring, not a cruel overlord. Avoid "humans as fuel/batteries" framing (also The Matrix).

## The biggest lever: make the giving mechanic the game
The story's most original idea is also its best gameplay hook, and it is barely in the current build:
- **Carrying light makes you seen**: a stealth-and-risk loop no metroidvania has (in HK and Ori, currency is safe to hold).
- **Empty-handed you slip through** the Hush's world: traversal by owning nothing.
- **Offer is a weapon**: bosses are calmed by what you give, not only cut down.
- **Spend rather than collect**: lanterns, healing and progression all paid by giving away.
If the game *plays* like giving, it will feel like no other metroidvania; if it plays like HK with moths, it won't.

**Recommendation:** keep the story and world as they are; before building more, redesign the core loop around giving
(the four bullets above) and vary the "light N things" structure (for example, the lanterns are given, not conquered,
and the second act's goal is a person, not a count).

## Update 2026-10-14
The giving loop is now in the sim (commit dfe65ad, memory/giving.md): the seen level scales with the wallet, empty-handed she is unseen and unharmed, Offer calms a burrback for 10 s, and rest costs glints. A ghost pilot reaches the heart with 0 hits and 0 pickups. Next: draw it so players feel it.
