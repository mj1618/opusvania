# Story direction: references outside the genre, and the story-light option

2026-10-16. Four research agents: (1) a diagnosis of the current story and prologue, (2) adjacent genres to model on,
(3) non-metroidvania games that tell a story without words, (4) market data on story-light metroidvanias. Sales
marked "est." are third-party Steam estimates (Raijin, Gamalytic); the rest are publisher figures.

## Recommendation

**Stay a metroidvania. Drop the written storyline and the cinematic prologue. Build a "discovery-first" game, like Animal Well,
Rain World and Hollow Knight's structure, where the world, the creatures and the secrets carry the meaning.**
Story moments happen only as short playable beats, never as watched scenes. Ori-style emotion is told through animation and the player's own
actions.

Why:
- **The market doesn't pay for plot in this genre.** Animal Well (no plot, est. ~437K on Steam, 96%), Pseudoregalia
  (~392K, 97%), Tunic (~321K), Minishoot (~361K, 98%) and Rain World (~1M) are all story-light. Dead Cells (10M+) is
  close to story-free. Heavy-story games underperformed: Prince of Persia: The Lost Crown and Afterimage. Story words appear in 8–13% of reviews for
  Dead Cells and Animal Well, against 45–48% for Nine Sols. Under 1% of Animal Well reviewers complain that it has no story.
- **What the market punishes:** a world that feels "empty or aimless", and a game that is "beautiful but a very poor game" (Ultros and
  Afterimage, both 77% positive). Negative reviews are about movement, combat, bosses, difficulty and getting lost, not plot.
- **It plays to what the team does well.** Discovery-first games are built from visuals, lighting, systems and secrets. Wordless *cinematic* games such as Inside,
  Gris and Journey look close to us, but they are the most heavily directed kind of game. That directing is exactly the skill that failed.
- **The prologue's problems are structural, not polish** (see the diagnosis below). More rounds won't fix it.

## Why the current story and prologue read as random

- **Too much for the runtime.** About 2.5 minutes holds six beats, four characters, four Hush props, three rules and two
  habits. Most beats exist to set up payoffs that live only in the doc: the fox is the vixen's mate, the tap pays off in an ending.
- **No cause between beats.** Things simply arrive: a glint, a fox, a ball game, a hollow, an eye, a hard cut to the summit, then he leaves.
  None of it is linked by "therefore" or "but", so it reads as a slideshow.
- **Code-drawn puppets can't act.** The prologue is built on micro-acting (a look, a hesitation, a tap) by characters with dot
  eyes and no mouth. Five passes went into legibility hacks.
- **The props are a step below the environment.** The hollow reads as a UI selection ring, the case as a macaron, the
  Hush's eye as a target marker, and the summit plate looks like a different game. The frames that work are the ones that are
  just the Grove being played.
- **The big ideas never reach the screen.** Mouthlessness, "it only sees things that eat", the week to live and the brain in a dish exist
  only in the doc.
- **The writing process could only add.** `loop.js` told the editor to simplify "without losing any beat". Every critic note became a new beat.
- **The AI critics graded prose against their own rubric** and gave it 8–9 for 13 rounds. When an AI critic looked at
  the *frames* (`reviews/prologue-v2-pass4.md`), it said "not at the bar". Lesson: AI critics are good for catching problems ("what can't you see in this frame?",
  "what would you cut?"). They are not judges of quality. Judge the built thing; Matt's reaction is the score.

## Reference games from other genres

