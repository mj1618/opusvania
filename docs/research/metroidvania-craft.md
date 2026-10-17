# Metroidvania craft: what the best teams do, and what it means for Lampfall

2026-10-17. A research pass over talks, interviews, analyses and source code from the games on our bar (Hollow Knight
and Silksong, Ori 1 and 2, Nine Sols, Celeste, Super Metroid and Dread, Axiom Verge, Animal Well, Dead Cells), plus
general craft (game feel, cameras, hitstop, wayfinding, playtesting). Everything is paraphrased, and links are at the
bottom. It is written against our plan (`docs/design/`) and our sim (`memory/movement-controller.md`,
`memory/combat.md`), and it doesn't repeat `docs/research/story-direction.md` or `memory/reference-games.md`.

Where a source was a video I couldn't get a transcript for (some Game Maker's Toolkit episodes), I only use points
that the video's own description or secondary write-ups confirm.

---

## 1. Principles

Each principle has a source and one line on how it applies to us.

1. **It has to be fun in grey boxes first.** Mahler spent months tuning Ori's controls with one programmer, on the
   rule that a platformer has to be fun before any art goes in ([Ori 8-year Q&A][ori8]). Will of the Wisps levels went
   sketch → blockout → playtest → peer critique → "design approved", and only then to art ([WotW Q&A][wotw]).
   *Lampfall:* no room gets painted until Matt has enjoyed its greybox. Pillar 2 ("flight is the joy") is tested in
   an empty room.
2. **Bend every timing window toward the player.** Celeste's coyote time, jump buffer, half gravity at the apex,
   corner correction, wall jumps that work from a few pixels away and kept platform momentum all exist to widen
   timing and positioning windows ([Celeste & Forgiveness][forgive]).
   *Lampfall:* we already do this for movement (§4). We have to do the same for the **lamp verbs**: a Caught core
   smaller than the drawn flame, a flame hit box larger than it, buffered beat-free presses, and a lenient fling
   release.
3. **Every mistake should be avoidable until the last moment.** That was Pellen's goal for the Knight's movement:
   no acceleration, a strong first lift, release to cut the jump, a dash that kills vertical speed ([Game Informer:
   making of Hollow Knight][gi-hk]).
   *Lampfall:* a pull bends her path but never takes away steering, and air control stays live inside every field.
4. **Show the lock before the key.** Super Metroid plants its Grapple location by making the tutorial rooms look
   like a Crateria room the player has already seen ([The Invisible Hand of Super Metroid][sm]). Hollow Knight puts
   one room styled like a later area inside an earlier one, so the place sticks in the player's mind ([GMTK Boss
   Keys: Hollow Knight][gmtk-hk]).
   *Lampfall:* `world.md` already has a lock-before-key column. Make it a hard check: every lock is seen at least
   one region-section (about 10 min) before its key.
5. **Teach in four beats, then move on.** Nintendo's Hayashida structures a level as introduce (safe), develop, twist,
   conclude. A mechanic can be taught, developed, twisted and retired in about five minutes ([MCV on GMTK's
   kishōtenketsu episode][kisho]).
   *Lampfall:* `world.md` §6's ladder (lock room, safe, combine, test, look back) is this pattern. Keep it to one new
   idea per room.
6. **Teach with situations, never prompts.** Mega Man X's intro drops a platform from under you next to a wall you
   can only climb ([Nintendo Life on MMX][mmx]). Super Metroid's etecoons wall-jump in front of you, and an ostrich-like
   creature demonstrates the speed-boost jump ([Invisible Hand][sm]). See also [GMTK: Half-Life 2's invisible
   tutorial][hl2].
   *Lampfall:* the moths are our etecoons. Show moths spiralling into a pull before Wing feels one, and show a moth
   whipping round a lantern and flying off on the tangent before Fling.
