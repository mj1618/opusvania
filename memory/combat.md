# Combat: the thorn slash and lumen pods

Sim only so far (`src/sim/player/player.ts` `updateSlash` / `resolveSlash`, `src/sim/player/attack.ts`
`slashBox`, `src/sim/pods.ts`; numbers in `tuning.attack` and `tuning.pods`). No health, no damage,
nothing fights back yet. Tests: `tests/unit/combat.test.ts`, `tests/unit/pods-pilot.test.ts`.

## The slash
- **Input**: the `attack` action (bit 64): keyboard C or J, pad X / Square (dash lost that button: it is
  RB / RT now), `A` in the input DSL.
- **Direction**, fixed at the press: Up held = `up`; Down held *in the air* = `down` (on the ground Down
  gives a forward slash, as in Hollow Knight); otherwise `fwd`. `attackFacing` = the side she faced; a
  direction pressed on the same frame counts (press Left + attack while facing right = a slash to the
  left). On a wall slide she already faces away from the wall, so it goes away from it.
- **Timing** (frames from the press, 60 Hz): `slash` event on frame 0, hit area live on frames 1-6,
  `slashEnd` on frame 14, next slash from frame 20 (0.33 s; HK's nail is 0.41 s, 0.25 with Quick Slash).
  A press is good for 8 frames (its own included), so mashing gives exactly one slash every 20 frames.
  One frame of startup, not zero: render gets a frame to show the blade leaving before any hitstop.
- **Never locks movement**: tested bit-for-bit against the same inputs without the attack. She can run,
  turn, jump, glide and wall slide through it; the slash keeps its direction. It does not end a glide
  (Down + attack does, because Down is the fast fall).
- **Dash**: no slash during a dash. A press during one does not age: it fires on the first frame after
  `dashEnd`. Attack + dash on the same frame = dash, then the slash. A dash during a slash ends it
  (`slashEnd` reason `dash`).
- **Hit area** (`slashBox(body, dir, facing, tuning.attack)`, exported from `src/sim/index.ts`; body
  40 x 80): `fwd` from 14 px behind the body centre to 110 ahead, 88 tall, centred 8 above centre (12
  above her head to 4 above her feet: a pod on the ground is in it). `up` / `down`: 100 wide, 124 / 120
  from the body centre, i.e. 84 above the head / 80 below the feet. Targets are tested every live
  frame after the move, so something she runs into mid-swing is hit; each target once per slash
  (`attackSeq` against the target's `hitBy`).
- **Hit response**
  - *Hitstop*: `player.hitstop` frames (2 for a pod, the target decides). For those steps
    `updatePlayer` returns early: no movement, no timers, `attackFrames` / `motionFrames` /
    `contactFrames` stand still, presses are still latched into their buffers. Everything else (frame
    count, pickups, pod glints) and render time keep running. It is plain state, so replays and hashes
    are exact.
  - *Recoil, fwd*: `kickX` = 3 px/f against the slash, fading 1 per frame (6 px), added on top of `vx`
    in the move. It is not a change to `vx`: ground decel (3.2) ate a `vx` impulse in one frame (1 px,
    invisible), and it must not break a run (running through a pod costs 6 px and the 2 stop frames).
  - *Recoil, up* (airborne): `vy += 2`.
  - *Pogo* (`assists.pogo`, on): a `down` slash that hits sets `vy = -15.5` (125 px up in 17 frames),
    refills the air dash and the double jump, ends a wall slide. A fixed hop (no variable height).
    Bounce to bounce is 32 frames = 288 px at run speed: space pogo rows 290 px apart for a full-speed
    chain (230 was too tight: she overflew the second pod). The window is generous: any press while
    descending with her feet less than ~200 px above the target and within 72 px sideways connects.

## Lumen pods
- Scene data `pods: [{id, x, y, mount: 'sit' | 'hang'}]` (centre; box 44 x 44 = 2 x `pods.radius`).
  Validated in `src/scene/index.ts`: unique ids (also against pickups), inside the scene, not in a
  solid, `sit` = exactly on a solid top or a one-way (`y = top - 22`), `hang` = an underside or a
  one-way at most 160 px above its top.
- They never collide with her. A slash takes 1 `hp` (default 1); at 0: `podBurst`, open until restart
  (`R`, `__game.load()`); a teleport keeps them.
- A burst pod spills `value` (3) glints into the one counter, `state.pickups.count`: the first 16
  frames after the burst, the rest 5 apart, each an ordinary `pickup` event with the pod's id, `kind:
  'glint'`, `value: 1`, `pod: true`, `x, y` = the pod. They continue the pickup combo. `pickups.taken`
  and `__game.pickups().worth` count the scene's pickups only; `__game.pods().worth` is the pods' share.
- State `state.pods = {hp[], hitBy[], left[], timer[], burst}`, indexed like `scene.pods`.

## Where the pods are (12, worth 36)
| id | x, y | mount | how |
|---|---|---|---|
| pod-path-1 | 560, 1258 | sit | ground left of F1: forward slash on the way to the bank |
| pod-f2 | 1136, 914 | hang | under F2: jump from the ground, up slash |
| pod-f3 | 1500, 682 | sit | on F3, on the left route up |
| pod-path-2 | 2000, 1258 | sit | ground right of the pool |
| pod-branch-l | 2176, 1058 | hang | under the left branch: hop + up slash, then on up through the branch to its glints |
| pod-rise | 2800, 1130 | sit | on the mid rise |
| pod-ledge | 3100, 426 | sit | on the high ledge |
| pod-branch-r | 4470, 946 | hang | under the right branch: jump + up slash |
| pod-f6 | 4830, 818 | hang | under F6, from the right rise |
| pod-row-1..3 | 5060 / 5350 / 5640, 1066 | sit | the pogo row on the right rise, 290 px apart, open sky above |

## What render needs
- Slash arc + Vesper: `player.attack` (`none|fwd|up|down`), `attackFacing`, `attackFrames`,
  `attackActive`, `attackSeq`, `attackHits`, `hitstop`, `kickX`; events `slash {dir, facing, seq,
  startup, active, duration}`, `slashHit {x, y (target), dir, facing, target {kind, id}, px, py, pogo,
  hitstop}`, `slashEnd {dir, hits, reason: done|dash|chain}`. `slashBox` gives the area to draw in.
- Pods: `scene.pods`, `state.pods.hp[i] > 0` = closed; `podBurst {id, mount, x, y, dir, facing, value,
  frames, stagger}` then `value` `pickup` events with `pod: true` at `frames`, `frames + stagger`, ...
- `SimView.pods` = `game.state.pods` (read only).

## Pods on screen
Drawn by `src/render/pickups/` (`pod.ts` + the burst and spilled glints in `index.ts`); see the
"Lumen pods" section of pickups.md. The pod's own impact is a 19 px flare, flecks and motes at the
pod's centre; the slash arc and any contact spark belong to the skin. `?nopickups` hides pods.
