# The goal: three moth-lanterns and the heart of the grove

A moth is drawn to light; the grove's light has gone out. She gathers glints, kindles three dormant
lanterns with them, the hollow tree wakes, she walks into it. No text anywhere in the sim.

Sim: `src/sim/goal.ts` (`updateGoal`, last thing in `step`), numbers in `tuning.goal`, scene data
`lanterns: [{id, x, y, cost?}]` and `heart: {x, y}` (both a feet-centre point on solid ground, like
the spawn). Tests: `tests/unit/goal.test.ts` (rules), `tests/unit/goal-pilot.test.ts` (one whole run
with real inputs + the economy audit). Drawn by `src/render/goal/` (goal-render.md).

## Rules
- **At a lantern** = grounded, mode `normal`, feet on its base line, her box overlapping its trigger
  box (48 x 64, centred on its foot), in control (not staggered, not faded). Flying or running through
  it is not "at" (a run crosses the box in 9 frames).
- **Kindling**: at a dormant lantern with `count >= cost` and no slash out, `channel` counts up;
  the 30th frame in a row (`channelFrames`) kindles it. No button: the glints have no other use, so
  nothing is lost by it being automatic, and 0.5 s of standing still is deliberate enough (it cannot
  happen by accident). Broken by leaving / jumping (`leave`) or a slash (`attack`): the count starts
  over, nothing was spent. A slash blocks it until `slashEnd` (14-20 frames). **Nothing can hurt her
  while she kindles** (`player.kindling >= 0`): a creature that touches her is turned away as if it
  had hit (burrback: recoil and turn; lampwing: bounce and give up), she is not hurt, the channel
  goes on. (`lanternCancel` reason `hurt` still exists for a blow that comes some other way.)
- **Cost** 12 each (`goal.cost`, or `cost` on the lantern), 36 in all. It comes out of the wallet:
  `pickups.count -= cost`, `pickups.spent += cost`. `count + spent + lost` = everything gathered
  (`lost` = glints lying in clusters she dropped when she faded: pickups.md);
  `pickups.taken` is still the number of scene pickups collected.
- **Refuse**: at a dormant lantern with too little, once she has **stood still** there (at it, |vx|
  < 0.5) for 12 frames (`refuseFrames`; `lanterns[i].short` counts them): `lanternRefuse {have, need,
  show}` once, and not again until she has been more than 160 px away sideways (`refuseLeavePx`): a
  hop on the spot is the same visit. A run through the box says nothing (the playtest's hold-right
  run spent the beat at frame 60, already past it). `show` (150, `refuseShowFrames`) = how long the
  price is worth showing. If glints land while she stands there the channel just starts.
- **Lit** until the restart (`R`, `__game.load()`); a fade / re-form and a teleport keep it.
- **Rest point**: standing at a lit lantern while hurt for 45 frames (`restFrames`) makes her whole
  (`lanternRest`), free. 45 > 30 so resting is a longer breath than kindling, and kindling hurt gives
  the rest 45 frames later without moving. Not instant, so it is no shield in a fight.
- **Re-form point**: `goal.restAt` = the lit lantern she last stood at (kindling sets it). A fade then
  re-forms her at its foot (with 2 of 4 lights, a third of her wallet left where she fell: enemies.md;
  the rest above is then the real heal) instead of the last safe ground, **whatever lives next to it** (safe ground
  falls back to the spawn near a creature's home; a lantern never does: she has 90 frames of safety
  and it is the promise the lantern makes). No lantern lit: safe ground as before.
- **Calm**: kindling settles every living creature within 900 px (`calmPx`: about half a screen, so
  everything in the picture; its body or its home) for 120 frames: a burrback stands (`pause`), a
  lampwing that has noticed her gives up (`enemyGiveUp` cause `calm`: rests 60, flies home, notices
  nothing on the way). **A calmed creature's touch does nothing** (`enemy.calm` = frames left; a
  staggered one keeps its tumble but is calmed too). In the grove: the stone reaches burr-path,
  lamp-glade, lamp-f3; the crown burr-ledge and lamp-glide-1; the far one lamp-glide-2.
