# The Canopy: the first area built to the reference numbers (v13, 2026-10-31)

Design, room list and measurements: docs/design/levels/first-area.md; reviews that drove it:
docs/design/levels/reviews/canopy-r1.md .. canopy-r8.md; the reference data: docs/design/reference-levels/ (all four
exact since 2026-10-30).
Open: `?world=canopy&fresh` (27 rooms `cn-*`).

## How it is made (tools/levels/canopy.ts)
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`, then
  `npx tsx tools/levels/canopy-check.ts` (world check + progression) and `npx tsx tools/solve/canopy.ts [room ...]`
  (~10 min for all 55 claims since r4 counts bark cuts). Edit the generator, never the JSON.
- `PLACE`: each room's world rect, **at least 2560 x 1440** (throws otherwise), packed in bands that share edges (no
  holes between rooms). `LINKS`: room pairs and the shared opening (`at` = floor y on a side edge, west x on a top /
  bottom edge; `span`; `one` = the side she drops from). The constructor carves 128 px into every opening.
- **Carve, then fill**: `cave()` (bitten outline: corners cut, roof stepped up to `ceil`, walls stepped back `w` / `e`;
  `skip` x ranges keep the roof flat), `hole()` (a plain rect: claw faces, corridors), `air()`; pieces that are their
  own solid carve themselves (`bark`, `gate`, `cap`); then `fill()`. After `fill`: `mass()`, `burl()` (tiers narrowing
  up), `hang()` (tiers narrowing down, `keep` one face plumb), `limb()`, `tree()`, creatures, pickups.
- `back: true` (room) / `back()`; enclosed rooms get no moon (the constructor parks it). Every solid face takes the
  claws; `noClaws(x, y0, y1)` for a mass face, `limbNoClaws(x0, x1, top)` for a limb, `tree(..., kick)` defaults false.
- `finish()` throws if a rotten wall has air above / under it or a panel air beside it (r2: the rot cache was a
  hurdle), or a glint is stuck in mass. `dangler()` ties to the lowest roof within 320 px (bitten roofs move).
- `shortcut(id, ..., opens)`: the tunnel's door into the cellar (opens `w`, from the tunnel) and the cellar's trapdoor
  (opens `s`, from below); world routes use `door` (passable from `from`, the reverse only once open).
- Render (other builder) paints tapered stacks as terraces: prefer two big steps (`burl(..., 2)`) over many small.

## v13 (round 13, review canopy-r12.md): the contract (landed in c932ad7)
Render and audio build against these; sim / content names only (render never writes them).
- **Moment 4, the chase** (`cn-gap:firefly-gap`, a `FireflyPass.chase {lead, kindles, waits, end, needs}`): events
  `fireflyChase {id, phase: start | wait | go | nest | call | gone, x, y}`, `fireflyKindle {id, lure, x, y}`,
  `fireflyHide {id, x, y}` (+ `fireflyStart` / `fireflyEnd`). State `kit.firefly {pass, x, y, px, py, beat (0 perched,
  1 alarm, 2 flying, 3 waiting, 4 to the shaft, 5 the call, -1 none), t, d, her}`: a chase is not a function of the
  frame, so draw `x, y` (interpolate from `px, py`), not `fireflyAt`. Hooks `hook-1..6` are `after` lamps (dark until
  kindled: their flag `cn-gap-hook-n`). Camera zone `chase` (after `cn-firefly-gap`, until `cn-firefly-gap-done`).
- **Moment 5, the trap is set** (`cn-tunnel:trap-warn`, `Lure.fills {frames: 180}`): `trapFill {lure, n, of, x, y}`
  one per moth, `state.lures.fill[i]` (moths in it now; -1 = not filling), `denStir {lure, x, y}` when full (the slam
  moves here from beat 2's start). `marks.stage.stream {points, count 40, captured: 'trap-warn'}` is the far stream.
- **Moment 3, moonlight for two** (`cn-crown`): `scene.sits[0]` (sim) = `marks.tatter.sit {x 2000, y 1024, r 160,
  frames 120}`; `kinSit {id, x, y}` + flag `cn-kin-sat`; the kin `when: cn-crown-wings` (a trigger over the glade),
  `until: cn-firefly-gap`; zone `crown-sit` (zoom 0.85, **`after: cn-kin-sat`**: a new CameraZone field render's
  zones.ts must honour, `until: cn-firefly-gap`).
- **The opening's river** (review r12 #6): `marks.stage.open.tailFlag: 'cn-promise'` (trigger `promise` over the
  promise zone) and `hatchTail` 1800 (the latest).
- **The Keeper**: `keeperGlance {id, x, y, hitX, hitY, why: lit | gate}` (with the `enemyBlock`), `keeperLunge {id,
  x, y, dir, frames, px}`, `keeperGuard {id, x, y, dir}`, `cageGuard {lure, x, y, on}`, `keeperSweep {id, x0, x1, y,
  frames}` (its claws: `boss.hit*`), boss `drops`, `sweeps`, `sweepHit`; `EnemyState.gate`.

## v12 (round 12, docs/design/levels/canopy-moments.md): the Keeper, the ending's fallback, the opening's hooks
Names are the contract with render and audio (section 6 of the director's plan); render and audio never write them.
- **The Keeper** (moment 6; `src/sim/boss/keeper.ts`, tuning `t.keeper`): the den's `old-burr` on the boss framework,
  room block `boss {id: 'the-keeper', kind: 'keeper', heart: 'trap-den', lowered, floor, collapse}` (its `name` is
  never to be shown: no name card). The creature is still kind `oldBurrback` (`EnemyState.keep` 1: the boss drives its
  phases; spawn `hp` 10; P2 at `p2Hp` 7, P3 at `p3Hp` 4). Lock: her whole box on the arena's floor (no doors).
  - **Intro** (stage `wait`, her first landing on the balcony, not on a retry): `introLead` frames before the firefly's
    pass ends a moth leaves the cage (`cageDrop`), falls to the sleeper's mouth, and it takes it (`enemyFeed {id, x,
    y}`). Measured: drop at +269, taken at +431 (2.7 s before she can be down).
  - **P1 / P2 moths**: `cageDrop {lure, x, y, frames (the tell), landX, landY}`; then the moth falls (state
    `boss.moth` 1 tell / 2 falling / 3 on the floor, `mothX`, `mothY`). Creature mode **`feed`** (it hurries for it,
    braces at nothing, harmless), then **`eat`** (head down, `stunned`: every cut lands, `eatOpenHits` 2) with
    `mothEaten {enemy, x, y, n, left}` + `keeperEat {id, x, y, frames, sweep}`. She catches it first (her box + 36):
    `mothSaved {x, y, saved}` (it clings: `boss.caught`). Every ~8 s (P2 7 s), the next once the last is gone.
  - **P2**: `cageSwing {lure, x, y, period 252, reach 560}`; the cage's flame swings (live offsets: `flameAt` /
    `boss.cageX/Y`, lifting 110 at the ends). It sees her only in the cone under the cage (`lightBase` 120 + 0.42 per
    px down): `boss.lit`, `keeperSight {id, x, y, lit}` on each change (audio: muffle when unseen). Blind
    (`EnemyState.blind` 1) it walks slowly to `seekX` (where it last saw her, or where a blow came from), sniffs 60
    frames (`pause`), braces at nothing, and **a cut from behind it lands**.
  - **P3**: `enemyPhase 3` (the den's lamp `wick-taproot` out, as before), then `cageFall {lure, x, y}`: the cage lies
    at `lowered` (1,856 x 1,272) with its guard off (`lures.live.free`). Between rams it **sweeps** the low cloud
    (`feed` to the cage, `keeperEat sweep: true`, `sweepTell` 30 then `mothEaten n 3`; open the whole 90 frames, a cut
    in the tell spoils the sweep). Each of 3 cuts on the cage frees a third of what is in it: `cageRelease {lure, x,
    y, moths, left}` (then the bars glance again until it is down).
  - **Counts** (render's cloud density, the HUD): `boss.left` (in the cage / the low cloud), `saved`, `eaten`,
    `caught`. They are room-local: a fade restarts the fight with the cage full and hung (`init` on `resetBoss`, the
    den's lamp relit).
  - **The end**: its death is the old burrback's (a 22-frame hold, `killHitstopFrames`; the body lies `deadFrames` 150: the roll), the boss
    `bossDefeat` (no moths: the cage is not the boss's to snuff), then stage `end` waits for the release: one cut on
    the fallen cage (`lures.live.moths` = saved + left; `lureSnuff.moths` = every moth saved, `trap: true`, the held
    beat 90) sets `cn-den-freed` (the roof's gate). **render: the column rising is `boss.left` of them**.
- **The ending's fallback** (moment 7): from the release, cue set `collapse`: `denCollapse {phase, x, y}` `groan` +100,
  `dust` +150 / +200 / +260 (x along the roof), `rubble` +330 (flag **`cn-den-collapse`**: the taproot, now gate
  `taproot`, falls; gates `rubble-1..6` shut into a slope of 128 px steps from x 2,304 up to a top at 576 under the
  roof's shaft: the way out needs no claws), `settle` +420 (the boss `down`). `rockfall` / `collapseFront` are named
  for round 13 and not sent. The rubble's `shut` is not re-armed by a fade or an entry (`rearmArenas` only re-arms a
  trigger's flag now): the den stays caved. **The roosts** (`scene.roosts[].leaves` = `cn-den-freed`):
  `roostsLit` drops a roost whose moths have gone on; `roostsLeft(scene, save)` lists them (render: empty roosts, a
  few wing scales).
- **The opening's hooks** (moment 1, render's to draw): `cn-hatch.hatch.sets` = `cn-hatched` (`flagSet` on the
  break; `marks.tatter.tryOn` = it: the kin's jump after the swarm and fall back); `marks.stage.open {black 180, zooms
  [1.5, 1.25, 1], title 'LAMPFALL', titleAfter 150, hatchTail 480}` (frames; zooms before the first `hatchStir` press
  and after each); `tuning.hatch.listenFrom` 210 (was 150: the break never comes in the black); camera zone
  `promise` (x 2,816-3,296 on the crown's limb before the lip, zoom 0.85, no lock); `marks.stage.lights` (the valley's
  false lights, x 4,200-6,200, y 1,250-1,610, 9).
- **The intro's camera**: zone `intro` on the balcony (zoom 0.72, bounds over the arena's west two thirds) until
  `boss.fed` (`cn-den-fed`: the sleeper took the moth, or she came down first): the fall and the snap are in frame.
- **Render asks (r12)**: the gate `taproot` is the old taproot mass (standing until `cn-den-collapse`, then fallen) and
  `rubble-1..6` are the collapse's rubble (solid from `cn-den-collapse`): both drew as root-lattice gates in r12's
  first build. A Pixi `addressModeU` of null threw once on P2's start (`cageSwing`) in the dev page (render's
  uncommitted code at the time); the next step drew.
- **Gotcha: `rearmArenas` re-arms only a trigger's `shut` flag** (r12): a fade or an entry used to take back every
  standing `shut` flag, so the den's rubble would have vanished on re-entry.
- **The fight, measured** (r12): the den's controller (`keeper-run.ts`) wins in 64 s, 0 hits (P2 at 22 s, P3 at 44 s),
  65-83 saved by cuts and catches, 116-117 freed; `humanplay -- den --room cn-den --at 300` (every skill, seeds 1-4):
  **12 of 12 down in 38-62 s, 0-2 hits**. Played by hand through `window.__game` (bursts): P1 ended on one wall stun
  (3 cuts), P2 on a blind back cut, a caught moth and a spent ram's 2 cuts, P3 on two sweeps; two hits taken, both
  standing still in P3; 114 freed. Lenient: Matt's play decides.
- **Softlocks the r12 first-timer found, fixed**: a Continue now re-arms an arena's saved lock-in (`continueState` calls
  `rearmArenas`: a Restart to the Grove's save left the wave's door shut outside it); the larder's floor has a way
  back up a person finds (three root masses, claim from the floor). Still open: the cellar <-> fork vertical link
  reads as a loop (jump left off the cellar's ledge), the Grove's thorn put-back beside the pit's burrbacks (8 of
  ft12's 10 later deaths), no feedback for presses in the hatch's black.
- Tools: `npx tsx tools/levels/keeper-probe.ts [--from=balcony|floor] [--phase=n]` (events of a stand-still),
  `npx tsx tools/playtest/keeper-run.ts [--catch] [--cage] [--trace]` (the den's fight controller from the balcony).

## The premise (v10, review r9 #2): sim state and events for render
Two kinds of lamp, the firefly once, the hub's roosts. Names are stable; render reads them, never writes.
- **Trap lamps** (`Lure.trap: true`, kind still `wick`): a cage of moths. Three on the route: `cn-hub:trap-crossing`
  (5,200 x 1,380, 30 moths, the first thing west of the drop), `cn-grove:trap-grove` (1,760 x 1,380, the pit's west
  lamp, 30), `cn-tunnel:trap-warn` (7,744 x 1,650, by the den's mouth, 40). The verb is the **blade**: three cuts
  (`lures.trapHp`; each a `lureHit` with `hpLeft` / `hpMax`), from a jump off the floor under it. **No fling off a
  trap** (`flingTarget` skips it). Out: `lureSnuff` with `trap: true`, `moths` (this lamp's), `total` (=
  `save.moths` after it: the persistent freed count, saved, the HUD number), +1 light. It never relights; the save
  keeps `room:id` in `save.snuffed`, so a new entry or a reload finds it out (`createLures`).
- **Springboards** (every other flingable `wick` in the Canopy; the generator's `springboards()`): the firefly's hung
  lights. `moths: 0`, `relight` 240 frames (the gap's 900; `wick-first` 90), never saved, never counted: a cut or a
  fling puts one out and it burns again (`lureRelight`). This also fixed the well hollow's shard (a swing at the
  ambush's lampwing cut `wick-hollow`, the shard's only way up, for good). Untouched: `after` lamps (the seed
  sockets), the den's (`snuffs`), the valley's out-of-reach lights.
- **The firefly's pass** (`scene.fireflies: [{id, trigger, flag, path, frames, relights}]`, src/sim/firefly.ts): the
  gap's `firefly-gap`. She lands (grounded) in `trigger` (the floor below the chain, 2,688-3,456 x 1,856-2,240) the
  first time: `flagSet cn-firefly-gap`, `fireflyStart {id, x, y, frames: 300}`. It flies `path` at a steady speed
  (out of the roost's mouth 3,040 x 1,150, past the three lamps, down past her over the garden, then ahead of her down
  the drop to the fork, 3,330 x 2,330: in her frame 2.5 s+ at 16:9, 16:10 and 21:9; a first path over the gap to the
  moon's side was on screen 1 s).
  Each lamp of `relights` it passes within `kit.firefly.relightPx` 48 while out burns again: `lureRelight {by:
  'firefly'}` then `fireflyRelight {id, lure, x, y}`. `fireflyEnd {id, x, y}` at the path's end. Live state:
  **`state.kit.firefly` = `{pass, frame, x, y}`** (`pass` -1 = none; render may call `fireflyAt(pass, frame +
  alpha)` to interpolate). No control is taken, nothing hurts.
- **Roosts** (`scene.roosts: [{id, lure, x, y, w, h}]`): where a freed trap's moths settle. The hub has three:
  `roost-crossing` (its own trap's: the high block's claw face, 1,024 x 1,088, 128 x 448: the shard chamber's way up,
  lit), `roost-grove` (over the kin's lamp, 2,560 x 1,344, 320 x 192: the kin turns to them), `roost-warn` (the
  lampoak's crown over the drop, 6,144 x 640, 512 x 320). **`roostsLit(scene, save)`** (src/sim/firefly.ts) = the lit
  ones (`save.snuffed` has the lure). The hub changes with each trap freed.
- **The first fling's lesson** (`Lure.lesson` on `wick-first`; review r9 #1): until she has flung off it once
  (`lesson:cn-hatch:wick-first` in the save's flags; a cut does not end it), within `lures.lessonPx` 130 of the flame
  in the air her caps ease (over `lessonEase` 6 frames) to `lessonFall` 1.25 px/f down and `lessonRun` 2.5 across: a
  slow drift by the flame. **`player.lessonK`** (0..1) is how far in: render can thicken the air with it. Every jump
  toward the lamp from S5 or S4 is in reach 33-85 frames (8-21 without it); no jump without the fling crosses. A wider zone
  (200) slowed her outside the reach and the bots stalled there. Let go with no direction held, it flings up-right
  (`Lure.aim`), not out from the flame through her (down, once she had drifted under it).
- **A held Lamp is a press** (`lures.heldPress`, `player.lampArmed`): pressed with no flame in reach and held on, the
  first flame to come into reach flings (not in glow rooms, where Lamp is held to mend).
- **Gates never shut on her** (`gatePush {id, dx, dy, x, y}`): a gate shutting with her box in it moves her out the
  shortest way to a clear spot.
- **Arena thorn returns** (`room.arenaThornPx` 160): with a `shut` gate standing, a thorn return goes to the end of
  her floor farthest from the bed, 160+ px from every bed (`arenaReturn`, src/sim/return.ts).
- **A mark patch** (`MoonPatch.mark`, `area`): a re-form point marked anywhere in `area`, never a rest: the warning's
  `p-warn` (its whole floor). Faded in the warning she re-forms on its floor, past the pit.
- **The den's warning** (v10): the hump and pit 128 west; 1,024 px of flat floor from the pit (6,912) to the lid
  (`den-lid`, now a root gate standing in the mouth, 7,936-8,000 x 1,600-1,856); the den's mouth an arch in the east
  wall at the floor (its lintel 7,808-8,000 x 1,408-1,600, the cellar shortcut's ledge on top); the link to the den
  moved up to it (the den's balcony at 320, was 512). Zone: zoom 1.1 (render asked closer). Beat 2 arrives out of the mouth (7,980). Knuckles
  gone. Foreshadowing landmarks for render: `shell-land`, `shell-warn` (kind `shell`: a shed back the old burrback's
  size), `scrape-hump`, `scrape-mouth` (kind `scrape`: claw marks 4x a burrback's); beat 2's start (`flagSet
  cn-tunnel-beat2`) wants a deep slam from the den (render / audio, ~0.3 trauma).

### The premise, staged (v11, review r10: three directed moments and the ending): what render reads
Sim / content hooks for the three moments (the look is render's; names are stable).
- **A cage's cut** (`Lure.trap`): the blade's catch on a cage is `lures.trapRadius` 64 (a flame's 20; an upgrade's
  reach adds to both): a standing up cut reaches a cage 228 px over her feet. Every cut is a `lureHit` with `trap:
  true`; the **first** (hp full) has `escape: 1`: one bar breaks and one moth gets out and circles her (nothing is
  counted until the snuff). The breaking cut's `slashHit.hitstop` is `lures.trapSnuffHitstop` 14 (a lamp's 9), and
  **the world holds with her**: every creature's `hitstop` is set to it + 1 (they still step that frame), so nothing
  jumps forward when it lets go; the frame count runs on (render's ask: the Grove's wave lurched).
- **A guarded cage** (`Lure.guard: flag`): until the flag is saved the blade glances off it: `lureGuarded {id, x, y,
  dir}`, no cut taken (render: a clang, sparks off the bars).
- **A held release** (`Lure.hold: frames`): its snuff holds her input that long (<= `kit.storyHoldMax`), nothing
  hurts her: `storyHold {id: <lure id>, frames}` ... `storyHoldEnd`. A cage's `sets` flag is set as it goes out.
- **The hub's cage** (`cn-hub:trap-crossing`) now hangs under the landing limb at 6,300 x 1,400, 200 over the floor,
  `sets: 'cn-hub-freed'`. **Camera hook**: zone `landing` (5,600-7,360 x 0-1,600, zoom 0.9, bounds 5,200-7,440 x
  480-1,760, `until: cn-hub-left`): the landing limb, the cage, the kin and the sky, until she first walks off the
  landing (triggers `left-west` x 5,376 and `left-east` x 7,424 set `cn-hub-left`; ending on the release dropped the
  view ~250 px mid-ease). **The kin** (`marks.tatter`) waits under it (5,780 x 1,600, `want` the cage, `until:
  cn-hub-left`), then is back by its light (`marks.stage.tatters[0]`, `when: cn-hub-left`). Render: the moon at the
  landing wants a `MOON_VISTAS` box there.
- **The clump under the gap's drop** (hub 6,976-7,872 x 352-1,152): a stepped crown (352 / 384 / 416), its east face
  down to a root foot 192 over the bank's floor, lit by a springboard `wick-clump` (7,944 x 720); `place:clump-top`.
  The gap's opening over it stays arrival only (the far floor is the glide's prize).
- **The firefly** (`scene.fireflies`, src/sim/firefly.ts; `state.kit.firefly = {pass, frame, x, y}`; `fireflyAt(f,
  frame)` interpolates, stops included; `fireflyFrames(f)` = the whole pass): new fields `onFling` (starts on her
  first fling off one of these lamps), `onFlag` (starts when the flag is saved), `hang {point, frames, sets?}` (a
  stop at path point `point`: `fireflyHang {id, x, y, frames, lure?}` as it arrives, `sets` saved then, which lights
  the `after` lamp of that flag = the cage it hangs; a pass cut short still hangs it), `hold` (her input held on its
  start: `storyHold {id: <pass id>}`), **`look {x, y, zoom?, from, to}`: the camera hook** (frames of the pass; sim
  never reads it: frame (x, y) with her, ease in and out). It now relights a lamp smouldering behind her chain too.
  - `cn-gap:firefly-gap`: `onFling` the chain's lamps **only** (v10's landing trigger is gone: in the route plan the
    far seed and the roost come first, and a landing spent the pass on nothing). Flung off the chain, the firefly comes
    out of the roost's mouth and relights the lamp she just left (in her frame), then the next ones, then flees down
    to the fork. A relit lamp in reach is flung again (the route plan re-flung two): the chain grows a beat. No
    `look` (render's 0.3 s lean on each `fireflyRelight`). A player who never flings the chain never sees it here.
  - `cn-tunnel:firefly-warn` (**the second sighting**): `onFlag: cn-tunnel-clear` (beat 2 down, the lid opens); out
    of the tube's east shaft (7,744 x 980), **hangs `trap-warn`** at its point 2 (7,552 x 1,396) for 75 frames
    (`cn-warn-hung`), then flees down through the mouth into the den (7,992 x 1,760). 140 frames of flight + 75 hung;
    `hold` 90; `look {7,600, 1,500, zoom 1, 0-150}`. (First hung at 7,872, 128 px from the room's edge: the
    sighting was in the frame's corner; now x 7,552 sits at <= 0.83 of the width at 21:9 with the view on the edge.)
  - `cn-den:firefly-den` (a third): landing on the balcony the first time, it crosses the arena, circles the great
    cage (stops 40 frames over it, point 3), and goes up through the roof's gate (3,168 x 200). 300 + 40 frames, no
    hold; `look {1,500, 760, zoom 0.85, 0-200}`.
- **The warning's cage** (`cn-tunnel:trap-warn`, 40 moths): `after: 'cn-warn-hung'`: **not there in the fight** (out,
  drawn as nothing or an empty hook until the firefly hangs it), at 7,552 x 1,420 over the root knuckle before the
  den's mouth, cut standing on the knuckle (1,632; `place:cage`) or from a jump off the floor. The hub's
  `roost-warn` still names it.
- **The great cage** (`cn-den:trap-den`, review r10 #1): 1,856 x 760 over the arena's middle (the roof 384 over
  it), **120 moths**, drawn ~3x a trap, `guard: cn-den-down` (the old burrback's `sets`), `sets: cn-den-freed`,
  `hold` 90. Cut from a running jump off either shelf's inner end (an up cut near the top). The old burrback sleeps
  under it; `wick-taproot` is still phase 3's lamp (render may draw it as the cage's root).
- **The den's way out is its roof**: the gate `den-roof` (3,072-3,264 x 384-448, `flag: cn-den-freed`) over the
  arena's east end opens with the release (`gateOpen`: moonlight down the shaft); a shaft and a passage east
  (3,072-3,840 x 128-384) to **the way out's clifftop** (link at world y 6,016: out-local 0, 128-384); the arena's
  east wall is the claw face up to it (its foot, 1,152-1,344, refuses the claws as v10's root gate did). v10's east
  root gate and corridor are gone. The arena's lock zone has `until: cn-den-freed`: locked, the shaft and the
  passage were out of frame. **The vista**: the trigger `out-vista` (out 64-576 x 0-384) sets `cn-out-vista`;
  **camera hook** `marks.stage.vista {flag: cn-out-vista, x 2,300, y 760, zoom 0.7, hold 3}` (StageCamera plays it;
  she keeps control). The kin on the clifftop (`when: cn-den-down`). The moon's `MOON_VISTAS` box for cn-out starts
  at x 1,792: she arrives at x 0-600 (render: widen it).
- **The old burrback's wake** (review r10 #10): `oldBurrback.wakeFrames` 90 (`enemyWake.frames`), facing the way it
  slept for the first 60, then `enemyTurn {cause: 'wake', frames: 30}` toward her (`wakeTurnFrames`), then it hunts.
  Harmless all through. The arena's camera lock (`zones.arena`) is unchanged.

## v9b (round 9's weak list): the tunnel's glide, the hawker, the chain's press
- **A glide lock wants a high take-off**: the glide gains ~2 px across for each px of drop, a jump ~0.4. v9's hump
  (256 over the far floor) let a jump held through land 25 px past the lip. v9b: the hump steps up from the west to a
  plumb east face that IS the pit's west wall (`PIT_W` 6080, top 1472, 384 over the far floor), pit 960, far face slick
  (`noClaws(PIT_E, ...)`). Highest ground at the lip: a step down by the lip is where people jump from.
- **`tools/levels/glide-probe.ts <room> <x> <y> <lipX> [--kit=] [--creatures] [--sweep --far=<x>]`**: every way across
  off a lip (jump, held, apex glide, late glide, walk-off glide, coyote jump + kick, jump + kick, and with `--creatures`
  the answers to a strike: check back, drop and re-glide, cut). The tunnel's numbers: jumps reach the thorns at
  6790-6828; glides land 7116 (late) to 7746 (walk-off); `--sweep` runs 36 arrival phases.
- **Thorns are a pogo** (HK's spike pogo: a down cut on them bounces her ~230 px on; the next touch hurts). A jump that
  reaches the thorns within ~250 px of the far lip crosses on one bounce: the explorer found it (`pogoR`). And **a lamp
  on a jump's descent is a pogo target too** (v9b's first try: the higher jump passed over `wick-pit` and bounced onto
  the lip). A lamp over a glide lock goes where only the glide passes (the far lip, 7000 x 1560).
- **The pit's hawker hunts her** (no `orbit`: on its clock the strike came whenever, and what she saw was the 6-frame
  pull-back): home under the roof over the pit's east half, `sight` 520 (the lip is 760 off), `guards` its lamp. Tell
  30 (`hawker.curiousFrames`; `creatures.test` holds it >= 30), a strike led to where her glide will be. Struck while
  gliding she is thrown on along it (`hawker.glideKnockVx` 8 / `glideKnockLift` 5; `touched(..., glide)`): every
  sweep phase still lands across. A check back (10 frames), a drop and a fresh glide, or a cut (an up cut when it is
  above) take no hit at all 36 phases of 36.
- **The fling keeps an early press** (`lures.flingBufferFrames` 8, `player.flingBuf`): a Lamp press in the cooldown
  after a fling still starts one for 8 frames while Lamp is held. The gap's lamp 2 (in reach 5 frames after lamp 1's
  release) took no press before +8; now any from +1. Only in the cooldown: a buffer on every unanswered press broke
  four of Lanternroot's stored lines (its glow rooms' Lamp verbs, mend / gust, take a press with no flame in reach).
- **Sim changes replay Lanternroot's tapes** (`proto-1-solve.test.ts`): the hawker's 30-frame tell moved one edge;
  `npx tsx tools/solve/proto-1.ts --write --edge=<id>` re-records it.
- **Bots**: a cell given up as "not reached in 45 s" gives up the rest of that ground (`giveUpGround`). The r9 run's
  skilled bot spent 45 s on each cell of the well's shard shelf in turn (100+ s). Their explorer still ranks every
  unwalked cell (rank 1) over exits (rank 3), so a door in frame waits until the room is walked.
- **route-video.ts v6**: the v9 route (gallery legs, the hollow's shard, the gap's chain and out by the fork, the
  warning's fight `until` `cn-tunnel-clear`); `plan` runs the whole area (57 legs, 5.6 min of play), only the
  optional shard fling unfound (it needs the ambush on). A fight leg that fails now says who is up and where she is.
- **A gate can shut on her**: `shut` gates have no body check. The Grove's `pit-wave` trigger reached up to 32 px
  under the arena gates' foot, so a slow drop through the opening set it with her head in the gate's rect: stuck
  inside a solid (the route plan stood there 240 s). Keep an arena trigger's top >= her height + 32 under any gate it
  shuts (`canopy-r9b.test.ts`).
- **Framing a room's edge with a zone**: a zone's `bounds` must lie inside the room, and a zoomed view meets the room's
  edges softly (`zones.edgeKnee` 220 px), so a fit frame ending at the room's foot leaves the view ~80 px short of it.
  To put the view near an edge, give a set `zoom` and a small frame in that corner: the view centres on it, asks past
  the edge and the knee stops it ~20 px short. The den's warning: `zoom` 0.85 over 640 x 640 at the mouth's corner
  (v9: the fit frame stopped at the mouth's floor, beat 2's tell on the frame's edge).

## v9 (review r8): shape, frames, the second peak
- **Sealed air** (`sealDeep(d)` before `fill()`, `sealed(x0, y0, x1, y1)` by hand): mass more than `d` from any carved
  air or the room's edge becomes air she can never reach, with a back, listed in `marks.sealed`. The sim and the
  painter see air; `export-area.ts` (so the map, `metrics.ts`, `canopy-furniture.ts`) and the bots' map
  (`buildSurfaces`) see rock. Keep `d` >= 192 from anything reachable, and off the room's edge. **The bots walked at
  sealed floors for 45 s at a time until their map dropped them**: any new kind of unreachable air needs the same.
  Render painted the hub's sealed under-floor as the open sky backdrop, not the deep back (render's call).
- **Deep solid in frame**: `npx tsx tools/levels/canopy-frames.ts [room ...]` frames every wide stop with the real
  follow camera and its zones (headless, a second for all rooms) at 16:9 / 16:10 / 21:9 and prints look:check's
  deep share (> 96 px in); the bar is <= 30% a stop, a room's median <= 20%. It matched the review's numbers on v8.
- **The well is two climbing legs** (leg 1, leg 2's chimney), then the gallery: walked and jumped (terraces, a bough,
  a stair of one-ways under open air: a solid band over a stair step bumps the jump off it). A one-way stair needs
  no band within 272 px over any step's launch spot.
- **Fling lines**: `npx tsx tools/levels/fling-probe.ts <room> <lamp> <x> <y> [--set=<lamp>=x,y] [--glide] [--hold=]`
  prints every aim's flight off a lamp (lamps it brings into reach, landing, thorns). Reach is 110 px from her centre,
  so two aims off one lamp only share a third lamp within ~300 px of it (the paths fan out). After a fling, the next
  lamp can be in reach inside the 8-frame `flingCooldown` (v9b: the press is kept, `flingBufferFrames`).
- **The glide is weak over a shallow drop**: a held ground jump opens the wings 16 px under the take-off, already
  falling fast. The long glide is from the apex (let go, press again) or a walk-off. v9b raised the tunnel's take-off
  to 384 over the far floor (above).
- **Peaks along the route**: `canopy-furniture.ts --route` (`ROUTE`: room-local points from the hatch to the den;
  sliding 2-screen windows, things within 640 x 360 of her line, glints out) and the hub-to-Grove climbing share.
  A full-frame window counted every room's walls and flattened everything (median 4.8).
- **A map station** (sim): `MoonPatch.map` / `hangs` (`mapStation`, `stoneHung`); the hub's `p-crossing`.
- **Every creature-waking trigger has a camera zone keyed to its wave** (`canopy-check.ts`).

## v8 (review r7): the first ten minutes
- **A required lesson in a room crossed once**: a fling lamp goes out for good when she lands, so a required fling on a
  way walked again (the hub) needs a second way (claws, or a `relight` lamp) or it softlocks. And a lamp can be cut
  down for good with the blade: a required one gets `relight` (the first lamp: 90 frames; never saved). The hatch is crossed
  once, its fall catch is the soft floor (a catch relights the embers). The gap is past a jump by a margin: the
  explorer's `offdj` (a walk-off, then jump held in coyote time) reached 51 px further than a running jump.
- **A fall catch's return gave a free double jump** (`placePlayer` -> `createPlayer` takes the tuning's): a player who
  did not own it crossed the first fling's gap after a miss. The catch / thorn return caps `dj` at what she owns now
  (src/sim/index.ts); a plain `placePlayer` (teleport, the harnesses) still carries one: the tools zero it.
- **Ambushes** (sim): `arrive: [[x, y], ...]` on a `wakes` spawn (the first point 400+ px from her when it shows, else
  the farthest; it travels from there to its spawn, harmless and out of reach); trigger `rearm: true` (until every
  creature it wakes is down, a fade or a new entry takes the flag back); a woken creature whose own `sets` is saved
  stays out (a cleared wave stays clear); `rearmArenas` takes a beat's flag back with its waking flag. Creatures that
  wait for a flag start hidden (`createLight`), so a flag set on the first step still arrives. Lay a trigger where
  she comes in (the drop's column, the landing off a block), not over the whole floor, and the spawns (homes) away
  from it: arrival shows them coming, it does not move where they act from.
- **Patches mark on a pass** (`tuning.patch.markOnPass`, `patchMark`): no more "stand still to save".
- **A lampwing with `dives: n`** tells nothing for `retellFrames` once tired or after touching her, and is harmless
  meanwhile (her climb past its hover was the hits, not its dives).
- **Climbs at delay 16** (`DELAYS` 0 / 6 / 10 / 16): what fails is a first touch near a face's foot (the slide takes
  it off). Fixes: carry the face down (a root lip or column), raise the start (a root lip out of the rest), or jump
  from nearer the face. `drop: true` plans walk off a lip (a slide down onto a reward). The neck's column made the
  Spire's foot climb run on up to the bower: either ends `spire-1` now.
- **Lamps near a glide lock**: any lamp west of ~3,200 at 1,550-1,700 in the gap lets a clawed player fling up-left
  onto the far limb (the lit proofs): a fling carries ~1,000 px from low in the gap. Put chain lamps on each other's
  lines by moving the first, not the second.
- **The spread, round 8's bar** (`canopy-furniture.ts --check`): two rooms at >= 4x the median (the Grove, the tunnel
  at 7.0), a path room before the Grove at <= 0.8 (the fork), no three path rooms in a row within 20%, quiet >= 5
  (the burrow is the nest now). A peak in an 8.4-screen room needs ~57 things: count before promising one.
- **The den's escape shelves are one-ways**: a solid shelf over a boss's floor is a roof its ram stops under (the v7
  video: a free safe spot under and on the west shelf).

## v7 (review r6): peaks and quiet, not even coverage
- **Measure the spread, not the totals** (review r6 #1: v6 met every total and got flatter). `canopy-furniture.ts
  --check --rooms` (after `export-area.ts canopy`): things per box screen room by room (enemies, pickups, pods, bark,
  lamps, thorn strips, one-ways), their CV, rooms under 0.5, the busiest over the median, the share of thorn length in
  runs >= 640. Round 7's bar: CV >= 0.8, >= 6 quiet rooms, peak >= 5x median, >= 50% long runs, thorns in <= 14
  rooms, thorns >= 10,800 px, hit + ledges >= 1.5 per air screen. Reproduces the review's numbers exactly (population
  sd, raw box screens, hazards hero-scaled).
- **What moves the spread**: every thorn strip, glint, lamp and knuckle is one thing, whatever its size. Quiet rooms
  are near empty (a 1.8-screen room must hold 0 things to be under 0.5; a 2.4-screen one 1), so a quiet dead end pays
  one major. The peak (the Grove) needs ~9 a screen. The median falls by thinning the middle rooms (one find, no
  hoard), not by emptying the loud ones. Join trays into runs (one strip of 1,664 is one thing, 7 trays are 7).
- **Long runs and drops**: a run under a ledge she runs off lands her in it (the trunk's tier 1: a full-speed run off
  the top's lip travels ~190 px over a 192 drop): start the knuckle line where she comes down. A knuckle near a glide
  lock's lip is a skip (the gap: only east of x 2700 at y >= 2048).
- **Patches stand on solid ground, 128 wide and 192 clear** (the scene check): not on a one-way root; the well's
  `p-hollow` sits in the 128 px between the ambush block and the chimney.
- **A gate does not tie a dangler** (the scene check wants a solid's underside or a one-way): the Grove's wave dangler
  hangs under the Grovemother's trunk. A flyer's territory + 100 must hold no pod or great (the scene check).
- **Lamps' cores clear of solids** (40 px for a wick): mind the overhangs.
- **Fling lines in the proofs**: `tools/solve/canopy.ts` claims take `lit: true` (lamps burn, `keepLamps`), and every
  lock claim in a room with an unconditional wick runs a second time lit (`... lit` in the output). A fling west from
  a lamp carries ~400-500 px (15 px/f kept at 0.97 a frame) plus her air control: keep lamps that far from any lip
  a lock guards.
- **climbs.ts with creatures** (`runClimb(..., { creatures: true })`, `--creatures`, `CREATURE_CLIMBS`, `restSafe`): a
  lampwing notices her at 260 px; one 456 px over a rest never dives at her there (the rest is safe), so "watch its
  dive from the rest" needs her to draw it (hops on the lip). The plain plan past it takes 0-1 hits from two starts
  of three.
- **Grown rooms keep their world coords**: the tunnel and burrow grew 3,520 west (`TX`), their old content `+ TX`; the
  links' `at` are world px and did not move. The hollow root grew 480 down (the map's east edge).
- **The arena gates** (`arena-w`, `arena-e`, h 64 under y 1088, `shut: cn-grove-wave`): a gate is carved air plus its
  own solid; the zone `fit` + `until: cn-grove-clear` frames the pit.
- **Rewards**: majors are glades 2 + upgrades 4 + seeds 3 + stones 5 + moon shards 6 + greats; at 23 that leaves 3
  greats (the review's "greats 6" and "majors <= 23" cannot both hold).

## v6 (review r5): what changed in how it is built
- **The hub is 8,000 wide** (`HX` = 3520: the old hub's content sits that far east in it) and the west rooms (limbs,
  trunk, well, rot, crawl, webs, elder) moved 3,520 west with it; their top / bottom links' `at` (world x) moved too.
  It leaves a notch in the map under the hub's west half (open to the bottom), the one hole the bands now have.
- **An arena's door** (`gates[].shut`, src/sim/kit.ts `gateShut` / `rearmArenas`): open until the `shut` flag (a
  trigger's), then a solid until `flag`; a fade while it stands takes `shut` back out of the save (the door opens
  behind her as she re-forms, the trigger shuts it again: HK's lock-in, never a locked-out softlock). `gateShut`
  event for render / audio. The Grove: `pit-door` at the entry corridor's lip, east of `p-grove`.
  `tests/unit/canopy-arena.test.ts`.
- **A door shut from one side sits in the room it is shut from**: `rot-wall` is a shortcut in the well's corridor
  (opens `e`, from the rot hall), not in the rot room (the explorer, and a person, walked into the rot room first).
- **Rests and strips** (the way out, v6): each strip over a rest guards the face she must not take on the next leg;
  it must sit above the apex of the leg below's last kick into that rest (~200 px over its floor: a 384 px rest
  opening takes it) and below the next leg's touches on that face + their slide (a plug bump drops her 100-150 px:
  cut a plug on the leg whose face is clean below it). Leg 3's slick corner (`noClaws` on the west block over rest W)
  stops "one face" without a strip there.
- **climbs.ts plans**: `back` (walk out of a rest onto its lip, then jump the other way), `hops` (jumps in place with
  up cuts), `takes` (pickups it must have), `delays` / `margin` (a risk plan for a reward over a strip is held at
  0 / 6 with half the margin, 32).
- **Pods** sit through `pad()` (a limb's rolling rects levelled under the box; else "inside a solid"); none within a
  flyer's territory (the scene check throws).
- **Covers** run 64 px into the mass round the hollow (render's interior plan makes a cover a back, inset 48: an edge
  probing air reads as torn, `wood-looks.test.ts`).
- **Hidden routes** keep their locks with slick faces: the tunnel's tube drops onto the hump down a shaft whose faces
  refuse the claws, and the nearest climbable face is 256 px away (a kick off it reaches 2,368 but not 2,560).
- `npx tsx tools/levels/canopy-furniture.ts` (after `export-area.ts canopy`): thorns, things to hit, one-ways per
  air screen in hero heights for the four references and the Canopy.
- **Two-tier burls are props with a family** (render's `propFamilies`, `wood-props.test.ts`: five burl families, none
  in more than three rooms): the Canopy holds about 15 burl tapers in all. A hump that only needs to be ground is
  `burl(..., 1)` (one rect, not a taper); knuckles to stand on are one-ways.

## Climbs as set pieces (r4, review r3 #1)
- **Bots find bugs; they are not the bar.** v3 flattened every climb to one clean face for the bots; r4 put the
  moves back and taught the bots instead: the explorer's `chimneyMacros()` (tools/solve/explore.ts: `zig<dir><n>`
  = a full jump at a face, `n` kicks on it, then a kick across at every touch; `u` up cuts (a plug), `o` out from
  under a lip first, `zig?9f` up one face cutting forward on each swing back in) and the human bots' `zigLine` /
  `zigCandidates` (tools/playtest/lines.ts, offered for any climb with an opposite face 200-700 px across).
- **Measured**: a kick across a 384 px chimney rises ~222 px (31 frames), a kick up one face ~235. A 512 px chimney
  *loses* ~47 px a crossing, 640 more: chimneys meant for kicks across are 384 wide.
- **r4's strips were frame-perfect** (review r4 #1): laid in the gaps between one zig's touches with ~20 px margins,
  they passed only at a kick delay of 0-4 frames from one start x. A late kick slides her 20-40 px lower and the
  error adds up kick by kick (touches drift ~17-34 px a kick at a 6-10 frame delay), so a strip that picks the phase
  is a trap for a person.
- **v5's rule: a strip on one face at a time, a clean stretch on both where she changes wall.** A person reads
  "thorns on that wall: climb this one, cross above them". Climbing one face is always possible (one wall is
  enough: movement-controller.md), so the strips decide which face, never when. A change of wall needs ~470 px
  between the strip she leaves behind and the one ahead (her touch on the old face >= 64 below the strip over it,
  the touch on the new face, ~222 higher, >= 64 above the strip under it, over a 235 px kick spacing and the drift);
  shorter legs get one strip. A face that starts a climb reaches within ~190 px of the floor (a late kick at a
  falling touch slides off a face's foot: root lips, `mass(x, y, 64, 128)`). A rest in a chimney wall gets a root
  lip into the chimney (`oneWay(face, floor, 128)`): from its end the far face is a jump away (a standing jump from
  inside the rest misses the far face and falls down the leg below).
- **The fairness test** (`tools/levels/climbs.ts` CLIMBS + `tests/unit/canopy-climbs.test.ts`): every required climb
  (and the Elder) from three start x on its rest, a person's plan (`face` legs: kick up this face until a touch at or
  over `until`, then across; `zig`; `away` out from under a lip; `jumpAt` walk to the lip first; `cut` up cuts), at
  kick delays 0 / 6 / 10 with every strip grown 64 px at both ends; `fails` plans (one face only) must hit a strip,
  and the thorn must put her back on the rest she started from. CLI: `npx tsx tools/levels/climbs.ts [id] [--margin
  64]` prints every touch. Lay a strip from the CLI's touches, then run the test.
- `canopy-probe.ts` still plays the explorer's macros (frame-perfect zigs) for the proofs.
- **Plugs** (`plug()`): rotten bark lying across a chimney, a wall panel (every cut takes it, an up cut too),
  checked solid either side by `finish()`. The explorer counts bark cuts left in its node key (`barkHp: true`):
  a wall high on a claw face takes one cut a climb. A plug cut from below must not hide the only way to a side
  passage under it (the Elder's first plug sat under its passage: the well unreachable).
- **A thorn returns her to the last ground she stood on** (`groundX/Y`, any length of time, not `safeX`): r4's
  climber who went over leg 1's top straight into the chimney was sent 1,700 px down. v5: the chimney stands east of
  leg 1's top under the mouth's roof, so she lands on the mouth's floor first. Ground near a living creature is not
  ground for this (`safeEnemyPx` 200): no creature keeps a rest (r4's landing lampwing). A rolling limb can fail it
  too (her centre over a rect 4 px lower than the one she stands on).
- **The return walk could end inside a wall** (fixed in src/sim/return.ts, r5): `clearOfThorns` steps back along the
  top's rect, and the well landing's floor rect ran west under the mass and a rotten wall: she was put inside the
  bark and squeezed up 1,500 px. It now stops at the first spot her box does not fit.
- `npx tsx tools/levels/canopy-map.ts <room> [cell]`: the generated room in ASCII (`k` faces refusing claws, `e`
  creatures, `*` finds, `L` lamps, `P` patches).

## Gotchas (v3, still true)
- **Floor thorns sit in a shallow pit** (64 deep, r5): a flat bed on the way is floor the human bots (and tired
  people) walk into; a pit reads as a gap and gets jumped. Tier 2's bed under its 256 px roof was unjumpable: a
  jump bumped the roof and came down in it from any lip (the roof lifts over it now). Check a bed under a low roof
  with a real jump.
- **A creature spawned inside a kit solid is sealed in** (v4 video: the Grove wave's juveniles inside the bounce
  caps: never move, never cut, the wave's gate never opens). `finish()` now throws on a spawn inside a solid, cap,
  gate or bark (walkers probed at their feet and shoulders).
- **The den's solid shelves vs phase 3**: a ram pulls up under any roof lower than `strikeHeadroomPx` (200; v4's
  shelves left 160, so phase 3 opened only on a wall or the taproot, won by waiting by the root: fight.ts `DEN_HOLD`).
  v5: the shelves are at 1088 (256 over the floor, a full jump), 384 wide, 224 clear underneath. Any roof a boss
  rams under keeps >= 200.
- Rests carved into a wall must be **384 px tall** (a jump from the rest at once; a 256 niche bumps her head).
  Thin shelves sticking out of a wall are not rests: the human bot tries to climb their 48 px faces.
- **A ledge under a corridor's roof**: a step inside a 192 px corridor may be at most ~110 tall (she is 80).
- **A bitten cave corner can seal a doorway** (the den's balcony, v3: found only on video). Proofs now check
  `place:<id>` (feet at a `marks.places` point): add one for every entry that must reach the next floor.
- **Solids near the top edge of a `back` room**: the room has `roof: true` (sim: solid above y 0 except an `n`
  exit's span), so nothing stands on its top or flies out over a wall (the tunnel, review r3 #2).
- **A face must reach within ~250 px of the floor** to start a climb (the well's east face, the out chimney's step).
- **Thorns where a one-way drop lands are a trap**: the return puts her back on the ledge above (trunk thorn-t1 kept
  all three bots out of the giant's hall). Same for thorns in a low corridor on the only way (the well's).
- A shaft's top must open into something (the Elder's shaft was a closed tube under its gallery: check the map).
- A solid tree on a ledge blocks the walk along it; a limb end is a claw hold from below (the way out's return
  limb). A mass face above an exit takes the claws too: a climb there can reach what a jump cannot (the fork).
- The Grovemother stands on painted stilts (`stilt-w/e`, non-solid): a solid trunk to the pit floor walled the
  room in two.
- **A gated wave** (the Grove pit): a trigger sets a flag, creatures with `wakes: <flag>` appear; every creature
  carrying the same `sets` flag must die before it is set (src/sim/kit.ts, r4), and a gate on that flag opens. The
  explorer has no creatures: claims pass the flag in `flags`, and a lock claim checks the gate holds without it.
- **The old burrback's `snuffs`**: a lamp id that goes out as its phase 3 begins (the den darkens).
- **Moon shards** (`moonShard` hollows, flag `moonShard:<room>:<id>`): three make a light (`tuning.upgrades
  .moonShard.perLight`). The Canopy has three: the well's landing niche, the Elder's top, the larder.
- `phased` is not a spawn field: the old burrback's three phases come from `tuning.oldBurrback.phased` (true by
  default); the den only sets `taproot`.
- **Debug a failing claim**: `CANOPY_MAP=1 npx tsx tools/solve/canopy.ts <room>` prints the room in 64 px cells
  (`#` solid, `^` thorns, `B` bark, `G` gate / shortcut, `o` where the explorer stood).
