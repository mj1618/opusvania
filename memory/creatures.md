# Creatures under the lamp rules (2026-10-17)

The wood's creatures reworked from the old demo design (glints, giving, wallet-driven `seen`, lantern sanctuary) to
docs/design/creatures.md §1 and wood.md §6. The framework and the old burrback / lampwing details are in enemies.md;
this file is what changed and what is new. Lab: `?room=lab-creatures` (greybox, every ability; stations A-G, labels
say what each tests). Tests: `tests/unit/creatures.test.ts`.

## Which rules a room uses
- `scene.senses: 'lamp' | 'wallet'`. **A room JSON defaults to `lamp`** (src/scene/creatures.ts `SENSES`); the test
  grove says `wallet`; a scene built in code without the field is `wallet` (all the old tests). A spawn may override
  (`senses: 'wallet' | 'lamp' | 'always'`): lab-world-c's `c-burr` is `wallet` (world.test fades her on it).
- `EnemyState.sense` 0 wallet / 1 lamp / 2 always. The old burrback and the weaver default to `always`.
- **Test-grove only now** (still built, still tested, inert in lamp rooms): the wallet `seen` levels (seen.ts), the
  offer / gifts (giving.ts: no glints in lamp rooms, so nothing to give), lantern / lamp sanctuary and calm (goal.ts,
  sanctuary.ts), glint spill on a kill. Drop them when the grove goes.

## Senses by lamp light
- `player.lit` 0..1, set at the start of `updateEnemies` every step (even with no creatures): her body centre against
  every burning lure (its swinging position too, `lureAt`), 1 at the core, 0 at `senses.litScale` (1.6) x the pull
  radius: a wick lights 384 px, a lantern 576. `litAt(state, scene, t, x, y)` in src/sim/enemies/senses.ts.
- `seenBy(e, info)` replaces `seenNow` inside the kinds: lamp = `litLevel` (2: the old level every fight was tuned
  at, scale 1) while lit, else 0; always = 2; wallet = the old rule.
- Unseen: no notice, no brace, no flinch, **and its touch does nothing** unless it is in a fight (braced / roused /
  stirred): "a dark room is a rest". A burrback within `dozePx` of an unseen her dozes; a flyer roosts.
