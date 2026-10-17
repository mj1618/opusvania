# Lampfall: core design

Draft 1, 2026-10-17. The foundation the other design pieces (world map, creatures and bosses, story journey, look and
sound, tech) are checked against. The story is `memory/story.md`; this doc turns it into play. Where a call here is
big enough for Matt, it is listed at the end with a recommendation, and the doc assumes the recommendation until he
answers.

## 1. Pillars

Every later piece is checked against these five. A feature that serves none of them is cut or parked.

1. **Light pulls, dark is safe.** Lamps bend her flight like gravity. Light means danger and speed; the dark means
   rest and safety. This is our hook. It is what stops us reading as a Hollow Knight clone.
2. **Flight is the joy.** Moving through a room should feel good with nothing in it: momentum, chained glides, swings
   around lamps. The Ori bar applies to her motion before anything else.
3. **Every lamp is a rescue.** Putting a light out frees moths you can see, and that is both the reward and the
   completion count. The player is never asked to care about the moths. They watch moths die at lamps and watch them
   fly free.
4. **Danger is fair and readable.** Predators gather where moths circle. Each predator has one silhouette, one
   behaviour and a clear tell. You lose because you misread something, never because something cheap happened.
5. **The world tells it.** No dialogue and no cutscenes. Text is limited to item lines and the title. The way on is
   always readable: freed moths fly toward it, the map shows the lights still burning, and the mountain appears at
   vistas. The mountain is a reward view, not a pillar. It does not have to be in frame.

## 2. Core loop

| Scale | What she does | What the player feels | What they get |
|---|---|---|---|
| **Moment** (seconds) | Flies through the dark, enters a lamp's pull, rides or fights it, slashes the predators hunting at the light, snuffs the flame | Tension in the light, relief in the dark, speed from a good swing | A snuff: hitstop, the flame dies, dark blooms outward, moths burst free and fly with her |
| **Room** (1–5 min) | Reads a room built around one to three lamps: how to reach each one, which pull to use, where the predators wait. Puts out the ones she can and notes the ones she can't | "I see how to do this", then doing it | Freed moths (counted), 1 health back for each snuff, a room that has gone dark and safe, a lit marker left on the map for every lamp still out of reach |
| **Region** (about an hour) | Arrives at a vista, explores, finds the region's moonlit glade (a new ability), uses the ability to reach the region's great lamp, beats its boss, snuffs it | Growth: the region that pushed her around is now hers | The region's sky clears (stars come out, the moon brightens), the way to the next region opens, earlier regions fill with newly reachable lamps |

The region payoff is literal and global. As a region's lamps go out, its sky gets darker and clearer and more stars
show. This is one palette and star-density uniform per region, driven by the fraction of lamps snuffed, the Gris
idea. Progress is the night coming back.

## 3. The lamp verb family

### The forces (sim)
- **Pull.** Every lamp has a pull radius R. Inside it she is accelerated toward the flame, harder the closer she gets,
  with a sideways **swirl** component so that she spirals in instead of falling straight in. Moths really do this.
  In the air the pull adds to her velocity in full. On the ground it acts only as a horizontal drag, so she can
  always walk away. All her moves still work inside the pull, just bent by it. Before she has any lamp ability,
  crossing a pull field already slingshots her path like a gravity assist, and good players will use that for free.
- **Caught.** If she reaches the flame's core she is caught. She orbits it tight and her moves are replaced by
  *beating free*: each jump press pushes her outward, and three presses free her (tuned). Once she has the dash,
  dashing out frees her at once. On a gentle lamp being caught does no damage by itself. The danger is the time it
  costs her while predators close in. Hot lamps burn while she is caught.
- **Snuff.** The flame takes hits like a creature does. Small lamps go out with one blade hit and bigger ones take
  more. A down-slash on a flame is a pogo, so she can bounce off a lamp while beating it out. The skill is hitting
  the flame from just outside the core (the slash reaches about 110 px, and the core will be smaller than that) or
  on a pass, without being dragged in. Glass lamps make the blade glance off, using the framework's existing
  `blocks` hook, and only Shroud (ability 6) can put them out.
- **Fling** (ability 4). Inside a pull, hold the Lamp button and she locks into orbit at her current radius and
  builds speed. Release and she flies off along the tangent, with the stick bending the exit direction up to ±45°.
  A fling refills her double jump and dash. *Easy path:* we chose orbit-and-release over Ori's Bash (slow motion
  plus free aim). It needs no time scaling in the sim and no aim UI, and its timing skill, like a hammer throw, is
  just as satisfying. It is also our own, not a copy.