- **Sanctuary**: a LIT lantern keeps creatures out for good (`src/sim/sanctuary.ts`). A burrback on
  the lantern's own ground turns round when its box would come within 110 px of the lantern's foot
  (`sanctuaryPx`; `enemyTurn` cause `lantern`); one caught inside (it was there when the lantern
  caught, or was shoved in) is harmless until it has walked out. A lampwing gives up a pursuit 160 px
  from the lantern's centre (`lampSanctuaryPx`; `enemyGiveUp` cause `calm`) and is harmless inside
  that; it comes, hangs at the edge, goes home, and may come again. Dormant lanterns stay dangerous
  except during the channel. Why two numbers: her box at the lantern reaches 43 px from the foot, a
  burrback's keeps 110 away, so standing anywhere "at" it she is 67 px clear; the lampwing's is
  bigger because it overshoots ~15 px as it brakes. The playtest case (kindle with burr-far on her:
  kindled 827, hurt 852 and 932, faded) now: no hit at all in 500 frames, burr-far (since removed from that ledge) never nearer than
  5634 (traced live).
- **The heart** (`scene.heart`, trigger 96 x 96 standing on its point). Asleep: her box touching it
  fires `heartSleep` once per run, nothing else. It wakes in the step the last lantern is kindled
  (`heartWake`, right after that `lanternKindle`). Awake: **standing** in it (grounded, in control)
  ends the run: `gather` with the summary; gliding through does not. The summary also carries a
  tally for the ending to reward thoroughness: `glints` of `glintsTotal`, `bonus`, `pods` / `podsTotal`
  (12), `greats` / `greatsTotal` (6), `kills` / `enemiesTotal` (9), `deaths`, `lamps` / `lampsTotal` (2). Leftover
  glints have the wayside lamps to go to (below).
- **The tally rule** (state version 14, 15 since the lamps): `glintsTotal` = every pickup + every pod + every creature at its
  **base** worth (189 in the grove: 96 + 62 + 31). What a finisher kill pays over the base (2 each) is
  `bonus`: `pickups.bonus` counts it at the kill, the summary carries it apart. `glints` = `count + spent +
  lost - bonus`, so `glints <= glintsTotal` by construction (every glint comes from a pickup, a pod or a
  creature; nothing is clamped), `glints === glintsTotal` means everything was found however the creatures
  died, and everything that reached her is `glints + bonus`. Show "glints of glintsTotal", and the bonus
  as "+n" if at all. (Before: the total counted creatures at finisher value, 100% needed 11 finisher kills.)
- **The ending**: from `gather` no input reaches her and nothing can hurt her (contact is off).
  She walks on to within 12 px of the heart's centre and stops (`heartWalkPx`; so the ending always
  finds her in the same place), every creature in the scene is calmed for the hold, lampwings take
  no more notice. 240 frames later (`holdFrames`, 4 s: room for a slow swell and a fade) `endHold`,
  `goal.ended = true`, and she stays held until the restart. `goal.endedControl = true` gives control
  back after the hold instead (still unhurtable) if a free walk in the lit grove is wanted.
- `run.start` = frame of her first input; `run.hits` counts `hurt` events. Summary: `glints` =
  `count + spent + lost - bonus` (the tally rule above), `time` = frames since the first input, `kills` = dead enemies, `hits`.
- A scene without `lanterns` / `heart` has no goal: nothing fires. Lanterns without a heart can be lit.
- State version 15. Existing play is untouched when the lanterns are ignored (tested: the grove with
  and without them plays identically).

