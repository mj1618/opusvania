# The goal: three moth-lanterns and the heart of the grove

A moth is drawn to light; the grove's light has gone out. She gathers glints, kindles three dormant
lanterns with them, the hollow tree wakes, she walks into it. No text anywhere in the sim.

Sim: `src/sim/goal.ts` (`updateGoal`, last thing in `step`), numbers in `tuning.goal`, scene data
`lanterns: [{id, x, y, cost?}]` and `heart: {x, y}` (both a feet-centre point on solid ground, like
the spawn). Tests: `tests/unit/goal.test.ts` (rules), `tests/unit/goal-pilot.test.ts` (one whole run
with real inputs + the economy audit). Drawn by `src/render/goal/` (goal-render.md).

## Playtest 5 (2026-10-14): the ember, the wake that is waited for, what the offering wakes
- **The summit's lantern wants the ember** (`lanterns[i].key: '<pickup id>'`, a great glint of the scene;
  `lantern-crown` -> `great-ember` at 1500, 650: on F3, straight over the first lantern, in the picture when
  she kindles that one). Until she has gathered it the lantern does not catch whatever she carries: no
  channel, no pledge; `lanternNotice` and `lanternRefuse` carry `key {id, x, y}` (the refusal fires after 12
  still frames even with the price in hand); `lanternKey {id, key, kx, ky}` the step the ember reaches her;
  `LanternState.keyed`. **Why a key and not a dearer lantern**: a price does not say where to go (and "dearer
  lanterns" was rejected in playtest 3); a thing she has seen hanging says exactly where. It puts F1-F3 (or
  the high route F5-F4-F3), lamp-glade and lamp-f3's dive on the critical path, and makes the summit a place
  she comes to twice. One who never stops at a light is told by the notice as she passes (the pilot's
  `stand: false` reads that). The ember is an ordinary great glint (5) to the wallet and the tally.
- **The wake has a length** (`goal.heartWakeFrames` 180): standing in the woken heart ends the run only once
  it has been awake 3 s. Sooner, she stands in the waking light **in control** (`heartWait {frames}` once,
  `heart.waited`); `heartReady {waited}` and `heart.ready` when it has played; `gather` on that step or the
  next. Her input is never taken for it. **Awake, the heart keeps every creature within 600 px calm**
  (`heartCalmPx`: wing-rise dived at her while she waited).
- **What the offering wakes**: as each tier is passed during the hold, `groveWake {tier, part, given, frame}`
  and `goal.grove.{flowers | paths | canopy}`: tier 1 (25) the shrine's flowers, tier 2 (50) the glow plants
  along the three lanterns' paths, tier 3 (100) the lights of the whole canopy. Same step as `heartTier`.
  `gather` / `goal.ending` also carry `offerNext` (glints short of the next tier, 0 at the top) beside
  `offered` and `offerTier`. The sim does nothing else with it.
- **Runs now** (robots that never hesitate; `NAIVE_TRACE=1`): tapper 50-54 s, 7-10 hits, **1-3 fades**, re-forms
  at the lamps she bought (it was 19-20 s, 1 hit); holder 53 s; **careful first-timer** (18-frame reaction,
  reads the brace, hops, cuts it winded, steps out of dives, rests at her lights) **58 s, 1-2 hits, 0 fades**,
  121 found, 73 offered (tier 2); the goal-directed pilot 33.6 s. Playtest 5's own human-ish bots were
  3x the robots, so a careful person is about 2.5-3 min, not yet the 3-5 asked for.
- Economy: world 101 (the ember), pods 62, creatures 45 (a seventh lampwing): `glintsTotal` 208.

## Playtest 6, round 2: she re-forms at the light nearest to where she fell
- **`restPoint`** (goal.ts) = the nearest (straight line, from where her body lies to the light's foot) of:
  every lit lantern, every lit lamp, and every wayside lamp she has **passed** (`LanternState.passed`: set by its
  first `lanternNotice` / `lampNotice` of the run, never cleared), **dark or lit**; a dark one only while no
  living creature's home is within the safe-ground clearance of it (`health.safeEnemyPx`, a lampwing's
  territory + sight: `homeClear`). On a tie a lit one. None: the last safe ground, as before. Re-forming at a lit
  light makes it `restAt` / `restLamp` and holds its rest (`restHold`, as before); at a dark lamp nothing is held.