- **Permanence.** A lamp she puts out stays out for the rest of the game. Its husk keeps a cold glow so the room can
  still be read, but it has no pull. The firefly relights lamps only at scripted story moments early on (it flees and
  relights one behind her, as Kuro does in Ori), and never as a system.
- **Level rule that follows from this:** a lamp may be snuffable with a given ability set only if every route through
  its room is still passable with that set once the lamp is out. Lamps that the player needs as fling points on a
  required route are glass until Shroud. By that point dash and Moonflight do their job.

### Lamp kinds: parameter variants of one sim module
Each kind is a row of numbers in scene data and tuning. Only the last column needs new code.

| Kind | Region first seen | Parameters that differ | New code |
|---|---|---|---|
| **Wick** (glow-cap, candle) | wood | small R, weak pull, 1 hit, 4–6 moths | none |
| **Lantern** (hung) | wood | medium R, 2 hits, swings on a chain (pendulum path) | the pendulum path |
| **Flicker** | valley | pull switches on and off on a beat (a period and a phase) | none |
| **Ember** (hot) | valley / marsh | caught = heat damage | a damage tick |
| **Glass** | marsh | the blade glances; only Shroud puts it out | none (`blocks`) |
| **Drifter** (marsh-gas light) | marsh | moves along a path | path follower (shared with the lantern) |
| **Great lamp** | each region's set piece | huge R, several flames, many moths, a boss arena. Wood and valley: put out flame by flame with the blade. From the marsh on: a glass heart that needs Shroud for the last flame | per-boss work |

New lamp kinds after launch should be new parameter rows first, and new code only when a row can't express them.

### Freeing moths
Each lamp holds a number of moths, drawn by render as a swarm in orbit, with a dead one on the ground now and then
so the stakes stay real. When the lamp goes out the sim emits one event (lamp id, moth count, position). Render
does the rest: the swarm spirals out, follows her loosely for about 6 s, then peels off along the region's
**migration line**, a path in scene data that points to the next region or to the mountain. That is the
wayfinding. Underground, the line runs to the exit.

What the moths do for her afterwards: **nothing in combat.** They give her health milestones (section 6), they guide
her, and they come home with her in the ending, where the cave ceiling fills to match the count. *Easy path:* we
don't build follower AI that helps in fights. The emotional payoff (watching them go free, then seeing them all
at the end) is the same, she stays alone, which suits the story, and a late "call the swarm" ability is held in a
slot in case play shows we want it.

## 4. Ability chain

Wing hatches with very little. Her wings dry and strengthen over the journey. The move set already built is the pool
to gate. Abilities come from **moonlit glades**: a shaft of real moonlight at the end of a challenge or a boss. Every
glade presents the same way: she basks in it, gets one item line, and sees one button glyph. Real moonlight makes
her stronger and false light pulls her down, so the source of her power is the story's own contrast.

| # | Ability | In the sim? | Region | What it opens | How it's taught |
|---|---|---|---|---|---|
| 0 | Run, variable jump, fast fall, blade (forward, up, down, 3-hit combo), pogo | **yes** | start | the first lamps (wicks are snuffed with the blade), thorn pogo routes | the hatching branch and the first room. A wick over a short gap teaches the pull and the snuff by consequence |
| 1 | **Glide** | **yes** | wood, within the first 5 min | wide gaps, long drops, crossing a pull field on a line | her wings dry in the first glade. The way out is a drop too long to survive without it |
| 2 | **Wall cling and wall jump** | **yes** | wood, mid | vertical shafts, which are the wood's main gates | the glade sits at the bottom of a shaft, and the only way out is up its walls |
| 3 | *Fling* | new | valley of lamps, early | lamp chains across chasms, tall shafts lit by lamps. Traps become launchers | the region's first big lamp hangs over a pit she can't cross. Being caught and beating free there already throws her halfway, and the glade beyond lets her choose the throw |
| 4 | **Double jump** | **yes** | valley, boss reward | high ledges back in the wood, combined with fling | the boss arena's exit ledge is one jump too high |
| 5 | **Dash** | **yes** | marsh | horizontal gaps, fast currents, instant escape from Caught, the flicker timing rooms | a marsh corridor with a flicker lamp you can only pass in its off-beat with a dash |
| 6 | *Shroud* | new | marsh, late | fold her wings, go dark: no pull, unseen by predators that hunt by light, and the only way to smother glass lamps and the glass hearts of great lamps from the marsh on. It opens the dense lamp fields | a glass lamp blocks the way out of the glade's room. Shroud and land on it |
| 7 | *Moonflight* | new | pass, after the beacon | real sustained flight: wingbeats that drain while she is in lamp light and refill in the dark. Opens the final climb and high secrets everywhere | the pass's cliff with no walls, at night, under the open moon |
| 8+ | *slots* | | any | reserved: call the swarm, a carried lure-light, a marsh dive, and others | |

