# Combat: the thorn slash and lumen pods

Sim: `src/sim/player/player.ts` (`updateSlash`, `guardLunge`, `resolveSlash`), `src/sim/player/attack.ts`
(`slashBox`), `src/sim/pods.ts`; numbers in `tuning.attack` (shared), `tuning.slash1/2/3` (per combo
step) and `tuning.pods`. Enemies, contact damage and health: enemies.md. No charged slash (ruled out).
Tests: `tests/unit/combat.test.ts`, `tests/unit/pods-pilot.test.ts`.

## The slash
- **Input**: the `attack` action (bit 64): keyboard C or J, pad X / Square (dash is RB / RT), `A` in the DSL.
- **Direction**, fixed at the press: Up held = `up`; Down held *in the air* = `down` (on the ground Down
  gives a forward slash, as in Hollow Knight); otherwise `fwd`. `attackFacing` = the side she faced; a
  direction pressed on the same frame counts. On a wall slide it goes away from the wall.
- **Never locks movement**: she can run, turn, jump, glide and wall slide through it; the slash keeps
  its direction. What it adds to her motion is only the lunge, the hang and the recoil below. It does
  not end a glide (Down + attack does, because Down is the fast fall).
- **Dash**: no slash during a dash. A press during one does not age: it fires on the first frame after
  `dashEnd`. Attack + dash on the same frame = dash, then the slash. A dash ends a slash (`slashEnd`
  reason `dash`) and its lunge / hang. The combo timer keeps running through a dash.
- A press is good for 8 frames (`bufferFrames`, its own included).

## The three-step combo
| | step 1: cut | step 2: return cut | step 3: finisher |
|---|---|---|---|
| hit area live (frames from the press) | 1-6 | 1-6 | 3-10 |
| `slashEnd` at | 14 | 14 | 20 |
| next slash from (`cooldownFrames`) | 17 | 19 | 27 |
| fwd area: reach x height | 110 x 88 | 110 x 88 | 135 x 108 |
| up area: reach from centre x width | 124 x 100 | 124 x 100 | 144 x 120 |
| `power` / extra hitstop | 1 / 0 | 1 / 0 | 2 / +1 |
| knockback for targets, her own recoil | 6, 3 | 6, 3 | 11, 4 |
| lunge (px/f at the start -> px in all) | 3 -> 9 | 3 -> 9 | 5.5 -> 16 |
| air hang frames | 4 | 4 | 6 |

- A forward or up slash that starts while the chain is alive is the next step: 1 -> 2 -> 3, then 1
  again. The chain is alive for `comboWindowFrames` (14) after the previous slash's cooldown ends
  (so the next slash must start at most `cooldown + 13` frames after the last one started); a pause
  starts over at 1. Hitstop frames do not count (her clocks stand still).
- Mashing: slashes start at 0, 17, 36, 63, 80, 99, ... (steps 1 2 3 1 2 3). Blows land at 1, 18, 39:
  da, da, DUM. The whole chain is 63 frames (1.05 s) press to next chain; the finisher's hit is 0.65 s
  after the first press.
- **A down slash is always the step-1 blow** (same area and timing whatever the chain), never a
  finisher, and leaves the chain where it was (it only refreshes the window). Pogo timing must never
  change: the finisher's 3-frame wind and 27-frame recovery would break the 32-frame pogo rhythm.
- **Hit area** (`slashBox(body, dir, facing, tuning, step)`, exported from `src/sim/index.ts`; body
  40 x 80): `fwd` from `attack.fwdBack` (14) behind the body centre to the step's reach ahead, centred
  `fwdRaise` (8) above centre: a pod on the ground is in it. `up`: from the body centre up (84 / 104 px
  above the head). `down`: 100 wide, 120 down from the centre (80 below the feet), every step. Targets
  are tested every live frame after the move; each target once per slash (`attackSeq` vs `hitBy`).

## Commitment through motion (not lock-out)
- **Lunge** (`lungeX`): a forward slash that starts on the ground adds `slashN.lunge` px/f toward
  `attackFacing` on top of `vx`, fading linearly to nothing in `lungeFrames` (5): 9 px on the cuts, 16
  on the finisher, 34 over a standing chain. Holding back cancels it. `guardLunge` (just before the
  move): unless forward is held, the lunge is dropped the moment it would carry her completely off
  her footing, so it is never the reason she falls (tested from every distance to an edge, both
  sides). Holding forward keeps it: walking off is then her choice. None in the air, on an up slash,
  on a wall. Running: it adds to the run (12.6 px/f for a moment); her own `vx` is untouched.
- **Air hang** (`hang` frames): a forward or up slash that starts in the air (mode normal, not
  gliding) holds her fall: each frame the part of `vy` above `hangVy` (1.5) is halved (`hangKeep`).
  From max fall: 21.3 -> 11.4, 7.2, 5.1, 4.0, then gravity again. Once per combo step per airtime
  (`hangUsed` bits; cleared on landing and on a pogo), so a full air chain buys about 15 frames and
  further slashes buy nothing. It only ever reduces a fall: a rising slash is bit-for-bit a plain
  jump. None on the down slash.
- **Recoil** on a hit: `kickX` = the step's `recoil` px/f against a fwd slash, fading 1 per frame (6 px,
  10 on the finisher), on top of `vx`. Up, airborne: `vy += 2`. The lunge and the recoil meet: standing
  at a pod, a cut nets about zero, so she does not creep into it.