- The placed player's free double jump is still zeroed by the harness (`createPlayer` sets `dj` from tuning); a fall
  catch's or thorn's return caps it at what she owns since r8.

## The human-like bots (npm run humanplay)
- `--from <room> --abilities wallJump` (with `--world`): a run that starts mid-area (r4: from the fork).
- They head away from the side of the room they entered on (`wayOn`: landing east of the hub's middle sends them
  west) and skip anything 900 px behind once an exit ahead is seen. v2's hub (landing west of the middle) sent all
  three east to the fork; v3 sends all three west to the claws.
- Runs: playtest-reports/canopy-r3, canopy-r4 and canopy-r4-fork (first-area.md has the numbers). r4: they take
  the claws and loop the west; two or three tries at the well's chimney, then away.
- r5 (canopy-r5, canopy-r5-fork): claws at ~1:05, then loops of well / rot / trunk (their chimney lines choose the
  face from the map and climb leg 2's thorned east face); from the fork two of three climb the claw face and fight
  the Grove's wave. They see no pickup under a cover until inside it or its bark is broken (observe.ts, r5: the
  hub's covered hoard drew six jumps in r4). They walk into flat floor thorns: put beds in shallow pits.
- r6 (canopy-r6, canopy-r6-fork): all three start bots on the well's landing in 1:36-3:53 (the bottom as a start
  works), none past leg 3 (2,070-2,170), well <-> trunk loops after. A pit a bot meets before the claws must be a
  plain jump (the hub's 448 px pit turned all three back); no thorns where a limb's drop lands (the hub's east pit).
- r7 (canopy-r7): all three up leg 3 to the hollow (8:36, 8:55, 23:12; r6 none), two fought the ambush, one left by
  the limbs; still well <-> trunk loops, leg 2's strip 6-15 hits a run. The bots rest at a patch only when they
  happen to stand still in it: the casual one never rested at `p-hollow`, so its ambush fades cost legs 2-3 again.
- r8: **they fling** (`FlingAim` in lines.ts: a lamp line presses Lamp when `flingTarget` finds a flame, sweeps the
  aims reading `lureArc`, lets go on the best; the Lamp key is in the motor's `BITS` in human.ts: without it the
  lookahead flung and the hands never did, "did not go as foreseen"). v7's still played the old catch. Their old
  lamp-cut lines snuff lamps for good: a required lamp must `relight`. r8 run (canopy-r8): all three out of the
  hatch in the first minute, two clear the hollow's ambush, none finds the shelf to the limbs.
- r10 (canopy-r10): out of the hatch in 30-49 s, each cut the hub's trap (30 moths), the average and skilled bots
  reached the limbs (r9: none); a lesson zone wider than the reach (200) had made the casual bot stall outside it and
  fall 36 times: tune lessons on the bots' hatch runs (`runHeadless` on cn-hatch, `until: 'exit'`).
- r9 (canopy-r9): claws at 1:22-2:19; the average and skilled bots in the hollow at 3:37-3:54, the average on the
  door's floor 14 s after the ambush, then off to explore (the shard's shelf they cannot fling to, the well's bottom);
  none to the limbs. Their explorer chases unwalked ground before exits.
- r6: **they read strips** (lines.ts: a climb move whose face has a thorn strip in its span offers the clean far face
  first, `wall climb (the far face: ...)`, and `humanPick` takes it first).

## Measuring
`npx tsx tools/reference/export-area.ts canopy` (`CRITICAL`, `HIDDEN_ROOMS` there; `onCriticalPath` now from
`CRITICAL`) then `area-svg.ts` / `svg-png.ts` / `metrics.ts --md`. Lamps, pods, patches and every ant count as busy
cells: thin them to get empty screens.
