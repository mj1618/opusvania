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
  happen by accident). Broken by leaving / jumping (`leave`), a hit (`hurt`), a slash (`attack`): the
  count starts over, nothing was spent. A slash blocks it until `slashEnd` (14-20 frames).
- **Cost** 12 each (`goal.cost`, or `cost` on the lantern), 36 in all. It comes out of the wallet:
  `pickups.count -= cost`, `pickups.spent += cost`. `count + spent` = everything gathered;
  `pickups.taken` is still the number of scene pickups collected.
- **Refuse**: at a dormant lantern with too little: `lanternRefuse {have, need}` once, and not again
  until she has been more than 160 px away sideways (`refuseLeavePx`): a hop on the spot is the same
  visit. If glints land while she stands there the channel just starts.
- **Lit** until the restart (`R`, `__game.load()`); a fade / re-form and a teleport keep it.
- **Rest point**: standing at a lit lantern while hurt for 45 frames (`restFrames`) makes her whole
  (`lanternRest`), free. 45 > 30 so resting is a longer breath than kindling, and kindling hurt gives
  the rest 45 frames later without moving. Not instant, so it is no shield in a fight.
- **Re-form point**: `goal.restAt` = the lit lantern she last stood at (kindling sets it). A fade then
  re-forms her at its foot instead of the last safe ground, **whatever lives next to it** (safe ground
  falls back to the spawn near a creature's home; a lantern never does: she has 90 frames of safety
  and it is the promise the lantern makes). No lantern lit: safe ground as before.
- **Calm**: kindling settles every living creature within 900 px (`calmPx`: about half a screen, so
  everything in the picture; its body or its home) for 120 frames: a burrback stands (`pause`), a
  lampwing that has noticed her gives up (`enemyGiveUp` cause `calm`: rests 60, flies home, notices
  nothing on the way). Staggered and dead ones are left alone. Enough to rest there undisturbed.
  In the grove: the stone reaches burr-path, lamp-glade, lamp-f3; the crown burr-ledge and
  lamp-glide-1; the far one burr-far and lamp-glide-2. (At 600 px only burr-far was ever touched.)
- **The heart** (`scene.heart`, trigger 96 x 96 standing on its point). Asleep: her box touching it
  fires `heartSleep` once per run, nothing else. It wakes in the step the last lantern is kindled
  (`heartWake`, right after that `lanternKindle`). Awake: **standing** in it (grounded, in control)
  ends the run: `gather` with the summary; gliding through does not.
- **The ending**: from `gather` no input reaches her and nothing can hurt her (contact is off).
  She walks on to within 12 px of the heart's centre and stops (`heartWalkPx`; so the ending always
  finds her in the same place), every creature in the scene is calmed for the hold, lampwings take
  no more notice. 240 frames later (`holdFrames`, 4 s: room for a slow swell and a fade) `endHold`,
  `goal.ended = true`, and she stays held until the restart. `goal.endedControl = true` gives control
  back after the hold instead (still unhurtable) if a free walk in the lit grove is wanted.
- `run.start` = frame of her first input; `run.hits` counts `hurt` events. Summary: `glints` =
  `count + spent`, `time` = frames since the first input, `kills` = dead enemies, `hits`.
- A scene without `lanterns` / `heart` has no goal: nothing fires. Lanterns without a heart can be lit.
- State version 12. Existing play is untouched when the lanterns are ignored (tested: the grove with
  and without them plays identically).

