# Level skeletons: the brief (2026-10-19)

Five designers each make one whole-level skeleton for the same piece of the game. Matt picks one, and only then do we build
rooms. We are choosing the big picture first, because our last two levels (wood area 1, Lanternroot) were disjointed when
designed room by room.

## The piece
The game's opening area: the wood, from Wing's hatching to the area's first boss and its hub. 15–25 minutes for a
first-timer, Ori/Hollow Knight/Nine Sols quality. Read `memory/story.md`, `docs/design/` (README, core, world,
journey, creatures, quality-bar), `docs/design/regions/wood.md`, and the earlier wood area-1 designs
(`docs/design/regions/wood-area1-v3.md`, `wood-area1-director.md`) to learn from what failed. The story and the setting
are fixed; the layout, the order, the abilities found here, the creatures used and the boss are yours.

## What Matt has told us
- Movement feel, jumps and combat are good. What fails is the overall level: wood area 1 was bland, obvious,
  monotone, disjointed and over-signposted; Lanternroot was "meh".
- The test grove is the most fun level because it is dense: at any moment you can attack an enemy, collect something,
  hack leaves, or go for a lamp. Design for 2–3+ things within reach at all times, layered, not one idea per screen.
- The lab's Weaver was a good first boss: not too hard, a good intro.
- Discovery and challenge over guidance: trust the player, secrets and optional hard parts, contrast between quiet
  and intense. The player keeps control. No hints because a tester got stuck.
- Cohesion: one through-line (what the player wants and why), an arc, setups that pay off, a geography that makes
  sense, landmarks seen from elsewhere, sightlines to where you're going, an ecology for the creatures.

## Deliverables (no engine work, no code, no commits; don't spawn sub-agents)
1. `docs/design/skeletons/<n>-<slug>.json`, exactly this shape (it is drawn and animated on a comparison page):
```json
{
  "id": "<n>-<slug>",
  "title": "short evocative name",
  "lens": "the lens you were given",
  "pitch": "one paragraph: the level in a nutshell, why it's fun",
  "throughline": "one sentence: what the player wants and why",
  "size": { "w": 12, "h": 8 },
  "regions": [
    { "id": "hatch", "name": "The Hatching Branch", "x": 0, "y": 2, "w": 2, "h": 1,
      "mood": "quiet|tense|wonder|intense|secret", "note": "what's here, what's dense about it" }
  ],
  "links": [
    { "from": "hatch", "to": "canopy", "kind": "open|gate|shortcut|oneway|secret", "requires": "doubleJump", "note": "" }
  ],
  "landmarks": [ { "name": "The Moon Oak", "x": 6.5, "y": 1.2, "seenFrom": ["hatch", "canopy"] } ],
  "abilities": [ { "id": "doubleJump", "name": "Double jump", "region": "canopy", "minute": 6 } ],
  "secrets": [ { "name": "", "x": 3.2, "y": 4.6, "tell": "how an attentive player notices it" } ],
  "boss": { "region": "nest", "name": "", "idea": "phases and what it tests" },
  "run": [ { "x": 0.5, "y": 2.6, "minute": 0, "beat": "short caption of what happens here" } ],
  "minuteByMinute": [ "0–2: ...", "2–4: ..." ]
}
```
   Units are screens: 1 unit = one 16:9 screen (x across, y down; a region of w 2, h 1 is two screens wide). Keep the
   whole map 20–45 screens of area. `run` is the first-timer's critical path in order (15–30 points, with the minute
   each is reached), drawn as a ghost run across the map; include the backtracks and the shortcut that opens. Every
   region named in links, abilities, the boss and seenFrom must exist.
2. `docs/design/skeletons/<n>-<slug>.md`: the same design in prose, one page: the through-line, the arc, the map
   logic (why it's shaped this way), the 3–4 best moments, how density is kept on every visit, the secrets layer, the
   boss, what the reference games do that this borrows, and its biggest risk.

Be bold and specific. Five designers are working in parallel, each with a different lens, and the point is real
variety: don't drift to a safe middle. Check your JSON parses (`node -e "JSON.parse(require('fs').readFileSync(...))"`).
Report: the file paths and the pitch.