## Where they are, and why
| id | foot x, y | how she gets there |
|---|---|---|
| `lantern-stone` | 1448, 1280 | at the foot of the carved moth-stone, 328 px right of the spawn, on the spawn ground: plain walking. It notices her in her first steps (3 of 12); `pod-stone` at its foot stops her there and pays the rest (below: "The lantern notices her"). Without the pod the spawn line, pool arc and shallows hold 11: one short. |
| `lantern-crown` | 3684, 192 | on trunk B's top, the highest point: the wall-jump shaft (or the left route), then jump + double jump from trunk A (the top runs on east as a 192 px bough with a catch branch under it: scene-and-units.md). No enemy near: a pure movement test. The shaft, crown and the two great glints on the way pay for it (19). It is also where the summit glide starts, so a failed glide re-forms her at the take-off. |
| `lantern-far` | 5524, 448 | on the far ledge, at the end the **summit glide** arrives over: the designed approach. From the crown lantern: jump, double jump (the canopy is 420 px over the scene's top now, so both fit: feet reach y -277), hold: the glide passes 470 px over the first lampwing (unnoticed), 200 px over the second, and crosses the ledge's lip 160 px up; close the wings and she drops by the lantern. Held to the end she sails on to the scene's wall and slides down onto the ledge's far end. Fallback on foot: root, branch, F6, F7, a hop. **No creature walks the far ledge any more** (burr-far is gone: a full held running jump from F7 lands at 5670-5740 and the glide held to the end comes down at the wall, so no patrol on a 288 px ledge was fair; `layout-pilot.test.ts` runs the jump at 60 start times). Its guard is `lamp-glide-2`, whose home (4900, 250) is 646 px from the lantern: it looks up as the summit glide passes 200 px over it, follows, and gives up at the lit lantern's edge, which is the one place the lampwing sanctuary is seen in play. It does not notice her on F6 or F7. |
| heart | 5212, 1088 | at the shrine on the right rise. With the camera at its right stop the mid layer's hollow tree (layer x 4600, parallax 0.68) stands at playfield x ~5214, so the glowing hollow is straight behind it. From the far ledge: off the left end, off F7, a short walk. |

- One per third of the scene (cool / warm / deep), none within 300 px of the spawn (validated).
- The cocoons under the great bough have no lantern (nothing to stand on under them; the ledge above
  already has a burrback, a lampwing and the big pod).
- `great-crown` (3648, 134) shares trunk B's 128 px top with `lantern-crown`: the bud is 36 px left of
  the lantern's foot. If they crowd each other when drawn, move the great glint, not the lantern.

## Economy (audit, default tuning)
| source | glints |
|---|---|
| world: 66 glints + 6 great x 5 | 96 |
| 12 pods | 62 |
| 4 burrbacks (4, 6 by finisher) + 5 lampwings (3, 5) | 31 (+ up to 18 bonus) |
| all (`glintsTotal`) | 189 |

- 36 is 19% of everything and 38% of the world glints: a player who never opens a pod or kills
  anything can pay for all three with 60 to spare. With both lamps: 52 (28%).
- The pilot, which goes straight for the goal (2 of 12 pods, 1 kill, 4 of 6 great glints, one lamp), finds 77
  (+2 bonus), spends 44 and ends with 35. 12 each stands. At 16 the first lantern needs a second trip (the pilot
  still finishes); at 11 or less the glints in sight of the first lantern pay for it.
- Each light is roughly paid for by what hangs on its own approach: the spawn line and pod-stone (13) for
  the first, the leap's line and pod-rise (10) for lamp-trunk, 20 up the shaft to the crown, the sky line
  (6 + the great one) on the glide to the far one.

## Wayside lamps: the sink for leftover glints (sim built 2026-10-14, NOT DRAWN YET)
`scene.lamps: [{id, x, y, cost?}]`, `state.goal.lamps` (the same `LanternState` records), `goal.lampsLit`,
`goal.restLamp`. A lamp is a lesser lantern: the same `updateLights` loop in `goal.ts` with a flag. Same
rules (stand 30 frames, lit for good, rest point, re-form point, sanctuary for burrbacks and lampwings,
calm on kindling, nothing hurts her while she kindles it, refuse / cancel / notice), cost 8
(`goal.lampCost`), and **it never counts for the heart** (`goal.lit`, `lanternKindle.total`, the HUD
pips stay "of 3"). Its own events so the three-lantern render is untouched: `lampNotice`, `lampRefuse`,
`lampChannel`, `lampCancel`, `lampKindle {cost, wallet, lit, total}` (of LAMPS), `lampRest`; her pose flag is
`player.kindlingLamp` (index into `scene.lamps`; `kindling` stays -1). Re-form: the last light she
stood at wins; `restAt` is -1 while that is a lamp (`restLamp` >= 0). The ending summary carries
`lamps` / `lampsTotal`. Validated like lanterns (`LAMP_CLEAR` 160 px from any other light on its
ground). `?nopickups` drops them (main.ts). Debug: `__game.lamps()`, `goal().lamps {lit, total}`,
`goal().restAt` may be a lamp's id; the hitbox overlay draws them thin green (gold once lit, with the
same sanctuary line and circle). Tests: `tests/unit/lamps.test.ts`.