## Where they are, and why
| id | foot x, y | how she gets there |
|---|---|---|
| `lantern-stone` | 1448, 1280 | at the foot of the carved moth-stone, 328 px right of the spawn, on the spawn ground: plain walking. She meets it in the first seconds carrying 3 glints and is refused: that is the tutorial. The spawn line, pool arc and shallows hold 11: one short on purpose, so she has to look a little further (a pod, the bank). |
| `lantern-crown` | 3684, 192 | on trunk B's top, the highest point: the wall-jump shaft (or the left route), then jump + double jump from trunk A. No enemy near: a pure movement test. The shaft, crown and the two great glints on the way pay for it (19). It is also where the summit glide starts, so a failed glide re-forms her at the take-off. |
| `lantern-far` | 5524, 448 | on the far ledge, which is the whole patrol of `burr-far`: the guarded one. Reached by the right route (root, branch, F6, F7) or from the summit (glide + a cut or pogo on the two lampwings; the glide alone arrives 52 px under F7's top: a wall kick off its side gets up). Kill the burrback, or go while its back is turned (it is away ~180 frames per round; she needs 30). |
| heart | 5212, 1088 | at the shrine on the right rise. With the camera at its right stop the mid layer's hollow tree (layer x 4600, parallax 0.68) stands at playfield x ~5214, so the glowing hollow is straight behind it. From the far ledge: off the left end, off F7, a short walk. |

- One per third of the scene (cool / warm / deep), none within 300 px of the spawn (validated).
- The cocoons under the great bough have no lantern (nothing to stand on under them; the ledge above
  already has a burrback, a lampwing and the big pod).
- `great-crown` (3648, 134) shares trunk B's 128 px top with `lantern-crown`: the bud is 36 px left of
  the lantern's foot. If they crowd each other when drawn, move the great glint, not the lantern.

## Economy (audit, default tuning)
| source | glints |
|---|---|
| world: 52 glints + 5 great x 5 | 77 |
| 12 pods | 62 |
| 6 burrbacks (4, 6 by finisher) + 5 lampwings (3, 5) | 39 to 61 |
| all | 178 to 200 |

- 36 is 18-20% of everything and 47% of the world glints: a player who never opens a pod or kills
  anything can pay for all three with 41 to spare.
- The pilot, which goes straight for the goal (3 of 12 pods, 3 kills, 30 of 57 pickups), gathers 79
  and ends with 43: the lanterns take 46% of a brisk run, less of a curious one. 12 each stands. At
  16 the first lantern needs a second trip (the pilot still finishes); at 11 or less the glints in
  sight of the first lantern pay for it and she never has to look further.
- Each lantern is roughly paid for by what hangs on its own approach: 11 low glints by the first (one
  short), 19 up the shaft to the crown, 14 on the right route (root 3, F6 3, far 3, the great one 5).

## The full-run pilot (`goal-pilot.test.ts`)
Closed-loop legs (walk until there, cut until open, wait until clear), real inputs from the spawn:
pod-path-1 -> spawn line -> lantern-stone (refused, 8-9 of 12) -> the pool -> back, kindle -> leap
the pool -> burr-path, pod-path-2 -> mid rise, burr-rise, pod-rise -> great glint under trunk B ->
wall-jump shaft -> trunk A -> summit, kindle -> jump, double jump, glide right, a cut through
lamp-glide-1, wall kick off F7's side onto F7 -> wait for burr-far to walk off -> far ledge, kindle,
heart wakes -> down to the rise -> the heart. `gather` at frame 1107 (18.5 s), `endHold` at 1347;
0 hits. It also finishes with a slower run, a 75-frame channel, lanterns at 16, faster burrbacks.
`GOAL_TRACE=1 npx vitest run tests/unit/goal-pilot.test.ts --disable-console-intercept` prints the legs.

## What render gets
State: `state.goal` (`GoalState`, exported from `src/sim/index.ts`; `SimView.goal`). Boxes: `lanternBox(l, tuning.goal)`,
`heartBox(heart, tuning.goal)`, `lanternCost(l, tuning.goal)`.
- **Lanterns** `goal.lanterns[i]` for `scene.lanterns[i]` `{id, x, y}` (foot): `lit`, `litFrame` (sim
  frame it caught, -1 dormant: glow-up from `sim.frame - litFrame`; a state jump just shows it lit),
  `channel` (0 = idle, 1..29 of `goal.channelFrames` while she kindles it), `rest` (0..44 of
  `restFrames` while she stands at it hurt), `refused`. `goal.lit` = how many; `goal.restAt` = index
  of her re-form point (-1). `player.kindling` = index she is kindling this frame (-1): her pose.
  Events (`x, y` = the lantern's foot): `lanternRefuse {id, have, need}`; `lanternChannel {id, frames,
  of}` every channel frame but the last; `lanternCancel {id, frames, reason: leave|hurt|attack}`;
  `lanternKindle {id, cost, wallet, lit, total}`; `lanternRest {id, hp, hpMax, healed}`.
- **Wallet HUD**: `pickups.count` now goes DOWN on a kindle (the HUD reads it: `hud/index.ts`).
  `lanternKindle.cost` glints leave at once in the sim, `wallet` is the count after; draw the drain
  (her chest to the lantern's foot) from the event. `pickup.total` is the wallet at that moment.
  `pickups.spent` for a "lanterns paid" read; `lanternRefuse.have / need` for a shake of the count.
- **Heart** `scene.heart {x, y}`; `goal.heart {awake, frames (since it woke), hinted}`. Events
  `heartSleep {x, y, lit, total}` (once, first touch while asleep), `heartWake {x, y}` (same step as
  the third `lanternKindle`, wherever she is: usually far away, so the camera / a light on the
  horizon has to carry it).
- **Ending**: `gather {x, y (heart), px, py (her feet), glints, time, lanterns, kills, hits, frames:
  240}`; then `goal.gathered`, `goal.ending {frames 0..240, glints, time, kills, hits}` (the summary
  stays in the state); she walks to the heart's centre in the first ~10 frames (`motion` run, then
  idle); `endHold {x, y}` and `goal.ended` at 240. Enemy events during it: `enemyGiveUp` cause `calm`.
- Render-only idea from the design: a lit lantern slowly wakes the dormant glints near it (the sim
  does nothing for it: glints are dormant / awake only in the pickup renderer).
- `?nopickups` removes the lanterns and the heart too (clean plates; main.ts).
