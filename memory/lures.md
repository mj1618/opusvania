# Lures: the lamp verb (the fling, embers, snuff), 2026-10-18

The story's false lamps (docs/design/core.md §3). **Named `lure` in code** (`scene.lures`, `state.lures`,
`src/sim/lures.ts`, `tuning.lures`, events `lure*`) while the test grove's old wayside `lamps` (goal.ts) exist;
unrelated. Labs: **`?room=lab-feel`** (the fling's toy room, every lamp relights), `?room=lab-lamps` (older).
Tests: `tests/unit/lures.test.ts`, `lab-feel.test.ts`, `area1-r3.test.ts` (the arc); `tests/unit/fling-drive.ts`
drives a fling in room tests (`inReach`, `untilReach`, `fling`).

**Since Matt's play (2026-10-18) there is no pull and no catch on the small lamps.** The old core catch, orbit and
beat-free (Matt: it took control away, mashing) are gone, no sunk cost. The verb is **Ori's Bash**: the fling.

## Controls
**Lamp** (`ActionBit.lamp`, bit 256): keys **V** and **I**, pad **Y** and **LB**, DSL letter **B**. Offer moved
to **F** / pad **B** (the test grove's only). Nothing else changed.

## The rules (sim, `fling()` in player.ts, `flingLaunch` etc. in lures.ts)
- **Reach**: a Lamp press with her body centre within the kind's `fling` radius of a burning, unshielded flame
  (`flingTarget`: the nearest; a swinging flame where it is now). Out of reach the press does nothing.
- **The moment**: she stops dead (vx, vy, pullX 0; glide and wall slide end) and aims with the stick for up to
  `flingFrames` 36 (0.6 s; **longBreath** x2). The world is slowed: boss and creatures step once in
  `flingSlowEvery` 4, and nothing touches her. Jump, dash and the blade do nothing (no mashing). `flingStart`.
  **The aim moment's flag is `player.fling >= 0`** (the lure's index; -1 otherwise), with `flingFrames` its count:
  render, audio and creatures read that. Render also reads `lureAimX/Y` and `lureArc`.
- **The launch** (Lamp let go, or the cap): exactly the held direction (8-way); nothing held = straight out from the
  flame through her (Up at its centre). `flingSpeed` 15 along it (the sideways part as `pullX`) plus `flingLift`
  5 up, then the old throw's launch: `throwFrames` 20 at `launchGravity` 0.5 whatever jump does (`thrown`), wings
  after; air dash and double jump back; `flingCooldown` 8 before the next press counts. `fling {vx, vy, aimX, aimY}`.
  A slash started in the launch is the **throw-cut** (memory/combat.md).
- **`lureArc`** while she aims: the flight a release now gives (arc.ts: the real controller on a copy, released
  with the held stick, a point every `arcEvery` 3 up to `arcFrames` 60). Tested point for point (wick, lantern,
  ring, a swinging lantern, a hawker about).
- **Used up, then embers** (wood-area1-v3's retry rule): at launch the flame goes to hp 0 and smoulders
  (`lures.ember[i]`, `lureEmber`). The chain's first launch remembers the ground she left (`chainX/Y`). Then:
  - lands on safe ground (trackSafeGround's rule) not back at the start: every ember goes out for good
    (`snuffLure` by `'fling'`: `lureSnuff {fling: true}`, moths, the save, +1 health). Leaving the room in flight too;
  - lands back within `stepUp` / `chainBackPx` 160 of the start (a miss), a fall catch, thorns, or a fade: every
    ember burns again (`lureRelight`), nothing spent.
  A fling straight into the ground relights at once. Landing on a floor under a failed chain counts as safe
  ground (it commits): put catches or thorns under a chain that must be retried. Ground with a creature near
  isn't safe, so embers wait.
- **Snuff** (`slashLures` -> `snuffLure`): unchanged. Flame box `flameRadius` 20, hitstop 3 / pogo 2 / snuff 9, a
  down cut pogos; `lureSnuff {moths, freed, snuffed, heal}`. A toy room's **`relight: n`** lamp burns again n
  frames after it went out and is never saved (lab-feel).
- The great lamps (`great`, `greatWide`: the Weaver's heart) keep their pull rows and have `fling` 0: no fling,
  and **no catch any more** (the Weaver's P1 bite-while-caught is gone; bosses.md is stale there).

## Tuning (tuning.lures) and why
| knob | value | why |
|---|---|---|
| `kinds.*.fling` | wick 110, lantern 140, ring 110, great 0 | about 2.5-3x the old core: a jump at a flame finds it without aiming at its heart; a flight passing a chain flame 100 px off still gets it |
| `flingFrames` | 36 | Ori's Bash window; long enough to read the arc and pick a direction, short enough to stay a beat |
| `flingSlowEvery` | 4 | the world at quarter speed reads as slow time without stopping a hawker cold |
| `flingSpeed` / `flingLift` | 15 / 5 | the old throw's strength (14 / 7), so the wood's throw lines still work: one up-right fling off a flame climbs ~220 px and comes back to its height ~680 px on (holding right) |
| `flingCooldown` | 8 | stops a held / bounced key re-flinging off the next flame at once |
| `chainBackPx` | 160 | "back where it began" for embers |

Measured with the fling in the wood (tests in wood-rooms / wood-oak): R3 W1 in reach of every run-up jump, right
or up-right lands on M; R4 W-gap up-right reaches the high ledge, right meets its face; R6 W5 right or up-right
lands T3; **R6's chain needs one fling now** (C1 up-right carries her onto T5, past C2); R8 W-throw up-right only
(right falls short); R9 W-s2 up-right onto the shelf; the oak's W-ff **up** (not up-left) onto the bridge.

## lab-feel (content/rooms/lab-feel.json, greybox, relight 150 / 240)
0 the attack first (creatures agent's ask): a plain burrback 600 px from spawn on open floor, a juvenile, three
carriers, no lamp near (the lamp stations start at x 3000; tests offset by `D`) · 1 one flame over a gap (a jump falls in, up-right clears) · 2 a three-flame chain climbing to a ledge at 950 (one
or two links fall short into the pit and relight) · 3 fling then glide (without the wings: the gap) · 4 a climbing
chain under a hawker to a ledge at 1050 · 5 over thorns: right, right, up-right (short: thorns, the flames relight)
· 6 a burrback · 7 a flame over the old burrback. Chain flames were placed by simulating the real flight (each
link's apex), so an early or late press inside the reach still connects.

## Feel (real keys, playwright, 2026-10-18)
The freeze reads at once with render's arrow and arc; 120 ms holds chained all three chains with a human-ish
reaction; the reach is generous. Watch: the fling is strong (one fling outflies old two-lamp chains), and she hangs
dead still while aiming (Ori drifts a little).

## Render
Render's fling (7d8800c): aim arrow, the arc, the dimmed world, the launch, the ember. The greybox lures.ts
still draws the old caught UI from fields that are now always -1 / 0 (`player.lure`, beat fields, `lures.beats`).

## Moonwicks, moonmoss, Gust, lamp-held gates (Lanternroot, 2026-10-18; src/sim/light.ts, memory/glow.md)
- **A moonwick** (`lures[].kind: 'moonwick'`, row `kinds.moonwick`: no pull, no moths, `fling` 110 = the fling's and
  the kindle's reach, `radius` 420 = its silver light): cold (`hp` 0) until kindled (Kindle owned, glow: `lureKindle`),
  then it burns `moonwick.burn` 720 frames (its own `burn` if set: the vault's 300), the last `gutter` 120 a flicker
  (`lureGutter`), then `lureCold`. `lures.burn[i]` = frames left (-1 = for good). **`keep`**: kindled once, it burns
  for good (`save.opened` `room:id`). **`wickSets`** `[{id, wicks, sets}]`: every wick burning on one frame saves the
  flag and keeps them all (`wickSet`). A burning one is a fling anchor that **never embers** (`flingLaunch` returns
  before the ember); the blade passes through it (`slashLures` skips it); `litAt` ignores it (silver light is no
  lamp light: creatures never see her by it).
- **Silver light** (`player.moonlit` 0..1, set in `updateEnemies` next to `lit`; `moonlitAt`): a hawker (its tell,
  its rhythm's pass) or a dangler (its drop) never starts a strike at her while she, or the strike's point, is in it
  (`shyOf` in enemies/senses.ts: `enemyShy` once per hold, `EnemyState.shy`). A strike under way finishes.
- **Moonmoss** (`scene.moonmoss [{id, x, y, w, h, oneWay?}]`): solid (kit `moss`: never safe ground) or a one-way only
  while its centre is in a burning moonwick's light; one that would appear inside her waits until she is clear
  (`mossOn` / `mossOff`; `light.moss[i]`; `withMoss` adds them to the step's scene, cached by the set that is on).
- **Gust** (ability `gust`; `tuning.gust`): a tap of Lamp with nothing in reach: a 64 px puff from her centre along
  the held 8-way aim (facing if none), 16 px/f for 30 f, stopped by solids (thorns are not solids), cooldown 30. It
  snuffs warm lamps that are not great (`lureSnuff {gust: true}`), fans a burning moonwick (`lureFan`: its burn starts
  over), knocks a hawker out of its tell / dive into a 60 f stall, sends a telling dangler back up, shoves beetles 12
  px/f (no harm). Down + tap in the air: the hop (`hopVy` -9, once an airtime, back on landing or a pogo).
  `light.gust` while it flies; `gust`, `gustHit {target, how}`, `gustEnd`.
- **Lamp-held gates**: `lures[].sets: flag`: the flag is set when that lamp goes out, however (the grille lamp's
  `curtain-open`, the bramble pair's `bramble-a-out` / `-b-out`). `lures[].moths` overrides the row's moths (the
  cache's firefly-lamp: 80).