| id | foot x, y | why there |
|---|---|---|
| `lamp-trunk` | 3160, 1280 | in the well at trunk A's foot, by the doorway into the shaft. Every glide off the bluff ends sliding down trunk A's bark onto it (below); a walker drops into the well beside it. The leap's four glints and pod-rise (6) pay for it. A rest and re-form point before the climb. |
| `lamp-root` | 4566, 1280 | at the foot of the right rise's 192 px step, on burr-root's ground. A first-timer who runs into the step stands pressed against it, which is standing AT the lamp: with 8 it starts to catch under her (kindled after 0.5 s if she does not jump first), with less it tells her. **The one place safe ground is seen working with a burrback**: dormant, burr-root walks right through it (4160-4608); lit, it turns 110 px short for good (4160-4456). |

Why not at the first lantern, as asked: the lantern's ground is the spawn ground. A burrback that reaches
the stone's light has to walk through the spawn point (tried: home 760; it knocked an idle player off
the spawn inside a minute, and two older rules pinned by tests say no burrback on the pool's left side
or near the spawn). The far ledge and the summit are landings. A lamp on a creature's own patch is the
honest case. Lampwings: `lamp-glide-2` at the far lantern, as before.

Rejected: dearer lanterns (being short at the summit means a climb down and back), paying for the
rest (a tax), anything with a menu. A lamp on the terrace (2700): every way off the bluff lands on it.

## The lantern notices her (`lanternNotice`, 2026-10-14)
Playtest 2: a player who never stands still at a lantern never learns what it is. Now a dormant lantern
(or lamp) fires `lanternNotice {id, x, y, have, need}` once per approach, the step her body centre comes
within 260 px (`goal.noticePx`) of the centre of its trigger box (a circle: passing 400 px under the
summit lantern says nothing), however fast she passes; again only after she has been 420 px away
(`noticeLeavePx`; `LanternState.noticed`). Nothing else happens in the sim. In the grove the stone's fires
68 px into her first run (frame ~8), with `have` 0-3. It needs a picture: the lantern stirring, the price
by the count, her head turning.

**The first lantern is paid for on the spot**: `pod-stone` (hp 3, worth 10; it was pod-path-2 east of
the pool) sits at 1500, 52 px past the lantern's foot at the pool's lip. "Cut what is in the way" stops
her exactly at the lantern (cutting from 54 px out to the end of her reach she is inside its trigger;
nearer and she ends up standing in the pod, past it). Standing there with 4 she is refused (frame ~54:
the price is shown), the pod bursts (~82), its ten glints land and the channel runs by itself: lit at
frame ~145, 2.4 s after her first step (live, real keys). The spawn line (3) + the pod (10) = 13.
Decision on "one short": kept for the player who does NOT cut (spawn line + pool arc + shallows = 11, now
with the notice to tell her what the 12 is for); gone for the one who does. Being short only teaches if
the lantern is noticed, and paying on the spot teaches the same price in one beat instead of a return trip.

