# Lures: the lamp verb (pull, caught, snuff), 2026-10-17

The story's false lamps, built from docs/design/core.md §3. **Named `lure` in code** (`scene.lures`,
`state.lures`, `src/sim/lures.ts`, `tuning.lures`, events `lure*`) while the test grove's old wayside
`lamps` (`scene.lamps`, goal.ts: lesser lanterns she kindles) still exist; they are unrelated. Rename to
`lamp` when the grove's lamps are dropped (core.md §5 table). Lab room: `?room=lab-lamps` (greybox,
every ability; `&abilities=none` for the starting kit). Tests: `tests/unit/lures.test.ts`.

## Data
- Scene: `lures: [{id, kind: 'wick' | 'lantern', x, y (flame centre), spin?: 1 | -1}]` (spin 1 = clockwise on
  screen). Validated: unique ids, inside the room, no solid inside the core.
- Kinds are rows in `tuning.lures.kinds` (radius, pullEdge, pullCore, swirl, core, hp, moths, `sharp`): a new kind is a
  row first. `ring` / `great` / `greatWide` are a great lamp's (memory/bosses.md); `sharp` n raises the depth k to
  the 2^(n-1)th power first (the heart: 4, a well that bites only near its core: a big field at a lantern's profile
  saturates her drift past her run speed). A boss may switch a lure's row, move its flame or shield it
  (`state.lures.live`): every rule reads `lureRowNow` / `flameAt`, not `lureRow` / `lureAt`. The panel shows them as `kinds.wick` / `kinds.lantern` sub-folders.
- State: `state.lures = {hp[], hitBy[], out[] (frame + 1), snuffed, freed, grace[]}`; on the player `lure` (index of
  the lure holding her, -1), `lureFrames`, `lureBeats`, `lureOut`, `lureCd`, `lurePend`, `pullX`, `lureGrace`,
  `lureGraceFrames`, `lureAimX/Y`, `lureThrow`, `lureCore`. Version unchanged (fields added).