| Game | Genre | What it does instead of a plot | What we take |
|---|---|---|---|
| **Animal Well** | discovery | Layers of secrets; the game itself is the mystery | Three layers: ability gates, then movement-tech secrets, then knowledge puzzles (glyphs, light patterns) |
| **Rain World** | ecosystem survival | Creatures hunt each other and you; a ~30 s wordless intro with one causal chain | Make the Hush a *systemic* predator you learn to read, not a cutscene villain |
| **Inside / Limbo** | wordless puzzle-platformer | Playable from the first frame, one continuous camera, the first rule taught by a death | No cuts; story beats are *places* she walks into; teach by what happens to her |
| **Journey** | wordless adventure | One lit goal framed the moment you get control; the music narrates | A "lodestar" shot in the first minute, such as the dance light above the canopy |
| **Ico / Shadow of the Colossus** | action-adventure | A relationship turned into one button; cut whatever is unfinished | A forced cut pass; a relationship becomes a mechanic, not acting |
| **Brothers: A Tale of Two Sons** | co-op-style adventure | The sibling bond *is* the controls; losing him loses an input | If Sorrel comes back: he is a move she has near him, and his leaving takes it away |
| **Hyper Light Drifter** | action RPG | A full plot written as a hidden bible, barely shown; ruins and bones tell it | Keep the story doc as a private bible that guides props and ruins, never shown on screen |
| **Gris** | wordless platformer | Colour is progress | A global palette/saturation uniform as story state (cheap in our post stack) |
| **Celeste / Neon White** | precision platformer | Mastery curves, B-sides, medal times | Optional challenge rooms with ghost replays, almost free from the deterministic sim |
| **Dead Cells** | roguelite | A mute hero, lore stones, comic physical acting | Fallback structure (hub plus biome runs) if hand-built content stalls |

## Rules for our opening

1. Control within 10 seconds. Under 20 seconds of non-interactive time in total.
2. One want, shown: one lit goal in frame when control starts, with the title over it.
3. One continuous take. No cuts or teleports.
4. At most one character and one force (Wing and the Hush). Each beat is caused by the one before.
5. The opening's threat is the game's threat. No one-off creatures.
6. Teach by consequence. No demonstration acting, no prompts.
7. Any emotional peak is something the player *does*, never a scene they watch.
8. Keep the *why* open, never the *what to do*.
9. Cut before adding. A reviewer watches a recording and must retell it in one sentence; if it can't, cut beats.

## What to keep from "Wing: The Kept World" (about 10%)

- **Premise:** a mouthless moth in a beautiful wood that a pale living growth is putting to sleep. The growth can't see her,
  because it only notices things that eat. This keeps Matt's anchor: a little moth against a living thing that swallowed the world.
- **The glint text:** *"Warmth the forest grows to give away. A moth has no mouth to keep it."* Make it big and readable.
- **"Moths go unseen"** as a played rule: pale things turn toward a vole and pass over Wing. This is the game's own hook, which
  guards against looking like a Hollow Knight clone.
- **Images that need no acting:** an animal asleep in a case on a stalk by the pool, pale root steaming in the moss, the pale
  mountain breathing through a gap in the canopy, the dance of light above the summit (the goal), and cases around a set dinner table in a later region.
- **Lanterns:** a glint lights one, and the root draws back.
- **Parked, not deleted:** Sorrel, Dun, Tallow, the sister, the lab, the seven nights and the three endings. Bring one back only if the
  world earns it. Sorrel works best as a *move* (Brothers style), not as an actor.

## The minimum story layer to ship (market playbook)

- A wordless opening image under 40 seconds, in-engine and playable.
- One world question ("what grew over everything, and why does it keep them?") carried by the art and ruins.
- Later: 5–8 characters met in the world with 2–4 short lines per visit (Hollow Knight's mapmaker Cornifer and wanderer Quirrel). Short lines are
  well within what AI writing does well; plots are not.
- Optional lore fragments (item text, tablets, murals). Never required.
- Bosses as story beats: a name card, a design that says who it is, and a change to the world once it is beaten.
- A visible long-term goal, a map that keeps players from getting lost, and a real ending.

Spend the effort saved on combat depth, bosses, exploration that pays off, and the map.

## Realistic ceiling

The median metroidvania on Steam gets 22 reviews; only 6% reach 1,000. A story-light game at Hollow Knight quality from a
tiny team lands in the Animal Well / Pseudoregalia band (est. ~300–450K Steam units at $20–25). A breakout like Rain World reaches about 1M.
Every 5M+ seller (Hollow Knight, Ori, Dead Cells, Blasphemous) had a world and an identity people remembered, not
necessarily a plot.
