# Lures: the lamp verb (pull, caught, snuff), 2026-10-17

The story's false lamps, built from docs/design/core.md §3. **Named `lure` in code** (`scene.lures`,
`state.lures`, `src/sim/lures.ts`, `tuning.lures`, events `lure*`) while the test grove's old wayside
`lamps` (`scene.lamps`, goal.ts: lesser lanterns she kindles) still exist; they are unrelated. Rename to
`lamp` when the grove's lamps are dropped (core.md §5 table). Lab room: `?room=lab-lamps` (greybox,
every ability; `&abilities=none` for the starting kit). Tests: `tests/unit/lures.test.ts`.

## Data
- Scene: `lures: [{id, kind: 'wick' | 'lantern', x, y (flame centre), spin?: 1 | -1}]` (spin 1 = clockwise on
  screen). Validated: unique ids, inside the room, no solid inside the core.
- Kinds are rows in `tuning.lures.kinds` (radius, pullEdge, pullCore, swirl, core, hp, moths): a new kind is a
  row first. The panel shows them as `kinds.wick` / `kinds.lantern` sub-folders.
- State: `state.lures = {hp[], hitBy[], out[] (frame + 1), snuffed, freed}`; on the player `lure` (index of the
  lure holding her, -1), `lureFrames`, `lureBeats`, `lureOut`, `lureCd`, `lurePend`, `pullX`, `lureGrace`,
  `lureGraceFrames`. Version stays 21 (fields added, tests pin 21).

## The rules (sim)
- **Pull** (`lurePull`, applied in the controller after the mode update, before the move, normal mode only):
  `a = pullEdge + (pullCore - pullEdge) * f(k)`, k = 0 at the rim .. 1 at the core, f = k(1 - c + ck) with
  `curve` c; toward the flame plus `swirl * a` along the tangent. In the air `vy += ay` and the sideways part
  goes into **`pullX`**, its own momentum (x `pullXKeep` per frame, cap `pullXMax`), added to the move like
  `kickX`; her steering never eats it, so a pass throws her. On the ground `pullX` eases toward
  `groundDrag * ax` (cap `groundMax` 2.4 px/f): a drift she always outwalks (9.6 - 2.4). Dash and wall slide
  zero it. A wall hit zeroes it.
- **Caught** (after the move, normal mode, not staggered): body centre within `core` of a burning lure not in
  grace. She circles: a tangent step of `orbitSpeed`, renormalised with sqrt onto radius `core x orbitShare +
  lureOut`, moved through moveX / moveY (walls hold). No new slash; a slash already swinging plays out (and can
  put this flame out: `lureFree how: 'snuff'`). Grounded counts too: a low flame catches a walker who goes into
  its core.
- **Beating free**: each press of jump **or attack** is a beat, queued (`beatQueue` 2) and counted `beatCd` 6
  apart, so a mash is never lost; a press buffered just before the catch counts. Each pushes the circle out
  `beatPush` (sinks back `beatSink`/f). The 3rd throws her outward along the radius she is at, **bent toward
  the held direction** (`freeSteer` 0.8), `freeSpeed` 14 (sideways part into `pullX`) + `freeLift` 7 up;
  double jump and air dash back; `graceFrames` 50 from that lure. A dash (owned, off cooldown) frees her at
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
| freeSteer | 0.8 | with the radius only, 3 of 8 beat timings over the pit landed; holding right, 5 of 8 |
| orbitSpeed | 7 | ~0.85 s a turn at the last beat's radius: slow enough to time the throw, fast enough to feel held |

What the numbers do in the lab (no abilities): **A** the 440 px gap is uncrossable by a plain jump; under the
anticlockwise wick every jump from the last 130 px before the lip makes it (the swirl throws her to ~20 px/f).
**B** a jump from the pit's lip is caught by the lantern; beating free while holding right lands across in
5 of 8 timings. **G** (the row) is crossed by an aimed chain (throw up-right off row-1 and row-2; row-3 is
clockwise because the throw from row-2 passes over it), not by blind timing.

## What feels good, what doesn't yet
- Good: the gap slingshot (a gravity assist that a first jump discovers), the throw out of the lantern, the
  pogo snuff, the snuff burst + moths.
- Not yet: (1) with glide and double jump she gets caught a lot when flying near flames (glide is slow, the pull
  wins): fine at a lamp, maybe too sticky in a dense field; try a weaker pull on a gliding body before cutting
  anything. (2) The throw arrow ignores Up/Down (render has no held up/down). (3) A grounded walker who idles
  next to a low lantern drifts into its core and is caught; intended (it is a lure), watch it in playtests.
  (4) No sound yet. (5) The moths leave up and east: rooms have no migration line yet (core.md §3).

## Render
Greybox only for now (memory/greybox.md: field, core, flame, hp pips, a pull line, beat pips and the throw
arrow while held, rings for catch / beat / hit / free, the snuff burst, husk, freed moths that spiral out,
follow ~6 s and leave). The hitbox overlay draws each burning lure's field and core and its flame box.