Notes:
- **Shroud** is "the dark is safe" made into a button, and it does two jobs (traversal and snuffing), so we get two
  verbs for the cost of one ability. While shrouded she falls like a seed: no glide and no attack. That gives it a
  cost.
- **Moonflight** is cheap to build in the sim but risky for level design, because free flight can trivialise rooms.
  The rule that it drains in light keeps it tied to the pillar. Try it in the pass and cut it only if a real attempt
  fails.
- **Extending the chain:** abilities are flags in a set, and gates in scene data name an ability id. A new ability is
  a flag, a move, and gates in rooms. Old rooms need no rework. They gain secrets.
- Controls end up as five actions: jump, attack, dash, Lamp (fling), and Shroud. The last two are separate buttons
  so she can shroud her way through a pull field.

## 5. Combat and threat

- **The blade** has three jobs: fighting predators, snuffing lamps, and pogo traversal. The 3-hit combo, the hitstop,
  the lunge and recoil, and the pogo stay as built. No new weapons in the first scope. Weapon upgrades (reach, damage)
  are a slot.
- **Predators** live where the light is, because that is where moths circle: spiders, the mantis, bats, toads (the
  creatures doc owns them). Density follows light. Lit rooms are fights and dark corridors are breathing space.
  Predators notice her by how much lamp light she is in, which reworks today's "seen" system (visibility from the
  glint wallet) into visibility from being lit. Shroud makes her unseen. The firefly is the cause, never the everyday
  enemy.
- **Health:** 4 pips at the start, as now, plus up to 4 more from moth milestones. Each snuff restores 1, which
  rewards playing aggressively at lamps. A moonlit rest spot restores all of it.
- **Death:** she fades and re-forms at the last **moon patch** she rested at (small shafts of moonlight, which are the
  save and rest points). The room's creatures reset. Lamps she put out stay out. Nothing else is lost. Touching a
  hazard (thorns, water) costs 1 and puts her back on the last safe ground in the room, as the code already does.
  *Easy path:* no corpse run and no dropped currency. The tension comes from bosses and hard rooms, which is where
  the players who love that kind of game look for it.