## The rules (sim)
- **Pull** (`lurePull`, applied in the controller after the mode update, before the move, normal mode only):
  `a = pullEdge + (pullCore - pullEdge) * f(k)`, k = 0 at the rim .. 1 at the core, f = k(1 - c + ck) with
  `curve` c; toward the flame plus `swirl * a` along the tangent. In the air `vy += ay` and the sideways part
  goes into **`pullX`**, its own momentum (x `pullXKeep` per frame, cap `pullXMax`), added to the move like
  `kickX`; her steering never eats it, so a pass throws her. On the ground `pullX` eases toward
  `groundDrag * ax` (cap `groundMax` 2.4 px/f) **only while she holds a direction**: a drift she always outwalks
  (9.6 - 2.4), and standing still she never moves (feel review problem 9: idle on R3's knob she drifted 58 px into
  W2's core). **A gliding body feels `glidePullMult` 0.6 of the pull.** Dash and wall slide zero it. A wall hit
  zeroes it.
- **Caught** (after the move, normal mode, not staggered): body centre within `core` of a burning lure not in
  grace, **and moving inward** (closer to the flame, which may swing, than before the move) **or inside it
  `catchFrames` 4 frames in a row** (`lureCore`; Celeste's tight threat box). Walking or jumping into a core
  still catches at once; being placed in one (teleport, a test's `caughtBy`) takes 4 frames. She circles: a tangent step of `orbitSpeed`, renormalised with sqrt onto radius `core x orbitShare +
  lureOut`, moved through moveX / moveY (walls hold). No new slash; a slash already swinging plays out (and can
  put this flame out: `lureFree how: 'snuff'`). Grounded counts too: a low flame catches a walker who goes into
  its core.
- **Beating free**: each press of jump **or attack** is a beat, queued (`beatQueue` 2) and counted `beatCd` 6
  apart, so a mash is never lost; a press buffered just before the catch counts. Each pushes the circle out
  `beatPush` (sinks back `beatSink`/f). The 3rd throws her **exactly along the held direction (8-way)**; with
  nothing held, **back the way she came in** (`player.lureBack`, set at the catch: director's area 1, "holding nothing
  throws her back", it costs nothing; R3: back onto L 17 of 17); `freeSpeed` 14 (sideways part into `pullX`) +
  `freeLift` 7 up, then **a launch**: for `throwFrames` 20 she flies under `launchGravity` 0.5 x gravity whatever
  jump does, no wings, and no apex hang until she lands (`player.thrown`), so the strength never depends on holding
  jump (casual first-timer r2 found the strong throw only by holding it); held jump opens the wings after the launch
  (throw + glide). Flat floor 260 px under the flame: right 676 px, up-right 863 px and 369 up (it was 398 / 440 with
  jump released / held). While caught, **`player.lureArc`** is the predicted flight, computed last in the step from
  the next step's frame and with a press now queued behind `lureCd` like a real one, so it is the throw point for point
  (tested for wick, lantern, ring, great, a swinging lantern, with a hawker about; plan r3) (src/sim/arc.ts: the real
  controller on a copy, the last beat taken now with the held direction; body-centre points every `arcEvery` 3
  frames up to `arcFrames` 60, ending where she lands or is caught again), for render's preview; double jump and air
  dash back; `graceFrames` 50 from that lure, **and from every core the throw
  passes through in its first `throwFrames` 20** (`lures.grace[i]`: no re-catch by the next wick). **The orbit
  stands still while the last beat is due** (`lureBeats = beats - 1` and `lureCd > 0`), and `lureAimX/Y` is the
  throw from where she is, so the arrow render draws is the throw she gets. A dash (owned, off cooldown) frees her at
  once even with the air dash spent; a blow frees her (`how: 'hurt'`, handled in `step` after `hurtPlayer`).
- **Snuff** (`slashLures`, from `resolveSlash` after pods): flame box `flameRadius` 20 half-size, one hit per
  slash, `power` per cut; hitstop `hitstopFrames` 3 (+ the step's bonus) while it holds, the pogo's 2 on a down
  cut, **`snuffHitstop` 9** when it goes out (the loudest beat, a down-cut snuff included); a down cut pogos.
  At 0: out for good (no pull, no catch), `healOnSnuff` 1 health back, `lureSnuff {moths, freed, snuffed}`.
- Events (x, y = the flame): `lureCaught {spin}`, `lureBeat {beats, of, out}`, `lureFree {how, vx, vy, grace}`,
  `lureHit {hpLeft, hpMax}`, `lureSnuff {moths, freed, snuffed, heal}`; `slashHit.target.kind = 'lure'`;
  `glideEnd` reason `lure`.

## Tuning and why (measured with headless probes and real-key bots, 2026-10-17)
| knob | value | why |
|---|---|---|
| wick radius / core | 240 / 40 | a field you notice a beat before you're in it; a core a little wider than her body |
| lantern radius / core | 360 / 52 | reads as "the big one"; reaches a jump from the pit's lip |
| pullEdge -> pullCore | 0.15 -> 1.9 (wick), 0.2 -> 2.3 | the core must beat falling gravity (1.45) so a moth under it is sucked up; mid-field is about rising gravity (0.9): she floats, slows, bends |
| curve | 0.3 | k² (the first try) bit too late: a jump at the lantern from the lip fell under it untouched |
| swirl | 0.5 / 0.6 | the swirl is what makes a pass a slingshot (a static radial well alone gives back what it takes) |
| pullXKeep / pullXMax | 0.97 / 12 | half-life ~23 frames: the throw lasts the rest of a jump, not forever |
| throw direction | the stick, exactly | feel review problem 6: the radius bent by the stick (`freeSteer` 0.8) threw her left in 7 of 34 rhythms holding right and up into W-hi3 in 3. Then a radius share of 0.25 (the review's `held + 0.25 radial`): a glide on from R6's W5 ducked under the thorn branch to T4 in 3 of 8, 0.1 too; 0 never does. Up as the nothing-held default put R3's mashers into W-hi3 in 5 of 9 rhythms, the radius 2 of 9 |
| catchFrames | 4 | standing still in a core (placed, or a flame swinging onto her) holds her after 4 frames; moving through it outward escapes |
| glidePullMult | 0.45 (0.6 until area 1 r5: a kinder stair) | glide is slow, the full pull glued gliders to flames (memory's old "not yet" 1) |
| throwFrames | 20 | the first 20 frames of a throw (~280 px) |
| orbitSpeed | 7 | ~0.85 s a turn at the last beat's radius: slow enough to time the throw, fast enough to feel held |

What the numbers do in the lab (no abilities): **A** the 440 px gap is uncrossable by a plain jump; under the
anticlockwise wick every jump from the last 130 px before the lip makes it (the swirl throws her to ~20 px/f).
**B** a jump from the pit's lip is caught by the lantern; beating free while holding right lands across in
18 of 18 rhythms (13 of 18 before the stick throw). **F** idle anywhere beside the low wick: never caught, 0 px
drift (232 before). **G** (the row) is crossed by an aimed chain (throw up-right off row-1 and row-2; row-3 is
clockwise because the throw from row-2 passes over it), not by blind timing.

**The wood's lamps, re-measured after the feel fixes (2026-10-17; the same before, except where noted):**
R3 W1 catches every run-up jump across the dip (11 of 11); beaten free holding right she lands on M in 17 of 17
rhythms (12 of 17 and 2 re-catches before); idle anywhere on R3's floor: 0 px drift (96 before), never caught.
Nothing held: re-caught within 4 s in 2 of 9 (W-hi3). Jump-cut sweeps (45): W3 17, W4 30, W7 30, L1 20, none
caught (unchanged). R6 W5 catches the jump-glide 3 of 3; beaten free holding right, jump let go: T3 in 8 of 8
(5 of 8 before: wood.md's open "W5's throw into gap 2's thorns" is closed); gliding on: the thorn branch 8 of 8.

## What feels good, what doesn't yet
- Good: the gap slingshot (a gravity assist that a first jump discovers), the throw out of the lantern, the
  pogo snuff, the snuff burst + moths.
- Throws re-measured with the launch (2026-10-18): R3 W1 holding right or up-right lands on M 17 / 17 (x ~1650),
  nothing held back onto L 17 / 17; R6 W5 holding right, jump let go: T3 8 / 8 (x 3200-3274); gliding on after it
  carries to T4 (5356) or into W6; lab B across 18 / 18.
- Not yet: (1) gliding near flames: `glidePullMult` 0.6 and the inward rule are the first try; watch a dense
  field. (2) No sound yet. (3) The moths leave up and east: rooms have no migration line yet (core.md §3).

## Render
Greybox only for now (memory/greybox.md: field, core, flame, hp pips, a pull line, beat pips and the throw
arrow while held, rings for catch / beat / hit / free, the snuff burst, husk, freed moths that spiral out,
follow ~6 s and leave). The hitbox overlay draws each burning lure's field and core and its flame box.