7. **Let players get a little lost, never for long.** Brown argues that modern metroidvanias over-guide with map
   markers and that getting lost is part of the genre ([GMTK: Getting Lost in Axiom Verge][gmtk-av]). His Dread
   episode then shows how to keep people oriented without markers, using one-way passages and temporary map locks
   that keep you inside a small slice of the world ([GMTK: Why You Didn't Get Lost in Metroid Dread][gmtk-dread]).
   *Lampfall:* no objective markers. Moths, the moon's side and lit dots carry direction. After each new ability, use
   a one-way drop or a temporary seal so the next lock is close by.
8. **Backtracking has to get faster, pay off, and show change.** In Silksong, going back for most rewards is optional
   but worth it, so casual players keep moving and completionists are paid ([GMTK: Silksong's world][gmtk-silk]).
   Hollow Knight turns the Crossroads into the Infected Crossroads so that return trips feel new ([Game
   Informer][gi-hk]).
   *Lampfall:* our "sky clears as lamps go out" is that transformation, and it is free. Every return route gets a
   shortcut.
9. **Concertina pacing: guided stretches, then open ones.** Super Metroid runs as tight guidance, then open
   exploration, then linear trials ([Invisible Hand][sm]). Silksong alternates linear acts with open ones ([GMTK:
   Silksong][gmtk-silk]).
   *Lampfall:* the wood is guided, the valley open, the marsh guided again, the pass and cave linear. Inside a region,
   each ability gives a guided ladder and then lets go.
10. **Give every room a job, and build the skeleton before the rooms.** Dead Cells hand-builds its world frame and
    its room templates, each tagged with a purpose and its exits, then fills a per-biome concept graph. It sets
    enemy counts by a budget per combat tile ([Deepnight: the level design of Dead Cells][dc]).
    *Lampfall:* tag every room in `world.json` with a purpose (teach, test, rest, vista, secret, boss, corridor) and
    lint the rhythm from data.
11. **Make death cost time, not progress, in a game about exploring.** Brown argues that Silksong's corpse runs work
    against "go somewhere else when you're stuck" ([GMTK: Silksong][gmtk-silk]).
    *Lampfall:* already decided (core §5). Keep it.
12. **Simple designs scale.** Team Cherry put the Knight's simple shape and over 150 distinct but simple enemies
    down to deliberate simplicity, and "keep it simple" was the visual goal that let two people finish ([MCV: When
    We Made Hollow Knight][mcv-hk]; [Game Informer][gi-hk]).
    *Lampfall:* one silhouette, one behaviour and one tell per creature (creatures.md). Lamps are parameter rows.
13. **Lock the content, then polish. Play the whole thing before judging a part.** Brown cut about 20% of *Mind Over
    Magnet* and found that only polish made it better: more content made it longer, not better. He also playtested
    almost every day ([GMTK: The hardest thing about finishing][finish]).
    *Lampfall:* each tier gets a content-lock point, and every loop ends with a start-to-finish play of everything
    built so far.
14. **Test with people who try to break it.** Moon hired two top Ori speedrunners to find sequence breaks the
    designers hadn't planned for ([WotW Q&A][wotw]).
    *Lampfall:* our deterministic sim makes a "speedrunner agent" cheap: one bot per region that hunts for skips,
    alongside the symbolic world check.
15. **When the core won't click, borrow a proven one.** Red Candle went more than a year without a combat loop they
    liked, until they adapted Sekiro's deflect principles to 2D. Then "the rest fell into place" ([PCGamesN: Nine
    Sols][ns-pcgn]).
    *Lampfall:* if the lamp verb isn't fun after two or three greybox loops, step toward a proven model (Ori's Bash,
    a plain HK grapple point) before inventing more.
16. **Feedback should be as loud as the event matters.** Swink calls polish the layer that makes a game "perceptually
    convincing" without changing its rules ([Game feel][swink]). The screenshake and juice talks show how much
    small layered effects add ([Art of Screenshake][shake]; [Juice it or lose it][juice]).
    *Lampfall:* the **snuff** is our core verb, so it must be the loudest event in the game, louder than a kill.

---

## 2. Map and gating craft

### What the best maps do
- **Lock and key, drawn as a graph.** A lock is anything that blocks and a key is anything that opens it: items,
  abilities, knowledge or flags. Locks are hard (you must solve them) or soft (a tough enemy you can get past). Design
  top-down on the dependency graph first, where changes are cheap ([Boris the Brave: Lock and key dungeons][boris]).
  Brown's Boss Keys graphs show the shape at a glance: NES Metroid's is wide, Zero Mission's tall and thin
  ([Omega Metroid on Boss Keys][omega]).
- **Soft gates beat hard ones once the core is learned.** Team Cherry started with a fixed ability order and then
  "chipped away" at the hard gating until many power-ups became optional ([PC Gamer: How to design a great
  Metroidvania map][pcg]). Silksong offers skip routes that trade combat difficulty for exploration ([GMTK:
  Silksong][gmtk-silk]).
- **Sightlines to locked places.** Super Metroid and Hollow Knight both let you *see* places you can't reach yet,
  through map-room reveals and styled teaser rooms ([Invisible Hand][sm]; [GMTK: Hollow Knight][gmtk-hk]).
- **Loops and shortcuts.** Hub shafts with several branches (Super Metroid) and doors that open from the far side
  (HK) turn a long walk back into a quick one. A one-way drop ("valve") must always have a way out
  ([Invisible Hand][sm]).
- **Sequence breaks as a reward for mastery.** Super Metroid "always leaves a back door": clever wall jumps reach
  the Spazer early ([Invisible Hand][sm]). Physics in Ori 2 created unplanned breaks, which the team chose to manage
  rather than remove ([WotW Q&A][wotw]).
- **Map screen.** Team Cherry called the map their hardest design problem: it must not spoil discovery, but it can't
  be so unfriendly that people quit. The answer was simple bought maps that the player fills in ([Game
  Informer][gi-hk]). Dread moved to detailed outlines, zoom, and six colours of player markers that also show on the
  minimap ([3DJuegos on Dread's map][dread-map]). In Silksong, map-poking works because open exits show up on the map.
  Secret walls don't, and Brown counted over 50 of them ([GMTK: Silksong][gmtk-silk]).
- **Wayfinding without text.** Aids range from subtle (sound, wildlife, architecture: 1–20% reliable) through coarse
  (lighting, colour contrast, sightlines, leading lines: 35–60%) and situational (breadcrumbs, a creature leading,
  an active threat: 70–93%) to direct (impassable barriers, always-on UI). Start subtle and escalate only where
  playtests show people missing the route. Players look where they are heading and rarely look up ([Level Design
  Book: wayfinding][ldb-way]).

### `world.md` checked against this
What it already gets right: a spine with one hub (Super Metroid's shafts, HK's Crossroads); a lock-before-key column;
far-side shortcuts under a minute; no-softlock rules with sequence breaks allowed; stubs that read as scenery; moon
patches every 3–5 rooms; death that costs time only; moths as a situational guide (the strongest class of aid that
doesn't feel like UI); vistas as landmarks.

**Concrete improvements:**
1. **Tier 1's back payoffs all land at the very end.** Fling's payoff (the wood's lantern chain) and the double jump
   ledges only pay after the valley boss, so for most of Tier 1 an ability never reopens anywhere already visited.
   *Change:* give glide, wall jump and fling each a payoff inside the region where they're found, reached within
   about 15 minutes. For example, a wick in the wood hub reachable only by wall jump, and a valley loop that fling
   closes back onto the rim.
2. **The map should mark only lamps she has seen.** "The map shows every lamp still burning" would turn secrets
   into a checklist, which is the over-guidance Brown warns about. *Change:* a lit dot appears once the lamp has been
   on screen. Per region, the map shows a count ("3 lamps unseen") so completionists know to search without being
   told where.
3. **Show open exits for map-poking, not stubs.** Draw exits she has seen but not taken as open notches on room
   edges (Silksong). Sealed stubs stay unmarked (rule 2 already says so).
4. **Player pins.** One or two marker kinds (Dread, HK) cost almost nothing and solve "I saw something up there". A
   lit dot covers lamps; a pin covers everything else.
5. **One consistent secret language.** Our secrets are lamps "behind false walls", but nothing defines how a false
   wall looks. *Change:* one tell for the whole game (for example a draught of spores through a crack, or moth dust
   that stops at a wall), taught once in the wood on the critical path, then used everywhere. Silksong's hidden
   walls with no clue are its weakest secrets ([GMTK: Silksong][gmtk-silk]).
6. **A short leash after each ability (Dread).** After the fling glade, and later the dash and Shroud glades, use a
   one-way drop or a temporary seal so the next two or three rooms *are* the ability ladder, then release the player
   into the loops. The valley is 50–65 minutes of open bowl, which is the region most likely to cause wandering.
7. **Teaser rooms at region borders (HK).** The last wood room before the valley should already carry the valley's
   look (foxfire stacks, a flicker blinking through a gap). Each region does the same for the next.
8. **Soft gates in the valley.** Give the valley's three loops a soft order (a harder creature room or a long flicker
   run) instead of hard ability gates where the story allows. Players then get real choices, and sequence-breakers
   get a reward.
9. **A breaker bot per region.** Moon's speedrunners, done cheaply: a pilot that tries fling and pogo skips, and
   wall-kick climbs (one wall is enough, see movement memory) against every gated ledge. It reports what it reached
   early. Rule 6 is then tested, not just stated.
10. **Count the novelty.** Pacing in the genre is "something new every few minutes". Add a column to the region
    table listing each new idea (ability, lamp kind, creature, vista, set piece) with its minute. Tier 1 should come
    out at roughly one every 4–5 minutes.

---

## 3. Room craft

**Layout rules** (from Super Metroid, HK, Celeste, Dead Cells and the Level Design Book, adapted):
- **Entrances face the room's question.** From the door, the first screen should show the goal or its light (we
  already require lamps to be visible "within a few seconds"). Doors open into the dark, and nothing hostile is in
  range on entry. Already in `world.md` §6: keep both as checks.
- **One job and one new idea per room.** Teach, test, rest, vista, secret, boss or corridor (Dead Cells' purpose
  tags). A room that teaches doesn't also test something else.
- **Read in two seconds, solve in thirty.** The player should see the path and the hazards on entry and then spend
  their time executing, not hunting. Celeste's rooms work because each one is short and is its own checkpoint, so a
  retry costs nothing ([Celeste GDC level design talk][celeste-gdc]). For us, hazards already return her to the last
  safe ground in the room. Keep the distance between safe grounds short in hard rooms.
- **Risk is optional and visible.** The main route is the safe line. A visible lamp above thorns or past a predator
  is the risky line, and it pays in moths. Never put the only route through the risk.
- **Secrets break the pattern, not the rules.** Basso: a secret should break the pattern the game has set, and the
  harder it's hidden, the better the payoff can be ([Nintendo Life: Animal Well][aw-nl]). Secrets still follow the
  one secret language (§2.5).
- **Rest spots are quiet on purpose.** Super Metroid builds dread and relief from save rooms and music shifts
  ([Invisible Hand][sm]). Moon patches should be dark, still and safe, with Tatter there and a low sound bed. No
  predator is ever in sight of one.
- **Every dead end pays.** A path that ends must end on a lamp, a vista or a shortcut. Otherwise cut it.

**Teaching an ability:** keep `world.md` §6's ladder, with two additions:
1. **A demonstration before the lock room.** Moths (or Tatter, or a creature) do the move first, the etecoon
   method. For Fling: a moth whipping off a lantern on the tangent. For Shroud: a moth that folds and drops when a bat
   calls.
2. **The ladder's safe step costs seconds, never a pip.** Mario's first beat is always played over a safe floor
   ([MCV: kishōtenketsu][kisho]).

**Encounter density** (adapted from Dead Cells' budget per combat tile and our own "density follows light"):
- About one in three rooms is dark and quiet (corridor, rest, vista). Lit rooms carry one to three threats per
  screen, tied to lamps.
- Never more than one *new* creature in a room, and never a new creature and a new lamp kind in the same room.
- A boss approach room is quiet (the HK rule: the walk in is tension, not attrition).
- Put the numbers in data (a threat point per creature kind, a budget per lit screen) and lint them like Dead
  Cells, so a room can't quietly turn into a gauntlet.

---

## 4. Feel: movement, combat, camera, hitstop, juice, forgiveness

### Our sim against the references
| Thing | Reference | Ours (tuning.ts / memory) | Verdict |
|---|---|---|---|
| Coyote time | Celeste 0.1 s = 6 frames ([Celeste source][celeste-src]) | `coyoteFrames` 6 | on par |
| Jump buffer | Celeste: a press just before landing fires on the landing frame ([Forgiveness][forgive]) | `jumpBufferFrames` 6, double jump buffer 6, landing preference | on par, and the landing preference is extra |
| Apex hang | Celeste halves gravity near the apex while jump is held | `apexHangMult` 0.5 under `apexHangVy` 3 | same as Celeste |
| Head corner correction | Celeste 4 px of a 320 px view (1/80 of the width) | `headCorrectPx` 20 of 1920 (1/96) | on par |
| Wall jump reach | Celeste `WallJumpCheckDist` 3 px (1/107 of the width) | `wall.checkPx` 20 (1/96), and kicks rise in full on a tap | more generous: good |
| Run start | Celeste reaches full run in about 5 frames; HK has no acceleration at all ([Game Informer][gi-hk]) | full speed in 6 frames, stop in 5 | between Celeste and HK, as Matt asked ("HK snappy") |
| Slash buffer | | 8 frames; slashes never lock movement | good. HK-style |
| Hitstop | rules of thumb: 2–3 frames for a jab, 4–6 for a normal hit, 8–10 for a heavy one ([Bugnet][bugnet-hs]); SF2 about 10 ([Critical Points][critpoints]) | 4 / 4 / 7 on a creature, 2 on a pogo | right for hits. **Undecided for the snuff**, see below |
| Camera | Keren: follow the action, cut needless motion, show what's needed ([Scroll Back][keren-cam]) | window plus averaged forward look-ahead, a landing band (platform snap), a glide look-down, fall follow, slash kick, rest framing | strong already. Missing pieces below |

The movement base is at the Celeste and HK level. The gaps are all in the **new** verbs and in the camera.

### Gaps and recommendations
1. **Forgiveness for the lamp verbs** (principle 2). Each needs a tuning row and a test, as the wall kick got:
   - *Caught:* the core radius is smaller than the drawn flame. Passing within a few px of it on a fast line doesn't
     catch her.
   - *Snuff:* the flame's hit box is bigger than its picture (Celeste's rule: the player's reward boxes generous,
     the threat's hurt boxes tight). A slash in its 8-frame buffer that ends up in range still lands.
   - *Beat free:* presses made while being drawn in count toward the three. A dash press during Caught is buffered.
   - *Fling:* a release window measured in frames, not one exact frame. The stick bend reads the last few frames, not
     the release frame alone.
   - *Pull entry:* the pull ramps up over a few frames from the field's edge, so it never yanks a glide off its line
     in one frame. It must feel like gravity, not like a wall.
2. **A juice budget, in order of importance.** Write it down so each agent knows how loud their event may be:
   snuff (biggest: the longest hold, a light drop, the dark blooming outward, a sound drop, moths bursting) > boss
   phase break > creature kill > slash hit > Caught / beat free > hard landing > glide open > step. Suggested start for
   the snuff: 8–10 frames of hold (the heavy end of the hitstop range), longer than the finisher's 7 so the verb
   outranks the fight. Vlambeer's and Juice it or lose it's lists ([screenshake][shake], [juice][juice]) give the
   palette: hold, flash, kick, particles, a lingering mark (the husk's cold glow).
3. **A terrain clang.** `combat.md` lists "an event when a cut meets terrain" as wanted. It's a small sim event, and
   it stops slashes at walls feeling like whiffs.
4. **Camera attractors (cue focus) for lamps and threats.** Keren's cue-focus pulls the view toward objects of
   interest ([Scroll Back][keren-cam]). Inside a pull field the view should ease toward the flame, so lamp, core and
   exit are all on screen. Boss arenas lock (planned). Vistas lift (planned). Watch out: Keren notes projected focus
   handles vertical platforming badly. Keep the vertical dead zone we have.
5. **Death and respawn.** Berbece's "why your death animation sucks" ([talk][berbece]) and Celeste's instant retry
   argue for fast respawn with a short readable beat. Our re-form glide with a dip (0.6–0.9 s) is in range. Don't let
   it grow.
6. **Enemies are tuned against the full move set, one by one.** Moon tried procedural enemies and dropped them.
   Every enemy's behaviour tree was tuned against Ori's whole move set ([WotW Q&A][wotw]). Adding combat late meant
   redesigning every encounter in the game (about 1.5 years, [GamingBolt][bolt]). *Lesson:* fix the verb set (pull,
   caught, snuff, fling, and how they mix with the blade) before building many encounter rooms.

---

## 5. Bosses and enemies

**Tells.** Pattern bosses work when every attack has a readable wind-up, a committed active part and a recovery the
player can punish ([GMTK: How Cuphead's bosses try to kill you][cuphead]; [Keren: boss battle design
fundamentals][keren-boss]). Hornet's moves never change between her fights. The second one is harder through speed
and more moves, not new rules ([36Kr on Hornet][hornet]). Our shared tell language (hunt colour, then quickening
flashes) is a strength. It reads at any size and is learned once.
- **Rule:** every tell must read **with the sound off**. We ship muted until Matt approves audio, so a sound cue can only ever
  back up a visual one.
- **Rule:** the replay test. If a player watching the death back can say what they should have done, the tell
  worked.

**Phases.** Each phase should change the *picture* or the *arena*, not only the numbers (Cuphead). Our great-lamp
arenas do this naturally: flames going out make the room darker and the pull weaker. That's an advantage. Use it as
the phase clock everywhere.

**Fairness checklist:** the whole arena is on screen (camera lock, at about 1.2 screens, already planned). No
attacks from off screen. No hit during her re-form. A recovery after every big attack that is long enough for one
punish. Contact damage only from parts that look dangerous. The run back is under 15 s (a moon patch at the door,
already planned).

**Difficulty curve.** A first boss is a lesson. **The Weaver (creatures.md §3) currently tests glide, wall jump,
Caught and pogo across three phases with crossing pulls and a live web. That's a lot for the first boss of the
game.** *Change:* keep one exam per phase (phase 1 glide between pulls, phase 2 wall jump, phase 3 pogo), drop the
"weaver runs to where she touches the web" layer from phase 1, or move it to phase 2. Make the first attempt
survivable for 60 seconds by a first-timer. The Mantis can then be the real HK-style test, at Hornet pace, as
planned.

**Arena design:** flat or simple floors, walls she can kick, one or two height levels, and lamps as the moving part.
No pits that kill outright in boss rooms. Hazards cost a pip and a reset to safe ground, as everywhere.

**Enemies outside bosses:** one silhouette, one behaviour, one tell, as creatures.md already says. Introduce each one
alone in a dark-adjacent room with a safe floor, then pair it with a lamp, then with a second kind (the four-beat
pattern).

---

## 6. Opening the game

### How the greats open
- **Hollow Knight:** a short sequence, then you fall into a short pass with spikes and crawlers that teaches jump
  and strike by consequence, and then a near-empty town with one well down (from the game itself). Control comes in
  seconds, the first enemy within a minute, and there's no forced tutorial text.
- **Ori 1:** the exception, a long playable prologue that took Moon **eight months** to get right, built on constant
  team feedback ([Ori 8-year Q&A][ori8]). We decided not to copy it (`story-direction.md`).
- **Super Metroid:** a wall to the right you can't break makes you turn left; a door choice is set by what you've
  just been given; Act 1 is tightly guided ([Invisible Hand][sm]).
- **Mega Man X:** the stage itself is the tutorial. A setup you can't win shows you who the hero is and what the
  stakes are ([Nintendo Life][mmx]).
- **Animal Well:** no text, no weapons, no cutscenes; the world is the teacher ([Time Extension][aw-te]).
- **Dread:** the first hour is called a model of quiet tutorial design. It steers with enemy and object placement
  before opening up ([Gamereactor on Dread's first hour][dread-1h]).

What they share: control in seconds; one place to go; the first verbs taught by what happens; failure that's cheap;
and a first image that shows the stakes.

### Scene 1 (`01-hatching-branch.md`) checked against this
Strong already: control by 8 s; the cocoon's three jump presses are the same input as beating free from a lamp (an
excellent plant); the swarm as the one want; Tatter as the stakes; no text; the scene judged in play and in clips.

**Improvements:**
1. **Any button breaks the cocoon, and it hints by itself.** A first-time player may press attack, a stick or
   nothing. Count any action press. If 3 s pass with no input, the cocoon twitches on its own (one visible pulse)
   and, after a second hint, breaks by itself. That keeps "input held at most 3 s" true for every player.
2. **Plant the glide lock here.** `world.md` says glide's lock is "the first gap she can't cross, seen from the
   hatching branch", but the brief doesn't include it. Add one wide gap to a far branch that the swarm crosses
   easily and she can't. She has to take the drop instead. Glide then arrives at minute 5 as the answer to something
   she wanted.
3. **Say what happens if she falls.** The branch is high over "real depth", and the brief doesn't say what a slip
   costs. In the first 30 s it must cost nothing: either the drop below is caught by a lower bough that leads back
   up in a few seconds, or a slip returns her to the last safe ground with no pip lost. There's no hazard damage in
   this scene.
4. **Move the pogo thorn out, or make it optional.** A pogo is an air down-slash over a hazard: our hardest basic
   input, and it costs a pip if missed. Teach run and jump here. Keep the thorn as an optional high line (a hop onto
   the knot above it) or move the first pogo into the chase, over a safe floor (the four-beat rule).
5. **The run should have a rhythm.** "A couple of small gaps and steps" can be tuned so that a player who simply
   holds right and presses jump at each gap never stops. Gaps at running-jump comfort (well under the 410 px a flat
   jump carries), steps under 192 px. The joy comes from flow, not precision.
6. **The exit must read as the way on.** The swarm should dive over the branch's end first, and the camera should
   look down past the lip before she reaches it, so dropping into the dark is following, not guessing.
7. **Remove the conflict with the wall-jump payoff.** `world.md` lists "the hatching branch's high wick" as wall
   jump's back payoff, but the scene's rule is "no lamps, the only warm is the far afterglow". Either add the wick in
   a later tier as a data-only hook (allowed by `world.md` §5.8), or move that payoff to the wood hub.
8. **Add play checks to "Done means".** The current list is mostly visual. Add: a naive pilot (holds right, presses
   jump at gaps, presses random buttons at the cocoon) reaches the exit; a first-time human reaches it in under
   45 s without stopping more than 3 s to wonder where to go; a speed run takes under 20 s; no input sequence
   strands her.

---

## 7. Production lessons from small teams

| Team | Lesson | Source |
|---|---|---|
| Team Cherry (3–4 people) | Grew out of game jams; built the central area first and worked outward; each month they chose an area and built it, with a plan that could "bear a change of course"; designed areas as places first, not around item placement; a beta of the first area "cemented our direction"; cut Boneforest and shrank Deepnest when scope grew; kept the art deliberately simple | [Game Informer][gi-hk], [MCV][mcv-hk], [GoNintendo on Silksong][silk-gon] |
| Moon Studios | Controls first, fun in greybox; blockout → critique → "design approved" → art; constant internal play; speedrunners hired for breaks; the prologue took 8 months; adding combat in Ori 2 meant redesigning every encounter; feedback that powers came too late moved staples (double jump, dash, bash) earlier in Ori 2 | [Ori 8-year Q&A][ori8], [WotW Q&A][wotw], [GamingBolt][bolt] |
| Red Candle (6, then 10+) | More than a year without a satisfying combat loop; adopting a proven model (Sekiro) unblocked it; about five years of combat tuning | [PCGamesN][ns-pcgn], [Into Indie Games][ns-iig] |
| Maddy Makes Games | Celeste began as a weekend PICO-8 prototype; forgiveness everywhere; short rooms that act as checkpoints | [Forgiveness][forgive], [Celeste GDC talk][celeste-gdc] |
| Billy Basso (solo) | Mechanics that feel good first, the world fitted to them afterwards; hard constraints (no guns, a fixed resolution, no cutscenes) to keep a solo scope | [Time Extension][aw-te], [Nintendo Life][aw-nl] |
| Mark Brown (solo) | Cut about 20%; lock content, then polish; play the whole game before deciding; daily playtests; "done" is a decision | [GMTK: Finishing][finish] |
| Motion Twin | A hand-built skeleton plus purpose-tagged rooms plus budgets, so content stays coherent at scale | [Deepnight][dc] |

**Polish order** (common to Moon, Team Cherry and Brown): feel → layout and flow → readability (silhouettes, tells,
the path) → art → juice → audio → performance. Each step is checked in play before the next.

**Playtesting method** ([Level Design Book: playtesting][ldb-play]): self-test daily, critique after each phase,
and public tests once a room is readable. Watch, don't explain. Write down where people stop, die, or look the wrong
way. Ask comprehension questions after ("what did the moths do?"), not leading ones. Valve runs a weekly test that
drives the week's work.

### What applies to an AI-agent studio
1. **Matt is the playtester who matters; bots are the ones who never tire.** Keep Matt's play as the fun gate.
   Run naive, curious and breaker pilots on every room every loop (we already have the pilot harness). Add a
   **first-timer bot** that only knows "move toward light or moths, jump at gaps" as a cheap wayfinding test.
2. **Record, don't ask.** AI critics judge prose well and frames poorly (`memory/ai-critics.md`). Have review agents
   look at clips and death heatmaps (where pilots died, where they stood still) rather than score descriptions.
3. **Keep a greybox ahead of the polish.** Team Cherry's beta of one area and Brown's "play the whole game" both say
   the same thing: you can't judge pacing, the map or gating from one perfect room. Our "one scene to AAA, then the
   next" is right for art. **Gameplay greybox should run 3–5 rooms ahead of the polished front, and by the Weaver,
   the whole wood should exist in grey and be playable end to end.**
4. **Fix the verbs before building lots of rooms** (Moon's Ori 2 lesson). The lamp verb in `test-grove` (README
   increments 1–2) should be proven before the first lamp room gets art.
5. **Write rules as checks.** Agents follow lint, not lore. Each rule in this doc that can be data-checked (room
   purpose, novelty minute, threat budget, lock-before-key, doors into the dark, max seconds between safe grounds)
   should become part of the symbolic world check or a validator.
6. **Cut by default.** Agents only add (`story-direction.md` diagnosis). Every loop's brief should name one thing to
   remove or simplify.

---

## 8. Checks for every piece

For review agents, alongside the art checklist in `docs/art-direction.md`. Each is yes or no. A "no" sends the piece
back.

**Play**
1. Is it fun in grey boxes, with no art? (Matt played it.)
2. Does a naive pilot get through, and does a breaker pilot find no softlock?
3. Is the room's job clear? Exactly one new idea at most?
4. On entry, can you see the way on, or its light, within 2 seconds? Nothing hostile in range of the door?
5. Is the risky line optional, visible and paid in moths?
6. Does every dead end pay (a lamp, a vista or a shortcut)?

**Teaching and gating**
7. Is every new ability or lamp kind demonstrated (moths, creature) before it's required, then laddered safe →
   combine → test?
8. Was the lock seen at least about 10 minutes before its key? Does the key reopen something old within about 15
   minutes?
9. Could a player get stuck or lost for more than about 2 minutes? (First-timer bot plus Matt.)

**Feel**
10. Are threat boxes tighter than their pictures and reward boxes (flames, ledges, pogo targets) looser?
11. Is the event's juice no louder than its rank in the budget (snuff loudest)?
12. Does the camera show the threat, the target and the landing? No needless motion?

**Danger**
13. Does every attack have a tell readable with the sound off, and a punish window after it?
14. Does a death replay make the cause obvious? Is the run back under 15 s?
15. Is the distance between safe grounds short enough that a mistake costs seconds, not minutes?

**Place and story**
16. Does the room say where it is in the world (region kit, the moon's side, a hint of the next region near borders)?
17. Is there a still, dark, safe moment within the last 3–5 rooms?
18. Did this piece remove or simplify something?

---

## Sources

- Game Maker's Toolkit (Mark Brown): [The World Design of Hollow Knight | Boss Keys][gmtk-hk] · [Why You Didn't Get
  Lost in Metroid Dread][gmtk-dread] · [Getting Lost in Axiom Verge][gmtk-av] · [The World Design of Hollow Knight:
  Silksong (text)][gmtk-silk] · [Why Does Celeste Feel So Good to Play?][gmtk-celeste] · [How Cuphead's Bosses (Try
  to) Kill You][cuphead] · [Half-Life 2's Invisible Tutorial][hl2] · [Secrets of Game Feel and Juice][gmtk-juice] ·
  [The hardest thing about finishing][finish] · [MCV on the kishōtenketsu episode][kisho] · [Omega Metroid on Boss
  Keys' dependency graphs][omega]
- Team Cherry: [Game Informer, The Making of Hollow Knight][gi-hk] · [MCV, When We Made Hollow Knight][mcv-hk] · [PC
  Gamer, How to design a great Metroidvania map][pcg] · [GoNintendo, Silksong's world][silk-gon]
- Moon Studios: [Game Developer, Q&A on Ori and the Will of the Wisps][wotw] · [Q&A with Thomas Mahler, 8 years of
  Ori][ori8] · [GamingBolt, WotW interview][bolt] · [GDC: The Animation Process of Ori][ori-anim] · [GDC: The Art of
  Ori and the Will of the Wisps][ori-art]
- Red Candle: [PCGamesN, Nine Sols interview][ns-pcgn] · [Into Indie Games, Nine Sols interview][ns-iig]
- Maddy Makes Games: [Celeste & Forgiveness][forgive] · [Celeste source, Player.cs][celeste-src] · [The Level Design
  of Celeste (GDC 2017)][celeste-gdc]
- Billy Basso: [Nintendo Life, Animal Well][aw-nl] · [Time Extension, The Making of Animal Well][aw-te]
- Metroid: [The Invisible Hand of Super Metroid][sm] · [3DJuegos on Dread's map][dread-map] · [Gamereactor, Dread's
  first hour][dread-1h]
- Others: [Deepnight, The Level Design of Dead Cells][dc] · [Nintendo Life, Mega Man X's tutorial][mmx] · [Boris the
  Brave, Lock and Key Dungeons][boris] · [Level Design Book, wayfinding][ldb-way] · [Level Design Book,
  playtesting][ldb-play] · [Itay Keren, Scroll Back: cameras in side-scrollers][keren-cam] · [Itay Keren, Boss Battle
  Design Fundamentals][keren-boss] · [Game feel (Swink's definition)][swink] · [Liz England's review of *Game
  Feel*][england] · [Jan Willem Nijman, The Art of Screenshake][shake] · [Jonasson & Purho, Juice it or lose it][juice]
  · [Nicolae Berbece, Why your death animation sucks][berbece] · [John Nesky, 50 Game Camera Mistakes][nesky] ·
  [Critical Points on hitstop][critpoints] · [Bugnet on hit pause][bugnet-hs] · [36Kr on Hornet's fights][hornet]

[gmtk-hk]: https://amara.org/v/C3BED
[gmtk-dread]: https://amara.org/en-gb/videos/Aci4iDbgsAtY
[gmtk-av]: https://amara.org/v/C3BFx
[gmtk-silk]: https://gmtk.substack.com/p/the-world-design-of-hollow-knight
[gmtk-celeste]: https://amara.org/v/C3BEJ/
[cuphead]: https://amara.org/v/C3BEq
[hl2]: https://www.youtube.com/watch?v=MMggqenxuZc
[gmtk-juice]: https://amara.org/v/C3BGA
[finish]: https://gmtk.substack.com/p/the-hardest-thing-about-finishing
[kisho]: https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps
[omega]: https://omegametroid.com/check-out-this-in-depth-world-design-analysis-of-the-metroid-series/
[gi-hk]: https://gameinformer.com/2018/10/16/the-making-of-hollow-knight
[mcv-hk]: https://mcvuk.com/when-we-made-hollow-knight/
[pcg]: https://www.pcgamer.com/how-to-design-a-great-metroidvania-map
[silk-gon]: https://gonintendo.com/contents/53066-team-cherry-walks-through-the-unique-way-they-designed-hollow-knight-silksong-s
[wotw]: https://www.gamedeveloper.com/design/q-a-designing-the-gorgeous-metroidvania-i-ori-and-the-will-of-the-wisps-i-
[ori8]: https://www.orithegame.com/qa-with-thomas-mahler-celebrating-8-years-of-ori-the-game/
[bolt]: https://gamingbolt.com/ori-and-the-will-of-the-wisps-interview-combat-map-size-exploration-and-more
[ori-anim]: http://www.gdcvault.com/play/1021791/Animation-Bootcamp-The-Animation-Process
[ori-art]: https://gdcvault.com/play/1027035/The-Art-of-Ori-and
[ns-pcgn]: https://www.pcgamesn.com/nine-sols/interview
[ns-iig]: https://intoindiegames.com/features/nine-sols-an-interview-with-red-candle-games/
[forgive]: https://maddymakesgames.com/articles/celeste_and_forgiveness/
[celeste-src]: https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs
[celeste-gdc]: https://gamedeveloper.com/design/video-the-level-design-of-i-celeste-i-
[aw-nl]: https://www.nintendolife.com/features/i-avoided-almost-all-the-existing-tropes-peeling-back-the-layers-of-animal-well
[aw-te]: https://www.timeextension.com/features/the-making-of-animal-well-2024s-most-unique-metroidvania
[sm]: https://gamedeveloper.com/design/the-invisible-hand-of-super-metroid
[dread-map]: https://www.3djuegos.com/juegos/metroid-dread/noticias/el-mapa-de-metroid-dread-esta-disenado-para-favorecer-la-210716-115451
[dread-1h]: https://www.gamereactor.eu/6-things-i-learned-about-metroid-dread-after-playing-its-first-hour/
[dc]: https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/
[mmx]: https://www.nintendolife.com/features/soapbox-mega-man-xs-tutorial-is-the-perfect-intro-to-capcoms-sublime-sub-series
[boris]: https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons
[ldb-way]: https://book.leveldesignbook.com/process/blockout/wayfinding
[ldb-play]: https://book.leveldesignbook.com/process/blockout/playtesting
[keren-cam]: https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers
[keren-boss]: https://www.gamedeveloper.com/design/video-boss-battle-design-fundamentals
[swink]: https://en.wikipedia.org/wiki/Game_feel
[england]: https://lizengland.com/blog/review-game-feel-by-steve-swink/
[shake]: https://www.youtube.com/watch?v=AJdEqssNZ-U
[juice]: https://www.youtube.com/watch?v=Fy0aCDmgnxg
[berbece]: https://www.youtube.com/watch?v=pmSAG51BybY
[nesky]: https://www.youtube.com/watch?v=C7307qRmlMI
[critpoints]: https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
[bugnet-hs]: https://bugnet.io/blog/how-to-use-hit-pause-to-make-impacts-feel-powerful
[hornet]: https://eu.36kr.com/en/p/3289504833954437
