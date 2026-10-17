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
- **Test-grove only now** (still built, still tested, inert in lamp rooms; since 2026-10-18 `updateOffer` /
  `markOfferTarget` do not run at all when `scene.senses` is lamp: the O key made `offerMiss` events in R4): the wallet `seen` levels (seen.ts), the
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
First mini-boss (False Knight standard). Round 1 (impatient first-timer: 1 hit landed in 3 attempts) made it readable;
round 2 (feel review r2 #1, #2: "a masher wins in 10.8 s", "shorter than she is") made the window earned and the body big.
- **160 x 96** (2x: she is 40 x 80), 12 hp, `sense` always, asleep until she is down on its floor (`enemyWake` 60 f).
- **Hunts** at 4.2 px/f when she is over 360 px away, stops 180 px short, and **never braces closer than 140 px**
  (`strikeMinPx`): too close (or she is inside it) it backs away facing her, unless there is no room behind it.
- **Ram**: brace 28 f -> 300 px at 16 px/f. From 140+ px a 20-30 f reaction plus a full jump clears it.
- **The window is earned**: a ram that **misses** her lays it on its back, open (`stunned`) for 70 f (120 at a wall):
  every cut lands, its touch does nothing, at most 3 cuts (`openHits`), then a harmless 30 f get-up (`wake`) that
  shoulders her out of its body (`risePush`). A ram that **hits** her gives nothing: it stands shut 24 f
  (`touchRecoverFrames`) and braces again.
- **Shell**: braced, only a pogo lands (one a brace, no stagger); walking, everything glances (`enemyBlock`).
- **No feint** (`feintFrom` 0); the move stays in the code for variants (a test runs it with `feintFrom` 1).
- **Dome contact** (`domeContact`, height 0.86, shoulder 0.62). `enemyCrack {third}` per health third.
- Pilots (`tests/unit/old-burrback-pilot.test.ts`; `OLD_TRACE=1`; creatures heal when she fades and she re-forms whole,
  as in the game): the **no-dodge masher always fades** (13-31 s, 0 cuts landed); the slow first-timer (20/25/30 f
  reactions, sloppy, learns not to walk into it after one hit) wins every run, **22 of 24 at the first attempt**, 11-38 s,
  0-5 hits. Lab bots: explorer and speedrunner kill it in ~12 s with 0 hits.
- For the level: at 160 x 96 the pit needs its floor clear of anything 96 px over the old burrback's feet.
- **Explorer r2** (played before round 2): "holds its red wind-up while I'm in the air and lunges the moment I land" and
  "its green state still hurts". Now tested: the tell runs on its own clock (the ram comes exactly `windupFrames` after
  the brace however she jumps), and over every pilot run no hit ever comes from a state drawn as open (on its back,
  getting up, asleep).
- **Human-like r1: "a quick reaction lands in the ram"** (a jump cleared it only 14-40 f into the 28 f tell). Now
  `ramUnderJump`: if she is up in the air in front of it as the ram starts (she jumped in the tell, straight up or over
  it), the ram is fast enough (up to `ramUnderMax` 40 px/f) to pass its whole body under her before her feet could
  come down to its top (counted with the jump let go), and runs `underExtraPx` past her. Jumping away from it gets the
  ordinary ram (it never stretches to chase her). Tested: full jumps (up, over, away) started anywhere from frame 0 to
  the tell's end + 4, at gaps 140 / 180 / 230, all clear. A tap that lands again before the ram starts is on the ground
  when it comes: she must jump again (the 12 f window after the ram starts). Human-like bots (9 runs): all 5 that
  reached the pit killed it (3 of 7 before); hits there 2 / 3 / 2 / 18 / 23.
- **Its death is a beat**: the killing blow holds 20 f extra (`killHitstopFrames`, her and it), the body lies 150 f
  (`deadFrames`), and a 90 f story hold (`deathHoldFrames`: the kit's `storyHold` / `storyHoldEnd`, no input, she cannot
  be hurt) covers the gate's opening and the claws' beam. `KindRules.killHold` / `deathHold`.
- **Round 3** (area1-plan-r3: casual runs faded 8-9 times, first tries 11-21 s): its first 2 rams of a life
  (`firstTellRams`) are told 1.5x (`firstTellMult`): 42 f; a jump started 12-48 f into that tell clears it (12 f = a
  200 ms reaction; earlier, the jump lands before the ram). Open = harmless is asserted over every pilot run. Slow pilot:
  22 of 24 at the first attempt, 17-67 s; masher still always fades. Human-like (HEAD e6023a5 + this, 9 runs): all 7
  that reached wood-well killed it at the first try, 0 fades there, 1-3 hits, 15.5-24.6 s (casual 18.5 s, skilled
  15.5-19.7 s); the 2 casual runs that did not finish were lost earlier (8/10 rooms).
- **Round 4** (area1-video-r2 #2: casual tries still 11-15 s, 5-7 fades). Traced with the human-like bots: hit
  standing (a casual "hop over" is a 76 px tap, it is 96 tall), rammed again while down, pinned under the west escape
  ledge at the gate wall, chipped by its walking body. Now (`tuning.oldBurrback`):
  - `lungeOnJump`: her jump in its tell (in front, not away, after 6 f) sets the ram off the frame her feet clear its
    top, under her: any full jump in the tell clears it. A tap that never clears it still meets the ram.
  - the first 2 rams of a try (rams reset on a fade: a try is a life) run at 0.6x (`firstRamSpeedMult`) as well.
  - `bodyHarmless`: only the ram hurts; its body (walking, braced, winded, rising) shoulders her out (`risePush`).
  - `landBounce`: a drop onto its shut top (no down slash) bounces her; open on its back, she lands in it and cuts.
  - `touchRestFrames` 90: after its ram hits her, no brace for 1.5 s. `recoverWallFrames` 180 (was 120).
  - `strikeHeadroomPx` 200 + `braceUnderRoof`: under an escape ledge (192 px up) it still braces, and its ram pulls
    up at the ledge's mouth, open. She is never pinned under one.
  - Pilots: masher fades every seed in ~16 s, 0 landed; slow pilot 22 of 24 first attempt, 15-105 s, 0-5 hits.
    Human-like (9 runs, 3928655 + this): every run that reached the pit killed it; pit fades 1 in all (casual s2,
    was 5 / 5 / 7); fights casual 18 / 78 s, average 17-22 s, skilled 13-15 s (under the 20-40 s aim).
  - Bot limit seen: a bot under a ledge flush with the wall jumps at its underside for minutes. **Escape ledges
    should be one-ways** (she jumps up through them) or stand off the wall.

## The plain burrback, round 2 (first-timer casual r2: "↓+C on it hurt me", "hit from a body-length", "it slid to
where I landed")
- **A down slash coming down on any burrback's back is always a pogo, never a hurt** (the framework's `stomp`,
  `KindRules.stompable`): her feet within `enemies.stompPx` 24 of its top at the start of the step, falling, a down slash
  under way -> she bounces (`enemyBlock` slash `down`, no damage either way). Rising off its back with her feet in that
  band is never a hurt either (a bounce's first frames).
- **Dome contact** for the plain one too (shoulder 0.58, render's numbers).
- **Its drop dodge** goes away from where she is heading (it used to take the shorter way, sometimes to her landing).
- **`windup` on a burrback spawn** (20-60): a longer tell for a first encounter. **R4's burr-first should say
  `windup: 32`**: the slow first-timer pilot (`tests/unit/burrback-firsttimer.test.ts`, R4 replica) then wins every run
  with 0 fades and at most 2 hits (with the row's 26: 3 fades in 18 runs). Not changed globally: the grove's pilots pin 26.

## The hawker (`kind: 'hawker'`, row `tuning.hawker` = the lampwing's + overrides)
- The lampwing's sim (tell 36, harmless 20, committed dive, stall 34 open, climb, 3 dives), box 52 x 24,
  `touchCalmFrames` 180 after its touch (a breather: no notice, harmless).
- **Round 1 review: "never dived"** (chunk1-level-r1 R8, feel item 7). Two causes, both fixed 2026-10-18: its home hangs
  ~440 px over the floor at its wick, so (1) at sight 480 a runner crossing the light was never seen (sight now **620**,
  leash **640**), and (2) the lampwing's 340 px dive cap stalled 130 px over a stander's head: the first dive was always a
  miss (now **diveMaxPx 600, diveMaxFrames 72, diveSpeed 6.4**). It also **leads a runner by 0.8 of her run**
  (`diveLeadRun`; the lampwing 0): stopping, turning back or jumping dodges it, running on at full speed usually still
  clears the end of a long dive. Stander in R8: noticed at the light's edge, hit 81 frames after the tell began.
- **A strike, not a drift** (feel review r2 #5: "65 frames at 6.4 px/f, a leaf"): after the 36 f tell, 6 f pulling back
  24 px along the line (`diveWindupFrames`, `diveBackPx`), then straight at the committed point at 15 px/f
  (`strikeSpeed`; at most `strikeMaxFrames` 34, so a far one is faster): 34-40 f in all. A stander is hit ~32 f after
  the dive starts; one who steps away anywhere in the tell is never hit (unit test at five spots); a runner is led by
  her whole run (`diveLeadRun` 1). Box **72 x 32** (was 52 x 24). Cautious bot in the lab: kills hawk-b taking 4 hits
  (it jumps at it to pogo), a fade only because burr-a had already taken 2.
- **Struck out of a flame's orbit** (human-like r1: "hawker B knocks her out of the throw lamp into the thorn bed"):
  she flies along the throw she was aiming (`player.lureAimX/Y`, the arc render draws while she circles), not the blow's
  side (`strikeOut` in lampwing.ts). Human-like re-run: of R8's thorn-gap deaths, only 1 hit in 9 runs came from the
  hawker: the rest are throws and glides that miss (the level's).
- R8's exposure test now measures 84 f from lit to hummock B (the strike misses the hopper; the slow dive used to hit it).
- A dive under way when its lamp goes out lands first; then it leaves (the framework does not disperse in `dive`).
- In a lamp room the dive is committed (no `dark` give-up mid-dive); dark at the end of the tell, the stall or the climb,
  it gives up `dark`. `lampwing` stays for the test grove.
- **What the sim cannot fix (placement)**: a one-cut wick reachable from where she first enters its light is snuffed
  before the first dive lands (explorer in R8: dispersed 0.6 s after notice). The tell + dive is ~1.3-1.8 s.

## The dangler (`kind: 'dangler'`, src/sim/enemies/dangler.ts, row `tuning.dangler`)
- A small spider on a thread: the Weaver's P2 drop made small. Spawn `{id, kind: 'dangler', x, y (where its thread is
  tied: within 48 px under a solid's underside, a one-way, or the room's top), facing, guards?, drop? (longest drop,
  default 640), hp? (2)}`. Box **44 x 40** (was 30 x 26: a speck at play zoom), sense by lamp light (it drops only while she is lit).
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

## The director's three predators (wood-area1-director.md, 2026-10-18)
Each hunts one moment of the lamp verb; placement is the builders', these are the behaviour hooks.
- **Juvenile beetle** (`kind: 'juvenileBurrback'`, row `tuning.juvenileBurrback`): the first creature (R4, the crawlid
  slot). 38 x 26, 2 hp, **no brace, no ram** (`strikePx` 0); a gentle tell: the first time it sees her (lit, 260 px) it
  stops and turns to her 30 f (`noticeFrames`, `enemyNotice`), then walks at her (`hunt`, it does not stop short: its
  touch is the danger). Two cuts kill it; stomps bounce. Slow pilot: wins every run in 2.7 s, 0 hits. It **ignores
  light** (sense always, area1-plan-r3 §1: met on a dark floor; it notices her at 260 px lit or not).
- **Beetle hunts landings** (`landHuntPx` 420, lamp rooms only: the grove's tuned fights untouched): she lands lit on its
  ground within 420 px and it turns to her at once (`enemyTurn` cause `hunt`), walking at her into its brace.
- **Dangler hunts the stop** (`stopFrames` 8, `stillVx` 1.5, `noticePx` 220): it tells once she has stood still, lit,
  below it, for 8 frames: the spot she stands on to cut the flame. A runner under it is let pass (it used to drop on
  runners). Hang it over the cut spot (the knob, the ledge under the wick).
- **Hawker hunts the caught** (`huntCaught`, still on; area1-plan-r3: it hit no one in 9 runs, beating free takes
  ~0.4 s and its tell + strike over 1 s, so a race is no twist; the rhythm below is): a moth held by a flame (or a web) is seen anywhere in its leash, even from
  a rest or on its way home, and it strikes at the orbit's centre (the flame). The tell plays in full (36 + 6 f, then
  ~28 f of strike: ~64 f from the notice to contact). Slow pilot (reacting 20-30 f after the tell, beats 6-10 f apart,
  holding away from it): freed and never struck in 9 of 9 timings. Beating free with no direction can throw her into
  its lane: "aim the throw out of its lane" is the skill (the director's R8 east half).

## The hawker on a rhythm (`orbit: '<lure id>'`, area1-plan-r3 §4.3: timing, not a race)
- Spawn `{kind: 'hawker', orbit: '<lamp id>', period? (90-900, default `passPeriod` 210 f), guards?}`. It waits at a
  perch `passRadius` 260 px to one side of the flame and `passHeight` 150 px above, harmless; tells `passTellFrames` 30
  (`enemyNotice`, mode `curious`); pulls back 6 f (`enemyDive {tx, ty}` = the flame), then a 30 f curve through the
  flame to the mirror perch (`passFrames`), taking a moth mid-pass (`enemySnatch {lure, x, y}`: render takes one
  circling moth). One every period, from either side alternately. Its own chase / dive rules are off while the lamp
  burns; snuffed, a guarder leaves as before.
- Caught (or anywhere in its path) as it passes, she is struck straight down (`passKnockDown` 9 px/f, vx 0): a pip and
  the drop below the lamp (R8: into the tunnel). Caught just after a pass, a slow player (react 20-30 f, beats 6-10 f
  apart) is free long before the next (unit tests). So the skill is: wait for the swoop, then catch and throw.
- **`straightKnock`** (hawker row): any other blow of it while she stands knocks her straight up, never sideways (the
  crown rim). Struck in the air or caught, she flies along her aimed throw (`strikeOut`) as before.
- **Round 4** (area1-video-r2 #4: 0 hawker hits on a caught moth in 9 runs: a masher is free in ~0.4 s):
  - after a pass it rests `passRestFrames` 90 on its perch: a catch then is safe (the timing). Caught in its orbit
    any later, it snatches at once: a `snapPassFrames` 20 pass (no tell; its rhythm was the tell), crossing the orbit
    16 f after the catch, before the fastest masher is free.
  - a pass bends through her when she circles in its orbit (it takes a moth; she is one): a mistimed catch is struck.
  - its pull-back (6 f) is harmless, still the tell (crown: a climber wall-jumped into its perch as a pass began).
  - `rim: <x>` (spawn): every blow of it sends her toward that x, up and over (caught: thrown at the throw's speed
    at 45°; free: `rimKick` 9, `rimLift` 11). For the crown: the rim she must never be knocked off.
  - `until: '<flag>'` (any creature): it leaves once that flag is set. And a `finale` trigger's held release sends
    every creature of the room away (the crown hawker dived red through the finale).
- Lab station F (`?room=lab-creatures`, x ~13500): hawk-f on a rhythm through wick-f. Greybox reads: the tell ring at
  the perch, then the swoop's trail through the flame.

## Round 4 for every hunter: nothing arrives from off-screen while she is helpless
`EnemyState.catchSeen`: whether it was within `enemies.screenHalfW/H` (900 x 500) of her as her latest catch (a lamp's
hold, a grab) began. If not, it starts no strike on her until she is free (`heldUnseen` in common.ts: the dangler's
drop, a hawker's tell, a rhythm pass, a burrback's brace). First-timer r4: "a dangler dropped from off-screen while I
was caught".
- **Dangler** (r4: "barely hit": bots stood still under one 17 frames a run): a slow step (`stillVx` 3) counts as a
  stop, `stopFrames` 6, a landing in its sight is a stop (`landStop`), tell 30 f. The greybox tell draws the swing's
  arc (render, 660b2f4).
- **Juvenile** (r4: "it took 2 health by contact while I swung at it"): harmless 30 f after a cut (`hurtSafeFrames`),
  and after its touch it is calm 150 f, walking away (`touchCalmFrames`): one pip a meeting.
- **Blocks**: a bigger block hitstop (8) or recoil (12) broke the grove's tuned masher / reader pilots and the old
  burrback's slow pilot; the clink stays 6 f / 8 px/f and is render's and audio's to make loud.

## Composed encounters and placement guidance (for the level builder)
- Creatures ignore each other (no collisions), so any overlap works; one lure can be guarded by several (a snuff
  disperses them all: lab station I).
- **Hawker**: home no more than ~450 px over the line she walks, inside its lamp's light (wick 384 px, lantern 576).
  Put its lamp so she spends ≥ 1.5 s in the light before she can cut it (high, or reachable only from a spot in the
  dive lane: a hummock, a cap bounce). A dark half beside it is the rest.
- **Rhythm hawker** (R8, the crown): `orbit` = the lamp she must catch to cross; its perches need 260 px clear each
  side of the flame and 150 px above. A pit or tunnel under the orbit is the cost of a mistimed catch.
- **No lamp pull over a creature patrol before R6** (a level rule): the beetle turns to any lit landing within 420 px
  on its floor (`landHuntPx`), so a throw that lands on a patrolled floor brings it at once; keep throw landings
  > 420 px from a beetle's floor, or on another floor.
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
- **Weaver** (box **56 x 48**, was 40 x 36): lives on the strands (`seg`, `segT`; Dijkstra over the strand graph each step while it moves, cut strands
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