- Why 1.6 and not the pull radius: wood.md's geometry puts the floor under its wicks 270-540 px from the flame
  (W7 under the hawker 272, L1 over the burrback's floor 536). At 1.0 / 1.4 those floors were dark and the hawker
  and the lantern burrback never saw a walker (playtest: burr-e never noticed anyone).

## Lamp-guarders (`guards: '<lure id>'`)
- When `state.lures.hp[guard]` hits 0 the framework calls `KindRules.disperse` once (not mid-tumble) and fires
  `enemyDisperse {lure, how, quiet}`. Burrback: `sleep` (curled, harmless; cut it and it fights, roused, then sleeps
  again). Lampwing / hawker: `leave` (up and away, harmless, `gone` after `leaveFrames`). Weaver: `leave` (climbs off).
  Web: `slack` (holds nothing; lets go of her). `quiet` = the lure was out before she came in (`lures.out[i] === 1`):
  flyers are simply gone, crawlers asleep.
- Roamers and bosses have no `guards`.

## No drops
A kill in a non-wallet room spills nothing (`enemyDie.value` 0, no `pickup`). New rows have `value` 0 too.

## The burrback, kept
Same ram, second beat, pogo curl, drop dodge, lips, fair placement (enemies.md); only the senses changed. Bots in the
lab walk into its ram once each (1 hit) and pass.

## The old burrback (`kind: 'oldBurrback'`, row `tuning.oldBurrback` = the burrback's + overrides)
- 84 x 50, 10 hp, `sense` always, `hunt` (turns to her on its ground, `enemyTurn` cause `hunt`), strikePx 190.
- **Asleep** at start (`mode: 'sleep'`), harmless; wakes when she is grounded on its ground (feet within
  `strikeAbovePx` of its own) within `wakePx` 1400: `enemyWake {frames 60}`, harmless 60 frames, then hunts.
- **Feint**: brace 26 (`enemyWindup`) -> `feint` 18 (`enemyFeint`, shell down, touch live) -> brace 20 (`enemyWindup`
  again, turned to her) -> ram 260 at 11 px/f -> winded 44 (90 at a wall).
- **Shell** (`pogoShell`): braced (both braces and the ram) only a down cut lands, **one per brace** (`pogoed`), and
  it does not stagger (`KindRules.tough`): it rams on under her. Forward / up cuts clang from any side. Any other time
  everything glances (a down cut still bounces her), **except after a wall stun** (`stunned`): every cut lands for
  the 90 frames. So: pogo the tell (twice an exchange with the feint) or bait the ram into a wall.
- Lab (bots don't pogo): naive / speedrunner take 1 hit and hop out of the open pit; in the first run the cautious
  bot (it waits while a creature faces it) faded 6 times in the pit. R10's pit is closed: this is the fight to tune.

## The hawker (`kind: 'hawker'`, row `tuning.hawker` = the lampwing's + overrides)
- The lampwing's sim (tell 36, harmless 20, committed dive, stall 34 open, climb, 3 dives), box 52 x 24, sight 480
  (its home hangs ~440 over the floor at its wick, so 320 never saw a walker), `touchCalmFrames` 180 after its touch.
- In a lamp room the dive is committed (no `dark` give-up mid-dive); dark at the end of the tell, the stall or the
  climb, it gives up `dark`. `lampwing` stays for the test grove (its dive still gives up when her wallet empties).
- Moving on dodges it: naive / speedrunner pass both lab hawkers with 0 hits. The stop-start cautious bot was hit 10
  times in 72 s and faded 5 times at station B (it stops and creeps in the light: each tell ends on a still target).

## Grabs are Caught (src/sim/grab.ts)
- `player.grab` = the creature's index (-1), `grabX/Y` = where; she is held still (no orbit). Beats share the lure's
  counters and spacing (`lures.beatCd`, `beatQueue`); `grab.beats` 4. The last beat throws her toward the held
  direction (up if none) at 11 + 7 up; `grabGrace` 45 frames nothing grabs her. Dash (owned) frees at once. **Any
  `hurtPlayer` frees her** (thorns, a bite). Events `grab`, `grabBeat`, `grabFree {how: beat|dash|hurt|gone}`.
- player.ts: `caught()` handles both holds; no new slash while grabbed (a press is a beat).
- For toads later: a grabbing creature that drains health while she is held needs a hurt that does not free her
  (not built: today a bite throws her out).

## Orb web (`kind: 'web'`) + weaver (`kind: 'weaver'`)
- **Strands as data**: `strands: [[x0, y0, x1, y1], ...]`, or in room JSON an `orb {r, ry?, spokes, rings, frame,
  start?, gaps?}` that src/scene/creatures.ts expands into strands at parse time (spokes split at every ring; a frame
  line from each rim end on along the spoke to the first solid / room edge within `frame`; `gaps` = slack sectors in
  degrees, 0 east, 90 down). Shared end points (to the pixel) join strands; an end within `web.anchorPx` 16 of a solid
  or the edge is an anchor.
- `anchors: [[x, y]]` on a web spawn: points that hold strands like a solid (the Weaver's heart: a spoke cut from it
  falls alone; without it every spoke of a web hung in open air fell at the first cut).
- Web state is its EnemyState: `cut` = one char per strand (`0` intact, `1` cut, `2` fell), `seg`/`targetX,Y` = the
  last touch. Its box = the strands' bounds; it never hurts and takes no blows (`slashed` instead: every intact strand
  the slash box meets is cut, then strands no longer joined to an anchor fall; `webCut {cut, fell, left}`; no
  hitstop, no pogo). Touch = her box within `strandHalf` 5 of an intact strand: `webTouch`, `grab`.
- **Weaver**: lives on the strands (`seg`, `segT`; Dijkstra over the strand graph each step while it moves, cut strands
  are no road). Senses touches, not cuts: on a grab `enemyRun {px, frames}` at 5 px/f, then `windup` 24 (`enemyWindup`
  px 0: the count), then `bite` 10 frames (its only live touch: contact damage 1, which frees her). Free before the
  count ends: it waits 30 and goes home at 3 px/f (`back`). The count (24) > the fastest beat-free (19 frames), tested
  at five touch heights right beside it. Cut, it holds its strand (no knockback), staggers, goes home. Its strand cut
  from under it: it steps to the nearest standing one.
- Lab numbers: a masher is never bitten (the run from the hub is 60-110 frames); the danger is lingering or being
  re-caught (holding right through the web throws her further in: hold away). Naive 3 grabs / 2.2 s, cautious 6 /
  5.8 s, speedrunner 1 / 0 s (it cuts what is ahead), explorer snuffs the wick: slack.

## Persona bots
`npm run playtest -- --room lab-creatures`: reports now have an **encounters** table (per creature: first thing it
did about her to the last, hits, grabs, ended killed / dispersed / passed: recorder.ts). Observe gives personas
`strands` (silk in view; webs are not `enemies`) and `lured` covers a grab; the slashing personas cut silk ahead.
The explorer counts a lure that is out as visited (it stood under each wick for 45 s before).

| persona | time | hits | deaths | snuffed | notes |
|---|---|---|---|---|---|
| naive | lost at the far wall (lab end) | 4 | 1 | 0 | 1 hit each from burr-a, old-d, burr-e, burr-g; hawkers 0 |
| explorer | 105.6 s, done | 5 | 0 | 7 of 7 | everything dispersed but old-d; burr-g 2 hits |
| speedrunner | 47.3 s, done | 4 | 0 | 2 | one hit per crawler, 0 from hawkers / weaver |
| cautious | stuck at hawk-b | 13 | 5 | 0 | stop-start under a hawker: see above |