## The full-run pilot (`goal-pilot.test.ts`)
Closed-loop legs (walk until there, cut until open, wait until clear), real inputs from the spawn, as a
first-timer who cuts what is in the way: the spawn line -> pod-stone at the moth-stone (noticed, then
kindled where she stands, frame 149) -> leap the pool -> burr-path -> the branch -> the bluff, pod-rise ->
the leap (a hop with jump held, off the east lip still holding: glide, trunk A's bark, the well) ->
lamp-trunk kindled -> under trunk A, the shaft floor, under trunk B (great glint) -> wall-jump shaft ->
trunk A -> summit, kindle -> jump, double jump, glide right along the sky line, wings closed over
lantern-far -> kindle, heart wakes -> down to the rise -> the heart. `gather` at frame 1061 (17.7 s),
`endHold` at 1301; 0 hits, 1 kill, 77 found + 2 bonus (35 left), tally 2 of 12 pods, 4 of 6 great glints,
1 of 2 lamps. If the glide fails it takes the right route on foot. It also finishes with a slower run, a
75-frame channel, lanterns at 16 (then it goes for the pool's glints first), faster burrbacks.
`GOAL_TRACE=1 npx vitest run tests/unit/goal-pilot.test.ts --disable-console-intercept` prints the legs.
`layout-pilot.test.ts` flies the set pieces on their own (the bluff, the way home, the leap, the hollow,
F7's jump, the shaft entry, the summit landing, the naive players, burr-root at lamp-root).

## What render gets
State: `state.goal` (`GoalState`, exported from `src/sim/index.ts`; `SimView.goal`). Boxes: `lanternBox(l, tuning.goal)`,
`heartBox(heart, tuning.goal)`, `lanternCost(l, tuning.goal)`.
- **Lanterns** `goal.lanterns[i]` for `scene.lanterns[i]` `{id, x, y}` (foot): `lit`, `litFrame` (sim
  frame it caught, -1 dormant: glow-up from `sim.frame - litFrame`; a state jump just shows it lit),
  `channel` (0 = idle, 1..29 of `goal.channelFrames` while she kindles it), `rest` (0..44 of
  `restFrames` while she stands at it hurt), `short` (0..11: frames she has stood at it without the
  light for it; the refusal fires at 12), `refused`. `goal.lit` = how many; `goal.restAt` = index
  of her re-form point (-1). `player.kindling` = index she is kindling this frame (-1): her pose.
  Events (`x, y` = the lantern's foot): `lanternNotice {id, have, need}` (once per approach, 260 px out:
  above), `lanternRefuse {id, have, need, show}` (only after 12 frames
  of standing there; `show` = 150 frames the price is worth showing); `lanternChannel {id, frames,
  of}` every channel frame but the last; `lanternCancel {id, frames, reason: leave|hurt|attack}`;
  `lanternKindle {id, cost, wallet, lit, total}`; `lanternRest {id, hp, hpMax, healed}`.
- **Wallet HUD**: `pickups.count` now goes DOWN on a kindle (the HUD reads it: `hud/index.ts`).
  `lanternKindle.cost` glints leave at once in the sim, `wallet` is the count after; draw the drain
  (her chest to the lantern's foot) from the event. `pickup.total` is the wallet at that moment.
  `pickups.spent` for a "lanterns paid" read; `lanternRefuse.have / need` for a shake of the count.
- **Wayside lamps** (not drawn yet): `scene.lamps[i] {id, x, y}` with `goal.lamps[i]` (the lantern record),
  `goal.lampsLit`, `goal.restLamp`, `player.kindlingLamp`, `lampCost(l, tuning.goal)`, and the `lamp...`
  events (same fields as the lantern ones). They need their own smaller look (five identical lanterns
  would read as "five to light"), no HUD pip, the same safe-ground breath once lit.
- **Heart** `scene.heart {x, y}`; `goal.heart {awake, frames (since it woke), hinted}`. Events
  `heartSleep {x, y, lit, total}` (once, first touch while asleep), `heartWake {x, y}` (same step as
  the third `lanternKindle`, wherever she is: usually far away, so the camera / a light on the
  horizon has to carry it).
- **Sanctuary** (for a lasting change round a lit lantern): `tuning.goal.sanctuaryPx` (110, along
  its ground: burrbacks) and `lampSanctuaryPx` (160, a circle round the centre of its box:
  lampwings); `enemyTurn` cause `lantern`, `enemyGiveUp` cause `calm` at its edge; `enemy.calm` > 0
  = calmed (harmless) for that many frames.
- **Dropped glints** (a fade's cost): `pickups.drops [{id, x, y (centre), value, left, timer}]`,
  `pickups.lost`; events `glintsDrop {id, x, y, value, wallet}` (same step as `reform`, just before
  it), `dropWake {id, x, y, value, frames, stagger}`, then `pickup {id: 'drop-<id>', drop: true,
  value: 1, x, y (the cluster), px, py}` one per glint: pickups.md.
- **Ending**: `gather {x, y (heart), px, py (her feet), glints, time, lanterns, kills, hits, frames:
  240, bonus, glintsTotal, pods, podsTotal, greats, greatsTotal, enemiesTotal, deaths}` (all of it also in
  `goal.ending`); then `goal.gathered`, `goal.ending {frames 0..240, glints, time, kills, hits}` (the summary
  stays in the state); she walks to the heart's centre in the first ~10 frames (`motion` run, then
  idle); `endHold {x, y}` and `goal.ended` at 240. Enemy events during it: `enemyGiveUp` cause `calm`.
- Render-only idea from the design: a lit lantern slowly wakes the dormant glints near it (the sim
  does nothing for it: glints are dormant / awake only in the pickup renderer).
- `?nopickups` removes the lanterns and the heart too (clean plates; main.ts).
