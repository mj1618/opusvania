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
- The lampwing's sim (tell 36, harmless 20, committed dive, stall 34 open, climb, 3 dives), box 52 x 24,
  `touchCalmFrames` 180 after its touch (a breather: no notice, harmless).
- **Round 1 review: "never dived"** (chunk1-level-r1 R8, feel item 7). Two causes, both fixed 2026-10-18: its home hangs
  ~440 px over the floor at its wick, so (1) at sight 480 a runner crossing the light was never seen (sight now **620**,
  leash **640**), and (2) the lampwing's 340 px dive cap stalled 130 px over a stander's head: the first dive was always a
  miss (now **diveMaxPx 600, diveMaxFrames 72, diveSpeed 6.4**). It also **leads a runner by 0.8 of her run**
  (`diveLeadRun`; the lampwing 0): stopping, turning back or jumping dodges it, running on at full speed usually still
  clears the end of a long dive. Stander in R8: noticed at the light's edge, hit 81 frames after the tell began.
- A dive under way when its lamp goes out lands first; then it leaves (the framework does not disperse in `dive`).
- In a lamp room the dive is committed (no `dark` give-up mid-dive); dark at the end of the tell, the stall or the climb,
  it gives up `dark`. `lampwing` stays for the test grove.
- **What the sim cannot fix (placement)**: a one-cut wick reachable from where she first enters its light is snuffed
  before the first dive lands (explorer in R8: dispersed 0.6 s after notice). The tell + dive is ~1.3-1.8 s.

## The dangler (`kind: 'dangler'`, src/sim/enemies/dangler.ts, row `tuning.dangler`)
- A small spider on a thread: the Weaver's P2 drop made small. Spawn `{id, kind: 'dangler', x, y (where its thread is
  tied: within 48 px under a solid's underside, a one-way, or the room's top), facing, guards?, drop? (longest drop,
  default 640), hp? (2)}`. Box 30 x 26, sense by lamp light (it drops only while she is lit).
- `sit` at the perch (harmless) -> she is lit, below it, within `noticePx` **300** sideways, a clear line ->
  `windup` **34 f** (`enemyWindup {px: the drop}`; the thread is shown to `targetX, targetY` = level with her body,
  clamped 120..`drop`, short of the ground) -> `drop` 14 f (t², live) -> `swing` 48 f, one swing of **130 px** toward
  the side she is on as the drop ends (live) -> `stall` 60 f hanging open, bobbing 6 px (harmless: two cuts kill it)
  -> `climb` 4 px/f -> `sit`, 90 f cooldown.
- **Cut its silk** (a slash meeting the thread above its body, not the body, while it hangs): `enemyThreadCut`,
  `fall` (harmless) -> `recover` 90 f stunned and open -> `leave` (gone). A blow on the body is the shared hit (the
  framework's `slashed` hook now returns -1 for "not taken here").
- Lamp-guarder: snuffed, it climbs away for good. Render reads `fromX, fromY` (tie point), `span` (silk length),
  `targetX, targetY` (the tell's end), `side`, `broken`; the debug overlay draws the silk (dashed during the tell).
- Fair: the tell + drop is 48 f before contact under it; stepping back ~150 px from the thread during the tell clears
  the swing (unit test). A runner at full speed who ignores the thread usually passes just behind the swing's end.

## Composed encounters and placement guidance (for the level builder)
- Creatures ignore each other (no collisions), so any overlap works; one lure can be guarded by several (a snuff
  disperses them all: lab station I).
- **Hawker**: home no more than ~450 px over the line she walks, inside its lamp's light (wick 384 px, lantern 576).
  Put its lamp so she spends ≥ 1.5 s in the light before she can cut it (high, or reachable only from a spot in the
  dive lane: a hummock, a cap bounce). A dark half beside it is the rest.
- **Dangler**: over where she has to stop or land: a glide landing, a platform with a burrback (station I), a ledge
  top after a climb, the foot of a jump. Its lamp must light the approach ~300 px before the tie point (station H's
  wick was moved for this), and the floor under it should have ≥ 300 px of safe room to step back into.
- **Burrback on a platform** under a dangler / lantern (R9's twist): `fenced` with a `radius` short of the platform's
  ends; the pogo off its braced shell reaches the lantern if the flame is ≤ ~180 px over the shell.
- Lab `?room=lab-creatures`: H dangler alone over a safe floor, I burrback on P + dangler over P + the lantern over
  both, J a glide onto a landing a dangler guards.

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

Round 2 (2026-10-18, the bots now fight, 12 creatures, 300 s): explorer done 171 s, 6 hits, 0 deaths, 9 of 10 lamps
snuffed (everything dispersed or killed); speedrunner done 162 s, 3 hits, kills both hawkers and dang-h with 0 hits from
them; naive 14 hits / 5 deaths (it ping-pongs the dead-end lab, mostly burrbacks; 1 hawker hit, 0 dangler hits);
cautious 2 hits, killed hawk-b with 0 hits (was 10 hits / 5 fades), then **stuck 129 s in the web (87 grabs)**: it
never cuts silk. Danglers took 0 hits from every bot (they run on, or snuff / kill it in its hang). R8 alone: the
speedrunner took 1 hawker hit and killed it, the explorer snuffed the wick 0.6 s after the notice.

Round 1 table (before the dangler and the hawker rework):

| persona | time | hits | deaths | snuffed | notes |
|---|---|---|---|---|---|
| naive | lost at the far wall (lab end) | 4 | 1 | 0 | 1 hit each from burr-a, old-d, burr-e, burr-g; hawkers 0 |
| explorer | 105.6 s, done | 5 | 0 | 7 of 7 | everything dispersed but old-d; burr-g 2 hits |
| speedrunner | 47.3 s, done | 4 | 0 | 2 | one hit per crawler, 0 from hawkers / weaver |
| cautious | stuck at hawk-b | 13 | 5 | 0 | stop-start under a hawker: see above |