- Why: playtest 6's masher (0 lamps bought) re-formed at the first lantern for each of her first four fades,
  4.3 s from the shaft, three times over the same ground. Now every shaft fade re-forms at lamp-trunk by the
  doorway (220 px: back in the fight ~1 s after the re-form; the no-lamps tapper: fade 12.1 s, re-form 13.0,
  braced at again 14.1; it was fade 11.7, braced again 17.0). Fades on burr-ledge re-form at lamp-trunk too
  (lamp-high is 174 px from burr-ledge's home: not while it lives); fades at burr-rise at lamp-rise; a fade at
  burr-path with the ember in hand at lantern-stone (the nearer), not at lamp-trunk.
- Debug: `__game.goal().reformAt` (where she would re-form now), `lanterns()` / `lamps()` `.passed`. Tests:
  `lamps.test.ts` (dark passed lamp wins; never passed or a creature by it does not), `goal.test.ts`,
  `naive-pilot.test.ts` (every re-form is at a light; shaft fades at lamp-trunk).

## Playtest 6 (2026-10-14): the ember is taken in safety; a lamp's light is hers, not the fight's
- **Taking the key** (the ember's 54-frame flight, `pickups.greatFrames`): from the step it wakes until 60
  frames after `lanternKey`, every living creature within 600 px of her (body or home) is calmed, exactly as
  by a kindling (`goal.keyCalmPx`, `keyCalmFrames`; `calmEnemies` each step from the lantern's block in
  `goal.ts`). lamp-f3 hit her in the take in two of three staged captures; now a dive in flight gives up
  (`enemyGiveUp` cause `calm`), and a calmed lampwing notices nothing. No state field: it reads the key
  pickup's timer. Tests: `playtest6.test.ts`.
- **A wayside lamp's sanctuary is its standing spot, and only while she stands in it** (`sanctuary.ts`):
  with her box in the lit lamp's trigger box, burrbacks on its ground keep 64 px from its foot
  (`goal.waysidePx`: her box at the lamp reaches 63) and one inside is harmless and does not brace, a ram
  ends there (`lantern`); lampwings are harmless and give up within 90 px of its centre (`waysideWingPx`), and
  one whose tell ends while she is at it gives up. **With her anywhere else a lit lamp is as dark to the
  creatures**: they walk, ram and brace through its light. Lanterns keep 110 / 160, always. Why: a lamp beside
  a fight made it one beat (enemies.md). Render still draws a lamp's safe ground at `sanctuaryPx` (110).
- `lamp-rise` 4760 (was 4860), `lamp-root` 4350 (was 4566, at the wall), `great-crown` 3768, 134 (was 3648:
  the bud is on the bough east of the lantern now, the socket mark has trunk B's top to itself).
  scene-and-units.md has the table.

## Rules
- **At a lantern** = grounded, mode `normal`, feet on its base line, her box overlapping its trigger
  box (48 x 64, centred on its foot), in control (not staggered, not faded). Flying or running through
  it is not "at" (a run crosses the box in 9 frames).
- **Kindling**: at a dormant lantern with `count >= cost` and no slash out, the channel STARTS;
  the 30th frame (`channelFrames`) kindles it. No button.
  **Once started it runs on while she stays on its leash** (playtest 4: a tapper who never stood still
  lit 0 lanterns in two minutes with 86 glints; every channel broke 9-10 frames in): within 260 px
  sideways of its foot and 330 px up or down of the middle of its box (`kindleLeashPx`,
  `kindleLeashUpPx`), in control, moving or not, jumping, cutting. Only leaving the leash (`lanternCancel`
  reason `leave`) or a hurt (`hurt`) starts it over; `attack` is no longer sent. A slash still cannot
  START one (14-20 frames). 260, not the 220 first asked for: a run straight through at full speed stays
  on a 260 leash for 31 frames, so **a lantern she runs past with its price catches behind her**
  (`lanternKindle {away: true}`, as a pledge does); at 220 it broke on frame 27. The lanterns are the
  goal: nothing is lost by it. **Nothing can hurt her while she kindles**, which means while she is AT
  it (`player.kindling >= 0`: in its box, on the ground): a creature that touches her is turned away as
  if it had hit, she is not hurt, the channel goes on. Out of the box on the leash she has no such
  cover and no pose (`kindling` is -1 while `lanterns[i].channel` still counts).
- **A wayside lamp wants intent** (`goal.lampStillFrames` 20; playtest 4: lamp-high caught as she topped
  out of the well, lamp-root while she chased burr-root: 8 glints each without a choice). Its channel
  starts only once she has **stood still at it for 20 frames**: in its box, no direction held (pressed
  against the rise holding right is not standing), not cutting. `LanternState.still` counts them (lanterns
  count too, unused). Then the same 30-frame channel and leash: 50 frames in all. A pledge needs the
  same 20 frames at a lamp. The refusal (too little) is as before: 12 frames with `|vx| < 0.5`.
- **Pledge** (playtest 3: "the first kindle can be missed by a second": she cut the pod at the first lantern,
  ran on, its glints caught her up 400 px later and the lantern stayed dark). Standing at a dormant light
  short, with the rest **already on its way to her** (`pods.left` + enemies' `spill` >= what she lacks), sets
  `LanternState.pledged`. From then on it catches the step her wallet reaches the cost, **wherever she is**:
  `lanternKindle {pledged: true, away: true|false}`, no full channel. While she stays, the channel shows
  from that step on (`lanternChannel`, `player.kindling`, capped one short of the end; a slash does not
  break a pledge) and it catches as the price lands: at pod-stone 34 frames after the burst (it was ~63:
  the slash's recovery, then 30 frames). If she walks off first: `lanternCancel` (leave), then the kindle
  from afar. A pledge ends unpaid only if what is coming stops covering it (she spent it elsewhere, or
  faded). The wallet never goes negative: nothing is spent before it has landed. Why not just faster pod
  glints: the wait was the slash recovery + the channel, not the flight. Why not "any time near it": she
  has to have stood AT it, which a run through the box (9 frames) with glints in the air also is; that
  kindles a lantern she ran through while a pod she had just cut paid out, which costs her nothing she
  could use elsewhere.
- **Cost** 12 each (`goal.cost`, or `cost` on the lantern), 36 in all. It comes out of the wallet:
  `pickups.count -= cost`, `pickups.spent += cost`. `count + spent + lost + offered` = everything gathered
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
- **A re-form is not a rest** (`goal.restHold`, playtest 3: "a fade has no sting": she re-formed on the light
  and its rest healed her 1.8 s later without a step). The light she re-forms at does not count her rest
  until she has stood, in control and on the ground, outside its trigger box; then coming back is a rest as
  ever. A hop on the spot is not leaving. Another light, or kindling one, clears it. So after a fade she
  walks at 2 lights at least out of the box and back (45 px and 45 frames), or on to the next light.
  `__game.goal().restHold`. Render: the lantern should not show its "resting" breath while it holds.
- **Re-form point** (since playtest 6 round 2 the nearest light, not the last stood at: section above): `goal.restAt` = the
  lit lantern she last stood at (kindling, standing at it or re-forming at it set it). A fade re-forms her at
  the foot of the light nearest to where she fell (with 2 of 4 lights, a third of her wallet left where she fell: enemies.md;
  the rest above is then the real heal) instead of the last safe ground, a lit one **whatever lives next to it** (safe ground
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
  (12), `greats` / `greatsTotal` (6), `kills` / `enemiesTotal` (9), `deaths`, `lamps` / `lampsTotal` (4). Leftover
  glints have the wayside lamps to go to (below).
- **The offering** (playtest 4: an explorer ended with 96 idle glints; lamps were the only sink). Standing
  in the woken heart ends the run, so the gift cannot be a second channel there: **everything she still
  carries goes into the heart during the hold**. `gather` carries `offered` (her wallet then) and
  `offerTier` (0-3: `offerTier1..3` = 25 / 50 / 100, also `offerTiers`); from 45 frames after `gather`
  (`offerDelayFrames`) the glints leave her one batch a step, spread over 140 frames (`offerSpanFrames`:
  10 glints go one every 14 frames, 96 one a frame, 300 three a frame): `heartOffer {x, y, px, py, value,
  given, of, wallet, tier}` each time, `heartTier {tier, given, need}` as a threshold is passed.
  `pickups.count` drains to 0 (`pickups.offered` takes it), `goal.offer {total, given, tier}` follows it,
  `goal.ending.offered / offerTier` are fixed at the gather. A hold too short gives the rest with `endHold`.
  The choice is upstream: a lamp (8, a rest point now) or the heart (a tier at the end). In the grove
  200 exist; after the 36: 164 at most, 132 with all four lamps. The naive players offer 4-42 (tier 0-1),
  the full-run pilot 34 (tier 1), playtest 4's explorer would have given 96 (tier 2); 100 asks for nearly
  everything. The sim does nothing with the tier: it is for the render (more of the grove waking).
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
- State version 18 (playtest 5: `keyed`, `heart.ready / waited`, `goal.grove`, `ending.offerNext`, the creatures' new fields). Was 17 (playtest 4: `LanternState.still`, `goal.offer`, `ending.offered / offerTier`,
  `pickups.offered`, the burrback's `braced / strikeCd / chargeLeft`). Existing play is untouched when the lanterns are ignored (tested: the grove with
  and without them plays identically).

## Where they are, and why
| id | foot x, y | how she gets there |
|---|---|---|
| `lantern-stone` | 1448, 1280 | at the foot of the carved moth-stone, 328 px right of the spawn, on the spawn ground: plain walking. It notices her in her first steps (3 of 12); `pod-stone` at its foot stops her there and pays the rest (below: "The lantern notices her"). Without the pod the spawn line, pool arc and shallows hold 11: one short. |
| `lantern-crown` | 3684, 192 | on trunk B's top, the highest point. **Since playtest 3 trunk B stands on the floor and closes it: the floor path ends at its bark and the only way on is up it** (hold right, press when blocked: 4-5 kicks to the top, any hand), so this lantern is the next thing a naive player meets. Also: the wall-jump shaft (or the left route), then jump + double jump from trunk A (the top runs on east as a 192 px bough with a catch branch under it: scene-and-units.md). No enemy near: a pure movement test. The shaft, crown and the two great glints on the way pay for it (19). It is also where the summit glide starts, so a failed glide re-forms her at the take-off. |
| `lantern-far` | 5524, **768** (the bluff's top came down 320 px after playtest 4: below) | on the top of the **far bluff** (the old far ledge, solid down to the rise since playtest 3: both naive runs saw it from below "with no way up that reads" and kicked the east wall for 20 s). Its west face stands 260 px past the heart: hold right, press when blocked, 2-3 kicks. From the top the woken heart is a walk off the west lip. Also at the end the **summit glide** arrives over: the elegant approach. From the crown lantern: jump, double jump (the canopy is 420 px over the scene's top now, so both fit: feet reach y -277), hold: the glide passes 470 px over the first lampwing (unnoticed), 200 px over the second, and crosses the ledge's lip 160 px up; close the wings and she drops by the lantern. Held to the end she sails on to the scene's wall and slides down onto the ledge's far end. Fallback on foot: root, branch, F6, F7, a hop. **No creature walks the far ledge any more** (burr-far is gone: a full held running jump from F7 lands at 5670-5740 and the glide held to the end comes down at the wall, so no patrol on a 288 px ledge was fair; `layout-pilot.test.ts` runs the jump at 60 start times). Its guard is `lamp-glide-2`, whose home (4900, 250) is 646 px from the lantern: it looks up as the summit glide passes 200 px over it, follows, and gives up at the lit lantern's edge, which is the one place the lampwing sanctuary is seen in play. It does not notice her on F6 or F7. |
| heart | 5212, 1088 | at the shrine on the right rise: a walker from the summit (bough, catch branch, right branch, the rise) passes it asleep with 2 of 3, 260 px before the far bluff. With the camera at its right stop the mid layer's hollow tree (layer x 4600, parallax 0.68) stands at playfield x ~5214, so the glowing hollow is straight behind it. From the far ledge: off the left end, off F7, a short walk. |

- **The far lantern and the heart are one picture** (playtest 4: at 448 the heart was 640 px below her,
  off the bottom of the frame, and its wake was a column of light from under the picture). The far
  bluff's top is at **768** now: the heart is 320 px below the lantern and 312 px west of it; standing at
  the lantern the follow camera (view centre y 530, bottom edge 1070) shows the shrine stone and the
  heart's box at the bottom of the frame; its ground line (1088) is 18 px under the edge, which the
  wake's lean has to cover (wide stop 7 with `--hitboxes --pickups`). Chosen over a shrine on the bluff's
  shoulder (the mid layer's hollow tree is painted behind x 5212) and over 736 (the heart's ground was
  48 px under the frame). The face is 320 px, the same as the first bluff's: more than a jump (272), so
  still "jump at it, press again": 1-2 kicks, any hand (`critical-path.test.ts`). The summit glide clears
  its lip by 480 px and lands on it as before; F7 (592) is 176 px over it now.
- One per third of the scene (cool / warm / deep), none within 300 px of the spawn (validated).
- The cocoons under the great bough have no lantern (nothing to stand on under them; the ledge above
  already has a burrback, a lampwing and the big pod).
- `great-crown` is at (3768, 134) since playtest 6: over the summit bough, 84 px east of the lantern's foot
  (it shared trunk B's top with the lantern and the ember's socket mark). Standing at the lantern does not
  wake it; a few steps east does.

## Economy (audit, default tuning)
| source | glints |
|---|---|
| world: 66 glints + 6 great x 5 | 96 |
| 12 pods | 62 |
| 6 burrbacks (4, 6 by finisher) + 6 lampwings (3, 5) | 42 (+ up to 24 bonus) |
| all (`glintsTotal`) | 200 |

- 36 is 19% of everything and 38% of the world glints: a player who never opens a pod or kills
  anything can pay for all three with 60 to spare. With all four lamps: 68 (36%).
- The pilot, which goes straight for the goal (3 of 12 pods, 1 kill, 4 of 6 great glints, two lamps), finds 85
  (+2 bonus), spends 52 and ends with 35.
- **The naive players** (`naive-pilot.test.ts`, the critical path only): cutting what is in the way and buying
  the two lamps they walk into (`lamp-high` or `lamp-trunk`, `lamp-rise`), the tapper finds 66, spends 52,
  ends with 16; the holder 58-61 found, 9-13 left. Cutting only the first pod and buying both lamps: 51 found
  (+2 bonus), 52 spent: the far lantern refuses her at 8 of 12 and `great-far` beside it pays (ends with 1).
  No lamps, one pod: 49-51 found, 13-17 left. So the path now spends 70-100% of what it yields; a thorough player
  (playtest 3: 92 found, 42 idle with two lamps) has 16 more to spend, 24 left over. 12 each stands. At 16 the first lantern needs a second trip (the pilot
  still finishes); at 11 or less the glints in sight of the first lantern pay for it.
- Each light is roughly paid for by what hangs on its own approach: the spawn line and pod-stone (13) for
  the first, the leap's line and pod-rise (10) for lamp-trunk, 20 up the shaft to the crown, the sky line
  (6 + the great one) on the glide to the far one.

## Wayside lamps: the sink for leftover glints (four since playtest 3)
`scene.lamps: [{id, x, y, cost?}]`, `state.goal.lamps` (the same `LanternState` records), `goal.lampsLit`,
`goal.restLamp`. A lamp is a lesser lantern: the same `updateLights` loop in `goal.ts` with a flag. Same
rules (stand 30 frames, lit for good, rest point, re-form point, sanctuary for burrbacks and lampwings,
calm on kindling, nothing hurts her while she kindles it, refuse / cancel / notice), cost 8
(`goal.lampCost`), and **it never counts for the heart** (`goal.lit`, `lanternKindle.total`, the HUD
pips stay "of 3"). Its own events so the three-lantern render is untouched: `lampNotice`, `lampRefuse`,
`lampChannel`, `lampCancel`, `lampKindle {cost, wallet, lit, total}` (of LAMPS), `lampRest`; her pose flag is
`player.kindlingLamp` (index into `scene.lamps`; `kindling` stays -1). Re-form: the last light she
stood at is `restAt` / `restLamp` (`restAt` is -1 while that is a lamp); she re-forms at the nearest
light (playtest 6 round 2, above), a lamp she has passed even dark. The ending summary carries
`lamps` / `lampsTotal`. Validated like lanterns (`LAMP_CLEAR` 160 px from any other light on its
ground). `?nopickups` drops them (main.ts). Debug: `__game.lamps()`, `goal().lamps {lit, total}`,
`goal().restAt` may be a lamp's id; the hitbox overlay draws them thin green (gold once lit, with the
same sanctuary line and circle). Tests: `tests/unit/lamps.test.ts`.

| id | foot x, y | why there |
|---|---|---|
| `lamp-trunk` | 3160, 1280 | in the well at trunk A's foot, by the doorway into the shaft. Every glide off the bluff ends sliding down trunk A's bark onto it (below); a walker drops into the well beside it. The leap's four glints and pod-rise (6) pay for it. A rest and re-form point before the climb. |
| `lamp-high` | 3264, 448 | on trunk A's top: where the wall-to-wall shaft climb, the bark of trunk A (out of the well) and the left route all arrive, one jump before the summit. burr-ledge keeps west of 3010 (lit or not) |
| `lamp-rise` | **4760**, 1088 | on the right rise, where the walker's stair from the summit sets her down (4770), 154 px before burr-rise's patch and out of wing-rise's sight: the rest before the last fight (it was 4860: inside the fight) |
| `lamp-root` | **4350**, 1280 | on the floor between the root and the right rise's step, 156 px before burr-root's patch at the wall (4506-4608): the rest before that fight. It was at the wall (4566), where a first-timer pressed against the step stood AT it and burr-root walked through it; burr-root paces that wall now (enemies.md) |

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

## Pods on the critical path (playtest 3: 10 of 12 unopened; "pods beside the path are opened")
Four moved onto it: `pod-shaft` (3400, on the shaft floor before trunk B; was pod-path-1 west of the
spawn), `pod-bough` (3850, on the summit bough; was pod-f2), `pod-catch` (4010, on the catch branch, hp 2;
was pod-f3), `pod-far` (5690, on the far bluff's top by `great-far`; was pod-row-3: the pogo row on the
rise is two now). The naive pilots open 5 of 12 (stone, rise, shaft / bough, row-1, row-2). Off the path
stay pod-branch-l, pod-ledge (3050 now, by its guard), pod-branch-r, pod-f6.

## The naive pilots after playtest 4 (the numbers in the next section are older)
With the rams, the leash, the lamp rule and the lowered bluff (`NAIVE_TRACE=1`): **tapper** lantern-stone
1.9 s, burr-path 2.9-4.5 (cut, it braces at 3.2, two cuts glance off, the ram hits her at 3.7, it stands
spent, cut down: 1 hit), lamp-high 10.8, lantern-crown 13.5, pod-branch-r 14.9, burr-rise 15.7-17.1 (its
ram meets her kindling lamp-rise and bounces off: no hit), heart asleep 17.9, lantern-far 19.8, `gather`
20.3 s: 72 glints, 20 offered, **1 hit**. **Holder**: glides over burr-path, crown 15.4, burr-rise
18.4-19.6 (its ram stops at the lit lamp's ground), far 23.2, `gather` 23.7 s: 65 glints, 21 offered, 0 hits.
Thirteen other hands and "skips pods / skips lamps": all finish, 0-2 hits, no fade (the test asks <= 3).
**A tapper who never stops for a light** (`stand: false`: playtest 4's) lights all three and no lamp: 18.7-18.9
s, 75 glints, 41 offered (tier 1), 2 hits. Neither walks the shaft floor (they go up trunk A's bark from the
well), so burr-shaft is the explorer's and the playtest's "the floor ends at trunk B" player's. These are
robots that react in a frame and mash perfectly; the run is still about 20 s for them.

## The naive pilots (`naive-pilot.test.ts`)
Playtest 3's two players as closed-loop pilots that only react: hold right; press jump when blocked or
sliding (the tapper 5 frames, the holder 45); cut a pod or a burrback in the way; walk up to a light that
stirred on the ground she is on and give it 2 s; go to the heart when it wakes. **Tapper**: lantern-stone
1.9 s, lamp-high 9.5, lantern-crown 12.2, lamp-rise 14.7, heart asleep (2 of 3) 15.3, lantern-far 18.3,
`gather` 19.0 s, 66 glints, 0 hits, no wings. **Holder**: 1.9 / crown 15.4 / lamp-rise 17.9 / far 23.2 /
`gather` 24.0 s, 58 glints, 0 hits, wings twice. Seven other hands (4-45 frame presses, 4-20 frame beats)
and the "skips pods / skips lamps" variants finish too. Live with real keys in real time (90 ms and 700 ms
presses through `page.keyboard`, state only read): 19.2 s and 22.1 s to `gather`, 0 hits, the same order.
A robot that reacts in a frame; a person is 3-5 times that.

## The full-run pilot (`goal-pilot.test.ts`)
Closed-loop legs (walk until there, cut until open, wait until clear), real inputs from the spawn, as a
first-timer who cuts what is in the way: the spawn line -> pod-stone at the moth-stone (noticed, then
kindled where she stands, frame 149) -> leap the pool -> burr-path -> the branch -> the bluff, pod-rise ->
the leap (a hop with jump held, off the east lip still holding: glide, trunk A's bark, the well) ->
lamp-trunk kindled -> under trunk A, the shaft floor: pod-shaft, the great glint at trunk B's foot -> wall-jump shaft ->
trunk A, lamp-high kindled -> summit, kindle -> jump, double jump, glide right along the sky line, wings closed over
lantern-far -> kindle, heart wakes -> down to the rise -> the heart. `gather` at frame 1131 (18.9 s),
`endHold` at 1371; 0 hits, 1 kill, 85 found + 2 bonus (35 left), tally 3 of 12 pods, 4 of 6 great glints,
2 of 4 lamps. The first lantern catches at frame 110 (it was 149: the pledge). If the glide fails it takes the right route on foot. It also finishes with a slower run, a
75-frame channel, lanterns at 16 (then it goes for the pool's glints first), faster burrbacks.
`GOAL_TRACE=1 npx vitest run tests/unit/goal-pilot.test.ts --disable-console-intercept` prints the legs.
`layout-pilot.test.ts` flies the set pieces on their own (the bluff, the way home, the leap, the hollow,
F7's jump, the shaft entry, the summit landing, the naive players, burr-root at lamp-root);
`critical-path.test.ts` the playtest-3 ones (tap climbs, the stair down from the summit, the far bluff, the
way back west, burr-root's arrivals, the bark of trunk A).

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
  `lanternKindle {id, cost, wallet, lit, total, pledged, away}`; `lanternRest {id, hp, hpMax, healed}`.
  **`away: true` = she is not at the lantern** (a pledge paid as the pod's glints landed, up to ~400 px on):
  the drain has to cross from wherever she is (`state.player`), and there was a `lanternCancel` (leave)
  before it. `LanternState.pledged` while it waits. `goal.restHold`: the light she re-formed at is not
  resting her yet (no rest breath; `rest` stays 0).
- **Wallet HUD**: `pickups.count` now goes DOWN on a kindle (the HUD reads it: `hud/index.ts`).
  `lanternKindle.cost` glints leave at once in the sim, `wallet` is the count after; draw the drain
  (her chest to the lantern's foot) from the event. `pickup.total` is the wallet at that moment.
  `pickups.spent` for a "lanterns paid" read; `lanternRefuse.have / need` for a shake of the count.
- **Wayside lamps** (four: `lamp-trunk`, `lamp-root`, `lamp-high` 3264, 448 on trunk A's top, `lamp-rise` 4860, 1088): `scene.lamps[i] {id, x, y}` with `goal.lamps[i]` (the lantern record),
  `goal.lampsLit`, `goal.restLamp`, `player.kindlingLamp`, `lampCost(l, tuning.goal)`, and the `lamp...`
  events (same fields as the lantern ones). They need their own smaller look (five identical lanterns
  would read as "five to light"), no HUD pip, the same safe-ground breath once lit.
- **The offering** (above): `gather.offered / offerTier / offerTiers`; during the hold `heartOffer` per
  batch (her body centre `px, py` to the heart `x, y`; `given` of `of`; `wallet` after) and `heartTier`;
  `goal.offer {total, given, tier}` for a state jump. **`pickups.count` runs down to 0 during the hold**
  (the HUD count will too). A tier is the hook for "more of the grove wakes": 25 / 50 / 100.
- **A lamp's beat of intent**: `goal.lamps[i].still` 0..20 of `tuning.goal.lampStillFrames` while she
  stands still at a dormant lamp (then `lampChannel`): room for the lamp to lean to her. `kindlingLamp`
  only while she is at it; `channel` may count on with her up to 260 px away, and `lampKindle.away` /
  `lanternKindle.away` can now be true without a pledge.
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