- **Difficulty stance:** HK-hard bosses with a short walk back (a moon patch next to every boss door), and generous
  Ori-style traversal (quick respawns, no spikes that cost a whole run). The final fight with the firefly is hard;
  the mercy is in the ending. An assist menu (which the sim's `assists` toggles already support) comes before
  launch.

### The old demo design: keep, rework or drop

| System | Call | Why |
|---|---|---|
| Glints and the wallet | **drop** | Two things to collect would dilute the moths. The glints' story is gone. The pickup flight tech is kept for glade items |
| Giving / offer (V calms creatures) | **drop** | The predators are really dangerous now, and fighting them is right |
| Seen levels from the wallet | **rework** | Visibility comes from lamp light instead. Roosting and sleeping when she is unseen stay |
| Lanterns kindled with glints | **drop** | The opposite of the story: she puts lights out now. Their places in the Grove become lamps to snuff |
| Lanterns as rest and re-form points | **rework** | They become moon patches. "Re-form at the nearest light" becomes "re-form at the last moon patch" |
| Wayside lamp sanctuary | **drop** | Lamps are danger now, not shelter |
| Heart of the grove (the goal) | **drop** | A region's goal is now its great lamp and its exit |
| Lumen pods | **drop** | They only existed to drop glints |
| Burrback, lampwing | **keep (sim)** | They are working creatures with tells. The creatures doc decides their place and their look |
| Fade and re-form, safe ground, hurt and invulnerability | **keep** | They fit as they are. Only the fade's wallet drop goes |

Rework happens in the Grove one increment at a time (PLAN.md). We don't keep both designs running in parallel. Each
increment removes the old piece it replaces.

## 6. Completion and collectibles

Kept small on purpose. There are three things to find:

1. **Freed moths**, the completion number, shown as moths (for example "312 / 600") on the map screen. Rough budget:
   wick 5, lantern 10, flicker or ember 15, great lamp 60, and about 12 lamps per region.
2. **Health from moth milestones:** +1 max health at fixed moth counts set for the full game (about 140 / 280 /
   550 / 800 of ~1,000; `world.md` §8.5), never percentages, since the total grows with each tier. *Easy path:* no separate
   heart-piece hunt with fragments and its own UI. The reward for exploring is still more health, it is just counted
   in moths. The first milestone falls on the critical path. The rest need exploring.
3. **Abilities** (section 4).

**Secrets** are lamps, so every secret pays in moths: lamps behind false walls, up shafts you can only climb later,
at the end of optional movement gauntlets (Celeste-style challenge rooms, with ghosts almost for free from the
deterministic sim), and in rooms that open only after backtracking with a new ability. The **map** fills in
automatically as she explores, and it shows every lamp still burning as a lit dot. The map is the to-do list.

Not in the first scope: currency, shops, charms, lore items. Each one is a slot if play shows it is missed.

## 7. Easy-path choices

| Chose | Over | Why the fun is the same |
|---|---|---|
| One lamp module with parameter variants | bespoke code per lamp | The variety the player feels comes from size, rhythm, motion and heat, and all of those are numbers |
| Snuff with the blade (hits, pogo, `blocks`) | a new snuff system and its animations | Hitting a flame on a swing is the skill. It reuses the combat feel we already tuned |
| Fling as orbit-and-release | Ori's Bash with slow motion and aim | A timing skill instead of an aiming skill, just as expressive, and distinct from Ori |
| Freed moths in render only, plus a count | follower AI that helps her | The payoff is watching them go free and seeing them come home. She stays alone, as the story wants |
| Health from moth milestones | separate heart-piece collectibles | The player explores and is rewarded either way, with one system instead of two |
| One glade presentation for every ability | a bespoke scene per ability | HK's shrines prove a repeated ritual reads well. No directed acting (`story-direction.md`) |
| Death costs time only | a shade or corpse run | The tension sits in bosses and hard rooms, with no frustration loop |
| The mountain at vistas only | the mountain always in view | Moths flying off and the map do the wayfinding. The vista is a payoff |
| Region progress as a sky and star uniform | re-arting rooms for a "restored" state | The Gris effect: the player sees the whole region change from one shader parameter |
| An auto-map with lamp markers | a mapmaker NPC and buying maps | No one gets lost, which is the genre's top complaint |
| The firefly relights lamps only in scripted beats | a relighting system | The story beat lands, and nobody backtracks to redo work |
| Teaching by layout plus one item line | tutorial prompts | Matches the opening rules: teach by consequence |

## 8. Open questions for Matt

1. **Starting kit.** Wing starts with run, jump, blade and pogo only, and gets glide within the first 5 minutes.
   *Recommend:* yes. Glide is the best feeling we have (playtest 1), so it should come fast. Starting without it makes
   receiving it a moment.
2. **What death costs.** *Recommend:* time and position only (no shade, no dropped moths). Freed moths can never be
   lost.
3. **Health from moth milestones** instead of a separate heart-piece hunt. *Recommend:* yes, as fewer systems with the
   same reward for exploring.
4. **Do freed moths help her?** *Recommend:* not in the first scope: they guide and come home. Keep "call the swarm" as
   a late ability slot to try if the middle of the game needs a lift.
5. **Moonflight** (late real flight that drains in light). *Recommend:* try it in the pass, and cut it only if it
   trivialises rooms in a real attempt.
6. **Lamps stay out for good,** and the firefly relights only at scripted beats. *Recommend:* yes. Permanent darkness
   is the visible progress.
7. **First scope.** *Recommend:* the wood and the valley of lamps, abilities 0–4, the lamp kinds wick, lantern,
   flicker and great, two bosses, about 25 lamps, roughly 1.5–2 hours. The marsh, pass and cave then extend it through
   new rows, new flags and new scenes, with no rework.
8. **Five buttons** (jump, attack, dash, Lamp, Shroud). *Recommend:* yes, which is about Hollow Knight's count. A
   merged Lamp/Shroud button would save one but would block shrouding through a pull field.