- **Hitstop**: `player.hitstop` frames = the target's (`pods.hitstopFrames` 2, `enemies.hitstopFrames`
  2) + the step's bonus: 2 / 2 / 3 on pods and on enemies (an enemy is held for the same frames). For those steps `updatePlayer` returns early: no movement, no player timers,
  `attackFrames` / `motionFrames` / `contactFrames` stand still, presses still latch. Everything else
  (frame count, pickups, pod glints) and render time keep running. Plain state: replays hash the same.
- **Pogo** (`assists.pogo`): a `down` slash that hits sets `vy = -15.5` (125 px up in 17 frames),
  refills the air dash, the double jump and the hangs, ends a wall slide. Bounce to bounce is 32 frames
  = 288 px at run speed: space pogo rows 290 px apart.
- Enemies are hit by the same areas (`slashEnemies`, before the pods; `slashHit.target.kind` is then
  the enemy's kind) and a down slash pogos off them; unlike pods they need a clear line (enemies.md).
- `impact {x, y, dir, facing, step, power, hits}`: once per blow that hits anything, on its first hit
  frame, for camera and screen effects. The sim shakes nothing.

## Lumen pods
- Scene data `pods: [{id, x, y, mount: 'sit' | 'hang', hp?: 1|2|3}]` (centre; box 44 x 44). Validated in
  `src/scene/index.ts`: unique ids (also against pickups), inside the scene, not in a solid, `sit` =
  exactly on a top (`y = top - 22`), `hang` = an underside or one-way at most 160 px above its top.
- They never collide with her. A hit takes its `power` from `state.pods.hp[i]` (1, 1, 2: a full chain
  opens a three-hit pod on the finisher). While it holds: `podHit`; at 0: `podBurst`, open until
  restart (`R`, `__game.load()`); damage and open pods survive a teleport.
- Worth by toughness: 3 / 6 / 10 (`pods.value1/2/3`). **Every hit pays**: a hit that does not burst it
  knocks `hitGlints` (1) loose, the burst spills the rest, the total is always exactly its worth
  (`state.pods.paid`). Chosen over "all on the burst" so the first cuts of a chain have an answer.
- Glints set loose reach the one counter (`state.pickups.count`) one at a time: the first 16 frames
  after the hit, the rest 5 apart, or 3 apart when 6 or more go at once (8 from a three-hit pod take
  37 frames). Each is an ordinary `pickup` event with the pod's id, `kind: 'glint'`, `value: 1`, `pod:
  true`. A new hit restarts the queue of what is still in flight: `podHit` / `podBurst` always say
  exactly what is coming (`value`, `frames`, `stagger`). `pickups.taken` and `__game.pickups().worth`
  count the scene's pickups only; `__game.pods()` has the pods' share.
- State `state.pods = {hp[], hitBy[], left[], timer[], gap[], paid[], burst}`, indexed like `scene.pods`.
  `hpMax` = `podHpMax(scene.pods[i])` (the scene's `hp`, default 1).

## Where the pods are (12, worth 62)
| id | x, y | mount | hp | how |
|---|---|---|---|---|
| pod-path-1 | 560, 1258 | sit | 2 | ground left of F1 |
| pod-f2 | 1136, 914 | hang | 1 | under F2: jump from the ground, up slash |
| pod-f3 | 1500, 682 | sit | 2 | on F3, on the left route up |
| pod-stone | 1500, 1258 | sit | 3 | at the moth-stone's foot, by the pool's lip: cutting it she stands at the first lantern and its ten glints kindle it (goal.md). It was pod-path-2 at 2000 |
| pod-branch-l | 2176, 1058 | hang | 1 | under the left branch: hop + up slash |
| pod-rise | 2800, 1130 | sit | 2 | on the mid rise |
| pod-ledge | 3100, 426 | sit | 3 | on the high ledge: the big one at the top of the left route |
| pod-branch-r | 4470, 946 | hang | 1 | under the right branch: jump + up slash |
| pod-f6 | 4830, 818 | hang | 2 | under F6, from the right rise: two up slashes in one jump (the hang helps) |
| pod-row-1..3 | 5060 / 5350 / 5640, 1066 | sit | 1 | the pogo row on the right rise, 290 px apart, open sky |

## What render gets
- Player (`PlayerView`): `attack` (`none|fwd|up|down`), `attackFacing`, `attackFrames` (0 on the slash
  frame, holds in hitstop), `attackActive`, `attackSeq`, `attackHits`, `attackStep` (1-3),
  `attackFinisher`, `lungeX` (signed px/f, fading), `hang` (frames left), `hitstop`, `kickX`.
- `slash {x, y, dir, facing, seq, step, finisher, startup, active, duration, cooldown, lunge, hang}`:
  all step-accurate. `slashHit {x, y (target), dir, facing, target {kind, id}, px, py, pogo, hitstop,
  step, power, knockback}`. `impact` (above). `slashEnd {dir, hits, reason: done|dash|chain|hurt}`.
- Pods: `scene.pods[i].hp` = hpMax; `state.pods.hp[i]` = left (0 = open). Damage stages for the artist:
  `podHit {id, mount, x, y, dir, facing, power, hpLeft, hpMax, value, frames, stagger}` on each hit it
  survives; `podBurst {id, mount, x, y, dir, facing, power, hpMax, total, value, frames, stagger}` on
  the last. In both, `value` glints are now flying: the first lands in `frames`, then every `stagger`.
